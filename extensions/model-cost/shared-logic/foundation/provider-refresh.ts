/**
 * The refresh policy the two provider readings share: one success TTL and one query in flight.
 *
 * Both this extension's provider-level sources are readings of a provider account rather than of a
 * session, a model or a Round, and both are refreshed by the same rule: the reading this process
 * already holds is compared against a *success* TTL when a real request of its own provider settles,
 * and only a reading that has outlived it begins a query. The TTL is deliberately not a schedule —
 * its expiry alone queries nothing, and no timer is armed — and it is a success TTL: an attempt that
 * produced no reading leaves the instant the last real reading was accepted exactly where it was, so
 * the next trigger checks the same unchanged reading again. There is no failure cooldown and no
 * retry schedule; a repeated cheap check is preferred to an invented failure policy.
 *
 * A trigger that arrives while a query is already out is merged into that query rather than issuing
 * a second request, and nothing is re-issued when the query completes. The caller that triggered it
 * is answered by the query it joined — which is what lets a boundary read take the value the one
 * outstanding attempt obtained — and the next *later* trigger is what asks again.
 *
 * This module owns the policy, not the query or the reading: the two provider modules each hold
 * their own result, credential handling, address and parser, and hand this policy only the instant
 * their last accepted reading was obtained and the query to run when a refresh is due.
 */

/** What one refresh policy is built from. */
export interface ProviderRefreshInputs {
	/** The instant source, on the process's own clock. */
	readonly now: () => number;
	/** The success TTL, in milliseconds, a reading keeps before a later trigger may refresh it. */
	readonly ttlMs: number;
}

/** The shared success-TTL and in-flight policy of one provider reading. */
export interface ProviderRefresh {
	/**
	 * Whether a reading accepted at `obtainedAt` may be refreshed now.
	 *
	 * Nothing held — a reading this process has not obtained, or whose last attempt produced none —
	 * is always due, which is what makes a failed attempt repeatable at the next trigger.
	 */
	due(obtainedAt: number | undefined): boolean;
	/**
	 * Begin one query unless one is already out; answer the query this trigger belongs to.
	 *
	 * The query is the caller's own: this policy neither builds it nor interprets its result, and a
	 * caller joining an outstanding query receives that query's own answer.
	 */
	begin<T>(query: () => Promise<T>): Promise<T>;
}

/** Build one refresh policy over the process's own clock and the configured success TTL. */
export function createProviderRefresh(inputs: ProviderRefreshInputs): ProviderRefresh {
	/** The one query this instance has out, while it is out; a later trigger joins it. */
	let outstanding: Promise<unknown> | undefined;

	return {
		due(obtainedAt: number | undefined): boolean {
			return obtainedAt === undefined || inputs.now() - obtainedAt >= inputs.ttlMs;
		},
		begin<T>(query: () => Promise<T>): Promise<T> {
			if (outstanding !== undefined) return outstanding as Promise<T>;
			const started = query().finally(() => {
				outstanding = undefined;
			});
			outstanding = started;
			return started;
		},
	};
}
