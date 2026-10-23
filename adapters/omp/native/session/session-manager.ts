/**
 * OMP session-manager protocol: extension State entry naming, ordered branch restoration and append,
 * plus the persisted custom-message identities used to plan prompt contributions.
 * Native payloads cross the port unread; State validation and prompt selection stay in the framework.
 */
import type { ExtensionDefinition } from "../../../../framework/interface/details/definition";
import type { StateValues } from "../../../../framework/runtime/port";
import type { OmpExtensionApi, OmpSessionContext } from "../extensibility/extensions/types";

/**
 * One session entry as the native session manager holds it.
 *
 * Only the persisted shapes the adapter recognizes are named: the State payload
 * (`type: "custom"`), the injected-prompt contribution (`type: "custom_message"`) and the
 * conversation itself (`type: "message"`). Whether a payload declares a usable value is the
 * framework's validation rule, so the adapter hands payloads over unread.
 */
export interface OmpSessionEntry {
	readonly type?: string;
	readonly customType?: string;
	/** The State record's payload (`type: "custom"`). */
	readonly data?: unknown;
	/** A persisted contribution's text and framework-owned presentation. */
	readonly content?: string;
	readonly display?: boolean;
	readonly attribution?: "user" | "agent";
	/**
	 * The message a conversation entry carries (`type: "message"`), read for its role alone.
	 *
	 * It is the fact that says a session already has a conversation of its own: a session the
	 * harness reloaded replays its messages onto the branch before it rebinds the extension, while
	 * a session that is only now beginning has none yet. Nothing here interprets the message
	 * beyond that — the role is all this adapter reads.
	 */
	readonly message?: { readonly role?: string };
}

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



