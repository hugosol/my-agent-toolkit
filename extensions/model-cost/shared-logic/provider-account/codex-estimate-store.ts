/**
 * The independent Codex estimate document: the ratio measurement this extension carries across
 * restarts, in `codex-usage-estimate.json` inside the configured storage root.
 *
 * The document is this extension's own, beside the active consumption document rather than part of
 * it: a consumption reset archives and replaces the activity file and never touches this one, and no
 * accounting total, session record or current price is an input to it — the measurement comes from
 * the paired window readings alone. It is stored human-readably — the baseline as two named windows
 * with their used percentages and reset instants, the instant the baseline was captured, and the
 * stored ratio beside them — so a stale estimate can be diagnosed by reading the file directly. A
 * document that does not match this shape reads as a first run: there is no schema version to carry
 * and no migration path to maintain.
 *
 * The measurement itself is `codex-estimate.ts`; what this module owns is when it reaches the file
 * and what a document already on disk means:
 *
 * - The first usable paired reading publishes the baseline with the ratio still unknown, so a
 *   restart or a long idle stretch continues measuring from the same anchor instead of re-anchoring.
 *   A baseline change — a rollover, an aged-out or future-dated capture — publishes at once as well,
 *   while a ratio refinement waits out the one-minute throttle. The in-progress sample is
 *   recomputable from the baseline and the latest reading, so it is never written at all.
 * - Publication merges rather than overwrites. Inside the framework's coordinated scope the document
 *   on disk and the measurement being written are compared by the baseline's capture instant and the
 *   newer one wins: an instance holding an older measurement can never replace a newer one, and one
 *   that finds a newer within-window baseline adopts it and keeps sampling from it rather than
 *   restarting. Equal capture instants leave the writing instance's measurement in the document. A
 *   known ratio is never downgraded to nothing — whichever side has one is what lands.
 * - Every write is best-effort and off the report's own path: a baseline that cannot be published
 *   keeps its value in memory and leaves the throttle unarmed, so the next trigger retries it, and
 *   nothing rejects into the delivery that triggered it. A document the framework refuses to read —
 *   text that is not JSON — is left exactly as it is rather than overwritten by a guess.
 *
 * The root is created by the consumption store's own load (`consumption-store.ts`), which runs
 * before this one's at the same initialization: the file module publishes into an existing
 * directory, and a root that holds no estimate document is this measurement's first run.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { updateFile } from "../../../../framework/modules/files";
import {
	BASELINE_FUTURE_TOLERANCE_MS,
	type CodexBaseline,
	type CodexEstimate,
	type CodexEstimateSink,
	type CodexEstimateState,
	type CodexPairedReading,
	observePairedReading,
} from "./codex-estimate";

/** The estimate document's fixed file name inside the configured storage root. */
const ESTIMATE_FILE_NAME = "codex-usage-estimate.json";

/** A qualifying ratio refinement reaches the document at most this often. */
const RATIO_WRITE_INTERVAL_MS = 60_000;

/** A baseline to publish, carrying the stored ratio when one is known. */
interface SettledEstimate {
	readonly baseline: CodexBaseline;
	/** The ratio to write; absent when the measurement holds none yet. */
	readonly ratio?: number;
}

/** One window as the readable document carries it. */
interface DocumentWindow {
	/** Used percent of that window's quota. */
	readonly usedPercent: number;
	/** Readable reset instant; null when the reading stated none. */
	readonly resetsAt: string | null;
}

/** The document's readable shape: the baseline's two windows, its capture instant, and the ratio. */
interface EstimateDocument {
	readonly baseline: {
		readonly capturedAt: string;
		readonly fiveHour: DocumentWindow;
		readonly weekly: DocumentWindow;
	};
	/** The stored ratio; null until a sample qualifies. */
	readonly ratio: number | null;
}

/**
 * The refusal the coordinated update carries out when the document already holds a newer baseline.
 *
 * The framework publishes whatever an update function returns, so a newer peer baseline is left
 * untouched by refusing rather than by rewriting it with itself.
 */
class SupersededBaseline extends Error {
	constructor() {
		super("model-cost: the estimate document already carries a newer baseline");
		this.name = "SupersededBaseline";
	}
}

