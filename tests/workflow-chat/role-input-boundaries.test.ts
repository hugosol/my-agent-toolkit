import { expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { workflowBackend } from "./support/backend";
import { promptDock, providerMessages, roleGuidance } from "./support/prompt-dock";

// Approved S1 / P27. Source: unchanged backend Task.prompt + per-run input composition.
// Violation: extension repeats/replaces fixed instructions or copies Bot/Map/user_input
// into a role guide. Observe actual backend CLI submissions and actual OMP provider input.
// Herdr delivery is controlled: relay the exact captured submission into real OMP,
// rather than claiming this proves real Herdr launched it or a real model used the input.
test("P27 actual role input preserves backend fixed/work sections and adds only separate tool guidance", async () => {
	const backend = await workflowBackend();
	const manager = await promptDock("manager");
	const node = await promptDock("node");
	try {
		const managerState = await manager.session.request({ type: "get_state" });
		const nodeState = await node.session.request({ type: "get_state" });
		if (!managerState.data || typeof managerState.data !== "object" || !("sessionId" in managerState.data) || typeof managerState.data.sessionId !== "string") throw new Error("Missing native manager identity");
		if (!nodeState.data || typeof nodeState.data !== "object" || !("sessionId" in nodeState.data) || typeof nodeState.data.sessionId !== "string") throw new Error("Missing native node identity");
		const managerId = managerState.data.sessionId;
		const nodeId = nodeState.data.sessionId;
		for (const directory of [backend.root.path, node.root.workDir]) await backend.post("/api/zones", { path: directory });
		const tasks: Record<string, string> = {};
		for (const role of ["manager", "node"]) {
			const result = await backend.post("/api/tasks", { name: `input-${role}`, taskType: role === "node" ? "normal" : "manager", agent: "omp", chatName: "{chat.id}", model: "default", thinking: "default", skill: null, prompt: `TASK-FIXED-${role}-27\n固定职能原文`, extensions: [] });
			tasks[role] = result.tasks.find((task: { name: string }) => task.name === `input-${role}`).id;
		}
		writeFileSync(join(backend.root.path, "bots/input-worker.json"), JSON.stringify({ id: "input-worker", name: "worker", when: "BOT-DOCUMENT-27", plan_guide: "BOT-PLAN-27", node_guide: "BOT-NODE-27", task_id: tasks.node }));
		writeFileSync(join(backend.root.path, "maps/input-map.json"), JSON.stringify({ title: "MAP-TITLE-27", description: "FULL-MAP-DOCUMENT-27", nodes: { A: { title: "A handoff", bot_id: "input-worker", input: "NODE-CURRENT-WORK-27\n保持工作内容", zone: node.root.workDir, blocked_by: [] } } }));
		backend.behavior(managerId, backend.root.path);
		await backend.post("/api/scheduler/maps/input-map.json/runs", { managerTaskId: tasks.manager, zone: backend.root.path, userInput: "RUN-USER-INPUT-27" });
		backend.behavior(nodeId, node.root.workDir);
		await backend.post("/api/workflow/manager/dispatch", { sessionId: managerId, nodes: ["A"] });
		const calls = readFileSync(join(backend.root.path, "calls.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line));
		const submissions = calls.filter(call => call.kind === "agent_prompt");
		expect(submissions).toHaveLength(2);
		for (const [index, dock, role] of [[0, manager, "manager"], [1, node, "node"]] as const) {
			const text = submissions[index].text as string;
			expect((await dock.session.prompt(text)).status).toBe("completed");
			const request = dock.capture.requests()[0]!;
			const messages = providerMessages(request);
			const guide = roleGuidance(request, role);
			// OMP adds its own system-reminder text block to the user message;
			// the backend submission itself must remain one exact, unmodified block.
			expect(messages.flatMap(message => message.parts).filter(part => part === text)).toHaveLength(1);
			expect(messages.find(message => message.parts.includes(text))?.parts).not.toContain(guide);
			expect(messages.filter(message => message.content === guide)).toHaveLength(1);
			expect(guide).not.toContain("TASK-FIXED-");
			expect(guide).not.toContain("CURRENT-WORK-27");
			expect(guide).not.toContain("RUN-USER-INPUT-27");
			for (const forbidden of ["BOT-DOCUMENT-27", "BOT-PLAN-27", "BOT-NODE-27", "FULL-MAP-DOCUMENT-27", "MAP-TITLE-27"]) expect(request.raw).not.toContain(forbidden);
			if (role === "node") expect(request.raw).not.toContain("RUN-USER-INPUT-27");
		}
	} finally { await node.close(); await manager.close(); await backend.close(); }
}, 300_000);
