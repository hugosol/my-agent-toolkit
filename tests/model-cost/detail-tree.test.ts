/**
 * The entry's display preference, the `/budget detail` action that flips it, and the static agent
 * tree the detail form draws (P20, P23, P26, P29; S1, S2).
 *
 * The seam under test is production throughout: the extension's real definition bound through the
 * framework's public binding (the port double, `tests/framework/support/harness-port-double.ts`), the
 * command the framework really registered driven the way an operator drives it, and
 * `runtime.presentation.of(target)` — the read-only display result a frontend reads. No private
 * field, no second accumulation and no formatting helper of the implementation is reached.
 *
 * The document the cases bind over is self-made and deliberately heterogeneous: a main session whose
 * own consumption sits on two provider/model pairs in two modes, a child on a third pair, a
 * grandchild and a sibling — so a row's own scope, its name and its depth can each be told apart from
 * every other row's. Every expectation below is a hand-computed literal from those records.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { MODEL_COST } from "../../extensions/model-cost/definition";
import type { ConsumptionDocument } from "../../extensions/model-cost/shared-logic/accounting/consumption-document";
import type { ModelPricingData } from "../../extensions/model-cost/shared-logic/pricing/model-data";
import { type AgentTreeRow, type ConsumptionFields, fieldsColumns } from "../../extensions/model-cost/shared-logic/presentation/display";
import type { ModelCostRuntime } from "../../extensions/model-cost/shared-logic/runtime";
import { createModelCostRuntime } from "../../extensions/model-cost/shared-logic/runtime";
import type { CatalogPrice, CatalogPriceSource, OwnerReference, SessionFacts } from "../../framework/core/protocol";
import { type PortDouble, portDouble } from "../framework/support/harness-port-double";

/** The self-made pricing data: one monetary tier, one token-only pair and one allowance provider. */
const DATA: ModelPricingData = {
	currency: "XTS",
	unit: "XTS per million tokens",
	peakMultiplier: 3,
	zoneOffsetMinutes: 8 * 60,
	peakWindows: [{ fromMinute: 9 * 60, toMinute: 12 * 60 }],
	tiers: { alpha: { input: 2, cacheRead: 0.5, output: 8 } },
	allowanceProviders: ["plan-provider"],
	models: {
		official: {
			"model-alpha": { mode: "monetary", tier: "alpha" },
			"model-beta": { mode: "monetary", tier: "alpha" },
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
	priceOf: (provider, model) => (provider === "plan-provider" && model === "codex-model" ? CODEX_PRICE : undefined),
};

/** A harness catalog that states a price for every pair it is asked about, in USD. */
const EVERY_PAIR_USD: CatalogPriceSource = {
	priceOf: () => ({
		currency: "USD",
		unit: "USD per million tokens",
		amounts: { input: 1, cacheRead: 1, cacheWrite: 2, output: 2 },
	}),
};

const HARNESS = "probe-harness";
const MAIN: SessionFacts = { sessionId: "session-main", kind: "main", name: "主会话", unavailable: [] };
const OWNER: OwnerReference = { kind: "owner", key: "main:detail" };
const CONSUMPTION_FILE = "consumption.json";

/** The main session's own current pair, which every target below is read against. */
const MAIN_TARGET = { sessionId: "session-main", provider: "official", model: "model-alpha" } as const;

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

/**
 * The tree every case reads: four actual sessions, each with its own hand-written consumption.
 *
 * `session-main` (no parent) holds `official/model-alpha` in CNY, `plan-provider/codex-model` in USD,
 * `unlisted-provider/no-such`, a pair this extension's data does not list at all, and
 * `go-provider/model-alpha`, the token-only pair the child runs on; `session-child` (its child) holds
 * that same token-only pair; `session-grand` sits below the child; `session-sibling` is the main
 * session's second child.
 */
const TREE = {
	schemaVersion: 1,
	periodId: "period-detail-tree",
	start: "2026-10-01T00:00:00.000Z",
	holiday: false,
	harnesses: {
		[HARNESS]: {
			sessions: [
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
					"unlisted-provider": {
						"no-such": { tokens: { input: 1, cacheRead: 0, cacheWrite: 0, output: 1 } },
					},
					"go-provider": {
						"model-alpha": { tokens: { input: 4, cacheRead: 6, cacheWrite: 0, output: 10 } },
					},
				}),
				record("session-child", "session-main", {
					"go-provider": {
						"model-alpha": { tokens: { input: 30, cacheRead: 20, cacheWrite: 0, output: 50 } },
					},
				}),
				record("session-grand", "session-child", {
					official: {
						"model-alpha": { tokens: { input: 7, cacheRead: 0, cacheWrite: 0, output: 0 }, costCny: 0.5 },
					},
				}),
				record("session-sibling", "session-main", {
					official: {
						"model-beta": { tokens: { input: 5, cacheRead: 5, cacheWrite: 0, output: 5 }, costCny: 0.1 },
					},
				}),
			],
		},
	},
} as unknown as ConsumptionDocument;

