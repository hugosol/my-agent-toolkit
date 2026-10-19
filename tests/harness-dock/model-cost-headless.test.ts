/**
 * model-cost in a headless run of the real harness (P42, P43, P69; S5).
 *
 * The dock materialises the recorded baseline install and drives this repository's own model-cost
 * entrypoint through the harness's real loader with `--no-ui`, which is the one difference from its
 * other model-cost runs: the harness resolves `hasUI: false` for this session's extensions and
 * emits no UI frames of its own, so this run's operator channel is the process's stderr rather than
 * a notification frame on stdout. The session's built-in `deepseek` provider is redirected — through
 * the isolated agent state, before any extension loads — at the dock's capture endpoint, so the
 * model requests, the usage they settle with and the extension's own balance query are all real
 * traffic that never leaves the machine, and the extension's storage root is the shipped
 * `~/cost-archive` resolved against this run's isolated user home.
 *
 * What these runs establish, and where each fact comes from:
 *
 * - **P42**: a headless session observes the same requests, accounts them with the same usage and
 *   saves the same document a UI session does — the amounts below are this file's own arithmetic on
 *   the endpoint's scripted reading and the extension's maintained off-peak flash prices — while
 *   creating no widget and drawing nothing. Its two provider sources are still asked at
 *   initialization, and a settled request still begins the query a failed reading calls for.
 * - **P43**: a provider query that failed, and a consumption baseline that could not be read, are
 *   both on stderr at their own severities, once each; a command's own result and the framework's
 *   refusal of an unrecognized argument are there too; and none of it is hidden by how many
 *   extensions this run loaded.
 * - **P69**: every line this run writes to stdout is one protocol frame the dock parses, no
 *   non-protocol text is interleaved with them, and a business error does not stop the session: the
 *   next request still completes. The session's own log and the outbound request bodies carry none
 *   of the feedback text.
 *
 * What these runs do **not** establish: any real DeepSeek account's balance (the endpoint's answer
 * is this fixture's own document), a real model's usage, or the visual form of the widget — that
 * last one needs a UI, which is exactly what this suite takes away. The permanent, controlled-time
 * cases for the balance TTL and the failure semantics are `tests/model-cost/provider-balance.test.ts`
 * and `tests/model-cost/headless-feedback.test.ts` (S2); what this file adds is that the same
 * behavior holds for real requests of the real harness with no UI anywhere in the process.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { type IsolatedHarness, REPO_ROOT, ensureIsolatedHarness, readBaselineRecord } from "./baseline";
import { type CaptureServer, startCaptureServer } from "./capture-server";
import { writeAgentSettings, writeProviderOverride } from "./agent-config";
import {
	CODEX_QUOTA_ESTIMATE_LINE,
	CODEX_QUOTA_LINE,
	CODEX_QUOTA_SCRIPT_DIR_ENV,
	CODEX_QUOTA_TTL_MS_ENV,
	CODEX_QUOTA_TURN_LINE,
	recordedAccountQueries,
	writeAccountAnswer,
} from "./fixtures/codex-quota/entrypoint";
import { type RunRoot, createRunRoot } from "./run-root";
import { ControlledSession, type RpcFrame } from "./session";

const record = readBaselineRecord();
/** The extension's own OMP entrypoint, as the harness's loader discovers it. */
const MODEL_COST_ENTRYPOINT = path.join(REPO_ROOT, "entrypoints", "omp", "model-cost.ts");
/** A second extension for the case that asks whether another one's presence hides a notice. */
const SECOND_EXTENSION = path.join(import.meta.dir, "fixtures", "second-extension", "entrypoint.ts");
/** The document the extension keeps in its storage root. */
const CONSUMPTION_FILE = "consumption.json";

/** The usage the capture endpoint reports for every exchange, as the wire numbers it sends. */
const CAPTURE_USAGE = { input: 10, output: 7, cacheRead: 3 };

/**
 * The session's own consumption of that one exchange, as this file's arithmetic on what the endpoint
 * reported and the maintained off-peak flash prices (input 1, cacheRead 0.02, output 4 CNY per
 * million tokens) at the holiday period the isolated baseline states.
 *
 * The endpoint reports a prompt of 10 tokens with 3 of them cached, so the buckets this extension
 * stores keep the cached ones apart from the non-cached input: input 7, cacheRead 3, output 7 — and
 * 7/1e6·1 + 3/1e6·0.02 + 7/1e6·4 = 0.00003506 CNY.
 */
