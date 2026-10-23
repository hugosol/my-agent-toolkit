/**
 * OMP session-manager protocol: extension State entry naming, ordered branch restoration and append,
 * plus the persisted custom-message identities used to plan prompt contributions.
 * Native payloads cross the port unread; State validation and prompt selection stay in the framework.
 */
import type { ExtensionDefinition } from "../../../../framework/interface/details/definition";
import type { StateValues } from "../../../../framework/runtime/port";
import type { OmpExtensionApi, OmpSessionContext } from "../extensibility/extensions/types";

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

/**
 * The persisted State payloads on one session's branch, oldest first.
 *
 * The adapter resolves *which* entries carry this extension's State; whether a payload
 * declares a usable value is the framework's rule, so payloads cross the seam unread, in
 * branch order, with the session's current record last. The entry type is the one the write
 * path appends to in this module, so the read and the write cannot name different entries.
 */
export function statePayloadsOf(ctx: OmpSessionContext, stateEntryType: string): readonly unknown[] {
	return ctx.sessionManager
		.getBranch()
		.filter(entry => entry.type === "custom" && entry.customType === stateEntryType)
		.map(entry => entry.data);
}

/**
 * The injected-prompt identities one session's branch already persists, oldest first.
 *
 * A persisted contribution is a `custom_message` entry whose custom type is the slot's
 * framework identity. The adapter resolves which identities are present; whether that
 * satisfies a slot is the framework's rule, so identities cross the seam as facts.
 */
export function contributionIdentitiesOf(ctx: OmpSessionContext): readonly string[] {
	return ctx.sessionManager
		.getBranch()
		.filter(entry => entry.type === "custom_message" && typeof entry.customType === "string")
		.map(entry => entry.customType as string);
}



