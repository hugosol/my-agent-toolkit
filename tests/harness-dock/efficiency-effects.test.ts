/**
 * The efficiency effects of a real OMP session: what one Round costs the storage root, what a healthy
 * idle window costs, and whether the same-process path opened any local IPC at all.
 *
 * This is the real-host half of `P51`'s "no forbidden duplicate work, and no new fixed polling while
 * healthy idle" — the half the sampling entry (`scripts/efficiency-baseline.ts`) cannot reach, because
 * it drives the common path with semantic deliveries instead of a harness. Everything asserted here is
 * an effect the run really produced: the counts of a receiver that is not the measured code (the
 * in-host recorder, `support/effect-instrument.ts`, loaded into the host process before its own module
 * graph), the provider arrivals the capture endpoint answered, the widget frames the host was told to
 * show, and the bytes the storage root really holds. No claim here reads a figure the implementation
 * publishes about itself.
 *
 * The recorder is what makes the negative claims observable at all: a read the extension makes per
 * event, or a pipe a same-process path opens, leaves nothing behind for a test outside the process to
 * see. The second case below is the recorder's own sensitivity control — a process this test knows
 * reads a file and opens a local endpoint must appear in a dump — so a zero in the first case is a
 * measurement rather than an unloaded preload. The recorder writes nothing at all unless the run names
 * a dump file, and writes it through the members it captured before wrapping.
 *
 * What this file does not claim: that the OMP process made no *native* reads for its own bookkeeping
 * (the recorder sees them, and they are reported rather than asserted away), or that a subagent's own
 * spawned session was driven here (its root-effect deduplication is the dock suites that spawn one:
 * `session-ownership-tree.test.ts`, and the pi side's `pi-assembly-lifecycle.test.ts`). One provider is
 * used — the shipped DeepSeek provider pointed at the capture endpoint — so nothing here is a claim
 * about a real account (P53).
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { MODEL_COST_WIDGET_KEY } from "../../extensions/model-cost/harnesses/omp/widget";
import type { HostEffect } from "./support/effect-instrument";
import { writeAgentSettings, writeProviderOverride } from "./agent-config";
import { type IsolatedHarness, REPO_ROOT, ensureIsolatedHarness, readBaselineRecord } from "./baseline";
import { type CaptureServer, type CaptureStep, type CapturedRequest, startCaptureServer } from "./capture-server";
import { DOCK_CAPTURE_BASE_URL_ENV } from "./fixtures/extension-root/provider";
import { type RunRoot, createRunRoot } from "./run-root";
import { ControlledSession } from "./session";

const record = readBaselineRecord();
/** The extension's own OMP entrypoint, as the harness's loader discovers it. */
const MODEL_COST_ENTRYPOINT = path.join(REPO_ROOT, "entrypoints", "omp", "model-cost.ts");
/** The in-host recorder this file loads into the harness process before its own module graph. */
const RECORDER = path.join(REPO_ROOT, "tests", "harness-dock", "support", "effect-instrument.ts");
/** The name the recorder reads its own dump path from. */
const DUMP_VARIABLE = "MY_AGENT_TOOLKIT_EFFECT_DUMP";
/** The document the extension keeps in its storage root. */
const CONSUMPTION_FILE = "consumption.json";
/** The extension's own Codex allowance estimate, the second document its initialization reads. */
const CODEX_ESTIMATE_FILE = "codex-usage-estimate.json";
/** The provider whose shipped configuration this run redirects at the capture endpoint. */
const PROVIDER = "deepseek";
/** The model selector the harness is started with. */
const MODEL_SELECTOR = "deepseek/deepseek-flash";
/** The usage the capture endpoint reports, so the exchange is an accounted one. */
const CAPTURE_USAGE = { input: 10, output: 7, cacheRead: 3 };
/** The balance document the endpoint answers the shipped provider's query with. */
const BALANCE = { total: "42.50" };
/** How long one healthy idle window is observed for, in milliseconds. */
const IDLE_WINDOW_MS = 3_000;
/** How long the storage root must stop moving before its commit counts as finished. */
const SETTLE_MS = 500;
/** How often the storage root is checked while waiting for that quiet period. */
const SETTLE_POLL_MS = 50;

