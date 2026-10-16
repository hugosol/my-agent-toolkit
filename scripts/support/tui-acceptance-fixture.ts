/**
 * The fixed business scenario one real-TUI acceptance run draws, and the isolated run it is drawn in.
 *
 * The acceptance the TUI ticket asks for is a person's judgement of *readability*, so the scenario has
 * to be fixed and representative before anyone looks at it: the same document every time, holding the
 * content forms the display promises — a main session with a startup snapshot, a priced pair and a
 * session span; five descendants at two depths, with Chinese and long ASCII names; a session whose
 * beginning nothing proved (`?(?)`), one whose executions were never measured (`Run: —`), one measured
 * to take no measurable time (`Run: 0ms`), one whose period observation carries a recorded gap, and one
 * whose amount is unknown while its usage is known (a row with no `Cost:` field); and two currencies'
 * worth of session rows under one root.
 *
 * The run is the repository's own real-host shape: the installed pi CLI, discovered and loaded
 * through the production entrypoint (`--no-extensions -e entrypoints/pi/model-cost.ts`), with an
 * isolated agent state, session directory, working directory and user home under the OS temp root, the
 * pinned `pi-subagents` artifact loaded beside it (so the entry is in its subagent mode and the detail
 * form is available), and a local capture endpoint declared as the `deepseek` provider — which is what
 * answers the extension's own balance query, so the account row carries a real reading instead of an
 * unreachable one. Nothing of the machine's agent state, configuration or credentials is read, and no
 * repository file is written.
 *
 * The figures below are this scenario's own arithmetic, written out so a check can state them without
 * running the drawing: each record's amount is the `costCny` the document holds and the period's
 * accrual is their sum (0.05 + 0.004 + 0.01 + 0.002 + 0.001 = 0.067, which the display's own rule
 * writes as two decimals); the runtime markers are the records' own milliseconds in that rule's units
 * (480,000 → `8m`, 45,000 → `45s`, 30,000 → `30s`, 0 → `0ms`, absent → the unavailable dash).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import type { CaptureServer, CaptureServerOptions } from "../../tests/harness-dock/capture-server";
import { startCaptureServer } from "../../tests/harness-dock/capture-server";
import { buildSessionEnv } from "../../tests/harness-dock/env";
import { type PiCli, piVersion, startPiRun } from "../../tests/harness-dock/pi-session";
import type { RunRoot } from "../../tests/harness-dock/run-root";
import type { ConsumptionDocument } from "../../extensions/model-cost/shared-logic/consumption-document";
import { WIDE_TAIL, terminalScreen } from "./terminal-screen";

/** The harness partition this scenario's records belong to: the extension's own pi harness name. */
export const HARNESS = "pi";
export const CONSUMPTION_FILE = "consumption.json";

/** The session the run is started as, so the seeded record is the session the TUI draws. */
export const MAIN_SESSION_ID = "session-main";

/** The provider and model pair this scenario prices and runs on (the monetary `flash` tier's own). */
export const PROVIDER = "deepseek";
export const MODEL = "deepseek-flash";

/**
 * The model's declared cost, in the model catalog's USD-per-million rates: the maintained flash
 * tier's own three amounts, so the price the drawing ratios with and the price the extension prices
 * requests from are the same numbers.
 */
export const MODEL_COST: Readonly<Record<string, number>> = { input: 1, cacheRead: 0.02, cacheWrite: 0, output: 4 };

/** The balance reading the run's own endpoint answers the extension's query with, in CNY. */
export const BALANCE_TOTAL = "12.34";

/** The repository root this script's entrypoint and the pinned provider artifact are resolved from. */
export const REPOSITORY_ROOT = path.resolve(import.meta.dir, "..", "..");
export const ENTRYPOINT = path.join(REPOSITORY_ROOT, "entrypoints", "pi", "model-cost.ts");

/** The pinned provider artifact this repository installs, as the entry a run loads beside the entrypoint. */
export const PROVIDER_ENTRY = path.join(REPOSITORY_ROOT, "node_modules", "pi-subagents", "index.js");

