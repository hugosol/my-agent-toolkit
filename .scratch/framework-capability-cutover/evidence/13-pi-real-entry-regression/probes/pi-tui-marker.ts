/**
 * Ticket 13 — codebase-tools on the real pi terminal UI: the marker area and the operator notices
 * as an operator's terminal really draws them, at the widths ticket 14 compares.
 *
 * This is not a permanent test. The existing `pi-codebase-tools-smoke.ts` observes the host's
 * `setWidget` and `notify` RPC frames; the contract hands the readability judgement to ticket 14
 * and explicitly refuses an RPC/headless transcript as a substitute for the real TUI. This probe
 * starts pi's own terminal UI (not RPC mode) with the production entrypoint, sends the extension's
 * own `/codebase-tools` command, and reads the screen back cell by cell with the repository's
 * terminal screen, at 120 and 60 columns.
 *
 * What it records (consumer-visible behavior only):
 *   1. the initial frame carries no marker line — an untouched session is off;
 *   2. the enable notice is drawn by the terminal, and the enabled frame carries the marker line
 *      `◈ codeBaseTools`;
 *   3. the disable notice is drawn, and the disabled frame no longer carries the marker line.
 *
 * Usage: PI_NODE=<node> bun .scratch/framework-capability-cutover/evidence/13-pi-real-entry-regression/probes/pi-tui-marker.ts [--pi <path>] [--widths 120,60] [--rows 40]
 * Output: probes/out/tui-marker/{report.json,screen-<width>-<step>.txt,recording-<width>.ansi}
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { buildSessionEnv } from "../../../../../tests/harness-dock/env";
import { type PiCli, type PiRun, piVersion, resolvePiCli, startPiRun } from "../../../../../tests/harness-dock/pi-session";
import { type TerminalScreen, WIDE_TAIL, terminalScreen } from "../../../../../scripts/support/terminal-screen";

const REPO_ROOT = path.resolve(import.meta.dir, "..", "..", "..", "..", "..");
const ENTRYPOINT = path.join(REPO_ROOT, "entrypoints", "pi", "codebase-tools.ts");
const OUT_DIR = path.join(import.meta.dir, "..", "p48", "codebase-tools-marker");

const PROVIDER = "deepseek";
const MODEL = "deepseek-flash";
const COMMAND = "/codebase-tools";
const MARKER_TEXT = "◈ codeBaseTools";
const ENABLED_NOTICE = "codeBaseTools enabled";
const DISABLED_NOTICE = "codeBaseTools disabled";

const DEFAULT_WIDTHS = [120, 60];
const DEFAULT_ROWS = 40;
const QUIET_MS = 1200;
const WAIT_TIMEOUT_MS = 45_000;

interface Check {
	readonly name: string;
	readonly pass: boolean;
	readonly detail: string;
}

interface Frame {
	readonly step: string;
	readonly width: number;
	readonly rows: readonly string[];
	readonly cells: readonly (readonly string[])[];
	readonly recording: string;
}

const checks: Check[] = [];

function check(name: string, ok: boolean, detail: string): void {
	checks.push({ name, pass: ok, detail });
	console.log(`  ${ok ? "ok" : "FAIL"}  ${name}`);
}

function optionValue(argv: readonly string[], name: string): string | undefined {
	const index = argv.indexOf(`--${name}`);
	if (index < 0) return undefined;
	const value = argv[index + 1];
	if (value === undefined || value.startsWith("--")) throw new Error(`--${name} needs a value`);
	return value;
}

/** One row's characters as a person reads them: a wide character once, its trailing cell left out. */
function rowText(row: readonly string[]): string {
	return row
		.filter(cell => cell !== WIDE_TAIL)
		.join("")
		.replace(/\s+$/, "");
}

/** The rows a frame really drew, without the terminal's own blank tail. */
function drawnRows(cells: readonly (readonly string[])[]): readonly (readonly string[])[] {
	return cells.filter(row => row.some(cell => cell !== " " && cell !== WIDE_TAIL));
}

/** One isolated user home, so no default agent state or configuration is read. */
function isolateHome(run: PiRun): Record<string, string> {
	const home = path.join(run.root.path, "user-home");
	mkdirSync(home, { recursive: true });
	return { USERPROFILE: home, HOME: home, HOMEDRIVE: path.parse(home).root, HOMEPATH: home.slice(path.parse(home).root.length - 1) };
}

/**
 * Start one real terminal UI at one width, drive the extension's command, and record the frames.
 *
 * The frames are taken once the process has stopped writing for `quietMs`, except the two notice
 * frames: those are taken the moment the notice text is on the screen, because the host draws a
 * notice transiently and a settled frame could legitimately no longer carry it.
 */