/** One path as the command line and the recorder's own comparisons state it: forward slashes. */
const slashed = (value: string): string => value.split("\\").join("/");

/** The prompt whose exchange delegates one subagent, for the child-side root-effect case. */
const DELEGATE_PROMPT = "dock effect: delegate one child and report back";
/** The assignment the child is given, which identifies that child's own opening request. */
const CHILD_ASSIGNMENT = "dock effect child: answer once and yield";
/** The prompt whose exchange is answered in prose, for the single-session case. */
const PLAIN_PROMPT = "one exchange with a usage reading";

/** The messages one captured request carried, when its body really is the object this file reads. */
function messagesOf(request: CapturedRequest): readonly unknown[] {
	const body = request.json;
	if (body === null || typeof body !== "object" || !("messages" in body) || !Array.isArray(body.messages)) return [];
	return body.messages;
}

/** Whether one message carries the given role. */
function hasRole(message: unknown, role: string): boolean {
	return message !== null && typeof message === "object" && "role" in message && message.role === role;
}

/** The opening user message of one request: what the session it belongs to was started with. */
function openingOf(request: CapturedRequest): string {
	const opening = messagesOf(request).find(message => hasRole(message, "user"));
	return opening === undefined ? "" : JSON.stringify(opening);
}

/**
 * The scripted model of the delegating run: the main session's opening turn asks for one child, and
 * that child's own opening turn yields a result — every other request answers in prose.
 *
 * The session a request belongs to is read off that request's own opening message rather than from the
 * order requests arrive in, so the script says nothing about how the host schedules them.
 */
function delegatingStep(request: CapturedRequest): CaptureStep | undefined {
	const opening = openingOf(request);
	const answered = messagesOf(request).some(message => hasRole(message, "assistant"));
	if (opening.includes(CHILD_ASSIGNMENT)) return answered ? undefined : { toolCall: { name: "yield", arguments: JSON.stringify({ data: "child result" }) } };
	if (opening.includes(DELEGATE_PROMPT) && !answered) {
		return {
			toolCall: {
				name: "task",
				arguments: JSON.stringify({
					context: "dock effect delegation",
					tasks: [{ name: "dock-effect-child", agent: "task", task: CHILD_ASSIGNMENT, solutionSpace: "one fixed answer, nothing open" }],
				}),
			},
		};
	}
	return {};
}

let harness: IsolatedHarness;

beforeAll(async () => {
	harness = await ensureIsolatedHarness(record);
}, 300_000);

/** One run's isolated home and the storage root the shipped configuration names inside it. */
interface IsolatedHome {
	readonly home: string;
	readonly storageDirectory: string;
	readonly env: Record<string, string>;
}

/**
 * The isolated user home one run uses: `<run root>/user-home`, with the OMP home inside it.
 *
 * The storage directory is created empty — no document is seeded — so this run's first Round takes
 * the extension's own fresh-root path, which is the path the frozen sampling entry's main-request
 * sequence states the per-Round cost of (an initialization that reads the two documents, then a
 * commit that reads and publishes the one it writes).
 */
