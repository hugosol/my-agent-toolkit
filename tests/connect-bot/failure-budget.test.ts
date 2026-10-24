/**
 * The failure budget at the OMP extension seam: what an armed session does when the panel stops
 * taking its pushes (E10; P31, P36, P38, P40).
 *
 * The extension is driven exactly as the loader drives it: its own OMP assembly binds the
 * definition against the double, and the command the framework registered runs with a doubled
 * session context. The panel is a fake HTTP call injected through the extension's own seam, so
 * every request is observed without a network, and each test's session id is its own so nothing
 * about one case can leak into the next.
 *
 * The beats are fired through the managed timer the harness recorded, as the harness would, and
 * what a beat settles to is decided by the panel: an answer, a non-2xx answer, or a request that
 * never completes. All three are what the budget counts, so all three are driven here — the one
 * that never completes through bun's fake timers, whose whole point is that the configured request
 * budget runs out without a wall-clock wait.
 *
 * What is observed is the sequence the promise names: one notice on the first failure of an
 * outage and none before the budget runs out, a third consecutive failure that ends the connection
 * (the marker line leaves the area and nothing is retried or re-registered), and a reset that
 * makes the next outage announce itself again.
 */
import { afterEach, describe, expect, jest, test } from "bun:test";
import * as path from "node:path";
import {
	type PanelRequest,
	setPanelRequestForTest,
} from "../../extensions/connect-bot/shared-logic/panel/client";
import type { HttpRequestOptions, HttpRequestResult } from "../../framework/interface/general/http";
import { CONNECT_BOT } from "../../extensions/connect-bot/definition";
import { botSessions } from "../../extensions/connect-bot/shared-logic/session/session";
import connectBot from "../../extensions/connect-bot/harnesses/omp";
import { readConfig } from "../../framework/core/config";
import { REPO_ROOT } from "../harness-dock/baseline";
import { type OmpDouble, ompDouble } from "./support/omp-double";

/**
 * The wait budget the repository's own `config.yaml` gives every request — the background push
 * included — as the framework's read of that file reports it. The file is the only source of the
 * value, so it is read rather than repeated as a literal.
 */
const REQUEST_TIMEOUT_MS = readConfig(path.join(REPO_ROOT, "extensions", "connect-bot", "config.yaml"), {
	fields: CONNECT_BOT.config?.fields,
}).requestTimeoutMs as number;

/** The framework's one marker-area widget, as the OMP adapter owns it. */
const MARKER_AREA_KEY = "semantic-extensions";
const MARKER_AREA_PLACEMENT = "aboveEditor";
/** The extension's marker text: what the area shows while `enabled`. */
const MARKER_TEXT = "◐ connectBot";
/** The owner key the framework resolves for one main session. */
const ownerKey = (sessionId: string) => `main:${sessionId}`;

/** Arm success, verbatim, for one online session. */
const CONNECTED = "已接入 herdr-bot 面板（当前 1 个在线会话）";
/** The first failure of an outage, verbatim from the frozen baseline. */
const FIRST_FAILURE = "与 herdr-bot 面板连接中断；若持续失败将自动断开";
/** The budget running out, verbatim from the frozen baseline. */
const AUTO_DISARM = "与 herdr-bot 连接中断，已断开；重新执行 /connect-bot 可重连";

/** One outbound request the extension made, as the framework's call received it. */
interface Request {
	readonly url: string;
	readonly init: HttpRequestOptions;
}

/** The panel's answer to one request. */
const panelAnswer = (status: number, body: unknown): HttpRequestResult =>
	({ ok: true as const, response: new Response(JSON.stringify(body), { status }) });

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

/**
 * The three answers a background push can get, which together are every way the budget's failure
 * criterion is stated: the request never completes, the panel answers a non-2xx for a session it
 * no longer knows, and the panel takes the push.
 */
const answers = {
	/** The panel is gone: HTTP reports a failure result, which the panel client exposes as rejection. */
	gone: async (): Promise<HttpRequestResult> => {
		return { ok: false as const, failure: { kind: "transport" as const, error: new Error("the panel never answered") } };
	},
	/** The panel is reachable but has forgotten this session, as after a herdr-bot restart. */
	unknownSession: async () => panelAnswer(404, { error: "unknown-session" }),
	/** The panel takes the push. */
	reachable: async () => panelAnswer(200, { outcome: "accepted" }),
} as const;

