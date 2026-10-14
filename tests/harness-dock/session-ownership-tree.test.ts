/**
 * Session ownership and the parent tree in a running harness (P12, P13, P24; S5).
 *
 * This is the isolated real-host observation of attribution end to end: the dock materialises the
 * recorded baseline install, loads this repository's own model-cost entrypoint and the round
 * observation fixture through the harness's real loader, and drives real RPC sessions whose model
 * requests go to the dock's local capture endpoint. Nothing here is a double — the delegation, the
 * spawned sessions, the responses and the usage the endpoint reports are the host's own.
 *
 * Three facts are observed. The first is the real agent relation: the main session delegates to a
 * child through the host's own task tool, and the child delegates to a grandchild, so the host
 * really spawns three actual sessions whose own direct parents the framework reports. The second is
 * where their consumption goes: the document the extension saves holds one record per actual session,
 * each with exactly the requests that session issued — the main session's own request count excludes
 * both subagents' work even though every one of them resolves to the main session's owner line — and
 * the record's parent is the same direct parent the framework reported. The third is what switching
 * the displayed session does: the host shows another session, that session's request is its own, and
 * switching back to the first session continues *its* record rather than moving or merging anything.
 *
 * The subagents are the host's own, spawned through its own task tool, but they run on the same local
 * fixture model as the session that spawned them, so this suite says nothing about a real provider:
 * the usage it asserts is hand-derived from the wire numbers the capture endpoint sent.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { writeAgentSettings, writeProviderOverride } from "./agent-config";
import { type IsolatedHarness, REPO_ROOT, ensureIsolatedHarness, readBaselineRecord } from "./baseline";
import { type CapturedRequest, type CaptureStep, type CaptureServer, startCaptureServer } from "./capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV } from "./fixtures/extension-root/provider";
import { ROUND_FACTS_ID } from "./fixtures/round-facts/entrypoint";
import { SESSION_FACTS_ID } from "./fixtures/session-facts-probe/entrypoint";
import { RENAMED_NAME_PREFIX, SESSION_RENAME_ID } from "./fixtures/session-rename/entrypoint";
import { type RunRoot, createRunRoot } from "./run-root";
import { ControlledSession, type RpcFrame } from "./session";
import { listSessionFiles } from "./session-log";

const record = readBaselineRecord();
/** The extension's own OMP entrypoint, as the harness's loader discovers it. */
const MODEL_COST_ENTRYPOINT = path.join(REPO_ROOT, "entrypoints", "omp", "model-cost.ts");
/** The dock's own provider fixture, so the model-cost entrypoint runs beside the round fixture. */
const PROVIDER_FIXTURE = path.join(import.meta.dir, "fixtures", "extension-root", "provider.ts");
const ROUND_FACTS_FIXTURE = path.join(import.meta.dir, "fixtures", "round-facts", "entrypoint.ts");
/** The fixture that renames a spawned session while it runs, for the unviewed-rename case. */
const SESSION_RENAME_FIXTURE = path.join(import.meta.dir, "fixtures", "session-rename", "entrypoint.ts");
/** The fixture that reports the session axis's facts deliveries, for that same case. */
const SESSION_FACTS_FIXTURE = path.join(import.meta.dir, "fixtures", "session-facts-probe", "entrypoint.ts");

/** The document the extension keeps in its storage root. */
const CONSUMPTION_FILE = "consumption.json";

/**
 * The usage the capture endpoint reports for every completion, as the wire numbers it sends: 10
 * prompt tokens, 3 of them served from the prompt cache, and 7 completion tokens. What the extension
 * accounts for one response is hand-derived from that payload — the non-cached input is the rest of
 * the prompt — and nothing below recomputes it from the implementation.
 */
const WIRE_PROMPT_TOKENS = 10;
const WIRE_CACHED_TOKENS = 3;
const WIRE_COMPLETION_TOKENS = 7;
const CAPTURE_USAGE = { input: WIRE_PROMPT_TOKENS, output: WIRE_COMPLETION_TOKENS, cacheRead: WIRE_CACHED_TOKENS };

