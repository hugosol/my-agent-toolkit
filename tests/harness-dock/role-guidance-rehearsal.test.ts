import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { managerScenario } from "../workflow-chat/support/manager-scenario";
import { nodeDock, toolText } from "../workflow-chat/support/node-dock";
import { roleGuidance } from "../workflow-chat/support/prompt-dock";

// S1/P26 technical rehearsal, not H1 or real-model task-quality acceptance.
// Independent decision rubric: saved notification failure -> read, never re-report;
// repaired original -> recover, fresh work -> confirmed retry; latest true report -> explicit complete.
// The Agent-authored choices below use the actual injected guides and exercise real tools/backend.
// Controlled provider/Herdr and test-authored materials are explicitly not model-produced work.
test("P26 injected guidance supports notification failure, original recovery, independent retry and real manual handoff rehearsal", async () => {
	const scene = await managerScenario();
	const artifact = join(scene.backend.root.path, "handoff-26.txt");
	const node = await nodeDock(scene.backend.endpoint, { body: "结果可交接；仅验收样本，尚有无害收尾。", can_complete: true, outputs: [{ id: "handoff", path: artifact }] });
	const observations: { step: string; result: unknown }[] = [];
	const guides: Record<string, string> = {};
	const action = async (params: unknown) => {
		const result = await scene.dock.call(params);
		observations.push({ step: JSON.stringify(params), result });
		return result;
	};
	try {
		const nodeState = await node.session.request({ type: "get_state" });
		if (!nodeState.data || typeof nodeState.data !== "object" || !("sessionId" in nodeState.data) || typeof nodeState.data.sessionId !== "string") throw new Error("Missing node identity");
		await action({ action: "status" });
		guides.manager = roleGuidance(scene.dock.capture.requests()[0]!, "manager");
		scene.backend.behavior(nodeState.data.sessionId, scene.backend.root.path);
		const dispatched = await action({ action: "dispatch", nodes: ["A"] });
		const original = dispatched.snapshot.nodes.A.execution;
		writeFileSync(artifact, "交接材料 26：UTF-8；只读样本；非生产证据。\n");
		scene.backend.behavior(nodeState.data.sessionId, scene.backend.root.path, true);
		expect((await node.session.prompt("材料已可交接，报告一次；仍有不影响材料的收尾。")).status).toBe("completed");
		guides.node = roleGuidance(node.capture.requests()[0]!, "node");
		const report = JSON.parse(toolText(node));
		observations.push({ step: "report saved, auxiliary delivery refused", result: report });
		expect(report).toMatchObject({ saved: true, notification: { status: "failed" } });
		const collected = await scene.dock.collect();
		observations.push({ step: "collect saved report without re-report", result: collected });
		expect(collected.reason).toBe("notification");
		expect(collected.pendingReports.A).toBe(report.report.id);
		const detail = await scene.detail();
		expect(detail.reports).toHaveLength(1);
		expect(detail.reports[0].outputs).toEqual([{ id: "handoff", path: artifact }]);
		expect(detail.reports[0].body).not.toContain("交接材料 26：");
		expect(detail.run.nodes.A.status).toBe("running");
		expect(readFileSync(artifact, "utf8")).toBe("交接材料 26：UTF-8；只读样本；非生产证据。\n");
		await action({ action: "fail", nodeId: "A", reason: "人工核实原 Chat 收尾遇到缺少输入，保留已保存材料" });
		expect(await action({ action: "recover", nodeId: "A", confirmed: false, reason: "尚未核实修复" })).toMatchObject({ code: "recovery-confirmation-required" });
		const recovered = await action({ action: "recover", nodeId: "A", confirmed: true, reason: "人工已补齐输入并核实原 Chat 可以继续；不启动新执行" });
		expect(recovered.snapshot.nodes.A.execution).toEqual(original);
		await action({ action: "fail", nodeId: "A", reason: "人工核实必须独立重做，旧产物与副作用保留" });
		expect(await action({ action: "retry", nodeId: "A", confirmed: false, reason: "未检查旧副作用" })).toMatchObject({ code: "retry-confirmation-required" });
		await action({ action: "pause" });
		expect(await action({ action: "retry", nodeId: "A", confirmed: true, reason: "已核实但当前暂停" })).toMatchObject({ code: "run-paused" });
		await action({ action: "resume" });
		expect((await node.session.request({ type: "new_session" })).success).toBe(true);
		const freshState = await node.session.request({ type: "get_state" });
		if (!freshState.data || typeof freshState.data !== "object" || !("sessionId" in freshState.data) || typeof freshState.data.sessionId !== "string") throw new Error("Missing fresh native identity");
		scene.backend.behavior(freshState.data.sessionId, scene.backend.root.path);
		const retried = await action({ action: "retry", nodeId: "A", confirmed: true, reason: "人工检查原 Chat 和部分产物，确认另起新执行，旧副作用保留" });
		expect(retried.snapshot.nodes.A.execution.id).not.toBe(original.id);
		expect(retried.snapshot.nodes.A.previousExecutions[0].execution).toEqual(original);
		// External business handling creates the material. A true from the old execution
		// cannot authorize this retry; exercise refusal, existing wait and a new explicit report.
		writeFileSync(artifact, "人工补齐材料 26：UTF-8；只读引用；仍未经过生产验证。\n");
		const material = readFileSync(artifact, "utf8");
		expect(material).toBe("人工补齐材料 26：UTF-8；只读引用；仍未经过生产验证。\n");
		expect(await action({ action: "complete", nodeId: "A", reason: "不能借用旧执行报告或人工判断绕过门禁" })).toMatchObject({ changed: false, snapshot: { nodes: { A: { status: "running" } } } });
		scene.backend.behavior(freshState.data.sessionId, scene.backend.root.path, true);
		expect((await node.beginReport({ body: "部分结果已生成，仍需补齐交接说明。", can_complete: false, outputs: [{ id: "handoff", path: artifact }] })).status).toBe("completed");
		const blockedReport = JSON.parse(toolText(node));
		expect(blockedReport).toMatchObject({ saved: true, report: { canComplete: false, executionId: retried.snapshot.nodes.A.execution.id } });
		expect((await scene.dock.collect()).reason).toBe("notification");
		expect(await action({ action: "complete", nodeId: "A", reason: "最新 false 报告不得完成" })).toMatchObject({ changed: false, snapshot: { nodes: { A: { status: "running" } } } });
		const waiting = await scene.dock.collect();
		expect(waiting.reason).toBe("timeout");
		expect(waiting.pendingReports).toEqual({ A: blockedReport.report.id });
		expect((await node.beginReport({ body: "交接说明已补齐；只读引用，非生产验证。", can_complete: true })).status).toBe("completed");
		expect((await scene.dock.collect()).reason).toBe("notification");
		const handoff = await action({ action: "complete", nodeId: "A", reason: "按当前执行最新 true 报告显式交接；未默认读取输出正文验收" });
		expect(handoff.snapshot.nodes.A.status).toBe("completed");
		expect((await scene.detail()).reports).toHaveLength(3);
		expect(readFileSync(artifact, "utf8")).toBe(material);
	} finally {
		const evidence = process.env.WORKFLOW_PROMPT_EVIDENCE_DIR;
		if (evidence) {
			mkdirSync(evidence, { recursive: true });
			writeFileSync(join(evidence, "guidance-rehearsal.json"), JSON.stringify({ scope: "Real OMP and backend; Agent-authored decisions; controlled provider and Herdr; test-authored materials, NOT real-model task completion or H1 approval", guides, observations, managerRequests: scene.dock.capture.requests().map(request => request.json), nodeRequests: node.capture.requests().map(request => request.json), httpCalls: scene.calls, backendCalls: readFileSync(join(scene.backend.root.path, "calls.jsonl"), "utf8") }, null, 2));
		}
		await node.close(); await scene.close();
	}
}, 300_000);
