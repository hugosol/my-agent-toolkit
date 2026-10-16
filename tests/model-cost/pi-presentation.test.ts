/**
 * The pi frontend's own drawing: the form the run gives it, the colours its host's theme paints, the
 * column layout at the widths a terminal really has, and whose facts it draws (P43, P44, P46; S2).
 *
 * The seam under test is production: the extension's real definition is bound through the framework's
 * public binding (the port double), the runtime is the one `createModelCostRuntime` builds over a
 * self-made two-level agent tree, and what a case reads is what the operator's own terminal is handed
 * — the production `attachModelCostWidget`, driven through a *controlled pi surface* that records
 * every hand-over and, for the component form, asks the component for its lines at a width with a
 * theme of its own.
 *
 * What this suite adds to the frontend's other suites is the half only a terminal owns, which no
 * text-level assertion can reach:
 *
 * - **The two forms.** pi's `tui` run takes a component — the CLI draws it itself, at the viewport
 *   width and with the theme of the moment, and caps no number of lines — while every other run takes
 *   plain lines, because pi's RPC mode states outright that it ignores a component factory.
 * - **The column layout.** The detail tree's rows are laid out per kind and depth, so a case reads the
 *   display column each field of a group starts at, and what a narrow width does to a name, to a
 *   startup snapshot and to the figures beside them.
 * - **Whose facts are drawn.** pi publishes no viewed-session outlet, so the displayed session is the
 *   session a binding serves; a second binding over the same process runtime — what a spawned session
 *   of the same process is — draws its own session's readings and moves nothing of the first's.
 *
 * Every figure below is arithmetic on this file's own document, its own price list and its own clock:
 * the two buckets of a settled Turn are priced from the tier's own rates, the cached share is the
 * share of the conversation input, and the ratio is the priced buckets' own proportions. Nothing here
 * is read back from the implementation it is asserted against.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { MODEL_COST } from "../../extensions/model-cost/definition";
import {
	attachModelCostWidget,
	textColumns,
} from "../../extensions/model-cost/harnesses/pi/widget";
import type { ConsumptionDocument } from "../../extensions/model-cost/shared-logic/consumption-document";
import type { ModelPricingData } from "../../extensions/model-cost/shared-logic/model-data";
import type { ModelCostRuntime } from "../../extensions/model-cost/shared-logic/runtime";
import { createModelCostRuntime } from "../../extensions/model-cost/shared-logic/runtime";
import type { OwnerReference, SessionFacts, TurnUsage } from "../../framework/core/protocol";
import { type PortDouble, portDouble } from "../framework/support/harness-port-double";
import { type ControlledPiSurface, type HostSession, controlledPiSurface } from "./support/pi-host";
import { uiBoundaryTimerOf } from "./support/ui-timer";

/** The self-made price list: one monetary tier and one pair with no amount policy at all. */
const DATA: ModelPricingData = {
	currency: "XTS",
	unit: "XTS per million tokens",
	peakMultiplier: 3,
	zoneOffsetMinutes: 8 * 60,
	peakWindows: [{ fromMinute: 9 * 60, toMinute: 12 * 60 }],
	tiers: { alpha: { input: 2, cacheRead: 0.5, output: 8 } },
	allowanceProviders: [],
	models: {
		official: { "model-alpha": { mode: "monetary", tier: "alpha" } },
		"go-provider": { "model-alpha": { mode: "token-only" } },
	},
};

const HARNESS = "pi-presentation-harness";
const MAIN: SessionFacts = { sessionId: "session-main", kind: "main", name: "主会话", unavailable: [] };
const CHILD: SessionFacts = { sessionId: "session-child", kind: "sub", name: "子代理一号", unavailable: [] };
const OWNER: OwnerReference = { kind: "owner", key: "main:pi-presentation" };
const CONSUMPTION_FILE = "consumption.json";

/**
 * The instant every read-time reading is taken at: 11:00 in the price list's own zone, inside its peak
 * window, so the season mark the account line leads with is the peak one.
 */
