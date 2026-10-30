import { expect, test } from "bun:test";
import { nodeDock, toolText } from "./support/node-dock";

// S1/P16: diagnostic failure is independent of successful save and successful input submission.
// A generic "success" or "failed report" wrapper, or autonomous re-report, violates this literal.
test("P16 failed diagnostic preserves saved report and submitted notification without resubmission", async () => {
	let requests = 0;
	const response = { saved: true, report: { id: "report-diagnostic-34", body: "结果 E:/beta.txt；UTF-8；未经生产验证。" }, notification: { status: "submitted", reason: "input-submission-confirmed" }, diagnostic: { status: "failed", reason: "stderr unavailable" }, guidance: "已保存；诊断失败不撤销报告，不需要重报，尚未完成节点交接。" };
	const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch() { requests++; return Response.json(response); } });
	const dock = await nodeDock(`http://127.0.0.1:${server.port}`, response.report.body);
	try {
		expect((await dock.session.prompt("报告 beta 的结果一次")).status).toBe("completed");
		expect(JSON.parse(toolText(dock))).toEqual(response);
		expect(dock.session.frames().filter(frame => frame.type === "tool_execution_end")[0]?.isError).not.toBe(true);
		// Bounded external-process observation, not an assertion about infinite future behavior.
		await Bun.sleep(150);
		expect(requests).toBe(1);
	} finally { await dock.close(); server.stop(true); }
}, 300_000);
