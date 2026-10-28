/**
 * Isolated smoke: the framework's HTTP module against real loopback transports, in a process of
 * its own making.
 *
 * The permanent suite (`tests/framework/http.test.ts`) covers the module's semantics over an
 * injected call and uses no network at all. This script is the other half: the module's own
 * transport, a real shared configuration file on disk and real loopback servers — two targets, a
 * plain proxy, an HTTPS proxy, a proxy-environment trap — so the promises a mock cannot make are
 * observed rather than asserted:
 *
 * - an explicit selection is what actually carries the request: the proxy records the request
 *   line it was handed, and the target's own record shows the hop it arrived through;
 * - `proxy: false`, and no `proxy` at all, really connect directly — the target records the
 *   request with no hop, and neither the trap nor any proxy saw anything;
 * - the ambient proxy environment decides nothing: `HTTP_PROXY`, `HTTPS_PROXY` and their
 *   lowercase spellings point at a real listening trap for the whole run, and the trap records
 *   zero requests — including in a *separate process* started with that environment, which
 *   drives the published `request` and nothing else: a direct GET, `proxy: false`, an HTTPS
 *   target, a POST whose method, headers and body the target records, and a non-2xx answer whose
 *   status and body the caller reads;
 * - both proxy connection protocols work: `http://` over plain TCP, `https://` over TLS;
 * - an HTTPS target goes through a proxy's CONNECT tunnel, over both protocols, which is the
 *   path a provider endpoint takes through a named proxy;
 * - a proxy that cannot be connected to fails the request, and the request is *not* re-sent
 *   direct: the target records nothing new;
 * - the wait budget covers reading the body, not only waiting for the response head (a target
 *   that sends its head at once and its body late), while the same body arrives under a budget
 *   large enough for it; the budget also ends a proxied exchange whose target never answers its
 *   head; and the built-in 30000ms is what a hung request really waits;
 * - a disabled named entry connects directly with its real proxy untouched; an enabled entry
 *   whose address is not an HTTP proxy, an undeclared name and a missing shared file are all
 *   refused before anything is sent, with the target recording no new request; a non-2xx answer
 *   comes back as a response, and a body that stops before its end fails the read.
 *
 * Everything runs on `127.0.0.1` with a temporary configuration root of its own; no repository
 * file is written, no harness is started, no credential is read and no real provider is
 * contacted. Run it with:
 *
 * ```sh
 * bun scripts/http-transport-smoke.ts
 * ```
 *
 * The same file, started with `--direct-probe <plain target> <HTTPS target>`, is the isolated
 * child that run spawns; it drives the published entry and prints what it observed.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as http from "node:http";
import { connect as netConnect, type Socket } from "node:net";
import { tmpdir } from "node:os";
import * as path from "node:path";
import {
	type HttpRequestResult,
	type HttpRequestOptions,
	request as publishedRequest,
} from "../framework/interface/general/http";
import { createHttpModule } from "../framework/modules/http";

/** A smoke success must carry a usable response, never an invented fallback. */
function successfulResponse(result: HttpRequestResult): Response {
	if (!result.ok) throw result.failure.error;
	return result.response;
}

/**
 * The isolated child's own run: the published `request`, in a process started with the proxy
 * environment this script means to prove is not consulted. It prints what it observed; the parent
 * owns the servers and rules on the routes from its own records.
 */
async function directProbe(args: readonly string[]): Promise<void> {
	const [plainTarget, secureTarget] = args;
	const report = [
		`environment HTTP_PROXY=${process.env.HTTP_PROXY ?? "unset"} HTTPS_PROXY=${process.env.HTTPS_PROXY ?? "unset"}`,
	];
	const show = async (label: string, url: string, options?: HttpRequestOptions): Promise<void> => {
		try {
			const response = successfulResponse(await publishedRequest(url, options));
			report.push(`${label}: status ${response.status} body ${await response.text()}`);
		} catch (error) {
			report.push(`${label}: rejected ${(error as Error).name}`);
		}
	};
	await show("omitted", `${plainTarget}/ok`);
	await show("proxy: false", `${plainTarget}/ok`, { proxy: false });
	await show("omitted, an HTTPS target", `${secureTarget}/ok`);
	await show("method, headers and body", `${plainTarget}/echo`, {
		method: "POST",
		headers: { "content-type": "application/json", "x-smoke-sentinel": "sentinel-value" },
		body: '{"sessionId":"one"}',
	});
	await show("a non-2xx answer", `${plainTarget}/missing`);
	// Written and awaited rather than printed, so the parent is handed the whole report even
	// though this process ends right after saying it.
	await Bun.write(Bun.stdout, `${report.join("\n")}\n`);
}

// This child deliberately has no uncaughtException/unhandledRejection handlers: a native stream
// error escaping the operation must fail the process, not be hidden by the regression harness.
if (process.argv.includes("--connect-timeout-probe")) {
	const diagnostics: string[] = [];
	let accepted = 0;
	let closed = 0;
	const stalledProxy = Bun.listen<{ accepted: boolean }>({
		hostname: "127.0.0.1",
		port: 0,
		socket: {
			open(socket) { socket.data = { accepted: false }; },
			data(socket, bytes) {
				if (socket.data.accepted) return; // Deliberately never progress the TLS handshake.
				if (!bytes.toString().startsWith("CONNECT ")) throw new Error("expected CONNECT");
				socket.data.accepted = true;
				accepted++;
				socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
			},
			close(socket) { if (socket.data.accepted) closed++; },
		},
	});
	const recoveryTarget = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("recovered") });
	try {
		const module = createHttpModule({
			configPath: "connect-timeout-probe.yaml",
			reader: () => `http:\n  proxies:\n    stalled:\n      enabled: true\n      url: http://127.0.0.1:${stalledProxy.port}\n`,
			reportDiagnostic: message => diagnostics.push(message),
		});
		const result = await module.request("https://127.0.0.1:443/private", { proxy: "stalled", timeoutMs: 120 });
		const recovery = await module.request(`http://127.0.0.1:${recoveryTarget.port}/`, { timeoutMs: 1000 });
		await Bun.sleep(80); // Let late native destroy/error/close events run before the child exits.
		const recovered = recovery.ok && await recovery.response.text() === "recovered";
		const passed = !result.ok && result.failure.kind === "timeout" && result.failure.error.name === "TimeoutError"
			&& diagnostics.length === 1 && diagnostics[0] === "HTTP timeout failure (TimeoutError)"
			&& accepted === 1 && closed === 1 && recovered;
		console.log(JSON.stringify({ passed, kind: result.ok ? "success" : result.failure.kind, diagnostics: diagnostics.length, accepted, closed, recovered }));
		process.exitCode = passed ? 0 : 1;
	} finally {
		stalledProxy.stop(true);
		recoveryTarget.stop(true);
	}
	process.exit(process.exitCode ?? 0);
}