/** One bound instance and the double that drives it. */
interface Bound {
	readonly runtime: ModelCostRuntime;
	readonly double: PortDouble;
	/** The document this instance reads and writes, as the path the storage root holds it at. */
	readonly consumptionFile: string;
	/** Every provider request this instance made, as the URL the query built, in call order. */
	readonly sent: readonly string[];
	/** How many times the framework's factory ran for this binding: one business instance, or more. */
	factoryRuns(): number;
}

/** One counter the factory closure a case observes through holds. */
interface FactoryRuns {
	count: number;
}

/** The balance answer a watched case's provider returns, in the provider's documented shape. */
function balanceAnswer(total: string): Response {
	return new Response(
		JSON.stringify({
			is_available: true,
			balance_infos: [{ currency: "CNY", total_balance: total, granted_balance: "0.00", topped_up_balance: total }],
		}),
		{ status: 200, headers: { "content-type": "application/json" } },
	);
}

/**
 * Binds the real extension over one baseline document and loads it through the real initialization.
 *
 * The runtime is built by a factory — the same shape the OMP harness assembly uses — from the context
 * the framework hands it, so the framework's public binding and the production factory are both in
 * the path every case observes through. `watched` adds the two dependencies a case about the held
 * instance needs: the harness's provider access and the HTTP call this extension's queries really
 * make, substituted so the one startup query answers locally and is counted. The clock such a case
 * runs on is fixed, so the reading it holds can never cross its own success TTL mid-case.
 */
async function bind(
	options: {
		readonly document?: ConsumptionDocument;
		readonly modelPrices?: CatalogPriceSource;
		readonly watched?: boolean;
		/** An existing root to bind over, so two entries of one case read the very same storage. */
		readonly storageRoot?: string;
	} = {},
): Promise<Bound> {
	const root = options.storageRoot ?? mkdtempSync(path.join(tmpdir(), "model-cost-detail-tree-"));
	if (options.storageRoot === undefined) roots.push(root);
	const consumptionFile = path.join(root, CONSUMPTION_FILE);
	writeFileSync(consumptionFile, JSON.stringify(options.document ?? TREE), "utf8");
	const sent: string[] = [];
	const builds: FactoryRuns = { count: 0 };
	const double = portDouble({
		...(options.modelPrices === undefined ? {} : { modelPrices: options.modelPrices }),
	});
	let runtime: ModelCostRuntime | undefined;
	double.bind(MODEL_COST, {
		config: { reader: () => `storageDir: ${root}\nbalanceTtlMs: 30000\ncodexQuotaTtlMs: 15000\n` },
		factory: context => {
			builds.count += 1;
			runtime = createModelCostRuntime({
				config: { storageDir: root },
				configDirectory: root,
				userHomeDirectory: root,
				harness: HARNESS,
				data: DATA,
				...(context.modelPrices === undefined ? {} : { modelPrices: context.modelPrices }),
				...(options.watched === true
					? {
							// This host resolves access for the balance's own provider alone; the extension's other
							// provider query asks about no other provider and therefore sends nothing.
							providerAccess: {
								resolve: async (provider: string) =>
									provider === "deepseek"
										? { baseUrl: "https://host.example/v1", credential: "probe-key" }
										: undefined,
							},
							now: () => CLOCK,
							httpRequest: async (url: string) => {
								sent.push(url);
								return balanceAnswer("12.50");
							},
						}
					: {}),
			});
			return runtime.implementation;
		},
	});
	double.deliverSession(OWNER, { session: MAIN });
	// The host re-states the session's own facts — its latest name and direct parent — as a delivery of
	// its own; a boundary delivery carries the session it is about, and the name rides with the facts.
	double.deliverSession(OWNER, { event: { kind: "session_facts" }, session: MAIN });
	await double.initiateRun(OWNER);
	return { runtime: runtime as ModelCostRuntime, double, consumptionFile, sent, factoryRuns: () => builds.count };
}

/**
 * The instant every Turn of these cases begins at, on the process's own clock. It is 08:00 in the
 * data's own zone — an off-peak hour — and it is also the fixed clock a watched instance reads, so
 * the reading that instance holds can never cross its own success TTL while a case runs.
 */
