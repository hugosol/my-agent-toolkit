/**
 * The framework's general safe-file module: the one coordinated read-modify-publish shared logic
 * imports directly, instead of every extension carrying its own locking, queueing and atomic
 * publication.
 *
 * It is harness-independent and delivery-free: an extension's shared logic imports `updateFile`
 * through the framework's public entry, and a suite drives it over real files rather than
 * receiving a file capability through a command or event delivery. What makes it more than a
 * rename of the platform's write is what it owns: the in-process queue per document, the
 * cross-process lock, the re-read inside that lock, the atomic publication, and the wait budget
 * that bounds the first two.
 *
 * The shape is deliberately small — one asynchronous entry — and the meaning fixed:
 *
 * - The caller supplies the target's **absolute path** and a business update function. The
 *   module derives its coordination key from the *existing parent directory's* realpath plus the
 *   file's name, so two spellings of one directory cannot take two locks, and the caller needs to
 *   know nothing about the key. The directory must already exist; the module creates files, never
 *   directories, and it never interprets the document: whatever JSON the update function returns
 *   is what gets published, and the module knows no schema, version or period.
 * - `update(current)` receives the document as of inside the coordination scope — the freshly
 *   re-read and parsed file, or `undefined` when the file does not exist yet — and returns the
 *   document to publish. Its return value is also what `updateFile` resolves with, after that
 *   document is really on disk. A business refusal is expressed by throwing: the rejection
 *   reaches the caller untouched, and the target file is not written.
 * - Two callers of one document are serialized: in this process by a per-key promise chain that
 *   runs one update at a time in submission order, and across processes by one lock directory
 *   created atomically. The first is FIFO, the second is mutual exclusion only — no cross-process
 *   order is promised — and both share one wait budget. Distinct documents never wait for each
 *   other.
 * - The wait budget is `options.timeoutMs`, else the default {@link DEFAULT_WAIT_MS}. In-process
 *   queueing and lock acquisition together may not exceed it; running out, or `options.signal`
 *   aborting, fails the call and the call never writes afterwards. Once the update has begun —
 *   the lock is held and the document is being read — the call waits for the real outcome: a
 *   later abort is ignored, no surface timeout pretends the write stopped, and no hard deadline
 *   for the whole operation is promised.
 * - Publication is a same-directory temporary document plus a rename over the target, so a reader
 *   sees the complete old document or the complete new one. A document that cannot be read as
 *   its declared JSON is a failure: the update function is not called and the file is not
 *   overwritten.
 * - Failure is a value the caller can act on, never an unhandled exception: a
 *   {@link SafeFileUpdateError} names its {@link SafeFileUpdateFailureKind} — a wait that ran out,
 *   a cancelled wait, an I/O failure, or a document that is not usable JSON — and a business
 *   rejection comes from the update function itself. Nothing is retried once it has been
 *   reported: there is no background queue, no deferred write, no second synchronous entry, and no
 *   native file-lock dependency. (The only retries that exist are bounded steps over this
 *   platform's short-lived refusals — of the replacing rename while a reader holds the document
 *   open, and of a removal while it still has a name open — and each is settled before anything is
 *   reported: a refusal that survives its steps is reported, never retried afterwards.)
 *
 * The cross-process lock is one directory beside the target, carrying one entry while it is held:
 * a file named after the holder's process and a token unique to that acquisition, installed by
 * renaming a prepared directory into the lock name — so the lock name never holds a lock that is
 * not complete, and exactly one of any number of calls racing for it can win. A lock is reclaimed
 * only when the holder its entry names is confirmed gone: the process is queried, and `ESRCH` — no
 * such process — is the confirmation. Age is never the evidence, so a lock whose holder is alive,
 * or whose liveness cannot be established, is never taken over; that call fails at the end of its
 * budget instead. A process that dies while holding the lock therefore leaves a lock the next
 * caller genuinely recovers, which is what keeps one crash from blocking every later write.
 *
 * Recovering a lock — and releasing one — removes that holder's own entry and then the directory
 * it lived in, and neither step can touch whoever holds the lock now, however late they run: an
 * entry name is one no other acquisition of the document ever writes, so a newer holder's entry
 * is simply not there to remove, and `rmdir` is an operation no platform applies to a directory
 * that still carries an entry. Two callers recovering one dead lock at once therefore cannot both
 * take it (only one of them can install), cannot take a live holder's lock from it (their removals
 * are inert against it), and cannot lose the loser's own attempt (its next install is a fresh
 * race, and the winner's release frees the name for it). An empty lock directory is a leftover of
 * a release or a recovery that was interrupted after it removed its entry and before it removed
 * the directory, and it holds nobody; a lock name that is anything else this module did not write
 * is reported as an I/O failure rather than guessed at.
 *
 * The scope is this machine's local file systems: processes that access one directory — the same
 * project, terminal, or several CLIs — are safe against each other, and no correctness is claimed
 * for a document shared over a network volume or a cloud-synced folder. The lock is local
 * IPC, not a distributed lock, and it is not a lease: nothing expires it while its holder lives.
 */
