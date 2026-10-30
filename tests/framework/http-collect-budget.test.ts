import { expect, test } from "bun:test";
import { createServer } from "node:http";
import type { Socket } from "node:net";
import { request } from "../../framework/interface/general/http";

// Approved seam S2/P9. External TCP peer only: real public transport and deadline stay in
// the exercised path. Literal response arrives after 180ms headers + 180ms body. A 1200ms
// budget succeeds; 60ms expires before headers; 300ms expires after headers. Resetting the
// budget at headers, or ending it at headers, would wrongly pass the last call.
// Real timers deliberately exercise the transport's platform deadline; fake timers cannot
// synchronously advance native socket delivery and that deadline as one exchange.
test("P9 public HTTP budget covers the entire wait and body without restarting at headers", async () => {
	const sockets = new Set<Socket>();
	const timers = new Set<NodeJS.Timeout>();
	const headersSent: string[] = [];
	const calls: string[] = [];
	const server = createServer((incoming, response) => {
		const path = incoming.url!;
		calls.push(path);
		const head = setTimeout(() => {
			if (response.destroyed) return;
			response.writeHead(200, { "content-type": "application/json" });
			response.write('{"reason":');
			headersSent.push(path);
			const body = setTimeout(() => response.end('"timeout","snapshot":{"id":"literal-budget-run"}}'), 180);
			timers.add(body);
		}, 180);
		timers.add(head);
	});
	server.on("connection", socket => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
	const ready = Promise.withResolvers<void>();
	server.listen(0, "127.0.0.1", ready.resolve);
	await ready.promise;
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("No numeric loopback port");
	const endpoint = `http://127.0.0.1:${address.port}`;
	try {
		const long = await request(`${endpoint}/long`, { timeoutMs: 1200 });
		if (!long.ok) throw long.failure.error;
		expect(await long.response.json()).toEqual({ reason: "timeout", snapshot: { id: "literal-budget-run" } });
		const ordinary = await request(`${endpoint}/ordinary`, { timeoutMs: 60 });
		expect(ordinary).toMatchObject({ ok: false, failure: { kind: "timeout" } });
		const whole = await request(`${endpoint}/whole`, { timeoutMs: 300 });
		expect(whole).toMatchObject({ ok: false, failure: { kind: "timeout" } });
		expect(headersSent).toEqual(["/long", "/whole"]);
		expect(calls).toEqual(["/long", "/ordinary", "/whole"]);
	} finally {
		for (const timer of timers) clearTimeout(timer);
		for (const socket of sockets) socket.destroy();
		const closed = Promise.withResolvers<void>();
		server.close(error => error ? closed.reject(error) : closed.resolve());
		await closed.promise;
	}
}, 10_000);
