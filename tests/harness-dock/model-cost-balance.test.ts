/**
 * The DeepSeek balance in a running harness: the CLI's startup prefetch, the query lifetime and what
 * a credential may reach (P37, P38, P40, P53; S5).
 *
 * This is the isolated real-host smoke of the balance query's wiring: the dock materialises the
 * recorded baseline install, loads this repository's own model-cost entrypoint through the harness's
 * real loader, and drives a real session in an isolated home whose storage root the extension's own
 * shipped `config.yaml` names. The session's built-in `deepseek` provider is redirected — through the
 * isolated agent state, before any extension loads — at the dock's capture endpoint, so the balance
 * query an extension makes for itself really leaves the process through the framework's public HTTP
 * module and really reaches the endpoint: what this file observes is a real direct connection, the
 * host's own resolved address with its `/v1` removed, and the credential the host resolves for that
 * provider.
 *
 * What these runs establish about this ticket's behavior, beside the reading itself:
 *
 * - the prefetch is what asks first, and the first model request waits for it: with the endpoint
 *   holding its answer, the exchange's own model request has not reached the endpoint when the
 *   balance query already has, and the answer is what releases it. The arrival order the endpoint
 *   recorded is the evidence, not a duration.
 * - a query that is never answered does not hold the work: a balance endpoint that answers nothing
 *   makes the first exchange wait only for the query's own 5000ms business budget, and the exchange
 *   after it completes while the following query is still out — a query which that later exchange
 *   joins rather than duplicating. The session then exits with that query still out.
 * - the credential goes where it belongs and nowhere else: the account's own balance request carries
 *   it, and the run's stderr, session log, serialized model requests, widget and storage files do not.
 *
 * The reading is the endpoint's own scripted document, never a real account's balance, and the
 * credential is the isolated run's own fixture key — the sentinel case below uses a synthetic literal
 * precisely so that its absence everywhere else is meaningful. That is the whole point of the smoke:
 * it proves the wiring and the request the wiring builds, and it says nothing about what a real
 * DeepSeek account would answer — that remains the operator's own check (see the ticket's evidence
 * note for the sanitized observation method and its skip reason).
 *
 * The permanent, controlled-time cases for the success TTL, the in-flight merge and the failure
 * semantics live in `tests/model-cost/provider-balance.test.ts` (S2), and the prefetch's own
 * scheduling cases in `tests/model-cost/runtime-initialization.test.ts` (S2); what this file adds is
 * that the same behavior holds for real requests of the real provider in a real harness.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { MODEL_COST_WIDGET_KEY } from "../../extensions/model-cost/harnesses/omp/widget";
import { writeProviderOverride } from "./agent-config";
import { type IsolatedHarness, REPO_ROOT, ensureIsolatedHarness, readBaselineRecord } from "./baseline";
import {
	type CaptureServer,
	type CapturedBalanceCall,
	type CapturedRequest,
	startCaptureServer,
} from "./capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV } from "./fixtures/extension-root/provider";
import { type RunRoot, createRunRoot } from "./run-root";
import { ControlledSession, type RpcFrame } from "./session";
import { settled, turn } from "../support/pending-query";

const record = readBaselineRecord();
/** The extension's own OMP entrypoint, as the harness's loader discovers it. */
const MODEL_COST_ENTRYPOINT = path.join(REPO_ROOT, "entrypoints", "omp", "model-cost.ts");
/** The document the extension keeps in its storage root. */
const CONSUMPTION_FILE = "consumption.json";
/** The usage the capture endpoint reports for the one exchange each run sends. */
const CAPTURE_USAGE = { input: 10, output: 7, cacheRead: 3 };
/** The model this run uses: the built-in provider the isolated agent state redirects. */
const MODEL_SELECTOR = "deepseek/deepseek-flash";
const PROVIDER = "deepseek";
/** The credential the isolated state configures for that provider unless a case states its own. */
const DOCK_CREDENTIAL = "dock-key";
/** A synthetic credential, this file's own literal: nothing real, and never a secret. */
const SENTINEL = "SYNTHETIC-SENTINEL-5b31-DO-NOT-LEAK";

