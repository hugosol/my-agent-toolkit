/**
 * The owner's outbound queue and the one flusher that drains it.
 *
 * Every background push this extension makes — today the heartbeat — leaves through this queue
 * instead of awaiting the panel: an enqueue returns at once, and the single flusher sends what is
 * queued in order, one event at a time, within the request budget the sender applies — the same
 * configured wait every other request this extension makes uses. A push that fails is
 * dropped rather than retried (the next heartbeat heals it), so the queue never grows without end
 * and a slow panel can never reorder — or replay — this session's events.
 *
 * The bound is what makes 「不缓冲/不重试」 precise. When the queue is full the oldest `heartbeat`
 * goes first: a heartbeat is periodic and every beat carries the state in force now, so dropping an
 * old one loses nothing a later beat does not say again. A queue with no heartbeat in it (a shape
 * the heartbeat's own periodicity makes unreachable) falls back to dropping its oldest event,
 * because a newer event always supersedes an older one of the same kind.
 */
import type { PushEnvelope, PushOutcome } from "./client";

/** The outbound queue's bound; a full queue drops its oldest heartbeat rather than growing. */
export const OUTBOX_LIMIT = 16;

/**
 * The bounded, ordered queue of one owner's pending events.
 *
 * It is a queue and nothing else: which events enter it and when the owner stops are the caller's
 * decisions, and the sending itself belongs to {@link OutboxFlusher}.
 */
export class Outbox {
	readonly #limit: number;
	readonly #pending: PushEnvelope[] = [];

	constructor(limit: number = OUTBOX_LIMIT) {
		this.#limit = limit;
	}

	/** Enqueues one event; a full queue drops its oldest heartbeat first. */
	push(envelope: PushEnvelope): void {
		if (this.#pending.length >= this.#limit) {
			const heartbeat = this.#pending.findIndex(item => item.kind === "heartbeat");
			this.#pending.splice(heartbeat >= 0 ? heartbeat : 0, 1);
		}
		this.#pending.push(envelope);
	}

	/** Takes the next event to send; `undefined` when nothing is pending. */
	shift(): PushEnvelope | undefined {
		return this.#pending.shift();
	}

	/** Drops every pending event: a queued frame is worth nothing once its owner stops or re-arms. */
	clear(): void {
		this.#pending.length = 0;
	}
}

/**
 * Sends one queued event. It resolves for any HTTP answer and rejects when the request itself
 * fails or runs out of budget — the wire client's own contract.
 */
export type QueuedSender = (envelope: PushEnvelope) => Promise<PushOutcome>;

/**
 * What one queued push settled to, as the flusher observed it: the panel's answer, or `undefined`
 * when the request itself failed (a reject or the budget running out). It is the result surface
 * the failure budget counts — the flusher never reads the failure itself, and never swallows it.
 */
export type SettledPush = PushOutcome | undefined;

/** Receives every settled push, in send order. */
export type PushResultObserver = (outcome: SettledPush) => void;

/**
 * The one flusher of an owner's outbox.
 *
 * One drain loop at a time is what keeps the queue ordered: while a loop is running a new enqueue
 * is left for it to pick up, and a second loop is never started. An event whose request failed is
 * dropped there and then, and each settled event is reported to the caller's observer, so a
 * failure is accounted for rather than silently lost.
 */
export class OutboxFlusher {
	readonly #outbox: Outbox;
	readonly #send: QueuedSender;
	readonly #onSettled: PushResultObserver;
	#flushing = false;
	#stopped = false;

	constructor(outbox: Outbox, send: QueuedSender, onSettled: PushResultObserver) {
		this.#outbox = outbox;
		this.#send = send;
		this.#onSettled = onSettled;
	}

	/** Enqueues one event and makes sure the one drain loop is running. */
	enqueue(envelope: PushEnvelope): void {
		if (this.#stopped) return;
		this.#outbox.push(envelope);
		this.#flush();
	}

	/** Drops what is pending without ending the flusher: the owner asked the panel again. */
	clear(): void {
		this.#outbox.clear();
	}

	/**
	 * Ends this owner's outbound traffic: everything pending is dropped and nothing enqueued
	 * afterwards is sent. An event already on the wire settles, but its answer is not reported —
	 * the owner is gone, and a late answer must not be accounted to it.
	 */
	stop(): void {
		this.#stopped = true;
		this.#outbox.clear();
	}

	#flush(): void {
		if (this.#flushing) return;
		this.#flushing = true;
		void this.#drain().catch(() => {});
	}

	async #drain(): Promise<void> {
		try {
			for (let envelope = this.#outbox.shift(); envelope !== undefined; envelope = this.#outbox.shift()) {
				const outcome = await this.#send(envelope).catch(() => undefined);
				if (this.#stopped) return;
				this.#onSettled(outcome);
			}
		} finally {
			// A throwing observer must not leave the flusher wedged shut: the queue would never drain
			// again, and every later heartbeat would pile up behind a callback's bug.
			this.#flushing = false;
		}
	}
}
