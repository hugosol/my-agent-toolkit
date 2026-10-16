/**
 * model-cost on the real pi CLI: the loading entrypoint, the main session's accounting and saving,
 * the operator command, the applicable provider feature and the storage root's own rules, observed
 * end to end over pi's RPC protocol.
 *
 * Usage
 *   bun scripts/pi-model-cost-smoke.ts                  # resolve the installed pi CLI
 *   bun scripts/pi-model-cost-smoke.ts --pi <path>      # or PI_CLI=<path>: the package's
 *                                                       # dist/bundle/cli.js, a pi.cmd/pi shim, or the binary
 *   bun scripts/pi-model-cost-smoke.ts --keep           # keep every run root for inspection
 *
 * What it drives: the real installed pi as a child process in RPC mode with
 * `--no-extensions -e entrypoints/pi/model-cost.ts --no-mcp`, an isolated agent state, session
 * directory, working directory and user home under the OS temp root, and a local
 * OpenAI-compatible capture endpoint (the dock's `capture-server.ts`) declared as the `deepseek`
 * provider through the run's own `models.json`. The default agent state, the formal configuration and
 * any running agent are never touched, no real credential is read and no repository file is written.
 * Every phase gets its own run root, so the phases are independent and the smoke is repeatable.
 *
 * What it asserts (consumer-visible behavior only; no source or wiring inspection):
 *   1. **The set of turns an ordinary session produced is billed from the real loading path.** The
 *      entrypoint is discovered and loaded by pi's own loader, the extension binds, its initialization
 *      makes the provider query before the first model request, and each of the session's turns is
 *      accounted once and saved at its Round's end — the stored buckets and the amount being this
 *      script's own arithmetic on what the endpoint reported and the maintained off-peak flash prices
 *      (see `EXCHANGE_TOKENS` / `EXCHANGE_COST_CNY`);
 *   2. **A later process reads the same root back and continues it.** A second process of the same run
 *      root shows the accumulated total in its own widget and adds to it rather than starting over;
 *   3. **A non-reset operator command keeps its declared effect.** `/budget detail` announces the form
 *      it switched to, changes what the widget draws, asks the model for nothing and writes no file;
 *      an argument the declaration does not name is refused by the framework's own routing;
 *   4. **The provider feature this mode needs is wired.** The DeepSeek balance the extension queries
 *      for itself is answered and shown on the widget: the query really leaves the process at the
 *      host's resolved address with the host's current credential and the framework's own business
 *      budget, the initialization's prefetch reaches the endpoint before the first model request does,
 *      and a settled request of that provider is the only thing that refreshes a reading past its
 *      success TTL — an expired reading on its own queries nothing, a refused refresh keeps the
 *      reading and its amount rather than a zero, a provider the host cannot authenticate is asked
 *      nothing and accused of nothing, and a query still out is joined by the triggers that follow it
 *      instead of being issued twice — with the credential it authenticates with being the one the
 *      host's own configuration states for that process. All of it with one extension loaded and no
 *      subagent provider present;
 *   5. **`storageDir` keeps its existing interpretation on this host**: an absolute value is used as
 *      it is, a relative one resolves against the extension's own configuration directory rather than
 *      the process's working directory, the field's `~/` means the user's `.omp` home, two runs with
 *      different working directories and the same configuration resolve to the same root, and no
 *      directory the field does not name is ever written;
 *   6. **An illegal configuration refuses the whole extension** instead of silently changing a rule:
 *      the framework's own diagnostic names the extension and the session keeps running without it,
 *      with no widget, no provider query and no file written anywhere.
 *
 * What it cannot assert here (recorded, not silently skipped):
 *   - the TUI drawing of the widget stays human-led: over RPC this script observes the `setWidget`
 *     frames the real frontend published, which is the automated face of that surface and not the
 *     terminal's readability;
 *   - the season boundary's redraw over time (a timer's effect) is not exercised;
 *   - a subagent's own execution duration is not read by this adapter yet, so this script asserts
 *     nothing about it;
 *   - the DeepSeek endpoint's answers are this fixture's own document: they are not evidence about a
 *     real account, and no paid call is made.
 *
 * The expected amount is the maintained data's own off-peak flash prices applied by this script's
 * arithmetic, exactly as the OMP dock's accounting suite states them; nothing here is computed by
 * calling the extension's own pricing code.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { type PiCli, PiSession, type PiRun, piVersion, resolvePiCli, startPiRun, writePiModels } from "../tests/harness-dock/pi-session";
import type { CaptureServerOptions, CapturedBalanceCall } from "../tests/harness-dock/capture-server";
import { PI_MODEL_COST_CONFIG_ROOT_ENV } from "../tests/harness-dock/fixtures/pi-model-cost/env";

/** The repository root: this script lives in `scripts/`. */
const REPO_ROOT = path.resolve(import.meta.dir, "..");

/** The extension's own pi entrypoint, as pi's loader discovers it. */
const ENTRYPOINT = path.join(REPO_ROOT, "entrypoints", "pi", "model-cost.ts");

/** The version this smoke's expectations were written against. */
const EXPECTED_PI_VERSION = "1.2.0";

/** The provider and model the runs declare: the official pair the maintained data prices in CNY. */
const PROVIDER = "deepseek";
const MODEL = "deepseek-flash";

/** The document the extension keeps in its storage root, and the widget key its frontend draws under. */
const CONSUMPTION_FILE = "consumption.json";
const WIDGET_KEY = "z-model-cost";

/** The usage the capture endpoint reports for every completion, as the wire numbers it sends. */
const CAPTURE_USAGE = { input: 10, output: 7, cacheRead: 3 };

/**
 * The session's own consumption of one exchange, as this script's arithmetic on what the endpoint
 * reported and the maintained off-peak flash prices (input 1, cacheRead 0.02, output 4 CNY per million
 * tokens) at the holiday period each isolated baseline states.
 *
 * The endpoint reports a prompt of 10 tokens with 3 of them cached, so the buckets the extension
 * stores keep the cached ones apart from the non-cached input: input 7, cacheRead 3, output 7 — and
 * 7/1e6·1 + 3/1e6·0.02 + 7/1e6·4 = 0.00003506 CNY.
 */
const EXCHANGE_TOKENS = { input: 7, cacheRead: 3, cacheWrite: 0, output: 7 };
const EXCHANGE_COST_CNY = 0.00003506;

/** The balance the capture endpoint answers the extension's own query with. */
const BALANCE_TOTAL = "110.00";

/** The text the endpoint answers a completion with, so a turn completes without a real model. */
const REPLY_TEXT = "pi model-cost smoke reply";

/** The two prompts the accounting phase runs, in one session. */
const PROMPT_ONE = "one exchange the extension must account";
const PROMPT_TWO = "a second exchange in the same session";

/** How long a just-issued command's UI frame may take to arrive before it counts as absent. */
const UI_FRAME_TIMEOUT_MS = 5_000;

/**
 * The credential the balance phase's `deepseek` provider declares, and the one its other provider carries.
 *
 * Both are this smoke's own synthetic literals: the balance phase searches every surface a run produces
 * for the first one, so nothing real may be used for it, and the second keeps a run's model working when
 * the balance provider deliberately has no accessible credential.
 */
const BALANCE_SENTINEL_KEY = "SYNTHETIC-PI-BALANCE-SENTINEL-6c1a-DO-NOT-LEAK";
const MODEL_ONLY_CREDENTIAL = "pi-smoke-model-key";
/** The credential a later process of the same storage root declares for the same provider. */
const BALANCE_REPLACED_KEY = "SYNTHETIC-PI-BALANCE-REPLACED-9d47-DO-NOT-LEAK";

