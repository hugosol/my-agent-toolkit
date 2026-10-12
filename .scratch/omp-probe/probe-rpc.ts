/**
 * Isolated runtime probe for the omp process model. No model requests are made:
 * RPC mode is booted with an isolated agent dir and only local session commands
 * (get_state / new_session / set_session_name / switch_session) are sent.
 *
 * Answers:
 *  1. Does one CLI process host multiple sessions (new/switch) with the same OS pid?
 *  2. Are two independent CLI launches two independent OS processes (not one shared daemon)?
 *  3. What child processes does a plain session host spawn?
 *  4. Does a second live process opening the same session file hit cross-process lease logic?
 */
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

const OMP_CLI =
	process.env.PROBE_OMP_CLI ?? "E:/Developer/myhub/oh-my-pi/packages/coding-agent/src/cli.ts";
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const root = path.join(os.tmpdir(), `omp-probe-${runId}`);
const agentDir = path.join(root, "agent");
const projA = path.join(root, "projA");
const projB = path.join(root, "projB");
for (const dir of [agentDir, projA, projB]) await fs.mkdir(dir, { recursive: true });

interface Frame {
	type?: string;
	id?: string;
	[key: string]: unknown;
}

class Client {
	readonly proc: Bun.Subprocess<"pipe", "pipe", "pipe">;
	readonly label: string;
	#buf = "";
	#frames: Frame[] = [];
	#raw: string[] = [];
	#stderr = "";
	#waiters: Array<() => void> = [];
	exitCode: number | null = null;

	constructor(label: string, cwd: string, extraArgs: string[] = []) {
		this.label = label;
		this.proc = Bun.spawn([process.execPath, OMP_CLI, "--mode", "rpc", "--no-ui", ...extraArgs], {
			cwd,
			env: {
				...process.env,
				PI_CODING_AGENT_DIR: agentDir,
				PI_NO_TITLE: "1",
				// Placeholder credentials only: no turn is ever prompted, so no model request is made.
				ANTHROPIC_API_KEY: "probe-placeholder-key",
			},
			stdin: "pipe",
			stdout: "pipe",
			stderr: "pipe",
		});
		void this.#pump(this.proc.stdout);
		void this.#pumpErr(this.proc.stderr);
		void this.proc.exited.then(code => {
			this.exitCode = code;
			this.#wake();
		});
	}

	get pid(): number {
		return this.proc.pid;
	}

	async #pump(stream: ReadableStream<Uint8Array>): Promise<void> {
		const dec = new TextDecoder();
		const reader = stream.getReader();
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				this.#buf += dec.decode(value, { stream: true });
				let idx = this.#buf.indexOf("\n");
				while (idx >= 0) {
					const line = this.#buf.slice(0, idx).trim();
					this.#buf = this.#buf.slice(idx + 1);
					if (line) {
						try {
							this.#frames.push(JSON.parse(line) as Frame);
						} catch {
							this.#raw.push(line.slice(0, 400));
						}
					}
					idx = this.#buf.indexOf("\n");
				}
			}
		} catch {
			/* stream torn down on exit */
		} finally {
			this.#wake();
		}
	}

	async #pumpErr(stream: ReadableStream<Uint8Array>): Promise<void> {
		const dec = new TextDecoder();
		const reader = stream.getReader();
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				this.#stderr += dec.decode(value, { stream: true });
				if (this.#stderr.length > 4000) this.#stderr = this.#stderr.slice(-4000);
			}
		} catch {
			/* ignore */
		}
	}

	#wake(): void {
		const waiters = this.#waiters;
		this.#waiters = [];
		for (const w of waiters) w();
	}

	async awaitFrame(match: (f: Frame) => boolean, timeoutMs = 90_000, from = 0): Promise<Frame> {
		const started = Date.now();
		let cursor = from;
		while (true) {
			for (; cursor < this.#frames.length; cursor++) {
				const frame = this.#frames[cursor];
				if (match(frame)) return frame;
			}
			if (Date.now() - started > timeoutMs) {
				throw new Error(
					`timeout waiting for frame in ${this.label}; pending=${this.#frames.length}, stderrTail=${JSON.stringify(
						this.#stderr.slice(-600),
					)}`,
				);
			}
			await new Promise<void>(resolve => {
				this.#waiters.push(resolve);
				setTimeout(resolve, 500);
			});
		}
	}

	async request(type: string, extra: Record<string, unknown> = {}, timeoutMs = 90_000): Promise<Frame> {
		const id = `probe-${this.label}-${type}-${Math.random().toString(36).slice(2, 8)}`;
		const from = this.#frames.length;
		this.proc.stdin.write(`${JSON.stringify({ id, type, ...extra })}\n`);
		await this.proc.stdin.flush();
		const frame = await this.awaitFrame(f => f.id === id && f.type === "response", timeoutMs, from);
		return frame;
	}

	frameCount(): number {
		return this.#frames.length;
	}

	raw(): string[] {
		return this.#raw.slice(0, 5);
	}

	stderrTail(): string {
		return this.#stderr.slice(-800);
	}

	async close(): Promise<number | null> {
		try {
			this.proc.stdin.end();
		} catch {
			/* already closed */
		}
		const raced = await Promise.race([this.proc.exited, Bun.sleep(15_000).then(() => "timeout")]);
		if (raced === "timeout") {
			this.proc.kill();
			await Promise.race([this.proc.exited, Bun.sleep(5_000)]);
		}
		return this.exitCode;
	}
}

