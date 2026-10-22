/**
 * pi session identity, ancestry, ownership and startup fact mappings.
 *
 * Reads the session manager's own header and branch. Subagent queries own parent-file reads and
 * ancestry traversal; this module decides whether a start is a spawn or a new/forked main session,
 * and maps the resulting relation identities to Session facts and Owner references. Native
 * subscriptions and their deliveries stay in Session event mappings.
 *
 * Nothing here is guessed from anything else: a parent is the session pi's own lineage link names,
 * its identity is the id that session's own header states, the owner is the nearest top-level
 * session above it, and a name is display data. A spawned session's agent definition is the launch
 * marker pi-subagents writes into that session's own prompt; depth, process ids, directory names
 * and task handles are none of these facts and are never read as if they were.
 */
import { piSpawnedRelationsOf, type PiAnchorReader } from "../subagent/queries";
import type { ExtensionDefinition } from "../../../../framework/interface/details/definition";
import type { SessionFacts, SessionStartReason, SessionStartup } from "../../../../framework/interface/session";
import type { OwnerReference } from "../../../../framework/interface/state";
import {
	defineSessionFactsMapping,
	unavailableFact,
} from "../../../../framework/runtime/adapter-authoring";
import type { PiExtensionContext, PiSessionHeader } from "../../internal/native";

/**
 * The State cell key of a session that owns its own State.
 *
 * The key is the session's own identity, never a process-level label: two sessions in one process
 * share a process but not a key, and a main session is the only kind that ever holds State.
 */
export function piOwnerKey(sessionId: string): string {
	return `main:${sessionId}`;
}

/**
 * The native entry type this extension's State is persisted under.
 *
 * One name serves both sides of the contract: the payloads a session restores from and the entry a
 * command appends. Nothing else states it.
 */
export function piStateEntryType(definition: ExtensionDefinition): string {
	return `${definition.id}:state`;
}

/**
 * The State payloads one session's branch carries, in branch order.
 *
 * The branch is pi's own session material: only entries this extension wrote under its State entry
 * type are State, and each is reported as it was persisted. Which payload is the current value is
 * the framework's reconciliation, not a choice made while reading.
 */
export function piStatePayloadsOf(
	ctx: PiExtensionContext,
	entryType: string,
): readonly unknown[] {
	return ctx.sessionManager.getBranch()
		.filter(entry => entry.type === "custom" && entry.customType === entryType)
		.map(entry => entry.data);
}

/** Where one actual session sits among the sessions this harness runs. */
export interface PiSessionPosition {
	/** Whether this session was spawned by another session or is a top-level session of its own. */
	readonly kind: "main" | "sub";
	/** The session that directly spawned this one, when this host could resolve it. */
	readonly parentSessionId?: string;
	/** The owner this session's State belongs to: the nearest top-level session above it. */
	readonly owner: OwnerReference;
	/** Every fact of this position this host could not obtain, named as it is named to consumers. */
	readonly unavailable: readonly string[];
}

/** Where the sessions one binding's deliveries are about sit among the sessions this harness runs. */
export interface PiSessionPositions {
	/**
	 * The position of one delivery's session.
	 *
	 * `reason` is the start reason when the delivery *is* the session's own start, and absent on every
	 * other delivery: the start is where this adapter decides whether the session was spawned, and
	 * every later delivery reports the decision that start made.
	 */
	positionOf(ctx: PiExtensionContext, reason?: SessionStartReason): PiSessionPosition;
}

/** The header pi states for one context's session, when this surface states one. */
function headerOf(ctx: PiExtensionContext): PiSessionHeader | undefined {
	const header = ctx.sessionManager.getHeader?.();
	return header === null || header === undefined ? undefined : header;
}

/** The lineage link pi's own header carries for one session, when it carries one. */
function lineageOf(ctx: PiExtensionContext): string | undefined {
	const link = headerOf(ctx)?.parentSession;
	return typeof link === "string" && link.length > 0 ? link : undefined;
}

/**
 * The session positions one process's deliveries are read through.
 *
 * `readAnchor` is the file reader a chain that leaves this process is followed with, and it is the
 * seam a suite drives a chain with: the production reader is pi's own session files.
 */
