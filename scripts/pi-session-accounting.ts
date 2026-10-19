/**
 * Ticket 08's real-host record: once-only accounting, the direct-parent Session rollup and the current
 * tree on the real pi CLI beside the pinned subagent provider.
 *
 * Usage
 *   bun scripts/pi-session-accounting.ts                 # resolve the installed pi CLI
 *   bun scripts/pi-session-accounting.ts --pi <path>     # or PI_CLI=<path>
 *   bun scripts/pi-session-accounting.ts --keep          # keep every run root for inspection
 *   bun scripts/pi-session-accounting.ts --expect-pi-version 1.3.0 # explicit candidate host observation
 *
 * What it drives: the real installed pi as a child process in RPC mode, with an isolated agent state,
 * session directory, working directory and user home under the OS temp root, and a local
 * OpenAI-compatible capture endpoint declared as the provider. The extension under test is the
 * production pi assembly, loaded by pi's own loader from a discovery entrypoint of this run's own
 * layout, and the provider beside it is the pinned `pi-subagents` artifact this repository installs.
 * The root session delegates one task in the background, so the child session runs as its own pi
 * process and accounts itself, exactly as this migration's child path does.
 *
 * What it asserts (consumer-visible behavior only; no source or wiring inspection):
 *   1. **One observed request is accounted exactly once, and the child is its own session.** The
 *      endpoint is the independent count of what really ran: it answered N_child requests whose
 *      conversation begins with the delegated task and N_root others. The document's child record
 *      holds exactly N_child capture readings of usage and the root's exactly N_root, under the
 *      child's own identity — never inside the root's own record;
 *   2. **The child's record states the real direct parent**, as the provider's own launch metadata and
 *      the child session's own file agree on it;
 *   3. **The tree a later process draws holds that child and nothing else.** A second pi process
 *      resumes the root session from the same run root, loads the same provider beside the extension
 *      (the detail form is the one an integrated entry draws), reads the shared document and draws the
 *      detail tree: the child's own row is there at one step of indentation, with its own consumption,
 *      and reading it writes nothing, asks the model for nothing and adds no consumption.
 *
 * The amounts are this script's own arithmetic on the maintained data's flash prices and the usage the
 * endpoint reported: one reading of `{input 1000, output 200, cacheRead 0, cacheWrite 0}` costs
 * `(1000·1 + 200·4) / 1e6 = 0.0018` CNY off-peak and `0.0036` CNY in a peak window. The cost pi itself
 * computed for the same responses (`0.0014` USD at the run's own declared prices, which every request
 * body carries) is a different number and is never adopted.
 *
 * What it cannot assert here (recorded, not silently skipped): a foreground delegation (this host
 * replaces the parent's extension context in-process, which ticket 05 recorded as a frontend fault),
 * nested delegation, cancellation and a crash mid-Round. The deterministic suites hold those paths.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { CapturedRequest } from "../tests/harness-dock/capture-server";
import { PI_MODEL_COST_CONFIG_ROOT_ENV } from "../tests/harness-dock/fixtures/pi-model-cost/env";
import { type PiCli, type PiRun, PiSession, piVersion, resolvePiCli, startPiRun } from "../tests/harness-dock/pi-session";

/** The repository root: this script lives in `scripts/`. */
const REPO_ROOT = path.resolve(import.meta.dir, "..");

/** The extension's pi assembly, as a controlled run binds it to its own configuration root. */
const CONFIG_ENTRYPOINT = path.join(REPO_ROOT, "tests", "harness-dock", "fixtures", "pi-model-cost", "entrypoint.ts");

/** The pinned provider's own extension entry, as the artifact in this repository installs it. */
const PROVIDER_ENTRY = path.join(REPO_ROOT, "node_modules", "pi-subagents", "index.js");

/** The version this script's expectations were written against. */
const EXPECTED_PI_VERSION = "1.2.0";

/** The provider and model the run declares, and the harness key its records live under. */
const PROVIDER = "deepseek";
const MODEL = "deepseek-flash";
const HARNESS = "pi";

