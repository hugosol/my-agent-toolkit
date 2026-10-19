/**
 * The `P51` comparison entry's own coverage: what `bun run compare:efficiency` prints, and what it
 * refuses to print.
 *
 * The entry is the half of `P51` a human reads — it aligns one sampling artifact against another and
 * prints every comparable figure of both, side by side, with the differences named. Nothing here
 * re-implements that comparison. Each test hands the entry two artifacts whose figures *this file
 * states by hand* and then reads what the entry made of them: the report text it printed and the code
 * it exited with. That command line is the entry's only seam, and it is the seam the evidence is read
 * through.
 *
 * What is asserted is the entry's contract rather than its table arithmetic. A figure both runs
 * recorded the same way is reported as no difference; a figure that differs is printed as a difference
 * *and the run still exits zero*, because `P51`'s judgment belongs to the human and no column carries
 * a threshold; a column the frozen record itself states varies between runs of one source — a refused
 * call's count, the wall clock, and the file total those refused calls are part of — is observed
 * rather than compared; a window one side never recorded is reported as absent rather than filled in;
 * a run whose own invariants failed is surfaced before its figures, so a reader can tell a figure the
 * sampling entry accepted from one it rejected; and an artifact that names no source revision gets
 * that stated instead of a line count.
 *
 * The complexity half is checked against the migration itself. The two revisions the evidence's
 * complexity table records are measured from their own trees, and the product surface must read the
 * 19287 → 23773 lines that table records; that pair of literals is what a regression to counting a
 * blob with `git grep -c ""` fails, since that ruler drops the blank line a blob ends on and reads
 * the same revision one line short.
 *
 * This file drives no host and needs no OMP build: it is the sampling artifacts' half of `P51`, where
 * the real-host half (what a session really costs the storage root, and whether a healthy idle window
 * really does nothing) is `efficiency-effects.test.ts` beside it.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

/** This repository's root: `tests/harness-dock/` -> the checkout the entry and its revisions sit in. */
const REPO_ROOT = path.join(import.meta.dir, "..", "..");
/** The comparison entry itself, the way `bun run compare:efficiency` invokes it. */
const ENTRY = path.join(REPO_ROOT, "scripts", "efficiency-comparison.ts");

/** The revision the evidence's complexity table measures as the migrated side of the common path. */
const BEFORE_REVISION = "59a0ed7";
/** The revision it measures as the unified implementation. */
const AFTER_REVISION = "efb03e0";
/** That table's product-surface row, as it stands in the evidence: before, after, and the delta. */
const PRODUCT_SURFACE_LINES = [19287, 23773, 4486];

/** One measured window's steps, as this file states them by hand. */
interface CostSteps {
	readonly documentReads: number;
	readonly documentPublishes: number;
	readonly lockOperations: number;
	readonly stagingOperations: number;
	readonly metadataOperations: number;
	readonly directoryOperations: number;
	readonly otherOperations: number;
	readonly failedByOperation: Readonly<Record<string, number>>;
	readonly documents: Readonly<Record<string, { readonly reads: number; readonly publishes: number }>>;
}

/** One sequence's figures, as this file states them by hand. */
interface SequenceFigures {
	readonly name: string;
	readonly fileCost: CostSteps;
	readonly windows: Readonly<Record<string, CostSteps>>;
	readonly providerRequests: number;
	readonly draws: number;
	readonly deliveries: Readonly<Record<string, number>>;
	readonly timersArmed: number;
	readonly lastLineCount: number;
	readonly wallClockMs: number;
	readonly invariant: { readonly name: string; readonly ok: boolean; readonly detail: string };
}

/** One cost block as an artifact states it: the steps, the totals they add up to, and the documents. */
function costBlockOf(steps: CostSteps): Record<string, unknown> {
	const failedOperations = Object.values(steps.failedByOperation).reduce((sum, count) => sum + count, 0);
	const total =
		steps.documentReads +
		steps.documentPublishes +
		steps.lockOperations +
		steps.stagingOperations +
		steps.metadataOperations +
		steps.directoryOperations +
		steps.otherOperations +
		failedOperations;
	return { ...steps, total, failedOperations, byOperation: {} };
}

