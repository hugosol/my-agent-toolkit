/** Pi session-manager identity, native lineage decisions and Owner references. */
import type { SessionStartReason } from "../../../../../framework/interface/session";
import type { OwnerReference } from "../../../../../framework/interface/state";
import type { PiExtensionContext, PiSessionHeader } from "../extensions/types";
import { piSpawnedRelationsOf, type PiAnchorReader } from "./ancestry";

/**
 * The State cell key of a session that owns its own State.
 *
 * The key is the session's own identity, never a process-level label: two sessions in one process
 * share a process but not a key, and a main session is the only kind that ever holds State.
 */
export function piOwnerKey(sessionId: string): string {
	return `main:${sessionId}`;
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

