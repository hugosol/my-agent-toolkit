/**
 * The framework's session observation source: what this process currently knows about each actual
 * session it has observed, by that session's own identity.
 *
 * It is the framework's own record rather than an extension's, and it is the *shared* half of the
 * observation interface: one source belongs to one extension in one process — created by the
 * adapter beside the State store and handed to every binding it makes, exactly as that store is —
 * so the sessions this process runs, main and subagent alike, are observed into one place however
 * many bindings report their facts. A session the harness runs in another process is not observed
 * into anything here until its readings arrive: the adapter's own local access carries them, and
 * {@link handOverReading} is the framework's rule for which readings are the ones that cross in the
 * other direction — out of this process, to the owner they follow.
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
	ObservedSession,
	OwnerReference,
	SessionContextReading,
	SessionFacts,
	SessionObservation,
} from "./protocol";

/**
 * Where this process's readings of the sessions a process elsewhere serves go: the one rule that
 * decides whether a reading crosses the boundary between the two processes, and the access that
 * carries it.
 *
 * A session the harness runs in this process and whose owner this process serves is observed here
 * and delivered here; there is nowhere to hand its readings, and nothing to hand them to. A session
 * whose owner this process does *not* serve is the one case that crosses: the owner — and every
 * reader of it — lives in the process that runs that owner, and this process holds the session's own
 * observation (its facts, its activity and its context) and can state it to nobody else. That is the
 * whole of the choice, and it is made from what the framework's own deliveries resolved: an owner key
 * this process has served, and the owner reference the delivery carries.
 *
 * `serves` is asked per reading rather than captured, because which owners this process serves
 * changes with its own sessions: a process that begins serving an owner begins holding that owner's
 * sessions' readings itself.
 */
export interface ObservationHandOver {
	/** Whether this process serves this owner: a reading of the sessions that follow it is already here. */
	serves(ownerKey: string): boolean;
	/** Hands one moved reading of one session to the process that serves the owner it follows. */
	changed(reading: ObservedSession): void;
}

/**
 * Hands one reading over, where it is one this process does not already hold.
 *
 * Three cases and no fourth: a reading of a session that follows an owner this process serves stays
 * here, because this source is where that owner's sessions are observed; a reading of a session whose
 * owner this process cannot name has no seat to be carried to; and everything else — a session whose
 * owner is served elsewhere — crosses.
 */
export function handOverReading(handOver: ObservationHandOver | undefined, reading: ObservedSession): void {
	if (handOver === undefined || reading.owner.kind !== "inherited") return;
	if (handOver.serves(reading.owner.key)) return;
	handOver.changed(reading);
}

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
	 * Every session this source holds for one owner, with the readings it currently holds for it.
	 *
	 * This is what an access's first word to the process serving that owner carries: the readings
	 * already collected here for the sessions that follow it, each with the facts that name it, so a
	 * reading taken before that access was reached is not lost and nothing has to be re-collected for
	 * it. Entries that never saw a session's own facts are left out — a reading with no identity
	 * cannot be delivered to the process that has to key it — and an absent reading stays absent
	 * rather than being stated as a zero.
	 */
	readingsFor(ownerKey: string): readonly ObservedSession[] {
		const readings: ObservedSession[] = [];
		for (const entry of this.#bySession.values()) {
			const { session, owner } = entry;
			if (session === undefined || owner?.kind !== "inherited" || owner.key !== ownerKey) continue;
			readings.push({
				session,
				owner,
				...(entry.activity === undefined ? {} : { activity: entry.activity }),
				...(entry.context === undefined ? {} : { context: entry.context }),
			});
		}
		return readings;
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
