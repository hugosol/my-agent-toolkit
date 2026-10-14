/**
 * The static detail tree and the immediate entry preference on the real patched host (P20, P23, P26,
 * P29; S5).
 *
 * This is the isolated real-host observation of the display this ticket adds: the dock materialises
 * the recorded baseline install with the frozen Viewed session patch, loads this repository's own
 * model-cost entrypoint through the harness's real loader, and drives a real RPC session whose model
 * requests go to the dock's local capture endpoint. The main session really delegates to a child
 * through the host's own task tool, the child really yields, and the widget the extension draws is
 * read off the host's own `setWidget` frames — so what this file asserts is the terminal content the
 * operator would see, not a double's rendering of it.
 *
 * The document the run writes is the accounting's own record of what each session issued, and the
 * figures below are hand-added from it: the row sums, the tree's Sum and each row's cache rate are
 * derived from the wire numbers the capture endpoint reported, so a row that showed another session's
 * consumption, an inclusive figure, or a Round row in the detail form could not pass.
 *
 * The last case reads the host's own answers at a spawned session's start — its registry id, the
 * agent definition it runs, the model, the resolved thinking level and whether that session's branch
 * already carries a conversation — straight off the native extension API through the
 * `session-start-probe` fixture, and compares the drawn row and the saved record against them, both
 * while that session runs and after an independent process restores the document: the source of the
 * facts is the harness's, never this repository's rendering of them. The same case reads what the
 * framework's own delivery carried through the public factory (`startup-facts-probe`): the pair the
 * host answered for the session that really began, and nothing at all for the session the second
 * process entered with its conversation replayed, which is the difference the adapter's startup
 * requirement is built on.
 *
 * Every model is reached through the dock's own capture endpoint, so no run needs a credential and
 * nothing leaves the machine; the run's own agent state, session directory, working directory and
 * storage root all sit inside its temporary run root. Nothing here touches the production OMP
 * environment, its configuration or its sessions.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { MODEL_COST_WIDGET_KEY } from "../../extensions/model-cost/harnesses/omp/widget";
import {
	DEEPSEEK_DISPLAY_BUDGET,
	formatTokens,
} from "../../extensions/model-cost/shared-logic/presentation/display";
import { writeAgentSettings, writeProviderOverride } from "./agent-config";
import { type IsolatedHarness, REPO_ROOT, readBaselineRecord } from "./baseline";
import { type CaptureServer, type CaptureStep, type CapturedRequest, startCaptureServer } from "./capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV } from "./fixtures/extension-root/provider";
import { SESSION_START_PROBE_ID } from "./fixtures/session-start-probe/entrypoint";
import { STARTUP_FACTS_ID } from "./fixtures/startup-facts-probe/entrypoint";
import { type RunRoot, createRunRoot } from "./run-root";
import { ControlledSession, type RpcFrame } from "./session";
import { ensureViewedSessionHarness } from "./viewed-session-harness";

const record = readBaselineRecord();
/** The extension's own OMP entrypoint, as the harness's loader discovers it. */
const MODEL_COST_ENTRYPOINT = path.join(REPO_ROOT, "entrypoints", "omp", "model-cost.ts");
/** The dock's own provider fixture, which redirects the extension's provider to the capture endpoint. */
const PROVIDER_FIXTURE = path.join(import.meta.dir, "fixtures", "extension-root", "provider.ts");
/** The document the extension keeps in its storage root. */
const CONSUMPTION_FILE = "consumption.json";

/** The provider and model the run uses: one the extension's own data prices in CNY. */
const MODEL_PROVIDER = "deepseek";
const MODEL_ID = "deepseek-flash";
const MODEL_SELECTOR = `${MODEL_PROVIDER}/${MODEL_ID}`;

/**
 * The usage the capture endpoint reports for every completion, as the wire numbers it sends: 2000
 * prompt tokens, 1000 of them served from the prompt cache, and 1000 completion tokens.
 *
 * The protocol's `prompt_tokens` counts the cached ones, so one response is accounted as 1000
 * non-cached input, 1000 cache reads, no cache writes and 1000 output — a Sum of 3,000 and a cache
 * hit rate of 1000 of 2000, a whole 50 percent, both hand-derived here.
 */
const CAPTURE_USAGE = { input: 2000, output: 1000, cacheRead: 1000 };

/** One response's own buckets, as the extension accounts them. */
const ONE_RESPONSE_SUM = 3000;

/** The main session's name, which the run sets through the host's own command before prompting. */
const MAIN_SESSION_NAME = "dock-detail-main";

