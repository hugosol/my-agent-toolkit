/**
 * The Total a frontend reads while one session of a heterogeneous tree is viewed (P11, P21, P22; S2).
 *
 * The seam under test is the extension's read-only display result, reached the way a frontend reaches
 * it: the extension's real definition bound through the framework's public binding (the port double),
 * the runtime the production factory builds from the very context the framework hands one, and
 * `runtime.presentation.of(target)` — the viewed session and its own current provider/model — as the
 * only thing read. No private field, no second accumulation and no formatting helper is touched.
 *
 * The tree is self-made and deliberately heterogeneous: main, a subagent, a grandchild and a sibling,
 * four sessions whose own consumptions sit on four different provider/model pairs in three modes. The
 * whole main tree's own total, Cost and Ref are therefore deliberately different from every single
 * target's own current-model fields, which is what a case can tell a scoped figure from an unscoped
 * one by; the total is a computed figure of each scope rather than a column any row writes (P23).
 * Every expectation below is a hand-computed literal or a relation between two of them; none is
 * computed by calling the implementation.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { MODEL_COST } from "../../../extensions/model-cost/definition";
import type { ConsumptionDocument } from "../../../extensions/model-cost/shared-logic/foundation/session/consumption-document"
import type { ModelPricingData } from "../../../extensions/model-cost/shared-logic/business/pricing/model-data";
import type { ModelCostRuntime } from "../../../extensions/model-cost/shared-logic/runtime";
import { createModelCostRuntime, modelCostImplementation } from "../../../extensions/model-cost/shared-logic/runtime";
import type { CatalogPrice, CatalogPriceSource } from "../../../framework/interface/provider";
import type { SessionFacts } from "../../../framework/interface/session";
import type { OwnerReference } from "../../../framework/interface/state";
import { portDouble } from "../../framework/support/harness-port-double";

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
		"go-provider": { "model-alpha": { mode: "token-only" } },
	},
};

/** The four amounts one case's harness catalog states for the allowance channel's model, in USD. */
const CODEX_PRICE: CatalogPrice = {
	currency: "USD",
	unit: "USD per million tokens",
	amounts: { input: 1, cacheRead: 1, cacheWrite: 2, output: 2 },
};

/** A harness catalog that states that one allowance pair and nothing else. */
const CODEX_PRICE_SOURCE: CatalogPriceSource = {
	priceOf: (provider, model) =>
		provider === "plan-provider" && model === "codex-model" ? CODEX_PRICE : undefined,
};

const HARNESS = "probe-harness";
const MAIN: SessionFacts = { sessionId: "session-main", kind: "main", name: "主会话", unavailable: [] };
const OWNER: OwnerReference = { kind: "owner", key: "main:viewed-total" };
const CONSUMPTION_FILE = "consumption.json";

/** Every root this file created, removed after each case. */
const roots: string[] = [];

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
		periodId: "period-viewed-total",
		start: "2026-10-01T00:00:00.000Z",
		holiday: false,
		harnesses: { [HARNESS]: { sessions: sessions as unknown as ConsumptionDocument["harnesses"][string]["sessions"] } },
	};
}

/**
 * The heterogeneous main tree every case views a part of.
 *
 * Four actual sessions, each with its own hand-written consumption:
 *
 * - `session-main` (no parent) holds `official/model-alpha` in CNY and `plan-provider/codex-model` in USD.
 * - `session-sub` (child of main) is *on* `official/model-beta` while it still carries an earlier
 *   `go-provider/model-alpha` entry — so its own current-model scope is one of its two own pairs.
 * - `session-grand` (child of sub) holds its own `official/model-alpha` entry.
 * - `session-sibling` (child of main) holds `go-provider/model-alpha` and `plan-provider/codex-model`.
 *
 * The whole-tree figures below therefore mix three modes and two currencies, and every one of them
 * differs from each target's own current-model fields.
 */
