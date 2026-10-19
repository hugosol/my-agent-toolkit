/**
 * One subagent session's accumulated runtime: the coarse estimate of that session's own *working*
 * time, measured from the framework's public Round edges and carried by the session's ordinary
 * consumption commit (S1, S2, S3; contract P24, P25, P27).
 *
 * The seams are the production ones throughout: the extension's real definition bound through the
 * framework's public binding (the port double, `tests/framework/support/harness-port-double.ts`), the
 * real runtime built by a factory exactly as the OMP assembly builds it, the real consumption
 * document read back from the disk this extension actually wrote, and
 * `runtime.presentation.of(target)` — the read-only display result a frontend reads. No private field
 * is reached and no formatting helper of the implementation is called to compute an expectation.
 *
 * The timeline is this file's own: the extension's clock is the one fact a Round edge has no instant
 * of, so a case states the instant each edge was observed at and the expectation is the arithmetic of
 * those instants — never a value the implementation derived. No host-stated duration, no wall-clock
 * span and no self-made timer appears anywhere in an expectation, because a figure that came from one
 * of those would pass a case written the same way the implementation computed it.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { MODEL_COST } from "../../../../extensions/model-cost/definition";
import type { ConsumptionDocument } from "../../../../extensions/model-cost/shared-logic/foundation/session/consumption-document";
import type { ModelPricingData } from "../../../../extensions/model-cost/shared-logic/business/pricing/model-data";
import type { ModelCostRuntime } from "../../../../extensions/model-cost/shared-logic/runtime";
import { createModelCostRuntime } from "../../../../extensions/model-cost/shared-logic/runtime";
import type { SessionFacts } from "../../../../framework/interface/session";
import type { OwnerReference } from "../../../../framework/interface/state";
import { type FeedbackNotice, type PortDouble, portDouble } from "../../../framework/support/harness-port-double";
import { testSessionCapability } from "../../support/session-capability";

/** The self-made pricing data: one monetary tier and one token-only pair. */
const DATA: ModelPricingData = {
	currency: "XTS",
	unit: "XTS per million tokens",
	peakMultiplier: 2,
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
const MAIN: SessionFacts = { sessionId: "session-main", kind: "main", name: "主会话", unavailable: [] };
const CHILD: SessionFacts = { sessionId: "session-child", kind: "sub", name: "子代理", unavailable: [] };
const GRAND: SessionFacts = { sessionId: "session-grand", kind: "sub", name: "孙代理", unavailable: [] };
const OWNER: OwnerReference = { kind: "owner", key: "main:runtime" };
const MAIN_TARGET = { sessionId: "session-main", provider: "official", model: "model-alpha" } as const;

/** The main session's own current pair, priced by the data's own off-peak tier. */
const MAIN_OWN = {
	official: { "model-alpha": { tokens: { input: 1000, cacheRead: 500, cacheWrite: 0, output: 2000 }, costCny: 0.05 } },
};

/** The child session's own consumption, on the token-only pair: no amount policy at all. */
const CHILD_OWN = {
	"go-provider": { "model-alpha": { tokens: { input: 30, cacheRead: 20, cacheWrite: 0, output: 50 } } },
};

/** The grandchild's own consumption, on the monetary pair. */
const GRAND_OWN = {
	official: { "model-alpha": { tokens: { input: 7, cacheRead: 3, cacheWrite: 0, output: 4 }, costCny: 0.5 } },
};

/** One further session of the same tree, with consumption and no runtime at all. */
const LEGACY: SessionFacts = { sessionId: "session-legacy", kind: "sub", name: "旧会话", unavailable: [] };
const LEGACY_OWN = {
	"go-provider": { "model-alpha": { tokens: { input: 5, cacheRead: 0, cacheWrite: 0, output: 6 } } },
};

/** Every root this file created, removed after each case. */
const roots: string[] = [];

/** One record of a baseline document, as the approved schema writes it. */
function record(
	id: string,
	parent: string | null,
	own: Record<string, Record<string, unknown>>,
	facts: { readonly runtimeMs?: number; readonly runtimeGap?: true } = {},
): Record<string, unknown> {
	const name = id === "session-child" ? "子代理" : id === "session-legacy" ? "旧会话" : id;
	return {
		id,
		name,
		parent,
		saveVersion: 1,
		own,
		...(facts.runtimeMs === undefined ? {} : { runtimeMs: facts.runtimeMs }),
		...(facts.runtimeGap === undefined ? {} : { runtimeGap: facts.runtimeGap }),
	};
}

/** The three-session tree every case reads, unless it states its own. */
function baseline(sessions?: readonly Record<string, unknown>[]): ConsumptionDocument {
	return {
		schemaVersion: 1,
		periodId: "period-runtime",
		start: "2026-10-01T00:00:00.000Z",
		holiday: false,
		harnesses: {
			[HARNESS]: {
				sessions: sessions ?? [
					record("session-main", null, MAIN_OWN),
					record("session-child", "session-main", CHILD_OWN),
					record("session-grand", "session-child", GRAND_OWN),
				],
			},
		},
	} as unknown as ConsumptionDocument;
}

/** The clock one case drives: the instant every Round edge is observed at. */
interface Clock {
	at: number;
}

/** One bound instance and the double that drives it. */
interface Bound {
	readonly runtime: ModelCostRuntime;
	readonly double: PortDouble;
	readonly root: string;
	readonly consumptionFile: string;
	/** The extension's own clock, which a case sets before every edge it drives. */
	readonly clock: Clock;
	/** What this instance's binding was told while it loaded: the load's own notices, if any. */
	readonly feedback: readonly FeedbackNotice[];
}

/**
 * Binds the real extension over one baseline document and loads it through the real initialization.
 *
 * The runtime is built by a factory — the same shape the OMP assembly uses — from the context the
 * framework hands it, so the framework's public binding and the production factory are both in the
 * path every case observes through. The clock is passed in as the extension's own instant source,
 * which is what lets a case state the instant each Round edge was observed at. A case that names an
 * existing root binds a second instance over the very storage the first one wrote, which is how a new
 * runtime or process is modelled here.
 */
async function bind(
	options: { readonly document?: ConsumptionDocument; readonly storageRoot?: string } = {},
): Promise<Bound> {
	const root = options.storageRoot ?? mkdtempSync(path.join(tmpdir(), "model-cost-runtime-"));
	if (options.storageRoot === undefined) roots.push(root);
	const consumptionFile = path.join(root, CONSUMPTION_FILE);
	if (options.storageRoot === undefined) {
		writeFileSync(consumptionFile, JSON.stringify(options.document ?? baseline()), "utf8");
	}
	const clock: Clock = { at: Date.parse("2026-10-01T00:00:00.000Z") };
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
				now: () => clock.at,
				session: testSessionCapability(),
			});
			return runtime.implementation;
		},
	});
	const session = double.deliverSession(OWNER, { session: MAIN });
	await double.initiateRun(OWNER);
	return { runtime: runtime as ModelCostRuntime, double, root, consumptionFile, clock, feedback: session.feedback };
}

