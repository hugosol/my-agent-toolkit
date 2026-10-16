/**
 * A session's own disposal closes the round it leaves behind (S1; contract P27, P28, P29; ticket 10).
 *
 * The seam is `bindExtension` plus the port a harness provides, driven by the shared port double: the
 * framework's `onDisposal` hook, the round edge the close-out dispatches, and the handler an assembly
 * injected for that edge. What the framework owes there is observed directly — an end the session had
 * already stated is confirmed where the host reports the disposal, a round left open with no end ever
 * stated is truncated, and the answer the host waits for settles only once every handler that edge
 * reached has settled, so a host that awaits it has a session's own commit finished before it lets the
 * session go.
 *
 * Which native fact becomes a disposal — and, above all, which facts are *not* one — is the adapter's
 * mapping, observed at the pi seam in `pi-disposal-round-close.test.ts`. This suite drives the
 * disposition the framework makes of a disposal it was handed, the exactly-once rules around it and how
 * long its answer takes.
 */
import { describe, expect, test } from "bun:test";
import type { OwnerReference, RoundDelivery } from "../../framework/core/protocol";
import { type ExtensionDefinition, defineExtension } from "../../framework/public";
import { type PortDouble, portDouble } from "./support/harness-port-double";

/** The owner a delivery acts on unless one is named. */
const OWNER: OwnerReference = { kind: "owner", key: "main:round-disposal" };

/** The actual session a disposal from this suite is about unless one is named. */
const SESSION = { sessionId: "round-disposal-session", kind: "sub" as const, unavailable: [] };

/** A second actual session, so that one session's close-out is told apart from another's. */
const OTHER = { sessionId: "round-disposal-other", kind: "sub" as const, unavailable: [] };

/** A definition that declares nothing of its own: every behavior under test is injected. */
function probeDefinition(id: string): ExtensionDefinition {
	return defineExtension({ id, displayName: id });
}

/** One recorded round edge, as the handler a case injected saw it. */
interface EndRecord {
	readonly kind: RoundDelivery["event"]["kind"];
	/** How the end was established, on an end; absent on an opening. */
	readonly ending?: string;
	readonly sessionId: string;
}

/** One binding that subscribes the round axis, and what its handler recorded, in call order. */
interface RoundObserver {
	readonly double: PortDouble;
	readonly ends: readonly EndRecord[];
	/** The end deliveries themselves, so a case can read what an end states besides its kind. */
	readonly deliveries: readonly RoundDelivery[];
}

/**
 * Binds a definition that subscribes the round axis and records every edge it is delivered.
 *
 * `handler` is the case's own body for an end — how long the close-out takes is part of the ticket, so
 * a case states the work an end's handler really does.
 */
function bindRoundObserver(id: string, handler?: (delivery: RoundDelivery) => void | Promise<void>): RoundObserver {
	const double = portDouble();
	const ends: EndRecord[] = [];
	const deliveries: RoundDelivery[] = [];
	double.bind(probeDefinition(id), {
		subscriptions: [
			{
				scope: "session",
				events: {
					round_start: delivery => {
						ends.push({ kind: delivery.event.kind, sessionId: delivery.session.sessionId });
					},
					round_end: async delivery => {
						ends.push({
							kind: delivery.event.kind,
							ending: delivery.event.kind === "round_end" ? delivery.event.ending : undefined,
							sessionId: delivery.session.sessionId,
						});
						deliveries.push(delivery);
						await handler?.(delivery);
					},
				},
			},
		],
	});
	return { double, ends, deliveries };
}

/** An end a session stated and the re-check could not confirm: the candidate a disposal confirms. */
function unconfirmedSettle(double: PortDouble, session = SESSION): void {
	double.deliverRound(OWNER, { event: { kind: "round_start" }, session });
	// At that instant the session's own facts still looked busy, so the framework's one re-check kept
	// the candidate rather than closing the round on it.
	double.deliverRound(OWNER, { event: { kind: "round_end" }, session, quiescent: false });
}

describe("the framework asks for disposal facts only where it has bookkeeping to close (P27, P29)", () => {
	test("a binding that observes the round axis is handed the hook; one that observes no axis is not", () => {
		const observing = portDouble();
		observing.bind(probeDefinition("disposal-round-probe"), {
			subscriptions: [{ scope: "session", events: { round_start: () => {} } }],
		});
		expect(observing.registrations).toContain("onDisposal");

		// A definition that observes no round, no Turn and no reading of them holds no bookkeeping a
		// disposal could close, so it asks the harness for no such fact at all.
		const silent = portDouble();
		silent.bind(probeDefinition("disposal-silent-probe"), {});
		expect(silent.registrations).not.toContain("onDisposal");
	});
});

