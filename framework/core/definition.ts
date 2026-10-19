/**
 * The host-independent extensions the framework resolves from a definition: the defaults, the
 * bound sets and the small resolution helpers.
 *
 * The definition and its command declarations are canonical in the capability interfaces under
 * `framework/interface`; this module refers to them and keeps only the rules the framework
 * applies internally. There is no builder, no plugin bus and no raw handler, and nothing here
 * names a harness.
 */
import type { ControlKind } from "../interface/command";
import type { ConfigFieldType, ExtensionDefinition } from "../interface/details/definition";
import type { PromptStrategy } from "../interface/prompt";
import type { StateInheritance, StatePersistence } from "../interface/state";

/** The State persistence a field declares when it declares none. */
export const DEFAULT_STATE_PERSISTENCE: StatePersistence = "session-entry";

/** The State inheritance a field declares when it declares none. */
export const DEFAULT_STATE_INHERITANCE: StateInheritance = "none";

/**
 * The State persistence choices this framework version honors.
 *
 * The union is closed on purpose, exactly as the control kinds are: a definition can also
 * arrive from plain JavaScript, so binding refuses an unbound value instead of silently
 * reading it as one of the two it implements.
 */
export const BOUND_STATE_PERSISTENCES: readonly StatePersistence[] = ["session-entry", "memory"];

/**
 * The State inheritance choices this framework version honors.
 *
 * Binding refuses an unbound value rather than reading it as `none`, so a declaration this
 * version cannot honor never looks like an honored one.
 */
export const BOUND_STATE_INHERITANCES: readonly StateInheritance[] = ["follow", "none"];

/** The activation field an extension that declares no State of its own uses. */
export const DEFAULT_ACTIVATION_FIELD = "enabled";

/**
 * The control kinds this framework version can honor.
 *
 * A definition may only reach harness with a declarable kind, but a definition can
 * also arrive from plain JavaScript, so binding refuses a kind outside this list
 * instead of silently dropping the declaration. `directed` carries one requirement
 * beyond the declaration itself — an injected action for the command — and binding
 * refuses the declaration when the assembly injected none. `actions` carries the same
 * requirement for every action it declares: binding refuses a declaration whose table
 * has an entry with no injected implementation, so no help line can name an action that
 * would do nothing.
 */
export const BOUND_CONTROL_KINDS: readonly ControlKind[] = ["toggle", "directed", "actions"];

/**
 * The injected-prompt strategies this framework version honors.
 *
 * Both declared strategies are bound: `first-enabled-run` contributes while the current
 * branch does not yet carry the slot's identity, and `every-enabled-run` contributes on
 * each enabled run. The union stays closed — a strategy this list does not carry
 * contributes nothing rather than being bound to a different rule.
 */
export const BOUND_PROMPT_STRATEGIES: readonly PromptStrategy[] = ["first-enabled-run", "every-enabled-run"];

/** The configuration value types this framework version validates. */
export const BOUND_CONFIG_FIELD_TYPES: readonly ConfigFieldType[] = [
	"string",
	"non-empty-string",
	"number",
	"boolean",
	"milliseconds",
];

/** The State field the framework owns for this extension (and its persistence key when persisted). */
export function activationField(definition: ExtensionDefinition): string {
	return definition.state?.field ?? DEFAULT_ACTIVATION_FIELD;
}

/** How this extension's declared State value is persisted; `session-entry` unless declared otherwise. */
export function statePersistence(definition: ExtensionDefinition): StatePersistence {
	return definition.state?.persistence ?? DEFAULT_STATE_PERSISTENCE;
}

/** How a subagent reads this extension's declared State value; `none` unless declared otherwise. */
export function stateInheritance(definition: ExtensionDefinition): StateInheritance {
	return definition.state?.inheritance ?? DEFAULT_STATE_INHERITANCE;
}
