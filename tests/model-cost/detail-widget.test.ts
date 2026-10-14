/**
 * The usage widget's own lines: the brief's Round rows and the detail form's static tree (P23, P26,
 * P29; S5).
 *
 * This suite drives the extension's own production frontend — `attachModelCostWidget` — through the
 * same operator entry the real host uses, with a *controlled host* standing in for the patched one:
 * a session context publishing whatever facts a case states as the session being displayed, and a
 * `setWidget` that records every frame. What it draws is the production display result the same
 * runtime answers, so a case reads the widget's lines as the operator would see them.
 *
 * The business half behind it is the real one: the runtime is built by the production factory over a
 * self-made two-session document (a main session on a monetary pair, its subagent on a token-only
 * one), every Turn is delivered the way the framework delivers a mapped signal, and every Round edge
 * is the framework's own synthetic boundary delivered through the same port. Every expected line
 * below is a hand-computed literal from the endpoint's own wire numbers, the fixture prices and the
 * document's records.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { OmpExtensionApi, OmpSessionContext } from "../../framework/adapters/omp";
import { MODEL_COST } from "../../extensions/model-cost/definition";
import { MODEL_COST_WIDGET_KEY, attachModelCostWidget } from "../../extensions/model-cost/harnesses/omp/widget";
import type { ConsumptionDocument } from "../../extensions/model-cost/shared-logic/consumption-document";
import type { ModelPricingData } from "../../extensions/model-cost/shared-logic/model-data";
import type { ModelCostRuntime } from "../../extensions/model-cost/shared-logic/runtime";
import { createModelCostRuntime } from "../../extensions/model-cost/shared-logic/runtime";
import type { OwnerReference, SessionFacts, TurnSignal, TurnUsage } from "../../framework/core/protocol";
import { type PortDouble, portDouble } from "../framework/support/harness-port-double";
import { uiBoundaryTimerOf } from "./support/ui-timer";

/** The self-made pricing data: one monetary tier, one token-only pair and one allowance provider. */
const DATA: ModelPricingData = {
	currency: "XTS",
	unit: "XTS per million tokens",
	peakMultiplier: 3,
	zoneOffsetMinutes: 8 * 60,
	peakWindows: [{ fromMinute: 9 * 60, toMinute: 12 * 60 }],
	tiers: { alpha: { input: 2, cacheRead: 0.5, output: 8 } },
	allowanceProviders: ["plan-provider"],
	models: {
		official: { "model-alpha": { mode: "monetary", tier: "alpha" } },
		"go-provider": { "model-alpha": { mode: "token-only" } },
	},
};

const HARNESS = "probe-harness";
const MAIN: SessionFacts = { sessionId: "session-main", kind: "main", name: "主会话", unavailable: [] };
/** The subagent session of the document, as the host reports its facts. */
const SUB: SessionFacts = { sessionId: "session-sub", kind: "sub", name: "子代理", unavailable: [] };

/** The pair the main session runs on, as the host reports it for that session. */
const MAIN_PAIR = { provider: "official", model: "model-alpha" } as const;
const OWNER: OwnerReference = { kind: "owner", key: "main:detail-widget" };
const CONSUMPTION_FILE = "consumption.json";

/**
 * The instant the one Turn below begins at, on the process's own clock.
 *
 * It is 08:00 in the data's own zone, an off-peak hour, so the flash tier's own off-peak amounts
 * price that request whatever the wall clock says when this suite runs. The amount below is computed
 * from this instant rather than read back from anything.
 */
const TURN_AT = Date.parse("2026-10-01T00:00:00.000Z");

/** The one Turn's usage, as the endpoint's own wire numbers: ten input and ten output tokens. */
const TURN_USAGE: TurnUsage = { input: 10, output: 10, cacheRead: 0, cacheWrite: 0, totalTokens: 20 };

/**
 * The document both halves of this suite read: the main session's own CNY pair (1,000 input, 2,000
 * cache reads, 3,000 output, 0.05 CNY) and its subagent's token-only one (30/20/0/50, no amount).
 */
const WIDGET_TREE = {
	schemaVersion: 1,
	periodId: "period-detail-widget",
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
					id: "session-sub",
					name: "子代理",
					parent: "session-main",
					saveVersion: 1,
					own: {
						"go-provider": {
							"model-alpha": { tokens: { input: 30, cacheRead: 20, cacheWrite: 0, output: 50 } },
						},
					},
				},
			],
		},
	},
} as unknown as ConsumptionDocument;

/**
 * The instant this suite's process clock reads, so the pricing season is a fact of the fixture rather
 * than of the hour the suite happens to run at: 11:00 on a Thursday in the data's own +08:00 zone,
 * inside the fixture's peak window, and therefore the peak mark the drawn line carries.
 */
