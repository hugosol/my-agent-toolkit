/**
 * Internal declaration guards and command-argument normalization.
 *
 * The authoring contract itself — the factory, its context, the implementation and its lifecycle —
 * is canonical in `framework/interface`; this module keeps only the two small rules the framework's
 * own behavior and validators share. Nothing here is extension-facing.
 */

/**
 * The argument text a command invocation carries, normalized the way `actions` routing
 * compares it: surrounding whitespace removed and case ignored.
 *
 * The framework owns this normalization so the same rule governs the help an empty argument
 * prints, the match against the declared table, and the argument a directed command's
 * unrecognized member would have seen.
 */
export function normalizeCommandArgument(args: string | undefined): string {
	return (args ?? "").trim().toLowerCase();
}

/**
 * Whether a value from a definition or an implementation is a mapping of named members.
 *
 * A definition can also arrive from plain JavaScript, so the framework reads its declarations
 * through this guard instead of trusting the type an editor saw: an array, a scalar and `null`
 * are all values a mapping could have been, and reading a member off one of them would be a
 * silent lie rather than a refusal.
 */
export function isPlainMapping(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