async function captureAt(cli: PiCli, width: number, rows: number): Promise<readonly Frame[]> {
	const run = startPiRun(cli, `tui-marker-${width}`, { provider: PROVIDER, model: MODEL, endpoint: { replyText: "tui-marker" } });
	const env = buildSessionEnv(process.env, {
		agentDir: run.root.agentDir,
		extra: {
			...isolateHome(run),
			PI_OFFLINE: "1",
			PI_SKIP_VERSION_CHECK: "1",
			PI_TELEMETRY: "0",
			TMPDIR: tmpdir(),
		},
	});
	const argv = [
		...cli.command,
		"--no-extensions",
		"-e",
		ENTRYPOINT,
		"--no-mcp",
		"--no-approve",
		"--session-dir",
		run.root.sessionDir,
		"--session-id",
		`ticket-13-tui-marker-${width}`,
		"--model",
		run.selector,
		"--tui-mode",
		"regular",
	];
	const screen: TerminalScreen = terminalScreen(width, rows);
	const recording: string[] = [];
	const decoder = new TextDecoder();
	let received = 0;
	let lastGrowth = Date.now();
	const terminal = new Bun.Terminal({
		cols: width,
		rows,
		data(_terminal, data) {
			const text = decoder.decode(data, { stream: true });
			recording.push(text);
			screen.feed(text);
			received += 1;
			lastGrowth = Date.now();
		},
	});
	const child = Bun.spawn(argv, { cwd: run.root.workDir, env, terminal });
	const text = (): string => screen.lines().join("\n");
	const settle = async (predicate?: () => boolean): Promise<boolean> => {
		const deadline = Date.now() + WAIT_TIMEOUT_MS;
		let seen = received;
		while (Date.now() < deadline) {
			await Bun.sleep(100);
			const quiet = received === seen && Date.now() - lastGrowth >= QUIET_MS;
			if (quiet && (predicate === undefined || predicate())) return true;
			seen = received;
		}
		return false;
	};
	const waitForText = async (needle: string): Promise<boolean> => {
		const deadline = Date.now() + WAIT_TIMEOUT_MS;
		while (Date.now() < deadline) {
			if (text().includes(needle)) return true;
			await Bun.sleep(50);
		}
		return false;
	};
	const frame = (step: string): Frame => {
		const cells = drawnRows(screen.cells());
		return { step, width, rows: cells.map(rowText), cells, recording: recording.join("") };
	};
	const frames: Frame[] = [];
	try {
		await settle();
		frames.push(frame("off"));
		terminal.write(`${COMMAND}\r`);
		const enabledSeen = await waitForText(MARKER_TEXT);
		const enabledNoticeSeen = await waitForText(ENABLED_NOTICE);
		frames.push(frame("enable-notice"));
		await settle(() => text().includes(MARKER_TEXT));
		frames.push(frame("enabled"));
		terminal.write(`${COMMAND}\r`);
		const disabledNoticeSeen = await waitForText(DISABLED_NOTICE);
		frames.push(frame("disable-notice"));
		await settle(() => !text().includes(MARKER_TEXT));
		frames.push(frame("disabled"));
		const off = frames.find(candidate => candidate.step === "off");
		const enabled = frames.find(candidate => candidate.step === "enabled");
		const disabled = frames.find(candidate => candidate.step === "disabled");
		check(`the initial frame carries no marker line (${width} columns)`, off !== undefined && !off.rows.join("\n").includes(MARKER_TEXT), off?.rows.join("\n").slice(0, 200) ?? "<no frame>");
		check(`the marker is drawn as soon as the command enables the entry (${width} columns)`, enabledSeen, `marker over ${width}: ${enabledSeen}`);
		check(`the enable notice is drawn in the real terminal (${width} columns)`, enabledNoticeSeen, `notice over ${width}: ${enabledNoticeSeen}`);
		check(`the enabled frame carries the marker line (${width} columns)`, enabled !== undefined && enabled.rows.join("\n").includes(MARKER_TEXT), enabled?.rows.join("\n").slice(0, 300) ?? "<no frame>");
		check(`the disable notice is drawn in the real terminal (${width} columns)`, disabledNoticeSeen, `notice over ${width}: ${disabledNoticeSeen}`);
		check(`the disabled frame no longer carries the marker line (${width} columns)`, disabled !== undefined && !disabled.rows.join("\n").includes(MARKER_TEXT), disabled?.rows.join("\n").slice(0, 300) ?? "<no frame>");
		return frames;
	} finally {
		child.kill();
		await child.exited;
		terminal.close();
		run.capture.stop();
		run.root.dispose();
	}
}

async function main(): Promise<void> {
	const argv = process.argv.slice(2);
	const cli = resolvePiCli(optionValue(argv, "pi"));
	const version = await piVersion(cli);
	const widths = (optionValue(argv, "widths") ?? DEFAULT_WIDTHS.join(","))
		.split(",")
		.map(part => Number(part.trim()))
		.filter(value => Number.isFinite(value) && value >= 20);
	const rows = Number(optionValue(argv, "rows") ?? String(DEFAULT_ROWS));
	console.log(`pi ${version} via ${cli.path}, ${widths.join("/")} columns, ${rows} rows`);
	mkdirSync(OUT_DIR, { recursive: true });
	const frames: Frame[] = [];
	let failure: unknown;
	try {
		for (const width of widths) frames.push(...(await captureAt(cli, width, rows)));
	} catch (error) {
		failure = error;
	} finally {
		for (const frame of frames) {
			writeFileSync(path.join(OUT_DIR, `screen-${frame.width}-${frame.step}.txt`), `${frame.rows.join("\n")}\n`, "utf8");
			writeFileSync(path.join(OUT_DIR, `recording-${frame.width}-${frame.step}.ansi`), frame.recording, "utf8");
		}
		const report = {
			source: { pi: { path: cli.path, version }, entrypoint: ENTRYPOINT, host: `${process.platform} ${process.arch}`, bun: Bun.version },
			widths,
			rows,
			checks,
			frames: frames.map(frame => ({ step: frame.step, width: frame.width, drawnRows: frame.rows.length })),
			failure: failure === undefined ? null : String(failure),
			humanAcceptance: "unconfirmed: the readability of these real-TUI frames is ticket 14's human judgement",
		};
		writeFileSync(path.join(OUT_DIR, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
	}
	console.log(`\n${checks.length} check(s): ${checks.filter(entry => entry.pass).length} passed, ${checks.filter(entry => !entry.pass).length} failed`);
	if (failure !== undefined) throw failure;
	if (checks.some(entry => !entry.pass)) process.exitCode = 1;
}

await main();
