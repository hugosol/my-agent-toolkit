/**
 * The general HTTP module's implementation: the one outbound request, the shared proxy table and
 * the native client behind the extension-facing entry
 * [`framework/interface/general/http.ts`](../interface/general/http.ts).
 *
 * It is harness-independent and delivery-free: an extension's shared logic imports `request`
 * through that interface entry, and a suite builds its own module over the injectable seam inside
 * this file rather than receiving an HTTP capability through a command or event delivery. What
 * makes it more than a rename of the platform's call is what it owns: the
 * shared proxy table, the per-request choice among its entries, the precedence of the wait
 * budget, and the one place the framework's own configuration file is read and a request is
 * really made.
 *
 * The shape is deliberately small and the meaning fixed:
 *
 * - One call, `request(url, options)`. The caller prepares the method (`GET` when omitted), the
 *   headers, the body and the budget; nothing is inferred and nothing is decorated — no
 *   content type is added, nothing is serialized, and no bearer header is managed. The
 *   runtime's own response is returned, a non-2xx answer included, for the caller to
 *   interpret; there is no business result envelope.
 * - Transport failure and a wait that runs out reject; a body that fails to read rejects the
 *   read. None of these is turned into `null`, zero or a success/error result.
 * - `proxy: false`, and no `proxy` at all, is a direct connection. A string names one entry of
 *   the shared `http.proxies` table. An entry is used only when it says `enabled: true`; any
 *   other entry is an explicitly disabled one, and the request connects directly without
 *   reading its `url` (so a disabled entry may keep a placeholder or none). A selection the
 *   configuration cannot satisfy is refused before anything is sent: no file, no table, no such
 *   entry, an entry that is not a mapping, and an enabled entry without a usable HTTP or HTTPS
 *   address are all errors, never a silent direct request. A proxy that connects and then fails
 *   propagates that failure; the request is not re-sent direct.
 * - The budget is `options.timeoutMs`, else the shared `http.defaultTimeoutMs`, else 30000ms. A
 *   declared budget must be a whole number of milliseconds the harness's timer schedules —
 *   `0` does not turn the wait off, and an illegal value is refused rather than replaced. It
 *   covers waiting for the response *and* reading its body: the module imposes it on the
 *   connection it made, so a body that is still arriving when the budget runs out fails the
 *   read. Business work after the whole body has been read is outside it.
 * - Nothing here reads or writes the ambient proxy environment, and nothing takes over the
 *   network the harness uses for its own model requests and OAuth updates: the request states
 *   the path it wants (`proxy: false` for a direct connection) and never consults
 *   `HTTP_PROXY`, `HTTPS_PROXY` or a `PI_PROXY_*` name to choose one. There is also no
 *   cancellation channel — the caller declares a budget, the module imposes it, and no
 *   controller is published.
 * - The connection is made by this runtime's own `node:http`/`node:https` client, whose address
 *   is the one this module settled on and nothing else: a direct connection reaches the target,
 *   and a named proxy is reached at its own address. The process's `fetch` is deliberately not
 *   the transport, because a process-level proxy environment redirects it even for a request
 *   that states a direct connection. A plain-HTTP target through a proxy is asked for by its
 *   absolute URL; an HTTPS target is reached through a CONNECT tunnel, with the connection to
 *   the proxy itself over TLS when the proxy's address is `https://`. A redirect is an answer
 *   like any other: it is returned to the caller rather than followed.
 * - That client speaks HTTP/1.1, and no `accept-encoding` is added and nothing is decoded: the
 *   caller's headers decide what it asks for, and the bytes that arrive are the bytes it reads,
 *   with the response's own `content-encoding` header saying what they are.
 *
 * The shared file is `framework/config.yaml`, beside this module's own directory, and it is
 * read once per module instance — so an edited value takes effect with the next process, not
 * with the next request. It is optional: with no file, a direct request still works on the
 * built-in budget and a request that names a proxy is refused. Its shape:
 *
 * ```yaml
 * http:
 *   defaultTimeoutMs: 30000
 *   proxies:
 *     codex:
 *       enabled: true
 *       url: "http://127.0.0.1:7890"
 * ```
 */
import * as http from "node:http";
import * as https from "node:https";
import { isIP } from "node:net";
import { dirname, resolve } from "node:path";
import type { Duplex } from "node:stream";
import { connect as openTlsConnection } from "node:tls";
import { fileURLToPath } from "node:url";
import {
	ConfigLoadError,
	describeValue,
	isScheduledWait,
	readConfigDocument,
	SCHEDULED_WAIT_TEXT,
	type ConfigParser,
	type ConfigReader,
} from "../core/config";
import { HttpConfigurationError, type HttpRequestOptions } from "../interface/general/http-contract";

