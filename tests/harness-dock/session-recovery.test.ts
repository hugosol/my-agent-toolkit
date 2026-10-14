/**
 * Session recovery, navigation and a save that did not land, in a running harness (P16, P17, P18,
 * P19, P46; S5).
 *
 * This is the isolated real-host observation of what happens to consumption once a session has been
 * saved: the dock materialises the recorded baseline install, loads this repository's own model-cost
 * entrypoint through the harness's real loader, and drives real RPC sessions whose model requests go
 * to the dock's local capture endpoint. Nothing here is a double — the restarts, the harness's own
 * session navigation and its own fork are the host's, and the document every case reads is the file a
 * real save published.
 *
 * Four host facts are observed. A restart is a second process over the same isolated user home, which
 * is the only way the extension's storage root can be shared: the document it left is the baseline the
 * new process resumes from, so the session's totals and version continue rather than starting over. A
 * navigation back to an earlier position in the session's own tree stands up another session from the
 * entries up to that point, and coming back continues the first session's own record. A fork is the
 * harness's own copying of a transcript, which issues no request at all. And a save that does not land
 * — another writer published that session's record under the same version while this process ran — is
 * reported to the operator, leaves the document the other writer left, and is dropped rather than
 * carried into the next save, after which the real model keeps running.
 *
 * The amounts asserted are not real prices: the capture endpoint reports the wire numbers below and
 * each expected bucket is hand-derived from them, while an amount is only ever required to be a
 * number. This suite says nothing about a real provider.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { writeProviderOverride } from "./agent-config";
import { type IsolatedHarness, REPO_ROOT, ensureIsolatedHarness, readBaselineRecord } from "./baseline";
import { type CaptureServer, startCaptureServer } from "./capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV } from "./fixtures/extension-root/provider";
import { type RunRoot, createRunRoot } from "./run-root";
import { ControlledSession, type RpcFrame } from "./session";

const record = readBaselineRecord();
/** The extension's own OMP entrypoint, as the harness's loader discovers it. */
const MODEL_COST_ENTRYPOINT = path.join(REPO_ROOT, "entrypoints", "omp", "model-cost.ts");
/** The dock's own provider fixture, so the model-cost entrypoint runs beside an unknown provider. */
const PROVIDER_FIXTURE = path.join(import.meta.dir, "fixtures", "extension-root", "provider.ts");

/** The document the extension keeps in its storage root. */
const CONSUMPTION_FILE = "consumption.json";

/** The usage the capture endpoint reports for every completion, as the wire numbers it sends. */
const WIRE_PROMPT_TOKENS = 10;
const WIRE_CACHED_TOKENS = 3;
const WIRE_COMPLETION_TOKENS = 7;
const CAPTURE_USAGE = { input: WIRE_PROMPT_TOKENS, output: WIRE_COMPLETION_TOKENS, cacheRead: WIRE_CACHED_TOKENS };

/** One response's four accounted buckets, as the extension stores them: the non-cached input is the rest. */
const ONE_RESPONSE_TOKENS = {
	input: WIRE_PROMPT_TOKENS - WIRE_CACHED_TOKENS,
	cacheRead: WIRE_CACHED_TOKENS,
	cacheWrite: 0,
	output: WIRE_COMPLETION_TOKENS,
};

/** The provider and model the runs use: one the extension's own data prices, redirected locally. */
const MODEL_PROVIDER = "deepseek";
const MODEL_ID = "deepseek-flash";
const MODEL_SELECTOR = `${MODEL_PROVIDER}/${MODEL_ID}`;

const FIRST_PROMPT = "dock recovery: one exchange in the session";
const RESTARTED_PROMPT = "dock recovery: an exchange after the process restarted";
const REWOUND_PROMPT = "dock recovery: one exchange from the earlier position";
const RETURNED_PROMPT = "dock recovery: one more exchange after coming back";
const FORKED_PROMPT = "dock recovery: one exchange in the forked session";
const FAILED_PROMPT = "dock recovery: an exchange the refused save carried";

let harness: IsolatedHarness;

beforeAll(async () => {
	harness = await ensureIsolatedHarness(record);
});

