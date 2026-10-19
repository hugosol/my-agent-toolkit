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
 *
 * The declarable half is canonical in the authoring implementation contract; this module keeps the
 * complete vocabulary and the framework's own invariant. `history-preservation` is the framework's
 * own: it appends new material through the harness's own recording path and rewrites no existing
 * conversation entry, so no assembly declares it and it is not an authoring option.
 */
import type { DeclarableRequiredSemantic } from "../interface/details/implementation";

/** The semantics a binding's behavior rests on, whether declarable or the framework's own. */
export type RequiredSemantic = "history-preservation" | DeclarableRequiredSemantic;

/** The semantics required of every binding, whatever its assembly declares. */
export const FRAMEWORK_REQUIRED_SEMANTICS = ["history-preservation"] as const satisfies readonly RequiredSemantic[];
