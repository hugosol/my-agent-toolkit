/**
 * The unified extension feedback channel as the OMP adapter maps it (S2 native mapping;
 * F10, F11, F14; contract P16, P17).
 *
 * The seam is the narrow native surface the loader hands the factory, exactly as in
 * `control.test.ts`: the double stands in for the loader and builds the session context a
 * command handler receives, so every severity can be observed on both native feedback
 * channels — a UI notification carrying the severity the extension chose, and one stderr
 * line when the session has no UI — and the `hasUI` fact shared extension logic gates on
 * can be read from the delivery the handler was given. The framework's own notice wrapper
 * is driven through the same context, so the one actual output both channels share is
 * observed rather than inferred from the two names.
 */
import { describe, expect, test } from "bun:test";
import { CODEBASE_TOOLS } from "../../extensions/codebase-tools/definition";
import type {
	OmpCommandContext,
	OmpExtensionApi,
	OmpRoundEventType,
	OmpRunInitiationHandler,
	OmpRunInitiationResult,
	OmpSessionEventType,
} from "../../adapters/omp";
import * as frameworkOmp from "../../adapters/omp";
import { feedbackTransport, noticeTransport } from "../../adapters/omp/domain/feedback";
import type { CommandDelivery } from "../../framework/interface/command";
import { defineExtension, defineImplementation } from "../../framework/interface";

/** A definition whose whole behavior is one directed command the assembly implements. */
const PROBE = defineExtension({
	id: "feedback-probe",
	displayName: "feedback-probe",
	commands: [{ type: "directed", name: "feedback-probe", state: "enabled" }],
	// One slot, so a run initiation has a contribution to hand the model: what the probe
	// published must not be in it.
	prompts: [{ tag: "instructions", strategy: "every-enabled-run", content: "feedback-probe instructions" }],
});

interface Registration {
	readonly description?: string;
	readonly handler: (args: string, ctx: OmpCommandContext) => void | Promise<void>;
}

/** The native surface a loader hands the factory, recording what the framework published. */
interface NativeDouble {
	readonly api: OmpExtensionApi;
	/** UI notifications in call order, each with the severity the extension chose. */
	readonly notifications: ReadonlyArray<{ readonly message: string; readonly type: string | undefined }>;
	/** Session entries the framework appended, in call order. */
	readonly appended: ReadonlyArray<{ readonly customType: string; readonly data: unknown }>;
	/** A command context as the runner builds it: a session identity plus its UI channel. */
	context(sessionId: string, options?: { readonly hasUI?: boolean }): OmpCommandContext;
	run(name: string, ctx: OmpCommandContext): void;
	/** Delivers one run initiation; what the framework committed, as the loader receives it. */
	initiateRun(ctx: OmpCommandContext): OmpRunInitiationResult | undefined;
}

function nativeDouble(): NativeDouble {
	const registrations = new Map<string, Registration>();
	const notifications: Array<{ message: string; type: string | undefined }> = [];
	const appended: Array<{ customType: string; data: unknown }> = [];
	const runHandlers: OmpRunInitiationHandler[] = [];

	const api: OmpExtensionApi = {
		// This suite observes the channels feedback travels; labels and session hooks are
		// covered by their own suites.
		setLabel(): void {},
		registerCommand(name, registration): void {
			registrations.set(name, registration);
		},
		appendEntry(customType: string, data?: unknown): void {
			appended.push({ customType, data });
		},
		on(event: string, handler: never): void {
			if (event === "before_agent_start") runHandlers.push(handler as OmpRunInitiationHandler);
		},
	};

	return {
		api,
		notifications,
		appended,
		context(sessionId, options = {}) {
			return {
				hasUI: options.hasUI ?? true,
				ui: {
					notify: (message: string, type?: "info" | "warning" | "error") => {
						notifications.push({ message, type });
					},
					setWidget: () => {},
				},
				// The command path reads only the identity; the branch stays empty here.
				agent: { kind: "main", id: "Main" },
				sessionManager: { getSessionId: () => sessionId, getBranch: () => [] },
			};
		},
		run(name, ctx) {
			const registration = registrations.get(name);
			if (registration === undefined) throw new Error(`command "${name}" was not registered`);
			registration.handler("", ctx);
		},
		initiateRun(ctx) {
			let contribution: OmpRunInitiationResult | undefined;
			for (const handler of runHandlers) {
				const result = handler(undefined, ctx);
				// This probe declares no initialization, so the framework's run hook settles
				// synchronously; a promise here would mean it started to await one.
				if (result instanceof Promise) throw new Error("the run hook waited for an initialization");
				if (result !== undefined) contribution = result;
			}
			return contribution;
		},
	};
}

/**
 * Binds the probe definition, whose implementation activates the extension and then
 * publishes one notice per severity.
 */
function bindProbe(double: NativeDouble, seenHasUI: boolean[], seenFeedbackKeys: string[][] = []): void {
	const factory = frameworkOmp.ompAdapter(PROBE, {
		implementation: defineImplementation({
			create: () => ({}),
			commands: {
				"feedback-probe": {
					run: (_state, _directive, delivery: CommandDelivery) => {
						seenHasUI.push(delivery.hasUI);
						seenFeedbackKeys.push(Object.keys(delivery.feedback).sort());
						delivery.state.write(true);
						delivery.feedback.notify("info", "probe info");
						delivery.feedback.notify("warning", "probe warning");
						delivery.feedback.notify("error", "probe error");
					},
				},
			},
		}),
	});
	if (!factory(double.api).bound) throw new Error("the feedback probe definition did not bind");
}

