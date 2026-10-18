/**
 * pi's persisted State effect: the one native append a command makes to the entry a session
 * restores from.
 *
 * Reading those payloads belongs to the Session query module (`queries.ts`); this module owns only
 * the native append. Both sides name the same entry through `piStateEntryType`, so the write path
 * cannot drift from the entry restoration reads.
 */
import type { ExtensionDefinition } from "../../../framework/core/definition";
import type { StateValues } from "../../../framework/core/protocol";
import type { PiExtensionApi } from "../internal/native";
import { piStateEntryType } from "./queries";

/** The State write path one binding shares with session restoration. */
export interface PiStatePersistence {
	/** Appends one payload to the entry type that session restoration reads. */
	persist(values: StateValues): void;
}

/** The persistence effect of one binding, keyed by the extension definition it serves. */
export function piStatePersistence(
	pi: PiExtensionApi,
	definition: ExtensionDefinition,
): PiStatePersistence {
	const entryType = piStateEntryType(definition);
	return {
		persist: values => pi.appendEntry(entryType, values),
	};
}
