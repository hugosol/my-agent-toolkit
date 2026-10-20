/**
 * Independent behavior-verification vocabulary. Extension integration dependencies are derived
 * from source and the shared planner, not manually maintained assembly requirement arrays.
 * This vocabulary never changes startup behavior or promotes a harness support claim.
 */
export type RequiredSemantic = "history-preservation" | "session-lifecycle-events" | "round-lifecycle-events";

/** The framework's append-only invariant applies to every binding. */
export const FRAMEWORK_REQUIRED_SEMANTICS = ["history-preservation"] as const satisfies readonly RequiredSemantic[];
