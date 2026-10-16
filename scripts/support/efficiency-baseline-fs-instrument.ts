/**
 * The file-system instrument the efficiency baseline samples the common path through.
 *
 * It is loaded as a preload (`bun --preload`), so this runtime's own `fs` and `fs/promises` exports
 * are wrapped before any repository module is evaluated: every read, lock, staging and publish the
 * framework's file coordination performs is recorded with the operation that was called and the
 * path it was called with. Those records are the file cost the baseline compares; nothing in the
 * repository is modified to produce them, no seam is added to production and nothing here runs
 * outside one sampling process.
 *
 * Only operation calls are wrapped, and every wrapper forwards to the real call unchanged, so what
 * the repository observes is this runtime's own file system. A synchronous export a runtime hands
 * out by value rather than by reference cannot be instrumented this way; the sampling run's own
 * start-up check and self-check (`scripts/efficiency-baseline.ts`) state whether this instrument ran
 * before the repository loaded and which half was really recorded, and the record keeps the two
 * halves apart rather than adding them.
 *
 * The records live on the process global under a `Symbol.for` key, so the preload and the sampling
 * entry agree on them by name without sharing a module instance.
 */

/** One operation as this instrument records it, whose outcome its own call completes afterwards. */
interface RecordedOperation {
	/** The called member's name, as `node:fs`/`node:fs/promises` spells it. */
	readonly op: string;
	/** `async` for the promises API, `sync` for the callbacks-and-sync API. */
	readonly phase: "async" | "sync";
	/** The path the call named, as the call named it; `<non-path>` for a call that named none. */
	readonly path: string;
	/**
	 * The second path of a two-path call — the destination of a rename or a copy, which is the name a
	 * publication or a lock install is aimed at — or absent for every other call.
	 */
	readonly target?: string;
	/**
	 * Whether the call settled without throwing, filled in as soon as it did.
	 *
	 * A publication is the one step this platform refuses while a reader holds the name open, and the
	 * coordinating module retries it: the attempts are all recorded calls, while only the ones that
	 * really replaced the name are publications. Absent while an asynchronous call has not settled.
	 */
	outcome?: "ok" | "failed";
}

/** One operation as a reader of the records sees it: the call, its paths, and its outcome. */
export type FsOperation = Readonly<RecordedOperation>;

/** What one instrumented process records. */
interface InstrumentedScope {
	readonly operations: RecordedOperation[];
}

/** The process global's one entry for this instrument. */
const OPERATIONS_KEY: unique symbol = Symbol.for("my-agent-toolkit.efficiency-baseline.fs-operations");

/** The process global, narrowed to the one entry this instrument reads and writes. */
interface OperationsScope {
	[OPERATIONS_KEY]?: unknown;
}

/** Whether one value read off the process global is this instrument's record list. */
function isInstrumentedScope(value: unknown): value is InstrumentedScope {
	if (typeof value !== "object" || value === null || !("operations" in value)) return false;
	return Array.isArray(value.operations);
}

/** The one record list of this process, created on first use. */
function scope(): InstrumentedScope {
	// Reason: the process global is this instrument's own agreement point by name, so the read is a
	// boundary cast the way the framework's own `Symbol.for` scopes are.
	const holder = globalThis as OperationsScope;
	const registered = holder[OPERATIONS_KEY];
	if (isInstrumentedScope(registered)) return registered;
	const created: InstrumentedScope = { operations: [] };
	holder[OPERATIONS_KEY] = created;
	return created;
}

/** The path one operation call named, as the call stated it. */
function pathOf(args: readonly unknown[]): string {
	const first = args[0];
	if (typeof first === "string") return first;
	if (first instanceof URL) return first.href;
	if (first instanceof Uint8Array) return Buffer.from(first).toString("utf8");
	return "<non-path>";
}

/** The members one module instance's operations are wrapped through. */
const PROMISE_OPERATIONS = [
	"access",
	"appendFile",
	"chmod",
	"copyFile",
	"mkdir",
	"open",
	"readFile",
	"readdir",
	"realpath",
	"rename",
	"rm",
	"rmdir",
	"stat",
	"lstat",
	"truncate",
	"unlink",
	"writeFile",
] as const;

/** The synchronous members of the same module family. */
const SYNC_OPERATIONS = [
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
	"rmdirSync",
	"statSync",
	"lstatSync",
	"truncateSync",
	"unlinkSync",
	"writeFileSync",
] as const;

/**
 * The members whose call names two paths, the second being the name the operation is aimed at: the
 * destination of a rename or a copy, which is what makes a publish and a lock install recognizable.
 */
