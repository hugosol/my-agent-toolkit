/**
 * The detail form's depth-aligned agent tree: the columns one depth group shares, the slot a field a
 * row has none of keeps, the terminal display width of Chinese names, abbreviation and continuation
 * (P30, P31, P32, P33; P24's layout coverage item).
 *
 * The seam under test is production throughout: the extension's real definition bound through the
 * framework's public binding (the port double, `tests/framework/support/harness-port-double.ts`), the
 * `/budget detail` action driven the way an operator drives it, and the extension's own frontend —
 * `attachModelCostWidget` — attached to a *controlled* host that stands in for the patched one. The
 * component form is what a real terminal draws through, so the cases below draw at widths the way the
 * interactive host does and read back what it was handed; the text form is drawn beside it so a host
 * with no width of its own is covered too. `runtime.presentation.of(target)` is read for the values
 * behind the lines, and the document on the storage root for the values behind the session records.
 *
 * The tree is self-made and nothing about it is accidental. Its four sessions sit at two depths, two
 * of them under different parents, and their names are chosen so that display width and character
 * count disagree: `检索定价核查表` is seven characters and fourteen columns, `孙子代理乙` five and ten.
 * Every expected column below is a hand-computed literal from that rule — the group's name column is
 * the widest name in it measured in terminal columns, and each field after the name follows the two
 * columns of the gap — never from what the implementation happens to print.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { OmpExtensionApi, OmpSessionContext } from "../../framework/adapters/omp";
import { MODEL_COST } from "../../extensions/model-cost/definition";
import {
	MODEL_COST_WIDGET_KEY,
	type WidgetTheme,
	attachModelCostWidget,
	textColumns,
} from "../../extensions/model-cost/harnesses/omp/widget";
import type { ConsumptionDocument } from "../../extensions/model-cost/shared-logic/consumption-document";
import type { ModelPricingData } from "../../extensions/model-cost/shared-logic/model-data";
import type { ModelCostRuntime } from "../../extensions/model-cost/shared-logic/runtime";
import { createModelCostRuntime } from "../../extensions/model-cost/shared-logic/runtime";
import type { OwnerReference, SessionFacts } from "../../framework/core/protocol";
import { type PortDouble, portDouble } from "../framework/support/harness-port-double";
import { controlApi } from "./support/control-api";
import { uiBoundaryTimerOf } from "./support/ui-timer";

/** The self-made pricing data: one monetary tier and one token-only pair, as the other suites state it. */
const DATA: ModelPricingData = {
	currency: "XTS",
	unit: "XTS per million tokens",
	peakMultiplier: 3,
	zoneOffsetMinutes: 8 * 60,
	peakWindows: [{ fromMinute: 9 * 60, toMinute: 12 * 60 }],
	tiers: { alpha: { input: 2, cacheRead: 0.5, output: 8 } },
	allowanceProviders: ["plan-provider"],
	models: {
		official: {
			"model-alpha": { mode: "monetary", tier: "alpha" },
			"model-beta": { mode: "monetary", tier: "alpha" },
		},
		"go-provider": { "model-alpha": { mode: "token-only" } },
	},
};

const HARNESS = "probe-harness";
const CONSUMPTION_FILE = "consumption.json";
const MAIN_NAME = "主会话";
const MAIN: SessionFacts = { sessionId: "session-main", kind: "main", name: MAIN_NAME, unavailable: [] };
const OWNER: OwnerReference = { kind: "owner", key: "main:layout" };

/** The main session's own current pair, which every reading below is taken against. */
const MAIN_TARGET = { sessionId: "session-main", provider: "official", model: "model-alpha" } as const;

/**
 * The instant this suite's process clock reads: 11:00 on a Thursday in the data's own +08:00 zone, so
 * the season mark and every priced figure below are facts of the fixture rather than of the hour the
 * suite runs at.
 */
const CLOCK_AT = Date.parse("2026-10-01T03:00:00.000Z");

