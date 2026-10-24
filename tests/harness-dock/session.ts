/**
 * Controlled session: drive the isolated harness in RPC mode with an
 * explicit-only extension set, a temporary agent state directory and a temporary
 * session directory.
 *
 * The driver is deliberately small: start, send a prompt (a slash command is just a
 * prompt whose text is a command), wait for its outcome, read the session JSONL back,
 * capture stderr, and stop the process gracefully by closing stdin. Any failure
 * surfaces the raw material needed to diagnose it: argv, run root, child stderr and
 * the tail of the RPC frame stream.
 */
import type { PipedSubprocess } from "bun";
import { buildSessionEnv } from "./env";
import type { RunRoot } from "./run-root";
import { listSessionFiles, readSessionLog, type SessionLog } from "./session-log";

export interface RpcFrame {
	readonly type?: string;
	readonly [key: string]: unknown;
}

export interface SessionOptions {
	/** Isolated harness to execute (see baseline.ensureIsolatedHarness). */
	readonly harness: { readonly cliPath: string };
	readonly runRoot: RunRoot;
	/** Explicit extension paths (`-e`), each a module file or a discovery directory. */
	readonly extensions: readonly string[];
	/** Model selector to run, e.g. `dock-gateway/dock-model`. */
	readonly model: string;
	/** Extra child environment (applied after isolation). */
	readonly env?: Record<string, string | undefined>;
	readonly extraArgs?: readonly string[];
	/** How long to wait for the harness's `ready` frame. */
	readonly readyTimeoutMs?: number;
	/** How long to wait for a prompt to reach its outcome. */
	readonly promptTimeoutMs?: number;
}

export interface PromptOutcome {
	readonly id: string;
	readonly agentInvoked: boolean;
	readonly status: string;
	readonly frame: RpcFrame;
}

export interface ExitOutcome {
	readonly exitCode: number | null;
	readonly stderr: string;
	/** True when the harness had to be killed after the graceful-exit timeout. */
	readonly timedOut: boolean;
}

interface FrameWaiter {
	readonly predicate: (frame: RpcFrame) => boolean;
	readonly settle: (frame: RpcFrame) => void;
	readonly timer: ReturnType<typeof setTimeout>;
}

export class DockSessionError extends Error {
	readonly diagnostics: string;

	constructor(message: string, diagnostics: string) {
		super(`${message}\n--- session diagnostics ---\n${diagnostics}`);
		this.name = "DockSessionError";
		this.diagnostics = diagnostics;
	}
}

function spawnSession(argv: readonly string[], env: Record<string, string>, cwd: string): PipedSubprocess {
	return Bun.spawn([...argv], { cwd, env, stdin: "pipe", stdout: "pipe", stderr: "pipe" });
}

type SessionChild = PipedSubprocess;

const DEFAULT_READY_TIMEOUT_MS = 90_000;
const DEFAULT_PROMPT_TIMEOUT_MS = 120_000;
const DEFAULT_STOP_TIMEOUT_MS = 20_000;
const FRAME_TAIL = 25;

export class ControlledSession {
	readonly argv: readonly string[];
	readonly env: Record<string, string>;

	readonly #child: SessionChild;
	readonly #runRoot: RunRoot;
	readonly #readyTimeoutMs: number;
	readonly #promptTimeoutMs: number;
	readonly #frames: RpcFrame[] = [];
	readonly #waiters: FrameWaiter[] = [];
	#stderrText = "";
	#promptCounter = 0;
	#commandCounter = 0;
	#exit: ExitOutcome | null = null;
	readonly #stderrPump: Promise<void>;
	readonly #stdoutPump: Promise<void>;
	readonly #pipeReaders = new Set<ReadableStreamDefaultReader<Uint8Array>>();

