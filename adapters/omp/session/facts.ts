/**
 * OMP session identity, ancestry, ownership and startup fact mappings.
 *
 * Reads native facts only: `lifecycle.ts` owns the native Session subscriptions and
 * transition state. Delivery assembly, shared context tracking and diagnostics stay
 * in the adapter assembly; State semantics stay in the framework.
 */
import type { OwnerReference, SessionFacts, SessionStartReason, SessionStartup } from "../../../core/protocol";
import type { OmpAgentRef, OmpExtensionApi, OmpSessionContext } from "../../omp";
import type { OmpViewedSessionFacts } from "../viewed-session";
import type { OmpSessionEvent, OmpSessionReason } from "./lifecycle";

/**
 * The State cell key of a session that owns its own State.
 *
 * The key is the session's own identity, never a process-level label such as the
 * `"Main"` registry id: two sessions in one process share the label but not the key. The
 * kind prefix keeps the key namespace explicit; a main session is the only kind that ever
 * holds State, so it is the only kind this key form is produced for.
 */
function mainOwnerKey(sessionId: string): string {
	return `main:${sessionId}`;
}

/**
 * The owner a session's State belongs to: the nearest ancestor session that is itself a
 * top-level main session (a main session is its own owner).
 *
 * The walk uses the harness's own facts — `ctx.agent.parentId` and the official agent
 * registry the harness injects — and never a nesting depth or a process-level label, so a
 * nested subagent resolves level by level to the same root owner and a background fork
 * that carries a parent link follows the same rule. A chain that leaves the process (an
 * ancestor the registry does not hold, a link that loops, an owner whose session is gone)
 * resolves to nothing rather than to a guessed owner.
 */
export function ownerReferenceOf(pi: OmpExtensionApi, ctx: OmpSessionContext): OwnerReference {
	if (ctx.agent.kind === "main") {
		const sessionId = ctx.sessionManager.getSessionId();
		return sessionId.length > 0 ? { kind: "owner", key: mainOwnerKey(sessionId) } : { kind: "unresolved" };
	}

	return mainAncestorOf(pi, ctx.agent.parentId);
}

/**
 * The nearest top-level main session above one spawning agent id, as the harness's own agent
 * registry holds it.
 *
 * The walk is the same one a delivery's owner resolution uses, and it is shared because a session's
 * owner is one fact however the session was reached — the session a delivery came from, or the
 * session an operator is displaying. A chain that leaves the process (an ancestor the registry does
 * not hold, a link that loops, an owner whose session is gone) resolves to nothing rather than to a
 * guessed owner.
 */
function mainAncestorOf(pi: OmpExtensionApi, spawningId: string | undefined): OwnerReference {
	const registry = pi.pi?.AgentRegistry?.global();
	if (registry === undefined) return { kind: "unresolved" };

	const visited = new Set<string>();
	let cursor = spawningId;
	while (cursor !== undefined && !visited.has(cursor)) {
		visited.add(cursor);
		const ref = registry.get(cursor);
		if (ref === undefined) break;
		if (ref.kind === "main") {
			const sessionId = ref.session?.sessionManager?.getSessionId() ?? "";
			return sessionId.length > 0 ? { kind: "inherited", key: mainOwnerKey(sessionId) } : { kind: "unresolved" };
		}
		cursor = ref.parentId;
	}
	return { kind: "unresolved" };
}

/**
 * The owner position of the session the host is displaying, resolved from the outlet's own facts.
 *
 * Identity is the displayed session's own session id and its agent kind — never its display name,
 * which is display data — and a displayed subagent resolves to the nearest top-level main session
 * above it through the harness's own registry, exactly as a delivery's owner does. A fact the outlet
 * could not obtain is not guessed from the session this binding is bound to: the position is
 * `unresolved`, which projects "no cell" and so empties the area rather than showing another
 * session's lines.
 */
export function viewedOwnerOf(pi: OmpExtensionApi, facts: OmpViewedSessionFacts): OwnerReference {
	if (facts.agent.kind === "main") {
		const sessionId = facts.sessionId ?? "";
		return sessionId.length > 0 ? { kind: "owner", key: mainOwnerKey(sessionId) } : { kind: "unresolved" };
	}

	return mainAncestorOf(pi, facts.agent.parentId);
}

