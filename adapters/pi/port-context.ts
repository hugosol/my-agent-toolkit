/**
 * The state one pi binding's port slices share.
 *
 * A binding has one diagnostic channel, one owner decision, one set of sessions it has seen end and
 * one framework close-out registration; the mappings split by responsibility above it read and
 * write those through this object instead of duplicating them. Native subscriptions are still
 * tracked by the assembly, which is what makes a refused binding release every one of them.
 */
import type { ExtensionDefinition } from "../../framework/core/definition";
import type {
	OwnerReference,
	SessionDisposal,
	SessionFacts,
	SessionStartReason,
} from "../../framework/core/protocol";
import type { PiExtensionApi, PiExtensionContext } from "./native";
import type { PiSessionPosition } from "./session/facts";
import type { PiSubagentIntegration } from "./subagents/nicobailon";

/** The mutable life of one binding: the owner it serves and the diagnostics reported once. */
export interface PiPortState {
	/** The label diagnostics are prefixed with; `setLabel` moves it without touching the host. */
	label: string;
	/** The owner this binding currently serves, and its facts. */
	activeOwner?: { readonly key: string; readonly session: SessionFacts };
	/** The session whose subagent requirement this binding's owner node is asking about. */
	servingSessionId?: string;
	/** Whether the unresolved-owner diagnostic was already reported for this binding. */
	reportedOwnerless: boolean;
	/** The framework's close-out hook, once the binding registered one. */
	reportDisposal?: (disposal: SessionDisposal) => void | Promise<void>;
}

/** Everything the port slices of one binding read from each other. */
export interface PiPortContext {
	readonly pi: PiExtensionApi;
	readonly definition: ExtensionDefinition;
	readonly state: PiPortState;
	/** The one native branch entry used by both Session restoration and command writes. */
	readonly stateEntryType: string;
	persist(values: Parameters<PiExtensionApi["appendEntry"]>[1]): void;
	readonly integration: PiSubagentIntegration | undefined;
	/** Sessions this binding has observed end, by identity; deltas read it late. */
	readonly endedSessions: Set<string>;
	readonly keepSubscription: (release: () => void) => void;
	reportDiagnostic(message: string): void;
	reportMissingFact(fact: string): undefined;
	reportUnread(reason: string): void;
	catalogued(ctx: PiExtensionContext): PiExtensionContext;
	resolvedOwner(owner: OwnerReference): OwnerReference;
	resolveOwner(ctx: PiExtensionContext): OwnerReference;
	positionOf(ctx: PiExtensionContext, reason?: SessionStartReason): PiSessionPosition;
	sessionFactsOf(ctx: PiExtensionContext, reason?: SessionStartReason): SessionFacts;
}
