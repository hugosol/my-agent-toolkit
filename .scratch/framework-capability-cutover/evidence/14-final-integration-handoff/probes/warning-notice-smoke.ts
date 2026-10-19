/**
 * Ticket 14 — a real OMP host warning notice for the P48 material (temporary evidence probe).
 *
 * The 01 baseline and tickets 12/13 captured info and error notices; the warning level was only
 * covered by automated level assertions. This probe drives the production model-cost entrypoint on
 * the isolated OMP 18.5.0 host with a built-in non-DeepSeek provider, so `/budget holiday` takes the
 * extension's real warning branch (`仅适用于当前 provider 为 DeepSeek ... 未执行`). It records the
 * actual `notify` frame (level + text) the host was told to render.
 *
 * This is content/field evidence for the P48 handoff, not a readability judgement and not a
 * permanent test. It loads the production entrypoint verbatim; only the provider selector and the
 * run-local agent state differ from the ordinary scenario. The source and fixtures of the tested
 * tree are not modified.
 *
 * Usage: bun .scratch/framework-capability-cutover/evidence/14-final-integration-handoff/probes/warning-notice-smoke.ts
 * Output: ../p48/warning/{report.json,notices.txt,frames.jsonl}
 */
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { writeProviderOverride } from "../../../../../tests/harness-dock/agent-config";
import { REPO_ROOT, readBaselineRecord } from "../../../../../tests/harness-dock/baseline";
import { startCaptureServer } from "../../../../../tests/harness-dock/capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV } from "../../../../../tests/harness-dock/fixtures/extension-root/provider";
import { createRunRoot } from "../../../../../tests/harness-dock/run-root";
import { ControlledSession, type RpcFrame } from "../../../../../tests/harness-dock/session";
import { ensureViewedSessionHarness } from "../../../../../tests/harness-dock/viewed-session-harness";

const OUT_DIR = path.join(import.meta.dir, "..", "p48", "warning");
const PROVIDER = "openai";
const MODEL = "gpt-4o";
const MODEL_SELECTOR = `${PROVIDER}/${MODEL}`;
const DOCK_CREDENTIAL = "dock-key";
const WAIT_TIMEOUT_MS = 40_000;

