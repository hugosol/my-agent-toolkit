/**
 * The Codex allowance windows in a running harness (P39, P65; S5).
 *
 * This is the isolated real-host smoke of the window source the change approved: a settled Codex
 * Turn triggers the *same* account API query the initialization makes, under the same success TTL
 * and in-flight policy — and a response's own `x-codex-*` headers are facts the runtime no longer
 * reads at all. The dock materialises the recorded baseline install **with the Codex
 * response-boundary patch applied** (`codex-response-harness.ts`), loads this repository's own
 * model-cost runtime through the harness's real loader (through the fixture in `fixtures/codex-quota`,
 * which binds the production definition and runtime), and drives real sessions in an isolated home
 * whose storage root the extension's own shipped `config.yaml` names.
 *
 * Two substitutions make that observable without a real ChatGPT account, and both are the dock's own:
 * the session's built-in `openai-codex` provider is redirected — through the isolated agent state,
 * before any extension loads — at the dock's capture endpoint, so every Turn these runs produce is a
 * real one; and the fixture answers the extension's account query from a script directory this file
 * writes (address, budget, proxy selection and headers are the runtime's own — only the answer is
 * scripted), with the run's success TTL stated by this file so the TTL policy is driven rather than
 * waited out.
 *
 * What these runs establish:
 *
 * - the host's half: a settled Codex Turn really delivers the response's HTTP facts on the patched
 *   install, and still settles the Turn on the unpatched one — the windows do not depend on either.
 * - the extension's half: the windows move to the account answer a settled Turn's query obtained, a
 *   response's own headers neither create nor change them, the answer that states one window updates
 *   that window alone (the other keeps its value and its instant), the ratio measurement is fed by the
 *   paired windows one answer carried, and the number of account queries is exactly what the TTL and
 *   the one-query-in-flight policy allow.
 *
 * What these runs do **not** establish: a real Codex account's allowance. The windows are this file's
 * own scripted literals, the credential is the isolated run's own fixture token, and no request leaves
 * the process for the account API — the fixture's transport answers the query in-process.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { writeAgentSettings, writeProviderOverride } from "./agent-config";
import { type IsolatedHarness, ensureIsolatedHarness, readBaselineRecord } from "./baseline";
import { type CaptureServer, type CapturedRequest, startCaptureServer } from "./capture-server";
import { ensureCodexResponseHarness } from "./codex-response-harness";
import {
	CODEX_QUOTA_ESTIMATE_LINE,
	CODEX_QUOTA_LINE,
	CODEX_QUOTA_SCRIPT_DIR_ENV,
	CODEX_QUOTA_TTL_MS_ENV,
	CODEX_QUOTA_TURN_LINE,
	type RecordedAccountQuery,
	type ScriptedAccountAnswer,
	recordedAccountQueries,
	releaseAccountQueries,
	writeAccountAnswer,
} from "./fixtures/codex-quota/entrypoint";
import { type RunRoot, createRunRoot } from "./run-root";
import { ControlledSession } from "./session";

const record = readBaselineRecord();
/** The extension's own OMP entrypoint for this smoke: the fixture that binds the production runtime. */
const CODEX_QUOTA_ENTRYPOINT = path.join(__dirname, "fixtures", "codex-quota", "entrypoint.ts");
/** The document the extension keeps in its storage root. */
const CONSUMPTION_FILE = "consumption.json";
/** The built-in provider these runs redirect, and the catalog model they execute. */
const PROVIDER = "openai-codex";
const MODEL_SELECTOR = "openai-codex/gpt-6-luna";
/** The account API's own address, wait budget and proxy selection, as the contract states them. */
const ACCOUNT_URL = "https://chatgpt.com/backend-api/wham/usage";
const ACCOUNT_TIMEOUT_MS = 10_000;
const ACCOUNT_PROXY = "codex";
/** The window lengths the account API reports, in the unit its document states them. */
const FIVE_HOUR_SECONDS = 5 * 60 * 60;
const WEEKLY_SECONDS = 7 * 24 * 60 * 60;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/**
 * The success TTL a run that must refresh on a settled Turn is built with.
 *
 * The smallest TTL the field accepts, because the host's own local model Turn settles tens of
 * milliseconds after the initialization's answer — a fake endpoint answers at once — so a reading
 * this fresh is stale by the time that Turn checks it and the trigger is what these runs observe. The
 * TTL's own boundary (a reading still inside it, and the join of a query already out) is the
 * controlled-clock case in `tests/model-cost/codex-quota.test.ts`; here the *patient* TTL below and a
 * held answer are what say the policy, not a duration, is what decides.
 */
