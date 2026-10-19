/**
 * Read the current observations, including readings collected before the extension attached.
 * Returned values are isolated: changing a reading cannot mutate the framework source.
 */
import type { AgentActivity } from "./details/activity";
import type { SessionContextReading } from "./details/context";
import type { SessionFacts } from "./details/facts";
import type { OwnerReference } from "../state";

/**
 * What the framework's own session observation source holds for one actual session: the readings it
 * has collected for that session, keyed by the session's own identity.
 *
 * It is a reading rather than an accounting number — nothing here is written to a storage root, and
 * a restarted process begins with no entry for any session — and an absent member is the honest
 * absence: a session nothing observed has no activity and no context rather than an idle one and a
 * context of nothing.
 *
 * The facts and the owner are recorded whenever the session was seen at all, so a consumer that
 * attached after the session was already working can still name it, place it in the tree and read
 * what was already collected for it.
 */
export interface SessionObservation {
	/** The actual session's identity within this harness, as the harness reports it. */
	readonly sessionId: string;
	/** That session's own facts, when the source has seen a delivery that carried them. */
	readonly session?: SessionFacts;
	/** The owner that session follows, when the source has seen a delivery that resolved it. */
	readonly owner?: OwnerReference;
	/** The activity the framework's own Round bookkeeping last left this session in. */
	readonly activity?: AgentActivity;
	/** The latest context reading collected for this session. */
	readonly context?: SessionContextReading;
	/**
	 * How many writes of this session's own extension data have been confirmed for it, when any have.
	 *
	 * It is a count of confirmed writes and never a value read from the storage they were written to.
	 * Unlike the two readings above it does not become unavailable when the connection that stated it
	 * ends: a write that really landed does not become untrue.
	 */
	readonly commits?: number;
}

/**
 * The read half of the Session capability: what an extension attaches to.
 *
 * One reader belongs to one extension in one process and is live: a later change is visible to a
 * later read or snapshot, exactly as the readings already collected are visible to an extension
 * attaching now. The values returned are copies isolated from the framework's authoritative record.
 */
export interface SessionObservationReader {
	/** One session's current observation, or nothing when this process has observed none of it. */
	read(sessionId: string): SessionObservation | undefined;
	/** Every session this process currently holds a reading for, in the order each was first observed. */
	snapshot(): readonly SessionObservation[];
}

