/**
 * connect-bot's startup attempt against the owner's own life on the real OMP harness (S2; P7,
 * P20, P21, P25, P27, P32 of the extension-startup-modes contract).
 *
 * The runs load this repository's real entrypoint files through the host's ordinary `-e`
 * parameter — the automatic connect-bot entrypoint, alone or beside the manual codebase-tools
 * one — against an isolated agent state, a temporary working directory and the dock's own
 * capture endpoint. The panel is a scripted local endpoint that records every push and can hold a
 * register answer, so the race is driven by an event the test releases rather than by a network
 * timeout.
 *
 * The capture endpoint is the independent model request observer: it records the request the
 * harness really sent. That is how the non-blocking claim and the other consumer's contribution
 * are observed, rather than inferred from the extension's own queue or marker.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Server } from "bun";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { INIT_PROMPT, REMINDER_PROMPT } from "../../extensions/codebase-tools/shared-logic/prompts";
import { type IsolatedHarness, REPO_ROOT, ensureIsolatedHarness, readBaselineRecord } from "./baseline";
import { type CaptureServer, type CapturedRequest, startCaptureServer } from "./capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV, DOCK_MODEL_SELECTOR } from "./fixtures/extension-root/provider";
import { type RunRoot, createRunRoot } from "./run-root";
import { ControlledSession, type RpcFrame } from "./session";

const record = readBaselineRecord();

let harness: IsolatedHarness;

beforeAll(async () => {
	harness = await ensureIsolatedHarness(record);
}, 300_000);

/** The provider fixture, loaded beside the entrypoints: no credentials, no network. */
const PROVIDER_FIXTURE = path.join(REPO_ROOT, "tests", "harness-dock", "fixtures", "extension-root", "provider.ts");

/** The framework's one marker area, as the host's UI reports it. */
const MARKER_AREA_KEY = "semantic-extensions";
/** Each consumer's own line, as its definition declares it. The area orders by extension id. */
const CODEBASE_TOOLS_LINE = "◈ codeBaseTools";
const CONNECT_BOT_LINE = "◐ connectBot";

/** What the operator hears from connect-bot's own success and its transfer notice. */
const CONNECTED = "已接入 herdr-bot 面板（当前 1 个在线会话）";
const SWITCHED = "会话已切换，已断开面板；重新 /connect-bot 可重连";
const DISCONNECTED = "已断开 herdr-bot 面板";

/** The trees one run's deployment needs: the shared source, both consumers and every entrypoint. */
const DEPLOYED_TREES = [
	"adapters",
	"framework",
	path.join("extensions", "connect-bot"),
	path.join("extensions", "codebase-tools"),
	path.join("entrypoints", "startup"),
	path.join("entrypoints", "omp"),
	path.join("entrypoints", "omp-auto"),
];

/** The root of this suite's deployment copies, removed once the suite is done. */
const DEPLOYMENT_ROOT = path.join(REPO_ROOT, ".cache", `connect-bot-lifecycle-${process.pid}`);

/** One push the run's panel endpoint received, as connect-bot's own wire envelope states it. */
interface PanelEvent {
	readonly sessionId: string;
	readonly kind: string;
}

/**
 * The scripted panel endpoint: it records every push, answers a register with the receipt the
 * extension's own wire contract states, and can hold the next register's answer until the test
 * releases it.
 *
 * Holding is stated before the attempt is made, so the request that is on the wire when an `off`
 * or a session boundary arrives is provably the one the test chose to hold.
 */
class PanelDouble {
	readonly #events: PanelEvent[] = [];
	#server: Server<undefined> | undefined;
	#holdNext = 0;
	readonly #held: Array<() => void> = [];