function isolateHome(runRoot: RunRoot): IsolatedHome {
	const home = path.join(runRoot.path, "user-home");
	const storageDirectory = path.join(home, ".omp", "cost-archive");
	mkdirSync(storageDirectory, { recursive: true });
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

/** One provisioned run: the session, the endpoint behind it, the isolated root and the recorder's dump. */
interface DockRun {
	readonly session: ControlledSession;
	readonly capture: CaptureServer;
	readonly runRoot: RunRoot;
	readonly storageDirectory: string;
	readonly dumpFile: string;
}

/** One isolated run of the extension's own OMP entrypoint over the capture endpoint. */
async function startRun(label: string, respond?: (request: CapturedRequest) => CaptureStep | undefined): Promise<DockRun> {
	const runRoot = createRunRoot(label);
	const home = isolateHome(runRoot);
	// A run that delegates needs the host's own blocking delegation: an RPC host otherwise runs each
	// spawn as a background job, and a case that prompts once has no second prompt to observe it with.
	if (respond !== undefined) writeAgentSettings(runRoot.agentDir, { "async.enabled": false });
	const capture = startCaptureServer({
		dir: runRoot.captureDir,
		replyText: "dock effect reply",
		usage: CAPTURE_USAGE,
		balance: BALANCE,
		...(respond === undefined ? {} : { respond }),
	});
	const dumpFile = path.join(runRoot.path, "host-effects.json");
	// The shipped configuration resolves `~/` inside this home, and the shipped provider's address is
	// the capture endpoint — so the extension's own balance query and model request both arrive there.
	writeProviderOverride(runRoot.agentDir, PROVIDER, { baseUrl: capture.baseUrl, apiKey: "dock-effect-key" });
	try {
		const session = await ControlledSession.start({
			harness,
			runRoot,
			extensions: [MODEL_COST_ENTRYPOINT],
			model: MODEL_SELECTOR,
			env: {
				[DOCK_CAPTURE_BASE_URL_ENV]: capture.baseUrl,
				// The recorder must be in the host's own module graph before the extension is: bun's
				// preload is what wraps the namespaces the framework and the extension will reach.
				BUN_OPTIONS: `--preload ${slashed(RECORDER)}`,
				[DUMP_VARIABLE]: dumpFile,
				...home.env,
			},
			promptTimeoutMs: 120_000,
		});
		return { session, capture, runRoot, storageDirectory: home.storageDirectory, dumpFile };
	} catch (error) {
		capture.stop();
		runRoot.dispose();
		throw error;
	}
}

/** One run's session stopped and its own run root removed, whatever the case decided. */
async function disposeRun(run: DockRun): Promise<void> {
	try {
		if (run.session.exited() === null) await run.session.stop({ timeoutMs: 15_000 });
	} catch {
		// The session already stopped (or never started); the rest of the run still gets cleaned up.
	}
	run.capture.stop();
	run.runRoot.dispose();
}

/** The extension's own widget frames, in the order the host emitted them. */
function widgetFrames(session: ControlledSession): number {
	return session
		.frames()
		.filter(frame => frame.type === "extension_ui_request" && frame.method === "setWidget" && frame.widgetKey === MODEL_COST_WIDGET_KEY).length;
}

/** Every effect the recorder wrote down, or a failure saying the preload never ran. */
function recordedEffects(run: DockRun): readonly HostEffect[] {
	if (!existsSync(run.dumpFile)) {
		throw new Error(
			`the in-host recorder wrote no dump at ${run.dumpFile}: the preload did not reach the harness process, so this run observed nothing and must not be read as a zero.`,
		);
	}
	const dump = JSON.parse(readFileSync(run.dumpFile, "utf8")) as { effects?: readonly HostEffect[] };
	if (!Array.isArray(dump.effects)) throw new Error(`the recorder's dump at ${run.dumpFile} carries no effects.`);
	return dump.effects;
}

/** Whether one effect names a path inside the extension's own storage root. */
function inStorageRoot(effect: HostEffect, storageDirectory: string): boolean {
	const root = slashed(storageDirectory.toLowerCase());
	return effect.targets.some(target => slashed(target.toLowerCase()).startsWith(root));
}

/**
 * How many committed session records one parsed document holds for this harness, or nothing when the
 * value is not that shape.
 *
 * The document belongs to the harness process, so what a test can read here is untrusted input: the
 * guard narrows each step rather than asserting a shape and reading through it.
 */
function sessionCount(parsed: unknown): number | undefined {
	if (typeof parsed !== "object" || parsed === null || !("harnesses" in parsed)) return undefined;
	const { harnesses } = parsed;
	if (typeof harnesses !== "object" || harnesses === null || !("omp" in harnesses)) return undefined;
	const { omp } = harnesses;
	if (typeof omp !== "object" || omp === null || !("sessions" in omp) || !Array.isArray(omp.sessions)) return undefined;
	return omp.sessions.length;
}

/**
 * Wait until the Round's own commit has landed *and* the storage root has stopped moving.
 *
 * The document is written by the harness process rather than by this one, so a test can see the
 * committed bytes before the coordination that wrote them has finished its tail: the lock's own
 * entries are removed, and its names released, after the content is already visible. The wait is
 * therefore on quiescence — the document holds the session's own record and neither its bytes nor the
 * root's entries have moved for `SETTLE_MS` — rather than on the content alone, because a window that
 * opened inside that tail would charge the Round's work to the idle path this case is about. The
 * deadline only keeps a commit that never lands from hanging the case.
 */
async function waitForSettledCommit(storageDirectory: string, atLeast = 1): Promise<string> {
	const document = path.join(storageDirectory, CONSUMPTION_FILE);
	const deadline = Date.now() + 30_000;
	let signature = "";
	let settledSince: number | undefined;
	for (;;) {
		const entries = readdirSync(storageDirectory).sort();
		const text = existsSync(document) ? readFileSync(document, "utf8") : "";
		const records = text.length === 0 ? undefined : sessionCount(JSON.parse(text));
		const moved = `${entries.join("|")}#${text.length}#${existsSync(document) ? statSync(document).mtimeMs : 0}`;
		const now = Date.now();
		if (records !== undefined && records >= atLeast && moved === signature) settledSince ??= now;
		else settledSince = undefined;
		signature = moved;
		if (settledSince !== undefined && now - settledSince >= SETTLE_MS) return text;
		if (now > deadline) throw new Error(`no settled committed ${CONSUMPTION_FILE} landed in ${storageDirectory} within 30s`);
		// A real wait rather than a fixed sleep before an assertion: the condition is another process's
		// quiescence, which only real time can observe, and every assertion below is on the window's own
		// boundaries rather than on this wait being long enough.
		await Bun.sleep(SETTLE_POLL_MS);
	}
}

describe("one real Round's effects and a healthy idle window (P51, P57's P51 item)", () => {
	test("the storage root costs one fresh Round's own reads and publish, idle costs nothing, and no local IPC is opened", async () => {
		const run = await startRun("effect-idle");
		try {
			expect((await run.session.prompt(PLAIN_PROMPT)).status).toBe("completed");
			// The extension's own two provider effects: the startup prefetch of the shipped balance, and
			// the model request the harness itself made. Both arrive at the endpoint, so both are
			// observed rather than inferred.
			expect(run.capture.arrivals()).toEqual(["balance", "model"]);
			await waitForSettledCommit(run.storageDirectory);

			// A healthy idle window after the Round settled: nothing is asked of the process at all.
			const arrivalsBeforeIdle = run.capture.arrivals().length;
			const framesBeforeIdle = widgetFrames(run.session);
			const idleStart = Date.now();
			// The window is deliberately real wall clock: what it observes is whether a *separate* host
			// process does work on its own, and no fake timer in this process can advance that process's
			// clock. The observation does not guess at a duration either — the assertions are on the
			// window's own boundaries (no effect recorded between these two instants), not on a wait
			// being "long enough" for something to happen.
			await Bun.sleep(IDLE_WINDOW_MS);
			const idleEnd = Date.now();
			expect(run.capture.arrivals().length).toBe(arrivalsBeforeIdle);
			expect(widgetFrames(run.session)).toBe(framesBeforeIdle);

			await run.session.stop({ timeoutMs: 15_000 });
			const effects = recordedEffects(run);
			const storage = effects.filter(effect => inStorageRoot(effect, run.storageDirectory));
			const readsOf = (document: string): number =>
				storage.filter(effect => effect.op.startsWith("read") && effect.targets.some(target => target.endsWith(document))).length;
			const documentReads = readsOf(CONSUMPTION_FILE);
			const documentPublishes = storage.filter(effect => effect.op === "rename" && effect.targets.some(target => target.endsWith(CONSUMPTION_FILE))).length;
			const idleEffects = effects.filter(effect => effect.at >= idleStart && effect.at <= idleEnd);
			const storageDetail = [...new Set(storage.map(effect => `${effect.op} ${effect.targets.map(target => path.basename(target)).join(" ")}`))].sort();

			console.log(
				[
					`effects recorded: ${effects.length} (storage root: ${storage.length}, idle window: ${idleEffects.length})`,
					`storage root detail: ${JSON.stringify(storageDetail)}`,
					`idle-window ops: ${JSON.stringify(idleEffects.map(effect => `${effect.kind}:${effect.op}`))}`,
					`net effects: ${JSON.stringify(effects.filter(effect => effect.kind === "net"))}`,
					`capture endpoint port: ${run.capture.port}, widget frames: ${widgetFrames(run.session)}, arrivals: ${JSON.stringify(run.capture.arrivals())}`,
				].join("\n"),
			);

			// One fresh Round's own storage cost: the initialization reads the two documents it has not
			// written yet (the consumption baseline and the Codex estimate), and the commit reads the
			// consumption document inside its lock and publishes it once — the per-Round figures the
			// frozen sampling entry records for the same path from its initialization and request windows.
			expect({ consumptionReads: documentReads, estimateReads: readsOf(CODEX_ESTIMATE_FILE), publishes: documentPublishes }).toEqual({
				consumptionReads: 2,
				estimateReads: 1,
				publishes: 1,
			});
			// Nothing at all was asked of the process while it sat idle: no storage-root call, no other
			// file-system call, no local-network call, no provider arrival and no new widget frame.
			expect(idleEffects).toEqual([]);
			// The same-process path opened no local IPC endpoint and reached no local-access pipe: the
			// framework's local-access publisher is the pi adapter's, and no listening endpoint at all
			// exists in this process. The harness's own local connections are reported above rather than
			// asserted away, because they are the host's business rather than this extension's.
			expect(effects.filter(effect => effect.kind === "net" && effect.op === "createServer")).toEqual([]);
			expect(
				effects.filter(effect => effect.kind === "net" && effect.targets.some(target => target.includes("my-agent-toolkit-access"))),
			).toEqual([]);
		} finally {
			await disposeRun(run);
		}
	}, 240_000);
});

describe("a real subagent session's root effects (P51, P57's P51 item)", () => {
	test("a subagent's own work adds no second root query, no duplicate root UI and no local IPC", async () => {
		const run = await startRun("effect-child", delegatingStep);
		try {
			expect((await run.session.prompt(DELEGATE_PROMPT)).status).toBe("completed");
			// The child's own Round committed its own record before the window below opens, so the counts
			// are about a delegation that really ran rather than about a case that never got that far.
			const document = await waitForSettledCommit(run.storageDirectory, 2);
			expect(sessionCount(JSON.parse(document))).toBeGreaterThanOrEqual(2);
			const arrivals = run.capture.arrivals();
			// One startup prefetch for the whole process, the main session's own request, and the child's
			// own request: the child's session reaches no second account query and starts no prefetch of
			// its own, which is what "no duplicate root query on the child side" is observed as.
			expect(arrivals.filter(arrival => arrival === "balance")).toHaveLength(1);
			expect(arrivals.filter(arrival => arrival === "model").length).toBeGreaterThanOrEqual(2);

			// A healthy idle window after both sessions settled is effect-free, exactly as it is for one
			// session — the child's presence leaves no poller, no wait and no redraw behind.
			const arrivalsBeforeIdle = run.capture.arrivals().length;
			const framesBeforeIdle = widgetFrames(run.session);
			const idleStart = Date.now();
			await Bun.sleep(IDLE_WINDOW_MS);
			const idleEnd = Date.now();
			expect(run.capture.arrivals().length).toBe(arrivalsBeforeIdle);
			expect(widgetFrames(run.session)).toBe(framesBeforeIdle);

			await run.session.stop({ timeoutMs: 15_000 });
			const effects = recordedEffects(run);
			console.log(
				[
					`effects recorded: ${effects.length} (idle window: ${effects.filter(effect => effect.at >= idleStart && effect.at <= idleEnd).length})`,
					`arrivals: ${JSON.stringify(run.capture.arrivals())}, widget frames: ${widgetFrames(run.session)}, capture port: ${run.capture.port}`,
					`net effects: ${JSON.stringify(effects.filter(effect => effect.kind === "net"))}`,
				].join("\n"),
			);
			expect(effects.filter(effect => effect.at >= idleStart && effect.at <= idleEnd)).toEqual([]);
			// No listening endpoint was created and no local-access pipe was reached, with a subagent's
			// own session in the same process as the main one.
			expect(effects.filter(effect => effect.kind === "net" && effect.op === "createServer")).toEqual([]);
			expect(
				effects.filter(effect => effect.kind === "net" && effect.targets.some(target => target.includes("my-agent-toolkit-access"))),
			).toEqual([]);
		} finally {
			await disposeRun(run);
		}
	}, 240_000);
});

describe("the in-host recorder's own sensitivity (the control a zero needs)", () => {
	test("a process this test knows reads a file and opens a listening endpoint appears in its dump", async () => {
		const runRoot = createRunRoot("effect-control");
		const dumpFile = path.join(runRoot.path, "control-effects.json");
		const probeFile = path.join(runRoot.path, "probe.txt");
		writeFileSync(probeFile, "control", "utf8");
		const script = [
			`const { readFileSync, writeFileSync: write } = require("node:fs");`,
			`const { createServer, connect } = require("node:net");`,
			`readFileSync(${JSON.stringify(slashed(probeFile))}, "utf8");`,
			`write(${JSON.stringify(slashed(path.join(runRoot.path, "control-written.txt")))}, "control", "utf8");`,
			`const server = createServer();`,
			`server.listen(0, "127.0.0.1", () => {`,
			`  const port = server.address().port;`,
			`  const socket = connect(port, "127.0.0.1", () => { socket.end(); server.close(); });`,
			`});`,
		].join("\n");
		const scriptFile = path.join(runRoot.workDir, "control.ts");
		writeFileSync(scriptFile, `${script}\n`, "utf8");
		try {
			// The script is a file rather than `-e`: a command line carrying newlines and quotes is not a
			// safe argument for this platform's own launcher, and the control's point is the recorder,
			// not the quoting.
			const child = Bun.spawn(["bun", "--preload", slashed(RECORDER), slashed(scriptFile)], {
				cwd: runRoot.workDir,
				env: { ...process.env, [DUMP_VARIABLE]: dumpFile } as Record<string, string>,
				stdout: "pipe",
				stderr: "pipe",
			});
			const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
			expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: "" });
			const dump = JSON.parse(readFileSync(dumpFile, "utf8")) as { effects?: readonly HostEffect[] };
			const effects = dump.effects ?? [];
			expect(effects.some(effect => effect.kind === "fs" && effect.op === "readFileSync" && effect.targets.some(target => target.endsWith("probe.txt")))).toBe(true);
			expect(effects.some(effect => effect.kind === "net" && effect.op === "createServer")).toBe(true);
			expect(effects.some(effect => effect.kind === "net" && effect.op === "connect")).toBe(true);
		} finally {
			runRoot.dispose();
		}
	}, 60_000);
});
