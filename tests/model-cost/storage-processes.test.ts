/**
 * Independent processes, one shared storage root (P44, P45, P47, P51; S4/S5).
 *
 * The seam is the production path itself, run by real processes: each child reads the extension's
 * `config.yaml` through the framework's own configuration read, builds the runtime from those
 * validated values, initializes the store and commits a session snapshot through the framework's
 * safe-file entry and its cross-process lock. No in-memory stand-in for that coordination appears
 * anywhere in this file — the only state the cases' processes share is the file system, and every
 * storage root, configuration directory, working directory and result file is a fresh temporary
 * directory that is removed afterwards.
 *
 * The expectations are the storage contract's, written here as complete documents and paths: which
 * records one shared root ends up holding and which parent each carries, which root a declared value
 * names from a given working directory, that a refused snapshot leaves the file exactly as it was,
 * and that an unusable baseline is neither overwritten nor turned into a fresh start.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { ConsumptionDocument, SessionRecord } from "../../extensions/model-cost/shared-logic/consumption-document";
import type { ChildPlan, ChildResult } from "./support/store-child";

/** The child fixture, as this process starts it. */
const CHILD = path.join(import.meta.dir, "support", "store-child.ts");

/** Every temporary directory this file created, removed after each case. */
const directories: string[] = [];

/** The file every root keeps its active consumption document in. */
const CONSUMPTION_FILE = "consumption.json";

/** A fresh temporary directory. */
function tempDirectory(label: string): string {
	const directory = mkdtempSync(path.join(tmpdir(), `model-cost-${label}-`));
	directories.push(directory);
	return directory;
}

/** The record one child commits: an identity, a name, its direct parent, a version and own usage. */
function session(id: string, parent: string | null, version: number, costCny = 0.01): SessionRecord {
	return {
		id,
		name: `会话 ${id}`,
		parent,
		saveVersion: version,
		own: {
			deepseek: {
				"model-A": { tokens: { input: 1000, cacheRead: 0, cacheWrite: 0, output: 200 }, costCny },
			},
		},
	};
}

/** The document one root already holds before a case's processes start. */
function document(sessions: readonly SessionRecord[], periodId = "shared-period"): ConsumptionDocument {
	return {
		schemaVersion: 1,
		periodId,
		start: "2026-10-01T00:00:00.000Z",
		holiday: false,
		harnesses: { omp: { sessions } },
	};
}

/** What one case's shared root looks like on disk, written by the test rather than by the code under test. */
function seedStore(storeDirectory: string, contents: string): void {
	mkdirSync(storeDirectory, { recursive: true });
	writeFileSync(path.join(storeDirectory, CONSUMPTION_FILE), contents, "utf8");
}

/**
 * One extension configuration directory under a repository root the framework reads against.
 *
 * The file is the extension's own `config.yaml`, and the directory above it is the repository in
 * which the framework resolves `extensions/model-cost/config.yaml` — the same convention a real
 * assembly supplies.
 */
function configRepository(label: string, declaredStorageDir: string): { repositoryRoot: string; configDirectory: string } {
	const repositoryRoot = tempDirectory(label);
	const configDirectory = path.join(repositoryRoot, "extensions", "model-cost");
	mkdirSync(configDirectory, { recursive: true });
	writeFileSync(
		path.join(configDirectory, "config.yaml"),
		`# the storage root of one case of the storage suite\nstorageDir: ${JSON.stringify(declaredStorageDir)}\nbalanceTtlMs: 30000\n`,
		"utf8",
	);
	return { repositoryRoot, configDirectory };
}

/**
 * Start one child process and read its results back.
 *
 * The child runs in the working directory the case demands, with this process's own environment
 * plus any override a case needs (an isolated user home, for instance), and its plan is written
 * beside its results.
 */
