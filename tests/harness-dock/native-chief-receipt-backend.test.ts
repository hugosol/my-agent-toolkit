import { expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { workflowBackend } from "../workflow-chat/support/backend";
import { chiefDock, type ChiefDock } from "../workflow-chat/support/chief-dock";

// S2/S3 development regression: actual native Session/input and actual paired
// backend/storage. Only Herdr CLI and provider are controlled. Not GPT-6-luna
// role quality, cross-host revocation, restart, or full recovery acceptance (19/20).
for (const host of ["omp", "pi"] as const) test(`${host} actual receive pipeline persists receipt before presenting and manual view retains original`, async () => {
	const backend = await workflowBackend();
	let dock: ChiefDock | undefined;
	async function get(path: string) {
		const response = await fetch(`${backend.endpoint}${path}`);
		if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
		return response.json();
	}
	async function terminal(id: string) {
		// The owned asynchronous Herdr fixture uses real processes. A bounded wait
		// for its creation terminal state cannot use the test process's fake time.
		const deadline = Date.now() + 15_000;
		while (Date.now() < deadline) {
			const state = await get(`/api/chats/${id}`);
			if (state.stage === "failed") throw new Error(`Owned fixture startup failed: ${JSON.stringify(state)}`);
			if (state.stage === "succeeded") return;
			await Bun.sleep(20);
		}
		throw new Error("Owned fixture creation did not settle");
	}
	try {
		dock = await chiefDock(host, backend.endpoint);
		await dock.input("Initialize this controlled native chief Session; do not delegate business.");
		const state = await dock.state();
		const data = state.data;
		if (!data || typeof data !== "object" || !("sessionId" in data) || typeof data.sessionId !== "string" || !("sessionFile" in data) || typeof data.sessionFile !== "string") throw new Error("Native identity/history unavailable");
		const chiefId = data.sessionId;
		const chiefFile = data.sessionFile;
		// OMP prefixes its public journal with a title record; Pi starts with session.
		const records: unknown[] = (await dock.history()).trim().split(/\r?\n/).map(line => JSON.parse(line));
		const header = records.find(value => value && typeof value === "object" && "type" in value && value.type === "session");
		if (!header || typeof header !== "object" || !("cwd" in header) || typeof header.cwd !== "string") throw new Error("Native cwd unavailable");
		const cwd = header.cwd;
		await backend.post("/api/zones", { id: "recovery/native", path: cwd });
		const tasks = await backend.post("/api/tasks", { name: "recovery-chief", taskType: "chief", agent: host, chatName: "chief {chat.id}", model: "default", prompt: "Controlled native chief" });
		const chief = tasks.tasks.find((task: { name: string }) => task.name === "recovery-chief");
		writeFileSync(join(backend.root.path, "behavior.json"), JSON.stringify({ native_session: { source: `herdr:${host}`, agent: host, kind: "path", value: chiefFile }, native_cwd: cwd }));
		const preview = await backend.post("/api/chats/preview", { zone: "recovery/native", taskId: chief.id });
		const created = await backend.post("/api/chats", { zone: "recovery/native", taskId: chief.id, chatId: preview.chatId });
		await terminal(created.id);
		await backend.post("/api/sessions/events", { sessionId: chiefId, kind: "register", data: { cwd, agentType: host, sessionFile: chiefFile } });
		const actualChief = JSON.parse(readFileSync(join(backend.root.path, "started.jsonl"), "utf8").trim().split(/\r?\n/)[0]!);
		const workerId = `original-delegated-sender-${host}-18`;
		const workerFile = join(backend.root.path, "worker.jsonl");
		writeFileSync(workerFile, JSON.stringify({ type: "session", version: 3, id: workerId, timestamp: "2026-11-12T00:00:00.000Z", cwd }) + "\n");
		const workers = await backend.post("/api/tasks", { name: "recovery-worker", taskType: "normal", agent: host, chatName: "worker {chat.id}", model: "default", prompt: "Controlled worker" });
		const worker = workers.tasks.find((task: { name: string }) => task.name === "recovery-worker");
		writeFileSync(join(backend.root.path, "bots/worker.json"), JSON.stringify({ id: "recovery-bot", name: "Recovery worker", when: "Create an invoice capability", plan_guide: "", node_guide: "", task_id: worker.id }));
		writeFileSync(join(backend.root.path, "behavior.json"), JSON.stringify({ native_session: { source: `herdr:${host}`, agent: host, kind: "path", value: workerFile }, native_cwd: cwd }));
		const delegation = await backend.post("/api/chief/delegations/preview", { sessionId: chiefId, botId: "recovery-bot", zoneId: "recovery/native", input: "Create the reusable capability; do not execute invoices", materials: [] });
		const launched = await backend.post("/api/chief/delegations", { sessionId: chiefId, previewId: delegation.previewId });
		await terminal(launched.id);
		actualChief.agent = host;
		actualChief.agent_session = { source: `herdr:${host}`, agent: host, kind: "path", value: chiefFile };
		writeFileSync(join(backend.root.path, "behavior.json"), JSON.stringify({ agents: [actualChief] }));
		const body = { background: "Reusable capability requested", execution: "Create Task Bot", result: "blocked", summary: "Draft saved; publication permission missing", deliverables: ["draft.md"], pendingDecisions: ["Approve publication?"] };
		const saved = await backend.post("/api/chief/reports", { sessionId: workerId, body });
		expect(saved.notification.status).toBe("submitted");
		expect(await get(`/api/chief/reports/${saved.report.id}/receipt`)).toEqual({ received: false, receipt: null });
		const text = JSON.parse(readFileSync(join(backend.root.path, "submitted.jsonl"), "utf8").trim().split(/\r?\n/).pop()!).text;
		expect(text).toContain(saved.report.id);
		const before = dock.capture.requests().length;
		await dock.input(text);
		const reliable = await get(`/api/chief/reports/${saved.report.id}/receipt`);
		const reliableEvidence: unknown = JSON.parse(JSON.stringify(reliable));
		expect(reliable).toMatchObject({ received: true, receipt: { reportId: saved.report.id, sessionId: chiefId, claimId: expect.any(String), at: expect.any(Number) } });
		expect(dock.capture.requests()).toHaveLength(before + 1);
		await dock.input(text);
		expect(dock.capture.requests()).toHaveLength(before + 1);
		const view = await dock.call({ id: saved.report.id }, "chief_read_report");
		expect(view).toMatchObject({ isError: false, details: { body: { received: true, process: false, report: saved.report } } });
		console.log(JSON.stringify({ host, scope: "Actual native receive and paired persistent backend; controlled provider/Herdr CLI", saved, reliable: reliableEvidence, view }));
	} catch (error) { console.error(`${host} persistent receipt failure before cleanup`, error); throw error; }
	finally { try { await dock?.close(); } finally { await backend.close(); } }
}, 180_000);
