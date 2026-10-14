/**
 * The usage widget while the viewed session is not the session it is bound to (P11, P21, P22; S5).
 *
 * This suite drives the extension's own production frontend — `attachModelCostWidget` — through the
 * same operator entry the real host uses, with a *controlled facts adapter* standing in for the
 * patched host: a session context whose `getViewedSession()` and `subscribeViewedSessionChanged()`
 * are whatever a case says, and whose own bound session is deliberately a different session on a
 * different model. That is what makes the source of every displayed fact observable: the widget reads
 * the viewed session over the approved public outlet, and a fact it could not obtain stays a question
 * mark instead of being borrowed from the binding or from a configuration.
 *
 * The business half behind it is the real one: the runtime is built by the production factory over a
 * self-made two-session document (the main session on its monetary pair, its subagent token-only),
 * so the values the cases assert are the read-only display result the extension itself produces. The
 * tree is deliberately different from every target's own fields (its 6,100 accounted tokens versus
 * 6,000 and 100), and every expected figure below is a hand-computed literal.
 *
 * The re-read behavior the suite turns on — a target switch and a same-target fact change both end in
 * a fresh read, and a switched-away context is unsubscribed rather than kept — is the widget's own
 * contract: `render` reads the current target at the moment of drawing and holds no reading of its
 * own.
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
import type { OwnerReference, SessionFacts } from "../../framework/core/protocol";
import { portDouble } from "../framework/support/harness-port-double";
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
		official: {
			"model-alpha": { mode: "monetary", tier: "alpha" },
			// The second pair the bound session runs on and the same-target case switches the viewed
			// session to: a monetary model this document holds no consumption for, so its own fields are
			// genuinely empty while the tree behind them is not.
			"model-beta": { mode: "monetary", tier: "alpha" },
		},
		"go-provider": { "model-alpha": { mode: "token-only" } },
	},
};

const HARNESS = "probe-harness";
const MAIN: SessionFacts = { sessionId: "session-main", kind: "main", name: "主会话", unavailable: [] };
const OWNER: OwnerReference = { kind: "owner", key: "main:viewed-widget" };
const CONSUMPTION_FILE = "consumption.json";

/** The tree every case reads: the main session's own CNY pair plus its subagent's token-only one. */
const TREE: ConsumptionDocument = {
	schemaVersion: 1,
	periodId: "period-viewed-widget",
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
	} as unknown as ConsumptionDocument["harnesses"],
};

/** Every root this file created, removed after each case. */
const roots: string[] = [];

/** One snapshot of the session a controlled host says it is displaying. */
interface ViewedFacts {
	readonly sessionId?: string;
	readonly provider?: string;
	readonly model?: string;
	readonly effort?: string;
	readonly context?: { readonly tokens?: number; readonly contextWindow?: number };
}

/** One widget frame a controlled session was told to draw. */
interface DrawnWidget {
	readonly key: string;
	readonly lines: readonly string[] | undefined;
}

/**
 * One controlled host session: a native context whose own binding is a session of its own, plus the
 * facts it publishes as the viewed session and the widget frames it was told to draw.
 */
interface ControlSession {
	readonly ctx: OmpSessionContext;
	/** The frames this session's UI was handed, in order; a clear carries no lines. */
	readonly frames: DrawnWidget[];
	/** Replace the facts this session publishes as the viewed session. */
	publish(facts: ViewedFacts): void;
	/** How many of this session's outlet subscriptions are currently live. */
	subscribers(): number;
	/** How many times this session's outlet subscription was stopped. */
	unsubscribes(): number;
	/** The lines of the last widget the host was told to show, or nothing when it was cleared. */
	lastLines(): readonly string[] | undefined;
}

/**
 * A controlled host session, bound to its own session and model, publishing `initial` as the session
 * the host is displaying.
 */
