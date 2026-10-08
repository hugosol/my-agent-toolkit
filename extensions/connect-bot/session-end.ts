/**
 * The session-end effect: what this extension does when the session it is serving stops being the
 * current one.
 *
 * A boundary arrives as the framework's semantic event, and this module is the extension's only
 * subscriber to it. Which way the session axis moved decides the whole of the reaction.
 *
 * A `transferred` boundary — a switch, a branch or a fork stood another session up in this one's
 * place — is the one case where a connection this extension drove has to be wound down while the
 * session it belongs to is still alive to be told about it. Everything local stops first and
 * synchronously: the owner's heartbeat is cancelled, its queue is dropped and its record is gone
 * before anything awaits, so a beat already in flight finds nothing to send and no later callback
 * can act for the session being left. What the operator is told leaves through this delivery's own
 * feedback channel — the only channel an ending owner can still speak through, because the
 * framework retired its cell before this handler ran and the capability such a delivery hands out
 * is inert from birth — and it is decided by the one table every other notice is decided by. Only
 * then, with the local half already complete, is the row that session left on the panel removed:
 * one `unregister` naming the real session id the record held, best-effort and within the
 * extension's own configured request budget, neither retried nor reported if the panel does not
 * answer. The session taking its place is left exactly as it is found — not armed, with no record
 * of its own and no beat.
 *
 * A `disposed` boundary — the process itself going away — stops the same local effects and says
 * nothing at all. There is no operator left to tell and no row this extension could still name on
 * its way out, so the panel's own expiry is what notices the row goes quiet, exactly as it is for a
 * process that simply dies (P35).
 *
 * A delivery whose session is not its own owner owns no record of this extension's, so there is
 * nothing to stop. The framework gates the subscription the same way; restating it here is what
 * makes it this effect's own decision rather than an assumption about the binding.
 *
 * Nothing is written to the declared value either: the framework retired the ending owner's cell
 * before this handler ran, so `enabled` already reads as the declared default and the marker line
 * that followed it left the area with it. This module names no agent runtime and reaches no native
 * API.
 */
import type { SessionEventDelivery } from "../../framework/core/protocol";
import { pushEvent, type PushEnvelope } from "./client";
import { connectBotConfig } from "./config";
import { publishFeedback } from "./feedback";
import { botSessions, stopLocalEffects } from "./session";

/**
 * Applies one session end for one owner.
 *
 * The local half runs inside this call and before the first await, so whoever observes the boundary
 * directly observes its effects: the beat cancelled, the queue dropped and the record gone.
 */
export function endSession(delivery: SessionEventDelivery): void {
	// This handler is subscribed for one kind of boundary and no other, and the guard is what makes
	// that reachable for the compiler as well as for plain JavaScript: `reason` means what this
	// module reads it as only once the event is the end it belongs to.
	if (delivery.event.kind !== "session_end") return;
	if (delivery.owner.kind !== "owner") return;
	const ownerKey = delivery.owner.key;
	// The row to remove, read before anything stops: the local stop is what drops the record, and the
	// real session id the panel keys that row by lives nowhere else.
	const connection = botSessions.get(ownerKey);

	stopLocalEffects(ownerKey);

	publishFeedback(delivery.feedback, {
		trigger: "session-end",
		reason: delivery.event.reason,
		enabledBefore: connection !== undefined,
	});

	if (delivery.event.reason !== "transferred" || connection === undefined) return;
	void releaseRow(connection.sessionId);
}

/**
 * Asks the panel to remove the row one ended session left, within the extension's own configured
 * request budget.
 *
 * Its answer is nobody's business here: the connection it described is gone either way, so a reject,
 * a timeout and a reachable panel are the same outcome — the row disappears now, or the panel's own
 * expiry takes it. The request is not queued and never counted: the queue it would have joined
 * belonged to the connection that just ended.
 */
async function releaseRow(sessionId: string): Promise<void> {
	const envelope: PushEnvelope = { sessionId, kind: "unregister" };
	// The one unified wait: the extension's own configured budget, the same value the register and
	// an explicit `off` use — nothing on this path has a budget of its own.
	const { endpoint, requestTimeoutMs } = connectBotConfig();
	try {
		await pushEvent(endpoint, envelope, requestTimeoutMs);
	} catch {
		// Best-effort: a panel that does not answer leaves the row to its own expiry.
	}
}
