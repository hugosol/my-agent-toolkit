/**
 * The subagent runtime one subagent session's own record accumulates within one accounting period.
 *
 * The metric is the approved coarse estimate of the session's own *working* time, and it is measured
 * from the framework's public activity facts rather than from any duration a host states. A session's
 * Round is exactly one period of that session's work: it opens when the agent takes up work and is
 * closed only once that same session really answers quiescent, so the model requests, the tools, an
 * automatic retry, a compacted context, a drained queued message and a delegation the session waits
 * on all stay inside one Round — and the idle stretches between two Rounds are therefore excluded by
 * construction rather than subtracted afterwards. The rules that turn the observed edges into the
 * figure the session's record carries are these, and they live here so the accounting that holds a
 * session's ledger and the snapshot it commits share a single reading of them:
 *
 * - **One activity contributes its own interval, once.** An opening records the instant the observer
 *   stamped for the Round that opened, and the end of that Round adds the time between the two
 *   instants. One session has at most one activity open, a repeated opening is the same activity
 *   continuing rather than a second interval, and an end therefore settles exactly the interval the
 *   opening began.
 * - **Only a settled activity is a contribution.** Nothing is added while an activity is open, and
 *   nothing here refreshes a running reading: the estimate moves when a Round ends. An activity whose
 *   end is never observed — the process went away in the middle of it, the harness never closed that
 *   Round — adds nothing and is not filled in from the wall clock afterwards: the offline stretch is
 *   not this session's working time, and the figure the record already carries stays the subtotal it
 *   is.
 * - **An interval that could not be measured is a known gap.** An opening or an end whose instant the
 *   observer could not state, and an end whose activity this instance never saw open (work an earlier
 *   process was in the middle of), each add nothing and mark this period's observation of this
 *   session as incomplete. Approximation and observation completeness are different facts, so a gap
 *   neither invents a figure nor turns an already known one into an unknown, and the two are never
 *   reported as each other.
 * - **Absent is not zero.** The accumulated figure is unavailable until something is known about the
 *   session: its record's saved value, or an interval this instance itself measured. A host that
 *   reported no activity at all and one whose activities really ran for no measurable time are
 *   therefore different facts, and the second is kept as a known zero.
 * - **The record's own value is the seed.** The saved figure is what an earlier commit produced in
 *   this period, so a record written before this estimate existed is carried on and accumulated
 *   further rather than cleared, re-derived or dropped — and its value is never re-read as a claim
 *   about how the period's observations went.
 * - **A known gap is seeded too, and later success does not clear it.** A record that already names a
 *   gap keeps naming it, and one that names none is neither inferred to have had one nor taken as
 *   proof that the history is complete; only a new accumulation — a new period — starts without it.
 * - **Nothing here persists anything.** Persisting the figure and the gap is the surrounding commit's
 *   business, which is what keeps a runtime from causing a write of its own and lets a reading that
 *   arrived late wait for the next commit — or never be saved at all when no further commit comes.
 *
 * This module is harness-independent shared logic: it reads no file, names no native type and holds
 * no clock of its own. The instants it is handed come from the observer's own clock, read at the
 * moment each edge arrived.
 */

/** One subagent session's runtime accumulation, as the accounting holds it and the commit snapshots it. */
export interface SubagentRuntimes {
	/**
	 * One of this session's own activities began, at the instant the observer stamped for the Round
	 * that opened.
	 *
	 * `undefined` is the observer's own statement that its clock produced no usable instant; the
	 * activity is still open — its end is what settles the interval — and the fact that this interval
	 * cannot be measured is remembered rather than filled in.
	 */
	activityStarted(at: number | undefined): void;
	/**
	 * The activity this session had open ended, at the instant the observer stamped for its Round's end.
	 *
	 * The answer is the reason the interval was not a measurable one — so the operator is told which
	 * time fact failed — or nothing when its time was added to the accumulation. Either way the
	 * activity is settled: a later end has no activity of its own to close.
	 */
	activityEnded(at: number | undefined): { readonly fault: string } | undefined;
	/**
	 * Whether this accumulation is holding an activity open right now.
	 *
	 * It is what the surrounding accounting keeps when the period underneath it is closed: an activity
	 * that the closed period was in the middle of is work of that period, so its end contributes
	 * nothing to the period that replaced it, however late it arrives.
	 */
	hasOpenActivity(): boolean;
	/**
	 * Whether this period's observation of this session has a known gap.
	 *
	 * A gap means a real activity of this period could not be measured, so the figure beside it is a
	 * subtotal rather than a total: it is a fact about the observations, never about the figure's
	 * precision, and it is never cleared by a later measurement within the same period.
	 */
	gap(): boolean;
	/**
	 * What this session's record would carry right now: its saved value plus every interval this
	 * instance has since settled, or nothing while nothing is known about it.
	 */
	available(): number | undefined;
}

/**
 * Build one session's accumulation over the value and the gap its own record already carries.
 *
 * The saved value is the figure an earlier commit produced in this period, so a later restart
 * continues accumulating rather than starting over. It is absent when this session's record carried
 * none — a session whose activities were never observed, an old record written before this field
 * existed, or one whose value was dropped because it was not a measurement. The saved gap is the mark
 * of an observation that could not be made, and it stays a mark of this period's accumulation.
 */
export function createSubagentRuntimes(saved: number | undefined, savedGap: boolean): SubagentRuntimes {
	/** The value this session's own record carried, which the next commit replaces with the total. */
	const savedMs = saved;
	/** Every settled activity's interval this instance has added since it seeded from the record. */
	let settledMs = 0;
	/** The activity now open, with the instant its Round opened at, or nothing while none is open. */
	let activity: { readonly at: number | undefined } | undefined;
	/** Whether this instance measured an interval at all, which is what makes a measured zero known. */
	let measured = false;
	/** Whether this period's observation of this session has a known gap. */
	let gap = savedGap;

	return {
		activityStarted(at) {
			// A Round already open is the activity every further edge of it belongs to rather than a
			// second interval: the earliest opening is where this period's working time began, so a
			// repeated observation moves nothing.
			if (activity !== undefined) return;
			if (at === undefined) gap = true;
			activity = { at };
		},
		activityEnded(at) {
			const started = activity;
			activity = undefined;
			// An end this instance never saw begin is work that started before it observed the session:
			// the time it ran is not measurable here, and charging the elapsed since any other instant
			// would bill the period for a stretch nothing measured.
			if (started === undefined) {
				gap = true;
				return { fault: "该次活动开始时未被观测" };
			}
			if (started.at === undefined || at === undefined) {
				gap = true;
				return { fault: "活动区间缺少有效时刻" };
			}
			const elapsed = at - started.at;
			if (!(elapsed >= 0)) {
				gap = true;
				return { fault: `活动区间不是有效的毫秒数（${String(elapsed)}）` };
			}
			settledMs += elapsed;
			measured = true;
			return undefined;
		},
		hasOpenActivity: () => activity !== undefined,
		gap: () => gap,
		available() {
			// Nothing was saved and nothing was measured: this session's runtime is unavailable rather
			// than a zero, and a session no Round of which was observed leaves it that way.
			if (!measured && savedMs === undefined) return undefined;
			return (savedMs ?? 0) + settledMs;
		},
	};
}
