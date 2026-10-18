/**
 * pi's own model prices: the catalog the host's registry states, read through the session contexts
 * this process's bindings see, and mapped to the framework's opaque catalog price.
 *
 * The registry is a fact of the process, but the only reading pi offers is the member a live
 * session context carries, so this keeps the registry of the newest context a delivery came from
 * and answers every later question from it: the framework snapshots the answer at a request's real
 * start, and the extension's own frontend asks again when it draws. A price asked for before any
 * context was reported answers nothing rather than a guess, and what leaves this module is that
 * plain query — never a native model or registry.
 */
import type { CatalogPrice, CatalogPriceSource } from "../../framework/core/protocol";
import type { PiExtensionContext, PiModelRegistry } from "./native";

/**
 * The currency and unit pi states its own model costs in.
 *
 * pi's catalog carries the amounts alone, in US dollars per million tokens: the same unit its own
 * usage readout prints them in, which is the unit the framework's catalog price carries opaquely.
 */
const HARNESS_PRICE_CURRENCY = "USD";
const HARNESS_PRICE_UNIT = "USD/百万 token";

/** The buckets pi states a model's cost in, in the framework's own bucket vocabulary. */
const HARNESS_COST_BUCKETS = ["input", "cacheRead", "cacheWrite", "output"] as const;

/**
 * The price pi's own catalog states for one provider and exact model id.
 *
 * The mapping is the identity between two statements of the same fact — pi's cost per million tokens
 * in its four buckets, and the framework's own catalog price — plus the unit that catalog reads in.
 * A pair the catalog does not carry answers nothing, and so does a model every one of whose stated
 * amounts is zero: an amount the catalog never stated is not a price of zero, and carrying one would
 * look like a real, free request.
 */
function harnessPriceOf(
	catalog: PiModelRegistry | undefined,
	provider: string,
	model: string,
): CatalogPrice | undefined {
	const entry = catalog?.getAll().find(row => row.id === model && row.provider === provider);
	const cost = entry?.cost;
	if (cost === undefined) return undefined;
	const amounts: Record<string, number> = {};
	for (const bucket of HARNESS_COST_BUCKETS) {
		const amount = cost[bucket];
		if (typeof amount === "number" && Number.isFinite(amount)) amounts[bucket] = amount;
	}
	if (Object.values(amounts).every(amount => amount === 0)) return undefined;
	return { currency: HARNESS_PRICE_CURRENCY, unit: HARNESS_PRICE_UNIT, amounts };
}

/** pi's own model prices, and the live registry reading they are answered from. */
export interface HarnessModelPrices {
	/** The query the framework hands the implementation factory and snapshots at a request's start. */
	readonly prices: CatalogPriceSource;
	/** Records the model registry of the context one delivery came from. */
	saw(ctx: PiExtensionContext): void;
}

/** pi's own model prices, read through the session contexts this process's bindings see. */
export function harnessModelPrices(): HarnessModelPrices {
	let newest: PiModelRegistry | undefined;
	return {
		prices: { priceOf: (provider, model) => harnessPriceOf(newest, provider, model) },
		saw: ctx => {
			if (ctx.modelRegistry !== undefined) newest = ctx.modelRegistry;
		},
	};
}
