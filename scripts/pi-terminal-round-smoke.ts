/**
 * Ticket 10's real-host record: what one pi session's public Round does when its activity is
 * interrupted while a background delegation is still live, what a result arriving afterwards does to
 * it, and what a second process reads back from the same storage root.
 *
 * Usage
 *   bun scripts/pi-terminal-round-smoke.ts                 # resolve the installed pi CLI
 *   bun scripts/pi-terminal-round-smoke.ts --pi <path>     # or PI_CLI=<path>
 *   bun scripts/pi-terminal-round-smoke.ts --keep          # keep every run root for inspection
 *
 * What it drives: the real installed pi as a child process in RPC mode, with an isolated agent state,
 * session directory, working directory and user home under the OS temp root, and a local
 * OpenAI-compatible capture endpoint declared as the provider. Loaded into that session are the
 * production pi assembly (through an entrypoint of this run's own layout, so the storage root is the
 * run's), the pinned `pi-subagents` artifact this repository installs, and a fixture that records the
 * public Round and Turn edges one binding dispatches. Nothing of any of them is restated here.
 *
 * What it asserts (consumer-visible behavior only; no source or wiring inspection):
 *   1. **An interrupted run's Round ends where pi reports it settled**, even though the provider's own
 *      async artifacts still say the delegation the session was waiting on is live — the statement
 *      that holds an ordinary answer's Round open is not what keeps a cancelled one open.
 *   2. **That boundary is where the session's own requests are saved** (S3): the document holds the
 *      requests that really completed, once, under this session's identity.
 *   3. **The ended Round is never reopened.** The result that arrives afterwards opens no Round of its
 *      own, and the wake that really runs opens a new one with a Round identity of its own.
 *   4. **A second process resuming the same session reads the saved accumulation** and fabricates no
 *      boundary: its first edge is a Round opening, and what it adds accumulates on the saved record.
 *
 * What it cannot assert here (recorded, not silently skipped): this host is driven through pi's RPC
 * mode, which has no native UI, so the provider's UI-conditioned behaviour of holding a wake back for
 * an interrupted session is not what this run produces; the mapping this ticket owns — that a
 * cancelled or failed activity's own settlement ends the Round — is what the assertions above and the
 * S1/S2/S3 partitions cover. A real interactive terminal is a separate human acceptance path.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { CapturedRequest } from "../tests/harness-dock/capture-server";
import { PI_MODEL_COST_CONFIG_ROOT_ENV } from "../tests/harness-dock/fixtures/pi-model-cost/env";
import {
	PI_TERMINAL_ROUNDS_CHILD_ENTRY_ENV,
	PI_TERMINAL_ROUNDS_PREFIX,
} from "../tests/harness-dock/fixtures/pi-terminal-rounds/prefix";
import { type PiCli, type PiRun, PiSession, piVersion, resolvePiCli, startPiRun } from "../tests/harness-dock/pi-session";
import { customMessages } from "../tests/harness-dock/session-log";

/** The repository root: this script lives in `scripts/`. */
const REPO_ROOT = path.resolve(import.meta.dir, "..");

/** The pinned provider's own extension entry, as the artifact in this repository installs it. */
const PROVIDER_ENTRY = path.join(REPO_ROOT, "node_modules", "pi-subagents", "index.js");

/** The dock fixture that records the public Round and Turn edges one real binding dispatches. */
const ROUND_PROBE = path.join(REPO_ROOT, "tests", "harness-dock", "fixtures", "pi-terminal-rounds", "entrypoint.ts");

/** The version this smoke's expectations were written against. */
const EXPECTED_PI_VERSION = "1.2.0";

/** The provider and model the run declares. */
const PROVIDER = "deepseek";
const MODEL = "deepseek-flash";

/** The document the extension keeps in its storage root. */
const CONSUMPTION_FILE = "consumption.json";

/** The usage the capture endpoint reports for every completion, so a saved amount is non-zero. */
const CAPTURE_USAGE = { input: 1_000, output: 200, cacheRead: 0, cacheWrite: 0 } as const;

/** The one delegation's own task text: this run's, so a captured child request is provably its own. */
const TASK_ONE = "terminal-round-smoke: list the repository's top-level directories";

/** How long a delegated child's own answer is withheld, so the delegation is provably still live. */
const CHILD_HOLD_MS = 30_000;

