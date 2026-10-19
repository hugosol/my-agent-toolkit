/**
 * The real-terminal acceptance of this migration's TUI promise (P52), on the fixed scenario.
 *
 * What this script is for: a person judging whether the same business content is readable in a real
 * terminal — brief and detail, the agent tree, the unknown and unmeasured markers, and what narrowing
 * a terminal does to them. It therefore runs the *real* pi terminal UI and not an RPC session, and it
 * starts the fixed scenario in this repository's own isolated real-host shape (see
 * `support/tui-acceptance-fixture.ts`): the installed pi CLI, the production entrypoint, the pinned
 * subagent provider beside it, an isolated agent state, home and storage root, and a local endpoint
 * answering the extension's own balance query.
 *
 * Usage
 *   bun scripts/pi-tui-acceptance.ts                    # capture the evidence: every width × form
 *   bun scripts/pi-tui-acceptance.ts --interactive      # the operator's own real TUI, to look at
 *   bun scripts/pi-tui-acceptance.ts --widths 120,80,60 # another set of widths
 *   bun scripts/pi-tui-acceptance.ts --pi <path>        # a named pi CLI, or PI_CLI=<path>
 *   bun scripts/pi-tui-acceptance.ts --out <dir>        # where the captures are written
 *
 * The capture run measures the frames it drew, and the checks are about the drawing an operator's
 * terminal really held:
 *
 * - the entry loaded, the extension bound, and the terminal UI drew its widget (an account row and a
 *   Total row) — a component the host never drew would leave no frame to read;
 * - every business field the display promises is on the frame at every width: the season mark, the
 *   fixed budget's bar with the effort, the balance reading this run's endpoint answered, the period's
 *   accrual, the session span, and each session row's own amount and runtime marker;
 * - the unknown and unmeasured content is on the frame as its own markers — `?(?)` where nothing
 *   proved a session's beginning, `Run: —` where nothing measured its executions, `Run: 0ms` where an
 *   execution really took no measurable time, and a row with no `Cost:` field where the amount is
 *   unknown while the usage is known;
 * - the detail form is the tree: the main session's row and its five descendants, one group per depth,
 *   with a depth's own rows stating their fields in the same terminal column and a deeper group
 *   indented past the shallower one — measured in the terminal's *cells*, so a Chinese name counts the
 *   columns the device gave it;
 * - narrowing the terminal takes the names and the startup snapshots (with the display's own ellipsis)
 *   and leaves every figure whole: the amount and runtime each row states at the widest width is still
 *   on the frame at the narrowest one, and the Total line the brief shows is the very line the detail
 *   keeps;
 * - the run's own recording (every byte the process wrote), each frame's screen text and, when this
 *   machine has a headless browser to render them with, one image per frame are written beside the
 *   report — the images are a rendering of the captured cells, not a grab of a window.
 *
 * What this script does not decide: whether any of it *reads well*. That is the person's judgement the
 * ticket asks for, and the report keeps it as unconfirmed until they give it.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { resolvePiCli } from "../tests/harness-dock/pi-session";
import {
	ACCRUED,
	BALANCE_TOTAL,
	type CapturedFrame,
	type CapturedRun,
	PROVIDER_ENTRY,
	SCENARIO_SESSIONS,
	TOTAL_COST,
	TOTAL_SPAN,
	UNPROVEN_START,
	cellColumnOf,
	captureAcceptanceRun,
	prepareAcceptanceRun,
	rowsWith,
} from "./support/tui-acceptance-fixture";

/** The pi version this acceptance's expectations were written against. */
const EXPECTED_PI_VERSION = "1.2.0";

/** The widths a capture run draws in unless a run names its own: a normal terminal and a narrow one. */
const DEFAULT_WIDTHS = "120,60";
/** How many rows the captured terminal has. */
const DEFAULT_ROWS = 40;
/** Where this script writes its captures unless a run names a directory. */
const DEFAULT_OUT = path.join(".scratch", "model-cost-pi-migration", "evidence", "tui-acceptance");

/** One check this run made, as the report states it. */
interface Observation {
	readonly name: string;
	readonly held: boolean;
	readonly detail: string;
}

/** Every check of one capture run, and the way each of them is reported. */
class Observations {
	readonly #all: Observation[] = [];

