import { expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { buildSessionEnv, createRunRoot, listSessionFiles, readSessionLog, resolveInstalledOmp, startCaptureServer, writeAgentSettings, type RunRoot } from ".";
import { piVersion, resolvePiCli, startPiRun } from "./pi-session";

const PROBE = path.join(import.meta.dir, "fixtures/session-ready/entrypoint.ts");
const TRACE = "ready-trace.jsonl";
const RELEASE = "release-hook";
const WINDOW = 18_000;

function deployConnectBot(root: RunRoot, entry: "omp" | "pi-auto", endpoint: string): string {
	const repo = path.resolve(import.meta.dir, "../..");
	const deployment = path.join(root.path, "toolkit");
	mkdirSync(deployment);
	for (const source of ["package.json", "adapters", "framework", "extensions/connect-bot", `entrypoints/${entry}`, "entrypoints/startup", "node_modules/yaml"]) {
		cpSync(path.join(repo, source), path.join(deployment, source), {
			recursive: true, dereference: true,
			filter: file => path.basename(file) !== ".runtime",
		});
	}
	writeFileSync(path.join(deployment, "extensions/connect-bot/config.yaml"), `endpoint: "${endpoint}"\nrequestTimeoutMs: 10000\n`);
	return path.join(deployment, `entrypoints/${entry}/connect-bot.ts`);
}

type PanelMessage = { kind: string; sessionId: string; data?: unknown };

function nativeUserMessage(root: RunRoot, marker: string) {
	for (const file of listSessionFiles(root.sessionDir)) {
		const log = readSessionLog(root.sessionDir, file);
		if (log.entries.some(entry => {
			const message = entry.message as { role?: string; content?: unknown } | undefined;
			return entry.type === "message" && message?.role === "user" && JSON.stringify(message.content).includes(marker);
		})) return log;
	}
	return undefined;
}

function startTerminal(root: RunRoot, command: readonly string[], harness: "omp" | "pi", args: readonly string[], extra: Record<string, string> = {}) {
	const trace = path.join(root.captureDir, TRACE);
	const home = path.join(root.path, "home");
	mkdirSync(home, { recursive: true });
	const env = buildSessionEnv(Object.fromEntries(Object.entries(process.env).filter(([key]) =>
		/^(path|systemroot|windir|comspec|pathext|temp|tmp|lang)$/i.test(key),
	)), {
		agentDir: root.agentDir,
		extra: {
			HOME: home, USERPROFILE: home, APPDATA: home, LOCALAPPDATA: home, TERM: "xterm-256color",
			DOCK_READY_HARNESS: harness, DOCK_READY_TRACE: trace,
			DOCK_READY_RELEASE: path.join(root.captureDir, RELEASE),
			...extra,
		},
	});
	let output = "";
	const decoder = new TextDecoder();
	const terminal = new Bun.Terminal({ cols: 120, rows: 36, data(_terminal, data) {
		output += decoder.decode(data, { stream: true });
	} });
	const child = Bun.spawn([...command, "--no-extensions", "--session-dir", root.sessionDir, ...args, "-e", PROBE], {
		cwd: root.workDir, env, terminal,
	});
	function observations(): Array<{ kind: string; session?: string; file?: string }> {
		if (!existsSync(trace)) return [];
		return readFileSync(trace, "utf8").split(/\r?\n/).slice(0, -1).map(line => JSON.parse(line));
	}
	return {
		pid: child.pid,
		observations,
		outputContains(text: string) { return output.includes(text); },
		async until<T>(description: string, observe: () => T | undefined): Promise<T> {
			const deadline = Date.now() + WINDOW;
			while (Date.now() < deadline && child.exitCode === null) {
				const value = observe();
				if (value !== undefined) return value;
				await Bun.sleep(25);
			}
			throw new Error(`${harness}: no ${description} (exit ${child.exitCode}); events: ${JSON.stringify(observations())}; terminal: ${output.slice(-5000)}`);
		},
		type(text: string) { terminal.write(text); },
		async close() {
			try {
				if (child.exitCode === null) {
					terminal.write("\x04");
					const exit = await Promise.race([child.exited, Bun.sleep(2500).then(() => null)]);
					if (exit === null) child.kill();
				}
				return await child.exited;
			} finally {
				terminal.close();
			}
		},
	};
}

// S2/S3, P17. A real later startup hook holds OMP after its semantic start. A binding
// equating that start with ready trips the closed-gate assertion; one waiting in the hook
// deadlocks before the gate can open. An actual submission after release proves the path remains intact.
test("installed OMP reports session ready only after its native composer startup gate opens", async () => {
	const root = createRunRoot("omp-session-ready");
	const capture = startCaptureServer({ dir: root.captureDir });
	const messages: PanelMessage[] = [];
	const panel = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
		if (request.method !== "POST" || new URL(request.url).pathname !== "/api/sessions/events") return new Response(null, { status: 404 });
		messages.push(await request.json() as PanelMessage);
		return Response.json({ outcome: "accepted" });
	} });
	try {
		const omp = await resolveInstalledOmp();
		const connectBot = deployConnectBot(root, "omp", `http://127.0.0.1:${panel.port}`);
		const launch = { launchId: "dock-omp-invocation", targetId: "dock-target-correlation" };
		writeAgentSettings(root.agentDir, { "startup.setupWizard": false, "startup.checkUpdate": false, "composer.predictions": false });
		const run = startTerminal(root, [omp.path, ...omp.argvPrefix], "omp", [
			"-e", path.join(import.meta.dir, "fixtures/extension-root/provider.ts"), "-e", connectBot,
			"--model", "dock-gateway/dock-model", "--no-lsp", "--no-title", "--no-tools",
		], { DOCK_CAPTURE_BASE_URL: capture.baseUrl, HERDR_BOT_LAUNCH_ID: launch.launchId, HERDR_BOT_LAUNCH_TARGET_ID: launch.targetId });
		try {
			const native = await run.until("closed native gate", () => run.observations().find(event => event.kind === "native-gate-closed"));
			if (!native.session) throw new Error("The OMP observation carried no native session ID");
			const identity = await run.until("production launch identity", () => messages.find(message => message.kind === "launch_identity"));
			const expected = { ...launch, agentType: "omp", pid: run.pid, cwd: root.workDir, ...(native.file ? { sessionFile: native.file } : {}) };
			expect(identity).toEqual({ kind: "launch_identity", sessionId: native.session, data: expected });
			// The native startup hook stays latched by the file while multiple real adapter samples run.
			await Bun.sleep(150);
			expect(messages.map(message => message.kind)).toEqual(["launch_identity"]);
			const before = run.observations();
			expect(before.map(event => event.kind)).toEqual(["session_start", "native-gate-closed"]);
			expect(capture.requests()).toHaveLength(0);
			writeFileSync(path.join(root.captureDir, RELEASE), "release");
			const ready = await run.until("public session_ready", () => run.observations().find(event => event.kind === "session_ready"));
			expect(ready.session).toBe(before[0]!.session);
			const reported = await run.until("production launch ready", () => messages.find(message => message.kind === "launch_ready"));
			expect(reported).toEqual({ kind: "launch_ready", sessionId: native.session, data: expected });
			expect(run.observations().map(event => event.kind)).toEqual(["session_start", "native-gate-closed", "native-hook-released", "session_ready"]);
			run.type("/dock-ready-input omp-readiness-native-input\r");
			const input = await run.until("native command admission", () => run.observations().find(event => event.kind === "native-command-input"));
			expect(input.session).toBe("omp-readiness-native-input");
		} finally {
			const exit = await run.close();
			console.log(`ready dock: OMP ${omp.version} (${omp.path}); owned process exited ${exit}; controlled loopback provider`);
		}
	} finally {
		await panel.stop(true);
		capture.stop();
		rmSync(root.path, { recursive: true, force: true, maxRetries: 5 });
	}
}, 42_000);

