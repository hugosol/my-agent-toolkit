/**
 * The detail tree in a real terminal: what the frontend draws at real widths, and the columns it
 * lands in (P30–P33's evidence).
 *
 * Run it in a terminal so the frames below are drawn where an operator sees them:
 *
 * ```sh
 * bun run smoke:model-cost-detail-layout                    # the default widths
 * bun run smoke:model-cost-detail-layout --widths 140,90,64 # the widths to draw
 * ```
 *
 * What it does: binds the real extension over a self-made consumption tree — two children at one
 * depth under different parents, a grandchild under each, a long ASCII name and a Chinese one, a
 * session whose model and effort nothing proved, one whose context was never reported and one whose
 * runtime was never measured — flips the entry into `/budget detail`, and draws the production
 * frontend at each width. Every frame is printed twice, once with the host's own theme and once with
 * none, and beside each frame it prints the terminal column every field starts at, measured on the
 * drawn bytes with the theme's own escape sequences taken back off.
 *
 * It checks, per width: no line of the tree overruns the width, the fields of one depth group start
 * at one column on every row of it, and the columns of one group differ from another's. It also draws
 * one width, a narrow one and the first again, and reports whether the third is identical to the
 * first, which is what a resize has to answer. The coloured and the plain frame must report the same
 * columns: a theme adds escape sequences, never columns.
 *
 * The frames are what this terminal draws; the *reading* of an abbreviation or a wrap is a human's
 * judgement (P33), which this script prepares evidence for rather than decides.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { OmpExtensionApi, OmpSessionContext } from "../framework/adapters/omp";
import { MODEL_COST } from "../extensions/model-cost/definition";
import {
	type WidgetTheme,
	attachModelCostWidget,
	textColumns,
} from "../extensions/model-cost/harnesses/omp/widget";
import type { ConsumptionDocument } from "../extensions/model-cost/shared-logic/consumption-document";
import { MODEL_PRICING_DATA } from "../extensions/model-cost/shared-logic/model-data";
import type { ModelCostRuntime } from "../extensions/model-cost/shared-logic/runtime";
import { createModelCostRuntime } from "../extensions/model-cost/shared-logic/runtime";
import type { OwnerReference, SessionFacts } from "../framework/core/protocol";
import { portDouble } from "../tests/framework/support/harness-port-double";
import { uiBoundaryTimerOf } from "../tests/model-cost/support/ui-timer";

const HARNESS = "smoke-harness";
const CONSUMPTION_FILE = "consumption.json";
const OWNER: OwnerReference = { kind: "owner", key: "main:detail-layout-smoke" };
const MAIN: SessionFacts = { sessionId: "session-main", kind: "main", name: "主会话", unavailable: [] };
const MAIN_TARGET = { sessionId: "session-main", provider: "deepseek", model: "deepseek-flash" } as const;

/** The fields a report reads the column of: the ones a depth group lines up. */
const REPORTED_FIELDS = ["Model:", "Effort:", "Cache:", "Cost:", "Ctx:", "Run:"] as const;

/** The theme a terminal host draws with, as escape sequences a terminal really interprets. */
const ANSI_THEME: WidgetTheme = {
	fg: (color, text) => `\u001B[${ANSI_CODES[color] ?? "0"}m${text}\u001B[0m`,
	getThinkingBorderColor: level => text => `\u001B[${ANSICodeForLevel(level)}m${text}\u001B[0m`,
};

/** The SGR code each theme token is drawn with, as this CLI's own colours are approximated. */
const ANSI_CODES: Record<string, string> = {
	text: "0",
	dim: "2",
	muted: "90",
	success: "32",
	warning: "33",
	error: "31",
	thinkingHigh: "35",
	thinkingXhigh: "36",
	syntaxType: "36",
	syntaxNumber: "33",
	syntaxKeyword: "35",
};

/** The SGR code one thinking level is drawn with, from the level's own name. */
function ANSICodeForLevel(level: string): string {
	if (level === "high") return "35";
	if (level === "medium") return "36";
	if (level === "low") return "32";
	return "0";
}

