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
 * figures below are hand-added from it: each row's own cache rate and each row's own amount are
 * derived from the wire numbers the capture endpoint reported, so a row that showed another session's
 * consumption, an inclusive figure, or a Round row in the detail form could not pass.
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
 * non-cached input, 1000 cache reads, no cache writes and 1000 output — a cache hit rate of 1000 of
 * 2000, a whole 50 percent, hand-derived here. The four buckets' own total is a computed figure of
 * the scope rather than a column any row writes (P23), so nothing here reads it back off a row.
 */
const CAPTURE_USAGE = { input: 2000, output: 1000, cacheRead: 1000 };

/** The main session's name, which the run sets through the host's own command before prompting. */
const MAIN_SESSION_NAME = "dock-detail-main";

/** The delegation the run scripts, and the mark each session's own opening message carries. */
const DELEGATE_PROMPT = "dock detail run: delegate to a child";
const CHILD_ASSIGNMENT = "dock detail child: finish now";
const CHILD_TASK_NAME = "dock-detail-child";

let harness: IsolatedHarness;

beforeAll(async () => {
	harness = await ensureViewedSessionHarness(record);
}, 600_000);

/** One run's isolated home and the storage root the extension's shipped configuration names in it. */
interface IsolatedHome {
	readonly home: string;
	readonly consumptionFile: string;
	readonly env: Record<string, string>;
}

/**
 * The isolated user home one run uses, with the storage root already holding its own period: a
 * holiday period, because DeepSeek bills one off-peak all day, so every amount this run accounts is
 * the same figure whatever the wall clock says when a request goes out.
 */
