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
