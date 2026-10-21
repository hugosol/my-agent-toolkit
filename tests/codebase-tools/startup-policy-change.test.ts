/**
 * Editing the selected startup policy document affects the next process, never the running one
 * (S1; P7 of the extension-startup-modes contract).
 *
 * The seam is the public assembly interface, observed across two real processes: a child binds
 * codebase-tools against a policy file the way an entrypoint does, serves a session with no record
 * of its own, and reports the value, the payloads and the contribution the framework produced. The
 * parent edits that file while the first child is still running, then starts a second child over a
 * session with no history. What the framework owes is that the first process keeps what it read at
 * binding, and the second starts on the edited choice.
 *
 * The expectation that the second process reflects the file is deliberately stated through a
 * visible contract effect — an enabling choice must produce a first-run contribution and one
 * `{ enabled: true }` payload — and not by comparing the two processes to each other.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { CODEBASE_TOOLS } from "../../extensions/codebase-tools/definition";
import {
	type StartupPolicyChildPlan,
	type StartupPolicyChildReport,
	type StartupPolicyChildResult,
} from "./support/startup-policy-child";

const CHILD = path.join(import.meta.dir, "support", "startup-policy-child.ts");
const INIT_IDENTITY = `${CODEBASE_TOOLS.id}:init`;

/** One started child: the asks it takes, and what it holds when it is finished. */
interface RunningChild {
	/** Waits until the child states it is ready to act. */
	ready(): Promise<void>;
	/** Serves a first session with no record of its own, and answers what the framework produced. */
	start(): Promise<StartupPolicyChildReport>;
	/** Observes that session again, after the parent edited the document, and answers what it holds. */
	observe(): Promise<StartupPolicyChildReport>;
	/** Asks the child to finish and answers what it reported, plus the stderr it wrote. */
	finish(): Promise<{ readonly result: StartupPolicyChildResult; readonly stderr: string }>;
	/** Ends the child when a case failed before it could finish, so no process outlives the case. */
	abort(): void;
}

/**
 * Start one child over a plan.
 *
 * Every report is read as the child's own line, so a case never guesses how long an ask takes.
 */
function startChild(plan: StartupPolicyChildPlan, cwd: string): RunningChild {
	const planFile = path.join(cwd, "child-plan.json");
	writeFileSync(planFile, JSON.stringify(plan), "utf8");
	const child = Bun.spawn(["bun", CHILD, planFile], {
		cwd,
		env: process.env,
		stdin: "pipe",
		stdout: "pipe",
		stderr: "pipe",
	});
	const stderr = new Response(child.stderr).text();
	const queued: StartupPolicyChildReport[] = [];
	const waiting: Array<(report: StartupPolicyChildReport) => void> = [];
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
					const answer = JSON.parse(line) as StartupPolicyChildReport;
					const next = waiting.shift();
					if (next === undefined) queued.push(answer);
					else next(answer);
				}
				end = buffer.indexOf("\n");
			}
		}
	})();

	const ask = (command: { readonly t: string }): Promise<StartupPolicyChildReport> => {
		const settled = Promise.withResolvers<StartupPolicyChildReport>();
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
		start: () => ask({ t: "start" }),
		observe: () => ask({ t: "observe" }),
		async finish() {
			child.stdin.write(`${JSON.stringify({ t: "quit" })}\n`);
			child.stdin.flush();
			const [written, exitCode] = await Promise.all([stderr, child.exited]);
			try {
				return {
					result: JSON.parse(readFileSync(plan.resultPath, "utf8")) as StartupPolicyChildResult,
					stderr: written,
				};
			} catch {
				throw new Error(`the policy child exited ${String(exitCode)} without reporting: ${written}`);
			}
		},
		abort() {
			try {
				child.stdin.end();
			} finally {
				child.kill();
			}
		},
	};
}

describe("an edited startup policy document takes effect with the next process (P7)", () => {
	test("a running process keeps the choice it read, and a fresh session in a new process takes the edited one", async () => {
		const directory = mkdtempSync(path.join(tmpdir(), "codebase-tools-policy-"));
		const policyPath = path.join(directory, "policy.yaml");
		const plan: StartupPolicyChildPlan = {
			policyPath,
			resultPath: path.join(directory, "child-result.json"),
		};
		let first: RunningChild | undefined;
		let second: RunningChild | undefined;
		try {
			writeFileSync(policyPath, `${CODEBASE_TOOLS.id}:\n  enabled: true\n`, "utf8");

			// The first process starts on the enabling choice, with no history of its own.
			first = startChild(plan, directory);
			await first.ready();
			const started = await first.start();
			expect(started.bound).toBe(true);
			expect(started.diagnostics).toEqual([]);
			expect(started.enabled).toBe(true);
			expect(started.persisted).toEqual([{ enabled: true }]);
			expect(started.contribution).toBe(INIT_IDENTITY);

			// The operator edits the selected document while this process runs. Nothing re-reads it:
			// the session keeps its value, records nothing on the observation, and its next run still
			// plans the contribution that value selects.
			writeFileSync(policyPath, `${CODEBASE_TOOLS.id}:\n  enabled: false\n`, "utf8");
			const observed = await first.observe();
			expect(observed.enabled).toBe(true);
			expect(observed.persisted).toEqual([]);
			expect(observed.contribution).toBe(INIT_IDENTITY);
			const firstExit = await first.finish();
			expect(firstExit.result.commands).toEqual(["start", "observe", "quit"]);

			// A new process serves a session with no history of its own. The document it finds is
			// the edited one, so the explicit off choice is what it starts on: no contribution, no
			// record, and the value its own read answers is off.
			second = startChild(plan, directory);
			await second.ready();
			const fresh = await second.start();
			expect(fresh.bound).toBe(true);
			expect(fresh.enabled).toBe(false);
			expect(fresh.persisted).toEqual([]);
			expect(fresh.contribution).toBeUndefined();
			const secondExit = await second.finish();
			expect(secondExit.result.commands).toEqual(["start", "quit"]);
		} finally {
			first?.abort();
			second?.abort();
			rmSync(directory, { recursive: true, force: true });
		}
	}, 60_000);
});
