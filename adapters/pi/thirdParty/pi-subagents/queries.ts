/** pi-subagents session-liveness readings; publication and ownership are in effects.ts. */
import { REGISTRATION_TABLE, SESSION_LIVENESS_REGISTRY_KEY, type LivenessTable } from "./effects";

/**
 * What this entry can state about one session's background work: the fact that decides whether a
 * settled session has really come to rest.
 *
 * A session can be idle with nothing queued and still be waiting — on a delegation running
 * elsewhere, on a result that has not arrived, on a wake that has not started — and the provider that
 * runs that work is the party that states it, in its own published terms.
 *
 * - `holds`: the provider states it still holds work this session waits on. The session is not at
 *   rest; the Round stays open.
 * - `clear`: the provider states it holds none. This is the provider's own answer, and the only one
 *   that lets the rest condition hold.
 * - `unread`: no such statement was obtained. Nothing is established either way, so it is answered as
 *   nothing: a candidate that reads it stays unconfirmed rather than closing a Round on a statement
 *   this entry never read.
 */
export type SessionBackgroundWork =
	| { readonly state: "holds" }
	| { readonly state: "clear" }
	| { readonly state: "unread"; readonly reason: string };

/** The liveness table of a registry object, or `undefined` when that registry is another party's. */
function livenessTableOf(registry: unknown): LivenessTable | undefined {
	if (typeof registry !== "object" || registry === null || Array.isArray(registry)) return undefined;
	const table = (registry as Record<PropertyKey, unknown>)[REGISTRATION_TABLE];
	return typeof table === "object" && table !== null ? (table as LivenessTable) : undefined;
}

/**
 * What this process's provider states about one session's background work, read from the registry
 * this entry publishes for it.
 *
 * `providerServes` is whether the provider stated itself in this process at all, by announcement or
 * by an answer. Only the provider's own answer is read: a registration it holds for this exact
 * session, asked for its own reading at this instant. Every other shape is answered as the statement
 * this entry could not read rather than as a session at rest — a registration naming another
 * session, a provider that stated itself without leaving one for this session, a registry another
 * party published, and an answer that cannot be taken all leave the question open. A process in
 * which no provider stated itself and no registration was left is the one case this entry answers
 * `clear` for: there is no provider facility in this process whose work a session could be waiting
 * on, so the harness's own facts are the whole rest condition rather than something invented here.
 */
export function piBackgroundActivity(sessionId: string, providerServes: boolean): SessionBackgroundWork {
	const registry = (globalThis as Record<PropertyKey, unknown>)[Symbol.for(SESSION_LIVENESS_REGISTRY_KEY)];
	const table = registry === undefined ? undefined : livenessTableOf(registry);
	if (table === undefined) {
		return {
			state: "unread",
			reason: registry === undefined
				? "this process carries no session-liveness registry for the subagent provider, so its own statement about a session cannot be read here"
				: "this process already carries a session-liveness registry this entry did not publish, so the subagent provider's own statement about a session cannot be read here",
		};
	}
	const registration = table.registrations.get(sessionId);
	if (registration !== undefined) {
		try {
			return registration.isActive() ? { state: "holds" } : { state: "clear" };
		} catch (error) {
			return {
				state: "unread",
				reason: `reading whether the subagent provider still holds background work for this session failed: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}
	if (!providerServes && table.registrations.size === 0) return { state: "clear" };
	return {
		state: "unread",
		reason: table.registrations.size === 0
			? "the subagent provider serving this process left no session-liveness registration, so it states nothing about this session"
			: "the subagent provider serving this process registered for another session, so it states nothing about this session",
	};
}