import * as fs from "node:fs/promises";
import { basename, dirname, isAbsolute, join } from "node:path";
import { describeValue, isScheduledWait, SCHEDULED_WAIT_TEXT } from "../core/config";

/** Why a call did not get as far as publishing a document. */
export type SafeFileUpdateFailureKind = "timeout" | "cancelled" | "io" | "corrupt";

/**
 * One failure of the framework's file coordination, as the caller observes it.
 *
 * `timeout` is a wait budget that ran out before coordination was acquired; `cancelled` is a
 * caller's own abort during that wait; `io` is a file the module could not read, create, replace
 * or lock, or a call it could not start at all (a target that is not an absolute path, a budget
 * that is not a wait this framework schedules); `corrupt` is an existing target whose text is not
 * a JSON document. None of them is a business decision — an update function that refuses rejects
 * with its own error, which reaches the caller unchanged — and none of them is retried.
 */
export class SafeFileUpdateError extends Error {
	readonly kind: SafeFileUpdateFailureKind;
	readonly detail: string;

	constructor(kind: SafeFileUpdateFailureKind, detail: string) {
		super(detail);
		this.name = "SafeFileUpdateError";
		this.kind = kind;
		this.detail = detail;
	}
}

/** What one update declares beyond its target and its update function. */
export interface SafeFileUpdateOptions {
	/**
	 * The whole wait budget, in milliseconds: in-process queueing plus cross-process lock
	 * acquisition. Omitted takes the default {@link DEFAULT_WAIT_MS}. A declared budget must be a
	 * whole number of milliseconds this harness's timer schedules; an illegal one is refused
	 * rather than replaced.
	 */
	readonly timeoutMs?: number;
	/** Aborts the *wait*: the call fails as cancelled and never writes afterwards. Ignored once the update has begun. */
	readonly signal?: AbortSignal;
}

/** The wait a call with no declared budget gets: in-process queueing plus lock acquisition. */
const DEFAULT_WAIT_MS = 15000;

/** How often the wait re-checks the queue, the lock and the signal. */
const WAIT_POLL_MS = 25;

/** How many times one step steps over this platform's refusal of a name another process has open. */
const IN_USE_ATTEMPTS = 6;

/** How long one such step waits between those attempts. */
const IN_USE_RETRY_MS = 25;

/**
 * The ways this platform answers that a name another process currently has open cannot be changed
 * yet — the same step succeeds a moment later, so it is stepped over rather than reported.
 */
const IN_USE_CODES = ["EPERM", "EACCES", "EBUSY"];

/** The ways this platform answers that the name an install aimed at is taken by someone else. */
const TAKEN_CODES = [...IN_USE_CODES, "EEXIST", "ENOTEMPTY", "ENOTDIR", "EISDIR"];

/** One document's in-process queue: the promise that settles when its current turn ends. */
interface QueueEntry {
	readonly tail: Promise<void>;
}

/**
 * The one coordination state of this process, under a well-known symbol: the document queues, and
 * the order the calls of this process entered the interface in.
 *
 * It belongs to the process rather than to this module instance, because a harness that evaluates
 * a copy of this module per extension still writes one document with one process: a
 * module-scoped table would let two copies queue separately and then wait on each other's lock
 * files as if the holder were another process — which one process cannot resolve without
 * timing out. `Symbol.for` is what lets the copies agree on the key by name while holding no
 * shared module identity, exactly as the marker area does.
 */
const FILE_STATE_KEY: unique symbol = Symbol.for("my-agent-toolkit.semantic-extensions.file-coordination");

/** The process-wide coordination: one queue per document in use, and one submission chain. */
interface FileCoordination {
	readonly queues: Map<string, QueueEntry>;
	submissions: Promise<void>;
}

