/**
 * The Turn axis at the framework's public seam (S1; contract P57; ticket 05).
 *
 * The seam is `bindExtension` plus the harness port, driven by the shared port double: the
 * framework's own Turn identity, in-flight association, normal deduplication and conflict rules,
 * and the two edges delivered to the subscription groups whose scope admits them. What an adapter
 * maps natively — which harness fact begins a Turn, which settles it, and the fact that the
 * harness's own `turn_end` runs after tool execution and is not this axis's end — is observed at
 * the OMP seam in `turn.test.ts`.
 *
 * The expectations here are the contract's: an opaque identity minted by the framework and never a
 * provider id, the request-time facts fixed at the start and repeated at the end, a usage that is
 * reliable or explicitly unavailable (never zero by default), the round and catalog facts named
 * when they could not be obtained, and a fact that cannot be reliably associated reported and
 * dropped rather than attributed to whatever session or model was current.
 */
import { describe, expect, test } from "bun:test";
import { CODEBASE_TOOLS } from "../../extensions/codebase-tools/definition";
import type { CatalogPrice } from "../../framework/interface/host-facts";
import type {
	SessionFacts,
	SubscriptionGroup,
	TurnEndDelivery,
	TurnStartDelivery,
	TurnUsage,
} from "../../framework/interface/session";
import type { OwnerReference } from "../../framework/interface/state";
import type { TurnSignal } from "../../framework/core/protocol";
import type { ExtensionDefinition } from "../../framework/public";
import { type PortDouble, portDouble } from "./support/harness-port-double";

/** The main session's owner, as an adapter resolves it. */
const MAIN_OWNER: OwnerReference = { kind: "owner", key: "main:turn-main" };

/** The owner a subagent's delivery resolves to: the nearest top-level main session. */
const INHERITED_OWNER: OwnerReference = { kind: "inherited", key: "main:turn-main" };

const MAIN: SessionFacts = { sessionId: "turn-main", kind: "main", name: "main", unavailable: [] };

const CHILD: SessionFacts = {
	sessionId: "turn-child",
	kind: "sub",
	parentSessionId: "turn-main",
	name: "child",
	unavailable: [],
};

/** The catalog entry this suite's implementation states for one provider and model. */
const PRICE: CatalogPrice = { currency: "CNY", unit: "per-million-tokens", amounts: { input: 4.5, output: 13.5 } };

/** The usage one reliable response reported, written here from the contract's four buckets. */
const USAGE: TurnUsage = { input: 10, output: 7, cacheRead: 3, cacheWrite: 0, totalTokens: 20 };

const DEFINITION: ExtensionDefinition = CODEBASE_TOOLS;

/** The port a price-carrying definition's implementation supplies. */
const CATALOG = { priceOf: (provider: string, model: string): CatalogPrice | undefined => (provider === "deepseek" && model === "deepseek-v4-pro" ? PRICE : undefined) };

/** The signals one request/response cycle produces, built here from the contract's fact set. */
function requestStarted(overrides: Partial<{ provider: string; model: string; at: number; session: SessionFacts }> = {}): TurnSignal {
	return {
		kind: "request_started",
		session: overrides.session ?? MAIN,
		at: overrides.at ?? 1_700_000_000_000,
		provider: overrides.provider ?? "deepseek",
		model: overrides.model ?? "deepseek-v4-pro",
	};
}

function responseReceived(session: SessionFacts = MAIN): TurnSignal {
	return {
		kind: "response_received",
		session,
		http: { status: 200, headers: { "x-request-id": "req-wire-1" }, metadata: { region: "sg" }, requestId: "req-wire-1" },
	};
}

function responseSettled(options: {
	readonly session?: SessionFacts;
	readonly readings?: readonly TurnUsage[];
	readonly outcome?: "completed" | "failed" | "cancelled";
	readonly at?: number;
	readonly responseId?: string;
} = {}): TurnSignal {
	return {
		kind: "response_settled",
		session: options.session ?? MAIN,
		at: options.at ?? 1_700_000_000_500,
		outcome: options.outcome ?? "completed",
		readings: options.readings ?? [USAGE],
		...(options.responseId === undefined ? {} : { responseId: options.responseId }),
	};
}

