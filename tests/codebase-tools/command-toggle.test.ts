/**
 * codebase-tools command toggle, end to end on the real OMP harness (B1, B2; P6,
 * P11, P12, P36).
 *
 * The observable seam is the OMP extension seam: what the real loader discovers in
 * `entrypoints/omp`, what the session JSONL records, and which UI frames the RPC
 * session emits. Nothing here reaches into framework internals; the run is the
 * explicit-only isolated session the acceptance procedure uses.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import * as path from "node:path";
import { type IsolatedHarness, REPO_ROOT, ensureIsolatedHarness, readBaselineRecord } from "../harness-dock/baseline";
import { type CaptureServer, startCaptureServer } from "../harness-dock/capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV, DOCK_MODEL_SELECTOR } from "../harness-dock/fixtures/extension-root/provider";
import { type RunRoot, createRunRoot } from "../harness-dock/run-root";
import { ControlledSession } from "../harness-dock/session";
import { customEntries } from "../harness-dock/session-log";

/** The OMP discovery root this repository deploys. */
const OMP_ENTRYPOINT_DIR = path.join(REPO_ROOT, "entrypoints", "omp");
/** The credential-free provider fixture; it keeps the turn off the network. */
const PROVIDER_FIXTURE = path.join(REPO_ROOT, "tests", "harness-dock", "fixtures", "extension-root", "provider.ts");

/** The State entry the extension persists, and the command that flips it. */
const STATE_ENTRY_TYPE = "codebase-tools:state";
const COMMAND = "codebase-tools";

let harness: IsolatedHarness;

beforeAll(async () => {
	harness = await ensureIsolatedHarness(readBaselineRecord());
}, 300_000);

interface DockRun {
	readonly session: ControlledSession;
	readonly capture: CaptureServer;
	readonly runRoot: RunRoot;
}

/** Start one isolated session with the dock provider fixture and the real OMP root. */
async function startRun(label: string): Promise<DockRun> {
	const runRoot = createRunRoot(label);
	const capture = startCaptureServer({ dir: runRoot.captureDir });
	try {
		const session = await ControlledSession.start({
			harness,
			runRoot,
			extensions: [PROVIDER_FIXTURE, OMP_ENTRYPOINT_DIR],
			model: DOCK_MODEL_SELECTOR,
			env: { [DOCK_CAPTURE_BASE_URL_ENV]: capture.baseUrl },
		});
		return { session, capture, runRoot };
	} catch (error) {
		capture.stop();
		runRoot.dispose();
		throw error;
	}
}

/** Drop the run's processes and directories; safe to call after an explicit stop. */
async function disposeRun(run: DockRun): Promise<void> {
	try {
		await run.session.stop({ timeoutMs: 5_000 });
	} catch {
		// The session already stopped (or never started); the run root still gets cleaned up.
	}
	run.capture.stop();
	run.runRoot.dispose();
}

describe("clean session load (B1, P36)", () => {
	test("a session that never toggles records no state and contributes nothing", async () => {
		const run = await startRun("codebase-tools-clean");
		try {
			const turn = await run.session.prompt("codebase-tools clean turn");
			expect(turn.agentInvoked).toBe(true);
			expect(turn.status).toBe("completed");

			const exit = await run.session.stop();
			expect(exit.exitCode).toBe(0);

			const log = run.session.sessionLog();
			expect(log.unparsed).toEqual([]);
			// Default off: no state entry, and no contribution of any kind yet.
			expect(customEntries(log.entries, STATE_ENTRY_TYPE)).toEqual([]);
			expect(
				log.entries.filter(entry => entry.customType?.startsWith("codebase-tools:") === true),
			).toEqual([]);
			// No UI frame announced a state the extension never had.
			expect(
				run.session
					.frames()
					.filter(frame => frame.type === "extension_ui_request" && frame.method === "notify"),
			).toEqual([]);
			// The turn really ran, so the absences above are not a vacuous empty session,
			// and its outbound request carried the user's turn and no injected contribution.
			const requests = run.capture.requests();
			expect(requests.length).toBeGreaterThan(0);
			const body = requests[0]?.json as { messages?: ReadonlyArray<{ role?: string }> } | null;
			expect(body?.messages?.filter(message => message.role === "user").length).toBe(1);
		} finally {
			await disposeRun(run);
		}
	}, 180_000);
});

describe("command toggle end to end (B2, P11, P12)", () => {
	test("two runs of /codebase-tools persist each new value and announce it", async () => {
		const run = await startRun("codebase-tools-toggle");
		try {
			// An extension command is a command turn: it does not invoke the model.
			const enable = await run.session.prompt(`/${COMMAND}`);
			expect(enable.agentInvoked).toBe(false);
			expect(enable.status).toBe("completed");

			const disable = await run.session.prompt(`/${COMMAND}`);
			expect(disable.agentInvoked).toBe(false);
			expect(disable.status).toBe("completed");

			// The session file is written lazily; a real turn materializes the journal the
			// command's entries were appended to.
			const turn = await run.session.prompt("codebase-tools turn after toggles");
			expect(turn.agentInvoked).toBe(true);
			expect(turn.status).toBe("completed");

			const exit = await run.session.stop();
			expect(exit.exitCode).toBe(0);

			const log = run.session.sessionLog();
			expect(log.unparsed).toEqual([]);
			// One entry per toggle, in run order, carrying the extension's declared field.
			expect(customEntries(log.entries, STATE_ENTRY_TYPE).map(entry => entry.data)).toEqual([
				{ enabled: true },
				{ enabled: false },
			]);
			// Each notification describes the value its own toggle produced.
			expect(
				run.session
					.frames()
					.filter(frame => frame.type === "extension_ui_request" && frame.method === "notify")
					.map(frame => frame.message),
			).toEqual(["codeBaseTools enabled", "codeBaseTools disabled"]);
		} finally {
			await disposeRun(run);
		}
	}, 180_000);
});