/** Binds the codebase-tools definition, whose toggle announces its activation. */
function bindCodebaseTools(double: NativeDouble): void {
	const factory = frameworkOmp.ompAdapter(CODEBASE_TOOLS);
	if (!factory(double.api).bound) throw new Error("the codebase-tools definition did not bind");
}

/** Runs a synchronous bind while capturing the process's non-model fallback channel (stderr). */
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
	test("an info, a warning and an error each arrive as the severity the extension chose", () => {
		const double = nativeDouble();
		const seenFeedbackKeys: string[][] = [];
		bindProbe(double, [], seenFeedbackKeys);

		const { stderr, value: notifications } = withCapturedStderr(() => {
			double.run("feedback-probe", double.context("session-1", { hasUI: true }));
			return double.notifications;
		});

		// The extension's public feedback surface is the one operation: no native context, no
		// framework notice wrapper and no management of the output behind it.
		expect(seenFeedbackKeys).toEqual([["notify"]]);
		expect(notifications).toEqual([
			{ message: "probe info", type: "info" },
			{ message: "probe warning", type: "warning" },
			{ message: "probe error", type: "error" },
		]);
		// A session with a UI gets the notices there and nowhere else: one notice, one channel.
		expect(stderr).toBe("");
	});
});

describe("every severity on a session without a UI (F10, P31)", () => {
	test("the same notices fall back to stderr, whatever their severity", () => {
		const double = nativeDouble();
		bindProbe(double, []);

		const { stderr } = withCapturedStderr(() => {
			double.run("feedback-probe", double.context("headless", { hasUI: false }));
		});

		// The level names how serious a notice is, not which channel carries it: without a UI
		// every line still reaches the operator, one line each.
		expect(stderr).toBe("probe info\nprobe warning\nprobe error\n");
		expect(double.notifications).toEqual([]);
	});
});

describe("the framework's own notices and extension feedback share one actual output (P32)", () => {
	test("both reach the same UI notification, each at the severity it carries", () => {
		const double = nativeDouble();
		const ctx = double.context("session-1", { hasUI: true });
		const { stderr } = withCapturedStderr(() => {
			noticeTransport(ctx).warn("framework notice");
			feedbackTransport(ctx).notify("warning", "extension warning");
		});

		// Two upper-level responsibilities, one output: the framework's notice is a warning
		// notification and the extension's warning is the same notification at the same severity.
		expect(double.notifications).toEqual([
			{ message: "framework notice", type: "warning" },
			{ message: "extension warning", type: "warning" },
		]);
		expect(stderr).toBe("");
	});

	test("both fall back to the same stderr line when the session has no UI", () => {
		const double = nativeDouble();
		const ctx = double.context("headless", { hasUI: false });
		const { stderr } = withCapturedStderr(() => {
			noticeTransport(ctx).warn("framework notice");
			feedbackTransport(ctx).notify("warning", "extension warning");
		});

		expect(stderr).toBe("framework notice\nextension warning\n");
		expect(double.notifications).toEqual([]);
	});
});

describe("the hasUI fact the delivery carries (F11)", () => {
	test("a command delivery reports the session's own fact in both harness states", () => {
		const double = nativeDouble();
		const seenHasUI: boolean[] = [];
		bindProbe(double, seenHasUI);

		double.run("feedback-probe", double.context("session-1", { hasUI: true }));
		// The headless run's notices fall back to stderr; its channel is asserted above.
		withCapturedStderr(() => {
			double.run("feedback-probe", double.context("headless", { hasUI: false }));
		});

		// Neither a constant nor a guess: the fact comes from the session the command ran in,
		// and it is the same fact the mapping above branches on.
		expect(seenHasUI).toEqual([true, false]);
	});
});

describe("the toggle's moved feedback (F14)", () => {
	test("its text is unchanged and it goes out at info severity", () => {
		const double = nativeDouble();
		bindCodebaseTools(double);

		double.run("codebase-tools", double.context("session-1", { hasUI: true }));

		expect(double.notifications).toEqual([{ message: "codeBaseTools enabled", type: "info" }]);
	});
});

describe("a notice is never model context (P16)", () => {
	test("what was published stays out of the session entries and out of the run's contribution", () => {
		const double = nativeDouble();
		bindProbe(double, []);
		const ctx = double.context("session-1", { hasUI: true });
		// The probe activates itself, so the run below has an enabled owner to contribute for.
		double.run("feedback-probe", ctx);

		const contribution = double.initiateRun(ctx);

		// The notices went out on the operator's channel, all of them.
		expect(double.notifications.map(notification => notification.message)).toEqual([
			"probe info",
			"probe warning",
			"probe error",
		]);
		// The only entry the extension wrote is its declared State value: a persisted record
		// is history the model can read, so a notice must never become one.
		expect(double.appended).toEqual([{ customType: "feedback-probe:state", data: { enabled: true } }]);
		expect(JSON.stringify(double.appended)).not.toContain("probe info");
		expect(JSON.stringify(double.appended)).not.toContain("probe warning");
		expect(JSON.stringify(double.appended)).not.toContain("probe error");
		// And what a run hands the model is the extension's declared prompt text, nothing else.
		expect(contribution?.message.content).toBe("feedback-probe instructions");
		expect(JSON.stringify(contribution ?? null)).not.toContain("probe info");
		expect(JSON.stringify(contribution ?? null)).not.toContain("probe warning");
		expect(JSON.stringify(contribution ?? null)).not.toContain("probe error");
	});
});
