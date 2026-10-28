import { expect, test } from "bun:test";
import { managerScenario } from "../workflow-chat/support/manager-scenario";

// S1/P9/P17: the real backend is configured to expire after 1s, the ordinary client budget
// is only 60ms, collect gets 3000ms. A client reusing the ordinary budget cannot return this
// complete real snapshot. Ready B must not force an immediate response while A is running.
test("P9/P17 collect outlives the ordinary budget and waits with ready plus running nodes", async () => {
	const scene = await managerScenario({ requestTimeoutMs: 60, collectTimeoutMs: 3000 });
	try {
		const dispatched = await scene.dispatch("A");
		expect(dispatched.results[0].status).toBe("running");
		const started = performance.now();
		const result = await scene.dock.collect();
		expect(result.reason).toBe("timeout");
		expect(performance.now() - started).toBeGreaterThanOrEqual(900);
		expect(result.snapshot).toEqual(dispatched.snapshot);
		expect(result.ready).toEqual(["B"]);
		expect(result.pendingReports).toEqual({});
		expect(result).not.toHaveProperty("reports");
		expect(scene.calls).toEqual([{ path: "/api/workflow/manager/collect", body: { sessionId: scene.managerId } }]);
	} finally { await scene.close(); }
}, 300_000);

// S1/P9: reverse the budgets. Using the ordinary 3000ms budget would incorrectly yield a
// normal backend timeout. A 200ms collect deadline must instead yield a client error, with
// no fabricated snapshot and the real backend facts still intact.
test("P9 collect's own shorter budget expires as a client error, not backend timeout", async () => {
	const scene = await managerScenario({ requestTimeoutMs: 3000, collectTimeoutMs: 200 });
	try {
		const dispatched = await scene.dispatch("A");
		expect(dispatched.results[0].status).toBe("running");
		const result = await scene.dock.collect();
		expect(result).toMatchObject({ error: { kind: "timeout" } });
		expect(result).not.toHaveProperty("reason");
		expect(result).not.toHaveProperty("snapshot");
		expect(result.guidance).toContain("不要自动重试");
		expect((await scene.detail()).run).toEqual(dispatched.snapshot);
		expect(scene.calls).toEqual([{ path: "/api/workflow/manager/collect", body: { sessionId: scene.managerId } }]);
	} finally { await scene.close(); }
}, 300_000);
