/**
 * The consumption display at the extension's read-only seam (P7, P8, P10, P25; S2).
 *
 * The seam under test is production throughout: the extension's real definition is bound through
 * the framework's public binding (the port double), the runtime is the one `createModelCostRuntime`
 * builds — built by a factory from the very context the framework hands one, harness model prices
 * included — and what every case reads is what a frontend reads: `runtime.presentation.of(target)`,
 * the read-only display result. No private field, no second accumulation and no formatting helper
 * of the implementation is reached.
 *
 * The data is self-made and the amounts are literals: the mixed-tree case writes a session record's
 * two currencies by hand, the ratio cases pick token counts whose normalized percentages are whole
 * numbers (4:32:64 and 13:25:12:50), the budgets are the specification's own fixed figures, and the
 * reference amounts are hand-computed from the fixture prices and the fixture usage. No expectation
 * below is computed by calling the implementation.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { MODEL_COST } from "../../extensions/model-cost/definition";
import type { ConsumptionDocument } from "../../extensions/model-cost/shared-logic/consumption-document";
import type { ModelPricingData } from "../../extensions/model-cost/shared-logic/model-data";
import type { ModelCostRuntime } from "../../extensions/model-cost/shared-logic/runtime";
import { createModelCostRuntime } from "../../extensions/model-cost/shared-logic/runtime";
import type {
	CatalogPrice,
	CatalogPriceSource,
	OwnerReference,
	SessionFacts,
	TurnSignal,
	TurnUsage,
} from "../../framework/core/protocol";
import { type PortDouble, portDouble } from "../framework/support/harness-port-double";

/** The self-made pricing data every case drives; `gamma` is named by a model and priced nowhere. */
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
			"model-unpriced": { mode: "monetary", tier: "gamma" },
		},
		"go-provider": { "model-alpha": { mode: "token-only" } },
	},
};

/** The host catalog price one case injects for the allowance provider's model, in USD. */
const CODEX_PRICE: CatalogPrice = {
	currency: "USD",
	unit: "USD per million tokens",
	amounts: { input: 1, cacheRead: 1, cacheWrite: 2, output: 2 },
};

/** A catalog that answers nothing, so every query reports the price as unavailable. */
const NO_PRICE: CatalogPriceSource = { priceOf: () => undefined };

/** A catalog that answers only the allowance provider's model, with the four catalog amounts. */
const CODEX_PRICE_SOURCE: CatalogPriceSource = {
	priceOf: (provider, model) =>
		provider === "plan-provider" && model === "codex-model" ? CODEX_PRICE : undefined,
};

/**
 * The harness's own model prices one case hands the framework: the allowance provider's model at its
 * own four amounts, a price for the monetary provider's model (which the maintained data, not the
 * harness, must win for), and nothing for anything else. The amounts are this suite's own numbers.
 */
const HARNESS_PRICES: CatalogPriceSource = {
	priceOf: (provider, model) => {
		if (provider === "plan-provider" && model === "codex-model") return CODEX_PRICE;
		if (provider === "official" && model === "model-alpha") {
			return { currency: "USD", unit: "USD per million tokens", amounts: { input: 99, output: 99, cacheRead: 99 } };
		}
		return undefined;
	},
};

const HARNESS = "probe-harness";
const MAIN: SessionFacts = { sessionId: "session-main", kind: "main", name: "主会话", unavailable: [] };
const OWNER: OwnerReference = { kind: "owner", key: "main:display" };
const CONSUMPTION_FILE = "consumption.json";

/** Every root this file created, removed after each case. */
const roots: string[] = [];

interface BoundDisplay {
	readonly runtime: ModelCostRuntime;
	readonly double: PortDouble;
	/** The document the extension saves into. */
	readonly consumptionFile: string;
}

/** One record of a baseline document, as the schema writes it. */
function record(
	id: string,
	parent: string | null,
	own: Record<string, Record<string, unknown>>,
): Record<string, unknown> {
	return { id, name: id, parent, saveVersion: 1, own };
}

