/**
 * Ticket 11's real-host record: the bounded close-out of a session pi is disposing, and what it
 * states about its own work when the wait ends it.
 *
 * Usage
 *   bun scripts/pi-close-out-smoke.ts                  # resolve the installed pi CLI
 *   bun scripts/pi-close-out-smoke.ts --pi <path>      # or PI_CLI=<path>
 *   bun scripts/pi-close-out-smoke.ts --keep           # keep every run root for inspection
 *
 * What it drives: the real installed pi as a child process in RPC mode, with an isolated agent state,
 * session directory, working directory and user home under the OS temp root, and a local
 * OpenAI-compatible capture endpoint declared as the provider. The extension under test is the
 * production pi assembly, loaded by pi's own loader from a discovery entrypoint of this run's own
 * layout, over a storage root of this run's own.
 *
 * What it asserts (consumer-visible behavior only; no source or wiring inspection):
 *   1. **A session whose owner this process does not serve saves locally and leaves bounded.** The
 *      session pi runs is one pi itself records as spawned from a session file nothing serves: its own
 *      request is accounted and committed by its own process into the shared document, and closing the
 *      process is answered within the framework's own close-out bound rather than waiting for the owner
 *      this process does not serve. What is measured is the whole teardown, from closing pi's stdin to
 *      its process leaving;
 *   2. **A disposal while the document is really locked is answered at the framework's own deadline.**
 *      Another process — this script — holds the coordinated lock of the very document the session's
 *      Round end has to commit into, so the save can only wait. What is measured is the wait from the
 *      instant pi was told to stop to the instant its process left: the application's own fifteen-second
 *      close-out deadline, plus this platform's scheduling of it. The operator is told the consumption
 *      was not written and that the close-out's own wait is what ended it, the document holds nothing
 *      of that session, and the ledger that really owns the lock publishes only what it always would.
 *
 * What it cannot assert here (recorded, not silently skipped): an update that had already begun when
 * the deadline arrived cannot be arranged from outside a real host — freezing a rename mid-publish is
 * not a state this script can put the extension in — so that case is held by the deterministic suites,
 * which drive real `updateFile` coordination over a real lock and a real document. POSIX and other pi
 * versions are not exercised here either.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { CapturedRequest } from "../tests/harness-dock/capture-server";
import { PI_MODEL_COST_CONFIG_ROOT_ENV } from "../tests/harness-dock/fixtures/pi-model-cost/env";
import {
	type PiCli,
	type PiRun,
	type PiRunOptions,
	PiSession,
	piVersion,
	resolvePiCli,
	startPiRun,
} from "../tests/harness-dock/pi-session";
import { updateFile } from "../framework/interface/general/files";

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

/** The version this script's expectations were written against, as the host baseline records it. */
const EXPECTED_PI_VERSION = "1.3.0";

/** The provider and model the run declares, and the harness key its records live under. */
const PROVIDER = "deepseek";
const MODEL = "deepseek-flash";
const HARNESS = "pi";

/** The document the extension keeps in its storage root. */
const CONSUMPTION_FILE = "consumption.json";

/** The usage the capture endpoint reports for every completion, as the wire numbers it sends. */
const CAPTURE_USAGE = { input: 1_000, output: 200, cacheRead: 0, cacheWrite: 0 } as const;

/**
 * The framework's own close-out budget, as the approved contract states the default: fifteen seconds,
 * counted from entering the close-out. It is this script's independent expectation — the run's own
 * numbers are never read back as the value to compare against.
 */
const CLOSE_OUT_MS = 15_000;

/** How long one prompt's run is given to settle when the script waits for it. */
const PROMPT_TIMEOUT_MS = 180_000;

/** How long one session's own commit is waited for. */
const RECORD_WAIT_MS = 60_000;

/** How long pi's own teardown is given before the script kills it; well above the close-out's own. */
const STOP_BUDGET_MS = 60_000;

/** How long the script waits for a frame or a document fact before reporting what it read instead. */
const FACT_WAIT_MS = 30_000;

/** The prompt this script's conversations begin with, so its own requests are told from pi's. */
const PROMPT = "close-out-smoke: answer with one line.";

