/**
 * The UI's one boundary wait, as the extension's own suites compose it.
 *
 * It is the composition the assembly performs, over the runtime a suite built: the schedule is the
 * process-wide presentation result, so a frontend attached in a suite waits on the same season
 * boundaries production waits on, at the clock the suite's runtime was given.
 */
import type { BoundaryTimer } from "../../../extensions/model-cost/harnesses/omp/boundary-timer";
import { createBoundaryTimer } from "../../../extensions/model-cost/harnesses/omp/boundary-timer";
import type { ModelCostRuntime } from "../../../extensions/model-cost/shared-logic/runtime";

export function uiBoundaryTimerOf(runtime: ModelCostRuntime): BoundaryTimer {
	return createBoundaryTimer(() => {
		const period = runtime.presentation.period();
		return { at: period.at, ...(period.nextChangeAt === undefined ? {} : { nextChangeAt: period.nextChangeAt }) };
	});
}
