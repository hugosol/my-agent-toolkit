/**
 * The semantic round event dispatch: what runs on one round edge, and what happens when an
 * extension handler throws.
 *
 * The framework has no behavior of its own to apply here, and that is the design rather than an
 * omission. A round edge is a subscription and not a reconciliation trigger: the agent's work
 * state is a three-valued fact of the extension (contract P6), the framework's State holds a
 * declared activation value and nothing else, and no marker or cell follows a round. So a
 * delivery is dispatched to the handler the assembly injected for that edge — the adapter has
 * already suppressed every occurrence that is not a transition, so whether the edge happened is
 * nothing this module decides — and a round kind with no subscriber, or a round of a session
 * that is not its own owner, is a delivery with nothing to do.
 *
 * A handler's failure is its own. It is reported on the adapter's diagnostic channel — a
 * channel outside model context — and it changes neither the edge the delivery described nor
 * whether another subscriber runs: the round still moved the way the event said, and every
 * other extension bound to this assembly still receives its own delivery.
 *
 * The subscription is owner-scoped, as the session axis is: an edge whose session is not its own
 * owner belongs to the owner it follows, so it reaches no handler here. The adapter still
 * synthesizes and reports it — the framework's own view of a session's rounds is not an
 * extension's — and nothing about that delivery is left half-applied, because a round has no
 * framework behavior to apply in the first place.
 *
 * This module is harness-independent: it reads and writes no State and names no native
 * API.
 */
import type { ExtensionDefinition } from "../core/definition";
import type { RoundDelivery, SemanticEventHandlers } from "../core/protocol";

/**
 * Applies one semantic round edge: the subscribed handler, or nothing when none arrived.
 *
 * `handlers` is what the extension's assembly injected; only the two round kinds are read here,
 * so the same map an assembly fills for the session axis can be handed in unchanged.
 */
export function dispatchRoundEvent(
	definition: ExtensionDefinition,
	handlers: SemanticEventHandlers,
	round: RoundDelivery,
	reportFailure: (message: string) => void,
): void {
	// Owner scope gates the subscription, as it does the session axis: a round of a session that
	// is not its own owner belongs to the owner that session follows, and driving the owner's
	// effect body from it would report another session's work as the owner's.
	if (round.owner.kind !== "owner") return;

	const handler = handlers[round.event.kind];
	if (handler === undefined) return;

	try {
		handler(round);
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		reportFailure(`${definition.id}: ${round.event.kind} handler failed: ${detail}`);
	}
}
