/**
 * codebase-tools on the real pi CLI: the injected-prompt, toggle, marker and
 * session-boundary behaviors, observed end to end over pi's RPC protocol.
 *
 * Usage
 *   bun scripts/pi-codebase-tools-smoke.ts                  # resolve the installed pi CLI
 *   bun scripts/pi-codebase-tools-smoke.ts --pi <path>      # or PI_CLI=<path>: the package's
 *                                                           # dist/bundle/cli.js, a pi.cmd/pi shim, or the binary
 *   bun scripts/pi-codebase-tools-smoke.ts --keep           # keep every run root for inspection
 *
 * What it drives: the real installed pi as a child process in RPC mode with
 * `--no-extensions -e entrypoints/pi/codebase-tools.ts --no-mcp`, an isolated agent state,
 * session directory and working directory under the OS temp root, and a local
 * OpenAI-compatible capture endpoint (the dock's `capture-server.ts`) declared through the
 * run's own `models.json` with a dummy key. The default agent state, the formal
 * configuration and any running agent are never touched, no real credential is read, and no
 * repository file is written. Every phase gets its own run root, so the phases are
 * independent and the whole smoke is repeatable.
 *
 * What it asserts (consumer-visible behavior only; no source or wiring inspection):
 *   1. a session that never toggles is off: its turn carries no contribution, the journal
 *      records no codebase-tools entry, nothing is announced, and the framework's marker
 *      area was published without the extension's line;
 *   2. `/codebase-tools` enables it: the command runs without invoking the model, announces
 *      the new value, shows the marker line, and persists the value it produced;
 *   3. the first enabled run injects one contribution — hidden (`display: false`), persisted
 *      as the init slot's framework identity, hanging off that turn's own user message,
 *      appended after it at the tail of the outbound request — and the request's tool set is
 *      unchanged by enabling;
 *   4. a later enabled run appends one more contribution, persisted as the reminder slot: the
 *      init is not re-injected, every earlier journal entry survives unchanged in order
 *      (append-only), and the earlier request's messages are an unchanged prefix of the later
 *      request's;
 *   5. disabling stops new contributions while every record the enabled period left stays:
 *      the disabled run adds nothing of its own, the earlier contributions are still in the
 *      request (replayed from history) and still in the journal, and the marker area is cleared;
 *   6. a session created in place (`new_session`) starts off and writes only its own state;
 *   7. a session resumed in a new process (`--session <file>`) and a session resumed in place
 *      (`switch_session`) each restore the recorded State and the init's progress: the run
 *      contributes without being re-enabled, exactly one init stays on the branch, no State is
 *      written by a run, and history is appended to rather than rewritten.
 *
 * The extension's two prompt resources are byte-identical in this revision (reported as a run
 * note, never as a check), so a contribution's text cannot say which slot produced it: the slot a
 * run carried is asserted from the persisted framework identity (`codebase-tools:init` /
 * `codebase-tools:reminder`) in the order the runs appended them, and the outbound request is
 * asserted to carry one message per contribution the branch holds, each appended after that
 * turn's own user message.
 *
 * What it cannot assert here (recorded, not silently skipped):
 *   - the framework's agent attribution is not expressible on pi: pi's `before_agent_start`
 *     result carries `customType`, `content`, `display` and `details` only, so this smoke
 *     asserts the hidden, persisted, framework-identified contribution and does not assert
 *     attribution;
 *   - the TUI drawing of the marker area and of the hidden contribution stays human-led. Over
 *     RPC this smoke observes the `setWidget` and `notify` extension-UI frames the real adapter
 *     published — the automated face of both surfaces.
 *
 * The expected prompt texts are read from the extension's own `.md` resources as text; this
 * script never imports the shared prompt module (whose Markdown imports a real Node jiti run
 * cannot resolve, and whose wiring the pi adapter under test owns).
 */
import type { PipedSubprocess } from "bun";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { startCaptureServer } from "../tests/harness-dock/capture-server";
import type { CaptureServer, CapturedRequest } from "../tests/harness-dock/capture-server";
import { buildSessionEnv } from "../tests/harness-dock/env";
import { createRunRoot } from "../tests/harness-dock/run-root";
import type { RunRoot } from "../tests/harness-dock/run-root";
import { readSessionLog } from "../tests/harness-dock/session-log";
import type { SessionEntry, SessionLog } from "../tests/harness-dock/session-log";

/** The repository root: this script lives in `scripts/`. */
const REPO_ROOT = path.resolve(import.meta.dir, "..");

/** The pi assembly the discovery entrypoint re-exports; the only extension this smoke loads. */
const ENTRYPOINT = path.join(REPO_ROOT, "entrypoints", "pi", "codebase-tools.ts");
/** The prompt resources, read as text and used as the expected content. */
const PROMPT_DIR = path.join(REPO_ROOT, "extensions", "codebase-tools", "shared-logic", "prompts");
const INIT_PROMPT = readFileSync(path.join(PROMPT_DIR, "init.md"), "utf8");
const REMINDER_PROMPT = readFileSync(path.join(PROMPT_DIR, "reminder.md"), "utf8");

/** The framework-fixed identities this extension's behavior is declared with. */
const COMMAND = "codebase-tools";
const INIT_IDENTITY = `${COMMAND}:init`;
const REMINDER_IDENTITY = `${COMMAND}:reminder`;
const STATE_ENTRY_TYPE = `${COMMAND}:state`;
/** The framework's one marker area, its placement, and the extension's declared marker text. */
const MARKER_AREA_KEY = "semantic-extensions";
const MARKER_PLACEMENT = "aboveEditor";
const MARKER_TEXT = "◈ codeBaseTools";
/** The feedback texts the framework derives from the extension's declared display name. */
const ENABLED_NOTICE = "codeBaseTools enabled";
const DISABLED_NOTICE = "codeBaseTools disabled";

/** The capture endpoint's declared provider: a dummy key, a local base URL, no real credential. */
const PROVIDER = "pi-smoke-gateway";
const MODEL = "pi-smoke-model";
const MODEL_SELECTOR = `${PROVIDER}/${MODEL}`;
const DUMMY_API_KEY = "pi-smoke-key";

/** The version this smoke's expectations were written against. */
const EXPECTED_PI_VERSION = "1.2.0";

/** How one prompt may take to reach its settle, and how long the child may take to exit and to answer a command. */
const PROMPT_TIMEOUT_MS = 90_000;
const COMMAND_TIMEOUT_MS = 60_000;
const STOP_TIMEOUT_MS = 20_000;
/** How long a just-issued command's UI frame may take to arrive before it counts as absent. */
const UI_FRAME_TIMEOUT_MS = 5_000;
const FRAME_TAIL = 25;

// ---------------------------------------------------------------------------
// Observations
// ---------------------------------------------------------------------------

interface Observation {
	readonly name: string;
	readonly detail: string;
}

const observations: Observation[] = [];

/** One failed check: the run stops here, because the states the later phases build on are unknown. */
class SmokeFailure extends Error {
	readonly detail: string;

	constructor(name: string, detail: string) {
		super(`check failed: ${name}\n  ${detail}`);
		this.name = "SmokeFailure";
		this.detail = detail;
	}
}

function observe(name: string, ok: boolean, detail: string): void {
	if (!ok) throw new SmokeFailure(name, detail);
	observations.push({ name, detail });
	console.log(`  ok    ${name}`);
}

// ---------------------------------------------------------------------------
// Reading external JSON: every read is checked by `in`, never asserted inline
// ---------------------------------------------------------------------------

