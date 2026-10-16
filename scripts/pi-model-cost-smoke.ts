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
 *      for itself is answered and shown on the widget, and a settled request of that provider is what
 *      refreshes it — all of it with one extension loaded and no subagent provider present;
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
import { type PiCli, PiSession, type PiRun, piVersion, resolvePiCli, startPiRun } from "../tests/harness-dock/pi-session";
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
	options: { readonly entrypoint?: string; readonly extraEnv?: Record<string, string> } = {},
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
// Phase 3: the storage root's own rules, in real processes
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
// Phase 4: a configuration the definition refuses
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
console.log("               the season boundary's timed redraw and the subagent execution duration are not exercised here");
console.log(`  rerun: bun scripts/pi-model-cost-smoke.ts${options.pi === undefined ? "" : ` --pi ${options.pi}`}`);

if (failure !== undefined) throw failure;