function controlSession(options: {
	readonly boundSessionId: string;
	readonly boundModel: { readonly provider: string; readonly id: string };
	readonly initial: ViewedFacts;
	readonly hasUI?: boolean;
	/**
	 * Whether this host publishes the approved viewed-session outlet. A host without it (the patch
	 * not installed) has no separate view, so the widget is expected to read the bound session's own
	 * native context instead.
	 */
	readonly patched?: boolean;
	/** The bound session's own native context reading, for the unpatched host above. */
	readonly ownContext?: { readonly tokens?: number; readonly contextWindow?: number };
}): ControlSession {
	let facts = options.initial;
	const listeners = new Set<(facts: ViewedFacts) => void>();
	const frames: DrawnWidget[] = [];
	let unsubscribes = 0;
	const ctx = {
		agent: { kind: "main", id: "Main" },
		hasUI: options.hasUI ?? true,
		ui: {
			notify: () => {},
			setWidget: (key: string, content: readonly string[] | undefined): void => {
				frames.push({ key, lines: content });
			},
		},
		sessionManager: { getSessionId: () => options.boundSessionId, getBranch: () => [] },
		model: options.boundModel,
		// The outlet is what the approved patch adds; a host without it publishes the bound session's
		// own context natively instead, which is the surface this suite pins for the bar's fallback.
		...(options.patched === false
			? { getContextUsage: () => options.ownContext }
			: {
					getViewedSession: () => facts,
					subscribeViewedSessionChanged: (listener: (facts: ViewedFacts) => void): (() => void) => {
						listeners.add(listener);
						return () => {
							if (!listeners.delete(listener)) return;
							unsubscribes += 1;
						};
					},
				}),
		// The session's managed timer surface, present and quiet: this suite drives the display, and the
		// UI's one boundary wait is driven by `boundary-timer.test.ts`.
		setTimeout: () => undefined,
		clearTimer: () => {},
	} as unknown as OmpSessionContext;
	return {
		ctx,
		frames,
		publish(next) {
			facts = next;
			for (const listener of [...listeners]) listener(next);
		},
		subscribers: () => listeners.size,
		unsubscribes: () => unsubscribes,
		lastLines: () => {
			const shown = frames.filter(frame => frame.key === MODEL_COST_WIDGET_KEY);
			return shown[shown.length - 1]?.lines;
		},
	};
}

/** A controlled extension API: it records the widget's handlers so a case can fire a session event. */
function controlApi(options: { readonly thinkingLevel?: string } = {}): {
	readonly api: OmpExtensionApi;
	fire(event: string, ctx: OmpSessionContext): void;
} {
	const handlers = new Map<string, Array<(event: unknown, ctx: OmpSessionContext) => void>>();
	const api = {
		on(event: string, handler: (event: unknown, ctx: OmpSessionContext) => void): void {
			const existing = handlers.get(event) ?? [];
			existing.push(handler);
			handlers.set(event, existing);
		},
		// The bound session's actual effort, as the native API reports it: present on every host,
		// before and after the viewed-session outlet, which is the surface the widget's fallback reads.
		getThinkingLevel: () => options.thinkingLevel,
		pi: undefined,
	} as unknown as OmpExtensionApi;
	return {
		api,
		fire(event, ctx) {
			for (const handler of handlers.get(event) ?? []) handler({ type: event }, ctx);
		},
	};
}

/** The runtime one case draws from: the production factory over the self-made document. */
async function boundRuntime(): Promise<ModelCostRuntime> {
	const root = mkdtempSync(path.join(tmpdir(), "model-cost-viewed-widget-"));
	roots.push(root);
	writeFileSync(path.join(root, CONSUMPTION_FILE), JSON.stringify(TREE), "utf8");
	const double = portDouble({});
	let runtime: ModelCostRuntime | undefined;
	double.bind(MODEL_COST, {
		config: { reader: () => `storageDir: ${root}\nbalanceTtlMs: 30000\ncodexQuotaTtlMs: 15000\n` },
		factory: () => {
			runtime = createModelCostRuntime({
				config: { storageDir: root },
				configDirectory: root,
				userHomeDirectory: root,
				harness: HARNESS,
				data: DATA,
				now: () => CLOCK_AT,
			});
			return runtime.implementation;
		},
	});
	double.deliverSession(OWNER, { session: MAIN });
	await double.initiateRun(OWNER);
	return runtime as ModelCostRuntime;
}