/**
 * One field of an unknown value, when the value is a non-null object that carries it.
 *
 * Every value this smoke reads is external JSON (an RPC frame, a captured request body, a
 * persisted session entry), so nothing is trusted to a cast at the access site: the shape is
 * established by `typeof` and `in` here, and the one narrowing cast stays inside this function.
 */
function fieldOf(value: unknown, key: string): unknown {
	if (value === null || typeof value !== "object" || !(key in value)) return undefined;
	return (value as Record<string, unknown>)[key];
}

/** The plain text of one provider message's content, whichever shape it carries. */
function messageText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map(part => {
			const text = fieldOf(part, "text");
			return typeof text === "string" ? text : "";
		})
		.join("");
}

function messageContent(message: unknown): string {
	return messageText(fieldOf(message, "content"));
}

function messageRole(message: unknown): string {
	const role = fieldOf(message, "role");
	return typeof role === "string" ? role : "<no role>";
}

/** Whether a message's text is one of the extension's two prompt resources. */
function isContributionText(text: string): boolean {
	return text === INIT_PROMPT || text === REMINDER_PROMPT;
}

function providerMessages(request: CapturedRequest): readonly unknown[] {
	const messages = fieldOf(request.json, "messages");
	return Array.isArray(messages) ? messages : [];
}

/** How many messages of one request carry either injected slot's text. */
function contributions(request: CapturedRequest): number {
	return providerMessages(request).filter(message => isContributionText(messageContent(message))).length;
}

function lastMessageText(request: CapturedRequest): string {
	const messages = providerMessages(request);
	return messageContent(messages[messages.length - 1]);
}

/** The tool names one request asked the provider to expose. */
function toolNames(request: CapturedRequest): string[] {
	const tools = fieldOf(request.json, "tools");
	if (!Array.isArray(tools)) return [];
	return tools
		.map(tool => {
			const name = fieldOf(fieldOf(tool, "function"), "name");
			return typeof name === "string" ? name : "";
		})
		.sort();
}

/** One request's messages, as a readable list, for failure details. */
function describeMessages(request: CapturedRequest): string {
	const messages = providerMessages(request);
	if (messages.length === 0) return "<no messages>";
	return messages
		.map((message, index) => `${index + 1}. ${messageRole(message)}: ${JSON.stringify(messageContent(message).slice(0, 80))}`)
		.join("; ");
}

/** How the later request departs from the earlier request's messages standing unchanged ahead of it. */
function prefixViolation(earlier: CapturedRequest, later: CapturedRequest): string | undefined {
	const before = providerMessages(earlier).map(message => `${messageRole(message)}:${messageContent(message)}`);
	const after = providerMessages(later).map(message => `${messageRole(message)}:${messageContent(message)}`);
	if (before.length > after.length) {
		return `the earlier request carried ${before.length} message(s) and the later one only ${after.length}`;
	}
	const changed = before.findIndex((text, index) => text !== after[index]);
	return changed === -1
		? undefined
		: `message ${changed + 1} changed from ${JSON.stringify(before[changed].slice(0, 120))} to ${JSON.stringify(after[changed].slice(0, 120))}`;
}

// ---------------------------------------------------------------------------
// Reading the session journal
// ---------------------------------------------------------------------------

function customMessagesOf(log: SessionLog, customType: string): Array<Record<string, unknown>> {
	return log.entries.filter(
		(entry): entry is SessionEntry & Record<string, unknown> =>
			entry.type === "custom_message" && entry.customType === customType,
	);
}

/**
 * The slot identities one journal's contributions carry, in journal order.
 *
 * The two prompt resources are byte-identical, so a contribution's text cannot say which slot
 * produced it; the framework-fixed `customType` is what can, and the order of these identities
 * is the order the runs appended them. Every session here has linear history, so the journal's
 * slot entries are the branch's.
 */
function contributionIdentities(log: SessionLog): string[] {
	return log.entries
		.filter(
			(entry): entry is SessionEntry & { readonly customType: string } =>
				entry.type === "custom_message" &&
				(entry.customType === INIT_IDENTITY || entry.customType === REMINDER_IDENTITY),
		)
		.map(entry => entry.customType);
}

/** Every entry this extension owns, whatever slot or record it is. */
function extensionEntries(log: SessionLog): SessionEntry[] {
	return log.entries.filter(entry => typeof entry.customType === "string" && entry.customType.startsWith(`${COMMAND}:`));
}

/** The State payloads one journal records, in journal order. */
function statePayloads(log: SessionLog): unknown[] {
	return log.entries
		.filter(
			(entry): entry is SessionEntry & Record<string, unknown> =>
				entry.type === "custom" && entry.customType === STATE_ENTRY_TYPE,
		)
		.map(entry => entry.data);
}

/** How the later journal departs from `before` standing unchanged, in order, inside it. */
function appendOnlyViolation(before: readonly SessionEntry[], after: readonly SessionEntry[]): string | undefined {
	const ids = after.map(entry => entry.id);
	let cursor = 0;
	for (const entry of before) {
		const id = entry.id;
		if (typeof id !== "string") continue;
		const position = ids.indexOf(id, cursor);
		if (position === -1) return `journal entry ${id} (${String(entry.type)}) is missing from the later journal`;
		if (JSON.stringify(after[position]) !== JSON.stringify(entry)) {
			return `journal entry ${id} (${String(entry.type)}) was rewritten: ${JSON.stringify(entry).slice(0, 160)} -> ${JSON.stringify(after[position]).slice(0, 160)}`;
		}
		cursor = position + 1;
	}
	return undefined;
}

/** Whether a marker-area frame's lines carry the extension's marker text. */
function areaShows(frame: RpcFrame): boolean {
	const lines = frame.widgetLines;
	return Array.isArray(lines) && lines.some(line => String(line).includes(MARKER_TEXT));
}

/** How many contributions one journal recorded after `mark`, so a disabled run can be shown to add none. */
function contributionsAfter(log: SessionLog, mark: number): number {
	return log.entries
		.slice(mark)
		.filter(entry => entry.type === "custom_message" && typeof entry.customType === "string" && entry.customType.startsWith(`${COMMAND}:`))
		.length;
}

function requestAt(run: SmokeRun, index: number): CapturedRequest {
	const requests = run.capture.requests();
	// Annotated, not merely indexed: an index can be past the end, and this build's
	// compiler does not say so unless the possibility is written down.
	const request: CapturedRequest | undefined = requests[index];
	if (request === undefined) {
		throw new Error(`the run captured ${requests.length} provider request(s); request ${index + 1} is missing`);
	}
	return request;
}

// ---------------------------------------------------------------------------
// The pi CLI under test
// ---------------------------------------------------------------------------

interface PiCli {
	/** The full argv prefix that runs the CLI (a node script, or the binary itself). */
	readonly command: readonly string[];
	/** The script or binary the operator recognizes. */
	readonly path: string;
	/** How this path was found, for the run's own report. */
	readonly source: string;
}

/** The node that runs the CLI script; `PI_NODE` overrides it for a non-PATH installation. */
const NODE_EXECUTABLE = process.env.PI_NODE ?? "node";

