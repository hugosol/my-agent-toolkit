/**
 * The in-host effect recorder: what the real harness process actually asked the file system and the
 * local network to do, written out when that process ends.
 *
 * The dock's real-host checks otherwise see only what leaves a process — the provider requests an
 * endpoint answers, the frames the RPC channel carries, the bytes a storage root ends up holding.
 * That is enough for a *positive* claim and blind to a negative one: a read the extension makes per
 * event, or a pipe a same-process path opens, leaves no artifact behind, so "no per-event disk read"
 * and "no new IPC" cannot be observed from outside at all. This module is the other side of that: it
 * is loaded into the host process itself (bun's `--preload`, injected through `BUN_OPTIONS`), wraps
 * the process's own `node:fs`, `node:fs/promises` and `node:net` members, and records every call
 * before it runs.
 *
 * It is a *recorder*, not a counter the measured code can read: nothing in the product knows it is
 * loaded, no count is published into the process, and the records leave only through a file this
 * run names. A test that reads them is therefore reading effects the host really produced rather
 * than a figure the implementation reports about itself.
 *
 * Two rules keep a zero honest. The recorder does nothing at all unless the run names a dump file
 * (`MY_AGENT_TOOLKIT_EFFECT_DUMP`), so a preload that reached a process no run asked about changes
 * nothing; and it writes its dump through the members it captured before wrapping, so its own write
 * is never one of the effects it records. Whether a dump exists is the run's own check that the
 * recorder was really in the process — an empty record list and no recorder at all are different
 * facts, and a test must not read the first as the second.
 *
 * What it cannot see: a member reached through a namespace bound before the wrap (which is why the
 * preload must precede the host's own module graph), traffic the process does not make itself (a
 * child process's file system calls), and the harness's own internal state. The dock's sensitivity
 * control covers the first of those by driving a process it *knows* reads a file and opens a pipe.
 */

/** One effect the recorded process produced: a file-system call, or a local-network call. */
export interface HostEffect {
	/** Which family the call belongs to. */
	readonly kind: "fs" | "net";
	/** The member's own name, so a record is readable without the wrapper's shape. */
	readonly op: string;
	/** The paths or addresses the call named, as the call stated them. */
	readonly targets: readonly string[];
	/** Whether the call had settled as a failure when the process ended, when it could be told. */
	outcome?: "ok" | "failed";
	/** When the call was made, on this process's own clock. */
	readonly at: number;
}

/** The name of the file one run's records are written to, or nothing when the run named none. */
const DUMP_VARIABLE = "MY_AGENT_TOOLKIT_EFFECT_DUMP";

/** The mark this recorder leaves on a member it already wrapped, so no call is ever recorded twice. */
const RECORDER_MARK: unique symbol = Symbol.for("my-agent-toolkit.host-effect-recorder");

/** The file-system members whose calls the recorder records, asynchronous and synchronous. */
const FS_OPERATIONS: readonly string[] = [
	"access",
	"appendFile",
	"copyFile",
	"cp",
	"mkdir",
	"open",
	"readFile",
	"readdir",
	"realpath",
	"rename",
	"rm",
	"stat",
	"lstat",
	"truncate",
	"unlink",
	"writeFile",
	"accessSync",
	"appendFileSync",
	"chmodSync",
	"copyFileSync",
	"existsSync",
	"mkdirSync",
	"openSync",
	"readFileSync",
	"readdirSync",
	"realpathSync",
	"renameSync",
	"rmSync",
	"statSync",
	"lstatSync",
	"truncateSync",
	"unlinkSync",
	"writeFileSync",
];

/** The members whose call names two paths, the second being the name the call is aimed at. */
const TWO_PATH_OPERATIONS: Readonly<Record<string, true>> = {
	copyFile: true,
	copyFileSync: true,
	cp: true,
	rename: true,
	renameSync: true,
};

