/**
 * One independent process serving an owner's declared values through the framework's own local
 * access.
 *
 * This is the serving half of the local-access suite, and it runs production code only: the
 * framework's `StateStore` with the access its assembly hands it, the lifecycle call a real binding
 * makes (`reconcile`) and the declared-value write path. Nothing here doubles that path — the plan
 * says which seat to offer and what the field starts at, the commands on stdin say what happens to
 * it, and the results file states what this process resolved and reported.
 *
 * It is a real process on purpose: whether two processes reach each other over a name the platform
 * provides, and whether a stale record, an old endpoint or another seat's record can reach this
 * one's values, is a fact about the platform and the carrier, not about an in-memory stand-in.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { StateStore } from "../../../framework/core/state";
import { SubagentAccess } from "../../../framework/core/subagent-access";
import {
	createOwnerAccessPublisher,
	LocalAccessUnavailableError,
	openOwnerAccess,
	resolveRuntimeDirectory,
	type OwnerAccessPublisher,
} from "../../../framework/modules/local-access";

/** What one child process is asked to do. */
export interface LocalAccessChildPlan {
	/** The extension whose declared values this process serves. */
	readonly extension: string;
	/** The owner this process serves them for. */
	readonly owner: string;
	/** The declared value the owner's field starts at. */
	readonly initial: boolean;
	/** Where this process states what it resolved and did. */
	readonly resultPath: string;
	/** The framework's shared configuration file this process reads; the repository's own when absent. */
	readonly configPath?: string;
	/** Whether this process offers a seat at all; a configuration case still resolves the directory. */
	readonly offer?: boolean;
	/**
	 * The seats this process reads instead of serving one — the other direction of the same access,
	 * and the one a session this harness ran elsewhere really has: it reaches the owner that holds
	 * the values.
	 */
	readonly reads?: readonly { readonly extension: string; readonly owner: string }[];
}

/** One seat this process reads, and what it last saw of it. */
export interface LocalAccessChildReader {
	readonly extension: string;
	readonly owner: string;
	/** The values this reader last heard. */
	readonly values?: Readonly<Record<string, boolean>>;
	/** The changes this reader observed, in order. */
	readonly observed: readonly (readonly [string, boolean])[];
	/** What the last declared read answered, or why it answered nothing. */
	readonly request?: { readonly value?: boolean; readonly reason?: string };
	/** Whether this reader's access has ended: the seat it reads was withdrawn. */
	readonly ended?: boolean;
	/** Whether it ended while nothing was asked of it — the seat was released, not discovered. */
	readonly endedWithoutAsking?: boolean;
	/** Why this process could not reach the seat at all. */
	readonly failure?: string;
}

/** What one reading child process last saw. */
export interface LocalAccessChildReport {
	readonly readers: readonly LocalAccessChildReader[];
	readonly commands: readonly string[];
}

/** What one child process resolved, reported and holds when it was asked. */
export interface LocalAccessChildResult {
	/** Every configuration failure this process's publisher reported, in order. */
	readonly diagnostics: readonly string[];
	/** The runtime directory this process resolved, when it resolved one. */
	readonly runtimeDirectory?: string;
	/** Why this process could not resolve one, when it could not. */
	readonly runtimeDirectoryFailure?: string;
	/** The owner's declared value this process holds now. */
	readonly value?: boolean;
	/** The commands this process acted on, in order. */
	readonly commands: readonly string[];
}

/** One command, as this process reads it off stdin. */
interface ChildCommand {
	readonly t?: string;
	readonly value?: boolean;
	/** The owner one command concerns, when it concerns one seat rather than all of them. */
	readonly owner?: string;
}

/** One seat this process reads, as it holds it. */
interface ChildReader {
	readonly extension: string;
	readonly owner: string;
	readonly values: () => Readonly<Record<string, boolean>>;
	readonly observed: Array<readonly [string, boolean]>;
	readonly request: (field: string, waitMs: number) => Promise<boolean | undefined>;
	readonly ended: () => boolean;
	failure?: string;
}

/**
 * The chain of commands that state something: each one answers after the one before it has, so
 * what this process prints is in the order it was asked.
 */
let answering: Promise<void> = Promise.resolve();

const plan = JSON.parse(readFileSync(process.argv[2] ?? "", "utf8")) as LocalAccessChildPlan;
const diagnostics: string[] = [];
const commands: string[] = [];
let value = plan.initial;
let publisher: OwnerAccessPublisher | undefined;
let store: StateStore | undefined;
const readers: ChildReader[] = [];

if (plan.offer !== false) {
	publisher = createOwnerAccessPublisher({
		...(plan.configPath === undefined ? {} : { configPath: plan.configPath }),
		report: message => {
			diagnostics.push(message);
			// The diagnostic channel of a real process: what an operator would read.
			process.stderr.write(`${message}\n`);
		},
	});
	store = new StateStore({
		field: "enabled",
		persistence: "session-entry",
		access: new SubagentAccess({ extension: plan.extension, publisher }),
	});
	store.reconcile({
		owner: { kind: "owner", key: plan.owner },
		event: { kind: "session_start", reason: "new" },
		statePayloads: [{ enabled: plan.initial }],
		persist: () => {},
		publishMarker: () => {},
	});
}

