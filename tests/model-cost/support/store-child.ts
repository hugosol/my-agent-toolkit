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
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { MODEL_COST } from "../../../extensions/model-cost/definition";
import type { ConsumptionPeriod, SessionCommit, StoreNotice } from "../../../extensions/model-cost/shared-logic/consumption-store";
import type { SessionRecord } from "../../../extensions/model-cost/shared-logic/consumption-document";
import { createModelCostRuntime } from "../../../extensions/model-cost/shared-logic/runtime";
import { findConfigFailure, getConfig } from "../../../framework/core/config";

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
	/** Where this process writes its results. */
	readonly resultPath: string;
}

/** What this process observed, as the parent reads it back. */
export interface ChildResult {
	readonly kind: "ran" | "config-failure" | "home-mismatch";
	readonly detail?: string;
	readonly userHomeDirectory: string;
	readonly consumptionFile?: string;
	readonly load?: "loaded" | "fresh" | "unusable";
	readonly loadReason?: string;
	readonly pauseReason?: string;
	readonly period?: ConsumptionPeriod;
	readonly notices: readonly StoreNotice[];
	readonly commits: readonly SessionCommit[];
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
} else {
	try {
		const runtime = createModelCostRuntime({
			config: validatedConfig(plan),
			configDirectory: plan.configDirectory,
			userHomeDirectory,
			// This child drives the store directly rather than through Turn facts; the harness identity
			// is the one its snapshots are committed under.
			harness: plan.commits?.[0]?.harness ?? "omp",
		});
		const load = await runtime.initialize({
			owner: { kind: "owner", key: "store-child" },
			hasUI: false,
			feedback: { notify: (level, message) => notices.push({ level, message }) },
			markers: { publishMarkers: () => undefined },
		});
		if (plan.startAt !== undefined) await Bun.sleep(Math.max(0, plan.startAt - Date.now()));
		const commits: SessionCommit[] = [];
		for (const step of plan.commits ?? []) {
			commits.push(await runtime.storage.commit(step.harness, step.record));
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
