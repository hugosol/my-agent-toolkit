/**
 * The framework's own half of the boundary between the process that serves an owner and the process
 * that runs a session following it (P1, P13, P16, P17, P19): what one binding receives for the owner
 * it serves, what it adopts from a reading that arrived, what it does with a session's own confirmed
 * storage write, and what it hands over for a session whose owner is somewhere else.
 *
 * The seam under test is the framework's public consumption interface — the harness port's
 * observation access, the binding's own use of it, the process's session observation source and the
 * per-session deliveries a subscriber receives — driven through the framework suite's port double.
 * The carrier under it is deliberately not doubled: `local-access-observation.test.ts` starts real
 * processes over the real endpoint, and what is asserted here is only what the framework does with a
 * reading once an adapter's access has handed it over.
 */
import { describe, expect, test } from "bun:test";
import type { ExtensionImplementation } from "../../framework/core/assembly";
import type { AgentActivity, ObservedSession, SessionFacts } from "../../framework/core/protocol";
import { defineExtension } from "../../framework/public";
import { DEFAULT_OWNER_KEY, type PortDouble, portDouble } from "./support/harness-port-double";

/** The extension every case binds: identity, a label and a per-session observation view. */
const PROBE = defineExtension({ id: "session-observation-probe", displayName: "sessionObservationProbe" });

/** The owner this process serves in every case. */
const SERVED_OWNER = DEFAULT_OWNER_KEY;

/** The owner another process serves: a session spawned there follows this one. */
const ELSEWHERE_OWNER = "main:elsewhere-owner";

/** One actual session this process runs, following an owner it does not serve. */
const CHILD: SessionFacts = {
	sessionId: "child-session",
	kind: "sub",
	parentSessionId: "elsewhere-session",
	name: "child",
	unavailable: [],
};

/** One reading of that session, as the process that ran it delivered it. */
function readingOf(owner: string, readings: { readonly activity?: "working" | "idle"; readonly tokens?: number } = {}): ObservedSession {
	return {
		session: CHILD,
		owner: { kind: "inherited", key: owner },
		...(readings.activity === undefined ? {} : { activity: readings.activity }),
		...(readings.tokens === undefined ? {} : { context: { tokens: readings.tokens, provider: "deepseek", model: "deepseek-flash" } }),
	};
}

/** One session-scoped group over both observation readings, recording every delivery it receives. */
function observing(): {
	readonly implementation: ExtensionImplementation;
	readonly activity: ObservedSession[];
	readonly context: ObservedSession[];
} {
	const activity: ObservedSession[] = [];
	const context: ObservedSession[] = [];
	return {
		activity,
		context,
		implementation: {
			subscriptions: [
				{
					scope: "session",
					events: {
						session_activity: delivery => {
							const one = delivery as { session: SessionFacts; owner: ObservedSession["owner"]; activity: "working" | "idle" };
							activity.push({ session: one.session, owner: one.owner, activity: one.activity });
						},
						session_context: delivery => {
							const one = delivery as { session: SessionFacts; owner: ObservedSession["owner"]; reading: { tokens: number } };
							context.push({ session: one.session, owner: one.owner, context: { tokens: one.reading.tokens } });
						},
					},
				},
			],
		},
	};
}

/** The one owner session this process serves, as a delivery states it. */
function serveOwner(double: PortDouble): void {
	const bound = double.bind(PROBE, observing().implementation);
	expect(bound.bound).toBe(true);
	double.deliverSession({ kind: "owner", key: SERVED_OWNER }, { event: { kind: "session_start", reason: "initial" } });
}

/** One session-scoped group over the whole reading surface, and what each delivery it received was. */
interface Watching {
	readonly implementation: ExtensionImplementation;
	/** The kind of every delivery that reached the group, in order. */
	readonly kinds: string[];
	/** The activity readings it was handed. */
	readonly activity: ObservedSession[];
	/** The context readings it was handed. */
	readonly context: ObservedSession[];
	/** The confirmed-write notices it was handed, each as the word it states. */
	readonly notices: ObservedSession[];
	/** The sessions whose observation it was told is no longer available. */
	readonly unobserved: ObservedSession[];
}

