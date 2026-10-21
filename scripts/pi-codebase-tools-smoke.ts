/**
 * codebase-tools on the real pi CLI: the injected-prompt, toggle, marker and
 * session-boundary behaviors, observed end to end over pi's RPC protocol.
 *
 * Usage
 *   bun scripts/pi-codebase-tools-smoke.ts                  # resolve the installed pi CLI
 *   bun scripts/pi-codebase-tools-smoke.ts --pi <path>      # or PI_CLI=<path>: the package's
 *                                                           # dist/bundle/cli.js, a pi.cmd/pi shim, or the binary
 *   bun scripts/pi-codebase-tools-smoke.ts --mode auto      # drive the automatic startup entrypoint
 *   bun scripts/pi-codebase-tools-smoke.ts --keep           # keep every run root for inspection
 *
 * What it drives: the real installed pi as a child process in RPC mode with
 * `--no-extensions -e <mode entrypoint> --no-mcp`, an isolated agent state, session directory and
 * working directory under the OS temp root, and a local OpenAI-compatible capture endpoint (the
 * dock's `capture-server.ts`) declared through the run's own `models.json` with a dummy key. The
 * default agent state, the formal configuration and any running agent are never touched, no real
 * credential is read, and no repository file is written. Every phase gets its own run root, so
 * the phases are independent and the whole smoke is repeatable.
 *
 * `--mode manual` (the default) loads `entrypoints/pi/codebase-tools.ts`; `--mode auto` loads
 * `entrypoints/pi-auto/codebase-tools.ts`. The entrypoint is the whole mode decision: nothing
 * else about the invocation differs.
 *
 * What it asserts in manual mode (consumer-visible behavior only; no source or wiring inspection):
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
 * What it asserts in automatic mode:
 *   1. no command is issued: the first run's request already carries the startup-selected
 *      contribution, the marker line is visible from the session's own start, and the session
 *      records the startup choice as its initial State;
 *   2. the original command still disables and enables it after startup, with the original
 *      notification, marker and persistence effects;
 *   3. a new session created in place in the same process is not enabled again by the startup
 *      choice and records no startup State, while the command still enables it;
 *   4. a session resumed in a new process restores the recorded true, contributes on its first
 *      run, and writes no second startup record — the target is not applied as a toggle.
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
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import type { CapturedRequest } from "../tests/harness-dock/capture-server";
import {
	type PiCli,
	PI_COMMAND_TIMEOUT_MS,
	PI_NODE_EXECUTABLE,
	type PiRpcFrame as RpcFrame,
	PiSession,
	type PiRun,
	piVersion,
	resolvePiCli,
	startPiRun,
} from "../tests/harness-dock/pi-session";
import type { SessionEntry, SessionLog } from "../tests/harness-dock/session-log";

/** The repository root: this script lives in `scripts/`. */
const REPO_ROOT = path.resolve(import.meta.dir, "..");

/** The two mode entrypoints: which one this smoke loads is its only mode decision. */
const MANUAL_ENTRYPOINT = path.join(REPO_ROOT, "entrypoints", "pi", "codebase-tools.ts");
const AUTOMATIC_ENTRYPOINT = path.join(REPO_ROOT, "entrypoints", "pi-auto", "codebase-tools.ts");
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

/** The version this smoke's expectations were written against. */
const EXPECTED_PI_VERSION = "1.2.0";

/** How long a just-issued command's UI frame may take to arrive before it counts as absent. */
const UI_FRAME_TIMEOUT_MS = 5_000;

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