/**
 * The one model the balance phase's runs declare in pi's own `models.json`.
 *
 * Both providers of a balance run declare it — the one the session's requests reach and the one whose
 * balance the extension queries — so a case's provider and the balance's provider resolve the same
 * endpoint when they are the same name and when they are not.
 */
const DECLARED_MODEL = {
	id: MODEL,
	name: `pi smoke ${MODEL}`,
	reasoning: false,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 128_000,
	maxTokens: 8192,
};

/** The balance the held case's endpoint answers with: unlike the other cases' amount, so a late answer is recognizable. */
const BALANCE_JOINED_TOTAL = "77.00";

/** The provider the no-credential case's model requests run on, so `deepseek` itself stays unused. */
const MODEL_ONLY_PROVIDER = "probe-provider";

/**
 * How long a real run is left idle to show that one arrival did NOT happen in that time.
 *
 * The smoke's only duration of this kind: "an expired reading queries nothing on its own" and "a
 * trigger that arrives while a query is out issues nothing" are claims about a real child process,
 * whose progress is real time, and the window is what gives a call that would be made the time to
 * arrive. Every case that uses it keeps running afterwards, which is what shows the run was idle
 * rather than stalled.
 */
const IDLE_WINDOW_MS = 2_500;

/** The shorter window for one whose call could only be issued immediately: an already-delivered trigger. */
const SETTLED_WINDOW_MS = 1_000;

// ---------------------------------------------------------------------------
// Observations
// ---------------------------------------------------------------------------

interface Observation {
	readonly name: string;
	readonly detail: string;
}

const observations: Observation[] = [];
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

/** One run's isolated user home, and the storage root the shipped configuration names inside it. */
interface IsolatedHome {
	readonly path: string;
	readonly storageDirectory: string;
	readonly consumptionFile: string;
	/** The environment values that make the child resolve this home rather than the operator's. */
	readonly env: Record<string, string>;
}

/** One provisioned run: the isolated root, the capture endpoint and the session's home. */
interface DockRun {
	readonly run: PiRun;
	readonly home: IsolatedHome;
	readonly sessions: PiSession[];
}

/** The isolated user home of one run: `<run root>/user-home`, with the OMP home inside it. */
function isolateHome(runRoot: string): IsolatedHome {
	const home = path.join(runRoot, "user-home");
	const storageDirectory = path.join(home, ".omp", "cost-archive");
	mkdirSync(storageDirectory, { recursive: true });
	return {
		path: home,
		storageDirectory,
		consumptionFile: path.join(storageDirectory, CONSUMPTION_FILE),
		env: {
			USERPROFILE: home,
			HOME: home,
			HOMEDRIVE: path.parse(home).root,
			HOMEPATH: home.slice(path.parse(home).root.length - 1),
		},
	};
}

/** The document one isolated root starts with: a known period, in its holiday season. */
function baselineDocument(periodId: string): string {
	return JSON.stringify({
		schemaVersion: 1,
		periodId,
		start: "2026-10-01T00:00:00.000Z",
		holiday: true,
		harnesses: { pi: { sessions: [] } },
	});
}

/** One provisioned run: a fresh root, a capture endpoint declared as the provider, and a user home. */
function startDockRun(cli: PiCli, label: string, options: { readonly baseline?: boolean } = {}): DockRun {
	const run = startPiRun(cli, label, {
		provider: PROVIDER,
		model: MODEL,
		endpoint: { replyText: REPLY_TEXT, usage: CAPTURE_USAGE, balance: { total: BALANCE_TOTAL } },
	});
	const home = isolateHome(run.root.path);
	// The baseline document is the accounting cases' own setup: it fixes a known period and its holiday
	// season so the expected amount is this script's arithmetic. A case that observes where the storage
	// root itself lands states no baseline, so that the file it finds is one the extension wrote.
	if (options.baseline !== false) writeFileSync(home.consumptionFile, baselineDocument(`period-${label}`), "utf8");
	const dock: DockRun = { run, home, sessions: [] };
	runs.push(dock);
	return dock;
}

/**
 * One session over the run's isolated state.
 *
 * The extension set is the production entrypoint alone unless a case names another one, which is what
 * keeps "this extension was discovered and loaded" an observation about pi's own loader rather than
 * about a fixture.
 */
async function openSession(
	dock: DockRun,
	options: { readonly entrypoint?: string; readonly extraEnv?: Record<string, string | undefined> } = {},
): Promise<PiSession> {
	const session = await PiSession.start({
		cli: dock.run.cli,
		runRoot: dock.run.root,
		entrypoint: options.entrypoint ?? ENTRYPOINT,
		selector: dock.run.selector,
		env: { ...dock.home.env, ...options.extraEnv },
	});
	dock.sessions.push(session);
	sessions.push(session);
	return session;
}

// ---------------------------------------------------------------------------
// The balance phase's own runs
// ---------------------------------------------------------------------------

/** What one balance-phase run declares: the model's provider and the balance provider's credential. */
interface BalanceRunOptions {
	/** The provider the session's model requests run on; `deepseek` unless a case states another. */
	readonly modelProvider?: string;
	/** The credential the `deepseek` provider carries; omitted declares it with none at all. */
	readonly deepseekCredential?: string;
	/** The capture endpoint's balance answers. */
	readonly balance?: CaptureServerOptions["balance"];
}

/**
 * One run for the balance phase: the capture endpoint behind it, an isolated home, and a `models.json`
 * this phase states itself.
 *
 * The dock's own `startPiRun` declares the one provider the session runs and one built-in credential.
 * This phase needs two more freedoms, and states both through the same `models.json` the dock's other pi
 * runs use: a credential of its own synthetic literal, so that its absence everywhere else in a run is
 * meaningful, and a second provider carrying that credential when the balance's provider must have none —
 * which is what makes "a host with no access to `deepseek` asks it nothing" an observation about
 * `deepseek` rather than about a run that has no usable model at all.
 */
function startBalanceRun(cli: PiCli, label: string, options: BalanceRunOptions = {}): DockRun {
	const modelProvider = options.modelProvider ?? PROVIDER;
	const run = startPiRun(cli, label, {
		provider: modelProvider,
		model: MODEL,
		endpoint: {
			replyText: REPLY_TEXT,
			usage: CAPTURE_USAGE,
			...(options.balance === undefined ? {} : { balance: options.balance }),
		},
	});
	// The provider the session's own requests reach, and — when the balance's provider is another one —
	// that provider too, with the credential this case states or with none; both declare the one model.
	const credential = modelProvider === PROVIDER ? options.deepseekCredential : MODEL_ONLY_CREDENTIAL;
	writePiModels(run.root.agentDir, {
		[modelProvider]: {
			baseUrl: run.capture.baseUrl,
			api: "openai-completions",
			...(credential === undefined ? {} : { apiKey: credential }),
			models: [DECLARED_MODEL],
		},
		...(modelProvider === PROVIDER
			? {}
			: {
					[PROVIDER]: {
						baseUrl: run.capture.baseUrl,
						api: "openai-completions",
						...(options.deepseekCredential === undefined ? {} : { apiKey: options.deepseekCredential }),
						models: [DECLARED_MODEL],
					},
				}),
	});
	const home = isolateHome(run.root.path);
	const dock: DockRun = { run, home, sessions: [] };
	runs.push(dock);
	return dock;
}

