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

/**
 * What this entry can state about one session's background work: the fact that decides whether a
 * settled session has really come to rest.
 *
 * A session can be idle with nothing queued and still be waiting — on a delegation running
 * elsewhere, on a result that has not arrived, on a wake that has not started — and the provider that
 * runs that work is the party that states it, in its own published terms.
 *
 * - `holds`: the provider states it still holds work this session waits on. The session is not at
 *   rest; the Round stays open.
 * - `clear`: the provider states it holds none. This is the provider's own answer, and the only one
 *   that lets the rest condition hold.
 * - `unread`: no such statement was obtained. Nothing is established either way, so it is answered as
 *   nothing: a candidate that reads it stays unconfirmed rather than closing a Round on a statement
 *   this entry never read.
 */
export type SessionBackgroundWork =
	| { readonly state: "holds" }
	| { readonly state: "clear" }
	| { readonly state: "unread"; readonly reason: string };

/** Observes pi's run-cycle facts; automatic continuations are reported by pi, never synthesized here. */
export function observeRounds(
	pi: PiExtensionApi,
	observer: (observation: RoundObservation) => void,
	context: {
		readonly frame: (ctx: PiExtensionContext) => Omit<RoundObservation, "signal" | "quiescent">;
		readonly reportMissingFact: (fact: string) => undefined;
		/** Reports a background statement this entry could not read, once, outside model context. */
		readonly reportUnread: (reason: string) => void;
		/**
		 * What this process's subagent provider states about one session's background work.
		 *
		 * It is asked only when the session already looks idle with nothing queued, and it is the
		 * assembly's own read of that provider rather than anything this mapping derives: what it
		 * answers is the provider's statement, and the vocabulary above is what it may answer with.
		 */
		readonly background: (sessionId: string) => SessionBackgroundWork;
		/** Hands the binding the unsubscriber of one native registration, so a refused binding leaks none. */
		readonly track: (release: () => void) => void;
	},
): void {
	const { reportMissingFact } = context;

	/**
	 * Whether a settled run left the session at rest: idle, with nothing queued, and with no
	 * background work the provider states this session is still waiting on.
	 *
	 * It is read late — when the framework re-checks an end candidate on its next task, not at the
	 * native settle that raised it — so it answers for what the session reports *then*. When the
	 * harness reports none of its own facts, rest cannot be established at all: the answer is nothing
	 * rather than a value, and an unestablished rest closes no round.
	 *
	 * The facts read are pi's own — whether it is working or compacting, and whether a submitted
	 * message is still waiting to be taken up — plus the one statement about a third party's work that
	 * this assembly reads: whether the subagent provider still holds something for this session. The
	 * provider is asked only once the session otherwise looks idle, its own answer is what decides,
	 * and a statement this entry could not read is reported and answered as nothing rather than as
	 * rest. Nothing here waits on a duration or polls: one read per re-check, and no timer of its own.
	 */
	const quiescent = (ctx: PiExtensionContext, sessionId: string): boolean | undefined => {
		if (typeof ctx.isIdle !== "function") return reportMissingFact("idle fact (isIdle)");
		if (typeof ctx.hasPendingMessages !== "function") {
			return reportMissingFact("pending-message fact (hasPendingMessages)");
		}
		if (!ctx.isIdle() || ctx.hasPendingMessages()) return false;
		const background = context.background(sessionId);
		if (background.state === "holds") return false;
		if (background.state === "clear") return true;
		context.reportUnread(background.reason);
		return undefined;
	};

	// The adapter's whole job on this axis: map pi's own run-cycle facts to the observations the
	// framework synthesizes the round axis from. A start is reported even while a round is open, and
	// a settle is reported whether or not the session looks idle at this instant, because the session
	// is only read for quiescence when the framework re-checks.
	const report = (signal: RoundSignal, ctx: PiExtensionContext): void => {
		// The session this observation is about, read once: the late re-check asks the session's own
		// identity which provider statement belongs to it, and reads it from this same context.
		const frame = context.frame(ctx);
		observer({
			signal,
			...frame,
			quiescent: () => quiescent(ctx, frame.session.sessionId),
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