const PROMPT_TTL_MS = 1;
/** A success TTL that outlives this whole suite: no Turn of that run may refresh anything. */
const PATIENT_TTL_MS = 10 * 60 * 1000;

/**
 * A JWT-shaped credential whose claim names a ChatGPT account.
 *
 * The Codex provider reads the account id out of the token before it builds a request, exactly as it
 * does for a real login credential, so the token these runs authenticate with has to carry one. The
 * extension's own account query formats the same account id into its headers from this same token
 * (the assertions below read both headers back), and here the token's only job is to let the session
 * run.
 */
const ACCOUNT_ID = "acct-dock-13";

function codexProbeToken(accountId: string): string {
	const claims = Buffer.from(
		JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: accountId } }),
		"utf8",
	).toBase64();
	return `aaa.${claims}.bbb`;
}

/** The credential these runs configure for the redirected provider. */
const ACCOUNT_TOKEN = codexProbeToken(ACCOUNT_ID);

let patchedHarness: IsolatedHarness;
let baselineHarness: IsolatedHarness;

beforeAll(async () => {
	patchedHarness = await ensureCodexResponseHarness(record);
	// The control: the same version without the patch, so a run with no response boundary at all is
	// what shows the windows come from the account query rather than from the host's facts.
	baselineHarness = await ensureIsolatedHarness(record);
}, 600_000);

/** One run's isolated home and the storage root the shipped configuration names inside it. */
interface IsolatedHome {
	readonly home: string;
	readonly env: Record<string, string>;
}

/** The isolated user home one run uses: `<run root>/user-home`, with the OMP home inside it. */
function isolateHome(runRoot: RunRoot): IsolatedHome {
	const home = path.join(runRoot.path, "user-home");
	const storageDirectory = path.join(home, ".omp", "cost-archive");
	mkdirSync(storageDirectory, { recursive: true });
	writeFileSync(
		path.join(storageDirectory, CONSUMPTION_FILE),
		JSON.stringify({
			schemaVersion: 1,
			periodId: "period-codex-quota",
			start: "2026-10-01T00:00:00.000Z",
			holiday: true,
			harnesses: { omp: { sessions: [] } },
		}),
		"utf8",
	);
	return {
		home,
		env: {
			USERPROFILE: home,
			HOME: home,
			HOMEDRIVE: path.parse(home).root,
			HOMEPATH: home.slice(path.parse(home).root.length - 1),
		},
	};
}

/** One report's own window: the share the API states and how far ahead its reset sits. */
interface ScriptedWindow {
	readonly usedPercent: number;
	readonly resetInMs: number;
}

/** The epoch second one window's reset instant is stated as: the API states whole seconds. */
function resetSeconds(at: number, offsetMs: number): number {
	return Math.floor((at + offsetMs) / 1000);
}

/** The reset instant the extension reads back from that stated second, in epoch milliseconds. */
function resetsAtMs(at: number, offsetMs: number): number {
	return resetSeconds(at, offsetMs) * 1000;
}

/** One account API answer: the windows it states, under the API's own fields and units. */
function accountDocument(at: number, fiveHour?: ScriptedWindow, weekly?: ScriptedWindow): unknown {
	return {
		rate_limit: {
			...(fiveHour === undefined
				? {}
				: {
						primary_window: {
							used_percent: fiveHour.usedPercent,
							limit_window_seconds: FIVE_HOUR_SECONDS,
							reset_at: resetSeconds(at, fiveHour.resetInMs),
						},
					}),
			...(weekly === undefined
				? {}
				: {
						secondary_window: {
							used_percent: weekly.usedPercent,
							limit_window_seconds: WEEKLY_SECONDS,
							reset_at: resetSeconds(at, weekly.resetInMs),
						},
					}),
		},
	};
}

