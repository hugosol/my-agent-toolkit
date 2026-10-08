/**
 * The isolated process one request-budget run happens in (P13, P15–P21).
 *
 * A validated configuration is recorded once per extension per process, so a budget other than
 * the one the repository ships can only be observed in a process of its own: this program is that
 * process. It is started by `tests/connect-bot/request-timeout.test.ts` for the budget scenarios
 * and by `tests/connect-bot/budget-regression.test.ts` for the cadence, follow-up and interop
 * ones — once per scenario — and it drives the extension exactly as the loader does: the
 * extension's own OMP assembly binds the definition, the command the framework registered runs,
 * the native session events the runtime delivers are handed to that binding, and the outbound
 * dependency is the platform's own call to the real panel the run was given.
 *
 * Nothing here reaches inside the extension: the budget under test is the one the configuration
 * file this run names carries, the waits it produces are read off the wire (each request's own
 * send and settle times), and the outcome is the operator's notice and the extension's own record
 * for the session. The process prints one JSON report line and exits; the suite asserts on it.
 *
 * A scenario that needs controlled time (`cadence`, the `*-follow-up` ones, `beat-*`) has the
 * double schedule the extension's interval on a {@link ControlledClock} this run advances by exact
 * virtual milliseconds, and reports each request's virtual send time beside its real one. The
 * `interop` scenario is the one run that uses the runtime's own interval: it arms against the
 * actual omp-bot panel the suite started and lets two real beats go, so the period this extension
 * asks the runtime for is recorded in wall-clock time as well.
 *
 * Usage: `bun budget-probe.ts <configFile> <scenario> [rewrite-to-ms]`
 *   scenarios: `register`, `register-after-rewrite`, `register-timeout-follow-up`, `off`,
 *              `off-timeout-follow-up`, `session-end-transferred`, `session-end-disposed`,
 *              `switch-timeout-follow-up`, `heartbeat`, `cadence`, `beat-failure-sequence`,
 *              `beat-timeout-follow-up`, `interop`
 */
import { writeFileSync } from "node:fs";
import { ompAdapter } from "../../../framework/adapters/omp";
import type { ExtensionDefinition } from "../../../framework/core/definition";
import { CONNECT_BOT } from "../../../extensions/connect-bot/definition";
import { connectBotConfig } from "../../../extensions/connect-bot/shared-logic/panel/config";
import {
	type PushFetchInit,
	type PushHttpResponse,
	installPushTransport,
} from "../../../extensions/connect-bot/shared-logic/panel/client";
import connectBot from "../../../extensions/connect-bot/runtimes/omp";
import { botSessions } from "../../../extensions/connect-bot/shared-logic/session/session";
import type { OmpCommandContext } from "../../../framework/adapters/omp";
import { ControlledClock } from "./controlled-clock";
import { ompDouble, type ContextOptions, type TimerMode } from "./omp-double";

/** One outbound request this run made, as the transport that performed it saw it. */
interface SentRequest {
	kind: string;
	url: string;
	/** Milliseconds from this process starting the request to the request settling. */
	elapsedMs: number;
	/**
	 * Milliseconds from this run's own start to the moment this request went out: the wall-clock
	 * record a real-timer run reads its cadence from (the `interop` scenario's two beats).
	 */
	readonly atMs: number;
	/**
	 * This request's virtual send time, in the controlled-clock scenarios: the instant the
	 * extension's own timer produced it, so a period that changed with the request budget would
	 * move this number and a cancelled timer would produce no entry at all.
	 */
	readonly virtualMs?: number;
	/** `timed-out` when the request's own budget ran out, `failed` on any other rejection. */
	outcome: "answered" | "timed-out" | "failed";
	status?: number;
	/** The request's own shape, as the extension built it: the protocol's method, headers and proxy policy. */
	readonly method: string;
	readonly headers: Readonly<Record<string, string>>;
	readonly proxy: boolean;
	/** The exact request body the extension sent, for the wire-shape comparisons. */
	readonly requestBody: string;
	/** The panel's own answer body, parsed; `undefined` when the request never settled or answered JSON of no shape. */
	answerBody?: unknown;
	/**
	 * What the extension's own local state was when this request went out: whether a record was
	 * still held for the session (the connection this extension claims) and how many of its
	 * heartbeat timers were still running. A path that promises to disconnect locally first must
	 * show both at their stopped values here, while the request is on the wire.
	 */
	readonly stateWhenSent: { readonly armed: boolean; readonly beatsRunning: number };
}

/** The facts one run reports; the suite reads them (never a path or a value re-derived here). */
interface ProbeReport {
	readonly pid: number;
	readonly scenario: string;
	readonly configuration: { readonly endpoint: string; readonly requestTimeoutMs: number };
	readonly notifications: readonly string[];
	readonly notificationLevels: readonly string[];
	readonly markerShown: boolean;
	readonly armed: boolean;
	readonly sent: readonly SentRequest[];
}