/**
 * One of one session's own activities, as the framework's Round edges state it: the Round opens at
 * `from` and ends at `to`, and the extension's clock states each of those instants when it observes
 * the edge that carries it.
 */
function activity(bound: Bound, from: number, to: number, session: SessionFacts = CHILD): void {
	bound.clock.at = from;
	bound.double.deliverRound(OWNER, { event: { kind: "round_start" }, session });
	bound.clock.at = to;
	bound.double.deliverRound(OWNER, { event: { kind: "round_end" }, session });
}

/** One settled Turn of the child's own session, on the token-only pair that session runs. */
function settleChildTurn(bound: Bound, at: number): void {
	const session = CHILD;
	bound.clock.at = at;
	bound.double.deliverTurn(
		{ kind: "request_started", session, at, provider: "go-provider", model: "model-alpha" },
		{ owner: OWNER },
	);
	bound.double.deliverTurn(
		{
			kind: "response_settled",
			session,
			at: at + 60_000,
			outcome: "completed",
			readings: [{ input: 10, output: 20, cacheRead: 0, cacheWrite: 0, totalTokens: 30 }],
		},
		{ owner: OWNER },
	);
}

/** The instant the first activity of these cases begins at. */
const CLOCK = Date.parse("2026-10-01T00:00:00.000Z");

/**
 * Lets the work a delivery started — an awaited commit, its file write — reach the disk before a case
 * reads it or asserts that nothing was written.
 */
async function nextTick(): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>();
	setImmediate(resolve);
	return promise;
}

