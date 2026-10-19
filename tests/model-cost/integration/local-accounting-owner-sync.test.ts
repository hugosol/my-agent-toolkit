/**
 * A session's own accounting, its own confirmed commit, and the owner's adoption of it (P16, P17, P19;
 * S1, S2, S3; ticket 08).
 *
 * The seam under test is production throughout: the extension's real definition bound through the
 * framework's public binding (the port double, `tests/framework/support/harness-port-double.ts`) over
 * a harness that carries observations across processes, the runtime `createModelCostRuntime` builds
 * over a real temporary storage root, and — for the writer attribution — real child processes
 * (`./support/store-child.ts`) committing through the framework's own safe-file entry and lock. What
 * every case reads is what a frontend reads (`runtime.view`, `runtime.presentation.of`) and what the
 * file on the disk really holds; the figures are hand-computed from self-made price data, so no
 * expectation is derived by reproducing the implementation's own arithmetic.
 *
 * What this file is about is *who* writes and *what* a notice carries: an actual session's response
 * usage is accumulated and saved by the process that ran it, the notice that its own save landed
 * carries the count of confirmed writes and nothing the document holds, and the process serving the
 * owner that session follows adopts the document through the same read-only synchronization a
 * storage-level event reaches — writing nothing of its own and nothing on the writer's behalf.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { MODEL_COST } from "../../../extensions/model-cost/definition";
import type {
	ConsumptionDocument,
	OwnConsumption,
	SessionRecord,
} from "../../../extensions/model-cost/shared-logic/foundation/session/consumption-document";
import type { ModelPricingData } from "../../../extensions/model-cost/shared-logic/business/pricing/model-data";
import { type ModelCostRuntime, createModelCostRuntime } from "../../../extensions/model-cost/shared-logic/runtime";
import type { SessionFacts, TurnUsage } from "../../../framework/interface/session";
import type { OwnerReference } from "../../../framework/interface/state";
import type { ObservedSession, TurnSignal } from "../../../framework/runtime/port";
import { type PortDouble, portDouble } from "../../framework/support/harness-port-double";
import type { ChildPlan, ChildResult } from "../support/store-child";
import { FS_INSTRUMENT, runStoreChild } from "../support/store-child-runner";

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

/** One Beijing wall-clock reading on a workday of October 2026, as the epoch instant a request carries. */
function atBeijing(hours: number, minutes = 0): number {
	return Date.UTC(2026, 9, 14, hours, minutes) - BEIJING_OFFSET_MS;
}

/** An hour outside both of the data's own peak windows. */
const OFF_PEAK = atBeijing(13);

/** The self-made pricing data every case drives: one monetary tier, off-peak. */
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
const PROVIDER = "official";
const MODEL = "model-alpha";
const CONSUMPTION_FILE = "consumption.json";

/** The usage one completing request reports, as the framework delivers it. */
const USAGE: TurnUsage = { input: 2, cacheRead: 4, cacheWrite: 5, output: 3, totalTokens: 9 };

/** The amount that usage costs at the data's off-peak price: (2·2 + 4·0.5 + 3·8) / 1e6. */
const OFF_PEAK_AMOUNT = 0.00003;

/** The session this process serves: the owner of everything below, and the tree's root. */
const MAIN: SessionFacts = { sessionId: "session-main", kind: "main", name: "主会话", unavailable: [] };
const OWNER: OwnerReference = { kind: "owner", key: "main:local-accounting" };

/** The seat a reading that arrived from another process belongs to: the owner this process serves. */
const SEAT: OwnerReference = { kind: "inherited", key: OWNER.key };

/** One descendant session, as the process that ran it resolved its facts. */
const CHILD: SessionFacts = {
	sessionId: "session-child",
	kind: "sub",
	parentSessionId: MAIN.sessionId,
	name: "子代理A",
	unavailable: [],
};

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

/** The record one session's own accumulation is carried in, as the schema writes it. */
function record(id: string, parent: string | null, saveVersion: number, own: OwnConsumption): SessionRecord {
	return { id, name: `会话 ${id}`, parent, saveVersion, own };
}