/**
 * The persisted State payloads on one session's branch, oldest first.
 *
 * The adapter resolves *which* entries carry this extension's State; whether a payload
 * declares a usable value is the framework's rule, so payloads cross the seam unread, in
 * branch order, with the session's current record last.
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

/** The semantic start reason each native transition reason stands for. */
const START_REASON_BY_NATIVE: Record<OmpSessionReason, SessionStartReason> = {
	new: "new",
	resume: "resume",
	fork: "fork",
	// A branch stands a new session up from the current one's entries, so both a rewind and a
	// promoted `/btw` answer are a *new* session rather than a fork.
	branch: "new",
	btw: "new",
};

/**
 * The semantic start reason one native transition carries.
 *
 * The native vocabulary is the harness's own — `new`/`resume`/`fork` on a switch,
 * `branch`/`fork`/`btw` on a branch — and the framework's is what the framework's readers
 * understand. A switch names what it did to the session directly; a branch stands a new
 * session up from the current one's entries. `initial` never comes from here: it is the
 * binding's own first session, which only the startup event means, and a transition that
 * names no reason at all is read as a new session.
 */
export function startReasonOf(event: OmpSessionEvent): SessionStartReason {
	const reason = event.reason;
	return reason === undefined ? "new" : START_REASON_BY_NATIVE[reason];
}

/**
 * The actual session facts one delivery carries: identity, direct parent, latest name, the task's
 * own naming handle, and — on the delivery that announces the session's own start — the model and
 * effective effort it began with.
 *
 * Identity is the session manager's own session id and the harness's agent kind. The direct parent
 * is resolved exactly one hop — the registry entry the spawning id names, then that agent's live
 * session — and never by string shape, nesting depth or an agent-name hierarchy: a parent that is
 * parked (its live session gone), a spawning id the registry does not hold, and a session the
 * harness spawned from outside the process are all reported as the fact this host could not obtain,
 * and a top-level session simply has none.
 *
 * The name is display data read live from the harness, so a rename is picked up without changing
 * identity, parent or ownership: on the next delivery that carries this session, and — where the
 * session manager publishes its own name-change notification — on a facts delivery of its own,
 * made when the rename happens rather than at the session's next boundary. A harness that reports
 * no name, and an empty one, are both named as unavailable rather than invented.
 *
 * A spawned session's registry id *is* the naming handle its spawn was allocated: the spawning call's
 * own `name` when it gave one, a generated handle when it named none, and — for a spawn made from
 * inside another subagent — that handle under the spawning agent's id. It is reported as the task's
 * own name as well, because it says which work the session carries out, where the agent's registered
 * name says only what kind of agent runs it.
 *
 * `startReason` is named by the delivery that announces a session's start and by no other delivery.
 * It decides whether that start proves the session *began* there (see {@link beginsHere}), which is
 * the one condition under which the readings of that instant are the session's startup facts: the
 * model it began on and the effective level this harness resolves for it — never the configured
 * selector behind that level, and never what a later delivery could read.
 */
