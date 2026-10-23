import { piAdapter } from "../../../adapters/pi";
import type { PiExtensionApi } from "../../../adapters/pi";
import { CODEBASE_TOOLS } from "../definition";

/**
 * What one pi mode assembly states: which startup policy its mode selected, and which entry a
 * subagent provider loads into the sessions it spawns.
 *
 * Both are the mode assembly's own facts rather than the extension's. `childEntry` is stated
 * because this extension's field declares `follow`: a session a subagent provider spawns out of
 * process loads this entry to hold its own observations, stating it is what makes the framework
 * offer the owning session's declared value in this process and read it in that one. The entry
 * named is the mode's own entrypoint, so a spawned session is assembled against the same policy
 * as the process that spawned it.
 */
export interface CodebaseToolsPiAssembly {
	/** The startup policy document the pi entrypoint of this mode selected. */
	readonly startupPolicy: string;
	/** The mode's own pi entrypoint, which a subagent provider loads into spawned sessions. */
	readonly childEntry: string;
}

/**
 * This extension on pi, assembled for one mode's startup policy.
 *
 * The assembly is the same in both modes: the definition, the pi adapter and the configuration
 * it declares are shared, and the only mode-specific input is the policy path. The two mode
 * assemblies (`./pi` and `./pi-auto`) therefore state their mode by naming the document and the
 * child entry, and the native mapping lives here once.
 */
export function codebaseToolsPi(assembly: CodebaseToolsPiAssembly): (pi: PiExtensionApi) => void {
	const bindCodebaseTools = piAdapter(CODEBASE_TOOLS, {
		childEntry: assembly.childEntry,
		startupPolicy: assembly.startupPolicy,
	});

	return pi => {
		bindCodebaseTools(pi);
	};
}
