/**
 * The `P51` comparison: one representative-sequence artifact and complexity inventory against
 * another's, aligned and printed as the attributable table a human judge reads.
 *
 * `P51` asks for an attributable before/after comparison rather than a pass/fail test, so this entry
 * never judges: no column carries a threshold, no delta fails the run, and "an extra request" or "two
 * thousand more lines" is exactly what the human acceptance decides about. Its job is the other half
 * — to make every delta visible as a line in a table, and every unchanged figure visible beside it,
 * so a reader can tell an unchanged path from an unmeasured one.
 *
 * It compares only the columns the frozen record itself states are comparable. A window's count of
 * failed calls (a publication rename this platform refused while a reader held the name open, and a
 * removal of a name an earlier step had already removed) and its wall clock vary between runs of the
 * *same* source, so they are printed as observations and never as differences. Everything else — a
 * window's reads, publishes, lock and staging operations, metadata and directory calls, its provider
 * requests, its widget drawings, its armed waits and the semantic deliveries the driver made — is
 * compared figure by figure, per sequence *and* per measured window, because a whole-sequence total
 * hides the one-time root work inside a sequence's per-request cost.
 *
 * The complexity half answers `P51`'s "no significant complexity increase" from the two revisions'
 * own trees rather than from one inventory: the sampling entry's inventory covers the common path's
 * families, while the migration's structural change lives in `framework/core`, `framework/behaviors`,
 * `adapters` (historically `framework/adapters`) and `framework/modules`. Families are measured on both revisions with the same
 * one rule (every tracked line of every tracked `.ts` blob, read from each revision's own tree), so a
 * line count is a property of the revision and not of the working tree. Product families (framework,
 * extensions, entrypoints) are reported apart from the evidence surface (tests, scripts), which this
 * migration grew far more than it grew the product.
 *
 * Two facts about one side are printed before its figures, because they decide how far its numbers can
 * be read: whether any of its own invariants failed (a run whose invariants failed is a run whose
 * figures the sampling entry itself rejected), and which paths its checkout carried uncommitted (a
 * revision measured from git is not the working tree the run sampled).
 *
 * Run it with:
 *
 * ```sh
 * bun run compare:efficiency -- \
 *   --before .scratch/model-cost-pi-migration/evidence/01-efficiency-baseline.json \
 *   --after .scratch/model-cost-pi-migration/evidence/22-efficiency-after.json
 * ```
 *
 * `--before-rev` / `--after-rev` override the revisions the complexity side measures; both default to
 * the `source.head` the artifact itself recorded, which is what keeps the line counts attributable to
 * the source state of the run that produced the artifact. `--out <path>` writes the same report to a
 * file, so a reader of the evidence does not need a terminal to have kept it.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** This repository's root: `scripts/` -> the checkout the measured revisions belong to. */
const REPO_ROOT = resolve(import.meta.dir, "..");

/** One document's own cost inside a measured window, as the artifact states it. */
interface DocumentCost {
	readonly reads: number;
	readonly publishes: number;
}

/** What one measured window of file operations cost, by the step each operation belongs to. */
interface FileCost {
	readonly total: number;
	readonly documentReads: number;
	readonly documentPublishes: number;
	readonly lockOperations: number;
	readonly stagingOperations: number;
	readonly metadataOperations: number;
	readonly directoryOperations: number;
	readonly otherOperations: number;
	readonly failedOperations: number;
	readonly failedByOperation: Readonly<Record<string, number>>;
	readonly documents: Readonly<Record<string, DocumentCost>>;
	readonly byOperation: Readonly<Record<string, number>>;
}

/** One sequence as an artifact records it, narrowed to the figures this comparison reads. */
interface SequenceObservation {
	readonly name: string;
	readonly title: string;
	readonly fileCost: FileCost;
	readonly windows: Readonly<Record<string, FileCost>>;
	readonly providerRequests: number;
	readonly providerRequestPaths: Readonly<Record<string, number>>;
	readonly deliveries: Readonly<Record<string, number>>;
	readonly widget: { readonly draws: number; readonly timersArmed: number; readonly lastLineCount: number };
	readonly wallClockMs: number;
	readonly invariants: readonly { readonly name: string; readonly ok: boolean; readonly detail: string }[];
	readonly comparability: { readonly comparable: boolean; readonly note: string };
}