/** The delegation the run scripts, and the mark each session's own opening message carries. */
const DELEGATE_PROMPT = "dock detail run: delegate to a child";
const CHILD_ASSIGNMENT = "dock detail child: finish now";
const CHILD_TASK_NAME = "dock-detail-child";
/** The agent definition the spawned session runs: the host's own name for that kind of agent. */
const SPAWN_AGENT = "task";
/** The fixture that reports the harness's own answers at a session's own start, natively. */
const SESSION_START_PROBE = path.join(import.meta.dir, "fixtures", "session-start-probe", "entrypoint.ts");
/** The fixture that reports the framework's own start delivery through the public factory. */
const STARTUP_FACTS_PROBE = path.join(import.meta.dir, "fixtures", "startup-facts-probe", "entrypoint.ts");

let harness: IsolatedHarness;

beforeAll(async () => {
	harness = await ensureViewedSessionHarness(record);
}, 600_000);

/** One run's isolated home and the storage root the extension's shipped configuration names in it. */
interface IsolatedHome {
	readonly home: string;
	readonly storageDirectory: string;
	readonly consumptionFile: string;
	readonly env: Record<string, string>;
}

/**
 * The isolated user home one run uses, with the storage root already holding its own period: a
 * holiday period, because DeepSeek bills one off-peak all day, so every amount this run accounts is
 * the same figure whatever the wall clock says when a request goes out.
 *
 * The period is written only when the root holds no document yet: two processes over one root — a
 * restart — share this home, and the second must read what the first one saved rather than a fresh
 * period.
 */
function isolateHome(runRoot: RunRoot): IsolatedHome {
	const home = path.join(runRoot.path, "user-home");
	const storageDirectory = path.join(home, ".omp", "cost-archive");
	mkdirSync(storageDirectory, { recursive: true });
	const consumptionFile = path.join(storageDirectory, CONSUMPTION_FILE);
	if (!existsSync(consumptionFile)) {
		writeFileSync(
			consumptionFile,
			JSON.stringify({
				schemaVersion: 1,
				periodId: "period-detail-tree",
				start: "2026-10-01T00:00:00.000Z",
				holiday: true,
				harnesses: { omp: { sessions: [] } },
			}),
			"utf8",
		);
	}
	return {
		home,
		storageDirectory,
		consumptionFile,
		env: {
			USERPROFILE: home,
			HOME: home,
			HOMEDRIVE: path.parse(home).root,
			HOMEPATH: home.slice(path.parse(home).root.length - 1),
		},
	};
}

/** The messages one captured request carried, when its body really is the object this file reads. */
function messagesOf(request: CapturedRequest): readonly unknown[] {
	const body = request.json;
	if (body === null || typeof body !== "object" || !("messages" in body) || !Array.isArray(body.messages)) return [];
	return body.messages;
}

/** The role one message carries, when it really names one. */
function roleOf(message: unknown): string | undefined {
	if (message === null || typeof message !== "object" || !("role" in message)) return undefined;
	return typeof message.role === "string" ? message.role : undefined;
}

/** The mark one request carries in its own session: the first user message that session was started with. */
function openingOf(request: CapturedRequest): string {
	const opening = messagesOf(request).find(message => roleOf(message) === "user");
	return opening === undefined ? "" : JSON.stringify(opening);
}

/** Whether one request is the first its own session issued: no assistant message has answered yet. */
function isOpeningRequest(request: CapturedRequest): boolean {
	return messagesOf(request).every(message => roleOf(message) !== "assistant");
}

/**
 * The scripted model of the delegating run: it reads which session's request this is from that
 * session's own opening message rather than from the order requests arrive in. The main session
 * delegates to one child; the child yields its result, which is what ends that session; every other
 * request — the main session's continuation after its tool returned — answers in prose.
 */
function delegatingStep(request: CapturedRequest): CaptureStep | undefined {
	const opening = openingOf(request);
	if (opening.includes(CHILD_ASSIGNMENT)) {
		return { toolCall: { name: "yield", arguments: JSON.stringify({ data: "dock child result" }) } };
	}
	if (opening.includes(DELEGATE_PROMPT) && isOpeningRequest(request)) {
		return {
			toolCall: {
				name: "task",
				arguments: JSON.stringify({
					context: "dock detail delegation context",
					tasks: [{ name: CHILD_TASK_NAME, agent: SPAWN_AGENT, task: CHILD_ASSIGNMENT, solutionSpace: "one fixed answer, nothing open" }],
				}),
			},
		};
	}
	return {};
}

/** One run's resources, disposed by the caller. */
interface DockRun {
	readonly session: ControlledSession;
	readonly capture: CaptureServer;
	readonly runRoot: RunRoot;
	readonly home: IsolatedHome;
	/** Whether this run created the root it ran in, and so is the one that disposes it. */
	readonly ownsRoot: boolean;
}

