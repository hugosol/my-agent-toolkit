/**
 * A subagent runtime the real host measured, and what one process's death with an activity open does
 * to it (S3; contract P26; ticket 16).
 *
 * This is the isolated real-host observation of the time figure on the host this repository runs a
 * real delegation on: the dock materialises the recorded baseline install, loads this repository's own
 * model-cost entrypoint through the harness's real loader, and drives a real RPC session whose model
 * requests go to the dock's local capture endpoint. The delegation is the harness's own task tool
 * against a blocking child session, so the child's own Round — and therefore the interval its runtime
 * is made of — is the host's real activity rather than a timeline a case placed.
 *
 * Three facts are observed, and none of them is a duration this file states:
 *
 * - **A measured subtotal.** The child's own record carries a positive number of milliseconds, which
 *   is the interval between the two edges of its own Round, and it carries no mark of a gap: every
 *   interval of that activity was observed.
 * - **A missing end adds nothing.** A second delegation begins, and the process dies while its child's
 *   activity is still waiting on a request the endpoint holds: no end of that activity is ever
 *   observed, so the document is byte for byte the one the first delegation left — the offline stretch
 *   is not filled in, and no record appears for the crashed child.
 * - **The next process continues.** A fresh process over the same isolated home reads the document back
 *   without a fault, commits the third delegation's child with its own figure, and leaves the first
 *   child's record exactly as the first process wrote it.
 *
 * What this file does not claim: an independent gap mark (an interval the observer could not state) is
 * not producible on a real host, so the mark's rules are the controlled-time cases' business
 * (`tests/model-cost/pi-runtime-gaps.test.ts`); and the pi host's own subagent records are blocked by
 * the faults recorded in the migration's evidence, not by this ticket.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { writeAgentSettings, writeProviderOverride } from "./agent-config";
import { type IsolatedHarness, REPO_ROOT, ensureIsolatedHarness, readBaselineRecord } from "./baseline";
import { type CaptureServer, type CaptureStep, type CapturedRequest, startCaptureServer } from "./capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV } from "./fixtures/extension-root/provider";
import { type RunRoot, createRunRoot } from "./run-root";
import { ControlledSession, type RpcFrame } from "./session";

const record = readBaselineRecord();
/** The extension's own OMP entrypoint, as the harness's loader discovers it. */
const MODEL_COST_ENTRYPOINT = path.join(REPO_ROOT, "entrypoints", "omp", "model-cost.ts");
/** The document the extension keeps in its storage root, inside the isolated home. */
const CONSUMPTION_FILE = "consumption.json";
/** The provider and model the runs use: one the extension's own data prices, redirected locally. */
const DEEPSEEK_PROVIDER = "deepseek";
const DEEPSEEK_SELECTOR = "deepseek/deepseek-flash";
/** The credential the isolated state configures for the provider. */
const DOCK_CREDENTIAL = "dock-key";
/** The usage every completion reports: this file's own literal, in the endpoint's own bucket names. */
const DEEPSEEK_USAGE = { input: 2000, output: 1000, cacheRead: 1000 };
/** The three assignments of this case: what each child of the tree was asked to do. */
const FIRST_ASSIGNMENT = "first child assignment, answered by a scripted result";
const SECOND_ASSIGNMENT = "second child assignment, whose answer is held while the process dies";
const THIRD_ASSIGNMENT = "third child assignment, answered after the process was replaced";
/** The three delegation prompts the main session is given, one per child. */
const FIRST_PROMPT = "dock runtime gap: one delegation that finishes";
const SECOND_PROMPT = "dock runtime gap: one delegation the process does not survive";
const THIRD_PROMPT = "dock runtime gap: one delegation after the process was replaced";
/** How long the third process waits for the crashed child's record before concluding it never came. */
const SETTLE_DEADLINE_MS = 15_000;

let harness: IsolatedHarness;

beforeAll(async () => {
	harness = await ensureIsolatedHarness(record);
}, 900_000);

/** One isolated user home, and the storage root the extension's own shipped configuration names in it. */
interface SharedHome {
	readonly base: string;
	readonly consumptionFile: string;
	/** The environment that makes the harness resolve `~` here, and nowhere else. */
	readonly env: Record<string, string>;
}

