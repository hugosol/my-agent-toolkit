/**
 * The semantics a binding's behavior rests on: the framework's own, and the ones an extension's
 * assembly declares its extension depends on.
 *
 * This is *contract metadata*, and it is the whole of what these types are. A supported harness
 * scope is independently verified for every semantic a binding requires — see
 * [harness-support.md § Independent compatibility verification](../docs/harness-support.md#independent-compatibility-verification)
 * — and a verification run reports its coverage in this vocabulary. Normal startup consults none
 * of it: it checks no harness version membership and judges no native capability surface, so a
 * declaration here neither refuses, downgrades nor falls back at binding. A harness that cannot
 * honor a semantic is a finding of the verification, not a startup verdict.
 */
export type RequiredSemantic = "history-preservation" | "session-lifecycle-events" | "round-lifecycle-events";

/**
 * The semantics required of every binding, whatever its assembly declares.
 *
 * `history-preservation` is the framework's own invariant: it appends new material through the
 * harness's own recording path and rewrites no existing conversation entry — nothing in it
 * rewrites a conversation — so it is required of every binding and no assembly declares it: it is
 * not a member of {@link DeclarableRequiredSemantic}.
 */
export const FRAMEWORK_REQUIRED_SEMANTICS = ["history-preservation"] as const satisfies readonly RequiredSemantic[];

/**
 * A semantic an extension's assembly may declare its extension depends on: the members of
 * {@link RequiredSemantic} beyond the ones every binding already requires, and the type of
 * `ExtensionAssembly.requiredSemantics`.
 *
 * A declaration states what the supported scope must be verified for. It is the extension's own
 * statement of its dependencies, so a harness that cannot honor one is a fact the verification
 * reports rather than a contract the framework silently half-serves.
 */
export type DeclarableRequiredSemantic = Exclude<RequiredSemantic, (typeof FRAMEWORK_REQUIRED_SEMANTICS)[number]>;