const CLOCK = Date.parse("2026-10-01T00:00:00.000Z");

/** The child session's own facts: the subagent the main session spawned. */
const CHILD: SessionFacts = { sessionId: "session-child", kind: "sub", name: "子代理", unavailable: [] };

/**
 * One settled Turn of the child's own session, on the token-only pair that session runs: ten input
 * and twenty output tokens, for which this extension prices no amount at all.
 */
function settleChildTurn(double: PortDouble, at: number): void {
	double.deliverTurn(
		{ kind: "request_started", session: CHILD, at, provider: "go-provider", model: "model-alpha" },
		{ owner: OWNER },
	);
	double.deliverTurn(
		{
			kind: "response_settled",
			session: CHILD,
			at: at + 60_000,
			outcome: "completed",
			readings: [{ input: 10, output: 20, cacheRead: 0, cacheWrite: 0, totalTokens: 30 }],
		},
		{ owner: OWNER },
	);
}

/**
 * One settled Turn of the main session, on the monetary pair that session runs: ten input and ten
 * output tokens, priced by the data's own off-peak tier at the instant above.
 */
function settleMainTurn(double: PortDouble, at: number): void {
	double.deliverTurn(
		{ kind: "request_started", session: MAIN, at, provider: "official", model: "model-alpha" },
		{ owner: OWNER },
	);
	double.deliverTurn(
		{
			kind: "response_settled",
			session: MAIN,
			at: at + 60_000,
			outcome: "completed",
			readings: [{ input: 10, output: 10, cacheRead: 0, cacheWrite: 0, totalTokens: 20 }],
		},
		{ owner: OWNER },
	);
}

afterEach(() => {
	while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true });
});

describe("the detail action flips the entry preference at once, whatever state the session is in (P29)", () => {
	test("two invocations alternate the preference and each answers with the form now in effect", async () => {
		const bound = await bind();

		// The entry starts on the brief, which is what a restart answers too: the preference is this
		// instance's memory, and nothing on disk holds one.
		expect(bound.runtime.presentation.of(MAIN_TARGET).form).toBe("brief");

		const first = await bound.double.runToCompletion("budget", { args: "detail" });
		expect(first.feedback.map(notice => notice.level)).toEqual(["info"]);
		expect(bound.runtime.presentation.of(MAIN_TARGET).form).toBe("detail");

		// The argument is matched the way the framework matches every action name: trimmed, case-insensitive.
		const second = await bound.double.runToCompletion("budget", { args: "  DETAIL \n" });
		expect(second.feedback.map(notice => notice.level)).toEqual(["info"]);
		expect(bound.runtime.presentation.of(MAIN_TARGET).form).toBe("brief");

		// Each answer names the form the entry is now in, so the operator reads which one they got.
		expect(first.feedback[0]?.message).not.toBe(second.feedback[0]?.message);
		expect(first.feedback[0]?.message).toContain("detail");
		expect(second.feedback[0]?.message).toContain("brief");
	});

	test("a headless, a busy and an unreported entry all flip: nothing consults the UI, idle or a save", async () => {
		const states = [
			{ hasUI: true, idle: "idle" as const },
			{ hasUI: false, idle: "idle" as const },
			{ hasUI: false, idle: "busy" as const },
			{ hasUI: true, idle: "unreported" as const },
		];

		for (const state of states) {
			const bound = await bind();
			const run = await bound.double.runToCompletion("budget", { args: "detail", ...state });

			expect(run.feedback.map(notice => notice.level)).toEqual(["info"]);
			expect(bound.runtime.presentation.of(MAIN_TARGET).form).toBe("detail");
			// The action's own facts are what it consulted: it records no State value and publishes no
			// marker, because `detail` is entry memory rather than a State field or an owner effect.
			expect(run.persisted).toEqual([]);
			expect(run.markers).toEqual([]);
		}
	});

	test("the declaration offers `detail` alone: brief, on, off and a focused route are refused untouched", async () => {
		const bound = await bind();

		// The action table is the whole vocabulary: nothing here reaches business code, and the entry
		// stays where it was. `brief` and `detail on` are the two shapes the approved design does not
		// have; `on`/`off` would be a second toggle; a focused subagent route does not exist either.
		for (const args of ["brief", "detail on", "on", "off", "focused", "det"]) {
			const run = await bound.double.runToCompletion("budget", { args });
			expect(run.feedback.map(notice => notice.level)).toEqual(["error"]);
			expect(run.feedback[0]?.message).toContain("/budget");
			expect(run.feedback[0]?.message).toContain("detail");
			expect(bound.runtime.presentation.of(MAIN_TARGET).form).toBe("brief");
		}

		// The empty argument is the help an operator reads, not an action: it also leaves the entry alone.
		const help = await bound.double.runToCompletion("budget", { args: "" });
		expect(help.feedback.map(notice => notice.level)).toEqual(["info"]);
		expect(bound.runtime.presentation.of(MAIN_TARGET).form).toBe("brief");
	});

	test("a second entry over the same storage root answers the brief: the preference is neither persisted nor shared", async () => {
		const first = await bind();
		await first.double.runToCompletion("budget", { args: "detail" });
		expect(first.runtime.presentation.of(MAIN_TARGET).form).toBe("detail");

		// A later process over the very same storage root — a reload or a restart — starts on the brief:
		// nothing on that root holds a preference, and the first entry's own flip reaches nothing else.
		const second = await bind({ storageRoot: path.dirname(first.consumptionFile) });
		expect(second.runtime.presentation.of(MAIN_TARGET).form).toBe("brief");
		expect(second.factoryRuns()).toBe(1);
		expect(first.runtime.presentation.of(MAIN_TARGET).form).toBe("detail");
	});
});

