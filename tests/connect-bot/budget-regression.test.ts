/**
 * The connection semantics the unified request budget must not have rewritten (P20, P21, P22, P23).
 *
 * This suite is the regression owner of four promises about behavior the budget unification moved
 * under: the beat is still the extension's own 10s cadence and is still cancelled by the stop; a
 * failed or timed-out request is still dropped rather than retried, backed off or compensated for;
 * the background push still ends the connection on the third consecutive failure and still resets
 * on a success; and the command and lifecycle paths still send the panel's own protocol, verified
 * by the actual herdr-bot receiving a whole session.
 *
 * Two kinds of evidence are kept apart, because they answer different questions. The controlled
 * runs (`support/budget-probe.ts`) drive the extension as the loader does in a process of its own
 * — a budget other than the shipped one can only be observed there — with the harness's timer
 * standing on a {@link ControlledClock} the run advances by exact virtual milliseconds, so a beat's
 * *period* is what produces it and a cancelled interval produces nothing; the panel behind them is
 * a real local HTTP service whose own receipt record and answer bodies are read off the wire. The
 * interop run drives the same extension at the actual herdr-bot panel, whose own read side is where
 * the registered row, its states and its removal are read back.
 *
 * Nothing here re-states a constant. The cadence is proven by advancing exactly one period and
 * counting what came out; the failure rules are proven by an independently scripted sequence of
 * answers; and the protocol is proven by what the real panel recorded, not by an echo of what this
 * suite sent. The shipped 1000ms budget is read through the framework's configuration interface
 * (P13), never repeated as a literal.
 *
 * The outbound queue's own policy — one flusher, one event at a time, the bound that drops the
 * oldest heartbeat — is not restated or redefined here: it keeps the regression coverage it already
 * has (`outbox.test.ts`, and the queue cases in `heartbeat.test.ts`), and this suite only observes
 * that a configured budget did not change how many events a session sends.
 */
import { afterEach, describe, expect, test } from "bun:test";
import * as path from "node:path";
import { CONNECT_BOT } from "../../extensions/connect-bot/definition";
import { readConfig } from "../../framework/core/config";
import { REPO_ROOT } from "../harness-dock/baseline";
import { isUpsertData, type HerdrBotPanel, publishedViews, startHerdrBot } from "./support/herdr-bot";
import { createRunRoot, type ProbeReport, type SentRequest, runProbe } from "./support/probe-run";

/** The request budget the repository's own `config.yaml` ships, as the framework's read of it reports it. */
const SHIPPED_BUDGET_MS = readConfig(path.join(REPO_ROOT, "extensions", "connect-bot", "config.yaml"), {
	fields: CONNECT_BOT.config?.fields,
}).requestTimeoutMs as number;
/** A budget other than the shipped one: the cadence must not move when the file's value does. */
const LARGER_BUDGET_MS = 2000;
/**
 * A budget far shorter than the panel's fixed delay, so a request reliably runs out of it. The
 * contract explicitly allows a shorter budget to make the same delay fail sooner; what is under
 * test is the follow-up after the failure, never the number.
 */
const TIGHT_BUDGET_MS = 120;
/** The fixed response delay the failure scenarios' panel answers after, in milliseconds. */
const PANEL_DELAY_MS = 600;
/**
 * The heartbeat period this suite advances controlled time by — the panel's own three-beat window
 * (30s) over three beats. Advancing exactly this must produce exactly one beat; the extension's
 * requested period is what that observable rests on, not a constant this suite asserts.
 */
const HEARTBEAT_PERIOD_MS = 10_000;
/** The one session-event route the protocol fixes, as the panel receives it. */
const EVENTS_PATH = "/api/sessions/events";
/** Arm success, verbatim, for one online session: what the panel's registered receipt produces. */
const CONNECTED = "已接入 herdr-bot 面板（当前 1 个在线会话）";
/** Arm failure: the panel's answer never registered this session. */
const ARM_FAILED = "无法连接 herdr-bot，未启用；请确认面板已启动";
/** The `off` that happened locally while the panel never answered its unregister. */
const PANEL_SILENT = "herdr-bot 面板未响应";
/** The `off` the panel answered. */
const DISCONNECTED = "已断开 herdr-bot 面板";
/** The notice a session being left gets when another identity takes its place. */
const SWITCHED = "会话已切换，已断开面板；重新 /connect-bot 可重连";
/** The first failure of an outage, verbatim from the frozen baseline. */
const FIRST_FAILURE = "与 herdr-bot 面板连接中断；若持续失败将自动断开";
/** The budget running out, verbatim from the frozen baseline. */
const AUTO_DISARM = "与 herdr-bot 连接中断，已断开；重新执行 /connect-bot 可重连";