/** The document the file holds, once it satisfies a case's own condition. */
async function savedDocument(
	file: string,
	accept: (document: ConsumptionDocument) => boolean,
): Promise<ConsumptionDocument> {
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

/** One session record of a document the store wrote, or `undefined` when it holds none. */
function stored(document: ConsumptionDocument, id: string): Record<string, unknown> | undefined {
	return document.harnesses[HARNESS]?.sessions.find(candidate => candidate.id === id) as
		| Record<string, unknown>
		| undefined;
}

/** The detail tree's one row for a descendant session, as the display result carries it. */
function sessionRow(bound: Bound, sessionId: string) {
	const rows = bound.runtime.presentation.of(MAIN_TARGET).agentTree ?? [];
	return rows.filter(row => row.kind === "session" && row.name === (sessionId === "session-child" ? "子代理" : sessionId));
}

/**
 * Every file this extension keeps under one storage root, relative and sorted.
 *
 * The framework's own coordinated-write lock is not one of them: its directory and its transient
 * entry belong to `updateFile`'s coordination of a real commit, and a case about *this extension's*
 * files must not read them as a document of its own.
 */
function rootFiles(root: string): string[] {
	const found: string[] = [];
	const walk = (directory: string): void => {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const full = path.join(directory, entry.name);
			if (entry.isDirectory()) {
				if (entry.name.endsWith(".lock")) continue;
				walk(full);
			} else found.push(path.relative(root, full).replace(/\\/g, "/"));
		}
	};
	walk(root);
	return found.sort();
}

afterEach(() => {
	while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true });
});

describe("the figure is the session's own working intervals, and the idle between them is not (P24)", () => {
	test("two activities of the one subagent session add their own intervals, not the span that contains them", async () => {
		const bound = await bind();

		// Two activities of the one subagent session, with an idle stretch between them: the first runs
		// from CLOCK to CLOCK+30000 and the second from CLOCK+90000 to CLOCK+120000. The 60000 that
		// separates them is idle, and the figure is 30000 + 30000 rather than the 120000 the wall-clock
		// span would state or the 30000 the last activity alone would.
		activity(bound, CLOCK, CLOCK + 30_000);
		activity(bound, CLOCK + 90_000, CLOCK + 120_000);

		// One logical record per actual session: both activities are on the child's single row.
		const rows = sessionRow(bound, "session-child");
		expect(rows).toHaveLength(1);
		expect(rows[0]?.runtimeMs).toBe(60_000);
		expect(bound.runtime.view.runtime("session-child")).toBe(60_000);

		// The existing commit — each activity's own Round ending — carried the growing figure into the
		// same document, as a number of milliseconds rather than as display text. The second commit
		// carries both intervals: 60000, and never the last one's 30000.
		const document = await savedDocument(bound.consumptionFile, candidate => stored(candidate, "session-child")?.saveVersion === 3);
		expect(stored(document, "session-child")?.runtimeMs).toBe(60_000);
		expect(typeof stored(document, "session-child")?.runtimeMs).toBe("number");
		expect(/"runtimeMs"\s*:\s*60000/.test(readFileSync(bound.consumptionFile, "utf8"))).toBe(true);

		// A main session's own activity is no subagent runtime: its own record carries none and its
		// commits are its own consumption's.
		activity(bound, CLOCK, CLOCK + 60_000, MAIN);
		await nextTick();
		expect(bound.runtime.view.runtime("session-main")).toBeUndefined();
		expect(stored(JSON.parse(readFileSync(bound.consumptionFile, "utf8")) as ConsumptionDocument, "session-main")?.runtimeMs).toBeUndefined();
	});

	test("the interval covers the model work, the tools and the waits inside one activity, not one request's own latency", async () => {
		const bound = await bind();

		// One activity of the child: it settles one request 10000 into it and stops working at 60000. The
		// figure is the whole activity's 60000 — the request's own latency is not the metric, and neither
		// is a delegation the session waits on inside its Round.
		bound.clock.at = CLOCK;
		bound.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: CHILD });
		settleChildTurn(bound, CLOCK + 10_000);
		bound.clock.at = CLOCK + 60_000;
		bound.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: CHILD });

		expect(bound.runtime.view.runtime("session-child")).toBe(60_000);
		const document = await savedDocument(bound.consumptionFile, candidate => stored(candidate, "session-child")?.runtimeMs === 60_000);
		expect(stored(document, "session-child")?.runtimeMs).toBe(60_000);
		// The session's own consumption rode the same commit, unchanged from the harness's own reading.
		expect(stored(document, "session-child")?.own).toEqual({
			"go-provider": { "model-alpha": { tokens: { input: 40, cacheRead: 20, cacheWrite: 0, output: 70 } } },
		});
	});

	test("a measured zero is a known figure and no measurement at all stays unavailable (P24)", async () => {
		const bound = await bind();

		// Nothing was observed for the child yet: its row keeps the field and reports it as unavailable,
		// and the figure is absent rather than a zero.
		expect(sessionRow(bound, "session-child")[0]?.runtimeMs).toBeUndefined();
		expect(bound.runtime.view.runtime("session-child")).toBeUndefined();

		// An activity that opened and ended at the same instant really ran for no measurable time: it is
		// a reading this observer made, so it is recorded and saved as the zero it is.
		activity(bound, CLOCK, CLOCK);
		expect(bound.runtime.view.runtime("session-child")).toBe(0);
		activity(bound, CLOCK + 1_000, CLOCK + 1_000);
		const document = await savedDocument(bound.consumptionFile, candidate => stored(candidate, "session-child")?.saveVersion === 3);
		expect(stored(document, "session-child")?.runtimeMs).toBe(0);
	});
});

