/**
 * The read-only synchronization of the storage baseline: adopting what another writer committed
 * without writing anything of this instance's own (P33, P34; S2, S3).
 *
 * The seam under test is production throughout: the extension's real definition is bound through the
 * framework's public binding (the port double), the runtime is the one `createModelCostRuntime`
 * builds over a real temporary storage root, the deliveries below are the ones a harness adapter
 * makes, and what every case reads is what a frontend reads — `runtime.view`, `runtime.presentation`
 * and the file on the disk. What the synchronization adds is the read half of sharing one root: a
 * document another writer committed is adopted, and nothing this instance accumulated and has not
 * committed is written out by the operation itself.
 *
 * The other writer is modelled the way the storage suite models one: a document written straight to
 * the file, which is exactly what another process's own commit produces. The price data is
 * self-made, the amounts are hand-computed from it (one request is `(2·2 + 4·0.5 + 3·8)/1e6`
 * XTS at the data's off-peak price), and every root is a fresh temporary directory removed after
 * the case.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { MODEL_COST } from "../../../extensions/model-cost/definition";
import type { ConsumptionDocument, OwnConsumption, SessionRecord } from "../../../extensions/model-cost/shared-logic/foundation/session/consumption-document";
import type { ModelPricingData } from "../../../extensions/model-cost/shared-logic/business/pricing/model-data";
import {
	type ModelCostRuntime,
	createModelCostRuntime,
	modelCostImplementation,
} from "../../../extensions/model-cost/shared-logic/runtime";
import type { ProviderAccess } from "../../../framework/interface/provider";
import type { SessionFacts, TurnUsage } from "../../../framework/interface/session";
import type { OwnerReference } from "../../../framework/interface/state";
import type { TurnSignal } from "../../../framework/runtime/port";
import type { HttpRequestOptions } from "../../../framework/interface/general/http";
import { testSessionCapability } from "../support/session-capability";
import { type PortDouble, type RoundBoundary, portDouble } from "../../framework/support/harness-port-double";
import { until } from "../../support/pending-query";

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

/** One Beijing wall-clock reading on a workday of October 2026, as the epoch instant a request carries. */
function atBeijing(hours: number, minutes = 0): number {
	return Date.UTC(2026, 9, 14, hours, minutes) - BEIJING_OFFSET_MS;
}

/** An hour outside both of the data's own peak windows. */
const OFF_PEAK = atBeijing(13);

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
const OTHER_HARNESS = "other-harness";
const MAIN_NAME = "主会话";
const MAIN: SessionFacts = { sessionId: "session-main", kind: "main", name: MAIN_NAME, unavailable: [] };
/** A session of the tracked provider, whose settled request is what checks the balance reading. */
const TRACKED: SessionFacts = { sessionId: "session-tracked", kind: "main", unavailable: [] };
const OWNER: OwnerReference = { kind: "owner", key: "main:refresh" };
const PROVIDER = "official";
const MODEL = "model-alpha";
const CONSUMPTION_FILE = "consumption.json";

/** The balance answer the provider returns, in its documented shape, as one JSON response. */
function balanceAnswer(total: string): Response {
	return new Response(
		JSON.stringify({
			is_available: true,
			balance_infos: [{ currency: "CNY", total_balance: total, granted_balance: "0.00", topped_up_balance: total }],
		}),
		{ status: 200, headers: { "content-type": "application/json" } },
	);
}

/** The usage one completing request reports, as the framework delivers it. */
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

/** The record one session's own accumulation is carried in, as the schema writes it. */
function record(id: string, parent: string | null, saveVersion: number, own: OwnConsumption): SessionRecord {
	return { id, name: `会话 ${id}`, parent, saveVersion, own };
}

/** A complete document of the approved schema, as a file on disk holds one. */
function document(
	sessions: readonly SessionRecord[],
	periodId = "period-one",
	harness = HARNESS,
): ConsumptionDocument {
	return {
		schemaVersion: 1,
		periodId,
		start: "2026-10-01T00:00:00.000Z",
		holiday: false,
		harnesses: { [harness]: { sessions } },
	};
}