const CLOCK_AT = Date.parse("2026-10-01T03:00:00.000Z");
/** The instant the one Turn below begins at: 08:00 in that zone, outside the peak window. */
const TURN_AT = Date.parse("2026-10-01T00:00:00.000Z");
/** The Turn's own usage, as the harness reported it: ten input and ten output tokens, nothing cached. */
const TURN_USAGE: TurnUsage = { input: 10, output: 10, cacheRead: 0, cacheWrite: 0, totalTokens: 20 };

/**
 * The document every case draws from: a main session on two pairs, a child session on the monetary one
 * and another on a pair no price list names, and a grandchild under the first child.
 *
 * The figures are the state's own — 0.05 CNY for the main session's priced pair, 0.008 for the child's —
 * so the Total's amount, the accrued line and each row's own amount are arithmetic on what is written
 * here rather than on anything the drawing computed.
 */
const AGENT_TREE = {
	schemaVersion: 1,
	periodId: "period-pi-presentation",
	start: "2026-10-01T00:00:00.000Z",
	holiday: false,
	harnesses: {
		[HARNESS]: {
			sessions: [
				{
					id: "session-main",
					name: "主会话",
					parent: null,
					saveVersion: 1,
					span: { start: TURN_AT, end: TURN_AT + 300_000 },
					own: {
						official: {
							"model-alpha": {
								tokens: { input: 1000, cacheRead: 2000, cacheWrite: 0, output: 3000 },
								costCny: 0.05,
							},
						},
						"go-provider": { "model-alpha": { tokens: { input: 30, cacheRead: 20, cacheWrite: 0, output: 50 } } },
					},
				},
				{
					id: "session-child",
					name: "子代理一号",
					parent: "session-main",
					saveVersion: 1,
					startup: { model: { provider: "official", model: "model-alpha" }, effort: "high" },
					runtimeMs: 480_000,
					own: {
						official: {
							"model-alpha": { tokens: { input: 4000, cacheRead: 0, cacheWrite: 0, output: 1000 }, costCny: 0.008 },
						},
					},
				},
				{
					id: "session-child-b",
					name: "child-b",
					parent: "session-main",
					saveVersion: 1,
					own: {
						// A pair this price list does not name at all: its channel has no display budget, so the
						// reading its own binding publishes is not a context field.
						"mystery-provider": { "mystery-model": { tokens: { input: 10, cacheRead: 0, cacheWrite: 0, output: 10 } } },
					},
				},
				{
					id: "session-grand",
					name: "grand",
					parent: "session-child",
					saveVersion: 1,
					runtimeMs: 0,
					own: { "go-provider": { "model-alpha": { tokens: { input: 5, cacheRead: 0, cacheWrite: 0, output: 5 } } } },
				},
			],
		},
	},
} as unknown as ConsumptionDocument;

/** Every root this file created, removed after each case. */
const roots: string[] = [];

/** The fixture session the main-session cases publish, with the host's own context reading. */
const MAIN_HOST: HostSession = {
	sessionId: MAIN.sessionId,
	name: MAIN.name,
	provider: "official",
	model: "model-alpha",
	effort: "high",
	mode: "tui",
	// The monetary channel's own fixed display budget is 450K, while this host's window is 100K: what a
	// case reads below is which of the two the drawn figure was compared against.
	context: { tokens: 1460, contextWindow: 100_000 },
};

/** The child session's own binding, on the pair whose reading the tree draws beside it. */
const CHILD_HOST: HostSession = {
	sessionId: CHILD.sessionId,
	name: CHILD.name,
	provider: "official",
	model: "model-alpha",
	effort: "high",
	mode: "tui",
	context: { tokens: 90_000, contextWindow: 1_000_000 },
};

/** One run: the runtime every case draws from, the port double that drives it and its storage root. */
interface Fixture {
	readonly runtime: ModelCostRuntime;
	readonly double: PortDouble;
	readonly storageDirectory: string;
}

