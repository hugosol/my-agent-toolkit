/**
 * OMP context reads: the newest session context a delivery came from, and the idle fact.
 *
 * The harness publishes model catalogs, provider registries, the displayed session and the
 * session's own context usage only through a live context, while the framework asks for some of
 * them after the delivery that carried them has returned. One tracker per binding keeps the
 * newest context each delivery reported and lets every later reading answer from it. The same
 * tracker is where a module that must follow deliveries registers — the viewed-session
 * subscription — so no second notion of "newest" can drift.
 *
 * Context observations live with that tracker here: their native collection points and the
 * latest context all belong to the same extension-context contract.
 */
import type { OwnerReference } from "../../../../../framework/interface/state";
import { defineAdapterDelivery } from "../../../../../framework/runtime/adapter-authoring";
import type { SessionContextObservation } from "../../../../../framework/runtime/port";
import { feedbackTransport } from "./feedback";
import type { OmpExtensionApi, OmpSessionContext } from "./types";
import { sessionFactsOf } from "./session-facts";



/** One binding's newest native context, and the follow-ups every recorded delivery triggers. */
export interface ContextTracker {
	/** The newest context, or `undefined` before this binding's first delivery. */
	latest(): OmpSessionContext | undefined;
	/** Records one delivery's context and hands it back, as the mappings chain off it. */
	record(ctx: OmpSessionContext): OmpSessionContext;
	/** Registers one listener that must see each recorded context. */
	onRecord(listener: (ctx: OmpSessionContext) => void): void;
}

/**
 * Builds one binding's tracker over the context readers this assembly owns.
 *
 * `sinks` are the process-level readings that report a context (the provider facts' price and access
 * sources), each keeping its own newest source; they run before the binding's own follow-ups so a
 * follow-up sees the same recorded context the framework will.
 */
export function createContextTracker(sinks: readonly ((ctx: OmpSessionContext) => void)[]): ContextTracker {
	let newest: OmpSessionContext | undefined;
	const listeners: ((ctx: OmpSessionContext) => void)[] = [];
	return {
		latest: () => newest,
		record: ctx => {
			for (const sink of sinks) sink(ctx);
			newest = ctx;
			for (const listener of [...listeners]) listener(ctx);
			return ctx;
		},
		onRecord: listener => {
			listeners.push(listener);
		},
	};
}

/**
 * Whether the agent can take input now, or `undefined` when this context reports no idle fact.
 *
 * The idle fact exists only on the context the harness builds per delivery, so a surface that
 * reports none is answered with nothing rather than a fabricated value.
 */
export function canAcceptInputOf(
	ctx: OmpSessionContext,
	reportMissingFact: (fact: string) => undefined,
): boolean | undefined {
	if (typeof ctx.isIdle !== "function") return reportMissingFact("idle fact (isIdle)");
	return ctx.isIdle();
}

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
		handler(defineAdapterDelivery("context", {
			session: sessionFactsOf(pi, recorded),
			owner: context.owner(recorded),
			hasUI: recorded.hasUI,
			feedback: feedbackTransport(recorded),
			reading: {
				tokens: usage.tokens,
				...(ctx.model?.provider === undefined ? {} : { provider: ctx.model.provider }),
				...(ctx.model?.id === undefined ? {} : { model: ctx.model.id }),
			},
		}));
	};
	// These are the adapter's own collection points; nothing here decides which of them is a
	// change, so the same reading read twice is reported twice and the framework drops the repeat.
	pi.on("session_start", (_event, ctx) => collect(ctx));
	pi.on("message_end", (_event, ctx) => collect(ctx));
	pi.on("agent_end", (_event, ctx) => collect(ctx));
}
