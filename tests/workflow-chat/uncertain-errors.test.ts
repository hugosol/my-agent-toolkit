import { expect, test } from "bun:test";
import { createServer } from "node:http";
import type { Socket } from "node:net";
import { managerDock } from "./support/manager-dock";

// S1/P23/P24. Independent literal errors carry facts a status-only exception or generic
// HTTP-200 success would discard. Reset and invalid JSON exercise the real HTTP client;
// count requests at the external endpoint, not calls to a mocked business collaborator.
// Observe 250ms after each result: fake timers cannot advance the separate real OMP process.
// Then issue a distinct explicit status on the SAME Session.
test("P23 P24 caller retains structured errors and partial effects without retrying failures", async () => {
	const partial = { stateCommitted: true, historyError: "history.jsonl: denied", results: [
		{ nodeId: "alpha", status: "running", effects: { agentStarted: true, associationSaved: true } },
		{ nodeId: "beta", status: "failed", failure: { stage: "submit", message: "input refused" }, effects: { agentStarted: true, inputSubmitted: false, sessionId: "external-beta" } },
	], snapshot: { id: "literal-run", status: "running" } };
	const refused = { code: "state-save-failed", stateCommitted: false, message: "run.json: denied", effects: { agentStarted: true, sessionId: "external-before-save" } };
	let condition: "non2xx" | "partial" | "reset" | "parse" | "healthy" = "non2xx";
	const calls: string[] = [];
	const sockets = new Set<Socket>();
	const peer = createServer((incoming, response) => {
		calls.push(incoming.url!); incoming.resume();
		if (condition === "reset") { incoming.socket.destroy(); return; }
		response.setHeader("content-type", "application/json");
		if (condition === "parse") { response.end('{"stateCommitted":true,INVALID}'); return; }
		response.statusCode = condition === "non2xx" ? 503 : 200;
		response.end(JSON.stringify(condition === "non2xx" ? refused : condition === "partial" ? partial : { snapshot: { id: "same-session", status: "paused" } }));
	});
	peer.on("connection", socket => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
	const ready = Promise.withResolvers<void>(); peer.listen(0, "127.0.0.1", ready.resolve); await ready.promise;
	const address = peer.address(); if (!address || typeof address === "string") throw new Error("No error peer port");
	const dock = await managerDock(`http://127.0.0.1:${address.port}`);
	try {
		const nativeId = await dock.nativeId();
		for (const failure of ["non2xx", "partial", "reset", "parse"] as const) {
			condition = failure;
			const count = calls.length;
			const result = await dock.call({ action: "pause" });
			if (failure === "non2xx") expect(result).toEqual(refused);
			else if (failure === "partial") expect(result).toEqual(partial);
			else {
				expect(result).toMatchObject({ error: { kind: failure === "reset" ? "transport" : "parse" } });
				expect(result).not.toHaveProperty("snapshot");
				expect(result.guidance).toContain("不");
			}
			await Bun.sleep(250);
			expect(calls.slice(count)).toEqual(["/api/workflow/manager/pause"]);
			condition = "healthy";
			expect(await dock.call({ action: "status" })).toEqual({ snapshot: { id: "same-session", status: "paused" } });
			expect(await dock.nativeId()).toBe(nativeId);
			expect(calls.slice(count)).toEqual(["/api/workflow/manager/pause", "/api/workflow/manager/status"]);
		}
	} finally {
		await dock.close(); for (const socket of sockets) socket.destroy();
		const closed = Promise.withResolvers<void>(); peer.close(error => error ? closed.reject(error) : closed.resolve()); await closed.promise;
	}
}, 300_000);
