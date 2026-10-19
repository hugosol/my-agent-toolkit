/**
 * One independent process driving the production model-cost runtime over a real storage root.
 *
 * This is the child half of the storage suite: the parent starts several of these at once, each in
 * its own process and its own working directory, and each one runs exactly what a session's own
 * process runs — the framework's configuration read, which validates the extension's file and
 * records its values once for this process the way a real binding does; the runtime built from
 * those values and the facts an assembly supplies; the one-time initialization that loads the
 * baseline; and the store's own commit, which reaches the framework's safe-file entry and its
 * cross-process lock. Nothing here doubles that path and nothing bypasses it: the plan says which
 * configuration to read and which snapshots to commit, and the results file says what the
 * production code answered.
 *
 * The child is also where the storage field's `~/` is really resolved against an operating system
 * user home: a plan that names no home leaves the runtime with this process's own (`homedir()`), and
 * `requireUserHome` makes the child refuse to run at all when that is not the home the plan demands
 * — so a case that isolates the home can never write under a home it did not mean to write under.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, sep } from "node:path";
import * as fsp from "node:fs/promises";
import { homedir } from "node:os";
import { MODEL_COST } from "../../../extensions/model-cost/definition";
import type { ConsumptionPeriod, SessionCommit, StoreNotice } from "../../../extensions/model-cost/shared-logic/foundation/storage/consumption-store";
import type { BaselineSyncOutcome } from "../../../extensions/model-cost/shared-logic/runtime";
import type { SessionRecord } from "../../../extensions/model-cost/shared-logic/foundation/session/consumption-document";
import { createModelCostRuntime } from "../../../extensions/model-cost/shared-logic/runtime";
import { findConfigFailure } from "../../../framework/core/config";
import { getConfig } from "../../../framework/interface/general/config";
import { namespaceInstrumented, recordedFsOperations } from "../../../scripts/support/efficiency-baseline-fs-instrument";
import { testSessionCapability } from "./session-capability";

/**
 * What one file-system instrument recorded for one document, as this process read the document it
 * owns.
 *
 * `reads` counts the calls that read that document, `publishes` the renames that really replaced it
 * and `locks` every operation under the lock name the framework's coordination takes beside it. They
 * are call counts rather than values, which is what makes "this operation wrote nothing" checkable
 * rather than inferred from what a file happens to hold afterwards.
 */
export interface ChildFileOperations {
	readonly reads: number;
	readonly publishes: number;
	readonly locks: number;
}

/** One snapshot the plan asks this process to commit. */
export interface ChildCommit {
	readonly harness: string;
	readonly record: SessionRecord;
}

/** What one child process is asked to do, read from the plan file it is started with. */
export interface ChildPlan {
	/** A repository root whose `extensions/model-cost/config.yaml` this process reads and validates. */
	readonly configRoot?: string;
	/** The declared `storageDir` used instead, when the plan reads no config file. */
	readonly storageDir?: string;
	/** The directory the extension's own config file lives in. */
	readonly configDirectory: string;
	/** The user home to resolve `~/` against; this process's own when the plan names none. */
	readonly userHomeDirectory?: string;
	/** A home this process must really have before it runs; it reports a mismatch instead when it does not. */
	readonly requireUserHome?: string;
	/** An epoch millisecond the commits wait for, so several processes really overlap. */
	readonly startAt?: number;
	readonly commits?: readonly ChildCommit[];
	/**
	 * The harness this process's own runtime belongs to: the identity every snapshot it builds is
	 * filed under. The first commit's harness when the plan names none, which is what a plan that only
	 * commits keeps.
	 */
	readonly harness?: string;
	/** How many read-only synchronizations of the baseline this process runs, after its commits. */
	readonly syncs?: number;
	/**
	 * A file this process creates right after its initialization, which is what a parent arrays an
	 * interleaving behind: the parent sees it and knows this process's baseline is already loaded.
	 */
	readonly readyPath?: string;
	/**
	 * A file this process waits for before it commits or synchronizes, which is the other half of that
	 * rendezvous: a parent writes it once the state it wants this process to meet is on disk.
	 */
	readonly goPath?: string;
	/**
	 * Whether the plan demands the file-system instrument, which the parent starts this process with.
	 * A demanded run that finds no instrument answers `not-instrumented` instead of reporting the zero
	 * call counts an uninstrumented process would.
	 */
	readonly instrumented?: boolean;
	/** Where this process writes its results. */
	readonly resultPath: string;
}

