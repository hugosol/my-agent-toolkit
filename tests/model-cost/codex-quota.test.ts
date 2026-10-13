/**
 * The Codex allowance windows at the extension's display seam (P39, P65; S2).
 *
 * The seam under test is production throughout: the extension's real definition is bound through the
 * framework's public binding (the port double, `tests/framework/support/harness-port-double.ts`), the
 * runtime is the one `createModelCostRuntime` builds, and every Turn delivery below is fed exactly as
 * a harness adapter would feed it. What the cases read is what a frontend reads —
 * `runtime.presentation.quota()`, the process-level read-only result — and what they count is what the
 * two sources really did, through the two public dependencies this extension's own business takes:
 * the harness's provider access (`ProviderAccess`) and the framework's HTTP call.
 *
 * The HTTP call is the same single-request interface production runs on
 * (`framework/modules/http.ts`), substituted here so no permanent case reaches a provider; the mock
 * records every call with the exact URL and options the query built, which is what makes the account
 * address, the authentication headers, the named proxy selection and the 10000ms business budget
 * observable rather than asserted about — and what proves that the runtime makes no second API call
 * however many Turns pass. The clock is a controlled input, so every reset state below is placed
 * exactly.
 *
 * Nothing here recomputes an expectation with the code under test: the header names and the document's
 * field names are the Codex protocol's own, written out by hand; the window lengths (5 hours, 7 days)
 * and the ±5% band are the specification's own rule, arithmetic on this file's literals; the reset
 * instants are hand-computed from this file's clock; and the token's account id is a literal this file
 * built into the credential rather than a value read back from the implementation.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { MODEL_COST } from "../../extensions/model-cost/definition";
import type { ModelPricingData } from "../../extensions/model-cost/shared-logic/model-data";
import { type ModelCostRuntime, createModelCostRuntime } from "../../extensions/model-cost/shared-logic/runtime";
import type { ProviderAccess, ProviderAccessFacts, SessionFacts, TurnOutcome, TurnSignal } from "../../framework/core/protocol";
import { HttpConfigurationError, type HttpRequestOptions } from "../../framework/modules/http";
import { type PortDouble, portDouble } from "../framework/support/harness-port-double";

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
const OWNER = { kind: "owner", key: "main:codex" } as const;

/** The clock every case starts at; the reset instants below are arithmetic on this literal. */
const CLOCK = 1_700_000_000_000;

/** The provider whose allowance this extension reads, and one whose responses it never reads. */
const CODEX = "openai-codex";
const OTHER_PROVIDER = "deepseek";

/** The account id this file wrote into the credential, and the credential itself. */
const ACCOUNT_ID = "acct-13";

/** Five hours, seven days and one day, in milliseconds: the specification's own window lengths. */
const FIVE_HOUR_MS = 5 * 60 * 60 * 1000;
const WEEKLY_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A JWT-shaped credential whose claim names a ChatGPT account, written here rather than derived from
 * anything under test: the account id the request authenticates as is this file's own literal.
 */
function codexToken(accountId: string): string {
	const claims = Buffer.from(
		JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: accountId } }),
		"utf8",
	).toBase64();
	return `header.${claims}.signature`;
}

const TOKEN = codexToken(ACCOUNT_ID);

/** One request the query made, as the substituted HTTP call recorded it. */
interface SentRequest {
	readonly url: string;
	readonly options: HttpRequestOptions | undefined;
}

/**
 * One account API answer, in the provider's own document shape, as one JSON response.
 *
 * The windows are stated in seconds, which is the unit the backend reports them in, so each case's
 * expectation is a hand-computed epoch-millisecond instant.
 */
