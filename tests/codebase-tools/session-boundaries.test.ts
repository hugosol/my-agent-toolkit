/**
 * Session boundaries, restore and `/tree` on the real OMP harness (B8, C4, N5; P5, P7, P10).
 *
 * The observable seam is the OMP extension seam: the real loader discovers
 * `entrypoints/omp` and the dock fixture, a real session runs in the isolated install,
 * and the session JSONL is read back. `/codebase-tools` is the probe for the value a
 * session holds: a toggle records the *opposite* of the current State, so the record it
 * leaves behind reports the value the session had before the toggle — which is how a
 * restored activation value is observed without reaching into the framework.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { type IsolatedHarness, REPO_ROOT, ensureIsolatedHarness, readBaselineRecord } from "../harness-dock/baseline";
import { type CaptureServer, startCaptureServer } from "../harness-dock/capture-server";
import { FIXTURE_TREE_COMMAND, FIXTURE_TREE_ENTRY_TYPE } from "../harness-dock/fixtures/extension-root/entrypoint";
import { DOCK_CAPTURE_BASE_URL_ENV, DOCK_MODEL_SELECTOR } from "../harness-dock/fixtures/extension-root/provider";
import { type RunRoot, createRunRoot } from "../harness-dock/run-root";
import { ControlledSession } from "../harness-dock/session";
import { type SessionEntry, customEntries } from "../harness-dock/session-log";

/** The OMP discovery root this repository deploys, and the fixtures the dock adds. */
const OMP_ENTRYPOINT_DIR = path.join(REPO_ROOT, "entrypoints", "omp");
const FIXTURE_EXTENSION_ROOT = path.join(REPO_ROOT, "tests", "harness-dock", "fixtures", "extension-root");
const PROVIDER_FIXTURE = path.join(FIXTURE_EXTENSION_ROOT, "provider.ts");

/** The State entry the extension persists, and the command that flips it. */
const STATE_ENTRY_TYPE = "codebase-tools:state";
const COMMAND = "codebase-tools";

let harness: IsolatedHarness;

beforeAll(async () => {
	harness = await ensureIsolatedHarness(readBaselineRecord());
}, 300_000);

interface Run {
	readonly runRoot: RunRoot;
	readonly capture: CaptureServer;
}

function createRun(label: string): Run {
	const runRoot = createRunRoot(label);
	return { runRoot, capture: startCaptureServer({ dir: runRoot.captureDir }) };
}

/** Start one session in an existing run: the same session directory, a fresh process. */
function openSession(run: Run, extraArgs: readonly string[] = []): Promise<ControlledSession> {
	return ControlledSession.start({
		harness,
		runRoot: run.runRoot,
		extensions: [PROVIDER_FIXTURE, FIXTURE_EXTENSION_ROOT, OMP_ENTRYPOINT_DIR],
		model: DOCK_MODEL_SELECTOR,
		env: { [DOCK_CAPTURE_BASE_URL_ENV]: run.capture.baseUrl },
		extraArgs,
	});
}

function disposeRun(run: Run): void {
	run.capture.stop();
	run.runRoot.dispose();
}

/** The feedback notifications one session published, in order. */
function notifications(session: ControlledSession): string[] {
	return session
		.frames()
		.filter(frame => frame.type === "extension_ui_request" && frame.method === "notify")
		.map(frame => String(frame.message));
}

/** The session file the harness reports for the session it currently runs. */
async function sessionFileOf(session: ControlledSession): Promise<string> {
	const frame = await session.request({ type: "get_state" });
	const file = (frame.data as { sessionFile?: string } | undefined)?.sessionFile;
	if (file === undefined) throw new Error(`the harness reported no session file: ${JSON.stringify(frame)}`);
	return file;
}