// P20/P25: real CONNECT setup and tunneled TLS cancellation. Configuration is isolated,
// but the request API, signal composition and native transport remain real throughout.
if (process.argv.includes("--connect-cancellation-probe")) {
	const reports: unknown[] = [];
	for (const stage of ["connect-head", "tunnel-tls"] as const) {
		const reached = Promise.withResolvers<void>();
		const disconnected = Promise.withResolvers<void>();
		let accepted = 0;
		let closed = 0;
		const diagnostics: string[] = [];
		const stalledProxy = Bun.listen<{ connected: boolean }>({
			hostname: "127.0.0.1", port: 0,
			socket: {
				open(socket) { socket.data = { connected: false }; },
				data(socket, bytes) {
					if (!socket.data.connected) {
						if (!bytes.toString().startsWith("CONNECT ")) {
							reached.reject(new Error("expected CONNECT request"));
							return;
						}
						socket.data.connected = true;
						accepted++;
						if (stage === "connect-head") reached.resolve();
						else socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
					} else if (bytes[0] === 22) reached.resolve(); // The actual TLS ClientHello.
				},
				close() { closed++; disconnected.resolve(); },
			},
		});
		try {
			const module = createHttpModule({
				configPath: "connect-cancellation-probe.yaml",
				reader: () => `http:\n  proxies:\n    stalled:\n      enabled: true\n      url: http://127.0.0.1:${stalledProxy.port}\n`,
				reportDiagnostic: message => diagnostics.push(message),
			});
			const caller = new AbortController();
			const reason = new Error(`cancel ${stage}`);
			const pending = module.request("https://127.0.0.1:443/private", {
				proxy: "stalled", signal: caller.signal, timeoutMs: 1000,
			});
			await reached.promise;
			caller.abort(reason);
			const result = await pending;
			await disconnected.promise;
			const passed = !result.ok && result.failure.kind === "cancelled" && result.failure.error === reason
				&& accepted === 1 && closed === 1
				&& diagnostics.length === 1 && diagnostics[0] === "HTTP cancelled failure (Error)";
			reports.push({ stage, passed, accepted, closed, kind: result.ok ? "success" : result.failure.kind });
			if (!passed) process.exitCode = 1;
		} finally {
			stalledProxy.stop(true);
		}
	}
	console.log(JSON.stringify(reports));
	process.exit(process.exitCode ?? 0);
}

if (process.argv.includes("--direct-probe")) {
	await directProbe(process.argv.slice(process.argv.indexOf("--direct-probe") + 1));
	process.exit(0);
}

/** One request the target served: what it was asked for, and which hop carried it there. */
interface TargetHit {
	readonly method: string;
	readonly path: string;
	/** The proxy hop this request arrived through, or `null` when it arrived directly. */
	readonly hop: string | null;
	readonly body: string;
	readonly sentinel: string | null;
}

/** One request a proxy was asked to carry. */
interface ProxySighting {
	readonly hop: string;
	/** `absolute-form` is the URL a plain-HTTP request is handed; `CONNECT` is a tunnel request. */
	readonly kind: "absolute-form" | "CONNECT";
	/** The request line, as the proxy was handed it. */
	readonly line: string;
}

/** One loopback server, and what it recorded. */
interface Recorded {
	readonly port: number;
	readonly sightings: ProxySighting[];
	readonly stop: () => void;
}

/** One observation the evidence records, in the order it was made. */
interface Observation {
	readonly check: string;
	readonly outcome: "pass" | "fail" | "note";
	readonly detail: string;
}

const observations: Observation[] = [];

function observe(check: string, outcome: boolean | "note" | "fail", detail: string): void {
	const settled = outcome === "note" ? "note" : outcome === "fail" ? "fail" : outcome ? "pass" : "fail";
	observations.push({ check, outcome: settled, detail });
	console.log(`${settled === "pass" ? "PASS" : settled === "fail" ? "FAIL" : "NOTE"}  ${check} — ${detail}`);
}

/** One settlement, with how long it really took. */
interface Settled {
	readonly elapsedMs: number;
	readonly outcome: string;
}

/** Run one piece of work and report how it settled and how long it took, without throwing. */
async function timed(started: number, work: () => Promise<unknown>): Promise<Settled> {
	try {
		const value = await work();
		if (value !== null && typeof value === "object" && "ok" in value && !(value instanceof Response)) {
			const result = value as HttpRequestResult;
			return { elapsedMs: Date.now() - started, outcome: result.ok ? `resolved (status ${result.response.status})` : `failed ${result.failure.kind} ${result.failure.error.name}` };
		}
		const status = value instanceof Response ? `status ${value.status}` : "a value";
		return { elapsedMs: Date.now() - started, outcome: `resolved (${status})` };
	} catch (error) {
		const failure = error as { readonly name?: string; readonly message?: string };
		return { elapsedMs: Date.now() - started, outcome: `rejected ${failure.name ?? "Error"}: ${failure.message ?? ""}` };
	}
}

/** A response the proxy's own forward received from the target. */
interface UpstreamAnswer {
	readonly status: number;
	readonly body: string;
}

