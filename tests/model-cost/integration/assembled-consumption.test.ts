/**
 * The extension with every change assembled: the main session's own span beside its two parallel
 * subagents' own activity intervals as one process really draws them, and the same run read again —
 * document and drawing both — by a new process over the storage the first one committed to (P9; and
 * P24's combination item: all of the changes together, through a normal consumption commit and a
 * reload).
 *
 * The seam is production throughout: the extension's real definition bound through the framework's
 * public binding (the port double, `tests/framework/support/harness-port-double.ts`), the runtime
 * `createModelCostRuntime` builds with the harness's own model prices travelling the production
 * route, `/budget detail` driven the way an operator drives it, the extension's own frontend —
 * `attachModelCostWidget` — attached to a controlled host that stands in for the patched one, and
 * that host's own `setWidget` lines, which is what the operator reads. `runtime.presentation.of(target)`
 * is read behind them, and the document on the storage root is read off the disk the run really wrote.
 *
 * What this file states and no case in a single-feature suite can: the quantities the requirement is
 * *about* are the ones given here by hand, with the whole assembly in the same run. The main session
 * is given ten minutes of wall clock — its own submission, its own Round ending 600,000 ms later —
 * while two subagents each run one activity of their own inside that Round, six minutes apiece, so a
 * Total that added the two intervals to the 10-minute span could not read `0:10:00`. The money, the
 * reference amount and every bucket count come from the self-made usage and price data of this file;
 * the intervals are this file's own timeline — the instant each of those sessions' Round opened and
 * the instant it ended — so every elapsed figure below is arithmetic on two instants written here and
 * never a duration the implementation derived. 
 *
 * The second process is the reload the storage promises: the same root, a new runtime, a new binding
 * and a new frontend, with nothing but the document the first process committed to read from. A
 * figure the first process only held in memory would be missing there, which is why the drawn rows
 * and the restored records are read on both sides.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { OmpExtensionApi, OmpSessionContext } from "../../../adapters/omp";
import { MODEL_COST } from "../../../extensions/model-cost/definition";
import { MODEL_COST_WIDGET_KEY, attachModelCostWidget, textColumns } from "../../../extensions/model-cost/harnesses/omp/widget";
import type { ConsumptionDocument, SessionRecord } from "../../../extensions/model-cost/shared-logic/foundation/session/consumption-document"
import type { ModelPricingData } from "../../../extensions/model-cost/shared-logic/business/pricing/model-data";
import { totalColumns, totalText } from "../../../extensions/model-cost/shared-logic/presentation/display";
import {
	type ModelCostRuntime,
	createModelCostRuntime,
	modelCostImplementation,
} from "../../../extensions/model-cost/shared-logic/runtime";
import type { CatalogPrice, CatalogPriceSource } from "../../../framework/interface/provider";
import type { SessionFacts, TurnUsage } from "../../../framework/interface/session";
import type { OwnerReference } from "../../../framework/interface/state";
import type { TurnSignal } from "../../../framework/runtime/port";
import { type PortDouble, portDouble } from "../../framework/support/harness-port-double";
import { controlApi } from "../support/control-api";
import { uiBoundaryTimerOf } from "../support/ui-timer";

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

/** The allowance channel's own price, in USD, as the harness's catalog states it. */
const CODEX_PRICE: CatalogPrice = {
	currency: "USD",
	unit: "USD per million tokens",
	amounts: { input: 1, cacheRead: 1, cacheWrite: 2, output: 2 },
};

/** The harness's own model prices: the allowance provider's model at those four amounts, nothing else. */
const HARNESS_PRICES: CatalogPriceSource = {
	priceOf: (provider, model) =>
		provider === "plan-provider" && model === "codex-model" ? CODEX_PRICE : undefined,
};