const TWO_PATH_OPERATIONS: Readonly<Record<string, true>> = {
	rename: true,
	renameSync: true,
	copyFile: true,
	copyFileSync: true,
	cp: true,
	cpSync: true,
	link: true,
	linkSync: true,
};

/** The mark this instrument leaves on a member it already wrapped, so no call is ever counted twice. */
const INSTRUMENT_MARK: unique symbol = Symbol.for("my-agent-toolkit.efficiency-baseline.instrumented");

/**
 * Wrap one module instance's operation calls so each one is recorded before it runs.
 *
 * A member that is not a function of the shape this instrument expects is left exactly as it was:
 * the instrument never replaces a call it cannot forward, and a wrapper always forwards this
 * runtime's own call. A member this instrument already wrapped is left alone, so a process that
 * loaded this module twice records each call once.
 */
function wrapOperations(instance: unknown, names: readonly string[], phase: "async" | "sync"): void {
	if (typeof instance !== "object" || instance === null) return;
	// Reason: a module namespace is a plain object of callable members; forwarding a member this
	// instrument cannot type is the whole point of the wrapper, and nothing here invents a shape.
	const module = instance as Record<string, unknown>;
	for (const name of names) {
		const real = module[name];
		if (typeof real !== "function") continue;
		if (INSTRUMENT_MARK in real) continue;
		const forward = real as (...args: unknown[]) => unknown;
		const twoPath = TWO_PATH_OPERATIONS[name] === true;
		const wrapper = function instrumented(...args: unknown[]): unknown {
			const target = twoPath && args.length > 1 ? pathOf(args.slice(1)) : undefined;
			const record: RecordedOperation = {
				op: name,
				phase,
				path: pathOf(args),
				...(target === undefined ? {} : { target }),
			};
			scope().operations.push(record);
			try {
				const result = forward.apply(module, args);
				if (phase === "sync") {
					record.outcome = "ok";
					return result;
				}
				if (result === null || typeof result !== "object" || !("then" in result)) {
					record.outcome = "ok";
					return result;
				}
				// An asynchronous call's outcome is what its own promise settles as, so a rename this
				// platform refused is never counted as a replacement that happened.
				const settled = result as Promise<unknown>;
				settled.then(
					() => {
						record.outcome = "ok";
					},
					() => {
						record.outcome = "failed";
					},
				);
				return result;
			} catch (error) {
				record.outcome = "failed";
				throw error;
			}
		};
		// Reason: the mark is this instrument's own bookkeeping on a value it just built.
		(wrapper as unknown as Record<symbol, unknown>)[INSTRUMENT_MARK] = true;
		module[name] = wrapper;
	}
}

wrapOperations(require("node:fs/promises"), PROMISE_OPERATIONS, "async");
wrapOperations(require("node:fs"), SYNC_OPERATIONS, "sync");

// This process's record list exists from the instrument's own load, so an accessor's `undefined`
// really means "no instrument ran here" rather than "nothing was recorded yet".
scope();

/**
 * Every operation recorded by an instrument that already ran in this process, or `undefined` when
 * no instrument ran before this call.
 *
 * The sampling entry calls this as its own first statement: the instrument is a preload, so a
 * `undefined` answer here means the run would sample a process nothing was recording — the one
 * failure mode a baseline must never pass silently.
 */
export function recordedFsOperations(): readonly FsOperation[] | undefined {
	// Reason: the same agreement point `scope()` reads, cast for the same reason it is.
	const holder = globalThis as OperationsScope;
	const registered = holder[OPERATIONS_KEY];
	return isInstrumentedScope(registered) ? registered.operations : undefined;
}

/**
 * Whether the calls one module namespace exposes are the ones this instrument wrapped.
 *
 * This is the check a caller that *demands* a count makes before it trusts one: a module namespace is
 * bound to the functions the module held when it was first reached, so a namespace carrying this
 * module's own wrapper is a process the instrument was preloaded into, while a namespace reached
 * before any wrap — or after a wrap that no already-bound consumer sees — is a process whose calls
 * are going unrecorded. A zero count is only evidence of no work in the first case; in the second it
 * is evidence of no instrument, which is why both answers are checkable rather than assumed.
 */
export function namespaceInstrumented(namespace: unknown): boolean {
	if (typeof namespace !== "object" || namespace === null) return false;
	// Reason: a module namespace is a plain object of members; the mark below is what this module puts
	// on the functions it wrapped, and it is the only thing this check asks about.
	const readFile = (namespace as Record<string, unknown>).readFile;
	return typeof readFile === "function" && INSTRUMENT_MARK in readFile;
}
