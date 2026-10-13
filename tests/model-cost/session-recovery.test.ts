/**
 * Session recovery, navigation and a save that did not land (P16, P17, P18, P19, P46; S2).
 *
 * The seam under test is production throughout: the extension's real definition is bound through the
 * framework's public binding (the port double, `tests/framework/support/harness-port-double.ts`), the
 * runtime is the one `createModelCostRuntime` builds, and every public Turn and Round delivery below
 * is fed exactly as a harness adapter would feed it. What the cases read is what a frontend would
 * read — `runtime.view`, the read-only consumption results, and the consumption document a Round's
 * own save publishes — never a private field.
 *
 * What these cases are about is what the extension does with a *document that is already there*, and
 * with a save that does not land. A restart is modelled by building another runtime over the same
 * storage root, which is exactly what the next process does; a fork, a navigation away and back, and
 * a second writer of the same document are modelled by the deliveries and the file contents a real
 * host produces. A save failure is modelled as a failure *of the commit*: a record another process
 * published under the same version, a version that moved on, a period a reset replaced, a document
 * that is not this schema any more, and an unreadable target — each with the outcome the framework's
 * coordinated update really answers.
 *
 * The price data is self-made: one provider, two monetary models and one window pair, so no expected
 * amount below depends on a real price or a real model id. Every amount is written here by hand from
 * those numbers (`input·2 + cacheRead·0.5 + output·8` per million tokens, times the data's own
 * multiplier of three inside a peak window), and the season an instant falls in is derived from the
 * contract's own windows, not from the code under test.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
import type { OwnerReference, SessionFacts, TurnSignal, TurnUsage } from "../../framework/core/protocol";
import { type PortDouble, type RoundBoundary, portDouble } from "../framework/support/harness-port-double";

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

/** One Beijing wall-clock reading on a workday of October 2026, as the epoch instant a request carries. */
function atBeijing(hours: number, minutes = 0): number {
	return Date.UTC(2026, 9, 14, hours, minutes) - BEIJING_OFFSET_MS;
}

/** An hour inside the morning peak window, and one outside both windows. */
const PEAK_START = atBeijing(10);
const OFF_PEAK_START = atBeijing(13);

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
const OTHER_NAME = "另一个会话";
const OTHER: SessionFacts = { sessionId: "session-other", kind: "main", name: OTHER_NAME, unavailable: [] };
/** A session a fork stands up: another identity whose transcript is a copy of its source's. */
const FORK: SessionFacts = { sessionId: "session-fork", kind: "main", unavailable: [] };
const OWNER: OwnerReference = { kind: "owner", key: "main:recovery" };
const PROVIDER = "official";
const MODEL = "model-alpha";
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

/** One settled response, with the reading the harness reported. */
function settled(session: SessionFacts, at: number, readings: readonly TurnUsage[] = [USAGE]): TurnSignal {
	return { kind: "response_settled", session, at, outcome: "completed", readings };
}

/** Every root this file created, removed after each case. */
const roots: string[] = [];

/** A fresh, isolated storage root with nothing in it. */
function freshRoot(): string {
	const root = mkdtempSync(path.join(tmpdir(), "model-cost-recovery-"));
	roots.push(root);
	return root;
}

/** One bound accounting instance, and what a case drives and reads it through. */
interface BoundAccounting {
	readonly runtime: ModelCostRuntime;
	readonly double: PortDouble;
	readonly file: string;
}

/**
 * One accounting instance over one storage root: the production runtime, bound through the framework's
 * own binding, with the baseline loaded by the initialization the first model request waits for.
 *
 * A restart is this function called a second time over the same root — a second runtime with its own
 * port double, which is what the next process builds and binds.
 */
