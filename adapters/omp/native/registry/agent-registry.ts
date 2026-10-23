/**
 * OMP's native `registry/agent-registry.ts` contract: the official graph of who spawned whom,
 * reached through the extension loader's injected SDK surface.
 *
 * Direct-parent lookup and the ancestor walk are read here once. The extension-context mapping in
 * `native/extensibility/extensions/session-facts.ts` turns these identities into Session facts and
 * Owner positions; registry ids, direct parents and owning main-session ids remain distinct.
 *
 * OMP loads extensions into its native child sessions and reports their Session, Turn and Round
 * through the same extension-runner subscriptions as any session. There is no third-party provider
 * registration, child-extension RPC or separate child event vocabulary to mirror here. The settled
 * integration query below describes that native path; it is not an offline capability inventory.
 */
import type { SubagentIntegration } from "../../../../framework/interface/subagent";
import type { OmpExtensionApi } from "../extensibility/extensions/types";

/**
 * One agent as the harness's official registry holds it: the identity and the parent link
 * the registry itself publishes, plus the live session a resolvable owner is read from.
 */
export interface OmpAgentRef {
	readonly id: string;
	/** `"main"` for a top-level session, `"sub"` for a spawned one, `"advisor"` for an advisor. */
	readonly kind?: string;
	/** Registry id of the spawning agent; absent for a top-level session. */
	readonly parentId?: string;
	/** The live session, or null once the agent is parked and only its history remains. */
	readonly session?: {
		readonly sessionManager?: {
			getSessionId(): string;
			/** The session's own latest display name, when this host publishes one. */
			getSessionName?(): string | undefined;
		};
	} | null;
}

/** The harness's process-wide agent registry: the official graph of who spawned whom. */
export interface OmpAgentRegistry {
	get(id: string): OmpAgentRef | undefined;
}

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
