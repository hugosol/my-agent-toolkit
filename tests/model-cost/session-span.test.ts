/**
 * The main session's Session span, from the input fact to the document it is saved in (P1–P8, P14–P16,
 * P19, P22, P24, P36; S1, S2, S3).
 *
 * The seam under test is production throughout: the extension's real definition is bound through the
 * framework's public binding (the port double, `tests/framework/support/harness-port-double.ts`), the
 * runtime is the one `createModelCostRuntime` builds, and every public Turn, Round and user-input
 * delivery below is fed exactly as a harness adapter would feed it. What the cases read is what a
 * frontend or an operator would read — `runtime.view`, the read-only display result with the Total
 * line drawn from it, and the consumption document the Round's own save publishes — never a private
 * field.
 *
 * The clock is the extension's own injectable instant source, driven by hand, and it timestamps the
 * one span fact the harness publishes with no instant of its own: the submission. A Turn's own end is
 * a fact of the delivery — the instant the framework states for the response that settled it — so a
 * case that places an input at 10:00 and a Turn's settle at 10:05 is stating the two observations the
 * span is the difference of, and the clock value at that delivery is deliberately not it.
 * Every expected millisecond count below is arithmetic on those two instants, written here rather
 * than read back from the implementation.
 *
 * The price data is self-made: one monetary provider, one allowance provider and one window pair, so
 * every amount the cases read is written here by hand from those numbers (`input·tier.input +
 * cacheRead·tier.cacheRead + output·tier.output` per million tokens, times the data's own multiplier
 * of three inside a peak window).
 */
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { MODEL_COST } from "../../extensions/model-cost/definition";
import type {
	ConsumptionDocument,
	OwnConsumption,
	SessionRecord,
} from "../../extensions/model-cost/shared-logic/consumption-document";
import type { ModelPricingData } from "../../extensions/model-cost/shared-logic/model-data";
import { type ModelCostRuntime, createModelCostRuntime } from "../../extensions/model-cost/shared-logic/runtime";
import { totalText } from "../../extensions/model-cost/shared-logic/presentation/display";
import type { OwnerReference, SessionFacts, TurnOutcome, TurnSignal, TurnUsage } from "../../framework/core/protocol";
import { type PortDouble, portDouble } from "../framework/support/harness-port-double";

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * One Beijing wall-clock reading on Wednesday 2026-10-14, as an epoch instant: the day every case
 * below places its observations on, read as the operator's own clock reads it.
 */
function atBeijing(hours: number, minutes = 0, seconds = 0, ms = 0): number {
	return Date.UTC(2026, 9, 14, hours, minutes, seconds, ms) - BEIJING_OFFSET_MS;
}

/** The self-made pricing data every case drives. */
const DATA: ModelPricingData = {
	currency: "XTS",
	unit: "XTS per million tokens",
	peakMultiplier: 3,
	zoneOffsetMinutes: 8 * 60,
	peakWindows: [
		{ fromMinute: 9 * 60, toMinute: 12 * 60 },
		{ fromMinute: 14 * 60, toMinute: 18 * 60 },
	],
	tiers: {
		alpha: { input: 2, cacheRead: 0.5, output: 8 },
		beta: { input: 10, cacheRead: 1, output: 20 },
	},
	allowanceProviders: ["plan-provider"],
	models: {
		official: {
			"model-alpha": { mode: "monetary", tier: "alpha" },
			"model-beta": { mode: "monetary", tier: "beta" },
		},
	},
};

const HARNESS = "probe-harness";
const MAIN_NAME = "主会话";
const MAIN: SessionFacts = { sessionId: "session-main", kind: "main", name: MAIN_NAME, unavailable: [] };
/** A session a fork stands up: another identity whose transcript is a copy of its source's. */
const FORK_NAME = "子会话";
const FORK: SessionFacts = { sessionId: "session-fork", kind: "main", name: FORK_NAME, unavailable: [] };
const OWNER: OwnerReference = { kind: "owner", key: "main:span" };
const PROVIDER = "official";
const MODEL = "model-alpha";
const ALLOWANCE_TARGET = { sessionId: FORK.sessionId, provider: "plan-provider", model: "model-plan" };
const CONSUMPTION_FILE = "consumption.json";

/** The usage every completing request in these cases reports, as the framework delivers it. */
const USAGE: TurnUsage = { input: 2, cacheRead: 4, cacheWrite: 5, output: 3, totalTokens: 9 };

/** The amount that usage costs at the data's off-peak price: (2·2 + 4·0.5 + 3·8) / 1e6. */
const OFF_PEAK_AMOUNT = 0.00003;

/** One request's four accounted buckets and the amount the data's off-peak price yields for it. */
function oneRequest(count: number): OwnConsumption {
	return {
		[PROVIDER]: {
			[MODEL]: {
				tokens: { input: 2 * count, cacheRead: 4 * count, cacheWrite: 5 * count, output: 3 * count },
				costCny: OFF_PEAK_AMOUNT * count,
			},
		},
	};
}

/** One Turn signal pair's facts, as an adapter maps them. */
function startedAt(session: SessionFacts, at: number, provider = PROVIDER, model = MODEL): TurnSignal {
	return { kind: "request_started", session, at, provider, model };
}

/**
 * One settled response, with the outcome the harness reported and the reading it carried.
 *
 * The outcome is the delivery's own fact: this extension accounts the reading the same way whatever it
 * is, and what a case varies it for is that a failed or cancelled Turn is a Turn that ended like any
 * other.
 */
function settled(
	session: SessionFacts,
	at: number,
	readings: readonly TurnUsage[] = [USAGE],
	outcome: TurnOutcome = "completed",
): TurnSignal {
	return { kind: "response_settled", session, at, outcome, readings };
}

/**
 * One Turn in an actual session: the request about to be sent at `requestedAt`, and the response that
 * settles it at `endedAt`.
 *
 * The settle is the Turn's own end: `endedAt` is the instant the framework's own delivery states, and
 * it is the instant this session's Session span end takes — never the value the hand-driven clock
 * happens to hold when a handler runs.
 */
function deliverRequest(double: PortDouble, session: SessionFacts, requestedAt: number, endedAt: number): void {
	double.deliverTurn(startedAt(session, requestedAt), { owner: OWNER });
	double.deliverTurn(settled(session, endedAt), { owner: OWNER });
}

/** One Turn whose response settles at `endedAt`, an ordinary minute after its request went out. */
function deliverTurnEndingAt(double: PortDouble, session: SessionFacts, endedAt: number): void {
	deliverRequest(double, session, endedAt - 60_000, endedAt);
}

/** Every root this file created, removed after each case. */
const roots: string[] = [];

/** A fresh, isolated storage root with nothing in it. */
function freshRoot(): string {
	const root = mkdtempSync(path.join(tmpdir(), "model-cost-span-"));
	roots.push(root);
	return root;
}

/**
 * The process's one clock, driven by hand: every case states the instant a delivery is observed at,
 * which is the only instant source these facts have.
 */
let clock = atBeijing(9, 50);