/** The viewed session's own facts as a case states them: main on its monetary pair, effort `high`. */
const VIEWED_MAIN: ViewedFacts = {
	sessionId: "session-main",
	provider: "official",
	model: "model-alpha",
	effort: "high",
	context: { tokens: 1234, contextWindow: 64_000 },
};

/** The subagent's own facts: its own token-only pair, its own effort and its own context. */
const VIEWED_SUB: ViewedFacts = {
	sessionId: "session-sub",
	provider: "go-provider",
	model: "model-alpha",
	effort: "low",
	context: { tokens: 50, contextWindow: 32_000 },
};

/** The bound session's own model, deliberately neither of the two the outlet publishes above. */
const BOUND_MODEL = { provider: "official", id: "model-beta" };

/**
 * The instant this suite's process clock reads, so the pricing season is a fact of the fixture rather
 * than of the hour the suite happens to run at: 11:00 on a Thursday in the data's own +08:00 zone,
 * inside the fixture's peak window, and therefore the peak mark a monetary line carries.
 */
const CLOCK_AT = Date.parse("2026-10-01T03:00:00.000Z");

afterEach(() => {
	while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true });
});

describe("the widget draws the viewed session's own fields and the whole main tree beside them (P21, P22)", () => {
	test("a target switch redraws the current-model fields while Cost and Ref stay the main tree", async () => {
		const runtime = await boundRuntime();
		const { api, fire } = controlApi();
		const session = controlSession({ boundSessionId: "session-main", boundModel: BOUND_MODEL, initial: VIEWED_MAIN });
		attachModelCostWidget(api, runtime, uiBoundaryTimerOf(runtime), "lines");
		fire("session_start", session.ctx);

		// The first draw already reads the viewed session: the main session's own monetary pair, whose
		// ratio is 2000·0.5, 1000·2 and 3000·8 of 27000 — the hand-derived 4:7:89 — and whose tree is
		// main plus its subagent: 6,100 tokens, 0.05 CNY and no reference at all. The monetary line leads
		// with the peak season mark, and the period's own accrual — the main session's 0.05 CNY over the
		// fine bar's single eighth-block — follows it.
		expect(session.lastLines()).toEqual([
			"\u{1F525}  [\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591   0% (1,234/450.0K)]  Effort: high  \u23F3 Accrued: \u00A50.05 [\u258F]",
			"Total:  Cache: 67%  \u00A5Cache/In/Out\uff1a4:7:89  Cost: \u00A50.05  Span: \u2014",
		]);

		// The host's view moves to the subagent: the current-model fields are the subagent's own
		// token-only pair (30/20/0/50, a 40 percent cache hit rate, no ratio and no amount of its own),
		// while Cost and Ref are the very same main tree the previous target showed. A token-only
		// channel has no season of its own to mark and no amount of its own to accrue, so the line it
		// leads with is the bar alone.
		session.publish(VIEWED_SUB);
		expect(session.lastLines()).toEqual([
			"[░░░░░░░░░░░░░░░░░░░░   0% (50/450.0K)]  Effort: low",
			"Total:  Cache: 40%  Cost: \u00A50.05  Span: \u2014",
		]);
	});

	test("a same-target fact change is re-read: the new change shows, not a cached reading", async () => {
		const runtime = await boundRuntime();
		const { api, fire } = controlApi();
		const session = controlSession({ boundSessionId: "session-main", boundModel: BOUND_MODEL, initial: VIEWED_MAIN });
		attachModelCostWidget(api, runtime, uiBoundaryTimerOf(runtime), "lines");
		fire("session_start", session.ctx);

		// The same target, whose effort, context and own current model all changed: every one of them is
		// read again rather than kept from the draw before. The new current model is one this session
		// holds no consumption for, so its own fields are genuinely empty while the tree is not.
		session.publish({
			...VIEWED_MAIN,
			model: "model-beta",
			effort: "medium",
			context: { tokens: 2222, contextWindow: 64_000 },
		});
		expect(session.lastLines()).toEqual([
			"\u{1F525}  [\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591   0% (2,222/450.0K)]  Effort: medium  \u23F3 Accrued: \u00A50.05 [\u258F]",
			"Total:  Cache: -  \u00A5Cache/In/Out\uff1a--:--:--  Cost: \u00A50.05  Span: \u2014",
		]);
	});
});