/** One request the local panel received: what it was and when it arrived. */
interface PanelRequest {
	readonly method: string;
	readonly path: string;
	readonly kind: string;
	readonly sessionId: string;
	readonly body: string;
	readonly receivedAt: number;
}

/** The envelope fields this suite reads off one request body, narrowed before anything is read. */
interface WireEnvelope {
	readonly sessionId: string;
	readonly kind: string;
}

/** Reads one request body as the `{sessionId, kind}` envelope the wire protocol fixes. */
function envelopeOf(body: string): WireEnvelope {
	const parsed: unknown = JSON.parse(body);
	if (parsed === null || typeof parsed !== "object") throw new Error("the body is not an envelope");
	if (!("sessionId" in parsed) || typeof parsed.sessionId !== "string") throw new Error("the envelope carries no session id");
	if (!("kind" in parsed) || typeof parsed.kind !== "string") throw new Error("the envelope carries no kind");
	return { sessionId: parsed.sessionId, kind: parsed.kind };
}

/**
 * The local panel a controlled run talks to: a real HTTP service with scripted answers.
 *
 * A delay here is real wall-clock time on purpose: the request budget under test is realized by the
 * harness's own `AbortSignal` over a genuine socket in the probe's process, so a deterministic
 * clock in this suite could not produce the late answer the failure scenarios need. The delay is
 * short (below a couple of hundred milliseconds), the panel is local, and the client abandons the
 * request at its own budget without waiting for it — so the wall time a case costs is its budget,
 * not its delay.
 */
interface Panel {
	readonly endpoint: string;
	readonly requests: PanelRequest[];
	stop(): void;
}

/** What the local panel does with a request; `accepted` is an ordinary 2xx answer. */
interface PanelScript {
	/** A fixed delay before answering the named kind, in milliseconds. */
	readonly delayMs?: Partial<Record<"register" | "unregister" | "heartbeat", number>>;
	/** What each background push is answered with, in beat order; the last answer repeats. */
	readonly beatAnswers?: readonly ("accepted" | "rejected")[];
}

/**
 * Starts the panel one controlled run sends to: loopback, an ephemeral port, every request
 * recorded with its own body, and answers scripted per kind — a register that reports one online
 * session, an accepted answer for everything else, and for the beats exactly the sequence the case
 * under test names. A `rejected` beat is the panel's `404 unknown-session`, the answer it gives a
 * session it has forgotten (as after a herdr-bot restart), which the extension counts as a failure.
 */
function startPanel(script: PanelScript = {}): Panel {
	const requests: PanelRequest[] = [];
	let answeredBeats = 0;
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		async fetch(request) {
			const body = await request.text();
			const envelope = envelopeOf(body);
			requests.push({
				method: request.method,
				path: new URL(request.url).pathname,
				kind: envelope.kind,
				sessionId: envelope.sessionId,
				body,
				receivedAt: performance.now(),
			});
			const delayed =
				envelope.kind === "register" || envelope.kind === "unregister" || envelope.kind === "heartbeat"
					? script.delayMs?.[envelope.kind]
					: undefined;
			if (delayed !== undefined) await Bun.sleep(delayed);
			if (envelope.kind === "register") {
				return Response.json({ outcome: "registered", onlineCount: 1 });
			}
			if (envelope.kind === "heartbeat") {
				const scripted = script.beatAnswers ?? [];
				const answer = scripted[Math.min(answeredBeats, scripted.length - 1)] ?? "accepted";
				answeredBeats += 1;
				if (answer === "rejected") {
					return Response.json({ code: "unknown-session", message: "no such session" }, { status: 404 });
				}
			}
			return Response.json({ outcome: "accepted" });
		},
	});
	return {
		endpoint: `http://127.0.0.1:${server.port}`,
		requests,
		stop: () => void server.stop(true),
	};
}

