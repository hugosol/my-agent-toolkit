/** Ticket 12 mechanical fault only, not real-model decision evidence.
 * Reuse the installed hosts' public RPC switch_session and shipped native tools
 * on an exact owned history copy. No Session identity or backend fact is forged.
 */
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ControlledSession } from "../tests/harness-dock/session";
import { PiSession, resolvePiCli } from "../tests/harness-dock/pi-session";
import { resolveInstalledOmp } from "../tests/harness-dock/installed-omp";
import { createRunRoot } from "../tests/harness-dock/run-root";

const configPath = process.argv[2];
if (!configPath) throw new Error("Supply the owned identity fault configuration");
const config = JSON.parse(readFileSync(resolve(configPath), "utf8")) as {
  host: "omp" | "pi"; agent: string; deployment: string; session: string;
  sessionId: string; evidence: string; model: string; endpoint: string;
  node: string; ompCli: string; piCli: string;
};
process.env.PI_NODE = config.node;
process.env.PI_CLI = config.piCli;
process.env.OMP_CLI = config.ompCli;
if (config.host !== "omp" && config.host !== "pi") throw new Error("Unknown host");
const header = readFileSync(config.session, "utf8").split(/\r?\n/).filter(Boolean)
  .map(line => JSON.parse(line) as { type?: string; id?: string; cwd?: string })
  .find(entry => entry.type === "session");
if (header?.id !== config.sessionId || !header.cwd || !existsSync(header.cwd)) throw new Error("Actual owned Session header differs");
const endpoint = new URL(config.endpoint);
if (endpoint.hostname !== "127.0.0.1" || Number(endpoint.port) < 49152 || Number(endpoint.port) > 65535) throw new Error("Fault provider is not owned dynamic loopback");
const root = { ...createRunRoot("ticket12-identity"), workDir: header.cwd };
const env = Object.fromEntries(["HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME", "XDG_CACHE_HOME"].map(name => [name, root.path]));
env.OMP_CODING_AGENT_DIR = root.agentDir;
const providerName = config.model.slice(0, config.model.indexOf("/"));
for (const name of ["models.json", "models.yml"]) {
  const source = join(config.agent, name);
  if (!existsSync(source)) continue;
  const registry = JSON.parse(readFileSync(source, "utf8"));
  if (!registry.providers?.[providerName]) throw new Error("Selected original provider is missing");
  registry.providers[providerName].baseUrl = config.endpoint;
  registry.providers[providerName].apiKey = "owned-mechanical-identity-fault";
  writeFileSync(join(root.agentDir, name), JSON.stringify(registry));
}
for (const name of ["settings.json", "config.yml"]) {
  const source = join(config.agent, name);
  if (existsSync(source)) writeFileSync(join(root.agentDir, name), readFileSync(source));
}
writeFileSync(join(root.agentDir, "settings.json"), JSON.stringify({ sessionDir: root.sessionDir }));
let session: ControlledSession | PiSession | undefined;
const evidence: Record<string, unknown> = { passed: false, scope: "Controlled provider supplies only malformed arguments; actual installed native adapter/tool and backend remain real. Not model judgment or recovery acceptance.",
  sessionId: config.sessionId, header, cleanupErrors: [] };
try {
  const entry = join(config.deployment, `entrypoints/${config.host}-auto/node-chat.ts`);
  session = config.host === "omp"
    ? await ControlledSession.start({ harness: await resolveInstalledOmp(), runRoot: root, extensions: [entry], model: config.model, env })
    : await PiSession.start({ cli: resolvePiCli(), runRoot: root, entrypoint: entry, selector: config.model, env });
  const switched = await session.request({ type: "switch_session", sessionPath: config.session });
  if (!switched.success || (switched.data as { cancelled?: boolean } | undefined)?.cancelled) throw new Error("Actual owned Session switch refused");
  const state = await session.request({ type: "get_state" });
  if ((state.data as { sessionId?: string } | undefined)?.sessionId !== config.sessionId) throw new Error("Actual Session identity changed");
  evidence.state = state;
  evidence.argv = session.argv;
  const prompt = "TICKET12-IDENTITY-FAULT: explicit controlled mechanical malformed-argument observation once; no business selection or retry.";
  if (session instanceof ControlledSession) await session.prompt(prompt);
  else await session.run(prompt);
  const results = session.frames().filter(frame => frame.type === "tool_execution_end");
  if (results.length !== 1) throw new Error("Expected one actual native malformed-argument result");
  evidence.results = results;
  evidence.passed = true;
} catch (error) {
  evidence.error = error instanceof Error ? error.stack : String(error);
} finally {
  if (session) {
    try {
      const exit = await session.stop();
      evidence.exit = exit;
      if (exit.exitCode !== 0 || exit.timedOut) throw new Error(`Native fault process did not exit cleanly: ${JSON.stringify(exit)}`);
    } catch (error) { (evidence.cleanupErrors as string[]).push(String(error)); }
    evidence.frames = session.frames();
    evidence.stderr = session.stderr();
  }
  try { cpSync(root.sessionDir, join(config.evidence, "sessions"), { recursive: true }); }
  catch (error) { (evidence.cleanupErrors as string[]).push(String(error)); }
  if ((evidence.cleanupErrors as string[]).length) evidence.passed = false;
  if (!(evidence.cleanupErrors as string[]).length) root.dispose();
  writeFileSync(join(config.evidence, "result.json"), JSON.stringify(evidence, null, 2));
}
process.exitCode = evidence.passed ? 0 : 1;
