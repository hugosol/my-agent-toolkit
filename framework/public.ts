/**
 * The definition entry of the semantic extension framework, and the assembly surface an
 * extension's implementation is written against.
 *
 * This is the whole authoring surface: declare an extension with
 * {@link defineExtension} and the exported configuration types, build its implementation in the
 * factory an assembly hands a harness adapter (`framework/adapters/omp.ts`), and subscribe to
 * the semantic events that implementation reacts to. Nothing here names a harness, and no type
 * here is one a harness could add to.
 *
 * Two layers are deliberately visible and no third one:
 *
 * - the *declaration* — the definition, its State, its commands, its prompts, its marker and its
 *   configuration — which is plain data;
 * - the *assembly* — the factory that builds the implementation, the semantics the extension
 *   depends on, and the directory its relative configuration path is resolved against — which is
 *   what an entrance module hands its harness adapter.
 *
 * The framework's port, its internal dispatch and its State store are not part of this surface:
 * an extension observes State and effects through the delivery its own command or handler
 * receives, never by asking the framework for a writer or a subscriber.
 *
 * The configuration one extension declares is part of its definition, so its types are
 * here; the configuration API the extension's shared logic reads through — `getConfig`,
 * `readConfig` and the two error classes — lives in `framework/core/config.ts`, which is
 * host-independent exactly as this entry is.
 */
export {
	type CommandDeclaration,
	type CommandActionsDeclaration,
	type CommandDirectedDeclaration,
	type CommandToggleDeclaration,
	type ConfigFieldType,
	type ControlKind,
	type ExtensionConfigDeclaration,
	type ExtensionDefinition,
	type MarkerDeclaration,
	type PromptDeclaration,
	type PromptStrategy,
	type StateDeclaration,
	type StateInheritance,
	type StatePersistence,
	defineExtension,
} from "./core/definition";

/** Offline checklist declarations; the checker is a separate tooling entry, never a startup hook. */
export type { HarnessIntegrationDeclaration, SubagentCapability, SubagentExecutionMode } from "./core/integration";

/**
 * The assembly surface: the implementation factory, what it builds, and the generic assembly
 * information a harness adapter binds. All of it is type-level — an implementation is data the
 * framework connects, never a function this entry hands back.
 */
export type {
	ActionsCommandImplementation,
	CommandAction,
	CommandImplementation,
	CommandImplementations,
	ExtensionAssembly,
	ExtensionFactory,
	ExtensionImplementation,
	ImplementationContext,
	InitializationDelivery,
} from "./core/assembly";

/**
 * The framework's session observation source: the read half an extension consumes — what this
 * process has observed of each actual session, its activity and its latest context reading alike.
 *
 * It is handed to an extension's factory as `ImplementationContext.sessionObservations`; an
 * extension reads it and never constructs one, because the one source belongs to the process and
 * the adapter creates it beside the State store (see `core/observations.ts`).
 */
export { SessionObservations } from "./core/observations";

/**
 * The configuration failures shared logic may observe, and the reader a suite drives a file
 * through.
 *
 * They are types and errors, not values this entry hands out: `getConfig`, `readConfig` and the
 * two error classes stay in `framework/core/config.ts`, which shared logic imports directly — the
 * entry hands out the declaration function and the HTTP request below, and nothing else.
 */
export type { ConfigReader, ConfigSource } from "./core/config";

/**
 * The framework's general HTTP module: the one request shared logic imports directly, and the
 * one failure it may observe for a request that never left the process.
 *
 * `request` and `HttpConfigurationError` are values an extension's shared logic names itself —
 * the module is imported, never injected through a command or event delivery. The injectable
 * seam (the platform call, the shared file's path and its reader/parser) stays in
 * `framework/modules/http.ts`, where this repository's own suite reaches it.
 */
export { HttpConfigurationError, type HttpRequestOptions, request } from "./modules/http";

/**
 * The delivery types one implementation's commands and handlers are written against, re-exported
 * from the protocol because they are the *facts* an extension reads — never a port it calls.
 */
export type {
	ActionDelivery,
	AgentActivity,
	CanAcceptInput,
	CatalogPrice,
	CatalogPriceSource,
	CloseOutWait,
	CommandDelivery,
	CommandInvocation,
	DeclaredValueSeam,
	DirectedCommandImplementation,
	DirectedDirective,
	FeedbackLevel,
	FeedbackTransport,
	MarkerTransport,
	ObservationScope,
	ObservationSource,
	ObservedSession,
	OwnerCapabilityHandle,
	OwnerReference,
	PromptContribution,
	ProviderAccess,
	ProviderAccessFacts,
	ProviderHttpFacts,
	RecognizedDirective,
	RoundDelivery,
	RoundEnding,
	RoundEvent,
	RoundEventHandler,
	RoundEventHandlers,
	SemanticEvent,
	SemanticEventHandlers,
	SessionActivityDelivery,
	SessionActivityEvent,
	SessionActivityEventHandler,
	SessionActivityEventHandlers,
	SessionActivityObservation,
	SessionCommitDelivery,
	SessionCommitEvent,
	SessionCommitHandler,
	SessionCommitHandlers,
	SessionCommitObservation,
	SessionContextDelivery,
	SessionContextEvent,
	SessionContextHandler,
	SessionContextHandlers,
	SessionContextObservation,
	SessionContextReading,
	SessionEndReason,
	SessionEvent,
	SessionEventDelivery,
	SessionEventHandler,
	SessionEventHandlers,
	SessionFacts,
	SessionObservation,
	SessionObservationAccess,
	SessionObservationSink,
	SessionStartReason,
	SessionStartup,
	SessionUnobservedDelivery,
	SessionUnobservedEvent,
	SessionUnobservedHandler,
	SessionUnobservedHandlers,
	SubscriptionGroup,
	SubagentIntegration,
	SubagentIntegrationFailure,
	TurnEndDelivery,
	TurnEndFacts,
	TurnEvent,
	TurnEventHandler,
	TurnEventHandlers,
	TurnOutcome,
	TurnSignal,
	TurnStartDelivery,
	TurnStartFacts,
	TurnUsage,
	UserInputDelivery,
	UserInputEvent,
	UserInputEventHandler,
} from "./core/protocol";

/** The semantics an assembly may declare its extension additional dependency on. */
export type { DeclarableRequiredSemantic, RequiredSemantic } from "./core/requirements";

/**
 * The framework's general safe-file module: the one coordinated read-modify-publish shared logic
 * imports directly, and the one failure it may observe for a document it could not coordinate.
 *
 * `updateFile` and `SafeFileUpdateError` are values an extension's shared logic names itself —
 * the module is imported, never injected through a command or event delivery. The module's own
 * constants stay in `framework/modules/files.ts`, where this repository's suite drives it over
 * real local directories and real processes.
 */
export {
	SafeFileUpdateError,
	type SafeFileUpdateFailureKind,
	type SafeFileUpdateOptions,
	updateFile,
} from "./modules/files";
