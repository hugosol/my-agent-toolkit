/**
 * OMP's native session lifecycle: the subscriptions this adapter keeps on the harness, the
 * owner-key bookkeeping that decides what a transition is, and the session manager's own
 * name-change bridge.
 *
 * The native vocabulary is mapped to the framework's semantic events here and nowhere else:
 * delivery assembly — the frame, its transports, the model catalog, the ownerless diagnostic and
 * the binding's State entry — stays in the adapter assembly, which hands this observation the owner
 * resolution it already reports through and the delivery it already assembles.
 */
import type { OwnerReference, SessionEvent, SessionStartReason } from "../../../framework/core/protocol";
import type { OmpExtensionApi, OmpSessionContext } from "../native-types";
import { startReasonOf } from "./facts";

/**
 * The native session lifecycle events this adapter maps to the framework's semantic session
 * events.
 *
 * The harness's vocabulary is richer than the framework's model: `session_start` is the
 * harness's own startup signal, which carries no reason (the framework's `initial`),
 * `session_switch` and `session_branch` each carry the transition's reason, and
 * `session_shutdown` is the process going away (the framework's `disposed`). `session_tree`
 * is navigation inside one session — the same owner, a different leaf — so it maps to no
 * event at all, which is why the adapter subscribes to nothing for it. Which native event
 * means what is decided here and nowhere else; shared behavior sees only
 * {@link SessionEvent}.
 *
 * One more native fact is mapped from outside this vocabulary: the session manager's own
 * name-change notification. It is not a lifecycle event — nothing about which session is current
 * moved — so it maps to `session_facts`, the one session delivery that is not a boundary and
 * carries the session's facts alone.
 */
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
 * One semantic session delivery this observation produces: which way the session axis moved, the
 * owner it concerns, and the live context it came from.
 *
 * The frame is the assembly's: what a delivery carries besides these three — the session's facts,
 * its branch's State payloads and contributions, its transports — is assembled where the binding's
 * State entry and its diagnostics also live.
 */
export type SessionObservationDelivery = (event: SessionEvent, owner: OwnerReference, ctx: OmpSessionContext) => void;

/**
 * Builds the native session observation of one binding.
 *
 * `ownerOf` is the assembly's own owner resolution — the same reading every delivery of this binding
 * carries, its ownerless diagnostic included — because whose session one is stays one fact wherever
 * it is read. `deliver` is that assembly's own delivery, so this module stands for no frame, no
 * transport and no state entry of its own.
 *
 * The owner key this binding currently serves is this factory's own state, so one observation serves
 * one binding's sessions and no other binding's.
 */
export function createSessionObserver(
	pi: OmpExtensionApi,
	ownerOf: (ctx: OmpSessionContext) => OwnerReference,
): (deliver: SessionObservationDelivery) => void {
	// The owner key this binding currently serves — the session it started and has not ended.
	// It is the whole identity criterion: a native session event that leaves this key alone is
	// no transition, and one that changes it names the owner being left, so no session can
	// read a value another one left behind and no session takes over without the one it
	// replaced being retired first.
	let activeOwnerKey: string | undefined;

	/**
	 * Subscribes one observation's native session facts and maps them to the semantic events they
	 * are: one delivery per lifecycle event that moves the owner this binding serves, and one facts
	 * delivery per rename the session manager publishes.
	 */
	return deliver => {
		/**
		 * Subscribes this context's own name-change fact, once per session manager.
		 *
		 * The harness publishes a rename where it happens, so what this produces is a facts
		 * delivery: the session's own identity, direct parent and latest name, resolved then.
		 * That is what makes a rename of a session nobody is viewing reach a per-session
		 * observation immediately rather than at the renamed session's next delivery. The
		 * notification is read as the manager's own method — it is that object's state, not a
		 * function to detach from it — and the listener stays subscribed for the manager's own
		 * life, so a session this binding has since left still reports its facts when it is
		 * renamed; the framework's delivery switch, not this subscription, is what ends a
		 * disposed binding's delivery. A manager that reports no such change leaves this bridge
		 * inert, and the session's name is then read on its other deliveries alone.
		 */
		const watchedManagers = new WeakSet<OmpSessionContext["sessionManager"]>();
		const watchNameChanges = (ctx: OmpSessionContext): void => {
			const manager = ctx.sessionManager;
			if (watchedManagers.has(manager)) return;
			if (typeof manager.onSessionNameChanged !== "function") return;
			watchedManagers.add(manager);
			manager.onSessionNameChanged(() => {
				deliver({ kind: "session_facts" }, ownerOf(ctx), ctx);
			});
		};

		/**
		 * One start-type native event (a startup, a switch, a branch), synthesized into the
		 * semantic transition it is.
		 *
		 * The judgment is the owner key, and it is the only thing that decides: a native
		 * transition that leaves the owner this binding already serves alone is not a
		 * transition at all — no event, no retired cell, no reseed — which is what makes
		 * `/reload`, a same-file `/resume`, `/clear` and a TUI `/branch` silent rather than
		 * boundaries. An event that does move the owner to another session is the symmetric
		 * pair: the session being left ends as `transferred` — named by its own key, so its
		 * cell and its effects are found without consulting anything else — and the session
		 * being entered starts with the reason the native event carried.
		 *
		 * A session that is not its own owner has no cell of its own, so it is delivered
		 * with the owner it resolved and takes no part in this bookkeeping: there is
		 * nothing of its own to pair.
		 */
		const startOf = (reason: SessionStartReason, ctx: OmpSessionContext): void => {
			const owner = ownerOf(ctx);
			if (owner.kind !== "owner") {
				deliver({ kind: "session_start", reason }, owner, ctx);
				return;
			}
			if (owner.key === activeOwnerKey) return;

			const endedOwnerKey = activeOwnerKey;
			activeOwnerKey = owner.key;
			if (endedOwnerKey !== undefined) {
				deliver(
					{ kind: "session_end", reason: "transferred" },
					{ kind: "owner", key: endedOwnerKey },
					ctx,
				);
			}
			deliver({ kind: "session_start", reason }, owner, ctx);
		};

		// One semantic event per native session event, and no other native event reaches
		// this hook: a per-turn run initiation is a separate semantic hook, so a run can
		// never arrive here and reseed the session's State.
		pi.on("session_start", (_event, ctx) => {
			// The harness's startup signal carries no reason: this is the session the
			// binding first serves in this process.
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
			// Only a session this binding started can end: the owner that is ending is the
			// one this binding serves, whatever the shutting-down session resolves now.
			const endedOwnerKey = activeOwnerKey;
			if (endedOwnerKey === undefined) return;
			activeOwnerKey = undefined;
			deliver({ kind: "session_end", reason: "disposed" }, { kind: "owner", key: endedOwnerKey }, ctx);
		});
	};
}
