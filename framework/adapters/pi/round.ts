/**
 * pi Round observations: the two native run-cycle facts the framework synthesizes its Round axis
 * from, plus the late read of quiescence the end candidate is confirmed by. Which fact is a
 * transition, and when a candidate becomes an end, stay with the shared framework.
 *
 * pi's own loop carries the continuations — tool calls, automatic retries, compaction and queued
 * input — up to its final settlement, so this mapping is the whole of the native主干: `agent_start`
 * is an activity beginning and `agent_settled` is a run that has fully settled with nothing left to
 * continue it. pi's per-run `agent_end` is deliberately not used: it fires before those
 * continuations have been decided, so treating it as an end would cut a Round short.
 */
import type { RoundObservation, RoundSignal } from "../../core/protocol";
import type { PiExtensionApi, PiExtensionContext } from "../pi";

/** Observes pi's run-cycle facts; automatic continuations are reported by pi, never synthesized here. */
export function observeRounds(
	pi: PiExtensionApi,
	observer: (observation: RoundObservation) => void,
	context: {
		readonly frame: (ctx: PiExtensionContext) => Omit<RoundObservation, "signal" | "quiescent">;
		readonly reportMissingFact: (fact: string) => undefined;
		/** Hands the binding the unsubscriber of one native registration, so a refused binding leaks none. */
		readonly track: (release: () => void) => void;
	},
): void {
	const { reportMissingFact } = context;

	/**
	 * Whether a settled run left the session at quiescence: idle, with nothing queued.
	 *
	 * It is read late — when the framework re-checks an end candidate on its next task, not at the
	 * native settle that raised it — so it answers for what the session reports *then*. When the
	 * harness reports none of those facts, quiescence cannot be established at all: the answer is
	 * nothing rather than a value, and an unestablished quiescence closes no round.
	 *
	 * The facts read are pi's own: whether it is working or compacting, and whether a submitted
	 * message is still waiting to be taken up. Nothing here speaks for a third party's background
	 * work — an observation this entry does not have is not read as "no background activity".
	 */
	const quiescent = (ctx: PiExtensionContext): boolean | undefined => {
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
		observer({
			signal,
			...context.frame(ctx),
			quiescent: () => quiescent(ctx),
		});
	};

	context.track(pi.on("agent_start", (_event, ctx) => {
		report({ kind: "activity_started" }, ctx);
	}));
	context.track(pi.on("agent_settled", (_event, ctx) => {
		// pi publishes this fact after an agent run has fully settled, and only then: an automatic
		// retry, a compaction or a queued continuation would still be pending before it, and this
		// event does not fire. Nothing is scheduled to continue the session, so the settle reports
		// that pi left no continuation — the framework still confirms it against the late read above.
		report({ kind: "settled", willContinue: false }, ctx);
	}));
}
