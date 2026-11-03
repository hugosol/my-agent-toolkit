import { expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { workflowBackend } from "../workflow-chat/support/backend";
import { roleContractDock, type RoleContractDock } from "../workflow-chat/support/role-contract-dock";

// Approved S1 seams: real OMP/Pi loader + public Session + delivered report tool + backend HTTP/storage.
// P7/P8/P26 independent oracle: malformed/legacy calls append nothing; strict false/true persist
// with the native Session's execution, including omitted outputs. A host that coerces a string,
// removes an unknown field, or drops a missing boolean before validation must fail these assertions.
// Scripted tool calls exercise parameter preservation, NOT real-model responsibility (S2 runner owns that).
for (const host of ["omp", "pi"] as const) test(`${host}: P7/P8/P26 report rejects malformed and legacy calls without persistence and preserves native identity`, async () => {
	const backend = await workflowBackend();
	let dock: RoleContractDock | undefined;
	const observations: unknown[] = [];
	try {
		dock = await roleContractDock(host, backend.endpoint);
		const state = await dock.state();
		const nativeId = (state.data as { sessionId?: string } | undefined)?.sessionId;
		if (!nativeId) throw new Error(`No native ${host} Session identity`);
		await backend.post("/api/zones", { id: "test/manager", path: backend.root.path });
		await backend.post("/api/zones", { id: "test/node", path: dock.root.workDir });
		const tasks: Record<string, string> = {};
		for (const role of ["manager", "node"]) {
			const created = await backend.post("/api/tasks", { name: role, taskType: role === "manager" ? "manager" : "normal",
				agent: role === "manager" ? "omp" : host, chatName: "{chat.id}", model: "gpt-6.1-sol", thinking: "high", skill: "teach", prompt: "Contract dock", extensions: [] });
			tasks[role] = created.tasks.find((task: { name: string }) => task.name === role).id;
		}
		writeFileSync(join(backend.root.path, "bots/worker.json"), JSON.stringify({ id: "worker", name: "worker", when: "", plan_guide: "", node_guide: "", task_id: tasks.node }));
		writeFileSync(join(backend.root.path, "maps/contract.json"), JSON.stringify({ title: "Report contract", description: "", nodes: {
			A: { title: "A", bot_id: "worker", input: "Contract", zone: "test/node", blocked_by: [], output_rule: [{ id: "handoff" }] },
		} }));
		// External Herdr is controlled in S1; only the node's Session comes from the real host.
		const manager = "contract-dock-manager";
		backend.behavior(manager, backend.root.path);
		const started = await backend.post("/api/scheduler/maps/contract.json/runs", { managerTaskId: tasks.manager, zone: "test/manager", userInput: "Contract dock" });
		writeFileSync(join(backend.root.path, "behavior.json"), JSON.stringify({ native_session: { source: `herdr:${host}`, agent: host, kind: "id", value: nativeId }, native_cwd: dock.root.workDir }));
		const dispatched = await backend.post("/api/workflow/manager/dispatch", { sessionId: manager, nodes: ["A"] });
		const execution = dispatched.snapshot.nodes.A.execution;
		expect(execution.chat.sessionId).toBe(nativeId);
		const detail = () => fetch(`${backend.endpoint}/api/workflow/runs/${started.id}`).then(response => response.json());
		for (const params of [
			{ body: "missing declaration" },
			{ body: "string declaration", can_complete: "true" },
			{ body: "numeric declaration", can_complete: 1 },
			{ body: "legacy new request", canComplete: true },
			{ body: "legacy extra field", can_complete: true, type: "report" },
			{ body: "invalid outputs", can_complete: true, outputs: { handoff: 17 } },
			{ body: "duplicate outputs", can_complete: true, outputs: [{ id: "handoff", path: "E:/a.txt" }, { id: "handoff", path: "E:/b.txt" }] },
			{ body: "forged author", can_complete: true, from: { sessionId: "forged" } },
			{ body: "forged destination", can_complete: true, to: { sessionId: "forged" } },
		]) {
			await dock.report(params);
			const actual = await detail();
			observations.push({ params, actual });
			expect(actual.reports).toEqual([]);
			expect(actual.run.nodes.A.status).toBe("running");
		}
		const handoff = join(dock.root.workDir, "independent-handoff.txt");
		await dock.report({ body: "Partial effect; input still missing", can_complete: false, outputs: [{ id: "handoff", path: handoff }] });
		const blocked = await detail();
		expect(blocked.reports).toHaveLength(1);
		expect(blocked.reports[0]).toMatchObject({ from: { sessionId: nativeId }, runId: started.id, nodeId: "A", executionId: execution.id, canComplete: false, body: "Partial effect; input still missing", outputs: [{ id: "handoff", path: handoff }] });
		await dock.report({ body: "Ready; harmless cleanup remains", can_complete: true });
		const ready = await detail();
		expect(ready.reports).toHaveLength(2);
		expect(ready.reports[1]).toMatchObject({ from: { sessionId: nativeId }, runId: started.id, nodeId: "A", executionId: execution.id, canComplete: true, body: "Ready; harmless cleanup remains" });
		expect(ready.run.nodes.A.status).toBe("running");
		const requests = dock.capture.requests().map(request => request.json);
		expect(JSON.stringify(requests[0])).toContain('"name":"report"');
		expect(JSON.stringify(requests)).toContain('saved');
		observations.push({ nativeId, execution, blocked, ready, requests });
	} finally {
		const evidence = process.env.WORKFLOW_PROMPT_EVIDENCE_DIR;
		if (evidence) {
			mkdirSync(evidence, { recursive: true });
			writeFileSync(join(evidence, `report-contract-${host}.json`), JSON.stringify({ scope: "S1 real native host and backend; controlled provider and external Herdr; not S2 model obedience", observations,
				requests: dock?.capture.requests(), backendCalls: existsSync(join(backend.root.path, "calls.jsonl")) ? readFileSync(join(backend.root.path, "calls.jsonl"), "utf8") : null }, null, 2));
		}
		try { await dock?.close(); } finally { await backend.close(); }
	}
}, 300_000);
