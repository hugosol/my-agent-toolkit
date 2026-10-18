/**
 * OMP feedback channels: the operator-facing notice and extension-feedback transports of one
 * session.
 *
 * Both channels are outside model context — this is feedback for the operator, never an injected
 * prompt, a conversation entry or tool output — so the framework's own notices (a warning) and an
 * extension's feedback (an `info` or an `error`) travel the same way and differ only in the
 * severity the UI shows. Nothing here decides what to say or when; the framework and the extension
 * do.
 */
import type { FeedbackTransport, NoticeTransport } from "../../framework/core/protocol";
import type { OmpSessionContext } from "./internal/native";

/**
 * Publishes one operator-facing line on the session's own channel: the UI notification
 * when the session has a UI, and one stderr line when it does not.
 */
function publishNotice(ctx: OmpSessionContext, level: "info" | "warning" | "error", message: string): void {
	if (ctx.hasUI) ctx.ui.notify(message, level);
	else process.stderr.write(`${message}\n`);
}

/**
 * The notice channel for one session: a warning-level UI notification when the session
 * has a UI, and one stderr line when it does not.
 */
export function noticeTransport(ctx: OmpSessionContext): NoticeTransport {
	return { warn: message => publishNotice(ctx, "warning", message) };
}

/**
 * The extension feedback channel for one session.
 *
 * The level travels to the UI as the severity the extension chose, so an `error` reads as an error
 * and an `info` as information; a session without a UI gets the same message on stderr whatever
 * the level, because a level names how serious a notice is, not which channel it uses.
 */
export function feedbackTransport(ctx: OmpSessionContext): FeedbackTransport {
	return { notify: (level, message) => publishNotice(ctx, level, message) };
}
