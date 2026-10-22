/**
 * Ticket 05's real-host record: model-cost on a real pi session, with the pinned subagent provider
 * either absent, refusing this extension's child entry, or actually loading it into a child session.
 *
 * Usage
 *   bun scripts/pi-subagent-smoke.ts                    # resolve the installed pi CLI
 *   bun scripts/pi-subagent-smoke.ts --pi <path>        # or PI_CLI=<path>
 *   bun scripts/pi-subagent-smoke.ts --keep             # keep every run root for inspection
 *   bun scripts/pi-subagent-smoke.ts --foreground-only  # multi-extension child-loading regression
 *   bun scripts/pi-subagent-smoke.ts --background-only  # detached child observation
 *   bun scripts/pi-subagent-smoke.ts --expect-pi-version 1.3.0 # explicit candidate host observation
 *
 * What it drives: the real installed pi as a child process in RPC mode, with an isolated agent state,
 * session directory, working directory and user home under the OS temp root, and a local
 * OpenAI-compatible capture endpoint declared as the provider. The extension under test is the
 * production pi assembly, loaded by pi's own loader from a discovery entrypoint of this run's own
 * layout — so the entry a spawned session is loaded from is one this run states, exactly as a
 * deployment states it. The provider beside it is the pinned `pi-subagents` artifact this repository
 * installs. Nothing of either is restated here.
 *
 * What it asserts (consumer-visible behavior only; no source or wiring inspection):
 *   1. **A harness with no subagent provider is the normal no-subagent shape.** The session's own
 *      consumption is accounted and saved, no child session is created, and nothing is diagnosed as a
 *      failed integration — the failing shape is the one a *refusal* produces (2);
 *   2. **A child entry the provider refuses is diagnosed as a registration failure**, and the main
 *      session keeps working: its own consumption is still accounted and saved;
 *   3. **A real delegation loads this extension into the child session it spawns.** The provider's own
 *      launch evidence names this entry among the launch's required and effective extensions, and the
 *      child's own session file states the identity and the parent session file this adapter reads;
 *   4. **A spawned session's agent definition reaches framework consumers.** The child's own delivery
 *      and the owner process's observation source both name the `scout` definition the provider
 *      launched, and both the foreground and background detail widgets draw that definition as the
 *      child row's type prefix;
 *   5. **A real rename reaches consumers where it happened, and the next commit carries it** — the
 *      public facts delivery, the name the session then has, and the record the session's next save
 *      publishes.
 *
 * What it cannot assert here (recorded, not silently skipped): nested delegation, resume,
 * cancellation, fork inheritance and process replacement are not driven by this script, and a
 * foreground delegation does not reach this script's later checks — see the evidence record for the
 * stale-context fault this run reproduces, which is the reason.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { MODEL_COST_WIDGET_KEY } from "../extensions/model-cost/harnesses/pi/widget";
import type { CapturedRequest } from "../tests/harness-dock/capture-server";
import { PI_MODEL_COST_CONFIG_ROOT_ENV } from "../tests/harness-dock/fixtures/pi-model-cost/env";
import { PI_SESSION_FACTS_PREFIX } from "../tests/harness-dock/fixtures/pi-session-facts/prefix";
import { PI_SUBAGENT_OBSERVATION_PREFIX } from "../tests/harness-dock/fixtures/pi-subagent-observation/prefix";
import { type PiCli, type PiRun, PiSession, piVersion, resolvePiCli, startPiRun } from "../tests/harness-dock/pi-session";

/** The repository root: this script lives in `scripts/`. */
const REPO_ROOT = path.resolve(import.meta.dir, "..");

/** The extension's pi assembly, as a controlled run binds it to its own configuration root. */
const CONFIG_ENTRYPOINT = path.join(
	REPO_ROOT,
	"tests",
	"harness-dock",
	"fixtures",
	"pi-model-cost",
	"entrypoint.ts",
);

/** The pinned provider's own extension entry, as the artifact in this repository installs it. */
const PROVIDER_ENTRY = path.join(REPO_ROOT, "node_modules", "pi-subagents", "index.js");

/** The dock fixture that reports the public session facts one real binding dispatches. */
const FACTS_PROBE = path.join(REPO_ROOT, "tests", "harness-dock", "fixtures", "pi-session-facts", "entrypoint.ts");

/** The dock fixture that reports the per-session observations one real binding delivers. */
const OBSERVATION_PROBE = path.join(
	REPO_ROOT,
	"tests",
	"harness-dock",
	"fixtures",
	"pi-subagent-observation",
	"entrypoint.ts",
);

/**
 * The observation probe's entry in one run's own layout, written the way a deployment writes one.
 *
 * Observations cross between processes for one extension — the seat is the pair of an extension id
 * and an owner — so the probe is loaded both in the owner session and in the sessions that session
 * spawns; the entry names itself as the file a spawned session loads, exactly as the extension
 * under test does.
 */
