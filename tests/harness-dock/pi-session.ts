/**
 * Driving the real pi CLI: the one driver every pi real-host run in this repository uses.
 *
 * A run is started in pi's own RPC mode as a child process, with an isolated agent state, session
 * directory and working directory under the OS temp root and a local OpenAI-compatible capture
 * endpoint declared through the run's own `models.json`. The default agent state, the formal
 * configuration and any running agent are never touched, no real credential is read and no repository
 * file is written. An extension under test is loaded explicitly (`--no-extensions -e <entrypoint>`), so
 * the loaded extension set is exactly the one named.
 *
 * What the driver exposes is pi's own protocol, not an interpretation of it: send a prompt or a
 * command over stdin and wait for the frame it answers with, read the session JSONL back, read the
 * extension-UI frames the process published, and close stdin for an orderly exit. A failure carries
 * the raw material needed to diagnose it — argv, run root, child stderr and the tail of the frame
 * stream — because a real-host run is expensive and a failure with no diagnostics costs another one.
 */
import type { PipedSubprocess } from "bun";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import {
	type CaptureServer,
	type CaptureServerOptions,
	startCaptureServer,
} from "./capture-server";
import { buildSessionEnv } from "./env";
import { type RunRoot, createRunRoot } from "./run-root";
import { type SessionLog, readSessionLog } from "./session-log";

/** The node that runs a CLI script; `PI_NODE` overrides it for a non-PATH installation. */
export const PI_NODE_EXECUTABLE = process.env.PI_NODE ?? "node";

/** How long one prompt's run is given before the driver gives up on it. */
export const PI_PROMPT_TIMEOUT_MS = 90_000;

/** How long one command is given to answer. */
export const PI_COMMAND_TIMEOUT_MS = 60_000;

/** How long an orderly exit is given before the child is killed. */
export const PI_STOP_TIMEOUT_MS = 20_000;

/** How many frames a failure's diagnostics keep. */
const FRAME_TAIL = 25;

/** The environment values every controlled run sets: no update check, no telemetry, no network. */
const CONTROLLED_ENV: Record<string, string> = {
	PI_OFFLINE: "1",
	PI_SKIP_VERSION_CHECK: "1",
	PI_TELEMETRY: "0",
};

// ---------------------------------------------------------------------------
// The pi CLI under test
// ---------------------------------------------------------------------------

