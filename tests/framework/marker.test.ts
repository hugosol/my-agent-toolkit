/**
 * The framework's unified marker area at the public adapter seam (S2; P13, P14,
 * B6, C10, N9).
 *
 * The seam is `ompAdapter` plus the narrow native surface the OMP loader hands a
 * factory, here a test double that records the widgets the adapter sets. What the
 * framework decides is observable through that surface alone: which widget key and
 * placement the area uses, which lines it carries, in which order, and whether an
 * update happens at all. A definition supplies only its marker text — the area's
 * identity, placement and ordering are not the extension's to choose.
 *
 * Two extensions are declared out of id order on purpose, so a stable sort is
 * observable rather than incidental.
 */
import { describe, expect, test } from "bun:test";
import type {
	OmpCommandContext,
	OmpExtensionApi,
	OmpRoundEventType,
	OmpRunInitiationResult,
	OmpSessionContext,
	OmpSessionEntry,
	OmpSessionEvent,
	OmpSessionEventType,
} from "../../adapters/omp";
import * as frameworkOmp from "../../adapters/omp";
import { type ExtensionDefinition, defineExtension } from "../../framework/interface";

/**
 * The single native widget key the framework owns for its marker area, and the
 * placement it fixes. Pinned here as the consumer-visible identity of the area: an
 * extension's own id must never become the widget key.
 */
const MARKER_AREA_KEY = "semantic-extensions";
const MARKER_AREA_PLACEMENT = "aboveEditor";

/** One widget the adapter set, in call order. */
interface WidgetCall {
	readonly key: string;
	readonly lines: readonly string[] | undefined;
	readonly placement: string | undefined;
}

type SessionHandler = (event: OmpSessionEvent, ctx: OmpSessionContext) => void;
type RunInitiationHandler = (
	event: unknown,
	ctx: OmpSessionContext,
) => OmpRunInitiationResult | undefined | void;

/** The native surface a loader hands the factory, recording every widget and entry. */
interface NativeDouble {
	readonly api: OmpExtensionApi;
	/** Widget calls in call order, across every binding. */
	readonly widgets: WidgetCall[];
	/** Appended entries in call order; a marker update must never produce one. */
	readonly appended: ReadonlyArray<{ readonly customType: string; readonly data: unknown }>;
	/** Binds one definition through the public adapter, as the loader binds one extension. */
	bind(definition: ExtensionDefinition): void;
	/** Runs one bound toggle command in a session, as a user of that session would. */
	toggle(sessionId: string, command: string): void;
	/** Delivers one run initiation to every bound extension, as the runner does. */
	deliverRun(sessionId: string, branch?: readonly OmpSessionEntry[]): void;
}

/** Records widgets, entries and registrations; `hasUI` models a session with no UI. */
function nativeDouble(options: { readonly hasUI?: boolean } = {}): NativeDouble {
	const hasUI = options.hasUI ?? true;
	const registrations = new Map<string, { readonly handler: (args: string, ctx: OmpCommandContext) => void }>();
	const runHooks: RunInitiationHandler[] = [];
	const widgets: WidgetCall[] = [];
	const appended: Array<{ customType: string; data: unknown }> = [];

	const context = (sessionId: string, branch: readonly OmpSessionEntry[]): OmpSessionContext => ({
		// The registry label is deliberately the same for every session: the owner key comes
		// from the session identity, not from this label.
		agent: { kind: "main", id: "Main" },
		sessionManager: { getSessionId: () => sessionId, getBranch: () => branch },
		hasUI,
		ui: {
			notify(): void {},
			setWidget(key, content, widgetOptions): void {
				widgets.push({ key, lines: content, placement: widgetOptions?.placement });
			},
		},
	});

	const api: OmpExtensionApi = {
		setLabel(): void {},
		registerCommand(name, registration): void {
			registrations.set(name, registration);
		},
		appendEntry(customType: string, data?: unknown): void {
			appended.push({ customType, data });
		},
		on(event: string, handler: never): void {
			if (event === "before_agent_start") runHooks.push(handler as RunInitiationHandler);
		},
	};

	return {
		api,
		widgets,
		appended,
		bind(definition) {
			const factory = frameworkOmp.ompAdapter(definition);
			if (!factory(api).bound) throw new Error(`definition "${definition.id}" did not bind`);
		},
		toggle(sessionId, command) {
			const registration = registrations.get(command);
			if (registration === undefined) throw new Error(`command "${command}" was not registered`);
			registration.handler("", context(sessionId, []));
		},
		deliverRun(sessionId, branch = []) {
			for (const hook of runHooks) hook({ type: "before_agent_start" }, context(sessionId, branch));
		},
	};
}

/** A marker-only extension: no prompt slots, so the area must not depend on them. */
function markerExtension(id: string, text: string): ExtensionDefinition {
	return defineExtension({
		id,
		displayName: id,
		commands: [{ type: "toggle", name: `${id}-toggle`, state: "enabled" }],
		marker: { text },
	});
}

/** A prompt-only extension: declaring no marker must never write the area. */
function promptExtension(id: string): ExtensionDefinition {
	return defineExtension({
		id,
		displayName: id,
		commands: [{ type: "toggle", name: `${id}-toggle`, state: "enabled" }],
		prompts: [{ tag: "only", strategy: "every-enabled-run", content: `${id} prompt` }],
	});
}

const ZZZ = markerExtension("zzz-extension", "◈ zzz");
const AAA = markerExtension("aaa-extension", "◈ aaa");

/** Runs a synchronous action while capturing the process's non-model channel (stderr). */
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

