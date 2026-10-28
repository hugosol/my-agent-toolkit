import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { workflowBackend } from "./backend";
import { type ManagerDock, managerDock } from "./manager-dock";
import { collectTransport } from "./collect-transport";

/** Preparatory public backend calls deliberately do not depend on the future dispatch tool. */
export async function managerScenario(budgets: { requestTimeoutMs?: number; collectTimeoutMs?: number } = {}, collectWaitSeconds = 1, selectEndpoint?: (backendEndpoint: string) => string) {
	const backend = await workflowBackend(collectWaitSeconds);
	const transport = await collectTransport(backend.endpoint);
	const calls = transport.calls;
	let dock: ManagerDock | undefined;
	try {
		dock = await managerDock(selectEndpoint ? selectEndpoint(backend.endpoint) : transport.endpoint, budgets);
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
		return { backend, dock, transport, calls, managerId, runId: started.id,
			async dispatch(nodeId: string) {
				backend.behavior(`node-native-${nodeId}`, backend.root.path);
				return backend.post("/api/workflow/manager/dispatch", { sessionId: managerId, nodes: [nodeId] });
			},
			async detail() { return fetch(`${backend.endpoint}/api/workflow/runs/${started.id}`).then(response => response.json()); },
			async close() { try { await dock!.close(); } finally { await transport.close(); await backend.close(); } },
		};
	} catch (error) { await dock?.close(); await transport.close(); await backend.close(); throw error; }
}