function requestAt(run: PiRun, index: number): CapturedRequest {
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

const runs: PiRun[] = [];
const sessions: PiSession[] = [];

/**
 * One run provisioned the way this smoke needs: the capture endpoint declared, through the run's own
 * `models.json`, as the provider's whole catalog.
 *
 * That is pi's documented "configure a compatible endpoint" path, and it keeps the loaded extension
 * set exactly the entrypoint under test (no provider fixture extension).
 */
function startRun(cli: PiCli, label: string): PiRun {
	const run = startPiRun(cli, label, { provider: PROVIDER, model: MODEL });
	runs.push(run);
	return run;
}

async function openSession(
	run: PiRun,
	extraArgs: readonly string[] = [],
	entrypoint: string = MANUAL_ENTRYPOINT,
): Promise<PiSession> {
	const session = await PiSession.start({
		cli: run.cli,
		runRoot: run.root,
		entrypoint,
		selector: run.selector,
		extraArgs,
	});
	sessions.push(session);
	return session;
}

/** The renderings the framework's marker area published for one session, in arrival order. */
function markerAreaFrames(session: PiSession): RpcFrame[] {
	return session
		.frames()
		.filter(
			frame =>
				frame.type === "extension_ui_request" && frame.method === "setWidget" && frame.widgetKey === MARKER_AREA_KEY,
		);
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
	const areaFrames = markerAreaFrames(session);
	const offArea: RpcFrame | undefined = areaFrames[areaFrames.length - 1];
	observe(
		"the framework published its marker area without this extension's line",
		offArea !== undefined && !areaShows(offArea),
		offArea === undefined
			? "no setWidget frame for the framework's marker area was published at all"
			: `the newest area frame carried ${JSON.stringify(offArea.widgetLines)}`,
	);

	const enableMark = session.frameMark();
	const enable = await session.run(`/${COMMAND}`, PI_COMMAND_TIMEOUT_MS);
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
			? `no marker-area frame carried ${JSON.stringify(MARKER_TEXT)}: the area frames were ${JSON.stringify(markerAreaFrames(session).map(frame => frame.widgetLines))}`
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
	const disable = await session.run(`/${COMMAND}`, PI_COMMAND_TIMEOUT_MS);
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

	await session.run(`/${COMMAND}`, PI_COMMAND_TIMEOUT_MS);
	await session.run("codebase-tools new-session first turn");
	const firstFile = await session.sessionFile();
	const firstJournal = session.journal(firstFile);
	observe(
		"the session that will be replaced really was enabled",
		customMessagesOf(firstJournal, INIT_IDENTITY).length === 1,
		`the first session's journal holds ${customMessagesOf(firstJournal, INIT_IDENTITY).length} init(s)`,
	);

	const created = await session.request({ type: "new_session" }, PI_COMMAND_TIMEOUT_MS);
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
	await session.run(`/${COMMAND}`, PI_COMMAND_TIMEOUT_MS);
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

	await first.run(`/${COMMAND}`, PI_COMMAND_TIMEOUT_MS);
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
	await resumed.run(`/${COMMAND}`, PI_COMMAND_TIMEOUT_MS);
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

	await session.run(`/${COMMAND}`, PI_COMMAND_TIMEOUT_MS);
	await session.run("codebase-tools switch target turn");
	const targetFile = await session.sessionFile();
	const targetBefore = session.journal(targetFile);
	observe(
		"the switch target was enabled and contributed the init",
		customMessagesOf(targetBefore, INIT_IDENTITY).length === 1,
		`the target journal holds ${customMessagesOf(targetBefore, INIT_IDENTITY).length} init(s)`,
	);

	await session.request({ type: "new_session" }, PI_COMMAND_TIMEOUT_MS);
	const betweenTurnText = "codebase-tools between sessions turn";
	await session.run(betweenTurnText);
	const betweenRequest = requestAt(run, 1);
	observe(
		"the session created before the switch is off",
		contributions(betweenRequest) === 0 && lastMessageText(betweenRequest) === betweenTurnText,
		`the request carried ${contributions(betweenRequest)} contribution(s): ${describeMessages(betweenRequest)}`,
	);

	const requestsBefore = run.capture.requests().length;
	const switched = await session.request({ type: "switch_session", sessionPath: targetFile }, PI_COMMAND_TIMEOUT_MS);
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
// Automatic mode, phase 1: the first run is enabled without a command, and the
// command and a later in-place session keep their own decisions
// ---------------------------------------------------------------------------

async function phaseAutomaticStartup(cli: PiCli): Promise<void> {
	console.log("\nphase: the automatic entrypoint enables the first run without a command");
	const run = startRun(cli, "automatic-startup");
	const session = await openSession(run, [], AUTOMATIC_ENTRYPOINT);

	// 1. The first turn runs with no command typed at all.
	const firstTurnText = "codebase-tools automatic first turn";
	const firstDisposition = await session.run(firstTurnText);
	observe(
		"a plain first turn starts a run",
		firstDisposition === "started",
		`pi reported disposition ${JSON.stringify(firstDisposition)}`,
	);
	const firstRequest = requestAt(run, 0);
	observe(
		"the first run's request already carries the startup-selected contribution",
		contributions(firstRequest) === 1 &&
			isContributionText(lastMessageText(firstRequest)) &&
			messageContent(providerMessages(firstRequest)[providerMessages(firstRequest).length - 2]) === firstTurnText,
		`the request carried ${contributions(firstRequest)} injected message(s), ending with ${JSON.stringify(lastMessageText(firstRequest).slice(0, 60))}: ${describeMessages(firstRequest)}`,
	);
	const firstJournal = session.journal(await session.sessionFile());
	const firstInit = customMessagesOf(firstJournal, INIT_IDENTITY);
	observe(
		"the startup choice is recorded once, as the session's own initial State",
		JSON.stringify(statePayloads(firstJournal)) === JSON.stringify([{ enabled: true }]),
		`the journal's ${STATE_ENTRY_TYPE} payloads were ${JSON.stringify(statePayloads(firstJournal))}`,
	);
	observe(
		"exactly one hidden init is persisted, as the init slot and nothing else",
		firstInit.length === 1 &&
			firstInit[0]?.content === INIT_PROMPT &&
			firstInit[0]?.display === false &&
			JSON.stringify(contributionIdentities(firstJournal)) === JSON.stringify([INIT_IDENTITY]),
		`the journal holds ${firstInit.length} ${INIT_IDENTITY} entry/entries with display ${JSON.stringify(firstInit[0]?.display)} and slot identities ${JSON.stringify(contributionIdentities(firstJournal))}`,
	);
	const openedArea: RpcFrame | undefined = markerAreaFrames(session)[0];
	observe(
		"the framework's marker area shows the line from the session's own start",
		openedArea !== undefined && areaShows(openedArea) && openedArea.widgetPlacement === MARKER_PLACEMENT,
		openedArea === undefined
			? "no setWidget frame for the framework's marker area was published"
			: `the first area frame carried ${JSON.stringify(openedArea.widgetLines)} at ${JSON.stringify(openedArea.widgetPlacement)}`,
	);
	observe(
		"no command ran, so nothing announced an activation",
		session
			.notificationsSince(0)
			.every(message => message !== ENABLED_NOTICE && message !== DISABLED_NOTICE),
		`pi announced ${JSON.stringify(session.notificationsSince(0))}`,
	);

	// 2. A later enabled run appends the reminder and does not re-inject the init.
	await session.run("codebase-tools automatic second turn");
	const secondRequest = requestAt(run, 1);
	const secondJournal = session.journal(await session.sessionFile());
	observe(
		"a later enabled run adds exactly one contribution, the branch's earlier one replayed",
		contributions(secondRequest) === contributions(firstRequest) + 1 &&
			JSON.stringify(contributionIdentities(secondJournal)) ===
				JSON.stringify([INIT_IDENTITY, REMINDER_IDENTITY]),
		`the request carried ${contributions(secondRequest)} injected message(s) after the first run's ${contributions(firstRequest)}, and the slot identities were ${JSON.stringify(contributionIdentities(secondJournal))}`,
	);

	// 3. The original command still disables it, with the original effects.
	const disableMark = session.frameMark();
	const disable = await session.run(`/${COMMAND}`, PI_COMMAND_TIMEOUT_MS);
	observe(
		"the original command still disables it after startup, announcing the value it produced",
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
	const disabledTurnText = "codebase-tools automatic disabled turn";
	await session.run(disabledTurnText);
	const disabledRequest = requestAt(run, 2);
	observe(
		"a disabled run adds no contribution of its own",
		contributions(disabledRequest) === contributions(secondRequest) &&
			lastMessageText(disabledRequest) === disabledTurnText,
		`the request carried ${contributions(disabledRequest)} injected message(s) after the enabled period's ${contributions(secondRequest)}, ending with ${JSON.stringify(lastMessageText(disabledRequest).slice(0, 60))}`,
	);
	const disabledJournal = session.journal(await session.sessionFile());
	observe(
		"the command's own record follows the startup record, and no startup write was repeated",
		JSON.stringify(statePayloads(disabledJournal)) ===
			JSON.stringify([{ enabled: true }, { enabled: false }]),
		`the journal's ${STATE_ENTRY_TYPE} payloads were ${JSON.stringify(statePayloads(disabledJournal))}`,
	);

	// 4. A new session in the same process starts off: the startup choice belongs to the
	// process's start and is not applied to a session that replaces it.
	const previousFile = await session.sessionFile();
	const created = await session.request({ type: "new_session" }, PI_COMMAND_TIMEOUT_MS);
	observe(
		"pi created a new session in place",
		fieldOf(fieldOf(created, "data"), "cancelled") === false,
		`pi answered ${JSON.stringify(fieldOf(created, "data"))}`,
	);
	const freshFile = await session.sessionFile();
	observe(
		"the new session is a different session",
		freshFile !== previousFile,
		`pi reported the same file ${previousFile} for the session it replaced`,
	);
	const freshTurnText = "codebase-tools automatic fresh turn";
	await session.run(freshTurnText);
	const freshRequest = requestAt(run, 3);
	observe(
		"the new session in the running process is not enabled again by the startup choice",
		contributions(freshRequest) === 0 && lastMessageText(freshRequest) === freshTurnText,
		`the new session's request carried ${contributions(freshRequest)} contribution(s): ${describeMessages(freshRequest)}`,
	);
	const freshJournal = session.journal(freshFile);
	observe(
		"the new session records no startup State",
		extensionEntries(freshJournal).length === 0,
		`the new session's journal carries ${extensionEntries(freshJournal).map(entry => String(entry.customType)).join(", ") || "no codebase-tools entry"}`,
	);
	const freshAreaFrames = markerAreaFrames(session);
	const freshArea: RpcFrame | undefined = freshAreaFrames[freshAreaFrames.length - 1];
	observe(
		"the new session's marker area carries no line",
		freshArea !== undefined && !areaShows(freshArea),
		freshArea === undefined
			? "no marker-area frame was published for the new session"
			: `the newest area frame carried ${JSON.stringify(freshArea.widgetLines)}`,
	);

	// 5. The command still enables it in the new session.
	const enableMark = session.frameMark();
	const enable = await session.run(`/${COMMAND}`, PI_COMMAND_TIMEOUT_MS);
	observe(
		"the command enables the new session",
		enable === "handled" &&
			JSON.stringify(session.notificationsSince(enableMark)) === JSON.stringify([ENABLED_NOTICE]),
		`the command reported ${JSON.stringify(enable)} and announced ${JSON.stringify(session.notificationsSince(enableMark))}`,
	);
	await session.run("codebase-tools automatic fresh enabled turn");
	const freshEnabledRequest = requestAt(run, 4);
	observe(
		"the enabled new session contributes on its next run",
		contributions(freshEnabledRequest) === 1,
		`the request carried ${contributions(freshEnabledRequest)} injected message(s): ${describeMessages(freshEnabledRequest)}`,
	);
	observe(
		"the new session's journal holds only its own command's record",
		JSON.stringify(statePayloads(session.journal(freshFile))) === JSON.stringify([{ enabled: true }]),
		`the new session's journal carries ${JSON.stringify(statePayloads(session.journal(freshFile)))}`,
	);

	const exit = await session.stop();
	observe(
		"the session exits cleanly",
		exit.exitCode === 0 && !exit.timedOut,
		`the child exited ${String(exit.exitCode)}, stderr: ${exit.stderr.trim() || "<empty>"}`,
	);
}

// ---------------------------------------------------------------------------
// Automatic mode, phase 2: a resume in a new process restores the recorded value
// ---------------------------------------------------------------------------

async function phaseAutomaticResume(cli: PiCli): Promise<void> {
	console.log("\nphase: a resumed session keeps the value it recorded, without a second startup write");
	const run = startRun(cli, "automatic-resume");
	const first = await openSession(run, [], AUTOMATIC_ENTRYPOINT);
	await first.run("codebase-tools automatic resume seed turn");
	const sessionFile = await first.sessionFile();
	const before = first.journal(sessionFile);
	observe(
		"the first process started enabled and recorded that one value",
		JSON.stringify(statePayloads(before)) === JSON.stringify([{ enabled: true }]) &&
			customMessagesOf(before, INIT_IDENTITY).length === 1,
		`the journal holds State ${JSON.stringify(statePayloads(before))} and ${customMessagesOf(before, INIT_IDENTITY).length} init(s)`,
	);
	const firstExit = await first.stop();
	observe(
		"the session exits cleanly before the resume",
		firstExit.exitCode === 0 && !firstExit.timedOut,
		`the child exited ${String(firstExit.exitCode)}, stderr: ${firstExit.stderr.trim() || "<empty>"}`,
	);

	const requestsBefore = run.capture.requests().length;
	const resumed = await openSession(run, ["--session", sessionFile], AUTOMATIC_ENTRYPOINT);
	const resumedAreaFrames = markerAreaFrames(resumed);
	const resumedArea: RpcFrame | undefined = resumedAreaFrames[0];
	observe(
		"the resumed session shows the restored line from its own start",
		resumedArea !== undefined && areaShows(resumedArea),
		resumedArea === undefined
			? "no marker-area frame was published for the resumed session"
			: `the first area frame carried ${JSON.stringify(resumedArea.widgetLines)}`,
	);
	const resumedTurnText = "codebase-tools automatic resumed turn";
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
	observe(
		"the resumed run replayed the init instead of re-initialising, and appended the reminder",
		customMessagesOf(after, INIT_IDENTITY).length === 1 &&
			JSON.stringify(contributionIdentities(after)) ===
				JSON.stringify([INIT_IDENTITY, REMINDER_IDENTITY]),
		`the journal's slot identities were ${JSON.stringify(contributionIdentities(after))}, holding ${customMessagesOf(after, INIT_IDENTITY).length} init(s)`,
	);
	observe(
		"the resume wrote no second startup record: the recorded true is the history",
		JSON.stringify(statePayloads(after)) === JSON.stringify([{ enabled: true }]),
		`the journal's ${STATE_ENTRY_TYPE} payloads were ${JSON.stringify(statePayloads(after))}`,
	);
	const resumedRewrite = appendOnlyViolation(before.entries, after.entries);
	observe(
		"the resume appended to history rather than rewriting it",
		resumedRewrite === undefined,
		resumedRewrite ?? "the earlier entries stand unchanged and in order",
	);

	const toggleMark = resumed.frameMark();
	await resumed.run(`/${COMMAND}`, PI_COMMAND_TIMEOUT_MS);
	observe(
		"the restored value is the recorded one: the next command turns it off",
		JSON.stringify(resumed.notificationsSince(toggleMark)) === JSON.stringify([DISABLED_NOTICE]),
		`the resumed session announced ${JSON.stringify(resumed.notificationsSince(toggleMark))}, expected ${JSON.stringify([DISABLED_NOTICE])}`,
	);
	observe(
		"the resumed session's command appended its own record",
		JSON.stringify(statePayloads(resumed.journal(sessionFile))) ===
			JSON.stringify([{ enabled: true }, { enabled: false }]),
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
// Entry point
// ---------------------------------------------------------------------------

interface Options {
	readonly pi: string | undefined;
	/** Which startup mode's entrypoint this run loads; the default is the manual one. */
	readonly mode: "manual" | "auto";
	readonly keep: boolean;
	readonly help: boolean;
}

function parseOptions(argv: readonly string[]): Options {
	let pi: string | undefined;
	let mode: "manual" | "auto" = "manual";
	let keep = false;
	let help = false;
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === "--pi") {
			const candidate: string | undefined = argv[index + 1];
			if (candidate === undefined) throw new Error("--pi requires a path");
			pi = candidate;
			index += 1;
		} else if (argument === "--mode") {
			const candidate: string | undefined = argv[index + 1];
			if (candidate !== "manual" && candidate !== "auto") {
				throw new Error(`--mode requires "manual" or "auto"; got ${JSON.stringify(candidate)}`);
			}
			mode = candidate;
			index += 1;
		} else if (argument === "--keep") {
			keep = true;
		} else if (argument === "--help" || argument === "-h") {
			help = true;
		} else {
			throw new Error(`unknown argument ${JSON.stringify(argument)}; see --help`);
		}
	}
	return { pi, mode, keep, help };
}

const USAGE = [
	"usage: bun scripts/pi-codebase-tools-smoke.ts [--pi <path|name>] [--mode manual|auto] [--keep]",
	"",
	"  --pi <path|name>  the pi CLI to drive: its dist/bundle/cli.js, its pi.cmd/pi shim, the binary,",
	"                    or a bare command name looked up on PATH (PI_CLI does the same; without",
	"                    either, `pi` is looked up and node's own prefix is tried)",
	"  --mode <mode>     which startup mode's entrypoint to load: `manual` (the default) loads",
	"                    entrypoints/pi/codebase-tools.ts, `auto` loads entrypoints/pi-auto/codebase-tools.ts",
	"  --keep            keep every run root (its agent state, sessions, captures) for inspection",
	"  PI_NODE           Node executable for a script/shim CLI; verified on Windows with Node 22.19.0",
].join("\n");

const options = parseOptions(process.argv.slice(2));
if (options.help) {
	console.log(USAGE);
	process.exit(0);
}

/** The entrypoint this run loads: the mode decision, and nothing else about the invocation. */
const entrypoint = options.mode === "auto" ? AUTOMATIC_ENTRYPOINT : MANUAL_ENTRYPOINT;

let tested = `<unresolved: ${EXPECTED_PI_VERSION} expected>`;
let failure: unknown;

try {
	if (!existsSync(entrypoint)) {
		throw new Error(`the pi assembly entrypoint does not exist: ${entrypoint}`);
	}
	const cli = resolvePiCli(options.pi);
	const version = await piVersion(cli);
	tested = version;
	console.log(
		`pi codebase-tools smoke (${options.mode} mode) — pi ${version} via ${cli.path} (${cli.source})`,
	);
	if (cli.command[0] === PI_NODE_EXECUTABLE && cli.command.length > 1) {
		const runtime = Bun.spawnSync([PI_NODE_EXECUTABLE, "--version"], { stdout: "pipe", stderr: "pipe" });
		console.log(`  runtime ${PI_NODE_EXECUTABLE} ${runtime.stdout.toString().trim()}`);
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
	if (options.mode === "auto") {
		await phaseAutomaticStartup(cli);
		await phaseAutomaticResume(cli);
	} else {
		await phaseToggleAndContributions(cli);
		await phaseNewSessionStartsOff(cli);
		await phaseResumeAcrossRestart(cli);
		await phaseResumeAcrossSwitch(cli);
	}
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
	`\nPI SMOKE SUMMARY: pi ${tested}, ${options.mode} mode — ${observations.length} check(s) passed, ${failure === undefined ? "none failed" : "the run stopped on a failure"}`,
);
console.log(`  ${observations.length} consumer-visible check(s) across ${runs.length} isolated run(s)`);
console.log("  limitations: agent attribution is not expressible on pi (asserted as hidden and framework-identified only);");
console.log(
	"               the TUI drawing stays human-led, this smoke observes the setWidget/notify frames the adapter published",
);
console.log(
	`  rerun: bun scripts/pi-codebase-tools-smoke.ts --mode ${options.mode}${options.pi === undefined ? "" : ` --pi ${options.pi}`}`,
);

if (failure !== undefined) {
	throw failure;
}
