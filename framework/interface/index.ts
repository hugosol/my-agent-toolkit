/**
 * The root authoring entry of the semantic extension framework.
 *
 * An extension declares itself here and builds its implementation in the shape this entry
 * describes. It is the one path for the authoring contract, organised in two groups:
 *
 * - the *definition* — plain data: identity, State, commands, prompts, marker, configuration and
 *   subagent requirements — owned by `details/definition.ts`;
 * - the *implementation* — the factory a harness assembly supplies, the context it receives, what
 *   it builds, the one-time initialization and cleanup, and the generic assembly information —
 *   owned by `details/implementation.ts`.
 *
 * This entry does not aggregate the capability interfaces: State, Session, Prompt, Marker,
 * Feedback, Host facts, Subagent and Command each own their declarations and are imported from
 * their own entries. It also names no harness; an adapter consumes the assembly types unchanged.
 */
import type { ExtensionDefinition } from "./details/definition";

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

// The definition contract: what an extension declares, and the configuration it requires.
export type {
	ConfigFieldType,
	ExtensionConfigDeclaration,
	ExtensionDefinition,
} from "./details/definition";

// The implementation contract: the factory, its context, what it builds, and its lifecycle.
export type {
	DeclarableRequiredSemantic,
	ExtensionAssembly,
	ExtensionFactory,
	ExtensionImplementation,
	ImplementationContext,
	InitializationDelivery,
} from "./details/implementation";
