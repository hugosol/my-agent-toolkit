/**
 * The OMP frontend: the one native widget this extension's read-only display is drawn through.
 *
 * This is the extension's own harness-specific half (ADR-0002: native presentation is the
 * extension's, not the framework's). It owns the native surface and nothing else: which widget key
 * the display is drawn under, when the widget is created and cleared, the events that make it
 * re-read, and the two things only a terminal knows — the theme a colour is drawn with and the width a
 * line has to fit. Everything it draws comes from `runtime.presentation` — the read-only display
 * result — so the mode gating, the two currencies, the fixed budget, every figure, every threshold and
 * every word are decided once, in shared logic, and this frontend only maps what that result describes
 * onto the native surface: a described emphasis becomes one of the theme's own colours, and a line that
 * does not fit the width is drawn in the narrower form shared logic already stated for it.
 *
 * Three rules of the display live here because only the host knows them:
 *
 * - **No widget where there is none to draw.** A session without a UI draws nothing, and a model
 *   whose mode is `hidden` is not this extension's display at all: its widget is *not created*
 *   (and an earlier one is cleared) rather than shown empty. Neither touches what the session runs.
 * - **A change is a re-read.** The rendered lines are built from the current display result at the
 *   moment of drawing: the accounting's own change notifications, the host's session transitions,
 *   its public Viewed session change subscription and the UI's own boundary wait all end in the same
 *   re-read, so the widget never holds a stale reading of its own.
 * - **The host's own drawing decides the form.** A host that draws components is handed one, so the
 *   theme and the width are the host's own and are read at drawing time; a host that draws lines is
 *   handed the plain text of the same lines and no colour codes, because there is no theme to map
 *   them into. Which of the two this CLI is, is its assembly's reading of the host (see
 *   `WidgetDrawing`), not a decision of this module's.
 *
 * The fourth rule is this file's layout: the rows a display result carries are labelled and indented
 * here — the brief's one `Round` row, and the continuation bars and connectors of the detail form's
 * static tree, whose rows only state their distance from the root. The one thing a row hands this
 * frontend beyond its text is the emphasis its name may carry, and painting that is a mapping like any
 * other: the tree's running session is handed over as one of the theme's own colours, and a name with
 * no emphasis is written exactly as it always was. How a terminal draws a depth is a frontend's
 * business; which rows there are, what each row's own figures are and whether a name is emphasised at
 * all is shared logic's.
 *
 * The Viewed session outlet is the host's public one (`ctx.getViewedSession()` /
 * `ctx.subscribeViewedSessionChanged()`), read here rather than through a private controller or a
 * rendered line, and read defensively: a host that publishes no outlet answers with nothing, and
 * the widget then falls back to the session it is bound to rather than inventing the displayed one.
 */
import type {
	OmpExtensionApi,
	OmpSessionContext,
	OmpSessionEvent,
	OmpViewedSessionFacts,
} from "../../../../adapters/omp";
import {
	type AgentTreeRow,
	type ConsumptionDisplay,
	type DisplayAccrued,
	type DisplayEmphasis,
	type DisplayLine,
	type DisplayPiece,
	type DisplayPeriod,
	type DisplayRow,
	type DisplayTarget,
	accruedLine,
	balanceLine,
	budgetLine,
	contextText,
	fieldsColumns,
	lineText,
	roundColumns,
	runtimeText,
	seasonMark,
	totalColumns,
} from "../../shared-logic/presentation/display";
import type { ProviderBalanceResult } from "../../shared-logic/business/pricing/provider-balance";
import type { ModelCostRuntime } from "../../shared-logic/runtime";
import type { BoundaryTimer } from "../boundary-timer";

/** The native widget key the usage widget is drawn under: this extension's own, not the marker area. */
export const MODEL_COST_WIDGET_KEY = "z-model-cost";

/**
 * How this CLI's UI draws what a frontend hands it.
 *
 * `component` is a UI that asks for the lines itself, so it hands a factory the theme to draw with and
 * the width to fit; `lines` is a UI that takes text alone, where a colour code would be text nobody
 * mapped and a width nobody stated. A host that draws components is the interactive one, which is what
 * its own assembly reads the CLI to be; the headless RPC host takes lines, and so does a session with
 * no UI at all.
 */
export type WidgetDrawing = "component" | "lines";

/**
 * The native theme one drawn line is coloured with, as a component factory is handed it.
 *
 * Only the two members this frontend maps are named: a colour token, and the colour a thinking level
 * is drawn with — the effort value is coloured by its level rather than by one fixed token, because
 * the level is what the colour means.
 */
export interface WidgetTheme {
	fg(color: string, text: string): string;
	getThinkingBorderColor(level: string): (text: string) => string;
}

/** The component a component factory answers with: the lines one host has asked for at one width. */
export interface WidgetComponent {
	render(width: number): string[];
}

/**
 * The theme token each described emphasis is drawn with.
 *
 * The mapping is this frontend's own and the tokens are the ones these lines have always been drawn
 * with — a budget bar's four bands, the balance's two warnings, one window's pacing, and the eight
 * colours the accrued bar's sessions cycle through — so a described emphasis keeps the exact shade it
 * had before the display was split into shared logic and a frontend. `effort` is not here: it is the
 * one emphasis whose colour is the level's own. `active` is not one of those older shades either: a
 * session that is working right now is drawn with the theme's `accent`, which every theme states and
 * which nothing else on these lines uses.
 */
const EMPHASIS_COLORS: Record<Exclude<DisplayEmphasis, "effort">, string> = {
	plain: "text",
	dim: "dim",
	muted: "muted",
	success: "success",
	warning: "warning",
	error: "error",
	active: "accent",
	segment1: "success",
	segment2: "warning",
	segment3: "error",
	segment4: "thinkingHigh",
	segment5: "thinkingXhigh",
	segment6: "syntaxType",
	segment7: "syntaxNumber",
	segment8: "syntaxKeyword",
};

