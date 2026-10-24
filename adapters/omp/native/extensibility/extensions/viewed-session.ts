/**
 * OMP's optional native Viewed-session variant, supplied by the existing approved host patch
 * (`extensibility/extensions/types.ts` and `viewed-session.ts`), never a third-party provider.
 * The facts the host's public outlet publishes about the session it
 * displays, the one native subscription a binding keeps on that outlet, and the framework
 * listeners that subscription feeds.
 *
 * Which context is newest stays the binding's context tracker, which records a delivery before
 * this module is pointed at it; the marker area's transport is injected per delivery so nothing
 * in this module names a native widget.
 */
import type { MarkerTransport, ViewedSessionPort } from "../../../../../framework/runtime/port";
import type { ContextTracker } from "./context";
import type { OmpExtensionApi, OmpSessionContext } from "./types";
import { viewedOwnerOf } from "./session-facts";

/**
 * The facts the host's public Viewed session outlet publishes about the session it displays.
 *
 * Only the fields this adapter maps are named: the displayed session's own identity and its agent's
 * kind and direct parent, which is what resolves *whose* State the marker area projects. A fact the
 * host could not obtain is absent (and named in the outlet's own `unavailable` list), so the adapter
 * resolves no seat rather than guessing one from a displayed name or from the session it is bound to.
 */
export interface OmpViewedSessionFacts {
	/** Identity of the displayed agent: its registry id, its kind and its direct parent. */
	readonly agent: {
		readonly kind: "main" | "sub";
		readonly id: string;
		readonly parentId?: string;
	};
	/** Session id the harness reports for the displayed session. */
	readonly sessionId?: string;
}

/** One binding's view of the harness's displayed session: the port it hands the framework. */
export interface ViewedSessionObservation {
	/** The harness's displayed session, as the framework reads and subscribes to it. */
	readonly viewedSession: ViewedSessionPort;
}

/**
 * Builds one binding's subscription to the harness's displayed session.
 *
 * `context` is that binding's own tracker: a publication reads the newest context a delivery came
 * from — a live context, never a copied fact — and this module registers on the tracker so the
 * native subscription is re-pointed whenever the context moves (a session switch, a subagent's own
 * delivery), because the outlet is reachable only through a live context. A host that publishes no
 * outlet is never subscribed to, and its deliveries simply leave the adapter with no displayed
 * session to report. `markerTransport` builds the marker area of one delivery's session, so the
 * widget this adapter owns stays in the module that defines it.
 */
export function createViewedSession(
	pi: OmpExtensionApi,
	context: ContextTracker,
	markerTransport: (ctx: OmpSessionContext) => MarkerTransport,
): ViewedSessionObservation {
	/** The context the outlet is currently subscribed through, so a context that does not move is not re-subscribed. */
	let watchedContext: OmpSessionContext | undefined;
	/** The native unsubscribe of that subscription. */
	let unwatchViewed: (() => void) | undefined;
	/** The framework's listeners on the displayed session, one per interested binding of this assembly. */
	const viewedListeners = new Set<(markers: MarkerTransport) => void>();

	/**
	 * Only interested framework listeners keep a native subscription alive. While interested,
	 * the subscription is re-pointed when the context moves and left alone when it does not: a
	 * context that publishes no such subscription is never watched, and every later delivery from
	 * it leaves the existing subscription exactly as it stands.
	 */
	const watch = (ctx: OmpSessionContext): void => {
		if (viewedListeners.size === 0 || typeof ctx.subscribeViewedSessionChanged !== "function" || watchedContext === ctx) return;
		watchedContext = ctx;
		unwatchViewed?.();
		unwatchViewed = ctx.subscribeViewedSessionChanged(() => {
			const markers = markerTransport(ctx);
			for (const listener of [...viewedListeners]) listener(markers);
		});
	};

	/**
	 * The harness's displayed session, as the framework observes it: re-read per publication through
	 * the newest context, and subscribed to so a view attaching to another session republishes the
	 * area without any delivery having to carry that fact.
	 *
	 * A context that publishes no outlet is the honest absence: `read` answers nothing and the
	 * framework keeps projecting the position its deliveries carry. The subscription holds the
	 * framework's own listeners and is this binding's to give up; subscribing creates no owner and
	 * touches no session's state.
	 */
	const viewedSession: ViewedSessionPort = {
		read: () => {
			const ctx = context.latest();
			if (ctx === undefined || typeof ctx.getViewedSession !== "function") return undefined;
			return viewedOwnerOf(pi, ctx.getViewedSession());
		},
		subscribe: listener => {
			viewedListeners.add(listener);
			return () => {
				viewedListeners.delete(listener);
				// The last listener is leaving: the host's own subscription goes with it rather than
				// outliving every binding that cared about the displayed session. The next delivery
				// re-points it if anything subscribes again.
				if (viewedListeners.size > 0) return;
				unwatchViewed?.();
				unwatchViewed = undefined;
				watchedContext = undefined;
			};
		},
	};

	// The assembly records every delivery's context through this tracker before any mapping runs,
	// so this is the one place that sees a context move and re-points the native subscription.
	context.onRecord(watch);

	return { viewedSession };
}
