/** Combines native session identity/startup with pi-subagents' own launch name. */
import type { SessionFacts, SessionStartReason } from "../../../framework/interface/session";
import { defineSessionFactsMapping, unavailableFact } from "../../../framework/runtime/adapter-authoring";
import type { PiExtensionContext } from "../native/core/extensions/types";
import type { PiSessionPosition } from "../native/core/session-manager/positions";
import { piSessionStartupOf } from "../native/core/session-manager/startup";
import { activeAgentNameOf } from "../thirdParty/pi-subagents/launch";

/** One reading of the facts one pi delivery carries, from the decision that delivery already made. */
interface PiSessionFactsInput {
	readonly position: PiSessionPosition;
	readonly ctx: PiExtensionContext;
	readonly reason?: SessionStartReason;
}

/**
 * The actual session facts one pi delivery carries, as one explicit field mapping.
 *
 * Every canonical fact is listed here, including the ones pi cannot state: a static absence is
 * declared beside the fields that are resolved, so the integration contract reads this one object
 * rather than a second capability list. The mapping is module-level because it is the adapter's
 * actual construction, not a per-delivery decision.
 *
 * `position` is the one position the delivery's session sits at, resolved from the decision the
 * delivery itself makes: the facts and the owner are two readings of the same decision, so deriving
 * one from the lineage link while the other derives from the start would let them disagree for the
 * one kind of session whose link is not a spawn.
 *
 * Identity is the session manager's own session id and that position. The name is display data read
 * live from the harness, so a rename is picked up without changing identity, parent or ownership.
 * The agent definition is the one the provider wrote into a spawned session's own prompt; pi itself
 * states no task handle or agent registry id, so those are declared unavailable rather than
 * borrowed from a name, a directory or a process label.
 */
export const PI_SESSION_FACTS_MAPPING = defineSessionFactsMapping<PiSessionFactsInput>({
	sessionId: input => input.ctx.sessionManager.getSessionId(),
	kind: input => input.position.kind,
	parentSessionId: input => input.position.parentSessionId,
	name: (input, unavailable) => {
		const reported = input.ctx.sessionManager.getSessionName();
		const name = reported?.trim() ? reported : undefined;
		if (name === undefined) unavailable.push("session name");
		return name;
	},
	taskName: unavailableFact("task name"),
	agentName: (input, unavailable) => {
		const name = activeAgentNameOf(input.ctx, input.position.kind);
		if (name === undefined) unavailable.push("agent name");
		return name;
	},
	agentId: unavailableFact("agent id"),
	startup: (input, unavailable) =>
		piSessionStartupOf(input.ctx, input.reason, unavailable),
	unavailable: input => input.position.unavailable,
});

/**
 * The actual session facts one delivery carries: identity, direct parent, latest name, the agent
 * definition a spawned session runs, and — on the delivery that announces the session's own start —
 * the model and effective effort it began with.
 *
 * The construction itself is the module-level mapping above; this function only supplies the input
 * one delivery has already resolved.
 */
export function piSessionFactsOf(
	position: PiSessionPosition,
	ctx: PiExtensionContext,
	reason?: SessionStartReason,
): SessionFacts {
	return PI_SESSION_FACTS_MAPPING({ position, ctx, reason });
}
