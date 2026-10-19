/**
 * The general HTTP module's canonical extension-facing declarations: what one request states,
 * and the one configuration failure its caller may recognize.
 *
 * They live beside the public entry ([`http.ts`](http.ts)) so the deep implementation in
 * `framework/modules/http.ts` references these declarations too — one class identity for the
 * failure thrown inside and recognized outside — while the entry connects `request` to that
 * implementation. Keeping the declarations separate from the entry's runtime import is what makes
 * that connection one-way instead of a module cycle.
 *
 * This is not a second entry: an extension imports `request`, `HttpRequestOptions` and
 * `HttpConfigurationError` from [`http.ts`](http.ts).
 */

/** The whole of one request: what the caller prepares, and nothing the framework decides for it. */
export interface HttpRequestOptions {
	/** The HTTP method; `GET` when omitted. */
	readonly method?: string;
	/** The request headers, exactly as the caller prepared them. */
	readonly headers?: Readonly<Record<string, string>>;
	/** The request body, exactly as the caller prepared it; nothing is serialized. */
	readonly body?: string;
	/**
	 * The wait budget for the whole exchange, in milliseconds. Omitted takes the shared
	 * `http.defaultTimeoutMs`, and with that absent the module's built-in 30000ms.
	 */
	readonly timeoutMs?: number;
	/** `false` (or omitted) connects directly; a string names one shared proxy entry. */
	readonly proxy?: false | string;
}

/**
 * One configuration failure that refuses a request before anything is sent: the shared file
 * cannot be read, or it does not declare what this request needs, or a declared wait budget is
 * not a wait this framework schedules.
 *
 * It is deliberately not a transport failure: nothing left the process, and no other path —
 * in particular no direct connection — was tried instead. Its `detail` is the deterministic
 * text of the failure.
 */
export class HttpConfigurationError extends Error {
	readonly detail: string;

	constructor(detail: string) {
		super(detail);
		this.name = "HttpConfigurationError";
		this.detail = detail;
	}
}
