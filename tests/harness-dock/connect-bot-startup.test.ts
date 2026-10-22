/**
 * connect-bot's startup modes on the real OMP harness (S2; P2, P3, P4, P15, P16, P17, P18,
 * P19, P22, P24, P26, P33).
 *
 * The runs load this repository's real entrypoint files through the host's ordinary `-e`
 * parameter — the manual `entrypoints/omp/connect-bot.ts` and the automatic
 * `entrypoints/omp-auto/connect-bot.ts` — against an isolated agent state, a temporary working
 * directory and the dock's own capture endpoint. The panel is either a scripted local endpoint
 * that can hold a register answer (the non-blocking and State-latch cases) or the actual
 * isolated herdr-bot panel (interoperability, read from its own session table).
 *
 * The capture endpoint is the independent model request observer: it records the request the
 * harness really sent, so "the first model request left while the register was unanswered" is an
 * observed arrival rather than an inference from the extension's own queue.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Server } from "bun";
import { appendFileSync, cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { type IsolatedHarness, REPO_ROOT, ensureIsolatedHarness, readBaselineRecord } from "./baseline";
import { type CaptureServer, startCaptureServer } from "./capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV, DOCK_MODEL_SELECTOR } from "./fixtures/extension-root/provider";
import { type RunRoot, createRunRoot } from "./run-root";
import { ControlledSession, type RpcFrame } from "./session";
import { customEntries, readSessionLog } from "./session-log";
import { isUpsertData, type HerdrBotPanel, startHerdrBot } from "../connect-bot/support/herdr-bot";

const record = readBaselineRecord();

let harness: IsolatedHarness;

beforeAll(async () => {
	harness = await ensureIsolatedHarness(record);
}, 300_000);

/** The provider fixture, loaded beside the entrypoint: no credentials, no network. */
const PROVIDER_FIXTURE = path.join(REPO_ROOT, "tests", "harness-dock", "fixtures", "extension-root", "provider.ts");

/** The framework's one marker area, as the host's UI reports it. */
const MARKER_AREA_KEY = "semantic-extensions";
/** The line connect-bot's declaration renders while its value holds. */
const MARKER_TEXT = "◐ connectBot";
/** What the operator hears when the panel accepted the startup register. */
const CONNECTED = "已接入 herdr-bot 面板（当前 1 个在线会话）";
/** What the operator hears when the panel did not answer as a register. */
const ARM_FAILED = "无法连接 herdr-bot，未启用；请确认面板已启动";
/** The entry type connect-bot's own State would persist if it were session-entry (it is memory). */
const STATE_ENTRY_TYPE = "connect-bot:state";

/** The trees one run's deployment needs: the shared source and both mode entrypoints. */
const DEPLOYED_TREES = [
	"adapters",
	"framework",
	path.join("extensions", "connect-bot"),
	path.join("entrypoints", "startup"),
	path.join("entrypoints", "omp"),
	path.join("entrypoints", "omp-auto"),
];

/** The root of this suite's deployment copies, removed once the suite is done. */
const DEPLOYMENT_ROOT = path.join(REPO_ROOT, ".cache", `connect-bot-startup-${process.pid}`);

/** One run's panel record, as the panel received it. */
interface PanelEvent {
	readonly sessionId: string;
	readonly kind: string;
	readonly data?: unknown;
}

/** A scripted local panel that can hold a register answer, refuse it, or answer it. */
class PanelDouble {
	readonly #events: PanelEvent[] = [];
	#server: Server<undefined> | undefined;
	#holding = false;
	#refusing = false;
	#release: (() => void) | undefined;

