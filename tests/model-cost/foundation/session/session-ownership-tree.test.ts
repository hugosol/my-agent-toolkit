/**
 * Session ownership, the parent tree and session names at the extension's display seam
 * (P12, P13, P24; S2).
 *
 * The seam under test is production throughout: the extension's real definition is bound through
 * the framework's public binding (the port double, `tests/framework/support/harness-port-double.ts`),
 * the runtime is the one `createModelCostRuntime` builds, and every public Turn, Round and
 * session-facts delivery below is applied exactly as a harness adapter would apply it. What the
 * cases read is what a frontend reads — `runtime.view`, the read-only results, and the consumption
 * document a Round's own save publishes — never a private field.
 *
 * Every delivery below names the *actual* session it is about while its owner is the one main
 * session, which is how a real harness reports a subagent's work: a subagent's delivery resolves to
 * the owner it inherits, and the accounting has to attribute it to the session that issued the
 * request. The price data is self-made (one provider, two monetary models of different tiers, one
 * token-only id, off-peak = `input·2 + cacheRead·0.5 + output·8` per million tokens for the first
 * tier and `input·10 + cacheRead·1 + output·20` for the second), and every expected bucket and amount
 * below is written here by hand from those numbers rather than recomputed from the implementation.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { MODEL_COST } from "../../../../extensions/model-cost/definition";
import type { ConsumptionDocument, SessionRecord } from "../../../../extensions/model-cost/shared-logic/foundation/session/consumption-document";
import type { ModelPricingData } from "../../../../extensions/model-cost/shared-logic/business/pricing/model-data";
import { type ModelCostRuntime, createModelCostRuntime } from "../../../../extensions/model-cost/shared-logic/runtime";
import type { SessionFacts, TurnUsage } from "../../../../framework/interface/session";
import type { OwnerReference } from "../../../../framework/interface/state";
import type { TurnSignal } from "../../../../framework/runtime/port";
import { type PortDouble, portDouble } from "../../../framework/support/harness-port-double";
import { testSessionCapability } from "../../support/session-capability";

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Wednesday 2026-10-14 13:00 in the data's zone: outside both windows, so off-peak. */
const OFF_PEAK_START = Date.UTC(2026, 9, 14, 13) - BEIJING_OFFSET_MS;

/** The self-made pricing data every case drives. */
const DATA: ModelPricingData = {
	currency: "XTS",
	unit: "XTS per million tokens",
	peakMultiplier: 2,
	zoneOffsetMinutes: 8 * 60,
	peakWindows: [
		{ fromMinute: 9 * 60, toMinute: 12 * 60 },
		{ fromMinute: 14 * 60, toMinute: 18 * 60 },
	],
	tiers: {
		alpha: { input: 2, cacheRead: 0.5, output: 8 },
		beta: { input: 10, cacheRead: 1, output: 20 },
	},
	allowanceProviders: [],
	models: {
		official: {
			"model-alpha": { mode: "monetary", tier: "alpha" },
			"model-beta": { mode: "monetary", tier: "beta" },
		},
		"go-provider": { "model-alpha": { mode: "token-only" } },
	},
};

const HARNESS = "tree-harness";
const CONSUMPTION_FILE = "consumption.json";

/**
 * The owner every delivery below resolves to: one main session's owner key. A subagent's own
 * delivery resolves to the owner it inherits, so the accounting group observes it under a session
 * that is not the owner — and must still attribute it to the session that issued the request.
 */
/** The owner key of the main session every delivery in this file resolves to. */
const OWNER_KEY = "main:tree";

/** The reference the main session's own deliveries resolve to: it owns itself. */
const OWNER: OwnerReference = { kind: "owner", key: OWNER_KEY };

/**
 * The owner one delivery from an actual session resolves to: a main session owns itself, and a
 * subagent resolves to the owner it inherits — the same top-level line, under an `inherited`
 * reference. That is how a real harness reports a subagent's work, so attributing consumption by
 * this reference rather than by the session's own identity is exactly what the cases rule out.
 */
function ownerOf(session: SessionFacts): OwnerReference {
	return session.kind === "main" ? OWNER : { kind: "inherited", key: OWNER_KEY };
}

const MAIN_ID = "tree-main";
const CHILD_A_ID = "tree-child-a";
const CHILD_B_ID = "tree-child-b";
const GRANDCHILD_ID = "tree-grandchild";
const OTHER_MAIN_ID = "tree-other-main";

