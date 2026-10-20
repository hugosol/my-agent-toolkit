/**
 * The authoring definition contract: what an extension declares, as plain data.
 *
 * This is a public details file of the root authoring entry, not an internal implementation
 * module. It composes the declarations each capability owns — State, commands, prompts, markers,
 * and configuration — without re-publishing their rules. Integration demands are derived from use. A definition
 * has no builder, no handler and no harness member: the framework connects the behavior behind
 * each declaration when an adapter binds it.
 */
import type { CommandDeclaration } from "../command";
import type { MarkerDeclaration } from "../marker";
import type { PromptDeclaration } from "../prompt";
import type { StateDeclaration } from "../state";

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
	readonly state?: StateDeclaration;
	readonly commands?: readonly CommandDeclaration[];
	readonly prompts?: readonly PromptDeclaration[];
	readonly marker?: MarkerDeclaration;
	/** The configuration this extension reads from its own file; omitted means it reads none. */
	readonly config?: ExtensionConfigDeclaration;
}
