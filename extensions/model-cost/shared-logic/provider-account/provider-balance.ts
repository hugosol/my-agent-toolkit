/**
 * The DeepSeek balance reading this process holds, the CLI's one startup prefetch of it, and the
 * usage-driven check that refreshes it.
 *
 * A balance is a fact of the provider account rather than of a session, a model or a Round, so this
 * module is one reading per process, exactly as the host serves one account per provider. Nothing
 * here is a subscription or a schedule: the CLI asks once while the instance initializes — its own
 * prefetch, taken before the first model request and not dependent on the model that request runs —
 * and after it the reading is refreshed only when a real request of the tracked provider settles:
 * the moment the provider has just recorded consumption, and only when the reading this instance
 * already holds has outlived its success TTL, with no query already in flight. There is no timer, no
 * polling, no query at the instant a TTL merely expires, and no query when an activity starts, a
 * Round ends or the viewed session changes.
 *
 * The TTL is a *success* TTL: only a reading the provider really answered resets it. A query that
 * fails — no access, a transport or timeout failure, a body that is not this provider's balance —
 * leaves the last reading and the instant it was obtained exactly where they were, sets no cooldown
 * and starts no retry; the next settled request of that provider checks the same unchanged reading
 * again. That is the deliberate trade: a model request succeeding says nothing about whether an
 * independent query can, and this module would rather repeat a cheap check than invent a failure
 * policy or a second retry schedule.
 *
 * The two triggers differ in one rule. A source this host cannot authenticate is not configured for
 * this extension, so the startup prefetch is not an attempt at all — nothing is sent and no failure
 * is stated for a provider the process has not used — while a settled request's check is about a
 * provider this process really used, and a missing credential there is that query's own failure.
 *
 * Every trigger that arrives while a query is in flight is merged into that query: the request is
 * issued once for as long as one is outstanding, and nothing is re-issued when it completes. The
 * caller that triggered it is answered by the query it joined, and the next *later* trigger is what
 * asks again.
 *
 * The query itself is this extension's business, and the framework's public HTTP module is the
 * transport it uses: a direct connection (`proxy: false`, never the host's own proxy environment),
 * a business budget of {@link BALANCE_TIMEOUT_MS}, and the credential the harness resolved for this
 * one operation — never another provider's, never a cached first answer. The address is the host's
 * own base URL for the provider with a trailing `/v1` removed, and the documented DeepSeek default
 * when the host resolved none; the protocol's own `/user/balance` path and its CNY reading are
 * stated here, in the extension, not in the transport.
 */
import type { ProviderAccess } from "../../../../framework/core/protocol";
import { type HttpRequestOptions, request } from "../../../../framework/modules/http";
import { createProviderRefresh } from "./provider-refresh";

/** The provider whose balance this extension tracks, as this extension's own data names it. */
export const DEEPSEEK_PROVIDER = "deepseek";

/** The success TTL a reading keeps before a later settled request may refresh it. */
export const DEFAULT_BALANCE_TTL_MS = 30_000;

/**
 * The business budget of one balance query, in milliseconds.
 *
 * It is declared to the framework's HTTP module per request, so the budget covers waiting for the
 * response *and* reading its body; the framework's own shared default is not what this query runs
 * on.
 */
export const BALANCE_TIMEOUT_MS = 5_000;

/**
 * The official DeepSeek address, used when the host resolved no base URL for the provider.
 *
 * The path below is stripped of a trailing `/v1` before the balance path is appended, so this
 * default and a host-resolved `https://api.deepseek.com/v1` reach the same endpoint.
 */
const DEEPSEEK_DEFAULT_BASE_URL = "https://api.deepseek.com";

/** The balance path of the provider's own protocol, appended to the resolved address. */
const BALANCE_PATH = "/user/balance";

/** The currency the reading is taken in; the provider reports its other allowances beside it. */
const BALANCE_CURRENCY = "CNY";

/** One accepted balance reading, with the instant it was accepted. */
export interface ProviderBalanceReading {
	/** The provider's total balance in the reading's own currency. */
	readonly total: number;
	/** The currency the total is expressed in, as the provider reported it. */
	readonly currency: string;
	/** When this reading was accepted, on the process's own clock (epoch milliseconds). */
	readonly obtainedAt: number;
}

/**
 * One failed balance query.
 *
 * It describes the *last* attempt, and it is deliberately not a value: a failure never becomes a
 * reading of zero, and a reading already held stays untouched beside it. `detail` is a short,
 * credential-free classification for the operator, and `at` is when the attempt settled.
 */
export interface ProviderBalanceFailure {
	readonly at: number;
	/** A short, sanitized reason: `no-access`, `unreachable` or `unreadable`. */
	readonly detail: string;
}

/** What one frontend reads: the reading the process holds, the last attempt's failure, or neither. */
export interface ProviderBalanceResult {
	/** The last accepted reading, absent until a query has succeeded. */
	readonly reading?: ProviderBalanceReading;
	/** The last attempt's failure, absent while the last attempt succeeded or none has run. */
	readonly failure?: ProviderBalanceFailure;
}

