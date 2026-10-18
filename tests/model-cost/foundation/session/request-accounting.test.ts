/**
 * Request accounting at the extension's display seam (P1, P2, P4, P5; S2).
 *
 * The seam under test is production throughout: the extension's real definition is bound through the
 * framework's public binding (the port double, `tests/framework/support/harness-port-double.ts`),
 * the runtime is the one `createModelCostRuntime` builds, and every public Turn and Round delivery
 * below is fed exactly as a harness adapter would feed it. What the cases read is what a frontend
 * would read — `runtime.view`, the read-only consumption results, and the consumption document the
 * Round's own save publishes — never a private field.
 *
 * The price data is self-made: one provider, one monetary model, one model whose tier the data
 * prices nowhere, one token-only id and one window pair, so no expected amount below depends on a
 * real price or a real model id. Every amount is written here by hand from those numbers
 * (off-peak = `input·2 + cacheRead·0.5 + output·8` per million tokens, peak = three times that, and
 * a cache-write bucket the data does not price), and the season an instant falls in is derived from
 * the contract's own windows, not from the code under test.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { MODEL_COST } from "../../../../extensions/model-cost/definition";
import type { ConsumptionDocument, SessionRecord } from "../../../../extensions/model-cost/shared-logic/foundation/session/consumption-document"
import type { ModelPricingData } from "../../../../extensions/model-cost/shared-logic/business/pricing/model-data";
import { type ModelCostRuntime, createModelCostRuntime } from "../../../../extensions/model-cost/shared-logic/runtime";
import type { OwnerReference, SessionFacts, TurnOutcome, TurnSignal, TurnUsage } from "../../../../framework/core/protocol";
import { type PortDouble, type TurnBoundary, portDouble } from "../../../framework/support/harness-port-double";

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

/** One Beijing wall-clock reading on a named day of October 2026, as the epoch instant a request carries. */
function beijing(day: number, hours: number, minutes = 0, seconds = 0, ms = 0): number {
	return Date.UTC(2026, 9, day, hours, minutes, seconds, ms) - BEIJING_OFFSET_MS;
}

/**
 * The same reading on Wednesday 2026-10-14, a workday of the pricing zone: nothing but the data's
 * two windows decides the season of an instant below, and the two weekend days are named separately.
 */
function atBeijing(hours: number, minutes = 0, seconds = 0, ms = 0): number {
	return beijing(14, hours, minutes, seconds, ms);
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
			"model-unpriced": { mode: "monetary", tier: "gamma" },
		},
		"go-provider": { "model-alpha": { mode: "token-only" } },
	},
};

const HARNESS = "probe-harness";
const MAIN_NAME = "主会话";
const MAIN: SessionFacts = { sessionId: "session-main", kind: "main", name: MAIN_NAME, unavailable: [] };
/** A second actual session, so a case can prove one session's round wrote only its own record. */
const OTHER: SessionFacts = { sessionId: "session-other", kind: "main", name: "另一个会话", unavailable: [] };
const OWNER: OwnerReference = { kind: "owner", key: "main:accounting" };
const CONSUMPTION_FILE = "consumption.json";

/** The usage every completing request in these cases reports, as the framework delivers it. */
const USAGE: TurnUsage = { input: 2, cacheRead: 4, cacheWrite: 5, output: 3, totalTokens: 9 };

/** The amount that usage costs at the data's off-peak price: (2·2 + 4·0.5 + 3·8) / 1e6. */
const OFF_PEAK_AMOUNT = 0.00003;

/** And at the peak price, which is the off-peak one times the data's own multiplier of three. */
const PEAK_AMOUNT = 0.00009;

/**
 * The same peak price for `model-beta`, whose tier's off-peak amounts are {10, 1, 20}: the same
 * usage (2·10 + 4·1 + 3·20) per million tokens, times the data's multiplier of three.
 */
const BETA_PEAK_AMOUNT = 0.000252;

/** One Turn signal pair's facts, as an adapter maps them. */
function startedAt(session: SessionFacts, provider: string, model: string, at: number): TurnSignal {
	return { kind: "request_started", session, at, provider, model };
}