/** The process global, narrowed to the one entry this module reads and writes. */
interface FileStateScope {
	[FILE_STATE_KEY]?: FileCoordination;
}

/** The process-wide coordination state, created on first use. */
function fileCoordination(): FileCoordination {
	const scope = globalThis as FileStateScope;
	const registered = scope[FILE_STATE_KEY];
	if (registered !== undefined) return registered;
	const coordination: FileCoordination = { queues: new Map(), submissions: Promise.resolve() };
	scope[FILE_STATE_KEY] = coordination;
	return coordination;
}

/**
 * A name no other call of this process is using, for this module's own temporary files.
 *
 * The process id and the counter are this process's own; the reading of the clock is what keeps a
 * temporary file a run that died left behind from colliding with this run's own name — the one way
 * an exclusive create of a temporary file could fail on a name nobody is using.
 */
let temporaryCounter = 0;
function temporaryName(key: string, suffix: string): string {
	temporaryCounter += 1;
	return `${key}.${process.pid}-${temporaryCounter}-${Date.now().toString(36)}.${suffix}`;
}

/**
 * The name one acquisition takes inside the lock directory: the process that holds it, and a
 * token unique to that acquisition.
 *
 * The process id is what a peer judges liveness by. The token is what keeps that name this
 * acquisition's own: removing an entry can then only remove the entry of the acquisition that
 * wrote it, which is what stops a recovery from touching whoever holds the lock now.
 */
function holderName(): string {
	temporaryCounter += 1;
	return `${process.pid}-${temporaryCounter}-${Date.now().toString(36)}`;
}

/** The process one lock entry names, or `undefined` when the entry is not one this module wrote. */
function holderPidOf(entry: string): number | undefined {
	const match = /^(\d+)-\d+-[0-9a-z]+$/.exec(entry);
	if (match === null) return undefined;
	const pid = Number(match[1]);
	return Number.isInteger(pid) && pid > 0 ? pid : undefined;
}

/** The platform error code of one thrown value, when it carries one. */
function errorCodeOf(error: unknown): string | undefined {
	if (error === null || typeof error !== "object" || !("code" in error)) return undefined;
	const code: unknown = error.code;
	return typeof code === "string" ? code : undefined;
}

/** How one thrown value is named in a failure's detail. */
function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** Waits one step of a poll loop. */
function sleep(ms: number): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>();
	setTimeout(resolve, ms);
	return promise;
}

/** Removes one file, treating its absence as the answer rather than a failure. */
async function remove(path: string): Promise<void> {
	try {
		await fs.unlink(path);
	} catch (error) {
		if (errorCodeOf(error) !== "ENOENT") return;
	}
}

/** Removes one directory, answering whether it is gone — its absence included. */
async function removeDirectory(path: string): Promise<boolean> {
	try {
		await fs.rmdir(path);
		return true;
	} catch (error) {
		return errorCodeOf(error) === "ENOENT";
	}
}

/** The budget one call runs with: its own declared value, else the default. */
function resolveBudget(declared: number | undefined): number {
	if (declared === undefined) return DEFAULT_WAIT_MS;
	if (!isScheduledWait(declared)) {
		throw new SafeFileUpdateError(
			"io",
			`the update declares timeoutMs as ${describeValue(declared)}, but a wait budget is ${SCHEDULED_WAIT_TEXT}`,
		);
	}
	return declared;
}

/**
 * The one coordination key of a target: the realpath of its existing parent directory plus the
 * file's own name.
 *
 * The realpath is what folds the ways one directory can be spelled — a relative segment, a case
 * variant, a symlinked or short name — into one identifier, so every writer of one document
 * queues and locks against the same key. A target whose directory does not exist cannot be
 * coordinated and is refused here: the module creates documents, never the place they live.
 */
async function coordinationKey(target: string): Promise<string> {
	if (!isAbsolute(target)) {
		throw new SafeFileUpdateError("io", `the update target ${describeValue(target)} is not an absolute path`);
	}
	const name = basename(target);
	if (name === "") {
		throw new SafeFileUpdateError("io", `the update target "${target}" names no file`);
	}
	let directory: string;
	try {
		directory = await fs.realpath(dirname(target));
	} catch (error) {
		throw new SafeFileUpdateError(
			"io",
			`the directory of "${target}" could not be resolved: ${messageOf(error)}`,
		);
	}
	const key = join(directory, name);
	// Windows resolves one name whatever its case, so a case variant of one document is the same
	// document; folding the key there keeps those spellings from taking two locks.
	return process.platform === "win32" ? key.toLowerCase() : key;
}

