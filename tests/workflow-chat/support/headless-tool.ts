import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "../../harness-dock/baseline";
import { buildSessionEnv } from "../../harness-dock/env";
import { resolvePiCli, startPiRun } from "../../harness-dock/pi-session";
import { promptDock } from "./prompt-dock";

/** Real no-UI host modes, not a replacement confirmation implementation. */
export async function headlessTool(host: "omp" | "pi", endpoint: string, role: "node" | "chief" | "chief-report", params: unknown): Promise<unknown> {
	const name = role === "chief" ? "chief_delegate" : role === "chief-report" ? "chief_report" : "report";
	if (host === "omp") {
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
	const run = startPiRun(resolvePiCli(), "headless-manual-report", {
		provider: "workflow-headless", model: "controlled-protocol",
		endpoint: { respond() {
			if (!selected) return undefined;
			selected = false;
			return { toolCall: { name, arguments: JSON.stringify(params) } };
		} },
	});
	let failure: unknown;
	try {
		const deployment = join(run.root.path, "deployment");
		for (const tree of ["framework", "adapters", "extensions/workflow-chat", "entrypoints"]) {
			cpSync(join(REPO_ROOT, tree), join(deployment, tree), { recursive: true,
				filter: candidate => candidate !== join(REPO_ROOT, "framework/.runtime") });
		}
		cpSync(join(REPO_ROOT, "node_modules/yaml"), join(deployment, "node_modules/yaml"), { recursive: true, dereference: true });
		writeFileSync(join(deployment, "extensions/workflow-chat/config.yaml"),
			`endpoint: ${endpoint}\nrequestTimeoutMs: 2000\nreportConfirmationTimeoutMs: 2000\ncollectTimeoutMs: 3000\n`);
		// Pi's documented print/JSON mode has hasUI=false; RPC deliberately has real dialog UI.
		const child = Bun.spawn([...run.cli.command, "--mode", "json", "--print", "--no-extensions", "--no-mcp",
			"-e", join(deployment, `entrypoints/pi-auto/${role === "chief-report" ? role : `${role}-chat`}.ts`), "--model", run.selector,
			"--session-dir", run.root.sessionDir, "Call report once, do not retry."], {
			cwd: run.root.workDir, stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: 90000,
			env: buildSessionEnv(process.env, { agentDir: run.root.agentDir, extra: {
				HOME: run.root.path, USERPROFILE: run.root.path, APPDATA: run.root.path, LOCALAPPDATA: run.root.path,
				XDG_CONFIG_HOME: run.root.path, XDG_DATA_HOME: run.root.path, XDG_STATE_HOME: run.root.path, XDG_CACHE_HOME: run.root.path,
				PI_OFFLINE: "1", PI_SKIP_VERSION_CHECK: "1", PI_TELEMETRY: "0",
			} }),
		});
		try {
			const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
			console.log(JSON.stringify({ host, headlessExit: exit, stderr }));
			writeFileSync(join(run.root.captureDir, "headless-native.json"), JSON.stringify({ stdout, stderr, exit,
				scope: "Real installed no-UI host; controlled protocol provider, not real-model behavior" }));
			if (exit !== 0) throw new Error(`Headless Pi exited ${exit}: ${stderr}\n${stdout}`);
			const frames: unknown[] = stdout.trim().split(/\r?\n/).map(line => JSON.parse(line));
			const end = frames.reverse().find(frame => frame && typeof frame === "object" && "type" in frame && frame.type === "tool_execution_end");
			if (!end || typeof end !== "object" || !("result" in end)) throw new Error(`Missing headless tool result: ${stdout}\n${stderr}`);
			return end.result;
		} finally {
			if (child.exitCode === null) child.kill();
			await child.exited;
		}
	} catch (error) {
		failure = error;
		throw error;
	} finally {
		const cleanupErrors: unknown[] = [];
		try {
			const evidence = process.env.WORKFLOW_PROMPT_EVIDENCE_DIR;
			if (evidence) {
				const destination = join(evidence, `headless-${role}-pi-${run.root.path.split(/[\\/]/).pop()}`);
				mkdirSync(destination, { recursive: true });
				cpSync(run.root.captureDir, join(destination, "captures"), { recursive: true });
				cpSync(run.root.sessionDir, join(destination, "sessions"), { recursive: true });
			}
		} catch (error) { cleanupErrors.push(error); }
		try { run.capture.stop(); } catch (error) { cleanupErrors.push(error); }
		// Retain the owned raw files if evidence export itself failed.
		if (!cleanupErrors.length) {
			try { run.root.dispose(); } catch (error) { cleanupErrors.push(error); }
		}
		if (cleanupErrors.length) {
			const errors = failure === undefined ? cleanupErrors : [failure, ...cleanupErrors];
			throw new Error(`Headless cleanup/evidence retention failed; owned raw root: ${run.root.path}\n${errors.map(error => error instanceof Error ? error.stack : String(error)).join("\n")}`);
		}
	}
}
