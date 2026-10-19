/**
 * One terminal's own screen, read back from the bytes a TUI wrote into it.
 *
 * A terminal UI writes what a terminal shows rather than what a person reads: cursor addressing, the
 * erases a repaint clears with, SGR runs and the alternate buffer. A run that must read back the frame
 * an operator's terminal really showed — this ticket's real-TUI acceptance feeds the pi process's own
 * output through this screen and reads the cells afterwards — therefore needs the device's own
 * geometry rather than the drawing's lines:
 *
 * - **A cell is the unit.** {@link TerminalScreen.cells} answers each row as one entry per column, so
 *   a field's column is the index of its own cell rather than a character count. A wide character
 *   occupies the two columns the terminal gives it: its lead cell holds the character and the cell
 *   after it is left as `WIDE_TAIL`, the half the device draws nothing in. That mark is what keeps the
 *   columns after a Chinese name, an emoji or a bar block in the columns the device put them in.
 * - **The vocabulary the drawing under test uses is implemented** — cursor addressing (`CUP`, `CHA`,
 *   `VPA` and relative moves), the erases (`EL`, `ED`), the alternate buffer (`?1049`), SGR and the
 *   OSC titles — and a sequence this screen does not know is consumed without drawing, so an
 *   unhandled mode set never becomes text on the screen.
 *
 * This is deliberately not a terminal emulator and not a test double for one: it exists so a captured
 * real-TUI frame can be measured in cells, and the checks read only the vocabulary above.
 */

/** The character a cell holds where a wide character's trailing half leaves the device drawing nothing. */
export const WIDE_TAIL = "\u0000";

export interface TerminalScreen {
	/** Draw the bytes one terminal would draw, in arrival order. */
	feed(text: string): void;
	/** Each row's characters, with a wide character written once and its trailing cell left out. */
	lines(): readonly string[];
	/** Each row as one entry per cell, the trailing half of a wide character left as `WIDE_TAIL`. */
	cells(): readonly (readonly string[])[];
}

/** One code point drawn in the two columns an East Asian wide or fullwidth character takes. */
function isWide(point: number): boolean {
	return (
		(point >= 0x1100 && point <= 0x115f) ||
		point === 0x2329 ||
		point === 0x232a ||
		(point >= 0x231a && point <= 0x231b) ||
		(point >= 0x23e9 && point <= 0x23ec) ||
		point === 0x23f0 ||
		point === 0x23f3 ||
		(point >= 0x25fd && point <= 0x25fe) ||
		(point >= 0x2614 && point <= 0x2615) ||
		(point >= 0x2648 && point <= 0x2653) ||
		point === 0x267f ||
		point === 0x2693 ||
		point === 0x26a1 ||
		(point >= 0x26aa && point <= 0x26ab) ||
		(point >= 0x26bd && point <= 0x26be) ||
		(point >= 0x26c4 && point <= 0x26c5) ||
		point === 0x26ce ||
		point === 0x26d4 ||
		point === 0x26ea ||
		(point >= 0x26f2 && point <= 0x26f3) ||
		point === 0x26f5 ||
		point === 0x26fa ||
		point === 0x26fd ||
		point === 0x2705 ||
		(point >= 0x270a && point <= 0x270b) ||
		point === 0x2728 ||
		point === 0x274c ||
		point === 0x274e ||
		(point >= 0x2753 && point <= 0x2755) ||
		point === 0x2757 ||
		(point >= 0x2795 && point <= 0x2797) ||
		point === 0x27b0 ||
		point === 0x27bf ||
		(point >= 0x2b1b && point <= 0x2b1c) ||
		point === 0x2b50 ||
		point === 0x2b55 ||
		(point >= 0x2e80 && point <= 0xa4cf && point !== 0x303f) ||
		(point >= 0xac00 && point <= 0xd7a3) ||
		(point >= 0xf900 && point <= 0xfaff) ||
		(point >= 0xfe30 && point <= 0xfe6f) ||
		(point >= 0xff00 && point <= 0xff60) ||
		(point >= 0xffe0 && point <= 0xffe6) ||
		(point >= 0x1f300 && point <= 0x1f64f) ||
		(point >= 0x1f900 && point <= 0x1f9ff) ||
		(point >= 0x20000 && point <= 0x3fffd)
	);
}

/** Whether one code point takes no column of its own: a combining mark, a joiner, a selector. */
function isZeroWidth(point: number): boolean {
	return (
		(point >= 0x0300 && point <= 0x036f) ||
		(point >= 0x1ab0 && point <= 0x1aff) ||
		(point >= 0x1dc0 && point <= 0x1dff) ||
		(point >= 0x20d0 && point <= 0x20ff) ||
		(point >= 0xfe00 && point <= 0xfe0f) ||
		(point >= 0xfe20 && point <= 0xfe2f) ||
		point === 0x200b ||
		point === 0x200d ||
		point === 0xfeff
	);
}

/**
 * One screen of `cols` × `rows` cells, as the device a captured TUI frame is read back from.
 *
 * The cursor walks the cells a terminal walks: a character is drawn where the cursor is and the
 * cursor moves past it, a line feed moves a row and a carriage return the first column, and writing
 * past the last column of a row wraps to the next — scrolling the top row off when the cursor leaves
 * the bottom, which is what the append-only part of a run's output really does.
 */
