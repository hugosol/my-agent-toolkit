/**
 * The Codex allowance windows in a running harness (P39, P65; S5).
 *
 * This is the isolated real-host smoke of both halves of the wiring: the dock materialises the
 * recorded baseline install **with this ticket's Codex response-boundary patch applied**
 * (`codex-response-harness.ts`), loads this repository's own model-cost runtime through the harness's
 * real loader (through the fixture in `fixtures/codex-quota`, which binds the production definition
 * and runtime and adds only observation lines), and drives real sessions in an isolated home whose
 * storage root the extension's own shipped `config.yaml` names. The session's built-in
 * `openai-codex` provider is redirected — through the isolated agent state, before any extension
 * loads — at the dock's capture endpoint, so every Turn these runs produce is a real one: a real
 * request the harness serialized, and a real response the endpoint answered with this fixture's own
 * scripted `x-codex-*` rate-limit headers.
 *
 * What these runs establish:
 *
 * - the host's half: the Codex transport publishes the response boundary it holds, so a settled Turn
 *   carries the response's own headers instead of `unavailable: ["HTTP response facts"]`. The
 *   unpatched baseline install runs the same scripted response in this suite as the control that the
 *   boundary comes from the patch, not from the host version.
 * - the extension's half: the runtime reads those facts and nothing else at runtime — one report's
 *   headers update the windows they identify, a report that omits a window leaves that window's value
 *   and instant as they were, no Turn triggers a second account query, and two reports feed the ratio
 *   measurement the same production chain holds.
 *
 * What these runs do **not** establish: a real Codex account's allowance. The windows are the
 * endpoint's scripted literals, the credential is the isolated run's own fixture token, and the
 * account API is deliberately left unconfigured — the fixture points the framework's shared-file
 * read at a path with no file, so this holds whatever the machine's own `framework/config.yaml`
 * carries — so the one startup attempt is refused by configuration and never leaves the process,
 * which is the approved behaviour for a named selection with no configuration.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { writeAgentSettings, writeProviderOverride } from "./agent-config";
import { type IsolatedHarness, ensureIsolatedHarness, readBaselineRecord } from "./baseline";
import { type CaptureServer, type CapturedRequest, startCaptureServer } from "./capture-server";
import { ensureCodexResponseHarness } from "./codex-response-harness";
import { CODEX_QUOTA_ESTIMATE_LINE, CODEX_QUOTA_LINE, CODEX_QUOTA_TURN_LINE } from "./fixtures/codex-quota/entrypoint";
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
/** The window lengths the Codex backend reports, in the unit its headers state them. */
const FIVE_HOUR_MINUTES = 300;
const WEEKLY_MINUTES = 10_080;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * A JWT-shaped credential whose claim names a ChatGPT account.
 *
 * The Codex provider reads the account id out of the token before it builds a request, exactly as it
 * does for a real login credential, so the token these runs authenticate with has to carry one. The
 * extension's own account query formats the same account id into its headers from this same token
 * (the permanent seam cases assert that); here the token's only job is to let the session run.
 */
const ACCOUNT_ID = "acct-dock-13";

/** A report's own window: the percentage the backend states and how far ahead its reset sits. */
interface ScriptedWindow {
	readonly usedPercent: number;
	readonly resetInMs: number;
}

/**
 * The reset instant one window's header states — an absolute epoch instant in seconds — as the
 * extension's parser reads it back: the protocol states whole seconds, so the instant the reading
 * carries is the stated second in milliseconds.
 */
function resetAtEpochMs(at: number, offsetMs: number): number {
	return Math.floor((at + offsetMs) / 1000) * 1000;
}

/**
 * One report's headers: both windows of one response, in the Codex backend's own names and units —
 * minutes for a window's length, an absolute epoch instant in seconds for its reset.
 */
