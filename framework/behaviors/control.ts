/**
 * The control behavior: the framework's command-side State write path.
 *
 * A command toggle alternates one State field for one owner. The order is the
 * contract — transition, then persistence attempt, then the marker the new State
 * renders, then feedback driven by that same State. That order is what makes the
 * in-memory current value authoritative for later reads, what keeps a persistence
 * failure from changing the command's outcome, and what makes both the area and the
 * notification always describe the value that now holds.
 *
 * This module is agent-runtime-independent: it reads and writes State and calls the
 * adapter-supplied effect transports, and names no native API.
 */
import type { CommandToggleDeclaration, ExtensionDefinition } from "../core/definition";
import type { CommandInvocation, StateValues } from "../core/protocol";
import type { StateStore } from "../core/state";
import { publishMarkerOnTransition } from "./marker";

/** The feedback text for one activation value, derived from the extension's display name. */
export function activationFeedback(definition: ExtensionDefinition, value: boolean): string {
	return `${definition.displayName} ${value ? "enabled" : "disabled"}`;
}

/**
 * Runs one command toggle for one invocation.
 *
 * Only the owner's own session writes: a subagent follows its owner's value read-only, so
 * a command in a subagent session changes nothing and announces nothing, and a session
 * with no resolved owner has no cell to change either.
 *
 * The transition is applied first, so this process's later reads see the new value
 * whether or not the persistence attempt succeeds; the persistence attempt is a
 * best-effort record the extension cannot observe the outcome of; the marker and the
 * feedback are derived from the value the transition produced.
 */
export function runCommandToggle(
	definition: ExtensionDefinition,
	command: CommandToggleDeclaration,
	state: StateStore,
	invocation: CommandInvocation,
): void {
	if (invocation.owner.kind !== "owner") return;

	const field = command.state;
	const next = !state.view(invocation.owner.key).read(field);

	state.applyTransition(invocation.owner.key, field, next);

	const values: StateValues = { [field]: next };
	try {
		invocation.persist(values);
	} catch {
		// Best-effort persistence: losing the record is not losing the command. The
		// in-memory value already holds the transition and the user still gets feedback.
	}

	publishMarkerOnTransition(definition, invocation.owner.key, invocation.markers);

	invocation.notify(activationFeedback(definition, next));
}
