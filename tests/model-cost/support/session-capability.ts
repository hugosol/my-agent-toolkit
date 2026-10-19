/**
 * One in-memory Session capability for a suite that drives the extension's business directly.
 *
 * The read half is exactly what a production consumer receives — `observations.read` and
 * `observations.snapshot` — and the write half is this file's own: a case registers the facts a
 * delivery carried, moves a context or activity reading, or counts a confirmed write. Nothing here
 * reaches the framework's implementation, and the runtime under test receives only the capability,
 * so a case proves the consumer reads through the interface it is handed rather than through a
 * concrete source.
 */
import type {
	AgentActivity,
	SessionCapability,
	SessionContextReading,
	SessionFacts,
	SessionObservation,
	SessionObservationReader,
} from "../../../framework/interface/session";
import type { OwnerReference } from "../../../framework/interface/state";

/** The Session capability a suite injects, plus the write side the suite drives it through. */
export interface TestSessionCapability extends SessionCapability {
	readonly observations: SessionObservationReader;
	/** Records one session's own facts and the owner it follows, as a delivery carried them. */
	sawSession(facts: SessionFacts, owner: OwnerReference): void;
	/** Records one session's latest context reading; answers whether it moved. */
	observeContext(sessionId: string, reading: SessionContextReading): boolean;
	/** Moves one session's activity reading; answers whether it moved. */
	observeActivity(sessionId: string, activity: AgentActivity): boolean;
	/** Records one session's confirmed-write count; answers whether it moved. */
	observeCommits(sessionId: string, commits: number): boolean;
}

/** Builds one empty capability. A suite keeps the returned object to drive its write side. */
export function testSessionCapability(): TestSessionCapability {
	const entries = new Map<string, SessionObservation>();
	// Every writer merges into the entry already held for the session, so a reading never erases the
	// facts or the owner another writer recorded.
	const entryOf = (sessionId: string): SessionObservation => entries.get(sessionId) ?? { sessionId };
	const store = (entry: SessionObservation): void => {
		entries.set(entry.sessionId, entry);
	};

	const capability: TestSessionCapability = {
		observations: {
			read(sessionId) {
				const entry = entries.get(sessionId);
				return entry === undefined ? undefined : { ...entry };
			},
			snapshot() {
				return [...entries.values()].map(entry => ({ ...entry }));
			},
		},
		recordCommit(sessionId) {
			const held = entries.get(sessionId);
			// A notice with no identity has nowhere to be placed, exactly as the framework's own
			// source answers: only a session this fixture has seen can be counted.
			if (held?.session === undefined || held.owner === undefined) return;
			store({ ...held, commits: (held.commits ?? 0) + 1 });
		},
		sawSession(facts, owner) {
			const held = entryOf(facts.sessionId);
			// Startup is a fact about the beginning, not a current reading: an ordinary delivery
			// omits it and must not erase what a start already stated.
			const startup = held.session?.startup ?? facts.startup;
			const session = startup === undefined ? facts : { ...facts, startup };
			store({ ...held, session, owner });
		},
		observeContext(sessionId, reading) {
			const held = entryOf(sessionId);
			const previous = held.context;
			const changed =
				previous === undefined ||
				previous.tokens !== reading.tokens ||
				previous.provider !== reading.provider ||
				previous.model !== reading.model;
			store({ ...held, context: reading });
			return changed;
		},
		observeActivity(sessionId, activity) {
			const held = entryOf(sessionId);
			const changed = held.activity !== activity;
			store({ ...held, activity });
			return changed;
		},
		observeCommits(sessionId, commits) {
			const held = entryOf(sessionId);
			const changed = held.commits !== commits;
			store({ ...held, commits });
			return changed;
		},
	};
	return capability;
}