/**
 * How long a continuation of that conversation is held: the window this script acts in, long enough to
 * cover the close-out's own deadline plus the teardown after it and no longer, so the held answer is
 * not itself what keeps this script's process alive.
 */
const HELD_ANSWER_MS = 45_000;

/** The one built-in tool a held Round is kept open with: a read of a file this run wrote. */
const HELD_TOOL = "read";

const observations: Array<{ readonly name: string; readonly detail: string }> = [];
const failures: Array<{ readonly name: string; readonly detail: string }> = [];
const runs: DockRun[] = [];
const sessions: PiSession[] = [];

/**
 * Records one observation: the facts this run could read are held, and a fact it could not read is held
 * as a failure and the run goes on. Raw material travels with both, because what the host really did is
 * the evidence either way.
 */
function observe(name: string, ok: boolean, detail: string): void {
	if (ok) {
		observations.push({ name, detail });
		console.log(`  ok    ${name}\n        ${detail}`);
		return;
	}
	failures.push({ name, detail });
	console.log(`  FAIL  ${name}\n        ${detail}`);
}

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

/** The configuration root one run binds the production assembly to: a throwaway repository layout. */
function configRootFor(home: IsolatedHome, label: string): string {
	const root = mkdtempSync(path.join(tmpdir(), `pi-close-out-config-${label}-`));
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

/** One fresh run root with a capture endpoint behind it, over its own models file and layout. */
function startDockRun(cli: PiCli, label: string, endpoint: PiRunOptions["endpoint"]): DockRun {
	const run = startPiRun(cli, label, {
		provider: PROVIDER,
		model: MODEL,
		cost: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 },
		endpoint,
	});
	const home = isolateHome(run.root.path);
	const dock: DockRun = { run, home, configRoot: configRootFor(home, label) };
	runs.push(dock);
	return dock;
}

/** One session over one run's isolated state, loading exactly the extension the case names. */
async function openSession(dock: DockRun, extraArgs: readonly string[] = []): Promise<PiSession> {
	const session = await PiSession.start({
		cli: dock.run.cli,
		runRoot: dock.run.root,
		entrypoint: [CONFIG_ENTRYPOINT],
		selector: dock.run.selector,
		extraArgs,
		env: { ...dock.home.env, [PI_MODEL_COST_CONFIG_ROOT_ENV]: dock.configRoot },
	});
	sessions.push(session);
	return session;
}

/** Whether one parsed value is a record this script may read a field from. */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One session record of the consumption document, as far as this script reads one. */
interface ReadRecord {
	readonly id: string;
	/** One provider/model pair's token buckets, read for the amounts this script's own usage makes. */
	readonly buckets: Readonly<Record<string, Readonly<Record<string, Record<string, number>>>>>;
}

/**
 * The records one parsed document holds for this harness, read through guards rather than assumed.
 *
 * The wire document is another process's file: a shape this script cannot read is answered as no
 * records at all, which is what the observations below report on rather than a cast that would read
 * whatever happens to be there.
 */
function recordsIn(parsed: unknown, harness: string): readonly ReadRecord[] {
	if (!isRecord(parsed) || !isRecord(parsed.harnesses)) return [];
	const bucket = parsed.harnesses[harness];
	if (!isRecord(bucket) || !Array.isArray(bucket.sessions)) return [];
	const records: ReadRecord[] = [];
	for (const candidate of bucket.sessions) {
		if (!isRecord(candidate) || typeof candidate.id !== "string") continue;
		const buckets: Record<string, Record<string, Record<string, number>>> = {};
		if (isRecord(candidate.own)) {
			for (const [provider, models] of Object.entries(candidate.own)) {
				if (!isRecord(models)) continue;
				for (const [model, consumption] of Object.entries(models)) {
					if (!isRecord(consumption) || !isRecord(consumption.tokens)) continue;
					const tokens: Record<string, number> = {};
					for (const [name, amount] of Object.entries(consumption.tokens)) {
						if (typeof amount === "number") tokens[name] = amount;
					}
					(buckets[provider] ??= {})[model] = tokens;
				}
			}
		}
		records.push({ id: candidate.id, buckets });
	}
	return records;
}