/** A complete document of the approved schema, as a file on disk holds one. */
function document(sessions: readonly SessionRecord[], periodId = "period-local-accounting"): ConsumptionDocument {
	return {
		schemaVersion: 1,
		periodId,
		start: "2026-10-01T00:00:00.000Z",
		holiday: false,
		harnesses: { [HARNESS]: { sessions } },
	};
}

/** The document one root's consumption file holds right now. */
function storedDocument(file: string): ConsumptionDocument {
	return JSON.parse(readFileSync(file, "utf8")) as ConsumptionDocument;
}

/** The text of one root's consumption file right now, byte for byte. */
function fileText(file: string): string {
	return readFileSync(file, "utf8");
}

/** Every temporary directory this file created, removed after each case. */
const directories: string[] = [];

/** A fresh, isolated temporary directory. */
function tempDirectory(label: string): string {
	const directory = mkdtempSync(path.join(tmpdir(), `model-cost-${label}-`));
	directories.push(directory);
	return directory;
}

/** Waits until a condition holds, or states that it never did. */
async function until(condition: () => boolean, message: string, timeoutMs = 10000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!condition()) {
		if (Date.now() > deadline) throw new Error(message);
		/* The other process's own step is what is awaited; there is no clock to advance for it. */
		await Bun.sleep(5);
	}
}

/** Lets the event loop turn over until nothing already queued is left. */
async function queuedWorkSettled(): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>();
	setImmediate(resolve);
	await promise;
}

/** Waits until the owner's own read-only result holds the consumption one session's record carries. */
async function untilOwn(runtime: ModelCostRuntime, sessionId: string, own: OwnConsumption): Promise<void> {
	await until(
		() => JSON.stringify(runtime.view.own(sessionId)) === JSON.stringify(own),
		`the owner's own result never held ${sessionId}'s expected consumption`,
	);
}

/** One bound instance, and what a case drives and reads it through. */
interface Bound {
	readonly runtime: ModelCostRuntime;
	readonly double: PortDouble;
	/** The document this instance reads and writes. */
	readonly file: string;
}

/**
 * One instance over one storage root, bound through the framework's own binding exactly as an
 * assembly does it: the process's session observation source and the framework's statement channel
 * for a confirmed write are handed to the runtime the way `harnesses/omp.ts` hands them over.
 */
async function bind(root: string, baseline: ConsumptionDocument): Promise<Bound> {
	const file = path.join(root, CONSUMPTION_FILE);
	mkdirSync(root, { recursive: true });
	writeFileSync(file, JSON.stringify(baseline), "utf8");
	let built: ModelCostRuntime | undefined;
	const double = portDouble({ observationsAcrossProcesses: true });
	const result = double.bind(MODEL_COST, {
		config: { reader: () => `storageDir: ${root}\nbalanceTtlMs: 30000\ncodexQuotaTtlMs: 15000\n` },
		factory: context =>
			(built = createModelCostRuntime({
				config: { storageDir: root },
				configDirectory: root,
				userHomeDirectory: root,
				harness: HARNESS,
				data: DATA,
				session: context.session,
			})).implementation,
	});
	expect(result.bound).toBe(true);
	double.deliverSession(OWNER, { session: MAIN });
	await double.initiateRun(OWNER);
	if (built === undefined) throw new Error("the extension's factory never ran");
	return { runtime: built, double, file };
}

/** One request in an actual session, delivered as a Turn's start and its settled response. */
function deliverRequest(double: PortDouble, session: SessionFacts, at = OFF_PEAK): void {
	const started: TurnSignal = { kind: "request_started", session, at, provider: PROVIDER, model: MODEL };
	const settled: TurnSignal = { kind: "response_settled", session, at: at + 60_000, outcome: "completed", readings: [USAGE] };
	double.deliverTurn(started, { owner: OWNER });
	double.deliverTurn(settled, { owner: OWNER });
}

