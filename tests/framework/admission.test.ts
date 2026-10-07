/**
 * Version admission and the required-semantics refusal (S2; P24, P25, P26, P27, P28;
 * C13, C14, N1, N2).
 *
 * The seam is the framework's adapter contract: a definition, the facts an adapter
 * resolved about its agent runtime, and the port the framework registers and reports
 * through. Two adapters satisfy it here. The OMP adapter is driven through the narrow
 * native surface the loader hands its factory, so the version and capability facts it
 * resolves are the ones that adapter really reads. A test adapter supplies admission
 * facts directly and records everything the framework asked of it, which is what makes
 * the required-semantics refusal an executed path — a binding really refused, with
 * nothing registered — instead of a check that a reporting channel exists.
 */
import { describe, expect, test } from "bun:test";
import { CODEBASE_TOOLS } from "../../extensions/codebase-tools/definition";
import type {
	OmpExtensionApi,
	OmpExtensionFactory,
	OmpRunInitiationHandler,
	OmpRunInitiationResult,
	OmpSessionContext,
	OmpSessionEvent,
	OmpSessionEventType,
} from "../../framework/adapters/omp";
import * as frameworkOmp from "../../framework/adapters/omp";
import { bindExtension } from "../../framework/behaviors/binding";
import { AdmissionNotices, type RequiredSemantic } from "../../framework/core/admission";
import type {
	AgentRuntimePort,
	BindingResult,
	OwnerReference,
	SessionDelivery,
	SessionPosition,
} from "../../framework/core/protocol";
import { StateStore } from "../../framework/core/state";
import type { ExtensionDefinition } from "../../framework/public";

/** The framework's one required semantic, as the definition under test relies on it. */
const HISTORY_PRESERVATION: RequiredSemantic = "history-preservation";

/** Runs `run` while capturing the process's stderr (the no-UI feedback channel). */
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

/** The admission facts one test-adapter binding declares about its agent runtime. */
interface AdapterFacts {
	/** The version the runtime reports; omitted models a runtime that reports none. */
	readonly version?: string;
	readonly missingRequiredSemantics?: readonly RequiredSemantic[];
	readonly environment?: { readonly platform: string; readonly runtime: string };
	readonly supportedVersions?: readonly string[];
}

/**
 * A test adapter at the framework's adapter contract: it supplies the port the framework
 * registers through plus the facts it admits on, and the framework's binding decides.
 *
 * This is the second adapter the S2 seam is defined with. Everything the framework asks
 * of an adapter is recorded — registrations, diagnostics, and the notices published per
 * session delivery — so "refused with nothing registered" is observed on the adapter the
 * refusal happened to.
 */
interface TestAdapter {
	/** Registrations in call order: `label:<name>`, `onSession`, `onRunInitiation`, `command:<name>`. */
	readonly registrations: string[];
	/** Diagnostics in call order (the adapter's non-model reporting channel). */
	readonly diagnostics: string[];
	bind(definition: ExtensionDefinition, facts: AdapterFacts): BindingResult;
	/** Delivers one session boundary; returns the notices this delivery published. */
	deliver(owner: OwnerReference, position?: SessionPosition): string[];
}

function testAdapter(): TestAdapter {
	const registrations: string[] = [];
	const diagnostics: string[] = [];
	const sessionHandlers: Array<(session: SessionDelivery) => void> = [];
	const port: AgentRuntimePort = {
		setLabel: label => {
			registrations.push(`label:${label}`);
		},
		reportDiagnostic: message => {
			diagnostics.push(message);
		},
		onSession: handler => {
			registrations.push("onSession");
			sessionHandlers.push(handler);
		},
		onRunInitiation: () => {
			registrations.push("onRunInitiation");
		},
		registerCommand: command => {
			registrations.push(`command:${command.name}`);
		},
	};
	const state = new StateStore();
	// One ledger per adapter, as one assembly has one per process: a re-binding of the
	// same definition must not repeat a notice the session was already given.
	const notices = new AdmissionNotices();

	return {
		registrations,
		diagnostics,
		bind(definition, facts) {
			return bindExtension(definition, port, state, {
				supportedVersions: facts.supportedVersions ?? ["18.5.0"],
				facts: {
					version: facts.version,
					missingRequiredSemantics: facts.missingRequiredSemantics,
					environment: facts.environment,
				},
				notices,
			});
		},
		deliver(owner, position = "start") {
			const published: string[] = [];
			for (const handler of sessionHandlers) {
				handler({
					position,
					owner,
					statePayloads: [],
					notices: {
						warn: message => {
							published.push(message);
						},
					},
				});
			}
			return published;
		},
	};
}

