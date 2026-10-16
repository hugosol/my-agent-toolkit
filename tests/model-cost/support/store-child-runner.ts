/**
 * Starting one independent model-cost process over a plan, and reading its own answers back.
 *
 * This is the parent half of the storage suite's child fixture: it writes the plan beside the results
 * the child is asked for, starts `store-child.ts` in the working directory the case demands with the
 * child's own environment, and answers the child's parsed results — or its stderr, when it exited
 * without writing any. `preload` is what a case that demands the file-system instrument passes: the
 * instrument is a preload in the parent's own baseline too, so a counted run is started exactly the
 * way a counted session is.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import type { ChildPlan, ChildResult } from "./store-child";

/** The child fixture this module starts. */
export const CHILD = path.join(import.meta.dir, "store-child.ts");

/** The file-system instrument a counted run is preloaded with, as an absolute path. */
export const FS_INSTRUMENT = path.join(import.meta.dir, "..", "..", "..", "scripts", "support", "efficiency-baseline-fs-instrument.ts");

/**
 * Start one child process and read its results back.
 *
 * The child runs in the working directory the case demands, with this process's own environment plus
 * any override a case needs (an isolated user home, for instance), and its plan is written beside its
 * results.
 */
export async function runStoreChild(
	plan: ChildPlan,
	options: {
		readonly cwd: string;
		readonly env?: Record<string, string | undefined>;
		/** The preload a counted run needs; omitted means the child runs with none. */
		readonly preload?: string;
	},
): Promise<ChildResult> {
	const planFile = plan.resultPath.replace(/\.json$/, ".plan.json");
	writeFileSync(planFile, JSON.stringify(plan), "utf8");
	const command = ["bun", ...(options.preload === undefined ? [] : ["--preload", options.preload]), CHILD, planFile];
	const child = Bun.spawn(command, {
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
