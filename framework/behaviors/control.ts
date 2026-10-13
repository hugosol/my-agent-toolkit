/**
 * The control behavior: the framework's command-side State write path.
 *
 * A command drives one State field for one owner, and it does so through the declared-value
 * seam every handler delivery carries: the handler writes, the framework records and
 * republishes. A toggle computes the next value and writes it; a directed command hands the
 * seam to the assembly-injected implementation, which decides what — if anything — to write.
 *
 * The order is the contract — write, then the marker the new value renders, then feedback
 * derived from that same value. That order is what makes the in-memory current value
 * authoritative for later reads, what keeps a persistence failure from changing the
 * command's outcome, and what makes both the area and the notification always describe the
 * value that now holds.
 *
 * This module is harness-independent: it reads and writes State and calls the
 * adapter-supplied effect transports, and names no native API.
 */
import type { ExtensionDefinition } from "../core/definition";
import type {
	CommandDelivery,
	CommandInvocation,
	DirectedCommandImplementation,
	DirectedDirective,
	StateValues,
} from "../core/protocol";
import type { StateStore } from "../core/state";
import { type MarkerSeat, publishMarkerOnTransition } from "./marker";

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
 * The write goes through the declared-value seam, so the value is recorded first and is
 * authoritative for this process's later reads whether or not the persistence attempt
 * succeeds; the marker and the feedback are derived from the value the write produced.
 *
 * The feedback goes out on the delivery's unified extension channel at `info` severity:
 * a toggle reports an effect that happened, and its text is the one the extension's
 * display name and the new value spell.
 */
export function runCommandToggle(
	definition: ExtensionDefinition,
	state: StateStore,
	invocation: CommandInvocation,
	seat: MarkerSeat,
): void {
	if (invocation.owner.kind !== "owner") return;

	const ownerKey = invocation.owner.key;
	const seam = state.writer({
		ownerKey,
		persist: values => invocation.persist(values),
		publishMarker: () => publishMarkerOnTransition(definition, ownerKey, invocation.markers, seat),
	});
	const next = !seam.read();

	seam.write(next);

	invocation.feedback.notify("info", activationFeedback(definition, next));
}

/**
 * Normalizes a directed command's argument into a directive.
 *
 * The command surface's whole vocabulary is decided here, in one place: the empty
 * argument names `on`, and `off` names `off`. Any other text is not a directive at all,
 * which is what lets the framework run nothing and record nothing for it, and the text
 * is carried back verbatim so an extension can say what it saw without re-parsing.
 */
export function parseDirectedArgument(argument: string | undefined): DirectedDirective {
	const text = (argument ?? "").trim();
	if (text.length === 0) return { kind: "activate" };
	if (text === "off") return { kind: "deactivate" };
	return { kind: "unrecognized", argument: text };
}

/**
 * Runs one directed command for one invocation.
 *
 * Only the owner's own session acts, exactly as on the toggle path: a subagent session
 * runs nothing and records nothing.
 *
 * A recognized directive runs the injected implementation and gets out of its way. The
 * implementation owns the effect and the write: the framework neither records a value
 * before or after it nor derives one from the directive, so State holds what the
 * implementation decided (nothing at all, when its action failed). The implementation
 * reads the pre-invocation value through its seam, which is what an extension's own
 * "not connected yet" filter needs.
 *
 * Nothing about a previous invocation is remembered: a repeat runs the implementation
 * again, and the framework never deduplicates, short-circuits or serializes invocations.
 *
 * An unrecognized argument is not a directive: the framework records no value and
 * publishes nothing, so a mistyped argument can never change State by accident. What it
 * does hand over is the fact itself — the implementation's optional `unrecognized` member
 * receives the text verbatim on the same delivery `run` gets — so the extension that owns
 * the operator-facing words can say what it saw without a second parse. An implementation
 * that injects no such member leaves the argument as inert as it has always been.
 *
 * The framework publishes no feedback here at all — the directive's operator-facing text
 * belongs to the implementation.
 */
export function runCommandDirected(
	definition: ExtensionDefinition,
	state: StateStore,
	invocation: CommandInvocation,
	implementation: DirectedCommandImplementation,
	seat: MarkerSeat,
): void {
	if (invocation.owner.kind !== "owner") return;

	const ownerKey = invocation.owner.key;
	// One target for both halves of this delivery's write surface: the seam the handler writes
	// through while it runs, and the capability it may keep for the effects it drives afterwards.
	// Both write the same owner's value, render in the same area and record in the same medium,
	// so a later write is indistinguishable from one made inside the delivery.
	const target = {
		ownerKey,
		publishMarker: () => publishMarkerOnTransition(definition, ownerKey, invocation.markers, seat),
		persist: (values: StateValues) => invocation.persist(values),
		feedback: invocation.feedback,
	};

	const delivery: CommandDelivery = {
		...invocation,
		state: state.writer(target),
		capability: state.capability(target),
	};

	const directive = parseDirectedArgument(invocation.args);
	if (directive.kind === "unrecognized") {
		implementation.unrecognized?.(directive.argument, delivery);
		return;
	}

	implementation.run(directive, delivery);
}
