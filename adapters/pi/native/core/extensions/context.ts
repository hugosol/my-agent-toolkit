/**
 * pi's context reading: the host's own context usage, collected at the three native facts a
 * session's context really moves at and framed with the delivery it was read in.
 *
 * It is delivered to the framework's unified observation source, from which shared logic reads it.
 * A count pi did not state — absent, or
 * pi's own `null` for an unknown context right after a compaction — is no reading at all rather
 * than a context of nothing, so nothing is reported for it.
 */
import { defineAdapterDelivery } from "../../../../../framework/runtime/adapter-authoring";
import type { HarnessPort } from "../../../../../framework/runtime/port";
import type { PiExtensionContext } from "./types";
import type { PiPortContext } from "../../../port";
import { feedbackTransport } from "./ui";

/** The context-reading axis of one binding's port. */
export function onPiSessionContext(context: PiPortContext): NonNullable<HarnessPort["onSessionContext"]> {
	return handler => {
		/**
		 * One collection: this session's own context as pi reports it now, framed with the facts of
		 * the delivery it was read in.
		 *
		 * The model travels with the reading because the figure is displayed against that model's
		 * channel budget, and never against the host's own reported context window.
		 */
		const collect = (ctx: PiExtensionContext): void => {
			const usage = ctx.getContextUsage?.();
			if (typeof usage?.tokens !== "number") return;
			const feedback = feedbackTransport(ctx);
			handler(defineAdapterDelivery("context", {
				session: context.sessionFactsOf(ctx),
				owner: context.resolveOwner(context.catalogued(ctx)),
				reading: {
					tokens: usage.tokens,
					...(ctx.model?.provider === undefined ? {} : { provider: ctx.model.provider }),
					...(ctx.model?.id === undefined ? {} : { model: ctx.model.id }),
				},
				hasUI: ctx.hasUI,
				feedback,
			}));
		};
		// The three native facts a session's own context reading really moves at: the start that
		// establishes the first one, the finalized message the conversation grows by, and the run
		// that fully settled — a compaction the run itself decided happens before that settle.
		// These are this adapter's own collection points; which reading is a change is not decided
		// here, so the same numbers read twice are reported twice and the framework drops the repeat.
		context.keepSubscription(context.pi.on("session_start", (_event, ctx) => collect(ctx)));
		context.keepSubscription(context.pi.on("message_end", (_event, ctx) => collect(ctx)));
		context.keepSubscription(context.pi.on("agent_settled", (_event, ctx) => collect(ctx)));
	};
}
