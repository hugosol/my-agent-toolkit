/**
 * The actual session facts and the boundary reasons an extension reads.
 *
 * These are facts the adapter resolved from its own harness and the framework carries unchanged:
 * the session's identity, its direct parent, its latest display name, the agent and task it was
 * spawned for, the model and effort it began on, and every fact the host could not obtain. They
 * describe a position in the harness's tree, never the Owner a State value belongs to.
 */

/**
 * Why a session became the current owner.
 *
 * `initial` — the session this binding first served in this process, which is the session the
 * harness loaded at startup and which carries no transition reason of its own.
 * `new` — a session stood up from nothing. `resume` — an existing session restored.
 * `fork` — a session derived from another one's branch or transcript.
 */
export type SessionStartReason = "initial" | "new" | "resume" | "fork";

/**
 * Why the current owner stopped being current.
 *
 * `transferred` — another session took its place (a switch, a branch or a fork), so what that
 * session held is the extension's to wind down and its remote identity's to release.
 * `disposed` — the session itself went away, so only local state is wound down and the session's
 * own disappearance covers the rest.
 */
export type SessionEndReason = "transferred" | "disposed";

/**
 * The model and effective effort one session began with, as its harness reported them at the start
 * that proved the session was beginning — the two readings a display shows a subagent's row by, and
 * nothing a later setting, a later model switch or a later execution may rewrite.
 *
 * It is a *startup* fact rather than the session's current one: the model it was started on, and the
 * level it really runs there. The level is the harness's resolved effective effort, never the
 * configured selector behind it (an `auto` setting is not a level a row may show). Each member is
 * absent when this host could not report it, and named in `unavailable`; a start that proved no
 * beginning carries neither rather than reading the pair the session happens to run now.
 */
export interface SessionStartup {
	/** The model the session began on, both parts as the harness reported them. */
	readonly model?: {
		/** The provider the harness serves that model under. */
		readonly provider: string;
		/** The exact model id, as the harness resolves it. */
		readonly model: string;
	};
	/** The effective thinking level the session began with. */
	readonly effort?: string;
}

/**
 * The actual session one delivery concerns: its identity, its direct parent and its latest display
 * name, as the adapter resolved them.
 *
 * This is the fact set a per-actual-session subscription observes. The session's `kind` and its
 * `parentSessionId` are *positions*, never the Owner a State value belongs to: a subagent's direct
 * parent is the session that spawned it — which may itself be a subagent — while its Owner is the
 * nearest top-level main session above it. A name is display data: a renamed session keeps its
 * `sessionId`, its direct parent and its Owner, so a name is never an identity.
 *
 * Every fact a delivery carries here was either obtained or named in `unavailable`; nothing is
 * guessed from the session currently being viewed, from a process-level label, or from a string that
 * merely looks like a hierarchy.
 */
export interface SessionFacts {
	/** The actual session's identity within this harness, as the harness reports it. */
	readonly sessionId: string;
	/** Whether this session is a top-level main session or one spawned by another session. */
	readonly kind: "main" | "sub";
	/**
	 * The identity of the actual session that directly spawned this one.
	 *
	 * Absent for a top-level session (there is no parent) and for a session whose direct parent's
	 * identity could not be resolved — the two cases are distinguished by `unavailable`, which names
	 * the fact when this host could not obtain it.
	 */
	readonly parentSessionId?: string;
	/** The session's latest display name, as the harness reports it; display data, never an identity. */
	readonly name?: string;
	/**
	 * The name the harness reported for the task this session was spawned to carry out — the handle
	 * the spawning call gave that work — when this harness names one.
	 *
	 * It names the *work*, not the agent that runs it: the agent definition a session runs is a kind
	 * of agent (see {@link SessionFacts.agentName}), which is not a task's name however much either
	 * looks like a label, and it is not the same fact as the identity `agentId` indexes.
	 */
	readonly taskName?: string;
	/**
	 * The name of the agent this session runs, as its harness registers it.
	 *
	 * It is the harness's own name for the agent *definition* — which kind of agent this session is
	 * (a `task`, an `explore`, a `scout`) — and so a category rather than a name for the work.
	 * Absent when the harness reports none, and named in `unavailable`.
	 */
	readonly agentName?: string;
	/**
	 * The identity of the agent this session runs, as its harness registers it.
	 *
	 * It is the harness's own handle for the agent — the id its roster, its messaging and its
	 * history index use — and it is the fallback a display takes only when neither the session nor
	 * the agent has a name.
	 */
	readonly agentId?: string;
	/**
	 * The model and effective effort this session began with, as the harness reported them on a start
	 * that proved the session was beginning — and absent on every other delivery.
	 *
	 * A start proves a beginning only where the host can show that the session was not already there:
	 * the delivery is a creation rather than a way into an existing session (no `resume`, no
	 * `fork`), and the session's own transcript carries no conversation of its own yet. A harness
	 * that cannot show a beginning reports none, rather than filling the pair in from the settings in
	 * effect.
	 */
	readonly startup?: SessionStartup;
	/** Every fact above this host could not obtain, named as the delivery names it. */
	readonly unavailable: readonly string[];
}