/** One settled response, with the readings the harness reported (an empty list means none). */
function settled(
	session: SessionFacts,
	at: number,
	readings: readonly TurnUsage[],
	outcome: TurnOutcome = "completed",
): TurnSignal {
	return { kind: "response_settled", session, at, outcome, readings };
}

/** Every root this file created, removed after each case. */
const roots: string[] = [];

/**
 * One whole request in an actual session of its own, at the instant a case chose: its Turn's start
 * facts and, one minute later, its settled response.
 *
 * A case reading several instants gives each one its own session, so what the display seam answers
 * for it is that one request's own result and no earlier case's accumulation is involved. The price
 * depends on the start instant alone, which is why the settle's own instant is a minute later.
 */
function turnOf(
	double: PortDouble,
	at: number,
	provider: string,
	model: string,
): { readonly session: SessionFacts; readonly boundary: TurnBoundary } {
	const session: SessionFacts = { sessionId: `session-${provider}-${model}-${at}`, kind: "main", unavailable: [] };
	double.deliverTurn(startedAt(session, provider, model, at), { owner: OWNER });
	const boundary = double.deliverTurn(settled(session, at + 60_000, [USAGE]), { owner: OWNER });
	return { session, boundary };
}

/** The amount one request started at `at` was anchored at, read from the display seam. */
function amountStartedAt(
	runtime: ModelCostRuntime,
	double: PortDouble,
	at: number,
	provider = "official",
	model = "model-alpha",
): number | undefined {
	const { session } = turnOf(double, at, provider, model);
	return runtime.view.own(session.sessionId)?.[provider]?.[model]?.costCny;
}

/** A baseline whose period is a holiday, so every instant inside it is off-peak whatever the clock. */
function holidayBaseline(): ConsumptionDocument {
	return {
		schemaVersion: 1,
		periodId: "period-holiday",
		start: "2026-10-01T00:00:00.000Z",
		holiday: true,
		harnesses: { [HARNESS]: { sessions: [] } },
	};
}

/** One bound accounting instance, and what a case drives and reads it through. */
interface BoundAccounting {
	readonly runtime: ModelCostRuntime;
	readonly double: PortDouble;
	readonly file: string;
}

/**
 * One accounting instance over a fresh isolated root: the production runtime, bound through the
 * framework's own binding, with the baseline loaded by the initialization the first model request
 * waits for.
 */
async function bindAccounting(options: { readonly baseline?: unknown } = {}): Promise<BoundAccounting> {
	const root = mkdtempSync(path.join(tmpdir(), "model-cost-accounting-"));
	roots.push(root);
	const file = path.join(root, CONSUMPTION_FILE);
	if (options.baseline !== undefined) writeFileSync(file, JSON.stringify(options.baseline), "utf8");
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
	return { runtime, double, file };
}

