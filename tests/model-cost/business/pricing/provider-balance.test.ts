/**
 * The DeepSeek balance reading at the extension's display seam (P38; S2).
 *
 * The seam under test is production throughout: the extension's real definition is bound through the
 * framework's public binding (the port double, `tests/framework/support/harness-port-double.ts`), the
 * runtime is the one `createModelCostRuntime` builds, and every Turn delivery below is fed exactly as
 * a harness adapter would feed it. What the cases read is what a frontend reads —
 * `runtime.presentation.balance()`, the provider-level read-only result — and what they count is what
 * the balance query really did, through the two public dependencies this extension's own business
 * takes: the harness's provider access (`ProviderAccess`) and the framework's HTTP call.
 *
 * The HTTP call is the same single-request interface production runs on
 * (`framework/interface/general/http.ts`), substituted here so no permanent case reaches a provider; the mock
 * records every call with the exact URL and options the query built, which is what makes the address,
 * the credential header, the direct-connection choice and the 5000ms business budget observable
 * rather than asserted about. This host resolves access for the balance's own provider alone, so the
 * extension's one other provider query — the Codex account API — reaches no request here. The clock
 * is a controlled input, so every TTL boundary below is placed exactly. Nothing here recomputes an
 * expectation with the code under test: the balance documents are the provider's documented shape
 * written out by hand, the URL expectations are the specification's own rule (`base` minus a trailing
 * `/v1`, plus `/user/balance`), and the instant expectations are arithmetic on this file's own clock.
 *
 * Every case here starts *after* the CLI's one startup prefetch, which is what a session's first
 * request waits on (`tests/model-cost/integration/runtime-initialization.test.ts` is that prefetch's own suite):
 * the bind below drives the owner session's start, so the prefetch has already asked once — the
 * requests it made are kept apart in `bound.prefetched` — and the state it left, a reading or a
 * failure at its own instant, is the state each case's own deliveries are measured against. What
 * `bound.sent` and `bound.resolved` then count is what the case's own deliveries added, so a case
 * about the usage trigger observes the usage trigger and not the prefetch beside it.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { MODEL_COST } from "../../../../extensions/model-cost/definition";
import type { ModelPricingData } from "../../../../extensions/model-cost/shared-logic/business/pricing/model-data";
import { type ModelCostRuntime, createModelCostRuntime } from "../../../../extensions/model-cost/shared-logic/runtime";
import type { ProviderAccess, ProviderAccessFacts } from "../../../../framework/interface/provider";
import type { SessionFacts, TurnOutcome, TurnUsage } from "../../../../framework/interface/session";
import type { TurnSignal } from "../../../../framework/runtime/port";
import type { HttpRequestOptions } from "../../../../framework/interface/general/http";
import { type PortDouble, portDouble } from "../../../framework/support/harness-port-double";
import { testSessionCapability } from "../../support/session-capability";
import { drain, heldAnswer, settled, until } from "../../../support/pending-query";

/** The self-made pricing data every case binds with: nothing here reads a real price or model list. */
const DATA: ModelPricingData = {
	currency: "XTS",
	unit: "XTS per million tokens",
	peakMultiplier: 3,
	zoneOffsetMinutes: 8 * 60,
	peakWindows: [],
	tiers: {},
	allowanceProviders: [],
	models: {},
};

const HARNESS = "probe-harness";
const MAIN: SessionFacts = { sessionId: "session-main", kind: "main", unavailable: [] };
const OWNER = { kind: "owner", key: "main:balance" } as const;
const USAGE: TurnUsage = { input: 1, cacheRead: 0, cacheWrite: 0, output: 1, totalTokens: 2 };

/** The provider the balance belongs to, and one this extension's balance never queries. */
const DEEPSEEK = "deepseek";
const OTHER_PROVIDER = "opencode-go";

/** The specification's own success TTL, and the default a configuration that does not state one keeps. */
const SPEC_TTL_MS = 30_000;

/** The instant this file's clock starts at: it is what the prefetch's reading is accepted at. */
const CLOCK = 1_000_000;

/** One request the query made, as the substituted HTTP call recorded it. */
interface SentRequest {
	readonly url: string;
	readonly options: HttpRequestOptions | undefined;
}

/** The balance answer the provider returns, in its documented shape, as one JSON response. */
function balanceAnswer(total: string): Response {
	return new Response(
		JSON.stringify({
			is_available: true,
			balance_infos: [{ currency: "CNY", total_balance: total, granted_balance: "0.00", topped_up_balance: total }],
		}),
		{ status: 200, headers: { "content-type": "application/json" } },
	);
}