describe("required semantics the runtime cannot honor (P26, C14, N2)", () => {
	test("a missing required semantic refuses the binding and registers nothing", () => {
		const adapter = testAdapter();

		const result = adapter.bind(CODEBASE_TOOLS, { missingRequiredSemantics: [HISTORY_PRESERVATION] });

		expect(result.bound).toBe(false);
		expect(result.bound ? [] : result.failures).toEqual([
			{ kind: "required-semantics", missing: [HISTORY_PRESERVATION] },
		]);
		// Admission runs before registration: a refused binding leaves no partial
		// registration behind, on the adapter the refusal happened to.
		expect(adapter.registrations).toEqual([]);
		// Exactly one explicit report, naming the extension and the semantic it cannot get.
		expect(adapter.diagnostics).toHaveLength(1);
		expect(adapter.diagnostics[0]).toContain("codebase-tools");
		expect(adapter.diagnostics[0]).toContain(HISTORY_PRESERVATION);
		// A refused binding subscribes no session behavior, so no session is ever notified.
		expect(adapter.deliver({ kind: "owner", key: "main:session-1" })).toEqual([]);
	});

	test("a missing required semantic refuses even when the version is also unlisted, and the two are not conflated", () => {
		const adapter = testAdapter();

		const result = adapter.bind(CODEBASE_TOOLS, {
			version: "18.6.1",
			missingRequiredSemantics: [HISTORY_PRESERVATION],
		});

		expect(result.bound ? [] : result.failures.map(failure => failure.kind)).toEqual(["required-semantics"]);
		expect(adapter.registrations).toEqual([]);
		// The unlisted version is not reported alongside the refusal: the version axis is
		// never consulted for a runtime that cannot honor a required semantic.
		expect(adapter.diagnostics).toHaveLength(1);
		expect(adapter.diagnostics[0]).not.toContain("18.6.1");
		expect(adapter.diagnostics[0]).not.toContain("supported set");
		expect(adapter.deliver({ kind: "owner", key: "main:session-1" })).toEqual([]);
	});
});

