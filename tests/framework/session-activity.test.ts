/**
 * The activity axis at the framework's public consumption interface (S1; contract P10, P33).
 *
 * A session's Working/Idle is the framework's own answer rather than any host's: an adapter reports
 * run-cycle facts, the round synthesis decides which of them is a transition, and this axis states
 * the reading those transitions leave a session in — a Round the framework holds open is that
 * session working, a Round it confirmed ended is idle. That is why the reading is observed here
 * through the public binding instead of by reading a native run state: a host reports a run over
 * before its own work has unwound, so a session still retrying, still holding an asynchronous job
 * or still waiting on a delegation would look idle if its own run state were read.
 *
 * Each case below is an independent scenario of the same rule, and what a subscriber receives is the
 * sequence of readings itself — nothing is derived a second time from the round edges beside them:
 *
 * - an automatic continuation is a pause inside the Round, so the session keeps reading as working
 *   and no reading is delivered at all;
 * - a message the session has not taken up yet is not rest, so the Round survives it;
 * - work beyond the settle that still holds the session — a delegation running elsewhere, an
 *   asynchronous job whose result will wake it — keeps the Round open until that statement clears;
 * - a session that really comes to rest is idle, and only there.
 *
 * The axis is also the shape a session another process ran is read through: an observation states
 * that session's reading, and applying it drives no Round, no Turn and no billing lifecycle of its
 * own — the cases at the end hold the axis to exactly that.
 *
 * The last group is the promise that *leaving* a session's position is not an end (P33): an ordinary
 * switch and a view that moved close nothing, neither while the session is working nor while its
 * continuation is still to come, and the Round it had open is the same one a later settle is
 * confirmed as ending.
 */
import { describe, expect, test } from "bun:test";
import { createSessionActivityAxis, type SessionActivityAxis } from "../../framework/behaviors/session-activity";
import type { FeedbackTransport } from "../../framework/interface/feedback";
import type {
	RoundDelivery,
	SessionActivityDelivery,
	SessionFacts,
	SubscriptionGroup,
} from "../../framework/interface/session";
import type { OwnerReference } from "../../framework/interface/state";
import { type ExtensionDefinition, defineExtension } from "../../framework/interface";
import { type PortDouble, portDouble } from "./support/harness-port-double";

/** The definition under test: no command and no declaration — the activity axis is a subscription. */
const PROBE: ExtensionDefinition = defineExtension({ id: "activity-probe", displayName: "activityProbe" });

/** A top-level session: the one a harness resolves its own owner on. */
const MAIN: SessionFacts = { sessionId: "session-main", kind: "main", name: "主会话", unavailable: [] };

/** A session the main session spawned: its own identity, its own direct parent, the owner it follows. */
const CHILD: SessionFacts = {
	sessionId: "session-child",
	kind: "sub",
	parentSessionId: "session-main",
	name: "子代理",
	unavailable: [],
};

/** Another session following the same owner, so one session's reading can be told from another's. */
const SIBLING: SessionFacts = {
	sessionId: "session-sibling",
	kind: "sub",
	parentSessionId: "session-main",
	name: "兄弟",
	unavailable: [],
};

/** The session an ordinary switch enters, which is not the one it leaves. */
const OTHER: SessionFacts = { sessionId: "session-other", kind: "main", name: "另一会话", unavailable: [] };

const OWNER: OwnerReference = { kind: "owner", key: "main:activity" };
const INHERITED: OwnerReference = { kind: "inherited", key: "main:activity" };
const OTHER_OWNER: OwnerReference = { kind: "owner", key: "main:activity-2" };

/** One bound extension, and what its own subscription observed, in call order. */
interface Bound {
	readonly double: PortDouble;
	/** Every activity observation the framework delivered to this group's handler. */
	readonly activities: SessionActivityDelivery[];
	/** Every round edge the framework delivered to the same group, so the two axes are told apart. */
	readonly rounds: RoundDelivery[];
	/** The readings in order, as one compact list: `session=activity`. */
	readings(): string[];
	/** The kinds of the round edges delivered, in order. */
	edgeKinds(): string[];
}

/** Binds the probe over the double, observing both axes from one group. */
function bound(scope: "owner" | "session" = "session", target: ExtensionDefinition = PROBE): Bound {
	const double = portDouble();
	const activities: SessionActivityDelivery[] = [];
	const rounds: RoundDelivery[] = [];
	double.bind(target, {
		subscriptions: [
			{
				scope,
				events: {
					session_activity: delivery => {
						activities.push(delivery);
					},
					round_start: delivery => {
						rounds.push(delivery);
					},
					round_end: delivery => {
						rounds.push(delivery);
					},
				},
			},
		],
	});
	return {
		double,
		activities,
		rounds,
		readings: () => activities.map(delivery => `${delivery.session.sessionId}=${delivery.activity}`),
		edgeKinds: () => rounds.map(round => round.event.kind),
	};
}