const CLOCK_AT = Date.parse("2026-10-01T03:00:00.000Z");

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

/** One widget frame a controlled session was told to draw; a cleared widget carries no lines. */
interface DrawnFrame {
	readonly key: string;
	readonly lines: readonly string[] | undefined;
}

/** One controlled host session: the facts it publishes, and the frames it was told to draw. */
interface ControlledHost {
	readonly ctx: OmpSessionContext;
	publish(facts: ViewedFacts): void;
	/** The lines of the last widget this host was told to show, or nothing when it was cleared. */
	lastLines(): readonly string[] | undefined;
	/** How many widget frames this host was handed, clears included. */
	frames(): number;
}

/**
 * A controlled host session, bound to its own session and model, publishing `initial` as the session
 * the host displays.
 */
function controlledHost(options: {
	readonly boundSessionId: string;
	readonly boundModel: { readonly provider: string; readonly id: string };
	readonly initial: ViewedFacts;
	readonly hasUI?: boolean;
}): ControlledHost {
	let facts = options.initial;
	const listeners = new Set<(facts: ViewedFacts) => void>();
	const drawn: DrawnFrame[] = [];
	const ctx = {
		agent: { kind: "main", id: "Main" },
		hasUI: options.hasUI ?? true,
		ui: {
			notify: () => {},
			setWidget: (key: string, content: readonly string[] | undefined): void => {
				drawn.push({ key, lines: content });
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
		// The session's managed timer surface, present and quiet: this suite drives the display, and the
		// UI's one boundary wait is driven by `boundary-timer.test.ts`.
		setTimeout: () => undefined,
		clearTimer: () => {},
	} as unknown as OmpSessionContext;
	return {
		ctx,
		publish(next) {
			facts = next;
			for (const listener of [...listeners]) listener(next);
		},
		lastLines() {
			const shown = drawn.filter(frame => frame.key === MODEL_COST_WIDGET_KEY);
			return shown[shown.length - 1]?.lines;
		},
		frames: () => drawn.length,
	};
}

/** A controlled extension API: it records the handlers the frontend registers. */
function controlApi(): { readonly api: OmpExtensionApi; fire(event: string, ctx: OmpSessionContext): void } {
	const handlers = new Map<string, Array<(event: unknown, ctx: OmpSessionContext) => void>>();
	return {
		api: {
			on(event: string, handler: (event: unknown, ctx: OmpSessionContext) => void): void {
				const existing = handlers.get(event) ?? [];
				existing.push(handler);
				handlers.set(event, existing);
			},
			pi: undefined,
		} as unknown as OmpExtensionApi,
		fire(event, ctx) {
			for (const handler of handlers.get(event) ?? []) handler({ type: event }, ctx);
		},
	};
}

/** Every part of one run: the runtime, the port double that drives it, and the host drawing it. */
interface BoundWidget {
	readonly runtime: ModelCostRuntime;
	readonly host: ControlledHost;
	readonly double: PortDouble;
}

/**
 * Binds the real extension over one baseline document, loads it through the real initialization, and
 * attaches the production frontend to one controlled host.
 */
async function bindWidget(options: { readonly viewed?: ViewedFacts; readonly hasUI?: boolean } = {}): Promise<BoundWidget> {
	const root = mkdtempSync(path.join(tmpdir(), "model-cost-detail-widget-"));
	roots.push(root);
	writeFileSync(path.join(root, CONSUMPTION_FILE), JSON.stringify(WIDGET_TREE), "utf8");
	const double = portDouble();
	let runtime: ModelCostRuntime | undefined;
	double.bind(MODEL_COST, {
		config: { reader: () => `storageDir: ${root}\nbalanceTtlMs: 30000\n` },
		factory: context => {
			runtime = createModelCostRuntime({
				config: { storageDir: root },
				configDirectory: root,
				userHomeDirectory: root,
				harness: HARNESS,
				data: DATA,
				now: () => CLOCK_AT,
				...(context.modelPrices === undefined ? {} : { modelPrices: context.modelPrices }),
			});
			return runtime.implementation;
		},
	});
	double.deliverSession(OWNER, { session: MAIN });
	double.deliverSession(OWNER, { event: { kind: "session_facts" }, session: MAIN });
	await double.initiateRun(OWNER);
	const built = runtime as ModelCostRuntime;
	const host = controlledHost({
		boundSessionId: "session-main",
		boundModel: { provider: "official", id: "model-alpha" },
		initial: options.viewed ?? { sessionId: "session-main", provider: "official", model: "model-alpha" },
		...(options.hasUI === undefined ? {} : { hasUI: options.hasUI }),
	});
	const { api, fire } = controlApi();
	attachModelCostWidget(api, built, uiBoundaryTimerOf(built), "lines");
	fire("session_start", host.ctx);
	return { runtime: built, host, double };
}

/** One settled Turn of the main session on its own monetary pair. */
function settleTurn(double: PortDouble): void {
	double.deliverTurn(
		{ kind: "request_started", session: MAIN, at: TURN_AT, provider: "official", model: "model-alpha" },
		{ owner: OWNER },
	);
	double.deliverTurn(
		{
			kind: "response_settled",
			session: MAIN,
			at: TURN_AT + 60_000,
			outcome: "completed",
			readings: [TURN_USAGE],
		},
		{ owner: OWNER },
	);
}

afterEach(() => {
	while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true });
});