describe("an unlisted version (P25, N1, C13)", () => {
	test("binding continues, and the main session is warned once through the notice channel", () => {
		const adapter = testAdapter();

		const result = adapter.bind(CODEBASE_TOOLS, { version: "18.6.1" });

		expect(result.bound).toBe(true);
		// Continue means continue: the extension is labeled and its command registered.
		expect(adapter.registrations).toEqual([
			"label:codeBaseTools",
			"onSession",
			"onRunInitiation",
			"command:codebase-tools",
		]);
		// The notice is session feedback, not a load-time diagnostic.
		expect(adapter.diagnostics).toEqual([]);

		const noticed = adapter.deliver({ kind: "owner", key: "main:session-1" });
		expect(noticed).toHaveLength(1);
		// The notice names the extension, the version the runtime reported and the support set.
		expect(noticed[0]).toContain("codeBaseTools");
		expect(noticed[0]).toContain("18.6.1");
		expect(noticed[0]).toContain("18.5.0");
	});

	test("the notice is per main session and never repeats for one of them", () => {
		const adapter = testAdapter();
		adapter.bind(CODEBASE_TOOLS, { version: "18.6.1" });

		const owner: OwnerReference = { kind: "owner", key: "main:session-1" };
		expect(adapter.deliver(owner)).toHaveLength(1);
		// Navigation inside the session, and the same boundary again, add nothing.
		expect(adapter.deliver(owner, "tree")).toEqual([]);
		expect(adapter.deliver(owner, "switch")).toEqual([]);
		// Re-binding the same definition (the loader binds every session) is not a new session.
		expect(adapter.bind(CODEBASE_TOOLS, { version: "18.6.1" }).bound).toBe(true);
		expect(adapter.deliver(owner)).toEqual([]);
		// A subagent delivery follows its owner: the owner is the one that is told.
		expect(adapter.deliver({ kind: "inherited", key: "main:session-1" })).toEqual([]);
		// Another main session is a different session, and gets its own single notice.
		expect(adapter.deliver({ kind: "owner", key: "main:session-2" })).toHaveLength(1);
	});

	test("the support set is an exact enumeration, not a range", () => {
		const adapter = testAdapter();

		// A range declaration matches no version literally, so a version inside its
		// arithmetic range is still unlisted: support is exactly the listed versions.
		const result = adapter.bind(CODEBASE_TOOLS, { version: "18.5.1", supportedVersions: ["^18.5.0"] });

		expect(result.bound).toBe(true);
		const noticed = adapter.deliver({ kind: "owner", key: "main:session-1" });
		expect(noticed).toHaveLength(1);
		expect(noticed[0]).toContain("18.5.1");
		expect(noticed[0]).toContain("^18.5.0");
	});

	test("a listed version produces no admission feedback at all", () => {
		const adapter = testAdapter();

		const result = adapter.bind(CODEBASE_TOOLS, { version: "18.5.0" });

		expect(result.bound).toBe(true);
		expect(adapter.diagnostics).toEqual([]);
		expect(adapter.deliver({ kind: "owner", key: "main:session-1" })).toEqual([]);
	});

	test("a runtime that reports no version is not an unlisted version", () => {
		const adapter = testAdapter();

		const result = adapter.bind(CODEBASE_TOOLS, {});

		// There is nothing to compare against the support set, so admission adds nothing
		// rather than inventing a verdict from absence.
		expect(result.bound).toBe(true);
		expect(adapter.diagnostics).toEqual([]);
		expect(adapter.deliver({ kind: "owner", key: "main:session-1" })).toEqual([]);
	});

	test("the verified environment is recorded and never gates admission", () => {
		const foreign = { platform: "linux-arm64", runtime: "some-other-runtime" };

		const listed = testAdapter();
		expect(listed.bind(CODEBASE_TOOLS, { version: "18.5.0", environment: foreign }).bound).toBe(true);
		expect(listed.deliver({ kind: "owner", key: "main:session-1" })).toEqual([]);

		const unlisted = testAdapter();
		expect(unlisted.bind(CODEBASE_TOOLS, { version: "18.6.1", environment: foreign }).bound).toBe(true);
		const noticed = unlisted.deliver({ kind: "owner", key: "main:session-1" });
		// The only admission feedback is about the version: the environment appears in no
		// notice, and it neither admits nor refuses a binding.
		expect(noticed).toHaveLength(1);
		expect(noticed[0]).not.toContain(foreign.platform);
		expect(noticed[0]).not.toContain(foreign.runtime);
	});
});

/** The native surface options one OMP double models. */
interface NativeOptions {
	/** The version the injected SDK reports; omitted models a surface that reports none. */
	readonly version?: string;
	/** `false` models a session with no UI, where feedback falls back to stderr. */
	readonly hasUI?: boolean;
	/** Models a native surface without the append-only paths the framework's contract rests on. */
	readonly withoutAppendPath?: boolean;
}