	static start(): PanelDouble {
		const panel = new PanelDouble();
		panel.#server = Bun.serve({
			port: 0,
			hostname: "127.0.0.1",
			fetch: async request => {
				const body = await request.text();
				let event: PanelEvent | undefined;
				try {
					const envelope = JSON.parse(body) as { sessionId?: unknown; kind?: unknown };
					event = { sessionId: String(envelope.sessionId), kind: String(envelope.kind) };
					panel.#events.push(event);
				} catch {
					// A push this endpoint cannot read is still a request it received.
				}
				if (event?.kind === "register") {
					if (panel.#holdNext > 0) {
						panel.#holdNext -= 1;
						const held = Promise.withResolvers<void>();
						panel.#held.push(held.resolve);
						await held.promise;
					}
					return Response.json({ outcome: "registered", onlineCount: 1 });
				}
				return Response.json({ outcome: "accepted" });
			},
		});
		return panel;
	}

	get endpoint(): string {
		const port = this.#server?.port;
		if (port === undefined) throw new Error("the panel double is not running");
		return `http://127.0.0.1:${port}`;
	}

	/** Holds the next register's answer until {@link releaseHeld}. */
	holdNext(): void {
		this.#holdNext += 1;
	}

	/** Releases every held register with a valid receipt. */
	releaseHeld(): void {
		for (const release of this.#held.splice(0)) release();
	}

	/** The pushes of one kind this endpoint received, in arrival order. */
	kinds(kind: string): readonly PanelEvent[] {
		return this.#events.filter(event => event.kind === kind);
	}

	stop(): void {
		this.releaseHeld();
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
	readonly panel: PanelDouble;
	readonly deployment: string;
}

function createRun(label: string): DockRun {
	const panel = PanelDouble.start();
	const runRoot = createRunRoot(label);
	return {
		runRoot,
		capture: startCaptureServer({ dir: runRoot.captureDir }),
		panel,
		deployment: materializeDeployment(label, panel.endpoint),
	};
}

/** The entrypoint files one session loads, from this run's own deployment. */
function entrypoint(run: DockRun, mode: "auto" | "manual", extension: "connect-bot" | "codebase-tools"): string {
	return path.join(run.deployment, "entrypoints", mode === "auto" ? "omp-auto" : "omp", `${extension}.ts`);
}

/** Starts one session over the run's own directories with the stated extension files. */
function openSession(run: DockRun, extensions: readonly string[]): Promise<ControlledSession> {
	return ControlledSession.start({
		harness,
		runRoot: run.runRoot,
		extensions: [PROVIDER_FIXTURE, ...extensions],
		model: DOCK_MODEL_SELECTOR,
		env: { [DOCK_CAPTURE_BASE_URL_ENV]: run.capture.baseUrl },
	});
}

/** Drops a run's endpoints and directories; safe after an explicit stop. */
function disposeRun(run: DockRun): void {
	run.capture.stop();
	run.panel.stop();
	run.runRoot.dispose();
}

/** Stops one session if it is still live. */
async function stopSession(session: ControlledSession | undefined): Promise<void> {
	if (session === undefined) return;
	try {
		await session.stop({ timeoutMs: 10_000 });
	} catch {
		// The session already stopped; the run's own disposal still runs.
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

/** The lines the area's last render carried, or `undefined` when that render cleared the widget. */
function lastAreaLines(session: ControlledSession): readonly string[] | undefined {
	const frames = areaFrames(session);
	const lines = frames[frames.length - 1]?.widgetLines;
	return Array.isArray(lines) ? (lines as string[]) : undefined;
}

/** Every notice the session's operator channel carried, in order. */
function notices(session: ControlledSession): readonly string[] {
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
	return waitFor(() => notices(session).includes(message));
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
}

/** The plain text of one provider message content. */
function messageText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map(part => (typeof part === "object" && part !== null && "text" in part ? String(part.text) : ""))
		.join("");
}

/** How many provider messages one captured request carries either injected slot's text. */
function injectedMessages(request: CapturedRequest): number {
	const needles = [INIT_PROMPT, REMINDER_PROMPT];
	return (((request.json ?? {}) as CapturedBody).messages ?? []).filter(message => {
		const text = messageText(message.content);
		return needles.some(needle => text.includes(needle));
	}).length;
}

/** The last provider message's text, or none when the request carried nothing. */
function lastMessageText(request: CapturedRequest): string {
	const messages = ((request.json ?? {}) as CapturedBody).messages ?? [];
	const last: { readonly content?: unknown } | undefined = messages[messages.length - 1];
	return last === undefined ? "" : messageText(last.content);
}

/** One captured request by index, with the run's own count in the failure detail when absent. */
function requestAt(run: DockRun, index: number): CapturedRequest {
	const requests = run.capture.requests();
	const request: CapturedRequest | undefined = requests[index];
	if (request === undefined) {
		throw new Error(`the run captured ${requests.length} provider request(s); request ${index + 1} is missing`);
	}
	return request;
}

afterAll(() => {
	rmSync(DEPLOYMENT_ROOT, { recursive: true, force: true });
});

describe("connect-bot's pending startup attempt does not disturb another consumer (P27, P32)", () => {
	test("the first request leaves before the register answers, and a late receipt after off leaves codebase-tools' contribution and State standing", async () => {
		const run = createRun("connect-bot-combined");
		let session: ControlledSession | undefined;
		try {
			run.panel.holdNext();
			session = await openSession(run, [
				entrypoint(run, "auto", "connect-bot"),
				entrypoint(run, "manual", "codebase-tools"),
			]);
			expect(await waitFor(() => run.panel.kinds("register").length === 1)).toBe(true);

			// The other consumer is enabled by its own command while connect-bot's register is still
			// unanswered, and only its own line renders.
			const enabled = await session.prompt("/codebase-tools");
			expect(enabled.agentInvoked).toBe(false);
			expect(enabled.status).toBe("completed");
			expect(await areaReaches(session, [CODEBASE_TOOLS_LINE])).toBe(true);

			// The first model request leaves while the register is deliberately unanswered, and it
			// carries codebase-tools' first-enabled-run contribution.
			const firstTurn = await session.prompt("a turn while the connect-bot register is unanswered");
			expect(firstTurn.status).toBe("completed");
			expect(run.capture.requests().length).toBeGreaterThan(0);
			expect(injectedMessages(requestAt(run, 0))).toBe(1);
			expect(lastMessageText(requestAt(run, 0))).toContain(INIT_PROMPT);
			expect(run.panel.kinds("register")).toHaveLength(1);
			expect(lastAreaLines(session)).toEqual([CODEBASE_TOOLS_LINE]);

			// The receipt is the only thing that arms connect-bot: the line joins the other one.
			run.panel.releaseHeld();
			expect(await noticeReaches(session, CONNECTED)).toBe(true);
			expect(await areaReaches(session, [CODEBASE_TOOLS_LINE, CONNECT_BOT_LINE])).toBe(true);
			expect(await waitFor(() => run.panel.kinds("state").length === 1)).toBe(true);

			// A re-register is on the wire when the operator closes connect-bot. Its later valid
			// receipt must not re-enable the connection.
			run.panel.holdNext();
			expect((await session.prompt("/connect-bot")).status).toBe("completed");
			expect(await waitFor(() => run.panel.kinds("register").length === 2)).toBe(true);
			expect((await session.prompt("/connect-bot off")).status).toBe("completed");
			expect(await waitFor(() => run.panel.kinds("unregister").length === 1)).toBe(true);
			expect(await noticeReaches(session, DISCONNECTED)).toBe(true);
			run.panel.releaseHeld();

			const after = await session.prompt("a turn after the late receipt");
			expect(after.status).toBe("completed");
			expect(lastAreaLines(session)).toEqual([CODEBASE_TOOLS_LINE]);
			// The late receipt reported no second state: the attempt died with the off.
			expect(run.panel.kinds("state")).toHaveLength(1);
			// codebase-tools' own contribution continues: the next request carries the reminder
			// beside the init the branch already holds.
			expect(injectedMessages(requestAt(run, 1))).toBe(2);
			expect(lastMessageText(requestAt(run, 1))).toContain(REMINDER_PROMPT);

			const exit = await session.stop();
			expect(exit.exitCode).toBe(0);
		} finally {
			await stopSession(session);
			disposeRun(run);
		}
	}, 300_000);
});

describe("navigation and an owner boundary never apply the startup again (P21, P25)", () => {
	test("new, fork, resume and same-owner navigation register nothing; a transfer invalidates the attempt it interrupts", async () => {
		const run = createRun("connect-bot-navigation");
		let session: ControlledSession | undefined;
		try {
			session = await openSession(run, [entrypoint(run, "auto", "connect-bot")]);
			expect(await waitFor(() => run.panel.kinds("register").length === 1)).toBe(true);
			expect(await areaReaches(session, [CONNECT_BOT_LINE])).toBe(true);
			expect(await waitFor(() => run.panel.kinds("state").length === 1)).toBe(true);

			// A session created in place: the process already started, so the entrypoint's choice is
			// not applied again and this session begins off.
			expect((await session.request({ type: "new_session" })).success).toBe(true);
			const freshFile = await sessionFileOf(session);
			expect((await session.prompt("a new-session turn")).status).toBe("completed");
			expect(lastAreaLines(session)).toBeUndefined();
			expect(run.panel.kinds("register")).toHaveLength(1);

			// A fork is another session under the ordinary rules: no startup default, no register.
			expect((await session.request({ type: "fork" })).success).toBe(true);
			expect((await session.prompt("a forked turn")).status).toBe("completed");
			expect(run.panel.kinds("register")).toHaveLength(1);

			// Resuming the fresh session is a transfer back to an identity the process already served;
			// the same-file resume after it keeps the owner, so it is no boundary at all.
			expect((await session.request({ type: "switch_session", sessionPath: freshFile })).success).toBe(true);
			expect((await session.prompt("a resumed turn")).status).toBe("completed");
			expect((await session.request({ type: "switch_session", sessionPath: freshFile })).success).toBe(true);
			expect((await session.prompt("a same-owner turn")).status).toBe("completed");
			expect(run.panel.kinds("register")).toHaveLength(1);
			expect(lastAreaLines(session)).toBeUndefined();

			// A command on that session is a real activation and is deliberately held; the transfer
			// below ends its owner before the panel answers.
			run.panel.holdNext();
			expect((await session.prompt("/connect-bot")).status).toBe("completed");
			expect(await waitFor(() => run.panel.kinds("register").length === 2)).toBe(true);
			expect((await session.request({ type: "new_session" })).success).toBe(true);
			run.panel.releaseHeld();

			const after = await session.prompt("a turn after the owner moved on");
			expect(after.status).toBe("completed");
			// The late receipt enabled nothing: no new state report, no line, and no further register.
			expect(run.panel.kinds("state")).toHaveLength(1);
			expect(run.panel.kinds("register")).toHaveLength(2);
			expect(lastAreaLines(session)).toBeUndefined();
			expect(notices(session).filter(message => message === CONNECTED)).toHaveLength(1);
			// The requests each agent-invoked turn needed really left the host: a new-session turn, a
			// forked turn, the resumed turn, the same-owner turn and the final turn.
			expect(run.capture.requests().length).toBe(5);

			const exit = await session.stop();
			expect(exit.exitCode).toBe(0);
		} finally {
			await stopSession(session);
			disposeRun(run);
		}
	}, 300_000);
});

describe("an edited startup policy document takes effect with the next process (P7)", () => {
	test("the running process keeps its armed connection and registration, and a fresh process takes the edited off default", async () => {
		const run = createRun("connect-bot-policy-change");
		let first: ControlledSession | undefined;
		let second: ControlledSession | undefined;
		try {
			first = await openSession(run, [entrypoint(run, "auto", "connect-bot")]);
			expect(await waitFor(() => run.panel.kinds("register").length === 1)).toBe(true);
			expect(await areaReaches(first, [CONNECT_BOT_LINE])).toBe(true);
			const requestsBefore = run.capture.requests().length;
			expect((await first.prompt("a turn under the enabling policy")).status).toBe("completed");
			expect(run.capture.requests().length).toBeGreaterThan(requestsBefore);

			// The selected document is edited while this process runs. Nothing re-reads it: the armed
			// owner keeps its connection, its line and its value, and no register or state report is
			// forced by the edit.
			writeFileSync(
				path.join(run.deployment, "entrypoints", "startup", "auto.yaml"),
				"connect-bot:\n  enabled: false\n",
			);

			// The turn after the edit still leaves normally, on the connection this process armed.
			const requestsBeforeEditTurn = run.capture.requests().length;
			expect((await first.prompt("a turn after the document was edited")).status).toBe("completed");
			expect(run.capture.requests().length).toBeGreaterThan(requestsBeforeEditTurn);
			expect(lastAreaLines(first)).toEqual([CONNECT_BOT_LINE]);
			expect(run.panel.kinds("register")).toHaveLength(1);
			expect(run.panel.kinds("unregister")).toEqual([]);
			expect((await first.stop()).exitCode).toBe(0);
			first = undefined;

			// An independent process starts on the edited document. Its explicit off default means no
			// register attempt at all — observed as the absence of a request, not merely an unlit line.
			const registersBefore = run.panel.kinds("register").length;
			second = await openSession(run, [entrypoint(run, "auto", "connect-bot")]);
			const requestsBeforeSecondTurn = run.capture.requests().length;
			expect((await second.prompt("a turn under the edited policy")).status).toBe("completed");
			expect(run.capture.requests().length).toBeGreaterThan(requestsBeforeSecondTurn);
			expect(run.panel.kinds("register")).toHaveLength(registersBefore);
			expect(lastAreaLines(second)).toBeUndefined();
			expect(notices(second)).toEqual([]);

			expect((await second.stop()).exitCode).toBe(0);
			second = undefined;
		} finally {
			await stopSession(second);
			await stopSession(first);
			disposeRun(run);
		}
	}, 300_000);
});
