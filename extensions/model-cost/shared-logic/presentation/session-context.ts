/**
 * The per-session context readings this extension's display reads: the latest reading each session's
 * own host reported, keyed by the session id the harness reports for it, together with an activity
 * reading that travels beside it.
 *
 * The readings themselves are the framework's: its own observation source holds them —
 * `SessionObservations` in `framework/core/observations.ts`, fed by the adapter's collection points
 * and by the framework's Round bookkeeping — and this interface is the narrow read the display was
 * written against, which one session's context answers. Shared logic then reads it while building a
 * display: it is a reading, not an accounting number, and nothing about it is written to the storage
 * root.
 *
 * The reading carries the session's own current model with it because the figure a context is
 * displayed against is that model's channel display budget — the same one the widget's bar uses, and
 * a different fixed number per channel. It is never the host's context window: the host reports a
 * window, and this extension's display compares against its own budget.
 *
 * A session nobody observed has no reading rather than a zero one: an absent entry is drawn as an
 * absent field, never as a context of nothing.
 */

/** One session's own context as its host reported it: the used tokens and the model they belong to. */
export interface ObservedSessionContext {
	/** Estimated tokens the session's conversation holds, as its own host reported them. */
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