/** The kinds of request one run made, in order. */
const kindsOf = (report: ProbeReport) => report.sent.map(request => request.kind);

/** The requests one run made of one kind, in the order it made them. */
const ofKind = (report: ProbeReport, kind: string) => report.sent.filter(request => request.kind === kind);

/** The envelope each request carried, parsed from the body the extension itself built. */
const envelopesOf = (report: ProbeReport) => report.sent.map(request => JSON.parse(request.requestBody) as unknown);

/** The panel's own record of one kind, in arrival order. */
const received = (panel: Panel, kind: string) => panel.requests.filter(request => request.kind === kind);

/** The panels and run directories of the case at hand, all disposed together. */
const running: Array<{ dispose(): void | Promise<void> }> = [];
function track<T extends { dispose(): void | Promise<void> }>(value: T): T {
	running.push(value);
	return value;
}

function panelFor(script?: PanelScript): Panel {
	const panel = startPanel(script);
	track({ dispose: () => panel.stop() });
	return panel;
}

async function panelAt(): Promise<HerdrBotPanel> {
	const panel = await startHerdrBot();
	running.push({ dispose: () => panel.stop() });
	return panel;
}

afterEach(async () => {
	for (const resource of running.splice(0)) await resource.dispose();
});

describe("the beat is the extension's own 10s cadence, whatever the request budget is (P21)", () => {
	test("three periods of controlled time produce exactly one beat each, and the stop cancels the beat", async () => {
		const panel = panelFor();
		const root = track(createRunRoot("cadence-shipped", panel.endpoint, SHIPPED_BUDGET_MS));

		const report = await runProbe(root.configFile, "cadence");

		// One beat per period and nothing else, at the virtual instant each period names: the beat is
		// produced by advancing exactly 10s, so a cadence that had been reinterpreted as a retry
		// period, or shifted by the request budget, could not land here.
		expect(kindsOf(report)).toEqual(["register", "state", "heartbeat", "heartbeat", "heartbeat", "unregister"]);
		expect(ofKind(report, "heartbeat").map(beat => beat.virtualMs)).toEqual([
			HEARTBEAT_PERIOD_MS,
			2 * HEARTBEAT_PERIOD_MS,
			3 * HEARTBEAT_PERIOD_MS,
		]);

		// The stop cancelled the interval: two further periods after it produced nothing at all, so
		// the cancelled beat is not merely silent but gone.
		expect(report.sent).toHaveLength(6);
		expect(report.armed).toBe(false);
		expect(report.notifications).toEqual([CONNECTED, DISCONNECTED]);
		expect(report.notificationLevels).toEqual(["info", "info"]);

		// The panel's own receipts, read off the wire: the same one request per event, answered as
		// the protocol answers it, with each beat carrying the state the session holds.
		expect(panel.requests.map(request => request.kind)).toEqual(kindsOf(report));
		expect(envelopesOf(report)).toEqual([
			{ sessionId: "budget-cadence", kind: "register", data: { cwd: "E:/work/budget", agentType: "omp" } },
			{ sessionId: "budget-cadence", kind: "state", data: { value: "idle", reason: "register" } },
			{ sessionId: "budget-cadence", kind: "heartbeat", data: { value: "idle" } },
			{ sessionId: "budget-cadence", kind: "heartbeat", data: { value: "idle" } },
			{ sessionId: "budget-cadence", kind: "heartbeat", data: { value: "idle" } },
			{ sessionId: "budget-cadence", kind: "unregister" },
		]);
		expect(ofKind(report, "register")[0]?.answerBody).toEqual({ outcome: "registered", onlineCount: 1 });
		expect(ofKind(report, "heartbeat").map(beat => beat.answerBody)).toEqual([
			{ outcome: "accepted" },
			{ outcome: "accepted" },
			{ outcome: "accepted" },
		]);
	});

	test("a changed request budget leaves the cadence exactly where it was", async () => {
		const panel = panelFor();
		const root = track(createRunRoot("cadence-larger", panel.endpoint, LARGER_BUDGET_MS));

		const report = await runProbe(root.configFile, "cadence");

		// The run really waited with the larger budget, and the beat's period did not move with it:
		// the request wait and the cadence are different facts about this extension.
		expect(report.configuration.requestTimeoutMs).toBe(LARGER_BUDGET_MS);
		expect(kindsOf(report)).toEqual(["register", "state", "heartbeat", "heartbeat", "heartbeat", "unregister"]);
		expect(ofKind(report, "heartbeat").map(beat => beat.virtualMs)).toEqual([
			HEARTBEAT_PERIOD_MS,
			2 * HEARTBEAT_PERIOD_MS,
			3 * HEARTBEAT_PERIOD_MS,
		]);
		expect(report.sent).toHaveLength(6);
	});
});

