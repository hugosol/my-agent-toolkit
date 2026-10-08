/**
 * Owner inheritance on the real OMP runtime (B9, C3, P3, P4, P8; and the single-main
 * limitation N10, which is recorded in the design notes rather than asserted here).
 *
 * The observable seam is the OMP extension seam: the real loader discovers
 * `entrypoints/omp`, a real session runs in the isolated install, and every subagent is
 * the runtime's own built-in one — the scripted provider answers a turn with a `task`
 * tool call, so the runtime spawns a real subagent session of its own. Spawning is made
 * blocking (async execution off in a one-shot config overlay) so a turn's requests and
 * its subagent's requests arrive in a deterministic order.
 *
 * Evidence is read where a consumer sees it: each session's own JSONL (the persisting
 * session's contributions and State records) and the outbound requests the runtime
 * serialized for each session, split by the assignment text that session's turn carries.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import * as path from "node:path";
import { INIT_PROMPT, REMINDER_PROMPT } from "../../extensions/codebase-tools/shared-logic/prompts";
import { type IsolatedRuntime, REPO_ROOT, ensureIsolatedRuntime, readBaselineRecord } from "../harness/baseline";
import { type CaptureServer, type CaptureStep, type CapturedRequest, startCaptureServer } from "../harness/capture-server";
import { HARNESS_CAPTURE_BASE_URL_ENV, HARNESS_MODEL_SELECTOR } from "../harness/fixtures/extension-root/provider";
import { type RunRoot, createRunRoot } from "../harness/run-root";
import { ControlledSession } from "../harness/session";
import { type SessionEntry, customEntries, customMessages, spawnedSessionFileCarrying, spawnedSessionFiles } from "../harness/session-log";

/** The OMP discovery root this repository deploys, and the credential-free provider fixture. */
const OMP_ENTRYPOINT_DIR = path.join(REPO_ROOT, "entrypoints", "omp");
const PROVIDER_FIXTURE = path.join(REPO_ROOT, "tests", "harness", "fixtures", "extension-root", "provider.ts");

/** The identities the migration fixes: the two slots and the State record. */
const INIT_IDENTITY = "codebase-tools:init";
const REMINDER_IDENTITY = "codebase-tools:reminder";
const STATE_ENTRY_TYPE = "codebase-tools:state";
const COMMAND = "codebase-tools";

/**
 * The one-shot config overlay every run uses: `async.enabled` off makes a `task` spawn
 * block, so the spawning turn does not finish until its subagent does.
 */
const BLOCKING_SPAWN_OVERLAY = "async:\n  enabled: false\n";

/** The parent turns this suite drives, and the assignment each delegation carries. */
const OFF_TURN = "codebase-tools owner-off turn";
const ON_TURN = "codebase-tools owner-on turn";
const NESTED_TURN = "codebase-tools nested turn";
const CHILD_OFF_ASSIGNMENT = "child assigned while the owner was off";
const CHILD_ON_ASSIGNMENT = "child assigned while the owner was on";
const GRANDCHILD_ASSIGNMENT = "grandchild assigned by the child";

let runtime: IsolatedRuntime;

beforeAll(async () => {
	runtime = await ensureIsolatedRuntime(readBaselineRecord());
}, 300_000);

/** One delegation the scripted model performs: the marker it reads, the spawn it answers. */
interface Delegation {
	/** The turn text whose request this delegation answers. */
	readonly marker: string;
	/** The assignment the spawned subagent receives. */
	readonly assignment: string;
}

/**
 * The scripted model: a request whose turn carries one of `delegations` markers is
 * answered with a `task` tool call spawning that assignment, once per marker; every other
 * request is answered with plain text.
 *
 * A real subagent is what this drives — the delegation is the model's own decision, and
 * the runtime's `task` tool spawns its built-in subagent from it.
 */
function delegatingResponder(delegations: readonly Delegation[]): (request: CapturedRequest) => CaptureStep | undefined {
	const delegated = new Set<string>();
	return request => {
		const texts = userMessageTexts(request);
		const hit = delegations.find(
			delegation => !delegated.has(delegation.marker) && texts.some(text => text.includes(delegation.marker)),
		);
		if (hit === undefined) return undefined;
		delegated.add(hit.marker);
		return {
			toolCall: {
				name: "task",
				arguments: JSON.stringify({ task: hit.assignment, solutionSpace: "one fixed string reply" }),
			},
		};
	};
}

interface Run {
	readonly runRoot: RunRoot;
	readonly capture: CaptureServer;
}

function createRun(label: string, respond: (request: CapturedRequest) => CaptureStep | undefined): Run {
	const runRoot = createRunRoot(label);
	// The overlay lives in the run root, so the default agent environment and the
	// repository are untouched; the runtime reads it for this process only.
	const overlay = path.join(runRoot.path, "overlay.yml");
	writeFileSync(overlay, BLOCKING_SPAWN_OVERLAY, "utf8");
	return { runRoot, capture: startCaptureServer({ dir: runRoot.captureDir, respond }) };
}