function writeObservationProbeEntry(configRoot: string): string {
	const directory = path.join(configRoot, "entrypoints", "pi");
	mkdirSync(directory, { recursive: true });
	const file = path.join(directory, "pi-subagent-observation.ts");
	const relative = path.relative(directory, OBSERVATION_PROBE).replace(/\\/g, "/");
	const specifier = path.isAbsolute(relative) || relative.startsWith(".") ? relative : `./${relative}`;
	writeFileSync(
		file,
		`import { piSubagentObservationProbe } from ${JSON.stringify(specifier)};\n\nexport default piSubagentObservationProbe(${JSON.stringify(file)});\n`,
		"utf8",
	);
	return file;
}

/** The version this smoke's expectations were written against. */
const EXPECTED_PI_VERSION = "1.2.0";

/** The provider and model the runs declare. */
const PROVIDER = "deepseek";
const MODEL = "deepseek-flash";

/** The document the extension keeps in its storage root. */
const CONSUMPTION_FILE = "consumption.json";

/** The usage the capture endpoint reports for every completion, so a saved amount is non-zero. */
const CAPTURE_USAGE = { input: 1_000, output: 200, cacheRead: 0, cacheWrite: 0 } as const;

/**
 * How long every scripted answer of the background phase is held before it is sent.
 *
 * It is what makes the phase's ordering claim a fact rather than a race: a session waiting on an
 * unanswered request has no Round it can end and nothing it can save, so a run whose own process
 * observed that session is observed *before* anything of it was persisted anywhere.
 */
const HELD_FIRST_REQUEST_MS = 4000;

/** The text a request is answered with when the case scripts no tool call for it. */
const REPLY_TEXT = "subagent-smoke-reply";

/** The one text of the run's prompt. */
const PROMPT = "Report one line about the repository root.";

/** The two exchanges the main-session phases make: a Round's own save lands once a later run confirms it. */
const FIRST_PROMPT = "Reply with one word.";
const SECOND_PROMPT = "Reply with another word.";

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
 * The extension entry a spawned session is loaded from, written into this run's own layout.
 *
 * The assembly requires the entry its repository states — `entrypoints/pi/model-cost.ts` — so a run
 * that keeps its storage root its own states that path inside a layout of its own, and the file it
 * writes binds the production assembly to this run's configuration root exactly as a deployment's
 * own entrypoint binds it. A case that observes a *refused* entry states the same layout and leaves
 * the file out.
 */
function writeChildEntry(root: string, options: { readonly present: boolean }): string {
	const directory = path.join(root, "entrypoints", "pi");
	mkdirSync(directory, { recursive: true });
	const file = path.join(directory, "model-cost.ts");
	if (!options.present) return file;
	const harness = path.join(REPO_ROOT, "extensions", "model-cost", "harnesses", "pi.ts");
	const relative = path.relative(directory, harness).replace(/\\/g, "/");
	const specifier = path.isAbsolute(relative) || relative.startsWith(".") ? relative : `./${relative}`;
	writeFileSync(
		file,
		`import { modelCostPiHarness } from ${JSON.stringify(specifier)};\n\nexport default modelCostPiHarness(${JSON.stringify(root)});\n`,
		"utf8",
	);

	return file;
}

/**
 * The configuration root one run binds the production assembly to.
 *
 * It is a throwaway repository layout carrying only `extensions/model-cost/config.yaml`, so the run
 * never reads the shipped configuration and never writes outside its own home.
 */
function configRootFor(home: IsolatedHome, label: string, options: { readonly childEntry: boolean }): string {
	const root = mkdtempSync(path.join(tmpdir(), `pi-subagent-config-${label}-`));
	const directory = path.join(root, "extensions", "model-cost");
	mkdirSync(directory, { recursive: true });
	writeFileSync(
		path.join(directory, "config.yaml"),
		`storageDir: ${JSON.stringify(home.storageDirectory)}\nbalanceTtlMs: 30000\ncodexQuotaTtlMs: 15000\n`,
		"utf8",
	);
	writeChildEntry(root, { present: options.childEntry });
	return root;
}

/** One fresh run root with a capture endpoint behind it and its own models file pointing at it. */
function startDockRun(
	cli: PiCli,
	label: string,
	options: {
		readonly childEntry?: boolean;
		readonly respond?: (request: CapturedRequest) => { readonly toolCall?: { readonly name: string; readonly arguments: string }; readonly replyText?: string } | undefined;
	} = {},
): DockRun {
	const run = startPiRun(cli, label, {
		provider: PROVIDER,
		model: MODEL,
		cost: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 },
		endpoint: {
			usage: CAPTURE_USAGE,
			replyText: REPLY_TEXT,
			balance: { total: "12.34" },
			...(options.respond === undefined ? {} : { respond: options.respond }),
		},
	});
	const home = isolateHome(run.root.path);
	const configRoot = configRootFor(home, label, { childEntry: options.childEntry ?? true });
	const dock: DockRun = {
		run,
		home,
		configRoot,
		childEntry: path.join(configRoot, "entrypoints", "pi", "model-cost.ts"),
		sessions: [],
	};
	runs.push(dock);
	return dock;
}