/** The header block of one request line, lower-cased by name. */
function headersOf(head: string): Record<string, string> {
	const headers: Record<string, string> = {};
	for (const line of head.split("\r\n").slice(1)) {
		const colon = line.indexOf(":");
		if (colon > 0) headers[line.slice(0, colon).trim().toLowerCase()] = line.slice(colon + 1).trim();
	}
	return headers;
}

/** The `reached` path one target's own answer names, when the answer carries one. */
function reachedPath(payload: unknown): string | undefined {
	if (typeof payload !== "object" || payload === null || !("reached" in payload)) return undefined;
	const reached = payload.reached;
	return typeof reached === "string" ? reached : undefined;
}

/** The fields one echo answer carries, as far as these checks reach into it. */
function echoedFields(payload: unknown): { readonly method?: string; readonly body?: string; readonly sentinel?: string } {
	if (typeof payload !== "object" || payload === null) return {};
	const fields: { method?: string; body?: string; sentinel?: string } = {};
	if ("method" in payload && typeof payload.method === "string") fields.method = payload.method;
	if ("body" in payload && typeof payload.body === "string") fields.body = payload.body;
	if ("sentinel" in payload && typeof payload.sentinel === "string") fields.sentinel = payload.sentinel;
	return fields;
}

/**
 * Carry one proxied request to the target over this process's own `node:http` connection.
 *
 * This is the proxy stand-in's own forwarding, deliberately *not* the module's transport: the
 * point is to show that the client reached the proxy and that the request was fulfilled from
 * there. The forwarded request carries the hop's name, so the target's own record says which hop
 * carried it — a request that had gone directly would carry none.
 */
function forward(
	url: string,
	method: string,
	headers: Record<string, string>,
	body: string,
): Promise<UpstreamAnswer> {
	const answer = Promise.withResolvers<UpstreamAnswer>();
	const call = http.request(url, { method, headers }, upstream => {
		let received = "";
		upstream.setEncoding("utf8");
		upstream.on("data", chunk => {
			received += chunk as string;
		});
		upstream.on("end", () => answer.resolve({ status: upstream.statusCode ?? 0, body: received }));
		upstream.on("error", answer.reject);
	});
	call.on("error", answer.reject);
	call.end(body);
	return answer.promise;
}

/**
 * One loopback proxy: it records every request it is handed, carries absolute-form requests to
 * the target they name and opens the tunnel a CONNECT asks for. Given a certificate and key it
 * is an HTTPS proxy: the connection to it is a TLS handshake, which is the whole difference the
 * two proxy protocols name.
 */
function startProxy(label: string, tls: { readonly cert: string; readonly key: string } | undefined): Recorded {
	const sightings: ProxySighting[] = [];
	let port = 0;

	/** The name this hop's own requests carry, so the target's record says who carried them. */
	const hopOf = (): string => `${label}:${port}`;

	const server = Bun.listen<{ received: Buffer; upstream?: Socket }>({
		hostname: "127.0.0.1",
		port: 0,
		...(tls === undefined ? {} : { tls }),
		socket: {
			open(socket) {
				socket.data = { received: Buffer.alloc(0) };
			},
			data(socket, chunk) {
				const state = socket.data;
				if (state.upstream !== undefined) {
					state.upstream.write(chunk);
					return;
				}
				state.received = Buffer.concat([state.received, chunk]);
				const head = state.received.indexOf("\r\n\r\n");
				if (head === -1) return;
				const headText = state.received.subarray(0, head).toString("utf8");
				const [line = ""] = headText.split("\r\n");
				const [method = "", requestTarget = ""] = line.split(" ");
				const headers = headersOf(headText);
				const length = Number(headers["content-length"] ?? "0");
				const body = state.received.subarray(head + 4);
				if (body.length < length) return;
				state.received = Buffer.alloc(0);
				const hop = hopOf();

				if (method === "CONNECT") {
					sightings.push({ hop, kind: "CONNECT", line });
					const [authorityHost, authorityPort] = requestTarget.split(":");
					if (authorityHost === undefined || authorityPort === undefined || authorityPort === "") {
						// A CONNECT authority must name the port; a real proxy refuses a bare host
						// rather than guessing at one.
						socket.write("HTTP/1.1 400 Bad Request\r\ncontent-length: 0\r\nconnection: close\r\n\r\n");
						socket.end();
						return;
					}
					const upstream = netConnect(Number(authorityPort), authorityHost, () => {
						socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
					});
					upstream.on("data", inner => socket.write(inner));
					upstream.on("end", () => socket.end());
					upstream.on("error", () => socket.end());
					state.upstream = upstream;
					return;
				}

				sightings.push({ hop, kind: "absolute-form", line });
				void forward(requestTarget, method, { ...headers, "x-smoke-hop": hop }, body.subarray(0, length).toString("utf8")).then(
					answer => {
						socket.write(
							[
								`HTTP/1.1 ${answer.status} Proxied`,
								`x-smoke-answer: ${hop}`,
								`content-length: ${Buffer.byteLength(answer.body)}`,
								"connection: close",
								"",
								answer.body,
							].join("\r\n"),
						);
						socket.end();
					},
					(error: Error) => {
						socket.write(`HTTP/1.1 502 ${error.name}\r\ncontent-length: 0\r\nconnection: close\r\n\r\n`);
						socket.end();
					},
				);
			},
			drain() {},
			close(socket) {
				socket.data.upstream?.destroy();
			},
		},
	});
	port = server.port;
	return { port, sightings, stop: () => server.stop(true) };
}

/**
 * The trap the ambient proxy environment points at: it answers whatever it is handed, and records
 * the request line first, so a connection this module did not ask for shows up here rather than
 * passing unnoticed.
 */