const [configFile, scenario, rewriteTo] = process.argv.slice(2);
if (configFile === undefined || scenario === undefined) {
	throw new Error("budget-probe: <configFile> <scenario> [rewrite-to-ms] are required");
}

/**
 * Records this process's one configuration read for connect-bot as the file this run names.
 *
 * The framework validates an extension's configuration at its first binding in a process and
 * hands every later binding those same values; that is what makes a changed file take effect with
 * the next process rather than in this one. An absolute declaration path is used as declared, so
 * a definition carrying nothing but the file this run was given records exactly those values under
 * the extension's own id — and the assembly below then reads them, as a deployment that ships a
 * different file would.
 */
function recordConfigurationFrom(path: string): void {
	const declaration: ExtensionDefinition = {
		id: CONNECT_BOT.id,
		displayName: `${CONNECT_BOT.id} configuration`,
		config: { path, fields: CONNECT_BOT.config?.fields },
	} as unknown as ExtensionDefinition;
	ompAdapter(declaration)(ompDouble().api);
}

/** The envelope fields this report reads off one request body, narrowed before anything is read. */
interface SentEnvelope {
	readonly sessionId: string;
	readonly kind: string;
}

/** Reads one request body as the `{sessionId, kind}` envelope the wire contract fixes. */
function envelopeOf(body: string): SentEnvelope {
	const parsed: unknown = JSON.parse(body);
	if (parsed === null || typeof parsed !== "object") throw new Error("budget-probe: the body is not an envelope");
	const sessionId = "sessionId" in parsed && typeof parsed.sessionId === "string" ? parsed.sessionId : "";
	const kind = "kind" in parsed && typeof parsed.kind === "string" ? parsed.kind : "unknown";
	return { sessionId, kind };
}

/** The platform's own outbound call, narrowed exactly as the extension's assembly narrows it. */
const platformFetch = globalThis.fetch as unknown as (
	input: string,
	request: PushFetchInit,
) => Promise<PushHttpResponse>;

/** Lets every pending microtask of an effect run to its end. */
async function settleAll(): Promise<void> {
	for (let turn = 0; turn < 200; turn += 1) await Promise.resolve();
}

/** Waits real time, for the one effect nothing awaits (a boundary's best-effort unregister). */
async function wait(ms: number): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>();
	setTimeout(resolve, ms);
	return promise;
}

recordConfigurationFrom(configFile);

/** The heartbeat period this run advances controlled time by: the panel's own 30s window over three beats. */
const HEARTBEAT_PERIOD_MS = 10_000;

/** The scenarios whose whole observation is a cadence or a follow-up window, so time is theirs to advance. */
const CONTROLLED_SCENARIOS = new Set([
	"cadence",
	"register-timeout-follow-up",
	"off-timeout-follow-up",
	"switch-timeout-follow-up",
	"beat-failure-sequence",
	"beat-timeout-follow-up",
]);

const clock = new ControlledClock();

/** The timer mode this scenario drives the extension's interval with. */
function timerModeFor(scenarioName: string): TimerMode {
	// The one scenario that must record a cadence in wall-clock time runs on the runtime's own
	// interval; every other scenario keeps the double's own pacing, or advances a virtual clock.
	if (scenarioName === "interop") return { kind: "real" };
	return CONTROLLED_SCENARIOS.has(scenarioName) ? { kind: "controlled", clock } : { kind: "manual" };
}

/** Milliseconds since this run began driving the extension; every request's own report time. */
const runStartedAt = performance.now();
const timerMode = timerModeFor(scenario);
const double = ompDouble({ timers: timerMode });
const virtualClock = timerMode.kind === "controlled" ? timerMode.clock : undefined;
const sent: SentRequest[] = [];
/** Every request this run has started and that has not settled yet. */
const inFlight = new Set<Promise<void>>();