/**
 * The isolated user home every run of one case shares, and the storage root the extension's own
 * shipped configuration names inside it: `<base>/user-home/.omp/cost-archive`.
 *
 * Two runs of one case share this directory, which is what makes a second process read the document
 * the first one left — the agent state, session directory and working directory stay per run.
 */
interface SharedHome {
	readonly base: string;
	readonly home: string;
	readonly storageDirectory: string;
	readonly consumptionFile: string;
	/** The environment that makes the harness resolve `~/` here, and nowhere else. */
	readonly env: Record<string, string>;
}

function sharedHome(label: string): SharedHome {
	const base = mkdtempSync(path.join(tmpdir(), `omp-dock-home-${label}-`));
	const home = path.join(base, "user-home");
	const storageDirectory = path.join(home, ".omp", "cost-archive");
	mkdirSync(storageDirectory, { recursive: true });
	return {
		base,
		home,
		storageDirectory,
		consumptionFile: path.join(storageDirectory, CONSUMPTION_FILE),
		env: {
			USERPROFILE: home,
			HOME: home,
			HOMEDRIVE: path.parse(home).root,
			HOMEPATH: home.slice(path.parse(home).root.length - 1),
		},
	};
}

function disposeHome(home: SharedHome): void {
	rmSync(home.base, { recursive: true, force: true });
}

/** One provisioned run: the session, the capture endpoint behind it, and the directories it may write. */
interface DockRun {
	readonly session: ControlledSession;
	readonly capture: CaptureServer;
	readonly runRoot: RunRoot;
}

/**
 * One run over a shared home: the harness's own loader, this project's entrypoint, a local endpoint.
 *
 * `runRoot` is omitted for a run of its own, and passed for the second process of a restart: the two
 * processes of one restart share the working directory and the session directory they run in — that is
 * what the harness's own session navigation compares, and what a resumed conversation is read from.
 */
async function startRun(label: string, home: SharedHome, runRoot: RunRoot = createRunRoot(label)): Promise<DockRun> {
	const capture = startCaptureServer({
		dir: runRoot.captureDir,
		replyText: "dock recovery reply",
		usage: CAPTURE_USAGE,
	});
	writeProviderOverride(runRoot.agentDir, MODEL_PROVIDER, { baseUrl: capture.baseUrl, apiKey: "dock-key" });
	try {
		const session = await ControlledSession.start({
			harness,
			runRoot,
			extensions: [PROVIDER_FIXTURE, MODEL_COST_ENTRYPOINT],
			model: MODEL_SELECTOR,
			env: { [DOCK_CAPTURE_BASE_URL_ENV]: capture.baseUrl, ...home.env },
			promptTimeoutMs: 120_000,
		});
		return { session, capture, runRoot };
	} catch (error) {
		capture.stop();
		throw error;
	}
}

/** Ends one run's process and its endpoint; the directories it ran in belong to the case. */
async function stopRun(run: DockRun): Promise<void> {
	try {
		if (run.session.exited() === null) await run.session.stop({ timeoutMs: 15_000 });
	} catch {
		// The session already stopped (or never started); the case's own cleanup still runs.
	}
	run.capture.stop();
}

/** One session's record as the document holds it. */
interface SavedSession {
	readonly id: string;
	readonly name: string;
	readonly parent: string | null;
	readonly saveVersion: number;
	readonly own: Record<string, Record<string, { readonly tokens: Record<string, number>; readonly costCny?: number }>>;
}

/** The document as this suite reads it: the sessions the extension saved, keyed by harness. */
interface SavedDocument {
	readonly periodId?: string;
	readonly holiday?: boolean;
	readonly harnesses?: Record<string, { readonly sessions?: SavedSession[] }>;
}

/** Every session record one document holds, whichever harness key it sits under. */
function sessionsOf(document: SavedDocument): SavedSession[] {
	return Object.values(document.harnesses ?? {}).flatMap(bucket => bucket.sessions ?? []);
}

/** One session's record in a document, or `undefined` when the document holds none for that id. */
function recordOf(document: SavedDocument, id: string): SavedSession | undefined {
	return sessionsOf(document).find(entry => entry.id === id);
}

