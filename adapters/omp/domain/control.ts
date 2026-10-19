/**
 * OMP control commands: the native command surface, mapped to the framework's bound command.
 *
 * An `actions` command's effect is awaited by the harness's own command chain, so the operator's
 * command concludes with the effect rather than beside it; every other control kind concludes
 * synchronously and returns nothing. Persistence writes through this binding's own State entry,
 * and feedback is user-visible only.
 */
import type { FeedbackTransport } from "../../../framework/interface/feedback";
import type { OwnerReference } from "../../../framework/interface/state";
import type { BoundCommand, MarkerTransport, StateValues } from "../../../framework/core/protocol";
import { canAcceptInputOf } from "./context/queries";
import type { OmpExtensionApi, OmpSessionContext } from "../internal/native";

/** The per-delivery references one command invocation resolves before the command runs. */
export interface ControlContext {
	/** Records the delivery's context and hands it back. */
	readonly record: (ctx: OmpSessionContext) => OmpSessionContext;
	readonly owner: (ctx: OmpSessionContext) => OwnerReference;
	readonly persist: (values: StateValues) => void;
	readonly feedback: (ctx: OmpSessionContext) => FeedbackTransport;
	readonly markers: (ctx: OmpSessionContext) => MarkerTransport;
	readonly reportMissingFact: (fact: string) => undefined;
}

/** Registers one bound command on the harness's command surface. */
export function registerControl(
	pi: OmpExtensionApi,
	command: BoundCommand,
	context: ControlContext,
): void {
	pi.registerCommand(command.name, {
		description: command.description,
		handler: (args, ctx) => {
			return command.run({
				args,
				owner: context.owner(context.record(ctx)),
				// Only the owner's own session reaches the write path, so persisting through this
				// binding's API always records the owner's session.
				persist: context.persist,
				hasUI: ctx.hasUI,
				// The arm path's initial fact, asked of the session that is running the command
				// rather than carried by an event that may never have happened.
				canAcceptInput: () => canAcceptInputOf(ctx, context.reportMissingFact),
				// The session's own current model, read here as a fact rather than derived from the
				// last request: a context reporting no model answers nothing.
				provider: ctx.model?.provider,
				feedback: context.feedback(ctx),
				markers: context.markers(ctx),
			});
		},
	});
}
