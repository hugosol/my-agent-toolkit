/**
 * Ticket 12 — model-cost's real presentation on the patched OMP host (temporary actual-path
 * smoke, also the P48 capture material).
 *
 * The run loads the repository's own model-cost entrypoint, copied verbatim into a run-local
 * deployment, into the frozen viewed-session artifact. Its provider is redirected to the dock's
 * local capture endpoint, its storage root is a run-local user home, and the widget lines below
 * are what the host was actually told to draw (`setWidget` frames), not a rendering derived from
 * the extension's functions.
 *
 * It captures, in order: the `/budget` help notice, the `/budget detail` action notice, and the
 * widget after one priced exchange — the accounted amount, the fixed budget, the cache ratio and
 * the balance line. The content and placement fields are checked here; whether the result is
 * readable is ticket 14's human judgment.
 *
 * Usage: bun .scratch/framework-capability-cutover/evidence/12-omp-real-entry-regression/probes/model-cost-presentation-smoke.ts
 * Output: probes/out/model-cost-presentation/{report.json,frames.jsonl,widget.txt,notices.txt}
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { MODEL_COST_WIDGET_KEY } from "../../../../../extensions/model-cost/harnesses/omp/widget";
import { writeProviderOverride } from "../../../../../tests/harness-dock/agent-config";
import { REPO_ROOT, readBaselineRecord } from "../../../../../tests/harness-dock/baseline";
import { ensureViewedSessionHarness } from "../../../../../tests/harness-dock/viewed-session-harness";
import { type CaptureServer, startCaptureServer } from "../../../../../tests/harness-dock/capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV } from "../../../../../tests/harness-dock/fixtures/extension-root/provider";
import { type RunRoot, createRunRoot } from "../../../../../tests/harness-dock/run-root";
import { ControlledSession, type RpcFrame } from "../../../../../tests/harness-dock/session";

const OUT_DIR = path.join(import.meta.dir, "out", "model-cost-presentation");
const DEPLOYMENT_ROOT = path.join(REPO_ROOT, ".cache", "ticket12-probes");
const PROVIDER = "deepseek";
const MODEL = "deepseek-flash";
const MODEL_SELECTOR = `${PROVIDER}/${MODEL}`;
const DOCK_CREDENTIAL = "dock-key";
const CONSUMPTION_FILE = "consumption.json";
/** The endpoint's scripted wire usage; every amount below is derived from these literals. */
const CAPTURE_USAGE = { input: 2000, output: 1000, cacheRead: 1000 };
const BALANCE_TOTAL = "110.00";
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

function includes(name: string, actual: string, expected: string): void {
	ok(name, actual.includes(expected), actual);
}

function materializeDeployment(label: string): string {
	const root = path.join(DEPLOYMENT_ROOT, label);
	rmSync(root, { recursive: true, force: true });
	mkdirSync(root, { recursive: true });
	for (const relative of ["adapters", "framework", "extensions/model-cost", "entrypoints/omp"]) {
		cpSync(path.join(REPO_ROOT, relative), path.join(root, relative), { recursive: true });
	}
	// The production source runs verbatim; the example framework configuration (its proxy table)
	// is absent, so the run cannot reach a machine-configured proxy.
	rmSync(path.join(root, "framework", "config.yaml"), { force: true });
	return root;
}

function widgetFrames(session: ControlledSession): readonly RpcFrame[] {
	return session
		.frames()
		.filter(
			frame =>
				frame.type === "extension_ui_request" &&
				frame.method === "setWidget" &&
				frame.widgetKey === MODEL_COST_WIDGET_KEY,
		);
}