/** A fresh isolated home: the storage root the extension creates its first document in. */
function sharedHome(label: string): SharedHome {
	const base = mkdtempSync(path.join(tmpdir(), `omp-runtime-gap-${label}-`));
	const home = path.join(base, "user-home");
	// The extension's shipped configuration names `~/.omp/cost-archive`, which is this home's own.
	const storageDirectory = path.join(home, ".omp", "cost-archive");
	mkdirSync(storageDirectory, { recursive: true });
	return {
		base,
		consumptionFile: path.join(storageDirectory, CONSUMPTION_FILE),
		env: {
			USERPROFILE: home,
			HOME: home,
			HOMEDRIVE: path.parse(home).root,
			HOMEPATH: home.slice(path.parse(home).root.length - 1),
		},
	};
}

/** One session record as this file reads it out of the document the extension published. */
interface SavedRecord {
	readonly id: string;
	readonly parent: string | null;
	readonly saveVersion: number;
	readonly runtimeMs?: number;
	readonly runtimeGap?: true;
}

/** Every session record one activity document holds, whichever harness key it sits under. */
function recordsOf(file: string): readonly SavedRecord[] {
	if (!existsSync(file)) return [];
	const document = JSON.parse(readFileSync(file, "utf8")) as {
		readonly harnesses: Readonly<Record<string, { readonly sessions: readonly SavedRecord[] }>>;
	};
	return Object.values(document.harnesses).flatMap(bucket => [...bucket.sessions]);
}

/** The messages one captured request carried, when its body really is the object this file reads. */
function messagesOf(request: CapturedRequest): readonly unknown[] {
	const body = request.json;
	if (body === null || typeof body !== "object" || !("messages" in body) || !Array.isArray(body.messages)) return [];
	return body.messages;
}

/** Whether one message is a user message, which is what states which prompt a request is answering. */
function isUserMessage(message: unknown): boolean {
	return message !== null && typeof message === "object" && "role" in message && message.role === "user";
}

/**
 * The prompt one captured request is answering: the last user message its body carries.
 *
 * It is the request's own statement of the work being asked for rather than a reading of the run's
 * state — a resumed session's body carries every earlier prompt too, so the *last* one is the prompt
 * this request belongs to.
 */
function promptOf(request: CapturedRequest): string {
	const prompts = messagesOf(request).filter(isUserMessage);
	const current = prompts[prompts.length - 1];
	return current === undefined ? "" : JSON.stringify(current);
}

/** Scripted delegation: the host's own task tool, in the batch shape an RPC host runs. */
function delegationStep(name: string, assignment: string): CaptureStep {
	return {
		toolCall: {
			name: "task",
			arguments: JSON.stringify({
				context: "dock runtime gap delegation context",
				tasks: [{ name, agent: "task", task: assignment, solutionSpace: "one fixed answer, nothing open" }],
			}),
		},
	};
}

/** A scripted subagent result: the host's own yield tool, which ends the subagent's session. */
function yieldStep(data: string): CaptureStep {
	return { toolCall: { name: "yield", arguments: JSON.stringify({ data }) } };
}

/** The object payload of one RPC answer, when the frame really carries one. */
function payloadRecord(frame: RpcFrame): Record<string, unknown> {
	const data = frame.data;
	return data !== null && typeof data === "object" ? (data as Record<string, unknown>) : {};
}

/**
 * The session the harness is showing, and the file a later process resumes it from.
 *
 * The id is the session's own and the file is the one the harness persisted; both are the host's own
 * facts rather than this file's reading of them.
 */
async function currentSession(
	session: ControlledSession,
	runRoot: RunRoot,
): Promise<{ readonly id: string; readonly file: string }> {
	const payload = payloadRecord(await session.request({ type: "get_state" }));
	const id = typeof payload.sessionId === "string" ? payload.sessionId : "";
	if (id.length === 0) throw new Error(`the harness reported no session id: ${JSON.stringify(payload)}`);
	const candidates = readdirSync(runRoot.sessionDir)
		.filter(name => name.endsWith(".jsonl"))
		.map(name => path.join(runRoot.sessionDir, name));
	const file = candidates.find(candidate => candidate.includes(id));
	if (file === undefined) throw new Error(`no persisted session file names ${id} in ${runRoot.sessionDir}`);
	return { id, file };
}

/** The operator notices one session emitted, as the harness itself framed them. */
function noticesOf(session: ControlledSession): ReadonlyArray<{ readonly level: unknown; readonly message: string }> {
	return session
		.frames()
		.filter(frame => frame.type === "extension_ui_request" && frame.method === "notify")
		.map(frame => ({ level: frame.notifyType, message: String(frame.message) }));
}

/** Lets the event loop turn over until nothing already queued is left. */
async function queuedWorkSettled(): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>();
	setImmediate(resolve);
	return promise;
}

/**
 * Waits until one condition holds, or fails with what the run really observed.
 *
 * The condition is a fact another process publishes — a request the endpoint recorded, a document a
 * commit left — so the wait turns the event loop over (real timers would guess at how long another
 * process's round trip takes) and stops at the run's own deadline instead.
 */
