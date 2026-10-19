/**
 * The read-only synchronizations a turn's commit notices cost, and the period they must not cross
 * (P18, P20; S1, S3; ticket 09).
 *
 * The seam under test is production throughout: the extension's real definition bound through the
 * framework's public binding (the port double, `tests/framework/support/harness-port-double.ts`), the
 * runtime `createModelCostRuntime` builds over a real temporary storage root, and — where the case
 * needs a writer that is really another process — the storage suite's child fixture committing
 * through the framework's own safe-file entry and lock. What every case reads is what a frontend
 * reads (`runtime.view`, `runtime.presentation`) and what the file on the disk really holds; the
 * figures are hand-computed from self-made price data, so no expectation is derived by reproducing
 * the implementation's own arithmetic.
 *
 * A commit notice states that one session's confirmed write landed; what the owner owes it is a
 * read-only synchronization. Several notices in one turn are one such read, a notice that arrives
 * while the read is under way is the one after it rather than a lost one, and neither read is a write:
 * this instance's uncommitted accumulation is not saved, discarded or counted twice, and a document
 * naming a generation this instance was not accumulating in closes that accumulation rather than
 * carrying it into the new period.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { MODEL_COST } from "../../../extensions/model-cost/definition";
import type { ConsumptionDocument, OwnConsumption, SessionRecord } from "../../../extensions/model-cost/shared-logic/foundation/session/consumption-document";
import type { ModelPricingData } from "../../../extensions/model-cost/shared-logic/business/pricing/model-data";
import { type ModelCostRuntime, createModelCostRuntime } from "../../../extensions/model-cost/shared-logic/runtime";
import type { SessionFacts, TurnUsage } from "../../../framework/interface/session";
import type { OwnerReference } from "../../../framework/interface/state";
import type { ObservedSession, TurnSignal } from "../../../framework/core/protocol";
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
const OWNER: OwnerReference = { kind: "owner", key: "main:coalesced-sync" };

/** The seat a reading that arrived from another process belongs to: the owner this process serves. */
const SEAT: OwnerReference = { kind: "inherited", key: OWNER.key };

/** Three descendant sessions, as the processes that ran them resolved their facts. */
const FIRST: SessionFacts = { sessionId: "session-first", kind: "sub", parentSessionId: MAIN.sessionId, name: "子代理一", unavailable: [] };
const SECOND: SessionFacts = { sessionId: "session-second", kind: "sub", parentSessionId: MAIN.sessionId, name: "子代理二", unavailable: [] };
const THIRD: SessionFacts = { sessionId: "session-third", kind: "sub", parentSessionId: MAIN.sessionId, name: "子代理三", unavailable: [] };

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
function document(sessions: readonly SessionRecord[], periodId = "period-coalesced-sync"): ConsumptionDocument {
	return {
		schemaVersion: 1,
		periodId,
		start: "2026-10-01T00:00:00.000Z",
		holiday: false,
		harnesses: { [HARNESS]: { sessions } },
	};
}

/** Every temporary directory this file created, removed after each case. */
const directories: string[] = [];

/** A fresh, isolated temporary directory. */
function tempDirectory(label: string): string {
	const directory = mkdtempSync(path.join(tmpdir(), `model-cost-${label}-`));
	directories.push(directory);
	return directory;
}

/**
 * Waits until a condition holds, or states that it never did.
 *
 * This is the one wait bound to the platform clock, and it exists for the child process the case
 * starts: another process's readiness is a file it writes, not a promise this process can await.
 */
async function until(condition: () => boolean, message: string, timeoutMs = 10000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!condition()) {
		if (Date.now() > deadline) throw new Error(message);
		await Bun.sleep(5);
	}
}

/** What one instance's own store was really asked to do, counted where the runtime reaches it. */
interface StoreCalls {
	/** How many read-only synchronizations the runtime ran. */
	syncs: number;
	/** How many coordinated commits the runtime attempted. */
	commits: number;
	/** How many baseline loads the runtime ran. */
	loads: number;
	/** Resolves once at least this many synchronizations have settled. */
	settled(count: number): Promise<void>;
}

