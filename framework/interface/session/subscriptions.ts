/**
 * The Session capability's event subscription surface: the event kinds one implementation may
 * subscribe to, the group that carries its handlers, and the delivery each handler receives.
 *
 * The session axis is a *reconciliation* trigger as well as a subscription — the framework applies
 * its own behavior for every session delivery whether or not a handler arrived — while the round,
 * activity, Turn, input, context, commit and unobserved axes are subscription only. A definition
 * stays plain data: it names no handler, and an implementation supplies its handlers at assembly
 * time through one {@link SubscriptionGroup} per group it declares.
 *
 * Framework processing precedes handlers. Ordinary dispatch invokes handlers in declaration order,
 * reports throws/rejections through adapter diagnostics, and does not wait for asynchronous work.
 * A disposal Round close-out instead waits within its CloseOutWait; an expired wait does not cancel
 * work already publishing. Disposal is not a separate extension event.
 */
import type { SessionActivityDelivery, SessionActivityEvent } from "./details/activity";
import type { SessionCommitDelivery, SessionCommitEvent } from "./details/commit";
import type { SessionContextDelivery, SessionContextEvent } from "./details/context";
import type { SessionEvent, SessionEventDelivery } from "./details/session";
import type { UserInputDelivery, UserInputEvent } from "./details/input";
import type { RoundDelivery, RoundEvent } from "./details/round";
import type { TurnEndDelivery, TurnStartDelivery, TurnEvent } from "./details/turn";
import type { SessionUnobservedDelivery, SessionUnobservedEvent } from "./details/unobserved";

/**
 * The observation scope one subscription group declares.
 *
 * `owner` — the group observes the owner session's own deliveries only: a boundary, a round edge
 * or a Turn of a subagent session belongs to the owner that session follows, so a group that
 * drives an owner-scoped effect is never moved by a subagent's work. `session` — the group observes
 * every actual session the adapter reports, main or sub, with that session's own identity, its
 * direct parent, its latest name, the handle of the task it was spawned for and — on the start
 * alone that proves the session was beginning — the model and effective effort it began on.
 *
 * The two scopes share one dispatch mechanism and differ only in which deliveries a group admits.
 */
export type ObservationScope = "owner" | "session";

/**
 * One subscription group: the scope its observations cover and the handlers it subscribes.
 *
 * An assembly delivers one of these per group it declares, and the scope is declared once for the
 * whole group — not per event kind and not per handler. A group with no entry for an event kind
 * subscribes nothing for it.
 */
export interface SubscriptionGroup {
	readonly scope: ObservationScope;
	readonly events: SemanticEventHandlers;
}

/**
 * Any semantic lifecycle event the framework models: the session axis, the round axis, the activity
 * axis, the Turn axis, the input axis, the context axis, one session's own confirmed storage write
 * and one session's observation becoming unavailable.
 *
 * The axes are orthogonal and never merged — entering a session is not starting work, starting work
 * does not change which session is current, a Turn is not a Round, and input arriving is not itself
 * work — so this union exists only where one assembly injects its handlers for all of them.
 */
export type SemanticEvent =
	| SessionEvent
	| RoundEvent
	| SessionActivityEvent
	| TurnEvent
	| UserInputEvent
	| SessionContextEvent
	| SessionCommitEvent
	| SessionUnobservedEvent;

/** The delivery each semantic event kind carries, so a handler's kind and its facts stay paired. */
export interface SemanticEventDeliveryMap {
	readonly session_start: SessionEventDelivery;
	readonly session_end: SessionEventDelivery;
	/** A facts delivery carries the session's current facts and no branch payload of its own. */
	readonly session_facts: SessionEventDelivery;
	readonly round_start: RoundDelivery;
	readonly round_end: RoundDelivery;
	/** The activity axis's one kind: the reading one session is in, delivered where it moved. */
	readonly session_activity: SessionActivityDelivery;
	readonly turn_start: TurnStartDelivery;
	readonly turn_end: TurnEndDelivery;
	readonly user_input: UserInputDelivery;
	readonly session_context: SessionContextDelivery;
	/** The commit axis's one kind: a session's own confirmed write of its extension data. */
	readonly session_commit: SessionCommitDelivery;
	/** The observation's own kind: the readings a source held for one session are gone. */
	readonly session_unobserved: SessionUnobservedDelivery;
}

/**
 * The semantic handlers one assembly injects for one subscription group, keyed by the event each
 * subscribes to.
 *
 * This is the whole handler surface of one group: the session axis, the round axis, the activity
 * axis, the Turn axis, the input axis, the context axis, the commit axis and the unavailability
 * member arrive here together. An event kind with no entry subscribes nothing. Which deliveries
 * reach a handler is its group's {@link ObservationScope}, not this type.
 */
export type SemanticEventHandlers = Readonly<{
	readonly [K in SemanticEvent["kind"]]?: (delivery: SemanticEventDeliveryMap[K]) => void | Promise<void>;
}>;
