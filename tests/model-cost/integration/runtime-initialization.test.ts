/**
 * The CLI's one startup prefetch, the runtime's query lifecycle and what a credential may reach
 * (P37, P40, P53; S2).
 *
 * The seam under test is the extension's own read-only result plus the one public binding that
 * drives it: the production definition is bound through the framework's public binding (the port
 * double, `tests/framework/support/harness-port-double.ts`), the runtime is the one
 * `createModelCostRuntime` builds, and the initialization is the one the framework runs at the
 * owner session node — the node the first model request waits on, which is why a run initiation is
 * this file's position for "before the first request".
 *
 * What these cases observe is production behavior and not a test-shaped re-run of it:
 *   - every outbound query, exactly as the extension built it (its address, its credential header,
 *     its business budget, its connection choice and the absence of a cancellation signal), through
 *     the one HTTP dependency the extension takes — the same single-request interface production
 *     runs on, substituted here so no permanent case reaches a provider;
 *   - the harness's own provider access, asked per operation, as a host answers it;
 *   - the read-only balance, allowance and presentation results a frontend reads;
 *   - the operator channel the framework publishes on (the port's diagnostics and the feedback a
 *     session delivery carries) and the files of this run's own isolated storage root.
 *
 * The expectations are the specification's own literals and this file's own arithmetic: the two
 * business budgets (5000ms for the balance, 10000ms for the account API), the success TTL of
 * 30000ms, the providers' own addresses and paths, the documented document shapes, and a clock the
 * case moves by assignment. Nothing here recomputes an expectation with the code under test, and
 * the synthetic sentinel below is this file's own literal — never a real credential.
 *
 * A query that never answers is a promise the case holds open, and progress is read by driving the
 * event loop's own turns: a case waits for the condition it is about (`until`) rather than for a
 * duration, so an assertion about a request that is *not* held by a hanging query is a fact about
 * ordering, and a slow machine costs turns rather than correctness.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { MODEL_COST } from "../../../extensions/model-cost/definition";
import type { ModelPricingData } from "../../../extensions/model-cost/shared-logic/business/pricing/model-data";
import {
	type ModelCostRuntime,
	createModelCostRuntime,
	modelCostImplementation,
} from "../../../extensions/model-cost/shared-logic/runtime";
import type { ProviderAccess, ProviderAccessFacts } from "../../../framework/interface/provider";
import type { SessionFacts, TurnOutcome, TurnUsage } from "../../../framework/interface/session";
import type { TurnSignal } from "../../../framework/runtime/port";
import type { HttpRequestOptions, HttpRequestResult } from "../../../framework/interface/general/http";
import { testSessionCapability } from "../support/session-capability";
import { type PortDouble, type SessionBoundary, portDouble } from "../../framework/support/harness-port-double";
import { type HeldAnswer, drain, heldAnswer, settled, until } from "../../support/pending-query";

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
const SUB: SessionFacts = { sessionId: "session-sub", kind: "sub", parentSessionId: MAIN.sessionId, unavailable: [] };
const OWNER = { kind: "owner", key: "main:prefetch" } as const;

/** The two provider sources this extension prefetches, as this extension's own data names them. */
const DEEPSEEK = "deepseek";
const CODEX = "openai-codex";

/** The clock every case starts at: the instants below are arithmetic on this literal. */
const CLOCK = 1_700_000_000_000;

/** The specification's own success TTL and its two business query budgets, in milliseconds. */
const SPEC_TTL_MS = 30_000;
const BALANCE_BUDGET_MS = 5_000;
const CODEX_BUDGET_MS = 10_000;

/** The host address and credentials the two providers' queries are answered with, as this file states them. */
const DEEPSEEK_BASE_URL = "https://host.example/v1";
const DEEPSEEK_CREDENTIAL = "balance-key";
const CODEX_CREDENTIAL = "codex-key";

/** The two addresses the extension's own queries go to: the host's address (`/v1` removed) and the account API. */
const BALANCE_URL = "https://host.example/user/balance";
const CODEX_URL = "https://chatgpt.com/backend-api/wham/usage";

/** The five-hour and weekly windows one account document reports, each reset stated in seconds. */
const DOCUMENT_WINDOWS = {
	primary: { usedPercent: 12.5, seconds: 18_000, resetAt: 1_700_003_600 },
	secondary: { usedPercent: 60, seconds: 604_800, resetAt: 1_700_086_400 },
};