/** The bundle a `.cmd`/`.bat` shim launches: the npm prefix layout, or the path the shim names. */
function bundleBehindShim(shim: string): string | undefined {
	const dir = path.dirname(shim);
	const beside = path.join(dir, "node_modules", "@earendil-works", "pi-coding-agent", "dist", "bundle", "cli.js");
	if (existsSync(beside)) return beside;
	const named = /([^\s"']*cli\.js)/i.exec(readFileSync(shim, "utf8"))?.[1];
	if (named === undefined) return undefined;
	const relative = named.replace(/^%?dp0%?[\\/]/i, "").replace(/^\$basedir[\\/]/i, "");
	const resolved = path.resolve(dir, relative);
	return existsSync(resolved) ? resolved : undefined;
}

/** One candidate path, as the argv prefix that runs it — or `undefined` when it is not a pi CLI. */
function lookupPiCli(candidate: string): PiCli | undefined {
	if (!existsSync(candidate)) return undefined;
	const extension = path.extname(candidate).toLowerCase();
	if (extension === ".js" || extension === ".mjs" || extension === ".cjs") {
		return { command: [NODE_EXECUTABLE, candidate], path: candidate, source: "node script" };
	}
	if (extension === ".cmd" || extension === ".bat") {
		const bundle = bundleBehindShim(candidate);
		if (bundle === undefined) return undefined;
		return {
			command: [NODE_EXECUTABLE, bundle],
			path: bundle,
			source: `the shim ${candidate} (run through node: a shell shim cannot be spawned without a shell)`,
		};
	}
	if (extension === ".exe") return { command: [candidate], path: candidate, source: "native binary" };
	return undefined;
}

/** What `where <name>` / `which <name>` reports, preferring an entry that runs without a shell. */
function shellLookupCli(name: string): readonly string[] {
	const keyword = process.platform === "win32" ? "where" : "which";
	const result = Bun.spawnSync([keyword, name], { stdout: "pipe", stderr: "pipe" });
	if (result.exitCode !== 0) return [];
	return result.stdout
		.toString()
		.split(/\r?\n/)
		.map(line => line.trim())
		.filter(line => line.length > 0)
		.sort((left, right) => executableRank(left) - executableRank(right));
}

/** Executable CLI scripts first, then a shim, then anything else. */
function executableRank(candidate: string): number {
	const extension = path.extname(candidate).toLowerCase();
	if (extension === ".js" || extension === ".mjs" || extension === ".cjs") return 0;
	if (extension === ".cmd" || extension === ".bat" || extension === ".exe") return 1;
	return 2;
}

/** The CLI one name resolves to: an existing file as itself, otherwise a PATH lookup of that name. */
function resolveNamedCli(name: string): PiCli | undefined {
	const direct = lookupPiCli(name);
	if (direct !== undefined) return direct;
	for (const candidate of shellLookupCli(name)) {
		const fromPath = lookupPiCli(candidate);
		if (fromPath !== undefined) return fromPath;
	}
	return undefined;
}

function resolvePiCli(explicit: string | undefined): PiCli {
	const named = explicit?.trim() ?? process.env.PI_CLI?.trim();
	if (named !== undefined && named.length > 0) {
		const resolved = resolveNamedCli(named);
		if (resolved !== undefined) return resolved;
		throw new Error(`--pi/PI_CLI names ${named}, and no pi CLI could be resolved from it`);
	}
	const fromPath = resolveNamedCli("pi");
	if (fromPath !== undefined) return fromPath;
	const besideNode = path.join(
		path.dirname(process.execPath),
		"node_modules",
		"@earendil-works",
		"pi-coding-agent",
		"dist",
		"bundle",
		"cli.js",
	);
	const beside = lookupPiCli(besideNode);
	if (beside !== undefined) return beside;
	throw new Error(
		`no pi CLI found: set PI_CLI (or --pi) to the installed CLI (its dist/bundle/cli.js, its pi.cmd/pi shim, or the binary). Checked: --pi/PI_CLI, "${process.platform === "win32" ? "where" : "which"} pi", and ${besideNode}`,
	);
}

/** The version the CLI itself reports, so the run names the artifact it exercised. */
async function piVersion(cli: PiCli): Promise<string> {
	const child = Bun.spawn([...cli.command, "--version"], { stdout: "pipe", stderr: "pipe" });
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	const reported = stdout.trim() || stderr.trim();
	if (exitCode !== 0 || reported.length === 0) {
		throw new Error(`could not read the pi version from ${cli.path}: exit ${exitCode}, output: ${reported || "<empty>"}`);
	}
	return reported.split("\n")[0].trim();
}

// ---------------------------------------------------------------------------
// Runs: one isolated root, one capture endpoint, one agent state
// ---------------------------------------------------------------------------

interface SmokeRun {
	readonly root: RunRoot;
	readonly capture: CaptureServer;
	readonly cli: PiCli;
}

const runs: SmokeRun[] = [];
const sessions: PiSession[] = [];

/**
 * The run's own `models.json`: the capture endpoint declared as an OpenAI-compatible provider.
 *
 * This is the harness's documented "configure a compatible endpoint" path, and it keeps the loaded
 * extension set exactly the entrypoint under test (no provider fixture extension).
 */
function writeProviderConfig(runRoot: RunRoot, baseUrl: string): void {
	const config = {
		$schema: "https://pi.dev/schemas/models.schema.json",
		providers: {
			[PROVIDER]: {
				baseUrl,
				api: "openai-completions",
				apiKey: DUMMY_API_KEY,
				models: [
					{
						id: MODEL,
						name: "pi smoke capture",
						reasoning: false,
						input: ["text"],
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
						contextWindow: 128_000,
						maxTokens: 8192,
					},
				],
			},
		},
	};
	writeFileSync(path.join(runRoot.agentDir, "models.json"), `${JSON.stringify(config, null, 2)}\n`);
}

function startRun(cli: PiCli, label: string): SmokeRun {
	const root = createRunRoot(label);
	const capture = startCaptureServer({ dir: root.captureDir });
	writeProviderConfig(root, capture.baseUrl);
	const run: SmokeRun = { root, capture, cli };
	runs.push(run);
	return run;
}

async function openSession(run: SmokeRun, extraArgs: readonly string[] = []): Promise<PiSession> {
	const session = await PiSession.start({
		cli: run.cli,
		runRoot: run.root,
		entrypoint: ENTRYPOINT,
		extraArgs,
	});
	sessions.push(session);
	return session;
}

// ---------------------------------------------------------------------------
// The RPC driver: pi's own JSONL protocol over stdin/stdout
// ---------------------------------------------------------------------------

interface RpcFrame {
	readonly type?: string;
	readonly [key: string]: unknown;
}

interface SessionOptions {
	readonly cli: PiCli;
	readonly runRoot: RunRoot;
	/** The one extension path (`-e`) this session loads. */
	readonly entrypoint: string;
	readonly extraArgs?: readonly string[];
}

interface ExitOutcome {
	readonly exitCode: number | null;
	readonly stderr: string;
	readonly timedOut: boolean;
}

interface FrameWaiter {
	readonly predicate: (frame: RpcFrame) => boolean;
	readonly settle: (frame: RpcFrame) => void;
	readonly timer: ReturnType<typeof setTimeout>;
}

class PiSessionError extends Error {
	readonly diagnostics: string;

	constructor(message: string, diagnostics: string) {
		super(`${message}\n--- session diagnostics ---\n${diagnostics}`);
		this.name = "PiSessionError";
		this.diagnostics = diagnostics;
	}
}

/**
 * One pi process in RPC mode.
 *
 * The driver is deliberately small: start with the explicit-only extension set, send a prompt or
 * a command, wait for the run it started to settle, read one session's JSONL back, watch the
 * extension-UI frames, and close stdin for an orderly exit. A failure carries the raw material
 * needed to diagnose it: argv, run root, child stderr and the tail of the frame stream.
 */
class PiSession {
	readonly argv: readonly string[];
	readonly env: Record<string, string>;

	readonly #child: PipedSubprocess;
	readonly #runRoot: RunRoot;
	readonly #frames: RpcFrame[] = [];
	readonly #waiters: FrameWaiter[] = [];
	#stderrText = "";
	#commandCounter = 0;
	#exit: ExitOutcome | null = null;
	readonly #stderrPump: Promise<void>;

	private constructor(child: PipedSubprocess, argv: readonly string[], env: Record<string, string>, runRoot: RunRoot) {
		this.#child = child;
		this.argv = argv;
		this.env = env;
		this.#runRoot = runRoot;
		this.#stderrPump = this.#pump(child.stderr, line => {
			this.#stderrText += `${line}\n`;
		});
		void this.#pump(child.stdout, line => this.#acceptFrame(line));
	}

	static async start(options: SessionOptions): Promise<PiSession> {
		const { runRoot } = options;
		const argv = [
			...options.cli.command,
			"--mode",
			"rpc",
			"--no-extensions",
			"-e",
			options.entrypoint,
			"--no-mcp",
			"--model",
			MODEL_SELECTOR,
			"--session-dir",
			runRoot.sessionDir,
			...(options.extraArgs ?? []),
		];
		const env = buildSessionEnv(process.env, {
			agentDir: runRoot.agentDir,
			extra: {
				PI_OFFLINE: "1",
				PI_SKIP_VERSION_CHECK: "1",
				PI_TELEMETRY: "0",
			},
		});
		const child = Bun.spawn([...argv], {
			cwd: runRoot.workDir,
			env,
			stdin: "pipe",
			stdout: "pipe",
			stderr: "pipe",
		});
		const session = new PiSession(child, argv, env, runRoot);
		// pi's RPC mode publishes no readiness frame, so the handshake is a real command: a
		// successful answer proves the session booted, and an early crash surfaces as the child's
		// own exit instead of a long wait for a response that cannot come. A child that never
		// answers is killed here, because a caller that receives no session cannot stop one.
		const booted: "answered" | number | Error = await Promise.race([
			session
				.request({ type: "get_state" }, COMMAND_TIMEOUT_MS)
				.then(
					() => "answered" as const,
					(error: unknown) => (error instanceof Error ? error : new Error(String(error))),
				),
			child.exited.then(code => (typeof code === "number" ? code : -1)),
		]);
		if (booted === "answered") return session;
		const diagnostics = session.diagnostics();
		child.kill();
		throw new PiSessionError(
			typeof booted === "number"
				? `pi exited with code ${booted} before it answered the first command`
				: `pi did not answer the first command: ${booted.message}`,
			diagnostics,
		);
	}

	running(): boolean {
		return this.#exit === null;
	}

	diagnostics(): string {
		return [
			`argv: ${this.argv.join(" ")}`,
			`run root: ${this.#runRoot.path}`,
			`agent state: ${this.#runRoot.agentDir}`,
			`exit: ${this.#exit ? `${String(this.#exit.exitCode)}${this.#exit.timedOut ? " (killed after timeout)" : ""}` : "<still running>"}`,
			`stderr:\n${this.#stderrText.trim() || "<empty>"}`,
			`last ${FRAME_TAIL} frames:\n${this.#frames
				.slice(-FRAME_TAIL)
				.map(frame => JSON.stringify(frame).slice(0, 500))
				.join("\n")}`,
		].join("\n");
	}

	/** Send one command and wait for the correlated response; a refusal throws. */
	async request(command: { readonly type: string; readonly [key: string]: unknown }, timeoutMs: number): Promise<RpcFrame> {
		const id = `c${++this.#commandCounter}`;
		const answer = this.#waitForFrame(
			frame => frame.type === "response" && frame.id === id,
			`the response to ${command.type}`,
			timeoutMs,
		);
		this.#send({ ...command, id });
		const frame = await answer;
		if (frame.success !== true) {
			throw new PiSessionError(`pi refused ${command.type}: ${JSON.stringify(frame)}`, this.diagnostics());
		}
		return frame;
	}

	/** Send a prompt and, when it started a run, wait for that run to settle. */
	async run(text: string, timeoutMs: number = PROMPT_TIMEOUT_MS): Promise<string> {
		const settledBefore = this.#settledCount();
		const response = await this.request({ type: "prompt", message: text }, timeoutMs);
		const disposition = fieldOf(fieldOf(response, "data"), "disposition");
		const reported = typeof disposition === "string" ? disposition : "<missing>";
		if (reported !== "handled" && this.#settledCount() <= settledBefore) {
			await this.#waitForFrame(
				frame => frame.type === "agent_settled",
				`the run started by ${JSON.stringify(text.slice(0, 60))}`,
				timeoutMs,
			);
		}
		return reported;
	}

	/** The session file pi reports for the session it currently runs. */
	async sessionFile(): Promise<string> {
		const state = await this.request({ type: "get_state" }, COMMAND_TIMEOUT_MS);
		const file = fieldOf(fieldOf(state, "data"), "sessionFile");
		if (typeof file !== "string" || file.length === 0) {
			throw new PiSessionError(`pi reported no session file: ${JSON.stringify(state)}`, this.diagnostics());
		}
		return file;
	}

	/** One session's JSONL, read back through the dock's shared reader. */
	journal(file: string): SessionLog {
		if (!existsSync(file)) {
			throw new PiSessionError(
				`the journal ${file} does not exist: pi writes a session file lazily, so a turn must have run first`,
				this.diagnostics(),
			);
		}
		return readSessionLog(this.#runRoot.sessionDir, file);
	}

	/** The messages pi announced on the extension feedback channel since `mark`, in arrival order. */
	notificationsSince(mark: number): string[] {
		return this.#frames
			.slice(mark)
			.filter(frame => frame.type === "extension_ui_request" && frame.method === "notify")
			.map(frame => String(frame.message));
	}

	/** The renderings the framework's marker area published for this process, in arrival order. */
	markerLayerFrames(): RpcFrame[] {
		return this.#frames.filter(
			frame => frame.type === "extension_ui_request" && frame.method === "setWidget" && frame.widgetKey === MARKER_AREA_KEY,
		);
	}

	/** Where the frame stream stood; a mark taken before a command isolates that command's frames. */
	frameMark(): number {
		return this.#frames.length;
	}

	/** The first frame at or after `mark` that matches, or `undefined` when none arrives in time. */
	async frameSince(
		mark: number,
		predicate: (frame: RpcFrame) => boolean,
		label: string,
		timeoutMs: number,
	): Promise<RpcFrame | undefined> {
		const existing = this.#frames.slice(mark).find(predicate);
		if (existing !== undefined) return existing;
		try {
			return await this.#waitForFrame(predicate, label, timeoutMs);
		} catch {
			return undefined;
		}
	}

	/** Close stdin and wait for an orderly exit; kill only when the child hangs. */
	async stop(options?: { readonly timeoutMs?: number }): Promise<ExitOutcome> {
		if (this.#exit) return this.#exit;
		const timeoutMs = options?.timeoutMs ?? STOP_TIMEOUT_MS;
		this.#child.stdin.end();
		const outcome = await Promise.race([this.#child.exited, Bun.sleep(timeoutMs).then(() => "timeout" as const)]);
		if (outcome === "timeout") this.#child.kill();
		const exitCode = outcome === "timeout" ? await this.#child.exited : outcome;
		await Promise.race([this.#stderrPump, Bun.sleep(1_000)]);
		this.#exit = { exitCode, stderr: this.#stderrText, timedOut: outcome === "timeout" };
		return this.#exit;
	}

	#settledCount(): number {
		return this.#frames.filter(frame => frame.type === "agent_settled").length;
	}

	#send(frame: Record<string, unknown>): void {
		this.#child.stdin.write(`${JSON.stringify(frame)}\n`);
		this.#child.stdin.flush();
	}

	#waitForFrame(predicate: (frame: RpcFrame) => boolean, label: string, timeoutMs: number): Promise<RpcFrame> {
		return new Promise<RpcFrame>((resolve, reject) => {
			const waiter: FrameWaiter = {
				predicate,
				settle: frame => {
					clearTimeout(waiter.timer);
					resolve(frame);
				},
				timer: setTimeout(() => {
					const index = this.#waiters.indexOf(waiter);
					if (index >= 0) this.#waiters.splice(index, 1);
					reject(new PiSessionError(`timed out after ${timeoutMs}ms waiting for ${label}`, this.diagnostics()));
				}, timeoutMs),
			};
			this.#waiters.push(waiter);
		});
	}

	#acceptFrame(line: string): void {
		let frame: RpcFrame;
		try {
			frame = JSON.parse(line) as RpcFrame;
		} catch {
			frame = { type: "<unparsable>", raw: line };
		}
		this.#frames.push(frame);
		for (const waiter of [...this.#waiters]) {
			if (!waiter.predicate(frame)) continue;
			this.#waiters.splice(this.#waiters.indexOf(waiter), 1);
			waiter.settle(frame);
		}
	}

	async #pump(stream: ReadableStream<Uint8Array>, onLine: (line: string) => void): Promise<void> {
		const reader = stream.getReader();
		const decoder = new TextDecoder();
		let buffer = "";
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			let newlineIndex: number;
			while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
				const line = buffer.slice(0, newlineIndex);
				buffer = buffer.slice(newlineIndex + 1);
				if (line.trim().length > 0) onLine(line);
			}
		}
		if (buffer.trim().length > 0) onLine(buffer);
	}
}

