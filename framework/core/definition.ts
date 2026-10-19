/**
 * The host-independent extension definition model.
 *
 * A definition is plain data: an extension declares its identity, its State, its
 * control commands, its injected-prompt slots and its status marker, and the
 * framework supplies the behavior behind each declaration. There is no builder, no
 * plugin bus and no raw handler — everything an extension asks the framework to do
 * is expressed here, and nothing in this module names a harness.
 */
import type { SubagentCapability } from "./integration";

/**
 * Whether a declared State value outlives the memory of the session that wrote it.
 *
 * `session-entry` — the value is recorded in the owner's persistence medium, and a
 * session boundary seeds it from that session's target branch. `memory` — the value is
 * never recorded and never seeded: it exists only as the owner cell's current value, so
 * a boundary that replaces the owner drops it to the declared default while navigation
 * that keeps the same owner identity keeps it. `memory` is the choice for a value that
 * declares a live external effect, because a restored value would not prove that effect
 * is still running.
 */
export type StatePersistence = "session-entry" | "memory";

/**
 * How a subagent session relates to its owner's declared State value.
 *
 * `follow` — the subagent reads the owner's current value live. `none` — the subagent
 * reads the field's declared default, so the value an owner holds never reaches a
 * subagent on its own. Values that are not this declared field, such as each session's
 * own injected-prompt progress, stay per-session whatever this axis says.
 */
export type StateInheritance = "follow" | "none";

/**
 * The State an extension declares.
 *
 * v1 owns exactly one boolean activation field per extension, and the field name is also
 * the persistence key for its value whenever the field is persisted. Omitting `state`
 * selects the default field {@link DEFAULT_ACTIVATION_FIELD}, the default persistence
 * {@link DEFAULT_STATE_PERSISTENCE} and the default inheritance
 * {@link DEFAULT_STATE_INHERITANCE}.
 *
 * The three declared axes are independent, and every framework behavior branches on the
 * axis it belongs to: the control kind decides how a command drives the field, the
 * persistence decides whether the value is recorded and seeded, and the inheritance
 * decides whether a subagent reads the owner's value or the declared default.
 */
export interface StateDeclaration {
	/** The activation field name; defaults to `enabled`. */
	readonly field?: string;
	/** How the value is persisted; defaults to `session-entry`. */
	readonly persistence?: StatePersistence;
	/** Whether a subagent reads the owner's current value; defaults to `none`. */
	readonly inheritance?: StateInheritance;
}

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

/** A command that alternates a State field between its two values. */
export interface CommandToggleDeclaration {
	/** Discriminant of the closed control-kind union. */
	readonly type: "toggle";
	/** Command name, without the leading slash. */
	readonly name: string;
	/** The State field this command transitions. */
	readonly state: string;
	/** Human-readable description, shown wherever the harness lists commands. */
	readonly description?: string;
}

/**
 * A command that names its target value explicitly and repeats its side effect on
 * every execution.
 *
 * The argument names the target: an empty argument names `on` and `off` names `off`,
 * which the framework normalizes into a directive. The declaration is plain data like
 * every other field — the action the command runs is injected by a harness
 * assembly at binding, and the framework refuses a directed declaration whose action
 * was not injected rather than registering a command that does nothing.
 *
 * Unlike a toggle, a directed command is never deduplicated, short-circuited or
 * serialized: every invocation runs the action again, and both idempotence and any
 * operator-facing text belong to the extension. The action also owns the write: it
 * records the field's new value through the declared-value seam its delivery carries,
 * so the framework derives no value from the directive and a failed action leaves the
 * value alone. An argument the framework does not recognize is not a directive at all,
 * so it runs no action and records no value.
 */
export interface CommandDirectedDeclaration {
	/** Discriminant of the closed control-kind union. */
	readonly type: "directed";
	/** Command name, without the leading slash. */
	readonly name: string;
	/** The State field this command's implementation writes through its delivery's seam. */
	readonly state: string;
	/** Human-readable description, shown wherever the harness lists commands. */
	readonly description?: string;
}

/**
 * A command whose argument names one action out of a declared table.
 *
 * The declaration is plain data like every other field: it names the command and lists the
 * actions it offers, each with the words the operator reads when the command is asked for help.
 * The action implementations arrive at binding, injected by the extension's own assembly, so the
 * declaration carries no handler and this module names no harness.
 *
 * The framework owns the whole argument surface: the argument is trimmed, lowercased and matched
 * whole against the declared action names, an empty argument prints the help derived from this
 * table, and any other text prints the same help at `error` severity and runs nothing. There is
 * no abbreviation, no fuzzy match, no extra argument and no default action — a command whose
 * argument is not exactly one of these names never reaches the extension's shared logic — and
 * the unrecognized-argument path of a directed command is deliberately not involved.
 *
 * A declared action name is matched after the same normalization the argument receives, so two
 * names that differ only in case or surrounding whitespace are one action, and a declaration that
 * lists the same normalized name twice, or a name that normalizes to nothing, is refused rather
 * than silently shadowed.
 */
