/**
 * Ticket 09's real-host record: what one pi session's public Round does while it waits on real
 * background delegations, and what the same session saves when that Round finally closes.
 *
 * Usage
 *   bun scripts/pi-background-round-smoke.ts                 # resolve the installed pi CLI
 *   bun scripts/pi-background-round-smoke.ts --pi <path>     # or PI_CLI=<path>
 *   bun scripts/pi-background-round-smoke.ts --keep          # keep every run root for inspection
 *
 * What it drives: the real installed pi as a child process in RPC mode, with an isolated agent state,
 * session directory, working directory and user home under the OS temp root, and a local
 * OpenAI-compatible capture endpoint declared as the provider. Loaded into that session are the
 * production pi assembly (through an entrypoint of this run's own layout, so the storage root is the
 * run's), the pinned `pi-subagents` artifact this repository installs, and a fixture that records the
 * public Round and Turn edges one binding dispatches. Nothing of any of them is restated here.
 *
 * What it asserts (consumer-visible behavior only; no source or wiring inspection):
 *   1. **A parent waiting on its delegations keeps one Round open.** While the provider's own async
 *      artifacts say the launched runs are still live, the parent's public Round is open and no end
 *      has been dispatched — the session's own idle fact is not the whole story.
 *   2. **The completion wake continues that Round.** The Turns of the woken runs carry the same Round
 *      identity as the Turns of the prompt that started the delegation, so no second Round opened.
 *   3. **A child's terminal state does not end the parent's Round.** The parent's end arrives only
 *      after its own post-delegation run has settled with nothing left to wait on.
 *   4. **The Round boundary is where the consumption is saved** (S3): the isolated storage document
 *      holds the parent session's own request count as its own tokens, read once after the waiting
 *      Round closed and again after an ordinary later Round closed.
 *   5. **The delegation ran in its own session and saved under its own identity**, with the parent the
 *      direct parent its own file states — the two sessions' Rounds and records are their own.
 *
 * What it cannot assert here (recorded, not silently skipped): the provider's wake-reservation
 * deadline is reachable only when a sent wake never starts, which this host's idle-session path does
 * not produce without a native UI; the injected-clock behavior of that deadline is the provider's own
 * module's, and the part this ticket owns — that the adapter accepts an answer of "nothing held" and
 * adds no deadline of its own — is what the S1 partition covers. Foreground delegation, nested
 * delegation and cancellation remain unverified here for the reasons ticket 05's record states.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { CapturedRequest } from "../tests/harness-dock/capture-server";
import { PI_MODEL_COST_CONFIG_ROOT_ENV } from "../tests/harness-dock/fixtures/pi-model-cost/env";
import { PI_BACKGROUND_ROUNDS_CHILD_ENTRY_ENV, PI_BACKGROUND_ROUNDS_PREFIX } from "../tests/harness-dock/fixtures/pi-background-rounds/prefix";
import { type PiCli, type PiRun, PiSession, piVersion, resolvePiCli, startPiRun } from "../tests/harness-dock/pi-session";

/** The repository root: this script lives in `scripts/`. */
const REPO_ROOT = path.resolve(import.meta.dir, "..");

/** The pinned provider's own extension entry, as the artifact in this repository installs it. */
const PROVIDER_ENTRY = path.join(REPO_ROOT, "node_modules", "pi-subagents", "index.js");

/** The dock fixture that records the public Round and Turn edges one real binding dispatches. */
const ROUND_PROBE = path.join(REPO_ROOT, "tests", "harness-dock", "fixtures", "pi-background-rounds", "entrypoint.ts");

/** The version this smoke's expectations were written against. */
const EXPECTED_PI_VERSION = "1.2.0";

/** The provider and model the run declares. */
const PROVIDER = "deepseek";
const MODEL = "deepseek-flash";

/** The document the extension keeps in its storage root. */
const CONSUMPTION_FILE = "consumption.json";

/** The usage the capture endpoint reports for every completion, so a saved amount is non-zero. */
const CAPTURE_USAGE = { input: 1_000, output: 200, cacheRead: 0, cacheWrite: 0 } as const;