// ---------------------------------------------------------------------------
// Phase 1: default off, the command, the init, the reminder, the disable
// ---------------------------------------------------------------------------

async function phaseToggleAndContributions(cli: PiCli): Promise<void> {
	console.log("\nphase: a session that never toggles is off, and the toggle drives the slots");
	const run = startRun(cli, "toggle-contributions");
	const session = await openSession(run);
	const offTurnText = "codebase-tools smoke off turn";

	const offDisposition = await session.run(offTurnText);
	observe(
		"a plain turn starts a run",
		offDisposition === "started",
		`pi reported disposition ${JSON.stringify(offDisposition)}`,
	);
	const offRequest = requestAt(run, 0);
	observe(
		"an untouched session contributes nothing: the request carries the user's turn alone",
		contributions(offRequest) === 0 &&
			providerMessages(offRequest).filter(message => messageRole(message) === "user").length === 1 &&
			lastMessageText(offRequest) === offTurnText,
		`the request carried ${contributions(offRequest)} contribution(s), ending with ${JSON.stringify(lastMessageText(offRequest).slice(0, 60))}: ${describeMessages(offRequest)}`,
	);
	const offJournal = session.journal(await session.sessionFile());
	observe(
		"an untouched session records no codebase-tools entry",
		extensionEntries(offJournal).length === 0,
		`the journal carries ${extensionEntries(offJournal).map(entry => String(entry.customType)).join(", ") || "no codebase-tools entry"}`,
	);
	// Every frame of the session, not a window: an announcement about a value the
	// extension never had is what this check is about, and an unrelated diagnostic is not.
	const offAnnouncements = session.notificationsSince(0);
	observe(
		"an untouched session announces no activation",
		offAnnouncements.every(message => message !== ENABLED_NOTICE && message !== DISABLED_NOTICE),
		`pi announced ${JSON.stringify(offAnnouncements)}`,
	);
	const areaFrames = session.markerLayerFrames();
	const offArea: RpcFrame | undefined = areaFrames[areaFrames.length - 1];
	observe(
		"the framework published its marker area without this extension's line",
		offArea !== undefined && !areaShows(offArea),
		offArea === undefined
			? "no setWidget frame for the framework's marker area was published at all"
			: `the newest area frame carried ${JSON.stringify(offArea.widgetLines)}`,
	);

	const enableMark = session.frameMark();
	const enable = await session.run(`/${COMMAND}`, COMMAND_TIMEOUT_MS);
	observe(
		"the command runs without invoking the model and announces the value it produced",
		enable === "handled" && JSON.stringify(session.notificationsSince(enableMark)) === JSON.stringify([ENABLED_NOTICE]),
		`pi reported disposition ${JSON.stringify(enable)} and announced ${JSON.stringify(session.notificationsSince(enableMark))}, expected ${JSON.stringify([ENABLED_NOTICE])}`,
	);
	const shownArea = await session.frameSince(
		enableMark,
		areaShows,
		"the marker area showing the extension's line",
		UI_FRAME_TIMEOUT_MS,
	);
	observe(
		"enabling shows the extension's marker line in the framework's area",
		shownArea !== undefined && shownArea.widgetPlacement === MARKER_PLACEMENT,
		shownArea === undefined
			? `no marker-area frame carried ${JSON.stringify(MARKER_TEXT)}: the area frames were ${JSON.stringify(session.markerLayerFrames().map(frame => frame.widgetLines))}`
			: `the showing frame placed the area at ${JSON.stringify(shownArea.widgetPlacement)}, expected ${JSON.stringify(MARKER_PLACEMENT)}`,
	);

	const initTurnText = "codebase-tools smoke init turn";
	await session.run(initTurnText);
	const initRequest = requestAt(run, 1);
	observe(
		"the first enabled run's request carries exactly one injected message",
		contributions(initRequest) === 1,
		`the request carried ${contributions(initRequest)} injected message(s): ${describeMessages(initRequest)}`,
	);
	observe(
		"the contribution is appended after the turn's own user message, at the tail of the request",
		isContributionText(lastMessageText(initRequest)) &&
			messageContent(providerMessages(initRequest)[providerMessages(initRequest).length - 2]) === initTurnText,
		`the request's tail was ${describeMessages(initRequest)}`,
	);
	observe(
		"enabling injects a prompt and nothing else: the request's tool set is unchanged",
		JSON.stringify(toolNames(initRequest)) === JSON.stringify(toolNames(offRequest)),
		`the tools were ${JSON.stringify(toolNames(offRequest))} before enabling and ${JSON.stringify(toolNames(initRequest))} after`,
	);

	const initJournal = session.journal(await session.sessionFile());
	const initEntries = customMessagesOf(initJournal, INIT_IDENTITY);
	// `?? {}` rather than `[0]`: an index read is a possibility, not a promise, and every
	// check below has to survive the empty journal with its own detail instead of a TypeError.
	const initEntry = initEntries[0] ?? {};
	const userEntry = initJournal.entries.find(
		entry =>
			entry.type === "message" &&
			messageRole(entry.message) === "user" &&
			messageContent(entry.message) === initTurnText,
	);
	observe(
		"exactly one hidden contribution is persisted, as the init slot and nothing else",
		initEntries.length === 1 &&
			initEntry.content === INIT_PROMPT &&
			initEntry.display === false &&
			JSON.stringify(contributionIdentities(initJournal)) === JSON.stringify([INIT_IDENTITY]),
		`the journal holds ${initEntries.length} ${INIT_IDENTITY} entry/entries with display ${JSON.stringify(initEntry.display)}, and its slot identities were ${JSON.stringify(contributionIdentities(initJournal))}`,
	);
	observe(
		"the persisted init hangs off the turn's own user message, so it is hidden yet reaches the model",
		userEntry !== undefined &&
			initEntry.parentId === userEntry.id &&
			initJournal.entries.indexOf(initEntry) > initJournal.entries.indexOf(userEntry),
		userEntry === undefined
			? `no user entry carried ${JSON.stringify(initTurnText)}`
			: `the init's parent was ${JSON.stringify(initEntry.parentId)} and the user entry's id ${JSON.stringify(userEntry.id)}`,
	);
	observe(
		"the toggle's own record is the only State the session wrote, and it is the value the toggle produced",
		JSON.stringify(statePayloads(initJournal)) === JSON.stringify([{ enabled: true }]),
		`the journal's ${STATE_ENTRY_TYPE} payloads were ${JSON.stringify(statePayloads(initJournal))}`,
	);
	observe(
		"no separate progress flag is persisted: the branch's own content is the init's progress",
		!JSON.stringify(initJournal.entries).includes("initInjected"),
		"the journal carries an initInjected field, so progress is recorded beside the slot instead of as the slot",
	);

	const reminderTurnText = "codebase-tools smoke reminder turn";
	await session.run(reminderTurnText);
	const reminderRequest = requestAt(run, 2);
	observe(
		"a later enabled run adds exactly one contribution, the branch's earlier one replayed",
		contributions(reminderRequest) === contributions(initRequest) + 1,
		`the request carried ${contributions(reminderRequest)} injected message(s) after the earlier run's ${contributions(initRequest)}: ${describeMessages(reminderRequest)}`,
	);
	observe(
		"the later run appends its contribution after its own user message, at the tail of the request",
		lastMessageText(reminderRequest) === REMINDER_PROMPT,
		`the request's tail was ${describeMessages(reminderRequest)}`,
	);
	const reordered = prefixViolation(initRequest, reminderRequest);
	observe(
		"the earlier request's messages are an unchanged prefix of the later request's",
		reordered === undefined,
		`${reordered}; earlier: ${describeMessages(initRequest)}; later: ${describeMessages(reminderRequest)}`,
	);

	const reminderJournal = session.journal(await session.sessionFile());
	const reminderInitEntries = customMessagesOf(reminderJournal, INIT_IDENTITY);
	observe(
		"the later run's contribution is the reminder slot, and the init is not re-injected",
		JSON.stringify(contributionIdentities(reminderJournal)) === JSON.stringify([INIT_IDENTITY, REMINDER_IDENTITY]) &&
			JSON.stringify(reminderInitEntries[0] ?? {}) === JSON.stringify(initEntry),
		`the journal's slot identities were ${JSON.stringify(contributionIdentities(reminderJournal))}, holding ${reminderInitEntries.length} init(s)`,
	);
	const enabledRewrite = appendOnlyViolation(initJournal.entries, reminderJournal.entries);
	observe(
		"the enabled period only appended: every earlier journal entry survives unchanged, in order",
		enabledRewrite === undefined,
		enabledRewrite ?? "the earlier entries stand unchanged and in order",
	);

	const disableMark = session.frameMark();
	const disable = await session.run(`/${COMMAND}`, COMMAND_TIMEOUT_MS);
	observe(
		"the command disables it too, without invoking the model",
		disable === "handled" &&
			JSON.stringify(session.notificationsSince(disableMark)) === JSON.stringify([DISABLED_NOTICE]),
		`the command reported ${JSON.stringify(disable)} and announced ${JSON.stringify(session.notificationsSince(disableMark))}`,
	);
	const clearedArea = await session.frameSince(
		disableMark,
		frame => !areaShows(frame),
		"the marker area cleared",
		UI_FRAME_TIMEOUT_MS,
	);
	observe(
		"disabling clears the framework's marker area",
		clearedArea !== undefined &&
			(clearedArea.widgetLines === undefined ||
				(Array.isArray(clearedArea.widgetLines) && clearedArea.widgetLines.length === 0)),
		clearedArea === undefined
			? "no marker-area frame was published after the disabling command"
			: `the clearing frame carried ${JSON.stringify(clearedArea.widgetLines)}`,
	);

	const beforeDisabled = reminderJournal.entries.length;
	const disabledTurnText = "codebase-tools smoke disabled turn";
	await session.run(disabledTurnText);
	const disabledRequest = requestAt(run, 3);
	observe(
		"a disabled run adds no contribution of its own",
		contributions(disabledRequest) === contributions(reminderRequest) &&
			lastMessageText(disabledRequest) === disabledTurnText,
		`the request carried ${contributions(disabledRequest)} injected message(s) after the enabled period's ${contributions(reminderRequest)}, ending with ${JSON.stringify(lastMessageText(disabledRequest).slice(0, 60))}: ${describeMessages(disabledRequest)}`,
	);
	const disabledJournal = session.journal(await session.sessionFile());
	observe(
		"the records the enabled period left are still there, and the disable added no contribution",
		customMessagesOf(disabledJournal, INIT_IDENTITY).length === 1 &&
			customMessagesOf(disabledJournal, REMINDER_IDENTITY).length === 1 &&
			contributionsAfter(disabledJournal, beforeDisabled) === 0,
		`the journal holds ${customMessagesOf(disabledJournal, INIT_IDENTITY).length} init(s), ${customMessagesOf(disabledJournal, REMINDER_IDENTITY).length} reminder(s) and ${contributionsAfter(disabledJournal, beforeDisabled)} contribution(s) after the disable`,
	);
	const disabledRewrite = appendOnlyViolation(reminderJournal.entries, disabledJournal.entries);
	observe(
		"disabling only appended to the journal",
		disabledRewrite === undefined,
		disabledRewrite ?? "the earlier entries stand unchanged and in order",
	);
	observe(
		"each toggle recorded the value it produced, in run order",
		JSON.stringify(statePayloads(disabledJournal)) === JSON.stringify([{ enabled: true }, { enabled: false }]),
		`the journal's ${STATE_ENTRY_TYPE} payloads were ${JSON.stringify(statePayloads(disabledJournal))}`,
	);

	const exit = await session.stop();
	observe(
		"the session exits cleanly when its input closes",
		exit.exitCode === 0 && !exit.timedOut,
		`the child exited ${String(exit.exitCode)}${exit.timedOut ? " (killed after the stop timeout)" : ""}, stderr: ${exit.stderr.trim() || "<empty>"}`,
	);
}

