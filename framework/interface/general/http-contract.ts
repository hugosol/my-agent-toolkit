/** Canonical extension-facing declarations for the framework's guarded HTTP operation. */
export interface HttpRequestOptions {
	/** The HTTP method; `GET` when omitted. */
	readonly method?: string;
	/** The request headers, exactly as the caller prepared them. */
	readonly headers?: Readonly<Record<string, string>>;
	/** The request body, exactly as the caller prepared it; nothing is serialized. */
	readonly body?: string;
	/** The whole-exchange budget in milliseconds; shared default, then 30000ms when omitted. */
	readonly timeoutMs?: number;
	/** `false` (or omitted) connects directly; a string names one shared proxy entry. */
	readonly proxy?: false | string;
}

/** A failed operation; diagnostic output omits its potentially sensitive error detail. */
export interface HttpRequestFailure {
	readonly kind: "configuration" | "timeout" | "transport";
	readonly error: Error;
}

/** Success includes non-2xx responses, with the entire body already received under the budget. */
export type HttpRequestResult =
	| { readonly ok: true; readonly response: Response }
	| { readonly ok: false; readonly failure: HttpRequestFailure };
