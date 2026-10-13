/**
 * The Codex allowance windows this process holds, the one startup query that seeds them and the
 * response headers that keep them current.
 *
 * An allowance window is a fact of the provider account rather than of a session, a model or a
 * Round, so this module is one set of windows per process, exactly as the host serves one Codex
 * account. The two sources the Codex backend offers enter this one business module and are read by
 * one parser: the account API answer, asked once when the process initializes, and the
 * `x-codex-*` rate-limit headers the backend attaches to every model response, read as each
 * response's facts arrive. Nothing else reaches the windows: there is no runtime API call, no TTL
 * that re-arms a query, no fallback for a window the headers did not carry and no query when the
 * viewed session or the model changes. The startup answer is what makes the windows available
 * before any header has been seen; after it, headers alone are the source.
 *
 * A window is identified by the *duration it reports*, never by the position it arrived in: a
 * window whose reported length is within ±5% of five hours is the five-hour window and one within
 * ±5% of seven days is the weekly one, whichever of `primary`/`secondary` (or the API's
 * `primary_window`/`secondary_window`) carried it. A position that reports the other length is the
 * other window — which is what keeps a package or a backend that swaps the two from mislabelling
 * the meters — and a window whose length is neither is not one of these windows at all.
 *
 * Each identified window is updated on its own: a batch that carries only one of the two updates
 * only that one, and the window it did not carry keeps the reading and the instant it was accepted
 * at. A window this process has never successfully read is unavailable rather than zero. The
 * instant a reading was accepted is what "the original time" means: it is the moment the source
 * reported the value, not the moment it is displayed, and a batch that carries no value for a
 * window does not move it.
 *
 * Headers are read in the order they arrived and each batch is applied as it is read; this module
 * keeps no absolute time line of its own, compares no source instant against another, and decides
 * nothing from a wall-clock ordering between two sources. What it does decide, when it reads a
 * window, is the *state* of the reset instant the source reported relative to the current clock:
 * a reset the source did not report (or reported unusably) is unknown, one already past is expired,
 * one further away than the window itself lasts is invalid, and only one inside the window is
 * valid. That state is a read-time reading of the reported instant, not a rewrite of it, so a past
 * or nonsensical instant is neither dropped nor clamped.
 *
 * The startup query is this extension's business and the framework's public HTTP module is the
 * transport it uses: the account API address and the headers (the bearer this extension formats
 * from the credential the harness resolved for this one operation, and the account id that same
 * credential states) are held here, not borrowed from the provider's inference base URL, and the
 * connection is the shared configuration's own named `codex` proxy — the account endpoints are not
 * part of the inference surface a streaming proxy forwards, and a selection whose configuration is
 * missing is refused rather than turned into a direct request. The business budget of that query is
 * {@link CODEX_USAGE_TIMEOUT_MS}.
 *
 * One report is one batch of windows, and each batch is also the only place the ratio measurement
 * (`codex-estimate.ts`) may read a pair from: a batch that identified both windows hands them to
 * that measurement as the report itself stated them, before anything has been merged into the
 * windows this process holds. A batch that carried one window measures nothing, which is what keeps
 * a stale held value from being paired with a fresh report.
 */
import type { ProviderAccess } from "../../../framework/core/protocol";
import { HttpConfigurationError, type HttpRequestOptions, request } from "../../../framework/modules/http";
import type { CodexEstimateSink } from "./codex-estimate";

/** The provider whose allowance this extension tracks, as this extension's own data names it. */
export const CODEX_PROVIDER = "openai-codex";

/**
 * The Codex account API's address.
 *
 * The account endpoints live on the canonical ChatGPT origin under `/backend-api`, beside the
 * inference surface rather than inside it, so the address is stated here rather than derived from
 * the provider's inference base URL: a base URL overridden for streaming (a Codex proxy, a
 * `/backend-api/codex/responses` override) is not where `/wham/usage` answers, and borrowing it
 * would ask the wrong host.
 */
export const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";

