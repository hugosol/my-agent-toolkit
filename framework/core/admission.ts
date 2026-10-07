/**
 * Admission: the framework's one pre-registration check, and the facts it decides from.
 *
 * Admission runs while an extension is being bound and before it registers anything, and
 * it reaches exactly one judgement — whether the agent runtime this binding runs on is one
 * the extension declares support for. Two things are deliberately not that judgement. A
 * runtime version outside the declared set is *not* a refusal: the binding continues, the
 * session is told once and no support is claimed. A required framework semantic the
 * runtime cannot honor *is* a refusal: the binding is abandoned and nothing is registered,
 * because a missing semantic cannot be traded for an unrecognized version. The refusal
 * therefore wins over the unlisted version, and the two are never reported as one.
 *
 * The adapter resolves the facts; this module owns the rule. It names no agent runtime:
 * a version is the string the runtime reports, and a missing semantic is the adapter's
 * observation that a native path the framework's contract rests on is not there.
 */

/**
 * A semantic the framework must be able to honor before it binds an extension.
 *
 * The first release has exactly one: `history-preservation`, the framework's rule that it
 * appends new material through the agent runtime's own recording path and rewrites no
 * existing conversation entry. An adapter reports it as missing when the native paths this
 * rule depends on are absent, and admission then refuses the binding rather than downgrading
 * the rule.
 */
export type RequiredSemantic = "history-preservation";

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
	/** The required semantics this runtime cannot honor, as the adapter observed them. */
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
 * Decides one binding's admission from the declared support set and the observed facts.
 *
 * A missing required semantic refuses first, so the version axis is never consulted for a
 * runtime that cannot honor one of the framework's contracts. Otherwise an observed
 * version outside the support set is an unlisted version — warned about once per main
 * session, after which binding continues. A runtime that reports no version leaves nothing
 * to compare, so admission adds nothing rather than inventing a verdict from absence.
 */
export function admit(supportedVersions: readonly string[], facts: AdmissionFacts): AdmissionOutcome {
	const missing = facts.missingRequiredSemantics ?? [];
	if (missing.length > 0) return { kind: "required-semantics-missing", missing: [...missing] };

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