export function terminalScreen(cols: number, rows: number): TerminalScreen {
	let width = Math.max(1, cols);
	let height = Math.max(1, rows);
	/** One row of cells: `WIDE_TAIL` marks a cell a wide character's other half covers. */
	let grid: string[][] = Array.from({ length: height }, () => new Array<string>(width).fill(" "));
	let column = 0;
	let row = 0;
	/** The buffers a `?1049` switch put aside, with the cursor each of them was left at. */
	const parked: { readonly grid: string[][]; readonly column: number; readonly row: number }[] = [];
	let alternate = false;

	const clamp = (): void => {
		column = Math.min(Math.max(column, 0), width - 1);
		row = Math.min(Math.max(row, 0), height - 1);
	};

	const scroll = (): void => {
		grid.shift();
		grid.push(new Array<string>(width).fill(" "));
		row = height - 1;
	};

	const draw = (glyph: string, wide: boolean, zero: boolean): void => {
		if (zero) return;
		if (column >= width) {
			column = 0;
			row += 1;
			if (row >= height) scroll();
		}
		(grid[row] as string[])[column] = glyph;
		if (wide && column + 1 < width) (grid[row] as string[])[column + 1] = WIDE_TAIL;
		column += wide ? 2 : 1;
		clamp();
	};

	const eraseLine = (mode: number): void => {
		const cells = grid[row] as string[];
		const from = mode === 1 ? 0 : column;
		const to = mode === 1 ? column : width - 1;
		for (let index = from; index <= to && index < width; index += 1) cells[index] = " ";
	};

	const feed = (text: string): void => {
		let index = 0;
		while (index < text.length) {
			const character = text[index] as string;
			if (character !== "\u001b") {
				if (character === "\r") {
					column = 0;
				} else if (character === "\n") {
					row += 1;
					if (row >= height) scroll();
				} else if (character === "\b") {
					column -= 1;
					clamp();
				} else if (character === "\t") {
					column = Math.min(width - 1, (Math.floor(column / 8) + 1) * 8);
				} else if (character >= " ") {
					const point = text.codePointAt(index) as number;
					const glyph = String.fromCodePoint(point);
					draw(glyph, isWide(point), isZeroWidth(point));
					index += glyph.length;
					continue;
				}
				index += 1;
				continue;
			}
			const introducer = text[index + 1];
			if (introducer === "[") {
				const matched = /^\u001b\[([0-9;?<>!=]*)([A-Za-z@`~])/.exec(text.slice(index));
				if (matched === null) {
					index += 1;
					continue;
				}
				const parameters = matched[1] as string;
				const final = matched[2] as string;
				const numbers = parameters.replace(/^[?<>=!]+/, "").split(";").map(part => (part === "" ? 0 : Number(part)));
				const first = numbers[0] as number;
				switch (final) {
					case "H":
					case "f":
						row = Math.max(0, (numbers[0] || 1) - 1);
						column = Math.max(0, (numbers[1] || 1) - 1);
						clamp();
						break;
					case "A":
						row -= first || 1;
						clamp();
						break;
					case "B":
						row += first || 1;
						clamp();
						break;
					case "C":
						column += first || 1;
						clamp();
						break;
					case "D":
						column -= first || 1;
						clamp();
						break;
					case "E":
						row += first || 1;
						column = 0;
						clamp();
						break;
					case "F":
						row -= first || 1;
						column = 0;
						clamp();
						break;
					case "G":
					case "`":
						column = Math.max(0, (first || 1) - 1);
						clamp();
						break;
					case "d":
						row = Math.max(0, (first || 1) - 1);
						clamp();
						break;
					case "J":
						if (first === 2 || first === 3) {
							for (const line of grid) line.fill(" ");
						} else if (first === 0) {
							eraseLine(0);
							for (let below = row + 1; below < height; below += 1) (grid[below] as string[]).fill(" ");
						}
						break;
					case "K":
						eraseLine(first);
						break;
					case "h":
						if (parameters === "?1049") {
							parked.push({ grid: grid.map(line => [...line]), column, row });
							grid = Array.from({ length: height }, () => new Array<string>(width).fill(" "));
							column = 0;
							row = 0;
							alternate = true;
						}
						break;
					case "l":
						if (parameters === "?1049" && alternate) {
							const restored = parked.pop();
							if (restored !== undefined) {
								for (let index2 = 0; index2 < height; index2 += 1) {
									grid[index2] = [...(restored.grid[index2] ?? new Array<string>(width).fill(" "))];
								}
								column = restored.column;
								row = restored.row;
							}
							alternate = false;
						}
						break;
					default:
						break;
				}
				index += matched[0].length;
				continue;
			}
			if (introducer === "]") {
				const terminated = text.indexOf("\u0007", index + 2);
				index = terminated < 0 ? text.length : terminated + 1;
				continue;
			}
			if (introducer === "(" || introducer === ")") {
				index += 3;
				continue;
			}
			index += 2;
		}
	};

	return {
		feed,
		cells: () => grid.map(line => [...line]),
		lines: () => grid.map(line => line.filter(cell => cell !== WIDE_TAIL).join("").replace(/\s+$/, "")),
	};
}
