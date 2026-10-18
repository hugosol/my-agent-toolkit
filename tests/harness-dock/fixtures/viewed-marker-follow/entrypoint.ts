/**
 * Dock fixture extension: a marker whose declared field follows the Owner into a subagent session.
 *
 * It is deliberately nothing but a declaration and the framework's own adapter: the dock loads it
 * through the harness's real loader, arms it with its own toggle command in the Owner's session, and
 * reads the one framework-owned marker area the host was told to render. A field that follows is what
 * makes a displayed subagent's line come from the Owner's *current* value.
 */
import { type OmpExtensionApi, ompAdapter } from "../../../../adapters/omp";
import { type ExtensionDefinition, defineExtension } from "../../../../framework/public";

/** The extension id whose marker line the dock reads. */
export const FOLLOW_MARKER_ID = "marker-follow-probe";
/** The command that arms it in the Owner's own session. */
export const FOLLOW_MARKER_COMMAND = "marker-follow-toggle";
/** Its marker text, as the one framework-owned area renders it. */
export const FOLLOW_MARKER_TEXT = "◈ followMarker";

const definition: ExtensionDefinition = defineExtension({
	id: FOLLOW_MARKER_ID,
	displayName: "markerFollowProbe",
	state: { inheritance: "follow" },
	commands: [{ type: "toggle", name: FOLLOW_MARKER_COMMAND, state: "enabled" }],
	marker: { text: FOLLOW_MARKER_TEXT },
});

export default function markerFollowProbe(pi: OmpExtensionApi): void {
	ompAdapter(definition)(pi);
}
