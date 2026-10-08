/**
 * The unlisted-version notice on the real agent runtime (P6, P7, P8, P9; C13, C14).
 *
 * The unlisted condition is the runtime's own: version support belongs to the framework's
 * Supported agent-runtime baseline and an extension assembly declares no support set, so what
 * makes this run unlisted is running an agent-runtime version the baseline does not list. The
 * notice is the framework's and it belongs to the Owner — the main session — so one process tells
 * one main session once, whatever number of extensions share it: this run loads the repository's
 * own extension *and* a second framework consumer, and the runtime gives each its own module graph
 * and therefore its own copy of the framework's notice record.
 *
 * The observables are the ones the acceptance procedure uses: the RPC session's frames and stderr,
 * the session JSONL the runtime persists, and the outbound requests the capture endpoint recorded.
 * Nothing here reaches into framework internals, and nothing modifies the agent runtime, its
 * install or any host configuration.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import * as path from "node:path";
import { CODEBASE_TOOLS } from "../../extensions/codebase-tools/definition";
import { type IsolatedRuntime, REPO_ROOT, ensureIsolatedVersion, readBaselineRecord } from "../harness/baseline";
import {
	type CaptureServer,
	type CaptureStep,
	type CapturedRequest,
	startCaptureServer,
} from "../harness/capture-server";
import { NOTICE_PEER_DISPLAY_NAME } from "../harness/fixtures/admission-notice-peer/peer";
import { HARNESS_CAPTURE_BASE_URL_ENV, HARNESS_MODEL_SELECTOR } from "../harness/fixtures/extension-root/provider";
import { type RunRoot, createRunRoot } from "../harness/run-root";
import { ControlledSession, type RpcFrame } from "../harness/session";
import { spawnedSessionFileCarrying } from "../harness/session-log";

/** The repository's own extension entrypoint: the real assembly, which declares no version list. */
const EXTENSION_ENTRYPOINT = path.join(REPO_ROOT, "entrypoints", "omp", "codebase-tools.ts");
/** A second framework consumer in the same process, loaded the way every extension is. */
const PEER_ENTRYPOINT = path.join(REPO_ROOT, "tests", "harness", "fixtures", "admission-notice-peer", "peer.ts");
/** The credential-free provider fixture; it keeps the turn off the network. */
const PROVIDER_FIXTURE = path.join(REPO_ROOT, "tests", "harness", "fixtures", "extension-root", "provider.ts");
/** The name the framework's own notices are attributed to, as the framework writes it. */
const FRAMEWORK_NOTICE_SOURCE = "my-agent-toolkit";
/** The version the framework's support record lists. */
const SUPPORTED_BASELINE = readBaselineRecord().agentRuntime.supportedVersion;
/** A version independently specified to be outside that baseline: this repository's candidate. */
const UNLISTED_RUNTIME_VERSION = "18.6.1";
/** The phrase every unlisted-version notice carries, whichever channel it uses. */
const NOTICE_MARKER = "is not in the supported set";
/** The turn whose request delegates: the runtime's own built-in subagent runs the assignment. */
const SUBAGENT_TURN = "admission unlisted turn";
const SUBAGENT_ASSIGNMENT = "admission notice subagent assignment";
/**
 * The one-shot config overlay: with `async.enabled` off a `task` spawn blocks, so the spawned
 * subagent's own session deliveries happen inside the spawning turn and before its prompt result.
 */
const BLOCKING_SPAWN_OVERLAY = "async:\n  enabled: false\n";

let runtime: IsolatedRuntime;

beforeAll(async () => {
	// The runtime whose version the baseline does not list: that is what makes the run unlisted
	// now that no assembly declares a support set of its own.
	runtime = await ensureIsolatedVersion(readBaselineRecord(), UNLISTED_RUNTIME_VERSION);
}, 300_000);

interface HarnessRun {
	readonly session: ControlledSession;
	readonly capture: CaptureServer;
	readonly runRoot: RunRoot;
}

/**
 * The scripted model: the marked turn is answered with the `task` tool call that spawns the
 * runtime's own built-in subagent, once, and every other request with plain text.
 *
 * A real subagent is what this drives — the delegation is the model's decision and the spawn is
 * the runtime's — which is what gives the notice suite a genuine owner relationship to observe.
 */
