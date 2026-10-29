import { expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { workflowBackend } from "../workflow-chat/support/backend";
import { nodeDock, toolText } from "../workflow-chat/support/node-dock";

// S1/P15/P16: actual node entry, public Session, real HTTP and actual backend routes/storage.
// The external Herdr process is explicitly controlled: it exposes this already-running OMP's
// native identity for backend association. This proves real backend integration, not real Herdr
// launching OMP or a real model choosing when/how to report (the fan-in acceptance owns that).
test("P15/P16 actual node report is backend-attributed, saved and retrievable despite real notification refusal, without completing node", async () => {
	const backend = await workflowBackend();
	const body = "独立正文：E:/acceptance/material-node-37.txt；UTF-8，只读样本，不适用于生产。";
	const dock = await nodeDock(backend.endpoint, body);
	try {
		const state = await dock.session.request({ type: "get_state" });
		if (!state.data || typeof state.data !== "object" || !("sessionId" in state.data) || typeof state.data.sessionId !== "string") throw new Error("No native Session identity");
		const nativeId = state.data.sessionId;
		for (const directory of [backend.root.path, dock.root.workDir]) await backend.post("/api/zones", { path: directory });
		const tasks: Record<string, string> = {};
		for (const role of ["manager", "node"]) {
			const result = await backend.post("/api/tasks", { name: `dock-${role}`, taskType: role === "node" ? "normal" : "manager", agent: "omp", chatName: "{chat.id}", model: "gpt-6.1-sol", thinking: "high", skill: "teach", prompt: `FIXED-${role}`, extensions: [] });
			const task = result.tasks.find((task: { name: string }) => task.name === `dock-${role}`);
			if (!task) throw new Error(`Missing created ${role} Task`);
			tasks[role] = task.id;
		}
		writeFileSync(join(backend.root.path, "bots/worker.json"), JSON.stringify({ id: "worker", name: "worker", when: "not injected", plan_guide: "not injected", node_guide: "not injected", task_id: tasks.node }));
		writeFileSync(join(backend.root.path, "maps/work.json"), JSON.stringify({ title: "Node report interop", description: "not injected", nodes: { A: { title: "A", bot_id: "worker", input: "node input", zone: dock.root.workDir, blocked_by: [] } } }));
		const managerId = "interop-manager-not-an-owner-key";
		backend.behavior(managerId, backend.root.path);
		const started = await backend.post("/api/scheduler/maps/work.json/runs", { managerTaskId: tasks.manager, zone: backend.root.path, userInput: "Independent backend report acceptance" });
		backend.behavior(nativeId, dock.root.workDir);
		const dispatched = await backend.post("/api/workflow/manager/dispatch", { sessionId: managerId, nodes: ["A"] });
		expect(dispatched.results[0].status).toBe("running");
		const execution = dispatched.snapshot.nodes.A.execution;
		expect(execution.chat.sessionId).toBe(nativeId);
		backend.behavior(nativeId, dock.root.workDir, true);
		expect((await dock.session.prompt("独立提交节点交接正文一次；后续收尾尚未完成。")).status).toBe("completed");
		const result = JSON.parse(toolText(dock));
		expect(result.saved).toBe(true);
		expect(result.notification.status).toBe("failed");
		expect(result.diagnostic.status).toBe("written");
		expect(result.report).toMatchObject({ type: "report", runId: started.id, nodeId: "A", executionId: execution.id, source: execution.chat, target: started.run.manager, body });
		expect(result.report.id).toBeString();
		expect(result.report.at).toBeNumber();
		const detail = await fetch(`${backend.endpoint}/api/workflow/runs/${started.id}`).then(response => response.json());
		expect(detail.reports).toEqual([result.report]);
		expect(detail.pendingReports).toEqual({ A: result.report.id });
		expect(detail.run.nodes.A.status).toBe("running");
		expect(detail.run.status).toBe("running");
		const stored = readFileSync(join(backend.root.path, "runs", started.id, "messages.jsonl"), "utf8");
		expect(JSON.parse(stored.trim())).toEqual(result.report);
		const callsBefore = readFileSync(join(backend.root.path, "calls.jsonl"), "utf8");
		// Real child/Herdr fixture clocks cannot be controlled by the test's fake timers.
		await Bun.sleep(150);
		expect(readFileSync(join(backend.root.path, "calls.jsonl"), "utf8")).toBe(callsBefore);
		expect(backend.output.join("")).toContain("workflow-report-delivery");
	} finally { await dock.close(); await backend.close(); }
}, 300_000);