const MAIN: SessionFacts = { sessionId: MAIN_ID, kind: "main", name: "主会话", unavailable: [] };
const CHILD_A: SessionFacts = {
	sessionId: CHILD_A_ID,
	kind: "sub",
	parentSessionId: MAIN_ID,
	name: "子代理A",
	unavailable: [],
};
const CHILD_B: SessionFacts = {
	sessionId: CHILD_B_ID,
	kind: "sub",
	parentSessionId: MAIN_ID,
	name: "子代理B",
	unavailable: [],
};
const GRANDCHILD: SessionFacts = {
	sessionId: GRANDCHILD_ID,
	kind: "sub",
	parentSessionId: CHILD_A_ID,
	name: "孙代理",
	unavailable: [],
};
const OTHER_MAIN: SessionFacts = { sessionId: OTHER_MAIN_ID, kind: "main", name: "另一个主会话", unavailable: [] };
/** The same child as the host reports it after a rename: the identity is untouched, the name is not. */
const RENAMED_CHILD_A: SessionFacts = { ...CHILD_A, name: "子代理A-改名" };
/** A child whose name this host could not report, as its deliveries name the fact as missing. */
const UNNAMED_CHILD_B: SessionFacts = {
	sessionId: CHILD_B_ID,
	kind: "sub",
	parentSessionId: MAIN_ID,
	unavailable: ["session name"],
};
/** The same fact for the first child: a delivery that cannot report a name for a known session. */
const UNNAMED_CHILD_A: SessionFacts = { ...UNNAMED_CHILD_B, sessionId: CHILD_A_ID };

/** The two requests the cases drive, and what each costs at the data's own off-peak prices. */
const ALPHA_USAGE: TurnUsage = { input: 2, cacheRead: 4, cacheWrite: 5, output: 3, totalTokens: 9 };
const BETA_USAGE: TurnUsage = { input: 1, cacheRead: 2, cacheWrite: 0, output: 2, totalTokens: 3 };
/** `(2·2 + 4·0.5 + 3·8) / 1e6`, by hand from the data's first tier. */
const ALPHA_AMOUNT = 0.00003;
/** `(1·10 + 2·1 + 2·20) / 1e6`, by hand from the data's second tier. */
const BETA_AMOUNT = 0.000052;

/** One Turn signal pair's facts, as an adapter maps them. */
function startedAt(session: SessionFacts, provider: string, model: string, at: number = OFF_PEAK_START): TurnSignal {
	return { kind: "request_started", session, at, provider, model };
}

function settled(session: SessionFacts, usage: TurnUsage, at: number = OFF_PEAK_START): TurnSignal {
	return { kind: "response_settled", session, at: at + 60_000, outcome: "completed", readings: [usage] };
}

/** One whole request in one actual session: the Turn's start facts, then its settled response. */
function request(double: PortDouble, session: SessionFacts, provider: string, model: string, usage: TurnUsage): void {
	double.deliverTurn(startedAt(session, provider, model), { owner: ownerOf(session) });
	double.deliverTurn(settled(session, usage), { owner: ownerOf(session) });
}

/** Every root this file created, removed after each case. */
const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** One bound accounting instance over a fresh isolated root, and what a case drives and reads it through. */
interface BoundAccounting {
	readonly runtime: ModelCostRuntime;
	readonly double: PortDouble;
	readonly file: string;
}

async function bindAccounting(options: { readonly baseline?: unknown } = {}): Promise<BoundAccounting> {
	const root = mkdtempSync(path.join(tmpdir(), "model-cost-ownership-tree-"));
	roots.push(root);
	const file = path.join(root, CONSUMPTION_FILE);
	if (options.baseline !== undefined) writeFileSync(file, JSON.stringify(options.baseline), "utf8");
	const runtime = createModelCostRuntime({
		config: { storageDir: root },
		configDirectory: root,
		userHomeDirectory: root,
		harness: HARNESS,
		data: DATA,
		// This file's own clock states one instant, because nothing it asserts is an elapsed time: a
		// subagent session's Round is one of its activities, so the interval between that Round's edges
		// is zero here and the figure this instance measured is the known zero it states.
		now: () => OFF_PEAK_START,
		session: testSessionCapability(),
	});
	const double = portDouble();
	double.bind(MODEL_COST, {
		factory: () => runtime.implementation,
		// The declared configuration is read once per extension per process; this reader answers the
		// declaration so the binding validates without touching the repository's own file.
		config: { reader: () => `storageDir: ${root}\nbalanceTtlMs: 30000\ncodexQuotaTtlMs: 15000\n` },
	});
	// The framework's own behavioral position at a session boundary: the session node is what starts
	// the implementation's one-time initialization, and a model request only waits for it.
	double.deliverSession(ownerOf(MAIN), { session: MAIN });
	// The framework's awaitable position before a model request: the initialization — and the
	// baseline read it performs — has settled when this returns.
	await double.initiateRun(OWNER);
	return { runtime, double, file };
}

