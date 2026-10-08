/**
 * The framework-owned Supported harness baseline: the exact harness versions
 * shared extension behavior is supported on.
 *
 * Version support is a framework responsibility, not an extension's. An extension's assembly
 * declares the capabilities its extension needs and says nothing about harness versions, so the
 * one list admission compares a reported version against is this one: no assembly holds a second
 * support set, and no extension can claim a wider or narrower set than the framework's.
 *
 * Membership is exact. A reported version is supported when it is literally one of these
 * strings — there is no range matching, no prefix or partial comparison and no inference from a
 * missing report. A version that is not one of them is not refused either: the main session is
 * warned once and the binding continues without a support claim, this repository's policy for a
 * harness whose revision anchor has not been verified.
 *
 * Replacing the supported version is an explicit maintainer action, and this list is what
 * carries it: edit it together with the support record
 * (`framework/docs/harness-support.md`) and the baseline record's `harness.supportedVersion`
 * (`framework/docs/harness-baseline.json`), then restart the harness. A green candidate run is
 * a regression alarm, never a support claim.
 */
export const SUPPORTED_HARNESS_VERSIONS: readonly [string, ...string[]] = ["18.5.0"];
