/**
 * pi Round observations: the two native run-cycle facts the framework synthesizes its Round axis
 * from, the outcome of the activity they describe, and the late reads its end candidate is
 * confirmed by. Which fact is a transition, when a candidate becomes an end, and which reads that
 * end is confirmed by stay with the shared framework.
 *
 * pi's own loop carries the continuations — tool calls, automatic retries, compaction and queued
 * input — up to its final settlement, so this mapping is the whole of the native主干: `agent_start`
 * is an activity beginning and `agent_settled` is a run that has fully settled with nothing left to
 * continue it. pi's per-run `agent_end` is deliberately not used: it fires before those
 * continuations have been decided, so treating it as an end would cut a Round short.
 *
 * The activity's outcome is read from pi's own material — the settled fact's abort flag, and the
 * stop reason pi itself derives its `agent_before_settle` outcome from in the finalized assistant
 * message — and reported beside the settle so the framework can tell an activity that was
 * cancelled or failed from one that simply answered. It is kept per session until the next
 * activity begins, so a round ended by cancellation states that cancellation and a later activity
 * never inherits it.
 */
import type { TurnOutcome } from "../../../../../framework/interface/session";
import { defineAdapterDelivery } from "../../../../../framework/runtime/adapter-authoring";
import type { RoundObservation, RoundSignal } from "../../../../../framework/runtime/port";
import type { PiExtensionApi, PiExtensionContext } from "./types";
import { outcomeOf } from "./turn";

/** Observes pi's run-cycle facts; automatic continuations are reported by pi, never synthesized here. */
export function observeRounds(
	pi: PiExtensionApi,
	observer: (observation: RoundObservation) => void,
	context: {
		readonly frame: (ctx: PiExtensionContext) => Omit<RoundObservation, "signal" | "quiescent" | "heldWork">;
		readonly reportMissingFact: (fact: string) => undefined;
		/** Cross-source rest condition supplied by the composition, read only after native quiescence. */
		readonly heldWork: (sessionId: string) => boolean | undefined;
		/**
		 * Whether this binding has observed that session's own end.
		 *
		 * The two late reads below are reads of a live session, and pi spends a session's context once
		 * the session is gone: a session that ended before the re-check ran can no longer be asked
		 * whether it is working or whether anything is queued. That is not an unread statement about
		 * work still going — it is the end of the work itself, and the session's own end is a fact this
		 * binding already observed (its `session_shutdown`), so the re-check answers from it rather
		 * than from a context that is no longer readable. A Round that could not be closed this way
		 * would hold a session's last exchange open forever, and nothing would ever settle it: a
		 * session that is over is at rest, and nothing beyond it can continue it.
		 */
		readonly sessionOver: (sessionId: string) => boolean;
		/** Hands the binding the unsubscriber of one native registration, so a refused binding leaks none. */
		readonly track: (release: () => void) => void;
	},
): void {
	const { reportMissingFact } = context;

	/**
	 * How each session's current activity has ended so far, as pi's own facts state it: the settle's
	 * abort flag, or the outcome of the last assistant message to settle.
	 *
	 * It is per session and it lasts until that session's next activity begins, which is what keeps
	 * one activity's outcome from being read for another: an automatic retry, a compaction, a drained
	 * queued message or a later prompt starts the activity whose outcome will be read at its own
	 * settle.
	 */
	const activityOutcome = new Map<string, TurnOutcome>();

	/**
	 * Whether pi's own work in this session has come to rest: it is idle and nothing it accepted is
	 * still waiting to be taken up.
	 *
	 * It is read late — when the framework re-checks an end candidate on its next task, not at the
	 * native settle that raised it — so it answers for what the session reports *then*. A session this
	 * binding has seen end reports nothing any more: pi spends its context, and a session that is over
	 * is at rest by definition. When pi reports neither fact, rest cannot be established at all: the
	 * answer is nothing rather than a value, and an unestablished rest closes no round.
	 */
	const quiescent = (ctx: PiExtensionContext, sessionId: string): boolean | undefined => {
		if (context.sessionOver(sessionId)) return true;
		if (typeof ctx.isIdle !== "function") return reportMissingFact("idle fact (isIdle)");
		if (typeof ctx.hasPendingMessages !== "function") {
			return reportMissingFact("pending-message fact (hasPendingMessages)");
		}
		return ctx.isIdle() && !ctx.hasPendingMessages();
	};


	// The adapter's whole job on this axis: map pi's own run-cycle facts to the observations the
	// framework synthesizes the round axis from. A start is reported even while a round is open, and
	// a settle is reported whether or not the session looks idle at this instant, because the session
	// is only read for quiescence when the framework re-checks.
	const report = (signal: RoundSignal, ctx: PiExtensionContext): void => {
		// The session this observation is about, read once: the late re-checks ask the session's own
		// identity which statement belongs to it, and read it from this same context.
		const frame = context.frame(ctx);
		observer(defineAdapterDelivery("round", {
			signal,
			...frame,
			quiescent: () => quiescent(ctx, frame.session.sessionId),
			heldWork: () => context.heldWork(frame.session.sessionId),
		}));
	};

	context.track(pi.on("agent_start", (_event, ctx) => {
		// A new activity: whatever the last one ended as belongs to it alone, so nothing this one
		// settles with can be read as that outcome.
		activityOutcome.delete(ctx.sessionManager.getSessionId());
		report({ kind: "activity_started" }, ctx);
	}));
	context.track(pi.on("message_end", (event, ctx) => {
		// Only the finalized assistant response states how a cycle ended; every other message kind
		// this hook also fires for settles no model cycle.
		if (event.message.role !== "assistant") return;
		activityOutcome.set(ctx.sessionManager.getSessionId(), outcomeOf(event.message));
	}));
	context.track(pi.on("agent_settled", (event, ctx) => {
		// pi publishes this fact after an agent run has fully settled, and only then: an automatic
		// retry, a compaction or a queued continuation would still be pending before it, and this
		// event does not fire. Nothing is scheduled to continue the session, so the settle reports
		// that pi left no continuation — the framework still confirms it against the late reads above.
		//
		// The activity's own outcome is reported beside it: pi's own abort flag when the run ended
		// because it was aborted, and otherwise what the last settled message stated. A settle pi
		// reports neither for states no outcome, which is not a completed activity.
		const sessionId = ctx.sessionManager.getSessionId();
		const outcome = event.aborted ? "cancelled" : activityOutcome.get(sessionId);
		report({ kind: "settled", willContinue: false, ...(outcome === undefined ? {} : { outcome }) }, ctx);
	}));
}

