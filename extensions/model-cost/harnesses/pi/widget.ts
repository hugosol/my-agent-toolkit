/**
 * The pi frontend: the one native widget this extension's read-only display is drawn through on this
 * harness.
 *
 * This is the extension's own harness-specific half (ADR-0002: native presentation is the
 * extension's, not the framework's). Everything it draws comes from `runtime.presentation` — the
 * read-only display result — so the mode gating, the two currencies, the fixed budget, every figure,
 * every threshold and every word are decided once, in shared logic; this frontend states the shape the
 * rows arrive in, the glyphs a depth is drawn with, the room a line fits into and the colour a
 * described emphasis takes.
 *
 * Four rules of the display live here because only the host knows them:
 *
 * - **No widget where there is none to draw.** A session without a UI draws nothing, and a model
 *   whose mode is `hidden` is not this extension's display at all: its widget is *not created*
 *   (and an earlier one is cleared) rather than shown empty. Neither touches what the session runs.
 * - **A change is a re-read.** The rendered lines are built from the current display result at the
 *   moment of drawing: the accounting's own change notifications and the host's session transitions
 *   both end in the same re-read, so the widget never holds a stale reading of its own.
 * - **The session this binding serves is the displayed one.** pi publishes no separate viewed-session
 *   outlet, so the facts the budget bar, the effort and the context reading come from are the bound
 *   session's own; nothing here follows another session's inspector.
 * - **The host's own mode decides the form.** A `tui` run is handed a component, so the theme and the
 *   viewport width are the host's own and are read at drawing time, and no terminal cap stands between
 *   the drawing and the operator. Every other run is handed the plain text of the same lines: pi's RPC
 *   mode ignores a component factory, so a component there would draw nothing at all, and a run with
 *   no UI draws nothing either way.
 *
 * The layout is this file's own: the rows a display result carries are labelled, indented by their
 * distance from the root and aligned within their own kind and depth — a name and a startup snapshot,
 * the statistics a scope carries, a context reading and the runtime its executions were measured at —
 * so a narrow terminal narrows a name or a snapshot with an ellipsis and, past that, wraps the fields
 * at one break for the whole group rather than letting a figure fall off the line. What each row
 * *states* is shared logic's, and no figure is ever rewritten to fit: only names and the model half of
 * a snapshot are abbreviated, and a row too narrow for even that is cut with the ellipsis that says
 * so.
 */
import type {
	PiExtensionApi,
	PiExtensionContext,
	PiWidgetComponent,
	PiWidgetComponentFactory,
	PiWidgetTheme,
} from "../../../../adapters/pi";
import type { BoundaryTimer, BoundaryTimerHost } from "../boundary-timer";
import {
	type AgentTreeRow,
	type ConsumptionDisplay,
	type DisplayAccrued,
	type DisplayEmphasis,
	type DisplayLine,
	type DisplayPeriod,
	type DisplayPiece,
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
	showsCostField,
	totalColumns,
} from "../../shared-logic/presentation/display";
import type { ProviderBalanceResult } from "../../shared-logic/business/pricing/provider-balance";
import type { ModelCostRuntime } from "../../shared-logic/runtime";

/** The native widget key the usage widget is drawn under: this extension's own, not the marker area. */
export const MODEL_COST_WIDGET_KEY = "z-model-cost";

/**
 * How the run this draw belongs to takes what the frontend hands it.
 *
 * `component` is the terminal UI, which draws the component itself at its own viewport width and with
 * its own theme; `lines` is every other run — the RPC, JSON and print modes and a session with no UI —
 * where the frontend states the plain text of those same lines, because a component handed there would
 * be ignored or drawn by nobody.
 */
export type WidgetDrawing = "component" | "lines";

/**
 * The colour each described emphasis is drawn with.
 *
 * The mapping is this frontend's own and the tokens are the ones the display's emphases have always
 * been drawn with — a budget bar's four bands, the balance's two warnings, one window's pacing, and
 * the eight colours the accrued bar's sessions cycle through. `effort` is not here: it is the one
 * emphasis whose colour is the level's own, which the theme states as a colour per level.
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
 * Everything one draw of the usage widget reads: the target's own display result, the process-wide
 * balance reading, the pricing period, the period's accrual and the allowance lines, at the width
 * this draw has to fit.
 *
 * The width is the host's own fact and only a component form has one: a component is asked for its
 * lines at the width of the viewport it is drawn in, so a narrower window is a fresh, narrower layout,
 * while the text form is handed lines no host stated a width for and gets the fullest form of every
 * line.
 */
export interface WidgetReading {
	readonly display: ConsumptionDisplay;
	readonly balance: ProviderBalanceResult;
	readonly period: DisplayPeriod;
	readonly accrued: DisplayAccrued;
	readonly quota: readonly DisplayLine[];
	readonly width?: number;
}

// ---------------------------------------------------------------------------
// Terminal columns
// ---------------------------------------------------------------------------

