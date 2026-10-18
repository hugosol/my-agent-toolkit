/**
 * The OMP port: the framework's native seam, bound to one session.
 *
 * This module only connects the adapter's domains: the newest-context tracker every delivery
 * records itself through, the one State entry the session and command paths share, one owner
 * resolution and its ownerless diagnostic, the Subagent domain's integration answer, the binding's
 * diagnostic channel, and the composition of the hooks the framework registers. Session, Context,
 * Turn, Round and user-input deliveries are assembled by their own modules; commands and prompts
 * keep their mappings beside them.
 *
 * It carries no extension semantics: what to register comes from the definition, whether it may be
 * registered is decided by the harness-independent behavior, and what a command does is the
 * framework's control behavior.
 */
import type { ExtensionDefinition } from "../../framework/core/definition";
import type { HarnessPort, OwnerReference } from "../../framework/core/protocol";
import { observeSessionContext } from "./context/events";
import { createContextTracker } from "./context/queries";
import { registerControl } from "./control";
import { feedbackTransport } from "./feedback";
import { markerTransport } from "./marker";
import type { OmpExtensionApi, OmpSessionContext } from "./internal/native";
import type { ModelPrices } from "./pricing";
import { observeRunInitiation } from "./prompt";
import type { ProviderAccessSource } from "./provider";
import { stateEntryOf } from "./session/effects";
import {
	observeRoundEvents,
	observeSessionEvents,
	observeTurnEvents,
	observeUserInputEvents,
} from "./session/events";
import { ownerReferenceOf } from "./session/queries";
import { createViewedSession } from "./session/viewed-session";
import { subagentIntegrationOf } from "./subagent/queries";

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
	// One tracker per binding: prices and provider access are the process's readers, but the
	// newest context is the one this binding's own deliveries reported.
	const context = createContextTracker([dependencies.prices.saw, dependencies.access.saw]);
	const record = context.record;
	// One State entry per binding: session restoration and commands are two uses of it.
	const stateEntry = stateEntryOf(pi, definition);

	// The non-model channel this binding reports on. Startup happens before any UI exists, so a
	// diagnostic goes to stderr: it is user-visible and can never reach model context.
	const reportDiagnostic = (message: string): void => {
		process.stderr.write(`${message}\n`);
	};
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

	const sessionEvents = {
		record,
		owner: ownerOf,
		stateEntry,
		reportMissingFact,
		reportBindingDiagnostic,
	} as const;
	const { viewedSession } = createViewedSession(pi, context, markerTransport);

	return {
		setLabel: label => pi.setLabel(label),
		reportDiagnostic,
		modelPrices: dependencies.prices.prices,
		providerAccess: dependencies.access.access,
		viewedSession,
		// This harness integrates subagent observations itself; the Subagent domain answers how that
		// integration stands, so the port carries no inline capability fact of its own.
		subagentIntegration: subagentIntegrationOf,
		onSession: handler => observeSessionEvents(pi, sessionEvents, handler),
		onRound: observer => observeRoundEvents(pi, sessionEvents, observer),
		onSessionContext: handler => observeSessionContext(pi, handler, { record, owner: ownerOf }),
		nextTask: callback => {
			// The harness's next task: a macrotask that runs after this callback returned and after
			// everything already queued — the session's own unwinding and any input it drained — has
			// had its turn. Nothing here waits on a duration or repeats.
			setTimeout(callback, 0);
		},
		onUserInput: handler => observeUserInputEvents(pi, sessionEvents, handler),
		onTurn: handler => observeTurnEvents(pi, sessionEvents, handler),
		onRunInitiation: handler => observeRunInitiation(pi, handler, {
			record,
			owner: ownerOf,
			markers: markerTransport,
		}),
		registerCommand: command => {
			registerControl(pi, command, {
				record,
				owner: ownerOf,
				persist: stateEntry.persist,
				feedback: feedbackTransport,
				markers: markerTransport,
				reportMissingFact,
			});
		},
	};
}
