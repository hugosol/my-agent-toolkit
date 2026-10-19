/**
 * The Codex ratio measurement: how many five-hour quotas one weekly quota amounts to, learned from
 * the paired readings the window sources already report.
 *
 * A paired reading is both windows' used percentages *from one report* — one account API answer or
 * one response's header batch. The windows this process currently holds are never an input: an
 * update keeps a window's earlier value when a report omits it, so pairing a held five-hour value
 * with a fresh weekly one would measure a relationship no source ever reported. A report that
 * carries only one window, or a percentage that is not a usable number, is not a reading this
 * measurement can take anything from and leaves it exactly as it was.
 *
 * Everything here is a deterministic function of the stored measurement, one report's own pair and
 * the instant it arrived at: no file, no network, no timer and no clock read of its own.
 *
 * The rules are the ones this extension has always estimated by:
 *
 * - The first usable pair — and any pair after a rollover, an aged-out baseline or an impossible
 *   capture instant — anchors a new baseline and yields no sample. A ratio is what a *change* from
 *   that anchor says, so an anchor on its own can never produce one.
 * - A sample qualifies only when the five-hour window moved up by at least 50 points, both windows
 *   moved up, and neither is saturated at 100%: a saturated window hides the consumption after it,
 *   so its movement measures nothing.
 * - A ratio is never withdrawn. A report that qualifies nothing and a rebaselined window both leave
 *   the last qualifying ratio where it is; relearning every five-hour window is what lets a changed
 *   plan or quota policy surface within one window.
 * - A window has rolled over when its reported reset instant moved beyond the tolerance that absorbs
 *   second-level rounding, or — when either side of that comparison states no instant at all — when
 *   its percentage dropped by more than one point.
 * - A baseline is never trusted past the five-hour window it anchors, and one captured ahead of the
 *   local clock is not a baseline at all: the document is local, so every writer and reader shares
 *   one clock, and an instant in the future means the clock moved backwards, or the document came
 *   from a foreign clock. Reading it as a first run is what keeps such a document from blocking
 *   measurement forever.
 */
import { FIVE_HOUR_MS } from "./codex-quota";

/** One window as one report stated it, in the terms this measurement needs. */
export interface CodexWindowReading {
	/** The used percentage the report stated. */
	readonly usedPercent: number;
	/** The reset instant the report stated, as epoch milliseconds; absent when it stated none. */
	readonly resetsAt?: number;
}

/**
 * Both windows of one report.
 *
 * This is the whole input a sample may be taken from, and it is built by the one parser that reads
 * the report — never from what the process holds after merging it.
 */
export interface CodexPairedReading {
	readonly fiveHour: CodexWindowReading;
	readonly weekly: CodexWindowReading;
}

/** The reading that anchors measurement for the current windows. */
export interface CodexBaseline {
	readonly fiveHourPercent: number;
	readonly weeklyPercent: number;
	/** The five-hour reset instant the report stated; absent when it stated none. */
	readonly fiveHourResetsAt?: number;
	/** The weekly reset instant the report stated; absent when it stated none. */
	readonly weeklyResetsAt?: number;
	/** When this baseline was captured, on this process's own clock (epoch milliseconds). */
	readonly capturedAt: number;
}

/** The measurement one instance holds: the reading it measures from, and the last qualifying ratio. */
export interface CodexEstimateState {
	/** The current baseline; absent until a report has carried a usable pair. */
	readonly baseline?: CodexBaseline;
	/** The ratio the last qualifying sample produced; absent until one has. */
	readonly ratio?: number;
}

/** The measurement as its readers read it. */
export interface CodexEstimate {
	/** The measurement as it stands now. */
	state(): CodexEstimateState;
}

/** The sink one report's own paired reading is folded into. */
export interface CodexEstimateSink {
	/**
	 * Fold one report's own pair in, then persist the change per the extension's write policy.
	 *
	 * The measurement is in memory as this call returns its promise, and the promise answers when the
	 * write it triggered has settled — or at once when the change triggered none. It never rejects: a
	 * publication is best-effort, and a failure is reported to nobody.
	 */
	observe(reading: CodexPairedReading): Promise<void>;
}

/**
 * A local capture instant this far ahead of the local clock is impossible: the document is local, so
 * every writer and reader shares the system clock. Such a baseline is read as a first run rather
 * than kept, because one anchored in the future would never age out.
 */
