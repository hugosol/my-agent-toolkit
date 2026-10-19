/**
 * Ticket 12 — codebase-tools' marker on the real host's Viewed session projection (temporary
 * actual-path smoke).
 *
 * The existing codebase-tools suite observes the marker area inside one session; the existing
 * Viewed session dock observes the projection through two marker fixtures. This probe closes the
 * remaining cell: the deployed codebase-tools entrypoint on the patched OMP host, with two real
 * sessions whose displayed one is switched over RPC, and the area's actual `setWidget` renderings
 * as the evidence.
 *
 * Each session carries its own State. Enabling the extension in the first session shows its line;
 * a new displayed session starts off and clears it; enabling it there shows the line again. Coming
 * back to the first session shows that session's own value, disabling it there clears the area,
 * and coming back to the second session restores the second session's line — so the projection
 * follows the displayed session's State rather than the last one written.
 *
 * Usage: bun .scratch/framework-capability-cutover/evidence/12-omp-real-entry-regression/probes/codebase-tools-viewed-smoke.ts
 * Output: probes/out/codebase-tools-viewed/{report.json,frames.jsonl,marker-area.txt}
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { REPO_ROOT, readBaselineRecord } from "../../../../../tests/harness-dock/baseline";
import { ensureViewedSessionHarness } from "../../../../../tests/harness-dock/viewed-session-harness";
import { type CaptureServer, startCaptureServer } from "../../../../../tests/harness-dock/capture-server";
import {
	DOCK_CAPTURE_BASE_URL_ENV,
	DOCK_MODEL_SELECTOR,
} from "../../../../../tests/harness-dock/fixtures/extension-root/provider";
import { type RunRoot, createRunRoot } from "../../../../../tests/harness-dock/run-root";
import { ControlledSession, type RpcFrame } from "../../../../../tests/harness-dock/session";
import { listSessionFiles } from "../../../../../tests/harness-dock/session-log";

const OUT_DIR = path.join(import.meta.dir, "out", "codebase-tools-viewed");
const DEPLOYMENT_ROOT = path.join(REPO_ROOT, ".cache", "ticket12-probes");
const PROVIDER_FIXTURE = path.join(REPO_ROOT, "tests", "harness-dock", "fixtures", "extension-root", "provider.ts");
const MARKER_AREA_KEY = "semantic-extensions";
const MARKER_LINE = "◈ codeBaseTools";
const SESSION_A_TURN = "viewed projection A turn";
const SESSION_B_TURN = "viewed projection B turn";
const WAIT_TIMEOUT_MS = 40_000;

interface Check {
	readonly name: string;
	readonly expected: unknown;
	readonly actual: unknown;
	readonly pass: boolean;
}

interface Report {
	readonly harness: { readonly version: string; readonly prefix: string };
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

function materializeDeployment(label: string): string {
	const root = path.join(DEPLOYMENT_ROOT, label);
	rmSync(root, { recursive: true, force: true });
	mkdirSync(root, { recursive: true });
	for (const relative of ["adapters", "framework", "extensions/codebase-tools", "entrypoints/omp"]) {
		cpSync(path.join(REPO_ROOT, relative), path.join(root, relative), { recursive: true });
	}
	rmSync(path.join(root, "framework", "config.yaml"), { force: true });
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

async function expectArea(session: ControlledSession, expected: readonly string[] | undefined, label: string): Promise<void> {
	await waitFor(() => {
		const lines = areaLines(session);
		if (expected === undefined) return lines === undefined;
		return lines !== undefined && lines.length === expected.length && lines.every((line, index) => line === expected[index]);
	}, label);
	eq(label, areaLines(session), expected);
}

/** The session file whose transcript carries one prompt's text, or an error naming the files seen. */
function sessionFileCarrying(sessionDir: string, prompt: string): string {
	const files = listSessionFiles(sessionDir);
	const found = files.find(file => readFileSync(file, "utf8").includes(prompt));
	if (found === undefined) throw new Error(`no session file carries ${JSON.stringify(prompt)}; files: ${files.join(", ")}`);
	return found;
}

const runRoot: RunRoot = createRunRoot("ticket12-codebase-tools-viewed");
const capture: CaptureServer = startCaptureServer({ dir: runRoot.captureDir });
let session: ControlledSession | undefined;
let harnessVersion = "<not materialised>";
let harnessPrefix = "<none>";
let failed = false;

