/**
 * `/connect-bot off` and the command's unrecognized-argument surface, at the OMP extension seam
 * (E7, E8; P28, P29, P27, P26, P36).
 *
 * The extension is driven exactly as the loader drives it: its own OMP assembly binds the
 * definition against the double, and the command the framework registered runs with a doubled
 * session context. The panel is a fake transport injected through the extension's own seam, so
 * every request is observed without a network. What `off` promises is a sequence, and the order
 * is observed rather than assumed: the local switch and the marker are already gone while the
 * `unregister` is still in flight, and only then does the panel's answer decide which of the two
 * words the operator reads. A request the panel never answers is driven with bun's fake timers,
 * so the request's configured budget is established by advancing time rather than by waiting.
 *
 * A word that is no longer a form (`offline`) and a word that never was one are the same thing to
 * this extension: an unknown argument, reported with the extension's own usage error, changing
 * nothing — no request, no record, no declared value, no marker write.
 */
import { afterEach, describe, expect, jest, test } from "bun:test";
import {
	type PushFetchInit,
	type PushHttpResponse,
	type PushTransport,
	EVENTS_PATH,
	setPushTransportForTest,
} from "../../extensions/connect-bot/shared-logic/panel/client";
import { connectBotConfig } from "../../extensions/connect-bot/shared-logic/panel/config";
import { botSessions } from "../../extensions/connect-bot/shared-logic/session/session";
import connectBot from "../../extensions/connect-bot/runtimes/omp";
import { type OmpDouble, ompDouble } from "./support/omp-double";

/** The framework's one marker-area widget, as the OMP adapter owns it. */
const MARKER_AREA_KEY = "semantic-extensions";
const MARKER_AREA_PLACEMENT = "aboveEditor";
/** The extension's marker text: what the area shows while `enabled`. */
const MARKER_TEXT = "◐ connectBot";
/** The endpoint the extension's own `config.yaml` ships; the file is the only source. */
const ENDPOINT = "http://127.0.0.1:8787";
/** The owner key the framework resolves for one main session. */
const ownerKey = (sessionId: string) => `main:${sessionId}`;

/** Arm success, verbatim, for one online session. */
const CONNECTED = "已接入 omp-bot 面板（当前 1 个在线会话）";
/** Off with the panel reachable — including a non-2xx answer such as `404` after a restart. */
const DISCONNECTED = "已断开 omp-bot 面板";
/** Off with the panel unreachable: the local switch is off; the remote row may linger. */
const UNREACHABLE = "omp-bot 面板未响应";
/** Refusal for a session with no UI at all (`--mode rpc --no-ui`, print/json). */
const NO_UI_REFUSAL = "当前模式无 UI，不支持接入面板";
/** The usage error for an unrecognized argument; `offline` is not a form any more. */
const unknownArgument = (argument: string) =>
	`未知参数「${argument}」；用法：/connect-bot（接入 omp-bot 面板）或 /connect-bot off（断开）。`;

/** One outbound request the extension made, as the transport received it. */
interface Request {
	readonly url: string;
	readonly init: PushFetchInit;
}

/** The panel's answer to one request. */
const panelAnswer = (status: number, body: unknown): PushHttpResponse => ({
	status,
	text: async () => JSON.stringify(body),
});

/** The registered receipt a reachable panel answers a `register` with. */
const registered = (onlineCount: number) => ({ outcome: "registered", onlineCount });

/**
 * The envelope fields a test reads off the wire: the two strings the contract's envelope always
 * carries, and the body, which stays `unknown` because it is what a test compares against a
 * literal.
 */
interface WireEnvelope {
	readonly sessionId: string;
	readonly kind: string;
	readonly data?: unknown;
}

