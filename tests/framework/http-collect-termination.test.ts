import { expect, test } from "bun:test";
import { createServer } from "node:http";
import type { Socket } from "node:net";
import { request } from "../../framework/interface/general/http";

// Approved S2/P21. Competing events do not have an invented global priority. The
// independent source is the caller's exact Error object versus the runtime's deadline
// Error or transport failure. A result relabelled by the latest signal cannot pass.
test("P21 competing cancellation, deadline and stream failure retain the adopted reason", async () => {
	const sockets = new Set<Socket>();
	let received = Promise.withResolvers<Socket>();
	const peer = createServer((incoming, response) => {
		incoming.resume();
		response.writeHead(200, { "content-type": "application/json" });
		response.flushHeaders();
		received.resolve(incoming.socket);
	});
	peer.on("connection", socket => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
	const listening = Promise.withResolvers<void>();
	peer.listen(0, "127.0.0.1", listening.resolve);
	await listening.promise;
	const address = peer.address();
	if (!address || typeof address === "string") throw new Error("No race peer port");
	try {
		for (const race of ["abort-then-failure", "failure-then-abort", "deadline-then-abort"] as const) {
			received = Promise.withResolvers<Socket>();
			const caller = new AbortController();
			const reason = new Error(`P21 caller ${race}`);
			const pending = request(`http://127.0.0.1:${address.port}/collect`, { signal: caller.signal, timeoutMs: race === "deadline-then-abort" ? 80 : 1000 });
			const socket = await received.promise;
			if (race === "abort-then-failure") { caller.abort(reason); socket.destroy(); }
			if (race === "failure-then-abort") { socket.destroy(); caller.abort(reason); }
			const result = await pending;
			// A later cancellation cannot rewrite an adopted timeout/transport failure.
			caller.abort(reason);
			expect(result.ok).toBe(false);
			if (result.ok) throw new Error("An incomplete 200 body is not a successful response");
			if (race === "abort-then-failure") expect(result.failure.kind).toBe("cancelled");
			if (race === "deadline-then-abort") expect(result.failure.kind).toBe("timeout");
			if (race === "failure-then-abort") expect(["cancelled", "transport"]).toContain(result.failure.kind);
			if (result.failure.kind === "cancelled") expect(result.failure.error).toBe(reason);
			else expect(result.failure.error).not.toBe(reason);
			console.log(JSON.stringify({ promise: "P21", race, adopted: result.failure.kind, message: result.failure.error.message }));
		}
	} finally {
		for (const socket of sockets) socket.destroy();
		const closed = Promise.withResolvers<void>();
		peer.close(error => error ? closed.reject(error) : closed.resolve());
		await closed.promise;
	}
});