describe("the brief draws the viewed session's own Rounds (P26)", () => {
	test("no boundary pair means no Round row, not a fabricated zero", async () => {
		const bound = await bindWidget();

		// The document was loaded, and this instance has seen no Round boundary of that session: a
		// restored accumulation is a session total and not a Round, so the brief carries its Total alone.
		// The period's accrual leads it, on the old monetary account row with the season mark — the one
		// session's own 0.05 CNY over the fine bar's single eighth-block — and no budget bar appears
		// without the host's context reading.
		expect(bound.host.lastLines()).toEqual([
			"\u{1F525}  \u23F3 Accrued: \u00A50.05 [\u258F]",
			"Total:  Cache: 67%  ¥Cache/In/Out：4:7:89  Sum: 6,100  Cost: ¥0.05",
		]);
	});

	test("an open Round shows its own additions, and the ended one becomes the latest Round", async () => {
		const bound = await bindWidget();

		// The framework opens the session's Round and one request settles inside it. The brief's Total is
		// the session's own current model (2,000 of 3,010 conversation tokens: 66 percent) and the whole
		// main tree's Sum, Cost and Ref (6,000 + 20 + 100 tokens, 0.05 + 0.0001 CNY); the Round row is
		// that Round's own additions alone — ten input and ten output tokens, priced 20·1 + 10·8 of the
		// 100-unit total, an exact 0:20:80.
		bound.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: MAIN });
		settleTurn(bound.double);
		expect(bound.host.lastLines()).toEqual([
			"\u{1F525}  \u23F3 Accrued: \u00A50.05 [\u258F]",
			"Total:  Cache: 66%  ¥Cache/In/Out： 4:7:89  Sum: 6,120  Cost:   ¥0.05",
			"Round:  Cache:  0%  ¥Cache/In/Out：0:20:80  Sum:    20  Cost: ¥0.0001",
		]);

		// The Round ends: its own additions become the latest Round, and the open one is gone. The
		// Total is the same accumulation it already was — an ended Round is not new consumption.
		bound.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: MAIN });
		expect(bound.host.lastLines()).toEqual([
			"\u{1F525}  \u23F3 Accrued: \u00A50.05 [\u258F]",
			"Total:  Cache: 66%  ¥Cache/In/Out： 4:7:89  Sum: 6,120  Cost:   ¥0.05",
			"Round:  Cache:  0%  ¥Cache/In/Out：0:20:80  Sum:    20  Cost: ¥0.0001",
		]);

		// A second Round opens after the first ended, so the instance now holds an open Round and a
		// previous one at once. Before the new Round's first Turn settles, its own additions are all
		// zero: the brief keeps the previous Round's reading rather than dropping the row to zeroes.
		bound.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: MAIN });
		expect(bound.host.lastLines()).toEqual([
			"\u{1F525}  \u23F3 Accrued: \u00A50.05 [\u258F]",
			"Total:  Cache: 66%  ¥Cache/In/Out： 4:7:89  Sum: 6,120  Cost:   ¥0.05",
			"Round:  Cache:  0%  ¥Cache/In/Out：0:20:80  Sum:    20  Cost: ¥0.0001",
		]);

		// The new Round's first Turn settles: its data replaces the previous reading, and the row is
		// still one `Round:` line rather than a `Prev:` row beside the live one.
		settleTurn(bound.double);
		const roundRows = (bound.host.lastLines() ?? []).filter(
			line => line.startsWith("Round:") || line.startsWith("Prev:"),
		);
		expect(roundRows).toHaveLength(1);
		expect(roundRows[0]?.startsWith("Round:")).toBe(true);
	});
});