/**
 * The business budget of the startup query, in milliseconds.
 *
 * It is declared to the framework's HTTP module per request, so the budget covers waiting for the
 * response *and* reading its body; the framework's own shared default is not what this query runs
 * on.
 */
export const CODEX_USAGE_TIMEOUT_MS = 10_000;

/**
 * The shared configuration's proxy entry this extension's account query selects.
 *
 * The business fixes the selection, so there is no `usageProxy` configuration of this extension's
 * own and no per-endpoint override; removing the shared entry is a configuration failure, never an
 * instruction to connect directly.
 */
export const CODEX_USAGE_PROXY = "codex";

/** Five hours in milliseconds: the length the five-hour window reports. */
export const FIVE_HOUR_MS = 5 * 60 * 60 * 1000;

/** Seven days in milliseconds: the length the weekly window reports. */
export const WEEKLY_MS = 7 * 24 * 60 * 60 * 1000;

/** The two allowance windows this extension reads. */
export type CodexWindowKind = "five-hour" | "weekly";

/** Every window kind, in the fixed order the windows are read and written. */
const WINDOW_KINDS: readonly CodexWindowKind[] = ["five-hour", "weekly"];

/** The nominal length of each window, which is what its reported length is identified against. */
export const CODEX_WINDOW_DURATION_MS: Readonly<Record<CodexWindowKind, number>> = {
	"five-hour": FIVE_HOUR_MS,
	weekly: WEEKLY_MS,
};

/** The fraction of a window's nominal length a reported length may differ by and still be that window. */
const DURATION_TOLERANCE = 0.05;

/**
 * The state of one window's reported reset instant, as the business reads it at one instant.
 *
 * `unknown` is the source reporting no usable reset at all, `expired` an instant already past,
 * `invalid` an instant further away than the window itself lasts, and `valid` one inside the
 * window. The four are read from the reported instant as it stands — a state is never written back
 * onto the reading.
 */
export type CodexResetState = "valid" | "expired" | "invalid" | "unknown";

/** One allowance window this process accepted, with the instant it was accepted. */
export interface CodexQuotaWindow {
	/** The used percentage the source reported, as it reported it. */
	readonly usedPercent: number;
	/** The reset instant the source reported, as epoch milliseconds; absent when none was usable. */
	readonly resetsAt?: number;
	/** When this reading was accepted, on the process's own clock (epoch milliseconds). */
	readonly obtainedAt: number;
}

/**
 * One failed startup query.
 *
 * It describes the *last* attempt, and it is deliberately not a reading: a failure never becomes a
 * window at zero, and the windows already held stay untouched beside it. `detail` is a short,
 * credential-free classification for the operator, and `at` is when the attempt settled.
 */
export interface CodexQuotaFailure {
	readonly at: number;
	/** A short, sanitized reason: `no-access`, `misconfigured`, `unreachable` or `unreadable`. */
	readonly detail: string;
}

/** What one frontend reads: the windows the process holds, the last startup failure, or neither. */
export interface CodexQuotaResult {
	/** The five-hour window, absent until a source has reported it. */
	readonly fiveHour?: CodexQuotaWindow;
	/** The weekly window, absent until a source has reported it. */
	readonly weekly?: CodexQuotaWindow;
	/** The last startup attempt's failure, absent while the last attempt succeeded or none has run. */
	readonly failure?: CodexQuotaFailure;
}

/** The read-only allowance this instance answers with, and the two sources that feed it. */
export interface CodexQuota {
	/** The current result, as the display reads it; every call answers the current state. */
	result(): CodexQuotaResult;
	/**
	 * One Turn's response headers, in the order they were received: the only runtime update.
	 *
	 * A batch that identifies no window changes nothing and notifies no one.
	 */
	headersReceived(headers: Readonly<Record<string, string>>): void;
	/**
	 * Ask the account API once, at initialization.
	 *
	 * The query runs at most once per instance and never rejects: a failure is recorded as the
	 * attempt's own outcome, and a later call does nothing rather than retrying.
	 */
	startup(): Promise<void>;
	/** End this instance: a query still out is no longer accepted, and nothing is notified. */
	dispose(): void;
}

