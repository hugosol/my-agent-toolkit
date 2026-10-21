/**
 * The request budget connect-bot's own configuration gives every request (P13, P15–P19).
 *
 * The seam under test is the extension as the loader drives it: its own OMP assembly binds the
 * definition, the command the framework registered runs, the native session events the harness
 * delivers are handed to that binding, and what the operator reads is the extension's own notice.
 * The outbound dependency is a real local HTTP service — the panel below — that receives every
 * request and answers the one under test only after a fixed 1200ms delay, so a request's wait and
 * its outcome are observed on the wire rather than captured as an argument.
 *
 * A validated configuration is recorded once per extension per process, so a budget other than
 * the one the repository ships cannot be manufactured in this process at all: each run below is a
 * process of its own (`support/budget-probe.ts`), which binds the extension and drives the path
 * with the configuration file this test wrote for it. The file, not a code constant, is the only
 * source of the budget — and the shipped file's own value is what the first run is given, read
 * here through the framework's configuration interface rather than repeated as a literal.
 *
 * Two facts are kept apart throughout, because they answer different questions: the panel's record
 * says a request was received, and the run's own report says whether the client was still waiting
 * when the panel answered. A client that gave up is not a panel that did nothing.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { CONNECT_BOT } from "../../extensions/connect-bot/definition";
import { readConfig } from "../../framework/core/config";
import { REPO_ROOT } from "../harness-dock/baseline";

/** The fixed response delay the scenario names, in milliseconds. */
const PANEL_DELAY_MS = 1200;
/** The request budget the repository's own `config.yaml` ships, as the framework's read of it reports it. */
const SHIPPED_BUDGET_MS = readConfig(path.join(REPO_ROOT, "extensions", "connect-bot", "config.yaml"), {
	fields: CONNECT_BOT.config?.fields,
}).requestTimeoutMs as number;
/** A budget other than the shipped one: what a changed configuration file carries after a restart. */
const LARGER_BUDGET_MS = 2000;
/** The session id each probe run reports, derived from the scenario it ran. */
const sessionOf = (scenario: string) => `budget-${scenario}`;
/** The one session-event route, as the panel receives it. */
const EVENTS_PATH = "/api/sessions/events";
/** Arm success, verbatim, for one online session: what the panel's receipt produces. */
const CONNECTED = "已接入 herdr-bot 面板（当前 1 个在线会话）";
/** The `off` that did happen locally while the panel never answered it. */
const PANEL_SILENT = "herdr-bot 面板未响应";
/** The `off` the panel answered. */
const DISCONNECTED = "已断开 herdr-bot 面板";
/** The notice a session being left gets when another identity takes its place. */
const SWITCHED = "会话已切换，已断开面板；重新 /connect-bot 可重连";
/** Arm failure: the receipt the panel's answer would have carried never arrived in time. */
const ARM_FAILED = "无法连接 herdr-bot，未连接；请确认面板已启动".replace("未连接", "未启用");
/** The first failure of an outage, verbatim from the frozen baseline: what a dropped beat announces. */
const FIRST_FAILURE = "与 herdr-bot 面板连接中断；若持续失败将自动断开";

/** One outbound request the probe made, as the run's own recording of it reported it. */
interface SentRequest {
	readonly kind: string;
	readonly url: string;
	readonly elapsedMs: number;
	readonly outcome: "answered" | "timed-out" | "failed";
	readonly status?: number;
	/** The extension's own local state when this request went out; see the probe's own report. */
	readonly stateWhenSent: { readonly armed: boolean; readonly beatsRunning: number };
}

/** One run's report, as `support/budget-probe.ts` printed it. */
interface ProbeReport {
	readonly pid: number;
	readonly scenario: string;
	readonly configuration: { readonly endpoint: string; readonly requestTimeoutMs: number };
	readonly notifications: readonly string[];
	readonly notificationLevels: readonly string[];
	readonly markerShown: boolean;
	readonly armed: boolean;
	readonly sent: readonly SentRequest[];
}