/** What one run needs beyond its own label: a root it shares with another process, extra fixtures. */
interface RunOptions {
	/** The root to run in; omitted for a run of its own. A restart passes the first run's root. */
	readonly runRoot?: RunRoot;
	/** Further fixtures this run needs beside the two every case runs. */
	readonly extraExtensions?: readonly string[];
}

/** One run: the recorded install's own loader, the project's model-cost entrypoint, real RPC. */
async function startRun(label: string, options: RunOptions = {}): Promise<DockRun> {
	const runRoot = options.runRoot ?? createRunRoot(label);
	const home = isolateHome(runRoot);
	// Blocking delegation is the host setting this needs: an RPC host otherwise runs a spawn as a
	// background job, which a suite that prompts once has no second prompt to observe.
	writeAgentSettings(runRoot.agentDir, { "async.enabled": false });
	const capture = startCaptureServer({
		dir: runRoot.captureDir,
		replyText: "dock detail reply",
		usage: CAPTURE_USAGE,
		respond: delegatingStep,
	});
	writeProviderOverride(runRoot.agentDir, MODEL_PROVIDER, { baseUrl: capture.baseUrl, apiKey: "dock-key" });
	try {
		const session = await ControlledSession.start({
			harness,
			runRoot,
			extensions: [PROVIDER_FIXTURE, MODEL_COST_ENTRYPOINT, ...(options.extraExtensions ?? [])],
			model: MODEL_SELECTOR,
			env: { [DOCK_CAPTURE_BASE_URL_ENV]: capture.baseUrl, ...home.env },
			promptTimeoutMs: 120_000,
		});
		return { session, capture, runRoot, home, ownsRoot: options.runRoot === undefined };
	} catch (error) {
		capture.stop();
		if (options.runRoot === undefined) runRoot.dispose();
		throw error;
	}
}

/** Ends one run's process and its endpoint; the directories it ran in belong to the caller. */
async function stopRun(run: DockRun): Promise<void> {
	try {
		if (run.session.exited() === null) await run.session.stop({ timeoutMs: 15_000 });
	} catch {
		// The session already stopped (or never started); the case's own cleanup still runs.
	}
	run.capture.stop();
}

async function disposeRun(run: DockRun): Promise<void> {
	await stopRun(run);
	if (run.ownsRoot) run.runRoot.dispose();
}

/** One session's record as the document holds it, with the fields this file asserts. */
interface SavedSession {
	readonly id: string;
	readonly name: string;
	readonly parent: string | null;
	/** The model and effective level that session began on, when the document holds them. */
	readonly startup?: {
		readonly model?: { readonly provider: string; readonly model: string };
		readonly effort?: string;
	};
	readonly own: Record<string, Record<string, { readonly tokens: Record<string, number> }>>;
}

/** The document as this file reads it: the sessions the extension saved, keyed by harness. */
interface SavedDocument {
	readonly harnesses?: Record<string, { readonly sessions?: SavedSession[] }>;
}

/** Every session record one document holds, whichever harness key it sits under. */
function sessionsOf(document: SavedDocument): SavedSession[] {
	return Object.values(document.harnesses ?? {}).flatMap(bucket => bucket.sessions ?? []);
}

/** One session's own Sum and cache rate, hand-added from its record's buckets. */
function figuresOf(record: SavedSession): { readonly sum: number; readonly cache: number } {
	let sum = 0;
	let cacheRead = 0;
	let input = 0;
	for (const models of Object.values(record.own)) {
		for (const entry of Object.values(models)) {
			const tokens = entry.tokens;
			sum += tokens.input + tokens.cacheRead + tokens.cacheWrite + tokens.output;
			cacheRead += tokens.cacheRead;
			input += tokens.input;
		}
	}
	return { sum, cache: input + cacheRead > 0 ? Math.round((cacheRead / (input + cacheRead)) * 100) : 0 };
}

/** Lets the event loop turn over until nothing already queued is left. */
async function queuedWorkSettled(): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>();
	setImmediate(resolve);
	await promise;
}

/** The document one run's storage root holds, or nothing while no save has landed. */
function readDocument(file: string): SavedDocument | undefined {
	if (!existsSync(file)) return undefined;
	return JSON.parse(readFileSync(file, "utf8")) as SavedDocument;
}

/** Waits until the document holds what a case expects of it, and answers with the document. */
async function savedDocument(file: string, accept: (document: SavedDocument) => boolean): Promise<SavedDocument> {
	const deadline = Date.now() + 20_000;
	for (;;) {
		const document = readDocument(file);
		if (document !== undefined && accept(document)) return document;
		if (Date.now() > deadline) {
			throw new Error(`no consumption document the case expects was published at ${file}: ${JSON.stringify(document)}`);
		}
		await queuedWorkSettled();
	}
}

