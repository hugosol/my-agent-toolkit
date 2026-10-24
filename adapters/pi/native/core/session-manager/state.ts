/**
 * Pi session-manager custom entries: the complete native State persistence protocol.
 *
 * The extension id names the entry on both reads and writes. Reads report the selected branch's
 * matching payloads in order, unchanged; framework reconciliation owns value validation and the
 * choice of the latest valid value. Writes append that same payload shape without an envelope or
 * migration. Each binding owns its writer; the harness owns the branch and persistence medium.
 */
import type { ExtensionDefinition } from "../../../../../framework/interface/details/definition";
import type { StateValues } from "../../../../../framework/runtime/port";
import type { PiExtensionApi, PiExtensionContext } from "../extensions/types";

export function piStateEntryType(definition: ExtensionDefinition): string {
	return `${definition.id}:state`;
}

export function piStatePayloadsOf(ctx: PiExtensionContext, entryType: string): readonly unknown[] {
	return ctx.sessionManager.getBranch()
		.filter(entry => entry.type === "custom" && entry.customType === entryType)
		.map(entry => entry.data);
}

/** The State write path one binding shares with session restoration. */
export interface PiStatePersistence {
	persist(values: StateValues): void;
}

export function piStatePersistence(pi: PiExtensionApi, definition: ExtensionDefinition): PiStatePersistence {
	const entryType = piStateEntryType(definition);
	return { persist: values => pi.appendEntry(entryType, values) };
}
