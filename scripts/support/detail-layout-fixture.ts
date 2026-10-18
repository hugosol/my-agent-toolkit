/**
 * The detail tree one layout run draws, and the host that draws it: the fixture this ticket's own
 * scripts share.
 *
 * The tree is what a terminal layout has to hold in line: two children at one depth under different
 * parents, a grandchild under each, a long ASCII name and a Chinese one, a session whose model and
 * effort nothing proved, one whose context was never reported and one whose runtime was never
 * measured. The host is a recorder: it keeps the component the frontend hands a UI and asks it for its
 * lines at a width, once with the theme a terminal host draws with and once with none.
 *
 * Both scripts of this ticket are about the same drawing, so both bind through here: the printed
 * smoke measures the lines the frontend hands over, and the terminal smoke measures the cells the
 * *device* draws them in.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { OmpExtensionApi, OmpSessionContext } from "../../framework/adapters/omp";
import type { OwnerReference, SessionFacts } from "../../framework/core/protocol";
import { MODEL_COST } from "../../extensions/model-cost/definition";
import {
	type WidgetTheme,
	attachModelCostWidget,
	textColumns,
} from "../../extensions/model-cost/harnesses/omp/widget";
import type { ConsumptionDocument } from "../../extensions/model-cost/shared-logic/foundation/session/consumption-document";
import { MODEL_PRICING_DATA } from "../../extensions/model-cost/shared-logic/business/pricing/model-data";
import type { ModelCostRuntime } from "../../extensions/model-cost/shared-logic/runtime";
import { createModelCostRuntime } from "../../extensions/model-cost/shared-logic/runtime";
import { portDouble } from "../../tests/framework/support/harness-port-double";
import { controlApi } from "../../tests/model-cost/support/control-api";
import { uiBoundaryTimerOf } from "../../tests/model-cost/support/ui-timer";

export const HARNESS = "smoke-harness";
export const CONSUMPTION_FILE = "consumption.json";
export const OWNER: OwnerReference = { kind: "owner", key: "main:detail-layout-smoke" };
export const MAIN: SessionFacts = { sessionId: "session-main", kind: "main", name: "主会话", unavailable: [] };
export const MAIN_TARGET = { sessionId: "session-main", provider: "deepseek", model: "deepseek-flash" } as const;

/**
 * The fields a report reads the column of, by the header each of them leads with: the ones the tree's
 * own rows state. A session row states no cached share of its conversation input, so `Cache:` is read
 * on the root's model row alone — a row a group of its own — while every field after it belongs to the
 * session depths. The startup snapshot a session row carries is the tree's one field with no header at
 * all, so it is read by its own shape and reported as {@link SNAPSHOT_FIELD}.
 */
export const REPORTED_FIELDS = ["Cache:", "Cost:", "Ctx:", "Run:"] as const;

/** The name a report reads the label-less field of a session row under: its startup snapshot. */
export const SNAPSHOT_FIELD = "Snapshot";

/**
 * How one startup snapshot is found on a drawn line: the model half, as short as an ellipsis left it,
 * immediately followed by the level in its own parentheses.
 */
const SNAPSHOT = /[^\s()]+\([^()]*\)/;

/** The theme a terminal host draws with, as escape sequences a terminal really interprets. */
export const ANSI_THEME: WidgetTheme = {
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
export function withoutAnsi(text: string): string {
	return text.replace(/\u001B\[[0-9;]*m/g, "");
}

/**
 * The tree the scripts draw: four descendants under one root, at two depths, with the fields a
 * terminal layout has to keep in line and the ones a group has to leave blank.
 */
export function treeDocument(): ConsumptionDocument {
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
export interface Frame {
	readonly painted: readonly string[];
	readonly plain: readonly string[];
}

/** The host the scripts draw through: it records the component and asks it for its lines at a width. */
export interface RecordingHost {
	readonly ctx: OmpSessionContext;
	draw(width: number): Frame;
}

export function recordingHost(): RecordingHost {
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

/** One run's pieces, disposed by the caller. */
export interface FixtureRun {
	readonly runtime: ModelCostRuntime;
	readonly host: RecordingHost;
	/** The storage root the run's consumption document lives in. */
	readonly root: string;
}

/** Binds the real extension over the tree above and flips its entry into the detail form. */
export async function bindDetailLayout(): Promise<FixtureRun> {
	const root = mkdtempSync(path.join(tmpdir(), "model-cost-detail-layout-"));
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
	built.sessionObservations.observeContext("session-pricing-check", {
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

/**
 * One tree line's own startup snapshot, or nothing while it carries none: the label-less field a
 * session row writes between its name and its statistics, `provider/model(effort)` with the model half
 * as short as a cut left it. Nothing else a row draws is shaped that way — a context reading's own
 * parentheses follow a space, so the text before them is not part of a `…(...)` of its own.
 *
 * It is what tells an agent row from the root's own model row at one depth, now that the snapshot
 * leads with no header: a session row carries one, whatever became of its columns, and a model row is
 * a pair of figures rather than a session and never does.
 */
export function snapshotOf(line: string): string | undefined {
	return SNAPSHOT.exec(withoutAnsi(line))?.[0];
}

/**
 * One tree line's own fields, as the terminal column each of them starts at.
 *
 * The startup snapshot is found by its own shape rather than by a header, and measured where the model
 * half of it begins — the field's own column, which is the one every row of its group states it at.
 */
export function readColumns(line: string): ReadonlyMap<string, number> {
	const visible = withoutAnsi(line);
	const columns = new Map<string, number>();
	const snapshot = snapshotOf(visible);
	if (snapshot !== undefined) columns.set(SNAPSHOT_FIELD, textColumns(visible.slice(0, visible.indexOf(snapshot))));
	for (const field of REPORTED_FIELDS) {
		if (visible.includes(field)) columns.set(field, textColumns(visible.slice(0, visible.indexOf(field))));
	}
	return columns;
}

/** One field's column as the report writes it, or the root row's own empty field list. */
export function columnText(columns: ReadonlyMap<string, number>): string {
	return columns.size === 0
		? "\u2014"
		: [...columns].map(([field, at]) => `${field.replace(":", "")}=${at}`).join(" ");
}

/**
 * Whether one group's rows all state the fields they have in common at the same column, which is what
 * "one depth is aligned" means: a field a row has none of simply does not appear on it.
 */
export function agreesOnColumns(rows: readonly ReadonlyMap<string, number>[]): boolean {
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
export interface RowReading {
	readonly row: string;
	readonly columns: ReadonlyMap<string, number>;
	readonly width: number;
}

/** The lines from the root row down: the account and Total lines above it are a different layout. */
export function treeOf(lines: readonly string[]): readonly string[] {
	const root = lines.findIndex(line => withoutAnsi(line) === "主会话");
	return root < 0 ? [] : lines.slice(root);
}

/** One tree line's own reading: the columns its fields start at, and the width it takes. */
export function readRow(line: string): RowReading {
	return { row: line, columns: readColumns(line), width: textColumns(withoutAnsi(line)) };
}
