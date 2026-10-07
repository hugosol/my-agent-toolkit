/**
 * The session behavior: apply one semantic session event to the extension's State, and
 * refresh the marker area for the owner the event concerns.
 *
 * State is a session-global value, not a projection of a branch's contents. A
 * `session_start` seeds it once from the target branch's persisted State, and inside one
 * session the framework's current value is authoritative: no path re-reads persistence per
 * turn, and navigation inside the session (which is not an event at all) never reseeds. A
 * `session_end` retires the ending owner's cell, so a value that session held can never be
 * read as another session's.
 *
 * The area follows State at the same boundaries. A session that starts renders its own area
 * — unconditionally, because the widget belongs to that session and leaving the session it
 * moved to showing the one it left behind is exactly the stale marker this refresh exists
 * to prevent. A session that is disposed renders its own area once more, so this
 * extension's line goes with the cell it lived in; a session that merely transferred its
 * role away has no widget left to clear, and the session taking over renders its own area
 * at its start.
 *
 * This module is agent-runtime-independent: it reads the facts an adapter resolved and
 * names no native API.
 */
import { activationField, statePersistence, type ExtensionDefinition } from "../core/definition";
import type { SessionDelivery } from "../core/protocol";
import { DEFAULT_STATE_VALUE, type StateStore, type StateValue } from "../core/state";
import { publishMarkerOnTransition } from "./marker";

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
 * Applies one semantic session event to the extension's State.
 *
 * A start seeds the owner's cell from the target branch, atomically replacing the value
 * that owner held. A field that declares `persistence: "memory"` is never seeded: a
 * boundary that keeps the owner identity keeps the value the cell holds, and a start names
 * an owner whose cell was either never created or already retired by the end that preceded
 * it, so the new owner reads the declared default.
 *
 * An end retires the cell of the owner it names — which is the session being left or torn
 * down, never the one taking over.
 *
 * A delivery whose session is not the owner seeds nothing, retires nothing and renders
 * nothing: a subagent owns no cell of its own, and a session with no resolved owner has none
 * either, so no value is carried into it and no area is projected for it.
 *
 * The owner's life ends with its cell. A capability retained for that owner — the handle a
 * background effect keeps — is revoked at the same boundary and before any handler runs, so a
 * late callback cannot write a value back into the session that lost it; a start, which may
 * name an owner this process has already served, opens the life again.
 */
export function reconcileSession(
	definition: ExtensionDefinition,
	state: StateStore,
	session: SessionDelivery,
): void {
	const { owner } = session;
	if (owner.kind !== "owner") return;

	if (session.event.kind === "session_end") {
		state.retire(owner.key);
		state.ownerLives.end(owner.key);
		if (session.event.reason === "disposed") {
			publishMarkerOnTransition(definition, owner.key, session.markers);
		}
		return;
	}

	state.ownerLives.begin(owner.key);

	if (statePersistence(definition) === "session-entry") {
		const field = activationField(definition);
		const declared = declaredValue(session.statePayloads[session.statePayloads.length - 1], field);
		state.seed(owner.key, { [field]: declared ?? DEFAULT_STATE_VALUE });
	}

	publishMarkerOnTransition(definition, owner.key, session.markers);
}
