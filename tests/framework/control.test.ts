/**
 * The framework's control behavior at the public adapter seam (S2; C2, C5).
 *
 * A declarative toggle command is bound through `ompAdapter`, and the write path it
 * must uphold is observed end to end: the command transitions the owner's State, the
 * new value is recorded best-effort, and feedback derived from that value is
 * published. The harness side of the seam is the narrow native surface the
 * loader hands the factory, so a test double stands in for the loader — it records the
 * registrations and effects — and each test drives the registered command with a
 * double command context, exactly as the runner would.
 */
import { describe, expect, test } from "bun:test";
import type { OmpCommandContext, OmpExtensionApi } from "../../adapters/omp";
import * as frameworkOmp from "../../adapters/omp";
import type { StateValues } from "../../framework/core/protocol";
import { StateStore } from "../../framework/core/state";
import { CODEBASE_TOOLS } from "../../extensions/codebase-tools/definition";

const STATE_ENTRY_TYPE = "codebase-tools:state";

interface Registration {
	readonly description?: string;
	readonly handler: (args: string, ctx: OmpCommandContext) => void | Promise<void>;
}

/** The native surface a loader hands the factory, recording registrations and effects. */
interface NativeDouble {
	readonly api: OmpExtensionApi;
	readonly labels: string[];
	/** Registered command names, in registration order. */
	commandNames(): string[];
	/** Appended entries in call order. */
	readonly appended: ReadonlyArray<{ readonly customType: string; readonly data: unknown }>;
	/** Feedback messages in call order. */
	readonly notifications: string[];
	/** Effect labels in call order (`persist` / `notify`), for the write-path order. */
	readonly effects: string[];
	/** A command context as the runner builds it: a session identity plus its UI channel. */
	context(sessionId: string, options?: { readonly kind?: "main" | "sub"; readonly hasUI?: boolean }): OmpCommandContext;
	run(name: string, ctx: OmpCommandContext): void;
}

/** Records every registered command and every effect; `failAppend` models a lost write. */
function nativeDouble(options: { readonly failAppend?: boolean } = {}): NativeDouble {
	const labels: string[] = [];
	const registrations = new Map<string, Registration>();
	const appended: Array<{ customType: string; data: unknown }> = [];
	const notifications: string[] = [];
	const effects: string[] = [];

	const api: OmpExtensionApi = {
		setLabel(label: string): void {
			labels.push(label);
		},
		registerCommand(name, registration): void {
			registrations.set(name, registration);
		},
		appendEntry(customType: string, data?: unknown): void {
			effects.push("persist");
			if (options.failAppend) throw new Error("the persistence medium refused the write");
			appended.push({ customType, data });
		},
		// Binding subscribes the session behavior here; this suite drives commands only.
		on(): void {},
	};

	return {
		api,
		labels,
		commandNames: () => [...registrations.keys()],
		appended,
		notifications,
		effects,
		context(sessionId, contextOptions = {}) {
			const kind = contextOptions.kind ?? "main";
			return {
				hasUI: contextOptions.hasUI ?? true,
				ui: {
					notify: (message: string) => {
						effects.push("notify");
						notifications.push(message);
					},
					setWidget: () => {
						effects.push("marker");
					},
				},
				// The registry label is deliberately identical for every main session: the
				// owner key must come from the session identity, not from this label.
				agent: { kind, id: kind === "main" ? "Main" : "0-Explore" },
				// The command path reads only the identity; the branch stays empty here.
				sessionManager: { getSessionId: () => sessionId, getBranch: () => [] },
			};
		},
		run(name: string, ctx: OmpCommandContext): void {
			const registration = registrations.get(name);
			if (registration === undefined) throw new Error(`command "${name}" was not registered`);
			registration.handler("", ctx);
		},
	};
}

/** Binds the codebase-tools definition to the double. */
function bindCodebaseTools(double: NativeDouble): void {
	const factory = frameworkOmp.ompAdapter(CODEBASE_TOOLS);
	const result = factory(double.api);
	if (!result.bound) throw new Error("the codebase-tools definition did not bind");
}

/** Runs a synchronous bind while capturing the process's non-model channel (stderr). */
function withCapturedStderr<T>(run: () => T): { readonly diagnostics: string; readonly value: T } {
	const chunks: string[] = [];
	const original = process.stderr.write;
	process.stderr.write = ((chunk: string | Uint8Array) => {
		chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
		return true;
	}) as typeof process.stderr.write;
	try {
		const value = run();
		return { diagnostics: chunks.join(""), value };
	} finally {
		process.stderr.write = original;
	}
}