/**
 * One whole request in a session of its own: its Turn's start facts and, a minute later, its settled
 * response — the delivery a real usage returns on.
 */
function turnOf(double: PortDouble, at: number, provider: string): void {
	const session: SessionFacts = { sessionId: `session-${provider}-${at}`, kind: "main", unavailable: [] };
	double.deliverTurn({ kind: "request_started", session, at, provider, model: "model-x" } as TurnSignal, {
		owner: OWNER,
	});
	const settledTurn: TurnSignal = {
		kind: "response_settled",
		session,
		at: at + 60_000,
		outcome: "completed" as TurnOutcome,
		readings: [USAGE],
	};
	double.deliverTurn(settledTurn, { owner: OWNER });
}

/** One bound instance, and what a case drives and observes it through. */
interface BoundBalance {
	readonly runtime: ModelCostRuntime;
	readonly double: PortDouble;
	/** Every request the prefetch made, in call order, before this case's own deliveries. */
	readonly prefetched: readonly SentRequest[];
	/** Every request this case's own deliveries made, in call order. */
	readonly sent: SentRequest[];
	/** Every provider `ProviderAccess.resolve` was asked about since the prefetch, in call order. */
	readonly resolved: string[];
	/** The clock the runtime's own business reads; a case moves it by assignment. */
	readonly clock: { now: number };
	/** How many times the read-only result's change notification reached a subscriber. */
	notifications(): number;
}

/** Every root this file created, removed after each case. */
const roots: string[] = [];

/**
 * One balance instance over a fresh isolated root: the production runtime, bound through the
 * framework's own binding, with the harness's provider access and the HTTP call substituted.
 *
 * `ttlMs` omitted means the configuration states no TTL at all, which is the specification's own
 * default; a case that states one proves the value drove the boundary. `initiate: false` drives the
 * owner session's start — which is where the CLI's prefetch begins — without waiting for the first
 * run initiation, which is what a case holding the prefetch's own query open needs.
 */
