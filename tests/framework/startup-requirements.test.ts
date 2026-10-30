/**
 * Normal startup carries no harness-compatibility gate (P60; contract S1, S5).
 *
 * The approved policy
 * ([harness-support.md § Independent compatibility verification](../../framework/docs/harness-support.md#independent-compatibility-verification))
 * replaced startup version membership and native-interface shape checks with separately executed
 * verification and scoped reports. Source-derived integration contracts remain development and
 * verification inputs, never runtime switches, refusals or fallback routes. What startup keeps
 * is what it always owed an extension: its declared configuration is validated
 * before anything registers, an implementation that cannot be built is refused whole, and the
 * harness keeps running.
 *
 * The seam is the framework's adapter contract: a definition, the native surface the loader hands
 * its factory, and the port the framework registers and reports through. The surface double below
 * is the loader's own surface narrowed to the members this adapter uses, so the facts under test
 * are facts a real session meets. Versions and surfaces are independent inputs of this suite: the
 * recorded supported version comes from the repository's own support record, and the foreign one
 * is a literal chosen here — never a value read back from the framework.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import connectBot from "../../entrypoints/omp/connect-bot";
import { CONNECT_BOT } from "../../extensions/connect-bot/definition";
import { CODEBASE_TOOLS } from "../../extensions/codebase-tools/definition";
import type {
	OmpExtensionApi,
	OmpExtensionFactory,
	OmpRunInitiationHandler,
	OmpRunInitiationResult,
	OmpSessionContext,
	OmpSessionEvent,
	OmpSessionEventType,
} from "../../adapters/omp";
import * as frameworkOmp from "../../adapters/omp";
import type { BindingResult } from "../../framework/runtime/port";
import type { ExtensionDefinition } from "../../framework/interface";
import { readBaselineRecord } from "../harness-dock/baseline";
import { withCapturedStderr } from "./support/captured-stderr";
import { portDouble } from "./support/harness-port-double";

/**
 * The version the repository's support record lists. The *record* is an independent source of the
 * supported combination; this suite asserts the version is not judged at startup, not that it is
 * an input to any decision.
 */
const RECORDED_SUPPORTED_VERSION = readBaselineRecord().harness.supportedVersion;

/**
 * A version independently specified to sit outside that record: no startup code may compare a
 * reported version against the record — or against anything else — so this is simply another
 * string the surface reports.
 */
const FOREIGN_HARNESS_VERSION = "0.0.0-not-a-supported-version";

/** The native surface one double models, and what it records. */
interface SurfaceOptions {
	/** The version the injected SDK namespace reports; omitted models a surface that reports none. */
	readonly version?: string;
	/** Models a surface with no lifecycle subscription (`on`) at all. */
	readonly withoutSubscription?: boolean;
	/** Models a surface with no append-only recording path (`appendEntry`). */
	readonly withoutAppendPath?: boolean;
	/** `false` models a session without a UI, where feedback falls back to stderr. */
	readonly hasUI?: boolean;
}

interface SurfaceDouble {
	readonly api: OmpExtensionApi;
	/** Labels the framework set, in call order. */
	readonly labels: readonly string[];
	/** Commands the framework registered, in call order. */
	readonly commands: readonly string[];
	/** UI notifications in call order, whether or not the surface carries a UI. */
	readonly notifications: ReadonlyArray<{ readonly message: string; readonly type: string | undefined }>;
	/** Appended session entries: a startup judgement must never write one. */
	readonly appended: ReadonlyArray<{ readonly customType: string; readonly data: unknown }>;
	/** Binds a definition through one reused factory, as one process binds one assembly. */
	bind(definition: ExtensionDefinition): BindingResult;
	/** Delivers one main-session boundary for `sessionId`. */
	deliverMain(sessionId: string, event?: OmpSessionEventType): void;
	/** Delivers one run initiation for a main session; what the run hook committed. */
	deliverRun(sessionId: string): OmpRunInitiationResult | undefined;
}

