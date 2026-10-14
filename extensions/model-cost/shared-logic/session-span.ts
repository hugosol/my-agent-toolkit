/**
 * Session span: the one wall-clock interval a session's own time facts add up to — from the first
 * user input this extension observed for that session in the applicable accounting period, up to the
 * latest Turn end it observed for it.
 *
 * The rules it implements are the approved ones:
 *
 * - **The start is the first user input, and it is taken once.** The first input observed for a
 *   session fixes its start; every later input leaves it where it is, and a session whose start the
 *   loaded document already carries keeps that one rather than taking a later instant. Nothing else
 *   can establish a start: not the session's creation, not the first model request, not the last
 *   transcript entry, and not a copied history — a session this extension has only just begun to
 *   observe has *no* start until the user really puts something in, which is why a fork's copied
 *   messages establish nothing and the waiting period before its first new input reads as unknown
 *   rather than as zero.
 * - **The end is the latest observed Turn end.** Every Turn end this instance observes replaces the
 *   end with that Turn's own instant — the moment its response settled, as the delivery itself states
 *   it — so the span grows across the idle time between Turns and Rounds, and across an interruption
 *   in which the program was closed. Every outcome delivers one: a completed Turn, a failed one and a
 *   cancelled one alike end the work the session did, and each ends this span at its own instant.
 *   Nothing else can establish an end: the last transcript time is not one, a Round's own end is not
 *   one — a Round may never end at all — and the instant some later handler read its clock is not one
 *   either, which is why a Turn that settled before an accounting reset is never stamped with an
 *   instant of the period that replaced it. A session whose Turns all settled keeps the latest of
 *   them, and one that has never had a Turn end stays unknown.
 * - **Both instants or nothing.** A span is read only when both of its own facts are known, so a
 *   session that has taken up input but has not had a Turn end yet is *unavailable* rather than a
 *   span of nothing. A reliable reading of exactly zero milliseconds is a real value and is not this
 *   case: two observed instants that happen to be equal are a span of zero, and they are told apart
 *   from a missing fact by the fact that they are there at all.
 * - **A period's own spans.** What this holds belongs to the accounting period it was observed in;
 *   clearing it is what a reset does, and nothing reconstructs it from an earlier period's records.
 *
 * This module reads the session record's own optional fact and holds only what this instance observed
 * itself. It writes nothing, reads no file and starts no timer, and it never adds one session's time
 * to another's.
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
	/** When this session's most recent observed Turn end was. */
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
	 * A Turn end was observed for one session, at `at`, which is that Turn's own instant. Answers
	 * whether that changed its reading.
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
	 * moves nothing. The end resolves the other way — this instance's own observation is the later
	 * one, because every observed Turn end replaces it — and the document's end is what a session
	 * that has not ended a Turn since this instance started still has.
	 */
	const instantsOf = (sessionId: string): SessionSpanFact | undefined => {
		const facts = observed.get(sessionId);
		const record = saved(sessionId);
		const start = record?.start ?? facts?.start;
		const end = facts?.end ?? record?.end;
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
			// Every observed Turn end replaces the end: the latest one is the span's own end, and a
			// later Turn is what makes the span grow rather than a second fact being added beside it.
			facts.end = at;
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
