/**
 * connect-bot's arm skeleton at the OMP extension seam: the empty-argument command, the
 * panel protocol it sends and the effects one successful arm has (E2, E17, E18), what
 * repeating the command on an already-armed session does (E3) and what a failed arm leaves
 * behind (E4).
 *
 * The extension is driven exactly as the loader drives it: its own OMP assembly binds the
 * definition against the double, and the command the framework registered runs with a
 * doubled session context. The panel is a fake HTTP call standing in for the framework's own
 * request at the extension's own seam, so every request is observed without a network, and each
 * test's session id is its own so nothing about one case can leak into the next. The failure
 * cases that claim nothing outlives the failure drive bun's fake timers, so "nothing later
 * happens" is established by advancing time rather than by waiting.
 */
import { afterEach, describe, expect, jest, test } from "bun:test";
import {
	EVENTS_PATH,
	type PanelRequest,
	setPanelRequestForTest,
} from "../../extensions/connect-bot/shared-logic/panel/client";
import { connectBotConfig } from "../../extensions/connect-bot/shared-logic/panel/config";
import { botSessions } from "../../extensions/connect-bot/shared-logic/session/session";
import type { HttpRequestOptions } from "../../framework/interface/general/http";
import connectBot from "../../extensions/connect-bot/harnesses/omp";
import connectBotPi from "../../extensions/connect-bot/harnesses/pi";
import type { PiExtensionContext } from "../../adapters/pi";
import { boundPiSurface } from "../framework/support/pi-surface-double";
import { type OmpDouble, ompDouble } from "./support/omp-double";

/** The framework's one marker-area widget, as the OMP adapter owns it. */
const MARKER_AREA_KEY = "semantic-extensions";
const MARKER_AREA_PLACEMENT = "aboveEditor";
/** The extension's marker text: what the area shows while `enabled`. */
const MARKER_TEXT = "◐ connectBot";
/** The endpoint the extension's own `config.yaml` ships; the file is the only source. */
const ENDPOINT = "http://127.0.0.1:18787";
/** The owner key the framework resolves for one main session. */
const ownerKey = (sessionId: string) => `main:${sessionId}`;

/** One outbound request the extension made, as the framework's call received it. */
interface Request {
	readonly url: string;
	readonly init: HttpRequestOptions;
}

/** The panel's answer to one request. */
const panelAnswer = (status: number, body: unknown): Response =>
	new Response(JSON.stringify(body), { status });

/** The registered receipt a reachable panel answers a `register` with. */
const registered = (onlineCount: number) => ({ outcome: "registered", onlineCount });

/**
 * The envelope fields a test reads off the wire: the two strings the contract's envelope always
 * carries, and the body, which stays `unknown` because it is what a test compares against a
 * literal. The parsed body is narrowed field by field before anything is read, so a mistyped field
 * fails here rather than silently comparing `undefined`.
 */
interface WireEnvelope {
	readonly sessionId: string;
	readonly kind: string;
	readonly data?: unknown;
}

/** Reads one sent request body as the `{sessionId, kind, data?}` envelope the contract fixes. */
function envelopeOf(request: Request): WireEnvelope {
	const parsed: unknown = JSON.parse(request.init.body ?? "");
	if (parsed === null || typeof parsed !== "object") {
		throw new Error("connect-bot sent a body that is not an object");
	}
	if (!("sessionId" in parsed) || typeof parsed.sessionId !== "string") {
		throw new Error("the envelope carries no session id");
	}
	if (!("kind" in parsed) || typeof parsed.kind !== "string") {
		throw new Error("the envelope carries no kind");
	}
	return {
		sessionId: parsed.sessionId,
		kind: parsed.kind,
		data: "data" in parsed ? parsed.data : undefined,
	};
}

/** Records every request and answers with `answer`. */
function panel(answer: () => Promise<Response>): { readonly requests: Request[]; readonly request: PanelRequest } {
	const requests: Request[] = [];
	return {
		requests,
		request: async (url, init = {}) => {
			requests.push({ url, init });
			return answer();
		},
	};
}