/** The document the extension keeps in its storage root. */
const CONSUMPTION_FILE = "consumption.json";

/** The usage the capture endpoint reports for every completion. */
const CAPTURE_USAGE = { input: 1_000, output: 200, cacheRead: 0, cacheWrite: 0 } as const;

/**
 * What that one reading costs at the maintained flash price, in the data's own currency: off-peak
 * `(1_000·1 + 200·4) / 1e6` and `peakMultiplier` 2 times it.
 */
const FLASH_OFF_PEAK_CNY = 0.0018;
const FLASH_PEAK_CNY = 0.0036;

/** The prompt the root session is given, and the task it delegates to a child session. */
const ROOT_PROMPT = "Delegate the repository survey and then answer.";
const TASK = "Report one line about the repository root.";

/** The text every completion answers with unless a case scripts a delegation for it. */
const REPLY_TEXT = "accounting-smoke-reply";

/** The one third-party tool the scripted delegation calls. */
const SUBAGENT_TOOL = "subagent";

/** How long one prompt's run is given. */
const PROMPT_TIMEOUT_MS = 180_000;

/** How long the session a spawned process runs is given to appear. */
const SPAWNED_SESSION_BUDGET_MS = 120_000;

/** How long one session's own process is given to commit its own record. */
const RECORD_WAIT_MS = 45_000;

/** How long a widget rendering the resumed process must publish. */
const UI_FRAME_TIMEOUT_MS = 30_000;

const observations: Array<{ readonly name: string; readonly detail: string }> = [];
const failures: Array<{ readonly name: string; readonly detail: string }> = [];
const runs: DockRun[] = [];
const sessions: PiSession[] = [];

/**
 * Records one observation: the facts this run could read are held, and a fact it could not read is
 * held as a failure and the run goes on.
 *
 * The whole point of this script is to state which of the required facts a real host really produces,
 * so a missing one is reported with the raw material that shows what was read instead — and the other
 * facts are still observed in the same run rather than being lost behind the first gap.
 */
