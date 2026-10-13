/**
 * The public binding in a running harness (P28, P56, S5).
 *
 * The dock materialises the recorded baseline install, loads this repository's own fixture
 * extension through the harness's real loader, and drives the session over RPC — the same
 * operator entrance the framework and extension suites use, so what is observed here is the
 * production public binding rather than a double.
 *
 * The evidence is the harness's own: the operator-visible stderr of the session, which carries
 * both the extension's own lines and the framework's notices, and the run completing without a
 * model request ever leaving the machine (the dock's local capture endpoint answers it).
 */
import { beforeAll, describe, expect, test } from "bun:test";
import * as path from "node:path";
import { type IsolatedHarness, ensureIsolatedHarness, readBaselineRecord } from "./baseline";
import { type CaptureServer, startCaptureServer } from "./capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV, DOCK_MODEL_SELECTOR } from "./fixtures/extension-root/provider";
import {
	VIEWED_CAPTURE_BASE_URL_ENV,
	VIEWED_MODEL_B,
	VIEWED_MODEL_SELECTOR,
	VIEWED_PROVIDER,
} from "./fixtures/viewed-session/provider";
import {
	LIFECYCLE_ACTION_MS,
	LIFECYCLE_ASYNC_ACTION,
	LIFECYCLE_COMMAND,
	LIFECYCLE_CONFIG_VALUE,
	LIFECYCLE_INITIALIZATION_MS,
	LIFECYCLE_SYNC_ACTION,
} from "./fixtures/binding-lifecycle/entrypoint";
import { type RunRoot, createRunRoot } from "./run-root";
import { ControlledSession, type RpcFrame } from "./session";

const record = readBaselineRecord();
const PROVIDER_FIXTURE = path.join(import.meta.dir, "fixtures", "extension-root", "provider.ts");
const LIFECYCLE_FIXTURE = path.join(import.meta.dir, "fixtures", "binding-lifecycle", "entrypoint.ts");
const VIEWED_PROVIDER_FIXTURE = path.join(import.meta.dir, "fixtures", "viewed-session", "provider.ts");

let harness: IsolatedHarness;

beforeAll(async () => {
	harness = await ensureIsolatedHarness(record);
});

interface DockRun {
	readonly session: ControlledSession;
	readonly capture: CaptureServer;
	readonly runRoot: RunRoot;
}

/**
 * One run's provider fixture: the module that registers it, the selector the session starts on,
 * and the environment variable that fixture reads the dock's capture endpoint from.
 */
interface RunProvider {
	readonly fixture: string;
	readonly model: string;
	readonly captureEnv: string;
}

/** The one-model provider the lifecycle's load/init/action case runs on. */
const LIFECYCLE_PROVIDER: RunProvider = {
	fixture: PROVIDER_FIXTURE,
	model: DOCK_MODEL_SELECTOR,
	captureEnv: DOCK_CAPTURE_BASE_URL_ENV,
};

/**
 * The two-model, reasoning provider: a run that changes models and effort needs a provider that
 * really has a second model and really reports settable levels, or the change proves nothing.
 */
const SWITCH_PROVIDER: RunProvider = {
	fixture: VIEWED_PROVIDER_FIXTURE,
	model: VIEWED_MODEL_SELECTOR,
	captureEnv: VIEWED_CAPTURE_BASE_URL_ENV,
};

/** The help the fixture's declaration spells out, written here from that declaration. */
const LIFECYCLE_HELP = [
	`/${LIFECYCLE_COMMAND} — dock lifecycle probe`,
	`  ${LIFECYCLE_ASYNC_ACTION} — wait, then report`,
	"  stop — report immediately",
].join("\n");

/** The operator notices one session emitted, in order, as the harness itself framed them. */
function noticesOf(session: ControlledSession): ReadonlyArray<{ readonly level: unknown; readonly message: string }> {
	return session
		.frames()
		.filter(frame => frame.type === "extension_ui_request" && frame.method === "notify")
		.map(frame => ({ level: frame.notifyType, message: String(frame.message) }));
}

/** One RPC payload as an object, when it really is one. */
function payloadRecord(frame: RpcFrame): Record<string, unknown> {
	const data = frame.data;
	return data !== null && typeof data === "object" ? (data as Record<string, unknown>) : {};
}

