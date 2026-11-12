import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { createHash } from "node:crypto";
import { REPO_ROOT } from "../../harness-dock/baseline";
import { buildSessionEnv } from "../../harness-dock/env";
import { resolvePiCli, startPiRun } from "../../harness-dock/pi-session";
import { promptDock } from "./prompt-dock";

/** Real no-UI host modes, not a replacement confirmation implementation. */
export async function headlessTool(host: "omp" | "pi", endpoint: string, role: "node" | "chief" | "chief-report", params: unknown,
	options: { readonly ompPackage?: string; readonly toolName?: string } = {}): Promise<unknown> {
	const name = options.toolName ?? (role === "chief" ? "chief_delegate" : role === "chief-report" ? "chief_report" : "report");
	if (host === "omp" && options.ompPackage === undefined) {
		const dock = await promptDock(role, { headless: true, isolatedHome: true,
			config: `endpoint: ${endpoint}\nrequestTimeoutMs: 2000\nreportConfirmationTimeoutMs: 2000\ncollectTimeoutMs: 3000\n` });
		try {
			dock.select(name, params);
			await dock.session.prompt("Call report once, do not retry.");
			return dock.session.frames().filter(frame => frame.type === "tool_execution_end").slice(-1)[0]?.result;
		} finally {
			try {
				const exit = await dock.session.stop();
				console.log(JSON.stringify({ host, headlessExit: exit }));
				if (exit.exitCode !== 0 || exit.timedOut) throw new Error(`Headless OMP cleanup failed: ${JSON.stringify(exit)}`);
			} finally { await dock.close(); }
		}
	}
	let selected = true;
	const cli = host === "omp" ? { command: [process.execPath, join(options.ompPackage!, "dist/cli.js")],
		path: join(options.ompPackage!, "dist/cli.js"), source: "explicit installed OMP package" } : resolvePiCli();
	const run = startPiRun(cli, host === "pi" ? "headless-manual-report" : "headless-manual-omp", {
		provider: "workflow-headless", model: "controlled-protocol",
		endpoint: { respond() {
			if (!selected) return undefined;
			selected = false;
			return { toolCall: { name, arguments: JSON.stringify(params) } };
		} },
	});
	let originalError: unknown;
	try {
		const deployment = join(run.root.path, "deployment");
		for (const tree of ["framework", "adapters", "extensions/workflow-chat", "entrypoints"]) {
			cpSync(join(REPO_ROOT, tree), join(deployment, tree), { recursive: true,
				filter: candidate => candidate !== join(REPO_ROOT, "framework/.runtime") });
		}
		cpSync(join(REPO_ROOT, "node_modules/yaml"), join(deployment, "node_modules/yaml"), { recursive: true, dereference: true });
		writeFileSync(join(deployment, "extensions/workflow-chat/config.yaml"),
			`endpoint: ${endpoint}\nrequestTimeoutMs: 2000\nreportConfirmationTimeoutMs: 2000\ncollectTimeoutMs: 3000\n`);
		if (host === "omp") {
			cpSync(join(run.root.agentDir, "models.json"), join(run.root.agentDir, "models.yml"));
			writeFileSync(join(run.root.agentDir, "config.yml"), "autoResume: false\nstartup:\n  setupWizard: false\n  showSplash: false\n  checkUpdate: false\nmarketplace:\n  autoUpdate: off\n");
		}
		// Both installed print/JSON modes are genuinely non-interactive. RPC is
		// not a substitute: its real extension dialog capability can be present.
		const argv = [...run.cli.command, "--mode", "json", "--print", "--no-extensions",
			...(host === "pi" ? ["--no-mcp"] : ["--no-lsp", "--no-pty", "--no-skills", "--no-rules", "--no-context-files", "--no-title", "--thinking", "off"]),
			"-e", join(deployment, `entrypoints/${host}-auto/${role === "chief-report" ? role : `${role}-chat`}.ts`), "--model", run.selector,
			"--session-dir", run.root.sessionDir, "Call report once, do not retry."];
		const child = Bun.spawn(argv, {
			cwd: run.root.workDir, stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: 90000,
			env: buildSessionEnv(process.env, { agentDir: run.root.agentDir, extra: {
				HOME: run.root.path, USERPROFILE: run.root.path, APPDATA: run.root.path, LOCALAPPDATA: run.root.path,
				XDG_CONFIG_HOME: run.root.path, XDG_DATA_HOME: run.root.path, XDG_STATE_HOME: run.root.path, XDG_CACHE_HOME: run.root.path,
				PI_OFFLINE: "1", PI_SKIP_VERSION_CHECK: "1", PI_TELEMETRY: "0",
				...(host === "omp" ? { OMP_CODING_AGENT_DIR: run.root.agentDir, OMP_CONFIG_DIR: run.root.agentDir } : {}),
			} }),
		});
		try {
			const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
			if (process.env.WORKFLOW_PROMPT_EVIDENCE_DIR) {
				writeFileSync(join(run.root.path, "headless-stdout.jsonl"), stdout);
				writeFileSync(join(run.root.path, "headless-stderr.log"), stderr);
				writeFileSync(join(run.root.path, "headless-run.json"), JSON.stringify({ host, cli, argv,
					cwd: run.root.workDir, agentDir: run.root.agentDir, pid: child.pid, exitCode: exit, exited: child.exitCode !== null,
					cliSha256: createHash("sha256").update(readFileSync(run.cli.path)).digest("hex"),
					parentBun: process.versions.bun, scope: "Actual installed no-UI host; controlled provider/peer only" }, null, 2));
			}
			console.log(JSON.stringify({ host, headlessExit: exit, stderr }));
			if (exit !== 0) throw new Error(`Headless ${host} exited ${exit}: ${stderr}\n${stdout}`);
			const frames: unknown[] = stdout.trim().split(/\r?\n/).map(line => JSON.parse(line));
			const end = frames.reverse().find(frame => frame && typeof frame === "object" && "type" in frame && frame.type === "tool_execution_end");
			if (!end || typeof end !== "object" || !("result" in end)) throw new Error(`Missing headless tool result: ${stdout}\n${stderr}`);
			return end.result;
		} finally {
			if (child.exitCode === null) child.kill();
			await child.exited;
		}
	} catch (error) {
		originalError = error;
		throw error;
	} finally {
		const cleanupErrors: unknown[] = [];
		const evidence = process.env.WORKFLOW_PROMPT_EVIDENCE_DIR;
		const destination = evidence ? join(evidence, `headless-${host}-${basename(run.root.path)}`) : undefined;
		try {
			if (destination) {
				mkdirSync(destination, { recursive: true });
				cpSync(run.root.captureDir, join(destination, "captures"), { recursive: true });
				cpSync(run.root.sessionDir, join(destination, "sessions"), { recursive: true });
				for (const file of ["headless-stdout.jsonl", "headless-stderr.log", "headless-run.json"]) {
					if (existsSync(join(run.root.path, file))) cpSync(join(run.root.path, file), join(destination, file));
				}
				if (originalError !== undefined) writeFileSync(join(destination, "original-error.txt"), originalError instanceof Error ? originalError.stack ?? originalError.message : String(originalError));
				writeFileSync(join(destination, "scope.txt"), `Real installed ${host} no-UI mode; controlled provider/peer. Not real-model routing evidence.\n`);
			}
		} catch (error) { cleanupErrors.push(error); }
		try { run.capture.stop(); } catch (error) { cleanupErrors.push(error); }
		try { run.root.dispose(); } catch (error) { cleanupErrors.push(error); }
		if (cleanupErrors.length) {
			if (destination) {
				try { writeFileSync(join(destination, "cleanup-errors.json"), JSON.stringify(cleanupErrors.map(error => error instanceof Error ? error.stack ?? error.message : String(error)), null, 2)); }
				catch (error) { cleanupErrors.push(error); }
			}
			throw Object.assign(new Error("Headless native evidence/cleanup failed"), { originalError, cleanupErrors });
		}
	}
}