/** One sequence as an artifact states it. */
function sequenceOf(figures: SequenceFigures): Record<string, unknown> {
	return {
		name: figures.name,
		title: `the ${figures.name} sequence, as this test states it`,
		deliveries: figures.deliveries,
		fileCost: costBlockOf(figures.fileCost),
		windows: Object.fromEntries(Object.entries(figures.windows).map(([name, steps]) => [name, costBlockOf(steps)])),
		providerRequests: figures.providerRequests,
		providerRequestPaths: { "/user/balance": figures.providerRequests },
		widget: { draws: figures.draws, timersArmed: figures.timersArmed, lastLineCount: figures.lastLineCount },
		wallClockMs: figures.wallClockMs,
		invariants: [figures.invariant],
		comparability: { comparable: true, note: "the fixture states the same conditions on both sides" },
	};
}

/**
 * One sampling artifact, carrying the figures this comparison reads and nothing else. `head` is the
 * revision the artifact names as its own source; leaving it out is how a run that recorded no
 * revision is stated.
 */
function artifactOf(options: {
	readonly label: string;
	readonly head?: string;
	readonly sequence?: (figures: SequenceFigures) => SequenceFigures;
}): Record<string, unknown> {
	const figures = options.sequence === undefined ? BASELINE_SEQUENCE : options.sequence(BASELINE_SEQUENCE);
	return {
		record: `fixture artifact ${options.label}`,
		run: {
			at: "2026-10-16T00:00:00.000Z",
			label: options.label,
			command: `fixture ${options.label}`,
			platform: "win32",
			arch: "x64",
			bun: "1.4.2",
		},
		source: { head: options.head, branch: "fixture", changedPaths: [] },
		sequences: [sequenceOf(figures)],
	};
}

/** The sequence both sides state unless a test says otherwise: one initialization window, one request. */
const BASELINE_SEQUENCE: SequenceFigures = {
	name: "fixture-sequence",
	fileCost: {
		documentReads: 3,
		documentPublishes: 1,
		lockOperations: 7,
		stagingOperations: 2,
		metadataOperations: 1,
		directoryOperations: 1,
		otherOperations: 0,
		failedByOperation: { readFile: 3, unlink: 2 },
		documents: {
			"consumption.json": { reads: 2, publishes: 1 },
			"codex-usage-estimate.json": { reads: 1, publishes: 0 },
		},
	},
	windows: {
		initialization: {
			documentReads: 2,
			documentPublishes: 0,
			lockOperations: 0,
			stagingOperations: 0,
			metadataOperations: 0,
			directoryOperations: 1,
			otherOperations: 0,
			failedByOperation: { readFile: 2 },
			documents: { "consumption.json": { reads: 1, publishes: 0 } },
		},
		request: {
			documentReads: 1,
			documentPublishes: 1,
			lockOperations: 7,
			stagingOperations: 2,
			metadataOperations: 1,
			directoryOperations: 0,
			otherOperations: 0,
			failedByOperation: { readFile: 1, unlink: 2 },
			documents: { "consumption.json": { reads: 1, publishes: 1 } },
		},
	},
	providerRequests: 1,
	draws: 8,
	deliveries: { session_start: 1, round_end: 1 },
	timersArmed: 1,
	lastLineCount: 3,
	wallClockMs: 24,
	invariant: { name: "the request asked the provider once", ok: true, detail: "requests=1 on /user/balance" },
};

/** One run of the comparison entry: what it printed, and what it exited with. */
interface RunResult {
	readonly stdout: string;
	readonly stderr: string;
	readonly exitCode: number;
}

/** Fixture directories this file created, removed when each test is done with them. */
const temporaryDirectories: string[] = [];

/** A fixture directory under the OS temp root, so no run writes into the repository. */
function fixtureDirectory(label: string): string {
	const directory = mkdtempSync(path.join(tmpdir(), `efficiency-comparison-${label}-`));
	temporaryDirectories.push(directory);
	return directory;
}

/** One artifact written where the entry can read it, and its path. */
function writeArtifact(directory: string, name: string, artifact: Record<string, unknown>): string {
	const file = path.join(directory, name);
	writeFileSync(file, `${JSON.stringify(artifact, null, "\t")}\n`, "utf8");
	return file;
}

/** One run of the comparison entry from the repository root, with the arguments given. */
async function entry(argv: readonly string[]): Promise<RunResult> {
	const child = Bun.spawn(["bun", ENTRY, ...argv], { cwd: REPO_ROOT, stdout: "pipe", stderr: "pipe" });
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	return { stdout, stderr, exitCode };
}

