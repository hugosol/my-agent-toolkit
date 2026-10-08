/**
 * Binding a declarative extension definition to an agent runtime — the reusable,
 * agent-runtime-independent half of the framework.
 *
 * This module is adapter-facing, not an author entry: extension authors declare with
 * `framework/public.ts`, and an agent-runtime adapter (for OMP, `framework/adapters/omp.ts`)
 * calls into this.
 *
 * Ordering is the contract: every fallible step (configuration rules, initialization,
 * admission) runs before the first registration, so a definition the framework refuses to
 * honor leaves nothing registered. Admission is the runtime-level step and the last one
 * before registration: a semantic the runtime cannot honor refuses the binding when it is
 * required of it — the framework requires history preservation of every binding, and an
 * assembly may declare the capability its extension additionally depends on — while an
 * unlisted version only makes the session's once-per-Owner notice due and lets binding
 * continue. Failures are reported once each and returned as data; the caller's agent
 * runtime keeps running with the extension unbound.
 */
import { type AdmissionFacts, admit, type DeclarableRequiredSemantic } from "../core/admission";
import {
	BOUND_CONTROL_KINDS,
	BOUND_STATE_INHERITANCES,
	BOUND_STATE_PERSISTENCES,
	activationField,
	type ExtensionDefinition,
} from "../core/definition";
import {
	type AgentRuntimePort,
	type BindingFailure,
	type BindingResult,
	type CommandActions,
	describeBindingFailure,
	type SemanticEventHandlers,
} from "../core/protocol";
import type { StateStore } from "../core/state";
import { findConfigFailure, type ConfigSource } from "../core/config";
import { findConfigurationViolations } from "../core/violations";
import { announceUnlistedVersion } from "./admission";
import { runCommandDirected, runCommandToggle } from "./control";
import { planContribution } from "./injection";
import { publishMarkerOnRun, registerMarker } from "./marker";
import { dispatchRoundEvent } from "./round-events";
import { dispatchSessionEvent } from "./session-events";

/**
 * The admission inputs one binding resolves: the agent-runtime facts the adapter observed and the
 * semantics this binding's assembly declared its extension depends on.
 *
 * The supported-version set is deliberately not here: version membership is decided against the
 * framework's own Supported agent-runtime baseline, so no assembly supplies, widens or replaces
 * it ({@link admit}). Neither is a notice ledger: the unlisted-version notice is the framework's
 * and it is published per Owner for the whole process, so no assembly carries a record of it
 * (`framework/behaviors/admission.ts`).
 */
export interface BindingAdmission {
	readonly facts: AdmissionFacts;
	/**
	 * The semantics this binding's assembly declared the extension depends on, besides the
	 * ones the framework requires of every binding — the assembly option that turns a gap
	 * the runtime has into a refusal instead of a capability the extension works around.
	 * Omitted when the assembly declared none, which is what most extensions do.
	 */
	readonly requiredSemantics?: readonly DeclarableRequiredSemantic[];
}

/**
 * The v1 initialization rules: what the framework must be able to honor before it
 * registers anything. Returns the failure detail, or `undefined` when the definition
 * can be bound.
 */