describe("one framework-owned area, sorted by extension id (P13, C10)", () => {
	test("two extensions render under the framework's key, in id order, not declaration order", () => {
		const double = nativeDouble();
		double.bind(ZZZ);
		double.bind(AAA);

		// The zzz extension is bound and enabled first: only a stable sort by id can put aaa first.
		double.toggle("marker-sorted", "zzz-extension-toggle");
		double.toggle("marker-sorted", "aaa-extension-toggle");
		double.deliverRun("marker-sorted");

		expect(double.widgets[double.widgets.length - 1]).toEqual({
			key: MARKER_AREA_KEY,
			lines: ["◈ aaa", "◈ zzz"],
			placement: MARKER_AREA_PLACEMENT,
		});
		// No extension ever chose the widget: every call went to the one framework key.
		expect([...new Set(double.widgets.map(call => call.key))]).toEqual([MARKER_AREA_KEY]);
	});

	test("an extension that declares no marker never writes the area", () => {
		const double = nativeDouble();
		double.bind(promptExtension("no-marker-extension"));

		double.toggle("marker-declaration", "no-marker-extension-toggle");
		double.deliverRun("marker-declaration");

		expect(double.widgets).toEqual([]);
	});
});

describe("State drives the area: show, remove, clear when empty (P13, B6)", () => {
	test("turning one extension off removes only its line; the last off clears the area", () => {
		const double = nativeDouble();
		double.bind(ZZZ);
		double.bind(AAA);

		double.toggle("marker-lifecycle", "aaa-extension-toggle");
		double.toggle("marker-lifecycle", "zzz-extension-toggle");
		double.toggle("marker-lifecycle", "zzz-extension-toggle");
		double.toggle("marker-lifecycle", "aaa-extension-toggle");

		expect(double.widgets).toEqual([
			{ key: MARKER_AREA_KEY, lines: ["◈ aaa"], placement: MARKER_AREA_PLACEMENT },
			{ key: MARKER_AREA_KEY, lines: ["◈ aaa", "◈ zzz"], placement: MARKER_AREA_PLACEMENT },
			{ key: MARKER_AREA_KEY, lines: ["◈ aaa"], placement: MARKER_AREA_PLACEMENT },
			// The area is empty now: the framework clears the widget rather than leaving it empty.
			{ key: MARKER_AREA_KEY, lines: undefined, placement: MARKER_AREA_PLACEMENT },
		]);
	});

	test("two marked extensions and an unmarked consumer coexist, and each step renders exactly its lines", () => {
		const double = nativeDouble();
		double.bind(ZZZ);
		double.bind(AAA);
		double.bind(promptExtension("no-marker-extension"));

		// Binding renders nothing: the area is first drawn by an effect, not by a declaration.
		expect(double.widgets).toEqual([]);

		double.toggle("marker-coexist", "zzz-extension-toggle");
		double.toggle("marker-coexist", "aaa-extension-toggle");
		// The unmarked consumer's own activation writes no area line and no error.
		double.toggle("marker-coexist", "no-marker-extension-toggle");
		// One enabled run re-asserts the once-per-process area: both marked bindings publish the
		// same complete set, and the unmarked one publishes nothing.
		double.deliverRun("marker-coexist");

		// Turning aaa off removes exactly its line; the unmarked consumer is still enabled.
		double.toggle("marker-coexist", "aaa-extension-toggle");
		// Turning zzz off leaves no line at all, so the framework clears the area.
		double.toggle("marker-coexist", "zzz-extension-toggle");
		// Neither of the unmarked consumer's transitions touches the area.
		double.toggle("marker-coexist", "no-marker-extension-toggle");

		expect(double.widgets).toEqual([
			{ key: MARKER_AREA_KEY, lines: ["◈ zzz"], placement: MARKER_AREA_PLACEMENT },
			{ key: MARKER_AREA_KEY, lines: ["◈ aaa", "◈ zzz"], placement: MARKER_AREA_PLACEMENT },
			{ key: MARKER_AREA_KEY, lines: ["◈ aaa", "◈ zzz"], placement: MARKER_AREA_PLACEMENT },
			{ key: MARKER_AREA_KEY, lines: ["◈ aaa", "◈ zzz"], placement: MARKER_AREA_PLACEMENT },
			{ key: MARKER_AREA_KEY, lines: ["◈ zzz"], placement: MARKER_AREA_PLACEMENT },
			{ key: MARKER_AREA_KEY, lines: undefined, placement: MARKER_AREA_PLACEMENT },
		]);
	});

	test("every enabled run re-asserts the area, and an inert run writes nothing at all", () => {
		const double = nativeDouble();
		double.bind(AAA);

		double.toggle("marker-runs", "aaa-extension-toggle");
		double.deliverRun("marker-runs");
		double.deliverRun("marker-runs");
		expect(double.widgets.map(call => call.lines)).toEqual([["◈ aaa"], ["◈ aaa"], ["◈ aaa"]]);

		double.toggle("marker-runs", "aaa-extension-toggle");
		expect(double.widgets[double.widgets.length - 1]?.lines).toBeUndefined();

		// Runs after the transition publish nothing: the area already matches this State, and
		// the renderer never writes State or history of its own.
		const before = double.widgets.length;
		double.deliverRun("marker-runs");
		expect(double.widgets.length).toBe(before);
		expect(double.appended.map(entry => entry.data)).toEqual([{ enabled: true }, { enabled: false }]);
	});
});

describe("a session with no UI (P14, N9)", () => {
	test("marker updates are a whole no-op and the toggle feedback reaches stderr without throwing", () => {
		const double = nativeDouble({ hasUI: false });
		double.bind(AAA);

		const toggled = withCapturedStderr(() => {
			double.toggle("marker-headless", "aaa-extension-toggle");
			double.deliverRun("marker-headless");
		});

		expect(double.widgets).toEqual([]);
		expect(toggled.diagnostics).toBe("aaa-extension enabled\n");
	});
});