/** The subset of the sampling entry's artifact this comparison needs. */
interface Artifact {
	readonly record?: string;
	readonly run: {
		readonly at?: string;
		readonly label?: string;
		readonly command?: string;
		readonly platform?: string;
		readonly arch?: string;
		readonly bun?: string;
	};
	readonly source: { readonly head?: string; readonly branch?: string; readonly changedPaths?: readonly string[] };
	readonly sequences: readonly SequenceObservation[];
}

/** One comparable figure of one scope: what each side recorded for it. */
interface Figure {
	readonly scope: string;
	readonly metric: string;
	readonly before: string;
	readonly after: string;
}

/** The figures of one scope, and which table of the report that scope belongs to. */
interface ScopeFigures {
	readonly kind: "sequence" | "window" | "document";
	readonly scope: string;
	readonly figures: readonly Figure[];
}

/**
 * The one cost column that is not compared: it counts a window's calls that settled as failures too,
 * which the frozen record states vary between runs of one source, so it rides with the noise columns.
 * It stays in the tables because it is the one figure that must balance against the steps beside it.
 */
const FILE_TOTAL_METRIC = "file total";

/**
 * The comparable steps of one measured window's file cost, each read off the cost it belongs to.
 */
const COST_METRICS: readonly (readonly [string, (cost: FileCost) => number])[] = [
	["reads", cost => cost.documentReads],
	["publishes", cost => cost.documentPublishes],
	["locks", cost => cost.lockOperations],
	["staging", cost => cost.stagingOperations],
	["metadata", cost => cost.metadataOperations],
	["dirs", cost => cost.directoryOperations],
	["other", cost => cost.otherOperations],
	[FILE_TOTAL_METRIC, cost => cost.total],
];

/** The figures of one sequence beyond its file cost: what its work asked of the provider and the UI. */
const SEQUENCE_METRICS: readonly (readonly [string, (sequence: SequenceObservation) => number])[] = [
	["requests", sequence => sequence.providerRequests],
	["draws", sequence => sequence.widget.draws],
	["events", sequence => Object.values(sequence.deliveries).reduce((sum, count) => sum + count, 0)],
	["waits", sequence => sequence.widget.timersArmed],
	["lines", sequence => sequence.widget.lastLineCount],
];

/** The columns the frozen record itself states are noise between runs of one source. */
const NOISE_METRICS: readonly (readonly [string, (sequence: SequenceObservation) => string])[] = [
	["failed by operation", sequence => JSON.stringify(sequence.fileCost.failedByOperation)],
	["wall clock ms", sequence => String(sequence.wallClockMs)],
];

/** The columns of the whole-sequence table: its file cost, then what its work asked of the provider and the UI. */
const SEQUENCE_COLUMNS: readonly string[] = [...COST_METRICS.map(([name]) => name), ...SEQUENCE_METRICS.map(([name]) => name)];

/** The columns of the window table: a window records file cost only. */
const WINDOW_COLUMNS: readonly string[] = COST_METRICS.map(([name]) => name);

/** One scope's cells for one column list: `before/after` per metric, `*` when the two disagree. */
function cellsOf(scope: ScopeFigures, columns: readonly string[]): readonly string[] {
	return columns.map(metric => {
		const figure = scope.figures.find(candidate => candidate.metric === metric);
		if (figure === undefined) return "-";
		return `${figure.before}/${figure.after}${figure.before === figure.after ? "" : "*"}`;
	});
}

/** The name of one argument's value, as this entry was invoked with it. */
function argumentOf(name: string): string | undefined {
	const index = process.argv.indexOf(name);
	const value = process.argv[index + 1];
	return index === -1 || value === undefined || value.startsWith("--") ? undefined : value;
}

/** One artifact, read from disk with a message that names the file rather than a JSON parse error. */
function readArtifact(flag: string): { readonly artifact: Artifact; readonly path: string } {
	const path = argumentOf(flag);
	if (path === undefined) throw new Error(`${flag} <artifact.json> is required: it is the sampling entry's own output (scripts/efficiency-baseline.ts).`);
	const artifact = JSON.parse(readFileSync(resolve(REPO_ROOT, path), "utf8")) as Artifact;
	if (!Array.isArray(artifact.sequences) || artifact.sequences.length === 0) {
		throw new Error(`${path} carries no sequences: this comparison reads artifacts the sampling entry wrote.`);
	}
	return { artifact, path };
}

