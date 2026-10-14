/**
 * The detail tree measured on a real terminal device (P32's real-terminal evidence; the device half
 * of P30, P31 and P33, and of P24's layout coverage item).
 *
 * The printed smoke (`smoke:model-cost-detail-layout`) measures the *lines* the frontend hands a host:
 * it counts display columns off the drawn bytes. This one measures the other half of the same
 * promise — the cells a terminal really draws them in — by running inside a real Windows console and
 * asking the device itself:
 *
 * ```sh
 * # In a terminal (Windows Terminal, conhost): it asks the console for each width itself.
 * bun run smoke:model-cost-detail-layout-terminal
 * bun run smoke:model-cost-detail-layout-terminal --report device-report.json --widths 140,100,60,140
 *
 * # With no terminal attached, open one that runs it and closes when it is done. `wt` takes options of
 * # its own, so nothing after the command may start with a dash: the report goes to the system's
 * # temporary directory and its path is printed.
 * wt.exe -w new nt -d <repo> bun scripts/model-cost-detail-layout-terminal-smoke.ts
 *
 * # A launcher that resizes the console from the client side (the way a terminal does when its window
 * # changes) starts it in a session: every width the console is given is drawn at and measured, and the
 * # run ends when the launcher says so on this process' input, or after --session-passes widths.
 * ```
 *
 * Per width it asks the console to become that width (`SetConsoleWindowInfo` +
 * `SetConsoleScreenBufferSize`; the device answers with the width it now states), draws the production
 * frontend at *that* width through the fixture both scripts of this ticket share, writes the frame to
 * the console with a terminal's own escape sequences, and reads the device's cells back
 * (`ReadConsoleOutput*`) to find where each field landed and which colour it carries.
 *
 * The checks are about the device rather than about this process' arithmetic:
 *
 * - every row of the tree's own line lands on one console row, and the cells it holds are exactly the
 *   width the frontend computed for it — a wrap or a width the device disagreed with would part the
 *   two (the account and Total lines above the tree are the brief's own layout, laid out against each
 *   other rather than against the terminal, so no check claims anything about their fit);
 * - a Chinese name occupies two console *cells* per character (the device marks the leading and the
 *   trailing cell of each), and the field columns the frontend states are the columns the device put
 *   the fields in: the measurement is the device's, so a character count could not agree with it;
 * - one depth group's fields start at one device column on every row of it, a deeper group has columns
 *   of its own, and a row that has none of a field keeps that column rather than pulling the fields
 *   after it left;
 * - the theme reaches the device — the lines that carry its escape sequences are the ones the device
 *   shows several colours for, and a line the theme never touched keeps the device's one default
 *   attribute — and adds no column: the fields sit at the same device columns and widths either way;
 * - the retained figures say the same thing at every width while names and models are cut and a narrow
 *   group is continued, and the stored document keeps every whole name, model and figure;
 * - the width a run started at puts the same cells back when it is drawn once more at the end.
 *
 * Reading an abbreviation or a wrap is still a human's judgement (P33); this script measures the cells
 * and the columns it is handed.
 */
import { dlopen, FFIType } from "bun:ffi";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { textColumns } from "../extensions/model-cost/harnesses/omp/widget";
import {
	CONSUMPTION_FILE,
	REPORTED_FIELDS,
	agreesOnColumns,
	bindDetailLayout,
	columnText,
	readColumns,
	treeOf,
} from "./support/detail-layout-fixture";

const STD_OUTPUT_HANDLE = -11;
/** The mark the device puts on the second half of a double-width character, where it draws nothing. */
const TRAILING_CELL = 0x0200;
/** The attribute a cell the theme never touched carries. */
const DEFAULT_ATTRIBUTE = 0x0007;
/** The fields whose *values* a width may never change: a group may cut a name or a model, never a figure. */
const RETAINED_FIELDS = ["Cache:", "Cost:", "Ctx:", "Run:"] as const;
/** The narrowest console a run will ask for or draw at. */
const MINIMUM_WIDTH = 40;