/**
 * The tree every case draws, four sessions under one root:
 *
 * - `session-a` is a child of the root named by a seven-character Chinese name on the token-only pair —
 *   a price with no tier, so its own columns are its cache rate alone — with a runtime of eight whole
 *   minutes and no startup snapshot: its row states the unproved `?(?)`.
 * - `session-a1` is `session-a`'s own child, named `a`, with a measured runtime of zero milliseconds.
 * - `session-b` is the root's second child, named in ASCII, on a priced pair, so its row carries a
 *   ratio and an amount beside its cache rate; its startup snapshot and its level are recorded.
 * - `session-b1` is `session-b`'s own child, named by a five-character Chinese name, with an amount of
 *   its own and a startup snapshot, and no runtime at all.
 *
 * The two depths therefore differ in every way that matters: their own names, their own widest fields,
 * their own missing fields, and the parent each row hangs from.
 */
const LAYOUT_TREE = {
	schemaVersion: 1,
	periodId: "period-detail-layout",
	start: "2026-10-01T00:00:00.000Z",
	holiday: false,
	harnesses: {
		[HARNESS]: {
			sessions: [
				{
					id: "session-main",
					name: MAIN_NAME,
					parent: null,
					saveVersion: 1,
					own: {
						official: {
							"model-alpha": {
								tokens: { input: 1000, cacheRead: 2000, cacheWrite: 0, output: 3000 },
								costCny: 0.05,
							},
						},
					},
				},
				{
					id: "session-a",
					name: "检索定价核查表",
					parent: "session-main",
					saveVersion: 1,
					own: {
						"go-provider": {
							"model-alpha": { tokens: { input: 30, cacheRead: 20, cacheWrite: 0, output: 50 } },
						},
					},
					runtimeMs: 480_000,
				},
				{
					id: "session-a1",
					name: "a",
					parent: "session-a",
					saveVersion: 1,
					own: {
						"go-provider": {
							"model-alpha": { tokens: { input: 1, cacheRead: 1, cacheWrite: 0, output: 1 } },
						},
					},
					runtimeMs: 0,
				},
				{
					id: "session-b",
					name: "pricing-scan",
					parent: "session-main",
					saveVersion: 1,
					own: {
						official: {
							"model-beta": {
								tokens: { input: 100, cacheRead: 100, cacheWrite: 0, output: 100 },
								costCny: 0.01,
							},
						},
					},
					startup: { model: { provider: "official", model: "model-beta" }, effort: "high" },
				},
				{
					id: "session-b1",
					name: "孙子代理乙",
					parent: "session-b",
					saveVersion: 1,
					own: {
						official: {
							"model-beta": {
								tokens: { input: 2, cacheRead: 2, cacheWrite: 0, output: 2 },
								costCny: 0.02,
							},
						},
					},
					startup: { model: { provider: "official", model: "model-beta" }, effort: "medium" },
				},
			],
		},
	},
} as unknown as ConsumptionDocument;

/** Every root this file created, removed after each case. */
const roots: string[] = [];

/** What the controlled host publishes about the session it is displaying. */
interface ViewedFacts {
	readonly sessionId?: string;
	readonly provider?: string;
	readonly model?: string;
	readonly effort?: string;
	readonly context?: { readonly tokens?: number; readonly contextWindow?: number };
}

/** One draw of the detail form at one width, as the host's own theme and no theme painted it. */
interface Draw {
	/** The lines this host was handed, with the theme's own marks around the pieces it drew. */
	readonly painted: readonly string[];
	/** The same lines with no theme at all: what a host that draws no colour is handed. */
	readonly plain: readonly string[];
}

/** One controlled host session: the facts it publishes and the widget frames it was told to draw. */
interface ControlledHost {
	readonly ctx: OmpSessionContext;
	publish(facts: ViewedFacts): void;
	/** One draw of the component form at one width, with the host's own theme and with none. */
	draw(width: number): Draw;
	/** The lines of the last text-form widget this host was shown, or nothing while none was. */
	text(): readonly string[] | undefined;
	/** How many widget frames this host was handed, clears included. */
	frames(): number;
}

/**
 * A theme that marks every piece it is handed with the token it was drawn with — the shape the
 * interactive host's own theme has — so a case can tell what a coloured drawing adds to a line.
 */
const MARKING_THEME: WidgetTheme = {
	fg: (color, text) => `\u00AB${color}:${text}\u00BB`,
	getThinkingBorderColor: level => text => `\u00ABeffort:${level}:${text}\u00BB`,
};

