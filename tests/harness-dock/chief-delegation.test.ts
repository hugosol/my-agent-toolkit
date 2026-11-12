import { expect, test } from "bun:test";
import { roleContractDock } from "../workflow-chat/support/role-contract-dock";
import { headlessTool } from "../workflow-chat/support/headless-tool";
import { createServer } from "node:http";
import type { Socket } from "node:net";

// Approved S3 enabling seam: shipped tools, actual native UI/Session, real HTTP.
// Controlled provider/peer test protocol only, not GPT-6-luna responsibility or S2 semantics.
// Independent ticket outcome: preview all resolved facts and commit only its one-use ID.
// Plausible violation: dispatching before approval or replacing the confirmed target/input.
for (const host of ["omp", "pi"] as const) {
	for (const kind of ["task", "map"] as const) {
		test(`${host} ${kind} chief dispatches only the complete native-approved preview`, async () => {
			const requests: { route: string; body: unknown }[] = [];
			const params = { botId: `literal-${kind}-bot`, zoneId: "work/manager", input: "Summarize only the approved draft", materials: [{ id: "draft", zoneId: "work/source", path: "draft.txt" }], ...(kind === "map" ? { managerTaskId: "literal-manager" } : {}) };
			let facts: unknown;
			const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
				const route = new URL(request.url).pathname;
				if (request.method !== "POST" || !["/api/chief/delegations/preview", "/api/chief/delegations"].includes(route)) return new Response(null, { status: 404 });
				const body = await request.json(); requests.push({ route, body });
				if (route.endsWith("/preview")) {
					facts = { request: body, bot: { id: `literal-${kind}-bot`, when: "Summarize drafts", ...(kind === "map" ? { map: "literal.json" } : { task_id: "literal-worker" }) }, task: { id: kind === "map" ? "literal-manager" : "literal-worker", prompt: "Fixed business instructions" }, cwd: "E:/isolated/manager", name: "Independent Chat", materials: [{ id: "draft", zoneId: "work/source", path: "E:/isolated/source/draft.txt" }], prompt: "Fixed business instructions\nSummarize only the approved draft", ...(kind === "map" ? { map: { zoneBindings: { "work/node": "E:/isolated/node" }, nodes: { A: { zone: "work/node" } } } } : {}) };
					return Response.json({ previewId: `literal-preview-${kind}`, facts });
				}
				return Response.json(kind === "map" ? { id: "literal-run", run: { nodes: { A: { status: "pending" } } }, managed: true, startupError: null } : { id: "literal-preview-task", stage: "starting" }, { status: kind === "map" ? 201 : 202 });
			} });
			const dock = await roleContractDock(host, server.url.origin, 2000, "chief", 2000).catch(error => { server.stop(true); throw error; });
			let pending: Promise<void> | undefined;
			try {
				const state = await dock.state();
				const data = state.data;
				if (!data || typeof data !== "object" || !("sessionId" in data) || typeof data.sessionId !== "string") throw new Error("Native Session identity unavailable");
				const sessionId = data.sessionId;
				pending = dock.call(params);
				const dialog = await dock.confirmation();
				expect(requests).toEqual([{ route: "/api/chief/delegations/preview", body: { ...params, sessionId } }]);
				expect(dialog.message).toContain(JSON.stringify(facts, null, 2));
				expect(dialog.message).toContain(JSON.stringify({ previewId: `literal-preview-${kind}`, sessionId }, null, 2));
				dock.answerConfirmation(String(dialog.id), true);
				await pending;
				expect(requests[1]).toEqual({ route: "/api/chief/delegations", body: { previewId: `literal-preview-${kind}`, sessionId } });
				expect(dock.lastResult()).toMatchObject({ details: { httpStatus: kind === "map" ? 201 : 202 }, content: [{ text: expect.stringContaining("不表示业务完成") }] });
				// Native child-process timers cannot be advanced by this process’s fake clock.
				// Observe both configured 2000ms request/confirmation budgets; no business wait.
				await Bun.sleep(2100);
				expect(requests).toHaveLength(2);
				console.log(JSON.stringify({ host, kind, dialog, requests, result: dock.lastResult(), confirmationMs: 2000, observationMs: 2100 }));
			} finally {
				try { if (pending) { await dock.cancel(); await pending; } }
				finally { try { await dock.close(); } finally { server.stop(true); } }
			}
		}, 300000);

		// Existing Session-bound confirmation must also govern both new operation kinds.
		// Violation: chat agreement, late UI approval or an ended Session revives a dispatch.
		test(`${host} ${kind} chief denial cancellation timeout late approval and Session end never dispatch`, async () => {
			let committed = 0;
			const params = { botId: "literal-bot", zoneId: "work/explicit", input: "User said yes in chat, not in native UI", materials: [], ...(kind === "map" ? { managerTaskId: "literal-manager" } : {}) };
			const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
				const route = new URL(request.url).pathname;
				if (request.method !== "POST" || !["/api/chief/delegations/preview", "/api/chief/delegations"].includes(route)) return new Response(null, { status: 404 });
				const body = await request.json();
				if (new URL(request.url).pathname.endsWith("/preview")) return Response.json({ previewId: "literal-preview", facts: controlledFacts(body, kind) });
				committed++; return Response.json({ id: "must-not-start" }, { status: 202 });
			} });
			const dock = await roleContractDock(host, server.url.origin, 2000, "chief", 2000).catch(error => { server.stop(true); throw error; });
			let pending: Promise<void> | undefined;
			try {
				for (const condition of ["denied", "dismissed", "cancelled", "timeout", "session-ended"] as const) {
					pending = dock.call(params);
					const dialog = await dock.confirmation();
					if (condition === "denied") dock.answerConfirmation(String(dialog.id), false);
					else if (condition === "dismissed") dock.answerConfirmation(String(dialog.id));
					else if (condition === "cancelled") await dock.cancel();
					else if (condition === "session-ended") await dock.endSession();
					await pending;
					if (condition === "denied" || condition === "dismissed" || condition === "timeout") expect(dock.lastResult()).toMatchObject({ details: { body: { sent: false } } });
					dock.answerConfirmation(String(dialog.id), true);
					// Real native child-process clock: bounded no-revival observation covers
					// both 2000ms confirmation/HTTP budgets; fake timers cannot drive the host.
					await Bun.sleep(2100);
					expect({ condition, committed }).toEqual({ condition, committed: 0 });
					console.log(JSON.stringify({ host, kind, condition, dialog, committed, result: dock.lastResult(), confirmationMs: 2000, requestMs: 2000, observationMs: 2100 }));
				}
			} finally {
				try { if (pending) { await dock.cancel(); await pending; } }
				finally { try { await dock.close(); } finally { server.stop(true); } }
			}
		}, 300000);

		test(`${host} ${kind} chief rejects malformed and forged native tool arguments before HTTP`, async () => {
			let requests = 0;
			const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
				const route = new URL(request.url).pathname;
				if (request.method !== "POST" || !["/api/chief/delegations/preview", "/api/chief/delegations"].includes(route)) return new Response(null, { status: 404 });
				requests++; return Response.json({ previewId: "unexpected", facts: controlledFacts(await request.json(), kind) });
			} });
			const dock = await roleContractDock(host, server.url.origin, 2000, "chief", 2000).catch(error => { server.stop(true); throw error; });
			try {
				const valid = { botId: "literal-bot", zoneId: "work/explicit", input: "Literal request", materials: [], ...(kind === "map" ? { managerTaskId: "literal-manager" } : {}) };
				for (const params of [{ ...valid, sessionId: "forged" }, { ...valid, approved: true }, { ...valid, input: 7 }, { ...valid, materials: [{ id: "source", zoneId: "work/source", path: "source.txt", approved: true }] }]) {
					await dock.call(params);
					expect(dock.lastResult()).toMatchObject({ details: { body: { code: "invalid-parameters" } } });
				}
				expect(requests).toBe(0);
			} finally { try { await dock.close(); } finally { server.stop(true); } }
		}, 300000);

		test(`${host} ${kind} chief cannot approve in actual headless mode`, async () => {
			let committed = 0;
			const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
				const route = new URL(request.url).pathname;
				if (request.method !== "POST" || !["/api/chief/delegations/preview", "/api/chief/delegations"].includes(route)) return new Response(null, { status: 404 });
				const body = await request.json();
				if (new URL(request.url).pathname.endsWith("/preview")) return Response.json({ previewId: "literal-preview", facts: controlledFacts(body, kind) });
				committed++; return Response.json({ id: "must-not-start" }, { status: 202 });
			} });
			try {
				const result = await headlessTool(host, server.url.origin, "chief", { botId: "literal-bot", zoneId: "work/explicit", input: "No UI must not approve", materials: [], ...(kind === "map" ? { managerTaskId: "literal-manager" } : {}) });
				expect(result).toMatchObject({ details: { body: { sent: false } } });
				expect(committed).toBe(0);
			} finally { server.stop(true); }
		}, 300000);
	}
}

