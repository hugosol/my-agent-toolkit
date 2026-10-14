/**
 * The persistent documents, written by the production path on the one combined host (P52; S2, S5).
 *
 * This is ticket 24's cross-document contract: the activity document, the independent Codex estimate
 * and the archives a period close leaves behind, all produced by this repository's own extension
 * running in real sessions on the *combined* host artifact — the install that carries both the Viewed
 * session outlet and the Codex response boundary (`combined-host-harness.ts`) — and all read back
 * from disk by this file's own validator rather than by the extension's reader.
 *
 * What each document is checked for, independently of the implementation that wrote it:
 *
 * - **the approved schema, key by key.** The activity document carries `schemaVersion`, `periodId`,
 *   `start`, `holiday` and `harnesses`, a session record carries `id`, `name`, `parent`, `saveVersion`,
 *   `own` — plus the optional `span` pair when the run observed a session's own main-session time and,
 *   when the host measured one, an optional `runtimeMs` — and a usage entry carries the four token
 *   buckets and, when a provider's accounting
 *   produced one, its own currency field. Nothing else is accepted — no Turn or Round ledger, no
 *   `recentRound`, no historical price, no cost breakdown, no account key and no second authoritative
 *   total — because the check is an exact key set rather than a search for known leftovers.
 * - **the numbers, against this file's own literals.** The endpoint's scripted usage is what the
 *   record's own buckets have to equal, and the ratio the estimate document holds is this file's
 *   arithmetic over the two account answers it scripted.
 * - **the relations between the three documents.** A period close archives the whole activity
 *   document it closes — every provider's records, not just the closing entry's — opens the next
 *   period empty, and leaves the independent estimate exactly as it was.
 * - **restart.** A later process reads both documents back and continues from them: the session's own
 *   version and totals continue, and the measurement the estimate document carries is the one the
 *   run continues measuring, with no notice that a baseline was unusable.
 *
 * The runs execute the combined install, so each one also shows the two patched behaviours in one
 * process: the viewed-session outlet the probe reads, and a settled Codex Turn carrying the
 * response's own headers — facts the allowance windows no longer read, since they come from the
 * account API answer the fixture's own transport serves. Both are asserted here as the artifact's own
 * live half; the artifact bytes are `combined-host-artifact.test.ts`.
 *
 * The ticket's own separate cases stay where they are, and this file does not restate them: the
 * store's concurrency and refusal cases are `tests/model-cost/storage-processes.test.ts` (06), the
 * estimate's sampling and merge cases are `tests/model-cost/codex-estimate.test.ts` (14), and the
 * period command's conditions, wording and archive-collision case are
 * `tests/model-cost/period-switch.test.ts` (19). What is added here is the contract *across* those
 * documents, observed on the production path.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { writeAgentSettings, writeProviderOverride } from "./agent-config";
import { type IsolatedHarness, REPO_ROOT, readBaselineRecord } from "./baseline";
import { type CaptureServer, type CapturedRequest, type CaptureStep, startCaptureServer } from "./capture-server";
import { ensureCombinedHostHarness } from "./combined-host-harness";
import {
	CODEX_QUOTA_ESTIMATE_LINE,
	CODEX_QUOTA_LINE,
	CODEX_QUOTA_SCRIPT_DIR_ENV,
	CODEX_QUOTA_TTL_MS_ENV,
	CODEX_QUOTA_TURN_LINE,
	type ScriptedAccountAnswer,
	writeAccountAnswer,
} from "./fixtures/codex-quota/entrypoint";
import { DOCK_CAPTURE_BASE_URL_ENV } from "./fixtures/extension-root/provider";
import {
	VIEWED_PROBE_COMMAND,
	VIEWED_PROBE_EVIDENCE_ENV,
	VIEWED_PROBE_LABEL,
} from "./fixtures/viewed-session/probe";
import { type RunRoot, createRunRoot } from "./run-root";
import { ControlledSession, type RpcFrame } from "./session";

const record = readBaselineRecord();
/** The extension's own production OMP entrypoint, as the harness's loader discovers it. */
const MODEL_COST_ENTRYPOINT = path.join(REPO_ROOT, "entrypoints", "omp", "model-cost.ts");
/** The fixture that binds the production runtime and reports what a real Codex Turn delivered. */
const CODEX_QUOTA_ENTRYPOINT = path.join(REPO_ROOT, "tests", "harness-dock", "fixtures", "codex-quota", "entrypoint.ts");
/** The probe that reads the host's public Viewed session outlet, an extension of its own. */
const VIEWED_PROBE = path.join(REPO_ROOT, "tests", "harness-dock", "fixtures", "viewed-session", "probe.ts");
/** The three documents this extension keeps in its storage root. */
const CONSUMPTION_FILE = "consumption.json";
const ESTIMATE_FILE = "codex-usage-estimate.json";
const ARCHIVE_DIRECTORY = "archives";
/** The two providers these runs redirect: the Codex path the estimate reads, and the entry's own. */
const CODEX_PROVIDER = "openai-codex";
const DEEPSEEK_PROVIDER = "deepseek";
/** The models each path runs. */
const CODEX_SELECTOR = "openai-codex/gpt-6-luna";
const DEEPSEEK_SELECTOR = "deepseek/deepseek-flash";
/** The credential the isolated state configures for a provider whose normal one is a login flow. */
const DOCK_CREDENTIAL = "dock-key";
/** The usage every completion reports: this file's own literal, per request, in the endpoint's names. */
const CAPTURE_USAGE = { input: 10, output: 7, cacheRead: 3 };
/** The usage the DeepSeek path's completions report: the same shape, its own literals. */
const DEEPSEEK_USAGE = { input: 2000, output: 1000, cacheRead: 1000 };
/** The boundary balance the endpoint answers, in the provider's own currency. */
const BOUNDARY_TOTAL = "12.50";
/** The period the isolated storage root starts on, as its own baseline document states it. */
const START_PERIOD = "period-persistence";
/** The delegation one case scripts: two assignments the parent gives, each to a child of its own. */
const CHILD_ONE_NAME = "persistenceChildOne";
const CHILD_ONE_ASSIGNMENT = "first child assignment, answered by a scripted result";
const CHILD_TWO_NAME = "persistenceChildTwo";
const CHILD_TWO_ASSIGNMENT = "second child assignment, answered by a scripted result";
const DELEGATE_PROMPT = "one exchange that delegates to two subagents";
/** The Codex window lengths the account answers below state, in the unit its document uses. */
const FIVE_HOUR_SECONDS = 5 * 60 * 60;
const WEEKLY_SECONDS = 7 * 24 * 60 * 60;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/**
 * The success TTL every Codex run here is built with: the smallest the field accepts, because the
 * host's own local Turn settles tens of milliseconds after the initialization's answer, so each
 * settled Turn's own account answer is what moves the windows (and the estimate's pair) on.
 */
