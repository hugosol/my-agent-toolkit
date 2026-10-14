/**
 * The one peak/valley boundary wait of a CLI UI (P41; S2).
 *
 * The seam under test is production: the extension's real definition is bound through the framework's
 * public binding (the port double), the runtime is the one `createModelCostRuntime` builds — its own
 * clock injected, so the boundary instants below are hand-computed facts of a controlled time rather
 * than whatever the wall clock says while this suite runs — and the frontend is the production
 * `attachModelCostWidget`, driven through a *controlled host* standing in for the patched one: a
 * session context publishing whatever facts a case states, a `setWidget` that records every frame, and
 * the host's own managed one-shot timer (`setTimeout`/`clearTimer`) recorded instead of scheduled.
 *
 * What the cases read is what the operator's UI would be told: the widget frames, and the timer the UI
 * armed. The schedule every expected delay comes from is the fixture's own two windows in the data's
 * +08:00 zone — [09:00, 12:00] and [14:00, 18:00], both endpoints inclusive, so the first off-peak
 * millisecond of the midday window is 12:00:00.001 — and every figure below is computed by hand from
 * the instant a case sets.
 *
 * The negative half is as important as the positive one: the cases assert that a target switch
 * rebuilds nothing, that a headless session arms nothing, that the frontend's own release — the half
 * the binding's single cleanup reaches — cancels the timeout the UI is holding, and that neither a
 * redraw nor the boundary itself reaches the network, the consumption document or the accounting.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { OmpExtensionApi, OmpSessionContext } from "../../framework/adapters/omp";
import { MODEL_COST } from "../../extensions/model-cost/definition";
import { releasingFrontendOnCleanup } from "../../extensions/model-cost/harnesses/omp";
import type { BoundaryTimer } from "../../extensions/model-cost/harnesses/omp/boundary-timer";
import { MODEL_COST_WIDGET_KEY, attachModelCostWidget } from "../../extensions/model-cost/harnesses/omp/widget";
import type { ConsumptionDocument } from "../../extensions/model-cost/shared-logic/consumption-document";
import type { ModelPricingData } from "../../extensions/model-cost/shared-logic/model-data";
import type { ModelCostRuntime } from "../../extensions/model-cost/shared-logic/runtime";
import { createModelCostRuntime } from "../../extensions/model-cost/shared-logic/runtime";
import type { OwnerReference, SessionFacts } from "../../framework/core/protocol";
import { type PortDouble, portDouble } from "../framework/support/harness-port-double";
import { uiBoundaryTimerOf } from "./support/ui-timer";

/** The fixture's pricing data: one monetary tier and the two workday windows of the data's own zone. */
const DATA: ModelPricingData = {
	currency: "XTS",
	unit: "XTS per million tokens",
	peakMultiplier: 3,
	zoneOffsetMinutes: 8 * 60,
	peakWindows: [
		{ fromMinute: 9 * 60, toMinute: 12 * 60 },
		{ fromMinute: 14 * 60, toMinute: 18 * 60 },
	],
	tiers: { alpha: { input: 2, cacheRead: 0.5, output: 8 } },
	allowanceProviders: [],
	models: { official: { "model-alpha": { mode: "monetary", tier: "alpha" } } },
};

const HARNESS = "probe-harness";
const MAIN: SessionFacts = { sessionId: "session-main", kind: "main", name: "主会话", unavailable: [] };
const OWNER: OwnerReference = { kind: "owner", key: "main:boundary-timer" };
const CONSUMPTION_FILE = "consumption.json";

/** The instant every case starts from: Thursday 2026-10-01 11:00 in the data's +08:00 zone, peak. */
const PEAK_AT = Date.parse("2026-10-01T03:00:00.000Z");
/** The instant the midday window's endpoint passes: 12:00:00.000 in the zone, still peak. */
const ENDPOINT_AT = Date.parse("2026-10-01T04:00:00.000Z");
/** The instant the small hours of the following day hold: 13:30 in the zone, off-peak. */
const AFTER_SLEEP_AT = Date.parse("2026-10-01T05:30:00.000Z");
/** One minute in milliseconds, for the hand-computed delays below. */
const MINUTE_MS = 60_000;

/** The document every case loads: the main session's own accrual, in an ordinary (non-holiday) period. */
const DOCUMENT = (holiday: boolean): ConsumptionDocument =>
	({
		schemaVersion: 1,
		periodId: "period-boundary-timer",
		start: "2026-10-01T00:00:00.000Z",
		holiday,
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
				],
			},
		},
	}) as unknown as ConsumptionDocument;

