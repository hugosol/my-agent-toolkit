/** pi's Marker area effect: one framework-owned widget, absent on surfaces without UI. */
import type { MarkerTransport } from "../../../framework/runtime/port";
import type { PiExtensionContext } from "../internal/native";

/** Empty lines clear the area; the framework owns its identity and placement. */
export function markerTransport(ctx: PiExtensionContext): MarkerTransport {
	return {
		publishMarkers: lines => {
			if (ctx.hasUI) {
				ctx.ui.setWidget("semantic-extensions", lines.length ? [...lines] : undefined, {
					placement: "aboveEditor",
				});
			}
		},
	};
}
