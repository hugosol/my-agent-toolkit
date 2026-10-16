/**
 * The Codex allowance windows at the extension's display seam.
 *
 * The seam under test is production throughout: the extension's real definition is bound through the
 * framework's public binding (the port double, `tests/framework/support/harness-port-double.ts`), the
 * runtime is the one `createModelCostRuntime` builds, and every Turn delivery below is fed exactly as
 * a harness adapter would feed it. What the cases read is what a frontend reads —
 * `runtime.presentation.quota()`, the process-level read-only result — and what they count is what
 * the one account query really did, through the two public dependencies this extension's own business
 * takes: the harness's provider access (`ProviderAccess`) and the framework's HTTP call.
 *
 * The HTTP call is the same single-request interface production runs on
 * (`framework/modules/http.ts`), substituted here so no permanent case reaches a provider; the mock
 * records every call with the exact URL and options the query built, which is what makes the account
 * address, the authentication headers, the named proxy selection and the 10000ms business budget
 * observable rather than asserted about. It also carries every answer the account API gives: a
 * settled Codex request refreshes the windows through the shared success TTL and in-flight policy, so
 * the number of calls is part of the contract these cases pin. The clock is a controlled input, so
 * every reset state below is placed exactly.
 *
 * Nothing here recomputes an expectation with the code under test: the document's field names are the
 * Codex protocol's own, written out by hand; the window lengths (5 hours, 7 days) and the ±5% band
 * are the specification's own rule, arithmetic on this file's literals; the reset instants are
 * hand-computed from this file's clock; and the token's account id is a literal this file built into
 * the credential rather than a value read back from the implementation.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { setImmediate as immediate } from "node:timers/promises";
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

/** The specification's own success TTL for the windows, as the shipped configuration states it. */
const SPEC_TTL_MS = 15_000;

/** One day in milliseconds: the weekly reset arithmetic below is stated against it. */
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

/** One window as a document reports it: seconds for the length, seconds for the reset instant. */
interface UsageWindow {
	readonly usedPercent: number;
	readonly seconds: number;
	readonly resetAt?: number;
}

/** The windows one account API answer states, each under the position the document gave it. */
interface UsageWindows {
	readonly primary?: UsageWindow;
	readonly secondary?: UsageWindow;
}

/**
 * One account API answer, in the provider's own document shape, as one JSON response.
 *
 * The windows are stated in seconds, which is the unit the backend reports them in, so each case's
 * expectation is a hand-computed epoch-millisecond instant. A reset the case omits is a document that
 * stated none, which is a window whose reset is unknown rather than a window at zero.
 */