/** Every root this file created, removed after each case. */
const roots: string[] = [];

/** A fresh, isolated storage root with nothing in it. */
function freshRoot(): string {
	const root = mkdtempSync(path.join(tmpdir(), "model-cost-refresh-"));
	roots.push(root);
	return root;
}

/** The feedback one case's synchronization published, in the order it was published. */
interface CapturedNotice {
	readonly level: string;
	readonly message: string;
}

/** One bound instance, and what a case drives and reads it through. */
interface BoundInstance {
	readonly runtime: ModelCostRuntime;
	readonly double: PortDouble;
	/** The document this instance saves into. */
	readonly file: string;
	/** The notices this case's synchronizations published. */
	readonly notices: CapturedNotice[];
}

/**
 * One instance over one storage root: the production runtime, bound through the framework's own
 * binding, with the baseline loaded by the initialization the first model request waits on.
 */
async function bindInstance(
	root: string,
	baseline?: ConsumptionDocument,
	options: {
		readonly providerAccess?: ProviderAccess;
		readonly httpRequest?: (url: string, requestOptions?: HttpRequestOptions) => Promise<Response>;
		readonly now?: () => number;
	} = {},
): Promise<BoundInstance> {
	const file = path.join(root, CONSUMPTION_FILE);
	mkdirSync(root, { recursive: true });
	if (baseline !== undefined) writeFileSync(file, JSON.stringify(baseline), "utf8");
	const runtime = createModelCostRuntime({
		config: { storageDir: root },
		configDirectory: root,
		userHomeDirectory: root,
		harness: HARNESS,
		data: DATA,
		session: testSessionCapability(),
		// The provider side of this instance, only for the case that observes it: this file's subject is
		// the consumption baseline, so a case that does not state these drives no provider query at all.
		...(options.providerAccess === undefined ? {} : { providerAccess: options.providerAccess }),
		...(options.httpRequest === undefined ? {} : { httpRequest: options.httpRequest }),
		...(options.now === undefined ? {} : { now: options.now }),
	});
	const double = portDouble();
	double.bind(MODEL_COST, {
		factory: modelCostImplementation(() => runtime),
		// The declared configuration is read once per extension per process; this reader answers the
		// declaration so the binding validates without touching the repository's own file.
		config: { reader: () => `storageDir: ${root}\nbalanceTtlMs: 30000\ncodexQuotaTtlMs: 15000\n` },
	});
	double.deliverSession(OWNER, { session: MAIN });
	await double.initiateRun(OWNER);
	const notices: CapturedNotice[] = [];
	return { runtime, double, file, notices };
}

/** The transport a case's synchronization publishes its baseline faults through. */
function feedbackOf(bound: BoundInstance): { notify(level: string, message: string): void } {
	return {
		notify: (level, message) => {
			bound.notices.push({ level, message });
		},
	};
}

/** One request in an actual session, delivered as a Turn's start and its settled response. */
function deliverRequest(double: PortDouble, session: SessionFacts, at = OFF_PEAK): void {
	const started: TurnSignal = { kind: "request_started", session, at, provider: PROVIDER, model: MODEL };
	const settled: TurnSignal = { kind: "response_settled", session, at: at + 60_000, outcome: "completed", readings: [USAGE] };
	double.deliverTurn(started, { owner: OWNER });
	double.deliverTurn(settled, { owner: OWNER });
}

/** One Round edge of an actual session. */
function deliverRound(double: PortDouble, session: SessionFacts, event: "round_start" | "round_end"): RoundBoundary {
	return double.deliverRound(OWNER, { event: { kind: event }, session });
}

/** Lets the event loop turn over until nothing already queued is left. */
async function queuedWorkSettled(): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>();
	setImmediate(resolve);
	await promise;
}