function reportHeaders(at: number, fiveHour: ScriptedWindow, weekly: ScriptedWindow): Record<string, string> {
	return {
		"x-codex-primary-used-percent": String(fiveHour.usedPercent),
		"x-codex-primary-window-minutes": String(FIVE_HOUR_MINUTES),
		"x-codex-primary-reset-at": String(resetAtEpochMs(at, fiveHour.resetInMs) / 1000),
		"x-codex-secondary-used-percent": String(weekly.usedPercent),
		"x-codex-secondary-window-minutes": String(WEEKLY_MINUTES),
		"x-codex-secondary-reset-at": String(resetAtEpochMs(at, weekly.resetInMs) / 1000),
	};
}

function codexProbeToken(accountId: string): string {
	const claims = Buffer.from(
		JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: accountId } }),
		"utf8",
	).toBase64();
	return `aaa.${claims}.bbb`;
}

let patchedHarness: IsolatedHarness;
let baselineHarness: IsolatedHarness;

beforeAll(async () => {
	patchedHarness = await ensureCodexResponseHarness(record);
	// The control: the same version without the patch, so the boundary the patched runs observe is
	// attributable to the change and not to the install.
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

/** One provisioned run: the session, the capture endpoint behind it and the isolated root. */
interface DockRun {
	readonly session: ControlledSession;
	readonly capture: CaptureServer;
	readonly runRoot: RunRoot;
}

/** Which host one run executes, and the response headers its endpoint answers with, per request. */
interface RunScript {
	readonly harness: IsolatedHarness;
	readonly responseHeaders: (request: CapturedRequest) => Record<string, string>;
}

/** One run whose built-in Codex provider answers from the capture endpoint, with scripted headers. */
async function startRun(label: string, script: RunScript): Promise<DockRun> {
	const runRoot = createRunRoot(label);
	const home = isolateHome(runRoot);
	const capture = startCaptureServer({
		dir: runRoot.captureDir,
		replyText: "dock codex quota reply",
		usage: { input: 10, output: 7, cacheRead: 3 },
		responseHeaders: script.responseHeaders,
	});
	writeProviderOverride(runRoot.agentDir, PROVIDER, {
		baseUrl: capture.baseUrl,
		apiKey: codexProbeToken(ACCOUNT_ID),
	});
	// The catalog model prefers websockets; the response these runs must observe is a real HTTP one, so
	// each run pins the SSE transport, exactly as the repository's other Codex-path smokes do.
	writeAgentSettings(runRoot.agentDir, { "providers.openaiWebsockets": "off" });
	try {
		const session = await ControlledSession.start({
			harness: script.harness,
			runRoot,
			extensions: [CODEX_QUOTA_ENTRYPOINT],
			model: MODEL_SELECTOR,
			env: home.env,
			promptTimeoutMs: 120_000,
		});
		return { session, capture, runRoot };
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

/** The one settled Turn a run published, asserting there is exactly one. */
function onlyTurn(session: ControlledSession): PublishedTurn {
	const turns = linesWith<PublishedTurn>(session, CODEX_QUOTA_TURN_LINE);
	expect(turns).toHaveLength(1);
	const turn = turns[0];
	if (turn === undefined) throw new Error("no Turn was published");
	return turn;
}

/** Every request a run's endpoint answered, asserting none of them was an account query. */
function assertOnlyModelRequests(run: DockRun): void {
	expect(run.capture.requests().every(request => request.url.includes("/codex/responses"))).toBe(true);
	expect(run.session.stderr()).not.toContain("/wham/usage");
	expect(run.session.stderr()).not.toContain("/user/balance");
}

describe("a real Codex Turn's response headers on the patched baseline (P39; S5)", () => {
	test("the host publishes the response's own headers, and the windows come from them", async () => {
		// This file's own literal values, in the protocol's own names and units: the only header values
		// in play are the ones the endpoint was scripted with here.
		const at = Date.now();
		const fiveHour: ScriptedWindow = { usedPercent: 12.5, resetInMs: 2 * HOUR_MS };
		const weekly: ScriptedWindow = { usedPercent: 60, resetInMs: 2 * DAY_MS };
		const headers = reportHeaders(at, fiveHour, weekly);
		const run = await startRun("model-cost-codex-quota", { harness: patchedHarness, responseHeaders: () => headers });
		try {
			expect((await run.session.prompt("one codex exchange")).status).toBe("completed");
			// The endpoint served exactly the one model request the session made: nothing was asked of
			// the account API before it, beside it or after it.
			expect(run.capture.requests()).toHaveLength(1);
			assertOnlyModelRequests(run);

			// The host's half: one settled Codex Turn whose facts carry the response's own headers.
			const turn = onlyTurn(run.session);
			expect(turn.provider).toBe(PROVIDER);
			expect(turn.outcome).toBe("completed");
			expect(turn.hasHttpFacts).toBe(true);
			for (const name of Object.keys(headers)) expect(turn.headerNames).toContain(name);
			expect(turn.unavailable).not.toContain("HTTP response facts");

			// The extension's half: each window equals what the endpoint reported, identified by the
			// length it reported rather than by the position it arrived in.
			const published = linesWith<PublishedQuota>(run.session, CODEX_QUOTA_LINE);
			const last = published[published.length - 1];
			expect(last?.fiveHour?.usedPercent).toBe(fiveHour.usedPercent);
			expect(last?.fiveHour?.resetsAt).toBe(resetAtEpochMs(at, fiveHour.resetInMs));
			expect(last?.fiveHour?.resetState).toBe("valid");
			expect(last?.fiveHour?.obtainedAt).toBeGreaterThanOrEqual(at);
			expect(last?.weekly?.usedPercent).toBe(weekly.usedPercent);
			expect(last?.weekly?.resetsAt).toBe(resetAtEpochMs(at, weekly.resetInMs));
			expect(last?.weekly?.resetState).toBe("valid");

			// The one startup attempt settled as the configuration refusal the fixture supplies: the
			// named `codex` proxy entry resolves against a file with none, so no request left the
			// process — and that refusal sits beside the readings instead of becoming a window.
			expect(last?.failure?.detail).toBe("misconfigured");
		} finally {
			await disposeRun(run);
		}
	}, 300_000);

	test("the unpatched baseline publishes no boundary: the patch is what makes the facts reachable", async () => {
		const at = Date.now();
		const headers = reportHeaders(
			at,
			{ usedPercent: 12.5, resetInMs: 2 * HOUR_MS },
			{ usedPercent: 60, resetInMs: 2 * DAY_MS },
		);
		const run = await startRun("model-cost-codex-quota-baseline", {
			harness: baselineHarness,
			responseHeaders: () => headers,
		});
		try {
			expect((await run.session.prompt("one codex exchange")).status).toBe("completed");
			const turn = onlyTurn(run.session);
			expect(turn.outcome).toBe("completed");
			expect(turn.hasHttpFacts).toBe(false);
			expect(turn.headerNames).toEqual([]);
			expect(turn.unavailable).toContain("HTTP response facts");

			// The endpoint stated both windows and the runtime had nothing to read them from: no window
			// is invented, and nothing is reported as a zero.
			const published = linesWith<PublishedQuota>(run.session, CODEX_QUOTA_LINE);
			expect(published.filter(entry => entry.fiveHour !== undefined || entry.weekly !== undefined)).toEqual([]);
			expect(published[published.length - 1]?.failure?.detail).toBe("misconfigured");
		} finally {
			await disposeRun(run);
		}
	}, 300_000);
});

describe("the windows a report updates at runtime (P65; S5)", () => {
	test("reports update the windows they identify, and two of them drive the ratio measurement", async () => {
		const at = Date.now();
		// Three reports through one session, each answer scripted by this file's own literals:
		// A states both windows, B states both windows with the five-hour one moved up 60 points and
		// the weekly one up 10, and C states only the five-hour window.
		const reportA = reportHeaders(
			at,
			{ usedPercent: 10, resetInMs: 2 * HOUR_MS },
			{ usedPercent: 20, resetInMs: 2 * DAY_MS },
		);
		const reportB = reportHeaders(
			at,
			{ usedPercent: 70, resetInMs: 2 * HOUR_MS },
			{ usedPercent: 30, resetInMs: 2 * DAY_MS },
		);
		const reportC: Record<string, string> = {
			"x-codex-primary-used-percent": "45",
			"x-codex-primary-window-minutes": String(FIVE_HOUR_MINUTES),
			"x-codex-primary-reset-at": String(resetAtEpochMs(at, 2 * HOUR_MS) / 1000),
		};
		const byRequest: Record<number, Record<string, string>> = { 1: reportA, 2: reportB, 3: reportC };
		const run = await startRun("model-cost-codex-quota-reports", {
			harness: patchedHarness,
			responseHeaders: request => byRequest[request.index] ?? reportC,
		});
		try {
			for (const prompt of ["first codex exchange", "second codex exchange", "third codex exchange"]) {
				expect((await run.session.prompt(prompt)).status).toBe("completed");
			}
			// Three Turns, three model requests: a Turn is not a trigger for the one startup attempt, and
			// no Turn asks the account API anything on its own.
			expect(run.capture.requests()).toHaveLength(3);
			assertOnlyModelRequests(run);

			const turns = linesWith<PublishedTurn>(run.session, CODEX_QUOTA_TURN_LINE);
			expect(turns).toHaveLength(3);
			expect(turns.every(turn => turn.hasHttpFacts)).toBe(true);
			expect(turns.every(turn => turn.provider === PROVIDER)).toBe(true);

			const published = linesWith<PublishedQuota>(run.session, CODEX_QUOTA_LINE);
			// Each two-window report sets both windows to its own values.
			const afterA = published.find(entry => entry.fiveHour?.usedPercent === 10);
			const afterB = published.find(entry => entry.fiveHour?.usedPercent === 70);
			expect(afterA?.weekly?.usedPercent).toBe(20);
			expect(afterB?.weekly?.usedPercent).toBe(30);

			// The report that states one window updates that window alone, at the instant it was
			// accepted...
			const afterC = published[published.length - 1];
			expect(afterC?.fiveHour?.usedPercent).toBe(45);
			expect(afterC?.fiveHour?.obtainedAt).toBeGreaterThan(afterB?.fiveHour?.obtainedAt ?? 0);
			// ... while the window it does not mention is the same reading it was, instant included: an
			// absent window is not cleared, defaulted, zeroed or re-timed.
			expect(afterC?.weekly).toEqual(afterB?.weekly);

			// Two real reports drove the measurement the same production chain holds: A anchors it with
			// nothing to sample, B qualifies this file's own arithmetic — the five-hour window moved up
			// 60 points and the weekly one 10, so the ratio is 60 / 10 = 6 and the remaining weekly
			// budget is (100 - 30) / 100 × 6 — and C, carrying one window, neither pairs nor changes it.
			// A redraw may repeat a reading, so the assertions are about which readings ever appeared and
			// about the first and last of them, never about one position in the sequence.
			const readings = linesWith<PublishedEstimate | null>(run.session, CODEX_QUOTA_ESTIMATE_LINE).filter(
				(entry): entry is PublishedEstimate => entry !== null,
			);
			expect(new Set(readings.map(entry => entry.text))).toEqual(
				new Set(["estimating…", "left≈4.2×5h · ratio≈6.0"]),
			);
			// The first reading is the one a single report leaves behind: it has learned nothing yet.
			expect(readings[0]?.text).toBe("estimating…");
			const sampled = readings.find(entry => entry.ratio !== undefined);
			expect(sampled?.ratio).toBe(6);
			expect(sampled?.left).toBeCloseTo(4.2, 10);
			expect(sampled?.text).toBe("left≈4.2×5h · ratio≈6.0");
			// The one-window report at the end samples nothing new and withdraws nothing.
			expect(readings[readings.length - 1]?.ratio).toBe(6);
		} finally {
			await disposeRun(run);
		}
	}, 300_000);
});
