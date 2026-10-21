/**
 * The Harness's own exit, and the unregister an exit races (P27).
 *
 * A longer configured request budget buys a request more time to be answered. It must not buy the
 * *harness* more time to stay alive: nothing in this extension waits for a request to drain when the
 * session it belongs to is going away, so a run whose dependency is still holding an answer ends on
 * the harness's own lifecycle, and the unregister it left on the wire stays best-effort — whether the
 * panel received it is a fact to be observed and reported, never assumed from the attempt.
 *
 * The run is the real thing on both sides of the seam. The harness is the isolated install this
 * repository's acceptance runs use (`tests/harness-dock/session.ts`), started as a real RPC session; the
 * extension is the repository's own `framework/` and `extensions/connect-bot/` source, copied
 * verbatim into the run's own deployment directory so that the run's own `config.yaml` — a minute
 * long budget, which no test can wait out — is the file the binding reads. Copying is not editing:
 * the module the loader binds is the module this repository ships, and the extension derives the
 * repository its configuration lives in from its own module location, so this is the only way a run
 * can name a budget of its own without touching the file the machine's deployment reads.
 *
 * The dependency that does not answer promptly is `support/response-timing-adapter.ts`: a real HTTP
 * service in front of the actual herdr-bot panel, which holds the `unregister` it receives. So the
 * register the arm sends really registers a row on a real panel, and the unregister the `off` sends is
 * really on the wire with its answer withheld when the process ends.
 *
 * The observation is the exit itself. An exit path that waited for the outstanding request could not
 * end before that request's budget ran out — a minute away — so `exit.timedOut === false` with the
 * process ending well inside {@link EXIT_BUDGET_MS} *while* a minute-budget request is provably in
 * flight is what tells "ended on its own lifecycle" apart from "waited for the request". What the
 * panel received is then reported as it stands: no removal is its evidence, and the attempt is known
 * only from the dependency's own receipt.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { type IsolatedHarness, REPO_ROOT, ensureIsolatedHarness, readBaselineRecord } from "../harness-dock/baseline";
import { type CaptureServer, startCaptureServer } from "../harness-dock/capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV, DOCK_MODEL_SELECTOR } from "../harness-dock/fixtures/extension-root/provider";
import { type RunRoot, createRunRoot } from "../harness-dock/run-root";
import { ControlledSession } from "../harness-dock/session";
import { type HerdrBotPanel, startHerdrBot } from "./support/herdr-bot";
import { startResponseTimingAdapter } from "./support/response-timing-adapter";

/** This run's own request budget: long enough that waiting it out would be unmistakable. */
const LONG_BUDGET_MS = 60_000;
/** What the harness may take to end before this run reports that its exit was held up by a request. */
const EXIT_BUDGET_MS = 15_000;
/** The credential-free provider fixture; it keeps the session's model resolution off the network. */
const PROVIDER_FIXTURE = path.join(REPO_ROOT, "tests", "harness-dock", "fixtures", "extension-root", "provider.ts");

let harness: IsolatedHarness;

beforeAll(async () => {
	harness = await ensureIsolatedHarness(readBaselineRecord());
}, 300_000);

/** The root of the deployment copies this suite materialises, removed once the suite is done. */
const DEPLOYMENT_ROOT = path.join(REPO_ROOT, ".cache", `connect-bot-exit-budget-${process.pid}`);

/**
 * Materialises one run's own deployment: this repository's real shared source, copied verbatim, with
 * the run's own configuration file in place of the shipped one.
 *
 * The copy lives under the repository's ignored cache directory because the framework's YAML parser is
 * a repository dependency that resolves from there; the run's own directories, session state and
 * server process are all outside it, and everything here is removed when the suite ends.
 */
function materializeDeployment(label: string, endpoint: string, requestTimeoutMs: number): string {
	const root = path.join(DEPLOYMENT_ROOT, label);
	mkdirSync(root, { recursive: true });
	for (const source of [
		"adapters",
		"framework",
		path.join("extensions", "connect-bot"),
		// The manual assembly this deployment binds resolves its startup policy from this directory by
		// the repository layout, so the copied source must carry the policy documents as well.
		path.join("entrypoints", "startup"),
	]) {
		cpSync(path.join(REPO_ROOT, source), path.join(root, source), { recursive: true });
	}
	writeFileSync(
		path.join(root, "extensions", "connect-bot", "config.yaml"),
		`endpoint: "${endpoint}"\nrequestTimeoutMs: ${requestTimeoutMs}\n`,
	);
	return root;
}