/** One session-scoped group over the whole reading surface, recording what each delivery was. */
function watching(): Watching {
	const kinds: string[] = [];
	const activity: ObservedSession[] = [];
	const context: ObservedSession[] = [];
	const notices: ObservedSession[] = [];
	const unobserved: ObservedSession[] = [];
	return {
		kinds,
		activity,
		context,
		notices,
		unobserved,
		implementation: {
			subscriptions: [
				{
					scope: "session",
					events: {
						session_start: () => void kinds.push("session_start"),
						session_end: () => void kinds.push("session_end"),
						session_facts: () => void kinds.push("session_facts"),
						round_start: () => void kinds.push("round_start"),
						round_end: () => void kinds.push("round_end"),
						turn_start: () => void kinds.push("turn_start"),
						turn_end: () => void kinds.push("turn_end"),
						user_input: () => void kinds.push("user_input"),
						session_activity: delivery => {
							kinds.push("session_activity");
							const one = delivery as {
								session: SessionFacts;
								owner: ObservedSession["owner"];
								activity: AgentActivity;
							};
							activity.push({ session: one.session, owner: one.owner, activity: one.activity });
						},
						session_context: delivery => {
							kinds.push("session_context");
							const one = delivery as {
								session: SessionFacts;
								owner: ObservedSession["owner"];
								reading: { tokens: number };
							};
							context.push({ session: one.session, owner: one.owner, context: { tokens: one.reading.tokens } });
						},
						session_unobserved: delivery => {
							kinds.push("session_unobserved");
							unobserved.push({ session: delivery.session, owner: delivery.owner });
						},
						session_commit: delivery => {
							kinds.push("session_commit");
							notices.push({
								session: delivery.session,
								owner: delivery.owner,
								commits: delivery.commits,
							});
						},
					},
				},
			],
		},
	};
}

/**
 * The one owner session this process serves, for a case that records the whole delivery surface.
 *
 * What the probe records starts after that seat is established: the owner's own start is what receives
 * the seat rather than a delivery about the session the case observes, and a case asserts what the
 * session's own readings and their loss delivered.
 */
function watchOwner(double: PortDouble, probe: Watching): void {
	expect(double.bind(PROBE, probe.implementation).bound).toBe(true);
	double.deliverSession({ kind: "owner", key: SERVED_OWNER }, { event: { kind: "session_start", reason: "initial" } });
	probe.kinds.length = 0;
}

describe("a binding serves its owner's observation seat (P1)", () => {
	test("the seat is received when this process starts serving an owner, and withdrawn with that life", () => {
		const double = portDouble({ observationsAcrossProcesses: true });
		expect(double.receivingOwners).toEqual([]);
		serveOwner(double);
		expect(double.receivingOwners).toEqual([SERVED_OWNER]);

		// The owner's own life ends — another session takes its place — and the seat goes with it
		// rather than being kept for a session that no longer exists.
		double.deliverSession({ kind: "owner", key: SERVED_OWNER }, { event: { kind: "session_end", reason: "transferred" } });
		expect(double.receivingOwners).toEqual([]);

		// The session this process serves again receives its own seat, and the session going away
		// withdraws that one too.
		double.deliverSession({ kind: "owner", key: SERVED_OWNER }, { event: { kind: "session_start", reason: "resume" } });
		expect(double.receivingOwners).toEqual([SERVED_OWNER]);
		double.deliverSession({ kind: "owner", key: SERVED_OWNER }, { event: { kind: "session_end", reason: "disposed" } });
		expect(double.receivingOwners).toEqual([]);
	});

	test("a harness whose sessions all run here supplies no access and nothing is received", () => {
		const double = portDouble();
		serveOwner(double);
		expect(double.receivingOwners).toEqual([]);
		expect(double.deliveredObservations).toEqual([]);
	});
});

