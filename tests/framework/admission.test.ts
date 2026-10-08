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
import { CONNECT_BOT } from "../../extensions/connect-bot/definition";
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
import { type DeclarableRequiredSemantic, type RequiredSemantic } from "../../framework/core/admission";
import { getConfig } from "../../framework/core/config";
import { activationField, statePersistence } from "../../framework/core/definition";
import type {
	AgentRuntimePort,
	BindingResult,
	OwnerReference,
	SessionDelivery,
	SessionEvent,
} from "../../framework/core/protocol";
import { StateStore } from "../../framework/core/state";
import type { ExtensionDefinition } from "../../framework/public";
import { REPO_ROOT, readBaselineRecord } from "../harness/baseline";
import { withCapturedStderr } from "./support/captured-stderr";
import { portDouble } from "./support/runtime-port-double";

/** The framework's one required semantic, as the definition under test relies on it. */
const HISTORY_PRESERVATION: RequiredSemantic = "history-preservation";

/** The two semantics this release added, which an assembly may declare it depends on. */
const SESSION_EVENTS: DeclarableRequiredSemantic = "session-lifecycle-events";
const ROUND_EVENTS: DeclarableRequiredSemantic = "round-lifecycle-events";

/**
 * The version the repository's support record lists as the one acceptance runs. The expected
 * *listed* version is read from that record — an independent source — and never from the
 * framework's own decision.
 */
const RECORDED_SUPPORTED_VERSION = readBaselineRecord().agentRuntime.supportedVersion;

/**
 * A version independently specified to be outside the framework's baseline: the candidate this
 * repository already uses as the "not the recorded one" input, chosen here so the unlisted
 * expectation does not come from the framework's membership decision either.
 */
const UNLISTED_RUNTIME_VERSION = "18.6.1";

/** The admission facts one test-adapter binding declares about its agent runtime. */
interface AdapterFacts {
	/** The version the runtime reports; omitted models a runtime that reports none. */
	readonly version?: string;
	readonly missingRequiredSemantics?: readonly RequiredSemantic[];
	/** The semantics this binding's assembly declared it depends on. */
	readonly requiredSemantics?: readonly DeclarableRequiredSemantic[];
	readonly environment?: { readonly platform: string; readonly runtime: string };
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
	// This adapter is one assembly: the store takes the declaration rules of the definition
	// its first binding names, resolved the way a deployed assembly resolves them.
	let state: StateStore | undefined;