/**
 * What the host's public Viewed session outlet publishes, as this frontend reads it: the facts the
 * framework's adapter resolves for its own projection, plus the display facts this widget draws.
 */
type ViewedSessionFacts = OmpViewedSessionFacts & {
	readonly provider?: string;
	readonly model?: string;
	readonly effort?: string;
	readonly context?: { readonly tokens?: number; readonly contextWindow?: number };
};

/**
 * The context this frontend draws through: the native session context, plus the public outlet the
 * patched host adds to every context it builds.
 *
 * The outlet members are optional because the host publishes them only from the approved patch
 * onward, and the ADR keeps the adapter's native surface at the members the framework itself uses:
 * this frontend widens that reading with the display facts only it needs.
 */
interface WidgetContext extends OmpSessionContext {
	getViewedSession?(): ViewedSessionFacts;
	subscribeViewedSessionChanged?(listener: (facts: ViewedSessionFacts) => void): () => void;
	/**
	 * The bound session's own context reading, the native surface every host has published since
	 * before the viewed-session outlet existed.
	 *
	 * It is read only when the host publishes no outlet at all — the approved patch is not installed,
	 * so there is no separate view and the session this widget is bound to is the one being drawn.
	 * A host that publishes the outlet is read through it alone. Optional, because a host that
	 * reports no reading has no bar rather than a guessed one.
	 */
	getContextUsage?(): { readonly tokens?: number; readonly contextWindow?: number } | undefined;
	/**
	 * The session's managed one-shot timer, exactly as the harness hands it out: the handle is passed
	 * back to {@link WidgetContext.clearTimer} and is cleared with the session.
	 *
	 * The framework's adapter names only the members its own mapping uses, so the native timer surface
	 * the boundary wait schedules on is named here, in the extension's own native half — and it is read
	 * as the session's own member rather than as a platform timer, so a session's teardown clears the
	 * timer this frontend armed.
	 */
	setTimeout(callback: () => void, ms: number): unknown;
	clearTimer(timer: unknown): void;
}

/**
 * The native extension API this frontend draws through.
 *
 * It is the framework adapter's own surface, which already names the bound session's actual
 * effective thinking level — the native getter every host has published all along — beside the
 * members the framework's own mapping uses.
 */
type WidgetApi = OmpExtensionApi;

/** The native UI surface this frontend draws on, widened to the component form it may hand over. */
interface WidgetUi {
	notify(message: string, type?: "info" | "warning" | "error"): void;
	setWidget(
		key: string,
		content: readonly string[] | undefined | ((tui: unknown, theme: WidgetTheme) => WidgetComponent),
		options?: { readonly placement?: "aboveEditor" | "belowEditor" },
	): void;
}

/**
 * Everything one draw of the usage widget reads, in the order it is written: the target's own display
 * result, the process-wide balance reading, the pricing period, the period's accrual, and the
 * allowance lines at the width this draw has.
 */
export interface WidgetReading {
	readonly display: ConsumptionDisplay;
	readonly balance: ProviderBalanceResult;
	readonly period: DisplayPeriod;
	readonly accrued: DisplayAccrued;
	readonly quota: readonly DisplayLine[];
	/**
	 * The width this draw has to fit, where the host stated one, and nothing where it stated none.
	 *
	 * Only a host that draws components has a width at all: it asks the frontend for its lines at the
	 * width of its own terminal, so a narrower window is a fresh, narrower layout — which is what
	 * makes a resize a redraw rather than a re-wrap by the host. A host that takes plain text states
	 * no width, and the layout it is handed is the fullest form of every line.
	 */
	readonly width?: number;
}

/**
 * The Total and Round rows laid out together, at the widths that make their fields line up.
 *
 * Every column is right-aligned to the widest value at its position and, where a column follows it,
 * padded to the widest field, so each field starts at the same column whichever row it is on. A
 * row's last column is left unpadded, so no line carries trailing blanks. The two rows are different
 * scopes — the Total is the session's own current model and the whole main tree; the Round is that
 * target's additions within one Round — so the same field can hold a different figure on each row
 * and still start at the same column.
 */
function alignedLines(rows: readonly DisplayRow[]): DisplayLine[] {
	const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
	const valueWidths: number[] = [];
	const fieldWidths: number[] = [];
	for (let index = 0; index < columnCount; index++) {
		let valueWidth = 0;
		let fieldWidth = 0;
		for (const row of rows) {
			const column = row[index];
			if (column === undefined) continue;
			valueWidth = Math.max(valueWidth, column.value.length);
			fieldWidth = Math.max(fieldWidth, column.label.length + column.value.length);
		}
		valueWidths.push(valueWidth);
		fieldWidths.push(fieldWidth);
	}
	return rows.map(row =>
		row.map((column, index) => {
			const field = `${column.label}${column.value.padStart(valueWidths[index])}`;
			return { text: index < row.length - 1 ? field.padEnd(fieldWidths[index]) : field };
		}),
	);
}

/** One row's line with its own fixed prefix ahead of the first column. */
function prefixedLine(prefix: string, line: DisplayLine): DisplayLine {
	return line.map((piece, index) => (index === 0 ? { ...piece, text: `${prefix}${piece.text}` } : piece));
}