/**
 * Waits until the consumption document holds what a case expects of it, and reads it back.
 *
 * The Round's end is dispatched the way the framework dispatches a semantic handler — without
 * waiting for the promise it returns — so the save it drives lands a few event-loop turns later.
 * The wait is on the expected content itself rather than on a duration, and the deadline only keeps a
 * save that never happened from hanging the case.
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
		await new Promise(resolve => setImmediate(resolve));
	}
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("a settled request adds its reliable usage once, priced at its own start (P1, P2)", () => {
	test("the four reported buckets are added as delivered, and the amount is the off-peak price's", async () => {
		const { runtime, double } = await bindAccounting();
		double.deliverTurn(startedAt(MAIN, "official", "model-alpha", OFF_PEAK_START), { owner: OWNER });
		double.deliverTurn(settled(MAIN, atBeijing(13, 5), [USAGE]), { owner: OWNER });

		expect(runtime.view.own(MAIN.sessionId)).toEqual({
			official: {
				"model-alpha": {
					// Cached tokens are their own bucket: the input bucket is the non-cached count the
					// response reported, never that count plus the cache reads.
					tokens: { input: 2, cacheRead: 4, cacheWrite: 5, output: 3 },
					costCny: OFF_PEAK_AMOUNT,
				},
			},
		});
	});

	test("a request that starts inside a peak window is priced at the peak price, whatever time it ends", async () => {
		const { runtime, double } = await bindAccounting();
		double.deliverTurn(startedAt(MAIN, "official", "model-alpha", PEAK_START), { owner: OWNER });
		// The window ends at 12:00; this response settles well outside it.
		double.deliverTurn(settled(MAIN, OFF_PEAK_START, [USAGE]), { owner: OWNER });
		expect(runtime.view.own(MAIN.sessionId)).toEqual({
			official: { "model-alpha": { tokens: { input: 2, cacheRead: 4, cacheWrite: 5, output: 3 }, costCny: PEAK_AMOUNT } },
		});
	});

	test("completed, failed and cancelled requests all add their reliable usage", async () => {
		const { runtime, double } = await bindAccounting();
		const each: TurnUsage = { input: 1, cacheRead: 0, cacheWrite: 0, output: 1, totalTokens: 2 };
		const outcomes: readonly TurnOutcome[] = ["completed", "failed", "cancelled"];
		for (const outcome of outcomes) {
			double.deliverTurn(startedAt(MAIN, "official", "model-alpha", OFF_PEAK_START), { owner: OWNER });
			double.deliverTurn(settled(MAIN, atBeijing(13, 5), [each], outcome), { owner: OWNER });
		}
		const own = runtime.view.own(MAIN.sessionId);
		expect(own?.official?.["model-alpha"]?.tokens).toEqual({ input: 3, cacheRead: 0, cacheWrite: 0, output: 3 });
		// Three requests of (1·2 + 1·8) per million tokens; the accumulation is a sum of floating-point
		// additions, so the amount is compared as the number it is rather than as a written literal.
		expect(own?.official?.["model-alpha"]?.costCny).toBeCloseTo(0.00003, 12);
	});
});

describe("the anchored price is the request's own start in the data's zone (P1)", () => {
	test("a workday's two windows are closed at both ends, and one millisecond past either is not", async () => {
		const { runtime, double } = await bindAccounting();

		// Wednesday 2026-10-14 in the pricing zone: the data's windows are [09:00, 12:00] and
		// [14:00, 18:00], so the boundary instant itself is peak and the next millisecond is not. Both
		// amounts are the ones written above by hand from the data's own numbers.
		expect(amountStartedAt(runtime, double, atBeijing(8, 59, 59, 999))).toBe(OFF_PEAK_AMOUNT);
		expect(amountStartedAt(runtime, double, atBeijing(9, 0, 0, 0))).toBe(PEAK_AMOUNT);
		expect(amountStartedAt(runtime, double, atBeijing(11, 59, 59, 999))).toBe(PEAK_AMOUNT);
		expect(amountStartedAt(runtime, double, atBeijing(12, 0, 0, 0))).toBe(PEAK_AMOUNT);
		expect(amountStartedAt(runtime, double, atBeijing(12, 0, 0, 1))).toBe(OFF_PEAK_AMOUNT);
		expect(amountStartedAt(runtime, double, atBeijing(13, 59, 59, 999))).toBe(OFF_PEAK_AMOUNT);
		expect(amountStartedAt(runtime, double, atBeijing(14, 0, 0, 0))).toBe(PEAK_AMOUNT);
		expect(amountStartedAt(runtime, double, atBeijing(18, 0, 0, 0))).toBe(PEAK_AMOUNT);
		expect(amountStartedAt(runtime, double, atBeijing(18, 0, 0, 1))).toBe(OFF_PEAK_AMOUNT);
		expect(amountStartedAt(runtime, double, atBeijing(0, 30))).toBe(OFF_PEAK_AMOUNT);
		expect(amountStartedAt(runtime, double, atBeijing(23, 30))).toBe(OFF_PEAK_AMOUNT);
	});

	test("a weekend is off-peak all day, inside a window's hours or not", async () => {
		const { runtime, double } = await bindAccounting();

		// Saturday 2026-10-17 and Sunday 2026-10-18 in the pricing zone, at hours the workday windows
		// would otherwise call peak.
		expect(amountStartedAt(runtime, double, beijing(17, 10))).toBe(OFF_PEAK_AMOUNT);
		expect(amountStartedAt(runtime, double, beijing(18, 15))).toBe(OFF_PEAK_AMOUNT);
	});

	test("a holiday period is off-peak at every instant inside it", async () => {
		const { runtime, double } = await bindAccounting({ baseline: holidayBaseline() });

		expect(amountStartedAt(runtime, double, atBeijing(10))).toBe(OFF_PEAK_AMOUNT);
		expect(amountStartedAt(runtime, double, atBeijing(15))).toBe(OFF_PEAK_AMOUNT);
	});

	test("the peak price is the data's own multiplier, and a model switch carries its own tier's", async () => {
		const { runtime, double } = await bindAccounting();

		// Both requests start inside the morning peak window; the data's multiplier is three, and the
		// two models' tiers are priced differently, so neither answer can come from the other's tier.
		expect(amountStartedAt(runtime, double, PEAK_START, "official", "model-alpha")).toBe(PEAK_AMOUNT);
		expect(amountStartedAt(runtime, double, PEAK_START, "official", "model-beta")).toBe(BETA_PEAK_AMOUNT);
	});
});

describe("a request is classified by its provider and exact model id, never by resemblance (P6)", () => {
	test("a resembling or differently cased pair, another provider's id and an inherited key are all hidden", async () => {
		const { runtime, double } = await bindAccounting();
		const hidden: ReadonlyArray<readonly [string, string]> = [
			["official", "model-alpha-mini"],
			["official", "model-alph"],
			["official", "prefix-model-alpha"],
			["Official", "model-alpha"],
			["other-provider", "model-alpha"],
			// The data is a plain mapping, so a name `Object` also has must not resolve through it.
			["official", "constructor"],
			["toString", "model-alpha"],
		];

		for (const [provider, model] of hidden) {
			const { session, boundary } = turnOf(double, OFF_PEAK_START, provider, model);
			// A pair this data does not name is not this extension's request at all: no bucket, no
			// amount and no notice, whatever the pair resembles or inherits its name from.
			expect(runtime.view.own(session.sessionId)).toBeUndefined();
			expect(boundary.feedback).toEqual([]);
		}
	});
});

describe("reliable usage is accounted and an established zero is not the same as no reading (P2)", () => {
	test("a settle that reported nothing leaves the session unconsumed and tells the operator", async () => {
		const { runtime, double } = await bindAccounting();
		double.deliverTurn(startedAt(MAIN, "official", "model-alpha", OFF_PEAK_START), { owner: OWNER });
		const boundary = double.deliverTurn(settled(MAIN, atBeijing(13, 5), []), { owner: OWNER });

		expect(runtime.view.own(MAIN.sessionId)).toBeUndefined();
		expect(boundary.feedback).toHaveLength(1);
		expect(boundary.feedback[0]?.level).toBe("warning");
		expect(boundary.feedback[0]?.message).toContain("没有可靠的 usage");
	});

	test("a reading the harness reported as zero is accounted as the confirmed zero it is", async () => {
		const { runtime, double, file } = await bindAccounting();
		const zero: TurnUsage = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, totalTokens: 0 };
		double.deliverTurn(startedAt(MAIN, "official", "model-alpha", OFF_PEAK_START), { owner: OWNER });
		const boundary = double.deliverTurn(settled(MAIN, atBeijing(13, 5), [zero]), { owner: OWNER });

		// A zero is not the same fact as no reading: the source established this one, so the four
		// buckets are recorded as the zeros they are, the applicable price makes the amount a zero
		// rather than an unknown, and nothing is reported as missing. A request whose usage could not
		// be established at all is the case above — reported and skipped, never counted as free.
		expect(runtime.view.own(MAIN.sessionId)).toEqual({
			official: { "model-alpha": { tokens: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 }, costCny: 0 } },
		});
		expect(boundary.feedback).toEqual([]);

		// And it is saved like any other accounted request: the confirmed zero is consumption
		// evidence, which a skipped request is not.
		double.deliverRound(OWNER, { event: { kind: "round_start" }, session: MAIN });
		double.deliverRound(OWNER, { event: { kind: "round_end" }, session: MAIN });
		const document = await savedDocument(file, candidate => candidate.harnesses[HARNESS]?.sessions[0]?.saveVersion === 1);
		expect(document.harnesses[HARNESS]?.sessions[0]?.own).toEqual({
			official: { "model-alpha": { tokens: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 }, costCny: 0 } },
		});
	});
});

describe("a missing price skips the amount only, and a mode without an amount policy is no error (P5, P6)", () => {
	test("a monetary model the data prices nowhere keeps its tokens and is told about the amount", async () => {
		const { runtime, double } = await bindAccounting();
		double.deliverTurn(startedAt(MAIN, "official", "model-unpriced", OFF_PEAK_START), { owner: OWNER });
		const boundary = double.deliverTurn(settled(MAIN, atBeijing(13, 5), [USAGE]), { owner: OWNER });

		expect(runtime.view.own(MAIN.sessionId)).toEqual({
			official: { "model-unpriced": { tokens: { input: 2, cacheRead: 4, cacheWrite: 5, output: 3 } } },
		});
		expect(boundary.feedback).toHaveLength(1);
		expect(boundary.feedback[0]?.level).toBe("warning");
		expect(boundary.feedback[0]?.message).toContain("缺适用价格");
	});

	test("a token-only request keeps its tokens with no amount and no missing-price notice", async () => {
		const { runtime, double } = await bindAccounting();
		double.deliverTurn(startedAt(MAIN, "go-provider", "model-alpha", OFF_PEAK_START), { owner: OWNER });
		const boundary = double.deliverTurn(settled(MAIN, atBeijing(13, 5), [USAGE]), { owner: OWNER });

		expect(runtime.view.own(MAIN.sessionId)).toEqual({
			"go-provider": { "model-alpha": { tokens: { input: 2, cacheRead: 4, cacheWrite: 5, output: 3 } } },
		});
		expect(boundary.feedback).toEqual([]);
	});

	test("an allowance provider's model keeps its tokens with no amount and no notice", async () => {
		const { runtime, double } = await bindAccounting();
		// The allowance channel is a fact of the provider, so every one of its model ids is covered.
		const { session, boundary } = turnOf(double, OFF_PEAK_START, "plan-provider", "any-model-id");

		expect(runtime.view.own(session.sessionId)).toEqual({
			"plan-provider": { "any-model-id": { tokens: { input: 2, cacheRead: 4, cacheWrite: 5, output: 3 } } },
		});
		expect(boundary.feedback).toEqual([]);
	});
});

describe("a Turn is accounted by its own identity, once, across rounds (P4)", () => {
	test("a repeated end for the same Turn changes nothing, and a new Turn of the same content counts", async () => {
		const { runtime, double } = await bindAccounting();
		double.deliverTurn(startedAt(MAIN, "official", "model-alpha", OFF_PEAK_START), { owner: OWNER });
		double.deliverTurn(settled(MAIN, atBeijing(13, 5), [USAGE]), { owner: OWNER });
		const once = runtime.view.own(MAIN.sessionId);

		// The same fact again, after a round boundary: no second amount and no second bucket.
		double.deliverRound(OWNER, { event: { kind: "round_start" }, session: MAIN });
		double.deliverRound(OWNER, { event: { kind: "round_end" }, session: MAIN });
		double.deliverRound(OWNER, { event: { kind: "round_start" }, session: MAIN });
		double.deliverTurn(settled(MAIN, atBeijing(13, 6), [USAGE]), { owner: OWNER });
		expect(runtime.view.own(MAIN.sessionId)).toEqual(once);

		// The same numbers under a new identity are a second request, and both are counted.
		double.deliverTurn(startedAt(MAIN, "official", "model-alpha", OFF_PEAK_START), { owner: OWNER });
		double.deliverTurn(settled(MAIN, atBeijing(13, 7), [USAGE]), { owner: OWNER });
		expect(runtime.view.own(MAIN.sessionId)).toEqual({
			official: {
				"model-alpha": {
					tokens: { input: 4, cacheRead: 8, cacheWrite: 10, output: 6 },
					costCny: OFF_PEAK_AMOUNT * 2,
				},
			},
		});
	});

	test("a skipped request is not back-accounted when a later reading for it arrives", async () => {
		const { runtime, double } = await bindAccounting();
		double.deliverTurn(startedAt(MAIN, "official", "model-alpha", OFF_PEAK_START), { owner: OWNER });
		double.deliverTurn(settled(MAIN, atBeijing(13, 5), []), { owner: OWNER });
		expect(runtime.view.own(MAIN.sessionId)).toBeUndefined();

		// A later settle for that same ended Turn reports a usage: it neither re-opens the Turn nor
		// accounts anything, whether the framework drops it or the extension's own mark does.
		double.deliverTurn(settled(MAIN, atBeijing(13, 6), [USAGE]), { owner: OWNER });
		expect(runtime.view.own(MAIN.sessionId)).toBeUndefined();
	});
});

describe("a session's own consumption is published at its Round's end (P4, P52)", () => {
	test("the round's save carries the session's own record, and the next round's carries the next version", async () => {
		const { runtime, double, file } = await bindAccounting();
		double.deliverTurn(startedAt(MAIN, "official", "model-alpha", OFF_PEAK_START), { owner: OWNER });
		double.deliverTurn(settled(MAIN, atBeijing(13, 5), [USAGE]), { owner: OWNER });
		double.deliverRound(OWNER, { event: { kind: "round_start" }, session: MAIN });
		double.deliverRound(OWNER, { event: { kind: "round_end" }, session: MAIN });

		const first = await savedDocument(file, document => document.harnesses[HARNESS]?.sessions[0]?.saveVersion === 1);
		expect(first.harnesses[HARNESS]?.sessions).toEqual([
			{
				id: MAIN.sessionId,
				name: MAIN_NAME,
				parent: null,
				saveVersion: 1,
				own: {
					official: {
						"model-alpha": { tokens: { input: 2, cacheRead: 4, cacheWrite: 5, output: 3 }, costCny: OFF_PEAK_AMOUNT },
					},
				},
			},
		]);

		// A second round of the same session accumulates on top and publishes the next version.
		double.deliverTurn(startedAt(MAIN, "official", "model-alpha", OFF_PEAK_START), { owner: OWNER });
		double.deliverTurn(settled(MAIN, atBeijing(13, 30), [USAGE]), { owner: OWNER });
		double.deliverRound(OWNER, { event: { kind: "round_start" }, session: MAIN });
		double.deliverRound(OWNER, { event: { kind: "round_end" }, session: MAIN });
		const second = await savedDocument(file, document => document.harnesses[HARNESS]?.sessions[0]?.saveVersion === 2);
		expect(second.harnesses[HARNESS]?.sessions).toEqual([
			{
				id: MAIN.sessionId,
				name: MAIN_NAME,
				parent: null,
				saveVersion: 2,
				own: {
					official: {
						"model-alpha": { tokens: { input: 4, cacheRead: 8, cacheWrite: 10, output: 6 }, costCny: OFF_PEAK_AMOUNT * 2 },
					},
				},
			},
		]);
	});

	test("a round that consumed nothing writes nothing at all", async () => {
		const { double, file } = await bindAccounting();
		double.deliverRound(OWNER, { event: { kind: "round_start" }, session: MAIN });
		double.deliverRound(OWNER, { event: { kind: "round_end" }, session: MAIN });
		// Nothing was consumed, so there was nothing to save: the file is not even created.
		await new Promise(resolve => setImmediate(resolve));
		expect(existsSync(file)).toBe(false);

		// And the next real save proves it: the document it publishes holds only the session that
		// really consumed, so the empty round contributed no record to the document it wrote into.
		double.deliverTurn(startedAt(OTHER, "official", "model-alpha", OFF_PEAK_START), { owner: OWNER });
		double.deliverTurn(settled(OTHER, atBeijing(13, 5), [USAGE]), { owner: OWNER });
		double.deliverRound(OWNER, { event: { kind: "round_start" }, session: OTHER });
		double.deliverRound(OWNER, { event: { kind: "round_end" }, session: OTHER });
		const published = await savedDocument(file, document =>
			(document.harnesses[HARNESS]?.sessions ?? []).some(record => record.id === OTHER.sessionId),
		);
		expect(published.harnesses[HARNESS]?.sessions.map(record => record.id)).toEqual([OTHER.sessionId]);
	});

	test("a round with nothing new since the last save does not rewrite the document", async () => {
		const { double, file } = await bindAccounting();
		double.deliverTurn(startedAt(MAIN, "official", "model-alpha", OFF_PEAK_START), { owner: OWNER });
		double.deliverTurn(settled(MAIN, atBeijing(13, 5), [USAGE]), { owner: OWNER });
		double.deliverRound(OWNER, { event: { kind: "round_start" }, session: MAIN });
		double.deliverRound(OWNER, { event: { kind: "round_end" }, session: MAIN });
		await savedDocument(file, document => document.harnesses[HARNESS]?.sessions[0]?.saveVersion === 1);

		// A round of that session that consumed nothing carries nothing to save: the snapshot the store
		// already accepted is the document's, and no second version of it is published. The proof is the
		// next real save — a coordinated update serializes same-file writes, so a rewrite that happened
		// would have landed before the document that save reads back.
		double.deliverRound(OWNER, { event: { kind: "round_start" }, session: MAIN });
		double.deliverRound(OWNER, { event: { kind: "round_end" }, session: MAIN });
		double.deliverTurn(startedAt(OTHER, "official", "model-alpha", OFF_PEAK_START), { owner: OWNER });
		double.deliverTurn(settled(OTHER, atBeijing(13, 30), [USAGE]), { owner: OWNER });
		double.deliverRound(OWNER, { event: { kind: "round_start" }, session: OTHER });
		double.deliverRound(OWNER, { event: { kind: "round_end" }, session: OTHER });
		const published = await savedDocument(file, document =>
			(document.harnesses[HARNESS]?.sessions ?? []).some(record => record.id === OTHER.sessionId),
		);
		const versions = (published.harnesses[HARNESS]?.sessions ?? []).map(record => [record.id, record.saveVersion]);
		expect(versions).toEqual([
			[MAIN.sessionId, 1],
			[OTHER.sessionId, 1],
		]);
	});

	test("a save the document refuses is reported, and the disk's own record stands", async () => {
		// This instance loaded version 1 of the session; another process publishes its own version 2
		// while this one runs, which is exactly the cross-process case the version rules exist for.
		const loaded: SessionRecord = {
			id: MAIN.sessionId,
			name: "主会话",
			parent: null,
			saveVersion: 1,
			own: { official: { "model-alpha": { tokens: { input: 1, cacheRead: 0, cacheWrite: 0, output: 0 } } } },
		};
		const baseline: ConsumptionDocument = {
			schemaVersion: 1,
			periodId: "period-one",
			start: "2026-10-01T00:00:00.000Z",
			holiday: false,
			harnesses: { [HARNESS]: { sessions: [loaded] } },
		};
		const { runtime, double, file } = await bindAccounting({ baseline });
		const theirs: SessionRecord = {
			...loaded,
			saveVersion: 2,
			own: { official: { "model-alpha": { tokens: { input: 7, cacheRead: 0, cacheWrite: 0, output: 0 }, costCny: 0.25 } } },
		};
		writeFileSync(file, JSON.stringify({ ...baseline, harnesses: { [HARNESS]: { sessions: [theirs] } } }), "utf8");

		double.deliverTurn(startedAt(MAIN, "official", "model-alpha", OFF_PEAK_START), { owner: OWNER });
		double.deliverTurn(settled(MAIN, atBeijing(13, 5), [USAGE]), { owner: OWNER });
		double.deliverRound(OWNER, { event: { kind: "round_start" }, session: MAIN });
		const boundary = double.deliverRound(OWNER, { event: { kind: "round_end" }, session: MAIN });

		// The refusal lands after the dispatch returned — the commit is asynchronous — so the notice is
		// waited for on the delivery's own feedback channel rather than assumed.
		const deadline = Date.now() + 5_000;
		while (boundary.feedback.length === 0 && Date.now() < deadline) {
			await new Promise(resolve => setImmediate(resolve));
		}
		expect(boundary.feedback).toHaveLength(1);
		expect(boundary.feedback[0]?.level).toBe("error");
		expect(boundary.feedback[0]?.message).toContain("没有写入");
		expect(boundary.feedback[0]?.message).toContain(CONSUMPTION_FILE);

		// A save that did not happen is not a save: the other process's record is still the document's,
		// untouched, this instance's accumulation is not counted as published, and what was refused is
		// dropped rather than kept: the session reads the disk's own record again.
		const stored = JSON.parse(readFileSync(file, "utf8")) as ConsumptionDocument;
		expect(stored.harnesses[HARNESS]?.sessions).toEqual([theirs]);
		expect(runtime.view.own(MAIN.sessionId)).toEqual(theirs.own);
	});

	test("a loaded baseline's own amounts are continued, never re-priced or replaced", async () => {
		// A record a previous process saved: its amounts are other numbers, and they survive the
		// new process's accumulation untouched — the new request is added to them.
		const saved: SessionRecord = {
			id: MAIN.sessionId,
			name: "主会话",
			parent: null,
			saveVersion: 3,
			own: {
				official: {
					"model-alpha": { tokens: { input: 100, cacheRead: 0, cacheWrite: 0, output: 0 }, costCny: 0.5 },
				},
			},
		};
		const baseline: ConsumptionDocument = {
			schemaVersion: 1,
			periodId: "period-one",
			start: "2026-10-01T00:00:00.000Z",
			holiday: false,
			harnesses: { [HARNESS]: { sessions: [saved] } },
		};
		const { runtime, double, file } = await bindAccounting({ baseline });
		// The loaded baseline is already what this instance's results hold.
		expect(runtime.view.own(MAIN.sessionId)).toEqual(saved.own);

		double.deliverTurn(startedAt(MAIN, "official", "model-alpha", OFF_PEAK_START), { owner: OWNER });
		double.deliverTurn(settled(MAIN, atBeijing(13, 5), [USAGE]), { owner: OWNER });
		double.deliverRound(OWNER, { event: { kind: "round_start" }, session: MAIN });
		double.deliverRound(OWNER, { event: { kind: "round_end" }, session: MAIN });

		const document = await savedDocument(file, candidate => candidate.harnesses[HARNESS]?.sessions[0]?.saveVersion === 4);
		expect(document.harnesses[HARNESS]?.sessions).toEqual([
			{
				id: MAIN.sessionId,
				name: "主会话",
				parent: null,
				saveVersion: 4,
				own: {
					official: {
						"model-alpha": {
							tokens: { input: 102, cacheRead: 4, cacheWrite: 5, output: 3 },
							costCny: 0.50003,
						},
					},
				},
			},
		]);
	});
});

describe("the display seam is read-only and announces its changes (S2)", () => {
	test("a subscriber is told when the results change and stops being told once it unsubscribes", async () => {
		const { runtime, double } = await bindAccounting();
		let announced = 0;
		const unsubscribe = runtime.view.subscribe(() => {
			announced += 1;
		});

		double.deliverTurn(startedAt(MAIN, "official", "model-alpha", OFF_PEAK_START), { owner: OWNER });
		double.deliverTurn(settled(MAIN, atBeijing(13, 5), [USAGE]), { owner: OWNER });
		expect(announced).toBe(1);

		// A skipped request changes nothing, so there is nothing to announce.
		double.deliverTurn(startedAt(MAIN, "official", "model-alpha", OFF_PEAK_START), { owner: OWNER });
		double.deliverTurn(settled(MAIN, atBeijing(13, 6), []), { owner: OWNER });
		expect(announced).toBe(1);

		unsubscribe();
		double.deliverTurn(startedAt(MAIN, "official", "model-alpha", OFF_PEAK_START), { owner: OWNER });
		double.deliverTurn(settled(MAIN, atBeijing(13, 7), [USAGE]), { owner: OWNER });
		expect(announced).toBe(1);
	});

	test("an instance that was ended accounts nothing late", async () => {
		const { runtime, double } = await bindAccounting();
		double.deliverTurn(startedAt(MAIN, "official", "model-alpha", OFF_PEAK_START), { owner: OWNER });
		double.deliverTurn(settled(MAIN, atBeijing(13, 5), [USAGE]), { owner: OWNER });
		const once = runtime.view.own(MAIN.sessionId);

		// The extension's own cleanup entry, which the framework runs at this instance's end.
		await runtime.implementation.cleanup?.();

		// A late callback must not enter the ended instance: neither its results nor the document move.
		double.deliverTurn(startedAt(MAIN, "official", "model-alpha", OFF_PEAK_START), { owner: OWNER });
		double.deliverTurn(settled(MAIN, atBeijing(13, 30), [USAGE]), { owner: OWNER });
		double.deliverRound(OWNER, { event: { kind: "round_start" }, session: MAIN });
		double.deliverRound(OWNER, { event: { kind: "round_end" }, session: MAIN });
		expect(runtime.view.own(MAIN.sessionId)).toEqual(once);
	});
});
