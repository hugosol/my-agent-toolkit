/**
 * Offline inventory for the adapter's integrated pi subagent path, with an assembly's childEntry.
 * The provider can run children in-process or cross-process. Neither declaration certifies behavior,
 * discovers a provider, nor changes the runtime no-subagent path when no provider is available.
 */
import type { SubagentCapability } from "../../../../framework/interface/subagent";
import type { HarnessIntegrationDeclaration } from "../../../../framework/core/integration";

const CAPABILITIES = [
	"extension-loading",
	"session-facts",
	"turn-usage",
	"session-lifecycle",
	"session-observations",
	"storage-commit",
	"state-follow",
] as const satisfies readonly SubagentCapability[];

export const PI_INTEGRATION = {
	harness: "pi",
	subagents: {
		"in-process": CAPABILITIES,
		"cross-process": CAPABILITIES,
	},
} as const satisfies HarnessIntegrationDeclaration;