/** Binds the extension against a fresh double and injects one panel. */
function bound(request: PanelRequest): OmpDouble {
	const double = ompDouble();
	connectBot(double.api);
	// A real binding sends through the framework's own request; the fake takes its place.
	setPanelRequestForTest(request);
	return double;
}

/**
 * Answers one request with each scripted answer, in order: what a panel does across the two
 * runs of a re-register or a retry, where the second answer is about the panel coming back.
 *
 * A script describes what a panel answers for the attempts — the registers — it is asked. The
 * state report the arm path sends behind each of them is part of the connection rather than one of
 * those attempts, so it is answered the way a live panel answers it and consumes no script entry.
 */
function scriptedPanel(answers: ReadonlyArray<() => Promise<Response>>): {
	readonly requests: Request[];
	readonly request: PanelRequest;
} {
	const requests: Request[] = [];
	let scripted = 0;
	return {
		requests,
		request: async (url, init = {}) => {
			requests.push({ url, init });
			if (envelopeOf({ url, init }).kind === "state") return panelAnswer(200, { outcome: "accepted" });
			const answer = answers[scripted] ?? answers[answers.length - 1];
			scripted += 1;
			if (answer === undefined) throw new Error("scriptedPanel: the script has no answer left");
			return answer();
		},
	};
}

/** Fake timers are per-file state: a failure case must not leave them installed for the next. */
afterEach(() => {
	jest.useRealTimers();
});

describe("native Pi registration facts", () => {
	test("reports pi even when the session name and model suggest omp", async () => {
		const { requests, request } = panel(async () => panelAnswer(200, registered(1)));
		const surface = boundPiSurface();
		connectBotPi(surface.api);
		setPanelRequestForTest(request);
		const { promise: announced, resolve: announce } = Promise.withResolvers<void>();
		const ctx = {
			cwd: "E:/work/pi-native",
			model: { name: "omp" },
			hasUI: true,
			isIdle: () => true,
			hasPendingMessages: () => false,
			sessionManager: {
				getSessionId: () => "pi-native-registration",
				getSessionName: () => "omp",
				getBranch: () => [],
			},
			ui: { notify: () => announce(), setWidget: () => {} },
		} as unknown as PiExtensionContext;
		const command = surface.commands.get("connect-bot")!;
		try {
			await command.handler("", ctx);
			await announced;
			expect(envelopeOf(requests[0]!)).toEqual({
				sessionId: "pi-native-registration",
				kind: "register",
				data: { cwd: "E:/work/pi-native", agentType: "pi", sessionName: "omp", model: "omp" },
			});
		} finally {
			await command.handler("off", ctx);
		}
	});
});

