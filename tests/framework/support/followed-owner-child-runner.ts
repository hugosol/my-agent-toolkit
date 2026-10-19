/**
 * Starting one independent process that follows an Owner another process serves, and reading its
 * own answers back.
 *
 * This is the parent half of the two-process suite's following fixture: it writes the plan beside
 * the results the child is asked for, starts `followed-owner-child.ts` in the working directory a
 * case demands, sends the child's commands on stdin, and answers each report as the child's own
 * line rather than after a guessed delay.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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
	const child = Bun.spawn(["bun", FOLLOWED_OWNER_CHILD, planFile], {
		cwd: options.cwd,
		env: process.env,
		stdin: "pipe",
		stdout: "pipe",
		stderr: "pipe",
	});
	const stderr = new Response(child.stderr).text();

	// What the child prints on stdout: one report line per ask, and one readiness line. The line an
	// ask answers is awaited as the child's own answer, so a case never guesses how long a read takes.
	const queued: FollowedOwnerChildReport[] = [];
	const waiting: Array<(report: FollowedOwnerChildReport) => void> = [];
	const ready: Array<() => void> = [];
	let readyOnce = false;
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
					const report = JSON.parse(line) as FollowedOwnerChildReport;
					const next = waiting.shift();
					if (next === undefined) queued.push(report);
					else next(report);
				}
				end = buffer.indexOf("\n");
			}
		}
	})();

	const ask = async (command: { readonly t: string }): Promise<FollowedOwnerChildReport> => {
		const settled = Promise.withResolvers<FollowedOwnerChildReport>();
		const already = queued.shift();
		if (already === undefined) waiting.push(settled.resolve);
		else settled.resolve(already);
		child.stdin.write(`${JSON.stringify(command)}\n`);
		child.stdin.flush();
		return settled.promise;
	};

	return {
		async ready() {
			if (readyOnce) return;
			const settled = Promise.withResolvers<void>();
			ready.push(settled.resolve);
			await settled.promise;
		},
		read: () => ask({ t: "read" }),
		deliver: () => ask({ t: "deliver" }),
		dispose() {
			child.stdin.write(`${JSON.stringify({ t: "dispose" })}\n`);
			child.stdin.flush();
		},
		async finish() {
			child.stdin.write(`${JSON.stringify({ t: "quit" })}\n`);
			child.stdin.flush();
			const [written, exitCode] = await Promise.all([stderr, child.exited]);
			if (!existsSync(plan.resultPath)) {
				throw new Error(`the following child exited ${String(exitCode)} without reporting: ${written}`);
			}
			return {
				results: JSON.parse(readFileSync(plan.resultPath, "utf8")) as FollowedOwnerChildResult,
				stderr: written,
			};
		},
	};
}
