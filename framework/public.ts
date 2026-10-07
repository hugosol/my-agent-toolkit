/**
 * The definition entry of the semantic extension framework.
 *
 * This is the whole authoring surface: declare an extension with
 * {@link defineExtension} and the exported configuration types, then hand the
 * definition to an agent-runtime adapter (`framework/adapters/omp.ts`) for assembly.
 * No agent-runtime type appears here or in anything the definition can name.
 */
export {
	type CommandDeclaration,
	type CommandToggleDeclaration,
	type ControlKind,
	type ExtensionDefinition,
	type MarkerDeclaration,
	type PromptDeclaration,
	type PromptStrategy,
	type StateDeclaration,
	defineExtension,
} from "./core/definition";
