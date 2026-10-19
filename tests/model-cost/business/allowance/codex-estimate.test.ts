/**
 * The Codex ratio/left estimate, at the extension's display seam and over its own document (P66; S2, S4).
 *
 * Two halves, each at one approved seam.
 *
 * The report cases drive the production runtime through the framework's public binding (the port
 * double, `tests/framework/support/harness-port-double.ts`) and read what a frontend reads:
 * `runtime.presentation.estimate()`, the process-level read-only result. Every report below is fed
 * exactly as a harness adapter feeds one — the account API answer alone, through the runtime's one
 * query entry, whether the attempt at initialization or the refresh a settled Codex Turn triggers —
 * so the pairing of a single report, the qualifying thresholds, the rebaseline rules and the
 * `estimating…` reading are all observed where the display observes them, and no file is read to
 * see them.
 *
 * The document cases drive the measurement's own entry (`runtime.estimate.observe`), which answers
 * when the write it triggered has settled — the same shape the consumption store's own save has — and
 * read the real `codex-usage-estimate.json` in the storage root afterwards. That is where the
 * baseline's immediacy, the minute between ratio writes, the merge a second instance's document goes
 * through, and the read-back a restart performs are checked against the bytes on disk.
 *
 * The expectations are the preserved measurement rules, written out by hand: a five-hour movement of
 * at least 50 points with both windows up and neither saturated, a baseline trusted for the five-hour
 * window it anchors, a minute between ratio writes, and a merge that keeps the newer baseline. Every
 * percentage, reset instant and ratio below is this file's own literal or arithmetic on those
 * literals; the document's readable timestamps are decoded back to the epoch instants they were
 * written from rather than produced by the code under test.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { setImmediate as immediate } from "node:timers/promises";
import { MODEL_COST } from "../../../../extensions/model-cost/definition";
import type { CodexPairedReading } from "../../../../extensions/model-cost/shared-logic/business/allowance/codex-estimate";
import type { ModelPricingData } from "../../../../extensions/model-cost/shared-logic/business/pricing/model-data";
import { type ModelCostRuntime, createModelCostRuntime } from "../../../../extensions/model-cost/shared-logic/runtime";
import type { ProviderAccess, ProviderAccessFacts } from "../../../../framework/interface/host-facts";
import type { SessionFacts, TurnOutcome } from "../../../../framework/interface/session";
import type { TurnSignal } from "../../../../framework/runtime/port";
import type { HttpRequestOptions } from "../../../../framework/interface/general/http";
import { type PortDouble, portDouble } from "../../../framework/support/harness-port-double";
import { testSessionCapability } from "../../support/session-capability";

/** The self-made pricing data every case binds with: nothing here reads a real price or model list. */
const DATA: ModelPricingData = {
	currency: "XTS",
	unit: "XTS per million tokens",
	peakMultiplier: 3,
	zoneOffsetMinutes: 8 * 60,
	peakWindows: [],
	tiers: {},
	allowanceProviders: [],
	models: {},
};

const HARNESS = "probe-harness";
const MAIN: SessionFacts = { sessionId: "session-main", kind: "main", unavailable: [] };
const OWNER = { kind: "owner", key: "main:estimate" } as const;

/** The clock every case starts at; the reset instants below are arithmetic on this literal. */
const CLOCK = 1_700_000_000_000;

const CODEX = "openai-codex";
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Five hours and seven days: the lengths the two windows report. */
const FIVE_HOUR_MS = 5 * HOUR_MS;

/** The estimate document inside the storage root, named by the storage authority. */
const ESTIMATE_FILE = "codex-usage-estimate.json";

/** The account id this file wrote into the credential, and the credential itself. */
const ACCOUNT_ID = "acct-14";

/**
 * A JWT-shaped credential whose claim names a ChatGPT account, written here rather than derived from
 * anything under test.
 */
function codexToken(accountId: string): string {
	const claims = Buffer.from(
		JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: accountId } }),
		"utf8",
	).toBase64();
	return `header.${claims}.signature`;
}

const TOKEN = codexToken(ACCOUNT_ID);

/** One request the startup query made, as the substituted HTTP call recorded it. */
interface SentRequest {
	readonly url: string;
	readonly options: HttpRequestOptions | undefined;
}

/** The five-hour window's reset instant every report states, in seconds: one hour after the clock. */
const RESET_FIVE_HOUR_SECONDS = 1_700_003_600;

/** The weekly window's reset instant every report states, in seconds: one day after the clock. */
const RESET_WEEKLY_SECONDS = 1_700_086_400;

/** One window as one account API answer states it, in that report's own units. */
interface ReportedWindow {
	readonly usedPercent: number;
	/** The window's reported length, in seconds. */
	readonly seconds: number;
	/** The reset instant the report stated, in seconds; absent when it states none. */
	readonly resetAt?: number;
}

/**
 * One account API answer, in the provider's own document shape, as one JSON response: the windows the
 * report carried, each stating its reset instant in seconds.
 */