function delegatingResponder(): (request: CapturedRequest) => CaptureStep | undefined {
	let delegated = false;
	return request => {
		const body = (request.json ?? {}) as { readonly messages?: ReadonlyArray<{ readonly content?: unknown }> };
		const carriesTurn = (body.messages ?? []).some(message =>
			JSON.stringify(message.content ?? "").includes(SUBAGENT_TURN),
		);
		if (delegated || !carriesTurn) return undefined;
		delegated = true;
		return {
			toolCall: {
				name: "task",
				arguments: JSON.stringify({ task: SUBAGENT_ASSIGNMENT, solutionSpace: "one fixed string reply" }),
			},
		};
	};
}

/** Start one isolated session with the harness provider, the repository's assembly and the peer. */
async function startRun(
	label: string,
	options: { readonly extraArgs?: readonly string[]; readonly respond?: (request: CapturedRequest) => CaptureStep | undefined } = {},
): Promise<HarnessRun> {
	const runRoot = createRunRoot(label);
	// The overlay lives in the run root, so the default agent environment is untouched. It is
	// written for every run: a turn that spawns nothing is unaffected by it.
	const overlay = path.join(runRoot.path, "overlay.yml");
	writeFileSync(overlay, BLOCKING_SPAWN_OVERLAY, "utf8");
	const capture = startCaptureServer({ dir: runRoot.captureDir, respond: options.respond });
	try {
		const session = await ControlledSession.start({
			runtime,
			runRoot,
			extensions: [PROVIDER_FIXTURE, EXTENSION_ENTRYPOINT, PEER_ENTRYPOINT],
			model: HARNESS_MODEL_SELECTOR,
			env: { [HARNESS_CAPTURE_BASE_URL_ENV]: capture.baseUrl },
			extraArgs: ["--config", overlay, ...(options.extraArgs ?? [])],
		});
		return { session, capture, runRoot };
	} catch (error) {
		capture.stop();
		runRoot.dispose();
		throw error;
	}
}

async function disposeRun(run: HarnessRun): Promise<void> {
	try {
		await run.session.stop({ timeoutMs: 5_000 });
	} catch {
		// The session already stopped (or never started); the run root still gets cleaned up.
	}
	run.capture.stop();
	run.runRoot.dispose();
}

/** The warning-level notices the session's UI channel carried, in order. */
function warningNotices(session: ControlledSession): RpcFrame[] {
	return session
		.frames()
		.filter(
			frame =>
				frame.type === "extension_ui_request" && frame.method === "notify" && frame.notifyType === "warning",
		);
}