/** Every root this file created, removed after each case. */
const roots: string[] = [];

/** The clock a case drives: the runtime's own instant source, advanced by hand. */
interface Clock {
	now: number;
}

/** One armed timeout as the controlled host recorded it. */
interface ArmedTimeout {
	readonly delayMs: number;
	readonly callback: () => void;
}

/** What the controlled host recorded about the timers the UI asked it to manage. */
interface TimerLog {
	readonly armed: ArmedTimeout[];
	readonly armedHandles: unknown[];
	readonly cancelled: unknown[];
}

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

/** One controlled host session: the frames it drew, the facts it publishes and its managed timers. */
interface ControlledHost {
	readonly ctx: OmpSessionContext;
	publish(facts: ViewedFacts): void;
	/** The lines of the last widget this host was told to show, or nothing when it was cleared. */
	lastLines(): readonly string[] | undefined;
	/** How many widget frames this host was handed, clears included. */
	frames(): number;
}

/**
 * A controlled host session whose managed timer surface is recorded rather than scheduled.
 *
 * The handle `setTimeout` answers with is the recorded arm itself, so a case can see exactly which
 * handle was cancelled; the callbacks are fired by hand, which is what makes the boundary instant a
 * fact of this suite's clock rather than of a real timeout.
 */
function controlledHost(options: {
	readonly boundSessionId: string;
	readonly initial: ViewedFacts;
	readonly hasUI?: boolean;
	readonly kind?: "main" | "sub";
	readonly log: TimerLog;
	/** The instant the host's own scheduled callback would run at, when a case fires it by hand. */
	readonly clock: Clock;
}): ControlledHost {
	let facts = options.initial;
	const listeners = new Set<(facts: ViewedFacts) => void>();
	const drawn: DrawnFrame[] = [];
	const ctx = {
		agent: { kind: options.kind ?? "main", id: options.kind === "sub" ? "Sub" : "Main" },
		hasUI: options.hasUI ?? true,
		ui: {
			notify: () => {},
			setWidget: (key: string, content: readonly string[] | undefined): void => {
				drawn.push({ key, lines: content });
			},
		},
		sessionManager: { getSessionId: () => options.boundSessionId, getBranch: () => [] },
		model: { provider: "official", id: "model-alpha" },
		getViewedSession: () => facts,
		subscribeViewedSessionChanged: (listener: (facts: ViewedFacts) => void): (() => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		setTimeout: (callback: () => void, delayMs: number): unknown => {
			const armed = { delayMs, callback };
			options.log.armed.push(armed);
			options.log.armedHandles.push(armed);
			return armed;
		},
		clearTimer: (timer: unknown): void => {
			options.log.cancelled.push(timer);
		},
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

/** A controlled extension API: it records the frontend's handlers so a case can fire a session event. */
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

/** Everything one case works with: the document's root, the runtime it built and what it observed. */
interface BoundBoundary {
	readonly runtime: ModelCostRuntime;
	readonly double: PortDouble;
	readonly clock: Clock;
	readonly timer: BoundaryTimer;
	readonly log: TimerLog;
	/** How many outbound HTTP calls the extension's own provider queries made. */
	requests(): number;
	/** The consumption document as it stands on disk right now. */
	documentText(): string;
}

/**
 * Binds the real extension over one baseline document with a controlled clock, and builds the UI's one
 * boundary timer over the runtime's own presentation result.
 */
async function bindBoundary(options: { readonly holiday?: boolean; readonly from?: number } = {}): Promise<BoundBoundary> {
	const root = mkdtempSync(path.join(tmpdir(), "model-cost-boundary-"));
	roots.push(root);
	const file = path.join(root, CONSUMPTION_FILE);
	writeFileSync(file, JSON.stringify(DOCUMENT(options.holiday ?? false)), "utf8");
	const clock: Clock = { now: options.from ?? PEAK_AT };
	const log: TimerLog = { armed: [], armedHandles: [], cancelled: [] };
	let requests = 0;
	const double = portDouble();
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
				now: () => clock.now,
				httpRequest: () => {
					requests += 1;
					return Promise.reject(new Error("this suite makes no request"));
				},
			});
			return runtime.implementation;
		},
	});
	double.deliverSession(OWNER, { session: MAIN });
	double.deliverSession(OWNER, { event: { kind: "session_facts" }, session: MAIN });
	await double.initiateRun(OWNER);
	const built = runtime as ModelCostRuntime;
	const timer = uiBoundaryTimerOf(built);
	return {
		runtime: built,
		double,
		clock,
		timer,
		log,
		requests: () => requests,
		documentText: () => readFileSync(file, "utf8"),
	};
}