describe("toggle command end to end (P11, P12)", () => {
	test("binding registers the declared command and nothing else", () => {
		const double = nativeDouble();
		bindCodebaseTools(double);

		expect(double.labels).toEqual(["codeBaseTools"]);
		expect(double.commandNames()).toEqual(["codebase-tools"]);
	});

	test("each toggle records the new value and announces it, alternating between runs", () => {
		const double = nativeDouble();
		bindCodebaseTools(double);
		const ctx = double.context("session-1");

		double.run("codebase-tools", ctx);
		double.run("codebase-tools", ctx);

		// The persisted record is the extension's declared State field, one entry per change.
		expect(double.appended).toEqual([
			{ customType: STATE_ENTRY_TYPE, data: { enabled: true } },
			{ customType: STATE_ENTRY_TYPE, data: { enabled: false } },
		]);
		// Feedback is derived from the value the transition produced.
		expect(double.notifications).toEqual(["codeBaseTools enabled", "codeBaseTools disabled"]);
	});
});

describe("deterministic write path (C5)", () => {
	test("persistence is attempted before the marker and feedback, and the record carries the new value", () => {
		const double = nativeDouble();
		bindCodebaseTools(double);

		double.run("codebase-tools", double.context("session-1"));

		expect(double.effects).toEqual(["persist", "marker", "notify"]);
		// The transition already holds when the record is written: the persisted value
		// is the new one, not the value before the command.
		expect(double.appended[0]?.data).toEqual({ enabled: true });
	});

	test("feedback goes to stderr when the session has no UI, and the command still completes", () => {
		const double = nativeDouble();
		bindCodebaseTools(double);

		const { diagnostics } = withCapturedStderr(() => {
			double.run("codebase-tools", double.context("headless", { hasUI: false }));
		});

		// No UI is not a failure: the value is still recorded and the user sees the line.
		expect(diagnostics).toBe("codeBaseTools enabled\n");
		expect(double.notifications).toEqual([]);
		expect(double.appended).toEqual([{ customType: STATE_ENTRY_TYPE, data: { enabled: true } }]);
	});
});

describe("best-effort persistence (N3, P6)", () => {
	test("a failed record does not change the feedback or the authoritative current value", () => {
		const double = nativeDouble({ failAppend: true });
		bindCodebaseTools(double);
		const ctx = double.context("session-1");

		// A persistence failure is hidden from the extension: no throw, feedback still out.
		double.run("codebase-tools", ctx);
		// The command's current value advanced in memory, so the next toggle flips from it
		// even though no record survived either attempt.
		double.run("codebase-tools", ctx);

		expect(double.notifications).toEqual(["codeBaseTools enabled", "codeBaseTools disabled"]);
		expect(double.appended).toEqual([]);
		// The refused record did not stop the rest of the write path: the marker and the
		// feedback that follow it still ran, in their existing order.
		expect(double.effects).toEqual(["persist", "marker", "notify", "persist", "marker", "notify"]);
	});
});

describe("owner-scoped State (C2)", () => {
	test("two sessions keep independent values even though they share the registry label", () => {
		const double = nativeDouble();
		bindCodebaseTools(double);

		// Both contexts report agent id "Main"; only the session identity differs.
		double.run("codebase-tools", double.context("session-1"));
		double.run("codebase-tools", double.context("session-2"));

		// Each session starts from the default and reaches `enabled` on its own: a shared
		// cell keyed by the label would make the second run report `disabled`.
		expect(double.notifications).toEqual(["codeBaseTools enabled", "codeBaseTools enabled"]);
		expect(double.appended.map(entry => entry.data)).toEqual([{ enabled: true }, { enabled: true }]);
	});
});

describe("State read and write surfaces (C2)", () => {
	test("a write through the declared-value seam updates the owner it names and leaves other owners at the default", () => {
		const store = new StateStore({ field: "enabled", persistence: "session-entry" });

		store.writer({ ownerKey: "owner", persist: () => {}, publishMarker: () => {} }).write(true);

		expect(store.view("owner").read("enabled")).toBe(true);
		expect(store.view("other").read("enabled")).toBe(false);
	});

	test("a marker publication that fails does not roll back the value or its record", () => {
		const store = new StateStore({ field: "enabled", persistence: "session-entry" });
		const persisted: StateValues[] = [];
		const seam = store.writer({
			ownerKey: "owner",
			persist: values => persisted.push(values),
			publishMarker: () => {
				throw new Error("the area transport failed");
			},
		});

		// The write path records before it publishes, so a failed publication surfaces to the
		// caller while the value and the record the write already made stay in place.
		expect(() => seam.write(true)).toThrow("the area transport failed");
		expect(store.view("owner").read("enabled")).toBe(true);
		expect(persisted).toEqual([{ enabled: true }]);
	});
});