/** One response's four accounted buckets, as the extension stores them. */
const ONE_RESPONSE_TOKENS = {
	input: WIRE_PROMPT_TOKENS - WIRE_CACHED_TOKENS,
	cacheRead: WIRE_CACHED_TOKENS,
	cacheWrite: 0,
	output: WIRE_COMPLETION_TOKENS,
};

/** The provider and model the runs use: one the extension's own data prices, redirected locally. */
const MODEL_PROVIDER = "deepseek";
const MODEL_ID = "deepseek-flash";
const MODEL_SELECTOR = `${MODEL_PROVIDER}/${MODEL_ID}`;

/** The main session's name, which the runs set through the host's own command before prompting. */
const MAIN_SESSION_NAME = "dock-tree-main";
/** The name of the session the view switches to, which the host is told the same way. */
const OTHER_SESSION_NAME = "dock-tree-other";

/** The delegation each run scripts, and the mark each session's own opening message carries. */
const DELEGATE_PROMPT = "dock run: delegate to a child";
const CHILD_ASSIGNMENT = "dock child: take over and finish";
const GRANDCHILD_ASSIGNMENT = "dock grandchild: finish now";
const CHILD_NAME = "dock-child";
const GRANDCHILD_NAME = "dock-grandchild";
/**
 * The registry id a nested spawn is allocated: the handle its own call named, under the spawning
 * agent's id — the host's id for a session spawned from inside another subagent, rather than the
 * bare handle a spawn from the top-level session is given.
 */
const NESTED_GRANDCHILD_ID = `${CHILD_NAME}.${GRANDCHILD_NAME}`;
/** The agent definition every spawned session in this suite runs; the host's own name for that agent. */
const SPAWN_AGENT = "task";

/** The prompts the view-switch case adds: one in the session it switched to, one after switching back. */
const OTHER_PROMPT = "dock run: an exchange in the session the view moved to";
const RETURN_PROMPT = "dock run: one more exchange after switching back";

let harness: IsolatedHarness;

beforeAll(async () => {
	harness = await ensureIsolatedHarness(record);
});

/** One run's isolated home and the storage root the extension's shipped configuration names inside it. */
interface IsolatedHome {
	readonly home: string;
	readonly consumptionFile: string;
	/** The environment that makes the harness resolve `~/` here, and nowhere else. */
	readonly env: Record<string, string>;
}

function isolateHome(runRoot: RunRoot): IsolatedHome {
	const home = path.join(runRoot.path, "user-home");
	const storageDirectory = path.join(home, ".omp", "cost-archive");
	mkdirSync(storageDirectory, { recursive: true });
	return {
		home,
		consumptionFile: path.join(storageDirectory, CONSUMPTION_FILE),
		env: {
			USERPROFILE: home,
			HOME: home,
			HOMEDRIVE: path.parse(home).root,
			HOMEPATH: home.slice(path.parse(home).root.length - 1),
		},
	};
}

/** One run's resources, disposed by the caller. */
interface DockRun {
	readonly session: ControlledSession;
	readonly capture: CaptureServer;
	readonly runRoot: RunRoot;
	readonly home: IsolatedHome;
}

/** A scripted delegation: the host's own task tool, in the batch shape an RPC host runs. */
function delegationStep(name: string, assignment: string): CaptureStep {
	return {
		toolCall: {
			name: "task",
			arguments: JSON.stringify({
				context: "dock delegation context",
				tasks: [{ name, agent: SPAWN_AGENT, task: assignment, solutionSpace: "one fixed answer, nothing open" }],
			}),
		},
	};
}

/** A scripted subagent result: the host's own yield tool, which ends the subagent's session. */
function yieldStep(data: string): CaptureStep {
	return { toolCall: { name: "yield", arguments: JSON.stringify({ data }) } };
}

