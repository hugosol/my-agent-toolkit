/**
 * The one place this extension's own model and price data lives.
 *
 * Everything the extension classifies or prices comes from this module: which exact provider and
 * model id belongs to which consumption mode, the off-peak unit price of each monetary tier, the
 * multiplier that derives the peak price from the off-peak one, and the Beijing peak windows that
 * decide which of the two a request's start falls in. No other module in this extension states a
 * model id, a price or a peak hour, and nothing here is user-configurable: there is no price field
 * in `config.yaml`, no second price table, no ratio table, and no environment override.
 *
 * The data is a maintenance artifact, not a runtime discovery surface. It changes when a maintainer
 * updates it in the repository (see `docs/model-data-maintenance.md` for the sources and the
 * recorded observations), and the next process starts with the updated data. The extension never
 * calls a provider's `/models` endpoint at run time, never scrapes a price list, never accepts a
 * future model automatically and never hot-reloads a price: a request that has already been issued
 * keeps the price its own start anchored, and an amount already accumulated is never revalued,
 * back-computed or deleted because this data changed afterwards.
 *
 * Classification is by provider identity and exact model id together, as the host reports them —
 * never by a base URL, an `owned_by` field, a name prefix, a suffix or an alias. A model this data
 * does not name is not upgraded into a tier it merely resembles, and the two official DeepSeek ids
 * below are the whole of the official coverage: a provider serving the same id is not the official
 * provider unless the provider itself is.
 */
import type { CatalogPrice, CatalogPriceSource } from "../../../framework/core/protocol";

/** One monetary tier's off-peak unit price, in the data's currency per the data's unit. */
export interface TierPrice {
	/** Non-cached input tokens. */
	readonly input: number;
	/** Tokens read from the prompt cache. */
	readonly cacheRead: number;
	/** Output tokens. */
	readonly output: number;
}

/** One peak window, as whole minutes since the pricing zone's midnight; both ends are inclusive. */
export interface PeakWindow {
	readonly fromMinute: number;
	readonly toMinute: number;
}

/** What this data states for one exact provider and model id. */
export type ModelEntry =
	/** Official monetary pricing, in the named tier's prices. */
	| { readonly mode: "monetary"; readonly tier: string }
	/** Usage without a monetary policy of this extension's. */
	| { readonly mode: "token-only" };

/**
 * This extension's whole model and price data, as one value.
 *
 * The shape is deliberately plain data so the algorithm modules can be driven with a self-made one:
 * the rules (exact matching, the peak decision, the multiplier, the missing-price boundary) belong
 * to `request-price.ts`, and this value is what those rules read.
 */
export interface ModelPricingData {
	/** The currency every amount in this data is stated in. */
	readonly currency: string;
	/** The unit those amounts are stated per. */
	readonly unit: string;
	/** The factor deriving a peak price from the off-peak one; no peak table is stored. */
	readonly peakMultiplier: number;
	/** The pricing zone's offset from UTC, in minutes (Beijing is +08:00, and does not shift). */
	readonly zoneOffsetMinutes: number;
	/** The windows of a workday that are peak, as minutes since that zone's midnight. */
	readonly peakWindows: readonly PeakWindow[];
	/** Each monetary tier's off-peak unit price. */
	readonly tiers: Readonly<Record<string, TierPrice>>;
	/**
	 * The providers whose every model belongs to the allowance channel.
	 *
	 * This is a provider-level fact of the data, not a wildcard over model names: the provider
	 * identity the host reports is the key, and no id-shaped pattern stands in for it.
	 */
	readonly allowanceProviders: readonly string[];
	/** Each exact provider's exact model ids, and what this data states for them. */
	readonly models: Readonly<Record<string, Readonly<Record<string, ModelEntry>>>>;
}

/** 09:00 and 12:00 of the pricing zone, in minutes since its midnight. */
const PEAK_WINDOW_MORNING: PeakWindow = { fromMinute: 9 * 60, toMinute: 12 * 60 };

/** 14:00 and 18:00 of the pricing zone, in minutes since its midnight. */
const PEAK_WINDOW_AFTERNOON: PeakWindow = { fromMinute: 14 * 60, toMinute: 18 * 60 };

/** The official provider whose two ids this extension prices in CNY. */
const OFFICIAL_DEEPSEEK = "deepseek";

/** The provider whose DeepSeek-family ids this extension keeps usage for without a monetary policy. */
const OPENCODE_GO = "opencode-go";

