/**
 * The reminder injected-prompt slot and contribution idempotency, end to end on the real
 * OMP harness (B4, B7, B11; P18, P20).
 *
 * The observable seam is the OMP extension seam: the real loader discovers
 * `entrypoints/omp`, a real isolated session runs, and the session JSONL and the
 * captured outbound requests are read back. Which slot a run carried is read from the
 * persisted `custom_message` identities on the *branch* the run stood on — the journal
 * is append-only, so a rewound branch is only visible by walking parent links — and the
 * captured requests show the contribution reached the provider.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import * as path from "node:path";
import { INIT_PROMPT, REMINDER_PROMPT } from "../../extensions/codebase-tools/shared-logic/prompts";
import { type IsolatedHarness, REPO_ROOT, ensureIsolatedHarness, readBaselineRecord } from "../harness-dock/baseline";
import { type CaptureServer, type CapturedRequest, startCaptureServer } from "../harness-dock/capture-server";
import { FIXTURE_TREE_COMMAND, FIXTURE_TREE_ENTRY_TYPE } from "../harness-dock/fixtures/extension-root/entrypoint";
import { DOCK_CAPTURE_BASE_URL_ENV, DOCK_MODEL_SELECTOR } from "../harness-dock/fixtures/extension-root/provider";
import { type RunRoot, createRunRoot } from "../harness-dock/run-root";
import { ControlledSession } from "../harness-dock/session";
import { type SessionEntry, type SessionLog, customEntries } from "../harness-dock/session-log";

/** The OMP discovery root this repository deploys, and the dock provider fixture. */
const OMP_ENTRYPOINT_DIR = path.join(REPO_ROOT, "entrypoints", "omp");
const FIXTURE_EXTENSION_ROOT = path.join(REPO_ROOT, "tests", "harness-dock", "fixtures", "extension-root");
const PROVIDER_FIXTURE = path.join(FIXTURE_EXTENSION_ROOT, "provider.ts");

/** The identities the migration fixes: the State record and both slots' custom types. */
const STATE_ENTRY_TYPE = "codebase-tools:state";
const INIT_IDENTITY = "codebase-tools:init";
const REMINDER_IDENTITY = "codebase-tools:reminder";
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

/** Start one session in a run; the tree fixture is loaded only by the suites that navigate. */
function openSession(
	run: Run,
	options: { readonly withTreeFixture?: boolean; readonly resume?: string } = {},
): Promise<ControlledSession> {
	return ControlledSession.start({
		harness,
		runRoot: run.runRoot,
		extensions: [
			PROVIDER_FIXTURE,
			...(options.withTreeFixture === true ? [FIXTURE_EXTENSION_ROOT] : []),
			OMP_ENTRYPOINT_DIR,
		],
		model: DOCK_MODEL_SELECTOR,
		env: { [DOCK_CAPTURE_BASE_URL_ENV]: run.capture.baseUrl },
		extraArgs: options.resume === undefined ? [] : ["--resume", options.resume],
	});
}

function disposeRun(run: Run): void {
	run.capture.stop();
	run.runRoot.dispose();
}

/** Drop a session's process; safe to call after an explicit stop. */
async function stopQuietly(session: ControlledSession | undefined): Promise<void> {
	if (session === undefined) return;
	try {
		await session.stop({ timeoutMs: 5_000 });
	} catch {
		// The session already stopped (or never started); the run root still gets cleaned up.
	}
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

/**
 * The entries on the session's current branch, oldest first: the journal's leaf walked
 * back to the root. The journal only appends, so a branch a navigation rewound past is
 * still in the file and only the parent links say what the session actually stands on.
 */
function branchOf(log: SessionLog): SessionEntry[] {
	const byId = new Map<string, SessionEntry>();
	for (const entry of log.entries) {
		if (typeof entry.id === "string") byId.set(entry.id, entry);
	}
	const branch: SessionEntry[] = [];
	let cursor: SessionEntry | undefined = log.entries[log.entries.length - 1];
	while (cursor !== undefined) {
		branch.push(cursor);
		const parentId: unknown = cursor.parentId;
		cursor = typeof parentId === "string" ? byId.get(parentId) : undefined;
	}
	return branch.reverse();
}

/** Whether an entry is one of this extension's injected-prompt contributions. */
function isSlotEntry(entry: SessionEntry): boolean {
	return (
		entry.type === "custom_message" &&
		(entry.customType === INIT_IDENTITY || entry.customType === REMINDER_IDENTITY)
	);
}

/** The parsed shape of one captured request body: this harness's own serialized JSON. */
interface CapturedBody {
	readonly messages?: ReadonlyArray<{ readonly content?: unknown }>;
}

function capturedBody(request: CapturedRequest): CapturedBody {
	return (request.json ?? {}) as CapturedBody;
}

/** The plain text of one provider message content. */
function messageText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map(part => (typeof part === "object" && part !== null && "text" in part ? String(part.text) : ""))
		.join("");
}