/** One Round edge of an actual session. */
function deliverRound(double: PortDouble, session: SessionFacts, event: "round_start" | "round_end"): void {
	double.deliverRound(OWNER, { event: { kind: event }, session });
}

/** One session's own confirmed writes, as the process that ran it states them. */
function notice(session: SessionFacts, commits: number): ObservedSession {
	return { session, owner: SEAT, commits };
}

/** One child process's plan: one configuration, one storage root and the snapshots it commits. */
function childPlan(input: {
	readonly label: string;
	readonly run: string;
	readonly storageDir: string;
	readonly commits: readonly SessionRecord[];
}): ChildPlan {
	return {
		storageDir: input.storageDir,
		configDirectory: input.storageDir,
		readyPath: path.join(input.run, `ready-${input.label}`),
		goPath: path.join(input.run, `go-${input.label}`),
		commits: input.commits.map(record => ({ harness: HARNESS, record })),
		harness: HARNESS,
		instrumented: true,
		resultPath: path.join(input.run, `result-${input.label}.json`),
	};
}

/**
 * One real process committing its snapshots, arrayed behind this case's own step: the case states the
 * plan, waits for the process's own baseline to be loaded, lets it commit, and reads back what it
 * states about its own commits and the calls it really made.
 */
async function committedByChild(plan: ChildPlan, run: string): Promise<ChildResult> {
	const starting = runStoreChild(plan, { cwd: run, preload: FS_INSTRUMENT });
	await until(() => existsSync(plan.readyPath as string), "the child's own baseline was never loaded");
	writeFileSync(plan.goPath as string, "go", "utf8");
	return starting;
}

