/**
 * Explicit loading, mode selection and configuration refusal on the real OMP harness (S2; P1,
 * P5, P29, P31, P34 of the extension-startup-modes contract).
 *
 * The seam is the OMP extension seam: the real isolated loader loads exactly the entrypoint files
 * the cases name, a real session runs with the dock's credential-free provider, and the panel is a
 * scripted local endpoint that records the protocol it receives. The working directories are the
 * dock's own temporary directories, so same-named files placed below them are distractors rather
 * than the extension's configuration.
 *
 * What these runs observe is the loaded set, not a path computation:
 *
 * - one entrypoint binds one extension; another extension named in the selected policy document is
 *   neither loaded nor called into business;
 * - the automatic entrypoints of both consumers bind together, each producing one command and one
 *   startup effect, and a manual entrypoint mixed with an automatic one consumes only its own
 *   document;
 * - the same automatic entrypoint, run from two different project directories, still registers
 *   with the endpoint and under the choice its own deployment selected, not with the files those
 *   directories carry;
 * - an unparseable document refuses that binding on stderr while an adjacent extension whose own
 *   document is valid keeps its command and business path.
 *
 * The marker's rendered form stays human-led; the frames asserted here are the adapter's own
 * `setWidget` publications. Panel registration is this run's scripted protocol endpoint, not the
 * real panel, whose interoperability another suite drives.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Server } from "bun";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { INIT_PROMPT } from "../../extensions/codebase-tools/shared-logic/prompts";
import { type IsolatedHarness, REPO_ROOT, ensureIsolatedHarness, readBaselineRecord } from "./baseline";
import { type CaptureServer, type CapturedRequest, startCaptureServer } from "./capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV, DOCK_MODEL_SELECTOR } from "./fixtures/extension-root/provider";
import { type RunRoot, createRunRoot } from "./run-root";
import { ControlledSession, type RpcFrame } from "./session";

let harness: IsolatedHarness;

beforeAll(async () => {
	harness = await ensureIsolatedHarness(readBaselineRecord());
}, 300_000);

/** The credential-free provider fixture, loaded beside the entrypoints under test. */
const PROVIDER_FIXTURE = path.join(REPO_ROOT, "tests", "harness-dock", "fixtures", "extension-root", "provider.ts");

/** The framework's one marker area, and the lines each real consumer declares. */
const MARKER_AREA_KEY = "semantic-extensions";
const CODEBASE_TOOLS_LINE = "◈ codeBaseTools";
const CONNECT_BOT_LINE = "◐ connectBot";

/** The commands each consumer declares, and the notices their own operation renders. */
const CODEBASE_TOOLS_COMMAND = "codebase-tools";
const CONNECT_BOT_COMMAND = "connect-bot";
const CODEBASE_TOOLS_ENABLED = "codeBaseTools enabled";

/** Every tree a deployment copy needs: the repository's real source and discovery entrypoints. */
const DEPLOYED_TREES = ["adapters", "framework", "extensions", "entrypoints"] as const;

/** The root of this suite's deployment copies, removed once the suite is done. */
const DEPLOYMENT_ROOT = path.join(REPO_ROOT, ".cache", `startup-modes-loading-${process.pid}`);

/** What one deployment copy carries besides the repository's own files. */
interface DeploymentOptions {
	/** The endpoint written into the copy's connect-bot `config.yaml`. */
	readonly endpoint: string;
	/** The manual policy document to write over the shipped one, when a case states its own. */
	readonly manualPolicy?: string;
	/** The automatic policy document to write over the shipped one, when a case states its own. */
	readonly autoPolicy?: string;
}

/**
 * Materialise one run's deployment: this repository's real shared source and entrypoints, copied
 * verbatim, with the run's own connect-bot configuration in place of the shipped one.
 */
