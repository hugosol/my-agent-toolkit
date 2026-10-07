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
 * before registration: a required semantic the runtime cannot honor refuses the binding,
 * while an unlisted version only schedules the once-per-main-session notice and lets
 * binding continue. Failures are reported once each and returned as data; the caller's
 * agent runtime keeps running with the extension unbound.
 */
import { type AdmissionFacts, AdmissionNotices, admit } from "../core/admission";
import { BOUND_CONTROL_KINDS, activationField, type ExtensionDefinition } from "../core/definition";
import {
	type AgentRuntimePort,
	type BindingFailure,
	type BindingResult,
	describeBindingFailure,
} from "../core/protocol";
import type { StateStore } from "../core/state";
import { findConfigurationViolations } from "../core/violations";
import { announceUnlistedVersion } from "./admission";
import { runCommandToggle } from "./control";
import { planContribution } from "./injection";
import { publishMarkerOnRun, registerMarker } from "./marker";
import { reconcileSession } from "./session";

/**
 * The admission inputs one binding resolves: the versions the extension declares support
 * for, the agent-runtime facts the adapter observed, and the notice ledger of the
 * assembly this binding belongs to.
 */
export interface BindingAdmission {
	readonly supportedVersions: readonly string[];
	readonly facts: AdmissionFacts;
	/**
	 * The once-per-main-session notice ledger, shared by every binding of one assembly:
	 * the loader binds an assembly once per session, and the session must still be told
	 * about an unlisted version exactly once.
	 */
	readonly notices: AdmissionNotices;
}

/**
 * The v1 initialization rules: what the framework must be able to honor before it
 * registers anything. Returns the failure detail, or `undefined` when the definition
 * can be bound.
 */
function findInitializationFailure(definition: ExtensionDefinition): string | undefined {
	if (definition.id.trim().length === 0) return "the definition declares no extension id";
	if (definition.displayName.trim().length === 0) return "the definition declares no display name";

	// The control kinds are a closed union, and this version binds `toggle` only: a
	// declaration of any other kind is refused rather than dropped on the floor.
	const unboundControl = (definition.commands ?? []).find(
		command => !BOUND_CONTROL_KINDS.includes(command.type),
	);
	if (unboundControl !== undefined) {
		return `command "${unboundControl.name}" declares control kind "${unboundControl.type}", which this framework version does not bind`;
	}

	// v1 owns exactly one State field per extension: a command that transitions any
	// other field would be a silently ignored declaration.
	const field = activationField(definition);
	const foreignWriter = (definition.commands ?? []).find(command => command.state !== field);
	if (foreignWriter !== undefined) {
		return `command "${foreignWriter.name}" transitions State field "${foreignWriter.state}", but the extension's State field is "${field}"`;
	}

	return undefined;
}

/**
 * Binds a definition to an agent runtime, or refuses to.
 *
 * A refused definition contributes nothing — no label, no commands, no injections,
 * no marker — and reports one diagnostic per declared conflict. Nothing about a
 * *binding* is retained: no process-level registry exists to leak a partial binding
 * into the next session, which is why the same factory can bind every session and
 * subagent independently, and why each refused binding reports its own error.
 *
 * `state` is the one thing that outlives a binding: the adapter owns one store per
 * extension per process, so bindings for different sessions share the owner-keyed
 * cells rather than each starting from a private copy. `admission`'s notice ledger
 * outlives a binding for the same reason: one assembly has one per process.
 */
export function bindExtension(
	definition: ExtensionDefinition,
	port: AgentRuntimePort,
	state: StateStore,
	admission: BindingAdmission,
): BindingResult {
	const failures: BindingFailure[] = findConfigurationViolations(definition).map(violation => ({
		kind: "configuration",
		violation,
	}));

	if (failures.length === 0) {
		const detail = findInitializationFailure(definition);
		if (detail !== undefined) failures.push({ kind: "initialization", detail });
	}

	if (failures.length > 0) {
		for (const failure of failures) port.reportDiagnostic(describeBindingFailure(definition.id, failure));
		return { bound: false, failures };
	}

	// The runtime-level admission step, still before the first registration. A required
	// semantic the runtime cannot honor refuses the binding outright; an unlisted version
	// is not a refusal, and its notice is published by the session behavior below.
	const outcome = admit(admission.supportedVersions, admission.facts);
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
				announceUnlistedVersion(definition, outcome, admission.notices, session);
			}
			reconcileSession(definition, state, session);
		});
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
			if (command.type !== "toggle") continue;
			port.registerCommand({
				name: command.name,
				description: command.description,
				run: invocation => runCommandToggle(definition, command, state, invocation),
			});
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
