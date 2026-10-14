/**
 * The main session's Session span on the real host, as a real submission establishes it (P1, P2; S1,
 * S2, S3).
 *
 * This is the isolated real-host smoke of the half a controlled double cannot answer: the dock
 * materialises the recorded baseline install, loads this repository's own model-cost entrypoint
 * through the harness's real loader, and drives a real RPC session — so the submission the extension
 * is told about is the harness's own `input` fact for a prompt this client really sent, and the span's
 * end is the real response's own settle, as that Turn's own delivery states it. Nothing here models a
 * harness: that fact has no other source, and a harness that published none would leave the session
 * with no start at all.
 *
 * What is read back is both halves of the observable path: the document the extension itself wrote
 * into its shipped storage root (a record's own span, among the root's real files), and the widget the
 * host was told to draw (the `setWidget` frames the CLI renders). The instants are the machine's own,
 * so the cases assert the relations those instants really have — the start is the submission rather
 * than the session's creation, and a second submission moves the end and not the start — instead of
 * hard-coded values.
 *
 * One case submits a skill rather than prose: the run writes its own `SKILL.md` into its isolated
 * agent state, the user invokes it as `/skill:<name>`, and the harness's request is read back for the
 * skill's own body. That makes the skill half of `P2` an observation about a submission the harness
 * really resolved as a user-invoked skill, not an inference from the shape of a prompt.
 *
 * Every request is reached through the dock's own capture endpoint, so the run needs no credential
 * and nothing leaves the machine; its agent state, session directory, working directory and storage
 * root all sit inside its temporary run root, and nothing here touches the production OMP
 * environment.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { MODEL_COST_WIDGET_KEY } from "../../extensions/model-cost/harnesses/omp/widget";
import { writeProviderOverride } from "./agent-config";
import { type IsolatedHarness, REPO_ROOT, ensureIsolatedHarness, readBaselineRecord } from "./baseline";
import { type CaptureServer, startCaptureServer } from "./capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV } from "./fixtures/extension-root/provider";
import { type RunRoot, createRunRoot } from "./run-root";
import { ControlledSession } from "./session";

const record = readBaselineRecord();
/** The extension's own OMP entrypoint, as the harness's loader discovers it. */
const MODEL_COST_ENTRYPOINT = path.join(REPO_ROOT, "entrypoints", "omp", "model-cost.ts");
/** The provider and model the run uses: one the extension's own data prices in CNY. */
const PROVIDER = "deepseek";
const MODEL_SELECTOR = `${PROVIDER}/deepseek-flash`;
/** The usage the capture endpoint reports, as the wire numbers it sends. */
const CAPTURE_USAGE = { input: 2000, output: 1000, cacheRead: 1000 };
/** The document the extension keeps in its shipped storage root. */
const CONSUMPTION_FILE = "consumption.json";
/** The submission the first Round carries, and the second one that must not restart the clock. */
const FIRST_PROMPT = "dock span run: one exchange for the session span";
const SECOND_PROMPT = "dock span run: a second exchange in the same session";
/** The user-invoked skill one case carries: its name, and the marker only its own body holds. */
const SKILL_NAME = "dock-span-skill";
const SKILL_BODY = "DOCK-SPAN-SKILL-MARKER-7f31 — this skill's own body, present only while it runs.";
/** The user's own submission of that skill, exactly as the RPC client sends it. */
const SKILL_PROMPT = `/skill:${SKILL_NAME} dock span run: one exchange through a user-invoked skill`;
/**
 * How long the run leaves the session idle before the first submission.
 *
 * This is the one genuine delay here, and it is the case's own subject rather than a waiting device:
 * the assertion below is that the start is the submission instant and *not* the session's creation,
 * which only means something while the two instants are really apart on the platform clock. No fake
 * timer can place them apart — the session is a real process the harness drives — so a short real
 * pause is what makes them the two distinct instants the case is about.
 */
const PRE_SUBMISSION_PAUSE_MS = 1_500;
/** The slack the start's bound allows for the two processes' clocks and the client's own dispatch. */
const SUBMISSION_SLACK_MS = 500;

let harness: IsolatedHarness;

beforeAll(async () => {
	harness = await ensureIsolatedHarness(record);
}, 900_000);

/** One session's own time fact as the document holds it, in epoch milliseconds. */
interface SavedSpan {
	readonly start: number;
	readonly end: number;
}