const HETEROGENEOUS = baseline([
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
		official: {
			"model-beta": {
				tokens: { input: 100, cacheRead: 0, cacheWrite: 0, output: 50 },
				costCny: 0.25,
			},
		},
		"go-provider": {
			"model-alpha": { tokens: { input: 10, cacheRead: 20, cacheWrite: 0, output: 30 } },
		},
	}),
	record("session-grand", "session-sub", {
		official: {
			"model-alpha": {
				tokens: { input: 7, cacheRead: 0, cacheWrite: 0, output: 0 },
				costCny: 0.5,
			},
		},
	}),
	record("session-sibling", "session-main", {
		"go-provider": {
			"model-alpha": { tokens: { input: 5, cacheRead: 5, cacheWrite: 0, output: 5 } },
		},
		"plan-provider": {
			"codex-model": {
				tokens: { input: 60, cacheRead: 20, cacheWrite: 10, output: 40 },
				referenceCostUsd: 0.03,
			},
		},
	}),
]);

/**
 * The whole main tree's own figures, hand-added bucket by bucket from the four records above:
 * `input` 1000+400+100+10+7+5+60, `cacheRead` 2000+100+0+20+0+5+20, `cacheWrite` 0+50+0+0+0+0+10,
 * `output` 3000+200+50+30+0+5+40; `costCny` 0.05+0.25+0.5; `referenceCostUsd` 0.02+0.03.
 */
const TREE_TOKENS = { input: 1582, cacheRead: 2145, cacheWrite: 60, output: 3325 };
const TREE_SUM = 7112;
const TREE_COST_CNY = 0.8;
const TREE_REFERENCE_USD = 0.05;

/**
 * Binds the real extension over one baseline document and loads it through the real initialization.
 *
 * The runtime is built by a factory — the same shape the OMP harness assembly uses — from the context
 * the framework hands it, so the framework's public binding and the production factory are both in
 * the path the case reads through.
 */
async function bindView(options: {
	readonly baseline?: ConsumptionDocument;
	/** The harness's own model prices, as its adapter would report them. */
	readonly modelPrices?: CatalogPriceSource;
} = {}): Promise<ModelCostRuntime> {
	const root = mkdtempSync(path.join(tmpdir(), "model-cost-viewed-total-"));
	roots.push(root);
	writeFileSync(path.join(root, CONSUMPTION_FILE), JSON.stringify(options.baseline ?? HETEROGENEOUS), "utf8");
	const double = portDouble({
		...(options.modelPrices === undefined ? {} : { modelPrices: options.modelPrices }),
	});
	let runtime: ModelCostRuntime | undefined;
	double.bind(MODEL_COST, {
		config: { reader: () => `storageDir: ${root}\nbalanceTtlMs: 30000\ncodexQuotaTtlMs: 15000\n` },
		factory: modelCostImplementation(context => {
			runtime = createModelCostRuntime({
				config: { storageDir: root },
				configDirectory: root,
				userHomeDirectory: root,
				harness: HARNESS,
				data: DATA,
				session: context.session,
				...(context.modelPrices === undefined ? {} : { modelPrices: context.modelPrices }),
			});
			return runtime;
		}),
	});
	double.deliverSession(OWNER, { session: MAIN });
	await double.initiateRun(OWNER);
	return runtime as ModelCostRuntime;
}

afterEach(() => {
	while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true });
});