async function waitFor(condition: () => boolean, describe: () => string, deadlineMs = SETTLE_DEADLINE_MS): Promise<void> {
	const deadline = Date.now() + deadlineMs;
	while (!condition()) {
		if (Date.now() > deadline) throw new Error(`the run never reached the state this case waits for: ${describe()}`);
		await queuedWorkSettled();
	}
}

/** Waits until the document holds what a case expects of it, and answers with its records. */
async function savedRecords(
	file: string,
	accept: (records: readonly SavedRecord[]) => boolean,
): Promise<readonly SavedRecord[]> {
	const deadline = Date.now() + 30_000;
	for (;;) {
		const records = recordsOf(file);
		if (accept(records)) return records;
		if (Date.now() > deadline) throw new Error(`no document this case expects was published at ${file}: ${JSON.stringify(records)}`);
		await queuedWorkSettled();
	}
}

/** One provisioned run: the session, the endpoint behind it and its own root. */
interface DockRun {
	readonly session: ControlledSession;
	readonly capture: CaptureServer;
	readonly runRoot: RunRoot;
}

/**
 * Starts one run over the shared home: same storage root, and — as a restart of the same deployment —
 * the same run root, whose working directory a session file is bound to; only the process is new.
 */
async function startRun(
	home: SharedHome,
	runRoot: RunRoot,
	label: string,
	respond: (request: CapturedRequest) => CaptureStep | undefined,
): Promise<DockRun> {
	const capture = startCaptureServer({
		dir: path.join(runRoot.path, `capture-${label}`),
		replyText: "dock runtime gap reply",
		usage: DEEPSEEK_USAGE,
		respond,
	});
	writeProviderOverride(runRoot.agentDir, DEEPSEEK_PROVIDER, { baseUrl: capture.baseUrl, apiKey: DOCK_CREDENTIAL });
	// A blocking delegation is what this case needs: the child's own Round then runs in this process
	// beside its parent's, which is what a real host measures and what the process's death interrupts.
	writeAgentSettings(runRoot.agentDir, { "async.enabled": false });
	const session = await ControlledSession.start({
		harness,
		runRoot,
		extensions: [MODEL_COST_ENTRYPOINT],
		model: DEEPSEEK_SELECTOR,
		env: { [DOCK_CAPTURE_BASE_URL_ENV]: capture.baseUrl, ...home.env },
		promptTimeoutMs: 120_000,
	});
	return { session, capture, runRoot };
}

/** Stops one run: the session (so its process is really gone) and its endpoint. */
async function disposeRun(run: DockRun, timeoutMs = 15_000): Promise<void> {
	try {
		if (run.session.exited() === null) await run.session.stop({ timeoutMs });
	} catch {
		// The session already stopped; the endpoint still gets released below.
	}
	run.capture.stop();
}