/** The marks that theme writes taken back off, so the columns a terminal really draws can be read. */
function visible(text: string): string {
	return text.replace(/\u00AB[^:\u00BB]*:/g, "").replace(/\u00BB/g, "");
}

/**
 * A controlled host session, bound to its own session and model, publishing `initial` as the session
 * the host displays. A `component` host records the factory it was handed and asks it for its lines at
 * the width a case states; a `lines` host records the text it was handed.
 */
function controlledHost(options: {
	readonly drawing: "component" | "lines";
	readonly boundSessionId: string;
	readonly boundModel: { readonly provider: string; readonly id: string };
	readonly initial: ViewedFacts;
}): ControlledHost {
	let facts = options.initial;
	const listeners = new Set<(facts: ViewedFacts) => void>();
	const drawn: (readonly string[] | undefined)[] = [];
	const factories: ((tui: unknown, theme: WidgetTheme) => { render(width: number): string[] })[] = [];
	const ctx = {
		agent: { kind: "main", id: "Main" },
		hasUI: true,
		ui: {
			notify: () => {},
			setWidget: (key: string, content: unknown): void => {
				if (key !== MODEL_COST_WIDGET_KEY) return;
				if (typeof content === "function") {
					factories.push(content as (typeof factories)[number]);
					drawn.push(undefined);
					return;
				}
				drawn.push(content as readonly string[] | undefined);
			},
		},
		sessionManager: { getSessionId: () => options.boundSessionId, getBranch: () => [] },
		model: options.boundModel,
		getViewedSession: () => facts,
		subscribeViewedSessionChanged: (listener: (facts: ViewedFacts) => void): (() => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		// The session's managed timer surface, present and quiet: the UI's one boundary wait is driven by
		// `boundary-timer.test.ts`, and this suite draws the form itself.
		setTimeout: () => undefined,
		clearTimer: () => {},
	} as unknown as OmpSessionContext;
	return {
		ctx,
		publish(next) {
			facts = next;
			for (const listener of [...listeners]) listener(next);
		},
		draw(width) {
			const factory = factories[factories.length - 1];
			if (factory === undefined) throw new Error("this host was handed no component to draw");
			return {
				painted: factory(undefined, MARKING_THEME).render(width),
				plain: factory(undefined, undefined as unknown as WidgetTheme).render(width),
			};
		},
		text() {
			return drawn[drawn.length - 1];
		},
		frames: () => drawn.length,
	};
}

/** Every part of one run: the runtime, the port double, the two hosts and the document's own path. */
interface BoundLayout {
	readonly runtime: ModelCostRuntime;
	readonly double: PortDouble;
	/** The host that draws components, at the width a case states: what an interactive terminal is. */
	readonly screen: ControlledHost;
	/** The host that takes plain text, with no width of its own: what a headless host is. */
	readonly text: ControlledHost;
	/** The document this instance reads and writes, as the path its storage root holds it at. */
	readonly file: string;
}

/**
 * Binds the real extension over the tree above, loads it through the real initialization, flips the
 * entry into the detail form and attaches the production frontend to both controlled hosts.
 */
async function bindLayout(): Promise<BoundLayout> {
	const root = mkdtempSync(path.join(tmpdir(), "model-cost-detail-layout-"));
	roots.push(root);
	const file = path.join(root, CONSUMPTION_FILE);
	writeFileSync(file, JSON.stringify(LAYOUT_TREE), "utf8");
	const double = portDouble();
	let runtime: ModelCostRuntime | undefined;
	double.bind(MODEL_COST, {
		config: { reader: () => `storageDir: ${root}\nbalanceTtlMs: 30000\ncodexQuotaTtlMs: 15000\n` },
		factory: () =>
			(runtime = createModelCostRuntime({
				config: { storageDir: root },
				configDirectory: root,
				userHomeDirectory: root,
				harness: HARNESS,
				data: DATA,
				now: () => CLOCK_AT,
			})).implementation,
	});
	double.deliverSession(OWNER, { session: MAIN });
	double.deliverSession(OWNER, { event: { kind: "session_facts" }, session: MAIN });
	await double.initiateRun(OWNER);
	const built = runtime as ModelCostRuntime;
	await double.runToCompletion("budget", { args: "detail" });
	const boundModel = { provider: "official", id: "model-alpha" };
	const initial: ViewedFacts = { sessionId: "session-main", provider: "official", model: "model-alpha" };
	const screen = controlledHost({ drawing: "component", boundSessionId: "session-main", boundModel, initial });
	const text = controlledHost({ drawing: "lines", boundSessionId: "session-main", boundModel, initial });
	for (const host of [screen, text]) {
		const { api, fire } = controlApi();
		attachModelCostWidget(api, built, uiBoundaryTimerOf(built), host === screen ? "component" : "lines");
		fire("session_start", host.ctx);
	}
	// One reading of one descendant's own context, as its binding publishes it: the child under
	// `session-b` holds half of the monetary channel's own 450K display budget, and the child under
	// `session-a` never reported one — the pair of rows the missing-field cases below compare.
	built.sessionContext.observe("session-b1", { tokens: 225_000, provider: "official", model: "model-beta" });
	screen.publish(initial);
	text.publish(initial);
	return { runtime: built, double, screen, text, file };
}

/**
 * The display column one text starts at in one drawn line.
 *
 * It is measured on the line itself, in the columns a terminal draws it in, because that is what the
 * promise is about: the characters before the text, each counted as the terminal counts it. The
 * measuring function is the production one — a case here reads the *line*, so the reading instrument
 * has to agree with the terminal — while every expected number in this file is hand-computed.
 */
function columnOf(line: string, text: string): number {
	const at = line.indexOf(text);
	if (at < 0) throw new Error(`${JSON.stringify(text)} is not on ${JSON.stringify(line)}`);
	return textColumns(line.slice(0, at));
}

/**
 * The startup snapshot one drawn row carries: the label-less field between its own name and its
 * statistics, `provider/model(effort)` with the model half as short as a cut left it. It is read off
 * the line's own shape because the field leads with no header at all, which is also why no case below
 * may find an agent row by a `Model:` of its own.
 */
function snapshotOf(row: string): string {
	const snapshot = /[^\s()]+\([^()]*\)/.exec(row);
	if (snapshot === null) throw new Error(`${JSON.stringify(row)} carries no startup snapshot`);
	return snapshot[0];
}

/** The column one drawn row's startup snapshot starts at: the column of the field itself. */
function snapshotColumn(row: string): number {
	return columnOf(row, snapshotOf(row));
}

/** The drawn tree's own lines: everything from the root row down, the account and Total lines above it. */
function treeOf(lines: readonly string[]): readonly string[] {
	const root = lines.findIndex(line => line === MAIN_NAME);
	if (root < 0) throw new Error(`the root row was not drawn: ${JSON.stringify(lines)}`);
	return lines.slice(root);
}

/** The tree's session rows, in the order they are drawn: the agent nodes and nothing else. */
function sessionRows(lines: readonly string[]): readonly string[] {
	return treeOf(lines).filter(line => line.includes("\u251C\u2500 ") || line.includes("\u2514\u2500 "));
}

/** The name each session row is drawn by: the text between its connector and its first field. */
function namesOf(lines: readonly string[]): readonly string[] {
	return sessionRows(lines).map(
		line => line.replace(/^(?:\u2502  )*[\u251C\u2514]\u2500 /, "").split(/\s{2,}/)[0] as string,
	);
}

/** Every line the host was handed, which no line may overrun. */
function widths(lines: readonly string[]): readonly number[] {
	return lines.map(line => textColumns(line));
}

/**
 * One drawn tree's lines grouped by the row they belong to: a row's first line is the one carrying its
 * own glyphs or name, and every line after it that starts with blanks is a continuation of that row.
 */
function rowLinesOf(tree: readonly string[]): readonly (readonly string[])[] {
	const rows: string[][] = [];
	for (const line of tree) {
		if (line.startsWith(" ")) rows[rows.length - 1]?.push(line);
		else rows.push([line]);
	}
	return rows;
}

afterEach(() => {
	while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true });
});