describe("the Total's current-model fields are the viewed session's own current model (P21)", () => {
	test("viewing a sibling shows only that sibling's own current pair, while its other model stays out", async () => {
		const runtime = await bindView();
		const display = runtime.presentation.of({
			sessionId: "session-sibling",
			provider: "go-provider",
			model: "model-alpha",
		});

		// The target's own current provider/model, alone: the sibling's own plan-provider entry, its
		// parent's two pairs and its grandchild's pair are all in the record set and none of them is
		// part of these fields.
		expect(display.current.tokens).toEqual({ input: 5, cacheRead: 5, cacheWrite: 0, output: 5 });
		expect(display.current.sum).toBe(15);
		// 5 cached of the 10 conversation input tokens: a whole 50 percent, not a share of anything else.
		expect(display.current.cacheHitRate).toBe(50);
		// token-only is a channel with no amount policy at all, so no amount and no ratio of its own.
		expect(display.current.costCny).toBeUndefined();
		expect(display.current.referenceCostUsd).toBeUndefined();
		expect(display.current.referenceRatio).toBeUndefined();
		// The figure the case turns on: the viewed target's own total is deliberately not the tree's.
		expect(display.current.sum).toBe(15);
		expect(display.current.sum).not.toBe(display.tree.sum);
	});

	test("a viewed session's own current model is one of its pairs: switching it changes only the current fields", async () => {
		const runtime = await bindView();

		// `session-sub` is on the monetary official/model-beta pair; its own go-provider entry is an
		// earlier model of the same session and belongs to neither the current fields nor another view.
		const beta = runtime.presentation.of({ sessionId: "session-sub", provider: "official", model: "model-beta" });
		expect(beta.mode).toBe("monetary");
		expect(beta.current.tokens).toEqual({ input: 100, cacheRead: 0, cacheWrite: 0, output: 50 });
		expect(beta.current.sum).toBe(150);
		// Nothing was read of the conversation input, which is a known zero rather than an absent rate.
		expect(beta.current.cacheHitRate).toBe(0);
		expect(beta.current.costCny).toBe(0.25);
		// 100·10 and 50·20 of 2000: the beta tier's own two priced buckets, an even 0:50:50.
		expect(beta.current.referenceRatio).toEqual({
			currency: "XTS",
			parts: [
				{ bucket: "cacheRead", percent: 0 },
				{ bucket: "input", percent: 50 },
				{ bucket: "output", percent: 50 },
			],
		});

		// The same session with its other model as the current one: different current fields, the same tree.
		const go = runtime.presentation.of({ sessionId: "session-sub", provider: "go-provider", model: "model-alpha" });
		expect(go.mode).toBe("token-only");
		expect(go.current.tokens).toEqual({ input: 10, cacheRead: 20, cacheWrite: 0, output: 30 });
		expect(go.current.sum).toBe(60);
		expect(go.current.costCny).toBeUndefined();
		expect(go.current.referenceRatio).toBeUndefined();
		expect(go.tree).toEqual(beta.tree);
	});

	test("a ratio is the viewed model's own price, never another model's and never the saved amount", async () => {
		const runtime = await bindView({ modelPrices: CODEX_PRICE_SOURCE });

		// `official/model-alpha` at its own tier: 2000·0.5, 1000·2 and 3000·8 of 27000, the same
		// 4:7:89 the display's other suites derive — and not model-beta's even 0:50:50 above, though
		// both pairs are priced by the same data and both sessions are in the same tree.
		const alpha = runtime.presentation.of({ sessionId: "session-main", provider: "official", model: "model-alpha" });
		expect(alpha.current.referenceRatio).toEqual({
			currency: "XTS",
			parts: [
				{ bucket: "cacheRead", percent: 4 },
				{ bucket: "input", percent: 7 },
				{ bucket: "output", percent: 89 },
			],
		});
		// The already-accumulated amount the record carries is not re-priced by the ratio's own price.
		expect(alpha.current.costCny).toBe(0.05);

		// The allowance channel's ratio uses the catalog's four amounts over the viewed pair alone
		// (20·1, 60·1, 10·2, 40·2 of 180): 11.111…, 33.333…, 11.111… and 44.444…, which the largest
		// remainder apportions to 11:33:11:45 — a third, again different, structure.
		const sibling = runtime.presentation.of({
			sessionId: "session-sibling",
			provider: "plan-provider",
			model: "codex-model",
		});
		expect(sibling.mode).toBe("allowance");
		expect(sibling.current.tokens).toEqual({ input: 60, cacheRead: 20, cacheWrite: 10, output: 40 });
		expect(sibling.current.referenceCostUsd).toBe(0.03);
		expect(sibling.current.costCny).toBeUndefined();
		expect(sibling.current.referenceRatio).toEqual({
			currency: "USD",
			parts: [
				{ bucket: "cacheRead", percent: 11 },
				{ bucket: "input", percent: 33 },
				{ bucket: "cacheWrite", percent: 11 },
				{ bucket: "output", percent: 45 },
			],
		});
	});
});