/** Reads one sent request body as the `{sessionId, kind, data?}` envelope the contract fixes. */
function envelopeOf(request: Request): WireEnvelope {
	const parsed: unknown = JSON.parse(request.init.body);
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

/** Records every request and answers it from the panel the test scripted, by the envelope's kind. */
function panel(answer: (kind: string) => PushHttpResponse | Promise<PushHttpResponse>): {
	readonly requests: Request[];
	readonly transport: PushTransport;
} {
	const requests: Request[] = [];
	return {
		requests,
		transport: async (url, init) => {
			const request = { url, init };
			requests.push(request);
			return answer(envelopeOf(request).kind);
		},
	};
}

/** Binds the extension against a fresh double and injects one panel. */
function bound(transport: PushTransport): OmpDouble {
	const double = ompDouble();
	connectBot(double.api);
	// The assembly installs the platform's own transport at binding; the fake takes its place.
	setPushTransportForTest(transport);
	return double;
}

/** Runs one piece of a test while capturing the non-model channel (stderr). */
function withCapturedStderr<T>(run: () => T): { readonly diagnostics: string; readonly value: T } {
	const chunks: string[] = [];
	const original = process.stderr.write;
	process.stderr.write = ((chunk: string | Uint8Array) => {
		chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
		return true;
	}) as typeof process.stderr.write;
	try {
		const value = run();
		return { diagnostics: chunks.join(""), value };
	} finally {
		process.stderr.write = original;
	}
}

/**
 * A panel that answers the arm path's own two requests — the register, with its receipt, and the
 * state report that follows it — the way a live panel answers them, and hands every other kind to
 * `background`.
 *
 * Every test below arms a session first and then observes what the command under test sends, so
 * the arming itself must succeed the way it does against a reachable panel; the default background
 * answers everything else with an ordinary 2xx.
 */
function armingPanel(
	background: (kind: string) => PushHttpResponse | Promise<PushHttpResponse> = () => panelAnswer(200, {}),
): {
	readonly requests: Request[];
	readonly transport: PushTransport;
} {
	return panel(kind => {
		if (kind === "register") return panelAnswer(200, registered(1));
		if (kind === "state") return panelAnswer(200, {});
		return background(kind);
	});
}

/** Fake timers are per-file state: a failure case must not leave them installed for the next. */
afterEach(() => {
	jest.useRealTimers();
});

describe("`off` drops the local switch first and removes the panel row best-effort (E7, P28)", () => {
	test("the local switch and the marker are gone while the unregister is still unanswered", async () => {
		let releaseUnregister!: () => void;
		const { requests, transport } = armingPanel(
			() =>
				// The panel is reachable but slow: the answer is held until the test releases it.
				new Promise<PushHttpResponse>(resolve => {
					releaseUnregister = () => resolve(panelAnswer(200, {}));
				}),
		);
		const double = bound(transport);
		const sessionId = "off-local-first";
		const ctx = double.context({ sessionId, cwd: "E:/work/off" });

		const connected = double.nextNotification();
		double.run("connect-bot", "", ctx);
		await connected;
		expect(botSessions.get(ownerKey(sessionId))?.sessionId).toBe(sessionId);

		const announced = double.nextNotification();
		double.run("connect-bot", "off", ctx);

		// Nothing has answered the unregister yet, and the local half is already done: the record is
		// dropped and the marker line has left the area, so no network wait stands between the
		// operator's command and this session no longer claiming to be connected.
		expect(requests.map(request => envelopeOf(request).kind)).toEqual(["register", "state", "unregister"]);
		expect(botSessions.get(ownerKey(sessionId))).toBeUndefined();
		expect(double.widgets[double.widgets.length - 1]).toEqual({
			key: MARKER_AREA_KEY,
			lines: undefined,
			placement: MARKER_AREA_PLACEMENT,
		});

		// The request is the panel protocol's `unregister`: the fixed route, no `data` member, and
		// the extension's own configured best-effort budget.
		expect(requests[2]?.url).toBe(`${ENDPOINT}${EVENTS_PATH}`);
		expect(requests[2]?.init.method).toBe("POST");
		expect(requests[2]?.init.headers).toEqual({ "content-type": "application/json" });
		expect(requests[2]?.init.proxy).toBe(false);
		expect(requests[2]?.init.signal).toBeInstanceOf(AbortSignal);
		expect(requests[2]?.init.body).toBe(JSON.stringify({ sessionId, kind: "unregister" }));

		releaseUnregister();
		await announced;
		expect(double.notifications).toEqual([CONNECTED, DISCONNECTED]);
	});

	/**
	 * Any HTTP answer means the panel is reachable, so the row is gone: a 2xx is the ordinary case
	 * and a `404` is what a restarted omp-bot answers for a session it has forgotten.
	 */
	const reachable: ReadonlyArray<readonly [string, number]> = [
		["a 2xx answer", 200],
		["a 404 after an omp-bot restart", 404],
	];

	for (const [label, status] of reachable) {
		test(`${label} reports the disconnect`, async () => {
			const { requests, transport } = armingPanel(() => panelAnswer(status, { error: "whatever" }));
			const double = bound(transport);
			const sessionId = `off-reachable-${status}`;
			const ctx = double.context({ sessionId, cwd: "E:/work/off" });

			const connected = double.nextNotification();
			double.run("connect-bot", "", ctx);
			await connected;

			const announced = double.nextNotification();
			double.run("connect-bot", "off", ctx);
			await announced;

			expect(requests.map(request => envelopeOf(request).kind)).toEqual(["register", "state", "unregister"]);
			expect(double.notifications).toEqual([CONNECTED, DISCONNECTED]);
			// The disconnect is information, not an error: the effect happened.
			expect(double.notificationLevels).toEqual(["info", "info"]);
			// Disconnected either way: the record is dropped and the marker line is removed.
			expect(botSessions.get(ownerKey(sessionId))).toBeUndefined();
			expect(double.widgets[double.widgets.length - 1]?.lines).toBeUndefined();
		});
	}

	test("a request that never completes reports the panel did not answer, and the session is already off", async () => {
		const { requests, transport } = armingPanel(() => {
			throw new Error("the panel never answered");
		});
		const double = bound(transport);
		const sessionId = "off-unreachable";
		const ctx = double.context({ sessionId, cwd: "E:/work/off" });

		const connected = double.nextNotification();
		double.run("connect-bot", "", ctx);
		await connected;

		const announced = double.nextNotification();
		double.run("connect-bot", "off", ctx);
		await announced;

		expect(requests.map(request => envelopeOf(request).kind)).toEqual(["register", "state", "unregister"]);
		expect(double.notifications).toEqual([CONNECTED, UNREACHABLE]);
		// "The panel did not answer" is an error: the effect the operator asked for did not happen.
		expect(double.notificationLevels).toEqual(["info", "error"]);
		// The local switch was off before the panel was asked, and it stays off: the failure to
		// remove the row is reported, never repaired by pretending the session is still connected.
		expect(botSessions.get(ownerKey(sessionId))).toBeUndefined();
		expect(double.widgets[double.widgets.length - 1]?.lines).toBeUndefined();
	});

	test("an unregister the panel never answers aborts within its configured budget", async () => {
		jest.useFakeTimers();
		const requests: Request[] = [];
		const double = bound((url, init) => {
			const request = { url, init };
			requests.push(request);
			const kind = envelopeOf(request).kind;
			if (kind === "register") return Promise.resolve(panelAnswer(200, registered(1)));
			if (kind === "state") return Promise.resolve(panelAnswer(200, {}));
			return new Promise<PushHttpResponse>((_resolve, reject) => {
				// A panel that is gone never answers; the request ends the way an aborted fetch does.
				init.signal.addEventListener("abort", () => reject(new Error("unregister budget exceeded")));
			});
		});
		const sessionId = "off-timeout";
		const ctx = double.context({ sessionId, cwd: "E:/work/off" });

		const connected = double.nextNotification();
		double.run("connect-bot", "", ctx);
		await connected;

		const announced = double.nextNotification();
		double.run("connect-bot", "off", ctx);
		// In flight, and nothing has been reported yet: the request owns its own budget.
		expect(requests.map(request => envelopeOf(request).kind)).toEqual(["register", "state", "unregister"]);
		expect(double.notifications).toEqual([CONNECTED]);

		// The request's own budget: the extension's configured value, advanced to rather than waited out.
		jest.advanceTimersByTime(connectBotConfig().requestTimeoutMs);
		await announced;

		expect(requests[2]?.init.signal.aborted).toBe(true);
		expect(double.notifications).toEqual([CONNECTED, UNREACHABLE]);
		expect(double.notificationLevels).toEqual(["info", "error"]);
		expect(botSessions.get(ownerKey(sessionId))).toBeUndefined();
	});

	test("after off the session is unarmed again: a second off does nothing at all", async () => {
		const { requests, transport } = armingPanel();
		const double = bound(transport);
		const sessionId = "off-twice";
		const ctx = double.context({ sessionId, cwd: "E:/work/off" });

		const connected = double.nextNotification();
		double.run("connect-bot", "", ctx);
		await connected;
		const off = double.nextNotification();
		double.run("connect-bot", "off", ctx);
		await off;

		// The session is unarmed: the second command is silent — no request, no notice, no write —
		// and nothing about it schedules anything later.
		double.run("connect-bot", "off", ctx);

		expect(requests.map(request => envelopeOf(request).kind)).toEqual(["register", "state", "unregister"]);
		expect(double.notifications).toEqual([CONNECTED, DISCONNECTED]);
		expect(double.appended).toEqual([]);
		// The off left the arm's heartbeat cancelled and started nothing in its place: one timer in
		// total, and it is the one this session stopped.
		expect(double.timers).toHaveLength(1);
		expect(double.timers[0]?.cancelled).toBe(true);
		expect(botSessions.get(ownerKey(sessionId))).toBeUndefined();
	});

	test("off in a session that never armed sends no request and says nothing", () => {
		const { requests, transport } = armingPanel();
		const double = bound(transport);
		const ctx = double.context({ sessionId: "off-never-armed", cwd: "E:/work/off" });

		double.run("connect-bot", "off", ctx);

		expect(requests).toEqual([]);
		expect(double.notifications).toEqual([]);
		expect(double.appended).toEqual([]);
		expect(double.widgets).toEqual([]);
		expect(double.timers).toEqual([]);
		expect(botSessions.get(ownerKey("off-never-armed"))).toBeUndefined();
	});
});

describe("an unrecognized argument is an error that changes nothing (E8, P29)", () => {
	test("`offline` is no longer a form: it reports the usage error and leaves the session connected", async () => {
		const { requests, transport } = armingPanel();
		const double = bound(transport);
		const sessionId = "unknown-offline";
		const ctx = double.context({ sessionId, cwd: "E:/work/off" });

		const connected = double.nextNotification();
		double.run("connect-bot", "", ctx);
		await connected;
		const widgetsWhileConnected = double.widgets.length;

		double.run("connect-bot", "offline", ctx);

		// The argument is the text the user typed, echoed verbatim; the hint names the one word
		// form this command has now.
		expect(double.notifications).toEqual([CONNECTED, unknownArgument("offline")]);
		expect(double.notificationLevels).toEqual(["info", "error"]);
		// Nothing was sent, nothing was written, and the session is still connected exactly as it was.
		expect(requests.map(request => envelopeOf(request).kind)).toEqual(["register", "state"]);
		expect(double.widgets.length).toBe(widgetsWhileConnected);
		expect(double.appended).toEqual([]);
		expect(botSessions.get(ownerKey(sessionId))?.sessionId).toBe(sessionId);
	});

	test("an unknown argument in a session that never armed sends no request and writes nothing", () => {
		const { requests, transport } = armingPanel();
		const double = bound(transport);
		const ctx = double.context({ sessionId: "unknown-never-armed", cwd: "E:/work/off" });

		double.run("connect-bot", "yes please", ctx);

		expect(double.notifications).toEqual([unknownArgument("yes please")]);
		expect(double.notificationLevels).toEqual(["error"]);
		expect(requests).toEqual([]);
		expect(double.appended).toEqual([]);
		expect(double.widgets).toEqual([]);
		expect(botSessions.get(ownerKey("unknown-never-armed"))).toBeUndefined();
	});
});

describe("the gate `/connect-bot` runs behind covers `off` and rule-breakers alike (E6, P27)", () => {
	test("a subagent running off is refused in silence: no request, no write, no words", () => {
		const { requests, transport } = armingPanel();
		const double = bound(transport);
		const ctx = double.context({ sessionId: "off-subagent", cwd: "E:/work/sub", kind: "sub" });

		const refusal = withCapturedStderr(() => double.run("connect-bot", "off", ctx));

		expect(refusal.diagnostics).not.toContain(NO_UI_REFUSAL);
		expect(requests).toEqual([]);
		expect(double.notifications).toEqual([]);
		expect(double.widgets).toEqual([]);
		expect(double.appended).toEqual([]);
		expect(botSessions.get(ownerKey("off-subagent"))).toBeUndefined();
	});

	test("a session without a UI refuses off on stderr and changes nothing", () => {
		const { requests, transport } = armingPanel();
		const double = bound(transport);
		const ctx = double.context({ sessionId: "off-no-ui", cwd: "E:/work/headless", hasUI: false });

		const refusal = withCapturedStderr(() => double.run("connect-bot", "off", ctx));

		expect(refusal.diagnostics).toBe(`${NO_UI_REFUSAL}\n`);
		expect(requests).toEqual([]);
		expect(double.notifications).toEqual([]);
		expect(double.widgets).toEqual([]);
		expect(botSessions.get(ownerKey("off-no-ui"))).toBeUndefined();
	});

	test("a session without a UI refuses an unknown argument with the no-UI refusal, not the usage error", () => {
		const { requests, transport } = armingPanel();
		const double = bound(transport);
		const ctx = double.context({ sessionId: "unknown-no-ui", cwd: "E:/work/headless", hasUI: false });

		const refusal = withCapturedStderr(() => double.run("connect-bot", "offline", ctx));

		// The gate is consulted before the argument matters: no UI refuses the command outright.
		expect(refusal.diagnostics).toBe(`${NO_UI_REFUSAL}\n`);
		expect(double.notifications).toEqual([]);
		expect(requests).toEqual([]);
		expect(botSessions.get(ownerKey("unknown-no-ui"))).toBeUndefined();
	});
});
