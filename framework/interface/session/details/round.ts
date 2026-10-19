/**
 * The Round axis: the period of agent activity that starts when the agent takes up input and ends
 * at quiescence, and the close-out wait an end may carry.
 *
 * Both event members are transitions. An edge says only that the period began or that it ended;
 * *how* the activity itself came out is deliberately not part of the model, because the harnesses
 * disagree about that vocabulary and because the agent's current state is a query rather than a
 * field of a past transition. What an end does state is how that end was established (see
 * {@link RoundEnding}), which is a fact about the observation rather than about the work.
 */
import type { FeedbackTransport } from "../../feedback";
import type { OwnerReference } from "../../state";
import type { SessionFacts } from "./facts";

/**
 * One semantic round event: the two edges of a `Round`.
 *
 * The edges are edge-triggered by identity within one binding: `round_start` opens a round and
 * `round_end` closes it, an edge that would repeat the state the previous one left is not delivered
 * at all, and work that continues inside a round — an automatic continuation, a drained queued
 * message — produces no edge.
 */
export type RoundEvent =
	| { readonly kind: "round_start" }
	| {
			readonly kind: "round_end";
			/**
			 * How that end was established. An end always states one, so a consumer never has to read
			 * an absent field as either case.
			 */
			readonly ending: RoundEnding;
	  };

/**
 * How a round's end was established, which is the one thing about an end the edge states.
 *
 * `confirmed` — the actual session's own end was established: a settle that scheduled no
 * continuation, confirmed against what that session reports about its own rest, or that same settle
 * confirmed where the host reported the session's disposal.
 *
 * `truncated` — the session went away while its round was still open and no end of the round was
 * ever stated. The round is closed because nothing can continue it any more, and the end says so:
 * the activity's own completion is not established.
 */
export type RoundEnding = "confirmed" | "truncated";

/**
 * The wait a session's close-out has, as the edge dispatched from the disposal carries it.
 *
 * A session's disposal is reported where the host is waiting for what the close-out owes — the
 * round the session left behind, and the commit that round's end publishes — so the framework bounds
 * that wait and tells the edge what it may spend. The budget is counted from the instant the
 * close-out was entered, and it is the *whole* budget there is: work that owes an asynchronous
 * effect bounds that effect's wait by what is left of it ({@link remaining}) rather than taking a
 * fresh budget of its own.
 *
 * The deadline stops this framework's *waiting*; it does not stop work that has already begun. For
 * every edge that does not come from a disposal there is no such wait at all, and the field is
 * absent.
 */
export interface CloseOutWait {
	/** The whole budget this close-out was given, in milliseconds, counted from entering it. */
	readonly budgetMs: number;
	/** The instant this close-out's wait ends, on the reading {@link remaining} is measured from. */
	readonly deadline: number;
	/**
	 * How many whole milliseconds of the budget this close-out's work may spend; `0` once that is
	 * over.
	 *
	 * It is what is left of the budget, less the resolution this framework's own coordinated waits
	 * take to observe anything: a wait that declares this as its budget therefore ends, and is
	 * refused, *inside* the close-out rather than a moment after the host was answered. It is rounded
	 * down, so what it states is never more than the deadline really leaves.
	 */
	remaining(): number;
}

/**
 * The facts one round edge carries, both to the adapter's hook and to the subscribed handler.
 *
 * A round edge has nothing an extension may not see: it carries the edge, the owner scope, the
 * actual session the edge came from, the faithful `hasUI` fact, the unified extension feedback
 * channel, and the close-out wait when the host reported a disposal.
 */
export interface RoundDelivery {
	/** The edge itself: which way the round axis moved. */
	readonly event: RoundEvent;
	/** The owner whose agent this edge concerns, as the adapter resolved it. */
	readonly owner: OwnerReference;
	/** The actual session this edge came from: its identity, its direct parent and its latest name. */
	readonly session: SessionFacts;
	/** Whether the session this edge came from has a UI, as the adapter resolved it. */
	readonly hasUI: boolean;
	/**
	 * The wait this edge's own close-out has, when the host reported the session's disposal and is
	 * waiting for what that close-out owes; absent on every edge that is not a close-out.
	 */
	readonly closeOut?: CloseOutWait;
	/** The transport this edge's extension feedback is published through. */
	readonly feedback: FeedbackTransport;
}

/** One extension handler for one semantic round event. */
export type RoundEventHandler = (delivery: RoundDelivery) => void | Promise<void>;

/** The round-event handlers one assembly injects, keyed by the edge each subscribes to. */
export type RoundEventHandlers = Readonly<Partial<Record<RoundEvent["kind"], RoundEventHandler>>>;
