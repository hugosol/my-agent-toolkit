/**
 * Session span: the wall-clock interval from this period's first user input to the latest observed
 * Turn end or receipt of a terminal subagent result. The caller supplies the actual session's own
 * instants; child runtimes are never summed here.
 *
 * A start is taken once, with a saved start winning over later input. Ends only advance, so delayed
 * responses cannot undo a newer result receipt or saved end. Both facts must exist for a reading;
 * equal instants mean known zero, while a missing fact means unavailable. A reset clears this period's
 * observations. Forked history establishes neither fact.
 *
 * This module reads the record's optional fact and holds observations only: no writes, file reads,
 * timers, inferred Round boundaries or continuous wall-clock updates.
 */
import type { SessionSpanFact } from "./consumption-document";

/**
 * One session's Session span as a reader reads it: the two observed instants and the wall-clock
 * interval between them.
 *
 * It exists only for a session whose span is known — see {@link SessionSpans.of} — so a reading here
 * is always a real pair of observations. `elapsedMs` is the difference of the two, and it is never
 * negative: two observed instants are read in the order they happened, so an end that a backwards
 * clock jump placed before the start reads as no time rather than as time that runs backwards.
 */
export interface SessionSpanReading {
	/** When this session's first user input of the period was observed. */
	readonly startAt: number;
	/** The latest observed Turn end or terminal-result receipt for this session. */
	readonly endAt: number;
	/** The interval between them, in milliseconds. */
	readonly elapsedMs: number;
}

/** One session's time facts as this instance accumulates them. */
export interface SessionSpans {
	/**
	 * The first user input was observed for one session, at `at`. Answers whether that changed the
	 * session's span *reading*: a start that no end can be paired with yet changes nothing a reader
	 * sees.
	 */
	input(sessionId: string, at: number): boolean;
	/**
	 * A Turn ended or a terminal subagent result reached this session at `at`. Only a newer
	 * instant advances the end. Answers whether that changed its reading.
	 */
	ended(sessionId: string, at: number): boolean;
	/** One session's span reading, or `undefined` while either of its own facts is unknown. */
	of(sessionId: string): SessionSpanReading | undefined;
	/**
	 * The fact one session's record carries: both observed instants, or `undefined` while either is
	 * unknown. It is the same pair {@link of} reads, so a saved record is never ahead of the reading.
	 */
	fact(sessionId: string): SessionSpanFact | undefined;
	/** Forget every span this instance holds, because the period they were observed in is gone. */
	clear(): void;
}

/** What one {@link createSessionSpans} is built from. */
export interface SessionSpanInputs {
	/**
	 * The span the loaded document already carries for one session, if it carries one.
	 *
	 * It is the store's own baseline read, asked per session: a session whose start and end were
	 * committed in an earlier process resumes from them rather than from this process's first
	 * observation, which is what makes a restart continue one span instead of starting another.
	 */
	readonly saved: (sessionId: string) => SessionSpanFact | undefined;
}

/**
 * Build the session spans one accounting instance accumulates.
 *
 * Building has no effect of its own: nothing is read and no instant is recorded. A session's facts are
 * resolved when it is first observed, from what this instance observed and from what the document
 * already carries for it. The instants themselves come from the caller, which is the party that owns
 * the clock they were read from.
 */
export function createSessionSpans(inputs: SessionSpanInputs): SessionSpans {
	const { saved } = inputs;
	/** What this instance itself observed for one session: whichever of the two facts it has seen. */
	const observed = new Map<string, { start?: number; end?: number }>();
	/** The span reading this instance last accounted for as published, by session. */
	const published = new Map<string, SessionSpanReading>();

	/** One session's own observations, created on first sight and never holding an inferred instant. */
	const factsOf = (sessionId: string): { start?: number; end?: number } => {
		const existing = observed.get(sessionId);
		if (existing !== undefined) return existing;
		const created: { start?: number; end?: number } = {};
		observed.set(sessionId, created);
		return created;
	};

	/**
	 * Both of one session's instants: the start the session already had, and the latest end that has
	 * been observed for it. Neither one is invented: a session that has only one of the two is answered
	 * with nothing.
	 *
	 * The start resolves towards the document's own instant rather than this instance's observation:
	 * a start is taken once for a session and a resume must not take a second one, so an input this
	 * instance observed after the document already carried a start is an input like any other and
	 * moves nothing. The end is the maximum of the saved and locally observed instants: a delayed Turn end
	 * never replaces a newer terminal-result receipt, and a newer baseline never moves backwards.
	 */
	const instantsOf = (sessionId: string): SessionSpanFact | undefined => {
		const facts = observed.get(sessionId);
		const record = saved(sessionId);
		const start = record?.start ?? facts?.start;
		const end = facts?.end === undefined ? record?.end : Math.max(facts.end, record?.end ?? facts.end);
		if (start === undefined || end === undefined) return undefined;
		return { start, end };
	};

	/** One session's reading, whether or not a reader has seen it before. */
	const readingOf = (sessionId: string): SessionSpanReading | undefined => {
		const fact = instantsOf(sessionId);
		if (fact === undefined) return undefined;
		return { startAt: fact.start, endAt: fact.end, elapsedMs: Math.max(0, fact.end - fact.start) };
	};

	/** Whether one session's reading differs from the last one this instance accounted for. */
	const changedReading = (sessionId: string): boolean => {
		const reading = readingOf(sessionId);
		// An unknown span is not a reading: a session that has none yet is simply not published, and a
		// session whose reading this instance already published is not un-published by a fact that
		// cannot exist — a start and an end are only ever added, never withdrawn.
		if (reading === undefined) return false;
		const before = published.get(sessionId);
		if (
			before !== undefined &&
			before.startAt === reading.startAt &&
			before.endAt === reading.endAt &&
			before.elapsedMs === reading.elapsedMs
		) {
			return false;
		}
		published.set(sessionId, reading);
		return true;
	};

	return {
		input(sessionId, at) {
			const facts = factsOf(sessionId);
			// The one thing that can establish a start is an observation, and the one thing that keeps it
			// is having one: a saved start is read through `instantsOf` and is never overwritten here.
			facts.start ??= at;
			return changedReading(sessionId);
		},
		ended(sessionId, at) {
			const facts = factsOf(sessionId);
			// A delayed Turn end must not undo a newer terminal-result receipt (or another Turn end).
			facts.end = Math.max(facts.end ?? at, at);
			return changedReading(sessionId);
		},
		of: readingOf,
		fact: instantsOf,
		clear() {
			observed.clear();
			published.clear();
		},
	};
}
