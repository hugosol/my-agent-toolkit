/**
 * pi's command surface: one host command registration per framework command, handed the live
 * session facts a command implementation asks for.
 *
 * The native registration is the adapter's work; which commands exist, what they print and what they
 * change stay with the extension's implementation through the framework's directed command shape.
 * The idle fact is answered as nothing when the host reports none at all: an unreported activity
 * state is not idleness, and the framework reports the absence rather than answering for the host.
 */
import { defineAdapterDelivery } from "../../../../../framework/runtime/adapter-authoring";
import type { HarnessPort } from "../../../../../framework/runtime/port";
import { feedbackTransport } from "../../../domain/feedback";
import { markerTransport } from "../../../domain/marker";
import type { PiPortContext } from "../../../internal/port";

/** The command axis of one binding's port. */
export function registerPiCommand(context: PiPortContext): NonNullable<HarnessPort["registerCommand"]> {
	return command => {
		context.pi.registerCommand(command.name, {
			description: command.description,
			handler: async (args, ctx) => {
				const feedback = feedbackTransport(ctx);
				await command.run(defineAdapterDelivery("command", {
					args,
					owner: context.resolveOwner(ctx),
					persist: context.statePersistence.persist,
					hasUI: ctx.hasUI,
					// The idle fact this command's own session reports, answered as nothing when this
					// surface reports none at all: the command that reads it refuses on that answer
					// instead of reading it as permission.
					canAcceptInput: () =>
						typeof ctx.isIdle === "function" ? ctx.isIdle() : context.reportMissingFact("idle fact (isIdle)"),
					provider: ctx.model?.provider,
					feedback,
					markers: markerTransport(ctx),
				}));
			},
		});
	};
}