const k32 = dlopen("kernel32.dll", {
	GetStdHandle: { args: [FFIType.i32], returns: FFIType.u64 },
	GetConsoleScreenBufferInfo: { args: [FFIType.u64, FFIType.ptr], returns: FFIType.i32 },
	ReadConsoleOutputCharacterW: {
		args: [FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.ptr],
		returns: FFIType.i32,
	},
	ReadConsoleOutputAttribute: {
		args: [FFIType.u64, FFIType.ptr, FFIType.u32, FFIType.u32, FFIType.ptr],
		returns: FFIType.i32,
	},
	SetConsoleScreenBufferSize: { args: [FFIType.u64, FFIType.u32], returns: FFIType.i32 },
	SetConsoleWindowInfo: { args: [FFIType.u64, FFIType.i32, FFIType.ptr], returns: FFIType.i32 },
});

const output = k32.symbols.GetStdHandle(STD_OUTPUT_HANDLE);

/** One `COORD`, packed the way the console takes it by value. */
function coord(x: number, y: number): number {
	return (x & 0xffff) | (y << 16);
}

/** Where the console says it is: its buffer, its cursor and its own attributes. */
interface DeviceState {
	readonly columns: number;
	readonly rows: number;
	readonly cursor: readonly [number, number];
	readonly window: readonly [number, number, number, number];
}

/** The device's own state, or nothing when this process has no console. */
function deviceState(): DeviceState | undefined {
	const info = new Uint8Array(32);
	if (k32.symbols.GetConsoleScreenBufferInfo(output, info) === 0) return undefined;
	const view = new DataView(info.buffer);
	return {
		columns: view.getInt16(0, true),
		rows: view.getInt16(2, true),
		cursor: [view.getInt16(4, true), view.getInt16(6, true)],
		window: [view.getInt16(10, true), view.getInt16(12, true), view.getInt16(14, true), view.getInt16(16, true)],
	};
}

/** One console row as the device draws it: what each cell holds, and the attribute that cell carries. */
interface DeviceRow {
	/** The character each cell draws, and nothing on the trailing half of a double-width one. */
	readonly cells: readonly string[];
	readonly attributes: readonly number[];
}

/**
 * One row of the console's screen buffer, read back from the device.
 *
 * Characters and attributes are read separately: attributes come one per *cell*, while characters come
 * the way the console states them, which leaves the trailing half of a double-width character out.
 * Walking the attributes' own leading/trailing marks is therefore what puts a character back on the
 * cell it occupies — the device's geometry, never this process' arithmetic. A character outside the
 * basic multilingual plane is one the console has no cell for: the device itself draws it as the
 * replacement character, which is what a row then reads back, and it takes the two cells a wide
 * character takes.
 */
function readDeviceRow(row: number, columns: number): DeviceRow | undefined {
	const chars = new Uint16Array(columns);
	const attributes = new Uint16Array(columns);
	const read = new Uint32Array(1);
	const origin = coord(0, row);
	if (k32.symbols.ReadConsoleOutputAttribute(output, attributes, columns, origin, read) === 0) return undefined;
	if (k32.symbols.ReadConsoleOutputCharacterW(output, chars, columns, origin, read) === 0) return undefined;
	const cells: string[] = [];
	let character = 0;
	for (let cell = 0; cell < columns; cell++) {
		if (((attributes[cell] as number) & TRAILING_CELL) !== 0) {
			cells.push("");
			continue;
		}
		cells.push(String.fromCharCode(chars[character] ?? 0));
		character += 1;
	}
	return { cells, attributes: [...attributes] };
}

/** The value each retained field states on one device row, as the row's own cells carry it. */
function retainedValues(cells: readonly string[]): string[] {
	const text = cells.join("");
	const stated: string[] = [];
	for (const field of RETAINED_FIELDS) {
		const at = text.indexOf(field);
		if (at < 0) continue;
		const rest = text.slice(at + field.length);
		const ends = REPORTED_FIELDS.filter(other => other !== field)
			.map(other => rest.indexOf(other))
			.filter(next => next >= 0);
		stated.push(`${field}${rest.slice(0, ends.length === 0 ? rest.length : Math.min(...ends)).trim()}`);
	}
	return stated;
}