describe("only the time grew, and the commit still happens (P25)", () => {
	test("an activity whose session consumed nothing commits the time it added, and the next process continues from it", async () => {
		const bound = await bind();

		// The child's activity runs for 45000 and its own consumption does not move at all: no request of
		// it is accounted, so a commit gated on consumption alone would drop the figure.
		activity(bound, CLOCK, CLOCK + 45_000);
		const first = await savedDocument(bound.consumptionFile, candidate => stored(candidate, "session-child")?.saveVersion === 2);
		expect(stored(first, "session-child")?.runtimeMs).toBe(45_000);
		// Nothing else about that record moved: the consumption is the baseline's own, unchanged.
		expect(stored(first, "session-child")?.own).toEqual(CHILD_OWN);
		// A second such activity adds its own 30000: 45000 + 30000, and neither commits the last one alone.
		activity(bound, CLOCK + 120_000, CLOCK + 150_000);
		const second = await savedDocument(bound.consumptionFile, candidate => stored(candidate, "session-child")?.saveVersion === 3);
		expect(stored(second, "session-child")?.runtimeMs).toBe(75_000);

		// A new instance over the very same storage — a restart or another process — restores what was
		// saved and continues accumulating from it: 75000 + 15000.
		const restarted = await bind({ storageRoot: bound.root });
		expect(restarted.runtime.view.runtime("session-child")).toBe(75_000);
		expect(sessionRow(restarted, "session-child")[0]?.runtimeMs).toBe(75_000);
		activity(restarted, CLOCK + 300_000, CLOCK + 315_000);
		const restored = await savedDocument(restarted.consumptionFile, candidate => stored(candidate, "session-child")?.saveVersion === 4);
		expect(stored(restored, "session-child")?.runtimeMs).toBe(90_000);
	});

	test("an activity still running when the instance goes away adds nothing, writes nothing and is not counted later (P25)", async () => {
		const bound = await bind();
		activity(bound, CLOCK, CLOCK + 45_000);
		await savedDocument(bound.consumptionFile, candidate => stored(candidate, "session-child")?.saveVersion === 2);
		const bytes = readFileSync(bound.consumptionFile, "utf8");
		const filesBefore = rootFiles(bound.root);

		// A further activity opens and never ends while this instance is alive: no interval has settled,
		// so nothing is added, nothing is written, and no offline time is invented for what follows.
		bound.clock.at = CLOCK + 600_000;
		bound.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: CHILD });
		bound.double.deliverSession(OWNER, { event: { kind: "session_end", reason: "disposed" } });
		await nextTick();
		expect(readFileSync(bound.consumptionFile, "utf8")).toBe(bytes);
		expect(rootFiles(bound.root)).toEqual(filesBefore);

		// The next instance reads the saved figure and nothing more: the interval that never settled was
		// not restored as consumption and was not filled in from the wall clock.
		const restarted = await bind({ storageRoot: bound.root });
		expect(restarted.runtime.view.runtime("session-child")).toBe(45_000);
	});
});