/** The document one run's storage root holds right now, or `undefined` while it holds none. */
function readDocument(file: string): SavedDocument | undefined {
	if (!existsSync(file)) return undefined;
	return JSON.parse(readFileSync(file, "utf8")) as SavedDocument;
}

/** Lets the event loop turn over until nothing already queued is left. */
async function queuedWorkSettled(): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>();
	setImmediate(resolve);
	await promise;
}

/**
 * Waits until the document holds what a case expects of it, and answers with the document.
 *
 * A Round's end is dispatched on the host's own next task and the extension waits for its own save
 * before that handler returns, so a save lands after the prompt result does. The wait is on the
 * expected content rather than on a duration, and the deadline only keeps a save that never happened
 * from hanging the case.
 */
async function savedDocument(file: string, accept: (document: SavedDocument) => boolean): Promise<SavedDocument> {
	const deadline = Date.now() + 20_000;
	for (;;) {
		const document = readDocument(file);
		if (document !== undefined && accept(document)) return document;
		if (Date.now() > deadline) {
			throw new Error(`no consumption document the case expects was published at ${file}: ${JSON.stringify(document)}`);
		}
		await queuedWorkSettled();
	}
}

/** The operator notices one run emitted, as the harness itself framed them. */
function noticesOf(session: ControlledSession): ReadonlyArray<{ readonly level: unknown; readonly message: string }> {
	return session
		.frames()
		.filter(frame => frame.type === "extension_ui_request" && frame.method === "notify")
		.map(frame => ({ level: frame.notifyType, message: String(frame.message) }));
}

/** The notices one run published about the consumption document. */
function storageNotices(session: ControlledSession): ReadonlyArray<{ readonly level: unknown; readonly message: string }> {
	return noticesOf(session).filter(notice => notice.message.includes(CONSUMPTION_FILE));
}

/** The object payload of one RPC answer, when the frame really carries one. */
function payloadRecord(frame: RpcFrame): Record<string, unknown> {
	const data = frame.data;
	return data !== null && typeof data === "object" ? (data as Record<string, unknown>) : {};
}

/** The actual session the harness is showing, as the harness itself reports it. */
async function currentSession(run: DockRun): Promise<{ readonly id: string; readonly file: string }> {
	const state = payloadRecord(await run.session.request({ type: "get_state" }));
	if (typeof state.sessionId !== "string" || typeof state.sessionFile !== "string") {
		throw new Error(`the harness reported no current session and file: ${JSON.stringify(state)}`);
	}
	return { id: state.sessionId, file: state.sessionFile };
}

/** One response's record fields for a request count, hand-written from the wire numbers. */
function usageOfRequests(count: number): Record<string, number> {
	return {
		input: ONE_RESPONSE_TOKENS.input * count,
		cacheRead: ONE_RESPONSE_TOKENS.cacheRead * count,
		cacheWrite: 0,
		output: ONE_RESPONSE_TOKENS.output * count,
	};
}