/**
 * A definition whose implementation declares the groups a suite asks for over a catalog, and
 * records the two edges' deliveries.
 */
function subscribesTo(scope: "owner" | "session"): {
	readonly groups: readonly SubscriptionGroup[];
	readonly starts: TurnStartDelivery[];
	readonly ends: TurnEndDelivery[];
} {
	const starts: TurnStartDelivery[] = [];
	const ends: TurnEndDelivery[] = [];
	return {
		starts,
		ends,
		groups: [
			{
				scope,
				events: {
					turn_start: delivery => void starts.push(delivery as TurnStartDelivery),
					turn_end: delivery => void ends.push(delivery as TurnEndDelivery),
				},
			},
		],
	};
}

/** Opens a round for one session, so the Turn that follows has a round to belong to. */
function openRound(double: PortDouble, owner: OwnerReference, session: SessionFacts): void {
	double.deliverRound(owner, { event: { kind: "round_start" }, session });
}

describe("a Turn fixes its request-time facts at the start and repeats them at the end (P57)", () => {
	test("turn_start carries the framework's own opaque identity, the session, the round and the request facts", () => {
		const double = portDouble();
		const probe = subscribesTo("session");
		double.bind(DEFINITION, { subscriptions: probe.groups, catalog: CATALOG });
		openRound(double, MAIN_OWNER, MAIN);

		double.deliverTurn(requestStarted(), { owner: MAIN_OWNER });

		expect(probe.starts).toHaveLength(1);
		const start = probe.starts[0].turn;
		expect(start.session).toEqual(MAIN);
		expect(start.startedAt).toBe(1_700_000_000_000);
		expect(start.provider).toBe("deepseek");
		expect(start.model).toBe("deepseek-v4-pro");
		expect(start.price).toEqual(PRICE);
		expect(start.roundId).toBe("turn-main#1");
		// The identity is the framework's and is not derived from a provider id: the cycle's own
		// response id, delivered later, differs from it.
		expect(start.turnId).not.toContain("resp-wire");
		expect(start.turnId.length).toBeGreaterThan(0);
		expect(start.unavailable).toEqual([]);
	});

	test("turn_end repeats the same identity and the same request-time anchor", () => {
		const double = portDouble();
		const probe = subscribesTo("session");
		double.bind(DEFINITION, { subscriptions: probe.groups, catalog: CATALOG });
		openRound(double, MAIN_OWNER, MAIN);

		double.deliverTurn(requestStarted(), { owner: MAIN_OWNER });
		double.deliverTurn(responseReceived(), { owner: MAIN_OWNER });
		double.deliverTurn(responseSettled({ responseId: "resp-wire-9" }), { owner: MAIN_OWNER });

		expect(probe.ends).toHaveLength(1);
		const end = probe.ends[0];
		expect(end.turn).toEqual(probe.starts[0].turn);
		expect(end.end.endedAt).toBe(1_700_000_000_500);
		expect(end.end.outcome).toBe("completed");
		expect(end.end.usage).toEqual(USAGE);
		expect(end.end.http).toEqual({
			status: 200,
			headers: { "x-request-id": "req-wire-1" },
			metadata: { region: "sg" },
			requestId: "req-wire-1",
		});
		// The two external ids are reference facts: they are carried apart and neither is the Turn's
		// identity, and the transport's request id is not assumed to equal the message's response id.
		expect(end.end.providerRequestId).toBe("req-wire-1");
		expect(end.end.providerResponseId).toBe("resp-wire-9");
		expect(end.end.unavailable).toEqual([]);
	});

	test("a model changed before the end does not re-attribute or re-price the Turn", () => {
		const double = portDouble();
		const probe = subscribesTo("session");
		double.bind(DEFINITION, { subscriptions: probe.groups, catalog: CATALOG });
		openRound(double, MAIN_OWNER, MAIN);

		double.deliverTurn(requestStarted({ model: "deepseek-flash" }), { owner: MAIN_OWNER });
		// A later request in the same session names another model; the Turn already in flight keeps
		// the model and the price it started with.
		double.deliverTurn(requestStarted({ model: "deepseek-v4-pro", at: 1_700_000_000_400 }), { owner: MAIN_OWNER });

		expect(probe.starts).toHaveLength(2);
		expect(probe.starts[0].turn.model).toBe("deepseek-flash");
		expect(probe.starts[0].turn.price).toBeUndefined();
		expect(probe.starts[1].turn.model).toBe("deepseek-v4-pro");
		expect(probe.starts[1].turn.price).toEqual(PRICE);
	});

	test("a missing fact is named, never fabricated: no round and no catalog entry", () => {
		const double = portDouble();
		const probe = subscribesTo("session");
		double.bind(DEFINITION, { subscriptions: probe.groups, catalog: CATALOG });

		// No round was opened for this session, and the catalog states nothing for this model.
		double.deliverTurn(requestStarted({ provider: "openrouter", model: "some-other-model" }), { owner: MAIN_OWNER });

		const start = probe.starts[0].turn;
		expect(start.roundId).toBeUndefined();
		expect(start.price).toBeUndefined();
		expect(start.unavailable).toEqual(["round", "catalog price"]);
	});

	test("an implementation that supplies no catalog reports the price as unavailable", () => {
		const double = portDouble();
		const probe = subscribesTo("session");
		double.bind(DEFINITION, { subscriptions: probe.groups });
		openRound(double, MAIN_OWNER, MAIN);

		double.deliverTurn(requestStarted(), { owner: MAIN_OWNER });

		expect(probe.starts[0].turn.unavailable).toEqual(["catalog price"]);
	});

	test("a missing HTTP response boundary is named at the end, never filled with a default", () => {
		const double = portDouble();
		const probe = subscribesTo("session");
		double.bind(DEFINITION, { subscriptions: probe.groups, catalog: CATALOG });
		openRound(double, MAIN_OWNER, MAIN);

		double.deliverTurn(requestStarted(), { owner: MAIN_OWNER });
		double.deliverTurn(responseSettled({ responseId: "resp-wire-9" }), { owner: MAIN_OWNER });

		const end = probe.ends[0].end;
		expect(end.http).toBeUndefined();
		expect(end.providerRequestId).toBeUndefined();
		expect(end.unavailable).toEqual(["HTTP response facts"]);
	});
});

