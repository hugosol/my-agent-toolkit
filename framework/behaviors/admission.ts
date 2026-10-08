/**
 * The admission behavior: who is told about an unlisted version, and how often.
 *
 * Publishing is a session behavior, not a binding-time one. The notice belongs to the Owner — the
 * main session the delivery names — and it is the framework's own warning rather than an
 * extension's: one process tells one main session once, however many extensions, bindings or
 * separately loaded copies of this module were delivered to before it. A session that owns no
 * State of its own (a subagent) is never told and never counts as an Owner: the session it follows
 * is the one that is told, and a delivery that follows it does not stand in for it.
 *
 * The record is therefore the process's, not this module's: the OMP legacy loader evaluates each
 * extension's graph as its own module graph, so a record held in this module would tell one session
 * once per extension. It lives on the process global under a well-known symbol for the same reason
 * the version decision does, and `Symbol.for` is what lets the copies agree on the key by name while
 * holding no shared module identity.
 *
 * This module is harness-independent: it decides *whether* the notice is published and *what*
 * it says, and the adapter's notice transport decides *where*.
 */
import type { UnlistedVersionAdmission } from "../core/admission";
import type { SessionDelivery } from "../core/protocol";

/**
 * The name the framework's own notices are attributed to.
 *
 * A notice belongs to the framework rather than to the extension whose binding produced it, so it
 * names the framework and the facts it carries — the version and the support set — and no
 * extension's display name.
 */
const FRAMEWORK_NOTICE_SOURCE = "my-agent-toolkit";

/** Where the process holds the owners its notice was published for. */
const NOTIFIED_OWNERS_KEY: unique symbol = Symbol.for(
	"my-agent-toolkit.semantic-extensions.admission-notice-owners",
);

/** The process global, narrowed to the one entry this module reads and writes. */
interface AdmissionNoticeScope {
	[NOTIFIED_OWNERS_KEY]?: Set<string>;
}

/**
 * The process-wide record: the owner keys the unlisted-version notice was already published for,
 * shared by every copy of this module and every binding in the process.
 *
 * The owner key is the adapter's own identity for the owning main session, so two extensions in one
 * session name the same key, and two sessions in one process name different ones.
 */
function notifiedOwners(): Set<string> {
	const scope = globalThis as AdmissionNoticeScope;
	const registered = scope[NOTIFIED_OWNERS_KEY];
	if (registered !== undefined) return registered;

	const owners = new Set<string>();
	scope[NOTIFIED_OWNERS_KEY] = owners;
	return owners;
}

/**
 * The notice text for an unlisted version: the framework's warning, naming the version the harness
 * reported and the versions the framework's Supported harness baseline lists.
 *
 * The wording is the framework's, and the facts it carries are the ones the operator needs to decide
 * whether to upgrade or to keep running.
 */
function describeUnlistedVersion(outcome: UnlistedVersionAdmission): string {
	return `${FRAMEWORK_NOTICE_SOURCE}: harness version ${outcome.version} is not in the supported set (${outcome.supportedVersions.join(", ")}); continuing without a support claim`;
}

/**
 * Publishes the unlisted-version notice for one session delivery, at most once per Owner for the
 * whole process.
 *
 * Only a delivery whose session is its own owner is a main session: a subagent delivery follows its
 * owner read-only, publishes nothing and claims nothing, so the owner is still told when its own
 * delivery comes. A refused binding never reaches this behavior at all, which is what keeps the
 * refusal out of the notice's channel.
 */
export function announceUnlistedVersion(outcome: UnlistedVersionAdmission, session: SessionDelivery): void {
	if (session.owner.kind !== "owner") return;

	const owners = notifiedOwners();
	if (owners.has(session.owner.key)) return;
	owners.add(session.owner.key);
	session.notices.warn(describeUnlistedVersion(outcome));
}