/** One session record as the document holds it, for the fields these cases read. */
interface SavedRecord {
	readonly id: string;
	readonly name: string;
	readonly saveVersion: number;
	readonly span?: SavedSpan;
}

/** Whether a parsed value is a mapping, the only shape any level of this document is built from. */
function isMapping(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One record's own time fact, or nothing when the document does not hold a readable pair there. */
function savedSpanOf(value: unknown): SavedSpan | undefined {
	if (!isMapping(value)) return undefined;
	const { start, end } = value;
	if (typeof start !== "number" || typeof end !== "number") return undefined;
	return { start, end };
}

/** Whether one value is a session record of this schema, with the fields these cases read. */
function isSavedRecord(value: unknown): value is SavedRecord {
	if (!isMapping(value)) return false;
	return (
		typeof value.id === "string" &&
		typeof value.name === "string" &&
		typeof value.saveVersion === "number" &&
		(value.span === undefined || savedSpanOf(value.span) !== undefined)
	);
}

/** Every session record the document holds right now, or nothing while it holds no document. */
function recordsOf(file: string): readonly SavedRecord[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(file, "utf8"));
	} catch {
		return [];
	}
	if (!isMapping(parsed) || !isMapping(parsed.harnesses)) return [];
	const records: SavedRecord[] = [];
	for (const bucket of Object.values(parsed.harnesses)) {
		if (!isMapping(bucket) || !Array.isArray(bucket.sessions)) continue;
		for (const session of bucket.sessions) {
			if (isSavedRecord(session)) records.push({ ...session, span: savedSpanOf(session.span) });
		}
	}
	return records;
}

/** One run's isolated home, the storage root the shipped configuration names in it, and the session. */
interface DockRun {
	readonly session: ControlledSession;
	readonly capture: CaptureServer;
	readonly runRoot: RunRoot;
	readonly storageDirectory: string;
	readonly consumptionFile: string;
	/** The instant this client asked for the session process, before any submission was made. */
	readonly startedAt: number;
}

/** What one run is given before its session starts: nothing, or the skill it must be able to invoke. */
interface StartRunOptions {
	/** A user-invoked skill to make discoverable in this run's own agent state. */
	readonly skill?: { readonly name: string; readonly body: string };
}

/**
 * One skill file inside the run's own agent state, where the harness's own user-level skill scan
 * looks for it (`skills/<name>/SKILL.md` under `PI_CODING_AGENT_DIR`).
 *
 * The harness reads the description from the frontmatter — a skill without one is not discovered —
 * and takes the body as the skill's own material. The fixture is written before the session starts,
 * because the harness resolves the skills a session may invoke while it boots; it lives and dies
 * inside this run's temporary run root, and no shipped configuration or skill is touched by it.
 */
function writeSkillFixture(agentDir: string, skill: { readonly name: string; readonly body: string }): void {
	const directory = path.join(agentDir, "skills", skill.name);
	mkdirSync(directory, { recursive: true });
	writeFileSync(
		path.join(directory, "SKILL.md"),
		`---\nname: ${skill.name}\ndescription: Dock fixture skill, present only in this run's own agent state.\n---\n\n${skill.body}\n`,
	);
}

/** One run: an isolated home whose storage root the extension's own shipped `config.yaml` names. */
async function startRun(label: string, options?: StartRunOptions): Promise<DockRun> {
	const runRoot = createRunRoot(label);
	const home = path.join(runRoot.path, "user-home");
	const storageDirectory = path.join(home, ".omp", "cost-archive");
	mkdirSync(storageDirectory, { recursive: true });
	if (options?.skill !== undefined) writeSkillFixture(runRoot.agentDir, options.skill);
	const capture = startCaptureServer({ dir: runRoot.captureDir, replyText: "dock model-cost reply", usage: CAPTURE_USAGE });
	writeProviderOverride(runRoot.agentDir, PROVIDER, { baseUrl: capture.baseUrl, apiKey: "dock-key" });
	const startedAt = Date.now();
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
		return {
			session,
			capture,
			runRoot,
			storageDirectory,
			consumptionFile: path.join(storageDirectory, CONSUMPTION_FILE),
			startedAt,
		};
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

/** Lets the event loop turn over, so the child's own frames and files are read as they arrive. */
async function queuedWorkSettled(): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>();
	setImmediate(resolve);
	await promise;
}