/** The extension's own usage-widget frames this host emitted, in order. */
function widgetFrames(session: ControlledSession): RpcFrame[] {
	return session
		.frames()
		.filter(
			frame =>
				frame.type === "extension_ui_request" && frame.method === "setWidget" && frame.widgetKey === MODEL_COST_WIDGET_KEY,
		);
}

/** The lines of the last widget the host was told to show, or nothing when it was cleared. */
function shownLines(session: ControlledSession): string[] | undefined {
	const shown = widgetFrames(session).filter(frame => frame.widgetLines !== undefined);
	const last = shown[shown.length - 1];
	return last === undefined ? undefined : (last.widgetLines as string[]);
}

/** The operator notices one run emitted, as the harness itself framed them. */
function noticesOf(session: ControlledSession): ReadonlyArray<{ readonly level: unknown; readonly message: string }> {
	return session
		.frames()
		.filter(frame => frame.type === "extension_ui_request" && frame.method === "notify")
		.map(frame => ({ level: frame.notifyType, message: String(frame.message) }));
}

/**
 * Waits until the widget's last drawn content satisfies a case, and answers with those lines.
 *
 * A command's own redraw is announced while the command runs, so the frame and the command's answer
 * travel on the same channel; the wait is on the content the case is about rather than on a duration,
 * and the deadline only keeps a redraw that never happened from hanging the case.
 */
async function linesUntil(
	session: ControlledSession,
	accept: (lines: readonly string[]) => boolean,
): Promise<string[] | undefined> {
	const deadline = Date.now() + 20_000;
	for (;;) {
		const shown = widgetFrames(session);
		const last = shown[shown.length - 1];
		const lines = last?.widgetLines;
		if (Array.isArray(lines) && accept(lines)) return lines as string[];
		if (Date.now() > deadline) throw new Error(`no widget content the case expects was drawn:\n${session.diagnostics()}`);
		await queuedWorkSettled();
	}
}

/**
 * What the host answered at one session's own start, as the native probe fixture reported it.
 *
 * These are the harness's own readings, taken straight off the extension API it publishes: the
 * registry id the spawn was allocated, the agent definition the session runs, the spawning agent's
 * id, the context's model, the effective level getter, and whether that session's own branch already
 * carried a conversation — the fact the harness itself reads to tell a session it reloaded from one
 * that is beginning. They are the source a case compares the drawn row and the saved record against.
 */
interface StartReading {
	/** The native transition this reading was taken on: the start, a switch or a branch. */
	readonly nativeEvent: string;
	/** The reason that transition carried, when it named one. */
	readonly nativeReason: string | null;
	readonly sessionId: string;
	readonly kind: string;
	readonly id: string;
	readonly name: string | null;
	readonly parentId: string | null;
	readonly provider: string | null;
	readonly model: string | null;
	readonly level: string | null;
	readonly conversation: boolean;
}

/** Every start reading one run's probe fixture wrote, in the order the host produced them. */
function startReadings(session: ControlledSession): StartReading[] {
	const prefix = `[${SESSION_START_PROBE_ID}] session_start `;
	const readings: StartReading[] = [];
	for (const raw of session.stderr().split("\n")) {
		if (!raw.startsWith(prefix)) continue;
		readings.push(JSON.parse(raw.slice(prefix.length)) as StartReading);
	}
	return readings;
}

/** Waits until the run's own start readings satisfy a case, and answers with all of them. */
async function startReadingsUntil(
	session: ControlledSession,
	accept: (readings: readonly StartReading[]) => boolean,
): Promise<StartReading[]> {
	const deadline = Date.now() + 20_000;
	for (;;) {
		const readings = startReadings(session);
		if (accept(readings)) return readings;
		if (Date.now() > deadline) throw new Error(`no start reading the case expects appeared:\n${session.stderr()}`);
		await queuedWorkSettled();
	}
}

/**
 * What the framework's own start delivery carried, as the `startup-facts-probe` fixture reported it:
 * the session the delivery was about, the kind of session it is, why the start happened, and the
 * startup facts the adapter reported — `null` when it reported none.
 */
interface StartFactsLine {
	readonly sessionId: string;
	readonly kind: string;
	readonly reason: string | null;
	readonly startup: {
		readonly model?: { readonly provider: string; readonly model: string };
		readonly effort?: string;
	} | null;
}

/** Every framework start delivery one run's fixture reported, in the order the framework dispatched them. */
function startFactsLines(session: ControlledSession): StartFactsLine[] {
	const prefix = `[${STARTUP_FACTS_ID}] session_start `;
	const lines: StartFactsLine[] = [];
	for (const raw of session.stderr().split("\n")) {
		if (!raw.startsWith(prefix)) continue;
		lines.push(JSON.parse(raw.slice(prefix.length)) as StartFactsLine);
	}
	return lines;
}