describe("a saved session resumes in the next process (P16, P18)", () => {
	test("an independent restart continues its totals, version and period, and reads no history", async () => {
		const home = sharedHome("restart");
		// The two processes of one restart run in the same working directory and session directory: that
		// is the directory a resumed conversation is read from, and what the harness's own navigation to
		// a session file compares.
		const runRoot = createRunRoot("recovery-restart");
		const first = await startRun("recovery-restart-first", home, runRoot);
		try {
			expect((await first.session.prompt(FIRST_PROMPT)).status).toBe("completed");
			expect(first.capture.requests()).toHaveLength(1);
			const saved = await savedDocument(home.consumptionFile, document => sessionsOf(document).length === 1);
			const session = sessionsOf(saved)[0];
			if (session === undefined) throw new Error("the first run saved no session record");
			expect(session.own[MODEL_PROVIDER]?.[MODEL_ID]?.tokens).toEqual(usageOfRequests(1));
			expect(session.saveVersion).toBe(1);
			expect(noticesOf(first.session)).toEqual([]);
			// The session the harness is showing, and the file it persists: the next process resumes it
			// from that very file.
			const position = await currentSession(first);
			expect(position.id).toBe(session.id);

			// The process ends. A second, independent process starts over the same isolated home, so its
			// extension reads the document the first one left as its baseline.
			await stopRun(first);
			const second = await startRun("recovery-restart-second", home, runRoot);
			try {
				// It resumes that very session: the harness switches to the session's own file.
				const switched = await second.session.request({ type: "switch_session", sessionPath: position.file });
				expect(payloadRecord(switched).cancelled).toBe(false);
				expect((await currentSession(second)).id).toBe(session.id);

				expect((await second.session.prompt(RESTARTED_PROMPT)).status).toBe("completed");
				expect(second.capture.requests()).toHaveLength(1);
				const next = await savedDocument(
					home.consumptionFile,
					document => recordOf(document, session.id)?.saveVersion === 2,
				);
				// One more request on top of the saved total: the transcript the harness replayed to
				// resume the conversation was three messages of history, and none of them is consumption.
				expect(recordOf(next, session.id)?.own[MODEL_PROVIDER]?.[MODEL_ID]?.tokens).toEqual(usageOfRequests(2));
				expect(recordOf(next, session.id)?.saveVersion).toBe(2);
				// The same period, the same single record, and no archive beside the active document: a
				// restart resumes the document rather than migrating, merging or re-deriving anything.
				expect(next.periodId).toBe(saved.periodId);
				expect(sessionsOf(next)).toHaveLength(1);
				expect(noticesOf(second.session)).toEqual([]);
				expect(readdirSync(home.storageDirectory).filter(name => name.endsWith(".json"))).toEqual([CONSUMPTION_FILE]);
			} finally {
				await stopRun(second);
			}
		} finally {
			await stopRun(first);
			runRoot.dispose();
			disposeHome(home);
		}
	}, 300_000);
});