/**
 * The line count of one blob's content: every line break, plus the last line when the blob does not
 * end on one. That is the count the file itself holds, which `git grep -c ""` does not give: it drops
 * the blank line a blob ends on — `framework/adapters/omp/session/facts.ts` read as 278 lines while
 * holding 279 — and it omits a blob whose every line is blank altogether, so it cannot be the ruler
 * this side of `P51` is measured with.
 */
function countLines(content: Uint8Array): number {
	let count = 0;
	for (const byte of content) if (byte === 0x0a) count += 1;
	return content.length > 0 && content[content.length - 1] !== 0x0a ? count + 1 : count;
}

/**
 * The tracked line count of every TypeScript file one revision holds, keyed by its repository path.
 *
 * The count comes from the revision's own tree, not from the working tree: the blobs that revision
 * holds are read and counted, which is what makes the two sides of the complexity comparison
 * attributable to the source states their artifacts recorded. `git ls-tree` names the blobs once, and
 * `git cat-file --batch` reads them all over one pipe, so one revision costs two git invocations.
 */
function revisionLines(revision: string): ReadonlyMap<string, number> {
	const roots = ["adapters", "framework", "extensions", "entrypoints", "tests", "scripts"];
	const listed = Bun.spawnSync(["git", "ls-tree", "-r", revision, "--", ...roots], { cwd: REPO_ROOT, stdout: "pipe", stderr: "pipe" });
	if (listed.exitCode !== 0) {
		throw new Error(`git ls-tree found no tracked files at ${revision} (exit ${listed.exitCode}): ${listed.stderr.toString().trim()}`);
	}
	const tracked: { readonly path: string; readonly object: string }[] = [];
	for (const entry of listed.stdout.toString().split("\n")) {
		const separator = entry.indexOf("\t");
		if (separator === -1) continue;
		const [mode, type, object] = entry.slice(0, separator).split(" ");
		if (mode === undefined || type !== "blob" || object === undefined) continue;
		const path = entry.slice(separator + 1);
		if (!path.endsWith(".ts")) continue;
		tracked.push({ path, object });
	}
	if (tracked.length === 0) throw new Error(`revision ${revision} holds no tracked TypeScript under ${roots.join(", ")}`);

	const read = Bun.spawnSync(["git", "cat-file", "--batch"], {
		cwd: REPO_ROOT,
		stdin: Buffer.from(`${tracked.map(entry => entry.object).join("\n")}\n`),
		stdout: "pipe",
		stderr: "pipe",
	});
	if (read.exitCode !== 0) {
		throw new Error(`git cat-file cannot read the tracked blobs of ${revision} (exit ${read.exitCode}): ${read.stderr.toString().trim()}`);
	}
	const stream = read.stdout;
	const lines = new Map<string, number>();
	let cursor = 0;
	for (const entry of tracked) {
		const headerEnd = stream.indexOf(0x0a, cursor);
		if (headerEnd === -1) throw new Error(`git cat-file answered with fewer blobs than ${revision} tracks (stopped at ${entry.path})`);
		const header = stream.subarray(cursor, headerEnd).toString();
		const size = Number(header.split(" ")[2]);
		const start = headerEnd + 1;
		if (header.endsWith("missing") || !Number.isFinite(size)) throw new Error(`git cat-file cannot read ${entry.path} at ${revision}: ${header}`);
		if (start + size > stream.length) throw new Error(`git cat-file answered with a short blob for ${entry.path} at ${revision}`);
		lines.set(entry.path, countLines(stream.subarray(start, start + size)));
		cursor = start + size + 1;
	}
	return lines;
}

/** What one artifact says about itself: its own state, and whether its own invariants held. */
function conditionLines(artifact: Artifact, path: string, label: string): readonly string[] {
	const failed = artifact.sequences.flatMap(sequence =>
		sequence.invariants.filter(invariant => !invariant.ok).map(invariant => `${sequence.name}: ${invariant.name} — ${invariant.detail}`),
	);
	const changed = artifact.source.changedPaths ?? [];
	return [
		`${label}: ${artifact.record ?? path}`,
		`${label}: source ${artifact.source.head ?? "<unrecorded>"} on ${artifact.source.branch ?? "<unrecorded>"} | run ${artifact.run.label ?? "<unlabelled>"} at ${artifact.run.at ?? "<unrecorded>"} | ${artifact.run.platform ?? "?"}/${artifact.run.arch ?? "?"} bun ${artifact.run.bun ?? "?"}`,
		`${label}: command ${artifact.run.command ?? "<unrecorded>"}`,
		`${label}: uncommitted paths the run recorded: ${changed.length === 0 ? "none" : `${changed.length} (${changed.join(", ")})`}`,
		`${label}: invariants ${failed.length === 0 ? "all held" : `${failed.length} FAILED — ${failed.join(" | ")}`}`,
	];
}