/** One request the panel received: what it was, when it arrived and when it was answered. */
interface PanelRequest {
	readonly method: string;
	readonly path: string;
	readonly kind: string;
	readonly sessionId: string;
	readonly receivedAt: number;
	answeredAt?: number;
}

/** The local panel one run talks to: a real HTTP service with one fixed response delay. */
interface DelayedPanel {
	readonly endpoint: string;
	readonly requests: PanelRequest[];
	/**
	 * Resolves once every request the panel has received has been answered.
	 *
	 * A client that gave up before the panel's fixed delay has already reported its own failure
	 * while the panel's answer is still pending, so a case that asks when the panel answered waits
	 * here first — the two facts are kept apart on purpose.
	 */
	settled(): Promise<void>;
	stop(): void;
}

/**
 * Starts the panel this test's runs send to: loopback, an ephemeral port, every request recorded,
 * and the one kind under test answered only after {@link PANEL_DELAY_MS}.
 *
 * The delay is real wall-clock time on purpose: what this suite establishes is how a request's own
 * budget behaves against a panel that answers late, and the budget is realized by the harness's
 * `AbortSignal.timeout` over a genuine socket — deterministic fake timers could not produce the
 * request's actual arrival and answer times, which are the evidence. Each case therefore keeps
 * both facts the delay separates: the panel's record of what it received and answered, and the
 * run's own report of whether the client was still waiting.
 *
 * The other kinds are answered at once, because a run has to reach the state it is about to
 * observe: the arming the extension performs before a boundary or an `off` is part of the scenario,
 * not part of the budget under test.
 */
function startDelayedPanel(delayedKind: "register" | "unregister" | "heartbeat"): DelayedPanel {
	const requests: PanelRequest[] = [];
	/** One promise per received request, resolved when that request has been answered. */
	const answers: Promise<void>[] = [];
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		async fetch(request) {
			const raw = await request.text();
			const envelope = JSON.parse(raw) as { readonly sessionId: string; readonly kind: string };
			const record: PanelRequest = {
				method: request.method,
				path: new URL(request.url).pathname,
				kind: envelope.kind,
				sessionId: envelope.sessionId,
				receivedAt: performance.now(),
			};
			requests.push(record);
			const answered = Promise.withResolvers<void>();
			answers.push(answered.promise);
			if (envelope.kind === delayedKind) {
				const { promise, resolve } = Promise.withResolvers<void>();
				setTimeout(resolve, PANEL_DELAY_MS);
				await promise;
			}
			record.answeredAt = performance.now();
			answered.resolve();
			const body = envelope.kind === "register" ? { outcome: "registered", onlineCount: 1 } : {};
			return Response.json(body);
		},
	});
	/** A full pass over the answers so far, repeated while the panel is still receiving. */
	async function settled(): Promise<void> {
		for (;;) {
			const wave = answers.slice();
			await Promise.all(wave);
			if (wave.length === answers.length) return;
		}
	}
	return {
		endpoint: `http://127.0.0.1:${server.port}`,
		requests,
		settled,
		stop: () => void server.stop(true),
	};
}

/** One run's own directory and configuration file; disposed by the caller. */
interface ProbeRunRoot {
	readonly dir: string;
	readonly configFile: string;
	dispose(): void;
}

/** Writes the configuration file one run is driven by, under a directory of its own. */
function createRunRoot(label: string, endpoint: string, requestTimeoutMs: number): ProbeRunRoot {
	const dir = mkdtempSync(path.join(tmpdir(), `connect-bot-budget-${label}-`));
	const configFile = path.join(dir, "config.yaml");
	writeFileSync(configFile, `endpoint: "${endpoint}"\nrequestTimeoutMs: ${requestTimeoutMs}\n`);
	return {
		dir,
		configFile,
		dispose: () => rmSync(dir, { recursive: true, force: true }),
	};
}

