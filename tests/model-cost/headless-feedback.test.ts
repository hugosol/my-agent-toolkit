/**
 * The operator's channel when a session has no UI (P43, P69; S2).
 *
 * The seam under test is production throughout: the extension's real definition is bound through the
 * framework's public binding (the port double, `tests/framework/support/harness-port-double.ts`), the
 * runtime is the one `createModelCostRuntime` builds, and every session, Turn and Round delivery
 * below is fed exactly as a harness adapter would feed it — with the faithful `hasUI` fact the
 * adapter resolved. What the cases read is the feedback the framework published and the read-only
 * results a frontend reads; no private field is inspected.
 *
 * What these cases are about is the one decision the `hasUI` fact takes part in here: a provider
 * balance or allowance query that failed is a fact of the provider account, and it reaches the
 * operator through the channel the session actually has. A session with a UI draws it in the widget
 * and publishes nothing — the widget's own line is the reading a frontend formats, and the
 * specification keeps provider query failures out of the notification channel there — while a
 * session without one is told the same fact on stderr through the extension feedback channel, once
 * per failed attempt. The other business notices this extension publishes (a skipped request, a save
 * that did not land, a paused instance, a command's own result) keep their levels and their single
 * report either way; what changes with `hasUI` is only where the framework's adapter puts them.
 *
 * The pricing data is self-made, the clock is a value the case moves by assignment, and the HTTP
 * calls are substituted at the one dependency the extension takes — so no case here reaches a
 * provider, reads a real price or waits on a duration. The messages asserted below are the
 * extension's own, and the levels are the specification's three: an effect that did not happen is an
 * `error`, something the operator should notice about one that partly happened is a `warning`, and an
 * effect that happened is `info`.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { MODEL_COST } from "../../extensions/model-cost/definition";
import type { ModelPricingData } from "../../extensions/model-cost/shared-logic/model-data";
import { type ModelCostRuntime, createModelCostRuntime } from "../../extensions/model-cost/shared-logic/runtime";
import type {
	OwnerReference,
	ProviderAccess,
	ProviderAccessFacts,
	SessionEvent,
	SessionFacts,
	TurnOutcome,
	TurnSignal,
	TurnUsage,
} from "../../framework/core/protocol";
import { HttpConfigurationError, type HttpRequestOptions } from "../../framework/modules/http";
import {
	type FeedbackNotice,
	type PortDouble,
	type RoundBoundary,
	type SessionBoundary,
	type TurnBoundary,
	portDouble,
} from "../framework/support/harness-port-double";
import { until } from "../support/pending-query";

/** The self-made pricing data every case binds with: nothing here reads a real price or model list. */
const DATA: ModelPricingData = {
	currency: "XTS",
	unit: "XTS per million tokens",
	peakMultiplier: 1,
	zoneOffsetMinutes: 8 * 60,
	peakWindows: [],
	tiers: { probe: { input: 2, cacheRead: 0.5, output: 8 } },
	allowanceProviders: [],
	models: {
		deepseek: {
			// A monetary pair this data prices, and one it names without a tier price of its own.
			"probe-model": { mode: "monetary", tier: "probe" },
			"probe-unpriced": { mode: "monetary", tier: "absent" },
		},
	},
};

const HARNESS = "probe-harness";
const OWNER: OwnerReference = { kind: "owner", key: "main:headless" };
const MAIN: SessionFacts = { sessionId: "session-main", kind: "main", unavailable: [] };

/** The two provider sources this extension prefetches, as this extension's own data names them. */
const DEEPSEEK = "deepseek";
const CODEX = "openai-codex";

/** The clock every case starts at, and the specification's own success TTL. */
const CLOCK = 1_700_000_000_000;
const SPEC_TTL_MS = 30_000;

/** The two addresses the extension's own queries go to: the host's address (`/v1` removed) and the account API. */
const BALANCE_URL = "https://host.example/user/balance";
const CODEX_URL = "https://chatgpt.com/backend-api/wham/usage";

/** The usage one settled request reports. */
const USAGE: TurnUsage = { input: 1, cacheRead: 0, cacheWrite: 0, output: 1, totalTokens: 2 };

/** A synthetic credential this file's own literal: nothing real, and never a secret. */
const SENTINEL = "SYNTHETIC-SENTINEL-21a7-DO-NOT-LEAK";

