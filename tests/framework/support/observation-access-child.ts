/**
 * One independent process that delivers a session's observation through the framework's own local
 * access, as a session the harness runs in another process really does.
 *
 * It is the delivering half of the access driven from outside the framework suite's own process, so
 * what a case observes is the carrier and the platform: the location record a serving process
 * published, the endpoint it names, this access's verification, and the frame one reading crosses
 * in. Nothing of the framework's own consumption is here — no binding, no harness and no source —
 * because what this process states is only what a real session's own process states: one actual
 * session's facts, the owner it follows and the readings it holds for it.
 *
 * Usage: this file is started with a plan path and reads commands off stdin, exactly as the
 * framework's other process doubles do. Every command answers after the one before it answered, so
 * what it prints is in the order it was asked.
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { ObservedSession } from "../../../framework/core/protocol";
import {
	createOwnerAccessPublisher,
	openOwnerAccess,
	resolveRuntimeDirectory,
	type OwnerAccessCaller,
	type OwnerAccessPublisher,
} from "../../../framework/modules/local-access";

/** What one delivering child process is asked to do. */
export interface ObservationChildPlan {
	/** The seat this process delivers its sessions' observations to. */
	readonly target: { readonly extension: string; readonly owner: string };
	/** The readings this process delivers, in the order it is asked for them. */
	readonly readings: readonly ObservedSession[];
	/** Where this process states what it did. */
	readonly resultPath: string;
	/** The framework's shared configuration file this process reads; the repository's own when absent. */
	readonly configPath?: string;
	/** How long this process waits for the seat's access to answer. */
	readonly waitMs?: number;
	/**
	 * One seat this process serves instead of delivering to: the other end of the same access, as the
	 * process that owns a session really is. Every reading a session elsewhere delivers for it is
	 * recorded in the order it arrived.
	 */
	readonly serve?: { readonly extension: string; readonly owner: string };
}

/** What one delivering child process states when it is asked. */
export interface ObservationChildReport {
	/** The commands this process acted on, in order. */
	readonly commands: readonly string[];
	/** Every reading this process delivered, in order. */
	readonly delivered: readonly string[];
	/** Whether this process reached the seat's access at all. */
	readonly reached: boolean;
	/** Whether this process's access ended: the seat was withdrawn, or the access was refused. */
	readonly ended: boolean;
	/** Every reading another process delivered to the seat this process serves, in order. */
	readonly received: readonly ObservedSession[];
	/** Why this process could not reach the seat, when it could not. */
	readonly failure?: string;
	/** The runtime directory this process resolved, when it resolved one. */
	readonly runtimeDirectory?: string;
	/** Why this process could not resolve one, when it could not. */
	readonly runtimeDirectoryFailure?: string;
}

/** One command, as this process reads it off stdin. */
interface ChildCommand {
	readonly t?: string;
	/** The index of the reading one `deliver` command states. */
	readonly index?: number;
}

const plan = JSON.parse(readFileSync(process.argv[2] ?? "", "utf8")) as ObservationChildPlan;
const commands: string[] = [];
const delivered: string[] = [];
const received: ObservedSession[] = [];
let caller: OwnerAccessCaller | undefined;
let publisher: OwnerAccessPublisher | undefined;
let failure: string | undefined;

if (plan.serve !== undefined) {
	publisher = createOwnerAccessPublisher({
		...(plan.configPath === undefined ? {} : { configPath: plan.configPath }),
		report: message => process.stderr.write(`${message}\n`),
	});
	publisher.receive(plan.serve, { adopt: (_source, reading) => void received.push(reading), lost: () => {} });
}

/** Reaches the seat's access, as this process does at its start and whenever it is asked to again. */
async function reach(): Promise<void> {
	failure = undefined;
	try {
		caller = await openOwnerAccess({
			target: plan.target,
			...(plan.configPath === undefined ? {} : { configPath: plan.configPath }),
			waitMs: plan.waitMs ?? 10000,
		});
	} catch (error) {
		failure = `${error instanceof Error ? error.name : "error"}: ${error instanceof Error ? error.message : String(error)}`;
	}
}

if (plan.target.owner.length > 0) await reach();

/** The reading one command names, as this process holds it. */
function readingAt(index: number | undefined): ObservedSession | undefined {
	return index === undefined ? undefined : plan.readings[index];
}

