import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { workflowBackend } from "./backend";
import { type ManagerDock, managerDock } from "./manager-dock";

/** Preparatory public backend calls deliberately do not depend on the future dispatch tool. */
export async function managerScenario(budgets: { requestTimeoutMs?: number; collectTimeoutMs?: number } = {}) {
	const backend = await workflowBackend();
	const calls: { path: string; body: Record<string, unknown> }[] = [];
	const proxy = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
		const path = new URL(request.url).pathname;
		const body = await request.json() as Record<string, unknown>;
		calls.push({ path, body });
		const response = await fetch(`${backend.endpoint}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
		return new Response(await response.text(), { status: response.status, headers: { "content-type": "application/json" } });
	} });
	let dock: ManagerDock | undefined;
	try {
		dock = await managerDock(`http://127.0.0.1:${proxy.port}`, budgets);
		const managerId = await dock.nativeId();
		await backend.post("/api/zones", { path: backend.root.path });
		const tasks: Record<string, string> = {};
		for (const role of ["manager", "node"]) {
			const result = await backend.post("/api/tasks", { name: `state-${role}`, taskType: role, agent: "omp", chatName: "{chat.id}", model: "gpt-6.1-sol", thinking: "high", skill: "teach", prompt: `FIXED-${role}`, extensions: [] });
			tasks[role] = result.tasks.find((task: { name: string }) => task.name === `state-${role}`).id;
		}
		writeFileSync(join(backend.root.path, "bots/worker.json"), JSON.stringify({ id: "worker", name: "worker", when: "", plan_guide: "", node_guide: "", task_id: tasks.node }));
		writeFileSync(join(backend.root.path, "maps/fan-in.json"), JSON.stringify({ title: "A B into C", description: "independent small graph", nodes: {
			A: { title: "A", bot_id: "worker", input: "alpha", zone: backend.root.path, blocked_by: [] },
			B: { title: "B", bot_id: "worker", input: "beta", zone: backend.root.path, blocked_by: [] },
			C: { title: "C", bot_id: "worker", input: "combine", zone: backend.root.path, blocked_by: ["A", "B"] },
		} }));
		backend.behavior(managerId, backend.root.path);
		const started = await backend.post("/api/scheduler/maps/fan-in.json/runs", { managerTaskId: tasks.manager, zone: backend.root.path, userInput: "Independent A B C handoff acceptance" });
		return { backend, dock, calls, managerId, runId: started.id,
			async dispatch(nodeId: string) {
				backend.behavior(`node-native-${nodeId}`, backend.root.path);
				return backend.post("/api/workflow/manager/dispatch", { sessionId: managerId, nodes: [nodeId] });
			},
			async detail() { return fetch(`${backend.endpoint}/api/workflow/runs/${started.id}`).then(response => response.json()); },
			async close() { try { await dock!.close(); } finally { proxy.stop(true); await backend.close(); } },
		};
	} catch (error) { await dock?.close(); proxy.stop(true); await backend.close(); throw error; }
}
