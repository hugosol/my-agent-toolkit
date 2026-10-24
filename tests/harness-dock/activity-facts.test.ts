/**
 * The activity axis on a real harness (S3; contract P10, P33; ticket 02).
 *
 * This is the isolated real-host observation of the reading an extension consumes at the public
 * interface: the dock materialises the recorded baseline install, loads this repository's own
 * model-cost entrypoint and two probe fixtures through the harness's real loader, and drives real RPC
 * sessions whose model requests go to the dock's local capture endpoint. Nothing here is a double: the
 * runs, the tool execution, the responses, the usage the endpoint reports and the host's own task the
 * framework re-checks an end candidate on are the host's.
 *
 * What is observed is the sequence itself. The activity probe records every `session_activity`
 * delivery, in order, and the round probe (`round-facts`) records the edges the same run dispatched, so
 * a case can place each reading against the edge that produced it and against nothing else. The cases
 * below are the acceptance scenarios of the promise, on the harness rather than in a substitute:
 *
 * - one prompt whose run makes two model requests (a tool continuation) is one period of work: the
 *   session reads `working` once and `idle` once, and no reading at all appears between them — the
 *   continuation is a pause inside the Round, not an end;
 * - a second prompt in the same session opens a second Round and reads its own pair, so the reading
 *   tracks the framework's Round rather than sticking after the first run or repeating itself;
 * - a session that is left while its run is in flight keeps reading `working` — the switch states no
 *   end, saves nothing and turns nothing idle — and the Round it had open is the one its own
 *   settlement ends afterwards.
 *
 * Every expectation is a hand-computed literal of the sequence: which readings exist, in which order,
 * for which actual session, and how many of each — never a value recomputed from the extension.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { writeProviderOverride } from "./agent-config";
import { type IsolatedHarness, REPO_ROOT, ensureIsolatedHarness, readBaselineRecord } from "./baseline";
import { type CaptureServer, type CaptureServerOptions, startCaptureServer } from "./capture-server";
import { ACTIVITY_FACTS_ID } from "./fixtures/activity-facts/entrypoint";
import { DOCK_CAPTURE_BASE_URL_ENV } from "./fixtures/extension-root/provider";
import { type RunRoot, createRunRoot } from "./run-root";
import { ControlledSession } from "./session";

const record = readBaselineRecord();
/** The extension's own OMP entrypoint, as the harness's loader discovers it. */
const MODEL_COST_ENTRYPOINT = path.join(REPO_ROOT, "entrypoints", "omp", "model-cost.ts");
/** The dock's own provider fixture, which redirects the extension's provider to the capture endpoint. */
const PROVIDER_FIXTURE = path.join(import.meta.dir, "fixtures", "extension-root", "provider.ts");
/** The probe that records the public activity readings. */
const ACTIVITY_FACTS_FIXTURE = path.join(import.meta.dir, "fixtures", "activity-facts", "entrypoint.ts");
/** The probe that records the public Round edges the readings are placed against. */

/** The document the extension keeps in its storage root. */
const CONSUMPTION_FILE = "consumption.json";

/** The usage the capture endpoint reports for every completion, as the wire numbers it sends. */
const WIRE_PROMPT_TOKENS = 10;
const WIRE_CACHED_TOKENS = 3;
const WIRE_COMPLETION_TOKENS = 7;
const CAPTURE_USAGE = { input: WIRE_PROMPT_TOKENS, output: WIRE_COMPLETION_TOKENS, cacheRead: WIRE_CACHED_TOKENS };

/** One response's usage as the extension accounts it: the four buckets it stores. */
const ONE_RESPONSE_TOKENS = {
	input: WIRE_PROMPT_TOKENS - WIRE_CACHED_TOKENS,
	cacheRead: WIRE_CACHED_TOKENS,
	cacheWrite: 0,
	output: WIRE_COMPLETION_TOKENS,
};

/** The provider and model the runs use: the recorded provider, redirected at the capture endpoint. */
const MODEL_PROVIDER = "deepseek";
const MODEL_ID = "deepseek-flash";
const MODEL_SELECTOR = `${MODEL_PROVIDER}/${MODEL_ID}`;

/** The one tool call the tool run scripts, and the argument string it carries. */
const TOOL_CALL_TEXT = "dock-activity-tool-ran";
const TOOL_PROMPT = "dock run: use one tool and finish";
const FIRST_PROMPT = "dock run: one exchange";
const SECOND_PROMPT = "dock run: one more exchange in this session";
const SWITCH_PROMPT = "dock run: left behind while this run is in flight";

let harness: IsolatedHarness;