/**
 * One response's headers: both windows of one Codex answer, in the backend's own names and units —
 * minutes for a window's length, an absolute epoch instant in seconds for its reset.
 *
 * These are the facts the runtime used to read and no longer does: each run scripts them beside its
 * account answers, with values no account answer of that run states, so a window that moved to them
 * would be visible.
 */
function reportHeaders(at: number, fiveHour: ScriptedWindow, weekly: ScriptedWindow): Record<string, string> {
	return {
		"x-codex-primary-used-percent": String(fiveHour.usedPercent),
		"x-codex-primary-window-minutes": String(FIVE_HOUR_SECONDS / 60),
		"x-codex-primary-reset-at": String(resetSeconds(at, fiveHour.resetInMs)),
		"x-codex-secondary-used-percent": String(weekly.usedPercent),
		"x-codex-secondary-window-minutes": String(WEEKLY_SECONDS / 60),
		"x-codex-secondary-reset-at": String(resetSeconds(at, weekly.resetInMs)),
	};
}

/** One provisioned run: the session, the capture endpoint, the isolated root and the script directory. */
interface DockRun {
	readonly session: ControlledSession;
	readonly capture: CaptureServer;
	readonly runRoot: RunRoot;
	/** The account-query script directory this run's fixture answers its account queries from. */
	readonly accountDir: string;
}

/** One run: which host it executes, the success TTL it is built with, and what its account API says. */
interface RunScript {
	readonly harness: IsolatedHarness;
	readonly ttlMs: number;
	/** The answer the n-th account query of the run receives (1-based); an unscripted call repeats the last. */
	readonly answers: Readonly<Record<number, ScriptedAccountAnswer>>;
	/** The `x-codex-*` facts its Codex responses carry — facts the windows must not come from. */
	readonly responseHeaders: (request: CapturedRequest) => Record<string, string>;
}

/** One run whose built-in Codex provider answers from the capture endpoint, over a scripted account API. */
async function startRun(label: string, script: RunScript): Promise<DockRun> {
	const runRoot = createRunRoot(label);
	const home = isolateHome(runRoot);
	const accountDir = path.join(runRoot.path, "account-api");
	for (const [index, answer] of Object.entries(script.answers)) {
		writeAccountAnswer(accountDir, Number(index), answer);
	}
	const capture = startCaptureServer({
		dir: runRoot.captureDir,
		replyText: "dock codex quota reply",
		usage: { input: 10, output: 7, cacheRead: 3 },
		responseHeaders: script.responseHeaders,
	});
	writeProviderOverride(runRoot.agentDir, PROVIDER, { baseUrl: capture.baseUrl, apiKey: ACCOUNT_TOKEN });
	// The catalog model prefers websockets; the response these runs must observe is a real HTTP one, so
	// each run pins the SSE transport, exactly as the repository's other Codex-path smokes do.
	writeAgentSettings(runRoot.agentDir, { "providers.openaiWebsockets": "off" });
	try {
		const session = await ControlledSession.start({
			harness: script.harness,
			runRoot,
			extensions: [CODEX_QUOTA_ENTRYPOINT],
			model: MODEL_SELECTOR,
			env: {
				...home.env,
				[CODEX_QUOTA_SCRIPT_DIR_ENV]: accountDir,
				[CODEX_QUOTA_TTL_MS_ENV]: String(script.ttlMs),
			},
			promptTimeoutMs: 120_000,
		});
		return { session, capture, runRoot, accountDir };
	} catch (error) {
		capture.stop();
		runRoot.dispose();
		throw error;
	}
}

async function disposeRun(run: DockRun): Promise<void> {
	try {
		if (run.session.exited() === null) await run.session.stop({ timeoutMs: 15_000 });
	} catch {
		// The session already stopped (or never started); the rest of the run still gets cleaned up.
	}
	run.capture.stop();
	run.runRoot.dispose();
}