/** The feedback channel one delivery carries, for the cases that drive the axis without a binding. */
const FEEDBACK: FeedbackTransport = { notify: () => {} };

describe("a session's activity is the reading the framework's own Round transitions leave it in (S1; P10)", () => {
	test("the Round a start opens reads as working, and the Round the framework confirms ended reads as idle", () => {
		const surface = bound();

		// Nothing has moved yet: an unestablished activity is not idleness, so no reading has been
		// delivered — and none may be read into that silence.
		expect(surface.readings()).toEqual([]);

		surface.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: MAIN });
		expect(surface.readings()).toEqual(["session-main=working"]);
		// The reading is the session's own, delivered beside that session's own facts: a display keys
		// it by this identity rather than by whoever happens to be viewed.
		expect(surface.activities[0]?.session).toEqual(MAIN);
		expect(surface.activities[0]?.event).toEqual({ kind: "session_activity" });
		expect(surface.activities[0]?.owner).toEqual(OWNER);

		surface.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: MAIN });
		expect(surface.readings()).toEqual(["session-main=working", "session-main=idle"]);
		// An end for a Round that is no longer open closes nothing, so it states no reading either:
		// idle is a reading already delivered rather than one repeated.
		surface.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: MAIN });
		expect(surface.readings()).toEqual(["session-main=working", "session-main=idle"]);
		expect(surface.edgeKinds()).toEqual(["round_start", "round_end"]);
	});

	test("an automatic continuation keeps the session working: its settle is a pause, not a reading", () => {
		const surface = bound();
		surface.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: MAIN });

		// The run settled having already scheduled its next piece of work — an automatic retry, a
		// compaction, a wake it queued for itself. The session is still working inside its Round, and
		// no reading is stated for a pause.
		surface.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: MAIN, willContinue: true });
		expect(surface.readings()).toEqual(["session-main=working"]);
		expect(surface.edgeKinds()).toEqual(["round_start"]);

		// A continuation that ran and settled again is the same pause read twice; only a settle that
		// scheduled nothing, confirmed at quiescence, is the transition that ends the Round.
		surface.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: MAIN });
		surface.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: MAIN, willContinue: true });
		surface.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: MAIN, quiescent: true });
		expect(surface.readings()).toEqual(["session-main=working", "session-main=idle"]);
	});

	test("a message still waiting to be taken up is not rest: the session keeps working through it", () => {
		const surface = bound();
		surface.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: MAIN });

		// The run is over but the session has not taken up what it accepted, so the work it describes
		// continues: the Round stays open and no reading moves.
		surface.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: MAIN, quiescent: false });
		expect(surface.readings()).toEqual(["session-main=working"]);

		// Once the session really comes to rest, the same settle — re-checked because the next relevant
		// fact re-verifies an unconfirmed candidate — is the end the reading follows.
		surface.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: MAIN, quiescent: true });
		expect(surface.readings()).toEqual(["session-main=working", "session-main=idle"]);
	});

	test("work beyond the settle keeps the session working until the holder states it is done", () => {
		const surface = bound();
		surface.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: MAIN });

		// The session is at rest and yet still held: a delegation running elsewhere, an asynchronous job
		// whose result will resume it. Reading it idle here would show a session as finished while the
		// work that will continue it is still running.
		surface.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: MAIN, quiescent: true, heldWork: true });
		expect(surface.readings()).toEqual(["session-main=working"]);

		// The holder states nothing is held any more, and only then does the same session read idle.
		surface.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: MAIN, quiescent: true, heldWork: false });
		expect(surface.readings()).toEqual(["session-main=working", "session-main:".replace(":", "=") + "idle"]);
	});

	test("a statement this surface did not obtain is not the holder's all-clear, so no reading moves", () => {
		const surface = bound();
		surface.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: MAIN });

		// A harness that establishes no held-work fact at all answers nothing, which is not the same as
		// "nothing is held": the Round stays open and the session keeps reading as working.
		surface.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: MAIN, quiescent: true, heldWork: "unstated" });
		expect(surface.readings()).toEqual(["session-main=working"]);
	});

	test("an activity the harness reported cancelled ends its Round and reads idle although work is held", () => {
		const surface = bound();
		surface.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: MAIN });

		// The activity was aborted: nothing will continue it, so work still running elsewhere is not what
		// its Round waits for, and the framework ends the Round on the session's own rest alone. That end
		// is a reading like any other — where the same held statement under an ordinary settle left the
		// session working (the case above).
		surface.double.deliverRound(OWNER, {
			event: { kind: "round_end" },
			session: MAIN,
			quiescent: true,
			heldWork: true,
			outcome: "cancelled",
		});
		expect(surface.readings()).toEqual(["session-main=working", "session-main=idle"]);
	});

	test("creating a session, or re-stating its facts, is not that session starting work", () => {
		const surface = bound();

		// An actual session appears: the harness reports its start and, later, its current facts. Both
		// are facts about the session existing rather than about it working, so neither states a reading.
		surface.double.deliverSession(OWNER, { event: { kind: "session_start", reason: "initial" }, session: CHILD });
		surface.double.deliverSession(OWNER, { event: { kind: "session_facts" }, session: CHILD });
		expect(surface.readings()).toEqual([]);
		expect(surface.rounds).toEqual([]);

		// The session's own first activity is what reads as working, and it is that session's reading.
		surface.double.deliverRound(INHERITED, { event: { kind: "round_start" }, session: CHILD });
		expect(surface.readings()).toEqual(["session-child=working"]);
	});
});

