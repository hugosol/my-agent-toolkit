/**
 * Admission: the framework's one pre-registration check, and the facts it decides from.
 *
 * Admission runs while an extension is being bound and before it registers anything, and
 * it reaches exactly one judgement — whether the agent runtime this binding runs on is one
 * the framework's Supported agent-runtime baseline ({@link SUPPORTED_AGENT_RUNTIME_VERSIONS})
 * lists. Two things are deliberately not that judgement. A runtime version outside that
 * baseline is *not* a refusal: the binding continues, the session is told once — one framework
 * notice per Owner for the whole process, published by the notice behavior
 * (`framework/behaviors/admission.ts`) — and no
 * support is claimed. A required framework semantic the runtime cannot honor *is* a refusal —
 * where "required" is the framework's own semantics plus the ones the extension's assembly
 * declared, so a gap nobody asked for refuses nobody — and the binding is abandoned with
 * nothing registered, because a missing semantic cannot be traded for an unrecognized
 * version. The refusal therefore wins over the unlisted version, and the two are never
 * reported as one.
 *
 * The adapter resolves the facts; this module owns the rule. It names no agent runtime:
 * a version is the string the runtime reports, and a missing semantic is the adapter's
 * observation that a native path the framework's contract rests on is not there. Which
 * versions are supported is likewise not the adapter's or an assembly's to say: the baseline
 * is declared here, and no calling surface accepts a version list of its own.
 *
 * The version decision is process-scoped, not module- or binding-scoped: one judgement per
 * reported version is recorded on the process global and shared by every consumer in the
 * process, including the copies of this module an agent runtime that evaluates each
 * extension's graph separately holds ({@link VERSION_DECISIONS_KEY}). Whether the runtime
 * honors a required semantic is the opposite: that fact is re-read per binding, because it is
 * the interface this binding was handed, not a property of the version.
 */

import { SUPPORTED_AGENT_RUNTIME_VERSIONS } from "./baseline";

/**
 * A semantic the framework must be able to honor before it binds an extension.
 *
 * `history-preservation` is the framework's own invariant, recorded in
 * {@link FRAMEWORK_REQUIRED_SEMANTICS}: it appends new material through the agent runtime's
 * own recording path and rewrites no existing conversation entry, and an adapter reports it
 * as missing when the native paths this rule depends on are absent.
 *
 * The other two are the semantic lifecycle axes this release added — the session axis
 * (`session_start`/`session_end`) and the round axis (`round_start`/`round_end`). The
 * framework requires neither of every binding: an extension that observes no lifecycle event
 * keeps running on a runtime that cannot deliver one. They are therefore the semantics an
 * extension's assembly may *declare* it depends on ({@link DeclarableRequiredSemantic}), and
 * a runtime that cannot honor a declared one refuses that binding rather than half-serving
 * the capability it was asked for.
 */
export type RequiredSemantic = "history-preservation" | "session-lifecycle-events" | "round-lifecycle-events";

/**
 * The semantics required of every binding, whatever its assembly declares.
 *
 * History preservation is the framework's own contract — State is written by appending, and
 * nothing in it rewrites a conversation — so it is required of every binding and no assembly
 * declares it: it is not a member of {@link DeclarableRequiredSemantic}.
 */
export const FRAMEWORK_REQUIRED_SEMANTICS = ["history-preservation"] as const satisfies readonly RequiredSemantic[];

/**
 * A semantic an extension's assembly may declare its extension depends on.
 *
 * The required semantics above are not declarable: the framework requires them anyway. What is
 * left is the capability an extension asks for beyond that, and declaring one is what turns a
 * runtime that cannot honor it from a gap the extension works around into a refusal.
 */
export type DeclarableRequiredSemantic = Exclude<RequiredSemantic, (typeof FRAMEWORK_REQUIRED_SEMANTICS)[number]>;

/**
 * The environment the framework was verified on.
 *
 * Recorded, never judged: the supported platform and agent runtime are facts of the
 * baseline and support records, and admission consults no field of this value.
 */
export interface VerifiedEnvironment {
	/** The verified platform and architecture, e.g. `win32-x64`. */
	readonly platform: string;
	/** The agent runtime's name, e.g. `omp`. */
	readonly runtime: string;
}

/** The agent-runtime facts one binding resolved, as the adapter observed them. */
export interface AdmissionFacts {
	/** The version the runtime reports, or `undefined` when its surface reports none. */
	readonly version?: string;
	/**
	 * The framework semantics this runtime cannot honor, as the adapter observed them.
	 *
	 * A fact about the runtime, not a verdict about a binding: whether one of them refuses
	 * *this* binding is admission's rule, read against the semantics required of it — the
	 * framework's own, plus whatever the assembly declared.
	 */
	readonly missingRequiredSemantics?: readonly RequiredSemantic[];
	/** The verified environment, recorded only. */
	readonly environment?: VerifiedEnvironment;
}

/** What admission concluded for one binding. */
export type AdmissionOutcome =
	| { readonly kind: "admitted" }
	| { readonly kind: "unlisted-version"; readonly version: string; readonly supportedVersions: readonly string[] }
	| { readonly kind: "required-semantics-missing"; readonly missing: readonly RequiredSemantic[] };

