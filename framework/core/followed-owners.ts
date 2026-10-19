/**
 * The owners one store follows: the declared values of an Owner another process serves, read
 * through the framework's local access, and what a reader gets while that access is not there.
 *
 * A field that declares `follow` makes a subagent session read its Owner's *current* value, and
 * when the harness spawned that session in another process the Owner's cell is not in this one.
 * This module is the reading half of the framework's local access: one seat's access is opened
 * once and then kept, the declaring process pushes every later change over it, and a read answers
 * from what that access last stated.
 *
 * Three things are deliberately not here. A value is never written: this module reads, so a
 * default read here cannot reach the Owner's cell or the reader's own persistence medium, and no
 * access is offered or withdrawn by it. A read never waits: the framework's semantic use points
 * read synchronously, so an owner whose access is not there yet reads as the field's declared
 * default and is picked up on a later read — the degraded read is not a measurement of the Owner's
 * value and is not presented as one. A use point that can afford to wait may ask for the *first*
 * attempt explicitly with `prepare`; that waits for the one bounded opening the policy already
 * allows, joins an opening a synchronous read already started, and adds no attempt of its own after
 * the first has settled. Nothing polls either way: an access that is connected is left alone (its
 * changes arrive by themselves), while one that is not is tried again only when a later read asks,
 * with a spacing that grows to a ceiling so an owner that is not served is not hammered.
 *
 * Life is explicit. An access that reports itself ended is spent and never reused, and the next
 * read (past the spacing) opens a fresh one; a read through a spent access answers nothing rather
 * than a value that access can no longer stand behind. `dispose` ends every access this module
 * holds and stops the recovery for good: a store that has released its follows reads nothing and
 * opens nothing afterwards, so a session this process no longer runs keeps no connection alive.
 */
import type { OwnerAccessCaller, OwnerAccessValues } from "../modules/local-access";

/**
 * What one attempt spends and how the attempts are spaced.
 *
 * `waitMs` is the whole budget one open may spend on a seat that is not there yet — a bounded wait,
 * never an unbounded one. `baseMs` is the delay before an owner is tried again after a failed
 * attempt, and it doubles with each consecutive failure until `maxMs`, which is where it stops
 * growing.
 */
export interface FollowedAccessPolicy {
	readonly waitMs: number;
	readonly baseMs: number;
	readonly maxMs: number;
}

/** The policy the framework's own follows run under when the assembly states none. */
export const DEFAULT_FOLLOWED_ACCESS_POLICY: FollowedAccessPolicy = { waitMs: 2000, baseMs: 250, maxMs: 8000 };

/**
 * How one store reaches an owner another process serves.
 *
 * `open` is the local access's own reading half — the same call a process makes to read the seat
 * an adapter published, with this extension's identity and the owner's key as the target. It
 * rejects when the seat could not be reached; a rejection is a transport outcome, never a
 * statement about the owner's own life, and it is this module's spacing that decides when the seat
 * is tried again.
 */
export interface FollowedAccessReader {
	open(owner: string, options: { readonly waitMs: number }): Promise<OwnerAccessCaller>;
	/** The budget and spacing this reader's attempts run under; omitted, the framework's own apply. */
	readonly policy?: FollowedAccessPolicy;
}

/** One followed owner, as this process holds it. */
interface FollowedOwner {
	/** What the owner's access last stated, by field: the values a read answers from. */
	values: OwnerAccessValues;
	caller?: OwnerAccessCaller;
	stopObserving?: () => void;
	/** Whether an attempt is in flight: concurrent reads of one owner share it rather than add one. */
	opening: boolean;
	/** The first attempt's completion while it is still running: what `prepare` joins. */
	firstAttempt?: Promise<void>;
	/** Whether the first attempt was ever started, so `prepare` never starts another one. */
	firstStarted: boolean;
	/** Whether the first attempt has finished its bookkeeping, including a synchronous opener throw. */
	firstSettled: boolean;
	/** Consecutive failed attempts, which is what the spacing is derived from. */
	failures: number;
	/** The earliest moment a later attempt may start; zero while nothing failed. */
	waitingUntil: number;
}

/**
 * The followed owners of one store.
 *
 * One instance belongs to one store, so a read names the owner it is about and the field it wants
 * and nothing else: which extension's access is opened is the reader's own business, and this
 * module never resolves an owner, a session or a field.
 */
export class FollowedOwners {
	readonly #reader: FollowedAccessReader;
	readonly #policy: FollowedAccessPolicy;
	readonly #owners = new Map<string, FollowedOwner>();
	#disposed = false;

	constructor(reader: FollowedAccessReader) {
		this.#reader = reader;
		this.#policy = reader.policy ?? DEFAULT_FOLLOWED_ACCESS_POLICY;
	}