/** What one quota instance is built from. */
export interface CodexQuotaInputs {
	/** The host's current provider access, or nothing when this harness resolves none. */
	readonly access?: ProviderAccess;
	/** The instant source, on the process's own clock. */
	readonly now: () => number;
	/**
	 * Tell this instance's reader that the result changed — a window was accepted, or the startup
	 * attempt failed — so it can read again.
	 */
	readonly onChange: () => void;
	/**
	 * The ratio measurement every report's own pair is folded into.
	 *
	 * The windows reach it from here because this module holds the one parser both sources go
	 * through: what a report carried is known only while it is being applied, and the measurement is
	 * never allowed to read the merged windows instead.
	 */
	readonly estimate: CodexEstimateSink;
	/** The outbound call; the framework's public HTTP module unless a caller substitutes one. */
	readonly httpRequest?: (url: string, options?: HttpRequestOptions) => Promise<Response>;
}

/**
 * Build the process's allowance windows, their one startup query and their header updates.
 *
 * Building has no effect of its own: nothing is queried, no timer is armed and no listener is
 * registered.
 */
export function createCodexQuota(inputs: CodexQuotaInputs): CodexQuota {
	const httpRequest = inputs.httpRequest ?? request;
	const windows: Partial<Record<CodexWindowKind, CodexQuotaWindow>> = {};
	let failure: CodexQuotaFailure | undefined;
	let started = false;
	let disposed = false;

	/** Record one attempt's own outcome and tell the reader, whether it produced a window or not. */
	const fail = (detail: string): void => {
		if (disposed) return;
		failure = { at: inputs.now(), detail };
		inputs.onChange();
	};

	/** Apply one batch of windows at one instant; answer whether any window actually changed. */
	const apply = (reported: readonly ReportedWindow[], at: number): boolean => {
		const candidates = windowsOf(reported, at);
		let changed = false;
		for (const kind of WINDOW_KINDS) {
			const candidate = chosenWindow(candidates, kind);
			if (candidate === undefined) continue;
			windows[kind] = {
				usedPercent: candidate.usedPercent,
				...(candidate.resetsAt === undefined ? {} : { resetsAt: candidate.resetsAt }),
				obtainedAt: at,
			};
			changed = true;
		}
		// The ratio measurement reads this batch's own pair, as the source stated it: a batch that
		// identified both windows is the only thing that can pair, and the windows this process holds
		// — one of which may be a value an earlier batch left behind — are never an input to it.
		const fiveHour = chosenWindow(candidates, "five-hour");
		const weekly = chosenWindow(candidates, "weekly");
		if (fiveHour !== undefined && weekly !== undefined) {
			// The measurement is folded in as the batch is applied, and the write it may start is
			// deliberately not waited for: a handler's promise is no barrier for the framework
			// (`framework/core/assembly.ts`), and nothing about this report depends on the file.
			void inputs.estimate.observe({
				fiveHour: {
					usedPercent: fiveHour.usedPercent,
					...(fiveHour.resetsAt === undefined ? {} : { resetsAt: fiveHour.resetsAt }),
				},
				weekly: {
					usedPercent: weekly.usedPercent,
					...(weekly.resetsAt === undefined ? {} : { resetsAt: weekly.resetsAt }),
				},
			});
		}
		return changed;
	};

	const runStartup = async (): Promise<void> => {
		const now = inputs.now;
		try {
			const facts = await inputs.access?.resolve(CODEX_PROVIDER);
			// No access at all, or none this operation can authenticate with: the query fails rather
			// than borrowing another provider's credential or sending the request unauthenticated.
			if (facts === undefined || facts.credential === undefined || facts.credential.length === 0) {
				fail("no-access");
				return;
			}
			const response = await httpRequest(CODEX_USAGE_URL, {
				method: "GET",
				headers: apiHeaders(facts.credential),
				timeoutMs: CODEX_USAGE_TIMEOUT_MS,
				proxy: CODEX_USAGE_PROXY,
			});
			// A non-2xx answer is a real answer, and this query has no window in it: the module never
			// interprets a status as an allowance, and never retries it.
			if (!response.ok) {
				fail("unreadable");
				return;
			}
			const document = await response.json().catch(() => undefined);
			if (disposed) return;
			// The answer and the headers are read by the same parser, so the document is reduced to the
			// same reported windows the headers are before either reaches the windows.
			const accepted = apply(reportedFromDocument(document), now());
			// This attempt answered, so a failure an earlier attempt left is cleared; a reader is told
			// when either that or a window itself changed, and not when the result is what it already was.
			const clearedFailure = failure !== undefined;
			failure = undefined;
			if (accepted || clearedFailure) inputs.onChange();
		} catch (error) {
			// A selection whose shared configuration cannot be satisfied never left the process, which is
			// a configuration failure rather than a transport one; everything else — a transport failure,
			// a wait that ran out, a body that could not be read — is this attempt producing no window.
			fail(error instanceof HttpConfigurationError ? "misconfigured" : "unreachable");
		}
	};

	return {
		result: () => ({
			...(windows["five-hour"] === undefined ? {} : { fiveHour: windows["five-hour"] }),
			...(windows.weekly === undefined ? {} : { weekly: windows.weekly }),
			...(failure === undefined ? {} : { failure }),
		}),
		headersReceived(headers: Readonly<Record<string, string>>): void {
			if (disposed) return;
			const at = inputs.now();
			// The headers of one response are one batch, applied as they were received and in the order
			// they were received; a batch that identifies no window is not a change and notifies no one.
			if (apply(reportedFromHeaders(headers), at)) inputs.onChange();
		},
		async startup(): Promise<void> {
			// One attempt per instance, at initialization: no TTL, no retry, no fallback query and no
			// re-run when a window later turns out to be missing.
			if (disposed || started) return;
			started = true;
			await runStartup();
		},
		dispose(): void {
			disposed = true;
		},
	};
}