/** One outbound call, as this module makes it. */
export interface HttpTransportInit {
	/** The method the request is sent with (`GET` when the caller named none). */
	readonly method: string;
	/** The caller's headers, untouched. */
	readonly headers?: Readonly<Record<string, string>>;
	/** The caller's body, untouched. */
	readonly body?: string;
	/**
	 * The imposed budget: the deadline for the whole exchange, covering waiting for the response
	 * as well as reading its body, and not detached once the response head arrives.
	 */
	readonly signal: AbortSignal;
	/** The path this request states: a proxy URL, or `false` for a direct connection. */
	readonly proxy: string | false;
}

/** One outbound call, as a module makes it: the runtime's own client over the path this states. */
export type HttpTransport = (url: string, init: HttpTransportInit) => Promise<Response>;

/**
 * What a module instance runs through.
 *
 * Every member is injectable so a suite covers each failure path and observes each request
 * without a real file and without a network — this is the module's own seam, and no public
 * entry publishes it.
 */
export interface HttpModuleSeam {
	/** The outbound call; this module's own client over `framework/config.yaml` by default. */
	readonly transport?: HttpTransport;
	/** The shared configuration file; `framework/config.yaml` beside this module by default. */
	readonly configPath?: string;
	/** How the shared file's text is obtained and parsed; this process's own means by default. */
	readonly reader?: ConfigReader;
	readonly parser?: ConfigParser;
}

/** One module instance: the request call and the shared file it reads. */
export interface HttpModule {
	request(url: string, options?: HttpRequestOptions): Promise<Response>;
}

/** The shared configuration file: `framework/config.yaml`, beside this module's own directory. */
const SHARED_CONFIGURATION_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "..", "config.yaml");

/** The wait a request with no declared budget, and no shared default, gets. */
const BUILT_IN_TIMEOUT_MS = 30000;

/** Whether one declared string is the address of an HTTP or HTTPS proxy — the two this framework supports. */
function isProxyUrl(value: string): boolean {
	try {
		const address = new URL(value);
		return address.protocol === "http:" || address.protocol === "https:";
	} catch {
		return false;
	}
}

/** The port one address resolves to when its own text does not name one. */
function portOf(address: URL): number {
	if (address.port !== "") return Number(address.port);
	return address.protocol === "https:" ? 443 : 80;
}

/** One connection an exchange has open, so the wait running out can take all of it down. */
interface OpenConnection {
	destroy(reason?: unknown): void;
}

/**
 * Where one request is sent, and what it asks for: the address this module connects to, the
 * request-target that goes over that connection, and — for a target reached through a proxy's
 * CONNECT tunnel — the connection this module already made.
 */
interface Endpoint {
	/** The address connected to: the proxy when one is selected, the target otherwise. */
	readonly host: string;
	readonly port: number;
	/** Whether this runtime makes the TLS connection to that address itself. */
	readonly secure: boolean;
	/** The request-target: the absolute URL a proxy is handed, the path alone when direct. */
	readonly path: string;
	/** The origin the request states in `Host`, which a proxied request still names. */
	readonly hostHeader: string;
	/** The connection already made — a CONNECT tunnel — that the request rides on. */
	readonly tunnel?: Duplex;
}

/**
 * One agent handing its request the connection that already exists: the tunnel this module
 * opened, so the runtime neither makes nor shares any other socket. One agent belongs to one
 * request, and nothing here keeps a connection for the next one.
 */
class TunnelAgent extends http.Agent {
	readonly #tunnel: Duplex;

	constructor(tunnel: Duplex) {
		super({ keepAlive: false, maxSockets: 1 });
		this.#tunnel = tunnel;
	}

	override createConnection(): Duplex {
		return this.#tunnel;
	}
}

/** One started request: the runtime's own client request, and the response head it answers with. */
interface Started {
	readonly call: http.ClientRequest;
	readonly head: Promise<http.IncomingMessage>;
}

/** Start one request over the endpoint this module settled on. */
function start(endpoint: Endpoint, init: HttpTransportInit): Started {
	const settled = Promise.withResolvers<http.IncomingMessage>();
	const headers: Record<string, string> = { ...init.headers };
	if (headers["host"] === undefined && headers["Host"] === undefined) headers["host"] = endpoint.hostHeader;
	const options: https.RequestOptions = {
		host: endpoint.host,
		port: endpoint.port,
		path: endpoint.path,
		method: init.method,
		headers,
		agent: endpoint.tunnel === undefined ? false : new TunnelAgent(endpoint.tunnel),
	};
	const call = endpoint.secure ? https.request(options, settled.resolve) : http.request(options, settled.resolve);
	call.on("error", settled.reject);
	// The whole request goes out at once: the caller prepared one body, and nothing is streamed.
	call.end(init.body);
	return { call, head: settled.promise };
}

