/**
 * One session's own model rows when its models sit in different consumption channels (P30, P43).
 *
 * The detail tree's root rows are one alignment group — one session's own provider/model pairs — and
 * the channels word their statistics for themselves: the monetary channel prices over three buckets
 * in CNY (`¥Cache/In/Out：` and `Cost: `) while the allowance channel prices over four in USD
 * (`$CacheR/In/CacheW/Out：` and `Ref: `). What a depth group aligns is the *statistic*, not the
 * wording: each row's own ratio and own amount land in the group's one column for that statistic. A
 * frontend keying its columns by the label each row draws instead would give the two channels one
 * column each and leave the row that does not write the other channel's wording a wide hole — the
 * symptom this file pins.
 *
 * The seam is production: the extension's real definition bound through the framework's public
 * binding (the port double), the extension's own pi frontend attached to a controlled pi surface, and
 * `/budget detail` driven the way an operator drives it. The allowance pair's own price is the
 * harness's, as it is on a real host (the maintained data holds no price for that channel), so the
 * double reports a harness catalog for it. Every figure below is the fixture's own literal.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { MODEL_COST } from "../../extensions/model-cost/definition";
import { attachModelCostWidget, textColumns } from "../../extensions/model-cost/harnesses/pi/widget";
import type { ConsumptionDocument } from "../../extensions/model-cost/shared-logic/consumption-document";
import type { ModelPricingData } from "../../extensions/model-cost/shared-logic/model-data";
import type { ModelCostRuntime } from "../../extensions/model-cost/shared-logic/runtime";
import { createModelCostRuntime } from "../../extensions/model-cost/shared-logic/runtime";
import type { CatalogPriceSource, OwnerReference, SessionFacts } from "../../framework/core/protocol";
import { portDouble } from "../framework/support/harness-port-double";
import { controlledPiSurface, type HostSession } from "./support/pi-host";
import { uiBoundaryTimerOf } from "./support/ui-timer";

/** The maintained data: one monetary tier, and the provider whose models are the allowance channel. */
const DATA: ModelPricingData = {
	currency: "XTS",
	unit: "XTS per million tokens",
	peakMultiplier: 3,
	zoneOffsetMinutes: 8 * 60,
	peakWindows: [{ fromMinute: 9 * 60, toMinute: 12 * 60 }],
	tiers: { alpha: { input: 2, cacheRead: 0.5, output: 8 } },
	allowanceProviders: ["plan-provider"],
	models: { official: { "model-alpha": { mode: "monetary", tier: "alpha" } } },
};

/** The allowance pair, and the harness's own price for it — the four amounts the Codex ratio reads. */
const ALLOWANCE_PROVIDER = "plan-provider";
const ALLOWANCE_MODEL = "model-gamma";
const HARNESS_PRICES: CatalogPriceSource = {
	priceOf: (provider, model) =>
		provider === ALLOWANCE_PROVIDER && model === ALLOWANCE_MODEL
			? {
					currency: "USD",
					unit: "USD per million tokens",
					amounts: { input: 3, cacheRead: 0.3, cacheWrite: 3.75, output: 15 },
				}
			: undefined,
};

const HARNESS = "mixed-channel-harness";
const CONSUMPTION_FILE = "consumption.json";
const MAIN: SessionFacts = { sessionId: "session-main", kind: "main", name: "主会话", unavailable: [] };
const OWNER: OwnerReference = { kind: "owner", key: "main:mixed-channel" };
const MAIN_HOST: HostSession = {
	sessionId: MAIN.sessionId,
	name: MAIN.name,
	provider: "official",
	model: "model-alpha",
	effort: "high",
	mode: "tui",
	context: { tokens: 1460, contextWindow: 100_000 },
};

/** The instant every read-time reading is taken at, inside the data's own peak window. */
const CLOCK_AT = Date.parse("2026-10-01T03:00:00.000Z");

/**
 * The document every case draws from: one main session that consumed both channels — the monetary
 * pair's 0.05 CNY and the allowance pair's $1.26 reference — so its own two model rows are one depth
 * group of two different channels.
 */
const MIXED_TREE = {
	schemaVersion: 1,
	periodId: "period-mixed-channel",
	start: "2026-10-01T00:00:00.000Z",
	holiday: false,
	harnesses: {
		[HARNESS]: {
			sessions: [
				{
					id: "session-main",
					name: "主会话",
					parent: null,
					saveVersion: 1,
					own: {
						official: {
							"model-alpha": {
								tokens: { input: 1000, cacheRead: 2000, cacheWrite: 0, output: 3000 },
								costCny: 0.05,
							},
						},
						[ALLOWANCE_PROVIDER]: {
							[ALLOWANCE_MODEL]: {
								tokens: { input: 2000, cacheRead: 4000, cacheWrite: 100, output: 1000 },
								referenceCostUsd: 1.26,
							},
						},
					},
				},
			],
		},
	},
} as unknown as ConsumptionDocument;