/** The width one device row's cells really hold: its own last cell that carries a character, plus it. */
function cellsWidth(cells: readonly string[]): number {
	let width = 0;
	for (let cell = 0; cell < cells.length; cell++) {
		const drawn = cells[cell];
		// The second cell of a double-width character draws nothing, and its column is counted with the
		// character's first cell.
		if (drawn === undefined || drawn === "") continue;
		if (drawn !== " ") width = cell + (cells[cell + 1] === "" ? 2 : 1);
	}
	return width;
}

/** The colours the device really drew on one row, as the foreground each cell ended up with. */
function distinctAttributes(row: DeviceRow): number[] {
	return [...new Set(row.attributes.map(attribute => attribute & 0x00ff))].sort((left, right) => left - right);
}

/**
 * Ask the console to become `columns` wide, and answer with what it says it now is.
 *
 * The window is set before the buffer so a shrinking console never holds a buffer smaller than its
 * window, and set again afterwards so a growing one shows the whole buffer: both calls are the
 * device's, and a device that refuses answers with the state it kept.
 */
function resizeDeviceTo(columns: number, rows: number): DeviceState | undefined {
	const before = deviceState();
	if (before === undefined) return undefined;
	k32.symbols.SetConsoleWindowInfo(
		output,
		1,
		new Int16Array([0, 0, Math.max(columns - 1, 0), Math.min(rows - 1, before.window[3])]),
	);
	k32.symbols.SetConsoleScreenBufferSize(output, coord(columns, rows));
	k32.symbols.SetConsoleWindowInfo(output, 1, new Int16Array([0, 0, Math.max(columns - 1, 0), rows - 1]));
	return deviceState();
}