/**
 * The display columns one text takes in a terminal.
 *
 * A character takes one column, except the East Asian wide and fullwidth ones — a Chinese character, a
 * fullwidth colon, a Hangul syllable — which take two, and the combining and zero-width ones, which
 * take none. Measuring this way is what makes a column the *terminal's* column rather than the
 * string's: `子代理` is three characters and six columns, so a row named that one is padded by the six
 * columns it really occupies while a row named in ASCII is padded by exactly what its name takes. No
 * width here is ever a string's own length.
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
 * what tells the operator that what they are reading is the beginning of a longer text. The value
 * itself is untouched: this is a drawing of a name, never a change to the fact behind it.
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

/** One text as a field of exactly `columns` columns: cut when it is wider, blank-padded when narrower. */
function paddedColumns(text: string, columns: number): string {
	const width = textColumns(text);
	if (width === columns) return text;
	if (width > columns) return cutColumns(text, columns);
	return `${text}${" ".repeat(columns - width)}`;
}

// ---------------------------------------------------------------------------
// The Total and Round rows
// ---------------------------------------------------------------------------

/**
 * Rows laid out together, at the widths that make their fields line up.
 *
 * Every column is right-aligned to the widest value at its position and, where a column follows it,
 * padded to the widest field, so each field starts at the same column whichever row it is on. A row's
 * last column is left unpadded, so no line carries trailing blanks. The two rows are different scopes
 * — the Total is the session's own current model and the whole main tree; the Round is that target's
 * additions within one Round — so the same field can hold a different figure on each row and still
 * start at the same column.
 */
function alignedRows(rows: readonly DisplayRow[]): DisplayLine[] {
	const columnCount = rows.reduce((widest, row) => Math.max(widest, row.length), 0);
	const valueWidths: number[] = [];
	const fieldWidths: number[] = [];
	for (let index = 0; index < columnCount; index += 1) {
		let valueWidth = 0;
		let fieldWidth = 0;
		for (const row of rows) {
			const column = row[index];
			if (column === undefined) continue;
			valueWidth = Math.max(valueWidth, textColumns(column.value));
			fieldWidth = Math.max(fieldWidth, textColumns(column.label) + textColumns(column.value));
		}
		valueWidths.push(valueWidth);
		fieldWidths.push(fieldWidth);
	}
	return rows.map(row =>
		row.map((column, index) => {
			const value = paddedColumns(column.value, valueWidths[index] as number).trimStart();
			const field = `${column.label}${value}`;
			return { text: index < row.length - 1 ? paddedColumns(field, fieldWidths[index] as number) : field };
		}),
	);
}

/** One row's line with its own fixed prefix ahead of the first column. */
function prefixedLine(prefix: string, line: DisplayLine): DisplayLine {
	return line.map((piece, index) => (index === 0 ? { ...piece, text: `${prefix}${piece.text}` } : piece));
}

// ---------------------------------------------------------------------------
// The agent tree
// ---------------------------------------------------------------------------

/** The gap one tree row writes between two of its fields, in display columns. */
const TREE_GAP = "  ";
const TREE_GAP_COLUMNS = TREE_GAP.length;
/** The fewest display columns a name or a snapshot column keeps when a group has to be abbreviated. */
const MIN_ABBREVIATED_COLUMNS = 4;
/** The field a row's own name is: the column every row of a group writes first. */
const TREE_NAME_FIELD = "name";
/** The field a session row's startup snapshot is: the label-less column it writes after its name. */
const TREE_STARTUP_FIELD = "startup";
/** The label each remaining field of a session row leads with, which is the field it aligns by too. */
const TREE_LABELS = {
	context: "Ctx: ",
	runtime: "Run: ",
} as const;

/**
 * One field of one tree row, as the group lays it out: the field it belongs to, the label it leads
 * with, the text after that label, and whether a line with no room for it may abbreviate the value.
 *
 * The field — not the cell's position — is what rows are aligned by: two rows of one group state the
 * same field at the same column whether or not either of them carries a field the other has none of,
 * so a context reading or a runtime only one of them reports leaves a slot the width of that group's
 * own column rather than shifting everything after it left. The label is apart from the value so that
 * a column too narrow for the whole cell is cut to the value it states: an operator reading `Ctx: …`
 * still knows which field they are looking at, while a cell whose label is empty — a name, and the
 * startup snapshot beside it — is cut like any other value.
 */
interface TreeCell {
	readonly field: string;
	readonly label: string;
	readonly value: string;
	readonly abbreviated: boolean;
	/**
	 * The tail of the value a column too narrow for the whole cell keeps whole, where a cell has one.
	 *
	 * A session's startup snapshot states the effective level it began with there, so a narrowed column
	 * cuts the model half beside it and lets the ellipsis fall there rather than dropping the level an
	 * operator compares one session's beginning with another's by. Absent on every other cell, which
	 * narrows by cutting its own end.
	 */
	readonly keepTail?: string;
	/** The row's own semantic emphasis for this cell, where shared logic stated one. */
	readonly emphasis?: DisplayEmphasis;
}

