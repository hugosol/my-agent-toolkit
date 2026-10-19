/**
 * The round axis: the round identities one binding mints per actual session, the synthesis of the
 * harness's run-cycle facts into that axis's edges, and the dispatch of an edge to the groups
 * whose scope admits it.
 *
 * A round is one actual session's continuous period of activity, so its identity is that session's
 * own: the framework mints an opaque identity when a round opens for a session, keeps it while the
 * period lasts — through tools, automatic continuations, drained queued input and a subagent the
 * session is waiting on — and retires it when the period ends. Two sessions never share one, and a
 * child's edges never touch its parent's.
 *
 * The harness reports facts, this module decides transitions:
 *
 * - A run starting opens a round *when none is open for that session*. A start that arrives while
 *   one is open is work inside it — an automatic continuation, a message the harness drained into
 *   the session, a retry — so it opens no second round and ends nothing. This is also the reading
 *   that keeps a drained queued message inside its round, which is why the framework never splits
 *   a round on a start: nothing in the native facts separates a drained message's run from a new
 *   prompt's, and guessing would either split real rounds or fabricate an end.
 * - A settle that already scheduled its continuation is a pause inside the round: no edge.
 * - A settle that scheduled nothing is an *end candidate*, and it is not confirmed here. The
 *   harness reports the run as over before its own work has unwound, so at this instant the
 *   session is usually not idle yet, and an end confirmed now would close a round the session is
 *   still working in. The candidate is therefore held and the native callback returns, letting the
 *   host settle; the framework arranges exactly one re-check on the harness's next task, and the
 *   round ends only if the session then reports quiescence — idle, nothing queued, no asynchronous
 *   job still running. A candidate that is not confirmed is kept, and the next relevant fact
 *   re-verifies it; a start or a continuation supersedes it, because the work it described went on.
 *   Nothing here polls and nothing waits on a duration: one re-check per candidate, and a session
 *   whose facts never confirm simply stays in its round.
 * - A settle with no round open is not evidence of an end — there is no round whose end it could
 *   be — so it is dropped rather than closing something that was never opened. That is also what a
 *   restore or a reload leaves behind: this binding starts with no open round, so no completion is
 *   ever fabricated for a round an earlier process was in the middle of.
 * - A session's own *disposal* closes the round it leaves behind, and it is the one boundary that
 *   waits for its own effects: an end the session had already stated and never had confirmed is
 *   confirmed there, and a round left open with no end ever stated is closed as the truncation it
 *   is. The two are told apart by the edge's `ending` rather than by anything this module keeps: a
 *   consumer that has to know whether the work finished or merely stopped being observable reads it
 *   there. The report answers once every handler the edge reached has settled, because the host
 *   reporting it is at its own exit position and what a session's last round owes — its commit — has
 *   to be finished before the host lets the session go.
 * - A settle the harness reported as *cancelled or terminally failed* is confirmed by the
 *   session's own rest alone. Such an activity has no continuation left to wait for, so work still
 *   going elsewhere — a delegation whose result will never wake it, an asynchronous job it is no
 *   longer waiting on — cannot be what its round waits for, and a round held open on one would be
 *   a round nothing could ever close. Every other settle still has to be told that nothing beyond
 *   it is held, so a cancelled or failed activity ends its round where an ordinary one would have
 *   kept waiting, and an ordinary one keeps waiting exactly as before.
 *
 * The framework has no *State* behavior of its own here, and that is the design rather than an
 * omission: the framework's State holds a declared activation value and nothing else, and no marker
 * or cell follows a round. What it does own is the identity and its lifetime, because a Turn states
 * which round it belongs to and that fact has to be the framework's rather than an adapter's or a
 * consumer's guess.
 *
 * That identity is also where the session's *activity reading* comes from, and it is dispatched here
 * — from the very transitions above — as this axis's one current-state projection: a round the
 * framework holds open is that session working, a round it has ended is that session idle. It is an
 * observation rather than State and rather than a second set of edge rules (`session-activity.ts`),
 * so an extension consuming it never answers for itself which native fact ends a session's work, and
 * no reading is ever derived from one of these edges twice.
 *
 * A handler's failure is its own. It is reported on the adapter's diagnostic channel — a channel
 * outside model context — and it changes neither the edge the delivery described nor whether
 * another subscriber runs.
 *
 * This module is harness-independent: it reads and writes no State and names no native API.
 */
