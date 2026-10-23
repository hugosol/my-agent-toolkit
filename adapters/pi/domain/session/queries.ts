/** Pi native custom-entry State naming and branch reads; paired with effects.ts. */
import type { ExtensionDefinition } from "../../../../framework/interface/details/definition";
import type { PiExtensionContext } from "../../internal/native";

/**
 * The native entry type this extension's State is persisted under.
 *
 * One name serves both sides of the contract: the payloads a session restores from and the entry a
 * command appends. Nothing else states it.
 */
export function piStateEntryType(definition: ExtensionDefinition): string {
	return `${definition.id}:state`;
}

/**
 * The State payloads one session's branch carries, in branch order.
 *
 * The branch is pi's own session material: only entries this extension wrote under its State entry
 * type are State, and each is reported as it was persisted. Which payload is the current value is
 * the framework's reconciliation, not a choice made while reading.
 */
export function piStatePayloadsOf(
	ctx: PiExtensionContext,
	entryType: string,
): readonly unknown[] {
	return ctx.sessionManager.getBranch()
		.filter(entry => entry.type === "custom" && entry.customType === entryType)
		.map(entry => entry.data);
}