describe("a save that did not land is reported and dropped, and the model keeps running (P46)", () => {
	test("another writer's record of that session stands, the refused consumption is dropped, and the next process resumes the disk's version", async () => {
		const home = sharedHome("refused");
		const runRoot = createRunRoot("recovery-refused");
		const run = await startRun("recovery-refused", home, runRoot);
		try {
			// One real exchange in one session, so the document exists with this extension's own period.
			expect((await run.session.prompt(FIRST_PROMPT)).status).toBe("completed");
			const first = await savedDocument(home.consumptionFile, document => sessionsOf(document).length === 1);
			const firstSession = sessionsOf(first)[0];
			if (firstSession === undefined) throw new Error("the run saved no session record at all");

			// The displayed session becomes another one, and that session's own first version is published
			// by somebody else — another CLI sharing the home — before this process ever saved it. The
			// extension does not read the file per request, so this is exactly the case the coordinated
			// save decides: same version, other business content.
			const created = await run.session.request({ type: "new_session" });
			expect(payloadRecord(created).cancelled).toBe(false);
			const shown = await currentSession(run);
			expect(shown.id).not.toBe(firstSession.id);
			const theirs: SavedSession = {
				id: shown.id,
				name: "另一个进程的会话",
				parent: null,
				saveVersion: 1,
				own: {
					[MODEL_PROVIDER]: {
						[MODEL_ID]: { tokens: { input: 100, cacheRead: 0, cacheWrite: 0, output: 0 }, costCny: 0.5 },
					},
				},
			};
			const theirsDocument: SavedDocument = {
				...first,
				holiday: true,
				harnesses: { ...first.harnesses, omp: { sessions: [...sessionsOf(first), theirs] } },
			};
			writeFileSync(home.consumptionFile, JSON.stringify(theirsDocument), "utf8");

			expect((await run.session.prompt(FAILED_PROMPT)).status).toBe("completed");
			expect(run.capture.requests()).toHaveLength(2);
			const notices = await (async (): Promise<ReadonlyArray<{ level: unknown; message: string }>> => {
				const deadline = Date.now() + 20_000;
				while (storageNotices(run.session).length === 0 && Date.now() < deadline) await queuedWorkSettled();
				return noticesOf(run.session);
			})();
			// The failure is reported to the operator: the file is named, the amount did not land, and the
			// unsaved consumption was dropped rather than kept for a later save.
			expect(notices).toHaveLength(1);
			expect(notices[0]?.level).toBe("error");
			expect(notices[0]?.message).toContain(home.consumptionFile);
			expect(notices[0]?.message).toContain("没有写入");
			expect(notices[0]?.message).toContain("丢弃");

			// The document the other writer left is exactly the document that stands now — one more
			// request really happened, and it is nowhere in there.
			expect(readDocument(home.consumptionFile)).toEqual(theirsDocument);

			// The model keeps running: the next exchange is a real request and a real save, whose version
			// continues from the disk's own record and whose totals carry the disk's numbers plus this
			// request only — the dropped one is never re-submitted.
			expect((await run.session.prompt(RESTARTED_PROMPT)).status).toBe("completed");
			expect(run.capture.requests()).toHaveLength(3);
			const next = await savedDocument(
				home.consumptionFile,
				document => recordOf(document, shown.id)?.saveVersion === 2,
			);
			expect(recordOf(next, shown.id)?.own[MODEL_PROVIDER]?.[MODEL_ID]?.tokens).toEqual({
				input: 100 + ONE_RESPONSE_TOKENS.input,
				cacheRead: ONE_RESPONSE_TOKENS.cacheRead,
				cacheWrite: 0,
				output: ONE_RESPONSE_TOKENS.output,
			});
			// The disk's amount is kept rather than zeroed, and no second record for that session exists.
			expect(recordOf(next, shown.id)?.own[MODEL_PROVIDER]?.[MODEL_ID]?.costCny).toBeGreaterThan(0);
			expect(sessionsOf(next).filter(entry => entry.id === shown.id)).toHaveLength(1);
			expect(readDocument(home.consumptionFile)?.periodId).toBe(first.periodId);

			// An independent process resumes the valid baseline the disk holds: version 3 of that session,
			// on top of what the file already carried.
			await stopRun(run);
			const restarted = await startRun("recovery-refused-restart", home, runRoot);
			try {
				const switched = await restarted.session.request({ type: "switch_session", sessionPath: shown.file });
				expect(payloadRecord(switched).cancelled).toBe(false);
				expect((await currentSession(restarted)).id).toBe(shown.id);
				expect((await restarted.session.prompt(RETURNED_PROMPT)).status).toBe("completed");
				const resumed = await savedDocument(
					home.consumptionFile,
					document => recordOf(document, shown.id)?.saveVersion === 3,
				);
				expect(recordOf(resumed, shown.id)?.own[MODEL_PROVIDER]?.[MODEL_ID]?.tokens).toEqual({
					input: 100 + ONE_RESPONSE_TOKENS.input * 2,
					cacheRead: ONE_RESPONSE_TOKENS.cacheRead * 2,
					cacheWrite: 0,
					output: ONE_RESPONSE_TOKENS.output * 2,
				});
			} finally {
				await stopRun(restarted);
			}
		} finally {
			await stopRun(run);
			runRoot.dispose();
			disposeHome(home);
		}
	}, 300_000);
});