/** The two delegations' own task texts: this run's, so a captured request is provably theirs. */
const TASK_ONE = "background-round-smoke: list the repository's top-level directories";
const TASK_TWO = "background-round-smoke: report the package's declared test scripts";

/** How long a delegated child's own answer is withheld, so the delegation is provably still live. */
const CHILD_HOLD_MS = 8_000;

/** The text a parent request is answered with when it delegates nothing. */
const PARENT_REPLY = "background-round-smoke parent reply";

/** The text a delegated child's own request is answered with. */
const CHILD_REPLY = "background-round-smoke child reply";

/** The provider's own wait tool, as this artifact registers it. */
const WAIT_TOOL = "bg_wait";

/** The one prompt whose run launches both delegations. */
const PROMPT = "background-round-smoke: delegate both scouting tasks, then summarize what you know.";

/** The later prompt whose Round is an ordinary one, with the provider loaded and holding nothing. */
const LATER_PROMPT = "background-round-smoke: one more exchange in this session.";

// ---------------------------------------------------------------------------
// Observations
// ---------------------------------------------------------------------------

const observations: Array<{ readonly name: string; readonly detail: string }> = [];
const runs: DockRun[] = [];
const sessions: PiSession[] = [];

class SmokeFailure extends Error {
	constructor(name: string, detail: string) {
		super(`check failed: ${name}\n  ${detail}`);
		this.name = "SmokeFailure";
	}
}

function observe(name: string, ok: boolean, detail: string): void {
	if (!ok) throw new SmokeFailure(name, detail);
	observations.push({ name, detail });
	console.log(`  ok    ${name}`);
}

// ---------------------------------------------------------------------------
// The isolated run
// ---------------------------------------------------------------------------

/** One run's isolated user home and the storage root the configuration inside it names. */
interface IsolatedHome {
	readonly path: string;
	readonly storageDirectory: string;
	readonly consumptionFile: string;
	readonly env: Record<string, string>;
}

/** One provisioned run: the isolated root, the capture endpoint and the layout it binds. */
interface DockRun {
	readonly run: PiRun;
	readonly home: IsolatedHome;
	readonly configRoot: string;
	readonly childEntry: string;
	readonly sessions: PiSession[];
}

/** The user home of one run: `<run root>/user-home`, with the `.omp` home the field's `~/` means. */
function isolateHome(runRoot: string): IsolatedHome {
	const home = path.join(runRoot, "user-home");
	const storageDirectory = path.join(home, ".omp", "cost-archive");
	mkdirSync(storageDirectory, { recursive: true });
	return {
		path: home,
		storageDirectory,
		consumptionFile: path.join(storageDirectory, CONSUMPTION_FILE),
		env: { USERPROFILE: home, HOME: home },
	};
}

/**
 * The configuration root one run binds the production assembly to, and the child entry it states.
 *
 * It is a throwaway repository layout carrying only `extensions/model-cost/config.yaml` and an
 * entrypoint that binds the production pi harness to that layout's own storage root, so the run never
 * reads the shipped configuration and never writes outside its own home. The same entry is the one
 * the assembly requires in the sessions a provider spawns, which is why the round probe is handed it.
 */
function configRootFor(home: IsolatedHome, label: string): { readonly root: string; readonly childEntry: string } {
	const root = mkdtempSync(path.join(tmpdir(), `pi-background-round-${label}-`));
	const extensions = path.join(root, "extensions", "model-cost");
	mkdirSync(extensions, { recursive: true });
	writeFileSync(
		path.join(extensions, "config.yaml"),
		`storageDir: ${JSON.stringify(home.storageDirectory)}\nbalanceTtlMs: 30000\ncodexQuotaTtlMs: 15000\n`,
		"utf8",
	);
	const entrypointDirectory = path.join(root, "entrypoints", "pi");
	mkdirSync(entrypointDirectory, { recursive: true });
	const childEntry = path.join(entrypointDirectory, "model-cost.ts");
	const harness = path.join(REPO_ROOT, "extensions", "model-cost", "harnesses", "pi.ts");
	const relative = path.relative(entrypointDirectory, harness).replace(/\\/g, "/");
	writeFileSync(
		childEntry,
		`import { modelCostPiHarness } from ${JSON.stringify(relative.startsWith(".") ? relative : `./${relative}`)};\n\nexport default modelCostPiHarness(${JSON.stringify(root)});\n`,
		"utf8",
	);
	return { root, childEntry };
}