afterEach(() => {
	for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("a session's own save is the writer, and its notice is what the owner acts on (P16, P17)", () => {
	test("a confirmed save states the notice, and a save that did not land states none", async () => {
		const root = tempDirectory("local-accounting");
		const bound = await bind(root, document([record(MAIN.sessionId, null, 1, oneRequest(1))]));

		// The session this process runs for the owner it serves, as its own host reports it.
		bound.double.deliverSession(SEAT, { event: { kind: "session_start", reason: "initial" }, session: CHILD });
		deliverRound(bound.double, CHILD, "round_start");
		deliverRequest(bound.double, CHILD);
		// A save that has only begun is not a success: an open Round's accumulation is this process's own
		// memory, nothing is on the disk and no count of confirmed writes has been recorded.
		expect(bound.double.observations.read(CHILD.sessionId)?.commits).toBeUndefined();
		expect(storedDocument(bound.file).harnesses[HARNESS]?.sessions.map(one => one.id)).toEqual([MAIN.sessionId]);

		deliverRound(bound.double, CHILD, "round_end");
		await until(
			() => storedDocument(bound.file).harnesses[HARNESS]?.sessions.length === 2,
			"the session's own save never landed",
		);
		await until(
			() => bound.double.observations.read(CHILD.sessionId)?.commits === 1,
			"the session's own confirmed save never stated its notice",
		);

		// The session's own Round end is what saved its own record, and the notice that follows it states the
		// confirmed write alone: the count of writes this process has confirmed, with no record, figure or
		// path of the document carried along. Its owner is served here, so that is where the notice is
		// recorded and there is no other process to hand it to.
		expect(bound.double.deliveredObservations).toEqual([]);
		expect(storedDocument(bound.file).harnesses[HARNESS]?.sessions.map(one => one.id)).toEqual([
			MAIN.sessionId,
			CHILD.sessionId,
		]);
		expect(bound.runtime.storage.session(HARNESS, CHILD.sessionId)?.own).toEqual(oneRequest(1));

		// The next Round's own commit is what the document cannot take: it is not this extension's document
		// any more, so the save is refused, the session's accumulation is dropped and no notice is stated
		// for a write that did not land — while the operator is told the instance paused.
		writeFileSync(bound.file, "{ not this extension's document", "utf8");
		const refusedText = fileText(bound.file);
		deliverRound(bound.double, CHILD, "round_start");
		deliverRequest(bound.double, CHILD);
		deliverRound(bound.double, CHILD, "round_end");
		await until(() => bound.runtime.storage.pauseReason() !== undefined, "the refused save never paused the instance");
		expect(bound.double.observations.read(CHILD.sessionId)?.commits).toBe(1);
		expect(bound.double.deliveredObservations).toEqual([]);
		expect(fileText(bound.file)).toBe(refusedText);
	});

	test("the owner adopts the document the notice names, read-only, and rewrites nothing of the writer's", async () => {
		const root = tempDirectory("owner-adoption");
		const saved = record(MAIN.sessionId, null, 2, oneRequest(2));
		const bound = await bind(root, document([saved]));

		// The owner's own session accounts a request whose Round is still open, so the owner's own commit
		// has not happened: that accumulation is this instance's memory alone.
		deliverRequest(bound.double, MAIN);
		expect(bound.runtime.view.own(MAIN.sessionId)).toEqual(oneRequest(3));

		// Another process's session confirmed a write of its own into the same document. Its record is what
		// its own save wrote, and the notice that states it carries no figure of it at all.
		const first = record(CHILD.sessionId, MAIN.sessionId, 1, oneRequest(4));
		const published = document([saved, first]);
		writeFileSync(bound.file, JSON.stringify(published), "utf8");
		const publishedText = fileText(bound.file);
		bound.double.deliverObserved(notice(CHILD, 1));
		await untilOwn(bound.runtime, CHILD.sessionId, first.own);

		// The record the other process saved is adopted through the owner's own read-only result, once and
		// by its own identity, and the figures are the document's: the owner's target keeps its own live
		// accumulation beside the adopted descendant's own.
		expect(bound.runtime.view.identity(CHILD.sessionId)?.parentSessionId).toBe(MAIN.sessionId);
		const target = { sessionId: MAIN.sessionId, provider: PROVIDER, model: MODEL } as const;
		expect(bound.runtime.presentation.of(target).current.costCny).toBeCloseTo(OFF_PEAK_AMOUNT * 3, 12);
		expect(bound.runtime.presentation.of(target).tree.costCny).toBeCloseTo(OFF_PEAK_AMOUNT * 7, 12);

		// The owner wrote nothing of its own and nothing on the writer's behalf: the document is the other
		// process's own bytes, byte for byte, and the owner's own accumulation is still only in memory.
		expect(fileText(bound.file)).toBe(publishedText);
		expect(JSON.parse(publishedText)).toEqual(published);
		expect(bound.runtime.view.own(MAIN.sessionId)).toEqual(oneRequest(3));

		// That session's next confirmed write replaces its own record — its accumulation carried forward,
		// never added to — and the later notice is read the same way: what the owner holds afterwards is the
		// document's record, so the two writers' requests are each counted once and no remote observation,
		// snapshot or reconnect doubles what a session spent.
		const second = record(CHILD.sessionId, MAIN.sessionId, 2, oneRequest(6));
		const replaced = document([saved, second]);
		writeFileSync(bound.file, JSON.stringify(replaced), "utf8");
		const replacedText = fileText(bound.file);
		bound.double.deliverObserved(notice(CHILD, 2), 2);
		await untilOwn(bound.runtime, CHILD.sessionId, second.own);
		expect(bound.runtime.presentation.of(target).tree.costCny).toBeCloseTo(OFF_PEAK_AMOUNT * 9, 12);
		expect(bound.runtime.view.own(MAIN.sessionId)).toEqual(oneRequest(3));
		expect(fileText(bound.file)).toBe(replacedText);
	});

	test("a notice for a root that holds no document adopts nothing and creates nothing (P19)", async () => {
		const root = tempDirectory("empty-root");
		// The owner's baseline is a root holding no document at all: the period every instance that starts
		// before the first write agrees on, and nothing on the disk.
		const bound = await bind(root, document([record(MAIN.sessionId, null, 1, oneRequest(1))]));
		rmSync(bound.file);

		// The notice is an event that may have changed the document, and there is no document: the read-only
		// synchronization reports nothing to adopt rather than reading an absent file as a fresh period, so
		// the owner's own accounting goes on from the baseline it already holds and no file appears.
		expect(await bound.runtime.synchronize()).toEqual({ kind: "absent" });
		expect(bound.double.deliveredObservations).toEqual([]);
		bound.double.deliverObserved(notice(CHILD, 1));
		await queuedWorkSettled();
		expect(existsSync(bound.file)).toBe(false);
		expect(bound.runtime.view.own(MAIN.sessionId)).toEqual(oneRequest(1));
		expect(bound.runtime.storage.period()?.periodId).toBe("period-local-accounting");
	});
});

describe("a real process's commit and the owner's read-only adoption (P16, P19)", () => {
	test("each request is accounted once by the session that spent it, and the owner's adoption never adds it twice", async () => {
		const run = tempDirectory("owner-sync-run");
		const root = tempDirectory("owner-sync-root");
		const saved = record(MAIN.sessionId, null, 1, oneRequest(2));
		const bound = await bind(root, document([saved]));
		const seededText = fileText(bound.file);

		// One real process commits a descendant session's own snapshot into the shared root, through the same
		// safe-file entry and cross-process lock a session's own save uses.
		const first = childPlan({
			label: "first",
			run,
			storageDir: root,
			commits: [record(CHILD.sessionId, MAIN.sessionId, 1, oneRequest(5))],
		});
		const firstResult = await committedByChild(first, run);
		expect(firstResult.load).toBe("loaded");
		expect(firstResult.commits).toEqual([{ kind: "saved" }]);
		// The writer is the child process and nothing else: one publication of the document, taken under the
		// shared lock, and the record it wrote is filed under its own session and its direct parent.
		expect(firstResult.fsOperations?.publishes).toBe(1);
		expect(firstResult.fsOperations?.locks).toBeGreaterThan(0);
		expect(firstResult.periodSessions).toEqual([MAIN.sessionId, CHILD.sessionId]);
		const afterFirst = fileText(bound.file);
		expect(afterFirst).not.toBe(seededText);

		// The owner's own process is handed the notice that session's confirmed write produces, and adopts
		// what the file holds: the descendant's own record once, the owner's own record exactly as it was.
		bound.double.deliverObserved(notice(CHILD, 1));
		await untilOwn(bound.runtime, CHILD.sessionId, oneRequest(5));
		expect(bound.runtime.view.own(MAIN.sessionId)).toEqual(oneRequest(2));
		expect(bound.runtime.view.inclusiveTotals(MAIN.sessionId)).toEqual(oneRequest(7));

		// A second real process commits that same session's next snapshot — its record carried forward, not
		// added to — and the owner's adoption replaces what it held rather than doubling it.
		const second = childPlan({
			label: "second",
			run,
			storageDir: root,
			commits: [record(CHILD.sessionId, MAIN.sessionId, 2, oneRequest(6))],
		});
		const secondResult = await committedByChild(second, run);
		expect(secondResult.commits).toEqual([{ kind: "saved" }]);
		expect(secondResult.fsOperations?.publishes).toBe(1);
		const afterSecond = fileText(bound.file);
		// The writer's own record is on disk as its own save left it, and the owner's process wrote none of
		// it: what the file holds after the owner's read is what the second process published.
		expect(storedDocument(bound.file).harnesses[HARNESS]?.sessions.find(one => one.id === CHILD.sessionId)?.own).toEqual(
			oneRequest(6),
		);
		bound.double.deliverObserved(notice(CHILD, 2), 2);
		await untilOwn(bound.runtime, CHILD.sessionId, oneRequest(6));
		expect(bound.runtime.view.own(MAIN.sessionId)).toEqual(oneRequest(2));
		expect(bound.runtime.view.inclusiveTotals(MAIN.sessionId)).toEqual(oneRequest(8));
		expect(fileText(bound.file)).toBe(afterSecond);
	});
});
