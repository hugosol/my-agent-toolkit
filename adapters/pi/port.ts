/**
 * The pi adapter's port: each native axis mapped into the framework's surface, with the shared
 * binding state that makes the slices agree.
 *
 * The composition below only connects the slices. Session events, context collection, Turn, Round,
 * user input, commands, prompt injection and public effects each own a complete native
 * responsibility in their own module; no slice reaches into another axis's facts.
 */
import type { ExtensionDefinition } from "../../framework/core/definition";
import type { HarnessPort, UserInputDelivery } from "../../framework/core/protocol";
import { onPiSessionContext } from "./context";
import { registerPiCommand } from "./control";
import { feedbackChannelsOf } from "./feedback";
import { onPiRunInitiation } from "./injection";
import type { PiExtensionApi } from "./native";
import type { PiPortContext } from "./port-context";
import type { HarnessModelPrices } from "./pricing";
import type { HarnessProviderAccess } from "./provider";
import { onPiSession } from "./session/events";
import { piSessionFactsOf, type PiSessionPositions } from "./session/facts";
import { observeRounds } from "./session/round";
import { observeTurns } from "./session/turn";
import type { PiSubagentIntegration } from "./subagents/nicobailon";

/** What the assembly supplies to build one binding's port. */
export interface PiPortInput {
	readonly pi: PiExtensionApi;
	readonly definition: ExtensionDefinition;
	readonly positions: PiSessionPositions;
	readonly integration: PiSubagentIntegration | undefined;
	readonly prices: HarnessModelPrices;
	readonly access: HarnessProviderAccess;
	readonly keepSubscription: (release: () => void) => void;
}

/** One pi binding's complete port, plus the diagnostics its assembly publishes. */
export interface PiPort {
	readonly port: HarnessPort;
	readonly reportDiagnostic: (message: string) => void;
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
			modelPrices: input.prices.prices,
			providerAccess: input.access.access,
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
			onRound: observer => {
				observeRounds(input.pi, observer, {
					frame: ctx => {
						const channels = feedbackChannelsOf(ctx);
						return {
							session: context.sessionFactsOf(context.catalogued(ctx)),
							owner: context.resolveOwner(ctx),
							hasUI: ctx.hasUI,
							feedback: channels.feedback,
						};
					},
					reportMissingFact: context.reportMissingFact,
					reportUnread: context.reportUnread,
					// This process's subagent provider, as the assembly's own integration reads it: while a
					// session is waiting on a delegation the provider still holds, the session is not at rest,
					// and a statement this entry cannot read stays unread rather than being answered as rest.
					background: sessionId => input.integration?.backgroundActivity(sessionId) ?? { state: "clear" },
					// The sessions this binding has seen end: their late re-checks read the fact this binding
					// observed rather than a context pi has spent.
					sessionOver: sessionId => context.endedSessions.has(sessionId),
					track: input.keepSubscription,
				});
			},
			// The framework's close-out of a session pi is disposing: this adapter reports the fact and
			// waits for what the framework owes it, and the native shutdown subscription is where it is
			// reported — before the session axis's own end, which is what stops this binding delivering.
			onDisposal: handler => {
				context.state.reportDisposal = handler;
			},
			onSessionContext: onPiSessionContext(context),
			onTurn: handler => {
				observeTurns(input.pi, handler, {
					frame: ctx => {
						const channels = feedbackChannelsOf(ctx);
						return {
							owner: context.resolveOwner(context.catalogued(ctx)),
							hasUI: ctx.hasUI,
							feedback: channels.feedback,
						};
					},
					session: ctx => context.sessionFactsOf(ctx),
					reportMissingFact: context.reportMissingFact,
					track: input.keepSubscription,
				});
			},
			onUserInput: handler => {
				// The adapter's whole job on this axis: read the one fact pi states about who submitted the
				// input, and report the submission as the user's when it is the user's. A submission an
				// extension made on its own behalf is deliberately not one — pi distinguishes the two, and
				// reading that distinction is what keeps an agent's own input from being reported as the user's.
				input.keepSubscription(input.pi.on("input", (event, ctx) => {
					if (event.source === "extension") return;
					const channels = feedbackChannelsOf(ctx);
					const delivery: UserInputDelivery = {
						event: { kind: "user_input" },
						owner: context.resolveOwner(context.catalogued(ctx)),
						session: context.sessionFactsOf(ctx),
						hasUI: ctx.hasUI,
						feedback: channels.feedback,
					};
					handler(delivery);
				}));
			},
			onRunInitiation: onPiRunInitiation(context),
			registerCommand: registerPiCommand(context),
		},
	};
}

function createPiPortContext(input: PiPortInput): PiPortContext {
	const stateEntryType = `${input.definition.id}:state`;
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
		definition: input.definition,
		state,
		stateEntryType,
		persist: values => input.pi.appendEntry(stateEntryType, values),
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
			input.prices.saw(ctx);
			input.access.saw(ctx);
			return ctx;
		},
		resolvedOwner,
		resolveOwner: ctx => resolvedOwner(positionOf(ctx).owner),
		positionOf,
		sessionFactsOf: (ctx, reason) => piSessionFactsOf(positionOf(ctx, reason), ctx, reason),
	};
}