/** The native surface a loader hands the factory, recording registrations and effects. */
interface NativeDouble {
	readonly api: OmpExtensionApi;
	readonly labels: string[];
	readonly commands: string[];
	/** UI notifications in call order. */
	readonly notifications: ReadonlyArray<{ readonly message: string; readonly type: string | undefined }>;
	/** Appended session entries: an admission notice must never write one. */
	readonly appended: ReadonlyArray<{ readonly customType: string; readonly data: unknown }>;
	/** Binds a definition through one factory per double, as one process binds one assembly. */
	bind(definition: ExtensionDefinition, supportedVersions?: readonly [string, ...string[]]): BindingResult;
	/** Delivers one main-session boundary for `sessionId`. */
	deliverMain(sessionId: string, event?: OmpSessionEventType): void;
	/** Delivers one subagent boundary, whose owning main session the registry resolves. */
	deliverSubagent(): void;
	/** Delivers one run initiation for a main session; what the run hook committed. */
	deliverRun(sessionId: string): OmpRunInitiationResult | undefined;
}

function nativeDouble(options: NativeOptions = {}): NativeDouble {
	const labels: string[] = [];
	const commands: string[] = [];
	const notifications: Array<{ message: string; type: string | undefined }> = [];
	const appended: Array<{ customType: string; data: unknown }> = [];
	const sessionHandlers: Array<{
		readonly event: OmpSessionEventType;
		readonly handler: (event: OmpSessionEvent, ctx: OmpSessionContext) => void;
	}> = [];
	const runHandlers: OmpRunInitiationHandler[] = [];
	const factories = new Map<ExtensionDefinition, OmpExtensionFactory>();

	const contextOf = (agent: OmpSessionContext["agent"], sessionId: string): OmpSessionContext => ({
		agent,
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
		setLabel(label: string): void {
			labels.push(label);
		},
		registerCommand(name: string): void {
			commands.push(name);
		},
		appendEntry(customType: string, data?: unknown): void {
			appended.push({ customType, data });
		},
		on(event: OmpSessionEventType | "before_agent_start", handler: never): void {
			if (event === "before_agent_start") runHandlers.push(handler as OmpRunInitiationHandler);
			else sessionHandlers.push({ event, handler: handler as (event: OmpSessionEvent, ctx: OmpSessionContext) => void });
		},
		pi: {
			VERSION: options.version,
			// The official registry the adapter walks: a subagent resolves its owner through it.
			AgentRegistry: {
				global: () => ({
					get: id =>
						id === "Main"
							? {
									id: "Main",
									kind: "main",
									session: { sessionManager: { getSessionId: () => "owner-session" } },
								}
							: undefined,
				}),
			},
		},
	};
	const api = options.withoutAppendPath
		? ({ ...base, appendEntry: undefined } as unknown as OmpExtensionApi)
		: base;

	const deliverSession = (event: OmpSessionEventType, agent: OmpSessionContext["agent"], sessionId: string): void => {
		for (const registration of sessionHandlers) {
			if (registration.event !== event) continue;
			registration.handler({ type: event }, contextOf(agent, sessionId));
		}
	};

	return {
		api,
		labels,
		commands,
		notifications,
		appended,
		bind(definition, supportedVersions = ["18.5.0"]) {
			let factory = factories.get(definition);
			if (factory === undefined) {
				factory = frameworkOmp.ompAdapter(definition, { supportedVersions });
				factories.set(definition, factory);
			}
			return factory(api);
		},
		deliverMain(sessionId, event = "session_start") {
			deliverSession(event, { kind: "main", id: "Main" }, sessionId);
		},
		deliverSubagent() {
			deliverSession("session_start", { kind: "sub", id: "sub-1", parentId: "Main" }, "sub-session");
		},
		deliverRun(sessionId) {
			const ctx = contextOf({ kind: "main", id: "Main" }, sessionId);
			for (const handler of runHandlers) {
				const result = handler({ type: "before_agent_start" }, ctx);
				if (result !== undefined) return result;
			}
			return undefined;
		},
	};
}

describe("admission on the OMP adapter (P24, P27, C13)", () => {
	test("the version the runtime reports, listed, produces no admission feedback at all", () => {
		const double = nativeDouble({ version: "18.5.0" });

		const { stderr, value: result } = withCapturedStderr(() => {
			const bound = double.bind(CODEBASE_TOOLS);
			double.deliverMain("session-1");
			double.deliverRun("session-1");
			return bound;
		});

		expect(result.bound).toBe(true);
		expect(double.labels).toEqual(["codeBaseTools"]);
		expect(double.commands).toEqual(["codebase-tools"]);
		expect(double.notifications).toEqual([]);
		expect(stderr).toBe("");
	});

	test("an unlisted version warns the main session once on the UI channel and keeps the extension running", () => {
		const double = nativeDouble({ version: "18.6.1" });

		const { stderr, value: result } = withCapturedStderr(() => {
			const bound = double.bind(CODEBASE_TOOLS);
			double.deliverMain("session-1");
			double.deliverMain("session-1", "session_switch");
			double.deliverSubagent();
			return bound;
		});

		expect(result.bound).toBe(true);
		// Continue: the command is registered and the contribution hook is subscribed.
		expect(double.commands).toEqual(["codebase-tools"]);
		expect(double.notifications).toHaveLength(1);
		expect(double.notifications[0]?.type).toBe("warning");
		expect(double.notifications[0]?.message).toContain("codeBaseTools");
		expect(double.notifications[0]?.message).toContain("18.6.1");
		expect(double.notifications[0]?.message).toContain("18.5.0");
		// With a UI the notice is a UI notification, never a stderr write as well.
		expect(stderr).toBe("");
		// The notice is feedback, not model context: it writes no session entry and adds
		// nothing to a run's contribution.
		expect(double.appended).toEqual([]);
		const contribution = double.deliverRun("session-1");
		expect(JSON.stringify(contribution ?? null)).not.toContain("supported set");
	});

	test("a session without a UI gets the notice as one stderr line", () => {
		const double = nativeDouble({ version: "18.6.1", hasUI: false });

		const { stderr, value: result } = withCapturedStderr(() => {
			const bound = double.bind(CODEBASE_TOOLS);
			double.deliverMain("session-1");
			double.deliverMain("session-1", "session_switch");
			return bound;
		});

		expect(result.bound).toBe(true);
		expect(double.notifications).toEqual([]);
		const noticeLines = stderr.split("\n").filter(line => line.includes("supported set"));
		expect(noticeLines).toHaveLength(1);
		expect(noticeLines[0]).toContain("codeBaseTools");
		expect(noticeLines[0]).toContain("18.6.1");
		expect(noticeLines[0]).toContain("18.5.0");
	});

	test("a native surface without the framework's append-only paths is refused, not degraded", () => {
		const double = nativeDouble({ version: "18.5.0", withoutAppendPath: true });

		const { stderr, value: result } = withCapturedStderr(() => {
			const bound = double.bind(CODEBASE_TOOLS);
			double.deliverMain("session-1");
			return bound;
		});

		expect(result.bound).toBe(false);
		expect(result.bound ? [] : result.failures.map(failure => failure.kind)).toEqual(["required-semantics"]);
		expect(result.bound ? [] : result.failures).toEqual([
			{ kind: "required-semantics", missing: [HISTORY_PRESERVATION] },
		]);
		// Nothing is registered on the native surface, and the refusal is reported once.
		expect(double.labels).toEqual([]);
		expect(double.commands).toEqual([]);
		const reported = stderr.split("\n").filter(line => line.includes("required semantics"));
		expect(reported).toHaveLength(1);
		expect(reported[0]).toContain("codebase-tools");
		expect(reported[0]).toContain(HISTORY_PRESERVATION);
		// No session behavior was subscribed, so the refused extension notifies nobody.
		expect(double.notifications).toEqual([]);
	});

	test("a re-bound session of one process is not warned a second time", () => {
		const double = nativeDouble({ version: "18.6.1" });

		withCapturedStderr(() => {
			double.bind(CODEBASE_TOOLS);
			double.deliverMain("session-1");
			// The loader binds the same assembly again for another session (or re-entry);
			// the ledger of that assembly already told this main session.
			double.bind(CODEBASE_TOOLS);
			double.deliverMain("session-1");
		});

		expect(double.notifications).toHaveLength(1);
	});
});