afterAll(() => {
	rmSync(DEPLOYMENT_ROOT, { recursive: true, force: true });
});

describe("a long request budget does not extend the harness's own exit (P27)", () => {
	test("the harness ends on its own lifecycle with a minute-budget unregister still on the wire", async () => {
		const panel: HerdrBotPanel = await startHerdrBot();
		const adapter = startResponseTimingAdapter({ target: panel.endpoint, hold: ["unregister"] });
		const runRoot: RunRoot = createRunRoot("connect-bot-exit-budget");
		const capture: CaptureServer = startCaptureServer({ dir: runRoot.captureDir });
		let session: ControlledSession | undefined;
		try {
			const deployment = materializeDeployment("exit-budget", adapter.endpoint, LONG_BUDGET_MS);
			// The assembly module the deployment's thin entrypoint re-exports, bound exactly as the
			// loader binds a deployed extension.
			const extension = path.join(deployment, "extensions", "connect-bot", "harnesses", "omp.ts");
			session = await ControlledSession.start({
				harness,
				runRoot,
				extensions: [PROVIDER_FIXTURE, extension],
				model: DOCK_MODEL_SELECTOR,
				env: { [DOCK_CAPTURE_BASE_URL_ENV]: capture.baseUrl },
			});

			// The session is armed against the panel through the adapter: the register it sends really
			// registers a row, so an unregister sent later would really have a row to remove.
			const armed = await session.prompt("/connect-bot");
			expect(armed.agentInvoked).toBe(false);
			expect(armed.status).toBe("completed");
			await adapter.waitFor(receipt => receipt.kind === "register", "the register the arm sent");
			// The row is read where the panel *published* it rather than off the dependency's receipt:
			// forwarding a request is asynchronous, so a request the adapter has received is not yet a
			// row the panel holds.
			await panel.waitFor(frame => frame.event === "upsert", "the row the register built");
			const registered = (await panel.snapshot()).map(view => view.sessionId);
			expect(registered).toHaveLength(1);

			// The operator disconnects, and the unregister it sends is held by the dependency: the
			// request is on the wire, unanswered, with a minute of its budget left.
			const offline = await session.prompt("/connect-bot off");
			expect(offline.status).toBe("completed");
			const attempt = await adapter.waitFor(receipt => receipt.kind === "unregister", "the unregister the off sent");
			expect(attempt.forwarded).toBe(false);

			// The process goes away. The exit is the harness's own — it is not killed, and it is not
			// waiting for the request in flight — which its own duration says: an exit that drained the
			// outstanding request could not have ended inside this budget.
			const startedAt = performance.now();
			const exit = await session.stop({ timeoutMs: EXIT_BUDGET_MS });
			const tookMs = performance.now() - startedAt;
			expect(exit.timedOut).toBe(false);
			expect(exit.exitCode).toBe(0);
			expect(tookMs).toBeLessThan(EXIT_BUDGET_MS);
			expect(attempt.releasedAt).toBeUndefined();

			// What the panel received, reported as it stands: no unregister reached it, so it holds the
			// row still and no removal is its evidence — and that absence is not read as a delivery. The
			// attempt is known only from the dependency's own record, which says it was received there
			// and never forwarded. The attempt counted there is the operator's own `off`: the harness's
			// shutdown sends no unregister of its own, so nothing else is outstanding at the exit.
			expect(adapter.receipts.filter(receipt => receipt.kind === "unregister")).toHaveLength(1);
			expect(panel.frames.filter(frame => frame.event === "remove")).toEqual([]);
			expect((await panel.snapshot()).map(view => view.sessionId)).toEqual(registered);
		} finally {
			await session?.stop({ timeoutMs: 5_000 }).catch(() => undefined);
			capture.stop();
			runRoot.dispose();
			adapter.stop();
			await panel.stop();
		}
	}, 300_000);
});
