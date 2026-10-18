/**
 * The redraw a turn's observation readings cost together (P15; S1, S3; ticket 07).
 *
 * Two things are the subject here, and they are deliberately separated: what a reading costs when it
 * arrives, and what *drawing* it costs.
 *
 * A reading arrives through the framework's own public consumption: another process's session
 * delivers its observation to the seat this process serves, the binding adopts it into the process's
 * observation source, and the reading reaches this extension's subscription group as the change it
 * is. Adoption is immediate — the source holds the reading the moment the delivery returned, before
 * anything is drawn — and nothing in this file is allowed to wait for a drawing to become true.
 *
 * The drawing is the other half: a frontend reads the whole display result every time it is told that
 * result changed. So a turn in which several readings arrived — three sessions' contexts, two of a
 * session's own fields, a reading and a settled Round beside it — is drawn *once*, from the latest
 * values each of those readings left behind, rather than once per delivery. The lines below are read
 * off the production frontend (`attachModelCostWidget`) through a controlled host, so what a case
 * counts is the frames an operator's terminal would have been handed.
 *
 * Every figure is a case's own literal, and the cases are read against the runtime the production
 * factory built over a self-made document — no expectation below is computed the way the
 * implementation computes anything.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { MODEL_COST } from "../../../extensions/model-cost/definition";
import { MODEL_COST_WIDGET_KEY, attachModelCostWidget } from "../../../extensions/model-cost/harnesses/omp/widget";
import type { ConsumptionDocument } from "../../../extensions/model-cost/shared-logic/foundation/session/consumption-document";
import type { ModelPricingData } from "../../../extensions/model-cost/shared-logic/business/pricing/model-data";
import type { ModelCostRuntime } from "../../../extensions/model-cost/shared-logic/runtime";
import { createModelCostRuntime } from "../../../extensions/model-cost/shared-logic/runtime";
import type { OmpSessionContext } from "../../../framework/adapters/omp";
import type { ObservedSession, OwnerReference, SessionFacts } from "../../../framework/core/protocol";
import { type PortDouble, portDouble } from "../../framework/support/harness-port-double";
import { controlApi } from "../support/control-api";
import { uiBoundaryTimerOf } from "../support/ui-timer";

/** The self-made pricing data: one monetary tier on the root's pair and one token-only pair. */
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

const HARNESS = "probe-harness";
const CONSUMPTION_FILE = "consumption.json";

/** The session this process serves: the tree's root, and the owner the spawned sessions follow. */
const MAIN: SessionFacts = { sessionId: "session-main", kind: "main", name: "主会话", unavailable: [] };
const OWNER: OwnerReference = { kind: "owner", key: "main:redraw-merge" };

/** The owner every reading that arrived from another process states: the seat this process serves. */
const SEAT: OwnerReference = { kind: "inherited", key: OWNER.key };

/** The main session's own current pair, which the tree below is read against. */
const MAIN_TARGET = { sessionId: "session-main", provider: "official", model: "model-alpha" } as const;

/** Two children of the root, and one grandchild below the first — each as its own process resolved it. */
const CHILD_A: SessionFacts = {
	sessionId: "session-child-a",
	kind: "sub",
	parentSessionId: MAIN.sessionId,
	name: "子代理A",
	unavailable: [],
};
const CHILD_B: SessionFacts = {
	sessionId: "session-child-b",
	kind: "sub",
	parentSessionId: MAIN.sessionId,
	name: "子代理B",
	unavailable: [],
};
const GRANDCHILD: SessionFacts = {
	sessionId: "session-grand",
	kind: "sub",
	parentSessionId: CHILD_A.sessionId,
	name: "孙代理C",
	unavailable: [],
};