/**
 * The balance calls one run's endpoint has received once there are at least `atLeast` of them.
 *
 * The query is background work: the exchange that triggered it finishes first, so a case waits for the
 * arrival itself rather than for a duration, and the deadline only keeps an arrival that never happened
 * from hanging the run.
 */
async function waitForBalanceCalls(
	dock: DockRun,
	atLeast: number,
	deadlineMs = 20_000,
): Promise<readonly CapturedBalanceCall[]> {
	const deadline = Date.now() + deadlineMs;
	for (;;) {
		const calls = dock.run.capture.balanceCalls();
		if (calls.length >= atLeast) return calls;
		if (Date.now() > deadline) {
			throw new Error(
				`the balance endpoint received ${calls.length} call(s); ${atLeast} were expected (arrivals: ${dock.run.capture.arrivals().join(",")})`,
			);
		}
		await queuedWorkSettled();
	}
}

/**
 * Lets a real run go on for `windowMs` and reports how many balance calls the endpoint had by then.
 *
 * This is how a case shows that a call did NOT happen: with a reading the case has just seen obtained —
 * or with a query the case knows is still out — the window is what gives a call that would be made the
 * time to reach the endpoint. A run that was merely stalled fails the check that follows instead.
 */
async function idleWindow(dock: DockRun, windowMs: number): Promise<number> {
	const deadline = Date.now() + windowMs;
	while (Date.now() < deadline) await Bun.sleep(25);
	return dock.run.capture.balanceCalls().length;
}

// ---------------------------------------------------------------------------
// Reading back what the run produced
// ---------------------------------------------------------------------------

/** One provider/model pair's own accumulation, as the document carries it. */
interface OwnEntry {
	readonly tokens: Readonly<Record<string, number>>;
	readonly costCny?: number;
}

/** One session record of the extension's consumption document. */
interface SessionRecord {
	readonly id: string;
	readonly name: string;
	readonly parent: string | null;
	readonly saveVersion: number;
	readonly own: Readonly<Record<string, Readonly<Record<string, OwnEntry>>>>;
}

/** The extension's consumption document, as a case reads it back. */
interface ConsumptionDocument {
	readonly schemaVersion: number;
	readonly periodId: string;
	readonly start: string;
	readonly holiday: boolean;
	readonly harnesses: Readonly<Record<string, { readonly sessions: readonly SessionRecord[] }>>;
}

/** The document one file holds right now, or `undefined` while it holds none or holds an unreadable one. */
function readDocument(file: string): ConsumptionDocument | undefined {
	try {
		return JSON.parse(readFileSync(file, "utf8")) as ConsumptionDocument;
	} catch {
		return undefined;
	}
}

/** Every session record a document holds, whichever harness bucket it sits under. */
function sessionsOf(document: ConsumptionDocument): SessionRecord[] {
	return Object.values(document.harnesses).flatMap(bucket => [...bucket.sessions]);
}

/** The document a run's own storage root holds, or `undefined` while it holds none. */
function documentOf(dock: DockRun, directory: string = dock.home.storageDirectory): ConsumptionDocument | undefined {
	return readDocument(path.join(directory, CONSUMPTION_FILE));
}

/** Lets the event loop turn over until nothing already queued is left. */
async function queuedWorkSettled(): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>();
	setImmediate(resolve);
	await promise;
}

/**
 * Waits until a file holds what a case expects of it, and answers with the parsed document.
 *
 * A Round's end save is dispatched without anyone waiting for the promise it returns, so the write
 * lands a few event-loop turns after the exchange completes. The wait is on the document's content
 * rather than on a duration, and the deadline only keeps a write that never happened from hanging the
 * case.
 */
async function savedDocument(file: string, accept: (document: ConsumptionDocument) => boolean): Promise<ConsumptionDocument> {
	const deadline = Date.now() + 15_000;
	for (;;) {
		const document = readDocument(file);
		if (document !== undefined && accept(document)) return document;
		if (Date.now() > deadline) throw new Error(`no consumption document the case expects was published in ${file}`);
		await queuedWorkSettled();
	}
}

/** Every file under one directory, relative and sorted; an absent directory answers nothing. */
function filesUnder(directory: string): string[] {
	if (!existsSync(directory)) return [];
	const found: string[] = [];
	const walk = (current: string): void => {
		for (const entry of readdirSync(current, { withFileTypes: true })) {
			const full = path.join(current, entry.name);
			if (entry.isDirectory()) walk(full);
			else found.push(path.relative(directory, full).replace(/\\/g, "/"));
		}
	};
	walk(directory);
	return found.sort();
}

/**
 * Every file under one directory, as the text a case can search for something that must not be there.
 *
 * The extension publishes through the framework's coordinated update, whose last step renames a
 * same-directory temporary document over the target: a name this walk listed can therefore be gone by
 * the time it is read — the very file the rename published *is* the target, which the same walk reads —
 * so an entry that disappeared in between is skipped rather than reported as a read failure.
 */
function fileTextsUnder(directory: string): string[] {
	return filesUnder(directory).flatMap(relative => {
		try {
			return [readFileSync(path.join(directory, relative), "utf8")];
		} catch (error) {
			if ((error as { readonly code?: unknown } | null)?.code !== "ENOENT") throw error;
			return [];
		}
	});
}

/** The widget lines one frame published, or nothing when the frame carries none. */
function widgetLinesOf(frame: { readonly [key: string]: unknown }): string[] | undefined {
	const lines = frame.widgetLines;
	return Array.isArray(lines) ? lines.map(line => String(line)) : undefined;
}

/** Every widget rendering this session published for this extension's own key, in arrival order. */
function widgetRenders(session: PiSession): string[][] {
	return session
		.frames()
		.filter(
			frame =>
				frame.type === "extension_ui_request" && frame.method === "setWidget" && frame.widgetKey === WIDGET_KEY,
		)
		.map(frame => widgetLinesOf(frame) ?? []);
}

/** Whether any widget rendering this session published contains `text`. */
function widgetShows(session: PiSession, text: string): boolean {
	return widgetRenders(session).some(lines => lines.some(line => line.includes(text)));
}

// ---------------------------------------------------------------------------
// Phase 1: loading, the main session's accounting, the save and the read-back
// ---------------------------------------------------------------------------

