/**
 * Offline declaration matching, not behavior verification or runtime admission.
 * No adapter, extension implementation, configuration or harness is loaded by this module.
 */
import type { ExtensionDefinition } from "./core/definition";
import type {
	ExtensionHarnessEntry,
	HarnessIntegrationDeclaration,
	SubagentCapability,
	SubagentExecutionMode,
} from "./core/integration";

export type IntegrationGap =
	| { readonly kind: "extension-declaration" }
	| { readonly kind: "harness-declaration" }
	| { readonly kind: "subagent-mode" }
	| {
		readonly kind: "subagent-capability";
		readonly mode: SubagentExecutionMode;
		readonly capability: SubagentCapability;
	};

export interface IntegrationCheckResult extends ExtensionHarnessEntry {
	readonly requirements: readonly SubagentCapability[];
	readonly modes: readonly SubagentExecutionMode[];
	readonly missing: readonly IntegrationGap[];
}

/**
 * Check only actual extension/harness entries, never a Cartesian product of all declarations.
 * Every mode a harness declares must independently satisfy all of an extension's requirements:
 * coverage in one mode cannot fill a gap in another. No requirements means no subagent obligation.
 */
export function checkAdapterIntegrations(
	extensions: readonly ExtensionDefinition[],
	harnesses: readonly HarnessIntegrationDeclaration[],
	entries: readonly ExtensionHarnessEntry[],
): IntegrationCheckResult[] {
	return entries.map(entry => {
		const extension = extensions.find(candidate => candidate.id === entry.extension);
		const harness = harnesses.find(candidate => candidate.harness === entry.harness);
		const requirements = [...new Set(extension?.subagentRequirements ?? [])];
		const modes = harness === undefined ? [] : Object.keys(harness.subagents) as SubagentExecutionMode[];
		const missing: IntegrationGap[] = [];
		if (extension === undefined) missing.push({ kind: "extension-declaration" });
		else if (requirements.length > 0) {
			if (harness === undefined) missing.push({ kind: "harness-declaration" });
			else if (modes.length === 0) missing.push({ kind: "subagent-mode" });
			else {
				for (const mode of modes) {
					const supplied = new Set(harness.subagents[mode] ?? []);
					for (const capability of requirements) {
						if (!supplied.has(capability)) missing.push({ kind: "subagent-capability", mode, capability });
					}
				}
			}
		}
		return { ...entry, requirements, modes, missing };
	});
}
