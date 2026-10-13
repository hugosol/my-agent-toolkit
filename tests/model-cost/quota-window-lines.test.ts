/**
 * The allowance-window lines the display reads (P65, P67; S2).
 *
 * The seam under test is the extension's own read-only display result: the runtime is the production
 * one, bound through the framework's public binding, and what a case reads is what a frontend reads —
 * `runtime.presentation.quotaLines(width)`. Every window below arrives the way a real one does, from
 * the account API's own startup answer or from one response's rate-limit headers, so nothing here is
 * asserted about a state the extension cannot reach.
 *
 * The clock is this file's own literal, and every figure below is arithmetic on it: the percentages,
 * the pace each window is measured against (how much of its own span has passed), the countdowns (the
 * five-hour window counts in minutes, the weekly one in hours) and the reset's own state. The one
 * machine-dependent part — the absolute instant written beside the countdown, which the display draws
 * on the operator's own clock, exactly as the bar always did — is checked by parsing it back and
 * comparing the instant it names with the instant the report stated, rather than by restating the
 * format.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { MODEL_COST } from "../../extensions/model-cost/definition";
import type { DisplayLine } from "../../extensions/model-cost/shared-logic/presentation/display";
import { lineText } from "../../extensions/model-cost/shared-logic/presentation/display";
import type { ModelPricingData } from "../../extensions/model-cost/shared-logic/model-data";
import { type ModelCostRuntime, createModelCostRuntime } from "../../extensions/model-cost/shared-logic/runtime";
import type { ProviderAccess, ProviderAccessFacts, SessionFacts, TurnOutcome, TurnSignal } from "../../framework/core/protocol";
import type { HttpRequestOptions } from "../../framework/modules/http";
import { type PortDouble, portDouble } from "../framework/support/harness-port-double";

/** The self-made pricing data: this suite reads the allowance windows, not a price. */
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
const MAIN: SessionFacts = { sessionId: "session-windows", kind: "main", unavailable: [] };
const OWNER = { kind: "owner", key: "main:window-lines" } as const;

/** The instant every case reads the windows at, and the reports' own reset instants are arithmetic on. */
const CLOCK = 1_700_000_000_000;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** The five-hour window resets an hour after the clock; its span has therefore run 4 of its 5 hours. */
const FIVE_HOUR_RESET_AT = CLOCK + HOUR_MS;
/** The weekly window resets three and a half days after the clock: half of its seven days has passed. */
const WEEKLY_RESET_AT = CLOCK + 84 * HOUR_MS;

const CODEX = "openai-codex";
const TOKEN = "header.payload.signature";

/** Every root this file created, removed after each case. */
const roots: string[] = [];

/** One bound instance and the facts a case drives it with. */
interface BoundWindows {
	readonly runtime: ModelCostRuntime;
	readonly double: PortDouble;
	readonly sent: { readonly url: string; readonly options: HttpRequestOptions | undefined }[];
}

/**
 * One instance over a root of its own, with the harness's provider access and the startup query
 * substituted, so the windows below arrive from reports this file wrote rather than from a service.
 */
async function bindWindows(options: { readonly answer?: () => Response } = {}): Promise<BoundWindows> {
	const root = mkdtempSync(path.join(tmpdir(), "model-cost-window-lines-"));
	roots.push(root);
	const sent: { readonly url: string; readonly options: HttpRequestOptions | undefined }[] = [];
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
		providerAccess: access,
		now: () => CLOCK,
		httpRequest: async (url, httpOptions) => {
			sent.push({ url, options: httpOptions });
			return options.answer?.() ?? new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } });
		},
	});
	const double = portDouble();
	double.bind(MODEL_COST, {
		factory: () => runtime.implementation,
		config: { reader: () => `storageDir: ${root}\nbalanceTtlMs: 30000\n` },
	});
	double.deliverSession(OWNER, { session: MAIN });
	await double.initiateRun(OWNER);
	return { runtime, double, sent };
}

/** One window's rate-limit headers as a response carries them, with its reset stated in seconds. */
function windowHeaders(
	slot: "primary" | "secondary",
	usedPercent: string,
	minutes: number,
	resetAtSeconds?: number,
): Record<string, string> {
	return {
		[`x-codex-${slot}-used-percent`]: usedPercent,
		[`x-codex-${slot}-window-minutes`]: String(minutes),
		...(resetAtSeconds === undefined ? {} : { [`x-codex-${slot}-reset-at`]: String(resetAtSeconds) }),
	};
}

