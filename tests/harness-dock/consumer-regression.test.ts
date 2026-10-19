/**
 * The shared path's consumers in one real assembly (P50; S1, S2).
 *
 * The migration rebuilt the framework's shared path — the one marker area, the owner-scoped State
 * store, the semantic round axis, the binding/initialization lifecycle — under three extensions
 * that already shipped against it. Each extension's own suite pins its own behavior; what no
 * single-consumer suite can show is whether *several* consumers sharing that path keep their own
 * behavior when they are bound together in one process, which is how this repository deploys them:
 * `entrypoints/omp` is the discovery root the OMP host loads, and the framework binds model-cost,
 * codebase-tools and connect-bot from it.
 *
 * So these runs load that deployed discovery root verbatim — a copy of the repository's own
 * `framework/`, `extensions/` and `entrypoints/omp` source, with only the run's own connect-bot
 * `config.yaml` in place of the shipped one — into the isolated patched host, and observe the
 * shared path from the consumers' side:
 *
 * - **the one marker area holds each consumer's own line**: the area is one process-wide native
 *   widget, it renders every bound extension's active line — the deployed pair appears in the order
 *   their extension ids give — and the third consumer's command (model-cost's `/budget`, which
 *   declares no marker) neither adds a line nor clears the one that is there;
 * - **one consumer's State is not another's**: turning codebase-tools' activation off leaves
 *   connect-bot's own line standing, and `off` on connect-bot leaves codebase-tools' line standing
 *   — the two extensions declare the same field name (`enabled`) for their own `state`, so a store
 *   keyed by anything but the extension would show here;
 * - **a refused activation of one consumer changes nothing of the others**: connect-bot's arm is
 *   refused by the panel (a scripted protocol answer, which is that extension's own outcome), the
 *   operator is told in that extension's own words, no line appears — and the session, and the
 *   consumer beside it, go on serving turns, with the same consumer arming once the panel answers as
 *   a register; every deployed consumer bound here (model-cost included) answers its own command;
 * - **the one round axis ends a cancelled exchange for its consumers**: an exchange the run holds
 *   open is aborted, connect-bot is told the round ended (its own state report leaves for the
 *   panel), and codebase-tools' activation survives the cancellation, so the next turn is served
 *   with both lines still on the area;
 * - **a terminal failure is the exchange's, not the consumers'**: with the session's own automatic
 *   retry turned off, a provider that refuses every attempt ends the exchange as `error`, the armed
 *   consumer is told that round ended too, and both activations and the next turn are unaffected.
 *
 * The panel here is a scripted local endpoint answering the register receipt connect-bot's own wire
 * contract states: this run is about the framework's shared path, not about omp-bot's panel, whose
 * real path the connect-bot suite drives against the real panel binary. The provider is the dock's
 * own capture endpoint, so every exchange is a real model request this run answers itself.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Server } from "bun";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { type IsolatedHarness, REPO_ROOT, ensureIsolatedHarness, readBaselineRecord } from "./baseline";
import { type CaptureServer, startCaptureServer } from "./capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV, DOCK_MODEL_SELECTOR } from "./fixtures/extension-root/provider";
import { type RunRoot, createRunRoot } from "./run-root";
import { ControlledSession, type RpcFrame } from "./session";

const record = readBaselineRecord();

let harness: IsolatedHarness;

beforeAll(async () => {
	harness = await ensureIsolatedHarness(record);
}, 300_000);

/**
 * The credential-free provider fixture, loaded beside the deployed discovery root: the session's
 * model resolves to the run's own capture endpoint, so no exchange needs a credential or leaves
 * the machine.
 */
const PROVIDER_FIXTURE = path.join(REPO_ROOT, "tests", "harness-dock", "fixtures", "extension-root", "provider.ts");

/** The framework's one marker area, as the host's UI channel reports it (its own widget key). */
const MARKER_AREA_KEY = "semantic-extensions";

/**
 * The two lines the area carries, as each extension's own definition declares them. The area orders
 * them by extension id, and "codebase-tools" sorts before "connect-bot".
 */
