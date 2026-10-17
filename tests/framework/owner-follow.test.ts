/**
 * The followed State read at the framework's public adapter seam (S1; contract P14, P15, P16, P17).
 *
 * A field that declares `follow` makes a subagent session read its Owner's *current* value. Where
 * this process holds that Owner the read is its own cell and nothing else happens; where another
 * process serves it, the value is the one that process's access states — and this suite drives the
 * reading half the way a harness assembly wires it, so what is observed is the framework's public
 * consumption (the injected prompt of a run initiation, the marker area, the capability a session
 * handler may retain) rather than an internal call.
 *
 * The seat is a double, because what is under test here is the framework's own rule and its own
 * spacing; the carrier and the two processes are the next suite's
 * (`owner-follow-processes.test.ts`), which reaches a real serving process over a real named pipe or
 * socket file. The policy this suite injects is the production mechanism run at test speed — a
 * bounded open, a delay that doubles per consecutive failure and a ceiling — and the clock is the
 * suite's own, so the shape of the recovery is asserted exactly rather than waited for.
 *
 * A run initiation is the framework's one awaitable semantic use: its first use of a followed
 * owner waits for that owner's one bounded open before it plans the contribution, while every
 * later read stays synchronous and picks up a recovered access on a later read.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "bun:test";
import * as path from "node:path";
import { CODEBASE_TOOLS } from "../../extensions/codebase-tools/definition";
import type { FollowedAccessPolicy, FollowedAccessReader } from "../../framework/core/followed-owners";
import type { OwnerCapabilityHandle } from "../../framework/core/protocol";
import {
	LocalAccessUnavailableError,
	localOwnerAccess,
	type OwnerAccessCaller,
	type OwnerAccessValues,
} from "../../framework/modules/local-access";
import { type ExtensionDefinition, defineExtension } from "../../framework/public";
import { REPO_ROOT } from "../harness-dock/baseline";
import { type PortDouble, portDouble } from "./support/harness-port-double";
import { boundPiSurface } from "./support/pi-surface-double";
import { sessionFileDir } from "./support/pi-session-files";

/** The child entry the pi assemblies below state: the module the provider loads into spawned sessions. */
const CHILD_ENTRY = path.join(REPO_ROOT, "entrypoints", "pi", "codebase-tools.ts");

/** The line the codebase-tools assembly projects for a seat its field reads as active. */
const MARKER_LINE = CODEBASE_TOOLS.marker?.text ?? "";

/** The declared field every probe owns, and the one a served seat states. */
const FIELD = "enabled";

/** The owner a subagent session resolves: `inherited` names the session that owns the value. */
const FOLLOWED = { kind: "inherited", key: "main:owner-session" } as const;

/** The same owner as the session that is itself the owner reads it. */
const OWNER = { kind: "owner", key: "main:owner-session" } as const;

/** An owning main session this process holds, as a delivery reports it. */
const MAIN_SESSION = { sessionId: "owner-session", kind: "main" as const, name: "owner", unavailable: [] };

/** The subagent session that follows it, as its own delivery reports it. */
const CHILD_SESSION = {
	sessionId: "session-child",
	kind: "sub" as const,
	parentSessionId: "owner-session",
	name: "child",
	unavailable: [],
};

/** A `follow` field with the three public consumption points: an injected slot, a toggle and a line. */
const FOLLOW_PROBE: ExtensionDefinition = defineExtension({
	id: "follow-probe",
	displayName: "followProbe",
	state: { inheritance: "follow" },
	commands: [{ type: "toggle", name: "follow-probe", state: FIELD, description: "toggle the probe" }],
	prompts: [{ tag: "init", strategy: "first-enabled-run", content: "the probe's contribution" }],
	marker: { text: "◈ followProbe" },
});