describe("the Total's tree figures, Cost and Ref keep the whole main tree (P22)", () => {
	test("viewing a grandchild keeps its parent's and its uncle's consumption", async () => {
		const runtime = await bindView();
		const display = runtime.presentation.of({
			sessionId: "session-grand",
			provider: "official",
			model: "model-alpha",
		});

		// The target's own fields are its own single entry: 7 input tokens and its 0.5 CNY.
		expect(display.current.sum).toBe(7);
		expect(display.current.costCny).toBe(0.5);
		// The tree is still the whole main tree — the grandchild's own view does not narrow it to the
		// subtree it sits in, and the parent, the sibling branch and the root are all counted once.
		expect(display.tree.tokens).toEqual(TREE_TOKENS);
		expect(display.tree.sum).toBe(TREE_SUM);
		expect(display.tree.costCny).toBe(TREE_COST_CNY);
		expect(display.tree.referenceCostUsd).toBe(TREE_REFERENCE_USD);
		expect(display.tree.sum).not.toBe(display.current.sum);
	});

	test("every target of the tree reads the same tree figures, whichever session the view is on", async () => {
		const runtime = await bindView();
		const targets = [
			{ sessionId: "session-main", provider: "official", model: "model-alpha" },
			{ sessionId: "session-sub", provider: "official", model: "model-beta" },
			{ sessionId: "session-grand", provider: "official", model: "model-alpha" },
			{ sessionId: "session-sibling", provider: "go-provider", model: "model-alpha" },
			{ sessionId: "session-sibling", provider: "plan-provider", model: "codex-model" },
		] as const;

		// Switching the viewed target — across sessions, and across a session's own models — never
		// loses a parent, a sibling or a descendant: one tree, five times the same figures.
		for (const target of targets) {
			const tree = runtime.presentation.of(target).tree;
			expect(tree.tokens).toEqual(TREE_TOKENS);
			expect(tree.sum).toBe(TREE_SUM);
			expect(tree.costCny).toBe(TREE_COST_CNY);
			expect(tree.referenceCostUsd).toBe(TREE_REFERENCE_USD);
		}
		// And no target's own total is that figure: each current scope stays its own, hand-added per target.
		const currents = targets.map(target => runtime.presentation.of(target).current.sum);
		expect(currents).toEqual([6000, 150, 7, 15, 130]);
	});

	test("a token-only view keeps the tree's CNY Cost and USD Ref, so no mode fabricates a free tree", async () => {
		const runtime = await bindView();
		const tokenOnly = runtime.presentation.of({
			sessionId: "session-sibling",
			provider: "go-provider",
			model: "model-alpha",
		});
		expect(tokenOnly.mode).toBe("token-only");
		// The target's own channel has no amount policy, so it shows none — and the tree still carries
		// both currencies in their own fields: this is what "no current mode erases another channel's
		// known contribution" means for the Total line.
		expect(tokenOnly.current.costCny).toBeUndefined();
		expect(tokenOnly.current.referenceCostUsd).toBeUndefined();
		expect(tokenOnly.tree.costCny).toBe(TREE_COST_CNY);
		expect(tokenOnly.tree.referenceCostUsd).toBe(TREE_REFERENCE_USD);

		// A hidden view is the same story: the pair is not this extension's display, and the tree's
		// known amounts are still read for the main session it belongs to.
		const hidden = runtime.presentation.of({ sessionId: "session-sibling", provider: "unlisted", model: "no-such" });
		expect(hidden.mode).toBe("hidden");
		expect(hidden.tree.costCny).toBe(TREE_COST_CNY);
		expect(hidden.tree.referenceCostUsd).toBe(TREE_REFERENCE_USD);
		expect(hidden.budget).toBeUndefined();
	});
});

describe("the target's own facts come from the viewed session and are never borrowed (P11)", () => {
	test("the effort is what the target published, and a target that published none is a question mark", async () => {
		const runtime = await bindView();
		const sub = runtime.presentation.of({
			sessionId: "session-sub",
			provider: "official",
			model: "model-beta",
			effort: "high",
			contextTokens: 1234,
			contextWindow: 64_000,
		});
		const main = runtime.presentation.of({
			sessionId: "session-main",
			provider: "official",
			model: "model-alpha",
			effort: "low",
			contextTokens: 4321,
			contextWindow: 128_000,
		});

		// Main and sub genuinely differ, and each view reports its own target's facts rather than any
		// other session's: nothing here is read from a configuration or from the main session.
		expect(sub.effort).toBe("high");
		expect(sub.context).toEqual({ tokens: 1234, window: 64_000 });
		expect(main.effort).toBe("low");
		expect(main.context).toEqual({ tokens: 4321, window: 128_000 });

		// A fact the host could not obtain is a question mark, never the other session's value and never
		// a configured intent; a context the host could not measure is absent rather than zero.
		const unknown = runtime.presentation.of({ sessionId: "session-sub", provider: "official", model: "model-beta" });
		expect(unknown.effort).toBe("?");
		expect(unknown.context).toBeUndefined();
	});
});