function materializeDeployment(label: string, options: DeploymentOptions): string {
	const root = path.join(DEPLOYMENT_ROOT, label);
	mkdirSync(root, { recursive: true });
	for (const source of DEPLOYED_TREES) {
		cpSync(path.join(REPO_ROOT, source), path.join(root, source), { recursive: true });
	}
	writeFileSync(
		path.join(root, "extensions", "connect-bot", "config.yaml"),
		`endpoint: "${options.endpoint}"\nrequestTimeoutMs: 1000\n`,
	);
	if (options.manualPolicy !== undefined) {
		writeFileSync(path.join(root, "entrypoints", "startup", "manual.yaml"), options.manualPolicy);
	}
	if (options.autoPolicy !== undefined) {
		writeFileSync(path.join(root, "entrypoints", "startup", "auto.yaml"), options.autoPolicy);
	}
	return root;
}

/** One controlled run's directories and capture endpoint. */
interface DockRun {
	readonly runRoot: RunRoot;
	readonly capture: CaptureServer;
}

function createRun(label: string): DockRun {
	const runRoot = createRunRoot(label);
	return { runRoot, capture: startCaptureServer({ dir: runRoot.captureDir }) };
}

/** One run's panel record, as the scripted endpoint received it. */
interface PanelEvent {
	readonly sessionId: string;
	readonly kind: string;
}

/** A scripted local panel: it records each push and answers the protocol's success receipts. */
class RecordingPanel {
	readonly #events: PanelEvent[] = [];
	#server: Server<undefined> | undefined;

	static start(): RecordingPanel {
		const panel = new RecordingPanel();
		panel.#server = Bun.serve({
			port: 0,
			hostname: "127.0.0.1",
			fetch: async request => {
				const body = await request.text();
				let kind = "";
				let sessionId = "";
				try {
					const parsed: unknown = JSON.parse(body);
					if (typeof parsed === "object" && parsed !== null) {
						kind = "kind" in parsed ? String(parsed.kind) : "";
						sessionId = "sessionId" in parsed ? String(parsed.sessionId) : "";
						panel.#events.push({ kind, sessionId });
					}
				} catch {
					// A push this endpoint cannot read is still a request it received.
				}
				return Response.json(
					kind === "register" ? { outcome: "registered", onlineCount: 1 } : { outcome: "accepted" },
				);
			},
		});
		return panel;
	}

	get endpoint(): string {
		const port = this.#server?.port;
		if (port === undefined) throw new Error("the panel double is not running");
		return `http://127.0.0.1:${port}`;
	}

	kinds(kind: string): readonly PanelEvent[] {
		return this.#events.filter(event => event.kind === kind);
	}

	stop(): void {
		void this.#server?.stop(true);
		this.#server = undefined;
	}
}

/** Starts one session with exactly the provider fixture and the entrypoint files named. */
function openSession(run: DockRun, deployment: string, entrypoints: readonly string[]): Promise<ControlledSession> {
	return ControlledSession.start({
		harness,
		runRoot: run.runRoot,
		extensions: [PROVIDER_FIXTURE, ...entrypoints.map(entrypoint => path.join(deployment, entrypoint))],
		model: DOCK_MODEL_SELECTOR,
		env: { [DOCK_CAPTURE_BASE_URL_ENV]: run.capture.baseUrl },
	});
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
		await session.stop({ timeoutMs: 10_000 });
	} catch {
		// The session already stopped; the run's own disposal still runs.
	}
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

/** The frameworks's marker-area frames one session published, in order. */
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
function notices(session: ControlledSession): readonly string[] {
	return session
		.frames()
		.filter(frame => frame.type === "extension_ui_request" && frame.method === "notify")
		.map(frame => String(frame.message));
}

/** The plain text of one captured provider message content. */
function messageText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map(part => {
			if (typeof part !== "object" || part === null || !("text" in part)) return "";
			return typeof part.text === "string" ? part.text : "";
		})
		.join("");
}

/** Whether one captured request carries codebase-tools' init contribution. */
function carriesInit(request: CapturedRequest): boolean {
	const document = request.json;
	if (typeof document !== "object" || document === null || !("messages" in document)) return false;
	if (!Array.isArray(document.messages)) return false;
	return document.messages.some(message => {
		const content = typeof message === "object" && message !== null && "content" in message ? message.content : undefined;
		return messageText(content).includes(INIT_PROMPT);
	});
}

