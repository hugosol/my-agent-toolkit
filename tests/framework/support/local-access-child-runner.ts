/**
 * Starting one independent process that serves an owner's declared values, and reading its own
 * answers back.
 *
 * This is the parent half of the local-access suite's child fixture: it writes the plan beside the
 * results the child is asked for, starts `local-access-child.ts` in the working directory a case
 * demands, sends the child's commands on stdin, and answers the child's parsed results or the
 * stderr it exited with.
 */
import { writeFileSync } from "node:fs";
import { ipcChild } from "./ipc-child";
import * as path from "node:path";
import type { LocalAccessChildPlan, LocalAccessChildReport, LocalAccessChildResult } from "./local-access-child";

export type { LocalAccessChildPlan, LocalAccessChildReport, LocalAccessChildResult };

/** The child fixture this module starts. */
export const LOCAL_ACCESS_CHILD = path.join(import.meta.dir, "local-access-child.ts");

/** One started child: the commands it takes, and the answers it gives when it is finished. */
export interface RunningLocalAccessChild {
	/** Sends one command to the child, as one line of its stdin. */
	send(command: Record<string, unknown>): void;
	/** Waits until the child states it is ready. */
	ready(): Promise<void>;
	/** Asks the child what it has read and answers the report it prints. */
	report(): Promise<LocalAccessChildReport>;
	/** Asks the child to finish and answers what it reported, plus the stderr it wrote. */
	finish(): Promise<{ readonly results: LocalAccessChildResult; readonly stderr: string }>;
}

/**
 * Start one child process over a plan.
 *
 * The child runs in the working directory the case demands — which is what makes a case about
 * "this process resolved the directory from the file, not from where it was started" a real one —
 * with this process's own environment.
 */
export function startLocalAccessChild(
	plan: LocalAccessChildPlan,
	options: { readonly cwd: string },
): RunningLocalAccessChild {
	const planFile = plan.resultPath.replace(/\.json$/, ".plan.json");
	writeFileSync(planFile, JSON.stringify(plan), "utf8");
	const channel = ipcChild<LocalAccessChildReport>(LOCAL_ACCESS_CHILD, planFile, options.cwd);
	return {
		send: command => channel.send(command),
		report: () => channel.ask({ t: "report" }),
		ready: () => channel.ready(),
		
		async finish() {
			const answer = await channel.finish(plan.resultPath);
			return { results: answer.value as LocalAccessChildResult, stderr: answer.stderr };
		},
	};
}
