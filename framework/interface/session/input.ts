/**
 * The input axis: the one fact that a session took up input the harness itself attributed to the
 * user.
 *
 * It is deliberately one edge and no pair. An ordinary prompt, a queued steer, a follow-up and a
 * user-invoked skill are the same fact here; nothing about the text, the images or what the
 * submission turned out to be is part of it. Input an extension itself submits is not this fact.
 */
import type { FeedbackTransport } from "../feedback";
import type { OwnerReference } from "../state";
import type { SessionFacts } from "./facts";

/** One semantic input event: a session took up input the harness attributed to the user. */
export type UserInputEvent = { readonly kind: "user_input" };

/**
 * The facts one user-input edge carries, both to the adapter's hook and to the subscribed handler.
 *
 * Like a round edge it has nothing an extension may not see: the edge itself, the session it belongs
 * to (a subagent's submission names the subagent, never its owner above it), the owner scope, the
 * faithful `hasUI` fact and the unified extension feedback channel.
 *
 * It carries no instant, because the harness publishes none: when the fact is observed is the
 * observer's own fact, exactly as it is for every other harness fact.
 */
export interface UserInputDelivery {
	/** The edge itself: that this session took up user input. */
	readonly event: UserInputEvent;
	/** The owner whose agent this submission concerns, as the adapter resolved it. */
	readonly owner: OwnerReference;
	/** The actual session the submission was admitted to: its identity, direct parent and latest name. */
	readonly session: SessionFacts;
	/** Whether the session this submission belongs to has a UI, as the adapter resolved it. */
	readonly hasUI: boolean;
	/** The transport this edge's extension feedback is published through. */
	readonly feedback: FeedbackTransport;
}

/** One extension handler for one semantic input edge. */
export type UserInputEventHandler = (delivery: UserInputDelivery) => void | Promise<void>;