import type { ExtensionDefinition } from "../core/definition";
import { handOverReading, type ObservationHandOver, type SessionObservations } from "../core/observations";
import type {
	CloseOutWait,
	RoundDelivery,
	RoundEvent,
	SubscriptionGroup,
} from "../interface/session";
import type { RoundObservation, SessionDisposal } from "../core/protocol";
import { WAIT_RESOLUTION_MS } from "../modules/files";
import { ACTIVITY_OF_EDGE, type SessionActivityAxis } from "./session-activity";
import { dispatchToGroups } from "./subscriptions";

/**
 * The wait a session's close-out gets when the host states none of its own: fifteen seconds, counted
 * from entering the close-out.
 *
 * It is the same 15000ms the framework's coordinated file update gives its own wait, which is what the
 * ticket's approved trade-off turns on: the close-out is bounded by that budget rather than by an
 * unbounded wait for slow I/O, and a wait the deadline gives up may leave an update that had already
 * begun unconfirmed rather than pretending it was cancelled. It is a ceiling as well as a default: a
 * host that states a shorter wait of its own tightens it, and none lengthens it.
 */
export const DEFAULT_CLOSE_OUT_MS = 15_000;

/**
 * The wait one close-out has, as the edge it dispatches carries it.
 *
 * The deadline is counted from the instant the close-out was entered — before the edge was built — so
 * a handler that is reached a moment later already finds part of the budget spent, which is exactly
 * what "no fresh budget of its own" means for work that had been running before the disposal. What the
 * work is offered is that much less the framework's own wait resolution, so a wait bounded by it is
 * refused *and observed as refused* inside the close-out: that is what makes a wait which can be given
 * up report itself as the uncommitted save it is, rather than leaving the host's own answer to state
 * an outcome the wait was about to settle. Whole milliseconds, because that is what this framework's
 * timers schedule and what a budget declared to the coordinated update has to be.
 */
function closeOutWait(enteredAt: number, budgetMs: number): CloseOutWait {
	const deadline = enteredAt + budgetMs;
	return {
		budgetMs,
		deadline,
		remaining: () => Math.max(0, Math.floor(deadline - performance.now()) - WAIT_RESOLUTION_MS),
	};
}

/**
 * The settlement of one close-out, or `false` once its deadline has passed.
 *
 * One timer, armed at the deadline itself, and nothing else: no retry, no polling and no added delay
 * between the deadline and the answer. A settlement that arrives first clears the timer, so a
 * close-out that concluded holds the host for as long as its work really took and not a millisecond
 * longer.
 */
function settledByDeadline(settling: Promise<void>, deadline: number): Promise<boolean> {
	return new Promise<boolean>(resolve => {
		const timer = setTimeout(() => resolve(false), Math.max(1, deadline - performance.now()));
		void settling.then(() => {
			clearTimeout(timer);
			resolve(true);
		});
	});
}

/**
 * The round identities one binding has observed for the actual sessions it serves.
 *
 * It is per binding, and a binding is one session's: the identity a Turn names is the one this
 * bookkeeping held when that Turn's request started, so a request that began inside one round
 * keeps that round even if the run that contained it settled before the response arrived.
 */
export interface RoundLives {
	/**
	 * The round identity open for one actual session, or `undefined` when no round is open.
	 *
	 * This is what a Turn's start facts ask for: with no open round, the Turn reports the round as
	 * an unavailable fact rather than borrowing the identity of a round that already ended.
	 */
	current(sessionId: string): string | undefined;
	/** Applies one edge to the bookkeeping: a start opens a round, an end retires it. */
	observe(round: RoundDelivery): void;
}

/** One binding's round bookkeeping: identity per actual session, minted from the edges observed. */
export function roundLives(): RoundLives {
	const open = new Map<string, string>();
	let minted = 0;
	return {
		current: sessionId => open.get(sessionId),
		observe: round => {
			const sessionId = round.session.sessionId;
			if (round.event.kind === "round_start") {
				// A start is a transition: the previous round of this session, if one was still
				// open, has no end evidence of its own and is truncated by the one taking its place.
				open.set(sessionId, `${sessionId}#${++minted}`);
				return;
			}
			open.delete(sessionId);
		},
	};
}

/**
 * The round axis's synthesis: the native run-cycle observations one binding was handed, turned
 * into the edges its subscribers follow.
 */