/** What this process states when it is asked to finish. */
function report(): ObservationChildReport {
	return {
		commands,
		delivered,
		reached: caller !== undefined,
		ended: caller?.ended() ?? false,
		received,
		...(failure === undefined ? {} : { failure }),
		...resolvedDirectory(),
	};
}

/**
 * The runtime directory this process resolves, or the failure it states instead.
 *
 * A delivering process resolves one for its own reasons only when the seat it delivers to turned out
 * to be elsewhere: a directory it cannot state is a fact about its own configuration, and it is
 * reported as a failure rather than substituted.
 */
function resolvedDirectory(): { readonly runtimeDirectory?: string; readonly runtimeDirectoryFailure?: string } {
	try {
		return {
			runtimeDirectory: resolveRuntimeDirectory(plan.configPath === undefined ? {} : { configPath: plan.configPath }),
		};
	} catch (error) {
		return { runtimeDirectoryFailure: error instanceof Error ? error.message : String(error) };
	}
}

/** Applies one command this process was sent. */
function act(command: ChildCommand): void {
	if (command.t === "deliver") {
		commands.push(`deliver:${command.index ?? -1}`);
		// A delivery is applied on the same chain as everything else this process is asked to do, so a
		// reading asked for after a reach is delivered over that reach rather than over the access this
		// process released before it.
		answering = answering.then(() => {
			const reading = readingAt(command.index);
			// A reading an access this process no longer holds is dropped rather than carried.
			if (reading === undefined || caller === undefined || caller.ended()) return;
			caller.deliver(reading);
			delivered.push(reading.session.sessionId);
		});
		return;
	}
	// What this process states goes through one chain, so the answers a parent reads are in the order
	// it asked — including an answer that only arrives once the access has ended.
	if (command.t === "report") {
		commands.push("report");
		answering = answering.then(() => stateReport());
		return;
	}
	if (command.t === "await-end") {
		// This process watching its own connection end, rather than a request the serving process
		// would have to be there to answer: the seat was withdrawn, or this access was refused.
		commands.push("await-end");
		answering = answering.then(async () => {
			const deadline = Date.now() + 5000;
			while (caller !== undefined && !caller.ended() && Date.now() < deadline) await Bun.sleep(10);
			stateReport();
		});
		return;
	}
	if (command.t === "release") {
		// This process releasing the access it held while it lives on, as one that stops delivering
		// does: the connection ends here, and nothing about its end is stated to the serving process —
		// what that side learns of it is the connection closing, and nothing else. What this process
		// held is kept as the released access it is, so a report still states that its access ended.
		commands.push("release");
		answering = answering.then(() => {
			caller?.dispose();
			stateReport();
		});
		return;
	}
	if (command.t === "reconnect") {
		// This process reaching the seat again, as one does when it has something to deliver after its
		// access ended: what it holds now is what the first word of this later connection carries.
		commands.push("reconnect");
		answering = answering.then(async () => {
			await reach();
			stateReport();
		});
		return;
	}
	if (command.t === "quit") {
		commands.push("quit");
		writeFileSync(plan.resultPath, JSON.stringify(report()), "utf8");
		caller?.dispose();
		publisher?.dispose();
		process.exit(0);
	}
	commands.push(`unknown:${command.t ?? ""}`);
}

/** States this process's own report as one line, on the chain that keeps the answers in order. */
function stateReport(): void {
	process.stdout.write(`${JSON.stringify({ t: "report", ...report() })}\n`);
}

/** The chain of commands that state something: each one answers after the one before it has. */
let answering: Promise<void> = Promise.resolve();

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => {
	buffer += chunk;
	let end = buffer.indexOf("\n");
	while (end >= 0) {
		const line = buffer.slice(0, end);
		buffer = buffer.slice(end + 1);
		try {
			act(JSON.parse(line) as ChildCommand);
		} catch {
			commands.push("unreadable");
		}
		end = buffer.indexOf("\n");
	}
});
process.stdin.on("end", () => act({ t: "quit" }));

// This process states that it is up after it tried to reach the seat: a case reads that attempt's
// outcome from the report rather than from this line.
process.stdout.write(`${JSON.stringify({ t: "ready", reached: caller !== undefined })}\n`);