async function phaseMainSession(cli: PiCli): Promise<void> {
	console.log("\nphase: pi discovers the entrypoint, accounts the session's turns and saves them");
	const dock = startDockRun(cli, "main-session");
	const session = await openSession(dock);
	const firstTurn = await session.run(PROMPT_ONE);
	observe(
		"a plain prompt starts a run on the loaded extension and settles",
		firstTurn === "started",
		`pi reported disposition ${JSON.stringify(firstTurn)}`,
	);
	// A second exchange in the same session, which is also what lets the first Round's own end be
	// confirmed and its save land.
	await session.run(PROMPT_TWO);

	// The loading evidence: this binding produced a widget at all, and initialization reached the
	// provider query before any model request did.
	observe(
		"the loaded extension drew its own widget in this session",
		widgetRenders(session).length > 0,
		`setWidget frames for ${WIDGET_KEY}: ${widgetRenders(session).length}`,
	);
	observe(
		"the widget shows the brief form's total row after the turns",
		widgetShows(session, "Total:  "),
		`last rendering: ${JSON.stringify(widgetRenders(session)[widgetRenders(session).length - 1])}`,
	);
	observe(
		"nothing was reported as a refused binding",
		!session.stderr().includes("extension not bound"),
		`stderr: ${JSON.stringify(session.stderr())}`,
	);
	observe(
		"the extension's own provider query left the process before the first model request",
		dock.run.capture.arrivals()[0] === "balance" && dock.run.capture.arrivals().filter(kind => kind === "model").length === 2,
		`arrivals: ${JSON.stringify(dock.run.capture.arrivals())}`,
	);

	// The accounting and the Round-end save: the session's own record carries both exchanges' usage and
	// the amount this script derived from the maintained prices. Each Round's end saves, so the wait is
	// for the state the second exchange produces rather than for any document at all.
	const saved = await savedDocument(dock.home.consumptionFile, document =>
		sessionsOf(document).some(
			record => record.own[PROVIDER]?.[MODEL]?.tokens.input === EXCHANGE_TOKENS.input * 2,
		),
	);
	const records = sessionsOf(saved);
	observe(
		"the save holds this session alone, under the pi harness bucket",
		records.length === 1 && saved.harnesses.pi?.sessions.length === 1,
		`harnesses: ${JSON.stringify(Object.keys(saved.harnesses))}, records: ${records.length}`,
	);
	const record = records[0] as SessionRecord;
	observe(
		"the session's own identity is a real one, with no direct parent",
		record.id.length > 0 && record.parent === null,
		`record id ${JSON.stringify(record.id)}, parent ${JSON.stringify(record.parent)}`,
	);
	observe(
		"both exchanges' usage is accounted once each, in the four buckets",
		JSON.stringify(record.own[PROVIDER]?.[MODEL]?.tokens) ===
			JSON.stringify({
				input: EXCHANGE_TOKENS.input * 2,
				cacheRead: EXCHANGE_TOKENS.cacheRead * 2,
				cacheWrite: EXCHANGE_TOKENS.cacheWrite * 2,
				output: EXCHANGE_TOKENS.output * 2,
			}),
		`stored buckets: ${JSON.stringify(record.own[PROVIDER]?.[MODEL]?.tokens)}`,
	);
	observe(
		"the amount is the maintained off-peak price of that usage",
		Math.abs((record.own[PROVIDER]?.[MODEL]?.costCny ?? Number.NaN) - EXCHANGE_COST_CNY * 2) < 1e-12,
		`stored amount ${String(record.own[PROVIDER]?.[MODEL]?.costCny)}, expected ${EXCHANGE_COST_CNY * 2}`,
	);
	observe(
		"the period the root started on is the one the save carries",
		saved.periodId === "period-main-session" && saved.holiday === true,
		`periodId ${JSON.stringify(saved.periodId)}, holiday ${String(saved.holiday)}`,
	);

	// A second process over the same root: pi's own loader discovers the entrypoint again, the
	// extension loads the document the first one left and draws the period it carries, and the work
	// this process does is added to that document rather than starting a second one.
	const second = await openSession(dock);
	// The load lands after the session starts, so the drawing that carries it is awaited rather than
	// read at the instant the process booted: `¥0.0001` is this script's own rounding of the two
	// exchanges' amount (2 · 0.00003506 CNY) as the display writes a CNY figure.
	const loadedFrame = await second.frameSince(
		0,
		frame =>
			frame.type === "extension_ui_request" &&
			frame.method === "setWidget" &&
			frame.widgetKey === WIDGET_KEY &&
			(widgetLinesOf(frame) ?? []).some(line => line.includes("Accrued: ¥0.0001")),
		"the new process drawing the period it loaded",
		UI_FRAME_TIMEOUT_MS,
	);
	observe(
		"a new process reads the saved period back before doing any work of its own",
		loadedFrame !== undefined,
		`renderings: ${JSON.stringify(widgetRenders(second).slice(0, 4))}`,
	);
	await second.run("a third exchange in a new process");
	const continued = await savedDocument(
		dock.home.consumptionFile,
		document => sessionsOf(document).length === 2 && document.periodId === "period-main-session",
	);
	const buckets = sessionsOf(continued).map(record => record.own[PROVIDER]?.[MODEL]?.tokens.input);
	observe(
		"the new process added its own session's record and left the earlier one as it was",
		buckets.includes(EXCHANGE_TOKENS.input * 2) && buckets.includes(EXCHANGE_TOKENS.input),
		`per-session input tokens: ${JSON.stringify(buckets)}`,
	);

	// Nothing this extension does reaches a directory its own configuration did not name.
	observe(
		"the run wrote the extension's files only under the configured storage root",
		filesUnder(dock.run.root.workDir).length === 0 &&
			!existsSync(path.join(dock.run.root.agentDir, CONSUMPTION_FILE)) &&
			!existsSync(path.join(dock.home.path, CONSUMPTION_FILE)),
		`working directory: ${JSON.stringify(filesUnder(dock.run.root.workDir))}, storage root: ${JSON.stringify(filesUnder(dock.home.storageDirectory))}`,
	);
}

// ---------------------------------------------------------------------------
// Phase 2: the operator command
// ---------------------------------------------------------------------------

async function phaseCommand(cli: PiCli): Promise<void> {
	console.log("\nphase: the declared command keeps its effect on this host");
	const dock = startDockRun(cli, "command");
	const session = await openSession(dock);
	await session.run(PROMPT_ONE);

	const before = session.frameMark();
	const requestsBefore = dock.run.capture.requests().length;
	const documentBefore = JSON.stringify(documentOf(dock));
	const detail = await session.request({ type: "prompt", message: "/budget detail" }, 60_000);
	observe(
		"the command is answered without starting a run or asking the model",
		(detail.data as { disposition?: unknown } | undefined)?.disposition === "handled" &&
			dock.run.capture.requests().length === requestsBefore,
		`disposition ${JSON.stringify((detail.data as { disposition?: unknown } | undefined)?.disposition)}, provider requests ${dock.run.capture.requests().length - requestsBefore}`,
	);
	const notice = await session.frameSince(
		before,
		frame => frame.type === "extension_ui_request" && frame.method === "notify",
		"the command's own announcement",
		UI_FRAME_TIMEOUT_MS,
	);
	observe(
		"the command announces the form it switched the display to",
		typeof notice?.message === "string" && String(notice.message).includes("详细"),
		`announcement: ${JSON.stringify(notice?.message)}`,
	);
	const detailFrame = await session.frameSince(
		before,
		frame =>
			frame.type === "extension_ui_request" &&
			frame.method === "setWidget" &&
			frame.widgetKey === WIDGET_KEY &&
			(widgetLinesOf(frame) ?? []).some(line => line.includes(`${PROVIDER} / ${MODEL}`)),
		"the widget redrawn in the detail form",
		UI_FRAME_TIMEOUT_MS,
	);
	const detailLines = detailFrame === undefined ? [] : (widgetLinesOf(detailFrame) ?? []);
	observe(
		"the widget switched to the detail form, whose tree carries the model the session consumed",
		detailLines.some(line => line.startsWith("Total:  ")) &&
			!detailLines.some(line => line.startsWith("Round:  ")) &&
			detailLines.some(line => line.includes(`${PROVIDER} / ${MODEL}`)),
		`rendering: ${JSON.stringify(detailLines)}`,
	);
	observe(
		"the command changed no persisted consumption",
		JSON.stringify(documentOf(dock)) === documentBefore,
		`document before ${documentBefore}, after ${JSON.stringify(documentOf(dock))}`,
	);

	// The argument surface is the shared declaration's, not something this host re-invents: a name the
	// table does not carry is refused by the framework's own routing and runs no action.
	const refused = await session.request({ type: "prompt", message: "/budget not-an-action" }, 60_000);
	observe(
		"an undeclared argument is refused rather than acting",
		(detail.data as { disposition?: unknown } | undefined)?.disposition === "handled" &&
			(refused.data as { disposition?: unknown } | undefined)?.disposition === "handled",
		`dispositions: ${JSON.stringify((refused.data as { disposition?: unknown } | undefined)?.disposition)}`,
	);
}