	held(name: string, condition: boolean, detail: string): void {
		this.#all.push({ name, held: condition, detail });
	}

	/**
	 * Whether a frame carries every one of the given texts.
	 *
	 * The texts are the scenario's own figures and names, hand-derived from the seeded document rather
	 * than read back from the drawing, so one check states a whole frame's required content and the
	 * report names exactly which piece is missing when it is.
	 */
	carries(frame: CapturedFrame, name: string, texts: readonly string[]): void {
		const text = frame.rows.join("\n");
		const missing = texts.filter(wanted => !text.includes(wanted));
		this.held(`${name} (${frame.form}, ${frame.width} columns)`, missing.length === 0, missing.length === 0 ? `all of: ${texts.join(", ")}` : `missing: ${missing.join(", ")}`);
	}

	all(): readonly Observation[] {
		return this.#all;
	}
}

/** One command-line option's value, from `--name <value>` and the environment a run may name it in. */
function optionValue(argv: readonly string[], name: string, fallback: string): string {
	const index = argv.indexOf(`--${name}`);
	if (index >= 0) {
		const value = argv[index + 1];
		if (value === undefined || value.startsWith("--")) throw new Error(`--${name} needs a value`);
		return value;
	}
	return fallback;
}

/** The widths one capture run draws, as `--widths a,b,c` or this script's own pair. */
function requestedWidths(argv: readonly string[]): readonly number[] {
	const widths = optionValue(argv, "widths", DEFAULT_WIDTHS)
		.split(",")
		.map(part => Number(part.trim()))
		.filter(width => Number.isFinite(width) && width >= 20);
	if (widths.length === 0) throw new Error("--widths names no usable width (each must be at least 20 columns)");
	return widths;
}

/** The cells one field starts at on each given row of one frame, as the terminal's own columns. */
function fieldColumns(frame: CapturedFrame, labels: readonly string[]): readonly number[] {
	return labels.map(label => cellColumnOf(frame.cells[frame.rows.indexOf(label)] as readonly string[], "Run:"));
}

/** Whether every one of the given columns is the same one. */
function oneColumn(columns: readonly number[]): boolean {
	return columns.length > 0 && columns.every(column => column === columns[0]);
}

/** Every amount one frame states, in the order the rows state them. */
function amountsOf(frame: CapturedFrame): readonly string[] {
	return frame.rows.join("\n").match(/\u00A5[A-Za-z/]+[\uFF1A:][-0-9:]+|\u00A5[0-9]+(?:\.[0-9]+)?/g) ?? [];
}

/** Every runtime marker one frame states, in the order the rows state them. */
function runtimesOf(frame: CapturedFrame): readonly string[] {
	return frame.rows.flatMap(row => (/\bRun: ([^ ]+)/.exec(row) ?? []).slice(1));
}

/**
 * Whether one row states a session's name, whole or as the abbreviation the display cut it to.
 *
 * A narrowed row may keep only the beginning of a name, and the ellipsis it writes says so; what no
 * width may do is drop the name. So the row is accepted when it holds the whole name or any prefix of
 * it (one character or more) followed by that mark — how short a name a narrow terminal leaves is the
 * person's readability judgement, and the report hands it to them rather than deciding it here.
 */
function carriesName(row: string, name: string): boolean {
	if (row.includes(name)) return true;
	for (let kept = name.length - 1; kept >= 1; kept -= 1) {
		if (row.includes(`${name.slice(0, kept).replace(/\s+$/, "")}\u2026`)) return true;
	}
	return false;
}

/** The one check of one frame's own content: what the display promises is on it. */
function checkFrameContent(observations: Observations, frame: CapturedFrame): void {
	observations.carries(frame, "the account row draws the season, the bar's effort, the balance reading and the accrual", [
		"Effort:",
		`Balance: \u00A5${BALANCE_TOTAL}`,
		`Accrued: ${ACCRUED}`,
	]);
	observations.carries(frame, "the Total row draws its cache share, its ratio, the tree's amount and the session span", ["Total:", "Cache:", "\u00A5Cache/In/Out\uFF1A", `Cost: ${TOTAL_COST}`, `Span: ${TOTAL_SPAN}`]);
}

