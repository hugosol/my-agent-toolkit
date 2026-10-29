import { expect, test } from "bun:test";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "node:http";
import type { Socket } from "node:net";
import { REPO_ROOT } from "../harness-dock/baseline";
import { startCaptureServer } from "../harness-dock/capture-server";
import { createRunRoot } from "../harness-dock/run-root";
import { PiSession, piVersion, resolvePiCli, writePiModels } from "../harness-dock/pi-session";

/** Real Pi 1.4 RPC, isolated deployment/state, controlled HTTP and model protocol. */
async function dock(role: "manager" | "node") {
	const cli = resolvePiCli();
	expect(await piVersion(cli)).toBe("1.4.0");
	const root = createRunRoot(`workflow-pi-${role}`);
	const deployment = join(root.path, "deployment");
	for (const tree of ["framework", "adapters", "extensions/workflow-chat", "entrypoints"]) {
		cpSync(join(REPO_ROOT, tree), join(deployment, tree), { recursive: true,
			filter: candidate => candidate !== join(REPO_ROOT, "framework/.runtime") });
	}
	cpSync(join(REPO_ROOT, "node_modules/yaml"), join(deployment, "node_modules/yaml"), { recursive: true });
	const calls: { path: string; body: Record<string, unknown> }[] = [];
	let answer: unknown = { ok: true };
	let status = 200;
	let delayMs = 0;
	let held = false;
	let arrived: (() => void) | undefined;
	let cancelled: (() => void) | undefined;
	const sockets = new Set<Socket>();
	const backend = createServer(async (request, response) => {
		const chunks: Buffer[] = [];
		for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
		calls.push({ path: request.url ?? "/", body: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
		const encoded = Buffer.from(JSON.stringify(answer));
		response.writeHead(status, { "content-type": "application/json", "content-length": encoded.length });
		if (held || delayMs > 0) {
			// Capture this exchange's observers before another request can replace them.
			const started = arrived;
			const disconnected = cancelled;
			let timer: NodeJS.Timeout | undefined;
			// A peer socket closing while the declared body is unfinished is the transport
			// cancellation oracle; Bun.serve's ReadableStream.cancel is not such an oracle.
			request.socket.once("close", () => {
				clearTimeout(timer);
				if (!response.writableEnded) disconnected?.();
			});
			response.write(encoded.subarray(0, 1), () => started?.());
			// Separate Pi process owns real HTTP deadlines; fake timers cannot advance them.
			if (!held) timer = setTimeout(() => response.end(encoded.subarray(1)), delayMs);
			return;
		}
		response.end(encoded);
	});
	backend.on("connection", socket => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
	const listening = Promise.withResolvers<void>();
	backend.listen(0, "127.0.0.1", listening.resolve);
	await listening.promise;
	const address = backend.address();
	if (!address || typeof address === "string") throw new Error("No workflow HTTP fixture port");
	async function closeBackend() {
		for (const socket of sockets) socket.destroy();
		const closed = Promise.withResolvers<void>();
		backend.close(error => error ? closed.reject(error) : closed.resolve());
		await closed.promise;
	}
	writeFileSync(join(deployment, "extensions/workflow-chat/config.yaml"), `endpoint: http://127.0.0.1:${address.port}\nrequestTimeoutMs: 500\ncollectTimeoutMs: 5000\n`);
	let next: { name: string; arguments: string } | undefined;
	const capture = startCaptureServer({ dir: root.captureDir, respond() {
		const toolCall = next; next = undefined;
		return toolCall ? { toolCall } : { replyText: "Controlled completion." };
	} });
	writePiModels(root.agentDir, { "workflow-fixture": {
		baseUrl: capture.baseUrl, api: "openai-completions", apiKey: "controlled-not-a-secret",
		models: [{ id: "fixture", name: "Fixture", reasoning: false, input: ["text"], contextWindow: 32000, maxTokens: 1024,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
	} });
	let session: PiSession | undefined;
	try {
		session = await PiSession.start({ cli, runRoot: root,
			entrypoint: join(deployment, `entrypoints/pi-auto/${role}-chat.ts`), selector: "workflow-fixture/fixture" });
		const running = session;
		return { session: running, calls, capture,
			answer(body: unknown, code = 200) { answer = body; status = code; },
			delayBody(milliseconds: number) { delayMs = milliseconds; },
			immediateBody() { held = false; delayMs = 0; },
			holdBody() {
				held = true;
				const started = Promise.withResolvers<void>();
				const aborted = Promise.withResolvers<void>();
				arrived = started.resolve;
				cancelled = aborted.resolve;
				return { started: started.promise, aborted: aborted.promise };
			},
			async beginCall(name: string, params: unknown) {
				next = { name, arguments: JSON.stringify(params) };
				const accepted = await running.request({ type: "prompt", message: `Execute the selected ${name} call.` });
				expect(accepted.success).toBe(true);
			},
			async call(name: string, params: unknown) {
				next = { name, arguments: JSON.stringify(params) };
				const mark = running.frameMark();
				await running.run(`Execute the selected ${name} call.`);
				const frames = running.frames().slice(mark);
				const frame = frames.reverse().find(frame => frame.type === "tool_execution_end");
				expect(frame).toBeDefined();
				return frame as { result: { details: { httpStatus?: number; body: unknown }; content: { text: string }[]; isError: boolean }; isError: boolean };
			},
			async history() { return readFileSync(await running.sessionFile(), "utf8"); },
			async close() {
				try {
					const outcome = await running.stop();
					expect(outcome.timedOut).toBe(false);
					expect(outcome.exitCode, outcome.stderr).toBe(0);
				} finally { await closeBackend(); capture.stop(); root.dispose(); }
			},
		};
	} catch (error) {
		await session?.stop(); await closeBackend(); capture.stop(); root.dispose(); throw error;
	}
}

for (const role of ["manager", "node"] as const) {
	test(`Pi 1.4 ${role}: native tools, first Prompt identity, strict parameters and original results`, async () => {
		const run = await dock(role);
		try {
			const name = role === "manager" ? "run" : "report";
			const valid = role === "manager" ? { action: "status" } : { body: "  original report\n" };
			const body = role === "manager" ? { snapshot: { status: "running" }, untouched: [1, null] }
				: { saved: true, notification: { ok: false, error: "notification unavailable" }, diagnostic: { ok: false } };
			run.answer(body);
			const first = await run.call(name, valid);
			expect(first.result.details).toEqual({ httpStatus: 200, body });
			expect(first.isError).toBe(false);
			expect(run.calls).toHaveLength(1);
			expect(run.calls[0]!.body.sessionId).toBeString();
			const state = await run.session.request({ type: "get_state" });
			if (!state.data || typeof state.data !== "object" || !("sessionId" in state.data)) throw new Error("Pi get_state did not publish sessionId");
			expect(run.calls[0]!.body.sessionId).toBe(state.data.sessionId);
			if (role === "node") expect(run.calls[0]!.body.body).toBe("  original report\n");
			const visible = run.capture.requests()[0]!.json as { tools: { function: { name: string } }[] };
			expect(visible.tools.map(tool => tool.function.name)).toContain(name);
			if (role === "manager") expect(visible.tools.map(tool => tool.function.name)).toContain("collect");
			const prompt = role === "manager" ? "你是 Run 管理者" : "你是节点执行者";
			expect(run.capture.requests()[0]!.raw).toContain(prompt);
			const history = await run.history();
			expect(history).toContain('"role":"toolResult"');
			expect(history).toContain(prompt);
			for (const params of [{ ...valid, sessionId: "forged" }, role === "manager" ? { action: "status", reason: "inapplicable" } : { body: 123 },
				...(role === "manager" ? [{ action: "retry", nodeId: "n", confirmed: "false", reason: "r" }, { action: "dispatch", nodes: [123] }] : [])]) {
				const invalid = await run.call(name, params);
				expect(invalid.isError).toBe(true);
				expect(run.calls).toHaveLength(1);
			}
			if (role === "node") {
				run.answer({ saved: false, error: { kind: "save", message: "disk failed" } });
				expect((await run.call(name, valid)).isError).toBe(true);
			} else {
				for (const params of [{ action: "pause" }, { action: "resume" }, { action: "finish" },
					{ action: "dispatch", nodes: ["n"] }, { action: "complete", nodeId: "n", reason: "done" },
					{ action: "fail", nodeId: "n", reason: "failed" }, { action: "recover", nodeId: "n", confirmed: true, reason: "verified" },
					{ action: "retry", nodeId: "n", confirmed: false, reason: "review" },
					{ action: "reconcile_dispatch", nodeId: "n", finding: "not_created", reason: "verified" }]) {
					await run.call("run", params);
					expect(run.calls[run.calls.length - 1]!.path).toBe(`/api/workflow/manager/${params.action}`);
				}
				await run.call("collect", {});
				expect(run.calls[run.calls.length - 1]!.path).toBe("/api/workflow/manager/collect");
				const count = run.calls.length;
				expect((await run.call("collect", { sessionId: "forged" })).isError).toBe(true);
				expect(run.calls).toHaveLength(count);
			}
			run.answer({ error: { kind: "conflict" }, retained: true }, 409);
			const rejected = await run.call(name, valid);
			expect(rejected.result.details).toEqual({ httpStatus: 409, body: { error: { kind: "conflict" }, retained: true } });
			expect(rejected.isError).toBe(true);
			expect((await run.history()).split(prompt)).toHaveLength(2);
		} finally { await run.close(); }
	}, 180_000);
}

test("Pi 1.4 collect owns a complete-body budget independent of ordinary requests", async () => {
	const run = await dock("manager");
	try {
		run.answer({ retained: "complete body" });
		run.delayBody(900);
		const collected = await run.call("collect", {});
		expect(collected.result.details.body).toEqual({ retained: "complete body" });
		expect(collected.isError).toBe(false);
		const ordinary = await run.call("run", { action: "status" });
		expect(ordinary.isError).toBe(true);
	} finally { await run.close(); }
}, 60_000);

test("Pi 1.4 tool AbortSignal releases transport, switch preserves auto startup, and shutdown releases active collect", async () => {
	const run = await dock("manager");
	try {
		const gate = run.holdBody();
		const pending = run.call("collect", {});
		await gate.started;
		const before = run.calls[0]!.body.sessionId;
		const aborted = await run.session.request({ type: "abort" });
		expect(aborted.success).toBe(true);
		const cancelled = await pending;
		expect(cancelled.isError).toBe(true);
		expect(cancelled.result.details.body).toMatchObject({ error: { kind: "cancelled" } });
		// Result classification and physical peer disconnection are independent requirements.
		await gate.aborted;
		const originalFile = await run.session.sessionFile();
		// Native new_session must abort an actively executing tool, not only switch idle owners.
		const switchGate = run.holdBody();
		const switchingCollect = run.call("collect", {});
		await switchGate.started;
		const switched = await run.session.request({ type: "new_session" });
		expect(switched.success).toBe(true);
		const cancelledBySwitch = await switchingCollect;
		expect(cancelledBySwitch.isError).toBe(true);
		expect(cancelledBySwitch.result.details.body).toMatchObject({ error: { kind: "cancelled" } });
		await switchGate.aborted;
		// Automatic startup controls State/Prompt, not the process's native tool registrations.
		// Session observations/resources remain available independently of enabled State.
		run.immediateBody();
		const count = run.calls.length;
		const firstNewRequest = run.capture.requests().length;
		const newOwner = await run.call("collect", {});
		expect(newOwner.isError).toBe(false);
		expect(run.calls).toHaveLength(count + 1);
		const current = await run.session.request({ type: "get_state" });
		if (!current.data || typeof current.data !== "object" || !("sessionId" in current.data)) throw new Error("Pi get_state did not publish sessionId");
		expect(run.calls[count]!.body.sessionId).toBe(current.data.sessionId);
		expect(run.calls[count]!.body.sessionId).not.toBe(before);
		// The fresh Owner must not receive a second automatic tools Prompt, either on
		// the provider wire or in persisted history, despite the native tool being usable.
		expect(run.capture.requests()[firstNewRequest]!.raw).not.toContain("你是 Run 管理者");
		expect(await run.history()).not.toContain("你是 Run 管理者");
		const restored = await run.session.request({ type: "switch_session", sessionPath: originalFile });
		expect(restored.success).toBe(true);
		const secondGate = run.holdBody();
		// EOF may end the native runtime without agent_settled. Observe accepted Prompt,
		// actual HTTP body start and physical release instead of inventing a settle wait.
		await run.beginCall("collect", {});
		await secondGate.started;
		expect(run.calls[run.calls.length - 1]!.body.sessionId).toBe(before);
		const stopped = await run.session.stop();
		expect(stopped.timedOut).toBe(false);
		expect(stopped.exitCode, stopped.stderr).toBe(0);
		await secondGate.aborted;
	} finally { await run.close(); }
}, 60_000);
