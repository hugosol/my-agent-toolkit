/**
 * OMP extension-context facts (`extensibility/extensions/types.ts`): actual session identity,
 * Owner and startup readings. No Pi provider protocol participates in these facts.
 *
 * The direct parent link and nearest main ancestor come from `native/registry/agent-registry.ts`.
 * This module maps those native relations into framework Owner positions and Session facts: a chain
 * that leaves the process answers `unresolved`, never a guessed identity. Parent agent is one hop;
 * Owner may be several hops away.
 *
 * `lifecycle.ts` owns subscriptions, transitions and delivery framing. Session-entry read/write
 * naming belongs to `native/session/session-manager.ts`; shared State semantics stay in the framework.
 */
import type {
	SessionFacts,
	SessionStartReason,
	SessionStartup,
} from "../../../../../framework/interface/session";
import { defineSessionFactsMapping } from "../../../../../framework/runtime/adapter-authoring";
import type { OwnerReference } from "../../../../../framework/interface/state";
import type { OmpExtensionApi, OmpSessionContext } from "./types";
import { directParentSessionIdOf, mainAncestorSessionIdOf } from "../../registry/agent-registry";
import type { OmpViewedSessionFacts } from "../../../domain/session/viewed-session";
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
 * A session that is itself main owns its own cell. Otherwise the ancestor identity is the native
 * registry walk over `ctx.agent.parentId`, and this mapping turns exactly that fact into
 * the owner position — never a nesting depth or a process-level label. A chain that leaves the
 * process (an ancestor the registry does not hold, a link that loops, an owner whose session is
 * gone) resolves to nothing rather than to a guessed owner.
 */
export function ownerReferenceOf(pi: OmpExtensionApi, ctx: OmpSessionContext): OwnerReference {
	if (ctx.agent.kind === "main") {
		const sessionId = ctx.sessionManager.getSessionId();
		return sessionId.length > 0 ? { kind: "owner", key: mainOwnerKey(sessionId) } : { kind: "unresolved" };
	}

	const ownerSessionId = mainAncestorSessionIdOf(pi, ctx.agent.parentId);
	return ownerSessionId === undefined
		? { kind: "unresolved" }
		: { kind: "inherited", key: mainOwnerKey(ownerSessionId) };
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

	const ownerSessionId = mainAncestorSessionIdOf(pi, facts.agent.parentId);
	return ownerSessionId === undefined
		? { kind: "unresolved" }
		: { kind: "inherited", key: mainOwnerKey(ownerSessionId) };
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

/** One reading of the facts one omp delivery carries, from the decision that delivery already made. */
interface OmpSessionFactsInput {
	readonly pi: OmpExtensionApi;
	readonly ctx: OmpSessionContext;
	readonly startReason?: SessionStartReason;
}

/** The harness's agent kind as the framework's session position states it. */
function kindOf(ctx: OmpSessionContext): "main" | "sub" {
	return ctx.agent.kind === "main" ? "main" : "sub";
}

/**
 * The actual session facts one omp delivery carries, as one explicit field mapping.
 *
 * Every canonical fact is listed here, including the ones this harness answers only sometimes.
 * The mapping is module-level because it is the adapter's actual construction; a delivery supplies
 * only its own context and start reason.
 *
 * Identity is the session manager's own session id and the harness's agent kind. The direct parent
 * is the native registry's one-hop relation — the registry entry the spawning id names, then that
 * agent's live session — and never a string shape, nesting depth or an agent-name hierarchy: a
 * parent that is parked (its live session gone), a spawning id the registry does not hold, and a
 * session the harness spawned from outside the process are all reported as the fact this host could
 * not obtain, and a top-level session simply has none.
 *
 * The name is display data read live from the harness. A spawned session's registry id *is* the
 * naming handle its spawn was allocated, so it is reported as the task's own name as well; the
 * agent's registered name is the agent *definition* and stays a separate fact. The startup pair is
 * read only where the delivery's start proves the session began.
 */
export const OMP_SESSION_FACTS_MAPPING = defineSessionFactsMapping<OmpSessionFactsInput>({
	sessionId: input => input.ctx.sessionManager.getSessionId(),
	kind: input => kindOf(input.ctx),
	parentSessionId: (input, unavailable) => {
		const kind = kindOf(input.ctx);
		if (kind !== "sub") return undefined;
		const parentSessionId = directParentSessionIdOf(input.pi, input.ctx.agent.parentId);
		if (parentSessionId === undefined) unavailable.push("direct parent session");
		return parentSessionId;
	},
	name: (input, unavailable) => {
		const reported = input.ctx.sessionManager.getSessionName?.();
		const name = reported === undefined || reported.trim().length === 0 ? undefined : reported;
		if (name === undefined) unavailable.push("session name");
		return name;
	},
	// Only a spawned session carries a task handle. A main session is loaded rather than spawned, so a
	// process-level label such as `Main` never stands for a task's name.
	taskName: input => {
		if (kindOf(input.ctx) !== "sub") return undefined;
		const id = input.ctx.agent.id?.trim();
		return id === undefined || id.length === 0 ? undefined : id;
	},
	agentName: (input, unavailable) => {
		const reported = input.ctx.agent.name?.trim();
		const agentName = reported === undefined || reported.length === 0 ? undefined : reported;
		if (agentName === undefined) unavailable.push("agent name");
		return agentName;
	},
	agentId: (input, unavailable) => {
		const reported = input.ctx.agent.id?.trim();
		const agentId = reported === undefined || reported.length === 0 ? undefined : reported;
		if (agentId === undefined) unavailable.push("agent id");
		return agentId;
	},
	startup: (input, unavailable) =>
		input.startReason !== undefined &&
		kindOf(input.ctx) === "sub" &&
		beginsHere(input.ctx, input.startReason)
			? startupFactsOf(input.pi, input.ctx, unavailable)
			: undefined,
	unavailable: () => [],
});

/**
 * The actual session facts one delivery carries, built by the module-level mapping above.
 *
 * `startReason` is named by the delivery that announces a session's start and by no other delivery.
 * It decides whether that start proves the session *began* there (see {@link beginsHere}), which is
 * the one condition under which the readings of that instant are the session's startup facts: the
 * model it began on and the effective level this harness resolves for it — never the configured
 * selector behind that level, and never what a later delivery could read.
 */
export function sessionFactsOf(pi: OmpExtensionApi, ctx: OmpSessionContext, startReason?: SessionStartReason): SessionFacts {
	return OMP_SESSION_FACTS_MAPPING({ pi, ctx, startReason });
}

/**
 * Whether one start delivery proves the session it announces *began* there, so that what this
 * context reports at that instant is what the session started on.
 *
 * Two provider facts have to agree, because the harness's own start signal is the same one a fresh spawn
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