describe("every displayed fact comes from the public outlet, not from the binding or a configuration (P11)", () => {
	test("a fact the outlet could not obtain is a question mark, and the bound session's model is not borrowed", async () => {
		const runtime = await boundRuntime();
		const { api, fire } = controlApi();
		// The bound session is on `official/model-beta`; the outlet publishes the subagent on its
		// token-only pair with no effort at all. Were the widget to read the binding instead of the
		// outlet, this run would show the monetary pair's cache hit rate of zero and no `?`.
		const session = controlSession({
			boundSessionId: "session-main",
			boundModel: BOUND_MODEL,
			initial: {
				sessionId: "session-sub",
				provider: "go-provider",
				model: "model-alpha",
				context: { tokens: 50, contextWindow: 32_000 },
			},
		});
		attachModelCostWidget(api, runtime, uiBoundaryTimerOf(runtime), "lines");
		fire("session_start", session.ctx);

		// `go-provider/model-alpha` really is token-only: the ratio the bound model would have had is
		// absent, and the hit rate is the subagent's own 20 of 50. An effort the outlet did not state
		// is the question mark the spec asks for — never the bound session's and never a configured one.
		expect(session.lastLines()).toEqual([
			"[░░░░░░░░░░░░░░░░░░░░   0% (50/450.0K)]  Effort: ?",
			"Total:  Cache: 40%  Cost: \u00A50.05  Span: \u2014",
		]);

		// And a context the outlet could not measure is not a bar: the line the bar lives on is dropped
		// rather than filled from another session's reading.
		session.publish({ sessionId: "session-sub", provider: "go-provider", model: "model-alpha" });
		expect(session.lastLines()).toEqual(["Total:  Cache: 40%  Cost: \u00A50.05  Span: \u2014"]);
	});

	test("a mode this extension does not display draws no widget at all, and still draws the tree for one it does", async () => {
		const runtime = await boundRuntime();
		const { api, fire } = controlApi();
		const session = controlSession({ boundSessionId: "session-main", boundModel: BOUND_MODEL, initial: VIEWED_MAIN });
		attachModelCostWidget(api, runtime, uiBoundaryTimerOf(runtime), "lines");
		fire("session_start", session.ctx);
		expect(session.lastLines()).toBeDefined();

		// The view lands on a pair this extension's data does not name: the widget is cleared rather
		// than left showing the previous target's numbers.
		session.publish({ sessionId: "session-sub", provider: "unlisted", model: "no-such" });
		expect(session.lastLines()).toBeUndefined();
	});
});

describe("a switched-away context is dropped rather than kept (S1, S5)", () => {
	test("rebinding subscribes the new context once, stops the previous one and draws on the new one", async () => {
		const runtime = await boundRuntime();
		const { api, fire } = controlApi();
		const first = controlSession({ boundSessionId: "session-main", boundModel: BOUND_MODEL, initial: VIEWED_MAIN });
		const second = controlSession({
			boundSessionId: "session-sub",
			boundModel: { provider: "go-provider", id: "model-alpha" },
			initial: VIEWED_SUB,
		});
		const detach = attachModelCostWidget(api, runtime, uiBoundaryTimerOf(runtime), "lines");

		fire("session_start", first.ctx);
		expect(first.subscribers()).toBe(1);
		expect(first.unsubscribes()).toBe(0);

		// The host moves the binding to another session: the first session's outlet subscription is
		// stopped, the new one is subscribed, and the drawing happens on the session that took over.
		fire("session_switch", second.ctx);
		expect(first.subscribers()).toBe(0);
		expect(first.unsubscribes()).toBe(1);
		expect(second.subscribers()).toBe(1);
		expect(second.lastLines()).toEqual([
			"[░░░░░░░░░░░░░░░░░░░░   0% (50/450.0K)]  Effort: low",
			"Total:  Cache: 40%  Cost: \u00A50.05  Span: \u2014",
		]);

		// A change published on the context the widget left behind no longer reaches it: the stale
		// context is not captured anywhere, so nothing is redrawn from it.
		const framesBefore = first.frames.length;
		first.publish({ ...VIEWED_MAIN, effort: "max", context: { tokens: 9999, contextWindow: 64_000 } });
		expect(first.frames.length).toBe(framesBefore);

		// Detaching stops the live subscription and clears the widget it drew.
		detach();
		expect(second.subscribers()).toBe(0);
		expect(second.unsubscribes()).toBe(1);
		expect(second.lastLines()).toBeUndefined();
	});

	test("a session without a UI is drawn nothing", async () => {
		const runtime = await boundRuntime();
		const { api, fire } = controlApi();
		const session = controlSession({
			boundSessionId: "session-main",
			boundModel: BOUND_MODEL,
			initial: VIEWED_MAIN,
			hasUI: false,
		});
		attachModelCostWidget(api, runtime, uiBoundaryTimerOf(runtime), "lines");
		fire("session_start", session.ctx);
		session.publish(VIEWED_SUB);
		expect(session.frames).toEqual([]);
	});
});

