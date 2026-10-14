/**
 * model-cost's storage root in a running harness (P47, P51; S5).
 *
 * The dock materialises the recorded baseline install and loads this repository's own model-cost
 * entrypoint through the harness's real loader, in a session whose user home is an isolated
 * temporary directory — and the extension's own shipped `config.yaml`, which names
 * `~/cost-archive`, is what the storage root is resolved from. So what these cases observe is the
 * production path end to end: the framework read and validated the extension's configuration, the
 * factory resolved the storage root against the harness's user home, the one-time initialization
 * read the document at that root, and an unusable baseline was reported on the operator channel
 * while the file it could not read was left exactly as it was.
 *
 * The session is driven over RPC, which is also the whole point of the first prompt: the
 * framework's own contract is that the first model request waits for the extension's initialization
 * to settle, so a completed request is the evidence that the initialization — and its read — really
 * ran before anything else. The provider is the dock's own fixture, so no request leaves the
 * machine.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { type IsolatedHarness, REPO_ROOT, ensureIsolatedHarness, readBaselineRecord } from "./baseline";
import { type CaptureServer, startCaptureServer } from "./capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV, DOCK_MODEL_SELECTOR } from "./fixtures/extension-root/provider";
import { type RunRoot, createRunRoot } from "./run-root";
import { ControlledSession } from "./session";

const record = readBaselineRecord();
const PROVIDER_FIXTURE = path.join(import.meta.dir, "fixtures", "extension-root", "provider.ts");
/** The extension's own OMP entrypoint, as the harness's loader discovers it. */
const MODEL_COST_ENTRYPOINT = path.join(REPO_ROOT, "entrypoints", "omp", "model-cost.ts");

/** The document the extension keeps in its storage root. */
const CONSUMPTION_FILE = "consumption.json";

let harness: IsolatedHarness;

beforeAll(async () => {
	harness = await ensureIsolatedHarness(record);
});

/** One run's isolated home, and the storage root the shipped configuration names inside it. */
interface IsolatedHome {
	readonly home: string;
	readonly storageDirectory: string;
	readonly consumptionFile: string;
	/** The environment that makes the harness resolve `~/` here, and nowhere else. */
	readonly env: Record<string, string>;
}

/** The isolated user home one run uses: `<run root>/user-home`, with the OMP home inside it. */
function isolateHome(runRoot: RunRoot): IsolatedHome {
	const home = path.join(runRoot.path, "user-home");
	const storageDirectory = path.join(home, ".omp", "cost-archive");
	mkdirSync(storageDirectory, { recursive: true });
	return {
		home,
		storageDirectory,
		consumptionFile: path.join(storageDirectory, CONSUMPTION_FILE),
		env: {
			USERPROFILE: home,
			HOME: home,
			HOMEDRIVE: path.parse(home).root,
			HOMEPATH: home.slice(path.parse(home).root.length - 1),
		},
	};
}

/** One run: a session whose extension set and user home the case chose. */
async function startRun(label: string, home: IsolatedHome): Promise<{ session: ControlledSession; capture: CaptureServer; runRoot: RunRoot }> {
	const runRoot = createRunRoot(label);
	const capture = startCaptureServer({ dir: runRoot.captureDir });
	try {
		const session = await ControlledSession.start({
			harness,
			runRoot,
			extensions: [PROVIDER_FIXTURE, MODEL_COST_ENTRYPOINT],
			model: DOCK_MODEL_SELECTOR,
			env: { [DOCK_CAPTURE_BASE_URL_ENV]: capture.baseUrl, ...home.env },
			promptTimeoutMs: 60_000,
		});
		return { session, capture, runRoot };
	} catch (error) {
		capture.stop();
		runRoot.dispose();
		throw error;
	}
}

/** The operator notices one session emitted, as the harness itself framed them. */
function noticesOf(session: ControlledSession): ReadonlyArray<{ readonly level: unknown; readonly message: string }> {
	return session
		.frames()
		.filter(frame => frame.type === "extension_ui_request" && frame.method === "notify")
		.map(frame => ({ level: frame.notifyType, message: String(frame.message) }));
}