describe("one depth group shares its field columns (P30)", () => {
	test("the same depth's rows align, though their names differ in length and their parents differ", async () => {
		const bound = await bindLayout();
		const lines = bound.text.text() as readonly string[];
		const [a, a1, b, b1] = sessionRows(lines);

		// The tree is what it always was: the root by its name, the root's own pair one row under it, and
		// one row per descendant session in the order the relations put them — `session-a` and the child
		// below it before `session-b`. No row is added for an aggregate and no row is reordered by the
		// grouping the columns are computed in: the group decides columns, never positions.
		expect(treeOf(lines)[0]).toBe(MAIN_NAME);
		expect(treeOf(lines)[1]).toContain("official / model-alpha");
		expect(namesOf(lines)).toEqual(["检索定价核查表", "a", "pricing-scan", "孙子代理乙"]);

		// The first depth's name column is fourteen columns wide — `检索定价核查表` is seven characters and
		// fourteen terminal columns, and the ASCII name beside it is twelve — so each field after it starts
		// at the one before plus that field's own column and the two-column gap: the snapshot column is the
		// widest snapshot in the group (25 for `official/model-beta(high)`), the amount column 11 and the
		// runtime column 7, putting them at 19, 46 and 59. A session row states no cached share of its own
		// conversation input and no ratio column of its own, so this depth aligns neither of them.
		expect(snapshotColumn(a as string)).toBe(19);
		expect(snapshotColumn(b as string)).toBe(19);
		expect(columnOf(b as string, "Cost:")).toBe(46);
		expect(columnOf(a as string, "Run:")).toBe(59);

		// Every field both rows carry starts at the same column on both of them, whichever pair of parents
		// they were spawned under.
		expect(snapshotColumn(a as string)).toBe(snapshotColumn(b as string));
		expect(columnOf(a as string, "Run:")).toBe(columnOf(b as string, "Run:"));

		// The second depth has columns of its own: two glyph steps take six columns and the group's own
		// name column is `孙子代理乙`'s ten, so its first field starts at 6 + 10 + 2 = 18 — neither the depth
		// above it nor a whole-tree grid — and its own widest fields put the rest at 47, 60 and 86. Both of
		// its rows state them at those columns even though one hangs from each of the two children above,
		// which is what "the same depth aligns across different parents" means.
		expect(snapshotColumn(a1 as string)).toBe(18);
		expect(snapshotColumn(b1 as string)).toBe(18);
		expect(snapshotColumn(a1 as string)).not.toBe(snapshotColumn(a as string));
		expect(columnOf(b1 as string, "Cost:")).toBe(47);
		expect(columnOf(b1 as string, "Ctx:")).toBe(60);
		expect(columnOf(b1 as string, "Run:")).toBe(86);
		expect(columnOf(a1 as string, "Run:")).toBe(columnOf(b1 as string, "Run:"));

		// The root row is a group of its own and states its name alone: a row of the session the tree is of
		// carries no fields of its own, because its consumption is the pair row below it.
		expect(treeOf(lines)[0]).toBe(MAIN_NAME);
		expect(sessionRows(lines)).toHaveLength(4);
	});
});

