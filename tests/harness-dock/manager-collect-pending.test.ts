import { expect, test } from "bun:test";
import { managerScenario } from "../workflow-chat/support/manager-scenario";

// Approved seam S1/P17/P18. Real manager tool, Session, HTTP and isolated backend storage.
// Public backend calls prepare reports/old executions independently of ticket05; only the
// external Herdr CLI/provider are controlled. Expected applicability comes from the contract:
// reading cannot clear A; completed A cannot reopen; B's late old report cannot replace B-new.
test("P17/P18 collect keeps real handoff pending across reads, completion and interleaved execution reports", async () => {
	const scene = await managerScenario({ collectTimeoutMs: 3000 });
	try {
		async function collect(reason: string, pendingReports: Record<string, string>) {
			const result = await scene.dock.collect();
			expect(result.reason).toBe(reason);
			expect(result.pendingReports).toEqual(pendingReports);
			expect(result).not.toHaveProperty("reports");
			expect(JSON.stringify(result)).not.toContain("REPORT_BODY_");
			return result;
		}
		async function report(sessionId: string, body: string) {
			// The real CLI refuses auxiliary input; saved reports must remain collectible.
			scene.backend.behavior(sessionId, scene.backend.root.path, true);
			const result = await scene.backend.post("/api/workflow/node/report", { sessionId, body });
			expect(result.saved).toBe(true);
			expect(result.notification.status).toBe("failed");
			return result.report;
		}
		const initial = await collect("no-running", {});
		expect(initial.ready).toEqual(["A", "B"]);
		expect(initial.snapshot.status).toBe("running");
		const paused = await scene.dock.call({ action: "pause" });
		expect((await collect("paused", {})).snapshot).toEqual(paused.snapshot);
		await scene.dock.call({ action: "resume" });

		const first = await scene.dispatch("A");
		expect(first.results[0].status).toBe("running");
		const a = await report("node-native-A", "REPORT_BODY_A before handoff; E:/alpha.txt; test only");
		const notified = await collect("notification", { A: a.id });
		expect(notified.snapshot.nodes.A.status).toBe("running");
		expect(notified.snapshot.nodes.A.execution.id).toBe(a.executionId);
		const repeated = await collect("timeout", { A: a.id });
		expect(repeated.snapshot).toEqual(notified.snapshot);
		const read = await scene.dock.call({ action: "status" });
		expect(read.reports).toEqual([a]);
		expect(read.pendingReports).toEqual({ A: a.id });
		expect((await scene.detail()).pendingReports).toEqual({ A: a.id });
		expect((await collect("timeout", { A: a.id })).snapshot).toEqual(notified.snapshot);

		const completedA = await scene.dock.call({ action: "complete", nodeId: "A", reason: "已核实 alpha 材料，只读交接；原 Chat 继续收尾。" });
		expect(completedA.pendingReports).toEqual({});
		const aLate = await report("node-native-A", "REPORT_BODY_A_LATE harmless cleanup after completed");
		const afterComplete = await collect("notification", {});
		expect(afterComplete.snapshot.nodes.A.status).toBe("completed");
		expect(afterComplete.snapshot.nodes.A.completion).toEqual(completedA.snapshot.nodes.A.completion);
		expect((await collect("no-running", {})).snapshot).toEqual(afterComplete.snapshot);

		const old = await scene.dispatch("B");
		expect(old.results[0].status).toBe("running");
		const oldExecution = old.snapshot.nodes.B.execution;
		const old1 = await report("node-native-B", "REPORT_BODY_B_OLD_1 historical alpha-independent output");
		await collect("notification", { B: old1.id });
		await scene.backend.post("/api/workflow/manager/fail", { sessionId: scene.managerId, nodeId: "B", reason: "原执行材料已核实不可继续；保留旧现场。" });
		scene.backend.behavior("node-native-B-new", scene.backend.root.path);
		const retried = await scene.backend.post("/api/workflow/manager/retry", { sessionId: scene.managerId, nodeId: "B", confirmed: true, reason: "已核实重复副作用，明确另起独立执行。" });
		expect(retried.result.status).toBe("running");
		const newExecution = retried.snapshot.nodes.B.execution;
		expect(newExecution.id).not.toBe(oldExecution.id);
		expect(newExecution.chat.sessionId).toBe("node-native-B-new");
		const newPending = await collect("timeout", {});
		expect(newPending.snapshot.nodes.B.execution).toEqual(newExecution);
		expect(newPending.snapshot.nodes.B.previousExecutions[0].execution).toEqual(oldExecution);

		const new1 = await report("node-native-B-new", "REPORT_BODY_B_NEW_1 current execution result");
		await collect("notification", { B: new1.id });
		const old2 = await report("node-native-B", "REPORT_BODY_B_OLD_2 later but inapplicable historical result");
		expect(old2.executionId).toBe(oldExecution.id);
		expect((await collect("notification", { B: new1.id })).snapshot.nodes.B.execution).toEqual(newExecution);
		const new2 = await report("node-native-B-new", "REPORT_BODY_B_NEW_2 corrected current execution result");
		expect(new2.executionId).toBe(newExecution.id);
		await collect("notification", { B: new2.id });
		const old3 = await report("node-native-B", "REPORT_BODY_B_OLD_3 newest global report is still historical");
		await collect("notification", { B: new2.id });
		const history = await scene.dock.call({ action: "status" });
		expect(history.reports).toEqual([a, aLate, old1, new1, old2, new2, old3]);
		expect(history.pendingReports).toEqual({ B: new2.id });
		expect((await collect("timeout", { B: new2.id })).snapshot).toEqual(history.snapshot);

		await scene.dock.call({ action: "complete", nodeId: "B", reason: "只核实并交接新执行材料，不借用旧执行结果。" });
		const third = await scene.dispatch("C");
		expect(third.results[0].status).toBe("running");
		await scene.dock.call({ action: "complete", nodeId: "C", reason: "C 依赖已满足，结果已核实可交接。" });
		const finished = await scene.dock.call({ action: "finish" });
		expect((await collect("completed", {})).snapshot).toEqual(finished.snapshot);
		const terminalReport = await report("node-native-B-new", "REPORT_BODY_B_TERMINAL cleanup after Run finish");
		const terminal = await collect("completed", {});
		expect(terminal.snapshot).toEqual(finished.snapshot);
		expect(terminal.canFinish).toBe(false);
		const detail = await scene.detail();
		expect(detail.pendingReports).toEqual({});
		expect(detail.reports).toEqual([a, aLate, old1, new1, old2, new2, old3, terminalReport]);
		expect(detail.run).toEqual(finished.snapshot);
	} finally { await scene.close(); }
}, 300_000);
