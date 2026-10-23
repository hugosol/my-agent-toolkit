/**
 * OMP provider facts: the harness's own model prices and its current provider access, mapped to the
 * framework's plain queries.
 *
 * Both facts are readable only through a live session context — the model catalog and the model
 * registry a delivery carries — while the framework asks for them later and from outside every
 * delivery: it snapshots a price at a request's real start, and an extension's provider query reads
 * the moment's credential. This module therefore keeps the sources of the newest context a delivery
 * reported and answers every later question from them. What leaves it is the framework's plain price
 * and access queries: no native model, registry, credential store or context crosses the seam.
 *
 * The queries are created once per assembly, because the catalog and the registry are the process's;
 * each binding reports the contexts its own deliveries came from through `saw`. The two queries stay
 * separate facts with their own timing and missing meanings; sharing the file is locality, not a
 * manager, a cache or a unified lookup.
 */
import type { CatalogPrice, CatalogPriceSource, ProviderAccess } from "../../../../framework/interface/provider";
import type { OmpSessionContext } from "../extensibility/extensions/types";

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
 * The credential the harness reports for a provider that needs none.
 *
 * The registry answers this sentinel rather than `undefined` for a keyless provider, so it is a
 * native convention meaning *no credential* and not a credential made of three letters. Mapping it
 * away here keeps that native detail out of the framework's facts: an extension that needs a
 * credential is told there is none rather than handed a value it would send as one.
 */
const KEYLESS_CREDENTIAL = "N/A";

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

/** The harness's own provider facts, and the live context readings they are answered from. */
export interface OmpProviderFacts {
	/** The query the framework hands the implementation factory and snapshots at a request's start. */
	readonly prices: CatalogPriceSource;
	/** The query the framework hands the implementation factory and asks once per operation. */
	readonly access: ProviderAccess;
	/** Records the catalog and registry of the context one delivery came from. */
	saw(ctx: OmpSessionContext): void;
}

/**
 * The harness's own provider facts, read through the session contexts this process's bindings see.
 *
 * The harness's model catalog and provider registry are facts of the process, but the only reading
 * the extension surface offers is what a live session context carries, so this keeps those sources
 * of the newest context a delivery came from and answers every later question from them. A price or
 * access the sources do not state answers nothing rather than a guess, and nothing here is
 * snapshotted at binding time: a credential the host has since replaced or minted on demand, and a
 * catalog it has since changed, are what the next query sees.
 *
 * The address is read synchronously — the registry resolves it from its own overrides and models —
 * while the credential is awaited, because the host refreshes and mints one as the call needs it. A
 * context that reported no registry, or a registry that answers neither member, leaves the facts
 * absent: the extension is told the host has no access to that provider rather than being handed a
 * guess, another provider's credential or an empty string.
 *
 * What leaves this module is the two plain queries. The contexts they were read from stay here: no
 * native model, registry or context is handed to the framework or to an extension.
 */
export function createProviderFacts(): OmpProviderFacts {
	let newestCatalog: OmpSessionContext["models"];
	let newestRegistry: OmpSessionContext["modelRegistry"];
	return {
		prices: { priceOf: (provider, model) => harnessPriceOf(newestCatalog, provider, model) },
		access: {
			resolve: async provider => {
				if (newestRegistry === undefined) return undefined;
				const baseUrl = newestRegistry.getProviderBaseUrl?.(provider);
				const resolved = await newestRegistry.getApiKeyForProvider?.(provider);
				const credential = resolved === undefined || resolved === KEYLESS_CREDENTIAL ? undefined : resolved;
				if (baseUrl === undefined && credential === undefined) return undefined;
				return {
					...(baseUrl === undefined ? {} : { baseUrl }),
					...(credential === undefined ? {} : { credential }),
				};
			},
		},
		saw: ctx => {
			if (ctx.models !== undefined) newestCatalog = ctx.models;
			if (ctx.modelRegistry !== undefined) newestRegistry = ctx.modelRegistry;
		},
	};
}
