/**
 * The init injected-prompt slot, end to end on the real OMP harness (B3, B5, B10, C6,
 * C7, C8; P18, P19, P21, P22, P37).
 *
 * The observable seam is the OMP extension seam: the real loader discovers
 * `entrypoints/omp`, a real isolated session runs, and the session JSONL, the captured
 * outbound requests and the resume replay are read back. `/codebase-tools` is the only
 * control the extension offers, so a turn is enabled by running the command first.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import * as path from "node:path";
import { INIT_PROMPT, REMINDER_PROMPT } from "../../extensions/codebase-tools/shared-logic/prompts";
import { type IsolatedHarness, REPO_ROOT, ensureIsolatedHarness, readBaselineRecord } from "../harness-dock/baseline";
import { type CaptureServer, type CapturedRequest, startCaptureServer } from "../harness-dock/capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV, DOCK_MODEL_SELECTOR } from "../harness-dock/fixtures/extension-root/provider";
import { type RunRoot, createRunRoot } from "../harness-dock/run-root";
import { ControlledSession } from "../harness-dock/session";
import { type SessionEntry, customEntries, customMessages } from "../harness-dock/session-log";

/** The OMP discovery root this repository deploys, and the credential-free provider fixture. */
const OMP_ENTRYPOINT_DIR = path.join(REPO_ROOT, "entrypoints", "omp");
const PROVIDER_FIXTURE = path.join(REPO_ROOT, "tests", "harness-dock", "fixtures", "extension-root", "provider.ts");

/** The identities the migration fixes: the init slot and the State record. */
const INIT_IDENTITY = "codebase-tools:init";
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

/** Start one session in a run: a fresh process over the run's session directory. */
function openSession(run: Run, extraArgs: readonly string[] = []): Promise<ControlledSession> {
	return ControlledSession.start({
		harness,
		runRoot: run.runRoot,
		extensions: [PROVIDER_FIXTURE, OMP_ENTRYPOINT_DIR],
		model: DOCK_MODEL_SELECTOR,
		env: { [DOCK_CAPTURE_BASE_URL_ENV]: run.capture.baseUrl },
		extraArgs,
	});
}

