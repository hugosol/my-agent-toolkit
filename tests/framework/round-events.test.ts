/**
 * The semantic round axis at the framework's adapter contract (S2; F6; contract P8, P9).
 *
 * The seam is `bindExtension` plus the port a harness provides, driven by the shared
 * port double: one semantic round edge, and the handler an assembly injected for it. What the
 * framework owes there is observed directly — a `round_start` reaches the handler subscribed to
 * `round_start` and nothing else, the edge carries no payload beyond the fact that it happened,
 * the framework applies no behavior of its own to a round (a round is not a session boundary:
 * no cell is seeded or retired and no area is rendered), and one handler's failure disturbs
 * neither the framework nor another subscriber.
 *
 * Which native event becomes which edge — and, above all, when no edge is produced at all — is
 * the adapter's synthesis, observed at the OMP seam in `round.test.ts`. This suite drives the
 * edges themselves, and the idle query the arm path asks for its initial state.
 */
import { describe, expect, test } from "bun:test";
import { CODEBASE_TOOLS } from "../../extensions/codebase-tools/definition";
import type { CommandDelivery, OwnerReference } from "../../framework/core/protocol";
import { type CommandImplementations, type ExtensionDefinition, defineExtension } from "../../framework/public";
import { type PortDouble, portDouble } from "./support/harness-port-double";

/** The owner a delivery acts on unless one is named. */
const OWNER: OwnerReference = { kind: "owner", key: "main:round-events" };

/**
 * A definition whose start handler throws: the framework's own delivery, and every other
 * subscriber, must survive it.
 */
const THROWING: ExtensionDefinition = defineExtension({
	id: "throwing-tools",
	displayName: "throwingTools",
	marker: { text: "◈ throwing" },
});

/** A definition whose whole behavior is one directed command the probe implementation answers. */
function probeDefinition(id: string): ExtensionDefinition {
	return defineExtension({
		id,
		displayName: id,
		commands: [{ type: "directed", name: id, state: "enabled" }],
		marker: { text: `◈ ${id}` },
	});
}

/**
 * An implementation that only asks the delivery's idle query, recording every answer: this is
 * what the arm path does with it, and it is why the answer never has to arrive as an event.
 */
function queryingActions(command: string): {
	readonly commands: CommandImplementations;
	readonly answers: Array<boolean | undefined>;
} {
	const answers: Array<boolean | undefined> = [];
	return {
		answers,
		commands: {
			[command]: {
				run: (_directive, delivery: CommandDelivery) => {
					answers.push(delivery.canAcceptInput());
				},
			},
		},
	};
}

