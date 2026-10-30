import { expect, test } from "bun:test";
import { createServer, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { managerDock } from "./support/manager-dock";

// Approved S1/P21: actual manager tool + native OMP Session and real HTTP. The endpoint
// controls only backend outcomes. Independent contract literals distinguish a normal
// backend timeout from client deadline, caller cancellation, transport and JSON errors.
// Violations: treating a 200 head as success, translating all errors into timeout, or
// parsing a truncated successful prefix into a snapshot. No internal collaborator mocks.
test("P21 collect distinguishes backend expiry, cancellation, budget, broken streams and JSON failure", async () => {
	type Outcome = "expiry" | "budget" | "cancel" | "reset" | "broken-200" | "incomplete" | "invalid-json";
	let outcome: Outcome = "expiry";
	let received = Promise.withResolvers<void>();
	let active: ServerResponse | undefined;
	const sockets = new Set<Socket>();
	const peer = createServer((incoming, response) => {
		active = response;
		incoming.resume();
		response.setHeader("content-type", "application/json");
		switch (outcome) {
			case "expiry": response.end('{"reason":"timeout","snapshot":{"id":"backend-expired","status":"running"},"pendingReports":{}}'); break;
			case "reset": incoming.socket.destroy(); break;
			case "broken-200": response.flushHeaders(); break;
			case "incomplete": response.setHeader("content-length", "500"); response.end('{"reason":"timeout","snapshot":'); break;
			case "invalid-json": response.end('{"reason":"timeout",INVALID}'); break;
			case "budget": case "cancel": response.flushHeaders(); break;
		}
		received.resolve();
	});
	peer.on("connection", socket => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
	const listening = Promise.withResolvers<void>();
	peer.listen(0, "127.0.0.1", listening.resolve);
	await listening.promise;
	const address = peer.address();
	if (!address || typeof address === "string") throw new Error("No classification peer port");
	const dock = await managerDock(`http://127.0.0.1:${address.port}`, { collectTimeoutMs: 250 });
	try {
		expect(await dock.collect()).toEqual({ reason: "timeout", snapshot: { id: "backend-expired", status: "running" }, pendingReports: {} });
		for (const [condition, kind] of [["budget", "timeout"], ["cancel", "cancelled"], ["reset", "transport"], ["broken-200", "transport"], ["incomplete", "transport"], ["invalid-json", "parse"]] as const) {
			outcome = condition;
			received = Promise.withResolvers<void>();
			const finished = dock.beginCollect();
			await received.promise;
			if (condition === "cancel") await dock.session.request({ type: "abort" });
			if (condition === "broken-200") active!.socket!.end(); // FIN follows flushed 200 head, without the chunked body's terminator.
			await finished;
			const result = dock.lastToolResult();
			expect(result).toMatchObject({ error: { kind } });
			expect(result).not.toHaveProperty("snapshot");
			expect(result).not.toHaveProperty("reason");
			console.log(JSON.stringify({ promise: "P21", condition, result }));
		}
	} finally {
		await dock.close();
		for (const socket of sockets) socket.destroy();
		const closed = Promise.withResolvers<void>();
		peer.close(error => error ? closed.reject(error) : closed.resolve());
		await closed.promise;
	}
}, 300_000);
