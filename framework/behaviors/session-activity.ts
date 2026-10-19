/**
 * The activity axis: one actual session's current agent activity, read off the framework's own round
 * axis and delivered to the groups that observe it.
 *
 * The reading is *derived*, and that is the whole of this module's design: a Round the framework holds
 * open for a session is that session working, and a session whose Round has ended is idle. Which
 * native fact opens a Round, which one is merely a pause inside it and when a settle really ends one
 * are decided once, by the round synthesis (`round-events.ts`); nothing here looks at a harness fact,
 * a native run state or a clock, so an extension never has to answer "is this session still working?"
 * and two surfaces can never answer it differently.
 *
 * Two things follow, and both are deliberate:
 *
 * - The axis is delivered *after* the edge that moved it, and it moves only where the edge left the
 *   session in a different reading. Work continuing inside a Round — an automatic retry, a drained
 *   queued message, a job the session is still waiting on — crosses no edge and therefore states no
 *   new reading; only a Round that opened or a Round the framework confirmed ended does. A reading
 *   that did not move is not delivered at all.
 * - A reading may also arrive from an observation source rather than from this process's own edges:
 *   the same shape is handed in by whoever obtained it — the framework's local access, when the
 *   harness ran that session in another process — and the framework delivers it as what it is, a
 *   reading of that session. Nothing of the billing lifecycle is driven by it: no Round identity is
 *   minted, no edge is dispatched and no Turn is attributed. The round axis stays the one owner of the
 *   Round, its identity and its end.
 */
import type { ExtensionDefinition } from "../core/definition";
import type {
	AgentActivity,
	RoundEvent,
	SessionActivityObservation,
	SubscriptionGroup,
} from "../interface/session";
import { dispatchToGroups } from "./subscriptions";

/**
 * The one rule this axis states, and the only place a reading is decided from an edge: the edge the
 * framework's synthesis dispatched is which reading the session is now in.
 *
 * A `round_start` is a Round the framework opened for that session — a second start inside one never
 * reaches the dispatch — and a `round_end` is one it confirmed ended, so the table below reads a
 * transition the framework already decided rather than interpreting a native fact.
 */
export const ACTIVITY_OF_EDGE: Readonly<Record<RoundEvent["kind"], AgentActivity>> = {
	round_start: "working",
	round_end: "idle",
};

/**
 * The activity axis of one binding, so its readings are that binding's own: the sessions a binding
 * watches are the sessions it was handed facts about.
 */
export interface SessionActivityAxis {
	/**
	 * Applies one observation of one actual session's activity, delivering it to the groups whose scope
	 * admits that session where it moved. An observation stating the reading already delivered states
	 * nothing.
	 */
	observe(observation: SessionActivityObservation): void;
	/**
	 * Drops the reading this axis holds for one session, as that session's observation became
	 * unavailable: an unavailable observation is not idleness, so nothing is delivered here.
	 *
	 * It is what keeps a session's return from being silent. A reading that did not move is not
	 * delivered, and a session whose live readings were withdrawn — the source that delivered them
	 * ended — and is then stated again by a source that reached the seat after it, states a reading no
	 * consumer still holds. The axis forgets the withdrawn one here, so that reading reaches the
	 * subscriber rather than being read as the one already delivered.
	 */
	forget(sessionId: string): void;
}

/** What one binding's activity axis arranges itself with. */
export interface SessionActivityAxisInputs {
	/** The definition whose id a handler failure names. */
	readonly definition: ExtensionDefinition;
	/** The subscription groups a reading is offered to, in declaration order. */
	readonly groups: readonly SubscriptionGroup[];
	/** Reports a handler's failure outside model context. */
	readonly reportFailure: (message: string) => void;
}

/**
 * Build one binding's activity axis.
 *
 * The only state it holds is the reading each actual session was last delivered in — which is what
 * makes a reading that did not move silent, and what keeps one session's observation from being read
 * for another: the reading is keyed by the session the observation itself named. An unestablished
 * session reads as nothing rather than as idle, so the first reading of a session always moves it.
 */
export function createSessionActivityAxis(inputs: SessionActivityAxisInputs): SessionActivityAxis {
	const { definition, groups, reportFailure } = inputs;
	/** The reading each actual session was last delivered in, by that session's own identity. */
	const delivered = new Map<string, AgentActivity>();
	return {
		observe(observation) {
			const sessionId = observation.session.sessionId;
			if (delivered.get(sessionId) === observation.activity) return;
			delivered.set(sessionId, observation.activity);
			dispatchToGroups(
				definition.id,
				groups,
				"session_activity",
				observation.owner,
				() => ({ delivery: { event: { kind: "session_activity" }, ...observation } }),
				reportFailure,
			);
		},
		forget(sessionId) {
			delivered.delete(sessionId);
		},
	};
}
