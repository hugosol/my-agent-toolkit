/**
 * The heartbeat: the one periodic effect of an armed owner.
 *
 * While a session is armed, one managed timer per owner enqueues a `heartbeat` every
 * {@link HEARTBEAT_INTERVAL_MS}. That is what keeps the session 在线 on the panel — the panel
 * treats a session it has not heard from for three beats as offline, so the cadence is this
 * extension's whole contribution to it, and no expiry logic lives here. Every beat carries the
 * state the owner holds right now, reported verbatim, so the panel's view heals on its own — the
 * next beat says again whatever the previous one said. That is also why the state is read here
 * instead of being derived: the beat reports what the extension holds, never a second opinion.
 *
 * The beat is scheduled on the harness's managed timer, injected by the assembly (see
 * `./managed-timer`), and it reads the owner's record at beat time rather than at arm time: a beat
 * therefore reports whatever the owner's session id and state are now, and a beat that is already
 * running when the owner stops — the timer is cancelled, but the callback may be in flight — finds
 * no record and says nothing at all.
 */
import type { PushEnvelope } from "./client";
import type { ManagedTimers, TimerCancel } from "../managed-timer";
import { botSessions } from "../session/session";

/** The heartbeat period; the panel expires a session it has not heard from for three of them. */
export const HEARTBEAT_INTERVAL_MS = 10_000;

/**
 * Starts one armed owner's heartbeat and returns the handle that stops it.
 *
 * Reading the record per beat is also what keeps a re-arm from needing a second timer: the same
 * timer simply starts reporting the record the re-arm left, and the fast path of "the owner is
 * still armed" is the record still being there at all.
 */
export function startHeartbeat(timers: ManagedTimers, ownerKey: string): TimerCancel {
	return timers.every(HEARTBEAT_INTERVAL_MS, () => {
		const session = botSessions.get(ownerKey);
		if (session === undefined) return;
		const envelope: PushEnvelope = {
			sessionId: session.sessionId,
			kind: "heartbeat",
			data: { value: session.state },
		};
		session.outbox.enqueue(envelope);
	});
}
