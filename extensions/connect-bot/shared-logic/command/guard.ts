/**
 * The one session/UI gate `/connect-bot` runs behind.
 *
 * Both decisions are read from facts the delivery carries, never from a native field: the
 * owner scope the framework resolved for this session, and the faithful `hasUI` fact. A
 * subagent is refused silently — it registers nothing, reports nothing and reaches no
 * transport — and a session without a UI is refused for that reason alone.
 *
 * This module decides *whether* an invocation may act, not what the operator is told about a
 * refusal: the wording of both refusals, and the fact that one of them has none, belongs to the
 * one feedback table (`./feedback`). What the gate hands back is the reason, not a message, so a
 * caller cannot come to be the home of a text and no text can drift between the two.
 *
 * The framework's own owner scope already keeps a subagent's delivery from reaching an
 * extension handler at all; restating the rule here is what makes the gate this command's own
 * decision rather than an assumption about the binding.
 */
import type { OwnerReference } from "../../../../framework/core/protocol";

/** What the gate concluded for one invocation. */
export type CommandGate =
	/** Allowed, and this is the owner the command acts on. */
	| { readonly allowed: true; readonly ownerKey: string }
	/** A subagent never registers on the panel; the refusal is deliberately silent. */
	| { readonly allowed: false; readonly reason: "subagent" }
	/** No UI at all: refused for that reason, with no state change and no request. */
	| { readonly allowed: false; readonly reason: "no-ui" };

/** The facts the gate decides from, as a command delivery carries them. */
export interface CommandGateInput {
	readonly owner: OwnerReference;
	readonly hasUI: boolean;
}

/** Subagents and no-UI modes are refused before anything else happens. */
export function commandGate(input: CommandGateInput): CommandGate {
	if (input.owner.kind !== "owner") return { allowed: false, reason: "subagent" };
	if (!input.hasUI) return { allowed: false, reason: "no-ui" };
	return { allowed: true, ownerKey: input.owner.key };
}
