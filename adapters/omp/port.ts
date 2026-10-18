/**
 * The OMP port: the framework's native seam, bound to one session.
 *
 * This module composes the adapter's mappings; each of them owns its own subscriptions and
 * translation. What stays here is the binding's shared frame — the context tracker every delivery
 * records itself through, one owner resolution and its ownerless diagnostic, the State entry, and
 * the composition of the hooks the framework registers. It carries no extension semantics: what to
 * register comes from the definition, whether it may be registered is decided by the
 * harness-independent behavior, and what a command does is the framework's control behavior.
 */
import type { ExtensionDefinition } from "../../framework/core/definition";
import type {
	HarnessPort,
	OwnerReference,
	SubagentIntegration,
} from "../../framework/core/protocol";
import { createContextTracker, observeSessionContext } from "./context";
import { registerControl } from "./control";
import { createDiagnostics } from "./diagnostic";
import { feedbackTransport, noticeTransport } from "./feedback";
import { observeRunInitiation } from "./injection";
import { markerTransport } from "./marker";
import type { OmpExtensionApi, OmpSessionContext } from "./native-types";
import type { ModelPrices } from "./pricing";
import type { ProviderAccessSource } from "./provider";
import {
	ownerReferenceOf,
	sessionFactsOf,
	statePayloadsOf,
} from "./session/facts";
import { createSessionObserver } from "./session/lifecycle";
import { observeRounds } from "./session/round";
import { observeTurns } from "./session/turn";
import { createViewedSession } from "./session/viewed-session";

/** The process-level readers every binding of one assembly answers through. */
export interface PortDependencies {
	readonly prices: ModelPrices;
	readonly access: ProviderAccessSource;
}

/** Builds the framework's port onto OMP, bound to one session and the extension's State key. */
export function createOmpPort(
	pi: OmpExtensionApi,
	definition: ExtensionDefinition,
	dependencies: PortDependencies,
): HarnessPort {
	const stateEntryType = `${definition.id}:state`;
	const diagnostics = createDiagnostics(definition.id);
	// One tracker per binding: prices and provider access are the process's readers, but the
	// newest context is the one this binding's own deliveries reported.
	const context = createContextTracker([dependencies.prices.saw, dependencies.access.saw]);
	const record = context.record;

	// At most one ownerless diagnostic per binding: the first delivery that resolves no
	// owner reports it, and every later one stays quiet.
	let reportedOwnerless = false;
	const ownerOf = (ctx: OmpSessionContext): OwnerReference => {
		const owner = ownerReferenceOf(pi, ctx);
		if (owner.kind === "unresolved" && !reportedOwnerless) {
			reportedOwnerless = true;
			// Best-effort and user-visible only: the extension stays bound and keeps running.
			diagnostics.reportDiagnostic(
				`${definition.id}: no owning main session resolved for this session; the extension stays off`,
			);
		}
		return owner;
	};

	const observeSession = createSessionObserver(pi, ownerOf);
	const { viewedSession } = createViewedSession(pi, context, markerTransport);

	return {
		setLabel: label => pi.setLabel(label),
		reportDiagnostic: diagnostics.reportDiagnostic,
		modelPrices: dependencies.prices.prices,
		providerAccess: dependencies.access.access,
		viewedSession,
		// This harness integrates subagent observations itself: its own delegation tool and agent
		// registry are the facts the subagent axes are mapped from, so there is no provider to reach
		// and none to fail — the answer is the integrated shape itself, and nothing waits for it.
		subagentIntegration: () => ({ mode: "subagents" }) satisfies SubagentIntegration,
		onSession: handler => {
			observeSession((event, owner, ctx) => {
				record(ctx);
				handler({
					event,
					// One start delivery is the session's own beginning in this process, and it is the one
					// whose readings are the session's startup facts; every other delivery reports none —
					// and a start that proves no beginning (a resume, a fork, a session whose own branch
					// already carries a conversation) reports none either.
					session: sessionFactsOf(pi, ctx, event.kind === "session_start" ? event.reason : undefined),
					owner,
					statePayloads: statePayloadsOf(ctx, stateEntryType),
					// The same medium the command path records State through: an entry this
					// binding's session carries, written by the capability a start delivery hands
					// out once that owner's effects write their own declared value.
					persist: values => {
						pi.appendEntry(stateEntryType, values);
					},
					hasUI: ctx.hasUI,
					feedback: feedbackTransport(ctx),
					notices: noticeTransport(ctx),
					markers: markerTransport(ctx),
				});
			});
		},
		onRound: observer => {
			observeRounds(pi, observer, {
				frame: ctx => {
					record(ctx);
					return {
						session: sessionFactsOf(pi, ctx),
						owner: ownerOf(ctx),
						hasUI: ctx.hasUI,
						feedback: feedbackTransport(ctx),
					};
				},
				reportMissingFact: diagnostics.reportMissingFact,
			});
		},
		onSessionContext: handler => {
			observeSessionContext(pi, handler, {
				record,
				frame: ctx => ({
					session: sessionFactsOf(pi, ctx),
					owner: ownerOf(ctx),
					hasUI: ctx.hasUI,
					feedback: feedbackTransport(ctx),
				}),
			});
		},
		nextTask: callback => {
			// The harness's next task: a macrotask that runs after this callback returned and after
			// everything already queued — the session's own unwinding and any input it drained — has
			// had its turn. Nothing here waits on a duration or repeats.
			setTimeout(callback, 0);
		},
		onUserInput: handler => {
			// The adapter's whole job on this axis: read the one fact the harness states about who
			// submitted the input, and report the submission as the user's input when it is the user's.
			// A submission an extension made on its own behalf is deliberately not one — the harness
			// itself distinguishes the two, and reading that distinction is what keeps an agent's own
			// input from being reported as the user's.
			//
			// A harness surface that refuses the registration publishes no submission event at all. That
			// is the honest absence and it is reported as such: the framework then reports no user input
			// rather than inferring one from some other fact, and everything else in the binding runs
			// unchanged.
			try {
				pi.on("input", (event, ctx) => {
					if (event.source === "extension") return;
					const recorded = record(ctx);
					handler({
						event: { kind: "user_input" },
						owner: ownerOf(recorded),
						session: sessionFactsOf(pi, ctx),
						hasUI: ctx.hasUI,
						feedback: feedbackTransport(ctx),
					});
				});
			} catch (error) {
				const detail = error instanceof Error ? error.message : String(error);
				diagnostics.reportDiagnostic(
					`${definition.id}: this harness publishes no submission event (input); the framework reports no user input rather than inventing one (${detail})`,
				);
			}
		},
		onTurn: handler => {
			observeTurns(pi, handler, {
				frame: ctx => ({
					owner: ownerOf(record(ctx)),
					hasUI: ctx.hasUI,
					feedback: feedbackTransport(ctx),
				}),
				session: ctx => sessionFactsOf(pi, ctx),
				reportMissingFact: diagnostics.reportMissingFact,
			});
		},
		onRunInitiation: handler => {
			observeRunInitiation(pi, handler, {
				record,
				owner: ownerOf,
				markers: markerTransport,
			});
		},
		registerCommand: command => {
			registerControl(pi, command, {
				record,
				owner: ownerOf,
				persist: values => {
					pi.appendEntry(stateEntryType, values);
				},
				feedback: feedbackTransport,
				markers: markerTransport,
				reportMissingFact: diagnostics.reportMissingFact,
			});
		},
	};
}