/**
 * One step of an exchange: the runtime's own answer, or the failure that is the wait running out —
 * whichever comes first, so a connection that never answers cannot outlive the budget.
 */
function raceWithWait<T>(signal: AbortSignal, answer: Promise<T>): Promise<T> {
	if (signal.aborted) return Promise.reject(signal.reason);
	const settled = Promise.withResolvers<T>();
	const waitRanOut = (): void => settled.reject(signal.reason);
	signal.addEventListener("abort", waitRanOut, { once: true });
	answer.then(
		value => {
			signal.removeEventListener("abort", waitRanOut);
			settled.resolve(value);
		},
		reason => {
			signal.removeEventListener("abort", waitRanOut);
			settled.reject(reason);
		},
	);
	return settled.promise;
}

/**
 * Open the CONNECT tunnel an HTTPS target needs from a proxy: this runtime connects to the
 * proxy — over TLS when the proxy's own address is `https://` — the proxy connects to the
 * target's address, and the connection that comes back is the tunnel. The TLS connection to the
 * target then runs over that tunnel, which is the path a provider endpoint takes through a named
 * proxy, and the tunnel is one of the connections the wait can take down.
 */
async function openTunnel(
	target: URL,
	proxy: URL,
	signal: AbortSignal,
	open: OpenConnection[],
): Promise<Duplex> {
	const client = proxy.protocol === "https:" ? https : http;
	// A CONNECT request-target is in authority-form, which always names the port. `URL.host` drops a
	// scheme's default port (`https://example.com/` is `example.com`), so the port is written
	// explicitly: a proxy handed a bare host may tunnel somewhere else, or nowhere at all.
	const authority = `${target.hostname}:${portOf(target)}`;
	const call = client.request({
		host: proxy.hostname,
		port: portOf(proxy),
		method: "CONNECT",
		path: authority,
		headers: { host: authority },
		agent: false,
	});
	open.push(call);
	const tunneled = Promise.withResolvers<Duplex>();
	call.on("connect", (_answer, socket) => tunneled.resolve(socket));
	call.on("error", tunneled.reject);
	call.end();
	const tunnel = await raceWithWait(signal, tunneled.promise);
	open.push(tunnel);
	if (target.protocol !== "https:") return tunnel;

	const secure = openTlsConnection({
		socket: tunnel,
		// An address that is itself an IP literal is not a server name: SNI states none for it.
		...(isIP(target.hostname) === 0 ? { servername: target.hostname } : {}),
	});
	open.push(secure);
	const handshake = Promise.withResolvers<void>();
	secure.once("secureConnect", handshake.resolve);
	secure.once("error", handshake.reject);
	await raceWithWait(signal, handshake.promise);
	return secure;
}

/**
 * Where one request goes: straight to the target, through a proxy handed the absolute
 * request-target, or through a CONNECT tunnel when the target itself is TLS.
 */
async function endpointFor(
	target: URL,
	proxy: string | false,
	signal: AbortSignal,
	open: OpenConnection[],
): Promise<Endpoint> {
	const direct: Endpoint = {
		host: target.hostname,
		port: portOf(target),
		secure: target.protocol === "https:",
		path: `${target.pathname}${target.search}`,
		hostHeader: target.host,
	};
	if (proxy === false) return direct;
	const address = new URL(proxy);
	if (target.protocol === "http:") {
		// A plain-HTTP target needs no tunnel: the proxy is handed the absolute URL to ask for.
		return {
			host: address.hostname,
			port: portOf(address),
			secure: address.protocol === "https:",
			path: target.href,
			hostHeader: target.host,
		};
	}
	// An HTTPS target rides the tunnel: the TLS connection to it is already made, so the request
	// over that connection is the plain one.
	return { ...direct, secure: false, tunnel: await openTunnel(target, address, signal, open) };
}

/**
 * The runtime's own response, with a body whose reads carry the same wait: the budget covers the
 * body as much as the head, so a read that outlives it fails rather than waiting for bytes that
 * are no longer wanted. A body that stops before its end fails the read too.
 */
