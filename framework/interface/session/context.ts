/**
 * The context axis: one session's own context reading, and the event delivered where it moved.
 *
 * The reading is a measurement of the moment: the conversation tokens the host's public context
 * reading reported and the provider/exact model the session ran at that same instant. It is never
 * persisted and never derived from a consumption figure; a later collection replaces it.
 */
import type { FeedbackTransport } from "../feedback";
import type { OwnerReference } from "../state";
import type { SessionFacts } from "./facts";

/**
 * One session's own context reading, as the collection that produced it measured it.
 *
 * The tokens are what the host's public context reading reported for that session's conversation at
 * the instant it was collected, and the model is the one that session ran at that same instant — the
 * two travel together because the figure is displayed against *that* model's channel budget.
 *
 * A host that states an unknown context (pi's own `null` right after a compaction, say) states no
 * reading at all rather than a count of zero.
 */
export interface SessionContextReading {
	/** The conversation tokens the session's own context held, as its host reported them. */
	readonly tokens: number;
	/** The provider of that session's model at the instant the reading was collected. */
	readonly provider?: string;
	/** The exact id of that session's model at the instant the reading was collected. */
	readonly model?: string;
}

/**
 * One semantic context event: a session's own context reading moved.
 *
 * It is edge-triggered by reading: a collection that states the reading the source already held is
 * not a change and is delivered to nobody, while a collection that states a different one is.
 */
export type SessionContextEvent = { readonly kind: "session_context" };

/**
 * The facts one context edge carries, both to the adapter's hook and to the subscribed handler.
 *
 * Nothing here is withheld from an extension: the delivery names the session and its owner, the
 * reading as it moved, and the same two seams every other subscriber delivery carries — the faithful
 * `hasUI` fact and the unified extension feedback channel. A wider observation scope grants no write
 * path, and this delivery has none either.
 */
export interface SessionContextDelivery {
	/** The edge itself: this session's context reading moved. */
	readonly event: SessionContextEvent;
	/** The actual session the reading belongs to: its identity, its direct parent and its latest name. */
	readonly session: SessionFacts;
	/** The owner that session follows, as the adapter resolved it. */
	readonly owner: OwnerReference;
	/** The reading this collection left: the tokens and the model they were collected with. */
	readonly reading: SessionContextReading;
	/** Whether the session this reading came from has a UI, as the adapter resolved it. */
	readonly hasUI: boolean;
	/** The transport this edge's extension feedback is published through. */
	readonly feedback: FeedbackTransport;
}

/** One extension handler for one semantic context edge. */
export type SessionContextHandler = (delivery: SessionContextDelivery) => void | Promise<void>;

/** The context handlers one assembly injects, keyed by the event it subscribes to. */
export type SessionContextHandlers = Readonly<Partial<Record<SessionContextEvent["kind"], SessionContextHandler>>>;