	static start(): PanelDouble {
		const double = new PanelDouble();
		double.#server = Bun.serve({
			port: 0,
			hostname: "127.0.0.1",
			fetch: async request => {
				const body = await request.text();
				let kind = "";
				try {
					const envelope = JSON.parse(body) as { sessionId?: unknown; kind?: unknown; data?: unknown };
					kind = String(envelope.kind);
					double.#events.push({ sessionId: String(envelope.sessionId), kind, data: envelope.data });
				} catch {
					// A push this endpoint cannot read is still a request it received.
				}
				if (kind === "register") {
					if (double.#holding) {
						await new Promise<void>(resolve => {
							double.#release = resolve;
						});
					}
					// The answer is decided after the hold: a case may refuse the attempt while it is
					// still unanswered, which is exactly what enables a controlled refusal.
					if (double.#refusing) return Response.json({ error: "refused" }, { status: 503 });
					return Response.json({ outcome: "registered", onlineCount: 1 });
				}
				return Response.json({ outcome: "accepted" });
			},
		});
		return double;
	}

	get endpoint(): string {
		const port = this.#server?.port;
		if (port === undefined) throw new Error("the panel double is not running");
		return `http://127.0.0.1:${port}`;
	}

	hold(): void {
		this.#holding = true;
	}

	release(): void {
		const release = this.#release;
		this.#release = undefined;
		this.#holding = false;
		release?.();
	}

	refuse(): void {
		this.#refusing = true;
		this.release();
	}

	accept(): void {
		this.#refusing = false;
	}

	kinds(kind: string): readonly PanelEvent[] {
		return this.#events.filter(event => event.kind === kind);
	}

	stop(): void {
		this.release();
		void this.#server?.stop(true);
		this.#server = undefined;
	}
}

/** Materialises one run's deployment and points connect-bot at `endpoint`. */
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

/** One controlled run's directories, capture endpoint and deployment. */
interface DockRun {
	readonly runRoot: RunRoot;
	readonly capture: CaptureServer;
	readonly deployment: string;
}

/** Creates the isolated run and its own model capture endpoint. */
function createRun(label: string, endpoint: string): DockRun {
	const runRoot = createRunRoot(label);
	return {
		runRoot,
		capture: startCaptureServer({ dir: runRoot.captureDir }),
		deployment: materializeDeployment(label, endpoint),
	};
}

/** Starts one session with exactly one connect-bot mode entrypoint and the provider fixture. */
function openSession(
	run: DockRun,
	mode: "manual" | "auto",
	extraArgs: readonly string[] = [],
): Promise<ControlledSession> {
	const entrypoint = path.join(run.deployment, "entrypoints", mode === "auto" ? "omp-auto" : "omp", "connect-bot.ts");
	return ControlledSession.start({
		harness,
		runRoot: run.runRoot,
		extensions: [PROVIDER_FIXTURE, entrypoint],
		model: DOCK_MODEL_SELECTOR,
		env: { [DOCK_CAPTURE_BASE_URL_ENV]: run.capture.baseUrl },
		extraArgs,
	});
}

/** The session file the harness reports for the session it currently runs. */
async function sessionFileOf(session: ControlledSession): Promise<string> {
	const frame = await session.request({ type: "get_state" });
	const file = (frame.data as { sessionFile?: string } | undefined)?.sessionFile;
	if (file === undefined) throw new Error(`the harness reported no session file: ${JSON.stringify(frame)}`);
	return file;
}

/** The State payloads one session file records for connect-bot, in journal order. */
function connectBotStatePayloads(file: string): unknown[] {
	return customEntries(readSessionLog(path.dirname(file), file).entries, STATE_ENTRY_TYPE).map(entry => entry.data);
}

/** The session identity the file's own header declares. */
function sessionIdOf(file: string): string {
	// The file may open with the host's fixed-width title slot, so the header is the `session`
	// entry, not simply the first parsed line.
	const header = readSessionLog(path.dirname(file), file).entries.find(
		entry => entry.type === "session" && typeof entry.id === "string",
	)?.id;
	if (typeof header !== "string") throw new Error(`the session file ${file} carries no session header id`);
	return header;
}

/**
 * Appends the State entry an earlier process could have left for connect-bot.
 *
 * connect-bot declares memory persistence, so this process never writes such an entry: the record
 * exists only to prove a restored payload is not a connection. It is linked to the file's current
 * leaf, exactly as the host's own append would link it.
 */