function surfaceDouble(options: SurfaceOptions = {}): SurfaceDouble {
	const labels: string[] = [];
	const commands: string[] = [];
	const notifications: Array<{ message: string; type: string | undefined }> = [];
	const appended: Array<{ customType: string; data: unknown }> = [];
	const sessionHandlers: Array<{
		readonly event: string;
		readonly handler: (event: OmpSessionEvent, ctx: OmpSessionContext) => void;
	}> = [];
	const runHandlers: OmpRunInitiationHandler[] = [];
	const factories = new Map<string, OmpExtensionFactory>();

	const contextOf = (sessionId: string): OmpSessionContext => ({
		agent: { kind: "main", id: "Main" },
		sessionManager: { getSessionId: () => sessionId, getBranch: () => [] },
		hasUI: options.hasUI ?? true,
		ui: {
			notify: (message: string, type?: "info" | "warning" | "error") => {
				notifications.push({ message, type });
			},
			setWidget: () => {},
		},
	});

	const base: OmpExtensionApi = {
	registerTool() {},
	setLabel(label: string): void {
			labels.push(label);
		},
		registerCommand(name: string): void {
			commands.push(name);
		},
		appendEntry(customType: string, data?: unknown): void {
			appended.push({ customType, data });
		},
		on(event: string, handler: never): void {
			if (event === "before_agent_start") runHandlers.push(handler as OmpRunInitiationHandler);
			else if (event !== "agent_start" && event !== "agent_end")
				sessionHandlers.push({
					event,
					handler: handler as (event: OmpSessionEvent, ctx: OmpSessionContext) => void,
				});
		},
		pi: { AgentRegistry: undefined },
}
	const withoutSubscription = options.withoutSubscription
		? ({ ...base, on: undefined } as unknown as OmpExtensionApi)
		: base;
	const api = options.withoutAppendPath
		? ({ ...withoutSubscription, appendEntry: undefined } as unknown as OmpExtensionApi)
		: withoutSubscription;
	// The real loader's surface carries its own version constant in the SDK namespace. This double
	// models that whole surface rather than the narrowed type the adapter names, so the fact is
	// really present on the surface — and nothing in the framework reads it.
	const reportedApi =
		options.version === undefined
			? api
			: ({ ...api, pi: { ...api.pi, VERSION: options.version } } as OmpExtensionApi);

	return {
		api: reportedApi,
		labels,
		commands,
		notifications,
		appended,
		bind(definition) {
			let factory = factories.get(definition.id);
			if (factory === undefined) {
				factory = frameworkOmp.ompAdapter(definition);
				factories.set(definition.id, factory);
			}
			return factory(reportedApi);
		},
		deliverMain(sessionId, event = "session_start") {
			for (const registration of sessionHandlers) {
				if (registration.event !== event) continue;
				registration.handler({ type: event }, contextOf(sessionId));
			}
		},
		deliverRun(sessionId) {
			for (const handler of runHandlers) {
				const result = handler({ type: "before_agent_start" }, contextOf(sessionId));
				if (result instanceof Promise) throw new Error("the run hook waited for an initialization");
				if (result !== undefined) return result;
			}
			return undefined;
		},
	};
}

describe("normal startup performs no version membership judgement (P60)", () => {
	test("a version outside the recorded support set binds and is reported on no channel", () => {
		// The independent inputs: what the surface reports, and what the support record lists.
		expect(FOREIGN_HARNESS_VERSION).not.toBe(RECORDED_SUPPORTED_VERSION);
		const double = surfaceDouble({ version: FOREIGN_HARNESS_VERSION });

		const { stderr, value: result } = withCapturedStderr(() => {
			const bound = double.bind(CODEBASE_TOOLS);
			double.deliverMain("version-foreign-session");
			double.deliverMain("version-foreign-session", "session_switch");
			return bound;
		});

		// Bound and usable: the extension is labeled, its command registered and its
		// contribution hook subscribed, exactly as on any other surface.
		expect(result.bound).toBe(true);
		expect(double.labels).toEqual(["codeBaseTools"]);
		expect(double.commands).toEqual(["codebase-tools"]);
		expect(double.notifications).toEqual([]);
		expect(stderr).toBe("");
		// No version judgement reached the session, the conversation or the run: a startup gate
		// that has something to say would have said it on one of these.
		expect(double.appended).toEqual([]);
		const contribution = double.deliverRun("version-foreign-session");
		expect(JSON.stringify(contribution ?? null)).not.toContain(FOREIGN_HARNESS_VERSION);
		expect(JSON.stringify(contribution ?? null)).not.toContain(RECORDED_SUPPORTED_VERSION);
	});

	test("a surface that reports no version at all is not judged either", () => {
		const double = surfaceDouble();

		const { stderr, value: result } = withCapturedStderr(() => {
			const bound = double.bind(CODEBASE_TOOLS);
			double.deliverMain("version-unreported-session");
			return bound;
		});

		expect(result.bound).toBe(true);
		expect(double.commands).toEqual(["codebase-tools"]);
		expect(double.notifications).toEqual([]);
		expect(stderr).toBe("");
	});
});

