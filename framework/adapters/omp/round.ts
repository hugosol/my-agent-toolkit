/**
 * OMP Round observations: native activity subscriptions and a late read of quiescence.
 * The shared framework owns Round transitions and schedules their confirmation;
 * binding-wide diagnostic deduplication stays with the adapter assembly.
 */
import type { HarnessPort, RoundObservation, RoundSignal } from "../../core/protocol";
import type { OmpExtensionApi, OmpSessionContext } from "../omp";

/** Observes native run facts; automatic continuations are reported, never synthesized here. */
export function observeRounds(
	pi: OmpExtensionApi,
	observer: Parameters<HarnessPort["onRound"]>[0],
	context: {
		readonly frame: (ctx: OmpSessionContext) => Omit<RoundObservation, "signal" | "quiescent">;
		readonly reportMissingFact: (fact: string) => undefined;
	},
): void {
	const { reportMissingFact } = context;
	/**
	 * Whether a settled run left the session at quiescence: idle, with nothing queued and no
	 * asynchronous job still running.
	 *
	 * It is read late — when the framework re-checks an end candidate, not at the native settle
	 * that raised it — so it answers for what the context reports *then*. When the harness reports
	 * none of those facts, quiescence cannot be established at all: the answer is nothing rather
	 * than a value, and an unestablished quiescence closes no round.
	 */
	const quiescent = (ctx: OmpSessionContext): boolean | undefined => {
		if (typeof ctx.isIdle !== "function") return reportMissingFact("idle fact (isIdle)");
		if (typeof ctx.hasPendingMessages !== "function") {
			return reportMissingFact("pending-message fact (hasPendingMessages)");
		}
		if (typeof ctx.getAsyncJobSnapshot !== "function") {
			return reportMissingFact("async-job fact (getAsyncJobSnapshot)");
		}
		return ctx.isIdle() && !ctx.hasPendingMessages() && (ctx.getAsyncJobSnapshot()?.running.length ?? 0) === 0;
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
			// The live read the framework's re-check asks for, at its own next task: what the
			// context reports *then* is what decides whether the round ended, never what it
			// reported while this native callback was still running.
			quiescent: () => quiescent(ctx),
		});
	};

	pi.on("agent_start", (_event, ctx) => {
		report({ kind: "activity_started" }, ctx);
	});
	pi.on("agent_end", (event, ctx) => {
		// The run settled, carrying the harness's own continuation flag: `true` means the
		// session already scheduled its next piece of work — an automatic retry, an
		// empty-stop recovery, a compaction or stop-hook turn, a pending asynchronous wake —
		// and an absent flag means it scheduled nothing.
		report({ kind: "settled", willContinue: event.willContinue === true }, ctx);
	});
}
