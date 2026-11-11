import { cpSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "../../harness-dock/baseline";
import { buildSessionEnv } from "../../harness-dock/env";
import { resolvePiCli, startPiRun } from "../../harness-dock/pi-session";
import { promptDock } from "./prompt-dock";

/** Real no-UI host modes, not a replacement confirmation implementation. */
export async function headlessReport(host: "omp" | "pi", endpoint: string,
	tool = "report", params: unknown = { body: "No UI cannot authorize this report", can_complete: false },
	role: "node" | "chief-report" = "node"): Promise<unknown> {
	if (host === "omp") {
		const dock = await promptDock(role, { headless: true, isolatedHome: true,
			config: `endpoint: ${endpoint}\nrequestTimeoutMs: 2000\nreportConfirmationTimeoutMs: 2000\ncollectTimeoutMs: 3000\n` });
		try {
			dock.select(tool, params);
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
			return { toolCall: { name: tool, arguments: JSON.stringify(params) } };
		} },
	});
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
			"-e", join(deployment, `entrypoints/pi-auto/${role === "chief-report" ? role : "node-chat"}.ts`), "--model", run.selector,
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
			if (exit !== 0) throw new Error(`Headless Pi exited ${exit}: ${stderr}\n${stdout}`);
			const frames: unknown[] = stdout.trim().split(/\r?\n/).map(line => JSON.parse(line));
			const end = frames.reverse().find(frame => frame && typeof frame === "object" && "type" in frame && frame.type === "tool_execution_end");
			if (!end || typeof end !== "object" || !("result" in end)) throw new Error(`Missing headless tool result: ${stdout}\n${stderr}`);
			return end.result;
		} finally {
			if (child.exitCode === null) child.kill();
			await child.exited;
		}
	} finally { run.capture.stop(); run.root.dispose(); }
}