/**
 * The lines the detail form draws for the static agent tree: the root by its name, one line per model
 * the root itself consumed, and one line per descendant session.
 *
 * The prefix is this frontend's own: a model row is *not* an agent node, so it carries the tree's
 * continuation bar without a connector, while an agent row carries the connector its position among
 * its siblings calls for — the last of a parent's children closes with `└`, every earlier one branches
 * with `├`. A row's distance from the root is the only thing the shared result states; how a terminal
 * draws it is here.
 *
 * The rows of one kind at one distance from the root are laid out as one grid: their names, the
 * startup snapshot a session carries — the model it began on with the effective effort it began with,
 * `provider/model(effort)` with `?` where nothing proved a part — the statistics their own scope
 * carries, the current context reading a session's own binding published as
 * `Ctx: percent (tokens/budget)`, and the accumulated subagent runtime a session's executions were
 * measured at, all start at the same column on every one of those rows. A field one row has none of
 * leaves its column empty instead of pulling the fields after it left, and two depths share no width
 * at all: a grandchild's own longer name sizes its own group and moves nothing above it. The rows
 * themselves keep their order and their tree: one row per session, drawn where the relations put it.
 *
 * What each row *states* is shared logic's — every name, figure, `?` and `—` — and this width-aware
 * drawing never rewrites one: a line too narrow for the group abbreviates a name or a snapshot with an
 * ellipsis — keeping the snapshot's own level, which is the half an operator reads the row for — and,
 * narrower still, wraps the group's fields at one break for all of its rows. The full value is in the
 * display result either way, and in the document behind it.
 */
function treeLines(rows: readonly AgentTreeRow[], width: number | undefined): DisplayLine[] {
	const gridRows: TreeGridRow[] = rows.map((row, index) => {
		const next = rows[index + 1];
		const last = next === undefined || next.depth <= row.depth;
		const continuation = "\u2502  ".repeat(Math.max(0, row.depth - 1));
		const prefix =
			row.depth === 0
				? ""
				: row.kind === "session"
					? `${continuation}${last ? "\u2514\u2500 " : "\u251C\u2500 "}`
					: `${continuation}\u2502  `;
		const cells: TreeCell[] = [
			{
				field: TREE_NAME_FIELD,
				label: "",
				value: row.name,
				abbreviated: true,
				// The one cell a row can carry an emphasis on, as the row itself stated it: a descendant
				// session whose own Round is open right now. Nothing is decided here — the emphasis the row
				// carries is copied through, and the theme's colour for it is the painter's business.
				...(row.nameEmphasis === undefined ? {} : { emphasis: row.nameEmphasis }),
			},
		];
		if (row.startup !== undefined) {
			cells.push({
				field: TREE_STARTUP_FIELD,
				label: "",
				value: row.startup.text,
				abbreviated: true,
				// The half of the snapshot a column too narrow for it keeps whole: the effective level the
				// session began with, which is what an operator compares one session's beginning with
				// another's by. Everything the cut drops is the model half beside it.
				keepTail: row.startup.tail,
			});
		}
		if (row.fields !== undefined) {
			// The scope's own columns, as the display states them: a channel's cache rate and ratio and
			// the amounts it carries, dashes included, with nothing re-decided on the way into the grid.
			// The cell is keyed by the statistic the column *is* rather than by the wording this row draws
			// it with, so two rows of one group put one statistic in one column of it.
			for (const column of fieldsColumns(row.fields)) {
				cells.push({ field: column.field, label: column.label, value: column.value, abbreviated: false });
			}
		}
		if (row.context !== undefined) {
			cells.push({
				field: TREE_LABELS.context,
				label: TREE_LABELS.context,
				value: contextText(row.context),
				abbreviated: false,
			});
		}
		if (row.kind === "session") {
			// Drawn on every session row, an unavailable figure as its own marker: the value is one the
			// host measured, so "none was reported" and "the reported figure was zero" stay apart.
			cells.push({
				field: TREE_LABELS.runtime,
				label: TREE_LABELS.runtime,
				value: runtimeText(row.runtimeMs),
				abbreviated: false,
			});
		}
		return { prefix, cells };
	});
	// One group per kind at one depth, each row remembered at its own place in the tree: a group says
	// how its rows are laid out, never where in the tree they are drawn.
	const groups = new Map<string, { readonly rows: TreeGridRow[]; readonly at: number[] }>();
	gridRows.forEach((gridRow, index) => {
		const key = `${(rows[index] as AgentTreeRow).kind}:${(rows[index] as AgentTreeRow).depth}`;
		const group = groups.get(key) ?? { rows: [], at: [] };
		group.rows.push(gridRow);
		group.at.push(index);
		groups.set(key, group);
	});
	const drawn = new Map<number, readonly DisplayLine[]>();
	for (const group of groups.values()) {
		const groupLines = gridRowLines(treeGridOf(group.rows), width);
		group.at.forEach((index, position) => drawn.set(index, groupLines[position] as DisplayLine[]));
	}
	return gridRows.map((_row, index) => drawn.get(index) as DisplayLine[]).flat();
}

/** The gap one agent-tree row writes between two of its columns, in display columns. */
const TREE_GAP_COLUMNS = 2;

/** That gap as the text a row writes there. */
const TREE_GAP = " ".repeat(TREE_GAP_COLUMNS);

/** The fewest display columns a name or model column keeps when a group has to be abbreviated. */
const MIN_ABBREVIATED_COLUMNS = 4;

/** The field an agent-tree row's own name is: the column every row of a group writes first. */
const TREE_NAME_FIELD = "name";

/** The field a session row's startup snapshot is: the label-less column it writes after its name. */
const TREE_STARTUP_FIELD = "startup";

/** The label each remaining field of an agent-tree row leads with, which is the field it aligns by too. */
const TREE_LABELS = {
	context: "Ctx: ",
	runtime: "Run: ",
} as const;

/**
 * The display columns one text takes in a terminal.
 *
 * A character takes one column, except the East Asian wide and fullwidth ones — a Chinese character, a
 * fullwidth colon, a Hangul syllable — which take two, and the combining and zero-width ones, which
 * take none. Measuring this way is what makes a column the *terminal's* column rather than the
 * string's: `子代理` is three characters and six columns, so a row named that one is padded by the six
 * columns it really occupies, and a row named in ASCII is padded by exactly what its name takes. A
 * frontend that counted characters would line its rows up on paper and misalign them on screen, which
 * is why no width here is ever a string's own length.
 */