/** The characters one drawn line really draws, with the theme's own escape sequences taken back off. */
function visibleText(line: string): string {
	return line.replace(/\u001B\[[0-9;]*m/g, "");
}

/**
 * The width one drawn line claims, in the display columns the frontend computed it from.
 *
 * The line's own trailing blanks are left out: a grid pads a row's last field out to its column, and a
 * device cannot tell that padding from the cells it never wrote, so the width a device can be held to
 * is the width the line's own characters take.
 */
function statedWidth(line: string): number {
	return textColumns(visibleText(line).trimEnd());
}

/** One frame line as the device drew it. */
interface PassLine {
	readonly line: string;
	readonly plain: boolean;
	readonly row: number;
	/** The width the device's cursor reported for the line, or -1 when it did not stay on one row. */
	readonly deviceWidth: number;
	/** The device's own cells for that row: one entry per cell, and none on a wide character's second. */
	readonly cells: readonly string[];
	readonly device: ReadonlyMap<string, number>;
	readonly predicted: ReadonlyMap<string, number>;
	readonly colours: readonly number[];
	readonly values: readonly string[];
}

/**
 * Where one text sits on this device row, in the row's own cells, and how many of them it takes.
 *
 * A cell holds one character, except that a double-width character's second cell holds nothing: the
 * walk steps over those, so a text is found and measured in the cells the device spends on it rather
 * than in the characters the text has. A Chinese name's span is therefore the device's answer to how
 * wide it is, which is what a row's columns are aligned against.
 */
function spanOnDevice(cells: readonly string[], text: string): { readonly at: number; readonly width: number } | undefined {
	const characters = [...text];
	for (let start = 0; start < cells.length; start++) {
		let cell = start;
		let matched = 0;
		let width = 0;
		while (matched < characters.length) {
			const drawn = cells[cell];
			if (drawn === undefined) break;
			// The second cell of a double-width character draws nothing: step over it, its column is
			// already counted.
			if (drawn === "") {
				cell += 1;
				continue;
			}
			if (drawn !== characters[matched]) break;
			const wide = cells[cell + 1] === "";
			width += wide ? 2 : 1;
			matched += 1;
			cell += wide ? 2 : 1;
		}
		if (matched === characters.length) return { at: start, width };
	}
	return undefined;
}

/** The column each field starts at on this device row, in the device's own cells. */
function deviceColumns(cells: readonly string[]): Map<string, number> {
	const columns = new Map<string, number>();
	for (const field of REPORTED_FIELDS) {
		const span = spanOnDevice(cells, field);
		if (span !== undefined) columns.set(field, span.at);
	}
	return columns;
}

/** The attribute the device shows on a row whose line the frontend never coloured: its one default. */
const UNCOLOURED = [DEFAULT_ATTRIBUTE];

/**
 * Draw one frame on the device and read every line of it back.
 *
 * Each line is measured where the device put it: the cursor row is read before the line is written
 * (so anything drawn later cannot move what has already been read), the cursor's own position right
 * after the write is the width the device spent on the line, and that row's cells are its columns.
 * A line that filled the row exactly leaves the cursor at column 0 of the next row, which is a fit
 * rather than a wrap; anything else that leaves its row is a wrap.
 */
function drawOnDevice(lines: readonly string[], plain: boolean, columns: number): PassLine[] {
	const written: PassLine[] = [];
	for (const line of lines) {
		const before = deviceState();
		if (before === undefined) return written;
		const row = before.cursor[1];
		// The line is written without its break so the row is read before anything it does to the screen:
		// a break at the bottom row scrolls the whole screen, which would move what has just been read.
		process.stdout.write(line);
		const after = deviceState();
		const cells = readDeviceRow(row, columns);
		process.stdout.write("\n");
		const movedRows = after === undefined ? 2 : after.cursor[1] - row;
		const endedAt = after === undefined ? -1 : after.cursor[0];
		written.push({
			line,
			plain,
			row,
			deviceWidth: movedRows === 0 ? endedAt : movedRows === 1 && endedAt === 0 ? columns : -1,
			cells: cells === undefined ? [] : cells.cells,
			device: cells === undefined ? new Map<string, number>() : deviceColumns(cells.cells),
			predicted: readColumns(line),
			colours: cells === undefined ? [] : distinctAttributes(cells),
			values: cells === undefined ? [] : retainedValues(cells.cells),
		});
	}
	return written;
}

/** Everything the device answered at one width. */
interface PassReading {
	readonly width: number;
	/** The width the device stated after being asked, and the one the frontend was handed. */
	readonly deviceWidth: number;
	/** The width this process reads off its own stdout, where the device told it one. */
	readonly hostColumns: number | undefined;
	readonly lines: readonly PassLine[];
	/** The plain frame's own tree rows: the rows this ticket's layout promise is about. */
	readonly tree: readonly PassLine[];
}

/** Everything one run observed, as the checks the report states. */
interface Observation {
	readonly name: string;
	readonly held: boolean;
	readonly detail: string;
}

const observations: Observation[] = [];

function observe(name: string, held: boolean, detail: string): void {
	observations.push({ name, held, detail });
}

/** The request widths: `--widths a,b,c`, or the launch width around two narrower ones. */
function requestedWidths(launch: number): number[] {
	const flag = process.argv.indexOf("--widths");
	const stated = flag < 0 ? undefined : (process.argv[flag + 1] ?? "");
	if (stated !== undefined && !stated.startsWith("--")) {
		const widths = stated
			.split(",")
			.map(value => Math.floor(Number(value.trim())))
			.filter(width => Number.isFinite(width) && width >= MINIMUM_WIDTH && width <= launch);
		if (widths.length > 0) return widths;
	}
	return [launch, ...[100, 60].filter(width => width >= MINIMUM_WIDTH && width < launch), launch];
}

/** Where a run writes its JSON report: `--report <path>`, or a file in the system's temporary directory. */
function reportTarget(): string {
	const flag = process.argv.indexOf("--report");
	const stated = flag < 0 ? undefined : process.argv[flag + 1];
	return path.resolve(
		stated === undefined || stated.startsWith("--")
			? path.join(tmpdir(), "model-cost-detail-layout-terminal-report.json")
			: stated,
	);
}

/**
 * The lines of one depth group, as the device drew them: the glyphs a line is indented with, whether
 * it is an agent row, and which of the row's own lines it is — a continued group's lines are compared
 * with the same line of their siblings, never with another line of the same row.
 */
function depthGroups(lines: readonly PassLine[], of: (line: PassLine) => string): Map<string, PassLine[]> {
	const groups = new Map<string, PassLine[]>();
	let continuation = 0;
	for (const line of lines) {
		const text = of(line);
		const glyphs = text.match(/^[\s\u2502\u251C\u2514\u2500]*/)?.[0] ?? "";
		continuation = /^\s/.test(text) ? continuation + 1 : 0;
		const key = `${glyphs.length}:${text.includes("Model:")}:${continuation}`;
		groups.set(key, [...(groups.get(key) ?? []), line]);
	}
	return groups;
}

/** One group's device columns, as the text a comparison can hold on to. */
function columnsKey(line: PassLine): string {
	return columnText(line.device);
}

/** Whether two groups state a field they share at different device columns. */
function groupsDiffer(left: readonly PassLine[], right: readonly PassLine[]): boolean {
	for (const [field, at] of (left[0] as PassLine).device) {
		const elsewhere = (right[0] as PassLine).device.get(field);
		if (elsewhere !== undefined && elsewhere !== at) return true;
	}
	return false;
}

/**
 * Whether every row that has none of a field still puts the fields after it where the rows of *its own
 * depth group* that state it put them: "a missing value keeps its column" read off the device's cells.
 *
 * The group is the point: a row of another depth is aligned against its own group's columns, so a row
 * of the root's model line differing from a session row says nothing about the slot a missing field
 * keeps.
 */
function missingFieldsKeepTheirSlot(lines: readonly PassLine[]): { readonly held: boolean; readonly detail: string } {
	const complaints: string[] = [];
	for (const [, rows] of depthGroups(lines, line => visibleText(line.line))) {
		for (const field of REPORTED_FIELDS) {
			const later = REPORTED_FIELDS.slice(REPORTED_FIELDS.indexOf(field) + 1);
			for (const line of rows) {
				if (line.device.has(field)) continue;
				for (const after of later) {
					const at = line.device.get(after);
					if (at === undefined) continue;
					const witness = rows.find(other => other.device.has(field) && other.device.has(after));
					if (witness !== undefined && witness.device.get(after) !== at) {
						complaints.push(
							`a row without ${field} put ${after} at ${String(at)}, a row of its group with both at ${String(witness.device.get(after))}`,
						);
					}
				}
			}
		}
	}
	return {
		held: complaints.length === 0,
		detail: complaints.join("; ") || `${String(lines.length)} rows, every missing field's slot left for a blank`,
	};
}

const report = reportTarget();
const launch = deviceState();
if (launch === undefined) {
	console.error(
		"# no console device: run this in a real terminal, or open one for it (no option may follow the\n" +
			"# command, `wt` takes those itself):\n" +
			"#   wt.exe -w new nt -d <repo> bun scripts/model-cost-detail-layout-terminal-smoke.ts",
	);
	process.exitCode = 2;
} else {
	const session = process.argv.includes("--device-session");
	const widths = requestedWidths(launch.columns);
	const fixture = await bindDetailLayout();
	const documentBefore = readFileSync(path.join(fixture.root, CONSUMPTION_FILE), "utf8");
	console.log("# the detail tree measured on the console device itself");
	console.log(
		`# device: a terminal of ${String(launch.columns)}x${String(launch.rows)} cells, stdout a terminal: ${String(process.stdout.isTTY === true)}`,
	);
	console.log(
		session
			? "# device session: every width the console is given is drawn at and measured"
			: `# widths drawn on it: ${widths.join(", ")}`,
	);

	const passes: PassReading[] = [];

	/**
	 * One pass: draw the tree at the width the device states right now and read every line of it back.
	 *
	 * The width a pass draws at is the device's own — `GetConsoleScreenBufferInfo`, never a number this
	 * process hoped for — so a console that kept a width it was asked for cannot fool the reading.
	 */
	function measurePass(width: number): PassReading {
		const stated = deviceState();
		const columns = stated?.columns ?? width;
		const frame = fixture.host.draw(columns);
		const tree = treeOf(frame.plain);
		// The account line above the tree is the frame's own coloured line: the detail tree's rows carry no
		// theme colour at all, so the colour half of this promise is measured where the theme does draw.
		const treeStart = tree.length === 0 ? frame.plain.length : frame.plain.length - tree.length;

		console.log(`\n## width ${String(width)} — the device states ${String(columns)} columns`);
		console.log("  --- the frame, as the host's theme draws it on this device");
		const paintedLines = drawOnDevice(frame.painted, false, columns);
		for (const line of paintedLines) console.log(`    ${visibleText(line.line)}`);
		console.log("  --- the same frame plain: each line's device width, and the column each field starts at");
		const plainLines = drawOnDevice(frame.plain, true, columns);
		for (const line of plainLines) {
			console.log(
				`    ${String(line.deviceWidth).padStart(3)}  ${columnText(line.device).padEnd(46)} [device]  ${columnText(line.predicted)}  [frontend]  colours ${line.colours.join(",")}`,
			);
		}
		const paintedTree = paintedLines.slice(treeStart);
		const plainTree = plainLines.slice(treeStart);
		const lines = [...paintedLines, ...plainLines];
		const reading: PassReading = {
			width,
			deviceWidth: columns,
			hostColumns: process.stdout.columns,
			lines,
			tree: plainTree,
		};

		// The device drew what was handed to it, on one row per line, spending the width the frontend
		// states: a wrap or a width the device disagreed with would part the two.
		// The tree's own rows are what this ticket lays out, and what must neither wrap by itself nor
		// overrun the width: the account and Total lines above it are the brief's own layout, laid out
		// against each other rather than against the terminal.
		const whole = plainTree.filter(
			line =>
				line.deviceWidth >= 0 &&
				line.cells.join("").trimEnd() === visibleText(line.line).trimEnd() &&
				cellsWidth(line.cells) === statedWidth(line.line),
		);
		observe(
			`the device draws every tree line whole at ${String(width)}`,
			plainTree.length > 0 && whole.length === plainTree.length,
			`${String(whole.length)} of ${String(plainTree.length)} tree lines on one console row at their stated width, colours ${plainTree[0]?.colours.join(",") ?? "none"}`,
		);
		const where = plainTree.filter(line => [...line.predicted].every(([field, at]) => line.device.get(field) === at));
		observe(
			`the device puts every field at the column the frontend states at ${String(width)}`,
			where.length === plainTree.length,
			where.length === plainTree.length
				? `${String(plainTree.reduce((count, line) => count + line.predicted.size, 0))} fields of ${String(plainTree.length)} rows`
				: plainTree
						.filter(line => !where.includes(line))
						.map(line => `${visibleText(line.line)}: ${columnText(line.device)} vs ${columnText(line.predicted)}`)
						.join("; "),
		);

		// A Chinese name is two cells per character on the device, which is why counting characters would
		// line two rows up on paper and part them on the screen. Each name this fixture draws whole is
		// measured in the device's own cells, against the two columns per character the promise states.
		const names = ["主会话", "检索定价核查表", "孙子代理乙"];
		const spans = plainTree.flatMap(line =>
			names.flatMap(name => {
				const span = line.cells.join("").includes(name) ? spanOnDevice(line.cells, name) : undefined;
				return span === undefined ? [] : [{ name, span }];
			}),
		);
		observe(
			`a Chinese name takes two device cells per character at ${String(width)}`,
			spans.length > 0 && spans.every(entry => entry.span.width === [...entry.name].length * 2),
			`${String(spans.length)} whole names of the tree (${spans.map(entry => `${entry.name}=${String(entry.span.width)} cells`).join(", ")})`,
		);

		// One depth, one set of columns — measured in the device's cells — and no two depths sharing one
		// whole-tree grid.
		const groups = depthGroups(plainTree, line => visibleText(line.line));
		const shared = [...groups.entries()].filter(([, rows]) => rows.length > 1);
		observe(
			`rows of one depth share their device columns at ${String(width)}`,
			shared.length > 0 && shared.every(([, rows]) => agreesOnColumns(rows.map(row => row.device))),
			shared.map(([, rows]) => `[${rows.map(columnsKey).join(" | ")}]`).join("; ") || "no group with two rows",
		);
		const byDepth = new Map<string, PassLine[]>();
		for (const [key, rows] of shared) {
			const depth = key.split(":")[0] as string;
			if (!byDepth.has(depth)) byDepth.set(depth, rows);
		}
		const depths = [...byDepth.entries()];
		const parted = depths.some(([, rows], index) =>
			depths.slice(index + 1).some(([, other]) => groupsDiffer(rows, other)),
		);
		observe(
			`each depth has device columns of its own at ${String(width)}`,
			depths.length < 2 || parted,
			`${String(depths.length)} depths drawn: ${depths.map(([depth, rows]) => `depth ${depth} => ${columnsKey(rows[0] as PassLine)}`).join("; ")}`,
		);

		// A field a row has none of keeps its own column: the fields after it stay where the rows that
		// state it put them.
		const slots = missingFieldsKeepTheirSlot(plainTree);
		observe(`a field a row has none of keeps its device column at ${String(width)}`, slots.held, slots.detail);

		// The theme is on the device — and it is a colour, not a column. The lines that carry the theme's
		// own escape sequences are the ones the device must show colours for; a line the theme never
		// touched keeps the device's single default attribute, and none of them moves a column.
		const themed = paintedLines
			.map((line, index) => ({ line, plain: plainLines[index] as PassLine }))
			.filter(entry => entry.line.line.includes("\u001B["));
		observe(
			`the theme reaches the device at ${String(width)}`,
			themed.length > 0 &&
				themed.every(
					entry =>
						entry.line.colours.length >= 2 &&
						entry.plain.colours.join(",") === UNCOLOURED.join(","),
				),
			`${String(themed.length)} of ${String(paintedLines.length)} lines carry the theme's own sequences, and the device draws them with ${themed.map(entry => entry.line.colours.join("/")).join(", ") || "no"} colours`,
		);
		observe(
			`the theme adds no device column at ${String(width)}`,
			themed.length > 0 &&
				paintedLines.every((line, index) => {
					const twin = plainLines[index] as PassLine;
					return columnsKey(line) === columnsKey(twin) && line.deviceWidth === twin.deviceWidth;
				}),
			`${String(paintedLines.length)} coloured lines measured against their plain twins`,
		);
		passes.push(reading);
		// The checkpoint a launcher waits for before it hands the console its next width.
		console.log(`# pass ${String(passes.length)} done, device width ${String(columns)}`);
		return reading;
	}

	// Which widths get drawn depends on who is resizing the console. Run plainly, this process asks the
	// console for each width itself. Run as a device session, the *client* resizes the console (the way
	// a terminal does when its window changes) and every width it sets is drawn at and measured: the
	// session ends when the client says so on this process' standard input.
	const resizes: number[] = [];
	process.stdout.on("resize", () => {
		resizes.push(process.stdout.columns ?? -1);
	});
	let drawn = session ? measurePass(launch.columns).deviceWidth : undefined;
	if (!session) {
		for (const width of widths) {
			resizeDeviceTo(width, launch.rows);
			measurePass(width);
		}
	} else {
		// A launcher knows how many widths it is going to hand over; a human resizing a window has no
		// count, and ends the session by closing this process' input.
		const limitFlag = process.argv.indexOf("--session-passes");
		const limit = limitFlag < 0 ? Infinity : Number(process.argv[limitFlag + 1] ?? "0");
		let stopped = false;
		process.stdin.setEncoding("utf8");
		process.stdin.on("data", chunk => {
			if (String(chunk).includes("done")) stopped = true;
		});
		process.stdin.on("end", () => {
			stopped = true;
		});
		process.stdin.resume();
		while (!stopped && passes.length < limit) {
			const settle = Promise.withResolvers<void>();
			setTimeout(settle.resolve, 25);
			await settle.promise;
			const width = deviceState()?.columns;
			if (width === undefined || width === drawn) continue;
			drawn = measurePass(width).deviceWidth;
		}
		process.stdin.pause();
	}

	// The figures a layout may never change: the same retained values at every width on the device. The
	// tree's rows are the ones a width may cut or wrap, so they are the ones whose figures are compared.
	const retained = (pass: PassReading) => pass.tree.flatMap(line => line.values).sort().join(" | ");
	const narrowest = passes.reduce((narrow, pass) => (pass.width < narrow.width ? pass : narrow), passes[0] as PassReading);
	observe(
		"the retained figures say the same thing at every width",
		passes.every(pass => retained(pass) === retained(passes[0] as PassReading)),
		`${String(passes.length)} widths, ${String(retained(passes[0] as PassReading).split(" | ").length)} retained values (${String(narrowest.width)} columns among them)`,
	);
	// A console that resizes under the process is what a redraw answers: every pass above drew at the
	// width the device stated at that moment, and a runtime may or may not report the change as an event
	// of its own — the width this run used is the device's, never a remembered one.
	const widthChanges = passes.filter(
		(pass, index) => index > 0 && pass.deviceWidth !== (passes[index - 1] as PassReading).deviceWidth,
	).length;
	observe(
		"the console's width changed under the process and every pass drew at the width it stated",
		passes.length === 1 || widthChanges > 0,
		`${String(widthChanges)} width changes among ${String(passes.length)} passes (${passes.map(pass => String(pass.deviceWidth)).join(" -> ")}), ${String(resizes.length)} of them reported to this process as a resize notification`,
	);

	// The width a run started at draws the same cells again when it is drawn once more at the end.
	const first = (passes[0] as PassReading).tree;
	const last = (passes[passes.length - 1] as PassReading).tree;
	const sameCells =
		passes.length > 1 &&
		first.length === last.length &&
		first.every((line, index) => {
			const other = last[index] as PassLine;
			return (
				line.cells.join("") === other.cells.join("") &&
				line.deviceWidth === other.deviceWidth &&
				columnsKey(line) === columnsKey(other) &&
				line.colours.join(",") === other.colours.join(",")
			);
		});
	observe(
		`the width ${String((passes[0] as PassReading).width)} started at puts the same cells back`,
		sameCells,
		`${String(first.length)} rows of tree cells against ${String(last.length)} at the same width at the end`,
	);

	// The document itself: a cut or a wrap is a drawing, never a change to what is saved.
	const documentAfter = readFileSync(path.join(fixture.root, CONSUMPTION_FILE), "utf8");
	const whole = [
		"details-under-the-first-child",
		"孙子代理乙",
		"检索定价核查表",
		'"runtimeMs":480000',
		'"model":"deepseek-flash"',
	];
	const missing = whole.filter(part => !documentAfter.includes(part));
	observe(
		"the stored document keeps every whole name, model and figure",
		documentAfter === documentBefore && missing.length === 0,
		`${String(documentAfter.length)} bytes, unchanged: ${String(documentAfter === documentBefore)}, missing: ${missing.join(", ") || "nothing"}`,
	);

	console.log("\n## summary");
	let failed = false;
	for (const observation of observations) {
		if (!observation.held) failed = true;
		console.log(`${observation.held ? "PASS" : "FAIL"}  ${observation.name}: ${observation.detail}`);
	}
	writeFileSync(
		report,
		JSON.stringify(
			{
				device: { launch: launch.columns, rows: launch.rows, isTTY: process.stdout.isTTY === true },
				passes: passes.map(pass => ({
					width: pass.width,
					deviceWidth: pass.deviceWidth,
					hostColumns: pass.hostColumns ?? null,
					lines: pass.lines.map(line => ({
						plain: line.plain,
						tree: pass.tree.includes(line),
						line: visibleText(line.line),
						row: line.row,
						deviceWidth: line.deviceWidth,
						cellWidth: cellsWidth(line.cells),
						cells: line.cells.join("").trimEnd(),
						deviceColumns: Object.fromEntries(line.device),
						predictedColumns: Object.fromEntries(line.predicted),
						colours: line.colours,
						retainedValues: line.values,
					})),
				})),
				observations,
			},
			null,
			2,
		),
		"utf8",
	);
	console.log(`\n# report written to ${report}`);
	rmSync(fixture.root, { recursive: true, force: true });
	process.exitCode = failed ? 1 : 0;
}
