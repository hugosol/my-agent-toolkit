/**
 * Starting one independent process that delivers a session's observation through the framework's
 * local access, and reading its own answers back.
 *
 * This is the parent half of the observation-access suite's child fixture: it writes the plan beside
 * the report the child is asked for, starts `observation-access-child.ts`, sends the child's commands
 * on stdin, and answers the report it printed or the stderr it exited with.
 */
import { writeFileSync } from "node:fs";
import { ipcChild } from "./ipc-child";
import * as path from "node:path";
import type { ObservationChildPlan, ObservationChildReport } from "./observation-access-child";

export type { ObservationChildPlan, ObservationChildReport };

/** The child fixture this module starts. */
export const OBSERVATION_CHILD = path.join(import.meta.dir, "observation-access-child.ts");

/** One started child: the commands it takes, and the report it answers with. */
export interface RunningObservationChild {
	/** Sends one command to the child, as one line of its stdin. */
	send(command: Record<string, unknown>): void;
	/** Waits until the child states it is up, which is after it tried to reach the seat. */
	ready(): Promise<void>;
	/**
	 * Asks the child what it has read and delivered so far, and answers the report line it prints.
	 *
	 * It is how a case waits for an event in the other process — a reading arriving, an access ending
	 * — without guessing a duration for it.
	 */
	report(): Promise<ObservationChildReport>;
	/** Asks the child to finish and answers what it reported, plus the stderr it wrote. */
	finish(): Promise<{ readonly report: ObservationChildReport; readonly stderr: string }>;
	/**
	 * Ends the child's process abruptly, as a host that is killed or crashes does: no command is sent,
	 * nothing it held is released first, and it states nothing about its own end.
	 */
	kill(): void;
}

/** Start one delivering child process over a plan. */
export function startObservationChild(
	plan: ObservationChildPlan,
	options: { readonly cwd: string },
): RunningObservationChild {
	const planFile = plan.resultPath.replace(/\.json$/, ".plan.json");
	writeFileSync(planFile, JSON.stringify(plan), "utf8");
	const channel = ipcChild<ObservationChildReport>(OBSERVATION_CHILD, planFile, options.cwd);
	return {
		send: command => channel.send(command),
		report: () => channel.ask({ t: "report" }),
		ready: () => channel.ready(),
		kill: () => channel.kill(),
		async finish() {
			const answer = await channel.finish(plan.resultPath);
			return { report: answer.value as ObservationChildReport, stderr: answer.stderr };
		},
	};
}
