/**
 * OMP feedback channels: the operator-facing notice and extension-feedback transports of one
 * session.
 *
 * Both channels are outside model context — this is feedback for the operator, never an injected
 * prompt, a conversation entry or tool output — so the framework's own notices (a warning) and an
 * extension's feedback (any of the three severities) travel the same actual output and differ only
 * in the severity the UI shows. Their upper-level responsibilities and lifetimes stay distinct; this
 * module decides neither what to say nor when.
 */
import type { FeedbackLevel, FeedbackTransport } from "../../../../../framework/interface/feedback";
import type { NoticeTransport } from "../../../../../framework/runtime/port";
import type { OmpSessionContext } from "./types";

/**
 * Publishes one operator-facing line on the session's own channel: the UI notification
 * when the session has a UI, and one stderr line when it does not. Both transports in this
 * module reach this one function, so the framework notice and extension feedback cannot
 * drift into two different outputs.
 */
function publishNotice(ctx: OmpSessionContext, level: FeedbackLevel, message: string): void {
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