function usageAnswer(windows: {
	readonly primary?: ReportedWindow;
	readonly secondary?: ReportedWindow;
}): Response {
	const windowOf = (window: ReportedWindow): Record<string, unknown> => ({
		used_percent: window.usedPercent,
		limit_window_seconds: window.seconds,
		reset_at: window.resetAt,
	});
	return new Response(
		JSON.stringify({
			plan_type: "pro",
			rate_limit: {
				...(windows.primary === undefined ? {} : { primary_window: windowOf(windows.primary) }),
				...(windows.secondary === undefined ? {} : { secondary_window: windowOf(windows.secondary) }),
			},
		}),
		{ status: 200, headers: { "content-type": "application/json" } },
	);
}

/** The five-hour window of one report, with its reset instant in seconds: one hour after the clock. */
function fiveHourWindow(usedPercent: number, resetAt: number = RESET_FIVE_HOUR_SECONDS): ReportedWindow {
	return { usedPercent, seconds: 18_000, resetAt };
}

/** The weekly window of one report, with its reset instant in seconds: one day after the clock. */
function weeklyWindow(usedPercent: number, resetAt: number = RESET_WEEKLY_SECONDS): ReportedWindow {
	return { usedPercent, seconds: 604_800, resetAt };
}

/**
 * One account API answer carrying both windows — one report, and therefore one pair — with each
 * window reporting the reset instant every case's reports use. The same document answers the
 * startup query and every later refresh: the two triggers differ in when they ask, never in what an
 * answer is shaped like.
 */
function codexAnswer(fiveHourPercent: number, weeklyPercent: number): Response {
	return usageAnswer({ primary: fiveHourWindow(fiveHourPercent), secondary: weeklyWindow(weeklyPercent) });
}

/** Both windows of one report whose source stated no reset instant at all. */
function codexAnswerWithoutResets(fiveHourPercent: number, weeklyPercent: number): Response {
	return usageAnswer({
		primary: { usedPercent: fiveHourPercent, seconds: 18_000 },
		secondary: { usedPercent: weeklyPercent, seconds: 604_800 },
	});
}

/** One report's own pair, in the measurement's own terms, written here rather than read from a report. */
function pair(
	fiveHour: readonly [percent: number, resetsAt?: number],
	weekly: readonly [percent: number, resetsAt?: number],
): CodexPairedReading {
	return {
		fiveHour: { usedPercent: fiveHour[0], ...(fiveHour[1] === undefined ? {} : { resetsAt: fiveHour[1] }) },
		weekly: { usedPercent: weekly[0], ...(weekly[1] === undefined ? {} : { resetsAt: weekly[1] }) },
	};
}

/** One bound instance, and what a case drives and observes it through. */
interface BoundEstimate {
	readonly runtime: ModelCostRuntime;
	readonly double: PortDouble;
	readonly sent: SentRequest[];
	/** The clock the runtime's own business reads; a case moves it by assignment. */
	readonly clock: { now: number };
	/** The independent estimate document this instance publishes into. */
	readonly estimateFile: string;
	/** The storage root this instance was pointed at. */
	readonly root: string;
}

/** Every root this file created, removed after each case. */
const roots: string[] = [];

/**
 * One estimate instance over a storage root: the production runtime, bound through the framework's
 * own binding, with the harness's provider access and the HTTP call substituted. A root of its own is
 * created unless a case names one, which is what lets a second instance — a restart, or a peer
 * process — continue from the same file. The substituted call answers every account API query from
 * `answer`, so a report-driven case stages the report's own document in it before delivering the
 * Turn; an answer of no windows at all leaves the measurement empty, which is what the cases that
 * drive its own entry directly start from.
 */
async function bindEstimate(
	options: { readonly answer?: () => Response; readonly root?: string } = {},
): Promise<BoundEstimate> {
	const root = options.root ?? mkdtempSync(path.join(tmpdir(), "model-cost-estimate-"));
	if (options.root === undefined) roots.push(root);
	const clock = { now: CLOCK };
	const sent: SentRequest[] = [];
	const access: ProviderAccess = {
		resolve: async (provider: string): Promise<ProviderAccessFacts | undefined> =>
			provider === CODEX ? { baseUrl: "https://host.example/codex", credential: TOKEN } : undefined,
	};
	const runtime = createModelCostRuntime({
		config: { storageDir: root, balanceTtlMs: 30_000 },
		configDirectory: root,
		userHomeDirectory: root,
		harness: HARNESS,
		data: DATA,
		session: testSessionCapability(),
		providerAccess: access,
		now: () => clock.now,
		httpRequest: async (url, httpOptions) => {
			sent.push({ url, options: httpOptions });
			return options.answer?.() ?? usageAnswer({});
		},
	});
	const double = portDouble();
	double.bind(MODEL_COST, {
		factory: () => runtime.implementation,
		config: { reader: () => `storageDir: ${root}\nbalanceTtlMs: 30000\ncodexQuotaTtlMs: 15000\n` },
	});
	double.deliverSession(OWNER, { session: MAIN });
	// The run-initiation hook is where the framework waits for the one-time initialization, so this is
	// also the point at which the startup query and the estimate document's own read have happened.
	await double.initiateRun(OWNER);
	return { runtime, double, sent, clock, estimateFile: path.join(root, ESTIMATE_FILE), root };
}

