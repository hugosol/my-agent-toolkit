/**
 * codebase-tools startup recovery on the real OMP harness (S2; P9, P13, P24, P25, P35 of the
 * extension-startup-modes contract).
 *
 * The seam is the OMP extension seam: both real entrypoints are loaded into real isolated sessions,
 * every outbound request is captured, and the session JSONL, the framework's marker-area widget and
 * the notification frames are read back. The recorder of a session is its own file, so the case that
 * restores one starts an independent process over the file the previous one left, exactly as an
 * operator's `--resume` does.
 *
 * Each case starts its own isolated run root, agent state, session directory and working directory,
 * so no formal host configuration, running session or repository file is touched. The visual marker
 * display stays human-led; what is asserted here is the adapter's own `setWidget` publication.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { copyFileSync } from "node:fs";
import * as path from "node:path";
import { INIT_PROMPT, REMINDER_PROMPT } from "../../extensions/codebase-tools/shared-logic/prompts";
import { type IsolatedHarness, REPO_ROOT, ensureIsolatedHarness, readBaselineRecord } from "../harness-dock/baseline";
import { type CaptureServer, type CapturedRequest, startCaptureServer } from "../harness-dock/capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV, DOCK_MODEL_SELECTOR } from "../harness-dock/fixtures/extension-root/provider";
import { type RunRoot, createRunRoot } from "../harness-dock/run-root";
import { ControlledSession, type RpcFrame } from "../harness-dock/session";
import { customEntries, customMessages, readSessionLog } from "../harness-dock/session-log";

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
 * fixture and the mode entrypoint under test. The discovery roots are not loaded, so neither mode
 * can be picked up by directory discovery.
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

/** Whether the area's most recent rendering carries the extension's line. */
function areaShowsLine(session: ControlledSession): boolean {
	const frames = areaFrames(session);
	return JSON.stringify(frames[frames.length - 1]?.widgetLines) === JSON.stringify([MARKER_TEXT]);
}

/**
 * Whether the session's own start published the extension's line, before any run happened.
 *
 * The host's widget transport may deliver the startup publication after the session reports ready,
 * so the case awaits that first area frame rather than reading the stream at one instant. What is
 * asserted is the startup publication itself: a line rendered later, by the first run, is not the
 * session's start.
 */
async function lineAtStart(session: ControlledSession): Promise<boolean> {
	const frame = await session.awaitFrame(
		candidate =>
			candidate.type === "extension_ui_request" &&
			candidate.method === "setWidget" &&
			candidate.widgetKey === MARKER_AREA_KEY,
		"the framework's marker area at session start",
	);
	return JSON.stringify(frame.widgetLines) === JSON.stringify([MARKER_TEXT]);
}

/** The entries one session file records, in journal order. */
function entriesOf(file: string) {
	return readSessionLog(path.dirname(file), file).entries;
}