/** The one check of the detail form's content: the tree's own rows, each saying what its record holds. */
function checkTreeContent(observations: Observations, frame: CapturedFrame): void {
	const texts = frame.rows.join("\n");
	const amounts = SCENARIO_SESSIONS.flatMap(session => (session.cost === undefined ? [] : [`Cost: ${session.cost}`]));
	const missingAmounts = amounts.filter(amount => !texts.includes(amount));
	const markers = SCENARIO_SESSIONS.map(session => `Run: ${session.runtime}`);
	const missingMarkers = markers.filter(marker => !texts.includes(marker));
	const missingNames = ["主会话", ...SCENARIO_SESSIONS.map(session => session.name)].filter(name => !frame.rows.some(row => carriesName(row, name)));
	observations.held(
		`every session's own amount is drawn on the tree (${frame.width} columns)`,
		missingAmounts.length === 0,
		missingAmounts.length === 0 ? amounts.join(", ") : `missing: ${missingAmounts.join(", ")}`,
	);
	observations.held(
		`every session's own runtime marker is drawn on the tree (${frame.width} columns)`,
		missingMarkers.length === 0,
		missingMarkers.length === 0 ? markers.join(", ") : `missing: ${missingMarkers.join(", ")}`,
	);
	observations.held(
		`every session is named, as far as the width allowed (${frame.width} columns)`,
		missingNames.length === 0,
		missingNames.length === 0 ? `${SCENARIO_SESSIONS.length + 1} names drawn` : `missing: ${missingNames.join(", ")}`,
	);
	const unproven = frame.rows.filter(row => row.includes(UNPROVEN_START)).length;
	const expectedUnproven = SCENARIO_SESSIONS.filter(session => session.unprovenStart).length;
	observations.held(
		`a session nothing proved begins on ${UNPROVEN_START}, and only those do (${frame.width} columns)`,
		unproven === expectedUnproven,
		`rows drawing ${UNPROVEN_START}: ${unproven}, expected ${expectedUnproven}`,
	);
	const zero = frame.rows.find(row => row.includes("Run: 0ms"));
	observations.held(
		`a session whose amount is unknown draws its usage without an amount (${frame.width} columns)`,
		zero !== undefined && !zero.includes("Cost:"),
		zero === undefined ? "no row states Run: 0ms" : zero,
	);
}

/**
 * The layout check of the widest detail frame: the tree's depths, their own columns and their order.
 *
 * A row of the tree's own is one line here, which the count of rows stating a runtime establishes: the
 * five descendants are the five rows, so no group has wrapped one of them across two lines and the
 * indent measured below is the row's own. Each depth group then has to state its fields in one column
 * — measured in the terminal's cells, so the Chinese name counts the two columns each of its
 * characters took — and the row of a deeper session has to be drawn after its parent's.
 */
function checkTreeLayout(observations: Observations, frame: CapturedFrame): void {
	const sessionRows = rowsWith(frame, "Run:");
	const indentOf = (row: string): number => {
		const cells = frame.cells[frame.rows.indexOf(row)] as readonly string[];
		return cells.findIndex(cell => cell !== " ");
	};
	const shallower = sessionRows.filter(row => indentOf(row) === 2);
	const deeper = sessionRows.filter(row => indentOf(row) === 4);
	const shallowColumns = fieldColumns(frame, shallower);
	const deepColumns = fieldColumns(frame, deeper);
	observations.held(
		`the tree draws one line per session, so a row's indent is its depth (${frame.width} columns)`,
		sessionRows.length === SCENARIO_SESSIONS.length,
		`rows stating a runtime: ${sessionRows.length}, expected ${SCENARIO_SESSIONS.length}`,
	);
	observations.held(
		`one depth states each field in the terminal column its own rows keep (${frame.width} columns)`,
		oneColumn(shallowColumns) && oneColumn(deepColumns),
		`Run: at ${shallowColumns.join("/") || "—"} for the shallower depth, ${deepColumns.join("/") || "—"} for the deeper one`,
	);
	const parentAt = frame.rows.findIndex(row => carriesName(row, "检索定价核查表") && row.includes("Run:"));
	const childAt = frame.rows.findIndex(row => carriesName(row, "details-under-the-first-child"));
	observations.held(
		`a descendant is drawn under its own parent (${frame.width} columns)`,
		parentAt >= 0 && childAt > parentAt,
		`the parent's row is ${parentAt}, its child's ${childAt}`,
	);
}