export function textColumns(text: string): number {
	let columns = 0;
	for (const character of text) {
		const point = character.codePointAt(0) as number;
		if (isZeroWidth(point)) continue;
		columns += isWide(point) ? 2 : 1;
	}
	return columns;
}

/** Whether one code point is drawn in the two columns an East Asian wide or fullwidth character takes. */
function isWide(point: number): boolean {
	return (
		(point >= 0x1100 && point <= 0x115f) ||
		point === 0x2329 ||
		point === 0x232a ||
		(point >= 0x2e80 && point <= 0x303e) ||
		(point >= 0x3041 && point <= 0x33ff) ||
		(point >= 0x3400 && point <= 0x4dbf) ||
		(point >= 0x4e00 && point <= 0x9fff) ||
		(point >= 0xa000 && point <= 0xa4cf) ||
		(point >= 0xa960 && point <= 0xa97f) ||
		(point >= 0xac00 && point <= 0xd7a3) ||
		(point >= 0xf900 && point <= 0xfaff) ||
		(point >= 0xfe10 && point <= 0xfe19) ||
		(point >= 0xfe30 && point <= 0xfe6f) ||
		(point >= 0xff00 && point <= 0xff60) ||
		(point >= 0xffe0 && point <= 0xffe6) ||
		(point >= 0x1f300 && point <= 0x1f64f) ||
		(point >= 0x1f900 && point <= 0x1f9ff) ||
		(point >= 0x20000 && point <= 0x3fffd)
	);
}

/** Whether one code point takes no column at all: a combining mark, a joiner, a variation selector. */
function isZeroWidth(point: number): boolean {
	return (
		(point >= 0x0300 && point <= 0x036f) ||
		(point >= 0x1ab0 && point <= 0x1aff) ||
		(point >= 0x1dc0 && point <= 0x1dff) ||
		(point >= 0x200b && point <= 0x200f) ||
		(point >= 0x2060 && point <= 0x2064) ||
		(point >= 0xfe00 && point <= 0xfe0f) ||
		(point >= 0xfe20 && point <= 0xfe2f)
	);
}

/**
 * One text cut to at most `columns` display columns, with an ellipsis marking whatever was dropped.
 *
 * The cut never splits a wide character in half — a terminal has whole columns — and the ellipsis is
 * what tells the operator the text they are reading is the beginning of a longer one. The text itself
 * is untouched: this is a drawing of a name, never a change to the value behind it.
 */
function cutColumns(text: string, columns: number): string {
	if (textColumns(text) <= columns) return text;
	if (columns < 1) return "";
	const kept: string[] = [];
	let taken = 0;
	for (const character of text) {
		const point = character.codePointAt(0) as number;
		const width = isZeroWidth(point) ? 0 : isWide(point) ? 2 : 1;
		if (taken + width > columns - 1) break;
		kept.push(character);
		taken += width;
	}
	return `${kept.join("")}\u2026`;
}

/**
 * One field of one agent-tree row, as the grid lays it out: the field it belongs to, the label it
 * leads with, the text after that label, and whether a line with no room for it may abbreviate the
 * text.
 *
 * The field — not the cell's position — is what rows are aligned by: two rows of one group state the
 * same field at the same column whether or not either of them has a field the other has none of, so a
 * ratio, an amount, a context reading or a runtime only one of them carries leaves a slot the width of
 * that group's own column rather than shifting everything after it left. The label is apart from the
 * text so that a column too narrow for the whole cell is cut to the value it states: an operator
 * reading `Ctx: …` still knows which field they are looking at, while a cell whose label is empty —
 * the name, and the startup snapshot beside it — is cut like any other value.
 */
interface TreeCell {
	readonly field: string;
	readonly label: string;
	readonly value: string;
	readonly abbreviated: boolean;
	/**
	 * The tail of the value a column too narrow for the whole cell keeps whole, where a cell has one.
	 *
	 * It is what the value's own end means rather than padding: a session's startup snapshot states the
	 * effective level it began with there, so a narrowed column cuts the model half beside it and lets
	 * the ellipsis fall there rather than dropping the level an operator reads the row for. Absent on
	 * every other cell, which narrows by cutting its own end.
	 */
	readonly keepTail?: string;
	/**
	 * The row's own semantic emphasis for this cell, where shared logic stated one.
	 *
	 * Only a name carries one — a descendant session that is working right now — and it is copied from
	 * the display result rather than decided here: this frontend's part is to hand the description to
	 * `paintedLine`, which maps it onto a colour of its theme, and to draw every other cell as it
	 * stands.
	 */
	readonly emphasis?: DisplayEmphasis;
}

/** One agent-tree row as the grid lays it out: the glyphs it is indented by and the fields it writes. */
interface TreeGridRow {
	/** The tree's own glyphs for this row: the continuation bars, and the connector its position takes. */
	readonly prefix: string;
	/** The row's fields in the order this row writes them, its own name — without its glyphs — first. */
	readonly cells: readonly TreeCell[];
}

/**
 * The rows of one kind at one distance from the root, with the room each of their fields gets.
 *
 * A group is the whole alignment unit: every row of it states each field at the same column, and two
 * groups share no column width at all. Rows are grouped by where they sit in the tree rather than by
 * the parent they hang from — a grandchild's name sizes the grandchild group alone — and the root's
 * own model rows are rows of one session's pairs rather than agent nodes, so they are a group of their
 * own rather than sharing a subagent group's columns.
 */
interface TreeGrid {
	readonly rows: readonly TreeGridRow[];
	/** The fields the group writes, in an order every one of its rows' own orders allows. */
	readonly fields: readonly string[];
	/** How many display columns each field's column has, from the widest text the group writes there. */
	readonly widths: ReadonlyMap<string, number>;
	/** How few display columns each field's column may be cut to before abbreviating it states nothing. */
	readonly floors: ReadonlyMap<string, number>;
	/** How many display columns the group's glyphs take, which is the same on every row of it. */
	readonly prefixColumns: number;
}