describe("a round edge reaches the handler subscribed to it (F6, P8)", () => {
	test("each edge kind is delivered to its own subscriber", () => {
		const double = portDouble();
		const seen: string[] = [];
		double.bind(CODEBASE_TOOLS, {
			subscriptions: [{ scope: "owner", events: {
				round_start: delivery => void seen.push(`start-handler:${delivery.event.kind}`),
				round_end: delivery => void seen.push(`end-handler:${delivery.event.kind}`),
			} }],
		});

		double.deliverRound(OWNER, { event: { kind: "round_start" } });
		double.deliverRound(OWNER, { event: { kind: "round_end" } });

		expect(seen).toEqual(["start-handler:round_start", "end-handler:round_end"]);
	});

	test("the edge carries no payload beyond the fact that it happened", () => {
		const double = portDouble();
		const payloads: Array<readonly string[]> = [];
		double.bind(CODEBASE_TOOLS, {
			subscriptions: [{ scope: "owner", events: {
				round_start: delivery => void payloads.push(Object.keys(delivery.event)),
				round_end: delivery => void payloads.push(Object.keys(delivery.event)),
			} }],
		});

		// An automatic continuation and an ordinary answer end the same way, so the edge names no
		// outcome, no model turn, no messages: the kind is all there is. What the agent's state
		// actually is comes from the idle query, never from here.
		double.deliverRound(OWNER, { event: { kind: "round_start" } });
		double.deliverRound(OWNER, { event: { kind: "round_end" } });

		expect(payloads).toEqual([["kind"], ["kind"]]);
	});

	test("the delivery names the owner scope, the hasUI fact and the feedback channel", () => {
		const double = portDouble();
		const seen: Array<{ readonly owner: OwnerReference; readonly hasUI: boolean }> = [];
		double.bind(CODEBASE_TOOLS, {
			subscriptions: [{ scope: "owner", events: {
				round_end: delivery => {
					delivery.feedback.notify("info", "push failed");
					seen.push({ owner: delivery.owner, hasUI: delivery.hasUI });
				},
			} }],
		});

		// A settle is only evidence of a round that was open: the run reported as begun here is the
		// round whose end this delivery is.
		double.deliverRound(OWNER, { event: { kind: "round_start" } });
		const boundary = double.deliverRound(OWNER, { event: { kind: "round_end" }, hasUI: false });

		expect(seen).toEqual([{ owner: OWNER, hasUI: false }]);
		expect(boundary.feedback).toEqual([{ level: "info", message: "push failed" }]);
	});

	test("the framework applies no behavior of its own to a round", () => {
		const double = portDouble();
		double.bind(CODEBASE_TOOLS, { subscriptions: [{ scope: "owner", events: { round_start: () => {} } }] });

		double.deliverRound(OWNER, { event: { kind: "round_start" } });

		// No boundary was crossed: no cell was seeded, so the owner still reads its declared
		// default, and no area was rendered — the marker follows State, not the round.
		expect(double.markerUpdates).toEqual([]);
		expect(double.run("codebase-tools", { owner: OWNER }).persisted).toEqual([{ enabled: true }]);
	});

	test("a throwing handler is reported, and another subscriber still receives its edge", () => {
		const double = portDouble();
		const received: string[] = [];
		double.bind(THROWING, {
			subscriptions: [{ scope: "owner", events: {
				round_start: () => {
					throw new Error("boom");
				},
			} }],
		});
		double.bind(CODEBASE_TOOLS, { subscriptions: [{ scope: "owner", events: { round_start: delivery => void received.push(delivery.event.kind) } }] });

		double.deliverRound(OWNER, { event: { kind: "round_start" } });

		expect(double.diagnostics).toEqual(["throwing-tools: round_start handler failed: boom"]);
		expect(received).toEqual(["round_start"]);
	});
});

describe("a definition that observes no round injects no round hook (F6)", () => {
	test("no round subscription means the harness is asked for no round deliveries", () => {
		const double = portDouble();

		double.bind(CODEBASE_TOOLS);

		// The framework has no behavior of its own to apply to a round, so an assembly that
		// subscribed to none is never handed one: nothing is registered for it.
		expect(double.registrations).not.toContain("onRound");
	});

	test("an injected round handler is what registers the hook", () => {
		const double = portDouble();

		double.bind(CODEBASE_TOOLS, { subscriptions: [{ scope: "owner", events: { round_end: () => {} } }] });

		expect(double.registrations).toEqual([
			"label:codeBaseTools",
			"onSession",
			"onRound",
			"onRunInitiation",
			"command:codebase-tools",
		]);
	});
});

describe("the idle query is the arm path's own fact (F6, P9)", () => {
	test("the query answers the session's idle fact, with no event delivered first", () => {
		const double = portDouble();
		const { commands: actions, answers } = queryingActions("idle-probe");
		double.bind(probeDefinition("idle-probe"), { commands: actions });

		// Nothing has happened in this session: no session event, no round edge. The arm path
		// still gets its answer, because the query asks the session rather than reading a payload
		// some earlier event may or may not have carried.
		const idle = double.run("idle-probe", { owner: OWNER });
		const busy = double.run("idle-probe", { owner: OWNER, idle: "busy" });

		expect(answers).toEqual([true, false]);
		expect(idle.canAcceptInput).toBe(true);
		expect(busy.canAcceptInput).toBe(false);
	});

	test("a harness that reports no idle fact answers nothing instead of a fabricated value", () => {
		const double = portDouble();
		const { commands: actions, answers } = queryingActions("unreported-probe");
		double.bind(probeDefinition("unreported-probe"), { commands: actions });

		const run = double.run("unreported-probe", { owner: OWNER, idle: "unreported" });

		// The session's surface reports no idle fact at all, so the query answers nothing: a
		// caller that needs the fact decides what to do about its absence, and no caller can read
		// a value the harness never reported as the idle truth.
		expect(answers).toEqual([undefined]);
		expect(run.canAcceptInput).toBeUndefined();
	});

	test("no delivery carries the idle fact as a field", () => {
		const double = portDouble();
		const sessionKeys: string[] = [];
		const roundKeys: string[] = [];
		double.bind(CODEBASE_TOOLS, {
			subscriptions: [{ scope: "owner", events: {
				session_start: delivery => void sessionKeys.push(...Object.keys(delivery)),
				round_start: delivery => void roundKeys.push(...Object.keys(delivery)),
			} }],
		});

		double.deliverSession(OWNER);
		double.deliverRound(OWNER);

		// The idle fact is a query, never a payload: neither axis's delivery grows a field for it,
		// so an extension can never mistake a stale event for the agent's current state. The session
		// axis's delivery carries one thing more than the round axis's — the capability a handler
		// may retain for the effects it drives outside the delivery (F13) — and both carry the
		// actual session's own identity, direct parent and latest name (P57).
		expect(sessionKeys.sort()).toEqual(["capability", "event", "feedback", "hasUI", "owner", "session"]);
		expect(roundKeys.sort()).toEqual(["event", "feedback", "hasUI", "owner", "session"]);
	});
});

