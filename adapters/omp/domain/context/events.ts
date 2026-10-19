/**
 * OMP context observations: the native facts a session's own context reading really moves at.
 *
 * A context reading states how full this session's conversation is *at the instant it is read*,
 * which is why the collection points are the native facts where that really moves: the session's
 * start, a finalized message, and the run that ended. Which of two readings is a change is the
 * framework's rule, so a repeat is still reported.
 *
 * The newest-context tracker and the idle read live in `queries.ts`; this module subscribes and
 * assembles the delivery frame from the binding's own references.
 */
import type { SessionContextObservation } from "../../../../framework/core/protocol";
import type { OwnerReference } from "../../../../framework/interface/state";
import { feedbackTransport } from "../feedback";
import type { OmpExtensionApi, OmpSessionContext } from "../../internal/native";
import { sessionFactsOf } from "../session/queries";

/** Subscribes the three native facts a session's own context reading really moves at. */
export function observeSessionContext(
	pi: OmpExtensionApi,
	handler: (observation: SessionContextObservation) => void,
	context: {
		readonly record: (ctx: OmpSessionContext) => OmpSessionContext;
		readonly owner: (ctx: OmpSessionContext) => OwnerReference;
	},
): void {
	/**
	 * One framed collection per reading the host states.
	 *
	 * `record` is called first so the delivery's own facts are the newest, exactly as every other
	 * observation records its delivery. A count the host did not state is no reading at all — "no
	 * count" is not a context of nothing — so nothing is reported for it, exactly as the
	 * framework's own `Unknown` rule requires. The model travels with the reading because the
	 * figure is displayed against that model's channel budget, and never against the host's own
	 * context window.
	 */
	const collect = (ctx: OmpSessionContext): void => {
		const usage = ctx.getContextUsage?.();
		if (usage?.tokens === undefined) return;
		const recorded = context.record(ctx);
		handler({
			session: sessionFactsOf(pi, recorded),
			owner: context.owner(recorded),
			hasUI: recorded.hasUI,
			feedback: feedbackTransport(recorded),
			reading: {
				tokens: usage.tokens,
				...(ctx.model?.provider === undefined ? {} : { provider: ctx.model.provider }),
				...(ctx.model?.id === undefined ? {} : { model: ctx.model.id }),
			},
		});
	};
	// These are the adapter's own collection points; nothing here decides which of them is a
	// change, so the same reading read twice is reported twice and the framework drops the repeat.
	pi.on("session_start", (_event, ctx) => collect(ctx));
	pi.on("message_end", (_event, ctx) => collect(ctx));
	pi.on("agent_end", (_event, ctx) => collect(ctx));
}
