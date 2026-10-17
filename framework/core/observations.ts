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
 * and never claims the session is over.
 *
 * A reading of a session this process does not run arrives from a *source* — one connection the
 * process serving the owner admitted — and the source is what makes two of those words orderable.
 * Every reading an entry holds is stamped with the source that stated it, and the stamp is what
 * {@link SessionObservations.adoptFromSource} judges a later word by and what
 * {@link SessionObservations.withdrawSource} withdraws when that source is gone: a word from a
 * source older than the one a reading already came from is not this process's to take, and a source
 * that ends withdraws the readings it stated and nothing a later source stated instead. Deciding
 * that a reading is no longer live — an unavailable source, a session no longer observed — is what
 * that withdrawal is; this record keeps the identity, so the session is still named and still placed
 * where its direct parent puts it.
 */
import type {
	AgentActivity,
	ObservedSession,
	ObservationSource,
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
	/**
	 * The source whose word stated the activity above, when one did.
	 *
	 * Absent means the reading is this process's own observation — the round axis's, taken where the
	 * session really ran here — which no source's loss withdraws. It stays stated after the reading it
	 * stamped was withdrawn, so a word from a source older than the one that stated a reading can never
	 * put it back.
	 */
	readonly activitySource?: ObservationSource;
	readonly context?: SessionContextReading;
	/** The source whose word stated the context above, when one did. See {@link Entry.activitySource}. */
	readonly contextSource?: ObservationSource;
}

/**
 * The process's one set of session observations for one extension.
 *
 * The read half is what a consumer attaches to ({@link SessionObservations.read} and
 * {@link SessionObservations.snapshot}); the write half is the framework's own — a session delivery
 * registers the facts it carried, a dispatched round edge moves the activity, a collected context
 * reading replaces the last one, and a source that ends withdraws the readings it stated — and each
 * write answers whether it moved anything, which is what keeps a repeated reading from being
 * published as a change.
 */
export class SessionObservations {
	#bySession = new Map<string, Entry>();

	/**
	 * Records one actual session's own facts and the owner it follows, as a delivery carried them.
	 *
	 * A session's identity is what every reading of it is keyed by, so this is recorded from the
	 * first delivery that names the session, before any reading of it arrives; later deliveries
	 * refresh what they carry — a rename, a changed chain — and leave the readings untouched. The
	 * identity is the session's own rather than any source's, so nothing here is withdrawn with a
	 * source: a session whose readings are gone is still named and still placed where its direct
	 * parent puts it.
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
	 *
	 * `source` is the connection whose word stated the reading, for a session the harness ran in
	 * another process. A word from a source older than the one the reading already came from is not
	 * this process's to take, and answers `false` without touching the reading; a word from a newer
	 * source states the reading from then on even where it repeats it, because that source is what a
	 * later loss of the older one is judged by. A reading this process observed itself carries no
	 * source, and no source's loss withdraws it.
	 */
	observeActivity(sessionId: string, activity: AgentActivity, source?: ObservationSource): boolean {
		const held: Entry = this.#bySession.get(sessionId) ?? { sessionId };
		if (source !== undefined && held.activitySource !== undefined && held.activitySource > source) return false;
		if (held.activity === activity) {
			if (source !== undefined && held.activitySource !== source) {
				this.#bySession.set(sessionId, { ...held, activitySource: source });
			}
			return false;
		}
		this.#bySession.set(sessionId, { ...held, activity, activitySource: source });
		return true;
	}

	/**
	 * Records one session's latest context reading, and answers whether the reading changed.
	 *
	 * A collection that read the numbers the source already holds is not a change: it answers `false`
	 * and stores nothing new, so a change delivery is published once per real movement rather than
	 * once per collection point the adapter collected at. `source` carries the same rule it does on
	 * {@link SessionObservations.observeActivity}: a reading a source stated is that source's until a
	 * newer one states it, and one this process collected itself belongs to no source at all.
	 */
	observeContext(sessionId: string, reading: SessionContextReading, source?: ObservationSource): boolean {
		const held: Entry = this.#bySession.get(sessionId) ?? { sessionId };
		if (source !== undefined && held.contextSource !== undefined && held.contextSource > source) return false;
		const previous = held.context;
		if (
			previous !== undefined &&
			previous.tokens === reading.tokens &&
			previous.provider === reading.provider &&
			previous.model === reading.model
		) {
			if (source !== undefined && held.contextSource !== source) {
				this.#bySession.set(sessionId, { ...held, contextSource: source });
			}
			return false;
		}
		this.#bySession.set(sessionId, { ...held, context: reading, contextSource: source });
		return true;
	}

	/**
	 * Withdraws one source's readings: what this process no longer holds once that source is gone.
	 *
	 * A source is gone when the connection it delivered over ended, and what that costs is exactly the
	 * live readings *it* stated: the activity and the context an entry's own source stamp names are
	 * dropped with it, while a reading a newer source stated in their place, and one this process
	 * observed itself, are untouched — an old connection ending cannot take away what a later one
	 * delivered. The session's own facts and the owner it follows stay, so the answer carries them:
	 * that identity is what a consumer still names the session by, and what keeps it in the tree its
	 * direct parent puts it in. No reading is inferred in place of the withdrawn one — an unavailable
	 * observation is not idleness, and nothing here states that the session stopped, failed or
	 * finished.
	 *
	 * The withdrawn reading's stamp is kept rather than cleared: the source that stated it is still the
	 * newest one that has, so a word from a source at or below it — the same connection's, were it
	 * still there — cannot state it again.
	 */
	withdrawSource(source: ObservationSource): readonly ObservedSession[] {
		const lost: ObservedSession[] = [];
		for (const [sessionId, held] of this.#bySession) {
			const activity = held.activitySource === source && held.activity !== undefined;
			const context = held.contextSource === source && held.context !== undefined;
			if (!activity && !context) continue;
			this.#bySession.set(sessionId, {
				...held,
				...(activity ? { activity: undefined } : {}),
				...(context ? { context: undefined } : {}),
			});
			if (held.session !== undefined && held.owner !== undefined) {
				lost.push({ session: held.session, owner: held.owner });
			}
		}
		return lost;
	}

	/** One session's current observation, or nothing when this process has observed none of it. */
	read(sessionId: string): SessionObservation | undefined {
		const held = this.#bySession.get(sessionId);
		return held === undefined ? undefined : this.#readable(held);
	}

	/**
	 * One entry as a consumer reads it: the session, the owner it follows and the readings this process
	 * holds, with nothing of which source stated them.
	 *
	 * The source a reading came from is the framework's own bookkeeping — what a word is judged by, and
	 * what a source's loss withdraws — and a consumer reads an observation rather than the provenance
	 * of one, exactly as it reads a reading rather than the connection it crossed on.
	 */
	#readable(entry: Entry): SessionObservation {
		return {
			sessionId: entry.sessionId,
			...(entry.session === undefined ? {} : { session: entry.session }),
			...(entry.owner === undefined ? {} : { owner: entry.owner }),
			...(entry.activity === undefined ? {} : { activity: entry.activity }),
			...(entry.context === undefined ? {} : { context: entry.context }),
		};
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
		return [...this.#bySession.values()].map(entry => this.#readable(entry));
	}
}