const PROMPT_TTL_MS = 1;

let harness: IsolatedHarness;

beforeAll(async () => {
	// The one install both patches are on: the artifact the acceptance run executes.
	harness = await ensureCombinedHostHarness(record);
}, 900_000);

/** One run's isolated user home: the storage root the extension's own configuration names inside it. */
interface IsolatedHome {
	readonly home: string;
	readonly storageDirectory: string;
	readonly consumptionFile: string;
	readonly estimateFile: string;
	readonly archiveDirectory: string;
	/** The environment that makes the harness resolve `~/` here, and nowhere else. */
	readonly env: Record<string, string>;
}

/** A fresh isolated home holding the baseline activity document every case starts from. */
function isolatedHome(label: string): IsolatedHome {
	const home = mkdtempSync(path.join(tmpdir(), `model-cost-persistence-${label}-`));
	const storageDirectory = path.join(home, ".omp", "cost-archive");
	mkdirSync(storageDirectory, { recursive: true });
	writeFileSync(
		path.join(storageDirectory, CONSUMPTION_FILE),
		JSON.stringify(
			{
				schemaVersion: 1,
				periodId: START_PERIOD,
				start: "2026-10-01T00:00:00.000Z",
				holiday: false,
				harnesses: { omp: { sessions: [] } },
			},
			null,
			"\t",
		),
		{ encoding: "utf8" },
	);
	return {
		home,
		storageDirectory,
		consumptionFile: path.join(storageDirectory, CONSUMPTION_FILE),
		estimateFile: path.join(storageDirectory, ESTIMATE_FILE),
		archiveDirectory: path.join(storageDirectory, ARCHIVE_DIRECTORY),
		env: {
			USERPROFILE: home,
			HOME: home,
			HOMEDRIVE: path.parse(home).root,
			HOMEPATH: home.slice(path.parse(home).root.length - 1),
		},
	};
}

function disposeHome(home: IsolatedHome): void {
	rmSync(home.home, { recursive: true, force: true });
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

/**
 * The two account answers every Codex run here scripts, by this file's own literals: the first
 * states both windows, the second states both again with the five-hour one up 60 points and the
 * weekly one up 10 — the one qualified pair the measurement samples, so the ratio the estimate
 * document must hold is 60 / 10 = 6.
 */
function accountAnswers(at: number): Readonly<Record<number, ScriptedAccountAnswer>> {
	return {
		1: {
			document: accountDocument(
				at,
				{ usedPercent: 10, resetInMs: 2 * HOUR_MS },
				{ usedPercent: 20, resetInMs: 2 * DAY_MS },
			),
		},
		2: {
			document: accountDocument(
				at,
				{ usedPercent: 70, resetInMs: 2 * HOUR_MS },
				{ usedPercent: 30, resetInMs: 2 * DAY_MS },
			),
		},
	};
}

/** A JWT-shaped credential whose claim names a ChatGPT account, which the Codex provider requires. */
function codexProbeToken(accountId: string): string {
	const claims = Buffer.from(
		JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: accountId } }),
		"utf8",
	).toBase64();
	return `aaa.${claims}.bbb`;
}

/** One provisioned run: the session, the endpoint behind it, its root and the home it writes into. */
interface DockRun {
	readonly session: ControlledSession;
	readonly capture: CaptureServer;
	readonly runRoot: RunRoot;
}

/**
 * Stops one run's session and its endpoint.
 *
 * The run root is deliberately left alone: a case that starts a second session over the same root —
 * the restart and the period close both do — needs the root to survive the first session's end.
 */
async function disposeRun(run: DockRun): Promise<void> {
	try {
		if (run.session.exited() === null) await run.session.stop({ timeoutMs: 15_000 });
	} catch {
		// The session already stopped (or never started); the rest of the run still gets cleaned up.
	}
	run.capture.stop();
}

/** One Codex-path run: the account answers its script holds, and where its own files go. */
interface CodexRunOptions {
	/** The answer the n-th account query of this run receives (1-based). */
	readonly answers: Readonly<Record<number, ScriptedAccountAnswer>>;
	/** Where this run's own capture records go. */
	readonly captureDir: string;
	/** Where this run's own account-query script and call log go. */
	readonly accountDir: string;
}

/** One Codex-path run on the combined host: the production runtime, the viewed probe, a scripted account API. */
async function startCodexRun(
	home: IsolatedHome,
	runRoot: RunRoot,
	options: CodexRunOptions,
): Promise<DockRun & { readonly viewedEvidence: string }> {
	for (const [index, answer] of Object.entries(options.answers)) {
		writeAccountAnswer(options.accountDir, Number(index), answer);
	}
	const capture = startCaptureServer({
		dir: options.captureDir,
		replyText: "dock persistence codex reply",
		usage: CAPTURE_USAGE,
	});
	writeProviderOverride(runRoot.agentDir, CODEX_PROVIDER, {
		baseUrl: capture.baseUrl,
		apiKey: codexProbeToken("acct-persistence-24"),
	});
	// The catalog model prefers websockets; the boundary these runs observe is a real HTTP one.
	writeAgentSettings(runRoot.agentDir, { "providers.openaiWebsockets": "off" });
	const viewedEvidence = path.join(runRoot.path, "viewed-evidence.jsonl");
	try {
		const session = await ControlledSession.start({
			harness,
			runRoot,
			extensions: [CODEX_QUOTA_ENTRYPOINT, VIEWED_PROBE],
			model: CODEX_SELECTOR,
			env: {
				...home.env,
				[VIEWED_PROBE_EVIDENCE_ENV]: viewedEvidence,
				[CODEX_QUOTA_SCRIPT_DIR_ENV]: options.accountDir,
				[CODEX_QUOTA_TTL_MS_ENV]: String(PROMPT_TTL_MS),
			},
			promptTimeoutMs: 120_000,
		});
		return { session, capture, runRoot, viewedEvidence };
	} catch (error) {
		capture.stop();
		throw error;
	}
}

/**
 * One DeepSeek-path run on the combined host: the extension's own production entrypoint, whose
 * `/budget` is the command the entry's provider applies to, driven through the harness's own loader.
 */
async function startDeepSeekRun(
	label: string,
	home: IsolatedHome,
	runRoot: RunRoot,
	captureDir: string,
): Promise<DockRun> {
	const capture = startCaptureServer({
		dir: captureDir,
		replyText: "dock persistence deepseek reply",
		usage: DEEPSEEK_USAGE,
		balance: { total: BOUNDARY_TOTAL },
	});
	writeProviderOverride(runRoot.agentDir, DEEPSEEK_PROVIDER, { baseUrl: capture.baseUrl, apiKey: DOCK_CREDENTIAL });
	try {
		const session = await ControlledSession.start({
			harness,
			runRoot,
			extensions: [MODEL_COST_ENTRYPOINT],
			model: DEEPSEEK_SELECTOR,
			env: { [DOCK_CAPTURE_BASE_URL_ENV]: capture.baseUrl, ...home.env },
			promptTimeoutMs: 120_000,
		});
		return { session, capture, runRoot };
	} catch (error) {
		capture.stop();
		throw error;
	}
}