const PROBE = path.join(REPO_ROOT, "tests", "connect-bot", "support", "budget-probe.ts");

/** Runs the probe in a process of its own and reads the one report line it prints. */
async function runProbe(configFile: string, scenario: string, rewriteTo?: number): Promise<ProbeReport> {
	const argv = ["bun", PROBE, configFile, scenario, ...(rewriteTo === undefined ? [] : [String(rewriteTo)])];
	const child = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe" });
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	if (exitCode !== 0) throw new Error(`budget-probe (${scenario}) exited ${exitCode}: ${stderr}`);
	const lines = stdout.trim().split("\n");
	const line = lines[lines.length - 1] ?? "";
	return JSON.parse(line) as ProbeReport;
}

/** The requests one run made of one kind, in the order it made them. */
const ofKind = (report: ProbeReport, kind: string) => report.sent.filter(request => request.kind === kind);

/** The panel's record of one kind, in arrival order. */
const received = (panel: DelayedPanel, kind: string) => panel.requests.filter(request => request.kind === kind);

/** The panels and run directories of the case at hand, all disposed together. */
const running: Array<{ dispose(): void }> = [];
function track<T extends { dispose(): void }>(value: T): T {
	running.push(value);
	return value;
}
function panelFor(delayedKind: "register" | "unregister" | "heartbeat"): DelayedPanel {
	const panel = startDelayedPanel(delayedKind);
	running.push({ dispose: () => panel.stop() });
	return panel;
}

afterEach(() => {
	for (const resource of running.splice(0)) resource.dispose();
});

describe("register waits the configured budget against a real panel (P13, P16)", () => {
	test("the shipped budget gives up before the panel's 1200ms answer, and the attempt is a failed one", async () => {
		const panel = panelFor("register");
		const root = track(createRunRoot("register-shipped", panel.endpoint, SHIPPED_BUDGET_MS));

		const report = await runProbe(root.configFile, "register");

		// The budget the run waited is the file's own value, read at binding: the configuration the
		// framework validated, not a constant that happens to coincide with it.
		expect(report.configuration).toEqual({ endpoint: panel.endpoint, requestTimeoutMs: SHIPPED_BUDGET_MS });
		expect(report.sent.map(request => request.kind)).toEqual(["register"]);
		// The wait is the budget's, and it ended before the panel's answer existed: this run was
		// still waiting at 900ms and no longer at the panel's 1200ms delay.
		expect(report.sent[0]?.outcome).toBe("timed-out");
		expect(report.sent[0]?.elapsedMs).toBeGreaterThanOrEqual(900);
		expect(report.sent[0]?.elapsedMs).toBeLessThan(PANEL_DELAY_MS);

		// A register that is not acknowledged arms nothing: no marker, no record, one failure notice.
		expect(report.armed).toBe(false);
		expect(report.markerShown).toBe(false);
		expect(report.notifications).toEqual([ARM_FAILED]);
		expect(report.notificationLevels).toEqual(["error"]);

		// The panel did receive the request, and answered it after the client had already given up:
		// being received is not the same fact as the client's outcome. The answer outlives the run,
		// so wait for it before reading when it happened.
		await panel.settled();
		const registers = received(panel, "register");
		expect(registers).toHaveLength(1);
		expect(registers[0]?.method).toBe("POST");
		expect(registers[0]?.path).toBe(EVENTS_PATH);
		expect(registers[0]?.sessionId).toBe(sessionOf("register"));
		expect((registers[0]?.answeredAt ?? 0) - (registers[0]?.receivedAt ?? 0)).toBeGreaterThanOrEqual(
			PANEL_DELAY_MS - 100,
		);
	});

	test("a 2000ms budget in a process of its own receives the registered receipt and connects", async () => {
		const panel = panelFor("register");
		const root = track(createRunRoot("register-larger", panel.endpoint, LARGER_BUDGET_MS));

		const report = await runProbe(root.configFile, "register");

		expect(report.configuration.requestTimeoutMs).toBe(LARGER_BUDGET_MS);
		// The register waited past the panel's delay and was answered, and the state report the arm
		// path sends behind it went out and was answered as well.
		expect(report.sent.map(request => request.kind)).toEqual(["register", "state"]);
		expect(report.sent[0]?.outcome).toBe("answered");
		expect(report.sent[0]?.status).toBe(200);
		expect(report.sent[0]?.elapsedMs).toBeGreaterThanOrEqual(PANEL_DELAY_MS - 100);
		expect(report.sent[1]?.outcome).toBe("answered");

		// The connection is complete: the operator reads the receipt's online count and the area
		// shows the marker for the session this extension registered.
		expect(report.notifications).toEqual([CONNECTED]);
		expect(report.markerShown).toBe(true);
		expect(report.armed).toBe(true);
		expect(received(panel, "register")).toHaveLength(1);
	});
});