/** Waits until a session's record holds what a case expects of it, and answers with that record. */
async function savedRecord(file: string, accept: (record: SavedRecord) => boolean): Promise<SavedRecord> {
	const deadline = Date.now() + 30_000;
	for (;;) {
		const record = recordsOf(file).find(accept);
		if (record !== undefined) return record;
		if (Date.now() > deadline) {
			throw new Error(`no session record the case expects was published at ${file}: ${JSON.stringify(recordsOf(file))}`);
		}
		await queuedWorkSettled();
	}
}

/** The lines of the last widget the host was told to show, or nothing when it was cleared. */
function shownLines(session: ControlledSession): string[] | undefined {
	const shown = session
		.frames()
		.filter(
			frame =>
				frame.type === "extension_ui_request" && frame.method === "setWidget" && frame.widgetKey === MODEL_COST_WIDGET_KEY,
		)
		.filter(frame => frame.widgetLines !== undefined);
	const last = shown[shown.length - 1];
	return last === undefined ? undefined : (last.widgetLines as string[]);
}

/** Waits until the widget's own Total line carries a reading the case expects, and answers with it. */
async function totalLineUntil(session: ControlledSession, accept: (line: string) => boolean): Promise<string> {
	const deadline = Date.now() + 30_000;
	for (;;) {
		const line = shownLines(session)?.find(candidate => candidate.startsWith("Total:"));
		if (line !== undefined && accept(line)) return line;
		if (Date.now() > deadline) {
			throw new Error(`no Total line the case expects was drawn; last was:\n${shownLines(session)?.join("\n") ?? "<none>"}`);
		}
		await queuedWorkSettled();
	}
}