/** The document every case starts from: the main session's own saved consumption and nothing below it. */
const MAIN_ONLY: ConsumptionDocument = {
	schemaVersion: 1,
	periodId: "period-redraw-merge",
	start: "2026-10-01T00:00:00.000Z",
	holiday: false,
	harnesses: {
		[HARNESS]: {
			sessions: [
				{
					id: MAIN.sessionId,
					name: MAIN.name,
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
} as unknown as ConsumptionDocument;

/** Every root this file created, removed after each case. */
const roots: string[] = [];

/** One reading of one session another process ran, with the readings that process stated. */
function readingOf(
	session: SessionFacts,
	readings: {
		readonly activity?: "working" | "idle";
		readonly context?: { readonly tokens: number; readonly provider: string; readonly model: string };
	} = {},
): ObservedSession {
	return {
		session,
		owner: SEAT,
		...(readings.activity === undefined ? {} : { activity: readings.activity }),
		...(readings.context === undefined ? {} : { context: readings.context }),
	};
}

/** One bound instance, the double that drives it, and the frames its frontend was handed. */
interface Bound {
	readonly runtime: ModelCostRuntime;
	readonly double: PortDouble;
	/** How many widget frames the host drawing this session was handed, clears included. */
	frames(): number;
	/** The lines of the last widget this host was shown, or nothing while it drew none. */
	lines(): readonly string[] | undefined;
	/** The host drawing the session it displays again, as it does when that session is entered anew. */
	hostRedraws(): void;
}

/**
 * Binds the real extension over one document and draws its detail form through the real frontend.
 *
 * The harness carries observations across processes, as an assembly whose sessions may run elsewhere
 * does, and the frontend draws the session this process serves — so the readings below really take the
 * delivery path an arriving observation takes, and the frames they cost are the host's.
 */
async function bind(): Promise<Bound> {
	const root = mkdtempSync(path.join(tmpdir(), "model-cost-redraw-merge-"));
	roots.push(root);
	writeFileSync(path.join(root, CONSUMPTION_FILE), JSON.stringify(MAIN_ONLY), "utf8");
	const double = portDouble({ observationsAcrossProcesses: true });
	let runtime: ModelCostRuntime | undefined;
	double.bind(MODEL_COST, {
		config: { reader: () => `storageDir: ${root}\nbalanceTtlMs: 30000\ncodexQuotaTtlMs: 15000\n` },
		factory: context =>
			(runtime = createModelCostRuntime({
				config: { storageDir: root },
				configDirectory: root,
				userHomeDirectory: root,
				harness: HARNESS,
				data: DATA,
				sessionObservations: context.sessionObservations,
			})).implementation,
	});
	double.deliverSession(OWNER, { session: MAIN });
	double.deliverSession(OWNER, { event: { kind: "session_facts" }, session: MAIN });
	await double.initiateRun(OWNER);
	const built = runtime as ModelCostRuntime;
	await double.runToCompletion("budget", { args: "detail" });

	const drawn: Array<readonly string[] | undefined> = [];
	const ctx = {
		agent: { kind: "main", id: "Main" },
		hasUI: true,
		ui: {
			notify: () => {},
			setWidget: (key: string, content: unknown): void => {
				if (key !== MODEL_COST_WIDGET_KEY) return;
				drawn.push(content as readonly string[] | undefined);
			},
		},
		sessionManager: { getSessionId: () => MAIN.sessionId, getBranch: () => [] },
		model: { provider: "official", id: "model-alpha" },
		getViewedSession: () => ({ sessionId: MAIN.sessionId, provider: "official", model: "model-alpha" }),
		subscribeViewedSessionChanged: () => () => {},
		setTimeout: () => undefined,
		clearTimer: () => {},
	} as unknown as OmpSessionContext;
	const { api, fire } = controlApi();
	attachModelCostWidget(api, built, uiBoundaryTimerOf(built), "lines");
	fire("session_start", ctx);
	fire("session_facts", ctx);

	return {
		runtime: built,
		double,
		frames: () => drawn.length,
		lines: () => drawn[drawn.length - 1],
		hostRedraws: () => fire("session_start", ctx),
	};
}

/** Lets the turn the deliveries ran in finish, so whatever the turn owes has been served. */
async function turnEnded(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

/** The drawn agent row of one session, by the name the display decided to call it. */
function drawnRow(lines: readonly string[] | undefined, name: string): string | undefined {
	return (lines ?? []).find(line => line.includes("  Run: ") && line.includes(name));
}

afterEach(() => {
	while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true });
});

describe("a turn's observation readings are drawn together, from their latest values (P15)", () => {
	test("three sessions' readings, activity and context alike, are one redraw", async () => {
		const bound = await bind();
		const before = bound.frames();

		// One arrival: three sessions' readings, each carrying the activity its own Round left it in and
		// the context its own host measured — two axes, and three sessions, in the same turn.
		bound.double.deliverObserved(
			readingOf(CHILD_A, { activity: "working", context: { tokens: 10_000, provider: "official", model: "model-alpha" } }),
		);
		bound.double.deliverObserved(
			readingOf(CHILD_B, { activity: "working", context: { tokens: 30_000, provider: "go-provider", model: "model-alpha" } }),
		);
		bound.double.deliverObserved(
			readingOf(GRANDCHILD, { activity: "idle", context: { tokens: 20_000, provider: "official", model: "model-alpha" } }),
		);

		// Adoption is not the drawing's: the process's own source holds every reading already, and the
		// activity the readings stated is the activity this instance reads — before any redraw is due.
		expect(bound.runtime.sessionObservations.read(CHILD_A.sessionId)?.context?.tokens).toBe(10_000);
		expect(bound.runtime.sessionObservations.read(CHILD_B.sessionId)?.context?.tokens).toBe(30_000);
		expect(bound.runtime.sessionObservations.read(GRANDCHILD.sessionId)?.context?.tokens).toBe(20_000);
		expect(bound.runtime.sessionActivity.read(CHILD_A.sessionId)).toBe("working");
		expect(bound.runtime.sessionActivity.read(GRANDCHILD.sessionId)).toBe("idle");

		await turnEnded();

		// Six deliveries (three sessions, two axes each) cost one frame: the redraw the turn owed reads
		// all six readings at once.
		expect(bound.frames()).toBe(before + 1);

		// And the frame really carries each session's own latest value, at the depth its direct parent
		// puts it: no delivery was dropped, and none of them was drawn on its own.
		const drawn = bound.lines() ?? [];
		expect(drawnRow(drawn, "子代理A")).toContain("10,000");
		expect(drawnRow(drawn, "子代理B")).toContain("30,000");
		const grandchild = drawnRow(drawn, "孙代理C") as string;
		expect(grandchild).toContain("│  └─ 孙代理C");
		expect(grandchild).toContain("20,000");
	});

	test("the last value a session's own reading left in the turn is the one drawn", async () => {
		const bound = await bind();
		const before = bound.frames();

		// The same session's context is read twice in one turn, as a session that answered a message and
		// then settled its run does: what the turn's one redraw draws is the later reading.
		bound.double.deliverObserved(
			readingOf(CHILD_A, { activity: "working", context: { tokens: 10_000, provider: "official", model: "model-alpha" } }),
		);
		bound.double.deliverObserved(
			readingOf(CHILD_A, { activity: "working", context: { tokens: 25_000, provider: "official", model: "model-alpha" } }),
		);
		await turnEnded();

		expect(bound.frames()).toBe(before + 1);
		expect(drawnRow(bound.lines(), "子代理A")).toContain("25,000");
		expect(drawnRow(bound.lines(), "子代理A")).not.toContain("10,000");
		expect(bound.runtime.sessionObservations.read(CHILD_A.sessionId)?.context?.tokens).toBe(25_000);
	});

	test("a reading that states what the source already holds asks for no redraw at all", async () => {
		const bound = await bind();
		bound.double.deliverObserved(
			readingOf(CHILD_A, { activity: "working", context: { tokens: 10_000, provider: "official", model: "model-alpha" } }),
		);
		await turnEnded();
		const drawn = bound.frames();

		// The same numbers again, in the same turn and in a later one: a collection that read the numbers
		// the source holds is not a change, so no turn owes a redraw for it.
		bound.double.deliverObserved(
			readingOf(CHILD_A, { activity: "working", context: { tokens: 10_000, provider: "official", model: "model-alpha" } }),
		);
		await turnEnded();
		expect(bound.frames()).toBe(drawn);
		bound.double.deliverObserved(
			readingOf(CHILD_A, { activity: "working", context: { tokens: 10_000, provider: "official", model: "model-alpha" } }),
		);
		await turnEnded();
		expect(bound.frames()).toBe(drawn);
	});

	test("readings arriving in separate turns are drawn in their own turns, one redraw each", async () => {
		const bound = await bind();
		const before = bound.frames();

		bound.double.deliverObserved(
			readingOf(CHILD_A, { activity: "working", context: { tokens: 10_000, provider: "official", model: "model-alpha" } }),
		);
		await turnEnded();
		expect(bound.frames()).toBe(before + 1);

		bound.double.deliverObserved(
			readingOf(CHILD_B, { activity: "working", context: { tokens: 30_000, provider: "go-provider", model: "model-alpha" } }),
		);
		await turnEnded();
		expect(bound.frames()).toBe(before + 2);
		expect(drawnRow(bound.lines(), "子代理A")).toContain("10,000");
		expect(drawnRow(bound.lines(), "子代理B")).toContain("30,000");
	});
});

describe("merging is the drawing's business and not the lifecycle's (P15)", () => {
	test("a Round edge beside arriving readings is published at once, and the readings cost no second frame", async () => {
		// The same turn driven twice — once with a reading arriving beside the Round edge, once without
		// it — so what is measured is the reading's own cost rather than the framework's.
		const withReading = await bind();
		const without = await bind();
		const beforeWith = withReading.frames();
		const beforeWithout = without.frames();

		// One turn: a reading arrives and the root's own Round opens beside it. The Round edge is an
		// accounting boundary — it fixes the snapshot that Round's additions are measured from — so it is
		// processed where it arrives and publishes the result it changed.
		withReading.double.deliverObserved(
			readingOf(CHILD_A, { activity: "working", context: { tokens: 10_000, provider: "official", model: "model-alpha" } }),
		);
		withReading.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: MAIN });
		without.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: MAIN });
		await turnEnded();

		// The boundary ran where it arrived: this instance holds an open Round for the session, which is
		// what its later additions are measured from.
		expect(withReading.runtime.view.roundTotals(MAIN.sessionId)?.current).toEqual({
			official: { "model-alpha": { tokens: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 }, costCny: 0 } },
		});

		// The reading that arrived in the turn cost no frame of its own: the frames the turn drew are the
		// ones the same turn drew without it — and the last of them carries the reading, because it was
		// adopted before that frame was drawn.
		expect(withReading.frames() - beforeWith).toBe(without.frames() - beforeWithout);
		expect(drawnRow(withReading.lines(), "子代理A")).toContain("10,000");
	});

	test("a settled Turn is counted where it settled, and its own publication draws the readings beside it", async () => {
		const withReading = await bind();
		const without = await bind();
		for (const bound of [withReading, without]) {
			bound.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: MAIN });
		}
		await turnEnded();
		const beforeWith = withReading.frames();
		const beforeWithout = without.frames();

		// One turn: a child's reading arrives first, and the root's own Turn settles beside it with the
		// usage the endpoint reported. The settle is where that response's consumption is counted — none of
		// it waits for a drawing, and neither does the reading's adoption, which is already true when the
		// settle publishes its result.
		withReading.double.deliverObserved(
			readingOf(CHILD_A, { activity: "working", context: { tokens: 10_000, provider: "official", model: "model-alpha" } }),
		);
		for (const bound of [withReading, without]) {
			bound.double.deliverTurn(
				{
					kind: "request_started",
					session: MAIN,
					at: Date.parse("2026-10-01T00:00:00.000Z"),
					provider: "official",
					model: "model-alpha",
				},
				{ owner: OWNER },
			);
			bound.double.deliverTurn(
				{
					kind: "response_settled",
					session: MAIN,
					at: Date.parse("2026-10-01T00:01:00.000Z"),
					outcome: "completed",
					readings: [{ input: 1000, output: 500, cacheRead: 0, cacheWrite: 0, totalTokens: 1500 }],
				},
				{ owner: OWNER },
			);
		}
		await turnEnded();

		// The response's usage is in this instance's own results, counted where the Turn settled, and the
		// publication that counted it is the frame that draws the reading: one frame either way, and the
		// reading is on it rather than waiting for a redraw of its own.
		expect(withReading.runtime.view.own(MAIN.sessionId)?.official?.["model-alpha"]?.tokens.input).toBe(2000);
		expect(withReading.frames() - beforeWith).toBe(1);
		expect(without.frames() - beforeWithout).toBe(1);
		expect(drawnRow(withReading.lines(), "子代理A")).toContain("10,000");
	});

	test("a Round's own end still settles its pair in the turn it arrived in", async () => {
		const bound = await bind();
		bound.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: MAIN });
		bound.double.deliverTurn(
			{
				kind: "request_started",
				session: MAIN,
				at: Date.parse("2026-10-01T00:00:00.000Z"),
				provider: "official",
				model: "model-alpha",
			},
			{ owner: OWNER },
		);
		bound.double.deliverTurn(
			{
				kind: "response_settled",
				session: MAIN,
				at: Date.parse("2026-10-01T00:01:00.000Z"),
				outcome: "completed",
				readings: [{ input: 1000, output: 500, cacheRead: 0, cacheWrite: 0, totalTokens: 1500 }],
			},
			{ owner: OWNER },
		);
		await turnEnded();

		// The reading of a session another process runs arrives in the very turn the Round ends in: the end
		// measures the Round that just ran — a fact of this instance's own accounting rather than of any
		// drawing — and the idle reading it states is drawn by the turn's own redraw.
		bound.double.deliverObserved(
			readingOf(CHILD_A, { activity: "working", context: { tokens: 10_000, provider: "official", model: "model-alpha" } }),
		);
		bound.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: MAIN, outcome: "completed" });

		const measured = bound.runtime.view.roundTotals(MAIN.sessionId)?.previous;
		expect(measured?.official?.["model-alpha"]?.tokens.input).toBe(1000);
		expect(bound.runtime.sessionActivity.read(MAIN.sessionId)).toBe("idle");
		await turnEnded();
		expect(drawnRow(bound.lines(), "子代理A")).toContain("10,000");
		expect(bound.runtime.sessionObservations.read(CHILD_A.sessionId)?.context?.tokens).toBe(10_000);
	});
});