// ---------------------------------------------------------------------------
// Phase 3: the DeepSeek balance query's wiring, TTL and outcome
// ---------------------------------------------------------------------------

/**
 * The DeepSeek balance at S2: the query the extension makes for itself on this host, and what its
 * outcome does to the display and to the run.
 *
 * The capture endpoint is the account here, and it is a controllable one: each case states the document
 * it answers, a refusal, or that it holds the answer back, and the endpoint records every call's own
 * path, headers and arrival order. What the cases observe is therefore the real assembly's own query —
 * the address it built from the host's resolved facts, the credential the host resolved at that moment,
 * the business budget and the direct connection — and never a substituted transport.
 *
 * The six cases below are one promise's checks (P29): the success TTL the shipped configuration states,
 * the settled request that is what refreshes an expired reading, a failure that keeps the reading it
 * already had, a host with no access to the provider (which asks nothing and claims nothing), one query
 * serving the triggers that arrive while it is still out, and the credential of the moment across two
 * processes of one storage root. The deterministic cases for the same rules — with a controlled clock,
 * and with credentials replaced between queries — live in `tests/model-cost/provider-balance.test.ts`
 * (S2); what these add is that the same rules hold for real requests of the real pi assembly.
 */
async function phaseBalance(cli: PiCli): Promise<void> {
	console.log("\nphase: the DeepSeek balance query is wired to this host and refreshed by its own provider's requests");

	// (1) The query itself, and the credential's confinement. Two exchanges inside the shipped 30000ms
	// success TTL: the reading the prefetch obtained is what stands, and nothing asks again.
	const wiring = startBalanceRun(cli, "balance-wiring", {
		balance: { total: BALANCE_TOTAL },
		deepseekCredential: BALANCE_SENTINEL_KEY,
	});
	const wiringSession = await openSession(wiring);
	await wiringSession.run(PROMPT_ONE);
	await wiringSession.run(PROMPT_TWO);

	const calls = wiring.run.capture.balanceCalls();
	observe(
		"the extension's own balance query left the process, at the host's resolved address and with the host's current credential",
		calls.length === 1 &&
			new URL(calls[0]!.url).pathname === "/user/balance" &&
			calls[0]!.headers.authorization === `Bearer ${BALANCE_SENTINEL_KEY}`,
		`balance calls: ${JSON.stringify(calls)}`,
	);
	observe(
		"the reading the endpoint answered reached the widget this host draws",
		widgetShows(wiringSession, `Balance: \u00A5${BALANCE_TOTAL}`),
		`last renderings: ${JSON.stringify(widgetRenders(wiringSession).slice(-2))}`,
	);
	observe(
		"the initialization's prefetch arrived before the first model request, and an exchange inside the reading's success TTL asked nothing again",
		JSON.stringify(wiring.run.capture.arrivals()) === JSON.stringify(["balance", "model", "model"]),
		`arrivals: ${JSON.stringify(wiring.run.capture.arrivals())}`,
	);

	// The credential goes where it belongs and nowhere else: this run's stderr, its session log, the model
	// requests it really serialized, the renderings the host was told to show, and the files the extension
	// wrote. The key is this smoke's own synthetic literal, so its absence on those surfaces is meaningful.
	const document = await savedDocument(wiring.home.consumptionFile, candidate => sessionsOf(candidate).length === 1);
	const surfaces: Record<string, string> = {
		stderr: wiringSession.stderr(),
		sessionLog: readFileSync(await wiringSession.sessionFile(), "utf8"),
		modelRequests: wiring.run.capture.requests().map(request => request.raw).join("\n"),
		widget: JSON.stringify(widgetRenders(wiringSession)),
		storage: fileTextsUnder(wiring.home.storageDirectory).join("\n"),
	};
	const leaked = Object.entries(surfaces)
		.filter(([, text]) => text.includes(BALANCE_SENTINEL_KEY))
		.map(([name]) => name);
	observe(
		"the credential authenticates that one query and reaches no other surface of the run",
		leaked.length === 0,
		`surfaces carrying it: ${JSON.stringify(leaked)}; stderr ${JSON.stringify(wiringSession.stderr())}`,
	);
	observe(
		"the saved document keeps the schema's own partitions, with no account or credential partition added",
		JSON.stringify(Object.keys(document).sort()) ===
			JSON.stringify(["harnesses", "holiday", "periodId", "schemaVersion", "start"]),
		`document keys: ${JSON.stringify(Object.keys(document))}`,
	);

	// (2) The success TTL and the settled request. The configuration states a 1ms TTL, so the reading a
	// settled request finds is already expired and that request is what asks again — while an idle run,
	// whose reading is expired too, asks nothing at all.
	const ttl = startBalanceRun(cli, "balance-ttl", {
		balance: { total: BALANCE_TOTAL },
		deepseekCredential: BALANCE_SENTINEL_KEY,
	});
	const ttlConfig = configRoot("balance-ttl", {
		storageDir: ttl.home.storageDirectory,
		balanceTtlMs: 1,
		codexQuotaTtlMs: 15000,
	});
	try {
		const ttlSession = await openSession(ttl, {
			entrypoint: CONFIG_ROOT_ENTRYPOINT,
			extraEnv: { [PI_MODEL_COST_CONFIG_ROOT_ENV]: ttlConfig },
		});
		await ttlSession.run(PROMPT_ONE);
		const refreshed = await waitForBalanceCalls(ttl, 2);
		observe(
			"a settled request of the reading's own provider is what refreshes the expired reading it holds",
			refreshed.length === 2 &&
				JSON.stringify(ttl.run.capture.arrivals()) === JSON.stringify(["balance", "model", "balance"]),
			`balance calls ${refreshed.length}, arrivals ${JSON.stringify(ttl.run.capture.arrivals())}`,
		);
		const idleCalls = await idleWindow(ttl, IDLE_WINDOW_MS);
		observe(
			"an expired reading queries nothing on its own: no timer and no poll is behind the TTL",
			idleCalls === 2,
			`balance calls after ${IDLE_WINDOW_MS}ms of an idle run: ${idleCalls}`,
		);
		await ttlSession.run(PROMPT_TWO);
		const askedAgain = await waitForBalanceCalls(ttl, 3);
		observe(
			"the next settled request asks again, and the reading stays the endpoint's own amount",
			askedAgain.length === 3 && widgetShows(ttlSession, `Balance: \u00A5${BALANCE_TOTAL}`),
			`balance calls ${askedAgain.length}, last rendering ${JSON.stringify(widgetRenders(ttlSession).slice(-1))}`,
		);
	} finally {
		rmSync(ttlConfig, { recursive: true, force: true });
	}

	// (3) A refresh that fails. The endpoint answers a reading to the prefetch and refuses every later
	// call, so the second exchange's own settled request is refused: the reading already obtained keeps
	// its amount on the widget, and neither a zero nor a failure line replaces it.
	const retained = startBalanceRun(cli, "balance-retained", {
		balance: {
			total: BALANCE_TOTAL,
			respond: call =>
				call.index === 1
					? undefined
					: new Response(
							JSON.stringify({ error: { message: "dock-injected balance failure", type: "dock_error" } }),
							{ status: 503, headers: { "content-type": "application/json" } },
						),
		},
		deepseekCredential: BALANCE_SENTINEL_KEY,
	});
	const retainedConfig = configRoot("balance-retained", {
		storageDir: retained.home.storageDirectory,
		balanceTtlMs: 1,
		codexQuotaTtlMs: 15000,
	});
	try {
		const retainedSession = await openSession(retained, {
			entrypoint: CONFIG_ROOT_ENTRYPOINT,
			extraEnv: { [PI_MODEL_COST_CONFIG_ROOT_ENV]: retainedConfig },
		});
		await retainedSession.run(PROMPT_ONE);
		await waitForBalanceCalls(retained, 2);
		// The mark is taken before the second exchange, so the rendering read below was published after a
		// refresh this endpoint refused.
		const mark = retainedSession.frameMark();
		await retainedSession.run(PROMPT_TWO);
		await waitForBalanceCalls(retained, 3);
		const afterRefusal = await retainedSession.frameSince(
			mark,
			frame =>
				frame.type === "extension_ui_request" &&
				frame.method === "setWidget" &&
				(widgetLinesOf(frame) ?? []).some(line => line.includes("Balance")),
			"the widget redrawn after a refused refresh",
			UI_FRAME_TIMEOUT_MS,
		);
		const refusedLines = afterRefusal === undefined ? [] : (widgetLinesOf(afterRefusal) ?? []);
		const everUnavailable = widgetRenders(retainedSession).some(rendering =>
			rendering.some(line => line.includes("Balance: unavailable")),
		);
		const everZero = widgetRenders(retainedSession).some(rendering =>
			rendering.some(line => line.includes("Balance: \u00A50")),
		);
		observe(
			"a refused refresh keeps the reading and its amount, and never becomes a zero or a dropped reading",
			refusedLines.some(line => line.includes(`Balance: \u00A5${BALANCE_TOTAL}`)) && !everUnavailable && !everZero,
			`rendering after the refusal: ${JSON.stringify(refusedLines)}, ever unavailable ${String(everUnavailable)}, ever zero ${String(everZero)}`,
		);
	} finally {
		rmSync(retainedConfig, { recursive: true, force: true });
	}

	// (4) A host with no access to the balance's provider. The session runs on another provider, and
	// `deepseek` is declared with no credential at all: the prefetch is then not an attempt — nothing is
	// sent, and no failure is claimed for a provider this process never used.
	const noAccess = startBalanceRun(cli, "balance-no-access", {
		modelProvider: MODEL_ONLY_PROVIDER,
		balance: { total: BALANCE_TOTAL },
	});
	const noAccessSession = await openSession(noAccess, { extraEnv: { DEEPSEEK_API_KEY: undefined } });
	const exchange = await noAccessSession.run(PROMPT_ONE);
	observe(
		"the session still works on this host, with the extension drawing and the model exchange completing",
		exchange === "started" && widgetRenders(noAccessSession).length > 0 && noAccess.run.capture.requests().length === 1,
		`disposition ${JSON.stringify(exchange)}, renderings ${widgetRenders(noAccessSession).length}, model requests ${noAccess.run.capture.requests().length}`,
	);
	observe(
		"a provider this host cannot authenticate is asked nothing: no balance request reached the endpoint",
		noAccess.run.capture.balanceCalls().length === 0 && !noAccess.run.capture.arrivals().includes("balance"),
		`balance calls ${noAccess.run.capture.balanceCalls().length}, arrivals ${JSON.stringify(noAccess.run.capture.arrivals())}`,
	);
	observe(
		"and no failure is claimed for it: no balance line, no zero and no operator notice",
		!widgetRenders(noAccessSession).some(rendering => rendering.some(line => line.includes("Balance"))) &&
			!noAccessSession.stderr().includes("余额") &&
			noAccessSession.notificationsSince(0).length === 0,
		`renderings ${JSON.stringify(widgetRenders(noAccessSession).slice(-2))}, stderr ${JSON.stringify(noAccessSession.stderr())}, notices ${JSON.stringify(noAccessSession.notificationsSince(0))}`,
	);

	// (5) One query serves the triggers that arrive while it is out. The endpoint holds every answer, so
	// the prefetch's own 5000ms budget is what ends the first exchange's wait and the query the settled
	// request begins is still out while the second exchange runs — and that exchange's own settled request
	// joins it instead of asking a third time.
	const joined = startBalanceRun(cli, "balance-join", {
		balance: { total: BALANCE_JOINED_TOTAL, holdFrom: 1 },
		deepseekCredential: BALANCE_SENTINEL_KEY,
	});
	const joinedConfig = configRoot("balance-join", {
		storageDir: joined.home.storageDirectory,
		balanceTtlMs: 1,
		codexQuotaTtlMs: 15000,
	});
	try {
		const joinedSession = await openSession(joined, {
			entrypoint: CONFIG_ROOT_ENTRYPOINT,
			extraEnv: { [PI_MODEL_COST_CONFIG_ROOT_ENV]: joinedConfig },
		});
		await joinedSession.run(PROMPT_ONE);
		await waitForBalanceCalls(joined, 2);
		observe(
			"a query that is never answered does not hold the work: the exchange completed and its settled request began the next query",
			JSON.stringify(joined.run.capture.arrivals()) === JSON.stringify(["balance", "model", "balance"]),
			`arrivals: ${JSON.stringify(joined.run.capture.arrivals())}`,
		);
		observe(
			"a query with no reading is shown as the failure it is, and never as a zero",
			widgetShows(joinedSession, "Balance: unavailable (unreachable)"),
			`last renderings: ${JSON.stringify(widgetRenders(joinedSession).slice(-2))}`,
		);
		const mark = joinedSession.frameMark();
		await joinedSession.run(PROMPT_TWO);
		const joinedCalls = await idleWindow(joined, SETTLED_WINDOW_MS);
		observe(
			"the second exchange's settled request joined the query still out rather than issuing another",
			joinedCalls === 2 &&
				JSON.stringify(joined.run.capture.arrivals()) === JSON.stringify(["balance", "model", "balance", "model"]),
			`balance calls ${joinedCalls}, arrivals ${JSON.stringify(joined.run.capture.arrivals())}`,
		);
		// Released, the query answers, and the instance that was holding it accepts the reading: the amount
		// replaces the failure, and no third query was begun for the answer.
		joined.run.capture.releaseBalance();
		const released = await joinedSession.frameSince(
			mark,
			frame =>
				frame.type === "extension_ui_request" &&
				frame.method === "setWidget" &&
				(widgetLinesOf(frame) ?? []).some(line => line.includes(`Balance: \u00A5${BALANCE_JOINED_TOTAL}`)),
			"the reading the joined query obtained",
			UI_FRAME_TIMEOUT_MS,
		);
		observe(
			"the answer the joined query was holding is accepted by the same instance, and nothing asked again for it",
			released !== undefined && joined.run.capture.balanceCalls().length === 2,
			`rendering ${JSON.stringify(released === undefined ? undefined : widgetLinesOf(released))}, balance calls ${joined.run.capture.balanceCalls().length}`,
		);
	} finally {
		rmSync(joinedConfig, { recursive: true, force: true });
	}

	// (6) The credential of the moment, across two processes of one storage root. The host's own
	// configuration states another credential for the same provider, and the second process's query is
	// authenticated with that one: the credential it obtains is the one its own configuration states, not
	// anything the first process's run left behind in the root they share.
	const replaced = startBalanceRun(cli, "balance-replaced", {
		balance: { total: BALANCE_TOTAL },
		deepseekCredential: BALANCE_SENTINEL_KEY,
	});
	const firstProcess = await openSession(replaced);
	await firstProcess.run(PROMPT_ONE);
	await waitForBalanceCalls(replaced, 1);
	observe(
		"the first process authenticated its query with the credential its own configuration states",
		replaced.run.capture.balanceCalls()[0]?.headers.authorization === `Bearer ${BALANCE_SENTINEL_KEY}`,
		`balance calls: ${JSON.stringify(replaced.run.capture.balanceCalls())}`,
	);
	// The document that process's Round end saves is what lands in the root before it ends.
	await savedDocument(replaced.home.consumptionFile, candidate => sessionsOf(candidate).length === 1);
	await firstProcess.stop({ timeoutMs: 15_000 });
	// What the first process left behind: its storage root, which must hold no credential of its own.
	const leftBehind = fileTextsUnder(replaced.home.storageDirectory);
	observe(
		"the process left no credential behind it: the files it did leave carry nothing of the key it used",
		leftBehind.length > 0 && leftBehind.every(text => !text.includes(BALANCE_SENTINEL_KEY)),
		`files: ${JSON.stringify(filesUnder(replaced.home.storageDirectory))}`,
	);
	// The same run root and the same storage root, with the provider's credential replaced as the host's
	// configuration between processes.
	writePiModels(replaced.run.root.agentDir, {
		[PROVIDER]: {
			baseUrl: replaced.run.capture.baseUrl,
			api: "openai-completions",
			apiKey: BALANCE_REPLACED_KEY,
			models: [DECLARED_MODEL],
		},
	});
	const secondProcess = await openSession(replaced);
	await secondProcess.run(PROMPT_ONE);
	const secondCalls = await waitForBalanceCalls(replaced, 2);
	observe(
		"the next process's query is authenticated with the credential its own configuration states",
		secondCalls.length === 2 && secondCalls[1]!.headers.authorization === `Bearer ${BALANCE_REPLACED_KEY}`,
		`balance calls: ${JSON.stringify(secondCalls.map(call => call.headers.authorization))}`,
	);
}