/** One session of the fixed scenario, as the drawing is expected to carry it. */
export interface ScenarioSession {
	readonly id: string;
	readonly name: string;
	/** Its distance from the root: the depth its row is indented by. */
	readonly depth: number;
	/** The amount its own record holds, as the display's rule writes it, or `undefined` for no amount. */
	readonly cost?: string;
	/** The runtime its own record holds, as the display's rule writes it. */
	readonly runtime: string;
	/** Whether the record holds no startup snapshot at all, which a row draws as `?(?)`. */
	readonly unprovenStart: boolean;
}

/**
 * The descendants the scenario seeds under the main session, deepest last: the names, amounts and
 * runtime markers a check reads off the drawing.
 */
export const SCENARIO_SESSIONS: readonly ScenarioSession[] = [
	{ id: "session-research", name: "检索定价核查表", depth: 1, cost: "¥0.0040", runtime: "8m", unprovenStart: false },
	{
		id: "session-pricing-scan",
		name: "pricing-scan-of-every-listed-model",
		depth: 1,
		cost: "¥0.01",
		runtime: "45s",
		unprovenStart: true,
	},
	{ id: "session-zero-runtime", name: "未测量代理", depth: 1, runtime: "0ms", unprovenStart: true },
	{ id: "session-unmeasured", name: "runtime-never-measured", depth: 1, cost: "¥0.0020", runtime: "—", unprovenStart: false },
	{
		id: "session-research-detail",
		name: "details-under-the-first-child",
		depth: 2,
		cost: "¥0.0010",
		runtime: "30s",
		unprovenStart: false,
	},
];

/** The main session's own name, amount and startup snapshot. */
export const MAIN_SESSION = { name: "主会话", cost: "¥0.05", snapshot: "deepseek/deepseek-flash(high)" } as const;

/** The whole period's accrual, as the account row writes it: the six records' sum. */
export const ACCRUED = "¥0.07";
/** The main tree's inclusive cost, as the Total row writes it: the same six records. */
export const TOTAL_COST = "¥0.07";
/** The main session's own session span within the period, as the Total row writes it. */
export const TOTAL_SPAN = "0:05:00";
/** The unknown-start marker a row without a startup snapshot draws. */
export const UNPROVEN_START = "?(?)";

/** One session as the fixed scenario seeds it. */
function sessionRecord(
	session: ScenarioSession,
	parent: string | null,
	options: {
		readonly tokens: { readonly input: number; readonly cacheRead: number; readonly output: number };
		readonly costCny?: number;
		readonly runtimeMs?: number;
		readonly runtimeGap?: true;
		readonly startup?: { readonly provider: string; readonly model: string; readonly effort: string };
	},
): Record<string, unknown> {
	return {
		id: session.id,
		name: session.name,
		parent,
		saveVersion: 1,
		...(options.startup === undefined ? {} : { startup: { model: { provider: options.startup.provider, model: options.startup.model }, effort: options.startup.effort } }),
		...(options.runtimeMs === undefined ? {} : { runtimeMs: options.runtimeMs }),
		...(options.runtimeGap === undefined ? {} : { runtimeGap: options.runtimeGap }),
		own: {
			[PROVIDER]: {
				[MODEL]: {
					tokens: { input: options.tokens.input, cacheRead: options.tokens.cacheRead, cacheWrite: 0, output: options.tokens.output },
					...(options.costCny === undefined ? {} : { costCny: options.costCny }),
				},
			},
		},
	};
}

/**
 * The fixed scenario's document: one period, one harness, the main session and its five descendants.
 *
 * The records are the ones {@link SCENARIO_SESSIONS} and {@link MAIN_SESSION} describe, and the main
 * session's own span is the 05:00 the Total row draws. The priced pair is the main session's own
 * 1,000 input, 2,000 cached and 3,000 output tokens with 0.05 CNY; the record nothing measured
 * (0 ms) carries no amount at all, which is what the row without a `Cost:` field is.
 */