/**
 * Whether one captured request is a *parent* request.
 *
 * The provider's own delegation tool is in the parent session's tool list and in no delegated child's
 * — the `scout` agent this run delegates to states its own tools, and the delegation tool is not among
 * them — so the captured request's own tool list is what separates the two sessions' traffic.
 */
function carriesDelegationTool(request: CapturedRequest): boolean {
	const body = request.json as { tools?: Array<{ function?: { name?: string } }> } | null;
	return (body?.tools ?? []).some(tool => tool.function?.name === "subagent");
}

/** One scripted delegation call, as the model would emit it, for one task. */
function delegationCall(task: string): { readonly name: string; readonly arguments: string } {
	return { name: "subagent", arguments: JSON.stringify({ agent: "scout", task, async: true }) };
}

/** One scripted non-blocking wait, as the model would emit it, for one already-finished run. */
function waitCall(runId: string): { readonly name: string; readonly arguments: string } {
	return { name: WAIT_TOOL, arguments: JSON.stringify({ id: runId, nonBlocking: true }) };
}

/** The first run identity one request's own conversation carries, as its tool results state it. */
function finishedRunIdIn(request: CapturedRequest): string | undefined {
	return /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/.exec(JSON.stringify(request.json ?? ""))?.[0];
}

/** One fresh run root with a capture endpoint behind it, scripting two background delegations. */
function startDockRun(cli: PiCli, label: string): DockRun {
	const tasks = [TASK_ONE, TASK_TWO];
	let launched = 0;
	let laterSteps = 0;
	const run = startPiRun(cli, label, {
		provider: PROVIDER,
		model: MODEL,
		cost: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 },
		endpoint: {
			usage: CAPTURE_USAGE,
			replyText: PARENT_REPLY,
			balance: { total: "12.34" },
			respond: request => {
				// A delegated child answering its own task: held, so the parent's Round is read while the
				// delegation provably still runs. A parent request delegates each task once and answers
				// plainly afterwards, so the run has exactly the two delegations it intends.
				if (!carriesDelegationTool(request)) return { replyText: CHILD_REPLY, answerDelayMs: CHILD_HOLD_MS };
				if (JSON.stringify(request.json ?? "").includes(LATER_PROMPT)) {
					// The later prompt: the model opens one non-blocking wait on a delegation that has
					// already finished and reported, and then answers — work that registers a subscription
					// without waiting on anything.
					laterSteps++;
					const runId = finishedRunIdIn(request);
					if (laterSteps === 1 && runId !== undefined) return { toolCall: waitCall(runId) };
					return { replyText: PARENT_REPLY };
				}
				if (launched >= tasks.length) return { replyText: PARENT_REPLY };
				const call = delegationCall(tasks[launched] ?? TASK_ONE);
				launched++;
				return { toolCall: call };
			},
		},
	});
	const home = isolateHome(run.root.path);
	const { root, childEntry } = configRootFor(home, label);
	const dock: DockRun = { run, home, configRoot: root, childEntry, sessions: [] };
	runs.push(dock);
	return dock;
}

/** One session over one run's isolated state, loading exactly the extensions the case names. */
async function openSession(dock: DockRun, label: string): Promise<PiSession> {
	const session = await PiSession.start({
		cli: dock.run.cli,
		runRoot: dock.run.root,
		entrypoint: [path.join(dock.configRoot, "entrypoints", "pi", "model-cost.ts"), PROVIDER_ENTRY, ROUND_PROBE],
		selector: dock.run.selector,
		env: {
			...dock.home.env,
			[PI_MODEL_COST_CONFIG_ROOT_ENV]: dock.configRoot,
			[PI_BACKGROUND_ROUNDS_CHILD_ENTRY_ENV]: dock.childEntry,
			// The provider's own async artifacts belong to this run's root, so a run leaves nothing in
			// the machine's shared temp space and this script can read the provider's own status there.
			PI_SUBAGENTS_TEMP_ROOT: path.join(dock.run.root.path, "subagent-temp"),
		},
	});
	dock.sessions.push(session);
	sessions.push(session);
	return session;
}

