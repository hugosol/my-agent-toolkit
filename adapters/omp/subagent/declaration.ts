/** Offline integration inventory owned by the OMP adapter author; not runtime configuration. */
import type { HarnessIntegrationDeclaration } from "../../../framework/core/integration";

export const OMP_INTEGRATION = {
	harness: "omp",
	subagents: {
		"in-process": [
			"extension-loading",
			"session-facts",
			"turn-usage",
			"session-lifecycle",
			"session-observations",
			"storage-commit",
			"state-follow",
		],
	},
} as const satisfies HarnessIntegrationDeclaration;