const CODEBASE_TOOLS_LINE = "◈ codeBaseTools";
const CONNECT_BOT_LINE = "◐ connectBot";

/** The two commands whose own State the area projects, and model-cost's own command beside them. */
const CODEBASE_TOOLS_COMMAND = "codebase-tools";
const CONNECT_BOT_COMMAND = "connect-bot";
const BUDGET_COMMAND = "budget";

/**
 * What connect-bot's own words say about an arm the panel refused, and about one it accepted: the
 * receipt names the sessions the panel reports online, which the run's own panel answers with one.
 */
const ARM_REFUSED_MESSAGE = "无法连接 omp-bot，未启用；请确认面板已启动";
const ARM_ACCEPTED_MESSAGE = "已接入 omp-bot 面板（当前 1 个在线会话）";

/**
 * How long the run's capture endpoint holds the exchange that gets cancelled: long enough that the
 * abort provably lands while the provider is still holding the answer, and short enough that the
 * abandoned response costs nothing once the run is over.
 */
const HELD_ANSWER_MS = 15_000;

/** How long an observation may take to arrive before this suite reports it as not observed. */
const OBSERVATION_TIMEOUT_MS = 30_000;

/**
 * The root of the deployment copies this suite materialises, removed once the suite is done.
 *
 * It lives under the repository's ignored cache directory because the framework's YAML parser is a
 * repository dependency that resolves from there; the run's own directories, session state and
 * server processes stay outside it.
 */
const DEPLOYMENT_ROOT = path.join(REPO_ROOT, ".cache", `consumer-regression-${process.pid}`);

/** The trees the deployed discovery root needs: the framework, the three consumers, the entrypoints. */
const DEPLOYED_TREES = [
	"adapters",
	"framework",
	path.join("extensions", "connect-bot"),
	path.join("extensions", "codebase-tools"),
	path.join("extensions", "model-cost"),
	path.join("entrypoints", "omp"),
];

/**
 * Materialise one run's own deployment: this repository's real shared source and the three
 * consumers, copied verbatim, with the run's own connect-bot `config.yaml` in place of the shipped
 * one.
 *
 * Copying is not editing: the modules the loader binds are the modules this repository ships, and
 * connect-bot derives the repository its configuration lives in from its own module location, so a
 * run-local `config.yaml` is the only way to name an endpoint of the run's own without touching the
 * file the machine's deployment reads.
 */
function materializeDeployment(label: string, endpoint: string): string {
	const root = path.join(DEPLOYMENT_ROOT, label);
	mkdirSync(root, { recursive: true });
	for (const source of DEPLOYED_TREES) cpSync(path.join(REPO_ROOT, source), path.join(root, source), { recursive: true });
	writeFileSync(
		path.join(root, "extensions", "connect-bot", "config.yaml"),
		`endpoint: "${endpoint}"\nrequestTimeoutMs: 1000\n`,
	);
	return root;
}

/** One push the run's panel endpoint received, as connect-bot's own wire envelope states it. */
interface PanelEvent {
	readonly sessionId: string;
	readonly kind: string;
	readonly value?: unknown;
	readonly reason?: unknown;
}

/**
 * The scripted panel endpoint: it records every push it receives and answers the register receipt
 * connect-bot's own wire contract states, until a case asks it to refuse instead.
 *
 * A refusal is an HTTP status the extension's own client reads as "the panel did not answer as a
 * register" (any non-2xx, or a 2xx whose body is not that receipt). What a case observes either way
 * is the extension's own outcome, never the transport.
 */
class PanelDouble {
	readonly #events: PanelEvent[] = [];
	#refusing = false;
	#server: Server<undefined> | undefined;