/** The host's own answers for the two providers' queries, each stating an address and a credential. */
const ACCESS: ProviderAccess = {
	resolve: async provider =>
		provider === DEEPSEEK
			? { baseUrl: "https://host.example/v1", credential: "balance-key" }
			: { credential: "codex-key" },
};

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

/** One account API answer, in the provider's own document shape, as one JSON response. */
function usageAnswer(): Response {
	return new Response(
		JSON.stringify({
			plan_type: "pro",
			rate_limit: {
				primary_window: { used_percent: 12.5, limit_window_seconds: 18_000, reset_at: 1_700_003_600 },
				secondary_window: { used_percent: 60, limit_window_seconds: 604_800, reset_at: 1_700_086_400 },
			},
		}),
		{ status: 200, headers: { "content-type": "application/json" } },
	);
}

/** One request the extension made, as the substituted HTTP call recorded it. */
interface SentRequest {
	readonly url: string;
	readonly options: HttpRequestOptions | undefined;
}

/** One bound instance, and what a case drives and observes it through. */
interface Bound {
	readonly runtime: ModelCostRuntime;
	readonly double: PortDouble;
	readonly root: string;
	/** Whether the deliveries of this instance carry a UI, as the adapter resolved it. */
	readonly hasUI: boolean;
	/** Every request the extension sent, in call order. */
	readonly sent: SentRequest[];
	/** The clock the runtime's own business reads; a case moves it by assignment. */
	readonly clock: { now: number };
	readonly boundaries: SessionBoundary[];
	readonly turns: TurnBoundary[];
	readonly rounds: RoundBoundary[];
}

/** Every root this file created, removed after each case. */
const roots: string[] = [];

/** Every notice the framework published for this instance, in delivery order, with its severity. */
function noticesOf(bound: Bound): FeedbackNotice[] {
	return [...bound.boundaries, ...bound.turns, ...bound.rounds].flatMap(boundary => boundary.feedback);
}

/**
 * One bound instance over a fresh isolated root: the production runtime, bound through the
 * framework's own binding, with the harness's provider access and the HTTP call substituted.
 *
 * The owner session's start is always delivered — that is where the instance initializes — and
 * `initiate` (the default) also drives the run initiation the first model request waits on, so the
 * queries a case sees are the ones the prefetch started. `initiate: false` hands back the instance
 * before that run initiation, which is what a case driving the answers itself needs.
 */
async function bind(
	options: {
		readonly hasUI?: boolean;
		readonly respond?: (request: SentRequest, index: number) => Response | Promise<Response>;
		readonly access?: (provider: string) => Promise<ProviderAccessFacts | undefined>;
		readonly baseline?: string;
		readonly initiate?: boolean;
	} = {},
): Promise<Bound> {
	const root = mkdtempSync(path.join(tmpdir(), "model-cost-headless-"));
	roots.push(root);
	if (options.baseline !== undefined) writeFileSync(path.join(root, "consumption.json"), options.baseline, "utf8");
	const clock = { now: CLOCK };
	const sent: SentRequest[] = [];
	const runtime = createModelCostRuntime({
		config: { storageDir: root, balanceTtlMs: SPEC_TTL_MS },
		configDirectory: root,
		userHomeDirectory: root,
		harness: HARNESS,
		data: DATA,
		providerAccess: options.access === undefined ? ACCESS : { resolve: options.access },
		now: () => clock.now,
		httpRequest: async (url, httpOptions) => {
			const request = { url, options: httpOptions };
			sent.push(request);
			if (options.respond !== undefined) return options.respond(request, sent.length - 1);
			return url === CODEX_URL ? usageAnswer() : balanceAnswer("110.00");
		},
	});
	const double = portDouble();
	double.bind(MODEL_COST, {
		factory: () => runtime.implementation,
		config: { reader: () => `storageDir: ${root}\nbalanceTtlMs: ${SPEC_TTL_MS}\ncodexQuotaTtlMs: 15000\n` },
	});
	const hasUI = options.hasUI ?? true;
	const bound: Bound = { runtime, double, root, hasUI, sent, clock, boundaries: [], turns: [], rounds: [] };
	bound.boundaries.push(double.deliverSession(OWNER, { session: MAIN, hasUI }));
	if (options.initiate !== false) await double.initiateRun(OWNER);
	return bound;
}