/**
 * Binds the extension over one baseline document and loads it through the real initialization.
 *
 * The process's own context readings are published as each session's binding would publish them: the
 * child's own reading is what its row draws beside its statistics, and a pair whose channel has no
 * display budget shows no context field at all however readable the reading is.
 */
async function fixture(): Promise<Fixture> {
	const root = mkdtempSync(path.join(tmpdir(), "pi-presentation-"));
	roots.push(root);
	writeFileSync(path.join(root, CONSUMPTION_FILE), JSON.stringify(AGENT_TREE), "utf8");
	const double = portDouble();
	let runtime: ModelCostRuntime | undefined;
	double.bind(MODEL_COST, {
		config: { reader: () => `storageDir: ${root}\nbalanceTtlMs: 30000\ncodexQuotaTtlMs: 15000\n` },
		factory: context => {
			const built = createModelCostRuntime({
				config: { storageDir: root },
				configDirectory: root,
				userHomeDirectory: root,
				harness: HARNESS,
				data: DATA,
				now: () => CLOCK_AT,
				...(context.modelPrices === undefined ? {} : { modelPrices: context.modelPrices }),
			});
			runtime = built;
			return built.implementation;
		},
	});
	double.deliverSession(OWNER, { session: MAIN });
	double.deliverSession(OWNER, { event: { kind: "session_facts" }, session: MAIN });
	await double.initiateRun(OWNER);
	const built = runtime as ModelCostRuntime;
	built.sessionContext.observe(CHILD.sessionId, { tokens: 90_000, provider: "official", model: "model-alpha" });
	built.sessionContext.observe("session-child-b", { tokens: 12_000, provider: "mystery-provider", model: "mystery-model" });
	return { runtime: built, double, storageDirectory: root };
}

/**
 * One Round of the main session with one settled Turn in it, which is what gives the brief a Round row
 * to draw: the framework opens the session's Round at its own edge, and the request settles inside it.
 */
function settleTurn(double: PortDouble): void {
	double.deliverRound(OWNER, { event: { kind: "round_start" }, session: MAIN });
	double.deliverTurn(
		{ kind: "request_started", session: MAIN, at: TURN_AT, provider: "official", model: "model-alpha" },
		{ owner: OWNER },
	);
	double.deliverTurn(
		{ kind: "response_settled", session: MAIN, at: TURN_AT + 60_000, outcome: "completed", readings: [TURN_USAGE] },
		{ owner: OWNER },
	);
}

/** Switches the entry's own preference to the detail form, as the operator's `/budget detail` does. */
async function toDetail(double: PortDouble): Promise<void> {
	await double.runToCompletion("budget", { args: "detail" });
}

/** The lines of one drawn widget in whichever form the host took, at one width. */
function drawingOf(host: ControlledPiSurface, width: number): readonly string[] {
	return host.drawn(width) ?? host.lines() ?? [];
}

/** The display column the given text starts at on one drawn line, in the terminal's own columns. */
function columnOf(line: string, text: string): number {
	const at = line.indexOf(text);
	return at < 0 ? -1 : textColumns(line.slice(0, at));
}

/** Every line of one drawing that carries the given text. */
function linesWith(lines: readonly string[], text: string): readonly string[] {
	return lines.filter(line => line.includes(text));
}