/** The records the document at `file` holds for this harness, or none while it holds no document. */
function recordsOnDisk(file: string): readonly ReadRecord[] {
	if (!existsSync(file)) return [];
	try {
		return recordsIn(JSON.parse(readFileSync(file, "utf8")), HARNESS);
	} catch {
		return [];
	}
}

/** The one record the document at `file` holds for `id`, or `undefined` when it holds none. */
function recordOnDisk(file: string, id: string): ReadRecord | undefined {
	return recordsOnDisk(file).find(record => record.id === id);
}

/** One record's stored reading of one bucket in one provider/model pair. */
function storedTokens(record: ReadRecord | undefined, provider: string, model: string): Record<string, number> {
	return record?.buckets[provider]?.[model] ?? {};
}

/**
 * Waits until the document holds a record for one session, and answers with what it read either way.
 *
 * `reached` is whether it appeared inside the budget; a run that never saw it still answers with what
 * the file holds, because what the host really published is the evidence.
 */
async function documentWithRecord(
	file: string,
	id: string,
	timeoutMs: number,
): Promise<{ readonly record: ReadRecord | undefined; readonly reached: boolean }> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const record = recordOnDisk(file, id);
		if (record !== undefined) return { record, reached: true };
		if (Date.now() > deadline) return { record, reached: false };
		await Bun.sleep(200);
	}
}

/** One session file's own header: the identity pi stated for it and the file it was spawned from. */
function sessionHeader(file: string): { readonly id?: string; readonly parentSession?: string } {
	try {
		const [firstLine] = readFileSync(file, "utf8").split("\n", 1);
		const parsed: unknown = JSON.parse(firstLine ?? "");
		if (!isRecord(parsed)) return {};
		return {
			...(typeof parsed.id === "string" ? { id: parsed.id } : {}),
			...(typeof parsed.parentSession === "string" ? { parentSession: parsed.parentSession } : {}),
		};
	} catch {
		return {};
	}
}

/** The text one message content carries, as the two shapes a provider sends it in. */
function textOf(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content.map(part => (isRecord(part) && typeof part.text === "string" ? part.text : "")).join(" ");
}

/** The messages one captured request's body carries, if it carries a conversation at all. */
function messagesOf(request: CapturedRequest): readonly unknown[] {
	const body: unknown = request.json;
	if (!isRecord(body) || !Array.isArray(body.messages)) return [];
	return body.messages;
}

/** The text of one request's first user message: the conversation that request belongs to. */
function firstUserText(request: CapturedRequest): string {
	const first = messagesOf(request).find(message => isRecord(message) && message.role === "user");
	return isRecord(first) ? textOf(first.content) : "";
}

/**
 * The completion requests this endpoint really answered, in arrival order.
 *
 * The endpoint records every path it serves — the extension's own balance query among them — so a count
 * of what the model really ran is a count of the requests that carried a conversation.
 */
function completionRequests(requests: readonly CapturedRequest[]): readonly CapturedRequest[] {
	return requests.filter(request => messagesOf(request).length > 0);
}

/**
 * Waits until this conversation's own requests reach `count`, held answers included: the endpoint
 * records an arrival before it answers, which is what makes a request the harness is still waiting on
 * observable here.
 */
async function conversationRequests(run: PiRun, count: number, timeoutMs: number): Promise<CapturedRequest[]> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const mine = completionRequests(run.capture.requests()).filter(request => firstUserText(request).includes(PROMPT));
		if (mine.length >= count) return mine;
		if (Date.now() > deadline) return mine;
		await Bun.sleep(100);
	}
}

/** One session file written the way pi writes one: the header line is the whole file. */
function writeSessionFile(file: string, header: Record<string, unknown>): void {
	mkdirSync(path.dirname(file), { recursive: true });
	writeFileSync(file, `${JSON.stringify(header)}\n`, "utf8");
}

/**
 * One session whose owner this process does not serve: its own request is accounted and committed
 * locally, and closing the process is bounded by the framework rather than by the absent owner.
 */