/**
 * The fields one group writes, in an order that keeps every one of its rows' own orders.
 *
 * A row states its fields in the order it draws them, and the group it lands in may not change that
 * order: a session row's startup snapshot sits between its name and its statistics and stays there, and a
 * model row's statistics come straight after its name. So the group's order is the merge of the rows'
 * own orders — every field a row writes after another is written after it, a field only some rows
 * carry takes the place those rows give it, and the one order every row agrees with is what the group
 * draws. Reading that order off the rows is also what keeps this frontend free of a list of field
 * names: a channel's own ratio column and a mode's own amounts need no spelling here.
 */
function mergedFieldOrder(rows: readonly TreeGridRow[]): string[] {
	const written: string[] = [];
	const precedes = new Map<string, Set<string>>();
	for (const row of rows) {
		for (const cell of row.cells) {
			if (written.includes(cell.field)) continue;
			written.push(cell.field);
			precedes.set(cell.field, new Set());
		}
		for (let index = 1; index < row.cells.length; index += 1) {
			precedes.get((row.cells[index] as TreeCell).field)?.add((row.cells[index - 1] as TreeCell).field);
		}
	}
	const order: string[] = [];
	while (order.length < written.length) {
		const next = written.find(
			field => !order.includes(field) && [...(precedes.get(field) ?? [])].every(before => order.includes(before)),
		);
		// A group's rows cannot contradict each other here — a row writes each of its own fields once, in
		// the order it draws them — so one field always remains placeable; falling back to what was
		// written keeps a future shape that breaks that from looping rather than from throwing.
		const field = next ?? (written.find(candidate => !order.includes(candidate)) as string);
		order.push(field);
	}
	return order;
}

/** One group's grid, from its rows alone: the fields they write and the room each of them needs. */
function treeGridOf(rows: readonly TreeGridRow[]): TreeGrid {
	const fields = mergedFieldOrder(rows);
	const widths = new Map<string, number>();
	const floors = new Map<string, number>();
	for (const field of fields) {
		const cells = rows
			.map(row => row.cells.find(candidate => candidate.field === field))
			.filter((cell): cell is TreeCell => cell !== undefined);
		widths.set(
			field,
			cells.reduce((widest, cell) => Math.max(widest, textColumns(`${cell.label}${cell.value}`)), 0),
		);
		// A column may be cut down to its own label, the widest tail any of the group's cells keeps whole
		// and an ellipsis and no further, so a narrowed terminal still says which field a value belongs to
		// and a snapshot keeps the level it began on: the column is the group's, so the level of the row
		// with the longest one is what it may not fall below. A name, whose label and tail are both empty,
		// keeps the few columns below which an ellipsis would be the whole cell.
		floors.set(
			field,
			Math.max(
				MIN_ABBREVIATED_COLUMNS,
				cells.reduce((floor, cell) => Math.max(floor, textColumns(`${cell.label}${cell.keepTail ?? ""}`) + 1), 0),
			),
		);
	}
	return {
		rows,
		fields,
		widths,
		floors,
		// A depth's glyphs are the same width on every row of it — the continuation bar and the connector
		// both take three columns — so the group has one prefix count, and it is its widest row's.
		prefixColumns: rows.reduce((widest, row) => Math.max(widest, textColumns(row.prefix)), 0),
	};
}

/** The last of a group's fields one row really writes: the fields after it are not drawn on that row. */
function lastWrittenField(row: TreeGridRow, fields: readonly string[]): number {
	let last = -1;
	for (const [index, field] of fields.entries()) {
		if (row.cells.some(cell => cell.field === field)) last = index;
	}
	return last;
}

/**
 * How many display columns one row's own line takes at the widths its group is drawn with.
 *
 * A field the row has none of still takes its column — that is what the grid is for — so the line is
 * measured over every field up to the row's own last one, whether or not the row wrote anything there.
 */
function rowColumns(grid: TreeGrid, row: TreeGridRow, widths: ReadonlyMap<string, number>): number {
	let columns = grid.prefixColumns;
	const written = grid.fields.slice(0, lastWrittenField(row, grid.fields) + 1);
	for (const [index, field] of written.entries()) {
		if (index > 0) columns += TREE_GAP_COLUMNS;
		columns += widths.get(field) ?? 0;
	}
	return columns;
}

/**
 * A group's fields after its name, wrapped at the one break every row of the group uses.
 *
 * As many fields per line as the width the group has left, so a narrow terminal's continuation lines
 * carry whole fields at the group's own columns. Wrapping is the group's, never a row's own: a row that
 * wrapped itself would put the same field at a different column from the rows it is compared with.
 */
function wrappedFields(
	fields: readonly string[],
	widths: ReadonlyMap<string, number>,
	available: number,
): readonly (readonly string[])[] {
	const chunks: string[][] = [];
	let chunk: string[] = [];
	let columns = 0;
	for (const field of fields) {
		const width = widths.get(field) ?? 0;
		const needed = chunk.length === 0 ? width : TREE_GAP_COLUMNS + width;
		if (chunk.length > 0 && columns + needed > available) {
			chunks.push(chunk);
			chunk = [field];
			columns = width;
			continue;
		}
		chunk.push(field);
		columns += needed;
	}
	if (chunk.length > 0) chunks.push(chunk);
	return chunks;
}

/**
 * One cell as a column too narrow for it writes it: its own label, and as much of its value as the
 * column has left, with an ellipsis marking whatever was dropped. A column narrower than the label
 * itself is the whole cell's own opening columns, which is the one case where the label is cut too.
 *
 * A cell whose tail is kept whole — a session's startup snapshot, whose effective level is the half
 * that says which session began where — spends that tail's own columns first, so what the ellipsis cuts
 * is the model half beside it rather than the level. A column with no room for the label and the tail
 * together falls back to the plain cut, which is what keeps this from stating a tail alone.
 */