describe("a failed or timed-out request is never retried, backed off or compensated (P20)", () => {
	test("a register the panel answers too late is attempted once, and nothing follows it", async () => {
		const panel = panelFor({ delayMs: { register: PANEL_DELAY_MS } });
		const root = track(createRunRoot("register-follow-up", panel.endpoint, TIGHT_BUDGET_MS));

		const report = await runProbe(root.configFile, "register-timeout-follow-up");

		// One attempt, abandoned at the configured budget; the panel did receive it and answered too
		// late — the run's own outcome and the panel's record are different facts, and both hold.
		expect(kindsOf(report)).toEqual(["register"]);
		expect(report.sent[0]?.outcome).toBe("timed-out");
		// Three further periods of controlled time produced nothing: no immediate retry, no backoff,
		// no compensating request, and no beat — a failed register never armed this session.
		expect(report.sent).toHaveLength(1);
		expect(report.armed).toBe(false);
		expect(report.notifications).toEqual([ARM_FAILED]);
		expect(received(panel, "register")).toHaveLength(1);
	});

	test("an unregister the panel answers too late is asked once, and nothing follows it", async () => {
		const panel = panelFor({ delayMs: { unregister: PANEL_DELAY_MS } });
		const root = track(createRunRoot("off-follow-up", panel.endpoint, TIGHT_BUDGET_MS));

		const report = await runProbe(root.configFile, "off-timeout-follow-up");

		expect(kindsOf(report)).toEqual(["register", "state", "unregister"]);
		const unregister = report.sent[2];
		expect(unregister?.outcome).toBe("timed-out");
		// The local half was already complete when the request left, and the three periods after it
		// produced nothing: the one unregister is not repeated and no compensation replaces it.
		expect(unregister?.stateWhenSent).toEqual({ armed: false, beatsRunning: 0 });
		expect(report.sent).toHaveLength(3);
		expect(report.notifications).toEqual([CONNECTED, PANEL_SILENT]);
		expect(received(panel, "unregister")).toHaveLength(1);
	});

	test("a session boundary's unregister the panel answers too late is asked once, and nothing follows it", async () => {
		const panel = panelFor({ delayMs: { unregister: PANEL_DELAY_MS } });
		const root = track(createRunRoot("switch-follow-up", panel.endpoint, TIGHT_BUDGET_MS));

		const report = await runProbe(root.configFile, "switch-timeout-follow-up");

		expect(kindsOf(report)).toEqual(["register", "state", "unregister"]);
		expect(report.sent[2]?.outcome).toBe("timed-out");
		expect(report.sent[2]?.stateWhenSent).toEqual({ armed: false, beatsRunning: 0 });
		expect(report.sent).toHaveLength(3);
		expect(report.notifications).toEqual([CONNECTED, SWITCHED]);
		expect(received(panel, "unregister")).toHaveLength(1);
	});

	test("a beat the panel answers too late is dropped, and the next beat is a new event one period later", async () => {
		const panel = panelFor({ delayMs: { heartbeat: PANEL_DELAY_MS } });
		const root = track(createRunRoot("beat-follow-up", panel.endpoint, TIGHT_BUDGET_MS));

		const report = await runProbe(root.configFile, "beat-timeout-follow-up");

		// Two beats, one period apart, each its own request: the beat that ran out of budget was not
		// retried between the periods, and the following beat is a new event of the same protocol
		// kind, not the same event sent again.
		expect(kindsOf(report)).toEqual(["register", "state", "heartbeat", "heartbeat"]);
		const beats = ofKind(report, "heartbeat");
		expect(beats.map(beat => beat.virtualMs)).toEqual([HEARTBEAT_PERIOD_MS, 2 * HEARTBEAT_PERIOD_MS]);
		expect(beats.map(beat => beat.outcome)).toEqual(["timed-out", "timed-out"]);
		expect(beats.map(beat => beat.answerBody)).toEqual([undefined, undefined]);
		// Two failures are short of the budget: the connection is still up, with one notice for the
		// outage — and no compensating unregister for the pushes that could not be delivered.
		expect(report.notifications).toEqual([CONNECTED, FIRST_FAILURE]);
		expect(report.armed).toBe(true);
		expect(kindsOf(report)).not.toContain("unregister");
		expect(panel.requests.map(request => request.kind)).toEqual(["register", "state", "heartbeat", "heartbeat"]);
	});
});

