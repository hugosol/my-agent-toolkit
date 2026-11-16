import { type InstalledOmp, resolveInstalledOmp } from "./installed-omp";
/** Real locally installed OMP coverage, with isolated agent state and controlled provider requests. */
import { beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { MODEL_COST_WIDGET_KEY } from "../../extensions/model-cost/harnesses/omp/widget";
import { writeProviderOverride } from "./agent-config";
import { REPO_ROOT } from "./baseline";
import { type CaptureServer, startCaptureServer } from "./capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV } from "./fixtures/extension-root/provider";
import { type RunRoot, createRunRoot } from "./run-root";
import { ControlledSession, type RpcFrame } from "./session";


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
 * 1000 non-cached input, 1000 cache reads, no cache writes and 1000 output — a cache hit rate of
 * 1000 of 2000, a whole 50 percent, hand-derived here.
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



interface DockRun {
	readonly session: ControlledSession;
	readonly capture: CaptureServer;
	readonly runRoot: RunRoot;
	readonly home: IsolatedHome;
}

async function startRun(label: string): Promise<DockRun> {
	const runRoot = createRunRoot(label);
	const home = isolateHome(runRoot);
	const capture = startCaptureServer({ dir: runRoot.captureDir, replyText: "dock viewed-total reply", usage: CAPTURE_USAGE });
	writeProviderOverride(runRoot.agentDir, PROVIDER, { baseUrl: capture.baseUrl, apiKey: "dock-key" });
	try {
		const session = await ControlledSession.start({
			harness: installed,
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

/** The effort the widget's own account line carries, if the host drew one. */
function shownEffort(session: ControlledSession): string | undefined {
	const line = shownLines(session)?.find(line => line.includes("Effort: "));
	// The level is no longer the end of its line: the monetary account row continues with the balance
	// and the accrued bar, and the level itself is the piece between `Effort: ` and the next separator.
	return line?.split("Effort: ")[1]?.split("  ")[0];
}

let installed: InstalledOmp;

beforeAll(async () => {
	installed = await resolveInstalledOmp();
}, 600_000);

describe("the widget's Effort reads the native session level on redraw (P11)", () => {
	test("a changed level is re-read by a budget redraw without another model request", async () => {
		const run = await startRun("viewed-total-effort");
		try {
			expect((await run.session.prompt("one effort exchange")).status).toBe("completed");
			expect(run.capture.requests()).toHaveLength(1);

			// The host's own fact, and the level the widget shows beside it: the same real level, and
			// not the question mark a fact it could not obtain would be.
			const before = await hostLevel(run.session);
			expect(typeof before).toBe("string");
			expect(shownEffort(run.session)).toBe(before as string);

			// The Total line is this run's own accounting: 1000/1000/0/1000 tokens of the endpoint's
			// wire payload, so a 50 percent cache hit rate, priced by the flash tier's holiday off-peak
			// 1/0.02/4 CNY per million — 0.00502 CNY, whose structure ratio is 20:1000:4000 of 5020,
			// displayed as 0:20:80. The four buckets' total is no column of the row any more (P23).
			const total = (shownLines(run.session) ?? []).find(line => line.startsWith("Total:"));
			expect(total).toBeDefined();
			expect(total).toContain("Cache: 50%");
			expect(total).toContain("Cost: \u00A50.0050");
			expect(total).toContain("\u00A5Cache/In/Out\uff1a0:20:80");

			// Native RPC changes the bound session's level, but does not publish the optional
			// viewed-session outlet or an extension-facing thinking-change notification. The extension's
			// own /budget detail command provides a real redraw: it must re-read the native getter,
			// not retain the previous effort or issue another model request.
			const levels = thinkingLevels(await run.session.request({ type: "get_available_thinking_levels" }));
			const chosen = levels.find(level => level !== before);
			if (chosen === undefined) throw new Error(`the run offered no thinking level other than ${String(before)}`);
			await run.session.request({ type: "set_thinking_level", level: chosen });
			expect(await hostLevel(run.session)).toBe(chosen);

			const framesBefore = widgetFrames(run.session).length;
			const redraw = await run.session.prompt("/budget detail");
			expect(redraw.status).toBe("completed");
			expect(redraw.agentInvoked).toBe(false);
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