/**
 * One whole Codex report as the deliveries a real exchange produces: the Turn's start facts, its
 * response — whose rate-limit headers this module no longer reads, so it carries none — and the
 * settled response. What the report states reaches the measurement through the account API answer
 * staged as the next answer before this delivery; the query the settled Turn starts is awaited by
 * the `drain` that follows it.
 */
function report(bound: BoundEstimate, at: number): void {
	const session: SessionFacts = { sessionId: `session-codex-${at}`, kind: "main", unavailable: [] };
	bound.double.deliverTurn(
		{ kind: "request_started", session, at, provider: CODEX, model: "gpt-6-luna" } as TurnSignal,
		{ owner: OWNER },
	);
	bound.double.deliverTurn(
		{ kind: "response_received", session, http: { status: 200, headers: {} } } as TurnSignal,
		{ owner: OWNER },
	);
	bound.double.deliverTurn(
		{
			kind: "response_settled",
			session,
			at: at + 1_000,
			outcome: "completed" as TurnOutcome,
			readings: [],
		} as TurnSignal,
		{ owner: OWNER },
	);
}

/** Let the query one settled report began settle: it awaits the host's facts, the answer and its body. */
const drain = (): Promise<void> => immediate();

/** One window as the readable document carries it. */
interface DocumentWindow {
	readonly usedPercent: number;
	readonly resetsAt: string | null;
}

/** The written document, in the shape the storage authority fixes for the estimate. */
interface EstimateDocument {
	readonly baseline: {
		readonly capturedAt: string;
		readonly fiveHour: DocumentWindow;
		readonly weekly: DocumentWindow;
	};
	readonly ratio: number | null;
}

/** One window as the measurement holds it: its percentage and its reset instant in epoch milliseconds. */
interface MeasuredWindow {
	readonly usedPercent: number;
	readonly resetsAt: number | undefined;
}

/** The measurement one document states, with every readable timestamp decoded back to epoch ms. */
interface MeasuredDocument {
	readonly baseline: {
		readonly capturedAt: number;
		readonly fiveHour: MeasuredWindow;
		readonly weekly: MeasuredWindow;
	};
	readonly ratio: number | undefined;
}

/** The measurement one written document states, with its null reset instants read as absent. */
function measuredDocument(document: EstimateDocument | undefined): MeasuredDocument | undefined {
	const baseline = document?.baseline;
	if (baseline === undefined) return undefined;
	const { fiveHour, weekly, capturedAt } = baseline;
	return {
		baseline: {
			capturedAt: Date.parse(capturedAt),
			fiveHour: {
				usedPercent: fiveHour.usedPercent,
				resetsAt: fiveHour.resetsAt === null ? undefined : Date.parse(fiveHour.resetsAt),
			},
			weekly: {
				usedPercent: weekly.usedPercent,
				resetsAt: weekly.resetsAt === null ? undefined : Date.parse(weekly.resetsAt),
			},
		},
		ratio: document?.ratio ?? undefined,
	};
}

/** The document one root holds, or nothing while it holds none this shape can be read from. */
function readDocument(bound: BoundEstimate): EstimateDocument | undefined {
	try {
		return JSON.parse(readFileSync(bound.estimateFile, "utf8")) as EstimateDocument;
	} catch {
		return undefined;
	}
}

/**
 * One document as this file writes it: the readable shape the estimate file carries, with the
 * timestamps written as UTC instants here — which that shape accepts beside a local-time one with an
 * offset. A case that seeds a document writes it before the instance under test reads it, or after
 * its own write has settled.
 */
function documentText(
	baseline: {
		readonly fiveHourPercent: number;
		readonly weeklyPercent: number;
		readonly capturedAt: number;
		readonly fiveHourResetsAt?: number;
		readonly weeklyResetsAt?: number;
	},
	ratio: number | null,
): string {
	return JSON.stringify({
		baseline: {
			capturedAt: new Date(baseline.capturedAt).toISOString(),
			fiveHour: {
				usedPercent: baseline.fiveHourPercent,
				resetsAt: baseline.fiveHourResetsAt === undefined ? null : new Date(baseline.fiveHourResetsAt).toISOString(),
			},
			weekly: {
				usedPercent: baseline.weeklyPercent,
				resetsAt: baseline.weeklyResetsAt === undefined ? null : new Date(baseline.weeklyResetsAt).toISOString(),
			},
		},
		ratio,
	});
}

/** The baseline every report in the cases below anchors or measures against, in epoch terms. */
const BASELINE = {
	fiveHourPercent: 10,
	weeklyPercent: 2,
	capturedAt: CLOCK,
	fiveHourResetsAt: RESET_FIVE_HOUR_SECONDS * 1000,
	weeklyResetsAt: RESET_WEEKLY_SECONDS * 1000,
};

afterEach(() => {
	// A report-driven case may have left a best-effort write in flight; the retries let the platform's
	// short-lived refusals pass rather than turning them into a removal failure.
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
});

