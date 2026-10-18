/**
 * OMP Subagent reads: the harness's own agent-registry relations and the integration state this
 * adapter settles.
 *
 * The registry is the harness's official graph of who spawned whom, so the ancestor walk and the
 * direct parent link are read here and nowhere else. What those relations *mean* to the framework —
 * the owner cell a session's State belongs to, the unavailable fact a delivery names — is Session's
 * mapping: `session/queries.ts` consumes the identities this module answers with and the framework
 * owners it builds from them.
 *
 * Only relations are read here. OMP reports a subagent's Session, Turn and Round through the same
 * native subscriptions as any other session, so those deliveries stay with Session; this domain has
 * no separate native event vocabulary to map and therefore no `events.ts`. The integration answer
 * below is the runtime fact, not the offline capability inventory in `declaration.ts`.
 */
import type { SubagentIntegration } from "../../../framework/core/protocol";
import type { OmpExtensionApi } from "../internal/native";

/**
 * The live session id of the agent that directly spawned one subagent.
 *
 * The link is resolved exactly one hop: the registry entry the spawning id names, then that agent's
 * live session. A spawning id the registry does not hold, a parent that is parked (its live session
 * gone) and an empty identity are all the fact this host could not obtain, answered as nothing
 * rather than guessed from a name or a nesting depth.
 */
export function directParentSessionIdOf(pi: OmpExtensionApi, spawningId: string | undefined): string | undefined {
	const sessionId =
		spawningId === undefined
			? undefined
			: pi.pi?.AgentRegistry?.global()?.get(spawningId)?.session?.sessionManager?.getSessionId();
	return sessionId === undefined || sessionId.length === 0 ? undefined : sessionId;
}

/**
 * The session id of the nearest top-level main session above one spawning agent id.
 *
 * The walk uses the registry's own parent links and never a nesting depth or a process-level label,
 * so a nested subagent resolves level by level to the same root and a background fork that carries
 * a parent link follows the same rule. A chain that leaves the process (an ancestor the registry
 * does not hold, a link that loops, an owner whose live session is gone) answers nothing rather
 * than a guessed identity.
 */
export function mainAncestorSessionIdOf(pi: OmpExtensionApi, spawningId: string | undefined): string | undefined {
	const registry = pi.pi?.AgentRegistry?.global();
	if (registry === undefined) return undefined;

	const visited = new Set<string>();
	let cursor = spawningId;
	while (cursor !== undefined && !visited.has(cursor)) {
		visited.add(cursor);
		const ref = registry.get(cursor);
		if (ref === undefined) break;
		if (ref.kind === "main") {
			const sessionId = ref.session?.sessionManager?.getSessionId() ?? "";
			return sessionId.length > 0 ? sessionId : undefined;
		}
		cursor = ref.parentId;
	}
	return undefined;
}

/** This adapter's one settled answer: OMP integrates subagent observations itself. */
const INTEGRATED: SubagentIntegration = { mode: "subagents" };

/**
 * How subagent integration stands on OMP.
 *
 * The harness's own delegation tool and agent registry are the native facts the subagent axes are
 * mapped from, so there is no provider to reach and none to fail: the answer is the integrated
 * shape itself, settled at the process's initialization node and never moved afterwards.
 */
export function subagentIntegrationOf(): SubagentIntegration {
	return INTEGRATED;
}