describe("a field a row has none of keeps its own column (P31)", () => {
	test("a runtime, a context reading and a startup snapshot are each missing on one row of a group", async () => {
		const bound = await bindLayout();
		const lines = bound.text.text() as readonly string[];
		const [a, a1, b, b1] = sessionRows(lines).map(row => row as string);

		// One depth, one runtime measured and one never reported: the measured eight minutes and the
		// unavailable marker sit at the same column, so the runtime a row has is comparable with the one
		// beside it — and the marker is the display's own, not a zero.
		expect(a).toContain("Run: 8m");
		expect(b).toContain("Run: \u2014");
		expect(columnOf(a, "Run:")).toBe(columnOf(b, "Run:"));
		// The statics of the two differ — the priced row carries an amount the token-only row has none of —
		// so the row without it keeps that column as blanks: its runtime is still at 59, which is
		// 3 + 14 + 2 + 25 + 2 + 11 + 2 — the group's own columns, the missing amount's eleven among them. A
		// layout that let the missing field pull the rest left would have put the runtime at 46.
		expect(a).not.toContain("Cost:");
		expect(columnOf(a, "Run:")).toBe(59);

		// One depth, one context reading observed and one session whose binding never reported: the row
		// without one writes no context field at all rather than a zero, and its runtime still starts at
		// the group's own runtime column.
		expect(b1).toContain("Ctx: 50% (225.0K/450.0K)");
		expect(a1).not.toContain("Ctx:");
		expect(columnOf(a1, "Run:")).toBe(columnOf(b1, "Run:"));

		// One depth, one startup snapshot proved and one session whose beginning nothing proved: both rows
		// keep the field — the unknown one as its own `?(?)` — and every field after it still starts at the
		// group's own column.
		expect(snapshotOf(b1)).toBe("official/model-beta(medium)");
		expect(snapshotOf(a1)).toBe("?(?)");
		expect(snapshotColumn(a1)).toBe(snapshotColumn(b1));
		expect(columnOf(a1, "Run:")).toBe(columnOf(b1, "Run:"));
	});
});

