/**
 * The first waiting use of a followed Owner, at the reading module's own seam (P15, P16).
 *
 * A synchronous read never waits: before its first access lands it answers the declared default,
 * and the opening it started runs on. What these cases add is the one place a caller *may* wait —
 * `prepare` — and the rules around it: it waits for the first attempt only, joins an attempt a
 * synchronous read already started, shares that completion with every concurrent use, and is a
 * synchronous no-op once the attempt has settled. Failure is not retried or reported by it; recovery
 * remains the later reads' own spaced attempt. Disposal is final: a connection that lands after the
 * store released its follows is released, never read from.
 *
 * The seat is a deferred double so the ordering is the case's, not a duration's; the clock is the
 * suite's own where the spaced recovery is asserted.
 */
import { afterEach, describe, expect, test, vi } from "bun:test";
import {
	type FollowedAccessPolicy,
	type FollowedAccessReader,
	FollowedOwners,
} from "../../framework/core/followed-owners";
import type { OwnerAccessCaller, OwnerAccessValues } from "../../framework/modules/local-access";

/** The declared field under test, and the owner every case follows. */
const FIELD = "enabled";
const OWNER = "main:readiness-owner";

/** The policy every case states: a bounded open, and a spacing the fake clock can cross. */
const POLICY: FollowedAccessPolicy = { waitMs: 2000, baseMs: 25, maxMs: 100 };

/** One connection a seat hands the reader, driven the way both directions of an access are. */
class AccessConnection implements OwnerAccessCaller {
	readonly #observers = new Set<(field: string, value: boolean) => void>();
	#values: OwnerAccessValues;
	#ended = false;
	/** How many times this connection was released, which is one of the effects a case counts. */
	disposed = 0;
	/** How many declared reads were asked of it: a healthy access is never polled. */
	requested = 0;

	constructor(values: OwnerAccessValues) {
		this.#values = values;
	}

	values(): OwnerAccessValues {
		return this.#values;
	}

