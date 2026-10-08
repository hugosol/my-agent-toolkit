/**
 * Layer-2 Codex delivery capture: the real chatgpt.com round trip, run by a human who can
 * supply credentials (ticket 15). Layer 1 (`tests/codebase-tools/outbound-role.test.ts`,
 * shape-only probe) records what the harness serializes; this records whether a real
 * provider accepts it and what role/order reaches the wire.
 *
 * Nothing here is executed by the test suites, and no credential is read into the context:
 * the wizard step stores the credential in the isolated agent state, and this script only
 * runs a session that uses it.
 *
 * Usage
 *   bun scripts/capture-codex-outbound.ts --prepare   # write isolated settings, print the wizard steps
 *   <wizard step, see output>                         # store the openai-codex credential
 *   bun scripts/capture-codex-outbound.ts --run       # one real turn; the request JSON is recorded
 *
 * Isolation: a pinned isolated `@oh-my-pi/pi-coding-agent@18.5.0` install (never the default
 * global install), a temporary agent state directory passed as `PI_CODING_AGENT_DIR`, an
 * explicit-only extension set (`--no-extensions -e entrypoints/omp`), the Codex transport
 * pinned to SSE (`providers.openaiWebsockets: "off"`), and `PI_REQ_DEBUG=1` so every request
 * body lands as `rr-session-N.json` in the capture directory. The default agent state,
 * formal configuration and any running agent are untouched.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import * as path from "node:path";
import {
	ControlledSession,
	REPO_ROOT,
	ensureIsolatedHarness,
	readBaselineRecord,
	writeAgentSettings,
} from "../tests/harness-dock/index";

const MODEL = "openai-codex/gpt-6-luna";
const COMMAND = "codebase-tools";
const TURN_TEXT = "codex layer2 turn";
const INIT_PROMPT = readFileSync(path.join(REPO_ROOT, "extensions", "codebase-tools", "shared-logic", "prompts", "init.md"), "utf8");
const OMP_ENTRYPOINT_DIR = path.join(REPO_ROOT, "entrypoints", "omp");
const DEFAULT_ROOT = path.join(REPO_ROOT, ".cache", "codex-layer2");

/** Parsed command line: the action plus the directories the run has to reuse. */
interface Options {
	readonly action: "prepare" | "run";
	readonly agentDir: string;
	readonly captures: string;
}

function parseOptions(argv: readonly string[]): Options {
	const valueOf = (name: string, fallback: string): string => {
		const index = argv.indexOf(`--${name}`);
		const value = index >= 0 ? argv[index + 1] : undefined;
		return value !== undefined && value.length > 0 ? value : fallback;
	};
	const action = argv.includes("--run") ? "run" : "prepare";
	return {
		action,
		agentDir: path.resolve(valueOf("agent-dir", path.join(DEFAULT_ROOT, "agent-state"))),
		captures: path.resolve(valueOf("captures", path.join(DEFAULT_ROOT, "captures"))),
	};
}

const options = parseOptions(process.argv.slice(2));

/**
 * The environment the wizard and the run must share.
 *
 * A login executed with an unset `PI_CODING_AGENT_DIR` writes the credential into the real
 * global agent state, which this flow must never touch; the printed steps therefore name the
 * variable explicitly and clear the resolution offsets the dock also clears. The login
 * uses the same isolated install the run does, so the credential is created by the version
 * under test rather than by whatever `omp` is on PATH.
 */
function wizardSteps(cliPath: string): string {
	const env = `PI_CODING_AGENT_DIR=${options.agentDir}`;
	return [
		`1. clear the resolution offsets: OMP_PROFILE PI_PROFILE XDG_DATA_HOME XDG_CONFIG_HOME OMP_AUTH_BROKER_*`,
		`2. ${env} bun "${cliPath}" login openai-codex`,
		`   (alternative for a credential the auth-broker already holds: ${env} bun "${cliPath}" auth-broker import)`,
		`   -> the credential lands in ${path.join(options.agentDir, "agent.db")} and never enters any prompt`,
		`3. bun scripts/capture-codex-outbound.ts --run --agent-dir "${options.agentDir}" --captures "${options.captures}"`,
	].join("\n");
}

const harness = await ensureIsolatedHarness(readBaselineRecord());

if (options.action === "prepare") {
	mkdirSync(options.agentDir, { recursive: true });
	mkdirSync(options.captures, { recursive: true });
	// Codex models prefer websockets by default and `PI_REQ_DEBUG` records HTTP requests only.
	writeAgentSettings(options.agentDir, { "providers.openaiWebsockets": "off" });
	console.log(`[layer2] isolated agent state: ${options.agentDir}`);
	console.log(`[layer2] capture directory:    ${options.captures}`);
	console.log(`[layer2] wrote ${path.join(options.agentDir, "config.yml")} (providers.openaiWebsockets: "off")`);
	console.log(`[layer2] isolated harness:     ${harness.cliPath}`);
	console.log(`[layer2] wizard steps:\n${wizardSteps(harness.cliPath)}`);
	process.exit(0);
}