/**
 * The state of one window's reported reset instant at one instant.
 *
 * It reads the instant the window already carries: a window with no usable instant is `unknown`, an
 * instant before this instant is `expired`, one further ahead than the window lasts is `invalid`,
 * and anything left is `valid`. Nothing here is stored back onto the window, so the reported instant
 * stays exactly what the source said.
 */
export function resetStateOf(window: CodexQuotaWindow, kind: CodexWindowKind, now: number): CodexResetState {
	const resetsAt = window.resetsAt;
	if (resetsAt === undefined) return "unknown";
	if (resetsAt < now) return "expired";
	if (resetsAt - now > CODEX_WINDOW_DURATION_MS[kind]) return "invalid";
	return "valid";
}

/**
 * One window as a source reported it, in the field names of neither protocol.
 *
 * The two sources state the same three facts under different names and units — the API's
 * `used_percent`/`limit_window_seconds`/`reset_at` in a JSON body, the `x-codex-{primary,secondary}-*`
 * headers as strings in minutes — so each source is reduced to this shape first and the parser below
 * reads both alike.
 */
interface ReportedWindow {
	readonly usedPercent: unknown;
	/** The window's reported length, in seconds, as either source states it. */
	readonly windowSeconds: unknown;
	/** The absolute reset instant the source reported, in seconds or milliseconds. */
	readonly resetAt: unknown;
	/** A reset instant the source stated as a wait from now, in seconds, instead of an absolute one. */
	readonly resetAfterSeconds: unknown;
}

/** One window this extension accepted: a usage reading, the length it reported and a usable reset. */
interface CandidateWindow {
	readonly usedPercent: number;
	readonly durationMs: number;
	readonly resetsAt?: number;
}