/**
 * Waits until the consumption document holds what a case expects of it, and reads it back.
 *
 * A Round's end is dispatched the way the framework dispatches a semantic handler — without waiting
 * for the promise it returns — so the save it drives lands a few event-loop turns later. The wait is
 * on the expected content itself rather than on a duration, and the deadline only keeps a save that
 * never happened from hanging the case.
 */
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
		await queuedWorkSettled();
	}
}

/** One session's record inside a document, or `undefined` when the document holds none. */
function recordOf(document: ConsumptionDocument, id: string): SessionRecord | undefined {
	return document.harnesses[HARNESS]?.sessions.find(record => record.id === id);
}

/**
 * One model's contribution as a case wrote it: the four buckets exactly as delivered and the amount
 * they cost at the data's own price, compared at the precision a sum of such amounts holds.
 */
function consumed(usage: TurnUsage, costCny: number) {
	return {
		tokens: {
			input: usage.input,
			cacheRead: usage.cacheRead,
			cacheWrite: usage.cacheWrite,
			output: usage.output,
		},
		costCny: expect.closeTo(costCny, 12),
	};
}

/** Lets the event loop turn over until nothing already queued is left, so a save that was going to happen has. */
async function queuedWorkSettled(): Promise<void> {
	for (let turn = 0; turn < 8; turn += 1) {
		const { promise, resolve } = Promise.withResolvers<void>();
		setImmediate(resolve);
		await promise;
	}
}

describe("a session's latest name is display data that never changes its identity (P24)", () => {
	test("an unviewed child renamed after its first request shows the new name at once and only saves it later", async () => {
		const { runtime, double, file } = await bindAccounting();
		// The child's own request, delivered under the main session's owner as a real harness does.
		request(double, CHILD_A, "official", "model-beta", BETA_USAGE);
		expect(runtime.view.identity(CHILD_A_ID)).toEqual({ sessionId: CHILD_A_ID, name: "子代理A", parentSessionId: MAIN_ID });

		// The host reports the rename as it happens — a facts delivery, made when the session's
		// name changed rather than at its next turn or boundary. Nothing is being viewed here: the
		// view is read per session, and the name the display would read is the new one immediately,
		// without a save and without the session becoming a second identity.
		const announced: number[] = [];
		runtime.view.subscribe(() => announced.push(1));
		expect(runtime.view.identity(CHILD_A_ID)?.name).toBe("子代理A");
		double.deliverSession(ownerOf(RENAMED_CHILD_A), {
			event: { kind: "session_facts" },
			session: RENAMED_CHILD_A,
		});
		expect(runtime.view.identity(CHILD_A_ID)).toEqual({
			sessionId: CHILD_A_ID,
			name: "子代理A-改名",
			parentSessionId: MAIN_ID,
		});
		// The rename is a display change the subscriber is told about, and it consumed nothing.
		expect(announced.length).toBe(1);
		expect(runtime.view.own(CHILD_A_ID)).toEqual({
			official: { "model-beta": { tokens: { input: 1, cacheRead: 2, cacheWrite: 0, output: 2 }, costCny: BETA_AMOUNT } },
		});

		// A rename writes no file of its own: the next normal save is what carries it.
		await queuedWorkSettled();
		expect(existsSync(file)).toBe(false);

		// The child's own Round, as the host reports it now — its edges carry the current name like
		// every other delivery does.
		double.deliverRound(ownerOf(RENAMED_CHILD_A), { event: { kind: "round_start" }, session: RENAMED_CHILD_A });
		double.deliverRound(ownerOf(RENAMED_CHILD_A), { event: { kind: "round_end" }, session: RENAMED_CHILD_A });
		const document = await savedDocument(file, candidate => recordOf(candidate, CHILD_A_ID) !== undefined);
		// One record for that identity, carrying the latest name, its real direct parent, the
		// consumption it had already accounted and the runtime that Round's own interval is — the rename
		// neither forked the session nor re-priced it.
		expect(recordOf(document, CHILD_A_ID)).toEqual({
			id: CHILD_A_ID,
			name: "子代理A-改名",
			parent: MAIN_ID,
			saveVersion: 1,
			own: {
				official: { "model-beta": { tokens: { input: 1, cacheRead: 2, cacheWrite: 0, output: 2 }, costCny: BETA_AMOUNT } },
			},
			runtimeMs: 0,
		});
	});
});