/** One more session delivery to this instance, at the instance's own `hasUI` fact. */
function deliverSession(bound: Bound, event?: SessionEvent): SessionBoundary {
	const boundary = bound.double.deliverSession(OWNER, {
		session: MAIN,
		hasUI: bound.hasUI,
		...(event === undefined ? {} : { event }),
	});
	bound.boundaries.push(boundary);
	return boundary;
}

/**
 * One whole request in this instance's session: its Turn's start, and its settled response, whose
 * final readings are the ones the case states — `[USAGE]` for a response that reported a usage, and
 * nothing for one that established none.
 */
function deliverRequest(bound: Bound, at: number, model = "probe-model", readings: readonly TurnUsage[] = [USAGE]): void {
	bound.turns.push(
		bound.double.deliverTurn(
			{ kind: "request_started", session: MAIN, at, provider: DEEPSEEK, model } as TurnSignal,
			{ owner: OWNER, hasUI: bound.hasUI },
		),
	);
	bound.turns.push(
		bound.double.deliverTurn(
			{
				kind: "response_settled",
				session: MAIN,
				at: at + 60_000,
				outcome: "completed" as TurnOutcome,
				readings,
			},
			{ owner: OWNER, hasUI: bound.hasUI },
		),
	);
}

/** One Round edge for this instance's session, delivered at the instance's own `hasUI` fact. */
function deliverRound(bound: Bound, kind: "round_start" | "round_end"): RoundBoundary {
	const boundary = bound.double.deliverRound(OWNER, {
		event: { kind },
		session: MAIN,
		hasUI: bound.hasUI,
	});
	bound.rounds.push(boundary);
	return boundary;
}

/** Both provider sources refused, which is the one failure shape every case below starts from. */
function refusedSources(request: SentRequest): Response | Promise<Response> {
	return request.url === BALANCE_URL ? new Response("busy", { status: 503 }) : Promise.reject(new Error("refused"));
}

/** Lets the event loop turn over until nothing already queued is left. */
async function queuedWorkSettled(): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>();
	setImmediate(resolve);
	await promise;
}

/** Every file of one storage root, as the text a case can search for something that must not leak. */
function storageFiles(root: string): string[] {
	const found: string[] = [];
	for (const entry of readdirSync(root, { withFileTypes: true, recursive: true })) {
		if (entry.isFile()) found.push(readFileSync(path.join(entry.parentPath, entry.name), "utf8"));
	}
	return found;
}

/**
 * Waits until a save dispatched by a Round end has settled, and answers the notices it produced.
 *
 * The framework dispatches a semantic handler without waiting for the promise it returns, so the
 * notice a failed save publishes lands a few event-loop turns later; the wait is on the notice rather
 * than on a duration, and the deadline only keeps one that never lands from hanging the case.
 */
