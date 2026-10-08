/**
 * The controlled clock a cadence run advances by hand (P21).
 *
 * The extension's periodic effect runs on a timer the agent runtime owns, and what shared logic
 * asks for is one interval of a period — the cadence is that period and nothing else. A suite that
 * waited for real ten-second periods would be slow and would time nothing; a suite that fired the
 * recorded callback by hand would never exercise the period at all. This clock is the middle
 * ground, and it is the same fixture in both places it is needed: the OMP double's timer mode
 * (`./omp-double`) schedules the extension's interval here instead of on a platform timer, and a
 * probe process (`./budget-probe`) advances it by exact virtual milliseconds, so a beat appears at
 * the virtual instant its period says it does — exactly one per period, and none once the interval
 * was cancelled.
 *
 * It owns no policy of its own: intervals repeat at the period they were created with, cancelling
 * one stops it, and nothing fires before its due virtual time. Advancing lets the microtask work a
 * fired callback started run to its end, because a beat enqueues and a flusher sends in promise
 * chains — but real network time is the caller's business, and a caller that has real requests in
 * flight waits for them itself (see the probe's own `settleRequests`).
 */

/** A scheduled repeating interval; cancelling it stops every future firing. */
export interface ControlledInterval {
	cancel(): void;
}

/** How many microtask turns are let through after each firing, so the chains it started can run. */
const SETTLE_TURNS = 16;

interface ScheduledInterval {
	at: number;
	readonly every: number;
	readonly callback: () => void;
	cancelled: boolean;
}

export class ControlledClock {
	/** Virtual milliseconds elapsed since this clock was created. */
	#now = 0;
	#intervals: ScheduledInterval[] = [];

	/** The current virtual instant, in milliseconds. */
	now(): number {
		return this.#now;
	}

	/** Schedules `callback` to run every `everyMs` virtual milliseconds, starting one period from now. */
	every(everyMs: number, callback: () => void): ControlledInterval {
		const interval: ScheduledInterval = { at: this.#now + everyMs, every: everyMs, callback, cancelled: false };
		this.#intervals.push(interval);
		return {
			cancel: () => {
				interval.cancelled = true;
			},
		};
	}

	/**
	 * Advances the clock by `ms`, firing every interval that comes due inside the window in due
	 * order; an interval that keeps running is rescheduled one period after the firing and can fire
	 * again later in the same window.
	 *
	 * The virtual instant is at the firing's due time while its callback runs, so anything the
	 * callback schedules is relative to when it really fired — and a callback that cancels its own
	 * interval is never rescheduled.
	 */
	async advanceBy(ms: number): Promise<void> {
		const target = this.#now + ms;
		for (;;) {
			const due = this.#nextDue(target);
			if (due === undefined) break;
			this.#now = due.at;
			if (!due.cancelled) {
				due.callback();
				await this.#settleTurns();
			}
			if (due.cancelled) this.#intervals = this.#intervals.filter(interval => interval !== due);
			else due.at = this.#now + due.every;
		}
		this.#now = target;
	}

	/** The earliest interval due at or before `target`, in schedule order for equal due times. */
	#nextDue(target: number): ScheduledInterval | undefined {
		let next: ScheduledInterval | undefined;
		for (const interval of this.#intervals) {
			if (interval.at > target) continue;
			if (next === undefined || interval.at < next.at) next = interval;
		}
		return next;
	}

	async #settleTurns(): Promise<void> {
		for (let turn = 0; turn < SETTLE_TURNS; turn += 1) await Promise.resolve();
	}
}