function startTrap(): Recorded {
	const sightings: ProxySighting[] = [];
	const server = Bun.listen<{ received: Buffer }>({
		hostname: "127.0.0.1",
		port: 0,
		socket: {
			open(socket) {
				socket.data = { received: Buffer.alloc(0) };
			},
			data(socket, chunk) {
				socket.data.received = Buffer.concat([socket.data.received, chunk]);
				const head = socket.data.received.indexOf("\r\n\r\n");
				if (head === -1) return;
				const line = socket.data.received.subarray(0, head).toString("utf8").split("\r\n")[0] ?? "";
				sightings.push({ hop: "ambient-trap", kind: line.startsWith("CONNECT ") ? "CONNECT" : "absolute-form", line });
				const body = "TRAPPED";
				socket.write(`HTTP/1.1 200 Trapped\r\ncontent-length: ${body.length}\r\nconnection: close\r\n\r\n${body}`);
				socket.end();
			},
			drain() {},
			close() {},
		},
	});
	return { port: server.port, sightings, stop: () => server.stop(true) };
}

/** One loopback target: the endpoint a request is meant to reach, whatever route it takes. */
function startTarget(): { readonly port: number; readonly hits: TargetHit[]; readonly stop: () => void } {
	const hits: TargetHit[] = [];
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		// A request that is meant to hang must be able to hang past the server's own default idle
		// timeout, so the built-in 30000ms budget is what ends it.
		idleTimeout: 60,
		async fetch(request) {
			const url = new URL(request.url);
			const body = await request.text();
			hits.push({
				method: request.method,
				path: url.pathname,
				hop: request.headers.get("x-smoke-hop"),
				body,
				sentinel: request.headers.get("x-smoke-sentinel"),
			});
			if (url.pathname === "/hang") return Promise.withResolvers<Response>().promise;
			if (url.pathname.startsWith("/bodyless/")) return new Response(null, {
				status: Number(url.pathname.split("/")[2]), statusText: "Bodyless", headers: { "x-preserved": "yes" },
			});
			if (url.pathname === "/slow-body") {
				const late = new ReadableStream({
					start(controller) {
						setTimeout(() => {
							// A reader that ran out of budget cancels the stream, so the late body has
							// nowhere to go — which is exactly what that case observed.
							try {
								controller.enqueue(new TextEncoder().encode('{"late":true}'));
								controller.close();
							} catch {
								// The reader is gone; nothing is left to deliver the body to.
							}
						}, 600);
					},
				});
				return new Response(late, { headers: { "content-type": "application/json" } });
			}
			if (url.pathname === "/missing") return new Response("no such account", { status: 404 });
			if (url.pathname === "/echo") {
				return Response.json({ method: request.method, body, sentinel: request.headers.get("x-smoke-sentinel") });
			}
			return Response.json({ reached: url.pathname });
		},
	});
	return { port: server.port ?? 0, hits, stop: () => void server.stop(true) };
}

/**
 * One target that answers a body shorter than the length it declares and then closes: a body that
 * stops before its end, which the caller's read has to fail on rather than pass off as complete.
 */
function startShortBodyTarget(): { readonly port: number; readonly stop: () => void } {
	const server = Bun.listen<{ received: Buffer }>({
		hostname: "127.0.0.1",
		port: 0,
		socket: {
			open(socket) {
				socket.data = { received: Buffer.alloc(0) };
			},
			data(socket, chunk) {
				socket.data.received = Buffer.concat([socket.data.received, chunk]);
				if (socket.data.received.indexOf("\r\n\r\n") === -1) return;
				socket.end("HTTP/1.1 200 OK\r\ncontent-length: 4096\r\nconnection: close\r\n\r\n{\"truncated\":true}");
			},
			drain() {},
			close() {},
		},
	});
	return { port: server.port, stop: () => server.stop(true) };
}

const root = mkdtempSync(path.join(tmpdir(), "http-transport-smoke-"));
const certFile = path.join(root, "cert.pem");
const keyFile = path.join(root, "key.pem");

// The isolated smoke's own trust of its own loopback certificate: the genuine TLS handshake is
// the evidence, and the certificate is one this run just made up for 127.0.0.1. Nothing about the
// module's own behavior depends on this — it is this process's TLS trust, not its routing. The
// switch is set before any connection is made, and the TLS proxies below only complete a
// handshake, so a client that did not really speak TLS could not reach them at all.
const certificate = Bun.spawnSync({
	cmd: [
		"openssl",
		"req",
		"-x509",
		"-newkey",
		"rsa:2048",
		"-nodes",
		"-keyout",
		keyFile,
		"-out",
		certFile,
		"-days",
		"1",
		"-subj",
		"/CN=127.0.0.1",
		"-addext",
		"subjectAltName=IP:127.0.0.1,DNS:localhost",
	],
	stdout: "pipe",
	stderr: "pipe",
});
const tlsAvailable = certificate.exitCode === 0;
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
if (!tlsAvailable) {
	observe(
		"a TLS certificate for the HTTPS transports",
		"fail",
		`openssl could not make one, so the HTTPS transports are not exercised here: ${certificate.stderr.toString()}`,
	);
}
const tls = tlsAvailable ? { cert: readFileSync(certFile, "utf8"), key: readFileSync(keyFile, "utf8") } : undefined;

const target = startTarget();
const shortTarget = startShortBodyTarget();
const trap = startTrap();
const proxy = startProxy("http-proxy", undefined);
const tlsProxy = tls === undefined ? undefined : startProxy("https-proxy", tls);
const tlsTarget =
	tls === undefined
		? undefined
		: Bun.serve({
				hostname: "127.0.0.1",
				port: 0,
				tls,
				fetch: request => Response.json({ reached: new URL(request.url).pathname }),
			});

/** The ambient proxy environment this whole run is under: six real names, one real listening trap. */
const trapUrl = `http://127.0.0.1:${trap.port}`;
const ambient = ["HTTP_PROXY", "http_proxy", "HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy"] as const;
const ambientBefore = ambient.map(name => [name, process.env[name]] as const);
for (const name of ambient) process.env[name] = trapUrl;