beforeAll(async () => {
	harness = await ensureIsolatedHarness(record);
});

/** One run's isolated home and the storage root the extension's shipped configuration names inside it. */
interface IsolatedHome {
	readonly home: string;
	readonly consumptionFile: string;
	readonly env: Record<string, string>;
}

function isolateHome(runRoot: RunRoot): IsolatedHome {
	const home = path.join(runRoot.path, "user-home");
	const storageDirectory = path.join(home, ".omp", "cost-archive");
	mkdirSync(storageDirectory, { recursive: true });
	return {
		home,
		consumptionFile: path.join(storageDirectory, CONSUMPTION_FILE),
		env: {
			USERPROFILE: home,
			HOME: home,
			HOMEDRIVE: path.parse(home).root,
			HOMEPATH: home.slice(path.parse(home).root.length - 1),
		},
	};
}

/** One provisioned run: the session, its capture endpoint and the isolated root behind it. */
interface DockRun {
	readonly session: ControlledSession;
	readonly capture: CaptureServer;
	readonly runRoot: RunRoot;
	readonly home: IsolatedHome;
}

/** One run: both probes and the extension's own entrypoint, on the dock's model. */
async function startRun(
	label: string,
	options: { readonly respond?: CaptureServerOptions["respond"]; readonly toolCall?: CaptureServerOptions["toolCall"] } = {},
): Promise<DockRun> {
	const runRoot = createRunRoot(label);
	const home = isolateHome(runRoot);
	const capture = startCaptureServer({
		dir: runRoot.captureDir,
		replyText: "dock activity reply",
		usage: CAPTURE_USAGE,
		...(options.respond === undefined ? {} : { respond: options.respond }),
		...(options.toolCall === undefined ? {} : { toolCall: options.toolCall }),
	});
	writeProviderOverride(runRoot.agentDir, MODEL_PROVIDER, { baseUrl: capture.baseUrl, apiKey: "dock-key" });
	try {
		const session = await ControlledSession.start({
			harness,
			runRoot,
			extensions: [PROVIDER_FIXTURE, MODEL_COST_ENTRYPOINT, ACTIVITY_FACTS_FIXTURE],
			model: MODEL_SELECTOR,
			env: { [DOCK_CAPTURE_BASE_URL_ENV]: capture.baseUrl, ...home.env },
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

/** The one tool call the tool run scripts: a real bash command, answered by the follow-up request. */
const TOOL_STEP: NonNullable<CaptureServerOptions["toolCall"]> = {
	name: "bash",
	arguments: JSON.stringify({ command: `echo ${TOOL_CALL_TEXT}` }),
	times: 1,
};

/** One line the activity probe wrote: the kind, and the facts it carried. */
interface ProbeLine {
	readonly kind: string;
	readonly facts: Record<string, unknown>;
}

/** Every line the probe wrote for one run, in the order the framework delivered it. */
function probeLines(session: ControlledSession): ProbeLine[] {
	const prefix = `[${ACTIVITY_FACTS_ID}] `;
	const seen: ProbeLine[] = [];
	for (const raw of session.stderr().split("\n")) {
		if (!raw.startsWith(prefix)) continue;
		const rest = raw.slice(prefix.length);
		const separator = rest.indexOf(" ");
		if (separator < 0) continue;
		seen.push({ kind: rest.slice(0, separator), facts: JSON.parse(rest.slice(separator + 1)) as Record<string, unknown> });
	}
	return seen;
}

/** The readings one run's lines carry, in order: `sessionId=activity`. */
function readings(lines: readonly ProbeLine[]): string[] {
	return lines
		.filter(line => line.kind === "session_activity")
		.map(line => `${String(line.facts.sessionId)}=${String(line.facts.activity)}`);
}

/** The Round edge kinds one run's lines carry, in order. */
function roundEdges(lines: readonly ProbeLine[]): string[] {
	return lines.filter(line => line.kind === "round_start" || line.kind === "round_end").map(line => line.kind);
}

/** Each line's own shape, in order: the activity a reading states, and the reason a boundary carries. */
function labels(lines: readonly ProbeLine[]): string[] {
	return lines.map(line =>
		line.kind === "session_activity"
			? String(line.facts.activity)
			: line.kind === "session_end"
				? `session_end:${String(line.facts.reason)}`
				: line.kind,
	);
}

/** One turn of the event loop, so a write or a reading that lands a few turns later is observed. */
async function nextTurn(): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>();
	setImmediate(resolve);
	await promise;
}

/**
 * Waits until a run's captured stderr holds what a case expects of it, and answers with its lines.
 *
 * The end of a Round is dispatched on the host's own next task rather than inside the native settle,
 * and a prompt's result can arrive before that task ran, so a case waits on the expected content
 * itself instead of on a duration. The deadline only keeps an observation that never happened from
 * hanging the case.
 */
async function linesEventually(
	session: ControlledSession,
	accept: (seen: ProbeLine[]) => boolean,
): Promise<ProbeLine[]> {
	const deadline = Date.now() + 20_000;
	for (;;) {
		const seen = probeLines(session);
		if (accept(seen)) return seen;
		if (Date.now() > deadline) throw new Error(`no observation the case expects appeared:\n${session.stderr()}`);
		await nextTurn();
	}
}

/** One session's record inside the document the run's storage root holds. */
interface SavedSession {
	readonly id: string;
	readonly saveVersion: number;
	readonly own: Record<string, Record<string, { readonly tokens: Record<string, number> }>>;
}

/** Every session record the run's document holds right now. */
function savedSessions(file: string): SavedSession[] {
	if (!existsSync(file)) return [];
	const document = JSON.parse(readFileSync(file, "utf8")) as {
		readonly harnesses?: Record<string, { readonly sessions?: SavedSession[] }>;
	};
	return Object.values(document.harnesses ?? {}).flatMap(bucket => bucket.sessions ?? []);
}

/**
 * Waits until the document holds what a case expects of it, and answers with that session's record.
 *
 * A Round's end is dispatched as a semantic delivery whose handler the extension waits for its own
 * save inside, while the host does not wait for the handler, so the write lands a few event-loop turns
 * later. The wait is on the expected content itself rather than on a duration.
 */
async function savedSession(file: string, accept: (record: SavedSession) => boolean): Promise<SavedSession> {
	const deadline = Date.now() + 15_000;
	for (;;) {
		const found = savedSessions(file).find(accept);
		if (found !== undefined) return found;
		if (Date.now() > deadline) throw new Error(`no session record the case expects was published at ${file}`);
		await nextTurn();
	}
}

describe("a real session's activity is the reading its own Round transitions leave it in (P10; S3)", () => {
	test("one prompt whose run continues through a tool reads as working once and idle once", async () => {
		const run = await startRun("activity-facts-tool", { toolCall: TOOL_STEP });
		try {
			expect((await run.session.prompt(TOOL_PROMPT)).status).toBe("completed");
			// The host really made two model requests for this one prompt: the response that asked for
			// the tool, then the follow-up that answered it.
			expect(run.capture.requests()).toHaveLength(2);
			expect(run.capture.requests()[1]?.raw).toContain(TOOL_CALL_TEXT);

			// Both requests belong to one Round, and the reading follows that Round: the session is
			// stated as working where the Round opened and idle where the framework confirmed it ended.
			// No reading at all appears between them — which is what a tool continuation would have
			// produced had the reading been driven by a native run's end rather than by the Round: two
			// requests inside one run would then have read as two working periods.
			await linesEventually(run.session, seen => readings(seen).length === 2);
			const lines = probeLines(run.session);
			const session = String(lines[0]?.facts.sessionId);
			expect(readings(lines)).toEqual([`${session}=working`, `${session}=idle`]);
			expect(roundEdges(lines)).toEqual(["round_start", "round_end"]);

			// The order within this one binding: the edge is dispatched first and the reading it left
			// behind second, so each reading is placed against the transition that produced it.
			expect(labels(lines.filter(line => line.kind !== "session_start"))).toEqual([
				"round_start",
				"working",
				"round_end",
				"idle",
			]);
			// The reading names the actual session it is about, and that session is the main one the run
			// began in — never the owner, a viewed target or a parent.
			expect(lines.filter(line => line.kind === "session_activity").every(line => line.facts.parent === null)).toBe(true);

			// One Round end, one commit of what that Round's requests really reported: the reading itself
			// writes nothing, and no second save follows from the observation.
			const saved = await savedSession(run.home.consumptionFile, candidate => candidate.saveVersion >= 1);
			expect(saved.id).toBe(session);
			expect(saved.saveVersion).toBe(1);
			expect(saved.own[MODEL_PROVIDER]?.[MODEL_ID]?.tokens).toEqual({
				input: ONE_RESPONSE_TOKENS.input * 2,
				cacheRead: ONE_RESPONSE_TOKENS.cacheRead * 2,
				cacheWrite: 0,
				output: ONE_RESPONSE_TOKENS.output * 2,
			});
		} finally {
			await disposeRun(run);
		}
	}, 240_000);

	test("a second prompt in the same session opens its own Round and reads its own pair", async () => {
		const run = await startRun("activity-facts-two-prompts");
		try {
			expect((await run.session.prompt(FIRST_PROMPT)).status).toBe("completed");
			expect((await run.session.prompt(SECOND_PROMPT)).status).toBe("completed");
			expect(run.capture.requests()).toHaveLength(2);

			// The second prompt's work reads as a second working period, which happens only because the
			// first Round was confirmed ended in between: that confirmation is the idle reading, and had
			// it never come, the second start would have been work inside the first Round.
			await linesEventually(run.session, seen => readings(seen).length === 4);
			const lines = probeLines(run.session);
			const session = String(lines[0]?.facts.sessionId);
			expect(readings(lines)).toEqual([
				`${session}=working`,
				`${session}=idle`,
				`${session}=working`,
				`${session}=idle`,
			]);
			expect(roundEdges(lines)).toEqual(["round_start", "round_end", "round_start", "round_end"]);

			// Both Rounds committed the session's own accumulation, once each.
			const saved = await savedSession(run.home.consumptionFile, candidate => candidate.saveVersion >= 2);
			expect(saved.own[MODEL_PROVIDER]?.[MODEL_ID]?.tokens.input).toBe(2 * ONE_RESPONSE_TOKENS.input);
		} finally {
			await disposeRun(run);
		}
	}, 240_000);
});

describe("leaving a session is a transfer, not that session's own end (P33; S3)", () => {
	test("a switch while the session is working states no reading of its own and commits nothing", async () => {
		// The one model request this run makes is held open, so the session is really working while the
		// switch happens: the window is the endpoint's own, stated by the fixture rather than guessed.
		const run = await startRun("activity-facts-switch", {
			respond: () => ({ answerDelayMs: 4_000 }),
		});
		try {
			const pending = run.session.prompt(SWITCH_PROMPT);
			// The session takes up the work: its Round is open and it reads as working.
			await linesEventually(run.session, seen => readings(seen).length === 1);
			const left = String(probeLines(run.session)[0]?.facts.sessionId);
			expect(readings(probeLines(run.session))).toEqual([`${left}=working`]);

			// The operator leaves it for a new session: a real session switch. The host reports the session
			// it leaves with the framework's own reason for "another session took its place", and starts
			// the session it entered under its own identity — neither is the left session's own end.
			const switched = await run.session.request({ type: "new_session" });
			expect(switched.success).toBe(true);
			const outcome = await pending;
			expect(typeof outcome.status).toBe("string");

			// Nothing else is expected to happen for the session that was left, and absence is observed
			// over a stated quiet window rather than inferred from one missing line: the run left behind
			// settles on this host, but a session that is no longer current is not read as being at rest,
			// so the framework confirms no end for it and — correctly — never turns it idle to invent one.
			// The window is a real one on purpose: the fact under observation is a *non*-event in another
			// process's scheduler (the framework's re-check runs on that host's own task), so there is no
			// promise or event to await and no fake clock that could stand in for it.
			await Bun.sleep(2_000);
			const leftLines = probeLines(run.session).filter(line => line.facts.sessionId === left);

			// The transfer ends the left session's position as current, faithfully naming that
			// actual session. It is not disposal: it adds neither a second activity reading nor a
			// Round edge beyond the one its own activity opened. Had the position change ended its
			// Round, a `round_end` and an `idle` would be here.
			expect(labels(leftLines)).toEqual(["session_start", "round_start", "working", "session_end:transferred"]);
			expect(roundEdges(leftLines)).toEqual(["round_start"]);
			expect(readings(leftLines)).toEqual([`${left}=working`]);
			// No Round ended, so nothing was measured and nothing was committed: the document holds no
			// record of the session that was left, whatever its run reported before the switch.
			expect(savedSessions(run.home.consumptionFile).filter(record => record.id === left)).toEqual([]);

			// The session the operator entered is its own actual session, observed as itself rather than
			// through the one that was left.
			const entered = probeLines(run.session).filter(line => line.kind === "session_start" && line.facts.sessionId !== left);
			expect(entered).toHaveLength(1);
			expect(probeLines(run.session)
				.filter(line => line.kind === "session_start" || line.kind === "session_end")
				.map(line => ({ kind: line.kind, sessionId: line.facts.sessionId, reason: line.facts.reason })))
				.toEqual([
					{ kind: "session_start", sessionId: left, reason: undefined },
					{ kind: "session_end", sessionId: left, reason: "transferred" },
					{ kind: "session_start", sessionId: entered[0]!.facts.sessionId, reason: undefined },
				]);
		} finally {
			await disposeRun(run);
		}
	}, 240_000);
});
