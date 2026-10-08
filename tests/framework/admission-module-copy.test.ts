/**
 * One version decision under the real harness's per-extension module graphs (P2; contract S1).
 *
 * The harness loads every extension's graph under its own `?mtime=` tag, so two extensions in one
 * session hold two copies of the framework's decision module. This run drives that real load with
 * two probe fixture extensions (`tests/harness-dock/fixtures/admission-probe/{one,two}.ts`), each loaded
 * through `-e` exactly as this repository's own extensions are, and each reporting on the session's
 * stderr whether its graph decided the reported version or read the decision the process already
 * holds — and whether its decision module really is a copy of its own, so a deduped load cannot pass
 * as sharing.
 *
 * Nothing here reaches into framework internals: the probes call the framework's own decision
 * function and the run reads the session's own stderr, exactly as the acceptance procedure reads a
 * run's output. Nothing modifies the harness, its install or any host configuration.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import * as path from "node:path";
import { type IsolatedHarness, REPO_ROOT, ensureIsolatedVersion, readBaselineRecord } from "../harness-dock/baseline";
import { type CaptureServer, startCaptureServer } from "../harness-dock/capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV, DOCK_MODEL_SELECTOR } from "../harness-dock/fixtures/extension-root/provider";
import { type RunRoot, createRunRoot } from "../harness-dock/run-root";
import { ControlledSession } from "../harness-dock/session";

/** The two probe fixture extensions: two module graphs in one process, loaded the way every extension is. */
const PROBE_ONE = path.join(REPO_ROOT, "tests", "harness-dock", "fixtures", "admission-probe", "one.ts");
const PROBE_TWO = path.join(REPO_ROOT, "tests", "harness-dock", "fixtures", "admission-probe", "two.ts");
/** The credential-free provider fixture; it keeps the turn off the network. */
const PROVIDER_FIXTURE = path.join(REPO_ROOT, "tests", "harness-dock", "fixtures", "extension-root", "provider.ts");
/** A version independently specified to be outside the framework's baseline: this repository's candidate. */
const UNLISTED_HARNESS_VERSION = "18.6.1";

let harness: IsolatedHarness;

beforeAll(async () => {
	// The harness whose version the baseline does not list, as in the notice suite: the decision
	// these probes report is about a version the framework really judges.
	harness = await ensureIsolatedVersion(readBaselineRecord(), UNLISTED_HARNESS_VERSION);
}, 300_000);

interface DockRun {
	readonly session: ControlledSession;
	readonly capture: CaptureServer;
	readonly runRoot: RunRoot;
}

/** Start one isolated session with the dock provider and both probes. */
async function startRun(label: string): Promise<DockRun> {
	const runRoot = createRunRoot(label);
	const capture = startCaptureServer({ dir: runRoot.captureDir });
	try {
		const session = await ControlledSession.start({
			harness,
			runRoot,
			extensions: [PROVIDER_FIXTURE, PROBE_ONE, PROBE_TWO],
			model: DOCK_MODEL_SELECTOR,
			env: { [DOCK_CAPTURE_BASE_URL_ENV]: capture.baseUrl },
		});
		return { session, capture, runRoot };
	} catch (error) {
		capture.stop();
		runRoot.dispose();
		throw error;
	}
}

async function disposeRun(run: DockRun): Promise<void> {
	try {
		await run.session.stop({ timeoutMs: 5_000 });
	} catch {
		// The session already stopped (or never started); the run root still gets cleaned up.
	}
	run.capture.stop();
	run.runRoot.dispose();
}

describe("the version decision across the harness's per-extension graphs (P2)", () => {
	test("the separately loaded graphs share one decision instead of each deciding", async () => {
		const run = await startRun("admission-probe-module-copies");
		try {
			// A real turn runs: it is where every extension's factory is called, and therefore where
			// each graph resolves the version the harness reports.
			const turn = await run.session.prompt("admission module copy turn");
			expect(turn.agentInvoked).toBe(true);
			expect(turn.status).toBe("completed");
			expect(harness.version).toBe(UNLISTED_HARNESS_VERSION);

			// The lines the probes wrote for their graphs, in the order the harness's process wrote them.
			const lines = run.session.stderr().split("\n").filter(line => line.includes("admission-probe-"));
			// Both graphs reported: one decided the version, and no graph reports a decision of its own.
			expect(lines.filter(line => line.includes(": decided "))).toHaveLength(1);
			const shared = lines.filter(line => line.includes(": shared "));
			expect(shared.length).toBeGreaterThan(0);
			expect(lines.filter(line => line.includes(": separate "))).toEqual([]);

			for (const line of shared) {
				// What was shared is the version this run reports, judged as the baseline says.
				expect(line).toContain(UNLISTED_HARNESS_VERSION);
				expect(line).toContain("unlisted-version");
				// And the sharing is real only because the harness loaded two copies: the graph that
				// read the decision also names its decision module as a copy of its own.
				expect(line).toContain("distinct admission module");
			}
		} finally {
			await disposeRun(run);
		}
	}, 300_000);
});
