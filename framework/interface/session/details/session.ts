/** Session entry, exit and fact-change deliveries. */
import type { FeedbackTransport } from "../../feedback";
import type { OwnerCapabilityHandle, OwnerReference } from "../../state";
import type { SessionEndReason, SessionFacts, SessionStartReason } from "./facts";

/**
 * One semantic session event: which way the session axis moved, and why — or, for a fact that moved
 * nothing, the session's own facts as the harness now reports them.
 *
 * `session_start` and `session_end` are a symmetric pair. A `session_start` opens one owner's life
 * as the current session and a `session_end` closes it, and a transition that changes which session
 * is current is one of each — `session_end(transferred)` for the owner being left, followed by
 * `session_start(reason)` for the owner being entered. A navigation that leaves the current owner
 * alone (a tree jump, a reload, a same-file resume, an in-place context reset) is not a transition
 * at all: it produces no event, so nothing downstream can mistake it for one.
 *
 * `session_facts` is neither a transition nor a boundary. The harness reported that a fact it holds
 * about one actual session — its identity, its direct parent or its latest name — has changed since
 * the delivery that carried it last, and it says so as it changes rather than waiting for the
 * session's next boundary. Nothing the framework owns moves for it.
 */
export type SessionEvent =
	| { readonly kind: "session_start"; readonly reason: SessionStartReason }
	| { readonly kind: "session_end"; readonly reason: SessionEndReason }
	| { readonly kind: "session_facts" };

/**
 * The facts one subscribed extension handler receives for a semantic session event.
 *
 * It carries the event, the actual session it concerns, the owner scope, the faithful `hasUI` fact,
 * the unified extension feedback channel, and the owner-scoped capability a start handler may
 * retain. It carries no branch payloads and no framework notice channel: an extension reacts to a
 * transition rather than reading persistence, and it never publishes on the framework's own notice
 * channel.
 */
export interface SessionEventDelivery {
	readonly event: SessionEvent;
	/** The actual session this event is about. A subagent's boundary names the subagent itself. */
	readonly session: SessionFacts;
	readonly owner: OwnerReference;
	readonly hasUI: boolean;
	/** The unified extension feedback channel of this dispatch. */
	readonly feedback: FeedbackTransport;
	/**
	 * The owner-scoped capability this handler may retain for the effects it drives outside this
	 * delivery.
	 *
	 * On a `session_end` delivery the capability is inert from birth: the owner it names has already
	 * been retired by the time the handler runs.
	 */
	readonly capability: OwnerCapabilityHandle;
}

/** One extension handler for one semantic session event. */
export type SessionEventHandler = (delivery: SessionEventDelivery) => void | Promise<void>;

/** The session-event handlers one assembly injects, keyed by the event each subscribes to. */
export type SessionEventHandlers = Readonly<Partial<Record<SessionEvent["kind"], SessionEventHandler>>>;