/** The State payloads one session file records, in journal order. */
function statePayloadsOf(file: string): unknown[] {
	return customEntries(entriesOf(file), STATE_ENTRY_TYPE).map(entry => entry.data);
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

// Frozen by migration ticket01 from OMP 18.5.0 at source 89bd2d72, not written by this test.
// S2 observes the real loader, native selected branch, persisted history and captured request.
// Losing the State entry would omit the reminder and make the next command enable, not disable.
test("pre-source-refactor OMP journal resumes without migration and preserves request/history order (P6, P8, P9)", async () => {
	const run = createRun("source-refactor-historical-state");
	const file = path.join(run.runRoot.sessionDir, "historical.jsonl");
	copyFileSync(path.join(REPO_ROOT, "tests/codebase-tools/fixtures/omp-state-before-source-refactor.jsonl"), file);
	const before = entriesOf(file);
	let session: ControlledSession | undefined;
	try {
		session = await openSession(run, MANUAL_ENTRYPOINT, ["--session", file]);
		expect((await session.prompt("post-refactor historical replay")).status).toBe("completed");
		expect(statePayloadsOf(file)).toEqual([{ enabled: true }]);
		expect(customMessages(entriesOf(file), INIT_IDENTITY)).toHaveLength(1);
		expect(customMessages(entriesOf(file), REMINDER_IDENTITY)).toHaveLength(1);
		const messages = (((requestAt(run, 0).json ?? {}) as CapturedBody).messages ?? []).map(message => messageText(message.content));
		// The two current resource files have identical text. Journal identities above distinguish
		// retained init from appended reminder; the request must carry both, in history order.
		expect(messages.filter(text => text.includes(INIT_PROMPT))).toHaveLength(2);
		// OMP may wrap user text with native request metadata; the historical words and their
		// relative message order, not a Pi-shaped undecorated message, are the preserved contract.
		const oldUser = messages.findIndex(text => text.includes("pre-refactor State compatibility sample"));
		const oldReply = messages.findIndex(text => text.includes("dock-capture-reply"));
		const newUser = messages.findIndex(text => text.includes("post-refactor historical replay"));
		const historicalInit = messages.findIndex(text => text.includes(INIT_PROMPT));
		const currentReminder = messages.length - 1;
		expect(oldUser).toBeGreaterThanOrEqual(0);
		expect(historicalInit).toBeGreaterThan(oldUser);
		expect(oldReply).toBeGreaterThan(historicalInit);
		expect(newUser).toBeGreaterThan(oldReply);
		expect(currentReminder).toBeGreaterThan(newUser);
		expect(lastMessageText(requestAt(run, 0))).toContain(REMINDER_PROMPT);
		expect((await session.prompt(`/${COMMAND}`)).status).toBe("completed");
		expect(notifications(session)).toEqual(["codeBaseTools disabled"]);
		expect(statePayloadsOf(file)).toEqual([{ enabled: true }, { enabled: false }]);
		expect((await session.stop()).exitCode).toBe(0);
		expect(entriesOf(file).slice(0, before.length)).toEqual([...before]);
	} finally {
		await stopQuietly(session);
		disposeRun(run);
	}
}, 300_000);

describe("a session with no recorded value resumed at startup takes its own mode's default (P24, P9)", () => {
	test("a manual session that recorded nothing becomes enabled when an independent process resumes it under the automatic entrypoint", async () => {
		const run = createRun("recovery-default-at-startup");
		let first: ControlledSession | undefined;
		let resumed: ControlledSession | undefined;
		try {
			// The first process runs the manual mode and never changes the value: its session has
			// no record of its own, and its one turn carries no contribution.
			first = await openSession(run, MANUAL_ENTRYPOINT);
			expect((await first.prompt("codebase-tools recovery off turn")).agentInvoked).toBe(true);
			const sessionFile = await sessionFileOf(first);
			expect((await first.stop()).exitCode).toBe(0);
			expect(statePayloadsOf(sessionFile)).toEqual([]);
			expect(injectedMessages(requestAt(run, 0))).toBe(0);

			// A new process resumes that very file under the automatic entrypoint. This is the
			// process's first owner start, so the automatic default applies: it is not a runtime
			// navigation that would leave the session at its declared off value.
			resumed = await openSession(run, AUTOMATIC_ENTRYPOINT, ["--resume", sessionFile]);
			expect(await lineAtStart(resumed)).toBe(true);
			const turn = await resumed.prompt("codebase-tools recovery resumed turn");
			expect(turn.agentInvoked).toBe(true);
			expect(turn.status).toBe("completed");
			expect((await resumed.stop()).exitCode).toBe(0);

			// The resumed session's first request carries the init its now-enabled State selects.
			expect(injectedMessages(requestAt(run, 1))).toBe(1);
			expect(lastMessageText(requestAt(run, 1))).toContain(INIT_PROMPT);
			// The enabling choice was recorded as this session's own value, once, in the ordinary
			// session-entry format the next process restores.
			expect(statePayloadsOf(sessionFile)).toEqual([{ enabled: true }]);
			expect(customMessages(entriesOf(sessionFile), INIT_IDENTITY)).toHaveLength(1);
			// Startup is not a command: nothing announced an activation.
			expect(notifications(resumed)).toEqual([]);
		} finally {
			await stopQuietly(resumed);
			await stopQuietly(first);
			disposeRun(run);
		}
	}, 300_000);
});

describe("a recorded false survives a startup under the enabling policy (P9, P24)", () => {
	test("an independent automatic process restores the disabled value, contributes nothing and leaves the command able to enable it", async () => {
		const run = createRun("recovery-recorded-off");
		let first: ControlledSession | undefined;
		let resumed: ControlledSession | undefined;
		try {
			first = await openSession(run, AUTOMATIC_ENTRYPOINT);
			expect((await first.prompt("codebase-tools recovery enabled once")).agentInvoked).toBe(true);
			// The operator's own decision: off, recorded after the startup record.
			expect((await first.prompt(`/${COMMAND}`)).status).toBe("completed");
			const sessionFile = await sessionFileOf(first);
			expect((await first.stop()).exitCode).toBe(0);
			expect(statePayloadsOf(sessionFile)).toEqual([{ enabled: true }, { enabled: false }]);

			// The next process resumes that session under the enabling mode. The recorded false is
			// its history, so the automatic default must not turn it on.
			resumed = await openSession(run, AUTOMATIC_ENTRYPOINT, ["--resume", sessionFile]);
			expect(await lineAtStart(resumed)).toBe(false);
			const turn = await resumed.prompt("codebase-tools recovery still off turn");
			expect(turn.agentInvoked).toBe(true);
			expect(turn.status).toBe("completed");
			// The branch's earlier init is replayed as history, not contributed again: the turn's
			// own request carries exactly the earlier contribution and ends with its user message.
			expect(injectedMessages(requestAt(run, 1))).toBe(injectedMessages(requestAt(run, 0)));
			expect(lastMessageText(requestAt(run, 1))).toBe("codebase-tools recovery still off turn");
			const afterOffTurn = entriesOf(sessionFile);
			expect(customMessages(afterOffTurn, INIT_IDENTITY)).toHaveLength(1);
			expect(customMessages(afterOffTurn, REMINDER_IDENTITY)).toHaveLength(0);
			// The restored value is really off: the original command enables it rather than turning
			// an enabled value off.
			expect((await resumed.prompt(`/${COMMAND}`)).status).toBe("completed");
			expect((await resumed.stop()).exitCode).toBe(0);

			expect(notifications(resumed)).toEqual([ENABLED_NOTICE]);
			// The resume added no startup record; the only new record is the command's own.
			expect(statePayloadsOf(sessionFile)).toEqual([{ enabled: true }, { enabled: false }, { enabled: true }]);
		} finally {
			await stopQuietly(resumed);
			await stopQuietly(first);
			disposeRun(run);
		}
	}, 300_000);
});

describe("the automatic start's record restores a manual-mode process (P35)", () => {
	test("a session the automatic entry enabled without a command is resumed under the manual entrypoint, and its first run contributes", async () => {
		const run = createRun("recovery-cross-mode");
		let automatic: ControlledSession | undefined;
		let manual: ControlledSession | undefined;
		try {
			// The automatic process enables the session with no command, and a normal turn saves
			// the ordinary session-entry payload together with the init that start selected.
			automatic = await openSession(run, AUTOMATIC_ENTRYPOINT);
			expect((await automatic.prompt("codebase-tools recovery auto saved turn")).agentInvoked).toBe(true);
			const sessionFile = await sessionFileOf(automatic);
			expect((await automatic.stop()).exitCode).toBe(0);
			expect(statePayloadsOf(sessionFile)).toEqual([{ enabled: true }]);
			const beforeResume = entriesOf(sessionFile);
			expect(customMessages(beforeResume, INIT_IDENTITY)).toHaveLength(1);

			// An independent process loads the manual entrypoint — whose own default is off — and
			// resumes the saved session. The recorded true wins, so the line is on from the start
			// and the first run continues the enabled period with its next contribution.
			manual = await openSession(run, MANUAL_ENTRYPOINT, ["--resume", sessionFile]);
			expect(await lineAtStart(manual)).toBe(true);
			const turn = await manual.prompt("codebase-tools recovery manual restored turn");
			expect(turn.agentInvoked).toBe(true);
			expect(turn.status).toBe("completed");

			// The request replays the init the automatic process persisted and appends the reminder:
			// the manual entry's own off default did not take effect.
			expect(injectedMessages(requestAt(run, 1))).toBe(2);
			expect(lastMessageText(requestAt(run, 1))).toContain(REMINDER_PROMPT);
			const afterResume = entriesOf(sessionFile);
			expect(customMessages(afterResume, INIT_IDENTITY)).toHaveLength(1);
			expect(customMessages(afterResume, REMINDER_IDENTITY)).toHaveLength(1);
			// The resume wrote no second record: the automatic process's true is the history.
			expect(statePayloadsOf(sessionFile)).toEqual([{ enabled: true }]);

			// The restored value is really true: the original command turns it off.
			expect((await manual.prompt(`/${COMMAND}`)).status).toBe("completed");
			expect((await manual.stop()).exitCode).toBe(0);
			expect(notifications(manual)).toEqual([DISABLED_NOTICE]);
			expect(statePayloadsOf(sessionFile)).toEqual([{ enabled: true }, { enabled: false }]);
		} finally {
			await stopQuietly(manual);
			await stopQuietly(automatic);
			disposeRun(run);
		}
	}, 300_000);
});

describe("restoring a session keeps its injection progress and its old messages (P13)", () => {
	test("the resumed process continues with the reminder, appends to the journal and writes no State", async () => {
		const run = createRun("recovery-progress");
		let first: ControlledSession | undefined;
		let resumed: ControlledSession | undefined;
		try {
			first = await openSession(run, MANUAL_ENTRYPOINT);
			expect((await first.prompt(`/${COMMAND}`)).status).toBe("completed");
			expect((await first.prompt("codebase-tools recovery progress first turn")).agentInvoked).toBe(true);
			expect((await first.prompt("codebase-tools recovery progress second turn")).agentInvoked).toBe(true);
			const sessionFile = await sessionFileOf(first);
			expect((await first.stop()).exitCode).toBe(0);
			const before = entriesOf(sessionFile);
			// The enabled period injected the init once and then one reminder.
			expect(customMessages(before, INIT_IDENTITY)).toHaveLength(1);
			expect(customMessages(before, REMINDER_IDENTITY)).toHaveLength(1);
			expect(statePayloadsOf(sessionFile)).toEqual([{ enabled: true }]);

			// A new process resumes it. The branch already carries the init's identity, so the first
			// run of the resumed process must continue with the reminder rather than reinstalling
			// the init or resetting the progress.
			resumed = await openSession(run, MANUAL_ENTRYPOINT, ["--resume", sessionFile]);
			expect(await lineAtStart(resumed)).toBe(true);
			const turn = await resumed.prompt("codebase-tools recovery progress resumed turn");
			expect(turn.agentInvoked).toBe(true);
			expect(turn.status).toBe("completed");
			expect((await resumed.stop()).exitCode).toBe(0);

			// The request replays the branch's two contributions and appends exactly one reminder.
			expect(injectedMessages(requestAt(run, 2))).toBe(3);
			expect(lastMessageText(requestAt(run, 2))).toContain(REMINDER_PROMPT);
			const after = entriesOf(sessionFile);
			expect(customMessages(after, INIT_IDENTITY)).toHaveLength(1);
			expect(customMessages(after, REMINDER_IDENTITY)).toHaveLength(2);
			// The earlier entries stand unchanged and in order: restoring appended to history.
			expect([...after.slice(0, before.length)]).toEqual([...before]);
			// A restored session's runs record no State, and the startup added no record either.
			expect(statePayloadsOf(sessionFile)).toEqual([{ enabled: true }]);
			expect(notifications(resumed)).toEqual([]);
		} finally {
			await stopQuietly(resumed);
			await stopQuietly(first);
			disposeRun(run);
		}
	}, 300_000);
});

describe("navigation after the first start follows the ordinary session rules (P25)", () => {
	test("new, fork, resume and a same-owner navigation each start from the session's own value, not the entry default", async () => {
		const run = createRun("recovery-navigation");
		let session: ControlledSession | undefined;
		try {
			// The process starts automatically: its first session is enabled by the startup choice.
			session = await openSession(run, AUTOMATIC_ENTRYPOINT);
			expect((await session.prompt("codebase-tools navigation enabled turn")).agentInvoked).toBe(true);
			const enabledFile = await sessionFileOf(session);
			expect(statePayloadsOf(enabledFile)).toEqual([{ enabled: true }]);

			// A session created in place has no history. The process already started, so the entry
			// default must not enable it.
			expect((await session.request({ type: "new_session" })).success).toBe(true);
			const freshFile = await sessionFileOf(session);
			expect(freshFile).not.toBe(enabledFile);
			expect((await session.prompt("codebase-tools navigation new turn")).agentInvoked).toBe(true);
			expect(injectedMessages(requestAt(run, 1))).toBe(0);
			expect(statePayloadsOf(freshFile)).toEqual([]);

			// A fork of that fresh session copies a branch with no value and no contribution: it is
			// a new session under the ordinary rules, not another startup.
			expect((await session.request({ type: "fork" })).success).toBe(true);
			const forkedFile = await sessionFileOf(session);
			expect(forkedFile).not.toBe(freshFile);
			expect((await session.prompt("codebase-tools navigation fork turn")).agentInvoked).toBe(true);
			expect(injectedMessages(requestAt(run, 2))).toBe(0);
			expect(statePayloadsOf(forkedFile)).toEqual([]);
			expect(areaShowsLine(session)).toBe(false);

			// Resuming another session in the running process restores that session's own facts: the
			// fresh session recorded nothing, so it comes back off rather than on the entry default.
			expect((await session.request({ type: "switch_session", sessionPath: freshFile })).success).toBe(true);
			expect(await sessionFileOf(session)).toBe(freshFile);
			expect((await session.prompt("codebase-tools navigation resume turn")).agentInvoked).toBe(true);
			expect(injectedMessages(requestAt(run, 3))).toBe(0);
			expect(statePayloadsOf(freshFile)).toEqual([]);

			// A navigation that stays in the same session leaves its owner alone, so it is no
			// boundary at all: nothing is reseeded, re-recorded or re-enabled.
			expect((await session.request({ type: "switch_session", sessionPath: freshFile })).success).toBe(true);
			expect(await sessionFileOf(session)).toBe(freshFile);
			expect((await session.prompt("codebase-tools navigation same-owner turn")).agentInvoked).toBe(true);
			expect(injectedMessages(requestAt(run, 4))).toBe(0);
			expect(statePayloadsOf(freshFile)).toEqual([]);
			expect((await session.stop()).exitCode).toBe(0);

			// The first session still holds its own startup record, and no navigation wrote to it.
			expect(statePayloadsOf(enabledFile)).toEqual([{ enabled: true }]);
			// No startup notification appeared anywhere: none of these boundaries was an activation.
			expect(notifications(session).filter(message => message === ENABLED_NOTICE || message === DISABLED_NOTICE)).toEqual(
				[],
			);
		} finally {
			await stopQuietly(session);
			disposeRun(run);
		}
	}, 300_000);
});
