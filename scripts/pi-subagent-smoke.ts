/**
 * Ticket 05's real-host record: model-cost on a real pi session, with the pinned subagent provider
 * either absent, refusing this extension's child entry, or actually loading it into a child session.
 *
 * Usage
 *   bun scripts/pi-subagent-smoke.ts                    # resolve the installed pi CLI
 *   bun scripts/pi-subagent-smoke.ts --pi <path>        # or PI_CLI=<path>
 *   bun scripts/pi-subagent-smoke.ts --keep             # keep every run root for inspection
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
 *   4. **A real rename reaches consumers where it happened, and the next commit carries it** — the
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
import type { CapturedRequest } from "../tests/harness-dock/capture-server";
import { PI_MODEL_COST_CONFIG_ROOT_ENV } from "../tests/harness-dock/fixtures/pi-model-cost/env";
import { PI_SESSION_FACTS_PREFIX } from "../tests/harness-dock/fixtures/pi-session-facts/prefix";
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

/** The version this smoke's expectations were written against. */
const EXPECTED_PI_VERSION = "1.2.0";

/** The provider and model the runs declare. */
const PROVIDER = "deepseek";
const MODEL = "deepseek-flash";

/** The document the extension keeps in its storage root. */
const CONSUMPTION_FILE = "consumption.json";

/** The usage the capture endpoint reports for every completion, so a saved amount is non-zero. */
const CAPTURE_USAGE = { input: 1_000, output: 200, cacheRead: 0, cacheWrite: 0 } as const;

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
	const specifier = relative.startsWith(".") ? relative : `./${relative}`;
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

/** Whether a run's own stderr reports the stale-extension-context fault this host raises on replacement. */
function staleContextFault(session: PiSession): boolean {
	return session.stderr().includes("This extension ctx is stale after session replacement or reload");
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
		respond: request => (carriesSubagentTool(request) ? { toolCall: delegationCall(PROMPT, { async: false }) } : { replyText: REPLY_TEXT }),
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
 * A real foreground delegation: what the provider's own launch evidence says about this entry, and
 * what the child session's own file states.
 */
async function phaseForegroundDelegation(cli: PiCli): Promise<void> {
	console.log("\nphase: a real delegation in the foreground");
	const dock = startDockRun(cli, "foreground", {
		respond: request => (carriesSubagentTool(request) ? { toolCall: delegationCall(PROMPT, { async: false }) } : { replyText: REPLY_TEXT }),
	});
	const session = await openSession(dock, [CONFIG_ENTRYPOINT, PROVIDER_ENTRY, FACTS_PROBE]);
	const parentFile = await session.sessionFile();
	const parent = sessionHeader(parentFile);
	let settled = true;
	try {
		await session.run(PROMPT, 90_000);
	} catch (error) {
		settled = false;
		console.log(`  note  the session's own run did not settle: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
	}

	const launches = launchMetadata(path.join(dock.run.root.sessionDir, "subagent-artifacts"));
	const launch = launches[0];
	observe(
		"the provider's own launch evidence names this extension as a loaded child extension",
		launch !== undefined &&
			(launch.metadata.launchResolvedExtensions?.required ?? []).includes("model-cost") &&
			(launch.metadata.launchResolvedExtensions?.effective ?? []).length >= 2,
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
	console.log(`  note  the session's run settled: ${settled}`);
	if (staleContextFault(session)) {
		console.log("  note  the extension reported the host's stale-extension-context fault during the delegation");
	}
}

/**
 * A real background delegation: the child's own process saves its own session record, which is the
 * public form of that session's identity, direct parent and startup pair.
 */
async function phaseBackgroundDelegation(cli: PiCli): Promise<void> {
	console.log("\nphase: a real delegation in the background");
	let delegated = false;
	const dock = startDockRun(cli, "background", {
		respond: request => {
			if (!carriesSubagentTool(request)) return { replyText: REPLY_TEXT };
			if (delegated) return { replyText: REPLY_TEXT };
			delegated = true;
			return { toolCall: delegationCall(PROMPT, { async: true }) };
		},
	});
	const session = await openSession(dock, [CONFIG_ENTRYPOINT, PROVIDER_ENTRY, FACTS_PROBE]);
	const parentFile = await session.sessionFile();
	const parent = sessionHeader(parentFile);
	try {
		await session.run(PROMPT, 90_000);
	} catch (error) {
		console.log(`  note  the session's own run did not settle: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
	}

	const launches = launchMetadata(path.join(dock.run.root.sessionDir, "subagent-artifacts"));
	const launch = launches[0];
	const childFiles = sessionFiles(dock.run.root.sessionDir)
		.filter(file => file !== parentFile)
		.map(file => ({ file, header: sessionHeader(file) }))
		.filter(entry => entry.header?.parentSession !== undefined);
	const child = childFiles[0];
	if (launch === undefined || child?.header?.id === undefined) {
		console.log(`  note  this path produced no child session to read: launches ${launches.length}, children ${childFiles.length}`);
		return;
	}
	const document = await savedDocument(
		dock.home.consumptionFile,
		candidate => recordOf(candidate, child.header?.id ?? "<none>") !== undefined,
	);
	const record = recordOf(document, child.header.id);
	observe(
		"the child's own consumption was saved under the child's own identity",
		record !== undefined && record.parent === parent?.id && (record.own?.[PROVIDER]?.[MODEL]?.tokens?.input ?? 0) > 0,
		`child record: ${JSON.stringify(record)}`,
	);
	observe(
		"the launch's own parent session id, the child's own file and the saved record agree",
		launch.metadata.parentSessionId === parent?.id && path.resolve(child.header.parentSession ?? "") === path.resolve(parentFile),
		`launch: ${JSON.stringify(launch.metadata.parentSessionId)}, header: ${JSON.stringify(child.header.parentSession)}, record: ${JSON.stringify(record?.parent)}`,
	);
	observe(
		"the saved startup pair is the one the child's own start stated",
		record?.startup?.model?.provider !== undefined || record?.startup?.effort !== undefined,
		`child startup: ${JSON.stringify(record?.startup)}`,
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
		await phaseNoProvider(cli);
		await phaseRefusedEntry(cli);
		await phaseForegroundDelegation(cli);
		await phaseBackgroundDelegation(cli);
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
