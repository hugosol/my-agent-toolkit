/** Ticket 10 S2 mechanical acceptance only. Open an invocation-owned native
 * history through the installed host's public switch_session, then invoke the
 * shipped approve tool concurrently with its original native process. No ID is
 * forged, no private tool implementation is imported, and no backend is faked.
 */
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ControlledSession } from "../tests/harness-dock/session";
import { PiSession, resolvePiCli } from "../tests/harness-dock/pi-session";
import { resolveInstalledOmp } from "../tests/harness-dock/installed-omp";
import { createRunRoot } from "../tests/harness-dock/run-root";

const configPath = process.argv[2];
if (!configPath) throw new Error("Supply the explicit owned concurrent invocation JSON");
const config = JSON.parse(readFileSync(resolve(configPath), "utf8")) as {
	host: "omp" | "pi"; agent: string; deployment: string; session: string;
	sessionId: string; label: string; evidence: string; start: string;
};
if (config.host !== "omp" && config.host !== "pi") throw new Error("Unknown installed host");
mkdirSync(config.evidence, { recursive: false });
const root = createRunRoot("ticket10-concurrent");
const env = Object.fromEntries(["HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME", "XDG_CACHE_HOME"].map(name => [name, root.path]));
env.OMP_CODING_AGENT_DIR = root.agentDir;
for (const name of ["models.json", "models.yml", "settings.json", "config.yml"]) {
	const source = join(config.agent, name);
	if (existsSync(source)) copyFileSync(source, join(root.agentDir, name));
}
// Never leave the second process writing native histories into a different owner.
writeFileSync(join(root.agentDir, "settings.json"), JSON.stringify({ sessionDir: root.sessionDir }));
let session: ControlledSession | PiSession | undefined;
const evidence: Record<string, unknown> = { scope: "Controlled provider; actual installed native Session and shipped approve tool", config, root: root.path, passed: false, cleanupErrors: [] };
try {
	const entry = join(config.deployment, `entrypoints/${config.host}-auto/node-chat.ts`);
	session = config.host === "omp"
		? await ControlledSession.start({ harness: await resolveInstalledOmp(), runRoot: root, extensions: [entry], model: "ticket10/mechanical", env })
		: await PiSession.start({ cli: resolvePiCli(), runRoot: root, entrypoint: entry, selector: "ticket10/mechanical", env });
	await session.request({ type: "switch_session", sessionPath: config.session });
	const state = await session.request({ type: "get_state" });
	const nativeId = (state.data as { sessionId?: unknown } | undefined)?.sessionId;
	if (nativeId !== config.sessionId) throw new Error(`Actual recovered Session identity differs: ${JSON.stringify(state)}`);
	evidence.state = state;
	evidence.argv = session.argv;
	writeFileSync(join(config.evidence, "ready.json"), JSON.stringify({ nativeId, state, argv: session.argv }));
	const deadline = performance.now() + 30_000;
	while (!existsSync(config.start)) {
		if (performance.now() >= deadline) throw new Error("Original native caller did not release concurrent invocation");
		await Bun.sleep(25);
	}
	evidence.started = performance.now();
	if (session instanceof ControlledSession) await session.prompt(`Explicit concurrent mechanical approve. TICKET10:${config.label}`);
	else await session.run(`Explicit concurrent mechanical approve. TICKET10:${config.label}`);
	evidence.ended = performance.now();
	const results = session.frames().filter(frame => frame.type === "tool_execution_end");
	if (results.length !== 1) throw new Error(`Expected one actual concurrent native result: ${JSON.stringify(results)}`);
	evidence.results = results;
	evidence.passed = true;
} catch (error) {
	evidence.error = error instanceof Error ? error.stack : String(error);
} finally {
	if (session) {
		try {
			const exit = await session.stop();
			evidence.exit = exit;
			if (exit.exitCode !== 0 || exit.timedOut) throw new Error(`Concurrent native process cleanup failed: ${JSON.stringify(exit)}`);
		} catch (error) { (evidence.cleanupErrors as string[]).push(String(error)); }
		evidence.frames = session.frames();
		evidence.stderr = session.stderr();
	}
	try { cpSync(root.sessionDir, join(config.evidence, "sessions"), { recursive: true }); }
	catch (error) { (evidence.cleanupErrors as string[]).push(String(error)); }
	if ((evidence.cleanupErrors as string[]).length) evidence.passed = false;
	// Session.stop has observed the actual child exit before owned files are removed.
	if (!(evidence.cleanupErrors as string[]).length) root.dispose();
	writeFileSync(join(config.evidence, "result.json"), JSON.stringify(evidence, null, 2));
}
process.exitCode = evidence.passed ? 0 : 1;