function plantConnectBotStatePayload(file: string, payload: unknown): void {
	const entries = readSessionLog(path.dirname(file), file).entries;
	const leaf = [...entries].reverse().find(entry => typeof entry.id === "string");
	if (leaf === undefined) throw new Error(`the session file ${file} carries no entry to append after`);
	appendFileSync(
		file,
		`${JSON.stringify({
			type: "custom",
			customType: STATE_ENTRY_TYPE,
			data: payload,
			id: `planted-connect-bot-state-${Date.now()}`,
			parentId: leaf.id,
			timestamp: new Date().toISOString(),
		})}\n`,
	);
}

/** Drops a run's endpoint and directories; safe after an explicit stop. */
function disposeRun(run: DockRun): void {
	run.capture.stop();
	run.runRoot.dispose();
}

/** Stops one session if it is still live. */
async function stopSession(session: ControlledSession | undefined): Promise<void> {
	if (session === undefined) return;
	try {
		await session!.stop({ timeoutMs: 10_000 });
	} catch {
		// The session already stopped; the run's own disposal still runs.
	}
}

/** The marker-area frames one session published, in order. */
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

/** The lines the last area render carried, or `undefined` when it cleared the widget. */
function lastAreaLines(session: ControlledSession): readonly string[] | undefined {
	const frames = areaFrames(session);
	const lines = frames[frames.length - 1]?.widgetLines;
	return Array.isArray(lines) ? (lines as string[]) : undefined;
}

/** Every notice the session's operator channel carried, in order. */
function notices(session: ControlledSession): ReadonlyArray<string> {
	return session
		.frames()
		.filter(frame => frame.type === "extension_ui_request" && frame.method === "notify")
		.map(frame => String(frame.message));
}

/** Yields until a condition holds, then reports whether it did within the deadline. */
async function waitFor(condition: () => boolean, timeoutMs = 30_000): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		if (condition()) return true;
		if (Date.now() >= deadline) return false;
		const { promise, resolve } = Promise.withResolvers<void>();
		setImmediate(resolve);
		await promise;
	}
}

/** The same wait for a condition that has to read another process asynchronously. */
async function waitUntil(condition: () => Promise<boolean>, timeoutMs = 30_000): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		if (await condition()) return true;
		if (Date.now() >= deadline) return false;
		const { promise, resolve } = Promise.withResolvers<void>();
		setImmediate(resolve);
		await promise;
	}
}

describe("the automatic entrypoint activates on the real host without a command (P3, P16, P17, P33)", () => {
	test("a held register does not stop the first model request, and the marker waits for the receipt", async () => {
		const panel = PanelDouble.start();
		panel.hold();
		const run = createRun("connect-bot-auto", panel.endpoint);
		let session: ControlledSession | undefined;
		try {
			session = await openSession(run, "auto");
			expect(await waitFor(() => panel.kinds("register").length === 1)).toBe(true);
			// The register is deliberately unanswered: the area still shows no line.
			expect(lastAreaLines(session!)).toBeUndefined();

			const first = await session!.prompt("a turn while the panel has not answered");
			expect(first.status).toBe("completed");
			// The independent capture endpoint really received the request: the pending register was
			// not a barrier the harness had to wait for.
			expect(run.capture.requests().length).toBeGreaterThan(0);
			expect(lastAreaLines(session!)).toBeUndefined();
			expect(panel.kinds("register")).toHaveLength(1);

			panel.release();
			expect(await waitFor(() => notices(session!).includes(CONNECTED))).toBe(true);
			expect(await waitFor(() => lastAreaLines(session!)?.[0] === MARKER_TEXT)).toBe(true);
			expect(panel.kinds("state")).toHaveLength(1);

			// A later request in the same process is served without another automatic register.
			const second = await session!.prompt("a following turn");
			expect(second.status).toBe("completed");
			expect(panel.kinds("register")).toHaveLength(1);

			const exit = await session!.stop();
			expect(exit.exitCode).toBe(0);
		} finally {
			await stopSession(session);
			panel.stop();
			disposeRun(run);
		}
	}, 300_000);

	test("a refused startup receipt leaves the line off and the host still serves turns (P19)", async () => {
		const panel = PanelDouble.start();
		panel.hold();
		const run = createRun("connect-bot-auto-refused", panel.endpoint);
		let session: ControlledSession | undefined;
		try {
			session = await openSession(run, "auto");
			expect(await waitFor(() => panel.kinds("register").length === 1)).toBe(true);
			panel.refuse();

			expect(await waitFor(() => notices(session!).some(message => message.includes("无法连接 herdr-bot")))).toBe(true);
			expect(lastAreaLines(session!)).toBeUndefined();
			const after = await session!.prompt("a turn after the refusal");
			expect(after.status).toBe("completed");
			expect(run.capture.requests().length).toBeGreaterThan(0);

			const exit = await session!.stop();
			expect(exit.exitCode).toBe(0);
		} finally {
			await stopSession(session);
			panel.stop();
			disposeRun(run);
		}
	}, 300_000);
});