	static start(): PanelDouble {
		const double = new PanelDouble();
		double.#server = Bun.serve({
			port: 0,
			hostname: "127.0.0.1",
			fetch: async request => {
				const body = await request.text();
				try {
					const envelope = JSON.parse(body) as { sessionId?: unknown; kind?: unknown; data?: Record<string, unknown> };
					double.#events.push({
						sessionId: String(envelope.sessionId),
						kind: String(envelope.kind),
						value: envelope.data?.value,
						reason: envelope.data?.reason,
					});
				} catch {
					// A push this endpoint cannot read is still a request it received; nothing is recorded.
				}
				return double.#refusing
					? Response.json({ error: "the panel refuses this session" }, { status: 503 })
					: Response.json({ outcome: "registered", onlineCount: 1 });
			},
		});
		return double;
	}

	get endpoint(): string {
		const port = this.#server?.port;
		if (port === undefined) throw new Error("the panel double is not running");
		return `http://127.0.0.1:${port}`;
	}

	/** The pushes of one kind this endpoint received, in arrival order. */
	kinds(kind: string): readonly PanelEvent[] {
		return this.#events.filter(event => event.kind === kind);
	}

	/** The agent states the extension reported to it, in arrival order. */
	reportedStates(): readonly unknown[] {
		return this.kinds("state").map(event => event.value);
	}

	refuse(): void {
		this.#refusing = true;
	}

	accept(): void {
		this.#refusing = false;
	}

	stop(): void {
		void this.#server?.stop(true);
		this.#server = undefined;
	}
}

/** One controlled run: its directories, its capture endpoint, its panel endpoint and its deployment. */
interface DockRun {
	readonly runRoot: RunRoot;
	readonly capture: CaptureServer;
	readonly panel: PanelDouble;
	readonly deployment: string;
	/** The environment that keeps the extension's `~/` storage root inside the run. */
	readonly homeEnv: Record<string, string>;
	/**
	 * How this run's own provider answers the exchanges the run drives: holding an answer leaves a
	 * session provably waiting on its provider (see `CaptureStep.answerDelayMs`), and a refusal status
	 * makes every attempt of an exchange fail (see `CaptureStep.failureStatus`).
	 */
	readonly answers: { holding: boolean; refusalStatus: number | undefined };
}

function createRun(label: string): DockRun {
	const panel = PanelDouble.start();
	const runRoot = createRunRoot(label);
	// The extension's own storage root is the user's `.omp` home (`~/cost-archive`), so the run
	// states a home of its own instead of the machine's.
	const home = path.join(runRoot.path, "user-home");
	mkdirSync(home, { recursive: true });
	const answers = { holding: false, refusalStatus: undefined as number | undefined };
	return {
		runRoot,
		capture: startCaptureServer({
			dir: runRoot.captureDir,
			respond: () =>
				answers.holding
					? { answerDelayMs: HELD_ANSWER_MS }
					: answers.refusalStatus === undefined
						? undefined
						: { failureStatus: answers.refusalStatus },
		}),
		panel,
		deployment: materializeDeployment(label, panel.endpoint),
		homeEnv: {
			USERPROFILE: home,
			HOME: home,
			HOMEDRIVE: path.parse(home).root,
			HOMEPATH: home.slice(path.parse(home).root.length - 1),
		},
		answers,
	};
}

/** Start one session: the deployed discovery root's own extensions plus the provider fixture. */
function openSession(run: DockRun): Promise<ControlledSession> {
	return ControlledSession.start({
		harness,
		runRoot: run.runRoot,
		extensions: [PROVIDER_FIXTURE, path.join(run.deployment, "entrypoints", "omp")],
		model: DOCK_MODEL_SELECTOR,
		env: { [DOCK_CAPTURE_BASE_URL_ENV]: run.capture.baseUrl, ...run.homeEnv },
	});
}

/** Drop a run's endpoints and directories; safe to call after an explicit stop. */
function disposeRun(run: DockRun): void {
	run.capture.stop();
	run.panel.stop();
	run.runRoot.dispose();
}

/** Stop one session if it is still live; safe to call after an explicit stop. */
async function stopSession(session: ControlledSession | undefined): Promise<void> {
	if (session === undefined) return;
	try {
		await session.stop({ timeoutMs: 10_000 });
	} catch {
		// The session already stopped, or never started; the run's own disposal still runs.
	}
}

/** The frames the framework's marker area published for one session, in order. */
function areaFrames(session: ControlledSession): RpcFrame[] {
	return session
		.frames()
		.filter(
			frame =>
				frame.type === "extension_ui_request" &&
				frame.method === "setWidget" &&
				frame.widgetKey === MARKER_AREA_KEY,
		);
}

