/**
 * OMP binding diagnostics: the non-model channel this binding reports on, and its deduplication.
 *
 * Startup happens before any UI exists, so a diagnostic goes to stderr: it is user-visible and can
 * never reach model context. At most one report is made per native fact per binding — the first
 * delivery that finds a fact this harness does not report says so, and every later one stays
 * quiet — so a missing-fact report neither repeats per delivery nor hides behind another fact's
 * report.
 */
/** One binding's diagnostic channel. */
export interface Diagnostics {
	/** Publishes a user-visible line on the non-model channel. */
	reportDiagnostic(message: string): void;
	/** Reports one fact this harness does not state, at most once per binding. */
	reportMissingFact(fact: string): undefined;
}

/**
 * Builds the diagnostics of one binding, scoped to its definition id.
 *
 * The channel itself is process stderr; the deduplication state is this binding's, so two
 * sessions bound to one assembly each report their own first missing fact.
 */
export function createDiagnostics(definitionId: string): Diagnostics {
	const reportDiagnostic = (message: string): void => {
		process.stderr.write(`${message}\n`);
	};
	const reportedMissingFacts = new Set<string>();
	return {
		reportDiagnostic,
		reportMissingFact: fact => {
			if (!reportedMissingFacts.has(fact)) {
				reportedMissingFacts.add(fact);
				reportDiagnostic(
					`${definitionId}: this harness reports no ${fact}; the framework answers nothing rather than inventing one`,
				);
			}
			return undefined;
		},
	};
}