describe("a reading from another process is adopted as the reading it is (P1, P13)", () => {
	test("the identity, the activity and the context arrive with the reading and reach the subscriber", () => {
		const double = portDouble({ observationsAcrossProcesses: true });
		const probe = observing();
		expect(double.bind(PROBE, probe.implementation).bound).toBe(true);
		double.deliverSession({ kind: "owner", key: SERVED_OWNER }, { event: { kind: "session_start", reason: "initial" } });

		// Independently given values: the session the process elsewhere ran, and the readings it held.
		double.deliverObserved(readingOf(SERVED_OWNER, { activity: "working", tokens: 4242 }));

		// The subscriber is handed the reading itself, so nothing has to be read to adopt it.
		expect(probe.activity).toEqual([
			{ session: CHILD, owner: { kind: "inherited", key: SERVED_OWNER }, activity: "working" },
		]);
		expect(probe.context).toEqual([
			{ session: CHILD, owner: { kind: "inherited", key: SERVED_OWNER }, context: { tokens: 4242 } },
		]);
		// And the framework's own source holds it: what a consumer attaching later reads is the child
		// session, by its own identity, with the readings that were delivered for it.
		expect(double.observations.read(CHILD.sessionId)).toEqual({
			sessionId: CHILD.sessionId,
			session: CHILD,
			owner: { kind: "inherited", key: SERVED_OWNER },
			activity: "working",
			context: { tokens: 4242, provider: "deepseek", model: "deepseek-flash" },
		});

		// A reading that states what the source already holds is not a change: nothing is published a
		// second time, exactly as a repeated local collection is not.
		const repeated: ObservedSession = {
			session: CHILD,
			owner: { kind: "inherited", key: SERVED_OWNER },
			context: { tokens: 4242, provider: "deepseek", model: "deepseek-flash" },
		};
		double.deliverObserved(repeated);
		expect(probe.context).toHaveLength(1);
	});

	test("a reading for an owner this process serves nothing for reaches nobody", () => {
		const double = portDouble({ observationsAcrossProcesses: true });
		const probe = observing();
		expect(double.bind(PROBE, probe.implementation).bound).toBe(true);
		// No owner session has started here, so this process admits nothing: the delivery is not the
		// session's observation either, because nothing served this owner to receive it.
		double.deliverObserved(readingOf(ELSEWHERE_OWNER, { activity: "working" }));
		expect(probe.activity).toEqual([]);
		expect(double.observations.read(CHILD.sessionId)).toBeUndefined();
	});
});

describe("this process hands over what it observed for an owner it does not serve (P1, P13)", () => {
	test("the session's own facts, its activity and its context leave, each from the delivery that moved it", () => {
		const double = portDouble({ observationsAcrossProcesses: true });
		expect(double.bind(PROBE, observing().implementation).bound).toBe(true);

		// The session's start: the registration itself, which is what makes it exist for its owner's
		// process before any reading of it moves.
		double.deliverSession(
			{ kind: "inherited", key: ELSEWHERE_OWNER },
			{ event: { kind: "session_start", reason: "initial" }, session: CHILD },
		);
		double.deliverRound(
			{ kind: "inherited", key: ELSEWHERE_OWNER },
			{ event: { kind: "round_start" }, session: CHILD },
		);
		double.deliverContext(
			{ kind: "inherited", key: ELSEWHERE_OWNER },
			{ session: CHILD, reading: { tokens: 77, provider: "deepseek", model: "deepseek-flash" } },
		);

		expect(double.deliveredObservations).toEqual([
			{ session: CHILD, owner: { kind: "inherited", key: ELSEWHERE_OWNER } },
			{ session: CHILD, owner: { kind: "inherited", key: ELSEWHERE_OWNER }, activity: "working" },
			{ session: CHILD, owner: { kind: "inherited", key: ELSEWHERE_OWNER }, context: { tokens: 77, provider: "deepseek", model: "deepseek-flash" } },
		]);
	});

	test("a session whose owner this process serves is observed here and handed to nobody", () => {
		const double = portDouble({ observationsAcrossProcesses: true });
		serveOwner(double);
		double.deliverSession(
			{ kind: "inherited", key: SERVED_OWNER },
			{ event: { kind: "session_start", reason: "initial" }, session: CHILD },
		);
		double.deliverRound({ kind: "inherited", key: SERVED_OWNER }, { event: { kind: "round_start" }, session: CHILD });
		expect(double.deliveredObservations).toEqual([]);
		expect(double.observations.read(CHILD.sessionId)?.activity).toBe("working");
	});

	test("a session whose owner this process cannot name is held here rather than sent nowhere", () => {
		const double = portDouble({ observationsAcrossProcesses: true });
		expect(double.bind(PROBE, observing().implementation).bound).toBe(true);
		double.deliverSession(
			{ kind: "unresolved" },
			{ event: { kind: "session_start", reason: "initial" }, session: CHILD },
		);
		expect(double.deliveredObservations).toEqual([]);
	});
});

