/**
 * The marker life cycle on the real OMP harness (B2, B6, B1/P36; P13, P14, C10, N9).
 *
 * The observable seam is the OMP extension seam: the isolated RPC session the acceptance
 * procedure uses emits the framework's UI requests, and those frames are the automated
 * face of the marker the interactive TUI renders (the visual check stays human-led).
 * Nothing here reaches into framework internals: the frames are what the real adapter
 * published for this session.
 *
 * The extension supplies only its marker text; the widget key and placement are the
 * framework's, so every assertion below names the framework's area, never the extension's
 * id — an extension that could choose its widget would be visible as a second key.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import * as path from "node:path";
import { type IsolatedHarness, REPO_ROOT, ensureIsolatedHarness, readBaselineRecord } from "../harness-dock/baseline";
import { type CaptureServer, startCaptureServer } from "../harness-dock/capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV, DOCK_MODEL_SELECTOR } from "../harness-dock/fixtures/extension-root/provider";
import { type RunRoot, createRunRoot } from "../harness-dock/run-root";
import { ControlledSession, type RpcFrame } from "../harness-dock/session";

/** The OMP discovery root this repository deploys. */
const OMP_ENTRYPOINT_DIR = path.join(REPO_ROOT, "entrypoints", "omp");
/** The credential-free provider fixture; it keeps each turn off the network. */
const PROVIDER_FIXTURE = path.join(REPO_ROOT, "tests", "harness-dock", "fixtures", "extension-root", "provider.ts");

/**
 * The framework's area and the extension's migrated marker text. Both are consumer-visible:
 * the key is the one widget the framework owns, and the text is what the TUI shows.
 */
const MARKER_AREA_KEY = "semantic-extensions";
const MARKER_AREA_PLACEMENT = "aboveEditor";
const MARKER_TEXT = "◈ codeBaseTools";
const COMMAND = "codebase-tools";

let harness: IsolatedHarness;

beforeAll(async () => {
	harness = await ensureIsolatedHarness(readBaselineRecord());
}, 300_000);

interface Run {
	readonly runRoot: RunRoot;
	readonly capture: CaptureServer;
}

function createRun(label: string): Run {
	const runRoot = createRunRoot(label);
	return { runRoot, capture: startCaptureServer({ dir: runRoot.captureDir }) };
}

/** Start one session in a run: the same session directory, a fresh process. */
function openSession(run: Run, extraArgs: readonly string[] = []): Promise<ControlledSession> {
	return ControlledSession.start({
		harness,
		runRoot: run.runRoot,
		extensions: [PROVIDER_FIXTURE, OMP_ENTRYPOINT_DIR],
		model: DOCK_MODEL_SELECTOR,
		env: { [DOCK_CAPTURE_BASE_URL_ENV]: run.capture.baseUrl },
		extraArgs,
	});
}

/** Stop a session if it is still live; safe to call after an explicit stop. */
async function stopSession(session: ControlledSession | undefined): Promise<void> {
	if (session === undefined) return;
	try {
		await session.stop({ timeoutMs: 5_000 });
	} catch {
		// The session already stopped (or never started); the run root still gets cleaned up.
	}
}

/** Drop a run's capture server and directories. */
function disposeRun(run: Run): void {
	run.capture.stop();
	run.runRoot.dispose();
}

/** The session file the harness reports for the session it currently runs. */
async function sessionFileOf(session: ControlledSession): Promise<string> {
	const frame = await session.request({ type: "get_state" });
	const file = (frame.data as { sessionFile?: string } | undefined)?.sessionFile;
	if (file === undefined) throw new Error(`the harness reported no session file: ${JSON.stringify(frame)}`);
	return file;
}

/**
 * The frames the framework's marker area published for one session, in order.
 *
 * The area is one process-wide widget shared by every bound extension, and a session boundary
 * refreshes it once per extension that declares a marker — this repository's discovery root binds
 * two — so one boundary contributes one frame per such extension, each carrying the same render.
 * A frame this extension's own transition or run produces is this extension's alone: exactly one
 * per transition and per run it is active in.
 */
function areaFrames(session: ControlledSession): RpcFrame[] {
	return session
		.frames()
		.filter(
			frame =>
				frame.type === "extension_ui_request" &&
				frame.method === "setWidget" &&
				frame.widgetKey === MARKER_AREA_KEY,
		);
}