describe("a name this host cannot report is neither guessed nor written over (P24)", () => {
	test("an unreportable name keeps the known one, and a session never named shows its identity", async () => {
		const baseline: ConsumptionDocument = {
			schemaVersion: 1,
			periodId: "period-one",
			start: "2026-10-01T00:00:00.000Z",
			holiday: false,
			harnesses: {
				[HARNESS]: {
					sessions: [
						{
							id: CHILD_A_ID,
							name: "上次保存的名称",
							parent: MAIN_ID,
							saveVersion: 4,
							own: { official: { "model-beta": { tokens: { input: 1, cacheRead: 0, cacheWrite: 0, output: 0 } } } },
						},
					],
				},
			},
		};
		const { runtime, double, file } = await bindAccounting({ baseline });
		// What the instance loaded is what it holds: the record's own name and direct parent.
		expect(runtime.view.identity(CHILD_A_ID)).toEqual({
			sessionId: CHILD_A_ID,
			name: "上次保存的名称",
			parentSessionId: MAIN_ID,
		});

		// A delivery whose session facts name no name at all — the host could not obtain it — is not a
		// rename: the known name survives, and the session id is not substituted for it.
		double.deliverTurn(startedAt(UNNAMED_CHILD_A, "official", "model-beta"), { owner: ownerOf(UNNAMED_CHILD_A) });
		double.deliverTurn(settled(UNNAMED_CHILD_A, BETA_USAGE), { owner: ownerOf(UNNAMED_CHILD_A) });
		expect(runtime.view.identity(CHILD_A_ID)).toEqual({
			sessionId: CHILD_A_ID,
			name: "上次保存的名称",
			parentSessionId: MAIN_ID,
		});

		// A session this instance has only ever heard of without a name is shown by its identity: a
		// distinguishable session id, not another session's name and not a guess.
		double.deliverTurn(startedAt(UNNAMED_CHILD_B, "go-provider", "model-alpha"), { owner: ownerOf(UNNAMED_CHILD_B) });
		expect(runtime.view.identity(CHILD_B_ID)).toEqual({
			sessionId: CHILD_B_ID,
			name: CHILD_B_ID,
			parentSessionId: MAIN_ID,
		});

		double.deliverRound(ownerOf(UNNAMED_CHILD_A), { event: { kind: "round_start" }, session: UNNAMED_CHILD_A });
		double.deliverRound(ownerOf(UNNAMED_CHILD_A), { event: { kind: "round_end" }, session: UNNAMED_CHILD_A });
		const document = await savedDocument(file, candidate => recordOf(candidate, CHILD_A_ID)?.saveVersion === 5);
		// The save carries the known name, not a guess: the unnamed deliveries changed display nothing.
		expect(recordOf(document, CHILD_A_ID)?.name).toBe("上次保存的名称");
		// And a session that only ever appeared without a name is not invented into a record of its
		// own: it consumed nothing and its Round never ended, so there is nothing to commit for it.
		expect(recordOf(document, CHILD_B_ID)).toBeUndefined();
		// A session nothing has been delivered about is a session this instance knows nothing about.
		expect(runtime.view.identity(MAIN_ID)).toBeUndefined();
	});
});