/** The text one update function's return value publishes, refused when it is not a JSON document. */
function serialize(target: string, document: unknown): string {
	let text: string | undefined;
	try {
		text = JSON.stringify(document);
	} catch (error) {
		throw new SafeFileUpdateError(
			"io",
			`the update of "${target}" returned a value that is not a JSON document: ${messageOf(error)}`,
		);
	}
	if (text === undefined) {
		throw new SafeFileUpdateError(
			"io",
			`the update of "${target}" returned ${describeValue(document)}, which is not a JSON document to publish`,
		);
	}
	return text;
}

/** The coordination key one call is resolving, and the way it reports that resolution is over. */
interface Submission {
	readonly key: Promise<string>;
	readonly done: () => void;
}

/**
 * Takes this call's place in the process's submission chain and starts resolving its key.
 *
 * The key needs the file system — the parent directory's realpath — and the calls of one tick
 * would otherwise enter the queue in whatever order their own resolutions happened to finish,
 * which is not the order the caller submitted them in. Taking the place here is synchronous, so
 * that order survives; only the resolution is ordered, so two documents' updates still run
 * independently of each other, and the ordered part is one metadata call that overlaps no
 * document I/O.
 */
function beginSubmission(target: string): Submission {
	const coordination = fileCoordination();
	const previous = coordination.submissions;
	const gate = Promise.withResolvers<void>();
	coordination.submissions = previous.then(() => gate.promise);
	return { key: previous.then(() => coordinationKey(target)), done: () => gate.resolve() };
}

/** The target document as of now: its parsed value, or `undefined` when it does not exist. */
async function readDocument(target: string): Promise<unknown> {
	let text: string;
	try {
		text = await fs.readFile(target, "utf8");
	} catch (error) {
		if (errorCodeOf(error) === "ENOENT") return undefined;
		throw new SafeFileUpdateError("io", `the document "${target}" could not be read: ${messageOf(error)}`);
	}
	try {
		return JSON.parse(text);
	} catch (error) {
		throw new SafeFileUpdateError(
			"corrupt",
			`the document "${target}" is not a JSON document: ${messageOf(error)}`,
		);
	}
}

/** Replaces the target with one complete document, through a same-directory temporary file. */
async function publish(target: string, key: string, text: string): Promise<void> {
	const temporary = temporaryName(key, "tmp");
	try {
		try {
			await fs.writeFile(temporary, text, { flag: "wx" });
		} catch (error) {
			throw new SafeFileUpdateError("io", `the document "${target}" could not be published: ${messageOf(error)}`);
		}
		// The one step a reader can refuse: while a reader holds the document open this platform
		// answers "in use", and the same step succeeds a moment later. The retry is bounded and
		// belongs to this single publication — a failure that is reported is never retried, and no
		// publication is left to a later attempt.
		for (let attempt = 1; ; attempt += 1) {
			try {
				await fs.rename(temporary, target);
				return;
			} catch (error) {
				const code = errorCodeOf(error);
				if (attempt >= IN_USE_ATTEMPTS || !IN_USE_CODES.includes(code ?? "")) {
					throw new SafeFileUpdateError(
						"io",
						`the document "${target}" could not be published: ${messageOf(error)}`,
					);
				}
				await sleep(IN_USE_RETRY_MS);
			}
		}
	} finally {
		await remove(temporary);
	}
}

/**
 * Installs this call's own lock under the lock name, or reports that the name is taken.
 *
 * The directory carrying the entry is prepared beside the target and renamed into place, so a
 * reader meets no lock or one complete lock, and the install is exclusive: of any number of calls
 * that try it, exactly one can win the name.
 */
async function tryInstallLock(lockPath: string, entry: string): Promise<boolean> {
	const prepared = temporaryName(lockPath, "lock");
	try {
		await fs.mkdir(prepared);
		await fs.writeFile(join(prepared, entry), "", { flag: "wx" });
		try {
			await fs.rename(prepared, lockPath);
			return true;
		} catch (error) {
			// A name that is already taken is no failure of its own: the reading this call takes next
			// decides whether it waits or recovers. Anything else is this platform refusing to install.
			if (TAKEN_CODES.includes(errorCodeOf(error) ?? "")) return false;
			throw error;
		}
	} finally {
		await remove(join(prepared, entry));
		await removeDirectory(prepared);
	}
}

