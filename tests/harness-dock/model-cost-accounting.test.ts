/**
 * Request accounting in a running harness (P1, P2, P4, P5, P6; S5).
 *
 * This is the isolated real-host smoke of the accounting's wiring: the dock materialises the recorded
 * baseline install, loads this repository's own model-cost entrypoint through the harness's real
 * loader, and drives a real session in an isolated home whose storage root the extension's own
 * shipped `config.yaml` names. A run either registers the dock's own provider fixture (an unknown
 * provider name, so the model is one this extension's data does not list) or points a built-in
 * provider's models at the dock's capture endpoint through the isolated agent state (`models.yml`) —
 * in both cases the request the extension classifies is a real request over a real transport that
 * never leaves the machine.
 *
 * What is observed here is the mode decision and the usage rule as the real host makes them
 * observable: the operator feedback a skipped request produces. A request the extension accounts (an
 * official monetary id) is *checked for reliable usage*, so one the endpoint reported no usage for —
 * and one it reported an explicit all-zero usage for, which this host cannot tell apart from its own
 * default — produces exactly one skip notice; a model the extension's data does not list is not
 * accounted at all and produces nothing, whatever the endpoint reported. That contrast is what makes
 * the notice evidence of the real wiring rather than decoration.
 *
 * The reliable priced request also proves its own persisted usage and positive monetary contribution
 * after the host closes the session. Exact pricing rules and accumulation are covered separately in
 * `tests/model-cost/foundation/session/request-accounting.test.ts` with a self-made data set, and the
 * maintained data in the maintenance smoke (`scripts/model-cost-data-smoke.ts`).
 *
 * The Round *end* this host produces is observed in `tests/harness-dock/round-facts.test.ts`: a real
 * session's settle is an end candidate the framework confirms on the host's own next task, so a run
 * driven over RPC really does reach the round-end save. The gap this file's earlier revision
 * recorded — the adapter deciding the end at the native run end, where the session is not yet
 * settled, so no Round end was ever reached — is closed by that synthesis; see that suite and the
 * ticket's evidence note.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { writeProviderOverride } from "./agent-config";
import { type IsolatedHarness, REPO_ROOT, ensureIsolatedHarness, readBaselineRecord } from "./baseline";
import { type CaptureServer, startCaptureServer } from "./capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV, DOCK_MODEL_SELECTOR } from "./fixtures/extension-root/provider";
import { type RunRoot, createRunRoot } from "./run-root";
import { ControlledSession } from "./session";

const record = readBaselineRecord();
/** The extension's own OMP entrypoint, as the harness's loader discovers it. */
const MODEL_COST_ENTRYPOINT = path.join(REPO_ROOT, "entrypoints", "omp", "model-cost.ts");
/** The dock's own provider fixture: an unknown provider name, whose model this extension does not list. */
const PROVIDER_FIXTURE = path.join(import.meta.dir, "fixtures", "extension-root", "provider.ts");

/** The document the extension keeps in its storage root. */
const CONSUMPTION_FILE = "consumption.json";

/** The usage the capture endpoint reports, as the wire numbers it sends. */
const CAPTURE_USAGE = { input: 10, output: 7, cacheRead: 3 };

let harness: IsolatedHarness;

beforeAll(async () => {
	harness = await ensureIsolatedHarness(record);
});

/** One run's isolated home and the storage root the shipped configuration names inside it. */
interface IsolatedHome {
	readonly home: string;
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
		consumptionFile: path.join(storageDirectory, CONSUMPTION_FILE),
		env: {
			USERPROFILE: home,
			HOME: home,
			HOMEDRIVE: path.parse(home).root,
			HOMEPATH: home.slice(path.parse(home).root.length - 1),
		},
	};
}

/** The model one run uses: the selector, and the built-in provider it must redirect when it has one. */
interface RunModel {
	readonly selector: string;
	/** The built-in provider whose catalog models the isolated agent state points at the endpoint. */
	readonly override?: string;
}

/** One provisioned run: the session, the capture endpoint behind it and the isolated root. */
interface DockRun {
	readonly session: ControlledSession;
	readonly capture: CaptureServer;
	readonly runRoot: RunRoot;
	readonly home: IsolatedHome;
}

/**
 * One run. `usage` omitted means the capture endpoint reports no usage at all, which is what a real
 * endpoint that reports nothing does; the model's own provider is redirected when the model names a
 * built-in one, and the dock's fixture provider is loaded either way.
 */