describe("a source's readings are the ones it stated, and a source's end withdraws exactly them (P5–P8)", () => {
	test("the readings a source's end withdraws are gone for a reader, and its identity is not", () => {
		const double = portDouble({ observationsAcrossProcesses: true });
		const probe = watching();
		watchOwner(double, probe);

		// One word from one source: the session's identity and both of its readings.
		double.deliverObserved(readingOf(SERVED_OWNER, { activity: "working", tokens: 4242 }));
		expect(probe.kinds).toEqual(["session_activity", "session_context"]);

		// The connection that carried them ends — the process that delivered released the access, or
		// this side observed the connection close — and what it cost is exactly what it stated.
		double.loseObservedSource();

		// A reader finds the readings gone, and finds no idleness in their place: an unavailable
		// observation is not a session that is idle, failed or finished.
		expect(double.observations.read(CHILD.sessionId)).toEqual({
			sessionId: CHILD.sessionId,
			session: CHILD,
			owner: { kind: "inherited", key: SERVED_OWNER },
		});
		// The identity stays with it — the session is still named, and still placed where its own direct
		// parent puts it — because that is the session's own fact rather than the connection's.
		expect(double.observations.snapshot().filter(one => one.sessionId === CHILD.sessionId)).toEqual([
			{ sessionId: CHILD.sessionId, session: CHILD, owner: { kind: "inherited", key: SERVED_OWNER } },
		]);
		// And the subscriber is told the observation is unavailable, and nothing else: no Round edge, no
		// Turn, no session event and no billing fact is invented for a lost connection.
		expect(probe.kinds).toEqual(["session_activity", "session_context", "session_unobserved"]);
		expect(probe.unobserved).toEqual([{ session: CHILD, owner: { kind: "inherited", key: SERVED_OWNER } }]);
	});

	test("a word a later source stated survives the earlier source's end, and a late word does not overwrite it", () => {
		const double = portDouble({ observationsAcrossProcesses: true });
		const probe = watching();
		watchOwner(double, probe);

		// The connection this process admitted first stated both readings; the one it admitted second
		// stated them again with the values the session really holds now.
		double.deliverObserved(readingOf(SERVED_OWNER, { activity: "working", tokens: 100 }), 1);
		double.deliverObserved(readingOf(SERVED_OWNER, { activity: "idle", tokens: 200 }), 2);
		// A word the first connection sent before it ended arrives after the second one's: a source
		// older than the one a reading came from is not this process's to take.
		double.deliverObserved(readingOf(SERVED_OWNER, { activity: "working", tokens: 300 }), 1);

		expect(double.observations.read(CHILD.sessionId)).toEqual({
			sessionId: CHILD.sessionId,
			session: CHILD,
			owner: { kind: "inherited", key: SERVED_OWNER },
			activity: "idle",
			context: { tokens: 200, provider: "deepseek", model: "deepseek-flash" },
		});
		// Nothing of the late word reached a subscriber either: it moved nothing.
		expect(probe.kinds).toEqual(["session_activity", "session_context", "session_activity", "session_context"]);

		// The first connection's end now withdraws nothing: every reading this process holds was stated
		// by the second one.
		double.loseObservedSource(1);
		expect(probe.kinds).toEqual(["session_activity", "session_context", "session_activity", "session_context"]);
		expect(probe.unobserved).toEqual([]);
		expect(double.observations.read(CHILD.sessionId)?.activity).toBe("idle");
		expect(double.observations.read(CHILD.sessionId)?.context?.tokens).toBe(200);

		// The second one's end is what withdraws them, and it is the once the subscriber is told about.
		double.loseObservedSource(2);
		expect(probe.unobserved).toHaveLength(1);
		expect(double.observations.read(CHILD.sessionId)).toEqual({
			sessionId: CHILD.sessionId,
			session: CHILD,
			owner: { kind: "inherited", key: SERVED_OWNER },
		});
	});

	test("a source that reaches the seat again restores what was withdrawn, without waiting for a change (P5)", () => {
		const double = portDouble({ observationsAcrossProcesses: true });
		const probe = watching();
		watchOwner(double, probe);

		double.deliverObserved(readingOf(SERVED_OWNER, { activity: "working", tokens: 4242 }), 1);
		double.loseObservedSource(1);
		expect(probe.unobserved).toHaveLength(1);

		// The access is reached again — a connection this process admits later — and the first word it
		// sends carries the readings that process holds right now: the same activity it held before, and
		// a context that moved while this access was gone. Nothing had to change for the snapshot to
		// arrive, and no Round, Turn or accounting fact is minted for the return.
		double.deliverObserved(readingOf(SERVED_OWNER, { activity: "working", tokens: 5000 }), 2);

		expect(probe.kinds).toEqual([
			"session_activity",
			"session_context",
			"session_unobserved",
			"session_activity",
			"session_context",
		]);
		expect(probe.activity).toEqual([
			{ session: CHILD, owner: { kind: "inherited", key: SERVED_OWNER }, activity: "working" },
			{ session: CHILD, owner: { kind: "inherited", key: SERVED_OWNER }, activity: "working" },
		]);
		expect(double.observations.read(CHILD.sessionId)).toEqual({
			sessionId: CHILD.sessionId,
			session: CHILD,
			owner: { kind: "inherited", key: SERVED_OWNER },
			activity: "working",
			context: { tokens: 5000, provider: "deepseek", model: "deepseek-flash" },
		});
	});

	test("a source's end states nothing about a session no reading of it is held for", () => {
		const double = portDouble({ observationsAcrossProcesses: true });
		const probe = watching();
		watchOwner(double, probe);

		// A session this process only ever saw a registration for — no reading of it arrived — and a
		// connection that ends are both silent: what is withdrawn is the readings a source stated, and
		// there are none.
		double.deliverObserved({ session: CHILD, owner: { kind: "inherited", key: SERVED_OWNER } });
		double.loseObservedSource();

		expect(probe.kinds).toEqual([]);
		expect(probe.unobserved).toEqual([]);
		expect(double.observations.read(CHILD.sessionId)).toEqual({
			sessionId: CHILD.sessionId,
			session: CHILD,
			owner: { kind: "inherited", key: SERVED_OWNER },
		});
	});
});

