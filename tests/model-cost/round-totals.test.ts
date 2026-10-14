/**
 * Round totals at the extension's display seam (P14, P15; S2).
 *
 * The seam under test is production throughout: the extension's real definition is bound through
 * the framework's public binding (the port double), the runtime is the one `createModelCostRuntime`
 * builds, and every public Round and Turn delivery below is applied exactly as a harness adapter
 * would apply it. What the cases read is what a frontend reads — `runtime.view`: the session's own
 * accumulation and the Round totals derived from it.
 *
 * What a Round is here is the framework's definition, not this suite's: the boundaries are the
 * edges the framework dispatched, and what a Round total is — the session's *own* accumulation
 * between the snapshot its Round began from and the one it ended with — is the approved rule. No
 * amount below is recomputed from the code under test: the data is self-made (one provider, one
 * monetary model, off-peak = `input·3 + cacheRead·0.5 + output·6` per million tokens) and every
 * expected amount is written here by hand from those numbers.
 *
 * Every case drives its own actual session, so a Round boundary in one case is never the other's,
 * and the ones that are about a session's own consumption never involve a second session at all.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { MODEL_COST } from "../../extensions/model-cost/definition";
import type { ConsumptionDocument } from "../../extensions/model-cost/shared-logic/consumption-document";
import type { ModelPricingData } from "../../extensions/model-cost/shared-logic/model-data";
import { type ModelCostRuntime, createModelCostRuntime } from "../../extensions/model-cost/shared-logic/runtime";
import type { OwnerReference, SessionFacts, TurnSignal, TurnUsage } from "../../framework/core/protocol";
import { type PortDouble, portDouble } from "../framework/support/harness-port-double";

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Wednesday 2026-10-14 13:00 in the data's zone: outside both of its windows, so off-peak. */
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
	tiers: { standard: { input: 3, cacheRead: 0.5, output: 6 } },
	allowanceProviders: [],
	models: { probe: { "probe-model": { mode: "monetary", tier: "standard" } } },
};

const HARNESS = "round-harness";
const PROVIDER = "probe";
const MODEL = "probe-model";
const OWNER: OwnerReference = { kind: "owner", key: "main:round-totals" };
const MAIN: SessionFacts = { sessionId: "round-main", kind: "main", name: "主会话", unavailable: [] };
const CHILD: SessionFacts = { sessionId: "round-child", kind: "sub", name: "子代理", unavailable: [] };

/**
 * Two requests' usage, and what each costs at the data's off-peak price: the first is
 * (2·3 + 4·0.5 + 3·6) per million tokens, the second (10·3 + 1·6) per million tokens. Both are
 * written as the hand-derived numbers they are, never as a sum the implementation produced.
 */
const FIRST_USAGE: TurnUsage = { input: 2, cacheRead: 4, cacheWrite: 5, output: 3, totalTokens: 9 };
const SECOND_USAGE: TurnUsage = { input: 10, cacheRead: 0, cacheWrite: 0, output: 1, totalTokens: 11 };
const FIRST_AMOUNT = 0.000026;
const SECOND_AMOUNT = 0.000036;

/** One Turn's facts, as an adapter maps them: a request starting and its response settling a minute later. */
function startedAt(session: SessionFacts, at: number): TurnSignal {
	return { kind: "request_started", session, at, provider: PROVIDER, model: MODEL };
}

function settled(session: SessionFacts, at: number, usage: TurnUsage): TurnSignal {
	return { kind: "response_settled", session, at: at + 60_000, outcome: "completed", readings: [usage] };
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
}

async function bindAccounting(options: { readonly baseline?: unknown } = {}): Promise<BoundAccounting> {
	const root = mkdtempSync(path.join(tmpdir(), "model-cost-round-totals-"));
	roots.push(root);
	const file = path.join(root, "consumption.json");
	if (options.baseline !== undefined) await Bun.write(file, JSON.stringify(options.baseline));
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
		config: { reader: () => `storageDir: ${root}\nbalanceTtlMs: 30000\ncodexQuotaTtlMs: 15000\n` },
	});
	double.deliverSession(OWNER, { session: MAIN });
	// The framework's awaitable position before a model request: the initialization — and the
	// baseline read it performs — has settled when this returns.
	await double.initiateRun(OWNER);
	return { runtime, double };
}