describe("the figure rides an existing commit and never writes on its own (P25)", () => {
	test("settling an activity changes no other session's record, and adds no file of its own", async () => {
		const bound = await bind();
		const filesBefore = rootFiles(bound.root);
		const before = readFileSync(bound.consumptionFile, "utf8");

		// The activity's own edges are not boundaries of anything else: the file is written only when the
		// session's Round ends, and no time-specific file appears beside the document.
		bound.clock.at = CLOCK;
		bound.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: CHILD });
		await nextTick();
		expect(readFileSync(bound.consumptionFile, "utf8")).toBe(before);
		expect(rootFiles(bound.root)).toEqual(filesBefore);

		bound.clock.at = CLOCK + 20_000;
		bound.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: CHILD });
		const document = await savedDocument(bound.consumptionFile, candidate => stored(candidate, "session-child")?.saveVersion === 2);

		// Only the child's own record moved, and only in the one optional figure it carries.
		expect(stored(document, "session-child")?.runtimeMs).toBe(20_000);
		expect(stored(document, "session-child")?.own).toEqual(CHILD_OWN);
		expect(stored(document, "session-child")?.parent).toBe("session-main");
		expect(stored(document, "session-grand")).toEqual(record("session-grand", "session-child", GRAND_OWN));
		expect(stored(document, "session-main")).toEqual(record("session-main", null, MAIN_OWN));
		expect(rootFiles(bound.root)).toEqual(filesBefore);

		// The figure is a figure of its own: no token bucket, amount, total or context reading absorbs it.
		const row = sessionRow(bound, "session-child")[0];
		expect(row?.runtimeMs).toBe(20_000);
		// The child's own tokens are the baseline's own — 30 input, 20 cached and 50 output — which is
		// 100, exactly what it was before the activity settled.
		expect(row?.fields?.sum).toBe(100);
		expect(row?.fields?.costCny).toBeUndefined();
		expect(bound.runtime.view.own("session-child")).toEqual(CHILD_OWN);
	});
});

describe("an observation this instance could not measure is a known gap, not a zero (P24, P27)", () => {
	test("an unusable clock reading reports an error, keeps the last valid figure and marks the period incomplete", async () => {
		const bound = await bind();
		activity(bound, CLOCK, CLOCK + 30_000);
		await savedDocument(bound.consumptionFile, candidate => stored(candidate, "session-child")?.saveVersion === 2);

		// The clock states no instant for the next activity's end: no interval can be measured. The
		// operator is told, the last valid figure stands, and the period's observation of this session is
		// known to be incomplete — which is not the same fact as a session whose executions took no time.
		bound.clock.at = CLOCK + 60_000;
		bound.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: CHILD });
		bound.clock.at = Number.NaN;
		const end = bound.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: CHILD });
		expect(end.feedback).toHaveLength(1);
		expect(end.feedback[0]?.level).toBe("error");
		expect(bound.runtime.view.runtime("session-child")).toBe(30_000);

		// The next snapshot of that session carries what this instance really knows: the subtotal it
		// measured and the mark that this period's observation has a gap. A later success does not clear
		// the mark — the period's completeness is a fact about the period.
		activity(bound, CLOCK + 120_000, CLOCK + 150_000);
		const document = await savedDocument(bound.consumptionFile, candidate => stored(candidate, "session-child")?.saveVersion === 4);
		expect(stored(document, "session-child")?.runtimeMs).toBe(60_000);
		expect(stored(document, "session-child")?.runtimeGap).toBe(true);
	});

	test("a later success does not clear the gap, and a record that names none is not inferred to have had one", async () => {
		const bound = await bind();

		// An unmeasurable activity marks the period; two further activities that are measured perfectly
		// add their own intervals and leave the mark exactly where it is, because completeness is a fact
		// about the period's observations rather than about the last measurement.
		bound.clock.at = CLOCK;
		bound.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: CHILD });
		bound.clock.at = Number.NaN;
		bound.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: CHILD });
		activity(bound, CLOCK + 60_000, CLOCK + 90_000);
		activity(bound, CLOCK + 120_000, CLOCK + 150_000);

		// Three Round ends have each moved the figure: the unmeasurable one that only marked the gap, and
		// the two measured intervals that added 30000 each. The fourth snapshot carries both.
		const document = await savedDocument(bound.consumptionFile, candidate => stored(candidate, "session-child")?.saveVersion === 4);
		expect(stored(document, "session-child")?.runtimeMs).toBe(60_000);
		expect(stored(document, "session-child")?.runtimeGap).toBe(true);

		// The sessions this instance observed perfectly carry no mark at all: an absent mark is not the
		// claim that their history was complete, it is the absence of any observed gap.
		expect(stored(document, "session-grand")?.runtimeGap).toBeUndefined();
		expect(stored(document, "session-main")?.runtimeGap).toBeUndefined();
	});
});