describe("a host without the approved outlet still draws the bound session's own context bar (P10, P67)", () => {
	test("the bar is drawn at initialization from the native reading, never left off the widget", async () => {
		const runtime = await boundRuntime();
		const { api, fire } = controlApi();
		// The host as the global CLI ships before the approved patch: no `getViewedSession()` at all,
		// but the native `getContextUsage()` every host has published all along. There is no separate
		// view here, so the session this widget is bound to is the session being drawn, and the reading
		// is the bar's fact rather than a question mark.
		const session = controlSession({
			boundSessionId: "session-main",
			boundModel: { provider: "official", id: "model-alpha" },
			initial: {},
			patched: false,
			ownContext: { tokens: 1234, contextWindow: 64_000 },
		});
		attachModelCostWidget(api, runtime, uiBoundaryTimerOf(runtime), "lines");
		fire("session_start", session.ctx);

		// The line the bar lives on is drawn from the bound session's own reading, exactly as the
		// outlet path draws it: the fixture's peak season mark, the fixed 450K budget and the count.
		expect(session.lastLines()).toEqual([
			"\u{1F525}  [\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591   0% (1,234/450.0K)]  Effort: ?  \u23F3 Accrued: \u00A50.05 [\u258F]",
			"Total:  Cache: 67%  \u00A5Cache/In/Out\uff1a4:7:89  Cost: \u00A50.05  Span: \u2014",
		]);
	});

	test("the bound session's own actual thinking level is drawn at initialization", async () => {
		const runtime = await boundRuntime();
		const { api, fire } = controlApi({ thinkingLevel: "medium" });
		// The same unpatched host, whose native `getThinkingLevel()` every host has published all
		// along. The effective level is read at the first render, so the effort is the bound session's
		// own actual level rather than the question mark an unavailable outlet leaves.
		const session = controlSession({
			boundSessionId: "session-main",
			boundModel: { provider: "official", id: "model-alpha" },
			initial: {},
			patched: false,
			ownContext: { tokens: 1234, contextWindow: 64_000 },
		});
		attachModelCostWidget(api, runtime, uiBoundaryTimerOf(runtime), "lines");
		fire("session_start", session.ctx);
		expect(session.lastLines()?.some(line => line.includes("Effort: medium"))).toBe(true);
	});

	test("a host that publishes no reading at all is a bar-less widget, not a fabricated zero", async () => {
		const runtime = await boundRuntime();
		const { api, fire } = controlApi();
		const session = controlSession({
			boundSessionId: "session-main",
			boundModel: { provider: "official", id: "model-alpha" },
			initial: {},
			patched: false,
		});
		attachModelCostWidget(api, runtime, uiBoundaryTimerOf(runtime), "lines");
		fire("session_start", session.ctx);
		expect(session.lastLines()?.[0]).toBe("\u{1F525}  \u23F3 Accrued: \u00A50.05 [\u258F]");
	});
});
