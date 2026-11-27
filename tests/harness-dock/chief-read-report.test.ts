import { expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { chiefDock, type ChiefDock } from "../workflow-chat/support/chief-dock";
import { createRunRoot } from "./run-root";

// Approved S3 protocol seam. A new real chief Session reads an immutable report
// without old delegation context. Controlled HTTP outcomes are not model judgments.
// Violation: truncated node-body or guessed success replacing a failed/blocked result.
for (const host of ["omp", "pi"] as const) {
	test(`${host} new chief reads success failure blocked and capability results unchanged`, async () => {
		const calls: { method: string; path: string; body: unknown }[] = [];
		let report: unknown;
		const peer = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
			calls.push({ method: request.method, path: new URL(request.url).pathname, body: await request.json() });
			return Response.json({ report, received: true, receipt: { reportId: "original/report-15" }, process: false });
		} });
		const root = createRunRoot("chief-unfamiliar-file");
		const path = join(root.workDir, "artifact.txt");
		const literal = "The west gate opens at 07:35; the east gate remains closed.";
		let dock: ChiefDock | undefined;
		try {
			writeFileSync(path, literal);
			dock = await chiefDock(host, peer.url.origin);
			for (const [result, execution, summary] of [
				["success", "invoice Bot", "Produced 3 invoices"],
				["failure", "invoice Bot", "Export failed; one draft exists"],
				["blocked", "invoice Bot", "No publication permission"],
				["success", "Create Task Bot", "Capability saved; no invoices executed"],
			]) {
				report = { id: "original/report-15", from: "actual-executor", delegationId: "stable-delegation", at: 1700000000000,
					body: { background: "Invoice capability request", execution, result, summary,
						deliverables: ["Printed copy issued separately"], pendingDecisions: ["Review the limitations"],
						...(result === "success" && execution === "invoice Bot" ? { outputs: [{ id: "opaque-7b4e", path }] } : {}) } };
				expect(await dock.call({ id: "original/report-15" }, "chief_read_report")).toMatchObject({ isError: false, details: { body: { report, received: true, process: false } } });
				if (result === "success" && execution === "invoice Bot") {
					const read = await dock.call({ path }, "read");
					expect(read.isError).toBe(false);
					expect(read.content).toEqual(expect.arrayContaining([expect.objectContaining({ text: expect.stringContaining(literal) })]));
					const captures = dock.capture.requests();
					expect(JSON.stringify(captures[captures.length - 1]?.json)).toContain(literal);
					expect(calls).toHaveLength(1); // No autonomous view, receive, resend or delegation.
				}
			}
			expect(calls).toEqual(Array.from({ length: 4 }, () => ({ method: "POST", path: "/api/chief/reports/original%2Freport-15/view", body: { sessionId: expect.any(String) } })));
			const history = await dock.history();
			expect(history).toContain("chief-chat:tools");
			expect(history).toContain("按 outputs 中的实际地址读取文件，不根据 ID 猜测内容");
			const before = calls.length;
			expect(await dock.call({ id: "original/report-15", sessionId: "forged" }, "chief_read_report")).toMatchObject({ isError: true });
			expect(calls).toHaveLength(before);
		} finally { try { await dock?.close(); } finally { peer.stop(true); root.dispose(); } }
	}, 180_000);
}