async function settledNotices(bound: Bound): Promise<FeedbackNotice[]> {
	const deadline = Date.now() + 5_000;
	for (;;) {
		const notices = noticesOf(bound);
		if (notices.length > 0) return notices;
		if (Date.now() > deadline) throw new Error("no notice landed after the Round end");
		await queuedWorkSettled();
	}
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("a provider query that failed reaches the operator on the channel the session has (P43)", () => {
	test("a session with a UI draws it in the widget and publishes nothing", async () => {
		const bound = await bind({ hasUI: true, respond: refusedSources });

		// Both attempts failed, and the read-only result is where a frontend reads them: the widget's
		// own line is that result, so the notification channel stays silent — the specification's
		// "widget only" half of this rule.
		expect(bound.runtime.presentation.balance().failure?.detail).toBe("unreadable");
		expect(bound.runtime.presentation.quota().failure?.detail).toBe("unreachable");
		expect(noticesOf(bound)).toEqual([]);
	});

	test("a session without a UI is told both failures, once each, at error severity", async () => {
		const bound = await bind({ hasUI: false, respond: refusedSources });

		const notices = noticesOf(bound);
		expect(notices.map(notice => notice.level)).toEqual(["error", "error"]);
		// One notice per failed attempt: neither is stated twice, and each names its own source and the
		// sanitized reason the result carries — no amount, no credential and no transport text.
		expect(notices[0]?.message).toContain("余额读取失败（unreadable）");
		expect(notices[1]?.message).toContain("Codex 额度读取失败（unreachable）");
	});

	test("the fact that a later delivery sees is stated once, and only a new attempt speaks again", async () => {
		const bound = await bind({ hasUI: false, respond: refusedSources });
		expect(noticesOf(bound)).toHaveLength(2);

		// A delivery that observes the same failed attempts says nothing more about them: the failures
		// stay in the read-only result, and the report is per attempt rather than per delivery.
		deliverSession(bound, { kind: "session_facts" });
		await queuedWorkSettled();
		expect(noticesOf(bound)).toHaveLength(2);

		// The reading is absent, so a settled request of the balance's own provider begins a second
		// attempt — which this endpoint refuses too, at an instant of its own. It is a new failure, and
		// the next delivery says so once.
		bound.clock.now += SPEC_TTL_MS;
		deliverRequest(bound, CLOCK + 120_000);
		await until(() => bound.sent.length === 3, "the settled request's own balance query to be issued");
		deliverSession(bound, { kind: "session_facts" });
		await queuedWorkSettled();

		const notices = noticesOf(bound);
		expect(notices).toHaveLength(3);
		expect(notices[2]?.level).toBe("error");
		expect(notices[2]?.message).toContain("余额读取失败（unreadable）");
	});

	test("a source that answers publishes nothing, and one refused source does not stand for the other", async () => {
		const bound = await bind({
			hasUI: false,
			respond: request => (request.url === BALANCE_URL ? balanceAnswer("110.00") : refusedSources(request)),
		});

		// Only the allowance source failed: the reading that really answered is a reading, and no notice
		// is published for it.
		expect(bound.runtime.presentation.balance().reading?.total).toBe(110);
		expect(noticesOf(bound)).toHaveLength(1);
		expect(noticesOf(bound)[0]?.message).toContain("Codex 额度读取失败");
	});

	test("a query that was never sent is no failed request: a missing credential or proxy config stays on the read-only result", async () => {
		// A host that authenticates the balance source and not the allowance one: the allowance query
		// is never made, so there is no request outcome for the operator's channel.
		const unconfigured = await bind({
			hasUI: false,
			access: async provider =>
				provider === DEEPSEEK ? { baseUrl: "https://host.example/v1", credential: "balance-key" } : undefined,
		});
		expect(unconfigured.runtime.presentation.quota().failure?.detail).toBe("no-access");
		expect(noticesOf(unconfigured)).toEqual([]);

		// The same for a named proxy selection this host's configuration cannot satisfy: the framework
		// refuses the call before anything is sent, which is a configuration fact rather than a failed
		// provider request.
		const unsatisfiable = await bind({
			hasUI: false,
			respond: request => {
				if (request.url === CODEX_URL) throw new HttpConfigurationError("proxy 'codex' is not configured");
				return balanceAnswer("110.00");
			},
		});
		expect(unsatisfiable.runtime.presentation.quota().failure?.detail).toBe("misconfigured");
		expect(noticesOf(unsatisfiable)).toEqual([]);
	});

	test("a stated failure carries no credential: the synthetic sentinel reaches its own query and nothing else", async () => {
		// The host authenticates the balance source with a synthetic credential this file's own literal —
		// never a real one — and the endpoint refuses the query, which is the shape a credential could
		// travel in if the notice carried the failure's text rather than its sanitized classification.
		const bound = await bind({
			hasUI: false,
			access: async provider =>
				provider === DEEPSEEK
					? { baseUrl: "https://host.example/v1", credential: SENTINEL }
					: { credential: "codex-key" },
			respond: request =>
				request.url === BALANCE_URL ? new Response("busy", { status: 503 }) : Promise.reject(new Error(SENTINEL)),
		});

		expect(bound.sent[0]?.options?.headers).toEqual({ authorization: `Bearer ${SENTINEL}` });
		expect(noticesOf(bound)).toHaveLength(2);
		// What the operator channel carries, and what the read-only results carry, are the sanitized
		// classifications: neither the credential nor the transport's own error text.
		const surfaces: Record<string, string> = {
			feedback: JSON.stringify(noticesOf(bound)),
			balance: JSON.stringify(bound.runtime.presentation.balance()),
			quota: JSON.stringify(bound.runtime.presentation.quota()),
			files: storageFiles(bound.root).join("\n"),
		};
		for (const [surface, text] of Object.entries(surfaces)) {
			expect(`${surface}: ${text}`).not.toContain(SENTINEL);
		}
	});
});

describe("a disposed instance reports nothing, and a late failure is not a fact of the next one (P56)", () => {
	test("a disposal before the answers land leaves the operator channel untouched", async () => {
		const bound = await bind({ hasUI: false, respond: refusedSources, initiate: false });
		const firstRequest = bound.double.initiateRun(OWNER);

		// The session this instance serves ends while both queries are out: the framework runs the one
		// cleanup, and a failure that settles afterwards is no longer this instance's to report.
		bound.boundaries.push(bound.double.deliverSession(OWNER, { event: { kind: "session_end", reason: "disposed" }, hasUI: false, session: MAIN }));
		await firstRequest;
		await queuedWorkSettled();
		expect(noticesOf(bound)).toEqual([]);

		// The next instance is its own: what the spent one dropped never reaches it, and its own refused
		// sources are reported on its own channel.
		const next = await bind({ hasUI: false, respond: refusedSources });
		expect(noticesOf(next)).toHaveLength(2);
		expect(noticesOf(bound)).toEqual([]);
	});
});

describe("the other business notices keep their levels and their single report without a UI (P43)", () => {
	test("a command's own result is published at its own level, and an invalid argument is reported once", async () => {
		const bound = await bind({ hasUI: false });

		const flipped = await bound.double.runToCompletion("budget", { args: "detail", hasUI: false });
		expect(flipped.feedback).toHaveLength(1);
		expect(flipped.feedback[0]?.level).toBe("info");

		// The framework's own routing reports the unrecognized argument at `error`, with the command's
		// help, once — and runs nothing.
		const refused = await bound.double.runToCompletion("budget", { args: "nope", hasUI: false });
		expect(refused.feedback).toHaveLength(1);
		expect(refused.feedback[0]?.level).toBe("error");
		expect(refused.feedback[0]?.message).toContain("/budget — 费用统计与展示管理");
		expect(refused.effects).toEqual(["notify"]);
	});

	test("a request with no reliable usage, and one whose pair has no applicable price, are each warned once", async () => {
		const bound = await bind({ hasUI: false });

		deliverRequest(bound, CLOCK, "probe-model", []);
		expect(noticesOf(bound)).toHaveLength(1);
		expect(noticesOf(bound)[0]?.level).toBe("warning");
		expect(noticesOf(bound)[0]?.message).toContain("usage");

		// A pair this data names without a tier price: the tokens are still accumulated, the amount is
		// skipped, and the operator is told once.
		deliverRequest(bound, CLOCK + 60_000, "probe-unpriced");
		const notices = noticesOf(bound);
		expect(notices).toHaveLength(2);
		expect(notices[1]?.level).toBe("warning");
		expect(notices[1]?.message).toContain("价格");
	});

	test("a save that did not land is an error, and a paused instance is one too", async () => {
		const failed = await bind({ hasUI: false });
		// The document this instance loaded becomes unreadable: the file is replaced by a directory, so
		// the coordinated update cannot read a document at all.
		rmSync(path.join(failed.root, "consumption.json"), { force: true });
		mkdirSync(path.join(failed.root, "consumption.json"));

		deliverRound(failed, "round_start");
		deliverRequest(failed, CLOCK);
		deliverRound(failed, "round_end");
		const notices = await settledNotices(failed);
		expect(notices).toHaveLength(1);
		expect(notices[0]?.level).toBe("error");

		// A baseline that cannot be read pauses the instance, and the pause is stated where the display
		// has no widget to draw it in either.
		const paused = await bind({ hasUI: false, baseline: "{ this is not a document" });
		const pauseNotices = noticesOf(paused);
		expect(pauseNotices).toHaveLength(1);
		expect(pauseNotices[0]?.level).toBe("error");
		expect(pauseNotices[0]?.message).toContain("暂停");

		// A later request is not accounted and does not write; the pause is not restated on every save.
		deliverRound(paused, "round_start");
		deliverRequest(paused, CLOCK + 120_000);
		deliverRound(paused, "round_end");
		await queuedWorkSettled();
		expect(noticesOf(paused)).toHaveLength(1);
	});
});