let harness: IsolatedHarness;

beforeAll(async () => {
	harness = await ensureIsolatedHarness(record);
});

/** One run's isolated home and the storage root the shipped configuration names inside it. */
interface IsolatedHome {
	readonly home: string;
	readonly storageDirectory: string;
	readonly env: Record<string, string>;
}

/**
 * The isolated user home one run uses: `<run root>/user-home`, with the OMP home inside it.
 *
 * The run's own baseline document is written here so the extension starts on a known period rather
 * than on a fresh one, exactly as the dock's other model-cost runs do.
 */
function isolateHome(runRoot: RunRoot): IsolatedHome {
	const home = path.join(runRoot.path, "user-home");
	const storageDirectory = path.join(home, ".omp", "cost-archive");
	mkdirSync(storageDirectory, { recursive: true });
	writeFileSync(
		path.join(storageDirectory, CONSUMPTION_FILE),
		JSON.stringify({
			schemaVersion: 1,
			periodId: "period-balance",
			start: "2026-10-01T00:00:00.000Z",
			holiday: true,
			harnesses: { omp: { sessions: [] } },
		}),
		"utf8",
	);
	return {
		home,
		storageDirectory,
		env: {
			USERPROFILE: home,
			HOME: home,
			HOMEDRIVE: path.parse(home).root,
			HOMEPATH: home.slice(path.parse(home).root.length - 1),
		},
	};
}

/** One provisioned run: the session, the capture endpoint behind it and the isolated root. */
interface DockRun {
	readonly session: ControlledSession;
	readonly capture: CaptureServer;
	readonly runRoot: RunRoot;
	/** The extension's own storage root in this run, where its documents live. */
	readonly storageDirectory: string;
}