async function startRun(
	label: string,
	model: RunModel,
	usage: { readonly input: number; readonly output: number; readonly cacheRead: number } | undefined,
): Promise<DockRun> {
	const runRoot = createRunRoot(label);
	const home = isolateHome(runRoot);
	const capture = startCaptureServer({
		dir: runRoot.captureDir,
		replyText: "dock model-cost reply",
		...(usage === undefined ? {} : { usage }),
	});
	if (model.override !== undefined) {
		writeProviderOverride(runRoot.agentDir, model.override, { baseUrl: capture.baseUrl, apiKey: "dock-key" });
	}
	try {
		const session = await ControlledSession.start({
			harness,
			runRoot,
			extensions: [PROVIDER_FIXTURE, MODEL_COST_ENTRYPOINT],
			model: model.selector,
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

/** The operator notices one session emitted, as the harness itself framed them. */
function noticesOf(session: ControlledSession): ReadonlyArray<{ readonly level: unknown; readonly message: string }> {
	return session
		.frames()
		.filter(frame => frame.type === "extension_ui_request" && frame.method === "notify")
		.map(frame => ({ level: frame.notifyType, message: String(frame.message) }));
}

describe("a real request reaches the accounting with the host's own facts (P1, P2, P6)", () => {
	test("an official monetary request the endpoint reported no usage for is skipped with a warning", async () => {
		const run = await startRun(
			"model-cost-monetary",
			{ selector: "deepseek/deepseek-flash", override: "deepseek" },
			undefined,
		);
		try {
			expect((await run.session.prompt("one exchange without a usage reading")).status).toBe("completed");
			// The request really went out and really reached the capture endpoint.
			expect(run.capture.requests()).toHaveLength(1);

			// The extension classified it as an accounted (monetary) request and found no reliable usage,
			// so the operator is told the consumption was skipped — a skipped request is not a free one.
			const notices = noticesOf(run.session);
			expect(notices).toHaveLength(1);
			expect(notices[0]?.level).toBe("warning");
			expect(notices[0]?.message).toContain("没有可靠的 usage");
			expect(run.session.stderr()).not.toContain("缺适用价格");
		} finally {
			await disposeRun(run);
		}
	}, 240_000);

	test("a model the data does not list is not accounted at all, and says nothing", async () => {
		// The dock's own provider fixture: a provider this extension's data does not name, so the pair
		// is unaccounted however the endpoint answered — the same missing usage produces no notice.
		const run = await startRun("model-cost-hidden", { selector: DOCK_MODEL_SELECTOR }, undefined);
		try {
			expect((await run.session.prompt("one unlisted exchange")).status).toBe("completed");
			expect(run.capture.requests()).toHaveLength(1);
			expect(noticesOf(run.session)).toEqual([]);
		} finally {
			await disposeRun(run);
		}
	}, 240_000);

	test("a request with a reliable usage and an applicable price is accounted silently", async () => {
		const run = await startRun("model-cost-usage", { selector: "deepseek/deepseek-flash", override: "deepseek" }, CAPTURE_USAGE);
		try {
			expect((await run.session.prompt("one priced exchange")).status).toBe("completed");
			// The RPC prompt answers before the asynchronous Round-end save finishes. Observe its
			// actual publication before closing stdin: process exit is not a save-completion barrier.
			const deadline = Date.now() + 15_000;
			while (!existsSync(run.home.consumptionFile)) {
				if (Date.now() > deadline) {
					throw new Error(`no consumption document was published at ${run.home.consumptionFile}; stderr: ${run.session.stderr()}`);
				}
				const nextTurn = Promise.withResolvers<void>();
				setImmediate(nextTurn.resolve);
				await nextTurn.promise;
			}
			expect((await run.session.stop()).exitCode).toBe(0);
			expect(run.capture.requests()).toHaveLength(1);
			const document = JSON.parse(readFileSync(run.home.consumptionFile, "utf8")) as {
				harnesses: Record<string, { sessions: Array<{
					own: Record<string, Record<string, { tokens: Record<string, number>; costCny?: number }>>;
				}> }>;
			};
			const sessions = Object.values(document.harnesses).flatMap(bucket => bucket.sessions);
			expect(sessions).toHaveLength(1);
			const accounted = sessions[0]?.own.deepseek?.["deepseek-flash"];
			// Wire prompt_tokens includes cache reads: ten total input minus three cached.
			expect(accounted?.tokens).toEqual({ input: 7, cacheRead: 3, cacheWrite: 0, output: 7 });
			// Both peak and off-peak maintained prices are positive; this wiring test need not
			// freeze the wall-clock price or duplicate the maintained-data pricing oracle.
			expect(accounted?.costCny).toBeGreaterThan(0);
			// Nothing was skipped and no price was missing, so nothing is reported: the amount the
			// extension's own data states is applied without an operator notice.
			expect(noticesOf(run.session)).toEqual([]);
			expect(run.session.stderr()).not.toContain("没有可靠的 usage");
			expect(run.session.stderr()).not.toContain("缺适用价格");
		} finally {
			await disposeRun(run);
		}
	}, 240_000);

	test("an all-zero usage the endpoint reported is still no reliable reading, and is skipped the same way", async () => {
		// The endpoint answers with an explicit all-zero terminal usage chunk. What the host's own
		// assistant message carries is an all-zero usage object either way — the identical fact an
		// endpoint that sent no chunk at all produces — so this host cannot tell a reported zero from
		// its own default, and no reading is reported for it rather than a zero to be priced.
		const run = await startRun(
			"model-cost-zero-usage",
			{ selector: "deepseek/deepseek-flash", override: "deepseek" },
			{ input: 0, output: 0, cacheRead: 0 },
		);
		try {
			expect((await run.session.prompt("one exchange the endpoint reported zero usage for")).status).toBe("completed");
			expect(run.capture.requests()).toHaveLength(1);

			const notices = noticesOf(run.session);
			expect(notices).toHaveLength(1);
			expect(notices[0]?.level).toBe("warning");
			expect(notices[0]?.message).toContain("没有可靠的 usage");
			expect(run.session.stderr()).not.toContain("缺适用价格");
		} finally {
			await disposeRun(run);
		}
	}, 240_000);
});
