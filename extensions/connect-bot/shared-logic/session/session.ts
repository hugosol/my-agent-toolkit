/**
 * The extension's own session data: the facts its wire protocol needs, and the one record it
 * keeps per armed owner.
 *
 * None of this is framework State. The framework holds exactly one declared value for
 * connect-bot — `enabled` — while the real session id a later unregister must name, the
 * capability the arm delivery handed out for the effects that outlive it, the budget that counts
 * this connection's failing pushes, and every fact the register body carries are the extension's
 * own working data, keyed by the owner key the framework resolved. A rule about an effect
 * therefore never has to be expressed as a second authoritative value.
 *
 * The facts themselves are read natively by the extension's harness assembly and injected here
 * as plain data: this module names no harness and reaches no native API.
 */
import type { OwnerCapabilityHandle } from "../../../../framework/core/protocol";
import type { AgentState } from "./agent-state";
import type { ConnectionHealth } from "../panel/failure-budget";
import type { TimerCancel } from "../managed-timer";
import type { OutboxFlusher } from "../panel/outbox";

/**
 * The facts of the session being served, as the harness assembly reads them natively.
 *
 * They exist because the framework's owner key is an opaque derivation it never interprets, so
 * a wire protocol that has to name the real session — and to describe it the way the panel's
 * view does — cannot be built from the delivery alone.
 */
export interface SessionFacts {
	/** The real session id the panel keys this session by. */
	readonly sessionId: string;
	/** The session's working directory. */
	readonly cwd: string;
	/** The model's display name, or `undefined` when the session reports none. */
	readonly model?: string | undefined;
	/** The session's name, or `undefined` when the session has none. */
	readonly sessionName?: string | undefined;
}

/**
 * The record of one armed owner: what the extension keeps for the effects it drives for that
 * session.
 *
 * It is created when the owner arms and belongs to the extension — the framework's cell for the
 * owner is retired at the session boundary, while what a later effect must still know about the
 * row it left behind is the extension's own business.
 *
 * It is also the one thing a re-arm keeps: asking the panel again leaves the owner's heartbeat and
 * its outbound queue exactly where they are (a second timer would double every beat) and only
 * updates what the record now holds, which is why the facts a re-arm can change are the mutable
 * members below and the two effects are not.
 */
export interface BotSession {
	/** The real session id this owner registered with; the id a later unregister names. */
	sessionId: string;
	/**
	 * The owner-scoped capability the arm delivery handed out, kept for the effects that run
	 * outside a delivery (a heartbeat, an outbound flusher). It writes the declared value and
	 * publishes feedback exactly as the delivery did, and it is inert once the owner retires.
	 */
	capability: OwnerCapabilityHandle;
	/**
	 * The agent state this owner reports now. The heartbeat carries it verbatim, so what the panel
	 * reads on the wire is what the extension holds and nothing is derived twice.
	 */
	state: AgentState;
	/**
	 * The owner's outbound queue and the one flusher that drains it. Every background push — today
	 * the heartbeat — leaves through it, and stopping the owner ends it.
	 */
	readonly outbox: OutboxFlusher;
	/**
	 * The owner's consecutive-failure budget: how many of those pushes have failed in a row, and
	 * whether this outage has been announced. It belongs to the connection the record describes —
	 * the flusher's callback reads it here, a re-arm resets it in place, and the stop that drops
	 * the record drops the segment with it.
	 */
	readonly health: ConnectionHealth;
	/** Cancels exactly this owner's heartbeat timer, and no other. */
	readonly heartbeat: TimerCancel;
}

/**
 * The armed owners of this process, keyed by the owner key the framework resolved.
 *
 * It is process-scoped like the framework's own State store, so the record an arm created is
 * the one a later boundary finds; a session that never armed has no record and no entry is
 * invented for it.
 */
class BotSessionStore {
	readonly #records = new Map<string, BotSession>();

	/** Records one armed owner, replacing any record the same owner already had. */
	record(ownerKey: string, session: BotSession): void {
		this.#records.set(ownerKey, session);
	}

	/** The record of one owner, or `undefined` when that owner never armed. */
	get(ownerKey: string): BotSession | undefined {
		return this.#records.get(ownerKey);
	}

	/**
	 * Drops the record of one owner: the owner is no longer armed, so the effects that read a
	 * record to decide what to send have nothing to act on.
	 *
	 * Dropping a record no owner has is a no-op, which is what lets a disarm run on a session
	 * that never armed without inventing a record to remove.
	 */
	clear(ownerKey: string): void {
		this.#records.delete(ownerKey);
	}
}

/** The one store of this extension in this process. */
export const botSessions = new BotSessionStore();

/**
 * Stop every local effect this extension is running for one owner, synchronously.
 *
 * This is the one entry point a stop goes through — an `off`, a re-arm the panel refused, an
 * auto-disarm when the failure budget runs out, and the session boundary that leaves this owner
 * behind for another identity — so no caller has to know which effects an owner currently holds,
 * and the stop is complete before any of them touches the network: the owner's heartbeat timer is
 * cancelled, everything it queued for the panel is dropped, and the record those effects read at
 * beat time is gone, so a callback already in flight finds nothing to say.
 *
 * Stopping an owner that never armed is a no-op: there is no timer to cancel, no queue to drop
 * and no entry invented for one.
 */
export function stopLocalEffects(ownerKey: string): void {
	const session = botSessions.get(ownerKey);
	if (session === undefined) return;
	session.heartbeat();
	session.outbox.stop();
	botSessions.clear(ownerKey);
}