describe("`/connect-bot off` waits the same budget, locally first (P17)", () => {
	test("the shipped budget times the unregister out while the session is already disconnected", async () => {
		const panel = panelFor("unregister");
		const root = track(createRunRoot("off-shipped", panel.endpoint, SHIPPED_BUDGET_MS));

		const report = await runProbe(root.configFile, "off");

		expect(report.sent.map(request => request.kind)).toEqual(["register", "state", "unregister"]);
		const unregister = report.sent[2];
		// Exactly one request waited on the budget, and it gave up before the panel's answer: the
		// client's failure to hear back is not evidence that the panel did nothing.
		expect(report.sent.filter(request => request.kind === "unregister")).toHaveLength(1);
		expect(unregister?.outcome).toBe("timed-out");
		expect(unregister?.elapsedMs).toBeGreaterThanOrEqual(900);
		expect(unregister?.elapsedMs).toBeLessThan(PANEL_DELAY_MS);
		// The local half was already complete when the request went out: the record was dropped and
		// the owner's beat was cancelled, so the network wait never held up the command.
		expect(unregister?.stateWhenSent).toEqual({ armed: false, beatsRunning: 0 });
		expect(report.armed).toBe(false);
		expect(report.markerShown).toBe(false);
		// The panel did not answer in time, so the notice reports that and not a disconnect the
		// client never heard: the effect the operator asked for did happen locally either way.
		expect(report.notifications).toEqual([CONNECTED, PANEL_SILENT]);
		expect(report.notificationLevels).toEqual(["info", "error"]);

		// The panel's own answer arrives after the run that gave up on it: wait for it, then read
		// when it happened.
		await panel.settled();
		const unregisters = received(panel, "unregister");
		expect(unregisters).toHaveLength(1);
		expect(unregisters[0]?.sessionId).toBe(sessionOf("off"));
		expect((unregisters[0]?.answeredAt ?? 0) - (unregisters[0]?.receivedAt ?? 0)).toBeGreaterThanOrEqual(
			PANEL_DELAY_MS - 100,
		);
	});

	test("a 2000ms budget completes the same unregister and reports the panel's answer", async () => {
		const panel = panelFor("unregister");
		const root = track(createRunRoot("off-larger", panel.endpoint, LARGER_BUDGET_MS));

		const report = await runProbe(root.configFile, "off");

		const unregister = report.sent.find(request => request.kind === "unregister");
		expect(unregister?.outcome).toBe("answered");
		expect(unregister?.elapsedMs).toBeGreaterThanOrEqual(PANEL_DELAY_MS - 100);
		// The same local-first order, and the notice the panel's own answer produces.
		expect(unregister?.stateWhenSent).toEqual({ armed: false, beatsRunning: 0 });
		expect(report.notifications).toEqual([CONNECTED, DISCONNECTED]);
		expect(report.notificationLevels).toEqual(["info", "info"]);
		expect(received(panel, "unregister")).toHaveLength(1);
	});
});