/**
 * Types one period command as the operator would, and answers with the notices it produced.
 *
 * A command the entry refuses because its own earlier save is still publishing is retried: what says
 * the switch happened is an info notice, and the loop waits on that answer rather than on a duration.
 * The retries are bounded only so that a command the entry never accepts fails the case instead of
 * hanging it — the refusal's own wording and severity are the period-command suite's business.
 */
async function switchWhenTheEntryAllows(
	run: DockRun,
	action: "holiday" | "clear",
): Promise<ReadonlyArray<{ readonly level: unknown; readonly message: string }>> {
	const before = noticesOf(run.session).length;
	for (let attempt = 0; attempt < 50; attempt += 1) {
		await run.session.prompt(`/budget ${action}`);
		const produced = noticesOf(run.session).slice(before);
		if (produced.some(notice => notice.level === "info")) return produced;
		await queuedWorkSettled();
	}
	throw new Error(`/budget ${action} was never accepted: ${JSON.stringify(noticesOf(run.session))}`);
}

/** Scripted delegation: the host's own task tool, in the batch shape an RPC host runs. */
function delegationStep(name: string, assignment: string): CaptureStep {
	return {
		toolCall: {
			name: "task",
			arguments: JSON.stringify({
				context: "dock persistence delegation context",
				tasks: [{ name, agent: "task", task: assignment, solutionSpace: "one fixed answer, nothing open" }],
			}),
		},
	};
}

/** A scripted subagent result: the host's own yield tool, which ends the subagent's session. */
function yieldStep(data: string): CaptureStep {
	return { toolCall: { name: "yield", arguments: JSON.stringify({ data }) } };
}

/** The messages one captured request carried, when its body really is the object this file reads. */
function messagesOf(request: CapturedRequest): readonly unknown[] {
	const body = request.json;
	if (body === null || typeof body !== "object" || !("messages" in body) || !Array.isArray(body.messages)) return [];
	return body.messages;
}

/** The role one message carries, when it really names one. */
function roleOf(message: unknown): string | undefined {
	if (message === null || typeof message !== "object" || !("role" in message)) return undefined;
	return typeof message.role === "string" ? message.role : undefined;
}

/** The mark one request carries in its own session: the first user message that session started with. */
function openingOf(request: CapturedRequest): string {
	const opening = messagesOf(request).find(message => roleOf(message) === "user");
	return opening === undefined ? "" : JSON.stringify(opening);
}

/** How many assistant messages one captured request already carries: the turns answered before it. */
function answeredTurns(request: CapturedRequest): number {
	return messagesOf(request).filter(message => roleOf(message) === "assistant").length;
}

// ---- the approved schema, checked independently of the extension's own reader ---------------------

/** The keys the approved activity schema declares, at each level, and nothing else. */
const DOCUMENT_KEYS = ["schemaVersion", "periodId", "start", "start_bal", "holiday", "harnesses"];
const HARNESS_KEYS = ["sessions"];
const SESSION_KEYS = ["id", "name", "parent", "saveVersion", "own", "runtimeMs", "span"];
/** The two instants of one session's own main-session time fact, which are always written together. */
const SPAN_KEYS = ["start", "end"];
const USAGE_KEYS = ["tokens", "costCny", "referenceCostUsd"];
const TOKEN_KEYS = ["input", "cacheRead", "cacheWrite", "output"];
/** The archive is the closed activity document plus the two facts only the closing instant states. */
const ARCHIVE_KEYS = [...DOCUMENT_KEYS, "end", "end_bal"];
/** The estimate document's own approved shape. */
const ESTIMATE_KEYS = ["baseline", "ratio"];
const ESTIMATE_BASELINE_KEYS = ["capturedAt", "fiveHour", "weekly"];
const ESTIMATE_WINDOW_KEYS = ["usedPercent", "resetsAt"];

/** One session's own main-session time fact, as the approved schema declares it. */
interface SavedSpan {
	readonly start: number;
	readonly end: number;
}

/** One session's record, as the approved schema declares it. */
interface SavedRecord {
	readonly id: string;
	readonly name: string;
	readonly parent: string | null;
	readonly saveVersion: number;
	readonly own: Record<string, Record<string, { readonly tokens: Record<string, number>; readonly costCny?: number }>>;
	/**
	 * The subagent runtime this session's own executions accumulated in the period, when one was
	 * reliably measured: a count of milliseconds, absent rather than zero when none was.
	 */
	readonly runtimeMs?: number;
	/**
	 * The session's own main-session time fact, when the run observed both of its instants: the first
	 * user input of the period and the latest Round end, in epoch milliseconds. Absent is ordinary —
	 * a session that has not taken up input, one whose first Round has not ended, and a record written
	 * before this field existed all carry nothing here.
	 */
	readonly span?: SavedSpan;
}

/** One activity document, as the approved schema declares it. */
interface SavedActivity {
	readonly periodId: string;
	readonly holiday: boolean;
	readonly harnesses: Record<string, { readonly sessions: readonly SavedRecord[] }>;
	readonly start_bal?: number;
	readonly end?: string;
	readonly end_bal?: number;
}

/** One estimate document, as its approved shape declares it. */
interface SavedEstimate {
	readonly baseline: {
		readonly capturedAt: string;
		readonly fiveHour: { readonly usedPercent: number; readonly resetsAt: string | null };
		readonly weekly: { readonly usedPercent: number; readonly resetsAt: string | null };
	};
	readonly ratio: number | null;
}

/** Why one value is not a mapping of the approved keys, or `undefined` when it is one. */
function keyFault(value: unknown, approved: readonly string[], where: string): string | undefined {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return `${where} is not a mapping`;
	}
	const undeclared = Object.keys(value).filter(key => !approved.includes(key));
	return undeclared.length === 0 ? undefined : `${where} carries keys the approved schema does not name: ${undeclared.join(", ")}`;
}

/** Why one value is not a finite count or amount this schema accepts, or `undefined` when it is one. */
function measurementFault(value: unknown, where: string): string | undefined {
	if (typeof value !== "number" || !Number.isFinite(value)) return `${where} is not a finite number`;
	if (value < 0) return `${where} is negative`;
	return undefined;
}

/**
 * One usage entry, validated: the four token buckets exactly, and each currency field the provider's
 * accounting produced as a finite amount.
 */