/** The messages one captured request carried, when its body really is the object this suite reads. */
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

/**
 * The mark one request carries in its own session: the first user message that session was started
 * with, which every later request of the same session repeats.
 */
function openingOf(request: CapturedRequest): string {
	const opening = messagesOf(request).find(message => roleOf(message) === "user");
	return opening === undefined ? "" : JSON.stringify(opening);
}

/**
 * Whether one request is the first its own session issued.
 *
 * What distinguishes it is that no assistant message has answered yet: the turn that delegated is the
 * session's opening turn, and every request after it carries the response it follows.
 */
function isOpeningRequest(request: CapturedRequest): boolean {
	return messagesOf(request).every(message => roleOf(message) !== "assistant");
}

/**
 * The scripted model of a delegating run: it reads which session's request this is from that
 * session's own opening message rather than from the order requests arrive in, and answers that
 * session. The main session delegates to a child, the child delegates to a grandchild, each subagent
 * yields its result, and every other request answers in prose.
 */
function delegatingStep(request: CapturedRequest): CaptureStep | undefined {
	const opening = openingOf(request);
	const openingRequest = isOpeningRequest(request);
	if (opening.includes(GRANDCHILD_ASSIGNMENT)) return yieldStep("grandchild result");
	if (opening.includes(CHILD_ASSIGNMENT)) {
		return openingRequest ? delegationStep(GRANDCHILD_NAME, GRANDCHILD_ASSIGNMENT) : yieldStep("child result");
	}
	if (opening.includes(DELEGATE_PROMPT) && openingRequest) return delegationStep(CHILD_NAME, CHILD_ASSIGNMENT);
	return {};
}

/**
 * One run: the recorded 18.5.0 install's own loader, the project's model-cost entrypoint and the round
 * fixture, driven through a real RPC session over the local capture endpoint.
 *
 * Blocking delegation is the host setting this needs: an RPC host otherwise runs each spawn as a
 * background job, which a suite that prompts once has no second prompt to observe. `extra` adds the
 * fixtures one case needs beside the shared three, so a case that observes more never widens what
 * another case runs.
 */
