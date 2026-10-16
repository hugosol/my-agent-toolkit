/**
 * The framework's session observation source: what this process currently knows about each actual
 * session it has observed, by that session's own identity.
 *
 * It is the framework's own record rather than an extension's, and it is the *shared* half of the
 * observation interface: one source belongs to one extension in one process — created by the
 * adapter beside the State store and handed to every binding it makes, exactly as that store is —
 * so the sessions this process runs, main and subagent alike, are observed into one place however
 * many bindings report their facts. A session the harness runs in another process is not here at
 * all; carrying its facts across that boundary is the local access's business, not this source's.
 *
 * Two readings are recorded and nothing else: the activity the framework's own Round bookkeeping
 * last left a session in, and the latest context reading an adapter collected for it. Neither is
 * derived here — the Round axis owns which edge moves a session to which activity, and the adapter
 * owns where a host's context reading is collected — so this module holds current values and the
 * change question a caller asks of them, and no rule of its own.
 *
 * What it is for, above all, is the *first* observation a consumer gets: an extension that attaches
 * after a session is already working reads the source and finds that session's activity and context
 * as they already stand, without waiting for a further transition. That is the whole reason the
 * readings live here rather than in the delivery of the moment: a change delivery reaches whoever
 * was subscribed when it happened, and the source answers whoever attaches afterwards.
 *
 * Nothing here is persisted, and a disposed binding erases nothing: a session that parks or ends
 * keeps the last reading it reported, because the source states what was observed in this process
 * and never claims the session is over. Deciding that a reading is no longer live — an unavailable
 * source, a session no longer observed — belongs to the consumer of that reading (see the
 * contract's observation-unavailable semantics), not to this record.
 */
import type {
	AgentActivity,
	OwnerReference,
	SessionContextReading,
	SessionFacts,
	SessionObservation,
} from "./protocol";

/** One session's entry inside the source: the reading being read or written, never handed out as a handle. */
interface Entry {
	readonly sessionId: string;
	readonly session?: SessionFacts;
	readonly owner?: OwnerReference;
	readonly activity?: AgentActivity;
	readonly context?: SessionContextReading;
}

/**
 * The process's one set of session observations for one extension.
 *
 * The read half is what a consumer attaches to ({@link SessionObservations.read} and
 * {@link SessionObservations.snapshot}); the write half is the framework's own — a session delivery
 * registers the facts it carried, a dispatched round edge moves the activity, and a collected
 * context reading replaces the last one — and each write answers whether it moved anything, which
 * is what keeps a repeated reading from being published as a change.
 */
export class SessionObservations {
	#bySession = new Map<string, Entry>();

	/**
	 * Records one actual session's own facts and the owner it follows, as a delivery carried them.
	 *
	 * A session's identity is what every reading of it is keyed by, so this is recorded from the
	 * first delivery that names the session, before any reading of it arrives; later deliveries
	 * refresh what they carry — a rename, a changed chain — and leave the readings untouched.
	 */
	sawSession(facts: SessionFacts, owner: OwnerReference): void {
		const held: Entry = this.#bySession.get(facts.sessionId) ?? { sessionId: facts.sessionId };
		this.#bySession.set(facts.sessionId, { ...held, session: facts, owner });
	}

	/**
	 * Moves one session to the activity its own Round edge left it in, and answers whether it moved.
	 *
	 * A repeated reading — an edge arriving while the session is already in that activity — moves
	 * nothing and answers `false`, which is what keeps a consumer from publishing or redrawing for a
	 * state that did not change. Whether an edge *should* move the reading at all is the Round axis's
	 * rule; this answers only what it left behind.
	 */
	observeActivity(sessionId: string, activity: AgentActivity): boolean {
		const held: Entry = this.#bySession.get(sessionId) ?? { sessionId };
		if (held.activity === activity) return false;
		this.#bySession.set(sessionId, { ...held, activity });
		return true;
	}

	/**
	 * Records one session's latest context reading, and answers whether the reading changed.
	 *
	 * A collection that read the numbers the source already holds is not a change: it answers `false`
	 * and stores nothing new, so a change delivery is published once per real movement rather than
	 * once per collection point the adapter collected at.
	 */
	observeContext(sessionId: string, reading: SessionContextReading): boolean {
		const held: Entry = this.#bySession.get(sessionId) ?? { sessionId };
		const previous = held.context;
		if (
			previous !== undefined &&
			previous.tokens === reading.tokens &&
			previous.provider === reading.provider &&
			previous.model === reading.model
		) {
			return false;
		}
		this.#bySession.set(sessionId, { ...held, context: reading });
		return true;
	}

	/** One session's current observation, or nothing when this process has observed none of it. */
	read(sessionId: string): SessionObservation | undefined {
		return this.#bySession.get(sessionId);
	}

	/**
	 * Every session this source holds something for, in the order each was first observed.
	 *
	 * This is the snapshot a consumer attaching now reads: the readings that were already collected
	 * for sessions it has not seen a delivery for, activity and context alike.
	 */
	snapshot(): readonly SessionObservation[] {
		return [...this.#bySession.values()];
	}
}