function observe(name: string, ok: boolean, detail: string): void {
	if (ok) {
		observations.push({ name, detail });
		console.log(`  ok    ${name}`);
		return;
	}
	failures.push({ name, detail });
	console.log(`  FAIL  ${name}\n        ${detail}`);
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

/** One provisioned run: the capture endpoint, the isolated home and the layout the extension binds. */
interface DockRun {
	readonly run: PiRun;
	readonly home: IsolatedHome;
	readonly configRoot: string;
}

/** One session record of the consumption document, as far as this script reads it. */
interface SessionRecord {
	readonly id: string;
	readonly name?: string;
	readonly parent?: string | null;
	readonly saveVersion?: number;
	readonly own?: Record<string, Record<string, { readonly tokens?: Record<string, number>; readonly costCny?: number }>>;
}

/** One consumption document, as far as this script reads it. */
interface ConsumptionDocument {
	readonly schemaVersion?: number;
	readonly periodId?: string;
	readonly harnesses?: Record<string, { readonly sessions?: readonly SessionRecord[] } | undefined>;
}

/** Every record the document holds for this harness, in document order. */
function recordsOf(document: ConsumptionDocument | undefined): readonly SessionRecord[] {
	return document?.harnesses?.[HARNESS]?.sessions ?? [];
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

/** The one record this document holds for `id`, or `undefined` when it holds none. */
function recordOf(document: ConsumptionDocument | undefined, id: string): SessionRecord | undefined {
	return recordsOf(document).find(record => record.id === id);
}

/** One record's stored reading of one bucket in one provider/model pair. */
function storedTokens(record: SessionRecord | undefined, provider: string, model: string): Record<string, number> {
	return record?.own?.[provider]?.[model]?.tokens ?? {};
}

/** One record's stored amount in one provider/model pair, or `undefined` when it states none. */
function storedCost(record: SessionRecord | undefined, provider: string, model: string): number | undefined {
	return record?.own?.[provider]?.[model]?.costCny;
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
 * The production assembly requires the entry its repository states — `entrypoints/pi/model-cost.ts` —
 * so a run that keeps its storage root its own states that path inside a layout of its own, and the
 * file it writes binds the production assembly to this run's configuration root exactly as a
 * deployment's own entrypoint binds it.
 */
function writeChildEntry(root: string): void {
	const directory = path.join(root, "entrypoints", "pi");
	mkdirSync(directory, { recursive: true });
	const harness = path.join(REPO_ROOT, "extensions", "model-cost", "harnesses", "pi.ts");
	const relative = path.relative(directory, harness).replace(/\\/g, "/");
	writeFileSync(
		path.join(directory, "model-cost.ts"),
		`import { modelCostPiHarness } from ${JSON.stringify(relative.startsWith(".") ? relative : `./${relative}`)};\n\nexport default modelCostPiHarness(${JSON.stringify(root)});\n`,
		"utf8",
	);
}

/**
 * The configuration root one run binds the production assembly to: a throwaway repository layout
 * carrying only `extensions/model-cost/config.yaml` and this run's own child entry.
 */
function configRootFor(home: IsolatedHome, label: string): string {
	const root = mkdtempSync(path.join(tmpdir(), `pi-accounting-config-${label}-`));
	const directory = path.join(root, "extensions", "model-cost");
	mkdirSync(directory, { recursive: true });
	writeFileSync(
		path.join(directory, "config.yaml"),
		`storageDir: ${JSON.stringify(home.storageDirectory)}\nbalanceTtlMs: 30000\ncodexQuotaTtlMs: 15000\n`,
		"utf8",
	);
	writeChildEntry(root);
	return root;
}

/** One fresh run root with a capture endpoint behind it and its own models file pointing at it. */
function startDockRun(cli: PiCli, label: string): DockRun {
	// The root delegates once, on its own first request: the child's own requests (which carry the
	// provider's tool too) and any later request of the root's are answered with text, so one run is one
	// delegation rather than a fan-out that keeps re-delegating itself.
	let delegated = false;
	const run = startPiRun(cli, label, {
		provider: PROVIDER,
		model: MODEL,
		// The host's own cost for the same tokens: a third party's numbers, which this extension's own
		// pricing must never adopt (see the amounts above).
		cost: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 },
		endpoint: {
			usage: CAPTURE_USAGE,
			replyText: REPLY_TEXT,
			respond: request => {
				if (delegated || !carriesSubagentTool(request) || !firstUserText(request).includes(ROOT_PROMPT)) return undefined;
				delegated = true;
				return { toolCall: delegationCall() };
			},
		},
	});
	const home = isolateHome(run.root.path);
	const dock: DockRun = { run, home, configRoot: configRootFor(home, label) };
	runs.push(dock);
	return dock;
}

/** One session over one run's isolated state, loading exactly the extensions the case names. */
async function openSession(
	dock: DockRun,
	extensions: readonly string[],
	extraArgs: readonly string[] = [],
): Promise<PiSession> {
	const session = await PiSession.start({
		cli: dock.run.cli,
		runRoot: dock.run.root,
		entrypoint: extensions,
		selector: dock.run.selector,
		extraArgs,
		env: { ...dock.home.env, [PI_MODEL_COST_CONFIG_ROOT_ENV]: dock.configRoot },
	});
	sessions.push(session);
	return session;
}

// ---------------------------------------------------------------------------
// Reading the provider's own facts and the endpoint's own counts
// ---------------------------------------------------------------------------

/** Whether one request carries the provider's own delegation tool. */
function carriesSubagentTool(request: CapturedRequest): boolean {
	const body = request.json as { tools?: Array<{ function?: { name?: string } }> } | null;
	return (body?.tools ?? []).some(tool => tool.function?.name === SUBAGENT_TOOL);
}

/** One scripted delegation call: the background form, whose child runs as its own process. */
function delegationCall(): { readonly name: string; readonly arguments: string } {
	return { name: SUBAGENT_TOOL, arguments: JSON.stringify({ agent: "scout", task: TASK, async: true }) };
}

/** The text of one request's first user message: the conversation that request belongs to. */
function firstUserText(request: CapturedRequest): string {
	const body = request.json as { messages?: Array<{ role?: string; content?: unknown }> } | null;
	const first = (body?.messages ?? []).find(message => message.role === "user");
	const content = first?.content;
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.map(part => {
				const text = (part as { text?: unknown }).text;
				return typeof text === "string" ? text : "";
			})
			.join(" ");
	}
	return "";
}

/** Whether one request is the child session's own: its conversation begins with the delegated task. */
function isChildRequest(request: CapturedRequest): boolean {
	const text = firstUserText(request);
	return text.includes(TASK) && !text.includes(ROOT_PROMPT);
}

/**
 * The completion requests this endpoint really answered, in arrival order.
 *
 * The endpoint records every path it serves — the extension's own balance query among them — so a
 * count of what the model really ran is a count of the requests that carried a conversation.
 */
function completionRequests(requests: readonly CapturedRequest[]): readonly CapturedRequest[] {
	return requests.filter(request => {
		const body = request.json as { messages?: unknown } | null;
		return Array.isArray(body?.messages);
	});
}

/** Every session file a run's session directory holds, at any depth: pi nests a spawned session's. */
function sessionFilesOf(directory: string): string[] {
	const files: string[] = [];
	const pending = [directory];
	while (pending.length > 0) {
		const current = pending.pop() as string;
		for (const entry of readdirSync(current, { withFileTypes: true })) {
			const file = path.join(current, entry.name);
			if (entry.isDirectory()) pending.push(file);
			else if (entry.name.endsWith(".jsonl")) files.push(file);
		}
	}
	return files;
}

/**
 * Waits until the session a spawned process ran appears, and answers with its own file.
 *
 * The background delegation's child is its own pi process: it boots after the root's Round already
 * ended, so its file appears later, and what identifies it here is pi's own lineage link — the file
 * whose header names the root's session file as the one it was spawned from.
 */
async function childSessionFile(sessionDir: string, rootFile: string, timeoutMs: number): Promise<string> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const found = sessionFilesOf(sessionDir).find(file => {
			const link = sessionHeader(file)?.parentSession;
			return link !== undefined && path.resolve(link) === path.resolve(rootFile);
		});
		if (found !== undefined) return found;
		if (Date.now() > deadline) {
			throw new Error(
				`no session spawned from the root's appeared: ${JSON.stringify(sessionFilesOf(sessionDir))}`,
			);
		}
		await Bun.sleep(300);
	}
}