describe("a cancelled or failed activity ends its round without waiting on work beyond it (P21)", () => {
	/** One definition whose round end is recorded, so every case reads the same sequence. */
	function endRecorder(): { readonly double: PortDouble; readonly ends: string[] } {
		const double = portDouble();
		const ends: string[] = [];
		double.bind(CODEBASE_TOOLS, {
			subscriptions: [{ scope: "owner", events: { round_end: delivery => void ends.push(delivery.event.kind) } }],
		});
		return { double, ends };
	}

	test("a cancelled settle ends the round although work beyond it still holds the session", () => {
		const { double, ends } = endRecorder();

		double.deliverRound(OWNER, { event: { kind: "round_start" } });
		// The session settled and its own work has unwound, while the statement about work beyond the
		// run says something is still held. A round waiting on that statement could never close again:
		// the activity it belongs to was cancelled, so nothing it was waiting on will resume it.
		double.deliverRound(OWNER, { event: { kind: "round_end" }, outcome: "cancelled", heldWork: true });

		expect(ends).toEqual(["round_end"]);
	});

	test("a failed settle ends it the same way", () => {
		const { double, ends } = endRecorder();

		double.deliverRound(OWNER, { event: { kind: "round_start" } });
		double.deliverRound(OWNER, { event: { kind: "round_end" }, outcome: "failed", heldWork: true });

		expect(ends).toEqual(["round_end"]);
	});

	test("an ordinary settle still waits for what is held, and ends once that statement clears", () => {
		const { double, ends } = endRecorder();

		double.deliverRound(OWNER, { event: { kind: "round_start" } });
		// The ordinary answer: nothing scheduled a continuation, and a delegation this session waits
		// on is still running. Its Round stays open — the work it is waiting on is what will continue
		// it — and only the statement that nothing is held ends it.
		double.deliverRound(OWNER, { event: { kind: "round_end" }, outcome: "completed", heldWork: true });
		expect(ends).toEqual([]);

		double.deliverRound(OWNER, { event: { kind: "round_end" }, outcome: "completed", heldWork: false });
		expect(ends).toEqual(["round_end"]);
	});

	test("a settle that stated no outcome is not a cancellation", () => {
		const { double, ends } = endRecorder();

		double.deliverRound(OWNER, { event: { kind: "round_start" } });
		// This surface established no outcome for the activity, which is not the same as stating it
		// was cancelled: the round then waits on what every other settle waits on.
		double.deliverRound(OWNER, { event: { kind: "round_end" }, heldWork: true });

		expect(ends).toEqual([]);
	});

	test("a cancelled activity that has not settled yet closes nothing", () => {
		const { double, ends } = endRecorder();

		double.deliverRound(OWNER, { event: { kind: "round_start" } });
		// The session's own work has not unwound: the cancellation is a fact about how the activity
		// ended, never by itself a reason to publish an end before the host settles.
		double.deliverRound(OWNER, { event: { kind: "round_end" }, outcome: "cancelled", quiescent: false });

		expect(ends).toEqual([]);
	});
});
