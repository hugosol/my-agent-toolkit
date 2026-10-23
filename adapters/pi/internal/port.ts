/**
 * The pi adapter's port: each native axis mapped into the framework's surface, with the shared
 * binding state that makes the slices agree.
 *
 * The composition below only connects the slices. Session events, context collection, Turn, Round,
 * user input, commands, prompt planning and public effects each own a complete native
 * responsibility in their own module; no slice reaches into another axis's facts.
 */
import { defineAdapterPort, unavailablePortMember } from "../../../framework/runtime/adapter-authoring";
import type { ExtensionDefinition } from "../../../framework/interface/details/definition";
import type { SessionFacts, SessionStartReason } from "../../../framework/interface/session";
import type { OwnerReference } from "../../../framework/interface/state";
import type { SubagentIntegration } from "../../../framework/interface/subagent";
import type { HarnessPort, SessionDisposal } from "../../../framework/runtime/port";
import { onPiSessionContext } from "../native/core/extensions/context";
import { registerPiCommand } from "../native/core/extensions/commands";
import type { PiExtensionApi, PiExtensionContext } from "../native/core/extensions/types";
import { onPiRunInitiation } from "../native/core/extensions/prompt";
import type { PiProviderFacts } from "../native/core/model-registry";
import { piStateEntryType, piStatePersistence, type PiStatePersistence } from "../native/core/session-manager/state";
import { onPiDisposal, onPiSession, onPiUserInput } from "../domain/session/events";
import {
	piSessionFactsOf,
	type PiSessionPosition,
	type PiSessionPositions,
} from "../domain/session/queries";
import { onPiRound } from "../domain/session/round";
import { onPiTurn } from "../domain/session/turn";
import type { PiSubagentIntegration } from "../domain/subagent/integration";

/** What the assembly supplies to build one binding's port. */
export interface PiPortInput {
	readonly pi: PiExtensionApi;
	readonly definition: ExtensionDefinition;
	readonly positions: PiSessionPositions;
	readonly integration: PiSubagentIntegration | undefined;
	readonly providerFacts: PiProviderFacts;
	readonly keepSubscription: (release: () => void) => void;
}

/**
 * The port one pi binding assembles when the assembly states a child entry.
 *
 * `subagentIntegration` is required rather than optional because the process's integration object
 * exists for such an assembly: the member settles that object's one answer, and an absent value is
 * never one of its outcomes. This is the assembly's own output contract — the shape its binding
 * constructs — not a statement that a third-party provider is installed or answers correctly.
 */
export interface PiPortWithSubagents extends HarnessPort {
	readonly subagentIntegration: () => SubagentIntegration | Promise<SubagentIntegration>;
}

/**
 * The port one pi binding assembles when the assembly states no child entry.
 *
 * There is nothing to require in spawned sessions and nothing to settle, so the member is declared
 * deliberately absent rather than left as the generic optional function. An undefined reading here
 * means "this assembly has no such integration", never "the framework did not check".
 */
export interface PiPortWithoutSubagents extends HarnessPort {
	readonly subagentIntegration?: undefined;
}

/** One pi binding's complete port, plus the diagnostics its assembly publishes. */
export interface PiPortResult<Port extends HarnessPort = HarnessPort> {
	readonly port: Port;
	readonly reportDiagnostic: (message: string) => void;
}

/** The mutable life of one binding: the owner it serves and the diagnostics reported once. */
export interface PiPortState {
	/** The label diagnostics are prefixed with; `setLabel` moves it without touching the host. */
	label: string;
	/** The owner this binding currently serves, and its facts. */
	activeOwner?: { readonly key: string; readonly session: SessionFacts };
	/** The session whose subagent requirement this binding's owner node is asking about. */
	servingSessionId?: string;
	/** Whether the unresolved-owner diagnostic was already reported for this binding. */
	reportedOwnerless: boolean;
	/** The framework's close-out hook, once the binding registered one. */
	reportDisposal?: (disposal: SessionDisposal) => void | Promise<void>;
}

/** Everything one binding's port assembly and its slices read from each other. */
export interface PiPortContext {
	readonly pi: PiExtensionApi;
	readonly state: PiPortState;
	/** The one native branch entry used by both Session restoration and command writes. */
	readonly stateEntryType: string;
	readonly statePersistence: PiStatePersistence;
	/** The assembly's process-scoped provider readings, bound as the port's price and access members. */
	readonly providerFacts: PiProviderFacts;
	readonly integration: PiSubagentIntegration | undefined;
	/** Sessions this binding has observed end, by identity; deltas read it late. */
	readonly endedSessions: Set<string>;
	readonly keepSubscription: (release: () => void) => void;
	reportDiagnostic(message: string): void;
	reportMissingFact(fact: string): undefined;
	reportUnread(reason: string): void;
	catalogued(ctx: PiExtensionContext): PiExtensionContext;
	resolvedOwner(owner: OwnerReference): OwnerReference;
	resolveOwner(ctx: PiExtensionContext): OwnerReference;
	positionOf(ctx: PiExtensionContext, reason?: SessionStartReason): PiSessionPosition;
	sessionFactsOf(ctx: PiExtensionContext, reason?: SessionStartReason): SessionFacts;
}

/**
 * The one port this adapter assembles: every member `HarnessPort` states is bound here, including
 * the two optional members pi has no fact for, which are recorded as statically unavailable rather
 * than omitted from the shape. `PI_PORT.create` evaluates each factory once per binding, in this
 * order; constructing the definition itself evaluates none of them.
 *
 * The compiler checks the key set and each factory's result against `HarnessPort`. This module-level
 * shape is what a future syntax gate can inspect; today it is a typed convention, not a syntax
 * restriction.
 */
