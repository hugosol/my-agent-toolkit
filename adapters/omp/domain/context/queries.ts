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
 * Context observations themselves live in `events.ts`: they are native subscriptions, and their
 * collection points are native facts rather than reads.
 */
import type { OmpSessionContext } from "../../internal/native";

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