// ---------------------------------------------------------------------------
// Phase 4: the storage root's own rules, in real processes
// ---------------------------------------------------------------------------

/** The fixture entrypoint that binds the production assembly to a configuration root this run states. */
const CONFIG_ROOT_ENTRYPOINT = path.join(
	REPO_ROOT,
	"tests",
	"harness-dock",
	"fixtures",
	"pi-model-cost",
	"entrypoint.ts",
);

/** One throwaway repository layout whose `extensions/model-cost/config.yaml` carries `settings`. */
function configRoot(label: string, settings: Readonly<Record<string, string | number>>): string {
	const root = mkdtempSync(path.join(tmpdir(), `pi-model-cost-config-${label}-`));
	const directory = path.join(root, "extensions", "model-cost");
	mkdirSync(directory, { recursive: true });
	const lines = Object.entries(settings).map(([key, value]) =>
		typeof value === "string" ? `${key}: ${JSON.stringify(value)}` : `${key}: ${value}`,
	);
	writeFileSync(path.join(directory, "config.yaml"), `${lines.join("\n")}\n`, "utf8");
	return root;
}

/** The three fields the definition declares, with a case's own `storageDir` in front of them. */
function declaredSettings(storageDir: string): Record<string, string | number> {
	return { storageDir, balanceTtlMs: 30000, codexQuotaTtlMs: 15000 };
}

