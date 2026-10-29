import { expect, test } from "bun:test";
import { businessRoles } from "./support/business-roles";

// Approved seam: NodeReports, not native tool registration/schema. Only the external
// backend HTTP response is controlled; validation and report outcome classification stay real.
test("node shared logic rejects extra and identity fields before sending a report", async () => {
	let requests = 0;
	const saved = { saved: true, report: { id: "report-valid", body: "E:/handoff.txt；只读，尚未验收。" }, notification: { status: "not-attempted" } };
	const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch() {
		requests++;
		return Response.json(saved);
	} });
	const roles = businessRoles(`http://127.0.0.1:${server.port}`);
	try {
		for (const extra of [
			{ sessionId: "forged-session" }, { runId: "forged-run" },
			{ executionId: "forged-execution" }, { nodeId: "other-node" },
			{ recipient: "forged-recipient" }, { unexpected: true },
		]) {
			const result = await roles.node.report(roles.sessionId, { body: saved.report.body, ...extra });
			expect(result.isError).toBe(true);
		}
		for (const input of [null, {}, { body: 123 }, { body: ["not a string"] }]) {
			expect((await roles.node.report(roles.sessionId, input)).isError).toBe(true);
		}
		expect(requests).toBe(0);
		expect(await roles.node.report(roles.sessionId, { body: saved.report.body })).toMatchObject({ body: saved, httpStatus: 200, isError: false });
		expect(requests).toBe(1);
	} finally { roles.close(); server.stop(true); }
});

// Independent stage results from the report protocol distinguish the actual failure
// condition from the plausible bug "HTTP 200 always succeeds" or "notification failure
// means the report was not saved". No internal collaborator supplies that classification.
for (const scenario of [
	{
		name: "saved=false is a report failure even when HTTP succeeds",
		status: 200,
		body: { code: "report-save-failed", saved: false, error: "messages.jsonl: access denied", notification: { status: "not-attempted" } },
		isError: true,
	},
	{
		name: "saved=true remains successful when auxiliary notification fails",
		status: 200,
		body: { saved: true, report: { id: "report-saved-91", body: "E:/handoff.txt；只读，尚未验收。" }, notification: { status: "failed", reason: "Herdr target unavailable" }, diagnostic: { status: "written" }, guidance: "报告已保存，不要仅因通知失败重新 report。" },
		isError: false,
	},
	{
		name: "saved=true remains successful when the auxiliary diagnostic fails",
		status: 200,
		body: { saved: true, report: { id: "report-saved-92", body: "E:/handoff.txt" }, notification: { status: "sent" }, diagnostic: { status: "failed", reason: "diagnostic directory is read-only" } },
		isError: false,
	},
	{
		name: "an HTTP refusal remains a failure even if the body says saved=true",
		status: 503,
		body: { saved: true, report: { id: "report-saved-93", body: "E:/handoff.txt" }, error: "backend unavailable after save" },
		isError: true,
	},
]) {
	test(`node shared logic ${scenario.name}`, async () => {
		let requests = 0;
		const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch() {
			requests++;
			return Response.json(scenario.body, { status: scenario.status });
		} });
		const roles = businessRoles(`http://127.0.0.1:${server.port}`);
		try {
			const result = await roles.node.report(roles.sessionId, { body: "E:/handoff.txt；只读，尚未验收。" });
			expect(result).toMatchObject({ body: scenario.body, httpStatus: scenario.status, isError: scenario.isError });
			expect(result.message).toBeUndefined();
			expect(requests).toBe(1);
		} finally { roles.close(); server.stop(true); }
	});
}
