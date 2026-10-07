/**
 * The controlled-session harness must be able to: start the isolated agent runtime
 * with a temporary agent state, execute an extension command, run a real turn, read
 * the session JSONL back, read the captured outbound request JSON back, exit
 * normally, and explain itself when a run fails.
 *
 * Each test owns its run (temporary agent state, session directory, capture directory).
 * The agent runtime materialises its session file lazily, so read-back happens after a
 * turn and a graceful exit, which is when the file is complete.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { type IsolatedRuntime, ensureIsolatedRuntime, readBaselineRecord, verifyLockfile } from "./baseline";
import { type CaptureServer, startCaptureServer } from "./capture-server";
import { listResolutionOffsets } from "./env";
import { HARNESS_CAPTURE_BASE_URL_ENV, HARNESS_MODEL_SELECTOR } from "./fixtures/extension-root/provider";
import {
	FIXTURE_COMMAND,
	FIXTURE_COMMAND_ENTRY_TYPE,
	FIXTURE_INJECTION_TEXT,
	FIXTURE_INJECTION_TYPE,
} from "./fixtures/extension-root/entrypoint";
import { type RunRoot, createRunRoot, listRunArtifacts } from "./run-root";
import { ControlledSession, HarnessSessionError } from "./session";
import { customEntries, customMessages } from "./session-log";

const record = readBaselineRecord();
const FIXTURE_EXTENSION_ROOT = path.join(import.meta.dir, "fixtures", "extension-root");

let runtime: IsolatedRuntime;

interface HarnessRun {
	readonly session: ControlledSession;
	readonly capture: CaptureServer;
	readonly runRoot: RunRoot;
}

async function startRun(label: string): Promise<HarnessRun> {
	const runRoot = createRunRoot(label);
	const capture = startCaptureServer({ dir: runRoot.captureDir });
	try {
		const session = await ControlledSession.start({
			runtime,
			runRoot,
			extensions: [FIXTURE_EXTENSION_ROOT],
			model: HARNESS_MODEL_SELECTOR,
			env: { [HARNESS_CAPTURE_BASE_URL_ENV]: capture.baseUrl },
		});
		return { session, capture, runRoot };
	} catch (error) {
		capture.stop();
		runRoot.dispose();
		throw error;
	}
}

/** Drop the run's processes and directories; safe to call after an explicit stop. */
async function disposeRun(run: HarnessRun): Promise<void> {
	try {
		await run.session.stop({ timeoutMs: 5_000 });
	} catch {
		// The session already stopped (or never started); the run root still gets cleaned up.
	}
	run.capture.stop();
	run.runRoot.dispose();
}

describe("controlled session", () => {
	test("starts the isolated artifact under a temporary agent state, not the default environment", async () => {
		runtime = await ensureIsolatedRuntime(record);
		const run = await startRun("isolation");
		try {
			// Exactly one resolution offset survives: the temporary agent state directory.
			expect(listResolutionOffsets(run.session.env)).toEqual(["PI_CODING_AGENT_DIR"]);
			expect(run.session.env.PI_CODING_AGENT_DIR).toBe(run.runRoot.agentDir);
			// The process that runs is the isolated install, invoked explicit-only.
			expect(run.session.argv[1]).toBe(runtime.cliPath);
			expect(run.session.argv[1]?.startsWith(runtime.prefix)).toBe(true);
			expect(run.session.argv).toContain("--no-extensions");
			expect(run.session.argv).toContain(FIXTURE_EXTENSION_ROOT);

			const exit = await run.session.stop();
			expect(exit.timedOut).toBe(false);
			expect(exit.exitCode).toBe(0);

			// Agent state landed inside the isolated run root, and the repository's
			// dependency lockfile is untouched by a run.
			expect(listRunArtifacts(run.runRoot).some(artifact => artifact.startsWith("agent-state/"))).toBe(true);
			expect(verifyLockfile(record.sourceCombination.lockfile).matches).toBe(true);
		} finally {
			await disposeRun(run);
		}
	}, 180_000);

	test("executes an extension command, runs a turn, and reads the session JSONL and outbound request back", async () => {
		const run = await startRun("session-surface");
		try {
			// An extension command is a command turn: it does not invoke the model.
			const command = await run.session.prompt(`/${FIXTURE_COMMAND}`);
			expect(command.agentInvoked).toBe(false);
			expect(command.status).toBe("completed");

			const turn = await run.session.prompt("harness fixture turn");
			expect(turn.agentInvoked).toBe(true);
			expect(turn.status).toBe("completed");

			const exit = await run.session.stop();
			expect(exit.exitCode).toBe(0);

			const log = run.session.sessionLog();
			expect(log.unparsed).toEqual([]);
			// The command's non-LLM entry and the runtime's normal-exit record are persisted.
			expect(customEntries(log.entries, FIXTURE_COMMAND_ENTRY_TYPE).length).toBeGreaterThan(0);
			const exitEntries = customEntries(log.entries, "session_exit");
			expect(exitEntries.length).toBeGreaterThan(0);
			expect((exitEntries[0]?.data as { kind?: string } | undefined)?.kind).toBe("normal");

			// The hidden contribution is persisted hidden, agent-attributed, with its own text.
			const injected = customMessages(log.entries, FIXTURE_INJECTION_TYPE);
			expect(injected.length).toBeGreaterThan(0);
			expect(
				injected.every(
					message =>
						message.content === FIXTURE_INJECTION_TEXT &&
						message.display === false &&
						message.attribution === "agent",
				),
			).toBe(true);

			// The harness also read back the full outbound request the turn produced.
			const requests = run.capture.requests();
			expect(requests.length).toBeGreaterThan(0);
			const latest = requests[requests.length - 1];
			if (!latest) throw new Error("capture did not record the outbound request");
			expect(readFileSync(latest.file, "utf8")).toBe(latest.raw);
			const body = latest.json as { model?: string; messages?: unknown[] } | null;
			expect(body?.model).toBe("harness-model");
			expect(Array.isArray(body?.messages)).toBe(true);
			expect(latest.raw.includes(FIXTURE_INJECTION_TEXT)).toBe(true);
		} finally {
			await disposeRun(run);
		}
	}, 180_000);

	test("reports diagnosable output when a session cannot start", async () => {
		const runRoot = createRunRoot("broken-start");
		const capture = startCaptureServer({ dir: runRoot.captureDir });
		try {
			let caught: unknown;
			try {
				await ControlledSession.start({
					runtime: { cliPath: path.join(runRoot.workDir, "missing-cli.ts") },
					runRoot,
					extensions: [FIXTURE_EXTENSION_ROOT],
					model: HARNESS_MODEL_SELECTOR,
					env: { [HARNESS_CAPTURE_BASE_URL_ENV]: capture.baseUrl },
					readyTimeoutMs: 5_000,
				});
			} catch (error) {
				caught = error;
			}
			expect(caught).toBeInstanceOf(HarnessSessionError);
			const harnessError = caught as HarnessSessionError;
			expect(harnessError.diagnostics).toContain(runRoot.path);
			expect(harnessError.diagnostics).toContain("stderr:");
			expect(harnessError.diagnostics).toContain("missing-cli.ts");
		} finally {
			capture.stop();
			runRoot.dispose();
		}
	}, 60_000);
});