/** A baseline document holding exactly the records a case needs. */
function baseline(sessions: readonly Record<string, unknown>[]): ConsumptionDocument {
	return {
		schemaVersion: 1,
		periodId: "period-display",
		start: "2026-10-01T00:00:00.000Z",
		holiday: false,
		harnesses: { [HARNESS]: { sessions: sessions as unknown as ConsumptionDocument["harnesses"][string]["sessions"] } },
	};
}

/**
 * Binds the real extension over one baseline document and loads it through the real initialization.
 *
 * The runtime is built by a factory — the same shape the OMP harness assembly uses — from the
 * context the framework hands it, so the harness's own model prices travel the production route:
 * the port reports them, the framework hands them to the factory, and the factory hands them to the
 * runtime that composes them with the maintained data.
 */
async function bindDisplay(options: {
	readonly baseline: ConsumptionDocument;
	/** The harness's own model prices, as its adapter would report them. */
	readonly modelPrices?: CatalogPriceSource;
}): Promise<BoundDisplay> {
	const root = mkdtempSync(path.join(tmpdir(), "model-cost-display-"));
	roots.push(root);
	const consumptionFile = path.join(root, CONSUMPTION_FILE);
	writeFileSync(consumptionFile, JSON.stringify(options.baseline), "utf8");
	let runtime: ModelCostRuntime | undefined;
	const double = portDouble({
		...(options.modelPrices === undefined ? {} : { modelPrices: options.modelPrices }),
	});
	double.bind(MODEL_COST, {
		// The declared configuration is read once per extension per process — the framework's own rule —
		// so this reader only answers the declaration; each case's runtime reads its own root below.
		config: { reader: () => `storageDir: ${root}\nbalanceTtlMs: 30000\n` },
		factory: context => {
			runtime = createModelCostRuntime({
				config: { storageDir: root },
				configDirectory: root,
				userHomeDirectory: root,
				harness: HARNESS,
				data: DATA,
				// The harness's own model prices travel the production route: the port reports them, the
				// framework hands them to this factory, and the factory hands them to the runtime.
				...(context.modelPrices === undefined ? {} : { modelPrices: context.modelPrices }),
			});
			return runtime.implementation;
		},
	});
	double.deliverSession(OWNER, { session: MAIN });
	await double.initiateRun(OWNER);
	return { runtime: runtime as ModelCostRuntime, double, consumptionFile };
}

/** One turn of the event loop, so a case can wait for a save's own asynchronous publish. */
function nextTick(): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>();
	setImmediate(resolve);
	return promise;
}

/** The document the extension published, once it holds the version the case expects. */
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

/** One started request of an actual session, as an adapter delivers it. */
function startedAt(session: SessionFacts, provider: string, model: string, at: number): TurnSignal {
	return { kind: "request_started", session, at, provider, model };
}

/** One settled response, with the usage the harness reported. */
function settled(session: SessionFacts, at: number, usage: TurnUsage): TurnSignal {
	return { kind: "response_settled", session, at, outcome: "completed", readings: [usage] };
}

afterEach(() => {
	while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true });
});

/**
 * The mixed tree one case builds. `session-sub` is token-only itself while the main session holds
 * the two currencies, and `session-grand` hangs off the subagent — so the main tree the target's
 * display must aggregate is main + sub + grand, each contribution once.
 *
 * Hand-written amounts: 0.05 CNY on the main session's monetary model, 0.02 USD on the allowance
 * model, 0.5 CNY on the grandchild's monetary model.
 */
const MIXED = baseline([
	record("session-main", null, {
		official: {
			"model-alpha": {
				tokens: { input: 1000, cacheRead: 2000, cacheWrite: 0, output: 3000 },
				costCny: 0.05,
			},
		},
		"plan-provider": {
			"codex-model": {
				tokens: { input: 400, cacheRead: 100, cacheWrite: 50, output: 200 },
				referenceCostUsd: 0.02,
			},
		},
	}),
	record("session-sub", "session-main", {
		"go-provider": { "model-alpha": { tokens: { input: 10, cacheRead: 20, cacheWrite: 0, output: 30 } } },
	}),
	record("session-grand", "session-sub", {
		official: { "model-beta": { tokens: { input: 7, cacheRead: 0, cacheWrite: 0, output: 0 }, costCny: 0.5 } },
	}),
]);