const HARNESS = "probe-harness";
const CONSUMPTION_FILE = "consumption.json";
const MAIN_NAME = "主会话";
/** The handle each spawned session's start reports, and the name its row is drawn by. */
const CHILD_A_HANDLE = "检索定价";
const CHILD_B_HANDLE = "定价核查";
const GRAND_HANDLE = "复核抽样";
const MAIN: SessionFacts = { sessionId: "session-main", kind: "main", name: MAIN_NAME, unavailable: [] };
/** The first of the two parallel subagents, spawned by the main session. */
const CHILD_A: SessionFacts = {
	sessionId: "session-child-a",
	kind: "sub",
	parentSessionId: MAIN.sessionId,
	agentName: "task",
	agentId: CHILD_A_HANDLE,
	taskName: CHILD_A_HANDLE,
	name: CHILD_A_HANDLE,
	unavailable: [],
};
/** The second parallel subagent: a different agent kind, under the same parent. */
const CHILD_B: SessionFacts = {
	sessionId: "session-child-b",
	kind: "sub",
	parentSessionId: MAIN.sessionId,
	agentName: "scout",
	agentId: CHILD_B_HANDLE,
	taskName: CHILD_B_HANDLE,
	name: CHILD_B_HANDLE,
	unavailable: [],
};
/** The third depth: a grandchild of the main session, spawned by the first child. */
const GRAND: SessionFacts = {
	sessionId: "session-grand",
	kind: "sub",
	parentSessionId: CHILD_A.sessionId,
	agentName: "task",
	agentId: GRAND_HANDLE,
	taskName: GRAND_HANDLE,
	name: GRAND_HANDLE,
	unavailable: [],
};

const OWNER: OwnerReference = { kind: "owner", key: "main:assembled" };
/** The main session's own current pair, which every reading is taken against. */
const MAIN_TARGET = { sessionId: MAIN.sessionId, provider: "official", model: "model-alpha" } as const;

/**
 * The instant the main session's own submission is observed at: 08:00 in the data's own +08:00 zone,
 * an off-peak hour, so every amount below is the tier's own off-peak price whatever the wall clock
 * says when the suite runs.
 */
const T0 = Date.parse("2026-10-01T00:00:00.000Z");

/** The main session's own span this run is given: the input above, and its last Turn's settle ten minutes on. */
const MAIN_SPAN_MS = 600_000;
/** What each of the two parallel subagents' own activity ran for, between its Round's own two edges. */
const PARALLEL_ACTIVITY_MS = 360_000;
/** The grandchild's own activity, one depth down: two minutes. */
const GRAND_ACTIVITY_MS = 120_000;

/**
 * The usage each request reports, as the harness's own wire numbers: four buckets a case can add up
 * by hand, and the amounts the data's off-peak tier (2, 0.5 and 8 per million) makes of them.
 */
const USAGE_MAIN: TurnUsage = { input: 1_000, cacheRead: 8_000, cacheWrite: 0, output: 3_000, totalTokens: 12_000 };
const USAGE_CHILD_A: TurnUsage = { input: 1_000, cacheRead: 2_000, cacheWrite: 0, output: 2_125, totalTokens: 5_125 };
const USAGE_CHILD_B: TurnUsage = { input: 8_000, cacheRead: 2_000, cacheWrite: 1_000, output: 4_000, totalTokens: 15_000 };
const USAGE_GRAND: TurnUsage = { input: 30, cacheRead: 20, cacheWrite: 0, output: 50, totalTokens: 100 };

/**
 * The amounts those usages make, hand-computed from the two self-made prices above and never read
 * back off anything: `1000·2 + 8000·0.5 + 3000·8` of a million is 0.03 CNY; `1000·2 + 2000·0.5 +
 * 2125·8` is 0.02 CNY; the allowance channel's `8000·1 + 2000·1 + 1000·2 + 4000·2` is 0.02 USD.
 */
const MAIN_CNY = 0.03;
const CHILD_A_CNY = 0.02;
const TREE_CNY = MAIN_CNY + CHILD_A_CNY;
const TREE_REFERENCE_USD = 0.02;

/** The startup facts each spawned session's own start reports, as the host resolves them. */
const CHILD_A_STARTUP = { model: { provider: "official", model: "model-alpha" }, effort: "high" };
const CHILD_B_STARTUP = { model: { provider: "plan-provider", model: "codex-model" }, effort: "low" };
const GRAND_STARTUP = { model: { provider: "go-provider", model: "model-alpha" }, effort: "medium" };

