/**
 * The per-session agent-activity readings this process holds: whether each actual session is working
 * or idle right now, keyed by the session id the harness reports for it.
 *
 * The reading is the framework's own and is taken from its activity axis: the framework opens a Round
 * for the session a run start came from, closes it only once that same session really answers
 * quiescent, and states the reading the Round leaves the session in — a session with an open Round is
 * working, one whose Round has ended is idle. That distinction is exactly why this module reads the
 * framework's observation rather than a host's own current run state, and why it is taken for every
 * actual session alike: a main session and the subagents it spawned are the same kind of agent on this
 * axis, so nothing here treats a descendant as a different sort of thing from the root. A host's native
 * run state tells a different story — it reports a run over before that run's work has unwound — so
 * reading it directly would show a session as idle while it is still retrying, still waiting on a job,
 * or still about to continue.
 *
 * A session whose reading arrives without this process ever having watched its Round — one another
 * process ran — is shown exactly as observed, and nothing of this extension's accounting is driven by
 * it: Rounds, measured runtimes, session snapshots and saves follow the round edges alone.
 *
 * A session no reading has moved reads as nothing rather than as idle: an unestablished activity is
 * not idleness, and a display that had to choose would be inventing the one fact the framework's own
 * quiescence gate exists to establish.
 */
import type { AgentActivity } from "../../../../framework/core/protocol";

/**
 * One session's own current agent activity, in the framework glossary's vocabulary: `working` while
 * continuous activity remains ongoing, `idle` once nothing remains to continue it.
 */
export type SessionActivity = AgentActivity;

/** The read half of the readings: the state one session was last moved to, or nothing when none was. */
export interface SessionActivityReading {
	read: (sessionId: string) => SessionActivity | undefined;
}

/**
 * The process's one set of per-session activity readings, moved by the framework's activity
 * observation.
 *
 * It is a reading rather than an accounting number: nothing here is written to the storage root, and
 * a restarted process begins with every session unestablished until its own readings arrive.
 */
export class SessionActivityRegistry implements SessionActivityReading {
	#bySession = new Map<string, SessionActivity>();

	/**
	 * Move one session to the activity its own observation states, and answer whether it moved.
	 *
	 * Only a real move is one: a repeated observation, and a reading for a session this instance never
	 * held, leave the reading where it was and answer `false`, which is what keeps a caller from
	 * arranging a redraw that would draw the same thing.
	 */
	observe(sessionId: string, activity: SessionActivity): boolean {
		if (this.#bySession.get(sessionId) === activity) return false;
		this.#bySession.set(sessionId, activity);
		return true;
	}

	read(sessionId: string): SessionActivity | undefined {
		return this.#bySession.get(sessionId);
	}
}