/**
 * The storage root's rules, each exercised by a real process whose configuration states the value.
 *
 * The value is the extension's own field, and every case below is one of the field's documented
 * interpretations: an absolute value used as it is, a relative value resolved against the directory the
 * extension's own `config.yaml` lives in rather than the working directory, and the field's `~/`
 * meaning the user's `.omp` home. Each case also states what must *not* exist — a directory the field
 * did not name is never written — and the two working directories the relative case runs in are what
 * makes "resolved against the configuration, not the cwd" an observation rather than a reading.
 */
async function phaseStorageRoot(cli: PiCli): Promise<void> {
	console.log("\nphase: the declared storage root keeps its own interpretation");
	const absoluteStore = path.join(mkdtempSync(path.join(tmpdir(), "pi-model-cost-absolute-")), "absolute-store");

	// An absolute value is used exactly as it was declared.
	const absolute = startDockRun(cli, "storage-absolute", { baseline: false });
	const absoluteRoot = configRoot("absolute", declaredSettings(absoluteStore));
	try {
		const session = await openSession(absolute, {
			entrypoint: CONFIG_ROOT_ENTRYPOINT,
			extraEnv: { [PI_MODEL_COST_CONFIG_ROOT_ENV]: absoluteRoot },
		});
		await session.run(PROMPT_ONE);
		await savedDocument(path.join(absoluteStore, CONSUMPTION_FILE), document => sessionsOf(document).length === 1);
		observe(
			"an absolute storageDir is written where it says, and nowhere else",
			existsSync(path.join(absoluteStore, CONSUMPTION_FILE)) &&
				!existsSync(absolute.home.consumptionFile) &&
				filesUnder(absolute.run.root.workDir).length === 0,
			`absolute store: ${JSON.stringify(filesUnder(absoluteStore))}, home: ${JSON.stringify(filesUnder(absolute.home.path))}`,
		);
	} finally {
		rmSync(absoluteRoot, { recursive: true, force: true });
		rmSync(path.dirname(absoluteStore), { recursive: true, force: true });
	}

	// A relative value resolves against the extension's own configuration directory — the same root
	// whatever working directory the process was started in.
	const relativeRoot = configRoot("relative", declaredSettings("relative-store"));
	const relativeStore = path.join(relativeRoot, "extensions", "model-cost", "relative-store");
	try {
		const first = startDockRun(cli, "storage-relative-one", { baseline: false });
		const firstSession = await openSession(first, {
			entrypoint: CONFIG_ROOT_ENTRYPOINT,
			extraEnv: { [PI_MODEL_COST_CONFIG_ROOT_ENV]: relativeRoot },
		});
		await firstSession.run(PROMPT_ONE);
		await savedDocument(path.join(relativeStore, CONSUMPTION_FILE), document => sessionsOf(document).length === 1);
		// A second process of the same configuration, started in another working directory.
		const second = startDockRun(cli, "storage-relative-two", { baseline: false });
		const secondSession = await openSession(second, {
			entrypoint: CONFIG_ROOT_ENTRYPOINT,
			extraEnv: { [PI_MODEL_COST_CONFIG_ROOT_ENV]: relativeRoot },
		});
		await secondSession.run(PROMPT_ONE);
		const shared = await savedDocument(
			path.join(relativeStore, CONSUMPTION_FILE),
			document => sessionsOf(document).length === 2,
		);
		observe(
			"a relative storageDir resolves against the configuration, in both working directories",
			sessionsOf(shared).length === 2 &&
				first.run.root.workDir !== second.run.root.workDir &&
				filesUnder(first.run.root.workDir).length === 0 &&
				filesUnder(second.run.root.workDir).length === 0,
			`store: ${JSON.stringify(filesUnder(relativeStore))}, cwds: ${first.run.root.workDir} / ${second.run.root.workDir}`,
		);
		observe(
			"the working directories and the user homes hold nothing of the extension's",
			!existsSync(path.join(first.home.path, ".omp", "cost-archive", CONSUMPTION_FILE)) &&
				!existsSync(path.join(absolute.home.path, ".omp", "cost-archive", CONSUMPTION_FILE)),
			`first home: ${JSON.stringify(filesUnder(path.join(first.home.path, ".omp")))}`,
		);
	} finally {
		rmSync(relativeRoot, { recursive: true, force: true });
	}

	// The field's own `~/`: the `.omp` directory inside the user's home, and never the home itself.
	const tilde = startDockRun(cli, "storage-tilde", { baseline: false });
	const tildeRoot = configRoot("tilde", declaredSettings("~/cost-archive"));
	try {
		const session = await openSession(tilde, {
			entrypoint: CONFIG_ROOT_ENTRYPOINT,
			extraEnv: { [PI_MODEL_COST_CONFIG_ROOT_ENV]: tildeRoot },
		});
		await session.run(PROMPT_ONE);
		await savedDocument(tilde.home.consumptionFile, document => sessionsOf(document).length === 1);
		observe(
			"the field's ~/ means the user's .omp home, not the home directory itself",
			existsSync(tilde.home.consumptionFile) &&
				!existsSync(path.join(tilde.home.path, "cost-archive")) &&
				filesUnder(tilde.run.root.workDir).length === 0,
			`home: ${JSON.stringify(filesUnder(tilde.home.path))}`,
		);
	} finally {
		rmSync(tildeRoot, { recursive: true, force: true });
	}
}