/**
 * The context reading the host publishes for the session it is displaying: the operator's own view of
 * the main session, given here so the drawn bar and the display's own `context` are checked against a
 * figure this file wrote rather than whatever a host happens to report.
 */
const VIEWED_CONTEXT = { tokens: 90_000, contextWindow: 128_000 };
/**
 * The context reading one descendant's own binding publishes after the reload: a quarter of a million
 * tokens over a half-million budget, read against the monetary channel's own fixed display budget of
 * 450,000 — 50 percent, and the tokens as the display writes them.
 */
const CHILD_A_CONTEXT_TOKENS = 225_000;
const CHILD_A_CONTEXT_TEXT = "50% (225.0K/450.0K)";

/**
 * The process's one clock, driven by hand: a delivery states *that* an input or a Round end arrived,
 * and the instant above is this file's own, so every elapsed figure below is arithmetic on two
 * instants written here.
 */
let clock = T0;

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

/** One controlled host session: the facts it publishes, and the widget lines it was handed. */
interface ControlledHost {
	readonly ctx: OmpSessionContext;
	publish(facts: ViewedFacts): void;
	/** The lines of the last widget this host was told to show, or nothing when it was cleared. */
	lastLines(): readonly string[] | undefined;
}

/** A controlled host session, publishing the main session as the one the operator is displaying. */
function controlledHost(): ControlledHost {
	let facts: ViewedFacts = { sessionId: MAIN.sessionId, provider: "official", model: "model-alpha" };
	let shown: readonly string[] | undefined;
	const listeners = new Set<(facts: ViewedFacts) => void>();
	const ctx = {
		agent: { kind: "main", id: "Main" },
		hasUI: true,
		ui: {
			notify: () => {},
			setWidget: (key: string, content: readonly string[] | undefined): void => {
				if (key === MODEL_COST_WIDGET_KEY) shown = content;
			},
		},
		sessionManager: { getSessionId: () => MAIN.sessionId, getBranch: () => [] },
		model: { provider: "official", id: "model-alpha" },
		getViewedSession: () => facts,
		subscribeViewedSessionChanged: (listener: (facts: ViewedFacts) => void): (() => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		// The session's managed timer surface, present and quiet: this suite draws the display itself and
		// the UI's one boundary wait is driven by `boundary-timer.test.ts`.
		setTimeout: () => undefined,
		clearTimer: () => {},
	} as unknown as OmpSessionContext;
	return {
		ctx,
		publish(next) {
			facts = next;
			for (const listener of [...listeners]) listener(next);
		},
		lastLines: () => shown,
	};
}

/** One process over one storage root: the runtime, the double driving it, and the host drawing it. */
interface Bound {
	readonly runtime: ModelCostRuntime;
	readonly double: PortDouble;
	readonly host: ControlledHost;
	readonly root: string;
	readonly file: string;
}

/**
 * Binds the real extension over one storage root and attaches the production frontend to a controlled
 * host.
 *
 * With no root named, a fresh, empty one is used: the run below accounts everything of its own and the
 * commit writes the period's document itself. Naming a root binds a second process over the storage
 * the first one wrote, which is how a restart is modelled here.
 */
async function bind(options: { readonly root?: string } = {}): Promise<Bound> {
	const root = options.root ?? mkdtempSync(path.join(tmpdir(), "model-cost-assembled-"));
	if (options.root === undefined) roots.push(root);
	const file = path.join(root, CONSUMPTION_FILE);
	const double = portDouble({ modelPrices: HARNESS_PRICES });
	let runtime: ModelCostRuntime | undefined;
	double.bind(MODEL_COST, {
		config: { reader: () => `storageDir: ${root}\nbalanceTtlMs: 30000\ncodexQuotaTtlMs: 15000\n` },
		factory: modelCostImplementation(context => {
			runtime = createModelCostRuntime({
				config: { storageDir: root },
				configDirectory: root,
				userHomeDirectory: root,
				harness: HARNESS,
				data: DATA,
				session: context.session,
				now: () => clock,
				...(context.modelPrices === undefined ? {} : { modelPrices: context.modelPrices }),
			});
			return runtime;
		}),
	});
	double.deliverSession(OWNER, { session: MAIN });
	double.deliverSession(OWNER, { event: { kind: "session_facts" }, session: MAIN });
	await double.initiateRun(OWNER);
	const built = runtime as ModelCostRuntime;
	const host = controlledHost();
	const { api, fire } = controlApi();
	attachModelCostWidget(api, built, uiBoundaryTimerOf(built), "lines");
	fire("session_start", host.ctx);
	return { runtime: built, double, host, root, file };
}

/** One session's start, carrying the facts its own binding read when it began. */
function announceStart(
	bound: Bound,
	session: SessionFacts,
	startup: { readonly model: { readonly provider: string; readonly model: string }; readonly effort?: string },
): void {
	bound.double.deliverSession(OWNER, {
		event: { kind: "session_start", reason: "initial" },
		session: { ...session, startup, unavailable: [] },
	});
	bound.double.deliverRound(OWNER, { event: { kind: "round_start" }, session });
}

/** One subagent's whole piece of the run, as its own binding delivers it. */
interface Subagent {
	readonly session: SessionFacts;
	/** The model and level that session's own start reports. */
	readonly startup: { readonly model: { readonly provider: string; readonly model: string }; readonly effort?: string };
	/** The instant its own request begins at, inside the main session's Round. */
	readonly at: number;
	readonly provider: string;
	readonly model: string;
	readonly usage: TurnUsage;
	/** The instant this session's own Round opens at: where its one activity begins. */
	readonly from: number;
	/** What that activity runs for, which is what its Round's two edges make of it. */
	readonly activityMs: number;
}

/**
 * One subagent's start, its own settled request, and its own Round ending — the activity its own
 * runtime is made of.
 *
 * That Round end is the subagent's own existing commit — the one a spawned session's own binding
 * drives when its work settles — and it is what carries this session's runtime and consumption into
 * the document: the interval is measured from the instant this file opened the Round at to the
 * instant it states for its end, and nothing here writes a file of its own.
 */
function runSubagent(bound: Bound, subagent: Subagent): void {
	clock = subagent.from;
	announceStart(bound, subagent.session, subagent.startup);
	settleTurn(bound, subagent.session, subagent.at, subagent.provider, subagent.model, subagent.usage);
	clock = subagent.from + subagent.activityMs;
	bound.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: subagent.session });
}

