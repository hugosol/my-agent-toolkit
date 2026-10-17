/**
 * Starting one independent process that delivers a session's observation through the framework's
 * local access, and reading its own answers back.
 *
 * This is the parent half of the observation-access suite's child fixture: it writes the plan beside
 * the report the child is asked for, starts `observation-access-child.ts`, sends the child's commands
 * on stdin, and answers the report it printed or the stderr it exited with.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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
	const child = Bun.spawn(["bun", OBSERVATION_CHILD, planFile], {
		cwd: options.cwd,
		env: process.env,
		stdin: "pipe",
		stdout: "pipe",
		stderr: "pipe",
	});
	const stderr = new Response(child.stderr).text();

	// The child's own lines: one readiness line, and one report line per ask. Each report is awaited
	// as the child's own answer, so a case never guesses how long a delivery takes.
	const reports: ObservationChildReport[] = [];
	const waiting: Array<(report: ObservationChildReport) => void> = [];
	const ready: Array<() => void> = [];
	let readyOnce = false;
	/** Whether this child's process was ended abruptly, so it states nothing of its own end any more. */
	let killed = false;
	void (async () => {
		let buffer = "";
		const decoder = new TextDecoder();
		for await (const chunk of child.stdout as unknown as AsyncIterable<Uint8Array>) {
			buffer += decoder.decode(chunk, { stream: true });
			let end = buffer.indexOf("\n");
			while (end >= 0) {
				const line = buffer.slice(0, end);
				buffer = buffer.slice(end + 1);
				if (line.includes('"t":"ready"')) {
					readyOnce = true;
					for (const settle of ready.splice(0)) settle();
				} else if (line.trim().length > 0) {
					const report = JSON.parse(line) as ObservationChildReport;
					const next = waiting.shift();
					if (next === undefined) reports.push(report);
					else next(report);
				}
				end = buffer.indexOf("\n");
			}
		}
	})();

	return {
		send(command) {
			child.stdin.write(`${JSON.stringify(command)}\n`);
			child.stdin.flush();
		},
		async ready() {
			if (readyOnce) return;
			const settled = Promise.withResolvers<void>();
			ready.push(settled.resolve);
			await settled.promise;
		},
		async report() {
			const settled = Promise.withResolvers<ObservationChildReport>();
			const queued = reports.shift();
			if (queued === undefined) waiting.push(settled.resolve);
			else settled.resolve(queued);
			child.stdin.write(`${JSON.stringify({ t: "report" })}\n`);
			child.stdin.flush();
			return settled.promise;
		},
		async finish() {
			if (killed) throw new Error("this child's process was ended abruptly: it states nothing of its own end");
			child.stdin.write(`${JSON.stringify({ t: "quit" })}\n`);
			child.stdin.flush();
			const [written, exitCode] = await Promise.all([stderr, child.exited]);
			if (!existsSync(plan.resultPath)) {
				throw new Error(`the observation child exited ${String(exitCode)} without reporting: ${written}`);
			}
			return { report: JSON.parse(readFileSync(plan.resultPath, "utf8")) as ObservationChildReport, stderr: written };
		},
		kill() {
			killed = true;
			child.kill();
		},
	};
}