/** The read-only balance this instance answers with. */
export interface ProviderBalance {
	/** The current result, as the display reads it; every call answers the current state. */
	result(): ProviderBalanceResult;
	/**
	 * One settled request of `provider`: the usage-driven check.
	 *
	 * Only the tracked provider reaches the check. The reading held is compared against the success
	 * TTL at this instant, and a query already outstanding is joined rather than duplicated.
	 */
	usageSettled(provider: string): void;
	/**
	 * The CLI's own prefetch of this provider's balance, asked once while the instance initializes.
	 *
	 * It is the one trigger besides a settled request: it makes a reading — or the query's own
	 * failure — available before the first model request, so the first usage does not have to be what
	 * starts the first query. It runs at most once per instance and never rejects, so the
	 * initialization it belongs to settles whether the provider answers, refuses or is not
	 * configured; the promise it answers with is that attempt's completion, which is what lets the
	 * first request wait for a bounded outcome.
	 *
	 * A source this host cannot authenticate is not configured for this extension, and the prefetch
	 * is then not an attempt at all: nothing is sent and no failure is stated for a provider the
	 * process has not used. A query already out — a settled request's check that got there first —
	 * is this attempt's completion rather than a second request.
	 */
	prefetch(): Promise<void>;
	/**
	 * One boundary reading for a period switch: a single best-effort query of this provider's
	 * balance, made outside any file coordination.
	 *
	 * It is the one explicit command-driven query — a period switch reads the balance the period is
	 * ending at, and the caller applies that one reading to both the archive's `end_bal` and the new
	 * period's `start_bal` — so it neither waits for the success TTL nor accepts the reading already
	 * held: the value it answers with is the one *this* attempt obtained, and an attempt that failed
	 * answers nothing rather than the last accepted balance. It is not retried and it is not
	 * repeated, and it joins a query already out rather than asking the provider twice.
	 */
	boundaryReading(): Promise<number | undefined>;
	/** End this instance: a query still out is no longer accepted, and nothing is notified. */
	dispose(): void;
}

/**
 * Why one balance query was made: the CLI's own startup prefetch, the check a settled request of
 * this provider triggers, or an explicit boundary read a period switch asked for.
 *
 * The trigger decides one thing only — whether a host that cannot authenticate this provider makes
 * this attempt fail or makes it no attempt at all — and never how the query is sent.
 */
type QueryTrigger = "startup-prefetch" | "settled-request" | "boundary-reading";

/** What one balance instance is built from. */
export interface ProviderBalanceInputs {
	/** The host's current provider access, or nothing when this harness resolves none. */
	readonly access?: ProviderAccess;
	/** The instant source, on the process's own clock. */
	readonly now: () => number;
	/** The success TTL, in milliseconds. */
	readonly ttlMs: number;
	/**
	 * Tell this instance's reader that the result changed — a reading was accepted, or an attempt
	 * failed — so it can read again.
	 */
	readonly onChange: () => void;
	/** The outbound call; the framework's public HTTP module unless a caller substitutes one. */
	readonly httpRequest?: (url: string, options?: HttpRequestOptions) => Promise<Response>;
}

/**
 * Build the process's balance reading and its usage-driven refresh.
 *
 * Building has no effect of its own: nothing is queried, no timer is armed and no listener is
 * registered.
 */
