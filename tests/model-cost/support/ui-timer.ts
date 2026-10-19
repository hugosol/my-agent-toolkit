/**
 * The UI's one boundary wait, as the extension's own suites compose it.
 *
 * It is the composition both assemblies perform, over the runtime a suite built: the schedule is the
 * process-wide presentation result, so a frontend attached in a suite waits on the same season
 * boundaries production waits on, at the clock the suite's runtime was given. One timer serves one
 * suite process's UI, exactly as one serves a CLI's: the harness that draws through it is the
 * frontend's own business, because the timer is scheduled on whatever carrier that frontend hands over.
 */
import type { BoundaryTimer } from "../../../extensions/model-cost/harnesses/boundary-timer";
import { createBoundaryTimer } from "../../../extensions/model-cost/harnesses/boundary-timer";
import type { ModelCostRuntime } from "../../../extensions/model-cost/shared-logic/runtime";

export function uiBoundaryTimerOf(runtime: ModelCostRuntime): BoundaryTimer {
	return createBoundaryTimer(() => {
		const period = runtime.presentation.period();
		return { at: period.at, ...(period.nextChangeAt === undefined ? {} : { nextChangeAt: period.nextChangeAt }) };
	});
}