/** Every root this file created, removed after each case. */
const roots: string[] = [];

/** The display column the given text starts at on one drawn line, in the terminal's own columns. */
function columnOf(line: string, text: string): number {
	const at = line.indexOf(text);
	if (at < 0) throw new Error(`${JSON.stringify(text)} is not on ${JSON.stringify(line)}`);
	return textColumns(line.slice(0, at));
}

/** One cell of one drawn line: the text from the given column up to the next field gap. */
function cellAt(line: string, column: number): string {
	return line.slice(column).split(/\s{2,}/)[0] as string;
}

/** The one drawn row carrying the given text. */
function rowOf(lines: readonly string[], text: string): string {
	const row = lines.find(line => line.includes(text));
	if (row === undefined) throw new Error(`no drawn row carries ${JSON.stringify(text)}: ${JSON.stringify(lines)}`);
	return row;
}

/** The drawing of the detail form over one main session that consumed both channels. */
async function detailDrawing(): Promise<readonly string[]> {
	const root = mkdtempSync(path.join(tmpdir(), "mixed-channel-"));
	roots.push(root);
	writeFileSync(path.join(root, CONSUMPTION_FILE), JSON.stringify(MIXED_TREE), "utf8");
	const double = portDouble({ modelPrices: HARNESS_PRICES });
	let runtime: ModelCostRuntime | undefined;
	double.bind(MODEL_COST, {
		config: { reader: () => `storageDir: ${root}\nbalanceTtlMs: 30000\ncodexQuotaTtlMs: 15000\n` },
		factory: context => {
			const built = createModelCostRuntime({
				config: { storageDir: root },
				configDirectory: root,
				userHomeDirectory: root,
				harness: HARNESS,
				data: DATA,
				now: () => CLOCK_AT,
				...(context.modelPrices === undefined ? {} : { modelPrices: context.modelPrices }),
			});
			runtime = built;
			return built.implementation;
		},
	});
	double.deliverSession(OWNER, { session: MAIN });
	double.deliverSession(OWNER, { event: { kind: "session_facts" }, session: MAIN });
	await double.initiateRun(OWNER);
	const host = controlledPiSurface();
	attachModelCostWidget(host.api, runtime as ModelCostRuntime, uiBoundaryTimerOf(runtime as ModelCostRuntime));
	host.sessionStarts(MAIN_HOST);
	await double.runToCompletion("budget", { args: "detail" });
	return host.drawn(200) ?? host.lines() ?? [];
}

afterEach(() => {
	while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true });
});

describe("a session's model rows of different channels share the statistic columns (P30, P43)", () => {
	test("the ratio and the amount of each channel are drawn in the group's own column for them", async () => {
		const lines = await detailDrawing();
		const monetary = rowOf(lines, "official / model-alpha");
		const allowance = rowOf(lines, `${ALLOWANCE_PROVIDER} / ${ALLOWANCE_MODEL}`);

		// Each row states its own channel's wording: three buckets in CNY for the monetary pair, four in
		// USD for the allowance one, and the one amount its own channel has.
		expect(monetary).toContain("Cache: 67%");
		expect(monetary).toContain("¥Cache/In/Out：");
		expect(monetary).toContain("Cost: ¥0.05");
		expect(monetary).not.toContain("Ref: ");
		expect(allowance).toContain("Cache: 67%");
		expect(allowance).toContain("$CacheR/In/CacheW/Out：");
		expect(allowance).toContain("Ref: $1.26");
		expect(allowance).not.toContain("Cost: ");

		// The statistic is what the group aligns: both rows' cached share, both rows' ratio and both
		// rows' amount each start at one column. Keying the columns by the wording instead put the two
		// channels' ratios in a column each, which left whichever row did not write the other's wording
		// with a hole where its own ratio and amount should have been.
		expect(columnOf(monetary, "Cache: ")).toBe(columnOf(allowance, "Cache: "));
		expect(columnOf(monetary, "¥Cache/In/Out：")).toBe(columnOf(allowance, "$CacheR/In/CacheW/Out："));
		expect(columnOf(monetary, "Cost: ")).toBe(columnOf(allowance, "Ref: "));

		// The columns follow one another as the row writes them — the cached share, then the ratio, then
		// the amount, two columns apart — so neither row carries a gap between its own figures.
		const ratioColumn = columnOf(monetary, "¥Cache/In/Out：");
		const amountColumn = columnOf(monetary, "Cost: ");
		const widestRatio = Math.max(
			textColumns(cellAt(monetary, ratioColumn)),
			textColumns(cellAt(allowance, columnOf(allowance, "$CacheR/In/CacheW/Out："))),
		);
		expect(amountColumn).toBe(ratioColumn + widestRatio + 2);
	});
});
