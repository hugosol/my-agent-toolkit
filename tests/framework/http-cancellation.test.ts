/**
 * manager-node-chat P20/P25, approved seam S2: only the published HTTP request.
 * Real loopback peers supply timing/failures and observe connection closure; no transport mock.
 */
import { describe, expect, test } from "bun:test";
import * as http from "node:http";
import { createServer, type Socket } from "node:net";
import { request, type HttpRequestResult, type HttpRequestFailure } from "../../framework/interface/general/http";

async function endpoint(handle: http.RequestListener) {
	const sockets = new Set<Socket>();
	const server = http.createServer(handle);
	server.on("connection", socket => {
		sockets.add(socket);
		socket.once("close", () => sockets.delete(socket));
	});
	const ready = Promise.withResolvers<void>();
	server.listen(0, "127.0.0.1", ready.resolve);
	await ready.promise;
	const address = server.address();
	if (address === null || typeof address === "string") throw new Error("expected loopback port");
	return {
		url: `http://127.0.0.1:${address.port}`,
		async stop() {
			for (const socket of sockets) socket.destroy();
			const closed = Promise.withResolvers<void>();
			server.close(error => error ? closed.reject(error) : closed.resolve());
			await closed.promise;
		},
	};
}

async function failure(operation: Promise<HttpRequestResult>, kind: HttpRequestFailure["kind"]): Promise<Error> {
	const result = await operation;
	expect(result.ok).toBe(false);
	if (result.ok) throw new Error("expected HTTP failure");
	expect(result.failure.kind).toBe(kind);
	return result.failure.error;
}

