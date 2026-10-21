/**
 * codebase-tools startup modes on the real OMP harness (S2; P3, P4, P8, P10, P11, P12,
 * P26, P33, P36 of the extension-startup-modes contract).
 *
 * The seam is the OMP extension seam: the real isolated loader loads one mode's entrypoint, a
 * real session runs with the dock's credential-free provider, the outbound request is captured,
 * and the session JSONL, the notification frames and the framework's marker-area widget are
 * read back. The entrypoint a process loads is the whole mode decision — both runs below use the
 * same host parameters and differ only in the entry file — which is what P33 asks the real host
 * to demonstrate. The marker's rendered form stays human-led (see the ticket's P8 preparation);
 * the frames asserted here are the adapter's own `setWidget` publications.
 *
 * Each case starts its own isolated run root, agent state, session directory and working
 * directory, so no formal host configuration, running session or repository file is touched.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import * as path from "node:path";
import { INIT_PROMPT, REMINDER_PROMPT } from "../../extensions/codebase-tools/shared-logic/prompts";
import { type IsolatedHarness, REPO_ROOT, ensureIsolatedHarness, readBaselineRecord } from "../harness-dock/baseline";
import { type CaptureServer, type CapturedRequest, startCaptureServer } from "../harness-dock/capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV, DOCK_MODEL_SELECTOR } from "../harness-dock/fixtures/extension-root/provider";
import { type RunRoot, createRunRoot } from "../harness-dock/run-root";
import { ControlledSession, type RpcFrame } from "../harness-dock/session";
import { type SessionEntry, customEntries, customMessages } from "../harness-dock/session-log";

/** Each mode's entrypoint file: the only difference between the two host invocations. */
const MANUAL_ENTRYPOINT = path.join(REPO_ROOT, "entrypoints", "omp", "codebase-tools.ts");
const AUTOMATIC_ENTRYPOINT = path.join(REPO_ROOT, "entrypoints", "omp-auto", "codebase-tools.ts");
/** The credential-free provider fixture; it keeps each turn off the network. */
const PROVIDER_FIXTURE = path.join(REPO_ROOT, "tests", "harness-dock", "fixtures", "extension-root", "provider.ts");

/** The framework-fixed identities and the extension's own declaration. */
const INIT_IDENTITY = "codebase-tools:init";
const REMINDER_IDENTITY = "codebase-tools:reminder";
const STATE_ENTRY_TYPE = "codebase-tools:state";
const COMMAND = "codebase-tools";
const ENABLED_NOTICE = "codeBaseTools enabled";
const DISABLED_NOTICE = "codeBaseTools disabled";
/** The framework's one marker area, and the line the extension's enabled state renders. */
const MARKER_AREA_KEY = "semantic-extensions";
const MARKER_AREA_PLACEMENT = "aboveEditor";
const MARKER_TEXT = "◈ codeBaseTools";

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

/**
 * Start one session over the run's session directory with exactly two extensions: the provider
 * fixture and the mode entrypoint under test. The manual discovery root is deliberately not
 * loaded, so the automatic run cannot pick the manual assembly up by directory discovery.
 */
function openSession(run: Run, entrypoint: string, extraArgs: readonly string[] = []): Promise<ControlledSession> {
	return ControlledSession.start({
		harness,
		runRoot: run.runRoot,
		extensions: [PROVIDER_FIXTURE, entrypoint],
		model: DOCK_MODEL_SELECTOR,
		env: { [DOCK_CAPTURE_BASE_URL_ENV]: run.capture.baseUrl },
		extraArgs,
	});
}

function disposeRun(run: Run): void {
	run.capture.stop();
	run.runRoot.dispose();
}

/** Drop a session's process; safe to call after an explicit stop. */
async function stopQuietly(session: ControlledSession | undefined): Promise<void> {
	if (session === undefined) return;
	try {
		await session.stop({ timeoutMs: 5_000 });
	} catch {
		// The session already stopped (or never started); the run root still gets cleaned up.
	}
}

/** The session file the harness reports for the session it currently runs. */
async function sessionFileOf(session: ControlledSession): Promise<string> {
	const frame = await session.request({ type: "get_state" });
	const file = (frame.data as { sessionFile?: string } | undefined)?.sessionFile;
	if (file === undefined) throw new Error(`the harness reported no session file: ${JSON.stringify(frame)}`);
	return file;
}