// Violation: an uncertain commit is retried, stale facts are silently reapproved,
// or a Run startup failure loses its already-created Run/partial effects.
for (const host of ["omp", "pi"] as const) for (const kind of ["task", "map"] as const) {
	test(`${host} ${kind} chief retains stale startup and uncertain commit outcomes without retry`, async () => {
		let condition = "stale";
		let commits = 0;
		let previews = 0;
		const sockets = new Set<Socket>();
		const peer = createServer(async (incoming, response) => {
			if (incoming.method !== "POST" || !["/api/chief/delegations/preview", "/api/chief/delegations"].includes(incoming.url ?? "")) { response.writeHead(404); response.end(); return; }
			let raw = ""; for await (const chunk of incoming) raw += String(chunk);
			if (incoming.url?.endsWith("/preview")) {
				previews++; response.end(JSON.stringify({ previewId: "literal-preview", facts: controlledFacts(JSON.parse(raw), kind) })); return;
			}
			commits++;
			if (condition === "lost-response") { incoming.socket.destroy(); return; }
			if (condition === "invalid-json") { response.end('{"id":'); return; }
			if (condition === "invalid-receipt") { response.end('{"sent":false}'); return; }
			if (condition === "stale") { response.writeHead(409); response.end(JSON.stringify({ code: "delegation-preview-stale", message: "Target or zone changed; reconfirm affected parameters" })); return; }
			response.writeHead(500); response.end(JSON.stringify({ id: "literal-created-run", run: { nodes: {} }, startupError: "controlled manager startup refusal", effects: { chatCreated: true } }));
		});
		peer.on("connection", socket => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
		const ready = Promise.withResolvers<void>(); peer.listen(0, "127.0.0.1", ready.resolve); await ready.promise;
		const address = peer.address(); if (!address || typeof address === "string") throw new Error("Missing peer port");
		const dock = await roleContractDock(host, `http://127.0.0.1:${address.port}`, 2000, "chief", 2000);
		let pending: Promise<void> | undefined;
		try {
			for (const failure of ["stale", "startup-failed", "lost-response", "invalid-json", "invalid-receipt"]) {
				condition = failure;
				const before = { commits, previews };
				pending = dock.call({ botId: "literal-bot", zoneId: "work/explicit", input: "Explicit business request", materials: [], ...(kind === "map" ? { managerTaskId: "literal-manager" } : {}) });
				const dialog = await dock.confirmation(); dock.answerConfirmation(String(dialog.id), true); await pending;
				const result = dock.lastResult();
				if (failure === "stale") expect(result).toMatchObject({ details: { httpStatus: 409, body: { code: "delegation-preview-stale" } } });
				else if (failure === "startup-failed") expect(result).toMatchObject({ details: { httpStatus: 500, body: { id: "literal-created-run", startupError: "controlled manager startup refusal", effects: { chatCreated: true } } } });
				else expect(result).toMatchObject({ details: { body: { error: { kind: failure === "lost-response" ? "transport" : failure === "invalid-json" ? "parse" : "protocol" }, guidance: expect.stringContaining("不") } } });
				expect(result).not.toMatchObject({ details: { body: { sent: false } } });
				// No fake clock can advance these real native child processes; observe both budgets.
				await Bun.sleep(2100);
				expect({ commits: commits - before.commits, previews: previews - before.previews }).toEqual({ commits: 1, previews: 1 });
				console.log(JSON.stringify({ host, kind, failure, result, confirmationMs: 2000, requestMs: 2000, observationMs: 2100 }));
			}
		} finally {
			try { if (pending) { await dock.cancel(); await pending; } }
			finally { try { await dock.close(); } finally {
				for (const socket of sockets) socket.destroy();
				const closed = Promise.withResolvers<void>(); peer.close(error => error ? closed.reject(error) : closed.resolve()); await closed.promise;
			} }
		}
	}, 300000);
}

function controlledFacts(request: unknown, kind: "task" | "map") {
	return { request, bot: { id: "literal-bot" }, task: { id: "literal-target" }, cwd: "E:/isolated/worker", name: "Literal Chat", materials: [], prompt: "Literal business input", ...(kind === "map" ? { map: { zoneBindings: { "work/node": "E:/isolated/node" } } } : {}) };
}