describe("an empty argument arms this session (E2, E17, E18)", () => {
	test("registers the main session with the fixed route and envelope, then shows the marker", async () => {
		const { requests, request } = panel(async () => panelAnswer(200, registered(3)));
		const double = bound(request);
		const ctx = double.context({ sessionId: "arm-1", cwd: "E:/work/alpha", model: "deepseek", sessionName: "alpha" });

		// The framework never awaits an injected command implementation, so the arm effect's
		// own completion is what this test waits for — not a duration it guesses at.
		const announced = double.nextNotification();
		double.run("connect-bot", "", ctx);
		await announced;

		// Two requests, in order: the register the panel answered, then the state report the arm path
		// sends unconditionally. The heartbeat is scheduled, not beaten, so nothing else goes now.
		expect(requests.map(request => envelopeOf(request).kind)).toEqual(["register", "state"]);
		expect(requests[0]?.url).toBe(`${ENDPOINT}${EVENTS_PATH}`);
		expect(requests[0]?.init.method).toBe("POST");
		expect(requests[0]?.init.headers).toEqual({ "content-type": "application/json" });
		expect(requests[0]?.init.proxy).toBe(false);
		// The wait this request carries is the extension's own configured budget rather than a
		// constant here — `request-timeout.test.ts` observes it against a real panel.
		expect(requests[0]?.init.timeoutMs).toBe(connectBotConfig().requestTimeoutMs);
		// The real session facts the adapter's opaque owner key deliberately does not carry.
		expect(JSON.parse(requests[0]?.init.body ?? "")).toEqual({
			sessionId: "arm-1",
			kind: "register",
			data: { cwd: "E:/work/alpha", agentType: "omp", sessionName: "alpha", model: "deepseek" },
		});

		// The receipt's online count is what the operator is told, and the area shows the marker.
		expect(double.notifications).toEqual(["已接入 herdr-bot 面板（当前 3 个在线会话）"]);
		expect(double.widgets).toEqual([
			{ key: MARKER_AREA_KEY, lines: [MARKER_TEXT], placement: MARKER_AREA_PLACEMENT },
		]);
		// This session has no persistence: the declared value lives in the owner cell alone.
		expect(double.appended).toEqual([]);
		// The extension's own record for the owner it armed.
		expect(botSessions.get(ownerKey("arm-1"))?.sessionId).toBe("arm-1");
	});

	test("a session that reports no model or name sends the facts it has, and no empty value", async () => {
		const { requests, request } = panel(async () => panelAnswer(200, registered(1)));
		const double = bound(request);
		// An empty display name is not a fact: it must be omitted, not sent as an empty string.
		const ctx = double.context({ sessionId: "arm-2", cwd: "E:/work/empty", model: "", sessionName: "" });

		const announced = double.nextNotification();
		double.run("connect-bot", "", ctx);
		await announced;

		const envelope = JSON.parse(requests[0]?.init.body ?? "") as Record<string, unknown>;
		expect(Object.keys(envelope).sort()).toEqual(["data", "kind", "sessionId"]);
		expect(envelope.data).toEqual({ cwd: "E:/work/empty", agentType: "omp" });
	});
});

describe("a panel that does not register this session arms nothing (E4, E17)", () => {
	/**
	 * Every way an arm can fail is the same outcome: a `404` after a herdr-bot restart, any other
	 * non-2xx, a 2xx answer that is not the registered receipt, and a request that never
	 * completed (reject or timeout — the call surfaces both as one failure).
	 */
	const unreachable: ReadonlyArray<readonly [string, () => Promise<Response>]> = [
		["404 after a restart", async () => panelAnswer(404, { error: "unknown-session" })],
		["a non-2xx answer", async () => panelAnswer(500, { error: "boom" })],
		["a 2xx answer that is not the receipt", async () => panelAnswer(200, { outcome: "accepted" })],
	];

	for (const [label, answer] of unreachable) {
		test(`${label} reports the arm failure and leaves the session unarmed`, async () => {
			const { requests, request } = panel(answer);
			const double = bound(request);
			const sessionId = `arm-failed-${requests.length}${label.length}`;
			const ctx = double.context({ sessionId, cwd: "E:/work/beta" });

			const announced = double.nextNotification();
			double.run("connect-bot", "", ctx);
			await announced;

			expect(requests.length).toBe(1);
			expect(double.notifications).toEqual(["无法连接 herdr-bot，未启用；请确认面板已启动"]);
			// Nothing was armed: no marker, no declared value recorded, no record for the owner.
			expect(double.widgets).toEqual([]);
			expect(double.appended).toEqual([]);
			expect(botSessions.get(ownerKey(sessionId))).toBeUndefined();
		});
	}

	test("a request that never completed reports the same failure", async () => {
		const requests: Request[] = [];
		const double = bound(async (url, init = {}) => {
			requests.push({ url, init });
			throw new Error("the panel never answered");
		});
		const sessionId = "arm-failed-unreachable";
		const ctx = double.context({ sessionId, cwd: "E:/work/beta" });

		const announced = double.nextNotification();
		double.run("connect-bot", "", ctx);
		await announced;

		expect(requests.length).toBe(1);
		expect(double.notifications).toEqual(["无法连接 herdr-bot，未启用；请确认面板已启动"]);
		expect(double.widgets).toEqual([]);
		expect(double.appended).toEqual([]);
		expect(botSessions.get(ownerKey(sessionId))).toBeUndefined();
	});
});