/** One pad-and-compare table: columns named across the top, then one row per scope. */
function table(header: string, names: readonly string[], rows: readonly (readonly [string, readonly string[]])[]): readonly string[] {
	const labelWidth = Math.max(header.length, ...rows.map(row => row[0].length));
	const widths = names.map((name, index) => Math.max(name.length, ...rows.map(row => (row[1][index] ?? "").length)));
	const layout = (cells: readonly string[]): string =>
		`${cells[0].padEnd(labelWidth)}${cells
			.slice(1)
			.map((cellText, index) => `  ${cellText.padStart(widths[index] ?? 0)}`)
			.join("")}`;
	return [layout([header, ...names]), ...rows.map(row => layout([row[0], ...row[1]]))];
}

/**
 * Every comparable figure of one sequence and of each of its windows: the sequence's own file cost,
 * its provider and UI figures, each document it wrote, then each measured window it records.
 */
function figuresOf(before: SequenceObservation, after: SequenceObservation): readonly ScopeFigures[] {
	const scopes: ScopeFigures[] = [];
	scopes.push({
		kind: "sequence",
		scope: before.name,
		figures: [
			...COST_METRICS.map(([metric, cost]) => ({ scope: before.name, metric, before: String(cost(before.fileCost)), after: String(cost(after.fileCost)) })),
			...SEQUENCE_METRICS.map(([metric, read]) => ({ scope: before.name, metric, before: String(read(before)), after: String(read(after)) })),
		],
	});

	for (const name of [...new Set([...Object.keys(before.fileCost.documents), ...Object.keys(after.fileCost.documents)])].sort()) {
		const left = before.fileCost.documents[name];
		const right = after.fileCost.documents[name];
		scopes.push({
			kind: "document",
			scope: `${before.name} / document ${name}`,
			figures: [
				{ scope: `${before.name} / document ${name}`, metric: "reads", before: String(left?.reads ?? "-"), after: String(right?.reads ?? "-") },
				{ scope: `${before.name} / document ${name}`, metric: "publishes", before: String(left?.publishes ?? "-"), after: String(right?.publishes ?? "-") },
			],
		});
	}

	for (const name of [...new Set([...Object.keys(before.windows), ...Object.keys(after.windows)])]) {
		const left = before.windows[name];
		const right = after.windows[name];
		const scope = `${before.name} / ${name}`;
		scopes.push({
			kind: "window",
			scope,
			figures:
				left === undefined || right === undefined
					? [{ scope, metric: "window", before: left === undefined ? "absent" : "present", after: right === undefined ? "absent" : "present" }]
					: COST_METRICS.map(([metric, cost]) => ({ scope, metric, before: String(cost(left)), after: String(cost(right)) })),
		});
	}
	return scopes;
}

/** One line per sequence whose semantic delivery counts differ, naming the kinds that differ. */
function deliveryLines(
	before: Artifact,
	after: Artifact,
	pairs: readonly (readonly [SequenceObservation, SequenceObservation])[],
): readonly string[] {
	const lines: string[] = [];
	for (const [left, right] of pairs) {
		const differing = [...new Set([...Object.keys(left.deliveries), ...Object.keys(right.deliveries)])]
			.sort()
			.filter(kind => (left.deliveries[kind] ?? 0) !== (right.deliveries[kind] ?? 0));
		if (differing.length === 0) continue;
		lines.push(`${left.name}: ${differing.map(kind => `${kind} ${left.deliveries[kind] ?? 0} -> ${right.deliveries[kind] ?? 0}`).join(", ")}`);
	}
	if (lines.length > 0) return lines;
	const missing = [
		...before.sequences.map(sequence => sequence.name).filter(name => !after.sequences.some(sequence => sequence.name === name)),
		...after.sequences.map(sequence => sequence.name).filter(name => !before.sequences.some(sequence => sequence.name === name)),
	];
	return missing.length === 0
		? ["every sequence delivered the same kinds the same number of times."]
		: [`sequences present on one side only: ${missing.join(", ")}`];
}

