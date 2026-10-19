/**
 * The semantic session event dispatch: what runs on one session event, in what order, and
 * what happens when an extension handler throws.
 *
 * The framework's own behavior goes first. The ending owner's cell is retired, a starting
 * owner is seeded from its branch, and the marker area is refreshed — all before any
 * extension handler runs, so a handler observes State as the event left it rather than as
 * an earlier delivery found it, and an extension can never act on a boundary the framework
 * has not applied yet. That behavior belongs to a boundary, so the one session delivery that
 * reports a change without crossing one — `session_facts` — skips it entirely: the groups are
 * reached, and nothing the framework owns moves.
 *
 * A handler's failure is its own. It is reported on the adapter's diagnostic channel — a
 * channel outside model context — and it changes neither what the framework already did nor
 * whether another subscriber runs: the boundary the event described still holds, and every
 * other extension bound to this assembly still receives its own delivery.
 *
 * The subscription is scoped by each group's own declaration. An `owner` group receives the
 * delivery only when its session is itself an owner — a subagent following a main session, or a
 * session whose parent chain leaves the process, reaches no handler there, because those events
 * are the owner's, not the session's that ran them, and the group's effect body is owned by the
 * session it armed in. A `session` group receives every delivery the adapter resolved, each
 * naming that session's own identity, direct parent and latest name. The framework's own behavior
 * above is unaffected by either scope: it runs for every delivery and owns nothing in a session
 * that is not its own owner.
 *
 * This module is harness-independent: State owns reconciliation and capabilities,
 * while this module owns handler dispatch and its feedback lifetime, and the scope rule it
 * narrows with is `subscriptions.ts`'s one mechanism.
 */
import type { ExtensionDefinition } from "../interface/details/definition";
import type { SessionEventDelivery, SubscriptionGroup } from "../interface/session";
import type { OwnerCapabilityHandle } from "../interface/state";
import type { SessionDelivery } from "../core/protocol";
import type { StateStore } from "../core/state";
import { type MarkerSeat, publishMarkerOnTransition } from "./marker";
import { stateValueFor } from "./state-scope";
import { dispatchToGroups } from "./subscriptions";

/**
 * Applies one semantic session event: the framework's behavior, then the subscribed handler.
 *
 * `handlers` is what the extension's assembly injected for this event kind; a kind with no
 * handler still gets the framework's own behavior, which is why a definition with no session
 * subscription at all is reconciled exactly like one with a handler. A `session_facts` delivery
 * is the exception in both directions: it reconciles nothing, and a group that subscribes nothing
 * for it simply observes nothing.
 *
 * The channel a handler publishes on is the dispatch's own: it carries a notice while that
 * handler runs and is closed when the dispatch ends. That is the only channel that can speak for
 * a `session_end`, because the owner it names is retired before the handler runs and the
 * capability such a delivery hands out is inert from birth — and it is why an extension that
 * needs to report an effect later keeps the capability rather than this channel.
 */
export function dispatchSessionEvent(
	definition: ExtensionDefinition,
	state: StateStore,
	session: SessionDelivery,
	groups: readonly SubscriptionGroup[],
	seat: MarkerSeat,
	reportFailure: (message: string) => void,
): void {
	// A facts delivery crossed no boundary: the session's own facts are re-stated, so nothing the
	// framework owns moves — no owner's life begins or ends, no State reconciles, and the marker
	// area is not published. The groups below are still reached; only the framework's own behavior
	// is skipped, and only for this one kind.
	if (session.event.kind !== "session_facts") {
		state.reconcile({
			owner: session.owner,
			event: session.event,
			statePayloads: session.statePayloads,
			publishMarker: ownerKey => publishMarkerOnTransition(definition, ownerKey, session.markers, seat),
		});
	}

	// The framework's behavior above ran for this delivery whatever the session is and whatever a
	// group declared; the groups are what the scope below narrows, and only they.
	dispatchToGroups(
		definition.id,
		groups,
		session.event.kind,
		session.owner,
		() => {
			// The channel a handler publishes on is its own dispatch's: it carries a notice while
			// that handler runs and is closed when it settles. That is the only channel that can
			// speak for a `session_end`, because the owner it names is retired before the handler
			// runs and the capability such a delivery hands out is inert from birth — and it is why
			// an extension that needs to report an effect later keeps the capability.
			let dispatched = true;
			const delivery: SessionEventDelivery = {
				event: session.event,
				session: session.session,
				owner: session.owner,
				hasUI: session.hasUI,
				feedback: {
					notify: (level, message) => {
						if (dispatched) session.feedback.notify(level, message);
					},
				},
				capability: capabilityOf(session),
			};
			return {
				delivery,
				settled: () => {
					dispatched = false;
				},
			};
		},
		reportFailure,
	);

	/**
	 * The capability of one delivery: an owner-scoped handle for the session that is its own owner,
	 * and nothing but a read for any other.
	 *
	 * A session that is not its own owner owns no cell, and observing it grants no authority over
	 * the owner it follows: what such a delivery hands out reads the value its own field's
	 * inheritance rule reads — the owner's current value for a `follow` field, the declared default
	 * otherwise — and drops every write and every notice. Widening a subscription group to every
	 * actual session therefore adds observations and nothing else, and a subagent can never drive
	 * the owner's value or its effects.
	 */
	function capabilityOf(delivered: SessionDelivery): OwnerCapabilityHandle {
		if (delivered.owner.kind !== "owner") {
			const owner = delivered.owner;
			return {
				state: {
					read: () => stateValueFor(definition, state, owner),
					write: () => {},
				},
				feedback: { notify: () => {} },
			};
		}
		const key = delivered.owner.key;
		return state.capability({
			ownerKey: key,
			publishMarker: () => publishMarkerOnTransition(definition, key, delivered.markers, seat),
			persist: values => delivered.persist(values),
			feedback: delivered.feedback,
		});
	}
}