describe("a session boundary's unregister waits the same budget (P18)", () => {
	test("a switched session asks once, waits the shipped budget, and is silent about the outcome", async () => {
		const panel = panelFor("unregister");
		const root = track(createRunRoot("switch-shipped", panel.endpoint, SHIPPED_BUDGET_MS));

		const report = await runProbe(root.configFile, "session-end-transferred");

		// One request for the row the ended session left, and no second attempt: whether it is sent
		// is the event's decision, and how long it waits is the same budget as any other request.
		const unregisters = report.sent.filter(request => request.kind === "unregister");
		expect(unregisters).toHaveLength(1);
		expect(unregisters[0]?.elapsedMs).toBeGreaterThanOrEqual(900);
		expect(unregisters[0]?.elapsedMs).toBeLessThan(PANEL_DELAY_MS);
		expect(unregisters[0]?.outcome).toBe("timed-out");
		// The local half was synchronous: by the time the request left, the record was gone and the
		// owner's beat was cancelled, and the outcome is nobody's business here — no second notice.
		expect(unregisters[0]?.stateWhenSent).toEqual({ armed: false, beatsRunning: 0 });
		expect(report.armed).toBe(false);
		expect(report.notifications).toEqual([CONNECTED, SWITCHED]);
		const atPanel = received(panel, "unregister");
		expect(atPanel).toHaveLength(1);
		expect(atPanel[0]?.sessionId).toBe(sessionOf("session-end-transferred"));
	});

	test("a 2000ms budget lets the same boundary's unregister finish inside the panel's delay", async () => {
		const panel = panelFor("unregister");
		const root = track(createRunRoot("switch-larger", panel.endpoint, LARGER_BUDGET_MS));

		const report = await runProbe(root.configFile, "session-end-transferred");

		const unregister = report.sent.find(request => request.kind === "unregister");
		expect(unregister?.outcome).toBe("answered");
		expect(unregister?.elapsedMs).toBeGreaterThanOrEqual(PANEL_DELAY_MS - 100);
		expect(report.notifications).toEqual([CONNECTED, SWITCHED]);
		expect(received(panel, "unregister")).toHaveLength(1);
	});

	test("a disposal sends no request at all: the event conditions still decide whether one is sent", async () => {
		const panel = panelFor("unregister");
		const root = track(createRunRoot("disposed", panel.endpoint, SHIPPED_BUDGET_MS));

		const report = await runProbe(root.configFile, "session-end-disposed");

		// The process going away is not a row this extension could still name: no unregister is
		// invented for it, and nothing beyond the arm's own two requests reaches the panel.
		expect(report.sent.map(request => request.kind)).toEqual(["register", "state"]);
		expect(received(panel, "unregister")).toEqual([]);
		expect(report.notifications).toEqual([CONNECTED]);
	});
});