describe("the framework associates a Turn's facts with its own in-flight record (P57)", () => {
	test("a response for a session with no Turn in flight is dropped, and the other session's Turn is untouched", () => {
		const double = portDouble();
		const probe = subscribesTo("session");
		double.bind(DEFINITION, { subscriptions: probe.groups, catalog: CATALOG });
		openRound(double, MAIN_OWNER, MAIN);

		double.deliverTurn(requestStarted(), { owner: MAIN_OWNER });
		// Another actual session reports a settle: nothing may be attributed to the in-flight Turn
		// by arrival order, and no start may be fabricated for the child.
		double.deliverTurn(responseSettled({ session: CHILD, readings: [USAGE] }), { owner: INHERITED_OWNER });

		expect(probe.ends).toHaveLength(0);
		expect(double.diagnostics.join("\n")).toContain("no Turn in flight");

		// The main session's own Turn is still open: its settle completes it as usual.
		double.deliverTurn(responseSettled(), { owner: MAIN_OWNER });
		expect(probe.ends).toHaveLength(1);
		expect(probe.ends[0].turn.session).toEqual(MAIN);
	});

	test("a repeated settle carrying the same reading is normal deduplication, not a second Turn", () => {
		const double = portDouble();
		const probe = subscribesTo("session");
		double.bind(DEFINITION, { subscriptions: probe.groups, catalog: CATALOG });
		openRound(double, MAIN_OWNER, MAIN);

		double.deliverTurn(requestStarted(), { owner: MAIN_OWNER });
		double.deliverTurn(responseSettled(), { owner: MAIN_OWNER });
		double.deliverTurn(responseSettled(), { owner: MAIN_OWNER });

		expect(probe.starts).toHaveLength(1);
		expect(probe.ends).toHaveLength(1);
		expect(double.diagnostics).toEqual([]);
	});

	test("a later settle carrying different usage is a conflict: reported, dropped, and the end stands", () => {
		const double = portDouble();
		const probe = subscribesTo("session");
		double.bind(DEFINITION, { subscriptions: probe.groups, catalog: CATALOG });
		openRound(double, MAIN_OWNER, MAIN);

		double.deliverTurn(requestStarted(), { owner: MAIN_OWNER });
		double.deliverTurn(responseSettled(), { owner: MAIN_OWNER });
		double.deliverTurn(
			responseSettled({ readings: [{ ...USAGE, output: 900 }], at: 1_700_000_000_700 }),
			{ owner: MAIN_OWNER },
		);

		expect(probe.ends).toHaveLength(1);
		expect(probe.ends[0].end.usage).toEqual(USAGE);
		expect(double.diagnostics.join("\n")).toContain("different usage for an ended Turn");
	});

	test("a start arriving while a Turn is in flight drops the earlier record and reports the conflict", () => {
		const double = portDouble();
		const probe = subscribesTo("session");
		double.bind(DEFINITION, { subscriptions: probe.groups, catalog: CATALOG });
		openRound(double, MAIN_OWNER, MAIN);

		double.deliverTurn(requestStarted(), { owner: MAIN_OWNER });
		double.deliverTurn(requestStarted({ at: 1_700_000_000_100 }), { owner: MAIN_OWNER });

		expect(probe.starts).toHaveLength(2);
		expect(probe.starts[0].turn.turnId).not.toBe(probe.starts[1].turn.turnId);
		expect(double.diagnostics.join("\n")).toContain("still in flight");
	});
});