/** One session over one run's isolated state, loading exactly the extensions the case names. */
async function openSession(dock: DockRun, extensions: readonly string[]): Promise<PiSession> {
	const session = await PiSession.start({
		cli: dock.run.cli,
		runRoot: dock.run.root,
		entrypoint: extensions,
		selector: dock.run.selector,
		env: { ...dock.home.env, [PI_MODEL_COST_CONFIG_ROOT_ENV]: dock.configRoot },
	});
	dock.sessions.push(session);
	sessions.push(session);
	return session;
}

// ---------------------------------------------------------------------------
// Reading what the run really wrote
// ---------------------------------------------------------------------------

/** One session record of the consumption document, as far as this script reads it. */
interface SessionRecord {
	readonly id: string;
	readonly name?: string;
	readonly parent?: string | null;
	readonly startup?: {
		readonly model?: { readonly provider?: string; readonly model?: string };
		readonly effort?: string;
	};
	readonly own?: Record<string, Record<string, { readonly tokens?: Record<string, number> }>>;
}

/** One consumption document, as far as this script reads it. */
interface ConsumptionDocument {
	readonly schemaVersion?: number;
	readonly periodId?: string;
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
async function savedDocument(
	file: string,
	accept: (document: ConsumptionDocument) => boolean,
	timeoutMs = 45_000,
): Promise<ConsumptionDocument> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const document = readDocument(file);
		if (document !== undefined && accept(document)) return document;
		if (Date.now() > deadline) {
			throw new Error(`no consumption document this case expects was published at ${file}`);
		}
		await Bun.sleep(50);
	}
}

/** One session file's own first line, as far as this script reads it. */
interface SessionAnchorHeader {
	readonly type?: string;
	readonly id?: string;
	readonly parentSession?: string;
}

/** One session file's own first line, as pi writes the header this adapter reads. */
function sessionHeader(file: string): SessionAnchorHeader | undefined {
	try {
		const [firstLine] = readFileSync(file, "utf8").split("\n", 1);
		return JSON.parse(firstLine ?? "") as SessionAnchorHeader;
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

/** One launch's own metadata file, as the provider writes it beside a run's artifacts. */
interface LaunchMetadata {
	readonly runId?: string;
	readonly agent?: string;
	readonly parentSessionId?: string;
	readonly exitCode?: number;
	readonly model?: string;
	readonly launchResolvedExtensions?: {
		readonly required?: readonly string[];
		readonly effective?: readonly string[];
	};
}

/** Every launch metadata file the provider wrote under one directory, in path order. */
function launchMetadata(directory: string): Array<{ readonly file: string; readonly metadata: LaunchMetadata }> {
	if (!existsSync(directory)) return [];
	return readdirSync(directory, { recursive: true })
		.map(entry => path.join(directory, String(entry)))
		.filter(file => /_meta\.json$/.test(file))
		.sort()
		.map(file => ({ file, metadata: JSON.parse(readFileSync(file, "utf8")) as LaunchMetadata }));
}

/** One evidence line the session-facts probe wrote, without its prefix. */
function factsLines(session: PiSession): string[] {
	return session
		.stderr()
		.split("\n")
		.filter(line => line.startsWith(`${PI_SESSION_FACTS_PREFIX} `))
		.map(line => line.slice(PI_SESSION_FACTS_PREFIX.length + 1));
}

/** The value one fact of a probe line states, or `undefined` when the line states none of it. */
function factOf(line: string | undefined, name: string): string | undefined {
	if (line === undefined) return undefined;
	const match = new RegExp(`(?:^| )${name}=([^ ]*)`).exec(line);
	return match?.[1];
}

/** Every observation line one run's owner process published, in the order they were written. */
function observationLines(session: PiSession): string[] {
	return session
		.stderr()
		.split("\n")
		.filter(line => line.startsWith(`${PI_SUBAGENT_OBSERVATION_PREFIX} `))
		.map(line => line.slice(PI_SUBAGENT_OBSERVATION_PREFIX.length + 1));
}

/**
 * The observation lines one run's owner process published for one actual session, waited for.
 *
 * A line is written where the delivery arrived, which is a moment after the session that delivered
 * it began: the wait is bounded and answers the empty list when the owner process never observed
 * that session at all.
 */
async function observationLinesFor(session: PiSession, sessionId: string, timeoutMs: number): Promise<string[]> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const found = observationLines(session).filter(line => factOf(line, "id") === sessionId);
		if (found.length > 0) return found;
		if (Date.now() > deadline) return [];
		await Bun.sleep(50);
	}
}