/** One session file's own header: the identity pi stated for it and the file it was spawned from. */
function sessionHeader(file: string): { readonly id?: string; readonly parentSession?: string } | undefined {
	try {
		const [firstLine] = readFileSync(file, "utf8").split("\n", 1);
		return JSON.parse(firstLine ?? "") as { readonly id?: string; readonly parentSession?: string };
	} catch {
		return undefined;
	}
}

/** One provider meta record, as far as this script reads it. */
interface LaunchRecord {
	readonly parentSessionId?: string;
	readonly required?: readonly string[];
	readonly effective?: readonly string[];
}

/** Waits until the provider's own launch record for one run appears, and answers with the first one. */
async function launchRecord(directory: string, timeoutMs: number): Promise<LaunchRecord | undefined> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const found = launchRecordsOf(directory)[0];
		if (found !== undefined) return found;
		if (Date.now() > deadline) return undefined;
		await Bun.sleep(300);
	}
}

/** Every launch record the provider wrote for one run, in file order. */
function launchRecordsOf(directory: string): LaunchRecord[] {
	if (!existsSync(directory)) return [];
	const launches: LaunchRecord[] = [];
	for (const file of readdirSync(directory).filter(name => name.endsWith("_meta.json"))) {
		try {
			const parsed = JSON.parse(readFileSync(path.join(directory, file), "utf8")) as {
				readonly parentSessionId?: string;
				readonly launchResolvedExtensions?: { readonly required?: readonly string[]; readonly effective?: readonly string[] };
			};
			launches.push({
				...(parsed.parentSessionId === undefined ? {} : { parentSessionId: parsed.parentSessionId }),
				...(parsed.launchResolvedExtensions === undefined
					? {}
					: {
							required: parsed.launchResolvedExtensions.required,
							effective: parsed.launchResolvedExtensions.effective,
						}),
			});
		} catch {
			// A file this script cannot read states nothing; the observations below then report what was found.
		}
	}
	return launches;
}

