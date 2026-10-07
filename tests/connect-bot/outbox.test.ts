/**
 * The owner's outbound queue and the one flusher that drains it, as a module (E11; P32).
 *
 * The queue's bound cannot be filled through the extension seam in any realistic panel state:
 * the push budget is far shorter than the heartbeat period, so beats cannot pile up faster than
 * they drain, and the events this ticket enqueues are all heartbeats. The policy the promise
 * names — one flusher, enqueue order, a bound of 16, the oldest `heartbeat` dropped first, no
 * retry — is therefore exercised on the queue itself, and what the wiring around it does with the
 * queue is observed at the extension seam in `heartbeat.test.ts`.
 */
import { describe, expect, test } from "bun:test";
import type { PushEnvelope, PushOutcome } from "../../extensions/connect-bot/client";
import { OUTBOX_LIMIT, Outbox, OutboxFlusher } from "../../extensions/connect-bot/outbox";

/** The queue's bound, as the contract fixes it. */
const LIMIT = 16;

const heartbeat = (): PushEnvelope => ({ sessionId: "s", kind: "heartbeat", data: { value: "working" } });
const state = (value: string): PushEnvelope => ({ sessionId: "s", kind: "state", data: { value } });

/** A 2xx answer, as the wire client reports one. */
const accepted: PushOutcome = { ok: true, status: 200, body: { outcome: "accepted" } };

/** Drains a bare queue the way the flusher does, into the order it would send. */
function drain(outbox: Outbox): PushEnvelope[] {
	const sent: PushEnvelope[] = [];
	for (let envelope = outbox.shift(); envelope !== undefined; envelope = outbox.shift()) sent.push(envelope);
	return sent;
}

/**
 * A panel a test scripts one answer at a time: every send is held until the test settles it, so
 * "one event at a time" and "never retried" are observed as they happen rather than guessed from
 * how fast the loop runs.
 */
function scriptedPanel(): {
	readonly sent: PushEnvelope[];
	readonly maxInFlight: () => number;
	readonly send: (envelope: PushEnvelope) => Promise<PushOutcome>;
	/** Answers the nth send with a 2xx. */
	accept(index: number): void;
	/** Ends the nth send the way a failed request does: a reject. */
	fail(index: number): void;
} {
	const sent: PushEnvelope[] = [];
	const pending: Array<{ readonly resolve: () => void; readonly reject: (reason: unknown) => void }> = [];
	let inFlight = 0;
	let peak = 0;
	return {
		sent,
		maxInFlight: () => peak,
		send: envelope => {
			sent.push(envelope);
			inFlight += 1;
			peak = Math.max(peak, inFlight);
			return new Promise<PushOutcome>((resolve, reject) => {
				pending.push({
					resolve: () => {
						inFlight -= 1;
						resolve(accepted);
					},
					reject: reason => {
						inFlight -= 1;
						reject(reason);
					},
				});
			});
		},
		accept(index) {
			const awaiting = pending[index];
			if (awaiting === undefined) throw new Error(`no send is waiting at index ${index}`);
			awaiting.resolve();
		},
		fail(index) {
			const awaiting = pending[index];
			if (awaiting === undefined) throw new Error(`no send is waiting at index ${index}`);
			awaiting.reject(new Error("the panel never answered"));
		},
	};
}

/** Lets the flusher's drain loop unwind: it is a promise chain, not a timer. */
async function settled(): Promise<void> {
	for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
}