describe("the background push still ends the connection on the third consecutive failure (P22)", () => {
	test("two failures do not exhaust the budget, a success resets it, and the third consecutive failure ends the connection", async () => {
		// The sequence is specified here and nowhere derived: two failures, a push the panel takes,
		// then three more failures — so the segment that ends the connection is the second one.
		const panel = panelFor({ beatAnswers: ["rejected", "rejected", "accepted", "rejected", "rejected", "rejected"] });
		const root = track(createRunRoot("beat-sequence", panel.endpoint, SHIPPED_BUDGET_MS));

		const report = await runProbe(root.configFile, "beat-failure-sequence");

		// One beat per period, each a real request answered by the panel's own script.
		expect(kindsOf(report)).toEqual(["register", "state", "heartbeat", "heartbeat", "heartbeat", "heartbeat", "heartbeat", "heartbeat"]);
		expect(ofKind(report, "heartbeat").map(beat => beat.virtualMs)).toEqual([
			HEARTBEAT_PERIOD_MS,
			2 * HEARTBEAT_PERIOD_MS,
			3 * HEARTBEAT_PERIOD_MS,
			4 * HEARTBEAT_PERIOD_MS,
			5 * HEARTBEAT_PERIOD_MS,
			6 * HEARTBEAT_PERIOD_MS,
		]);
		expect(ofKind(report, "heartbeat").map(beat => beat.status)).toEqual([404, 404, 200, 404, 404, 404]);

		// The sequence of notices is the whole rule: the first failure of each outage is announced,
		// the failure between them is counted silently, the accepted push is what closes the first
		// outage — and the third consecutive failure of the second one announces the end. An
		// implementation that ended the connection on the second failure, or that failed to reset the
		// count on the accepted push, could not produce this list.
		expect(report.notifications).toEqual([CONNECTED, FIRST_FAILURE, FIRST_FAILURE, AUTO_DISARM]);
		expect(report.notificationLevels).toEqual(["info", "error", "error", "error"]);

		// The connection ended locally: the record is gone, the marker left the area, and the two
		// periods that followed the third failure produced no request and no word at all — no beat,
		// no reconnect and no unregister asked of the panel.
		expect(report.armed).toBe(false);
		expect(report.markerShown).toBe(false);
		expect(report.sent).toHaveLength(8);
		expect(kindsOf(report)).not.toContain("unregister");
		expect(panel.requests.map(request => request.kind)).toEqual(kindsOf(report));
	});
});

