/**
 * codebase-tools's manual-mode pi assembly.
 *
 * The mode is this module's only content: it builds the shared pi assembly against the manual
 * mode's policy document and names the manual entrypoint as the child entry a subagent provider
 * loads, and the thin entrypoint `entrypoints/pi/codebase-tools.ts` re-exports this default.
 * Loading the entrypoint is therefore what selects manual mode — no host profile parameter and
 * no environment override participates.
 */
import { codebaseToolsPi } from "./pi-assembly";
import { MANUAL_PI_CHILD_ENTRY, MANUAL_STARTUP_POLICY } from "./startup-modes";

export default codebaseToolsPi({
	startupPolicy: MANUAL_STARTUP_POLICY,
	childEntry: MANUAL_PI_CHILD_ENTRY,
});