	request(field: string): Promise<boolean | undefined> {
		this.requested += 1;
		return Promise.resolve(this.#values[field]);
	}

	observe(listener: (field: string, value: boolean) => void): () => void {
		this.#observers.add(listener);
		return () => {
			this.#observers.delete(listener);
		};
	}

	deliver(): void {}

	ended(): boolean {
		return this.#ended;
	}

	dispose(): void {
		this.disposed += 1;
		this.#ended = true;
	}

	/** The serving process stating a later value: what the access pushes over the connection. */
	changed(field: string, value: boolean): void {
		this.#values = { ...this.#values, [field]: value };
		for (const listener of [...this.#observers]) listener(field, value);
	}
}

/** One opening the reader was asked for, held open until the case says what it reached. */
interface PendingOpen {
	readonly owner: string;
	readonly waitMs: number;
	resolve(caller: OwnerAccessCaller): void;
	reject(reason: Error): void;
}

/** A seat that records every opening and answers it only when the case chooses. */
class DeferredOpens implements FollowedAccessReader {
	readonly policy: FollowedAccessPolicy;
	readonly opens: PendingOpen[] = [];
	/** Every attempt's promise, so a case can wait for the module's own continuation. */
	readonly attempts: Array<Promise<OwnerAccessCaller>> = [];

	constructor(policy: FollowedAccessPolicy) {
		this.policy = policy;
	}

	open(owner: string, options: { readonly waitMs: number }): Promise<OwnerAccessCaller> {
		const attempt = new Promise<OwnerAccessCaller>((resolve, reject) => {
			this.opens.push({ owner, waitMs: options.waitMs, resolve, reject });
		});
		this.attempts.push(attempt);
		return attempt;
	}

	get latest(): PendingOpen {
		const open = this.opens[this.opens.length - 1];
		if (open === undefined) throw new Error("no opening was asked for");
		return open;
	}
}

/** Waits for every attempt the module has started to conclude, including its own continuation. */
async function landed(opens: DeferredOpens): Promise<void> {
	await Promise.allSettled(opens.attempts);
	await Promise.resolve();
}

afterEach(() => {
	vi.useRealTimers();
});

describe("a first use that waits (P15, P16)", () => {
	test("a prepare with no read before it answers the Owner's value once the first access lands", async () => {
		const opens = new DeferredOpens(POLICY);
		const owners = new FollowedOwners(opens);

		const readiness = owners.prepare(OWNER);
		expect(readiness).toBeDefined();
		expect(opens.opens).toHaveLength(1);
		expect(opens.latest.owner).toBe(OWNER);
		expect(opens.latest.waitMs).toBe(POLICY.waitMs);

		// The synchronous read does not wait for that opening: it answers the declared default.
		expect(owners.read(OWNER, FIELD)).toBeUndefined();

		const connection = new AccessConnection({ [FIELD]: true });
		opens.latest.resolve(connection);
		await readiness;

		// The first attempt settled successfully, so the read answers its value and a later prepare
		// is synchronous and starts nothing else.
		expect(owners.read(OWNER, FIELD)).toBe(true);
		expect(owners.prepare(OWNER)).toBeUndefined();
		expect(owners.read(OWNER, FIELD)).toBe(true);
		expect(opens.opens).toHaveLength(1);
		expect(connection.requested).toBe(0);

		// The access stays the live one: every later change is pushed, never requested or reopened.
		connection.changed(FIELD, false);
		expect(owners.read(OWNER, FIELD)).toBe(false);
		expect(owners.read(OWNER, FIELD)).toBe(false);
		expect(connection.requested).toBe(0);
		expect(opens.opens).toHaveLength(1);
	});

	test("a prepare joins the first attempt a synchronous read already started", async () => {
		const opens = new DeferredOpens(POLICY);
		const owners = new FollowedOwners(opens);

		// The semantic use point read first, synchronously, and its bounded attempt is in flight.
		expect(owners.read(OWNER, FIELD)).toBeUndefined();
		expect(opens.opens).toHaveLength(1);

		// Every concurrent first use waits on that same attempt rather than earning another one.
		const first = owners.prepare(OWNER);
		const second = owners.prepare(OWNER);
		expect(first).toBeDefined();
		expect(second).toBe(first);
		expect(opens.opens).toHaveLength(1);

		opens.latest.resolve(new AccessConnection({ [FIELD]: true }));
		await Promise.all([first, second]);
		expect(owners.read(OWNER, FIELD)).toBe(true);
		expect(opens.opens).toHaveLength(1);
	});

	test("a first attempt that fails leaves the default, and later reads recover without another prepare wait", async () => {
		vi.useFakeTimers();
		const opens = new DeferredOpens(POLICY);
		const owners = new FollowedOwners(opens);

		const readiness = owners.prepare(OWNER);
		expect(readiness).toBeDefined();
		expect(opens.opens).toHaveLength(1);
		expect(opens.latest.waitMs).toBe(POLICY.waitMs);
		opens.latest.reject(new Error("the bounded open found no seat"));
		await readiness;

		// Failure is not rethrown and is not a measurement: the read keeps its declared default.
		expect(owners.read(OWNER, FIELD)).toBeUndefined();

		// Once the first attempt has settled, prepare neither waits nor retries — however often it is
		// asked, and even while the failure's spacing is still running.
		expect(owners.prepare(OWNER)).toBeUndefined();
		expect(owners.prepare(OWNER)).toBeUndefined();
		expect(opens.opens).toHaveLength(1);
		expect(owners.read(OWNER, FIELD)).toBeUndefined();
		expect(opens.opens).toHaveLength(1);

		// The recovery is the later read's own spaced attempt, with the same bounded budget.
		vi.advanceTimersByTime(POLICY.baseMs);
		expect(owners.read(OWNER, FIELD)).toBeUndefined();
		expect(opens.opens).toHaveLength(2);
		expect(opens.latest.owner).toBe(OWNER);
		expect(opens.latest.waitMs).toBe(POLICY.waitMs);
		opens.latest.resolve(new AccessConnection({ [FIELD]: true }));
		await landed(opens);

		expect(owners.read(OWNER, FIELD)).toBe(true);
		expect(owners.prepare(OWNER)).toBeUndefined();
		expect(opens.opens).toHaveLength(2);
	});

	test("an access that lands after disposal is released and never becomes the store's value", async () => {
		const opens = new DeferredOpens(POLICY);
		const owners = new FollowedOwners(opens);

		const readiness = owners.prepare(OWNER);
		expect(readiness).toBeDefined();
		expect(owners.read(OWNER, FIELD)).toBeUndefined();
		owners.dispose();

		const late = new AccessConnection({ [FIELD]: true });
		opens.latest.resolve(late);
		await readiness;

		// The late connection is released rather than observed: it never populates a value, and the
		// spent store starts no access of its own.
		expect(late.disposed).toBe(1);
		expect(late.requested).toBe(0);
		expect(owners.read(OWNER, FIELD)).toBeUndefined();
		expect(owners.follows(OWNER)).toBe(false);
		expect(owners.prepare(OWNER)).toBeUndefined();
		await landed(opens);
		expect(opens.opens).toHaveLength(1);
	});
});