/** What the lock name says: nobody holds it, one holder does, or it is no state this module wrote. */
type LockReading =
	| { readonly kind: "free" }
	| { readonly kind: "leftover" }
	| { readonly kind: "holder"; readonly pid: number; readonly entry: string }
	| { readonly kind: "unknown" };

/**
 * Reads what the lock name says now.
 *
 * A directory carrying exactly one entry that names its holder is a lock; one carrying no entry
 * is a leftover that holds nobody. Anything else — an entry this module did not write, several
 * entries, or no directory at all — is answered as unknown rather than guessed at.
 */
async function readLock(lockPath: string): Promise<LockReading> {
	let entries: string[];
	try {
		entries = await fs.readdir(lockPath);
	} catch (error) {
		return errorCodeOf(error) === "ENOENT" ? { kind: "free" } : { kind: "unknown" };
	}
	if (entries.length === 0) return { kind: "leftover" };
	if (entries.length > 1) return { kind: "unknown" };
	const entry = entries[0]!;
	const pid = holderPidOf(entry);
	return pid === undefined ? { kind: "unknown" } : { kind: "holder", pid, entry };
}

/**
 * Whether the process a lock names is still running: `false` only when the platform answers that
 * no such process exists, `true` when it exists, and `undefined` when the question cannot be
 * answered — and only `false` is evidence that a lock may be recovered.
 */
function holderLiveness(pid: number): boolean | undefined {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return errorCodeOf(error) === "ESRCH" ? false : undefined;
	}
}

/**
 * Removes the lock one holder confirmed gone left behind: that holder's own entry, and then the
 * directory it lived in, answering whether the lock name is free now.
 *
 * Neither step can touch whoever holds the lock now, however late this runs, and both are safe to
 * repeat. The entry is removed by the one name that acquisition took — a name no other
 * acquisition of this document ever writes — so a newer holder's entry is simply not there to
 * remove, and this answers that it removed nothing. The directory is removed by `rmdir`, which no
 * platform applies to a directory that still carries an entry, so a newer holder's lock cannot be
 * removed either.
 */
async function discardLock(lockPath: string, entry: string): Promise<boolean> {
	try {
		await fs.unlink(join(lockPath, entry));
	} catch (error) {
		const code = errorCodeOf(error);
		// A name the platform is not ready to remove is not a lock that cannot be recovered: this
		// answers that nothing was removed yet, and the caller's next turn tries again. A name that
		// is not there at all is the same answer, and the useful one when a peer got there first.
		if (code === "ENOENT" || IN_USE_CODES.includes(code ?? "")) return false;
		throw new SafeFileUpdateError(
			"io",
			`the recovered lock "${lockPath}" could not be removed: ${messageOf(error)}`,
		);
	}
	return removeDirectory(lockPath);
}

/**
 * Releases the lock this call took, and only that lock.
 *
 * The entry is removed by the one name this acquisition took, and only then is the directory
 * removed — which this platform refuses while an entry is still in it, so a newer holder's lock
 * cannot be removed by a release either. A removal the platform refuses for the moment, because
 * it still has that name open, is stepped over a bounded number of times: leaving the entry behind
 * would turn this call's own lock into one that blocks every later caller until this process exits.
 */
async function releaseLock(lockPath: string, entry: string): Promise<void> {
	for (let attempt = 1; ; attempt += 1) {
		try {
			await fs.unlink(join(lockPath, entry));
			break;
		} catch (error) {
			const code = errorCodeOf(error);
			if (code !== undefined && IN_USE_CODES.includes(code) && attempt < IN_USE_ATTEMPTS) {
				await sleep(IN_USE_RETRY_MS);
				continue;
			}
			// Gone already, or not this call's to remove: the directory removal below is still safe,
			// and an entry it cannot empty is a newer holder's lock rather than this call's.
			break;
		}
	}
	await removeDirectory(lockPath);
}

