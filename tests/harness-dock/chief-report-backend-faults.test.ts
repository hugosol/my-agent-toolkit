import { expect, test } from "bun:test";
import { createServer } from "node:http";
import type { Socket } from "node:net";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { workflowBackend } from "../workflow-chat/support/backend";
import { roleContractDock, type RoleContractDock } from "../workflow-chat/support/role-contract-dock";
import { chiefDock } from "../workflow-chat/support/chief-dock";

// S2/S3: installed native tools, actual backend/storage, controlled external
// Herdr and provider. P22 oracle: storage failure has no report/notification;
// definite notification failure preserves the saved fact; losing the response
// AFTER backend commit cannot prove absence or rollback. No internal mock is used.
const body = { background: "Private summary requested; publishing forbidden.", execution: "Brief Bot / actual independent Chat",
	result: "blocked", summary: "Draft exists; publication permission missing.", deliverables: ["C:/owned/draft.md"], pendingDecisions: ["Does the draft meet requirements?"] };
for (const host of ["omp", "pi"] as const) test(`${host} P22 real backend distinguishes save failure notification failure and post-commit response loss`, async () => {
	const backend = await workflowBackend();
	let dock: RoleContractDock | undefined;
	let pending: Promise<void> | undefined;
	const sockets = new Set<Socket>();
	let drop = false;
	const wire: unknown[] = [];
	const proxy = createServer(async (request, response) => {
		try {
			const chunks: Buffer[] = [];
			for await (const chunk of request) chunks.push(Buffer.from(chunk));
			const payload = Buffer.concat(chunks).toString();
			const upstream = await fetch(backend.endpoint + request.url, { method: request.method,
				headers: { "content-type": "application/json" }, body: payload || undefined });
			const actual = await upstream.text();
			wire.push({ path: request.url, request: JSON.parse(payload), status: upstream.status, response: JSON.parse(actual), dropped: drop });
			if (drop) { request.socket.destroy(); return; }
			response.writeHead(upstream.status, { "content-type": "application/json" }); response.end(actual);
		} catch (error) { response.destroy(error instanceof Error ? error : new Error(String(error))); }
	});
	proxy.on("connection", socket => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
	const listening = Promise.withResolvers<void>(); proxy.listen(0, "127.0.0.1", listening.resolve); await listening.promise;
	const address = proxy.address();
	if (!address || typeof address === "string") throw new Error("Owned proxy did not bind");
	try {
		dock = await roleContractDock(host, `http://127.0.0.1:${address.port}`, 2000, "chief-report");
		const data = (await dock.state()).data;
		if (!data || typeof data !== "object" || !("sessionId" in data) || typeof data.sessionId !== "string") throw new Error("Native sender identity unavailable");
		const nativeId = data.sessionId;
		await backend.post("/api/zones", { id: "owned", path: dock.root.workDir });
		const tasks: Record<string, string> = {};
		for (const [name, taskType, agent] of [["chief", "chief", "omp"], ["sender", "normal", host]]) {
			const result = await backend.post("/api/tasks", { name, taskType, agent, chatName: "{chat.id}", model: "default", prompt: "" });
			tasks[name!] = result.tasks.find((task: { name: string }) => task.name === name).id;
		}
		async function terminal(id: string) {
			const deadline = Date.now() + 20_000;
			while (Date.now() < deadline) {
				const result = await fetch(backend.endpoint + "/api/chats/" + id).then(r => r.json());
				if (result.stage === "failed") throw new Error(JSON.stringify(result));
				if (result.stage === "succeeded") return result;
				await Bun.sleep(25);
			}
			throw new Error("Owned Chat did not finish startup");
		}
		backend.behavior("fault-chief", dock.root.workDir);
		const preview = await backend.post("/api/chats/preview", { zone: "owned", taskId: tasks.chief });
		await terminal((await backend.post("/api/chats", { zone: "owned", taskId: tasks.chief, chatId: preview.chatId })).id);
		await backend.post("/api/sessions/events", { sessionId: "fault-chief", kind: "register", data: { cwd: dock.root.workDir, agentType: "omp" } });
		const chief = JSON.parse(readFileSync(join(backend.root.path, "started.jsonl"), "utf8").trim().split("\n")[0]!);
		chief.agent = "omp"; chief.agent_session = { source: "herdr:omp", agent: "omp", kind: "id", value: "fault-chief" };
		writeFileSync(join(backend.root.path, "bots/sender.json"), JSON.stringify({ id: "sender", name: "sender", when: "", plan_guide: "", node_guide: "", task_id: tasks.sender }));
		const nativeFile = join(backend.root.path, "native-sender.jsonl");
		writeFileSync(nativeFile, JSON.stringify({ type: "session", version: 3, id: nativeId, cwd: dock.root.workDir }) + "\n");
		writeFileSync(join(backend.root.path, "behavior.json"), JSON.stringify({ native_session: { source: `herdr:${host}`, agent: host, kind: "path", value: nativeFile }, native_cwd: dock.root.workDir }));
		const delegated = await backend.post("/api/chief/delegations/preview", { sessionId: "fault-chief", botId: "sender", zoneId: "owned", input: "Summarize only", materials: [] });
		await terminal((await backend.post("/api/chief/delegations", { sessionId: "fault-chief", previewId: delegated.previewId })).id);
		writeFileSync(join(backend.root.path, "behavior.json"), JSON.stringify({ agents: [chief], fail_prompt: true }));
		const reports = () => fetch(backend.endpoint + "/api/chief/reports").then(r => r.json());
		const calls = () => readFileSync(join(backend.root.path, "calls.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line)).filter(call => call.kind === "agent_prompt");
		async function approved() {
			pending = dock!.call({ body });
			const dialog = await dock!.confirmation();
			expect(dialog.message).toContain(JSON.stringify({ body, sessionId: nativeId }, null, 2));
			const before = wire.length;
			dock!.answerConfirmation(String(dialog.id), true); await pending; pending = undefined;
			expect(wire).toHaveLength(before + 1);
			return dock!.lastResult();
		}
		const journal = join(backend.root.path, "session-history.chief-reports.jsonl");
		mkdirSync(journal); // Actual durable destination cannot be opened as a file.
		const notificationsBefore = calls().length;
		const failed = await approved();
		expect(failed).toMatchObject({ isError: true, details: { body: { saved: false, code: "report-save-failed", notification: { status: "not-attempted" } } } });
		expect(calls()).toHaveLength(notificationsBefore);
		rmSync(journal, { recursive: true });
		expect((await reports()).reports).toEqual([]);
		const saved = await approved();
		expect(saved).toMatchObject({ details: { body: { saved: true, notification: { status: "failed" }, guidance: expect.stringContaining("不代表可靠接收") } } });
		const first = (await reports()).reports;
		expect(first).toHaveLength(1); expect(first[0].body).toEqual(body);
		// P37: this SAME persisted identity is consumed by both installed hosts,
		// not two peer-generated copies or a source-wiring snapshot.
		const consumers: unknown[] = [];
		await backend.post("/api/zones", { id: "test-reader", path: backend.root.path });
		for (const readerHost of ["omp", "pi"] as const) {
			const reader = await chiefDock(readerHost, backend.endpoint);
			try {
				const current = await fetch(backend.endpoint + "/api/chief").then(response => response.json());
				await backend.post("/api/sessions/events", { sessionId: current.current.sessionId, kind: "unregister" });
				const readerData = (await reader.state()).data;
				if (!readerData || typeof readerData !== "object" || !("sessionId" in readerData) || typeof readerData.sessionId !== "string") throw new Error("Native reader identity unavailable");
				const readerId = readerData.sessionId;
				const created = await backend.post("/api/tasks", { name: `reader-${readerHost}`, taskType: "chief", agent: readerHost, chatName: "{chat.id}", model: "default", prompt: "" });
				const readerTask = created.tasks.find((task: { name: string }) => task.name === `reader-${readerHost}`).id;
				const file = join(backend.root.path, `reader-${readerHost}.jsonl`);
				writeFileSync(file, JSON.stringify({ type: "session", version: 3, id: readerId, cwd: backend.root.path }) + "\n");
				writeFileSync(join(backend.root.path, "behavior.json"), JSON.stringify({ native_session: { source: `herdr:${readerHost}`, agent: readerHost, kind: "path", value: file }, native_cwd: backend.root.path }));
				const preview = await backend.post("/api/chats/preview", { zone: "test-reader", taskId: readerTask });
				await terminal((await backend.post("/api/chats", { zone: "test-reader", taskId: readerTask, chatId: preview.chatId })).id);
				await backend.post("/api/sessions/events", { sessionId: readerId, kind: "register", data: { cwd: backend.root.path, agentType: readerHost } });
				const result = await reader.call({ id: first[0].id }, "chief_read_report");
				expect(result).toMatchObject({ isError: false, details: { body: { report: first[0] } } });
				consumers.push({ host: readerHost, result, history: await reader.history(), requests: reader.capture.requests() });
			} finally { await reader.close(); }
		}
		expect((await reports()).reports).toEqual(first);
		console.log(JSON.stringify({ samePersistedReport: first[0], consumers }));
		drop = true;
		const uncertain = await approved();
		expect(uncertain).toMatchObject({ isError: true, details: { body: { guidance: expect.stringContaining("不表示回滚或未生效") } } });
		const after = (await reports()).reports;
		expect(after).toHaveLength(2); expect(after[0]).toEqual(first[0]); expect(after[1].body).toEqual(body);
		const observed = wire.length, notifications = calls().length;
		// Actual configured confirmation budget, no model/business retry by the driver.
		await Bun.sleep(2100);
		expect(wire).toHaveLength(observed); expect(calls()).toHaveLength(notifications); expect((await reports()).reports).toEqual(after);
		console.log(JSON.stringify({ host, body, failed, saved, uncertain, wire, reports: after, confirmationMs: 2000, observationMs: 2100 }));
	} finally {
		const evidence = process.env.CHIEF_REPORTS_EVIDENCE_DIR;
		if (evidence) { mkdirSync(evidence, { recursive: true }); writeFileSync(join(evidence, `P22-${host}.json`), JSON.stringify({ host, wire, nativeRequests: dock?.capture.requests(),
			backendCalls: existsSync(join(backend.root.path, "calls.jsonl")) ? readFileSync(join(backend.root.path, "calls.jsonl"), "utf8") : null }, null, 2)); }
		try { if (pending) { await dock?.cancel(); await pending; } }
		finally { try { await dock?.close(); } finally {
			for (const socket of sockets) socket.destroy();
			const closed = Promise.withResolvers<void>(); proxy.close(error => error ? closed.reject(error) : closed.resolve());
			try { await closed.promise; } finally { await backend.close(); }
		} }
	}
}, 300_000);