export interface PiCli {
	/** The full argv prefix that runs the CLI (a node script, or the binary itself). */
	readonly command: readonly string[];
	/** The script or binary the operator recognizes. */
	readonly path: string;
	/** How this path was found, for the run's own report. */
	readonly source: string;
}

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
		return { command: [PI_NODE_EXECUTABLE, candidate], path: candidate, source: "node script" };
	}
	if (extension === ".cmd" || extension === ".bat") {
		const bundle = bundleBehindShim(candidate);
		if (bundle === undefined) return undefined;
		return {
			command: [PI_NODE_EXECUTABLE, bundle],
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

/**
 * The pi CLI one run drives: the explicit path or `PI_CLI` name when given, otherwise `pi` from PATH
 * and node's own prefix as the last resort.
 */
export function resolvePiCli(explicit?: string): PiCli {
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
export async function piVersion(cli: PiCli): Promise<string> {
	const child = Bun.spawn([...cli.command, "--version"], { stdout: "pipe", stderr: "pipe" });
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	const reported = stdout.trim() || stderr.trim();
	if (exitCode !== 0 || reported.length === 0) {
		throw new Error(
			`could not read the pi version from ${cli.path}: exit ${exitCode}, output: ${reported || "<empty>"}`,
		);
	}
	return reported.split("\n")[0].trim();
}

// ---------------------------------------------------------------------------
// The run's isolated state
// ---------------------------------------------------------------------------

/** One provider entry of pi's own `models.json`, as a controlled run declares it. */
export interface PiProviderModels {
	/** The endpoint this provider's models are reached at. */
	readonly baseUrl: string;
	/** The wire protocol of that endpoint; pi's own default for the declared shape is used when absent. */
	readonly api?: string;
	/** The credential pi resolves for this provider. */
	readonly apiKey?: string;
	readonly models: readonly Readonly<Record<string, unknown>>[];
}

/** One model as a controlled run declares it, with the fields a session's own facts are read from. */
export interface PiModelDeclaration {
	readonly id: string;
	readonly name?: string;
	readonly reasoning?: boolean;
	readonly input?: readonly string[];
	readonly cost?: Readonly<Record<string, number>>;
	readonly contextWindow?: number;
	readonly maxTokens?: number;
}

/**
 * Write the run's own `models.json`: the providers a controlled session resolves, in the harness's
 * documented configuration file, under the run's isolated agent state.
 *
 * A provider declared with `models` replaces whatever catalog that provider name had, which is what
 * makes the declared endpoint the one every request of that provider reaches — including the queries
 * an extension makes for itself.
 */
export function writePiModels(agentDir: string, providers: Readonly<Record<string, PiProviderModels>>): void {
	mkdirSync(agentDir, { recursive: true });
	const config = { $schema: "https://pi.dev/schemas/models.schema.json", providers };
	writeFileSync(path.join(agentDir, "models.json"), `${JSON.stringify(config, null, 2)}\n`);
}

/** One provisioned run: the isolated root, the capture endpoint behind it and the CLI. */
export interface PiRun {
	readonly root: RunRoot;
	readonly capture: CaptureServer;
	readonly cli: PiCli;
	/** The provider the run's own models file declares. */
	readonly provider: string;
	/** The model id that provider declares. */
	readonly model: string;
	/** The `provider/model` selector a session of this run is started with. */
	readonly selector: string;
}

/** What one controlled run declares: the capture endpoint's own answers and the model it serves. */
export interface PiRunOptions {
	/** The provider name the run's models file declares. */
	readonly provider: string;
	/** The model id the run's selector names, and the one a session starts on. */
	readonly model: string;
	/** The model's declared cost, in pi's USD-per-million-token rates. */
	readonly cost?: Readonly<Record<string, number>>;
	readonly contextWindow?: number;
	readonly maxTokens?: number;
	/** Other models this provider serves beside the one above, each with its own declared facts. */
	readonly otherModels?: readonly PiModelDeclaration[];
	/** The capture endpoint's scripted answer, usage and balance reading. */
	readonly endpoint?: Omit<CaptureServerOptions, "dir">;
}

/** One model row of the run's `models.json`, as the run's own declaration states it. */
function declaredModel(
	id: string,
	overrides: Partial<PiModelDeclaration>,
	fallback: { readonly cost: Readonly<Record<string, number>>; readonly contextWindow: number; readonly maxTokens: number },
): Readonly<Record<string, unknown>> {
	return {
		id,
		name: overrides.name ?? `pi smoke ${id}`,
		reasoning: overrides.reasoning ?? false,
		input: overrides.input ?? ["text"],
		cost: overrides.cost ?? fallback.cost,
		contextWindow: overrides.contextWindow ?? fallback.contextWindow,
		maxTokens: overrides.maxTokens ?? fallback.maxTokens,
	};
}

/** One fresh run root with a capture endpoint behind it and its own models file pointing at it. */
export function startPiRun(cli: PiCli, label: string, options: PiRunOptions): PiRun {
	const root = createRunRoot(label);
	const capture = startCaptureServer({ dir: root.captureDir, ...options.endpoint });
	const fallback = {
		cost: options.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: options.contextWindow ?? 128_000,
		maxTokens: options.maxTokens ?? 8192,
	};
	writePiModels(root.agentDir, {
		[options.provider]: {
			baseUrl: capture.baseUrl,
			api: "openai-completions",
			apiKey: "pi-smoke-key",
			models: [
				declaredModel(options.model, { cost: fallback.cost, contextWindow: fallback.contextWindow, maxTokens: fallback.maxTokens }, fallback),
				...(options.otherModels ?? []).map(declaration => declaredModel(declaration.id, declaration, fallback)),
			],
		},
	});
	return { root, capture, cli, provider: options.provider, model: options.model, selector: `${options.provider}/${options.model}` };
}

// ---------------------------------------------------------------------------
// The RPC driver
// ---------------------------------------------------------------------------

export interface PiRpcFrame {
	readonly type?: string;
	readonly [key: string]: unknown;
}

export interface PiSessionOptions {
	readonly cli: PiCli;
	readonly runRoot: RunRoot;
	/**
	 * The extension paths (`-e`) this session loads, in load order.
	 *
	 * A run that must observe one extension's public consumption beside another's effect states both,
	 * which is what makes the observation about the harness's own loading rather than about a fixture
	 * that restates the production assembly.
	 */
	readonly entrypoint: string | readonly string[];
	/** The `provider/model` selector the session runs. */
	readonly selector: string;
	readonly extraArgs?: readonly string[];
	/** Extra environment values, applied over the controlled set. */
	readonly env?: Record<string, string | undefined>;
}

export interface PiExitOutcome {
	readonly exitCode: number | null;
	readonly stderr: string;
	readonly timedOut: boolean;
}

interface FrameWaiter {
	readonly predicate: (frame: PiRpcFrame) => boolean;
	readonly settle: (frame: PiRpcFrame) => void;
	readonly timer: ReturnType<typeof setTimeout>;
}

/** A failed step, carrying the raw material needed to diagnose the run it failed in. */
export class PiSessionError extends Error {
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
 * The driver is deliberately small: start with the explicit-only extension set, send a prompt or a
 * command, wait for the run it started to settle, read one session's JSONL back, watch the
 * extension-UI frames, and close stdin for an orderly exit.
 */
export class PiSession {
	readonly argv: readonly string[];
	readonly env: Record<string, string>;

	readonly #child: PipedSubprocess;
	readonly #runRoot: RunRoot;
	readonly #frames: PiRpcFrame[] = [];
	readonly #waiters: FrameWaiter[] = [];
	#stderrText = "";
	#commandCounter = 0;
	#exit: PiExitOutcome | null = null;
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

	static async start(options: PiSessionOptions): Promise<PiSession> {
		const { runRoot } = options;
		const entrypoints = typeof options.entrypoint === "string" ? [options.entrypoint] : options.entrypoint;
		const entrypointArguments = entrypoints.flatMap(entrypoint => ["-e", entrypoint]);
		const argv = [
			...options.cli.command,
			"--mode",
			"rpc",
			"--no-extensions",
			...entrypointArguments,
			"--no-mcp",
			"--model",
			options.selector,
			"--session-dir",
			runRoot.sessionDir,
			...(options.extraArgs ?? []),
		];
		const env = buildSessionEnv(process.env, {
			agentDir: runRoot.agentDir,
			extra: { ...CONTROLLED_ENV, ...options.env },
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
				.request({ type: "get_state" }, PI_COMMAND_TIMEOUT_MS)
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

	/** Every frame this process published on stdout, in arrival order. */
	frames(): readonly PiRpcFrame[] {
		return this.#frames;
	}

	/** Everything the child wrote to stderr so far. */
	stderr(): string {
		return this.#stderrText;
	}

	/** The child's exit outcome, or `null` while it runs. */
	exited(): PiExitOutcome | null {
		return this.#exit;
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
	async request(
		command: { readonly type: string; readonly [key: string]: unknown },
		timeoutMs: number = PI_COMMAND_TIMEOUT_MS,
	): Promise<PiRpcFrame> {
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
	async run(text: string, timeoutMs: number = PI_PROMPT_TIMEOUT_MS): Promise<string> {
		const settledBefore = this.#settledCount();
		const response = await this.request({ type: "prompt", message: text }, timeoutMs);
		const disposition = (response.data as { disposition?: unknown } | undefined)?.disposition;
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
		const state = await this.request({ type: "get_state" });
		const file = (state.data as { sessionFile?: unknown } | undefined)?.sessionFile;
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

	/** Where the frame stream stood; a mark taken before a command isolates that command's frames. */
	frameMark(): number {
		return this.#frames.length;
	}

	/** The first frame at or after `mark` that matches, or `undefined` when none arrives in time. */
	async frameSince(
		mark: number,
		predicate: (frame: PiRpcFrame) => boolean,
		label: string,
		timeoutMs: number,
	): Promise<PiRpcFrame | undefined> {
		const existing = this.#frames.slice(mark).find(predicate);
		if (existing !== undefined) return existing;
		try {
			return await this.#waitForFrame(predicate, label, timeoutMs);
		} catch {
			return undefined;
		}
	}

	/** Close stdin and wait for an orderly exit; kill only when the child hangs. */
	async stop(options?: { readonly timeoutMs?: number }): Promise<PiExitOutcome> {
		if (this.#exit) return this.#exit;
		const timeoutMs = options?.timeoutMs ?? PI_STOP_TIMEOUT_MS;
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

	#waitForFrame(predicate: (frame: PiRpcFrame) => boolean, label: string, timeoutMs: number): Promise<PiRpcFrame> {
		return new Promise<PiRpcFrame>((resolve, reject) => {
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
		let frame: PiRpcFrame;
		try {
			frame = JSON.parse(line) as PiRpcFrame;
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