const targetUrl = `http://127.0.0.1:${target.port}`;
const tlsTargetUrl = tlsTarget === undefined ? "" : `https://127.0.0.1:${tlsTarget.port}`;

writeFileSync(
	path.join(root, "shared.yaml"),
	[
		"http:",
		"  defaultTimeoutMs: 30000",
		"  proxies:",
		"    loopback:",
		"      enabled: true",
		`      url: "http://127.0.0.1:${proxy.port}"`,
		...(tlsProxy === undefined
			? []
			: ["    loopback-tls:", "      enabled: true", `      url: "https://127.0.0.1:${tlsProxy.port}"`]),
		"    refused:",
		"      enabled: true",
		'      url: "http://127.0.0.1:1"',
		"",
	].join("\n"),
);
writeFileSync(path.join(root, "no-default.yaml"), "http:\n  proxies: {}\n");
writeFileSync(path.join(root, "short-default.yaml"), "http:\n  defaultTimeoutMs: 300\n");
writeFileSync(
	path.join(root, "disabled-proxy.yaml"),
	[
		"http:",
		"  proxies:",
		"    loopback:",
		"      enabled: false",
		`      url: "http://127.0.0.1:${proxy.port}"`,
		"",
	].join("\n"),
);
writeFileSync(
	path.join(root, "invalid-proxy.yaml"),
	[
		"http:",
		"  proxies:",
		"    loopback:",
		"      enabled: true",
		'      url: "socks5://127.0.0.1:1080"',
		"",
	].join("\n"),
);
writeFileSync(path.join(root, "empty-proxies.yaml"), "http:\n  proxies: {}\n");

const shared = createHttpModule({ configPath: path.join(root, "shared.yaml") });
const noDefault = createHttpModule({ configPath: path.join(root, "no-default.yaml") });
const shortDefault = createHttpModule({ configPath: path.join(root, "short-default.yaml") });
const unconfigured = createHttpModule({ configPath: path.join(root, "absent.yaml") });
const disabledProxy = createHttpModule({ configPath: path.join(root, "disabled-proxy.yaml") });
const invalidProxy = createHttpModule({ configPath: path.join(root, "invalid-proxy.yaml") });
const undeclaredProxy = createHttpModule({ configPath: path.join(root, "empty-proxies.yaml") });

/** The sightings both proxies have made, cleared before each case that counts them. */
function clearSightings(): void {
	proxy.sightings.length = 0;
	if (tlsProxy !== undefined) tlsProxy.sightings.length = 0;
}

const lastHit = (): TargetHit | undefined => target.hits[target.hits.length - 1];