export function acceptanceDocument(): ConsumptionDocument {
	const session = (id: string): ScenarioSession => {
		const found = SCENARIO_SESSIONS.find(candidate => candidate.id === id);
		if (found === undefined) throw new Error(`the fixed scenario names no session ${id}`);
		return found;
	};
	return {
		schemaVersion: 1,
		periodId: "period-tui-acceptance",
		start: "2026-10-01T00:00:00.000Z",
		holiday: false,
		harnesses: {
			[HARNESS]: {
				sessions: [
					{
						...sessionRecord({ id: MAIN_SESSION_ID, name: MAIN_SESSION.name, depth: 0, runtime: "—", unprovenStart: false }, null, {
							tokens: { input: 1000, cacheRead: 2000, output: 3000 },
							costCny: 0.05,
							startup: { provider: PROVIDER, model: MODEL, effort: "high" },
						}),
						span: { start: Date.parse("2026-10-01T00:00:00.000Z"), end: Date.parse("2026-10-01T00:05:00.000Z") },
					},
					sessionRecord(session("session-research"), MAIN_SESSION_ID, {
						tokens: { input: 30, cacheRead: 20, output: 50 },
						costCny: 0.004,
						runtimeMs: 480_000,
						startup: { provider: PROVIDER, model: MODEL, effort: "high" },
					}),
					sessionRecord(session("session-pricing-scan"), MAIN_SESSION_ID, {
						tokens: { input: 100, cacheRead: 100, output: 100 },
						costCny: 0.01,
						runtimeMs: 45_000,
						runtimeGap: true,
					}),
					sessionRecord(session("session-zero-runtime"), MAIN_SESSION_ID, {
						tokens: { input: 5, cacheRead: 0, output: 5 },
						runtimeMs: 0,
					}),
					sessionRecord(session("session-unmeasured"), MAIN_SESSION_ID, {
						tokens: { input: 7, cacheRead: 3, output: 7 },
						costCny: 0.002,
						startup: { provider: PROVIDER, model: MODEL, effort: "medium" },
					}),
					sessionRecord(session("session-research-detail"), "session-research", {
						tokens: { input: 1, cacheRead: 1, output: 1 },
						costCny: 0.001,
						runtimeMs: 30_000,
						startup: { provider: PROVIDER, model: MODEL, effort: "medium" },
					}),
				],
			},
		},
	} as unknown as ConsumptionDocument;
}

/** One prepared acceptance run: its isolated root, its endpoint, its home and the argv pi is started with. */
export interface AcceptanceRun {
	readonly root: RunRoot;
	readonly capture: CaptureServer;
	readonly cli: PiCli;
	/** The pi version the run's own `--version` reported, as the artifact this evidence belongs to. */
	readonly version: string;
	/** The isolated user home the run's own `~/.omp/cost-archive` lives under. */
	readonly home: string;
	readonly storageDirectory: string;
	readonly consumptionFile: string;
	/** The environment the run's pi process is started with. */
	readonly env: Record<string, string>;
	/** The argv prefix that starts the run's pi process in a terminal UI, without the terminal itself. */
	readonly argv: readonly string[];
	/** Release the endpoint and the isolated root. */
	dispose(): void;
}

/**
 * Provision one acceptance run: a fresh isolated root, the capture endpoint behind it, the fixed
 * scenario's document in the run's own storage root, and the argv a terminal UI is started with.
 *
 * The provider artifact is loaded beside the entrypoint so the assembly is in its subagent mode: the
 * detail form and the agent tree are the content this acceptance is about, and a run without the
 * provider refuses that form by design (the no-subagent mode's own answer).
 */