function abbreviatedCell(cell: TreeCell, columns: number): string {
	const label = textColumns(cell.label);
	if (label >= columns) return cutColumns(`${cell.label}${cell.value}`, columns);
	const tail = cell.keepTail ?? "";
	const tailColumns = textColumns(tail);
	if (tail !== "" && cell.value.endsWith(tail) && label + tailColumns < columns) {
		const head = cell.value.slice(0, cell.value.length - tail.length);
		return `${cell.label}${cutColumns(head, columns - label - tailColumns)}${tail}`;
	}
	return `${cell.label}${cutColumns(cell.value, columns - label)}`;
}

/**
 * One line's own fields: each in the group's own column, the row's own last of them unpadded, because a
 * line writes no blanks after its own last field.
 *
 * A field the row has none of is written as the group's column of blanks, which is what keeps the
 * fields after it at the columns the rest of the group has them at; and a field a narrow line had no
 * room for is written as the group's column of its own text, abbreviated with an ellipsis.
 */
function treeFieldsOf(
	grid: TreeGrid,
	row: TreeGridRow,
	fields: readonly string[],
	widths: ReadonlyMap<string, number>,
): string {
	const last = lastWrittenField(row, grid.fields);
	return fields
		.map(field => {
			const columns = widths.get(field) ?? 0;
			const cell = row.cells.find(candidate => candidate.field === field);
			const text =
				cell === undefined
					? ""
					: cell.abbreviated
						? abbreviatedCell(cell, columns)
						: `${cell.label}${cell.value}`;
			if (grid.fields.indexOf(field) === last) return text;
			return `${text}${" ".repeat(Math.max(0, columns - textColumns(text)))}`;
		})
		.join(TREE_GAP);
}

/**
 * One group's rows as the lines they are drawn on at one width, one entry per row of the group.
 *
 * Three forms, narrowest last: the group's full columns on one line per row; those columns abbreviated
 * together where a name or a model identifier has no room, each cut marked with an ellipsis; and, where
 * even that is too wide, the group's fields wrapped at one break for every row — each continuation line
 * carrying its own fields indented to the column the group's fields start at, and the row's name stated
 * once, on its first line. A host that stated no width gets the first form: there is nothing to fit a
 * line into, and a headless drawing states every field in full.
 */
function gridRowLines(grid: TreeGrid, width: number | undefined): readonly (readonly DisplayLine[])[] {
	const widths = new Map(grid.widths);
	const nameColumns = (): number => widths.get(TREE_NAME_FIELD) ?? 0;
	const widest = (): number => grid.rows.reduce((columns, row) => Math.max(columns, rowColumns(grid, row, widths)), 0);
	const abbreviable = new Set(
		grid.rows.flatMap(row => row.cells.filter(cell => cell.abbreviated).map(cell => cell.field)),
	);
	// Narrower than the group: the fields that may be abbreviated lose columns together, the widest of
	// them first, until the group fits the line it is drawn on. A column stops at its own floor — its
	// label and an ellipsis — because past that an operator could not tell the field from another.
	while (width !== undefined && widest() > width) {
		const candidates = [...widths.entries()]
			.filter(([field, columns]) => abbreviable.has(field) && columns > (grid.floors.get(field) ?? MIN_ABBREVIATED_COLUMNS))
			.sort(([, left], [, right]) => right - left);
		const candidate = candidates[0];
		if (candidate === undefined) break;
		const floor = grid.floors.get(candidate[0]) ?? MIN_ABBREVIATED_COLUMNS;
		widths.set(candidate[0], Math.max(floor, candidate[1] - (widest() - width)));
	}
	// The group's fields start at one column on every row: the name column's own end, glyphs included.
	const indent = grid.prefixColumns + nameColumns() + TREE_GAP_COLUMNS;
	const available = width === undefined ? 0 : width - indent;
	const wrapped =
		width === undefined || widest() <= width || available < 1
			? undefined
			: wrappedFields(grid.fields.slice(1), widths, available);
	return grid.rows.map(row => {
		const last = lastWrittenField(row, grid.fields);
		const name = row.cells.find(cell => cell.field === TREE_NAME_FIELD) as TreeCell;
		const nameText = name.abbreviated
			? cutColumns(`${name.label}${name.value}`, nameColumns())
			: `${name.label}${name.value}`;
		// The row's own leading columns, as pieces: the tree's glyphs, then the name as a piece of its
		// own — the one cell a row carries an emphasis on, and an emphasis has to be painted around the
		// name alone rather than around the glyphs that indent it.
		const head: DisplayPiece[] = [];
		if (row.prefix.length > 0) head.push({ text: row.prefix });
		head.push({
			text: nameText,
			separator: "",
			...(name.emphasis === undefined ? {} : { emphasis: name.emphasis }),
		});
		// The blanks that carry the group's name column out to where its fields start, and the fields
		// themselves behind the gap. A row whose last field is its name writes neither.
		const blanks = " ".repeat(Math.max(0, nameColumns() - textColumns(nameText)));
		const withFields = (fields: string): DisplayPiece[] => [
			...head,
			...(blanks.length === 0 ? [] : [{ text: blanks, separator: "" }]),
			{ text: `${TREE_GAP}${fields}`, separator: "" },
		];
		if (wrapped === undefined) {
			const fields = grid.fields.slice(1, last + 1);
			return [withinWidthPieces(fields.length === 0 ? head : withFields(treeFieldsOf(grid, row, fields, widths)), width)];
		}
		const lines: DisplayLine[] = [];
		for (const [position, chunk] of wrapped.entries()) {
			const carried = chunk.filter(field => grid.fields.indexOf(field) <= last);
			if (carried.length === 0) break;
			const fields = treeFieldsOf(grid, row, carried, widths);
			lines.push(
				withinWidthPieces(
					position === 0 ? withFields(fields) : [{ text: `${" ".repeat(indent)}${fields}` }],
					width,
				),
			);
		}
		return lines;
	});
}