/** The widget lines one frame published for this extension's key, or nothing when it carries none. */
function widgetLinesOf(frame: { readonly [key: string]: unknown }): string[] | undefined {
	if (frame["type"] !== "extension_ui_request" || frame["method"] !== "setWidget" || frame["widgetKey"] !== "z-model-cost") {
		return undefined;
	}
	const lines = frame["widgetLines"];
	return Array.isArray(lines) ? lines.map(line => String(line)) : undefined;
}

/**
 * Waits until the file holds a document a case expects, and answers with what it read either way.
 *
 * `reached` is whether the expectation appeared inside the budget; a run that never saw it still
 * answers with the last document it read, because what the host really published is the evidence.
 */
async function documentWithRecord(
	file: string,
	accept: (document: ConsumptionDocument) => boolean,
	timeoutMs: number,
): Promise<{ readonly document: ConsumptionDocument | undefined; readonly reached: boolean }> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const document = readDocument(file);
		if (document !== undefined && accept(document)) return { document, reached: true };
		if (Date.now() > deadline) return { document, reached: false };
		await Bun.sleep(200);
	}
}

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

/** What the delegation phase hands the tree phase: the run, the two identities and the child's name. */
interface DelegationFacts {
	readonly dock: DockRun;
	readonly rootFile: string;
	readonly rootId: string;
	readonly childId: string;
	readonly childName: string;
}