/** A used percent is a share of the window's quota, so it cannot leave 0–100. */
function isUsedPercent(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

/** ISO-8601 timestamps with an optional millisecond part and a zone, as the document writes them. */
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

/** Parse one readable timestamp back to epoch milliseconds; undefined when it is not one. */
function parseTimestamp(value: unknown): number | undefined {
	if (typeof value !== "string" || !ISO_TIMESTAMP.test(value)) return undefined;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

/** A window's reset instant as the document states it: an instant, or nothing when it stated none. */
function parseResetInstant(value: unknown): number | undefined | null {
	if (value === null) return undefined;
	return parseTimestamp(value);
}

/** One value as a plain record, or nothing when it is absent or not one. */
function recordOf(value: unknown): Record<string, unknown> | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
	return value as Record<string, unknown>;
}

/**
 * Read one document back into a measurement, checking its shape and ranges.
 *
 * Anything else — a missing baseline, a window that is not an object, a used percent outside 0–100, a
 * malformed or missing timestamp, a ratio that is present but not a positive finite number, or a
 * capture instant ahead of the local clock — reads as `undefined`, i.e. as no document at all. A
 * null (or absent) ratio is valid: the baseline was published before any sample qualified.
 */
function measuredFrom(raw: unknown, now: number): SettledEstimate | undefined {
	const document = recordOf(raw);
	const baseline = recordOf(document?.["baseline"]);
	const fiveHour = recordOf(baseline?.["fiveHour"]);
	const weekly = recordOf(baseline?.["weekly"]);
	if (baseline === undefined || fiveHour === undefined || weekly === undefined) return undefined;

	const capturedAt = parseTimestamp(baseline["capturedAt"]);
	const fiveHourResetsAt = parseResetInstant(fiveHour["resetsAt"]);
	const weeklyResetsAt = parseResetInstant(weekly["resetsAt"]);
	const fiveHourPercent = fiveHour["usedPercent"];
	const weeklyPercent = weekly["usedPercent"];
	if (
		capturedAt === undefined ||
		fiveHourResetsAt === null ||
		weeklyResetsAt === null ||
		!isUsedPercent(fiveHourPercent) ||
		!isUsedPercent(weeklyPercent)
	) {
		return undefined;
	}
	// A capture instant ahead of this clock is not a baseline this process may measure from.
	if (capturedAt - now > BASELINE_FUTURE_TOLERANCE_MS) return undefined;

	const storedRatio = document?.["ratio"];
	let ratio: number | undefined;
	if (storedRatio === null || storedRatio === undefined) ratio = undefined;
	else if (typeof storedRatio === "number" && Number.isFinite(storedRatio) && storedRatio > 0) ratio = storedRatio;
	else return undefined;

	return {
		baseline: {
			fiveHourPercent,
			weeklyPercent,
			...(fiveHourResetsAt === undefined ? {} : { fiveHourResetsAt }),
			...(weeklyResetsAt === undefined ? {} : { weeklyResetsAt }),
			capturedAt,
		},
		...(ratio === undefined ? {} : { ratio }),
	};
}

/** One measurement number with enough precision to read, without floating-point noise. */
function roundedForDocument(value: number): number {
	return Number(value.toFixed(4));
}

/**
 * Render one epoch-millisecond instant as a local-time ISO-8601 string with its UTC offset, e.g.
 * `2026-10-13T08:22:06.554+08:00`, preserving milliseconds. The offset is the one in effect at that
 * instant, so instants written across a daylight-saving change each stay unambiguous.
 */
function toLocalTimestamp(epochMs: number): string {
	const offsetMinutes = -new Date(epochMs).getTimezoneOffset();
	const sign = offsetMinutes < 0 ? "-" : "+";
	const absolute = Math.abs(offsetMinutes);
	const offset = `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
	const local = new Date(epochMs + offsetMinutes * 60_000).toISOString();
	return `${local.slice(0, -1)}${offset}`;
}

/** Render the measurement as the readable document. */
function documentOf(settled: SettledEstimate): EstimateDocument {
	const { baseline } = settled;
	return {
		baseline: {
			capturedAt: toLocalTimestamp(baseline.capturedAt),
			fiveHour: {
				usedPercent: roundedForDocument(baseline.fiveHourPercent),
				resetsAt: baseline.fiveHourResetsAt === undefined ? null : toLocalTimestamp(baseline.fiveHourResetsAt),
			},
			weekly: {
				usedPercent: roundedForDocument(baseline.weeklyPercent),
				resetsAt: baseline.weeklyResetsAt === undefined ? null : toLocalTimestamp(baseline.weeklyResetsAt),
			},
		},
		ratio: settled.ratio === undefined ? null : roundedForDocument(settled.ratio),
	};
}

/**
 * The estimate document one instance publishes its measurement into, and the state its display reads.
 *
 * Construction takes the already-resolved absolute storage root — resolving the declared `storageDir`
 * is the configuration entry's business (`storage-root.ts`) — and creates no file and writes nothing.
 * The measurement is in memory the moment a report is folded in; the file is what carries it to the
 * next process.
 */
export class CodexEstimateStore implements CodexEstimate, CodexEstimateSink {
	/** The absolute path of the independent estimate document inside the storage root. */
	readonly estimateFile: string;

	#state: CodexEstimateState = {};
	/** When the last publication landed; the throttle's anchor. `undefined` while none has. */
	#publishedAt: number | undefined;
	readonly #now: () => number;

	constructor(storageDirectory: string, now: () => number) {
		this.estimateFile = join(storageDirectory, ESTIMATE_FILE_NAME);
		this.#now = now;
	}

	/** Load the document a normal initialization continues from; a document that is no measurement is a first run. */
	async load(): Promise<void> {
		this.#state = await this.#readDocument();
	}

	/** The measurement as it stands now. */
	state(): CodexEstimateState {
		return this.#state;
	}

	/**
	 * Fold one report's own paired reading in, then publish the change per the extension's write
	 * policy.
	 *
	 * The measurement is in memory as this call returns its promise; the promise answers when the
	 * write this change triggered has settled, and at once when it triggered none. It never rejects,
	 * so a caller that does not wait for it — every delivery in production — is not disturbed either.
	 */
	async observe(reading: CodexPairedReading): Promise<void> {
		const now = this.#now();
		const next = observePairedReading(this.#state, reading, now);
		// An unchanged measurement — a reading that carried one window, a skipped sample or a reading
		// that only re-anchored — is not a write trigger.
		if (next === this.#state) return;
		const baselineChanged = next.baseline !== this.#state.baseline;
		this.#state = next;

		const { baseline, ratio } = next;
		if (baseline === undefined) return;
		// A new or rebaselined reading lands at once, even before any ratio exists, so a restart
		// resumes the same measurement. An unchanged baseline writes only when a ratio appears or
		// moves, and then the throttle applies.
		if (
			!baselineChanged &&
			(ratio === undefined || (this.#publishedAt !== undefined && now - this.#publishedAt < RATIO_WRITE_INTERVAL_MS))
		) {
			return;
		}
		await this.#publish({ baseline, ...(ratio === undefined ? {} : { ratio }) }, now);
	}

	/** The document this instance holds now, read the way a normal initialization reads it. */
	async #readDocument(): Promise<CodexEstimateState> {
		try {
			const measured = measuredFrom(JSON.parse(await readFile(this.estimateFile, "utf8")), this.#now());
			if (measured === undefined) return {};
			return {
				baseline: measured.baseline,
				...(measured.ratio === undefined ? {} : { ratio: measured.ratio }),
			};
		} catch {
			// A missing, unreadable, unparseable or foreign document is a first run: nothing is guessed
			// and nothing is fabricated, and the next qualifying sample publishes a valid document again.
			return {};
		}
	}

	/**
	 * Publish one measurement through the framework's coordinated read-modify-publish, merging by the
	 * baseline's capture instant.
	 *
	 * The throttle's anchor is armed as this write begins rather than when it lands: a refinement that
	 * arrives while a baseline's own write is still in flight is inside the minute just as much as one
	 * that arrives after it, and that earlier write is already ahead of it in the document's queue. A
	 * write that does not land puts the anchor back where it was, so the next trigger retries it.
	 */
	async #publish(settled: SettledEstimate, now: number): Promise<void> {
		const anchoredAt = this.#publishedAt;
		this.#publishedAt = now;
		try {
			await updateFile(this.estimateFile, current => {
				const onDisk = measuredFrom(current, now);
				if (onDisk !== undefined && onDisk.baseline.capturedAt > settled.baseline.capturedAt) {
					// The document already carries a newer baseline: it is the peer's measurement, and this
					// write neither replaces it nor rewrites it. This instance adopts it — keeping whichever
					// side has a ratio — unless it anchored an even later baseline while this write was
					// queued, so its own measurement can never move backwards either.
					const anchored = this.#state.baseline;
					if (anchored === undefined || anchored.capturedAt < onDisk.baseline.capturedAt) {
						const ratio = onDisk.ratio ?? settled.ratio;
						this.#state = { baseline: onDisk.baseline, ...(ratio === undefined ? {} : { ratio }) };
					}
					throw new SupersededBaseline();
				}
				// This instance's baseline lands; a known ratio is never downgraded, so the document's
				// ratio is what fills in when this measurement has none.
				const ratio = settled.ratio ?? onDisk?.ratio;
				if (ratio !== undefined && this.#state.ratio === undefined) this.#state = { ...this.#state, ratio };
				return documentOf({ baseline: settled.baseline, ...(ratio === undefined ? {} : { ratio }) });
			});
		} catch {
			// Best-effort persistence: the measurement stays in memory as it is, nothing rejects into the
			// report that triggered it, and the next trigger retries this write.
			this.#publishedAt = anchoredAt;
		}
	}
}