describe("a background push waits the same budget, not one of its own (P19)", () => {
	test("the shipped budget abandons a beat the panel answers after 1200ms, and the beat is not retried", async () => {
		const panel = panelFor("heartbeat");
		const root = track(createRunRoot("heartbeat-shipped", panel.endpoint, SHIPPED_BUDGET_MS));

		const report = await runProbe(root.configFile, "heartbeat");

		// The push left the loaded extension's own background path: the arm's two requests, then the
		// beat the managed interval it asked the harness for produced.
		expect(report.configuration.requestTimeoutMs).toBe(SHIPPED_BUDGET_MS);
		expect(report.sent.map(request => request.kind)).toEqual(["register", "state", "heartbeat"]);
		const beat = report.sent[2];
		// The wait is the configured budget's: this run was still waiting at 900ms and no longer at
		// the panel's 1200ms delay. A background budget of its own — the 1500ms it used to keep —
		// would have been answered instead, which is exactly what this asserts against.
		expect(beat?.outcome).toBe("timed-out");
		expect(beat?.elapsedMs).toBeGreaterThanOrEqual(900);
		expect(beat?.elapsedMs).toBeLessThan(PANEL_DELAY_MS);
		// A beat that failed is dropped, not retried, and the connection it belonged to survives it:
		// one failure of the budget is announced once, and the session is still armed.
		expect(ofKind(report, "heartbeat")).toHaveLength(1);
		expect(report.armed).toBe(true);
		expect(report.notifications).toEqual([CONNECTED, FIRST_FAILURE]);
		expect(report.notificationLevels).toEqual(["info", "error"]);

		// The panel did receive the beat and answered it after the client had already given up.
		await panel.settled();
		const beats = received(panel, "heartbeat");
		expect(beats).toHaveLength(1);
		expect(beats[0]?.method).toBe("POST");
		expect(beats[0]?.path).toBe(EVENTS_PATH);
		expect(beats[0]?.sessionId).toBe(sessionOf("heartbeat"));
		expect((beats[0]?.answeredAt ?? 0) - (beats[0]?.receivedAt ?? 0)).toBeGreaterThanOrEqual(
			PANEL_DELAY_MS - 100,
		);
	});

	test("a 2000ms budget lets the same beat complete, with no failure accounted", async () => {
		const panel = panelFor("heartbeat");
		const root = track(createRunRoot("heartbeat-larger", panel.endpoint, LARGER_BUDGET_MS));

		const report = await runProbe(root.configFile, "heartbeat");

		expect(report.configuration.requestTimeoutMs).toBe(LARGER_BUDGET_MS);
		expect(report.sent.map(request => request.kind)).toEqual(["register", "state", "heartbeat"]);
		const beat = report.sent[2];
		expect(beat?.outcome).toBe("answered");
		expect(beat?.status).toBe(200);
		expect(beat?.elapsedMs).toBeGreaterThanOrEqual(PANEL_DELAY_MS - 100);
		// The beat reached the panel, so no outage was announced and the connection is unchanged.
		expect(report.armed).toBe(true);
		expect(report.notifications).toEqual([CONNECTED]);
		expect(received(panel, "heartbeat")).toHaveLength(1);
	});
});

describe("the budget is the file's value for the life of the process (P15)", () => {
	test("a file changed to 2000 in a running process leaves its 1000ms budget in place, and the next process adopts 2000", async () => {
		const panel = panelFor("register");
		const root = track(createRunRoot("restart", panel.endpoint, SHIPPED_BUDGET_MS));

		// The process binds, reads its file, and only then is the file changed — by the run itself,
		// which is the only way the change can happen while that process is alive. Nothing discards
		// the values it already read: this is a file change, not a restart.
		const before = await runProbe(root.configFile, "register-after-rewrite", LARGER_BUDGET_MS);

		expect(readFileSync(root.configFile, "utf8")).toContain(`requestTimeoutMs: ${LARGER_BUDGET_MS}`);
		expect(before.configuration.requestTimeoutMs).toBe(SHIPPED_BUDGET_MS);
		// The budget it kept is the one it really waited with: the register still gave up before the
		// panel's 1200ms answer, exactly as the shipped budget's own run does.
		expect(before.sent[0]?.outcome).toBe("timed-out");
		expect(before.sent[0]?.elapsedMs).toBeLessThan(PANEL_DELAY_MS);
		expect(before.armed).toBe(false);

		// A process of its own, loading the file as it now stands, adopts the new value — with no
		// state carried over between the two runs but the file.
		const after = await runProbe(root.configFile, "register");
		expect(after.pid).not.toBe(before.pid);
		expect(after.configuration.requestTimeoutMs).toBe(LARGER_BUDGET_MS);
		expect(after.sent[0]?.outcome).toBe("answered");
		expect(after.sent[0]?.elapsedMs).toBeGreaterThanOrEqual(PANEL_DELAY_MS - 100);
		expect(after.armed).toBe(true);
	});
});
