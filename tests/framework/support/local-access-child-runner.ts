/**
 * Starting one independent process that serves an owner's declared values, and reading its own
 * answers back.
 *
 * This is the parent half of the local-access suite's child fixture: it writes the plan beside the
 * results the child is asked for, starts `local-access-child.ts` in the working directory a case
 * demands, sends the child's commands on stdin, and answers the child's parsed results or the
 * stderr it exited with.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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
	const child = Bun.spawn(["bun", LOCAL_ACCESS_CHILD, planFile], {
		cwd: options.cwd,
		env: process.env,
		stdin: "pipe",
		stdout: "pipe",
		stderr: "pipe",
	});
	const stderr = new Response(child.stderr).text();

	// What the child prints on stdout: one report line per request, and one readiness line. Each
	// report is awaited as the child's own answer, so a case never guesses how long a read takes.
	const reports: LocalAccessChildReport[] = [];
	const waiting: Array<(report: LocalAccessChildReport) => void> = [];
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
					const report = JSON.parse(line) as LocalAccessChildReport;
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
			const settled = Promise.withResolvers<LocalAccessChildReport>();
			const queued = reports.shift();
			if (queued === undefined) waiting.push(settled.resolve);
			else settled.resolve(queued);
			child.stdin.write(`${JSON.stringify({ t: "report" })}\n`);
			child.stdin.flush();
			return settled.promise;
		},
		async finish() {
			child.stdin.write(`${JSON.stringify({ t: "quit" })}\n`);
			child.stdin.flush();
			const [written, exitCode] = await Promise.all([stderr, child.exited]);
			if (!existsSync(plan.resultPath)) {
				throw new Error(`the local-access child exited ${String(exitCode)} without reporting: ${written}`);
			}
			return { results: JSON.parse(readFileSync(plan.resultPath, "utf8")) as LocalAccessChildResult, stderr: written };
		},
	};
}