/**
 * How many provider messages in one request carry an injected prompt's text: the number
 * of this extension's contributions on the branch when the request was built. Either
 * slot's resource counts, so the number is the same whether or not the two resources
 * happen to hold identical text.
 */
function contributionsIn(request: CapturedRequest): number {
	const needles = [INIT_PROMPT, REMINDER_PROMPT];
	return (capturedBody(request).messages ?? []).filter(message => {
		const text = messageText(message.content);
		return needles.some(needle => text.includes(needle));
	}).length;
}

/**
 * Every entry of `before` is still present, unchanged, in the same relative order in
 * `after`: history was appended to, never rewritten, reordered or pruned.
 */
function expectAppendOnly(before: readonly SessionEntry[], after: readonly SessionEntry[]): void {
	const ids = after.map(entry => entry.id);
	let cursor = 0;
	let compared = 0;
	for (const entry of before) {
		const id = entry.id;
		if (typeof id !== "string") continue;
		const position = ids.indexOf(id, cursor);
		expect(position).toBeGreaterThanOrEqual(0);
		expect(after[position]).toEqual(entry);
		cursor = position + 1;
		compared += 1;
	}
	// The check has subjects: the earlier journal really carried these entries.
	expect(compared).toBeGreaterThan(0);
}

describe("every enabled run after the first carries one reminder (B4, C7, P18)", () => {
	test("three enabled turns inject one init and then exactly one reminder per turn", async () => {
		const run = createRun("reminder-turns");
		let session: ControlledSession | undefined;
		try {
			session = await openSession(run);
			expect((await session.prompt(`/${COMMAND}`)).status).toBe("completed");
			for (const label of ["first", "second", "third"]) {
				expect((await session.prompt(`codebase-tools ${label} turn`)).agentInvoked).toBe(true);
			}
			const sessionFile = await sessionFileOf(session);
			expect((await session.stop()).exitCode).toBe(0);

			const log = session.sessionLog(sessionFile);
			expect(log.unparsed).toEqual([]);

			// One init, then one reminder per enabled run: the identities the branch carries,
			// in the order the runs appended them. Init progress never suppresses a reminder.
			const contributions = branchOf(log).filter(isSlotEntry);
			expect(contributions.map(entry => entry.customType)).toEqual([
				INIT_IDENTITY,
				REMINDER_IDENTITY,
				REMINDER_IDENTITY,
			]);
			expect(contributions[0]).toMatchObject({
				content: INIT_PROMPT,
				display: false,
				attribution: "agent",
			});
			for (const reminder of contributions.slice(1)) {
				expect(reminder).toMatchObject({
					content: REMINDER_PROMPT,
					display: false,
					attribution: "agent",
				});
			}

			// Each contribution hangs off the turn it belongs to, so it landed at the end of
			// that run's conversation.
			const userIds = branchOf(log)
				.filter(entry => entry.type === "message" && (entry.message as { role?: string } | undefined)?.role === "user")
				.map(entry => entry.id);
			expect(userIds).toHaveLength(3);
			expect(contributions.map(entry => entry.parentId)).toEqual(userIds);

			// The outbound requests agree: the toggle's turn reached no provider, and each
			// enabled turn carried exactly one contribution more than the turn before it.
			const requests = run.capture.requests();
			expect(requests).toHaveLength(3);
			expect(requests.map(contributionsIn)).toEqual([1, 2, 3]);

			// The only State record is the toggle's: no run advanced a stored progress flag.
			expect(customEntries(branchOf(log), STATE_ENTRY_TYPE).map(entry => entry.data)).toEqual([
				{ enabled: true },
			]);
		} finally {
			await stopQuietly(session);
			disposeRun(run);
		}
	}, 240_000);
});