/** The viewed session's own facts: the main session on its monetary pair, with a context reading. */
const VIEWED: ViewedFacts = {
	sessionId: "session-main",
	provider: "official",
	model: "model-alpha",
	effort: "high",
	context: { tokens: 1000, contextWindow: 64_000 },
};

afterEach(() => {
	while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true });
});

describe("the UI waits once for the next season change (P41)", () => {
	test("one session's UI arms exactly one timeout, at the instant the schedule states after the endpoint", async () => {
		const bound = await bindBoundary();
		const { api, fire } = controlApi();
		const host = controlledHost({
			boundSessionId: "session-main",
			initial: VIEWED,
			log: bound.log,
			clock: bound.clock,
		});
		attachModelCostWidget(api, bound.runtime, bound.timer, "lines");
		fire("session_start", host.ctx);

		// 11:00 in the zone is inside the midday window, and the window's endpoint is inclusive: the
		// first instant whose season differs is 12:00:00.001, an hour and one millisecond after the
		// reading. Exactly one timeout was armed for it, and the draw already carries the peak mark.
		expect(bound.log.armed).toHaveLength(1);
		expect(bound.log.armed[0]?.delayMs).toBe(60 * MINUTE_MS + 1);
		expect(host.lastLines()?.[0]?.startsWith("\u{1F525}")).toBe(true);
	});

	test("a reading exactly on the endpoint waits one millisecond rather than the next window", async () => {
		const bound = await bindBoundary({ from: ENDPOINT_AT });
		const { api, fire } = controlApi();
		const host = controlledHost({
			boundSessionId: "session-main",
			initial: VIEWED,
			log: bound.log,
			clock: bound.clock,
		});
		attachModelCostWidget(api, bound.runtime, bound.timer, "lines");
		fire("session_start", host.ctx);

		// 12:00:00.000 itself is still peak, so the season changes one millisecond later — the same
		// one-millisecond wait on the instant, not the four hours until the afternoon window opens.
		expect(bound.log.armed).toHaveLength(1);
		expect(bound.log.armed[0]?.delayMs).toBe(1);
	});

	test("a session and its subagent share the one wait, and a target switch rebuilds nothing", async () => {
		const bound = await bindBoundary();
		// Each session binds the extension through its own api, exactly as the host hands each session
		// its own: one session's event never reaches another session's frontend.
		const mainApi = controlApi();
		const subApi = controlApi();
		const main = controlledHost({
			boundSessionId: "session-main",
			initial: VIEWED,
			log: bound.log,
			clock: bound.clock,
		});
		const sub = controlledHost({
			boundSessionId: "session-sub",
			initial: VIEWED,
			kind: "sub",
			log: bound.log,
			clock: bound.clock,
		});
		attachModelCostWidget(mainApi.api, bound.runtime, bound.timer, "lines");
		mainApi.fire("session_start", main.ctx);
		attachModelCostWidget(subApi.api, bound.runtime, bound.timer, "lines");
		subApi.fire("session_start", sub.ctx);

		// Two frontends draw one process-wide reading, so the second registration adds a redraw and not
		// a second timeout; and a switch of the displayed target re-reads through the same schedule,
		// which is why nothing is cancelled or armed again.
		expect(bound.log.armed).toHaveLength(1);
		expect(bound.log.cancelled).toEqual([]);

		main.publish({ sessionId: "session-main", provider: "official", model: "model-alpha", effort: "low" });
		expect(bound.log.armed).toHaveLength(1);
		expect(bound.log.cancelled).toEqual([]);
	});

	test("a boundary the process slept through is corrected from the actual time, not replayed", async () => {
		const bound = await bindBoundary();
		const { api, fire } = controlApi();
		const host = controlledHost({
			boundSessionId: "session-main",
			initial: VIEWED,
			log: bound.log,
			clock: bound.clock,
		});
		attachModelCostWidget(api, bound.runtime, bound.timer, "lines");
		fire("session_start", host.ctx);
		const first = bound.log.armed[0] as ArmedTimeout;

		// The process was blocked past the boundary it armed for: the clock now reads 13:30 in the zone,
		// off-peak, and the callback runs then. The redraw shows the new season, and the next wait is
		// measured from that actual instant — 14:00:00.000 is thirty minutes away, not the hour the
		// missed boundary would have left if the schedule were replayed.
		bound.clock.now = AFTER_SLEEP_AT;
		first.callback();

		expect(bound.log.armed).toHaveLength(2);
		expect(bound.log.armed[1]?.delayMs).toBe(30 * MINUTE_MS);
		expect(host.lastLines()?.[0]?.startsWith("\u{1F319}")).toBe(true);
	});

	test("a holiday period has no boundary ahead of it, so nothing is armed and the mark says so", async () => {
		const bound = await bindBoundary({ holiday: true });
		const { api, fire } = controlApi();
		const host = controlledHost({
			boundSessionId: "session-main",
			initial: VIEWED,
			log: bound.log,
			clock: bound.clock,
		});
		attachModelCostWidget(api, bound.runtime, bound.timer, "lines");
		fire("session_start", host.ctx);

		// Every instant of a holiday period is off-peak, so no instant ahead differs: the UI waits for
		// nothing, and the period's own mark is what the line carries.
		expect(bound.log.armed).toEqual([]);
		expect(host.lastLines()?.[0]?.startsWith("\u{1F3D6}\u{FE0F}")).toBe(true);
	});
});