describe("the detail form's static tree: the root's own models and one row per descendant (P23)", () => {
	test("the root by name, its own pairs one row each, descendants one row each by direct parent", async () => {
		const bound = await bind();
		const rows = bound.runtime.presentation.of(MAIN_TARGET).agentTree ?? [];

		// The whole list, in the order it is drawn: the root session by name, that session's own four
		// provider/model pairs, then its descendants depth-first — the child, the child's own child, and
		// the second child of the root. The root row carries no figures of its own: its consumption is
		// exactly the model rows below it, which is what keeps a root total from being counted twice.
		expect(rows.map(row => ({ kind: row.kind, name: row.name, depth: row.depth }))).toEqual([
			{ kind: "root", name: "主会话", depth: 0 },
			{ kind: "model", name: "official / model-alpha", depth: 1 },
			{ kind: "model", name: "plan-provider / codex-model", depth: 1 },
			{ kind: "model", name: "unlisted-provider / no-such", depth: 1 },
			{ kind: "model", name: "go-provider / model-alpha", depth: 1 },
			{ kind: "session", name: "session-child", depth: 1 },
			{ kind: "session", name: "session-grand", depth: 2 },
			{ kind: "session", name: "session-sibling", depth: 1 },
		]);
		expect(rows[0]?.fields).toBeUndefined();

		// The rows are agent nodes only where they name an actual session: the three descendants of the
		// document appear once each, at the depth their direct parent puts them, and no model row is
		// among them — a child's own models are *not* expanded into rows of their own.
		expect(rows.filter(row => row.kind === "session").map(row => [row.name, row.depth])).toEqual([
			["session-child", 1],
			["session-grand", 2],
			["session-sibling", 1],
		]);
		expect(rows.filter(row => row.kind === "model").every(row => row.depth === 1)).toBe(true);

		// Each row's own figures, hand-added from the record's buckets. The whole tree's own total is
		// 6,894 — the row totals below are what adds up to it, each contribution once:
		// 6000+750+2+20+100+7+15. No row of this list carries that inclusive figure, and none carries a
		// subtree total of its own. These totals are computed figures of each scope rather than columns
		// the display writes (P23), which is why the algorithm is asserted here instead of on a row's text.
		expect(rows.map(row => row.fields?.sum)).toEqual([undefined, 6000, 750, 2, 20, 100, 7, 15]);
		expect(rows.map(row => row.fields?.sum)).not.toContain(6894);
		const [alpha, codex, unlisted, tokenOnly, child, grand, sibling] = rows.slice(1).map(row => row.fields);
		expect(alpha?.tokens).toEqual({ input: 1000, cacheRead: 2000, cacheWrite: 0, output: 3000 });
		expect(alpha?.cacheHitRate).toBe(67);
		expect(alpha?.costCny).toBe(0.05);
		expect(codex?.tokens).toEqual({ input: 400, cacheRead: 100, cacheWrite: 50, output: 200 });
		expect(codex?.cacheHitRate).toBe(20);
		expect(codex?.referenceCostUsd).toBe(0.02);
		expect(unlisted?.tokens).toEqual({ input: 1, cacheRead: 0, cacheWrite: 0, output: 1 });
		expect(tokenOnly?.tokens).toEqual({ input: 4, cacheRead: 6, cacheWrite: 0, output: 10 });
		expect(tokenOnly?.cacheHitRate).toBe(60);
		expect(child?.tokens).toEqual({ input: 30, cacheRead: 20, cacheWrite: 0, output: 50 });
		expect(child?.cacheHitRate).toBe(40);
		expect(grand?.costCny).toBe(0.5);
		// Seven input tokens and no cache reads of them: a known zero percent, not an absent rate.
		expect(grand?.cacheHitRate).toBe(0);
		expect(sibling?.cacheHitRate).toBe(50);
		expect(sibling?.costCny).toBe(0.1);
	});

	test("a session row states no cached share while its own model rows keep theirs", async () => {
		const bound = await bind();
		const rows = bound.runtime.presentation.of(MAIN_TARGET).agentTree ?? [];
		/** The columns one row states, in the order it writes them. */
		const columnsOf = (name: string): readonly string[] =>
			fieldsColumns(rows.find(row => row.name === name)?.fields as ConsumptionFields).map(column => column.label);

		// The root's own pair rows are rows of a *model*, so each states the cached share of the
		// conversation that pair saw, beside its ratio and its amounts. The descendant rows are the
		// subagent list: what is compared between them is what each session consumed, so the cached-share
		// column is dropped from the row rather than written empty, and the fields that follow it start
		// where it would have been.
		expect(columnsOf("official / model-alpha")).toContain("Cache: ");
		expect(columnsOf("go-provider / model-alpha")).toContain("Cache: ");
		expect(columnsOf("session-child")).not.toContain("Cache: ");
		expect(columnsOf("session-grand")).not.toContain("Cache: ");
		expect(columnsOf("session-sibling")).not.toContain("Cache: ");

		// Dropping the column re-states no figure: a session row's usage, its amounts and the cached share
		// computed behind it are the ones its own accumulation holds, exactly as they were.
		const child = rows.find(row => row.name === "session-child")?.fields;
		expect(child?.tokens).toEqual({ input: 30, cacheRead: 20, cacheWrite: 0, output: 50 });
		expect(child?.cacheHitRate).toBe(40);
		expect(child?.sum).toBe(100);
		expect(rows.find(row => row.name === "session-sibling")?.fields?.costCny).toBe(0.1);
	});

	test("a row's ratio is its own model's price, and the current-model ratio is not borrowed", async () => {
		// The allowance channel's price is the harness's own statement, exactly as it is for the Total's
		// current-model fields: the maintained data prices no tier for that provider.
		const bound = await bind({ modelPrices: CODEX_PRICE_SOURCE });
		const rows = bound.runtime.presentation.of(MAIN_TARGET).agentTree ?? [];
		const percents = (name: string): readonly number[] | undefined =>
			rows.find(row => row.name === name)?.fields?.referenceRatio?.parts.map(part => part.percent);

		// `official/model-alpha` at its own tier: 2000·0.5, 1000·2 and 3000·8 of 27,000 — the hand-derived
		// 4:7:89. It is not the ratio of the pair below it, nor of the root's other pairs.
		expect(percents("official / model-alpha")).toEqual([4, 7, 89]);
		// The allowance pair uses the catalog's four amounts (100·1, 400·1, 50·2, 200·2 of 1,000) — an
		// exact 10:40:10:40, a different structure over a different set of buckets.
		expect(percents("plan-provider / codex-model")).toEqual([10, 40, 10, 40]);
		// A session row is a whole session's own accumulation rather than one pair's, so it carries no
		// single model's ratio: 5·0.5, 5·2 and 5·8 of 52.5 would be 5:19:76 if it were the sibling's own
		// pair, and that is exactly the row that would show it.
		expect(percents("session-sibling")).toBeUndefined();
		expect(rows.find(row => row.name === "session-sibling")?.fields?.costCny).toBe(0.1);
	});

	test("a pair with no amount policy shows usage alone, whatever the harness catalog states for it", async () => {
		// The harness prices *every* pair it is asked about — including the two the extension's own data
		// classifies as token-only and as not listed at all. That is the shape a real host has: its
		// catalog prices models the extension does not display.
		const bound = await bind({ modelPrices: EVERY_PAIR_USD });
		const rows = bound.runtime.presentation.of(MAIN_TARGET).agentTree ?? [];

		// The token-only pair and the pair this extension does not list contribute their usage and no
		// amount and no ratio of their own: neither the harness's price nor the pair's tokens may turn
		// into an amount under a policy that has none. The monetary pair keeps its own data tier's
		// ratio — the maintained data wins for a pair it names — and the allowance pair its four USD
		// amounts.
		const tokenOnly = rows.find(row => row.name === "go-provider / model-alpha")?.fields;
		expect(tokenOnly?.tokens).toEqual({ input: 4, cacheRead: 6, cacheWrite: 0, output: 10 });
		expect(tokenOnly?.sum).toBe(20);
		expect(tokenOnly?.cacheHitRate).toBe(60);
		expect(tokenOnly?.costCny).toBeUndefined();
		expect(tokenOnly?.referenceCostUsd).toBeUndefined();
		expect(tokenOnly?.referenceRatio).toBeUndefined();
		const unlisted = rows.find(row => row.name === "unlisted-provider / no-such")?.fields;
		expect(unlisted?.tokens).toEqual({ input: 1, cacheRead: 0, cacheWrite: 0, output: 1 });
		expect(unlisted?.referenceRatio).toBeUndefined();
		expect(unlisted?.costCny).toBeUndefined();
		expect(rows.find(row => row.name === "official / model-alpha")?.fields?.referenceRatio?.currency).toBe("XTS");
		expect(
			rows.find(row => row.name === "plan-provider / codex-model")?.fields?.referenceRatio?.parts.map(part => part.percent),
		).toEqual([10, 40, 10, 40]);
	});
});

