/**
 * The framework's own half of the boundary between the process that serves an owner and the process
 * that runs a session following it (P1, P13): what one binding receives for the owner it serves, what
 * it adopts from a reading that arrived, and what it hands over for a session whose owner is
 * somewhere else.
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
import type { ObservedSession, SessionFacts } from "../../framework/core/protocol";
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
