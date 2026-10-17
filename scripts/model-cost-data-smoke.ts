/**
 * Maintenance smoke: this extension's maintained model and price data against the approved coverage.
 *
 * The permanent suite never names a real model id or a real price. The pricing rules are driven at
 * the production seam by `tests/model-cost/request-accounting.test.ts` with a self-made list, self-
 * made prices and a self-made multiplier, so a business price update cannot re-pin an expectation
 * there. This script is the other half, and it is deliberately not a test: a maintainer runs it
 * together with the data edit — step 4 of
 * `extensions/model-cost/docs/model-data-maintenance.md` — because the values it checks change when
 * a price or a model list changes, and pinning them into the suite would make every such update
 * look like a regression.
 *
 * The expectations are the approved specification's own values (the model-catalog decision, whose
 * price rows are the official pricing document's): the two official ids and their tiers, the five
 * OpenCode Go ids, the allowance provider, the off-peak unit prices, the shared peak multiplier,
 * the Beijing peak windows and the currency. What this script cannot prove is that the data runs:
 * the isolated host smoke (`tests/harness-dock/model-cost-accounting.test.ts`) is what prices a
 * real request with it, and the data's own sources and update rules live in the maintenance note.
 *
 * Run it with:
 *
 * ```sh
 * bun run smoke:model-cost-data
 * ```
 */
import { MODEL_PRICING_DATA, catalogPriceOf, classify } from "../extensions/model-cost/shared-logic/pricing/model-data";

/** One check's outcome, with the observation that decided it. */
interface Observation {
	readonly name: string;
	readonly ok: boolean;
	readonly detail: string;
}

const observations: Observation[] = [];

function check(name: string, ok: boolean, detail: string): void {
	observations.push({ name, ok, detail });
}

/** A value as one line, so a failure's detail reads as the fact it observed. */
function show(value: unknown): string {
	return JSON.stringify(value) ?? String(value);
}

/** What the approved coverage says one exact pair is, as the extension's own rules answer it. */
function modeOf(provider: string, model: string): string {
	return show(classify(MODEL_PRICING_DATA, provider, model));
}

const OFFICIAL_IDS: ReadonlyArray<readonly [string, string]> = [
	["deepseek-v4-pro", "pro"],
	["deepseek-flash", "flash"],
];
const RETIRED_OR_UNDECLARED_IDS = ["deepseek-v4-flash", "deepseek-v4-flash-vision-exp", "deepseek-chat"];
const GO_IDS = [
	"deepseek-v4-pro",
	"deepseek-flash",
	"deepseek-v4-flash",
	"deepseek-v4.1-flash",
	"deepseek-v4-flash-vision-exp",
];
const NOT_COVERED: ReadonlyArray<readonly [string, string]> = [
	["opencode-go", "some-other-model"],
	["deepseek", "some-other-model"],
	["other-provider", "deepseek-flash"],
];
const TIERS: Readonly<Record<string, { readonly input: number; readonly cacheRead: number; readonly output: number }>> = {
	pro: { input: 4.5, cacheRead: 0.15, output: 13.5 },
	flash: { input: 1, cacheRead: 0.02, output: 4 },
};

for (const [model, tier] of OFFICIAL_IDS) {
	const answer = modeOf("deepseek", model);
	check(`official deepseek/${model} is monetary in tier ${tier}`, answer === show({ mode: "monetary", tier }), answer);
}

for (const model of RETIRED_OR_UNDECLARED_IDS) {
	const answer = modeOf("deepseek", model);
	check(`retired or undeclared official id deepseek/${model} is hidden`, answer === show({ mode: "hidden" }), answer);
}

for (const model of GO_IDS) {
	const answer = modeOf("opencode-go", model);
	check(`opencode-go/${model} is token-only`, answer === show({ mode: "token-only" }), answer);
}

check(
	"another Go model, an undeclared official id and a known id under another provider are hidden",
	NOT_COVERED.every(([provider, model]) => modeOf(provider, model) === show({ mode: "hidden" })),
	NOT_COVERED.map(([provider, model]) => `${provider}/${model} -> ${modeOf(provider, model)}`).join(", "),
);

check(
	"openai-codex is the allowance channel for any of its model ids, and no other provider is",
	["gpt-5-codex", "anything-at-all"].every(model => modeOf("openai-codex", model) === show({ mode: "allowance" })) &&
		modeOf("codex", "gpt-5-codex") === show({ mode: "hidden" }),
	`openai-codex/gpt-5-codex -> ${modeOf("openai-codex", "gpt-5-codex")}, codex/gpt-5-codex -> ${modeOf("codex", "gpt-5-codex")}`,
);

check(
	"the maintained tier names are exactly the approved ones",
	show(Object.keys(MODEL_PRICING_DATA.tiers)) === show(Object.keys(TIERS)),
	show(Object.keys(MODEL_PRICING_DATA.tiers)),
);

for (const [tier, amounts] of Object.entries(TIERS)) {
	const price = catalogPriceOf(MODEL_PRICING_DATA, tier);
	check(
		`tier ${tier} carries the approved off-peak amounts`,
		show(price?.amounts) === show(amounts),
		`${show(price?.amounts)} (approved ${show(amounts)})`,
	);
}

check(
	"no tier prices a cache-write bucket, and no second peak tier is stored",
	Object.keys(catalogPriceOf(MODEL_PRICING_DATA, "pro")?.amounts ?? {}).join(",") === "input,cacheRead,output" &&
		catalogPriceOf(MODEL_PRICING_DATA, "flash-peak") === undefined,
	`pro's buckets ${Object.keys(catalogPriceOf(MODEL_PRICING_DATA, "pro")?.amounts ?? {}).join(",")}; a flash-peak tier is ${catalogPriceOf(MODEL_PRICING_DATA, "flash-peak") === undefined ? "absent" : "present"}`,
);

check(
	"one shared multiplier of 2 derives every peak price",
	MODEL_PRICING_DATA.peakMultiplier === 2,
	show(MODEL_PRICING_DATA.peakMultiplier),
);

check(
	"the amounts are stated in CNY per million tokens",
	MODEL_PRICING_DATA.currency === "CNY" && MODEL_PRICING_DATA.unit === "CNY/百万 token",
	`${MODEL_PRICING_DATA.currency}, ${MODEL_PRICING_DATA.unit}`,
);

check(
	"the pricing zone is Beijing (+08:00, no shift)",
	MODEL_PRICING_DATA.zoneOffsetMinutes === 8 * 60,
	show(MODEL_PRICING_DATA.zoneOffsetMinutes),
);

check(
	"the peak windows are the two closed workday windows",
	show(MODEL_PRICING_DATA.peakWindows) ===
		show([
			{ fromMinute: 9 * 60, toMinute: 12 * 60 },
			{ fromMinute: 14 * 60, toMinute: 18 * 60 },
		]),
	show(MODEL_PRICING_DATA.peakWindows),
);

for (const observation of observations) {
	console.log(`${observation.ok ? "pass" : "FAIL"}  ${observation.name} — ${observation.detail}`);
}
const failed = observations.filter(observation => !observation.ok).length;
const passed = observations.length - failed;
console.log(`\nSMOKE SUMMARY: ${passed} passed, ${failed} failed, ${observations.length} checks`);
process.exit(failed === 0 ? 0 : 1);
