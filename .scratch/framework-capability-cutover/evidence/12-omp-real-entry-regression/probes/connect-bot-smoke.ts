/**
 * Ticket 12 — connect-bot on the real OMP loader (temporary actual-path smoke).
 *
 * This is not a permanent test. It closes the observation gaps the existing docks leave for
 * connect-bot's real delivery path: the unrecognized directed argument, the managed heartbeat
 * timer while armed, the retained feedback of an asynchronous unregister, and the exit of a
 * session that is still armed.
 *
 * The run is the repository's own connect-bot entrypoint, copied verbatim into a run-local
 * deployment so its own `config.yaml` can name this run's endpoints, loaded by the isolated
 * `@oh-my-pi/pi-coding-agent@18.5.0` install. The panel is the real omp-bot release build; a
 * recording HTTP adapter in front of it is the extension's dependency, so every request the
 * extension builds is observed before the real panel answers it. No formal install, global
 * configuration or running agent is touched.
 *
 * Usage: bun .scratch/framework-capability-cutover/evidence/12-omp-real-entry-regression/probes/connect-bot-smoke.ts
 * Output: probes/out/connect-bot/{report.json,frames.jsonl,notices.txt,marker-area.txt}
 */
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { startOmpBot } from "../../../../../tests/connect-bot/support/omp-bot";
import { startResponseTimingAdapter } from "../../../../../tests/connect-bot/support/response-timing-adapter";
import {
	type IsolatedHarness,
	REPO_ROOT,
	ensureIsolatedHarness,
	readBaselineRecord,
} from "../../../../../tests/harness-dock/baseline";
import { type CaptureServer, startCaptureServer } from "../../../../../tests/harness-dock/capture-server";
import {
	DOCK_CAPTURE_BASE_URL_ENV,
	DOCK_MODEL_SELECTOR,
} from "../../../../../tests/harness-dock/fixtures/extension-root/provider";
import { type RunRoot, createRunRoot } from "../../../../../tests/harness-dock/run-root";
import { ControlledSession, type RpcFrame } from "../../../../../tests/harness-dock/session";

const OUT_DIR = path.join(import.meta.dir, "out", "connect-bot");
const DEPLOYMENT_ROOT = path.join(REPO_ROOT, ".cache", "ticket12-probes");
const PROVIDER_FIXTURE = path.join(REPO_ROOT, "tests", "harness-dock", "fixtures", "extension-root", "provider.ts");
const MARKER_AREA_KEY = "semantic-extensions";
const MARKER_LINE = "◐ connectBot";
const HEARTBEAT_INTERVAL_MS = 10_000;
const WAIT_TIMEOUT_MS = 40_000;

interface Check {
	readonly name: string;
	readonly expected: unknown;
	readonly actual: unknown;
	readonly pass: boolean;
}

interface Report {
	readonly harness: { readonly version: string; readonly prefix: string };
	readonly panel: string;
	readonly checks: readonly Check[];
	readonly observations: Record<string, unknown>;
}

const checks: Check[] = [];
const observations: Record<string, unknown> = {};

