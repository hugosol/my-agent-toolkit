/**
 * The general safe-file module's canonical extension-facing declarations: what one update
 * declares, and the distinguishable failure its caller may recognize.
 *
 * They live beside the public entry ([`files.ts`](files.ts)) so the deep implementation in
 * `framework/modules/files.ts` references these declarations too — one class identity for the
 * failure thrown inside and recognized outside — while the entry connects `updateFile` to that
 * implementation. Keeping the declarations separate from the entry's runtime import is what makes
 * that connection one-way instead of a module cycle.
 *
 * This is not a second entry: an extension imports `updateFile`, `SafeFileUpdateOptions`,
 * `SafeFileUpdateError` and `SafeFileUpdateFailureKind` from [`files.ts`](files.ts).
 */

/** Why a call did not get as far as publishing a document. */
export type SafeFileUpdateFailureKind = "timeout" | "cancelled" | "io" | "corrupt";

/**
 * One failure of the framework's file coordination, as the caller observes it.
 *
 * `timeout` is a wait budget that ran out before coordination was acquired; `cancelled` is a
 * caller's own abort during that wait; `io` is a file the module could not read, create, replace
 * or lock, or a call it could not start at all (a target that is not an absolute path, a budget
 * that is not a wait this framework schedules); `corrupt` is an existing target whose text is not
 * a JSON document. None of them is a business decision — an update function that refuses rejects
 * with its own error, which reaches the caller unchanged — and none of them is retried.
 */
export class SafeFileUpdateError extends Error {
	readonly kind: SafeFileUpdateFailureKind;
	readonly detail: string;

	constructor(kind: SafeFileUpdateFailureKind, detail: string) {
		super(detail);
		this.name = "SafeFileUpdateError";
		this.kind = kind;
		this.detail = detail;
	}
}

/** What one update declares beyond its target and its update function. */
export interface SafeFileUpdateOptions {
	/**
	 * The whole wait budget, in milliseconds: in-process queueing plus cross-process lock
	 * acquisition. Omitted takes the module's built-in 15000ms. A declared budget must be a
	 * whole number of milliseconds this harness's timer schedules; an illegal one is refused
	 * rather than replaced.
	 */
	readonly timeoutMs?: number;
	/** Aborts the *wait*: the call fails as cancelled and never writes afterwards. Ignored once the update has begun. */
	readonly signal?: AbortSignal;
}
