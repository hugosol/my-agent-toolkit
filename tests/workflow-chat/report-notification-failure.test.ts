import { expect, test } from "bun:test";
import { nodeDock, toolText } from "./support/node-dock";

// S1/P16: independently specified stage results. Treating auxiliary delivery as failed save,
// or suppressing the specific Herdr refusal, loses the report/stage evidence asserted here.
test("P16 saved report with failed auxiliary notification stays saved and is not automatically resubmitted", async () => {
	let requests = 0;
	const saved = { saved: true, report: { id: "report-saved-91", at: 1790000000123, executionId: "exec-29", body: "E:/handoff.txt；只读，尚未验收。" }, notification: { status: "failed", reason: "Herdr target unavailable" }, diagnostic: { status: "written" }, guidance: "报告已保存，不要仅因通知失败重新 report；由管理者显式确认交接。" };
	const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch() { requests++; return Response.json(saved); } });
	const dock = await nodeDock(`http://127.0.0.1:${server.port}`, saved.report.body);
	try {
		expect((await dock.session.prompt("提交一次已可交接结果")).status).toBe("completed");
		expect(JSON.parse(toolText(dock))).toEqual(saved);
		const results = dock.session.frames().filter(frame => frame.type === "tool_execution_end");
		expect(results).toHaveLength(1);
		expect(results[0]?.isError).not.toBe(true);
		// Bounded observation of actual child-process HTTP; fake timers cannot move OMP's clock.
		await Bun.sleep(150);
		expect(requests).toBe(1);
	} finally { await dock.close(); server.stop(true); }
}, 300_000);