export function createProviderBalance(inputs: ProviderBalanceInputs): ProviderBalance {
	const httpRequest = inputs.httpRequest ?? request;
	let reading: ProviderBalanceReading | undefined;
	let failure: ProviderBalanceFailure | undefined;
	/** The shared refresh policy: the success TTL, and the one query in flight that later triggers join. */
	const refresh = createProviderRefresh({ now: inputs.now, ttlMs: inputs.ttlMs });
	/** Whether the CLI's own prefetch has been asked for; it is one attempt per instance. */
	let prefetched = false;
	let disposed = false;

	const fail = (detail: string): void => {
		if (disposed) return;
		failure = { at: inputs.now(), detail };
		inputs.onChange();
	};

	/**
	 * One query, up to its completion, as the trigger that asked for it.
	 *
	 * The answer is the balance *this attempt* obtained, or nothing when it obtained none — never the
	 * reading the instance already held, which is what makes a boundary read honest about a failed
	 * attempt. The triggers differ in one rule only: an attempt at a provider this process really
	 * uses — a settled request's check, or a period switch's boundary read — fails when the host
	 * cannot authenticate it, while the startup prefetch of a source the host cannot authenticate is
	 * not an attempt at all: there is nothing configured to ask, and no failure is stated for a
	 * provider the process has not used.
	 */
	const runQuery = async (trigger: QueryTrigger): Promise<number | undefined> => {
		try {
			const facts = await (inputs.access?.resolve(DEEPSEEK_PROVIDER));
			// No access at all, or none this operation can authenticate with: the query fails rather
			// than borrowing another provider's credential or sending the request unauthenticated.
			if (facts === undefined || facts.credential === undefined || facts.credential.length === 0) {
				if (trigger !== "startup-prefetch") fail("no-access");
				return undefined;
			}
			const response = await httpRequest(`${baseUrlOf(facts.baseUrl)}${BALANCE_PATH}`, {
				method: "GET",
				headers: { authorization: `Bearer ${facts.credential}` },
				timeoutMs: BALANCE_TIMEOUT_MS,
				proxy: false,
			});
			// A non-2xx answer is a real answer, and this query has no reading in it: the module never
			// interprets a status as a balance, and never retries it.
			if (!response.ok) {
				fail("unreadable");
				return undefined;
			}
			const total = await readBalance(await response.json().catch(() => undefined));
			if (total === undefined) {
				fail("unreadable");
				return undefined;
			}
			if (disposed) return undefined;
			reading = { total, currency: BALANCE_CURRENCY, obtainedAt: inputs.now() };
			failure = undefined;
			inputs.onChange();
			return total;
		} catch {
			// A transport failure, a wait that ran out, or a body that could not be read: this query
			// produced no reading, and the one held — if any — keeps its value and its instant.
			fail("unreachable");
			return undefined;
		}
	};

	return {
		result: () => ({
			...(reading === undefined ? {} : { reading }),
			...(failure === undefined ? {} : { failure }),
		}),
		/**
		 * One settled request of `provider`: the usage-driven trigger.
		 *
		 * Only the tracked provider reaches the check, so a request of another provider neither
		 * queries the balance nor filters by what is being viewed. The reading is checked against the
		 * success TTL at this instant, and an outstanding query is joined rather than duplicated.
		 */
		usageSettled(provider: string): void {
			if (disposed || provider !== DEEPSEEK_PROVIDER) return;
			if (!refresh.due(reading?.obtainedAt)) return;
			void refresh.begin(() => runQuery("settled-request"));
		},
		/**
		 * The CLI's own prefetch: one attempt, at initialization, before the first model request.
		 *
		 * The reading a fresh process holds is absent, so this is what makes a reading — or the
		 * query's own outcome — available before the first usage, and what settles the initialization
		 * the first request waits on. It runs once whether or not the answer is a reading, and a
		 * second call does nothing rather than re-asking.
		 */
		prefetch(): Promise<void> {
			if (disposed || prefetched) return Promise.resolve();
			prefetched = true;
			return refresh.begin(() => runQuery("startup-prefetch")).then(() => undefined);
		},
		/**
		 * One boundary read for a period switch, made outside any file coordination.
		 *
		 * It is one attempt whether or not a reading is already held and whether or not its success
		 * TTL has run out: the answer is the balance this attempt obtained, and nothing when the
		 * provider refused, the transport failed or the body carried no CNY total. Nothing here waits
		 * for a lock, nothing is retried, and the reading held is left as it was by a failed attempt.
		 */
		boundaryReading(): Promise<number | undefined> {
			if (disposed) return Promise.resolve(undefined);
			return refresh.begin(() => runQuery("boundary-reading"));
		},
		dispose(): void {
			disposed = true;
		},
	};
}

/**
 * The address one query is sent to: the host's resolved base URL with a trailing `/v1` removed,
 * and the official default when the host resolved none.
 *
 * The removal is the provider's own read of the address, not a transport concern: the balance
 * endpoint sits beside the versioned inference path rather than under it, so a host that states
 * `https://api.deepseek.com/v1` is asked for `https://api.deepseek.com/user/balance`.
 */
function baseUrlOf(resolved: string | undefined): string {
	const base = (resolved === undefined || resolved.length === 0 ? DEEPSEEK_DEFAULT_BASE_URL : resolved)
		.replace(/\/+$/, "")
		.replace(/\/v1$/, "");
	return base.length === 0 ? DEEPSEEK_DEFAULT_BASE_URL : base;
}

/**
 * The CNY total of one parsed balance document, or `undefined` when it does not carry one.
 *
 * The provider's documented answer is `{ is_available, balance_infos: [{ currency, total_balance,
 * granted_balance, topped_up_balance }] }` with its amounts as strings; this extension reads the
 * CNY total and nothing else. A document without that entry, an entry whose amount is not a finite
 * number, and a body that was not this document at all are all the same answer: no balance this
 * query can accept, rather than a reading of zero.
 */
function readBalance(document: unknown): number | undefined {
	const infos = (document as { readonly balance_infos?: unknown } | undefined)?.balance_infos;
	if (!Array.isArray(infos)) return undefined;
	for (const info of infos) {
		const entry = info as { readonly currency?: unknown; readonly total_balance?: unknown } | undefined;
		if (entry?.currency !== BALANCE_CURRENCY) continue;
		const total = typeof entry.total_balance === "string" ? Number(entry.total_balance) : entry.total_balance;
		return typeof total === "number" && Number.isFinite(total) ? total : undefined;
	}
	return undefined;
}