function isolateHome(runRoot: RunRoot): IsolatedHome {
	const home = path.join(runRoot.path, "user-home");
	const storageDirectory = path.join(home, ".omp", "cost-archive");
	mkdirSync(storageDirectory, { recursive: true });
	const consumptionFile = path.join(storageDirectory, CONSUMPTION_FILE);
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
	return {
		home,
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
					tasks: [{ name: CHILD_TASK_NAME, agent: "task", task: CHILD_ASSIGNMENT, solutionSpace: "one fixed answer, nothing open" }],
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
}

/**
 * One run: the recorded install's own loader, the project's model-cost entrypoint, real RPC.
 *
 * A run started again over a case's own home and run root is a second process of the same isolated
 * environment — the restart the reload case below is about — so both are taken from the caller when
 * it has them, and only this run's own endpoint and capture directory are new.
 */
async function startRun(
	label: string,
	existing?: { readonly home: IsolatedHome; readonly runRoot: RunRoot },
): Promise<DockRun> {
	const runRoot = existing?.runRoot ?? createRunRoot(label);
	const home = existing?.home ?? isolateHome(runRoot);
	// Blocking delegation is the host setting this needs: an RPC host otherwise runs a spawn as a
	// background job, which a suite that prompts once has no second prompt to observe.
	writeAgentSettings(runRoot.agentDir, { "async.enabled": false });
	const capture = startCaptureServer({
		dir: existing === undefined ? runRoot.captureDir : path.join(runRoot.path, `captures-${label}`),
		replyText: "dock detail reply",
		usage: CAPTURE_USAGE,
		respond: delegatingStep,
	});
	writeProviderOverride(runRoot.agentDir, MODEL_PROVIDER, { baseUrl: capture.baseUrl, apiKey: "dock-key" });
	try {
		const session = await ControlledSession.start({
			harness,
			runRoot,
			extensions: [PROVIDER_FIXTURE, MODEL_COST_ENTRYPOINT],
			model: MODEL_SELECTOR,
			env: { [DOCK_CAPTURE_BASE_URL_ENV]: capture.baseUrl, ...home.env },
			promptTimeoutMs: 120_000,
		});
		return { session, capture, runRoot, home };
	} catch (error) {
		capture.stop();
		runRoot.dispose();
		throw error;
	}
}

async function disposeRun(run: DockRun, options: { readonly keepRoot?: boolean } = {}): Promise<void> {
	try {
		if (run.session.exited() === null) await run.session.stop({ timeoutMs: 15_000 });
	} catch {
		// The session already stopped (or never started); the rest of the run still gets cleaned up.
	}
	run.capture.stop();
	if (options.keepRoot !== true) run.runRoot.dispose();
}

/** The payload one RPC response carried, when it really is the object this file reads. */
function payloadOf(frame: RpcFrame): Record<string, unknown> {
	const data = frame.data;
	return data !== null && typeof data === "object" ? (data as Record<string, unknown>) : {};
}

/** The session this process is running, with the file the next process would resume. */
async function currentSession(
	session: ControlledSession,
	runRoot: RunRoot,
): Promise<{ readonly id: string; readonly file: string }> {
	const payload = payloadOf(await session.request({ type: "get_state" }));
	const id = typeof payload.sessionId === "string" ? payload.sessionId : "";
	if (id.length === 0) throw new Error(`the harness reported no session id: ${JSON.stringify(payload)}`);
	const file = readdirSync(runRoot.sessionDir)
		.filter(name => name.endsWith(".jsonl"))
		.map(name => path.join(runRoot.sessionDir, name))
		.find(candidate => candidate.includes(id));
	if (file === undefined) throw new Error(`no persisted session file names ${id} in ${runRoot.sessionDir}`);
	return { id, file };
}

/** One session's record as the document holds it, with the fields this file asserts. */
interface SavedSession {
	readonly id: string;
	readonly name: string;
	readonly parent: string | null;
	readonly own: Record<string, Record<string, { readonly tokens: Record<string, number> }>>;
	/** The milliseconds this session's own executions accumulated, when the run committed one. */
	readonly runtimeMs?: number;
}

/** The document as this file reads it: the sessions the extension saved, keyed by harness. */
interface SavedDocument {
	readonly harnesses?: Record<string, { readonly sessions?: SavedSession[] }>;
}

/** Every session record one document holds, whichever harness key it sits under. */
function sessionsOf(document: SavedDocument): SavedSession[] {
	return Object.values(document.harnesses ?? {}).flatMap(bucket => bucket.sessions ?? []);
}

/** One session's own cache rate, hand-added from its record's buckets. */
function cacheRateOf(record: SavedSession): number {
	let cacheRead = 0;
	let input = 0;
	for (const models of Object.values(record.own)) {
		for (const entry of Object.values(models)) {
			cacheRead += entry.tokens.cacheRead;
			input += entry.tokens.input;
		}
	}
	return input + cacheRead > 0 ? Math.round((cacheRead / (input + cacheRead)) * 100) : 0;
}

/**
 * The milliseconds one drawn runtime field states, or nothing when it states no duration at all.
 *
 * The form is the display's own — milliseconds under a second, then seconds, whole minutes and hours,
 * a compound only where the figure needs it — so a case reads the figure back rather than pinning the
 * wording. The unavailable marker the same field carries is deliberately not a duration: a host that
 * measured nothing and a host that really measured a duration must not read the same here.
 */
function drawnRuntimeMs(text: string): number | undefined {
	const match = /^(\d+)(ms|s|m|h)(?:(\d+)(s|m))?$/.exec(text.trim());
	if (match === null) return undefined;
	const unit = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000 }[match[2] as "ms" | "s" | "m" | "h"];
	const rest = match[3] === undefined ? 0 : Number(match[3]) * (match[4] === "s" ? 1_000 : 60_000);
	return Number(match[1]) * unit + rest;
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
			const main = cacheRateOf(mainRecord);
			const child = cacheRateOf(childRecord);
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
				`\u2502  ${MODEL_PROVIDER} / ${MODEL_ID}  Cache: ${main}%  \u00A5Cache/In/Out\uff1a0:20:80  Cost: \u00A50.01`,
			);
			// The child's own row carries its accumulation, the current context the harness recorded from
			// that subagent's own binding — `percent (tokens/budget)`, the same form the bar above reads
			// and against the monetary channel's own fixed display budget, never the host's context
			// window — and, after it, the runtime the host itself measured for that child's executions.
			// The token figure is the host's own estimate of the child's conversation rather than a number
			// this document holds, so it is pinned to the form and the budget, not to a token count.
			const childRow = String(detail[3]);
			const runtimeMark = "  Run: ";
			const childPrefix = `\u2514\u2500 ${childRecord.name}  Cache: ${child}%  Cost: \u00A50.0050  Ctx: `;
			expect(childRow.startsWith(childPrefix)).toBe(true);
			const [childContext, childRuntime] = childRow.slice(childPrefix.length).split(runtimeMark);
			expect(childRuntime).toBeDefined();
			expect(childContext).toMatch(/^\d+% \([\d.,]+K?\//);
			expect(childContext.endsWith(`/${formatTokens(DEEPSEEK_DISPLAY_BUDGET)})`)).toBe(true);

			// What the row states there is a duration the real host really measured for that subagent's own
			// execution — read back from the drawn field, so a host that had produced no such reading (the
			// unavailable marker) cannot pass as one. The run reported no unusable runtime either, which is
			// what the notices below are: an execution the host stated and this extension could not use
			// would arrive as an error there. The root's own model row above carries no runtime at all: a
			// runtime belongs to the session an execution ran in, and the main session is not one.
			expect(drawnRuntimeMs(childRuntime)).toBeGreaterThan(0);
			expect(String(detail[2])).not.toContain(runtimeMark);
			expect(detail.some(line => line.startsWith("Round:"))).toBe(false);
			// The total behind that tree is the two records' own amounts added once each: 0.01004 (the
			// main session's two responses) plus 0.00502 (the child's one), 0.01506 under the same amount
			// rule as \u00A50.02 — the model row above is the main session's own alone, so nothing here is an
			// inclusive figure counted twice. Sum is no longer one of the fields this proves it by (P23).
			expect(total).toContain("Cost: \u00A50.02");

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

describe("a resumed process draws the runtime the document already carries (P10, P19, P35)", () => {
	test("the child's own row states the saved figure and not a second accumulation of the same execution", async () => {
		const first = await startRun("runtime-reload");
		const home = first.home;
		const runRoot = first.runRoot;
		let resumed: { readonly id: string; readonly file: string };
		let childName: string;
		let savedRuntime: number;
		try {
			await first.session.request({ type: "set_session_name", name: MAIN_SESSION_NAME });
			expect((await first.session.prompt(DELEGATE_PROMPT)).status).toBe("completed");

			// The first process really measured the child's executions and committed the figure.
			const document = await savedDocument(
				home.consumptionFile,
				saved => sessionsOf(saved).some(session => session.name !== MAIN_SESSION_NAME && typeof session.runtimeMs === "number"),
			);
			const child = sessionsOf(document).find(session => session.name !== MAIN_SESSION_NAME);
			if (child === undefined || typeof child.runtimeMs !== "number") {
				throw new Error(`the document holds no child runtime: ${JSON.stringify(sessionsOf(document))}`);
			}
			childName = child.name;
			savedRuntime = child.runtimeMs;
			resumed = await currentSession(first.session, runRoot);
		} finally {
			// The root survives the first process: the second one starts over the same storage and the
			// same session directory, which is what makes it a restart rather than a fresh run.
			await disposeRun(first, { keepRoot: true });
		}

		// A second, independent process over the very environment the first one wrote — the session is
		// resumed from the file the host persisted, so its transcript, including the delegation the child
		// ran under, is loaded again by a process whose own accumulation starts from the document.
		const second = await startRun("runtime-reload-second", { home, runRoot });
		try {
			const switched = payloadOf(await second.session.request({ type: "switch_session", sessionPath: resumed.file }));
			expect(switched.cancelled).toBe(false);
			expect((await currentSession(second.session, runRoot)).id).toBe(resumed.id);
			const before = readFileSync(home.consumptionFile, "utf8");

			// The detail form the resumed process draws: the tree is read from the document this process
			// loaded, so the child's row carries the runtime that document holds. An execution the previous
			// process already accumulated is not observed again here — the harness states a spawn's own
			// duration while that spawn runs, and a resumed session runs no tool again — so the row states
			// the saved figure rather than twice it, and the draw writes nothing.
			await second.session.prompt("/budget detail");
			const lines = await linesUntil(second.session, shown => shown.some(line => line.includes("  Run: ")));
			const row = (lines ?? []).find(line => line.includes(`\u2514\u2500 ${childName}`) || line.includes(`\u251C\u2500 ${childName}`));
			if (row === undefined) throw new Error(`no child row was drawn: ${JSON.stringify(lines)}`);
			const drawn = drawnRuntimeMs(row.slice(row.indexOf("  Run: ") + "  Run: ".length));
			expect(drawn).toBe(savedRuntime);
			expect(readFileSync(home.consumptionFile, "utf8")).toBe(before);
		} finally {
			await disposeRun(second);
		}
	}, 300_000);
});