async function psChildren(pid: number): Promise<unknown> {
	const cmd = `Get-CimInstance Win32_Process -Filter "ParentProcessId = ${pid}" | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress`;
	const proc = Bun.spawn(["powershell", "-NoProfile", "-Command", cmd], { stdout: "pipe", stderr: "pipe" });
	const out = await new Response(proc.stdout).text();
	await proc.exited;
	return out.trim() ? JSON.parse(out) : [];
}

async function psOmpProcesses(): Promise<unknown> {
	const cmd =
		"Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'coding-agent/src/cli.ts' } | " +
		"Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress";
	const proc = Bun.spawn(["powershell", "-NoProfile", "-Command", cmd], { stdout: "pipe", stderr: "pipe" });
	const out = await new Response(proc.stdout).text();
	await proc.exited;
	return out.trim() ? JSON.parse(out) : [];
}

const summary: Record<string, unknown> = { ompCli: OMP_CLI, root, agentDir, projA, projB };

let A: Client | undefined;
let B: Client | undefined;

try {
	// ---- Process A: one CLI process hosting two sessions ------------------
	A = new Client("A", projA);
	const readyA = await A.awaitFrame(f => f.type === "ready");
	summary.aReadyFrame = readyA;

	const stateA1 = (await A.request("get_state")).data as Record<string, unknown>;
	await A.request("set_session_name", { name: "probe-A-owned" });
	const stateA2 = (await A.request("get_state")).data as Record<string, unknown>;
	const newSession = (await A.request("new_session")).data as Record<string, unknown>;
	const stateA3 = (await A.request("get_state")).data as Record<string, unknown>;

	summary.aHost = {
		pid: A.pid,
		ready: true,
		stateA1: { sessionId: stateA1?.sessionId, sessionFile: stateA1?.sessionFile },
		afterTitleWrite: { sessionId: stateA2?.sessionId, sessionFile: stateA2?.sessionFile },
		newSession,
		stateA3: { sessionId: stateA3?.sessionId, sessionFile: stateA3?.sessionFile },
		samePidAcrossSessions: true,
		sessionIdChanged: stateA1?.sessionId !== stateA3?.sessionId,
	};
	summary.aChildrenWhileRunning = await psChildren(A.pid);

	// ---- Process B: a second, independent CLI launch ----------------------
	B = new Client("B", projA);
	await B.awaitFrame(f => f.type === "ready");
	const stateB1 = (await B.request("get_state")).data as Record<string, unknown>;
	summary.bHost = {
		pid: B.pid,
		distinctPid: B.pid !== A.pid,
		stateB1: { sessionId: stateB1?.sessionId, sessionFile: stateB1?.sessionFile },
	};
	summary.bChildrenWhileRunning = await psChildren(B.pid);
	summary.allOmpProcessesWhileBothRunning = await psOmpProcesses();

	// ---- Cross-process lease probe: B writes A's live session ------------
	const aFile = stateA2?.sessionFile as string | undefined;
	if (aFile) {
		const beforeStat = await fs.stat(aFile).catch(() => null);
		const switchResp = await B.request("switch_session", { sessionPath: aFile });
		const afterSwitchState = (await B.request("get_state")).data as Record<string, unknown>;
		await B.request("set_session_name", { name: "probe-B-takeover" });
		const afterWriteState = (await B.request("get_state")).data as Record<string, unknown>;
		const afterStat = await fs.stat(aFile).catch(() => null);
		summary.crossProcessLeaseProbe = {
			aFile,
			switchResult: { success: switchResp.success, data: switchResp.data, error: switchResp.error },
			bAfterSwitch: { sessionId: afterSwitchState?.sessionId, sessionFile: afterSwitchState?.sessionFile },
			bAfterOwnWrite: { sessionId: afterWriteState?.sessionId, sessionFile: afterWriteState?.sessionFile },
			movedToSibling: afterWriteState?.sessionFile !== aFile,
			aFileSizeBefore: beforeStat?.size ?? null,
			aFileSizeAfter: afterStat?.size ?? null,
			aFileContentUnchanged: (beforeStat?.size ?? null) === (afterStat?.size ?? null),
		};
	} else {
		summary.crossProcessLeaseProbe = { skipped: "A session file was never materialized" };
	}

	// ---- A must be unaffected by B's write -------------------------------
	const aAfter = (await A.request("get_state")).data as Record<string, unknown>;
	summary.aUnaffected = { sessionId: aAfter?.sessionId, sessionFile: aAfter?.sessionFile };
} catch (error) {
	summary.error = String(error);
} finally {
	summary.aExit = A ? await A.close() : null;
	summary.bExit = B ? await B.close() : null;
	summary.aStderrTail = A?.stderrTail();
	summary.bStderrTail = B?.stderrTail();
	summary.aRawUnparsed = A?.raw();
}

// Remaining omp processes after both exit (daemon-takeover check).
await Bun.sleep(1500);
summary.ompProcessesAfterExit = await psOmpProcesses();

// What did the isolated agent dir receive? (any daemon/broker runtime?)
async function tree(dir: string): Promise<string[]> {
	const out: string[] = [];
	async function walk(current: string, prefix: string): Promise<void> {
		const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
		for (const e of entries.slice(0, 40)) {
			const rel = `${prefix}${e.name}${e.isDirectory() ? "/" : ""}`;
			out.push(rel);
			if (e.isDirectory()) await walk(path.join(current, e.name), `${rel}`);
		}
	}
	await walk(dir, "");
	return out;
}
summary.isolatedAgentDirTree = await tree(agentDir);
summary.isolatedRootTree = (await tree(root)).filter(p => !p.startsWith("agent/"));

console.log(JSON.stringify(summary, null, 2));