describe("usage is reliable or explicitly unavailable, never zero by default (P57)", () => {
	test("no reported reading is unavailable, not zero", () => {
		const double = portDouble();
		const probe = subscribesTo("session");
		double.bind(DEFINITION, { subscriptions: probe.groups, catalog: CATALOG });
		openRound(double, MAIN_OWNER, MAIN);

		double.deliverTurn(requestStarted(), { owner: MAIN_OWNER });
		double.deliverTurn(responseReceived(), { owner: MAIN_OWNER });
		double.deliverTurn(responseSettled({ readings: [] }), { owner: MAIN_OWNER });

		expect(probe.ends[0].end.usage).toBeUndefined();
		expect(probe.ends[0].end.unavailable).toEqual(["usage (not reported)"]);
	});

	test("an all-zero reading the harness reported is delivered as the confirmed zero it is", () => {
		const double = portDouble();
		const probe = subscribesTo("session");
		double.bind(DEFINITION, { subscriptions: probe.groups, catalog: CATALOG });
		openRound(double, MAIN_OWNER, MAIN);
		const zero: TurnUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 };

		double.deliverTurn(requestStarted(), { owner: MAIN_OWNER });
		double.deliverTurn(responseSettled({ readings: [zero] }), { owner: MAIN_OWNER });

		// A reading is what its own source established: this harness reported a zero, and nothing in
		// this Turn's evidence contradicts it, so a zero is accounted for rather than guessed at. A
		// host that cannot tell its own default from a reported zero reports no reading at all.
		expect(probe.ends[0].end.usage).toEqual(zero);
		expect(probe.ends[0].end.unavailable).toEqual(["HTTP response facts"]);
	});

	test("an all-zero end after a non-zero streamed reading is named as the host default it must be", () => {
		const double = portDouble();
		const probe = subscribesTo("session");
		double.bind(DEFINITION, { subscriptions: probe.groups, catalog: CATALOG });
		openRound(double, MAIN_OWNER, MAIN);
		const zero: TurnUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 };

		double.deliverTurn(requestStarted(), { owner: MAIN_OWNER });
		double.deliverTurn({ kind: "usage_streamed", session: MAIN, usage: USAGE }, { owner: MAIN_OWNER });
		double.deliverTurn(responseSettled({ readings: [zero] }), { owner: MAIN_OWNER });

		expect(probe.ends[0].end.usage).toBeUndefined();
		expect(probe.ends[0].end.unavailable[0]).toBe("usage (all-zero reading after non-zero streamed usage)");
	});

	test("a streamed reading is never the final usage and never makes a conflict", () => {
		const double = portDouble();
		const probe = subscribesTo("session");
		double.bind(DEFINITION, { subscriptions: probe.groups, catalog: CATALOG });
		openRound(double, MAIN_OWNER, MAIN);

		double.deliverTurn(requestStarted(), { owner: MAIN_OWNER });
		// Two streamed readings that differ from each other and from the final one: none of them is a
		// final reading, so none conflicts and none is delivered as the usage.
		double.deliverTurn({ kind: "usage_streamed", session: MAIN, usage: { ...USAGE, output: 3 } }, { owner: MAIN_OWNER });
		double.deliverTurn({ kind: "usage_streamed", session: MAIN, usage: { ...USAGE, output: 5 } }, { owner: MAIN_OWNER });
		expect(probe.ends).toHaveLength(0);

		double.deliverTurn(responseReceived(), { owner: MAIN_OWNER });
		double.deliverTurn(responseSettled(), { owner: MAIN_OWNER });

		expect(probe.ends[0].end.usage).toEqual(USAGE);
		expect(double.diagnostics).toEqual([]);
	});

	test("final readings that disagree leave no determinable source, so the usage is unavailable", () => {
		const double = portDouble();
		const probe = subscribesTo("session");
		double.bind(DEFINITION, { subscriptions: probe.groups, catalog: CATALOG });
		openRound(double, MAIN_OWNER, MAIN);

		double.deliverTurn(requestStarted(), { owner: MAIN_OWNER });
		double.deliverTurn(responseSettled({ readings: [USAGE, { ...USAGE, cacheRead: 99 }] }), { owner: MAIN_OWNER });

		expect(probe.ends[0].end.usage).toBeUndefined();
		expect(probe.ends[0].end.unavailable[0]).toBe("usage (conflicting final readings)");
	});

	test("an outcome that is not an ordinary answer still delivers its reliable usage", () => {
		const double = portDouble();
		const probe = subscribesTo("session");
		double.bind(DEFINITION, { subscriptions: probe.groups, catalog: CATALOG });
		openRound(double, MAIN_OWNER, MAIN);

		double.deliverTurn(requestStarted(), { owner: MAIN_OWNER });
		double.deliverTurn(responseSettled({ outcome: "cancelled" }), { owner: MAIN_OWNER });

		expect(probe.ends[0].end.outcome).toBe("cancelled");
		expect(probe.ends[0].end.usage).toEqual(USAGE);
	});
});