describe("the outbox queue (E11)", () => {
	test("hands events to the flusher in enqueue order", () => {
		const outbox = new Outbox();
		outbox.push(state("a"));
		outbox.push(heartbeat());
		outbox.push(state("b"));

		expect(drain(outbox)).toEqual([state("a"), heartbeat(), state("b")]);
		expect(outbox.shift()).toBeUndefined();
	});

	test("is bounded at 16, dropping the oldest heartbeat for the 17th event", () => {
		const outbox = new Outbox();
		outbox.push(heartbeat());
		for (let i = 0; i < LIMIT - 1; i += 1) outbox.push(state(`s${i}`));
		expect(drain(outbox)).toHaveLength(LIMIT);

		// A 17th event must not grow the queue: the oldest heartbeat goes instead, and everything
		// else keeps its place.
		const full = new Outbox();
		full.push(heartbeat());
		for (let i = 0; i < LIMIT - 1; i += 1) full.push(state(`s${i}`));
		full.push(state("newest"));

		const sent = drain(full);
		expect(sent).toHaveLength(LIMIT);
		expect(sent.some(envelope => envelope.kind === "heartbeat")).toBe(false);
		expect(sent[0]).toEqual(state("s0"));
		expect(sent[sent.length - 1]).toEqual(state("newest"));
	});

	test("drops an older heartbeat rather than an older non-heartbeat event", () => {
		const outbox = new Outbox();
		outbox.push(state("old"));
		for (let i = 0; i < LIMIT - 1; i += 1) outbox.push(heartbeat());
		outbox.push(state("newest"));

		const sent = drain(outbox);
		expect(sent).toHaveLength(LIMIT);
		// The oldest state event is still first, and one heartbeat fewer is left behind.
		expect(sent[0]).toEqual(state("old"));
		expect(sent.filter(envelope => envelope.kind === "heartbeat")).toHaveLength(LIMIT - 2);
	});

	test("falls back to the oldest event when the queue holds no heartbeat at all", () => {
		// The baseline's own fallback: with nothing periodic to drop, the oldest event goes. It is
		// unreachable while the heartbeat is the queue's only periodic source, and it is kept — and
		// asserted — so a full queue can never grow without bound.
		const outbox = new Outbox();
		for (let i = 0; i < LIMIT; i += 1) outbox.push(state(`s${i}`));
		outbox.push(state("newest"));

		const sent = drain(outbox);
		expect(sent).toHaveLength(LIMIT);
		expect(sent[0]).toEqual(state("s1"));
		expect(sent[sent.length - 1]).toEqual(state("newest"));
	});

	test("drops everything pending on clear() without ending the queue", () => {
		const outbox = new Outbox();
		outbox.push(state("a"));
		outbox.push(heartbeat());

		outbox.clear();

		expect(outbox.shift()).toBeUndefined();
		outbox.push(state("b"));
		expect(drain(outbox)).toEqual([state("b")]);
	});

	test("keeps the contract's limit of 16", () => {
		expect(OUTBOX_LIMIT).toBe(16);
	});
});

describe("the one flusher (E11)", () => {
	test("sends one event at a time, in enqueue order, and never retries a failed one", async () => {
		const panel = scriptedPanel();
		const outbox = new Outbox();
		const flusher = new OutboxFlusher(outbox, panel.send, () => {});

		flusher.enqueue(state("a"));
		flusher.enqueue(heartbeat());
		flusher.enqueue(state("b"));

		// Nothing accumulates behind the first send: a flusher that fired the next event before the
		// first settled would be what lets a slow panel reorder the session's events.
		expect(panel.sent).toEqual([state("a")]);
		expect(panel.maxInFlight()).toBe(1);

		// A failed event is dropped, not retried: the next event is the one that follows it.
		panel.fail(0);
		await settled();
		expect(panel.sent).toEqual([state("a"), heartbeat()]);

		panel.accept(1);
		await settled();
		expect(panel.sent).toEqual([state("a"), heartbeat(), state("b")]);

		panel.accept(2);
		await settled();
		expect(panel.sent).toEqual([state("a"), heartbeat(), state("b")]);
		expect(panel.maxInFlight()).toBe(1);
	});

	test("reports every settled event to the caller, an answer and a failed request alike", async () => {
		const panel = scriptedPanel();
		const outcomes: Array<PushOutcome | undefined> = [];
		const flusher = new OutboxFlusher(new Outbox(), panel.send, outcome => outcomes.push(outcome));

		flusher.enqueue(heartbeat());
		flusher.enqueue(heartbeat());

		panel.accept(0);
		await settled();
		panel.fail(1);
		await settled();

		// A success and a failure are both delivered, so the failure budget a later ticket keeps
		// counts what happened instead of reading it from the network itself.
		expect(outcomes).toEqual([accepted, undefined]);
	});

	test("never runs a second drain loop while one is going", async () => {
		const panel = scriptedPanel();
		const flusher = new OutboxFlusher(new Outbox(), panel.send, () => {});

		flusher.enqueue(state("a"));
		flusher.enqueue(state("b"));
		flusher.enqueue(state("c"));

		expect(panel.sent).toHaveLength(1);
		panel.accept(0);
		await settled();
		panel.accept(1);
		await settled();
		panel.accept(2);
		await settled();

		expect(panel.sent).toEqual([state("a"), state("b"), state("c")]);
		expect(panel.maxInFlight()).toBe(1);
	});

	test("stop() drops what is pending, ends the flusher and settles nothing more", async () => {
		const panel = scriptedPanel();
		const outcomes: Array<PushOutcome | undefined> = [];
		const flusher = new OutboxFlusher(new Outbox(), panel.send, outcome => outcomes.push(outcome));

		flusher.enqueue(state("a"));
		flusher.enqueue(state("b"));
		flusher.stop();

		// The event already on the wire settles, but nothing is reported for it: the owner is gone
		// and a late answer must not be accounted to a session that no longer exists.
		panel.accept(0);
		await settled();

		expect(panel.sent).toEqual([state("a")]);
		expect(outcomes).toEqual([]);

		// And nothing enqueued after the stop is sent at all.
		flusher.enqueue(state("c"));
		await settled();
		expect(panel.sent).toEqual([state("a")]);
	});
});