describe("a report's own pair is the only thing a sample may come from (P66)", () => {
	test("the first usable pair shows no estimate yet", async () => {
		const bound = await bindEstimate({ answer: () => codexAnswer(12.5, 60) });

		// The startup answer carried both windows, and no ratio can exist before a change from an
		// anchor has been seen: the display says exactly that rather than showing an exhausted plan.
		expect(bound.runtime.presentation.estimate()).toEqual({ text: "estimating…" });
	});

	test("50 five-hour points over 5 weekly points read ratio≈10.0, with left from the displayed week", async () => {
		let reply: () => Response = () => codexAnswer(10, 2);
		const bound = await bindEstimate({ answer: () => reply() });

		// 10% → 60% is exactly the 50-point five-hour threshold, and the weekly window moved up by 5
		// points without either window saturating: 50 / 5 = 10. `left` is the unconsumed weekly share
		// this display shows — (100 − 7) / 100 × 10 = 9.3 five-hour quotas.
		reply = () => codexAnswer(60, 7);
		bound.clock.now = CLOCK + 30_000;
		report(bound, CLOCK + 30_000);
		await drain();

		expect(bound.runtime.presentation.estimate()).toEqual({
			ratio: 10,
			left: 9.3,
			text: "left≈9.3×5h · ratio≈10.0",
		});
	});

	test("no interval below the thresholds or at saturation replaces the stored ratio", async () => {
		let reply: () => Response = () => codexAnswer(0, 0);
		const bound = await bindEstimate({ answer: () => reply() });
		reply = () => codexAnswer(50, 5);
		bound.clock.now = CLOCK + 30_000;
		report(bound, CLOCK + 30_000);
		await drain();
		expect(bound.runtime.presentation.estimate()?.ratio).toBe(10);

		// Every interval is a complete pair from one report against the 0% / 0% baseline; the first is
		// one point below the five-hour span threshold, and the rest move nothing up or sit at
		// saturation, where a window hides the consumption after it. `left` is the hand-computed
		// (100 − weekly) / 100 × 10 for the weekly percent each report carries, and the segment renders
		// it to one decimal.
		const intervals: readonly (readonly [string, number, number, number, string])[] = [
			["one point below the five-hour span threshold", 49, 4.9, 9.51, "left≈9.5×5h · ratio≈10.0"],
			["no movement in either window", 0, 0, 10, "left≈10.0×5h · ratio≈10.0"],
			["weekly movement only", 0, 5, 9.5, "left≈9.5×5h · ratio≈10.0"],
			["five-hour movement only", 60, 0, 10, "left≈10.0×5h · ratio≈10.0"],
			["a saturated five-hour window", 100, 40, 6, "left≈6.0×5h · ratio≈10.0"],
			["a saturated weekly window", 60, 100, 0, "left≈0.0×5h · ratio≈10.0"],
		];
		let at = CLOCK + 60_000;
		for (const [interval, fiveHour, weekly, left, text] of intervals) {
			reply = () => codexAnswer(fiveHour, weekly);
			bound.clock.now = at;
			report(bound, at);
			await drain();
			const estimate = bound.runtime.presentation.estimate();
			expect({ interval, text: estimate?.text }).toEqual({ interval, text });
			expect({ interval, ratio: estimate?.ratio }).toEqual({ interval, ratio: 10 });
			expect({ interval, left: estimate?.left }).toEqual({ interval, left: expect.closeTo(left, 6) });
			at += 30_000;
		}
	});

	test("a report carrying one window pairs nothing and leaves the baseline it did not carry alone", async () => {
		let reply: () => Response = () => codexAnswer(0, 0);
		const bound = await bindEstimate({ answer: () => reply() });
		reply = () => codexAnswer(50, 5);
		bound.clock.now = CLOCK + 30_000;
		report(bound, CLOCK + 30_000);
		await drain();
		expect(bound.runtime.presentation.estimate()?.ratio).toBe(10);

		// The answer carries the weekly window only, so the held 50% five-hour reading is what the
		// process shows; pairing it with the fresh 20% would read 50 / 20 and measure nothing real.
		reply = () => usageAnswer({ secondary: weeklyWindow(20) });
		bound.clock.now = CLOCK + 60_000;
		report(bound, CLOCK + 60_000);
		await drain();
		// The held pair still renders, with `left` following the weekly percent this display shows:
		// (100 − 20) / 100 × 10 = 8.0.
		expect(bound.runtime.presentation.estimate()).toEqual({
			ratio: 10,
			left: 8,
			text: "left≈8.0×5h · ratio≈10.0",
		});

		// The baseline is still the one the pair anchored: 60 − 0 = 60 five-hour points over 12 − 0 = 12
		// weekly ones reads 5.0, where rebasing on the single-window report would have measured
		// 60 − 50 = 10 over 12 − 20.
		reply = () => codexAnswer(60, 12);
		bound.clock.now = CLOCK + 90_000;
		report(bound, CLOCK + 90_000);
		await drain();
		expect(bound.runtime.presentation.estimate()).toEqual({
			ratio: 5,
			left: 4.4,
			text: "left≈4.4×5h · ratio≈5.0",
		});
	});
});

