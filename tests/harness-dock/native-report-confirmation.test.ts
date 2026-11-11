import { expect, test } from "bun:test";
import { createServer } from "node:http";
import type { Socket } from "node:net";
import { roleContractDock } from "../workflow-chat/support/role-contract-dock";
import { headlessTool } from "../workflow-chat/support/headless-tool";

// S3 enabling regression, not P10/P20 model acceptance: the installed host chooses the UI
// mechanics; only a controlled provider tool instruction and explicit native user answer are supplied.
// Ticket criterion 1: sending before approval, or a preview omitting wire fields, must fail.
for (const host of ["omp", "pi"] as const) {
	test(`${host} actual headless mode cannot authorize a manual report`, async () => {
		let sent = 0;
		const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(request) {
			if (new URL(request.url).pathname.endsWith("/context")) return Response.json({ reportPolicy: "manual" });
			sent++; return Response.json({ saved: true });
		} });
		try {
			const result = await headlessTool(host, server.url.origin, "node", { body: "No UI cannot authorize this report", can_complete: false });
			expect(result).toMatchObject({ details: { body: { sent: false, saved: false } } });
			expect(sent).toBe(0);
			console.log(JSON.stringify({ host, condition: "native-no-ui", result, sent }));
		} finally { server.stop(true); }
	}, 300000);
	test(`${host} native manual report sends only the full approved payload`, async () => {
		const sent: unknown[] = [];
		const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
			if (new URL(request.url).pathname.endsWith("/context")) return Response.json({ reportPolicy: "manual" });
			sent.push(await request.json());
			return Response.json({ saved: true, notification: { status: "failed", reason: "controlled notification refusal" } });
		} });
		const dock = await roleContractDock(host, server.url.origin, 2000).catch(error => { server.stop(true); throw error; });
		let pending: Promise<void> | undefined;
		try {
			const state = await dock.state();
			const data = state.data;
			if (!data || typeof data !== "object" || !("sessionId" in data) || typeof data.sessionId !== "string") throw new Error("Native host did not supply Session identity");
			const sessionId = data.sessionId;
			pending = dock.call({ body: "Complete approved report\nLast line", can_complete: false, outputs: [{ id: "draft", path: "E:/owned/draft.txt" }] });
			const dialog = await dock.confirmation();
			expect(dialog.message).toContain(JSON.stringify({ body: "Complete approved report\nLast line", canComplete: false, outputs: [{ id: "draft", path: "E:/owned/draft.txt" }], sessionId }, null, 2));
			expect(sent).toEqual([]);
			dock.answerConfirmation(String(dialog.id), true);
			await pending;
			expect(dock.lastResult()).toMatchObject({ details: { body: { saved: true, notification: { status: "failed" } } } });
			expect(sent).toEqual([{ body: "Complete approved report\nLast line", canComplete: false, outputs: [{ id: "draft", path: "E:/owned/draft.txt" }], sessionId }]);
			// Real child-process clocks cannot use this test process's fake time. Observe no retry
			// across the whole configured 2000ms confirmation budget, plus 100ms margin.
			await Bun.sleep(2100);
			expect(sent).toHaveLength(1);
			console.log(JSON.stringify({ host, condition: "approved", dialog, result: dock.lastResult(), sent, confirmationMs: 2000, observationMs: 2100 }));
		} finally {
			try { if (pending) { await dock.cancel(); await pending; } }
			finally { try { await dock.close(); } finally { server.stop(true); } }
		}
	}, 300000);

	// Criterion 2: only native decisions/lifecycle events vary; the real gate and HTTP stay in path.
	test(`${host} native denial cancellation timeout late approval and Session end never send`, async () => {
		const sent: unknown[] = [];
		const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
			if (new URL(request.url).pathname.endsWith("/context")) return Response.json({ reportPolicy: "manual" });
			sent.push(await request.json()); return Response.json({ saved: true });
		} });
		const dock = await roleContractDock(host, server.url.origin, 2000).catch(error => { server.stop(true); throw error; });
		let pending: Promise<void> | undefined;
		try {
			for (const condition of ["denied", "dismissed", "cancelled", "timeout-and-late-approval", "session-ended"] as const) {
				pending = dock.call({ body: `Must not send: ${condition}`, can_complete: false });
				const dialog = await dock.confirmation();
				if (condition === "denied") dock.answerConfirmation(String(dialog.id), false);
				else if (condition === "dismissed") dock.answerConfirmation(String(dialog.id));
				else if (condition === "cancelled") await dock.cancel();
				else if (condition === "session-ended") await dock.endSession();
				await pending;
				if (condition === "denied" || condition === "dismissed" || condition === "timeout-and-late-approval") {
					expect(dock.lastResult()).toMatchObject({ details: { body: { sent: false, saved: false } } });
				}
				// A late real UI answer must not revive cancelled, timed-out or ended work.
				dock.answerConfirmation(String(dialog.id), true);
				// Separate native process uses its own real clock: observe an entire confirmation budget.
				await Bun.sleep(2100);
				expect({ condition, sent }).toEqual({ condition, sent: [] });
				console.log(JSON.stringify({ host, condition, dialog, result: dock.lastResult(), sent, confirmationMs: 2000, observationMs: 2100 }));
			}
		} finally {
			try { if (pending) { await dock.cancel(); await pending; } }
			finally { try { await dock.close(); } finally { server.stop(true); } }
		}
	}, 300000);

	// Criterion 3: once the real peer has accepted the HTTP request, none of these local
	// failures can prove it was not saved. Only the external peer response is controlled.
	test(`${host} native report retains uncertainty after send without retry`, async () => {
		let condition: "cancel" | "lost-response" | "invalid-json" | "invalid-receipt" = "cancel";
		let accepted = Promise.withResolvers<void>();
		let requests = 0;
		const sockets = new Set<Socket>();
		const peer = createServer((incoming, response) => {
			incoming.resume();
			if (incoming.url?.endsWith("/context")) { response.end('{"reportPolicy":"manual"}'); return; }
			requests++; accepted.resolve();
			if (condition === "cancel") return;
			if (condition === "lost-response") { incoming.socket.destroy(); return; }
			response.end(condition === "invalid-json" ? '{"saved":' : '{"sent":false}');
		});
		peer.on("connection", socket => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
		const ready = Promise.withResolvers<void>(); peer.listen(0, "127.0.0.1", ready.resolve); await ready.promise;
		const address = peer.address(); if (!address || typeof address === "string") throw new Error("Missing fault peer port");
		const dock = await roleContractDock(host, `http://127.0.0.1:${address.port}`, 2000);
		let pending: Promise<void> | undefined;
		try {
			for (const failure of ["cancel", "lost-response", "invalid-json", "invalid-receipt"] as const) {
				condition = failure; accepted = Promise.withResolvers<void>();
				const before = requests;
				pending = dock.call({ body: "Backend may have saved this report", can_complete: false });
				const dialog = await dock.confirmation();
				dock.answerConfirmation(String(dialog.id), true);
				await accepted.promise;
				if (failure === "cancel") await dock.cancel();
				await pending;
				const result = dock.lastResult();
				expect(result).toMatchObject({ details: { body: { error: { kind: failure === "cancel" ? "cancelled" : failure === "lost-response" ? "transport" : failure === "invalid-json" ? "parse" : "protocol" }, guidance: expect.stringContaining("不") } } });
				expect(result).not.toMatchObject({ details: { body: { sent: false } } });
				expect(result).not.toMatchObject({ details: { body: { saved: false } } });
				// Cross-process real timer observation covers the configured confirmation budget.
				await Bun.sleep(2100);
				expect(requests - before).toBe(1);
				console.log(JSON.stringify({ host, condition: failure, result, requests: requests - before, confirmationMs: 2000, observationMs: 2100 }));
			}
		} finally {
			try { if (pending) { await dock.cancel(); await pending; } }
			finally {
				try { await dock.close(); } finally {
					for (const socket of sockets) socket.destroy();
					const closed = Promise.withResolvers<void>(); peer.close(error => error ? closed.reject(error) : closed.resolve()); await closed.promise;
				}
			}
		}
	}, 300000);
}
