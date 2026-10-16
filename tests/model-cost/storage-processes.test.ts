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
import {
	closeSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	openSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { ConsumptionDocument, SessionRecord } from "../../extensions/model-cost/shared-logic/consumption-document";
import type { ChildPlan, ChildResult } from "./support/store-child";
import { FS_INSTRUMENT, runStoreChild } from "./support/store-child-runner";

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
		`# the storage root of one case of the storage suite\nstorageDir: ${JSON.stringify(declaredStorageDir)}\nbalanceTtlMs: 30000\ncodexQuotaTtlMs: 15000\n`,
		"utf8",
	);
	return { repositoryRoot, configDirectory };
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
	/** The harness the child's own runtime belongs to, when the case is about another one. */
	readonly harness?: string;
	/** How many read-only synchronizations the child runs after its commits. */
	readonly syncs?: number;
	/** Whether the case starts the child with the file-system instrument and demands its counts. */
	readonly instrumented?: boolean;
}): ChildPlan {
	return {
		configRoot: input.repositoryRoot,
		configDirectory: input.configDirectory,
		...(input.requireUserHome === undefined
			? { userHomeDirectory: path.join(input.run, "home") }
			: { requireUserHome: input.requireUserHome }),
		...(input.startAt === undefined ? {} : { startAt: input.startAt }),
		...(input.record === undefined ? {} : { commits: [{ harness: input.harness ?? "omp", record: input.record }] }),
		...(input.harness === undefined ? {} : { harness: input.harness }),
		...(input.syncs === undefined ? {} : { syncs: input.syncs }),
		...(input.instrumented === undefined ? {} : { instrumented: input.instrumented }),
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

		const first = await runStoreChild(
			childPlan({ ...config, run, label: "a", record: session("session-a", null, 1) }),
			{ cwd: workA },
		);
		// The second process reads the document the first one created, so its own save joins that
		// period rather than starting another one.
		const second = await runStoreChild(
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

		const result = await runStoreChild(
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

		const first = await runStoreChild(
			childPlan({ ...config, run, label: "one", record: session("session-one", null, 1) }),
			{ cwd: work },
		);
		expect(first.commits).toEqual([{ kind: "saved" }]);
		const before = readFileSync(path.join(firstRoot, CONSUMPTION_FILE), "utf8");

		// The operator edits the one config entry: the next process selects another root.
		writeFileSync(
			path.join(config.configDirectory, "config.yaml"),
			`storageDir: ${JSON.stringify(secondRoot)}\nbalanceTtlMs: 30000\ncodexQuotaTtlMs: 15000\n`,
			"utf8",
		);
		const second = await runStoreChild(
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

		const first = await runStoreChild(
			childPlan({ ...plain, run, label: "plain", record: session("session-plain", null, 1) }),
			{ cwd: work },
		);
		const second = await runStoreChild(
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

	test("processes that both start on an empty root share the first period and lose no record", async () => {
		const run = tempDirectory("empty-concurrent");
		const storeDirectory = path.join(run, "store");
		const config = configRepository("empty-concurrent-config", storeDirectory);
		const work = tempDirectory("empty-concurrent-work");

		// Neither process has a document to read: both load a fresh period and only then save, so this
		// is exactly two instances that started on the same empty root.
		const startAt = Date.now() + 400;
		const results = await Promise.all([
			runStoreChild(childPlan({ ...config, run, label: "a", record: session("session-a", null, 1), startAt }), {
				cwd: work,
			}),
			runStoreChild(
				childPlan({ ...config, run, label: "b", record: session("session-b", "session-a", 1), startAt }),
				{ cwd: work },
			),
		]);

		expect(results.map(result => result.kind)).toEqual(["ran", "ran"]);
		expect(results.map(result => result.load)).toEqual(["fresh", "fresh"]);
		// The first write names the one period both instances were already in: neither save is refused
		// as belonging to a period a reset replaced, and both records are in the document that period
		// now holds.
		expect(results.map(result => result.commits)).toEqual([[{ kind: "saved" }], [{ kind: "saved" }]]);
		expect(results[0]?.period?.periodId).toBe(results[1]?.period?.periodId);
		const stored = storedDocument(storeDirectory);
		expect(results[0]?.period?.periodId).toBe(stored.periodId);
		expect(stored.harnesses.omp?.sessions.map(record => record.id).sort()).toEqual(["session-a", "session-b"]);
		expect(readdirSync(storeDirectory)).toEqual([CONSUMPTION_FILE]);
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
				runStoreChild(childPlan({ ...config, run, label: String(index), record, startAt }), { cwd: work }),
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
				runStoreChild(childPlan({ ...config, run, label: String(index), record, startAt }), { cwd: work }),
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

		const result = await runStoreChild(
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
				runStoreChild(childPlan({ ...config, run, label: String(index), record: session(`session-${String(index)}`, null, 1) }), {
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

		const result = await runStoreChild(
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

describe("a session's runtime merges through the same coordinated commit (P35)", () => {
	test("two processes' independent sessions keep their own runtimes, and a later version carries its own alone", async () => {
		const run = tempDirectory("runtime");
		const storeDirectory = path.join(run, "store");
		const config = configRepository("runtime-config", storeDirectory);
		const workA = tempDirectory("runtime-work-a");
		const workB = tempDirectory("runtime-work-b");
		const workC = tempDirectory("runtime-work-c");
		const firstRecord = { ...session("session-child-one", null, 1), runtimeMs: 360_000 };
		const secondRecord = { ...session("session-child-two", null, 1), runtimeMs: 120_000 };

		// Two independent processes, each committing its own session's snapshot with the runtime that
		// session's own executions accumulated. Neither may overwrite the other's record.
		const [first, second] = await Promise.all([
			runStoreChild(childPlan({ ...config, run, label: "first", record: firstRecord }), { cwd: workA }),
			runStoreChild(childPlan({ ...config, run, label: "second", record: secondRecord }), { cwd: workB }),
		]);

		expect([first.kind, second.kind]).toEqual(["ran", "ran"]);
		expect([...first.commits, ...second.commits]).toEqual([{ kind: "saved" }, { kind: "saved" }]);
		// Both records are there, each with its own runtime. Which of the two processes committed first is
		// the coordination's business rather than the contract's, so the comparison is by identity.
		const byId = (): readonly unknown[] =>
			[...(storedDocument(storeDirectory).harnesses.omp?.sessions ?? [])].sort((left, right) =>
				left.id.localeCompare(right.id),
			);
		expect(byId()).toEqual([firstRecord, secondRecord]);

		// A later process commits the next version of the first session with what its own executions have
		// accumulated by then: the first session's figure moves, and the second session's own record —
		// consumption, parent and runtime — is exactly the one the other process left.
		const third = await runStoreChild(
			childPlan({
				...config,
				run,
				label: "third",
				record: { ...session("session-child-one", null, 2), runtimeMs: 480_000 },
			}),
			{ cwd: workC },
		);
		expect(third.commits).toEqual([{ kind: "saved" }]);
		expect(byId()).toEqual([{ ...session("session-child-one", null, 2), runtimeMs: 480_000 }, secondRecord]);
	});

	test("an execution observed a second time contributes no second time, at the same version or a later one", async () => {
		const run = tempDirectory("runtime-twice");
		const storeDirectory = path.join(run, "store");
		const config = configRepository("runtime-twice-config", storeDirectory);
		const workA = tempDirectory("runtime-twice-a");
		const workB = tempDirectory("runtime-twice-b");
		const workC = tempDirectory("runtime-twice-c");
		// One execution's own duration, as the record of the version that produced it states it.
		const observed = { ...session("session-child", null, 1), runtimeMs: 360_000 };

		const first = await runStoreChild(childPlan({ ...config, run, label: "first", record: observed }), { cwd: workA });
		expect(first.commits).toEqual([{ kind: "saved" }]);

		// Another process states that same execution again — the same figure at the same version — and the
		// coordinated commit answers it as the content the file already carries rather than as a new
		// contribution.
		const second = await runStoreChild(childPlan({ ...config, run, label: "second", record: observed }), { cwd: workB });
		expect(second.commits).toEqual([{ kind: "unchanged" }]);
		expect(storedDocument(storeDirectory).harnesses.omp?.sessions).toEqual([observed]);

		// A later process commits its own next version of that session with the same one execution behind
		// it: the file's figure is what that execution ran — 360000, never the 720000 a second contribution
		// would make of two writes — because a repeated observation states a figure rather than adding one.
		const third = await runStoreChild(
			childPlan({ ...config, run, label: "third", record: { ...session("session-child", null, 2), runtimeMs: 360_000 } }),
			{ cwd: workC },
		);
		expect(third.commits).toEqual([{ kind: "saved" }]);
		expect(storedDocument(storeDirectory).harnesses.omp?.sessions).toEqual([
			{ ...session("session-child", null, 2), runtimeMs: 360_000 },
		]);
	});
});

/** Waits until the file a case's child creates when its baseline is loaded exists. */
async function waitForFile(file: string): Promise<void> {
	const deadline = Date.now() + 20_000;
	while (!existsSync(file)) {
		if (Date.now() > deadline) throw new Error(`the file ${file} never appeared`);
		await Bun.sleep(5);
	}
}

/** One record of one root's document, or `undefined` when the document holds none for that id. */
function recordOf(storeDirectory: string, harness: string, id: string): SessionRecord | undefined {
	return storedDocument(storeDirectory).harnesses[harness]?.sessions.find(record => record.id === id);
}

/**
 * The period's own reading, one harness's own reading, and what a synchronization really did
 * (P32, P33, P38, P39; S3 — and P57's read-only-refresh item).
 *
 * These cases are the multi-process half of the shared-storage contract: two harnesses' processes
 * writing one file, a batch whose records are adjudicated one at a time, a publication this platform
 * refuses, and the read-only synchronization a process reaches when it has an event of its own. What
 * the synchronization cost is counted rather than inferred — the instrument is a preload, and the
 * child refuses to report counts from a process it was not preloaded into — and the document's own
 * bytes before and after the operation are compared, so "it wrote nothing" is evidence of no write
 * call and not of an unchanged-looking value.
 */
describe("the shared document across processes, and the read-only synchronization (P32, P33, P38, P39)", () => {
	test("a synchronization adopts what another process committed while reading nothing but the document", async () => {
		const run = tempDirectory("sync");
		const storeDirectory = path.join(run, "store");
		const config = configRepository("sync-config", storeDirectory);
		const work = tempDirectory("sync-work");

		// One process commits its own session: the document exists, and it holds a record this reader
		// never saw.
		const writer = await runStoreChild(
			childPlan({ ...config, run, label: "writer", record: session("session-written", null, 1, 0.02) }),
			{ cwd: work },
		);
		expect(writer.commits).toEqual([{ kind: "saved" }]);

		// The reader starts over that document and stops after its own initialization: this case arrays
		// the interleaving, so what it has to adopt is written after its baseline was really loaded.
		const ready = path.join(run, "ready");
		const go = path.join(run, "go");
		const reading = runStoreChild(
			{
				...childPlan({ ...config, run, label: "reader", harness: "omp", syncs: 1, instrumented: true }),
				readyPath: ready,
				goPath: go,
			},
			{ cwd: work, preload: FS_INSTRUMENT },
		);
		await waitForFile(ready);

		// Another process's commit onto the same period: the record the writer already committed, and one
		// of its own that this reader has never seen.
		const current = storedDocument(storeDirectory);
		const published = JSON.stringify({
			...current,
			harnesses: {
				...current.harnesses,
				omp: { sessions: [...(current.harnesses.omp?.sessions ?? []), session("session-late", "session-written", 5, 0.5)] },
			},
		});
		writeFileSync(path.join(storeDirectory, CONSUMPTION_FILE), published, "utf8");
		writeFileSync(go, "go", "utf8");
		const reader = await reading;

		expect(reader.kind).toBe("ran");
		expect(reader.load).toBe("loaded");
		// What the file held was adopted, and nothing else happened: no fault was stated, no period moved
		// and the instance's own reading is the document's own records.
		expect(reader.syncs).toEqual([{ kind: "adopted", periodChanged: false, changed: true }]);
		expect(reader.notices).toEqual([]);
		expect(reader.heldSessions).toEqual(["session-written", "session-late"]);

		// The cost of that adoption: exactly the two reads of the document — the baseline the instance
		// initialized with and the synchronization's own — and neither a replacement of the file nor any
		// operation of the lock name the framework's coordination takes beside it.
		expect(reader.fsOperations).toEqual({ reads: 2, publishes: 0, locks: 0 });
		// And the file itself is byte for byte what the other process published.
		expect(readFileSync(path.join(storeDirectory, CONSUMPTION_FILE), "utf8")).toBe(published);
	});

	test("a batch of processes publishes the valid records, refuses the others, and retries nothing", async () => {
		const run = tempDirectory("batch");
		const storeDirectory = path.join(run, "store");
		const config = configRepository("batch-config", storeDirectory);
		const work = tempDirectory("batch-work");
		const current = session("session-main", null, 3, 0.03);
		seedStore(storeDirectory, JSON.stringify(document([current])));

		// Four processes at once over that document: two sessions it has never held, one snapshot of the
		// version it holds with other content, and one older snapshot of it.
		const plans = [
			{ label: "new-one", record: session("session-new-one", "session-main", 1, 0.04) },
			{ label: "conflict", record: session("session-main", null, 3, 0.99) },
			{ label: "new-two", record: session("session-new-two", "session-main", 1, 0.05) },
			{ label: "stale", record: session("session-main", null, 2, 0.98) },
		];
		const startAt = Date.now() + 600;
		const results = await Promise.all(
			plans.map((plan, index) =>
				runStoreChild(
					childPlan({ ...config, run, label: plan.label, record: plan.record, startAt, instrumented: true }),
					{ cwd: work, preload: FS_INSTRUMENT },
				),
			),
		);

		// Each record is decided on its own by the process that submitted it, whichever order the four
		// processes reached the file in.
		const outcomes = results.map(result => result.commits[0]?.kind);
		expect(outcomes.filter(kind => kind === "saved")).toHaveLength(2);
		expect(outcomes.filter(kind => kind === "conflict")).toHaveLength(1);
		expect(outcomes.filter(kind => kind === "stale-version")).toHaveLength(1);
		// A refused record is refused once: the process that met a conflict or an older version read the
		// document and replaced nothing at all, while each accepted one replaced it exactly once.
		for (const [index, result] of results.entries()) {
			const accepted = outcomes[index] === "saved";
			expect(result.fsOperations?.publishes).toBe(accepted ? 1 : 0);
			expect(result.fsOperations?.locks).toBeGreaterThan(0);
			expect(result.fsOperations?.reads).toBe(2);
		}

		// What the file holds is exactly the three records that were accepted: the refused snapshot's
		// version, name and amount are nowhere in it, and nothing else was added on their behalf.
		const stored = storedDocument(storeDirectory).harnesses.omp?.sessions ?? [];
		expect(stored.map(record => record.id).sort()).toEqual(["session-main", "session-new-one", "session-new-two"]);
		expect(recordOf(storeDirectory, "omp", "session-main")).toEqual(current);
		expect(stored.find(record => record.id === "session-new-one")?.parent).toBe("session-main");
		expect(readdirSync(storeDirectory)).toEqual([CONSUMPTION_FILE]);
	});

	test.skipIf(process.platform !== "win32")(
		"a publication this platform refuses is reported as that failure and leaves the file as it was",
		async () => {
			const run = tempDirectory("publish-failure");
			const storeDirectory = path.join(run, "store");
			const config = configRepository("publish-failure-config", storeDirectory);
			const work = tempDirectory("publish-failure-work");
			const current = session("session-main", null, 3, 0.03);
			seedStore(storeDirectory, JSON.stringify(document([current])));
			const before = readFileSync(path.join(storeDirectory, CONSUMPTION_FILE), "utf8");

			// This platform refuses to replace a name another handle holds open, which is the one step of a
			// publication a reader can refuse: the update reads the document, decides, and cannot replace it.
			const handle = openSync(path.join(storeDirectory, CONSUMPTION_FILE), "r");
			try {
				const blocked = await runStoreChild(
					childPlan({
						...config,
						run,
						label: "blocked",
						record: session("session-blocked", null, 1, 0.06),
						instrumented: true,
					}),
					{ cwd: work, preload: FS_INSTRUMENT },
				);
				// The failure is the answer, and it is not a save: the process says the update did not land,
				// and the document is the bytes it was.
				expect(blocked.commits).toEqual([{ kind: "failed", failure: "io" }]);
				expect(blocked.fsOperations?.publishes).toBe(0);
				expect(readFileSync(path.join(storeDirectory, CONSUMPTION_FILE), "utf8")).toBe(before);
			} finally {
				closeSync(handle);
			}

			// Nothing of the failure is left behind — no lock, no staging directory, no half-written
			// document — so the next process publishes the same record normally, over the file it read.
			const recovered = await runStoreChild(
				childPlan({ ...config, run, label: "recovered", record: session("session-blocked", null, 1, 0.06), instrumented: true }),
				{ cwd: work, preload: FS_INSTRUMENT },
			);
			expect(recovered.commits).toEqual([{ kind: "saved" }]);
			expect(recovered.fsOperations?.publishes).toBe(1);
			expect(recordOf(storeDirectory, "omp", "session-blocked")).toEqual(session("session-blocked", null, 1, 0.06));
			expect(recordOf(storeDirectory, "omp", "session-main")).toEqual(current);
			expect(readdirSync(storeDirectory)).toEqual([CONSUMPTION_FILE]);
		},
	);

	test("two harnesses' processes share the document without merging identity, parent or write permission", async () => {
		const run = tempDirectory("harnesses");
		const storeDirectory = path.join(run, "store");
		const config = configRepository("harnesses-config", storeDirectory);
		const work = tempDirectory("harnesses-work");

		// The same session id in each harness's own namespace: another direct parent, a far greater
		// version and other consumption. The pi process also commits a second session of its own.
		const ompRecord = session("session-shared", null, 1, 0.01);
		const piRecord = { ...session("session-shared", "pi-parent", 9, 0.5), name: "pi 的会话" };
		const piOther = session("pi-only", null, 1, 0.02);
		const [omp, pi] = await Promise.all([
			runStoreChild(childPlan({ ...config, run, label: "omp", record: ompRecord, harness: "omp" }), { cwd: work }),
			runStoreChild(
				{
					...childPlan({ ...config, run, label: "pi", harness: "pi" }),
					commits: [
						{ harness: "pi", record: piRecord },
						{ harness: "pi", record: piOther },
					],
				},
				{ cwd: work },
			),
		]);
		expect([...omp.commits, ...pi.commits]).toEqual([{ kind: "saved" }, { kind: "saved" }, { kind: "saved" }]);

		// One document, two partitions: each holds its own record of the shared id, with its own direct
		// parent and its own consumption, and neither was rewritten by the other's commit.
		expect(storedDocument(storeDirectory).harnesses.omp?.sessions).toEqual([ompRecord]);
		expect(storedDocument(storeDirectory).harnesses.pi?.sessions).toEqual([piRecord, piOther]);

		// A later omp process sees the whole period and only its own partition: the period's own reading
		// holds every harness's records, while this harness's own reading holds its one record.
		const next = await runStoreChild(
			childPlan({
				...config,
				run,
				label: "next",
				record: { ...ompRecord, saveVersion: 2, own: ompRecord.own },
				harness: "omp",
			}),
			{ cwd: work },
		);
		expect(next.commits).toEqual([{ kind: "saved" }]);
		expect([...(next.heldSessions ?? [])].sort()).toEqual(["session-shared"]);
		expect([...(next.periodSessions ?? [])].sort()).toEqual(["pi-only", "session-shared", "session-shared"]);

		// The version it committed is its own partition's successor, however far ahead the other
		// partition's record of the same id is, and the other partition is exactly what its own process
		// left: same version, same parent, same consumption.
		expect(recordOf(storeDirectory, "omp", "session-shared")?.saveVersion).toBe(2);
		expect(recordOf(storeDirectory, "pi", "session-shared")).toEqual(piRecord);
	});
});