describe("a crossed window boundary rebuilds the baseline and never withdraws the ratio (P66)", () => {
	test("a moved five-hour reset instant rebaselines, and the next sample spans only the new window", async () => {
		let reply: () => Response = () => codexAnswer(10, 2);
		const bound = await bindEstimate({ answer: () => reply() });
		reply = () => codexAnswer(60, 7);
		bound.clock.now = CLOCK + 30_000;
		report(bound, CLOCK + 30_000);
		await drain();
		expect(bound.runtime.presentation.estimate()?.ratio).toBe(10);

		// The five-hour window rolled over: its reset instant moved five hours on and its percent
		// dropped to 5. No sample spans that boundary, and the ratio stays what it was.
		const rolledReset = RESET_FIVE_HOUR_SECONDS + FIVE_HOUR_MS / 1000;
		reply = () => usageAnswer({ primary: fiveHourWindow(5, rolledReset), secondary: weeklyWindow(3) });
		bound.clock.now = CLOCK + 60_000;
		report(bound, CLOCK + 60_000);
		await drain();
		expect(bound.runtime.presentation.estimate()).toEqual({
			ratio: 10,
			left: 9.7,
			text: "left≈9.7×5h · ratio≈10.0",
		});

		// The new baseline was 5% / 3%: 55 / 7.5 measures 50 five-hour points over 4.5 weekly ones,
		// where the pre-rollover baseline would have measured 45 / 5.5.
		reply = () => usageAnswer({ primary: fiveHourWindow(55, rolledReset), secondary: weeklyWindow(7.5) });
		bound.clock.now = CLOCK + 90_000;
		report(bound, CLOCK + 90_000);
		await drain();
		expect(bound.runtime.presentation.estimate()?.ratio).toBeCloseTo(11.1111, 3);
		expect(bound.runtime.presentation.estimate()?.text).toBe("left≈10.3×5h · ratio≈11.1");
	});

	test("a percentage drop rebuilds the baseline when no reset instant can be compared", async () => {
		let reply: () => Response = () => codexAnswerWithoutResets(10, 2);
		const bound = await bindEstimate({ answer: () => reply() });

		// A one-point drop is below the fallback's own trigger, and it moves nothing up, so it samples
		// nothing: the measurement still knows no ratio.
		reply = () => codexAnswerWithoutResets(9, 1.5);
		bound.clock.now = CLOCK + 30_000;
		report(bound, CLOCK + 30_000);
		await drain();
		expect(bound.runtime.presentation.estimate()).toEqual({ text: "estimating…" });

		// The same anchor still measures the qualifying span: 60 − 10 = 50 over 7 − 2 = 5.
		reply = () => codexAnswerWithoutResets(60, 7);
		bound.clock.now = CLOCK + 60_000;
		report(bound, CLOCK + 60_000);
		await drain();
		expect(bound.runtime.presentation.estimate()?.ratio).toBe(10);

		// A 55-point drop with no instant to compare is a rollover: the baseline becomes 5% / 1% and
		// the ratio survives it.
		reply = () => codexAnswerWithoutResets(5, 1);
		bound.clock.now = CLOCK + 90_000;
		report(bound, CLOCK + 90_000);
		await drain();
		expect(bound.runtime.presentation.estimate()?.ratio).toBe(10);

		// 55 − 5 = 50 over 11 − 1 = 10 only qualifies against the rebuilt baseline.
		reply = () => codexAnswerWithoutResets(55, 11);
		bound.clock.now = CLOCK + 120_000;
		report(bound, CLOCK + 120_000);
		await drain();
		expect(bound.runtime.presentation.estimate()?.ratio).toBe(5);
	});

	test("a baseline aged exactly five hours is never sampled across", async () => {
		let reply: () => Response = () => codexAnswer(10, 2);
		const bound = await bindEstimate({ answer: () => reply() });
		reply = () => codexAnswer(60, 7);
		bound.clock.now = CLOCK + 30_000;
		report(bound, CLOCK + 30_000);
		await drain();
		expect(bound.runtime.presentation.estimate()?.ratio).toBe(10);

		// The five-hour window the baseline anchored has just run out: its reported reset instants did
		// not move, so only the age shows it, and the reading below anchors a new baseline instead of
		// measuring 20 points against the old one.
		reply = () => codexAnswer(30, 4);
		bound.clock.now = CLOCK + FIVE_HOUR_MS;
		report(bound, CLOCK + FIVE_HOUR_MS);
		await drain();
		expect(bound.runtime.presentation.estimate()?.ratio).toBe(10);

		// Measured from the rebuilt anchor: 80 − 30 = 50 over 14 − 4 = 10.
		reply = () => codexAnswer(80, 14);
		bound.clock.now = CLOCK + FIVE_HOUR_MS + 60_000;
		report(bound, CLOCK + FIVE_HOUR_MS + 60_000);
		await drain();
		expect(bound.runtime.presentation.estimate()?.ratio).toBe(5);
	});
});