/**
 * The lines the area's last render carried, or `undefined` when that render cleared the widget: an
 * empty list is the framework's own instruction to clear, and the host reports it as no lines.
 */
function lastAreaLines(session: ControlledSession): readonly string[] | undefined {
	const frames = areaFrames(session);
	const lines = frames[frames.length - 1]?.widgetLines;
	return Array.isArray(lines) ? (lines as string[]) : undefined;
}

/** Every notice the session's operator channel carried, in order. */
function notices(session: ControlledSession): ReadonlyArray<{ readonly level: unknown; readonly message: string }> {
	return session
		.frames()
		.filter(frame => frame.type === "extension_ui_request" && frame.method === "notify")
		.map(frame => ({ level: frame.notifyType, message: String(frame.message) }));
}

/** The last state report the run's panel endpoint received, or nothing while it received none. */
function lastStateReport(panel: PanelDouble): PanelEvent | undefined {
	const reports = panel.kinds("state");
	return reports[reports.length - 1];
}

/**
 * Wait until one observation holds, then answer whether it did.
 *
 * The observations below are facts about another process — a widget render, an operator notice, a
 * push this run's own endpoint received — so there is nothing to await directly: this yields to the
 * event loop and re-reads until the deadline, the way the other dock suites observe an asynchronous
 * arrival.
 */
async function waitFor(condition: () => boolean): Promise<boolean> {
	const deadline = Date.now() + OBSERVATION_TIMEOUT_MS;
	for (;;) {
		if (condition()) return true;
		if (Date.now() >= deadline) return false;
		const { promise, resolve } = Promise.withResolvers<void>();
		setImmediate(resolve);
		await promise;
	}
}

/** Wait until the area's last render is exactly these lines (`undefined` = the cleared widget). */
function areaReaches(session: ControlledSession, expected: readonly string[] | undefined): Promise<boolean> {
	return waitFor(() => {
		const lines = lastAreaLines(session);
		if (expected === undefined) return lines === undefined;
		return lines !== undefined && lines.length === expected.length && lines.every((line, i) => line === expected[i]);
	});
}

/** Wait until the session's operator channel carried exactly this message. */
function noticeReaches(session: ControlledSession, message: string): Promise<boolean> {
	return waitFor(() => notices(session).some(notice => notice.message === message));
}