describe("normal startup performs no native-interface shape judgement (P60)", () => {
	test("a surface without the append-only recording path still binds and registers", () => {
		const double = surfaceDouble({ withoutAppendPath: true });

		const { stderr, value: result } = withCapturedStderr(() => {
			const bound = double.bind(CODEBASE_TOOLS);
			double.deliverMain("shape-no-append-session");
			return bound;
		});

		// The framework binds what the harness gives it and reports its own failures when an
		// operation really fails; the absence of a native member is a fact of that harness's
		// verification, not a startup refusal.
		expect(result.bound).toBe(true);
		expect(double.labels).toEqual(["codeBaseTools"]);
		expect(double.commands).toEqual(["codebase-tools"]);
		expect(double.notifications).toEqual([]);
		expect(stderr).toBe("");
	});

	test("a native registration failure is reported without a compatibility verdict", () => {
		// This surface cannot subscribe at all. Startup reports the operation's real failure,
		// rather than introducing a separate source-analysis or compatibility gate.
		const double = surfaceDouble({ version: RECORDED_SUPPORTED_VERSION, withoutSubscription: true });

		// The entrypoint is a loader door: it is called for effect, so what the binding concluded
		// is read from what it registered and from what it reported.
		const { stderr } = withCapturedStderr(() => {
			connectBot(double.api);
			double.deliverMain("shape-declared-session");
		});

		// Registration began — the label is set — and then failed on the member this surface really
		// lacks, before any command was registered.
		expect(double.labels).toEqual(["connectBot"]);
		expect(double.commands).toEqual([]);
		expect(stderr).toContain("registration failed");
		expect(stderr).not.toContain("required semantics");
		expect(double.notifications).toEqual([]);
	});
});

describe("what startup still owes an extension (P60)", () => {
	test("an illegal declared configuration is refused before anything registers", () => {
		const repository = mkdtempSync(path.join(tmpdir(), "startup-requirements-"));
		try {
			// The definition declares a configuration and the directory it resolves against holds
			// no such file: this is the configuration handling startup still performs.
			const definition = {
				id: "requirements-config",
				displayName: "requirements-config",
				config: { fields: { endpoint: "non-empty-string" } },
			} as unknown as ExtensionDefinition;
			const double = surfaceDouble({ version: RECORDED_SUPPORTED_VERSION });

			const { stderr, value: result } = withCapturedStderr(() =>
				frameworkOmp.ompAdapter(definition, { configBaseDir: repository })(double.api),
			);

			expect(result.bound).toBe(false);
			expect(result.bound ? [] : result.failures.map(failure => failure.kind)).toEqual(["configuration"]);
			// Nothing of the extension is registered, and the failure is reported once.
			expect(double.labels).toEqual([]);
			expect(double.commands).toEqual([]);
			expect(stderr.split("\n").filter(line => line.includes(definition.id))).toHaveLength(1);
		} finally {
			rmSync(repository, { recursive: true, force: true });
		}
	});

	test("a declaration whose implementation cannot be built is refused whole with one report", () => {
		const port = portDouble();

		// connect-bot declares a directed command; the assembly injected no implementation for it,
		// which is a business failure the framework has always refused.
		const result = port.bind(CONNECT_BOT);

		expect(result.bound).toBe(false);
		expect(result.bound ? [] : result.failures.map(failure => failure.kind)).toEqual(["initialization"]);
		expect(port.registrations).toEqual([]);
		expect(port.diagnostics).toHaveLength(1);
		expect(() => port.run("connect-bot")).toThrow();
	});

	test("binding still registers only: no command runs, no entry is written, no area is rendered", () => {
		const double = surfaceDouble({ version: RECORDED_SUPPORTED_VERSION });

		const result = double.bind(CODEBASE_TOOLS);

		expect(result.bound).toBe(true);
		expect(double.labels).toEqual(["codeBaseTools"]);
		expect(double.commands).toEqual(["codebase-tools"]);
		// A binding is not a compatibility self-test: nothing ran, nothing was written and
		// nothing was rendered merely because the extension bound.
		expect(double.appended).toEqual([]);
		expect(double.notifications).toEqual([]);
		const contribution = double.deliverRun("binding-registers-only");
		expect(contribution).toBeUndefined();
	});
});