/** The lines one prefix published, parsed, in publication order. */
function linesWith<T>(session: ControlledSession, prefix: string): T[] {
	return session
		.stderr()
		.split("\n")
		.filter(line => line.startsWith(prefix))
		.map(line => JSON.parse(line.slice(prefix.length)) as T);
}

/** One allowance window the fixture published, as the display read it. */
interface PublishedWindow {
	readonly usedPercent: number;
	readonly resetsAt?: number;
	readonly resetState: string;
	readonly obtainedAt: number;
}

/** One allowance result the fixture published. */
interface PublishedQuota {
	readonly fiveHour?: PublishedWindow;
	readonly weekly?: PublishedWindow;
	readonly failure?: { readonly at: number; readonly detail: string };
}

/** One ratio/left reading the fixture published; `null` while no window is readable. */
interface PublishedEstimate {
	readonly ratio?: number;
	readonly left?: number;
	readonly text: string;
}

/** One settled Turn the fixture published, as the framework delivered it. */
interface PublishedTurn {
	readonly turnId: string;
	readonly provider: string;
	readonly outcome: string;
	readonly hasHttpFacts: boolean;
	readonly headerNames: readonly string[];
	readonly unavailable: readonly string[];
}

/** Every window percentage this run published, whichever reading carried it. */
function publishedPercents(session: ControlledSession): Set<number | undefined> {
	return new Set(
		linesWith<PublishedQuota>(session, CODEX_QUOTA_LINE).flatMap(reading => [
			reading.fiveHour?.usedPercent,
			reading.weekly?.usedPercent,
		]),
	);
}

/**
 * Waits until one run's own record holds what a case expects of it, and answers with it.
 *
 * The record is written by *another* process — the harness the case is driving — so there is no
 * promise or event in this process to await and no fake clock that could advance it: the poll is the
 * observation, and the deadline only keeps a record that never arrives from hanging the case.
 */
async function until<T>(read: () => T | undefined, expectation: string): Promise<T> {
	const deadline = Date.now() + 30_000;
	for (;;) {
		const value = read();
		if (value !== undefined) return value;
		if (Date.now() >= deadline) throw new Error(`timed out waiting for ${expectation}`);
		await Bun.sleep(25);
	}
}

/** Every account query one run has made so far, in call order. */
function accountQueries(run: DockRun): readonly RecordedAccountQuery[] {
	return recordedAccountQueries(run.accountDir);
}

/** Waits until one run has asked the account API this many times, and answers with the record. */
async function accountQueriesReaching(run: DockRun, count: number): Promise<readonly RecordedAccountQuery[]> {
	return until(() => {
		const queries = accountQueries(run);
		return queries.length >= count ? queries : undefined;
	}, `${count} account queries`);
}

/** Waits until a reading a case accepts is the last this run published, and answers it. */
async function lastQuota(
	session: ControlledSession,
	accept: (reading: PublishedQuota) => boolean,
	expectation: string,
): Promise<PublishedQuota> {
	return until(() => {
		const published = linesWith<PublishedQuota>(session, CODEX_QUOTA_LINE);
		const last = published[published.length - 1];
		return last !== undefined && accept(last) ? last : undefined;
	}, expectation);
}

/** The one settled Turn a run published, asserting there is exactly one. */
function onlyTurn(session: ControlledSession): PublishedTurn {
	const turns = linesWith<PublishedTurn>(session, CODEX_QUOTA_TURN_LINE);
	expect(turns).toHaveLength(1);
	const turn = turns[0];
	if (turn === undefined) throw new Error("no Turn was published");
	return turn;
}

/** Asserts one run's endpoint served exactly its own Codex Turns, and nothing else. */
function expectOnlyModelRequests(run: DockRun, count: number): void {
	expect(run.capture.requests()).toHaveLength(count);
	expect(run.capture.requests().every(request => request.url.includes("/codex/responses"))).toBe(true);
	// The account query is answered by the fixture's own transport, so it never reaches this endpoint;
	// the balance query is not asked either, because no request of its provider settles here.
	expect(run.capture.arrivals()).not.toContain("balance");
	expect(accountQueries(run).every(query => query.url === ACCOUNT_URL)).toBe(true);
}