// ---------------------------------------------------------------------------
// Phase 2: a session created in place starts off
// ---------------------------------------------------------------------------

async function phaseNewSessionStartsOff(cli: PiCli): Promise<void> {
	console.log("\nphase: a session created in place starts off, and writes only its own state");
	const run = startRun(cli, "new-session");
	const session = await openSession(run);

	await session.run(`/${COMMAND}`, COMMAND_TIMEOUT_MS);
	await session.run("codebase-tools new-session first turn");
	const firstFile = await session.sessionFile();
	const firstJournal = session.journal(firstFile);
	observe(
		"the session that will be replaced really was enabled",
		customMessagesOf(firstJournal, INIT_IDENTITY).length === 1,
		`the first session's journal holds ${customMessagesOf(firstJournal, INIT_IDENTITY).length} init(s)`,
	);

	const created = await session.request({ type: "new_session" }, COMMAND_TIMEOUT_MS);
	observe(
		"pi created a new session in place",
		fieldOf(fieldOf(created, "data"), "cancelled") === false,
		`pi answered ${JSON.stringify(fieldOf(created, "data"))}`,
	);
	const secondFile = await session.sessionFile();
	observe(
		"the new session is a different session",
		secondFile !== firstFile,
		`pi reported the same file ${firstFile} for the session it replaced`,
	);

	const newSessionTurnText = "codebase-tools new-session default turn";
	const newSessionMark = session.frameMark();
	await session.run(newSessionTurnText);
	const newSessionRequest = requestAt(run, 1);
	const newSessionAnnouncements = session.notificationsSince(newSessionMark);
	observe(
		"the new session's first run carries no contribution and announces no activation",
		contributions(newSessionRequest) === 0 &&
			lastMessageText(newSessionRequest) === newSessionTurnText &&
			newSessionAnnouncements.every(message => message !== ENABLED_NOTICE && message !== DISABLED_NOTICE),
		`the request carried ${contributions(newSessionRequest)} contribution(s) and pi announced ${JSON.stringify(newSessionAnnouncements)}: ${describeMessages(newSessionRequest)}`,
	);
	const secondJournal = session.journal(secondFile);
	observe(
		"the new session's journal records nothing of the replaced session",
		extensionEntries(secondJournal).length === 0,
		`the new session's journal carries ${extensionEntries(secondJournal).map(entry => String(entry.customType)).join(", ") || "no codebase-tools entry"}`,
	);

	const toggleMark = session.frameMark();
	await session.run(`/${COMMAND}`, COMMAND_TIMEOUT_MS);
	observe(
		"the new session's toggle enables rather than disables: it held the default, not the replaced value",
		JSON.stringify(session.notificationsSince(toggleMark)) === JSON.stringify([ENABLED_NOTICE]),
		`the new session announced ${JSON.stringify(session.notificationsSince(toggleMark))}, expected ${JSON.stringify([ENABLED_NOTICE])}`,
	);
	const secondJournalAfter = session.journal(secondFile);
	observe(
		"the new session's own journal holds only what the new session wrote",
		JSON.stringify(statePayloads(secondJournalAfter)) === JSON.stringify([{ enabled: true }]),
		`the new session's journal carries ${JSON.stringify(statePayloads(secondJournalAfter))}`,
	);
	const replacedJournal = session.journal(firstFile);
	const replacedRewrite = appendOnlyViolation(firstJournal.entries, replacedJournal.entries);
	observe(
		"the replaced session's journal still holds its own records, unchanged and in order",
		replacedRewrite === undefined &&
			JSON.stringify(statePayloads(replacedJournal)) === JSON.stringify([{ enabled: true }]) &&
			customMessagesOf(replacedJournal, INIT_IDENTITY).length === 1,
		`${replacedRewrite ?? "the earlier entries stand unchanged and in order"}; the replaced journal holds State ${JSON.stringify(statePayloads(replacedJournal))} and ${customMessagesOf(replacedJournal, INIT_IDENTITY).length} init(s)`,
	);

	const exit = await session.stop();
	observe(
		"the session exits cleanly",
		exit.exitCode === 0 && !exit.timedOut,
		`the child exited ${String(exit.exitCode)}, stderr: ${exit.stderr.trim() || "<empty>"}`,
	);
}