describe("an old document is read, updated and restored (P27)", () => {
	test("a missing value, a legal zero, an existing figure and a known gap all survive a new version's update", async () => {
		// The document an older version wrote: one record that carries no runtime at all, one whose host
		// really reported zero, one whose figure is 480000, and one that already names a known gap. The
		// absent field is not a fault and proves nothing about the history, and the mark is not a fault
		// either.
		const bound = await bind({
			document: baseline([
				record("session-main", null, MAIN_OWN),
				record("session-child", "session-main", CHILD_OWN, { runtimeMs: 480_000, runtimeGap: true }),
				record("session-grand", "session-child", GRAND_OWN, { runtimeMs: 0 }),
				record("session-legacy", "session-main", LEGACY_OWN),
			]),
		});

		// Read: the document is this extension's format, nothing was marked incomplete by the reader, and
		// each session's own value is exactly what it carried.
		expect(bound.runtime.storage.pauseReason()).toBeUndefined();
		expect(bound.runtime.view.runtime("session-child")).toBe(480_000);
		expect(bound.runtime.view.runtime("session-grand")).toBe(0);
		expect(bound.runtime.view.runtime("session-legacy")).toBeUndefined();
		expect(bound.runtime.view.own("session-legacy")).toEqual(LEGACY_OWN);

		// Updated: the child's own activity adds its own 20000 to the figure the record carried, and the
		// mark it already carried is still there afterwards.
		activity(bound, CLOCK, CLOCK + 20_000);
		const document = await savedDocument(bound.consumptionFile, candidate => stored(candidate, "session-child")?.saveVersion === 2);
		expect(stored(document, "session-child")?.runtimeMs).toBe(500_000);
		expect(stored(document, "session-child")?.runtimeGap).toBe(true);
		// The records this instance observed nothing for are the very records the document held: the
		// legal zero is still a zero rather than an absence, and the record with no value gained no mark
		// and no figure.
		expect(stored(document, "session-grand")).toEqual(record("session-grand", "session-child", GRAND_OWN, { runtimeMs: 0 }));
		expect(stored(document, "session-legacy")).toEqual(record("session-legacy", "session-main", LEGACY_OWN));

		// Restored: a new instance over the same storage reads the same values back.
		const restarted = await bind({ storageRoot: bound.root });
		expect(restarted.runtime.view.runtime("session-child")).toBe(500_000);
		expect(restarted.runtime.view.runtime("session-grand")).toBe(0);
		expect(restarted.runtime.view.runtime("session-legacy")).toBeUndefined();
		expect(restarted.runtime.storage.pauseReason()).toBeUndefined();
	});

	test("a record whose optional figure is not a measurement costs that figure alone, and the schema still holds", async () => {
		const bound = await bind({
			document: baseline([
				record("session-main", null, MAIN_OWN),
				{ ...record("session-child", "session-main", CHILD_OWN), runtimeMs: "8 minutes" },
				{ ...record("session-grand", "session-child", GRAND_OWN), runtimeGap: "yes" },
			]),
		});

		// The document read as valid — the invalid optional facts are left out rather than taken for a
		// damaged document — so the instance is not paused and the sessions' own data is all there.
		expect(bound.runtime.storage.pauseReason()).toBeUndefined();
		expect(bound.runtime.view.own("session-child")).toEqual(CHILD_OWN);
		expect(bound.runtime.view.runtime("session-child")).toBeUndefined();
		expect(bound.runtime.view.runtime("session-grand")).toBeUndefined();
		expect(bound.feedback.filter(notice => notice.message.includes("runtimeMs"))).toHaveLength(1);
		expect(bound.feedback.filter(notice => notice.message.includes("runtimeGap"))).toHaveLength(1);

		// The consumption itself is not lenient: a record whose own usage is missing is never read as one.
		const refused = await bind({
			document: baseline([
				record("session-main", null, MAIN_OWN),
				{ id: "session-child", name: "子代理", parent: "session-main", saveVersion: 1, runtimeMs: 480_000 },
			]),
		});
		expect(refused.runtime.storage.pauseReason()).toBeDefined();
		expect(refused.runtime.view.own("session-child")).toBeUndefined();
	});
});