describe("the detail form's static tree marks the session that is working right now (P23)", () => {
	test("a descendant's name is emphasised while its Round is open, and plain again once that Round ends", async () => {
		const bound = await bind();
		/** The row the tree draws under one name, or nothing while it draws none. */
		const rowOf = (name: string): AgentTreeRow | undefined =>
			(bound.runtime.presentation.of(MAIN_TARGET).agentTree ?? []).find(row => row.name === name);

		// No Round edge has moved any session yet, so the row the document records for the child — under
		// the name the document holds — states no emphasis at all: an unestablished activity is not
		// idleness, and the tree draws that name exactly as it did before this reading existed.
		expect(rowOf("session-child")?.nameEmphasis).toBeUndefined();
		expect(rowOf("session-grand")?.nameEmphasis).toBeUndefined();
		expect(rowOf("session-sibling")?.nameEmphasis).toBeUndefined();

		// The child takes up a Round. That delivery carries the session's own facts, its latest name among
		// them, so the row is drawn under `子代理` from here on — and the reading belongs to the session the
		// edge named, so it is the only row of the tree that is emphasised.
		bound.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: CHILD });
		expect(rowOf("子代理")?.nameEmphasis).toBe("active");
		const rows = bound.runtime.presentation.of(MAIN_TARGET).agentTree ?? [];
		expect(rows.filter(row => row.nameEmphasis !== undefined).map(row => row.name)).toEqual(["子代理"]);
		expect(rows.find(row => row.kind === "root")?.nameEmphasis).toBeUndefined();

		// The framework's own end edge is what moves it back, and the row is then drawn exactly as it was:
		// idle is a reading that states no emphasis rather than a different one.
		bound.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: CHILD });
		expect(rowOf("子代理")?.nameEmphasis).toBeUndefined();
	});

	test("the root session and a subagent are read on the same per-session axis", async () => {
		const bound = await bind();

		// The reading is the session's own whichever kind of session it is: a main session's Round open is
		// that session working, exactly as a subagent's is, and a session no edge has moved has no reading
		// at all rather than an idle one.
		expect(bound.runtime.sessionActivity.read("session-main")).toBeUndefined();
		bound.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: MAIN });
		expect(bound.runtime.sessionActivity.read("session-main")).toBe("working");
		bound.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: MAIN });
		expect(bound.runtime.sessionActivity.read("session-main")).toBe("idle");

		// The tree's root row is the session the tree is *of* rather than one of the subagent rows it
		// lists, so it carries no emphasis however that session reads: the emphasis is how the subagent
		// list picks out the rows that are running.
		expect(bound.runtime.presentation.of(MAIN_TARGET).agentTree?.[0]?.nameEmphasis).toBeUndefined();
	});
});