	/**
	 * The value this process last heard for one owner's field, or `undefined` when it has heard none.
	 *
	 * The read is also what keeps the access up: an owner with no live access is opened here (or its
	 * failure recorded, which is what spaces the next attempt), a live one is left alone, and one
	 * whose access has ended is let go. Nothing about the read reaches the owner.
	 */
	read(owner: string, field: string): boolean | undefined {
		if (this.#disposed) return undefined;
		const followed = this.#owners.get(owner) ?? this.#follow(owner);
		this.#attempt(owner, followed);
		const value = followed.values[field];
		return typeof value === "boolean" ? value : undefined;
	}

	/**
	 * Waits for one owner's *first* attempt at its access, if that attempt is still in flight or has
	 * not started yet; `undefined` once it has settled, or after this module is disposed.
	 *
	 * A synchronous read may already have started the attempt; this joins it rather than opening a
	 * second one, and concurrent calls share the same completion. With no attempt started yet it
	 * starts exactly one, spending the policy's bounded `waitMs`. Success means the values are now
	 * ready to be read; failure is not surfaced as an error — the read keeps answering the declared
	 * default, and every later attempt remains the read's own spaced recovery. Prepare never retries,
	 * never waits a second time once the first attempt has settled, and never adds another attempt; a
	 * late resolution after `dispose` is released instead of becoming the store's values.
	 */
	prepare(owner: string): Promise<void> | undefined {
		if (this.#disposed) return undefined;
		const followed = this.#owners.get(owner);
		if (followed !== undefined) return followed.firstSettled ? undefined : followed.firstAttempt;
		const started = this.#follow(owner);
		this.#attempt(owner, started);
		return started.firstSettled ? undefined : started.firstAttempt;
	}

	/**
	 * Whether this store has read one owner through an access: the owners it chased, reached or not.
	 *
	 * A failed attempt counts, because what the question is about is whether this value comes from
	 * somewhere else — an owner this store never read at all is not one it follows.
	 */
	follows(owner: string): boolean {
		return this.#owners.has(owner);
	}

	/**
	 * Ends every access this module holds and stops following for good.
	 *
	 * The accesses are released here rather than left to the process's exit, so a session that
	 * reloaded, quit or transferred leaves no connection to the process that served its owner; and
	 * the module is spent afterwards, so no later read opens one again.
	 */
	dispose(): void {
		if (this.#disposed) return;
		this.#disposed = true;
		for (const followed of this.#owners.values()) this.#release(followed);
		this.#owners.clear();
	}

	/** The record one owner is followed through, created on its first read or prepare. */
	#follow(owner: string): FollowedOwner {
		const followed: FollowedOwner = {
			values: {},
			opening: false,
			firstStarted: false,
			firstSettled: false,
			failures: 0,
			waitingUntil: 0,
		};
		this.#owners.set(owner, followed);
		return followed;
	}

	/**
	 * Starts an attempt at one owner's access unless one is already running, the owner is connected
	 * or the spacing has not passed. An ended access is let go first: it is spent, and a later
	 * attempt is a new access rather than a revived one.
	 */
	#attempt(owner: string, followed: FollowedOwner): void {
		const caller = followed.caller;
		if (caller !== undefined) {
			if (!caller.ended()) return;
			this.#release(followed);
		}
		if (followed.opening || Date.now() < followed.waitingUntil) return;
		followed.opening = true;
		const first = !followed.firstStarted;
		if (first) followed.firstStarted = true;
		const attempt = this.#open(owner, followed, first);
		if (first && !followed.firstSettled) followed.firstAttempt = attempt;
		void attempt;
	}

	/** One attempt: the access it reaches is kept and observed, and its failure is what spaces the next. */
	async #open(owner: string, followed: FollowedOwner, first: boolean): Promise<void> {
		try {
			const caller = await this.#reader.open(owner, { waitMs: this.#policy.waitMs });
			if (this.#disposed || !this.#owners.has(owner)) {
				// The store gave this follow up while the seat was being reached: the access is
				// released here rather than kept by a module that no longer follows anything.
				caller.dispose();
				return;
			}
			followed.caller = caller;
			followed.failures = 0;
			followed.waitingUntil = 0;
			followed.values = caller.values();
			// Every later change arrives on the access itself; a store that is connected asks for
			// nothing and is never polled.
			followed.stopObserving = caller.observe((field, value) => {
				followed.values = { ...followed.values, [field]: value };
			});
		} catch {
			// The attempt failed: the read keeps answering the declared default, and the next one is
			// spaced. Nothing is replayed, retried in a loop or reported as a successful read.
			followed.failures += 1;
			followed.waitingUntil = Date.now() + this.#spacing(followed.failures);
		} finally {
			followed.opening = false;
			// Only the first attempt is what `prepare` can wait for; once it has settled, recovery is
			// the reads' own and a prepare adds neither a wait nor another attempt.
			if (first) {
				followed.firstSettled = true;
				followed.firstAttempt = undefined;
			}
		}
	}

	/** The delay after one failed attempt: the base doubled per consecutive failure, up to the ceiling. */
	#spacing(failures: number): number {
		const grown = this.#policy.baseMs * 2 ** Math.min(failures - 1, 32);
		return Math.min(grown, this.#policy.maxMs);
	}

	/** Lets one owner's access go: its observations, its connection and the values it stated. */
	#release(followed: FollowedOwner): void {
		followed.stopObserving?.();
		followed.stopObserving = undefined;
		followed.caller?.dispose();
		followed.caller = undefined;
		followed.values = {};
	}
}