describe("an arm's requests state the direct connection and the extension's own budget (E17)", () => {
	test("both of an arm's requests ask for a direct connection, at the configured wait", async () => {
		const requests: Request[] = [];
		const double = bound(async (url, init = {}) => {
			requests.push({ url, init });
			return panelAnswer(200, registered(1));
		});

		const announced = double.nextNotification();
		double.run("connect-bot", "", double.context({ sessionId: "arm-platform", cwd: "E:/work/gamma" }));
		await announced;

		// Both requests an arm makes — its register and the state report behind it — name the one
		// route and state a direct connection: the panel is never reached through an ambient proxy,
		// and the wait each of them carries is the extension's own configured budget.
		expect(requests.map(request => request.url)).toEqual([`${ENDPOINT}${EVENTS_PATH}`, `${ENDPOINT}${EVENTS_PATH}`]);
		expect(requests.map(request => request.init.proxy)).toEqual([false, false]);
		expect(requests.map(request => request.init.timeoutMs)).toEqual([
			connectBotConfig().requestTimeoutMs,
			connectBotConfig().requestTimeoutMs,
		]);
	});
});

describe("a session that never armed does nothing at all (E5)", () => {
	test("binding alone sends no request, schedules no timer and writes no state", () => {
		const { requests, request } = panel(async () => panelAnswer(200, registered(1)));
		const double = bound(request);

		// Binding is the whole of what happened: the command is registered and the marker is
		// declared, and nothing about any session has been touched.
		expect(double.commandNames()).toEqual(["connect-bot"]);
		expect(double.labels).toEqual(["connectBot"]);
		expect(requests).toEqual([]);
		expect(double.appended).toEqual([]);
		expect(double.widgets).toEqual([]);
		expect(double.notifications).toEqual([]);
		expect(double.timers).toEqual([]);
		expect(botSessions.get(ownerKey("never-armed"))).toBeUndefined();
	});

	test("`off` in a session that never armed sends no request and changes nothing", () => {
		const { requests, request } = panel(async () => panelAnswer(200, registered(1)));
		const double = bound(request);
		const ctx = double.context({ sessionId: "never-armed-off", cwd: "E:/work/delta" });

		double.run("connect-bot", "off", ctx);

		expect(requests).toEqual([]);
		expect(double.appended).toEqual([]);
		expect(double.widgets).toEqual([]);
		expect(double.notifications).toEqual([]);
		expect(botSessions.get(ownerKey("never-armed-off"))).toBeUndefined();
	});
});