async function bindBalance(
	options: {
		readonly ttlMs?: number;
		readonly access?: (provider: string) => Promise<ProviderAccessFacts | undefined>;
		readonly respond?: (request: SentRequest, index: number) => Response | Promise<Response>;
		readonly initiate?: boolean;
	} = {},
): Promise<BoundBalance> {
	const root = mkdtempSync(path.join(tmpdir(), "model-cost-balance-"));
	roots.push(root);
	const clock = { now: CLOCK };
	const sent: SentRequest[] = [];
	const resolved: string[] = [];
	/** Every request this instance made, prefetch and case deliveries alike: what indexes the responder. */
	let calls = 0;
	let notifications = 0;
	const access: ProviderAccess = {
		resolve: async provider => {
			// This file's subject is the balance query and the provider it belongs to. The extension's
			// other provider query — the Codex account API asked beside the prefetch — is out of this
			// file's scope, so this host resolves no access for a provider other than the balance's: that
			// query sends nothing and asks about no other provider.
			if (provider !== DEEPSEEK) return undefined;
			resolved.push(provider);
			return options.access === undefined
				? { baseUrl: "https://host.example/v1", credential: "key-one" }
				: options.access(provider);
		},
	};
	const runtime = createModelCostRuntime({
		config: options.ttlMs === undefined ? { storageDir: root } : { storageDir: root, balanceTtlMs: options.ttlMs },
		configDirectory: root,
		userHomeDirectory: root,
		harness: HARNESS,
		data: DATA,
		session: testSessionCapability(),
		providerAccess: access,
		now: () => clock.now,
		httpRequest: async (url, httpOptions) => {
			const request = { url, options: httpOptions };
			sent.push(request);
			const index = calls;
			calls += 1;
			return options.respond === undefined ? balanceAnswer("110.00") : options.respond(request, index);
		},
	});
	const double = portDouble();
	double.bind(MODEL_COST, {
		factory: () => runtime.implementation,
		// The declared configuration is read once per extension per process; this reader answers the
		// declaration so the binding validates without touching the repository's own file. The declared
		// field is required by the framework, so the reader always states it; the case's own choice of
		// TTL reaches the runtime through its inputs above, which is what decides whether the extension
		// reads a configured value or the specification's default.
		config: {
			reader: () => `storageDir: ${root}\nbalanceTtlMs: ${options.ttlMs ?? SPEC_TTL_MS}\ncodexQuotaTtlMs: 15000\n`,
		},
	});
	// One change subscription, exactly as a frontend keeps: a reading or a failure reaches it.
	const subscribe = (): void => {
		runtime.view.subscribe(() => {
			notifications += 1;
		});
	};
	double.deliverSession(OWNER, { session: MAIN });
	if (options.initiate === false) {
		subscribe();
		return { runtime, double, prefetched: [], sent, resolved, clock, notifications: () => notifications };
	}
	await double.initiateRun(OWNER);
	// The prefetch ran at the session start above, and it is what asked first; keeping its requests apart
	// and clearing the asks and notifications leaves each case observing its own deliveries while the
	// state the prefetch left stands.
	const prefetched = sent.splice(0);
	resolved.length = 0;
	subscribe();
	return { runtime, double, prefetched, sent, resolved, clock, notifications: () => notifications };
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("the CLI's prefetch asks once, and a settled request checks its reading's success TTL (P29)", () => {
	test("a settled request past the prefetched reading's TTL queries with the host address, credential and budget", async () => {
		const bound = await bindBalance();

		// The CLI's own prefetch is what asked first: one request, built from the host's own address with
		// its trailing `/v1` removed, the host's credential, the 5000ms business budget and an explicitly
		// direct connection.
		expect(bound.prefetched).toEqual([
			{
				url: "https://host.example/user/balance",
				options: {
					method: "GET",
					headers: { authorization: "Bearer key-one" },
					timeoutMs: 5_000,
					proxy: false,
				},
			},
		]);
		expect(bound.runtime.presentation.balance()).toEqual({
			reading: { total: 110, currency: "CNY", obtainedAt: CLOCK },
		});

		// That reading is now past its success TTL, so this settled request is what refreshes it — the
		// same address, credential, budget and connection, from the usage trigger rather than the startup
		// one — and the change reaches the one subscription a frontend keeps.
		bound.clock.now = CLOCK + SPEC_TTL_MS;
		turnOf(bound.double, bound.clock.now, DEEPSEEK);
		await drain();
		expect(bound.sent).toEqual([
			{
				url: "https://host.example/user/balance",
				options: {
					method: "GET",
					headers: { authorization: "Bearer key-one" },
					timeoutMs: 5_000,
					proxy: false,
				},
			},
		]);
		expect(bound.runtime.presentation.balance()).toEqual({
			reading: { total: 110, currency: "CNY", obtainedAt: CLOCK + SPEC_TTL_MS },
		});
		expect(bound.notifications()).toBe(1);
		// The access was asked about the request's own provider and about no other.
		expect(bound.resolved).toEqual([DEEPSEEK]);
	});

	test("the TTL boundary is the success instant plus 30000ms: one millisecond inside it is not refreshed", async () => {
		const bound = await bindBalance();
		const successAt = CLOCK;
		expect(bound.runtime.presentation.balance().reading?.obtainedAt).toBe(successAt);

		// The reading is 29,999ms old: it is still within its success TTL, so the usage only checks.
		bound.clock.now = successAt + SPEC_TTL_MS - 1;
		turnOf(bound.double, bound.clock.now, DEEPSEEK);
		await drain();
		expect(bound.sent).toHaveLength(0);

		// At exactly 30,000ms old it has expired, and this usage is what refreshes it.
		bound.clock.now = successAt + SPEC_TTL_MS;
		turnOf(bound.double, bound.clock.now, DEEPSEEK);
		await drain();
		expect(bound.sent).toHaveLength(1);
		expect(bound.runtime.presentation.balance().reading?.obtainedAt).toBe(successAt + SPEC_TTL_MS);
	});

	test("a configured TTL replaces the default, and the TTL expiring on its own queries nothing", async () => {
		const bound = await bindBalance({ ttlMs: 1_000 });
		const successAt = CLOCK;

		// Time passes with no settled request at all — the TTL expiring is not a trigger, and there is
		// no timer behind it: the endpoint is never asked again by the mere passing of its budget.
		bound.clock.now = successAt + 10_000_000;
		await drain();
		expect(bound.sent).toHaveLength(0);

		// The configured 1000ms, not the default 30000ms, is what this reading's next usage compares to.
		turnOf(bound.double, bound.clock.now, DEEPSEEK);
		await drain();
		expect(bound.sent).toHaveLength(1);
	});

	test("only the request's own provider triggers the check; another provider's usage queries nothing", async () => {
		const bound = await bindBalance();

		// The reading stands well past its TTL: another provider's usage neither queries the balance nor
		// asks the host about the balance's provider.
		bound.clock.now += SPEC_TTL_MS;
		turnOf(bound.double, bound.clock.now, OTHER_PROVIDER);
		await drain();
		expect(bound.sent).toHaveLength(0);
		expect(bound.resolved).toEqual([]);
		expect(bound.runtime.presentation.balance().reading?.total).toBe(110);
	});

	test("a Round's edges and a session's own facts query nothing: no activity start, round end or switch is a trigger", async () => {
		const bound = await bindBalance();
		// The reading is long past its TTL, and a Round opens, a session's facts are re-reported and the
		// Round ends — none of which is a usage return.
		bound.clock.now += 10_000_000;
		bound.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: MAIN });
		bound.double.deliverSession(OWNER, { event: { kind: "session_facts" }, session: MAIN });
		bound.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: MAIN });
		await drain();
		expect(bound.sent).toHaveLength(0);
	});
});