/** One comparison of two hand-written artifacts, from the repository root. */
async function compare(
	before: Record<string, unknown>,
	after: Record<string, unknown>,
	extra: readonly string[] = [],
): Promise<RunResult> {
	const directory = fixtureDirectory("run");
	const beforePath = writeArtifact(directory, "before.json", before);
	const afterPath = writeArtifact(directory, "after.json", after);
	return await entry(["--before", beforePath, "--after", afterPath, ...extra]);
}

/** One section of the report: from its own header to the next section header. */
function sectionOf(report: string, header: string): string {
	const start = report.indexOf(header);
	if (start === -1) throw new Error(`the report carries no ${JSON.stringify(header)} section`);
	const body = report.slice(start + header.length);
	const next = body.search(/\n== /);
	return next === -1 ? body : body.slice(0, next);
}

/** The before/after/delta cells of one row of the complexity table, read off its own printed line. */
function rowCellsOf(report: string, label: string): readonly number[] {
	const line = report.split("\n").find(candidate => candidate.includes(label));
	if (line === undefined) throw new Error(`the report has no ${JSON.stringify(label)} row`);
	return (line.match(/\d+/g) ?? []).map(Number);
}

/** The differences the entry names as comparable, as opposed to the columns it observes only. */
const DIFFERENCES = "== comparable differences ==";
/** The columns the entry prints as observations because the frozen record states they vary. */
const NOISE = "== noise columns the frozen record states vary between runs of one source (observed, not compared) ==";

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("the P51 comparison entry (compare:efficiency)", () => {
	test("reports no difference when both runs recorded the same figures", async () => {
		const run = await compare(artifactOf({ label: "before", head: BEFORE_REVISION }), artifactOf({ label: "after", head: AFTER_REVISION }));
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toContain("none: every comparable figure of every sequence and window agrees.");
		expect(run.stdout).toContain("before: invariants all held");
		expect(run.stdout).toContain("after: invariants all held");
	});

	test("surfaces a run whose own invariants failed, before that run's figures", async () => {
		const run = await compare(
			artifactOf({ label: "before", head: BEFORE_REVISION }),
			artifactOf({
				label: "after",
				head: AFTER_REVISION,
				sequence: figures => ({
					...figures,
					invariant: { name: "the request asked the provider once", ok: false, detail: "requests=2 on /user/balance" },
				}),
			}),
		);
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toContain("after: invariants 1 FAILED");
		expect(run.stdout).toContain("requests=2 on /user/balance");
	});

	test("prints a comparable difference and still exits zero, since the judgment is the human's", async () => {
		const run = await compare(
			artifactOf({ label: "before", head: BEFORE_REVISION }),
			artifactOf({
				label: "after",
				head: AFTER_REVISION,
				sequence: figures => ({ ...figures, providerRequests: 2, draws: 9 }),
			}),
		);
		expect(run.exitCode).toBe(0);
		const differences = sectionOf(run.stdout, DIFFERENCES);
		expect(differences).not.toContain("none:");
		expect(differences).toMatch(/requests\s+1 -> 2/);
		expect(differences).toMatch(/draws\s+8 -> 9/);
	});

	test("hands a window only one side recorded to the reader as absent/present, not as a count", async () => {
		const run = await compare(
			artifactOf({ label: "before", head: BEFORE_REVISION }),
			artifactOf({
				label: "after",
				head: AFTER_REVISION,
				sequence: figures => ({
					...figures,
					windows: {
						...figures.windows,
						maintenance: {
							documentReads: 0,
							documentPublishes: 1,
							lockOperations: 7,
							stagingOperations: 2,
							metadataOperations: 1,
							directoryOperations: 0,
							otherOperations: 0,
							failedByOperation: {},
							documents: { "consumption.json": { reads: 0, publishes: 1 } },
						},
					},
				}),
			}),
		);
		expect(run.exitCode).toBe(0);
		expect(sectionOf(run.stdout, DIFFERENCES)).toMatch(/fixture-sequence \/ maintenance\s+window\s+absent -> present/);
		const windows = sectionOf(run.stdout, "== representative sequences: measured windows ==");
		const row = windows.split("\n").find(line => line.startsWith("fixture-sequence / maintenance"));
		expect(row).toBeDefined();
		expect(row).not.toMatch(/\d/);
	});

	test("observes a refused call's count and the wall clock instead of comparing them", async () => {
		const run = await compare(
			artifactOf({ label: "before", head: BEFORE_REVISION }),
			artifactOf({
				label: "after",
				head: AFTER_REVISION,
				sequence: figures => ({
					...figures,
					wallClockMs: 71,
					fileCost: { ...figures.fileCost, failedByOperation: { readFile: 5, unlink: 2 } },
				}),
			}),
		);
		expect(run.exitCode).toBe(0);
		expect(sectionOf(run.stdout, DIFFERENCES)).toContain("none:");
		const noise = sectionOf(run.stdout, NOISE);
		expect(noise).toMatch(/failed by operation\s+\{"readFile":3,"unlink":2\} -> \{"readFile":5,"unlink":2\}/);
		expect(noise).toMatch(/wall clock ms\s+24 -> 71/);
	});

	test("rides the file total with the noise columns, since it counts refused calls too", async () => {
		const run = await compare(
			artifactOf({ label: "before", head: BEFORE_REVISION }),
			artifactOf({
				label: "after",
				head: AFTER_REVISION,
				sequence: figures => ({
					...figures,
					fileCost: { ...figures.fileCost, failedByOperation: { readFile: 3, unlink: 3 } },
				}),
			}),
		);
		expect(run.exitCode).toBe(0);
		expect(sectionOf(run.stdout, DIFFERENCES)).toContain("none:");
		expect(sectionOf(run.stdout, NOISE)).toMatch(/file total\s+20 -> 21 \(this column counts calls that settled as failures too\)/);
	});

	test("states that it cannot measure complexity rather than filling in a missing revision", async () => {
		const run = await compare(artifactOf({ label: "before" }), artifactOf({ label: "after" }));
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toContain("the complexity side cannot be measured");
		expect(run.stdout).not.toContain("PRODUCT SUBTOTAL");
	});

	test("measures the migration's product surface from each revision's own tree", async () => {
		const run = await compare(artifactOf({ label: "before", head: BEFORE_REVISION }), artifactOf({ label: "after", head: AFTER_REVISION }));
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toContain(`revisions measured: before ${BEFORE_REVISION}, after ${AFTER_REVISION}`);
		expect(rowCellsOf(run.stdout, "PRODUCT SUBTOTAL")).toEqual(PRODUCT_SURFACE_LINES);
	});

	test("lets the command line name the revisions the artifacts' own heads would otherwise choose", async () => {
		const run = await compare(artifactOf({ label: "before", head: BEFORE_REVISION }), artifactOf({ label: "after", head: AFTER_REVISION }), [
			"--before-rev",
			"HEAD",
			"--after-rev",
			"HEAD",
		]);
		expect(run.exitCode).toBe(0);
		expect(run.stdout).toContain("revisions measured: before HEAD, after HEAD");
		const [before, after, delta] = rowCellsOf(run.stdout, "PRODUCT SUBTOTAL");
		expect(before).toBe(after as number);
		expect(before).toBeGreaterThan(0);
		expect(delta).toBe(0);
	});

	test("writes the report it printed, under a directory it creates", async () => {
		const directory = fixtureDirectory("out");
		const beforePath = writeArtifact(directory, "before.json", artifactOf({ label: "before", head: BEFORE_REVISION }));
		const afterPath = writeArtifact(directory, "after.json", artifactOf({ label: "after", head: AFTER_REVISION }));
		const reportPath = path.join(directory, "nested", "report.txt");
		const run = await entry(["--before", beforePath, "--after", afterPath, "--out", reportPath]);
		expect(run.exitCode).toBe(0);
		const written = readFileSync(reportPath, "utf8");
		expect(written).toContain("none: every comparable figure of every sequence and window agrees.");
		expect(run.stdout.startsWith(written)).toBe(true);
		expect(run.stdout).toContain(`report: ${reportPath}`);
	});

	test("names a missing artifact flag as the error, rather than comparing nothing", async () => {
		const directory = fixtureDirectory("missing");
		const afterPath = writeArtifact(directory, "after.json", artifactOf({ label: "after", head: AFTER_REVISION }));
		const run = await entry(["--after", afterPath]);
		expect(run.exitCode).toBe(1);
		expect(run.stdout).toBe("");
		expect(run.stderr).toContain("--before <artifact.json> is required");
	});
});
