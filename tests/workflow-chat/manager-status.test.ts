import { expect, test } from "bun:test";
import { managerDock } from "./support/manager-dock";

// S1/P10/P11. Independent literal backend facts, not a client recomputation of readiness.
// Violation: using node identity, accepting identity overrides, or rewriting backend snapshot.
test("P10/P11 manager auto status uses its native identity and preserves backend facts", async () => {
	const calls: { path: string; body: unknown }[] = [];
	const facts = { snapshot: { id: "run-literal-29", status: "running", nodes: { A: { status: "pending" }, B: { status: "pending" }, C: { status: "pending" } } }, ready: ["A", "B"], blocked: { C: ["等待前置 A", "等待前置 B"] }, canFinish: false };
	const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
		calls.push({ path: new URL(request.url).pathname, body: await request.json() });
		return Response.json(facts);
	} });
	const dock = await managerDock(`http://127.0.0.1:${server.port}`);
	try {
		expect(await dock.call({ action: "status" })).toEqual(facts);
		expect(calls).toEqual([{ path: "/api/workflow/manager/status", body: { sessionId: await dock.nativeId() } }]);
		const first = dock.capture.requests()[0]?.json as { tools: { function: { name: string; parameters: { properties: Record<string, unknown> } } }[] };
		expect(first.tools.some(tool => tool.function.name === "run")).toBe(true);
		expect(first.tools.some(tool => tool.function.name === "report")).toBe(false);
	} finally { await dock.close(); server.stop(true); }
}, 300_000);