/** The account query's own shape, as every call of every run states it. */
function expectAccountQueryShape(query: RecordedAccountQuery): void {
	expect(query.url).toBe(ACCOUNT_URL);
	expect(query.method).toBe("GET");
	expect(query.proxy).toBe(ACCOUNT_PROXY);
	expect(query.timeoutMs).toBe(ACCOUNT_TIMEOUT_MS);
	expect(query.headers.authorization).toBe(`Bearer ${ACCOUNT_TOKEN}`);
	expect(query.headers["chatgpt-account-id"]).toBe(ACCOUNT_ID);
}

describe("the account query's own windows in a real Codex Turn (P39, P65; S5)", () => {
	test("a settled Turn's query moves the windows, and the response's own headers change nothing", async () => {
		const at = Date.now();
		// Three answers scripted by this file's own literals: the startup query states both windows,
		// the first settled Turn's query states both again with the five-hour one up 60 points and the
		// weekly one up 10, and the second Turn's query states the five-hour window alone.
		const startup: ScriptedWindow = { usedPercent: 10, resetInMs: 2 * HOUR_MS };
		const startupWeekly: ScriptedWindow = { usedPercent: 20, resetInMs: 2 * DAY_MS };
		const refreshed: ScriptedWindow = { usedPercent: 70, resetInMs: 2 * HOUR_MS };
		const refreshedWeekly: ScriptedWindow = { usedPercent: 30, resetInMs: 2 * DAY_MS };
		const single: ScriptedWindow = { usedPercent: 45, resetInMs: 2 * HOUR_MS };
		// The response's own facts: values no account answer of this run states, so a window that moved
		// to them would be a window this file could see.
		const headerFiveHour: ScriptedWindow = { usedPercent: 99.5, resetInMs: 3 * HOUR_MS };
		const headerWeekly: ScriptedWindow = { usedPercent: 88, resetInMs: 3 * DAY_MS };
		const headers = reportHeaders(at, headerFiveHour, headerWeekly);
		const run = await startRun("model-cost-codex-quota", {
			harness: patchedHarness,
			ttlMs: PROMPT_TTL_MS,
			answers: {
				1: { document: accountDocument(at, startup, startupWeekly) },
				2: { document: accountDocument(at, refreshed, refreshedWeekly) },
				3: { document: accountDocument(at, single) },
			},
			responseHeaders: () => headers,
		});
		try {
			expect((await run.session.prompt("one codex exchange")).status).toBe("completed");
			expectOnlyModelRequests(run, 1);

			// The query a settled Codex Turn triggers is the initialization's own: the contract's
			// address, a GET, the named `codex` proxy, the 10-second budget, and the headers this
			// extension built from the run's credential.
			const asked = await accountQueriesReaching(run, 2);
			expect(asked.map(query => query.index)).toEqual([1, 2]);
			for (const query of asked) expectAccountQueryShape(query);

			// The host's half: the patched transport published the response's own boundary, so the
			// runtime really was handed the headers that must change nothing.
			const turn = onlyTurn(run.session);
			expect(turn.provider).toBe(PROVIDER);
			expect(turn.outcome).toBe("completed");
			expect(turn.hasHttpFacts).toBe(true);
			for (const name of Object.keys(headers)) expect(turn.headerNames).toContain(name);

			// The extension's half: the reading is the account answer's own windows, identified by the
			// lengths it stated rather than by the position they arrived in, with its reset instants.
			const after = await lastQuota(
				run.session,
				reading => reading.fiveHour?.usedPercent === refreshed.usedPercent,
				"the first refreshed reading",
			);
			expect(after.fiveHour?.resetsAt).toBe(resetsAtMs(at, refreshed.resetInMs));
			expect(after.fiveHour?.resetState).toBe("valid");
			expect(after.fiveHour?.obtainedAt).toBeGreaterThanOrEqual(at);
			expect(after.weekly?.usedPercent).toBe(refreshedWeekly.usedPercent);
			expect(after.weekly?.resetsAt).toBe(resetsAtMs(at, refreshedWeekly.resetInMs));
			expect(after.weekly?.resetState).toBe("valid");
			// No reading this run ever published carried the headers' values, and the attempt that
			// answered leaves no failure beside the windows.
			const percents = publishedPercents(run.session);
			expect(percents.has(headerFiveHour.usedPercent)).toBe(false);
			expect(percents.has(headerWeekly.usedPercent)).toBe(false);
			expect(after.failure).toBeUndefined();

			// The second settled Turn refreshes again — the first answer has outlived the TTL — and the
			// answer to its query states one window only.
			expect((await run.session.prompt("a second codex exchange")).status).toBe("completed");
			expectOnlyModelRequests(run, 2);
			const askedAgain = await accountQueriesReaching(run, 3);
			expect(askedAgain.map(query => query.index)).toEqual([1, 2, 3]);
			expect(askedAgain.every(query => query.proxy === ACCOUNT_PROXY)).toBe(true);

			const final = await lastQuota(
				run.session,
				reading => reading.fiveHour?.usedPercent === single.usedPercent,
				"the five-hour-only answer",
			);
			// The window the answer states is its own, at the instant it stated...
			expect(final.fiveHour?.resetsAt).toBe(resetsAtMs(at, single.resetInMs));
			expect(final.fiveHour?.resetState).toBe("valid");
			expect(final.fiveHour?.obtainedAt).toBeGreaterThan(after.fiveHour?.obtainedAt ?? 0);
			// ...while the window it does not state is the same reading it was, instant included: an
			// absent window is not cleared, defaulted, zeroed or re-timed.
			expect(final.weekly).toEqual(after.weekly);
			// The number of queries is exactly what the initialization and the two settled Turns asked:
			// nothing polls, nothing queries on the TTL's expiry alone, and no Switch or Round edge asks.
			expect(accountQueries(run)).toHaveLength(3);
			expect(linesWith<PublishedTurn>(run.session, CODEX_QUOTA_TURN_LINE)).toHaveLength(2);

			// The measurement the same answers drove, in this file's own arithmetic: the startup answer
			// anchored it at (10, 20), the first Turn's answer qualified it — the five-hour window moved
			// up 60 points and the weekly one 10, so the ratio is 60 / 10 = 6 and the remaining weekly
			// budget is (100 − 30) / 100 × 6 = 4.2 — and the one-window answer paired nothing.
			const readings = linesWith<PublishedEstimate | null>(run.session, CODEX_QUOTA_ESTIMATE_LINE).filter(
				(entry): entry is PublishedEstimate => entry !== null,
			);
			expect(readings[0]?.text).toBe("estimating…");
			expect(new Set(readings.map(reading => reading.text))).toEqual(
				new Set(["estimating…", "left≈4.2×5h · ratio≈6.0"]),
			);
			const sampled = readings.find(reading => reading.ratio !== undefined);
			expect(sampled?.ratio).toBe(6);
			expect(sampled?.left).toBeCloseTo(4.2, 10);
			expect(readings[readings.length - 1]?.ratio).toBe(6);
		} finally {
			await disposeRun(run);
		}
	}, 300_000);

	test("with no response boundary at all, the same Turn still moves the windows", async () => {
		// The unpatched install: the Turn settles, but no HTTP facts reach the extension at all.
		const at = Date.now();
		const startup: ScriptedWindow = { usedPercent: 10, resetInMs: 2 * HOUR_MS };
		const startupWeekly: ScriptedWindow = { usedPercent: 20, resetInMs: 2 * DAY_MS };
		const refreshed: ScriptedWindow = { usedPercent: 45, resetInMs: 2 * HOUR_MS };
		const refreshedWeekly: ScriptedWindow = { usedPercent: 25, resetInMs: 2 * DAY_MS };
		const headers = reportHeaders(at, { usedPercent: 99.5, resetInMs: 3 * HOUR_MS }, { usedPercent: 88, resetInMs: 3 * DAY_MS });
		const run = await startRun("model-cost-codex-quota-baseline", {
			harness: baselineHarness,
			ttlMs: PROMPT_TTL_MS,
			answers: {
				1: { document: accountDocument(at, startup, startupWeekly) },
				2: { document: accountDocument(at, refreshed, refreshedWeekly) },
			},
			// The endpoint states the windows anyway: the host version publishes no boundary, and the
			// headers it does send reach nothing.
			responseHeaders: () => headers,
		});
		try {
			expect((await run.session.prompt("one codex exchange")).status).toBe("completed");
			expectOnlyModelRequests(run, 1);

			const turn = onlyTurn(run.session);
			expect(turn.outcome).toBe("completed");
			expect(turn.hasHttpFacts).toBe(false);
			expect(turn.headerNames).toEqual([]);
			expect(turn.unavailable).toContain("HTTP response facts");

			// The windows moved to the account answer all the same: the refresh is the settled Turn's
			// trigger, not the response boundary the host version does or does not publish.
			const reading = await lastQuota(
				run.session,
				candidate => candidate.fiveHour?.usedPercent === refreshed.usedPercent,
				"the refreshed reading",
			);
			expect(reading.weekly?.usedPercent).toBe(refreshedWeekly.usedPercent);
			expect(reading.fiveHour?.resetsAt).toBe(resetsAtMs(at, refreshed.resetInMs));
			expect(reading.weekly?.resetsAt).toBe(resetsAtMs(at, refreshedWeekly.resetInMs));
			expect(reading.failure).toBeUndefined();
			expect(await accountQueriesReaching(run, 2)).toHaveLength(2);
		} finally {
			await disposeRun(run);
		}
	}, 300_000);
});