/**
 * The check narrowing is about: what the widest frame states, the narrowest still states whole.
 *
 * A narrowed terminal is allowed to cut a name or the model half of a startup snapshot — that is the
 * frontend's own abbreviation, and the ellipsis says so — but it is never allowed to lose a figure: so
 * every amount and runtime the widest detail frame drew is required on the narrowest one in the same
 * form, and the model-and-level a session began on is required to keep its level whatever became of the
 * model half.
 */
function checkNarrowing(observations: Observations, widest: CapturedFrame, narrowest: CapturedFrame): void {
	const narrow = narrowest.rows.join("\n");
	const wide = widest.rows.join("\n");
	const lostAmounts = [...new Set(amountsOf(widest))].filter(amount => amount.startsWith("\u00A50") && !narrow.includes(amount));
	const lostRuntimes = [...new Set(runtimesOf(widest))].filter(runtime => !narrow.includes(`Run: ${runtime}`));
	const keptAmounts = [...new Set(amountsOf(widest))].filter(amount => amount.startsWith("\u00A50")).length;
	observations.held(
		`every amount the ${widest.width}-column frame states is still whole at ${narrowest.width}`,
		lostAmounts.length === 0,
		lostAmounts.length === 0 ? `${keptAmounts} amounts kept` : `lost: ${lostAmounts.join(", ")}`,
	);
	observations.held(
		`every runtime marker the ${widest.width}-column frame states is still whole at ${narrowest.width}`,
		lostRuntimes.length === 0,
		lostRuntimes.length === 0 ? `${new Set(runtimesOf(widest)).size} markers kept` : `lost: ${lostRuntimes.join(", ")}`,
	);
	observations.held(
		`the narrowed frame cuts the names and snapshots it cannot fit and says so (${narrowest.width} columns)`,
		narrow.includes("\u2026"),
		narrow.includes("\u2026") ? "the display's own ellipsis is drawn" : "no abbreviation mark on the narrowed frame",
	);
	observations.held(
		`the level a session began on survives narrowing (${narrowest.width} columns)`,
		wide.includes("(high)") && narrow.includes("(high)"),
		`wide frame carries the level: ${wide.includes("(high)")}, narrow frame keeps it: ${narrow.includes("(high)")}`,
	);
}

/** The observation that the Total line is one line of the drawing rather than a form's own. */
function checkTotalIsOneLine(observations: Observations, frames: readonly CapturedFrame[]): void {
	for (const width of [...new Set(frames.map(frame => frame.width))]) {
		const totals = frames.filter(frame => frame.width === width).map(frame => rowsWith(frame, "Total:").join("\u0001"));
		observations.held(
			`the Total line the brief shows is the line the detail keeps (${width} columns)`,
			totals.length >= 2 && totals.every(total => total === totals[0]),
			`brief: ${totals[0] ?? "—"} / detail: ${totals[1] ?? "—"}`,
		);
	}
}

/** Every check one capture run's frames are held to, as the report states them. */
function checkRun(run: CapturedRun, version: string, widths: readonly number[]): readonly Observation[] {
	const observations = new Observations();
	observations.held("the run drove the pi version this acceptance states", version === EXPECTED_PI_VERSION, `pi reported ${version}, expected ${EXPECTED_PI_VERSION}`);
	observations.held("the pinned provider artifact this repository installs is present", existsSync(PROVIDER_ENTRY), PROVIDER_ENTRY);
	observations.held(
		"every width was captured in both forms",
		widths.every(width => run.frames.filter(frame => frame.width === width).length === 2),
		run.frames.map(frame => `${frame.form}@${frame.width}`).join(", "),
	);
	observations.held(
		"more than one width was drawn, so narrowing is observable",
		widths.length > 1,
		`widths: ${widths.join(", ")}`,
	);
	observations.held(
		"the extension and the pinned provider were the extensions this run loaded",
		run.recording.includes("model-cost.ts") && run.recording.includes("pi-subagents"),
		`the run's own terminal named: ${["model-cost.ts", "pi-subagents"].filter(name => run.recording.includes(name)).join(", ") || "neither"}`,
	);
	observations.held(
		"the run's terminal holds no load failure",
		!/Cannot find module|error:/i.test(run.recording),
		/Cannot find module|error:/i.exec(run.recording)?.[0] ?? "none",
	);

	for (const frame of run.frames) {
		checkFrameContent(observations, frame);
		if (frame.form === "detail") checkTreeContent(observations, frame);
		else
			observations.held(
				`the brief draws no tree (${frame.width} columns)`,
				rowsWith(frame, "Run:").length === 0,
				`rows stating a runtime: ${rowsWith(frame, "Run:").length}`,
			);
	}

	const details = run.frames.filter(frame => frame.form === "detail");
	const widest = details.reduce<CapturedFrame | undefined>((widestSoFar, frame) => (widestSoFar === undefined || frame.width > widestSoFar.width ? frame : widestSoFar), undefined);
	const narrowest = details.reduce<CapturedFrame | undefined>((narrowestSoFar, frame) => (narrowestSoFar === undefined || frame.width < narrowestSoFar.width ? frame : narrowestSoFar), undefined);
	if (widest !== undefined) checkTreeLayout(observations, widest);
	if (widest !== undefined && narrowest !== undefined && widest.width !== narrowest.width) checkNarrowing(observations, widest, narrowest);
	checkTotalIsOneLine(observations, run.frames);
	return observations.all();
}