describe("the mixed tree keeps both currencies and the tokens apart (P7)", () => {
	test("a token-only target's main tree still carries the CNY cost and the USD reference separately", async () => {
		const { runtime } = await bindDisplay({ baseline: MIXED });
		const display = runtime.presentation.of({
			sessionId: "session-sub",
			provider: "go-provider",
			model: "model-alpha",
		});

		// The target's own mode, from the data's exact provider/model pair.
		expect(display.mode).toBe("token-only");

		// The tree is the whole main tree — main, the subagent and the grandchild — with each
		// contribution counted once, and the two currencies stay two fields: 0.05 + 0.5 CNY, 0.02 USD.
		expect(display.tree.costCny).toBe(0.55);
		expect(display.tree.referenceCostUsd).toBe(0.02);
		expect(display.tree.tokens).toEqual({ input: 1417, cacheRead: 2120, cacheWrite: 50, output: 3230 });
		expect(display.tree.sum).toBe(6817);

		// The token-only target shows no amount and no fee-structure ratio of its own, while the tree's
		// known contributions above are exactly what the current mode did not erase.
		expect(display.current.costCny).toBeUndefined();
		expect(display.current.referenceCostUsd).toBeUndefined();
		expect(display.current.referenceRatio).toBeUndefined();
	});
});

describe("a mode without an amount policy shows no amount of its own (P8)", () => {
	/** A record whose token-only and hidden entries carry amounts no policy of theirs ever produced. */
	const HOSTILE = baseline([
		record("session-sub", null, {
			"go-provider": {
				"model-alpha": {
					tokens: { input: 2000, cacheRead: 1000, cacheWrite: 0, output: 1000 },
					costCny: 9.99,
					referenceCostUsd: 8.88,
				},
			},
			official: {
				"model-unlisted": {
					tokens: { input: 4, cacheRead: 0, cacheWrite: 0, output: 6 },
					costCny: 7.77,
				},
			},
		}),
	]);

	test("a token-only target keeps its approved usage fields and shows no amount or ratio", async () => {
		const { runtime } = await bindDisplay({ baseline: HOSTILE });
		const display = runtime.presentation.of({
			sessionId: "session-sub",
			provider: "go-provider",
			model: "model-alpha",
		});

		expect(display.mode).toBe("token-only");
		// The approved usage fields: the four buckets, their Sum and the cache hit rate (1000 of 3000
		// conversation input tokens were cached, so a whole 33 percent).
		expect(display.current.tokens).toEqual({ input: 2000, cacheRead: 1000, cacheWrite: 0, output: 1000 });
		expect(display.current.sum).toBe(4000);
		expect(display.current.cacheHitRate).toBe(33);
		// And nothing an amount policy would have to exist for.
		expect(display.current.costCny).toBeUndefined();
		expect(display.current.referenceCostUsd).toBeUndefined();
		expect(display.current.referenceRatio).toBeUndefined();
	});

	test("a hidden target keeps its usage and shows neither amount nor ratio nor a display budget", async () => {
		const { runtime } = await bindDisplay({ baseline: HOSTILE });
		const display = runtime.presentation.of({
			sessionId: "session-sub",
			provider: "official",
			model: "model-unlisted",
		});

		expect(display.mode).toBe("hidden");
		expect(display.current.tokens).toEqual({ input: 4, cacheRead: 0, cacheWrite: 0, output: 6 });
		expect(display.current.sum).toBe(10);
		expect(display.current.costCny).toBeUndefined();
		expect(display.current.referenceCostUsd).toBeUndefined();
		expect(display.current.referenceRatio).toBeUndefined();
		expect(display.budget).toBeUndefined();
	});
});

