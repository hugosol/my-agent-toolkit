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
import { isPlainMapping, normalizeCommandArgument } from "./assembly";
import type { ExtensionDefinition } from "../interface/details/definition";

/** The configuration rules the framework refuses to resolve implicitly. */
export type ConfigurationViolationKind =
	/** Two commands share one name. */
	| "duplicate-command"
	/** Two commands declare themselves writers of one State field. */
	| "duplicate-state-writer"
	/** One injected-prompt slot (`tag`) carries more than one contribution rule. */
	| "duplicate-slot-rule"
	/** An `actions` command's action table is not one the framework can route. */
	| "actions-table"
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

	const duplicatedWriter = firstRepeated(
		commands.flatMap(command => (command.type === "actions" ? [] : [command.state])),
	);
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

	// An `actions` command's table is the routing vocabulary itself, so a name the framework
	// could not match — one that normalizes to nothing, or one that collides with another after
	// the normalization routing applies — is refused rather than left as an unreachable line of
	// help or as two names one argument would select.
	for (const command of commands) {
		if (command.type !== "actions") continue;
		const table: unknown = command.actions;
		if (!isPlainMapping(table)) {
			violations.push({
				kind: "actions-table",
				detail: `command "${command.name}" declares an actions table that is not a mapping of action names`,
			});
			continue;
		}
		const names = Object.keys(table);
		if (names.length === 0) {
			violations.push({
				kind: "actions-table",
				detail: `command "${command.name}" declares no action, so it could offer nothing to invoke`,
			});
			continue;
		}
		const namesThatNormalizeToNothing = names.filter(name => normalizeCommandArgument(name).length === 0);
		if (namesThatNormalizeToNothing.length > 0) {
			violations.push({
				kind: "actions-table",
				detail: `command "${command.name}" declares the action name "${namesThatNormalizeToNothing[0] ?? ""}", which holds no characters the framework can match`,
			});
			continue;
		}
		const normalized = names.map(name => normalizeCommandArgument(name));
		const collision = firstRepeated(normalized);
		if (collision !== undefined) {
			const originals = names.filter(name => normalizeCommandArgument(name) === collision);
			violations.push({
				kind: "actions-table",
				detail: `command "${command.name}" declares the actions ${originals.map(name => `"${name}"`).join(" and ")}, which one argument cannot tell apart`,
			});
		}
	}

	return violations;
}
