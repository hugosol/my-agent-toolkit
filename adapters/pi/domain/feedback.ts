/**
 * pi's Extension feedback and framework notices: operator-facing native notifications,
 * with stderr when UI is absent. Both transports below reach the one `publishNotice`
 * implementation, so the framework notice and extension feedback cannot drift into two
 * different outputs; their upper-level responsibilities and lifetimes stay distinct.
 * Marker area effects belong to `marker.ts` and State persistence belongs to
 * `session/effects.ts`; none of these channels enters model context.
 */
import type { FeedbackLevel, FeedbackTransport } from "../../../framework/interface/feedback";
import type { NoticeTransport } from "../../../framework/runtime/port";
import type { PiExtensionContext } from "../internal/native";

/** One line on the session's UI, or stderr when it has no UI. */
function publishNotice(ctx: PiExtensionContext, level: FeedbackLevel, message: string): void {
	if (ctx.hasUI) ctx.ui.notify(message, level);
	else process.stderr.write(`${message}\n`);
}

/** The severity chosen by an extension, mapped to pi's notification surface. */
export function feedbackTransport(ctx: PiExtensionContext): FeedbackTransport {
	return { notify: (level, message) => publishNotice(ctx, level, message) };
}

/** Framework notices use the same native channel at warning severity. */
export function noticeTransport(ctx: PiExtensionContext): NoticeTransport {
	return { warn: message => publishNotice(ctx, "warning", message) };
}