describe("the wait belongs to the UI's lifetime, not to a session's (P41)", () => {
	test("a headless session draws nothing and arms nothing", async () => {
		const bound = await bindBoundary();
		const { api, fire } = controlApi();
		const host = controlledHost({
			boundSessionId: "session-main",
			initial: VIEWED,
			hasUI: false,
			log: bound.log,
			clock: bound.clock,
		});
		attachModelCostWidget(api, bound.runtime, bound.timer, "lines");
		fire("session_start", host.ctx);

		// No UI means no widget and no drawing timer at all: the business result behind it is untouched.
		expect(host.frames()).toBe(0);
		expect(bound.log.armed).toEqual([]);
	});

	test("the frontend's own release cancels the timeout the UI holds and clears the widget", async () => {
		const bound = await bindBoundary();
		const { api, fire } = controlApi();
		const host = controlledHost({
			boundSessionId: "session-main",
			initial: VIEWED,
			log: bound.log,
			clock: bound.clock,
		});
		const release = attachModelCostWidget(api, bound.runtime, bound.timer, "lines");
		fire("session_start", host.ctx);
		const armedHandle = bound.log.armedHandles[0];

		// The release is the frontend's own half, and it is what the binding's one cleanup reaches in
		// production (the case below): nothing this frontend held outlives the session it drew through.
		release();

		// The armed handle is cancelled, exactly once, and the widget is cleared: nothing this frontend
		// held outlives the session it drew through, and no further timeout is armed for it.
		expect(bound.log.cancelled).toEqual([armedHandle]);
		expect(host.lastLines()).toBeUndefined();
		expect(bound.log.armed).toHaveLength(1);
	});

	test("the binding's own cleanup releases the frontend, and then runs the instance's own", () => {
		const calls: string[] = [];
		const implementation = releasingFrontendOnCleanup(
			{ cleanup: () => void calls.push("instance") },
			() => void calls.push("frontend"),
		);

		implementation.cleanup?.();

		// The dispose front-end is the framework's — its one cleanup, run when the session that
		// initialized the instance ends — so this is the whole of what reaches the frontend: the
		// extension's own frontend is released first, and the instance's cleanup then runs, so nothing
		// is drawn through an accumulation that is being closed.
		expect(calls).toEqual(["frontend", "instance"]);
	});

	test("neither a redraw nor the boundary itself reaches the network, the file or the accounting", async () => {
		const bound = await bindBoundary();
		const { api, fire } = controlApi();
		const host = controlledHost({
			boundSessionId: "session-main",
			initial: VIEWED,
			log: bound.log,
			clock: bound.clock,
		});
		attachModelCostWidget(api, bound.runtime, bound.timer, "lines");
		const before = bound.documentText();
		const own = bound.runtime.view.own("session-main");

		fire("session_start", host.ctx);
		bound.clock.now = AFTER_SLEEP_AT;
		(bound.log.armed[0] as ArmedTimeout).callback();

		// A render and a boundary redraw are reads: no request was made, the document on disk is byte
		// for byte what it was, and the accounting behind the reading did not move.
		expect(bound.requests()).toBe(0);
		expect(bound.documentText()).toBe(before);
		expect(bound.runtime.view.own("session-main")).toEqual(own);
	});
});