/** A synthetic credential this file never lets out of the extension's own authenticated requests. */
const SENTINEL = "SYNTHETIC-SENTINEL-2f9c-DO-NOT-LEAK";

const USAGE: TurnUsage = { input: 1, cacheRead: 0, cacheWrite: 0, output: 1, totalTokens: 2 };

/** One request the extension made, as the substituted HTTP call recorded it. */
interface SentRequest {
	readonly url: string;
	readonly options: HttpRequestOptions | undefined;
}

/** The balance answer the provider returns, in its documented shape, as one JSON response. */
function balanceAnswer(total: string): HttpRequestResult {
	return ({ ok: true as const, response: new Response(JSON.stringify({
			is_available: true,
			balance_infos: [{ currency: "CNY", total_balance: total, granted_balance: "0.00", topped_up_balance: total }],
		}),
		{ status: 200, headers: { "content-type": "application/json" } },) });
}

/** One account API answer, in the provider's own document shape, as one JSON response. */
function usageAnswer(windows: {
	readonly primary?: { readonly usedPercent: number; readonly seconds: number; readonly resetAt: number };
	readonly secondary?: { readonly usedPercent: number; readonly seconds: number; readonly resetAt: number };
}): HttpRequestResult {
	const windowOf = (window: { usedPercent: number; seconds: number; resetAt: number }): Record<string, unknown> => ({
		used_percent: window.usedPercent,
		limit_window_seconds: window.seconds,
		reset_at: window.resetAt,
	});
	return ({ ok: true as const, response: new Response(JSON.stringify({
			plan_type: "pro",
			rate_limit: {
				...(windows.primary === undefined ? {} : { primary_window: windowOf(windows.primary) }),
				...(windows.secondary === undefined ? {} : { secondary_window: windowOf(windows.secondary) }),
			},
		}),
		{ status: 200, headers: { "content-type": "application/json" } },) });
}

/**
 * One query a case holds open is `heldAnswer`, and progress is driven by `turn`/`drain`/`until`:
 * see `tests/support/pending-query.ts` for why none of them reads a wall clock.
 */

/** One whole request in a session of its own: its Turn's start facts and its settled response. */
function turnOf(double: PortDouble, at: number, provider: string): void {
	const session: SessionFacts = { sessionId: `session-${provider}-${at}`, kind: "main", unavailable: [] };
	double.deliverTurn({ kind: "request_started", session, at, provider, model: "model-x" } as TurnSignal, {
		owner: OWNER,
	});
	double.deliverTurn(
		{
			kind: "response_settled",
			session,
			at: at + 60_000,
			outcome: "completed" as TurnOutcome,
			readings: [USAGE],
		},
		{ owner: OWNER },
	);
}

/** One bound instance, and what a case drives and observes it through. */
interface BoundRuntime {
	readonly runtime: ModelCostRuntime;
	readonly double: PortDouble;
	readonly root: string;
	/** Every request the extension sent, in call order. */
	readonly sent: SentRequest[];
	/** Every provider `ProviderAccess.resolve` was asked about, in call order. */
	readonly resolved: string[];
	/** The clock the runtime's own business reads; a case moves it by assignment. */
	readonly clock: { now: number };
	/** How many times the read-only result's change notification reached a subscriber. */
	notifications(): number;
	/** Every session boundary this double delivered, which is where the initialization's feedback lands. */
	readonly boundaries: SessionBoundary[];
	/** The credentials the host answers with, as a case replaces them: the next operation's own fact. */
	readonly host: { deepseekCredential: string; codexCredential: string };
}

/** Every root this file created, removed after each case. */
const roots: string[] = [];

/**
 * One bound instance over a fresh isolated root: the production runtime, bound through the
 * framework's own binding, with the harness's provider access and the HTTP call substituted.
 *
 * `initiate` (the default) also drives the owner session's start and the first run initiation, so
 * the case observes the initialization the way a session does: the queries the case sees are the
 * ones that prefetch started. `initiate: false` hands back the bound instance *before* that run
 * initiation, which is what a case driving the answers itself needs.
 */
