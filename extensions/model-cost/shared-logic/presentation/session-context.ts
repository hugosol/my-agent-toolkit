/**
 * The per-session context readings this process has observed: the latest `getContextUsage()` each
 * session binding published, keyed by the session id the harness reports for it.
 *
 * A session's own extension binding is the only place its context usage is reachable on the public
 * extension surface — the host publishes no per-session context fact to another session's binding —
 * so the harness half observes every binding (the main session's and each subagent's) and records
 * its reading here. Shared logic then reads it while building a display: it is a reading, not an
 * accounting number, and nothing about it is written to the storage root.
 *
 * The reading carries the session's own current model with it because the figure a context is
 * displayed against is that model's channel display budget — the same one the widget's bar uses, and
 * a different fixed number per channel. It is never the host's context window: the host reports a
 * window, and this extension's display compares against its own budget.
 *
 * A session nobody observed has no reading rather than a zero one: an absent entry is drawn as an
 * absent field, never as a context of nothing.
 */

/** One session's own context as its binding observed it: the used tokens and the model they belong to. */
export interface ObservedSessionContext {
	/** Estimated tokens the session's conversation holds, as its own binding reported them. */
	readonly tokens: number;
	/** The provider of that session's current model at the instant the reading was taken. */
	readonly provider?: string;
	/** The exact id of that session's current model at the instant the reading was taken. */
	readonly model?: string;
}

/** The read half of the readings: the latest context of one session, or nothing when none was observed. */
export interface SessionContextReading {
	read(sessionId: string): ObservedSessionContext | undefined;
}

/** The process's one set of per-session context readings, fed by the harness half. */
export class SessionContextRegistry implements SessionContextReading {
	#bySession = new Map<string, ObservedSessionContext>();

	/** Record one session's own latest reading. A reading with no measured token count states nothing. */
	observe(sessionId: string, observation: ObservedSessionContext | undefined): void {
		if (observation === undefined) return;
		this.#bySession.set(sessionId, observation);
	}

	read(sessionId: string): ObservedSessionContext | undefined {
		return this.#bySession.get(sessionId);
	}
}