async function startRun(label: string, extra: readonly string[] = []): Promise<DockRun> {
	const runRoot = createRunRoot(label);
	const home = isolateHome(runRoot);
	writeAgentSettings(runRoot.agentDir, { "async.enabled": false });
	const capture = startCaptureServer({
		dir: runRoot.captureDir,
		replyText: "dock ownership reply",
		usage: CAPTURE_USAGE,
		respond: delegatingStep,
	});
	writeProviderOverride(runRoot.agentDir, MODEL_PROVIDER, { baseUrl: capture.baseUrl, apiKey: "dock-key" });
	try {
		const session = await ControlledSession.start({
			harness,
			runRoot,
			extensions: [PROVIDER_FIXTURE, MODEL_COST_ENTRYPOINT, ROUND_FACTS_FIXTURE, ...extra],
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

async function disposeRun(run: DockRun): Promise<void> {
	try {
		if (run.session.exited() === null) await run.session.stop({ timeoutMs: 15_000 });
	} catch {
		// The session already stopped (or never started); the rest of the run still gets cleaned up.
	}
	run.capture.stop();
	run.runRoot.dispose();
}

/** One session's record as the document holds it, with the fields this suite asserts. */
interface SavedSession {
	readonly id: string;
	readonly name: string;
	readonly parent: string | null;
	readonly saveVersion: number;
	readonly own: Record<string, Record<string, { readonly tokens: Record<string, number>; readonly costCny?: number }>>;
}

/** The document as this suite reads it: the sessions the extension saved, keyed by harness. */
interface SavedDocument {
	readonly harnesses?: Record<string, { readonly sessions?: SavedSession[] }>;
}

/** Every session record one document holds, whichever harness key it sits under. */
function sessionsOf(document: SavedDocument): SavedSession[] {
	return Object.values(document.harnesses ?? {}).flatMap(bucket => bucket.sessions ?? []);
}

/** One session's record in a document, or `undefined` when the document holds none for that id. */
function recordOf(document: SavedDocument, id: string): SavedSession | undefined {
	return sessionsOf(document).find(record => record.id === id);
}

/**
 * The document one run's storage root holds, or `undefined` while no save has landed.
 *
 * The extension's own reader is what validates this schema in production; what this suite reads from
 * the file is the fields it asserts, off the document a real save published.
 */
function readDocument(file: string): SavedDocument | undefined {
	if (!existsSync(file)) return undefined;
	const document: SavedDocument = JSON.parse(readFileSync(file, "utf8")) as SavedDocument;
	return document;
}

/** Lets the event loop turn over until nothing already queued is left. */
async function queuedWorkSettled(): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>();
	setImmediate(resolve);
	await promise;
}

/**
 * Waits until the document holds what a case expects of it, and answers with the document.
 *
 * A Round's end is dispatched on the host's own next task and the extension waits for its own save
 * before that handler returns, so a save lands after the prompt result does. The wait is on the
 * expected content rather than on a duration, and the deadline only keeps a save that never happened
 * from hanging the case.
 */
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

/** The operator notices one run emitted, as the harness itself framed them. */
function noticesOf(session: ControlledSession): ReadonlyArray<{ readonly level: unknown; readonly message: string }> {
	return session
		.frames()
		.filter(frame => frame.type === "extension_ui_request" && frame.method === "notify")
		.map(frame => ({ level: frame.notifyType, message: String(frame.message) }));
}

/** The object payload of one RPC answer, when the frame really carries one. */
function payloadRecord(frame: RpcFrame): Record<string, unknown> {
	const data = frame.data;
	return data !== null && typeof data === "object" ? (data as Record<string, unknown>) : {};
}

/** One evidence line the round fixture wrote, parsed from the channel the dock captures. */
interface ObservedLine {
	readonly kind: string;
	readonly facts: Record<string, unknown>;
}

/** One evidence line one probe fixture wrote, with the fixture it came from. */
interface ProbeLine extends ObservedLine {
	readonly id: string;
}

/** Every evidence line one run's stderr carried, in the order the run wrote it. */
function observedLines(session: ControlledSession): ObservedLine[] {
	const prefix = `[${ROUND_FACTS_ID}] `;
	const lines: ObservedLine[] = [];
	for (const raw of session.stderr().split("\n")) {
		if (!raw.startsWith(prefix)) continue;
		// `<kind> <json>`: the JSON payload itself contains spaces, so the kind is split off by
		// position rather than by re-splitting the whole line.
		const rest = raw.slice(prefix.length);
		const separator = rest.indexOf(" ");
		if (separator < 0) continue;
		lines.push({ kind: rest.slice(0, separator), facts: JSON.parse(rest.slice(separator + 1)) as Record<string, unknown> });
	}
	return lines;
}

/**
 * Every evidence line the given probe fixtures wrote, in the order the run wrote it.
 *
 * The order is the evidence: which fact one fixture observed relative to another's — a rename
 * request, the facts delivery it produced, and the Turn and Round edges of the same session — is
 * exactly what a case reads a delivery's timing from.
 */
function probeLines(session: ControlledSession, ids: readonly string[]): ProbeLine[] {
	const lines: ProbeLine[] = [];
	for (const raw of session.stderr().split("\n")) {
		for (const id of ids) {
			const prefix = `[${id}] `;
			if (!raw.startsWith(prefix)) continue;
			const rest = raw.slice(prefix.length);
			const separator = rest.indexOf(" ");
			if (separator < 0) continue;
			lines.push({
				id,
				kind: rest.slice(0, separator),
				facts: JSON.parse(rest.slice(separator + 1)) as Record<string, unknown>,
			});
			break;
		}
	}
	return lines;
}

/** Waits until the run's own evidence holds what a case expects, and answers with its lines. */
async function observedEventually(
	session: ControlledSession,
	accept: (lines: ObservedLine[]) => boolean,
): Promise<ObservedLine[]> {
	const deadline = Date.now() + 20_000;
	for (;;) {
		const lines = observedLines(session);
		if (accept(lines)) return lines;
		if (Date.now() > deadline) throw new Error(`no observation the case expects appeared:\n${session.stderr()}`);
		await queuedWorkSettled();
	}
}

/** One response's record fields for a request count, hand-written from the wire numbers. */
function usageOfRequests(count: number): Record<string, number> {
	return {
		input: ONE_RESPONSE_TOKENS.input * count,
		cacheRead: ONE_RESPONSE_TOKENS.cacheRead * count,
		cacheWrite: 0,
		output: ONE_RESPONSE_TOKENS.output * count,
	};
}

describe("a real delegating run accounts each actual session's own requests (P12, P13, P24)", () => {
	test("three sessions save their own record, with the direct parent the host reported", async () => {
		const run = await startRun("ownership-tree-delegation");
		try {
			await run.session.request({ type: "set_session_name", name: MAIN_SESSION_NAME });
			expect((await run.session.prompt(DELEGATE_PROMPT)).status).toBe("completed");

			// The host made five model requests: the main session's delegation, the child's delegation,
			// the grandchild's answer, the child's answer, and the main session's prose reply. The tool
			// executions between them are not requests.
			expect(run.capture.requests()).toHaveLength(5);
			// Nothing was skipped: every one of those requests carried a usage reading the host could
			// establish and a model the extension prices, so no notice was published about any of them.
			expect(noticesOf(run.session)).toEqual([]);

			// The framework's own deliveries name the three actual sessions and their direct parents:
			// the main session owns itself, the child's parent is the main session and the grandchild's
			// parent is the child — never the top-level session it also inherits its owner from.
			const rounds = await observedEventually(
				run.session,
				seen => seen.filter(line => line.kind === "round_start").length >= 3,
			);
			const starts = rounds.filter(line => line.kind === "turn_start");
			const parentOf = new Map(
				rounds.filter(line => line.kind === "round_start").map(line => [String(line.facts.sessionId), line.facts.parent]),
			);
			const mainId = String(starts[0]?.facts.sessionId);
			const childId = String(starts[1]?.facts.sessionId);
			const grandchildId = String(starts[2]?.facts.sessionId);
			expect(new Set([mainId, childId, grandchildId]).size).toBe(3);
			expect(parentOf.get(mainId)).toBe(null);
			expect(parentOf.get(childId)).toBe(mainId);
			expect(parentOf.get(grandchildId)).toBe(childId);
			// The three sessions' requests interleave in the scripted order, and no Turn of one session
			// is ever attributed to another's identity.
			expect(starts.map(start => String(start.facts.sessionId))).toEqual([mainId, childId, grandchildId, childId, mainId]);

			const document = await savedDocument(
				run.home.consumptionFile,
				candidate => sessionsOf(candidate).length === 3,
			);
			const records = sessionsOf(document);
			// One record per actual session, and each carries the real direct parent rather than the
			// owner line all three of them share.
			expect(new Set(records.map(entry => entry.id))).toEqual(new Set([mainId, childId, grandchildId]));
			expect(recordOf(document, mainId)?.parent).toBe(null);
			expect(recordOf(document, childId)?.parent).toBe(mainId);
			expect(recordOf(document, grandchildId)?.parent).toBe(childId);

			// Each record holds exactly the requests that session issued: the main session's own two,
			// the child's own two, the grandchild's own one. The subagents' requests are not folded into
			// the main session through the owner they resolve to, and none of them is counted twice.
			expect(recordOf(document, mainId)?.own[MODEL_PROVIDER]?.[MODEL_ID]?.tokens).toEqual(usageOfRequests(2));
			expect(recordOf(document, childId)?.own[MODEL_PROVIDER]?.[MODEL_ID]?.tokens).toEqual(usageOfRequests(2));
			expect(recordOf(document, grandchildId)?.own[MODEL_PROVIDER]?.[MODEL_ID]?.tokens).toEqual(usageOfRequests(1));
			// The model's requests were priced, so each record carries an amount as well; the suite
			// states no real price, only that an amount rather than a skipped one was recorded.
			for (const entry of records) {
				expect(typeof entry.own[MODEL_PROVIDER]?.[MODEL_ID]?.costCny).toBe("number");
				expect(entry.saveVersion).toBeGreaterThanOrEqual(1);
			}

			// The names are the host's own display facts: the main session was renamed through the host's
			// command and keeps that name, while a subagent — which this host never gives a session name —
			// is recorded by the handle its own spawn was allocated, the name its calling `task` really gave
			// that work, rather than by the agent definition beside it (`task`, a category every spawned
			// session in this suite runs) or by the registry identity an index uses.
			expect(recordOf(document, mainId)?.name).toBe(MAIN_SESSION_NAME);
			expect(recordOf(document, childId)?.name).toBe(CHILD_NAME);
			expect(recordOf(document, grandchildId)?.name).toBe(NESTED_GRANDCHILD_ID);
		} finally {
			await disposeRun(run);
		}
	}, 300_000);

	test("switching the session the host displays leaves every session's own record where it was", async () => {
		const run = await startRun("ownership-tree-view-switch");
		try {
			await run.session.request({ type: "set_session_name", name: MAIN_SESSION_NAME });
			expect((await run.session.prompt(DELEGATE_PROMPT)).status).toBe("completed");
			const first = await savedDocument(run.home.consumptionFile, candidate => sessionsOf(candidate).length === 3);
			const mainEntry = sessionsOf(first).find(entry => entry.parent === null);
			const childEntry = mainEntry === undefined ? undefined : sessionsOf(first).find(entry => entry.parent === mainEntry.id);
			const grandchildEntry =
				childEntry === undefined ? undefined : sessionsOf(first).find(entry => entry.parent === childEntry.id);
			if (mainEntry === undefined || childEntry === undefined || grandchildEntry === undefined) {
				throw new Error(`the delegating run saved no three-level tree: ${JSON.stringify(sessionsOf(first))}`);
			}
			const mainId = mainEntry.id;
			const childId = childEntry.id;
			const grandchildId = grandchildEntry.id;
			const firstVersions = sessionsOf(first).map(entry => [entry.id, entry.saveVersion]);
			const firstMainVersion = mainEntry.saveVersion;

			// The displayed session becomes a different one: the host stands up a new session and shows
			// it, and one prompt runs there. Its consumption is its own record, with no parent.
			const created = await run.session.request({ type: "new_session" });
			expect(payloadRecord(created).cancelled).toBe(false);
			await run.session.request({ type: "set_session_name", name: OTHER_SESSION_NAME });
			expect((await run.session.prompt(OTHER_PROMPT)).status).toBe("completed");
			const withOther = await savedDocument(run.home.consumptionFile, candidate => sessionsOf(candidate).length === 4);
			const other = sessionsOf(withOther).find(entry => entry.name === OTHER_SESSION_NAME);
			if (other === undefined) throw new Error(`the switched-to session saved no record: ${JSON.stringify(sessionsOf(withOther))}`);
			expect(other.id).not.toBe(mainId);
			expect(other.parent).toBe(null);
			expect(other.own[MODEL_PROVIDER]?.[MODEL_ID]?.tokens).toEqual(usageOfRequests(1));
			// The tree the first part of the run built is exactly as it was: the view moving neither
			// moved nor merged a single record.
			expect(
				sessionsOf(withOther)
					.filter(entry => entry.id !== other.id)
					.map(entry => [entry.id, entry.saveVersion]),
			).toEqual(firstVersions);

			// The displayed session switches back to the first one — the same real session, read from its
			// own file — and its next exchange continues its own record.
			const mainFile = listSessionFiles(run.runRoot.sessionDir).find(file =>
				readFileSync(file, "utf8").includes(DELEGATE_PROMPT),
			);
			if (mainFile === undefined) throw new Error("the first session's own file was not found in the session directory");
			await run.session.request({ type: "switch_session", sessionPath: mainFile });
			expect((await run.session.prompt(RETURN_PROMPT)).status).toBe("completed");

			// The main session's record is now a later version of the same identity with its own third
			// request added, and every other session's record is untouched by the switch.
			const document = await savedDocument(
				run.home.consumptionFile,
				candidate => (recordOf(candidate, mainId)?.saveVersion ?? 0) > firstMainVersion,
			);
			expect(recordOf(document, mainId)?.own[MODEL_PROVIDER]?.[MODEL_ID]?.tokens).toEqual(usageOfRequests(3));
			expect(recordOf(document, childId)?.own[MODEL_PROVIDER]?.[MODEL_ID]?.tokens).toEqual(usageOfRequests(2));
			expect(recordOf(document, grandchildId)?.own[MODEL_PROVIDER]?.[MODEL_ID]?.tokens).toEqual(usageOfRequests(1));
			expect(recordOf(document, childId)?.parent).toBe(mainId);
			expect(recordOf(document, grandchildId)?.parent).toBe(childId);
			// Seven model requests in all: five for the delegation, one in the session the view moved to,
			// one after switching back — and every one of them is accounted under the session it was
			// issued by.
			expect(run.capture.requests()).toHaveLength(7);
			const counts = sessionsOf(document).map(entry => [entry.id, entry.own[MODEL_PROVIDER]?.[MODEL_ID]?.tokens.input]);
			expect(counts).toContainEqual([mainId, usageOfRequests(3).input]);
			expect(counts).toContainEqual([childId, usageOfRequests(2).input]);
			expect(counts).toContainEqual([grandchildId, usageOfRequests(1).input]);
			expect(counts).toContainEqual([other.id, usageOfRequests(1).input]);
		} finally {
			await disposeRun(run);
		}
	}, 300_000);
});

describe("a session renamed while it runs and nobody views it (P24, S5)", () => {
	test("the host's own rename reaches a subscriber where it happens, and only the next normal save writes it", async () => {
		const run = await startRun("ownership-tree-unviewed-rename", [SESSION_RENAME_FIXTURE, SESSION_FACTS_FIXTURE]);
		try {
			await run.session.request({ type: "set_session_name", name: MAIN_SESSION_NAME });
			expect((await run.session.prompt(DELEGATE_PROMPT)).status).toBe("completed");

			// The renames cost the model nothing: the same five requests, and no notice at all — a
			// rename is display data, never a request or a skipped reading.
			expect(run.capture.requests()).toHaveLength(5);
			expect(noticesOf(run.session)).toEqual([]);

			const rounds = await observedEventually(
				run.session,
				seen => seen.filter(line => line.kind === "round_start").length >= 3,
			);
			const starts = rounds.filter(line => line.kind === "turn_start");
			const mainId = String(starts[0]?.facts.sessionId);
			const childId = String(starts[1]?.facts.sessionId);
			const grandchildId = String(starts[2]?.facts.sessionId);

			// The run's own evidence, in the order the host produced it: the fixture that renames a
			// spawned session, the fixture that observes the session axis's facts deliveries, and the
			// round fixture's edges for the same sessions.
			const lines = probeLines(run.session, [ROUND_FACTS_ID, SESSION_FACTS_ID, SESSION_RENAME_ID]);
			// The display renames the session on screen through the host's own command, and the host
			// reports that too: every rename in the run — the operator's and the two it was not
			// looking at — reaches a subscriber as its own facts delivery.
			const facts = lines.filter(line => line.id === SESSION_FACTS_ID && line.kind === "session_facts");
			const factsFor = (sessionId: string) => facts.filter(line => line.facts.sessionId === sessionId);
			expect(factsFor(mainId).map(line => line.facts.name)).toContain(MAIN_SESSION_NAME);
			expect(factsFor(childId)).toHaveLength(1);
			expect(factsFor(grandchildId)).toHaveLength(1);

			for (const [sessionId, parentId] of [
				[childId, mainId],
				[grandchildId, childId],
			] as const) {
				const factsAt = lines.findIndex(
					line => line.id === SESSION_FACTS_ID && line.kind === "session_facts" && line.facts.sessionId === sessionId,
				);
				const requestedAt = lines.findIndex(
					line => line.id === SESSION_RENAME_ID && line.kind === "requested" && line.facts.sessionId === sessionId,
				);
				const roundEndAt = lines.findIndex(
					line => line.id === ROUND_FACTS_ID && line.kind === "round_end" && line.facts.sessionId === sessionId,
				);
				// The rename is reported where it happens. The delivery that carries the new name comes
				// after the rename was asked for and before that session's Round closed, and not one of
				// that session's own Turn or Round edges lies between the two — so the name reached a
				// subscriber while the Turn it interrupted was still in flight, never at the next
				// boundary. That the request came after the session's own Turn start is what says the
				// Turn really was in flight, rather than the rename merely preceding the session's work.
				expect(factsAt).toBeGreaterThan(requestedAt);
				expect(roundEndAt).toBeGreaterThan(factsAt);
				expect(
					lines
						.slice(requestedAt + 1, factsAt)
						.filter(line => line.id === ROUND_FACTS_ID && line.facts.sessionId === sessionId),
				).toEqual([]);
				expect(
					lines
						.slice(0, requestedAt)
						.some(line => line.id === ROUND_FACTS_ID && line.kind === "turn_start" && line.facts.sessionId === sessionId),
				).toBe(true);
				// The facts delivery names that session, its real direct parent and the newest name —
				// the name the host was told to give it, not the identity it was created with.
				expect(lines[factsAt]?.facts).toEqual({
					sessionId,
					parent: parentId,
					name: `${RENAMED_NAME_PREFIX}${sessionId}`,
				});
			}
			// Only the two spawned sessions were renamed; the displayed one was never touched.
			expect(lines.filter(line => line.id === SESSION_RENAME_ID && line.kind === "requested").map(line => line.facts.sessionId)).toEqual([
				childId,
				grandchildId,
			]);

			// Each spawned session's own consumption is exactly its own requests — the rename neither
			// added a request nor forked the session's identity.
			const document = await savedDocument(run.home.consumptionFile, candidate => sessionsOf(candidate).length === 3);
			expect(recordOf(document, childId)?.own[MODEL_PROVIDER]?.[MODEL_ID]?.tokens).toEqual(usageOfRequests(2));
			expect(recordOf(document, grandchildId)?.own[MODEL_PROVIDER]?.[MODEL_ID]?.tokens).toEqual(usageOfRequests(1));
			// One record per session and one save each, written where its own Round ended: the rename
			// itself published nothing, and the record that carries it is the same normal save the
			// session's consumption produced.
			expect(recordOf(document, childId)).toMatchObject({
				name: `${RENAMED_NAME_PREFIX}${childId}`,
				parent: mainId,
				saveVersion: 1,
			});
			expect(recordOf(document, grandchildId)).toMatchObject({
				name: `${RENAMED_NAME_PREFIX}${grandchildId}`,
				parent: childId,
				saveVersion: 1,
			});
			// The session on screen keeps its own name, its own single record and its own parent line.
			expect(recordOf(document, mainId)).toMatchObject({ name: MAIN_SESSION_NAME, parent: null, saveVersion: 1 });
			expect(new Set(sessionsOf(document).map(entry => entry.id))).toEqual(new Set([mainId, childId, grandchildId]));
		} finally {
			await disposeRun(run);
		}
	}, 300_000);
});
