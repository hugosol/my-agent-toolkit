/**
 * OMP run initiation: the native `before_agent_start` hook, mapped to the framework's prompt
 * contribution delivery.
 *
 * The framework fixes a contribution's visibility, position and attribution; this adapter only
 * writes them into the native payload the loader commits. A handler waiting for a one-time
 * initialization returns a promise, and the harness awaits this hook before issuing the model
 * request, so the promise is handed back rather than settled here.
 */
import type { HarnessPort, MarkerTransport, OwnerReference, PromptContribution } from "../../framework/core/protocol";
import { contributionIdentitiesOf } from "./session/facts";
import type { OmpExtensionApi, OmpRunInitiationResult, OmpSessionContext } from "./native-types";

/** The per-delivery references one run initiation resolves before the handler runs. */
export interface RunInitiationContext {
	/** Records the delivery's context and hands it back. */
	readonly record: (ctx: OmpSessionContext) => OmpSessionContext;
	readonly owner: (ctx: OmpSessionContext) => OwnerReference;
	readonly markers: (ctx: OmpSessionContext) => MarkerTransport;
}

/** Subscribes the native run-initiation hook once for this binding. */
export function observeRunInitiation(
	pi: OmpExtensionApi,
	handler: Parameters<HarnessPort["onRunInitiation"]>[0],
	context: RunInitiationContext,
): void {
	pi.on("before_agent_start", (_event, ctx) => {
		const recorded = context.record(ctx);
		const contribution = handler({
			owner: context.owner(recorded),
			contributionIdentities: contributionIdentitiesOf(ctx),
			markers: context.markers(ctx),
		});
		const commit = (planned: PromptContribution | undefined): OmpRunInitiationResult | undefined =>
			planned === undefined
				? undefined
				: {
						message: {
							customType: planned.identity,
							content: planned.content,
							display: planned.display,
							attribution: planned.attribution,
						},
					};
		return contribution instanceof Promise ? contribution.then(commit) : commit(contribution);
	});
}