/** The thinking levels the host itself listed for the running model. */
function thinkingLevels(frame: RpcFrame): string[] {
	const levels = payloadRecord(frame).levels;
	return Array.isArray(levels) ? levels.filter((level): level is string => typeof level === "string") : [];
}

/** One node of the host's own session tree, as far as this suite reads it. */
interface TreeNode {
	readonly entry?: { readonly id?: unknown; readonly type?: unknown; readonly message?: { readonly role?: unknown } };
	readonly children?: readonly TreeNode[];
}

/** The id of the first user message on the session tree the host itself reported. */
function firstUserEntryId(frame: RpcFrame): string {
	const root = payloadRecord(frame).tree;
	const queue: TreeNode[] = Array.isArray(root) ? [...(root as TreeNode[])] : [];
	while (queue.length > 0) {
		const node = queue.shift() as TreeNode;
		const entry = node.entry;
		if (entry?.type === "message" && entry.message?.role === "user" && typeof entry.id === "string") {
			return entry.id;
		}
		if (Array.isArray(node.children)) queue.push(...node.children);
	}
	throw new Error("the host's tree held no user message entry to branch at");
}

async function startRun(label: string, provider: RunProvider = LIFECYCLE_PROVIDER): Promise<DockRun> {
	const runRoot = createRunRoot(label);
	const capture = startCaptureServer({ dir: runRoot.captureDir });
	try {
		const session = await ControlledSession.start({
			harness,
			runRoot,
			extensions: [provider.fixture, LIFECYCLE_FIXTURE],
			model: provider.model,
			env: { [provider.captureEnv]: capture.baseUrl },
			promptTimeoutMs: 60_000,
		});
		return { session, capture, runRoot };
	} catch (error) {
		capture.stop();
		runRoot.dispose();
		throw error;
	}
}

async function disposeRun(run: DockRun): Promise<void> {
	try {
		await run.session.stop({ timeoutMs: 10_000 });
	} catch {
		// The session already stopped (or never started); the run root still gets cleaned up.
	}
	run.capture.stop();
	run.runRoot.dispose();
}