describe("the baseline is published at once and a ratio refinement waits a minute (P66)", () => {
	test("the first usable pair publishes the baseline with the ratio still unknown", async () => {
		const bound = await bindEstimate();

		await bound.runtime.estimate.observe(pair([10, BASELINE.fiveHourResetsAt], [2, BASELINE.weeklyResetsAt]));

		const document = readDocument(bound);
		expect(measuredDocument(document)).toEqual({
			baseline: {
				capturedAt: CLOCK,
				fiveHour: { usedPercent: 10, resetsAt: BASELINE.fiveHourResetsAt },
				weekly: { usedPercent: 2, resetsAt: BASELINE.weeklyResetsAt },
			},
			ratio: undefined,
		});
		// The baseline lands with the ratio explicitly unknown, and the document is the readable shape
		// the storage authority fixes for it — no version field, no account partition, no extra keys.
		expect(document?.ratio).toBeNull();
		expect(Object.keys(document ?? {})).toEqual(["baseline", "ratio"]);
		expect(Object.keys(document?.baseline ?? {}).sort()).toEqual(["capturedAt", "fiveHour", "weekly"]);
		expect(Object.keys(document?.baseline.fiveHour ?? {}).sort()).toEqual(["resetsAt", "usedPercent"]);
		expect(document?.baseline.capturedAt).toMatch(
			/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}(?:Z|[+-]\d{2}:\d{2})$/,
		);
	});

	test("a ratio refinement inside the minute stays in memory, and the next one after it lands", async () => {
		const bound = await bindEstimate();
		await bound.runtime.estimate.observe(pair([0, BASELINE.fiveHourResetsAt], [0, BASELINE.weeklyResetsAt]));

		// 0% → 50% over 0% → 5% qualifies in memory, 30 seconds after that baseline's own write.
		bound.clock.now = CLOCK + 30_000;
		await bound.runtime.estimate.observe(pair([50, BASELINE.fiveHourResetsAt], [5, BASELINE.weeklyResetsAt]));
		expect(bound.runtime.estimate.state().ratio).toBe(10);
		expect(readDocument(bound)?.ratio).toBeNull();

		// A refinement 61 seconds after the baseline's publication reaches the file: 51 / 5.1 is the
		// same 10, and the baseline it was measured against is unchanged.
		bound.clock.now = CLOCK + 61_000;
		await bound.runtime.estimate.observe(pair([51, BASELINE.fiveHourResetsAt], [5.1, BASELINE.weeklyResetsAt]));
		expect(measuredDocument(readDocument(bound))).toEqual({
			baseline: {
				capturedAt: CLOCK,
				fiveHour: { usedPercent: 0, resetsAt: BASELINE.fiveHourResetsAt },
				weekly: { usedPercent: 0, resetsAt: BASELINE.weeklyResetsAt },
			},
			ratio: 10,
		});
	});

	test("a rebaselined window inside the minute is published at once", async () => {
		const bound = await bindEstimate();
		await bound.runtime.estimate.observe(pair([0, BASELINE.fiveHourResetsAt], [0, BASELINE.weeklyResetsAt]));
		bound.clock.now = CLOCK + 30_000;
		await bound.runtime.estimate.observe(pair([50, BASELINE.fiveHourResetsAt], [5, BASELINE.weeklyResetsAt]));
		expect(bound.runtime.estimate.state().ratio).toBe(10);

		// The five-hour window rolled over 30 seconds after the baseline landed: that is a baseline
		// change, so it is written immediately even though no ratio refinement would be. The document
		// holds the new anchor, and the ratio this instance had already learned is written with it —
		// a rebaselining never takes a known ratio away.
		const rolledReset = BASELINE.fiveHourResetsAt + FIVE_HOUR_MS;
		await bound.runtime.estimate.observe(pair([4, rolledReset], [1, BASELINE.weeklyResetsAt]));
		expect(measuredDocument(readDocument(bound))).toEqual({
			baseline: {
				capturedAt: CLOCK + 30_000,
				fiveHour: { usedPercent: 4, resetsAt: rolledReset },
				weekly: { usedPercent: 1, resetsAt: BASELINE.weeklyResetsAt },
			},
			ratio: 10,
		});
		expect(bound.runtime.estimate.state().ratio).toBe(10);
	});
});