async function phaseOwnerAbsent(cli: PiCli): Promise<void> {
	console.log("\nphase: a session whose owner no process serves, disposed normally");
	const dock = startDockRun(cli, "owner-absent", { usage: CAPTURE_USAGE, replyText: "close-out-smoke-reply" });
	// The session this run is given is one pi records as spawned from another session file: the parent
	// belongs to an owner served by some other process, and no process serves it here — the shape a
	// spawned session has when the process that spawned it is already gone. Nothing about this run
	// serves that owner, so nothing here can confirm, synchronise or draw anything for it.
	const parentFile = path.join(dock.run.root.path, "absent-owner", "parent.jsonl");
	writeSessionFile(parentFile, { type: "session", id: "pi-close-out-absent-owner", cwd: dock.run.root.workDir });
	const childFile = path.join(dock.run.root.path, "absent-owner", "child.jsonl");
	const childId = "pi-close-out-owner-absent";
	writeSessionFile(childFile, {
		type: "session",
		id: childId,
		parentSession: parentFile,
		cwd: dock.run.root.workDir,
	});

	const session = await openSession(dock, ["--session", childFile, "--name", childId]);
	const runningFile = await session.sessionFile();
	observe(
		"pi really runs the session this run stated, spawned from a session nothing serves",
		sessionHeader(runningFile)?.id === childId && sessionHeader(runningFile)?.parentSession !== undefined,
		`pi's session file ${runningFile}, header ${JSON.stringify(sessionHeader(runningFile))}`,
	);

	await session.run(PROMPT, PROMPT_TIMEOUT_MS);
	const committed = await documentWithRecord(dock.home.consumptionFile, childId, RECORD_WAIT_MS);
	const own = storedTokens(committed.record, PROVIDER, MODEL);
	const ran = completionRequests(dock.run.capture.requests()).filter(request => firstUserText(request).includes(PROMPT)).length;
	observe(
		"its own process accounted its own request and committed it to the shared document",
		committed.reached && own?.input === ran * CAPTURE_USAGE.input && own?.output === ran * CAPTURE_USAGE.output,
		`record own ${JSON.stringify(own)} for ${ran} request(s)`,
	);

	const mark = session.frameMark();
	const startedAt = performance.now();
	const exit = await session.stop({ timeoutMs: STOP_BUDGET_MS });
	const closedIn = performance.now() - startedAt;
	observe(
		"closing that process was answered by the framework, not by the owner nothing serves",
		exit.timedOut === false && exit.exitCode === 0 && closedIn < CLOSE_OUT_MS + 10_000,
		`pi left after ${closedIn.toFixed(0)}ms (exit ${String(exit.exitCode)}, timedOut ${String(exit.timedOut)}); ` +
			`the framework's own close-out budget is ${CLOSE_OUT_MS}ms`,
	);
	const notices = session.notificationsSince(mark);
	observe(
		"nothing was reported as unwritten or unconfirmed for a session whose work had already been committed",
		!notices.some(message => message.includes("没有写入") || message.includes("未确认")),
		`notices ${JSON.stringify(notices)}`,
	);
}

/**
 * One disposal while the document is really locked by another process: the wait the close-out gives the
 * commit is real time, the deadline is what ends it, and the document proves nothing was written.
 */