describe("leaving a session's position writes nothing and keeps that session's reading (P33)", () => {
	test("a switch and a view that moved end no Round: no save, no idle reading, the emphasis kept", async () => {
		const bound = await bind();
		/** The row the tree draws under one name, or nothing while it draws none. */
		const rowOf = (name: string): AgentTreeRow | undefined =>
			(bound.runtime.presentation.of(MAIN_TARGET).agentTree ?? []).find(row => row.name === name);
		/** The session the switch enters: its own identity under its own owner, unrelated to the one left. */
		const entered: SessionFacts = { sessionId: "session-other", kind: "main", name: "另一会话", unavailable: [] };
		const enteredOwner: OwnerReference = { kind: "owner", key: "main:detail-other" };

		// A subagent of this entry is working, then pauses having already scheduled its continuation.
		bound.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: CHILD });
		bound.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: CHILD, willContinue: true });
		expect(rowOf("子代理")?.nameEmphasis).toBe("active");
		const before = readFileSync(bound.consumptionFile, "utf8");

		// The operator leaves the session that is displayed: an ordinary switch ends it as a transfer, the
		// session it enters starts under its own owner, and the view publishes the new target's facts.
		bound.double.deliverSession(OWNER, { event: { kind: "session_end", reason: "transferred" }, session: MAIN });
		bound.double.deliverSession(enteredOwner, { event: { kind: "session_start", reason: "resume" }, session: entered });
		bound.double.deliverSession(enteredOwner, { event: { kind: "session_facts" }, session: entered });

		// Nothing ended the subagent's Round, so nothing was measured and nothing was committed: the
		// document is byte-for-byte what it was, and the reading of the session that was left behind is
		// still its own working one — a view that moved is not that session's idleness.
		expect(readFileSync(bound.consumptionFile, "utf8")).toBe(before);
		expect(bound.runtime.sessionActivity.read("session-child")).toBe("working");
		expect(rowOf("子代理")?.nameEmphasis).toBe("active");

		// The continuation really comes to rest afterwards: the Round the switch left open is the one that
		// ends here, and only then does the reading turn idle and the emphasis clear.
		bound.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: CHILD, quiescent: true });
		expect(bound.runtime.sessionActivity.read("session-child")).toBe("idle");
		expect(rowOf("子代理")?.nameEmphasis).toBeUndefined();
	});
});