async function runChild(
	plan: ChildPlan,
	options: { readonly cwd: string; readonly env?: Record<string, string | undefined> },
): Promise<ChildResult> {
	const planFile = plan.resultPath.replace(/\.json$/, ".plan.json");
	writeFileSync(planFile, JSON.stringify(plan), "utf8");
	const child = Bun.spawn(["bun", CHILD, planFile], {
		cwd: options.cwd,
		env: { ...process.env, ...options.env },
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stderr, exitCode] = await Promise.all([new Response(child.stderr).text(), child.exited]);
	if (exitCode !== 0) throw new Error(`store-child exited ${String(exitCode)}:\n${stderr}`);
	if (!existsSync(plan.resultPath)) throw new Error(`store-child wrote no results (stderr: ${stderr})`);
	return JSON.parse(readFileSync(plan.resultPath, "utf8")) as ChildResult;
}

/** The document one root's consumption file holds. */
function storedDocument(storeDirectory: string): ConsumptionDocument {
	return JSON.parse(readFileSync(path.join(storeDirectory, CONSUMPTION_FILE), "utf8")) as ConsumptionDocument;
}

/** The one plan a case's child runs: one configuration, one working directory and one snapshot each. */
function childPlan(input: {
	readonly run: string;
	readonly repositoryRoot: string;
	readonly configDirectory: string;
	readonly label: string;
	readonly record?: SessionRecord;
	readonly startAt?: number;
	/** The home the child must really have before it runs; the child's own `homedir()` decides it. */
	readonly requireUserHome?: string;
}): ChildPlan {
	return {
		configRoot: input.repositoryRoot,
		configDirectory: input.configDirectory,
		...(input.requireUserHome === undefined
			? { userHomeDirectory: path.join(input.run, "home") }
			: { requireUserHome: input.requireUserHome }),
		...(input.startAt === undefined ? {} : { startAt: input.startAt }),
		...(input.record === undefined ? {} : { commits: [{ harness: "omp", record: input.record }] }),
		resultPath: path.join(input.run, `result-${input.label}.json`),
	};
}

afterEach(() => {
	for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("the storage root of independent processes", () => {
	test("processes in different working directories share the root a relative value names", async () => {
		const run = tempDirectory("relative");
		const config = configRepository("relative-config", "data/archive");
		const workA = tempDirectory("work-a");
		const workB = tempDirectory("work-b");
		// The config-directory rule: the declared value is relative to the directory the extension's
		// own config file lives in, whatever working directory the process was started in.
		const expectedRoot = path.join(config.configDirectory, "data", "archive");

		const first = await runChild(
			childPlan({ ...config, run, label: "a", record: session("session-a", null, 1) }),
			{ cwd: workA },
		);
		// The second process reads the document the first one created, so its own save joins that
		// period rather than starting another one.
		const second = await runChild(
			childPlan({ ...config, run, label: "b", record: session("session-b", "session-a", 1) }),
			{ cwd: workB },
		);

		expect([first.kind, second.kind]).toEqual(["ran", "ran"]);
		expect([first.load, second.load]).toEqual(["fresh", "loaded"]);
		expect([first.consumptionFile, second.consumptionFile]).toEqual([
			path.join(expectedRoot, CONSUMPTION_FILE),
			path.join(expectedRoot, CONSUMPTION_FILE),
		]);
		expect([...first.commits, ...second.commits]).toEqual([{ kind: "saved" }, { kind: "saved" }]);
		expect(existsSync(path.join(expectedRoot, CONSUMPTION_FILE))).toBe(true);
		// Nothing landed under either working directory: the declared value never follows the cwd.
		expect(existsSync(path.join(workA, "data"))).toBe(false);
		expect(existsSync(path.join(workB, "data"))).toBe(false);
		const stored = storedDocument(expectedRoot);
		expect(stored.harnesses.omp?.sessions.map(record => record.id)).toEqual(["session-a", "session-b"]);
		expect(stored.harnesses.omp?.sessions.find(record => record.id === "session-b")?.parent).toBe("session-a");
	});

	test("the field's own ~/ is the isolated user's OMP home, and it never follows the cwd", async () => {
		const run = tempDirectory("home");
		const home = path.join(run, "user-home");
		mkdirSync(home, { recursive: true });
		const config = configRepository("home-config", "~/cost-archive");
		const work = tempDirectory("home-work");
		const expectedRoot = path.join(home, ".omp", "cost-archive");

		const result = await runChild(
			childPlan({ ...config, run, label: "home", record: session("session-home", null, 1), requireUserHome: home }),
			{
				cwd: work,
				env: {
					USERPROFILE: home,
					HOME: home,
					HOMEDRIVE: path.parse(home).root,
					HOMEPATH: home.slice(path.parse(home).root.length - 1),
				},
			},
		);

		expect([result.kind, result.commits]).toEqual(["ran", [{ kind: "saved" }]]);
		expect(result.userHomeDirectory).toBe(home);
		expect(result.consumptionFile).toBe(path.join(expectedRoot, CONSUMPTION_FILE));
		expect(existsSync(path.join(expectedRoot, CONSUMPTION_FILE))).toBe(true);
		// The OMP home, not the user home itself: `<home>/cost-archive` was never used.
		expect(existsSync(path.join(home, "cost-archive"))).toBe(false);
	});

	test("a changed value names another root in the next process, and nothing migrates", async () => {
		const run = tempDirectory("retarget");
		const firstRoot = path.join(run, "store-one");
		const secondRoot = path.join(run, "store-two");
		const config = configRepository("retarget-config", firstRoot);
		const work = tempDirectory("retarget-work");

		const first = await runChild(
			childPlan({ ...config, run, label: "one", record: session("session-one", null, 1) }),
			{ cwd: work },
		);
		expect(first.commits).toEqual([{ kind: "saved" }]);
		const before = readFileSync(path.join(firstRoot, CONSUMPTION_FILE), "utf8");

		// The operator edits the one config entry: the next process selects another root.
		writeFileSync(
			path.join(config.configDirectory, "config.yaml"),
			`storageDir: ${JSON.stringify(secondRoot)}\nbalanceTtlMs: 30000\n`,
			"utf8",
		);
		const second = await runChild(
			childPlan({ ...config, run, label: "two", record: session("session-two", null, 1) }),
			{ cwd: work },
		);

		expect(second.consumptionFile).toBe(path.join(secondRoot, CONSUMPTION_FILE));
		// Each root holds its own document, and nothing was copied, moved or merged.
		expect(readFileSync(path.join(firstRoot, CONSUMPTION_FILE), "utf8")).toBe(before);
		expect(storedDocument(firstRoot).harnesses.omp?.sessions.map(record => record.id)).toEqual(["session-one"]);
		expect(storedDocument(secondRoot).harnesses.omp?.sessions.map(record => record.id)).toEqual(["session-two"]);
		expect(readdirSync(firstRoot)).toEqual([CONSUMPTION_FILE]);
		expect(readdirSync(secondRoot)).toEqual([CONSUMPTION_FILE]);
	});

	test("two spellings of one root are one document, and the file is where the root says", async () => {
		const run = tempDirectory("alias");
		const storeDirectory = path.join(run, "store");
		mkdirSync(storeDirectory, { recursive: true });
		// A second spelling of that one directory: a directory link. It reaches the same files while
		// being a different path, so a store that did not fold spellings would keep two documents.
		const linkDirectory = path.join(run, "store-link");
		symlinkSync(storeDirectory, linkDirectory, process.platform === "win32" ? "junction" : "dir");
		const plain = configRepository("alias-plain", storeDirectory);
		const alias = configRepository("alias-link", linkDirectory);
		const work = tempDirectory("alias-work");

		const first = await runChild(
			childPlan({ ...plain, run, label: "plain", record: session("session-plain", null, 1) }),
			{ cwd: work },
		);
		const second = await runChild(
			childPlan({ ...alias, run, label: "alias", record: session("session-alias", "session-plain", 1) }),
			{ cwd: work },
		);

		expect([...first.commits, ...second.commits]).toEqual([{ kind: "saved" }, { kind: "saved" }]);
		expect(first.consumptionFile).toBe(path.join(storeDirectory, CONSUMPTION_FILE));
		// The second process really used the other spelling, and both landed in the one document.
		expect(second.consumptionFile).toBe(path.join(linkDirectory, CONSUMPTION_FILE));
		expect(readdirSync(storeDirectory)).toEqual([CONSUMPTION_FILE]);
		expect(storedDocument(storeDirectory).harnesses.omp?.sessions.map(record => record.id)).toEqual([
			"session-plain",
			"session-alias",
		]);
	});

	test("concurrent processes committing their own sessions lose no record", async () => {
		const run = tempDirectory("concurrent");
		const storeDirectory = path.join(run, "store");
		const config = configRepository("concurrent-config", storeDirectory);
		const work = tempDirectory("concurrent-work");
		const shared = document([session("session-main", null, 3)]);
		seedStore(storeDirectory, JSON.stringify(shared));

		const records = Array.from({ length: 6 }, (_unused, index) =>
			session(`session-${String(index)}`, "session-main", 1, 0.01 + index),
		);
		const startAt = Date.now() + 400;
		const results = await Promise.all(
			records.map((record, index) =>
				runChild(childPlan({ ...config, run, label: String(index), record, startAt }), { cwd: work }),
			),
		);

		expect(results.map(result => result.kind)).toEqual(records.map(() => "ran"));
		expect(results.map(result => result.load)).toEqual(records.map(() => "loaded"));
		expect(results.map(result => result.commits)).toEqual(records.map(() => [{ kind: "saved" }]));
		expect(results.map(result => result.period?.periodId)).toEqual(records.map(() => shared.periodId));
		// Every process's own record survived every other process's save, and each kept its parent.
		const stored = storedDocument(storeDirectory);
		expect(stored.harnesses.omp?.sessions.map(record => record.id).sort()).toEqual(
			["session-0", "session-1", "session-2", "session-3", "session-4", "session-5", "session-main"],
		);
		for (const record of records) {
			expect(stored.harnesses.omp?.sessions.find(candidate => candidate.id === record.id)).toEqual(record);
		}
		// No coordination leftovers: the root holds the document alone.
		expect(readdirSync(storeDirectory)).toEqual([CONSUMPTION_FILE]);
	});

	test("concurrent processes submitting one version with other content conflict, and the file keeps one", async () => {
		const run = tempDirectory("conflict");
		const storeDirectory = path.join(run, "store");
		const config = configRepository("conflict-config", storeDirectory);
		const work = tempDirectory("conflict-work");
		seedStore(storeDirectory, JSON.stringify(document([session("session-main", null, 1)])));

		const candidates = [0.01, 0.02, 0.03, 0.04].map(cost => session("session-shared", null, 2, cost));
		const startAt = Date.now() + 400;
		const results = await Promise.all(
			candidates.map((record, index) =>
				runChild(childPlan({ ...config, run, label: String(index), record, startAt }), { cwd: work }),
			),
		);

		const outcomes = results.map(result => result.commits[0]?.kind);
		expect(outcomes.filter(kind => kind === "saved")).toHaveLength(1);
		expect(outcomes.filter(kind => kind === "conflict")).toHaveLength(3);
		// The one record the file holds is the winner's own content: nothing was added together, no
		// maximum was taken, and no later writer replaced it.
		const stored = storedDocument(storeDirectory).harnesses.omp?.sessions ?? [];
		expect(stored).toHaveLength(2);
		expect(stored.find(record => record.id === "session-shared")).toEqual(
			candidates[outcomes.indexOf("saved")] as SessionRecord,
		);
	});

	test("an older version from another process is refused and the file keeps its own record", async () => {
		const run = tempDirectory("stale");
		const storeDirectory = path.join(run, "store");
		const config = configRepository("stale-config", storeDirectory);
		const work = tempDirectory("stale-work");
		const current = session("session-main", null, 5, 0.05);
		seedStore(storeDirectory, JSON.stringify(document([current])));
		const before = readFileSync(path.join(storeDirectory, CONSUMPTION_FILE), "utf8");

		const result = await runChild(
			childPlan({ ...config, run, label: "stale", record: session("session-main", null, 4, 0.99) }),
			{ cwd: work },
		);

		expect(result.commits).toEqual([{ kind: "stale-version" }]);
		expect(readFileSync(path.join(storeDirectory, CONSUMPTION_FILE), "utf8")).toBe(before);
		expect(storedDocument(storeDirectory).harnesses.omp?.sessions[0]).toEqual(current);
	});

	test("an unusable baseline pauses every process and is never written over", async () => {
		const run = tempDirectory("unusable");
		const storeDirectory = path.join(run, "store");
		const config = configRepository("unusable-config", storeDirectory);
		const work = tempDirectory("unusable-work");
		const broken = '{ "schemaVersion": 1, this is not a document';
		seedStore(storeDirectory, broken);

		const results = await Promise.all(
			[0, 1].map(index =>
				runChild(childPlan({ ...config, run, label: String(index), record: session(`session-${String(index)}`, null, 1) }), {
					cwd: work,
				}),
			),
		);

		expect(results.map(result => result.load)).toEqual(["unusable", "unusable"]);
		expect(results.map(result => result.commits)).toEqual([[{ kind: "paused" }], [{ kind: "paused" }]]);
		expect(results.every(result => result.pauseReason !== undefined)).toBe(true);
		// Each process reported the unusable baseline through the framework's feedback channel, naming
		// the file it could not read, and the file is byte-for-byte what it was.
		expect(results.map(result => result.notices.length)).toEqual([1, 1]);
		expect(results[0]?.notices[0]?.level).toBe("error");
		expect(results[0]?.notices[0]?.message).toContain(path.join(storeDirectory, CONSUMPTION_FILE));
		expect(readFileSync(path.join(storeDirectory, CONSUMPTION_FILE), "utf8")).toBe(broken);
		expect(readdirSync(storeDirectory)).toEqual([CONSUMPTION_FILE]);
	});

	test("a legacy document is refused the same way, with the reason it cannot be read", async () => {
		const run = tempDirectory("legacy");
		const storeDirectory = path.join(run, "store");
		const config = configRepository("legacy-config", storeDirectory);
		const work = tempDirectory("legacy-work");
		const legacy = JSON.stringify({ totalCost: 12.5, holiday: false });
		seedStore(storeDirectory, legacy);

		const result = await runChild(
			childPlan({ ...config, run, label: "legacy", record: session("session-legacy", null, 1) }),
			{ cwd: work },
		);

		expect(result.load).toBe("unusable");
		expect(result.loadReason).toContain("totalCost");
		expect(result.pauseReason).toBeDefined();
		expect(result.commits).toEqual([{ kind: "paused" }]);
		expect(readFileSync(path.join(storeDirectory, CONSUMPTION_FILE), "utf8")).toBe(legacy);
	});
});
