/**
 * The wire client of connect-bot: the extension's only outbound dependency, and the one place
 * the panel protocol's constants live.
 *
 * The protocol is frozen and never configuration: one route, one envelope shape, one request
 * shape. The platform call that performs a request is *installed* rather than imported — the
 * extension's harness assembly supplies it (bun's `fetch`, with `proxy: false`) — so shared
 * logic names no platform API, and a suite replaces the transport with a fake to observe the
 * production URL, request init and response parsing without touching `globalThis`.
 */
import { CONNECT_BOT } from "../../definition";

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

/** Minimal response surface used here; the toolkit tsconfig carries no DOM fetch types. */
export interface PushHttpResponse {
	readonly status: number;
	text(): Promise<string>;
}

/** Minimal request surface used here; `proxy` is a bun-only fetch option. */
export interface PushFetchInit {
	readonly method: "POST";
	readonly headers: Record<string, string>;
	readonly body: string;
	readonly signal: AbortSignal;
	/** Never route a panel request through an ambient/`http_proxy` proxy. */
	readonly proxy: false;
}

/** The one outbound dependency: perform a single request. */
export type PushTransport = (url: string, init: PushFetchInit) => Promise<PushHttpResponse>;

/** The transport the harness assembly installed: the platform's own outbound call. */
let installedTransport: PushTransport | undefined;

/** The replacement a suite injected, when it injected one. */
let replacementTransport: PushTransport | undefined;

/**
 * Installs the transport the extension's harness assembly provides.
 *
 * Shared logic never reaches the platform's network API itself, so until a binding has
 * installed one there is nothing to send through — which is a misuse of the extension, not a
 * harness condition, and {@link pushEvent} says so rather than silently sending nothing.
 */
export function installPushTransport(next: PushTransport): void {
	installedTransport = next;
}

/**
 * Test seam: the transport a suite wants in effect instead of the harness's own; `null` puts
 * the installed one back.
 */
export function setPushTransportForTest(next: PushTransport | null): void {
	replacementTransport = next ?? undefined;
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
 */
export async function pushEvent(
	endpoint: string,
	envelope: PushEnvelope,
	timeoutMs: number,
): Promise<PushOutcome> {
	const transport = replacementTransport ?? installedTransport;
	if (transport === undefined) {
		throw new Error(`connect-bot: no outbound transport is installed for ${CONNECT_BOT.id}`);
	}
	const response = await transport(`${endpoint}${EVENTS_PATH}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(envelope),
		signal: AbortSignal.timeout(timeoutMs),
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