/** The complexity families of both revisions, the modules that changed, and the two subtotals. */
function complexityLines(beforeRevision: string, afterRevision: string): readonly string[] {
	const before = revisionLines(beforeRevision);
	const after = revisionLines(afterRevision);
	const paths = [...new Set([...before.keys(), ...after.keys()])];
	const families = new Map<string, { before: number; after: number }>();
	for (const path of paths) {
		const parts = path.split("/");
		const family = parts.length <= 2 ? (parts[0] ?? path) : `${parts[0]}/${parts[1]}`;
		const entry = families.get(family) ?? { before: 0, after: 0 };
		entry.before += before.get(path) ?? 0;
		entry.after += after.get(path) ?? 0;
		families.set(family, entry);
	}

	const lines: string[] = [`revisions measured: before ${beforeRevision}, after ${afterRevision} (tracked TypeScript, from each revision's own tree)`];
	const rows: [string, string[]][] = [];
	const subtotals: Record<string, { before: number; after: number }> = {
		product: { before: 0, after: 0 },
		evidence: { before: 0, after: 0 },
	};
	for (const family of [...families.keys()].sort()) {
		const entry = families.get(family) as { before: number; after: number };
		const surface = family.startsWith("adapters") || family.startsWith("framework") || family.startsWith("extensions") || family.startsWith("entrypoints") ? "product" : "evidence";
		subtotals[surface].before += entry.before;
		subtotals[surface].after += entry.after;
		rows.push([`${surface} ${family}`, [String(entry.before), String(entry.after), `${entry.after - entry.before >= 0 ? "+" : ""}${entry.after - entry.before}`]]);
	}
	const delta = (entry: { before: number; after: number }): string => `${entry.after - entry.before >= 0 ? "+" : ""}${entry.after - entry.before}`;
	rows.push(["PRODUCT SUBTOTAL (adapters + framework + extensions + entrypoints)", [String(subtotals.product.before), String(subtotals.product.after), delta(subtotals.product)]]);
	rows.push(["EVIDENCE SUBTOTAL (tests + scripts, not product code)", [String(subtotals.evidence.before), String(subtotals.evidence.after), delta(subtotals.evidence)]]);
	lines.push(...table("family", ["before", "after", "delta"], rows));

	const changed = paths
		.map(path => [path, before.get(path) ?? 0, after.get(path) ?? 0] as [string, number, number])
		.filter(([, left, right]) => left !== right)
		.sort((left, right) => Math.abs(right[2] - right[1]) - Math.abs(left[2] - left[1]) || left[0].localeCompare(right[0]));
	const productPaths = new Set(changed.map(([path]) => path).filter(path => path.startsWith("adapters/") || path.startsWith("framework/") || path.startsWith("extensions/") || path.startsWith("entrypoints/")));
	const productChanged = changed.filter(([path]) => productPaths.has(path));
	const evidenceChanged = changed.filter(([path]) => !productPaths.has(path));
	const rowOf = ([path, left, right]: readonly [string, number, number]): [string, string[]] => [
		path,
		[left === 0 ? "-" : String(left), right === 0 ? "-" : String(right), `${right - left >= 0 ? "+" : ""}${right - left}`],
	];
	lines.push("");
	lines.push(`modules that changed: ${changed.length} of ${paths.length} tracked modules; ${productChanged.length} in the product`);
	lines.push(...table("product module", ["before", "after", "delta"], productChanged.map(rowOf)));
	lines.push("");
	lines.push(`evidence-surface modules that changed: ${evidenceChanged.length} (ten largest below; the evidence surface is not product code)`);
	lines.push(...table("evidence module", ["before", "after", "delta"], evidenceChanged.slice(0, 10).map(rowOf)));
	return lines;
}

