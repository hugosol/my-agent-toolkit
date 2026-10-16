/**
 * The account-side reading machinery behind the pi migration's real-provider acceptance (P53; S2).
 *
 * What this suite covers is the part of `scripts/pi-provider-account-read.ts` that can be decided
 * without an account: how one provider's own answer is read, how the host's drawn reading is
 * compared against it, and what a credential may look like once published. The real run itself — the
 * loaded pi extension querying the live account — is not reproducible here and is recorded as
 * evidence instead (`evidence/24-provider-account-acceptance.md`); these cases are what keeps the
 * recording honest when it happens.
 *
 * Every expectation below is an independent literal: the DeepSeek balance document and the Codex
 * usage document are each provider's documented shape written out by hand, the drawn line is the
 * literal text the pi frontend published in this worktree's own real run, and the arithmetic is this
 * file's own. Nothing here calls the extension's parsers, so a comparison that agrees does so because
 * two independent readings of the same account agree.
 */
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
	allowanceAgreementOf,
	allowanceWindowsOf,
	balanceAgreementOf,
	credentialFingerprint,
	displayedAllowanceOf,
	displayedBalanceOf,
	providerBalanceOf,
	providerCredentialOf,
	redactSecrets,
} from "../../scripts/support/provider-account-reading";

/** The DeepSeek balance document this file states by hand: two currencies, the account's own totals. */
const DEEPSEEK_ANSWER = {
	is_available: true,
	balance_infos: [
		{ currency: "USD", total_balance: "1.00", granted_balance: "1.00", topped_up_balance: "0.00" },
		{ currency: "CNY", total_balance: "257.59", granted_balance: "227.57", topped_up_balance: "30.01" },
	],
};

/** The monetary account row the pi frontend really published on this worktree's own account run. */
const DRAWN_MONETARY_ROW =
	"🔥  [░░░░░░░░░░░░░░░░░░░░   0% (0/450.0K)]  Effort: high  💰 Balance: ¥257.27  ⏳ Accrued: ¥0.0000";

/**
 * The Codex usage document this file states by hand, with the two windows in the *other* positions
 * than their lengths: the seven-day window arrived under `primary_window`.
 */
const CODEX_ANSWER = {
	rate_limit: {
		primary_window: { used_percent: 40, limit_window_seconds: 604_800, reset_at: 1_793_000_000 },
		secondary_window: { used_percent: 10, limit_window_seconds: 18_000, reset_at: 1_792_800_000 },
	},
};

describe("one provider account's own answer, read as what it states", () => {
	test("the DeepSeek answer is the account's CNY document, and a currency it did not report is unknown rather than zero", () => {
		expect(providerBalanceOf(DEEPSEEK_ANSWER)).toEqual({
			isAvailable: true,
			currency: "CNY",
			total: "257.59",
			granted: "227.57",
			toppedUp: "30.01",
		});
		// A document carrying no CNY row states no reading this extension tracks: it is not a zero.
		expect(
			providerBalanceOf({ is_available: true, balance_infos: [{ currency: "USD", total_balance: "1.00" }] }),
		).toBeUndefined();
		expect(providerBalanceOf({ is_available: true, balance_infos: [] })).toBeUndefined();
		expect(providerBalanceOf({})).toBeUndefined();
		expect(providerBalanceOf("not a document")).toBeUndefined();
	});

	test("the Codex answer's windows are told apart by the length each reports, not by the position that carried them", () => {
		const windows = allowanceWindowsOf(CODEX_ANSWER);
		expect(windows.fiveHour?.usedPercent).toBe(10);
		expect(windows.weekly?.usedPercent).toBe(40);
		// The reported instant is seconds in this protocol: it is read at its own magnitude.
		expect(windows.fiveHour?.resetsAt).toBe(1_792_800_000_000);
		expect(windows.weekly?.resetsAt).toBe(1_793_000_000_000);
	});

	test("a report carrying one window leaves the other absent, and a window without a usable length is left out rather than completed", () => {
		const oneWindow = allowanceWindowsOf({
			rate_limit: { primary_window: { used_percent: 60, limit_window_seconds: 18_000, reset_after_seconds: 600 } },
		});
		expect(oneWindow.fiveHour?.usedPercent).toBe(60);
		expect(oneWindow.weekly).toBeUndefined();
		const noLength = allowanceWindowsOf({
			rate_limit: { primary_window: { used_percent: 60 }, secondary_window: { limit_window_seconds: 604_800 } },
		});
		expect(noLength.fiveHour).toBeUndefined();
		expect(noLength.weekly).toBeUndefined();
	});
});