// S2/S3, P18. Observe early native OSC idle while a previous session_start handler is
// still held; a later handler then opens an actual native modal after ready. Neither OSC
// nor the existence of a ready record guarantees admissibility at the next instant.
test("installed Pi reports input initialization on first launch and native resume, not permanent input availability", async () => {
	const cli = resolvePiCli();
	const version = await piVersion(cli);
	const { root, capture, selector } = startPiRun(cli, "pi-session-ready", { provider: "readiness-dock", model: "local" });
	const args = ["--model", selector, "--no-mcp", "--no-approve", "--tui-mode", "regular"];
	try {
		let native: { id: string; file: string } | undefined;
		for (const phase of ["first", "resume"] as const) {
			writeFileSync(path.join(root.captureDir, TRACE), "");
			const run = startTerminal(root, cli.command, "pi", [
				...args, ...(native === undefined ? [] : ["--session", native.file]),
			], { PI_PROGRAM_STATUS: "1", DOCK_READY_PI_MODAL: phase === "first" ? "1" : "0" });
			try {
				if (phase === "first") {
					await run.until("native startup hold", () => run.observations().find(event => event.kind === "pi-hook-before-ready"));
					await run.until("early OSC idle", () => run.outputContains("7501;state=idle") || undefined);
					expect(run.observations().map(event => event.kind)).toEqual(["pi-hook-before-ready"]);
					writeFileSync(path.join(root.captureDir, RELEASE), "release");
				}
				const ready = await run.until("public session_ready", () => run.observations().find(event => event.kind === "session_ready"));
				expect(ready.session).toBe(run.observations().find(event => event.kind === "session_start")?.session);
				if (phase === "first") {
					await run.until("native blocked modal", () => (run.outputContains("Dock startup modal") && run.outputContains("7501;state=blocked")) || undefined);
					expect(capture.requests()).toHaveLength(0);
					run.type("\x1b");
					await run.until("native modal dismissal", () => run.observations().find(event => event.kind === "pi-modal-dismissed"));
				}
				const input = `pi-ready-${phase}-interactive-input`;
				run.type(`${input}\r`);
				await run.until("native model request", () => capture.requests().find(request => request.raw.includes(input)));
				const log = await run.until("persisted native input", () => nativeUserMessage(root, input));
				const id = log.entries.find(entry => entry.type === "session")?.id;
				if (typeof id !== "string" || !id) throw new Error("The Pi journal carried no native session ID");
				expect(ready.session).toBe(id);
				expect(log.unparsed).toEqual([]);
				if (native === undefined) native = { id, file: log.file };
				else expect({ id, file: log.file }).toEqual(native);
				expect(run.observations().filter(event => event.kind === "session_ready")).toEqual([ready]);
			} finally {
				const exit = await run.close();
				console.log(`ready dock: Pi ${version} (${cli.command.join(" ")}); ${phase} owned process exited ${exit}; controlled loopback provider`);
			}
		}
	} finally {
		capture.stop();
		rmSync(root.path, { recursive: true, force: true, maxRetries: 5 });
	}
}, 65_000);