/** Whether one request carries the provider's own delegation tool. */
function carriesSubagentTool(request: CapturedRequest): boolean {
	const body = request.json as { tools?: Array<{ function?: { name?: string } }> } | null;
	return (body?.tools ?? []).some(tool => tool.function?.name === "subagent");
}

/** One scripted delegation call, as the model would emit it. */
function delegationCall(task: string, options: { readonly async?: boolean } = {}): { readonly name: string; readonly arguments: string } {
	return {
		name: "subagent",
		arguments: JSON.stringify({ agent: "scout", task, ...(options.async === undefined ? {} : { async: options.async }) }),
	};
}

/**
 * The answer one run's endpoint gives: one delegation, then text.
 *
 * A response script that delegated on *every* request carrying the provider's tool would delegate
 * again on the request that follows the first delegation's tool result, so the run would never
 * settle and no later observation of the same process would be reachable. The delegation a case
 * scripts is therefore the run's own first one, and every request after it is answered with text.
 */
function delegationOnce(options: { readonly async?: boolean } = {}): (request: CapturedRequest) => { readonly toolCall?: { readonly name: string; readonly arguments: string }; readonly replyText?: string } {
	let delegated = false;
	return request => {
		if (!carriesSubagentTool(request)) return { replyText: REPLY_TEXT };
		if (delegated) return { replyText: REPLY_TEXT };
		delegated = true;
		return { toolCall: delegationCall(PROMPT, options) };
	};
}

/** Whether a run's own stderr reports the stale-extension-context fault this host raises on replacement. */
function staleContextFault(session: PiSession): boolean {
	return session.stderr().includes("This extension ctx is stale after session replacement or reload");
}

/**
 * The child session pi wrote for one run, waited for.
 *
 * A background delegation runs in the provider's own detached process, which writes that session's
 * file when it begins — one process later than the parent's own run settled — so the file is waited
 * for rather than read out of a directory that is still being set up. The wait is bounded and answers
 * nothing when the run really produced no child.
 */
async function childSessionOf(
	dock: DockRun,
	parentFile: string,
	timeoutMs: number,
): Promise<{ readonly file: string; readonly header: SessionAnchorHeader | undefined } | undefined> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const found = sessionFiles(dock.run.root.sessionDir)
			.filter(file => file !== parentFile)
			.map(file => ({ file, header: sessionHeader(file) }))
			.find(entry => entry.header?.parentSession !== undefined);
		if (found !== undefined) return found;
		if (Date.now() > deadline) return undefined;
		await Bun.sleep(100);
	}
}

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

/**
 * No provider: the harness's own facts, the session's saved consumption, and no child session.
 */
async function phaseNoProvider(cli: PiCli): Promise<void> {
	console.log("\nphase: no subagent provider loaded");
	const dock = startDockRun(cli, "no-provider");
	const session = await openSession(dock, [CONFIG_ENTRYPOINT, FACTS_PROBE]);
	await session.run(FIRST_PROMPT, 90_000);
	await session.run(SECOND_PROMPT, 90_000);

	const starts = factsLines(session).filter(line => line.startsWith("session start "));
	observe(
		"the host's own session facts reach a subscribed extension",
		starts.length === 1 && factOf(starts[0], "kind") === "main" && /^owner:main:/.test(factOf(starts[0], "owner") ?? ""),
		`lines: ${JSON.stringify(factsLines(session).slice(0, 3))}`,
	);
	observe(
		"nothing was diagnosed as a failed subagent integration",
		!session.stderr().includes("subagent provider"),
		`stderr: ${JSON.stringify(session.stderr().split("\n").filter(line => line.includes("modelCost:")).slice(0, 3))}`,
	);

	const parentFile = await session.sessionFile();
	const parent = sessionHeader(parentFile);
	observe(
		"this run created one session and no child session",
		sessionFiles(dock.run.root.sessionDir).length === 1 && sessionFiles(dock.run.root.sessionDir)[0] === parentFile,
		`session dir: ${JSON.stringify(sessionFiles(dock.run.root.sessionDir))}`,
	);

	const document = await savedDocument(dock.home.consumptionFile, candidate => recordsOf(candidate).length > 0);
	const record = recordOf(document, parent?.id ?? "<none>");
	const startup = starts[0] === undefined ? undefined : factOf(starts[0], "startup");
	observe(
		"the session's consumption was accounted and saved under its own identity",
		record !== undefined && record.parent === null && (record.own?.[PROVIDER]?.[MODEL]?.tokens?.input ?? 0) === CAPTURE_USAGE.input * 2,
		`record: ${JSON.stringify(record)}`,
	);
	observe(
		"the saved startup pair is the one the host stated at the session's own start",
		record?.startup !== undefined &&
			startup !== undefined &&
			`${record.startup.model?.provider}/${record.startup.model?.model}@${record.startup.effort ?? "none"}` === startup,
		`record startup: ${JSON.stringify(record?.startup)}, host statement: ${JSON.stringify(startup)}`,
	);
}