async function disposeRun(run: Run): Promise<void> {
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

/** The parsed shape of one captured request body: this harness's own serialized JSON. */
interface CapturedBody {
	readonly messages?: ReadonlyArray<{ readonly content?: unknown }>;
	readonly tools?: ReadonlyArray<{ readonly function?: { readonly name?: string } }>;
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

/** How many provider messages in one captured request carry `needle` as their text. */
function messagesCarrying(request: CapturedRequest, needle: string): number {
	return (capturedBody(request).messages ?? []).filter(message => messageText(message.content).includes(needle)).length;
}

/**
 * How many provider messages in one captured request carry an injected prompt's text.
 *
 * Either slot's resource counts, so this is the number of contributions the branch held
 * when the request was built, whether or not the two resources hold identical text.
 */
function injectedMessages(request: CapturedRequest): number {
	const needles = [INIT_PROMPT, REMINDER_PROMPT];
	return (capturedBody(request).messages ?? []).filter(message => {
		const text = messageText(message.content);
		return needles.some(needle => text.includes(needle));
	}).length;
}

/** The tool names one captured request asked the provider to expose. */
function toolNames(request: CapturedRequest): string[] {
	return (capturedBody(request).tools ?? []).map(tool => tool.function?.name ?? "").sort();
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
	// The check has subjects: the first session's journal really carried these entries.
	expect(compared).toBeGreaterThan(0);
}

describe("first enabled run injects one init (B3, C6, C7, P19, P21)", () => {
	test("one hidden persisted init is appended once per user turn, across a tool continuation", async () => {
		// A scripted tool call makes the turn produce two model requests in one run, so a
		// re-triggered run hook would show up as a second injection. The read target exists
		// before the capture endpoint is built, because the call's arguments name it.
		const runRoot = createRunRoot("init-first-turn");
		const readTarget = path.join(runRoot.workDir, "init-probe-target.txt");
		writeFileSync(readTarget, "dock read target\n");
		const run: Run = {
			runRoot,
			capture: startCaptureServer({
				dir: runRoot.captureDir,
				toolCall: { name: "read", arguments: JSON.stringify({ path: readTarget }), times: 1 },
			}),
		};
		let session: ControlledSession | undefined;
		try {
			session = await openSession(run);
			const enable = await session.prompt(`/${COMMAND}`);
			expect(enable.agentInvoked).toBe(false);
			const turn = await session.prompt("codebase-tools init turn");
			expect(turn.agentInvoked).toBe(true);
			expect(turn.status).toBe("completed");
			const sessionFile = await sessionFileOf(session);
			expect((await session.stop()).exitCode).toBe(0);

			const log = session.sessionLog(sessionFile);
			expect(log.unparsed).toEqual([]);

			// Exactly one init, with the framework-fixed identity, text, visibility and
			// attribution. The content is the resource's text, not a substitute.
			const injected = customMessages(log.entries, INIT_IDENTITY);
			expect(injected).toHaveLength(1);
			expect(injected[0]).toMatchObject({
				customType: INIT_IDENTITY,
				content: INIT_PROMPT,
				display: false,
				attribution: "agent",
			});

			// Tail: the contribution hangs off the turn's own user message, so it landed as
			// the last entry of the conversation when that run started.
			const userEntry = log.entries.find(
				entry => entry.type === "message" && (entry.message as { role?: string } | undefined)?.role === "user",
			);
			expect(userEntry).toBeDefined();
			const userIndex = log.entries.indexOf(userEntry as SessionEntry);
			expect(log.entries.indexOf(injected[0] as SessionEntry)).toBeGreaterThan(userIndex);
			expect(injected[0]?.parentId).toBe(userEntry?.id);

			// Progress is the branch's own content: the only State record the turn left is the
			// toggle's, with no progress flag anywhere in the journal.
			expect(customEntries(log.entries, STATE_ENTRY_TYPE).map(entry => entry.data)).toEqual([
				{ enabled: true },
			]);
			expect(JSON.stringify(log.entries)).not.toContain("initInjected");

			// The turn really was a multi-request run — one run initiation, one contribution:
			// both requests carry exactly one copy of the init text (the second from history).
			const requests = run.capture.requests();
			expect(requests).toHaveLength(2);
			for (const request of requests) expect(messagesCarrying(request, INIT_PROMPT)).toBe(1);
		} finally {
			await stopQuietly(session);
			await disposeRun(run);
		}
	}, 240_000);
});

describe("resume replays the init without rewriting history (B5, C8, P22)", () => {
	test("the persisted init is replayed on resume and no second init is injected", async () => {
		const run = createRun("init-resume");
		let first: ControlledSession | undefined;
		let second: ControlledSession | undefined;
		try {
			first = await openSession(run);
			expect((await first.prompt(`/${COMMAND}`)).status).toBe("completed");
			expect((await first.prompt("codebase-tools init turn")).agentInvoked).toBe(true);
			const sessionFile = await sessionFileOf(first);
			expect((await first.stop()).exitCode).toBe(0);
			const before = first.sessionLog(sessionFile).entries;
			const initBefore = customMessages(before, INIT_IDENTITY);
			expect(initBefore).toHaveLength(1);

			// A new process resumes the session; its turn sees the init on the branch.
			second = await openSession(run, ["--resume", sessionFile]);
			expect((await second.prompt("codebase-tools resumed turn")).agentInvoked).toBe(true);
			expect((await second.stop()).exitCode).toBe(0);
			const after = second.sessionLog(sessionFile).entries;

			// History protection: the first run's entries survive byte-for-byte and in order.
			expectAppendOnly(before, after);

			// The branch's init is the same entry, still exactly one, still hidden and
			// agent-attributed: resume replays it instead of injecting a second init.
			const initAfter = customMessages(after, INIT_IDENTITY);
			expect(initAfter).toHaveLength(1);
			expect(initAfter[0]).toEqual(initBefore[0]);

			// The resumed turn carried the replayed init plus exactly the one contribution its
			// own run added. The journal holds a single init identity (checked above), so that
			// added contribution is the reminder: resume replays instead of re-initialising.
			const requests = run.capture.requests();
			expect(requests).toHaveLength(2);
			expect(injectedMessages(requests[1] as CapturedRequest)).toBe(
				injectedMessages(requests[0] as CapturedRequest) + 1,
			);

			// The resumed run wrote no State: progress is derived, and the toggle stays the
			// only State writer.
			expect(customEntries(after, STATE_ENTRY_TYPE).map(entry => entry.data)).toEqual([{ enabled: true }]);
		} finally {
			await stopQuietly(second);
			await stopQuietly(first);
			await disposeRun(run);
		}
	}, 240_000);
});

describe("enabling injects a prompt and nothing else (B10, C11, P37)", () => {
	test("the turn's tool set is unchanged by enabling: no capability is probed or trimmed", async () => {
		const run = createRun("init-tool-set");
		let session: ControlledSession | undefined;
		try {
			session = await openSession(run);
			// One turn with the extension off, then one with it on.
			expect((await session.prompt("codebase-tools off turn")).agentInvoked).toBe(true);
			expect((await session.prompt(`/${COMMAND}`)).status).toBe("completed");
			expect((await session.prompt("codebase-tools on turn")).agentInvoked).toBe(true);
			const sessionFile = await sessionFileOf(session);
			expect((await session.stop()).exitCode).toBe(0);

			const requests = run.capture.requests();
			expect(requests).toHaveLength(2);
			// The extension contributes text only: the request's tools are the harness's own,
			// identical before and after enabling (nothing discovered, enabled or trimmed).
			expect(toolNames(requests[1] as CapturedRequest)).toEqual(toolNames(requests[0] as CapturedRequest));
			// The off turn carried no contribution; the on turn carried exactly the init.
			expect(messagesCarrying(requests[0] as CapturedRequest, INIT_PROMPT)).toBe(0);
			expect(messagesCarrying(requests[1] as CapturedRequest, INIT_PROMPT)).toBe(1);
			expect(customMessages(session.sessionLog(sessionFile).entries, INIT_IDENTITY)).toHaveLength(1);
		} finally {
			await stopQuietly(session);
			await disposeRun(run);
		}
	}, 240_000);
});
