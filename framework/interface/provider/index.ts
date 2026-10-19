/**
 * The host-facts capability's extension-facing leaf declarations.
 *
 * These are the plain facts a host supplies to an extension — a catalog price, the provider access
 * an operation resolves, and the HTTP facts a Turn's response carried. They are values and queries,
 * never a native model registry, credential store or HTTP client; the adapter maps them, and the
 * extension consumes them without reaching a harness API.
 */

/**
 * One provider/model's catalog price, as the extension's own catalog reported it at a request's
 * start.
 *
 * The framework carries this value and never interprets it: the currency, the unit and the bucket
 * keys are the extension's own business vocabulary, and a catalog that has no entry for the model
 * answers with nothing.
 */
export interface CatalogPrice {
	/** The currency the amounts are expressed in, as the extension's catalog states it. */
	readonly currency: string;
	/** The unit the amounts are expressed per, as the extension's catalog states it. */
	readonly unit: string;
	/** The amounts, keyed by the extension's own token buckets. */
	readonly amounts: Readonly<Record<string, number>>;
}

/**
 * A model catalog, as the one party that owns it states its prices: the extension's own maintained
 * data or the harness's own model catalog.
 *
 * Both readings are queries and not subscriptions: there is no runtime catalog refresh, no cached
 * copy inside the framework, and a model a catalog does not carry is answered with nothing rather
 * than with a default.
 */
export interface CatalogPriceSource {
	/** The price this catalog states for one provider and exact model id, or nothing when it states none. */
	priceOf(provider: string, model: string): CatalogPrice | undefined;
}

/**
 * The HTTP facts one Turn's provider response carried, as the adapter could obtain them.
 *
 * `requestId` is the transport's own reference id when the response exposed one; it is reference
 * information like the assistant message's response id and is never the Turn's identity — the two
 * external ids are not assumed equal and neither is used to associate a delivery.
 */
export interface ProviderHttpFacts {
	readonly status: number;
	readonly headers: Readonly<Record<string, string>>;
	readonly metadata?: Readonly<Record<string, unknown>>;
	/** The transport-level request id the response exposed, when it exposed one. */
	readonly requestId?: string;
}

/**
 * One provider's current access facts, as the harness resolved them for one operation.
 *
 * Both members are facts the host holds and this framework never interprets: the address the
 * provider's own protocol is reached at, and the credential material that protocol authenticates
 * with. A member the host has nothing to say about is absent rather than empty, and the caller —
 * the extension that owns the query — decides what a missing address means for it.
 */
export interface ProviderAccessFacts {
	/** The provider's applicable base URL, when the host resolved one. */
	readonly baseUrl?: string;
	/**
	 * The credential material one operation authenticates with, when the host has one.
	 *
	 * It is the material itself — an API key or an access token — and never a header: formatting the
	 * request's authentication is the calling extension's business, exactly as every other request
	 * header is.
	 */
	readonly credential?: string;
}

/**
 * The harness's current access to one provider, as its adapter resolves it per operation.
 *
 * The query reads the host's state at the moment it is called — the credential a login or a key
 * replacement has since made effective included — rather than binding the first answer: the
 * framework hands the query to the implementation factory and asks it again for each later
 * operation, so nothing here is a snapshot and nothing is cached by the framework.
 *
 * An answer of nothing is the host having no access to that provider at all — no credential it could
 * use — and is deliberately not an empty credential: a caller that needs one fails its own query
 * rather than borrowing another provider's, guessing an account or sending nothing.
 */
export interface ProviderAccess {
	/** The current access facts for one provider, or nothing when the host has none. */
	resolve(provider: string): Promise<ProviderAccessFacts | undefined>;
}