/** Both windows of one report, as one batch of headers: 85 of the five-hour and 75 of the weekly. */
function bothWindows(resets: { readonly fiveHour?: number; readonly weekly?: number } = {}): Record<string, string> {
	return {
		...windowHeaders("primary", "85", 300, resets.fiveHour ?? FIVE_HOUR_RESET_AT / 1000),
		...windowHeaders("secondary", "75", 10_080, resets.weekly ?? WEEKLY_RESET_AT / 1000),
	};
}

/** One whole Codex exchange: its start facts, its response's headers and its settled response. */
function report(bound: BoundWindows, headers: Readonly<Record<string, string>>): void {
	const session: SessionFacts = { sessionId: "session-codex", kind: "main", unavailable: [] };
	bound.double.deliverTurn(
		{ kind: "request_started", session, at: CLOCK, provider: CODEX, model: "gpt-6-luna" } as TurnSignal,
		{ owner: OWNER },
	);
	bound.double.deliverTurn(
		{ kind: "response_received", session, http: { status: 200, headers } } as TurnSignal,
		{ owner: OWNER },
	);
	bound.double.deliverTurn(
		{
			kind: "response_settled",
			session,
			at: CLOCK + 1_000,
			outcome: "completed" as TurnOutcome,
			readings: [],
		} as TurnSignal,
		{ owner: OWNER },
	);
}

/** The one line of one window kind, or nothing when the display drew none for it. */
function lineOf(lines: readonly DisplayLine[], index: number): DisplayLine {
	const line = lines[index];
	if (line === undefined) throw new Error(`no line at ${index}`);
	return line;
}

/**
 * The absolute instant a line states, parsed back into the instant it names on this machine's own
 * clock: the display writes the operator's local calendar text, which is what this decodes.
 */
function absoluteInstantOf(text: string, year: number): number | undefined {
	const shown = /\((\d{2})\/(\d{2}) (\d{2}):(\d{2})\)$/.exec(text);
	if (shown === null) return undefined;
	const [, month, day, hours, minutes] = shown;
	return new Date(`${year}-${month}-${day}T${hours}:${minutes}`).getTime();
}

afterEach(() => {
	while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true });
});

describe("both windows are drawn with the bar, the pace they have run at, and their reset (P65, P67)", () => {
	test("the five-hour window counts its reset in minutes and the weekly one in hours", async () => {
		const bound = await bindWindows();
		report(bound, bothWindows());
		const lines = bound.runtime.presentation.quotaLines(200);
		const fiveHour = lineOf(lines, 0);
		const weekly = lineOf(lines, 1);
		const fiveHourText = lineText(fiveHour);
		const weeklyText = lineText(weekly);
		const year = new Date(CLOCK).getFullYear();

		// 85 of the five-hour window's own span is used while 4 of its 5 hours have run, so it leads its
		// own clock by 5 points and is drawn in the pacing colour that band calls for; its reset is an
		// hour away and is counted in minutes.
		expect(fiveHourText.startsWith("5h \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2502\u2500\u2500\u2500 85.0% / 80.0%")).toBe(true);
		expect(fiveHourText).toContain("resets in 1h (");
		expect(fiveHourText).not.toContain("estimating");
		const fiveHourShown = absoluteInstantOf(fiveHourText, year);
		expect(fiveHourShown === undefined ? undefined : Math.abs(fiveHourShown - FIVE_HOUR_RESET_AT)).toBeLessThan(MINUTE_MS);
		expect(fiveHour.filter(piece => piece.emphasis === "success").map(piece => piece.text)).toEqual([
			"\u2501".repeat(16),
			"85.0%",
		]);

		// 75 of the weekly window against the half of its own week that has run is 25 points ahead, one
		// band further; its reset is three and a half days away, counted in hours; and the ratio
		// measurement rides on this line alone, which is the line it has always ridden on.
		expect(weeklyText.startsWith("7d \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2502\u2501\u2501\u2501\u2501\u2500\u2500\u2500\u2500\u2500 75.0% / 50.0% \u00B7 estimating\u2026")).toBe(true);
		expect(weeklyText).toContain("resets in 3d 12h (");
		const weeklyShown = absoluteInstantOf(weeklyText, year);
		expect(weeklyShown === undefined ? undefined : Math.abs(weeklyShown - WEEKLY_RESET_AT)).toBeLessThan(MINUTE_MS);
		expect(weekly.filter(piece => piece.emphasis === "warning").map(piece => piece.text)).toEqual([
			"\u2501".repeat(10),
			"\u2501".repeat(4),
			"75.0%",
			" \u00B7 estimating\u2026",
		]);
	});

	test("an unreported window is said to be unreported, with the attempt's own reason beside it", async () => {
		const bound = await bindWindows({ answer: () => new Response("", { status: 500 }) });

		// The startup attempt answered with no window in it: both lines are the wording for a window
		// nobody reported, labeled once, and the sanitized reason rides along.
		const text = bound.runtime.presentation.quotaLines(200).map(lineText);
		expect(text).toEqual(["5h limit not reported \u00B7 unreadable", "7d limit not reported \u00B7 unreadable"]);
	});

	test("a window the report itself left out is unreported while the other one is drawn", async () => {
		const bound = await bindWindows();
		report(bound, windowHeaders("primary", "42", 300, FIVE_HOUR_RESET_AT / 1000));

		// Only one window ever arrived: the weekly line says so rather than being drawn as an empty
		// window, and the five-hour one is the reading it is.
		const text = bound.runtime.presentation.quotaLines(200).map(lineText);
		expect(text[1]).toBe("7d limit not reported");
		expect(text[0]).toContain("42.0%");
	});
});

