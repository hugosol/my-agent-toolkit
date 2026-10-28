import { expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { customMessages } from "./session-log";
import { workflowBackend } from "../workflow-chat/support/backend";
import { collectTransport } from "../workflow-chat/support/collect-transport";
import { promptDock } from "../workflow-chat/support/prompt-dock";

// S1/P1/P2/P6. Independent source: backend attribution/authorization contract.
// Plausible violation: send main:<id>, display name or cwd; hide backend refusals;
// load both roles or silently require connect-bot. Keep real OMP loader, role, Session,
// HTTP and backend routes/storage; only model selection and external Herdr CLI are controlled.
test("P1/P2/P6 independent automatic roles use native identity and preserve real backend association decisions", async () => {
	const backend = await workflowBackend();
	const cleanup: (() => Promise<void>)[] = [() => backend.close()];
	try {
	const transport = await collectTransport(backend.endpoint);
	cleanup.unshift(() => transport.close());
	const config = `endpoint: ${transport.endpoint}\nrequestTimeoutMs: 3000\ncollectTimeoutMs: 6000\n`;
	const manager = await promptDock("manager", { config, observeIdentity: true });
	cleanup.unshift(() => manager.close());
	const node = await promptDock("node", { config, observeIdentity: true });
	cleanup.unshift(() => node.close());
	const identity = async (dock: typeof manager) => {
		const state = await dock.session.request({ type: "get_state" });
		const data = state.data as { sessionId: string };
		expect(typeof data.sessionId).toBe("string");
		return data.sessionId;
	};
	const call = async (dock: typeof manager, name: string, params: unknown) => {
		dock.select(name, params);
		expect((await dock.session.prompt("Execute exactly the selected role tool once; no retries.")).status).toBe("completed");
		const frames = dock.session.frames().filter(frame => frame.type === "tool_execution_end");
		const frame = frames[frames.length - 1]!;
		const result = frame.result as { content: { text: string }[]; isError: boolean; details: { httpStatus: number; body: unknown } };
		return { ...result, body: JSON.parse(result.content[0]!.text) };
	};
		const managerId = await identity(manager);
		const nodeId = await identity(node);
		expect(managerId).not.toBe(nodeId);
		const observedOwners: string[] = [];
		for (const [dock, name, id] of [[manager, "display-manager-not-an-id", managerId], [node, "display-node-not-an-id", nodeId]] as const) {
			await dock.session.request({ type: "set_session_name", name });
			const facts = dock.session.stderr().split("\n").filter(line => line.startsWith("[workflow-identity] ")).map((line): unknown => JSON.parse(line.slice("[workflow-identity] ".length)));
			const reading = facts.reverse().find(fact => fact && typeof fact === "object" && "sessionId" in fact && fact.sessionId === id && "name" in fact && fact.name === name);
			expect(reading).toMatchObject({ sessionId: id, name, owner: { kind: "owner" } });
			if (!reading || typeof reading !== "object" || !("owner" in reading) || !reading.owner || typeof reading.owner !== "object" || !("key" in reading.owner) || typeof reading.owner.key !== "string") throw new Error("No actual framework Owner key");
			observedOwners.push(reading.owner.key);
			expect(id).not.toBe(name);
			expect(id).not.toBe(dock.root.workDir);
			expect(id).not.toBe(reading.owner.key);
		}
		const unassociatedManager = await call(manager, "run", { action: "status" });
		const unassociatedNode = await call(node, "report", { body: "not associated yet" });
		expect(unassociatedManager).toMatchObject({ isError: true, details: { httpStatus: 403 }, body: { code: "manager-unassociated", message: "当前原生身份没有唯一的管理者归属。" } });
		expect(unassociatedNode).toMatchObject({ isError: true, details: { httpStatus: 403 }, body: { code: "node-unassociated", message: "当前原生身份没有唯一的当前节点执行归属。" } });
		for (const [dock, role, owned, absent] of [[manager, "manager", ["run", "collect"], ["report"]], [node, "node", ["report"], ["run", "collect"]]] as const) {
			const request = dock.capture.requests()[0]!.json as { tools: { function: { name: string; parameters: unknown } }[] };
			const names = request.tools.map(tool => tool.function.name);
			for (const name of owned) expect(names).toContain(name);
			for (const name of absent) expect(names).not.toContain(name);
			const ownSchemas = request.tools.filter(tool => owned.includes(tool.function.name as never)).map(tool => JSON.stringify(tool.function.parameters)).join("");
			for (const forbidden of ["sessionId", "runId", "executionId", "recipient", "target"]) expect(ownSchemas).not.toContain(`\"${forbidden}\"`);
			expect(customMessages(dock.session.sessionLog().entries, `${role}-chat:tools`)).toHaveLength(1);
			expect(customMessages(dock.session.sessionLog().entries, `${role === "manager" ? "node" : "manager"}-chat:tools`)).toHaveLength(0);
		}
		for (const directory of [backend.root.path, node.root.workDir]) await backend.post("/api/zones", { path: directory });
		const tasks: Record<string, string> = {};
		for (const role of ["manager", "node"]) {
			const result = await backend.post("/api/tasks", { name: `identity-${role}`, taskType: role, agent: "omp", chatName: "{chat.id}", model: "default", thinking: "default", skill: null, prompt: `FIXED-${role}`, extensions: [] });
			tasks[role] = result.tasks.find((task: { name: string }) => task.name === `identity-${role}`).id;
		}
		writeFileSync(join(backend.root.path, "bots/identity-worker.json"), JSON.stringify({ id: "identity-worker", name: "worker", when: "", plan_guide: "", node_guide: "", task_id: tasks.node }));
		writeFileSync(join(backend.root.path, "maps/identity.json"), JSON.stringify({ title: "Native role identity", description: "independent backend acceptance", nodes: {
			A: { title: "A", bot_id: "identity-worker", input: "alpha", zone: node.root.workDir, blocked_by: [] },
			B: { title: "B", bot_id: "identity-worker", input: "beta", zone: node.root.workDir, blocked_by: [] },
		} }));
		backend.behavior(managerId, backend.root.path);
		const started = await backend.post("/api/scheduler/maps/identity.json/runs", { managerTaskId: tasks.manager, zone: backend.root.path, userInput: "Native identity acceptance" });
		const status = await call(manager, "run", { action: "status" });
		expect(status.details.httpStatus).toBe(200);
		expect(status.body.snapshot.id).toBe(started.id);
		backend.behavior(nodeId, node.root.workDir);
		const dispatch = await call(manager, "run", { action: "dispatch", nodes: ["A"] });
		expect(dispatch.body.results[0].status).toBe("running");
		backend.behavior(nodeId, node.root.workDir, true);
		const report = await call(node, "report", { body: "E:/acceptance/native-alpha.txt; UTF-8; independent handoff" });
		expect(report.body).toMatchObject({ saved: true, report: { runId: started.id, nodeId: "A", source: { sessionId: nodeId }, target: { sessionId: managerId } } });
		const collected = await call(manager, "collect", {});
		expect(collected.body).toMatchObject({ reason: "notification", pendingReports: { A: report.body.report.id } });
		// Healthy dispatch refuses duplicate native IDs. Seed ambiguity ONLY in this
		// isolated backend's persisted file, then keep its real resolver in the path.
		// This is corrupt-state handling evidence, not a claim healthy dispatch creates it.
		const runPath = join(backend.root.path, "runs", started.id, "run.json");
		const originalRun = readFileSync(runPath, "utf8");
		const duplicateNode = JSON.parse(originalRun);
		duplicateNode.nodes.B = structuredClone(duplicateNode.nodes.A);
		duplicateNode.nodes.B.execution.id = "independent-ambiguous-execution";
		writeFileSync(runPath, JSON.stringify(duplicateNode));
		const nodeAmbiguous = await call(node, "report", { body: "ambiguous identity must not be guessed" });
		expect(nodeAmbiguous).toMatchObject({ isError: true, details: { httpStatus: 403 }, body: { code: "node-ambiguous", message: "原生身份关联不唯一。" } });
		writeFileSync(runPath, originalRun);
		// Real cross-role associations, not a counterfeit model-supplied identity:
		// create another manager Run with the native identity of the node-only Session.
		backend.behavior(nodeId, node.root.workDir);
		const conflicting = await backend.post("/api/scheduler/maps/identity.json/runs", { managerTaskId: tasks.manager, zone: backend.root.path, userInput: "Conflicting role association" });
		const crossRole = await call(node, "report", { body: "must not overwrite manager attribution" });
		expect(crossRole).toMatchObject({ isError: true, details: { httpStatus: 403 }, body: { code: "node-role-invalid", message: "管理者身份不能提交节点报告。" } });
		const secondPath = join(backend.root.path, "runs", conflicting.id, "run.json");
		const second = JSON.parse(readFileSync(secondPath, "utf8"));
		second.manager.sessionId = managerId;
		writeFileSync(secondPath, JSON.stringify(second));
		const ambiguous = await call(manager, "run", { action: "status" });
		expect(ambiguous).toMatchObject({ isError: true, details: { httpStatus: 403 }, body: { code: "manager-ambiguous", message: "原生身份关联不唯一。" } });
		for (const request of transport.calls) {
			const id = request.path.includes("/manager/") ? managerId : nodeId;
			expect(request.body.sessionId).toBe(id);
			expect(Object.keys(request.body).sort()).toEqual(request.path.endsWith("/report") ? ["body", "sessionId"] : request.path.endsWith("/dispatch") ? ["nodes", "sessionId"] : ["sessionId"]);
		}
		// P2 constrains external connections: observe ALL role HTTP paths, including any
		// accidental connect-bot registration, heartbeat, or websocket upgrade attempt.
		expect(transport.calls.map(call => call.path)).toEqual([
			"/api/workflow/manager/status", "/api/workflow/node/report", "/api/workflow/manager/status", "/api/workflow/manager/dispatch",
			"/api/workflow/node/report", "/api/workflow/manager/collect", "/api/workflow/node/report", "/api/workflow/node/report", "/api/workflow/manager/status",
		]);
		// One explicitly test-owned SSE reader checks the actual panel registry.
		// Neither role registered a connect-bot reporting Session as a side effect.
		const observationAbort = new AbortController();
		try {
			const observation = await fetch(`${backend.endpoint}/api/sessions/events`, { signal: observationAbort.signal });
			expect(observation.status).toBe(200);
			const reader = observation.body!.getReader();
			const decoder = new TextDecoder(); let text = "";
			try {
				while (!text.includes("\n\n") && !text.includes("\r\n\r\n")) {
					const chunk = await reader.read();
					if (chunk.done) throw new Error("No backend panel snapshot");
					text += decoder.decode(chunk.value, { stream: true });
				}
				const data = text.split(/\r?\n/).find(line => line.startsWith("data:"));
				if (!data) throw new Error(`No SSE snapshot data: ${text}`);
				expect(JSON.parse(data.slice(5))).toMatchObject({ sessions: [] });
			} finally { await reader.cancel(); }
		} finally { observationAbort.abort(); }
		console.log(JSON.stringify({ promises: ["P1", "P2", "P6"], native: { manager: managerId, node: nodeId }, ownerKeys: observedOwners, cwd: [manager.root.workDir, node.root.workDir], runId: started.id, report: report.body.report, refusals: [unassociatedManager.body, unassociatedNode.body, nodeAmbiguous.body, crossRole.body, ambiguous.body], requests: transport.calls }));
	} finally { for (const close of cleanup) await close(); }
}, 300_000);