try {
	const harness = await ensureViewedSessionHarness(readBaselineRecord());
	harnessVersion = harness.version;
	harnessPrefix = harness.prefix;
	const deployment = materializeDeployment("codebase-tools-viewed");

	session = await ControlledSession.start({
		harness,
		runRoot,
		extensions: [PROVIDER_FIXTURE, path.join(deployment, "entrypoints", "omp", "codebase-tools.ts")],
		model: DOCK_MODEL_SELECTOR,
		env: { [DOCK_CAPTURE_BASE_URL_ENV]: capture.baseUrl },
		promptTimeoutMs: 120_000,
	});

	// Session A: enable, and run a real turn so its transcript file exists on disk.
	eq("A toggle completes", (await session.prompt("/codebase-tools")).status, "completed");
	eq("A turn completes", (await session.prompt(SESSION_A_TURN)).status, "completed");
	await expectArea(session, [MARKER_LINE], "the area shows A's own line");
	observations.areaAEnabled = areaLines(session);

	// A new displayed session starts with its own default State: the area clears.
	const created = await session.request({ type: "new_session" });
	const createdPayload = created.data !== null && typeof created.data === "object" ? (created.data as Record<string, unknown>) : {};
	eq("a new session is not cancelled", createdPayload.cancelled, false);
	await waitFor(() => areaLines(session!) === undefined, "the area clears for the new displayed session");
	eq("the new displayed session clears the area", areaLines(session), undefined);

	// Session B: enable there; only B's line is shown.
	eq("B toggle completes", (await session.prompt("/codebase-tools")).status, "completed");
	eq("B turn completes", (await session.prompt(SESSION_B_TURN)).status, "completed");
	await expectArea(session, [MARKER_LINE], "the area shows B's own line");
	observations.areaBEnabled = areaLines(session);

	// Back to A: the displayed session's own value is shown again.
	const sessionAFile = sessionFileCarrying(runRoot.sessionDir, SESSION_A_TURN);
	await session.request({ type: "switch_session", sessionPath: sessionAFile });
	await expectArea(session, [MARKER_LINE], "the area shows A's restored value after switching back");
	observations.areaSwitchedToA = areaLines(session);

	// Disable in A: the area clears, and B's own State is unaffected behind the view.
	eq("A disable completes", (await session.prompt("/codebase-tools")).status, "completed");
	await expectArea(session, undefined, "the area clears when A is disabled");
	observations.areaADisabled = areaLines(session);

	// Back to B: B's own enabled line is projected, so the switch did not copy A's value.
	const sessionBFile = sessionFileCarrying(runRoot.sessionDir, SESSION_B_TURN);
	await session.request({ type: "switch_session", sessionPath: sessionBFile });
	await expectArea(session, [MARKER_LINE], "the area shows B's own value after switching to B");
	observations.areaSwitchedToB = areaLines(session);

	// The area is the framework's widget: codebase-tools declares no widget of its own. The host's
	// built-in extensions may render their own widgets; none of them is this extension's.
	const keys = [...new Set(widgetFrames(session).map(frame => frame.widgetKey))];
	ok("the marker line went to the framework's area key", keys.includes(MARKER_AREA_KEY), keys);
	ok("codebase-tools set no widget of its own", !keys.includes("codebase-tools"), keys);
	observations.widgetKeys = keys;

	const exit = await session.stop();
	eq("the run exits cleanly", exit.exitCode, 0);
} catch (error) {
	failed = true;
	console.error(error);
	observations.error = error instanceof Error ? (error.stack ?? error.message) : String(error);
} finally {
	await session?.stop({ timeoutMs: 5_000 }).catch(() => undefined);
	capture.stop();
	runRoot.dispose();
	mkdirSync(OUT_DIR, { recursive: true });
	if (session !== undefined) {
		const uiFrames = session.frames().filter(frame => frame.type === "extension_ui_request");
		writeFileSync(path.join(OUT_DIR, "frames.jsonl"), uiFrames.map(frame => JSON.stringify(frame)).join("\n"));
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
	const report: Report = {
		harness: { version: harnessVersion, prefix: harnessPrefix },
		checks,
		observations,
	};
	writeFileSync(path.join(OUT_DIR, "report.json"), `${JSON.stringify(report, null, "\t")}\n`);
	const failures = checks.filter(check => !check.pass).length;
	console.log(`codebase-tools viewed smoke: ${checks.length - failures} pass / ${failures} fail`);
	console.log(`output: ${OUT_DIR}`);
	if (failures > 0 || failed) process.exitCode = 1;
}
