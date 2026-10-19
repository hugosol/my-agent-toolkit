/** Declaration-only vocabulary for the independently invoked integration completeness check. */
import type { SubagentCapability } from "../interface/subagent";

/** How a harness runs a subagent, never an extension-selected policy. */
export type SubagentExecutionMode = "in-process" | "cross-process";

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
