/**
 * The pi adapter's port: each native axis mapped into the framework's surface, with the shared
 * binding state that makes the slices agree.
 *
 * The composition below only connects the slices. Session events, context collection, Turn, Round,
 * user input, commands, prompt planning and public effects each own a complete native
 * responsibility in their own module; no slice reaches into another axis's facts.
 */
import type { ExtensionDefinition } from "../../../framework/interface/details/definition";
import type { SessionFacts, SessionStartReason } from "../../../framework/interface/session";
import type { OwnerReference } from "../../../framework/interface/state";
import type { HarnessPort, SessionDisposal } from "../../../framework/runtime/port";
import { onPiSessionContext } from "../domain/context";
import { registerPiCommand } from "../domain/control";
import type { PiExtensionApi, PiExtensionContext } from "./native";
import { onPiRunInitiation } from "../domain/prompt";
import type { PiHostFacts } from "../domain/host-facts";
import { piStatePersistence, type PiStatePersistence } from "../domain/session/effects";
import { onPiDisposal, onPiSession, onPiUserInput } from "../domain/session/events";
import {
	piSessionFactsOf,
	piStateEntryType,
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
	readonly hostFacts: PiHostFacts;
	readonly keepSubscription: (release: () => void) => void;
}

/** One pi binding's complete port, plus the diagnostics its assembly publishes. */
export interface PiPort {
	readonly port: HarnessPort;
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

/** Everything the port slices of one binding read from each other. */
export interface PiPortContext {
	readonly pi: PiExtensionApi;
	readonly state: PiPortState;
	/** The one native branch entry used by both Session restoration and command writes. */
	readonly stateEntryType: string;
	readonly statePersistence: PiStatePersistence;
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

/** Builds one binding's port from the assembly's process-scoped readings. */
export function createPiPort(input: PiPortInput): PiPort {
	const context = createPiPortContext(input);
	const integration = input.integration;
	return {
		reportDiagnostic: context.reportDiagnostic,
		port: {
			// pi.setLabel labels a history ENTRY, not an extension. Keep this label on
			// diagnostics instead of misusing that unrelated native operation.
			setLabel: value => { context.state.label = value; },
			reportDiagnostic: context.reportDiagnostic,
			modelPrices: input.hostFacts.prices,
			providerAccess: input.hostFacts.access,
			// The process's one settling of this entry's subagent integration, asked at the owner node:
			// it is the session this binding serves then, and the answer is that process's own.
			...(integration === undefined
				? {}
				: { subagentIntegration: () => integration.settle(context.state.servingSessionId) }),
			onSession: onPiSession(context),
			nextTask: callback => {
				// The harness's next task: a macrotask that runs after this callback returned and after
				// everything already queued — pi's own unwinding and any message it drained — has had its
				// turn. Nothing here waits on a duration or repeats.
				setTimeout(callback, 0);
			},
			onRound: onPiRound(context),
			// The framework's close-out of a session pi is disposing: this adapter reports the fact and
			// waits for what the framework owes it, and the native shutdown subscription is where it is
			// reported — before the session axis's own end, which is what stops this binding delivering.
			onDisposal: onPiDisposal(context),
			onSessionContext: onPiSessionContext(context),
			onTurn: onPiTurn(context),
			onUserInput: onPiUserInput(context),
			onRunInitiation: onPiRunInitiation(context),
			registerCommand: registerPiCommand(context),
		},
	};
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
			input.hostFacts.saw(ctx);
			return ctx;
		},
		resolvedOwner,
		resolveOwner: ctx => resolvedOwner(positionOf(ctx).owner),
		positionOf,
		sessionFactsOf: (ctx, reason) => piSessionFactsOf(positionOf(ctx, reason), ctx, reason),
	};
}