describe("columns are terminal columns, not string lengths (P32)", () => {
	test("a Chinese name sizes its group by the columns it draws in, and the theme adds none", async () => {
		const bound = await bindLayout();
		const drawn = bound.screen.draw(160);
		const rows = sessionRows(drawn.plain);
		const cjk = rows.find(row => row.includes("检索定价核查表")) as string;

		// Seven Chinese characters take fourteen columns, so the group's name column is fourteen and its
		// snapshot column starts at 19. Counting characters would have put every field of that row two
		// columns earlier — which is exactly the misalignment this promise is about.
		expect(snapshotColumn(cjk)).toBe(19);
		expect(snapshotColumn(cjk)).not.toBe(17);

		// The deeper group's own Chinese name is five characters and ten columns, the widest in it, so its
		// snapshot column starts at 18 — five characters counted as five would have said 13.
		const deep = rows.find(row => row.includes("孙子代理乙")) as string;
		expect(snapshotColumn(deep)).toBe(18);
		expect(snapshotColumn(deep)).not.toBe(13);

		// A host that draws with its own theme adds no visible column of its own: what it hands over at the
		// same width is the same line, so every column above holds on the coloured output too.
		expect(sessionRows(drawn.painted).map(visible)).toEqual([...rows]);
		expect(snapshotColumn(visible(sessionRows(drawn.painted)[0] as string))).toBe(19);

		// The width a host stated is the only thing that narrows this: with none, the frontend draws the
		// fullest form of the group, which is the same line a wide terminal gets.
		expect([...(bound.text.text() ?? [])]).toEqual([...drawn.plain]);
	});
});