describe("a session's own confirmed write is adopted as the notice it is (P16, P17)", () => {
	test("the count arrives with the word, reaches the subscriber where it moved, and survives its source", () => {
		const double = portDouble({ observationsAcrossProcesses: true });
		const probe = watching();
		watchOwner(double, probe);
		const seat = { kind: "inherited", key: SERVED_OWNER } as const;

		// The process that ran the session confirmed a write into the storage both processes share, and
		// what it states about that is the count alone: no record, no figure and no path crosses, so the
		// subscriber is handed the notice and nothing a consumer could adopt as a value.
		double.deliverObserved({ session: CHILD, owner: seat, commits: 1 });
		expect(probe.kinds).toEqual(["session_commit"]);
		expect(probe.notices).toEqual([{ session: CHILD, owner: seat, commits: 1 }]);
		// The framework's own source holds it, which is what a consumer attaching after the fact reads.
		expect(double.observations.read(CHILD.sessionId)?.commits).toBe(1);

		// A word stating the count this process already took states nothing — a repeated notice costs a
		// subscriber no second read — while the session's own next confirmed write does move.
		double.deliverObserved({ session: CHILD, owner: seat, commits: 1 });
		expect(probe.kinds).toEqual(["session_commit"]);
		double.deliverObserved({ session: CHILD, owner: seat, commits: 2 }, 2);
		expect(probe.kinds).toEqual(["session_commit", "session_commit"]);
		expect(double.observations.read(CHILD.sessionId)?.commits).toBe(2);

		// The connection that stated them ends with its live readings: the activity and the context are
		// withdrawn — the session reads as unobserved rather than as idle — while the notice stays, because
		// a write that really landed does not become untrue when the connection that stated it goes away.
		double.deliverObserved(
			{ session: CHILD, owner: seat, activity: "working", context: { tokens: 70 }, commits: 3 },
			3,
		);
		double.loseObservedSource(3);
		expect(probe.kinds).toEqual([
			"session_commit",
			"session_commit",
			"session_activity",
			"session_commit",
			"session_context",
			"session_unobserved",
		]);
		expect(probe.unobserved).toEqual([{ session: CHILD, owner: seat }]);
		expect(double.observations.read(CHILD.sessionId)).toEqual({
			sessionId: CHILD.sessionId,
			session: CHILD,
			owner: seat,
			commits: 3,
		});
	});

	test("a count this process never took is what a connection that reached the seat again states (P19)", () => {
		const double = portDouble({ observationsAcrossProcesses: true });
		const probe = watching();
		watchOwner(double, probe);
		const seat = { kind: "inherited", key: SERVED_OWNER } as const;

		// The session's own confirmed write was never learned here: the word that stated it did not arrive,
		// and nothing else about the session has been delivered either.
		expect(double.observations.read(CHILD.sessionId)).toBeUndefined();
		expect(probe.kinds).toEqual([]);

		// The session's process reaches the seat again, and its first word states what it holds now: the
		// count of the write this process never took. Adopting it is the one delivery a consumer needs to
		// read the storage that notice names, and the return mints nothing of the billing lifecycle — no
		// Round edge, no Turn and no session boundary.
		double.deliverObserved({ session: CHILD, owner: seat, commits: 1 }, 2);
		expect(probe.kinds).toEqual(["session_commit"]);
		expect(probe.notices).toEqual([{ session: CHILD, owner: seat, commits: 1 }]);
	});
});

