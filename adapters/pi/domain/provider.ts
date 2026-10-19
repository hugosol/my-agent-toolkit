/**
 * pi's own host facts: the model prices and the current provider access its registry states, read
 * through the session contexts this process's bindings see.
 *
 * Both facts are readable only through the registry a live session context carries, while the
 * framework asks for them later and from outside every delivery: it snapshots a price at a request's
 * real start, and an extension's provider query reads the moment's credential. This module therefore
 * keeps the registry of the newest context a delivery came from and answers every later question
 * from it. What leaves it is the framework's plain price and access queries — never a native model,
 * registry or credential store.
 *
 * The queries are created once per assembly, because the registry is the process's; each binding
 * reports the contexts its own deliveries came from through `saw`. The two queries stay separate
 * facts with their own timing and missing meanings; sharing the file is locality, not a manager, a
 * cache or a unified lookup.
 */
import type { CatalogPrice, CatalogPriceSource, ProviderAccess } from "../../../framework/interface/host-facts";
import type { PiExtensionContext, PiModelRegistry } from "../internal/native";

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

/** pi's own host facts, and the live registry reading they are answered from. */
export interface PiHostFacts {
	/** The query the framework hands the implementation factory and snapshots at a request's start. */
	readonly prices: CatalogPriceSource;
	/** The query the framework hands the implementation factory and asks once per operation. */
	readonly access: ProviderAccess;
	/** Records the model registry of the context one delivery came from. */
	saw(ctx: PiExtensionContext): void;
}

/**
 * pi's own host facts, read through the session contexts this process's bindings see.
 *
 * The credential, the provider's address and the model catalog are facts of the host, and the reading
 * pi offers is the registry a live session context carries, so this keeps the registry of the newest
 * context a delivery came from and asks *it* at each later operation: a credential the host has since
 * replaced, or minted on demand, is what the extension gets, because nothing here is snapshot at
 * binding time. The registry object is the host's own and its answers are current; what crosses into
 * the framework is the plain queries and never the registry itself.
 *
 * The address is read from the provider's own entry or, when that entry states none, from the first
 * of its models — both are the registry's own statements — while the credential is awaited, because
 * pi resolves and refreshes it as the call needs it. A registry that answers neither member leaves
 * the facts absent: the extension is told the host has no access to that provider rather than being
 * handed a guess or another provider's credential.
 */
export function piHostFacts(): PiHostFacts {
	let newest: PiModelRegistry | undefined;
	return {
		prices: { priceOf: (provider, model) => harnessPriceOf(newest, provider, model) },
		access: {
			resolve: async provider => {
				if (newest === undefined) return undefined;
				const baseUrl = newest.getProvider(provider)?.baseUrl
					?? newest.getAll().find(row => row.provider === provider)?.baseUrl;
				const credential = await newest.getApiKeyForProvider(provider);
				if (baseUrl === undefined && credential === undefined) return undefined;
				return {
					...(baseUrl === undefined ? {} : { baseUrl }),
					...(credential === undefined ? {} : { credential }),
				};
			},
		},
		saw: ctx => {
			if (ctx.modelRegistry !== undefined) newest = ctx.modelRegistry;
		},
	};
}