describe("the protocol the actual herdr-bot panel receives is the frozen one (P23)", () => {
	test(
		"a whole session — register, beats, state moves, unregister — is what the real panel records and answers",
		async () => {
			const panel = await panelAt();
			const root = track(createRunRoot("interop", panel.endpoint, SHIPPED_BUDGET_MS));

			const report = await runProbe(root.configFile, "interop");

			// The operator's words are the panel's own answers: the registered receipt carried the real
			// online count, the two real beats were each accepted, and the unregister was answered —
			// none of which a stand-in panel could stand in for.
			expect(report.notifications).toEqual([CONNECTED, DISCONNECTED]);
			expect(report.notificationLevels).toEqual(["info", "info"]);

			// The one route, the one method and the one request shape, on every request this session
			// sent — the panel's protocol, as the extension built it.
			expect(report.sent.map(request => request.url)).toEqual(report.sent.map(() => `${panel.endpoint}${EVENTS_PATH}`));
			expect(report.sent.map(request => request.method)).toEqual(report.sent.map(() => "POST"));
			expect(report.sent.map(request => request.headers)).toEqual(report.sent.map(() => ({ "content-type": "application/json" })));
			expect(report.sent.map(request => request.proxy)).toEqual(report.sent.map(() => false));

			// The envelopes: the register carrying the session facts the harness read, the arm's own
			// state report, two beats carrying the state in force, the two round edges' reports and the
			// unregister that names the row.
			expect(envelopesOf(report)).toEqual([
				{
					sessionId: "budget-interop",
					kind: "register",
					data: { cwd: "E:/work/interop", agentType: "omp", sessionName: "interop", model: "interop-model" },
				},
				{ sessionId: "budget-interop", kind: "state", data: { value: "idle", reason: "register" } },
				{ sessionId: "budget-interop", kind: "heartbeat", data: { value: "idle" } },
				{ sessionId: "budget-interop", kind: "heartbeat", data: { value: "idle" } },
				{ sessionId: "budget-interop", kind: "state", data: { value: "working", reason: "round_start" } },
				{ sessionId: "budget-interop", kind: "state", data: { value: "awaiting-input", reason: "round_end" } },
				{ sessionId: "budget-interop", kind: "unregister" },
			]);

			// The panel's receipts, as the real server wrote them.
			expect(report.sent[0]?.status).toBe(200);
			expect(report.sent[0]?.answerBody).toEqual({ outcome: "registered", onlineCount: 1, historySaved: true });
			expect(report.sent.slice(1).map(request => request.answerBody)).toEqual(
				report.sent.slice(1).map(() => ({ outcome: "accepted" })),
			);

			// The panel's own record of that session: the row the register built with the facts it was
			// given, the state each report moved it to, and the removal the unregister performed. The
			// beat-driven frames are absent because a beat that changes nothing publishes nothing — the
			// panel is the one judging what is visible, exactly as the protocol says. The removal is
			// awaited first, because the panel's frames are published asynchronously and this connection
			// reads them from the live stream.
			await panel.waitFor(frame => frame.event === "remove", "the removal the unregister performed");
			expect(panel.frames.map(frame => frame.event)).toEqual(["snapshot", "upsert", "upsert", "upsert", "upsert", "remove"]);
			const views = publishedViews(panel);
			expect(views[0]).toEqual({
				sessionId: "budget-interop",
				sessionName: "interop",
				agentType: "omp",
				cwd: "E:/work/interop",
				model: "interop-model",
				online: true,
			});
			expect(views.map(view => view.state)).toEqual([undefined, "idle", "working", "awaiting-input"]);
			expect(panel.frames[panel.frames.length - 1]?.data).toEqual({ sessionId: "budget-interop" });

			// The cadence in wall-clock time, from the harness's own interval: the two beats the real
			// panel received are one period apart. This is the record the controlled runs' virtual
			// clock is mapped against — the same period, timed by the wall clock instead.
			const beats = ofKind(report, "heartbeat");
			expect(beats).toHaveLength(2);
			expect((beats[1]?.atMs ?? 0) - (beats[0]?.atMs ?? 0)).toBeGreaterThanOrEqual(HEARTBEAT_PERIOD_MS - 1_000);
			expect((beats[1]?.atMs ?? 0) - (beats[0]?.atMs ?? 0)).toBeLessThan(HEARTBEAT_PERIOD_MS + 2_000);

			// And the session was one request per event, in the order the protocol fixes: seven events,
			// no retry, no compensation, and the panel answered every one of them.
			expect(report.sent).toHaveLength(7);
			expect(report.sent.map(request => request.status)).toEqual(report.sent.map(() => 200));
		},
		120_000,
	);
});