describe("a session's own confirmed write leaves from the process that ran it (P16, P17)", () => {
	/** One binding whose own factory records the statement channel it was handed. */
	function bindingThatRecords(): { readonly double: PortDouble; readonly record: (sessionId: string) => void } {
		const double = portDouble({ observationsAcrossProcesses: true });
		let stated: ((sessionId: string) => void) | undefined;
		expect(
			double.bind(PROBE, {
				factory: context => {
					stated = context.recordSessionCommit;
					return {};
				},
			}).bound,
		).toBe(true);
		if (stated === undefined) throw new Error("the factory was not handed the statement channel");
		return { double, record: stated };
	}

	test("the confirmed write of a session whose owner is served elsewhere is handed over, once per write", () => {
		const { double, record } = bindingThatRecords();
		// The session this process runs, following an owner it does not serve: its own facts are recorded
		// here by the delivery that registered it, and that registration is itself handed over.
		double.deliverSession(
			{ kind: "inherited", key: ELSEWHERE_OWNER },
			{ event: { kind: "session_start", reason: "initial" }, session: CHILD },
		);

		record(CHILD.sessionId);
		expect(double.deliveredObservations).toEqual([
			{ session: CHILD, owner: { kind: "inherited", key: ELSEWHERE_OWNER } },
			{ session: CHILD, owner: { kind: "inherited", key: ELSEWHERE_OWNER }, commits: 1 },
		]);
		record(CHILD.sessionId);
		expect(double.deliveredObservations).toEqual([
			{ session: CHILD, owner: { kind: "inherited", key: ELSEWHERE_OWNER } },
			{ session: CHILD, owner: { kind: "inherited", key: ELSEWHERE_OWNER }, commits: 1 },
			{ session: CHILD, owner: { kind: "inherited", key: ELSEWHERE_OWNER }, commits: 2 },
		]);

		// What a connection that reaches this seat later states is what this process holds now, so a notice
		// that never arrived is recoverable by the reach itself rather than by a write of its own.
		expect(double.observations.readingsFor(ELSEWHERE_OWNER)).toEqual([
			{ session: CHILD, owner: { kind: "inherited", key: ELSEWHERE_OWNER }, commits: 2 },
		]);

		// A session this process holds no facts for states nothing at all: a notice with no identity has
		// nowhere to be placed, and nothing is handed over for it.
		record("session-this-process-never-saw");
		expect(double.deliveredObservations).toHaveLength(3);
	});

	test("a session whose owner this process serves is recorded here and handed to nobody", () => {
		const { double, record } = bindingThatRecords();
		double.deliverSession({ kind: "owner", key: SERVED_OWNER }, { event: { kind: "session_start", reason: "initial" } });
		double.deliverSession(
			{ kind: "inherited", key: SERVED_OWNER },
			{ event: { kind: "session_start", reason: "initial" }, session: CHILD },
		);

		record(CHILD.sessionId);
		// The owner that session follows is served in this process, so the notice is recorded here and
		// there is no other process to hand it to: what the session committed is already in this
		// process's own source and in the document it shares with the session.
		expect(double.deliveredObservations).toEqual([]);
		expect(double.observations.read(CHILD.sessionId)?.commits).toBe(1);
	});
});