/** The display column one group's first field starts at, from the row of the group that carries it. */
function fieldColumn(lines: readonly string[], rowText: string, label: string): number {
	const row = linesWith(lines, rowText)[0];
	return row === undefined ? -1 : columnOf(row, label);
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("the pi frontend draws in the form the run it serves draws in (P43)", () => {
	test("a terminal run is handed a component, which draws the same business sample at any width", async () => {
		const { runtime, double } = await fixture();
		const host = controlledPiSurface();
		attachModelCostWidget(host.api, runtime, uiBoundaryTimerOf(runtime));
		host.sessionStarts(MAIN_HOST);
		settleTurn(double);

		// The `tui` form is the component: pi's own CLI draws it and asks it for its lines at the
		// viewport width, so the hand-over is a factory rather than text.
		expect(typeof host.last().factory).toBe("function");
		expect(host.last().lines).toBeUndefined();

		const wide = drawingOf(host, 200);
		// The account row of a monetary target: the season mark of the clock's own instant, the fixed
		// budget's bar over the reading this host published (1,460 of the monetary channel's 450K), and
		// the effort the session's own context reports.
		expect(wide[0]).toContain("\u{1F525}");
		expect(wide[0]).toContain("[\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591   0% (1,460/450.0K)]  Effort: high");
		// The accrued line is the whole saved period's, in its own currency: 0.05 + 0.008, which the
		// amount rule writes as two decimals.
		expect(wide[0]).toContain("\u23F3 Accrued: \u00A50.06");
		// The Total is the target's own current pair and the whole main tree's amounts, spanned. The
		// settled Turn's own ten input and ten output tokens are part of the current scope's cached share
		// (2,000 of 1,010 + 2,000), and the span is the one its record carries from the period's own start
		// to the end this Turn just observed.
		const total = wide.find(line => line.startsWith("Total:")) as string;
		expect(total).toContain("Cache: 66%");
		expect(total).toContain("\u00A5Cache/In/Out\uFF1A4:7:89");
		expect(total).toContain("Cost: \u00A50.06");
		expect(total).toContain("Span: 0:01:00");
		// The brief draws the Round the settled Turn opened, from the same columns: that Round's own
		// additions alone, ten input and ten output at the tier's own rates — an exact 0:20:80.
		const round = wide.find(line => line.startsWith("Round:")) as string;
		expect(round).toContain("Cache: 0%");
		expect(round).toContain("\u00A5Cache/In/Out\uFF1A0:20:80");
		expect(round).toContain("Cost: \u00A50.0001");
		// No tree in the brief: the root's rows are the detail form's own content.
		expect(linesWith(wide, "official / model-alpha")).toEqual([]);
	});

	test("a run that is not a terminal is handed the plain text of the same lines", async () => {
		const { runtime } = await fixture();
		const host = controlledPiSurface();
		attachModelCostWidget(host.api, runtime, uiBoundaryTimerOf(runtime));
		host.sessionStarts({ ...MAIN_HOST, mode: "rpc" });

		// pi's own RPC mode states that it ignores a component factory, so a component handed there
		// would draw nothing at all: the form is the text one, and no colour code is in it.
		expect(host.last().factory).toBeUndefined();
		const lines = host.lines() as readonly string[];
		expect(lines[0]).toContain("   0% (1,460/450.0K)]  Effort: high");
		expect(lines.some(line => line.startsWith("Total:"))).toBe(true);
		expect(lines.join("\n")).not.toContain("\u001B");
	});

	test("every other run mode pi states takes the text form too", async () => {
		const { runtime } = await fixture();
		for (const mode of ["rpc", "json", "print"] as const) {
			const host = controlledPiSurface();
			attachModelCostWidget(host.api, runtime, uiBoundaryTimerOf(runtime));
			host.sessionStarts({ ...MAIN_HOST, mode });
			expect(host.last().factory).toBeUndefined();
			expect(host.lines()).toBeDefined();
		}
		const noMode = controlledPiSurface();
		attachModelCostWidget(noMode.api, runtime, uiBoundaryTimerOf(runtime));
		// A host that publishes no mode at all is not a host this frontend may hand a component to.
		noMode.sessionStarts({ ...MAIN_HOST, mode: undefined });
		expect(noMode.last().factory).toBeUndefined();
		expect(noMode.lines()).toBeDefined();
	});
});

describe("the component form paints the display's own emphases with the host's theme (P43)", () => {
	test("the budget band, the accrued palette and the effort level are the theme's own colours", async () => {
		const { runtime } = await fixture();
		const host = controlledPiSurface();
		attachModelCostWidget(host.api, runtime, uiBoundaryTimerOf(runtime));
		host.sessionStarts(MAIN_HOST);
		drawingOf(host, 200);

		// 1,460 of 450K is 0.32%, which is the bar's lowest band; the period's two priced sessions are
		// the palette's first two shades; and the effort value is the one piece coloured by its own level.
		const paints = host.paints();
		expect(
			paints.some(paint => paint.call === "fg" && paint.name === "dim" && paint.text.includes("0% (1,460/450.0K)")),
		).toBe(true);
		expect(paints.some(paint => paint.call === "fg" && paint.name === "success")).toBe(true);
		expect(paints.some(paint => paint.call === "fg" && paint.name === "warning")).toBe(true);
		expect(paints.some(paint => paint.call === "thinking" && paint.name === "high" && paint.text === "high")).toBe(true);
	});
});

describe("the detail tree aligns within a depth and keeps every figure at the widths a terminal has (P43)", () => {
	test("rows of one kind and depth state each field at one column, measured in terminal columns", async () => {
		const { runtime, double } = await fixture();
		const host = controlledPiSurface();
		attachModelCostWidget(host.api, runtime, uiBoundaryTimerOf(runtime));
		host.sessionStarts(MAIN_HOST);
		await toDetail(double);

		const lines = drawingOf(host, 200);
		// The root's own model rows are one group: the two pairs of that one session, whose names differ
		// in width, state their cache column at the same column.
		expect(fieldColumn(lines, "official / model-alpha", "Cache: ")).toBe(fieldColumn(lines, "go-provider / model-alpha", "Cache: "));
		// Each row states its own scope's figures: the priced pair carries its amount, the pair with no
		// amount policy carries its usage alone. 0.05 CNY and 20 of 50 cache reads are the document's own
		// numbers.
		const modelRows = linesWith(lines, "model-alpha");
		expect(modelRows.some(line => line.includes("official / model-alpha") && line.includes("Cost: \u00A50.05"))).toBe(true);
		expect(
			modelRows.some(
				line => line.includes("go-provider / model-alpha") && line.includes("Cache: 40%") && !line.includes("Cost:"),
			),
		).toBe(true);

		// One depth's sessions are a group of their own: the Chinese name's columns are the columns it
		// really draws in — 10 for its five wide characters — so both rows of that depth start their
		// fields at column 2 + 10 + 2, and a layout counting characters would start them at 2 + 5 + 2.
		expect(fieldColumn(lines, "\u5B50\u4EE3\u7406\u4E00\u53F7", "official/model-alpha")).toBe(14);
		expect(fieldColumn(lines, "child-b", "?(?)")).toBe(14);
		expect(fieldColumn(lines, "\u5B50\u4EE3\u7406\u4E00\u53F7", "Cost: ")).toBe(14 + textColumns("official/model-alpha(high)") + 2);
		// A grandchild's own depth shares no column with its parent's group: its row starts its fields at
		// its own depth's column.
		const grand = linesWith(lines, "grand")[0] as string;
		expect(columnOf(grand, "?(?)")).toBe(4 + textColumns("grand") + 2);

		// A row's own facts: the session's started-on snapshot, its own amount, the context its binding
		// published against its own channel's budget, and the runtime its executions were measured at.
		const child = linesWith(lines, "Cost: \u00A50.0080")[0] as string;
		expect(child).toContain("official/model-alpha(high)");
		expect(child).toContain("Ctx: 20% (90,000/450.0K)");
		expect(child).toContain("Run: 8m");
		// A reading published for a pair whose channel has no display budget is not a context field, and a
		// session no binding ever reported has none either: one Ctx field is drawn in this whole tree.
		expect(linesWith(lines, "Ctx:")).toEqual([expect.stringContaining("90,000")]);
		// An unavailable runtime is its own marker, written where a measured zero is written as zero, and
		// a session nothing proved about began on `?` rather than on what it runs now.
		expect(linesWith(lines, "Run: \u2014")).toHaveLength(1);
		expect(linesWith(lines, "Run: 0ms")).toHaveLength(1);
		expect(linesWith(lines, "?(?)").length).toBe(2);
	});
});

describe("a narrow terminal narrows names and snapshots and keeps the figures whole (P43)", () => {
	test("a name and a snapshot are abbreviated, and every figure of the drawing survives", async () => {
		const { runtime, double } = await fixture();
		const host = controlledPiSurface();
		attachModelCostWidget(host.api, runtime, uiBoundaryTimerOf(runtime));
		host.sessionStarts(MAIN_HOST);
		await toDetail(double);

		const lines = drawingOf(host, 60);
		const joined = lines.join("\n");
		// Nothing is handed over wider than the terminal it is drawn in.
		expect(lines.reduce((widest, line) => Math.max(widest, textColumns(line)), 0)).toBeLessThanOrEqual(60);
		// The name and the model half of the snapshot give way, and both say they were cut; the level the
		// session began on stays whole.
		expect(joined).toContain("\u2026");
		expect(joined).toContain("(high)");
		// Every figure the tree carries is still drawn somewhere: the rows' own amounts, each session's
		// context reading against its channel's budget, and each runtime marker of its own.
		for (const figure of [
			"Cost: \u00A50.05",
			"Cost: \u00A50.0080",
			"Ctx: 20% (90,000/450.0K)",
			"Run: 8m",
			"Run: \u2014",
			"Run: 0ms",
		]) {
			expect(joined).toContain(figure);
		}
		// The reading published for a pair whose channel has no display budget is still no context field
		// at all: the tree draws one Ctx, the child's.
		expect(linesWith(lines, "Ctx:")).toHaveLength(1);
		expect(joined).not.toContain("12,000");
	});

	test("a width too narrow for a group's fields wraps them whole rather than cutting a figure", async () => {
		const { runtime, double } = await fixture();
		const host = controlledPiSurface();
		attachModelCostWidget(host.api, runtime, uiBoundaryTimerOf(runtime));
		host.sessionStarts(MAIN_HOST);
		await toDetail(double);

		const lines = drawingOf(host, 30);
		expect(lines.reduce((widest, line) => Math.max(widest, textColumns(line)), 0)).toBeLessThanOrEqual(30);
		// Every field the rows carry is still there: the group wrapped at one break for all of its rows,
		// the continuation lines' own indent gave way to the fields, and no figure was cut.
		const joined = lines.join("\n");
		for (const figure of ["Cost: \u00A50.0080", "Ctx: 20% (90,000/450.0K)", "Run: 8m", "Cost: \u00A50.05"]) {
			expect(joined).toContain(figure);
		}
	});

	test("the same width draws the same lines again, and a wider one is a fresh layout", async () => {
		const { runtime, double } = await fixture();
		const host = controlledPiSurface();
		attachModelCostWidget(host.api, runtime, uiBoundaryTimerOf(runtime));
		host.sessionStarts(MAIN_HOST);
		await toDetail(double);

		const narrow = drawingOf(host, 60);
		expect(drawingOf(host, 200)).toEqual(drawingOf(host, 200));
		expect(drawingOf(host, 60)).toEqual(narrow);
	});
});

describe("the context drawn is the session's own public reading against its own channel's budget (P44)", () => {
	test("a host's context window is not the budget the bar and the rows are read against", async () => {
		const { runtime, double } = await fixture();
		const host = controlledPiSurface();
		attachModelCostWidget(host.api, runtime, uiBoundaryTimerOf(runtime));
		// This host reports a window of 100K while the monetary channel's own fixed display budget is
		// 450K: the bar is the display's budget's, never the window the host happens to report.
		host.sessionStarts(MAIN_HOST);
		await toDetail(double);

		const lines = drawingOf(host, 200);
		expect(lines.join("\n")).toContain("0% (1,460/450.0K)");
		expect(lines.join("\n")).not.toContain("100K");
		// The descendant's reading is the one it published for its own model, against the same channel's
		// fixed budget: 90,000 of 450K, and the label is the display's own.
		expect(linesWith(lines, "Cost: \u00A50.0080")[0]).toContain("Ctx: 20% (90,000/450.0K)");
	});

	test("drawing reads no file and writes none: the storage root keeps its own bytes", async () => {
		const { runtime, double, storageDirectory } = await fixture();
		const host = controlledPiSurface();
		attachModelCostWidget(host.api, runtime, uiBoundaryTimerOf(runtime));
		host.sessionStarts(MAIN_HOST);
		await toDetail(double);
		const before = readFileSync(path.join(storageDirectory, CONSUMPTION_FILE));

		drawingOf(host, 80);
		drawingOf(host, 200);
		host.sessionStarts({ ...MAIN_HOST, context: { tokens: null, contextWindow: 450_000 } });
		const unknown = drawingOf(host, 100);

		expect(readFileSync(path.join(storageDirectory, CONSUMPTION_FILE)).equals(before)).toBe(true);
		// The reading a null token count states is no reading: the bar is not drawn at all, while the
		// season mark the account row leads with is.
		expect(unknown[0] as string).toContain("\u{1F525}");
		expect(unknown[0] as string).not.toContain("%");
	});
});

describe("the displayed target is the session a binding serves (P46)", () => {
	test("a second session's own binding draws its own facts and moves nothing of the first's", async () => {
		const { runtime, double } = await fixture();
		const main = controlledPiSurface();
		const child = controlledPiSurface();
		// One process, one UI: the second binding registers with the same wait rather than a second one.
		const uiBoundaryTimer = uiBoundaryTimerOf(runtime);
		attachModelCostWidget(main.api, runtime, uiBoundaryTimer);
		attachModelCostWidget(child.api, runtime, uiBoundaryTimer);
		main.sessionStarts(MAIN_HOST);
		await toDetail(double);
		const mainLines = drawingOf(main, 200);

		// The spawned session's own binding draws its own session's readings — its own context, its own
		// model — and the main session's drawing is not rewritten by it in any byte.
		child.sessionStarts(CHILD_HOST);
		const childLines = drawingOf(child, 200);
		expect((childLines[0] as string)).toContain("[\u2588\u2588\u2588\u2588\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591  20% (90,000/450.0K)]  Effort: high");
		expect(drawingOf(main, 200)).toEqual(mainLines);
		// A session with a direct parent is never the root of the tree the detail form lists: its own
		// display is the brief, and the main session's tree is not drawn through it.
		expect(linesWith(childLines, "\u5B50\u4EE3\u7406\u4E00\u53F7")).toEqual([]);
		expect(childLines.some(line => line.startsWith("Total:"))).toBe(true);
	});

	test("a context the host has spent ends the drawing instead of throwing through the accounting", async () => {
		const { runtime, double } = await fixture();
		const host = controlledPiSurface();
		attachModelCostWidget(host.api, runtime, uiBoundaryTimerOf(runtime));
		host.sessionStarts(MAIN_HOST);
		settleTurn(double);
		const handOvers = host.handOvers().length;

		// Another settled Turn is what makes the widget re-read: the accounting's own change notification
		// reaches the drawing as one more hand-over, which is the control this case needs before the
		// context is spent.
		settleTurn(double);
		expect(host.handOvers().length).toBeGreaterThan(handOvers);

		// The host replaced or disposed the session this binding serves: pi's own contract is that every
		// read of that context throws, and the next redraw runs inside the accounting's change
		// notification — a throw there takes the Round's own handler, and the session's save, down.
		const settled = host.handOvers().length;
		host.spend();
		settleTurn(double);

		// The drawing path took the spent context as no target at all: nothing was handed over again and
		// nothing was thrown through the accounting.
		expect(host.handOvers().length).toBe(settled);
		// A later session this binding is handed is drawn from its own live context again.
		host.sessionStarts({ ...MAIN_HOST, sessionId: "session-again" });
		expect(host.last().factory).toBeDefined();
	});
});