{
	const child = Bun.spawn({
		cmd: [process.execPath, path.join(import.meta.dir, "http-transport-smoke.ts"), "--connect-timeout-probe"],
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
	observe(
		"a CONNECT tunnel stalled before TLS times out once without an uncaught error and permits recovery",
		exit === 0 && stdout.includes('"passed":true') && stderr.trim() === "",
		`child exit ${exit}; ${stdout.trim() || stderr.trim()}`,
	);
}

{
	const child = Bun.spawn({
		cmd: [process.execPath, path.join(import.meta.dir, "http-transport-smoke.ts"), "--connect-cancellation-probe"],
		stdout: "pipe", stderr: "pipe",
	});
	const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
	observe(
		"caller cancellation closes CONNECT waiting and tunneled TLS sockets without uncaught errors",
		exit === 0 && stdout.includes('"stage":"connect-head","passed":true')
			&& stdout.includes('"stage":"tunnel-tls","passed":true') && stderr.trim() === "",
		`child exit ${exit}; ${stdout.trim() || stderr.trim()}`,
	);
}

{
	// 1 — an omitted proxy is a direct connection: the target serves it, nothing else is touched.
	//     This runs under the ambient proxy environment, which must take nothing.
	const before = target.hits.length;
	const trapBefore = trap.sightings.length;
	clearSightings();
	const response = successfulResponse(await shared.request(`${targetUrl}/ok`));
	const hit = lastHit();
	observe(
		"an omitted proxy connects directly",
		response.status === 200 &&
			target.hits.length === before + 1 &&
			hit?.hop === null &&
			proxy.sightings.length === 0 &&
			trap.sightings.length === trapBefore,
		`status ${response.status}; the target recorded "${hit?.path ?? ""}" with hop ${String(hit?.hop)}; the proxy recorded ${proxy.sightings.length} request(s) and the ambient trap ${trap.sightings.length - trapBefore}`,
	);
}

{
	// 2 — `proxy: false` is the same direct connection, stated rather than omitted.
	const before = target.hits.length;
	const trapBefore = trap.sightings.length;
	clearSightings();
	const response = successfulResponse(await shared.request(`${targetUrl}/ok`, { proxy: false }));
	const hit = lastHit();
	observe(
		"proxy: false connects directly",
		response.status === 200 &&
			target.hits.length === before + 1 &&
			hit?.hop === null &&
			proxy.sightings.length === 0 &&
			trap.sightings.length === trapBefore,
		`status ${response.status}; the target recorded hop ${String(hit?.hop)}; the proxy recorded ${proxy.sightings.length} request(s) and the ambient trap ${trap.sightings.length - trapBefore}`,
	);
}

{
	// 3 — a named entry puts the request through the HTTP proxy, over plain TCP: the proxy is
	//     handed the absolute URL, and the target serves it from that hop.
	const before = target.hits.length;
	clearSightings();
	const response = successfulResponse(await shared.request(`${targetUrl}/ok`, { proxy: "loopback" }));
	const hit = lastHit();
	const expectedHop = `http-proxy:${proxy.port}`;
	observe(
		"a named entry is carried by the HTTP proxy, over plain TCP",
		response.status === 200 &&
			proxy.sightings.length === 1 &&
			proxy.sightings[0]!.line === `GET ${targetUrl}/ok HTTP/1.1` &&
			target.hits.length === before + 1 &&
			hit?.hop === expectedHop &&
			response.headers.get("x-smoke-answer") === expectedHop,
		`the proxy was handed "${proxy.sightings[0]?.line ?? ""}"; the target served it with hop ${String(hit?.hop)}; the client got the target's answer back through ${String(response.headers.get("x-smoke-answer"))}`,
	);
}

{
	// 4 — the method, headers and body the caller prepared arrive at the target, through the
	//     proxy, exactly as prepared: nothing is added, serialized or rewritten on the way.
	const before = target.hits.length;
	clearSightings();
	const response = successfulResponse(await shared.request(`${targetUrl}/echo`, {
		method: "POST",
		headers: { "content-type": "application/json", "x-smoke-sentinel": "sentinel-value" },
		body: '{"sessionId":"one"}',
		proxy: "loopback",
	}));
	const hit = lastHit();
	const echoed = echoedFields(await response.json());
	observe(
		"the caller's method, headers and body arrive through the proxy exactly as prepared",
		response.status === 200 &&
			target.hits.length === before + 1 &&
			hit?.method === "POST" &&
			hit?.body === '{"sessionId":"one"}' &&
			hit?.sentinel === "sentinel-value" &&
			echoed.body === '{"sessionId":"one"}' &&
			echoed.sentinel === "sentinel-value",
		`the target recorded ${hit?.method ?? ""} body ${hit?.body ?? ""} with sentinel ${String(hit?.sentinel)}; the answer echoed body ${String(echoed.body)}`,
	);
}

if (tlsProxy === undefined) {
	// The HTTPS proxy protocol cannot be exercised without a certificate; that is reported above.
} else {
	// 5 — the same entry through the HTTPS proxy: the connection to the proxy is TLS.
	const before = target.hits.length;
	clearSightings();
	const response = successfulResponse(await shared.request(`${targetUrl}/ok`, { proxy: "loopback-tls" }));
	const hit = lastHit();
	const expectedHop = `https-proxy:${tlsProxy.port}`;
	observe(
		"a named entry is carried by the HTTPS proxy, over TLS",
		response.status === 200 &&
			tlsProxy.sightings.length === 1 &&
			tlsProxy.sightings[0]!.line === `GET ${targetUrl}/ok HTTP/1.1` &&
			proxy.sightings.length === 0 &&
			target.hits.length === before + 1 &&
			hit?.hop === expectedHop,
		`the TLS proxy was handed "${tlsProxy.sightings[0]?.line ?? ""}"; the target served it with hop ${String(hit?.hop)}; the plain HTTP proxy saw nothing`,
	);
}

if (tlsTarget === undefined) {
	// The HTTPS target cannot be exercised without a certificate; that is reported above.
} else {
	// 6 — an HTTPS target through the plain proxy: the proxy is asked to CONNECT, and the TLS
	//     handshake to the target runs over that tunnel. This is the provider path.
	const expectedAuthority = `127.0.0.1:${tlsTarget.port}`;
	clearSightings();
	const response = successfulResponse(await shared.request(`${tlsTargetUrl}/ok`, { proxy: "loopback" }));
	const reached = reachedPath(await response.json());
	observe(
		"an HTTPS target is reached through the plain proxy's CONNECT tunnel",
		response.status === 200 &&
			reached === "/ok" &&
			proxy.sightings.length === 1 &&
			proxy.sightings[0]!.kind === "CONNECT" &&
			proxy.sightings[0]!.line === `CONNECT ${expectedAuthority} HTTP/1.1`,
		`the proxy was handed "${proxy.sightings[0]?.line ?? ""}"; the client read reached=${String(reached)} from the TLS target`,
	);

	if (tlsProxy !== undefined) {
		// 7 — the same HTTPS target through the HTTPS proxy: TLS to the proxy, CONNECT inside it,
		//     then TLS to the target over the tunnel.
		clearSightings();
		const answer = successfulResponse(await shared.request(`${tlsTargetUrl}/ok`, { proxy: "loopback-tls" }));
		const readBack = reachedPath(await answer.json());
		observe(
			"an HTTPS target is reached through the HTTPS proxy's CONNECT tunnel",
			answer.status === 200 &&
				readBack === "/ok" &&
				tlsProxy.sightings.length === 1 &&
				tlsProxy.sightings[0]!.kind === "CONNECT" &&
				tlsProxy.sightings[0]!.line === `CONNECT ${expectedAuthority} HTTP/1.1`,
			`the TLS proxy was handed "${tlsProxy.sightings[0]?.line ?? ""}"; the client read reached=${String(readBack)} back`,
		);
	}

	{
		// 6b — the CONNECT authority states the port even when it is the scheme's default: `URL.host`
		//      drops `:443`, and a proxy handed a bare host refuses the tunnel or sends it elsewhere.
		//      Nothing listens on 443 here; the request line the proxy was handed is the evidence.
		const defaultAuthority = "127.0.0.1:443";
		clearSightings();
		try {
			const response = successfulResponse(await shared.request("https://127.0.0.1/", { proxy: "loopback", timeoutMs: 2_000 }));
			await response.text();
		} catch {
			// Only the request line matters; whether a listener answered on 443 is not this case's claim.
		}
		observe(
			"a CONNECT authority names the port even when it is the scheme's default",
			proxy.sightings.length === 1 &&
				proxy.sightings[0]!.kind === "CONNECT" &&
				proxy.sightings[0]!.line === `CONNECT ${defaultAuthority} HTTP/1.1`,
			`the proxy was handed "${proxy.sightings[0]?.line ?? ""}"`,
		);
	}

	// 8 — the same HTTPS target with no proxy at all, under an ambient HTTPS_PROXY: the request
	//     still reaches the target, and the trap records nothing.
	const trapBefore = trap.sightings.length;
	clearSightings();
	const direct = successfulResponse(await shared.request(`${tlsTargetUrl}/ok`));
	const reachedDirectly = reachedPath(await direct.json());
	observe(
		"an HTTPS target with no proxy reaches the target under an ambient HTTPS_PROXY",
		direct.status === 200 && reachedDirectly === "/ok" && trap.sightings.length === trapBefore && proxy.sightings.length === 0,
		`status ${direct.status}; the client read reached=${String(reachedDirectly)}; the ambient trap (HTTPS_PROXY=${trapUrl}) recorded ${trap.sightings.length - trapBefore} request(s)`,
	);
}

{
	// 9 — a proxy that cannot be connected to fails the request; nothing is re-sent direct.
	const before = target.hits.length;
	const started = Date.now();
	const settled = await timed(started, () => shared.request(`${targetUrl}/ok`, { proxy: "refused" }));
	observe(
		"a refused proxy fails the request and is not re-sent direct",
		settled.outcome.startsWith("failed transport") && target.hits.length === before,
		`${settled.outcome} after ${settled.elapsedMs}ms; the target recorded ${target.hits.length - before} new request(s)`,
	);
}

{
	for (const status of [204, 205, 304]) {
		const result = await shared.request(`${targetUrl}/bodyless/${status}`, { timeoutMs: 1000 });
		observe(`native status ${status} preserves its null body and headers`,
			result.ok && result.response.status === status
				&& result.response.body === null && result.response.headers.get("x-preserved") === "yes",
			result.ok ? `status ${result.response.status}; null body ${result.response.body === null}` : `failed ${result.failure.kind}`);
	}
	const head = await shared.request(`${targetUrl}/ok`, { method: "HEAD", timeoutMs: 1000 });
	observe("a native HEAD response is usable with a null body", head.ok && head.response.status === 200 && head.response.body === null,
		head.ok ? `status ${head.response.status}; null body ${head.response.body === null}` : `failed ${head.failure.kind}`);
}

{
	// 10 — a non-2xx answer is a response, not a failure, and its body reads.
	const started = Date.now();
	const settled = await timed(started, async () => {
		const response = successfulResponse(await shared.request(`${targetUrl}/missing`, { proxy: "loopback" }));
		return new Response(await response.text(), { status: response.status });
	});
	observe(
		"a non-2xx answer comes back for the caller to interpret",
		settled.outcome === "resolved (status 404)",
		`${settled.outcome} after ${settled.elapsedMs}ms`,
	);
}

{
	// 10b — the budget ends an exchange carried through a selected proxy too: the target never
	//       answers the head, so the wait is the client's own deadline rather than the proxy's.
	const before = target.hits.length;
	clearSightings();
	const started = Date.now();
	const settled = await timed(started, () =>
		shared.request(`${targetUrl}/hang`, { proxy: "loopback", timeoutMs: 200 }),
	);
	const hit = lastHit();
	observe(
		"the wait budget ends a proxied exchange waiting for the response head",
		settled.outcome.includes("TimeoutError") &&
			settled.elapsedMs >= 150 &&
			settled.elapsedMs < 800 &&
			proxy.sightings.length === 1 &&
			target.hits.length === before + 1 &&
			hit?.path === "/hang" &&
			hit?.hop === `http-proxy:${proxy.port}`,
		`${settled.outcome} after ${settled.elapsedMs}ms; the proxy was handed ${proxy.sightings.length} request(s) and the target recorded "/hang" through hop ${String(hit?.hop)}`,
	);
}

{
	// 11 — the budget covers the body: the head is answered at once, the body late, and the read
	//      fails when the budget runs out.
	const started = Date.now();
	const settled = await timed(started, () => shared.request(`${targetUrl}/slow-body`, { timeoutMs: 200 }));
	observe(
		"the wait budget covers reading the body",
		settled.outcome.includes("TimeoutError") && settled.elapsedMs >= 150 && settled.elapsedMs < 600,
		`${settled.outcome} after ${settled.elapsedMs}ms (the target sent its head at once and its body after 600ms)`,
	);
}

{
	// 12 — the same body does arrive when the budget is large enough, so 11's failure is the
	//      budget and not a body that never came.
	const started = Date.now();
	const settled = await timed(started, async () => {
		const response = successfulResponse(await shared.request(`${targetUrl}/slow-body`, { timeoutMs: 1500 }));
		const body = await response.text();
		return new Response(body, { status: response.status });
	});
	observe(
		"the same body arrives under a budget large enough for it",
		settled.outcome.startsWith("resolved") && settled.elapsedMs >= 600,
		`${settled.outcome} after ${settled.elapsedMs}ms`,
	);
}

{
	// 13 — a body that stops before its end fails the read, rather than passing an incomplete body
	//      off as the whole answer.
	const started = Date.now();
	const settled = await timed(started, () => shared.request(`http://127.0.0.1:${shortTarget.port}/ok`, { timeoutMs: 5000 }));
	observe(
		"a body that stops before its end fails the read",
		settled.outcome.startsWith("failed transport"),
		`${settled.outcome} after ${settled.elapsedMs}ms (the target declared 4096 bytes and sent 17)`,
	);
}

{
	// 14 — the shared default is what a real request waits when it declares no budget.
	const started = Date.now();
	const settled = await timed(started, () => shortDefault.request(`${targetUrl}/hang`));
	observe(
		"the shared http.defaultTimeoutMs is the budget of a real request",
		settled.outcome.includes("TimeoutError") && settled.elapsedMs >= 250 && settled.elapsedMs < 1500,
		`${settled.outcome} after ${settled.elapsedMs}ms (the file declares 300ms)`,
	);
}

{
	// 15 — with nothing declared, the built-in 30000ms is what a hung request waits.
	const started = Date.now();
	const settled = await timed(started, () => noDefault.request(`${targetUrl}/hang`));
	observe(
		"the built-in budget is what a request with nothing declared waits",
		settled.outcome.includes("TimeoutError") && settled.elapsedMs >= 29000 && settled.elapsedMs < 40000,
		`${settled.outcome} after ${settled.elapsedMs}ms`,
	);
}

{
	// 16 — a proxy selection with no shared file is refused, and nothing is sent.
	const before = target.hits.length;
	const started = Date.now();
	const settled = await timed(started, () => unconfigured.request(`${targetUrl}/ok`, { proxy: "loopback" }));
	observe(
		"a selection with no shared file is refused, not turned into a direct request",
		settled.outcome.startsWith("failed configuration") && target.hits.length === before,
		`${settled.outcome} after ${settled.elapsedMs}ms; the target recorded ${target.hits.length - before} new request(s)`,
	);
}

{
	// 16b — an explicitly disabled named entry connects directly even though a real proxy listens
	//       at its declared url: the target records the direct hit and the proxy sees nothing.
	const before = target.hits.length;
	clearSightings();
	const response = successfulResponse(await disabledProxy.request(`${targetUrl}/ok`, { proxy: "loopback" }));
	const hit = lastHit();
	observe(
		"a disabled named entry connects directly, with its real proxy untouched",
		response.status === 200 &&
			proxy.sightings.length === 0 &&
			target.hits.length === before + 1 &&
			hit?.hop === null,
		`status ${response.status}; the target recorded hop ${String(hit?.hop)}; the real proxy recorded ${proxy.sightings.length} request(s)`,
	);
}

{
	// 16c — an enabled entry whose address is not an HTTP proxy is refused before anything is
	//       sent: the target records nothing new.
	const before = target.hits.length;
	const started = Date.now();
	const settled = await timed(started, () => invalidProxy.request(`${targetUrl}/ok`, { proxy: "loopback" }));
	observe(
		"an invalid named entry is refused before anything is sent",
		settled.outcome.startsWith("failed configuration") && target.hits.length === before,
		`${settled.outcome} after ${settled.elapsedMs}ms; the target recorded ${target.hits.length - before} new request(s)`,
	);
}

{
	// 16d — a name the existing table does not declare is refused before anything is sent.
	const before = target.hits.length;
	const started = Date.now();
	const settled = await timed(started, () => undeclaredProxy.request(`${targetUrl}/ok`, { proxy: "loopback" }));
	observe(
		"an undeclared named entry is refused before anything is sent",
		settled.outcome.startsWith("failed configuration") && target.hits.length === before,
		`${settled.outcome} after ${settled.elapsedMs}ms; the target recorded ${target.hits.length - before} new request(s)`,
	);
}

if (tlsTarget === undefined) {
	// The spawn-time check needs the HTTPS target; the certificate failure is already reported.
	observe(
		"a separate process under a spawn-time proxy environment still reaches the target directly",
		"note",
		"no HTTPS target was available, so the isolated process check was not run — the certificate failure above is what the run reports",
	);
} else {
	// 17 — a separate process, started with the proxy environment in its own environment, drives
	//      the published `request` and still reaches the targets directly.
	const trapBefore = trap.sightings.length;
	const hitsBefore = target.hits.length;
	const child = Bun.spawn({
		cmd: [
			process.execPath,
			path.join(import.meta.dir, "http-transport-smoke.ts"),
			"--direct-probe",
			targetUrl,
			tlsTargetUrl,
		],
		env: {
			...process.env,
			HTTP_PROXY: trapUrl,
			http_proxy: trapUrl,
			HTTPS_PROXY: trapUrl,
			https_proxy: trapUrl,
			ALL_PROXY: trapUrl,
			all_proxy: trapUrl,
			NODE_TLS_REJECT_UNAUTHORIZED: "0",
		},
		stdout: "pipe",
		stderr: "pipe",
	});
	const [childOut, childErr, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	const recorded = target.hits.slice(hitsBefore);
	const okHits = recorded.filter(hit => hit.path === "/ok" && hit.method === "GET");
	const echoHit = recorded.find(hit => hit.path === "/echo");
	const missingHit = recorded.find(hit => hit.path === "/missing");
	const printed = childOut.trim().split("\n").join(" | ") || childErr.trim().split("\n")[0] || "nothing";
	observe(
		"a separate process under a spawn-time proxy environment still reaches the target directly",
		exitCode === 0 &&
			recorded.length === 4 &&
			okHits.length === 2 &&
			recorded.every(hit => hit.hop === null) &&
			echoHit?.method === "POST" &&
			echoHit.body === '{"sessionId":"one"}' &&
			echoHit.sentinel === "sentinel-value" &&
			missingHit?.method === "GET" &&
			trap.sightings.length === trapBefore &&
			childOut.includes("omitted: status 200 body") &&
			childOut.includes("proxy: false: status 200 body") &&
			childOut.includes("omitted, an HTTPS target: status 200") &&
			childOut.includes("method, headers and body: status 200 body {") &&
			childOut.includes("a non-2xx answer: status 404 body no such account"),
		`the child exited ${exitCode}, the target recorded ${recorded.length} request(s) with hops ${recorded.map(hit => String(hit.hop)).join("/")} (${recorded.map(hit => `${hit.method} ${hit.path}`).join(", ")}), the ambient trap recorded ${trap.sightings.length - trapBefore} request(s), and it printed: ${printed}`,
	);
}

{
	// 18 — the whole run's own accounting: the ambient proxy environment carried nothing, in any
	//      case, including the direct HTTPS requests.
	observe(
		"no request in this run was carried by the ambient proxy environment",
		trap.sightings.length === 0,
		`the trap at ${trapUrl} recorded ${trap.sightings.length} request(s) while HTTP_PROXY, HTTPS_PROXY and ALL_PROXY pointed at it`,
	);
}

for (const [name, value] of ambientBefore) {
	if (value === undefined) delete process.env[name];
	else process.env[name] = value;
}
target.stop();
shortTarget.stop();
trap.stop();
proxy.stop();
tlsProxy?.stop();
tlsTarget?.stop(true);
rmSync(root, { recursive: true, force: true });

const failed = observations.filter(observation => observation.outcome === "fail").length;
const passed = observations.filter(observation => observation.outcome === "pass").length;
console.log(`\nSMOKE SUMMARY: ${passed} passed, ${failed} failed, ${observations.length - passed - failed} observation(s)`);
process.exit(failed === 0 ? 0 : 1);
