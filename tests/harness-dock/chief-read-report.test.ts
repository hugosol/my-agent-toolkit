import { expect, test } from "bun:test";
import { chiefDock } from "../workflow-chat/support/chief-dock";

// Approved S3 protocol seam. A new real chief Session reads an immutable report
// without old delegation context. Controlled HTTP outcomes are not model judgments.
// Violation: truncated node-body or guessed success replacing a failed/blocked result.
for (const host of ["omp", "pi"] as const) {
	test(`${host} new chief reads success failure blocked and capability results unchanged`, async () => {
		const calls: { method: string; path: string }[] = [];
		let report: unknown;
		const peer = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(request) {
			calls.push({ method: request.method, path: new URL(request.url).pathname });
			return Response.json(report);
		} });
		const dock = await chiefDock(host, peer.url.origin);
		try {
			for (const [result, execution, summary] of [
				["success", "invoice Bot", "Produced 3 invoices"],
				["failure", "invoice Bot", "Export failed; one draft exists"],
				["blocked", "invoice Bot", "No publication permission"],
				["success", "Create Task Bot", "Capability saved; no invoices executed"],
			]) {
				report = { id: "original/report-15", from: "actual-executor", delegationId: "stable-delegation", at: 1700000000000,
					body: { background: "Invoice capability request", execution, result, summary,
						deliverables: ["E:/owned/draft.md"], pendingDecisions: ["Review the limitations"] } };
				expect(await dock.call({ id: "original/report-15" }, "chief_read_report")).toMatchObject({ isError: false, details: { body: report } });
			}
			expect(calls).toEqual(Array.from({ length: 4 }, () => ({ method: "GET", path: "/api/chief/reports/original%2Freport-15" })));
			const history = await dock.history();
			expect(history).toContain("chief-chat:tools");
			expect(history).toContain("询问是否满足要求");
			const before = calls.length;
			expect(await dock.call({ id: "original/report-15", sessionId: "forged" }, "chief_read_report")).toMatchObject({ isError: true });
			expect(calls).toHaveLength(before);
		} finally { try { await dock.close(); } finally { peer.stop(true); } }
	}, 180_000);
}