export function sessionFactsOf(pi: OmpExtensionApi, ctx: OmpSessionContext, startReason?: SessionStartReason): SessionFacts {
	const unavailable: string[] = [];
	const kind = ctx.agent.kind === "main" ? "main" : "sub";
	let parentSessionId: string | undefined;
	if (kind === "sub") {
		const spawningId = ctx.agent.parentId;
		const parentSession =
			spawningId === undefined ? undefined : pi.pi?.AgentRegistry?.global()?.get(spawningId)?.session;
		const parentId = parentSession?.sessionManager?.getSessionId();
		if (parentId === undefined || parentId.length === 0) unavailable.push("direct parent session");
		else parentSessionId = parentId;
	}
	const reportedName = ctx.sessionManager.getSessionName?.();
	const name = reportedName === undefined || reportedName.trim().length === 0 ? undefined : reportedName;
	if (name === undefined) unavailable.push("session name");
	// The agent's own name and its registry id: the first is the agent *definition* the session runs,
	// the second the identity its registry, messaging and history index use. Neither is the task's
	// own name, so both are reported as what they are.
	const reportedAgentName = ctx.agent.name?.trim();
	const agentName = reportedAgentName === undefined || reportedAgentName.length === 0 ? undefined : reportedAgentName;
	if (agentName === undefined) unavailable.push("agent name");
	const reportedAgentId = ctx.agent.id?.trim();
	const agentId = reportedAgentId === undefined || reportedAgentId.length === 0 ? undefined : reportedAgentId;
	if (agentId === undefined) unavailable.push("agent id");
	// Only a spawned session carries a task handle. A main session is loaded rather than spawned, so a
	// process-level label such as `Main` never stands for a task's name.
	const taskName = kind === "sub" ? agentId : undefined;
	const startup =
		startReason !== undefined && kind === "sub" && beginsHere(ctx, startReason)
			? startupFactsOf(pi, ctx, unavailable)
			: undefined;
	return {
		sessionId: ctx.sessionManager.getSessionId(),
		kind,
		...(parentSessionId === undefined ? {} : { parentSessionId }),
		...(name === undefined ? {} : { name }),
		...(taskName === undefined ? {} : { taskName }),
		...(agentName === undefined ? {} : { agentName }),
		...(agentId === undefined ? {} : { agentId }),
		...(startup === undefined ? {} : { startup }),
		unavailable,
	};
}

/**
 * Whether one start delivery proves the session it announces *began* there, so that what this
 * context reports at that instant is what the session started on.
 *
 * Two host facts have to agree, because the harness's own start signal is the same one a fresh spawn
 * and a session it merely reloaded both make. The transition has to be a creation rather than a way
 * into a session that already exists — a `resume` enters one, and a `fork` stands one up from
 * another session's entries, whose model and level are not this session's own beginning. And the
 * session's own branch must carry no conversation yet: the harness replays a reloaded session's
 * messages onto it before it rebinds the extension, and that replayed history is what tells the
 * session apart from one beginning now. A user or assistant message is exactly what such a replay
 * leaves behind and what a session with no history at all cannot have.
 *
 * A surface that reports no such history is read as proving nothing, so a startup fact is left
 * absent rather than taken from what the session happens to run — the same answer a host that cannot
 * report a model or a level gives.
 */
function beginsHere(ctx: OmpSessionContext, reason: SessionStartReason): boolean {
	if (reason === "resume" || reason === "fork") return false;
	return !ctx.sessionManager.getBranch().some(entry => {
		const role = entry.message?.role;
		return entry.type === "message" && (role === "user" || role === "assistant");
	});
}

/**
 * The model and effective effort the session this context reports began with, as the harness answers
 * for it at the start that proved the session began — the readings the framework's startup facts are
 * built from.
 *
 * Neither is a setting: the model is the one the context reports for the request being issued at
 * that moment, and the level is the harness's own getter, which answers the level the session really
 * runs (a configured `auto` selector is not a level). A reading this host cannot give is named in
 * `unavailable` rather than replaced by anything — not by the model's own cap, not by a level the
 * configuration mentions, and not by a zero. Nothing is reported at all when neither reading is
 * available, so the absence of a startup fact stays distinguishable from an empty one.
 */
function startupFactsOf(pi: OmpExtensionApi, ctx: OmpSessionContext, unavailable: string[]): SessionStartup | undefined {
	const reported = ctx.model;
	const model =
		reported?.id === undefined || reported.id.length === 0 || reported.provider === undefined || reported.provider.length === 0
			? undefined
			: { provider: reported.provider, model: reported.id };
	if (model === undefined) unavailable.push("startup model");
	// A harness that publishes no level getter reports no level at all; one that publishes it and
	// answers nothing means this session has none, which is an ordinary absence rather than an
	// unobtainable fact — and equally not a level this adapter may invent.
	const readLevel = pi.getThinkingLevel;
	let effort: string | undefined;
	if (typeof readLevel !== "function") {
		unavailable.push("startup effort");
	} else {
		const level = readLevel.call(pi);
		if (typeof level === "string" && level.length > 0) effort = level;
	}
	if (model === undefined && effort === undefined) return undefined;
	return { ...(model === undefined ? {} : { model }), ...(effort === undefined ? {} : { effort }) };
}

