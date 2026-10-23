/**
 * The managed-timer capability connect-bot's periodic effect runs on.
 *
 * A heartbeat is this extension's own effect; its assembly owns the native timer integration.
 * OMP supplies `ctx.setInterval`/`ctx.clearTimer`. Pi has no context-owned timer API, so its
 * assembly supplies unref'd Node timers and binding cleanup. Shared logic names only this
 * capability, never a native timer or session context, and cancels each timer when its owner's
 * registration ends.
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
