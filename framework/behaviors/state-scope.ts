/**
 * The owner scope of a declared State value: which cell one delivery reads, and which
 * value stands in when there is none to read.
 *
 * State is owner-scoped, and how far a delivery's scope reaches is the per-field
 * inheritance axis: a session that is itself the owner reads its own cell; a subagent
 * session reads its owner's cell only when the field declares `follow`, and otherwise
 * reads the field's declared default; a delivery that resolved no owner reads the default
 * too, because there is no cell it could belong to. Keeping that rule in one place means
 * every framework-managed reader — injected-prompt planning and the marker area today —
 * agrees on what a subagent's value is instead of each deciding for itself.
 *
 * This module is agent-runtime-independent: it reads State through the read view and names
 * no native API.
 */
import { activationField, stateInheritance, type ExtensionDefinition } from "../core/definition";
import type { OwnerReference } from "../core/protocol";
import { DEFAULT_STATE_VALUE, type StateStore, type StateValue } from "../core/state";

/**
 * The value one delivery reads for the extension's declared field.
 *
 * The read is the same cell every framework-managed reader uses; only whether the delivery
 * reaches it is decided here, so a subagent of a field that does not declare `follow`
 * reads the declared default rather than a copy of anything.
 */
export function stateValueFor(
	definition: ExtensionDefinition,
	state: StateStore,
	owner: OwnerReference,
): StateValue {
	if (owner.kind === "unresolved") return DEFAULT_STATE_VALUE;
	if (owner.kind === "inherited" && stateInheritance(definition) !== "follow") return DEFAULT_STATE_VALUE;
	return state.view(owner.key).read(activationField(definition));
}