	return {
		registrations,
		diagnostics,
		feedback,
		bind(definition, facts) {
			state ??= new StateStore({
				field: activationField(definition),
				persistence: statePersistence(definition),
			});
			return bindExtension(definition, port, state, {
				facts: {
					version: facts.version,
					missingRequiredSemantics: facts.missingRequiredSemantics,
					environment: facts.environment,
				},
				requiredSemantics: facts.requiredSemantics,
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

/**
 * The required-entry check belongs to each binding (P10; contract S1; stories 11–12).
 *
 * The version decision is the process's — made once per reported version and shared by every
 * binding in it — while which entries the injected interface has is a fact about the one surface
 * *this* binding was handed. The check runs on every binding, from that binding's own observed
 * facts, before which of them refuses it is read against the semantics the framework requires of
 * every binding plus the ones this assembly declared. So a version a complete binding of this
 * process has already admitted can never stand in for an entry the next surface lacks, and a
 * refusal is a verdict about one binding rather than about the runtime: it is not recorded
 * anywhere a later binding could read it back.
 *
 * Both extensions are this repository's own, driven in one process: codebase-tools declares
 * nothing beyond the semantics every binding requires, and connect-bot's deployed assembly
 * declares the two lifecycle axes. What each refusal names is therefore that extension's real
 * declaration, observed through the binding interface rather than by calling a check of the
 * framework's own.
 */
describe("the required-entry check belongs to each binding (P10)", () => {
	test("a version this process already admitted does not stand in for the entry the next surface lacks", () => {
		// The process's first binding: a complete surface reporting the version the support
		// record lists. Admission admits it, and this process now holds that version's decision.
		const complete = nativeDouble({ version: RECORDED_SUPPORTED_VERSION });
		expect(complete.bind(CODEBASE_TOOLS).bound).toBe(true);
		expect(complete.commands).toEqual(["codebase-tools"]);

		// The next binding of the same process reports the same version, and the surface it was
		// handed has no lifecycle subscription. Availability is this binding's own fact, so each
		// extension is refused for what it actually requires: codebase-tools for the framework's
		// own semantic, connect-bot for its two declared axes as well.
		const incomplete = nativeDouble({
			version: RECORDED_SUPPORTED_VERSION,
			withoutLifecycleSubscription: true,
		});
		const { stderr, value: tools } = withCapturedStderr(() => {
			const refused = incomplete.bind(CODEBASE_TOOLS);
			connectBot(incomplete.api);
			return refused;
		});

		expect(tools.bound ? [] : tools.failures).toEqual([
			{ kind: "required-semantics", missing: [HISTORY_PRESERVATION] },
		]);
		const reported = stderr.split("\n").filter(line => line.includes("required semantics"));
		expect(reported).toHaveLength(2);
		expect(reported[0]).toContain(CODEBASE_TOOLS.id);
		expect(reported[0]).toContain(HISTORY_PRESERVATION);
		expect(reported[1]).toContain(CONNECT_BOT.id);
		expect(reported[1]).toContain(HISTORY_PRESERVATION);
		expect(reported[1]).toContain(SESSION_EVENTS);
		expect(reported[1]).toContain(ROUND_EVENTS);
		// Two different declarations, two different refusals — and neither one registered.
		expect(incomplete.labels).toEqual([]);
		expect(incomplete.commands).toEqual([]);

		// A refusal is not a process-wide verdict either: the next binding of a complete surface
		// is admitted and registers exactly as the first one did.
		const afterRefusals = nativeDouble({ version: RECORDED_SUPPORTED_VERSION });
		expect(afterRefusals.bind(CODEBASE_TOOLS).bound).toBe(true);
		expect(afterRefusals.commands).toEqual(["codebase-tools"]);
	});
});

/**
 * What a refusal leaves behind, and what binding itself is (P11, P12; contract S1; stories 12–14).
 *
 * A refused binding is fail-soft: it registers nothing — no label, no session behavior, no command,
 * no area entry — reports exactly one diagnostic on the non-model channel, and the agent runtime
 * keeps running, with the bindings this process already admitted still serving. And binding is not a
 * compatibility self-test: the registration it performs is the whole of it, so no command
 * implementation runs, no session entry is written and no area is rendered until a command or a
 * lifecycle delivery asks for one. Entry availability is not a proof of semantic compatibility, and
 * a green run is a regression alarm rather than an approval of a new supported version.
 */
describe("what a refusal leaves behind, and what binding itself is (P11, P12)", () => {
	test("a refusal registers nothing and reports once, while an admitted binding of the process keeps serving", () => {
		// An admitted binding of this process, taken before the refusal.
		const serving = portDouble();
		expect(serving.bind(CODEBASE_TOOLS).bound).toBe(true);

		const refused = portDouble();
		const declared = CONNECT_BOT.commands?.[0]?.name ?? "";
		expect(declared.length).toBeGreaterThan(0);
		const result = refused.bind(CONNECT_BOT, {
			missingRequiredSemantics: [SESSION_EVENTS, ROUND_EVENTS],
			requiredSemantics: [SESSION_EVENTS, ROUND_EVENTS],
			// The assembly's half of connect-bot's directed command, injected as the deployed
			// assembly injects it: the refusal observed below is the required-entry one, not the
			// initialization refusal of a declaration whose implementation never arrived.
			actions: { [declared]: { run: () => {} } },
		});

		// Fail-soft and whole: one explicit diagnostic on the adapter's non-model channel, and
		// nothing of the extension registered — no label, no session behavior, no command.
		expect(result.bound).toBe(false);
		expect(result.bound ? [] : result.failures).toEqual([
			{ kind: "required-semantics", missing: [SESSION_EVENTS, ROUND_EVENTS] },
		]);
		expect(refused.registrations).toEqual([]);
		expect(refused.labels).toEqual([]);
		expect(refused.commands).toEqual([]);
		expect(refused.diagnostics).toEqual([
			`${CONNECT_BOT.id}: required semantics missing (${SESSION_EVENTS}, ${ROUND_EVENTS}), extension not bound`,
		]);
		// Nothing of the refused binding can be used: its command was never registered, so there
		// is nothing for a user to run and no area entry to render.
		expect(() => refused.run(declared)).toThrow();
		expect(refused.markerUpdates).toEqual([]);

		// The Agent runtime keeps running: the binding this process admitted before the refusal
		// still has its command and its session behavior, and a boundary it observes still
		// renders the framework's own area for the value that boundary carried.
		const boundary = serving.deliverSession(
			{ kind: "owner", key: "main:keeps-serving" },
			{ statePayloads: [{ enabled: true }] },
		);
		expect(boundary.markers.flat()).toContain("◈ codeBaseTools");
		expect(serving.run("codebase-tools").effects).toContain("persist");
	});

	test("binding only registers: no command ran, no session entry was written and no area was rendered", () => {
		const double = portDouble();
		const result = double.bind(CODEBASE_TOOLS);

		// The binding is real, and its registrations are the whole of what it did.
		expect(result.bound).toBe(true);
		expect(double.registrations).toEqual([
			"label:codeBaseTools",
			"onSession",
			"onRunInitiation",
			"command:codebase-tools",
		]);
		// No behavioral self-test ran: the extension's own effects — a persisted value, a
		// rendered area, published feedback — happen only when a command or a lifecycle
		// delivery asks for them, and neither has happened yet.
		expect(double.markerUpdates).toEqual([]);
		expect(double.diagnostics).toEqual([]);
		expect(double.state.view("main:registration-only").read("enabled")).toBe(false);

		// The records are real rather than silent: the same double records the framework's own
		// render as soon as a boundary carries the activation value, which is a lifecycle event
		// binding must not have produced by itself.
		const boundary = double.deliverSession(
			{ kind: "owner", key: "main:registration-only" },
			{ statePayloads: [{ enabled: true }] },
		);
		expect(boundary.markers.flat()).toContain("◈ codeBaseTools");
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

		const noticed = adapter.deliver({ kind: "owner", key: "main:notice-binding-continues" });
		expect(noticed).toHaveLength(1);
		// The notice is the framework's: it names the framework, the version the runtime reported and
		// the support set, and never an extension that shares the process.
		expect(noticed[0]).toContain("my-agent-toolkit");
		expect(noticed[0]).not.toContain(CODEBASE_TOOLS.displayName);
		expect(noticed[0]).toContain("18.6.1");
		expect(noticed[0]).toContain("18.5.0");
	});

	test("the notice is per main session and never repeats for one of them", () => {
		const adapter = testAdapter();
		adapter.bind(CODEBASE_TOOLS, { version: "18.6.1" });

		const owner: OwnerReference = { kind: "owner", key: "main:notice-repeat" };
		expect(adapter.deliver(owner)).toHaveLength(1);
		// Later deliveries for that same session — a resume boundary, the end of the session —
		// add nothing: the notice belongs to the session, not to one delivery of it.
		expect(adapter.deliver(owner, { kind: "session_start", reason: "resume" })).toEqual([]);
		expect(adapter.deliver(owner, { kind: "session_end", reason: "transferred" })).toEqual([]);
		// Re-binding the same definition (the loader binds every session) is not a new session.
		expect(adapter.bind(CODEBASE_TOOLS, { version: "18.6.1" }).bound).toBe(true);
		expect(adapter.deliver(owner)).toEqual([]);
		// A subagent delivery follows its owner: the owner is the one that is told, and the subagent
		// neither publishes a notice of its own nor counts as one.
		const followed = "main:notice-repeat-followed";
		expect(adapter.deliver({ kind: "inherited", key: followed })).toEqual([]);
		expect(adapter.deliver({ kind: "owner", key: followed })).toHaveLength(1);
		// Another main session is a different Owner, and gets its own single notice.
		expect(adapter.deliver({ kind: "owner", key: "main:notice-repeat-other" })).toHaveLength(1);
	});

	test("the framework's baseline is an exact enumeration, not a range", () => {
		const adapter = testAdapter();

		// A version inside the listed version's arithmetic range is still unlisted: support is
		// exactly the versions the baseline lists, and none of them is matched by range.
		const result = adapter.bind(CODEBASE_TOOLS, { version: "18.5.1" });

		expect(result.bound).toBe(true);
		const noticed = adapter.deliver({ kind: "owner", key: "main:notice-exact-enumeration" });
		expect(noticed).toHaveLength(1);
		expect(noticed[0]).toContain("18.5.1");
		expect(noticed[0]).toContain(RECORDED_SUPPORTED_VERSION);
	});

	test("a listed version produces no admission feedback at all", () => {
		const adapter = testAdapter();

		const result = adapter.bind(CODEBASE_TOOLS, { version: "18.5.0" });

		expect(result.bound).toBe(true);
		expect(adapter.diagnostics).toEqual([]);
		expect(adapter.deliver({ kind: "owner", key: "main:notice-listed-version" })).toEqual([]);
	});

	test("a runtime that reports no version is not an unlisted version", () => {
		const adapter = testAdapter();

		const result = adapter.bind(CODEBASE_TOOLS, {});

		// There is nothing to compare against the support set, so admission adds nothing
		// rather than inventing a verdict from absence.
		expect(result.bound).toBe(true);
		expect(adapter.diagnostics).toEqual([]);
		expect(adapter.deliver({ kind: "owner", key: "main:notice-unreported-version" })).toEqual([]);
	});

	test("the verified environment is recorded and never gates admission", () => {
		const foreign = { platform: "linux-arm64", runtime: "some-other-runtime" };

		const listed = testAdapter();
		expect(listed.bind(CODEBASE_TOOLS, { version: "18.5.0", environment: foreign }).bound).toBe(true);
		expect(listed.deliver({ kind: "owner", key: "main:notice-environment-listed" })).toEqual([]);

		const unlisted = testAdapter();
		expect(unlisted.bind(CODEBASE_TOOLS, { version: "18.6.1", environment: foreign }).bound).toBe(true);
		const noticed = unlisted.deliver({ kind: "owner", key: "main:notice-environment-unlisted" });
		// The only admission feedback is about the version: the environment appears in no
		// notice, and it neither admits nor refuses a binding.
		expect(noticed).toHaveLength(1);
		expect(noticed[0]).not.toContain(foreign.platform);
		expect(noticed[0]).not.toContain(foreign.runtime);
	});
});

/**
 * The framework's own Supported agent-runtime baseline (P1, P4, P5; contract S1).
 *
 * Version support belongs to the framework: an assembly declares the capabilities its extension
 * needs and nothing about agent-runtime versions, so the caller that used to hand over its own
 * list now assembles with no options at all. The listed version comes from the repository's
 * support record — an independent source of truth rather than the framework's decision re-read —
 * and the unlisted one is a version independently specified to be outside that baseline.
 */
describe("the framework owns the supported-version baseline (P1, P4, P5)", () => {
	test("an assembly binds with no supported-version list, and the recorded version warns nobody", () => {
		const double = nativeDouble({ version: RECORDED_SUPPORTED_VERSION });

		const { stderr, value: result } = withCapturedStderr(() => {
			const bound = frameworkOmp.ompAdapter(CODEBASE_TOOLS)(double.api);
			double.deliverMain("session-1");
			return bound;
		});

		// Bound, registered and usable: the exact version the support record lists needs no
		// declaration from the assembly, and produces no notice on any channel.
		expect(result.bound).toBe(true);
		expect(double.labels).toEqual(["codeBaseTools"]);
		expect(double.commands).toEqual(["codebase-tools"]);
		expect(double.notifications).toEqual([]);
		expect(stderr).toBe("");
	});

	test("the removed per-assembly list is neither accepted nor consulted", () => {
		// The assembly interface carries no supported-version list any more; this stray value
		// models a caller that still passes one and reaches nothing.
		// @ts-expect-error the assembly interface has no supported-version list
		const factory = frameworkOmp.ompAdapter(CODEBASE_TOOLS, { supportedVersions: ["0.0.0-unlisted"] });
		const double = nativeDouble({ version: RECORDED_SUPPORTED_VERSION });

		const { stderr, value: result } = withCapturedStderr(() => {
			const bound = factory(double.api);
			double.deliverMain("session-1");
			return bound;
		});

		// Not a second decision source: the framework's baseline decides, so the listed runtime
		// stays listed whatever a caller hands over.
		expect(result.bound).toBe(true);
		expect(double.notifications).toEqual([]);
		expect(stderr).toBe("");
	});

	test("a version outside the baseline warns and keeps the extension running", () => {
		const double = nativeDouble({ version: UNLISTED_RUNTIME_VERSION });

		const { stderr, value: result } = withCapturedStderr(() => {
			const bound = frameworkOmp.ompAdapter(CODEBASE_TOOLS)(double.api);
			double.deliverMain("notice-native-unlisted");
			return bound;
		});
		// The run the extension participates in still happens, and the warning is not model
		// context: what the run hook contributes carries none of it.
		const contribution = double.deliverRun("notice-native-unlisted");

		// Warned about and not refused: the extension is labeled and its command is registered.
		expect(result.bound).toBe(true);
		expect(double.labels).toEqual(["codeBaseTools"]);
		expect(double.commands).toEqual(["codebase-tools"]);
		const warnings = double.notifications.filter(notice => notice.type === "warning");
		expect(warnings).toHaveLength(1);
		expect(warnings[0]?.message).toContain(UNLISTED_RUNTIME_VERSION);
		expect(warnings[0]?.message).toContain("my-agent-toolkit");
		expect(warnings[0]?.message).not.toContain(CODEBASE_TOOLS.displayName);
		expect(JSON.stringify(contribution ?? null)).not.toContain("supported set");
		// With a UI the notice travels that channel, never stderr as well.
		expect(stderr).toBe("");
	});

	test("a runtime that reports no version keeps its existing handling", () => {
		const double = nativeDouble();

		const { stderr, value: result } = withCapturedStderr(() => {
			const bound = frameworkOmp.ompAdapter(CODEBASE_TOOLS)(double.api);
			double.deliverMain("session-1");
			return bound;
		});

		// Nothing to compare: no refusal, no inferred version and no notice.
		expect(result.bound).toBe(true);
		expect(double.labels).toEqual(["codeBaseTools"]);
		expect(double.notifications).toEqual([]);
		expect(stderr).toBe("");
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
	bind(definition: ExtensionDefinition, requiredSemantics?: readonly DeclarableRequiredSemantic[]): BindingResult;
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
		bind(definition, requiredSemantics) {
			// One factory per assembly: the declared semantics are that assembly's own options, so
			// two bindings that differ in them are two assemblies rather than one factory reused.
			// The supported-version baseline is not an assembly option: the framework owns it.
			const key = `${definition.id}|${(requiredSemantics ?? []).join(",")}`;
			let factory = factories.get(key);
			if (factory === undefined) {
				factory = frameworkOmp.ompAdapter(
					definition,
					requiredSemantics === undefined ? {} : { requiredSemantics },
				);
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
			double.deliverMain("notice-ui-session");
			double.deliverMain("notice-ui-session", "session_switch");
			double.deliverSubagent();
			return bound;
		});

		expect(result.bound).toBe(true);
		// Continue: the command is registered and the contribution hook is subscribed.
		expect(double.commands).toEqual(["codebase-tools"]);
		expect(double.notifications).toHaveLength(1);
		expect(double.notifications[0]?.type).toBe("warning");
		// The notice is the framework's own warning: it names the framework and the version, never
		// the extension whose binding produced it.
		expect(double.notifications[0]?.message).toContain("my-agent-toolkit");
		expect(double.notifications[0]?.message).not.toContain(CODEBASE_TOOLS.displayName);
		expect(double.notifications[0]?.message).toContain("18.6.1");
		expect(double.notifications[0]?.message).toContain("18.5.0");
		// With a UI the notice is a UI notification, never a stderr write as well.
		expect(stderr).toBe("");
		// The notice is feedback, not model context: it writes no session entry and adds
		// nothing to a run's contribution.
		expect(double.appended).toEqual([]);
		const contribution = double.deliverRun("notice-ui-session");
		expect(JSON.stringify(contribution ?? null)).not.toContain("supported set");
	});

	test("a session without a UI gets the notice as one stderr line", () => {
		const double = nativeDouble({ version: "18.6.1", hasUI: false });

		const { stderr, value: result } = withCapturedStderr(() => {
			const bound = double.bind(CODEBASE_TOOLS);
			double.deliverMain("notice-headless-session");
			double.deliverMain("notice-headless-session", "session_switch");
			return bound;
		});

		expect(result.bound).toBe(true);
		expect(double.notifications).toEqual([]);
		const noticeLines = stderr.split("\n").filter(line => line.includes("supported set"));
		expect(noticeLines).toHaveLength(1);
		expect(noticeLines[0]).toContain("my-agent-toolkit");
		expect(noticeLines[0]).not.toContain(CODEBASE_TOOLS.displayName);
		expect(noticeLines[0]).toContain("18.6.1");
		expect(noticeLines[0]).toContain("18.5.0");
	});

	test("a subagent's delivery neither publishes the notice nor counts as the session it follows", () => {
		const double = nativeDouble({ version: "18.6.1" });

		withCapturedStderr(() => {
			double.bind(CODEBASE_TOOLS);
			// The subagent's own delivery comes first, and the owner it resolves — by the runtime's
			// own registry — is the main session that spawned it.
			double.deliverSubagent();
		});

		// Nothing is published for a session that is not its own owner.
		expect(double.notifications).toEqual([]);

		withCapturedStderr(() => {
			// The owner's own delivery is still the first delivery *of that owner*: a subagent that
			// was resolved to it does not stand in for it, so the notice is published here.
			double.deliverMain("owner-session");
			// And the subagent's further deliveries publish nothing either.
			double.deliverSubagent();
		});

		expect(double.notifications).toHaveLength(1);
		expect(double.notifications[0]?.message).toContain("18.6.1");
	});

	test("two main sessions of one process are two Owners, each warned once of its own", () => {
		const double = nativeDouble({ version: "18.6.1" });

		withCapturedStderr(() => {
			double.bind(CODEBASE_TOOLS);
			double.deliverMain("notice-owner-a");
			double.deliverMain("notice-owner-a", "session_switch");
			double.deliverMain("notice-owner-b");
		});

		// Per Owner, not per process: the version decision is shared, the notice is not.
		expect(double.notifications).toHaveLength(2);
		expect(double.notifications[0]?.message).toBe(double.notifications[1]?.message);
		expect(double.notifications[0]?.message).toContain("18.6.1");
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
			double.deliverMain("notice-rebound-session");
			// The loader binds the same assembly again for another session (or re-entry);
			// the notice this process already published for this Owner is not published again.
			double.bind(CODEBASE_TOOLS);
			double.deliverMain("notice-rebound-session");
		});

		expect(double.notifications).toHaveLength(1);
	});
});

describe("the declared semantic dependencies on the OMP adapter (P26, F8)", () => {
	test("a surface without the lifecycle subscription refuses the declared semantics, and names them", () => {
		const double = nativeDouble({ version: "18.5.0", withoutLifecycleSubscription: true });

		const { stderr, value: result } = withCapturedStderr(() => {
			const bound = double.bind(CODEBASE_TOOLS, [SESSION_EVENTS, ROUND_EVENTS]);
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
			const bound = double.bind(CODEBASE_TOOLS, [SESSION_EVENTS, ROUND_EVENTS]);
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
			const result = frameworkOmp.ompAdapter(definition, { configBaseDir: repository })(double.api);

			expect(result.bound).toBe(true);
			expect(double.labels).toEqual(["based-assembly"]);
			expect(getConfig(definition)).toEqual({ endpoint: "http://base-directory.local:8787" });
		} finally {
			rmSync(repository, { recursive: true, force: true });
		}
	});
});

/**
 * What connect-bot's own deployed assembly meets at admission (P42).
 *
 * Everything above drives the adapter from a definition this suite holds; this block drives the
 * deployed assembly instead — the factory `entrypoints/omp/connect-bot.ts` re-exports — so the
 * version and semantics under test are the ones a real session on a recorded runtime meets.
 * The native surface stays the double above: which version a runtime reports and whether it
 * subscribes lifecycle events are facts of the runtime itself, and no real install can be asked
 * to vary them. What the extension depends on it still declares — its configuration and its two
 * semantic axes — while version support is the framework's baseline, not this assembly's.
 *
 * The extension declares a configuration, and this block fixes where its file is read from: the
 * assembly supplies the repository root it derives from its own module location, so the binding
 * reads `extensions/connect-bot/config.yaml` under that root whatever the process's working
 * directory is. A read happens once per extension per module graph, so the binding behavior is
 * observed where a load really reads — the loader and session tests in deployment.test.ts, which
 * bind this entrypoint from a working directory outside this repository.
 */
describe("connect-bot's deployed assembly at admission (P42)", () => {
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
			double.deliverMain("notice-connect-bot-session");
			// A later boundary of the same session is not a second session.
			double.deliverMain("notice-connect-bot-session", "session_switch");
		});

		// Continue: the command the extension owns is registered either way.
		expect(double.commands).toEqual(["connect-bot"]);
		expect(double.notifications).toHaveLength(1);
		expect(double.notifications[0]?.type).toBe("warning");
		const notice = double.notifications[0]?.message ?? "";
		// The notice is the framework's: it names the framework, the version the runtime reported
		// and the set the framework's baseline holds — and no extension of this process.
		expect(notice).toContain("my-agent-toolkit");
		expect(notice).not.toContain("connectBot");
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