connectBot(double.api);
// The transport the assembly installed is the platform's own outbound call; this run performs the
// same call, records the request's own body and the answer it got, and times it, so every request
// below is a real HTTP request to the panel this run was given and its wait is the one the
// extension's own budget produced.
installPushTransport(async (url, init: PushFetchInit): Promise<PushHttpResponse> => {
	const envelope = envelopeOf(init.body);
	const entry: SentRequest = {
		kind: envelope.kind,
		url,
		elapsedMs: 0,
		atMs: performance.now() - runStartedAt,
		...(virtualClock === undefined ? {} : { virtualMs: virtualClock.now() }),
		outcome: "failed",
		method: init.method,
		headers: init.headers,
		proxy: init.proxy,
		requestBody: init.body,
		stateWhenSent: {
			armed: botSessions.get(`main:${envelope.sessionId}`) !== undefined,
			beatsRunning: double.timers.filter(timer => !timer.cancelled).length,
		},
	};
	sent.push(entry);
	const settling = Promise.withResolvers<void>();
	inFlight.add(settling.promise);
	const startedAt = performance.now();
	try {
		const response = await platformFetch(url, init);
		entry.elapsedMs = performance.now() - startedAt;
		entry.outcome = "answered";
		entry.status = response.status;
		// The body is read once here so the panel's own answer is part of the record; the extension
		// receives the same text and parses it exactly as it would have parsed the response itself.
		const text = await response.text();
		try {
			entry.answerBody = JSON.parse(text);
		} catch {
			entry.answerBody = undefined;
		}
		return { status: response.status, text: async () => text };
	} catch (error) {
		entry.elapsedMs = performance.now() - startedAt;
		entry.outcome = init.signal.aborted ? "timed-out" : "failed";
		throw error;
	} finally {
		inFlight.delete(settling.promise);
		settling.resolve();
	}
});

/**
 * Waits until this run's effects have finished sending.
 *
 * A queued push is dispatched asynchronously and a request settles on the network's own time, so
 * a scenario that has observed its operator notice still has a request in flight: reporting before
 * it settles would describe it as a failure that never happened. Nothing here reaches into the
 * extension — this waits on the requests the transport itself performed.
 */
async function settleRequests(): Promise<void> {
	// A queued push may not be on the wire yet, so "nothing is in flight" is only conclusive once
	// it has held for a stretch of real time: three quiet turns in a row.
	for (let quiet = 0, turn = 0; turn < 200 && quiet < 3; turn += 1) {
		await wait(10);
		quiet = inFlight.size === 0 ? quiet + 1 : 0;
	}
}

/**
 * Advances this run's controlled clock one heartbeat period and lets everything the beat it
 * produced went through settle, so the next period starts from a quiet run: the request is on the
 * wire (and recorded at its own virtual instant) before the clock moves again.
 */
async function advancePeriod(): Promise<void> {
	await clock.advanceBy(HEARTBEAT_PERIOD_MS);
	await settleAll();
	await settleRequests();
}

/** Waits until `count` beats have gone, so a real-timer run can read their wall-clock cadence. */
async function waitForBeats(count: number, timeoutMs: number): Promise<void> {
	const deadline = performance.now() + timeoutMs;
	while (performance.now() < deadline && sent.filter(request => request.kind === "heartbeat").length < count) {
		await wait(25);
	}
}

/**
 * Arms one session the way a run reaches an armed session: the native load, then the command. The
 * context is returned because a scenario that then acts on the session — a round edge, an `off` —
 * acts in the same session it armed.
 */
async function arm(
	sessionId: string,
	facts: Partial<ContextOptions> = {},
): Promise<OmpCommandContext> {
	const ctx = double.context({ ...facts, sessionId, cwd: facts.cwd ?? "E:/work/budget" });
	double.startSession(ctx);
	const announced = double.nextNotification();
	double.run("connect-bot", "", ctx);
	await announced;
	await settleAll();
	return ctx;
}

