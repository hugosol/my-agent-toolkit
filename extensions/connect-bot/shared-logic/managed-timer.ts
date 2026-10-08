/**
 * The managed-timer capability connect-bot's periodic effect runs on.
 *
 * A heartbeat is this extension's own effect, but the timer that drives it belongs to the agent
 * harness: OMP hands a session context a `setInterval` that is unref'd and cleared with the
 * session, and only an assembly may reach it (spec §9, §Execution). Shared logic therefore names
 * this capability and never a native timer, exactly as it names no native session fact: the OMP
 * assembly implements it over `ctx.setInterval`/`ctx.clearTimer` and injects it with the rest of
 * the harness surface, so the cadence policy below is exercised without a session.
 */

/** Cancels one managed timer. Cancelling a timer that is already cancelled is a no-op. */
export type TimerCancel = () => void;

/** The harness's timer surface, as this extension consumes it. */
export interface ManagedTimers {
	/**
	 * Runs `callback` every `intervalMs` for as long as the timer lives and returns the one
	 * function that cancels exactly this timer.
	 *
	 * The timer belongs to the harness that scheduled it: it is cleared with the session, and the
	 * extension's own stop path cancels it through the returned handle so no callback outlives the
	 * owner that asked for it.
	 */
	every(intervalMs: number, callback: () => void): TimerCancel;
}
