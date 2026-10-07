/**
 * Admission: the framework's one pre-registration check, and the facts it decides from.
 *
 * Admission runs while an extension is being bound and before it registers anything, and
 * it reaches exactly one judgement — whether the agent runtime this binding runs on is one
 * the extension declares support for. Two things are deliberately not that judgement. A
 * runtime version outside the declared set is *not* a refusal: the binding continues, the
 * session is told once and no support is claimed. A required framework semantic the
 * runtime cannot honor *is* a refusal — where "required" is the framework's own semantics
 * plus the ones the extension's assembly declared, so a gap nobody asked for refuses
 * nobody — and the binding is abandoned with nothing registered, because a missing
 * semantic cannot be traded for an unrecognized version. The refusal therefore wins over
 * the unlisted version, and the two are never reported as one.
 *
 * The adapter resolves the facts; this module owns the rule. It names no agent runtime:
 * a version is the string the runtime reports, and a missing semantic is the adapter's
 * observation that a native path the framework's contract rests on is not there.
 */

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
 * Decides one binding's admission from the declared support set, the observed facts, and the
 * semantics the extension's assembly declared it depends on.
 *
 * A missing required semantic refuses first, so the version axis is never consulted for a
 * runtime that cannot honor one of the framework's contracts — or one the extension asked
 * for. "Required" is the union of two things: the framework's own semantics, which every
 * binding requires, and what the assembly declared. A semantic no one declared is a fact
 * about the runtime and nothing more, so it refuses nothing. Otherwise an observed version
 * outside the support set is an unlisted version — warned about once per main session, after
 * which binding continues. A runtime that reports no version leaves nothing to compare, so
 * admission adds nothing rather than inventing a verdict from absence.
 *
 * The declared semantics default to none, which is what an assembly with no capability
 * dependency passes.
 */
export function admit(
	supportedVersions: readonly string[],
	facts: AdmissionFacts,
	requiredSemantics: readonly DeclarableRequiredSemantic[] = [],
): AdmissionOutcome {
	const required: readonly RequiredSemantic[] = [...FRAMEWORK_REQUIRED_SEMANTICS, ...requiredSemantics];
	const missing = (facts.missingRequiredSemantics ?? []).filter(semantic => required.includes(semantic));
	if (missing.length > 0) return { kind: "required-semantics-missing", missing };

	const { version } = facts;
	if (version === undefined || supportedVersions.includes(version)) return { kind: "admitted" };
	return { kind: "unlisted-version", version, supportedVersions: [...supportedVersions] };
}

/**
 * The once-per-main-session record of admission notices.
 *
 * One instance belongs to an assembly — a definition plus the adapter that binds it — so
 * every binding of that assembly in one process shares it. The notice for a main session
 * is published on the first delivery that session is the owner of, and no later re-entry,
 * re-binding or navigation of the same session repeats it.
 */
export class AdmissionNotices {
	readonly #notifiedOwners = new Set<string>();

	/** Claims the notice for one owner: true the first time, false on every later claim. */
	claim(ownerKey: string): boolean {
		if (this.#notifiedOwners.has(ownerKey)) return false;
		this.#notifiedOwners.add(ownerKey);
		return true;
	}
}

/**
 * The notice text for an unlisted version.
 *
 * One line naming the extension, the version the runtime reported and the versions the
 * extension declares; the wording is the framework's, and the facts it carries are the
 * ones the operator needs to decide whether to upgrade or to keep running.
 */
export function describeUnlistedVersion(displayName: string, outcome: UnlistedVersionAdmission): string {
	return `${displayName}: agent runtime version ${outcome.version} is not in the supported set (${outcome.supportedVersions.join(", ")}); continuing without a support claim`;
}
