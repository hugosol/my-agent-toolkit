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
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import connectBot from "../../entrypoints/omp/connect-bot";
import { EXTENSION_REPOSITORY_ROOT } from "../../extensions/connect-bot/runtimes/omp";
import { CODEBASE_TOOLS } from "../../extensions/codebase-tools/definition";
import type {
	OmpExtensionApi,
	OmpExtensionFactory,
	OmpRoundEventType,
	OmpRunInitiationHandler,
	OmpRunInitiationResult,
	OmpSessionContext,
	OmpSessionEvent,
	OmpSessionEventType,
} from "../../framework/adapters/omp";
import * as frameworkOmp from "../../framework/adapters/omp";
import { bindExtension } from "../../framework/behaviors/binding";
import {
	AdmissionNotices,
	type DeclarableRequiredSemantic,
	type RequiredSemantic,
} from "../../framework/core/admission";
import { getConfig } from "../../framework/core/config";
import type {
	AgentRuntimePort,
	BindingResult,
	OwnerReference,
	SessionDelivery,
	SessionEvent,
} from "../../framework/core/protocol";
import { StateStore } from "../../framework/core/state";
import type { ExtensionDefinition } from "../../framework/public";
import { REPO_ROOT } from "../harness/baseline";
import { withCapturedStderr } from "./support/captured-stderr";
import { portDouble } from "./support/runtime-port-double";

/** The framework's one required semantic, as the definition under test relies on it. */
const HISTORY_PRESERVATION: RequiredSemantic = "history-preservation";

/** The two semantics this release added, which an assembly may declare it depends on. */
const SESSION_EVENTS: DeclarableRequiredSemantic = "session-lifecycle-events";
const ROUND_EVENTS: DeclarableRequiredSemantic = "round-lifecycle-events";

/** The admission facts one test-adapter binding declares about its agent runtime. */
interface AdapterFacts {
	/** The version the runtime reports; omitted models a runtime that reports none. */
	readonly version?: string;
	readonly missingRequiredSemantics?: readonly RequiredSemantic[];
	/** The semantics this binding's assembly declared it depends on. */
	readonly requiredSemantics?: readonly DeclarableRequiredSemantic[];
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
	/** Registrations in call order: `label:<name>`, `onSession`, `onRound`, `onRunInitiation`, `command:<name>`. */
	readonly registrations: string[];
	/** Diagnostics in call order (the adapter's non-model reporting channel). */
	readonly diagnostics: string[];
	/** Extension feedback published during a delivery, with its severity. */
	readonly feedback: ReadonlyArray<{ readonly level: string; readonly message: string }>;
	bind(definition: ExtensionDefinition, facts: AdapterFacts): BindingResult;
	/** Delivers one semantic session event; returns the notices this delivery published. */
	deliver(owner: OwnerReference, event?: SessionEvent): string[];
}