/** One request of one session, settled with the usage it reported: the extension's existing account. */
function settleTurn(
	bound: Bound,
	session: SessionFacts,
	at: number,
	provider: string,
	model: string,
	usage: TurnUsage,
): void {
	const started: TurnSignal = { kind: "request_started", session, at, provider, model };
	const settled: TurnSignal = {
		kind: "response_settled",
		session,
		at: at + 60_000,
		outcome: "completed",
		readings: [usage],
	};
	bound.double.deliverTurn(started, { owner: OWNER });
	bound.double.deliverTurn(settled, { owner: OWNER });
}

/**
 * The one run every case reads: the main session's own submission, its last Turn settling ten minutes
 * later, and its Round ending at that same instant, and — inside that same Round — two parallel
 * subagents whose own activities ran 360,000 ms apiece, plus one grandchild under the first of them.
 *
 * Both of the parallel subagents' requests run inside the same wall-clock interval (at +100 s and
 * +200 s of the main Round), which is what makes their 6 minutes *parallel* time rather than two more
 * spans appended to the main session's own. Each of them also ends its own Round, so its runtime and
 * its consumption are committed by its own existing commit; the main session's Round end is the
 * commit that carries the span. Every interval a commit is to carry has been settled before it.
 */
function runAssembled(bound: Bound): void {
	clock = T0;
	bound.double.deliverUserInput(OWNER, { session: MAIN });
	bound.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: MAIN });
	// The main session's own Turn: its request begins nine minutes in, and its response settles exactly
	// at T0 + MAIN_SPAN_MS — the instant its Round also ends, an ordinary minute after that request went
	// out. The span's end is that Turn's own settle, and the Round's end is the commit that carries it.
	settleTurn(bound, MAIN, T0 + MAIN_SPAN_MS - 60_000, "official", "model-alpha", USAGE_MAIN);

	runSubagent(bound, {
		session: CHILD_A,
		startup: CHILD_A_STARTUP,
		at: T0 + 100_000,
		provider: "official",
		model: "model-alpha",
		usage: USAGE_CHILD_A,
		from: T0 + 90_000,
		activityMs: PARALLEL_ACTIVITY_MS,
	});
	runSubagent(bound, {
		session: CHILD_B,
		startup: CHILD_B_STARTUP,
		at: T0 + 200_000,
		provider: "plan-provider",
		model: "codex-model",
		usage: USAGE_CHILD_B,
		from: T0 + 190_000,
		activityMs: PARALLEL_ACTIVITY_MS,
	});
	runSubagent(bound, {
		session: GRAND,
		startup: GRAND_STARTUP,
		at: T0 + 300_000,
		provider: "go-provider",
		model: "model-alpha",
		usage: USAGE_GRAND,
		from: T0 + 290_000,
		activityMs: GRAND_ACTIVITY_MS,
	});

	// The main session's Round ends ten minutes after its own submission, and that end is its commit.
	clock = T0 + MAIN_SPAN_MS;
	bound.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: MAIN });
}

