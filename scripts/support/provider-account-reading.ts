/**
 * The account side of the real-provider acceptance: what one provider's own answer says, what the
 * loaded extension drew, and what a credential may look like once the observation is published.
 *
 * This module is deliberately *not* production code and must not be mistaken for it. It exists so
 * `scripts/pi-provider-account-read.ts` can hold one provider's live answer and the reading a real pi
 * session drew beside each other, and so the two can be compared without asking the extension what it
 * thinks its own reading means. Importing the extension's parsers here would make the comparison
 * circular — the same parser on both sides would agree with itself — so every reader below is a
 * second, independent reading of a documented wire shape, scoped to what that comparison needs. The
 * suite that covers it is `tests/model-cost/integration/provider-account-reading.test.ts`.
 *
 * Three rules follow from that and are kept by the rest of this file:
 *
 * - A fact the source did not state is *unknown*, never zero. A balance document with no CNY row, a
 *   window with no reported length and a line that says `limit not reported` all read as absent, so
 *   the comparison never mistakes a missing reading for a confirmed one.
 * - A credential is named by its fingerprint and nothing else. `credentialFingerprint` is the only
 *   form of a secret that may reach a report, and `redactSecrets` is applied to everything published.
 * - The comparison states where it stands. `balanceAgreementOf` answers whether the drawn amount is
 *   the account's own answer at that instant — a value the account's own reads around the run bracket
 *   — rather than whether it matches one of them: an account used while the run went really does
 *   answer two different amounts, and a drawn value between them is still the account's own.
 */
import { createHash } from "node:crypto";

/** The currency the extension's balance reading is stated in, and the row this reader looks for. */
export const BALANCE_CURRENCY = "CNY";

/** One credential the machine's own store holds for one provider, as resolved for one run. */
export interface ProviderCredential {
	/** The provider the record belongs to. */
	readonly provider: string;
	/** The store's own record type (`api_key`, `oauth`, …). */
	readonly kind: string;
	/** The secret itself. Never published; `credentialFingerprint` is what a report may carry. */
	readonly secret: string;
}

/** One value as a plain record, or nothing when it is absent or not one. */
function recordOf(value: unknown): Record<string, unknown> | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
	return value as Record<string, unknown>;
}

