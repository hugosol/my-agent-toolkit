/**
 * Dock fixture extension: a marker whose declared field does *not* follow the Owner.
 *
 * Its sibling fixture declares `follow`, so one run shows both halves of the per-field rule on the
 * real host: a displayed subagent renders the following line from the Owner's current value and this
 * one from its own declared default — never a copy of every line the Owner's session shows.
 */
import { type OmpExtensionApi, ompAdapter } from "../../../../adapters/omp";
import { type ExtensionDefinition, defineExtension } from "../../../../framework/interface";

/** The extension id whose marker line the dock reads. */
export const NONE_MARKER_ID = "marker-none-probe";
/** The command that arms it in the Owner's own session. */
export const NONE_MARKER_COMMAND = "marker-none-toggle";
/** Its marker text, as the one framework-owned area renders it. */
export const NONE_MARKER_TEXT = "◐ noneMarker";

const definition: ExtensionDefinition = defineExtension({
	id: NONE_MARKER_ID,
	displayName: "markerNoneProbe",
	state: { field: "enabled", inheritance: "none" },
	commands: [{ type: "toggle", name: NONE_MARKER_COMMAND, state: "enabled" }],
	marker: { text: NONE_MARKER_TEXT },
});

export default function markerNoneProbe(pi: OmpExtensionApi): void {
	ompAdapter(definition)(pi);
}