describe("the state a reset instant is in is what the line says (P67)", () => {
	test("a reset the source never stated reads as unknown", async () => {
		const bound = await bindWindows();
		report(bound, windowHeaders("primary", "42", 300));
		const fiveHour = lineOf(bound.runtime.presentation.quotaLines(200), 0);

		// No reset instant at all: no bar marker can be placed and no time percentage can be stated — the
		// line says so the way it always has, with the bare dashes — so the pace is written in the muted
		// colour and the line says the reset is unknown.
		expect(lineText(fiveHour)).toBe("5h \u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 42.0% / --% \u00B7 reset unknown");
		expect(fiveHour.filter(piece => piece.emphasis === "muted").map(piece => piece.text)).toEqual(["\u2501".repeat(8), "42.0%"]);
	});

	test("a reset instant already past reads as expired, and one beyond the window as invalid", async () => {
		const expired = await bindWindows();
		report(expired, windowHeaders("primary", "42", 300, (CLOCK - MINUTE_MS) / 1000));
		const expiredLine = lineText(lineOf(expired.runtime.presentation.quotaLines(200), 0));
		const year = new Date(CLOCK).getFullYear();
		expect(expiredLine).toContain("\u00B7 reset expired (");
		const expiredShown = absoluteInstantOf(expiredLine, year);
		expect(expiredShown === undefined ? undefined : Math.abs(expiredShown - (CLOCK - MINUTE_MS))).toBeLessThan(MINUTE_MS);

		// One millisecond past the window's own length is no longer a reset of that window: it is
		// reported as invalid rather than silently accepted as a valid countdown.
		const invalid = await bindWindows();
		report(invalid, windowHeaders("primary", "42", 300, (CLOCK + 5 * HOUR_MS + 1) / 1000));
		const invalidLine = lineText(lineOf(invalid.runtime.presentation.quotaLines(200), 0));
		expect(invalidLine).toContain("\u00B7 reset invalid (");
		const invalidShown = absoluteInstantOf(invalidLine, year);
		expect(invalidShown === undefined ? undefined : Math.abs(invalidShown - (CLOCK + 5 * HOUR_MS + 1))).toBeLessThan(MINUTE_MS);
	});
});

describe("a line that does not fit is drawn in the next form down (P67)", () => {
	test("the bar goes first, then the absolute instant, and a line too narrow is cut", async () => {
		const bound = await bindWindows();
		report(bound, bothWindows());
		const at = (width: number): string => lineText(lineOf(bound.runtime.presentation.quotaLines(width), 0));

		// Wide enough for everything: the bar, the two percentages and the reset's absolute instant.
		expect(at(80)).toContain("\u2502");

		// The bar goes first, and the absolute instant goes with it before the countdown does: the
		// countdown alone is what an operator acts on, and the instant beside it is what the report
		// stated, read on this machine's own clock.
		const absolute = at(50);
		expect(absolute.startsWith("5h 85.0% / 80.0% \u00B7 resets in 1h (")).toBe(true);
		const absoluteShown = absoluteInstantOf(absolute, new Date(CLOCK).getFullYear());
		expect(absoluteShown === undefined ? undefined : Math.abs(absoluteShown - FIVE_HOUR_RESET_AT)).toBeLessThan(MINUTE_MS);
		expect(at(40)).toBe("5h 85.0% / 80.0% \u00B7 resets in 1h");

		// The percentages alone still fit; below them the line is cut to the width it was drawn at.
		expect(at(20)).toBe("5h 85.0% / 80.0%");
		expect(at(10)).toBe("5h 85.0% \u2026");
	});
});