describe("a shared document merges by the baseline's capture instant (P66)", () => {
	test("a newer baseline on disk is kept, and the instance holding the older one adopts it", async () => {
		const bound = await bindEstimate();
		await bound.runtime.estimate.observe(pair([0, BASELINE.fiveHourResetsAt], [0, BASELINE.weeklyResetsAt]));

		// A peer process anchored later and knows a ratio of its own: 20% / 2% half a minute after this
		// instance's own 0% / 0% anchor, with its ratio already stored.
		writeFileSync(
			bound.estimateFile,
			documentText(
				{ fiveHourPercent: 20, weeklyPercent: 2, capturedAt: CLOCK + 30_000, ...BASELINE_RESETS },
				7.5,
			),
			"utf8",
		);

		// This instance's own sample would read 60 / 6 = 10, but its baseline is the older one: the
		// document keeps the peer's state — its baseline and its ratio — and this instance adopts it.
		bound.clock.now = CLOCK + 60_000;
		await bound.runtime.estimate.observe(pair([60, BASELINE.fiveHourResetsAt], [6, BASELINE.weeklyResetsAt]));
		expect(bound.runtime.estimate.state()).toEqual({
			baseline: {
				fiveHourPercent: 20,
				weeklyPercent: 2,
				fiveHourResetsAt: BASELINE.fiveHourResetsAt,
				weeklyResetsAt: BASELINE.weeklyResetsAt,
				capturedAt: CLOCK + 30_000,
			},
			ratio: 7.5,
		});
		expect(measuredDocument(readDocument(bound))?.baseline.capturedAt).toBe(CLOCK + 30_000);
		expect(readDocument(bound)?.ratio).toBe(7.5);

		// It keeps sampling from the adopted anchor: 70 − 20 = 50 over 9 − 2 = 7, where its own 0% / 0%
		// anchor would have measured 70 / 9. That refinement is this instance's own, so it lands beside
		// the peer's baseline rather than replacing it.
		bound.clock.now = CLOCK + 120_000;
		await bound.runtime.estimate.observe(pair([70, BASELINE.fiveHourResetsAt], [9, BASELINE.weeklyResetsAt]));
		expect(measuredDocument(readDocument(bound))).toEqual({
			baseline: {
				capturedAt: CLOCK + 30_000,
				fiveHour: { usedPercent: 20, resetsAt: BASELINE.fiveHourResetsAt },
				weekly: { usedPercent: 2, resetsAt: BASELINE.weeklyResetsAt },
			},
			ratio: 7.1429,
		});
	});

	test("an older baseline on disk is superseded, and its known ratio is never dropped to nothing", async () => {
		const bound = await bindEstimate();
		await bound.runtime.estimate.observe(pair([0, BASELINE.fiveHourResetsAt], [0, BASELINE.weeklyResetsAt]));

		// The document holds an older anchor and a ratio this instance never learned, as an instance
		// that stopped writing a minute ago would leave it.
		writeFileSync(
			bound.estimateFile,
			documentText(
				{ fiveHourPercent: 5, weeklyPercent: 1, capturedAt: CLOCK - 60_000, ...BASELINE_RESETS },
				20,
			),
			"utf8",
		);

		// The five-hour window rolled over, so this reading rebaselines instead of sampling and a new
		// baseline is written at once — while the ratio this instance has none of is the document's,
		// never nothing.
		const rolledReset = BASELINE.fiveHourResetsAt + FIVE_HOUR_MS;
		bound.clock.now = CLOCK + 30_000;
		await bound.runtime.estimate.observe(pair([4, rolledReset], [1, BASELINE.weeklyResetsAt]));
		expect(measuredDocument(readDocument(bound))).toEqual({
			baseline: {
				capturedAt: CLOCK + 30_000,
				fiveHour: { usedPercent: 4, resetsAt: rolledReset },
				weekly: { usedPercent: 1, resetsAt: BASELINE.weeklyResetsAt },
			},
			ratio: 20,
		});
		expect(bound.runtime.estimate.state().ratio).toBe(20);
	});

	test("equal capture instants leave the writing instance's measurement in the document", async () => {
		const bound = await bindEstimate();
		await bound.runtime.estimate.observe(pair([0, BASELINE.fiveHourResetsAt], [0, BASELINE.weeklyResetsAt]));

		// A peer anchored in the same tick as this instance, on its own percentages and ratio.
		writeFileSync(
			bound.estimateFile,
			documentText({ fiveHourPercent: 30, weeklyPercent: 1, capturedAt: CLOCK, ...BASELINE_RESETS }, 3.3),
			"utf8",
		);

		// Neither capture instant is the newer one, so this instance's own measurement is what lands:
		// the peer's 3.3 is not what the document ends up holding.
		bound.clock.now = CLOCK + 61_000;
		await bound.runtime.estimate.observe(pair([50, BASELINE.fiveHourResetsAt], [5, BASELINE.weeklyResetsAt]));
		expect(measuredDocument(readDocument(bound))).toEqual({
			baseline: {
				capturedAt: CLOCK,
				fiveHour: { usedPercent: 0, resetsAt: BASELINE.fiveHourResetsAt },
				weekly: { usedPercent: 0, resetsAt: BASELINE.weeklyResetsAt },
			},
			ratio: 10,
		});
	});
});

/** The two reset instants the seeded documents below state, in epoch milliseconds. */
const BASELINE_RESETS = {
	fiveHourResetsAt: BASELINE.fiveHourResetsAt,
	weeklyResetsAt: BASELINE.weeklyResetsAt,
};