/** The escape sequences taken back off, so a drawn line can be measured in the columns it occupies. */
function withoutAnsi(text: string): string {
	return text.replace(/\u001B\[[0-9;]*m/g, "");
}

/**
 * The tree this smoke draws: four descendants under one root, at two depths, with the fields a
 * terminal layout has to keep in line and the ones a group has to leave blank.
 */
function treeDocument(): ConsumptionDocument {
	return {
		schemaVersion: 1,
		periodId: "period-detail-layout-smoke",
		start: "2026-10-01T00:00:00.000Z",
		holiday: false,
		harnesses: {
			[HARNESS]: {
				sessions: [
					{
						id: "session-main",
						name: "主会话",
						parent: null,
						saveVersion: 1,
						own: {
							deepseek: {
								"deepseek-flash": {
									tokens: { input: 1000, cacheRead: 2000, cacheWrite: 0, output: 3000 },
									costCny: 0.05,
								},
							},
						},
					},
					{
						id: "session-research",
						name: "检索定价核查表",
						parent: "session-main",
						saveVersion: 1,
						own: {
							deepseek: {
								"deepseek-flash": {
									tokens: { input: 30, cacheRead: 20, cacheWrite: 0, output: 50 },
									costCny: 0.004,
								},
							},
						},
						runtimeMs: 480_000,
					},
					{
						id: "session-research-detail",
						name: "details-under-the-first-child",
						parent: "session-research",
						saveVersion: 1,
						own: {
							deepseek: {
								"deepseek-flash": { tokens: { input: 1, cacheRead: 1, cacheWrite: 0, output: 1 } },
							},
						},
						runtimeMs: 0,
					},
					{
						id: "session-pricing",
						name: "pricing-scan",
						parent: "session-main",
						saveVersion: 1,
						own: {
							deepseek: {
								"deepseek-flash": {
									tokens: { input: 100, cacheRead: 100, cacheWrite: 0, output: 100 },
									costCny: 0.01,
								},
							},
						},
						startup: { model: { provider: "deepseek", model: "deepseek-flash" }, effort: "high" },
					},
					{
						id: "session-pricing-check",
						name: "孙子代理乙",
						parent: "session-pricing",
						saveVersion: 1,
						own: {
							deepseek: {
								"deepseek-flash": {
									tokens: { input: 2, cacheRead: 2, cacheWrite: 0, output: 2 },
									costCny: 0.02,
								},
							},
						},
						startup: { model: { provider: "deepseek", model: "deepseek-flash" }, effort: "medium" },
					},
				],
			},
		},
	} as unknown as ConsumptionDocument;
}

/** One draw of the detail form at one width, as a host with a theme and without one was handed it. */
interface Frame {
	readonly painted: readonly string[];
	readonly plain: readonly string[];
}

/** The host the smoke draws through: it records the component and asks it for its lines at a width. */
interface RecordingHost {
	readonly ctx: OmpSessionContext;
	draw(width: number): Frame;
}

function recordingHost(): RecordingHost {
	let factories: ((tui: unknown, theme: WidgetTheme) => { render(width: number): string[] })[] = [];
	const ctx = {
		agent: { kind: "main", id: "Main" },
		hasUI: true,
		ui: {
			notify: () => {},
			setWidget: (key: string, content: unknown): void => {
				if (key !== "z-model-cost" || typeof content !== "function") return;
				factories.push(content as (typeof factories)[number]);
			},
		},
		sessionManager: { getSessionId: () => "session-main", getBranch: () => [] },
		model: { provider: "deepseek", id: "deepseek-flash" },
		getViewedSession: () => ({ ...MAIN_TARGET, effort: "high" }),
		subscribeViewedSessionChanged: () => () => {},
		setTimeout: () => undefined,
		clearTimer: () => {},
	} as unknown as OmpSessionContext;
	return {
		ctx,
		draw(width) {
			const factory = factories[factories.length - 1];
			if (factory === undefined) throw new Error("the frontend handed this host no component");
			factories = factories.slice(-1);
			return {
				painted: factory(undefined, ANSI_THEME).render(width),
				plain: factory(undefined, undefined as unknown as WidgetTheme).render(width),
			};
		},
	};
}

/** A controlled extension API that records the handlers the frontend registers. */
function controlApi(): { readonly api: OmpExtensionApi; fire(event: string, ctx: OmpSessionContext): void } {
	const handlers = new Map<string, Array<(event: unknown, ctx: OmpSessionContext) => void>>();
	return {
		api: {
			on(event: string, handler: (event: unknown, ctx: OmpSessionContext) => void): void {
				const existing = handlers.get(event) ?? [];
				existing.push(handler);
				handlers.set(event, existing);
			},
			pi: undefined,
		} as unknown as OmpExtensionApi,
		fire(event, ctx) {
			for (const handler of handlers.get(event) ?? []) handler({ type: event }, ctx);
		},
	};
}

/** One run's pieces, disposed by the caller. */
interface SmokeRun {
	readonly runtime: ModelCostRuntime;
	readonly host: RecordingHost;
	readonly root: string;
}

/** Binds the real extension over the tree above and flips its entry into the detail form. */
async function startRun(): Promise<SmokeRun> {
	const root = mkdtempSync(path.join(tmpdir(), "model-cost-detail-layout-smoke-"));
	writeFileSync(path.join(root, CONSUMPTION_FILE), JSON.stringify(treeDocument()), "utf8");
	const double = portDouble();
	let runtime: ModelCostRuntime | undefined;
	double.bind(MODEL_COST, {
		config: { reader: () => `storageDir: ${root}\nbalanceTtlMs: 30000\ncodexQuotaTtlMs: 15000\n` },
		factory: () =>
			(runtime = createModelCostRuntime({
				config: { storageDir: root },
				configDirectory: root,
				userHomeDirectory: root,
				harness: HARNESS,
				data: MODEL_PRICING_DATA,
			})).implementation,
	});
	double.deliverSession(OWNER, { session: MAIN });
	double.deliverSession(OWNER, { event: { kind: "session_facts" }, session: MAIN });
	await double.initiateRun(OWNER);
	await double.runToCompletion("budget", { args: "detail" });
	const built = runtime as ModelCostRuntime;
	// One descendant's own context reading, as its binding publishes it, and one session nothing
	// reported one for: the pair a group has to keep in line.
	built.sessionContext.observe("session-pricing-check", {
		tokens: 225_000,
		provider: "deepseek",
		model: "deepseek-flash",
	});
	const host = recordingHost();
	const { api, fire } = controlApi();
	attachModelCostWidget(api, built, uiBoundaryTimerOf(built), "component");
	fire("session_start", host.ctx);
	return { runtime: built, host, root };
}

/** One tree line's own fields, as the terminal column each of them starts at. */
function readColumns(line: string): ReadonlyMap<string, number> {
	const visible = withoutAnsi(line);
	const columns = new Map<string, number>();
	for (const field of REPORTED_FIELDS) {
		if (visible.includes(field)) columns.set(field, textColumns(visible.slice(0, visible.indexOf(field))));
	}
	return columns;
}

/** One field's column as the report writes it, or the root row's own empty field list. */
function columnText(columns: ReadonlyMap<string, number>): string {
	return columns.size === 0
		? "\u2014"
		: [...columns].map(([field, at]) => `${field.replace(":", "")}=${at}`).join(" ");
}

/**
 * Whether one group's rows all state the fields they have in common at the same column, which is what
 * "one depth is aligned" means: a field a row has none of simply does not appear on it.
 */
function agreesOnColumns(rows: readonly ReadonlyMap<string, number>[]): boolean {
	for (const [index, row] of rows.entries()) {
		for (const [field, at] of row) {
			for (const other of rows.slice(index + 1)) {
				const elsewhere = other.get(field);
				if (elsewhere !== undefined && elsewhere !== at) return false;
			}
		}
	}
	return true;
}

/** One tree line's own reading: the line, the columns its fields start at, and the width it takes. */
interface RowReading {
	readonly row: string;
	readonly columns: ReadonlyMap<string, number>;
	readonly width: number;
}

/** The lines from the root row down: the account and Total lines above it are a different layout. */
function treeOf(lines: readonly string[]): readonly string[] {
	const root = lines.findIndex(line => withoutAnsi(line) === "主会话");
	return root < 0 ? [] : lines.slice(root);
}

/** One tree line's own reading: the columns its fields start at, and the width it takes. */
function readRow(line: string): RowReading {
	return { row: line, columns: readColumns(line), width: textColumns(withoutAnsi(line)) };
}

/** Everything one run observed, as the checks the smoke reports. */
interface Observation {
	readonly name: string;
	readonly held: boolean;
	readonly detail: string;
}

/** One line of output describing a check's own outcome. */
function report(observations: Observation[]): boolean {
	let failed = false;
	for (const observation of observations) {
		if (!observation.held) failed = true;
		console.log(`${observation.held ? "PASS" : "FAIL"}  ${observation.name}: ${observation.detail}`);
	}
	return failed;
}

/** The widths a run draws, from `--widths a,b,c` or the ones a real terminal is likely to have. */
function requestedWidths(): number[] {
	const flag = process.argv.indexOf("--widths");
	const stated = flag < 0 ? undefined : (process.argv[flag + 1] ?? "");
	const widths = (stated ?? "160,120,100,80,60").split(",").map(value => Number(value.trim()));
	const usable = widths.filter(width => Number.isFinite(width) && width > 0).map(width => Math.floor(width));
	return usable.length === 0 ? [160, 120, 100, 80, 60] : usable;
}

/** The terminal's own width, as this process reads it, or nothing when it is not a terminal. */
function terminalWidth(): number | undefined {
	return process.stdout.isTTY === true ? process.stdout.columns : undefined;
}

const run = await startRun();
const observations: Observation[] = [];
const widthsToDraw = requestedWidths();
const terminal = terminalWidth();
console.log(`# detail tree in a real terminal, drawn through the production frontend`);
console.log(
	`# stdout is a terminal: ${process.stdout.isTTY === true}, reported width: ${terminal === undefined ? "unknown" : terminal}`,
);
console.log(`# widths drawn: ${widthsToDraw.join(", ")}`);

for (const width of widthsToDraw) {
	const frame = run.host.draw(width);
	const tree = treeOf(frame.plain);
	const painted = treeOf(frame.painted);
	console.log(`\n## width ${width}`);
	for (const line of tree) console.log(`  ${line}`);
	console.log(`  --- each line's own display width, and the column each field starts at`);
	const rows = tree.map(readRow);
	for (const reading of rows) {
		console.log(`    ${String(reading.width).padStart(3)}  ${columnText(reading.columns)}`);
	}
	observations.push({
		name: `no tree line overruns ${width} columns`,
		held: rows.every(reading => reading.width <= width),
		detail: `widest ${Math.max(...rows.map(reading => reading.width))} of ${width}`,
	});
	// The theme adds escape sequences and no columns: measured with them taken off, the coloured frame
	// reports exactly the columns the plain one does.
	observations.push({
		name: `the theme adds no column at ${width}`,
		held:
			painted.map(line => columnText(readColumns(line))).join("|") ===
			rows.map(reading => columnText(reading.columns)).join("|"),
		detail: `${painted.length} lines drawn with the host's own theme`,
	});
	// One depth's rows state their fields at one column: rows are grouped by the glyphs they are indented
	// with, by whether they are agent rows (which carry their startup facts) or the root's own model row,
	// and by which of the row's own lines this is — a wrapped group's continuation lines are compared with
	// the same line of their siblings, never with another line of the same row.
	const grouped = new Map<string, ReadonlyMap<string, number>[]>();
	let continuation = 0;
	for (const line of tree) {
		const glyphs = line.match(/^[\s\u2502\u251C\u2514\u2500]*/)?.[0] ?? "";
		continuation = /^\s/.test(line) ? continuation + 1 : 0;
		const key = `${textColumns(glyphs)}:${line.includes("Model:")}:${continuation}`;
		grouped.set(key, [...(grouped.get(key) ?? []), readColumns(line)]);
	}
	const groups = [...grouped.entries()].filter(([, columns]) => columns.length > 1);
	observations.push({
		name: `rows of one depth share their field columns at ${width}`,
		held: groups.length > 0 && groups.every(([, columns]) => agreesOnColumns(columns)),
		detail:
			groups.length === 0
				? "no group with more than one row at this width"
				: groups.map(([key, columns]) => `[depth ${key}] ${columns.map(columnText).join("  |  ")}`).join("; "),
	});
}

// A resize is a redraw: the same width answers the same lines again, whatever was drawn between.
const wide = run.host.draw(widthsToDraw[0] as number);
const narrow = run.host.draw(60);
const again = run.host.draw(widthsToDraw[0] as number);
observations.push({
	name: "a resize draws the same width the same way",
	held: again.plain.join("\n") === wide.plain.join("\n") && narrow.plain.join("\n") !== wide.plain.join("\n"),
	detail: `${wide.plain.length} lines at ${widthsToDraw[0]}, ${narrow.plain.length} at 60, identical on return`,
});

console.log("\n## summary");
const failed = report(observations);
rmSync(run.root, { recursive: true, force: true });
process.exitCode = failed ? 1 : 0;
