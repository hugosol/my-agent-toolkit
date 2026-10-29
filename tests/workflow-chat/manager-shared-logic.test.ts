import { expect, test } from "bun:test";
import { businessRoles } from "./support/business-roles";

// Approved seam: ManagerActions, with real WorkflowRequests and framework Session readings.
// A native schema may strip unknown keys; direct callers must still reject the entire call,
// rather than silently dispatching a different action or accepting a supplied identity.
test("manager shared logic rejects identity and inapplicable fields without relying on OMP schemas", async () => {
	let requests = 0;
	const refusal = { error: "This Session is not the manager of an active Run", stateCommitted: false };
	const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch() {
		requests++;
		return Response.json(refusal, { status: 409 });
	} });
	const roles = businessRoles(`http://127.0.0.1:${server.port}`);
	try {
		const actions = [
			{ action: "status" }, { action: "pause" }, { action: "resume" }, { action: "finish" },
			{ action: "complete", nodeId: "A", reason: "交接已核实" },
			{ action: "fail", nodeId: "A", reason: "源材料缺失" },
			{ action: "dispatch", nodes: ["A"] },
			{ action: "reconcile_dispatch", nodeId: "A", finding: "uncertain", reason: "正在核查" },
			{ action: "recover", nodeId: "A", confirmed: false, reason: "尚未确认" },
			{ action: "retry", nodeId: "A", confirmed: true, reason: "已检查旧执行副作用" },
		];
		for (const action of actions) {
			for (const extra of [
				{ sessionId: "forged-session" }, { runId: "forged-run" },
				{ executionId: "forged-execution" }, { recipient: "forged-recipient" },
				{ body: "not an action parameter" },
			]) {
				const result = await roles.manager.run(roles.sessionId, { ...action, ...extra });
				expect(result.isError).toBe(true);
			}
		}
		for (const input of [
			{ action: "status", nodes: ["A"] },
			{ action: "complete", nodeId: "A", reason: "checked", confirmed: true },
			{ action: "dispatch", nodes: ["A"], reason: "not applicable" },
			{ action: "recover", nodeId: "A", reason: "missing confirmation" },
			{ action: "reconcile_dispatch", nodeId: "A", finding: "created", reason: "checked", confirmed: true },
		]) expect((await roles.manager.run(roles.sessionId, input)).isError).toBe(true);
		for (const input of [{ sessionId: "forged-session" }, { runId: "forged-run" }, { executionId: "forged-execution" }, { action: "status" }, { unexpected: true }]) {
			const result = await roles.manager.collect(roles.sessionId, input);
			expect(result.isError).toBe(true);
		}
		expect(requests).toBe(0);

		// A valid call reaches real HTTP and preserves the backend's refusal rather than
		// claiming success or applying the same blanket rejection to every caller.
		for (const result of [
			await roles.manager.run(roles.sessionId, { action: "status" }),
			await roles.manager.collect(roles.sessionId, {}),
		]) {
			expect(result).toMatchObject({ body: refusal, httpStatus: 409, isError: true });
			expect(result.message).toBeUndefined();
		}
		expect(requests).toBe(2);
	} finally { roles.close(); server.stop(true); }
});
