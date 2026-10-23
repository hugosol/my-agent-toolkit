/** Combines native run settlement/quiescence with pi-subagents held background work. */
import type { HarnessPort } from "../../../framework/runtime/port";
import { feedbackTransport } from "../domain/feedback";
import type { PiPortContext } from "../port";
import { observeRounds } from "../native/core/extensions/round";

/** The Round axis of one binding's port: the native run-cycle facts, framed for the framework. */
export function onPiRound(context: PiPortContext): NonNullable<HarnessPort["onRound"]> {
	return observer => {
		observeRounds(context.pi, observer, {
			frame: ctx => {
				const feedback = feedbackTransport(ctx);
				return {
					session: context.sessionFactsOf(context.catalogued(ctx)),
					owner: context.resolveOwner(ctx),
					hasUI: ctx.hasUI,
					feedback,
				};
			},
			reportMissingFact: context.reportMissingFact,
			// This process's subagent provider, as the assembly's own integration reads it: while a
			// session is waiting on a delegation the provider still holds, the session is not at rest,
			// and a statement this entry cannot read stays unread rather than being answered as rest.
			heldWork: sessionId => {
				// A disposed native session cannot be continued by provider work elsewhere.
				if (context.endedSessions.has(sessionId)) return false;
				const background = context.integration?.backgroundActivity(sessionId) ?? { state: "clear" };
				if (background.state === "holds") return true;
				if (background.state === "clear") return false;
				context.reportUnread(background.reason);
				return undefined;
			},
			// The sessions this binding has seen end: their late re-checks read the fact this binding
			// observed rather than a context pi has spent.
			sessionOver: sessionId => context.endedSessions.has(sessionId),
			track: context.keepSubscription,
		});
	};
}
