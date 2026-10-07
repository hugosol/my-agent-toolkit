/**
 * The host-independent extension definition model.
 *
 * A definition is plain data: an extension declares its identity, its State, its
 * control commands, its injected-prompt slots and its status marker, and the
 * framework supplies the behavior behind each declaration. There is no builder, no
 * plugin bus and no raw handler — everything an extension asks the framework to do
 * is expressed here, and nothing in this module names an agent runtime.
 */

/**
 * The State an extension declares.
 *
 * v1 owns exactly one boolean activation field per extension, and the field name is
 * also the persistence key for its value. Omitting `state` selects the default field
 * {@link DEFAULT_ACTIVATION_FIELD}.
 */
export interface StateDeclaration {
	/** The activation field name; defaults to `enabled`. */
	readonly field?: string;
}

/** The activation field an extension that declares no State of its own uses. */
export const DEFAULT_ACTIVATION_FIELD = "enabled";

/** A command that alternates a State field between its two values. */
export interface CommandToggleDeclaration {
	/** Discriminant of the closed control-kind union. */
	readonly type: "toggle";
	/** Command name, without the leading slash. */
	readonly name: string;
	/** The State field this command transitions. */
	readonly state: string;
	/** Human-readable description, shown wherever the agent runtime lists commands. */
	readonly description?: string;
}

/**
 * Every control kind the framework binds.
 *
 * The union is closed on purpose: v1 implements only `toggle`, and a future control
 * kind is an additive member here plus the behavior that honors it — never a raw
 * native handler handed to an extension.
 */
export type CommandDeclaration = CommandToggleDeclaration;

/** The declared control kind of a command. */
export type ControlKind = CommandDeclaration["type"];

/**
 * The control kinds this framework version can honor.
 *
 * A definition may only reach runtime with a declarable kind, but a definition can
 * also arrive from plain JavaScript, so binding refuses a kind outside this list
 * instead of silently dropping the declaration.
 */
export const BOUND_CONTROL_KINDS: readonly ControlKind[] = ["toggle"];

/**
 * When an injected-prompt slot contributes. One rule per slot; a second rule for the
 * same slot is a configuration error, not a precedence question.
 */
export type PromptStrategy = "first-enabled-run" | "every-enabled-run";

/**
 * One injected-prompt slot: its identity (`tag`), its activation rule (`strategy`)
 * and its text. The slot's framework identity is `${definition.id}:${tag}`; visibility,
 * delivery position and retention are framework-owned and not parameters.
 */
export interface PromptDeclaration {
	readonly tag: string;
	readonly strategy: PromptStrategy;
	readonly content: string;
}

/**
 * The injected-prompt strategies this framework version honors.
 *
 * Both declared strategies are bound: `first-enabled-run` contributes while the current
 * branch does not yet carry the slot's identity, and `every-enabled-run` contributes on
 * each enabled run. The union stays closed — a strategy this list does not carry
 * contributes nothing rather than being bound to a different rule.
 */
export const BOUND_PROMPT_STRATEGIES: readonly PromptStrategy[] = ["first-enabled-run", "every-enabled-run"];

/** The extension's status-marker text; placement, ordering and lifecycle are framework-owned. */
export interface MarkerDeclaration {
	readonly text: string;
}

/** A complete extension declaration. */
export interface ExtensionDefinition {
	/** Stable extension identity, also the prefix of every contribution identity. */
	readonly id: string;
	/** Display name used for the extension's label and its notifications. */
	readonly displayName: string;
	readonly state?: StateDeclaration;
	readonly commands?: readonly CommandDeclaration[];
	readonly prompts?: readonly PromptDeclaration[];
	readonly marker?: MarkerDeclaration;
}

/**
 * Declares an extension: the definition entry of the public interface.
 *
 * The argument is plain data and the returned value is that same data, typed; nothing
 * is validated or copied here. Declared conflicts are reported when an adapter binds
 * the definition to a running agent runtime, not at declaration time.
 */
export function defineExtension(definition: ExtensionDefinition): ExtensionDefinition {
	return definition;
}

/** The State field the framework owns for this extension (and its persistence key). */
export function activationField(definition: ExtensionDefinition): string {
	return definition.state?.field ?? DEFAULT_ACTIVATION_FIELD;
}
