/**
 * The unobserved axis: one actual session's observation ceasing to be available.
 *
 * It is what the framework states when the source the readings came from is gone — the connection a
 * session the harness ran in another process delivered over has ended, however it ended. What it is
 * *not* is a statement about the session: nothing here says the session stopped working, failed or
 * finished, because a lost connection is evidence of nothing about the work itself. The reading the
 * framework held is withdrawn, the session's identity stays, and no Round, Turn or billing fact is
 * minted for the loss.
 */
import type { FeedbackTransport } from "../../feedback";
import type { OwnerReference } from "../../state";
import type { SessionFacts } from "./facts";

/** One semantic event: one actual session's observation ceasing to be available. */
export type SessionUnobservedEvent = { readonly kind: "session_unobserved" };

/**
 * The facts one unavailability delivery carries: the session whose readings are gone, and the seams
 * every other handler delivery carries.
 *
 * The identity is the same one every reading carried — the session's own facts as the process that
 * ran it resolved them, and the owner it follows — so a tree that placed the session keeps placing
 * it where its direct parent puts it after the readings are withdrawn.
 */
export interface SessionUnobservedObservation {
	/** The actual session whose observation is no longer available: its identity and latest name. */
	readonly session: SessionFacts;
	/** The owner whose agent this loss concerns, as the deliveries that carried the session resolved it. */
	readonly owner: OwnerReference;
	/** Whether the session this loss is about has a UI, as it was resolved. */
	readonly hasUI: boolean;
	/** The transport this loss's extension feedback is published through. */
	readonly feedback: FeedbackTransport;
}

/** The facts one unavailability delivery carries to the subscribed handler. */
export interface SessionUnobservedDelivery extends SessionUnobservedObservation {
	/** The event itself: that this session's observation is no longer available. */
	readonly event: SessionUnobservedEvent;
}

/** One extension handler for one session's observation becoming unavailable. */
export type SessionUnobservedHandler = (delivery: SessionUnobservedDelivery) => void | Promise<void>;

/** The unavailability handlers one assembly injects, keyed by the event each subscribes to. */
export type SessionUnobservedHandlers = Readonly<
	Partial<Record<SessionUnobservedEvent["kind"], SessionUnobservedHandler>>
>;
