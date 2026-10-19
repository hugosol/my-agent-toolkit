/**
 * The activity axis: the reading one actual session is in, delivered where it moved.
 *
 * It is an *observation* rather than an edge — it states the reading a session is in instead of a
 * transition it crossed — so one shape serves both the session this process watched work and one
 * whose reading was obtained elsewhere. There is no edge pair here and none is implied: a session
 * that stays in the reading it was already delivered in produces nothing, whether the fact behind it
 * was a repeated native signal or an observation stating what this process already holds.
 */
import type { FeedbackTransport } from "../feedback";
import type { OwnerReference } from "../state";
import type { SessionFacts } from "./facts";

/**
 * One actual session's current agent activity: `working` while a continuous period of work remains
 * ongoing, `idle` once nothing remains to continue it.
 *
 * It is the framework's own answer and never a harness's: an adapter reports run-cycle facts and the
 * framework's synthesis decides whether a Round is open for that session, which is the whole of
 * this value.
 */
export type AgentActivity = "working" | "idle";

/**
 * One activity observation: the reading one actual session is now in, beside the facts that name
 * the session it belongs to.
 *
 * The reading itself is always the framework's: whichever path carried it, it is the answer the
 * round axis reached where that session's facts were observed, and nothing here re-decides it.
 */
export interface SessionActivityObservation {
	/**
	 * The actual session this reading is about: its identity, its direct parent and its latest name.
	 * A subagent's reading names the subagent's own session here while its owner is the top-level
	 * main session it follows.
	 */
	readonly session: SessionFacts;
	/** The owner whose agent this reading concerns, as the facts that carried it resolved it. */
	readonly owner: OwnerReference;
	/** The session's activity, as the framework's round axis states it. */
	readonly activity: AgentActivity;
	/** Whether the session this reading is about has a UI, as it was resolved. */
	readonly hasUI: boolean;
	/** The transport this reading's extension feedback is published through. */
	readonly feedback: FeedbackTransport;
}

/**
 * The activity axis's one event kind: one actual session's activity, delivered where it moved.
 *
 * The transition that moves it stays the round axis's own: a Round the framework opens for a session
 * is that session working, and a Round it has ended is that session idle.
 */
export type SessionActivityEvent = { readonly kind: "session_activity" };

/**
 * The facts one activity observation carries to the subscribed handler.
 *
 * Like a round edge it withholds nothing an extension may not see: the same value that moves the
 * reading is the value that reaches the handler. It is no arm path: an observation of activity
 * grants no capability and drives no effect.
 */
export interface SessionActivityDelivery extends SessionActivityObservation {
	/** The event itself: that this session's activity was observed, carrying the reading above. */
	readonly event: SessionActivityEvent;
}

/** One extension handler for the activity axis. */
export type SessionActivityEventHandler = (delivery: SessionActivityDelivery) => void | Promise<void>;

/** The activity handlers one assembly injects, keyed by the kind each subscribes to. */
export type SessionActivityEventHandlers = Readonly<
	Partial<Record<SessionActivityEvent["kind"], SessionActivityEventHandler>>
>;