function shownLines(session: ControlledSession): readonly string[] | undefined {
	const shown = widgetFrames(session).filter(frame => frame.widgetLines !== undefined);
	const lines = shown[shown.length - 1]?.widgetLines;
	return Array.isArray(lines) ? (lines as string[]) : undefined;
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

const runRoot: RunRoot = createRunRoot("ticket12-model-cost-presentation");
const home = path.join(runRoot.path, "user-home");
const storage = path.join(home, ".omp", "cost-archive");
mkdirSync(storage, { recursive: true });
const consumptionFile = path.join(storage, CONSUMPTION_FILE);
writeFileSync(
	consumptionFile,
	JSON.stringify({
		schemaVersion: 1,
		periodId: "period-ticket12",
		start: "2026-10-01T00:00:00.000Z",
		holiday: true,
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
const capture: CaptureServer = startCaptureServer({
	dir: runRoot.captureDir,
	replyText: "dock ticket 12 reply",
	usage: CAPTURE_USAGE,
	balance: { total: BALANCE_TOTAL },
});
writeProviderOverride(runRoot.agentDir, PROVIDER, { baseUrl: capture.baseUrl, apiKey: DOCK_CREDENTIAL });
let session: ControlledSession | undefined;
let harnessVersion = "<not materialised>";
let harnessPrefix = "<none>";
let failed = false;

try {
	const harness = await ensureViewedSessionHarness(readBaselineRecord());
	harnessVersion = harness.version;
	harnessPrefix = harness.prefix;
	const deployment = materializeDeployment("model-cost-presentation");
	session = await ControlledSession.start({
		harness,
		runRoot,
		extensions: [path.join(deployment, "entrypoints", "omp", "model-cost.ts")],
		model: MODEL_SELECTOR,
		env: { [DOCK_CAPTURE_BASE_URL_ENV]: capture.baseUrl, ...homeEnv },
		promptTimeoutMs: 120_000,
	});

	// The command's own action surface, on the real UI channel: empty argument -> info help.
	eq("/budget help completes", (await session.prompt("/budget")).status, "completed");
	await waitFor(() => notices(session!).some(notice => notice.message.includes("detail")), "the budget help");
	const help = notices(session).find(notice => notice.message.includes("detail"));
	eq("the help notice is info", help?.level, "info");
	includes("the help names the detail action", help?.message ?? "", "detail");
	includes("the help names the clear action", help?.message ?? "", "clear");
	observations.help = help;

	// A real priced exchange: the endpoint answers with the scripted usage, and the brief widget
	// draws the accounted amount, the fixed budget, the cache ratio and the prefetched balance.
	eq("the priced exchange completes", (await session.prompt("one priced exchange")).status, "completed");
	const reached = await waitFor(
		() => (shownLines(session!) ?? []).join("\n").includes("Balance:"),
		"the drawn budget line",
	);
	ok("the widget carries the balance line", reached, shownLines(session));
	const briefLines = shownLines(session) ?? [];
	const brief = briefLines.join("\n");
	includes("the accounted amount is drawn", brief, "Cost: \u00A50.0050");
	includes("the fixed budget is drawn", brief, "450.0K");
	includes("the cache ratio is drawn", brief, "Cache: 50%");
	includes("the fee structure is drawn", brief, "\u00A5Cache/In/Out\uFF1A0:20:80");
	includes("the balance reading is drawn", brief, "\u{1F4B0} Balance: \u00A5110.00");
	eq("the brief layout is the header and Round rows", briefLines.length, 3);
	includes("the first line carries the budget and effort", briefLines[0] ?? "", "Effort:");
	includes("the second line carries the labelled total row", briefLines[1] ?? "", "Total:");
	includes("the third line carries the Round row", briefLines[2] ?? "", "Round:");
	observations.briefLines = briefLines;

	// A declared action: the presentation switches to detail and says so; the next exchange draws
	// the same totals plus the per-model tree.
	eq("/budget detail completes", (await session.prompt("/budget detail")).status, "completed");
	await waitFor(() => notices(session!).some(notice => notice.message.includes("展示已切换为详细")), "the detail notice");
	const detailNotice = notices(session).find(notice => notice.message.includes("展示已切换为详细"));
	eq("the detail notice is info", detailNotice?.level, "info");
	observations.detailNotice = detailNotice;
	eq("the detail-mode exchange completes", (await session.prompt("one priced exchange in detail")).status, "completed");
	await waitFor(
		() => (shownLines(session!) ?? []).some(line => line.includes("deepseek / deepseek-flash")),
		"the detail tree",
	);
	const detailLines = shownLines(session) ?? [];
	const detail = detailLines.join("\n");
	ok("the detail total carries both accounted exchanges", /Cost:\s+\u00A50\.01(?!\d)/.test(detail), detailLines[1]);
	includes("the detail tree names the model and its amount", detail, "\u2502  deepseek / deepseek-flash");
	includes("the detail tree keeps the fee structure", detail, "\u00A5Cache/In/Out\uFF1A0:20:80");
	ok("the detail layout adds the tree rows", detailLines.length > briefLines.length, detailLines);
	observations.detailLines = detailLines;
	observations.widgetPlacement = widgetFrames(session).filter(frame => frame.widgetLines !== undefined).at(-1)?.widgetPlacement;
	observations.widgetKeys = [...new Set(widgetFrames(session).map(frame => frame.widgetKey))];
	ok("the widget uses the extension's one key", observations.widgetKeys.length === 1, observations.widgetKeys);
	// The extension sets its widget without a placement: the host's default seat is the layout, and
	// the marker area is the one widget this repository places explicitly (`aboveEditor`, probe 1).
	ok(
		"the extension leaves placement to the host default",
		observations.widgetPlacement === undefined,
		observations.widgetPlacement,
	);

	// The initialization happened before the first model request (balance, then model), and the
	// saved document was written by the same real run.
	eq("the balance query was answered before the first model request", capture.arrivals(), ["balance", "model", "model"]);
	eq("exactly one balance query answered the prefetch", capture.balanceCalls().length, 1);
	observations.arrivals = capture.arrivals();
	interface SavedDocument {
		readonly harnesses?: Record<
			string,
			{
				readonly sessions?: ReadonlyArray<{
					readonly saveVersion?: number;
					readonly own?: Record<string, Record<string, { readonly tokens?: unknown; readonly costCny?: number }>>;
				}>;
			}
		>;
	}
	const readSaved = (): SavedDocument => JSON.parse(readFileSync(consumptionFile, "utf8")) as SavedDocument;
	const saved = await waitFor(
		() =>
			Object.values(readSaved().harnesses ?? {})
				.flatMap(bucket => bucket.sessions ?? [])
				.some(candidate => (candidate.own?.[PROVIDER]?.[MODEL]?.tokens as { readonly input?: number } | undefined)?.input === 2000),
		"the saved document",
	);
	ok("the run saved its consumption document", saved, consumptionFile);
	const savedSessions = Object.values(readSaved().harnesses ?? {}).flatMap(bucket => bucket.sessions ?? []);
	const savedSession = savedSessions.find(
		candidate => (candidate.own?.[PROVIDER]?.[MODEL]?.tokens as { readonly input?: number } | undefined)?.input === 2000,
	);
	eq("the saved session holds both scripted requests' four buckets", savedSession?.own?.[PROVIDER]?.[MODEL]?.tokens, {
		input: 2000,
		cacheRead: 2000,
		cacheWrite: 0,
		output: 2000,
	});
	observations.savedSession = savedSession;

	const exit = await session.stop();
	eq("the run exits cleanly", exit.exitCode, 0);
	observations.exitCode = exit.exitCode;
	observations.stderr = exit.stderr;
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
		writeFileSync(
			path.join(OUT_DIR, "frames.jsonl"),
			session
				.frames()
				.filter(frame => frame.type === "extension_ui_request")
				.map(frame => JSON.stringify(frame))
				.join("\n"),
		);
		writeFileSync(
			path.join(OUT_DIR, "widget.txt"),
			widgetFrames(session)
				.map((frame, index) => {
					const lines = Array.isArray(frame.widgetLines) ? frame.widgetLines : [];
					return `--- render ${index + 1} (${String(frame.widgetPlacement)})\n${lines.join("\n")}`;
				})
				.join("\n"),
		);
		writeFileSync(
			path.join(OUT_DIR, "notices.txt"),
			notices(session)
				.map(notice => `[${String(notice.level)}] ${notice.message}`)
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
	console.log(`model-cost presentation smoke: ${checks.length - failures} pass / ${failures} fail`);
	console.log(`output: ${OUT_DIR}`);
	if (failures > 0 || failed) process.exitCode = 1;
}