/** The unlisted-version outcome, as the notice behavior consumes it. */
export type UnlistedVersionAdmission = Extract<AdmissionOutcome, { readonly kind: "unlisted-version" }>;

/**
 * The version axis's half of {@link AdmissionOutcome}: what one reported version was judged to be.
 *
 * A required-semantics refusal is not part of it — whether *this* binding loses a semantic is this
 * binding's own judgement, from the semantics required of it — so this is exactly what the process
 * records per version.
 */
type VersionDecision = Extract<AdmissionOutcome, { readonly kind: "admitted" } | { readonly kind: "unlisted-version" }>;

/**
 * Decides one binding's admission from the observed facts and the semantics the extension's
 * assembly declared it depends on.
 *
 * The support set is not an input: version membership is decided against the framework's own
 * {@link SUPPORTED_AGENT_RUNTIME_VERSIONS}, so an assembly cannot supply, widen or replace it.
 *
 * A missing required semantic refuses first, so the version axis is never consulted for a
 * runtime that cannot honor one of the framework's contracts — or one the extension asked
 * for. "Required" is the union of two things: the framework's own semantics, which every
 * binding requires, and what the assembly declared. A semantic no one declared is a fact
 * about the runtime and nothing more, so it refuses nothing. Otherwise an observed version
 * outside the baseline is an unlisted version — warned about once per Owner, the main session, after
 * which binding continues. A runtime that reports no version leaves nothing to compare, so
 * admission adds nothing rather than inventing a verdict from absence.
 *
 * The version judgement itself is the process's, made once per reported version
 * ({@link decideVersion}): the first binding to report a version decides it, and every later
 * binding — in this module's copy or in another one the agent runtime loaded — reads that
 * decision instead of making a second one. A report of no version decides nothing, so what a
 * process records is always a decision about a version it was actually told.
 *
 * The declared semantics default to none, which is what an assembly with no capability
 * dependency passes.
 */
export function admit(
	facts: AdmissionFacts,
	requiredSemantics: readonly DeclarableRequiredSemantic[] = [],
): AdmissionOutcome {
	const required: readonly RequiredSemantic[] = [...FRAMEWORK_REQUIRED_SEMANTICS, ...requiredSemantics];
	const missing = (facts.missingRequiredSemantics ?? []).filter(semantic => required.includes(semantic));
	if (missing.length > 0) return { kind: "required-semantics-missing", missing };

	const { version } = facts;
	return version === undefined ? { kind: "admitted" } : decideVersion(version);
}

/**
 * The process-global record of the version decision: one entry per version the runtime reported.
 *
 * The decision belongs to the process, not to a module instance. The OMP legacy loader rewrites
 * every relative import of an extension's graph to `specifier?mtime=<per-load tag>`, with a fresh
 * tag per extension load, so two extensions that use this framework evaluate their own copy of
 * this module — the precedent for the one shared marker area is in
 * `framework/behaviors/marker.ts` — and a record kept in this module would judge the reported
 * version once per copy. Holding the record on the process global under a well-known symbol gives
 * the copies one record, and `Symbol.for` is what lets them agree on the key by name while holding
 * no shared module identity.
 *
 * The version is the key, so what a process holds is one decision per version rather than one
 * process-wide verdict: two reported versions are two decisions, and the first report of a version
 * is the only one that judges it.
 */
const VERSION_DECISIONS_KEY: unique symbol = Symbol.for("my-agent-toolkit.semantic-extensions.version-decisions");

/** The process global, narrowed to the one entry this module reads and writes. */
interface VersionDecisionScope {
	[VERSION_DECISIONS_KEY]?: Map<string, VersionDecision>;
}

/** The process-wide record: one decision per reported version, shared by every copy and binding. */
function versionDecisions(): Map<string, VersionDecision> {
	const scope = globalThis as VersionDecisionScope;
	const registered = scope[VERSION_DECISIONS_KEY];
	if (registered !== undefined) return registered;

	const decisions = new Map<string, VersionDecision>();
	scope[VERSION_DECISIONS_KEY] = decisions;
	return decisions;
}

/**
 * The decision one reported version is judged to, made once per process and shared by every
 * consumer of it: whether the version is in the baseline, and — when it is not — the version and
 * the set it was judged against.
 *
 * The reported version is the whole input, so the decision is reusable as it stands: the first
 * binding to report a version computes it, and every later one, in any copy of this module, reads
 * that very value rather than a second one that would say the same thing. Nothing is recorded
 * under any other key: an unreported version reaches no further than the caller's own binding.
 */
function decideVersion(version: string): VersionDecision {
	const decisions = versionDecisions();
	const decided = decisions.get(version);
	if (decided !== undefined) return decided;

	const decision: VersionDecision = SUPPORTED_AGENT_RUNTIME_VERSIONS.includes(version)
		? { kind: "admitted" }
		: { kind: "unlisted-version", version, supportedVersions: [...SUPPORTED_AGENT_RUNTIME_VERSIONS] };
	decisions.set(version, decision);
	return decision;
}