/** The whole report: what was compared, every comparable figure, and the complexity of both revisions. */
function report(before: { artifact: Artifact; path: string }, after: { artifact: Artifact; path: string }): string {
	const pairs: [SequenceObservation, SequenceObservation][] = [];
	for (const left of before.artifact.sequences) {
		const right = after.artifact.sequences.find(sequence => sequence.name === left.name);
		if (right !== undefined) pairs.push([left, right]);
	}
	const scopes = pairs.flatMap(([left, right]) => figuresOf(left, right));
	const lines: string[] = [];
	lines.push("P51 efficiency comparison — the representative sequences and the complexity of two source states");
	lines.push(...conditionLines(before.artifact, before.path, "before"));
	lines.push(...conditionLines(after.artifact, after.path, "after"));
	lines.push("");
	lines.push("a cell is before/after; * marks a difference. Each column is a cost the frozen record fixes, and none of them is a threshold.");
	lines.push(`\`${FILE_TOTAL_METRIC}\` counts a window's calls that settled as failures as well, so it is reported with the noise columns rather than compared; the steps beside it are the comparison.`);
	lines.push("");
	lines.push("== representative sequences: whole sequence ==");
	lines.push(
		...table(
			"sequence",
			SEQUENCE_COLUMNS,
			scopes
				.filter(scope => scope.kind === "sequence")
				.map((scope): [string, readonly string[]] => [scope.scope, cellsOf(scope, SEQUENCE_COLUMNS)]),
		),
	);
	lines.push("");
	lines.push("== representative sequences: measured windows ==");
	lines.push(
		...table(
			"sequence / window",
			WINDOW_COLUMNS,
			scopes
				.filter(scope => scope.kind === "window")
				.map((scope): [string, readonly string[]] => [scope.scope, cellsOf(scope, WINDOW_COLUMNS)]),
		),
	);
	lines.push("");
	lines.push("== comparable differences ==");
	const differing = scopes.flatMap(scope =>
		scope.figures.filter(figure => figure.metric !== FILE_TOTAL_METRIC && figure.before !== figure.after),
	);
	if (differing.length === 0) lines.push("none: every comparable figure of every sequence and window agrees.");
	for (const figure of differing) lines.push(`${figure.scope.padEnd(40)}${figure.metric.padEnd(16)}${figure.before} -> ${figure.after}`);
	for (const [left, right] of pairs) {
		if (JSON.stringify(left.providerRequestPaths) === JSON.stringify(right.providerRequestPaths)) continue;
		lines.push(`provider paths: ${left.name}: ${JSON.stringify(left.providerRequestPaths)} -> ${JSON.stringify(right.providerRequestPaths)}`);
	}
	lines.push("");
	lines.push("== semantic deliveries ==");
	lines.push(...deliveryLines(before.artifact, after.artifact, pairs));
	lines.push("");
	lines.push("== noise columns the frozen record states vary between runs of one source (observed, not compared) ==");
	const noise = pairs.flatMap(([left, right]) =>
		NOISE_METRICS.filter(([, read]) => read(left) !== read(right)).map(([metric, read]) => `${left.name.padEnd(40)}${metric.padEnd(20)}${read(left)} -> ${read(right)}`),
	);
	const totalNoise = scopes
		.flatMap(scope => scope.figures.filter(figure => figure.metric === FILE_TOTAL_METRIC && figure.before !== figure.after))
		.map(figure => `${figure.scope.padEnd(40)}${"file total".padEnd(20)}${figure.before} -> ${figure.after} (this column counts calls that settled as failures too)`);
	lines.push(...(noise.length === 0 && totalNoise.length === 0 ? ["no noise column differs."] : [...noise, ...totalNoise]));
	lines.push("");
	lines.push("== complexity ==");
	const beforeRevision = argumentOf("--before-rev") ?? before.artifact.source.head;
	const afterRevision = argumentOf("--after-rev") ?? after.artifact.source.head;
	if (beforeRevision === undefined || afterRevision === undefined) {
		lines.push("an artifact names no source.head and no --before-rev/--after-rev was given: the complexity side cannot be measured.");
		return `${lines.join("\n")}\n`;
	}
	lines.push(...complexityLines(beforeRevision, afterRevision));
	return `${lines.join("\n")}\n`;
}

try {
	const before = readArtifact("--before");
	const after = readArtifact("--after");
	const text = report(before, after);
	console.log(text);
	const out = argumentOf("--out");
	if (out !== undefined) {
		const full = resolve(REPO_ROOT, out);
		mkdirSync(dirname(full), { recursive: true });
		writeFileSync(full, text, "utf8");
		console.log(`report: ${full}`);
	}
} catch (error) {
	console.error(`efficiency-comparison: ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
}