function eq(name: string, actual: unknown, expected: unknown): void {
	const pass = JSON.stringify(actual) === JSON.stringify(expected);
	checks.push({ name, expected, actual, pass });
	if (!pass) console.error(`FAIL ${name}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
}

function ok(name: string, pass: boolean, actual: unknown): void {
	checks.push({ name, expected: "truthy", actual, pass });
	if (!pass) console.error(`FAIL ${name}\n  actual: ${JSON.stringify(actual)}`);
}

function includes(name: string, actual: string, expected: string): void {
	ok(name, actual.includes(expected), actual);
}

function materializeDeployment(label: string, endpoint: string): string {
	const root = path.join(DEPLOYMENT_ROOT, label);
	rmSync(root, { recursive: true, force: true });
	mkdirSync(root, { recursive: true });
	for (const relative of ["adapters", "framework", "extensions/connect-bot", "entrypoints/omp"]) {
		cpSync(path.join(REPO_ROOT, relative), path.join(root, relative), { recursive: true });
	}
	// The run's own framework configuration: optional, and removed so no shared proxy or runtime
	// path from the machine's example configuration takes part in this run.
	rmSync(path.join(root, "framework", "config.yaml"), { force: true });
	writeFileSync(
		path.join(root, "extensions", "connect-bot", "config.yaml"),
		`endpoint: "${endpoint}"\nrequestTimeoutMs: 2000\n`,
	);
	return root;
}

function widgetFrames(session: ControlledSession): readonly RpcFrame[] {
	return session
		.frames()
		.filter(frame => frame.type === "extension_ui_request" && frame.method === "setWidget");
}

function areaLines(session: ControlledSession): readonly string[] | undefined {
	const frames = widgetFrames(session).filter(frame => frame.widgetKey === MARKER_AREA_KEY);
	const lines = frames[frames.length - 1]?.widgetLines;
	return Array.isArray(lines) ? (lines as string[]) : undefined;
}

function notices(session: ControlledSession): ReadonlyArray<{ readonly level: unknown; readonly message: string }> {
	return session
		.frames()
		.filter(frame => frame.type === "extension_ui_request" && frame.method === "notify")
		.map(frame => ({ level: frame.notifyType, message: String(frame.message) }));
}

function noticeMessages(session: ControlledSession): readonly string[] {
	return notices(session).map(notice => notice.message);
}

async function waitFor(condition: () => boolean, label: string, timeoutMs = WAIT_TIMEOUT_MS): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		if (condition()) return true;
		if (Date.now() >= deadline) {
			console.error(`timed out waiting for ${label}`);
			return false;
		}
		await Bun.sleep(50);
	}
}

async function waitArea(session: ControlledSession, expected: readonly string[] | undefined): Promise<void> {
	const reached = await waitFor(() => {
		const lines = areaLines(session);
		if (expected === undefined) return lines === undefined;
		return lines !== undefined && lines.length === expected.length && lines.every((line, index) => line === expected[index]);
	}, `marker area ${JSON.stringify(expected)}`);
	eq(`marker area reaches ${JSON.stringify(expected)}`, areaLines(session), expected);
	if (!reached) observations[`areaMissing_${JSON.stringify(expected)}`] = widgetFrames(session);
}

function renderEvidence(session: ControlledSession): void {
	mkdirSync(OUT_DIR, { recursive: true });
	const uiFrames = session.frames().filter(frame => frame.type === "extension_ui_request");
	writeFileSync(path.join(OUT_DIR, "frames.jsonl"), uiFrames.map(frame => JSON.stringify(frame)).join("\n"));
	writeFileSync(
		path.join(OUT_DIR, "notices.txt"),
		notices(session)
			.map(notice => `[${String(notice.level)}] ${notice.message}`)
			.join("\n"),
	);
	writeFileSync(
		path.join(OUT_DIR, "marker-area.txt"),
		widgetFrames(session)
			.filter(frame => frame.widgetKey === MARKER_AREA_KEY)
			.map((frame, index) => {
				const lines = Array.isArray(frame.widgetLines) ? frame.widgetLines : [];
				return `--- render ${index + 1} (${String(frame.widgetPlacement)})\n${lines.join("\n")}`;
			})
			.join("\n"),
	);
}

let harness: IsolatedHarness | undefined;
const record = readBaselineRecord();
const runRoot: RunRoot = createRunRoot("ticket12-connect-bot-smoke");
const capture: CaptureServer = startCaptureServer({ dir: runRoot.captureDir });
const panel = await startOmpBot();
const adapter = startResponseTimingAdapter({ target: panel.endpoint });
let session: ControlledSession | undefined;
let failed = false;

try {
	harness = await ensureIsolatedHarness(record);
	const deployment = materializeDeployment("connect-bot", adapter.endpoint);

	session = await ControlledSession.start({
		harness,
		runRoot,
		extensions: [PROVIDER_FIXTURE, path.join(deployment, "entrypoints", "omp", "connect-bot.ts")],
		model: DOCK_MODEL_SELECTOR,
		env: { [DOCK_CAPTURE_BASE_URL_ENV]: capture.baseUrl },
		promptTimeoutMs: 120_000,
	});

	// 1. The directed empty argument arms this session through the real loader.
	const armed = await session.prompt("/connect-bot");
	eq("directed empty argument does not invoke the model", armed.agentInvoked, false);
	eq("directed empty argument completes", armed.status, "completed");
	await adapter.waitFor(receipt => receipt.kind === "register" && receipt.releasedAt !== undefined, "the register answer");
	await panel.waitFor(frame => frame.event === "upsert", "the panel row");
	eq("panel holds one registered row", (await panel.snapshot()).map(view => view.sessionId).length, 1);
	await waitFor(() => noticeMessages(session!).some(message => message.includes("已接入 omp-bot 面板")), "the arm notice");
	const armNotice = notices(session).find(notice => notice.message.includes("已接入 omp-bot 面板"));
	eq("arm notice level is info", armNotice?.level, "info");
	await waitArea(session, [MARKER_LINE]);
	observations.armedNotice = armNotice?.message;
	observations.armedArea = areaLines(session);

	// The declared State (memory persistence) reached the panel as the extension's own state
	// report, and the marker above is the framework's projection of that same value.
	await adapter.waitFor(receipt => receipt.kind === "state" && receipt.releasedAt !== undefined, "the state report");
	const armedRow = (await panel.snapshot())[0];
	ok(
		"the panel received the extension's State value",
		armedRow?.state === "idle" || armedRow?.state === "working",
		armedRow?.state,
	);
	observations.armState = armedRow?.state;

	// 2. The managed heartbeat timer is really scheduled on this host's timer.
	const heartbeat = await adapter.waitFor(
		receipt => receipt.kind === "heartbeat" && receipt.releasedAt !== undefined,
		"a heartbeat",
		HEARTBEAT_INTERVAL_MS + 15_000,
	);
	eq("the heartbeat reached the panel", heartbeat.forwarded, true);
	observations.heartbeatArrivedAtMs = Math.round(heartbeat.arrivedAt);
	const heartbeatsBeforeUnknown = adapter.receipts.filter(receipt => receipt.kind === "heartbeat").length;

	// 3. An unrecognized directed argument is handed to `unrecognized`: one usage error, no effect.
	const registersBeforeUnknown = adapter.receipts.filter(receipt => receipt.kind === "register").length;
	const unrecognized = await session.prompt("/connect-bot bogus");
	eq("unrecognized argument does not invoke the model", unrecognized.agentInvoked, false);
	eq("unrecognized argument completes", unrecognized.status, "completed");
	await waitFor(
		() => noticeMessages(session!).some(message => message.includes("未知参数「bogus」")),
		"the unrecognized-argument notice",
	);
	const unknownNotice = noticeMessages(session).find(message => message.includes("未知参数「bogus」"));
	eq(
		"the usage error names the parsed text and the one word form",
		unknownNotice,
		"未知参数「bogus」；用法：/connect-bot（接入 omp-bot 面板）或 /connect-bot off（断开）。",
	);
	eq("unrecognized argument sent no register", adapter.receipts.filter(receipt => receipt.kind === "register").length, registersBeforeUnknown);
	eq("unrecognized argument sent no unregister", adapter.receipts.filter(receipt => receipt.kind === "unregister").length, 0);
	eq("unrecognized argument left the marker line standing", areaLines(session), [MARKER_LINE]);
	observations.heartbeatsBeforeUnknown = heartbeatsBeforeUnknown;

	// 4. `off` removes the row and says so through the retained capability, after the async
	//    unregister settles; the heartbeat timer is cancelled with the connection.
	const off = await session.prompt("/connect-bot off");
	eq("directed off completes", off.status, "completed");
	const unregister = await adapter.waitFor(receipt => receipt.kind === "unregister" && receipt.releasedAt !== undefined, "the unregister answer");
	eq("the unregister reached the panel", unregister.forwarded, true);
	await waitFor(() => noticeMessages(session!).includes("已断开 omp-bot 面板"), "the off notice");
	const offNotice = notices(session).find(notice => notice.message === "已断开 omp-bot 面板");
	eq("off notice level is info", offNotice?.level, "info");
	await waitArea(session, undefined);
	const heartbeatsAtOff = adapter.receipts.filter(receipt => receipt.kind === "heartbeat").length;
	await Bun.sleep(HEARTBEAT_INTERVAL_MS + 2_000);
	eq(
		"no heartbeat was scheduled after the disarm",
		adapter.receipts.filter(receipt => receipt.kind === "heartbeat").length,
		heartbeatsAtOff,
	);

	// 5. A session still armed at exit ends on its own lifecycle; the managed heartbeat neither
	//    holds the process nor sends an unregister of its own, and no late beat lands.
	const rearmed = await session.prompt("/connect-bot");
	eq("re-arm completes", rearmed.status, "completed");
	await adapter.waitFor(
		receipt => receipt.kind === "register" && receipt.releasedAt !== undefined && adapter.receipts.filter(r => r.kind === "register").length >= 2,
		"the second register answer",
	);
	await waitArea(session, [MARKER_LINE]);
	const registersAtStop = adapter.receipts.filter(receipt => receipt.kind === "register").length;
	const heartbeatsAtStop = adapter.receipts.filter(receipt => receipt.kind === "heartbeat").length;
	const unregistersAtStop = adapter.receipts.filter(receipt => receipt.kind === "unregister").length;
	const stopStarted = performance.now();
	const exit = await session.stop({ timeoutMs: 15_000 });
	const stopTookMs = performance.now() - stopStarted;
	eq("an armed session exits with code 0", exit.exitCode, 0);
	eq("an armed session is not killed after the timeout", exit.timedOut, false);
	ok("the exit is not held by the managed heartbeat", stopTookMs < HEARTBEAT_INTERVAL_MS, stopTookMs);
	await Bun.sleep(HEARTBEAT_INTERVAL_MS + 2_000);
	eq("shutdown sent no unregister of its own", adapter.receipts.filter(receipt => receipt.kind === "unregister").length, unregistersAtStop);
	eq("no heartbeat outlived the session", adapter.receipts.filter(receipt => receipt.kind === "heartbeat").length, heartbeatsAtStop);
	eq("the shutdown registered nothing further", adapter.receipts.filter(receipt => receipt.kind === "register").length, registersAtStop);
	observations.registersAtStop = registersAtStop;
	observations.heartbeatsAtStop = heartbeatsAtStop;
	observations.unregistersAtStop = unregistersAtStop;
	observations.exitTookMs = Math.round(stopTookMs);
	observations.stderr = exit.stderr;

	renderEvidence(session);
} catch (error) {
	failed = true;
	console.error(error);
	observations.error = error instanceof Error ? (error.stack ?? error.message) : String(error);
	if (session !== undefined) renderEvidence(session);
} finally {
	await session?.stop({ timeoutMs: 5_000 }).catch(() => undefined);
	capture.stop();
	adapter.stop();
	await panel.stop().catch(() => undefined);
	runRoot.dispose();
	mkdirSync(OUT_DIR, { recursive: true });
	const report: Report = {
		harness: { version: harness?.version ?? "<not materialised>", prefix: harness?.prefix ?? "<none>" },
		panel: panel.endpoint,
		checks,
		observations,
	};
	writeFileSync(path.join(OUT_DIR, "report.json"), `${JSON.stringify(report, null, "\t")}\n`);
	const failures = checks.filter(check => !check.pass).length;
	console.log(`connect-bot smoke: ${checks.length - failures} pass / ${failures} fail`);
	console.log(`output: ${OUT_DIR}`);
	if (failures > 0 || failed) process.exitCode = 1;
}