/** The notices one session published about the consumption store, as the contract describes them. */
function storageNotices(session: ControlledSession): ReadonlyArray<{ readonly level: unknown; readonly message: string }> {
	return noticesOf(session).filter(notice => notice.message.includes(CONSUMPTION_FILE));
}

describe("the consumption store in a real session (P47, P51)", () => {
	test("an unusable baseline is reported to the operator and the file is left exactly as it was", async () => {
		const runRoot = createRunRoot("model-cost-unusable");
		const home = isolateHome(runRoot);
		const broken = '{ "schemaVersion": 1, and then nothing';
		writeFileSync(home.consumptionFile, broken, "utf8");
		const run = await startRun("model-cost-unusable", home);
		try {
			// The first request is answered only after the extension's initialization settled, so its
			// completion is what makes the evidence below a read that really happened.
			const turn = await run.session.prompt("hello");
			expect(turn.status).toBe("completed");

			const notices = storageNotices(run.session);
			expect(notices).toHaveLength(1);
			// The notice names the file the shipped `~/cost-archive` resolved to inside the isolated
			// home, at the severity of an effect that did not happen, and it says consumption is paused.
			expect(notices[0]?.level).toBe("error");
			expect(notices[0]?.message).toContain(home.consumptionFile);
			expect(notices[0]?.message).toContain("暂停");
			// Nothing was guessed and nothing was overwritten: the root holds the same bytes it held,
			// and no temporary or lock artifact was left behind.
			expect(readFileSync(home.consumptionFile, "utf8")).toBe(broken);
			expect(readdirSync(home.storageDirectory)).toEqual([CONSUMPTION_FILE]);
		} finally {
			await run.session.stop({ timeoutMs: 10_000 });
			run.capture.stop();
			run.runRoot.dispose();
		}
	}, 120_000);

	test("a readable baseline is not rewritten, and an absent one is not created", async () => {
		const runRoot = createRunRoot("model-cost-baseline");
		const home = isolateHome(runRoot);
		const baseline = JSON.stringify({
			schemaVersion: 1,
			periodId: "dock-period",
			start: "2026-10-01T00:00:00.000Z",
			holiday: false,
			harnesses: {
				omp: {
					sessions: [
						{
							id: "dock-session",
							name: "已保存的会话",
							parent: null,
							saveVersion: 2,
							own: {
								deepseek: {
									"model-A": { tokens: { input: 1000, cacheRead: 0, cacheWrite: 0, output: 200 }, costCny: 0.01 },
								},
							},
						},
					],
				},
			},
		});
		writeFileSync(home.consumptionFile, baseline, "utf8");
		const run = await startRun("model-cost-baseline", home);
		try {
			expect((await run.session.prompt("hello")).status).toBe("completed");
			// A baseline the extension can read is read and nothing else: no notice, no rewrite.
			expect(storageNotices(run.session)).toEqual([]);
			expect(readFileSync(home.consumptionFile, "utf8")).toBe(baseline);
			expect(readdirSync(home.storageDirectory)).toEqual([CONSUMPTION_FILE]);
		} finally {
			await run.session.stop({ timeoutMs: 10_000 });
			run.capture.stop();
			run.runRoot.dispose();
		}
	}, 120_000);

	test("a root with no document is left without one: an empty start is not a save", async () => {
		const runRoot = createRunRoot("model-cost-fresh");
		const home = isolateHome(runRoot);
		rmSync(home.consumptionFile, { force: true });
		expect(existsSync(home.consumptionFile)).toBe(false);
		const run = await startRun("model-cost-fresh", home);
		try {
			expect((await run.session.prompt("hello")).status).toBe("completed");
			expect(storageNotices(run.session)).toEqual([]);
			// A fresh period is an in-memory baseline: the root is a place to save to, not a file to
			// create before anything was consumed.
			expect(existsSync(home.consumptionFile)).toBe(false);
			expect(readdirSync(home.storageDirectory)).toEqual([]);
		} finally {
			await run.session.stop({ timeoutMs: 10_000 });
			run.capture.stop();
			run.runRoot.dispose();
		}
	}, 120_000);
});