async function runScenario(): Promise<void> {
	const sessionId = `budget-${scenario}`;
	switch (scenario) {
		case "register":
		case "register-after-rewrite": {
			const ctx = double.context({ sessionId, cwd: "E:/work/budget" });
			double.startSession(ctx);
			// The rewrite happens with this process already holding the values it read: a budget
			// this run keeps. The write is not a restart, and nothing here discards process state.
			if (rewriteTo !== undefined) writeFileSync(configFile!, `endpoint: ${connectBotConfig().endpoint}\nrequestTimeoutMs: ${rewriteTo}\n`);
			const announced = double.nextNotification();
			double.run("connect-bot", "", ctx);
			await announced;
			await settleAll();
			return;
		}
		case "off": {
			await arm(sessionId);
			const announced = double.nextNotification();
			double.run("connect-bot", "off", double.context({ sessionId, cwd: "E:/work/budget" }));
			await announced;
			await settleAll();
			return;
		}
		case "session-end-transferred": {
			await arm(sessionId);
			double.switchSession(double.context({ sessionId: `${sessionId}-next`, cwd: "E:/work/budget" }), "new");
			// Nothing awaits a boundary's best-effort unregister, so this run waits past both the
			// panel's fixed delay and the longest budget a scenario here uses before reporting.
			await wait(1600);
			await settleAll();
			return;
		}
		case "heartbeat": {
			await arm(sessionId);
			// The loaded extension's own periodic effect, fired as the runtime fires it: the managed
			// interval the arm path asked the runtime for, one period in. The beat then leaves through
			// the ordinary background path — no internal client is called here, and how long it waits
			// is decided by the budget this run's configuration carries.
			const beat = double.timers.find(timer => !timer.cancelled);
			if (beat === undefined) throw new Error("budget-probe: the armed session scheduled no heartbeat");
			beat.callback();
			await settleAll();
			return;
		}
		case "session-end-disposed": {
			await arm(sessionId);
			double.shutdown(double.context({ sessionId, cwd: "E:/work/budget" }));
			await wait(1600);
			await settleAll();
			return;
		}
		case "cadence": {
			await arm(sessionId);
			// Three full periods of controlled time after the arm: one beat at each virtual instant
			// its period says, and nothing at all in between.
			for (let period = 0; period < 3; period += 1) await advancePeriod();
			const announced = double.nextNotification();
			double.run("connect-bot", "off", double.context({ sessionId, cwd: "E:/work/budget" }));
			await announced;
			await settleAll();
			await settleRequests();
			// Two further periods after the stop: the interval the stop cancelled fires nothing, so a
			// cancelled beat would show up here as a request that should not exist.
			await advancePeriod();
			await advancePeriod();
			return;
		}
		case "register-timeout-follow-up": {
			const ctx = double.context({ sessionId, cwd: "E:/work/budget" });
			double.startSession(ctx);
			const announced = double.nextNotification();
			double.run("connect-bot", "", ctx);
			await announced;
			await settleAll();
			await settleRequests();
			// The attempt did not arm this session, and three periods of controlled time follow it: a
			// retry, a backoff or any compensation would appear as a request inside this window, and
			// nothing but the one attempt is scheduled in the first place.
			for (let period = 0; period < 3; period += 1) await advancePeriod();
			return;
		}
		case "off-timeout-follow-up": {
			await arm(sessionId);
			const announced = double.nextNotification();
			double.run("connect-bot", "off", double.context({ sessionId, cwd: "E:/work/budget" }));
			await announced;
			await settleAll();
			await settleRequests();
			for (let period = 0; period < 3; period += 1) await advancePeriod();
			return;
		}
		case "switch-timeout-follow-up": {
			await arm(sessionId);
			// The boundary's own unregister, whose outcome nobody awaits: three periods after it are
			// the window in which a repeat of it — or anything answering for it — would be visible.
			double.switchSession(double.context({ sessionId: `${sessionId}-next`, cwd: "E:/work/budget" }), "new");
			await settleAll();
			await settleRequests();
			for (let period = 0; period < 3; period += 1) await advancePeriod();
			return;
		}
		case "beat-failure-sequence": {
			await arm(sessionId);
			// Six periods against whatever sequence the panel answers background pushes with, then two
			// more after it: whichever beat the failure budget ends the connection on, nothing — not
			// another beat, not an unregister — follows it.
			for (let period = 0; period < 6; period += 1) await advancePeriod();
			await advancePeriod();
			await advancePeriod();
			return;
		}
		case "beat-timeout-follow-up": {
			await arm(sessionId);
			// The panel answers every background push after this run's budget has run out, so each beat
			// fails as a request that never completed; two periods show one beat each and nothing else,
			// which is what tells a dropped push apart from a retried one — and leave the count short of
			// the failure budget, so what ends a connection is not this scenario's subject.
			for (let period = 0; period < 2; period += 1) await advancePeriod();
			return;
		}
		case "interop": {
			const ctx = await arm(sessionId, { cwd: "E:/work/interop", model: "interop-model", sessionName: "interop" });
			// The actual omp-bot panel the suite started, reached by the platform transport the
			// assembly itself installed: two real beats from the runtime's own interval, then one round
			// edge pair, then the disconnect the panel answers. Nothing awaits the disconnect's own
			// notice — a session that was never armed publishes none, and this report has to describe
			// whatever really happened rather than wait for a word that may never come.
			await waitForBeats(2, 25_000);
			await settleAll();
			await settleRequests();
			double.startRun(ctx);
			double.settleRun(ctx);
			await settleAll();
			await settleRequests();
			double.run("connect-bot", "off", ctx);
			await settleAll();
			await settleRequests();
			return;
		}
		default:
			throw new Error(`budget-probe: unknown scenario "${scenario}"`);
	}
}

await runScenario();
// Nothing is reported until every request this run started has settled: an effect's own notice
// resolves before its queued push has been answered, and a report that described such a request
// as it stood mid-flight would read as a failure the panel never gave.
await settleRequests();

const report: ProbeReport = {
	pid: process.pid,
	scenario,
	configuration: connectBotConfig(),
	notifications: [...double.notifications],
	notificationLevels: [...double.notificationLevels],
	markerShown: double.widgets[double.widgets.length - 1]?.lines !== undefined,
	armed: botSessions.get(`main:budget-${scenario}`) !== undefined,
	sent,
};
process.stdout.write(`${JSON.stringify(report)}\n`, () => process.exit(0));