/** The provider whose models the allowance channel covers, whatever their id. */
const OPENAI_CODEX = "openai-codex";

/**
 * This extension's maintained data.
 *
 * The official coverage is the two ids below, in two tiers: `pro` and `flash`. The Go coverage is
 * the five DeepSeek-family ids below, in token-only mode — the other Go models, an unlisted
 * official id and every other third-party provider are not covered at all. `openai-codex` is the
 * allowance provider, whose models are covered whatever their id.
 */
export const MODEL_PRICING_DATA: ModelPricingData = {
	currency: "CNY",
	unit: "CNY/百万 token",
	peakMultiplier: 2,
	zoneOffsetMinutes: 8 * 60,
	peakWindows: [PEAK_WINDOW_MORNING, PEAK_WINDOW_AFTERNOON],
	tiers: {
		pro: { input: 4.5, cacheRead: 0.15, output: 13.5 },
		flash: { input: 1, cacheRead: 0.02, output: 4 },
	},
	allowanceProviders: [OPENAI_CODEX],
	models: {
		[OFFICIAL_DEEPSEEK]: {
			"deepseek-v4-pro": { mode: "monetary", tier: "pro" },
			"deepseek-flash": { mode: "monetary", tier: "flash" },
		},
		[OPENCODE_GO]: {
			"deepseek-v4-pro": { mode: "token-only" },
			"deepseek-flash": { mode: "token-only" },
			"deepseek-v4-flash": { mode: "token-only" },
			"deepseek-v4.1-flash": { mode: "token-only" },
			"deepseek-v4-flash-vision-exp": { mode: "token-only" },
		},
	},
};

/** What this data states for one provider and exact model id, or `undefined` when it states none. */
export function entryOf(data: ModelPricingData, provider: string, model: string): ModelEntry | undefined {
	// Own-property lookups, because the data is a plain mapping: inheriting `constructor` or
	// `toString` from `Object` would classify a provider or model named after one of them.
	if (!Object.prototype.hasOwnProperty.call(data.models, provider)) return undefined;
	const models = data.models[provider] as Readonly<Record<string, ModelEntry>>;
	return Object.prototype.hasOwnProperty.call(models, model) ? models[model] : undefined;
}

/** What one provider and exact model id are, as this data classifies them. */
export type Classification =
	/** An allowance provider's model: the mode is the provider's, whatever the model id is. */
	| { readonly mode: "allowance" }
	| { readonly mode: "monetary"; readonly tier: string }
	| { readonly mode: "token-only" }
	/** A pair this data does not name: not a guessed tier and not a resembling model's. */
	| { readonly mode: "hidden" };

/**
 * The classification of one provider and exact model id.
 *
 * A provider the data names as an allowance provider is in the allowance channel whatever the model
 * id is — that is the whole of the Codex rule, and it is keyed on the reported provider identity
 * rather than on any shape of the model id. Every other pair is looked up by its exact ids together,
 * so a different provider serving a known model id, a known model id carrying extra text, and a
 * base URL or `owned_by` field that merely suggests a family are all `hidden`.
 */
export function classify(data: ModelPricingData, provider: string, model: string): Classification {
	if (data.allowanceProviders.includes(provider)) return { mode: "allowance" };
	return entryOf(data, provider, model) ?? { mode: "hidden" };
}

/** One tier's off-peak price in the form the framework's catalog carries: currency, unit, amounts. */
export function catalogPriceOf(data: ModelPricingData, tier: string): CatalogPrice | undefined {
	const price: TierPrice | undefined = Object.prototype.hasOwnProperty.call(data.tiers, tier)
		? data.tiers[tier]
		: undefined;
	if (price === undefined) return undefined;
	return {
		currency: data.currency,
		unit: data.unit,
		amounts: { input: price.input, cacheRead: price.cacheRead, output: price.output },
	};
}

/**
 * What one provider and exact model id cost, as this data answers a catalog query.
 *
 * The monetary channel answers with its tier's own off-peak price — which of the two prices of the
 * day applies is the accounting's decision, because only it knows the request's start instant and
 * the period's holiday. Every other mode answers nothing: a pair the data does not name, and a
 * channel this data holds no price for, are both "no price here" rather than a price of zero.
 */
export function dataCatalog(data: ModelPricingData): CatalogPriceSource {
	return {
		priceOf: (provider, model) => {
			const classification = classify(data, provider, model);
			return classification.mode === "monetary" ? catalogPriceOf(data, classification.tier) : undefined;
		},
	};
}