/**
 * The one parser both sources use: the windows a source reported, as this extension reads them.
 *
 * A reported window joins the answer only when it states a usable used percentage *and* a usable
 * length: one without either is not a reading this extension can identify or apply, so it is left
 * out rather than completed with a zero, a default length or a guessed kind. The reset instant is
 * read separately, since a window is a reading whether or not its reset was stated; a source that
 * states none leaves the window without one.
 */
function windowsOf(reported: readonly ReportedWindow[], now: number): readonly CandidateWindow[] {
	const windows: CandidateWindow[] = [];
	for (const window of reported) {
		const usedPercent = numberOf(window.usedPercent);
		const seconds = numberOf(window.windowSeconds);
		if (usedPercent === undefined || seconds === undefined || seconds <= 0) continue;
		const resetsAt = resetInstantOf(window.resetAt, window.resetAfterSeconds, now);
		windows.push({ usedPercent, durationMs: seconds * 1000, ...(resetsAt === undefined ? {} : { resetsAt }) });
	}
	return windows;
}

/**
 * The window of one kind among the candidates one batch reported, or nothing when it carried none.
 *
 * The kind is decided by the reported length alone: a candidate within ±5% of the kind's nominal
 * length is that kind, wherever it arrived. When one batch reports two candidates of the same kind
 * — a backend that reports the same meter twice, or a length that drifted close to the boundary —
 * the one closest to the nominal length wins, and an exact tie keeps the one that arrived first,
 * which is the receipt order this module reads in.
 */
function chosenWindow(candidates: readonly CandidateWindow[], kind: CodexWindowKind): CandidateWindow | undefined {
	const nominal = CODEX_WINDOW_DURATION_MS[kind];
	let chosen: CandidateWindow | undefined;
	for (const candidate of candidates) {
		if (!withinTolerance(candidate.durationMs, nominal)) continue;
		if (chosen === undefined || Math.abs(candidate.durationMs - nominal) < Math.abs(chosen.durationMs - nominal)) {
			chosen = candidate;
		}
	}
	return chosen;
}

/** Whether one reported length is the nominal length of a window, within the approved ±5%. */
function withinTolerance(durationMs: number, nominal: number): boolean {
	return durationMs >= nominal * (1 - DURATION_TOLERANCE) && durationMs <= nominal * (1 + DURATION_TOLERANCE);
}

/** The reset instant a reported window states, as epoch milliseconds, or nothing when it states none. */
function resetInstantOf(resetAt: unknown, resetAfterSeconds: unknown, now: number): number | undefined {
	const absolute = numberOf(resetAt);
	// The Codex backend states this instant in seconds while a document may state it in milliseconds;
	// the magnitude is what tells them apart, exactly as the provider's own client reads it.
	if (absolute !== undefined && absolute > 0) return absolute < 1_000_000_000_000 ? absolute * 1000 : absolute;
	const after = numberOf(resetAfterSeconds);
	if (after !== undefined && after > 0) return now + after * 1000;
	return undefined;
}

