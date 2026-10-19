/**
 * OMP's persisted State write: the one native branch entry a command appends to and the next
 * session boundary restores from.
 *
 * The entry type is private to this module on purpose — restoration and commands are two uses of
 * the same entry, so neither can name a different one. Reading that entry's payloads is a session
 * branch read and lives in `queries.ts`; this module owns the native append only.
 */
import type { ExtensionDefinition } from "../../../../framework/interface/details/definition";
import type { StateValues } from "../../../../framework/runtime/port";
import type { OmpExtensionApi } from "../../internal/native";

/** The one State entry a binding restores from and writes to. */
export interface OmpStateEntry {
	/** The custom entry type session restoration reads and commands append. */
	readonly type: string;
	/** Appends one payload to that entry; the next boundary reads it back. */
	persist(values: StateValues): void;
}

/** The State entry of one binding, keyed by the extension definition it serves. */
export function stateEntryOf(pi: OmpExtensionApi, definition: ExtensionDefinition): OmpStateEntry {
	const type = `${definition.id}:state`;
	return { type, persist: values => pi.appendEntry(type, values) };
}
