import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { REPO_ROOT } from "../../harness-dock/baseline";
import { createRunRoot } from "../../harness-dock/run-root";

/** Real herdr-bot routes/storage, controlled external Herdr CLI; never a production process/data. */
export async function workflowBackend(collectWaitSeconds = 1) {
	const source = process.env.HERDR_BOT_REPO ?? resolve(REPO_ROOT, "../herdr-bot");
	const binary = join(source, "backend/target/debug/examples", process.platform === "win32" ? "safe_shutdown_shell.exe" : "safe_shutdown_shell");
	const fixture = join(source, "backend/target/debug", process.platform === "win32" ? "herdr-fixture.exe" : "herdr-fixture");
	for (const file of [binary, fixture]) if (!existsSync(file)) throw new Error(`Real backend interop requires ${file}; set HERDR_BOT_REPO and build safe_shutdown_shell plus herdr-fixture in that checkout.`);
	const root = createRunRoot("workflow-backend");
	const cli = join(root.path, basename(fixture));
	copyFileSync(fixture, cli);
	for (const dir of ["maps", "bots", "runs"]) mkdirSync(join(root.path, dir));
	const catalog = readFileSync(join(source, "meta-data/task-options.toml"), "utf8");
	// All catalog file-existence checks target the actual delivered node entrypoint; the controlled
	// Herdr fixture does not load these files or pretend to be the manager extension.
	writeFileSync(join(root.path, "options.toml"), catalog.replace(/^entrypoint = .*$/gm, `entrypoint = '${join(REPO_ROOT, "entrypoints/omp-auto/node-chat.ts")}'`));
	const tomlPath = (value: string) => JSON.stringify(value.replace(/\\/g, "/"));
	const config = join(root.path, "herdr-bot.toml");
	writeFileSync(config, [
		'listen_addr = "127.0.0.1:0"',
		"[herdr]", `workspace_name = '${basename(root.path)}'`, `executable = ${tomlPath(cli)}`,
		"[tasks]", `metadata_file = ${tomlPath(join(root.path, "options.toml"))}`, `storage_file = ${tomlPath(join(root.path, "tasks.json"))}`,
		"[zones]", `registry_file = ${tomlPath(join(root.path, "zones.json"))}`,
		"[sessions]", `history_file = ${tomlPath(join(root.path, "session-history.json"))}`,
		"[scheduler]", ...["map_directory", "bot_directory", "run_directory"].map((key, index) => `${key} = ${tomlPath(join(root.path, ["maps", "bots", "runs"][index]!))}`),
		`run_instructions = ${tomlPath(join(source, "docs/workflow-runtime.md"))}`, `collect_wait_seconds = ${collectWaitSeconds}`,
		"[operations.start]", "script = 'unused.bat'", "working_directory = '.'",
		"[operations.stop]", "script = 'unused.bat'", "working_directory = '.'", "[mdns]", "enabled = false", "",
	].join("\n"));
	writeFileSync(join(root.path, "workspaces.json"), JSON.stringify([{ workspace_id: "w-node-dock", label: basename(root.path) }]));
	const child = Bun.spawn([binary, "--config", config], { cwd: root.path, stdout: "pipe", stderr: "pipe" });
	const listening = Promise.withResolvers<string>();
	const output: string[] = [];
	async function pump(stream: ReadableStream<Uint8Array>) {
		const decoder = new TextDecoder();
		for await (const chunk of stream) {
			const text = decoder.decode(chunk, { stream: true }); output.push(text);
			const match = output.join("").match(/监听：http:\/\/127\.0\.0\.1:(\d+)\//);
			if (match) listening.resolve(`http://127.0.0.1:${match[1]}`);
		}
	}
	const readers = [pump(child.stdout), pump(child.stderr)];
	void child.exited.then(code => listening.reject(new Error(`Backend exited ${code}: ${output.join("")}`)));
	const timer = setTimeout(() => listening.reject(new Error(`Backend did not bind: ${output.join("")}`)), 20_000);
	let endpoint: string;
	try { endpoint = await listening.promise; if (!output.join("").includes("安全壳已启动")) throw new Error("Not the safe backend shell"); }
	catch (error) { child.kill(); await child.exited; await Promise.all(readers); root.dispose(); throw error; }
	finally { clearTimeout(timer); }
	return {
		endpoint, root, output,
		behavior(sessionId: string, cwd: string, failPrompt = false) {
			writeFileSync(join(root.path, "behavior.json"), JSON.stringify({ native_session: { source: "herdr:omp", agent: "omp", kind: "id", value: sessionId }, native_cwd: cwd, fail_prompt: failPrompt }));
		},
		async post(route: string, body: unknown) {
			const response = await fetch(`${endpoint}${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
			const json = await response.json();
			if (!response.ok) throw new Error(`${route}: ${response.status} ${JSON.stringify(json)}`);
			return json;
		},
		async close() { child.kill(); await child.exited; await Promise.all(readers); root.dispose(); },
	};
}