function usageAnswer(windows: UsageWindows): Response {
	const windowOf = (window: UsageWindow): Record<string, unknown> => ({
		used_percent: window.usedPercent,
		limit_window_seconds: window.seconds,
		...(window.resetAt === undefined ? {} : { reset_at: window.resetAt }),
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
const DOCUMENT_WINDOWS: UsageWindows = {
	primary: { usedPercent: 12.5, seconds: 18_000, resetAt: 1_700_003_600 },
	secondary: { usedPercent: 60, seconds: 604_800, resetAt: 1_700_086_400 },
};

/**
 * One whole Codex request in a session of its own: its Turn's start facts, its response — whose
 * headers this module no longer reads, carried here so a case can prove they are ignored — and the
 * settled response, the deliveries a real Codex exchange produces.
 */
function codexTurn(
	double: PortDouble,
	at: number,
	provider = CODEX,
	headers: Readonly<Record<string, string>> = {},
): void {
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

/** Let the query one trigger began settle: it awaits the host's facts, the answer and its body. */
const drain = (): Promise<void> => immediate();

/** Wait until `predicate` holds, yielding between checks; a query that never arrives fails loudly. */
async function until(predicate: () => boolean, description: string): Promise<void> {
	for (let attempt = 0; attempt < 200; attempt += 1) {
		if (predicate()) return;
		await drain();
	}
	throw new Error(`timed out waiting for ${description}`);
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
	readonly ttlMs?: number;
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
	const ttlMs = options.ttlMs ?? SPEC_TTL_MS;
	const runtime = createModelCostRuntime({
		config: { storageDir: root, balanceTtlMs: 30_000, codexQuotaTtlMs: ttlMs },
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
		config: { reader: () => `storageDir: ${root}\nbalanceTtlMs: 30000\ncodexQuotaTtlMs: ${ttlMs}\n` },
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

describe("the account API is asked at initialization and on a settled Codex request", () => {
	test("the query uses the business address, the credential's own headers and the named codex proxy", async () => {
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

	test("a settled Codex request refreshes the windows only once the success TTL has passed", async () => {
		let reply: () => Response = () => usageAnswer(DOCUMENT_WINDOWS);
		const bound = await bindQuota({ respond: () => reply() });
		expect(bound.sent).toHaveLength(1);

		// One second after the startup reading: the reading has not outlived the 15000ms TTL, so this
		// settled request asks nothing and the windows keep their value and instant.
		reply = () => usageAnswer({ primary: { usedPercent: 20, seconds: 18_000, resetAt: 1_700_003_600 } });
		bound.clock.now = CLOCK + 1_000;
		codexTurn(bound.double, bound.clock.now);
		await drain();
		expect(bound.sent).toHaveLength(1);
		expect(bound.runtime.presentation.quota().fiveHour).toEqual({
			usedPercent: 12.5,
			resetsAt: 1_700_003_600_000,
			resetState: "valid",
			obtainedAt: CLOCK,
		});

		// At exactly the TTL the reading has expired, and this settled request refreshes the five-hour
		// window from the document the endpoint now answers with.
		bound.clock.now = CLOCK + SPEC_TTL_MS;
		codexTurn(bound.double, bound.clock.now);
		await drain();
		expect(bound.sent).toHaveLength(2);
		expect(bound.runtime.presentation.quota().fiveHour).toEqual({
			usedPercent: 20,
			resetsAt: 1_700_003_600_000,
			resetState: "valid",
			obtainedAt: CLOCK + SPEC_TTL_MS,
		});
		// The weekly window was not carried by that document, so it keeps its reading and its instant.
		expect(bound.runtime.presentation.quota().weekly?.obtainedAt).toBe(CLOCK);
	});

	test("a request of another provider neither queries the account API nor updates a window", async () => {
		const bound = await bindQuota();
		const seeded = bound.runtime.presentation.quota();

		codexTurn(
			bound.double,
			CLOCK + 10 * DAY_MS,
			OTHER_PROVIDER,
			{ "x-codex-primary-used-percent": "50", "x-codex-primary-window-minutes": "300" },
		);
		await drain();

		expect(bound.sent).toHaveLength(1);
		expect(bound.runtime.presentation.quota()).toEqual(seeded);
	});

	test("a query already out is joined rather than duplicated, and its own instant is what is accepted", async () => {
		const held = Promise.withResolvers<Response>();
		let reply: () => Response | Promise<Response> = () => usageAnswer(DOCUMENT_WINDOWS);
		const bound = await bindQuota({ respond: () => reply() });

		reply = () => held.promise;
		bound.clock.now = CLOCK + 20_000;
		codexTurn(bound.double, bound.clock.now);
		await until(() => bound.sent.length === 2, "the settled request's query to be issued");

		// A second settled request arrives while that one is still out: it joins the query rather than
		// issuing a second request, so the provider sees exactly the one attempt.
		bound.clock.now = CLOCK + 40_000;
		codexTurn(bound.double, bound.clock.now);
		await drain();
		expect(bound.sent).toHaveLength(2);

		held.resolve(usageAnswer({ primary: { usedPercent: 33, seconds: 18_000, resetAt: 1_700_003_600 } }));
		await drain();
		expect(bound.runtime.presentation.quota().fiveHour).toEqual({
			usedPercent: 33,
			resetsAt: 1_700_003_600_000,
			resetState: "valid",
			obtainedAt: CLOCK + 40_000,
		});
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

	test("a failed attempt earns no TTL, so the next settled request asks again", async () => {
		const bound = await bindQuota({ respond: () => new Response("{}", { status: 403 }) });
		expect(bound.sent).toHaveLength(1);

		codexTurn(bound.double, CLOCK + 1_000);
		await drain();
		expect(bound.sent).toHaveLength(2);
	});
});

describe("the account answer updates each window on its own", () => {
	test("a document that carries one window updates that one and leaves the other's value and instant alone", async () => {
		let reply: () => Response = () => usageAnswer(DOCUMENT_WINDOWS);
		const bound = await bindQuota({ respond: () => reply() });
		const seeded = bound.runtime.presentation.quota();
		expect(seeded.weekly).toEqual({
			usedPercent: 60,
			resetsAt: 1_700_086_400_000,
			resetState: "valid",
			obtainedAt: CLOCK,
		});

		reply = () => usageAnswer({ primary: { usedPercent: 31, seconds: 18_000, resetAt: 1_700_003_600 } });
		bound.clock.now = CLOCK + 30 * 60_000;
		codexTurn(bound.double, bound.clock.now);
		await drain();

		const after = bound.runtime.presentation.quota();
		expect(after.fiveHour).toEqual({
			usedPercent: 31,
			resetsAt: 1_700_003_600_000,
			resetState: "valid",
			obtainedAt: CLOCK + 30 * 60_000,
		});
		// The window this answer did not carry keeps its reading *and* the instant it was accepted at.
		expect(after.weekly).toEqual(seeded.weekly);
		expect(bound.notifications()).toBe(1);
	});

	test("a document that identifies no window changes nothing and notifies no one, and earns no TTL", async () => {
		let reply: () => Response = () => usageAnswer({});
		const bound = await bindQuota({ respond: () => reply() });
		const before = bound.notifications();
		expect(bound.runtime.presentation.quota()).toEqual({});

		// A document whose only window states a length this extension does not track is nothing to
		// update, and neither is a second answer that identifies none.
		reply = () => usageAnswer({ primary: { usedPercent: 99, seconds: 60 } });
		bound.clock.now = CLOCK + 20_000;
		codexTurn(bound.double, bound.clock.now);
		await drain();
		reply = () => usageAnswer({});
		bound.clock.now = CLOCK + 40_000;
		codexTurn(bound.double, bound.clock.now);
		await drain();

		expect(bound.runtime.presentation.quota()).toEqual({});
		// Neither answer produced a window, so neither earned a success TTL: each settled request asks
		// again rather than waiting one out.
		expect(bound.sent).toHaveLength(3);
		expect(bound.notifications()).toBe(before);
	});

	test("two candidates of one kind in one document: the closest length wins, and an exact tie keeps the first listed", async () => {
		let reply: () => Response = () => usageAnswer(DOCUMENT_WINDOWS);
		const bound = await bindQuota({ respond: () => reply() });

		// 315 and 285 minutes are both exactly ±5% of five hours, so the two are equally close and the
		// one the document listed first is the reading; the second record states them the other way.
		reply = () =>
			usageAnswer({
				primary: { usedPercent: 11, seconds: 315 * 60 },
				secondary: { usedPercent: 77, seconds: 285 * 60 },
			});
		bound.clock.now = CLOCK + 20_000;
		codexTurn(bound.double, bound.clock.now);
		await drain();
		expect(bound.runtime.presentation.quota().fiveHour?.usedPercent).toBe(11);

		reply = () =>
			usageAnswer({
				primary: { usedPercent: 12, seconds: 315 * 60 },
				secondary: { usedPercent: 78, seconds: 285 * 60 },
			});
		bound.clock.now = CLOCK + 40_000;
		codexTurn(bound.double, bound.clock.now);
		await drain();
		expect(bound.runtime.presentation.quota().fiveHour?.usedPercent).toBe(12);
	});

	test("a position whose report carries no usable reading or length is left out rather than completed", async () => {
		let reply: () => Response = () => usageAnswer(DOCUMENT_WINDOWS);
		const bound = await bindQuota({ respond: () => reply() });
		expect(bound.runtime.presentation.quota().fiveHour).toEqual({
			usedPercent: 12.5,
			resetsAt: 1_700_003_600_000,
			resetState: "valid",
			obtainedAt: CLOCK,
		});

		// The five-hour position states its length and its reset instant but no used percentage at all:
		// there is no reading to apply, so that window keeps the reading and the instant it already had
		// rather than being completed with a zero — while the weekly window the same answer carried is
		// applied.
		reply = () =>
			new Response(
				JSON.stringify({
					rate_limit: {
						primary_window: { limit_window_seconds: 18_000, reset_at: (CLOCK + 60_000) / 1000 },
						secondary_window: {
							used_percent: 61,
							limit_window_seconds: 604_800,
							reset_at: (CLOCK + DAY_MS) / 1000,
						},
					},
				}),
				{ status: 200 },
			);
		bound.clock.now = CLOCK + 20_000;
		codexTurn(bound.double, bound.clock.now);
		await drain();

		const afterMissingPercent = bound.runtime.presentation.quota();
		expect(afterMissingPercent.fiveHour).toEqual({
			usedPercent: 12.5,
			resetsAt: 1_700_003_600_000,
			resetState: "valid",
			obtainedAt: CLOCK,
		});
		expect(afterMissingPercent.weekly?.usedPercent).toBe(61);

		// The other half of the same rule: a position that states a reading but no length states nothing
		// that identifies it as one of these two windows, so it is left out too.
		reply = () =>
			new Response(
				JSON.stringify({
					rate_limit: { secondary_window: { used_percent: 99, reset_at: (CLOCK + DAY_MS) / 1000 } },
				}),
				{ status: 200 },
			);
		bound.clock.now = CLOCK + 40_000;
		codexTurn(bound.double, bound.clock.now);
		await drain();

		expect(bound.runtime.presentation.quota().weekly).toEqual({
			usedPercent: 61,
			resetsAt: CLOCK + DAY_MS,
			resetState: "valid",
			obtainedAt: CLOCK + 20_000,
		});
	});
});

describe("a window's reset instant is read as the state it has now", () => {
	test("unknown, expired and invalid are told apart, and the reported instant is never rewritten", async () => {
		let reply: () => Response = () => usageAnswer(DOCUMENT_WINDOWS);
		const bound = await bindQuota({ respond: () => reply() });

		// No reset was stated at all: unknown, and no instant is invented for it.
		reply = () => usageAnswer({ primary: { usedPercent: 10, seconds: 18_000 } });
		bound.clock.now = CLOCK + 20_000;
		codexTurn(bound.double, bound.clock.now);
		await drain();
		expect(bound.runtime.presentation.quota().fiveHour).toEqual({
			usedPercent: 10,
			resetState: "unknown",
			obtainedAt: CLOCK + 20_000,
		});

		// A reset one minute behind the clock is expired, and the instant it reported is still there.
		reply = () => usageAnswer({ primary: { usedPercent: 11, seconds: 18_000, resetAt: (CLOCK - 60_000) / 1000 } });
		bound.clock.now = CLOCK + 40_000;
		codexTurn(bound.double, bound.clock.now);
		await drain();
		expect(bound.runtime.presentation.quota().fiveHour).toEqual({
			usedPercent: 11,
			resetsAt: CLOCK - 60_000,
			resetState: "expired",
			obtainedAt: CLOCK + 40_000,
		});

		// A reset further away than the window itself lasts is invalid, with six hours against a
		// five-hour window.
		reply = () =>
			usageAnswer({ primary: { usedPercent: 12, seconds: 18_000, resetAt: (CLOCK + 6 * 60 * 60 * 1000) / 1000 } });
		bound.clock.now = CLOCK + 60_000;
		codexTurn(bound.double, bound.clock.now);
		await drain();
		expect(bound.runtime.presentation.quota().fiveHour).toEqual({
			usedPercent: 12,
			resetsAt: CLOCK + 6 * 60 * 60 * 1000,
			resetState: "invalid",
			obtainedAt: CLOCK + 60_000,
		});

		// The weekly window reads its own length: seven days away is invalid there, six hours is not.
		reply = () => usageAnswer({ secondary: { usedPercent: 60, seconds: 604_800, resetAt: (CLOCK + 8 * DAY_MS) / 1000 } });
		bound.clock.now = CLOCK + 80_000;
		codexTurn(bound.double, bound.clock.now);
		await drain();
		expect(bound.runtime.presentation.quota().weekly?.resetState).toBe("invalid");
		reply = () =>
			usageAnswer({ secondary: { usedPercent: 61, seconds: 604_800, resetAt: (CLOCK + 6 * 60 * 60 * 1000) / 1000 } });
		bound.clock.now = CLOCK + 100_000;
		codexTurn(bound.double, bound.clock.now);
		await drain();
		expect(bound.runtime.presentation.quota().weekly).toEqual({
			usedPercent: 61,
			resetsAt: CLOCK + 6 * 60 * 60 * 1000,
			resetState: "valid",
			obtainedAt: CLOCK + 100_000,
		});
		expect(bound.runtime.presentation.quota().weekly?.resetsAt).toBe(CLOCK + 6 * 60 * 60 * 1000);
	});

	test("a reset that is not an instant is no instant, and a state is never written onto the reading", async () => {
		let reply: () => Response = () => usageAnswer(DOCUMENT_WINDOWS);
		const bound = await bindQuota({ respond: () => reply() });

		// A reset the document states as a non-numeric value is no usable instant.
		reply = () =>
			new Response(
				JSON.stringify({
					rate_limit: { primary_window: { used_percent: 13, limit_window_seconds: 18_000, reset_at: "soon" } },
				}),
				{ status: 200 },
			);
		bound.clock.now = CLOCK + 20_000;
		codexTurn(bound.double, bound.clock.now);
		await drain();
		expect(bound.runtime.presentation.quota().fiveHour).toEqual({
			usedPercent: 13,
			resetState: "unknown",
			obtainedAt: CLOCK + 20_000,
		});

		// Zero is not an instant either, which is what the provider's own client reads it as.
		reply = () => usageAnswer({ primary: { usedPercent: 14, seconds: 18_000, resetAt: 0 } });
		bound.clock.now = CLOCK + 40_000;
		codexTurn(bound.double, bound.clock.now);
		await drain();
		expect(bound.runtime.presentation.quota().fiveHour).toEqual({
			usedPercent: 14,
			resetState: "unknown",
			obtainedAt: CLOCK + 40_000,
		});

		// The instant reported in the future was kept as reported, so the moment this reading's own
		// state moves to expired is the clock's business and not a rewrite of the value.
		reply = () => usageAnswer({ primary: { usedPercent: 15, seconds: 18_000, resetAt: (CLOCK + 60_000) / 1000 } });
		bound.clock.now = CLOCK + 60_000;
		codexTurn(bound.double, bound.clock.now);
		await drain();
		expect(bound.runtime.presentation.quota().fiveHour?.resetState).toBe("valid");
		bound.clock.now = CLOCK + 61_000;
		expect(bound.runtime.presentation.quota().fiveHour).toEqual({
			usedPercent: 15,
			resetsAt: CLOCK + 60_000,
			resetState: "expired",
			obtainedAt: CLOCK + 60_000,
		});
	});
});
