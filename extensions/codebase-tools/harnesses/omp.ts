/**
 * codebase-tools OMP harness assembly.
 *
 * The only codebase-tools module that touches the OMP-native surface; the thin
 * entrypoint at `entrypoints/omp/codebase-tools.ts` re-exports this file's default
 * factory and holds nothing else. The factory itself is assembled by the framework's
 * OMP adapter from the shared definition, so this file holds no binding logic: it
 * only observes whether this session's binding succeeded.
 *
 * Everything it composes — the shared definition and the Markdown prompt resources —
 * lives outside the discovery directory, and the loader resolves those relative to
 * this file's own location.
 */
import { logger } from "@oh-my-pi/pi-utils";
import { CODEBASE_TOOLS } from "../definition";
import { type OmpExtensionApi, ompAdapter } from "../../../framework/adapters/omp";

/** The framework's OMP binding for the codebase-tools definition. */
const bindCodebaseTools = ompAdapter(CODEBASE_TOOLS);

export default function codebaseTools(pi: OmpExtensionApi): void {
	// A refused binding has already reported its configuration error on the non-model
	// channel, and this session simply runs without the extension.
	if (!bindCodebaseTools(pi).bound) return;

	// Deployment diagnostic: records which source the harness actually loaded.
	logger.debug("codebase-tools: OMP assembly bound", { id: CODEBASE_TOOLS.id, assembly: import.meta.url });
}