/** The same extension with the default inheritance: a subagent reads the declared default. */
const NONE_PROBE: ExtensionDefinition = defineExtension({
	id: "none-probe",
	displayName: "noneProbe",
	commands: [{ type: "toggle", name: "none-probe", state: FIELD, description: "toggle the probe" }],
	prompts: [{ tag: "init", strategy: "first-enabled-run", content: "the probe's contribution" }],
	marker: { text: "◈ noneProbe" },
});

// What spaces the framework's recovery is a delay measured against the clock, so the suite runs on
// its own: virtual milliseconds advance exactly when a case says they do.
beforeEach(() => {
	vi.useFakeTimers();
});
afterEach(() => {
	vi.useRealTimers();
});

/** One connection an access hands a reader, driven the way the serving half drives it. */
class SeatConnection implements OwnerAccessCaller {
	readonly #observers = new Set<(field: string, value: boolean) => void>();
	#values: OwnerAccessValues;
	#ended = false;
	/** How many times this connection was released, which is one of the effects a case counts. */
	disposed = 0;
	/** How many declared reads were asked of it: a healthy access is never polled, so this stays zero. */
	requested = 0;

	constructor(initial: boolean) {
		this.#values = { [FIELD]: initial };
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

	/**
	 * The observation direction of this connection: what a session in this process delivers to the
	 * process that serves the seat. This double models a reading side that delivers nothing, so a
	 * reading handed over here is dropped exactly as one is over an access that admits none.
	 */
	deliver(): void {}

	ended(): boolean {
		return this.#ended;
	}

	dispose(): void {
		this.disposed += 1;
		this.#ended = true;
	}

	/** The declaring process changing the value: what the real access pushes over the connection. */
	changed(value: boolean): void {
		this.#values = { [FIELD]: value };
		for (const listener of [...this.#observers]) listener(FIELD, value);
	}

	/** The connection going away: the seat withdrawn, or the connection lost. */
	dropped(): void {
		this.#ended = true;
	}
}

/** One seat a process serves, as the reading side meets it. */
class ServedSeat {
	/** Every open this reader made, when it was made and with the whole budget it was given. */
	readonly opens: Array<{ readonly owner: string; readonly waitMs: number; readonly at: number }> = [];
	/** Every attempt this reader was asked for, so a case can wait for the one it just started. */
	readonly attempts: Array<Promise<unknown>> = [];
	readonly connections: SeatConnection[] = [];
	value: boolean;
	/** Whether the seat is being served at all: an open is refused while it is not. */
	reachable = true;
	/**
	 * Whether an unreachable open stays pending until a case expires it, which is how a bounded wait
	 * that ran out is observed: the run cannot answer while the first open is still in flight, and
	 * the case settles it exactly when the wait would have.
	 */
	holdsOpen = false;
	#heldOpen: { reject(error: LocalAccessUnavailableError): void } | undefined;

	constructor(value: boolean) {
		this.value = value;
	}

	/** Ends the held open as an expired bounded wait. */
	expireOpen(): boolean {
		const held = this.#heldOpen;
		this.#heldOpen = undefined;
		if (held === undefined) return false;
		held.reject(new LocalAccessUnavailableError("no-location", "the bounded wait expired"));
		return true;
	}

	/** The reading half one assembly hands its store, with the policy a case states. */
	reader(policy?: FollowedAccessPolicy): FollowedAccessReader {
		return {
			...(policy === undefined ? {} : { policy }),
			open: (owner, options) => {
				this.opens.push({ owner, waitMs: options.waitMs, at: Date.now() });
				const attempt = this.reachable
					? Promise.resolve(new SeatConnection(this.value))
					: this.holdsOpen
						? new Promise<SeatConnection>((_, reject) => {
								this.#heldOpen = { reject };
							})
						: Promise.reject(new LocalAccessUnavailableError("no-location", `no record for "${owner}"`));
				attempt.catch(() => {});
				this.attempts.push(attempt);
				if (this.reachable) {
					void attempt.then(connection => void this.connections.push(connection));
				}
				return attempt;
			},
		};
	}

	/**
	 * Waits for every attempt this seat was asked for to conclude.
	 *
	 * The store's own continuation runs on the promise this reader returned, so a case that wants
	 * the access up under its next read waits here rather than for a duration.
	 */
	async concluded(): Promise<void> {
		await Promise.allSettled(this.attempts);
		await Promise.resolve();
	}

	/** The declaring process changing the value: every live connection is told. */
	set(value: boolean): void {
		this.value = value;
		for (const connection of this.connections) {
			if (!connection.ended()) connection.changed(value);
		}
	}

	/** The seat going away, as a withdrawn offer or a lost connection does. */
	withdraw(): void {
		for (const connection of this.connections) connection.dropped();
	}

	/** The newest connection this seat admitted, which is the one a live access reads through. */
	get latest(): SeatConnection {
		const connection = this.connections[this.connections.length - 1];
		if (connection === undefined) throw new Error("the seat admitted no connection");
		return connection;
	}
}

/** The value one of the store's own reads answers, as the framework's rule reads it. */
function followedRead(reader: PortDouble): boolean {
	return reader.state.followed(FOLLOWED.key).read(FIELD);
}

describe("a followed field reads the Owner's current value, not a copy taken earlier (P14)", () => {
	test("a subagent reads what the process serving its owner states, from its first run and after a change", async () => {
		const seat = new ServedSeat(true);
		const double = portDouble({ follow: seat.reader() });
		double.bind(FOLLOW_PROBE, {});

		// The subagent's own start carries this session's persisted payloads. An owner this session
		// follows is not one of them, so the run below reads the seat and not that payload.
		const start = double.deliverSession(FOLLOWED, {
			session: CHILD_SESSION,
			statePayloads: [{ [FIELD]: false }],
		});
		expect(start.persisted).toEqual([]);

		// The first semantic use is what establishes the access: the run waits for its one bounded
		// open, so it is planned from the Owner's current value rather than the declared default.
		const first = await double.initiateRun(FOLLOWED);
		expect(first.contribution).toEqual({
			identity: "follow-probe:init",
			content: "the probe's contribution",
			display: false,
			attribution: "agent",
		});
		expect(seat.opens).toEqual([{ owner: FOLLOWED.key, waitMs: 2000, at: Date.now() }]);
		await seat.concluded();

		// The Owner changes after the subagent started. The next consumption reads the new value,
		// not the one the access was opened with.
		seat.set(false);
		const off = await double.initiateRun(FOLLOWED);
		expect(off.contribution).toBeUndefined();
		// The same value is what the marker area projects for that seat.
		expect(off.markers[off.markers.length - 1]).toEqual([]);

		// And the change back is followed just the same — including by the area, whose change arrived
		// from the process serving the owner and so had no transition here to publish it.
		seat.set(true);
		const on = await double.initiateRun(FOLLOWED);
		expect(on.contribution).toBeDefined();
		expect(on.markers[on.markers.length - 1]).toEqual(["◈ followProbe"]);
	});

	test("concurrent first uses share one open and each reads the Owner's value", async () => {
		const seat = new ServedSeat(true);
		const double = portDouble({ follow: seat.reader() });
		double.bind(FOLLOW_PROBE, {});

		// Two semantic uses reach the same fresh owner in one turn. The second joins the first
		// open rather than spending another bounded budget, and both runs are planned from the
		// value that open states.
		const [left, right] = await Promise.all([
			double.initiateRun(FOLLOWED),
			double.initiateRun(FOLLOWED),
		]);
		expect(seat.opens).toHaveLength(1);
		expect(left.contribution).toBeDefined();
		expect(right.contribution).toBeDefined();
	});

	test("an owner this process holds is read from its cell, with no access at all", async () => {
		const seat = new ServedSeat(false);
		const double = portDouble({ follow: seat.reader() });
		double.bind(FOLLOW_PROBE, {});

		// The owner's own boundary seeds the cell, as a main session's start does.
		double.deliverSession(OWNER, { session: MAIN_SESSION, statePayloads: [{ [FIELD]: true }] });

		// A session this process holds the owner of reads that cell, whether the delivery is the
		// owner's own or a subagent's that resolves to it.
		expect((await double.initiateRun(OWNER)).contribution).toBeDefined();
		expect((await double.initiateRun(FOLLOWED)).contribution).toBeDefined();
		expect(seat.opens).toEqual([]);

		// The value follows this process's own write, which is the live read the in-process assembly
		// already had.
		double.run("follow-probe", { owner: OWNER });
		expect((await double.initiateRun(FOLLOWED)).contribution).toBeUndefined();
		expect(seat.opens).toEqual([]);
	});
});

describe("a read that cannot be taken uses the declared default and claims nothing (P15)", () => {
	test("inheritance none never reaches the owner at all", async () => {
		const seat = new ServedSeat(true);
		const double = portDouble({ follow: seat.reader() });
		double.bind(NONE_PROBE, {});
		double.deliverSession(OWNER, { session: MAIN_SESSION, statePayloads: [{ [FIELD]: true }] });

		// The owner is on, and the subagent still reads the declared default: the opt-in is what
		// widens a read, so a field without it opens no access and leaves the owner's value alone.
		const run = await double.initiateRun(FOLLOWED);
		expect(run.contribution).toBeUndefined();
		expect(seat.opens).toEqual([]);
		expect(seat.value).toBe(true);
	});

	test("an owner no session could be resolved for reads the declared default", async () => {
		const seat = new ServedSeat(true);
		const double = portDouble({ follow: seat.reader() });
		double.bind(FOLLOW_PROBE, {});

		const run = await double.initiateRun({ kind: "unresolved" });
		expect(run.contribution).toBeUndefined();
		expect(seat.opens).toEqual([]);
	});

	test("an owner that cannot be reached reads the declared default, and its value comes back with it", async () => {
		const seat = new ServedSeat(true);
		seat.reachable = false;
		const double = portDouble({ follow: seat.reader() });
		double.bind(FOLLOW_PROBE, {});

		// The seat is on, and no access reaches it. The first run waits for the one bounded attempt
		// — here it fails at once rather than spending its budget — and the consumption is then the
		// declared default. That reading is not taken as the Owner's value — nothing is written for
		// it, recorded, or pushed anywhere — and the seat's own value is untouched by it.
		const unreached = await double.initiateRun(FOLLOWED);
		expect(unreached.contribution).toBeUndefined();
		// No line is rendered for the seat: the failed attempt claims no value, so the area this store
		// answers for carries the declared default.
		expect(unreached.markers[unreached.markers.length - 1] ?? []).toEqual([]);
		expect(seat.value).toBe(true);
		expect(followedRead(double)).toBe(false);

		// The same session's boundary later carries a persisted payload: an Owner the access cannot be
		// reached for is still not read from one, so the fallback stays the declared default rather
		// than a value this session happens to hold.
		double.deliverSession(FOLLOWED, { session: CHILD_SESSION, statePayloads: [{ [FIELD]: true }] });
		expect((await double.initiateRun(FOLLOWED)).contribution).toBeUndefined();

		// Once the seat is reached again, recovery stays read-driven: the first run past the spacing
		// starts the attempt and answers the default while it is in flight, and the run after it is
		// the Owner's own current value. The default read was never a measurement of the Owner.
		seat.reachable = true;
		vi.advanceTimersByTime(500);
		expect((await double.initiateRun(FOLLOWED)).contribution).toBeUndefined();
		await seat.concluded();
		expect((await double.initiateRun(FOLLOWED)).contribution).toBeDefined();
	});

	test("a first run that exhausts its bounded wait reads the declared default", async () => {
		const seat = new ServedSeat(true);
		seat.reachable = false;
		seat.holdsOpen = true;
		const policy: FollowedAccessPolicy = { waitMs: 50, baseMs: 20, maxMs: 60 };
		const double = portDouble({ follow: seat.reader(policy) });
		double.bind(FOLLOW_PROBE, {});

		// The first semantic use is underway but has not answered: it is waiting for the one bounded
		// open, and that open has not concluded.
		let answered = false;
		const first = double.initiateRun(FOLLOWED).then(run => {
			answered = true;
			return run;
		});
		for (let tick = 0; tick < 20; tick += 1) await Promise.resolve();
		expect(seat.opens).toEqual([{ owner: FOLLOWED.key, waitMs: policy.waitMs, at: Date.now() }]);
		expect(answered).toBe(false);

		// The budget runs out without the seat answering: the run concludes on the declared default
		// rather than waiting past what the policy allows.
		expect(seat.expireOpen()).toBe(true);
		const unreached = await first;
		expect(unreached.contribution).toBeUndefined();
		expect(followedRead(double)).toBe(false);

		// The failure is spaced like any other, and recovery stays read-driven: the first read past
		// the spacing starts the next attempt and answers the default while it is in flight, and the
		// read after it is the Owner's value.
		seat.reachable = true;
		vi.advanceTimersByTime(policy.baseMs);
		expect((await double.initiateRun(FOLLOWED)).contribution).toBeUndefined();
		await seat.concluded();
		expect((await double.initiateRun(FOLLOWED)).contribution).toBeDefined();
	});
});

describe("an access that is not there is recovered for later reads only (P16)", () => {
	test("reads before the access is reached answer the default, and one attempt is shared", async () => {
		const seat = new ServedSeat(true);
		const double = portDouble({ follow: seat.reader() });
		const reads: boolean[] = [];
		double.bind(FOLLOW_PROBE, {
			subscriptions: [
				{
					scope: "session",
					events: {
						session_start: delivery => {
							for (let index = 0; index < 3; index += 1) reads.push(delivery.capability.state.read());
						},
					},
				},
			],
		});

		// Two deliveries in one turn, each reading the followed value three times. The accesses are
		// merged: the seat is opened once, and every read before it landed answers the declared
		// default rather than waiting for it.
		double.deliverSession(FOLLOWED, { session: CHILD_SESSION });
		double.deliverSession(FOLLOWED, { session: CHILD_SESSION });
		expect(reads).toEqual([false, false, false, false, false, false]);
		expect(seat.opens).toHaveLength(1);
		await seat.concluded();

		// The access landed, and every later read is the Owner's value — the ones taken before it are
		// not rewritten by the recovery.
		double.deliverSession(FOLLOWED, { session: CHILD_SESSION });
		expect(reads[reads.length - 1]).toBe(true);
		expect(reads.slice(0, 6)).toEqual([false, false, false, false, false, false]);
		expect(seat.opens).toHaveLength(1);
	});

	test("an ended access is let go, a later read reaches the owner again, and nothing is replayed", async () => {
		const seat = new ServedSeat(false);
		const double = portDouble({ follow: seat.reader() });
		const deliveries: string[] = [];
		const records: boolean[] = [];
		double.bind(FOLLOW_PROBE, {
			subscriptions: [
				{
					scope: "session",
					events: {
						session_start: delivery => {
							deliveries.push(delivery.session.sessionId);
							records.push(delivery.capability.state.read());
						},
					},
				},
			],
		});

		double.deliverSession(FOLLOWED, { session: CHILD_SESSION });
		await seat.concluded();
		const connected = seat.latest;
		expect(followedRead(double)).toBe(false);

		// The seat states the new value and the declaring process pushes it: a connected access asks
		// for nothing, so this change reaches the read without a request or a further open.
		seat.set(true);
		expect(followedRead(double)).toBe(true);
		expect(seat.opens).toHaveLength(1);
		expect(connected.requested).toBe(0);

		// The seat goes away. The next read answers the declared default, and the connection that can
		// no longer stand behind a value is released rather than kept.
		seat.withdraw();
		expect(followedRead(double)).toBe(false);
		expect(connected.disposed).toBe(1);

		// A later read reaches the owner's access again — the disconnect is not proof that the owner
		// ended — and recovery is what happens to that read and the ones after it: the deliveries the
		// extension already saw are not replayed, and nothing is written for the recovery itself.
		vi.advanceTimersByTime(500);
		expect(followedRead(double)).toBe(false);
		await seat.concluded();
		expect(seat.opens).toHaveLength(2);
		expect(followedRead(double)).toBe(true);
		expect(deliveries).toEqual(["session-child"]);
		expect(records).toEqual([false]);
	});

	test("a failure is spaced, and the spacing stops growing at its ceiling", async () => {
		const seat = new ServedSeat(true);
		seat.reachable = false;
		// The framework's own mechanism at test speed: a bounded open, a delay that doubles per
		// consecutive failure and a ceiling it stops growing at.
		const policy: FollowedAccessPolicy = { waitMs: 20, baseMs: 20, maxMs: 60 };
		const double = portDouble({ follow: seat.reader(policy) });
		double.bind(FOLLOW_PROBE, {});
		const started = Date.now();

		// Three reads in one turn earn one attempt, and the failure it states is spaced: no second
		// attempt is made until the first delay has passed.
		expect([followedRead(double), followedRead(double), followedRead(double)]).toEqual([false, false, false]);
		await seat.concluded();
		expect(seat.opens).toHaveLength(1);
		vi.advanceTimersByTime(5);
		expect(followedRead(double)).toBe(false);
		await seat.concluded();
		expect(seat.opens).toHaveLength(1);

		// Past each delay in turn a further attempt is made; and after four consecutive failures the
		// delay is still the declared ceiling rather than twice the one before it.
		for (const step of [20, 50, 60, 60, 60]) {
			vi.advanceTimersByTime(step);
			followedRead(double);
			await seat.concluded();
		}

		expect(seat.opens.map(open => open.at - started)).toEqual([0, 25, 75, 135, 195, 255]);
		expect(seat.opens.every(open => open.waitMs === policy.waitMs)).toBe(true);
	});

	test("an access that is up is not polled, and disposing the store ends the recovery", async () => {
		const seat = new ServedSeat(true);
		const double = portDouble({ follow: seat.reader({ waitMs: 20, baseMs: 20, maxMs: 60 }) });
		double.bind(FOLLOW_PROBE, {});

		followedRead(double);
		await seat.concluded();
		expect(seat.opens).toHaveLength(1);

		// A connected access is left alone: reads over a window that spans many delayed attempts add
		// none, and the access is never asked for a declared read.
		for (let step = 0; step < 200; step += 1) {
			vi.advanceTimersByTime(10);
			followedRead(double);
		}
		expect(seat.opens).toHaveLength(1);
		expect(seat.latest.requested).toBe(0);
		expect(seat.latest.disposed).toBe(0);

		// A store that released its follows is spent: the connection it held is released with it, and
		// no later read opens another one, however long the window is.
		double.state.dispose();
		expect(seat.latest.disposed).toBe(1);
		expect(followedRead(double)).toBe(false);
		vi.advanceTimersByTime(600_000);
		expect(followedRead(double)).toBe(false);
		expect(seat.opens).toHaveLength(1);
	});
});

describe("the pi assembly reads a followed Owner a session this process serves holds (S1, P14)", () => {
	test("a spawned session's binding reads the seat this process serves, and renders it", async () => {
		const files = sessionFileDir();
		// The owner's own session file states its identity and no lineage link, which is what makes it
		// the top-level session a subagent below it follows. The subagent's file states pi's own lineage
		// link, exactly as a provider-spawned session does.
		const ownerFile = files.path("owner.jsonl");
		files.write("owner.jsonl", { type: "session", id: "pi-follow-owner" });
		files.write("child.jsonl", { type: "session", id: "pi-follow-child", parentSession: ownerFile });

		// The process serving the owner: a real pi assembly, with the extension turned on in the branch
		// its own session start restored.
		const serving = boundPiSurface({ definition: CODEBASE_TOOLS, childEntry: CHILD_ENTRY });
		serving.sessionStarts(
			{
				sessionId: "pi-follow-owner",
				header: { type: "session", id: "pi-follow-owner" },
				branch: [{ type: "custom", customType: "codebase-tools:state", data: { enabled: true } }],
			},
			"new",
		);
		expect(localOwnerAccess({ extension: CODEBASE_TOOLS.id, owner: "main:pi-follow-owner" })).toBeDefined();

		// The session pi ran elsewhere — another binding of the same assembly, which holds no cell for
		// that Owner — reads it through the framework's local access.
		const following = boundPiSurface({ definition: CODEBASE_TOOLS, childEntry: CHILD_ENTRY });
		const child = {
			sessionId: "pi-follow-child",
			header: { type: "session" as const, id: "pi-follow-child", parentSession: files.path("child.jsonl") },
		};
		following.sessionStarts(child, "resume");
		expect(following.sessions[0]!.owner).toEqual({ kind: "inherited", key: "main:pi-follow-owner" });

		// The spawned session's own run projects the displayed seat, and the Owner's line is what the
		// area carries: in this process the store that served the Owner answers the seat from its cell,
		// which is the registration the following binding's delivery is rendered by. The first use may
		// have to wait for that access, so the rendering is awaited rather than assumed synchronous.
		const renderings: Array<readonly string[] | undefined> = [];
		for (let turn = 0; turn < 8; turn += 1) {
			following.agentStarts(child, "user");
			const last = following.widgets[following.widgets.length - 1]?.content;
			renderings.push(last);
			if (last !== undefined) break;
			await Promise.resolve();
		}
		expect(renderings[renderings.length - 1]).toEqual([MARKER_LINE]);

		// The reads after it are the extension's own public consumption of the followed value: a field
		// that declares `follow` is what makes this process the one that answers for that seat, and it
		// keeps carrying the Owner's line without another wait.
		following.agentStarts(child, "user");
		expect(following.widgets[following.widgets.length - 1]?.content).toEqual([MARKER_LINE]);
	});

	test("a field that declares no follow reads the declared default and offers nothing", () => {
		const files = sessionFileDir();
		const ownerFile = files.path("none-owner.jsonl");
		files.write("none-owner.jsonl", { type: "session", id: "pi-none-owner" });
		files.write("none-child.jsonl", { type: "session", id: "pi-none-child", parentSession: ownerFile });

		// The same two sessions with a definition whose State inheritance is the default: nothing is
		// offered for the owner, and the spawned session reads no access at all.
		const serving = boundPiSurface({ definition: NONE_PROBE, childEntry: CHILD_ENTRY });
		serving.sessionStarts(
			{
				sessionId: "pi-none-owner",
				header: { type: "session", id: "pi-none-owner" },
				branch: [{ type: "custom", customType: "none-probe:state", data: { enabled: true } }],
			},
			"new",
		);
		expect(localOwnerAccess({ extension: NONE_PROBE.id, owner: "main:pi-none-owner" })).toBeUndefined();

		const following = boundPiSurface({ definition: NONE_PROBE, childEntry: CHILD_ENTRY });
		const child = {
			sessionId: "pi-none-child",
			header: { type: "session" as const, id: "pi-none-child", parentSession: files.path("none-child.jsonl") },
		};
		following.sessionStarts(child, "resume");
		following.agentStarts(child, "user");

		expect(following.widgets).toEqual([]);
	});
});

describe("a widened observation grants no write or effect authority (P17)", () => {
	test("both scopes observe one session's events, and the child side changes nothing of the Owner's", async () => {
		const seat = new ServedSeat(true);
		const double = portDouble({ follow: seat.reader() });
		const ownerSeen: string[] = [];
		const childSeen: string[] = [];
		const childReads: boolean[] = [];
		const retained: OwnerCapabilityHandle[] = [];
		double.bind(FOLLOW_PROBE, {
			subscriptions: [
				{
					scope: "owner",
					events: {
						session_start: delivery => {
							ownerSeen.push(delivery.session.sessionId);
							retained.push(delivery.capability);
						},
						session_end: delivery => void retained.push(delivery.capability),
					},
				},
				{
					scope: "session",
					events: {
						session_start: delivery => {
							childSeen.push(delivery.session.sessionId);
							// What this delivery hands out: a read of the value the field's own
							// inheritance rule reads, and no write, notice or owner effect. The attempt
							// below is the child side's — a delivery whose session is its own owner is
							// the Owner acting, which is the operation that must keep working.
							childReads.push(delivery.capability.state.read());
							if (delivery.owner.kind === "owner") return;
							delivery.capability.state.write(false);
							delivery.capability.feedback.notify("info", "the child side speaks");
							retained.push(delivery.capability);
						},
					},
				},
			],
		});

		// The Owner's own boundary arms its value, and the subagent's own boundary is the same event
		// kind observed under the widened scope.
		const ownerStart = double.deliverSession(OWNER, {
			session: MAIN_SESSION,
			statePayloads: [{ [FIELD]: true }],
		});
		const childStart = double.deliverSession(FOLLOWED, { session: CHILD_SESSION });

		// The two scopes: the owner's own boundary reached the owner group, and the session group
		// observed every actual session — the owner's own boundary and the subagent's.
		expect(ownerSeen).toEqual(["owner-session"]);
		expect(childSeen).toEqual(["owner-session", "session-child"]);
		// The widened scope observed the Owner's value for both sessions, and that read is the whole
		// of what it gained.
		expect(childReads).toEqual([true, true]);

		// The effects the child side asked for are not there: no value recorded in any medium, no
		// line republished, no notice — and the Owner's own value is still the one its boundary
		// armed, so the write through the widened observation landed nowhere.
		expect(childStart.persisted).toEqual([]);
		expect(childStart.feedback).toEqual([]);
		expect(childStart.markers).toEqual([]);
		expect(double.state.view(FOLLOWED.key).read(FIELD)).toBe(true);
		expect(ownerStart.persisted).toEqual([]);

		// A handle kept past the deliveries behaves the same way: the child's is a read and nothing
		// else, wherever it is used from.
		const childHandle = retained[1]!;
		const renderings = double.markerUpdates.length;
		childHandle.state.write(false);
		childHandle.feedback.notify("error", "the child side speaks");
		expect(childHandle.state.read()).toBe(true);
		expect(double.markerUpdates).toHaveLength(renderings);
		expect(ownerStart.feedback).toEqual([]);
		expect(double.state.view(OWNER.key).read(FIELD)).toBe(true);

		// The child's own session cannot act as the owner through a command either, while the owner's
		// own command still writes and announces.
		const childRun = double.run("follow-probe", { owner: FOLLOWED });
		expect(childRun.persisted).toEqual([]);
		expect(childRun.feedback).toEqual([]);
		const ownerRun = double.run("follow-probe", { owner: OWNER });
		expect(ownerRun.persisted).toEqual([{ [FIELD]: false }]);
		expect(ownerRun.feedback).toEqual([{ level: "info", message: "followProbe disabled" }]);

		// A handle retained from the owner's own end is inert from birth: the boundary retired the
		// cell before the handler ran, so the effect it drives afterwards reaches nobody.
		const ownerEnd = double.deliverSession(OWNER, {
			session: MAIN_SESSION,
			event: { kind: "session_end", reason: "disposed" },
		});
		const retired = retained[retained.length - 1]!;
		retired.state.write(false);
		retired.feedback.notify("error", "the owner's panel is gone");
		expect(double.state.view(OWNER.key).read(FIELD)).toBe(false);
		expect(ownerEnd.feedback).toEqual([]);
	});
});