// S1 peer + S2/S3 producer, P16/P19: hold the existing registration at the real HTTP
// boundary. The production extension must still send native evidence, then withdraw it
// after an actual switch. Neither a successful register nor the controlled model supplies it.
test("installed Pi sends managed launch evidence while ordinary registration is unanswered", async () => {
	const cli = resolvePiCli();
	const { root, capture, selector } = startPiRun(cli, "pi-launch-reports", { provider: "readiness-dock", model: "local" });
	const messages: Array<{ kind: string; sessionId: string; data?: unknown }> = [];
	const releaseRegistration = Promise.withResolvers<void>();
	const panel = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
		if (request.method !== "POST" || new URL(request.url).pathname !== "/api/sessions/events") return new Response(null, { status: 404 });
		const report = await request.json() as typeof messages[number];
		messages.push(report);
		if (report.kind === "register") {
			await releaseRegistration.promise;
			return Response.json({ error: "controlled refusal" }, { status: 503 });
		}
		return Response.json({ outcome: "accepted" });
	} });
	try {
		const connectBot = deployConnectBot(root, "pi-auto", `http://127.0.0.1:${panel.port}`);
		const launch = { launchId: "dock-pi-invocation", targetId: "dock-target-correlation" };
		const run = startTerminal(root, cli.command, "pi", [
			"-e", connectBot,
			"--model", selector, "--no-mcp", "--no-approve", "--tui-mode", "regular",
		], { HERDR_BOT_LAUNCH_ID: launch.launchId, HERDR_BOT_LAUNCH_TARGET_ID: launch.targetId });
		try {
			const identity = await run.until("production launch identity", () => messages.find(message => message.kind === "launch_identity"));
			const ready = await run.until("production launch ready", () => messages.find(message => message.kind === "launch_ready"));
			await run.until("held ordinary registration", () => messages.find(message => message.kind === "register"));
			expect(messages.some(message => message.kind === "state")).toBe(false);
			releaseRegistration.resolve();
			const input = "pi-production-owner-native-input";
			run.type(`${input}\r`);
			const log = await run.until("native history for reported owner", () => nativeUserMessage(root, input));
			const nativeId = log.entries.find(entry => entry.type === "session")?.id;
			if (typeof nativeId !== "string" || !nativeId) throw new Error("The Pi journal carried no native session ID");
			const expected = { ...launch, agentType: "pi", pid: run.pid, cwd: root.workDir, sessionFile: log.file };
			expect(identity).toEqual({ kind: "launch_identity", sessionId: nativeId, data: expected });
			expect(ready).toEqual({ kind: "launch_ready", sessionId: nativeId, data: expected });
			await run.until("settled initial Pi request", () => run.outputContains("dock-capture-reply") || undefined);
			run.type("/new\r");
			await run.until("replacement owner starts", () => run.observations().find(event => event.kind === "session_start" && event.session !== nativeId));
			const withdrawal = await run.until("production launch withdrawal", () => messages.find(message => message.kind === "launch_ended"));
			expect(withdrawal).toEqual({ kind: "launch_ended", sessionId: nativeId, data: expected });
			expect(messages.filter(message => message.kind.startsWith("launch_")).map(message => message.sessionId)).toEqual([nativeId, nativeId, nativeId]);
		} finally {
			releaseRegistration.resolve();
			const exit = await run.close();
			expect(exit).toBe(0);
		}
	} finally {
		await panel.stop(true);
		capture.stop();
		rmSync(root.path, { recursive: true, force: true, maxRetries: 5 });
	}
}, 90_000);
