/**
 * The session behavior: reconcile State with the session a delivery names.
 *
 * State is a session-global value, not a projection of a branch's contents. A session
 * boundary seeds it once from the target branch's persisted State, and inside one session
 * the framework's current value is authoritative: no path re-reads persistence per turn,
 * and navigation inside the session never reseeds. A delivery at a tree position is
 * therefore the trigger for recomputing session-derived facts (such as injected-prompt
 * progress) from the branch, which is what keeps those facts honest without touching the
 * session's State.
 *
 * This module is agent-runtime-independent: it reads the facts an adapter resolved and
 * names no native API.
 */
import { activationField, type ExtensionDefinition } from "../core/definition";
import type { SessionDelivery } from "../core/protocol";
import { DEFAULT_STATE_VALUE, type StateStore, type StateValue } from "../core/state";

/**
 * The value one persisted payload declares for `field`.
 *
 * Only an object declaring that field as a boolean is a State record of this framework's
 * shape. Every other payload — a legacy `{on}` record, a wrong type, no payload at all —
 * declares nothing, so the caller falls back to the declared default instead of guessing
 * what the data meant.
 */
function declaredValue(payload: unknown, field: string): StateValue | undefined {
	if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return undefined;
	const value = (payload as Record<string, unknown>)[field];
	return typeof value === "boolean" ? value : undefined;
}

/**
 * Applies one session delivery to the extension's State.
 *
 * A boundary — a start, a switch, or a branch into a new identity — seeds the owner's
 * cell from the target branch, atomically replacing the value that owner held, and
 * retires the cell of the session this binding served before. A tree navigation seeds
 * nothing: it changes only the leaf of one session, so the current value stands. A
 * delivery whose session is not the owner seeds nothing either: a subagent follows its
 * owner's value read-only, and a session with no resolved owner has no cell to seed, so
 * the owner's current value stands in both cases.
 */
export function reconcileSession(
	definition: ExtensionDefinition,
	state: StateStore,
	session: SessionDelivery,
): void {
	if (session.position === "tree") return;

	const { owner, previousOwnerKey, statePayloads } = session;
	if (owner.kind !== "owner") return;
	if (previousOwnerKey !== undefined && previousOwnerKey !== owner.key) state.retire(previousOwnerKey);

	const field = activationField(definition);
	const declared = declaredValue(statePayloads[statePayloads.length - 1], field);
	state.seed(owner.key, { [field]: declared ?? DEFAULT_STATE_VALUE });
}