function readUsage(value: unknown, where: string): { readonly tokens: Record<string, number>; readonly costCny?: number } {
	const keys = keyFault(value, USAGE_KEYS, where);
	if (keys !== undefined) throw new Error(keys);
	const usage = value as Record<string, unknown>;
	const tokenKeys = keyFault(usage.tokens, TOKEN_KEYS, `${where}.tokens`);
	if (tokenKeys !== undefined) throw new Error(tokenKeys);
	const tokens = usage.tokens as Record<string, number>;
	for (const bucket of TOKEN_KEYS) {
		const fault = measurementFault(tokens[bucket], `${where}.tokens.${bucket}`);
		if (fault !== undefined) throw new Error(fault);
	}
	if (usage.costCny !== undefined) {
		const fault = measurementFault(usage.costCny, `${where}.costCny`);
		if (fault !== undefined) throw new Error(fault);
	}
	if (usage.referenceCostUsd !== undefined) {
		const fault = measurementFault(usage.referenceCostUsd, `${where}.referenceCostUsd`);
		if (fault !== undefined) throw new Error(fault);
	}
	return { tokens, ...(usage.costCny === undefined ? {} : { costCny: usage.costCny as number }) };
}

/** One session record, validated against the approved session schema. */
function readRecord(value: unknown, where: string): SavedRecord {
	const keys = keyFault(value, SESSION_KEYS, where);
	if (keys !== undefined) throw new Error(keys);
	const candidate = value as Record<string, unknown>;
	if (typeof candidate.id !== "string" || candidate.id.length === 0) throw new Error(`${where}.id is not a non-empty string`);
	if (typeof candidate.name !== "string") throw new Error(`${where}.name is not a string`);
	if (candidate.parent !== null && (typeof candidate.parent !== "string" || candidate.parent.length === 0)) {
		throw new Error(`${where}.parent is neither null nor a non-empty string`);
	}
	if (typeof candidate.saveVersion !== "number" || !Number.isInteger(candidate.saveVersion) || candidate.saveVersion < 0) {
		throw new Error(`${where}.saveVersion is not a non-negative integer`);
	}
	if (candidate.own === null || typeof candidate.own !== "object" || Array.isArray(candidate.own)) {
		throw new Error(`${where}.own is not a mapping`);
	}
	// The one optional fact of the record: absent is ordinary, and present must be exactly the pair of
	// finite instants this schema declares, with its end no earlier than its start.
	let span: SavedSpan | undefined;
	if (candidate.span !== undefined) {
		const spanKeys = keyFault(candidate.span, SPAN_KEYS, `${where}.span`);
		if (spanKeys !== undefined) throw new Error(spanKeys);
		const pair = candidate.span as Record<string, unknown>;
		for (const key of SPAN_KEYS) {
			const fault = measurementFault(pair[key], `${where}.span.${key}`);
			if (fault !== undefined) throw new Error(fault);
		}
		span = { start: pair.start as number, end: pair.end as number };
		if (span.end < span.start) throw new Error(`${where}.span.end is earlier than its own start`);
	}
	const own: Record<string, Record<string, { tokens: Record<string, number>; costCny?: number }>> = {};
	for (const [provider, models] of Object.entries(candidate.own as Record<string, unknown>)) {
		if (models === null || typeof models !== "object" || Array.isArray(models)) {
			throw new Error(`${where}.own.${provider} is not a mapping`);
		}
		const bucket: Record<string, { tokens: Record<string, number>; costCny?: number }> = {};
		for (const [model, usage] of Object.entries(models as Record<string, unknown>)) {
			bucket[model] = readUsage(usage, `${where}.own.${provider}.${model}`);
		}
		own[provider] = bucket;
	}
	const runtime = candidate.runtimeMs;
	if (runtime !== undefined && (typeof runtime !== "number" || !Number.isFinite(runtime) || runtime < 0)) {
		throw new Error(`${where}.runtimeMs is neither absent nor a non-negative finite number`);
	}
	return {
		id: candidate.id,
		name: candidate.name,
		parent: candidate.parent as string | null,
		saveVersion: candidate.saveVersion,
		own,
		...(runtime === undefined ? {} : { runtimeMs: runtime as number }),
		...(span === undefined ? {} : { span }),
	};
}

/**
 * One activity document (or one archive, when it carries the closing instant), validated.
 *
 * The check is the exact key set at every level rather than a search for names a rejected structure
 * would carry: a file that grew a Round ledger, a second total, an account key or a price history
 * fails here without this file having to guess what those would be called.
 */
function readActivity(file: string, approved: readonly string[] = DOCUMENT_KEYS): SavedActivity {
	const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
	const top = keyFault(parsed, approved, "the document");
	if (top !== undefined) throw new Error(`${file}: ${top}`);
	const document = parsed as Record<string, unknown>;
	if (document.schemaVersion !== 1) throw new Error(`${file}: schemaVersion is ${JSON.stringify(document.schemaVersion)}`);
	if (typeof document.periodId !== "string" || document.periodId.length === 0) throw new Error(`${file}: periodId is empty`);
	if (typeof document.start !== "string" || Number.isNaN(Date.parse(document.start))) {
		throw new Error(`${file}: start is not a readable instant`);
	}
	if (typeof document.holiday !== "boolean") throw new Error(`${file}: holiday is not a boolean`);
	const harnesses = keyFault(document.harnesses, Object.keys(document.harnesses as object), "harnesses");
	if (harnesses !== undefined) throw new Error(`${file}: ${harnesses}`);
	const buckets: Record<string, { readonly sessions: readonly SavedRecord[] }> = {};
	for (const [name, bucket] of Object.entries(document.harnesses as Record<string, unknown>)) {
		const bucketFault = keyFault(bucket, HARNESS_KEYS, `harnesses.${name}`);
		if (bucketFault !== undefined) throw new Error(`${file}: ${bucketFault}`);
		if (bucket === null || typeof bucket !== "object" || !("sessions" in bucket)) {
			throw new Error(`${file}: harnesses.${name} declares no sessions`);
		}
		const sessions = bucket.sessions;
		if (!Array.isArray(sessions)) throw new Error(`${file}: harnesses.${name}.sessions is not an array`);
		const ids = new Set<string>();
		buckets[name] = {
			sessions: sessions.map((session, index) => {
				const saved = readRecord(session, `harnesses.${name}.sessions[${index}]`);
				if (ids.has(saved.id)) throw new Error(`${file}: harnesses.${name} repeats the session id ${saved.id}`);
				ids.add(saved.id);
				return saved;
			}),
		};
	}
	for (const instant of ["start_bal", "end_bal"] as const) {
		if (document[instant] === undefined) continue;
		const fault = measurementFault(document[instant], instant);
		if (fault !== undefined) throw new Error(`${file}: ${fault}`);
	}
	if (document.end !== undefined && (typeof document.end !== "string" || Number.isNaN(Date.parse(document.end)))) {
		throw new Error(`${file}: end is not a readable instant`);
	}
	return {
		periodId: document.periodId,
		holiday: document.holiday,
		harnesses: buckets,
		...(document.start_bal === undefined ? {} : { start_bal: document.start_bal as number }),
		...(document.end === undefined ? {} : { end: document.end as string }),
		...(document.end_bal === undefined ? {} : { end_bal: document.end_bal as number }),
	};
}