/**
 * A PNG of one captured frame, when this machine has a headless browser to render it with.
 *
 * The image is a rendering of the frames' own cells at the terminal's cell grid — not a grab of any
 * window — and it exists so a person who is not at that terminal can see what it held. A machine with
 * no browser gets no image, which the report says rather than papers over.
 */
function renderScreenshot(frame: CapturedFrame, target: string, browser: string): boolean {
	const html = [
		"<!doctype html><meta charset=\"utf-8\">",
		"<style>html,body{margin:0;background:#0c0c0c}pre{margin:0;padding:10px;color:#d4d4d4;",
		"font:14px/17px Consolas,'DejaVu Sans Mono',monospace;white-space:pre;tab-size:8}</style>",
		`<pre>${frame.rows.join("\n").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>`,
	].join("");
	const page = path.join(tmpdir(), `model-cost-tui-acceptance-${path.basename(target)}.html`);
	writeFileSync(page, html, "utf8");
	const width = frame.width * 9 + 40;
	const height = (frame.rows.length + 1) * 18 + 40;
	const rendered = Bun.spawnSync(
		[browser, "--headless=new", "--disable-gpu", "--hide-scrollbars", `--screenshot=${target}`, `--window-size=${width},${height}`, `file:///${page.replace(/\\/g, "/")}`],
		{ stdout: "pipe", stderr: "pipe" },
	);
	return rendered.exitCode === 0 && existsSync(target);
}

/** The headless browser one run may render its captures with: a named one, or the usual places. */
function screenshotBrowser(): string | undefined {
	const named = process.env.PI_TUI_SCREENSHOT_TOOL;
	const candidates = [
		...(named === undefined || named.length === 0 ? [] : [named]),
		"C:/Program Files/Google/Chrome/Application/chrome.exe",
		"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
		"/usr/bin/chromium",
		"/usr/bin/google-chrome",
	];
	return candidates.find(candidate => existsSync(candidate));
}

/** One run's captured frames, recordings and images, written where a person and a report can find them. */
function writeArtifacts(out: string, run: CapturedRun, browser: string | undefined): { readonly files: readonly string[]; readonly images: readonly string[] } {
	mkdirSync(out, { recursive: true });
	const files: string[] = [];
	const images: string[] = [];
	for (const frame of run.frames) {
		const screen = path.join(out, `screen-${frame.form}-${frame.width}.txt`);
		writeFileSync(screen, `${frame.rows.join("\n")}\n`, "utf8");
		files.push(screen);
		const recording = path.join(out, `recording-${frame.form}-${frame.width}.ansi`);
		writeFileSync(recording, frame.recording, "utf8");
		files.push(recording);
		if (browser === undefined) continue;
		const image = path.join(out, `screen-${frame.form}-${frame.width}.png`);
		if (renderScreenshot(frame, image, browser)) {
			images.push(image);
			files.push(image);
		}
	}
	return { files, images };
}

