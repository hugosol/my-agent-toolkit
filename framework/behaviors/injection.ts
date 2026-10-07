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
import { BOUND_PROMPT_STRATEGIES, activationField, type ExtensionDefinition } from "../core/definition";
import type { PromptContribution, RunDelivery } from "../core/protocol";
import type { StateStore } from "../core/state";

/**
 * The one contribution this run initiation should carry, or none.
 *
 * A run whose session resolved no owner contributes nothing: there is no activation to
 * follow. Otherwise the owner's current value decides — a subagent reads its owner's
 * value here exactly as the owner's own session does, and its own branch supplies the
 * progress — and an enabled owner contributes the single slot its rules call for: a
 * pending one-shot slot first, otherwise the first declared repeating slot.
 */
export function planContribution(
	definition: ExtensionDefinition,
	state: StateStore,
	run: RunDelivery,
): PromptContribution | undefined {
	if (run.owner.kind === "unresolved") return undefined;
	if (!state.view(run.owner.key).read(activationField(definition))) return undefined;

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
