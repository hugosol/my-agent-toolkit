import { expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { workflowBackend } from "../workflow-chat/support/backend";
import { chiefDock, type ChiefDock } from "../workflow-chat/support/chief-dock";

// Approved S3 development seam, not P7/P8 cross-repository acceptance.
// Source: ticket 06 requires a real native role independent of Suite and existing
// definition query results. Violation: an unloaded role, empty/fake lookup, or
// Suite-only assembly. Real loader, shared implementation, HTTP and backend stay
// in path; a controlled provider selects protocol calls only (no model claims).
for (const host of ["omp", "pi"] as const) {
	test(`${host} chief loads without Suite and returns existing Bot.when definitions`, async () => {
	const backend = await workflowBackend();
	let dock: ChiefDock | undefined;
	try {
		const created = await backend.post("/api/tasks", { name: "chief-lookup-task", taskType: "normal", agent: "omp", chatName: "{chat.id}", model: "default", thinking: "default", skill: null, prompt: "Independent definition lookup fixture" });
		const task = created.tasks.find((item: { name: string }) => item.name === "chief-lookup-task");
		writeFileSync(join(backend.root.path, "bots", "chief-lookup.json"), JSON.stringify({ id: "chief-lookup", name: "Lookup evidence", when: "Use for independent chief lookup evidence", plan_guide: "", node_guide: "", task_id: task.id }));
		dock = await chiefDock(host, backend.endpoint);
		const result = await dock.call({ kind: "bots" });
		expect(result.isError).toBe(false);
		expect(result.details.httpStatus).toBe(200);
		expect(result.content[0]!.text).toContain("Use for independent chief lookup evidence");
		expect(result.content[0]!.text).toContain(task.id);
		const request = dock.capture.requests()[0]!.json as { tools: { function: { name: string } }[] };
		const names = request.tools.map(tool => tool.function.name);
		expect(names).toContain("chief_definitions");
		for (const absent of ["run", "collect", "report", "chief_dispatch", "chief_report"]) expect(names).not.toContain(absent);
		// Injection/history proves native consumption only, never responsibility adherence.
		expect(await dock.history()).toContain("chief-chat:tools");
		// Ticket 11, approved S3 consumer: the injected routing contract must
		// distinguish an ambiguous request from an executable match. A sole
		// candidate must not silently supply unknown inputs or the chief's zone.
		// This checks delivered guidance, not real-model responsibility (12/13).
		const messages = JSON.stringify(dock.capture.requests()[0]!.json);
		expect(messages).toContain("即使只有一个候选");
		expect(messages).toContain("未知输入先澄清");
		// AC2 oracle: a single-executor gap needs complete Task creation,
		// a multi-step gap complete Map creation. Violation: generic creation
		// guidance reaches the model but never distinguishes the two routes.
		expect(messages).toContain("单执行者能力缺口选择完整创建 Task 能力 Bot");
		expect(messages).toContain("多步骤流程缺口选择完整创建 Map 能力 Bot");
		// AC3: explicit abandonment must stop this request, not be treated as
		// a veto that permits an alternative. Observe the delivered distinction.
		expect(messages).toContain("仅否决复用");
		expect(messages).toContain("明确要求创建 Task");
		expect(messages).toContain("明确要求创建 Map");
		expect(messages).toContain("明确放弃时停止本次需求");
		// AC4: a creation request must not grant later-stage or business
		// execution authority. Violation: guidance asks the creator to also
		// execute the original work, or searches for a next plan on return.
		expect(messages).toContain("不夹带创建后执行原始业务的指令");
		expect(messages).toContain("创建流程既有的每阶段审批继续生效");
		expect(messages).toContain("不自动检索后续方案");
		expect(messages).toContain("不发起下一次执行确认");
	} finally { try { await dock?.close(); } finally { await backend.close(); } }
	}, 180_000);

	// Source: real Bot targets require Task/Map definitions and explicit registered
	// zones. Violation: returning only summaries or substituting the chief's cwd.
	test(`${host} chief reads real target definitions and registered zones`, async () => {
		const backend = await workflowBackend();
		let dock: ChiefDock | undefined;
		try {
			const created = await backend.post("/api/tasks", { name: "chief-target", taskType: "normal", agent: "omp", chatName: "{chat.id}", model: "default", thinking: "default", skill: null, prompt: "TARGET-DEFINITION-BUSINESS-GUIDANCE" });
			const task = created.tasks.find((item: { name: string }) => item.name === "chief-target");
			writeFileSync(join(backend.root.path, "maps", "chief flow.json"), JSON.stringify({ title: "CHIEF-MAP-TARGET", description: "Independent map", input_requirements: "Named source required", nodes: {} }));
			await backend.post("/api/zones", { id: "chief/explicit-worker", path: backend.root.workDir });
			dock = await chiefDock(host, backend.endpoint);
			const detail = await dock.call({ kind: "tasks", id: task.id });
			expect(detail).toMatchObject({ isError: false, details: { httpStatus: 200, body: { task: { id: task.id, prompt: "TARGET-DEFINITION-BUSINESS-GUIDANCE" } } } });
			const tasks = await dock.call({ kind: "tasks" });
			expect(tasks.content[0]!.text).toContain("chief-target");
			const map = await dock.call({ kind: "maps", id: "chief flow.json" });
			expect(map).toMatchObject({ isError: false, details: { httpStatus: 200, body: { title: "CHIEF-MAP-TARGET", input_requirements: "Named source required" } } });
			const maps = await dock.call({ kind: "maps" });
			expect(maps.content[0]!.text).toContain("chief flow.json");
			const zones = await dock.call({ kind: "zones" });
			expect(zones.content[0]!.text).toContain("chief/explicit-worker");
			expect(zones.content[0]!.text).toContain(backend.root.workDir.replace(/\\/g, "\\\\"));
		} finally { try { await dock?.close(); } finally { await backend.close(); } }
	}, 180_000);

	// Existing common error semantics already satisfy this criterion: a missing
	// target is a real backend refusal, not a fabricated empty successful match.
	test(`${host} chief preserves missing-definition errors and rejects caller identities`, async () => {
		const backend = await workflowBackend();
		let dock: ChiefDock | undefined;
		try {
			dock = await chiefDock(host, backend.endpoint);
			const missing = await dock.call({ kind: "tasks", id: "absent-chief-target" });
			expect(missing).toMatchObject({ isError: true, details: { httpStatus: 404, body: { code: "task-not-found" } } });
			const invalid = await dock.call({ kind: "bots", sessionId: "forged-chief" });
			expect(invalid).toMatchObject({ isError: true, details: { body: { code: "invalid-parameters" } } });
			const invalidId = await dock.call({ kind: "zones", id: "not-a-zone-filter" });
			expect(invalidId).toMatchObject({ isError: true, details: { body: { code: "invalid-parameters" } } });
		} finally { try { await dock?.close(); } finally { await backend.close(); } }
	}, 180_000);
}