function usageAnswer(windows: {
	readonly primary?: { readonly usedPercent: number; readonly seconds: number; readonly resetAt: number };
	readonly secondary?: { readonly usedPercent: number; readonly seconds: number; readonly resetAt: number };
}): Response {
	const windowOf = (window: { usedPercent: number; seconds: number; resetAt: number }): Record<string, unknown> => ({
		used_percent: window.usedPercent,
		limit_window_seconds: window.seconds,
		reset_at: window.resetAt,
	});
	return new Response(
		JSON.stringify({
			plan_type: "pro",
			rate_limit: {
				...(windows.primary === undefined ? {} : { primary_window: windowOf(windows.primary) }),
				...(windows.secondary === undefined ? {} : { secondary_window: windowOf(windows.secondary) }),
			},
		}),
		{ status: 200, headers: { "content-type": "application/json" } },
	);
}

/** The five-hour and weekly windows one document reports, with each reset stated in seconds. */
const DOCUMENT_WINDOWS = {
	primary: { usedPercent: 12.5, seconds: 18_000, resetAt: 1_700_003_600 },
	secondary: { usedPercent: 60, seconds: 604_800, resetAt: 1_700_086_400 },
};

/**
 * One whole Codex request in a session of its own: its Turn's start facts, its response's headers and
 * the settled response — the deliveries a real Codex exchange produces.
 */
function codexTurn(double: PortDouble, headers: Readonly<Record<string, string>>, at: number, provider = CODEX): void {
	const session: SessionFacts = { sessionId: `session-${provider}-${at}`, kind: "main", unavailable: [] };
	double.deliverTurn(
		{ kind: "request_started", session, at, provider, model: "gpt-6-luna" } as TurnSignal,
		{ owner: OWNER },
	);
	double.deliverTurn(
		{ kind: "response_received", session, http: { status: 200, headers } } as TurnSignal,
		{ owner: OWNER },
	);
	double.deliverTurn(
		{
			kind: "response_settled",
			session,
			at: at + 1_000,
			outcome: "completed" as TurnOutcome,
			readings: [],
		} as TurnSignal,
		{ owner: OWNER },
	);
}

/** The five-hour window's three headers, as one response would carry them. */
function fiveHourHeaders(usedPercent: string, resetAtSeconds?: number): Record<string, string> {
	return {
		"x-codex-primary-used-percent": usedPercent,
		"x-codex-primary-window-minutes": "300",
		...(resetAtSeconds === undefined ? {} : { "x-codex-primary-reset-at": String(resetAtSeconds) }),
	};
}

/** The weekly window's three headers, as one response would carry them. */
function weeklyHeaders(usedPercent: string, resetAtSeconds?: number): Record<string, string> {
	return {
		"x-codex-secondary-used-percent": usedPercent,
		"x-codex-secondary-window-minutes": "10080",
		...(resetAtSeconds === undefined ? {} : { "x-codex-secondary-reset-at": String(resetAtSeconds) }),
	};
}

/** One bound instance, and what a case drives and observes it through. */
interface BoundQuota {
	readonly runtime: ModelCostRuntime;
	readonly double: PortDouble;
	readonly sent: SentRequest[];
	/** Every provider `ProviderAccess.resolve` was asked about, in call order. */
	readonly resolved: string[];
	/** The clock the runtime's own business reads; a case moves it by assignment. */
	readonly clock: { now: number };
	/** How many times the read-only result's change notification reached a subscriber. */
	notifications(): number;
}

/** Every root this file created, removed after each case. */
const roots: string[] = [];

/**
 * One quota instance over a fresh isolated root: the production runtime, bound through the framework's
 * own binding, with the harness's provider access and the HTTP call substituted.
 */