	private constructor(
		child: SessionChild,
		argv: readonly string[],
		env: Record<string, string>,
		runRoot: RunRoot,
		readyTimeoutMs: number,
		promptTimeoutMs: number,
	) {
		this.#child = child;
		this.argv = argv;
		this.env = env;
		this.#runRoot = runRoot;
		this.#readyTimeoutMs = readyTimeoutMs;
		this.#promptTimeoutMs = promptTimeoutMs;
		this.#stderrPump = this.#pump(child.stderr, line => {
			this.#stderrText += `${line}\n`;
		});
		this.#stdoutPump = this.#pump(child.stdout, line => this.#acceptFrame(line));
	}

	static async start(options: SessionOptions): Promise<ControlledSession> {
		const agentDir = options.runRoot.agentDir;
		const argv = [
			// PATH's bun entry can be a Windows launcher whose child survives it.
			// Spawn this runtime directly so kill/exited name the harness itself.
			process.execPath,
			options.harness.cliPath,
			"--mode",
			"rpc",
			"--no-extensions",
			...options.extensions.flatMap(extension => ["-e", extension]),
			"--model",
			options.model,
			"--session-dir",
			options.runRoot.sessionDir,
			"--cwd",
			options.runRoot.workDir,
			...(options.extraArgs ?? []),
		];
		const env = buildSessionEnv(process.env, { agentDir, extra: options.env });
		const child = spawnSession(argv, env, options.runRoot.workDir);
		const session = new ControlledSession(
			child,
			argv,
			env,
			options.runRoot,
			options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS,
			options.promptTimeoutMs ?? DEFAULT_PROMPT_TIMEOUT_MS,
		);
		try {
			await session.#awaitReady();
			return session;
		} catch (error) {
			// Until ready succeeds, start owns the child: callers have nothing to stop.
			// Preserve the readiness failure, not an error from shutting its pipes down.
			try {
				child.kill();
			} catch {
				// An early-exit child may already have been reaped.
			}
			try {
				child.stdin.end();
			} catch {
				// The child may have closed stdin before readiness failed.
			}
			await child.exited;
			await Promise.allSettled([...session.#pipeReaders].map(reader => reader.cancel()));
			await Promise.allSettled([session.#stdoutPump, session.#stderrPump]);
			throw error;
		}
	}

	frames(): readonly RpcFrame[] {
		return [...this.#frames];
	}

	stderr(): string {
		return this.#stderrText;
	}

	exited(): ExitOutcome | null {
		return this.#exit;
	}

	/** Read back one session JSONL: the given file, or the run's most recent one. */
	sessionLog(file?: string): SessionLog {
		return readSessionLog(this.#runRoot.sessionDir, file);
	}

	sessionFiles(): string[] {
		return listSessionFiles(this.#runRoot.sessionDir);
	}

	diagnostics(): string {
		const lines = [
			`argv: ${this.argv.join(" ")}`,
			`run root: ${this.#runRoot.path}`,
			`agent state: ${this.#runRoot.agentDir}`,
			`exit: ${this.#exit ? `${String(this.#exit.exitCode)}${this.#exit.timedOut ? " (killed after timeout)" : ""}` : "<still running>"}`,
			`session files: ${this.sessionFiles().join(", ") || "<none>"}`,
			`stderr:\n${this.#stderrText.trim() || "<empty>"}`,
			`last ${FRAME_TAIL} frames:\n${this.#frames
				.slice(-FRAME_TAIL)
				.map(frame => JSON.stringify(frame).slice(0, 500))
				.join("\n")}`,
		];
		return lines.join("\n");
	}

	/**
	 * Wait for the first frame matching, from those already delivered or the next one the harness
	 * publishes.
	 *
	 * A host may publish a frame before a case gets to look — a widget rendered during startup, for
	 * instance — so an existing match answers immediately rather than waiting for a second one. The
	 * predicate is the awaited condition; a timeout with the session diagnostics is the failure.
	 */
	async awaitFrame(
		predicate: (frame: RpcFrame) => boolean,
		description: string,
		timeoutMs: number = this.#promptTimeoutMs,
	): Promise<RpcFrame> {
		const delivered = this.#frames.find(predicate);
		if (delivered !== undefined) return delivered;
		return this.#waitForFrame(predicate, description, timeoutMs);
	}

	/** Send a prompt; slash-command text (e.g. `/codebase-tools`) is a prompt too. */
	async prompt(message: string, timeoutMs: number = this.#promptTimeoutMs): Promise<PromptOutcome> {
		const id = `h${++this.#promptCounter}`;
		const outcome = this.#waitForFrame(
			frame => frame.type === "prompt_result" && frame.id === id,
			`prompt_result for ${id}`,
			timeoutMs,
		);
		this.#send({ id, type: "prompt", message });
		const frame = await outcome;
		return {
			id,
			agentInvoked: frame.agentInvoked === true,
			status: typeof frame.status === "string" ? frame.status : "<missing>",
			frame,
		};
	}

	/**
	 * Send one RPC command and wait for the `response` frame that answers it.
	 *
	 * The reverse direction of {@link prompt}: a command whose outcome is not a prompt
	 * (switching sessions, reading entries) is answered with a correlated response, and a
	 * refused command surfaces as a dock error instead of a silent no-op.
	 */
	async request(command: { readonly type: string; readonly [key: string]: unknown }): Promise<RpcFrame> {
		const id = `c${++this.#commandCounter}`;
		const answer = this.#waitForFrame(
			frame => frame.type === "response" && frame.id === id,
			`response to ${command.type}`,
			this.#promptTimeoutMs,
		);
		this.#send({ ...command, id });
		const frame = await answer;
		if (frame.success !== true) {
			throw new DockSessionError(
				`harness refused ${command.type}: ${JSON.stringify(frame)}`,
				this.diagnostics(),
			);
		}
		return frame;
	}

	/** Close stdin and wait for a graceful exit; kill only if the harness hangs. */
	async stop(options?: { timeoutMs?: number }): Promise<ExitOutcome> {
		if (this.#exit) return this.#exit;
		const timeoutMs = options?.timeoutMs ?? DEFAULT_STOP_TIMEOUT_MS;
		this.#child.stdin.end();
		const exitCode = await Promise.race([
			this.#child.exited,
			Bun.sleep(timeoutMs).then(() => "timeout" as const),
		]);
		if (exitCode === "timeout") {
			this.#child.kill();
		}
		const finalCode = exitCode === "timeout" ? await this.#child.exited : exitCode;
		await Promise.race([this.#stderrPump, Bun.sleep(1_000)]);
		this.#exit = { exitCode: finalCode, stderr: this.#stderrText, timedOut: exitCode === "timeout" };
		return this.#exit;
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
					reject(new DockSessionError(`timed out after ${timeoutMs}ms waiting for ${label}`, this.diagnostics()));
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

	async #awaitReady(): Promise<void> {
		const ready = this.#waitForFrame(frame => frame.type === "ready", "ready frame", this.#readyTimeoutMs);
		void ready.catch(() => {});
		const exited = this.#child.exited.then(code => ({ kind: "exit" as const, code }));
		try {
			const outcome = await Promise.race([
				ready.then(frame => ({ kind: "ready" as const, frame })),
				exited,
				this.#stdoutPump.then(() => ({ kind: "eof" as const })),
			]);
			if (outcome.kind === "exit") {
				this.#exit = { exitCode: outcome.code, stderr: this.#stderrText, timedOut: false };
				throw new DockSessionError(
					`harness exited with code ${String(outcome.code)} before the ready frame`,
					this.diagnostics(),
				);
			}
			if (outcome.kind === "eof") {
				throw new DockSessionError("harness stdout closed before the ready frame", this.diagnostics());
			}
		} finally {
			// Only the ready waiter exists before start returns. EOF/exit must not leave
			// its long deadline alive after the startup owner has reclaimed the child.
			for (const waiter of this.#waiters.splice(0)) clearTimeout(waiter.timer);
		}
	}

	async #pump(stream: ReadableStream<Uint8Array>, onLine: (line: string) => void): Promise<void> {
		const reader = stream.getReader();
		this.#pipeReaders.add(reader);
		const decoder = new TextDecoder();
		let buffer = "";
		try {
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
		} finally {
			this.#pipeReaders.delete(reader);
			reader.releaseLock();
		}
	}
}
