/**
 * The subagent runtime one session's own record accumulates within one accounting period.
 *
 * The harness reports the *duration of one execution* — what one spawn of a subagent session had
 * run when the host measured it — and the extension turns those readings into the one cumulative
 * figure its own record stores. The rules that turn readings into a cumulative figure are the
 * approved ones, and they live here so the accounting that holds a session's ledger and the
 * snapshot it commits share a single reading of them:
 *
 * - **One execution contributes once.** A session's executions are told apart by the identity its
 *   harness gives each one. A reading of an execution already accounted for — the same completion
 *   observed again, whether by a repeated notification or by a second observer — is ignored, so a
 *   duplicated observation cannot charge a duration twice.
 * - **A reading of an open execution replaces its earlier reading.** A harness reports a spawn's
 *   progress while the work runs, and those readings are a running total of *that* execution, not
 *   a series to add up. Only a reading that names a different execution adds anything: the open
 *   execution is closed at its latest reading and the new one becomes the open one.
 * - **A final reading closes its execution.** The reading the harness states as the execution's
 *   own end is added at once and its identity retired, so later readings of it contribute nothing.
 * - **Absent is not zero.** The accumulated figure is unavailable until something is known about
 *   the session: its record's saved value, or a reading this instance itself accepted. A host that
 *   reports no runtime at all and a host that really reported `0` for a completed execution are
 *   therefore different facts, and the second is kept as a known zero.
 * - **Nothing here persists anything.** Persisting the figure is the surrounding commit's business,
 *   which is what keeps a runtime from causing a write of its own and lets a reading that arrived
 *   late wait for the next commit — or never be saved at all when no further commit comes.
 *
 * This module is harness-independent shared logic: it reads no file, names no native type and
 * holds no clock of its own.
 */
import type { SubagentRuntimeFact } from "../../../framework/core/protocol";

/** One session's runtime accumulation, as the accounting holds it and the commit snapshots it. */
export interface SubagentRuntimes {
	/**
	 * Applies one native reading — or the fact that this host could not produce one.
	 *
	 * The answer is the reason a reading was not usable, or nothing when it was applied. An
	 * unreadable runtime changes no accumulation and costs nothing that was already counted: the
	 * extension states the reason as an error and keeps the last valid figure it had.
	 */
	accept(runtime: SubagentRuntimeFact): { readonly fault: string } | undefined;
	/**
	 * What this session's record would carry right now: its saved value plus every execution this
	 * instance has since accounted, or nothing while nothing is known about it.
	 */
	available(): number | undefined;
}

/**
 * Build one session's accumulation over the value its own record already carries.
 *
 * The saved value is the figure an earlier commit produced in this period, so a later restart
 * continues accumulating rather than starting over. It is absent when this session's record
 * carried none — a session whose host never reported a runtime, an old record written before this
 * field existed, or one whose value was dropped because it was not a measurement.
 */
export function createSubagentRuntimes(saved: number | undefined): SubagentRuntimes {
	/** The value this session's own record carried, which the next commit replaces with the total. */
	const savedMs = saved;
	/** Every closed execution's contribution this instance added since it seeded from the record. */
	let closedMs = 0;
	/** The execution whose readings are currently open, with its latest reading. */
	let open: { readonly executionId: string; readonly runtimeMs: number } | undefined;
	/** The executions already accounted for, so a repeated observation of one adds nothing again. */
	const accounted = new Set<string>();
	/** Whether this instance accepted a reading at all, which is what makes a reported zero known. */
	let observed = false;

	return {
		accept(runtime) {
			if (runtime.kind === "unavailable") return { fault: runtime.reason };
			const runtimeMs = runtime.runtimeMs;
			if (typeof runtimeMs !== "number" || !Number.isFinite(runtimeMs) || runtimeMs < 0) {
				return { fault: `运行耗时不是可用的毫秒数（${String(runtimeMs)}）` };
			}
			if (accounted.has(runtime.executionId)) return undefined;
			// A reading that names another execution closes the open one: its latest reading is what
			// that execution ran, and the new execution becomes the one further readings belong to.
			if (open !== undefined && open.executionId !== runtime.executionId) closedMs += open.runtimeMs;
			if (runtime.status === "ended") {
				closedMs += runtimeMs;
				accounted.add(runtime.executionId);
				open = undefined;
			} else {
				open = { executionId: runtime.executionId, runtimeMs };
			}
			observed = true;
			return undefined;
		},
		available() {
			// Nothing was saved and nothing was reported: this session's runtime is unavailable
			// rather than a zero, and a host that never measures executions leaves it that way.
			if (!observed && savedMs === undefined) return undefined;
			return (savedMs ?? 0) + closedMs + (open?.runtimeMs ?? 0);
		},
	};
}