/** One answer a push can get. */
type Answer = (typeof answers)[keyof typeof answers];

/**
 * The panel one test drives: it registers every session, answers each background push the way its
 * current answer says, and can hold a push on the wire so a test sees what happens to what settles
 * behind it.
 */
interface Panel {
	readonly requests: Request[];
	readonly request: PanelRequest;
	/** What the panel does with the next background push. */
	keep(answer: Answer): void;
	/** Holds every background push from now on until {@link release}, as a silent panel does. */
	hold(): void;
	/** Settles what was held, with the answer in force at this moment. */
	release(): void;
}

function panel(answer: Answer): Panel {
	const requests: Request[] = [];
	const held: Array<() => void> = [];
	let current: Answer = answer;
	let holding = false;
	return {
		requests,
		request: async (url, init = {}) => {
			const request = { url, init };
			requests.push(request);
			const kind = envelopeOf(request).kind;
			if (kind === "register") {
				return panelAnswer(200, { outcome: "registered", onlineCount: 1 });
			}
			// Initial arming starts with a drained queue. A held re-registration state push,
			// however, must take the scripted answer rather than silently clear the outage.
			if (kind === "state" && !holding) {
				return panelAnswer(200, { outcome: "accepted" });
			}
			if (holding) {
				return new Promise<HttpRequestResult>(resolve => held.push(() => resolve(current())));
			}
			return current();
		},
		keep: next => {
			current = next;
		},
		hold: () => {
			holding = true;
		},
		release: () => {
			holding = false;
			for (const settle of held.splice(0)) settle();
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
 * Arms one session and returns the double plus the context it runs in. The framework never awaits
 * an injected command implementation, so the notification is the arm effect's own completion — and
 * the state report the arm path sends behind its register is then let settle too, so the connection
 * each test takes down is up, with its queue drained, before the outage begins.
 */
async function armed(request: PanelRequest, sessionId: string): Promise<OmpDouble> {
	const double = bound(request);
	const announced = double.nextNotification();
	double.run("connect-bot", "", double.context({ sessionId, cwd: "E:/work/budget" }));
	await announced;
	await settleAll();
	return double;
}

/** Fires the callback the harness recorded for the nth managed timer, as the harness would. */
function fireTimer(double: OmpDouble, index = 0): void {
	double.timers[index]?.callback();
}

/** Lets a promise chain — the flusher's drain loop, a settled request — run to its end. */
async function settleAll(): Promise<void> {
	for (let turn = 0; turn < 200; turn += 1) await Promise.resolve();
}

/** The kinds of request the extension sent, in order. */
function kinds(sent: Panel): string[] {
	return sent.requests.map(envelopeOf).map(envelope => envelope.kind);
}

/** Fake timers are per-file state: a failure case must not leave them installed for the next. */
afterEach(() => {
	jest.useRealTimers();
});

describe("the first failure of an outage is announced once (E10, P31)", () => {
	test("the first failed beat is announced and the second is counted silently", async () => {
		const sent = panel(answers.gone);
		const double = await armed(sent.request, "budget-first");

		fireTimer(double);
		await settleAll();

		// One beat went, it failed, and the operator heard about it: the connection is still up, and
		// this is the notice that says so before the budget runs out.
		expect(kinds(sent)).toEqual(["register", "state", "heartbeat"]);
		expect(double.notifications).toEqual([CONNECTED, FIRST_FAILURE]);
		expect(double.notificationLevels).toEqual(["info", "error"]);

		fireTimer(double);
		await settleAll();

		// The second failure is the same outage already announced: counted, and not said again.
		expect(kinds(sent)).toEqual(["register", "state", "heartbeat", "heartbeat"]);
		expect(double.notifications).toEqual([CONNECTED, FIRST_FAILURE]);

		// One failure short of the budget, this session is still connected: its heartbeat runs and
		// its record — the connection the effects act on — is still there.
		expect(double.timers).toHaveLength(1);
		expect(double.timers[0]?.cancelled).toBe(false);
		expect(double.widgets[double.widgets.length - 1]?.lines).toEqual([MARKER_TEXT]);
		expect(botSessions.get(ownerKey("budget-first"))).toBeDefined();
	});

	test("a push the panel never answers is one failure of the budget", async () => {
		jest.useFakeTimers();
		const requests: Request[] = [];
		const double = await armed((url, init = {}) => {
			const request = { url, init };
			requests.push(request);
			const kind = envelopeOf(request).kind;
			if (kind === "register") {
				return Promise.resolve(panelAnswer(200, { outcome: "registered", onlineCount: 1 }));
			}
			if (kind === "state") {
				return Promise.resolve(panelAnswer(200, { outcome: "accepted" }));
			}
			return new Promise<HttpRequestResult>((resolve) => {
				// A panel that is gone never answers: the push is abandoned when the wait it declared
				// runs out, on this file's own fake clock, advanced by exactly that budget below.
				setTimeout(() => resolve({ ok: false, failure: { kind: "timeout", error: new Error("push budget exceeded") } }), init.timeoutMs);
			});
		}, "budget-timeout");

		fireTimer(double);
		expect(double.notifications).toEqual([CONNECTED]);

		// The configured budget every request waits — the queued push included — runs out, the
		// request is abandoned, and the failure is accounted like any other: the outage is announced
		// on this first failure, not on a later one.
		jest.advanceTimersByTime(REQUEST_TIMEOUT_MS);
		await settleAll();

		// The push that ran out of budget is the beat, and the wait it declared is the extension's
		// configured budget rather than a constant of this file.
		const beats = requests.filter(request => envelopeOf(request).kind === "heartbeat");
		expect(beats[beats.length - 1]?.init.timeoutMs).toBe(REQUEST_TIMEOUT_MS);
		expect(double.notifications).toEqual([CONNECTED, FIRST_FAILURE]);
	});
});

describe("three consecutive failures end the connection by themselves (E10, P31, P36, P38, P40)", () => {
	test("the third failed beat auto-disarms: local stop, marker gone, one notice", async () => {
		const sent = panel(answers.unknownSession);
		const double = await armed(sent.request, "budget-third");

		fireTimer(double);
		await settleAll();
		fireTimer(double);
		await settleAll();
		expect(double.notifications).toEqual([CONNECTED, FIRST_FAILURE]);

		fireTimer(double);
		await settleAll();

		// Three beats, each answered non-2xx — a reachable panel that has forgotten this session
		// counts as failing — and the third one ends the connection with the second notice.
		expect(kinds(sent)).toEqual(["register", "state", "heartbeat", "heartbeat", "heartbeat"]);
		expect(double.notifications).toEqual([CONNECTED, FIRST_FAILURE, AUTO_DISARM]);
		expect(double.notificationLevels).toEqual(["info", "error", "error"]);

		// The local half of the disconnect: the heartbeat is cancelled and the record is gone, so no
		// effect of this owner has anything left to act on.
		expect(double.timers).toHaveLength(1);
		expect(double.timers[0]?.cancelled).toBe(true);
		expect(botSessions.get(ownerKey("budget-third"))).toBeUndefined();

		// The declared value went false through the one write path a background callback has — the
		// capability the arm delivery retained — and that is what takes the marker line out of the
		// area: exactly one write added the line, exactly one removed it, and nothing else was said.
		expect(double.widgets).toEqual([
			{ key: MARKER_AREA_KEY, lines: [MARKER_TEXT], placement: MARKER_AREA_PLACEMENT },
			{ key: MARKER_AREA_KEY, lines: undefined, placement: MARKER_AREA_PLACEMENT },
		]);

		// Nothing reconnects, and nothing is left behind: the panel is never asked to unregister the
		// row the operator can no longer see removed, the cancelled timer says nothing if it fires,
		// and settling everything again produces no request and no word.
		fireTimer(double);
		await settleAll();
		expect(kinds(sent)).toEqual(["register", "state", "heartbeat", "heartbeat", "heartbeat"]);
		expect(double.notifications).toEqual([CONNECTED, FIRST_FAILURE, AUTO_DISARM]);
		expect(double.widgets).toHaveLength(2);
	});

	test("a beat queued behind the failing one never goes, and its answer is accounted to nobody", async () => {
		const sent = panel(answers.gone);
		const double = await armed(sent.request, "budget-late");

		fireTimer(double);
		await settleAll();
		fireTimer(double);
		await settleAll();
		expect(double.notifications).toEqual([CONNECTED, FIRST_FAILURE]);

		// The panel stops answering: the third beat is on the wire, unanswered, and a fourth waits
		// behind it in the queue — the shape in which an answer arrives after the connection ended.
		sent.hold();
		fireTimer(double);
		await settleAll();
		fireTimer(double);
		await settleAll();
		expect(kinds(sent)).toEqual(["register", "state", "heartbeat", "heartbeat", "heartbeat"]);

		sent.release();
		await settleAll();

		// The third failure ended the connection, and the beat the queue was still holding went
		// nowhere: the stop dropped it before it could be sent.
		expect(double.notifications).toEqual([CONNECTED, FIRST_FAILURE, AUTO_DISARM]);
		expect(kinds(sent)).toEqual(["register", "state", "heartbeat", "heartbeat", "heartbeat"]);
		expect(botSessions.get(ownerKey("budget-late"))).toBeUndefined();

		// And nothing after the stop writes state back: no marker republish, no further notice.
		fireTimer(double);
		await settleAll();
		expect(double.widgets).toHaveLength(2);
		expect(double.notifications).toHaveLength(3);
	});
});

describe("a push the panel takes resets the segment (E10, P31)", () => {
	test("a successful beat clears the count and the flag, so the next outage announces itself again", async () => {
		const sent = panel(answers.gone);
		const double = await armed(sent.request, "budget-reset");

		fireTimer(double);
		await settleAll();
		fireTimer(double);
		await settleAll();
		expect(double.notifications).toEqual([CONNECTED, FIRST_FAILURE]);

		// The panel comes back: the beat that reaches it ends the outage.
		sent.keep(answers.reachable);
		fireTimer(double);
		await settleAll();
		expect(double.notifications).toEqual([CONNECTED, FIRST_FAILURE]);

		// The panel goes quiet again. The first failure of this new outage is announced as such —
		// the flag was cleared — and the count started over with it, so two more failures are still
		// short of ending a connection that had already failed twice before the success.
		sent.keep(answers.gone);
		fireTimer(double);
		await settleAll();
		expect(double.notifications).toEqual([CONNECTED, FIRST_FAILURE, FIRST_FAILURE]);
		fireTimer(double);
		await settleAll();
		expect(double.notifications).toEqual([CONNECTED, FIRST_FAILURE, FIRST_FAILURE]);
		expect(double.timers[0]?.cancelled).toBe(false);

		// The segment that follows the reset still counts to the budget: the third failure of this
		// one — the sixth failed beat of the session — is what ends the connection.
		fireTimer(double);
		await settleAll();
		expect(double.notifications).toEqual([CONNECTED, FIRST_FAILURE, FIRST_FAILURE, AUTO_DISARM]);
		expect(botSessions.get(ownerKey("budget-reset"))).toBeUndefined();
	});

	test("a re-register is a fresh start: the budget the record holds begins again", async () => {
		const sent = panel(answers.gone);
		const double = await armed(sent.request, "budget-rearm");

		fireTimer(double);
		await settleAll();
		fireTimer(double);
		await settleAll();
		expect(double.notifications).toEqual([CONNECTED, FIRST_FAILURE]);

		// Register always succeeds, but hold every following push: a successful state report must
		// not be allowed to reset health on behalf of the registration under test.
		sent.hold();
		const announced = double.nextNotification();
		double.run("connect-bot", "", double.context({ sessionId: "budget-rearm", cwd: "E:/work/budget" }));
		await announced;
		expect(double.notifications).toEqual([CONNECTED, FIRST_FAILURE, CONNECTED]);
		expect(double.timers).toHaveLength(1);
		expect(double.timers[0]?.cancelled).toBe(false);

		await settleAll();
		expect(kinds(sent)).toEqual(["register", "state", "heartbeat", "heartbeat", "register", "state"]);
		// The held state now fails, with no intervening successful push. Without registration's
		// reset this would be failure three and would disconnect instead of starting a new segment.
		sent.release();
		await settleAll();
		expect(double.notifications).toEqual([CONNECTED, FIRST_FAILURE, CONNECTED, FIRST_FAILURE]);
		expect(botSessions.get(ownerKey("budget-rearm"))).toBeDefined();
		fireTimer(double);
		await settleAll();
		expect(double.notifications).toEqual([CONNECTED, FIRST_FAILURE, CONNECTED, FIRST_FAILURE]);
		expect(double.timers[0]?.cancelled).toBe(false);
		fireTimer(double);
		await settleAll();
		expect(double.notifications).toEqual([CONNECTED, FIRST_FAILURE, CONNECTED, FIRST_FAILURE, AUTO_DISARM]);
		expect(botSessions.get(ownerKey("budget-rearm"))).toBeUndefined();
	});
});