/** The feedback notifications one session published, in order. */
function notifications(session: ControlledSession): string[] {
	return session
		.frames()
		.filter(frame => frame.type === "extension_ui_request" && frame.method === "notify")
		.map(frame => String(frame.message));
}

/** The renderings the framework's marker area published for one session, in order. */
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

/** The State payloads one session file records, in journal order. */
function statePayloadsOf(session: ControlledSession, file: string): unknown[] {
	return customEntries(session.sessionLog(file).entries, STATE_ENTRY_TYPE).map(entry => entry.data);
}

/** The parsed shape of one captured request body: this harness's own serialized JSON. */
interface CapturedBody {
	readonly messages?: ReadonlyArray<{ readonly content?: unknown }>;
}

/** The plain text of one provider message content. */
function messageText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map(part => (typeof part === "object" && part !== null && "text" in part ? String(part.text) : ""))
		.join("");
}

/** How many provider messages one captured request carries either injected slot's text. */
function injectedMessages(request: CapturedRequest): number {
	const needles = [INIT_PROMPT, REMINDER_PROMPT];
	return (((request.json ?? {}) as CapturedBody).messages ?? []).filter(message => {
		const text = messageText(message.content);
		return needles.some(needle => text.includes(needle));
	}).length;
}

/** The last provider message's text, or none when the request carried nothing. */
function lastMessageText(request: CapturedRequest): string {
	const messages = ((request.json ?? {}) as CapturedBody).messages ?? [];
	const last: { readonly content?: unknown } | undefined = messages[messages.length - 1];
	return last === undefined ? "" : messageText(last.content);
}

/** One captured request by index, with the run's own count in the failure detail when absent. */
function requestAt(run: Run, index: number): CapturedRequest {
	const requests = run.capture.requests();
	const request: CapturedRequest | undefined = requests[index];
	if (request === undefined) {
		throw new Error(`the run captured ${requests.length} provider request(s); request ${index + 1} is missing`);
	}
	return request;
}

describe("the automatic entrypoint enables the first main session without a command (P3, P8, P11, P33)", () => {
	test("the first model request already carries the init the startup State selects, and the value is recorded", async () => {
		const run = createRun("startup-automatic");
		let session: ControlledSession | undefined;
		try {
			session = await openSession(run, AUTOMATIC_ENTRYPOINT);
			const first = await session.prompt("codebase-tools automatic first turn");
			expect(first.agentInvoked).toBe(true);
			expect(first.status).toBe("completed");
			const second = await session.prompt("codebase-tools automatic second turn");
			expect(second.agentInvoked).toBe(true);
			expect(second.status).toBe("completed");
			const sessionFile = await sessionFileOf(session);
			expect((await session.stop()).exitCode).toBe(0);

			const log = session.sessionLog(sessionFile);
			expect(log.unparsed).toEqual([]);

			// The session's own record states the startup choice, exactly once, and it was written
			// before the first user message that produced the first request.
			const states = customEntries(log.entries, STATE_ENTRY_TYPE);
			expect(states.map(entry => entry.data)).toEqual([{ enabled: true }]);
			const userEntry = log.entries.find(
				entry => entry.type === "message" && (entry.message as { role?: string } | undefined)?.role === "user",
			);
			expect(userEntry).toBeDefined();
			expect(log.entries.indexOf(states[0] as SessionEntry)).toBeLessThan(
				log.entries.indexOf(userEntry as SessionEntry),
			);

			// The first model request really carried the contribution the enabled State selects,
			// appended after that turn's own user message. A marker published after the request
			// would not be this evidence.
			const requests = run.capture.requests();
			expect(requests).toHaveLength(2);
			expect(injectedMessages(requestAt(run, 0))).toBe(1);
			expect(lastMessageText(requestAt(run, 0))).toContain(INIT_PROMPT);
			const init = customMessages(log.entries, INIT_IDENTITY);
			expect(init).toHaveLength(1);
			expect(init[0]).toMatchObject({ customType: INIT_IDENTITY, content: INIT_PROMPT, display: false });

			// The next enabled run adds the reminder slot and does not re-inject the init.
			expect(injectedMessages(requestAt(run, 1))).toBe(2);
			expect(customMessages(log.entries, REMINDER_IDENTITY)).toHaveLength(1);
			expect(customMessages(log.entries, INIT_IDENTITY)).toHaveLength(1);

			// The enabled value was visible in the framework's area from the session's own start,
			// which is the automated face of the marker the human-led check will read. The start and
			// each enabled run publish the line; the disposal that follows the stop is not this
			// extension's value and carries none.
			const frames = areaFrames(session);
			expect(frames[0]?.widgetLines).toEqual([MARKER_TEXT]);
			expect(frames[0]?.widgetPlacement).toBe(MARKER_AREA_PLACEMENT);
			const shown = frames.filter(frame => JSON.stringify(frame.widgetLines) === JSON.stringify([MARKER_TEXT]));
			expect(shown.length).toBeGreaterThanOrEqual(3);

			// No command ran, so nothing announced an activation.
			expect(notifications(session)).toEqual([]);
		} finally {
			await stopQuietly(session);
			disposeRun(run);
		}
	}, 300_000);
});

