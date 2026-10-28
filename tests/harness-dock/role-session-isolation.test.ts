import { expect, test } from "bun:test";
import { createServer } from "node:http";
import type { Socket } from "node:net";
import { promptDock } from "../workflow-chat/support/prompt-dock";
import { beginRoleCall, lastRoleResult, nativeIdentity, roleCall } from "../workflow-chat/support/role-tools";

// S1/P3. Source: per-native-Session cancellation contract, not an internal map.
// Violation: a shared controller cancels both roles or poisons the next request.
// Both real OMP tools reach held HTTP responses before abort; the endpoint supplies
// response literals only, never tool registration, identities or cancellation behavior.
test("P3 overlapping native role Sessions cancel independently and both accept subsequent explicit requests", async () => {
	const calls: { path: string; body: unknown }[] = [];
	const sockets = new Set<Socket>();
	const managerReceived = Promise.withResolvers<void>();
	const nodeReceived = Promise.withResolvers<void>();
	const managerClosed = Promise.withResolvers<void>();
	const releaseNode = Promise.withResolvers<void>();
	let nodeClosed = false;
	let holding = true;
	const managerReply = { acceptance: "independent-manager-response" };
	const nodeReply = { saved: true, report: { id: "independent-report-3" }, notification: { status: "submitted" } };
	const server = createServer(async (request, response) => {
		const chunks: Buffer[] = [];
		for await (const chunk of request) chunks.push(Buffer.from(chunk));
		const path = request.url!;
		calls.push({ path, body: JSON.parse(Buffer.concat(chunks).toString()) });
		response.writeHead(200, { "content-type": "application/json" });
		if (holding) {
			response.flushHeaders();
			if (path.endsWith("/collect")) {
				response.once("close", managerClosed.resolve);
				managerReceived.resolve();
				return;
			}
			response.once("close", () => { nodeClosed = true; });
			nodeReceived.resolve();
			await releaseNode.promise;
		}
		response.end(JSON.stringify(path.includes("/manager/") ? managerReply : nodeReply));
	});
	server.on("connection", socket => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
	const ready = Promise.withResolvers<void>(); server.listen(0, "127.0.0.1", ready.resolve); await ready.promise;
	const address = server.address(); if (!address || typeof address === "string") throw new Error("No isolated endpoint");
	const cleanup: (() => Promise<void>)[] = [async () => {
		releaseNode.resolve(); for (const socket of sockets) socket.destroy();
		const closed = Promise.withResolvers<void>();
		server.close(error => error ? closed.reject(error) : closed.resolve());
		await closed.promise;
	}];
	try {
		const config = `endpoint: http://127.0.0.1:${address.port}\nrequestTimeoutMs: 10000\ncollectTimeoutMs: 10000\n`;
		const manager = await promptDock("manager", { config }); cleanup.unshift(() => manager.close());
		const node = await promptDock("node", { config }); cleanup.unshift(() => node.close());
		const managerId = await nativeIdentity(manager);
		const nodeId = await nativeIdentity(node);
		expect(managerId).not.toBe(nodeId);
		const managerPending = beginRoleCall(manager, "collect", {});
		const nodePending = beginRoleCall(node, "report", { body: "independent concurrent handoff" });
		await Promise.all([managerReceived.promise, nodeReceived.promise]);
		expect(calls).toEqual(expect.arrayContaining([
			{ path: "/api/workflow/manager/collect", body: { sessionId: managerId } },
			{ path: "/api/workflow/node/report", body: { sessionId: nodeId, body: "independent concurrent handoff" } },
		]));
		expect((await manager.session.request({ type: "abort" })).success).toBe(true);
		await managerPending;
		await managerClosed.promise;
		expect(lastRoleResult(manager)).toMatchObject({ isError: true, body: { error: { kind: "cancelled" } } });
		expect(nodeClosed).toBe(false);
		releaseNode.resolve();
		expect((await nodePending).status).toBe("completed");
		expect(lastRoleResult(node).body).toEqual(nodeReply);
		holding = false;
		expect((await roleCall(manager, "run", { action: "status" })).body).toEqual(managerReply);
		expect((await roleCall(node, "report", { body: "subsequent independent handoff" })).body).toEqual(nodeReply);
		expect(calls.slice(2)).toEqual([
			{ path: "/api/workflow/manager/status", body: { sessionId: managerId } },
			{ path: "/api/workflow/node/report", body: { sessionId: nodeId, body: "subsequent independent handoff" } },
		]);
		console.log(JSON.stringify({ promise: "P3", native: { manager: managerId, node: nodeId }, actualOverlap: true, cancelledConnectionClosed: true, otherResult: nodeReply, requests: calls, scope: "real OMP; controlled HTTP literals" }));
	} finally { for (const close of cleanup) await close(); }
}, 300_000);