/** What this process observed, as the parent reads it back. */
export interface ChildResult {
	readonly kind: "ran" | "config-failure" | "home-mismatch" | "not-instrumented";
	readonly detail?: string;
	readonly userHomeDirectory: string;
	readonly consumptionFile?: string;
	readonly load?: "loaded" | "fresh" | "unusable";
	readonly loadReason?: string;
	readonly pauseReason?: string;
	readonly period?: ConsumptionPeriod;
	readonly notices: readonly StoreNotice[];
	readonly commits: readonly SessionCommit[];
	/** What each read-only synchronization this process ran answered, in the order they ran. */
	readonly syncs?: readonly BaselineSyncOutcome[];
	/** The ids of this runtime's own harness's records, as the instance held them at the end. */
	readonly heldSessions?: readonly string[];
	/** The ids of every harness's records the period held at the end, in the document's own order. */
	readonly periodSessions?: readonly string[];
	/** What the instrument recorded for this process's document, when the plan demanded it. */
	readonly fsOperations?: ChildFileOperations;
}

/** How long one process waits for the file a parent arrays its own steps behind. */
const GO_WAIT_MS = 20_000;

/** Waits until the file a parent arrays this process's steps behind exists, or reports that it never did. */
async function waitForFile(file: string): Promise<void> {
	const deadline = Date.now() + GO_WAIT_MS;
	while (!existsSync(file)) {
		if (Date.now() > deadline) throw new Error(`store-child: the file ${file} this process was told to wait for never appeared`);
		await Bun.sleep(5);
	}
}

/** The harness identity this process's own runtime belongs to, as the plan states it. */
function runtimeHarness(plan: ChildPlan): string {
	return plan.harness ?? plan.commits?.[0]?.harness ?? "omp";
}

/**
 * What the file-system instrument recorded for one document in this process, or `undefined` when this
 * process carries no instrument at all.
 *
 * Only calls aimed at that document count: the reads of it, the renames that really replaced it (a
 * rename this platform refused is a recorded attempt rather than a publication) and every operation
 * of the lock name the framework's coordination takes beside it — the name itself, the staging
 * directory one acquisition prepares under the same prefix, and the entries inside it. The comparison
 * is the one the coordination itself makes on this platform: Windows resolves one name whatever its
 * case, so a path is compared folded there.
 */
function fileOperationsOf(consumptionFile: string): ChildFileOperations | undefined {
	const operations = recordedFsOperations();
	if (operations === undefined) return undefined;
	const fold = (candidate: string): string => (process.platform === "win32" ? candidate.toLowerCase() : candidate);
	const document = fold(consumptionFile);
	const directory = `${dirname(document)}${sep}`;
	const fileName = document.slice(directory.length);
	const same = (candidate: string): boolean => fold(candidate) === document;
	const lockPath = (candidate: string): boolean => {
		const normalized = fold(candidate);
		if (!normalized.startsWith(directory)) return false;
		const first = normalized.slice(directory.length).split(sep)[0] ?? "";
		return first.startsWith(`${fileName}.`) && first.endsWith(".lock");
	};
	let reads = 0;
	let publishes = 0;
	let locks = 0;
	for (const operation of operations) {
		const target = operation.target ?? operation.path;
		if (lockPath(operation.path) || lockPath(target)) {
			locks += 1;
			continue;
		}
		if (same(operation.path) && operation.op === "readFile") {
			reads += 1;
			continue;
		}
		if (same(target) && operation.op === "rename" && operation.outcome === "ok") publishes += 1;
	}
	return { reads, publishes, locks };
}

/** The plan this process was started with, as the parent serialized it. */
function readPlan(): ChildPlan {
	const planFile = process.argv[2];
	if (planFile === undefined) throw new Error("store-child: no plan file was given");
	const parsed: unknown = JSON.parse(readFileSync(planFile, "utf8"));
	if (typeof parsed !== "object" || parsed === null) throw new Error("store-child: the plan is not an object");
	// The plan is this suite's own file, written by the parent process next to this fixture.
	return parsed as ChildPlan;
}

/**
 * The configuration a real binding would hand this extension's factory: the framework reads and
 * validates the declared file (once per process, which is also what makes a changed value wait for
 * the next process), and this extension's shared logic then reads those validated values.
 */