/** The user-message entries the harness reports for the current session, in journal order. */
async function userMessagesOf(session: ControlledSession): Promise<readonly SessionEntry[]> {
	const frame = await session.request({ type: "get_entries" });
	const entries = (frame.data as { entries?: readonly SessionEntry[] } | undefined)?.entries ?? [];
	return entries.filter(
		entry => entry.type === "message" && (entry.message as { role?: string } | undefined)?.role === "user",
	);
}

/** Rewrite every State record in a session file to `payload`, as an older implementation left it. */
function rewriteStatePayloads(file: string, payload: Record<string, unknown>): void {
	const rewritten = readFileSync(file, "utf8")
		.split("\n")
		.map(line => {
			if (line.trim().length === 0) return line;
			const entry = JSON.parse(line) as SessionEntry;
			if (entry.type !== "custom" || entry.customType !== STATE_ENTRY_TYPE) return line;
			return JSON.stringify({ ...entry, data: payload });
		});
	writeFileSync(file, rewritten.join("\n"));
}

/** The State payloads a session file records, in journal order. */
function statePayloadsOf(file: string, sessions: readonly ControlledSession[]): unknown[] {
	const reader = sessions.find(session => session.sessionFiles().includes(file));
	if (reader === undefined) throw new Error(`no session read ${file}`);
	return customEntries(reader.sessionLog(file).entries, STATE_ENTRY_TYPE).map(entry => entry.data);
}

describe("restore across a restart (C4, P10, B8)", () => {
	test("a resumed session reads back the value the new implementation wrote", async () => {
		const run = createRun("session-resume");
		let first: ControlledSession | undefined;
		let second: ControlledSession | undefined;
		try {
			first = await openSession(run);
			expect((await first.prompt(`/${COMMAND}`)).status).toBe("completed");
			expect((await first.prompt("codebase-tools restore turn")).agentInvoked).toBe(true);
			const sessionFile = await sessionFileOf(first);
			expect((await first.stop()).exitCode).toBe(0);

			// A session that never restored anything starts off: its first toggle enabled it.
			expect(statePayloadsOf(sessionFile, [first])).toEqual([{ enabled: true }]);

			// A new process resumes that session. The restored value is the recorded one, so
			// the next toggle turns it off — a lossy read would have enabled it again.
			second = await openSession(run, ["--resume", sessionFile]);
			expect((await second.prompt(`/${COMMAND}`)).status).toBe("completed");
			expect(notifications(second)).toEqual(["codeBaseTools disabled"]);
			expect((await second.prompt("codebase-tools resumed turn")).agentInvoked).toBe(true);
			expect((await second.stop()).exitCode).toBe(0);

			expect(statePayloadsOf(sessionFile, [first, second])).toEqual([{ enabled: true }, { enabled: false }]);
		} finally {
			await stopQuietly(second);
			await stopQuietly(first);
			disposeRun(run);
		}
	}, 240_000);

	test("legacy `{on}` data does not restore: the session falls back to off (N5, B8)", async () => {
		const run = createRun("session-legacy");
		let first: ControlledSession | undefined;
		let second: ControlledSession | undefined;
		try {
			first = await openSession(run);
			expect((await first.prompt(`/${COMMAND}`)).status).toBe("completed");
			expect((await first.prompt("codebase-tools legacy turn")).agentInvoked).toBe(true);
			const sessionFile = await sessionFileOf(first);
			expect((await first.stop()).exitCode).toBe(0);

			// The same session data, as the previous implementation persisted it.
			rewriteStatePayloads(sessionFile, { on: true, initInjected: true });

			// Resuming reads no value out of that record, so the session starts off and the
			// toggle — not a restore — is what enables it.
			second = await openSession(run, ["--resume", sessionFile]);
			expect((await second.prompt(`/${COMMAND}`)).status).toBe("completed");
			expect(notifications(second)).toEqual(["codeBaseTools enabled"]);
			expect((await second.prompt("codebase-tools legacy resumed turn")).agentInvoked).toBe(true);
			expect((await second.stop()).exitCode).toBe(0);

			// The file keeps the legacy record as it was and gains the toggle's own record:
			// history is not rewritten, and the value the toggle wrote is `enabled`, which is
			// what a session that read *no* value from the legacy record produces.
			expect(statePayloadsOf(sessionFile, [first, second])).toEqual([
				{ on: true, initInjected: true },
				{ enabled: true },
			]);
		} finally {
			await stopQuietly(second);
			await stopQuietly(first);
			disposeRun(run);
		}
	}, 240_000);
});

