/**
 * The framework's deterministic configuration rules.
 *
 * A definition that breaks one of them is not bound at all: the framework reports the
 * failure on a non-model channel and abandons the extension rather than silently choosing
 * between competing declarations or inventing a value. The rules cover both kinds of
 * configuration the definition carries — its own declarations, and the file one of them
 * names — and reporting is per failure class: one explicit startup error tells the
 * operator what to fix, and the whole definition is rejected anyway.
 */
import type { ExtensionDefinition } from "./definition";

/** The configuration rules the framework refuses to resolve implicitly. */
export type ConfigurationViolationKind =
	/** Two commands share one name. */
	| "duplicate-command"
	/** Two commands declare themselves writers of one State field. */
	| "duplicate-state-writer"
	/** One injected-prompt slot (`tag`) carries more than one contribution rule. */
	| "duplicate-slot-rule"
	/** The extension's declared configuration — its declaration or its file — is illegal. */
	| "config";

export interface ConfigurationViolation {
	readonly kind: ConfigurationViolationKind;
	readonly detail: string;
}

/** The first value that appears more than once, in declaration order. */
function firstRepeated(values: readonly string[]): string | undefined {
	const seen = new Set<string>();
	for (const value of values) {
		if (seen.has(value)) return value;
		seen.add(value);
	}
	return undefined;
}

/**
 * Finds the declared conflicts of a definition, at most one per conflict class.
 *
 * Command names, State writers and slot identities are compared literally: the
 * framework has no configuration precedence, so equal declarations are always a
 * conflict even when they would happen to behave alike.
 */
export function findConfigurationViolations(definition: ExtensionDefinition): ConfigurationViolation[] {
	const violations: ConfigurationViolation[] = [];
	const commands = definition.commands ?? [];

	const duplicatedCommand = firstRepeated(commands.map(command => command.name));
	if (duplicatedCommand !== undefined) {
		violations.push({
			kind: "duplicate-command",
			detail: `commands declares the command name "${duplicatedCommand}" more than once`,
		});
	}

	const duplicatedWriter = firstRepeated(commands.map(command => command.state));
	if (duplicatedWriter !== undefined) {
		violations.push({
			kind: "duplicate-state-writer",
			detail: `commands declares a second writer for State field "${duplicatedWriter}"`,
		});
	}

	const duplicatedSlot = firstRepeated((definition.prompts ?? []).map(slot => slot.tag));
	if (duplicatedSlot !== undefined) {
		violations.push({
			kind: "duplicate-slot-rule",
			detail: `prompts declares more than one rule for the injection slot "${duplicatedSlot}"`,
		});
	}

	return violations;
}