describe("the reading belongs to the session it was observed on (S1; P10)", () => {
	test("each session carries its own reading, and one session's end moves no other's", () => {
		const surface = bound();

		surface.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: MAIN });
		surface.double.deliverRound(INHERITED, { event: { kind: "round_start" }, session: CHILD });
		surface.double.deliverRound(INHERITED, { event: { kind: "round_start" }, session: SIBLING });
		expect(surface.readings()).toEqual(["session-main=working", "session-child=working", "session-sibling=working"]);

		// The child's Round ends; the parent's and the sibling's readings are their own and stay put.
		surface.double.deliverRound(INHERITED, { event: { kind: "round_end" }, session: CHILD });
		expect(surface.readings()).toEqual([
			"session-main=working",
			"session-child=working",
			"session-sibling=working",
			"session-child=idle",
		]);

		// A grandchild's reading is the grandchild's own session, never its parent's row.
		const grandchild: SessionFacts = {
			sessionId: "session-grand",
			kind: "sub",
			parentSessionId: "session-child",
			name: "孙代理",
			unavailable: [],
		};
		surface.double.deliverRound(INHERITED, { event: { kind: "round_start" }, session: grandchild });
		expect(surface.activities[surface.activities.length - 1]?.session).toEqual(grandchild);
	});

	test("an owner-scoped group is not moved by a subagent's reading, exactly as it is not by its Round", () => {
		const surface = bound("owner");

		// The owner's own work reads through it.
		surface.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: MAIN });
		expect(surface.readings()).toEqual(["session-main=working"]);

		// A subagent's activity belongs to the owner that session follows: it is observed by a `session`
		// group and never by one scoped to the owner's own deliveries.
		surface.double.deliverRound(INHERITED, { event: { kind: "round_start" }, session: CHILD });
		surface.double.deliverRound(INHERITED, { event: { kind: "round_end" }, session: CHILD });
		expect(surface.readings()).toEqual(["session-main=working"]);
	});
});