function validatedConfig(plan: ChildPlan): Record<string, unknown> {
	if (plan.configRoot === undefined) return { storageDir: plan.storageDir as string };
	const failure = findConfigFailure(MODEL_COST, { baseDir: plan.configRoot });
	if (failure !== undefined) throw new Error(`the extension's config was refused: ${failure}`);
	return { ...getConfig(MODEL_COST) };
}

const plan = readPlan();
const userHomeDirectory = plan.userHomeDirectory ?? homedir();
const notices: StoreNotice[] = [];

function answer(result: ChildResult): void {
	writeFileSync(plan.resultPath, JSON.stringify(result, null, "\t"), "utf8");
}

if (plan.requireUserHome !== undefined && userHomeDirectory !== plan.requireUserHome) {
	// The isolation guard: a case that demands a particular user home never runs — and so never
	// resolves, creates or writes a storage root — under any other one.
	answer({
		kind: "home-mismatch",
		detail: `this process's user home is ${userHomeDirectory}`,
		userHomeDirectory,
		notices,
		commits: [],
	});
} else if (plan.instrumented === true && !namespaceInstrumented(fsp)) {
	// The self-check a demanded run makes before it trusts a count: this process's own module namespace
	// carries no instrument, so the calls below would go unrecorded and a zero would prove nothing.
	answer({
		kind: "not-instrumented",
		detail: "the plan demanded the file-system instrument and this process carries none",
		userHomeDirectory,
		notices,
		commits: [],
	});
} else {
	try {
		const runtime = createModelCostRuntime({
			config: validatedConfig(plan),
			configDirectory: plan.configDirectory,
			userHomeDirectory,
			// This child drives the store directly rather than through Turn facts; the harness identity
			// is the one its snapshots are committed under. It observes no session, so its Session
			// capability is the empty in-memory one.
			harness: plan.harness ?? plan.commits?.[0]?.harness ?? "omp",
			session: testSessionCapability(),
		});
		const load = await runtime.initialize({
			owner: { kind: "owner", key: "store-child" },
			hasUI: false,
			feedback: { notify: (level, message) => notices.push({ level, message }) },
			// This child drives the store directly, so the entry it stands in for is one whose harness
			// integrates subagent observations; nothing in this suite reads the mode.
			subagents: { mode: "subagents" },
		});
		// The rendezvous a parent arrays an interleaving with: the baseline is loaded by now, and this
		// process goes no further until the state it is meant to meet is really on disk.
		if (plan.readyPath !== undefined) writeFileSync(plan.readyPath, "ready", "utf8");
		if (plan.startAt !== undefined) await Bun.sleep(Math.max(0, plan.startAt - Date.now()));
		if (plan.goPath !== undefined) await waitForFile(plan.goPath);
		const commits: SessionCommit[] = [];
		for (const step of plan.commits ?? []) {
			commits.push(await runtime.storage.commit(step.harness, step.record));
		}
		// The read-only synchronizations, run after the commits: each one is the production entry a
		// caller with an event of its own reaches, and its own outcome is what this process reports.
		const syncs: BaselineSyncOutcome[] = [];
		for (let taken = 0; taken < (plan.syncs ?? 0); taken += 1) {
			syncs.push(
				await runtime.synchronize({
					feedback: { notify: (level, message) => notices.push({ level, message }) },
				}),
			);
		}
		const period = runtime.storage.period();
		const pauseReason = runtime.storage.pauseReason();
		answer({
			kind: "ran",
			userHomeDirectory,
			consumptionFile: runtime.storage.consumptionFile,
			load: load.kind,
			...(load.kind === "unusable" ? { loadReason: load.reason } : {}),
			...(pauseReason === undefined ? {} : { pauseReason }),
			...(period === undefined ? {} : { period }),
			notices,
			commits,
			...(plan.syncs === undefined ? {} : { syncs }),
			heldSessions: runtime.storage.sessions(runtimeHarness(plan)).map(record => record.id),
			periodSessions: runtime.storage.periodSessions().map(record => record.id),
			...(plan.instrumented === true ? { fsOperations: fileOperationsOf(runtime.storage.consumptionFile) } : {}),
		});
	} catch (error) {
		answer({
			kind: "config-failure",
			detail: error instanceof Error ? error.message : String(error),
			userHomeDirectory,
			notices,
			commits: [],
		});
	}
}