/** One tree row as the group lays it out: the columns it is indented by and the fields it writes. */
interface TreeRow {
	/** The row's indentation, which is its own distance from the root and nothing else. */
	readonly indent: string;
	/** The row's fields in the order this row writes them, its own name — without its indent — first. */
	readonly cells: readonly TreeCell[];
}

/**
 * The rows of one kind at one distance from the root, with the room each of their fields gets.
 *
 * A group is the whole alignment unit: every row of it states each field at the same column, and two
 * groups share no column width at all. Rows are grouped by where they sit in the tree rather than by
 * the parent they hang from — a grandchild's own longer name sizes the grandchild group alone and
 * moves nothing above it — and the root's own model rows are rows of one session's pairs rather than
 * agent nodes, so they are a group of their own rather than sharing a subagent group's columns.
 */
interface TreeGroup {
	readonly rows: readonly TreeRow[];
	/** The fields the group writes, in an order every one of its rows' own orders allows. */
	readonly fields: readonly string[];
	/** How many display columns each field's column has, from the widest text the group writes there. */
	readonly widths: ReadonlyMap<string, number>;
	/** How few display columns each field's column may be cut to before abbreviating it states nothing. */
	readonly floors: ReadonlyMap<string, number>;
	/** How many display columns the group's rows are indented by, the same on every row of it. */
	readonly indentColumns: number;
}

/**
 * The fields one group writes, in an order that keeps every one of its rows' own orders.
 *
 * A row states its fields in the order it draws them, and the group it lands in may not change that
 * order: a session row's startup snapshot sits between its name and its statistics and stays there,
 * and a model row's statistics come straight after its name. So the group's order is the merge of the
 * rows' own orders — every field a row writes after another is written after it, and a field only some
 * rows carry takes the place those rows give it. Reading that order off the rows is also what keeps
 * this frontend free of a list of field names: a channel's own ratio column and a mode's own amounts
 * need no spelling here.
 */
function mergedFieldOrder(rows: readonly TreeRow[]): string[] {
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
		order.push(next ?? (written.find(candidate => !order.includes(candidate)) as string));
	}
	return order;
}

/** One group's own grid, from its rows alone: the fields they write and the room each of them needs. */
function treeGroupOf(rows: readonly TreeRow[]): TreeGroup {
	const fields = mergedFieldOrder(rows);
	const widths = new Map<string, number>();
	const floors = new Map<string, number>();
	for (const field of fields) {
		const cells = rows
			.map(row => row.cells.find(candidate => candidate.field === field))
			.filter((cell): cell is TreeCell => cell !== undefined);
		widths.set(field, cells.reduce((widest, cell) => Math.max(widest, textColumns(`${cell.label}${cell.value}`)), 0));
		// A column may be cut down to its own label, the widest tail any of the group's cells keeps whole
		// and an ellipsis and no further, so a narrowed terminal still says which field a value belongs to
		// and a snapshot keeps the level it began on. A name, whose label and tail are both empty, keeps
		// the few columns below which an ellipsis would be the whole cell.
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
		indentColumns: rows.reduce((widest, row) => Math.max(widest, textColumns(row.indent)), 0),
	};
}