describe("a reading obtained from an observation source states that session and drives no lifecycle (S1; P10)", () => {
	/** One axis of its own, with a group observing both axes, for the cases that hand readings in. */
	function axisOf(): {
		readonly axis: SessionActivityAxis;
		readonly activities: SessionActivityDelivery[];
		readonly rounds: RoundDelivery[];
	} {
		const activities: SessionActivityDelivery[] = [];
		const rounds: RoundDelivery[] = [];
		const groups: SubscriptionGroup[] = [
			{
				scope: "session",
				events: {
					session_activity: delivery => {
						activities.push(delivery);
					},
					round_start: delivery => {
						rounds.push(delivery);
					},
					round_end: delivery => {
						rounds.push(delivery);
					},
				},
			},
		];
		return { axis: createSessionActivityAxis({ definition: PROBE, groups, reportFailure: () => {} }), activities, rounds };
	}

	test("a session this process never watched work reads as the observation states, with no Round invented", () => {
		const { axis, activities, rounds } = axisOf();

		// The reading of a session another process ran was obtained there; here it is applied as what it
		// is. It reaches the subscriber as that session's own reading...
		axis.observe({ session: CHILD, owner: INHERITED, activity: "working", hasUI: false, feedback: FEEDBACK });
		expect(activities.map(activity => `${activity.session.sessionId}=${activity.activity}`)).toEqual([
			"session-child=working",
		]);

		// ...and it drives none of the billing lifecycle: no edge is dispatched for it and nothing of the
		// Round axis is touched, so no consumer of rounds — an accounting boundary above all — is reached
		// by observing activity.
		expect(rounds).toEqual([]);

		// A reading that states what this axis already delivered states nothing new.
		axis.observe({ session: CHILD, owner: INHERITED, activity: "working", hasUI: false, feedback: FEEDBACK });
		expect(activities.length).toBe(1);

		// A later observation of the same session — it came to rest — is delivered, and still no Round is
		// invented for it.
		axis.observe({ session: CHILD, owner: INHERITED, activity: "idle", hasUI: false, feedback: FEEDBACK });
		expect(activities.map(activity => activity.activity)).toEqual(["working", "idle"]);
		expect(rounds).toEqual([]);
	});

	test("one session's observation never states another session's reading", () => {
		const { axis, activities } = axisOf();
		axis.observe({ session: CHILD, owner: INHERITED, activity: "working", hasUI: false, feedback: FEEDBACK });
		axis.observe({ session: CHILD, owner: INHERITED, activity: "working", hasUI: false, feedback: FEEDBACK });
		axis.observe({ session: SIBLING, owner: INHERITED, activity: "idle", hasUI: false, feedback: FEEDBACK });

		// The sibling's own reading is delivered even though the child already reads as working, and the
		// child's repeated reading states nothing: the axis keys the reading by the session observed.
		expect(activities.map(activity => `${activity.session.sessionId}=${activity.activity}`)).toEqual([
			"session-child=working",
			"session-sibling=idle",
		]);
	});
});

describe("leaving a session's position ends nothing of it (S1; P33)", () => {
	/** An ordinary switch out of one session and into another, as the harness reports it. */
	function switchAway(surface: Bound): void {
		surface.double.deliverSession(OWNER, {
			event: { kind: "session_end", reason: "transferred" },
			session: MAIN,
		});
		surface.double.deliverSession(OTHER_OWNER, {
			event: { kind: "session_start", reason: "resume" },
			session: OTHER,
		});
		// A re-reported view of the other session's facts, which is what a view that moved publishes.
		surface.double.deliverSession(OTHER_OWNER, { event: { kind: "session_facts" }, session: OTHER });
	}

	test("while the session is working, an ordinary switch states no reading and closes no Round", () => {
		const surface = bound();
		surface.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: MAIN });
		expect(surface.readings()).toEqual(["session-main=working"]);

		switchAway(surface);

		// The session that was left is not idle because the view left it, and nothing ended its Round:
		// no reading moved and no edge was dispatched. A save is not a separate promise here — it is what
		// a `round_end` reaches in a consumer, and none was dispatched.
		expect(surface.readings()).toEqual(["session-main=working"]);
		expect(surface.edgeKinds()).toEqual(["round_start"]);

		// The Round it had is still the one open: the settle that really ends its work ends that same
		// Round, exactly once, after the switch.
		surface.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: MAIN, quiescent: true });
		expect(surface.edgeKinds()).toEqual(["round_start", "round_end"]);
		expect(surface.readings()).toEqual(["session-main=working", "session-main=idle"]);
	});

	test("while the continuation is still to come, the switch leaves that same Round open", () => {
		const surface = bound();
		surface.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: MAIN });
		// The work paused having already scheduled its continuation — a drained queued message, a pending
		// wake, a delegation whose result will resume it.
		surface.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: MAIN, willContinue: true });
		surface.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: MAIN, quiescent: true, heldWork: true });

		switchAway(surface);
		expect(surface.readings()).toEqual(["session-main=working"]);
		expect(surface.edgeKinds()).toEqual(["round_start"]);

		// The continuation ran and came to rest afterwards: the Round the switch left open is the one this
		// settle is confirmed as ending, and no second Round was opened by the switch.
		surface.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: MAIN });
		surface.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: MAIN, quiescent: true });
		expect(surface.edgeKinds()).toEqual(["round_start", "round_end"]);
		expect(surface.readings()).toEqual(["session-main=working", "session-main=idle"]);
	});

	test("a transfer keeps the binding delivering, so the session's own later work still reads", () => {
		const surface = bound();
		surface.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: MAIN });
		switchAway(surface);

		// A transferred end is not the session's own end: the same session's next activity is delivered
		// and reads as its own, and the round it opened is the session's own identity rather than the
		// view's.
		surface.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: MAIN, quiescent: true });
		surface.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: MAIN });
		expect(surface.readings()).toEqual(["session-main=working", "session-main=idle", "session-main=working"]);
	});
});