function responseOf(message: http.IncomingMessage, signal: AbortSignal, stopWaiting: () => void): Response {
	const headers = new Headers();
	for (const [name, value] of Object.entries(message.headers)) {
		if (value === undefined) continue;
		for (const single of Array.isArray(value) ? value : [value]) headers.append(name, single);
	}
	let finished = false;
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			const finish = (settle: () => void): void => {
				if (finished) return;
				finished = true;
				stopWaiting();
				settle();
			};
			message.on("data", (chunk: Buffer) => {
				controller.enqueue(chunk);
				if (controller.desiredSize !== null && controller.desiredSize <= 0) message.pause();
			});
			message.on("end", () => finish(() => controller.close()));
			message.on("error", error => finish(() => controller.error(signal.aborted ? signal.reason : error)));
			// A connection that ends without an end or an error carried no whole body: the read
			// fails rather than returning what happened to arrive.
			message.on("close", () =>
				finish(() => controller.error(new Error("the response ended before the whole body arrived"))),
			);
		},
		pull() {
			message.resume();
		},
		cancel(reason) {
			finished = true;
			stopWaiting();
			message.destroy(reason instanceof Error ? reason : undefined);
		},
	});
	return new Response(body, {
		status: message.statusCode ?? 0,
		statusText: message.statusMessage ?? "",
		headers,
	});
}

/**
 * The transport this module makes by default: this runtime's own HTTP client, over a connection
 * this module chose and under the caller's own budget.
 *
 * The process's `fetch` is deliberately not used, because a process-level proxy environment
 * redirects it even for a request that states `proxy: false`; this client connects to the
 * address it is given and reads no environment of its own. Nothing here reads or writes
 * `HTTP_PROXY`, `HTTPS_PROXY` or any other ambient name.
 */
async function nativeTransport(url: string, init: HttpTransportInit): Promise<Response> {
	const target = new URL(url);
	const signal = init.signal;
	if (target.protocol !== "http:" && target.protocol !== "https:") {
		throw new TypeError(`the request target "${url}" is not an HTTP or HTTPS address`);
	}
	if (signal.aborted) throw signal.reason;

	/** Every connection this exchange has open, so the wait running out can take all of them down. */
	const open: OpenConnection[] = [];
	const waitRanOut = (): void => {
		for (const connection of open) connection.destroy(signal.reason);
	};
	signal.addEventListener("abort", waitRanOut);
	try {
		const endpoint = await endpointFor(target, init.proxy, signal, open);
		const started = start(endpoint, init);
		open.push(started.call);
		const message = await raceWithWait(signal, started.head);
		open.push(message);
		return responseOf(message, signal, () => signal.removeEventListener("abort", waitRanOut));
	} catch (error) {
		signal.removeEventListener("abort", waitRanOut);
		throw error;
	}
}

/**
 * One http module: a `request` call over a chosen platform call and shared file.
 *
 * The module the framework publishes is one instance of this over the process's own file
 * system, YAML parser and `fetch`; a suite builds its own instead, and observes every request
 * and every configuration failure without touching either.
 */
