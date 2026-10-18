/**
 * OMP model prices: the cost the harness's own catalog states, mapped to the framework's price
 * facts.
 *
 * The harness's catalog is readable only through a live session context, while the price it states
 * is asked for later and from outside every delivery — the framework snapshots it at a request's
 * real start and an extension's frontend asks again whenever it draws. This module therefore keeps
 * the catalog of the newest context a delivery reported and answers every later question from it.
 * What leaves it is the framework's plain price query: no native model or catalog crosses the seam.
 *
 * The query is created once per assembly, because the catalog is the process's; each binding
 * reports the contexts its own deliveries came from through `saw`.
 */
import type { CatalogPrice, CatalogPriceSource } from "../../framework/core/protocol";
import type { OmpSessionContext } from "./native-types";

/**
 * The currency and unit the harness states its own model costs in.
 *
 * The harness's catalog carries the amounts alone, and its own usage readout is what prints them:
 * both are US dollars per million tokens, which is the unit the framework's catalog price carries
 * opaquely.
 */
const HARNESS_PRICE_CURRENCY = "USD";
const HARNESS_PRICE_UNIT = "USD/百万 token";

/** The buckets a harness states a model's cost in, in the framework's own bucket vocabulary. */
const HARNESS_COST_BUCKETS = ["input", "cacheRead", "cacheWrite", "output"] as const;

/**
 * The price the harness's own catalog states for one provider and exact model id.
 *
 * The mapping is the identity between two statements of the same fact — the harness's cost per
 * million tokens in its four buckets, and the framework's own catalog price — plus the unit the
 * harness reads in. A pair the catalog does not carry answers nothing, and so does a model every
 * one of whose stated amounts is zero: an amount the harness never stated is not a price of zero,
 * and carrying one would look like a real, free request.
 */
function harnessPriceOf(
	catalog: OmpSessionContext["models"],
	provider: string,
	model: string,
): CatalogPrice | undefined {
	const entry = catalog?.list().find(row => row.id === model && row.provider === provider);
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

/** The harness's own model prices, and the live context reading they are answered from. */
export interface ModelPrices {
	/** The query the framework hands the implementation factory and snapshots at a request's start. */
	readonly prices: CatalogPriceSource;
	/** Records the model catalog of the context one delivery came from. */
	saw(ctx: OmpSessionContext): void;
}
/**
 * The harness's own model prices, read through the session contexts this process's bindings see.
 *
 * The harness's model catalog is a fact of the process, but the only reading the extension surface
 * offers is the model query a live session context carries, so this keeps the query of the newest
 * context a delivery came from and answers every later question from it: the framework snapshots the
 * answer at a request's real start, and the extension's frontend asks again whenever it draws. A
 * price asked for before any context was reported answers nothing rather than a guess.
 *
 * What leaves this module is that plain query. The contexts it was read from stay here: no native
 * model, registry or context is handed to the framework or to an extension.
 */
export function createModelPrices(): ModelPrices {
	let newest: OmpSessionContext["models"];
	return {
		prices: { priceOf: (provider, model) => harnessPriceOf(newest, provider, model) },
		saw: ctx => {
			if (ctx.models !== undefined) newest = ctx.models;
		},
	};
}
