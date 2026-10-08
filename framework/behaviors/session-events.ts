/**
 * The semantic session event dispatch: what runs on one session event, in what order, and
 * what happens when an extension handler throws.
 *
 * The framework's own behavior goes first. The ending owner's cell is retired, a starting
 * owner is seeded from its branch, and the marker area is refreshed — all before any
 * extension handler runs, so a handler observes State as the event left it rather than as
 * an earlier delivery found it, and an extension can never act on a boundary the framework
 * has not applied yet.
 *
 * A handler's failure is its own. It is reported on the adapter's diagnostic channel — a
 * channel outside model context — and it changes neither what the framework already did nor
 * whether another subscriber runs: the boundary the event described still holds, and every
 * other extension bound to this assembly still receives its own delivery.
 *
 * The subscription is owner-scoped. A delivery whose session is not its own owner — a subagent
 * following a main session, or a session whose parent chain leaves the process — reaches no
 * handler at all, because those events are the owner's, not the session's that ran them, and an
 * extension's effect body is owned by the session it armed in. The framework's own behavior
 * above is unaffected: it runs for every delivery the adapter resolves and already owns nothing
 * in a session that is not its own owner.
 *
 * This module is agent-runtime-independent: State owns reconciliation and capabilities,
 * while this module owns handler dispatch and its feedback lifetime.
 */
import type { ExtensionDefinition } from "../core/definition";
import type { SessionDelivery, SessionEventDelivery, SessionEventHandlers } from "../core/protocol";
import type { StateStore } from "../core/state";
import { publishMarkerOnTransition } from "./marker";

/**
 * Applies one semantic session event: the framework's behavior, then the subscribed handler.
 *
 * `handlers` is what the extension's assembly injected for this event kind; a kind with no
 * handler still gets the framework's own behavior, which is why a definition with no session
 * subscription at all is reconciled exactly like one with a handler.
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
	handlers: SessionEventHandlers,
	reportFailure: (message: string) => void,
): void {
	state.reconcile({
		owner: session.owner,
		event: session.event,
		statePayloads: session.statePayloads,
		publishMarker: ownerKey => publishMarkerOnTransition(definition, ownerKey, session.markers),
	});

	// Owner scope gates the subscription, and only the subscription: the framework's behavior
	// above ran for this delivery whatever the session is. A session that is not its own owner
	// has no subscription of its own to deliver to — its events belong to the owner it follows,
	// whose effects are driven by the owner's own session.
	if (session.owner.kind !== "owner") return;

	const handler = handlers[session.event.kind];
	if (handler === undefined) return;

	const ownerKey = session.owner.key;
	let dispatched = true;
	const delivery: SessionEventDelivery = {
		event: session.event,
		owner: session.owner,
		hasUI: session.hasUI,
		feedback: {
			notify: (level, message) => {
				if (dispatched) session.feedback.notify(level, message);
			},
		},
		capability: state.capability({
			ownerKey,
			publishMarker: () => publishMarkerOnTransition(definition, ownerKey, session.markers),
			persist: values => session.persist(values),
			feedback: session.feedback,
		}),
	};

	try {
		handler(delivery);
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		reportFailure(`${definition.id}: ${session.event.kind} handler failed: ${detail}`);
	} finally {
		dispatched = false;
	}
}