/** One bound accounting instance, and what a case drives and reads it through. */
interface BoundAccounting {
	readonly runtime: ModelCostRuntime;
	readonly double: PortDouble;
	readonly file: string;
	/**
	 * The feedback the bound session's own deliveries carried, which is where the one-time
	 * initialization's notices land (the framework publishes the initialization on the session
	 * delivery's channel).
	 */
	readonly feedback: ReadonlyArray<{ readonly level: string; readonly message: string }>;
}

/**
 * One accounting instance over one storage root: the production runtime, bound through the framework's
 * own binding, with the baseline loaded by the initialization the first model request waits for.
 *
 * A restart is this function called a second time over the same root — a second runtime with its own
 * port double and the same hand-driven clock, which is what the next process builds and binds.
 */
async function bindAccounting(root: string, baseline?: unknown): Promise<BoundAccounting> {
	const file = path.join(root, CONSUMPTION_FILE);
	if (baseline !== undefined) writeFileSync(file, typeof baseline === "string" ? baseline : JSON.stringify(baseline), "utf8");
	const runtime = createModelCostRuntime({
		config: { storageDir: root },
		configDirectory: root,
		userHomeDirectory: root,
		harness: HARNESS,
		data: DATA,
		now: () => clock,
	});
	const double = portDouble();
	double.bind(MODEL_COST, {
		factory: () => runtime.implementation,
		// The declared configuration is read once per extension per process; this reader answers the
		// declaration so the binding validates without touching the repository's own file.
		config: { reader: () => `storageDir: ${root}\nbalanceTtlMs: 30000\ncodexQuotaTtlMs: 15000\n` },
	});
	const session = double.deliverSession(OWNER, { session: MAIN });
	await double.initiateRun(OWNER);
	return { runtime, double, file, feedback: session.feedback };
}

/**
 * One Round's opening edge or its end edge, as the harness reports it for one session.
 *
 * A Round edge is a boundary of the session's consumption and of its activity, and no part of its
 * Session span: the cases that drive it do so to show what it does *not* move.
 */
function deliverEdge(double: PortDouble, session: SessionFacts, edge: "round_start" | "round_end") {
	return double.deliverRound(OWNER, { event: { kind: edge }, session });
}

/** One session's record in a document, or `undefined` when the document holds none for that id. */
function recordOf(document: ConsumptionDocument, id: string): SessionRecord | undefined {
	return Object.values(document.harnesses)
		.flatMap(bucket => bucket.sessions)
		.find(record => record.id === id);
}

/** The document one file holds right now, or `undefined` while it holds none. */
function readDocument(file: string): ConsumptionDocument | undefined {
	if (!existsSync(file)) return undefined;
	return JSON.parse(readFileSync(file, "utf8")) as ConsumptionDocument;
}

/** Lets the event loop turn over until nothing already queued is left. */
async function queuedWorkSettled(): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>();
	setImmediate(resolve);
	await promise;
}

/**
 * Waits until the document holds what a case expects of it, and answers with the document.
 *
 * A Round's end is dispatched the way the framework dispatches a semantic handler — without waiting
 * for the promise it returns — so the save it drives lands a few event-loop turns later. The wait is
 * on the expected content rather than on a duration, and the deadline only keeps a save that never
 * happened from hanging the case.
 */
async function savedDocument(
	file: string,
	accept: (document: ConsumptionDocument) => boolean,
): Promise<ConsumptionDocument> {
	const deadline = Date.now() + 5_000;
	for (;;) {
		const document = readDocument(file);
		if (document !== undefined && accept(document)) return document;
		if (Date.now() > deadline) {
			throw new Error(`no consumption document the case expects was published at ${file}`);
		}
		await queuedWorkSettled();
	}
}

/**
 * The feedback one delivery's own handling produced, waited for where the effect is asynchronous.
 *
 * A Round's end returns a promise the framework does not await, so the notice a case reads is the one
 * that landed when the save settled rather than one it assumed.
 */
