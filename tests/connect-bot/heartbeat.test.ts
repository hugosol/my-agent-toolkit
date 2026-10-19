/**
 * The heartbeat and the outbound queue a background push leaves through, at the OMP extension seam
 * (E9, E11; P30, P32).
 *
 * The extension is driven exactly as the loader drives it: its own OMP assembly binds the
 * definition against the double, and the command the framework registered runs with a doubled
 * session context. The panel is a fake HTTP call injected through the extension's own seam, so
 * every request is observed without a network.
 *
 * The beat itself is observed at the seam it really has: the extension asks the harness for a
 * managed interval, so the period it asked for is the whole of its cadence, and the test fires the
 * callback the harness recorded instead of waiting ten wall-clock seconds for it. What the beat
 * does — one `heartbeat` carrying the state the owner holds — is then read off the wire, as is
 * what the queue does while a push is in flight, what `off` does to both, and how long a push is
 * allowed to take before the flusher drops it.
 */
import { afterEach, describe, expect, jest, test } from "bun:test";
import * as path from "node:path";
import {
	type PanelRequest,
	EVENTS_PATH,
	setPanelRequestForTest,
} from "../../extensions/connect-bot/shared-logic/panel/client";
import type { HttpRequestOptions } from "../../framework/interface/general/http";
import { CONNECT_BOT } from "../../extensions/connect-bot/definition";
import { readConfig } from "../../framework/core/config";
import { OUTBOX_LIMIT } from "../../extensions/connect-bot/shared-logic/panel/outbox";
import { botSessions } from "../../extensions/connect-bot/shared-logic/session/session";
import connectBot from "../../extensions/connect-bot/harnesses/omp";
import { REPO_ROOT } from "../harness-dock/baseline";
import { type OmpDouble, ompDouble } from "./support/omp-double";

/** The endpoint the extension's own `config.yaml` ships; the file is the only source. */
const ENDPOINT = "http://127.0.0.1:8787";
/**
 * The wait budget the repository's own `config.yaml` gives every request — a background push
 * included — as the framework's read of that file reports it. Read from the file rather than
 * repeated as a literal, because the file is the only source of the value.
 */
const REQUEST_TIMEOUT_MS = readConfig(path.join(REPO_ROOT, "extensions", "connect-bot", "config.yaml"), {
	fields: CONNECT_BOT.config?.fields,
}).requestTimeoutMs as number;
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
 * The envelope fields a test reads off the wire. The parsed body is narrowed field by field before
 * anything is read, so a mistyped field fails here rather than silently comparing `undefined`.
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

/** Every request the extension made, plus what the flusher did with them. */
interface Panel {
	readonly requests: Request[];
	/** The largest number of pushes the extension had on the wire at once. */
	readonly maxInFlight: () => number;
	readonly request: PanelRequest;
}

/**
 * A panel that registers every session at once, answers the state report the arm path sends behind
 * its register, and hands each `heartbeat` to `answerHeartbeat` — which is what lets a test hold a
 * background push in flight and see what the queue does behind it.
 */
function panel(answerHeartbeat: (request: Request) => Promise<Response>): Panel {
	const requests: Request[] = [];
	let inFlight = 0;
	let peak = 0;
	return {
		requests,
		maxInFlight: () => peak,
		request: async (url, init = {}) => {
			const request = { url, init };
			requests.push(request);
			const kind = envelopeOf(request).kind;
			if (kind === "register") return panelAnswer(200, registered(1));
			// Part of the connection, not part of what a queue test drives: the arm's own state
			// report is answered the way any live panel answers it, and counts as no beat in flight.
			if (kind === "state") return panelAnswer(200, { outcome: "accepted" });
			inFlight += 1;
			peak = Math.max(peak, inFlight);
			try {
				return await answerHeartbeat(request);
			} finally {
				inFlight -= 1;
			}
		},
	};
}

/** The ordinary panel: every push is answered as soon as it arrives. */
const reachablePanel = (): Panel => panel(async () => panelAnswer(200, { outcome: "accepted" }));