export async function prepareAcceptanceRun(options: { readonly cli: PiCli; readonly label: string; readonly providerEntry?: string }): Promise<AcceptanceRun> {
	const providerEntry = options.providerEntry ?? PROVIDER_ENTRY;
	const version = await piVersion(options.cli);
	const endpoint: Omit<CaptureServerOptions, "dir"> = { balance: { total: BALANCE_TOTAL } };
	const run = startPiRun(options.cli, options.label, { provider: PROVIDER, model: MODEL, cost: MODEL_COST, contextWindow: 128_000, endpoint });
	const home = path.join(run.root.path, "user-home");
	const storageDirectory = path.join(home, ".omp", "cost-archive");
	mkdirSync(storageDirectory, { recursive: true });
	const consumptionFile = path.join(storageDirectory, CONSUMPTION_FILE);
	writeFileSync(consumptionFile, JSON.stringify(acceptanceDocument()), "utf8");

	const env = buildSessionEnv(process.env, {
		agentDir: run.root.agentDir,
		extra: {
			USERPROFILE: home,
			HOME: home,
			HOMEDRIVE: path.parse(home).root,
			HOMEPATH: home.slice(path.parse(home).root.length - 1),
			PI_OFFLINE: "1",
			PI_SKIP_VERSION_CHECK: "1",
			PI_TELEMETRY: "0",
		},
	});

	return {
		root: run.root,
		capture: run.capture,
		cli: run.cli,
		version,
		home,
		storageDirectory,
		consumptionFile,
		env,
		argv: terminalUiArgv(run.root, run.selector, providerEntry),
		dispose() {
			run.capture.stop();
			run.root.dispose();
		},
	};
}

/**
 * The argv one terminal UI of this run is started with: the run's own agent state, session directory
 * and working directory, the production entrypoint and the pinned provider artifact as its only
 * extensions, and the scenario's own session id, so the seeded record is the session drawn.
 */
function terminalUiArgv(root: RunRoot, selector: string, providerEntry: string): readonly string[] {
	return [
		"--no-extensions",
		"-e",
		ENTRYPOINT,
		"-e",
		providerEntry,
		"--no-mcp",
		"--no-approve",
		"--session-dir",
		root.sessionDir,
		"--session-id",
		MAIN_SESSION_ID,
		"--model",
		selector,
		"--thinking",
		"high",
		"--tui-mode",
		"regular",
	];
}

/** The form the entry's own display preference is in, as the drawing an operator would be looking at. */
export type DisplayForm = "brief" | "detail";

/** One captured frame: the drawing as the terminal really held it, at one width and in one form. */
export interface CapturedFrame {
	readonly form: DisplayForm;
	readonly width: number;
	/** Each drawn row's characters, as the terminal held them. */
	readonly rows: readonly string[];
	/** Each drawn row's cells, one entry per column, so a field's column is its own cell index. */
	readonly cells: readonly (readonly string[])[];
	/** Every byte the process that drew this frame wrote to its terminal, in arrival order. */
	readonly recording: string;
}

/** What one captured run holds: the frames, the bytes the process wrote, and the child's own exit. */
export interface CapturedRun {
	readonly frames: readonly CapturedFrame[];
	/**
	 * Everything the process wrote to its terminal, in arrival order: this run's own recording.
	 *
	 * The run is started on a terminal alone — no separate stderr pipe — so this is where every
	 * diagnostic a load failure or a notice wrote really is: the pi terminal UI draws them into its own
	 * frame, which is what an operator would have read.
	 */
	readonly recording: string;
	readonly exitCode: number | null;
}

/** The rows one captured frame holds, without the terminal's own blank tail. */
function drawnRows(cells: readonly (readonly string[])[]): readonly (readonly string[])[] {
	return cells.filter(row => row.some(cell => cell !== " " && cell !== WIDE_TAIL));
}

/** One row's own characters, as a person reads them: a wide character once, its trailing cell left out. */
function rowText(row: readonly string[]): string {
	return row
		.filter(cell => cell !== WIDE_TAIL)
		.join("")
		.replace(/\s+$/, "");
}

/**
 * One terminal UI of this run, drawn in one form at one width, and read back as the frame it left.
 *
 * A frame is taken only once the process has stopped writing for `quietMs`, so what is read is the
 * drawing at rest rather than a repaint in flight. The detail form is reached the way an operator
 * reaches it — the entry's own `/budget detail` — written as one line and one Enter, which is how the
 * terminal UI's input takes it: the text typed ahead of an open command menu would be completed into
 * the command itself and the argument dropped, and a fresh process per frame keeps the form a frame
 * shows the form that run drew rather than whatever an earlier one left on the screen.
 */
