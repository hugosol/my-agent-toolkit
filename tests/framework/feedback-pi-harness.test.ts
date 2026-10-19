/**
 * The unified extension feedback channel as the pi adapter maps it (S2 native mapping;
 * F10, P31, P32).
 *
 * The seam is the pi surface a loader hands the adapter: a session starts through it, and the
 * delivery the framework dispatched carries the adapter's actual feedback transport. Calling
 * that transport is what an extension does, so its output is observed on the native channel the
 * host would show — a UI notification at the level the extension stated, or one stderr line when
 * the session has no UI. The framework's own notice wrapper is driven through the same adapter
 * output, so the one implementation both upper-level responsibilities share is observed rather
 * than inferred from two names.
 */
import { describe, expect, test } from "bun:test";
import type { FeedbackLevel } from "../../framework/interface/feedback";
import type { PiExtensionContext } from "../../adapters/pi";
import { feedbackTransport, noticeTransport } from "../../adapters/pi/domain/feedback";
import { type PiSurfaceSession, boundPiSurface } from "./support/pi-surface-double";

/** The session a case starts; `hasUI` defaults to the host's own `true`. */
function session(hasUI: boolean): PiSurfaceSession {
	return { sessionId: "pi-feedback-session", name: "pi feedback session", hasUI };
}

/** Runs a synchronous call while capturing the process's non-model fallback channel (stderr). */
function withCapturedStderr<T>(run: () => T): { readonly stderr: string; readonly value: T } {
	const chunks: string[] = [];
	const original = process.stderr.write;
	process.stderr.write = ((chunk: string | Uint8Array) => {
		chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
		return true;
	}) as typeof process.stderr.write;
	try {
		const value = run();
		return { stderr: chunks.join(""), value };
	} finally {
		process.stderr.write = original;
	}
}

describe("every severity on a session with a UI (F10, P31)", () => {
	test("the delivery's transport notifies at info, warning and error, and nowhere else", () => {
		const feedbackKeys: string[][] = [];
		const surface = boundPiSurface({
			// The delivery's feedback is dispatch-scoped, so it is driven while the handler runs.
			onSession: delivery => {
				feedbackKeys.push(Object.keys(delivery.feedback).sort());
				delivery.feedback.notify("info", "pi info");
				delivery.feedback.notify("warning", "pi warning");
				delivery.feedback.notify("error", "pi error");
			},
		});
		const { stderr } = withCapturedStderr(() => {
			surface.sessionStarts(session(true), "startup");
		});

		// The extension's public feedback surface is the one operation, not a native context or
		// the framework's internal notice channel.
		expect(feedbackKeys).toEqual([["notify"]]);
		expect(surface.notices).toEqual([
			{ level: "info", message: "pi info" },
			{ level: "warning", message: "pi warning" },
			{ level: "error", message: "pi error" },
		]);
		// One notice, one channel; and no notice became a recorded entry.
		expect(stderr).toBe("");
		expect(surface.entries).toEqual([]);
	});
});

describe("every severity on a session without a UI (F10, P31)", () => {
	test("the same transport falls back to one stderr line per notice", () => {
		const surface = boundPiSurface({
			onSession: delivery => {
				delivery.feedback.notify("info", "pi info");
				delivery.feedback.notify("warning", "pi warning");
				delivery.feedback.notify("error", "pi error");
			},
		});
		const { stderr } = withCapturedStderr(() => {
			surface.sessionStarts(session(false), "startup");
		});

		expect(stderr).toBe("pi info\npi warning\npi error\n");
		expect(surface.notices).toEqual([]);
		expect(surface.entries).toEqual([]);
	});
});

describe("the framework's own notices and extension feedback share one actual output (P32)", () => {
	test("both reach the same UI notification and the same stderr fallback", () => {
		const notifications: Array<{ readonly message: string; readonly level: FeedbackLevel | undefined }> = [];
		const context = {
			hasUI: true,
			ui: {
				notify: (message: string, level?: FeedbackLevel) => void notifications.push({ message, level }),
				setWidget: () => {},
			},
		} as unknown as PiExtensionContext;

		noticeTransport(context).warn("framework notice");
		feedbackTransport(context).notify("warning", "extension warning");

		expect(notifications).toEqual([
			{ message: "framework notice", level: "warning" },
			{ message: "extension warning", level: "warning" },
		]);

		const headless = { ...context, hasUI: false } as PiExtensionContext;
		const { stderr } = withCapturedStderr(() => {
			noticeTransport(headless).warn("framework notice");
			feedbackTransport(headless).notify("warning", "extension warning");
		});
		expect(stderr).toBe("framework notice\nextension warning\n");
	});
});