describe("the detail form's static tree: the started-on facts a descendant row states (P26, P27, P28, P29)", () => {
	test("a descendant row states the one snapshot its session began on, `?` for each part nothing proved", async () => {
		// Four actual sessions: one child the document recorded as having begun on a model and a level,
		// one grandchild that recorded only its level, one sibling that recorded neither, and the root.
		const document = {
			...TREE,
			harnesses: {
				[HARNESS]: {
					sessions: [
						record("session-main", null, {
							official: { "model-alpha": { tokens: { input: 10, cacheRead: 0, cacheWrite: 0, output: 20 } } },
						}),
						{
							...record("session-child", "session-main", {
								"go-provider": { "model-alpha": { tokens: { input: 4, cacheRead: 6, cacheWrite: 0, output: 10 } } },
							}),
							startup: { model: { provider: "go-provider", model: "model-alpha" }, effort: "high" },
						},
						{
							...record("session-grand", "session-child", {}),
							startup: { effort: "medium" },
						},
						record("session-sibling", "session-main", {}),
					],
				},
			},
		} as unknown as ConsumptionDocument;
		const bound = await bind({ document });
		const rows = bound.runtime.presentation.of(MAIN_TARGET).agentTree ?? [];

		// Every descendant row carries the one snapshot — the model the session began on with the level it
		// began on, already in the form the row prints them — and a part the document proves nothing about
		// is `?` rather than borrowed from the model or level the session runs now. The tail is the half of
		// that text a row too narrow for the whole snapshot keeps whole.
		expect(rows.filter(row => row.kind === "session").map(row => ({ name: row.name, startup: row.startup }))).toEqual([
			{ name: "session-child", startup: { text: "go-provider/model-alpha(high)", tail: "(high)" } },
			{ name: "session-grand", startup: { text: "?(medium)", tail: "(medium)" } },
			{ name: "session-sibling", startup: { text: "?(?)", tail: "(?)" } },
		]);
		// Nothing that is not an actual descendant session carries a startup: the root is the session the
		// tree is drawn for rather than one that began below it, and a model row is a pair of figures
		// rather than a session at all.
		expect(rows[0]?.startup).toBeUndefined();
		expect(rows.filter(row => row.kind === "model").every(row => row.startup === undefined)).toBe(true);
	});
});