describe("three deployed consumers bound in one real session (P50)", () => {
	test("each consumer's own line and own State, and a refused activation that changes nothing of the others", async () => {
		const run = createRun("consumer-regression-area");
		let session: ControlledSession | undefined;
		try {
			session = await openSession(run);

			// All three deployed entrypoints bound and served a real turn: the session's own request
			// really left the host, and the area opened cleared for the session it started on.
			const first = await session.prompt("a turn served with every consumer bound");
			expect(first.status).toBe("completed");
			expect(run.capture.requests().length).toBeGreaterThan(0);
			expect(await areaReaches(session, undefined)).toBe(true);

			// The framework's own area, from one consumer's own toggle: that consumer's line, alone.
			const enabled = await session.prompt(`/${CODEBASE_TOOLS_COMMAND}`);
			expect(enabled.agentInvoked).toBe(false);
			expect(enabled.status).toBe("completed");
			expect(await areaReaches(session, [CODEBASE_TOOLS_LINE])).toBe(true);

			// A third consumer's command declares no marker: running it neither adds a line nor clears
			// the one that is there, and it answers from its own declared action table.
			const budget = await session.prompt(`/${BUDGET_COMMAND}`);
			expect(budget.agentInvoked).toBe(false);
			expect(budget.status).toBe("completed");
			const carried = notices(session);
			const help = carried[carried.length - 1]?.message ?? "";
			expect(help).toContain("detail");
			expect(help).toContain("clear");
			expect(lastAreaLines(session)).toEqual([CODEBASE_TOOLS_LINE]);

			// The panel refuses the other consumer's arm: the operator is told in that extension's own
			// words, nothing is armed — and the session, and the consumer beside it, go on.
			run.panel.refuse();
			const refused = await session.prompt(`/${CONNECT_BOT_COMMAND}`);
			expect(refused.status).toBe("completed");
			expect(await noticeReaches(session, ARM_REFUSED_MESSAGE)).toBe(true);
			expect(await waitFor(() => run.panel.kinds("register").length === 1)).toBe(true);
			expect(lastAreaLines(session)).toEqual([CODEBASE_TOOLS_LINE]);

			const stillServing = await session.prompt("a turn served after that refusal");
			expect(stillServing.status).toBe("completed");
			expect(lastAreaLines(session)).toEqual([CODEBASE_TOOLS_LINE]);

			// The panel answers as a register: the second consumer's line joins the first one's, in
			// extension-id order, beside the line the first consumer still holds.
			run.panel.accept();
			const armed = await session.prompt(`/${CONNECT_BOT_COMMAND}`);
			expect(armed.status).toBe("completed");
			expect(await noticeReaches(session, ARM_ACCEPTED_MESSAGE)).toBe(true);
			expect(await waitFor(() => run.panel.kinds("register").length === 2)).toBe(true);
			expect(await areaReaches(session, [CODEBASE_TOOLS_LINE, CONNECT_BOT_LINE])).toBe(true);

			// The other direction of the same isolation: the second consumer's own `off` removes its
			// own line and leaves the first consumer's activation, and its line, untouched.
			const disarmed = await session.prompt(`/${CONNECT_BOT_COMMAND} off`);
			expect(disarmed.status).toBe("completed");
			expect(await areaReaches(session, [CODEBASE_TOOLS_LINE])).toBe(true);
			expect(await waitFor(() => run.panel.kinds("unregister").length === 1)).toBe(true);

			const disabled = await session.prompt(`/${CODEBASE_TOOLS_COMMAND}`);
			expect(disabled.status).toBe("completed");
			expect(await areaReaches(session, undefined)).toBe(true);

			const exit = await session.stop();
			expect(exit.exitCode).toBe(0);
			expect(exit.timedOut).toBe(false);
		} finally {
			await stopSession(session);
			disposeRun(run);
		}
	}, 300_000);

	test("the shared round axis ends a cancelled exchange for its consumers, and one consumer's State survives it", async () => {
		const run = createRun("consumer-regression-cancel");
		let session: ControlledSession | undefined;
		try {
			session = await openSession(run);

			// Both activations the cancelled exchange must leave alone: codebase-tools' own State, and
			// connect-bot's armed connection.
			const enabled = await session.prompt(`/${CODEBASE_TOOLS_COMMAND}`);
			expect(enabled.status).toBe("completed");
			const armed = await session.prompt(`/${CONNECT_BOT_COMMAND}`);
			expect(armed.status).toBe("completed");
			expect(await areaReaches(session, [CODEBASE_TOOLS_LINE, CONNECT_BOT_LINE])).toBe(true);

			// An ordinary exchange first: the armed consumer reports its own progress over the shared
			// round axis, which is the trace the cancelled one below is compared against.
			const served = await session.prompt("an exchange that settles normally");
			expect(served.status).toBe("completed");
			expect(await waitFor(() => lastStateReport(run.panel)?.value === "awaiting-input")).toBe(true);
			const workingBefore = run.panel.reportedStates().filter(state => state === "working").length;
			expect(workingBefore).toBeGreaterThan(0);

			// An exchange this run holds open: the request has arrived and is unanswered, so the abort
			// below cancels a running activity rather than one that already settled.
			run.answers.holding = true;
			const heldRequests = run.capture.requests().length;
			const inFlight = session.prompt("an exchange cancelled while it runs");
			expect(await waitFor(() => run.capture.requests().length > heldRequests)).toBe(true);
			expect(await waitFor(() => lastStateReport(run.panel)?.value === "working")).toBe(true);

			const aborted = await session.request({ type: "abort" });
			expect(aborted.success).toBe(true);
			const cancelled = await inFlight;
			expect(cancelled.status).toBe("aborted");
			run.answers.holding = false;

			// Each consumer's own term on its own facts: the armed one is told the round ended — its own
			// `awaiting-input` report leaves for the panel on the framework's `round_end` — and the
			// toggled one still holds its own activation, and its line.
			expect(await waitFor(() => lastStateReport(run.panel)?.value === "awaiting-input")).toBe(true);
			expect(lastStateReport(run.panel)?.reason).toBe("round_end");
			expect(lastAreaLines(session)).toEqual([CODEBASE_TOOLS_LINE, CONNECT_BOT_LINE]);

			// The session does not stay held by the cancelled exchange: the next turn is served, and
			// each consumer's own effects continue — the armed one moves again, the toggled one keeps
			// the activation that survived the cancellation.
			const after = await session.prompt("a turn served after the cancellation");
			expect(after.status).toBe("completed");
			expect(await areaReaches(session, [CODEBASE_TOOLS_LINE, CONNECT_BOT_LINE])).toBe(true);
			expect(await waitFor(() => lastStateReport(run.panel)?.value === "awaiting-input")).toBe(true);
			expect(run.panel.reportedStates().filter(state => state === "working").length).toBeGreaterThan(
				workingBefore,
			);

			const exit = await session.stop();
			expect(exit.exitCode).toBe(0);
			expect(exit.timedOut).toBe(false);
		} finally {
			await stopSession(session);
			disposeRun(run);
		}
	}, 300_000);

	test("an exchange whose provider refuses every attempt ends as a failure, and both consumers' own terms hold", async () => {
		const run = createRun("consumer-regression-refusal");
		let session: ControlledSession | undefined;
		try {
			session = await openSession(run);

			// The same two activations, and the trace the refused exchange is measured against.
			const enabled = await session.prompt(`/${CODEBASE_TOOLS_COMMAND}`);
			expect(enabled.status).toBe("completed");
			const armed = await session.prompt(`/${CONNECT_BOT_COMMAND}`);
			expect(armed.status).toBe("completed");
			expect(await areaReaches(session, [CODEBASE_TOOLS_LINE, CONNECT_BOT_LINE])).toBe(true);
			expect(await waitFor(() => run.panel.kinds("state").length > 0)).toBe(true);
			const statesBefore = run.panel.kinds("state").length;

			// The provider refuses every attempt the harness makes inside this exchange. The run turns the
			// host's own automatic retry off first — the RPC-level setting of this session, stated here
			// rather than waited out — so the refusal is this exchange's terminal answer instead of the
			// first of ten attempts.
			const retryOff = await session.request({ type: "set_auto_retry", enabled: false });
			expect(retryOff.success).toBe(true);
			run.answers.refusalStatus = 503;
			const failed = await session.prompt("an exchange every attempt of which is refused");
			expect(failed.agentInvoked).toBe(true);
			expect(failed.status).toBe("error");
			run.answers.refusalStatus = undefined;

			// The armed consumer's own term, on the framework's own edge: a *new* state report arrives
			// after the failure, and it is the round's end.
			expect(
				await waitFor(
					() => run.panel.kinds("state").length > statesBefore && lastStateReport(run.panel)?.value === "awaiting-input",
				),
			).toBe(true);
			expect(lastStateReport(run.panel)?.reason).toBe("round_end");

			// The toggled consumer's own activation, and both lines, survived the failure, and the
			// failure is the exchange's rather than the session's: the next turn is served.
			expect(lastAreaLines(session)).toEqual([CODEBASE_TOOLS_LINE, CONNECT_BOT_LINE]);
			const after = await session.prompt("a turn served after the failure");
			expect(after.status).toBe("completed");
			expect(await areaReaches(session, [CODEBASE_TOOLS_LINE, CONNECT_BOT_LINE])).toBe(true);

			const exit = await session.stop();
			expect(exit.exitCode).toBe(0);
			expect(exit.timedOut).toBe(false);
		} finally {
			await stopSession(session);
			disposeRun(run);
		}
	}, 300_000);
});

afterAll(() => {
	rmSync(DEPLOYMENT_ROOT, { recursive: true, force: true });
});
