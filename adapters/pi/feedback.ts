/**
 * pi's public effects: the UI channels an extension's feedback, notices and markers are drawn
 * through. Branch persistence belongs to the binding's shared native context.
 *
 * These are native effects, not framework policy: each one maps one transport to the host operation
 * pi documents for it, and a surface without UI answers on the process's diagnostic stream exactly
 * as before. Nothing here decides what is worth saying.
 */
import type {
	FeedbackLevel,
	MarkerTransport,
	NoticeTransport,
	FeedbackTransport,
} from "../../framework/core/protocol";
import type { PiExtensionContext } from "./native";

/** One diagnostic or feedback line, on the host's UI when it has one and on stderr otherwise. */
export function publishNotice(ctx: PiExtensionContext, level: FeedbackLevel, message: string): void {
	if (ctx.hasUI) ctx.ui.notify(message, level);
	else process.stderr.write(`${message}\n`);
}

/** The transports one delivery's context answers on. */
export interface PiFeedbackChannels {
	readonly feedback: FeedbackTransport;
	readonly notices: NoticeTransport;
	readonly markers: MarkerTransport;
}

/** The transports one delivery's context answers on, drawn on the host's own UI surface. */
export function feedbackChannelsOf(ctx: PiExtensionContext): PiFeedbackChannels {
	return {
		feedback: { notify: (level, message) => publishNotice(ctx, level, message) },
		notices: { warn: message => publishNotice(ctx, "warning", message) },
		markers: {
			publishMarkers: lines => {
				if (ctx.hasUI) {
					ctx.ui.setWidget("semantic-extensions", lines.length ? [...lines] : undefined, {
						placement: "aboveEditor",
					});
				}
			},
		},
	};
}