/** One elapsed interval as the Total's own column writes it: whole hours, minutes and seconds. */
function displayedSpan(elapsedMs: number): string {
	const seconds = Math.floor(elapsedMs / 1000);
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

describe("a real submission establishes and advances the main session's span (P1, P2, P8, P14)", () => {
	test("one submission yields a saved span whose start is the submission, and the real widget draws it", async () => {
		const run = await startRun("model-cost-span");
		try {
			// The session process is up and idle for well over a second before the operator says
			// anything: a start taken from the session's creation, its first request or the session file
			// would be measurably earlier than the instant below.
			await Bun.sleep(PRE_SUBMISSION_PAUSE_MS);
			const submittedAt = Date.now();
			expect((await run.session.prompt(FIRST_PROMPT)).status).toBe("completed");
			const settledAt = Date.now();
			expect(run.capture.requests()).toHaveLength(1);

			// The host published its own submission fact for this prompt — a harness that published none
			// would have left the session without a start and said so on the non-model channel.
			expect(run.session.stderr()).not.toContain("publishes no submission event");

			// The document the extension wrote carries the pair, and the start really is the submission:
			// after the session had already been running, and no later than the response settling.
			const record = await savedRecord(run.consumptionFile, candidate => candidate.span !== undefined);
			const span = record.span;
			if (span === undefined) throw new Error("the saved record carries no span");
			expect(span.start).toBeGreaterThanOrEqual(submittedAt - SUBMISSION_SLACK_MS);
			expect(span.start).toBeGreaterThanOrEqual(run.startedAt);
			expect(span.start).toBeLessThanOrEqual(settledAt);
			expect(span.end).toBeGreaterThanOrEqual(span.start);
			expect(span.end).toBeLessThanOrEqual(Date.now());
			// The Turn it is measured to is this run's own response: its settle is a real instant of the
			// run, and the save that carried the pair is the Round end's commit, which is also the only
			// commit this run made — no time-only file, no extra write.
			expect(record.saveVersion).toBe(1);
			expect(readdirSync(run.storageDirectory).sort()).toEqual([`${CONSUMPTION_FILE}.lock`, CONSUMPTION_FILE].sort());

			// The widget the host was told to draw shows the same reading in the Total row, as a duration
			// rather than the unknown marker: the interval from the submission to the Round's end.
			const total = await totalLineUntil(
				run.session,
				line => line.endsWith(`Span: ${displayedSpan(span.end - span.start)}`),
			);
			expect(total).toContain("Span: ");
		} finally {
			await disposeRun(run);
		}
	}, 240_000);

	test("a second submission in the same session keeps the start and moves the end", async () => {
		const run = await startRun("model-cost-span-second");
		try {
			const submittedAt = Date.now();
			expect((await run.session.prompt(FIRST_PROMPT)).status).toBe("completed");
			const first = await savedRecord(run.consumptionFile, candidate => candidate.span !== undefined);
			const firstSpan = first.span;
			if (firstSpan === undefined) throw new Error("the first saved record carries no span");

			// A second submission in the session: an ordinary follow-up after the first Round ended.
			await Bun.sleep(PRE_SUBMISSION_PAUSE_MS);
			const secondSubmittedAt = Date.now();
			expect((await run.session.prompt(SECOND_PROMPT)).status).toBe("completed");
			expect(run.capture.requests()).toHaveLength(2);
			const second = await savedRecord(
				run.consumptionFile,
				candidate => candidate.span !== undefined && candidate.span.end > firstSpan.end,
			);
			const secondSpan = second.span;
			if (secondSpan === undefined) throw new Error("the second saved record carries no span");

			// The start is the same instant, exactly: the second submission is an input like any other and
			// never a second start. The end is the newer Turn's own settle, so the reading grew rather than
			// being restarted, and it is the interval between the two that includes the idle time between
			// them.
			expect(secondSpan.start).toBe(firstSpan.start);
			expect(firstSpan.start).toBeGreaterThanOrEqual(submittedAt - SUBMISSION_SLACK_MS);
			expect(secondSpan.end).toBeGreaterThanOrEqual(secondSubmittedAt - SUBMISSION_SLACK_MS);
			expect(secondSpan.end - secondSpan.start).toBeGreaterThan(firstSpan.end - firstSpan.start);
			expect(second.saveVersion).toBe(2);

			const total = await totalLineUntil(
				run.session,
				line => line.endsWith(`Span: ${displayedSpan(secondSpan.end - secondSpan.start)}`),
			);
			expect(total).toContain("Span: ");
		} finally {
			await disposeRun(run);
		}
	}, 240_000);

	test("a user-invoked skill's submission is the start, at the instant the user submitted it", async () => {
		const run = await startRun("model-cost-span-skill", { skill: { name: SKILL_NAME, body: SKILL_BODY } });
		try {
			// The session boots with the fixture discoverable and then sits idle, so a start that was not
			// the submission would be measurably earlier; the submission itself is the skill's own name,
			// which is the only submission the harness resolves as a skill rather than as prose. The pause
			// is a real one for the reason the constant above names: the session is a real process, so no
			// fake timer can put the session's creation and the submission where this case needs them.
			await Bun.sleep(PRE_SUBMISSION_PAUSE_MS);
			const submittedAt = Date.now();
			expect((await run.session.prompt(SKILL_PROMPT)).status).toBe("completed");
			const settledAt = Date.now();

			// The submission really was that skill: the request the harness sent its provider carries the
			// skill file's own body, so what the extension was told about is a user-invoked skill that ran
			// and not a slash-shaped prompt. A harness that resolved no such skill would send the raw text
			// and carry no marker at all. It is also this run's only request, which is what makes the saved
			// start the skill submission's own: no other submission and no other Round exists here.
			expect(run.capture.requests()).toHaveLength(1);
			expect(run.capture.requests()[0]?.raw.includes(SKILL_BODY)).toBe(true);

			// The host published its own submission fact for it — the same fact an ordinary prompt gets —
			// and the extension recorded no failure of its own clock while doing so.
			expect(run.session.stderr()).not.toContain("publishes no submission event");
			expect(run.session.stderr()).not.toContain("主会话时间采集失败");

			// The start is the instant the user submitted: after the session had been idle for longer than
			// the slack, and no later than the skill prompt the harness built from that submission settled.
			// Nothing here is read off the resolved skill prompt, the first request or the transcript —
			// those are all later than the submission the user made.
			const record = await savedRecord(run.consumptionFile, candidate => candidate.span !== undefined);
			const span = record.span;
			if (span === undefined) throw new Error("the saved record carries no span");
			expect(span.start).toBeGreaterThanOrEqual(submittedAt - SUBMISSION_SLACK_MS);
			expect(span.start).toBeGreaterThanOrEqual(run.startedAt);
			expect(span.start).toBeLessThanOrEqual(settledAt);
			expect(span.end).toBeGreaterThanOrEqual(span.start);
			expect(record.saveVersion).toBe(1);

			// The widget the host was told to draw shows the same reading, in the Total row.
			const total = await totalLineUntil(
				run.session,
				line => line.endsWith(`Span: ${displayedSpan(span.end - span.start)}`),
			);
			expect(total).toContain("Span: ");
		} finally {
			await disposeRun(run);
		}
	}, 240_000);
});
