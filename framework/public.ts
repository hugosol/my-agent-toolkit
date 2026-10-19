/**
 * The remaining mixed framework entry: the capability declarations and general functions whose
 * own cutover has not completed yet.
 *
 * The authoring contract — `defineExtension`, its definition and implementation types — is
 * canonical in `framework/interface`. State, Session, Prompt, Marker, Feedback, Host facts,
 * Subagent, configuration and Command each own their declarations and are imported from their own
 * entries; this module re-publishes only what this migration has not moved yet, so that existing
 * consumers keep exactly one temporary path. It will be reduced as each remaining capability lands
 * and removed with the final retirement; no compatibility alias or forwarding module is added.
 *
 * Nothing here names a harness, and no type here is one a harness could add to.
 */
/**
 * The Command contract: what an extension declares and implements for its commands, and what a
 * command delivery carries. It is canonically owned by `framework/interface/command`; this
 * temporary export block is the path existing consumers still read.
 */
export type {
	ActionsCommandImplementation,
	ActionDelivery,
	CanAcceptInput,
	CommandAction,
	CommandActionsDeclaration,
	CommandDeclaration,
	CommandDelivery,
	CommandDirectedDeclaration,
	CommandImplementation,
	CommandImplementations,
	CommandToggleDeclaration,
	ControlKind,
	DirectedCommandImplementation,
	RecognizedDirective,
} from "./interface/command";

/**
 * The configuration failures shared logic may observe, and the reader a suite drives a file
 * through.
 *
 * They are types and errors, not values this entry hands out: `getConfig`, `readConfig` and the
 * two error classes stay in `framework/core/config.ts`, which shared logic imports directly.
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
 * The remaining command-adjacent facts still exported from the protocol.
 *
 * Session vocabulary and its support leaves are imported from `framework/interface/session`,
 * `framework/interface/state`, `framework/interface/feedback` and `framework/interface/host-facts`;
 * this entry no longer re-exports the Session implementation or any adapter-only type.
 */
export type { CommandInvocation, DirectedDirective } from "./core/protocol";

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
