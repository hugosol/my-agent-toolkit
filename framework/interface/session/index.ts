/**
 * The canonical extension-facing Session capability.
 *
 * Extension source imports the Session vocabulary from this path — never from the framework's
 * internal modules. The types here are the whole consumption contract: session facts, the eight
 * event axes (session, Round, activity, Turn, input, context, commit, unobserved) and their
 * deliveries, the subscription group, the read surface, and the one statement an extension may
 * make about a confirmed write. The observation source, its mutation methods, delivery envelopes
 * and adapter signals stay behind the interface.
 */
export type {
	AgentActivity,
	SessionActivityDelivery,
	SessionActivityEvent,
	SessionActivityEventHandler,
	SessionActivityEventHandlers,
	SessionActivityObservation,
} from "./activity";
export type {
	SessionCommitDelivery,
	SessionCommitEvent,
	SessionCommitHandler,
	SessionCommitHandlers,
	SessionCommitObservation,
} from "./commit";
export type {
	SessionContextDelivery,
	SessionContextEvent,
	SessionContextHandler,
	SessionContextHandlers,
	SessionContextReading,
} from "./context";
export type {
	SemanticEvent,
	SemanticEventDeliveryMap,
	SemanticEventHandlers,
	ObservationScope,
	SessionEvent,
	SessionEventDelivery,
	SessionEventHandler,
	SessionEventHandlers,
	SubscriptionGroup,
} from "./events";
export type { SessionEndReason, SessionFacts, SessionStartReason, SessionStartup } from "./facts";
export type { UserInputDelivery, UserInputEvent, UserInputEventHandler } from "./input";
export type { SessionCapability, SessionObservation, SessionObservationReader } from "./observation";
export type {
	CloseOutWait,
	RoundDelivery,
	RoundEnding,
	RoundEvent,
	RoundEventHandler,
	RoundEventHandlers,
} from "./round";
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
} from "./turn";
export type {
	SessionUnobservedDelivery,
	SessionUnobservedEvent,
	SessionUnobservedHandler,
	SessionUnobservedHandlers,
	SessionUnobservedObservation,
} from "./unobserved";