// ---------------------------------------------------------------------------
// Phase 3: a resume in a new process restores State and the init's progress
// ---------------------------------------------------------------------------

async function phaseResumeAcrossRestart(cli: PiCli): Promise<void> {
	console.log("\nphase: a resumed session restores the recorded state and the init's progress");
	const run = startRun(cli, "resume-restart");
	const first = await openSession(run);

	await first.run(`/${COMMAND}`, COMMAND_TIMEOUT_MS);
	await first.run("codebase-tools resume first turn");
	const sessionFile = await first.sessionFile();
	const before = first.journal(sessionFile);
	observe(
		"the session that will be resumed was enabled and contributed the init",
		customMessagesOf(before, INIT_IDENTITY).length === 1 &&
			JSON.stringify(statePayloads(before)) === JSON.stringify([{ enabled: true }]),
		`the journal holds ${customMessagesOf(before, INIT_IDENTITY).length} init(s) and State ${JSON.stringify(statePayloads(before))}`,
	);
	const firstExit = await first.stop();
	observe(
		"the session exits cleanly before the resume",
		firstExit.exitCode === 0 && !firstExit.timedOut,
		`the child exited ${String(firstExit.exitCode)}, stderr: ${firstExit.stderr.trim() || "<empty>"}`,
	);

	const requestsBefore = run.capture.requests().length;
	const resumed = await openSession(run, ["--session", sessionFile]);
	const resumedTurnText = "codebase-tools resumed turn";
	const resumedDisposition = await resumed.run(resumedTurnText);
	observe(
		"the resumed session runs a turn without being re-enabled",
		resumedDisposition === "started",
		`pi reported disposition ${JSON.stringify(resumedDisposition)}`,
	);
	const resumedRequest = requestAt(run, requestsBefore);
	const preResumeRequest = requestAt(run, requestsBefore - 1);
	observe(
		"the resumed run adds exactly one contribution, the branch's init replayed",
		contributions(resumedRequest) === contributions(preResumeRequest) + 1,
		`the resumed request carried ${contributions(resumedRequest)} injected message(s) after the pre-resume run's ${contributions(preResumeRequest)}: ${describeMessages(resumedRequest)}`,
	);

	const after = resumed.journal(sessionFile);
	const afterInit = customMessagesOf(after, INIT_IDENTITY);
	observe(
		"the resumed run replays the init instead of re-initialising, and appends the reminder",
		afterInit.length === 1 &&
			JSON.stringify(contributionIdentities(after)) === JSON.stringify([INIT_IDENTITY, REMINDER_IDENTITY]) &&
			JSON.stringify(afterInit[0] ?? {}) === JSON.stringify(customMessagesOf(before, INIT_IDENTITY)[0] ?? {}),
		`the journal's slot identities were ${JSON.stringify(contributionIdentities(after))}, holding ${afterInit.length} init(s)`,
	);
	const resumedRewrite = appendOnlyViolation(before.entries, after.entries);
	observe(
		"the resume appended to history rather than rewriting it",
		resumedRewrite === undefined,
		resumedRewrite ?? "the earlier entries stand unchanged and in order",
	);
	observe(
		"a run writes no State: only the toggle has ever recorded a value",
		JSON.stringify(statePayloads(after)) === JSON.stringify([{ enabled: true }]),
		`the journal's ${STATE_ENTRY_TYPE} payloads were ${JSON.stringify(statePayloads(after))}`,
	);

	const toggleMark = resumed.frameMark();
	await resumed.run(`/${COMMAND}`, COMMAND_TIMEOUT_MS);
	observe(
		"the restored value is the recorded one: the next toggle turns it off",
		JSON.stringify(resumed.notificationsSince(toggleMark)) === JSON.stringify([DISABLED_NOTICE]),
		`the resumed session announced ${JSON.stringify(resumed.notificationsSince(toggleMark))}, expected ${JSON.stringify([DISABLED_NOTICE])}`,
	);
	observe(
		"the resumed session's toggle appended its own record",
		JSON.stringify(statePayloads(resumed.journal(sessionFile))) === JSON.stringify([{ enabled: true }, { enabled: false }]),
		`the journal's ${STATE_ENTRY_TYPE} payloads were ${JSON.stringify(statePayloads(resumed.journal(sessionFile)))}`,
	);

	const exit = await resumed.stop();
	observe(
		"the resumed session exits cleanly",
		exit.exitCode === 0 && !exit.timedOut,
		`the child exited ${String(exit.exitCode)}, stderr: ${exit.stderr.trim() || "<empty>"}`,
	);
}