describe("the automatic entrypoint restores a recorded value and keeps its command (P10, P12)", () => {
	test("a resumed enabled session stays on without another startup record, and the command still toggles it", async () => {
		const run = createRun("startup-automatic-resume");
		let first: ControlledSession | undefined;
		let resumed: ControlledSession | undefined;
		try {
			first = await openSession(run, AUTOMATIC_ENTRYPOINT);
			expect((await first.prompt("codebase-tools automatic seed turn")).agentInvoked).toBe(true);
			const sessionFile = await sessionFileOf(first);
			expect((await first.stop()).exitCode).toBe(0);
			expect(statePayloadsOf(first, sessionFile)).toEqual([{ enabled: true }]);

			// A new process resumes the session under the same automatic entrypoint. The recorded
			// true is the history, and a target already reached must not be applied as a toggle or
			// recorded a second time.
			resumed = await openSession(run, AUTOMATIC_ENTRYPOINT, ["--resume", sessionFile]);
			const turn = await resumed.prompt("codebase-tools automatic resumed turn");
			expect(turn.agentInvoked).toBe(true);
			expect(turn.status).toBe("completed");
			// The restored value was on the area from the session's own start.
			const frames = areaFrames(resumed);
			expect(frames[0]?.widgetLines).toEqual([MARKER_TEXT]);

			// The original command still toggles the extension after startup.
			expect((await resumed.prompt(`/${COMMAND}`)).status).toBe("completed");
			expect((await resumed.prompt("codebase-tools automatic disabled turn")).agentInvoked).toBe(true);
			expect((await resumed.stop()).exitCode).toBe(0);

			expect(notifications(resumed)).toEqual([DISABLED_NOTICE]);
			// The resume wrote no startup record: the one true is the first process's, and the one
			// false is the command's.
			expect(statePayloadsOf(resumed, sessionFile)).toEqual([{ enabled: true }, { enabled: false }]);
			// The resumed run replayed the init from the branch and added one reminder; the startup
			// choice did not inject a second init.
			const log = resumed.sessionLog(sessionFile);
			expect(customMessages(log.entries, INIT_IDENTITY)).toHaveLength(1);
			expect(customMessages(log.entries, REMINDER_IDENTITY)).toHaveLength(1);
			expect(injectedMessages(requestAt(run, 1))).toBe(2);
			// The disabled run adds no contribution to the branch (its request replays the two).
			expect(injectedMessages(requestAt(run, 2))).toBe(2);
		} finally {
			await stopQuietly(resumed);
			await stopQuietly(first);
			disposeRun(run);
		}
	}, 300_000);
});