/** The text of one root's consumption file right now. */
function fileText(file: string): string {
	return readFileSync(file, "utf8");
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("a read-only synchronization adopts another writer's committed records (P33)", () => {
	test("the saved records of another process appear, and this instance's in-flight consumption stays in memory", async () => {
		const root = freshRoot();
		const saved = record(MAIN.sessionId, null, 3, oneRequest(3));
		const bound = await bindInstance(root, document([saved]));

		// This instance accounts a request that has not reached its Round's end, so the snapshot carrying
		// it is in memory alone: the file still holds what the instance loaded.
		deliverRequest(bound.double, MAIN);
		expect(fileText(bound.file)).toBe(JSON.stringify(document([saved])));
		expect(bound.runtime.view.own(MAIN.sessionId)).toEqual(oneRequest(4));

		// Another process commits its own session into the same document — a record this instance has
		// never seen — and its completion notice is what asks this instance to read again.
		const other = record("session-other", MAIN.sessionId, 7, oneRequest(2));
		const published = document([saved, other]);
		writeFileSync(bound.file, JSON.stringify(published), "utf8");
		const publishedText = fileText(bound.file);

		expect(await bound.runtime.synchronize({ feedback: feedbackOf(bound) })).toEqual({
			kind: "adopted",
			periodChanged: false,
			changed: true,
		});

		// What the file held is adopted: the other process's record is readable through the instance's own
		// read-only result, with its identity and its consumption.
		expect(bound.runtime.view.own("session-other")).toEqual(other.own);
		expect(bound.runtime.view.identity("session-other")?.parentSessionId).toBe(MAIN.sessionId);
		expect(bound.runtime.storage.sessions(HARNESS).map(candidate => candidate.id)).toEqual([
			MAIN.sessionId,
			"session-other",
		]);

		// The detail form of the session on screen reads both, once each: the target's own accumulation is
		// this instance's live one (the saved three requests and the uncommitted fourth), and the tree
		// beside it adds the adopted record's own two — the adopted consumption is a descendant's own
		// contribution, not a second helping of this session's.
		const display = bound.runtime.presentation.of({
			sessionId: MAIN.sessionId,
			provider: PROVIDER,
			model: MODEL,
		});
		expect(display.current.costCny).toBeCloseTo(OFF_PEAK_AMOUNT * 4, 12);
		expect(display.current.tokens).toEqual({ input: 8, cacheRead: 16, cacheWrite: 20, output: 12 });
		expect(display.tree.costCny).toBeCloseTo(OFF_PEAK_AMOUNT * 6, 12);
		expect(display.tree.tokens).toEqual({ input: 12, cacheRead: 24, cacheWrite: 30, output: 18 });

		// Nothing was written by the synchronization: the file is the other process's own document byte for
		// byte, no lock or temporary file is left beside it, and the notice stated nothing.
		expect(fileText(bound.file)).toBe(publishedText);
		expect(bound.notices).toEqual([]);
		// The in-flight consumption is untouched by the adoption: it is still this instance's own reading,
		// and the file does not hold it, so the notice did not make an unsaved record appear anywhere.
		expect(bound.runtime.view.own(MAIN.sessionId)).toEqual(oneRequest(4));
		expect(JSON.parse(publishedText)).toEqual(published);
	});

	test("a second synchronization of the same document changes nothing and is not a redraw", async () => {
		const root = freshRoot();
		const bound = await bindInstance(root, document([record(MAIN.sessionId, null, 3, oneRequest(3))]));
		// The instance's own reads: what the read-only result holds is already the file's document, so a
		// synchronization has nothing to adopt and nothing to publish to its readers.
		let redraws = 0;
		const release = bound.runtime.view.subscribe(() => {
			redraws += 1;
		});
		expect(await bound.runtime.synchronize()).toEqual({ kind: "adopted", periodChanged: false, changed: false });
		expect(redraws).toBe(0);
		release();
	});

	test("a document that names another generation is taken as the period, and the closed one is not published into it", async () => {
		const root = freshRoot();
		const bound = await bindInstance(root, document([record(MAIN.sessionId, null, 1, oneRequest(1))]));
		// A request accounted in this period, and the Round it belongs to is open across what follows.
		deliverRequest(bound.double, MAIN);
		deliverRound(bound.double, MAIN, "round_start");

		// Another process resets the accounting period: the document it publishes is an empty activity in
		// a new generation, and this instance's accumulation belongs to the one that was closed.
		const reset: ConsumptionDocument = {
			schemaVersion: 1,
			periodId: "period-two",
			start: "2026-10-02T00:00:00.000Z",
			holiday: false,
			harnesses: {},
		};
		writeFileSync(bound.file, JSON.stringify(reset), "utf8");
		const resetText = fileText(bound.file);

		expect(await bound.runtime.synchronize({ feedback: feedbackOf(bound) })).toEqual({
			kind: "adopted",
			periodChanged: true,
			changed: true,
		});
		expect(bound.runtime.storage.period()?.periodId).toBe("period-two");
		// Everything measured in the closed period went with it, exactly as this instance's own reset
		// takes it: no accumulation, no boundary pair and no Session span survives into the new one.
		expect(bound.runtime.view.own(MAIN.sessionId)).toBeUndefined();
		expect(bound.runtime.view.roundTotals(MAIN.sessionId)).toBeUndefined();
		expect(bound.runtime.view.sessionSpan(MAIN.sessionId)).toBeUndefined();
		expect(bound.runtime.presentation.accrued()).toEqual({ totalCny: 0, sessionCostsCny: [] });

		// The Round's own end after the switch writes nothing at all: the consumption measured in the
		// closed period is not forced into the new one, and the new period's document is left as it is.
		deliverRound(bound.double, MAIN, "round_end");
		await queuedWorkSettled();
		expect(fileText(bound.file)).toBe(resetText);
	});
});

describe("a baseline a synchronization cannot use is reported and pauses this instance only (P34)", () => {
	test("a document that is not this extension's format pauses the instance, states it once, and is left alone", async () => {
		const root = freshRoot();
		// What the paused instance's provider side is observed through: the queries it really made, and the
		// clock its success TTL is read against.
		const queries: string[] = [];
		const clock = { now: 1_000_000 };
		const saved = record(MAIN.sessionId, null, 3, oneRequest(3));
		const bound = await bindInstance(root, document([saved]));
		// The file became something this extension cannot read: another writer's garbage, or a document
		// that is not this schema. Nothing may be guessed, repaired or overwritten.
		writeFileSync(bound.file, "{ this is not a document", "utf8");

		expect((await bound.runtime.synchronize({ feedback: feedbackOf(bound) })).kind).toBe("unusable");
		expect(bound.runtime.storage.pauseReason()).toBeDefined();
		expect(bound.runtime.storage.period()).toBeUndefined();
		expect(bound.notices).toHaveLength(1);
		expect(bound.notices[0]?.level).toBe("error");
		expect(bound.notices[0]?.message).toContain("暂停");
		expect(bound.notices[0]?.message).toContain(bound.file);
		expect(fileText(bound.file)).toBe("{ this is not a document");

		// A second synchronization is answered by the pause itself — the file is not read again, nothing
		// is repaired in the background and nothing more is stated.
		expect(await bound.runtime.synchronize({ feedback: feedbackOf(bound) })).toEqual({ kind: "paused" });
		expect(bound.notices).toHaveLength(1);
		// The instance holds nothing: no baseline, no accumulation presented as one.
		expect(bound.runtime.view.own(MAIN.sessionId)).toBeUndefined();

		// A provider reading elsewhere in the extension is not a consumption statistic: the pause does
		// not disable it, and a settled request of that provider still checks it — a real query on the
		// substituted transport, which is the one operation this file can count without a credential.
		const paused = await bindInstance(
			freshRoot(),
			document([saved]),
			{
				providerAccess: {
					resolve: async provider => (provider === "deepseek" ? { baseUrl: "https://host.example/v1", credential: "key-one" } : undefined),
				},
				httpRequest: async url => {
					queries.push(url);
					return balanceAnswer("120.00");
				},
				now: () => clock.now,
			},
		);
		// The prefetch asked once at initialization, before anything was paused.
		expect(queries).toHaveLength(1);
		writeFileSync(paused.file, "{ this is not a document", "utf8");
		expect((await paused.runtime.synchronize({ feedback: feedbackOf(paused) })).kind).toBe("unusable");
		expect(paused.runtime.storage.pauseReason()).toBeDefined();

		// The TTL of that reading has run out by now, and a request of the tracked provider settles:
		// the usage-driven check still asks the provider, whatever this instance's consumption baseline
		// is, and the reading is accepted as any other.
		clock.now += 31_000;
		paused.double.deliverTurn(
			{ kind: "request_started", session: TRACKED, at: OFF_PEAK, provider: "deepseek", model: "deepseek-chat" },
			{ owner: OWNER },
		);
		paused.double.deliverTurn(
			{ kind: "response_settled", session: TRACKED, at: OFF_PEAK + 1_000, outcome: "completed", readings: [USAGE] },
			{ owner: OWNER },
		);
		await until(() => queries.length === 2, "the paused instance's balance query to reach the transport");
		// The address is the specification's own rule: the resolved base without its trailing `/v1`, plus
		// the protocol's balance path.
		expect(queries[1]).toBe("https://host.example/user/balance");
		expect(paused.runtime.presentation.balance().reading?.total).toBe(120);
		expect(paused.runtime.storage.pauseReason()).toBeDefined();
	});

	test("a file that cannot be read is reported with the baseline it already holds standing", async () => {
		const root = freshRoot();
		const saved = record(MAIN.sessionId, null, 3, oneRequest(3));
		const bound = await bindInstance(root, document([saved]));
		// The target became something no document can be read from: a directory in its place.
		rmSync(bound.file, { force: true });
		mkdirSync(bound.file);

		const outcome = await bound.runtime.synchronize({ feedback: feedbackOf(bound) });
		expect(outcome.kind).toBe("unreadable");
		expect(bound.notices).toHaveLength(1);
		expect(bound.notices[0]?.level).toBe("error");
		expect(bound.notices[0]?.message).toContain(bound.file);
		// Nothing was paused and nothing was destroyed: the instance keeps the document it last read and
		// goes on accounting against it.
		expect(bound.runtime.storage.pauseReason()).toBeUndefined();
		expect(bound.runtime.storage.sessions(HARNESS)).toEqual([saved]);
		expect(bound.runtime.view.own(MAIN.sessionId)).toEqual(saved.own);

		// Once the target is a document again the next synchronization adopts it, and the Round's own
		// commit then lands on top of what that document holds.
		rmSync(bound.file, { recursive: true, force: true });
		const next = document([{ ...saved, saveVersion: 4, own: oneRequest(4) }]);
		writeFileSync(bound.file, JSON.stringify(next), "utf8");
		expect(await bound.runtime.synchronize({ feedback: feedbackOf(bound) })).toEqual({
			kind: "adopted",
			periodChanged: false,
			changed: true,
		});
		expect(bound.notices).toHaveLength(1);

		// That read succeeded, so the fault is no longer this file's state: the target becoming unreadable
		// again is a new fact about it and is stated again rather than swallowed as a repeat.
		rmSync(bound.file, { recursive: true, force: true });
		mkdirSync(bound.file);
		expect((await bound.runtime.synchronize({ feedback: feedbackOf(bound) })).kind).toBe("unreadable");
		expect(bound.notices).toHaveLength(2);
	});

	test("after this instance's own cleanup a synchronization reads nothing and adopts nothing", async () => {
		const root = freshRoot();
		const bound = await bindInstance(root, document([record(MAIN.sessionId, null, 3, oneRequest(3))]));
		// The session this instance serves ends: the framework disposes the implementation, and the
		// binding's own cleanup runs. A late completion notice is not a reason to touch the file again.
		bound.double.deliverSession(OWNER, { event: { kind: "session_end", reason: "disposed" } });
		// The target is a directory, which a read would have had to report as unreadable: the answer says
		// the instance did not read at all rather than that the file could not be read.
		rmSync(bound.file, { force: true });
		mkdirSync(bound.file);
		expect(await bound.runtime.synchronize({ feedback: feedbackOf(bound) })).toEqual({ kind: "closed" });
		expect(bound.notices).toEqual([]);
	});
});