/** The last provider request a run captured, failing with the run's own count when absent. */
function lastCapturedRequest(run: DockRun): CapturedRequest {
	const requests = run.capture.requests();
	const request = requests[requests.length - 1];
	if (request === undefined) throw new Error("the run captured no provider request");
	return request;
}

/** Writes one distractor file below a run's temporary working directory. */
function writeDistractor(run: DockRun, relative: string, text: string): void {
	const file = path.join(run.runRoot.workDir, relative);
	mkdirSync(path.dirname(file), { recursive: true });
	writeFileSync(file, text);
}

afterAll(() => {
	rmSync(DEPLOYMENT_ROOT, { recursive: true, force: true });
});

describe("one explicit entrypoint binds only its own extension (P1, P5)", () => {
	test("a policy entry for another extension neither loads it nor produces its business request", async () => {
		// The selected document names connect-bot with an enabling choice; only codebase-tools is
		// loaded. Naming the second extension is not a loading instruction.
		const panel = RecordingPanel.start();
		const deployment = materializeDeployment("single", {
			endpoint: panel.endpoint,
			manualPolicy: ["codebase-tools:", "  enabled: false", "connect-bot:", "  enabled: true", ""].join("\n"),
		});
		const run = createRun("loading-single");
		let session: ControlledSession | undefined;
		try {
			session = await openSession(run, deployment, ["entrypoints/omp/codebase-tools.ts"]);

			// `/connect-bot` is not a registered command in this process: the prompt reaches the model
			// instead of the extension's command path.
			const unknown = await session.prompt(`/${CONNECT_BOT_COMMAND}`);
			expect(unknown.agentInvoked).toBe(true);
			expect(unknown.status).toBe("completed");
			expect(panel.kinds("register")).toEqual([]);

			// The loaded extension's command is registered and works; its enabled first request carries
			// the init contribution.
			const enabled = await session.prompt(`/${CODEBASE_TOOLS_COMMAND}`);
			expect(enabled.agentInvoked).toBe(false);
			expect(enabled.status).toBe("completed");
			expect(await waitFor(() => notices(session!).includes(CODEBASE_TOOLS_ENABLED))).toBe(true);
			expect(await waitFor(() => lastAreaLines(session!)?.includes(CODEBASE_TOOLS_LINE) === true)).toBe(true);

			const turn = await session.prompt("a turn after the explicit enable");
			expect(turn.status).toBe("completed");
			expect(carriesInit(lastCapturedRequest(run))).toBe(true);
			expect(panel.kinds("register")).toEqual([]);

			expect((await session.stop()).exitCode).toBe(0);
		} finally {
			await stopSession(session);
			panel.stop();
			disposeRun(run);
		}
	}, 300_000);
});

describe("the automatic entrypoints of both consumers bind together with one effect each (P1, P29)", () => {
	test("two commands, one register and one contribution, and each command's own off transition", async () => {
		const panel = RecordingPanel.start();
		const deployment = materializeDeployment("both-auto", { endpoint: panel.endpoint });
		const run = createRun("loading-both-auto");
		let session: ControlledSession | undefined;
		try {
			session = await openSession(run, deployment, [
				"entrypoints/omp-auto/codebase-tools.ts",
				"entrypoints/omp-auto/connect-bot.ts",
			]);

			// Both chosen consumers enabled themselves; the area carries each line once.
			expect(await waitFor(() => panel.kinds("register").length === 1)).toBe(true);
			expect(await waitFor(() => panel.kinds("state").length === 1)).toBe(true);
			expect(
				await waitFor(() => {
					const lines = lastAreaLines(session!);
					return lines?.includes(CODEBASE_TOOLS_LINE) === true && lines.includes(CONNECT_BOT_LINE);
				}),
			).toBe(true);
			expect(lastAreaLines(session!)).toHaveLength(2);

			const turn = await session.prompt("the automatic pair's first turn");
			expect(turn.status).toBe("completed");
			expect(carriesInit(lastCapturedRequest(run))).toBe(true);

			// Each command exists once and drives its own State; stopping one leaves the other's line.
			const toolsOff = await session.prompt(`/${CODEBASE_TOOLS_COMMAND} off`);
			expect(toolsOff.agentInvoked).toBe(false);
			expect(
				await waitFor(() => {
					const lines = lastAreaLines(session!);
					return lines?.includes(CONNECT_BOT_LINE) === true && lines.includes(CODEBASE_TOOLS_LINE) === false;
				}),
			).toBe(true);

			const botOff = await session.prompt(`/${CONNECT_BOT_COMMAND} off`);
			expect(botOff.agentInvoked).toBe(false);
			expect(await waitFor(() => panel.kinds("unregister").length === 1)).toBe(true);
			expect(await waitFor(() => lastAreaLines(session!) === undefined)).toBe(true);

			// The startup moment was consumed once; the commands changed State without a second register.
			expect(panel.kinds("register")).toHaveLength(1);
			expect((await session.stop()).exitCode).toBe(0);
		} finally {
			await stopSession(session);
			panel.stop();
			disposeRun(run);
		}
	}, 300_000);
});

