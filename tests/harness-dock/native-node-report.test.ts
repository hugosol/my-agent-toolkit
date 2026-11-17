import { expect, test } from "bun:test";
import { createServer } from "node:http";
import type { Socket } from "node:net";
import { roleContractDock } from "../workflow-chat/support/role-contract-dock";
import { headlessTool } from "../workflow-chat/support/headless-tool";

// P38: actual installed hosts expose free node reporting. Controlled provider/HTTP
// are enabling evidence only, not native result-approval or real-model acceptance.
for (const host of ["omp", "pi"] as const) {
	test(`${host} native node report sends without a confirmation even with no UI`, async () => {
		const sent: unknown[] = [];
		const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
			if (new URL(request.url).pathname !== "/api/workflow/node/report") return Response.json({ error: "unexpected policy lookup" }, { status: 503 });
			sent.push(await request.json());
			return Response.json({ saved: true, notification: { status: "submitted" } });
		} });
		try {
			const result = await headlessTool(host, server.url.origin, "node", { body: "Progress without UI", can_complete: false });
			expect(result).toMatchObject({ details: { body: { saved: true } } });
			expect(sent).toEqual([{ sessionId: expect.any(String), body: "Progress without UI", canComplete: false }]);
		} finally { server.stop(true); }
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