describe("the reading the host drew, compared against the account's own answer", () => {
	test("the monetary row's amount is read off the line, and an unavailable reading is never read as an amount", () => {
		expect(displayedBalanceOf([DRAWN_MONETARY_ROW])).toEqual({ amount: "257.27" });
		expect(
			displayedBalanceOf(["🔥  [...]  Effort: high  💰 Balance: unavailable (unreachable)  ⏳ Accrued: ¥0.0000"]),
		).toEqual({ unavailable: "unreachable" });
		expect(displayedBalanceOf(["Total:  Cache: -  ¥Cache/In/Out：--:--:--  Cost: -  Span: —"])).toBeUndefined();
	});

	test("an amount the account's own readings around the run bracket is the account's value; one they do not bracket is not", () => {
		// A quiet account: both of the run's own reads answered the same amount.
		expect(balanceAgreementOf("257.27", "257.27", "257.27")).toEqual({
			verdict: "the account's own value",
			displayed: 257.27,
			before: 257.27,
			after: 257.27,
		});
		// An account used while the run went: the host's reading falls between the two reads.
		expect(balanceAgreementOf("257.40", "257.59", "257.27").verdict).toBe("the account's own value");
		// A value the account never reported around that run — the scripted fixture's own amount —
		// is exactly what this check exists to refuse.
		expect(balanceAgreementOf("110.00", "257.59", "257.27").verdict).toBe("outside the account's readings");
	});

	test("the allowance lines state each window's own percentage, read from the line that carries its label", () => {
		expect(
			displayedAllowanceOf([
				"5h ██░░░░░░░░░░░░░░░░░░ 10.0% / 62.3% · resets in 1h 20m (14:39:45)",
				"7d ████░░░░░░░░░░░░░░░░ 40.0% / 23.1% · resets in 6d 0h (2026-10-24 14:40:45)",
			]),
		).toEqual({ fiveHour: 10, weekly: 40 });
		expect(displayedAllowanceOf(["5h limit not reported", "7d limit not reported"])).toEqual({});
		expect(displayedAllowanceOf(["Total:  Cache: -  Cost: -"])).toEqual({});
	});

	test("a drawn percentage the account's own reads support is the account's reading, and one they do not is refused", () => {
		// The account answered the same window both times.
		expect(allowanceAgreementOf(10, 10, 10)).toEqual({
			verdict: "the account's own reading",
			drawn: 10,
			before: 10,
			after: 10,
		});
		// The account was used while the run went: the drawn value sits between the two reads.
		expect(allowanceAgreementOf(40, 39, 41).verdict).toBe("the account's own reading");
		// The drawn line rounds the account's own fractional reading to one decimal.
		expect(allowanceAgreementOf(40.1, 40.06, 40.06).verdict).toBe("the account's own reading");
		// A whole point away is not that rounding.
		expect(allowanceAgreementOf(40.1, 40, 40).verdict).toBe("outside the account's readings");
		// A window the account's reads never stated supports no drawn percentage.
		expect(allowanceAgreementOf(10, undefined, undefined).verdict).toBe("outside the account's readings");
		// A window the account did state, drawn by nobody, is a mismatch rather than a silence.
		expect(allowanceAgreementOf(undefined, 10, 10).verdict).toBe("outside the account's readings");
		// A window neither side stated agrees, which is what keeps a one-window answer honest.
		expect(allowanceAgreementOf(undefined, undefined, undefined).verdict).toBe("the account's own reading");
		expect(allowanceAgreementOf(60, 10, 10)).toEqual({
			verdict: "outside the account's readings",
			drawn: 60,
			before: 10,
			after: 10,
		});
	});
});

describe("what a credential may look like once published", () => {
	test("the store's own record for a provider is resolved, and a provider it does not hold resolves to nothing", () => {
		expect(providerCredentialOf({ deepseek: { type: "api_key", key: "sk-literal-one" } }, "deepseek")).toEqual({
			provider: "deepseek",
			kind: "api_key",
			secret: "sk-literal-one",
		});
		expect(
			providerCredentialOf(
				{ "openai-codex": { type: "oauth", access: "header.payload.signature", refresh: "r", expires: 1 } },
				"openai-codex",
			),
		).toEqual({ provider: "openai-codex", kind: "oauth", secret: "header.payload.signature" });
		expect(providerCredentialOf({ deepseek: { type: "api_key", key: "sk-literal-one" } }, "openai-codex")).toBeUndefined();
		expect(providerCredentialOf({}, "deepseek")).toBeUndefined();
		expect(providerCredentialOf(undefined, "deepseek")).toBeUndefined();
	});

	test("a credential is named by a fingerprint that never lets the value be recovered, and no secret survives in the published report", () => {
		const secret = "SYNTHETIC-PI-ACCOUNT-SENTINEL-6c1a-DO-NOT-LEAK";
		const fingerprint = credentialFingerprint(secret);
		expect(fingerprint).toBe(`sha256:${createHash("sha256").update(secret).digest("hex").slice(0, 12)}`);
		expect(credentialFingerprint(secret)).toBe(fingerprint);
		expect(credentialFingerprint("another literal")).not.toBe(fingerprint);
		const published = JSON.stringify({
			reading: { total: "257.59" },
			note: `the query authenticated with Bearer ${secret}`,
			credential: fingerprint,
		});
		expect(redactSecrets(published, [secret])).not.toContain("SYNTHETIC-PI-ACCOUNT-SENTINEL");
		expect(redactSecrets(published, [secret])).toContain(fingerprint);
	});
});