describe("a manual entrypoint beside an automatic one consumes only its own document (P29)", () => {
	test("the automatic policy's connect-bot entry does not start the manually loaded connect-bot", async () => {
		const panel = RecordingPanel.start();
		const deployment = materializeDeployment("mixed", { endpoint: panel.endpoint });
		const run = createRun("loading-mixed");
		let session: ControlledSession | undefined;
		try {
			session = await openSession(run, deployment, [
				"entrypoints/omp-auto/codebase-tools.ts",
				"entrypoints/omp/connect-bot.ts",
			]);

			// codebase-tools reads auto.yaml (enabled); connect-bot reads manual.yaml (off), even though
			// auto.yaml also names connect-bot with an enabling choice.
			expect(await waitFor(() => lastAreaLines(session!)?.includes(CODEBASE_TOOLS_LINE) === true)).toBe(true);
			const turn = await session.prompt("the mixed pair's first turn");
			expect(turn.status).toBe("completed");
			expect(carriesInit(lastCapturedRequest(run))).toBe(true);
			expect(panel.kinds("register")).toEqual([]);
			expect(lastAreaLines(session!)).not.toContain(CONNECT_BOT_LINE);

			// The manually loaded connect-bot still arms through its own command, exactly once.
			const armed = await session.prompt(`/${CONNECT_BOT_COMMAND}`);
			expect(armed.agentInvoked).toBe(false);
			expect(await waitFor(() => panel.kinds("register").length === 1)).toBe(true);
			expect(await waitFor(() => lastAreaLines(session!)?.includes(CONNECT_BOT_LINE) === true)).toBe(true);
			expect(lastAreaLines(session!)).toHaveLength(2);

			const disarmed = await session.prompt(`/${CONNECT_BOT_COMMAND} off`);
			expect(disarmed.agentInvoked).toBe(false);
			expect(await waitFor(() => panel.kinds("unregister").length === 1)).toBe(true);
			expect(await waitFor(() => lastAreaLines(session!)?.includes(CONNECT_BOT_LINE) === false)).toBe(true);
			expect(lastAreaLines(session!)).toContain(CODEBASE_TOOLS_LINE);

			expect((await session.stop()).exitCode).toBe(0);
		} finally {
			await stopSession(session);
			panel.stop();
			disposeRun(run);
		}
	}, 300_000);
});