describe("the manual entrypoint keeps its loadable, command-driven behavior (P2, P15, P4, P33)", () => {
	test("two turns start no register; the command then arms and disarms the session", async () => {
		const panel = PanelDouble.start();
		const run = createRun("connect-bot-manual", panel.endpoint);
		let session: ControlledSession | undefined;
		try {
			session = await openSession(run, "manual");
			const first = await session!.prompt("a manual-mode turn");
			expect(first.status).toBe("completed");
			const second = await session!.prompt("another manual-mode turn");
			expect(second.status).toBe("completed");
			expect(run.capture.requests().length).toBeGreaterThan(0);
			expect(panel.kinds("register")).toEqual([]);
			expect(lastAreaLines(session!)).toBeUndefined();

			const armed = await session!.prompt("/connect-bot");
			expect(armed.agentInvoked).toBe(false);
			expect(armed.status).toBe("completed");
			expect(await waitFor(() => panel.kinds("register").length === 1)).toBe(true);
			expect(await waitFor(() => notices(session!).includes(CONNECTED))).toBe(true);
			expect(await waitFor(() => lastAreaLines(session!)?.[0] === MARKER_TEXT)).toBe(true);

			const disarmed = await session!.prompt("/connect-bot off");
			expect(disarmed.status).toBe("completed");
			expect(await waitFor(() => panel.kinds("unregister").length === 1)).toBe(true);
			expect(await waitFor(() => lastAreaLines(session!) === undefined)).toBe(true);

			const exit = await session!.stop();
			expect(exit.exitCode).toBe(0);
		} finally {
			await stopSession(session);
			panel.stop();
			disposeRun(run);
		}
	}, 300_000);
});

describe("the automatic path registers with the actual isolated panel (P16, P18)", () => {
	let panel: HerdrBotPanel | undefined;

	afterAll(async () => {
		await panel?.stop();
	});

	test("the panel's own table shows the startup row, its state report, and the command's removal", async () => {
		panel = await startHerdrBot();
		const run = createRun("connect-bot-real-panel", panel.endpoint);
		let session: ControlledSession | undefined;
		try {
			session = await openSession(run, "auto");
			expect(await waitFor(() => lastAreaLines(session!)?.[0] === MARKER_TEXT)).toBe(true);
			expect(
				await waitUntil(async () =>
					(await panel!.snapshot()).some(view => view.cwd === run.runRoot.workDir && view.online),
				),
			).toBe(true);

			const turn = await session!.prompt("a turn on the real panel");
			expect(turn.status).toBe("completed");
			// The round's end is reported by the extension to the panel's own table.
			expect(
				await waitUntil(async () =>
					(await panel!.snapshot()).some(view => view.cwd === run.runRoot.workDir && view.state === "awaiting-input"),
				),
			).toBe(true);

			const disarmed = await session!.prompt("/connect-bot off");
			expect(disarmed.status).toBe("completed");
			expect(await waitUntil(async () => (await panel!.snapshot()).every(view => view.cwd !== run.runRoot.workDir))).toBe(true);
			expect(await waitFor(() => lastAreaLines(session!) === undefined)).toBe(true);

			const armed = await session!.prompt("/connect-bot");
			expect(armed.status).toBe("completed");
			expect(
				await waitUntil(async () =>
					(await panel!.snapshot()).some(view => view.cwd === run.runRoot.workDir && view.online),
				),
			).toBe(true);
			expect(await waitFor(() => lastAreaLines(session!)?.[0] === MARKER_TEXT)).toBe(true);

			const exit = await session!.stop();
			expect(exit.exitCode).toBe(0);
		} finally {
			await stopSession(session);
			disposeRun(run);
		}
	}, 300_000);
});