/** One value as a finite number, or nothing when it is absent or not one. */
function numberOf(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** One value as a non-empty string, or nothing when it is absent or not one. */
function stringOf(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * The credential one provider's record in a pi auth store holds, or nothing when the store has no
 * usable record for it.
 *
 * The store is the harness's own file (`auth.json` under the agent state directory): one record per
 * provider, whose `type` says what kind of credential it is and which of the secret-bearing fields it
 * carries. A record with no readable secret is no credential — the caller then reports the missing
 * access rather than sending a request without one.
 */
export function providerCredentialOf(store: unknown, provider: string): ProviderCredential | undefined {
	const record = recordOf(recordOf(store)?.[provider]);
	if (record === undefined) return undefined;
	const secret = stringOf(record["key"]) ?? stringOf(record["access"]) ?? stringOf(record["token"]);
	if (secret === undefined) return undefined;
	return { provider, kind: stringOf(record["type"]) ?? "<unnamed>", secret };
}

/**
 * The name one secret is published under: a truncated SHA-256 digest, which names the credential a
 * reading belongs to without letting the value itself be recovered from the report.
 */
export function credentialFingerprint(secret: string): string {
	return `sha256:${createHash("sha256").update(secret).digest("hex").slice(0, 12)}`;
}

/** Every given secret in `text` replaced by its own fingerprint, so no published text carries one. */
export function redactSecrets(text: string, secrets: readonly string[]): string {
	let redacted = text;
	for (const secret of secrets) {
		if (secret.length === 0) continue;
		redacted = redacted.split(secret).join(credentialFingerprint(secret));
	}
	return redacted;
}

/** The DeepSeek account's own CNY reading, as its balance answer stated it. */
export interface ProviderBalanceReading {
	readonly isAvailable: boolean;
	/** The currency row this reading was taken from; always {@link BALANCE_CURRENCY}. */
	readonly currency: string;
	readonly total: string;
	readonly granted: string;
	readonly toppedUp: string;
}

/**
 * The account reading one DeepSeek balance answer carries, or nothing when it states no CNY row.
 *
 * The answer's own document is read here: `is_available` and the `balance_infos` rows. A row whose
 * currency is not the one this extension tracks is another account currency beside this reading, and
 * a document with no such row states no reading at all rather than a zero.
 */
export function providerBalanceOf(document: unknown): ProviderBalanceReading | undefined {
	const answer = recordOf(document);
	if (answer === undefined) return undefined;
	const rows = answer["balance_infos"];
	if (!Array.isArray(rows)) return undefined;
	const row = rows.map(recordOf).find(candidate => candidate?.["currency"] === BALANCE_CURRENCY);
	if (row === undefined) return undefined;
	const total = stringOf(row["total_balance"]);
	if (total === undefined) return undefined;
	return {
		isAvailable: answer["is_available"] === true,
		currency: BALANCE_CURRENCY,
		total,
		granted: stringOf(row["granted_balance"]) ?? "",
		toppedUp: stringOf(row["topped_up_balance"]) ?? "",
	};
}

/** The balance one drawn account row states: the amount it wrote, or the reason it wrote none. */
export interface DisplayedBalance {
	/** The amount the line states, exactly as the frontend formatted it. */
	readonly amount?: string;
	/** The failure detail an `unavailable (…)` line names. */
	readonly unavailable?: string;
}

/**
 * The balance one set of drawn widget lines carries, or nothing when they carry no balance line.
 *
 * The two forms the frontend draws are read as what they are: an amount, or the reason no reading was
 * available. An `unavailable` line is never read as an amount — least of all a zero — because that is
 * exactly the substitution this acceptance exists to refuse.
 */
export function displayedBalanceOf(lines: readonly string[]): DisplayedBalance | undefined {
	for (const line of lines) {
		const at = line.indexOf("Balance:");
		if (at < 0) continue;
		const rest = line.slice(at);
		const unavailable = /Balance: unavailable \(([^)]*)\)/.exec(rest);
		if (unavailable !== null) return { unavailable: unavailable[1] ?? "" };
		const amount = /Balance: \u00A5(\d+(?:\.\d+)?)/.exec(rest);
		if (amount !== null) return { amount: amount[1] as string };
	}
	return undefined;
}

/**
 * What one comparison between the drawn amount and the account's own reads says.
 *
 * `the account's own value` means the drawn amount is one the account itself stated around the run —
 * equal to both reads when the account was quiet, or between them when it was used while the run
 * went. `outside the account's readings` is the verdict a reading no account read supports gets,
 * whatever it looks like.
 */
export interface BalanceAgreement {
	readonly verdict: "the account's own value" | "outside the account's readings";
	readonly displayed: number;
	readonly before: number;
	readonly after: number;
}

/** One amount as the cent the display states it at, so a comparison is not a string comparison. */
function centsOf(amount: string): number {
	return Math.round(Number.parseFloat(amount) * 100);
}

/** Whether the amount the host drew is one the account's own reads around the run support. */
export function balanceAgreementOf(displayed: string, before: string, after: string): BalanceAgreement {
	const drawn = centsOf(displayed);
	const earlier = centsOf(before);
	const later = centsOf(after);
	const low = Math.min(earlier, later);
	const high = Math.max(earlier, later);
	return {
		verdict: drawn >= low && drawn <= high ? "the account's own value" : "outside the account's readings",
		displayed: drawn / 100,
		before: earlier / 100,
		after: later / 100,
	};
}

/** One allowance window's own reading, as its report stated it. */
export interface ReportedWindow {
	readonly usedPercent: number;
	/** The reset instant in epoch milliseconds, when the report stated a usable one. */
	readonly resetsAt?: number;
}

/** The two allowance windows one account report carried, each identified by the length it reported. */
export interface AllowanceWindows {
	readonly fiveHour?: ReportedWindow;
	readonly weekly?: ReportedWindow;
}

/** The nominal length of each window, in milliseconds. */
const WINDOW_LENGTH_MS = { fiveHour: 5 * 60 * 60 * 1000, weekly: 7 * 24 * 60 * 60 * 1000 } as const;

/** The fraction of a window's nominal length a reported length may differ by and still be that window. */
const WINDOW_TOLERANCE = 0.05;

/** The reset instant one reported window states, read at its own magnitude; seconds or milliseconds. */
function resetInstantOf(resetAt: unknown, resetAfterSeconds: unknown, now: number): number | undefined {
	const absolute = numberOf(resetAt);
	if (absolute !== undefined && absolute > 0) return absolute < 1_000_000_000_000 ? absolute * 1000 : absolute;
	const after = numberOf(resetAfterSeconds);
	return after !== undefined && after > 0 ? now + after * 1000 : undefined;
}

/**
 * The windows one Codex usage answer carried, identified by the length each one reported.
 *
 * The backend's own document is read here: `rate_limit.primary_window` and
 * `rate_limit.secondary_window`, each stating a used percentage and the length of its window. Which
 * window a report carried is decided by that length alone — the two can arrive in either position —
 * and a window that states no usable percentage or no usable length is left out rather than being
 * completed with a zero or a guessed kind.
 *
 * `now` is only read for a report that states its reset as a countdown instead of an instant.
 */
export function allowanceWindowsOf(document: unknown, now: number = Date.now()): AllowanceWindows {
	const rateLimit = recordOf(recordOf(document)?.["rate_limit"]);
	if (rateLimit === undefined) return {};
	const windows: { fiveHour?: ReportedWindow; weekly?: ReportedWindow } = {};
	for (const key of ["primary_window", "secondary_window"]) {
		const window = recordOf(rateLimit[key]);
		if (window === undefined) continue;
		const usedPercent = numberOf(window["used_percent"]);
		const seconds = numberOf(window["limit_window_seconds"]);
		if (usedPercent === undefined || seconds === undefined || seconds <= 0) continue;
		const lengthMs = seconds * 1000;
		const resetsAt = resetInstantOf(window["reset_at"], window["reset_after_seconds"], now);
		const reading: ReportedWindow = { usedPercent, ...(resetsAt === undefined ? {} : { resetsAt }) };
		for (const kind of ["fiveHour", "weekly"] as const) {
			const nominal = WINDOW_LENGTH_MS[kind];
			if (lengthMs < nominal * (1 - WINDOW_TOLERANCE) || lengthMs > nominal * (1 + WINDOW_TOLERANCE)) continue;
			windows[kind] ??= reading;
		}
	}
	return windows;
}

/** The used percentage each drawn allowance line states, read from the line that carries its label. */
export function displayedAllowanceOf(lines: readonly string[]): { fiveHour?: number; weekly?: number } {
	const drawn: { fiveHour?: number; weekly?: number } = {};
	for (const line of lines) {
		const label = /^(5h|7d)\b/.exec(line)?.[1];
		if (label === undefined) continue;
		const percent = /(\d+(?:\.\d+)?)%/.exec(line);
		if (percent === null) continue;
		// The label the extension draws for each window, and the window it stands for.
		if (label === "5h") drawn.fiveHour ??= Number.parseFloat(percent[1] as string);
		else drawn.weekly ??= Number.parseFloat(percent[1] as string);
	}
	return drawn;
}

/** What one comparison between a drawn allowance percentage and the account's own reads says. */
export interface AllowanceAgreement {
	/**
	 * `the account's own reading` means every window the account's own reads stated around the run
	 * carried the percentage the line drew, and a window the account never stated was not drawn
	 * either. A percentage no account read supports — including one drawn for a window the account
	 * did not report — is `outside the account's readings`.
	 */
	readonly verdict: "the account's own reading" | "outside the account's readings";
	/** The drawn percentage, or `null` when the host drew no reading for that window. */
	readonly drawn: number | null;
	readonly before: number | null;
	readonly after: number | null;
}

/**
 * Whether the percentage one drawn allowance line states is the account's own reading.
 *
 * A percentage is compared at the precision the line draws it (one decimal), because the account's
 * own report and the drawn line round the same value differently. The two-sided rule is the balance
 * reading's own: the account may be used while the run goes, so a drawn value between the account's
 * two reads is still the account's own.
 */
export function allowanceAgreementOf(
	drawn: number | undefined,
	before: number | undefined,
	after: number | undefined,
): AllowanceAgreement {
	const shown = { drawn: drawn ?? null, before: before ?? null, after: after ?? null };
	const reads = [before, after].filter((value): value is number => value !== undefined);
	if (reads.length === 0) {
		// The account stated no such window in either read, so only a line that stays silent about it
		// agrees: a percentage the account never reported is refused rather than accepted unverified.
		return { verdict: drawn === undefined ? "the account's own reading" : "outside the account's readings", ...shown };
	}
	// The line draws one decimal, so the account's own percentage and the drawn one are compared at
	// that precision, and both of the account's reads bracket a reading taken between them.
	const low = Math.min(...reads) - 0.05;
	const high = Math.max(...reads) + 0.05;
	return {
		verdict: drawn !== undefined && drawn >= low && drawn <= high ? "the account's own reading" : "outside the account's readings",
		...shown,
	};
}