const credentialFile = path.join(options.agentDir, "agent.db");
if (!existsSync(credentialFile)) {
	console.error(`[layer2] no credential at ${credentialFile}.`);
	console.error(`[layer2] run the wizard first (credentials are supplied by a human, never by this script):`);
	console.error(wizardSteps(harness.cliPath));
	console.error(
		`[layer2] the credential must live in this isolated agent state: the run clears OMP_AUTH_BROKER_*/XDG_* offsets, so an externally held credential is outside this flow.`,
	);
	process.exit(1);
}
if (!existsSync(path.join(options.agentDir, "config.yml"))) {
	console.error(`[layer2] ${options.agentDir} has no config.yml; run --prepare first.`);
	process.exit(1);
}
mkdirSync(options.captures, { recursive: true });

/** Decode one recorded request body: the Codex transport zstd-compresses official-URL bodies. */
function readRecordedBody(file: string): unknown {
	const record = JSON.parse(readFileSync(file, "utf8")) as {
		body?: unknown;
		bodyText?: string;
		bodyBase64?: string;
		bodyUnavailable?: string;
	};
	if (record.body !== undefined) return record.body;
	if (record.bodyText !== undefined) return JSON.parse(record.bodyText);
	if (record.bodyBase64 !== undefined) {
		return JSON.parse(new TextDecoder().decode(Bun.zstdDecompressSync(Buffer.from(record.bodyBase64, "base64"))));
	}
	throw new Error(`${path.basename(file)}: ${record.bodyUnavailable ?? "no recorded body"}`);
}

/** Report where the injected prompt landed in one recorded request, and under which role. */
function reportInjectedItem(label: string, body: unknown): void {
	const record = body as {
		input?: ReadonlyArray<{ role?: string; content?: unknown }>;
		instructions?: unknown;
	};
	const items = record.input ?? [];
	const textOf = (content: unknown): string => {
		if (typeof content === "string") return content;
		if (!Array.isArray(content)) return "";
		return content
			.map(part => (typeof part === "object" && part !== null && "text" in part ? String(part.text) : ""))
			.join("");
	};
	const index = items.findIndex(item => textOf(item.content).includes(INIT_PROMPT));
	console.log(
		`[layer2] ${label}: items=${items.length} injectedIndex=${index} role=${index >= 0 ? items[index]?.role : "<none>"} tail=${index === items.length - 1} instructionsCarryInit=${String(record.instructions ?? "").includes(INIT_PROMPT)}`,
	);
}

const sessionDir = path.join(options.agentDir, "sessions");
mkdirSync(sessionDir, { recursive: true });
// The session's working directory is the capture directory: PI_REQ_DEBUG writes `rr-session-N.json`
// relative to the process working directory.
const runRoot = {
	path: options.agentDir,
	agentDir: options.agentDir,
	sessionDir,
	workDir: options.captures,
	captureDir: options.captures,
	// The run root is the caller's own directory tree and must survive the run (its rs-session
	// records and session JSONL are the evidence), so there is nothing to remove here.
	dispose: (): void => {},
};

const before = new Set(readdirSync(options.captures));
let session: ControlledSession | undefined;
try {
	session = await ControlledSession.start({
		harness,
		runRoot,
		extensions: [OMP_ENTRYPOINT_DIR],
		model: MODEL,
		env: { PI_REQ_DEBUG: "1" },
	});
	const enable = await session.prompt(`/${COMMAND}`);
	const turn = await session.prompt(TURN_TEXT);
	const exit = await session.stop({ timeoutMs: 30_000 });
	console.log(`[layer2] enable=${enable.status} turn=${turn.status} exit=${String(exit.exitCode)}`);
	if (turn.status !== "completed" || exit.exitCode !== 0) {
		console.error(`[layer2] the real round trip did not complete; raw material:`);
		console.error(session.diagnostics());
		console.error(exit.stderr.trim());
		process.exit(1);
	}
	const recorded = readdirSync(options.captures)
		.filter(name => /^rr-session-\d+\.json$/.test(name) && !before.has(name))
		.sort();
	if (recorded.length === 0) {
		console.error(`[layer2] no rr-session-*.json was recorded in ${options.captures}`);
		process.exit(1);
	}
	for (const name of recorded) {
		reportInjectedItem(name, readRecordedBody(path.join(options.captures, name)));
	}
	console.log(`[layer2] session JSONL: ${session.sessionFiles().join(", ") || "<none>"}`);
	console.log(`[layer2] request bodies: ${recorded.map(name => path.join(options.captures, name)).join(", ")}`);
	console.log(
		"[layer2] websocket frames are not observed: this run pins SSE (`providers.openaiWebsockets: off`) because PI_REQ_DEBUG records HTTP requests only.",
	);
} finally {
	if (session !== undefined) await session.stop({ timeoutMs: 5_000 }).catch(() => undefined);
}
