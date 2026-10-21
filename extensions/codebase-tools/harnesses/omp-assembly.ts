/**
 * codebase-tools OMP assembly, independent of the startup mode that selects it.
 *
 * This is the only codebase-tools module that touches the OMP-native surface. The two mode
 * assemblies (`./omp` and `./omp-auto`) each build this one factory against the startup policy
 * their mode selected, so the native mapping, the definition and every framework behavior are
 * maintained once and the modes differ only in the document they name.
 *
 * An assembly that passes no policy is not an assembly of this extension: both modes state which
 * document they selected, and the framework applies that document's choice at the process's
 * first owner session start.
 */
import { logger } from "@oh-my-pi/pi-utils";
import { CODEBASE_TOOLS } from "../definition";
import { type OmpExtensionApi, ompAdapter } from "../../../adapters/omp";

/** The extension's OMP factory, assembled for the startup policy one mode selected. */
export function codebaseToolsOmp(startupPolicy: string): (pi: OmpExtensionApi) => void {
	const bindCodebaseTools = ompAdapter(CODEBASE_TOOLS, { startupPolicy });
	return pi => {
		// A refused binding has already reported its configuration error on the non-model
		// channel, and this session simply runs without the extension.
		if (!bindCodebaseTools(pi).bound) return;

		// Deployment diagnostic: records which source the harness actually loaded.
		logger.debug("codebase-tools: OMP assembly bound", { id: CODEBASE_TOOLS.id, assembly: import.meta.url });
	};
}