describe("the fixed display budget is a display fact of the mode (P10)", () => {
	test("DeepSeek and its Go ids share 450K, Codex carries 272K, and hidden has none", async () => {
		const { runtime } = await bindDisplay({ baseline: MIXED, modelPrices: CODEX_PRICE_SOURCE });
		const budgetOf = (provider: string, model: string): number | undefined =>
			runtime.presentation.of({ sessionId: "session-main", provider, model }).budget?.tokens;

		expect(budgetOf("official", "model-alpha")).toBe(450_000);
		expect(budgetOf("go-provider", "model-alpha")).toBe(450_000);
		expect(budgetOf("plan-provider", "codex-model")).toBe(272_000);
		expect(budgetOf("official", "model-unlisted")).toBeUndefined();
	});

	test("the budget is exceeded only above its own figure, and never becomes a limit of its own", async () => {
		const { runtime } = await bindDisplay({ baseline: MIXED });
		const at = (contextTokens: number) =>
			runtime.presentation.of({
				sessionId: "session-main",
				provider: "official",
				model: "model-alpha",
				contextTokens,
			}).budget;

		expect(at(449_999)).toEqual({ tokens: 450_000, exceeded: false });
		expect(at(450_000)).toEqual({ tokens: 450_000, exceeded: false });
		expect(at(450_001)).toEqual({ tokens: 450_000, exceeded: true });
	});
});

describe("the fee-structure reference ratio is derived from the model's current price (P25)", () => {
	/** A monetary record whose own consumption the ratio is computed over, next to its literal cost. */
	const MONETARY = baseline([
		record("session-main", null, {
			official: {
				"model-alpha": {
					tokens: { input: 2000, cacheRead: 1000, cacheWrite: 0, output: 1000 },
					costCny: 0.25,
				},
			},
		}),
	]);

	test("a monetary model's three priced buckets normalize to the data's off-peak weights", async () => {
		const { runtime } = await bindDisplay({ baseline: MONETARY });
		const display = runtime.presentation.of({
			sessionId: "session-main",
			provider: "official",
			model: "model-alpha",
		});

		// 1000·0.5 = 500, 2000·2 = 4000, 1000·8 = 8000: of 12500 that is exactly 4:32:64.
		expect(display.current.referenceRatio).toEqual({
			currency: "XTS",
			parts: [
				{ bucket: "cacheRead", percent: 4 },
				{ bucket: "input", percent: 32 },
				{ bucket: "output", percent: 64 },
			],
		});
		// The already-accumulated amount is not re-priced by the ratio's own price.
		expect(display.current.costCny).toBe(0.25);
	});

	test("percentages that do not divide evenly are apportioned to sum to exactly 100", async () => {
		const { runtime } = await bindDisplay({ baseline: MIXED });
		const display = runtime.presentation.of({
			sessionId: "session-main",
			provider: "official",
			model: "model-alpha",
		});

		// 2000·0.5 = 1000, 1000·2 = 2000, 3000·8 = 24000: of 27000 that is 3.703…/7.407…/88.888…
		// percent, which rounds — by largest remainder — to 4:7:89 and not to 3:7:88 or 4:8:88.
		expect(display.current.referenceRatio).toEqual({
			currency: "XTS",
			parts: [
				{ bucket: "cacheRead", percent: 4 },
				{ bucket: "input", percent: 7 },
				{ bucket: "output", percent: 89 },
			],
		});
	});

	test("an allowance model uses the catalog's four amounts, cache write included", async () => {
		const { runtime } = await bindDisplay({ baseline: MIXED, modelPrices: CODEX_PRICE_SOURCE });
		const display = runtime.presentation.of({
			sessionId: "session-main",
			provider: "plan-provider",
			model: "codex-model",
		});

		// 100·1 = 100, 400·1 = 400, 50·2 = 100, 200·2 = 400: of 1000 that is exactly 10:40:10:40.
		expect(display.current.referenceRatio).toEqual({
			currency: "USD",
			parts: [
				{ bucket: "cacheRead", percent: 10 },
				{ bucket: "input", percent: 40 },
				{ bucket: "cacheWrite", percent: 10 },
				{ bucket: "output", percent: 40 },
			],
		});
		// The reference amount the record already carries is untouched.
		expect(display.current.referenceCostUsd).toBe(0.02);
	});

	test("a model whose tier the data prices nowhere has no ratio, and another model's price is not borrowed", async () => {
		const unpriced = baseline([
			record("session-main", null, {
				official: {
					"model-unpriced": {
						tokens: { input: 2000, cacheRead: 1000, cacheWrite: 0, output: 1000 },
						costCny: 0.25,
					},
				},
			}),
		]);
		const { runtime } = await bindDisplay({ baseline: unpriced });
		const display = runtime.presentation.of({
			sessionId: "session-main",
			provider: "official",
			model: "model-unpriced",
		});

		expect(display.current.tokens).toEqual({ input: 2000, cacheRead: 1000, cacheWrite: 0, output: 1000 });
		expect(display.current.referenceRatio).toBeUndefined();
		// The unpriced usage keeps its tokens and its already-accumulated amount.
		expect(display.current.costCny).toBe(0.25);
	});

	test("an all-zero scope and a catalog answering nothing both leave the ratio unavailable", async () => {
		const zeros = baseline([
			record("session-main", null, {
				official: { "model-alpha": { tokens: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 } } },
			}),
		]);
		const zeroed = await bindDisplay({ baseline: zeros });
		expect(
			zeroed.runtime.presentation.of({ sessionId: "session-main", provider: "official", model: "model-alpha" })
				.current.referenceRatio,
		).toBeUndefined();

		const { runtime } = await bindDisplay({ baseline: MIXED, modelPrices: NO_PRICE });
		const display = runtime.presentation.of({
			sessionId: "session-main",
			provider: "plan-provider",
			model: "codex-model",
		});
		// The accumulated reference amount is neither a price source nor a ratio.
		expect(display.current.referenceCostUsd).toBe(0.02);
		expect(display.current.referenceRatio).toBeUndefined();
	});
});

