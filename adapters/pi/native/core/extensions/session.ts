/**
 * pi's session axis: the native start, shutdown, rename and input facts, mapped to one delivery
 * each, plus the disposal registration pi awaits at a session's own exit.
 *
 * Which session a binding serves, when one owner is transferred to another, and what a session's
 * own end closes stay here; the facts themselves are read from the native session-manager mappings. A start is the one
 * delivery that decides whether a session was spawned, so the facts and the owner of that delivery
 * are both read from the same position rather than from a second reading of the lineage link.
 */
import type {
	SessionEndReason,
	SessionEvent,
	SessionFacts,
	SessionStartReason,
} from "../../../../../framework/interface/session";
import type { OwnerReference } from "../../../../../framework/interface/state";
import { defineAdapterDelivery } from "../../../../../framework/runtime/adapter-authoring";
import type { HarnessPort } from "../../../../../framework/runtime/port";
import { feedbackTransport, noticeTransport } from "../../../domain/feedback";
import { markerTransport } from "../../../domain/marker";
import type { PiExtensionContext, PiSessionShutdownReason, PiSessionStartReason } from "./types";
import type { PiPortContext } from "../../../port";
import { piStatePayloadsOf } from "../session-manager/state";

const START_REASON: Record<PiSessionStartReason, SessionStartReason> = {
	startup: "initial", reload: "initial", new: "new", resume: "resume", fork: "fork",
};
const END_REASON: Record<PiSessionShutdownReason, SessionEndReason> = {
	quit: "disposed", reload: "disposed", new: "transferred", resume: "transferred", fork: "transferred",
};

/** Operations paired with the native session transitions, before their semantic delivery. */
export interface PiSessionLifecycle {
	starting(sessionId: string): void;
	ending(sessionId: string): void;
}

/** The native session axis; callers pair its transitions with any cross-source operations. */
export function observePiSession(context: PiPortContext, lifecycle: PiSessionLifecycle): NonNullable<HarnessPort["onSession"]> {
	return handler => {
		const deliver = (
			event: SessionEvent,
			owner: OwnerReference,
			ctx: PiExtensionContext,
			session: SessionFacts,
		): void => {
			context.catalogued(ctx);
			const feedback = feedbackTransport(ctx);
			handler(defineAdapterDelivery("session", {
				event, session, owner,
				statePayloads: piStatePayloadsOf(ctx, context.stateEntryType),
				persist: context.statePersistence.persist,
				hasUI: ctx.hasUI,
				feedback,
				notices: noticeTransport(ctx),
				markers: markerTransport(ctx),
			}));
		};
		context.keepSubscription(context.pi.on("session_start", (event, ctx) => {
			const reason = START_REASON[event.reason];
			// The one decision this delivery makes: the start is what says whether the session was
			// spawned, and the facts and the owner below are both read from that decision rather
			// than from a second reading of the session's lineage link.
			const position = context.positionOf(ctx, reason);
			const owner = context.resolvedOwner(position.owner);
			const session = context.sessionFactsAt(position, ctx, reason);
			// Every actual session enters its own lifecycle, including a child whose Owner is
			// inherited. Pair that entry before delivering its start.
			if (owner.kind !== "owner") {
				// A session that is not its own owner has no life of its own to pair: it is
				// delivered with the owner it resolved and takes no part in the transfer below.
				lifecycle.starting(session.sessionId);
				deliver({ kind: "session_start", reason }, owner, ctx, session);
				return;
			}
			// A native start that leaves the owner this binding already serves alone is not a
			// transition at all, which is what makes a reload or a same-file resume silent here.
			if (owner.key === context.state.activeOwner?.key) return;

			const ended = context.state.activeOwner;
			lifecycle.starting(session.sessionId);
			context.state.servingSessionId = session.sessionId;
			context.state.activeOwner = { key: owner.key, session };
			if (ended !== undefined) {
				lifecycle.ending(ended.session.sessionId);
				deliver({ kind: "session_end", reason: "transferred" }, { kind: "owner", key: ended.key }, ctx, ended.session);
			}
			deliver({ kind: "session_start", reason }, owner, ctx, session);
		}));
		context.keepSubscription(context.pi.on("session_shutdown", async (event, ctx) => {
			const session = context.sessionFactsOf(ctx);
			// The session's own end, recorded before anything else reads this delivery: it is what
			// the round axis's late re-checks answer from once pi has spent the context, and it is
			// a fact about this session rather than about the owner this binding serves.
			context.endedSessions.add(session.sessionId);
			// Pair the session's own end before close-out and before the owner's end delivery.
			lifecycle.ending(session.sessionId);
			// A session really going away, reported where the host waits for it: pi awaits this
			// handler, so what the framework's close-out owes — the round this session left behind,
			// and the settlement of everything that edge reaches — is done before pi lets the
			// session go and long before its process leaves. It is reported *before* the session
			// axis's own end below, which is what stops this binding from delivering at all: a round
			// edge reported after that end would never reach a subscriber.
			//
			// A session the host left for another one is no such fact — the reason states which of
			// the two this delivery is — and it closes nothing.
			const ended = context.state.activeOwner;
			if (END_REASON[event.reason] === "disposed" && context.state.reportDisposal !== undefined) {
				const feedback = feedbackTransport(ctx);
				await context.state.reportDisposal(defineAdapterDelivery("disposal", {
					session,
					owner: context.resolveOwner(context.catalogued(ctx)),
					hasUI: ctx.hasUI,
					feedback,
				}));
			}
			// Only the owner session this binding serves ends here, by its own identity: a sub
			// session this process ran is not the owner the extension serves, and its end is not
			// the owner's end.
			if (ended === undefined || ended.session.sessionId !== session.sessionId) return;
			context.state.activeOwner = undefined;
			context.state.servingSessionId = undefined;
			deliver({ kind: "session_end", reason: END_REASON[event.reason] }, { kind: "owner", key: ended.key }, ctx, session);
		}));
		// pi's own name-change fact: the session's current facts as they now stand, delivered
		// where the rename happened rather than at the renamed session's next boundary.
		context.keepSubscription(context.pi.on("session_info_changed", (_event, ctx) => {
			deliver({ kind: "session_facts" }, context.resolveOwner(context.catalogued(ctx)), ctx, context.sessionFactsOf(ctx));
		}));
	};
}

/** The input axis of one binding's port: the submissions pi itself attributed to the user. */
export function onPiUserInput(context: PiPortContext): NonNullable<HarnessPort["onUserInput"]> {
	return handler => {
		// The adapter's whole job on this axis: read the one fact pi states about who submitted the
		// input, and report the submission as the user's when it is the user's. A submission an
		// extension made on its own behalf is deliberately not one — pi distinguishes the two, and
		// reading that distinction is what keeps an agent's own input from being reported as the user's.
		context.keepSubscription(context.pi.on("input", (event, ctx) => {
			if (event.source === "extension") return;
			const feedback = feedbackTransport(ctx);
			const delivery = defineAdapterDelivery("input", {
				event: { kind: "user_input" },
				owner: context.resolveOwner(context.catalogued(ctx)),
				session: context.sessionFactsOf(ctx),
				hasUI: ctx.hasUI,
				feedback,
			});
			handler(delivery);
		}));
	};
}

/** The disposal axis of one binding's port: pi waits for this handler at a session's own exit. */
export function onPiDisposal(context: PiPortContext): NonNullable<HarnessPort["onDisposal"]> {
	return handler => {
		context.state.reportDisposal = handler;
	};
}
