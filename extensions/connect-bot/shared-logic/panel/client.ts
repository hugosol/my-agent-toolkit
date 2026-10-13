/**
 * The wire client of connect-bot: the extension's only outbound dependency, and the one place
 * the panel protocol's constants live.
 *
 * The protocol is frozen and never configuration: one route, one envelope shape, one request
 * shape. The call that performs a request is the framework's own general HTTP module
 * (`framework/public.ts`), imported here rather than installed by the harness assembly: the
 * extension states the direct connection it means (`proxy: false`) and its own configured wait
 * (`timeoutMs`), and the framework's client makes the connection and imposes the budget. The
 * extension therefore carries no transport of its own, and a suite replaces the framework's one
 * call with a fake of the same interface to observe the production URL, request options and
 * response parsing without touching `globalThis`.
 */
import { type HttpRequestOptions, request } from "../../../../framework/public";

/** Closed kind enum of the wire contract; each kind carries its own `data` shape. */
export type PushKind = "register" | "heartbeat" | "state" | "unregister";

/**
 * One event envelope, `{sessionId, kind, data}`. `data` is omitted for an event whose contract
 * body is the envelope alone (today `unregister`).
 */
export interface PushEnvelope {
	readonly sessionId: string;
	readonly kind: PushKind;
	readonly data?: Record<string, unknown>;
}

/** The single session-event route. Protocol constant, never configuration. */
export const EVENTS_PATH = "/api/sessions/events";

/**
 * The framework's public HTTP call, as this extension names it: one request and the platform's
 * own response. The extension never writes its own transport, so a suite stands in an
 * implementation of exactly this interface.
 */
export type PanelRequest = (url: string, options?: HttpRequestOptions) => Promise<Response>;

/** The call every panel request goes through: the framework's own, until a suite stands in one. */
let panelRequest: PanelRequest = request;

/**
 * Test seam: the request a suite wants in effect instead of the framework's own; `null` puts
 * the framework's back.
 */
export function setPanelRequestForTest(next: PanelRequest | null): void {
	panelRequest = next ?? request;
}

/** Result of one push attempt. */
export interface PushOutcome {
	/** True for a 2xx response. */
	readonly ok: boolean;
	/** HTTP status, kept for a path where any answer means the panel is reachable. */
	readonly status: number;
	/** Parsed JSON body, or `undefined` when the body was empty or not JSON. */
	readonly body: unknown;
}

/**
 * POST one event. Resolves for any HTTP response, whatever its status; rejects only when the
 * request itself fails or exceeds `timeoutMs`. No retry: a failed event is dropped.
 *
 * The direct connection and the wait budget are the request's own declaration: the framework's
 * module connects to the target and imposes the budget on the whole exchange, the body read
 * included — which is why the body is read here, inside this call's budget.
 */
export async function pushEvent(
	endpoint: string,
	envelope: PushEnvelope,
	timeoutMs: number,
): Promise<PushOutcome> {
	const response = await panelRequest(`${endpoint}${EVENTS_PATH}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(envelope),
		timeoutMs,
		// The panel is reached directly: never through an ambient or configured proxy.
		proxy: false,
	});
	let body: unknown;
	try {
		body = JSON.parse(await response.text());
	} catch {
		body = undefined;
	}
	return { ok: response.status >= 200 && response.status < 300, status: response.status, body };
}

/**
 * Read a `register` success receipt, `{ outcome: "registered", onlineCount: N }` (N includes
 * this session). `undefined` for anything else — a non-2xx answer, or a 2xx answer whose body
 * is not the registered receipt. A panel that answers `404` therefore reports a failed arm
 * exactly as an unreachable one does.
 */
export function readRegisterOutcome(outcome: PushOutcome): { readonly onlineCount: number } | undefined {
	if (!outcome.ok || outcome.body === null || typeof outcome.body !== "object") return undefined;
	const { outcome: kind, onlineCount } = outcome.body as { outcome?: unknown; onlineCount?: unknown };
	if (kind !== "registered" || typeof onlineCount !== "number") return undefined;
	return { onlineCount };
}