describe("the parent tree's inclusive totals count every session's own contribution once (P13)", () => {
	test("a nested heterogeneous tree is the sum of its members' own requests and nothing outside it", async () => {
		const { runtime, double } = await bindAccounting();

		// The descendants first, so the tree is aggregated from children that were never saved and
		// whose parent had not consumed anything yet: the parent's own record is not a prerequisite.
		request(double, CHILD_A, "official", "model-beta", BETA_USAGE);
		request(double, GRANDCHILD, "official", "model-beta", BETA_USAGE);
		request(double, CHILD_B, "go-provider", "model-alpha", ALPHA_USAGE);
		request(double, MAIN, "official", "model-alpha", ALPHA_USAGE);
		// A second main session: its own tree, whose consumption must not enter the first one's.
		request(double, OTHER_MAIN, "official", "model-alpha", ALPHA_USAGE);

		// The root's inclusive total: the main session's own request, both children's and the
		// grandchild's, each once — the two monetary models in their own currencies' amounts, and the
		// token-only contributor's buckets without an amount.
		expect(runtime.view.inclusiveTotals(MAIN_ID)).toEqual({
			official: {
				"model-alpha": consumed(ALPHA_USAGE, ALPHA_AMOUNT),
				"model-beta": {
					tokens: {
						input: BETA_USAGE.input * 2,
						cacheRead: BETA_USAGE.cacheRead * 2,
						cacheWrite: BETA_USAGE.cacheWrite * 2,
						output: BETA_USAGE.output * 2,
					},
					costCny: expect.closeTo(BETA_AMOUNT * 2, 12),
				},
			},
			"go-provider": { "model-alpha": { tokens: { input: 2, cacheRead: 4, cacheWrite: 5, output: 3 } } },
		});
		// A subtree is that session and its own descendants: the child's total holds the grandchild and
		// the sibling's request is not part of it.
		expect(runtime.view.inclusiveTotals(CHILD_A_ID)).toEqual({
			official: {
				"model-beta": {
					tokens: { input: 2, cacheRead: 4, cacheWrite: 0, output: 4 },
					costCny: expect.closeTo(BETA_AMOUNT * 2, 12),
				},
			},
		});
		expect(runtime.view.inclusiveTotals(GRANDCHILD_ID)).toEqual({
			official: { "model-beta": consumed(BETA_USAGE, BETA_AMOUNT) },
		});
		expect(runtime.view.inclusiveTotals(CHILD_B_ID)).toEqual({
			"go-provider": { "model-alpha": { tokens: { input: 2, cacheRead: 4, cacheWrite: 5, output: 3 } } },
		});
		// A main session with no relations of its own is exactly its own consumption, and the
		// aggregation leaves every session's own accumulation itself untouched.
		expect(runtime.view.inclusiveTotals(OTHER_MAIN_ID)).toEqual({
			official: { "model-alpha": consumed(ALPHA_USAGE, ALPHA_AMOUNT) },
		});
		expect(runtime.view.own(MAIN_ID)).toEqual({ official: { "model-alpha": consumed(ALPHA_USAGE, ALPHA_AMOUNT) } });
		expect(runtime.view.own(CHILD_A_ID)).toEqual({ official: { "model-beta": consumed(BETA_USAGE, BETA_AMOUNT) } });
	});

	test("a restored tree aggregates the records' own contributions, including a reference estimate", async () => {
		const baseline: ConsumptionDocument = {
			schemaVersion: 1,
			periodId: "period-one",
			start: "2026-10-01T00:00:00.000Z",
			holiday: false,
			harnesses: {
				[HARNESS]: {
					sessions: [
						{
							id: MAIN_ID,
							name: "主会话",
							parent: null,
							saveVersion: 2,
							own: {
								official: {
									"model-alpha": { tokens: { input: 100, cacheRead: 0, cacheWrite: 0, output: 10 }, costCny: 1.25 },
								},
							},
						},
						{
							id: CHILD_A_ID,
							name: "子代理A",
							parent: MAIN_ID,
							saveVersion: 1,
							own: {
								official: {
									"model-alpha": {
										tokens: { input: 3, cacheRead: 0, cacheWrite: 0, output: 1 },
										costCny: 0.5,
										referenceCostUsd: 0.25,
									},
								},
							},
						},
						{
							id: GRANDCHILD_ID,
							name: "孙代理",
							parent: CHILD_A_ID,
							saveVersion: 1,
							own: { "go-provider": { "model-alpha": { tokens: { input: 7, cacheRead: 0, cacheWrite: 0, output: 2 } } } },
						},
						{
							id: OTHER_MAIN_ID,
							name: "另一个主会话",
							parent: null,
							saveVersion: 1,
							own: {
								official: {
									"model-beta": { tokens: { input: 5, cacheRead: 0, cacheWrite: 0, output: 5 }, costCny: 9 },
								},
							},
						},
					],
				},
			},
		};
		const { runtime } = await bindAccounting({ baseline });

		// The root's tree is the three related records' own values added up: the tokens of each, the
		// monetary amounts of the two that carry one, and the reference estimate — which no other
		// record contributes to, so it stays the one estimate that exists rather than becoming a zero.
		expect(runtime.view.inclusiveTotals(MAIN_ID)).toEqual({
			official: {
				"model-alpha": {
					tokens: { input: 103, cacheRead: 0, cacheWrite: 0, output: 11 },
					costCny: expect.closeTo(1.75, 12),
					referenceCostUsd: expect.closeTo(0.25, 12),
				},
			},
			"go-provider": { "model-alpha": { tokens: { input: 7, cacheRead: 0, cacheWrite: 0, output: 2 } } },
		});
		// The child's subtree holds the grandchild as well, and the unrelated main session is its own
		// tree whose values are nowhere in the root's.
		expect(runtime.view.inclusiveTotals(CHILD_A_ID)).toEqual({
			official: {
				"model-alpha": {
					tokens: { input: 3, cacheRead: 0, cacheWrite: 0, output: 1 },
					costCny: expect.closeTo(0.5, 12),
					referenceCostUsd: expect.closeTo(0.25, 12),
				},
			},
			"go-provider": { "model-alpha": { tokens: { input: 7, cacheRead: 0, cacheWrite: 0, output: 2 } } },
		});
		expect(runtime.view.inclusiveTotals(OTHER_MAIN_ID)).toEqual({
			official: { "model-beta": { tokens: { input: 5, cacheRead: 0, cacheWrite: 0, output: 5 }, costCny: 9 } },
		});
		// A session this instance holds no fact about at all has nothing to aggregate.
		expect(runtime.view.inclusiveTotals("tree-unknown")).toEqual({});
	});
});