describe("a process that died with an activity open leaves the measured subtotal (P26)", () => {
	test("the real host's figure survives the crash, no offline stretch is filled in, and the next process continues", async () => {
		const home = sharedHome("delegation");
		// The one run root both processes share: a session file is bound to the working directory it was
		// written in, so a restart of this deployment runs in the same one.
		const runRoot = createRunRoot("runtime-gap-omp");
		/** Set when the endpoint records the second child's own request, which is the activity left open. */
		let secondChildRequested = false;
		/** The one delegation each prompt issues: the child it spawns and what that child is asked. */
		const DELEGATION_OF_PROMPT: readonly { readonly prompt: string; readonly child: string; readonly assignment: string }[] = [
			{ prompt: FIRST_PROMPT, child: "runtimeGapChildOne", assignment: FIRST_ASSIGNMENT },
			{ prompt: SECOND_PROMPT, child: "runtimeGapChildTwo", assignment: SECOND_ASSIGNMENT },
			{ prompt: THIRD_PROMPT, child: "runtimeGapChildThree", assignment: THIRD_ASSIGNMENT },
		];
		/** How many times each prompt's request has already been answered with its delegation. */
		const delegated = new Map<string, number>();
		/**
		 * The endpoint's own model, scripted from what the request states: a child's own session answers
		 * its assignment, and a prompt's first request delegates while every later request of that same
		 * round takes the endpoint's plain text — which is what lets the round end and the prompt return.
		 */
		const respond = (request: CapturedRequest): CaptureStep | undefined => {
			const prompt = promptOf(request);
			if (prompt.includes(FIRST_ASSIGNMENT)) return yieldStep("first child result");
			if (prompt.includes(THIRD_ASSIGNMENT)) return yieldStep("third child result");
			if (prompt.includes(SECOND_ASSIGNMENT)) {
				secondChildRequested = true;
				// This child's own activity stays open: its answer is held far past this case's end, so the
				// process that dies below dies in the middle of it.
				return { answerDelayMs: 120_000 };
			}
			const delegation = DELEGATION_OF_PROMPT.find(candidate => prompt.includes(candidate.prompt));
			if (delegation === undefined) return undefined;
			const issued = (delegated.get(delegation.prompt) ?? 0) + 1;
			delegated.set(delegation.prompt, issued);
			return issued === 1 ? delegationStep(delegation.child, delegation.assignment) : undefined;
		};
		let first: DockRun | undefined;
		let third: DockRun | undefined;
		try {
			// The first process: the parent delegates, the child answers, the parent's Round ends.
			first = await startRun(home, runRoot, "first", respond);
			expect((await first.session.prompt(FIRST_PROMPT)).status).toBe("completed");
			const position = await currentSession(first.session, first.runRoot);
			// The child's own Round ended, so the commit it carries the interval with is on disk: a
			// positive number of milliseconds the host really measured, and no mark of a gap, because
			// every interval of that activity was observed.
			const records = await savedRecords(
				home.consumptionFile,
				held => held.some(saved => saved.id !== position.id) && held.some(saved => saved.id === position.id),
			);
			const firstChild = records.find(saved => saved.id !== position.id);
			if (firstChild === undefined) throw new Error(`the child's record never appeared: ${JSON.stringify(records)}`);
			expect(typeof firstChild.runtimeMs).toBe("number");
			expect((firstChild.runtimeMs as number) > 0).toBe(true);
			expect(firstChild.runtimeGap).toBeUndefined();
			expect(firstChild.parent).toBe(position.id);

			// The second delegation: its child's request is held by the endpoint, so that activity is still
			// running when the process is stopped. The parent's own prompt is not awaited — the process is
			// gone before it could answer.
			const beforeCrash = readFileSync(home.consumptionFile, "utf8");
			void first.session.prompt(SECOND_PROMPT).catch(() => undefined);
			await waitFor(
				() => secondChildRequested,
				() => `the endpoint answered ${first?.capture.requests().length ?? 0} request(s), none of them the second child's`,
			);
			// The harness is given a short moment to exit on its own and killed if it does not: either way
			// the activity it was in the middle of has no end this process ever observed.
			await disposeRun(first, 5_000);

			// No offline stretch was filled in and nothing was published for the activity that never
			// ended: the document is byte for byte the one the first delegation's commit left.
			expect(readFileSync(home.consumptionFile, "utf8")).toBe(beforeCrash);

			// The next process over the same isolated home, resumed from the session file the first one
			// persisted: it reads the document the first one left and commits what it measures itself.
			third = await startRun(home, runRoot, "third", respond);
			const switched = payloadRecord(await third.session.request({ type: "switch_session", sessionPath: position.file }));
			expect(switched.cancelled).toBe(false);
			expect((await currentSession(third.session, third.runRoot)).id).toBe(position.id);
			expect((await third.session.prompt(THIRD_PROMPT)).status).toBe("completed");

			// The third delegation's child is committed with its own interval, and the first child's record
			// is exactly the one the first process wrote — the figure a closed activity left is neither
			// rewritten nor added to by a later success.
			const after = await savedRecords(
				home.consumptionFile,
				held => held.some(saved => saved.id !== position.id && saved.id !== firstChild.id),
			);
			const thirdChild = after.find(saved => saved.id !== position.id && saved.id !== firstChild.id);
			expect(typeof thirdChild?.runtimeMs).toBe("number");
			expect((thirdChild?.runtimeMs as number) > 0).toBe(true);
			expect(after.find(saved => saved.id === firstChild.id)).toEqual(firstChild);
			// The crashed activity contributed no record at all: the one record without a figure is the
			// main session's own, whose Rounds are its own work and not a subagent's, and no record carries
			// a mark of a gap.
			expect(after.filter(saved => saved.runtimeMs === undefined).map(saved => saved.id)).toEqual([position.id]);
			expect(after.every(saved => saved.runtimeGap === undefined)).toBe(true);
			// The document is the extension's own, so the second instance reports no baseline fault for it.
			expect(noticesOf(third.session)).toEqual([]);
		} finally {
			for (const run of [third, first]) {
				if (run !== undefined) await disposeRun(run);
			}
			runRoot.dispose();
			rmSync(home.base, { recursive: true, force: true });
		}
	}, 600_000);
});