/**
 * Count the calls this instance's runtime makes on its own store.
 *
 * The store is the object the runtime result hands out (`runtime.storage`) and the one the fixture
 * that drives it directly reads; the counts are calls, so "one read for these notices" is evidence of
 * the operation and not of what a file happens to hold afterwards. Every wrapped member forwards to
 * the production one unchanged, and `settled` is satisfied as each read really finishes rather than
 * after a guessed duration.
 */
function countStoreCalls(runtime: ModelCostRuntime): StoreCalls {
	const settledSyncs: number[] = [];
	const waiting: { readonly count: number; readonly resolve: () => void }[] = [];
	const calls: StoreCalls = {
		syncs: 0,
		commits: 0,
		loads: 0,
		settled(count) {
			if (settledSyncs.length >= count) return Promise.resolve();
			const { promise, resolve } = Promise.withResolvers<void>();
			waiting.push({ count, resolve });
			return promise;
		},
	};
	const storage = runtime.storage;
	const synchronize = storage.synchronize.bind(storage);
	const commit = storage.commit.bind(storage);
	const load = storage.load.bind(storage);
	storage.synchronize = async () => {
		calls.syncs += 1;
		const outcome = await synchronize();
		// The store answered; the runtime's own continuation of that read — adopting a replaced period,
		// publishing a changed one — runs as a later promise job. Reporting the read as settled one turn
		// of the event loop later is what lets a case read the accounting's own answer without a wait
		// bound to a duration.
		setImmediate(() => {
			settledSyncs.push(1);
			for (const waiter of [...waiting]) {
				if (settledSyncs.length < waiter.count) continue;
				waiting.splice(waiting.indexOf(waiter), 1);
				waiter.resolve();
			}
		});
		return outcome;
	};
	storage.commit = async (harness, candidate, wait) => {
		calls.commits += 1;
		return commit(harness, candidate, wait);
	};
	storage.load = async () => {
		calls.loads += 1;
		return load();
	};
	return calls;
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

/** One child process's plan: one configuration and the snapshots it commits. */
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
		commits: input.commits.map(candidate => ({ harness: HARNESS, record: candidate })),
		harness: HARNESS,
		resultPath: path.join(input.run, `result-${input.label}.json`),
	};
}

/**
 * One real process committing its snapshots, arrayed behind this case's own step: the case states the
 * plan, waits for the process's own baseline to be loaded, lets it commit, and reads back what it
 * states about its own commits.
 */
async function committedByChild(plan: ChildPlan, run: string, preload?: string): Promise<ChildResult> {
	const starting = runStoreChild(plan, { cwd: run, ...(preload === undefined ? {} : { preload }) });
	await until(() => existsSync(plan.readyPath as string), "the child's own baseline was never loaded");
	writeFileSync(plan.goPath as string, "go", "utf8");
	return starting;
}