interface Check {
	readonly name: string;
	readonly expected: unknown;
	readonly actual: unknown;
	readonly pass: boolean;
}
const checks: Check[] = [];
function eq(name: string, actual: unknown, expected: unknown): void {
	const pass = JSON.stringify(actual) === JSON.stringify(expected);
	checks.push({ name, expected, actual, pass });
	if (!pass) console.error(`FAIL ${name}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
}
function ok(name: string, pass: boolean, actual: unknown): void {
	checks.push({ name, expected: "truthy", actual, pass });
	if (!pass) console.error(`FAIL ${name}\n  actual: ${JSON.stringify(actual)}`);
}

function materializeDeployment(): string {
	const root = path.join(REPO_ROOT, ".cache", "ticket14-warning-probe");
	rmSync(root, { recursive: true, force: true });
	mkdirSync(root, { recursive: true });
	for (const relative of ["adapters", "framework", "extensions/model-cost", "entrypoints/omp"]) {
		cpSync(path.join(REPO_ROOT, relative), path.join(root, relative), { recursive: true });
	}
	rmSync(path.join(root, "framework", "config.yaml"), { force: true });
	return root;
}

function notices(session: ControlledSession): ReadonlyArray<{ readonly level: unknown; readonly message: string }> {
	return session
		.frames()
		.filter(frame => frame.type === "extension_ui_request" && frame.method === "notify")
		.map(frame => ({ level: frame.notifyType, message: String(frame.message) }));
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

const runRoot = createRunRoot("ticket14-warning-notice");
const home = path.join(runRoot.path, "user-home");
const storage = path.join(home, ".omp", "cost-archive");
mkdirSync(storage, { recursive: true });
writeFileSync(
	path.join(storage, "consumption.json"),
	JSON.stringify({
		schemaVersion: 1,
		periodId: "period-ticket14-warning",
		start: "2026-10-01T00:00:00.000Z",
		holiday: false,
		harnesses: { omp: { sessions: [] } },
	}),
	"utf8",
);
const homeEnv = {
	USERPROFILE: home,
	HOME: home,
	HOMEDRIVE: path.parse(home).root,
	HOMEPATH: home.slice(path.parse(home).root.length - 1),
};
const capture = startCaptureServer({ dir: runRoot.captureDir, replyText: "ticket 14 warning probe reply" });
writeProviderOverride(runRoot.agentDir, PROVIDER, { baseUrl: capture.baseUrl, apiKey: DOCK_CREDENTIAL });
let session: ControlledSession | undefined;
let harnessVersion = "<not materialised>";
let harnessPrefix = "<none>";
let failed = false;

try {
	const harness = await ensureViewedSessionHarness(readBaselineRecord());
	harnessVersion = harness.version;
	harnessPrefix = harness.prefix;
	const deployment = materializeDeployment();
	session = await ControlledSession.start({
		harness,
		runRoot,
		extensions: [path.join(deployment, "entrypoints", "omp", "model-cost.ts")],
		model: MODEL_SELECTOR,
		env: { [DOCK_CAPTURE_BASE_URL_ENV]: capture.baseUrl, ...homeEnv },
		promptTimeoutMs: 120_000,
	});

	eq("the command completes", (await session.prompt("/budget holiday")).status, "completed");
	const warned = await waitFor(
		() => notices(session!).some(notice => notice.level === "warning"),
		"the warning notice",
	);
	ok("a warning notice reaches the host", warned, notices(session));
	const warning = notices(session).find(notice => notice.level === "warning");
	eq("the notice level is warning", warning?.level, "warning");
	ok(
		"the notice is the period switch's provider warning",
		(warning?.message ?? "").includes("仅适用于当前 provider 为 DeepSeek"),
		warning?.message,
	);
	ok(
		"the notice names the run's own provider",
		(warning?.message ?? "").includes(`「${PROVIDER}」`) || (warning?.message ?? "").includes("无法取得"),
		warning?.message,
	);
	eq("the command made no model request", capture.arrivals().filter(kind => kind === "model").length, 0);
	const exit = await session.stop();
	eq("the run exits cleanly", exit.exitCode, 0);
} catch (error) {
	failed = true;
	console.error(error);
} finally {
	await session?.stop({ timeoutMs: 5_000 }).catch(() => undefined);
	capture.stop();
	runRoot.dispose();
	mkdirSync(OUT_DIR, { recursive: true });
	const allNotices = session === undefined ? [] : notices(session);
	writeFileSync(
		path.join(OUT_DIR, "notices.txt"),
		allNotices.map(notice => `[${String(notice.level)}] ${notice.message}`).join("\n"),
	);
	writeFileSync(
		path.join(OUT_DIR, "frames.jsonl"),
		session === undefined
			? ""
			: session
					.frames()
					.filter((frame: RpcFrame) => frame.type === "extension_ui_request")
					.map(frame => JSON.stringify(frame))
					.join("\n"),
	);
	writeFileSync(
		path.join(OUT_DIR, "report.json"),
		`${JSON.stringify(
			{
				harness: { version: harnessVersion, prefix: harnessPrefix },
				provider: MODEL_SELECTOR,
				checks,
				observedNotices: allNotices,
				humanAcceptance: "unconfirmed: ticket 14's human readability judgement",
			},
			null,
			2,
		)}\n`,
	);
	const failedChecks = checks.filter(check => !check.pass);
	console.log(`WARNING PROBE: ${checks.length - failedChecks.length}/${checks.length} checks passed`);
	if (failedChecks.length > 0 || failed) process.exitCode = 1;
}