// ---------------------------------------------------------------------------
// Phase 4: a resume in place (switch_session) restores the same facts
// ---------------------------------------------------------------------------

async function phaseResumeAcrossSwitch(cli: PiCli): Promise<void> {
	console.log("\nphase: switching to an enabled session restores the recorded state and the init's progress");
	const run = startRun(cli, "resume-switch");
	const session = await openSession(run);

	await session.run(`/${COMMAND}`, COMMAND_TIMEOUT_MS);
	await session.run("codebase-tools switch target turn");
	const targetFile = await session.sessionFile();
	const targetBefore = session.journal(targetFile);
	observe(
		"the switch target was enabled and contributed the init",
		customMessagesOf(targetBefore, INIT_IDENTITY).length === 1,
		`the target journal holds ${customMessagesOf(targetBefore, INIT_IDENTITY).length} init(s)`,
	);

	await session.request({ type: "new_session" }, COMMAND_TIMEOUT_MS);
	const betweenTurnText = "codebase-tools between sessions turn";
	await session.run(betweenTurnText);
	const betweenRequest = requestAt(run, 1);
	observe(
		"the session created before the switch is off",
		contributions(betweenRequest) === 0 && lastMessageText(betweenRequest) === betweenTurnText,
		`the request carried ${contributions(betweenRequest)} contribution(s): ${describeMessages(betweenRequest)}`,
	);

	const requestsBefore = run.capture.requests().length;
	const switched = await session.request({ type: "switch_session", sessionPath: targetFile }, COMMAND_TIMEOUT_MS);
	observe(
		"pi switched to the target session",
		fieldOf(fieldOf(switched, "data"), "cancelled") === false,
		`pi answered ${JSON.stringify(fieldOf(switched, "data"))}`,
	);
	const switchedTurnText = "codebase-tools switched turn";
	await session.run(switchedTurnText);
	const switchedRequest = requestAt(run, requestsBefore);
	observe(
		"the switched session contributes without being re-enabled, and replays its init",
		contributions(switchedRequest) === contributions(requestAt(run, 0)) + 1,
		`the switched request carried ${contributions(switchedRequest)} injected message(s) after the target's own ${contributions(requestAt(run, 0))}: ${describeMessages(switchedRequest)}`,
	);

	const targetAfter = session.journal(targetFile);
	observe(
		"the switch completed the init's progress instead of re-initialising",
		customMessagesOf(targetAfter, INIT_IDENTITY).length === 1 &&
			JSON.stringify(contributionIdentities(targetAfter)) === JSON.stringify([INIT_IDENTITY, REMINDER_IDENTITY]),
		`the target journal now holds ${customMessagesOf(targetAfter, INIT_IDENTITY).length} init(s) and its slot identities were ${JSON.stringify(contributionIdentities(targetAfter))}`,
	);
	const switchedRewrite = appendOnlyViolation(targetBefore.entries, targetAfter.entries);
	observe(
		"the switch appended to the target journal rather than rewriting it",
		switchedRewrite === undefined,
		switchedRewrite ?? "the earlier entries stand unchanged and in order",
	);

	const exit = await session.stop();
	observe(
		"the switched session exits cleanly",
		exit.exitCode === 0 && !exit.timedOut,
		`the child exited ${String(exit.exitCode)}, stderr: ${exit.stderr.trim() || "<empty>"}`,
	);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

interface Options {
	readonly pi: string | undefined;
	readonly keep: boolean;
	readonly help: boolean;
}

function parseOptions(argv: readonly string[]): Options {
	let pi: string | undefined;
	let keep = false;
	let help = false;
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === "--pi") {
			const candidate: string | undefined = argv[index + 1];
			if (candidate === undefined) throw new Error("--pi requires a path");
			pi = candidate;
			index += 1;
		} else if (argument === "--keep") {
			keep = true;
		} else if (argument === "--help" || argument === "-h") {
			help = true;
		} else {
			throw new Error(`unknown argument ${JSON.stringify(argument)}; see --help`);
		}
	}
	return { pi, keep, help };
}

