/**
 * The admission behavior: who is told about an unlisted version, and how often.
 *
 * Publishing is a session behavior, not a binding-time one. The notice belongs to a main
 * session's own feedback channel, which exists only inside a delivery, and it is
 * deduplicated by that session's identity, so re-entry into a session never repeats it and
 * a session that never owns State is never told. This module is agent-runtime-independent:
 * it decides *whether* the notice is published and *what* it says, and the adapter's notice
 * transport decides *where*.
 */
import {
	describeUnlistedVersion,
	type AdmissionNotices,
	type UnlistedVersionAdmission,
} from "../core/admission";
import type { ExtensionDefinition } from "../core/definition";
import type { SessionDelivery } from "../core/protocol";

/**
 * Publishes the unlisted-version notice for one session delivery, at most once per main
 * session.
 *
 * Only a delivery whose session is its own owner is a main session: a subagent delivery
 * follows its owner read-only, and the owner is the session that is told (or already has
 * been). A refused binding never reaches this behavior at all, which is what keeps the
 * refusal out of the notice's channel.
 */
export function announceUnlistedVersion(
	definition: ExtensionDefinition,
	outcome: UnlistedVersionAdmission,
	notices: AdmissionNotices,
	session: SessionDelivery,
): void {
	if (session.owner.kind !== "owner") return;
	if (!notices.claim(session.owner.key)) return;
	session.notices.warn(describeUnlistedVersion(definition.displayName, outcome));
}
