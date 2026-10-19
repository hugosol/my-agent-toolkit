/**
 * Session capability supplied as `context.session` to the extension's implementation factory.
 * Import Session contracts from this entry. Read current observations through the capability;
 * declare future deliveries through the implementation's `subscriptions`, not through the reader.
 * Domain facts and deliveries live in `details/`; they are public contracts, not implementation.
 */
import type { SessionObservationReader } from "./observation";

export interface SessionCapability {
	/** Current readings, including observations collected before the extension attached. */
	readonly observations: SessionObservationReader;
	/**
	 * State that this process confirmed a session's write to shared storage. Call only after the
	 * write succeeded; this saves nothing and carries no content. An unknown session records nothing.
	 */
	readonly recordCommit: (sessionId: string) => void;
}

// Identify the actual Session: distinct from its Owner and the Viewed session.
export type { SessionEndReason, SessionFacts, SessionStartReason, SessionStartup } from "./details/facts";

// Read what is known now; retained readings do not update themselves.
export type { SessionObservation, SessionObservationReader } from "./observation";

// Subscribe to later changes under one declared observation scope per group.
export type {
	SubscriptionGroup,
	ObservationScope,
	SemanticEventHandlers,
	SemanticEventDeliveryMap,
	SemanticEvent,
} from "./subscriptions";

// Session identity and lifecycle changes.
export type {
	SessionEvent,
	SessionEventDelivery,
	SessionEventHandler,
	SessionEventHandlers,
} from "./details/session";

// Activity periods, model request/response cycles, and user input.
export type {
	CloseOutWait,
	RoundDelivery,
	RoundEnding,
	RoundEvent,
	RoundEventHandler,
	RoundEventHandlers,
} from "./details/round";
export type {
	TurnEndDelivery,
	TurnEndFacts,
	TurnEvent,
	TurnEventHandler,
	TurnEventHandlers,
	TurnOutcome,
	TurnStartDelivery,
	TurnStartFacts,
	TurnUsage,
} from "./details/turn";
export type { UserInputDelivery, UserInputEvent, UserInputEventHandler } from "./details/input";

// Current activity/context readings, their changes, and observation unavailability.
export type {
	AgentActivity,
	SessionActivityDelivery,
	SessionActivityEvent,
	SessionActivityEventHandler,
	SessionActivityEventHandlers,
	SessionActivityObservation,
} from "./details/activity";
export type {
	SessionContextDelivery,
	SessionContextEvent,
	SessionContextHandler,
	SessionContextHandlers,
	SessionContextReading,
} from "./details/context";
export type {
	SessionUnobservedDelivery,
	SessionUnobservedEvent,
	SessionUnobservedHandler,
	SessionUnobservedHandlers,
	SessionUnobservedObservation,
} from "./details/unobserved";

// Confirmed storage write notices, never storage contents or activity transitions.
export type {
	SessionCommitDelivery,
	SessionCommitEvent,
	SessionCommitHandler,
	SessionCommitHandlers,
	SessionCommitObservation,
} from "./details/commit";