/** The local-network members whose calls the recorder records. */
const NET_OPERATIONS: readonly string[] = ["connect", "createConnection", "createServer"];

/** Every string one call stated, in the order it stated them: a path, a pipe name or a host. */
function targetsOf(args: readonly unknown[]): readonly string[] {
	const targets: string[] = [];
	for (const arg of args.slice(0, 2)) {
		if (typeof arg === "string") targets.push(arg);
		else if (typeof arg === "object" && arg !== null) {
			// A connect call may state a port or a pipe name inside its options object.
			const options = arg as Record<string, unknown>;
			for (const key of ["path", "host", "port", "socketPath"]) {
				const value = options[key];
				if (typeof value === "string" || typeof value === "number") targets.push(String(value));
			}
		}
	}
	return targets;
}

/** The records one process produced, existing from this module's own load. */
const effects: HostEffect[] = [];

/**
 * Wrap one module instance's members so each call is recorded before it runs.
 *
 * A member that is not a function is left exactly as it was — the recorder never replaces a call it
 * cannot forward — and a member already carrying this recorder's mark is left alone, so a process
 * that loaded this preload twice records each call once.
 */
function recordCalls(instance: unknown, names: readonly string[], kind: "fs" | "net"): void {
	if (typeof instance !== "object" || instance === null) return;
	// Reason: a module namespace is a plain object of callable members; forwarding a member this
	// recorder cannot type is the whole point of the wrapper, and nothing here invents a shape.
	const module = instance as Record<string, unknown>;
	for (const name of names) {
		const real = module[name];
		if (typeof real !== "function") continue;
		if (RECORDER_MARK in real) continue;
		const forward = real as (...args: unknown[]) => unknown;
		const twoPath = TWO_PATH_OPERATIONS[name] === true;
		const wrapper = function recorded(...args: unknown[]): unknown {
			const effect: HostEffect = {
				kind,
				op: name,
				targets: targetsOf(twoPath ? args.slice(1) : args),
				at: Date.now(),
			};
			effects.push(effect);
			try {
				const result = forward.apply(module, args);
				if (result === null || typeof result !== "object" || !("then" in result)) {
					effect.outcome = "ok";
					return result;
				}
				// An asynchronous call's outcome is what its own promise settles as, so a call this
				// platform refused is never recorded as one that happened.
				(result as Promise<unknown>).then(
					() => {
						effect.outcome = "ok";
					},
					() => {
						effect.outcome = "failed";
					},
				);
				return result;
			} catch (error) {
				effect.outcome = "failed";
				throw error;
			}
		};
		// Reason: the mark is this recorder's own bookkeeping on a value it just built.
		(wrapper as unknown as Record<symbol, unknown>)[RECORDER_MARK] = true;
		module[name] = wrapper;
	}
}

const dumpPath = process.env[DUMP_VARIABLE];

if (dumpPath !== undefined && dumpPath.length > 0) {
	// Reason: the members are captured before any wrap, so the dump itself is written through this
	// runtime's own writeFileSync rather than through a wrapper this module installed.
	const nodeFs = require("node:fs") as { readonly writeFileSync: (path: string, data: string, encoding: string) => void };
	const nodeFsPromises = require("node:fs/promises") as Record<string, unknown>;
	const nodeNet = require("node:net") as Record<string, unknown>;
	recordCalls(nodeFsPromises, FS_OPERATIONS, "fs");
	recordCalls(nodeFs, FS_OPERATIONS, "fs");
	recordCalls(nodeNet, NET_OPERATIONS, "net");
	process.on("exit", () => {
		try {
			nodeFs.writeFileSync(
				dumpPath,
				`${JSON.stringify({ pid: process.pid, platform: process.platform, wroteAt: Date.now(), effects })}\n`,
				"utf8",
			);
		} catch {
			// A process that cannot write its dump still exits with its own status; the run that asked
			// for the dump reports the missing file rather than this module inventing a second failure.
		}
	});
}