// ---------------------------------------------------------------------------
// Reading what the run really wrote
// ---------------------------------------------------------------------------

/** One evidence line the round probe wrote, without its prefix. */
function roundLines(session: PiSession): string[] {
	return session
		.stderr()
		.split("\n")
		.filter(line => line.startsWith(`${PI_BACKGROUND_ROUNDS_PREFIX} `))
		.map(line => line.slice(PI_BACKGROUND_ROUNDS_PREFIX.length + 1));
}

/** The kind one probe line states, and the session it names. */
function lineOf(line: string): { readonly kind: string; readonly sessionId: string } {
	const [kind = "", sessionId = ""] = line.split(" ");
	return { kind, sessionId };
}

/** The value one field of a probe line states, or `undefined` when the line states none of it. */
function fieldOf(line: string, name: string): string | undefined {
	return new RegExp(`(?:^| )${name}=([^ ]*)`).exec(line)?.[1];
}

/** One session's own public Turn and Round edges, as the probe recorded them. */
interface SessionEdges {
	readonly rounds: readonly string[];
	readonly roundIds: readonly string[];
}

/** The edges of one exact session, in dispatch order: another session's lines are not its own. */
function edgesOf(lines: readonly string[], sessionId: string): SessionEdges {
	const mine = lines.map(line => ({ line, ...lineOf(line) })).filter(entry => entry.sessionId === sessionId);
	return {
		rounds: mine
			.filter(entry => entry.kind === "round_start" || entry.kind === "round_end")
			.map(entry => entry.kind),
		roundIds: mine.filter(entry => entry.kind === "turn_start").map(entry => fieldOf(entry.line, "round") ?? "<none>"),
	};
}

/** One session file's own first line, as pi writes the header this adapter reads. */
function sessionHeader(file: string): { readonly type?: string; readonly id?: string; readonly parentSession?: string } | undefined {
	try {
		const [firstLine] = readFileSync(file, "utf8").split("\n", 1);
		return JSON.parse(firstLine ?? "") as { readonly type?: string; readonly id?: string; readonly parentSession?: string };
	} catch {
		return undefined;
	}
}

/** Every session file pi wrote under one run's session directory, in path order. */
function sessionFiles(directory: string): string[] {
	if (!existsSync(directory)) return [];
	return readdirSync(directory, { recursive: true })
		.map(entry => path.join(directory, String(entry)))
		.filter(file => file.endsWith(".jsonl"))
		.sort();
}

/** One of the provider's own async run status files, as far as this script reads it. */
interface AsyncStatus {
	readonly file: string;
	readonly state?: string;
}

/** The provider's own directory of completion-replay records under one run root. */
function replaysDir(root: string): string {
	return path.join(root, "subagent-temp", "async-subagent-results", "completion-replay");
}

/** Every async run status the provider wrote under one run root, in path order. */
function asyncStatuses(root: string): AsyncStatus[] {
	if (!existsSync(root)) return [];
	return readdirSync(root, { recursive: true })
		.map(entry => path.join(root, String(entry)))
		.filter(file => path.basename(file) === "status.json")
		.sort()
		.map(file => {
			try {
				const parsed = JSON.parse(readFileSync(file, "utf8")) as { readonly state?: string };
				return { file, state: parsed.state };
			} catch {
				return { file };
			}
		});
}

/** Whether the provider's own artifacts say one async run is still live. */
function liveStatuses(root: string): AsyncStatus[] {
	return asyncStatuses(root).filter(status => status.state === "queued" || status.state === "running");
}

/** Waits until `accept` holds of what the run reports, polling the fact rather than a duration. */
async function waitFor(
	accept: () => boolean,
	label: string,
	timeoutMs = 120_000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		if (accept()) return;
		if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
		await Bun.sleep(100);
	}
}

/**
 * What one run had reported when a case gave up on it.
 *
 * A real-host run is expensive, so a failure carries the material needed to read it: the public
 * edges the probe dispatched, this entry's own diagnostics, the provider's own async states, and the
 * tail of the frame stream.
 */