/** One estimate document, validated against its own approved shape. */
function readEstimate(file: string): SavedEstimate {
	const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
	const top = keyFault(parsed, ESTIMATE_KEYS, "the estimate document");
	if (top !== undefined) throw new Error(`${file}: ${top}`);
	const document = parsed as Record<string, unknown>;
	const baselineFault = keyFault(document.baseline, ESTIMATE_BASELINE_KEYS, "baseline");
	if (baselineFault !== undefined) throw new Error(`${file}: ${baselineFault}`);
	const baseline = document.baseline as Record<string, unknown>;
	if (typeof baseline.capturedAt !== "string" || Number.isNaN(Date.parse(baseline.capturedAt))) {
		throw new Error(`${file}: baseline.capturedAt is not a readable instant`);
	}
	const windows: Record<string, { readonly usedPercent: number; readonly resetsAt: string | null }> = {};
	for (const name of ["fiveHour", "weekly"] as const) {
		const windowFault = keyFault(baseline[name], ESTIMATE_WINDOW_KEYS, `baseline.${name}`);
		if (windowFault !== undefined) throw new Error(`${file}: ${windowFault}`);
		const window = baseline[name] as Record<string, unknown>;
		const usedFault = measurementFault(window.usedPercent, `baseline.${name}.usedPercent`);
		if (usedFault !== undefined) throw new Error(`${file}: ${usedFault}`);
		if (window.resetsAt !== null && (typeof window.resetsAt !== "string" || Number.isNaN(Date.parse(window.resetsAt)))) {
			throw new Error(`${file}: baseline.${name}.resetsAt is neither null nor a readable instant`);
		}
		windows[name] = { usedPercent: window.usedPercent as number, resetsAt: window.resetsAt as string | null };
	}
	if (document.ratio !== null) {
		const ratioFault = measurementFault(document.ratio, "ratio");
		if (ratioFault !== undefined) throw new Error(`${file}: ${ratioFault}`);
	}
	return {
		baseline: {
			capturedAt: baseline.capturedAt,
			fiveHour: windows.fiveHour as SavedEstimate["baseline"]["fiveHour"],
			weekly: windows.weekly as SavedEstimate["baseline"]["weekly"],
		},
		ratio: document.ratio as number | null,
	};
}

/** Every session record a validated activity document holds, whichever harness key it sits under. */
function recordsOf(document: SavedActivity): readonly SavedRecord[] {
	return Object.values(document.harnesses).flatMap(bucket => bucket.sessions);
}

/** One session's record, or `undefined` when the document holds none for that id. */
function recordOfFile(file: string, id: string): SavedRecord | undefined {
	return recordsOf(readActivity(file)).find(saved => saved.id === id);
}

/** The archive files one storage root holds, by name. */
function archiveNames(home: IsolatedHome): string[] {
	return existsSync(home.archiveDirectory) ? readdirSync(home.archiveDirectory).sort() : [];
}

/** Every JSON file one storage root holds, relative to the root, archives included. */
function jsonFiles(home: IsolatedHome): string[] {
	const found: string[] = [];
	for (const entry of readdirSync(home.storageDirectory, { withFileTypes: true, recursive: true })) {
		if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
		found.push(path.relative(home.storageDirectory, path.join(entry.parentPath, entry.name)).replace(/\\/g, "/"));
	}
	return found.sort();
}

/** The lines one prefix published, parsed, in publication order. */
function linesWith<T>(session: ControlledSession, prefix: string): T[] {
	return session
		.stderr()
		.split("\n")
		.filter(line => line.startsWith(prefix))
		.map(line => JSON.parse(line.slice(prefix.length)) as T);
}

/** One settled Turn the runtime's fixture published, as the framework delivered it. */
interface PublishedTurn {
	readonly provider: string;
	readonly outcome: string;
	readonly hasHttpFacts: boolean;
	readonly headerNames: readonly string[];
	readonly unavailable: readonly string[];
}

/** One ratio/left reading the fixture published; `null` while no window is readable. */
interface PublishedEstimate {
	readonly ratio?: number;
	readonly left?: number;
	readonly text: string;
}

/** The object payload of one RPC answer, when the frame really carries one. */
function payloadRecord(frame: RpcFrame): Record<string, unknown> {
	const data = frame.data;
	return data !== null && typeof data === "object" ? (data as Record<string, unknown>) : {};
}

/** The session the harness is showing, and the file the next process would resume it from. */
async function currentSession(
	session: ControlledSession,
	runRoot: RunRoot,
): Promise<{ readonly id: string; readonly file: string }> {
	const payload = payloadRecord(await session.request({ type: "get_state" }));
	const id = typeof payload.sessionId === "string" ? payload.sessionId : "";
	if (id.length === 0) throw new Error(`the harness reported no session id: ${JSON.stringify(payload)}`);
	// The id is the session's own; the file the next process resumes is the one the harness persists.
	const candidates = readdirSync(runRoot.sessionDir)
		.filter(name => name.endsWith(".jsonl"))
		.map(name => path.join(runRoot.sessionDir, name));
	const file = candidates.find(candidate => candidate.includes(id));
	if (file === undefined) throw new Error(`no persisted session file names ${id} in ${runRoot.sessionDir}`);
	return { id, file };
}

/** Lets the event loop turn over until nothing already queued is left. */
async function queuedWorkSettled(): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>();
	setImmediate(resolve);
	await promise;
}

/**
 * Waits until one document on disk holds what a case expects of it, and answers with the validated
 * value.
 *
 * A real child process publishes its own writes, so the wait is on the document's content rather
 * than on a duration; the deadline only keeps a write that never lands from hanging the case. A
 * document a case cannot judge yet — one whose write is still landing — is retried rather than
 * treated as a document of the wrong shape.
 */
async function savedDocument<T>(
	file: string,
	read: (file: string) => T,
	accept: (value: T) => boolean,
): Promise<T> {
	const deadline = Date.now() + 30_000;
	for (;;) {
		if (existsSync(file)) {
			try {
				const value = read(file);
				if (accept(value)) return value;
			} catch (error) {
				if (!/Unexpected end of JSON input|Unterminated string/.test(String(error))) throw error;
			}
		}
		if (Date.now() > deadline) throw new Error(`no document this case expects was published at ${file}`);
		await queuedWorkSettled();
	}
}