export interface RoundSynthesis {
	/** Applies one observed native run-cycle fact. */
	observe(observation: RoundObservation): void;
	/**
	 * Closes the round one actual session's own disposal leaves behind, and answers once every handler
	 * that closing reached has settled or the close-out's own wait has run out.
	 *
	 * The session's end is the whole evidence the close-out needs, and its own two cases are decided
	 * from what the binding already holds. An end the session had already stated — a settle that
	 * scheduled no continuation and was still awaiting confirmation — is confirmed here: the disposal
	 * is what that candidate was waiting for, and a session that is over is at rest, so nothing beyond
	 * it can continue it and no later read is asked. A round the session left open with no end stated
	 * is closed as a truncation, because it is one: nothing can continue it any more, and the
	 * activity's own completion was never established.
	 *
	 * A session with no round open and nothing pending — one this binding already closed, or one it
	 * never opened a round for — is no edge at all, and a second disposal of the same session closes
	 * nothing again.
	 *
	 * The wait is bounded: the budget is counted from entering this call (the host's own, when the
	 * report states one, never longer than {@link DEFAULT_CLOSE_OUT_MS}), the edge carries what is left
	 * of it, and this answers at that deadline whether or not the work it owed concluded. A close-out
	 * that is over before the deadline answers as soon as it is over; one that is not states on the
	 * diagnostic channel that its work is unconfirmed, claims no outcome for it, and leaves the
	 * document on disk as the authority.
	 */
	dispose(disposal: SessionDisposal): Promise<void>;
}

/** What one binding's synthesis arranges itself with. */
export interface RoundSynthesisInputs {
	/** The definition whose subscribers an edge is dispatched to, and whose id a failure names. */
	readonly definition: ExtensionDefinition;
	/** The binding's identity bookkeeping, which this synthesis asks and applies edges through. */
	readonly lives: RoundLives;
	/** The subscription groups an edge is offered to, in declaration order. */
	readonly groups: readonly SubscriptionGroup[];
	/**
	 * The process's session observation source, when this binding records its edges into it.
	 *
	 * A definition that consumes the framework's observations keeps this source's own activity
	 * current, so a consumer attaching later reads the activity the session is really in rather than
	 * waiting for a further edge. A binding that observes nothing the source holds passes none, and
	 * no reading is recorded.
	 */
	readonly observations?: SessionObservations;
	/**
	 * The binding's activity axis, which the edges this synthesis dispatches move.
	 *
	 * The reading is stated here rather than derived anywhere else, because this is where the
	 * framework's own transitions are decided: an edge this synthesis dispatched is what the axis
	 * reads, so the activity a subscriber observes is the same transition it was delivered and never a
	 * second interpretation of the native facts.
	 */
	readonly activity: SessionActivityAxis;
	/**
	 * Where a reading of a session whose owner this process does not serve is handed, when this
	 * binding's sessions may run in another process (see {@link ObservationHandOver}).
	 *
	 * The activity this synthesis derives is this process's own decision, so a session the harness
	 * ran elsewhere is only observed here if the process that ran it delivers what it decided there —
	 * and this is where that reading leaves, from the same edge that left it.
	 */
	readonly handOver?: ObservationHandOver;
	/** Reports a handler's failure or an unarrangeable re-check outside model context. */
	readonly reportFailure: (message: string) => void;
	/** Arranges one callback on the harness's next task; see {@link HarnessPort.nextTask}. */
	readonly nextTask: (callback: () => void) => void;
	/**
	 * Whether this binding still delivers: a re-check that arrives after the session the
	 * implementation serves was disposed dispatches nothing, exactly as a later native fact does
	 * not.
	 */
	readonly delivering: () => boolean;
}

/**
 * Build one binding's round synthesis.
 *
 * The only state it holds is each session's *end candidate* — the settle whose quiescence is
 * still to be confirmed — and holding it is what lets the native callback return before the edge
 * is dispatched. Whether a round is open is not duplicated here: {@link RoundLives} owns that,
 * and an edge is dispatched through it so that bookkeeping and subscribers always agree.
 */