describe("a request's consumption belongs to the session that issued it (P12)", () => {
	test("subagent requests delivered under the main session's owner land in the subagents' own buckets", async () => {
		const { runtime, double, file } = await bindAccounting();

		// One request per actual session, every delivery resolving to the same main owner — which is
		// what a real harness reports for a subagent, and precisely what attribution may not follow.
		request(double, MAIN, "official", "model-alpha", ALPHA_USAGE);
		request(double, CHILD_A, "go-provider", "model-alpha", ALPHA_USAGE);
		request(double, GRANDCHILD, "official", "model-beta", BETA_USAGE);

		expect(runtime.view.own(MAIN_ID)).toEqual({ official: { "model-alpha": consumed(ALPHA_USAGE, ALPHA_AMOUNT) } });
		// The child's token-only request is its own bucket, with buckets and no amount, and it is not
		// folded into the main session that owns it.
		expect(runtime.view.own(CHILD_A_ID)).toEqual({
			"go-provider": { "model-alpha": { tokens: { input: 2, cacheRead: 4, cacheWrite: 5, output: 3 } } },
		});
		expect(runtime.view.own(GRANDCHILD_ID)).toEqual({ official: { "model-beta": consumed(BETA_USAGE, BETA_AMOUNT) } });
		// Neither descendant's model ever appears in a bucket that is not its own, and a session that
		// issued no request of its own has no bucket at all.
		expect(runtime.view.own(MAIN_ID)?.official?.["model-beta"]).toBeUndefined();
		expect(runtime.view.own(CHILD_A_ID)?.official).toBeUndefined();
		expect(runtime.view.own(OTHER_MAIN_ID)).toBeUndefined();

		// The main session's own record is what its Round saves: its own request and no descendant's,
		// whatever ran under the owner line it shares with them.
		double.deliverRound(ownerOf(MAIN), { event: { kind: "round_start" }, session: MAIN });
		double.deliverRound(ownerOf(MAIN), { event: { kind: "round_end" }, session: MAIN });
		const document = await savedDocument(file, candidate => recordOf(candidate, MAIN_ID) !== undefined);
		expect(recordOf(document, MAIN_ID)).toEqual({
			id: MAIN_ID,
			name: "主会话",
			parent: null,
			saveVersion: 1,
			own: { official: { "model-alpha": consumed(ALPHA_USAGE, ALPHA_AMOUNT) } },
		});
		// No descendant's record is written by the parent's save: a session's own work is saved when
		// that session's own Round ends, and no report of it stands in for one.
		expect(document.harnesses[HARNESS]?.sessions.map(record => record.id)).toEqual([MAIN_ID]);
	});

	test("a request stays in the session that issued it while the display reads another one", async () => {
		const { runtime, double } = await bindAccounting();

		// Two requests in flight at once, in two actual sessions, and a display that reads a third
		// session in between: what a frontend happens to be looking at decides nothing about where
		// either response is accounted.
		double.deliverTurn(startedAt(CHILD_A, "official", "model-beta"), { owner: ownerOf(CHILD_A) });
		double.deliverTurn(startedAt(MAIN, "official", "model-alpha"), { owner: ownerOf(MAIN) });
		expect(runtime.view.own(CHILD_A_ID)).toBeUndefined();
		expect(runtime.view.identity(OTHER_MAIN_ID)).toBeUndefined();
		expect(runtime.view.inclusiveTotals(OTHER_MAIN_ID)).toEqual({});

		double.deliverTurn(settled(CHILD_A, BETA_USAGE), { owner: ownerOf(CHILD_A) });
		double.deliverTurn(settled(MAIN, ALPHA_USAGE), { owner: ownerOf(MAIN) });

		// Each response entered the session whose request it settled, with no trace of the other's.
		expect(runtime.view.own(CHILD_A_ID)).toEqual({ official: { "model-beta": consumed(BETA_USAGE, BETA_AMOUNT) } });
		expect(runtime.view.own(MAIN_ID)).toEqual({ official: { "model-alpha": consumed(ALPHA_USAGE, ALPHA_AMOUNT) } });
	});

	test("a session boundary and a Round edge are not requests: only a real response adds consumption", async () => {
		const { runtime, double, file } = await bindAccounting();

		// A child session appearing and going away, and Round edges for both sessions: the facts a
		// subagent's delegated work produces besides its own requests. None of them is a request, so
		// none of them is a second entry for that work.
		double.deliverSession(ownerOf(CHILD_A), { session: CHILD_A, event: { kind: "session_start", reason: "new" } });
		double.deliverRound(ownerOf(MAIN), { event: { kind: "round_start" }, session: MAIN });
		double.deliverRound(ownerOf(CHILD_A), { event: { kind: "round_start" }, session: CHILD_A });
		double.deliverRound(ownerOf(CHILD_A), { event: { kind: "round_end" }, session: CHILD_A });
		double.deliverRound(ownerOf(MAIN), { event: { kind: "round_end" }, session: MAIN });
		double.deliverSession(ownerOf(CHILD_A), { session: CHILD_A, event: { kind: "session_end", reason: "disposed" } });

		expect(runtime.view.own(MAIN_ID)).toBeUndefined();
		// The child's own Round is one activity of its own — that is what makes this instance account for
		// the session at all — and its consumption is the empty accumulation a Round edge adds: no
		// request was settled, so there is nothing to add to it.
		expect(runtime.view.own(CHILD_A_ID)).toEqual({});
		expect(runtime.view.inclusiveTotals(MAIN_ID)).toEqual({});
		// The record that child's own Round end publishes carries that empty consumption and the
		// activity's own runtime, and nothing else.
		const rounds = await savedDocument(file, candidate => recordOf(candidate, CHILD_A_ID) !== undefined);
		expect(recordOf(rounds, CHILD_A_ID)?.own).toEqual({});
		expect(recordOf(rounds, CHILD_A_ID)?.runtimeMs).toBe(0);

		// The child's own request is what does add consumption, exactly once.
		double.deliverTurn(startedAt(CHILD_A, "official", "model-beta"), { owner: ownerOf(CHILD_A) });
		double.deliverTurn(settled(CHILD_A, BETA_USAGE), { owner: ownerOf(CHILD_A) });
		expect(runtime.view.own(CHILD_A_ID)).toEqual({ official: { "model-beta": consumed(BETA_USAGE, BETA_AMOUNT) } });
		expect(runtime.view.inclusiveTotals(MAIN_ID)).toEqual({
			official: { "model-beta": consumed(BETA_USAGE, BETA_AMOUNT) },
		});
	});
});