/** Waits until the framework's own start deliveries satisfy a case, and answers with all of them. */
async function startFactsUntil(
	session: ControlledSession,
	accept: (lines: readonly StartFactsLine[]) => boolean,
): Promise<StartFactsLine[]> {
	const deadline = Date.now() + 20_000;
	for (;;) {
		const lines = startFactsLines(session);
		if (accept(lines)) return lines;
		if (Date.now() > deadline) throw new Error(`no framework start delivery the case expects appeared:\n${session.stderr()}`);
		await queuedWorkSettled();
	}
}

/** One framework start delivery for a session, waited for by that session's id. */
async function startFactsOf(session: ControlledSession, sessionId: string): Promise<StartFactsLine | undefined> {
	const lines = await startFactsUntil(session, all => all.some(line => line.sessionId === sessionId));
	return lines.find(line => line.sessionId === sessionId);
}


/** The actual session the harness is showing, and the file it persists, as the harness reports them. */
async function currentSession(run: DockRun): Promise<{ readonly id: string; readonly file: string }> {
	const state = payloadOf(await run.session.request({ type: "get_state" }));
	if (typeof state.sessionId !== "string" || typeof state.sessionFile !== "string") {
		throw new Error(`the harness reported no current session and file: ${JSON.stringify(state)}`);
	}
	return { id: state.sessionId, file: state.sessionFile };
}

/** The object payload of one RPC answer, when the frame really carries one. */
function payloadOf(frame: RpcFrame): Record<string, unknown> {
	const data = frame.data;
	return data !== null && typeof data === "object" ? (data as Record<string, unknown>) : {};
}