function testAdapter(): TestAdapter {
	const registrations: string[] = [];
	const diagnostics: string[] = [];
	const feedback: Array<{ level: string; message: string }> = [];
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
		onRound: () => {
			registrations.push("onRound");
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
		feedback,
		bind(definition, facts) {
			return bindExtension(definition, port, state, {
				supportedVersions: facts.supportedVersions ?? ["18.5.0"],
				facts: {
					version: facts.version,
					missingRequiredSemantics: facts.missingRequiredSemantics,
					environment: facts.environment,
				},
				requiredSemantics: facts.requiredSemantics,
				notices,
			});
		},
		deliver(owner, event = { kind: "session_start", reason: "initial" }) {
			const published: string[] = [];
			for (const handler of sessionHandlers) {
				handler({
					event,
					owner,
					statePayloads: [],
					// This adapter models a session facts-resolved at the seam; whether a UI
					// exists is a fact the framework only carries, and no behavior in this
					// suite publishes extension feedback. It records no State either: no session
					// handler here retains a capability to write through.
					persist: () => {},
					hasUI: true,
					feedback: {
						notify: (level, message) => {
							feedback.push({ level, message });
						},
					},
					notices: {
						warn: message => {
							published.push(message);
						},
					},
					markers: {
						publishMarkers: () => {},
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

/**
 * A semantic an assembly declared it depends on, against a runtime that cannot honor it (F8;
 * contract P11; story 26).
 *
 * The declaration is the assembly's, not the definition's: `requiredSemantics` arrives the way
 * a directed command's implementation does, and the framework's rule reads the declared set
 * together with the facts the adapter resolved. A semantic the runtime cannot honor refuses
 * only the binding that declared it — an extension that declared nothing keeps running on the
 * very same runtime — and the refusal leaves nothing registered, no cell seeded and no area
 * rendered.
 */
describe("a declared semantic the runtime cannot honor (P26, F8)", () => {
	test("the declared semantic refuses the binding and names itself in the readable failure", () => {
		const adapter = testAdapter();

		const result = adapter.bind(CODEBASE_TOOLS, {
			missingRequiredSemantics: [ROUND_EVENTS],
			requiredSemantics: [ROUND_EVENTS],
		});

		expect(result.bound).toBe(false);
		expect(result.bound ? [] : result.failures).toEqual([
			{ kind: "required-semantics", missing: [ROUND_EVENTS] },
		]);
		// Refused before the first registration, like every other admission refusal.
		expect(adapter.registrations).toEqual([]);
		// One explicit report, naming the extension and the semantic it declared and cannot get.
		expect(adapter.diagnostics).toHaveLength(1);
		expect(adapter.diagnostics[0]).toContain("codebase-tools");
		expect(adapter.diagnostics[0]).toContain(ROUND_EVENTS);
		// The framework's own semantic is not reported alongside it: the refusal carries what
		// this binding actually lost, not the whole fact the adapter observed.
		expect(adapter.diagnostics[0]).not.toContain(HISTORY_PRESERVATION);
	});

	test("the same runtime leaves an assembly that declared nothing running", () => {
		const adapter = testAdapter();

		const result = adapter.bind(CODEBASE_TOOLS, { missingRequiredSemantics: [ROUND_EVENTS] });

		// The runtime cannot honor the round axis, and this assembly never asked for it: what
		// the framework refuses is the declared dependency, never the runtime's shape.
		expect(result.bound).toBe(true);
		expect(adapter.diagnostics).toEqual([]);
		expect(adapter.registrations).toEqual([
			"label:codeBaseTools",
			"onSession",
			"onRunInitiation",
			"command:codebase-tools",
		]);
	});

	test("a semantic the runtime can honor is no refusal, declared or not", () => {
		const adapter = testAdapter();

		const result = adapter.bind(CODEBASE_TOOLS, { requiredSemantics: [SESSION_EVENTS, ROUND_EVENTS] });

		expect(result.bound).toBe(true);
		expect(adapter.diagnostics).toEqual([]);
		expect(adapter.registrations).toContain("onSession");
	});

	test("the framework's own semantic refuses a binding that declared nothing at all", () => {
		const adapter = testAdapter();

		const result = adapter.bind(CODEBASE_TOOLS, { missingRequiredSemantics: [HISTORY_PRESERVATION] });

		// History preservation is required of every binding, so it is not a declaration an
		// assembly can leave out: declaring only the axes does not trade it away either.
		expect(result.bound ? [] : result.failures).toEqual([
			{ kind: "required-semantics", missing: [HISTORY_PRESERVATION] },
		]);

		const declared = testAdapter();
		const withAxes = declared.bind(CODEBASE_TOOLS, {
			missingRequiredSemantics: [HISTORY_PRESERVATION],
			requiredSemantics: [SESSION_EVENTS],
		});
		expect(withAxes.bound ? [] : withAxes.failures).toEqual([
			{ kind: "required-semantics", missing: [HISTORY_PRESERVATION] },
		]);
	});

	test("a refused binding leaves no half-bound state: no cell, no area, no subscriber", () => {
		const double = portDouble();

		const result = double.bind(CODEBASE_TOOLS, {
			missingRequiredSemantics: [ROUND_EVENTS],
			requiredSemantics: [ROUND_EVENTS],
		});

		expect(result.bound).toBe(false);
		// Nothing was registered on the port: no label, no session behavior, no command.
		expect(double.registrations).toEqual([]);
		expect(double.labels).toEqual([]);

		// A session boundary that arrives afterwards is not observed by the refused binding, so
		// no owner cell is seeded from its branch and no marker area is rendered.
		const boundary = double.deliverSession({ kind: "owner", key: "main:refused" }, {
			statePayloads: [{ enabled: true }],
		});
		expect(boundary.markers).toEqual([]);
		expect(double.markerUpdates).toEqual([]);
		expect(double.state.view("main:refused").read("enabled")).toBe(false);
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
		// Later deliveries for that same session — a resume boundary, the end of the session —
		// add nothing: the notice belongs to the session, not to one delivery of it.
		expect(adapter.deliver(owner, { kind: "session_start", reason: "resume" })).toEqual([]);
		expect(adapter.deliver(owner, { kind: "session_end", reason: "transferred" })).toEqual([]);
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
	/** Models a native surface with no lifecycle subscription at all. */
	readonly withoutLifecycleSubscription?: boolean;
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
	bind(
		definition: ExtensionDefinition,
		supportedVersions?: readonly [string, ...string[]],
		requiredSemantics?: readonly DeclarableRequiredSemantic[],
	): BindingResult;
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
	const factories = new Map<string, OmpExtensionFactory>();

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
		on(event: OmpSessionEventType | OmpRoundEventType | "before_agent_start", handler: never): void {
			if (event === "before_agent_start") runHandlers.push(handler as OmpRunInitiationHandler);
			// This double drives the session axis; the round axis has its own suite.
			else if (event !== "agent_start" && event !== "agent_end")
				sessionHandlers.push({ event, handler: handler as (event: OmpSessionEvent, ctx: OmpSessionContext) => void });
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
	const withoutSubscription = options.withoutLifecycleSubscription
		? ({ ...base, on: undefined } as unknown as OmpExtensionApi)
		: base;
	const api = options.withoutAppendPath
		? ({ ...withoutSubscription, appendEntry: undefined } as unknown as OmpExtensionApi)
		: withoutSubscription;

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
		bind(definition, supportedVersions = ["18.5.0"], requiredSemantics) {
			// One factory per assembly: the supported versions and the declared semantics are
			// that assembly's own options, so two bindings that differ in either are two
			// assemblies rather than one factory reused.
			const key = `${definition.id}|${supportedVersions.join(",")}|${(requiredSemantics ?? []).join(",")}`;
			let factory = factories.get(key);
			if (factory === undefined) {
				factory = frameworkOmp.ompAdapter(definition, {
					supportedVersions,
					...(requiredSemantics === undefined ? {} : { requiredSemantics }),
				});
				factories.set(key, factory);
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

describe("the declared semantic dependencies on the OMP adapter (P26, F8)", () => {
	test("a surface without the lifecycle subscription refuses the declared semantics, and names them", () => {
		const double = nativeDouble({ version: "18.5.0", withoutLifecycleSubscription: true });

		const { stderr, value: result } = withCapturedStderr(() => {
			const bound = double.bind(CODEBASE_TOOLS, ["18.5.0"], [SESSION_EVENTS, ROUND_EVENTS]);
			double.deliverMain("session-1");
			return bound;
		});

		expect(result.bound).toBe(false);
		// Every lifecycle subscription on this runtime travels through the one `on` surface, so
		// a surface without it can honor neither axis: the declared semantics are reported
		// missing alongside the framework's own, and each one the binding declared is named.
		expect(result.bound ? [] : result.failures).toEqual([
			{ kind: "required-semantics", missing: [HISTORY_PRESERVATION, SESSION_EVENTS, ROUND_EVENTS] },
		]);
		// Refused before the first registration: nothing is labeled, no command registered.
		expect(double.labels).toEqual([]);
		expect(double.commands).toEqual([]);
		const reported = stderr.split("\n").filter(line => line.includes("required semantics"));
		expect(reported).toHaveLength(1);
		expect(reported[0]).toContain(SESSION_EVENTS);
		expect(reported[0]).toContain(ROUND_EVENTS);
	});

	test("the same surface refuses an assembly that declared nothing for the framework's own semantic", () => {
		const double = nativeDouble({ version: "18.5.0", withoutLifecycleSubscription: true });

		const { stderr, value: result } = withCapturedStderr(() => double.bind(CODEBASE_TOOLS));

		// The axes are not requirements in their own right: an extension that observed no
		// semantic lifecycle event is refused for history preservation alone, which is
		// required of every binding.
		expect(result.bound ? [] : result.failures).toEqual([
			{ kind: "required-semantics", missing: [HISTORY_PRESERVATION] },
		]);
		const reported = stderr.split("\n").filter(line => line.includes("required semantics"));
		expect(reported).toHaveLength(1);
		expect(reported[0]).not.toContain(SESSION_EVENTS);
		expect(reported[0]).not.toContain(ROUND_EVENTS);
	});

	test("a surface with the lifecycle subscription honors the declaration and keeps running", () => {
		const double = nativeDouble({ version: "18.5.0" });

		const { stderr, value: result } = withCapturedStderr(() => {
			const bound = double.bind(CODEBASE_TOOLS, ["18.5.0"], [SESSION_EVENTS, ROUND_EVENTS]);
			double.deliverMain("session-1");
			return bound;
		});

		// The declaration is not a claim to be judged on its own: what refuses a binding is a
		// semantic the runtime cannot honor, and this one can honor both axes.
		expect(result.bound).toBe(true);
		expect(double.labels).toEqual(["codeBaseTools"]);
		expect(double.commands).toEqual(["codebase-tools"]);
		expect(stderr).toBe("");
	});
});

/**
 * The directory a declared configuration path resolves against (P19, P42).
 *
 * An assembly supplies it to the adapter as plain data — a directory string, nothing native —
 * and the framework resolves the definition's relative declaration against it. That is what
 * lets an extension the loader discovered by an absolute path bind while the process sits in
 * an arbitrary project directory: the definition's file lives in the extension repository, not
 * in the project the user happened to start in.
 */
describe("the OMP assembly's configuration base directory (P19, P42)", () => {
	test("a config-declaring definition binds from the supplied directory, and its values are that file's", () => {
		const repository = mkdtempSync(path.join(tmpdir(), "assembly-config-base-"));
		try {
			const file = path.join(repository, "extensions", "based-assembly", "config.yaml");
			mkdirSync(path.dirname(file), { recursive: true });
			writeFileSync(file, "endpoint: http://base-directory.local:8787\n");

			const definition = {
				id: "based-assembly",
				displayName: "based-assembly",
				config: { fields: { endpoint: "non-empty-string" } },
			} as unknown as ExtensionDefinition;
			const double = nativeDouble({ version: "18.5.0" });

			// The definition's convention path exists under the supplied directory and does not
			// exist under this process's own working directory, so the file is found only if the
			// adapter handed the directory to the binding.
			const result = frameworkOmp.ompAdapter(definition, {
				supportedVersions: ["18.5.0"],
				configBaseDir: repository,
			})(double.api);

			expect(result.bound).toBe(true);
			expect(double.labels).toEqual(["based-assembly"]);
			expect(getConfig(definition)).toEqual({ endpoint: "http://base-directory.local:8787" });
		} finally {
			rmSync(repository, { recursive: true, force: true });
		}
	});
});

/**
 * What connect-bot's own assembly declares to admission (P42).
 *
 * Everything above drives the adapter from a definition this suite holds; this block drives the
 * deployed assembly instead — the factory `entrypoints/omp/connect-bot.ts` re-exports — so the
 * versions and semantics under test are the ones a real session on a recorded runtime meets.
 * The native surface stays the double above: which version a runtime reports and whether it
 * subscribes lifecycle events are facts of the runtime itself, and no real install can be asked
 * to vary them.
 *
 * The extension declares a configuration, and this block fixes where its file is read from: the
 * assembly supplies the repository root it derives from its own module location, so the binding
 * reads `extensions/connect-bot/config.yaml` under that root whatever the process's working
 * directory is. A read happens once per extension per module graph, so the binding behavior is
 * observed where a load really reads — the loader and session tests in deployment.test.ts, which
 * bind this entrypoint from a working directory outside this repository.
 */
describe("connect-bot's declared support and semantics (P42)", () => {
	test("the runtime this repository records is admitted, so the extension registers", () => {
		const double = nativeDouble({ version: "18.5.0" });

		const { stderr } = withCapturedStderr(() => {
			connectBot(double.api);
			double.deliverMain("session-1");
		});

		expect(double.labels).toEqual(["connectBot"]);
		expect(double.commands).toEqual(["connect-bot"]);
		// A listed version produces no admission feedback on either channel.
		expect(double.notifications).toEqual([]);
		expect(stderr).toBe("");
	});

	test("the extension's declared file is the one under the repository root this assembly derives", () => {
		// The assembly derives its repository root from its own module location, which is the one
		// thing about the configuration a load's working directory cannot tell it. The harness
		// computes that same root by a different route (`import.meta.dir` under tests/harness),
		// so this is the derivation checked against an independent computation, and the file the
		// convention path names is really the one the extension ships.
		//
		// The read itself is observed where a fresh module graph makes it observable: the loader
		// tests in deployment.test.ts bind this entrypoint from a working directory outside the
		// repository, and a validated configuration is recorded once per extension per module
		// graph, so an in-process second binding would answer from the record instead of the file.
		expect(EXTENSION_REPOSITORY_ROOT).toBe(REPO_ROOT);
		expect(existsSync(path.join(EXTENSION_REPOSITORY_ROOT, "extensions", "connect-bot", "config.yaml"))).toBe(
			true,
		);
	});

	test("an unlisted version warns the main session once, and the extension keeps running", () => {
		const double = nativeDouble({ version: "18.6.1" });

		const { stderr } = withCapturedStderr(() => {
			connectBot(double.api);
			double.deliverMain("session-1");
			// A later boundary of the same session is not a second session.
			double.deliverMain("session-1", "session_switch");
		});

		// Continue: the command the extension owns is registered either way.
		expect(double.commands).toEqual(["connect-bot"]);
		expect(double.notifications).toHaveLength(1);
		expect(double.notifications[0]?.type).toBe("warning");
		const notice = double.notifications[0]?.message ?? "";
		// The notice names the extension, the version the runtime reported and the set this
		// assembly declares — the recorded support version and nothing wider.
		expect(notice).toContain("connectBot");
		expect(notice).toContain("18.6.1");
		expect(notice).toContain("18.5.0");
		// The notice is session feedback, not a load-time diagnostic.
		expect(stderr).toBe("");
	});

	test("a runtime without the lifecycle subscription refuses the binding, and names the axes it declared", () => {
		const double = nativeDouble({ version: "18.5.0", withoutLifecycleSubscription: true });

		const { stderr } = withCapturedStderr(() => {
			connectBot(double.api);
			double.deliverMain("session-1");
		});

		// Refused before the first registration, like every other admission refusal.
		expect(double.labels).toEqual([]);
		expect(double.commands).toEqual([]);
		const reported = stderr.split("\n").filter(line => line.includes("required semantics"));
		expect(reported).toHaveLength(1);
		expect(reported[0]).toContain("connect-bot");
		// Both axes are this assembly's own declaration, and both are named beside the
		// framework's own semantic, which every binding requires whatever it declares.
		expect(reported[0]).toContain(SESSION_EVENTS);
		expect(reported[0]).toContain(ROUND_EVENTS);
		expect(reported[0]).toContain(HISTORY_PRESERVATION);
		// No session behavior was subscribed, so the refused extension notifies nobody.
		expect(double.notifications).toEqual([]);
	});
});