/** How long the interrupted run's own answer is withheld, so the abort lands while the run is in flight. */
const INTERRUPT_HOLD_MS = 90_000;

/** The text a parent request is answered with when it delegates nothing. */
const PARENT_REPLY = "terminal-round-smoke parent reply";

/** The text a delegated child's own request is answered with. */
const CHILD_REPLY = "terminal-round-smoke child reply";

/** The one prompt whose run launches the delegation and is then interrupted. */
const PROMPT = "terminal-round-smoke: delegate one scouting task in the background, then summarize what you know.";

/** The later prompt whose Round is an ordinary one, with the provider loaded and holding nothing. */
const LATER_PROMPT = "terminal-round-smoke: one more exchange in this session.";

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
 * reads the shipped configuration and never writes outside its own home. The same entry is the one the
 * assembly requires in the sessions a provider spawns, which is why the round probe is handed it.
 */
function configRootFor(home: IsolatedHome, label: string): { readonly root: string; readonly childEntry: string } {
	const root = mkdtempSync(path.join(tmpdir(), `pi-terminal-round-${label}-`));
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

/** The parent requests among the ones the endpoint captured, in arrival order. */
function parentRequests(requests: readonly CapturedRequest[]): readonly CapturedRequest[] {
	return requests.filter(carriesDelegationTool);
}

/** One scripted delegation call, as the model would emit it, for one task. */
function delegationCall(task: string): { readonly name: string; readonly arguments: string } {
	return { name: "subagent", arguments: JSON.stringify({ agent: "scout", task, async: true }) };
}

/**
 * One fresh run root with a capture endpoint behind it, scripting one background delegation and the
 * interruption of the run that launched it.
 *
 * The parent's first request delegates; its second is *held* so the run is provably in flight when the
 * driver aborts it; every request after that is answered plainly, which is what lets the wake and the
 * later prompt run as ordinary activity.
 */
function startDockRun(cli: PiCli, label: string): DockRun {
	let parentSteps = 0;
	const run = startPiRun(cli, label, {
		provider: PROVIDER,
		model: MODEL,
		cost: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 },
		endpoint: {
			usage: CAPTURE_USAGE,
			replyText: PARENT_REPLY,
			balance: { total: "12.34" },
			respond: request => {
				if (!carriesDelegationTool(request)) return { replyText: CHILD_REPLY, answerDelayMs: CHILD_HOLD_MS };
				parentSteps++;
				if (parentSteps === 1) return { toolCall: delegationCall(TASK_ONE) };
				if (parentSteps === 2) return { replyText: PARENT_REPLY, answerDelayMs: INTERRUPT_HOLD_MS };
				return { replyText: PARENT_REPLY };
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
async function openSession(dock: DockRun, extraArgs: readonly string[] = []): Promise<PiSession> {
	const session = await PiSession.start({
		cli: dock.run.cli,
		runRoot: dock.run.root,
		entrypoint: [path.join(dock.configRoot, "entrypoints", "pi", "model-cost.ts"), PROVIDER_ENTRY, ROUND_PROBE],
		selector: dock.run.selector,
		extraArgs,
		env: {
			...dock.home.env,
			[PI_MODEL_COST_CONFIG_ROOT_ENV]: dock.configRoot,
			[PI_TERMINAL_ROUNDS_CHILD_ENTRY_ENV]: dock.childEntry,
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
		.filter(line => line.startsWith(`${PI_TERMINAL_ROUNDS_PREFIX} `))
		.map(line => line.slice(PI_TERMINAL_ROUNDS_PREFIX.length + 1));
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
	/** The Round identity each Turn was reported to belong to, in dispatch order. */
	readonly roundIds: readonly string[];
	/** How many Turns reported a usage. */
	readonly accountedTurns: number;
}

/** The edges of one exact session, in dispatch order: another session's lines are not its own. */
function edgesOf(lines: readonly string[], sessionId: string): SessionEdges {
	const mine = lines.map(line => ({ line, ...lineOf(line) })).filter(entry => entry.sessionId === sessionId);
	return {
		rounds: mine
			.filter(entry => entry.kind === "round_start" || entry.kind === "round_end")
			.map(entry => entry.kind),
		roundIds: mine.filter(entry => entry.kind === "turn_start").map(entry => fieldOf(entry.line, "round") ?? "<none>"),
		accountedTurns: mine.filter(entry => entry.kind === "turn_end" && fieldOf(entry.line, "usage") === "reported").length,
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
async function waitFor(accept: () => boolean, label: string, timeoutMs = 120_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		if (accept()) return;
		if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
		await Bun.sleep(100);
	}
}

/**
 * What one run had reported when a case gave up on it: the public edges the probe dispatched, this
 * entry's own diagnostics, the provider's own async states, and the tail of the frame stream.
 */
function reportDiagnostics(label: string, dock: DockRun, session: PiSession, parentId: string): void {
	const lines = roundLines(session);
	const own = session.stderr().split("\n").filter(line => line.includes("modelCost:"));
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
	readonly saveVersion?: number;
	readonly own?: Record<string, Record<string, { readonly tokens?: Record<string, number> }>>;
}

/** One consumption document, as far as this script reads it. */
interface ConsumptionDocument {
	readonly harnesses?: Record<string, { readonly sessions?: readonly SessionRecord[] } | undefined>;
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
	return document?.harnesses?.pi?.sessions?.find(record => record.id === sessionId);
}

/**
 * Waits until the document holds what `accept` states, and answers it.
 *
 * The wait is on the fact itself — a save is published by a Round's own end, a little after the
 * delivery that drove it — and the deadline only keeps a save that never happened from hanging the
 * run. Nothing here reads the implementation: the file the extension really published is read.
 */
async function savedDocument(
	file: string,
	accept: (document: ConsumptionDocument) => boolean,
	timeoutMs = 60_000,
): Promise<ConsumptionDocument> {
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

// ---------------------------------------------------------------------------
// The phases
// ---------------------------------------------------------------------------

/** Everything the first two phases hand the third: the run, the session file and its identity. */
interface InterruptedFacts {
	readonly dock: DockRun;
	readonly parentFile: string;
	readonly parentId: string;
}

/** The interrupted Round, the delegation it was waiting on, and what followed each. */
async function phaseInterruptedRound(cli: PiCli): Promise<InterruptedFacts> {
	console.log("\nphase: an interrupted run whose own delegation is still live");
	const dock = startDockRun(cli, "interrupted");
	const session = await openSession(dock);

	const mark = session.frameMark();
	// The prompt's run launches the delegation; its second request — the one the interruption lands in
	// — is held by the endpoint, so this script acts while the harness is provably busy.
	await session.request({ type: "prompt", message: PROMPT }, 60_000);
	await waitFor(
		() => parentRequests(dock.run.capture.requests()).length >= 2 && liveStatuses(dock.run.root.path).length === 1,
		"the delegation to be live and the interrupted run's request to have arrived",
		60_000,
	);
	const launched = asyncStatuses(dock.run.root.path);
	observe(
		"the delegation really launched, and the provider's own artifacts say it is still running",
		launched.length === 1 && liveStatuses(dock.run.root.path).length === 1,
		`statuses: ${JSON.stringify(launched.map(status => status.state))}, parent requests: ${parentRequests(dock.run.capture.requests()).length}`,
	);

	const parentFile = await session.sessionFile();
	await waitFor(() => sessionHeader(parentFile)?.id !== undefined, "the session's own header", 20_000);
	const parentId = sessionHeader(parentFile)?.id ?? "";
	if (parentId.length === 0) throw new Error(`the run's own session file states no identity: ${parentFile}`);

	// The interruption, through pi's own RPC command: pi's abort of a run in flight.
	const abortMark = session.frameMark();
	await session.request({ type: "abort" }, 30_000);
	const settled = await session.frameSince(
		abortMark,
		frame => frame.type === "agent_settled",
		"the interrupted run's own settlement",
		30_000,
	);
	observe(
		"pi's own final settlement reports the run as aborted",
		settled?.aborted === true,
		`settled frame: ${JSON.stringify(settled)}`,
	);

	await waitFor(
		() => edgesOf(roundLines(session), parentId).rounds.includes("round_end"),
		"the interrupted Round to end",
		30_000,
	).catch(error => {
		reportDiagnostics("waiting for the interrupted Round to end", dock, session, parentId);
		throw error;
	});
	// The statement an ordinary answer waits on is still "work is live" at this instant: the round the
	// provider would have kept open ended where the interrupted activity settled.
	const liveAtEnd = liveStatuses(dock.run.root.path).length;
	const interrupted = edgesOf(roundLines(session), parentId);
	observe(
		"the interrupted Round ends although the delegation it was waiting on is still live",
		liveAtEnd === 1 && interrupted.rounds.join(",") === "round_start,round_end",
		`edges: ${JSON.stringify(interrupted.rounds)}, live async runs at the end: ${liveAtEnd}`,
	);

	// S3: the boundary the Round ended at is where the session's own consumption was saved, for the
	// requests that really completed (one Turn with a reported usage is one accounted request).
	const document = await savedDocument(dock.home.consumptionFile, candidate => recordOf(candidate, parentId) !== undefined);
	observe(
		"the interrupted Round's boundary saved the parent's completed requests",
		ownTokens(recordOf(document, parentId)) === interrupted.accountedTurns * CAPTURE_USAGE.input,
		`record: ${JSON.stringify(recordOf(document, parentId))}, accounted turns: ${interrupted.accountedTurns}`,
	);
	observe(
		"the interrupted request's own turn is not accounted: it reported no usage",
		interrupted.roundIds.length === interrupted.accountedTurns + 1,
		`turns: ${JSON.stringify(interrupted.roundIds)}, accounted: ${interrupted.accountedTurns}`,
	);
	return { dock, parentFile, parentId };
}

/**
 * The result arriving after that Round, and the execution the user's own next prompt really starts.
 *
 * This host publishes a UI channel, so the provider's own UI-conditioned behaviour applies to the
 * delegation it was holding for the interrupted session: the result is appended and the wake it
 * carries does not start an execution of its own. That is exactly what the case is about — an append
 * opens no Round, and only a real execution does.
 */
async function phaseLateArrival(facts: InterruptedFacts): Promise<void> {
	const { dock, parentFile, parentId } = facts;
	const session = dock.sessions[0];
	console.log("\nphase: the delegation's result after the interruption, and the next real execution");

	const afterInterruption = edgesOf(roundLines(session), parentId);
	const savedBytes = readFileSync(dock.home.consumptionFile, "utf8");

	// The delegation reaches its own terminal state, and the provider appends its result to the
	// session: the session's own journal is where that arrival is written down.
	await waitFor(() => liveStatuses(dock.run.root.path).length === 0, "the delegation to reach terminal", 90_000);
	await waitFor(
		() => customMessages(session.journal(parentFile).entries, "subagent-notify").length > 0,
		"the delegation's result to be appended to the session",
		60_000,
	).catch(error => {
		reportDiagnostics("waiting for the result to be appended", dock, session, parentId);
		throw error;
	});
	// The window this observation is taken over: the append has happened, and what is asserted is that
	// nothing of it became an execution or a boundary.
	await Bun.sleep(3_000);
	const afterAppend = edgesOf(roundLines(session), parentId);
	observe(
		"the result appended after the interrupted Round opened no Round and ran nothing",
		afterAppend.rounds.join(",") === afterInterruption.rounds.join(",") &&
			afterAppend.roundIds.length === afterInterruption.roundIds.length,
		`edges: ${JSON.stringify(afterAppend.rounds)}, turns: ${afterAppend.roundIds.length}, appended results: ${customMessages(session.journal(parentFile).entries, "subagent-notify").length}`,
	);
	observe(
		"the append left the session's saved consumption exactly as it was",
		readFileSync(dock.home.consumptionFile, "utf8") === savedBytes,
		`record: ${JSON.stringify(recordOf(readDocument(dock.home.consumptionFile), parentId))}`,
	);

	// The user's own next prompt really starts execution: that is the fact that opens a Round, and it
	// opens one of its own rather than reopening the Round the interruption ended.
	const beforeLater = ownTokens(recordOf(readDocument(dock.home.consumptionFile), parentId)) ?? 0;
	await session.run(LATER_PROMPT, 120_000);
	await waitFor(
		() => edgesOf(roundLines(session), parentId).rounds.length >= afterInterruption.rounds.length + 2,
		"the later prompt's Round to close",
		60_000,
	).catch(error => {
		reportDiagnostics("waiting for the later prompt's Round to close", dock, session, parentId);
		throw error;
	});
	const afterLater = edgesOf(roundLines(session), parentId);
	observe(
		"a later prompt's Round opens and closes normally after the ended one",
		afterLater.rounds.slice(-2).join(",") === "round_start,round_end",
		`edges: ${JSON.stringify(afterLater.rounds)}`,
	);
	const laterRoundIds = afterLater.roundIds.slice(afterInterruption.roundIds.length);
	observe(
		"the new Round's Turns carry a Round identity of their own, and the ended Round stays ended",
		laterRoundIds.length > 0 &&
			laterRoundIds.every(id => id !== "<none>" && !afterInterruption.roundIds.includes(id)) &&
			new Set(laterRoundIds).size === 1,
		`interrupted rounds: ${JSON.stringify([...new Set(afterInterruption.roundIds)])}, later rounds: ${JSON.stringify([...new Set(laterRoundIds)])}`,
	);
	const finalDocument = await savedDocument(
		dock.home.consumptionFile,
		candidate => (ownTokens(recordOf(candidate, parentId)) ?? 0) > beforeLater,
	);
	observe(
		"the later Round's boundary added its own request to the saved record",
		(ownTokens(recordOf(finalDocument, parentId)) ?? 0) > beforeLater,
		`record: ${JSON.stringify(recordOf(finalDocument, parentId))}, before: ${beforeLater}`,
	);
}

/** The same session resumed by a second process, and what it reads and adds. */
async function phaseRestore(facts: InterruptedFacts): Promise<void> {
	const { dock, parentFile, parentId } = facts;
	console.log("\nphase: a second process resumes the same session over the same storage root");
	const savedBytes = readFileSync(dock.home.consumptionFile, "utf8");
	const savedOwn = ownTokens(recordOf(readDocument(dock.home.consumptionFile), parentId)) ?? 0;

	const resumed = await openSession(dock, ["--session", parentFile]);
	const resumedFile = await resumed.sessionFile();
	observe(
		"the second process runs the very session the first one left",
		path.resolve(resumedFile) === path.resolve(parentFile),
		`resumed ${resumedFile}, expected ${parentFile}`,
	);
	observe(
		"the process that has observed no activity yet has fabricated no Round boundary",
		edgesOf(roundLines(resumed), parentId).rounds.length === 0,
		`edges before any prompt: ${JSON.stringify(edgesOf(roundLines(resumed), parentId).rounds)}`,
	);
	observe(
		"the document the first process left is exactly what this one reads",
		readFileSync(dock.home.consumptionFile, "utf8") === savedBytes,
		`saved own tokens: ${savedOwn}`,
	);

	// A real execution in the resumed session: it opens a Round of its own and adds to the record the
	// earlier process saved, which is what a restored Session accumulation is.
	await resumed.run(LATER_PROMPT, 120_000);
	await waitFor(
		() => edgesOf(roundLines(resumed), parentId).rounds.includes("round_end"),
		"the resumed session's Round to close",
		60_000,
	).catch(error => {
		reportDiagnostics("waiting for the resumed session's Round to close", dock, resumed, parentId);
		throw error;
	});
	const edges = edgesOf(roundLines(resumed), parentId);
	observe(
		"the resumed session's own activity opens and closes a Round of its own",
		edges.rounds[0] === "round_start" && edges.rounds.includes("round_end"),
		`edges: ${JSON.stringify(edges.rounds)}`,
	);
	const restoredDocument = await savedDocument(
		dock.home.consumptionFile,
		candidate => (ownTokens(recordOf(candidate, parentId)) ?? 0) > savedOwn,
	);
	observe(
		"what the resumed session adds accumulates on the record it read back",
		(ownTokens(recordOf(restoredDocument, parentId)) ?? 0) > savedOwn,
		`record: ${JSON.stringify(recordOf(restoredDocument, parentId))}, saved before: ${savedOwn}`,
	);

	// The delegated session the first process spawned is still a session of its own in the tree this
	// document holds: the restore adds to the session's own record, and to no other.
	const otherRecords = (readDocument(dock.home.consumptionFile)?.harnesses?.pi?.sessions ?? []).filter(
		record => record.id !== parentId,
	);
	console.log(`  note  other sessions' records: ${JSON.stringify(otherRecords.map(record => record.id))}`);
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
		const facts = await phaseInterruptedRound(cli);
		await phaseLateArrival(facts);
		await phaseRestore(facts);
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
