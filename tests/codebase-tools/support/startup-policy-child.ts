/**
 * One independent process that binds codebase-tools against a startup policy document and reports
 * what the first session it serves starts with.
 *
 * It runs production code only — the framework's binding through the harness port double and the
 * extension's own declaration — and the plan says which policy document this process selected. The
 * commands on stdin ask it to serve a session, to observe that same session again, and to finish.
 *
 * It is a real process on purpose: the framework reads a policy document once per process, so
 * "an edited document takes effect with the next process, not the running one" is a fact about two
 * real processes and the file between them, not about an in-memory stand-in.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { CODEBASE_TOOLS } from "../../../extensions/codebase-tools/definition";
import type { StateValues } from "../../../framework/runtime/port";
import { portDouble } from "../../framework/support/harness-port-double";

/** What one process is asked to do. */
export interface StartupPolicyChildPlan {
	/** The policy document this process's assembly selected, as an entrypoint names one. */
	readonly policyPath: string;
	/** Where this process states the commands it acted on. */
	readonly resultPath: string;
}

/** What one answer states about the session this process serves. */
export interface StartupPolicyChildReport {
	/** Which ask this answers: a first session start, or a later observation of it. */
	readonly kind: "start" | "observe";
	/** Whether the binding was admitted. A refused binding reports its diagnostics instead. */
	readonly bound: boolean;
	/** The framework's non-model diagnostics, in order. */
	readonly diagnostics: readonly string[];
	/** The current value the extension's public read answers. */
	readonly enabled: boolean;
	/** The values this ask recorded, in the ordinary `{ enabled }` payload format. */
	readonly persisted: readonly StateValues[];
	/** The marker-area renderings this ask published, in order. */
	readonly markers: readonly (readonly string[])[];
	/** The injected-prompt identity this ask's run initiation would contribute, or none. */
	readonly contribution: string | undefined;
}

/** What one process holds when it is asked to finish. */
export interface StartupPolicyChildResult {
	/** The commands it acted on, in order. */
	readonly commands: readonly string[];
}

const plan = JSON.parse(readFileSync(process.argv[2] ?? "", "utf8")) as StartupPolicyChildPlan;
const OWNER = { kind: "owner", key: "main:startup-policy-child" } as const;

const double = portDouble();
const binding = double.bind(CODEBASE_TOOLS, { startupPolicy: plan.policyPath });
const commands: string[] = [];
let persisted: StateValues[] = [];
let markers: Array<readonly string[]> = [];

/** States what this process currently holds as one line, so its starter reads a report. */
async function report(kind: "start" | "observe"): Promise<void> {
	const run = await double.initiateRun(OWNER);
	const answer: StartupPolicyChildReport = {
		kind,
		bound: binding.bound,
		diagnostics: [...double.diagnostics],
		enabled: double.state.view(OWNER.key).read("enabled"),
		persisted,
		markers,
		contribution: run.contribution?.identity,
	};
	persisted = [];
	markers = [];
	process.stdout.write(`${JSON.stringify(answer)}\n`);
}

let answering: Promise<void> = Promise.resolve();

/** Acts on one command from the process that started this one. */
function act(command: { readonly t?: string }): void {
	switch (command.t) {
		case "start": {
			commands.push("start");
			const boundary = double.deliverSession(OWNER, { event: { kind: "session_start", reason: "initial" } });
			persisted.push(...boundary.persisted);
			markers.push(...boundary.markers);
			answering = answering.then(() => report("start"));
			return;
		}
		case "observe": {
			commands.push("observe");
			// A fact about the session, not a boundary: the value this process already holds must
			// stay what the document it read at binding chose.
			const boundary = double.deliverSession(OWNER, { event: { kind: "session_facts" } });
			persisted.push(...boundary.persisted);
			markers.push(...boundary.markers);
			answering = answering.then(() => report("observe"));
			return;
		}
		case "quit": {
			commands.push("quit");
			writeFileSync(plan.resultPath, JSON.stringify({ commands } satisfies StartupPolicyChildResult), "utf8");
			process.exit(0);
			return;
		}
		default:
			return;
	}
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => {
	buffer += chunk;
	let end = buffer.indexOf("\n");
	while (end >= 0) {
		const line = buffer.slice(0, end);
		buffer = buffer.slice(end + 1);
		if (line.trim().length > 0) act(JSON.parse(line) as { t?: string });
		end = buffer.indexOf("\n");
	}
});
process.stdin.on("end", () => process.exit(0));

process.stdout.write(`${JSON.stringify({ t: "ready" })}\n`);