describe("the detail form draws the static tree where the brief draws Rounds (P23, P29)", () => {
	test("the toggle replaces the Round row with the tree and keeps the same Total above it", async () => {
		const bound = await bindWidget({
			viewed: {
				sessionId: "session-main",
				provider: "official",
				model: "model-alpha",
				effort: "high",
				context: { tokens: 1234, contextWindow: 64_000 },
			},
		});

		// The brief of a session with an ended Round: the old monetary account row — the season mark and
		// the bar with the effort, the period's accrual beside them — then the Total and that Round.
		bound.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: MAIN });
		settleTurn(bound.double);
		bound.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: MAIN });
		const total = "Total:  Cache: 66%  ¥Cache/In/Out： 4:7:89  Sum: 6,120  Cost:   ¥0.05";
		const bar = "\u{1F525}  [\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591   0% (1,234/450.0K)]  Effort: high";
		const accrued = "\u23F3 Accrued: \u00A50.05 [\u258F]";
		const account = `${bar}  ${accrued}`;
		expect(bound.host.lastLines()).toEqual([
			account,
			total,
			"Round:  Cache:  0%  ¥Cache/In/Out：0:20:80  Sum:    20  Cost: ¥0.0001",
		]);

		// The action redraws at once — no session boundary, no request and no save is needed for it —
		// and what it draws is the tree in the Round rows' place. The root is named, its own pair is one
		// row indented under it (2,000 of 3,010 conversation tokens, 4:7:89 of its own tier, its own
		// 6,020 tokens and its 0.05 CNY), and the subagent is one row of its own 100 tokens at its
		// direct parent's depth. No Round row survives, and the Total above is the very line it was.
		const framesBefore = bound.host.frames();
		const run = await bound.double.runToCompletion("budget", { args: "detail" });
		expect(run.feedback.map(notice => notice.level)).toEqual(["info"]);
		expect(bound.host.frames()).toBeGreaterThan(framesBefore);
		expect(bound.host.lastLines()).toEqual([
			account,
			total,
			"主会话",
			"│  official / model-alpha  Cache: 66%  ¥Cache/In/Out：4:7:89  Sum: 6,020  Cost: ¥0.05",
			"└─ 子代理  Cache: 40%  Sum: 100",
		]);
		expect(bound.host.lastLines()?.some(line => line.startsWith("Round:"))).toBe(false);

		// Flipping back draws the brief again, with the same Total line and no tree row left behind.
		await bound.double.runToCompletion("budget", { args: "detail" });
		expect(bound.host.lastLines()).toEqual([
			account,
			total,
			"Round:  Cache:  0%  ¥Cache/In/Out：0:20:80  Sum:    20  Cost: ¥0.0001",
		]);
	});

	test("a headless entry draws nothing, and the toggle still flips without creating a widget", async () => {
		const bound = await bindWidget({ hasUI: false });

		// No UI: the frontend creates no widget at all, and the business result behind it is untouched.
		expect(bound.host.lastLines()).toBeUndefined();
		expect(bound.host.frames()).toBe(0);

		const run = await bound.double.runToCompletion("budget", { args: "detail", hasUI: false });
		expect(run.feedback.map(notice => notice.level)).toEqual(["info"]);
		expect(bound.runtime.presentation.of({ sessionId: "session-main", ...MAIN_PAIR }).form).toBe("detail");
		// The flip changed the entry's preference and said so; it forced no widget into existence.
		expect(bound.host.frames()).toBe(0);
	});

	test("a hidden target is cleared rather than shown, and the detail form never invents a tree for it", async () => {
		const bound = await bindWidget({
			viewed: { sessionId: "session-main", provider: "unlisted-provider", model: "no-such" },
		});

		// The mode is not this extension's display at all: the widget is cleared, not drawn empty, and
		// the entry's own preference does not turn that into a tree.
		expect(bound.host.lastLines()).toBeUndefined();
		await bound.double.runToCompletion("budget", { args: "detail" });
		expect(bound.host.lastLines()).toBeUndefined();
	});

	test("a subagent's view stays the brief while the entry is in detail, and returning draws the tree (P26)", async () => {
		const bound = await bindWidget();
		await bound.double.runToCompletion("budget", { args: "detail" });

		// The entry is in detail and the main session is what it draws the tree for.
		expect(bound.host.lastLines()).toEqual([
			"\u{1F525}  \u23F3 Accrued: \u00A50.05 [\u258F]",
			"Total:  Cache: 67%  ¥Cache/In/Out：4:7:89  Sum: 6,100  Cost: ¥0.05",
			"主会话",
			"│  official / model-alpha  Cache: 67%  ¥Cache/In/Out：4:7:89  Sum: 6,000  Cost: ¥0.05",
			"└─ 子代理  Cache: 40%  Sum: 100",
		]);

		// The view moves to the subagent, whose own Round then opens and settles one request: what is
		// drawn is *that* session's brief — its own current-model fields (130 tokens, a 33 percent cache
		// rate, no amount of its own), its own Round's 30 tokens with no ratio — and the same main tree's
		// Sum and Cost behind it. No tree row appears at all, whatever the entry's preference is.
		bound.host.publish({ sessionId: "session-sub", provider: "go-provider", model: "model-alpha", effort: "low" });
		bound.double.deliverRound(OWNER, {
			event: { kind: "round_start" },
			session: SUB,
		});
		bound.double.deliverTurn(
			{
				kind: "request_started",
				session: SUB,
				at: TURN_AT,
				provider: "go-provider",
				model: "model-alpha",
			},
			{ owner: OWNER },
		);
		bound.double.deliverTurn(
			{
				kind: "response_settled",
				session: SUB,
				at: TURN_AT + 60_000,
				outcome: "completed",
				readings: [{ input: 10, output: 20, cacheRead: 0, cacheWrite: 0, totalTokens: 30 }],
			},
			{ owner: OWNER },
		);
		expect(bound.host.lastLines()).toEqual([
			"Total:  Cache: 33%  Sum: 6,130  Cost: ¥0.05",
			"Round:  Cache:  0%  Sum:    30",
		]);
		expect(bound.host.lastLines()?.some(line => line.startsWith("\u2502  ") || line.includes("\u251C\u2500 ") || line.includes("\u2514\u2500 "))).toBe(false);

		// Returning to the main session draws its tree again — the same Total above it, with the
		// subagent's row now carrying what the subagent itself consumed: 130 tokens, whose cache rate is
		// the 20 reads of its 40+20 conversation input tokens, a whole 33 percent.
		bound.host.publish({ sessionId: "session-main", provider: "official", model: "model-alpha" });
		expect(bound.host.lastLines()).toEqual([
			"\u{1F525}  \u23F3 Accrued: \u00A50.05 [\u258F]",
			"Total:  Cache: 67%  ¥Cache/In/Out：4:7:89  Sum: 6,130  Cost: ¥0.05",
			"主会话",
			"│  official / model-alpha  Cache: 67%  ¥Cache/In/Out：4:7:89  Sum: 6,000  Cost: ¥0.05",
			"└─ 子代理  Cache: 33%  Sum: 130",
		]);
	});

	test("a subagent's own context is read against its channel's fixed display budget (P26)", async () => {
		const bound = await bindWidget();
		await bound.double.runToCompletion("budget", { args: "detail" });

		// No binding has reported the subagent's context: its row carries its consumption alone, and no
		// context field is invented for it.
		expect(bound.host.lastLines()?.find(line => line.includes("子代理"))).toBe("└─ 子代理  Cache: 40%  Sum: 100");

		// The subagent's own binding publishes its current context on the monetary channel. The row reads
		// it against that channel's own 450K display budget, as `percent (tokens/budget)` — the same form
		// and the same figure the bar above uses, not the host's own context window.
		bound.runtime.sessionContext.observe("session-sub", {
			tokens: 381_500,
			provider: "official",
			model: "model-alpha",
		});
		bound.host.publish({ sessionId: "session-main", provider: "official", model: "model-alpha" });
		expect(bound.host.lastLines()?.find(line => line.includes("子代理"))).toBe(
			"└─ 子代理  Cache: 40%  Sum: 100  Ctx: 85% (381.5K/450.0K)",
		);

		// A later reading on the allowance channel is read against that channel's own 272K budget, chosen
		// from the reading's own model rather than from the target being drawn.
		bound.runtime.sessionContext.observe("session-sub", {
			tokens: 136_000,
			provider: "plan-provider",
			model: "plan-model",
		});
		bound.host.publish({ sessionId: "session-main", provider: "official", model: "model-alpha" });
		expect(bound.host.lastLines()?.find(line => line.includes("子代理"))).toBe(
			"└─ 子代理  Cache: 40%  Sum: 100  Ctx: 50% (136.0K/272.0K)",
		);

		// A pair the data does not classify has no display budget at all, so the row carries no context
		// field rather than a figure with nothing to read it against.
		bound.runtime.sessionContext.observe("session-sub", {
			tokens: 1_000,
			provider: "unlisted-provider",
			model: "no-such",
		});
		bound.host.publish({ sessionId: "session-main", provider: "official", model: "model-alpha" });
		expect(bound.host.lastLines()?.find(line => line.includes("子代理"))).toBe("└─ 子代理  Cache: 40%  Sum: 100");
	});
});