describe("running the command again on an armed session re-registers it (E3, story 63)", () => {
	/**
	 * The runs in every test here happen while this session already believes it is armed — the
	 * panel restarted in between, so its row is gone. The command is what reconnects, and it does
	 * so by asking the panel again rather than by doing nothing.
	 */
	test("a repeat after a panel restart re-sends `register` for the same session and never an `unregister`", async () => {
		const { requests, request } = panel(async () => panelAnswer(200, registered(2)));
		const double = bound(request);
		const ctx = double.context({ sessionId: "reregister-1", cwd: "E:/work/reconnect", model: "deepseek" });

		const first = double.nextNotification();
		double.run("connect-bot", "", ctx);
		await first;

		const second = double.nextNotification();
		double.run("connect-bot", "", ctx);
		await second;

		// Two register requests for the one session and no unregister between them: the panel's row
		// is refreshed in place, never taken away and added back. Each arm carries its own state
		// report behind it, which is what the re-registered row is told.
		const envelopes = requests.map(envelopeOf);
		expect(envelopes.map(envelope => envelope.kind)).toEqual(["register", "state", "register", "state"]);
		expect(envelopes.map(envelope => envelope.sessionId)).toEqual([
			"reregister-1",
			"reregister-1",
			"reregister-1",
			"reregister-1",
		]);
		// The repeat sends the same body: it is one re-registration of one session, not a second one.
		expect(envelopes[2]?.data).toEqual({ cwd: "E:/work/reconnect", agentType: "omp", model: "deepseek" });

		// This owner keeps exactly the one record, naming the one session it registered.
		expect(botSessions.get(ownerKey("reregister-1"))?.sessionId).toBe("reregister-1");
	});

	test("the repeat after a panel restart reports the panel's own count and never empties the marker area", async () => {
		const { request } = panel(async () => panelAnswer(200, registered(3)));
		const double = bound(request);
		const ctx = double.context({ sessionId: "reregister-2", cwd: "E:/work/reconnect" });

		for (let attempt = 1; attempt <= 2; attempt += 1) {
			const announced = double.nextNotification();
			double.run("connect-bot", "", ctx);
			await announced;
		}

		// The count is the panel's answer, not something this extension accumulated: re-registering
		// cannot grow it, so both runs report the same number.
		expect(double.notifications).toEqual([
			"已接入 herdr-bot 面板（当前 3 个在线会话）",
			"已接入 herdr-bot 面板（当前 3 个在线会话）",
		]);
		// No write of the repeat ever takes the marker line out of the area.
		expect(double.widgets.length).toBeGreaterThanOrEqual(1);
		expect(double.widgets.every(write => write.lines?.join("") === MARKER_TEXT)).toBe(true);
		// `enabled` lives in memory: a repeat writes no session entry, and it starts no second
		// timer — the one heartbeat the first arm scheduled is the one the repeat keeps.
		expect(double.appended).toEqual([]);
		expect(double.timers).toHaveLength(1);
	});
});

