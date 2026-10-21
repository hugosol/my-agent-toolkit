/**
 * codebase-tools's automatic startup mode pi assembly.
 *
 * The mode is this module's only content: it builds the shared pi assembly against the automatic
 * mode's policy document and names the automatic entrypoint as the child entry a subagent
 * provider loads, and the thin entrypoint `entrypoints/pi-auto/codebase-tools.ts` re-exports this
 * default. Loading the entrypoint is therefore what selects automatic mode — no host profile
 * parameter and no environment override participates — and the definition, adapter assembly and
 * every behavior are the manual mode's.
 */
import { codebaseToolsPi } from "./pi-assembly";
import { AUTOMATIC_PI_CHILD_ENTRY, AUTOMATIC_STARTUP_POLICY } from "./startup-modes";

export default codebaseToolsPi({
	startupPolicy: AUTOMATIC_STARTUP_POLICY,
	childEntry: AUTOMATIC_PI_CHILD_ENTRY,
});