/** One run's own summary of its checks, printed the way this repository's smokes print theirs. */
function reportObservations(observations: readonly Observation[]): boolean {
	let failed = 0;
	for (const observation of observations) {
		if (!observation.held) failed += 1;
		console.log(`${observation.held ? "ok  " : "FAIL"}  ${observation.name} — ${observation.detail}`);
	}
	console.log(`\n${observations.length - failed} ok / ${failed} failed`);
	return failed > 0;
}

/** The operator's own real TUI: the run's isolated root, the entry loaded, and the terminal handed over. */
async function interactiveShell(argv: readonly string[]): Promise<void> {
	const cli = resolvePiCli(optionValue(argv, "pi", process.env.PI_CLI ?? ""));
	const run = await prepareAcceptanceRun({ cli, label: "tui-acceptance-interactive" });
	console.log(`# the real pi terminal UI, fixed scenario, isolated run root: ${run.root.path}`);
	console.log(`# pi ${run.version} from ${run.cli.path}`);
	console.log(`# agent state: ${run.root.agentDir}`);
	console.log(`# storage root: ${run.storageDirectory}`);
	console.log("# the entry starts in the brief form: type /budget detail for the agent tree, /budget brief to return.");
	console.log("# narrow the window (or drag it) to see what the form does with fewer columns; /exit or ctrl+c ends the run.");
	const child = Bun.spawn([...run.cli.command, ...run.argv], { cwd: run.root.workDir, env: run.env, stdio: ["inherit", "inherit", "inherit"] });
	const exitCode = await child.exited;
	run.capture.stop();
	console.log(`\n# the run exited with ${exitCode}; its isolated root is kept for inspection: ${run.root.path}`);
	console.log("# the storage root still holds the seeded scenario; remove the root yourself, this script does not.");
}

const argv = process.argv.slice(2);
if (argv.includes("--interactive")) {
	await interactiveShell(argv);
} else {
	const widths = requestedWidths(argv);
	const rows = Number(optionValue(argv, "rows", String(DEFAULT_ROWS)));
	const cli = resolvePiCli(optionValue(argv, "pi", process.env.PI_CLI ?? ""));
	const providerEntry = optionValue(argv, "provider", PROVIDER_ENTRY);
	const quietMs = Number(optionValue(argv, "quiet-ms", "1200"));
	const out = path.resolve(optionValue(argv, "out", DEFAULT_OUT));
	const run = await prepareAcceptanceRun({ cli, label: "tui-acceptance", providerEntry });
	try {
		const captured = await captureAcceptanceRun(run, { widths, rows, quietMs });
		const observations = checkRun(captured, run.version, widths);
		const browser = screenshotBrowser();
		const written = writeArtifacts(out, captured, browser);
		const summary = {
			source: {
				pi: { path: run.cli.path, version: run.version },
				entrypoint: run.argv[run.argv.indexOf("-e") + 1],
				providerEntry,
				host: `${process.platform} ${process.arch}`,
				bun: Bun.version,
			},
			scenario: {
				document: readFileSync(run.consumptionFile, "utf8"),
				storageDirectory: run.storageDirectory,
				agentState: run.root.agentDir,
				widths,
				rows,
			},
			observed: captured.frames.map(frame => ({ form: frame.form, width: frame.width, rows: frame.rows.length })),
			observations,
			artifacts: written.files,
			images: written.images.length === 0 ? "unavailable: no headless browser on this machine" : written.images,
			humanAcceptance: "unconfirmed: the format, spacing, narrow-width behaviour and overall readability of this real TUI are the person's judgement the ticket asks for",
		};
		const report = path.join(out, "report.json");
		mkdirSync(out, { recursive: true });
		writeFileSync(report, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
		console.log(`# real pi TUI, ${run.version} from ${run.cli.path}, widths ${widths.join(", ")}, rows ${rows}`);
		console.log(`# scenario: ${run.storageDirectory}`);
		console.log(`# artifacts: ${out}`);
		console.log(`# images: ${summary.images}\n`);
		const failed = reportObservations(observations);
		console.log(`\n# human acceptance (P52) — look at the real terminal yourself: bun scripts/pi-tui-acceptance.ts --interactive`);
		console.log("# the person judges the format, spacing, narrow-width behaviour and readability; this run does not.");
		process.exitCode = failed ? 1 : 0;
	} finally {
		run.dispose();
	}
}