afterEach(() => {
	for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("a turn's commit notices cost the read-only synchronizations they need (P18)", () => {
	test("several notices in one turn are one synchronization, and the file's own latest records are what the owner adopts", async () => {
		const root = tempDirectory("coalesced-notices");
		const main = record(MAIN.sessionId, null, 1, oneRequest(1));
		const bound = await bind(root, document([main]));
		const calls = countStoreCalls(bound.runtime);

		// Three sessions' confirmed writes, committed by the processes that ran them before this turn's
		// notices reach the owner: the file holds each record once, under its own identity.
		const first = record(FIRST.sessionId, MAIN.sessionId, 1, oneRequest(2));
		const second = record(SECOND.sessionId, MAIN.sessionId, 1, oneRequest(3));
		const third = record(THIRD.sessionId, MAIN.sessionId, 1, oneRequest(4));
		writeFileSync(bound.file, JSON.stringify(document([main, first, second, third])), "utf8");
		const published = readFileSync(bound.file, "utf8");
		const rootEntries = readdirSync(root).sort();

		// The three notices of one turn: each process stated one confirmed write of its own session.
		const hints = [notice(FIRST, 1), notice(SECOND, 1), notice(THIRD, 1)];
		for (const hint of hints) bound.double.deliverObserved(hint);
		await calls.settled(1);

		// The notices are three and the reads are one: what a notice costs is the read the turn still
		// needs, not a read of its own.
		expect(hints).toHaveLength(3);
		expect(calls.syncs).toBe(1);
		// The synchronization wrote nothing and initialized nothing: no commit was attempted and no
		// baseline was loaded a second time.
		expect(calls.commits).toBe(0);
		expect(calls.loads).toBe(0);
		// The file is the other processes' own document, byte for byte, and no lock or staging entry was
		// left beside it.
		expect(readFileSync(bound.file, "utf8")).toBe(published);
		expect(readdirSync(root).sort()).toEqual(rootEntries);
		// What the owner holds is the file's latest record of each session, once, beside its own record.
		expect(bound.runtime.view.own(MAIN.sessionId)).toEqual(main.own);
		for (const [facts, saved] of [
			[FIRST, first],
			[SECOND, second],
			[THIRD, third],
		] as const) {
			expect(bound.runtime.view.own(facts.sessionId)).toEqual(saved.own);
			expect(bound.runtime.view.identity(facts.sessionId)?.parentSessionId).toBe(MAIN.sessionId);
		}
		expect(bound.runtime.storage.sessions(HARNESS).map(candidate => candidate.id)).toEqual([
			MAIN.sessionId,
			FIRST.sessionId,
			SECOND.sessionId,
			THIRD.sessionId,
		]);
	});

	test("a notice delivered while a synchronization is paused is read after it, and a real process's commit made in between is what the owner adopts", async () => {
		const run = tempDirectory("paused-sync-run");
		const root = tempDirectory("paused-sync-root");
		const main = record(MAIN.sessionId, null, 1, oneRequest(1));
		const bound = await bind(root, document([main]));

		// This case's own step inside the read: the first synchronization really reads the document and
		// then waits here, so the commit below is made after the read that is still under way.
		const firstRead = Promise.withResolvers<void>();
		const release = Promise.withResolvers<void>();
		const secondRead = Promise.withResolvers<void>();
		let syncs = 0;
		const realSynchronize = bound.runtime.storage.synchronize.bind(bound.runtime.storage);
		bound.runtime.storage.synchronize = async () => {
			syncs += 1;
			const outcome = await realSynchronize();
			if (syncs === 1) {
				firstRead.resolve();
				await release.promise;
			} else if (syncs === 2) {
				// The runtime adopts what the store read before it resolves the notice's own run; reporting
				// this read one event-loop turn later is what lets the case read that adoption.
				setImmediate(() => secondRead.resolve());
			}
			return outcome;
		};

		// The first notice of the turn asks for a read; that read sees the document before the commit.
		bound.double.deliverObserved(notice(FIRST, 1));
		await firstRead.promise;

		// A real process commits its own session into the same root while the owner's read is paused:
		// this write is not in the document the first read saw.
		const committed = record(SECOND.sessionId, MAIN.sessionId, 1, oneRequest(5));
		const child = await committedByChild(
			childPlan({ label: "during-sync", run, storageDir: root, commits: [committed] }),
			run,
		);
		expect(child.commits).toEqual([{ kind: "saved" }]);
		const afterChild = readFileSync(bound.file, "utf8");

		// Its notice reaches the owner while the first read is still paused. The read cannot see what the
		// commit wrote, so the notice is owed one more read rather than being joined and forgotten.
		bound.double.deliverObserved(notice(SECOND, 1));
		release.resolve();
		await secondRead.promise;

		// The notice was not lost: the read after it adopted the record the real process committed.
		expect(syncs).toBe(2);
		expect(bound.runtime.view.own(SECOND.sessionId)).toEqual(committed.own);
		expect(bound.runtime.view.identity(SECOND.sessionId)?.parentSessionId).toBe(MAIN.sessionId);
		expect(bound.runtime.view.own(MAIN.sessionId)).toEqual(main.own);
		// Both reads were read-only: the file is what the child process published, byte for byte, and the
		// owner's own record is its loaded one rather than a write of its own.
		expect(readFileSync(bound.file, "utf8")).toBe(afterChild);
		expect(bound.runtime.storage.period()?.periodId).toBe("period-coalesced-sync");
	});
});

describe("a same-period synchronization protects this instance's uncommitted accumulation (P20)", () => {
	test("the disk baseline is adopted while the in-flight amount stays local, unwritten and uncounted twice", async () => {
		const root = tempDirectory("same-period");
		const main = record(MAIN.sessionId, null, 1, oneRequest(1));
		const bound = await bind(root, document([main]));
		const calls = countStoreCalls(bound.runtime);

		// One request accounted in this period whose Round is still open: its accumulation has not reached
		// a commit and lives in this instance's memory alone.
		deliverRound(bound.double, MAIN, "round_start");
		deliverRequest(bound.double, MAIN);
		expect(bound.runtime.view.own(MAIN.sessionId)).toEqual(oneRequest(2));

		// Another process's session committed its own record into the same period's document.
		const external = record(SECOND.sessionId, MAIN.sessionId, 1, oneRequest(6));
		writeFileSync(bound.file, JSON.stringify(document([main, external])), "utf8");
		const published = readFileSync(bound.file, "utf8");

		// The notice reads the document, and what it adopts is the disk's baseline: the other process's
		// record is readable, while this instance's own uncommitted amount is neither written nor dropped
		// nor added a second time.
		bound.double.deliverObserved(notice(SECOND, 1));
		await calls.settled(1);
		expect(calls.syncs).toBe(1);
		expect(calls.commits).toBe(0);
		expect(bound.runtime.view.own(MAIN.sessionId)).toEqual(oneRequest(2));
		expect(bound.runtime.storage.session(HARNESS, MAIN.sessionId)?.own).toEqual(main.own);
		expect(bound.runtime.view.own(SECOND.sessionId)).toEqual(external.own);
		// The tree reads both once: the open Round's own amount (one saved request plus the in-flight one)
		// and the adopted descendant's six.
		expect(bound.runtime.view.inclusiveTotals(MAIN.sessionId)).toEqual(oneRequest(8));
		expect(readFileSync(bound.file, "utf8")).toBe(published);
	});
});

describe("a period another writer replaced is not carried forward (P20)", () => {
	test("the closed period's in-flight consumption is dropped, and a late notice reads only the new period's records", async () => {
		const root = tempDirectory("replaced-period");
		const main = record(MAIN.sessionId, null, 1, oneRequest(1));
		const bound = await bind(root, document([main]));
		const calls = countStoreCalls(bound.runtime);

		// Work measured in the old period: one settled request in a Round that is still open.
		deliverRound(bound.double, MAIN, "round_start");
		deliverRequest(bound.double, MAIN);
		expect(bound.runtime.view.own(MAIN.sessionId)).toEqual(oneRequest(2));

		// Another process replaces the accounting period: the document it publishes is a new generation
		// holding one record of its own and nothing of the closed period.
		const external = record(SECOND.sessionId, MAIN.sessionId, 1, oneRequest(3));
		writeFileSync(bound.file, JSON.stringify(document([external], "period-replaced")), "utf8");
		const replacedText = readFileSync(bound.file, "utf8");

		// The notice's read takes the new period on: its records are what the owner holds, and everything
		// measured in the closed period — including the open Round — went with it.
		bound.double.deliverObserved(notice(SECOND, 1));
		await calls.settled(1);
		expect(bound.runtime.view.own(SECOND.sessionId)).toEqual(external.own);
		expect(bound.runtime.view.own(MAIN.sessionId)).toBeUndefined();
		expect(bound.runtime.view.roundTotals(MAIN.sessionId)).toBeUndefined();
		expect(bound.runtime.presentation.accrued()).toEqual({ totalCny: OFF_PEAK_AMOUNT * 3, sessionCostsCny: [OFF_PEAK_AMOUNT * 3] });
		expect(bound.runtime.storage.periodSessions().map(candidate => candidate.id)).toEqual([SECOND.sessionId]);
		expect(readFileSync(bound.file, "utf8")).toBe(replacedText);

		// A late notice — the old period's session's own confirmed write — is a read of the new document
		// and nothing more: the closed accumulation is not brought back and the file is not rewritten.
		bound.double.deliverObserved(notice(MAIN, 1));
		await calls.settled(2);
		expect(calls.syncs).toBe(2);
		expect(bound.runtime.view.own(MAIN.sessionId)).toBeUndefined();
		expect(bound.runtime.view.inclusiveTotals(MAIN.sessionId)).toEqual(oneRequest(3));
		expect(readFileSync(bound.file, "utf8")).toBe(replacedText);

		// The Round the closed period left open ends without a snapshot: its consumption belongs to the
		// generation that was replaced, so nothing is published into the new period.
		deliverRound(bound.double, MAIN, "round_end");
		expect(calls.commits).toBe(0);
		expect(readFileSync(bound.file, "utf8")).toBe(replacedText);
		expect(bound.runtime.storage.sessions(HARNESS).map(candidate => candidate.id)).toEqual([SECOND.sessionId]);
	});
});

describe("the read-only synchronization writes nothing and initializes nothing (P18, P20)", () => {
	test("a real process reads the document with no lock, no publication and no commit", async () => {
		const run = tempDirectory("read-only-run");
		const root = tempDirectory("read-only-root");
		const main = record(MAIN.sessionId, null, 1, oneRequest(1));
		mkdirSync(root, { recursive: true });
		writeFileSync(path.join(root, CONSUMPTION_FILE), JSON.stringify(document([main])), "utf8");
		const seeded = readFileSync(path.join(root, CONSUMPTION_FILE), "utf8");

		// This process initializes over the document and then runs the production read-only entry once,
		// with the file-system instrument it was preloaded with counting what it really did.
		const reader = await committedByChild(
			{ ...childPlan({ label: "reader", run, storageDir: root, commits: [] }), syncs: 1, instrumented: true },
			run,
			FS_INSTRUMENT,
		);
		expect(reader.kind).toBe("ran");
		expect(reader.load).toBe("loaded");
		expect(reader.syncs).toEqual([{ kind: "adopted", periodChanged: false, changed: false }]);
		// The baseline's own read and the synchronization's: no lock operation, no replacement of the
		// document, and nothing left beside it.
		expect(reader.fsOperations).toEqual({ reads: 2, publishes: 0, locks: 0 });
		expect(readFileSync(path.join(root, CONSUMPTION_FILE), "utf8")).toBe(seeded);
		expect(readdirSync(root).sort()).toEqual([CONSUMPTION_FILE]);
	});

	test("a notice over an absent root creates nothing, and an unusable document pauses without a re-initialization", async () => {
		const root = tempDirectory("notice-baseline");
		const main = record(MAIN.sessionId, null, 1, oneRequest(1));
		const bound = await bind(root, document([main]));
		const calls = countStoreCalls(bound.runtime);

		// The root holds no document: a notice is a read that adopts nothing, not an initialization that
		// creates the root and treats its emptiness as a fresh period.
		rmSync(bound.file);
		bound.double.deliverObserved(notice(FIRST, 1));
		await calls.settled(1);
		expect(existsSync(bound.file)).toBe(false);
		expect(bound.runtime.storage.period()?.periodId).toBe("period-coalesced-sync");
		expect(bound.runtime.view.own(MAIN.sessionId)).toEqual(main.own);
		expect(calls.loads).toBe(0);

		// The document became something this extension cannot read: the notice's read pauses the instance
		// and leaves the file for inspection. It is a synchronization, so no baseline is loaded again.
		writeFileSync(bound.file, "{ not this extension's document", "utf8");
		const unusable = readFileSync(bound.file, "utf8");
		bound.double.deliverObserved(notice(SECOND, 1));
		await calls.settled(2);
		expect(bound.runtime.storage.pauseReason()).toBeDefined();
		expect(readFileSync(bound.file, "utf8")).toBe(unusable);
		expect(calls.loads).toBe(0);

		// A later notice is answered by the pause itself: the file is not read again, nothing is repaired,
		// and the instance stays paused until a real initialization rather than being re-initialized here.
		bound.double.deliverObserved(notice(THIRD, 1));
		await calls.settled(3);
		expect(calls.syncs).toBe(3);
		expect(calls.loads).toBe(0);
		expect(readFileSync(bound.file, "utf8")).toBe(unusable);
	});
});