describe("the same automatic entrypoint ignores same-named files in the project directory (P31)", () => {
	test("two working directories carrying different decoys still use the deployment's policy and endpoint", async () => {
		const selected = RecordingPanel.start();
		const decoyOne = RecordingPanel.start();
		const decoyTwo = RecordingPanel.start();
		const deployment = materializeDeployment("distractor", { endpoint: selected.endpoint });
		const first = createRun("loading-distractor-one");
		const second = createRun("loading-distractor-two");
		let firstSession: ControlledSession | undefined;
		let secondSession: ControlledSession | undefined;
		try {
			// First project directory: a policy that would leave connect-bot off and a configuration
			// that would point the extension at another panel.
			writeDistractor(first, path.join("entrypoints", "startup", "auto.yaml"), "connect-bot:\n  enabled: false\n");
			writeDistractor(
				first,
				path.join("extensions", "connect-bot", "config.yaml"),
				`endpoint: "${decoyOne.endpoint}"\nrequestTimeoutMs: 1\n`,
			);
			firstSession = await openSession(first, deployment, ["entrypoints/omp-auto/connect-bot.ts"]);
			expect(await waitFor(() => selected.kinds("register").length === 1)).toBe(true);
			expect(await waitFor(() => lastAreaLines(firstSession!)?.includes(CONNECT_BOT_LINE) === true)).toBe(true);
			expect(decoyOne.kinds("register")).toEqual([]);

			// Second project directory: different decoys, including an unparseable policy document. A
			// binding that read either directory would either stay off or send to the wrong endpoint.
			writeDistractor(second, path.join("entrypoints", "startup", "auto.yaml"), "connect-bot:\n  enabled: [\n");
			writeDistractor(
				second,
				path.join("extensions", "connect-bot", "config.yaml"),
				`endpoint: "${decoyTwo.endpoint}"\nrequestTimeoutMs: 999\n`,
			);
			secondSession = await openSession(second, deployment, ["entrypoints/omp-auto/connect-bot.ts"]);
			expect(await waitFor(() => selected.kinds("register").length === 2)).toBe(true);
			expect(await waitFor(() => lastAreaLines(secondSession!)?.includes(CONNECT_BOT_LINE) === true)).toBe(true);
			expect(decoyTwo.kinds("register")).toEqual([]);

			expect((await firstSession.stop()).exitCode).toBe(0);
			expect((await secondSession.stop()).exitCode).toBe(0);
		} finally {
			await stopSession(firstSession);
			await stopSession(secondSession);
			selected.stop();
			decoyOne.stop();
			decoyTwo.stop();
			disposeRun(first);
			disposeRun(second);
		}
	}, 300_000);
});

describe("an unparseable selected document refuses its binding while a valid adjacent one runs (P34)", () => {
	test("the diagnostic is visible, the refused command is absent, and the other extension's operation still works", async () => {
		const panel = RecordingPanel.start();
		const deployment = materializeDeployment("broken-manual", {
			endpoint: panel.endpoint,
			manualPolicy: ["codebase-tools:", "  enabled: [", ""].join("\n"),
		});
		const run = createRun("loading-broken-manual");
		let session: ControlledSession | undefined;
		try {
			session = await openSession(run, deployment, [
				"entrypoints/omp/codebase-tools.ts",
				"entrypoints/omp-auto/connect-bot.ts",
			]);

			// The adjacent extension's own source is valid: it enables and registers normally.
			expect(await waitFor(() => panel.kinds("register").length === 1)).toBe(true);
			expect(await waitFor(() => lastAreaLines(session!)?.includes(CONNECT_BOT_LINE) === true)).toBe(true);

			// The refused binding reported the failure on stderr and registered no command.
			expect(
				await waitFor(() => session!.stderr().includes("codebase-tools: configuration error (config)")),
			).toBe(true);
			expect(session.stderr()).toContain("is not valid YAML");
			const unknown = await session.prompt(`/${CODEBASE_TOOLS_COMMAND}`);
			expect(unknown.agentInvoked).toBe(true);
			expect(unknown.status).toBe("completed");
			expect(lastAreaLines(session!)).not.toContain(CODEBASE_TOOLS_LINE);
			// The refused extension contributed nothing to the model request either.
			expect(carriesInit(lastCapturedRequest(run))).toBe(false);

			// The valid consumer's command still operates: one unregister, and its line leaves.
			const disarmed = await session.prompt(`/${CONNECT_BOT_COMMAND} off`);
			expect(disarmed.agentInvoked).toBe(false);
			expect(await waitFor(() => panel.kinds("unregister").length === 1)).toBe(true);
			expect(await waitFor(() => lastAreaLines(session!) === undefined)).toBe(true);

			expect((await session.stop()).exitCode).toBe(0);
		} finally {
			await stopSession(session);
			panel.stop();
			disposeRun(run);
		}
	}, 300_000);
});