/** One turn of the event loop, so a case can wait for the commit's own asynchronous publish. */
function nextTick(): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>();
	setImmediate(resolve);
	return promise;
}

/** The document the run committed, once it holds the record the case waits for. */
async function savedDocument(file: string, accept: (document: ConsumptionDocument) => boolean): Promise<ConsumptionDocument> {
	const deadline = Date.now() + 5_000;
	for (;;) {
		if (existsSync(file)) {
			const document = JSON.parse(readFileSync(file, "utf8")) as ConsumptionDocument;
			if (accept(document)) return document;
		}
		if (Date.now() > deadline) throw new Error(`no consumption document the case expects was published at ${file}`);
		await nextTick();
	}
}

/** One session's record in a document, or nothing while the document holds none for that id. */
function recordOf(document: ConsumptionDocument, id: string): SessionRecord | undefined {
	return Object.values(document.harnesses)
		.flatMap(bucket => bucket.sessions)
		.find(record => record.id === id);
}

/** The Total line of one drawing. */
function totalLineOf(lines: readonly string[]): string {
	const line = lines.find(candidate => candidate.startsWith("Total: "));
	if (line === undefined) throw new Error(`the Total was not drawn: ${JSON.stringify(lines)}`);
	return line;
}

/** The tree's own session rows, in the order they were drawn: the agent nodes and nothing else. */
function sessionRowsOf(lines: readonly string[]): readonly string[] {
	return lines.filter(line => line.includes("\u251C\u2500 ") || line.includes("\u2514\u2500 "));
}

/** The row drawn for one session, by the name the display decided to call it. */
function rowOf(lines: readonly string[], name: string): string {
	const row = sessionRowsOf(lines).find(
		line => (line.replace(/^(?:\u2502  )*[\u251C\u2514]\u2500 /, "").split(/\s{2,}/)[0] as string) === name,
	);
	if (row === undefined) throw new Error(`no row was drawn for ${name}: ${JSON.stringify(lines)}`);
	return row;
}

/**
 * The display column one text starts at in one drawn line, measured the way a terminal measures it:
 * the line's characters before the text, each counted as the terminal counts it.
 */
function columnOf(line: string, text: string): number {
	const at = line.indexOf(text);
	if (at < 0) throw new Error(`${JSON.stringify(text)} is not on ${JSON.stringify(line)}`);
	return textColumns(line.slice(0, at));
}

afterEach(() => {
	while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true });
});