describe("an arm that fails leaves nothing behind and can be retried (E4, story 64)", () => {
	/** The arm failure the operator is told, verbatim: the same words for every failed attempt. */
	const ARM_FAILED = "无法连接 herdr-bot，未启用；请确认面板已启动";

	test("a rejected register reports the failure, and no timer or request outlives it", async () => {
		jest.useFakeTimers();
		const attempts: Request[] = [];
		const double = bound(async (url, init = {}) => {
			attempts.push({ url, init });
			throw new Error("the panel never answered");
		});
		const sessionId = "arm-failed-reject";
		const ctx = double.context({ sessionId, cwd: "E:/work/beta" });

		const announced = double.nextNotification();
		double.run("connect-bot", "", ctx);
		await announced;

		expect(attempts.length).toBe(1);
		expect(double.notifications).toEqual([ARM_FAILED]);
		// Nothing was armed: no marker, no session entry, no record for the owner.
		expect(double.widgets).toEqual([]);
		expect(double.appended).toEqual([]);
		expect(botSessions.get(ownerKey(sessionId))).toBeUndefined();

		// Nothing outlives the failure: no further request however long the session runs, no timer
		// left behind for an arm that never happened, and nothing more said to the operator.
		jest.advanceTimersByTime(60_000);
		expect(attempts.length).toBe(1);
		expect(double.timers).toEqual([]);
		expect(double.notifications).toEqual([ARM_FAILED]);
	});

	test("a register the panel never answers fails within its configured budget", async () => {
		jest.useFakeTimers();
		const attempts: Request[] = [];
		const double = bound(
			(url, init = {}) =>
				new Promise<Response>((_resolve, reject) => {
					attempts.push({ url, init });
					// A panel that is gone never answers: the call is abandoned when the wait it declared
					// runs out — the same budget a real one would be imposed under. The clock is this
					// file's own fake one, advanced by exactly that declared wait below.
					setTimeout(() => reject(new Error("register budget exceeded")), init.timeoutMs);
				}),
		);
		const sessionId = "arm-failed-timeout";
		const ctx = double.context({ sessionId, cwd: "E:/work/beta" });

		const announced = double.nextNotification();
		double.run("connect-bot", "", ctx);
		// In flight, and nothing has been reported yet: the request owns its own budget.
		expect(attempts.length).toBe(1);
		expect(double.notifications).toEqual([]);
		expect(attempts[0]?.init.timeoutMs).toBe(connectBotConfig().requestTimeoutMs);

		// The request's own budget: the extension's configured value, advanced to rather than waited out.
		jest.advanceTimersByTime(connectBotConfig().requestTimeoutMs);
		await announced;

		// A timeout is the same outcome as a reject: the request is abandoned, the operator is told
		// this session is not connected, and nothing was armed.
		expect(double.notifications).toEqual([ARM_FAILED]);
		expect(double.widgets).toEqual([]);
		expect(botSessions.get(ownerKey(sessionId))).toBeUndefined();

		// The abandoned attempt leaves nothing behind either: no retry, no timer, no further word.
		jest.advanceTimersByTime(60_000);
		expect(attempts.length).toBe(1);
		expect(double.timers).toEqual([]);
		expect(double.notifications).toEqual([ARM_FAILED]);
	});

	test("a re-register the panel refuses takes an armed session back to unarmed", async () => {
		jest.useFakeTimers();
		const { requests, request } = scriptedPanel([
			async () => panelAnswer(200, registered(4)),
			// The panel restarted and this session is unknown to it: the re-register is refused.
			async () => panelAnswer(404, { error: "unknown-session" }),
		]);
		const double = bound(request);
		const sessionId = "reregister-refused";
		const ctx = double.context({ sessionId, cwd: "E:/work/reconnect" });

		const armed = double.nextNotification();
		double.run("connect-bot", "", ctx);
		await armed;
		expect(botSessions.get(ownerKey(sessionId))?.sessionId).toBe(sessionId);
		const timersWhileArmed = double.timers.length;

		const refused = double.nextNotification();
		double.run("connect-bot", "", ctx);
		await refused;

		// Still register-only: the refused attempt sends its register and nothing else, and the
		// operator reads the reconnect attempt's own failure.
		expect(requests.map(request => envelopeOf(request).kind)).toEqual(["register", "state", "register"]);
		expect(double.notifications).toEqual(["已接入 herdr-bot 面板（当前 4 个在线会话）", ARM_FAILED]);
		// A failed re-arm leaves the session unarmed, exactly as the first arm's failure would: the
		// marker line is removed from the area and the record is dropped.
		expect(double.widgets[double.widgets.length - 1]).toEqual({
			key: MARKER_AREA_KEY,
			lines: undefined,
			placement: MARKER_AREA_PLACEMENT,
		});
		expect(botSessions.get(ownerKey(sessionId))).toBeUndefined();
		jest.advanceTimersByTime(60_000);
		expect(requests.length).toBe(3);
		expect(double.timers.length).toBe(timersWhileArmed);
	});

	test("a failed arm can be retried: the next empty argument arms the session", async () => {
		const { requests, request } = scriptedPanel([
			async () => panelAnswer(404, { error: "unknown-session" }),
			async () => panelAnswer(200, registered(1)),
		]);
		const double = bound(request);
		const sessionId = "arm-retry";
		const ctx = double.context({ sessionId, cwd: "E:/work/gamma", model: "deepseek" });

		const refused = double.nextNotification();
		double.run("connect-bot", "", ctx);
		await refused;
		expect(double.notifications).toEqual([ARM_FAILED]);
		expect(double.widgets).toEqual([]);
		expect(botSessions.get(ownerKey(sessionId))).toBeUndefined();

		// The panel is back: running the same command again arms this session, with nothing about
		// the failed attempt in the way.
		const armed = double.nextNotification();
		double.run("connect-bot", "", ctx);
		await armed;

		expect(double.notifications).toEqual([ARM_FAILED, "已接入 herdr-bot 面板（当前 1 个在线会话）"]);
		expect(double.widgets).toEqual([
			{ key: MARKER_AREA_KEY, lines: [MARKER_TEXT], placement: MARKER_AREA_PLACEMENT },
		]);
		expect(botSessions.get(ownerKey(sessionId))?.sessionId).toBe(sessionId);
		// The failed attempt sent its register alone; the retry sent its register and the state
		// report that follows it.
		expect(requests.map(request => envelopeOf(request).kind)).toEqual(["register", "register", "state"]);
	});
});