describe("session identity changes (B8, P5)", () => {
	test("a new session starts off while the session it replaced stays enabled", async () => {
		const run = createRun("session-new");
		let session: ControlledSession | undefined;
		try {
			session = await openSession(run);
			expect((await session.prompt(`/${COMMAND}`)).status).toBe("completed");
			await session.request({ type: "new_session" });
			expect((await session.prompt(`/${COMMAND}`)).status).toBe("completed");
			expect((await session.prompt("codebase-tools new-session turn")).agentInvoked).toBe(true);
			const sessionFile = await sessionFileOf(session);
			expect((await session.stop()).exitCode).toBe(0);

			// Both toggles enabled: the second one belongs to the new session, which held the
			// default — it did not inherit the enabled session it replaced.
			expect(notifications(session)).toEqual(["codeBaseTools enabled", "codeBaseTools enabled"]);
			// The new session's own file records only what the new session wrote.
			expect(statePayloadsOf(sessionFile, [session])).toEqual([{ enabled: true }]);
		} finally {
			await stopQuietly(session);
			disposeRun(run);
		}
	}, 240_000);
});

describe("tree navigation (B8, P5)", () => {
	test("navigating the session tree does not reseed the session's State", async () => {
		const run = createRun("session-tree");
		let session: ControlledSession | undefined;
		try {
			session = await openSession(run);
			expect((await session.prompt("codebase-tools tree turn")).agentInvoked).toBe(true);
			const userMessage = (await userMessagesOf(session))[0];
			if (userMessage === undefined) throw new Error("the turn recorded no user message entry");
			const parentId = typeof userMessage.parentId === "string" ? userMessage.parentId : null;

			// Enable the session: its current State is now on, and that record is on the branch.
			expect((await session.prompt(`/${COMMAND}`)).status).toBe("completed");

			// Navigating to that user message rewinds the leaf past it, so the branch the
			// session lands on holds no State record at all.
			expect((await session.prompt(`/${FIXTURE_TREE_COMMAND} ${String(userMessage.id)}`)).status).toBe("completed");

			// A real turn on the abandoned branch: a per-turn re-read of persistence would see
			// no State record here and drop the session's value.
			expect((await session.prompt("codebase-tools navigated turn")).agentInvoked).toBe(true);

			// The State is a session-global value, not a projection of branch contents: the
			// next toggle still turns the enabled session off.
			expect((await session.prompt(`/${COMMAND}`)).status).toBe("completed");
			const sessionFile = await sessionFileOf(session);
			expect((await session.stop()).exitCode).toBe(0);

			expect(notifications(session)).toEqual(["codeBaseTools enabled", "codeBaseTools disabled"]);
			const log = session.sessionLog(sessionFile);
			// The navigation ran and landed on the abandoned branch: its entry hangs off the
			// parent of the user message it rewound past, so no State record is on it.
			const treeEntry = customEntries(log.entries, FIXTURE_TREE_ENTRY_TYPE)[0];
			expect(treeEntry?.data).toEqual({ targetId: userMessage.id, cancelled: false });
			expect(treeEntry?.parentId).toBe(parentId);
			expect(statePayloadsOf(sessionFile, [session])).toEqual([{ enabled: true }, { enabled: false }]);
		} finally {
			await stopQuietly(session);
			disposeRun(run);
		}
	}, 240_000);

	test("a branch into a new identity seeds from the branch it keeps", async () => {
		const run = createRun("session-branch");
		let session: ControlledSession | undefined;
		try {
			session = await openSession(run);
			expect((await session.prompt("codebase-tools branch turn")).agentInvoked).toBe(true);
			expect((await session.prompt(`/${COMMAND}`)).status).toBe("completed");
			// A later turn gives the branch something to cut at: its user message is dropped
			// with everything after it, so the kept path still holds the enabling record.
			expect((await session.prompt("codebase-tools branch cut turn")).agentInvoked).toBe(true);
			const cut = (await userMessagesOf(session))[1];
			if (cut === undefined) throw new Error("the turns recorded no second user message entry");

			expect((await session.request({ type: "branch", entryId: String(cut.id) })).success).toBe(true);
			expect((await session.prompt(`/${COMMAND}`)).status).toBe("completed");
			expect((await session.prompt("codebase-tools branched turn")).agentInvoked).toBe(true);
			const sessionFile = await sessionFileOf(session);
			expect((await session.stop()).exitCode).toBe(0);

			// The branched session's branch carried the enabling record, so restoring it is what
			// made its first toggle turn the session off.
			expect(notifications(session)).toEqual(["codeBaseTools enabled", "codeBaseTools disabled"]);
			expect(statePayloadsOf(sessionFile, [session])).toEqual([{ enabled: true }, { enabled: false }]);
		} finally {
			await stopQuietly(session);
			disposeRun(run);
		}
	}, 240_000);

	test("a fork seeds from the branch it carries", async () => {
		const run = createRun("session-fork");
		let session: ControlledSession | undefined;
		try {
			session = await openSession(run);
			expect((await session.prompt("codebase-tools fork turn")).agentInvoked).toBe(true);
			expect((await session.prompt(`/${COMMAND}`)).status).toBe("completed");

			// A whole-session fork keeps the session's entries in a new session file, so the
			// branch the fork starts from still carries the enabling record.
			expect((await session.request({ type: "fork" })).success).toBe(true);
			expect((await session.prompt(`/${COMMAND}`)).status).toBe("completed");
			expect((await session.prompt("codebase-tools forked turn")).agentInvoked).toBe(true);
			const sessionFile = await sessionFileOf(session);
			expect((await session.stop()).exitCode).toBe(0);

			expect(notifications(session)).toEqual(["codeBaseTools enabled", "codeBaseTools disabled"]);
			expect(statePayloadsOf(sessionFile, [session])).toEqual([{ enabled: true }, { enabled: false }]);
		} finally {
			await stopQuietly(session);
			disposeRun(run);
		}
	}, 240_000);

	test("a fork of a session whose branch carries no State starts off", async () => {
		const run = createRun("session-fork-default");
		let session: ControlledSession | undefined;
		try {
			session = await openSession(run);
			// A real turn runs with the extension never toggled, so the branch the fork will
			// copy carries no State record to seed from.
			expect((await session.prompt("codebase-tools fork-default turn")).agentInvoked).toBe(true);

			// The fork stands on that recordless branch, so the default holds: the next toggle
			// *enables* the fork rather than flipping a value something else seeded.
			expect((await session.request({ type: "fork" })).success).toBe(true);
			expect((await session.prompt(`/${COMMAND}`)).status).toBe("completed");
			expect((await session.prompt("codebase-tools forked-default turn")).agentInvoked).toBe(true);
			const sessionFile = await sessionFileOf(session);
			expect((await session.stop()).exitCode).toBe(0);

			expect(notifications(session)).toEqual(["codeBaseTools enabled"]);
			expect(statePayloadsOf(sessionFile, [session])).toEqual([{ enabled: true }]);
		} finally {
			await stopQuietly(session);
			disposeRun(run);
		}
	}, 240_000);
});

/** Drop a session's process; safe to call after an explicit stop. */
async function stopQuietly(session: ControlledSession | undefined): Promise<void> {
	if (session === undefined) return;
	try {
		await session.stop({ timeoutMs: 5_000 });
	} catch {
		// The session already stopped (or never started); the run root still gets cleaned up.
	}
}
