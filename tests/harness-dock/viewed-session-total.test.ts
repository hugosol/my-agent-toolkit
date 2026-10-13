/**
 * The real host's Effort and Total, read off the extension's own widget (P11, P21, P22; S5).
 *
 * These runs are the model-cost entrypoint loaded into the *frozen* patched host — the
 * `omp-18.5.0-viewed-session` artifact ticket 01 materialised, whose public viewed-session outlet is
 * the only source these facts have. What they establish is the half a controlled double cannot: that
 * on the real host the widget's Effort really is the session's *actual effective* thinking level,
 * delivered through that outlet, that a change of it is re-read without the extension asking the
 * provider for anything, and that a model with no settable effort is displayed as `?` rather than as
 * a configured intent. The Total line beside it is the same run's own accounted consumption.
 *
 * Every model is reached through the dock's own capture endpoint, so no run needs a credential and
 * nothing leaves the machine; the usage the endpoint reports is what the Total's figures are
 * hand-derived from. Nothing here is a formal installation: the run's own agent state, session
 * directory, working directory and storage root all sit inside its temporary run root.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { MODEL_COST_WIDGET_KEY } from "../../extensions/model-cost/harnesses/omp/widget";
import { writeProviderOverride } from "./agent-config";
import { type IsolatedHarness, REPO_ROOT, readBaselineRecord } from "./baseline";
import { type CaptureServer, startCaptureServer } from "./capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV } from "./fixtures/extension-root/provider";
import { type RunRoot, createRunRoot } from "./run-root";
import { ControlledSession, type RpcFrame } from "./session";
import { ensureViewedSessionHarness } from "./viewed-session-harness";

const record = readBaselineRecord();
/** The extension's own OMP entrypoint, as the harness's loader discovers it. */
const MODEL_COST_ENTRYPOINT = path.join(REPO_ROOT, "entrypoints", "omp", "model-cost.ts");
/** The provider the extension's own data prices in CNY, redirected to the local capture endpoint. */
const PROVIDER = "deepseek";
const MODEL = "deepseek-flash";
const MODEL_SELECTOR = `${PROVIDER}/${MODEL}`;
/** The document the extension keeps in its storage root. */
const CONSUMPTION_FILE = "consumption.json";

/**
 * The usage the capture endpoint reports, as the wire numbers it sends: 2000 prompt tokens, 1000 of
 * them served from the prompt cache, and 1000 completion tokens.
 *
 * The protocol's `prompt_tokens` counts the cached ones, so the reading the extension accounts is
 * 1000 non-cached input, 1000 cache reads, no cache writes and 1000 output — a Sum of 3,000 and a
 * cache hit rate of 1000 of 2000, a whole 50 percent, both hand-derived here.
 */
const CAPTURE_USAGE = { input: 2000, output: 1000, cacheRead: 1000 };

/** One run's isolated home and the storage root the extension's shipped configuration names in it. */
interface IsolatedHome {
	readonly home: string;
	readonly consumptionFile: string;
	readonly env: Record<string, string>;
}

function isolateHome(runRoot: RunRoot): IsolatedHome {
	const home = path.join(runRoot.path, "user-home");
	const storageDirectory = path.join(home, ".omp", "cost-archive");
	mkdirSync(storageDirectory, { recursive: true });
	writeFileSync(
		path.join(storageDirectory, CONSUMPTION_FILE),
		JSON.stringify({
			schemaVersion: 1,
			periodId: "period-viewed-total",
			start: "2026-10-01T00:00:00.000Z",
			// A holiday period, because DeepSeek bills one off-peak all day: the amount this run
			// accounts is then the same figure whatever the wall clock says when it goes out.
			holiday: true,
			harnesses: { omp: { sessions: [] } },
		}),
		"utf8",
	);
	return {
		home,
		consumptionFile: path.join(storageDirectory, CONSUMPTION_FILE),
		env: {
			USERPROFILE: home,
			HOME: home,
			HOMEDRIVE: path.parse(home).root,
			HOMEPATH: home.slice(path.parse(home).root.length - 1),
		},
	};
}

