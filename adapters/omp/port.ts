/**
 * The OMP port: the framework's native seam, bound to one session.
 *
 * This module only connects the adapter's native mappings: the newest-context tracker every delivery
 * records itself through, the one State entry the session and command paths share, one owner
 * resolution and its ownerless diagnostic, the native registry integration answer, the binding's
 * diagnostic channel, and the composition of the hooks the framework registers. Session, Context,
 * Turn, Round and user-input deliveries are assembled by their own modules; commands and prompts
 * keep their mappings beside them.
 *
 * The module-level {@link OMP_PORT} is the actual assembly source: every member `HarnessPort`
 * states is bound here, including the optional members OMP has no fact for, which are recorded as
 * statically unavailable rather than omitted from the shape. The compiler checks the key set and
 * each factory's result against `HarnessPort`; today that is a typed convention, not a syntax
 * restriction — a future source gate can inspect this shape.
 *
 * It carries no extension semantics: what to register comes from the definition, whether it may be
 * registered is decided by the harness-independent behavior, and what a command does is the
 * framework's control behavior.
 */
import { reportDiagnostic } from "../../framework/core/diagnostics";
import { defineAdapterPort, unavailablePortMember } from "../../framework/runtime/adapter-authoring";
import type { ExtensionDefinition } from "../../framework/interface/details/definition";
import type { OwnerReference } from "../../framework/interface/state";
import type { HarnessPort } from "../../framework/runtime/port";
import { observeSessionContext } from "./native/extensibility/extensions/context";
import { createContextTracker, type ContextTracker } from "./native/extensibility/extensions/context";
import { registerControl } from "./native/extensibility/extensions/commands";
import { registerOmpTool } from "./native/extensibility/extensions/tools";
import { feedbackTransport } from "./native/extensibility/extensions/feedback";
import { markerTransport } from "./native/extensibility/extensions/marker";
import type { OmpExtensionApi, OmpSessionContext } from "./native/extensibility/extensions/types";
import type { OmpProviderFacts } from "./native/config/model-registry";
import { observeRunInitiation } from "./native/extensibility/extensions/prompts";
import { stateEntryOf, type OmpStateEntry } from "./native/session/session-manager";
import {
	observeRoundEvents,
	observeSessionEvents,
	observeTurnEvents,
	observeUserInputEvents,
	type SessionEventContext,
} from "./native/extensibility/extensions/lifecycle";
import { ownerReferenceOf } from "./native/extensibility/extensions/session-facts";
import { createViewedSession } from "./native/extensibility/extensions/viewed-session";
import { subagentIntegrationOf } from "./native/registry/agent-registry";

/** The process-level readers every binding of one assembly answers through. */
export interface PortDependencies {
	readonly providerFacts: OmpProviderFacts;
}

/**
 * The per-binding references every {@link OMP_PORT} member is built from.
 *
 * One binding owns one tracker, one State entry and one diagnostic channel; the port factories are
 * lazy and only read them, so a later delivery and a later command see the same references the
 * first one did.
 */
export interface OmpPortContext {
	readonly pi: OmpExtensionApi;
	readonly providerFacts: OmpProviderFacts;
	/** The newest native context this binding's deliveries came from. */
	readonly context: ContextTracker;
	/** The one State entry session restoration and commands share. */
	readonly stateEntry: OmpStateEntry;
	readonly record: (ctx: OmpSessionContext) => OmpSessionContext;
	readonly ownerOf: (ctx: OmpSessionContext) => OwnerReference;
	readonly reportDiagnostic: (message: string) => void;
	readonly reportMissingFact: (fact: string) => undefined;
	readonly sessionEvents: SessionEventContext;
}

/**
 * The one port this adapter assembles: every member `HarnessPort` states is bound here, and the
 * two optional members OMP has no fact for are recorded as statically unavailable rather than
 * conditionally omitted from the shape.
 *
 * `OMP_PORT.create` evaluates each factory once per binding, in this order; constructing the
 * definition itself evaluates none of them. The bindings are the runtime assembly source, not a
 * second capability inventory.
 */
