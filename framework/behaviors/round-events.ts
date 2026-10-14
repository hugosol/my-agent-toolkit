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
 *
 * The framework has no *State* behavior of its own here, and that is the design rather than an
 * omission: the agent's work condition is a fact of the extension (contract P6), the framework's
 * State holds a declared activation value and nothing else, and no marker or cell follows a round.
 * What it does own is the identity and its lifetime, because a Turn states which round it belongs
 * to and that fact has to be the framework's rather than an adapter's or a consumer's guess.
 *
 * A handler's failure is its own. It is reported on the adapter's diagnostic channel — a channel
 * outside model context — and it changes neither the edge the delivery described nor whether
 * another subscriber runs.
 *
 * This module is harness-independent: it reads and writes no State and names no native API.
 */
import type { ExtensionDefinition } from "../core/definition";
import type { RoundDelivery, RoundEvent, RoundObservation, SubscriptionGroup } from "../core/protocol";
import { dispatchToGroups } from "./subscriptions";

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
}

/** What one binding's synthesis arranges itself with. */
export interface RoundSynthesisInputs {
	/** The definition whose subscribers an edge is dispatched to, and whose id a failure names. */
	readonly definition: ExtensionDefinition;
	/** The binding's identity bookkeeping, which this synthesis asks and applies edges through. */
	readonly lives: RoundLives;
	/** The subscription groups an edge is offered to, in declaration order. */
	readonly groups: readonly SubscriptionGroup[];
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
	const { definition, lives, groups, reportFailure, nextTask, delivering } = inputs;
	/** The settle each session is waiting to have confirmed, by that session's identity. */
	const candidates = new Map<string, RoundObservation>();

	const dispatch = (observation: RoundObservation, kind: RoundEvent["kind"]): void => {
		dispatchRoundEvent(
			definition,
			lives,
			{
				event: { kind },
				session: observation.session,
				owner: observation.owner,
				hasUI: observation.hasUI,
				feedback: observation.feedback,
			},
			groups,
			reportFailure,
		);
	};

	/**
	 * The one re-check a candidate gets: at the harness's next task, and only if that candidate is
	 * still the one this session is waiting on.
	 *
	 * A candidate that is no longer pending has been superseded — the work it described continued,
	 * or another settle replaced it with its own re-check — and a re-check that ran anyway would be
	 * confirming an end the harness has already taken back.
	 */
	const recheck = (sessionId: string, candidate: RoundObservation): void => {
		if (!delivering()) return;
		if (candidates.get(sessionId) !== candidate) return;
		let quiescent: boolean | undefined;
		try {
			quiescent = candidate.quiescent();
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			reportFailure(`${definition.id}: reading whether the session is at quiescence failed: ${detail}`);
			return;
		}
		// Anything but a confirmation is not one: a session with work left keeps its candidate, and
		// the next relevant fact re-verifies it rather than this module asking again.
		if (quiescent !== true) return;
		candidates.delete(sessionId);
		dispatch(candidate, "round_end");
	};

	return {
		observe(observation) {
			const sessionId = observation.session.sessionId;
			if (observation.signal.kind === "activity_started") {
				// Work is running in this session: whatever settle was still awaiting confirmation
				// described a pause the session has now left, so it is dropped rather than confirmed.
				candidates.delete(sessionId);
				if (lives.current(sessionId) !== undefined) return;
				dispatch(observation, "round_start");
				return;
			}
			// A settle: the run ended. With no round open there is no end this could be evidence of —
			// and nothing a candidate could still be waiting on.
			if (lives.current(sessionId) === undefined) {
				candidates.delete(sessionId);
				return;
			}
			if (observation.signal.willContinue) {
				// The session already scheduled its next piece of work: a pause inside the round.
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
	};
}

/**
 * Applies one round edge: the framework's own bookkeeping, then the subscribed handlers.
 *
 * The bookkeeping runs first for every delivery whether or not a handler arrived, so a handler
 * observes the identity the edge left behind rather than one an earlier delivery minted.
 */
export function dispatchRoundEvent(
	definition: ExtensionDefinition,
	lives: RoundLives,
	round: RoundDelivery,
	groups: readonly SubscriptionGroup[],
	reportFailure: (message: string) => void,
): void {
	lives.observe(round);
	dispatchToGroups(
		definition.id,
		groups,
		round.event.kind,
		round.owner,
		() => ({ delivery: round }),
		reportFailure,
	);
}