/** One instance's own model definition, as this file writes it into the run's `models.yml`. */
interface RunModel {
	readonly reasoning: boolean;
	readonly contextWindow?: number;
}

/**
 * Point the provider at the capture endpoint, optionally replacing its model definitions with this
 * run's own so a case can state whether the model really has a settable effort.
 */
function writeRunModels(agentDir: string, baseUrl: string, model: RunModel | undefined): void {
	if (model === undefined) {
		writeProviderOverride(agentDir, PROVIDER, { baseUrl, apiKey: "dock-key" });
		return;
	}
	mkdirSync(agentDir, { recursive: true });
	const lines = [
		"providers:",
		`  ${JSON.stringify(PROVIDER)}:`,
		`    baseUrl: ${JSON.stringify(baseUrl)}`,
		'    apiKey: "dock-key"',
		"    api: \"openai-completions\"",
		"    models:",
		`      - id: ${JSON.stringify(MODEL)}`,
		'        name: "Dock Flash"',
		'        api: "openai-completions"',
		`        reasoning: ${String(model.reasoning)}`,
		'        input: ["text"]',
		`        contextWindow: ${model.contextWindow ?? 64_000}`,
		"        maxTokens: 8192",
	];
	writeFileSync(path.join(agentDir, "models.yml"), `${lines.join("\n")}\n`, "utf8");
}

interface DockRun {
	readonly session: ControlledSession;
	readonly capture: CaptureServer;
	readonly runRoot: RunRoot;
	readonly home: IsolatedHome;
}

async function startRun(label: string, model: RunModel | undefined): Promise<DockRun> {
	const runRoot = createRunRoot(label);
	const home = isolateHome(runRoot);
	const capture = startCaptureServer({ dir: runRoot.captureDir, replyText: "dock viewed-total reply", usage: CAPTURE_USAGE });
	writeRunModels(runRoot.agentDir, capture.baseUrl, model);
	try {
		const session = await ControlledSession.start({
			harness: patched,
			runRoot,
			extensions: [MODEL_COST_ENTRYPOINT],
			model: MODEL_SELECTOR,
			env: { [DOCK_CAPTURE_BASE_URL_ENV]: capture.baseUrl, ...home.env },
			promptTimeoutMs: 120_000,
		});
		return { session, capture, runRoot, home };
	} catch (error) {
		capture.stop();
		runRoot.dispose();
		throw error;
	}
}

async function disposeRun(run: DockRun): Promise<void> {
	try {
		if (run.session.exited() === null) await run.session.stop({ timeoutMs: 15_000 });
	} catch {
		// The session already stopped (or never started); the rest of the run still gets cleaned up.
	}
	run.capture.stop();
	run.runRoot.dispose();
}

/** The extension's own usage-widget frames this host emitted, in order. */
function widgetFrames(session: ControlledSession): RpcFrame[] {
	return session
		.frames()
		.filter(
			frame =>
				frame.type === "extension_ui_request" &&
				frame.method === "setWidget" &&
				frame.widgetKey === MODEL_COST_WIDGET_KEY,
		);
}

/** The lines of the last widget the host was told to show, or nothing when it was cleared. */
function shownLines(session: ControlledSession): string[] | undefined {
	const shown = widgetFrames(session).filter(frame => frame.widgetLines !== undefined);
	const last = shown[shown.length - 1];
	return last === undefined ? undefined : (last.widgetLines as string[]);
}

/** One RPC payload as an object, when it really is one. */
function payloadRecord(frame: RpcFrame): Record<string, unknown> {
	const data = frame.data;
	return data !== null && typeof data === "object" ? (data as Record<string, unknown>) : {};
}

/** The thinking levels the host itself listed for the running model. */
function thinkingLevels(frame: RpcFrame): string[] {
	const levels = payloadRecord(frame).levels;
	return Array.isArray(levels) ? levels.filter((level): level is string => typeof level === "string") : [];
}