/**
 * One line's pieces as the host will really take them: the pieces themselves, or, at a width the
 * group could not be laid out inside at all — one column wider than the whole line, which is a
 * terminal narrower than the tree's own indentation — the line cut with an ellipsis rather than handed
 * over overflowing.
 *
 * The cut is the one a single string would get, column for column: one column of the width is kept for
 * the ellipsis, the pieces before the cut are kept whole, and the piece the cut lands in carries the
 * ellipsis. Which piece that is does not change where the cut falls — a painted line is measured in
 * the columns it occupies, not in the pieces it was assembled from — so splitting the name out of the
 * line cannot move what survives a narrow terminal.
 */
function withinWidthPieces(pieces: readonly DisplayPiece[], width: number | undefined): DisplayLine {
	if (width === undefined) return pieces;
	const total = pieces.reduce((columns, piece) => columns + textColumns(piece.text), 0);
	if (total <= width) return pieces;
	let budget = width - 1;
	const kept: DisplayPiece[] = [];
	for (const piece of pieces) {
		const columns = textColumns(piece.text);
		if (columns <= budget) {
			kept.push(piece);
			budget -= columns;
			continue;
		}
		return [...kept, { ...piece, text: cutColumns(piece.text, budget + 1) }];
	}
	// The loop above returns at the piece the cut lands in whenever the pieces really are wider than the
	// width they are drawn at, so this is only the total result a caller sees when none of them is.
	return kept;
}

/**
 * The lines one display result renders as, or nothing when the mode has no widget at all.
 *
 * The reading order is the one this widget has always drawn: the fixed-budget line first — with the
 * monetary channel's own season mark ahead of it, and only where the host reported a context reading
 * for the bar to compare — then the period's accrued line for the monetary channel and the allowance
 * windows for the Codex one. The Total line follows, carrying the current model's own structure and
 * the main tree's Cost and Ref; the brief's Round row is laid out from the same columns, so the
 * two rows' fields line up vertically. Below that the entry's own form decides the content: the brief
 * draws the viewed session's own most recent Round, and the detail form draws the static agent tree of
 * the main session in its place — never both, which is what "the detail form keeps the Total and
 * replaces the Round row" means for a terminal. The two currencies are written apart and never added
 * together, and a mode without an amount policy contributes no amount of its own.
 *
 * The monetary channel keeps the superseded widget's one account row: the season mark, the fixed-budget
 * bar and effort, the provider balance and the period's accrued bar are written on a single line, in
 * that order (spec §192 keeps the old layout). The balance remains the official channel's own fact — a
 * token-only model has none (spec §134) and the allowance channel reads its own windows instead — so
 * the row is composed for the monetary mode alone, and a failure the process holds is shown there
 * rather than notified, never replacing the last reading.
 */
export function widgetLayout(reading: WidgetReading): readonly DisplayLine[] | undefined {
	const { display } = reading;
	if (display.mode === "hidden") return undefined;
	const lines: DisplayLine[] = [];
	if (display.mode === "monetary") {
		// The old account row, one line: a target whose host reported no context reading still shows the
		// season mark and the account facts — only the bar and its effort need a reading to compare.
		const account: DisplayPiece[] = [];
		const budget = budgetLine(display, reading.period);
		if (budget !== undefined) {
			account.push(...budget);
		} else {
			account.push({ text: seasonMark(reading.period) });
		}
		const balance = balanceLine(reading.balance);
		if (balance !== undefined) account.push(...balance);
		account.push(...accruedLine(reading.accrued));
		lines.push(account);
	} else {
		const budget = budgetLine(display, reading.period);
		if (budget !== undefined) lines.push(budget);
		if (display.mode === "allowance") lines.push(...reading.quota);
	}
	// The Total and the brief's Round are one layout: their columns are padded together so every
	// field starts at the same column on both rows. A detail form draws no Round, but still lays the
	// Total out against the same Round when one exists, so the Total line it keeps above the tree is
	// the very line the brief shows.
	const round = display.round;
	const rows = round === undefined ? [totalColumns(display)] : [totalColumns(display), roundColumns(round, display.mode)];
	const [totalLine, roundLine] = alignedLines(rows);
	lines.push(prefixedLine("Total:  ", totalLine));
	if (display.form === "detail" && display.agentTree !== undefined) {
		lines.push(...treeLines(display.agentTree, reading.width));
	} else if (roundLine !== undefined) {
		lines.push(prefixedLine("Round:  ", roundLine));
	}
	return lines;
}

/**
 * The plain text of those same lines, for a host that draws text rather than a component.
 *
 * Nothing is lost by drawing this form instead of the coloured one: every figure, every threshold's
 * word and every narrower width's form is the same, and only the colour of a piece is left to the host
 * that has no theme of this extension's to map.
 */
export function widgetLines(reading: WidgetReading): string[] | undefined {
	return widgetLayout(reading)?.map(lineText);
}

/** One line with the theme's own colours, or exactly as it stands when there is no theme to draw with. */
function paintedLine(line: DisplayLine, theme: WidgetTheme | undefined): string {
	if (theme === undefined) return lineText(line);
	return line
		.map((piece, index) => {
			const separator = index === 0 ? "" : (piece.separator ?? "  ");
			if (piece.emphasis === undefined) return `${separator}${piece.text}`;
			if (piece.emphasis === "effort") return `${separator}${theme.getThinkingBorderColor(piece.text)(piece.text)}`;
			return `${separator}${theme.fg(EMPHASIS_COLORS[piece.emphasis], piece.text)}`;
		})
		.join("");
}