async function bindAccounting(root: string, baseline?: unknown): Promise<BoundAccounting> {
	const file = path.join(root, CONSUMPTION_FILE);
	if (baseline !== undefined) writeFileSync(file, JSON.stringify(baseline), "utf8");
	const runtime = createModelCostRuntime({
		config: { storageDir: root },
		configDirectory: root,
		userHomeDirectory: root,
		harness: HARNESS,
		data: DATA,
	});
	const double = portDouble();
	double.bind(MODEL_COST, {
		factory: () => runtime.implementation,
		// The declared configuration is read once per extension per process; this reader answers the
		// declaration so the binding validates without touching the repository's own file.
		config: { reader: () => `storageDir: ${root}\nbalanceTtlMs: 30000\n` },
	});
	double.deliverSession(OWNER, { session: MAIN });
	await double.initiateRun(OWNER);
	return { runtime, double, file };
}

/** One request in an actual session, delivered as a Turn's start and its settled response. */
function deliverRequest(double: PortDouble, session: SessionFacts, at = OFF_PEAK_START): void {
	double.deliverTurn(startedAt(session, at), { owner: OWNER });
	double.deliverTurn(settled(session, at + 60_000), { owner: OWNER });
}

/** One Round of an actual session: its opening edge, and the end whose own save is dispatched. */
function deliverRound(double: PortDouble, session: SessionFacts, event: "round_start" | "round_end"): RoundBoundary {
	return double.deliverRound(OWNER, { event: { kind: event }, session });
}

/** One whole Round with one request in it, ended — the shape every ordinary save has. */
async function recordOneRequest(accounting: BoundAccounting, session: SessionFacts): Promise<void> {
	deliverRequest(accounting.double, session);
	deliverRound(accounting.double, session, "round_start");
	deliverRound(accounting.double, session, "round_end");
}

/** Every session record one document holds, whichever harness key it sits under. */
function sessionsOf(document: ConsumptionDocument): SessionRecord[] {
	return Object.values(document.harnesses).flatMap(bucket => bucket.sessions);
}

