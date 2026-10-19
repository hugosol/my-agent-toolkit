/**
 * The commit axis: one actual session's own write of its extension data was confirmed.
 *
 * It is the one fact a session can state about itself that no harness adapter can state for it: the
 * process that *runs* the session confirmed a write into the storage both processes share. What the
 * event is *not* is a reading of that storage: it carries no content, no figure and no consumption
 * statistic, so a consumer that adopts it reads the storage itself and takes what the file really
 * holds. Nothing of the framework's own bookkeeping moves for it — no Round is opened or ended, no
 * Turn is attributed and no request is accounted.
 */
import type { FeedbackTransport } from "../../feedback";
import type { OwnerReference } from "../../state";
import type { SessionFacts } from "./facts";

/** One semantic event: one actual session's own write of its extension data was confirmed. */
export type SessionCommitEvent = { readonly kind: "session_commit" };

/**
 * The facts one commit notice carries: the session whose write was confirmed, and the count itself.
 *
 * The identity is the session's own, as the process that ran it resolved it, and the owner it
 * follows is the seat this notice belongs to. The count is the notice rather than a measurement: it
 * is the running total of confirmed writes that process states, and what a consumer does with a move
 * is read the storage, never compute anything from the number.
 */
export interface SessionCommitObservation {
	/** The actual session whose own write was confirmed: its identity, its direct parent and its latest name. */
	readonly session: SessionFacts;
	/** The owner whose agent this notice concerns, as the deliveries that carried the session resolved it. */
	readonly owner: OwnerReference;
	/** How many writes of that session's own extension data its own process has confirmed. */
	readonly commits: number;
	/** Whether the session this notice is about has a UI, as it was resolved. */
	readonly hasUI: boolean;
	/** The transport this notice's extension feedback is published through. */
	readonly feedback: FeedbackTransport;
}

/** The facts one commit notice carries to the subscribed handler. */
export interface SessionCommitDelivery extends SessionCommitObservation {
	/** The event itself: that the count of this session's own confirmed writes moved. */
	readonly event: SessionCommitEvent;
}

/** One extension handler for one session's own confirmed storage write. */
export type SessionCommitHandler = (delivery: SessionCommitDelivery) => void | Promise<void>;

/** The commit handlers one assembly injects, keyed by the event it subscribes to. */
export type SessionCommitHandlers = Readonly<Partial<Record<SessionCommitEvent["kind"], SessionCommitHandler>>>;
