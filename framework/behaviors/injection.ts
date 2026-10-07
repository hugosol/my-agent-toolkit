/**
 * The injected-prompt contribution behavior: which slot, if any, one agent-run
 * initiation contributes.
 *
 * The decision is a pure function of the owner's current State and the current branch's
 * contents, and it writes nothing. A slot's rule decides whether it wants this run:
 * `first-enabled-run` wants it while the branch does not yet carry that slot's identity
 * — the identity's presence *is* the slot's progress, so a re-entered delivery, a
 * cancellation before commit and a tree navigation all resolve from the same two facts
 * without a stored flag — and `every-enabled-run` wants every enabled run. At most one
 * slot contributes per run: a wanting one-shot slot is chosen over any repeating one, so
 * a slot that contributes once is never starved by a slot that repeats, and among slots
 * of the same rule declaration order decides.
 *
 * This module is agent-runtime-independent: it reads State through the read view and the
 * branch facts an adapter resolved, and names no native API.
 */
import { BOUND_PROMPT_STRATEGIES, type ExtensionDefinition } from "../core/definition";
import type { PromptContribution, RunDelivery } from "../core/protocol";
import type { StateStore } from "../core/state";
import { stateValueFor } from "./state-scope";

/**
 * The one contribution this run initiation should carry, or none.
 *
 * A run that reads no active value contributes nothing. Which value a delivery reads is
 * the per-field inheritance axis ([`stateValueFor`](./state-scope.ts)): the owner's own
 * session reads the owner's cell, and a subagent reads it only when the field declares
 * `follow`. The branch supplies the progress either way — a pending one-shot slot first,
 * otherwise the first declared repeating slot — and nothing is stored for it.
 */
export function planContribution(
	definition: ExtensionDefinition,
	state: StateStore,
	run: RunDelivery,
): PromptContribution | undefined {
	if (!stateValueFor(definition, state, run.owner)) return undefined;

	const contributed = new Set(run.contributionIdentities);
	const slots = (definition.prompts ?? []).filter(slot => BOUND_PROMPT_STRATEGIES.includes(slot.strategy));

	const pending = slots.find(
		slot => slot.strategy === "first-enabled-run" && !contributed.has(`${definition.id}:${slot.tag}`),
	);
	const chosen = pending ?? slots.find(slot => slot.strategy === "every-enabled-run");
	if (chosen === undefined) return undefined;

	return {
		identity: `${definition.id}:${chosen.tag}`,
		content: chosen.content,
		display: false,
		attribution: "agent",
	};
}