describe("a disposal closes the round the session left behind (P27, P28)", () => {
	test("the end the session had already stated is confirmed where the host reports the disposal", async () => {
		const { double, ends } = bindRoundObserver("disposal-confirm-probe");
		unconfirmedSettle(double);
		// Nothing is confirmed on the facts alone: the session looked busy at the instant it stated the
		// end, and the framework never re-checks that candidate again by itself.
		expect(ends.map(entry => entry.kind)).toEqual(["round_start"]);

		await double.deliverDisposal(OWNER, { session: SESSION });

		expect(ends).toEqual([
			{ kind: "round_start", sessionId: SESSION.sessionId },
			{ kind: "round_end", ending: "confirmed", sessionId: SESSION.sessionId },
		]);
	});

	test("a round the session left open with no end of its own is truncated", async () => {
		const { double, ends } = bindRoundObserver("disposal-truncate-probe");
		double.deliverRound(OWNER, { event: { kind: "round_start" }, session: SESSION });

		await double.deliverDisposal(OWNER, { session: SESSION });

		expect(ends).toEqual([
			{ kind: "round_start", sessionId: SESSION.sessionId },
			{ kind: "round_end", ending: "truncated", sessionId: SESSION.sessionId },
		]);
	});

	test("the two ends are told apart by the edge, which states nothing else about the activity", async () => {
		const { double, ends, deliveries } = bindRoundObserver("disposal-ending-probe");
		unconfirmedSettle(double);
		double.deliverRound(OWNER, { event: { kind: "round_start" }, session: OTHER });

		await double.deliverDisposal(OWNER, { session: SESSION });
		await double.deliverDisposal(OWNER, { session: OTHER });

		expect(ends.map(entry => entry.ending)).toEqual([undefined, undefined, "confirmed", "truncated"]);
		// An end states how it was established and nothing else — no outcome, no turn, no message — so a
		// consumer that has to tell "this work finished" from "this work stopped being observable" reads
		// that one field rather than guessing.
		expect(deliveries.map(delivery => Object.keys(delivery.event))).toEqual([
			["kind", "ending"],
			["kind", "ending"],
		]);
	});

	test("one session's disposal closes only that session's round", async () => {
		const { double, ends } = bindRoundObserver("disposal-per-session-probe");
		double.deliverRound(OWNER, { event: { kind: "round_start" }, session: SESSION });
		double.deliverRound(OWNER, { event: { kind: "round_start" }, session: OTHER });

		await double.deliverDisposal(OWNER, { session: OTHER });

		expect(ends).toEqual([
			{ kind: "round_start", sessionId: SESSION.sessionId },
			{ kind: "round_start", sessionId: OTHER.sessionId },
			{ kind: "round_end", ending: "truncated", sessionId: OTHER.sessionId },
		]);
	});

	test("a session this binding never opened a round for is no edge at all", async () => {
		const { double, ends } = bindRoundObserver("disposal-no-round-probe");
		await double.deliverDisposal(OWNER, { session: SESSION });
		expect(ends).toEqual([]);
	});
});

describe("the report is answered only once the edge's handlers settled (P29)", () => {
	test("the host's awaited position stays open while a handler's own work runs", async () => {
		const released = Promise.withResolvers<void>();
		const order: string[] = [];
		const { double, ends } = bindRoundObserver("disposal-wait-probe", async () => {
			order.push("handler:begin");
			await released.promise;
			order.push("handler:end");
		});
		unconfirmedSettle(double);

		let answered = false;
		const disposal = double.deliverDisposal(OWNER, { session: SESSION }).then(() => {
			answered = true;
			order.push("disposal:answered");
		});
		// The edge reaches the handler first, and the host is not answered while that handler's own
		// asynchronous work — the session's save — is still running.
		expect(ends.map(entry => entry.kind)).toEqual(["round_start", "round_end"]);
		await Promise.resolve();
		await Promise.resolve();
		expect({ answered, order }).toEqual({ answered: false, order: ["handler:begin"] });

		released.resolve();
		await disposal;
		expect(order).toEqual(["handler:begin", "handler:end", "disposal:answered"]);
	});

	test("a handler's failure is contained and reported, and the report still answers", async () => {
		const { double } = bindRoundObserver("disposal-failure-probe", () => {
			throw new Error("the subscriber's own failure");
		});
		unconfirmedSettle(double);

		await double.deliverDisposal(OWNER, { session: SESSION });

		expect(double.diagnostics.some(line => line.includes("round_end handler failed"))).toBe(true);
	});
});

describe("a disposal closes what is left exactly once (P29)", () => {
	test("a repeated report and a settle after it deliver no second end", async () => {
		let edges = 0;
		const double = portDouble();
		double.bind(probeDefinition("disposal-once-probe"), {
			subscriptions: [
				{
					scope: "session",
					events: {
						round_start: () => {},
						round_end: () => {
							edges += 1;
						},
					},
				},
			],
		});
		unconfirmedSettle(double);

		await double.deliverDisposal(OWNER, { session: SESSION });
		// The same session reported again: nothing is left of its round, so nothing is delivered again.
		await double.deliverDisposal(OWNER, { session: SESSION });
		// And a settle arriving after it belongs to no open round, which is what the framework states:
		// it is dropped rather than closing something already closed.
		double.deliverRound(OWNER, { event: { kind: "round_end" }, session: SESSION });

		expect(edges).toBe(1);
	});

	test("an end the session states before its disposal, and the disposal itself, are one close-out", async () => {
		const { double, ends } = bindRoundObserver("disposal-before-settle-probe");
		unconfirmedSettle(double);

		await double.deliverDisposal(OWNER, { session: SESSION });
		// The disposal already consumed the candidate it held, so the end is delivered once and the
		// round is retired: the next activity of that session opens a round of its own.
		double.deliverRound(OWNER, { event: { kind: "round_start" }, session: SESSION });

		expect(ends).toEqual([
			{ kind: "round_start", sessionId: SESSION.sessionId },
			{ kind: "round_end", ending: "confirmed", sessionId: SESSION.sessionId },
			{ kind: "round_start", sessionId: SESSION.sessionId },
		]);
	});
});