/** The last of a group's fields one row really writes: the fields after it are not drawn on that row. */
function lastWrittenField(row: TreeRow, fields: readonly string[]): number {
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
function rowColumns(group: TreeGroup, row: TreeRow, widths: ReadonlyMap<string, number>): number {
	let columns = group.indentColumns;
	const written = group.fields.slice(0, lastWrittenField(row, group.fields) + 1);
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
 * wrapped itself would put the same field at a different column from the rows it is compared with, and
 * a field is never split across two lines — a figure stays whole.
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
 * One cell as a column too narrow for it writes it: its own label and as much of its value as the
 * column has left, with an ellipsis marking whatever was dropped. A column narrower than the label
 * itself is the whole cell's own opening columns, which is the one case where the label is cut too.
 *
 * A cell whose tail is kept whole spends that tail's own columns first, so what the ellipsis cuts is
 * the model half beside it rather than the level. A column with no room for the label and the tail
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
 * line writes no blanks after its last field.
 *
 * A field the row has none of is written as that column's blanks, which is what keeps the fields after
 * it at the columns the rest of the group has them at; and a field a narrow line had no room for is
 * written as its own column of text, abbreviated with an ellipsis.
 */
function treeFieldsOf(
	group: TreeGroup,
	row: TreeRow,
	fields: readonly string[],
	widths: ReadonlyMap<string, number>,
): string {
	const last = lastWrittenField(row, group.fields);
	return fields
		.map(field => {
			const columns = widths.get(field) ?? 0;
			const cell = row.cells.find(candidate => candidate.field === field);
			const text =
				cell === undefined ? "" : cell.abbreviated ? abbreviatedCell(cell, columns) : `${cell.label}${cell.value}`;
			if (group.fields.indexOf(field) === last) return text;
			return paddedColumns(text, columns);
		})
		.join(TREE_GAP);
}

/** How many display columns a run of pieces takes, as the separators between them are drawn with it. */
function piecesColumns(pieces: readonly DisplayPiece[]): number {
	return pieces.reduce(
		(columns, piece, index) => columns + textColumns(index === 0 ? "" : (piece.separator ?? "  ")) + textColumns(piece.text),
		0,
	);
}

/**
 * One line's pieces as the host will really take them: the pieces themselves, or, at a width the group
 * could not be laid out inside at all — one column wider than the whole line, which is a terminal
 * narrower than the tree's own indentation — the line cut with an ellipsis rather than handed over
 * overflowing.
 *
 * The cut is the one a single string would get, column for column: one column of the width is kept for
 * the ellipsis, the pieces before the cut are kept whole, and the piece the cut lands in carries the
 * ellipsis. Which piece that is does not change where the cut falls — a drawn line is measured in the
 * columns it occupies, separators included — so splitting the name out of the line cannot move what
 * survives a narrow terminal.
 */
function withinWidthPieces(pieces: readonly DisplayPiece[], width: number | undefined): DisplayLine {
	if (width === undefined || piecesColumns(pieces) <= width) return pieces;
	let budget = width - 1;
	const kept: DisplayPiece[] = [];
	for (const [index, piece] of pieces.entries()) {
		const separator = index === 0 ? "" : (piece.separator ?? "  ");
		const columns = textColumns(separator) + textColumns(piece.text);
		if (columns <= budget) {
			kept.push(index === 0 ? piece : { ...piece, separator });
			budget -= columns;
			continue;
		}
		const room = Math.max(0, budget - textColumns(separator));
		return [...kept, { ...piece, text: cutColumns(piece.text, room + 1), separator }];
	}
	// The loop above returns at the piece the cut lands in whenever the pieces really are wider than the
	// width they are drawn at, so this is only the total result a caller sees when none of them is.
	return kept;
}

/**
 * One group's rows as the lines they are drawn on at one width, one entry per row of the group.
 *
 * Three forms, narrowest last: the group's full columns on one line per row; those columns abbreviated
 * together where a name or a snapshot has no room, each cut marked with an ellipsis; and, where even
 * that is too wide, the group's fields wrapped at one break for every row — each continuation line
 * carrying its own fields indented to the column the group's fields start at, and the row's name stated
 * once, on its first line. A host that stated no width gets the first form: there is nothing to fit a
 * line into, and a text drawing states every field in full.
 */
function groupLines(group: TreeGroup, width: number | undefined): readonly (readonly DisplayLine[])[] {
	const widths = new Map(group.widths);
	const widest = (): number => group.rows.reduce((columns, row) => Math.max(columns, rowColumns(group, row, widths)), 0);
	const abbreviable = new Set(
		group.rows.flatMap(row => row.cells.filter(cell => cell.abbreviated).map(cell => cell.field)),
	);
	// Narrower than the group: the fields that may be abbreviated lose columns together, the widest of
	// them first, until the group fits the line it is drawn on. A column stops at its own floor — its
	// label and an ellipsis — because past that an operator could not tell the field from another.
	while (width !== undefined && widest() > width) {
		const candidates = [...widths.entries()]
			.filter(
				([field, columns]) =>
					abbreviable.has(field) && columns > (group.floors.get(field) ?? MIN_ABBREVIATED_COLUMNS),
			)
			.sort(([, left], [, right]) => right - left);
		const candidate = candidates[0];
		if (candidate === undefined) break;
		const floor = group.floors.get(candidate[0]) ?? MIN_ABBREVIATED_COLUMNS;
		widths.set(candidate[0], Math.max(floor, candidate[1] - (widest() - width)));
	}
	// The group's fields start at one column on every row: the indent, the name column and one gap.
	const indent = group.indentColumns + (widths.get(TREE_NAME_FIELD) ?? 0) + TREE_GAP_COLUMNS;
	const available = width === undefined ? 0 : width - indent;
	const wrapped =
		width === undefined || widest() <= width || available < 1
			? undefined
			: wrappedFields(group.fields.slice(1), widths, available);
	// A continuation line's own indent is the fields' column, and it gives way to the fields: a chunk
	// that would not fit beside the whole indent is drawn at as much of it as the terminal has left, so
	// the figures stay whole and it is the indentation that is shortened. The chunks are the group's, so
	// every row of it is drawn at the same column.
	const chunkColumns = (chunk: readonly string[]): number =>
		chunk.reduce((columns, field) => columns + (widths.get(field) ?? 0), TREE_GAP_COLUMNS * (chunk.length - 1));
	const continuationIndent =
		wrapped === undefined || width === undefined
			? indent
			: Math.max(0, Math.min(indent, width - wrapped.reduce((widestChunk, chunk) => Math.max(widestChunk, chunkColumns(chunk)), 0)));
	return group.rows.map(row => {
		const last = lastWrittenField(row, group.fields);
		const name = row.cells.find(cell => cell.field === TREE_NAME_FIELD) as TreeCell;
		const nameWidth = widths.get(TREE_NAME_FIELD) ?? 0;
		const nameText = name.abbreviated
			? cutColumns(`${name.label}${name.value}`, nameWidth)
			: `${name.label}${name.value}`;
		// The row's own leading columns as pieces: the indent, then the name as a piece of its own — the
		// one cell a row can carry an emphasis on, and an emphasis has to be painted around the name
		// alone rather than around the glyphs that indent it.
		const head: DisplayPiece[] = [];
		if (row.indent.length > 0) head.push({ text: row.indent });
		head.push({
			text: nameText,
			separator: "",
			...(name.emphasis === undefined ? {} : { emphasis: name.emphasis }),
		});
		// The blanks that carry the group's name column out to where its fields start, and the fields
		// themselves behind the gap. A row whose last field is its name writes neither.
		const blanks = " ".repeat(Math.max(0, nameWidth - textColumns(nameText)));
		const withFields = (fields: string): DisplayPiece[] => [
			...head,
			...(blanks.length === 0 ? [] : [{ text: blanks, separator: "" }]),
			{ text: `${TREE_GAP}${fields}`, separator: "" },
		];
		if (wrapped === undefined) {
			const fields = group.fields.slice(1, last + 1);
			return [withinWidthPieces(fields.length === 0 ? head : withFields(treeFieldsOf(group, row, fields, widths)), width)];
		}
		const lines: DisplayLine[] = [];
		for (const [position, chunk] of wrapped.entries()) {
			const carried = chunk.filter(field => group.fields.indexOf(field) <= last);
			if (carried.length === 0) break;
			const fields = treeFieldsOf(group, row, carried, widths);
			if (position === 0) {
				// The name's own column is this layout's padding: a first line with no room for it puts the
				// fields straight beside the name rather than losing the figures that follow it.
				const padded = withFields(fields);
				const tight: DisplayLine =
					width !== undefined && piecesColumns(padded) > width
						? [...head, { text: `${TREE_GAP}${fields}`, separator: "" }]
						: padded;
				lines.push(withinWidthPieces(tight, width));
				continue;
			}
			lines.push(withinWidthPieces([{ text: `${" ".repeat(continuationIndent)}${fields}` }], width));
		}
		return lines;
	});
}

/**
 * The lines the detail form draws for the static agent tree: the root by its name, one line per model
 * the root itself consumed, and one line per descendant session.
 *
 * A row's distance from the root is the only thing the shared result states and the indent is this
 * layout's own drawing of it. The rows of one kind at one distance from the root are laid out as one
 * group: their names, the startup snapshot a session carries — the model it began on with the effective
 * effort it began with, `provider/model(effort)` with `?` where nothing proved a part — the statistics
 * their own scope carries, the current context reading a session's own binding published as
 * `Ctx: percent (tokens/budget)`, and the accumulated runtime a session's executions were measured at,
 * all start at the same column on every one of those rows. The rows themselves keep their order and
 * their tree: one row per session, drawn where the relations put it.
 */
function treeLines(rows: readonly AgentTreeRow[], width: number | undefined): readonly DisplayLine[] {
	const treeRows: TreeRow[] = rows.map(row => {
		// The one cell a row can carry an emphasis on, as the row itself stated it: a descendant session
		// whose own Round is open right now. Nothing is decided here — the emphasis the row carries is
		// copied through, and the theme's colour for it is the painter's business.
		const cells: TreeCell[] = [
			{
				field: TREE_NAME_FIELD,
				label: "",
				value: row.name,
				abbreviated: true,
				...(row.nameEmphasis === undefined ? {} : { emphasis: row.nameEmphasis }),
			},
		];
		if (row.startup !== undefined) {
			cells.push({
				field: TREE_STARTUP_FIELD,
				label: "",
				value: row.startup.text,
				abbreviated: true,
				keepTail: row.startup.tail,
			});
		}
		if (row.fields !== undefined) {
			// The scope's own columns, as the display states them: a channel's cache rate and ratio and the
			// amounts it carries, dashes included, with nothing re-decided on the way into the group. The
			// cell is keyed by the statistic the column *is* rather than by the wording this row draws it
			// with, so two rows of one group put one statistic in one column of it.
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
			// Drawn on every session row, an unavailable figure as its own marker: the value is one the host
			// measured, so "none was reported" and "the reported figure was zero" stay apart.
			cells.push({
				field: TREE_LABELS.runtime,
				label: TREE_LABELS.runtime,
				value: runtimeText(row.runtimeMs),
				abbreviated: false,
			});
		}
		return { indent: "  ".repeat(row.depth), cells };
	});
	// One group per kind at one depth, each row remembered at its own place in the tree: a group says how
	// its rows are laid out, never where in the tree they are drawn.
	const groups = new Map<string, { readonly rows: TreeRow[]; readonly at: number[] }>();
	treeRows.forEach((treeRow, index) => {
		const row = rows[index] as AgentTreeRow;
		const group = groups.get(`${row.kind}:${row.depth}`) ?? { rows: [], at: [] };
		group.rows.push(treeRow);
		group.at.push(index);
		groups.set(`${row.kind}:${row.depth}`, group);
	});
	const drawn = new Map<number, readonly DisplayLine[]>();
	for (const group of groups.values()) {
		const lines = groupLines(treeGroupOf(group.rows), width);
		group.at.forEach((index, position) => drawn.set(index, lines[position] as DisplayLine[]));
	}
	return treeRows.map((_row, index) => drawn.get(index) as DisplayLine[]).flat();
}

// ---------------------------------------------------------------------------
// The whole widget
// ---------------------------------------------------------------------------

/**
 * One line's pieces as the width it must fit really takes them: the pieces themselves when they fit,
 * or the same pieces on as many lines as the width needs.
 *
 * The break is between pieces rather than inside one, because a piece is one statement of the display
 * — a figure, a window, a bar — and splitting it would be inventing a form shared logic never stated.
 * A piece wider than the whole width is the one case a break cannot help, and it is cut with the
 * ellipsis that says so rather than handed over to be clipped by a terminal. The separator each piece
 * states for itself is dropped at the start of a line, which is where there is nothing before it.
 */
function wrappedPieces(pieces: readonly DisplayPiece[], width: number | undefined): readonly DisplayLine[] {
	if (width === undefined) return [pieces];
	const lines: DisplayLine[] = [];
	let line: DisplayPiece[] = [];
	let columns = 0;
	for (const piece of pieces) {
		const separator = line.length === 0 ? "" : (piece.separator ?? "  ");
		const pieceColumns = textColumns(piece.text);
		const needed = textColumns(separator) + pieceColumns;
		if (pieceColumns > width) {
			// Wider than the whole line it is drawn on: nothing beside it can help, so it is cut where the
			// terminal ends and the ellipsis marks the rest.
			if (line.length > 0) {
				lines.push(line);
				line = [];
				columns = 0;
			}
			lines.push([{ ...piece, text: cutColumns(piece.text, width), separator: "" }]);
			continue;
		}
		if (line.length > 0 && columns + needed > width) {
			lines.push(line);
			line = [{ ...piece, separator: "" }];
			columns = pieceColumns;
			continue;
		}
		line.push(line.length === 0 ? { ...piece, separator: "" } : piece);
		columns += needed;
	}
	if (line.length > 0) lines.push(line);
	return lines.length === 0 ? [[]] : lines;
}

/**
 * The lines one display result renders as, or nothing when the mode has no widget at all.
 *
 * The reading order is the one this widget has always drawn: the fixed-budget line first — with the
 * monetary channel's own season mark ahead of it, and only where the host reported a context reading
 * for the bar to compare — then the DeepSeek account facts whenever the Total writes Cost, and the
 * allowance windows for the Codex one. The Total line follows, carrying the current model's own
 * structure and the main tree's Cost and Ref; the brief's Round row is laid out from the same columns,
 * so the two rows' fields line up vertically. Below that the entry's own form decides the content: the
 * brief draws the target's own most recent Round, and the detail form draws the static agent tree of
 * the main session in its place — never both. The two currencies are written apart and never added
 * together, and a mode without an amount policy contributes no amount of its own.
 *
 * Every line is handed over inside the width this draw has, at a break between the display's own
 * statements: a component is drawn in the terminal's columns, and a line wider than them would be
 * clipped by the terminal with the figures at its end lost.
 */
export function widgetLayout(reading: WidgetReading): readonly DisplayLine[] | undefined {
	const { display } = reading;
	if (display.mode === "hidden") return undefined;
	const lines: DisplayLine[] = [];
	// The account row carries the target's own context reading and, whenever the Total writes Cost,
	// the DeepSeek balance and period accrual too. The season mark belongs to the monetary target;
	// another channel keeps its own budget bar and adds only the account facts Cost made relevant.
	const account: DisplayPiece[] = [];
	const budget = budgetLine(display, reading.period);
	if (display.mode === "monetary") {
		// A target whose host reported no context reading still shows the season mark; only the bar
		// and its effort need a reading to compare.
		if (budget !== undefined) account.push(...budget);
		else account.push({ text: seasonMark(reading.period) });
	} else if (budget !== undefined) {
		account.push(...budget);
	}
	if (showsCostField(display)) {
		const balance = balanceLine(reading.balance);
		if (balance !== undefined) account.push(...balance);
		account.push(...accruedLine(reading.accrued));
	}
	if (account.length > 0) lines.push(...wrappedPieces(account, reading.width));
	if (display.mode === "allowance") {
		for (const quota of reading.quota) lines.push(...wrappedPieces(quota, reading.width));
	}
	// The Total and the brief's Round are one layout: their columns are padded together so every field
	// starts at the same column on both rows. A detail form draws no Round, but still lays the Total out
	// against the same Round when one exists, so the Total line it keeps above the tree is the very line
	// the brief shows.
	const round = display.round;
	const rows =
		round === undefined ? [totalColumns(display)] : [totalColumns(display), roundColumns(round, display.mode)];
	const [totalLine, roundLine] = alignedRows(rows);
	lines.push(...wrappedPieces(prefixedLine("Total:  ", totalLine as DisplayLine), reading.width));
	if (display.form === "detail" && display.agentTree !== undefined) {
		lines.push(...treeLines(display.agentTree, reading.width));
	} else if (roundLine !== undefined) {
		lines.push(...wrappedPieces(prefixedLine("Round:  ", roundLine), reading.width));
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
function paintedLine(line: DisplayLine, theme: PiWidgetTheme): string {
	return line
		.map((piece, index) => {
			const separator = index === 0 ? "" : (piece.separator ?? "  ");
			if (piece.emphasis === undefined) return `${separator}${piece.text}`;
			if (piece.emphasis === "effort") return `${separator}${theme.getThinkingBorderColor(piece.text)(piece.text)}`;
			return `${separator}${theme.fg(EMPHASIS_COLORS[piece.emphasis], piece.text)}`;
		})
		.join("");
}

// ---------------------------------------------------------------------------
// Attaching
// ---------------------------------------------------------------------------

/**
 * Whether this context is still one this host lets an extension read.
 *
 * pi's own contract is that a context belonging to a session the host replaced or disposed is spent,
 * and that every read of it throws rather than answering a stale value. A drawing path must not read
 * one: the draw runs inside the accounting's own change notification, so a throw here would take the
 * Round's handler — and with it the session's save — down for a display nobody asked for. A context
 * that is gone is therefore a target this frontend no longer has, not a failed read.
 */
function live(context: PiExtensionContext): boolean {
	try {
		return context.hasUI === true;
	} catch {
		return false;
	}
}

/**
 * One armed one-shot of the carrier below: what the wait hands back to `cancel`, and the way the
 * platform handle it was armed with is cleared.
 */
interface ArmedOneShot {
	clear(): void;
}

/** Whether one host handle is an armed one-shot of this carrier, which is the only handle it is given. */
function isArmedOneShot(handle: unknown): handle is ArmedOneShot {
	return typeof handle === "object" && handle !== null && "clear" in handle && typeof handle.clear === "function";
}

/**
 * The one-shot timer surface this frontend owns for the UI's boundary wait.
 *
 * pi publishes no timer on its extension context — the harness record's own advice is that an extension
 * which needs one owns a raw timer and closes it with the session-scoped resources it created — so the
 * platform's own one-shot is the carrier here, exactly as the extension's own half must supply it. The
 * handle stays with the frontend that armed it and is cleared with that frontend's release, so nothing
 * fires into a session that is being torn down. The handle is detached from the event loop — the way a
 * host-managed timer is — so a pending boundary wait never keeps a pi process alive by itself.
 */
const OWNED_ONE_SHOT: BoundaryTimerHost = {
	schedule(callback, delayMs) {
		const handle = setTimeout(callback, delayMs);
		handle.unref();
		return { clear: () => clearTimeout(handle) };
	},
	cancel(armed) {
		if (isArmedOneShot(armed)) armed.clear();
	},
};

/**
 * Attach the usage widget to one pi session binding.
 *
 * Attaching registers the native handler the widget re-reads on and subscribes to the accounting's own
 * change notifications; it creates no widget by itself and reads nothing, so a binding that is refused
 * after this point leaves nothing behind. The returned function releases it: the change subscription is
 * stopped, the native registration is given up, the session is unregistered from the UI's one boundary
 * wait and the widget is cleared. That release is the extension's own, and the dispose front-end that
 * reaches it is the framework's — the binding's single `cleanup`, called when the session that
 * initialized the instance ends — so this frontend subscribes no native shutdown hook of its own and
 * nothing of it outlives the session it draws through.
 *
 * A session without a UI is never drawn on: the render is a no-op for it, no widget is created and no
 * boundary wait is armed for it, which is what keeps a headless run — and a spawned session's own
 * binding, whose context publishes no UI — free of a drawing path and of a timer of its own. The wait
 * itself is the UI's and arrives composed ({@link attachModelCostWidget} is handed the process's one
 * timer), because one display shows one season whatever is being viewed.
 */
export function attachModelCostWidget(
	pi: PiExtensionApi,
	runtime: ModelCostRuntime,
	timer: BoundaryTimer,
): () => void {
	let context: PiExtensionContext | undefined;
	/** This binding's own registration with the UI's one boundary wait, while it has one. */
	let leaveTimer: (() => void) | undefined;
	/**
	 * The plain facts this draw's target is made of, read from the live context when the widget was
	 * handed over.
	 *
	 * A component is drawn by the host at a time and a width of its own, and the context it was handed
	 * over from may be spent by then; so the target is read once, at hand-over, and the component draws
	 * that target — this session — at whatever width it is asked for. Nothing here follows a viewed
	 * session: pi publishes no such outlet, and the session this binding serves is the displayed one.
	 */
	let target: DisplayTarget | undefined;

	/**
	 * The target this session is displaying: the session this binding serves, with the model, the
	 * effective effort and the context reading its own context reports.
	 *
	 * pi states an unknown context as a null token count — right after a compaction, before the next
	 * response establishes a reading — which is no reading rather than a confirmed zero: a null that
	 * reached the display as a number would fail the whole draw, and this frontend's draw runs inside
	 * the accounting's own change notification.
	 */
	const targetOf = (ctx: PiExtensionContext): DisplayTarget => {
		const usage = ctx.getContextUsage?.();
		const effort = ctx.thinkingLevel;
		const tokens = typeof usage?.tokens === "number" ? usage.tokens : undefined;
		const contextWindow = typeof usage?.contextWindow === "number" ? usage.contextWindow : undefined;
		return {
			sessionId: ctx.sessionManager.getSessionId(),
			provider: ctx.model?.provider ?? "",
			model: ctx.model?.id ?? "",
			...(tokens === undefined ? {} : { contextTokens: tokens }),
			...(contextWindow === undefined ? {} : { contextWindow }),
			...(effort === undefined || effort.length === 0 ? {} : { effort }),
		};
	};

	/** One reading of the session this draw is for, at the width the form being built has to fit. */
	const readingAt = (width: number | undefined): WidgetReading => ({
		display: runtime.presentation.of(target as DisplayTarget),
		balance: runtime.presentation.balance(),
		period: runtime.presentation.period(),
		accrued: runtime.presentation.accrued(),
		quota: runtime.presentation.quotaLines(width),
		...(width === undefined ? {} : { width }),
	});

	/** The widget in the form this run draws in: the host's component, or the plain lines of the same draw. */
	const handOver = (ctx: PiExtensionContext, drawing: WidgetDrawing): void => {
		// A mode this extension does not display is not its widget at all: the host is handed the clear
		// rather than a widget that would draw nothing but still take a place in its area. The form is
		// read before either hand-over, because a component is drawn at a width this call does not know.
		if (drawing === "component") {
			const factory: PiWidgetComponentFactory = (_tui, theme): PiWidgetComponent => ({
				render: width => (widgetLayout(readingAt(width)) ?? []).map(line => paintedLine(line, theme)),
				// Nothing here is cached across draws, so a theme change is the next render and nothing else.
				invalidate: () => {},
			});
			ctx.ui.setWidget(MODEL_COST_WIDGET_KEY, widgetLayout(readingAt(undefined)) === undefined ? undefined : factory);
			return;
		}
		const lines = widgetLines(readingAt(undefined));
		ctx.ui.setWidget(MODEL_COST_WIDGET_KEY, lines === undefined ? undefined : [...lines]);
	};

	/**
	 * One hand-over to the host: the target's own display is read to decide whether there is a widget at
	 * all, and the drawing then goes over as the form this run takes.
	 *
	 * The reading is taken here rather than kept: a redraw is these calls and nothing else, so whatever
	 * changed — a request that settled, the season, a command's own effect — is what the drawing reads,
	 * and nothing a render does can reach the network, a file or the accounting.
	 */
	const render = (): void => {
		const ctx = context;
		if (ctx === undefined) return;
		if (!live(ctx)) {
			// The host spent this context: there is no session here to draw any more, and no UI of it to
			// draw on. Whatever the host does with the widget left behind is the host's own.
			context = undefined;
			leaveTimer?.();
			leaveTimer = undefined;
			return;
		}
		target = targetOf(ctx);
		handOver(ctx, ctx.mode === "tui" ? "component" : "lines");
		// The season this redraw shows may have changed since the wait was armed — a holiday period that
		// just opened, or a boundary that passed while the process was blocked — so the wait is
		// reconsidered here, from the schedule as it reads at this moment.
		timer.sync();
	};

	const unwatchConsumption = runtime.view.subscribe(render);
	const release = pi.on("session_start", (_event, ctx) => {
		context = ctx;
		// The wait is the UI's, and this binding is the session that UI draws: a session whose context
		// publishes no UI — the headless run, and a spawned session's own binding — registers nothing at
		// all, exactly as it draws nothing. A reload that starts this session again is the same
		// registration replaced, never a second one.
		leaveTimer?.();
		leaveTimer = undefined;
		if (live(ctx)) leaveTimer = timer.attach(render, OWNED_ONE_SHOT, true);
		render();
	});

	const releaseModelSelect = pi.on("model_select", (_event, ctx) => {
		context = ctx;
		render();
	});

	const releaseThinkingLevelSelect = pi.on("thinking_level_select", (_event, ctx) => {
		context = ctx;
		render();
	});

	return () => {
		unwatchConsumption();
		release();
		releaseModelSelect();
		releaseThinkingLevelSelect();
		leaveTimer?.();
		leaveTimer = undefined;
		if (context !== undefined && live(context)) context.ui.setWidget(MODEL_COST_WIDGET_KEY, undefined);
		context = undefined;
		target = undefined;
	};
}