describe("the host's current facts are what one query is built from (P29)", () => {
	test("a credential the host has replaced is what the next query sends, and the first answer is not cached", async () => {
		let credential = "key-one";
		const bound = await bindBalance({
			access: async () => ({ baseUrl: "https://host.example/v1", credential }),
		});
		// The CLI's own prefetch authenticated with the credential of its own moment.
		expect(bound.prefetched).toEqual([
			{
				url: "https://host.example/user/balance",
				options: {
					method: "GET",
					headers: { authorization: "Bearer key-one" },
					timeoutMs: 5_000,
					proxy: false,
				},
			},
		]);

		// The host replaces the credential — a login, a rotated key — and the query this settled request
		// begins past the reading's success TTL authenticates with the replaced one: the first answer was
		// not kept as the credential of later queries. The one operation asked the host exactly once, and
		// what it was answered is what that whole request was built from.
		credential = "key-two";
		bound.clock.now = CLOCK + SPEC_TTL_MS;
		turnOf(bound.double, bound.clock.now, DEEPSEEK);
		await drain();
		expect(bound.sent).toEqual([
			{
				url: "https://host.example/user/balance",
				options: {
					method: "GET",
					headers: { authorization: "Bearer key-two" },
					timeoutMs: 5_000,
					proxy: false,
				},
			},
		]);
		expect(bound.resolved).toEqual([DEEPSEEK]);
		expect(bound.runtime.presentation.balance()).toEqual({
			reading: { total: 110, currency: "CNY", obtainedAt: CLOCK + SPEC_TTL_MS },
		});
	});
});

describe("one in-flight query serves every trigger, and nothing is re-issued when it completes (P29)", () => {
	test("triggers arriving while the prefetch is out join it, and the completion re-issues nothing", async () => {
		const held = heldAnswer();
		const bound = await bindBalance({ respond: () => held.promise, initiate: false });
		const firstRequest = bound.double.initiateRun(OWNER);
		await until(() => bound.sent.length === 1, "the startup prefetch's query to be issued");

		// Three further usages, each far past where a 30000ms TTL would have expired, all arrive while the
		// one query is still out: they reuse it rather than issuing anything, and nothing is a reading yet.
		for (const at of [CLOCK + 60_000, CLOCK + 120_000, CLOCK + 180_000]) {
			bound.clock.now = at;
			turnOf(bound.double, at, DEEPSEEK);
			await drain();
		}
		expect(bound.sent).toHaveLength(1);
		expect(bound.runtime.presentation.balance()).toEqual({});

		// The query answers once, at the instant it really settled: one reading, and no compensating
		// request for the triggers that joined it.
		bound.clock.now = CLOCK + 200_000;
		held.answer(balanceAnswer("42.50"));
		await until(settled(firstRequest), "the initialization to settle");
		expect(bound.sent).toHaveLength(1);
		expect(bound.runtime.presentation.balance()).toEqual({
			reading: { total: 42.5, currency: "CNY", obtainedAt: CLOCK + 200_000 },
		});

		// The next usage inside the new reading's TTL checks and issues nothing either.
		turnOf(bound.double, CLOCK + 210_000, DEEPSEEK);
		await drain();
		expect(bound.sent).toHaveLength(1);
	});
});