describe("the success TTL and the one query in flight (P39; S5)", () => {
	test("a reading inside the TTL keeps the next settled Turn from asking again", async () => {
		// Two prompts, one run: the startup answer is the only reading the runtime ever has, and its
		// TTL outlives the whole run — so no settled Turn may ask the account API anything.
		const at = Date.now();
		const startup: ScriptedWindow = { usedPercent: 10, resetInMs: 2 * HOUR_MS };
		const startupWeekly: ScriptedWindow = { usedPercent: 20, resetInMs: 2 * DAY_MS };
		const never: ScriptedWindow = { usedPercent: 70, resetInMs: 2 * HOUR_MS };
		const neverWeekly: ScriptedWindow = { usedPercent: 30, resetInMs: 2 * DAY_MS };
		const headers = reportHeaders(at, { usedPercent: 99.5, resetInMs: 3 * HOUR_MS }, { usedPercent: 88, resetInMs: 3 * DAY_MS });
		const run = await startRun("model-cost-codex-quota-ttl", {
			harness: patchedHarness,
			ttlMs: PATIENT_TTL_MS,
			answers: {
				1: { document: accountDocument(at, startup, startupWeekly) },
				2: { document: accountDocument(at, never, neverWeekly) },
			},
			responseHeaders: () => headers,
		});
		try {
			for (const prompt of ["first codex exchange", "second codex exchange"]) {
				expect((await run.session.prompt(prompt)).status).toBe("completed");
			}
			expectOnlyModelRequests(run, 2);

			// Both Turns settled, each with the response's own headers in hand — and the reading is still
			// the startup answer's, from the one query this run ever made.
			const turns = linesWith<PublishedTurn>(run.session, CODEX_QUOTA_TURN_LINE);
			expect(turns).toHaveLength(2);
			expect(turns.every(turn => turn.hasHttpFacts)).toBe(true);
			const reading = await lastQuota(
				run.session,
				candidate => candidate.fiveHour?.usedPercent === startup.usedPercent,
				"the startup reading",
			);
			expect(reading.weekly?.usedPercent).toBe(startupWeekly.usedPercent);
			expect(reading.fiveHour?.resetsAt).toBe(resetsAtMs(at, startup.resetInMs));
			// A window the query never states — the answer scripted for a second query this run must not
			// make — was never published, and the one query's record is the only one there is.
			expect(publishedPercents(run.session).has(never.usedPercent)).toBe(false);
			expect(accountQueries(run)).toHaveLength(1);
			expectAccountQueryShape(accountQueries(run)[0] as RecordedAccountQuery);
		} finally {
			await disposeRun(run);
		}
	}, 300_000);

	test("a Turn that arrives while a query is still out joins it instead of asking again", async () => {
		// The startup query answers at once; the first settled Turn's query is held — the transport has
		// been called and no answer has been given — so the second Turn provably arrives while it is out.
		const at = Date.now();
		const startup: ScriptedWindow = { usedPercent: 10, resetInMs: 2 * HOUR_MS };
		const startupWeekly: ScriptedWindow = { usedPercent: 20, resetInMs: 2 * DAY_MS };
		const held: ScriptedWindow = { usedPercent: 70, resetInMs: 2 * HOUR_MS };
		const heldWeekly: ScriptedWindow = { usedPercent: 30, resetInMs: 2 * DAY_MS };
		const after: ScriptedWindow = { usedPercent: 45, resetInMs: 2 * HOUR_MS };
		const afterWeekly: ScriptedWindow = { usedPercent: 25, resetInMs: 2 * DAY_MS };
		const headers = reportHeaders(at, { usedPercent: 99.5, resetInMs: 3 * HOUR_MS }, { usedPercent: 88, resetInMs: 3 * DAY_MS });
		const run = await startRun("model-cost-codex-quota-join", {
			harness: patchedHarness,
			ttlMs: PROMPT_TTL_MS,
			answers: {
				1: { document: accountDocument(at, startup, startupWeekly) },
				2: { document: accountDocument(at, held, heldWeekly), hold: true },
				3: { document: accountDocument(at, after, afterWeekly) },
			},
			responseHeaders: () => headers,
		});
		try {
			expect((await run.session.prompt("one codex exchange")).status).toBe("completed");
			expectOnlyModelRequests(run, 1);

			// The first settled Turn's query is out and unanswered: the call is recorded, and no window
			// the held answer states has been published.
			const outstanding = await accountQueriesReaching(run, 2);
			expect(outstanding.map(query => query.index)).toEqual([1, 2]);
			expect(publishedPercents(run.session).has(held.usedPercent)).toBe(false);

			// The second Turn settles while that query is still out. Its check is due — the reading held
			// is the startup answer, older than the TTL — and the policy joins the outstanding query: the
			// call record still holds the two calls, and the answer the held call eventually gives is
			// what both Turns are answered by.
			expect((await run.session.prompt("a second codex exchange")).status).toBe("completed");
			expectOnlyModelRequests(run, 2);
			releaseAccountQueries(run.accountDir);
			const joined = await lastQuota(
				run.session,
				candidate => candidate.fiveHour?.usedPercent === held.usedPercent,
				"the held answer's reading",
			);
			expect(joined.weekly?.usedPercent).toBe(heldWeekly.usedPercent);
			expect(joined.fiveHour?.resetsAt).toBe(resetsAtMs(at, held.resetInMs));
			expect(accountQueries(run)).toHaveLength(2);
			expect(linesWith<PublishedTurn>(run.session, CODEX_QUOTA_TURN_LINE)).toHaveLength(2);

			// The next settled Turn is a new trigger: the joined answer has outlived the TTL, so the
			// policy asks again, and the third query is answered with its own windows.
			expect((await run.session.prompt("a third codex exchange")).status).toBe("completed");
			expectOnlyModelRequests(run, 3);
			const asked = await accountQueriesReaching(run, 3);
			expect(asked.map(query => query.index)).toEqual([1, 2, 3]);
			const final = await lastQuota(
				run.session,
				candidate => candidate.fiveHour?.usedPercent === after.usedPercent,
				"the third answer's reading",
			);
			expect(final.weekly?.usedPercent).toBe(afterWeekly.usedPercent);
			expect(final.fiveHour?.resetsAt).toBe(resetsAtMs(at, after.resetInMs));
			expect(accountQueries(run)).toHaveLength(3);
		} finally {
			await disposeRun(run);
		}
	}, 300_000);
});
