/**
 * `/budget holiday` and `/budget clear` on the real patched host (P30, P31, P32, P34, P35, P36; S5).
 *
 * This is the isolated real-host observation of the period switch: the dock materialises the
 * recorded baseline install, loads this repository's own model-cost entrypoint through the harness's
 * real loader, and drives a real session whose built-in `deepseek` provider — the provider the
 * command's own entry runs — is redirected, through the isolated agent state and before any
 * extension loads, at the dock's local capture endpoint. So the run answers three questions a
 * controlled double cannot:
 *
 * - the command really reaches the host's own command chain, and the entry the operator is in is
 *   really the one whose provider and idle facts the extension reads;
 * - the host's command chain really waits for the effect: the archive and the new activity are on
 *   disk at the instant the prompt returns, with no wait of this file's own in between;
 * - the boundary balance read really leaves the process, beside the CLI's own startup prefetch,
 *   through the framework's public HTTP module and the host's resolved address.
 *
 * It also shows the one condition that is real rather than scripted: the host saves a session's
 * consumption in the background of its own Round's end, so the operator's very next command can meet
 * that save still publishing. The entry says so and switches nothing, and the operator's own retry —
 * the loop below, which waits on the answer rather than on a duration — is what makes the switch
 * happen. No case here asserts *when* that first refusal lands: it is the host's real timing.
 *
 * The balance the endpoint answers is its own scripted document rather than any account's reading,
 * and the credential is the isolated run's own fixture key. What the switch's own boundary read
 * produces is therefore what the archive's `end_bal` and the new period's `start_bal` must carry, and
 * what a real DeepSeek account would answer remains the operator's own check (see this ticket's
 * evidence note for the sanitized observation method and its skip reason). No case here reaches a
 * real network: every model and balance answer comes from the loopback endpoint inside the run's own
 * temporary root, and nothing touches the production OMP environment, its configuration or its
 * sessions.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { writeProviderOverride } from "./agent-config";
import { type IsolatedHarness, REPO_ROOT, ensureIsolatedHarness, readBaselineRecord } from "./baseline";
import { type CaptureServer, startCaptureServer } from "./capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV } from "./fixtures/extension-root/provider";
import { type RunRoot, createRunRoot } from "./run-root";
import { ControlledSession } from "./session";

const record = readBaselineRecord();
/** The extension's own OMP entrypoint, as the harness's loader discovers it. */
const MODEL_COST_ENTRYPOINT = path.join(REPO_ROOT, "entrypoints", "omp", "model-cost.ts");
/** The document the extension keeps in its storage root, and its archives' directory. */
const CONSUMPTION_FILE = "consumption.json";
const ARCHIVE_DIRECTORY = "archives";
/** The model this run uses: the built-in provider the isolated agent state redirects. */
const MODEL_SELECTOR = "deepseek/deepseek-flash";
const PROVIDER = "deepseek";
/** The credential the isolated state configures for that provider: this run's own fixture key. */
const DOCK_CREDENTIAL = "dock-key";
/** The one usage every completion reports, so a saved record has consumption to archive. */
const CAPTURE_USAGE = { input: 2000, output: 1000, cacheRead: 1000 };
/** The balance the endpoint answers, in the provider's own currency: the boundary reading. */
const BOUNDARY_TOTAL = "12.50";
/** The period the run starts on, as the isolated storage root's own baseline document states it. */
const START_PERIOD = "period-dock-switch";

let harness: IsolatedHarness;

beforeAll(async () => {
	harness = await ensureIsolatedHarness(record);
});

/** One operator notice a run emitted, as the harness itself framed it. */
interface Notice {
	readonly level: unknown;
	readonly message: string;
}

/** One provisioned run: the session, the capture endpoint behind it and the isolated root. */
interface DockRun {
	readonly session: ControlledSession;
	readonly capture: CaptureServer;
	readonly runRoot: RunRoot;
	/** The extension's own storage root in this run, where its documents live. */
	readonly storageDirectory: string;
	readonly consumptionFile: string;
}

