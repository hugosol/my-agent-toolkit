/**
 * The definition entry of the semantic extension framework.
 *
 * This is the whole authoring surface: declare an extension with
 * {@link defineExtension} and the exported configuration types, then hand the
 * definition to a harness adapter (`framework/adapters/omp.ts`) for assembly.
 * No harness type appears here or in anything the definition can name.
 *
 * The configuration one extension declares is part of its definition, so its types are
 * here; the configuration API the extension's shared logic reads through — `getConfig`,
 * `readConfig` and the two error classes — lives in `framework/core/config.ts`, which is
 * host-independent exactly as this entry is.
 */
export {
	type CommandDeclaration,
	type CommandDirectedDeclaration,
	type CommandToggleDeclaration,
	type ConfigFieldType,
	type ControlKind,
	type ExtensionConfigDeclaration,
	type ExtensionDefinition,
	type MarkerDeclaration,
	type PromptDeclaration,
	type PromptStrategy,
	type StateDeclaration,
	type StateInheritance,
	type StatePersistence,
	defineExtension,
} from "./core/definition";