describe("the automatic choice is not applied again after a command changes it (P26)", () => {
	test("a new session in the running process starts off and records nothing, until its own command enables it", async () => {
		const run = createRun("startup-automatic-next");
		let session: ControlledSession | undefined;
		try {
			session = await openSession(run, AUTOMATIC_ENTRYPOINT);
			expect((await session.prompt("codebase-tools automatic first turn")).agentInvoked).toBe(true);
			// The operator's later choice: off.
			expect((await session.prompt(`/${COMMAND}`)).status).toBe("completed");

			// A new session in the same process has no history of its own. The process already
			// started, so the automatic choice must not be applied to it a second time.
			expect((await session.request({ type: "new_session" })).success).toBe(true);
			expect((await session.prompt("codebase-tools fresh session turn")).agentInvoked).toBe(true);
			const freshFile = await sessionFileOf(session);
			expect(statePayloadsOf(session, freshFile)).toEqual([]);
			expect(injectedMessages(requestAt(run, 1))).toBe(0);
			const offFrames = areaFrames(session);
			expect(offFrames[offFrames.length - 1]?.widgetLines).toBeUndefined();

			// The extension remains operable in the new session: its command enables it and the
			// next run contributes.
			expect((await session.prompt(`/${COMMAND}`)).status).toBe("completed");
			expect((await session.prompt("codebase-tools fresh enabled turn")).agentInvoked).toBe(true);
			expect((await session.stop()).exitCode).toBe(0);

			expect(notifications(session)).toEqual([DISABLED_NOTICE, ENABLED_NOTICE]);
			expect(statePayloadsOf(session, freshFile)).toEqual([{ enabled: true }]);
			expect(injectedMessages(requestAt(run, 2))).toBe(1);
			// The command's enabled transition (and the run after it) rendered the line.
			const frames = areaFrames(session);
			expect(frames.some(frame => JSON.stringify(frame.widgetLines) === JSON.stringify([MARKER_TEXT]))).toBe(
				true,
			);
		} finally {
			await stopQuietly(session);
			disposeRun(run);
		}
	}, 300_000);
});

describe("the manual entrypoint keeps its original off default and its command (P2, P8, P36)", () => {
	test("a session with no operation contributes nothing and records no State, and the command still toggles", async () => {
		const run = createRun("startup-manual");
		let silent: ControlledSession | undefined;
		let toggled: ControlledSession | undefined;
		try {
			// A session that never runs a command: the manual policy's explicit false is the value,
			// not a record.
			silent = await openSession(run, MANUAL_ENTRYPOINT);
			expect((await silent.prompt("codebase-tools manual silent turn")).agentInvoked).toBe(true);
			const silentFile = await sessionFileOf(silent);
			expect((await silent.stop()).exitCode).toBe(0);

			const silentLog = silent.sessionLog(silentFile);
			expect(silentLog.unparsed).toEqual([]);
			expect(customEntries(silentLog.entries, STATE_ENTRY_TYPE)).toEqual([]);
			expect(injectedMessages(requestAt(run, 0))).toBe(0);
			expect(notifications(silent)).toEqual([]);
			const opened = areaFrames(silent);
			expect(opened.length).toBeGreaterThanOrEqual(1);
			for (const frame of opened) expect(frame.widgetLines).toBeUndefined();

			// The same entrypoint in a fresh process: its own command still turns the extension on
			// and off, with the original notification, marker and persistence effects.
			toggled = await openSession(run, MANUAL_ENTRYPOINT);
			expect((await toggled.prompt(`/${COMMAND}`)).status).toBe("completed");
			const enabledTurn = await toggled.prompt("codebase-tools manual enabled turn");
			expect(enabledTurn.agentInvoked).toBe(true);
			expect((await toggled.prompt(`/${COMMAND}`)).status).toBe("completed");
			const disabledTurn = await toggled.prompt("codebase-tools manual disabled turn");
			expect(disabledTurn.agentInvoked).toBe(true);
			const toggledFile = await sessionFileOf(toggled);
			expect((await toggled.stop()).exitCode).toBe(0);

			expect(notifications(toggled)).toEqual([ENABLED_NOTICE, DISABLED_NOTICE]);
			expect(statePayloadsOf(toggled, toggledFile)).toEqual([{ enabled: true }, { enabled: false }]);
			// The enabled transition rendered the line, and the last rendering — after disabling and
			// the disabled turn's own re-assert — carries no line.
			const frames = areaFrames(toggled);
			expect(frames.some(frame => JSON.stringify(frame.widgetLines) === JSON.stringify([MARKER_TEXT]))).toBe(
				true,
			);
			expect(frames[frames.length - 1]?.widgetLines).toBeUndefined();
			// The enabled turn carried the init; the disabled turn added no new contribution to the
			// branch, so the later request replays the same one contribution from history.
			expect(injectedMessages(requestAt(run, 1))).toBe(1);
			expect(injectedMessages(requestAt(run, 2))).toBe(1);
		} finally {
			await stopQuietly(silent);
			await stopQuietly(toggled);
			disposeRun(run);
		}
	}, 300_000);
});