describe("the real host's widget: a brief with its own Round, then the static detail tree (P23, P29)", () => {
	test("the toggle replaces the Round row with the root and its rows, redrawing at once and asking no provider", async () => {
		const run = await startRun("detail-tree");
		try {
			await run.session.request({ type: "set_session_name", name: MAIN_SESSION_NAME });
			expect((await run.session.prompt(DELEGATE_PROMPT)).status).toBe("completed");

			// The real host spawned a child through its own task tool, and both sessions' consumption is
			// in the document the extension saved: the main session's own two responses and the child's
			// own one.
			const document = await savedDocument(run.home.consumptionFile, saved => sessionsOf(saved).length >= 2);
			const sessions = sessionsOf(document);
			const mainRecord = sessions.find(session => session.name === MAIN_SESSION_NAME);
			const childRecord = sessions.find(session => session.name !== MAIN_SESSION_NAME);
			if (mainRecord === undefined || childRecord === undefined) {
				throw new Error(`the document holds no separate main and child record: ${JSON.stringify(sessions)}`);
			}
			expect(childRecord.parent).toBe(mainRecord.id);
			const main = figuresOf(mainRecord);
			const child = figuresOf(childRecord);
			const requestsBeforeToggle = run.capture.requests().length;

			// The brief the operator sees first: the Total, and the main session's own Round — its Round
			// ended when the delegation finished, so the last completed one is what stands there.
			const briefLines = await linesUntil(run.session, lines => lines.some(line => line.startsWith("Round:")));
			// The period's accrued bar and the provider balance ride the monetary channel's one account
			// row, together with the season mark, the fixed-budget bar and the effort: the rows below are
			// read with that whole process-wide account row left out. The accrued bar's own amount is the
			// instance's held records at that very draw, so what is pinned here is that the account row
			// really carries it — wording, a CNY amount and, on every draw taken after this run's commits
			// have landed, the per-session bar. The exact amount, shapes and palette are pinned over a
			// fixed document in `tests/model-cost/widget-visual.test.ts`.
			const account = String(briefLines?.[0]);
			expect(account).toContain("Effort: ");
			expect(account).toMatch(
				/\u23F3 Accrued: \u00A5\d+\.\d{2,4}( \[[\u2588\u258F\u258E\u258D\u258C\u258B\u258A\u2589]+\])?$/,
			);
			const brief = (briefLines ?? []).filter(
				line => !line.includes("Balance:") && !line.includes("\u23F3 Accrued:"),
			);
			const total = brief.find(line => line.startsWith("Total:"));
			expect(total).toBeDefined();
			expect(brief.filter(line => line.startsWith("Total:")).length).toBe(1);
			expect(brief.filter(line => line.startsWith("Round:")).length).toBe(1);
			expect(brief.some(line => line.startsWith("\u2502  ") || line.startsWith("\u2514\u2500 "))).toBe(false);

			// The one command the operator types: the entry flips to the detail form, says so, and the
			// widget is redrawn with the static tree in the Round row's place.
			const framesBefore = widgetFrames(run.session).length;
			await run.session.prompt("/budget detail");
			expect(widgetFrames(run.session).length).toBeGreaterThan(framesBefore);
			const detailLines = await linesUntil(run.session, lines =>
				lines.some(line => line.startsWith("\u2514\u2500 ") || line.startsWith("\u251C\u2500 ")),
			);
			const detail = (detailLines ?? []).filter(
				line => !line.includes("Balance:") && !line.includes("\u23F3 Accrued:"),
			);

			// This draw follows the commits the document below already holds, so the period's accrued bar
			// carries its per-session bar here: the two records' own amounts are both non-zero, which is
			// what a segment is. It rides the same account row as the bar and the effort.
			expect(String(detailLines?.[0])).toContain("Effort: ");
			expect(String(detailLines?.[0])).toMatch(
				/\u23F3 Accrued: \u00A5\d+\.\d{2,4} \[[\u2588\u258F\u258E\u258D\u258C\u258B\u258A\u2589]+\]$/,
			);

			// The top Total is the very line it was, the root is the main session by name, the root's own
			// pair is one model row indented under it, and the child is one row of its own accumulation.
			// No Round row survives the detail form, and the root's row carries no figure of its own.
			expect(detail).toHaveLength(4);
			expect(detail[0]).toBe(total as string);
			expect(detail[1]).toBe(MAIN_SESSION_NAME);
			expect(detail[2]).toBe(
				`\u2502  ${MODEL_PROVIDER} / ${MODEL_ID}  Cache: ${main.cache}%  \u00A5Cache/In/Out\uff1a0:20:80  Sum: ${main.sum.toLocaleString("en-US")}  Cost: \u00A50.01`,
			);
			// The child's own row leads with the task handle its spawn was allocated and the pair its own
			// start reported — the model it began on and the effective level this harness resolved for it
			// (the native probe in the restart case names that source directly) — then its own accumulation
			// and the current context the harness recorded from that subagent's own binding:
			// `percent (tokens/budget)`, the same form the bar above reads and against the monetary
			// channel's own fixed display budget — never the host's context window. The token figure is
			// the host's own estimate of the child's conversation rather than a number this document
			// holds, so it is pinned to the form and the budget, not to a token count.
			const childRow = String(detail[3]);
			const childHead = `\u2514\u2500 ${childRecord.name}  Model: ${MODEL_PROVIDER} / ${MODEL_ID}  Effort: `;
			expect(childRow.startsWith(childHead)).toBe(true);
			const afterHead = childRow.slice(childHead.length);
			const effort = afterHead.slice(0, afterHead.indexOf("  "));
			// The host resolves a level for this session and the adapter neither invents one nor passes
			// the configured selector off as it, so the row carries a resolved level rather than `?`.
			expect(effort).not.toBe("\u003F");
			const childTail = afterHead.slice(effort.length + 2);
			const childPrefix = `Cache: ${child.cache}%  Sum: ${child.sum.toLocaleString("en-US")}  Cost: \u00A50.0050  Ctx: `;
			expect(childTail.startsWith(childPrefix)).toBe(true);
			const childContext = childTail.slice(childPrefix.length);
			expect(childContext).toMatch(/^\d+% \([\d.,]+K?\//);
			expect(childContext.endsWith(`/${formatTokens(DEEPSEEK_DISPLAY_BUDGET)})`)).toBe(true);
			expect(detail.some(line => line.startsWith("Round:"))).toBe(false);
			// The tree's own Sum is the two records' own Sums added once each: the model row above is the
			// main session's own alone, so nothing here is an inclusive figure counted twice.
			expect(total).toContain(`Sum: ${(main.sum + child.sum).toLocaleString("en-US")}`);

			// The feedback named the form the entry is now in, and the toggle asked no provider for
			// anything: no request left the host for it.
			const notices = noticesOf(run.session);
			expect(notices.map(notice => notice.level)).toEqual(["info"]);
			expect(notices[0]?.message).toContain("detail");
			expect(run.capture.requests().length).toBe(requestsBeforeToggle);

			// The same command flips the entry back, and the brief returns with its Round row and no tree.
			await run.session.prompt("/budget detail");
			const backLines = await linesUntil(run.session, lines => lines.some(line => line.startsWith("Round:")));
			const back = (backLines ?? []).filter(
				line => !line.includes("Balance:") && !line.includes("\u23F3 Accrued:"),
			);
			expect(back[0]).toBe(total as string);
			expect(back.filter(line => line.startsWith("Round:")).length).toBe(1);
			expect(back.some(line => line.startsWith("\u2514\u2500 ") || line.startsWith("\u251C\u2500 "))).toBe(false);
			expect(noticesOf(run.session).map(notice => notice.level)).toEqual(["info", "info"]);
			expect(run.capture.requests().length).toBe(requestsBeforeToggle);
			// Both the main session's own responses and the child's own one are still exactly what they
			// were: the two command invocations and the redraws wrote nothing.
			const after = readDocument(run.home.consumptionFile);
			expect(after === undefined ? [] : sessionsOf(after)).toEqual(sessions);
		} finally {
			await disposeRun(run);
		}
	}, 300_000);
});

describe("a real spawn's own start facts reach its row, the document and the next process (P26, P27, P19)", () => {
	test("the host's answers name the task and the pair, the widget and the document carry them, and a restart restores them", async () => {
		// One root for both processes: the second one resumes the session the first produced, over the
		// very document the first one left, and observes no start of the child at all.
		const runRoot = createRunRoot("detail-tree-startup");
		const first = await startRun("detail-tree-startup-first", {
			runRoot,
			extraExtensions: [SESSION_START_PROBE, STARTUP_FACTS_PROBE],
		});
		try {
			await first.session.request({ type: "set_session_name", name: MAIN_SESSION_NAME });
			expect((await first.session.prompt(DELEGATE_PROMPT)).status).toBe("completed");

			// What the harness itself answered at the spawned session's own start, read straight off the
			// native extension API by the probe fixture — the source side of the extension's mapping. The
			// registry id the spawn was allocated is the name that call gave the task; the agent definition
			// the session runs is the kind of agent (`task`), which is a category rather than the task's
			// name; the model and the level are the pair the session began on. The bundled `task` agent runs
			// the *auto* thinking selector, so whatever level the harness answers here is one it resolved
			// itself — and if it resolves none at the session's start, the honest reading is that no level
			// was proved, never the selector.
			const readings = await startReadingsUntil(first.session, all => all.some(line => line.kind === "sub"));
			const spawned = readings.filter(line => line.kind === "sub");
			const childStart = spawned[0] as StartReading;
			expect(spawned.every(line => line.id === CHILD_TASK_NAME)).toBe(true);
			expect(childStart.id).toBe(CHILD_TASK_NAME);
			expect(childStart.name).toBe(SPAWN_AGENT);
			expect(childStart.provider).toBe(MODEL_PROVIDER);
			expect(childStart.model).toBe(MODEL_ID);
			// The level the host answered at that session's own start. The bundled `task` agent runs the
			// *auto* thinking selector, and the getter the probe reads — the harness's own — answers the
			// effective level rather than that selector: on the recorded baseline's default configuration it
			// answers `high` here. It is the reading the row owes its `Effort:` field, and the configured
			// selector is never what a row states.
			expect(childStart.level).not.toBeNull();
			expect(childStart.level).not.toBe("auto");
			const provedLevel = String(childStart.level);
			// The host's own reading of what makes this a beginning: the spawned session's branch
			// carries no conversation yet, which is the fact the adapter requires before it treats this
			// instant's model and level as the session's startup rather than as its current pair. The
			// same reading is `true` for a session the harness reloads with its transcript (the second
			// process below).
			expect(childStart.conversation).toBe(false);
			// And the framework's own delivery carried the pair this host answered, on the session's own
			// start: the source of the row and the record below is the harness's reading, mapped.
			const spawnedStart = await startFactsOf(first.session, childStart.sessionId);
			expect(spawnedStart?.kind).toBe("sub");
			expect(spawnedStart?.reason).toBe("initial");
			expect(spawnedStart?.startup).toEqual({
				model: { provider: MODEL_PROVIDER, model: MODEL_ID },
				effort: provedLevel,
			});
			/** The effort one drawn row states, as the row's own separator delimits it. */
			const effortOf = (row: string): string => row.slice(row.indexOf("Effort: ") + "Effort: ".length).split("  ")[0] as string;

			const saved = await savedDocument(first.home.consumptionFile, document => sessionsOf(document).length >= 2);
			const mainRecord = sessionsOf(saved).find(entry => entry.parent === null);
			const childRecord =
				mainRecord === undefined ? undefined : sessionsOf(saved).find(entry => entry.parent === mainRecord.id);
			if (mainRecord === undefined || childRecord === undefined) {
				throw new Error(`the run saved no main/child pair: ${JSON.stringify(sessionsOf(saved))}`);
			}
			// The host reported this spawn a spawning agent, and the document filed the child under the
			// main session's own identity rather than under that registry id: the adapter's one-hop
			// resolution of the relation, not a guess about the hierarchy.
			expect(childStart.parentId).not.toBeNull();
			expect(childRecord.id).toBe(childStart.sessionId);
			expect(childRecord.parent).toBe(mainRecord.id);

			// The detail tree the operator asks for names that row by the task handle — never by the agent
			// definition — and states the pair the session began on, exactly as the host answered it above.
			await first.session.prompt("/budget detail");
			const detail =
				(await linesUntil(first.session, lines => lines.some(line => line.startsWith("\u2514\u2500 ")))) ?? [];
			const childRow = detail.find(line => line.startsWith(`\u2514\u2500 ${CHILD_TASK_NAME} `));
			expect(childRow).toBeDefined();
			expect(childRow).toContain(`Model: ${MODEL_PROVIDER} / ${MODEL_ID}  Effort: ${provedLevel}`);
			// A level this host did not prove is `?`; the configured selector (`auto`, which is what the
			// bundled `task` agent declares) is never passed off as one.
			expect(effortOf(childRow as string)).not.toBe("auto");

			// The same facts rode that session's own consumption commit rather than a write of their own:
			// the record is named by the handle, carries the started-on pair exactly as proved, and the
			// storage root still holds the one document.
			const withSnapshot = await savedDocument(
				first.home.consumptionFile,
				document => sessionsOf(document).some(entry => entry.id === childStart.sessionId && entry.startup !== undefined),
			);
			const stored = sessionsOf(withSnapshot).find(entry => entry.id === childStart.sessionId);
			expect(stored?.name).toBe(CHILD_TASK_NAME);
			expect(stored?.startup).toEqual({
				model: { provider: MODEL_PROVIDER, model: MODEL_ID },
				effort: provedLevel,
			});
			expect(readdirSync(first.home.storageDirectory).filter(name => name.endsWith(".json"))).toEqual([
				CONSUMPTION_FILE,
			]);

			// The process ends. An independent process starts over the same root, resumes that very session
			// and reads the document the first one left — observing no start of the child at all.
			const position = await currentSession(first);
			await stopRun(first);
			const second = await startRun("detail-tree-startup-second", {
				runRoot,
				extraExtensions: [SESSION_START_PROBE, STARTUP_FACTS_PROBE],
			});
			try {
				expect(payloadOf(await second.session.request({ type: "switch_session", sessionPath: position.file })).cancelled).toBe(
					false,
				);
				expect((await currentSession(second)).id).toBe(position.id);
				expect(startReadings(second.session).some(reading => reading.sessionId === childStart.sessionId)).toBe(false);

				// The session this process really entered is the one the first process left behind: the
				// host replayed its conversation, and its own reading says exactly that — a switch into an
				// existing session (`resume`), whose branch already carries the conversation. It is the
				// same signal a spawn makes, so this reading is what the adapter's requirement (a creation
				// over a session with no conversation yet) rejects. The framework therefore reports no
				// startup facts for it, whatever its context answers now.
				const resumedReading = await startReadingsUntil(second.session, all =>
					all.some(reading => reading.sessionId === position.id),
				).then(all => all.find(reading => reading.sessionId === position.id));
				expect(resumedReading?.nativeEvent).toBe("session_switch");
				expect(resumedReading?.nativeReason).toBe("resume");
				expect(resumedReading?.conversation).toBe(true);
				const resumedStart = await startFactsOf(second.session, position.id);
				expect(resumedStart?.reason).toBe("resume");
				expect(resumedStart?.startup).toBeNull();

				const documentBefore = sessionsOf(readDocument(second.home.consumptionFile) ?? {});
				const requestsBeforeDetail = second.capture.requests().length;
				await second.session.prompt("/budget detail");
				const restored =
					(await linesUntil(second.session, lines => lines.some(line => line.startsWith("\u2514\u2500 ")))) ?? [];
				const restoredRow = restored.find(line => line.startsWith(`\u2514\u2500 ${CHILD_TASK_NAME} `));
				// The restored row states the same handle and the same started-on pair the process that really
				// spawned the session drew: the whole snapshot came back from the document rather than a
				// truncated display text, and the row asked no provider for anything.
				expect(restoredRow).toBeDefined();
				expect(restoredRow).toContain(`Model: ${MODEL_PROVIDER} / ${MODEL_ID}  Effort: ${provedLevel}`);
				expect(second.capture.requests().length).toBe(requestsBeforeDetail);
				// Reading the snapshot started no write of its own either: the document still holds exactly
				// the records the first process's commits produced, and it is still the only file there.
				expect(sessionsOf(readDocument(second.home.consumptionFile) ?? {})).toEqual(documentBefore);
				expect(readdirSync(second.home.storageDirectory).filter(name => name.endsWith(".json"))).toEqual([
					CONSUMPTION_FILE,
				]);
			} finally {
				await disposeRun(second);
			}
		} finally {
			await disposeRun(first);
			runRoot.dispose();
		}
	}, 300_000);
});