/** The serialized request shape this suite reads: the roles and texts the runtime sent. */
interface CapturedBody {
	readonly messages?: ReadonlyArray<{ readonly role?: unknown; readonly content?: unknown }>;
}

function bodyOf(request: CapturedRequest): CapturedBody {
	return (request.json ?? {}) as CapturedBody;
}

function messageText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map(part => (typeof part === "object" && part !== null && "text" in part ? String(part.text) : ""))
		.join("");
}

/** The text of every user message one request carries, in order. */
function userMessageTexts(request: CapturedRequest): string[] {
	return (bodyOf(request).messages ?? [])
		.filter(message => message.role === "user")
		.map(message => messageText(message.content));
}

/**
 * How many provider messages in one request carry an injected prompt's text.
 *
 * Either slot's resource counts, so this is the number of contributions the branch held
 * when the request was built. The two resources hold identical text, so a slot is told
 * apart by the identity its persisted entry carries (the session JSONL), not here.
 */
function injectedMessages(request: CapturedRequest): number {
	return (bodyOf(request).messages ?? []).filter(message => {
		const text = messageText(message.content);
		return text.includes(INIT_PROMPT) || text.includes(REMINDER_PROMPT);
	}).length;
}

/** The requests one turn or one subagent's session produced, by the text it carries. */
function requestsCarrying(run: Run, marker: string): CapturedRequest[] {
	return run.capture.requests().filter(request => userMessageTexts(request).some(text => text.includes(marker)));
}

/** Start one session in a run: a fresh process over the run's session directory. */
function openSession(run: Run): Promise<ControlledSession> {
	const overlay = path.join(run.runRoot.path, "overlay.yml");
	return ControlledSession.start({
		runtime,
		runRoot: run.runRoot,
		extensions: [PROVIDER_FIXTURE, OMP_ENTRYPOINT_DIR],
		model: HARNESS_MODEL_SELECTOR,
		env: { [HARNESS_CAPTURE_BASE_URL_ENV]: run.capture.baseUrl },
		extraArgs: ["--config", overlay],
	});
}

async function disposeRun(run: Run, session: ControlledSession | undefined): Promise<void> {
	try {
		await session?.stop({ timeoutMs: 5_000 });
	} catch {
		// The session already stopped; the run root still gets cleaned up.
	}
	run.capture.stop();
	run.runRoot.dispose();
}

/** The session file the runtime reports for the session it currently runs. */
async function sessionFileOf(session: ControlledSession): Promise<string> {
	const frame = await session.request({ type: "get_state" });
	const file = (frame.data as { sessionFile?: string } | undefined)?.sessionFile;
	if (file === undefined) throw new Error(`the runtime reported no session file: ${JSON.stringify(frame)}`);
	return file;
}

/** The persisted contributions of one slot in a session's JSONL, in journal order. */
function contributed(entries: readonly SessionEntry[], identity: string): SessionEntry[] {
	return customMessages(entries, identity);
}