describe("a failed query keeps the last reading and its instant, with no cooldown (P29)", () => {
	test("a rejected transport leaves the reading and its obtained instant untouched, and a later usage retries", async () => {
		let fail = false;
		const bound = await bindBalance({
			respond: () => {
				if (fail) throw new Error("the connection was refused");
				return balanceAnswer("110.00");
			},
		});
		const successAt = CLOCK;
		expect(bound.runtime.presentation.balance()).toEqual({
			reading: { total: 110, currency: "CNY", obtainedAt: successAt },
		});

		// The next usage is past the TTL and the query fails: the last reading keeps both its value and
		// its own instant, and the failure is stated beside it rather than as a zero.
		fail = true;
		bound.clock.now = successAt + SPEC_TTL_MS;
		turnOf(bound.double, bound.clock.now, DEEPSEEK);
		await drain();
		expect(bound.sent).toHaveLength(1);
		expect(bound.runtime.presentation.balance()).toEqual({
			reading: { total: 110, currency: "CNY", obtainedAt: successAt },
			failure: { at: successAt + SPEC_TTL_MS, detail: "unreachable" },
		});

		// There is no cooldown: the very next usage — still inside no cooling window of any kind —
		// tries again, and this time the provider answers.
		fail = false;
		bound.clock.now = successAt + SPEC_TTL_MS + 1;
		turnOf(bound.double, bound.clock.now, DEEPSEEK);
		await drain();
		expect(bound.sent).toHaveLength(2);
		expect(bound.runtime.presentation.balance()).toEqual({
			reading: { total: 110, currency: "CNY", obtainedAt: successAt + SPEC_TTL_MS + 1 },
		});
	});

	test("a non-2xx answer and a body with no CNY balance are failures, never a reading of zero", async () => {
		const bound = await bindBalance({
			respond: (_request, index) =>
				index === 0
					? new Response("busy", { status: 503 })
					: new Response(JSON.stringify({ is_available: false, balance_infos: [] }), { status: 200 }),
		});
		// The prefetch's own answer carried no reading, and the result says so rather than reporting zero.
		expect(bound.runtime.presentation.balance()).toEqual({
			failure: { at: CLOCK, detail: "unreadable" },
		});

		bound.clock.now = CLOCK + SPEC_TTL_MS;
		turnOf(bound.double, bound.clock.now, DEEPSEEK);
		await drain();
		// A document with no CNY entry is not a balance of nothing: there is still no reading at all.
		expect(bound.sent).toHaveLength(1);
		expect(bound.runtime.presentation.balance()).toEqual({
			failure: { at: CLOCK + SPEC_TTL_MS, detail: "unreadable" },
		});
	});

	test("a host with no access fails without a request, and no other provider's credential is borrowed", async () => {
		const bound = await bindBalance({
			access: async provider => (provider === DEEPSEEK ? undefined : { credential: "someone-elses-key" }),
		});
		// The prefetch found nothing to authenticate the balance's provider with, so it did not query and
		// stated nothing for it.
		expect(bound.prefetched).toEqual([]);
		expect(bound.runtime.presentation.balance()).toEqual({});

		// A settled request of that same provider is what asks, and it fails without a request rather than
		// borrowing the other provider's credential.
		turnOf(bound.double, bound.clock.now, DEEPSEEK);
		await drain();
		expect(bound.resolved).toEqual([DEEPSEEK]);
		expect(bound.sent).toHaveLength(0);
		expect(bound.runtime.presentation.balance()).toEqual({ failure: { at: CLOCK, detail: "no-access" } });
	});

	test("a host that resolved an address but no credential fails rather than sending the request unauthenticated", async () => {
		const bound = await bindBalance({ access: async () => ({ baseUrl: "https://host.example/v1" }) });
		turnOf(bound.double, bound.clock.now, DEEPSEEK);
		await drain();
		expect(bound.sent).toHaveLength(0);
		expect(bound.runtime.presentation.balance()).toEqual({ failure: { at: CLOCK, detail: "no-access" } });
	});
});

describe("the balance address follows the host and falls back to the provider's own default (P29)", () => {
	test("a host address without a trailing /v1 keeps its own path", async () => {
		const bound = await bindBalance({ access: async () => ({ baseUrl: "https://relay.example/api/", credential: "k" }) });
		bound.clock.now += SPEC_TTL_MS;
		turnOf(bound.double, bound.clock.now, DEEPSEEK);
		await drain();
		expect(bound.sent[0]?.url).toBe("https://relay.example/api/user/balance");
	});

	test("a host that resolved no address uses the documented DeepSeek default", async () => {
		const bound = await bindBalance({ access: async () => ({ credential: "k" }) });
		bound.clock.now += SPEC_TTL_MS;
		turnOf(bound.double, bound.clock.now, DEEPSEEK);
		await drain();
		expect(bound.sent[0]?.url).toBe("https://api.deepseek.com/user/balance");
	});
});
