import { expect, test } from "bun:test";
import { managerDock } from "./support/manager-dock";

// Approved S1/P10: real OMP validation and role tool, only HTTP is controlled.
// Independent contract: dispatch sends nodes and native identity, never per-node/Chat fields.
// A wrapper silently discarding extra fields would perform an unintended accepted action.
test("P10 dispatch sends literal nodes and rejects identity and inapplicable fields", async () => {
	const calls: { path: string; body: unknown }[] = [];
	const response = { results: [{ nodeId: "A", status: "running", effects: { agentStarted: true } }, { nodeId: "C", status: "rejected", reasons: ["blocked by B"] }] };
	const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
		calls.push({ path: new URL(request.url).pathname, body: await request.json() });
		return Response.json(response);
	} });
	const dock = await managerDock(`http://127.0.0.1:${server.port}`);
	try {
		const sessionId = await dock.nativeId();
		expect(await dock.call({ action: "dispatch", nodes: ["A", "C"] })).toEqual(response);
		expect(calls).toEqual([{ path: "/api/workflow/manager/dispatch", body: { sessionId, nodes: ["A", "C"] } }]);
		for (const extra of [{ sessionId: "forged" }, { runId: "forged" }, { executionId: "forged" }, { chat: { sessionId: "forged" } }, { nodeId: "B" }, { reason: "not applicable" }, { confirmed: true }, { finding: "created" }]) {
			expect(await dock.call({ action: "dispatch", nodes: ["B"], ...extra }, true)).toMatch(/Validation failed|parameters|不接受/);
		}
		// Type coercion/defaulting before execute belongs to OMP; this partition
		// specifically verifies that forbidden extra fields cannot trigger an action.
		expect(calls).toHaveLength(1);
		const zoneIds = { A: "created/project-a", C: "created/project-c" };
		expect(await dock.call({ action: "dispatch", nodes: ["A", "C"], zoneIds })).toEqual(response);
		expect(calls[1]).toEqual({ path: "/api/workflow/manager/dispatch", body: { sessionId, nodes: ["A", "C"], zoneIds } });
		expect(await dock.call({ action: "retry", nodeId: "A", confirmed: true, reason: "Checked prior effects", zoneId: "created/retry-a" })).toEqual(response);
		expect(calls[2]).toEqual({ path: "/api/workflow/manager/retry", body: { sessionId, nodeId: "A", confirmed: true, reason: "Checked prior effects", zoneId: "created/retry-a" } });
		expect(await dock.call({ action: "recover", nodeId: "A", confirmed: true, reason: "Original execution", zoneId: "forbidden" }, true)).toMatch(/Validation failed|parameters|不接受/);
		expect(calls).toHaveLength(3);
	} finally { await dock.close(); server.stop(true); }
}, 300_000);
