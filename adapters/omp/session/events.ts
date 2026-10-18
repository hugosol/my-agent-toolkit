/**
 * OMP's session event axis: the native session, Turn, Round and user-input facts, mapped to the
 * framework's deliveries.
 *
 * The native vocabulary is mapped to the framework's semantic events here and nowhere else. Which
 * session this binding serves, when one owner is transferred to another, and what a session's own
 * end closes stay here; the facts themselves are read by `queries.ts` and the one persisted State
 * entry by `effects.ts`. Turn and Round signal mapping remains in their own modules — the delivery
 * frame each signal arrives in is assembled here, so the port only registers what the definition
 * asks for.
 *
 * The native events this module subscribes to:
 *
 * The harness's vocabulary is richer than the framework's model: `session_start` is the harness's
 * own startup signal, which carries no reason (the framework's `initial`), `session_switch` and
 * `session_branch` each carry the transition's reason, and `session_shutdown` is the process going
 * away (the framework's `disposed`). `session_tree` is navigation inside one session — the same
 * owner, a different leaf — so it maps to no event at all, which is why the adapter subscribes to
 * nothing for it. Which native event means what is decided here and nowhere else; shared behavior
 * sees only {@link SessionEvent}.
 *
 * One more native fact is mapped from outside this vocabulary: the session manager's own
 * name-change notification. It is not a lifecycle event — nothing about which session is current
 * moved — so it maps to `session_facts`, the one session delivery that is not a boundary and
 * carries the session's facts alone.
 */
import type {
	HarnessPort,
	OwnerReference,
	SessionEvent,
	SessionStartReason,
} from "../../../framework/core/protocol";
import { feedbackTransport, noticeTransport } from "../feedback";
import { markerTransport } from "../marker";
import type { OmpExtensionApi, OmpSessionContext } from "../internal/native";
import type { OmpStateEntry } from "./effects";
import { sessionFactsOf, startReasonOf, statePayloadsOf } from "./queries";
import { observeRounds } from "./round";
import { observeTurns } from "./turn";

/** The native session lifecycle events this adapter maps to the framework's semantic events. */
export type OmpSessionEventType =
	| "session_start"
	| "session_switch"
	| "session_branch"
	| "session_tree"
	| "session_shutdown";

/** Why the harness changed sessions, as its event carries it. */
export type OmpSessionReason = "new" | "resume" | "fork" | "branch" | "btw";

/** A native session lifecycle event, as the runner delivers it. */
export interface OmpSessionEvent {
	readonly type: OmpSessionEventType;
	/** The transition's reason: a switch carries `new`/`resume`/`fork`, a branch its own reason. */
	readonly reason?: OmpSessionReason;
}

/**
 * The binding's own references every Session event delivery is assembled from.
 *
 * They are the same references the port composes for its other axes: the newest-context recorder,
 * the one owner resolution (its ownerless diagnostic included), the one State entry, and this
 * binding's diagnostic channel. They are passed in rather than reached for, so this module decides
 * no binding-wide state of its own beyond the owner it currently serves.
 */
export interface SessionEventContext {
	/** Records the delivery's context as the newest and hands it back. */
	readonly record: (ctx: OmpSessionContext) => OmpSessionContext;
	/** The owner every delivery of this binding reports. */
	readonly owner: (ctx: OmpSessionContext) => OwnerReference;
	/** The State entry shared with the command path. */
	readonly stateEntry: OmpStateEntry;
	/** Reports one fact this harness does not state, at most once per binding. */
	readonly reportMissingFact: (fact: string) => undefined;
	/** Publishes one binding-scoped line on the non-model channel. */
	readonly reportBindingDiagnostic: (message: string) => void;
}

/**
 * Subscribes the native session lifecycle and delivers the semantic events it states.
 *
 * This factory's owner key is the whole identity criterion: a native session event that leaves the
 * key this binding already serves alone is no transition, and one that changes it names the owner
 * being left, so no session can read a value another one left behind and no session takes over
 * without the one it replaced being retired first.
 */