/** A panel that holds every heartbeat until the test says it is reachable again. */
function stalledPanel(): Panel & { readonly release: () => void } {
	const held: Array<() => void> = [];
	let reachable = false;
	const stalled = panel(request => {
		if (reachable) return Promise.resolve(panelAnswer(200, { outcome: "accepted" }));
		return new Promise<Response>(resolve => held.push(() => resolve(panelAnswer(200, {}))));
	});
	return {
		...stalled,
		release: () => {
			reachable = true;
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
 * the state report sent behind the register is then let settle, so every test below starts from a
 * connection whose queue is drained and with its one timer already running.
 */
async function armed(request: PanelRequest, sessionId: string, idle?: boolean): Promise<OmpDouble> {
	const double = bound(request);
	const announced = double.nextNotification();
	double.run("connect-bot", "", double.context({ sessionId, cwd: "E:/work/beat", idle }));
	await announced;
	await settleAll();
	return double;
}

/** Fires the callback the harness recorded for the nth managed timer, as the harness would. */
function fireTimer(double: OmpDouble, index = 0): void {
	double.timers[index]?.callback();
}

/** Lets a promise chain — the flusher's drain loop, an aborted request — run to its end. */
async function settleAll(): Promise<void> {
	for (let turn = 0; turn < 200; turn += 1) await Promise.resolve();
}

/** Fake timers are per-file state: a failure case must not leave them installed for the next. */
afterEach(() => {
	jest.useRealTimers();
});

describe("an armed session beats on its one managed interval with the state it holds (E9, P30)", () => {
	test("the empty argument schedules one heartbeat carrying the state the panel is owed", async () => {
		const { requests, request } = reachablePanel();
		const double = await armed(request, "beat-1");

		// The one periodic effect of this owner: a managed interval, and nothing else scheduled at
		// all. Its period is what the cadence run advances time by — `budget-regression.test.ts`
		// proves one beat per period of controlled time, and the harness's own 10s per beat against
		// the actual panel — so this file observes the one interval and its cancellation, not a value.
		expect(double.timers).toHaveLength(1);
		expect(double.timers[0]?.cancelled).toBe(false);
		// Arming asked the panel and told it the state it holds: the beat is what follows.
		expect(requests.map(envelopeOf).map(envelope => envelope.kind)).toEqual(["register", "state"]);

		fireTimer(double);
		await settleAll();

		// One beat: the protocol's route, a fixed envelope, and the state this idle session holds.
		expect(requests.map(envelopeOf)).toEqual([
			{ sessionId: "beat-1", kind: "register", data: { cwd: "E:/work/beat" } },
			{ sessionId: "beat-1", kind: "state", data: { value: "idle", reason: "register" } },
			{ sessionId: "beat-1", kind: "heartbeat", data: { value: "idle" } },
		]);
		expect(requests[2]?.url).toBe(`${ENDPOINT}${EVENTS_PATH}`);
		expect(requests[2]?.init.method).toBe("POST");
		expect(requests[2]?.init.headers).toEqual({ "content-type": "application/json" });
		expect(requests[2]?.init.proxy).toBe(false);
		// A queued push declares the extension's own configured budget — never the register's, and
		// never an endless one. How long that wait really is, against a panel that answers late, is
		// what `request-timeout.test.ts` establishes (P19).
		expect(requests[2]?.init.timeoutMs).toBe(REQUEST_TIMEOUT_MS);

		// The next beat says the same thing again: the panel's keepAlive is the repetition.
		fireTimer(double);
		await settleAll();
		expect(requests.filter(request => envelopeOf(request).kind === "heartbeat")).toHaveLength(2);
		expect(double.timers).toHaveLength(1);
	});

	test("a session the harness reports as working beats 工作中, not a fabricated 空闲", async () => {
		const { requests, request } = reachablePanel();
		const double = await armed(request, "beat-working", false);

		fireTimer(double);
		await settleAll();

		// The beat carries the state the record holds — and the arm's own report said the same thing.
		const beats = requests.filter(request => envelopeOf(request).kind === "heartbeat");
		expect(beats).toHaveLength(1);
		expect(envelopeOf(beats[0]!).data).toEqual({ value: "working" });
	});
});

describe("no heartbeat exists before an arm and none survives an `off` (E5, P28)", () => {
	test("`off` on a session that never armed schedules no timer and sends nothing", () => {
		const { requests, request } = reachablePanel();
		const double = bound(request);

		double.run("connect-bot", "off", double.context({ sessionId: "beat-never", cwd: "E:/work/beat" }));

		expect(double.timers).toEqual([]);
		expect(requests).toEqual([]);
		expect(botSessions.get(ownerKey("beat-never"))).toBeUndefined();
	});

	test("`off` cancels the owner's timer, drops its queue, and a beat that still fires says nothing", async () => {
		const { requests, request } = reachablePanel();
		const double = await armed(request, "beat-off");
		const ctx = double.context({ sessionId: "beat-off", cwd: "E:/work/beat" });

		const announced = double.nextNotification();
		double.run("connect-bot", "off", ctx);
		await announced;

		// The stop went through the one entry point: the timer is cancelled and the owner's record
		// — the thing a beat reads to decide what to send — is gone before the request is answered.
		expect(double.timers[0]?.cancelled).toBe(true);
		expect(botSessions.get(ownerKey("beat-off"))).toBeUndefined();

		// Even the beat that was already running when the timer was cancelled finds nothing to say.
		fireTimer(double);
		await settleAll();
		expect(requests.map(envelopeOf).map(envelope => envelope.kind)).toEqual(["register", "state", "unregister"]);
	});
});

describe("a repeat is the same connection asked again (E3)", () => {
	test("re-arming keeps the one timer and drops what the old connection had queued", async () => {
		const stalled = stalledPanel();
		const double = await armed(stalled.request, "beat-repeat");

		// One beat is on the wire and a second is waiting behind it: the panel has stopped answering.
		fireTimer(double);
		fireTimer(double);
		await settleAll();
		expect(stalled.requests.filter(request => envelopeOf(request).kind === "heartbeat")).toHaveLength(1);

		const announced = double.nextNotification();
		double.run("connect-bot", "", double.context({ sessionId: "beat-repeat", cwd: "E:/work/beat" }));
		await announced;

		// Asking the panel again leaves the running heartbeat where it is: a second timer would put
		// two beats on the wire for every period.
		expect(double.timers).toHaveLength(1);
		expect(double.timers[0]?.cancelled).toBe(false);

		// What the old connection had queued is dropped — the register the panel just answered says
		// everything those beats would have said — while the beat already on the wire settles, and
		// the re-arm reports the state of the row it just registered.
		stalled.release();
		await settleAll();
		expect(stalled.requests.map(envelopeOf).map(envelope => envelope.kind)).toEqual([
			"register",
			"state",
			"heartbeat",
			"register",
			"state",
		]);
	});
});

describe("a queued push waits the configured budget and is never retried (E11, P32)", () => {
	test("a heartbeat the panel never answers is aborted at its budget, and the next beat still goes", async () => {
		jest.useFakeTimers();
		const requests: Request[] = [];
		let aborted!: () => void;
		const sawAbort = new Promise<void>(resolve => {
			aborted = resolve;
		});
		const double = await armed(async (url, init = {}) => {
			requests.push({ url, init });
			const kind = envelopeOf({ url, init }).kind;
			if (kind === "register") return panelAnswer(200, registered(1));
			if (kind === "state") return panelAnswer(200, { outcome: "accepted" });
			return new Promise<Response>((_resolve, reject) => {
				// A panel that is gone never answers: the push is abandoned when the wait it declared
				// runs out, on this file's own fake clock, advanced by exactly that budget below.
				setTimeout(() => {
					aborted();
					reject(new Error("push budget exceeded"));
				}, init.timeoutMs);
			});
		}, "beat-timeout");

		fireTimer(double);
		expect(requests).toHaveLength(3);
		// The wait the beat declared is the extension's own configured budget, not a constant here.
		expect(requests[2]?.init.timeoutMs).toBe(REQUEST_TIMEOUT_MS);

		jest.advanceTimersByTime(REQUEST_TIMEOUT_MS);
		await sawAbort;
		await settleAll();

		// The budget ran out and the event was dropped rather than retried.
		jest.advanceTimersByTime(60_000);
		await settleAll();
		expect(requests).toHaveLength(3);

		// A dropped push leaves the flusher working: the next beat is what heals the panel's view.
		fireTimer(double);
		await settleAll();
		expect(requests).toHaveLength(4);
		expect(envelopeOf(requests[3]!).kind).toBe("heartbeat");
	});
});

describe("the outbox is bounded and sends one event at a time (E11, P32)", () => {
	test("beats pile up only to the queue's bound, and one flusher drains them in order", async () => {
		const stalled = stalledPanel();
		const double = await armed(stalled.request, "beat-burst");

		// A panel that stopped answering while the beats keep coming: the one flusher is stuck on
		// the first push and everything after it waits in the queue.
		for (let beat = 0; beat < OUTBOX_LIMIT + 4; beat += 1) fireTimer(double);
		await settleAll();

		const heartbeats = () => stalled.requests.filter(request => envelopeOf(request).kind === "heartbeat");
		expect(heartbeats()).toHaveLength(1);
		expect(stalled.maxInFlight()).toBe(1);

		stalled.release();
		await settleAll();

		// The queue never held more than its bound, so exactly the one push on the wire and the
		// bound's worth behind it were ever sent — the oldest beats were dropped, not buffered.
		expect(heartbeats()).toHaveLength(1 + OUTBOX_LIMIT);
		expect(stalled.maxInFlight()).toBe(1);
	});
});
