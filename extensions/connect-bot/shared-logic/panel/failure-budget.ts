/**
 * The failure budget of one armed owner: how many consecutive pushes must fail before this
 * extension stops claiming a connection, and what the operator is told while the budget runs out.
 *
 * A push that fails is dropped rather than retried — the next beat is the retry this protocol
 * deliberately does not make — so a panel that has gone quiet is noticed by counting, not by
 * waiting on one request. Three consecutive failures (≈30s of beats) end the connection: the same
 * local stop an `off` performs, the declared value written false through the capability the arm
 * delivery left in the record, and one notice. That is the whole of the reaction — nothing is
 * re-registered and nothing is scheduled, so a panel this session lost stays lost until the
 * operator runs `/connect-bot` again, which is what the notice says.
 *
 * The count is a segment's, not the session's. It advances on a failure and resets on any
 * success, and the one-notice flag resets with it, which is what makes an outage that heals
 * announce itself once and then announce itself again if it comes back. The budget lives in the
 * owner's record rather than in this module or in a callback's closure: the record is what the
 * effects of one owner read, it is created by the arm that starts them and dropped by the stop
 * that ends them, so a callback that settles after the owner stopped finds nothing to account to
 * it — and a session that arms again simply starts a new segment.
 *
 * The counting itself is pure — a number, a flag and the action they imply, exactly as the frozen
 * baseline counted — while the notice and the stop around it are the extension's own effects.
 * This module names no harness and reaches no native API.
 */
import type { OwnerCapabilityHandle } from "../../../../framework/core/protocol";
import { disarmLocally } from "./disarm";
import { publishFeedback } from "../feedback";
import type { PushResultObserver, SettledPush } from "./outbox";
import { botSessions } from "../session/session";

/** Consecutive failures that end a connection: three beats, ≈30s of silence from the panel. */
export const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * One owner's consecutive-failure count and its one-notice-per-outage flag.
 *
 * Both members only ever move together: a failure advances the count and, on the first one of a
 * segment, raises the flag, while any success clears both — so an outage that ends leaves nothing
 * behind for the next one to inherit.
 */
export interface ConnectionHealth {
	/** Consecutive failures so far; the third one ends the connection. */
	failures: number;
	/** Whether this outage has already been announced. */
	firstFailureNotified: boolean;
}

/** The budget of a connection that has not failed yet: nothing counted, nothing announced. */
export function initialHealth(): ConnectionHealth {
	return { failures: 0, firstFailureNotified: false };
}

/** A push reached the panel: the segment is over and the next outage announces itself again. */
export function resetHealth(health: ConnectionHealth): void {
	health.failures = 0;
	health.firstFailureNotified = false;
}

/** What one failure of a segment means for the owner it belongs to. */
export type FailureAction =
	/** The segment's first failure: the outage is announced once. */
	| "notify-first"
	/** The budget ran out: the outage is announced and the connection ends. */
	| "notify-disarm"
	/** A failure the segment has already accounted for: counted, and silent. */
	| "silent";

/**
 * Counts one failure and answers what this one failure means.
 *
 * The count is advanced first and the flag is read afterwards, so the failure that exhausts the
 * budget is answered by the budget however far the segment had already got — and the failures
 * between the first notice and the last one stay silent, which is what keeps a long outage from
 * being re-announced beat after beat.
 */
export function recordFailure(health: ConnectionHealth): FailureAction {
	health.failures += 1;
	if (health.failures >= MAX_CONSECUTIVE_FAILURES) return "notify-disarm";
	if (health.firstFailureNotified) return "silent";
	health.firstFailureNotified = true;
	return "notify-first";
}

/**
 * The push-result seam of one armed owner: every settled background push is accounted here.
 *
 * The owner's record is read at settle time rather than captured when the seam was built, which is
 * what makes the accounting belong to a connection that still exists: an owner that stopped — an
 * `off`, a re-arm the panel refused, an auto-disarm of its own — has no record, and a push that
 * settles after that is dropped exactly as silently as the queue that carried it was.
 *
 * The owner's own capability is what ends the connection: an auto-disarm runs inside a flusher
 * callback, where no delivery exists, so the declared value is written through the handle the arm
 * delivery left in the record, and the notice goes out on the channel that handle carries. Both
 * are inert once the owner's session ends, so a callback that outlives its session cannot
 * recreate what the boundary took away.
 */
export function pushResultObserver(ownerKey: string): PushResultObserver {
	return outcome => {
		const session = botSessions.get(ownerKey);
		if (session === undefined) return;
		// Any HTTP answer counts as reaching the panel, whatever its status: only a request that
		// never completed, or a non-2xx answer, is a failure.
		if (outcome !== undefined && outcome.ok) {
			resetHealth(session.health);
			return;
		}
		const action = recordFailure(session.health);
		// The budget's answer is one of three, and what the operator hears for each of them — the
		// outage announced once, the exhausted budget announcing the end of the connection, or
		// nothing at all — is decided in one place (`./feedback`).
		if (action === "notify-disarm") {
			autoDisarm(ownerKey, session.capability);
		} else {
			publishFeedback(session.capability.feedback, { trigger: "push-failure", action });
		}
	};
}

/**
 * Ends one owner's connection after its budget ran out, and says so once.
 *
 * The stop is the same local disconnect every other disarm performs — the heartbeat cancelled, the
 * queue dropped, the record gone — and the declared value is written through the retained
 * capability, which is also what takes the marker line out of the area. The notice comes after the
 * stop, so what the operator reads describes a state that already holds. Nothing here reaches the
 * panel: an auto-disarm leaves the row to the panel's own 30s expiry, exactly as a session that
 * simply goes away does.
 */
function autoDisarm(ownerKey: string, capability: OwnerCapabilityHandle): void {
	disarmLocally(capability.state, ownerKey);
	publishFeedback(capability.feedback, { trigger: "push-failure", action: "notify-disarm" });
}
