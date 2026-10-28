import { expect, test } from "bun:test";
import { createServer } from "node:http";
import type { Socket } from "node:net";
import { promptDock } from "../workflow-chat/support/prompt-dock";
import { nativeIdentity, roleCall } from "../workflow-chat/support/role-tools";

// S1/P7. Source: explicit deployment endpoint and literal 700/1600ms budgets.
// Violation: either role resolves cwd/ID-derived config, or uses a shipped default budget.
// Two distinct real OMP cwd trees contain valid wrong endpoint/1ms budgets. A delayed
// successful response defeats a 1ms choice; held bodies measure the selected budgets,
// independently of model/loader time, and cannot pass with the shipped 30000/5460000ms.
// Real timers are intentional: the client timer runs in a separate native OMP process;
// this test's fake clock cannot drive it. Socket close, not a sleep, ends each measurement.
test("P7 both automatic roles select deployment endpoint and budgets despite two misleading cwd trees", async () => {
	const fallbackCalls: string[] = [];
	const wrong = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch(request) { fallbackCalls.push(request.url); return Response.json({ wrong: true }); } });
	const calls: { path: string; body: unknown; elapsedMs?: number }[] = [];
	const sockets = new Set<Socket>();
	const closures: Promise<void>[] = [];
	const timers = new Set<ReturnType<typeof setTimeout>>();
	let holding = false;
	const reply = { independent: "explicit-deployment-endpoint" };
	const server = createServer(async (request, response) => {
		const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
		const call = { path: request.url!, body: JSON.parse(Buffer.concat(chunks).toString()), elapsedMs: undefined as number | undefined };
		calls.push(call);
		const started = performance.now();
		const closed = Promise.withResolvers<void>(); closures.push(closed.promise);
		response.once("close", () => { call.elapsedMs = performance.now() - started; closed.resolve(); });
		response.writeHead(200, { "content-type": "application/json" }); response.flushHeaders();
		if (holding) return;
		const timer = setTimeout(() => { timers.delete(timer); response.end(JSON.stringify(reply)); }, 90);
		timers.add(timer);
	});
	server.on("connection", socket => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
	const ready = Promise.withResolvers<void>(); server.listen(0, "127.0.0.1", ready.resolve); await ready.promise;
	const address = server.address(); if (!address || typeof address === "string") throw new Error("No explicit endpoint");
	const cleanup: (() => Promise<void>)[] = [async () => {
		for (const timer of timers) clearTimeout(timer);
		for (const socket of sockets) socket.destroy();
		const closed = Promise.withResolvers<void>(); server.close(error => error ? closed.reject(error) : closed.resolve()); await closed.promise;
		wrong.stop(true);
	}];
	try {
		const config = `endpoint: http://127.0.0.1:${address.port}\nrequestTimeoutMs: 700\ncollectTimeoutMs: 1600\n`;
		const misleadingConfig = `endpoint: http://127.0.0.1:${wrong.port}\nrequestTimeoutMs: 1\ncollectTimeoutMs: 1\n`;
		const manager = await promptDock("manager", { config, misleadingConfig }); cleanup.unshift(() => manager.close());
		const node = await promptDock("node", { config, misleadingConfig }); cleanup.unshift(() => node.close());
		expect(manager.root.workDir).not.toBe(node.root.workDir);
		const managerId = await nativeIdentity(manager); const nodeId = await nativeIdentity(node);
		expect((await roleCall(manager, "run", { action: "status" })).body).toEqual(reply);
		expect((await roleCall(node, "report", { body: "P7 explicit config" })).body).toEqual(reply);
		holding = true;
		for (const [dock, tool, params, minimumMs, maximumMs] of [
			[manager, "run", { action: "status" }, 350, 3000],
			[node, "report", { body: "P7 ordinary budget" }, 350, 3000],
			[manager, "collect", {}, 1000, 4000],
		] as const) {
			expect(await roleCall(dock, tool, params)).toMatchObject({ isError: true, body: { error: { kind: "timeout" } } });
			await closures[closures.length - 1];
			const elapsed = calls[calls.length - 1]!.elapsedMs;
			expect(elapsed).toBeNumber();
			expect(elapsed!).toBeGreaterThanOrEqual(minimumMs);
			expect(elapsed!).toBeLessThan(maximumMs);
		}
		expect(fallbackCalls).toEqual([]);
		expect(calls.map(call => ({ path: call.path, body: call.body }))).toEqual([
			{ path: "/api/workflow/manager/status", body: { sessionId: managerId } },
			{ path: "/api/workflow/node/report", body: { sessionId: nodeId, body: "P7 explicit config" } },
			{ path: "/api/workflow/manager/status", body: { sessionId: managerId } },
			{ path: "/api/workflow/node/report", body: { sessionId: nodeId, body: "P7 ordinary budget" } },
			{ path: "/api/workflow/manager/collect", body: { sessionId: managerId } },
		]);
		console.log(JSON.stringify({ promise: "P7", cwd: [manager.root.workDir, node.root.workDir], selectedBudgets: { requestTimeoutMs: 700, collectTimeoutMs: 1600 }, fallbackRequests: fallbackCalls.length, calls }));
	} finally { for (const close of cleanup) await close(); }
}, 300_000);
