/** Declaration-only vocabulary for the independently invoked integration completeness check. */

/** How a harness runs a subagent, never an extension-selected policy. */
export type SubagentExecutionMode = "in-process" | "cross-process";

/**
 * Framework semantics an extension needs from its subagent integration.
 * These declarations carry no runtime check, implementation or behavior-test evidence.
 */
export type SubagentCapability =
	/** The subagent loads the extension logic needed to participate. */
	| "extension-loading"
	/** Actual session identity, direct parent and Owner relationships. */
	| "session-facts"
	/** Each actual session's own response usage, without duplicate accounting. */
	| "turn-usage"
	/** Each actual session's lifecycle, Round edges and awaitable disposal. */
	| "session-lifecycle"
	/** Per-session activity, context and startup observations. */
	| "session-observations"
	/** Confirmed storage commits can be observed where the Owner is served. */
	| "storage-commit"
	/** A declared following field reads its Owner's value. */
	| "state-follow";

/**
 * The harness author's supplied integration coverage, not a support/version claim.
 * Each key declares a supported execution mode; an empty list means that mode is declared
 * but no capabilities have been connected. An empty mapping declares no subagent integration.
 * List capabilities explicitly: adding a new framework capability must not supply it implicitly.
 */
export interface HarnessIntegrationDeclaration {
	readonly harness: string;
	readonly subagents: Readonly<Partial<Record<SubagentExecutionMode, readonly SubagentCapability[]>>>;
}

/** One actual discovery entry whose extension/harness pairing is checked independently. */
export interface ExtensionHarnessEntry {
	readonly extension: string;
	readonly harness: string;
}