async function bindRuntime(
	options: {
		readonly access?: (provider: string) => Promise<ProviderAccessFacts | undefined>;
		readonly respond?: (request: SentRequest, index: number) => HttpRequestResult | Promise<HttpRequestResult>;
		readonly initiate?: boolean;
	} = {},
): Promise<BoundRuntime> {
	const root = mkdtempSync(path.join(tmpdir(), "model-cost-prefetch-"));
	roots.push(root);
	const clock = { now: CLOCK };
	const sent: SentRequest[] = [];
	const resolved: string[] = [];
	const boundaries: SessionBoundary[] = [];
	const host = { deepseekCredential: DEEPSEEK_CREDENTIAL, codexCredential: CODEX_CREDENTIAL };
	let notifications = 0;
	// The host's own answers: one per provider, each stating the address and the credential that
	// operation authenticates with. A case answers `access` itself when it drives the gate.
	const access: ProviderAccess = {
		resolve: async provider => {
			resolved.push(provider);
			if (options.access !== undefined) return options.access(provider);
			if (provider === CODEX) return { credential: host.codexCredential };
			if (provider === DEEPSEEK) return { baseUrl: DEEPSEEK_BASE_URL, credential: host.deepseekCredential };
			return undefined;
		},
	};
	const runtime = createModelCostRuntime({
		config: { storageDir: root, balanceTtlMs: SPEC_TTL_MS },
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
			if (options.respond !== undefined) return options.respond(request, sent.length - 1);
			return url === CODEX_URL ? usageAnswer(DOCUMENT_WINDOWS) : balanceAnswer("110.00");
		},
	});
	const double = portDouble();
	double.bind(MODEL_COST, {
		factory: modelCostImplementation(() => runtime),
		config: { reader: () => `storageDir: ${root}\nbalanceTtlMs: ${SPEC_TTL_MS}\ncodexQuotaTtlMs: 15000\n` },
	});
	runtime.view.subscribe(() => {
		notifications += 1;
	});
	boundaries.push(double.deliverSession(OWNER, { session: MAIN }));
	const bound = { runtime, double, root, sent, resolved, clock, notifications: () => notifications, boundaries, host };
	if (options.initiate === false) return bound;
	await double.initiateRun(OWNER);
	return bound;
}

