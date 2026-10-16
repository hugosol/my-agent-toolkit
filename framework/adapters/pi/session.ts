/**
 * pi session identity, ancestry, ownership and startup fact mappings.
 *
 * Reads native facts only: the session manager's own header, the session manager's branch, and —
 * for an ancestor this process does not host — the anchor pi's own session file states. Which
 * native registration carries those facts, and the delivery they arrive on, stay in the adapter
 * assembly.
 *
 * Nothing here is guessed from anything else: a parent is the session pi's own lineage link names,
 * its identity is the id that session's own header states, the owner is the nearest top-level
 * session above it, and a name is display data. Depth, process ids, directory names and task
 * handles are none of these facts and are never read as if they were.
 */
import { readFileSync } from "node:fs";
import type { OwnerReference, SessionFacts, SessionStartReason, SessionStartup } from "../../core/protocol";
import type { PiExtensionContext, PiSessionAnchor, PiSessionHeader } from "../pi";

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

/** Reads one session file's own anchor: `undefined` when the file states none this adapter can read. */
export type PiAnchorReader = (sessionFile: string) => PiSessionAnchor | undefined;

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

/**
 * pi's session files, read for the anchors of sessions this process does not host.
 *
 * A session's direct parent is a *file* in pi's own lineage link, so a chain that leaves this
 * process is followed by opening the files pi states. The header of a session file is fixed when
 * the file is created (a resumed or forked file keeps its own), so one reading per path is kept for
 * the process's life: a chain is walked once per session that needs it and never re-read on a
 * delivery, and nothing here polls.
 */
export function piSessionFileAnchors(): PiAnchorReader {
	const read = new Map<string, PiSessionAnchor | undefined>();
	return sessionFile => {
		const known = read.get(sessionFile);
		if (known !== undefined || read.has(sessionFile)) return known;
		let anchor: PiSessionAnchor | undefined;
		try {
			const [firstLine] = readFileSync(sessionFile, "utf8").split("\n", 1);
			const parsed: unknown = JSON.parse(firstLine ?? "");
			const header = parsed as PiSessionHeader | null;
			if (header !== null && typeof header === "object" && header.type === "session") {
				anchor = {
					...(typeof header.id === "string" && header.id.length > 0 ? { id: header.id } : {}),
					...(typeof header.parentSession === "string" && header.parentSession.length > 0
						? { parentSession: header.parentSession }
						: {}),
				};
			}
		} catch {
			// A file this process cannot read, or whose first line is not a session header, states no
			// anchor: the chain ends there rather than continuing along a guess.
			anchor = undefined;
		}
		read.set(sessionFile, anchor);
		return anchor;
	};
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
		return { kind: "sub", ...spawnedPositionOf(link, readAnchor) };
	};

	return { positionOf };
}

/**
 * The parent and owner of a session spawned from the file pi's lineage link names.
 *
 * The link is a session *file*; the identity of the session that spawned this one is the id that
 * file's own header states, and the owner is the first session up that chain with no lineage link
 * of its own — a session that is itself a top-level main session. A file that cannot be read, a
 * header that states no id, and a chain that loops all end the walk where it stands: the position
 * is reported as the fact this host could not obtain rather than continued along a guess.
 */
function spawnedPositionOf(
	link: string,
	readAnchor: PiAnchorReader,
): { readonly parentSessionId?: string; readonly owner: OwnerReference; readonly unavailable: readonly string[] } {
	const unavailable: string[] = [];
	const parent = readAnchor(link);
	const parentSessionId = parent?.id;
	if (parentSessionId === undefined) unavailable.push("direct parent session");

	const visited = new Set<string>();
	let file: string | undefined = link;
	while (file !== undefined && !visited.has(file)) {
		visited.add(file);
		const anchor = readAnchor(file);
		if (anchor === undefined) break;
		if (anchor.parentSession === undefined) {
			const top = anchor.id;
			return {
				...(parentSessionId === undefined ? {} : { parentSessionId }),
				owner: top === undefined ? { kind: "unresolved" } : { kind: "inherited", key: piOwnerKey(top) },
				unavailable,
			};
		}
		file = anchor.parentSession;
	}
	// The chain leaves what this host can read: this session follows an owner this process cannot
	// name, which is not the same as following the one above it.
	return { ...(parentSessionId === undefined ? {} : { parentSessionId }), owner: { kind: "unresolved" }, unavailable };
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

/**
 * The actual session facts one delivery carries: identity, direct parent, latest name, and — on
 * the delivery that announces the session's own start — the model and effective effort it began
 * with.
 *
 * `position` is the one position this delivery's session sits at, resolved from the decision the
 * delivery itself makes: the facts and the owner of a delivery are two readings of the same
 * decision, so deriving the owner from the session's lineage link while the facts derive it from the
 * start would let the two disagree for the one kind of session whose link is not a spawn.
 *
 * Identity is the session manager's own session id and the position resolved above. The name is
 * display data read live from the harness, so a rename is picked up without changing identity,
 * parent or ownership: on the next delivery that carries this session, and on the facts delivery
 * pi's own name-change notification produces, which is made when the rename happens rather than at
 * the session's next boundary. A harness that reports no name, and an empty one, are both named as
 * unavailable rather than invented.
 *
 * pi states no agent definition, task handle or registry id for a session — what it names a
 * spawned session with is the session's own display name — so those facts are reported as the ones
 * this host does not have rather than borrowed from a name, a directory or a process label.
 */
export function piSessionFactsOf(
	position: PiSessionPosition,
	ctx: PiExtensionContext,
	reason?: SessionStartReason,
): SessionFacts {
	const unavailable: string[] = ["agent name", "agent id", ...position.unavailable];
	const reportedName = ctx.sessionManager.getSessionName();
	const name = reportedName?.trim() ? reportedName : undefined;
	if (name === undefined) unavailable.push("session name");
	const startup =
		reason !== undefined && beginsHere(ctx, reason) ? startupFactsOf(ctx, unavailable) : undefined;
	return {
		sessionId: ctx.sessionManager.getSessionId(),
		kind: position.kind,
		...(position.parentSessionId === undefined ? {} : { parentSessionId: position.parentSessionId }),
		...(name === undefined ? {} : { name }),
		...(startup === undefined ? {} : { startup }),
		unavailable,
	};
}