/**
 * Attach the usage widget to one OMP session binding.
 *
 * Attaching registers the native handlers the widget re-reads on and nothing else; it creates no
 * widget by itself and reads nothing, so a binding that is refused after this point leaves nothing
 * behind. The returned function releases it: the change subscriptions are stopped, the frontend is
 * unregistered from the UI's one boundary wait and the widget is cleared. That release is the
 * extension's own, and the dispose front-end that reaches it is the framework's — the binding's
 * single `cleanup`, called when the session that initialized the instance ends — so this frontend
 * subscribes no native shutdown hook of its own and nothing of it outlives the session it draws
 * through.
 *
 * The boundary wait is the UI's, not this binding's: registering a session with it arms one
 * process-wide timeout for the next instant the pricing season changes, and every redraw the wait
 * triggers re-reads the session the host is displaying at that moment. A session without a UI is
 * registered with nothing at all, which is what keeps a headless run free of a drawing timer.
 */
export function attachModelCostWidget(
	pi: OmpExtensionApi,
	runtime: ModelCostRuntime,
	timer: BoundaryTimer,
	drawing: WidgetDrawing,
): () => void {
	let context: WidgetContext | undefined;
	let unwatchViewed: (() => void) | undefined;
	let leaveTimer: (() => void) | undefined;
	// The framework adapter's surface widened to the one native getter above: read through a cast
	// rather than the exported parameter type, which stays the adapter's own surface.
	const api = pi as WidgetApi;

	/**
	 * The target this session is displaying, from the host's own public outlet when it publishes one
	 * and from the session it is bound to otherwise.
	 */
	const targetOf = (ctx: WidgetContext): DisplayTarget => {
		const facts = ctx.getViewedSession?.();
		// A host that publishes the outlet is read through it alone: the displayed session's own
		// readings, never the binding's, are the bar's and the effort's facts. A host without the
		// outlet has no separate view — the session this widget is bound to is the one being drawn —
		// so its own native context reading and actual thinking level answer here, the same fallback
		// the provider and model already take.
		const context = facts?.context ?? (facts === undefined ? ctx.getContextUsage?.() : undefined);
		const effort = facts === undefined ? api.getThinkingLevel?.() : facts.effort;
		return {
			sessionId: facts?.sessionId ?? ctx.sessionManager.getSessionId(),
			provider: facts?.provider ?? ctx.model?.provider ?? "",
			model: facts?.model ?? ctx.model?.id ?? "",
			...(context?.tokens === undefined ? {} : { contextTokens: context.tokens }),
			...(context?.contextWindow === undefined ? {} : { contextWindow: context.contextWindow }),
			...(effort === undefined ? {} : { effort }),
		};
	};

	/** One reading of that target, at the width the form being built has to fit into. */
	const readingOf = (ctx: WidgetContext, width: number | undefined): WidgetReading => ({
		display: runtime.presentation.of(targetOf(ctx)),
		balance: runtime.presentation.balance(),
		period: runtime.presentation.period(),
		accrued: runtime.presentation.accrued(),
		quota: runtime.presentation.quotaLines(width),
		...(width === undefined ? {} : { width }),
	});

	/**
	 * One hand-over to the host: the target's own display is read to decide whether there is a widget at
	 * all, and the drawing then goes over in the form this CLI draws in.
	 *
	 * The reading is taken here rather than kept: a redraw is these calls and nothing else, so whatever
	 * changed — a request that settled, the displayed session, the season — is what the drawing reads,
	 * and nothing a render does can reach the network, a file or the accounting.
	 */
	const render = (): void => {
		const ctx = context;
		// A session without a UI has nothing to draw on: the widget is not created at all, and the
		// business result behind it stays where it is.
		if (ctx === undefined || ctx.hasUI !== true) return;
		const ui = ctx.ui as unknown as WidgetUi;
		const layout = widgetLayout(readingOf(ctx, undefined));
		if (layout === undefined) {
			// A mode this extension does not display is not its widget at all: the host is handed the
			// clear, rather than a component that would draw nothing but still take a place in the
			// widget area. That is why the session's own display is read once before either hand-over —
			// the host draws at a width this call does not know, and a widget that must not exist cannot
			// be discovered at drawing time.
			ui.setWidget(MODEL_COST_WIDGET_KEY, undefined);
		} else if (drawing === "component") {
			// The host draws the lines itself, at its own width and with its own theme: the factory is
			// handed the two things only it knows, and every render call re-reads so a resize is a fresh
			// narrower or wider form rather than a stale one.
			ui.setWidget(MODEL_COST_WIDGET_KEY, (_tui, theme) => ({
				render: (width: number) => (widgetLayout(readingOf(ctx, width)) ?? []).map(line => paintedLine(line, theme)),
			}));
		} else {
			ui.setWidget(MODEL_COST_WIDGET_KEY, layout.map(lineText));
		}
		// The season this redraw shows may have changed since the wait was armed — a holiday period that
		// just opened, or a boundary that passed while the process was blocked — so the wait is
		// reconsidered here, from the schedule as it reads at this moment.
		timer.sync();
	};

	const followSession = (_event: OmpSessionEvent, ctx: OmpSessionContext): void => {
		context = ctx as WidgetContext;
		unwatchViewed?.();
		unwatchViewed = context.subscribeViewedSessionChanged?.(() => render());
		leaveTimer?.();
		leaveTimer = undefined;
		if (context.hasUI === true) {
			const host = context;
			leaveTimer = timer.attach(
				render,
				{
					schedule: (callback, delayMs) => host.setTimeout(callback, delayMs),
					cancel: handle => host.clearTimer(handle),
				},
				context.agent.kind === "main",
			);
		}
		render();
	};

	pi.on("session_start", followSession);
	pi.on("session_switch", followSession);
	pi.on("session_branch", followSession);

	const unwatchConsumption = runtime.view.subscribe(render);

	const detach = (): void => {
		unwatchConsumption();
		unwatchViewed?.();
		unwatchViewed = undefined;
		leaveTimer?.();
		leaveTimer = undefined;
		context?.ui.setWidget(MODEL_COST_WIDGET_KEY, undefined);
		context = undefined;
	};

	return detach;
}