export const OMP_PORT = defineAdapterPort<OmpPortContext>({
	setLabel: context => label => context.pi.setLabel(label),
	// The non-model channel this binding reports on. Startup happens before any UI exists, so a
	// diagnostic goes to stderr: it is user-visible and can never reach model context.
	reportDiagnostic: context => context.reportDiagnostic,
	modelPrices: context => context.providerFacts.prices,
	providerAccess: context => context.providerFacts.access,
	viewedSession: context => createViewedSession(context.pi, context.context, markerTransport).viewedSession,
	// This harness integrates subagent observations itself; the native registry mapping answers how that
	// integration stands, so the port carries no inline capability fact of its own.
	subagentIntegration: () => subagentIntegrationOf,
	onSession: context => handler => observeSessionEvents(context.pi, context.sessionEvents, handler),
	onRound: context => observer => observeRoundEvents(context.pi, context.sessionEvents, observer),
	onSessionContext: context => handler =>
		observeSessionContext(context.pi, handler, { record: context.record, owner: context.ownerOf }),
	nextTask: () => callback => {
		// The harness's next task: a macrotask that runs after this callback returned and after
		// everything already queued — the session's own unwinding and any input it drained — has
		// had its turn. Nothing here waits on a duration or repeats.
		setTimeout(callback, 0);
	},
	onUserInput: context => handler => observeUserInputEvents(context.pi, context.sessionEvents, handler),
	onTurn: context => handler => observeTurnEvents(context.pi, context.sessionEvents, handler),
	onRunInitiation: context => handler =>
		observeRunInitiation(context.pi, handler, {
			record: context.record,
			owner: context.ownerOf,
			markers: markerTransport,
		}),
	registerTool: context => registerOmpTool(context.pi),
	registerCommand: context => command => {
		registerControl(context.pi, command, {
			record: context.record,
			owner: context.ownerOf,
			persist: context.stateEntry.persist,
			feedback: feedbackTransport,
			markers: markerTransport,
			reportMissingFact: context.reportMissingFact,
		});
	},
	// Static absences, stated rather than conditionally omitted. OMP states a session's disposal
	// where the framework's own session facts already reach (its `session_shutdown` event is the
	// `session_end` this adapter reports), and offers no awaitable exit position of its own, so a
	// round is left to the facts that binding already publishes. Every session this harness runs
	// is a binding in this process, so there is no cross-process observation seat to offer either.
	onDisposal: unavailablePortMember(
		"this harness reports a disposal as its session-end event and offers no awaitable exit position to close a round from",
	),
	sessionObservationAccess: unavailablePortMember(
		"this entry observes each session in the process that runs it; no cross-process observation seat exists here",
	),
});

/** Builds the framework's port onto OMP, bound to one session and the extension's State key. */
export function createOmpPort(
	pi: OmpExtensionApi,
	definition: ExtensionDefinition,
	dependencies: PortDependencies,
): HarnessPort {
	// One tracker per binding: the provider facts are the process's readers, but the newest context is
	// the one this binding's own deliveries reported.
	const context = createContextTracker([dependencies.providerFacts.saw]);
	const record = context.record;
	// One State entry per binding: session restoration and commands are two uses of it.
	const stateEntry = stateEntryOf(pi, definition);

	// The non-model channel this binding reports on. Startup happens before any UI exists, so a
	// diagnostic goes to stderr: it is user-visible and can never reach model context.
	const reportBindingDiagnostic = (message: string): void => {
		reportDiagnostic(`${definition.id}: ${message}`);
	};
	// At most one report is made per native fact per binding — the first delivery that finds a
	// fact this harness does not report says so, and every later one stays quiet — so a
	// missing-fact report neither repeats per delivery nor hides behind another fact's report.
	const reportedMissingFacts = new Set<string>();
	const reportMissingFact = (fact: string): undefined => {
		if (!reportedMissingFacts.has(fact)) {
			reportedMissingFacts.add(fact);
			reportBindingDiagnostic(
				`this harness reports no ${fact}; the framework answers nothing rather than inventing one`,
			);
		}
		return undefined;
	};

	// At most one ownerless diagnostic per binding: the first delivery that resolves no owner
	// reports it, and every later one stays quiet.
	let reportedOwnerless = false;
	const ownerOf = (ctx: OmpSessionContext): OwnerReference => {
		const owner = ownerReferenceOf(pi, ctx);
		if (owner.kind === "unresolved" && !reportedOwnerless) {
			reportedOwnerless = true;
			// Best-effort and user-visible only: the extension stays bound and keeps running.
			reportBindingDiagnostic(
				"no owning main session resolved for this session; the extension stays off",
			);
		}
		return owner;
	};

	const sessionEvents: SessionEventContext = {
		record,
		owner: ownerOf,
		stateEntry,
		reportMissingFact,
		reportBindingDiagnostic,
	};

	return OMP_PORT.create({
		pi,
		providerFacts: dependencies.providerFacts,
		context,
		stateEntry,
		record,
		ownerOf,
		reportDiagnostic,
		reportMissingFact,
		sessionEvents,
	});
}