export interface CommandActionsDeclaration {
	/** Discriminant of the closed control-kind union. */
	readonly type: "actions";
	/** Command name, without the leading slash. */
	readonly name: string;
	/** Human-readable description, shown wherever the harness lists commands and in the help. */
	readonly description?: string;
	/** The actions this command offers: declared action name to the words the help shows for it. */
	readonly actions: Readonly<Record<string, string>>;
}

/**
 * Every control kind the framework binds.
 *
 * The union is closed on purpose: it carries the kinds this version implements, and a
 * future control kind is an additive member here plus the behavior that honors it —
 * never a raw native handler handed to an extension.
 */
export type CommandDeclaration =
	| CommandToggleDeclaration
	| CommandDirectedDeclaration
	| CommandActionsDeclaration;

/** The declared control kind of a command. */
export type ControlKind = CommandDeclaration["type"];

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

/**
 * The value type one declared configuration key must match.
 *
 * The union is closed on purpose, like every other declaration union: a type this version
 * does not implement is refused at binding rather than read as a looser one. A
 * `non-empty-string` is the framework's own refinement of `string` — an extension for
 * which the empty string is not a value declares it and writes no check of its own.
 *
 * A `milliseconds` is the framework's own refinement of `number` for a wait budget: a whole
 * number of milliseconds this harness's timer schedules — from 1 through 2^31-1, the longest
 * delay it waits for before clamping a value to 1ms. An extension that configures a timeout
 * declares it and writes no check of its own, and a value outside the range refuses the
 * binding rather than letting the extension run on a budget it would not be given.
 */
export type ConfigFieldType = "string" | "non-empty-string" | "number" | "boolean" | "milliseconds";

/** The configuration value types this framework version validates. */
export const BOUND_CONFIG_FIELD_TYPES: readonly ConfigFieldType[] = [
	"string",
	"non-empty-string",
	"number",
	"boolean",
	"milliseconds",
];

/**
 * The configuration one extension requires of its own `config.yaml`.
 *
 * The declaration is plain data like every other field: it names the file (or leaves it to
 * the convention `extensions/<definition.id>/config.yaml`) and the keys that file must
 * carry, with the type each must match. The framework reads and validates the file at
 * binding, before anything is registered, and the file is the only source of the values —
 * no default and no fallback lives in code, so a file that is missing or illegal refuses
 * the extension instead of letting it run on a value the framework invented.
 *
 * The file belongs to the machine: there is no environment or command-line override,
 * unknown keys are ignored, and a changed value takes effect with the next process,
 * because a validated configuration is read once per extension per process.
 */
export interface ExtensionConfigDeclaration {
	/**
	 * The file's path — relative to the configuration base directory the assembly supplies, and
	 * the convention above when omitted. An absolute path is used as declared; with no base
	 * directory a relative path is this process's own.
	 */
	readonly path?: string;
	/** Every key the file must declare, with the type it must match; unknown keys are ignored. */
	readonly fields: Readonly<Record<string, ConfigFieldType>>;
}

/** A complete extension declaration. */
export interface ExtensionDefinition {
	/** Stable extension identity, also the prefix of every contribution identity. */
	readonly id: string;
	/** Display name used for the extension's label and its notifications. */
	readonly displayName: string;
	/**
	 * Subagent semantics required for this extension's complete integration. Execution modes
	 * are the harness author's declaration, not this extension's choice. Only the independent
	 * integration completeness check reads this metadata; startup and feature behavior do not.
	 */
	readonly subagentRequirements?: readonly SubagentCapability[];
	readonly state?: StateDeclaration;
	readonly commands?: readonly CommandDeclaration[];
	readonly prompts?: readonly PromptDeclaration[];
	readonly marker?: MarkerDeclaration;
	/** The configuration this extension reads from its own file; omitted means it reads none. */
	readonly config?: ExtensionConfigDeclaration;
}

/**
 * Declares an extension: the definition entry of the public interface.
 *
 * The argument is plain data and the returned value is that same data, typed; nothing
 * is validated or copied here. Declared conflicts are reported when an adapter binds
 * the definition to a running harness, not at declaration time.
 */
export function defineExtension(definition: ExtensionDefinition): ExtensionDefinition {
	return definition;
}

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
