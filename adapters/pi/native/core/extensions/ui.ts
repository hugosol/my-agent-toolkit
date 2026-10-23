/**
 * Pi's ExtensionUIContext contract (upstream core/extensions/types.ts): the framework's
 * Marker area and operator notices use the extension UI surface, not interactive-mode internals.
 *
 * These effects share the native UI/hasUI contract, not State or model-message persistence.
 * Marker composition and resource ownership remain with the framework's process-wide area;
 * Pi publishes no Viewed-session outlet, so its existing delivery-position projection is unchanged.
 */
import type { FeedbackLevel, FeedbackTransport } from "../../../../../framework/interface/feedback";
import type { MarkerTransport, NoticeTransport } from "../../../../../framework/runtime/port";
import type { PiExtensionContext } from "./types";

/** One line on the session's UI, or stderr when it has no UI. Neither enters model context. */
function publishNotice(ctx: PiExtensionContext, level: FeedbackLevel, message: string): void {
	if (ctx.hasUI) ctx.ui.notify(message, level);
	else process.stderr.write(`${message}\n`);
}

/** The severity chosen by an extension, mapped to Pi's notification surface. */
export function feedbackTransport(ctx: PiExtensionContext): FeedbackTransport {
	return { notify: (level, message) => publishNotice(ctx, level, message) };
}

/** Framework notices use the same native channel at warning severity. */
export function noticeTransport(ctx: PiExtensionContext): NoticeTransport {
	return { warn: message => publishNotice(ctx, "warning", message) };
}

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