describe("a refused automatic registration keeps the real session working and off (P19)", () => {
	test("the failure is reported, nothing is armed or retried, turns still run, and the command connects later", async () => {
		const panel = PanelDouble.start();
		panel.hold();
		const run = createRun("connect-bot-auto-refused-recovery", panel.endpoint);
		let session: ControlledSession | undefined;
		try {
			session = await openSession(run, "auto");
			expect(await waitFor(() => panel.kinds("register").length === 1)).toBe(true);
			// The attempt is deliberately unanswered at first: the area carries no line.
			expect(lastAreaLines(session!)).toBeUndefined();

			panel.refuse();
			expect(await waitFor(() => notices(session!).includes(ARM_FAILED))).toBe(true);
			// A refusal is a failed arm: no state report, no heartbeat, no marker line.
			expect(panel.kinds("state")).toEqual([]);
			expect(panel.kinds("heartbeat")).toEqual([]);
			expect(lastAreaLines(session!)).toBeUndefined();

			// The host still serves the agent's work, and the failure is not retried on its own: the
			// register count is checked again after the later command operations, so an unrequested
			// attempt arriving meanwhile would be visible.
			const turn = await session!.prompt("a turn after the startup refusal");
			expect(turn.status).toBe("completed");
			expect(run.capture.requests().length).toBeGreaterThan(0);
			expect(panel.kinds("register")).toHaveLength(1);

			// The original command is the operator's retry, and its effects are the unchanged ones.
			panel.accept();
			const connected = await session!.prompt("/connect-bot");
			expect(connected.agentInvoked).toBe(false);
			expect(await waitFor(() => notices(session!).includes(CONNECTED))).toBe(true);
			expect(await waitFor(() => lastAreaLines(session!)?.[0] === MARKER_TEXT)).toBe(true);
			expect(panel.kinds("register")).toHaveLength(2);
			expect(await waitFor(() => panel.kinds("state").length === 1)).toBe(true);

			const disarmed = await session!.prompt("/connect-bot off");
			expect(disarmed.status).toBe("completed");
			expect(await waitFor(() => panel.kinds("unregister").length === 1)).toBe(true);
			expect(await waitFor(() => lastAreaLines(session!) === undefined)).toBe(true);

			const exit = await session!.stop();
			expect(exit.exitCode).toBe(0);
		} finally {
			await stopSession(session);
			panel.stop();
			disposeRun(run);
		}
	}, 300_000);
});