/**
 * A provider that refuses this extension's child entry: diagnosed as a registration failure, with the
 * main session untouched.
 */
async function phaseRefusedEntry(cli: PiCli): Promise<void> {
	console.log("\nphase: a child entry the provider will not load");
	const dock = startDockRun(cli, "refused-entry", {
		childEntry: false,
		respond: delegationOnce(),
	});
	const session = await openSession(dock, [CONFIG_ENTRYPOINT, PROVIDER_ENTRY, FACTS_PROBE]);
	await session.run(FIRST_PROMPT, 90_000);
	await session.run(SECOND_PROMPT, 90_000);

	const diagnosed = session.stderr().split("\n").filter(line => line.includes("did not accept this entry as a required child extension"));
	observe(
		"the refused requirement is diagnosed as a registration failure",
		diagnosed.length === 1,
		`stderr: ${JSON.stringify(session.stderr().split("\n").filter(line => line.includes("modelCost:")).slice(0, 4))}`,
	);
	const document = await savedDocument(dock.home.consumptionFile, candidate => recordsOf(candidate).length > 0);
	observe(
		"the main session is unaffected: its own consumption is still saved",
		(recordOf(document, sessionHeader(await session.sessionFile())?.id ?? "<none>")?.own?.[PROVIDER]?.[MODEL]?.tokens?.input ?? 0) > 0,
		`records: ${JSON.stringify(recordsOf(document).map(record => record.id))}`,
	);
}

/**
 * A real foreground delegation — the child session runs *inside* this process — read for the
 * assembled lifecycle: the entry the provider loaded into the child, the child's own saved record,
 * the process's single root-side prefetch, the display the child's own binding left alone, and what
 * the parent's own instance does across the child's end and this run's own quit.
 */