/** Every file of one storage root, as the text a case can search for a credential in. */
function storageFiles(root: string): string[] {
	const found: string[] = [];
	for (const entry of readdirSync(root, { withFileTypes: true, recursive: true })) {
		if (!entry.isFile()) continue;
		found.push(readFileSync(path.join(entry.parentPath, entry.name), "utf8"));
	}
	return found;
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("the CLI asks its two configured sources once, in parallel, before the first request (P37)", () => {
	test("both requests are out before either answers, each with its own address, credential and budget", async () => {
		const held: HeldAnswer[] = [];
		const bound = await bindRuntime({
			respond: () => {
				const pending = heldAnswer();
				held.push(pending);
				return pending.promise;
			},
			initiate: false,
		});

		// The owner session node is where the CLI initializes, and the run initiation is the position
		// the first model request waits on. Both prefetches have to be in flight while neither has been
		// answered: an initialization that awaited one source before starting the other would leave the
		// second request unissued here, which is what this wait separates.
		const firstRequest = bound.double.initiateRun(OWNER);
		const released = settled(firstRequest);
		await until(() => bound.sent.length === 2, "both prefetch requests to be issued");
		expect(bound.sent.map(request => request.url)).toEqual([BALANCE_URL, CODEX_URL]);
		expect(bound.sent[0]?.options).toEqual({
			method: "GET",
			headers: { authorization: `Bearer ${DEEPSEEK_CREDENTIAL}` },
			timeoutMs: BALANCE_BUDGET_MS,
			proxy: false,
		});
		expect(bound.sent[1]?.options).toEqual({
			method: "GET",
			headers: { authorization: `Bearer ${CODEX_CREDENTIAL}` },
			timeoutMs: CODEX_BUDGET_MS,
			proxy: "codex",
		});
		// Each query asked the host about its own provider and no other, in the order they were asked.
		expect(bound.resolved).toEqual([DEEPSEEK, CODEX]);
		// Neither has answered, so the first model request is still waiting for the initialization.
		await drain();
		expect(released()).toBe(false);

		// Both sources answer: the initialization settles and releases the first request, and the
		// read-only results carry what each answered.
		held[0]!.answer(balanceAnswer("110.00"));
		held[1]!.answer(usageAnswer(DOCUMENT_WINDOWS));
		await until(released, "the first request to be released");
		expect(bound.runtime.presentation.balance()).toEqual({
			reading: { total: 110, currency: "CNY", obtainedAt: CLOCK },
		});
		expect(bound.runtime.presentation.quota().fiveHour?.usedPercent).toBe(12.5);
		expect(bound.runtime.presentation.quota().weekly?.usedPercent).toBe(60);
	});

	test("a source the host cannot authenticate is not queried: no request, and no failure of its own", async () => {
		const bound = await bindRuntime({
			access: async provider => (provider === DEEPSEEK ? undefined : { credential: CODEX_CREDENTIAL }),
		});

		// The host is what says a source is configured — it is asked about both and answers for one —
		// but only the source it serves is asked over the network.
		expect(bound.resolved).toEqual([DEEPSEEK, CODEX]);
		expect(bound.sent.map(request => request.url)).toEqual([CODEX_URL]);
		// The balance states neither a reading nor a failure: nothing was queried for a provider this
		// process has not used. (The allowance result states its own missing access, which is the
		// account query's own contract and is covered by its own suite.)
		expect(bound.runtime.presentation.balance()).toEqual({});
	});

	test("an address without a credential is not a query either, and no other provider's credential is sent", async () => {
		const bound = await bindRuntime({
			access: async provider =>
				provider === DEEPSEEK ? { baseUrl: DEEPSEEK_BASE_URL } : { credential: CODEX_CREDENTIAL },
		});

		// Only the account API left the process, under its own credential; the balance query resolved an
		// address but nothing to authenticate with, so it was not sent at all.
		expect(bound.sent.map(request => request.url)).toEqual([CODEX_URL]);
		expect(bound.sent[0]?.options?.headers).toEqual({ authorization: `Bearer ${CODEX_CREDENTIAL}` });
		expect(bound.runtime.presentation.balance()).toEqual({});
	});

	test("the prefetch does not depend on the session's model: both sources are asked before any Turn fact", async () => {
		const bound = await bindRuntime();

		// The whole initialization is the two requests above, taken at the owner session's start: no
		// Turn, Round or viewed-model fact had been delivered when they were built, and the address each
		// one used is its provider's own rather than any model's.
		expect(bound.sent).toHaveLength(2);
		expect(bound.runtime.presentation.balance().reading?.total).toBe(110);
		expect(bound.runtime.presentation.quota().weekly?.usedPercent).toBe(60);
	});
});

describe("the first request waits for the prefetches to settle, and a failure is not one (P37)", () => {
	test("a refused balance and a refused account query settle the initialization without failing the request", async () => {
		const bound = await bindRuntime({
			respond: request =>
				request.url === BALANCE_URL ? ({ ok: true as const, response: new Response("busy", { status: 503 }) }) : Promise.resolve({ ok: false as const, failure: { kind: "transport" as const, error: new Error("the wait ran out") } }),
		});

		// The run initiation the helper awaited settled although both sources failed, and each result
		// states its own failure as the fact it is rather than as a reading or a window of zero.
		expect(bound.runtime.presentation.balance()).toEqual({ failure: { at: CLOCK, detail: "unreadable" } });
		expect(bound.runtime.presentation.quota()).toEqual({ failure: { at: CLOCK, detail: "unreachable" } });
		// A failed prefetch left nothing on the operator channel: it is reported on the extension's own
		// read-only result, not as feedback for the session.
		expect(bound.boundaries.flatMap(boundary => boundary.feedback)).toEqual([]);
	});

	test("one source answering is enough for the first request, and the other's failure stays its own", async () => {
		const bound = await bindRuntime({
			respond: request =>
				request.url === BALANCE_URL
					? Promise.resolve({ ok: false as const, failure: { kind: "transport" as const, error: new Error("the connection was refused") } })
					: usageAnswer(DOCUMENT_WINDOWS),
		});

		expect(bound.runtime.presentation.balance()).toEqual({ failure: { at: CLOCK, detail: "unreachable" } });
		expect(bound.runtime.presentation.quota().fiveHour?.usedPercent).toBe(12.5);
	});
});

describe("one CLI shares its one initialization; two CLIs each ask their own (P37)", () => {
	test("a subagent's session and its run initiation ask nothing again", async () => {
		const bound = await bindRuntime();
		const before = bound.sent.map(request => request.url);
		expect(before).toEqual([BALANCE_URL, CODEX_URL]);

		// The same process's subagent: the instance serves it too, so neither its binding nor the run
		// initiation of its own session runs the initialization a second time.
		bound.double.deliverSession(OWNER, { session: SUB });
		await bound.double.initiateRun(OWNER);
		await drain();
		expect(bound.sent.map(request => request.url)).toEqual(before);
	});

	test("an ordinary session switch asks nothing again: the instance and its caches survive it", async () => {
		const bound = await bindRuntime();
		const before = bound.sent.map(request => request.url);

		// An ordinary switch is one session_end(transferred) and the next session's own start, and a view
		// that reports the same target's facts again: none of them is a boundary of the instance, so
		// nothing is prefetched a second time and the reading the first prefetch obtained still stands.
		bound.double.deliverSession(OWNER, { event: { kind: "session_end", reason: "transferred" } });
		bound.double.deliverSession(OWNER, { event: { kind: "session_start", reason: "resume" }, session: SUB });
		bound.double.deliverSession(OWNER, { event: { kind: "session_facts" }, session: SUB });
		await bound.double.initiateRun(OWNER);
		await drain();
		expect(bound.sent.map(request => request.url)).toEqual(before);
		expect(bound.runtime.presentation.balance().reading?.total).toBe(110);
		expect(bound.runtime.presentation.quota().fiveHour?.usedPercent).toBe(12.5);
	});

	test("a second runtime is a second CLI: its own queries, its own credential, nothing shared", async () => {
		const one = await bindRuntime({ access: async () => ({ baseUrl: DEEPSEEK_BASE_URL, credential: "cli-one" }) });
		const two = await bindRuntime({ access: async () => ({ baseUrl: DEEPSEEK_BASE_URL, credential: "cli-two" }) });

		// Two instances, two requests each, and each one's requests carry its own host's credential: no
		// query is merged across instances and no reading is shared between them.
		expect(one.sent).toHaveLength(2);
		expect(two.sent).toHaveLength(2);
		expect(one.sent[0]?.options?.headers).toEqual({ authorization: "Bearer cli-one" });
		expect(two.sent[0]?.options?.headers).toEqual({ authorization: "Bearer cli-two" });
	});
});

describe("a runtime query never holds the next request, and a disposed instance takes nothing (P40)", () => {
	test("a hanging refresh does not hold the next run initiation, and the next usage joins it", async () => {
		let balanceCalls = 0;
		const bound = await bindRuntime({
			respond: request => {
				if (request.url !== BALANCE_URL) return usageAnswer(DOCUMENT_WINDOWS);
				balanceCalls += 1;
				// The first query — the prefetch — answers; every later one hangs where a network that never
				// answers would leave it.
				return balanceCalls === 1 ? balanceAnswer("110.00") : heldAnswer().promise;
			},
		});

		// The reading is past its success TTL, so this settled request begins a refresh that never answers.
		bound.clock.now += SPEC_TTL_MS;
		turnOf(bound.double, bound.clock.now, DEEPSEEK);
		await until(() => balanceCalls === 2, "the hanging refresh to be issued");

		// The next model request is not held by it: the run initiation settles while that query is still
		// out, and the reading the display reads is the one that answer produced.
		await until(settled(bound.double.initiateRun(OWNER)), "the next run initiation to settle");
		// A further settled request joins the query already out rather than duplicating it.
		turnOf(bound.double, bound.clock.now, DEEPSEEK);
		await drain();
		expect(balanceCalls).toBe(2);
		expect(bound.runtime.presentation.balance().reading?.total).toBe(110);
		// Nothing this extension sends carries a cancellation signal: the HTTP module's own budget is the
		// only bound on a query, and a hanging one is left to it.
		expect(bound.sent.every(request => request.options !== undefined && !("signal" in request.options))).toBe(true);
	});

	test("an answer arriving after the instance's disposal is not a reading, and redraws nothing", async () => {
		const held: HeldAnswer[] = [];
		const bound = await bindRuntime({
			respond: () => {
				const pending = heldAnswer();
				held.push(pending);
				return pending.promise;
			},
			initiate: false,
		});
		const firstRequest = bound.double.initiateRun(OWNER);
		const released = settled(firstRequest);
		await until(() => bound.sent.length === 2, "both prefetch requests to be issued");
		expect(bound.notifications()).toBe(0);

		// The session this instance serves ends: the framework disposes the implementation while both
		// queries are still out.
		bound.double.deliverSession(OWNER, { event: { kind: "session_end", reason: "disposed" } });

		// Both answers land after that: neither is accepted, so neither becomes a reading or a window, and
		// the change notification a frontend redraws on is not published.
		held[0]!.answer(balanceAnswer("999.00"));
		held[1]!.answer(usageAnswer(DOCUMENT_WINDOWS));
		await until(released, "the disposed instance's queries to settle");
		await drain();
		expect(bound.runtime.presentation.balance()).toEqual({});
		expect(bound.runtime.presentation.quota()).toEqual({});
		expect(bound.notifications()).toBe(0);

		// And a later instance is its own: what the spent one dropped never reaches it.
		const next = await bindRuntime();
		expect(next.runtime.presentation.balance().reading?.total).toBe(110);
		expect(next.runtime.presentation.quota().weekly?.usedPercent).toBe(60);
	});
});

describe("each operation fixes its own credential, and one provider's failure stays its own (P53)", () => {
	test("a credential replaced while a query is out reaches the next operation, not the one in flight", async () => {
		const held: HeldAnswer[] = [];
		const bound = await bindRuntime({
			respond: request => {
				if (request.url === CODEX_URL) return usageAnswer(DOCUMENT_WINDOWS);
				const pending = heldAnswer();
				held.push(pending);
				return pending.promise;
			},
			initiate: false,
		});
		const firstRequest = bound.double.initiateRun(OWNER);
		const released = settled(firstRequest);
		await until(() => bound.sent.length === 2, "both prefetch requests to be issued");
		// The operation in flight fixed the host's credential of that moment, which is what its request
		// carries; this case is holding that query open.
		expect(bound.sent[0]?.options?.headers).toEqual({ authorization: `Bearer ${DEEPSEEK_CREDENTIAL}` });

		// The host replaces the credential while that query is out. A replacement cannot rewrite a request
		// already sent, so the query in flight keeps what it fixed, and what it answers is accepted.
		bound.host.deepseekCredential = "key-two";
		held[0]!.answer(balanceAnswer("10.00"));
		await until(released, "the first request to be released");
		expect(bound.runtime.presentation.balance().reading?.total).toBe(10);

		// The next operation reads the host's answer of its own moment instead.
		bound.clock.now += SPEC_TTL_MS;
		turnOf(bound.double, bound.clock.now, DEEPSEEK);
		await until(() => bound.sent.length === 3, "the next balance query to be issued");
		expect(bound.sent[2]?.options?.headers).toEqual({ authorization: "Bearer key-two" });
	});
});

describe("a credential reaches its own provider's request and nothing else observable (P53)", () => {
	test("the synthetic sentinel authenticates its own query and appears on no other surface", async () => {
		const bound = await bindRuntime({
			access: async provider =>
				provider === DEEPSEEK ? { baseUrl: DEEPSEEK_BASE_URL, credential: SENTINEL } : { credential: CODEX_CREDENTIAL },
			// Both queries are refused, which is where a credential would travel if the extension carried
			// one through an error: the balance endpoint answers a status, and the account query's transport
			// rejects with the sentinel in its own message. Neither failure may state it, and both failures
			// must still be the visible, sanitized facts they are.
			respond: request =>
				request.url === BALANCE_URL ? ({ ok: true as const, response: new Response("busy", { status: 503 }) }) : Promise.resolve({ ok: false as const, failure: { kind: "transport" as const, error: new Error(SENTINEL) } }),
		});

		// The credential is used where it belongs: formatted into the balance query's own header, on the
		// address that query resolved. The other provider's query carries its own credential.
		expect(bound.sent[0]?.options?.headers).toEqual({ authorization: `Bearer ${SENTINEL}` });
		expect(bound.sent[1]?.options?.headers).toEqual({ authorization: `Bearer ${CODEX_CREDENTIAL}` });
		// The failures are stated, and they say nothing about what authenticated the attempts.
		expect(bound.runtime.presentation.balance()).toEqual({ failure: { at: CLOCK, detail: "unreadable" } });
		expect(bound.runtime.presentation.quota()).toEqual({ failure: { at: CLOCK, detail: "unreachable" } });

		// Every surface a case can read, searched for it: the results and their failure details, the
		// operator channel the framework publishes on, and this run's own files.
		const surfaces: Record<string, string> = {
			balance: JSON.stringify(bound.runtime.presentation.balance()),
			quota: JSON.stringify(bound.runtime.presentation.quota()),
			feedback: JSON.stringify(bound.boundaries.flatMap(boundary => boundary.feedback)),
			notices: JSON.stringify(bound.boundaries.flatMap(boundary => boundary.notices)),
			diagnostics: bound.double.diagnostics.join("\n"),
			files: storageFiles(bound.root).join("\n"),
		};
		for (const [surface, text] of Object.entries(surfaces)) {
			expect(`${surface}: ${text}`).not.toContain(SENTINEL);
		}
	});
});