/** One session's record in a document, or `undefined` when the document holds none for that id. */
function recordOf(document: ConsumptionDocument, id: string): SessionRecord | undefined {
	return sessionsOf(document).find(record => record.id === id);
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
 * The feedback one Round boundary's own save produced, waited for: the commit is asynchronous, so
 * the notice a case reads is the one that landed when the save settled, not one it assumed.
 */
async function feedbackOf(boundary: RoundBoundary): Promise<readonly { readonly level: string; readonly message: string }[]> {
	const deadline = Date.now() + 5_000;
	while (boundary.feedback.length === 0 && Date.now() < deadline) await queuedWorkSettled();
	return boundary.feedback;
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("a restart continues what the document already holds (P16, P17, P18)", () => {
	test("an independent restart restores the saved totals, the period and the version, and adds only what it accounted", async () => {
		const root = freshRoot();
		const first = await bindAccounting(root);
		await recordOneRequest(first, MAIN);
		const published = await savedDocument(first.file, document => recordOf(document, MAIN.sessionId) !== undefined);
		expect(sessionsOf(published)).toEqual([
			{ id: MAIN.sessionId, name: MAIN_NAME, parent: null, saveVersion: 1, own: oneRequest(1) },
		]);
		const period = published.periodId;

		// The process ends and an independent one starts over the same root: its baseline is the
		// document, so what the display answers before any delivery of this process is the saved
		// consumption and version rather than a fresh start.
		const second = await bindAccounting(root);
		expect(second.runtime.view.own(MAIN.sessionId)).toEqual(oneRequest(1));
		expect(second.runtime.view.identity(MAIN.sessionId)).toEqual({
			sessionId: MAIN.sessionId,
			name: MAIN_NAME,
			parentSessionId: null,
		});

		await recordOneRequest(second, MAIN);
		const next = await savedDocument(second.file, document => recordOf(document, MAIN.sessionId)?.saveVersion === 2);
		// The same period, the same single record and the version continued from the saved one: one
		// request's own consumption was added to what was already there, and nothing was re-derived
		// from a host history or merged from an archive — the root holds this one document and nothing
		// else was written into it.
		expect(next.periodId).toBe(period);
		expect(sessionsOf(next)).toEqual([
			{ id: MAIN.sessionId, name: MAIN_NAME, parent: null, saveVersion: 2, own: oneRequest(2) },
		]);
		// The root holds the one active document and nothing else: no archive of a closed period and no
		// second record set, because nothing here reads or writes a history.
		expect(readdirSync(root).filter(name => name.endsWith(".json"))).toEqual([CONSUMPTION_FILE]);
	});

	test("a restored session shows no Round, and the next one counts only what this instance saw (P18)", async () => {
		const root = freshRoot();
		const first = await bindAccounting(root);
		await recordOneRequest(first, MAIN);
		await savedDocument(first.file, document => recordOf(document, MAIN.sessionId) !== undefined);

		// The instance that restarts holds an accumulation it read from a file: a session total, never
		// a Round. The file's own difference is not the previous Round, and no Round is shown at all.
		const second = await bindAccounting(root);
		expect(second.runtime.view.roundTotals(MAIN.sessionId)).toBeUndefined();

		// A Round it really sees begin is measured from that restored total: nothing is published as a
		// previous Round, and the request made inside it is the Round's own addition — the consumption
		// the file already held is not read as one.
		deliverRound(second.double, MAIN, "round_start");
		expect(second.runtime.view.roundTotals(MAIN.sessionId)?.previous).toBeUndefined();
		deliverRequest(second.double, MAIN);
		expect(second.runtime.view.roundTotals(MAIN.sessionId)?.current).toEqual(oneRequest(1));
		expect(second.runtime.view.roundTotals(MAIN.sessionId)?.previous).toBeUndefined();

		deliverRound(second.double, MAIN, "round_end");
		await savedDocument(second.file, document => recordOf(document, MAIN.sessionId)?.saveVersion === 2);
		expect(second.runtime.view.roundTotals(MAIN.sessionId)?.previous).toEqual(oneRequest(1));
	});

	test("a session the document records is not rolled back by another session's work, and continuing it adds on top (P17)", async () => {
		const root = freshRoot();
		const first = await bindAccounting(root);
		await recordOneRequest(first, MAIN);
		const saved = await savedDocument(first.file, document => recordOf(document, MAIN.sessionId) !== undefined);
		const mainRecord = recordOf(saved, MAIN.sessionId);

		// The instance comes back and works in another session — a navigation away, in effect — which
		// publishes its own record into the same document.
		const second = await bindAccounting(root);
		await recordOneRequest(second, OTHER);
		const withOther = await savedDocument(second.file, document => recordOf(document, OTHER.sessionId) !== undefined);
		// The first session's own record is the one that was already there, unchanged in every field:
		// nothing about another session's consumption moved, merged or reduced it.
		expect(recordOf(withOther, MAIN.sessionId)).toEqual(mainRecord);
		expect(recordOf(withOther, OTHER.sessionId)).toEqual({
			id: OTHER.sessionId,
			name: OTHER_NAME,
			parent: null,
			saveVersion: 1,
			own: oneRequest(1),
		});

		// Coming back to it continues the same identity from its own saved version: the second
		// request is added to the saved one rather than starting the session over.
		await recordOneRequest(second, MAIN);
		const returned = await savedDocument(second.file, document => recordOf(document, MAIN.sessionId)?.saveVersion === 2);
		expect(recordOf(returned, MAIN.sessionId)).toEqual({
			id: MAIN.sessionId,
			name: MAIN_NAME,
			parent: null,
			saveVersion: 2,
			own: oneRequest(2),
		});
		expect(recordOf(returned, OTHER.sessionId)).toEqual({
			id: OTHER.sessionId,
			name: OTHER_NAME,
			parent: null,
			saveVersion: 1,
			own: oneRequest(1),
		});
	});
});

describe("a fork is its own session from zero, and its source is untouched (P19)", () => {
	test("copying a transcript accounts nothing, and the fork's own request adds only its own record", async () => {
		// The source session is one the document already holds — the state a running session is in when
		// the harness forks it — so what the fork's own accumulation starts from is not a matter of when
		// this instance happened to save.
		const sourceRecord: SessionRecord = {
			id: MAIN.sessionId,
			name: MAIN_NAME,
			parent: null,
			saveVersion: 1,
			own: oneRequest(1),
		};
		const baseline: ConsumptionDocument = {
			schemaVersion: 1,
			periodId: "period-one",
			start: "2026-10-01T00:00:00.000Z",
			holiday: false,
			harnesses: { [HARNESS]: { sessions: [sourceRecord] } },
		};
		const { runtime, double, file } = await bindAccounting(freshRoot(), baseline);
		const before = readFileSync(file, "utf8");

		// The fork's transcript is a copy of the source's, but a copy is not a request: no Turn of the
		// new identity was issued, so nothing is accounted for it, nothing is written, and the file is
		// the same document it was.
		expect(runtime.view.own(FORK.sessionId)).toBeUndefined();
		await queuedWorkSettled();
		expect(readFileSync(file, "utf8")).toBe(before);

		// Its first real request is its own: a record of its own identity, at its own first version,
		// holding exactly that request — while the source's record is the same record it was.
		double.deliverSession(OWNER, { session: FORK });
		await recordOneRequest({ runtime, double, file }, FORK);
		const document = await savedDocument(file, candidate => recordOf(candidate, FORK.sessionId) !== undefined);
		expect(recordOf(document, FORK.sessionId)).toEqual({
			id: FORK.sessionId,
			name: FORK.sessionId,
			parent: null,
			saveVersion: 1,
			own: oneRequest(1),
		});
		expect(recordOf(document, MAIN.sessionId)).toEqual(sourceRecord);
		expect(sessionsOf(document)).toHaveLength(2);
	});
});

describe("a save that did not land is reported, dropped, and re-initialized from the disk (P46)", () => {
	test("a record another writer holds is kept, the refused consumption is dropped, and the next save continues from the disk's version", async () => {
		const file = path.join(freshRoot(), CONSUMPTION_FILE);
		const { runtime, double } = await bindAccounting(path.dirname(file));
		const theirs: SessionRecord = {
			id: MAIN.sessionId,
			name: "另一个进程写的名字",
			parent: null,
			saveVersion: 1,
			own: { [PROVIDER]: { [MODEL]: { tokens: { input: 100, cacheRead: 0, cacheWrite: 0, output: 0 }, costCny: 0.5 } } },
		};
		const theirDocument: ConsumptionDocument = {
			schemaVersion: 1,
			periodId: "period-one",
			start: "2026-10-01T00:00:00.000Z",
			holiday: true,
			harnesses: { [HARNESS]: { sessions: [theirs] } },
		};
		// Another process publishes its own record of that session at the same version this instance is
		// about to publish. The instance does not read the file per request, so this is exactly the
		// cross-process case that reaches the coordinated update.
		writeFileSync(file, JSON.stringify(theirDocument), "utf8");

		deliverRequest(double, MAIN);
		deliverRound(double, MAIN, "round_start");
		const boundary = deliverRound(double, MAIN, "round_end");
		const notices = await feedbackOf(boundary);
		expect(notices).toHaveLength(1);
		expect(notices[0]?.level).toBe("error");
		expect(notices[0]?.message).toContain(CONSUMPTION_FILE);
		expect(notices[0]?.message).toContain("没有写入");
		expect(notices[0]?.message).toContain("丢弃");

		// What did not land is dropped rather than kept for a later save: the session's own consumption
		// is the disk's record again — not zero, and not the request that was refused — while the
		// document the disk holds is exactly the document the other writer left, its holiday included.
		expect(runtime.view.own(MAIN.sessionId)).toEqual(theirs.own);
		expect(readDocument(file)).toEqual(theirDocument);

		// The request that was refused is not accounted a second time: its identity is still the
		// handled one, so the same settled response arriving again leaves the session where it is.
		double.deliverTurn(settled(MAIN, atBeijing(13, 5)), { owner: OWNER });
		expect(runtime.view.own(MAIN.sessionId)).toEqual(theirs.own);
		expect(readDocument(file)).toEqual(theirDocument);

		// A Round that consumed nothing after the failure writes nothing: the dropped request is not
		// re-submitted by the next boundary that comes along.
		deliverRound(double, MAIN, "round_start");
		deliverRound(double, MAIN, "round_end");
		await queuedWorkSettled();
		expect(readDocument(file)).toEqual(theirDocument);

		// The next real consumption continues from the disk: version 2 of that session's identity, the
		// other writer's amounts plus this request — the dropped one is not in there.
		await recordOneRequest({ runtime, double, file }, MAIN);
		const next = await savedDocument(file, document => recordOf(document, MAIN.sessionId)?.saveVersion === 2);
		expect(recordOf(next, MAIN.sessionId)).toEqual({
			id: MAIN.sessionId,
			name: MAIN_NAME,
			parent: null,
			saveVersion: 2,
			own: {
				[PROVIDER]: {
					[MODEL]: {
						tokens: { input: 102, cacheRead: 4, cacheWrite: 5, output: 3 },
						costCny: 0.50003,
					},
				},
			},
		});
	});

	test("a version that moved on is restored from the disk, and the session goes on from that version", async () => {
		const root = freshRoot();
		const loaded: SessionRecord = {
			id: MAIN.sessionId,
			name: MAIN_NAME,
			parent: null,
			saveVersion: 3,
			own: oneRequest(1),
		};
		const { runtime, double, file } = await bindAccounting(root, {
			schemaVersion: 1,
			periodId: "period-one",
			start: "2026-10-01T00:00:00.000Z",
			holiday: false,
			harnesses: { [HARNESS]: { sessions: [loaded] } },
		});
		// Another process moved that session on to version 7 while this instance ran.
		const ahead: SessionRecord = { ...loaded, saveVersion: 7, own: oneRequest(9) };
		const aheadDocument: ConsumptionDocument = {
			schemaVersion: 1,
			periodId: "period-one",
			start: "2026-10-01T00:00:00.000Z",
			holiday: false,
			harnesses: { [HARNESS]: { sessions: [ahead] } },
		};
		writeFileSync(file, JSON.stringify(aheadDocument), "utf8");

		deliverRequest(double, MAIN);
		deliverRound(double, MAIN, "round_start");
		const notices = await feedbackOf(deliverRound(double, MAIN, "round_end"));
		expect(notices).toHaveLength(1);
		expect(notices[0]?.message).toContain("stale-version");

		// The version the disk holds is this instance's version now: the display reads the disk's own
		// consumption, and the next save is one version later than it — on the disk's record, not on the
		// stale one this instance had loaded.
		expect(runtime.view.own(MAIN.sessionId)).toEqual(ahead.own);
		await recordOneRequest({ runtime, double, file }, MAIN);
		const next = await savedDocument(file, document => recordOf(document, MAIN.sessionId)?.saveVersion === 8);
		expect(recordOf(next, MAIN.sessionId)?.own).toEqual(oneRequest(10));
	});

	test("a period another CLI reset is not written into: the instance re-initializes onto the disk's own period", async () => {
		const root = freshRoot();
		const first = await bindAccounting(root);
		await recordOneRequest(first, MAIN);
		await savedDocument(first.file, document => recordOf(document, MAIN.sessionId) !== undefined);

		const second = await bindAccounting(root);
		// Another CLI resets the statistics: the file belongs to a new period now, with no session in
		// it at all.
		const reset = {
			schemaVersion: 1,
			periodId: "period-two",
			start: "2026-10-10T00:00:00.000Z",
			holiday: false,
			harnesses: {},
		};
		writeFileSync(second.file, JSON.stringify(reset), "utf8");

		deliverRequest(second.double, MAIN);
		deliverRound(second.double, MAIN, "round_start");
		const notices = await feedbackOf(deliverRound(second.double, MAIN, "round_end"));
		expect(notices).toHaveLength(1);
		expect(notices[0]?.level).toBe("error");
		expect(notices[0]?.message).toContain("stale-period");

		// Nothing of the replaced period is rebound: the file the other CLI wrote is still exactly that,
		// and this instance's accumulation is the new period's — which holds no record of this session.
		expect(readDocument(second.file)).toEqual(reset);
		expect(second.runtime.view.own(MAIN.sessionId)).toBeUndefined();

		// New consumption accumulates in the new period, at a first version of its own.
		await recordOneRequest(second, MAIN);
		const next = await savedDocument(second.file, document => recordOf(document, MAIN.sessionId) !== undefined);
		expect(next.periodId).toBe("period-two");
		expect(recordOf(next, MAIN.sessionId)).toEqual({
			id: MAIN.sessionId,
			name: MAIN_NAME,
			parent: null,
			saveVersion: 1,
			own: oneRequest(1),
		});
	});

	test("a target that cannot be read is reported as that failure, and the baseline it last read stands", async () => {
		const root = freshRoot();
		const loaded: SessionRecord = {
			id: MAIN.sessionId,
			name: MAIN_NAME,
			parent: null,
			saveVersion: 3,
			own: oneRequest(1),
		};
		const baseline: ConsumptionDocument = {
			schemaVersion: 1,
			periodId: "period-one",
			start: "2026-10-01T00:00:00.000Z",
			holiday: false,
			harnesses: { [HARNESS]: { sessions: [loaded] } },
		};
		const { runtime, double, file } = await bindAccounting(root, baseline);
		// The document this instance loaded becomes unreadable: the file is replaced by a directory, so
		// the update cannot read a document at all.
		rmSync(file, { force: true });
		mkdirSync(file);

		deliverRequest(double, MAIN);
		deliverRound(double, MAIN, "round_start");
		const notices = await feedbackOf(deliverRound(double, MAIN, "round_end"));
		expect(notices).toHaveLength(1);
		expect(notices[0]?.level).toBe("error");
		expect(notices[0]?.message).toContain("failed");
		// Nothing was zeroed or re-derived from the failure: the session reads the baseline this
		// instance last read, and the target is left exactly as it is.
		expect(runtime.view.own(MAIN.sessionId)).toEqual(loaded.own);
		expect(existsSync(path.join(file, CONSUMPTION_FILE))).toBe(false);

		// Once the target is a document again, the session goes on from that baseline: the version after
		// the loaded one, carrying the loaded consumption and only the request that followed the failure.
		rmSync(file, { recursive: true, force: true });
		writeFileSync(file, JSON.stringify(baseline), "utf8");
		await recordOneRequest({ runtime, double, file }, MAIN);
		const next = await savedDocument(file, document => recordOf(document, MAIN.sessionId)?.saveVersion === 4);
		expect(recordOf(next, MAIN.sessionId)?.own).toEqual(oneRequest(2));
	});

	test("a document that became unusable under the instance pauses it, and it is not guessed at or overwritten", async () => {
		const root = freshRoot();
		const { runtime, double, file } = await bindAccounting(root);
		// The file is no longer this extension's schema: not JSON at all.
		const broken = "{ this is not a document";
		writeFileSync(file, broken, "utf8");

		deliverRequest(double, MAIN);
		deliverRound(double, MAIN, "round_start");
		const notices = await feedbackOf(deliverRound(double, MAIN, "round_end"));
		expect(notices).toHaveLength(1);
		expect(notices[0]?.level).toBe("error");
		expect(notices[0]?.message).toContain("暂停");

		// The file is left for inspection, and the instance holds nothing: no baseline, no accumulation
		// presented as one, and nothing written over what it could not read.
		expect(readFileSync(file, "utf8")).toBe(broken);
		expect(runtime.view.own(MAIN.sessionId)).toBeUndefined();

		// A later request is not accounted into a baseline that does not exist, and it does not write
		// either: only a normal initialization reads the file again.
		deliverRequest(double, MAIN);
		deliverRound(double, MAIN, "round_start");
		deliverRound(double, MAIN, "round_end");
		await queuedWorkSettled();
		expect(readFileSync(file, "utf8")).toBe(broken);
		expect(runtime.view.own(MAIN.sessionId)).toBeUndefined();
	});
});