async function feedbackOf(boundary: {
	readonly feedback: readonly { readonly level: string; readonly message: string }[];
}) {
	const deadline = Date.now() + 5_000;
	while (boundary.feedback.length === 0 && Date.now() < deadline) await queuedWorkSettled();
	return boundary.feedback;
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("the start is the session's own first user input (P1, P2)", () => {
	test("a session created at 09:50 whose input is at 10:00 starts at 10:00, not at its creation or its first request", async () => {
		const { runtime, double } = await bindAccounting(freshRoot());

		// The host reports the session at 09:50 — the fact that a session exists — and a whole Turn runs at
		// 09:52, before the operator has said anything. Neither is a start: no input has been observed, so
		// the span is unknown rather than zero or the request's own instant, and a settled Turn cannot
		// supply the start a session has never taken.
		clock = atBeijing(9, 50);
		double.deliverSession(OWNER, { session: MAIN });
		clock = atBeijing(9, 52);
		deliverRequest(double, MAIN, atBeijing(9, 52), atBeijing(9, 53));
		expect(runtime.view.sessionSpan(MAIN.sessionId)).toBeUndefined();

		// The operator's own submission at 10:00 — the one fact that establishes the start — and the
		// request it leads to at 10:00:05, which is not it either. That request's own settle at 10:00:10
		// is the first end there is, so the reading is ten seconds, counted from the input.
		clock = atBeijing(10, 0, 0);
		double.deliverUserInput(OWNER, { session: MAIN });
		clock = atBeijing(10, 0, 5);
		deliverRequest(double, MAIN, atBeijing(10, 0, 5), atBeijing(10, 0, 10));
		expect(runtime.view.sessionSpan(MAIN.sessionId)).toEqual({
			startAt: atBeijing(10, 0, 0),
			endAt: atBeijing(10, 0, 10),
			elapsedMs: 10_000,
		});

		// The next Turn's own settle at 10:05 moves the end and never the start, and the Round's end that
		// follows it moves neither: five minutes of wall clock, counted from the input and from nothing
		// else — not from the Round edge, whose own instant this case deliberately leaves later.
		deliverEdge(double, MAIN, "round_start");
		clock = atBeijing(10, 4);
		deliverRequest(double, MAIN, atBeijing(10, 4), atBeijing(10, 5));
		clock = atBeijing(10, 20);
		deliverEdge(double, MAIN, "round_end");

		expect(runtime.view.sessionSpan(MAIN.sessionId)).toEqual({
			startAt: atBeijing(10, 0, 0),
			endAt: atBeijing(10, 5, 0),
			elapsedMs: 300_000,
		});
	});

	test("a submission the harness attributed to the user establishes the start, and an unsettled Turn leaves no reading", async () => {
		const { runtime, double } = await bindAccounting(freshRoot());

		// The input fact is the one fact this session produces first: no Turn, no request and no message of
		// any role. The harness publishes it for every submission it admitted — before deciding what the
		// submission is — so a user-invoked skill is this same fact, and the start it establishes is the
		// instant the submission arrived.
		clock = atBeijing(10, 0, 0);
		double.deliverUserInput(OWNER, { session: MAIN });
		deliverEdge(double, MAIN, "round_start");
		double.deliverTurn(startedAt(MAIN, atBeijing(10, 0, 10)), { owner: OWNER });

		// A Turn is in flight and the Round has run for half an hour: a start with no end observed is
		// unknown, and neither the clock moving nor the Round's own end supplies one.
		clock = atBeijing(10, 30, 0);
		expect(runtime.view.sessionSpan(MAIN.sessionId)).toBeUndefined();
		deliverEdge(double, MAIN, "round_end");
		await queuedWorkSettled();
		expect(runtime.view.sessionSpan(MAIN.sessionId)).toBeUndefined();

		// That Turn's own settle is the end: half an hour of wall clock, counted from the input.
		double.deliverTurn(settled(MAIN, atBeijing(10, 30, 0)), { owner: OWNER });
		expect(runtime.view.sessionSpan(MAIN.sessionId)).toEqual({
			startAt: atBeijing(10, 0, 0),
			endAt: atBeijing(10, 30, 0),
			elapsedMs: 1_800_000,
		});
	});

	test("a later input never moves a start the session already has", async () => {
		const { runtime, double } = await bindAccounting(freshRoot());

		clock = atBeijing(10, 0, 0);
		double.deliverUserInput(OWNER, { session: MAIN });
		clock = atBeijing(10, 20, 0);
		double.deliverUserInput(OWNER, { session: MAIN });
		deliverEdge(double, MAIN, "round_start");
		deliverTurnEndingAt(double, MAIN, atBeijing(10, 35, 0));

		// The first input is the start and the second is not: 35 minutes, not 15.
		expect(runtime.view.sessionSpan(MAIN.sessionId)).toEqual({
			startAt: atBeijing(10, 0, 0),
			endAt: atBeijing(10, 35, 0),
			elapsedMs: 2_100_000,
		});
	});
});

describe("a fork starts from its own first new input (P3)", () => {
	test("a copied history establishes nothing, and the fork's own submission establishes its start", async () => {
		const { runtime, double } = await bindAccounting(freshRoot());

		// The source session holds a span of its own: input at 10:00, its Turn settled at 10:05.
		clock = atBeijing(10, 0, 0);
		double.deliverUserInput(OWNER, { session: MAIN });
		deliverEdge(double, MAIN, "round_start");
		deliverTurnEndingAt(double, MAIN, atBeijing(10, 5, 0));
		const sourceSpan = { startAt: atBeijing(10, 0, 0), endAt: atBeijing(10, 5, 0), elapsedMs: 300_000 };
		expect(runtime.view.sessionSpan(MAIN.sessionId)).toEqual(sourceSpan);

		// The harness forks it at 11:00: a new identity whose transcript is a copy of the source's. The
		// copy is not a submission, so the new session has no start — its time is unavailable rather than
		// the source's own five minutes.
		clock = atBeijing(11, 0, 0);
		double.deliverSession(OWNER, { session: FORK });
		expect(runtime.view.sessionSpan(FORK.sessionId)).toBeUndefined();
		expect(
			runtime.presentation.of({ sessionId: FORK.sessionId, provider: PROVIDER, model: MODEL }).span,
		).toBeUndefined();

		// Its own first submission at 11:10 is its start, and its own first Turn settles at 11:13: three
		// minutes, counted from 11:10 and not from the copied 10:00.
		clock = atBeijing(11, 10, 0);
		double.deliverUserInput(OWNER, { session: FORK });
		deliverEdge(double, FORK, "round_start");
		deliverTurnEndingAt(double, FORK, atBeijing(11, 13, 0));

		expect(runtime.view.sessionSpan(FORK.sessionId)).toEqual({
			startAt: atBeijing(11, 10, 0),
			endAt: atBeijing(11, 13, 0),
			elapsedMs: 180_000,
		});
		// The source session's own span is untouched by the fork's.
		expect(runtime.view.sessionSpan(MAIN.sessionId)).toEqual(sourceSpan);
	});
});

describe("the span is the first input up to the latest observed Turn end (P4, P6)", () => {
	test("a Turn that settles at 10:05 reads 300,000 ms and does not grow while the next one is in flight", async () => {
		const { runtime, double } = await bindAccounting(freshRoot());
		const mainLine = () => totalText(runtime.presentation.of({ sessionId: MAIN.sessionId, provider: PROVIDER, model: MODEL }));

		clock = atBeijing(10, 0, 0);
		double.deliverUserInput(OWNER, { session: MAIN });
		deliverEdge(double, MAIN, "round_start");
		deliverTurnEndingAt(double, MAIN, atBeijing(10, 5, 0));

		expect(runtime.view.sessionSpan(MAIN.sessionId)?.elapsedMs).toBe(300_000);
		expect(mainLine()).toContain("Span: 0:05:00");

		// The next Round begins at 10:06 and its Turn runs on for a long while without settling. The
		// reading is the last Turn's own end, so it stays where it is as the clock advances: the Total
		// shows the same five minutes it showed before, not the hour the response has been coming for.
		clock = atBeijing(10, 6, 0);
		deliverEdge(double, MAIN, "round_start");
		double.deliverTurn(startedAt(MAIN, atBeijing(10, 6, 0)), { owner: OWNER });
		clock = atBeijing(10, 30, 0);
		expect(runtime.view.sessionSpan(MAIN.sessionId)?.elapsedMs).toBe(300_000);
		expect(mainLine()).toContain("Span: 0:05:00");

		// Its own settle at 11:03 is the new end — the Round it belongs to ends after it, and moves
		// nothing.
		double.deliverTurn(settled(MAIN, atBeijing(11, 3, 0)), { owner: OWNER });
		clock = atBeijing(11, 4, 0);
		deliverEdge(double, MAIN, "round_end");

		// 10:00 to 11:03 is 63 minutes: the first Turn's 300,000 ms plus the idle time between the two
		// Turns, which is what makes this a physical span rather than an execution time.
		expect(runtime.view.sessionSpan(MAIN.sessionId)).toEqual({
			startAt: atBeijing(10, 0, 0),
			endAt: atBeijing(11, 3, 0),
			elapsedMs: 3_780_000,
		});
		expect(mainLine()).toContain("Span: 1:03:00");
	});
});

describe("a span that is not known is unavailable rather than zero (P5, P16)", () => {
	test("a first Turn that has not settled reads as a dash and never grows while it runs", async () => {
		const { runtime, double, file } = await bindAccounting(freshRoot());

		clock = atBeijing(10, 0, 0);
		double.deliverUserInput(OWNER, { session: MAIN });
		deliverEdge(double, MAIN, "round_start");
		double.deliverTurn(startedAt(MAIN, atBeijing(10, 0, 5)), { owner: OWNER });

		// An hour of a Turn in flight: no end has been observed, so the session's time is unknown and the
		// Total says so, rather than showing the hour that has elapsed or a zero.
		clock = atBeijing(11, 0, 0);
		expect(runtime.view.sessionSpan(MAIN.sessionId)).toBeUndefined();
		expect(runtime.presentation.of({ sessionId: MAIN.sessionId, provider: PROVIDER, model: MODEL }).span).toBeUndefined();
		expect(
			totalText(runtime.presentation.of({ sessionId: MAIN.sessionId, provider: PROVIDER, model: MODEL })),
		).toContain("Span: \u2014");
		// Nothing was written either: a time reading that cannot exist yet is not a reason to touch the
		// document, and the request in flight has consumed nothing yet.
		await queuedWorkSettled();
		expect(readDocument(file)).toBeUndefined();
	});

	test("a restored history with no observed end stays unknown however long the next Round runs", async () => {
		const root = freshRoot();
		// A document from before this extension recorded any time: its session has consumption and a
		// parent, and nothing at all about time.
		const historical: ConsumptionDocument = {
			schemaVersion: 1,
			periodId: "period-historical",
			start: "2026-10-01T00:00:00.000Z",
			holiday: false,
			harnesses: {
				[HARNESS]: {
					sessions: [{ id: MAIN.sessionId, name: MAIN_NAME, parent: null, saveVersion: 4, own: oneRequest(1) }],
				},
			},
		};
		const { runtime, double } = await bindAccounting(root, historical);

		// The instance sees a Round begin and end and the clock move well past any last transcript time
		// the history held, while no Turn settles at all. Neither an end observed for the Round nor the
		// clock is an end for the span, so nothing is fabricated for the missing one.
		clock = atBeijing(10, 0, 0);
		double.deliverUserInput(OWNER, { session: MAIN });
		deliverEdge(double, MAIN, "round_start");
		double.deliverTurn(startedAt(MAIN, atBeijing(10, 0, 5)), { owner: OWNER });
		clock = atBeijing(12, 0, 0);
		deliverEdge(double, MAIN, "round_end");
		await queuedWorkSettled();
		expect(runtime.view.sessionSpan(MAIN.sessionId)).toBeUndefined();
		expect(
			totalText(runtime.presentation.of({ sessionId: MAIN.sessionId, provider: PROVIDER, model: MODEL })),
		).toContain("Span: \u2014");
	});

	test("a reliable zero is a present reading and is told apart from an absent one", async () => {
		const { runtime, double, file } = await bindAccounting(freshRoot());

		// The input and the Turn's own end are the same instant: the pair is present and its difference
		// is exactly zero. The consumption the same save carries is what makes this an ordinary commit.
		clock = atBeijing(13, 0, 0);
		double.deliverUserInput(OWNER, { session: MAIN });
		deliverEdge(double, MAIN, "round_start");
		deliverRequest(double, MAIN, atBeijing(13, 0, 0), atBeijing(13, 0, 0));
		deliverEdge(double, MAIN, "round_end");

		expect(runtime.view.sessionSpan(MAIN.sessionId)).toEqual({
			startAt: atBeijing(13, 0, 0),
			endAt: atBeijing(13, 0, 0),
			elapsedMs: 0,
		});
		// The zero reaches the document as the same pair, beside the consumption it was saved with.
		const document = await savedDocument(file, candidate => recordOf(candidate, MAIN.sessionId) !== undefined);
		expect(recordOf(document, MAIN.sessionId)).toEqual({
			id: MAIN.sessionId,
			name: MAIN_NAME,
			parent: null,
			saveVersion: 1,
			own: oneRequest(1),
			span: { start: atBeijing(13, 0, 0), end: atBeijing(13, 0, 0) },
		});

		// The other session in the same process has neither instant, and its own display says so: `—`
		// and `0:00:00` are different answers, and the zero is a reading rather than a default.
		double.deliverSession(OWNER, { session: FORK });
		expect(
			totalText(runtime.presentation.of({ sessionId: FORK.sessionId, provider: PROVIDER, model: MODEL })),
		).toContain("Span: \u2014");
		expect(
			totalText(runtime.presentation.of({ sessionId: MAIN.sessionId, provider: PROVIDER, model: MODEL })),
		).toContain("Span: 0:00:00");
	});
});

describe("the saved pair is restored and continued rather than restarted (P7, P19)", () => {
	test("a later process resumes from the saved instants, keeps the start, and its next end includes the interval it was closed for", async () => {
		const root = freshRoot();
		const first = await bindAccounting(root);

		// The first process: input at 10:00, a Turn settling at 10:05, the Round ended after it — the pair
		// the ordinary commit carries.
		clock = atBeijing(10, 0, 0);
		first.double.deliverUserInput(OWNER, { session: MAIN });
		deliverEdge(first.double, MAIN, "round_start");
		deliverTurnEndingAt(first.double, MAIN, atBeijing(10, 5, 0));
		clock = atBeijing(10, 6, 0);
		deliverEdge(first.double, MAIN, "round_end");
		await savedDocument(
			first.file,
			candidate => recordOf(candidate, MAIN.sessionId)?.span?.end === atBeijing(10, 5, 0),
		);

		// The programme was closed for two hours and an independent process starts over the same root.
		// Before it observes anything at all, the session's span is the saved one: a restart continues
		// one span rather than starting another.
		const second = await bindAccounting(root);
		expect(second.runtime.view.sessionSpan(MAIN.sessionId)).toEqual({
			startAt: atBeijing(10, 0, 0),
			endAt: atBeijing(10, 5, 0),
			elapsedMs: 300_000,
		});

		// The operator resumes the session at 12:10. The submission is an input, but this session already
		// has a start and a later input never moves it: the reading is still the pair the document holds,
		// and nothing was re-taken from this process's own first observation.
		clock = atBeijing(12, 10, 0);
		second.double.deliverUserInput(OWNER, { session: MAIN });
		expect(second.runtime.view.sessionSpan(MAIN.sessionId)).toEqual({
			startAt: atBeijing(10, 0, 0),
			endAt: atBeijing(10, 5, 0),
			elapsedMs: 300_000,
		});

		// Its own next Turn settles at 12:30: two and a half hours from the original start, which includes
		// the two hours the programme was closed for.
		deliverEdge(second.double, MAIN, "round_start");
		deliverTurnEndingAt(second.double, MAIN, atBeijing(12, 30, 0));
		clock = atBeijing(12, 31, 0);
		deliverEdge(second.double, MAIN, "round_end");
		expect(second.runtime.view.sessionSpan(MAIN.sessionId)).toEqual({
			startAt: atBeijing(10, 0, 0),
			endAt: atBeijing(12, 30, 0),
			elapsedMs: 9_000_000,
		});
		expect(
			totalText(second.runtime.presentation.of({ sessionId: MAIN.sessionId, provider: PROVIDER, model: MODEL })),
		).toContain("Span: 2:30:00");

		// The continuation is saved as the next version of the same record, carrying the resumed start.
		const next = await savedDocument(
			second.file,
			candidate => recordOf(candidate, MAIN.sessionId)?.saveVersion === 2,
		);
		expect(recordOf(next, MAIN.sessionId)?.span).toEqual({
			start: atBeijing(10, 0, 0),
			end: atBeijing(12, 30, 0),
		});
	});
});

describe("the time is carried by existing commits and by nothing else (P8, P14)", () => {
	test("an unsettled Turn fabricates no end, and time moving or waiting writes nothing", async () => {
		const { runtime, double, file } = await bindAccounting(freshRoot());
		const root = path.dirname(file);

		// One ordinary Round: input 13:00, a Turn settling at 13:05, the Round's end after it. That commit
		// is the only thing that carries time, and the pair it left is the reading. Both of the Turns below
		// go out inside the data's off-peak afternoon window, so the amounts this case reads are the
		// tier's own off-peak price.
		clock = atBeijing(13, 0, 0);
		double.deliverUserInput(OWNER, { session: MAIN });
		deliverEdge(double, MAIN, "round_start");
		deliverTurnEndingAt(double, MAIN, atBeijing(13, 5, 0));
		clock = atBeijing(13, 6, 0);
		deliverEdge(double, MAIN, "round_end");
		await savedDocument(file, candidate => recordOf(candidate, MAIN.sessionId)?.span !== undefined);
		const saved = readFileSync(file, "utf8");
		// The document and the store's own coordinated-write lock: nothing else in the root, and no
		// time-specific file of any kind.
		const storageFiles = readdirSync(root);
		expect(storageFiles).toContain(CONSUMPTION_FILE);
		expect(storageFiles.filter(name => !name.startsWith(CONSUMPTION_FILE))).toEqual([]);

		// The next Round runs with a Turn in flight that never settles: no end is invented for it, so the
		// previous one stays — and the clock moving on, further user input and the work of the unfinished
		// Round write nothing at all, because there is no commit for time to ride on.
		clock = atBeijing(13, 7, 0);
		deliverEdge(double, MAIN, "round_start");
		double.deliverTurn(startedAt(MAIN, atBeijing(13, 7, 0)), { owner: OWNER });
		clock = atBeijing(13, 30, 0);
		double.deliverUserInput(OWNER, { session: MAIN });
		clock = atBeijing(13, 59, 0);
		await queuedWorkSettled();
		expect(readFileSync(file, "utf8")).toBe(saved);
		expect(readdirSync(root)).toEqual(storageFiles);
		expect(runtime.view.sessionSpan(MAIN.sessionId)).toEqual({
			startAt: atBeijing(13, 0, 0),
			endAt: atBeijing(13, 5, 0),
			elapsedMs: 300_000,
		});

		// Its own settle at 14:00 is the new end, and the same existing commit carries it: no second
		// write and no time-only file appear for it.
		double.deliverTurn(settled(MAIN, atBeijing(14, 0, 0)), { owner: OWNER });
		clock = atBeijing(14, 1, 0);
		deliverEdge(double, MAIN, "round_end");
		const refreshed = await savedDocument(
			file,
			candidate => recordOf(candidate, MAIN.sessionId)?.span?.end === atBeijing(14, 0, 0),
		);
		expect(recordOf(refreshed, MAIN.sessionId)).toEqual({
			id: MAIN.sessionId,
			name: MAIN_NAME,
			parent: null,
			saveVersion: 2,
			own: oneRequest(2),
			span: { start: atBeijing(13, 0, 0), end: atBeijing(14, 0, 0) },
		});
		expect(readdirSync(root)).toEqual(storageFiles);

		// The session ends and the process goes away. A close writes nothing of its own: no exit save, no
		// catch-up write for the time this instance holds, and nothing new in the root.
		const refreshedText = readFileSync(file, "utf8");
		clock = atBeijing(14, 30, 0);
		double.deliverSession(OWNER, { event: { kind: "session_end", reason: "disposed" } });
		double.deliverUserInput(OWNER, { session: MAIN });
		deliverEdge(double, MAIN, "round_start");
		deliverEdge(double, MAIN, "round_end");
		await queuedWorkSettled();
		expect(readFileSync(file, "utf8")).toBe(refreshedText);
		expect(readdirSync(root)).toEqual(storageFiles);
	});

	test("a Turn that settles without a reliable usage reading refreshes the reading and writes nothing", async () => {
		const { runtime, double, file } = await bindAccounting(freshRoot());

		// One ordinary Round first: input 10:00, a Turn settling at 10:05, the Round's end saving the pair.
		clock = atBeijing(10, 0, 0);
		double.deliverUserInput(OWNER, { session: MAIN });
		deliverEdge(double, MAIN, "round_start");
		deliverTurnEndingAt(double, MAIN, atBeijing(10, 5, 0));
		clock = atBeijing(10, 6, 0);
		deliverEdge(double, MAIN, "round_end");
		await savedDocument(file, candidate => recordOf(candidate, MAIN.sessionId)?.span !== undefined);
		const saved = readFileSync(file, "utf8");

		// A Turn whose response reported no usable usage settles at 11:00. Its end is a fact of its own,
		// so the reading advances — the skip is reported, and what it skips is the consumption alone —
		// while the session's own consumption has not grown since the last snapshot, so the Round's own
		// end finds nothing to save and the document keeps the pair it already holds.
		deliverEdge(double, MAIN, "round_start");
		double.deliverTurn(startedAt(MAIN, atBeijing(10, 59, 0)), { owner: OWNER });
		const skipped = double.deliverTurn(settled(MAIN, atBeijing(11, 0, 0), []), { owner: OWNER }).feedback;
		expect(skipped).toHaveLength(1);
		expect(skipped[0]?.level).toBe("warning");
		expect(skipped[0]?.message).toContain("usage");
		clock = atBeijing(11, 1, 0);
		deliverEdge(double, MAIN, "round_end");
		await queuedWorkSettled();
		expect(runtime.view.sessionSpan(MAIN.sessionId)).toEqual({
			startAt: atBeijing(10, 0, 0),
			endAt: atBeijing(11, 0, 0),
			elapsedMs: 3_600_000,
		});
		expect(readFileSync(file, "utf8")).toBe(saved);
	});
});

describe("an invalid time reading is reported without stopping anything (P15)", () => {
	test("an unusable reading reports it, keeps the last reading, and the consumption is still accounted and saved", async () => {
		const { runtime, double, file } = await bindAccounting(freshRoot());

		// One ordinary Round first — input 13:00, a Turn settling at 13:05, the Round ending after it — so
		// there is a reading to keep. The afternoon hour is the data's own off-peak window, so the amounts
		// below are the tier's own off-peak price rather than its peak multiple.
		clock = atBeijing(13, 0, 0);
		double.deliverUserInput(OWNER, { session: MAIN });
		deliverEdge(double, MAIN, "round_start");
		deliverTurnEndingAt(double, MAIN, atBeijing(13, 5, 0));
		clock = atBeijing(13, 6, 0);
		deliverEdge(double, MAIN, "round_end");

		// The clock answers something that is not an instant at all when the submission it timestamps
		// arrives.
		clock = Number.NaN;
		const inputFeedback = double.deliverUserInput(OWNER, { session: MAIN }).feedback;
		expect(inputFeedback).toHaveLength(1);
		expect(inputFeedback[0]?.level).toBe("error");
		expect(inputFeedback[0]?.message).toContain("主会话时间采集失败");
		expect(inputFeedback[0]?.message).toContain("时钟读数");

		// A Turn's own end is not an instant either: it is reported the same way and nothing is recorded
		// from it, while the request it carried is accounted and saved exactly as it would have been: the
		// same independent value the first Round's own request yielded, at the next version.
		deliverEdge(double, MAIN, "round_start");
		double.deliverTurn(startedAt(MAIN, atBeijing(13, 20, 0)), { owner: OWNER });
		const endFeedback = double.deliverTurn(settled(MAIN, Number.NaN), { owner: OWNER }).feedback;
		expect(endFeedback).toHaveLength(1);
		expect(endFeedback[0]?.level).toBe("error");
		expect(endFeedback[0]?.message).toContain("主会话时间采集失败");
		expect(endFeedback[0]?.message).toContain("Turn 结束时刻");
		clock = atBeijing(13, 25, 0);
		deliverEdge(double, MAIN, "round_end");

		expect(runtime.view.sessionSpan(MAIN.sessionId)).toEqual({
			startAt: atBeijing(13, 0, 0),
			endAt: atBeijing(13, 5, 0),
			elapsedMs: 300_000,
		});
		const document = await savedDocument(file, candidate => recordOf(candidate, MAIN.sessionId)?.saveVersion === 2);
		expect(recordOf(document, MAIN.sessionId)).toEqual({
			id: MAIN.sessionId,
			name: MAIN_NAME,
			parent: null,
			saveVersion: 2,
			own: oneRequest(2),
			span: { start: atBeijing(13, 0, 0), end: atBeijing(13, 5, 0) },
		});
	});

	test("a Turn that has not settled yet is unknown rather than reported as a failure", async () => {
		const { runtime, double } = await bindAccounting(freshRoot());

		clock = atBeijing(10, 0, 0);
		const inputFeedback = double.deliverUserInput(OWNER, { session: MAIN }).feedback;
		deliverEdge(double, MAIN, "round_start");
		double.deliverTurn(startedAt(MAIN, atBeijing(10, 0, 5)), { owner: OWNER });
		clock = atBeijing(10, 30, 0);
		await queuedWorkSettled();

		// Nothing was wrong: an ordinary session whose first Turn has not settled has no end to pair its
		// start with, and nothing is reported about it in either direction.
		expect(inputFeedback).toEqual([]);
		expect(runtime.view.sessionSpan(MAIN.sessionId)).toBeUndefined();
	});
});

describe("an older document keeps its data and gains the time beside it (P22, P24)", () => {
	test("an old document without any time field restores tokens, cost and parent, and continues committing", async () => {
		const root = freshRoot();
		const old: ConsumptionDocument = {
			schemaVersion: 1,
			periodId: "period-old",
			start: "2026-10-01T00:00:00.000Z",
			holiday: false,
			harnesses: {
				[HARNESS]: {
					sessions: [
						{ id: MAIN.sessionId, name: MAIN_NAME, parent: null, saveVersion: 2, own: oneRequest(1) },
						{ id: FORK.sessionId, name: FORK_NAME, parent: MAIN.sessionId, saveVersion: 5, own: oneRequest(2) },
					],
				},
			},
		};
		const { runtime, double, file } = await bindAccounting(root, old);

		// Every retained field is readable and the missing one is simply unknown.
		expect(runtime.view.own(FORK.sessionId)).toEqual(oneRequest(2));
		expect(runtime.view.identity(FORK.sessionId)).toEqual({
			sessionId: FORK.sessionId,
			name: FORK_NAME,
			parentSessionId: MAIN.sessionId,
		});
		expect(runtime.view.sessionSpan(FORK.sessionId)).toBeUndefined();
		expect(runtime.view.sessionSpan(MAIN.sessionId)).toBeUndefined();

		// The session it belongs to keeps working, and its next commit is one version on with the old
		// consumption plus the new request, the parent intact and the time it has now really observed. Its
		// own Turn goes out in the data's off-peak afternoon window, so the amount added is the tier's own
		// off-peak price.
		double.deliverSession(OWNER, { session: FORK });
		clock = atBeijing(13, 0, 0);
		double.deliverUserInput(OWNER, { session: FORK });
		deliverEdge(double, FORK, "round_start");
		deliverTurnEndingAt(double, FORK, atBeijing(13, 5, 0));
		clock = atBeijing(13, 6, 0);
		deliverEdge(double, FORK, "round_end");

		const document = await savedDocument(file, candidate => recordOf(candidate, FORK.sessionId)?.saveVersion === 6);
		expect(recordOf(document, FORK.sessionId)).toEqual({
			id: FORK.sessionId,
			name: FORK_NAME,
			parent: MAIN.sessionId,
			saveVersion: 6,
			own: oneRequest(3),
			span: { start: atBeijing(13, 0, 0), end: atBeijing(13, 5, 0) },
		});
		// The session the work did not touch is the record it was, with no time added to it.
		expect(recordOf(document, MAIN.sessionId)).toEqual({
			id: MAIN.sessionId,
			name: MAIN_NAME,
			parent: null,
			saveVersion: 2,
			own: oneRequest(1),
		});
	});

	test("the readings the Total shows are the ones given here by hand, with the span beside them", async () => {
		const root = freshRoot();
		// A record whose own consumption is given here, including an allowance provider's reference
		// amount in USD: what the display does with it is what this case checks, so nothing below is
		// read back from the implementation's own arithmetic.
		const REFERENCE_USD = 0.02;
		const given: ConsumptionDocument = {
			schemaVersion: 1,
			periodId: "period-given",
			start: "2026-10-01T00:00:00.000Z",
			holiday: false,
			harnesses: {
				[HARNESS]: {
					sessions: [
						{
							id: MAIN.sessionId,
							name: MAIN_NAME,
							parent: null,
							saveVersion: 1,
							own: oneRequest(1),
							span: { start: atBeijing(10, 0, 0), end: atBeijing(10, 5, 0) },
						},
						{
							id: FORK.sessionId,
							name: FORK_NAME,
							parent: MAIN.sessionId,
							saveVersion: 1,
							own: {
								"plan-provider": {
									"model-plan": {
										tokens: { input: 2, cacheRead: 4, cacheWrite: 5, output: 3 },
										referenceCostUsd: REFERENCE_USD,
									},
								},
							},
						},
					],
				},
			},
		};
		const { runtime } = await bindAccounting(root, given);

		// The target's own pair is the monetary session's usage as it was accounted: the four buckets
		// (2·2 + 4·0.5 + 3·8 = 30 price units per million tokens at the data's off-peak price), added up
		// to 14, with the cached share of the conversation input (4 of 2 + 4) and the amount at that
		// price. The tree beside it is the whole main session's, which is that usage plus the child's
		// same bucket counts — the two currencies kept apart, so the child's USD reference amount joins
		// the reference total and not the CNY one.
		const monetary = runtime.presentation.of({
			sessionId: MAIN.sessionId,
			provider: PROVIDER,
			model: MODEL,
			contextTokens: 20_000,
			contextWindow: 128_000,
		});
		expect(monetary.current.tokens).toEqual({ input: 2, cacheRead: 4, cacheWrite: 5, output: 3 });
		expect(monetary.current.sum).toBe(14);
		expect(monetary.current.costCny).toBeCloseTo(OFF_PEAK_AMOUNT, 12);
		expect(monetary.tree.tokens).toEqual({ input: 4, cacheRead: 8, cacheWrite: 10, output: 6 });
		expect(monetary.tree.sum).toBe(28);
		expect(monetary.tree.cacheHitRate).toBe(67);
		expect(monetary.tree.costCny).toBeCloseTo(OFF_PEAK_AMOUNT, 12);
		expect(monetary.tree.referenceCostUsd).toBe(REFERENCE_USD);
		expect(monetary.context).toEqual({ tokens: 20_000, window: 128_000 });
		// The main session's span is drawn beside those readings, and it is the pair the record carried.
		expect(monetary.span).toEqual({ startAt: atBeijing(10, 0, 0), endAt: atBeijing(10, 5, 0), elapsedMs: 300_000 });
		expect(totalText(monetary)).toContain("Cache: 67%");
		expect(totalText(monetary)).toContain("Cost: ");
		// The span is the last column of the Total: every field before it keeps its own place, which is
		// what leaves the columns a Round shares with the Total positionally unchanged.
		expect(totalText(monetary)).toMatch(/Span: 0:05:00$/);

		// The same tree read for the allowance session: its own reference amount is the USD figure given
		// above and is not converted into the monetary amount, and the Total still carries the main
		// session's span — one session's time is never added to another's money.
		const allowance = runtime.presentation.of(ALLOWANCE_TARGET);
		expect(allowance.current.referenceCostUsd).toBe(REFERENCE_USD);
		expect(allowance.current.costCny).toBeUndefined();
		expect(allowance.tree.costCny).toBeCloseTo(OFF_PEAK_AMOUNT, 12);
		expect(allowance.tree.referenceCostUsd).toBe(REFERENCE_USD);
		expect(allowance.span?.elapsedMs).toBe(300_000);
		expect(totalText(allowance)).toContain(`Ref: $${REFERENCE_USD.toFixed(2)}`);
	});
});

describe("the whole-document rules are unchanged by an optional time fact (P36)", () => {
	test("a commit another writer's version conflicts with is reported, dropped and re-initialized from the disk, and no time is written by it", async () => {
		const root = freshRoot();
		// The generation this instance loads, and therefore the one the other writer's document below
		// belongs to: this case is about a version conflict inside one period, where the time the
		// instance observed is still the period's own. A file belonging to a period a reset replaced is
		// `period-switch.test.ts`'s subject, and there the time goes with the period.
		const periodId = "period-one";
		writeFileSync(
			path.join(root, CONSUMPTION_FILE),
			JSON.stringify({
				schemaVersion: 1,
				periodId,
				start: "2026-10-01T00:00:00.000Z",
				holiday: true,
				harnesses: {},
			}),
			"utf8",
		);
		const { runtime, double, file } = await bindAccounting(root);
		// A second process publishes its own record of the same session at the version this instance is
		// about to publish, so the coordinated update really refuses it.
		const theirs: SessionRecord = {
			id: MAIN.sessionId,
			name: "另一个进程写的名字",
			parent: null,
			saveVersion: 1,
			own: { [PROVIDER]: { [MODEL]: { tokens: { input: 100, cacheRead: 0, cacheWrite: 0, output: 0 }, costCny: 0.5 } } },
		};
		const theirDocument: ConsumptionDocument = {
			schemaVersion: 1,
			periodId,
			start: "2026-10-01T00:00:00.000Z",
			holiday: true,
			harnesses: { [HARNESS]: { sessions: [theirs] } },
		};
		writeFileSync(file, JSON.stringify(theirDocument), "utf8");

		// A submission and a whole Turn in the data's off-peak afternoon window: input 13:00, a Turn
		// settling at 13:05, the Round ending after it.
		clock = atBeijing(13, 0, 0);
		double.deliverUserInput(OWNER, { session: MAIN });
		deliverEdge(double, MAIN, "round_start");
		deliverTurnEndingAt(double, MAIN, atBeijing(13, 5, 0));
		clock = atBeijing(13, 6, 0);
		const notices = await feedbackOf(deliverEdge(double, MAIN, "round_end"));

		// The existing refusal rule, word for word: the operator is told, the refused accumulation is
		// dropped, and the document on disk is exactly the other writer's — an unpersisted time fact is
		// not a reason to write over it.
		expect(notices).toHaveLength(1);
		expect(notices[0]?.level).toBe("error");
		expect(notices[0]?.message).toContain(CONSUMPTION_FILE);
		expect(notices[0]?.message).toContain("没有写入");
		expect(notices[0]?.message).toContain("丢弃");
		expect(readDocument(file)).toEqual(theirDocument);
		expect(runtime.view.own(MAIN.sessionId)).toEqual(theirs.own);
		// The reading this instance sees is the span it observed: a Turn really settled, so the time it
		// holds is a fact even though the commit that would have carried it did not land.
		expect(runtime.view.sessionSpan(MAIN.sessionId)).toEqual({
			startAt: atBeijing(13, 0, 0),
			endAt: atBeijing(13, 5, 0),
			elapsedMs: 300_000,
		});

		// The next real commit continues from the disk's own version and carries the time along with it.
		deliverEdge(double, MAIN, "round_start");
		deliverTurnEndingAt(double, MAIN, atBeijing(13, 25, 0));
		clock = atBeijing(13, 26, 0);
		deliverEdge(double, MAIN, "round_end");
		const next = await savedDocument(file, candidate => recordOf(candidate, MAIN.sessionId)?.saveVersion === 2);
		expect(recordOf(next, MAIN.sessionId)).toEqual({
			id: MAIN.sessionId,
			name: MAIN_NAME,
			parent: null,
			saveVersion: 2,
			own: {
				[PROVIDER]: {
					[MODEL]: { tokens: { input: 102, cacheRead: 4, cacheWrite: 5, output: 3 }, costCny: 0.50003 },
				},
			},
			span: { start: atBeijing(13, 0, 0), end: atBeijing(13, 25, 0) },
		});
	});

	test("a consumption document that is not readable is refused and never overwritten, time or no time", async () => {
		const root = freshRoot();
		const broken = "{ this is not a document";
		const { runtime, double, file, feedback } = await bindAccounting(root, broken);

		// The baseline this process loaded is unusable, so the existing refusal rule stands: the operator
		// is told the accounting is paused, and nothing is guessed at.
		expect(feedback).toHaveLength(1);
		expect(feedback[0]?.level).toBe("error");
		expect(feedback[0]?.message).toContain("暂停");

		// A submission and a whole Round with real consumption follow. The time is not a reason to write
		// anything: the file is byte for byte what it was, and no record was created beside it.
		clock = atBeijing(10, 0, 0);
		double.deliverUserInput(OWNER, { session: MAIN });
		deliverEdge(double, MAIN, "round_start");
		deliverTurnEndingAt(double, MAIN, atBeijing(10, 5, 0));
		clock = atBeijing(10, 6, 0);
		deliverEdge(double, MAIN, "round_end");
		await queuedWorkSettled();
		expect(readFileSync(file, "utf8")).toBe(broken);
		expect(readdirSync(root)).toEqual([CONSUMPTION_FILE]);
		expect(runtime.storage.pauseReason()).toBeDefined();
	});

	test("a valid consumption whose time fact alone is invalid keeps the consumption and is told apart from the refusal", async () => {
		const root = freshRoot();
		const valid: ConsumptionDocument = {
			schemaVersion: 1,
			periodId: "period-valid",
			start: "2026-10-01T00:00:00.000Z",
			holiday: false,
			harnesses: {
				[HARNESS]: {
					sessions: [
						{
							id: MAIN.sessionId,
							name: MAIN_NAME,
							parent: null,
							saveVersion: 1,
							own: oneRequest(1),
							span: { start: atBeijing(9, 0, 0), end: atBeijing(9, 5, 0) },
						},
						{
							id: FORK.sessionId,
							name: FORK_NAME,
							parent: MAIN.sessionId,
							saveVersion: 3,
							own: oneRequest(2),
							// The end is before the start: a time fact that cannot be one.
							span: { start: 1_000, end: 500 },
						},
					],
				},
			},
		};
		const { runtime, double, file, feedback } = await bindAccounting(root, valid);
		const before = readFileSync(file, "utf8");

		// The fault is stated where it happened, and it is not the pause notice: the consumption in the
		// same document is valid and accounting runs on it.
		expect(feedback).toHaveLength(1);
		expect(feedback[0]?.level).toBe("error");
		expect(feedback[0]?.message).toContain(CONSUMPTION_FILE);
		expect(feedback[0]?.message).toContain("时间数据无效");
		expect(feedback[0]?.message).not.toContain("暂停");
		expect(runtime.storage.pauseReason()).toBeUndefined();
		// The load wrote nothing: an unreadable optional fact is dropped rather than repaired in place.
		expect(readFileSync(file, "utf8")).toBe(before);

		// Both sessions are usable: the valid consumption of each is there, the record whose time was
		// unreadable has no time rather than the invalid pair, and the other one keeps its own.
		expect(runtime.view.own(MAIN.sessionId)).toEqual(oneRequest(1));
		expect(runtime.view.own(FORK.sessionId)).toEqual(oneRequest(2));
		expect(runtime.view.sessionSpan(MAIN.sessionId)).toEqual({
			startAt: atBeijing(9, 0, 0),
			endAt: atBeijing(9, 5, 0),
			elapsedMs: 300_000,
		});
		expect(runtime.view.sessionSpan(FORK.sessionId)).toBeUndefined();

		// The affected session keeps working, and its next commit carries the consumption it already had
		// plus the new request — with the time it has really observed since, never the invalid pair. Its own
		// Turn goes out inside the data's off-peak afternoon window.
		double.deliverSession(OWNER, { session: FORK });
		clock = atBeijing(13, 0, 0);
		double.deliverUserInput(OWNER, { session: FORK });
		deliverEdge(double, FORK, "round_start");
		deliverTurnEndingAt(double, FORK, atBeijing(13, 5, 0));
		clock = atBeijing(13, 6, 0);
		deliverEdge(double, FORK, "round_end");
		const document = await savedDocument(file, candidate => recordOf(candidate, FORK.sessionId)?.saveVersion === 4);
		expect(recordOf(document, FORK.sessionId)).toEqual({
			id: FORK.sessionId,
			name: FORK_NAME,
			parent: MAIN.sessionId,
			saveVersion: 4,
			own: oneRequest(3),
			span: { start: atBeijing(13, 0, 0), end: atBeijing(13, 5, 0) },
		});
	});
});

describe("every outcome of a Turn ends the session's span (P8, P14)", () => {
	test("a failed Turn and a cancelled one end it exactly as a completed one does", async () => {
		const { runtime, double } = await bindAccounting(freshRoot());

		clock = atBeijing(13, 0, 0);
		double.deliverUserInput(OWNER, { session: MAIN });
		deliverEdge(double, MAIN, "round_start");

		// A request that failed: the harness settled its response at 13:05 with the reading it could still
		// report, so the span ends there — and the consumption is accounted exactly as a completed Turn's
		// would be, because the outcome is not what this extension counts.
		double.deliverTurn(startedAt(MAIN, atBeijing(13, 4, 0)), { owner: OWNER });
		double.deliverTurn(settled(MAIN, atBeijing(13, 5, 0), [USAGE], "failed"), { owner: OWNER });
		expect(runtime.view.sessionSpan(MAIN.sessionId)).toEqual({
			startAt: atBeijing(13, 0, 0),
			endAt: atBeijing(13, 5, 0),
			elapsedMs: 300_000,
		});
		expect(runtime.view.own(MAIN.sessionId)).toEqual(oneRequest(1));

		// A request the operator cancelled: it reported no reliable usage, and the span still ends at the
		// instant its response settled. What the missing reading costs is that Turn's consumption alone —
		// the skip is reported and the time stays — and the accumulation keeps the failed Turn's own.
		double.deliverTurn(startedAt(MAIN, atBeijing(13, 6, 0)), { owner: OWNER });
		const skipped = double.deliverTurn(settled(MAIN, atBeijing(13, 10, 0), [], "cancelled"), { owner: OWNER })
			.feedback;
		expect(skipped).toHaveLength(1);
		expect(skipped[0]?.level).toBe("warning");
		expect(skipped[0]?.message).toContain("usage");
		expect(runtime.view.sessionSpan(MAIN.sessionId)).toEqual({
			startAt: atBeijing(13, 0, 0),
			endAt: atBeijing(13, 10, 0),
			elapsedMs: 600_000,
		});
		expect(runtime.view.own(MAIN.sessionId)).toEqual(oneRequest(1));
	});

	test("a Turn this instance never anchored still ends the span, while its consumption is skipped", async () => {
		// An instance whose baseline cannot be read is paused: it prices nothing and counts nothing, so
		// every Turn of it is a Turn with no anchor at all. Its session's time is not part of that refusal —
		// the end is a fact about the Turn, not about the price it never fixed.
		const broken = "{ this is not a document";
		const { runtime, double, file } = await bindAccounting(freshRoot(), broken);

		clock = atBeijing(13, 0, 0);
		double.deliverUserInput(OWNER, { session: MAIN });
		deliverEdge(double, MAIN, "round_start");
		double.deliverTurn(startedAt(MAIN, atBeijing(13, 4, 0)), { owner: OWNER });
		double.deliverTurn(settled(MAIN, atBeijing(13, 5, 0), [USAGE]), { owner: OWNER });

		expect(runtime.view.sessionSpan(MAIN.sessionId)).toEqual({
			startAt: atBeijing(13, 0, 0),
			endAt: atBeijing(13, 5, 0),
			elapsedMs: 300_000,
		});
		// Nothing was counted for that Turn and nothing was written: the refusal is the accounting's, and
		// the time the same instance observed stays a reading it holds.
		expect(runtime.view.own(MAIN.sessionId)).toBeUndefined();
		await queuedWorkSettled();
		expect(readFileSync(file, "utf8")).toBe(broken);
	});
});
