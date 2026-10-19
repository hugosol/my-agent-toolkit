/**
 * The Command capability's declaration group: what an extension declares as plain data.
 *
 * This is a public details file of the Command entry, not an internal implementation module.
 * The framework binds each declaration to the behavior behind its control kind; the declaration
 * itself carries no handler, no native surface and no harness name.
 */

/**
 * A command that alternates a State field between its two values.
 *
 * The framework owns the transition: it reads the owner's current value, writes the other one
 * through the same managed path a handler uses, and publishes feedback. The command runs only in
 * the session that is its own owner; a subagent's session never toggles it.
 */
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
