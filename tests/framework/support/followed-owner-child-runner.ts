/**
 * Starting one independent process that follows an Owner another process serves, and reading its
 * own answers back.
 *
 * This is the parent half of the two-process suite's following fixture: it writes the plan beside
 * the results the child is asked for, starts `followed-owner-child.ts` in the working directory a
 * case demands, sends the child's commands on stdin, and answers each report as the child's own
 * line rather than after a guessed delay.
 */
import { writeFileSync } from "node:fs";
import { ipcChild } from "./ipc-child";
import * as path from "node:path";
import type {
	FollowedOwnerChildPlan,
	FollowedOwnerChildReport,
	FollowedOwnerChildResult,
} from "./followed-owner-child";

export type { FollowedOwnerChildPlan, FollowedOwnerChildReport, FollowedOwnerChildResult };

/** The child fixture this module starts. */
export const FOLLOWED_OWNER_CHILD = path.join(import.meta.dir, "followed-owner-child.ts");

/** One started child: the asks it takes, and what it holds when it is finished. */
export interface RunningFollowedOwnerChild {
	/** Waits until the child states it is ready to read. */
	ready(): Promise<void>;
	/** Asks what the extension's public consumption reads now, and answers what the child read. */
	read(): Promise<FollowedOwnerChildReport>;
	/** Asks for one subagent delivery, and answers what it read and recorded. */
	deliver(): Promise<FollowedOwnerChildReport>;
	/** Releases the follows this child holds, as a session this process no longer runs would. */
	dispose(): void;
	/** Asks the child to finish and answers what it reported, plus the stderr it wrote. */
	finish(): Promise<{ readonly results: FollowedOwnerChildResult; readonly stderr: string }>;
}

/**
 * Start one child process over a plan.
 *
 * The child runs in the working directory the case demands, with this process's own environment: a
 * case about a process that reaches another one's access is a case about two real processes.
 */
export function startFollowedOwnerChild(
	plan: FollowedOwnerChildPlan,
	options: { readonly cwd: string },
): RunningFollowedOwnerChild {
	const planFile = plan.resultPath.replace(/\.json$/, ".plan.json");
	writeFileSync(planFile, JSON.stringify(plan), "utf8");
	const channel = ipcChild<FollowedOwnerChildReport>(FOLLOWED_OWNER_CHILD, planFile, options.cwd);
	return {
		
		ready: () => channel.ready(),
		read: () => channel.ask({ t: "read" }), deliver: () => channel.ask({ t: "deliver" }), dispose: () => channel.send({ t: "dispose" }),
		async finish() {
			const answer = await channel.finish(plan.resultPath);
			return { results: answer.value as FollowedOwnerChildResult, stderr: answer.stderr };
		},
	};
}