/** One value as a finite number, whether the source stated it as a number or as a numeric string. */
function numberOf(value: unknown): number | undefined {
	if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
	if (typeof value !== "string") return undefined;
	const text = value.trim();
	if (text.length === 0) return undefined;
	const parsed = Number(text);
	return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * The windows one response's headers reported, in the order they were received.
 *
 * Only this protocol's own `x-codex-{primary,secondary}-{used-percent,window-minutes,reset-at}`
 * names are read; every other header, including the transport's own reference id, is none of this
 * module's business. A position enters the answer where its first field appears, so the order the
 * windows are considered in is the order the response actually carried them in.
 */
function reportedFromHeaders(headers: Readonly<Record<string, string>>): readonly ReportedWindow[] {
	const fields = new Map<string, { usedPercent?: string; windowMinutes?: string; resetAt?: string }>();
	for (const [name, value] of Object.entries(headers)) {
		const match = /^x-codex-(primary|secondary)-(used-percent|window-minutes|reset-at)$/.exec(name.trim().toLowerCase());
		if (match === null) continue;
		const position = match[1];
		const field = match[2];
		const entry = fields.get(position) ?? {};
		// The first receipt of one field is the fact; a repeated name is not a second reading.
		if (field === "used-percent" && entry.usedPercent === undefined) entry.usedPercent = value;
		if (field === "window-minutes" && entry.windowMinutes === undefined) entry.windowMinutes = value;
		if (field === "reset-at" && entry.resetAt === undefined) entry.resetAt = value;
		fields.set(position, entry);
	}
	const reported: ReportedWindow[] = [];
	for (const fieldsOfPosition of fields.values()) {
		// The header states the window in minutes while the parser reads seconds, so the source's own
		// unit is converted here rather than inside the shared reading; a value that is not a number in
		// minutes is left as it stands for the parser to reject.
		const minutes = numberOf(fieldsOfPosition.windowMinutes);
		reported.push({
			usedPercent: fieldsOfPosition.usedPercent,
			windowSeconds: minutes === undefined ? fieldsOfPosition.windowMinutes : minutes * 60,
			resetAt: fieldsOfPosition.resetAt,
			resetAfterSeconds: undefined,
		});
	}
	return reported;
}

/**
 * The windows one account API answer reported.
 *
 * The document's own `rate_limit` block carries the two windows this extension reads, under
 * `primary_window`/`secondary_window`: the parser identifies them by the lengths they report, so
 * which of the two carries which meter is the backend's business and not this module's. Anything
 * else the document carries — the plan, the credit verdict, the additional meters — is outside
 * these two windows and is not read.
 */
function reportedFromDocument(document: unknown): readonly ReportedWindow[] {
	const rateLimit = recordOf(recordOf(document)?.["rate_limit"]);
	if (rateLimit === undefined) return [];
	const reported: ReportedWindow[] = [];
	for (const key of ["primary_window", "secondary_window"]) {
		const window = recordOf(rateLimit[key]);
		if (window === undefined) continue;
		reported.push({
			usedPercent: window["used_percent"],
			windowSeconds: window["limit_window_seconds"],
			resetAt: window["reset_at"],
			resetAfterSeconds: window["reset_after_seconds"],
		});
	}
	return reported;
}

/** One value as a plain record, or nothing when it is absent or not one. */
function recordOf(value: unknown): Record<string, unknown> | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
	return value as Record<string, unknown>;
}

/**
 * The headers one account API request authenticates with, prepared here rather than by the
 * transport: the bearer this extension formats from the operation's own credential, and the account
 * the credential belongs to when the credential itself states one.
 */
function apiHeaders(credential: string): Record<string, string> {
	const accountId = accountIdOf(credential);
	return {
		authorization: `Bearer ${credential}`,
		...(accountId === undefined ? {} : { "chatgpt-account-id": accountId }),
	};
}

/** The claim a Codex OAuth credential states its ChatGPT account id under. */
const ACCOUNT_ID_CLAIM = "https://api.openai.com/auth";

/**
 * The account id one Codex OAuth credential states, or nothing when it states none.
 *
 * The account endpoints are asked for one account, and the credential that authenticates the query
 * names it: the token's own claim is read here, in the extension, so no native auth storage and no
 * session context is handed to this module for it. A credential that is not a token carrying the
 * claim — a plain key, a truncated or non-JWT-shaped value — states no account and the request goes
 * without that header rather than with a guess.
 */
function accountIdOf(credential: string): string | undefined {
	const parts = credential.split(".");
	if (parts.length !== 3) return undefined;
	try {
		// The segment is decoded tolerantly: either base64 alphabet, with or without its padding.
		const standard = parts[1].replace(/-/g, "+").replace(/_/g, "/");
		const padded = standard + "=".repeat((4 - (standard.length % 4)) % 4);
		const claims = recordOf(JSON.parse(Buffer.from(padded, "base64").toString("utf8")));
		const account = recordOf(claims?.[ACCOUNT_ID_CLAIM]);
		const accountId = account?.["chatgpt_account_id"];
		return typeof accountId === "string" && accountId.length > 0 ? accountId : undefined;
	} catch {
		return undefined;
	}
}