export function createRoundSynthesis(inputs: RoundSynthesisInputs): RoundSynthesis {
	const { definition, lives, groups, observations, activity, handOver, reportFailure, nextTask, delivering } = inputs;
	/** The settle each session is waiting to have confirmed, by that session's identity. */
	const candidates = new Map<string, RoundObservation>();

	/**
	 * The frame one edge is built from: what an observed fact and a disposal both carry, and all an
	 * edge needs besides its own event. Naming the four fields rather than spreading them is also what
	 * keeps the live reads an observation carries beside them — its quiescence and held-work queries —
	 * from reaching a handler.
	 */
	type EdgeFrame = Pick<RoundDelivery, "session" | "owner" | "hasUI" | "feedback" | "closeOut">;

	const dispatch = (frame: EdgeFrame, event: RoundEvent): Promise<void> => {
		const delivery: RoundDelivery = {
			event,
			session: frame.session,
			owner: frame.owner,
			hasUI: frame.hasUI,
			feedback: frame.feedback,
			// The close-out wait is stated only where a host is really waiting for an answer: an edge
			// dispatched from an observed fact carries none, so no handler borrows a budget that belongs
			// to a host position nobody is standing at.
			...(frame.closeOut === undefined ? {} : { closeOut: frame.closeOut }),
		};
		const settling = dispatchRoundEvent(definition, lives, delivery, groups, reportFailure);
		// The reading this edge leaves the session in, recorded after the edge was applied so the
		// source and the subscribers agree on what the edge left behind.
		const reading = ACTIVITY_OF_EDGE[event.kind];
		if (observations?.observeActivity(delivery.session.sessionId, reading) === true) {
			// A reading this process decided is the reading its owner's process needs, where the owner
			// is not served here: it leaves with the same edge, carrying the session's own facts.
			handOverReading(handOver, { session: delivery.session, owner: delivery.owner, activity: reading });
		}
		// The edge's own current-state projection, stated after the edge so a subscriber that reads
		// both axes sees the transition before the reading it left behind. It is dispatched from the
		// session the edge named, which is why one session's transition never moves another's reading.
		activity.observe({
			session: delivery.session,
			owner: delivery.owner,
			activity: reading,
			hasUI: delivery.hasUI,
			feedback: delivery.feedback,
		});
		// The edge's own effects are stated before its handlers are waited for, and the answer is the
		// handlers' settlement: a host that reports a disposal at its own exit position is answered once
		// everything the close-out reached has settled.
		return settling;
	};

	/**
	 * The one re-check a candidate gets: at the harness's next task, and only if that candidate is
	 * still the one this session is waiting on.
	 *
	 * A candidate that is no longer pending has been superseded — the work it described continued,
	 * or another settle replaced it with its own re-check — and a re-check that ran anyway would be
	 * confirming an end the harness has already taken back.
	 *
	 * The session's own rest is read first, and it is the whole condition for one case: an activity
	 * the harness reported as cancelled or terminally failed is not waiting on anything, so nothing
	 * beyond it may keep its round open. Every other settle has to be told that nothing beyond it is
	 * held — a delegated result, an asynchronous job — before its round may end; a statement this
	 * surface did not establish confirms nothing, exactly as `false` does not.
	 */
	const recheck = (sessionId: string, candidate: RoundObservation): void => {
		if (!delivering()) return;
		if (candidates.get(sessionId) !== candidate) return;
		let confirmable: boolean | undefined;
		try {
			confirmable = candidate.quiescent();
			// An activity the harness reported as cancelled or terminally failed is not waiting on
			// anything, so nothing beyond it may keep its round open — a round left open on one could
			// never be closed again. A settle with no outcome, or with an ordinary one, has to be told
			// that nothing beyond it is held: a delegated result or an asynchronous job whose own
			// completion is what continues the session. A statement this surface did not establish
			// confirms nothing, exactly as a held one does not.
			const { signal } = candidate;
			const abandoned = signal.kind === "settled" && (signal.outcome === "cancelled" || signal.outcome === "failed");
			if (confirmable === true && !abandoned) {
				confirmable = candidate.heldWork() === false;
			}
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			reportFailure(`${definition.id}: reading whether the session is at quiescence failed: ${detail}`);
			return;
		}
		// Anything but a confirmation is not one: a session with work left keeps its candidate, and
		// the next relevant fact re-verifies it rather than this module asking again.
		if (confirmable !== true) return;
		candidates.delete(sessionId);
		void dispatch(candidate, { kind: "round_end", ending: "confirmed" });
	};

	return {
		observe(observation) {
			const sessionId = observation.session.sessionId;
			if (observation.signal.kind === "activity_started") {
				// Work is running in this session: whatever settle was still awaiting confirmation
				// described a pause the session has now left, so it is dropped rather than confirmed.
				candidates.delete(sessionId);
				if (lives.current(sessionId) !== undefined) return;
				void dispatch(observation, { kind: "round_start" });
				return;
			}
			// A settle: the run ended. With no round open there is no end this could be evidence of —
			// and nothing a candidate could still be waiting on.
			if (lives.current(sessionId) === undefined) {
				candidates.delete(sessionId);
				return;
			}
			if (observation.signal.willContinue) {
				// The run already scheduled its next piece of work: a pause inside the round.
				candidates.delete(sessionId);
				return;
			}
			candidates.set(sessionId, observation);
			try {
				nextTask(() => recheck(sessionId, observation));
			} catch (error) {
				const detail = error instanceof Error ? error.message : String(error);
				reportFailure(`${definition.id}: arranging the round end re-check failed: ${detail}`);
			}
		},
		async dispose(disposal) {
			const sessionId = disposal.session.sessionId;
			// Whatever this session had stated and not yet had confirmed is consumed here whether or not
			// it is confirmed below: the session is going away, so a candidate the close-out does not use
			// is not kept for a later fact that can no longer arrive — and the re-check already arranged
			// for it finds a candidate it no longer matches, which is what keeps an end from being
			// delivered twice.
			const candidate = candidates.get(sessionId);
			candidates.delete(sessionId);
			// A round this binding never opened — one it already closed, or a session whose facts it only
			// ever read — is no edge at all: there is no round whose end this disposal could be. Nothing
			// is owed, so nothing is waited for either.
			if (lives.current(sessionId) === undefined) return;
			// The wait this close-out has. It is entered here, before the edge is built, so the budget is
			// counted from the instant the host reported its position rather than from wherever a handler
			// happens to be reached; the host's own bound, when it states one, is what that position
			// really allows and the framework's default is the ceiling of what it promises either way.
			const budgetMs = Math.min(disposal.closeOutWaitMs ?? DEFAULT_CLOSE_OUT_MS, DEFAULT_CLOSE_OUT_MS);
			const closeOut = closeOutWait(performance.now(), budgetMs);
			const frame: EdgeFrame = {
				session: disposal.session,
				owner: disposal.owner,
				hasUI: disposal.hasUI,
				feedback: disposal.feedback,
				closeOut,
			};
			// The two cases of a session's own end, and both are the close-out: an end it had already
			// stated is confirmed where the disposal is reported rather than on a task the disposing host
			// may never reach — no late read is asked for it, because a session that is over is at rest
			// and nothing beyond it can continue it — and a round left open with no end ever stated is
			// closed as the truncation it is, because nothing can continue it any more and the activity's
			// own completion was never established.
			const settling = candidate !== undefined
				? dispatch(frame, { kind: "round_end", ending: "confirmed" })
				: dispatch(frame, { kind: "round_end", ending: "truncated" });
			if (await settledByDeadline(settling, closeOut.deadline)) return;
			// The deadline passed with that edge's work still owed. What is stated is exactly that much:
			// the wait is over and the work's outcome is not known here — an update that had already
			// begun may still be publishing, and a wait that could be given up is given up by the budget
			// it was handed rather than by this line. Claiming a cancellation, a document that was not
			// written, or a save would each be a statement this framework cannot make; the document on
			// disk is what decides, and whoever reads it later sees what really happened.
			reportFailure(
				`${definition.id}: the close-out of session "${sessionId}" was not answered within its ${budgetMs}ms budget, ` +
					"so whatever work that edge still owed is unconfirmed: this states neither that it was cancelled, " +
					"nor that nothing was written, nor that it was saved, and the document on disk remains the authority.",
			);
		},
	};
}

/**
 * Applies one round edge: the framework's own bookkeeping, then the subscribed handlers.
 *
 * The bookkeeping runs first for every delivery whether or not a handler arrived, so a handler
 * observes the identity the edge left behind rather than one an earlier delivery minted.
 *
 * The answer is the settlement of every handler this edge reached — a failure included, which is
 * reported rather than rejected — so a caller that has to wait for the edge's effects can, and a
 * caller that does not is not delayed by it.
 */
export function dispatchRoundEvent(
	definition: ExtensionDefinition,
	lives: RoundLives,
	round: RoundDelivery,
	groups: readonly SubscriptionGroup[],
	reportFailure: (message: string) => void,
): Promise<void> {
	lives.observe(round);
	return dispatchToGroups(
		definition.id,
		groups,
		round.event.kind,
		round.owner,
		() => ({ delivery: round }),
		reportFailure,
	);
}
