/**
 * codebase-tools's manual-mode OMP assembly.
 *
 * The mode is this module's only content: it builds the shared OMP assembly against the manual
 * mode's policy document, and the thin entrypoint `entrypoints/omp/codebase-tools.ts` re-exports
 * this default. Loading the entrypoint is therefore what selects manual mode — no host profile
 * parameter and no environment override participates.
 */
import { codebaseToolsOmp } from "./omp-assembly";
import { MANUAL_STARTUP_POLICY } from "./startup-modes";

export default codebaseToolsOmp(MANUAL_STARTUP_POLICY);