describe("a subagent's view is the brief, and the main session's tree is what it returns to (P26)", () => {
	test("the subagent's own Round is drawn as a brief, and the round trip re-accounts nothing", async () => {
		const bound = await bind();
		await bound.double.runToCompletion("budget", { args: "detail" });

		// The entry is in its detail form, and the main session is the one target it belongs to.
		expect(bound.runtime.presentation.of(MAIN_TARGET).form).toBe("detail");
		expect(bound.runtime.presentation.of(MAIN_TARGET).agentTree?.[0]?.name).toBe("主会话");
		const documentBefore = readFileSync(bound.consumptionFile, "utf8");

		// A request of the child's own session, inside the framework's own Round for that session.
		bound.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: CHILD });
		settleChildTurn(bound.double, CLOCK);

		// Viewing the child: the brief, drawn from that session's own facts — its own current-model
		// fields (30+10 input, 20 cache reads, 50+20 output: 130 accounted tokens, no column of their
		// own any more, and a 33 percent hit rate), its own Round's 30 tokens with no amount and no
		// ratio, since the pair has no amount policy — and the same whole main tree's own total behind
		// them. No tree of its own is offered at all, which is what the fixed brief means: the entry's
		// preference cannot turn this view into the detail form.
		const child = bound.runtime.presentation.of({
			sessionId: "session-child",
			provider: "go-provider",
			model: "model-alpha",
		});
		expect(child.form).toBe("brief");
		expect(child.agentTree).toBeUndefined();
		expect(child.current.sum).toBe(130);
		expect(child.current.cacheHitRate).toBe(33);
		expect(child.round?.total.sum).toBe(30);
		expect(child.round?.current.referenceRatio).toBeUndefined();
		expect(child.tree.sum).toBe(6924);

		// Returning to the main session: the detail form again, the tree again, and the child's own row
		// now carries what the child itself consumed. The round trip moved no consumption anywhere: the
		// main session's own record is exactly the one the document holds, and the document on disk was
		// not written again — a view change and a preference flip are not accounting events.
		const back = bound.runtime.presentation.of(MAIN_TARGET);
		expect(back.form).toBe("detail");
		expect(back.tree.sum).toBe(6924);
		expect(back.agentTree?.find(row => row.name === "子代理")?.fields?.sum).toBe(130);
		expect(bound.runtime.view.own("session-main")?.official?.["model-alpha"]?.tokens).toEqual({
			input: 1000,
			cacheRead: 2000,
			cacheWrite: 0,
			output: 3000,
		});
		expect(readFileSync(bound.consumptionFile, "utf8")).toBe(documentBefore);
		expect(bound.double.markerUpdates).toEqual([]);
	});
});

describe("an ordinary model, session, tree or view change keeps the instance, its cache and the preference (P20)", () => {
	test("the preference, the held reading and the runtime Round all survive, and no provider is asked again", async () => {
		const bound = await bind({ watched: true });

		// The CLI's one startup prefetch is the only provider request so far, and the reading it left is
		// the one this instance holds.
		expect(bound.sent).toHaveLength(1);
		expect(bound.runtime.presentation.balance().reading?.total).toBe(12.5);
		await bound.double.runToCompletion("budget", { args: "detail" });

		// A Round of the main session, so this instance's own runtime state is part of what the case
		// watches: an instance rebuilt from the file would hold no boundary pair and show no Round row.
		bound.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: MAIN });
		settleMainTurn(bound.double, CLOCK);
		expect(bound.runtime.presentation.of(MAIN_TARGET).round?.total.sum).toBe(20);

		// The ordinary changes: another session's own facts, a rename of the main session, a model
		// switch inside the viewed session, another session's Round opening, and the view moving across
		// targets and back.
		bound.double.deliverSession(OWNER, { event: { kind: "session_facts" }, session: CHILD });
		bound.double.deliverSession(OWNER, {
			event: { kind: "session_facts" },
			session: { ...MAIN, name: "改名后的主会话" },
		});
		bound.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: CHILD });
		bound.runtime.presentation.of({ sessionId: "session-child", provider: "go-provider", model: "model-alpha" });
		bound.runtime.presentation.of({ sessionId: "session-main", provider: "go-provider", model: "model-alpha" });
		const after = bound.runtime.presentation.of(MAIN_TARGET);

		// The entry is still in the form the operator left it in: a rebuilt instance would answer the
		// brief, because the preference is memory and nothing on disk holds one.
		expect(after.form).toBe("detail");
		// The tree follows the host's own rename without any second instance or save.
		expect(after.agentTree?.[0]?.name).toBe("改名后的主会话");
		expect(after.agentTree?.find(row => row.name === "子代理")).toBeDefined();
		// The runtime Round is the same boundary pair it was, and the tree it belongs to is unchanged.
		expect(after.round?.total.sum).toBe(20);
		expect(after.tree.sum).toBe(6914);
		// The reading this instance holds is the very one the startup asked for — no switch, model change
		// or view change reached a provider for a second one — and the framework built exactly one
		// business instance for the process: every change above was served by the same one.
		expect(bound.runtime.presentation.balance().reading?.total).toBe(12.5);
		expect(bound.sent).toHaveLength(1);
		expect(bound.factoryRuns()).toBe(1);
	});
});