async function captureOne(
	run: AcceptanceRun,
	options: { readonly form: DisplayForm; readonly width: number; readonly rows: number; readonly quietMs: number; readonly timeoutMs: number },
): Promise<{ readonly frame: CapturedFrame; readonly exitCode: number | null }> {
	const screen = terminalScreen(options.width, options.rows);
	let received = 0;
	let lastGrowth = Date.now();
	const recording: string[] = [];
	const decoder = new TextDecoder();
	const terminal = new Bun.Terminal({
		cols: options.width,
		rows: options.rows,
		data(_terminal, data) {
			const text = decoder.decode(data, { stream: true });
			recording.push(text);
			screen.feed(text);
			received += 1;
			lastGrowth = Date.now();
		},
	});
	const child = Bun.spawn([...run.cli.command, ...run.argv], { cwd: run.root.workDir, env: run.env, terminal });
	const settle = async (predicate?: () => boolean): Promise<void> => {
		const deadline = Date.now() + options.timeoutMs;
		let seen = received;
		while (Date.now() < deadline) {
			await Bun.sleep(120);
			const quiet = received === seen && Date.now() - lastGrowth >= options.quietMs;
			if (quiet && (predicate === undefined || predicate())) return;
			seen = received;
		}
	};
	const text = (): string => screen.lines().join("\n");
	await settle(() => text().includes("Total:"));
	if (options.form === "detail") {
		terminal.write("/budget detail\r");
		// The tree is what the detail form adds: the form is drawn once the session rows are.
		await settle(() => text().includes("Run:"));
	}
	const cells = drawnRows(screen.cells());
	const frame: CapturedFrame = { form: options.form, width: options.width, rows: cells.map(rowText), cells, recording: recording.join("") };
	child.kill();
	const exitCode = await child.exited;
	terminal.close();
	return { frame, exitCode };
}

/**
 * Capture this acceptance run in every form at every width, as the artifacts a person judges.
 *
 * Each frame is one run of its own (see {@link captureOne}), so the frame's own screen is the drawing
 * that run left: the brief is the form the entry starts in, and the detail form is the tree an
 * operator's own command switched it to. Every run's bytes are kept, in order, as this acceptance's
 * recording.
 */
export async function captureAcceptanceRun(
	run: AcceptanceRun,
	options: { readonly widths: readonly number[]; readonly rows?: number; readonly quietMs?: number; readonly timeoutMs?: number },
): Promise<CapturedRun> {
	const rows = options.rows ?? 40;
	const frames: CapturedFrame[] = [];
	let exitCode: number | null = null;
	for (const width of options.widths) {
		for (const form of ["brief", "detail"] as const) {
			const capture = await captureOne(run, { form, width, rows, quietMs: options.quietMs ?? 1200, timeoutMs: options.timeoutMs ?? 45_000 });
			frames.push(capture.frame);
			exitCode = capture.exitCode;
		}
	}
	return { frames, recording: frames.map(frame => frame.recording).join(""), exitCode };
}

/**
 * The cell column one text starts at on one row, or `-1` when the row does not carry it.
 *
 * The row is read as cells rather than characters, so the answer is the column the terminal put the
 * text in: a Chinese name, an emoji or a bar block before it takes the two columns the device gave it.
 */
export function cellColumnOf(row: readonly string[], text: string): number {
	const wanted = [...text];
	for (let start = 0; start + wanted.length <= row.length; start += 1) {
		let matched = true;
		for (const [offset, character] of wanted.entries()) {
			if (row[start + offset] !== character) {
				matched = false;
				break;
			}
		}
		if (matched) return start;
	}
	return -1;
}

/** One frame's rows that carry the given text, as the row's own drawn characters. */
export function rowsWith(frame: CapturedFrame, text: string): readonly string[] {
	return frame.rows.filter(row => row.includes(text));
}