const USAGE = [
	"usage: bun scripts/pi-codebase-tools-smoke.ts [--pi <path|name>] [--keep]",
	"",
	"  --pi <path|name>  the pi CLI to drive: its dist/bundle/cli.js, its pi.cmd/pi shim, the binary,",
	"                    or a bare command name looked up on PATH (PI_CLI does the same; without",
	"                    either, `pi` is looked up and node's own prefix is tried)",
	"  --keep            keep every run root (its agent state, sessions, captures) for inspection",
	"  PI_NODE           Node executable for a script/shim CLI; verified on Windows with Node 22.19.0",
].join("\n");

const options = parseOptions(process.argv.slice(2));
if (options.help) {
	console.log(USAGE);
	process.exit(0);
}

let tested = `<unresolved: ${EXPECTED_PI_VERSION} expected>`;
let failure: unknown;

try {
	if (!existsSync(ENTRYPOINT)) {
		throw new Error(`the pi assembly entrypoint does not exist: ${ENTRYPOINT}`);
	}
	const cli = resolvePiCli(options.pi);
	const version = await piVersion(cli);
	tested = version;
	console.log(`pi codebase-tools smoke — pi ${version} via ${cli.path} (${cli.source})`);
	if (cli.command[0] === NODE_EXECUTABLE && cli.command.length > 1) {
		const runtime = Bun.spawnSync([NODE_EXECUTABLE, "--version"], { stdout: "pipe", stderr: "pipe" });
		console.log(`  runtime ${NODE_EXECUTABLE} ${runtime.stdout.toString().trim()}`);
	}
	// A run note, not a check: the assertions below read a slot from the persisted identity
	// either way, so two differing resources would not invalidate them.
	console.log(
		INIT_PROMPT === REMINDER_PROMPT
			? "  note  the two prompt resources are byte-identical: a contribution's slot is read from its persisted identity, not from its text"
			: "  note  the two prompt resources differ; a contribution's slot is still read from its persisted identity",
	);
	if (version !== EXPECTED_PI_VERSION) {
		console.log(
			`  note  this smoke's expectations were written against pi ${EXPECTED_PI_VERSION}; the CLI under test reports ${version}`,
		);
	}
	await phaseToggleAndContributions(cli);
	await phaseNewSessionStartsOff(cli);
	await phaseResumeAcrossRestart(cli);
	await phaseResumeAcrossSwitch(cli);
} catch (error) {
	failure = error;
	for (const session of sessions) {
		if (session.running()) console.error(session.diagnostics());
	}
} finally {
	for (const session of sessions) {
		await session.stop({ timeoutMs: 5_000 }).catch(() => undefined);
	}
	for (const run of runs) {
		run.capture.stop();
		if (failure !== undefined || options.keep) console.error(`kept for inspection: ${run.root.path}`);
		else run.root.dispose();
	}
}

console.log(
	`\nPI SMOKE SUMMARY: pi ${tested} — ${observations.length} check(s) passed, ${failure === undefined ? "none failed" : "the run stopped on a failure"}`,
);
console.log(`  ${observations.length} consumer-visible check(s) across ${runs.length} isolated run(s)`);
console.log("  limitations: agent attribution is not expressible on pi (asserted as hidden and framework-identified only);");
console.log(
	"               the TUI drawing stays human-led, this smoke observes the setWidget/notify frames the adapter published",
);
console.log(`  rerun: bun scripts/pi-codebase-tools-smoke.ts${options.pi === undefined ? "" : ` --pi ${options.pi}`}`);

if (failure !== undefined) {
	throw failure;
}