describe("marker area over one command toggle (B2, B6, C10, P13)", () => {
	test("a default-off session shows no marker; the toggle shows, each enabled turn re-asserts, and off clears", async () => {
		const run = createRun("codebase-tools-marker");
		let session: ControlledSession | undefined;
		try {
			session = await openSession(run);

			// Default off: a real turn runs, and the session boundary has published the
			// framework's area for the session it opened. That rendering is empty — the
			// framework clears its widget rather than letting a session start on whatever the
			// widget showed before it — and the off run adds nothing of its own. Every
			// marker-declaring extension bound in the process performs that refresh at its own
			// boundary, so the fact is the render itself, not how many extensions repeated it.
			const cleanTurn = await session.prompt("codebase-tools marker clean turn");
			expect(cleanTurn.agentInvoked).toBe(true);
			expect(cleanTurn.status).toBe("completed");
			const opened = areaFrames(session);
			expect(opened.length).toBeGreaterThanOrEqual(1);
			for (const frame of opened) {
				expect(frame.widgetKey).toBe(MARKER_AREA_KEY);
				expect(frame.widgetLines).toBeUndefined();
				expect(frame.widgetPlacement).toBe(MARKER_AREA_PLACEMENT);
			}

			const enable = await session.prompt(`/${COMMAND}`);
			expect(enable.agentInvoked).toBe(false);
			expect(enable.status).toBe("completed");
			// The toggle is this extension's own transition: it publishes the area exactly once,
			// and that render carries the line.
			const shown = areaFrames(session);
			const lastShown = shown[shown.length - 1];
			expect(shown.length).toBe(opened.length + 1);
			expect(lastShown?.widgetLines).toEqual([MARKER_TEXT]);
			expect(lastShown?.widgetPlacement).toBe(MARKER_AREA_PLACEMENT);

			const enabledTurn = await session.prompt("codebase-tools marker enabled turn");
			expect(enabledTurn.agentInvoked).toBe(true);
			expect(enabledTurn.status).toBe("completed");
			// The enabled run re-asserts the area with the same line: one more render, the line.
			const reasserted = areaFrames(session);
			expect(reasserted.length).toBe(shown.length + 1);
			expect(reasserted[reasserted.length - 1]?.widgetLines).toEqual([MARKER_TEXT]);

			const disable = await session.prompt(`/${COMMAND}`);
			expect(disable.agentInvoked).toBe(false);
			expect(disable.status).toBe("completed");
			// Off removes the line, and with the area empty the framework clears the widget
			// instead of leaving an empty one behind.
			const cleared = areaFrames(session);
			const lastCleared = cleared[cleared.length - 1];
			expect(cleared.length).toBe(reasserted.length + 1);
			expect(lastCleared?.widgetKey).toBe(MARKER_AREA_KEY);
			expect(lastCleared?.widgetLines).toBeUndefined();
			expect(lastCleared?.widgetPlacement).toBe(MARKER_AREA_PLACEMENT);

			const exit = await session.stop();
			expect(exit.exitCode).toBe(0);
		} finally {
			await stopSession(session);
			disposeRun(run);
		}
	}, 300_000);
});

describe("a restored activation value (P13, B6)", () => {
	test("a resumed enabled session renders the restored line at its boundary and re-asserts it per turn (P13, B6, F9)", async () => {
		const run = createRun("codebase-tools-marker-resume");
		let first: ControlledSession | undefined;
		let resumed: ControlledSession | undefined;
		try {
			first = await openSession(run);
			const enable = await first.prompt(`/${COMMAND}`);
			expect(enable.status).toBe("completed");
			// The session file is written lazily; a real turn materializes the journal the
			// command's State entry was appended to, which is what the resume then reads back.
			const seedTurn = await first.prompt("codebase-tools marker pre-resume turn");
			expect(seedTurn.status).toBe("completed");
			const sessionFile = await sessionFileOf(first);
			const exit = await first.stop();
			expect(exit.exitCode).toBe(0);

			resumed = await openSession(run, ["--resume", sessionFile]);
			const turn = await resumed.prompt("codebase-tools marker resumed turn");
			expect(turn.agentInvoked).toBe(true);
			expect(turn.status).toBe("completed");
			// The boundary rendered the value this session came back with: the restored line was
			// on the area from the session's own start, not only from its first enabled run, and
			// that enabled run then re-asserted the same line. A boundary writes the one area once
			// per marker-declaring extension bound in the process, so the first render is the
			// session's own start and the last is the turn's re-assert; both carry the line.
			const shown = areaFrames(resumed);
			expect(shown.length).toBeGreaterThanOrEqual(2);
			expect(shown[0]?.widgetLines).toEqual([MARKER_TEXT]);
			expect(shown[shown.length - 1]?.widgetLines).toEqual([MARKER_TEXT]);

			const resumedExit = await resumed.stop();
			expect(resumedExit.exitCode).toBe(0);
		} finally {
			await stopSession(first);
			await stopSession(resumed);
			disposeRun(run);
		}
	}, 300_000);
});

describe("marker area without a UI (P14, N9)", () => {
	test("a headless session renders nothing, still completes the toggles, and reports them on stderr", async () => {
		const run = createRun("codebase-tools-marker-headless");
		let session: ControlledSession | undefined;
		try {
			session = await openSession(run, ["--no-ui"]);

			const enable = await session.prompt(`/${COMMAND}`);
			expect(enable.status).toBe("completed");
			const turn = await session.prompt("codebase-tools marker headless turn");
			expect(turn.agentInvoked).toBe(true);
			expect(turn.status).toBe("completed");
			const disable = await session.prompt(`/${COMMAND}`);
			expect(disable.status).toBe("completed");

			const exit = await session.stop();
			// No UI is not a failure: the session ran to a clean exit.
			expect(exit.exitCode).toBe(0);
			// The whole marker path is a no-op here: no widget frame exists for any key.
			expect(
				session.frames().filter(frame => frame.type === "extension_ui_request" && frame.method === "setWidget"),
			).toEqual([]);
			// The feedback that would have gone to the UI reached the non-model channel instead.
			expect(exit.stderr).toContain("codeBaseTools enabled");
			expect(exit.stderr).toContain("codeBaseTools disabled");
		} finally {
			await stopSession(session);
			disposeRun(run);
		}
	}, 300_000);
});