async function bindQuota(options: {
	readonly access?: (provider: string) => Promise<ProviderAccessFacts | undefined>;
	readonly respond?: (request: SentRequest, index: number) => Response | Promise<Response>;
} = {}): Promise<BoundQuota> {
	const root = mkdtempSync(path.join(tmpdir(), "model-cost-codex-"));
	roots.push(root);
	const clock = { now: CLOCK };
	const sent: SentRequest[] = [];
	const resolved: string[] = [];
	let notifications = 0;
	const access: ProviderAccess = {
		resolve: async provider => {
			resolved.push(provider);
			// This file's subject is the allowance. The extension's other provider query — the DeepSeek
			// balance prefetch the initialization makes beside this one — asks about its own provider and
			// finds nothing here, so it sends no request and states no failure; this host resolves access
			// for the account API's provider alone.
			if (provider !== CODEX) return undefined;
			return options.access === undefined
				? { baseUrl: "https://host.example/codex", credential: TOKEN }
				: options.access(provider);
		},
	};
	const runtime = createModelCostRuntime({
		config: { storageDir: root, balanceTtlMs: 30_000 },
		configDirectory: root,
		userHomeDirectory: root,
		harness: HARNESS,
		data: DATA,
		providerAccess: access,
		now: () => clock.now,
		httpRequest: async (url, httpOptions) => {
			const request = { url, options: httpOptions };
			sent.push(request);
			return options.respond === undefined ? usageAnswer(DOCUMENT_WINDOWS) : options.respond(request, sent.length - 1);
		},
	});
	const double = portDouble();
	double.bind(MODEL_COST, {
		factory: () => runtime.implementation,
		config: { reader: () => `storageDir: ${root}\nbalanceTtlMs: 30000\n` },
	});
	double.deliverSession(OWNER, { session: MAIN });
	// The run-initiation hook is where the framework waits for the one-time initialization, so this is
	// also the point at which the account API query has been awaited.
	await double.initiateRun(OWNER);
	runtime.view.subscribe(() => {
		notifications += 1;
	});
	return { runtime, double, sent, resolved, clock, notifications: () => notifications };
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("the account API is asked once, at initialization, and the headers carry the runtime (P39)", () => {
	test("the startup query uses the business address, the credential's own headers and the named codex proxy", async () => {
		const bound = await bindQuota();

		expect(bound.sent).toEqual([
			{
				url: "https://chatgpt.com/backend-api/wham/usage",
				options: {
					method: "GET",
					headers: { authorization: `Bearer ${TOKEN}`, "chatgpt-account-id": ACCOUNT_ID },
					timeoutMs: 10_000,
					proxy: "codex",
				},
			},
		]);
		// The credential resolved is the Codex provider's, and the harness's own inference base URL
		// played no part in the address above. The host was asked about both providers the CLI
		// prefetches — the balance's own prefetch asks about its provider and is answered nothing — and
		// this file's query is the one that asked for the account API's credential.
		expect(bound.resolved).toEqual([OTHER_PROVIDER, CODEX]);
		// Both windows were seeded from the answer, each identified by the length it reported and each
		// carrying the reset instant the document stated in seconds as an epoch-millisecond instant.
		expect(bound.runtime.presentation.quota()).toEqual({
			fiveHour: {
				usedPercent: 12.5,
				resetsAt: 1_700_003_600_000,
				resetState: "valid",
				obtainedAt: CLOCK,
			},
			weekly: {
				usedPercent: 60,
				resetsAt: 1_700_086_400_000,
				resetState: "valid",
				obtainedAt: CLOCK,
			},
		});
	});

	test("the window is decided by the length it reports, not by which position carried it", async () => {
		const bound = await bindQuota({
			// The backend swapped the two positions: the long window arrived first and the short one
			// second, which must not relabel the meters.
			respond: () =>
				usageAnswer({
					primary: { usedPercent: 60, seconds: 604_800, resetAt: 1_700_086_400 },
					secondary: { usedPercent: 12.5, seconds: 18_000, resetAt: 1_700_003_600 },
				}),
		});

		const quota = bound.runtime.presentation.quota();
		expect(quota.fiveHour?.usedPercent).toBe(12.5);
		expect(quota.weekly?.usedPercent).toBe(60);
	});

	test("header lengths outside the ±5% band are not these windows, and no window is a zero", async () => {
		const bound = await bindQuota({ respond: () => usageAnswer({}) });

		// A document that reports neither window leaves both unavailable; nothing is answered as zero.
		expect(bound.runtime.presentation.quota()).toEqual({});

		// 18,900s and 17,100s are exactly ±5% of five hours, and 302 minutes (18,120s) sits inside the
		// band without being the nominal length: an identified window's reported length need not be the
		// round number this extension's nominal length is.
		codexTurn(
			bound.double,
			{ "x-codex-primary-used-percent": "77", "x-codex-primary-window-minutes": "302" },
			CLOCK,
		);
		expect(bound.runtime.presentation.quota().fiveHour?.usedPercent).toBe(77);

		// 18,901s is outside the band, so that reading is not one of this extension's windows.
		codexTurn(
			bound.double,
			{
				"x-codex-primary-used-percent": "88",
				"x-codex-primary-window-minutes": "315.0166666667",
			},
			bound.clock.now,
		);
		// The window that carried no identified length left the reading where it was rather than
		// reporting 88 against a meter this extension does not track.
		expect(bound.runtime.presentation.quota().fiveHour?.usedPercent).toBe(77);
	});

	test("the runtime makes no second API call, whatever the Turns, the Rounds or the view do", async () => {
		const bound = await bindQuota();
		expect(bound.sent).toHaveLength(1);

		// Several Turns carrying headers, and the whole span of session, round and Turn deliveries a
		// session produces: none of them reaches the account API.
		codexTurn(bound.double, { ...fiveHourHeaders("20", 1_700_003_600), ...weeklyHeaders("61", 1_700_086_400) }, CLOCK);
		bound.clock.now = CLOCK + 10 * DAY_MS;
		codexTurn(bound.double, { ...fiveHourHeaders("21", 1_700_003_600), ...weeklyHeaders("62", 1_700_086_400) }, bound.clock.now);
		bound.double.deliverRound(OWNER, { event: { kind: "round_start" } });
		bound.double.deliverRound(OWNER, { event: { kind: "round_end" } });
		bound.double.deliverSession(OWNER, { session: MAIN });

		expect(bound.sent).toHaveLength(1);
		// Ten days later the 5h window's reported instant is long past, and the elapsed time alone
		// still asked nothing.
		expect(bound.runtime.presentation.quota().fiveHour?.resetState).toBe("expired");
		expect(bound.sent).toHaveLength(1);
	});

	test("the account id comes from the credential; a credential that states none sends no such header", async () => {
		const plain = await bindQuota({
			// Only the account API's provider answers here, so the credential this case is about is the one
			// the account query carries.
			access: async provider =>
				provider === CODEX ? { baseUrl: "https://host.example/codex", credential: "plain-key" } : undefined,
		});
		expect(plain.sent[0]?.options?.headers).toEqual({ authorization: "Bearer plain-key" });
	});

	test("a missing credential fails as having no access and sends nothing", async () => {
		const bound = await bindQuota({ access: async () => undefined });

		expect(bound.sent).toEqual([]);
		expect(bound.runtime.presentation.quota()).toEqual({ failure: { at: CLOCK, detail: "no-access" } });
	});

	test("a refused proxy selection fails as a configuration failure, without a direct request", async () => {
		const bound = await bindQuota({
			respond: () => {
				throw new HttpConfigurationError(
					'the request selects the proxy "codex", but the shared configuration file "absent.yaml" does not exist',
				);
			},
		});

		expect(bound.runtime.presentation.quota()).toEqual({ failure: { at: CLOCK, detail: "misconfigured" } });
		// The attempt was one, and asking again is not a retry this extension makes.
		expect(bound.sent).toHaveLength(1);
		await bound.runtime.initialize({ feedback: { notify: () => {} } } as never);
		expect(bound.sent).toHaveLength(1);
	});

	test("a non-2xx answer and a refused transport are failures, and neither is a window", async () => {
		const refused = await bindQuota({ respond: () => new Response("{}", { status: 403 }) });
		expect(refused.runtime.presentation.quota()).toEqual({ failure: { at: CLOCK, detail: "unreadable" } });

		const transport = await bindQuota({
			respond: () => {
				throw new Error("connect ECONNREFUSED 127.0.0.1:1");
			},
		});
		expect(transport.runtime.presentation.quota()).toEqual({ failure: { at: CLOCK, detail: "unreachable" } });
	});
});

describe("response headers update each window on its own (P39, P65)", () => {
	test("a response's headers update the window they identify, in the order they were received", async () => {
		const bound = await bindQuota({ respond: () => usageAnswer({}) });

		codexTurn(bound.double, { ...fiveHourHeaders("20", 1_700_003_600), ...weeklyHeaders("61", 1_700_086_400) }, CLOCK);
		expect(bound.runtime.presentation.quota().fiveHour?.usedPercent).toBe(20);
		expect(bound.runtime.presentation.quota().weekly?.usedPercent).toBe(61);

		// The positions swapped: the weekly meter arrives as `primary` and the 5h one as `secondary`.
		bound.clock.now = CLOCK + 60_000;
		codexTurn(
			bound.double,
			{
				"x-codex-primary-used-percent": "62",
				"x-codex-primary-window-minutes": "10080",
				"x-codex-secondary-used-percent": "21",
				"x-codex-secondary-window-minutes": "300",
			},
			bound.clock.now,
		);
		const swapped = bound.runtime.presentation.quota();
		expect(swapped.fiveHour?.usedPercent).toBe(21);
		expect(swapped.weekly?.usedPercent).toBe(62);
		expect(swapped.fiveHour?.obtainedAt).toBe(CLOCK + 60_000);
		expect(swapped.weekly?.obtainedAt).toBe(CLOCK + 60_000);
	});

	test("a batch that carries one window updates that one and leaves the other's value and instant alone", async () => {
		const bound = await bindQuota();
		const seeded = bound.runtime.presentation.quota();
		expect(seeded.weekly).toEqual({
			usedPercent: 60,
			resetsAt: 1_700_086_400_000,
			resetState: "valid",
			obtainedAt: CLOCK,
		});

		bound.clock.now = CLOCK + 30 * 60_000;
		codexTurn(bound.double, fiveHourHeaders("31", 1_700_003_600), bound.clock.now);

		const after = bound.runtime.presentation.quota();
		expect(after.fiveHour).toEqual({
			usedPercent: 31,
			resetsAt: 1_700_003_600_000,
			resetState: "valid",
			obtainedAt: CLOCK + 30 * 60_000,
		});
		// The window this response did not carry keeps its reading *and* the instant it was accepted at.
		expect(after.weekly).toEqual(seeded.weekly);
		expect(bound.notifications()).toBe(1);
	});

	test("a batch that identifies no window changes nothing and notifies no one", async () => {
		const bound = await bindQuota();
		const seeded = bound.runtime.presentation.quota();
		const before = bound.notifications();

		// A response whose headers carry no rate-limit facts at all, and one whose stated length is not
		// this extension's window, are both nothing to update.
		codexTurn(bound.double, { "x-request-id": "capture-1", "content-type": "text/event-stream" }, CLOCK);
		codexTurn(
			bound.double,
			{ "x-codex-primary-used-percent": "99", "x-codex-primary-window-minutes": "1" },
			CLOCK + 1_000,
		);

		expect(bound.runtime.presentation.quota()).toEqual(seeded);
		expect(bound.notifications()).toBe(before);
	});

	test("two candidates of one kind in one batch: the closest length wins, and an exact tie keeps the first received", async () => {
		const bound = await bindQuota({ respond: () => usageAnswer({}) });

		// 315 and 285 minutes are both exactly ±5% of five hours, so the two are equally close and the
		// one the response carried first is the reading; the second record states them the other way.
		codexTurn(
			bound.double,
			{
				"x-codex-secondary-used-percent": "77",
				"x-codex-secondary-window-minutes": "285",
				"x-codex-primary-used-percent": "11",
				"x-codex-primary-window-minutes": "315",
			},
			CLOCK,
		);
		expect(bound.runtime.presentation.quota().fiveHour?.usedPercent).toBe(77);

		codexTurn(
			bound.double,
			{
				"x-codex-primary-used-percent": "12",
				"x-codex-primary-window-minutes": "315",
				"x-codex-secondary-used-percent": "78",
				"x-codex-secondary-window-minutes": "285",
			},
			CLOCK + 1_000,
		);
		expect(bound.runtime.presentation.quota().fiveHour?.usedPercent).toBe(12);
	});

	test("a Turn of another provider updates nothing, even when its headers look like Codex's", async () => {
		const bound = await bindQuota({ respond: () => usageAnswer({}) });

		codexTurn(bound.double, fiveHourHeaders("50", 1_700_003_600), CLOCK, OTHER_PROVIDER);

		expect(bound.runtime.presentation.quota()).toEqual({});
	});
});

describe("a window's reset instant is read as the state it has now (P65)", () => {
	test("unknown, expired and invalid are told apart, and the reported instant is never rewritten", async () => {
		const bound = await bindQuota({ respond: () => usageAnswer({}) });

		// No reset was stated at all: unknown, and no instant is invented for it.
		codexTurn(bound.double, fiveHourHeaders("10"), CLOCK);
		expect(bound.runtime.presentation.quota().fiveHour).toEqual({
			usedPercent: 10,
			resetState: "unknown",
			obtainedAt: CLOCK,
		});

		// A reset one minute behind the clock is expired, and the instant it reported is still there.
		codexTurn(bound.double, fiveHourHeaders("11", (CLOCK - 60_000) / 1000), CLOCK);
		expect(bound.runtime.presentation.quota().fiveHour).toEqual({
			usedPercent: 11,
			resetsAt: CLOCK - 60_000,
			resetState: "expired",
			obtainedAt: CLOCK,
		});

		// A reset further away than the window itself lasts is invalid, with six hours against a
		// five-hour window.
		codexTurn(bound.double, fiveHourHeaders("12", (CLOCK + 6 * 60 * 60 * 1000) / 1000), CLOCK);
		expect(bound.runtime.presentation.quota().fiveHour).toEqual({
			usedPercent: 12,
			resetsAt: CLOCK + 6 * 60 * 60 * 1000,
			resetState: "invalid",
			obtainedAt: CLOCK,
		});

		// The weekly window reads its own length: seven days away is invalid there, six hours is not.
		codexTurn(bound.double, weeklyHeaders("60", (CLOCK + 8 * DAY_MS) / 1000), CLOCK);
		expect(bound.runtime.presentation.quota().weekly?.resetState).toBe("invalid");
		codexTurn(bound.double, weeklyHeaders("61", (CLOCK + 6 * 60 * 60 * 1000) / 1000), CLOCK);
		expect(bound.runtime.presentation.quota().weekly).toEqual({
			usedPercent: 61,
			resetsAt: CLOCK + 6 * 60 * 60 * 1000,
			resetState: "valid",
			obtainedAt: CLOCK,
		});
		expect(bound.runtime.presentation.quota().weekly?.resetsAt).toBe(CLOCK + 6 * 60 * 60 * 1000);
	});

	test("a reset that is not an instant is no instant, and a state is never written onto the reading", async () => {
		const bound = await bindQuota({ respond: () => usageAnswer({}) });

		codexTurn(
			bound.double,
			{ ...fiveHourHeaders("13"), "x-codex-primary-reset-at": "soon" },
			CLOCK,
		);
		expect(bound.runtime.presentation.quota().fiveHour).toEqual({
			usedPercent: 13,
			resetState: "unknown",
			obtainedAt: CLOCK,
		});

		codexTurn(bound.double, { ...fiveHourHeaders("14"), "x-codex-primary-reset-at": "0" }, CLOCK);
		expect(bound.runtime.presentation.quota().fiveHour).toEqual({
			usedPercent: 14,
			resetState: "unknown",
			obtainedAt: CLOCK,
		});

		// The instant reported in the past was kept as reported, so the moment this reading's own state
		// moves to expired is the clock's business and not a rewrite of the value.
		codexTurn(bound.double, fiveHourHeaders("15", (CLOCK + 60_000) / 1000), CLOCK);
		expect(bound.runtime.presentation.quota().fiveHour?.resetState).toBe("valid");
		bound.clock.now = CLOCK + 61_000;
		expect(bound.runtime.presentation.quota().fiveHour).toEqual({
			usedPercent: 15,
			resetsAt: CLOCK + 60_000,
			resetState: "expired",
			obtainedAt: CLOCK,
		});
	});
});
