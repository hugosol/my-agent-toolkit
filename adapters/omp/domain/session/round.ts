/**
 * OMP Round observations: native activity subscriptions, the outcome of the activity they describe,
 * and the late reads an end candidate is confirmed by. The shared framework owns Round transitions
 * and schedules their confirmation; binding-wide diagnostic deduplication stays with the port's
 * diagnostic channel.
 *
 * This harness states both halves the framework's rest condition needs in its own vocabulary: its
 * settle carries whether the session already scheduled its next piece of work, and the finalized
 * assistant message states how the cycle ended — the same material this adapter's Turn mapping reads
 * an outcome from. A settle that scheduled nothing is a candidate; its outcome says whether the
 * activity was cancelled or failed, and its late reads say whether the session's own work has
 * unwound and whether anything beyond the run still holds it.
 */
import type { HarnessPort, RoundObservation, RoundSignal, TurnOutcome } from "../../../../framework/core/protocol";
import type { OmpExtensionApi, OmpSessionContext } from "../../internal/native";
import { outcomeOf } from "./turn";

/** Observes native run facts; automatic continuations are reported, never synthesized here. */
export function observeRounds(
	pi: OmpExtensionApi,
	observer: Parameters<HarnessPort["onRound"]>[0],
	context: {
		readonly frame: (ctx: OmpSessionContext) => Omit<RoundObservation, "signal" | "quiescent" | "heldWork">;
		readonly reportMissingFact: (fact: string) => undefined;
	},
): void {
	const { reportMissingFact } = context;

	/**
	 * How each session's current activity has ended so far, as the last assistant message to settle
	 * stated it.
	 *
	 * It is per session and lasts until that session's next activity begins, which is what keeps one
	 * activity's outcome from being read for another: an automatic retry, a compaction, a drained
	 * queued message or a later prompt starts the activity whose outcome is read at its own settle.
	 */
	const activityOutcome = new Map<string, TurnOutcome>();

	/**
	 * Whether the session's own run has come to rest: it is idle and nothing it accepted is still
	 * waiting to be taken up.
	 *
	 * It is read late — when the framework re-checks an end candidate, not at the native settle that
	 * raised it — so it answers for what the context reports *then*. When the harness reports none of
	 * those facts, rest cannot be established at all: the answer is nothing rather than a value, and
	 * an unestablished rest closes no round.
	 */
	const quiescent = (ctx: OmpSessionContext): boolean | undefined => {
		if (typeof ctx.isIdle !== "function") return reportMissingFact("idle fact (isIdle)");
		if (typeof ctx.hasPendingMessages !== "function") {
			return reportMissingFact("pending-message fact (hasPendingMessages)");
		}
		return ctx.isIdle() && !ctx.hasPendingMessages();
	};

	/**
	 * Whether work beyond the run that settled still holds this session: an asynchronous job this
	 * session owns whose result will resume it.
	 *
	 * It is read only for a settle the framework did not read as a cancelled or failed activity, and
	 * only after the session's own facts already look settled. A host that reports no such fact
	 * states neither answer, so a round whose end would rest on it is not confirmed.
	 */
	const heldWork = (ctx: OmpSessionContext): boolean | undefined => {
		if (typeof ctx.getAsyncJobSnapshot !== "function") {
			return reportMissingFact("async-job fact (getAsyncJobSnapshot)");
		}
		return (ctx.getAsyncJobSnapshot()?.running.length ?? 0) !== 0;
	};

	// The adapter's whole job on this axis: map the harness's run-cycle facts to the
	// observations the framework synthesizes the round axis from. Nothing about which fact is
	// a transition is decided here — a start is reported even while a round is open, and a
	// settle is reported whether or not the session looks idle at this instant, because the
	// session it belongs to is only read for quiescence when the framework re-checks.
	const report = (signal: RoundSignal, ctx: OmpSessionContext): void => {
		observer({
			signal,
			...context.frame(ctx),
			// The live reads the framework's re-checks ask for, at its own next task: what the
			// context reports *then* is what decides whether the round ended, never what it
			// reported while this native callback was still running.
			quiescent: () => quiescent(ctx),
			heldWork: () => heldWork(ctx),
		});
	};

	pi.on("agent_start", (_event, ctx) => {
		// A new activity: whatever the last one ended as belongs to it alone, so nothing this one
		// settles with can be read as that outcome.
		activityOutcome.delete(ctx.sessionManager.getSessionId());
		report({ kind: "activity_started" }, ctx);
	});
	pi.on("message_end", (event, ctx) => {
		// Only the finalized assistant response states how a cycle ended; every other message kind
		// this hook also fires for settles no model cycle.
		if (event.message.role !== "assistant") return;
		activityOutcome.set(ctx.sessionManager.getSessionId(), outcomeOf(event.message));
	});
	pi.on("agent_end", (event, ctx) => {
		// The run settled, carrying the harness's own continuation flag: `true` means the
		// session already scheduled its next piece of work — an automatic retry, an
		// empty-stop recovery, a compaction or stop-hook turn, a pending asynchronous wake —
		// and an absent flag means it scheduled nothing.
		//
		// The activity's own outcome is reported beside that flag, so a settle the harness states as
		// terminal and whose last message was cancelled or failed is told apart from one that simply
		// answered: neither the framework nor this adapter interprets an error further than the
		// closed stop-reason vocabulary the Turn mapping already reads.
		const sessionId = ctx.sessionManager.getSessionId();
		const outcome = activityOutcome.get(sessionId);
		report(
			{ kind: "settled", willContinue: event.willContinue === true, ...(outcome === undefined ? {} : { outcome }) },
			ctx,
		);
	});
}