/** The background delegation: what really ran, what each session's own record holds, and its parent. */
async function phaseDelegation(cli: PiCli): Promise<DelegationFacts> {
	console.log("\nphase: one background delegation, and what each session's own record holds");
	const dock = startDockRun(cli, "delegation");
	const session = await openSession(dock, [CONFIG_ENTRYPOINT, PROVIDER_ENTRY]);

	let settled = true;
	try {
		await session.run(ROOT_PROMPT, PROMPT_TIMEOUT_MS);
	} catch (error) {
		settled = false;
		console.log(`  note  the root's run did not settle: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
	}
	if (settled) console.log("  note  the root's Round ended after its background child's completion woke it");
	else console.log("  note  the root's Round stayed open; only what the records below state is read");

	// The session file is written as the session runs, so it is read here rather than before the prompt:
	// its header is the identity pi stated for the session, and the line it states it on is the first.
	const rootFile = await session.sessionFile();
	const rootId = sessionHeader(rootFile)?.id;
	if (rootId === undefined) throw new Error(`the root session's file states no id: ${rootFile}`);

	const childFile = await childSessionFile(dock.run.root.sessionDir, rootFile, SPAWNED_SESSION_BUDGET_MS);
	const childId = sessionHeader(childFile)?.id;
	observe(
		"the delegation really created a child session of its own, linked to the root's own file",
		childId !== undefined && childId !== rootId,
		`child file ${childFile}, header ${JSON.stringify(sessionHeader(childFile))}`,
	);
	if (childId === undefined) return { dock, rootFile, rootId, childId: rootId, childName: rootId };

	// Each session's own process writes its own record, so each is waited for on its own: a record that
	// never appears is one of the facts this run has to state, not a reason to stop reading.
	const childWait = await documentWithRecord(
		dock.home.consumptionFile,
		candidate => recordOf(candidate, childId) !== undefined,
		RECORD_WAIT_MS,
	);
	observe(
		"the child's own process accounted and saved its own session in the shared document",
		childWait.reached,
		`document: ${JSON.stringify(recordsOf(childWait.document).map(record => [record.id, record.parent, record.own]))}`,
	);
	const rootWait = await documentWithRecord(
		dock.home.consumptionFile,
		candidate => recordOf(candidate, rootId) !== undefined,
		RECORD_WAIT_MS,
	);
	observe(
		"the root's own process accounted and saved its own session in the shared document",
		rootWait.reached,
		`document: ${JSON.stringify(recordsOf(rootWait.document).map(record => [record.id, record.parent, record.own]))}`,
	);
	const document = readDocument(dock.home.consumptionFile);
	const child = recordOf(document, childId);
	const root = recordOf(document, rootId);

	// The endpoint's own count is the independent fact: what really ran, and whose conversation each
	// request belonged to.
	const requests = completionRequests(dock.run.capture.requests());
	const childRequests = requests.filter(isChildRequest).length;
	const rootRequests = requests.length - childRequests;
	const usageOf = (record: SessionRecord | undefined) => storedTokens(record, PROVIDER, MODEL);
	observe(
		"the delegated task ran as its own session's requests, beside the root's own",
		childRequests > 0 && rootRequests > 0,
		`requests ${requests.length} (child ${childRequests}, root ${rootRequests})`,
	);
	observe(
		"the child's own record holds exactly the requests that really ran in it, once each",
		usageOf(child).input === childRequests * CAPTURE_USAGE.input &&
			usageOf(child).output === childRequests * CAPTURE_USAGE.output,
		`child own ${JSON.stringify(usageOf(child))} for ${childRequests} request(s)`,
	);
	observe(
		"the root's own record holds its own requests alone, with no descendant's consumption added",
		usageOf(root).input === rootRequests * CAPTURE_USAGE.input &&
			usageOf(root).output === rootRequests * CAPTURE_USAGE.output,
		`root own ${JSON.stringify(usageOf(root))} for ${rootRequests} request(s)`,
	);
	const childCost = storedCost(child, PROVIDER, MODEL);
	const rootCost = storedCost(root, PROVIDER, MODEL);
	const oneRequestLevels = [FLASH_OFF_PEAK_CNY / CAPTURE_USAGE.input, FLASH_PEAK_CNY / CAPTURE_USAGE.input];
	const perRootRequest = rootCost === undefined ? undefined : rootCost / rootRequests;
	observe(
		"every request carries this extension's own price for one reading, and the two records price it the same",
		childCost !== undefined &&
			rootCost !== undefined &&
			oneRequestLevels.some(level => Math.abs(childCost - level * CAPTURE_USAGE.input) < 1e-9) &&
			perRootRequest !== undefined &&
			Math.abs(perRootRequest - childCost / childRequests) < 1e-9,
		`child ¥${String(childCost)}, root ¥${String(rootCost)} for ${rootRequests} request(s)`,
	);
	observe(
		"the document holds the two sessions and no third accumulation",
		recordsOf(document).length === 2,
		JSON.stringify(recordsOf(document).map(record => [record.id, record.parent, record.saveVersion])),
	);
	observe(
		"the child's record states the real direct parent",
		child?.parent === rootId,
		`child parent ${JSON.stringify(child?.parent)}, root ${JSON.stringify(rootId)}`,
	);

	const launch = await launchRecord(path.join(dock.run.root.sessionDir, "subagent-artifacts"), RECORD_WAIT_MS);
	const childHeader = sessionHeader(childFile);
	observe(
		"the child session's own file names the root's file as the session it came from",
		path.resolve(childHeader?.parentSession ?? "") === path.resolve(rootFile),
		`child header ${JSON.stringify(childHeader)}, root file ${JSON.stringify(rootFile)}`,
	);
	// The provider's own launch evidence is read where it exists: it states which extensions the child
	// process really loaded, which is the fact that makes a missing child record an accounting gap
	// rather than a delegation that never ran.
	observe(
		"the child's own process really loaded this extension",
		(launch?.required ?? []).includes("model-cost"),
		launch === undefined ? "no launch record was left by this run" : JSON.stringify(launch),
	);
	return { dock, rootFile, rootId, childId, childName: child?.name ?? childSessionName(childFile) ?? childId };
}

/** The display name one session file states for its session, or `undefined` when it states none. */
function childSessionName(file: string): string | undefined {
	try {
		for (const line of readFileSync(file, "utf8").split("\n")) {
			const parsed = JSON.parse(line) as { readonly type?: string; readonly name?: unknown };
			if (parsed.type === "session_info" && typeof parsed.name === "string" && parsed.name.length > 0) return parsed.name;
		}
	} catch {
		// A file this script cannot read states nothing here.
	}
	return undefined;
}

/** The resumed root session: the tree a second process draws from the shared document. */
async function phaseResumedTree(
	dock: DockRun,
	rootFile: string,
	rootId: string,
	childName: string,
): Promise<void> {
	console.log("\nphase: a second process resumes the root session and draws the tree");
	const before = readFileSync(dock.home.consumptionFile, "utf8");
	const requestsBefore = completionRequests(dock.run.capture.requests()).length;
	const rootOwn = recordOf(readDocument(dock.home.consumptionFile), rootId)?.own;

	// The provider is loaded in this process too, as it is in the first one: `/budget detail` draws the
	// sessions this entry observed as descendants, so the entry offers that form once a provider is
	// really there — an entry whose integration is the no-subagent shape answers the notice instead.
	const extended = await openSession(dock, [CONFIG_ENTRYPOINT, PROVIDER_ENTRY], ["--session", rootFile]);
	const resumedFile = await extended.sessionFile();
	observe(
		"the second process runs the very session the first one left",
		path.resolve(resumedFile) === path.resolve(rootFile),
		`resumed ${resumedFile}, expected ${rootFile}`,
	);

	const mark = extended.frameMark();
	await extended.request({ type: "prompt", message: "/budget detail" }, UI_FRAME_TIMEOUT_MS);
	// The entry draws before its initialization's provider prefetch and store read have settled, so the
	// first Total line can be the empty reading. What this case is about is the tree the saved document
	// produces, so the frame waited for is the one that really draws the child row.
	const drawn = await extended.frameSince(
		mark,
		frame => (widgetLinesOf(frame) ?? []).some(line => line.startsWith(`  ${childName}`)),
		"a widget drawing the child session in the detail tree",
		UI_FRAME_TIMEOUT_MS,
	);
	const lines = drawn === undefined ? [] : (widgetLinesOf(drawn) ?? []);
	observe(
		"the tree carries the child session the document already holds, one step in by its direct parent",
		lines.some(line => line.startsWith(`  ${childName}`)),
		`lines ${JSON.stringify(lines)}`,
	);
	observe(
		"the resumed session's own consumption is the record the first process committed",
		lines.some(line => line.startsWith("Total:  ")) &&
			recordOf(readDocument(dock.home.consumptionFile), rootId)?.own !== undefined,
		`lines ${JSON.stringify(lines)}, root own ${JSON.stringify(rootOwn)}`,
	);
	// Reading the tree is a read: it asks the model for nothing and leaves the shared document exactly
	// as the processes before it published it.
	observe(
		"drawing the tree asked the model for nothing",
		completionRequests(dock.run.capture.requests()).length === requestsBefore,
		`requests ${requestsBefore} -> ${completionRequests(dock.run.capture.requests()).length}`,
	);
	observe(
		"drawing the tree changed nothing in the shared document",
		readFileSync(dock.home.consumptionFile, "utf8") === before,
		`document changed`,
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
		const delegation = await phaseDelegation(cli);
		await phaseResumedTree(delegation.dock, delegation.rootFile, delegation.rootId, delegation.childName);
	} finally {
		for (const session of sessions) await session.stop({ timeoutMs: 15_000 });
		for (const dock of runs) {
			dock.run.capture.stop();
			if (!keep) rmSync(dock.run.root.path, { recursive: true, force: true });
		}
	}
	console.log(`\n${observations.length} observations held, ${failures.length} required facts missing.`);
	for (const observation of observations) console.log(`  ok    ${observation.name}`);
	for (const failure of failures) console.log(`  FAIL  ${failure.name}\n        ${failure.detail}`);
	// A missing required fact is this run's own result: the record above is what the host really did,
	// and a non-zero status is how a caller sees that the contract's facts are not all produced yet.
	if (failures.length > 0) process.exitCode = 1;
}

await main();