describe("a real built-in subagent follows the owner's current enabled (B9, C3, P4)", () => {
	test("a subagent spawned while the owner is off stays silent; after the owner is enabled, a subagent initialises its own branch", async () => {
		const run = createRun(
			"subagent-owner-toggle",
			delegatingResponder([
				{ marker: ON_TURN, assignment: CHILD_ON_ASSIGNMENT },
				{ marker: OFF_TURN, assignment: CHILD_OFF_ASSIGNMENT },
			]),
		);
		let session: ControlledSession | undefined;
		try {
			session = await openSession(run);

			// Turn 1 runs with the extension off (a clean session starts off), and the
			// subagent it spawns runs inside that turn.
			expect((await session.prompt(OFF_TURN)).agentInvoked).toBe(true);
			// Enabling happens in the owner's own session — the only writer.
			expect((await session.prompt(`/${COMMAND}`)).agentInvoked).toBe(false);
			// Turn 2 spawns a second subagent, now under an enabled owner.
			expect((await session.prompt(ON_TURN)).agentInvoked).toBe(true);

			const sessionFile = await sessionFileOf(session);
			expect((await session.stop()).exitCode).toBe(0);

			// Two real subagent sessions were persisted, each nested under the owner's.
			const spawned = spawnedSessionFiles(sessionFile);
			expect(spawned).toHaveLength(2);
			// Which sibling is which is read from what each session recorded — the turn it
			// ran — never from flush order: the runtime may flush both spawned sessions
			// together, so their modification times can be a millisecond apart or equal.
			const childOffFile = spawnedSessionFileCarrying(sessionFile, CHILD_OFF_ASSIGNMENT);
			const childOnFile = spawnedSessionFileCarrying(sessionFile, CHILD_ON_ASSIGNMENT);
			expect([childOffFile ?? "<no off child>", childOnFile ?? "<no on child>"].sort()).toEqual([...spawned].sort());
			if (childOffFile === undefined || childOnFile === undefined) throw new Error("a spawned session was not identified");
			const childOff = session.sessionLog(childOffFile);
			const childOn = session.sessionLog(childOnFile);
			expect(childOff.unparsed).toEqual([]);
			expect(childOn.unparsed).toEqual([]);

			// The owner's own session records the toggle and its own init: the owner
			// initialises its branch once, exactly as before.
			const owner = session.sessionLog(sessionFile);
			expect(customEntries(owner.entries, STATE_ENTRY_TYPE).map(entry => entry.data)).toEqual([{ enabled: true }]);
			expect(contributed(owner.entries, INIT_IDENTITY)).toHaveLength(1);

			// The subagent spawned while the owner was off contributed nothing, and wrote no
			// State of its own: a subagent holds no write face.
			expect(contributed(childOff.entries, INIT_IDENTITY)).toHaveLength(0);
			expect(contributed(childOff.entries, REMINDER_IDENTITY)).toHaveLength(0);
			expect(customEntries(childOff.entries, STATE_ENTRY_TYPE)).toEqual([]);

			// The subagent spawned under the enabled owner follows that value live: it
			// initialised its own branch once and then repeated, with no State of its own.
			expect(contributed(childOn.entries, INIT_IDENTITY)).toHaveLength(1);
			expect(contributed(childOn.entries, REMINDER_IDENTITY).length).toBeGreaterThan(0);
			expect(customEntries(childOn.entries, STATE_ENTRY_TYPE)).toEqual([]);

			// The outbound requests tell the same story turn by turn: the off subagent
			// carried no contribution at all…
			const offRequests = requestsCarrying(run, CHILD_OFF_ASSIGNMENT);
			expect(offRequests.length).toBeGreaterThan(0);
			for (const request of offRequests) expect(injectedMessages(request)).toBe(0);

			// …while the on subagent's first run carried exactly one contribution and its
			// next run carried one more: its own branch's progress, one slot per run.
			const onRequests = requestsCarrying(run, CHILD_ON_ASSIGNMENT);
			expect(onRequests.length).toBeGreaterThan(1);
			expect(injectedMessages(onRequests[0] as CapturedRequest)).toBe(1);
			expect(injectedMessages(onRequests[1] as CapturedRequest)).toBe(
				injectedMessages(onRequests[0] as CapturedRequest) + 1,
			);

			// The owner's off turn carried nothing, and its enabled turn carried its own init.
			const offTurnRequests = requestsCarrying(run, OFF_TURN);
			expect(offTurnRequests.length).toBeGreaterThan(0);
			expect(injectedMessages(offTurnRequests[0] as CapturedRequest)).toBe(0);
			const onTurnRequests = requestsCarrying(run, ON_TURN);
			expect(injectedMessages(onTurnRequests[0] as CapturedRequest)).toBe(1);
		} finally {
			await disposeRun(run, session);
		}
	}, 300_000);
});

describe("a nested real subagent follows the same root owner (C3, P4)", () => {
	test("a subagent's own subagent resolves two levels up and initialises its own branch", async () => {
		const run = createRun(
			"subagent-nested",
			delegatingResponder([
				{ marker: NESTED_TURN, assignment: CHILD_ON_ASSIGNMENT },
				{ marker: CHILD_ON_ASSIGNMENT, assignment: GRANDCHILD_ASSIGNMENT },
			]),
		);
		let session: ControlledSession | undefined;
		try {
			session = await openSession(run);
			// The owner is enabled first, so both subagent levels have a value to follow.
			expect((await session.prompt(`/${COMMAND}`)).agentInvoked).toBe(false);
			expect((await session.prompt(NESTED_TURN)).agentInvoked).toBe(true);

			const sessionFile = await sessionFileOf(session);
			expect((await session.stop()).exitCode).toBe(0);

			// The child and the child's own subagent. Depth orders these two reliably — the
			// second level is the deeper file — unlike two siblings at one level.
			const spawned = spawnedSessionFiles(sessionFile);
			expect(spawned).toHaveLength(2);
			const [childFile, grandchildFile] = spawned as [string, string];
			const child = session.sessionLog(childFile);
			const grandchild = session.sessionLog(grandchildFile);

			// Both levels follow the same root owner, each on its own branch, and neither
			// persists a State of its own.
			expect(contributed(child.entries, INIT_IDENTITY)).toHaveLength(1);
			expect(contributed(grandchild.entries, INIT_IDENTITY)).toHaveLength(1);
			expect(customEntries(child.entries, STATE_ENTRY_TYPE)).toEqual([]);
			expect(customEntries(grandchild.entries, STATE_ENTRY_TYPE)).toEqual([]);

			// The outbound requests confirm the deeper session itself carried the init.
			const grandchildRequests = requestsCarrying(run, GRANDCHILD_ASSIGNMENT);
			expect(grandchildRequests.length).toBeGreaterThan(0);
			expect(injectedMessages(grandchildRequests[0] as CapturedRequest)).toBe(1);
		} finally {
			await disposeRun(run, session);
		}
	}, 300_000);
});