/** One run whose built-in DeepSeek provider answers from the capture endpoint. */
async function startRun(
	label: string,
	balance: Parameters<typeof startCaptureServer>[0]["balance"],
	credential: string = DOCK_CREDENTIAL,
): Promise<DockRun> {
	const runRoot = createRunRoot(label);
	const home = isolateHome(runRoot);
	const capture = startCaptureServer({
		dir: runRoot.captureDir,
		replyText: "dock balance reply",
		usage: CAPTURE_USAGE,
		...(balance === undefined ? {} : { balance }),
	});
	writeProviderOverride(runRoot.agentDir, PROVIDER, { baseUrl: capture.baseUrl, apiKey: credential });
	try {
		const session = await ControlledSession.start({
			harness,
			runRoot,
			extensions: [MODEL_COST_ENTRYPOINT],
			model: MODEL_SELECTOR,
			env: { [DOCK_CAPTURE_BASE_URL_ENV]: capture.baseUrl, ...home.env },
			promptTimeoutMs: 120_000,
		});
		return { session, capture, runRoot, storageDirectory: home.storageDirectory };
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

/** The extension's own usage-widget frames, in the order the host emitted them. */
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

/**
 * Waits until the widget the host was told to show carries a line the case expects, and answers the
 * whole rendering.
 *
 * The balance query is background work: the exchange it was triggered by finishes first, and the
 * rendering that carries the reading lands after it. The wait is on the rendering itself rather than
 * on a duration, and the deadline only keeps one that never lands from hanging the case.
 */
async function widgetTextWhere(session: ControlledSession, accept: (text: string) => boolean): Promise<string> {
	const deadline = Date.now() + 30_000;
	for (;;) {
		const shown = widgetFrames(session).filter(frame => frame.widgetLines !== undefined);
		const text = (shown[shown.length - 1]?.widgetLines as string[] | undefined)?.join("\n");
		if (text !== undefined && accept(text)) return text;
		if (Date.now() > deadline) {
			throw new Error(`no widget rendering the case expects was published; last was:\n${text ?? "<none>"}`);
		}
		const { promise, resolve } = Promise.withResolvers<void>();
		setImmediate(resolve);
		await promise;
	}
}

/**
 * Waits until one of this run's own conditions holds, and answers what it read.
 *
 * The run is a real child process, so its progress is real: the deadline is only what keeps a
 * condition that never holds from hanging the case, and the loop drives the event loop rather than
 * sleeping for a duration. `read` answers `undefined` while the condition does not hold.
 */
async function waitFor<T>(what: string, read: () => T | undefined, deadlineMs = 30_000): Promise<T> {
	const deadline = Date.now() + deadlineMs;
	for (;;) {
		const value = read();
		if (value !== undefined) return value;
		if (Date.now() > deadline) throw new Error(`never happened: ${what}`);
		const { promise, resolve } = Promise.withResolvers<void>();
		setImmediate(resolve);
		await promise;
	}
}

/** The balance calls of one run once it has made at least `atLeast` of them, or nothing yet. */
function balanceCallsBy(run: DockRun, atLeast: number): readonly CapturedBalanceCall[] | undefined {
	const calls = run.capture.balanceCalls();
	return calls.length >= atLeast ? calls : undefined;
}

/** The model requests of one run once it has made at least `atLeast` of them, or nothing yet. */
function requestsBy(run: DockRun, atLeast: number): readonly CapturedRequest[] | undefined {
	const requests = run.capture.requests();
	return requests.length >= atLeast ? requests : undefined;
}

/**
 * How long a case lets a real harness run to show that one arrival did NOT happen in that time.
 *
 * The dock's only duration: "the model request was withheld while the answer was held" is a claim
 * about a real child process, whose progress is real time, and the window is what gives it the time
 * it would need to make the arrival. The case that uses it releases the withheld answer right after
 * and drives the same request to completion, which is what shows the window was a window.
 */
const GATE_WINDOW_MS = 3_000;

/**
 * Waits the window out and fails if one of the endpoint's two paths arrived inside it.
 *
 * The loop drives the event loop between checks rather than sleeping, and a run that was merely
 * stalled fails the case that follows instead of passing this one.
 */
async function expectNoArrival(run: DockRun, kind: "balance" | "model", windowMs: number): Promise<void> {
	const deadline = Date.now() + windowMs;
	for (;;) {
		if (run.capture.arrivals().includes(kind)) {
			throw new Error(`a ${kind} arrival reached the endpoint inside the window: ${run.capture.arrivals().join(",")}`);
		}
		if (Date.now() > deadline) return;
		await turn();
	}
}

/**
 * Every file of one storage root, as the text a case can search for a credential in.
 *
 * The extension publishes through the framework's coordinated update, whose last step renames a
 * same-directory temporary document over the target. A name this walk listed can therefore be gone
 * by the time it is read — the very file the rename published *is* the target, which the same walk
 * reads — so an entry that disappeared in between is skipped rather than reported as a read failure.
 */
function storageFiles(root: string): string[] {
	const found: string[] = [];
	for (const entry of readdirSync(root, { withFileTypes: true, recursive: true })) {
		if (!entry.isFile()) continue;
		const file = path.join(entry.parentPath, entry.name);
		try {
			found.push(readFileSync(file, "utf8"));
		} catch (error) {
			if ((error as { readonly code?: unknown } | null)?.code !== "ENOENT") throw error;
		}
	}
	return found;
}

describe("the CLI's startup prefetch really leaves the process, and the first exchange waits for it (P37, P38)", () => {
	test("the reading the endpoint answered is shown once, and a fresh reading is not queried again", async () => {
		const run = await startRun("model-cost-balance", { total: "110.00" });
		try {
			expect((await run.session.prompt("one balance-triggering exchange")).status).toBe("completed");

			// The balance query really went out, beside the versioned inference path: the host's own
			// resolved address with its trailing `/v1` removed plus the provider's balance path, and the
			// credential the host resolved for that provider, prepared into the request header by the
			// extension.
			const calls = run.capture.balanceCalls();
			expect(calls).toHaveLength(1);
			expect(new URL(calls[0]!.url).pathname).toBe("/user/balance");
			expect(calls[0]!.headers.authorization).toBe(`Bearer ${DOCK_CREDENTIAL}`);

			// The reading reached the widget the real host draws, and it is the endpoint's own amount.
			expect(await widgetTextWhere(run.session, text => text.includes("Balance:"))).toContain("Balance: \u00A5110.00");

			// A second exchange whose reading is still well inside the shipped success TTL of 30000ms
			// only checks: nothing is re-issued and nothing is polled.
			expect((await run.session.prompt("one exchange inside the TTL")).status).toBe("completed");
			expect(run.capture.balanceCalls()).toHaveLength(1);
			expect(run.capture.requests()).toHaveLength(2);
			// And the one balance query arrived before either exchange's model request did: this is the
			// prefetch's own position, which every exchange after it inherits.
			expect(run.capture.arrivals()).toEqual(["balance", "model", "model"]);
		} finally {
			await disposeRun(run);
		}
	}, 300_000);

	test("the first model request is not issued until the prefetch's query has been answered", async () => {
		const run = await startRun("model-cost-balance-gate", { total: "120.00", holdFrom: 1 });
		try {
			const prompt = run.session.prompt("one exchange while the balance query is out");
			const promptSettled = settled(prompt);
			await waitFor("the prefetch's balance query to arrive", () => balanceCallsBy(run, 1));

			// The query has arrived at the endpoint and no answer has been given. No model request has
			// reached the endpoint either, and the exchange is still open: the initialization the first
			// request waits on is what the harness is waiting on, and letting the child process have the time
			// it would need to issue its own request is what makes that an observation rather than an
			// ordering that a request issued in parallel would also produce. (A real child process's progress
			// is real time; the window below is the dock's one such wait, and the release that follows shows
			// the run was in this wait rather than stalled.)
			await expectNoArrival(run, "model", GATE_WINDOW_MS);
			expect(promptSettled()).toBe(false);

			// The answer is what releases it: the exchange's own request arrives only now, the reading the
			// answer carried is the one displayed, and the two paths arrived in that order.
			run.capture.releaseBalance();
			expect((await prompt).status).toBe("completed");
			expect(run.capture.arrivals()).toEqual(["balance", "model"]);
			expect(await widgetTextWhere(run.session, text => text.includes("Balance:"))).toContain("Balance: \u00A5120.00");
		} finally {
			await disposeRun(run);
		}
	}, 300_000);

	test("a provider that refuses the balance query shows the failure and does not notify or block the model", async () => {
		const run = await startRun("model-cost-balance-failure", { total: "0.00", failureStatus: 503 });
		try {
			expect((await run.session.prompt("one exchange with a refusing balance endpoint")).status).toBe("completed");

			// The prefetch's query really was made and really was refused, and because a refusal is not a
			// reading, the exchange's own settled request checks again — the same business rule the S2 suite
			// pins, here on a real connection.
			expect(run.capture.balanceCalls()).toHaveLength(2);
			// The failure is shown as the fact it is — no currency mark and no zero that could be read as
			// a balance of nothing — and it did not become an operator notification.
			const text = await widgetTextWhere(run.session, candidate => candidate.includes("Balance:"));
			expect(text).toContain("Balance: unavailable (unreadable)");
			expect(run.session.stderr()).toBe("");
			expect(
				run.session.frames().filter(frame => frame.type === "extension_ui_request" && frame.method === "notify"),
			).toEqual([]);
		} finally {
			await disposeRun(run);
		}
	}, 300_000);
});

describe("a balance query that never answers does not hold the work (P40)", () => {
	test("the next exchange is issued while the query is still out, and the query it meets is the one it joins", async () => {
		const run = await startRun("model-cost-balance-hang", { total: "0.00", holdFrom: 1 });
		try {
			// The first exchange: its model request waits for the prefetch, whose 5000ms business budget is
			// what ends that wait — the endpoint never answers it — so the exchange completes and the
			// prefetch's own failure is what the result states. That the wait ends at all is the bound the
			// budget gives it.
			expect((await run.session.prompt("one exchange while the balance endpoint never answers")).status).toBe(
				"completed",
			);
			// No reading was obtained, so that exchange's settled request begins the next query, and it is
			// still out — the endpoint holds it — while the next exchange runs.
			await waitFor("the settled request's own balance query to arrive", () => balanceCallsBy(run, 2));
			const second = run.session.prompt("one exchange while that query is still out");
			await waitFor("the second exchange's model request to arrive", () => requestsBy(run, 2));

			// The model request really was issued while the balance query had arrived and been answered
			// nothing: a query that is still out does not hold the next request.
			expect(run.capture.arrivals()).toEqual(["balance", "model", "balance", "model"]);

			// The failure the prefetch settled on is what the widget shows, as the fact it is: the endpoint
			// never answered that query, and no reading was invented for it.
			expect(await widgetTextWhere(run.session, text => text.includes("Balance:"))).toContain(
				"Balance: unavailable (unreachable)",
			);
			expect(run.session.stderr()).toBe("");

			// Released, the query answers, and the live instance accepts the reading it was holding: the
			// endpoint's own amount replaces the failure, and no third query was begun for it.
			run.capture.releaseBalance();
			expect((await second).status).toBe("completed");
			expect(run.capture.arrivals()).toEqual(["balance", "model", "balance", "model"]);
			expect(run.capture.balanceCalls()).toHaveLength(2);
			expect(await widgetTextWhere(run.session, text => text.includes("Balance: \u00A5"))).toContain(
				"Balance: \u00A50.0000",
			);
		} finally {
			await disposeRun(run);
		}
	}, 300_000);

	test("the run ends while the query is still out, and its exit is not held by it", async () => {
		const run = await startRun("model-cost-balance-exit", { total: "0.00", failureStatus: 503, holdFrom: 2 });
		try {
			// One exchange: the prefetch is answered and refused, so the exchange completes quickly and its
			// settled request begins a second query, which this endpoint holds.
			expect((await run.session.prompt("one exchange before the run ends")).status).toBe("completed");
			await waitFor("the settled request's own balance query to arrive", () => balanceCallsBy(run, 2));

			// The session ends with that query still out: the endpoint has answered nothing, so the query
			// cannot have been completed, and the run exits anyway.
			const exit = await run.session.stop({ timeoutMs: 15_000 });
			expect(exit.exitCode).toBe(0);
			expect(exit.timedOut).toBe(false);
			expect(run.capture.arrivals()).toEqual(["balance", "model", "balance"]);
		} finally {
			run.capture.stop();
			run.runRoot.dispose();
		}
	}, 300_000);
});

describe("the credential reaches its own query and no other surface of a real run (P53)", () => {
	test("the synthetic sentinel authenticates the balance query and appears in nothing else this run produced", async () => {
		const run = await startRun("model-cost-balance-sentinel", { total: "0.00", failureStatus: 503 }, SENTINEL);
		try {
			expect((await run.session.prompt("one exchange with a refused balance")).status).toBe("completed");

			// The credential is used where it belongs: the balance endpoint's own request, prepared into the
			// request's authorization header by the extension from what the host resolved for that provider.
			const calls = run.capture.balanceCalls();
			expect(calls).toHaveLength(2);
			expect(calls[0]!.headers.authorization).toBe(`Bearer ${SENTINEL}`);

			// Everything this run produced, searched for it: the operator's stderr, the session's own log,
			// the model requests the run really serialized, the rendering the host was told to show, and the
			// extension's own storage files. A credential that showed up on any of these would be a leak the
			// tests above could not see.
			const surfaces: Record<string, string> = {
				stderr: run.session.stderr(),
				sessionLog: readFileSync(run.session.sessionLog().file, "utf8"),
				modelRequests: run.capture.requests().map(request => request.raw).join("\n"),
				widget: JSON.stringify(widgetFrames(run.session)),
				storage: storageFiles(run.storageDirectory).join("\n"),
			};
			for (const [surface, text] of Object.entries(surfaces)) {
				expect(`${surface}: ${text}`).not.toContain(SENTINEL);
			}
		} finally {
			await disposeRun(run);
		}
	}, 300_000);
});
