import { expect, test } from "bun:test";
import { managerDock } from "./support/manager-dock";

// S1/P10/P14 independent literals: no caller-supplied Chat, identity or target status.
// Violation: dropping a forbidden Chat key and silently accepting created reconciliation.
test("P10 reconcile_dispatch forwards three findings and rejects model Chat references", async () => {
	const calls: { path: string; body: unknown }[] = [];
	const response = { changed: false, snapshot: { nodes: { A: { status: "failed" } } } };
	const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
		calls.push({ path: new URL(request.url).pathname, body: await request.json() });
		return Response.json(response);
	} });
	const dock = await managerDock(`http://127.0.0.1:${server.port}`);
	try {
		const sessionId = await dock.nativeId();
		for (const finding of ["uncertain", "not_created", "created"]) {
			const input = { action: "reconcile_dispatch", nodeId: "A", finding, reason: `人工核实依据：${finding}，保留既有副作用` };
			expect(await dock.call(input)).toEqual(response);
			expect(calls[calls.length - 1]).toEqual({ path: "/api/workflow/manager/reconcile_dispatch", body: { sessionId, nodeId: "A", finding, reason: input.reason } });
			const before = calls.length;
			for (const extra of [{ sessionId: "forged" }, { runId: "forged" }, { executionId: "forged" }, { chat: { sessionId: "forged" } }, { chatRef: "forged" }, { confirmed: true }, { nodes: ["B"] }, { status: "running" }]) {
				expect(await dock.call({ ...input, ...extra }, true)).toMatch(/Validation failed|parameters|不接受/);
			}
			expect(calls).toHaveLength(before);
		}
		expect(await dock.call({ action: "reconcile_dispatch", nodeId: "A", finding: "running", reason: "不得任意改状态" }, true)).toMatch(/Validation failed|parameters|不接受/);
		expect(calls).toHaveLength(3);
	} finally { await dock.close(); server.stop(true); }
}, 300_000);
