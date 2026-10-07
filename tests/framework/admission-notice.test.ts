/**
 * The unlisted-version notice on the real agent runtime (P25, P27, N1, N9; C13, C14).
 *
 * The fixture entrypoint is the repository's real assembly with a support set the running
 * runtime is not part of, which is the situation a small upgrade produces. The observables
 * are the ones the acceptance procedure uses: the RPC session's frames and stderr, the
 * session JSONL the runtime persists, and the outbound requests the capture endpoint
 * recorded. Nothing here reaches into framework internals, and nothing modifies the agent
 * runtime, its install or any host configuration.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import * as path from "node:path";
import { type IsolatedRuntime, REPO_ROOT, ensureIsolatedRuntime, readBaselineRecord } from "../harness/baseline";
import { type CaptureServer, startCaptureServer } from "../harness/capture-server";
import { HARNESS_CAPTURE_BASE_URL_ENV, HARNESS_MODEL_SELECTOR } from "../harness/fixtures/extension-root/provider";
import { type RunRoot, createRunRoot } from "../harness/run-root";
import { ControlledSession, type RpcFrame } from "../harness/session";

/** The fixture root: one extension entrypoint declaring a support set without this runtime. */
const UNLISTED_ROOT = path.join(REPO_ROOT, "tests", "harness", "fixtures", "unlisted-version");
/** The credential-free provider fixture; it keeps the turn off the network. */
const PROVIDER_FIXTURE = path.join(REPO_ROOT, "tests", "harness", "fixtures", "extension-root", "provider.ts");
/** The declared support set of the fixture entrypoint, and the extension's display name. */
const DECLARED_SUPPORT = "0.0.0-unlisted";
const DISPLAY_NAME = "codeBaseTools";
/** The phrase every unlisted-version notice carries, whichever channel it uses. */
const NOTICE_MARKER = "is not in the supported set";

let runtime: IsolatedRuntime;

beforeAll(async () => {
	runtime = await ensureIsolatedRuntime(readBaselineRecord());
}, 300_000);

interface HarnessRun {
	readonly session: ControlledSession;
	readonly capture: CaptureServer;
	readonly runRoot: RunRoot;
}

/** Start one isolated session with the harness provider and the unlisted-version fixture. */
async function startRun(label: string, extraArgs: readonly string[] = []): Promise<HarnessRun> {
	const runRoot = createRunRoot(label);
	const capture = startCaptureServer({ dir: runRoot.captureDir });
	try {
		const session = await ControlledSession.start({
			runtime,
			runRoot,
			extensions: [PROVIDER_FIXTURE, UNLISTED_ROOT],
			model: HARNESS_MODEL_SELECTOR,
			env: { [HARNESS_CAPTURE_BASE_URL_ENV]: capture.baseUrl },
			extraArgs,
		});
		return { session, capture, runRoot };
	} catch (error) {
		capture.stop();
		runRoot.dispose();
		throw error;
	}
}

async function disposeRun(run: HarnessRun): Promise<void> {
	try {
		await run.session.stop({ timeoutMs: 5_000 });
	} catch {
		// The session already stopped (or never started); the run root still gets cleaned up.
	}
	run.capture.stop();
	run.runRoot.dispose();
}

/** The warning-level notices the session's UI channel carried, in order. */
function warningNotices(session: ControlledSession): RpcFrame[] {
	return session
		.frames()
		.filter(
			frame =>
				frame.type === "extension_ui_request" && frame.method === "notify" && frame.notifyType === "warning",
		);
}

describe("an unlisted version on the real runtime (P25, N1)", () => {
	test("the main session is warned once and the extension keeps running", async () => {
		const run = await startRun("admission-unlisted-ui");
		try {
			// A real turn runs normally: the unlisted version does not stop the extension.
			const turn = await run.session.prompt("admission unlisted turn");
			expect(turn.agentInvoked).toBe(true);
			expect(turn.status).toBe("completed");

			// The session has been told exactly once, on its own UI channel.
			const notices = warningNotices(run.session);
			expect(notices).toHaveLength(1);
			expect(notices[0]?.notifyType).toBe("warning");
			const message = String(notices[0]?.message ?? "");
			expect(message).toContain(DISPLAY_NAME);
			// The version the runtime reports is the version under test — the recorded
			// supported version by default, the `OMP_TEST_VERSION` candidate when set.
			expect(message).toContain(runtime.version);
			expect(message).toContain(DECLARED_SUPPORT);

			// Continue: the extension's command is still registered and still works.
			const toggle = await run.session.prompt("/codebase-tools");
			expect(toggle.agentInvoked).toBe(false);
			expect(toggle.status).toBe("completed");

			const exit = await run.session.stop();
			expect(exit.exitCode).toBe(0);

			// Still exactly one notice, for the whole session.
			expect(warningNotices(run.session)).toHaveLength(1);

			// The notice reached no model context: it is in no persisted session entry and
			// in no outbound request body.
			const requests = run.capture.requests();
			expect(requests.length).toBeGreaterThan(0);
			for (const request of requests) expect(request.raw).not.toContain(NOTICE_MARKER);
			const log = run.session.sessionLog();
			expect(log.entries.filter(entry => JSON.stringify(entry).includes(NOTICE_MARKER))).toEqual([]);
		} finally {
			await disposeRun(run);
		}
	}, 300_000);

	test("a session without a UI gets the same notice as one stderr line", async () => {
		const run = await startRun("admission-unlisted-headless", ["--no-ui"]);
		try {
			const turn = await run.session.prompt("admission unlisted headless turn");
			expect(turn.agentInvoked).toBe(true);
			expect(turn.status).toBe("completed");

			const exit = await run.session.stop();
			expect(exit.exitCode).toBe(0);

			// No UI frames at all in this mode, and the notice is one stderr line.
			expect(warningNotices(run.session)).toEqual([]);
			const noticeLines = run.session.stderr().split("\n").filter(line => line.includes(NOTICE_MARKER));
			expect(noticeLines).toHaveLength(1);
			expect(noticeLines[0]).toContain(DISPLAY_NAME);
			expect(noticeLines[0]).toContain(runtime.version);
			expect(noticeLines[0]).toContain(DECLARED_SUPPORT);
		} finally {
			await disposeRun(run);
		}
	}, 300_000);
});