/** The host's own current thinking level, as it reports it. */
async function hostLevel(session: ControlledSession): Promise<string | undefined> {
	const level = payloadRecord(await session.request({ type: "get_state" })).thinkingLevel;
	return typeof level === "string" ? level : undefined;
}

/** The effort the widget's own budget line carries, if the host drew one. */
function shownEffort(session: ControlledSession): string | undefined {
	const lines = shownLines(session);
	return lines?.find(line => line.includes("Effort: "))?.split("Effort: ")[1];
}

let patched: IsolatedHarness;

beforeAll(async () => {
	patched = await ensureViewedSessionHarness(record);
}, 600_000);

describe("the widget's Effort is the host's actual level, re-read when it changes (P11)", () => {
	test("a real level is displayed, and a same-target change is read again without another request", async () => {
		const run = await startRun("viewed-total-effort", undefined);
		try {
			expect((await run.session.prompt("one effort exchange")).status).toBe("completed");
			expect(run.capture.requests()).toHaveLength(1);

			// The host's own fact, and the level the widget shows beside it: the same real level, and
			// not the question mark a fact it could not obtain would be.
			const before = await hostLevel(run.session);
			expect(typeof before).toBe("string");
			expect(shownEffort(run.session)).toBe(before as string);

			// The Total line is this run's own accounting: 1000/1000/0/1000 tokens of the endpoint's
			// wire payload, so a Sum of 3,000 and a 50 percent cache hit rate, priced by the flash
			// tier's holiday off-peak 1/0.02/4 CNY per million — 0.00502 CNY, whose structure ratio is
			// 20:1000:4000 of 5020, displayed as 0:20:80.
			const total = (shownLines(run.session) ?? []).find(line => line.startsWith("Total:"));
			expect(total).toBeDefined();
			expect(total).toContain("Cache: 50%");
			expect(total).toContain("Sum: 3,000");
			expect(total).toContain("Cost: \u00A50.0050");
			expect(total).toContain("\u00A5Cache/In/Out\uff1a0:20:80");

			// The session's own thinking level changes: the host's `thinking_level_changed` reaches the
			// widget through the public outlet, and the next draw carries the new level — with no model
			// request and no accounting change behind it.
			const levels = thinkingLevels(await run.session.request({ type: "get_available_thinking_levels" }));
			const chosen = levels.find(level => level !== before);
			if (chosen === undefined) throw new Error(`the run offered no thinking level other than ${String(before)}`);
			const framesBefore = widgetFrames(run.session).length;
			await run.session.request({ type: "set_thinking_level", level: chosen });

			expect(await hostLevel(run.session)).toBe(chosen);
			expect(shownEffort(run.session)).toBe(chosen);
			expect(widgetFrames(run.session).length).toBeGreaterThan(framesBefore);
			expect(run.capture.requests()).toHaveLength(1);
			// The rest of the line is the same accounting it was: the change was a fact of the session,
			// not a new Turn.
			expect((shownLines(run.session) ?? []).find(line => line.startsWith("Total:"))).toBe(total as string);
		} finally {
			await disposeRun(run);
		}
	}, 300_000);
});

describe("a model with no settable effort is displayed as a question mark (P11)", () => {
	test("the widget says ? rather than borrowing a configured or default level", async () => {
		const run = await startRun("viewed-total-no-effort", { reasoning: false });
		try {
			expect((await run.session.prompt("one plain exchange")).status).toBe("completed");
			expect(run.capture.requests()).toHaveLength(1);

			// The host reports no thinking level for a model that cannot think, and the widget says so
			// instead of filling the field from anywhere else. The model is still one this extension
			// displays: its budget bar and its Total are drawn around the question mark.
			expect(await hostLevel(run.session)).toBeUndefined();
			const lines = shownLines(run.session) ?? [];
			expect(lines.some(line => line.includes("Effort: ?"))).toBe(true);
			expect(lines.some(line => line.includes("450.0K"))).toBe(true);
			expect(lines.some(line => line.startsWith("Total:"))).toBe(true);
		} finally {
			await disposeRun(run);
		}
	}, 300_000);
});