describe("off and on again keep the branch's progress (B7, P18)", () => {
	test("the off turn injects nothing and the re-enabled turn carries the reminder, not a second init", async () => {
		const run = createRun("reminder-off-on");
		let session: ControlledSession | undefined;
		try {
			session = await openSession(run);
			expect((await session.prompt(`/${COMMAND}`)).status).toBe("completed");
			expect((await session.prompt("codebase-tools enabled turn")).agentInvoked).toBe(true);
			const sessionFile = await sessionFileOf(session);
			const beforeOff = session.sessionLog(sessionFile).entries;

			expect((await session.prompt(`/${COMMAND}`)).status).toBe("completed");
			expect((await session.prompt("codebase-tools off turn")).agentInvoked).toBe(true);
			expect((await session.prompt(`/${COMMAND}`)).status).toBe("completed");
			expect((await session.prompt("codebase-tools re-enabled turn")).agentInvoked).toBe(true);
			expect((await session.stop()).exitCode).toBe(0);

			const log = session.sessionLog(sessionFile);
			expect(log.unparsed).toEqual([]);
			const branch = branchOf(log);

			// Turning off records the new value and clears nothing: the init the enabled turn
			// committed is still on the branch.
			expect(customEntries(branch, STATE_ENTRY_TYPE).map(entry => entry.data)).toEqual([
				{ enabled: true },
				{ enabled: false },
				{ enabled: true },
			]);
			// The off run contributed nothing, and the re-enabled run resumed with the reminder
			// instead of starting a second init: the branch's progress survived the toggle.
			expect(branch.filter(isSlotEntry).map(entry => entry.customType)).toEqual([
				INIT_IDENTITY,
				REMINDER_IDENTITY,
			]);

			// The off turn reached the provider with no extra contribution; the turn after the
			// re-enable carried exactly one more.
			const requests = run.capture.requests();
			expect(requests).toHaveLength(3);
			expect(requests.map(contributionsIn)).toEqual([1, 1, 2]);

			// History protection: the entries written before the toggle are all still there,
			// unchanged and in order.
			expectAppendOnly(beforeOff, log.entries);
		} finally {
			await stopQuietly(session);
			disposeRun(run);
		}
	}, 240_000);
});