function reportDiagnostics(label: string, dock: DockRun, session: PiSession, parentId: string): void {
	const lines = roundLines(session);
	const own = session.stderr().split("\n").filter(line => line.includes("background work cannot be read") || line.includes("modelCost:"));
	console.log(`\n--- diagnostics: ${label}`);
	console.log(`edges (this session): ${JSON.stringify(edgesOf(lines, parentId))}`);
	console.log(`probe lines: ${JSON.stringify(lines.slice(-12))}`);
	console.log(`async states: ${JSON.stringify(asyncStatuses(dock.run.root.path).map(status => status.state))}`);
	console.log(`own diagnostics: ${JSON.stringify(own.slice(-8))}`);
	console.log(`frames: ${JSON.stringify(session.frames().slice(-6).map(frame => JSON.stringify(frame).slice(0, 300)))}`);
}

/** One session record of the consumption document, as far as this script reads it. */
interface SessionRecord {
	readonly id: string;
	readonly parent?: string | null;
	readonly own?: Record<string, Record<string, { readonly tokens?: Record<string, number> }>>;
}

/** One consumption document, as far as this script reads it. */
interface ConsumptionDocument {
	readonly harnesses?: Record<string, { readonly sessions?: readonly SessionRecord[] } | undefined>;
}

/** Every record this document holds for the pi harness, in document order. */
function recordsOf(document: ConsumptionDocument | undefined): readonly SessionRecord[] {
	return document?.harnesses?.pi?.sessions ?? [];
}

/** The document at `file`, or `undefined` while it is not there or not readable as one. */
function readDocument(file: string): ConsumptionDocument | undefined {
	if (!existsSync(file)) return undefined;
	try {
		return JSON.parse(readFileSync(file, "utf8")) as ConsumptionDocument;
	} catch {
		return undefined;
	}
}

/** The record one document holds for a session id, or `undefined` when it holds none. */
function recordOf(document: ConsumptionDocument | undefined, sessionId: string): SessionRecord | undefined {
	return recordsOf(document).find(record => record.id === sessionId);
}

/**
 * Waits until the document holds what `accept` states, and answers it.
 *
 * The wait is on the fact itself — a save is published by a Round's own end, a little after the
 * delivery that drove it — and the deadline only keeps a save that never happened from hanging the
 * run. Nothing here reads the implementation: the file the extension really published is read.
 */
async function savedDocument(file: string, accept: (document: ConsumptionDocument) => boolean, timeoutMs = 60_000): Promise<ConsumptionDocument> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const document = readDocument(file);
		if (document !== undefined && accept(document)) return document;
		if (Date.now() > deadline) throw new Error(`no consumption document this case expects was published at ${file}`);
		await Bun.sleep(100);
	}
}

/** The own tokens one session's record states for the one provider and model this run declares. */
function ownTokens(record: SessionRecord | undefined): number | undefined {
	return record?.own?.[PROVIDER]?.[MODEL]?.tokens?.input;
}

/**
 * What the tool result after one named tool call stated, as the session journal recorded it.
 *
 * The journal is the host's own record of the conversation, so the text read here is the provider's
 * own answer about the call — its subscription token, or its refusal — rather than this script's
 * expectation of one.
 */
function toolResultAfter(file: string, toolName: string): string | undefined {
	if (!existsSync(file)) return undefined;
	const lines = readFileSync(file, "utf8").split("\n").filter(line => line.length > 0);
	// The call itself, not a mention of the provider's tool list or of the result being read: the
	// session journal records the assistant message that made the call.
	const callIndex = lines.findIndex(line => line.includes('"type":"toolCall"') && line.includes(`"name":"${toolName}"`));
	if (callIndex === -1) return undefined;
	for (const line of lines.slice(callIndex + 1)) {
		if (!line.includes('"role":"toolResult"')) continue;
		// The result's own text, or the whole line when it states none this reader can pick out.
		return (/"content":\s*\[.*?\]/.exec(line)?.[0] ?? line).slice(0, 400);
	}
	return undefined;
}

// ---------------------------------------------------------------------------
// The phase
// ---------------------------------------------------------------------------