/** Acquires the cross-process lock, waiting and recovering until the budget runs out. */
async function acquireLock(
	lockPath: string,
	target: string,
	deadline: number,
	signal: AbortSignal | undefined,
): Promise<string> {
	const entry = holderName();
	let unknown = false;
	for (;;) {
		if (signal?.aborted) {
			throw new SafeFileUpdateError(
				"cancelled",
				`the update of "${target}" was cancelled while it waited for the lock "${lockPath}"`,
			);
		}
		let installed: boolean;
		try {
			installed = await tryInstallLock(lockPath, entry);
		} catch (error) {
			throw new SafeFileUpdateError("io", `the lock "${lockPath}" could not be created: ${messageOf(error)}`);
		}
		if (installed) return entry;

		const reading = await readLock(lockPath);
		unknown = reading.kind === "unknown";
		if (reading.kind === "leftover") {
			if (await removeDirectory(lockPath)) continue;
		} else if (reading.kind === "holder" && holderLiveness(reading.pid) === false) {
			if (await discardLock(lockPath, reading.entry)) continue;
		}

		// The lock is held, its state is not one this module wrote, or a recovery that ran could
		// not free the name: either way this call waits and takes its turn again.
		const remaining = deadline - performance.now();
		if (remaining <= 0) {
			throw unknown
				? new SafeFileUpdateError(
						"io",
						`the lock "${lockPath}" names no holder of "${target}", so the update cannot be coordinated`,
					)
				: new SafeFileUpdateError(
						"timeout",
						`the update of "${target}" waited out its budget without acquiring the lock "${lockPath}"`,
					);
		}
		await sleep(Math.min(WAIT_POLL_MS, remaining));
	}
}

/** Waits for this document's queue to reach this call, or reports the wait that ran out. */
async function untilTurn(
	previous: Promise<void>,
	target: string,
	budget: number,
	deadline: number,
	signal: AbortSignal | undefined,
): Promise<void> {
	for (;;) {
		if (signal?.aborted) {
			throw new SafeFileUpdateError(
				"cancelled",
				`the update of "${target}" was cancelled while it waited for an earlier update of the same document`,
			);
		}
		const remaining = deadline - performance.now();
		if (remaining <= 0) {
			throw new SafeFileUpdateError(
				"timeout",
				`the update of "${target}" waited its whole ${budget}ms budget for an earlier update of the same document`,
			);
		}
		const won = await Promise.race([
			previous.then(() => true),
			sleep(Math.min(WAIT_POLL_MS, remaining)).then(() => false),
		]);
		if (won) return;
	}
}

/**
 * Takes this call's place in its document's in-process queue and returns the way to give it up.
 *
 * Entry order is submission order: the call runs after every earlier call of the same document,
 * and a predecessor that failed, timed out or was cancelled releases its place just the same, so
 * no failure is inherited by the calls behind it. Giving up the last place empties the key, so a
 * document nobody is updating holds no queue.
 */
async function enterQueue(
	key: string,
	target: string,
	budget: number,
	deadline: number,
	signal: AbortSignal | undefined,
): Promise<() => void> {
	const queues = fileCoordination().queues;
	const previous = queues.get(key)?.tail ?? Promise.resolve();
	const { promise: mine, resolve: release } = Promise.withResolvers<void>();
	const tail = previous.then(() => mine);
	queues.set(key, { tail });
	const leave = (): void => {
		release();
		if (queues.get(key)?.tail === tail) queues.delete(key);
	};
	try {
		await untilTurn(previous, target, budget, deadline, signal);
	} catch (error) {
		leave();
		throw error;
	}
	return leave;
}

/**
 * Updates one document: read the current value inside the coordination scope, hand it to
 * `update`, and publish what `update` returns.
 *
 * This is the call shared logic imports; it is the module's whole published surface, async
 * because the file work is, and it holds no synchronous twin. See the module comment above for
 * the target's meaning, the coordination and wait rules, and what each failure kind means.
 */
export async function updateFile<T>(
	target: string,
	update: (current: unknown) => T | Promise<T>,
	options: SafeFileUpdateOptions = {},
): Promise<T> {
	const submission = beginSubmission(target);
	let key: string;
	let budget: number;
	let deadline: number;
	try {
		budget = resolveBudget(options.timeoutMs);
		// The budget runs from submission, before the key's own resolution: a call that waited a
		// long time behind other resolutions has already spent part of its wait.
		deadline = performance.now() + budget;
		key = await submission.key;
	} finally {
		submission.done();
	}
	const leaveQueue = await enterQueue(key, target, budget, deadline, options.signal);
	const lockPath = `${key}.lock`;
	try {
		const lock = await acquireLock(lockPath, target, deadline, options.signal);
		try {
			const current = await readDocument(target);
			const next = await update(current);
			await publish(target, key, serialize(target, next));
			return next;
		} finally {
			await releaseLock(lockPath, lock);
		}
	} finally {
		leaveQueue();
	}
}