describe("public HTTP cancellation (P20/P25, S2)", () => {
	// P20 includes connecting, not just HTTP waiting. A real TCP peer receives the TLS
	// ClientHello but never completes the handshake; it must see closure before teardown.
	test("cancelling a pending TLS connection closes the connecting socket", async () => {
		const hello = Promise.withResolvers<Buffer>();
		const disconnected = Promise.withResolvers<void>();
		const sockets = new Set<Socket>();
		const server = createServer(socket => {
			sockets.add(socket);
			socket.once("data", hello.resolve);
			socket.once("close", () => { sockets.delete(socket); disconnected.resolve(); });
		});
		const ready = Promise.withResolvers<void>();
		server.listen(0, "127.0.0.1", ready.resolve);
		await ready.promise;
		try {
			const address = server.address();
			if (address === null || typeof address === "string") throw new Error("expected TCP port");
			const caller = new AbortController();
			const reason = new Error("stop TLS handshake");
			const pending = request(`https://127.0.0.1:${address.port}/`, { signal: caller.signal, timeoutMs: 1000 });
			expect((await hello.promise)[0]).toBe(22); // TLS handshake record, not an HTTP request.
			caller.abort(reason);
			expect(await failure(pending, "cancelled")).toBe(reason);
			await disconnected.promise;
		} finally {
			for (const socket of sockets) socket.destroy();
			const closed = Promise.withResolvers<void>();
			server.close(error => error ? closed.reject(error) : closed.resolve());
			await closed.promise;
		}
	});

	// P20 requires actual teardown, not merely a cancelled result. The peer deliberately
	// withholds headers; resolving the call without closing its socket cannot pass.
	test("cancelling while waiting for headers closes the active request", async () => {
		const received = Promise.withResolvers<void>();
		const disconnected = Promise.withResolvers<void>();
		const peer = await endpoint((incoming) => {
			incoming.socket.once("close", disconnected.resolve);
			received.resolve();
		});
		try {
			const caller = new AbortController();
			const reason = new Error("stop waiting for headers");
			const pending = request(peer.url, { signal: caller.signal, timeoutMs: 200 });
			await received.promise;
			caller.abort(reason);
			expect(await failure(pending, "cancelled")).toBe(reason);
			await disconnected.promise;
		} finally {
			await peer.stop();
		}
	});
	// P20 extends cancellation beyond headers. A peer flushes a declared, unfinished body;
	// an implementation that detaches abort at the head would leave this connection active.
	test("cancelling an unfinished response body closes its connection", async () => {
		const startedBody = Promise.withResolvers<void>();
		const disconnected = Promise.withResolvers<void>();
		const peer = await endpoint((incoming, response) => {
			if (incoming.url === "/barrier") {
				response.end("body remains open");
				return;
			}
			incoming.socket.once("close", disconnected.resolve);
			response.writeHead(200, { "content-length": "1000000" });
			response.write("first body bytes", () => startedBody.resolve());
		});
		try {
			const caller = new AbortController();
			const reason = new Error("stop receiving body");
			const pending = request(peer.url, { signal: caller.signal, timeoutMs: 1000 });
			await startedBody.promise;
			// A full independent HTTP exchange lets the real reader process the flushed
			// head/prefix without guessing a sleep duration, while the first body stays open.
			const barrier = await request(`${peer.url}/barrier`);
			if (!barrier.ok) throw barrier.failure.error;
			expect(await barrier.response.text()).toBe("body remains open");
			caller.abort(reason);
			expect(await failure(pending, "cancelled")).toBe(reason);
			await disconnected.promise;
		} finally {
			await peer.stop();
		}
	});

	// P25 retains the original client budget; P20 distinguishes caller cancellation by
	// its source, not the error's name. Ordered triggers have independently known outcomes.
	test("caller TimeoutError is cancellation, while the client budget remains timeout", async () => {
		const caller = new AbortController();
		const reason = new DOMException("caller-owned deadline", "TimeoutError");
		const peer = await endpoint((incoming) => {
			if (incoming.url === "/caller") caller.abort(reason);
		});
		try {
			expect(await failure(request(`${peer.url}/caller`, { signal: caller.signal, timeoutMs: 1000 }), "cancelled")).toBe(reason);
			const laterCaller = new AbortController();
			const result = await request(`${peer.url}/budget`, { signal: laterCaller.signal, timeoutMs: 40 });
			laterCaller.abort(new Error("too late to replace the adopted timeout"));
			expect(result.ok).toBe(false);
			if (result.ok) throw new Error("expected budget exhaustion");
			expect(result.failure.kind).toBe("timeout");
			expect(result.failure.error.name).toBe("TimeoutError");
			expect(result.failure.error).not.toBe(laterCaller.signal.reason);
		} finally {
			await peer.stop();
		}
	});

	// P25 promises complete success and non-2xx bodies. These literal multi-part responses
	// would catch returning only the head/prefix or converting an HTTP error into transport failure.
	test("successful and non-2xx bodies remain complete with caller cancellation enabled", async () => {
		const peer = await endpoint((incoming, response) => {
			response.writeHead(incoming.url === "/success" ? 200 : 409, { "x-result": "preserved" });
			response.write('{"stateCommitted":true,');
			setImmediate(() => response.end('"historyError":"retained"}'));
		});
		try {
			for (const [route, status] of [["success", 200], ["failure", 409]] as const) {
				const caller = new AbortController();
				const result = await request(`${peer.url}/${route}`, { signal: caller.signal });
				if (!result.ok) throw result.failure.error;
				caller.abort(new Error("response already received"));
				expect(result.response.status).toBe(status);
				expect(result.response.headers.get("x-result")).toBe("preserved");
				expect(await result.response.text()).toBe('{"stateCommitted":true,"historyError":"retained"}');
			}
		} finally {
			await peer.stop();
		}
	});

	// Expected: a pre-cancelled call sends nothing (P20). Plausible violation: ignore the
	// caller's signal and issue the request. The subsequent successful request proves this
	// same endpoint was reachable; the peer must have received only that independent call.
	test("pre-cancellation sends no request and does not poison a later call", async () => {
		const received: string[] = [];
		const peer = await endpoint((incoming, response) => {
			received.push(incoming.url!);
			response.end("independent response");
		});
		try {
			const caller = new AbortController();
			const reason = new Error("cancel before starting");
			caller.abort(reason);
			expect(await failure(request(`${peer.url}/cancelled`, { signal: caller.signal }), "cancelled")).toBe(reason);
			const next = await request(`${peer.url}/independent`);
			if (!next.ok) throw next.failure.error;
			expect(await next.response.text()).toBe("independent response");
			expect(received).toEqual(["/independent"]);
		} finally {
			await peer.stop();
		}
	});
});