describe("a restart continues the measurement the document carries (P66)", () => {
	test("a restarted process shows the stored ratio and keeps sampling from the stored baseline", async () => {
		const first = await bindEstimate();
		await first.runtime.estimate.observe(pair([0, BASELINE.fiveHourResetsAt], [0, BASELINE.weeklyResetsAt]));
		first.clock.now = CLOCK + 61_000;
		await first.runtime.estimate.observe(pair([51, BASELINE.fiveHourResetsAt], [5.1, BASELINE.weeklyResetsAt]));
		expect(measuredDocument(readDocument(first))?.ratio).toBe(10);

		// The restart's own startup answer reports 40% / 8%, which qualifies nothing against the stored
		// baseline and is not what it measures from: the stored ratio is shown without relearning, and
		// `left` follows the weekly percent this display shows — (100 − 8) / 100 × 10 = 9.2.
		let reply: () => Response = () => codexAnswer(40, 8);
		const restarted = await bindEstimate({ root: first.root, answer: () => reply() });
		expect(restarted.runtime.presentation.estimate()).toEqual({
			ratio: 10,
			left: expect.closeTo(9.2, 6),
			text: "left≈9.2×5h · ratio≈10.0",
		});

		// Sampling continues from the stored 0% / 0% anchor: 90 − 0 = 90 over 13 − 0 = 13 reads 6.9231,
		// where re-anchoring on the 40% / 8% startup report would have measured 50 / 5.
		reply = () => codexAnswer(90, 13);
		restarted.clock.now = CLOCK + 180_000;
		report(restarted, CLOCK + 180_000);
		await drain();
		const estimate = restarted.runtime.presentation.estimate();
		expect(estimate?.ratio).toBeCloseTo(6.9231, 3);
		expect(estimate?.text).toBe("left≈6.0×5h · ratio≈6.9");
	});
});

describe("a document that is not this measurement reads as a first run (P66)", () => {
	const written = JSON.parse(documentText(BASELINE, 6.7)) as { baseline: Record<string, unknown> };

	const shapes: readonly (readonly [string, string])[] = [
		["a document whose baseline is not an object", JSON.stringify({ baseline: 7, ratio: 6.7 })],
		["a document whose ratio is not a number", JSON.stringify({ baseline: written.baseline, ratio: "6.7" })],
		["a used percent above one hundred", documentText({ ...BASELINE, fiveHourPercent: 101 }, 6.7)],
		["a used percent below zero", documentText({ ...BASELINE, weeklyPercent: -1 }, 6.7)],
		[
			"a malformed capture instant",
			JSON.stringify({ baseline: { ...written.baseline, capturedAt: "yesterday" }, ratio: 6.7 }),
		],
		["a capture instant in the future", documentText({ ...BASELINE, capturedAt: CLOCK + DAY_MS }, 6.7)],
		["a zero ratio", documentText(BASELINE, 0)],
		["a previous shape this measurement never wrote", JSON.stringify({ base: BASELINE, ratio: 6.7 })],
	];

	for (const [description, contents] of shapes) {
		test(`${description} is not a measurement, and the next qualifying pair republishes one`, async () => {
			const root = mkdtempSync(path.join(tmpdir(), "model-cost-estimate-"));
			roots.push(root);
			writeFileSync(path.join(root, ESTIMATE_FILE), contents, "utf8");

			const bound = await bindEstimate({ root });
			expect(bound.runtime.estimate.state()).toEqual({});

			// The reading that anchors is this process's own, and the sample after it republishes the
			// measurement into the document the foreign shape occupied.
			await bound.runtime.estimate.observe(pair([10, BASELINE.fiveHourResetsAt], [2, BASELINE.weeklyResetsAt]));
			bound.clock.now = CLOCK + 61_000;
			await bound.runtime.estimate.observe(pair([60, BASELINE.fiveHourResetsAt], [7, BASELINE.weeklyResetsAt]));
			expect(measuredDocument(readDocument(bound))).toEqual({
				baseline: {
					capturedAt: CLOCK,
					fiveHour: { usedPercent: 10, resetsAt: BASELINE.fiveHourResetsAt },
					weekly: { usedPercent: 2, resetsAt: BASELINE.weeklyResetsAt },
				},
				ratio: 10,
			});
		});
	}

	test("text that is not JSON is never overwritten, and the measurement carries on in memory", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "model-cost-estimate-"));
		roots.push(root);
		writeFileSync(path.join(root, ESTIMATE_FILE), '{"baseline": {"fiveHour":', "utf8");

		const bound = await bindEstimate({ root });
		expect(bound.runtime.estimate.state()).toEqual({});

		// The pair qualifies in memory, and the document it cannot read is left exactly as it was: the
		// framework refuses to publish over text that is not a document, and nothing rejects out of the
		// measurement for it.
		await bound.runtime.estimate.observe(pair([10, BASELINE.fiveHourResetsAt], [2, BASELINE.weeklyResetsAt]));
		bound.clock.now = CLOCK + 61_000;
		await bound.runtime.estimate.observe(pair([60, BASELINE.fiveHourResetsAt], [7, BASELINE.weeklyResetsAt]));
		expect(bound.runtime.estimate.state().ratio).toBe(10);
		expect(readFileSync(bound.estimateFile, "utf8")).toBe('{"baseline": {"fiveHour":');
	});
});