export function createHttpModule(seam: HttpModuleSeam = {}): HttpModule {
	const configPath = seam.configPath ?? SHARED_CONFIGURATION_PATH;
	const transport = seam.transport ?? nativeTransport;

	/**
	 * The shared document, read once per instance: `undefined` when no file exists beside the
	 * configured path, the empty mapping when one declares nothing. A read that *failed* is not
	 * remembered — only a successful read becomes this instance's configuration — exactly as
	 * the configuration module records only a validated file.
	 */
	let read = false;
	let document: Readonly<Record<string, unknown>> | undefined;

	function sharedDocument(): Readonly<Record<string, unknown>> | undefined {
		if (read) return document;
		let next: Readonly<Record<string, unknown>> | undefined;
		try {
			next = readConfigDocument(configPath, { reader: seam.reader, parser: seam.parser });
		} catch (error) {
			if (error instanceof ConfigLoadError) throw new HttpConfigurationError(error.detail);
			throw error;
		}
		document = next;
		read = true;
		return next;
	}

	/** The shared document's `http` section, or `undefined` when the file declares none. */
	function sharedHttpSection(): Readonly<Record<string, unknown>> | undefined {
		const shared = sharedDocument();
		if (shared === undefined) return undefined;
		const declared = shared["http"];
		if (declared === undefined) return undefined;
		if (typeof declared !== "object" || declared === null || Array.isArray(declared)) {
			throw new HttpConfigurationError(
				`the shared configuration file "${configPath}" declares "http" as ${describeValue(declared)}, but it must be a mapping`,
			);
		}
		return declared as Readonly<Record<string, unknown>>;
	}

	/** The settled path of one request: `false` for a direct connection, else the proxy URL to connect through. */
	function resolveProxy(selection: false | string | undefined): string | false {
		if (selection === undefined || selection === false) return false;
		if (typeof selection !== "string") {
			throw new HttpConfigurationError(
				`the request names the proxy ${describeValue(selection)}, which is neither a direct connection nor a proxy name`,
			);
		}
		const http = sharedHttpSection();
		if (http === undefined) {
			throw new HttpConfigurationError(
				sharedDocument() === undefined
					? `the request selects the proxy "${selection}", but the shared configuration file "${configPath}" does not exist`
					: `the shared configuration file "${configPath}" declares no "http" section, so the proxy "${selection}" cannot be resolved`,
			);
		}
		const table = http["proxies"];
		if (table === undefined) {
			throw new HttpConfigurationError(
				`the shared configuration file "${configPath}" declares no "http.proxies" table, so the proxy "${selection}" cannot be resolved`,
			);
		}
		if (typeof table !== "object" || table === null || Array.isArray(table)) {
			throw new HttpConfigurationError(
				`the shared configuration file "${configPath}" declares "http.proxies" as ${describeValue(table)}, but it must be a table of named proxy entries`,
			);
		}
		const entry = (table as Readonly<Record<string, unknown>>)[selection];
		if (entry === undefined) {
			throw new HttpConfigurationError(
				`the shared configuration file "${configPath}" declares no "http.proxies.${selection}" entry`,
			);
		}
		if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
			throw new HttpConfigurationError(
				`the shared configuration file "${configPath}" declares "http.proxies.${selection}" as ${describeValue(entry)}, but an entry is a mapping`,
			);
		}
		// Only an entry that says `enabled: true` selects the proxy. Any other entry is an
		// explicitly disabled one: the request connects directly, and the entry's `url` is not
		// read, so a disabled entry may keep a placeholder or none at all.
		if ((entry as Readonly<Record<string, unknown>>)["enabled"] !== true) return false;
		const address = (entry as Readonly<Record<string, unknown>>)["url"];
		if (address === undefined) {
			throw new HttpConfigurationError(
				`the shared configuration file "${configPath}" declares "http.proxies.${selection}" without a "url", which is the address to connect through`,
			);
		}
		if (typeof address !== "string" || address.length === 0 || !isProxyUrl(address)) {
			throw new HttpConfigurationError(
				`the shared configuration file "${configPath}" declares the "url" of "http.proxies.${selection}" as ${describeValue(address)}, which is not the address of an HTTP or HTTPS proxy`,
			);
		}
		return address;
	}

	/** The imposed budget of one request: its own value, else the shared default, else the built-in one. */
	function resolveTimeout(declared: number | undefined): number {
		if (declared !== undefined) {
			if (!isScheduledWait(declared)) {
				throw new HttpConfigurationError(
					`the request declares timeoutMs as ${describeValue(declared)}, but a wait budget is ${SCHEDULED_WAIT_TEXT}`,
				);
			}
			return declared;
		}
		const http = sharedHttpSection();
		const sharedDefault = http?.["defaultTimeoutMs"];
		if (sharedDefault === undefined) return BUILT_IN_TIMEOUT_MS;
		if (!isScheduledWait(sharedDefault)) {
			throw new HttpConfigurationError(
				`the shared configuration file "${configPath}" declares "http.defaultTimeoutMs" as ${describeValue(sharedDefault)}, but a wait budget is ${SCHEDULED_WAIT_TEXT}`,
			);
		}
		return sharedDefault;
	}

	async function request(url: string, options: HttpRequestOptions = {}): Promise<Response> {
		const proxy = resolveProxy(options.proxy);
		const timeoutMs = resolveTimeout(options.timeoutMs);
		return transport(url, {
			method: options.method ?? "GET",
			...(options.headers === undefined ? {} : { headers: options.headers }),
			...(options.body === undefined ? {} : { body: options.body }),
			signal: AbortSignal.timeout(timeoutMs),
			proxy,
		});
	}

	return { request };
}

/** The module the framework publishes: this process's own file system, YAML parser and HTTP client. */
const sharedModule = createHttpModule();

/**
 * Send one request through the framework's general HTTP module.
 *
 * The extension-facing entry ([`framework/interface/general/http.ts`](../interface/general/http.ts))
 * re-exports this call; `createHttpModule` is the module's own test seam and is not part of the
 * public surface. See the module comment above for the request's meaning, the proxy selection
 * rules and the wait budget.
 */
export function request(url: string, options: HttpRequestOptions = {}): Promise<Response> {
	return sharedModule.request(url, options);
}