describe("an unlisted version on the real runtime (P6, P7, P8, P9)", () => {
	test("two extensions, a real subagent and two main sessions: one framework notice per Owner", async () => {
		const run = await startRun("admission-unlisted-ui", { respond: delegatingResponder() });
		try {
			// A real turn runs normally — it delegates, so the runtime spawns its own built-in
			// subagent inside it — and the unlisted version does not stop the extension.
			const turn = await run.session.prompt(SUBAGENT_TURN);
			expect(turn.agentInvoked).toBe(true);
			expect(turn.status).toBe("completed");
			const firstSessionFile = (
				(await run.session.request({ type: "get_state" })).data as { sessionFile?: string } | undefined
			)?.sessionFile;
			expect(firstSessionFile).toBeDefined();

			// Two extensions hold two copies of the framework in this one process, and the session
			// was told once: one notice, attributed to the framework rather than to either binding.
			const notices = warningNotices(run.session);
			expect(notices).toHaveLength(1);
			expect(notices[0]?.notifyType).toBe("warning");
			const message = String(notices[0]?.message ?? "");
			expect(message).toContain(FRAMEWORK_NOTICE_SOURCE);
			expect(message).not.toContain(CODEBASE_TOOLS.displayName);
			expect(message).not.toContain(NOTICE_PEER_DISPLAY_NAME);
			// The version the runtime reports is the version this run installed — a version the
			// framework's baseline does not list, which is the whole point of running it.
			expect(runtime.version).toBe(UNLISTED_RUNTIME_VERSION);
			expect(message).toContain(runtime.version);
			expect(message).toContain(SUPPORTED_BASELINE);

			// Continue: the extension's command is still registered and still works, and the
			// deliveries that turn took add no second notice for the same session.
			const toggle = await run.session.prompt("/codebase-tools");
			expect(toggle.agentInvoked).toBe(false);
			expect(toggle.status).toBe("completed");
			expect(warningNotices(run.session)).toHaveLength(1);

			// A second main session is a second Owner: it gets its own single notice, because what
			// the process shares is the version decision, not the notice.
			await run.session.request({ type: "new_session" });
			const secondTurn = await run.session.prompt("admission unlisted second session turn");
			expect(secondTurn.agentInvoked).toBe(true);
			expect(secondTurn.status).toBe("completed");

			const both = warningNotices(run.session);
			expect(both).toHaveLength(2);
			expect(String(both[1]?.message ?? "")).toContain(FRAMEWORK_NOTICE_SOURCE);
			expect(String(both[1]?.message ?? "")).not.toContain(CODEBASE_TOOLS.displayName);
			// And that second session is not told again by its later deliveries.
			expect((await run.session.prompt("/codebase-tools")).status).toBe("completed");
			expect(warningNotices(run.session)).toHaveLength(2);

			const exit = await run.session.stop();
			expect(exit.exitCode).toBe(0);
			expect(warningNotices(run.session)).toHaveLength(2);

			// The subagent really ran: the turn's delegation spawned a session of the runtime's
			// own, nested under the first session — and neither it nor the second main session
			// added a third notice, so no session that is not an Owner is ever told.
			expect(spawnedSessionFileCarrying(firstSessionFile ?? "", SUBAGENT_ASSIGNMENT)).toBeDefined();

			// The notice reached no model context: it is in no persisted session entry and
			// in no outbound request body.
			const requests = run.capture.requests();
			expect(requests.length).toBeGreaterThan(0);
			for (const request of requests) expect(request.raw).not.toContain(NOTICE_MARKER);
			const persisted = run.session.sessionFiles().flatMap(file => run.session.sessionLog(file).entries);
			expect(persisted.filter(entry => JSON.stringify(entry).includes(NOTICE_MARKER))).toEqual([]);
			// With a UI the notice travels that channel and never stderr as well.
			expect(run.session.stderr().split("\n").filter(line => line.includes(NOTICE_MARKER))).toEqual([]);
		} finally {
			await disposeRun(run);
		}
	}, 300_000);

	test("a session without a UI gets one stderr line for the session, whichever extension binds", async () => {
		const run = await startRun("admission-unlisted-headless", { extraArgs: ["--no-ui"] });
		try {
			const turn = await run.session.prompt("admission unlisted headless turn");
			expect(turn.agentInvoked).toBe(true);
			expect(turn.status).toBe("completed");

			const exit = await run.session.stop();
			expect(exit.exitCode).toBe(0);

			// No UI frames at all in this mode, and the session's notice is one stderr line —
			// the framework's, for the one Owner the two extensions were delivered for.
			expect(warningNotices(run.session)).toEqual([]);
			const noticeLines = run.session.stderr().split("\n").filter(line => line.includes(NOTICE_MARKER));
			expect(noticeLines).toHaveLength(1);
			expect(noticeLines[0]).toContain(FRAMEWORK_NOTICE_SOURCE);
			expect(noticeLines[0]).not.toContain(CODEBASE_TOOLS.displayName);
			expect(noticeLines[0]).not.toContain(NOTICE_PEER_DISPLAY_NAME);
			expect(noticeLines[0]).toContain(runtime.version);
			expect(noticeLines[0]).toContain(SUPPORTED_BASELINE);
			// The stderr line is operator output, not history: nothing persisted carries it.
			const persisted = run.session.sessionFiles().flatMap(file => run.session.sessionLog(file).entries);
			expect(persisted.filter(entry => JSON.stringify(entry).includes(NOTICE_MARKER))).toEqual([]);
		} finally {
			await disposeRun(run);
		}
	}, 300_000);
});