/** One run whose built-in DeepSeek provider answers from the capture endpoint. */
async function startRun(label: string): Promise<DockRun> {
	const runRoot = createRunRoot(label);
	const home = path.join(runRoot.path, "user-home");
	const storageDirectory = path.join(home, ".omp", "cost-archive");
	mkdirSync(storageDirectory, { recursive: true });
	writeFileSync(
		path.join(storageDirectory, CONSUMPTION_FILE),
		JSON.stringify({
			schemaVersion: 1,
			periodId: START_PERIOD,
			start: "2026-10-01T00:00:00.000Z",
			holiday: false,
			harnesses: { omp: { sessions: [] } },
		}),
		"utf8",
	);
	const capture = startCaptureServer({
		dir: runRoot.captureDir,
		replyText: "dock period-switch reply",
		usage: CAPTURE_USAGE,
		balance: { total: BOUNDARY_TOTAL },
	});
	writeProviderOverride(runRoot.agentDir, PROVIDER, { baseUrl: capture.baseUrl, apiKey: DOCK_CREDENTIAL });
	try {
		const session = await ControlledSession.start({
			harness,
			runRoot,
			extensions: [MODEL_COST_ENTRYPOINT],
			model: MODEL_SELECTOR,
			env: {
				[DOCK_CAPTURE_BASE_URL_ENV]: capture.baseUrl,
				USERPROFILE: home,
				HOME: home,
				HOMEDRIVE: path.parse(home).root,
				HOMEPATH: home.slice(path.parse(home).root.length - 1),
			},
			promptTimeoutMs: 120_000,
		});
		return { session, capture, runRoot, storageDirectory, consumptionFile: path.join(storageDirectory, CONSUMPTION_FILE) };
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

/** The operator notices one run emitted, as the harness itself framed them. */
function noticesOf(session: ControlledSession): Notice[] {
	return session
		.frames()
		.filter(frame => frame.type === "extension_ui_request" && frame.method === "notify")
		.map(frame => ({ level: frame.notifyType, message: String(frame.message) }));
}

/**
 * Types one period command as the operator would, and answers with the notices it produced.
 *
 * A command the entry refuses because its own earlier save is still publishing is retried: the loop
 * waits on the answer the entry gave rather than on a duration, and the run is a real child process
 * whose save completes on its own. The retries are bounded only so that a command the entry never
 * accepts fails the case instead of hanging it.
 */
async function switchWhenTheEntryAllows(run: DockRun, action: "holiday" | "clear"): Promise<Notice[]> {
	const before = noticesOf(run.session).length;
	for (let attempt = 0; attempt < 50; attempt += 1) {
		await run.session.prompt(`/budget ${action}`);
		const produced = noticesOf(run.session).slice(before);
		if (produced.some(notice => notice.level === "info")) return produced;
		const { promise, resolve } = Promise.withResolvers<void>();
		setImmediate(resolve);
		await promise;
	}
	throw new Error(`/budget ${action} was never accepted: ${JSON.stringify(noticesOf(run.session))}`);
}

/** The document one run's storage root holds, as the plain JSON document it is. */
function documentOf(file: string): Record<string, unknown> {
	return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
}

/** Every session record one parsed document holds, whichever harness bucket carries it. */
function sessionsOf(document: Record<string, unknown>): Record<string, unknown>[] {
	const harnesses = document.harnesses as Record<string, { readonly sessions: Record<string, unknown>[] }> | undefined;
	return Object.values(harnesses ?? {}).flatMap(bucket => bucket.sessions);
}

/** The archive files one run's storage root holds, by name. */
function archiveNames(storageDirectory: string): string[] {
	const directory = path.join(storageDirectory, ARCHIVE_DIRECTORY);
	return existsSync(directory) ? readdirSync(directory).sort() : [];
}

/** One archive of a run, as the plain JSON document it is. */
function archiveOf(storageDirectory: string, name: string): Record<string, unknown> {
	return JSON.parse(readFileSync(path.join(storageDirectory, ARCHIVE_DIRECTORY, name), "utf8")) as Record<string, unknown>;
}

/**
 * Waits until the document on disk holds what a case expects of it, and answers with its text.
 *
 * The run is a real child process whose saves land when the host really published them, so the wait
 * is on the document itself rather than on a duration; the deadline only keeps a save that never
 * lands from hanging the case.
 */
async function savedText(file: string, accept: (text: string) => boolean): Promise<string> {
	const deadline = Date.now() + 20_000;
	for (;;) {
		if (existsSync(file)) {
			const text = readFileSync(file, "utf8");
			if (accept(text)) return text;
		}
		if (Date.now() > deadline) throw new Error(`no consumption document the case expects was published at ${file}`);
		const { promise, resolve } = Promise.withResolvers<void>();
		setImmediate(resolve);
		await promise;
	}
}

describe("the real host's period switch archives the period it closes and opens the next one (P30, P31, P32, P34, P35, P36)", () => {
	test("the prompt returns with the archive and the new period already on disk, and a repeated holiday switches nothing", async () => {
		const run = await startRun("model-cost-period-switch");
		try {
			// One ordinary exchange first: the session's own Round ends and the extension saves its own
			// record into the document the switch is about to close.
			expect((await run.session.prompt("one exchange before the switch")).status).toBe("completed");
			const before = await savedText(run.consumptionFile, text => text.includes("\"own\""));
			const previous = JSON.parse(before) as Record<string, unknown>;
			expect(previous.periodId).toBe(START_PERIOD);
			// The period the switch closes holds its own time: this run's own submission as the start,
			// measured to the Round end that save belongs to.
			const [priorRecord] = sessionsOf(previous);
			const priorSpan = priorRecord?.span as { readonly start?: number; readonly end?: number } | undefined;
			if (typeof priorSpan?.start !== "number" || typeof priorSpan.end !== "number") {
				throw new Error(`the closed period's own record carries no span: ${JSON.stringify(priorRecord)}`);
			}
			expect(priorSpan.end).toBeGreaterThanOrEqual(priorSpan.start);
			// The CLI's own startup prefetch is the only balance query so far.
			expect(run.capture.balanceCalls()).toHaveLength(1);

			const notices = await switchWhenTheEntryAllows(run, "clear");

			// Whatever the entry answered while its own save was still publishing, the switch itself was
			// reported exactly once — and only the entry's own pending-save refusal could precede it.
			expect(notices.filter(notice => notice.level === "info")).toHaveLength(1);
			expect(notices[notices.length - 1]?.level).toBe("info");
			expect(
				notices
					.filter(notice => notice.level !== "info")
					.every(notice => notice.level === "warning" && notice.message.includes("保存尚未收口")),
			).toBe(true);

			// The host waited for the effect: the archive and the new period are read off the file system
			// here, with no wait of this file's own between the prompt's answer and these reads.
			const names = archiveNames(run.storageDirectory);
			expect(names).toHaveLength(1);
			const closed = archiveOf(run.storageDirectory, names[0] as string);
			const opened = documentOf(run.consumptionFile);
			expect(closed.end).toBe(opened.start);
			expect(Number.isNaN(Date.parse(String(closed.end)))).toBe(false);
			// The archive is the whole document the period held — every harness and session — plus its end.
			expect(closed).toEqual({ ...previous, end: closed.end, end_bal: 12.5 });
			// And the new activity is the next period in one commit: a new generation, holiday off, no
			// session carried over, and the same boundary reading as its own start balance.
			expect(opened).toEqual({
				schemaVersion: 1,
				periodId: opened.periodId,
				start: closed.end,
				start_bal: 12.5,
				holiday: false,
				harnesses: {},
			});
			expect(opened.periodId).not.toBe(START_PERIOD);
			// The period's own time goes with the period it belonged to: the new activity holds no session
			// at all, so nothing of the closed period's span is in it.
			expect(sessionsOf(opened)).toEqual([]);
			// The boundary read really left the process: one more balance query on the provider's own path.
			const calls = run.capture.balanceCalls();
			expect(calls.length).toBeGreaterThanOrEqual(2);
			const lastCall = calls[calls.length - 1]!;
			expect(new URL(lastCall.url).pathname).toBe("/user/balance");
			expect(lastCall.headers.authorization).toBe(`Bearer ${DOCK_CREDENTIAL}`);

			// A holiday opens the next period as a holiday period, archiving the period it closes.
			const holidayNotices = await switchWhenTheEntryAllows(run, "holiday");
			expect(holidayNotices.filter(notice => notice.level === "info")).toHaveLength(1);
			const holidayNames = archiveNames(run.storageDirectory);
			expect(holidayNames).toHaveLength(2);
			const holidayDocument = documentOf(run.consumptionFile);
			expect(holidayDocument.holiday).toBe(true);
			expect(holidayDocument.periodId).not.toBe(opened.periodId);
			expect(run.capture.balanceCalls().length).toBeGreaterThanOrEqual(3);

			// Asking for the holiday again is idempotent on the real host too: the same answer, the same
			// period, the same archives and no further balance query.
			const repeatedBytes = readFileSync(run.consumptionFile, "utf8");
			const refused = noticesOf(run.session).length;
			expect((await run.session.prompt("/budget holiday")).status).toBe("completed");
			const repeated = noticesOf(run.session).slice(refused);
			expect(repeated).toHaveLength(1);
			expect(repeated[0]?.level).toBe("info");
			expect(readFileSync(run.consumptionFile, "utf8")).toBe(repeatedBytes);
			expect(archiveNames(run.storageDirectory)).toHaveLength(2);
			expect(run.capture.balanceCalls().length).toBeGreaterThanOrEqual(3);
		} finally {
			await disposeRun(run);
		}
	}, 300_000);
});