/** Every seat this process was asked to read, reached over the access the serving process published. */
async function read(): Promise<void> {
	for (const target of plan.reads ?? []) {
		const observed: Array<readonly [string, boolean]> = [];
		try {
			const caller = await openOwnerAccess({
				target,
				...(plan.configPath === undefined ? {} : { configPath: plan.configPath }),
				waitMs: 10000,
			});
			caller.observe((field, next) => void observed.push([field, next]));
			readers.push({
				extension: target.extension,
				owner: target.owner,
				values: () => caller.values(),
				observed,
				request: (field, waitMs) => caller.request(field, waitMs),
				ended: () => caller.ended(),
			});
		} catch (error) {
			readers.push({
				extension: target.extension,
				owner: target.owner,
				values: () => ({}),
				observed,
				request: () => Promise.reject(new Error("this seat was never reached")),
				ended: () => true,
				failure: error instanceof Error ? error.message : String(error),
			});
		}
	}
}

/** What this process has read so far, as one report line. */
async function report(): Promise<void> {
	const read: LocalAccessChildReader[] = [];
	for (const reader of readers) {
		const answer = await reader
			.request("enabled", 300)
			.then(
				(next: boolean | undefined) => ({ value: next }),
				(error: unknown) => ({ reason: error instanceof LocalAccessUnavailableError ? error.reason : "failed" }),
			);
		read.push({
			extension: reader.extension,
			owner: reader.owner,
			values: reader.values(),
			observed: [...reader.observed],
			request: answer,
			ended: reader.ended(),
			...(reader.failure === undefined ? {} : { failure: reader.failure }),
		});
	}
	const line: LocalAccessChildReport = { readers: read, commands: [...commands] };
	process.stdout.write(`${JSON.stringify(line)}\n`);
}

/**
 * Watches one of this process's readers ending, without asking it anything.
 *
 * `endedWithoutAsking` is the fact a release has to produce: the access a seat is read over is
 * released with the seat, so the reader learns of it from its own connection rather than from a
 * request the serving process was still there to answer.
 */
async function awaitEnded(owner: string | undefined): Promise<void> {
	const watched = readers.filter(reader => owner === undefined || reader.owner === owner);
	const deadline = Date.now() + 5000;
	while (watched.some(reader => !reader.ended()) && Date.now() < deadline) await Bun.sleep(10);
	const read: LocalAccessChildReader[] = watched.map(reader => ({
		extension: reader.extension,
		owner: reader.owner,
		values: reader.values(),
		observed: [...reader.observed],
		ended: reader.ended(),
		endedWithoutAsking: reader.ended(),
	}));
	process.stdout.write(`${JSON.stringify({ readers: read, commands: [...commands] })}\n`);
}

/** What this process states when it is asked to finish. */
function reportFile(): void {
	const result: LocalAccessChildResult = {
		diagnostics,
		value,
		commands,
		...(resolvedDirectory() ?? {}),
	};
	writeFileSync(plan.resultPath, JSON.stringify(result), "utf8");
}

/** The runtime directory this process resolves, or the failure it states instead. */
function resolvedDirectory(): { readonly runtimeDirectory?: string; readonly runtimeDirectoryFailure?: string } {
	try {
		return { runtimeDirectory: resolveRuntimeDirectory(plan.configPath === undefined ? {} : { configPath: plan.configPath }) };
	} catch (error) {
		return { runtimeDirectoryFailure: error instanceof Error ? error.message : String(error) };
	}
}

function act(command: ChildCommand): void {
	switch (command.t) {
		case "set":
			value = command.value === true;
			store?.writer({ ownerKey: plan.owner, persist: () => {}, publishMarker: () => {} }).write(value);
			commands.push(`set:${value ? "true" : "false"}`);
			return;
		case "end":
			store?.reconcile({
				owner: { kind: "owner", key: plan.owner },
				event: { kind: "session_end", reason: "disposed" },
				statePayloads: [],
				persist: () => {},
				publishMarker: () => {},
			});
			commands.push("end");
			return;
		case "dispose":
			publisher?.dispose();
			commands.push("dispose");
			return;
		case "report":
			commands.push("report");
			answering = answering.then(() => report());
			return;
		case "await-end":
			// A release must be noticed without asking the access for anything: the seat is gone, so
			// the connection it was read over is released with it. The wait here is this process
			// watching its own connection, not a request the serving process would learn from.
			commands.push("await-end");
			answering = answering.then(() => awaitEnded(command.owner));
			return;
		case "quit":
			commands.push("quit");
			reportFile();
			process.exit(0);
			return;
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
		if (line.trim().length > 0) act(JSON.parse(line) as ChildCommand);
		end = buffer.indexOf("\n");
	}
});
process.stdin.on("end", () => {
	reportFile();
	process.exit(0);
});

// A reading process states nothing to the framework's own offering; it is here so that the seat it
// was asked about is reached on the command the parent sends, exactly as a real session would.
if ((plan.reads ?? []).length > 0) await read();
process.stdout.write(`${JSON.stringify({ t: "ready" })}\n`);