describe("the reference channel's amount is the harness's own price, fixed at the request's start (P7)", () => {
	/**
	 * An off-peak instant of the data's own pricing zone (Wednesday 13:00 Beijing), so the monetary
	 * amount below is the data's off-peak tier price and nothing about it depends on the wall clock.
	 */
	const OFF_PEAK = Date.UTC(2026, 9, 14, 5, 0, 0);

	/** The reference case's usage, and the amount the harness's own price makes of it. */
	const REFERENCE_USAGE: TurnUsage = { input: 400, cacheRead: 100, cacheWrite: 50, output: 200, totalTokens: 750 };
	/** 400·1 + 100·1 + 50·2 + 200·2 = 1,000 of a million, at the `CODEX_PRICE` fixture's own amounts. */
	const REFERENCE_USD = 0.001;

	/** The monetary case's usage: the data's alpha tier over these tokens is 10,500 of a million. */
	const MONETARY_USAGE: TurnUsage = { input: 1000, cacheRead: 1000, cacheWrite: 0, output: 1000, totalTokens: 3000 };

	/** A baseline document with no consumption at all: every amount below is accounted here. */
	const EMPTY = baseline([]);

	test("an allowance request adds the reference amount the harness prices it at, and every view reads it", async () => {
		const { runtime, double, consumptionFile } = await bindDisplay({ baseline: EMPTY, modelPrices: HARNESS_PRICES });
		double.deliverTurn(startedAt(MAIN, "plan-provider", "codex-model", OFF_PEAK), { owner: OWNER });
		double.deliverTurn(settled(MAIN, OFF_PEAK + 1_000, REFERENCE_USAGE), { owner: OWNER });

		// The session's own consumption: the fixture tokens and the hand-computed reference amount, in
		// the dollar bucket alone — this channel has no CNY amount policy to put one in.
		expect(runtime.view.own(MAIN.sessionId)).toEqual({
			"plan-provider": {
				"codex-model": {
					tokens: { input: 400, cacheRead: 100, cacheWrite: 50, output: 200 },
					referenceCostUsd: REFERENCE_USD,
				},
			},
		});

		const display = runtime.presentation.of({
			sessionId: MAIN.sessionId,
			provider: "plan-provider",
			model: "codex-model",
		});
		expect(display.mode).toBe("allowance");
		expect(display.current.referenceCostUsd).toBe(REFERENCE_USD);
		expect(display.current.costCny).toBeUndefined();
		expect(display.tree.referenceCostUsd).toBe(REFERENCE_USD);
		// The four amounts the harness states are the ratio's own structure, cache write included.
		expect(display.current.referenceRatio).toEqual({
			currency: "USD",
			parts: [
				{ bucket: "cacheRead", percent: 10 },
				{ bucket: "input", percent: 40 },
				{ bucket: "cacheWrite", percent: 10 },
				{ bucket: "output", percent: 40 },
			],
		});

		// The Round's end publishes the same record the view holds.
		double.deliverRound(OWNER, { event: { kind: "round_start" }, session: MAIN });
		double.deliverRound(OWNER, { event: { kind: "round_end" }, session: MAIN });
		const document = await savedDocument(
			consumptionFile,
			candidate => candidate.harnesses[HARNESS]?.sessions[0]?.saveVersion === 1,
		);
		expect(document.harnesses[HARNESS]?.sessions[0]?.own).toEqual({
			"plan-provider": {
				"codex-model": {
					tokens: { input: 400, cacheRead: 100, cacheWrite: 50, output: 200 },
					referenceCostUsd: REFERENCE_USD,
				},
			},
		});
	});

	test("the maintained data still prices the models it names, whatever the harness also states", async () => {
		const { runtime } = await bindDisplay({ baseline: MIXED, modelPrices: HARNESS_PRICES });

		// `official/model-alpha` is priced by the maintained data *and* by this harness catalog; the
		// data's own off-peak tier is what the ratio is valued with, in the data's own currency. The
		// tokens are the mixed baseline's, whose priced buckets are 1000·0.5, 1000·2 and 3000·8 of
		// 27000 — the same 4:7:89 the monetary ratio case derives — rather than the harness's own
		// three equal 99-per-million amounts, which would normalize to whole thirds.
		expect(
			runtime.presentation.of({ sessionId: "session-main", provider: "official", model: "model-alpha" }).current
				.referenceRatio,
		).toEqual({
			currency: "XTS",
			parts: [
				{ bucket: "cacheRead", percent: 4 },
				{ bucket: "input", percent: 7 },
				{ bucket: "output", percent: 89 },
			],
		});
	});

	test("a channel the harness states no price for keeps its tokens, adds no amount and reports nothing", async () => {
		const { runtime, double } = await bindDisplay({ baseline: EMPTY, modelPrices: NO_PRICE });
		double.deliverTurn(startedAt(MAIN, "plan-provider", "codex-model", OFF_PEAK), { owner: OWNER });
		const boundary = double.deliverTurn(settled(MAIN, OFF_PEAK + 1_000, REFERENCE_USAGE), { owner: OWNER });

		expect(runtime.view.own(MAIN.sessionId)).toEqual({
			"plan-provider": {
				"codex-model": { tokens: { input: 400, cacheRead: 100, cacheWrite: 50, output: 200 } },
			},
		});
		// An amount that was never stated is not a missing price of a policy this channel has: the
		// operator is told nothing about an error that did not happen, and no zero amount is written.
		expect(boundary.feedback).toEqual([]);
		const display = runtime.presentation.of({
			sessionId: MAIN.sessionId,
			provider: "plan-provider",
			model: "codex-model",
		});
		expect(display.current.tokens).toEqual({ input: 400, cacheRead: 100, cacheWrite: 50, output: 200 });
		expect(display.current.referenceCostUsd).toBeUndefined();
		expect(display.current.referenceRatio).toBeUndefined();
	});

	test("the amount was fixed at the request's start: a price that disappears afterwards is not read again", async () => {
		// A harness catalog that answers the request-start query once and states nothing afterwards: the
		// amount below can only have been anchored at the start, because a later query would find no
		// price at all.
		let answers = 0;
		const once: CatalogPriceSource = {
			priceOf: () => (answers += 1) === 1 ? CODEX_PRICE : undefined,
		};
		const { runtime, double } = await bindDisplay({ baseline: EMPTY, modelPrices: once });
		double.deliverTurn(startedAt(MAIN, "plan-provider", "codex-model", OFF_PEAK), { owner: OWNER });
		double.deliverTurn(settled(MAIN, OFF_PEAK + 1_000, REFERENCE_USAGE), { owner: OWNER });

		expect(answers).toBe(1);
		expect(runtime.view.own(MAIN.sessionId)?.["plan-provider"]?.["codex-model"]?.referenceCostUsd).toBe(REFERENCE_USD);
	});

	test("one session's two channels keep both currencies, and a switch shows the other without erasing it", async () => {
		const { runtime, double, consumptionFile } = await bindDisplay({ baseline: EMPTY, modelPrices: HARNESS_PRICES });
		// A CNY request at the data's own off-peak tier, then a reference request: each amount is its own
		// channel's, anchored at its own request's start, and neither is converted into the other.
		double.deliverTurn(startedAt(MAIN, "official", "model-alpha", OFF_PEAK), { owner: OWNER });
		double.deliverTurn(settled(MAIN, OFF_PEAK + 1_000, MONETARY_USAGE), { owner: OWNER });
		double.deliverTurn(startedAt(MAIN, "plan-provider", "codex-model", OFF_PEAK + 2_000), { owner: OWNER });
		double.deliverTurn(settled(MAIN, OFF_PEAK + 3_000, REFERENCE_USAGE), { owner: OWNER });

		// 1000·2 + 1000·0.5 + 1000·8 = 10,500 of a million, in CNY; the reference request is its own $0.001.
		expect(runtime.view.own(MAIN.sessionId)).toEqual({
			official: {
				"model-alpha": {
					tokens: { input: 1000, cacheRead: 1000, cacheWrite: 0, output: 1000 },
					costCny: 0.0105,
				},
			},
			"plan-provider": {
				"codex-model": {
					tokens: { input: 400, cacheRead: 100, cacheWrite: 50, output: 200 },
					referenceCostUsd: REFERENCE_USD,
				},
			},
		});

		const reference = runtime.presentation.of({
			sessionId: MAIN.sessionId,
			provider: "plan-provider",
			model: "codex-model",
		});
		expect(reference.tree.costCny).toBe(0.0105);
		expect(reference.tree.referenceCostUsd).toBe(REFERENCE_USD);
		expect(reference.current.costCny).toBeUndefined();
		expect(reference.current.referenceCostUsd).toBe(REFERENCE_USD);

		// Switching back shows the other channel's own amount, and the tree still carries both: the
		// current mode never erases what the other channel really consumed.
		const monetary = runtime.presentation.of({
			sessionId: MAIN.sessionId,
			provider: "official",
			model: "model-alpha",
		});
		expect(monetary.current.costCny).toBe(0.0105);
		expect(monetary.current.referenceCostUsd).toBeUndefined();
		expect(monetary.tree.costCny).toBe(0.0105);
		expect(monetary.tree.referenceCostUsd).toBe(REFERENCE_USD);

		// And the document the Round's end publishes holds the same two currencies apart.
		double.deliverRound(OWNER, { event: { kind: "round_start" }, session: MAIN });
		double.deliverRound(OWNER, { event: { kind: "round_end" }, session: MAIN });
		const document = await savedDocument(
			consumptionFile,
			candidate => candidate.harnesses[HARNESS]?.sessions[0]?.saveVersion === 1,
		);
		expect(document.harnesses[HARNESS]?.sessions[0]?.own).toEqual({
			official: {
				"model-alpha": {
					tokens: { input: 1000, cacheRead: 1000, cacheWrite: 0, output: 1000 },
					costCny: 0.0105,
				},
			},
			"plan-provider": {
				"codex-model": {
					tokens: { input: 400, cacheRead: 100, cacheWrite: 50, output: 200 },
					referenceCostUsd: REFERENCE_USD,
				},
			},
		});
	});
});

describe("the target's own facts are reported as the host gave them", () => {
	test("an unavailable effort is a question mark rather than a borrowed value", async () => {
		const { runtime } = await bindDisplay({ baseline: MIXED });
		const known = runtime.presentation.of({
			sessionId: "session-main",
			provider: "official",
			model: "model-alpha",
			effort: "high",
			contextTokens: 1234,
			contextWindow: 64_000,
		});

		expect(known.effort).toBe("high");
		expect(known.context).toEqual({ tokens: 1234, window: 64_000 });
		expect(
			runtime.presentation.of({ sessionId: "session-main", provider: "official", model: "model-alpha" }).effort,
		).toBe("?");
	});
});