export const PI_PORT = defineAdapterPort<PiPortContext>({
	// pi.setLabel labels a history ENTRY, not an extension. Keep this label on
	// diagnostics instead of misusing that unrelated native operation.
	setLabel: context => value => { context.state.label = value; },
	reportDiagnostic: context => context.reportDiagnostic,
	modelPrices: context => context.providerFacts.prices,
	providerAccess: context => context.providerFacts.access,
	// The process's one settling of this entry's subagent integration, asked at the owner node:
	// it is the session this binding serves then, and the answer is that process's own. An assembly
	// without an integration answers no member at all; the check happens once, when the port is
	// created, exactly where the conditional spread used to decide it.
	subagentIntegration: context => {
		const integration = context.integration;
		return integration === undefined ? undefined : () => integration.settle(context.state.servingSessionId);
	},
	onSession: context => onPiSession(context),
	nextTask: () => callback => {
		// The harness's next task: a macrotask that runs after this callback returned and after
		// everything already queued — pi's own unwinding and any message it drained — has had its
		// turn. Nothing here waits on a duration or repeats.
		setTimeout(callback, 0);
	},
	onRound: context => onPiRound(context),
	// The framework's close-out of a session pi is disposing: this adapter reports the fact and
	// waits for what the framework owes it, and the native shutdown subscription is where it is
	// reported — before the session axis's own end, which is what stops this binding delivering.
	onDisposal: context => onPiDisposal(context),
	onSessionContext: context => onPiSessionContext(context),
	onTurn: context => onPiTurn(context),
	onUserInput: context => onPiUserInput(context),
	onRunInitiation: context => onPiRunInitiation(context),
	registerCommand: context => registerPiCommand(context),
	// Static adapter absences, not claims that the native harness cannot offer these features.
	// The framework's existing observation access and delivery-position fallbacks are unchanged.
	sessionObservationAccess: unavailablePortMember(
		"this adapter does not provide a cross-process session-observation outlet",
	),
	viewedSession: unavailablePortMember(
		"this adapter does not provide a displayed-session outlet; delivery-position projection remains in use",
	),
});

/**
 * Builds one binding's port from the assembly's process-scoped readings.
 *
 * The overloads state the contract the assembly declared: an integration present produces the
 * enabled port, an explicitly absent one produces the port that declares the member unavailable,
 * and an unresolved input (`PiSubagentIntegration | undefined`) keeps the union because neither
 * outcome is known from the type. This is a trusted output contract, covered by adapter shape tests;
 * overloads do not independently prove the implementation or third-party provider behavior.
 */
export function createPiPort(
	input: PiPortInput & { readonly integration: PiSubagentIntegration },
): PiPortResult<PiPortWithSubagents>;
export function createPiPort(
	input: PiPortInput & { readonly integration?: undefined },
): PiPortResult<PiPortWithoutSubagents>;
export function createPiPort(
	input: PiPortInput,
): PiPortResult<PiPortWithSubagents | PiPortWithoutSubagents>;
export function createPiPort(input: PiPortInput): PiPortResult {
	const context = createPiPortContext(input);
	return { reportDiagnostic: context.reportDiagnostic, port: PI_PORT.create(context) };
}

function createPiPortContext(input: PiPortInput): PiPortContext {
	const state: PiPortContext["state"] = { label: input.definition.displayName, reportedOwnerless: false };
	const endedSessions = new Set<string>();
	const reportedMissingFacts = new Set<string>();
	const reportDiagnostic = (message: string): void => { process.stderr.write(`${state.label}: ${message}\n`); };
	const positionOf: PiPortContext["positionOf"] = (ctx, reason) => input.positions.positionOf(ctx, reason);
	const resolvedOwner: PiPortContext["resolvedOwner"] = owner => {
		if (owner.kind === "unresolved" && !state.reportedOwnerless) {
			state.reportedOwnerless = true;
			reportDiagnostic("this session reports no identity; the extension stays off for it");
		}
		return owner;
	};
	return {
		pi: input.pi,
		state,
		stateEntryType: piStateEntryType(input.definition),
		statePersistence: piStatePersistence(input.pi, input.definition),
		providerFacts: input.providerFacts,
		integration: input.integration,
		endedSessions,
		keepSubscription: input.keepSubscription,
		reportDiagnostic,
		reportMissingFact: fact => {
			if (!reportedMissingFacts.has(fact)) {
				reportedMissingFacts.add(fact);
				reportDiagnostic(
					`this harness reports no ${fact}; the framework answers nothing rather than inventing one`,
				);
			}
			return undefined;
		},
		reportUnread: reason => {
			if (reportedMissingFacts.has(reason)) return;
			reportedMissingFacts.add(reason);
			reportDiagnostic(`this session's background work cannot be read: ${reason}`);
		},
		catalogued: ctx => {
			// The model registry is readable only through a live context, while the prices and provider
			// accesses asked of it happen later and from outside every delivery: the framework snapshots
			// a price at a request's real start, and an extension's provider query reads the moment's
			// credential. The newest context is therefore what answers, and this is where each delivery
			// reports its own.
			input.providerFacts.saw(ctx);
			return ctx;
		},
		resolvedOwner,
		resolveOwner: ctx => resolvedOwner(positionOf(ctx).owner),
		positionOf,
		sessionFactsOf: (ctx, reason) => piSessionFactsOf(positionOf(ctx, reason), ctx, reason),
	};
}
