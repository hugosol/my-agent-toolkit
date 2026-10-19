/**
 * The general HTTP module's extension-facing entry: the one outbound request, what it states, and
 * the one configuration failure it can reject with before anything is sent.
 *
 * General is a plain shared-function module, not an adapter-backed capability: shared logic
 * imports `request` directly, and no delivery carries it. The canonical declarations live beside
 * this entry in [`http-contract.ts`](http-contract.ts); the deep implementation — the shared file,
 * the proxy table, the native client and the wait budget — stays in
 * `framework/modules/http.ts`, whose one published call this entry re-exports. The connection is
 * the deliberate thin runtime exception; the entry adds no second implementation.
 *
 * This entry exports exactly these three names and no transport factory, shared proxy table or
 * internal configuration reader.
 */
export { HttpConfigurationError, type HttpRequestOptions } from "./http-contract";

/** The implementation's one published call; see the module documentation for its meaning. */
export { request } from "../../modules/http";