export function piSessionPositions(readAnchor: PiAnchorReader): PiSessionPositions {
	/**
	 * Which sessions this binding has seen *begin* as a spawned one, by session id.
	 *
	 * Whether a session is a spawn is decided at its own start, because the start is the one
	 * delivery that carries what pi was doing: a session pi stood up from another session's entries
	 * — a fork — is a top-level session of its own even though its header keeps the lineage link,
	 * while a session spawned in place reports the same beginning a top-level one does. Later
	 * deliveries read the decision rather than re-deciding it from the link alone.
	 */
	const spawned = new Map<string, boolean>();

	const spawnedAtStart = (sessionId: string, reason: SessionStartReason | undefined, link: string | undefined): boolean => {
		if (reason === undefined) {
			// A delivery that carries no start this binding observed: which sessions this binding has
			// seen begin decide it, and a session this one never saw begin is read from the one fact
			// left — a link pi left in its header means a session built from another one.
			return spawned.get(sessionId) ?? link !== undefined;
		}
		// Which beginnings create a session of *their own* is pi's own vocabulary: a `new` session and
		// a `fork` are stood up by this harness from another session's entries, so the lineage link
		// they carry records where the copy came from rather than naming a session that spawned it. A
		// session that begins in place — pi's own startup, a reload — or that is entered again (a
		// resume) keeps the header it was created with, and that header is what states whether this
		// session was spawned.
		const decided = (reason === "initial" || reason === "resume") && link !== undefined;
		spawned.set(sessionId, decided);
		return decided;
	};

	const positionOf = (ctx: PiExtensionContext, reason?: SessionStartReason): PiSessionPosition => {
		const sessionId = ctx.sessionManager.getSessionId();
		const link = lineageOf(ctx);
		if (!spawnedAtStart(sessionId, reason, link) || link === undefined) {
			return {
				kind: "main",
				owner: sessionId.length > 0 ? { kind: "owner", key: piOwnerKey(sessionId) } : { kind: "unresolved" },
				unavailable: [],
			};
		}
		const { mainSessionId, ...relations } = piSpawnedRelationsOf(link, readAnchor);
		return {
			kind: "sub",
			...relations,
			owner: mainSessionId === undefined ? { kind: "unresolved" } : { kind: "inherited", key: piOwnerKey(mainSessionId) },
		};
	};

	return { positionOf };
}

/**
 * Whether one start delivery proves the session it announces *began* there, so that what the
 * context reports at that instant is what the session started on.
 *
 * The harness's own start signal is the same one a fresh session and a session it merely reloaded
 * both make, and a session pi built from another session's entries replays that conversation onto
 * its branch. A way into a session that already exists — a resume, a fork — is not a beginning, and
 * neither is a branch that already carries the conversation the session was built from. A user or
 * assistant message is exactly what such a replay leaves behind and what a session with no history
 * of its own cannot have.
 */
function beginsHere(ctx: PiExtensionContext, reason: SessionStartReason): boolean {
	if (reason === "resume" || reason === "fork") return false;
	return !ctx.sessionManager.getBranch().some(entry => {
		const role = entry.message?.role;
		return entry.type === "message" && (role === "user" || role === "assistant");
	});
}

/**
 * The model and effective effort the session this context reports began with, as this host answers
 * for it at the start that proved the session began.
 *
 * Neither is a setting: the model is the one this context reports for the request being issued at
 * that moment, and the level is the one the context reports for the session. A reading this host
 * cannot give is named in `unavailable` rather than replaced by anything, and nothing is reported
 * at all when neither is available, so an absent startup fact stays distinguishable from an empty
 * one.
 */
function startupFactsOf(ctx: PiExtensionContext, unavailable: string[]): SessionStartup | undefined {
	const model = ctx.model?.provider && ctx.model.id ? { provider: ctx.model.provider, model: ctx.model.id } : undefined;
	const effort = ctx.thinkingLevel || undefined;
	if (model === undefined) unavailable.push("startup model");
	if (effort === undefined) unavailable.push("startup effort");
	if (model === undefined && effort === undefined) return undefined;
	return { ...(model === undefined ? {} : { model }), ...(effort === undefined ? {} : { effort }) };
}

/** One reading of the facts one pi delivery carries, from the decision that delivery already made. */
interface PiSessionFactsInput {
	readonly position: PiSessionPosition;
	readonly ctx: PiExtensionContext;
	readonly reason?: SessionStartReason;
}

/**
 * The `active_agent` element pi-subagents prepends to the system prompt of a session it spawns.
 *
 * It is the provider's own launch metadata for the child it is about, written into that child's
 * prompt before the session starts, so it names the agent definition this actual session runs
 * without consulting a fleet listing, a session display name or a launch order. The element is
 * read only on a line of its own: text that merely mentions the marker inside a larger line is not
 * a launch statement.
 */
const ACTIVE_AGENT_NAME = /^[ \t]*<active_agent\s+name="([^"]*)"\s*\/>[ \t]*$/gm;

/**
 * The agent definition a spawned session's own prompt names, when the prompt carries that marker.
 *
 * A replacing launch puts the marker at the head of the prompt, where the first marker is the
 * provider's; an appending launch puts it in the appended section, after whatever the inherited
 * prompt carried, so the last marker is the provider's. Neither reading consults another session.
 */
function activeAgentNameOf(ctx: PiExtensionContext, kind: PiSessionPosition["kind"]): string | undefined {
	if (kind !== "sub") return undefined;
	const prompt = ctx.getSystemPrompt?.();
	if (typeof prompt !== "string") return undefined;
	const matches = [...prompt.matchAll(ACTIVE_AGENT_NAME)];
	if (matches.length === 0) return undefined;
	const match = matches[0].index === 0 ? matches[0] : matches[matches.length - 1];
	// The provider escapes the name for an XML attribute; the definition name is the decoded value,
	// not the serialized attribute text.
	const name = match[1]
		.replace(/&quot;/g, "\"")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&")
		.trim();
	return name.length > 0 ? name : undefined;
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
		input.reason !== undefined && beginsHere(input.ctx, input.reason)
			? startupFactsOf(input.ctx, unavailable)
			: undefined,
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