/** The operator notices one session emitted, as the harness itself framed them. */
function noticesOf(session: ControlledSession): ReadonlyArray<{ readonly level: unknown; readonly message: string }> {
	return session
		.frames()
		.filter(frame => frame.type === "extension_ui_request" && frame.method === "notify")
		.map(frame => ({ level: frame.notifyType, message: String(frame.message) }));
}

/**
 * One activity document's own buckets for one provider and model, as the approved four buckets.
 *
 * The expectation is this file's own literal, read against the protocol's own bucket meaning: the
 * endpoint reports `input_tokens` *including* the cached prompt tokens, while the activity schema's
 * `input` counts the non-cached conversation input alone, so a request the endpoint was scripted to
 * answer with `input: 10, cacheRead: 3` contributes `input: 7, cacheRead: 3`. Neither number is
 * obtained by running the extension's accounting.
 */
function usageOfRequests(count: number, usage: typeof CAPTURE_USAGE = CAPTURE_USAGE): Record<string, number> {
	return {
		input: (usage.input - usage.cacheRead) * count,
		cacheRead: usage.cacheRead * count,
		cacheWrite: 0,
		output: usage.output * count,
	};
}

describe("the production documents of one storage root, read back independently (P52)", () => {
	test("one root holds the approved activity document and the independent estimate, both written by the run", async () => {
		const home = isolatedHome("codex");
		const runRoot = createRunRoot("persistence-codex");
		// Two account answers through one session, each scripted by this file's own literals: the startup
		// query states both windows, the first settled Turn's query states both again with the five-hour
		// one up 60 points and the weekly one up 10 — the one qualified pair the measurement samples, so
		// the ratio this document must hold is 60/10 = 6.
		const at = Date.now();
		const run = await startCodexRun(home, runRoot, {
			answers: accountAnswers(at),
			captureDir: runRoot.captureDir,
			accountDir: path.join(runRoot.path, "account-codex"),
		});
		try {
			for (const prompt of ["first codex exchange", "second codex exchange"]) {
				expect((await run.session.prompt(prompt)).status).toBe("completed");
			}
			// The session the harness is showing: the record the document must hold belongs to it.
			const position = await currentSession(run.session, runRoot);

			// The run's own documents: the activity record it published, and the estimate it keeps beside it.
			const document = await savedDocument(
				home.consumptionFile,
				readActivity,
				held => recordsOf(held).some(saved => saved.id === position.id && saved.saveVersion >= 2),
			);
			expect(document.periodId).toBe(START_PERIOD);
			expect(existsSync(home.estimateFile)).toBe(true);
			// The root holds exactly the two documents this extension writes, and nothing else: no ledger
			// file, no per-round file, no account record.
			expect(jsonFiles(home)).toEqual([ESTIMATE_FILE, CONSUMPTION_FILE]);

			// The record's own buckets are the endpoint's scripted usage, once per completed request.
			const own = recordOfFile(home.consumptionFile, position.id);
			expect(own?.parent).toBeNull();
			expect(own?.own[CODEX_PROVIDER]?.["gpt-6-luna"]?.tokens).toEqual(usageOfRequests(2));
			// The allowance path states no CNY amount: this provider's own metric is a separate channel,
			// and the two currencies are never mixed into one another's field.
			expect(own?.own[CODEX_PROVIDER]?.["gpt-6-luna"]?.costCny).toBeUndefined();

			// The estimate document is its own file with its own approved shape. What it holds after this run
			// is the first account answer's own windows, which land as soon as that answer is folded in: the
			// ratio a pair produces is published at most once a minute (the policy's own case in
			// `tests/model-cost/codex-estimate.test.ts`), so the refinement is not in the file yet — the
			// reading the run published below is where this run's qualified measurement is observed.
			const estimate = await savedDocument(
				home.estimateFile,
				readEstimate,
				held => held.baseline.fiveHour.usedPercent === 10 && held.baseline.weekly.usedPercent === 20,
			);
			expect(estimate.ratio).toBeNull();

			// The one install carries both patched behaviours in this very process: the Codex Turns publish
			// the response's own boundary — facts the allowance windows no longer read, because they move
			// to the account API answer a settled Turn's own query obtains — and the viewed-session probe
			// reads the outlet the other patch adds.
			const turns = linesWith<PublishedTurn>(run.session, CODEX_QUOTA_TURN_LINE);
			expect(turns).toHaveLength(2);
			for (const turn of turns) {
				expect(turn.provider).toBe(CODEX_PROVIDER);
				expect(turn.outcome).toBe("completed");
				expect(turn.hasHttpFacts).toBe(true);
				expect(turn.unavailable).not.toContain("HTTP response facts");
			}
			expect(linesWith<unknown>(run.session, CODEX_QUOTA_LINE).length).toBeGreaterThan(0);
			const readings = linesWith<PublishedEstimate | null>(run.session, CODEX_QUOTA_ESTIMATE_LINE).filter(
				(entry): entry is PublishedEstimate => entry !== null,
			);
			expect(readings.some(entry => entry.ratio === 6)).toBe(true);
			expect((await run.session.prompt(`/${VIEWED_PROBE_COMMAND} present`)).status).toBe("completed");
			await run.session.prompt(`/${VIEWED_PROBE_COMMAND} read`);
			const evidence = readFileSync(run.viewedEvidence, "utf8")
				.split("\n")
				.filter(line => line.trim().length > 0)
				.map(line => JSON.parse(line) as { readonly kind: string; readonly read?: boolean; readonly subscribe?: boolean; readonly facts?: { readonly sessionId?: string } });
			expect(evidence.find(entry => entry.kind === "present")).toEqual({ kind: "present", read: true, subscribe: true });
			expect(evidence.find(entry => entry.kind === "read")?.facts?.sessionId).toBe(position.id);
			// The probe is an extension of its own beside the production runtime, and it says nothing.
			expect(linesWith<unknown>(run.session, `[${VIEWED_PROBE_LABEL}]`)).toEqual([]);
		} finally {
			await disposeRun(run);
			runRoot.dispose();
			disposeHome(home);
		}
	}, 600_000);

	test("a period close archives the whole file it closes and leaves the estimate exactly as it was", async () => {
		const home = isolatedHome("reset");
		const runRoot = createRunRoot("persistence-reset");
		// The estimate has to exist before the close, and it is the Codex path that produces one: two
		// account answers through one session, scripted by this file's own literals.
		const at = Date.now();
		const codex = await startCodexRun(home, runRoot, {
			answers: accountAnswers(at),
			captureDir: path.join(runRoot.path, "capture-codex"),
			accountDir: path.join(runRoot.path, "account-reset-codex"),
		});
		/** The Codex session's own identity, and the estimate as the reset must leave it. */
		let codexPosition: { readonly id: string; readonly file: string };
		let estimateBefore: string;
		try {
			for (const prompt of ["first codex exchange", "second codex exchange"]) {
				expect((await codex.session.prompt(prompt)).status).toBe("completed");
			}
			codexPosition = await currentSession(codex.session, runRoot);
			await savedDocument(
				home.consumptionFile,
				readActivity,
				held => recordsOf(held).some(saved => saved.id === codexPosition.id && saved.saveVersion >= 2),
			);
			await savedDocument(
				home.estimateFile,
				readEstimate,
				held => held.baseline.fiveHour.usedPercent === 10,
			);
			// The estimate as the reset must leave it: byte for byte.
			estimateBefore = readFileSync(home.estimateFile, "utf8");
		} finally {
			await disposeRun(codex);
		}

		// The entry's own path: a DeepSeek session, whose entry is the one `/budget` applies to.
		const deepseek = await startDeepSeekRun("persistence-reset-deepseek", home, runRoot, path.join(runRoot.path, "capture-deepseek"));
		try {
			expect((await deepseek.session.prompt("one deepseek exchange")).status).toBe("completed");
			const position = await currentSession(deepseek.session, runRoot);
			const before = await savedDocument(
				home.consumptionFile,
				readActivity,
				held => recordsOf(held).some(saved => saved.id === position.id && saved.saveVersion >= 1),
			);
			// One file, two providers' records: the close below archives this very document, so what it
			// holds is what the archive has to carry.
			expect(before.periodId).toBe(START_PERIOD);
			expect(recordsOf(before).map(saved => saved.id).sort()).toEqual([codexPosition.id, position.id].sort());
			expect(recordOfFile(home.consumptionFile, position.id)?.own[DEEPSEEK_PROVIDER]?.["deepseek-flash"]?.tokens).toEqual(
				usageOfRequests(1, DEEPSEEK_USAGE),
			);
			// The monetary path's own currency field: this provider's accounting produced a CNY amount for
			// the request it counted, and the record carries it beside the tokens rather than instead of them.
			expect(
				recordOfFile(home.consumptionFile, position.id)?.own[DEEPSEEK_PROVIDER]?.["deepseek-flash"]?.costCny,
			).toBeGreaterThan(0);

			// The operator types the command, and the entry's own notice is what says the switch happened.
			expect((await switchWhenTheEntryAllows(deepseek, "clear")).some(notice => notice.level === "info")).toBe(true);

			// The archive is the document that was really replaced — both providers' records — with the two
			// facts only the closing instant states: the end instant, and the boundary reading the
			// endpoint answered (`12.50`, this file's own literal).
			const names = archiveNames(home);
			expect(names).toHaveLength(1);
			const archive = readActivity(path.join(home.archiveDirectory, names[0] as string), ARCHIVE_KEYS);
			expect(recordsOf(archive).find(saved => saved.id === position.id)?.own[DEEPSEEK_PROVIDER]?.["deepseek-flash"]?.tokens).toEqual(
				usageOfRequests(1, DEEPSEEK_USAGE),
			);
			expect(recordsOf(archive).find(saved => saved.id === codexPosition.id)?.own[CODEX_PROVIDER]?.["gpt-6-luna"]?.tokens).toEqual(usageOfRequests(2));
			expect(archive.periodId).toBe(START_PERIOD);
			expect(typeof archive.end).toBe("string");
			expect(archive.end_bal).toBe(12.5);

			// The new activity document names another period, carries the same boundary reading as its start
			// and holds no session at all; the estimate is untouched, byte for byte.
			const opened = readActivity(home.consumptionFile);
			expect(opened.periodId).not.toBe(START_PERIOD);
			expect(opened.holiday).toBe(false);
			expect(recordsOf(opened)).toEqual([]);
			expect(opened.start_bal).toBe(12.5);
			expect(readFileSync(home.estimateFile, "utf8")).toBe(estimateBefore);
			// The root holds exactly the three approved documents and nothing else, archives included —
			// no ledger, no per-round file, no account record.
			expect(jsonFiles(home)).toEqual([
				`${ARCHIVE_DIRECTORY}/${names[0] as string}`,
				ESTIMATE_FILE,
				CONSUMPTION_FILE,
			]);

			// A second close opens yet another period, and the archive the first one left is not touched:
			// each close's own file is the record of the period it closed.
			const firstArchive = readFileSync(path.join(home.archiveDirectory, names[0] as string), "utf8");
			expect((await switchWhenTheEntryAllows(deepseek, "clear")).some(notice => notice.level === "info")).toBe(true);
			const afterSecond = archiveNames(home);
			expect(afterSecond).toHaveLength(2);
			expect(afterSecond).toContain(names[0]);
			expect(readFileSync(path.join(home.archiveDirectory, names[0] as string), "utf8")).toBe(firstArchive);
			// The archive the second close wrote is the document the first close had published: same period
			// id, no session in it — the empty activity the first close opened.
			const other = afterSecond.find(name => name !== names[0]) as string;
			const second = readActivity(path.join(home.archiveDirectory, other), ARCHIVE_KEYS);
			expect(recordsOf(second)).toEqual([]);
			expect(second.periodId).toBe(opened.periodId);
			expect(readFileSync(home.estimateFile, "utf8")).toBe(estimateBefore);
			expect(readActivity(home.consumptionFile).periodId).not.toBe(opened.periodId);
		} finally {
			await disposeRun(deepseek);
			runRoot.dispose();
			disposeHome(home);
		}
	}, 600_000);

	test("a later process reads both documents back and continues from them (P52)", async () => {
		const home = isolatedHome("restart");
		const runRoot = createRunRoot("persistence-restart");
		const at = Date.now();
		const first = await startCodexRun(home, runRoot, {
			answers: accountAnswers(at),
			captureDir: path.join(runRoot.path, "capture-first"),
			accountDir: path.join(runRoot.path, "account-first"),
		});
		let position: { readonly id: string; readonly file: string };
		try {
			for (const prompt of ["first codex exchange", "second codex exchange"]) {
				expect((await first.session.prompt(prompt)).status).toBe("completed");
			}
			position = await currentSession(first.session, runRoot);
			await savedDocument(
				home.consumptionFile,
				readActivity,
				held => recordsOf(held).some(saved => saved.id === position.id && saved.saveVersion >= 2),
			);
			expect(noticesOf(first.session)).toEqual([]);
		} finally {
			await disposeRun(first);
		}

		// A second, independent process over the same isolated home: its extension reads the documents the
		// first one left as its baseline, and the conversation is resumed from the file it persisted. Its
		// own account answers are the same two the first process ran on, so its own measurement continues
		// from the baseline the document carries rather than from a fresh anchor.
		const second = await startCodexRun(home, runRoot, {
			answers: accountAnswers(at),
			captureDir: path.join(runRoot.path, "capture-second"),
			accountDir: path.join(runRoot.path, "account-second"),
		});
		try {
			const switched = payloadRecord(await second.session.request({ type: "switch_session", sessionPath: position.file }));
			expect(switched.cancelled).toBe(false);
			expect((await currentSession(second.session, runRoot)).id).toBe(position.id);
			expect((await second.session.prompt("one more codex exchange")).status).toBe("completed");

			// The activity document continues the record it read: the same period, one version further, and
			// one more request's own buckets on top of the saved total.
			const continued = await savedDocument(
				home.consumptionFile,
				readActivity,
				held => recordsOf(held).find(saved => saved.id === position.id)?.saveVersion === 3,
			);
			expect(continued.periodId).toBe(START_PERIOD);
			expect(recordsOf(continued).find(saved => saved.id === position.id)?.own[CODEX_PROVIDER]?.["gpt-6-luna"]?.tokens).toEqual(usageOfRequests(3));
			// Neither process reported a baseline it could not use: both documents were read back as the
			// approved ones rather than skipped.
			expect(noticesOf(second.session)).toEqual([]);

			// The measurement continues from the baseline the document carries, not from a fresh anchor: the
			// resumed process's first qualifying pair moves the five-hour window up 60 points and the weekly
			// one 10 from *that* baseline, so its ratio is 60/10 = 6 — and this instance has published no
			// refinement yet, so the file takes it at once.
			const estimate = await savedDocument(home.estimateFile, readEstimate, held => held.ratio === 6);
			expect(estimate.baseline.fiveHour.usedPercent).toBe(10);
			expect(estimate.baseline.weekly.usedPercent).toBe(20);
			expect(jsonFiles(home)).toEqual([ESTIMATE_FILE, CONSUMPTION_FILE]);
		} finally {
			await disposeRun(second);
			runRoot.dispose();
			disposeHome(home);
		}
	}, 600_000);

	test("a subagent's own record is saved before its parent's, naming the parent it has (P52)", async () => {
		const home = isolatedHome("parent");
		const runRoot = createRunRoot("persistence-parent");
		/**
		 * What the document held while the main session's own round — the one that delegated — was still
		 * open: the children's records, each already naming the parent's id, and no record for the parent
		 * itself.
		 */
		let whileTheParentWasUnsaved: SavedActivity | undefined;
		const capture = startCaptureServer({
			dir: runRoot.captureDir,
			replyText: "dock persistence delegation reply",
			usage: DEEPSEEK_USAGE,
			respond: request => {
				const opening = openingOf(request);
				// A child's own session: its opening message carries the assignment it was given.
				if (opening.includes(CHILD_ONE_ASSIGNMENT)) return yieldStep("first child result");
				if (opening.includes(CHILD_TWO_ASSIGNMENT)) return yieldStep("second child result");
				// The main session: it delegates twice, so the request after the second result is answered
				// once two whole exchanges have turned the event loop over — the moment the first child's
				// round-end save has landed, while the parent's round is still open.
				const answered = answeredTurns(request);
				if (answered === 0) return delegationStep(CHILD_ONE_NAME, CHILD_ONE_ASSIGNMENT);
				if (answered === 1) return delegationStep(CHILD_TWO_NAME, CHILD_TWO_ASSIGNMENT);
				if (whileTheParentWasUnsaved === undefined && existsSync(home.consumptionFile)) {
					whileTheParentWasUnsaved = readActivity(home.consumptionFile);
				}
				return {};
			},
		});
		writeProviderOverride(runRoot.agentDir, DEEPSEEK_PROVIDER, { baseUrl: capture.baseUrl, apiKey: DOCK_CREDENTIAL });
		// Blocking delegation is what this case needs: an RPC host otherwise runs each spawn as a
		// background job, and the child's round would end after the parent's prompt returned.
		writeAgentSettings(runRoot.agentDir, { "async.enabled": false });
		try {
			const session = await ControlledSession.start({
				harness,
				runRoot,
				extensions: [MODEL_COST_ENTRYPOINT],
				model: DEEPSEEK_SELECTOR,
				env: { [DOCK_CAPTURE_BASE_URL_ENV]: capture.baseUrl, ...home.env },
				promptTimeoutMs: 120_000,
			});
			try {
				expect((await session.prompt(DELEGATE_PROMPT)).status).toBe("completed");
				const position = await currentSession(session, runRoot);
				const document = await savedDocument(home.consumptionFile, readActivity, held => recordsOf(held).length >= 3);
				const parent = recordsOf(document).find(saved => saved.id === position.id);
				const children = recordsOf(document).filter(saved => saved.id !== position.id);
				expect(children).toHaveLength(2);
				expect(parent?.parent).toBeNull();
				// Every child names its direct parent, and each holds its own single request while the parent
				// holds the three its own round issued.
				for (const child of children) {
					expect(child.parent).toBe(position.id);
					expect(child.own[DEEPSEEK_PROVIDER]?.["deepseek-flash"]?.tokens).toEqual(usageOfRequests(1, DEEPSEEK_USAGE));
				}
				expect(parent?.own[DEEPSEEK_PROVIDER]?.["deepseek-flash"]?.tokens).toEqual(usageOfRequests(3, DEEPSEEK_USAGE));

				// The subagent runtime: each child's own record carries the duration the host really
				// measured for its executions, as a positive number of milliseconds, and the parent's record
				// — the main session's own — carries none. What is committed may be the last reading the
				// commit caught rather than the settled one (a settled reading that arrived after a child's
				// own commit is allowed to be unsaved), but a subagent whose executions the host measured is
				// never left unknown here: the host states each spawn's own duration while it runs.
				expect(children.every(child => typeof child.runtimeMs === "number" && child.runtimeMs > 0)).toBe(true);
				expect(parent?.runtimeMs).toBeUndefined();
				// And the run reported no unusable runtime: every execution the host stated was attributed to
				// the session it ran in and read as a duration, which is what an extension notices when it
				// cannot (see `tests/framework/subagent-runtime.test.ts` for both failure shapes).
				expect(noticesOf(session)).toEqual([]);

				// The moment itself: the children's records were on disk while their parent had none, and each
				// already named the parent's id. A record therefore never waits for its parent to be saved.
				const unsaved = whileTheParentWasUnsaved;
				if (unsaved === undefined) throw new Error("the main session's post-delegation request was never observed");
				const savedThen = recordsOf(unsaved);
				expect(savedThen.length).toBeGreaterThan(0);
				expect(savedThen.every(saved => saved.id !== position.id)).toBe(true);
				expect(savedThen.every(saved => saved.parent === position.id)).toBe(true);
			} finally {
				if (session.exited() === null) await session.stop({ timeoutMs: 15_000 });
			}
		} finally {
			capture.stop();
			runRoot.dispose();
			disposeHome(home);
		}
	}, 600_000);
});