describe("a narrow terminal abbreviates and then wraps, group by group (P33)", () => {
	test("a name and a snapshot are marked when cut, and the group's columns stay put", async () => {
		const bound = await bindLayout();
		const wide = bound.screen.draw(125);
		const drawn = bound.screen.draw(85);

		// A width both groups fit in abbreviates nothing: the deeper depth needs 94 columns and the first
		// one 66, so both are drawn in full at 125.
		expect(wide.plain.some(line => line.includes("\u2026"))).toBe(false);

		// At 85 columns the deeper group cannot state its snapshot in full: the model half of
		// `official/model-beta(medium)` is cut to `official/…` and the level it ends with is kept whole,
		// which is the half an operator compares one session's beginning with another's by. Nothing
		// overruns the width drawn at.
		for (const width of widths(drawn.plain)) expect(width).toBeLessThanOrEqual(85);
		expect(drawn.plain.some(line => line.includes("official/\u2026(medium)"))).toBe(true);
		expect(drawn.plain.some(line => line.includes("official/model-beta(medium)"))).toBe(false);

		// The abbreviation is the group's, not a row's: both of the deeper rows state their snapshot at one
		// column — 18, two columns past the name column their own group sizes — and every field after them
		// still starts at one column on both — 38, 51 and 77, each the one before it plus that column's own
		// width and the two-column gap.
		const [a, a1, b, b1] = sessionRows(drawn.plain).map(row => row as string);
		expect(snapshotColumn(a1)).toBe(18);
		expect(snapshotColumn(b1)).toBe(18);
		expect(columnOf(b1, "Cost:")).toBe(38);
		expect(columnOf(b1, "Ctx:")).toBe(51);
		expect(columnOf(a1, "Run:")).toBe(columnOf(b1, "Run:"));
		expect(columnOf(a1, "Run:")).toBe(77);

		// The first depth needs 66 columns and fits in 85, so it is drawn in full: a narrower terminal
		// abbreviates the group that does not fit and leaves the group beside it alone.
		expect(a).toContain("检索定价核查表");
		expect(b).toContain("official/model-beta(high)");
		expect(snapshotColumn(a)).toBe(19);
		expect(columnOf(a, "Run:")).toBe(59);
	});

	test("a group that cannot fit even abbreviated wraps at one break for all of its rows", async () => {
		const bound = await bindLayout();
		const drawn = bound.screen.draw(60);
		const lines = drawn.plain;

		// Nothing the tree draws overruns the width at 60 columns: the deeper group is drawn in its own
		// continuation layout rather than wrapped by the host. (The account and Total lines above the tree
		// are the widget's own older layout and are not this form's subject.)
		for (const width of widths(treeOf(lines))) expect(width).toBeLessThanOrEqual(60);

		// Each row of one group is drawn on the same number of lines, because the break is the group's: the
		// root and the root's own pair row on one line each, the two rows at the first depth on one line
		// each — that group's columns are abbreviated until they fit exactly — and two lines for each of the
		// two below them, whose columns cannot fit at any abbreviation. A row that wrapped itself would
		// answer a different count from its siblings'.
		const rows = rowLinesOf(treeOf(lines));
		expect(rows.map(row => row.length)).toEqual([1, 1, 1, 2, 1, 2]);

		// The deeper group's rows state their snapshot on their first line — the model half cut away and the
		// level it began on the whole of what is left, since the column may not fall below the longest level
		// its rows carry — and carry their amount and their context reading beside it, at 23 and 36, with
		// their runtime on the second line at the indentation the group's first field starts at: six glyph
		// columns, a name column cut to four and the two-column gap. The row that reported no amount and no
		// context reading keeps those columns as blanks and still states its runtime at 12, so a missing
		// field moves nothing.
		const [a1First, a1Second] = [rows[3]?.[0] as string, rows[3]?.[1] as string];
		const [b1First, b1Second] = [rows[5]?.[0] as string, rows[5]?.[1] as string];
		expect(snapshotOf(a1First)).toBe("?(?)");
		expect(snapshotOf(b1First)).toBe("\u2026(medium)");
		expect(b1First).toContain("Cost: \u00A50.02");
		expect(b1First).toContain("Ctx: 50% (225.0K/450.0K)");
		expect(columnOf(b1First, "Cost:")).toBe(23);
		expect(columnOf(b1First, "Ctx:")).toBe(36);
		expect(a1First).not.toContain("Cost:");
		expect(a1First).not.toContain("Ctx:");
		expect(columnOf(a1Second, "Run:")).toBe(12);
		expect(columnOf(b1Second, "Run:")).toBe(12);

		// The first depth's own columns are abbreviated until they fit, so both of its rows stay on one
		// line: its name column keeps all fourteen of its columns and the snapshot it groups is cut to the
		// nineteen that fit — `official/mod…(high)`, the level still whole — which starts the fields after
		// it at 19, the column the full form puts them at too.
		const [a, b] = [rows[2]?.[0] as string, rows[4]?.[0] as string];
		expect(a).toContain("检索定价核查表");
		expect(snapshotOf(b)).toBe("official/mod\u2026(high)");
		expect(a).not.toContain("Cost:");
		expect(snapshotColumn(a)).toBe(19);
		expect(columnOf(b, "Cost:")).toBe(40);
		expect(columnOf(a, "Run:")).toBe(53);
		expect(columnOf(b, "Run:")).toBe(53);

		// Abbreviation happened before wrapping, as the promise orders it: the deeper group's names are
		// already cut to their four columns — three of the characters' own columns and the ellipsis — and
		// its snapshots are already down to the level each row began on, so every wrapped line carries whole
		// fields rather than half of one.
		expect(lines.some(line => line.includes("孙\u2026"))).toBe(true);
		expect(lines.some(line => line.includes("\u2026(medium)"))).toBe(true);
	});

	test("a width change is a fresh layout: the same width draws the same lines again", async () => {
		const bound = await bindLayout();
		const wide = bound.screen.draw(160);
		const narrow = bound.screen.draw(60);
		const again = bound.screen.draw(160);

		// A resize re-reads and re-lays out: the narrow draw is a narrower form, and drawing the original
		// width again answers exactly what it answered before — no state of the last width survives.
		expect(narrow.plain).not.toEqual(wide.plain);
		expect(again.plain).toEqual(wide.plain);
		for (const width of widths(treeOf(wide.plain))) expect(width).toBeLessThanOrEqual(160);
		for (const width of widths(treeOf(narrow.plain))) expect(width).toBeLessThanOrEqual(60);
	});
});

