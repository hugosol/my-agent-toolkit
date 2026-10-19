/**
 * The Prompt capability's canonical extension-facing declarations.
 *
 * An extension declares the text it wants made available to the model and the rule under which
 * a run carries it. The selection rule's progress, the run facts an adapter resolves, the
 * contribution the framework chooses and the slot identities a branch already carries stay
 * internal: a consumer names a slot and a strategy, never a run delivery or a contribution.
 */
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