async function phaseForegroundDelegation(cli: PiCli): Promise<void> {
	console.log("\nphase: a real delegation with codebase-tools and model-cost in the foreground");
	const dock = startDockRun(cli, "foreground", {
		respond: delegationOnce({ async: false }),
	});
	const codebaseEntry = path.join(REPO_ROOT, "entrypoints", "pi", "codebase-tools.ts");
	const session = await openSession(dock, [codebaseEntry, dock.childEntry, PROVIDER_ENTRY, FACTS_PROBE]);
	const balanceBefore = dock.run.capture.balanceCalls().length;
	let settled = true;
	try {
		await session.run(PROMPT, 90_000);
	} catch (error) {
		settled = false;
		console.log(`  note  the session's own run did not settle: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
	}
	// pi writes the session file lazily, so the parent's own file and header are read after its run.
	const parentFile = await session.sessionFile();
	const parent = sessionHeader(parentFile);

	const launches = launchMetadata(path.join(dock.run.root.sessionDir, "subagent-artifacts"));
	const launch = launches[0];
	observe(
		"the provider's own launch evidence names both framework extensions as loaded child extensions",
		launch !== undefined &&
			(launch.metadata.launchResolvedExtensions?.required ?? []).includes("model-cost") &&
			(launch.metadata.launchResolvedExtensions?.required ?? []).includes("codebase-tools") &&
			(launch.metadata.launchResolvedExtensions?.effective ?? []).length >= 3,
		`launch: ${JSON.stringify(launch?.metadata.launchResolvedExtensions)}`,
	);
	observe(
		"the launch's own parent session id is the session this extension serves",
		launch?.metadata.parentSessionId === parent?.id,
		`launch parent: ${JSON.stringify(launch?.metadata.parentSessionId)}, this session: ${JSON.stringify(parent?.id)}`,
	);

	const childFiles = sessionFiles(dock.run.root.sessionDir).filter(file => file !== parentFile);
	const child = childFiles.map(file => ({ file, header: sessionHeader(file) })).find(entry => entry.header?.parentSession !== undefined);
	observe(
		"the child session's own file states a direct parent, which is this session's file",
		child !== undefined && path.resolve(child.header?.parentSession ?? "") === path.resolve(parentFile),
		`child: ${JSON.stringify(child?.header)}, parent file: ${JSON.stringify(parentFile)}`,
	);
	// The host replaces this process's extension context when it stands the child session up beside
	// it, so the parent's own Round settling here is what proves the assembled entry survived that
	// replacement: a frontend or a handler that read the spent context would have taken the Round
	// down with it (see the evidence record's account of the fault this check regresses).
	observe(
		"the parent's own run settles with the child session running in the same process",
		settled,
		`session stderr (modelCost lines): ${JSON.stringify(session.stderr().split("\n").filter(line => line.includes("modelCost:")).slice(0, 4))}`,
	);

	// Both records are waited for as the facts they are: the child's own save and the parent's own
	// Round end are two commits, and which one the document publishes first is not this check's to
	// decide. A parent that never commits is still a failure — the wait is bounded — while a parent
	// whose commit lands a task after the child's is the ordering the host really had.
	const saved = await savedDocument(
		dock.home.consumptionFile,
		candidate =>
			recordOf(candidate, child?.header?.id ?? "<none>") !== undefined &&
			recordOf(candidate, parent?.id ?? "<none>") !== undefined,
	);
	const parentRecord = recordOf(saved, parent?.id ?? "<none>");
	observe(
		"the parent's own Round settled after the delegation, and its accumulation is saved",
		(parentRecord?.own?.[PROVIDER]?.[MODEL]?.tokens?.input ?? 0) > 0,
		`parent record: ${JSON.stringify(parentRecord)}`,
	);
	const childRecord = recordOf(saved, child?.header?.id ?? "<none>");
	observe(
		"the child session's own work is saved under its own identity, with this session as its direct parent",
		childRecord !== undefined &&
			childRecord.parent === parent?.id &&
			(childRecord.own?.[PROVIDER]?.[MODEL]?.tokens?.input ?? 0) > 0,
		`child record: ${JSON.stringify(childRecord)}, records ${JSON.stringify(recordsOf(saved).map(record => record.id))}`,
	);
	// The root-side effects are the owner's own: the child session's own evaluation in this process
	// starts neither the balance prefetch nor a display, so the process asked the account once. The
	// second process of another phase states the control: its own owner asks its own once more.
	observe(
		"the process asked the provider once: the child session's own evaluation started no second prefetch",
		dock.run.capture.balanceCalls().length === balanceBefore + 1,
		`balance calls ${JSON.stringify(dock.run.capture.balanceCalls().map(call => call.url))}`,
	);
	const childDrawings = session
		.frames()
		.filter(
			frame =>
				frame.type === "extension_ui_request" &&
				frame.method === "setWidget" &&
				frame.widgetKey === MODEL_COST_WIDGET_KEY,
		)
		.map(frame => (Array.isArray(frame.widgetLines) ? frame.widgetLines.map(String) : []))
		.filter(lines => lines.some(line => line.includes("scout")));
	observe(
		"the child session's own binding drew nothing: the display stays this session's",
		childDrawings.length === 0,
		`drawings mentioning the child session: ${JSON.stringify(childDrawings.slice(0, 2))}`,
	);

	// Observe the operator's actual detail widget, not just a successful provider registration.
	const detailMark = session.frameMark();
	await session.run("/budget detail");
	const detailFrame = await session.frameSince(
		detailMark,
		frame => frame.type === "extension_ui_request" && frame.method === "setWidget" &&
			frame.widgetKey === MODEL_COST_WIDGET_KEY &&
			Array.isArray(frame.widgetLines) &&
			frame.widgetLines.some(line => String(line).includes(childRecord?.name ?? childRecord?.id ?? "<missing>")),
		"the detail widget containing the real child session",
		5_000,
	);
	observe("budget detail draws the real child session after a multi-extension delegation", detailFrame !== undefined,
		JSON.stringify(detailFrame?.widgetLines));
	observe(
		"budget detail names the agent definition the foreground child runs",
		detailFrame !== undefined &&
			Array.isArray(detailFrame.widgetLines) &&
			detailFrame.widgetLines.some(line => String(line).includes("[scout]")),
		JSON.stringify(detailFrame?.widgetLines),
	);

	// The child's session ended inside this process. The parent's own instance is not the child's to
	// end: the next exchange is accounted and saved into the same document.
	const inputAfterDelegation = parentRecord?.own?.[PROVIDER]?.[MODEL]?.tokens?.input ?? 0;
	await session.run(SECOND_PROMPT, 90_000);
	const continued = await savedDocument(dock.home.consumptionFile, candidate =>
		(recordOf(candidate, parent?.id ?? "<none>")?.own?.[PROVIDER]?.[MODEL]?.tokens?.input ?? 0) > inputAfterDelegation,
	);
	observe(
		"a child session's own end did not dispose the live instance: the next exchange is still accounted and saved",
		(recordOf(continued, parent?.id ?? "<none>")?.own?.[PROVIDER]?.[MODEL]?.tokens?.input ?? 0) > inputAfterDelegation,
		`record after the next exchange: ${JSON.stringify(recordOf(continued, parent?.id ?? "<none>"))}`,
	);

	// This run's own quit: the process must exit of its own accord (the assembled entry leaves no
	// wait that holds it), and the root must gain nothing after the entry's own disposal.
	const bytesAtQuit = readFileSync(dock.home.consumptionFile, "utf8");
	const exit = await session.stop({ timeoutMs: 15_000 });
	await Bun.sleep(1_000);
	observe(
		"the entry's own disposal leaves no task behind: the process exits instead of being held open",
		exit.timedOut === false,
		`exit ${JSON.stringify(exit.exitCode)}${exit.timedOut ? " (killed after the stop timeout)" : ""}`,
	);
	observe(
		"nothing writes to the storage root after the entry's own disposal",
		readFileSync(dock.home.consumptionFile, "utf8") === bytesAtQuit,
		`file after the quit: ${readFileSync(dock.home.consumptionFile, "utf8")}`,
	);
	console.log(`  note  the extension reported the host's stale-extension-context fault: ${staleContextFault(session)}`);
}

/**
 * A real background delegation: the child runs in the provider's own detached process, and what this
 * phase reads is that process's own work — its saved session record — beside the one provider read
 * the owner's process made, which the child's process must not repeat.
 */
async function phaseBackgroundDelegation(cli: PiCli): Promise<void> {
	console.log("\nphase: a real delegation in the background");
	const delegated = delegationOnce({ async: true });
	const dock = startDockRun(cli, "background", {
		// Every request is held before it is answered, and the child's first one is what makes "the
		// owner's process observed this session before that session's first Round ended" a fact
		// rather than a race: a Round cannot end, and its consumption cannot be saved, while the
		// request that Round is waiting on is still unanswered. The hold is the fixture's own
		// controlled answer, not a delay this repository's code waits on.
		respond: request => ({ ...(delegated(request) ?? {}), answerDelayMs: HELD_FIRST_REQUEST_MS }),
	});
	const codebaseEntry = path.join(REPO_ROOT, "entrypoints", "pi", "codebase-tools.ts");
	const session = await openSession(dock, [codebaseEntry, dock.childEntry, PROVIDER_ENTRY, FACTS_PROBE, writeObservationProbeEntry(dock.configRoot)]);
	await session.run("/budget detail");
	const liveDetailMark = session.frameMark();
	const balanceBefore = dock.run.capture.balanceCalls().length;
	let settled = true;
	try {
		await session.run(PROMPT, 90_000);
	} catch (error) {
		settled = false;
		console.log(`  note  the session's own run did not settle: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
	}

	const parentFile = await session.sessionFile();
	const parent = sessionHeader(parentFile);
	// A background delegation leaves no launch metadata under the foreground path's artifacts — the
	// provider's own detached runner writes what it writes beside the child's own session — so what
	// this phase reads is that session's file and the record its own process saved for it.
	const child = await childSessionOf(dock, parentFile, 60_000);
	const childId = child?.header?.id;
	if (childId === undefined) {
		throw new SmokeFailure("the asynchronous delegation produced a child session",
			`settled ${settled}, child ${JSON.stringify(child?.header)}`);
	}
	// What the owner's own process observed of that session, read while the spawned process's first
	// request is still held unanswered: nothing of it can have ended a Round or saved anything yet,
	// and what the owner process already holds is what the spawned process delivered — its identity,
	// its activity and its context — adopted into the framework's own observation source.
	const observed = await observationLinesFor(session, childId, 30_000);
	const liveDetail = await session.frameSince(liveDetailMark,
		frame => frame.type === "extension_ui_request" && frame.method === "setWidget" &&
			frame.widgetKey === MODEL_COST_WIDGET_KEY && Array.isArray(frame.widgetLines) &&
			frame.widgetLines.some(line => String(line).includes("[scout]") &&
				String(line).includes("subagent-scout-") &&
				String(line).includes("deepseek/deepseek-flash(")),
		"the background child's agent definition and startup model in the live detail widget", 2_000);
	const beforeAnySave = readDocument(dock.home.consumptionFile);
	observe(
		"the real detail widget shows the background child's startup model before its first consumption commit",
		liveDetail !== undefined && recordOf(beforeAnySave, childId) === undefined,
		`widget: ${JSON.stringify(liveDetail?.widgetLines)}, saved: ${JSON.stringify(recordOf(beforeAnySave, childId))}`,
	);
	observe(
		"the spawned session registered with the owner's process before its first Round ended",
		observed.length > 0 && recordOf(beforeAnySave, childId) === undefined,
		`lines: ${JSON.stringify(observed.slice(0, 3))}, record: ${JSON.stringify(recordOf(beforeAnySave, childId))}`,
	);
	observe(
		"the identity it registered with is the one the host's own session file states",
		observed.every(line => factOf(line, "id") === childId) &&
			observed.every(line => factOf(line, "kind") === "sub") &&
			observed.every(line => factOf(line, "parent") === parent?.id) &&
			observed.every(line => factOf(line, "owner") === `inherited:main:${parent?.id ?? ""}`),
		`lines: ${JSON.stringify(observed)}, header: ${JSON.stringify(child?.header)}`,
	);
	observe(
		"the owner's own observation source holds the reading that arrived",
		observed.some(line => line.startsWith("activity ")) &&
			observed.every(line => line.startsWith("activity ") === (factOf(line, "held_activity") === factOf(line, "activity"))),
		`lines: ${JSON.stringify(observed)}`,
	);
	observe(
		"the child's delivery and the owner's observation source both name the agent definition it runs",
		observed.length > 0 &&
			observed.every(line => factOf(line, "agent") === "scout") &&
			observed.every(line => factOf(line, "held_agent") === "scout"),
		`lines: ${JSON.stringify(observed)}`,
	);
	let document: ConsumptionDocument | undefined;
	try {
		document = await savedDocument(
			dock.home.consumptionFile,
			candidate => recordOf(candidate, childId) !== undefined,
			45_000,
		);
	} catch (error) {
		// Missing accounting after a successful child run is a failed observation, not a green skip.
		throw new SmokeFailure("the asynchronous child's consumption is saved",
			error instanceof Error ? error.message.split("\n")[0] : String(error));
	}
	const record = recordOf(document, childId);
	observe(
		"the child's own consumption was saved under the child's own identity by its own process",
		record !== undefined && record.parent === parent?.id && (record.own?.[PROVIDER]?.[MODEL]?.tokens?.input ?? 0) > 0,
		`child record: ${JSON.stringify(record)}`,
	);
	observe(
		"the child's own file and the saved record agree on the session that spawned it",
		path.resolve(child?.header?.parentSession ?? "") === path.resolve(parentFile) && record?.parent === parent?.id,
		`header: ${JSON.stringify(child?.header?.parentSession)}, record: ${JSON.stringify(record?.parent)}`,
	);
	observe(
		"the saved startup pair is the one the child's own start stated",
		record?.startup?.model?.provider !== undefined || record?.startup?.effort !== undefined,
		`child startup: ${JSON.stringify(record?.startup)}`,
	);
	// The child's own process is not the owner of anything: it asked the provider account nothing, so
	// the one balance read of this run is the owning process's own prefetch.
	observe(
		"the child's own process started no root-side prefetch of its own",
		dock.run.capture.balanceCalls().length === balanceBefore + 1,
		`balance calls ${JSON.stringify(dock.run.capture.balanceCalls().map(call => call.url))}`,
	);
	// And what that session's context read travelled too, with the model it was read at and with the
	// owner process's own source holding the same reading — the reading the child's process measured
	// was the one the owner's process kept, without either of them reading anything to obtain it.
	const forChild = observationLines(session).filter(line => factOf(line, "id") === childId);
	const contextLines = forChild.filter(line => line.startsWith("context ") && factOf(line, "tokens") !== "none");
	observe(
		"the child's context reading reached the owner's process with the model it was read at",
		contextLines.length > 0 &&
			contextLines.every(line => factOf(line, "held_tokens") === factOf(line, "tokens")) &&
			contextLines.some(line => (factOf(line, "model") ?? "none") !== "none"),
		`lines: ${JSON.stringify(contextLines.slice(0, 3))}`,
	);
}

/** The whole run, and the record of what it observed. */
async function main(): Promise<void> {
	const keep = process.argv.includes("--keep");
	const explicit = process.argv.includes("--pi") ? process.argv[process.argv.indexOf("--pi") + 1] : undefined;
	const cli = resolvePiCli(explicit);
	const version = await piVersion(cli);
	console.log(`pi ${version} (${cli.path})`);
	const expectedVersion = process.argv.includes("--expect-pi-version")
		? process.argv[process.argv.indexOf("--expect-pi-version") + 1]
		: EXPECTED_PI_VERSION;
	observe("the harness under test is the fixed version this run states", version === expectedVersion, `reported ${version}, expected ${expectedVersion}`);
	observe("the pinned provider artifact this repository installs is present", existsSync(PROVIDER_ENTRY), PROVIDER_ENTRY);

	try {
		if (!process.argv.includes("--foreground-only") && !process.argv.includes("--background-only")) {
			await phaseNoProvider(cli);
			await phaseRefusedEntry(cli);
		}
		if (!process.argv.includes("--background-only")) await phaseForegroundDelegation(cli);
		if (!process.argv.includes("--foreground-only")) await phaseBackgroundDelegation(cli);
	} finally {
		for (const session of sessions) await session.stop({ timeoutMs: 15_000 });
		for (const dock of runs) {
			dock.run.capture.stop();
			if (!keep) rmSync(dock.run.root.path, { recursive: true, force: true });
		}
	}
	console.log(`\n${observations.length} observations held.`);
	for (const observation of observations) console.log(`  - ${observation.name}`);
}

await main();