// ---------------------------------------------------------------------------
// Phase 5: a configuration the definition refuses
// ---------------------------------------------------------------------------

/**
 * An illegal configuration refuses the extension as a whole rather than changing a rule silently.
 *
 * The framework validated the declared fields before any of the extension's code ran, so this case
 * observes the refusal on the channel the framework reports through — the process's stderr, labeled with
 * the extension — together with the absence of everything the extension would otherwise have done: no
 * widget, no provider query, no file. The session itself keeps running, which is what "the harness is
 * not stopped by one extension's configuration" means.
 */
async function phaseRefusedConfiguration(cli: PiCli): Promise<void> {
	console.log("\nphase: an illegal configuration refuses the extension and leaves the session running");
	const dock = startDockRun(cli, "config-refused");
	const refusedRoot = configRoot("refused", declaredSettings(""));
	try {
		const storeBefore = filesUnder(dock.home.path);
		const session = await openSession(dock, {
			entrypoint: CONFIG_ROOT_ENTRYPOINT,
			extraEnv: { [PI_MODEL_COST_CONFIG_ROOT_ENV]: refusedRoot },
		});
		const turn = await session.run(PROMPT_ONE);
		observe(
			"the framework reported the refused binding, naming the extension",
			session.stderr().includes("configuration error") && session.stderr().includes("model-cost"),
			`stderr: ${JSON.stringify(session.stderr())}`,
		);
		observe(
			"the refused extension drew nothing, queried nothing and wrote nothing",
			widgetRenders(session).length === 0 &&
				!dock.run.capture.arrivals().includes("balance") &&
				filesUnder(dock.home.path).every(name => storeBefore.includes(name)),
			`widget frames ${widgetRenders(session).length}, arrivals ${JSON.stringify(dock.run.capture.arrivals())}, files ${JSON.stringify(filesUnder(dock.home.path))}`,
		);
		observe(
			"the session itself keeps running without the extension",
			turn === "started" && dock.run.capture.requests().length === 1,
			`disposition ${JSON.stringify(turn)}, provider requests ${dock.run.capture.requests().length}`,
		);
	} finally {
		rmSync(refusedRoot, { recursive: true, force: true });
	}
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface Options {
	readonly pi: string | undefined;
	readonly keep: boolean;
	readonly help: boolean;
}

function parseOptions(argv: readonly string[]): Options {
	let pi: string | undefined;
	let keep = false;
	let help = false;
	for (let index = 0; index < argv.length; index += 1) {
		const argument = argv[index];
		if (argument === "--pi") {
			const candidate: string | undefined = argv[index + 1];
			if (candidate === undefined) throw new Error("--pi requires a path");
			pi = candidate;
			index += 1;
		} else if (argument === "--keep") {
			keep = true;
		} else if (argument === "--help" || argument === "-h") {
			help = true;
		} else {
			throw new Error(`unknown argument ${JSON.stringify(argument)}; see --help`);
		}
	}
	return { pi, keep, help };
}

const USAGE = [
	"usage: bun scripts/pi-model-cost-smoke.ts [--pi <path|name>] [--keep]",
	"",
	"  --pi <path|name>  the pi CLI to drive: its dist/bundle/cli.js, its pi.cmd/pi shim, the binary,",
	"                    or a bare command name looked up on PATH (PI_CLI does the same; without",
	"                    either, `pi` is looked up and node's own prefix is tried)",
	"  --keep            keep every run root (its agent state, sessions, captures, user home)",
	"  PI_NODE           Node executable for a script/shim CLI",
].join("\n");

const options = parseOptions(process.argv.slice(2));
if (options.help) {
	console.log(USAGE);
	process.exit(0);
}

let tested = `<unresolved: ${EXPECTED_PI_VERSION} expected>`;
let failure: unknown;

try {
	if (!existsSync(ENTRYPOINT)) throw new Error(`the pi assembly entrypoint does not exist: ${ENTRYPOINT}`);
	const cli = resolvePiCli(options.pi);
	const version = await piVersion(cli);
	tested = version;
	console.log(`pi model-cost smoke — pi ${version} via ${cli.path} (${cli.source})`);
	if (version !== EXPECTED_PI_VERSION) {
		console.log(
			`  note  this smoke's expectations were written against pi ${EXPECTED_PI_VERSION}; the CLI under test reports ${version}`,
		);
	}
	await phaseMainSession(cli);
	await phaseCommand(cli);
	await phaseBalance(cli);
	await phaseStorageRoot(cli);
	await phaseRefusedConfiguration(cli);
} catch (error) {
	failure = error;
	for (const session of sessions) {
		if (session.running()) console.error(session.diagnostics());
	}
} finally {
	for (const session of sessions) {
		await session.stop({ timeoutMs: 5_000 }).catch(() => undefined);
	}
	for (const dock of runs) {
		dock.run.capture.stop();
		if (failure !== undefined || options.keep) console.error(`kept for inspection: ${dock.run.root.path}`);
		else rmSync(dock.run.root.path, { recursive: true, force: true });
	}
}

console.log(
	`\nPI MODEL-COST SMOKE SUMMARY: pi ${tested} — ${observations.length} check(s) passed, ${failure === undefined ? "none failed" : "the run stopped on a failure"}`,
);
console.log(`  ${observations.length} consumer-visible check(s) across ${runs.length} isolated run(s)`);
console.log("  limitations: the TUI's readability stays human-led (this observes the setWidget frames the frontend published);");
console.log("               the balance cases drive the shipped success TTL through the host's own clock (a configured 1ms TTL), not a controlled one;");
console.log("               the season boundary's timed redraw and the subagent execution duration are not exercised here");
console.log(`  rerun: bun scripts/pi-model-cost-smoke.ts${options.pi === undefined ? "" : ` --pi ${options.pi}`}`);

if (failure !== undefined) throw failure;