export function observeSessionEvents(
	pi: OmpExtensionApi,
	context: SessionEventContext,
	handler: Parameters<HarnessPort["onSession"]>[0],
): void {
	// The owner key this binding currently serves — the session it started and has not ended.
	let activeOwnerKey: string | undefined;

	/**
	 * One semantic session delivery: the boundary or facts event, the owner it concerns, and the
	 * session frame the binding assembles for it.
	 */
	const deliver = (event: SessionEvent, owner: OwnerReference, ctx: OmpSessionContext): void => {
		context.record(ctx);
		handler({
			event,
			// One start delivery is the session's own beginning in this process, and it is the one
			// whose readings are the session's startup facts; every other delivery reports none —
			// and a start that proves no beginning (a resume, a fork, a session whose own branch
			// already carries a conversation) reports none either.
			session: sessionFactsOf(pi, ctx, event.kind === "session_start" ? event.reason : undefined),
			owner,
			statePayloads: statePayloadsOf(ctx, context.stateEntry.type),
			persist: context.stateEntry.persist,
			hasUI: ctx.hasUI,
			feedback: feedbackTransport(ctx),
			notices: noticeTransport(ctx),
			markers: markerTransport(ctx),
		});
	};

	/**
	 * Subscribes this context's own name-change fact, once per session manager.
	 *
	 * The harness publishes a rename where it happens, so what this produces is a facts delivery:
	 * the session's own identity, direct parent and latest name, resolved then. That is what makes
	 * a rename of a session nobody is viewing reach a per-session observation immediately rather
	 * than at the renamed session's next delivery. The notification is read as the manager's own
	 * method — it is that object's state, not a function to detach from it — and the listener stays
	 * subscribed for the manager's own life, so a session this binding has since left still reports
	 * its facts when it is renamed; the framework's delivery switch, not this subscription, is what
	 * ends a disposed binding's delivery. A manager that reports no such change leaves this bridge
	 * inert, and the session's name is then read on its other deliveries alone.
	 */
	const watchedManagers = new WeakSet<OmpSessionContext["sessionManager"]>();
	const watchNameChanges = (ctx: OmpSessionContext): void => {
		const manager = ctx.sessionManager;
		if (watchedManagers.has(manager)) return;
		if (typeof manager.onSessionNameChanged !== "function") return;
		watchedManagers.add(manager);
		manager.onSessionNameChanged(() => {
			deliver({ kind: "session_facts" }, context.owner(ctx), ctx);
		});
	};

	/**
	 * One start-type native event (a startup, a switch, a branch), synthesized into the semantic
	 * transition it is.
	 *
	 * A native transition that leaves the owner this binding already serves alone is not a
	 * transition at all — no event, no retired cell, no reseed — which is what makes `/reload`, a
	 * same-file `/resume`, `/clear` and a TUI `/branch` silent rather than boundaries. An event that
	 * does move the owner to another session is the symmetric pair: the session being left ends as
	 * `transferred` — named by its own key, so its cell and its effects are found without
	 * consulting anything else — and the session being entered starts with the reason the native
	 * event carried.
	 *
	 * A session that is not its own owner has no cell of its own, so it is delivered with the
	 * owner it resolved and takes no part in this bookkeeping: there is nothing of its own to pair.
	 */
	const startOf = (reason: SessionStartReason, ctx: OmpSessionContext): void => {
		const owner = context.owner(ctx);
		if (owner.kind !== "owner") {
			deliver({ kind: "session_start", reason }, owner, ctx);
			return;
		}
		if (owner.key === activeOwnerKey) return;

		const endedOwnerKey = activeOwnerKey;
		activeOwnerKey = owner.key;
		if (endedOwnerKey !== undefined) {
			deliver({ kind: "session_end", reason: "transferred" }, { kind: "owner", key: endedOwnerKey }, ctx);
		}
		deliver({ kind: "session_start", reason }, owner, ctx);
	};

	// One semantic event per native session event, and no other native event reaches this hook: a
	// per-turn run initiation is a separate semantic hook, so a run can never arrive here and
	// reseed the session's State.
	pi.on("session_start", (_event, ctx) => {
		// The harness's startup signal carries no reason: this is the session the binding first
		// serves in this process.
		watchNameChanges(ctx);
		startOf("initial", ctx);
	});
	pi.on("session_switch", (event, ctx) => {
		watchNameChanges(ctx);
		startOf(startReasonOf(event), ctx);
	});
	pi.on("session_branch", (event, ctx) => {
		watchNameChanges(ctx);
		startOf(startReasonOf(event), ctx);
	});
	pi.on("session_shutdown", (_event, ctx) => {
		// Only a session this binding started can end: the owner that is ending is the one this
		// binding serves, whatever the shutting-down session resolves now.
		const endedOwnerKey = activeOwnerKey;
		if (endedOwnerKey === undefined) return;
		activeOwnerKey = undefined;
		deliver({ kind: "session_end", reason: "disposed" }, { kind: "owner", key: endedOwnerKey }, ctx);
	});
}

/** Frames one Turn signal with the session and owner it came from, and hands it on. */
export function observeTurnEvents(
	pi: OmpExtensionApi,
	context: SessionEventContext,
	handler: Parameters<HarnessPort["onTurn"]>[0],
): void {
	observeTurns(pi, handler, {
		frame: ctx => ({
			owner: context.owner(context.record(ctx)),
			hasUI: ctx.hasUI,
			feedback: feedbackTransport(ctx),
		}),
		session: ctx => sessionFactsOf(pi, ctx),
		reportMissingFact: context.reportMissingFact,
	});
}

/** Frames one Round signal with the session and owner it came from, and hands it on. */
export function observeRoundEvents(
	pi: OmpExtensionApi,
	context: SessionEventContext,
	observer: Parameters<HarnessPort["onRound"]>[0],
): void {
	observeRounds(pi, observer, {
		frame: ctx => {
			context.record(ctx);
			return {
				session: sessionFactsOf(pi, ctx),
				owner: context.owner(ctx),
				hasUI: ctx.hasUI,
				feedback: feedbackTransport(ctx),
			};
		},
		reportMissingFact: context.reportMissingFact,
	});
}

/**
 * Reports the harness's user input as the framework's one session observation.
 *
 * A submission an extension made on its own behalf is deliberately not user input — the harness
 * itself distinguishes the two, and reading that distinction is what keeps an agent's own input
 * from being reported as the user's. A surface that refuses the registration publishes no
 * submission event at all: that is the honest absence, and it is reported as such, so the
 * framework reports no user input rather than inferring one from some other fact.
 */
export function observeUserInputEvents(
	pi: OmpExtensionApi,
	context: SessionEventContext,
	handler: Parameters<HarnessPort["onUserInput"]>[0],
): void {
	try {
		pi.on("input", (event, ctx) => {
			if (event.source === "extension") return;
			const recorded = context.record(ctx);
			handler({
				event: { kind: "user_input" },
				owner: context.owner(recorded),
				session: sessionFactsOf(pi, ctx),
				hasUI: ctx.hasUI,
				feedback: feedbackTransport(ctx),
			});
		});
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		context.reportBindingDiagnostic(
			`this harness publishes no submission event (input); the framework reports no user input rather than inventing one (${detail})`,
		);
	}
}