describe("the Total's time is the main session's span, beside its subagents' own runtimes (P9)", () => {
	test("a ten-minute main span with two parallel six-minute subagents is still ten minutes", async () => {
		const bound = await bind();
		runAssembled(bound);
		bound.host.publish({ sessionId: MAIN.sessionId, provider: "official", model: "model-alpha" });

		const display = bound.runtime.presentation.of(MAIN_TARGET);
		// The main session's own two observed instants, and nothing else, are what its span is: ten
		// minutes from its own submission to its own last Turn's settle, which is the instant its Round
		// also ended at.
		expect(display.span).toEqual({ startAt: T0, endAt: T0 + MAIN_SPAN_MS, elapsedMs: MAIN_SPAN_MS });

		// The brief the entry is in before it is flipped: its Total ends with that same span, written as
		// the display writes it, and it is not the value a span that had swallowed its subagents would
		// read. Its Round row is a Round — that Round's own additions, with no time field of its own, so
		// the time on this display belongs to the session alone rather than to a Round.
		const brief = bound.host.lastLines() ?? [];
		expect(totalLineOf(brief)).toMatch(/Span: 0:10:00$/);
		const round = brief.find(line => line.startsWith("Round: "));
		expect(round).toBeDefined();
		expect(round as string).not.toContain("Span:");
		expect(round as string).not.toContain("Run:");
		expect(round as string).not.toContain("Sum");

		await bound.double.runToCompletion("budget", { args: "detail" });
		bound.host.publish({ sessionId: MAIN.sessionId, provider: "official", model: "model-alpha" });
		const lines = bound.host.lastLines() ?? [];
		const total = totalLineOf(lines);
		expect(total).toMatch(/Span: 0:10:00$/);
		// Neither the 22 minutes the two 6-minute children would make of the 10-minute span if their
		// runtimes were added in (the criterion's own `600,000 + 360,000 + 360,000`), nor this run's own
		// 24 with the grandchild's two minutes counted as well, appears anywhere in the drawing.
		expect(lines.some(line => line.includes("0:22:00"))).toBe(false);
		expect(lines.some(line => line.includes("0:24:00"))).toBe(false);
		// Every retained field is still the one this run accounted: the session's own cache rate and the
		// whole tree's amount, with no Sum column anywhere on the line.
		expect(total).toContain("Cache: 89%");
		expect(total).not.toContain("Sum");

		// The two parallel subagents each state their *own* activity's runtime on their own row — the
		// 360,000 ms between the two edges of each of their Rounds — beside the main session's span
		// rather than inside it.
		expect(rowOf(lines, CHILD_A_HANDLE)).toContain("Run: 6m");
		expect(rowOf(lines, CHILD_B_HANDLE)).toContain("Run: 6m");
		// The grandchild's row is its own execution's two minutes again, one depth down.
		expect(rowOf(lines, GRAND_HANDLE)).toContain("Run: 2m");
	});
});