/** One request in one actual session: the Turn's start facts, then its settled response. */
function request(double: PortDouble, session: SessionFacts, usage: TurnUsage, at = OFF_PEAK_START): void {
	double.deliverTurn(startedAt(session, at), { owner: OWNER });
	double.deliverTurn(settled(session, at, usage), { owner: OWNER });
}

/** One Round of one actual session, as the framework dispatches its two edges. */
function openRound(double: PortDouble, session: SessionFacts): void {
	double.deliverRound(OWNER, { event: { kind: "round_start" }, session });
}

function endRound(double: PortDouble, session: SessionFacts): void {
	double.deliverRound(OWNER, { event: { kind: "round_end" }, session });
}

/**
 * One model's own consumption as a case wrote it: the four buckets as delivered, and the amount
 * they cost at the data's own price. A Round total is a difference of two accumulated sums, so its
 * amount is compared at the precision such a difference holds rather than as a written literal.
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

describe("a Round total is the session's own accumulation across its own boundaries (P15)", () => {
	test("the open Round is the session's accumulation since it began, and nothing is a previous Round yet", async () => {
		const { runtime, double } = await bindAccounting();

		openRound(double, MAIN);
		request(double, MAIN, FIRST_USAGE);

		expect(runtime.view.roundTotals(MAIN.sessionId)).toEqual({
			current: { [PROVIDER]: { [MODEL]: consumed(FIRST_USAGE, FIRST_AMOUNT) } },
		});
		// The Round began from an empty snapshot, so what it holds is the whole of that session's own
		// accumulation — the same value the session's own view answers.
		expect(runtime.view.own(MAIN.sessionId)).toEqual({
			[PROVIDER]: { [MODEL]: consumed(FIRST_USAGE, FIRST_AMOUNT) },
		});
	});

	test("the Round that ended is the previous one, and the next Round's current starts over from its own boundary", async () => {
		const { runtime, double } = await bindAccounting();

		openRound(double, MAIN);
		request(double, MAIN, FIRST_USAGE);
		endRound(double, MAIN);

		// The Round is over: nothing is open, and the Round that just ended is the previous one.
		expect(runtime.view.roundTotals(MAIN.sessionId)).toEqual({
			previous: { [PROVIDER]: { [MODEL]: consumed(FIRST_USAGE, FIRST_AMOUNT) } },
		});

		openRound(double, MAIN);
		request(double, MAIN, SECOND_USAGE);

		// The new Round's own additions are its own, and the Round before it is unchanged: the
		// session's accumulation now holds both requests.
		expect(runtime.view.roundTotals(MAIN.sessionId)).toEqual({
			current: { [PROVIDER]: { [MODEL]: consumed(SECOND_USAGE, SECOND_AMOUNT) } },
			previous: { [PROVIDER]: { [MODEL]: consumed(FIRST_USAGE, FIRST_AMOUNT) } },
		});
		expect(runtime.view.own(MAIN.sessionId)).toEqual({
			[PROVIDER]: {
				[MODEL]: {
					tokens: {
						input: FIRST_USAGE.input + SECOND_USAGE.input,
						cacheRead: FIRST_USAGE.cacheRead + SECOND_USAGE.cacheRead,
						cacheWrite: FIRST_USAGE.cacheWrite + SECOND_USAGE.cacheWrite,
						output: FIRST_USAGE.output + SECOND_USAGE.output,
					},
					costCny: FIRST_AMOUNT + SECOND_AMOUNT,
				},
			},
		});
	});

	test("a Round the session began in another period is not measured against this one's snapshot", async () => {
		const { runtime, double } = await bindAccounting();

		openRound(double, MAIN);
		request(double, MAIN, FIRST_USAGE);
		expect(runtime.view.roundTotals(MAIN.sessionId)).toEqual({
			current: { [PROVIDER]: { [MODEL]: consumed(FIRST_USAGE, FIRST_AMOUNT) } },
		});

		// Another process reset the period while this Round was open: the snapshot it began from
		// belongs to a generation that no longer exists, so nothing is derived from the pair — neither
		// a current Round nor a previous one — rather than a number that mixes two periods.
		const reset: ConsumptionDocument = {
			schemaVersion: 1,
			periodId: "period-after-reset",
			start: "2026-10-14T00:00:00.000Z",
			holiday: false,
			harnesses: { [HARNESS]: { sessions: [] } },
		};
		await Bun.write(runtime.storage.consumptionFile, JSON.stringify(reset));
		await runtime.storage.load();
		endRound(double, MAIN);

		expect(runtime.view.roundTotals(MAIN.sessionId)).toBeUndefined();
	});

	test("a Round end with no observed start publishes no previous Round", async () => {
		const { runtime, double } = await bindAccounting();

		// A Round end the framework reports without this instance having seen its start: there is no
		// boundary pair to difference, so nothing is published as a previous Round rather than a
		// number derived from whatever the session happens to hold.
		request(double, MAIN, FIRST_USAGE);
		endRound(double, MAIN);

		expect(runtime.view.roundTotals(MAIN.sessionId)).toBeUndefined();
	});
});

describe("a tool continuation is one Round's own consumption (P3, P15)", () => {
	test("the follow-up request after a tool is part of the Round, and the Round's end adds nothing", async () => {
		const { runtime, double } = await bindAccounting();

		// One prompt: the first request asks for a tool, the tool returns, and the follow-up request
		// answers. The tool's own execution is not a fact of this seam and adds nothing; the request
		// that follows it is a Turn of the same Round, and the Round's total is both requests together.
		openRound(double, MAIN);
		request(double, MAIN, FIRST_USAGE);
		request(double, MAIN, SECOND_USAGE, OFF_PEAK_START + 1_000);

		expect(runtime.view.roundTotals(MAIN.sessionId)).toEqual({
			current: {
				[PROVIDER]: {
					[MODEL]: {
						tokens: {
							input: FIRST_USAGE.input + SECOND_USAGE.input,
							cacheRead: FIRST_USAGE.cacheRead + SECOND_USAGE.cacheRead,
							cacheWrite: FIRST_USAGE.cacheWrite + SECOND_USAGE.cacheWrite,
							output: FIRST_USAGE.output + SECOND_USAGE.output,
						},
						costCny: expect.closeTo(FIRST_AMOUNT + SECOND_AMOUNT, 12),
					},
				},
			},
		});

		// The Round's end measures it and saves the session; it adds no consumption of its own.
		const own = runtime.view.own(MAIN.sessionId);
		endRound(double, MAIN);
		expect(runtime.view.own(MAIN.sessionId)).toEqual(own);
		expect(runtime.view.roundTotals(MAIN.sessionId)).toEqual({
			previous: {
				[PROVIDER]: {
					[MODEL]: {
						tokens: {
							input: FIRST_USAGE.input + SECOND_USAGE.input,
							cacheRead: FIRST_USAGE.cacheRead + SECOND_USAGE.cacheRead,
							cacheWrite: FIRST_USAGE.cacheWrite + SECOND_USAGE.cacheWrite,
							output: FIRST_USAGE.output + SECOND_USAGE.output,
						},
						costCny: expect.closeTo(FIRST_AMOUNT + SECOND_AMOUNT, 12),
					},
				},
			},
		});
	});
});

describe("a Round holds only its own session's consumption (P14)", () => {
	test("a child session's request never enters its parent's Round", async () => {
		const { runtime, double } = await bindAccounting();

		openRound(double, MAIN);
		request(double, MAIN, FIRST_USAGE);

		// The child's own request: its own Round, its own accumulation. The parent's Round is the
		// parent's own requests and nothing else, so neither view can be read from the other.
		openRound(double, CHILD);
		request(double, CHILD, SECOND_USAGE);

		expect(runtime.view.roundTotals(MAIN.sessionId)).toEqual({
			current: { [PROVIDER]: { [MODEL]: consumed(FIRST_USAGE, FIRST_AMOUNT) } },
		});
		expect(runtime.view.roundTotals(CHILD.sessionId)).toEqual({
			current: { [PROVIDER]: { [MODEL]: consumed(SECOND_USAGE, SECOND_AMOUNT) } },
		});
		expect(runtime.view.own(MAIN.sessionId)).toEqual({
			[PROVIDER]: { [MODEL]: consumed(FIRST_USAGE, FIRST_AMOUNT) },
		});
	});

	test("a request that arrives after the parent's Round ended does not back-fill it", async () => {
		const { runtime, double } = await bindAccounting();

		openRound(double, MAIN);
		request(double, MAIN, FIRST_USAGE);
		endRound(double, MAIN);

		// A delegated request settling after the parent's Round ended: the child's own consumption —
		// and the parent's session accumulation, which aggregates it elsewhere — but never the
		// parent's Round, which is a boundary pair that has already been measured.
		openRound(double, CHILD);
		request(double, CHILD, SECOND_USAGE);

		expect(runtime.view.roundTotals(MAIN.sessionId)).toEqual({
			previous: { [PROVIDER]: { [MODEL]: consumed(FIRST_USAGE, FIRST_AMOUNT) } },
		});
		expect(runtime.view.own(MAIN.sessionId)).toEqual({
			[PROVIDER]: { [MODEL]: consumed(FIRST_USAGE, FIRST_AMOUNT) },
		});
	});
});

describe("a Round total comes from this instance's own boundaries, never from a file (P15)", () => {
	test("a restored accumulation is not a Round, and the next Round counts only its own additions", async () => {
		// A session the document already holds, as a previous process saved it: these totals were
		// consumed before this instance existed and no boundary of theirs is known here.
		const baseline: ConsumptionDocument = {
			schemaVersion: 1,
			periodId: "period-restored",
			start: "2026-10-01T00:00:00.000Z",
			holiday: false,
			harnesses: {
				[HARNESS]: {
					sessions: [
						{
							id: MAIN.sessionId,
							name: "主会话",
							parent: null,
							saveVersion: 1,
							own: { [PROVIDER]: { [MODEL]: { tokens: { input: 500, cacheRead: 0, cacheWrite: 0, output: 40 }, costCny: 1.5 } } },
						},
					],
				},
			},
		};
		const { runtime, double } = await bindAccounting({ baseline });

		// Nothing has happened in this process: the restored accumulation is a session total, and no
		// Round can be derived from it.
		expect(runtime.view.own(MAIN.sessionId)).toEqual({
			[PROVIDER]: { [MODEL]: { tokens: { input: 500, cacheRead: 0, cacheWrite: 0, output: 40 }, costCny: 1.5 } },
		});
		expect(runtime.view.roundTotals(MAIN.sessionId)).toBeUndefined();

		// A Round that begins here is measured from the restored accumulation, so what it holds is
		// this Round's own request and no part of the restored history.
		openRound(double, MAIN);
		request(double, MAIN, FIRST_USAGE);

		expect(runtime.view.roundTotals(MAIN.sessionId)).toEqual({
			current: { [PROVIDER]: { [MODEL]: consumed(FIRST_USAGE, FIRST_AMOUNT) } },
		});
	});

	test("a session with no consumption in this process has no Round total to show", async () => {
		const { runtime, double } = await bindAccounting();

		// A session that never consumed, and one that only ever began a Round: nothing is published
		// for either, rather than a zero standing in for a measurement this instance never made.
		expect(runtime.view.roundTotals(MAIN.sessionId)).toBeUndefined();

		openRound(double, MAIN);
		expect(runtime.view.roundTotals(MAIN.sessionId)).toEqual({ current: {} });
	});
});