export const BASELINE_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

/** A baseline is never trusted past the five-hour window it anchors. */
const BASELINE_MAX_AGE_MS = FIVE_HOUR_MS;

/** A real rollover moves a reported reset instant by hours or days; this absorbs second-level rounding. */
const RESET_MOVE_TOLERANCE_MS = 30 * 60 * 1000;

/** The percentage a window must drop by — when no instant is available to compare — to read as rolled over. */
const RESET_DROP_POINTS = 1;

/** The five-hour movement a sample needs before it may replace the stored ratio. */
const QUALIFYING_SPAN_POINTS = 50;

/** A saturated window hides later consumption, so its movement is unusable. */
const SATURATION_POINTS = 100;

/**
 * Fold one report's own paired reading into the measurement.
 *
 * The same state object is answered when the reading changed nothing at all — a report that carried
 * one window, or a pair that anchors or qualifies nothing — so a caller can recognise an unchanged
 * measurement by identity and write nothing for it.
 */
export function observePairedReading(
	state: CodexEstimateState,
	reading: CodexPairedReading,
	now: number,
): CodexEstimateState {
	const fiveHour = reading.fiveHour.usedPercent;
	const weekly = reading.weekly.usedPercent;
	if (!Number.isFinite(fiveHour) || !Number.isFinite(weekly)) return state;

	const baseline = state.baseline;
	if (baseline === undefined || rolledOver(baseline, reading, now)) {
		return {
			baseline: {
				fiveHourPercent: fiveHour,
				weeklyPercent: weekly,
				...(reading.fiveHour.resetsAt === undefined ? {} : { fiveHourResetsAt: reading.fiveHour.resetsAt }),
				...(reading.weekly.resetsAt === undefined ? {} : { weeklyResetsAt: reading.weekly.resetsAt }),
				capturedAt: now,
			},
			...(state.ratio === undefined ? {} : { ratio: state.ratio }),
		};
	}

	const fiveHourMovement = fiveHour - baseline.fiveHourPercent;
	const weeklyMovement = weekly - baseline.weeklyPercent;
	if (
		fiveHourMovement < QUALIFYING_SPAN_POINTS ||
		weeklyMovement <= 0 ||
		fiveHour >= SATURATION_POINTS ||
		weekly >= SATURATION_POINTS
	) {
		return state;
	}
	return { baseline, ratio: fiveHourMovement / weeklyMovement };
}

/**
 * Whether this reading is on the other side of a rollover than the baseline, or whether the baseline
 * itself has aged out or could never have been captured: no sample may span either.
 */
function rolledOver(baseline: CodexBaseline, reading: CodexPairedReading, now: number): boolean {
	if (now - baseline.capturedAt >= BASELINE_MAX_AGE_MS) return true;
	if (baseline.capturedAt - now > BASELINE_FUTURE_TOLERANCE_MS) return true;
	return (
		windowRolledOver(
			baseline.fiveHourResetsAt,
			reading.fiveHour.resetsAt,
			baseline.fiveHourPercent,
			reading.fiveHour.usedPercent,
		) ||
		windowRolledOver(
			baseline.weeklyResetsAt,
			reading.weekly.resetsAt,
			baseline.weeklyPercent,
			reading.weekly.usedPercent,
		)
	);
}

/** One window's rollover: a moved reset instant, or a percentage drop when no instant can be compared. */
function windowRolledOver(
	baselineReset: number | undefined,
	currentReset: number | undefined,
	baselinePercent: number,
	currentPercent: number,
): boolean {
	if (baselineReset !== undefined && currentReset !== undefined) {
		return Math.abs(currentReset - baselineReset) > RESET_MOVE_TOLERANCE_MS;
	}
	return baselinePercent - currentPercent > RESET_DROP_POINTS;
}

/**
 * The remaining budget: the unconsumed weekly share expressed as a count of full five-hour quotas.
 *
 * Credit overage is never part of it, so a window at or past its plan quota reads zero and the count
 * can never exceed the plan ratio.
 */
export function remainingBudget(weeklyPercent: number, ratio: number): number {
	const clamped = Math.min(SATURATION_POINTS, Math.max(0, weeklyPercent));
	return ((SATURATION_POINTS - clamped) / SATURATION_POINTS) * ratio;
}