describe("every change assembled survives a commit and a new process (P24)", () => {
	test("the drawn figures and the restored records are the ones this run's own numbers make", async () => {
		const first = await bind();
		await first.double.runToCompletion("budget", { args: "detail" });
		runAssembled(first);
		// The run's own commit: the Round end above drives it, and the document the first process wrote
		// is what the second one reads. Both processes draw the same figures.
		const document = await savedDocument(
			first.file,
			candidate =>
				recordOf(candidate, MAIN.sessionId)?.span !== undefined &&
				recordOf(candidate, GRAND.sessionId)?.runtimeMs !== undefined &&
				recordOf(candidate, CHILD_A.sessionId)?.runtimeMs !== undefined &&
				recordOf(candidate, CHILD_B.sessionId)?.runtimeMs !== undefined,
		);
		expect(recordOf(document, MAIN.sessionId)?.span).toEqual({ start: T0, end: T0 + MAIN_SPAN_MS });

		const second = await bind({ root: first.root });
		await second.double.runToCompletion("budget", { args: "detail" });
		second.double.observations.observeContext(CHILD_A.sessionId, {
			tokens: CHILD_A_CONTEXT_TOKENS,
			provider: "official",
			model: "model-alpha",
		});
		second.host.publish({
			sessionId: MAIN.sessionId,
			provider: "official",
			model: "model-alpha",
			effort: "high",
			context: VIEWED_CONTEXT,
		});

		// The restored display: the main session's span comes back from the document with the time it had,
		// and the context the host publishes for the session it is viewing is the reading given here — read
		// against the monetary channel's own fixed display budget of 450,000 tokens, which this reading is
		// well inside.
		const display = second.runtime.presentation.of({
			...MAIN_TARGET,
			effort: "high",
			contextTokens: VIEWED_CONTEXT.tokens,
			contextWindow: VIEWED_CONTEXT.contextWindow,
		});
		expect(display.span).toEqual({ startAt: T0, endAt: T0 + MAIN_SPAN_MS, elapsedMs: MAIN_SPAN_MS });
		// The host's reading, as the display states it: its own two figures, with the window named `window`.
		expect(display.context).toEqual({ tokens: 90_000, window: 128_000 });
		expect(display.budget).toEqual({ tokens: 450_000, exceeded: false });
		// The session's own scope: its own four buckets, its own cache rate (8000 of 9000 conversation
		// tokens) and its own CNY amount, none of them a descendant's.
		expect(display.current.tokens).toEqual({ input: 1_000, cacheRead: 8_000, cacheWrite: 0, output: 3_000 });
		expect(display.current.cacheHitRate).toBe(89);
		expect(display.current.costCny).toBe(MAIN_CNY);
		// The inclusive scope: all four sessions' own buckets, the two CNY amounts as one, and the
		// allowance child's reference amount kept in its own currency (12020 of 22050 conversation tokens
		// is 55 percent).
		expect(display.tree.tokens).toEqual({ input: 10_030, cacheRead: 12_020, cacheWrite: 1_000, output: 9_175 });
		expect(display.tree.cacheHitRate).toBe(55);
		expect(display.tree.costCny).toBe(TREE_CNY);
		expect(display.tree.referenceCostUsd).toBe(TREE_REFERENCE_USD);

		// The Total the second process draws states the same figures the first one's did: the current
		// model's own cache rate and ratio, the tree's two amounts and the main session's span — Sum is a
		// column of neither this row nor any other, and the time is the session's rather than the tree's.
		expect(totalText(display)).toBe(
			`Cache: 89%  \u00A5Cache/In/Out\uff1a13:7:80  Cost: \u00A50.05  Ref: $0.02  Span: 0:10:00`,
		);
		expect(totalColumns(display).map(column => column.label)).toEqual([
			"Cache: ",
			"\u00A5Cache/In/Out\uff1a",
			"Cost: ",
			"Ref: ",
			"Span: ",
		]);

		const lines = second.host.lastLines() ?? [];
		const total = totalLineOf(lines);
		expect(total).toMatch(/Span: 0:10:00$/);
		expect(total).toContain("Cache: 89%");
		expect(total).toContain("Ref: $0.02");
		expect(lines.every(line => !line.includes("Sum"))).toBe(true);

		// The tree is the one the run accounted, drawn from the restored records: the root, its own pair,
		// then one row per descendant session in the order the relations put them, with no aggregate node.
		const rows = sessionRowsOf(lines);
		expect(
			rows.map(row => row.replace(/^(?:\u2502  )*[\u251C\u2514]\u2500 /, "").split(/\s{2,}/)[0] as string),
		).toEqual([CHILD_A_HANDLE, GRAND_HANDLE, CHILD_B_HANDLE]);

		// Each row's own figures are the ones this run gave it: the first child's own amount, the second
		// child's reference amount, the grandchild's own two buckets — with every one of their runtimes
		// restored from the document rather than held in memory. None of them states the cached share of
		// its own conversation input: a descendant row is read for what that session consumed.
		const childA = rowOf(lines, CHILD_A_HANDLE);
		const grand = rowOf(lines, GRAND_HANDLE);
		const childB = rowOf(lines, CHILD_B_HANDLE);
		expect(childA).toContain("official/model-alpha(high)");
		expect(childA).toContain("Cost: \u00A50.02");
		expect(childA).toContain(`Ctx: ${CHILD_A_CONTEXT_TEXT}`);
		expect(childA).toContain("Run: 6m");
		expect(childB).toContain("plan-provider/codex-model(low)");
		expect(childB).toContain("Ref: $0.02");
		expect(childB).toContain("Run: 6m");
		expect(grand).toContain("go-provider/model-alpha(medium)");
		expect(grand).toContain("Run: 2m");
		expect(rows.every(row => !row.includes("Cache:"))).toBe(true);
		// The root's own pair row above them is a row of a model rather than of a session, so it keeps the
		// cached-share column: its own 8,000 reads of 9,000 conversation tokens, a whole 89 percent.
		expect(lines.some(line => line.includes("official / model-alpha") && line.includes("Cache: 89%"))).toBe(true);

		// The two children are one depth and one alignment group: the snapshot each of them began on and the
		// fields they both state start at the same column on both rows, and the grandchild's own depth
		// starts them somewhere else.
		expect(columnOf(childA, "official/model-alpha(high)")).toBe(columnOf(childB, "plan-provider/codex-model(low)"));
		expect(columnOf(childA, "Run:")).toBe(columnOf(childB, "Run:"));
		expect(columnOf(grand, "go-provider/model-alpha(medium)")).not.toBe(
			columnOf(childA, "official/model-alpha(high)"),
		);
		expect(columnOf(grand, "Run:")).not.toBe(columnOf(childA, "Run:"));

		// The document the run committed: the main session's span, and one record per descendant carrying
		// that session's own consumption, its startup snapshot and the host's own millisecond runtime.
		// Nothing here is a live reading the new process could have had: every figure is read off the disk.
		const restored = JSON.parse(readFileSync(second.file, "utf8")) as ConsumptionDocument;
		expect(recordOf(restored, MAIN.sessionId)).toEqual({
			id: MAIN.sessionId,
			name: MAIN_NAME,
			parent: null,
			saveVersion: 1,
			own: {
				official: {
					"model-alpha": {
						tokens: { input: 1_000, cacheRead: 8_000, cacheWrite: 0, output: 3_000 },
						costCny: MAIN_CNY,
					},
				},
			},
			span: { start: T0, end: T0 + MAIN_SPAN_MS },
		});
		expect(recordOf(restored, CHILD_A.sessionId)).toEqual({
			id: CHILD_A.sessionId,
			name: CHILD_A_HANDLE,
			parent: MAIN.sessionId,
			startup: CHILD_A_STARTUP,
			saveVersion: 1,
			own: {
				official: {
					"model-alpha": {
						tokens: { input: 1_000, cacheRead: 2_000, cacheWrite: 0, output: 2_125 },
						costCny: CHILD_A_CNY,
					},
				},
			},
			runtimeMs: PARALLEL_ACTIVITY_MS,
		});
		expect(recordOf(restored, CHILD_B.sessionId)).toEqual({
			id: CHILD_B.sessionId,
			name: CHILD_B_HANDLE,
			parent: MAIN.sessionId,
			startup: CHILD_B_STARTUP,
			saveVersion: 1,
			own: {
				"plan-provider": {
					"codex-model": {
						tokens: { input: 8_000, cacheRead: 2_000, cacheWrite: 1_000, output: 4_000 },
						referenceCostUsd: TREE_REFERENCE_USD,
					},
				},
			},
			runtimeMs: PARALLEL_ACTIVITY_MS,
		});
		expect(recordOf(restored, GRAND.sessionId)).toEqual({
			id: GRAND.sessionId,
			name: GRAND_HANDLE,
			parent: CHILD_A.sessionId,
			startup: GRAND_STARTUP,
			saveVersion: 1,
			own: {
				"go-provider": {
					"model-alpha": { tokens: { input: 30, cacheRead: 20, cacheWrite: 0, output: 50 } },
				},
			},
			runtimeMs: GRAND_ACTIVITY_MS,
		});
	});
});