function findInitializationFailure(
	definition: ExtensionDefinition,
	actions: CommandActions,
): string | undefined {
	if (definition.id.trim().length === 0) return "the definition declares no extension id";
	if (definition.displayName.trim().length === 0) return "the definition declares no display name";

	// The control kinds are a closed union, and this version binds the ones it implements:
	// a declaration of any other kind is refused rather than dropped on the floor.
	const unboundControl = (definition.commands ?? []).find(
		command => !BOUND_CONTROL_KINDS.includes(command.type),
	);
	if (unboundControl !== undefined) {
		return `command "${unboundControl.name}" declares control kind "${unboundControl.type}", which this framework version does not bind`;
	}

	// A directed command is a declaration plus an implementation: the definition names the
	// command and its field, and the assembly injects the implementation. Registering a
	// declaration whose implementation never arrived would give the user a command that does
	// nothing, so the incomplete pair is refused before the first registration instead.
	const unpaired = (definition.commands ?? []).find(
		command => command.type === "directed" && actions[command.name] === undefined,
	);
	if (unpaired !== undefined) {
		return `command "${unpaired.name}" declares control kind "directed", but no implementation was injected for it`;
	}

	// v1 owns exactly one State field per extension: a command that transitions any
	// other field would be a silently ignored declaration.
	const field = activationField(definition);
	const foreignWriter = (definition.commands ?? []).find(command => command.state !== field);
	if (foreignWriter !== undefined) {
		return `command "${foreignWriter.name}" transitions State field "${foreignWriter.state}", but the extension's State field is "${field}"`;
	}

	// The State lifecycle axes are closed unions like the control kinds, and this version
	// honors the members it implements: a value outside them would otherwise be read as the
	// default one, so the declaration is refused before the first registration instead. A
	// declaration that is not a State object at all cannot be read as one either, so it is
	// refused here rather than silently read as the defaults.
	const declaredState: unknown = definition.state;
	if (
		declaredState !== undefined &&
		(typeof declaredState !== "object" || declaredState === null || Array.isArray(declaredState))
	) {
		return `state declares "${String(declaredState)}", which is not a State declaration`;
	}

	const persistence = definition.state?.persistence;
	if (persistence !== undefined && !BOUND_STATE_PERSISTENCES.includes(persistence)) {
		return `state declares persistence "${persistence}", which this framework version does not bind`;
	}

	const inheritance = definition.state?.inheritance;
	if (inheritance !== undefined && !BOUND_STATE_INHERITANCES.includes(inheritance)) {
		return `state declares inheritance "${inheritance}", which this framework version does not bind`;
	}

	return undefined;
}

/**
 * Binds a definition to an agent runtime, or refuses to.
 *
 * A refused definition contributes nothing — no label, no commands, no injections,
 * no marker — and reports one diagnostic per failure: a declared conflict, or a declared
 * configuration its file cannot satisfy. Nothing about a *binding* is retained: no
 * process-level registry exists to leak a partial binding into the next session, which is
 * why the same factory can bind every session and subagent independently, and why each
 * refused binding reports its own error.
 *
 * `state` is the one thing the adapter owns that outlives a binding: the adapter owns one
 * store per extension per process, so bindings for different sessions share the owner-keyed
 * cells rather than each starting from a private copy. The framework's own notice record
 * outlives a binding differently — it is not an assembly's at all: one process holds it per
 * Owner, so every extension's bindings publish for that Owner through the same record
 * (`framework/behaviors/admission.ts`).
 *
 * `actions` is the assembly half of a directed command: its implementations, keyed by
 * command name. The declaration says which command and which field, and this is what the
 * command runs; a directed declaration with no entry here is refused with the
 * initialization failures, so a registered command always has something to run and an
 * assembly that declares no directed command passes nothing.
 *
 * `events` is the assembly half of the semantic lifecycle subscription: the handlers, keyed by
 * the event each subscribes to. The framework's own session behavior runs for every session
 * delivery whether or not a handler arrived, and a subscribed session handler runs after it;
 * the round axis has no framework behavior of its own (three-valued agent state is not framework
 * State), so its hook is subscribed only when the assembly injected a handler for one of its
 * edges.
 *
 * `configSource` is the seam a declared configuration is read through: the reader and the
 * parser (this process's own file system and the pure-JS YAML parser by default, and a test's
 * where a suite drives a failure path without a file), plus the directory a relative declared
 * path is resolved against — the extension repository root the assembly supplies, since a
 * binding runs in an arbitrary project directory. It is read only when the definition declared
 * a configuration, and it is not binding state: the values it validates belong to the extension
 * for this process — they are what `getConfig` hands its shared logic — not to this binding.
 */