describe("abbreviation and wrapping change no reading and no data (P33, P24)", () => {
	test("the figures, the whole names and models, and the document itself survive every width", async () => {
		const bound = await bindLayout();
		const before = readFileSync(bound.file, "utf8");
		const wide = bound.screen.draw(160).plain;
		const narrow = bound.screen.draw(60).plain;

		// The same business readings are drawn at both widths: every figure is the one the display result
		// states, whether a line states it in full or on a continuation line. The cached share of a pair is
		// one of them, stated on the root's own pair row wherever the width puts it — and never on a
		// descendant's own row, whatever the width does with the columns around it.
		for (const figure of [
			"Cache: 67%",
			"Cost: \u00A50.01",
			"Run: 8m",
			"Ctx: 50% (225.0K/450.0K)",
		]) {
			expect(wide.join("\n")).toContain(figure);
			expect(narrow.join("\n")).toContain(figure);
		}
		expect(sessionRows(wide).every(row => !row.includes("Cache:"))).toBe(true);
		expect(sessionRows(narrow).every(row => !row.includes("Cache:"))).toBe(true);
		// The startup snapshot is the one field a width may cut into: what survives the cut at either width
		// is the level the session began on, the half an operator compares its beginning by.
		for (const drawn of [wide, narrow]) {
			expect(drawn.join("\n")).toContain("(high)");
			expect(drawn.join("\n")).toContain("(medium)");
		}

		// The values behind the lines are whole whatever the drawing did with them: the display result
		// still names the sessions and states each startup snapshot and each accumulated runtime in full,
		// and the reference amounts are still the records' own.
		const tree = bound.runtime.presentation.of(MAIN_TARGET).agentTree ?? [];
		expect(tree.map(row => row.name)).toEqual([
			MAIN_NAME,
			"official / model-alpha",
			"检索定价核查表",
			"a",
			"pricing-scan",
			"孙子代理乙",
		]);
		const child = tree.find(row => row.name === "孙子代理乙");
		expect(child?.startup?.text).toBe("official/model-beta(medium)");
		expect(child?.startup?.tail).toBe("(medium)");
		expect(child?.fields?.costCny).toBe(0.02);
		expect(tree.find(row => row.name === "检索定价核查表")?.runtimeMs).toBe(480_000);
		expect(tree.find(row => row.name === "a")?.runtimeMs).toBe(0);
		expect(tree.find(row => row.name === "检索定价核查表")?.startup?.text).toBe("?(?)");
		expect(tree.find(row => row.name === "pricing-scan")?.fields?.costCny).toBe(0.01);

		// And the document on the storage root is exactly what it was: drawing a narrower line neither
		// invents a save nor rewrites a value, so the whole name, the startup snapshot, the numeric
		// runtime and every amount behind those lines are still there to be read again.
		expect(readFileSync(bound.file, "utf8")).toBe(before);
		const saved = JSON.parse(before) as {
			readonly harnesses: Record<string, { readonly sessions: readonly Record<string, unknown>[] }>;
		};
		const records = saved.harnesses[HARNESS]?.sessions ?? [];
		const names = records.map(record => record.name);
		expect(names).toEqual([MAIN_NAME, "检索定价核查表", "a", "pricing-scan", "孙子代理乙"]);
		expect(records.find(record => record.id === "session-b1")?.startup).toEqual({
			model: { provider: "official", model: "model-beta" },
			effort: "medium",
		});
		expect(records.find(record => record.id === "session-a")?.runtimeMs).toBe(480_000);
	});
});