describe("navigating the session's own tree does not roll back its consumption (P17, P18)", () => {
	test("a rewind stands up another session from the copied entries, and coming back continues the first one's record", async () => {
		const home = sharedHome("tree");
		const run = await startRun("recovery-tree", home);
		try {
			expect((await run.session.prompt(FIRST_PROMPT)).status).toBe("completed");
			const first = await savedDocument(home.consumptionFile, document => sessionsOf(document).length === 1);
			const session = sessionsOf(first)[0];
			if (session === undefined) throw new Error("the run saved no session record at all");
			const position = await currentSession(run);
			expect(position.id).toBe(session.id);

			// The session's own tree is read and the position moves back to the first user entry: the
			// harness stands a new session up from the entries up to that point.
			const entries = payloadRecord(await run.session.request({ type: "get_entries" })).entries;
			const target = (Array.isArray(entries) ? entries : []).find(
				(entry: unknown): entry is Record<string, unknown> =>
					entry !== null &&
					typeof entry === "object" &&
					"type" in entry &&
					"id" in entry &&
					entry.type === "message" &&
					typeof entry.id === "string" &&
					JSON.stringify(entry).includes(FIRST_PROMPT),
			);
			if (target === undefined) throw new Error(`no message entry carrying "${FIRST_PROMPT}" was reported`);
			const branched = await run.session.request({ type: "branch", entryId: target.id });
			expect(payloadRecord(branched).cancelled).toBe(false);
			const rewound = await currentSession(run);
			expect(rewound.id).not.toBe(session.id);

			// The copied entries are no consumption: the exchange from the earlier position is this new
			// session's whole own record, at its own first version.
			expect((await run.session.prompt(REWOUND_PROMPT)).status).toBe("completed");
			const withRewound = await savedDocument(
				home.consumptionFile,
				document => recordOf(document, rewound.id) !== undefined,
			);
			expect(recordOf(withRewound, rewound.id)?.own[MODEL_PROVIDER]?.[MODEL_ID]?.tokens).toEqual(usageOfRequests(1));
			expect(recordOf(withRewound, rewound.id)?.saveVersion).toBe(1);
			// And the session the navigation moved away from is exactly the record it was: nothing about a
			// position change rolled its consumption back.
			expect(recordOf(withRewound, session.id)).toEqual(session);
			expect(noticesOf(run.session)).toEqual([]);

			// Coming back to the first session's own file continues its record: one more request on top of
			// the one it already had, at the next version of its identity.
			const switched = await run.session.request({ type: "switch_session", sessionPath: position.file });
			expect(payloadRecord(switched).cancelled).toBe(false);
			expect((await currentSession(run)).id).toBe(session.id);
			expect((await run.session.prompt(RETURNED_PROMPT)).status).toBe("completed");
			const returned = await savedDocument(
				home.consumptionFile,
				document => recordOf(document, session.id)?.saveVersion === 2,
			);
			expect(recordOf(returned, session.id)?.own[MODEL_PROVIDER]?.[MODEL_ID]?.tokens).toEqual(usageOfRequests(2));
			expect(recordOf(returned, rewound.id)?.own[MODEL_PROVIDER]?.[MODEL_ID]?.tokens).toEqual(usageOfRequests(1));
			expect(run.capture.requests()).toHaveLength(3);
		} finally {
			await stopRun(run);
			run.runRoot.dispose();
			disposeHome(home);
		}
	}, 300_000);
});

describe("a fork is its own session, from zero (P19)", () => {
	test("the harness's own fork copies the transcript without consuming, and adds only the fork's own requests", async () => {
		const home = sharedHome("fork");
		const run = await startRun("recovery-fork", home);
		try {
			expect((await run.session.prompt(FIRST_PROMPT)).status).toBe("completed");
			const first = await savedDocument(home.consumptionFile, document => sessionsOf(document).length === 1);
			const source = sessionsOf(first)[0];
			if (source === undefined) throw new Error("the run saved no session record at all");

			// The harness forks: a new session is stood up from a copy of the transcript. Copying messages
			// is not a request, so no consumption is produced and the document is not touched.
			const forked = await run.session.request({ type: "fork" });
			expect(payloadRecord(forked).cancelled).toBe(false);
			const fork = await currentSession(run);
			expect(fork.id).not.toBe(source.id);
			await queuedWorkSettled();
			expect(run.capture.requests()).toHaveLength(1);
			expect(readDocument(home.consumptionFile)).toEqual(first);
			expect(recordOf(readDocument(home.consumptionFile) ?? {}, source.id)).toEqual(source);

			// The fork's first real request is its own record, from its own first version, holding exactly
			// that request — not a share of the transcript it copied.
			expect((await run.session.prompt(FORKED_PROMPT)).status).toBe("completed");
			const document = await savedDocument(
				home.consumptionFile,
				candidate => recordOf(candidate, fork.id) !== undefined,
			);
			expect(recordOf(document, fork.id)?.own[MODEL_PROVIDER]?.[MODEL_ID]?.tokens).toEqual(usageOfRequests(1));
			expect(recordOf(document, fork.id)?.saveVersion).toBe(1);
			// The session it was forked from is the record it already was, to the last field.
			expect(recordOf(document, source.id)).toEqual(source);
			expect(sessionsOf(document)).toHaveLength(2);
			expect(run.capture.requests()).toHaveLength(2);
			expect(noticesOf(run.session)).toEqual([]);
		} finally {
			await stopRun(run);
			run.runRoot.dispose();
			disposeHome(home);
		}
	}, 300_000);
});
