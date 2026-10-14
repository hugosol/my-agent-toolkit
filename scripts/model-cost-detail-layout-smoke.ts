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
 * session whose startup snapshot nothing proved, one whose context was never reported and one whose
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
 *
 * This script measures the lines the frontend hands a host. What a *device* draws them in — the cells
 * and the colours, at the widths the console itself states, and a resize the console really performs —
 * is `smoke:model-cost-detail-layout-terminal`, which measures the other half of the same promise on
 * a real Windows terminal. The tree both draw and the host both draw through are one fixture:
 * `./support/detail-layout-fixture.ts`.
 */
import { rmSync } from "node:fs";
import { textColumns } from "../extensions/model-cost/harnesses/omp/widget";
import {
	REPORTED_FIELDS,
	agreesOnColumns,
	bindDetailLayout,
	columnText,
	readColumns,
	readRow,
	snapshotOf,
	treeOf,
	withoutAnsi,
} from "./support/detail-layout-fixture";

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

const run = await bindDetailLayout();
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
	// with, by whether they are agent rows (which carry their startup snapshot) or the root's own model
	// row, and by which of the row's own lines this is — a wrapped group's continuation lines are compared
	// with the same line of their siblings, never with another line of the same row.
	const grouped = new Map<string, ReadonlyMap<string, number>[]>();
	let continuation = 0;
	for (const line of tree) {
		const glyphs = line.match(/^[\s\u2502\u251C\u2514\u2500]*/)?.[0] ?? "";
		continuation = /^\s/.test(line) ? continuation + 1 : 0;
		const key = `${textColumns(glyphs)}:${snapshotOf(line) !== undefined}:${continuation}`;
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