const EXCHANGE_TOKENS = { input: 7, cacheRead: 3, cacheWrite: 0, output: 7 };
const EXCHANGE_COST_CNY = 0.00003506;

/** The built-in provider this suite redirects, and the model the session runs. */
const PROVIDER = "deepseek";
const MODEL_SELECTOR = "deepseek/deepseek-flash";
/** The credential the isolated agent state configures for that provider. */
const DOCK_CREDENTIAL = "dock-key";

/** The balance the capture endpoint answers with when a case does not script its own. */
const BALANCE_TOTAL = "110.00";

let harness: IsolatedHarness;

beforeAll(async () => {
	harness = await ensureIsolatedHarness(record);
}, 600_000);

/** One session record of the extension's own consumption document. */
interface SessionRecord {
	readonly id: string;
	readonly name: string;
	readonly parent: string | null;
	readonly saveVersion: number;
	readonly own: Readonly<Record<string, Readonly<Record<string, OwnEntry>>>>;
}

/** One provider/model pair's own accumulation, as the document carries it. */
interface OwnEntry {
	readonly tokens: Readonly<Record<string, number>>;
	readonly costCny?: number;
}

/** The extension's consumption document, as a case reads it back. */
interface ConsumptionDocument {
	readonly schemaVersion: number;
	readonly periodId: string;
	readonly start: string;
	readonly holiday: boolean;
	readonly harnesses: Readonly<Record<string, { readonly sessions: readonly SessionRecord[] }>>;
}

/** One run's isolated home and the storage root the shipped configuration names inside it. */
interface IsolatedHome {
	readonly home: string;
	readonly storageDirectory: string;
	readonly consumptionFile: string;
	readonly env: Record<string, string>;
}

/**
 * The isolated user home one run uses: `<run root>/user-home`, with the OMP home inside it.
 *
 * `baseline` is the exact text the root's consumption document starts as: the case writes its own
 * document so the extension starts on a known period, or a document it cannot read at all.
 */
function isolateHome(runRoot: RunRoot, baseline?: string): IsolatedHome {
	const home = path.join(runRoot.path, "user-home");
	const storageDirectory = path.join(home, ".omp", "cost-archive");
	mkdirSync(storageDirectory, { recursive: true });
	const consumptionFile = path.join(storageDirectory, CONSUMPTION_FILE);
	if (baseline !== undefined) writeFileSync(consumptionFile, baseline, "utf8");
	return {
		home,
		storageDirectory,
		consumptionFile,
		env: {
			USERPROFILE: home,
			HOME: home,
			HOMEDRIVE: path.parse(home).root,
			HOMEPATH: home.slice(path.parse(home).root.length - 1),
		},
	};
}

/** The document one isolated home's root starts with: a known period, in its holiday season. */
function baselineDocument(periodId: string): string {
	return JSON.stringify({
		schemaVersion: 1,
		periodId,
		start: "2026-10-01T00:00:00.000Z",
		holiday: true,
		harnesses: { omp: { sessions: [] } },
	});
}

/** One provisioned run: the session, the capture endpoint behind it and its isolated home. */
interface DockRun {
	readonly session: ControlledSession;
	readonly capture: CaptureServer;
	readonly runRoot: RunRoot;
	readonly home: IsolatedHome;
}

/**
 * One headless run over a fresh isolated root.
 *
 * The run always passes `--no-ui`, so the harness resolves no UI for the extensions of this session
 * and emits no UI frames; everything else is the dock's ordinary isolated session. The extension set
 * defaults to this repository's own model-cost entrypoint alone.
 */