describe("the scope declaration decides which sessions a group observes (P57)", () => {
	test("a session-scoped group observes a subagent's Turn with the subagent's own identity", () => {
		const double = portDouble();
		const probe = subscribesTo("session");
		double.bind(DEFINITION, { subscriptions: probe.groups, catalog: CATALOG });
		openRound(double, INHERITED_OWNER, CHILD);

		double.deliverTurn(requestStarted({ session: CHILD }), { owner: INHERITED_OWNER });
		double.deliverTurn(responseSettled({ session: CHILD }), { owner: INHERITED_OWNER });

		expect(probe.starts[0].turn.session).toEqual(CHILD);
		expect(probe.starts[0].turn.roundId).toBe("turn-child#1");
		expect(probe.ends[0].turn.session).toEqual(CHILD);
	});

	test("an owner-scoped group is never moved by a subagent's Turn", () => {
		const double = portDouble();
		const probe = subscribesTo("owner");
		double.bind(DEFINITION, { subscriptions: probe.groups, catalog: CATALOG });
		openRound(double, INHERITED_OWNER, CHILD);

		double.deliverTurn(requestStarted({ session: CHILD }), { owner: INHERITED_OWNER });
		expect(probe.starts).toEqual([]);

		double.deliverTurn(requestStarted({ session: MAIN }), { owner: MAIN_OWNER });
		expect(probe.starts).toHaveLength(1);
		expect(probe.starts[0].turn.session).toEqual(MAIN);
	});

	test("one declaration drives both scopes through the one dispatch, with the same identity", () => {
		const double = portDouble();
		const owner = subscribesTo("owner");
		const session = subscribesTo("session");
		double.bind(DEFINITION, { subscriptions: [...owner.groups, ...session.groups], catalog: CATALOG });
		openRound(double, MAIN_OWNER, MAIN);

		double.deliverTurn(requestStarted(), { owner: MAIN_OWNER });

		expect(owner.starts).toHaveLength(1);
		expect(session.starts).toHaveLength(1);
		expect(owner.starts[0].turn.turnId).toBe(session.starts[0].turn.turnId);
	});

	test("a Turn delivery carries no write path: observation grants no owner authority", () => {
		const double = portDouble();
		const keys: string[][] = [];
		double.bind(DEFINITION, {
			subscriptions: [
				{
					scope: "session",
					events: {
						turn_start: delivery => void keys.push(Object.keys(delivery).sort()),
						turn_end: delivery => void keys.push(Object.keys(delivery).sort()),
					},
				},
			],
			catalog: CATALOG,
		});
		openRound(double, MAIN_OWNER, MAIN);

		double.deliverTurn(requestStarted(), { owner: MAIN_OWNER });
		double.deliverTurn(responseSettled(), { owner: MAIN_OWNER });

		expect(keys[0]).toEqual(["event", "feedback", "hasUI", "owner", "turn"]);
		expect(keys[1]).toEqual(["end", "event", "feedback", "hasUI", "owner", "turn"]);
	});

	test("a handler's synchronous throw and rejected promise are reported once and disturb nobody else", async () => {
		const double = portDouble();
		const received: string[] = [];
		double.bind(DEFINITION, {
			subscriptions: [
				{
					scope: "owner",
					events: {
						turn_start: () => {
							throw new Error("boom");
						},
						turn_end: () => Promise.reject(new Error("async boom")),
					},
				},
				{
					scope: "session",
					events: { turn_start: delivery => void received.push(delivery.turn.turnId) },
				},
			],
			catalog: CATALOG,
		});
		openRound(double, MAIN_OWNER, MAIN);

		double.deliverTurn(requestStarted(), { owner: MAIN_OWNER });
		double.deliverTurn(responseSettled(), { owner: MAIN_OWNER });
		// Several microtask turns: the rejected promise is contained by the framework's own chain,
		// and no real timer is waited on for it.
		for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();

		// The other group still received its own delivery, and neither the framework's own behavior
		// nor the delivery the failing handler was handed was disturbed.
		expect(received).toHaveLength(1);
		const diagnostics = double.diagnostics.join("\n");
		expect(diagnostics).toContain("turn_start handler failed: boom");
		expect(diagnostics).toContain("turn_end handler failed: async boom");
	});

	test("a Turn delivery reaches only the group that declared the Turn axis", () => {
		const double = portDouble();
		const roundEvents: string[] = [];
		const turns: string[] = [];
		double.bind(DEFINITION, {
			subscriptions: [
				{ scope: "owner", events: { round_start: () => void roundEvents.push("round_start") } },
				{ scope: "session", events: { turn_start: delivery => void turns.push(delivery.turn.turnId) } },
			],
			catalog: CATALOG,
		});
		// The round this Turn belongs to also reaches the group that declared the round axis.
		openRound(double, MAIN_OWNER, MAIN);
		double.deliverTurn(requestStarted(), { owner: MAIN_OWNER });

		// The group that declared only the round axis was moved by the round edge and by nothing on
		// the Turn axis; the group that declared the Turn received it, and neither was reported as
		// unreliable for the signals it never observed.
		expect(roundEvents).toEqual(["round_start"]);
		expect(turns).toHaveLength(1);
		expect(double.diagnostics).toEqual([]);
	});
});
