/**
 * OMP marker transport: the one native widget the framework owns for its unified marker area,
 * mapped per delivery.
 *
 * A session without a UI renders no area at all. The marker is a UI-only surface with no textual
 * equivalent, so its whole path is a no-op there rather than a diagnostic. Which lines an area
 * shows is the framework's business; this module only writes the native widget the lines go to.
 */
import type { MarkerTransport } from "../../framework/core/protocol";
import type { OmpSessionContext } from "./native-types";

/**
 * The one native widget key the framework owns for its unified marker area.
 *
 * It is deliberately not derived from any definition: extensions render lines inside this
 * area, they never name the widget. The value is the area's consumer-visible identity, so
 * changing it changes where every extension's marker appears.
 */
const MARKER_AREA_KEY = "semantic-extensions";

/** The placement the framework fixes for the unified marker area. */
const MARKER_AREA_PLACEMENT = "aboveEditor";

/**
 * The marker area's transport for one delivery: the framework-owned widget of this
 * session, where an empty line list clears the area.
 */
export function markerTransport(ctx: OmpSessionContext): MarkerTransport {
	return {
		publishMarkers: lines => {
			if (!ctx.hasUI) return;
			ctx.ui.setWidget(MARKER_AREA_KEY, lines.length > 0 ? [...lines] : undefined, {
				placement: MARKER_AREA_PLACEMENT,
			});
		},
	};
}
