import { expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { workflowBackend } from "../workflow-chat/support/backend";
import { dualRoleDock } from "../workflow-chat/support/dual-role-dock";

// Approved mechanism seams: installed OMP/Pi tools -> real backend HTTP/storage.
// A dual-role Session must manage its child, report to its unique parent execution,
// and remain usable after finish; latest report and explicit parent completion gate close.
// Provider tool selection and external Herdr are controlled. This is NOT autonomous
// model/manual-approval acceptance or real Herdr Tab-lifetime evidence.
for (const host of ["omp", "pi"] as const) for (const chiefDelegated of [false, true]) test(`${host} P18 ${chiefDelegated ? "chief-delegated" : "ordinary"} native dual roles keep nested finish, outer readiness and explicit completion independent`, async () => {
	const backend = await workflowBackend();
	const observations: unknown[] = [];
	try {
		const dock = await dualRoleDock(host, backend.endpoint);
		try {
		const state = await dock.session.request({ type: "get_state" });
		const data = state.data;
		if (!data || typeof data !== "object" || !("sessionId" in data) || typeof data.sessionId !== "string") throw new Error("Missing native Session identity");
		const nativeId = data.sessionId;
		await dock.session.request({ type: "set_session_name", name: "display-name-not-an-execution" });
		const call = async (name: string, params: unknown) => {
			const result = await dock!.call(name, params);
			const body = typeof result.body === "string" ? JSON.parse(result.body) : result.body;
			observations.push({ name, params, isError: result.isError, body });
			return { ...result, body };
		};
		const detail = async (id: string) => {
			const response = await fetch(`${backend.endpoint}/api/workflow/runs/${id}`);
			expect(response.status).toBe(200);
			return response.json();
		};
		const parentAction = async (expectedStatus: number) => {
			const response = await fetch(`${backend.endpoint}/api/workflow/manager/complete`, {
				method: "POST", headers: { "content-type": "application/json" },
				body: JSON.stringify({ sessionId: "outer-manager", nodeId: "call", reason: "Accept latest actual report" }),
			});
			expect(response.status).toBe(expectedStatus);
			return response.json();
		};
		await backend.post("/api/zones", { id: "test/outer", path: backend.root.path });
		await backend.post("/api/zones", { id: "test/inner", path: dock.root.workDir });
		const tasks: Record<string, string> = {};
		for (const role of ["manager", "worker"] as const) {
			const created = await backend.post("/api/tasks", { name: role, taskType: role === "manager" ? "manager" : "normal",
				agent: host, chatName: "{chat.id}", model: "gpt-6.1-sol", thinking: "high", skill: null, prompt: "Controlled mechanism input" });
			tasks[role] = created.tasks.find((task: { name: string }) => task.name === role).id;
		}
		writeFileSync(join(backend.root.path, "bots/worker.json"), JSON.stringify({ id: "worker", name: "Worker", when: "", plan_guide: "", node_guide: "", task_id: tasks.worker }));
		writeFileSync(join(backend.root.path, "maps/inner.json"), JSON.stringify({ title: "Inner", description: "", nodes: {
			inside: { title: "Internal work", bot_id: "worker", input: "INTERNAL", zone: "test/inner", blocked_by: [], auto_close: false },
		} }));
		await backend.post("/api/scheduler/bots/save", { id: "nested", content: JSON.stringify({ name: "Nested", when: "", plan_guide: "", node_guide: "", map_file: "inner.json" }), revision: null });
		writeFileSync(join(backend.root.path, "maps/outer.json"), JSON.stringify({ title: "Outer", description: "", nodes: {
			call: { title: "Nested call", bot_id: "nested", manager_task_id: tasks.manager, input: "OUTER", zone: "test/inner", blocked_by: [], output_rule: [{ id: "result" }], auto_close: true },
			consumer: { title: "Consumer", bot_id: "worker", input: "CONSUME", zone: "test/inner", blocked_by: ["call"] },
		} }));
		const identify = (sessionId: string, cwd: string) => writeFileSync(join(backend.root.path, "behavior.json"), JSON.stringify({ native_session: { source: `herdr:${host}`, agent: host, kind: "id", value: sessionId }, native_cwd: cwd }));
		const chiefCreated = await backend.post("/api/tasks", { name: "P18 chief", taskType: "chief", agent: host, chatName: "{chat.id}", model: "default", prompt: "" });
		const chiefTask = chiefCreated.tasks.find((task: { name: string }) => task.name === "P18 chief").id;
		identify("P18-chief", backend.root.path);
		const chiefPreview = await backend.post("/api/chats/preview", { zone: "test/outer", taskId: chiefTask });
		const chiefStart = await backend.post("/api/chats", { zone: "test/outer", taskId: chiefTask, chatId: chiefPreview.chatId });
		const chiefDeadline = Date.now() + 20_000;
		let chiefReady = false;
		while (Date.now() < chiefDeadline) {
			const state = await fetch(`${backend.endpoint}/api/chats/${chiefStart.id}`).then(response => response.json());
			if (state.stage === "failed") throw new Error(JSON.stringify(state));
			if (state.stage === "succeeded") { chiefReady = true; break; }
			await Bun.sleep(25); // Separate backend process owns startup/publication.
		}
		expect(chiefReady).toBe(true);
		await backend.post("/api/sessions/events", { sessionId: "P18-chief", kind: "register", data: { cwd: backend.root.path, agentType: host } });
		identify("outer-manager", backend.root.path);
		let outer;
		if (chiefDelegated) {
			await backend.post("/api/scheduler/bots/save", { id: "outer", revision: null, content: JSON.stringify({ name: "Outer", when: "", plan_guide: "", node_guide: "", map_file: "outer.json" }) });
			const preview = await backend.post("/api/chief/delegations/preview", { sessionId: "P18-chief", botId: "outer", managerTaskId: tasks.manager, zoneId: "test/outer", input: "Nested native mechanism", materials: [] });
			outer = await backend.post("/api/chief/delegations", { sessionId: "P18-chief", previewId: preview.previewId });
		} else outer = await backend.post("/api/scheduler/maps/outer.json/runs", { managerTaskId: tasks.manager, zone: "test/outer", userInput: "Nested native mechanism" });
		await backend.post("/api/workflow/manager/prepare_inputs", { sessionId: "outer-manager", fileInputs: [], confirmed: true, reason: "已审阅外层文本输入，无文件要求" });
		identify(nativeId, dock.root.workDir);
		const dispatched = await backend.post("/api/workflow/manager/dispatch", { sessionId: "outer-manager", nodes: ["call"] });
		const execution = dispatched.snapshot.nodes.call.execution;
		const childId = execution.childRunId;
		expect(execution.chat.sessionId).toBe(nativeId);
		const status = await call("run", { action: "status" });
		expect(status.body.snapshot.id).toBe(childId);
		expect(status.body.snapshot.id).not.toBe(outer.id);
		const early = await call("report", { body: "Premature", can_complete: true });
		expect(early).toMatchObject({ isError: true, body: { code: "child-run-not-finished" } });
		expect((await detail(outer.id)).reports).toEqual([]);
		await call("report", { body: "Progress only", can_complete: false });
		expect(await parentAction(409)).toMatchObject({ code: "report-not-completable" });
		expect(status.body.snapshot.inputsReady).toBe(false);
		const prepared = await call("run", { action: "prepare_inputs", fileInputs: [], confirmed: true, reason: "已审阅内部文本输入，无文件要求" });
		expect(prepared.body).toMatchObject({ snapshot: { id: childId, inputsReady: true } });
		expect(prepared.body.changed === true || prepared.body.stateCommitted === true).toBe(true);
		expect(prepared.body.error).toBeUndefined();
		expect(prepared.body.historyError).toBeNull();
		identify("internal-worker", dock.root.workDir);
		const internal = await call("run", { action: "dispatch", nodes: ["inside"] });
		expect(internal.body.snapshot.id).toBe(childId);
		expect(internal.body.snapshot.nodes.inside.status).toBe("running");
		await backend.post("/api/workflow/node/report", { sessionId: "internal-worker", body: "Internal done", canComplete: true });
		const collected = await call("collect", {});
		const child = await detail(childId);
		expect(child.reports[0]).toMatchObject({ from: { sessionId: "internal-worker" }, to: { sessionId: nativeId }, runId: childId });
		expect((await fetch(`${backend.endpoint}/api/chief/reports`).then(response => response.json())).reports).toEqual([]);
		expect(collected.body).toMatchObject({ reason: "notification", pendingReports: { inside: child.reports[0].id } });
		await call("run", { action: "complete", nodeId: "inside", reason: "Internal handoff accepted" });
		expect((await detail(childId)).run.nodes.inside.status).toBe("completed");
		expect(await call("report", { body: "Completed nodes but not finished", can_complete: true })).toMatchObject({ isError: true, body: { code: "child-run-not-finished" } });
		const parentBeforeFinish = await detail(outer.id);
		const finished = await call("run", { action: "finish" });
		expect(finished.body.snapshot.status).toBe("completed");
		expect(await detail(outer.id)).toEqual(parentBeforeFinish);
		const resultPath = join(dock.root.workDir, "result.txt");
		writeFileSync(resultPath, "NESTED-NATIVE-829\n");
		const ready = await call("report", { body: "Finished handoff", can_complete: true, outputs: [{ id: "result", path: resultPath }] });
		expect(ready.body).toMatchObject({ saved: true, report: { runId: outer.id, nodeId: "call", executionId: execution.id,
			from: { sessionId: nativeId }, to: { sessionId: "outer-manager" }, canComplete: true, outputs: [{ id: "result", path: resultPath }] } });
		expect((await detail(outer.id)).run.nodes.call.status).toBe("running");
		await call("report", { body: "Latest report withdraws readiness", can_complete: false });
		expect(await parentAction(409)).toMatchObject({ code: "report-not-completable" });
		await call("report", { body: "Latest report restores readiness", can_complete: true, outputs: [{ id: "result", path: resultPath }] });
		const afterFinishStatus = await call("run", { action: "status" });
		expect(afterFinishStatus.body.snapshot).toMatchObject({ id: childId, status: "completed" });
		const closedCalls = () => readFileSync(join(backend.root.path, "calls.jsonl"), "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line)).filter(row => row.kind === "tab_close");
		expect(closedCalls()).toEqual([]);
		await parentAction(200);
		const accepted = await detail(outer.id);
		expect(accepted.run.nodes.call.status).toBe("completed");
		expect(accepted.run.nodes.consumer.status).toBe("pending");
		// Complete commits before its owned close process finishes. Use the existing
		// backend mechanism budget to observe publication, not a model/business retry.
		const closeDeadline = Date.now() + 10_000;
		while (closedCalls().length === 0 && Date.now() < closeDeadline) await Bun.sleep(10);
		expect(closedCalls().map(row => row.argv)).toEqual([["tab", "close", execution.chat.tabId]]);
		expect(await parentAction(200)).toMatchObject({ changed: false });
		// The external backend/CLI uses a different process clock; fake Bun time
		// cannot observe a forbidden duplicate close during this finite window.
		await Bun.sleep(150);
		expect(closedCalls().map(row => row.argv)).toEqual([["tab", "close", execution.chat.tabId]]);
		expect(readFileSync(resultPath, "utf8")).toBe("NESTED-NATIVE-829\n");
		} finally { await dock.close(); }
	} finally {
		try {
			const evidence = process.env.WORKFLOW_PROMPT_EVIDENCE_DIR;
			if (evidence) {
				mkdirSync(evidence, { recursive: true });
				writeFileSync(join(evidence, `nested-native-${host}-${chiefDelegated ? "chief" : "ordinary"}.json`), JSON.stringify({ scope: "Native tools and real backend; controlled provider/Herdr, not model or real Tab acceptance", observations,
					backendCalls: existsSync(join(backend.root.path, "calls.jsonl")) ? readFileSync(join(backend.root.path, "calls.jsonl"), "utf8") : null }, null, 2));
			}
		} finally { await backend.close(); }
	}
}, 300_000);