async function phaseLockedDisposal(cli: PiCli): Promise<void> {
	console.log("\nphase: a disposal while another process really holds the document's lock");
	// The first request of this conversation is answered with a tool call, so the host runs the tool and
	// continues inside the same Round: the consumption of that first response is accounted and not yet
	// committed, and the Round is still open when the session is stopped. Every later request of the
	// conversation is held unanswered, so the host is genuinely waiting on the provider when it is told
	// to stop.
	let answered = 0;
	const heldToolFile = path.join(tmpdir(), `pi-close-out-tool-${process.pid}.txt`);
	writeFileSync(heldToolFile, "close-out-smoke\n", "utf8");
	const dock = startDockRun(cli, "locked-disposal", {
		usage: CAPTURE_USAGE,
		replyText: "close-out-smoke-reply",
		respond: request => {
			if (!firstUserText(request).includes(PROMPT)) return undefined;
			answered += 1;
			return answered === 1
				? { toolCall: { name: HELD_TOOL, arguments: JSON.stringify({ path: heldToolFile }) } }
				: { answerDelayMs: HELD_ANSWER_MS };
		},
	});
	const session = await openSession(dock);
	// This script's own process takes the document's coordinated lock and does not give it back until the
	// measurement is over: what the session's own commit meets is a real cross-process holder.
	const holderRelease = Promise.withResolvers<void>();
	const holding = updateFile(
		dock.home.consumptionFile,
		async () => {
			await holderRelease.promise;
			return { held: "the writer that owns the lock" };
		},
		{ timeoutMs: 5_000 },
	);

	const mark = session.frameMark();
	await session.request({ type: "prompt", message: PROMPT }, PROMPT_TIMEOUT_MS);
	const requests = await conversationRequests(dock.run, 2, FACT_WAIT_MS);
	// pi writes a session file lazily, so the identity it stated for this run is read now that a turn
	// has really begun.
	const sessionId = sessionHeader(await session.sessionFile()).id;
	if (sessionId === undefined) throw new Error("pi reported no session file for the run this script started");
	observe(
		"the Round was still open when the session was stopped, with consumption accounted and uncommitted",
		requests.length >= 2 && recordOnDisk(dock.home.consumptionFile, sessionId) === undefined,
		`requests ${requests.length}, records in the document ${JSON.stringify(recordsOnDisk(dock.home.consumptionFile))}`,
	);

	const startedAt = performance.now();
	const exit = await session.stop({ timeoutMs: STOP_BUDGET_MS });
	const closedIn = performance.now() - startedAt;
	// The application's deadline is the framework's own budget; what this platform adds is its own
	// scheduling of a real wait plus pi's teardown, and both are reported rather than assumed.
	observe(
		"the disposal was answered at the framework's own close-out deadline, and the process really left",
		exit.timedOut === false && closedIn >= CLOSE_OUT_MS - 100 && closedIn < CLOSE_OUT_MS + 5_000,
		`pi left after ${closedIn.toFixed(0)}ms (exit ${String(exit.exitCode)}, timedOut ${String(exit.timedOut)}), ` +
			`which is the ${CLOSE_OUT_MS}ms application deadline plus ${(closedIn - CLOSE_OUT_MS).toFixed(0)}ms of ` +
			"this platform's scheduling and teardown",
	);
	const notices = session.notificationsSince(mark);
	observe(
		"the operator was told the consumption was not written, and that the close-out's own wait ended it",
		notices.some(message => message.includes("没有写入") && message.includes("收口等待") && message.includes(`${CLOSE_OUT_MS}ms`)),
		`notices ${JSON.stringify(notices)}`,
	);
	observe(
		"no notice claims that consumption was saved",
		!notices.some(message => message.includes("已保存") || message.includes("保存成功") || message.includes("写入成功")),
		`notices ${JSON.stringify(notices)}`,
	);
	// Nothing of that session reached the file: the document does not exist at all, because the only
	// commit this session ever owed is the one the lock held back.
	observe(
		"the document holds nothing of that session",
		recordsOnDisk(dock.home.consumptionFile).length === 0,
		`records ${JSON.stringify(recordsOnDisk(dock.home.consumptionFile))} at ${dock.home.consumptionFile}`,
	);

	// The writer that really owns the lock publishes when it is done, and what it publishes is what the
	// file then holds: no early release took its lock, and the published document is the authority.
	holderRelease.resolve();
	const published = await holding;
	observe(
		"the lock was never released for the holder, and its own published document is what the file holds",
		published.held === "the writer that owns the lock" &&
			readFileSync(dock.home.consumptionFile, "utf8").includes("the writer that owns the lock"),
		`published ${JSON.stringify(published)}, file ${readFileSync(dock.home.consumptionFile, "utf8")}`,
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

	try {
		await phaseOwnerAbsent(cli);
		await phaseLockedDisposal(cli);
	} finally {
		for (const session of sessions) await session.stop({ timeoutMs: 15_000 });
		for (const dock of runs) {
			dock.run.capture.stop();
			if (!keep) rmSync(dock.run.root.path, { recursive: true, force: true });
		}
	}
	console.log(`\n${observations.length} observations held, ${failures.length} required facts missing.`);
	for (const observation of observations) console.log(`  - ${observation.name}`);
	for (const failure of failures) console.log(`  FAIL  ${failure.name}: ${failure.detail}`);
	if (failures.length > 0) process.exitCode = 1;
}

await main();