describe("a restored session's old enabled payload is not a connection (P22, P24)", () => {
	test("manual then automatic resume ignore a planted payload; only a new receipt enables, and no record is written", async () => {
		const panel = PanelDouble.start();
		const run = createRun("connect-bot-old-payload", panel.endpoint);
		let first: ControlledSession | undefined;
		let manual: ControlledSession | undefined;
		let automatic: ControlledSession | undefined;
		try {
			// The session the runs restore. The manual mode neither registers nor records a value.
			first = await openSession(run, "manual");
			expect((await first.prompt("a turn before the planted record")).status).toBe("completed");
			const file = await sessionFileOf(first);
			expect((await first.stop()).exitCode).toBe(0);
			expect(connectBotStatePayloads(file)).toEqual([]);
			expect(run.capture.requests().length).toBeGreaterThan(0);

			// The record a previous process (or an older implementation) could have left behind.
			plantConnectBotStatePayload(file, { enabled: true });
			expect(connectBotStatePayloads(file)).toEqual([{ enabled: true }]);

			// A manual-mode process resuming that session must not restore "connected" from the branch.
			manual = await openSession(run, "manual", ["--resume", file]);
			expect((await manual.prompt("a manual turn over the old payload")).status).toBe("completed");
			expect(panel.kinds("register")).toEqual([]);
			expect(lastAreaLines(manual)).toBeUndefined();
			expect((await manual.stop()).exitCode).toBe(0);
			expect(connectBotStatePayloads(file)).toEqual([{ enabled: true }]);

			// An automatic process resuming it at startup does take its mode's choice — a register is
			// attempted without a command — but the old payload neither enables the session nor
			// supplies the receipt that would.
			panel.hold();
			automatic = await openSession(run, "auto", ["--resume", file]);
			expect(await waitFor(() => panel.kinds("register").length === 1)).toBe(true);
			expect(panel.kinds("register")[0]?.sessionId).toBe(sessionIdOf(file));
			expect(lastAreaLines(automatic)).toBeUndefined();

			panel.refuse();
			expect(await waitFor(() => notices(automatic!).includes(ARM_FAILED))).toBe(true);
			expect(lastAreaLines(automatic)).toBeUndefined();
			expect(panel.kinds("state")).toEqual([]);
			const turn = await automatic.prompt("a turn after the refused resumed register");
			expect(turn.status).toBe("completed");
			// No startup path wrote a second record: memory persistence is still memory.
			expect(connectBotStatePayloads(file)).toEqual([{ enabled: true }]);

			// Only a new valid receipt from this process's own attempt turns the line on.
			panel.accept();
			expect((await automatic.prompt("/connect-bot")).status).toBe("completed");
			expect(await waitFor(() => lastAreaLines(automatic!)?.[0] === MARKER_TEXT)).toBe(true);
			expect(panel.kinds("register")).toHaveLength(2);
			expect(await waitFor(() => panel.kinds("state").length === 1)).toBe(true);
			expect(connectBotStatePayloads(file)).toEqual([{ enabled: true }]);

			expect((await automatic.stop()).exitCode).toBe(0);
		} finally {
			await stopSession(automatic);
			await stopSession(manual);
			await stopSession(first);
			panel.stop();
			disposeRun(run);
		}
	}, 300_000);
});

describe("a session with no recorded value resumed at startup takes its mode's choice (P24)", () => {
	test("an automatic process resuming a manual session registers without a command and enables on its receipt", async () => {
		const panel = PanelDouble.start();
		const run = createRun("connect-bot-recovery-default", panel.endpoint);
		let first: ControlledSession | undefined;
		let resumed: ControlledSession | undefined;
		try {
			first = await openSession(run, "manual");
			expect((await first.prompt("a turn that records no value")).status).toBe("completed");
			const file = await sessionFileOf(first);
			expect((await first.stop()).exitCode).toBe(0);
			expect(connectBotStatePayloads(file)).toEqual([]);
			expect(panel.kinds("register")).toEqual([]);

			// This new process's first owner start is the restored session: the automatic mode's
			// choice applies even though the session was resumed, which is not a runtime navigation.
			resumed = await openSession(run, "auto", ["--resume", file]);
			expect(await waitFor(() => panel.kinds("register").length === 1)).toBe(true);
			expect(panel.kinds("register")[0]?.sessionId).toBe(sessionIdOf(file));
			expect(await waitFor(() => notices(resumed!).includes(CONNECTED))).toBe(true);
			expect(await waitFor(() => lastAreaLines(resumed!)?.[0] === MARKER_TEXT)).toBe(true);
			expect(await waitFor(() => panel.kinds("state").length === 1)).toBe(true);

			const turn = await resumed.prompt("a turn on the resumed automatic session");
			expect(turn.status).toBe("completed");
			// The startup enable was a receipt-backed connection, not a persisted preference.
			expect(connectBotStatePayloads(file)).toEqual([]);
			expect((await resumed.stop()).exitCode).toBe(0);
		} finally {
			await stopSession(resumed);
			await stopSession(first);
			panel.stop();
			disposeRun(run);
		}
	}, 300_000);
});