describe("a branch rewound past the init re-injects it (B11, P20)", () => {
	test("navigating the tree back past the init puts the next run back to init, then to reminder", async () => {
		const run = createRun("reminder-tree-rewind");
		let session: ControlledSession | undefined;
		try {
			session = await openSession(run, { withTreeFixture: true });
			expect((await session.prompt(`/${COMMAND}`)).status).toBe("completed");
			expect((await session.prompt("codebase-tools before rewind")).agentInvoked).toBe(true);
			const firstUser = (await userMessagesOf(session))[0];
			if (firstUser === undefined) throw new Error("the turn recorded no user message entry");

			// Navigating to that message rewinds the leaf past it and past the init the run
			// appended, so the session stands on a branch that carries the State and no init.
			expect((await session.prompt(`/${FIXTURE_TREE_COMMAND} ${String(firstUser.id)}`)).status).toBe("completed");
			expect((await session.prompt("codebase-tools rewound turn")).agentInvoked).toBe(true);
			expect((await session.prompt("codebase-tools after rewound turn")).agentInvoked).toBe(true);
			const sessionFile = await sessionFileOf(session);
			expect((await session.stop()).exitCode).toBe(0);

			const log = session.sessionLog(sessionFile);
			expect(log.unparsed).toEqual([]);
			const branch = branchOf(log);

			// The navigation changed only the leaf: the activation value it stands on is still
			// the enabling record, and the init it rewound past is gone from the branch.
			expect(customEntries(branch, STATE_ENTRY_TYPE).map(entry => entry.data)).toEqual([
				{ enabled: true },
			]);
			// The run on the rewound branch re-injected the init — the branch lacked it — and
			// the run after it handed over to the reminder.
			expect(branch.filter(isSlotEntry).map(entry => entry.customType)).toEqual([
				INIT_IDENTITY,
				REMINDER_IDENTITY,
			]);

			// The journal kept both inits and the reminder: a rewind re-injects, it does not
			// rewrite history.
			expect(log.entries.filter(isSlotEntry).map(entry => entry.customType)).toEqual([
				INIT_IDENTITY,
				INIT_IDENTITY,
				REMINDER_IDENTITY,
			]);
			const treeEntry = customEntries(log.entries, FIXTURE_TREE_ENTRY_TYPE)[0];
			expect(treeEntry?.data).toEqual({ targetId: firstUser.id, cancelled: false });

			// The outbound requests follow the branch the run stood on: the rewound turn carried
			// one contribution (the new init alone) and the turn after it carried two.
			const requests = run.capture.requests();
			expect(requests).toHaveLength(3);
			expect(requests.map(contributionsIn)).toEqual([1, 1, 2]);
		} finally {
			await stopQuietly(session);
			disposeRun(run);
		}
	}, 240_000);
});

describe("one enabled run injects one reminder however many requests it makes (B11, C6)", () => {
	test("a tool continuation inside the run leaves the reminder count at one", async () => {
		const run = createRun("reminder-tool-continuation");
		const readTarget = path.join(run.runRoot.workDir, "reminder-probe-target.txt");
		writeFileSync(readTarget, "dock read target\n");
		let first: ControlledSession | undefined;
		let second: ControlledSession | undefined;
		let continuation: CaptureServer | undefined;
		try {
			// The first process only enables the extension and takes its init turn.
			first = await openSession(run);
			expect((await first.prompt(`/${COMMAND}`)).status).toBe("completed");
			expect((await first.prompt("codebase-tools init turn")).agentInvoked).toBe(true);
			const sessionFile = await sessionFileOf(first);
			expect((await first.stop()).exitCode).toBe(0);
			const before = first.sessionLog(sessionFile).entries;

			// The resumed turn answers its first completion with a tool call, so that one
			// enabled run reaches the provider twice: a run initiation is not a request.
			continuation = startCaptureServer({
				dir: path.join(run.runRoot.path, "captures-continuation"),
				toolCall: { name: "read", arguments: JSON.stringify({ path: readTarget }), times: 1 },
			});
			second = await openSession({ runRoot: run.runRoot, capture: continuation }, { resume: sessionFile });
			const turn = await second.prompt("codebase-tools tool turn");
			expect(turn.agentInvoked).toBe(true);
			expect(turn.status).toBe("completed");
			expect((await second.stop()).exitCode).toBe(0);

			const log = second.sessionLog(sessionFile);
			expect(log.unparsed).toEqual([]);

			// Two model requests, one run initiation, one contribution: the run planned the
			// reminder once, and the continuation replayed it from history instead.
			expect(continuation.requests()).toHaveLength(2);
			expect(continuation.requests().map(contributionsIn)).toEqual([2, 2]);
			// The journal gained exactly one reminder: the init is still single, and no state
			// entry was written for it.
			expect(log.entries.filter(isSlotEntry).map(entry => entry.customType)).toEqual([
				INIT_IDENTITY,
				REMINDER_IDENTITY,
			]);
			expect(customEntries(log.entries, STATE_ENTRY_TYPE).map(entry => entry.data)).toEqual([
				{ enabled: true },
			]);
			// History protection: the resumed turn appended to the earlier journal only.
			expectAppendOnly(before, log.entries);
		} finally {
			await stopQuietly(second);
			await stopQuietly(first);
			try {
				continuation?.stop();
			} finally {
				disposeRun(run);
			}
		}
	}, 240_000);
});
