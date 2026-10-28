import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { managerScenario } from "../workflow-chat/support/manager-scenario";

// S1/P10/P11/P13. Hand-derived graph: A,B initially ready; C needs both completed.
// Violation: treating report/running as handoff or auto-dispatching C after completing A/B.
// Real role+backend, only the external Herdr CLI/model are controlled; inspect both facts and calls.
test("P10/P11/P13 explicit complete preserves first handoff and only unlocks satisfied dependencies", async () => {
	const scene = await managerScenario();
	try {
		const initial = await scene.dock.call({ action: "status" });
		expect(initial.ready).toEqual(["A", "B"]);
		expect(initial.canFinish).toBe(false);
		expect(initial.snapshot.nodes.C.status).toBe("pending");
		expect(initial.blocked.C.join(" ")).toContain("A");
		expect(initial.blocked.C.join(" ")).toContain("B");
		const dependencyDenied = await scene.dispatch("C");
		expect(dependencyDenied.results[0].status).toBe("rejected");
		expect(dependencyDenied.results[0].reasons.join(" ")).toContain("A");
		expect(dependencyDenied.results[0].reasons.join(" ")).toContain("B");
		const pending = await scene.dock.call({ action: "complete", nodeId: "C", reason: "不应跳过待执行工作" });
		expect(pending).toMatchObject({ code: "node-not-completable", changed: false });
		await scene.dispatch("A"); await scene.dispatch("B");
		const calls = readFileSync(join(scene.backend.root.path, "calls.jsonl"), "utf8");
		expect(await scene.dock.call({ action: "complete", nodeId: "A", reason: "   " })).toMatchObject({ code: "completion-reason-required", changed: false });
		const reason = "A 已核实 E:/artifacts/alpha.txt；UTF-8，仅测试；原 Chat 仍在收尾。";
		const completed = await scene.dock.call({ action: "complete", nodeId: "A", reason });
		expect(completed.changed).toBe(true);
		expect(completed.snapshot.nodes.A.status).toBe("completed");
		expect(completed.snapshot.nodes.A.completion.reason).toBe(reason);
		expect(completed.ready).toEqual([]);
		expect(completed.blocked.C.length).toBeGreaterThan(0);
		const history = readFileSync(join(scene.backend.root.path, "runs", scene.runId, "history.jsonl"), "utf8");
		const duplicate = await scene.dock.call({ action: "complete", nodeId: "A", reason: "不得覆盖首次说明" });
		expect(readFileSync(join(scene.backend.root.path, "runs", scene.runId, "history.jsonl"), "utf8")).toBe(history);
		expect(duplicate.changed).toBe(false);
		expect(duplicate.snapshot.nodes.A.completion).toEqual(completed.snapshot.nodes.A.completion);
		const second = await scene.dock.call({ action: "complete", nodeId: "B", reason: "B 的 beta 材料已可交接，仍有收尾。" });
		expect(second.ready).toEqual(["C"]);
		expect(second.canFinish).toBe(false);
		expect(second.snapshot.nodes.C.status).toBe("pending");
		// External OMP/backend processes use their own real clocks, unaffected by fake timers.
		await Bun.sleep(150);
		expect(readFileSync(join(scene.backend.root.path, "calls.jsonl"), "utf8")).toBe(calls);
		expect((await scene.detail()).run).toEqual(second.snapshot);
		expect(scene.calls.map(call => call.path)).toEqual(["status", "complete", "complete", "complete", "complete", "complete"].map(action => `/api/workflow/manager/${action}`));
	} finally { await scene.close(); }
}, 300_000);

// P10/P11/P13: pause only forbids new execution; running work remains associated and completable.
test("P10/P11/P13 pause leaves existing execution alive and rejects new dispatch", async () => {
	const scene = await managerScenario();
	try {
		const running = await scene.dispatch("A");
		const before = readFileSync(join(scene.backend.root.path, "calls.jsonl"), "utf8");
		const paused = await scene.dock.call({ action: "pause" });
		expect(paused).toMatchObject({ changed: true, snapshot: { status: "paused", nodes: { A: running.snapshot.nodes.A, B: { status: "pending" } } }, ready: [], canFinish: false });
		const duplicate = await scene.dock.call({ action: "pause" });
		expect(duplicate).toMatchObject({ changed: false, snapshot: paused.snapshot });
		const denied = await scene.dispatch("B");
		expect(denied.results[0].status).toBe("rejected");
		expect(denied.results[0].reasons.join(" ")).toContain("paused");
		const completed = await scene.dock.call({ action: "complete", nodeId: "A", reason: "暂停期间交接，E:/alpha.txt 可用。" });
		expect(completed.snapshot.nodes.A.status).toBe("completed");
		expect(completed.snapshot.status).toBe("paused");
		// Observe external OMP/backend clocks in a finite window, not simulated timers.
		await Bun.sleep(150);
		expect(readFileSync(join(scene.backend.root.path, "calls.jsonl"), "utf8")).toBe(before);
		expect(scene.calls.map(call => call.path)).toEqual(["pause", "pause", "complete"].map(action => `/api/workflow/manager/${action}`));
	} finally { await scene.close(); }
}, 300_000);

// P10/P11/P13: fail records an execution failure, not an implicit pause, retry or termination.
// The first reason and original execution must survive a second, different reason.
test("P10/P11/P13 fail preserves original execution and first reason without extra host actions", async () => {
	const scene = await managerScenario();
	try {
		expect(await scene.dock.call({ action: "fail", nodeId: "C", reason: "pending 不得失败" })).toMatchObject({ code: "node-not-failable", changed: false });
		const running = await scene.dispatch("A");
		const execution = running.snapshot.nodes.A.execution;
		const before = readFileSync(join(scene.backend.root.path, "calls.jsonl"), "utf8");
		const reason = "已核实 alpha 缺少源文件；保留原 Chat 与部分产物。";
		const failed = await scene.dock.call({ action: "fail", nodeId: "A", reason });
		expect(failed).toMatchObject({ changed: true, snapshot: { status: "running", nodes: { A: { status: "failed", failure: { stage: "execution", message: reason }, execution } } } });
		const duplicate = await scene.dock.call({ action: "fail", nodeId: "A", reason: "不得替代首次失败" });
		expect(duplicate.changed).toBe(false);
		expect(duplicate.snapshot.nodes.A).toEqual(failed.snapshot.nodes.A);
		// These external processes cannot be advanced by test fake timers.
		await Bun.sleep(150);
		expect(readFileSync(join(scene.backend.root.path, "calls.jsonl"), "utf8")).toBe(before);
		expect((await scene.detail()).run).toEqual(failed.snapshot);
		const handoff = await scene.dock.call({ action: "complete", nodeId: "A", reason: "人工补齐 E:/alpha.txt，已核实可交接；无自动报告。" });
		expect(handoff.snapshot.nodes.A.status).toBe("completed");
		expect(handoff.reports).toEqual([]);
		expect(handoff.snapshot.nodes.A.execution).toEqual(execution);
		expect(scene.calls.map(call => call.path)).toEqual(["fail", "fail", "fail", "complete"].map(action => `/api/workflow/manager/${action}`));
		expect(readFileSync(join(scene.backend.root.path, "calls.jsonl"), "utf8")).toBe(before);
	} finally { await scene.close(); }
}, 300_000);