describe("the public binding in a real session (P28, P56)", () => {
	test("the host loads it with its validated configuration, waits for its initialization, runs its actions and cleans it up once", async () => {
		const run = await startRun("binding-lifecycle");
		try {
			// The first model request, issued while the extension's initialization is still in
			// flight: the run cannot answer before the initialization settled, so the round trip
			// carries the initialization's own duration.
			const startedAt = performance.now();
			const turn = await run.session.prompt("hello");
			const turnMs = performance.now() - startedAt;

			expect(turn.status).toBe("completed");
			expect(turnMs).toBeGreaterThanOrEqual(LIFECYCLE_INITIALIZATION_MS);
			// The configuration the factory was handed is the file's own value, and it was read
			// before the factory ran.
			expect(run.session.stderr()).toContain(`[binding-lifecycle] loaded config=${LIFECYCLE_CONFIG_VALUE}`);
			expect(run.session.stderr()).toContain("[binding-lifecycle] initialize started");
			expect(run.session.stderr()).toContain("[binding-lifecycle] initialize settled");

			// The model request really happened, so the wait above was a wait, not an unused path.
			expect(run.capture.requests().length).toBeGreaterThan(0);

			// An empty argument prints the help and runs nothing, and an argument that is not
			// exactly an action is refused with the same help — no abbreviation, no extra argument,
			// no extension words. The session reports both on its own operator channel, which in
			// RPC mode is the notify frame below.
			await run.session.prompt(`/${LIFECYCLE_COMMAND}`);
			await run.session.prompt(`/${LIFECYCLE_COMMAND} wat`);

			expect(noticesOf(run.session)).toEqual([
				{ level: "info", message: LIFECYCLE_HELP },
				{ level: "error", message: LIFECYCLE_HELP },
			]);
			expect(run.session.stderr()).not.toContain("[binding-lifecycle] action");

			// A declared action runs, and the host's command chain waits for it.
			const actionStartedAt = performance.now();
			await run.session.prompt(`/${LIFECYCLE_COMMAND} ${LIFECYCLE_ASYNC_ACTION}`);
			const actionMs = performance.now() - actionStartedAt;

			expect(actionMs).toBeGreaterThanOrEqual(LIFECYCLE_ACTION_MS);
			expect(run.session.stderr()).toContain("[binding-lifecycle] action started");
			expect(run.session.stderr()).toContain("[binding-lifecycle] action finished");
		} finally {
			await run.session.stop({ timeoutMs: 10_000 });
		}

		// The harness shut the session down, and the extension's one cleanup ran exactly once.
		const exit = run.session.exited();
		expect(exit?.exitCode).toBe(0);
		expect(exit?.stderr.match(/\[binding-lifecycle\] cleanup/g) ?? []).toHaveLength(1);

		run.capture.stop();
		run.runRoot.dispose();
	}, 120_000);

	test("an ordinary switch keeps the one instance, and the shutdown cleans it once", async () => {
		const run = await startRun("binding-lifecycle-switch", SWITCH_PROVIDER);
		try {
			// Loading the extension ran its factory — the declared configuration was read and
			// validated first — and nothing has left the machine: creation is not an effect.
			expect(run.session.stderr()).toContain(
				`[binding-lifecycle] loaded config=${LIFECYCLE_CONFIG_VALUE} instance=1`,
			);
			expect(run.capture.requests()).toHaveLength(0);

			// The session the extension serves: its initialization settles, and the instance's own
			// action runs.
			await run.session.prompt("first session");
			await run.session.prompt(`/${LIFECYCLE_COMMAND} ${LIFECYCLE_SYNC_ACTION}`);
			const firstSessionFile = run.session.sessionLog().file;

			// An ordinary model and effort change on the session being served: not a boundary.
			await run.session.request({ type: "set_model", provider: VIEWED_PROVIDER, modelId: VIEWED_MODEL_B });
			const levels = thinkingLevels(await run.session.request({ type: "get_available_thinking_levels" }));
			const currentLevel = payloadRecord(await run.session.request({ type: "get_state" })).thinkingLevel;
			const chosenLevel = levels.find(level => level !== currentLevel);
			if (chosenLevel === undefined) {
				throw new Error(`the run offered no thinking level other than ${String(currentLevel)}`);
			}
			await run.session.request({ type: "set_thinking_level", level: chosenLevel });
			await run.session.prompt(`/${LIFECYCLE_COMMAND} ${LIFECYCLE_SYNC_ACTION}`);

			// A tree navigation: the host rewinds onto a new session file at the first user message,
			// which is an ordinary transition of the same kind rather than a disposal.
			const tree = await run.session.request({ type: "get_tree" });
			const branched = await run.session.request({ type: "branch", entryId: firstUserEntryId(tree) });
			expect(payloadRecord(branched).cancelled).toBe(false);
			await run.session.prompt(`/${LIFECYCLE_COMMAND} ${LIFECYCLE_SYNC_ACTION}`);

			// Switching back is the same instance serving the first session again.
			const resumed = await run.session.request({ type: "switch_session", sessionPath: firstSessionFile });
			expect(payloadRecord(resumed).cancelled).toBe(false);
			await run.session.prompt(`/${LIFECYCLE_COMMAND} ${LIFECYCLE_SYNC_ACTION}`);

			// And another session takes over again, so the run ends while the instance is serving a
			// session that is *not* the one that initialized it: the disposal the shutdown delivers
			// names the current session, which is what makes the cleanup below evidence about the
			// served owner rather than about the first one that ever started.
			const created = await run.session.request({ type: "new_session" });
			expect(payloadRecord(created).cancelled).toBe(false);
			expect(run.session.stderr()).not.toContain("[binding-lifecycle] cleanup");
			await run.session.prompt(`/${LIFECYCLE_COMMAND} ${LIFECYCLE_SYNC_ACTION}`);

			const evidence = run.session.stderr();
			expect(evidence.match(/\[binding-lifecycle\] loaded config=/g) ?? []).toHaveLength(1);
			expect(evidence.match(/\[binding-lifecycle\] initialize started/g) ?? []).toHaveLength(1);
			// Five invocations, all of the one instance that was built at load.
			expect(evidence.match(/\[binding-lifecycle\] action reported instance=1/g) ?? []).toHaveLength(5);
		} finally {
			await run.session.stop({ timeoutMs: 10_000 });
		}

		// The process going away is the instance's one disposal, whichever session is being served.
		const exit = run.session.exited();
		expect(exit?.exitCode).toBe(0);
		expect(exit?.stderr.match(/\[binding-lifecycle\] cleanup instance=1/g) ?? []).toHaveLength(1);

		run.capture.stop();
		run.runRoot.dispose();
	}, 120_000);
});