async function startHeadlessRun(
	label: string,
	options: {
		readonly balance?: Parameters<typeof startCaptureServer>[0]["balance"];
		readonly baseline?: string;
		readonly extensions?: readonly string[];
	} = {},
): Promise<DockRun> {
	const runRoot = createRunRoot(label);
	const home = isolateHome(runRoot, options.baseline ?? baselineDocument(`period-${label}`));
	const capture = startCaptureServer({
		dir: runRoot.captureDir,
		replyText: "dock headless reply",
		usage: CAPTURE_USAGE,
		balance: options.balance ?? { total: BALANCE_TOTAL },
	});
	writeProviderOverride(runRoot.agentDir, PROVIDER, { baseUrl: capture.baseUrl, apiKey: DOCK_CREDENTIAL });
	try {
		const session = await ControlledSession.start({
			harness,
			runRoot,
			extensions: options.extensions ?? [MODEL_COST_ENTRYPOINT],
			model: MODEL_SELECTOR,
			env: home.env,
			extraArgs: ["--no-ui"],
			promptTimeoutMs: 120_000,
		});
		return { session, capture, runRoot, home };
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

/** The stdout lines this run emitted that were not protocol frames the dock could parse. */
function protocolFaults(session: ControlledSession): RpcFrame[] {
	return session.frames().filter(frame => frame.type === "<unparsable>");
}

/** The UI frames this run emitted: a headless run must emit none at all. */
function uiFrames(session: ControlledSession): RpcFrame[] {
	return session.frames().filter(frame => frame.type === "extension_ui_request");
}

/** The stderr lines this run produced that carry `text`, in the order the process wrote them. */
function stderrLines(session: ControlledSession, text: string): string[] {
	return session.stderr()
		.split("\n")
		.filter(line => line.includes(text));
}

/** Lets the event loop turn over until nothing already queued is left. */
async function queuedWorkSettled(): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>();
	setImmediate(resolve);
	await promise;
}

/** The document the run's own storage root holds right now, or `undefined` while it holds none. */
function readDocument(run: DockRun): ConsumptionDocument | undefined {
	try {
		return JSON.parse(readFileSync(run.home.consumptionFile, "utf8")) as ConsumptionDocument;
	} catch {
		return undefined;
	}
}

/** Every session record a document holds, whichever harness bucket it sits under. */
function sessionsOf(document: ConsumptionDocument): SessionRecord[] {
	return Object.values(document.harnesses).flatMap(bucket => [...bucket.sessions]);
}

/**
 * Waits until this run's own document holds what a case expects of it, and answers with it.
 *
 * A Round's end save is dispatched without the framework waiting for the promise it returns, so the
 * write lands a few event-loop turns after the exchange completes. The wait is on the document's
 * content rather than on a duration, and the deadline only keeps a write that never happened from
 * hanging the case.
 */
async function savedDocument(
	run: DockRun,
	accept: (document: ConsumptionDocument) => boolean,
): Promise<ConsumptionDocument> {
	const deadline = Date.now() + 15_000;
	for (;;) {
		const document = readDocument(run);
		if (document !== undefined && accept(document)) return document;
		if (Date.now() > deadline) {
			// Preserve the last observation before disposeRun removes the isolated run root.
			const observation = {
				document: document ?? null,
				exit: run.session.exited(),
				stderr: run.session.stderr().split(DOCK_CREDENTIAL).join("<REDACTED>"),
				arrivals: run.capture.arrivals(),
			};
			throw new Error(
				`no consumption document the case expects was published in ${run.home.consumptionFile}; ` +
					`last observation: ${JSON.stringify(observation)}`,
			);
		}
		await queuedWorkSettled();
	}
}

describe("a headless session observes, accounts and saves the same way, with no widget at all (P42, P69)", () => {
	test("one session's exchanges are accounted, saved and drawn nowhere, and stdout stays protocol only", async () => {
		const run = await startHeadlessRun("model-cost-headless-happy");
		try {
			expect((await run.session.prompt("one exchange with no UI anywhere")).status).toBe("completed");
			// A second exchange in the same session, which is also what lets the first Round's own end be
			// confirmed and its save land.
			expect((await run.session.prompt("a second exchange in the same session")).status).toBe("completed");

			// P69: every line this run wrote to stdout was a protocol frame the dock parsed, and the
			// session's own UI channel produced nothing at all — no widget, no notification.
			expect(protocolFaults(run.session)).toEqual([]);
			expect(uiFrames(run.session)).toEqual([]);

			// P42's initialization: the extension's own balance query left the process before the first
			// model request did, exactly as it does for a session with a UI.
			expect(run.capture.arrivals()).toEqual(["balance", "model", "model"]);

			// P42's accounting and round-end save: the session's own record is written from the real usage
			// of both exchanges and the amount this file derived from the maintained prices.
			const document = await savedDocument(run, candidate =>
				Object.values(candidate.harnesses)
					.flatMap(bucket => [...bucket.sessions])
					.some(record => record.saveVersion >= 1 && record.own[PROVIDER]?.["deepseek-flash"]?.tokens.input === 14),
			);
			expect(document.schemaVersion).toBe(1);
			expect(document.holiday).toBe(true);
			const saved = sessionsOf(document);
			expect(saved).toHaveLength(1);
			expect(saved[0]?.parent).toBeNull();
			expect(saved[0]?.own[PROVIDER]?.["deepseek-flash"]?.tokens).toEqual({
				input: EXCHANGE_TOKENS.input * 2,
				cacheRead: EXCHANGE_TOKENS.cacheRead * 2,
				cacheWrite: 0,
				output: EXCHANGE_TOKENS.output * 2,
			});
			expect(saved[0]?.own[PROVIDER]?.["deepseek-flash"]?.costCny).toBeCloseTo(EXCHANGE_COST_CNY * 2, 12);

			// A healthy headless run reports nothing: no provider failure, no missing reading, no pause.
			expect(run.session.stderr()).toBe("");
		} finally {
			await disposeRun(run);
		}
	}, 300_000);

	test("the provider refresh a settled request begins still happens with no UI, and does not hold the next request", async () => {
		// The balance endpoint refuses, so no reading is obtained and the next settled request is what
		// begins the second query — which this endpoint then holds open.
		const run = await startHeadlessRun("model-cost-headless-refresh", {
			balance: { total: "0.00", failureStatus: 503, holdFrom: 2 },
		});
		try {
			expect((await run.session.prompt("one exchange while the balance is refused")).status).toBe("completed");

			// The refresh the settled request began really left the process, and the next exchange is
			// issued while it is still unanswered: a headless run keeps the same background scheduling and
			// is not held by it.
			const second = run.session.prompt("one exchange while that query is still out");
			const deadline = Date.now() + 30_000;
			while (run.capture.requests().length < 2 && Date.now() < deadline) await queuedWorkSettled();
			expect(run.capture.balanceCalls()).toHaveLength(2);
			expect((await second).status).toBe("completed");
			expect(run.capture.requests()).toHaveLength(2);

			// One refusal per attempt, on stderr, and nothing of it on stdout, in the session's own log
			// or in what the harness serialized outbound.
			expect(stderrLines(run.session, "余额读取失败（unreadable）")).toHaveLength(1);
			expect(protocolFaults(run.session)).toEqual([]);
			expect(run.session.stderr()).not.toContain("unreachable");
			const surfaces: Record<string, string> = {
				sessionLog: readFileSync(run.session.sessionLog().file, "utf8"),
				modelRequests: run.capture.requests().map(request => request.raw).join("\n"),
			};
			for (const [surface, text] of Object.entries(surfaces)) {
				expect(`${surface}: ${text}`).not.toContain("余额读取失败");
			}
		} finally {
			await disposeRun(run);
		}
	}, 300_000);

	test("a refused balance is visible on stderr and the session goes on issuing requests (P43, P69)", async () => {
		// The prefetch is refused, and the query a settled request then begins is held open: one failed
		// attempt, and a session that is not waiting for the next one either.
		const run = await startHeadlessRun("model-cost-headless-refused", {
			balance: { total: "0.00", failureStatus: 503, holdFrom: 2 },
		});
		try {
			// The first request waits for the initialization, so the refusal is a fact before it is
			// answered — and the exchange still completes: a provider measurement that failed is not a
			// model request that could not be issued.
			expect((await run.session.prompt("one exchange while the balance is refused")).status).toBe("completed");
			expect(stderrLines(run.session, "余额读取失败（unreadable）")).toHaveLength(1);

			// The session goes on: a second request is answered normally, and the protocol it is answered
			// through kept parsing line by line across the error.
			expect((await run.session.prompt("one exchange after the error")).status).toBe("completed");
			expect(run.capture.requests()).toHaveLength(2);
			expect(protocolFaults(run.session)).toEqual([]);
			expect(uiFrames(run.session)).toEqual([]);
			// The same one refusal is what stderr carries, once: the query the settled requests joined was
			// never answered, so there is no second attempt to report. What it states is the sanitized
			// classification, so the credential the query authenticated with is on no line of it.
			expect(stderrLines(run.session, "余额读取失败（unreadable）")).toHaveLength(1);
			expect(run.session.stderr()).not.toContain(DOCK_CREDENTIAL);
			// The consumption the error did not stop is still saved: the same accounting runs either way.
			const document = await savedDocument(
				run,
				candidate => sessionsOf(candidate)[0]?.own[PROVIDER]?.["deepseek-flash"]?.tokens.input === 14,
			);
			expect(sessionsOf(document)[0]?.own[PROVIDER]?.["deepseek-flash"]?.tokens).toEqual({
				input: 14,
				cacheRead: 6,
				cacheWrite: 0,
				output: 14,
			});
		} finally {
			await disposeRun(run);
		}
	}, 300_000);
});

describe("a headless session's other business notices reach stderr, once, at their own severity (P43)", () => {
	test("an unusable baseline pauses the instance with one error line, and the agent still runs", async () => {
		const broken = '{ "schemaVersion": 1, and then nothing';
		const run = await startHeadlessRun("model-cost-headless-paused", { baseline: broken });
		try {
			expect((await run.session.prompt("one exchange on a paused instance")).status).toBe("completed");
			expect((await run.session.prompt("another exchange on a paused instance")).status).toBe("completed");

			// The pause is stated once, at the severity of an effect that did not happen, and it names the
			// file the shipped root resolved to inside this isolated home.
			const paused = stderrLines(run.session, "暂停");
			expect(paused).toHaveLength(1);
			expect(paused[0]).toContain(run.home.consumptionFile);
			// Nothing was guessed at and nothing written over it, and no other notice was published for
			// the requests the pause left unaccounted.
			expect(readFileSync(run.home.consumptionFile, "utf8")).toBe(broken);
			expect(stderrLines(run.session, "余额读取失败")).toEqual([]);
			expect(protocolFaults(run.session)).toEqual([]);
		} finally {
			await disposeRun(run);
		}
	}, 300_000);

	test("a command's own result and an unrecognized argument are both on stderr, once each", async () => {
		const run = await startHeadlessRun("model-cost-headless-commands");
		try {
			// The command's own outcome reaches the operator through the same channel a session with a UI
			// would see as a notification.
			const flipped = await run.session.prompt("/budget detail");
			expect(flipped.agentInvoked).toBe(false);
			expect(flipped.status).toBe("completed");
			expect(stderrLines(run.session, "展示已切换为详细")).toHaveLength(1);

			// The framework's own routing refuses an unrecognized argument: the help is on stderr once,
			// and nothing ran — the preference the first command set is the one still in effect.
			expect((await run.session.prompt("/budget nope")).status).toBe("completed");
			expect(stderrLines(run.session, "归档并重置统计")).toHaveLength(1);
			expect(stderrLines(run.session, "展示已切换为详细")).toHaveLength(1);
			expect(protocolFaults(run.session)).toEqual([]);
		} finally {
			await disposeRun(run);
		}
	}, 300_000);

	test("another extension's presence in the same process hides none of it", async () => {
		// Two extensions in one process, each with its own module graph: the error is the session's, not
		// a function of how many extensions were loaded beside this one.
		const run = await startHeadlessRun("model-cost-headless-two-extensions", {
			balance: { total: "0.00", failureStatus: 503 },
			extensions: [MODEL_COST_ENTRYPOINT, SECOND_EXTENSION],
		});
		try {
			expect((await run.session.prompt("one exchange beside another extension")).status).toBe("completed");
			expect(stderrLines(run.session, "余额读取失败（unreadable）")).toHaveLength(1);
			expect(run.session.stderr()).toContain("second-extension-probe");
			expect(protocolFaults(run.session)).toEqual([]);
		} finally {
			await disposeRun(run);
		}
	}, 300_000);
});

/**
 * The Codex side of the same headless scheduling (P42; S5): the allowance windows come from the
 * account API query a settled Codex Turn triggers — the same query the initialization makes — and
 * two answers of one session still drive the ratio measurement, with no UI in the process to draw
 * either.
 *
 * The run uses the fixture that binds the production runtime while publishing what it read, because
 * the windows and the measurement are process state with no file of their own to read back; the
 * fixture's lines go to stderr, which is also where a headless session's own feedback lands. The
 * account API is the fixture's own scripted transport, answered from the answers this file writes,
 * and the response's `x-codex-*` headers are scripted with values no answer states, so a window that
 * moved to them would be a window this file could see.
 */
describe("the allowance windows and the ratio measurement still run with no UI (P42)", () => {
	/** The fixture extension that binds the production runtime and publishes what it reads. */
	const CODEX_QUOTA_ENTRYPOINT = path.join(import.meta.dir, "fixtures", "codex-quota", "entrypoint.ts");
	const CODEX_MODEL_SELECTOR = "openai-codex/gpt-6-luna";
	const FIVE_HOUR_SECONDS = 5 * 60 * 60;
	const WEEKLY_SECONDS = 7 * 24 * 60 * 60;
	const HOUR_MS = 60 * 60 * 1000;
	const DAY_MS = 24 * HOUR_MS;
	/**
	 * The success TTL this run is built with: the smallest the field accepts, because the host's own
	 * local Turn settles tens of milliseconds after the initialization's answer, so each settled
	 * Turn's answer is what refreshes the windows.
	 */
	const PROMPT_TTL_MS = 1;

	/** The lines one prefix published, parsed, in publication order. */
	function linesWith<T>(session: ControlledSession, prefix: string): T[] {
		return session
			.stderr()
			.split("\n")
			.filter(line => line.startsWith(prefix))
			.map(line => JSON.parse(line.slice(prefix.length)) as T);
	}

	/** One allowance result the fixture published, as this case reads it. */
	interface PublishedQuota {
		readonly fiveHour?: { readonly usedPercent: number; readonly resetsAt?: number };
		readonly weekly?: { readonly usedPercent: number; readonly resetsAt?: number };
	}

	/** One window one account answer states: the share the API reports and how far ahead its reset sits. */
	interface ScriptedWindow {
		readonly usedPercent: number;
		readonly resetInMs: number;
	}

	/** The epoch second one window's reset instant is stated as: the API states whole seconds. */
	function resetSeconds(at: number, offsetMs: number): number {
		return Math.floor((at + offsetMs) / 1000);
	}

	/** One account API answer: the windows it states, under the API's own fields and units. */
	function accountDocument(at: number, fiveHour: ScriptedWindow, weekly: ScriptedWindow): unknown {
		return {
			rate_limit: {
				primary_window: {
					used_percent: fiveHour.usedPercent,
					limit_window_seconds: FIVE_HOUR_SECONDS,
					reset_at: resetSeconds(at, fiveHour.resetInMs),
				},
				secondary_window: {
					used_percent: weekly.usedPercent,
					limit_window_seconds: WEEKLY_SECONDS,
					reset_at: resetSeconds(at, weekly.resetInMs),
				},
			},
		};
	}

	/** One response's own facts, in the Codex backend's names and units: values no answer here states. */
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

	/** The JWT-shaped credential the Codex provider reads its account id out of. */
	function codexProbeToken(accountId: string): string {
		const claims = Buffer.from(
			JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: accountId } }),
			"utf8",
		).toBase64();
		return `aaa.${claims}.bbb`;
	}

	/**
	 * Waits until one run's own record holds what a case expects of it, and answers with it.
	 *
	 * The record is written by *another* process — the harness this case is driving — so there is no
	 * promise in this process to await and no fake clock that could advance it: the poll is the
	 * observation, and the deadline keeps a record that never arrives from hanging the case.
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

	test("two real answers feed the windows and the ratio with no widget in the process", async () => {
		const at = Date.now();
		// The account API's own answers, scripted by this file's literals: the startup query states both
		// windows, and the first settled Turn's query states both again with the five-hour window up 60
		// points and the weekly one up 10 — the pair the measurement samples.
		const runRoot = createRunRoot("model-cost-headless-codex");
		const home = isolateHome(runRoot, baselineDocument("period-headless-codex"));
		const accountDir = path.join(runRoot.path, "account-api");
		writeAccountAnswer(accountDir, 1, {
			document: accountDocument(
				at,
				{ usedPercent: 10, resetInMs: 2 * HOUR_MS },
				{ usedPercent: 20, resetInMs: 2 * DAY_MS },
			),
		});
		writeAccountAnswer(accountDir, 2, {
			document: accountDocument(
				at,
				{ usedPercent: 70, resetInMs: 2 * HOUR_MS },
				{ usedPercent: 30, resetInMs: 2 * DAY_MS },
			),
		});
		const capture = startCaptureServer({
			dir: runRoot.captureDir,
			replyText: "dock headless codex reply",
			usage: CAPTURE_USAGE,
			// The endpoint states windows of its own on every answer — values no account answer here
			// states — because the runtime must not read a response's headers at all.
			responseHeaders: () =>
				reportHeaders(
					at,
					{ usedPercent: 99.5, resetInMs: 3 * HOUR_MS },
					{ usedPercent: 88, resetInMs: 3 * DAY_MS },
				),
		});
		writeProviderOverride(runRoot.agentDir, "openai-codex", {
			baseUrl: capture.baseUrl,
			apiKey: codexProbeToken("acct-headless-21"),
		});
		// The catalog model prefers websockets; these runs must observe a real HTTP response.
		writeAgentSettings(runRoot.agentDir, { "providers.openaiWebsockets": "off" });
		const session = await ControlledSession.start({
			harness,
			runRoot,
			extensions: [CODEX_QUOTA_ENTRYPOINT],
			model: CODEX_MODEL_SELECTOR,
			env: {
				...home.env,
				[CODEX_QUOTA_SCRIPT_DIR_ENV]: accountDir,
				[CODEX_QUOTA_TTL_MS_ENV]: String(PROMPT_TTL_MS),
			},
			extraArgs: ["--no-ui"],
			promptTimeoutMs: 120_000,
		});
		const run: DockRun = { session, capture, runRoot, home };
		try {
			expect((await session.prompt("first codex exchange")).status).toBe("completed");
			expect((await session.prompt("second codex exchange")).status).toBe("completed");

			// No UI anywhere: the headless run emitted no UI frames at all, and every stdout line was a
			// protocol frame the dock parsed.
			expect(uiFrames(session)).toEqual([]);
			expect(protocolFaults(session)).toEqual([]);

			// The account query is what ran — the initialization's own, then one per settled Turn — while
			// the host published no response boundary for either Turn. Nothing about any of it depends on
			// a UI existing.
			expect(run.capture.requests()).toHaveLength(2);
			expect(run.capture.requests().every(request => request.url.includes("/codex/responses"))).toBe(true);
			const queries = await until(() => recordedAccountQueries(accountDir)[2], "the second Turn's account query");
			expect(queries.index).toBe(3);
			expect(recordedAccountQueries(accountDir)).toHaveLength(3);
			const turns = linesWith<{ readonly hasHttpFacts: boolean }>(session, CODEX_QUOTA_TURN_LINE);
			expect(turns).toHaveLength(2);
			expect(turns.every(turn => turn.hasHttpFacts)).toBe(false);

			// The windows are the second answer's own, identified by the length each stated — not the
			// response's headers beside it, whose values this run never holds.
			const last = await until(() => {
				const published = linesWith<PublishedQuota>(session, CODEX_QUOTA_LINE);
				const reading = published[published.length - 1];
				return reading?.fiveHour?.usedPercent === 70 ? reading : undefined;
			}, "the second answer's reading");
			expect(last.weekly?.usedPercent).toBe(30);
			expect(last.fiveHour?.resetsAt).toBe(resetSeconds(at, 2 * HOUR_MS) * 1000);
			expect(last.weekly?.resetsAt).toBe(resetSeconds(at, 2 * DAY_MS) * 1000);
			const percents = new Set(
				linesWith<PublishedQuota>(session, CODEX_QUOTA_LINE).flatMap(reading => [
					reading.fiveHour?.usedPercent,
					reading.weekly?.usedPercent,
				]),
			);
			expect(percents.has(99.5)).toBe(false);
			expect(percents.has(88)).toBe(false);

			// The two paired answers drove the same measurement a UI run's redraw reads: this file's own
			// arithmetic (60 / 10 = 6, and (100 − 30) / 100 × 6 = 4.2) without any frontend drawing it.
			const estimates = linesWith<{ readonly ratio?: number; readonly left?: number; readonly text: string } | null>(
				session,
				CODEX_QUOTA_ESTIMATE_LINE,
			).filter((entry): entry is { readonly ratio?: number; readonly left?: number; readonly text: string } => entry !== null);
			expect(estimates[0]?.text).toBe("estimating…");
			const sampled = estimates.find(entry => entry.ratio !== undefined);
			expect(sampled?.ratio).toBe(6);
			expect(sampled?.left).toBeCloseTo(4.2, 10);
		} finally {
			await disposeRun(run);
		}
	}, 300_000);
});