export function bindExtension(
	definition: ExtensionDefinition,
	port: AgentRuntimePort,
	state: StateStore,
	admission: BindingAdmission,
	actions: CommandActions = {},
	events: SemanticEventHandlers = {},
	configSource: ConfigSource = {},
): BindingResult {
	const failures: BindingFailure[] = findConfigurationViolations(definition).map(violation => ({
		kind: "configuration",
		violation,
	}));

	// The declared configuration, still before the first registration and on the same
	// deterministic path as the declaration conflicts above: an extension whose declared
	// file cannot satisfy its declaration is refused whole, and the extensions that loaded
	// keep running. A definition that declares no configuration is untouched.
	if (failures.length === 0) {
		const configDetail = findConfigFailure(definition, configSource);
		if (configDetail !== undefined) {
			failures.push({ kind: "configuration", violation: { kind: "config", detail: configDetail } });
		}
	}

	if (failures.length === 0) {
		const detail = findInitializationFailure(definition, actions);
		if (detail !== undefined) failures.push({ kind: "initialization", detail });
	}

	if (failures.length > 0) {
		for (const failure of failures) port.reportDiagnostic(describeBindingFailure(definition.id, failure));
		return { bound: false, failures };
	}

	// The runtime-level admission step, still before the first registration. A required
	// semantic the runtime cannot honor refuses the binding outright — required meaning the
	// framework's own semantics plus whatever this assembly declared — while an unlisted
	// version is not a refusal, and its notice is published by the session behavior below.
	// The version axis is decided against the framework's own Supported agent-runtime baseline:
	// this assembly declared no version list and cannot.
	const outcome = admit(admission.facts, admission.requiredSemantics ?? []);
	if (outcome.kind === "required-semantics-missing") {
		const failure: BindingFailure = { kind: "required-semantics", missing: outcome.missing };
		port.reportDiagnostic(describeBindingFailure(definition.id, failure));
		return { bound: false, failures: [failure] };
	}

	// Registration is a single commit after all validation: the extension is labeled, its
	// State reconciles at every session boundary this binding observes, its injection slots
	// are planned at every run initiation, its marker joins the framework's unified area,
	// and, in declaration order, its commands are registered against the same store.
	// Anything the agent runtime refuses here leaves the extension reported as unbound;
	// the framework itself keeps nothing on either outcome.
	try {
		port.setLabel(definition.displayName);
		port.onSession(session => {
			if (outcome.kind === "unlisted-version") {
				announceUnlistedVersion(outcome, session);
			}
			// The framework's own behavior runs before the extension's handler, and a handler
			// that throws is reported rather than allowed to disturb the framework or another
			// binding: see `session-events.ts` for the order and the isolation.
			dispatchSessionEvent(definition, state, session, events, port.reportDiagnostic);
		});
		// The round axis is subscribed only when this assembly observes one of its edges. Unlike
		// the session subscription above there is no framework behavior to run for a round — the
		// agent's work state is not framework State — so a definition that subscribed to no round
		// asks the runtime for no round deliveries, and its binding registers no such hook.
		if (events.round_start !== undefined || events.round_end !== undefined) {
			port.onRound(round => dispatchRoundEvent(definition, events, round, port.reportDiagnostic));
		}
		// The run-initiation hook is subscribed when the definition participates in a run at
		// all — a slot to contribute or a marker to re-assert; a definition with neither
		// installs no handler. The behaviors themselves write nothing, so a re-entered
		// delivery plans the same contribution and re-asserts the same area from the same
		// State and branch facts.
		const contributes = (definition.prompts ?? []).length > 0;
		if (contributes || definition.marker !== undefined) {
			port.onRunInitiation(run => {
				publishMarkerOnRun(definition, state, run);
				return contributes ? planContribution(definition, state, run) : undefined;
			});
		}
		registerMarker(definition, state);
		for (const command of definition.commands ?? []) {
			switch (command.type) {
				case "toggle":
					port.registerCommand({
						name: command.name,
						description: command.description,
						run: invocation => runCommandToggle(definition, command, state, invocation),
					});
					break;
				case "directed": {
					// The pair was completed at validation, so an implementation is present here;
					// the check is what makes that reachable for the compiler as well as for plain
					// JavaScript.
					const implementation = actions[command.name];
					if (implementation === undefined) break;
					port.registerCommand({
						name: command.name,
						description: command.description,
						run: invocation =>
							runCommandDirected(definition, command, state, invocation, implementation),
					});
					break;
				}
			}
		}
	} catch (error) {
		const failure: BindingFailure = {
			kind: "initialization",
			detail: `registration failed: ${error instanceof Error ? error.message : String(error)}`,
		};
		port.reportDiagnostic(describeBindingFailure(definition.id, failure));
		return { bound: false, failures: [failure] };
	}

	return { bound: true, definition };
}