/** Everything the waiting-Round phase reports about one run. */
async function phaseWaitingRound(cli: PiCli): Promise<void> {
	console.log("\nphase: a session waiting on two real background delegations");
	const dock = startDockRun(cli, "waiting-round");
	const session = await openSession(dock, "waiting-round");

	const parentFile = await session.sessionFile();

	// The prompt's run launches both delegations and settles: pi is idle, and the session is waiting.
	await session.run(PROMPT, 120_000);

	// pi writes a session file lazily, so the header is read once the run that created it has written.
	await waitFor(() => sessionHeader(parentFile)?.id !== undefined, "the session's own header", 20_000);
	const parentId = sessionHeader(parentFile)?.id;
	if (parentId === undefined) throw new Error(`the run's own session file states no identity: ${parentFile}`);

	const launched = asyncStatuses(dock.run.root.path);
	const stillLive = liveStatuses(dock.run.root.path);
	const openWhileWaiting = edgesOf(roundLines(session), parentId);
	observe(
		"both delegations really launched, and the provider's own artifacts say they are still running",
		launched.length === 2 && stillLive.length === 2,
		`statuses: ${JSON.stringify(asyncStatuses(dock.run.root.path).map(status => status.state))}`,
	);
	observe(
		"the parent's Round is open while nothing but the delegations keeps it busy",
		openWhileWaiting.rounds.join(",") === "round_start",
		`edges: ${JSON.stringify(openWhileWaiting.rounds)}, stderr tail: ${JSON.stringify(roundLines(session).slice(-4))}`,
	);

	// The delegations finish and the provider hands the parent its notices and wakes; the woken runs
	// continue the Round the parent is already in, and the Round ends only when its own run settles.
	await waitFor(() => liveStatuses(dock.run.root.path).length === 0, "both async runs to reach terminal");
	const afterDelegations = edgesOf(roundLines(session), parentId);
	observe(
		"a child's terminal state does not end the parent's Round",
		afterDelegations.rounds.join(",") === "round_start",
		`edges: ${JSON.stringify(afterDelegations.rounds)}, stderr tail: ${JSON.stringify(roundLines(session).slice(-4))}`,
	);

	await waitFor(
		() => edgesOf(roundLines(session), parentId).rounds.includes("round_end"),
		"the parent's Round to end",
	).catch(error => {
		reportDiagnostics("waiting for the parent's Round to end", dock, session, parentId);
		throw error;
	});
	const closed = edgesOf(roundLines(session), parentId);
	observe(
		"the parent's Round opens once and closes once across the whole delegation",
		closed.rounds.join(",") === "round_start,round_end",
		`edges: ${JSON.stringify(closed.rounds)}`,
	);
	observe(
		"every Turn of that Round is the same Round: the woken runs continued it rather than opening another",
		closed.roundIds.length >= 3 && new Set(closed.roundIds).size === 1 && !closed.roundIds.includes("<none>"),
		`turns: ${JSON.stringify(closed.roundIds)}`,
	);

	// S3: the boundary the Round ended at is where the session's own consumption was saved, for the
	// requests the probe itself counted (one Turn is one model request).
	const document = await savedDocument(dock.home.consumptionFile, candidate => recordOf(candidate, parentId) !== undefined);
	const parentRecord = recordOf(document, parentId);
	observe(
		"the closed Round saved the parent's own requests as its own tokens",
		ownTokens(parentRecord) === closed.roundIds.length * CAPTURE_USAGE.input,
		`record: ${JSON.stringify(parentRecord)}, turns: ${closed.roundIds.length}, usage: ${CAPTURE_USAGE.input}`,
	);
	// The provider kept its own records of both finished runs — the replay entries that let a later
	// session re-deliver them — and reported nothing held while they stood, so the Round above closed
	// with a terminal history present rather than because it had been forgotten.
	const kept = existsSync(replaysDir(dock.run.root.path)) ? readdirSync(replaysDir(dock.run.root.path)) : [];
	observe(
		"the provider's own records of the finished runs stood while the Round closed",
		kept.filter(file => file.endsWith(".json")).length === 2,
		`kept replay records: ${JSON.stringify(kept)}`,
	);

	// The delegated runs are sessions of their own, and the parent their own files state is this one.
	const children = sessionFiles(dock.run.root.sessionDir)
		.filter(file => file !== parentFile)
		.map(file => ({ file, header: sessionHeader(file) }))
		.filter(entry => entry.header?.parentSession !== undefined);
	observe(
		"the delegations ran as sessions of their own, each stating this parent as its direct parent",
		children.length === 2 && children.every(entry => path.resolve(entry.header?.parentSession ?? "") === path.resolve(parentFile)),
		`children: ${JSON.stringify(children.map(entry => entry.header))}`,
	);
	// What each delegated session saved for itself is that session's own claim, made in its own
	// process and named by ticket 05's record; this run only notes what it saw, because whether that
	// process outlives its own asynchronous save is its host's timing rather than this mapping's.
	const childRecords = children.map(entry => recordOf(readDocument(dock.home.consumptionFile), entry.header?.id ?? "<none>"));
	console.log(`  note  delegated sessions' own records: ${JSON.stringify(childRecords.map(record => record?.id ?? null))}`);

	// An ordinary later Round in the same session, with the provider loaded and holding nothing, still
	// ends by itself: the waiting Round above is the delegation's doing, not a session that stopped
	// closing.
	await session.run(LATER_PROMPT, 120_000);
	await waitFor(
		() => edgesOf(roundLines(session), parentId).rounds.filter(kind => kind === "round_end").length === 2,
		"the later prompt's Round to end",
	).catch(error => {
		reportDiagnostics("waiting for the later prompt's Round to end", dock, session, parentId);
		throw error;
	});
	const afterLater = edgesOf(roundLines(session), parentId);
	observe(
		"a later prompt's Round opens and closes normally with the provider loaded",
		afterLater.rounds.join(",") === "round_start,round_end,round_start,round_end",
		`edges: ${JSON.stringify(afterLater.rounds)}`,
	);
	// What that later Round registered: one non-blocking wait on a delegation that had already
	// finished and reported. The subscription is the provider's own record of pending interest, not
	// work the session waits on, and the Round above closed while it stood.
	const waitResult = toolResultAfter(parentFile, WAIT_TOOL);
	observe(
		"a non-blocking wait on a finished delegation is registered, and the Round still ended",
		waitResult !== undefined,
		`wait tool result: ${JSON.stringify(waitResult)}`,
	);
	console.log(`  note  the wait subscription the run registered: ${JSON.stringify(waitResult?.slice(0, 200))}`);
	const finalDocument = await savedDocument(
		dock.home.consumptionFile,
		candidate => ownTokens(recordOf(candidate, parentId)) === afterLater.roundIds.length * CAPTURE_USAGE.input,
	);
	observe(
		"the later Round's boundary saved the added requests as well",
		ownTokens(recordOf(finalDocument, parentId)) === afterLater.roundIds.length * CAPTURE_USAGE.input,
		`record: ${JSON.stringify(recordOf(finalDocument, parentId))}, turns: ${afterLater.roundIds.length}`,
	);
}

/** The whole run, and the record of what it observed. */
async function main(): Promise<void> {
	const keep = process.argv.includes("--keep");
	const explicit = process.argv.includes("--pi") ? process.argv[process.argv.indexOf("--pi") + 1] : undefined;
	const cli = resolvePiCli(explicit);
	const version = await piVersion(cli);
	console.log(`pi ${version} (${cli.path})`);
	observe("the harness under test is the fixed version this script states", version === EXPECTED_PI_VERSION, `reported ${version}`);
	observe("the pinned provider artifact this repository installs is present", existsSync(PROVIDER_ENTRY), PROVIDER_ENTRY);

	try {
		await phaseWaitingRound(cli);
	} finally {
		for (const session of sessions) await session.stop({ timeoutMs: 20_000 });
		for (const dock of runs) {
			dock.run.capture.stop();
			if (!keep) {
				dock.run.root.dispose();
				rmSync(dock.configRoot, { recursive: true, force: true });
			}
		}
	}
	console.log(`\n${observations.length} observations held.`);
	for (const observation of observations) console.log(`  - ${observation.name}`);
}

await main();
