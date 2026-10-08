/**
 * The session boundary's cleanup at the OMP extension seam (E13, E14; P34, P35, P15, P40).
 *
 * The extension is driven exactly as the loader drives it: its own OMP assembly binds the
 * definition against the double, the native session lifecycle events the runtime delivers are
 * handed to that same binding, and the command the framework registered arms a session. The panel
 * is a fake transport injected through the extension's own seam, so the `unregister` a boundary
 * sends is observed without a network.
 *
 * What a boundary promises is an order, and the order is observed rather than assumed: a switch
 * stops everything this extension runs for the session being left — its heartbeat, its queue, its
 * record — synchronously, tells the operator through the one channel an ending owner can still
 * speak on, and only then asks the panel to remove the row that session left behind. A disposal
 * stops locally and says nothing, leaving the row to the panel's own expiry. A navigation that
 * keeps the session's identity is not a boundary at all.
 */
import { afterEach, describe, expect, jest, test } from "bun:test";
import type { OmpCommandContext } from "../../framework/adapters/omp";
import {
	type PushFetchInit,
	type PushHttpResponse,
	type PushTransport,
	setPushTransportForTest,
} from "../../extensions/connect-bot/client";
import { connectBotConfig } from "../../extensions/connect-bot/config";
import { botSessions } from "../../extensions/connect-bot/session";
import connectBot from "../../extensions/connect-bot/runtimes/omp";
import { type OmpDouble, ompDouble } from "./support/omp-double";

/** The owner key the framework resolves for one main session. */
const ownerKey = (sessionId: string) => `main:${sessionId}`;
/** Arm success, verbatim, for one online session. */
const CONNECTED = "已接入 omp-bot 面板（当前 1 个在线会话）";
/** The notice a session being left gets when another identity takes its place, verbatim. */
const SWITCHED = "会话已切换，已断开面板；重新 /connect-bot 可重连";

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
	return { sessionId: parsed.sessionId, kind: parsed.kind, data: "data" in parsed ? parsed.data : undefined };
}

/**
 * Records every request, answering the arm path's own two — the register, with its receipt, and the
 * state report that follows it — the way a live panel answers them, and handing every other kind to
 * `background`.
 *
 * Every test here arms a session first, so the arming itself must succeed as it does against a
 * reachable panel; what a boundary sends is then the only thing left for `background` to answer.
 */
function panel(
	background: (kind: string) => PushHttpResponse | Promise<PushHttpResponse> = () => panelAnswer(200, {}),
): { readonly requests: Request[]; readonly transport: PushTransport } {
	const requests: Request[] = [];
	return {
		requests,
		transport: async (url, init) => {
			const request = { url, init };
			requests.push(request);
			const kind = envelopeOf(request).kind;
			if (kind === "register") return panelAnswer(200, registered(1));
			if (kind === "state") return panelAnswer(200, {});
			return background(kind);
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

/** Lets a promise chain — the arm effect, the flusher's drain, a rejected request — run to its end. */
async function settleAll(): Promise<void> {
	for (let turn = 0; turn < 200; turn += 1) await Promise.resolve();
}

/**
 * Arms one session the way a real run reaches an armed session: the runtime loads it first (the
 * native `session_start`), and the command arms it.
 *
 * The framework never awaits an injected command implementation, so the arm's own notice is what
 * this waits for, and the state report sent behind the register is then let settle — every test
 * below starts from a connection whose queue is drained and whose one beat is already scheduled.
 */
async function arm(double: OmpDouble, sessionId: string): Promise<OmpCommandContext> {
	const ctx = double.context({ sessionId, cwd: "E:/work/switch" });
	double.startSession(ctx);
	const announced = double.nextNotification();
	double.run("connect-bot", "", ctx);
	await announced;
	await settleAll();
	return ctx;
}

/** Fake timers are per-file state: a case must not leave them installed for the next. */
afterEach(() => {
	jest.useRealTimers();
});

describe("another identity takes the session's place (E13, P34, P15)", () => {
	test("everything local stops before the old row is even asked about", async () => {
		let releaseUnregister!: () => void;
		// What the extension's own state is at the moment the removal is on the wire — the one
		// observation that separates "local first" from "stop it whenever the answer comes back".
		let atRemoval: { record: unknown; beatCancelled: boolean | undefined } | undefined;
		const requests: Request[] = [];
		const double = bound(async (url, init) => {
			const request = { url, init };
			requests.push(request);
			const kind = envelopeOf(request).kind;
			if (kind === "register") return panelAnswer(200, registered(1));
			if (kind === "state") return panelAnswer(200, {});
			atRemoval = {
				record: botSessions.get(ownerKey("switch-old")),
				beatCancelled: double.timers[0]?.cancelled,
			};
			// The panel is reachable but slow: the answer is held until the test releases it.
			return new Promise<PushHttpResponse>(resolve => {
				releaseUnregister = () => resolve(panelAnswer(200, {}));
			});
		});
		await arm(double, "switch-old");
		expect(botSessions.get(ownerKey("switch-old"))?.sessionId).toBe("switch-old");
		expect(double.timers).toHaveLength(1);

		// The native switch: another session identity takes this one's place. The whole local half
		// happens inside that dispatch, so nothing has to be awaited to observe it.
		double.switchSession(double.context({ sessionId: "switch-new", cwd: "E:/work/switch" }), "new");

		// The beat is cancelled and the record — the effects' whole reason to act — is gone.
		expect(double.timers[0]?.cancelled).toBe(true);
		expect(botSessions.get(ownerKey("switch-old"))).toBeUndefined();
		// The operator is told while the row is still being asked about: the notice is information,
		// because the effect it reports — this session is no longer connected — has already happened.
		expect(double.notifications).toEqual([CONNECTED, SWITCHED]);
		expect(double.notificationLevels).toEqual(["info", "info"]);

		// The row removed is the real session id the old record held — the identity the panel keys
		// by, and the one the new session does not have — within the extension's configured request
		// budget, and with no body of its own.
		expect(requests.map(request => envelopeOf(request).kind)).toEqual(["register", "state", "unregister"]);
		const removal = envelopeOf(requests[2]!);
		expect(removal.sessionId).toBe("switch-old");
		expect(removal.kind).toBe("unregister");
		expect(removal.data).toBeUndefined();
		expect(requests[2]?.init.body).toBe(JSON.stringify({ sessionId: "switch-old", kind: "unregister" }));
		// The local half was already complete when the request went out: nothing this extension runs
		// for that session outlived it, and no answer the panel might give can change that.
		expect(atRemoval).toEqual({ record: undefined, beatCancelled: true });

		releaseUnregister();
		await settleAll();
	});

	test("the session that took its place stays unarmed: no record, no beat, no register", async () => {
		const { requests, transport } = panel();
		const double = bound(transport);
		await arm(double, "switch-left");

		double.switchSession(double.context({ sessionId: "switch-entered", cwd: "E:/work/switch" }), "new");
		await settleAll();

		// Nothing about the session that took over is this extension's: it did not arm itself, keep a
		// record for itself, schedule a beat for itself or register with the panel.
		expect(botSessions.get(ownerKey("switch-entered"))).toBeUndefined();
		expect(botSessions.get(ownerKey("switch-left"))).toBeUndefined();
		expect(double.timers.every(timer => timer.cancelled)).toBe(true);
		expect(requests.filter(request => envelopeOf(request).sessionId === "switch-entered")).toEqual([]);
		// The area the new session renders is its own: the marker this extension drew for the session
		// it left is not standing in it.
		expect(double.widgets[double.widgets.length - 1]?.lines).toBeUndefined();
	});

	test("an unregister the panel never answers aborts in its budget, is not retried and is not reported", async () => {
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
		await arm(double, "switch-silent-old");

		double.switchSession(double.context({ sessionId: "switch-silent-new", cwd: "E:/work/switch" }), "new");
		expect(requests.map(request => envelopeOf(request).kind)).toEqual(["register", "state", "unregister"]);

		// The request's own budget: the extension's configured value, advanced to rather than waited out.
		jest.advanceTimersByTime(connectBotConfig().requestTimeoutMs);
		await settleAll();

		expect(requests[2]?.init.signal.aborted).toBe(true);
		// Best-effort: the failure is not the operator's business, nothing is attempted a second time,
		// and the row is left to the panel's own expiry exactly as a disposed session's is.
		expect(double.notifications).toEqual([CONNECTED, SWITCHED]);
		expect(requests.map(request => envelopeOf(request).kind)).toEqual(["register", "state", "unregister"]);
	});

	test("a beat and a capability that outlive the boundary write nothing back", async () => {
		const { requests, transport } = panel();
		const double = bound(transport);
		await arm(double, "switch-late");
		const beat = double.timers[0]!;
		const capability = botSessions.get(ownerKey("switch-late"))!.capability;

		double.switchSession(double.context({ sessionId: "switch-late-next", cwd: "E:/work/switch" }), "new");
		await settleAll();
		const widgetsAtTheBoundary = double.widgets.length;

		// The record a beat reads at beat time is gone, so a callback the runtime still delivers —
		// a cancelled timer's, or one already in flight — finds nothing to report.
		beat.callback();
		await settleAll();
		expect(requests.map(request => envelopeOf(request).kind)).toEqual(["register", "state", "unregister"]);

		// And the capability the arm kept for that owner is inert: the declared value is not written
		// back into the retired cell, the area is not republished, and no notice speaks for a session
		// that is gone.
		capability.state.write(true);
		capability.feedback.notify("error", "迟到的回调");
		expect(double.widgets.length).toBe(widgetsAtTheBoundary);
		expect(double.notifications).toEqual([CONNECTED, SWITCHED]);
	});

	test("a session that is not its own owner never reaches this extension's cleanup", async () => {
		const { requests, transport } = panel();
		const double = bound(transport);
		await arm(double, "owner-scope");
		const record = botSessions.get(ownerKey("owner-scope"));
		// The registry the adapter walks: this child resolves to the main session it follows, so its
		// boundary is the owner's, not its own.
		double.agents.set("Main", {
			id: "Main",
			kind: "main",
			session: { sessionManager: { getSessionId: () => "owner-scope" } },
		});
		const child = double.context({
			sessionId: "owner-scope-child",
			cwd: "E:/work/switch",
			kind: "sub",
			parentId: "Main",
		});

		// A subagent's own navigation and switch: the framework resolves the owner it follows, and the
		// effect body this extension drives belongs to the session that armed — never to one moving
		// beside it.
		double.switchSession(child, "new");
		double.navigateTree(child);
		await settleAll();

		expect(botSessions.get(ownerKey("owner-scope"))).toBe(record);
		expect(double.timers[0]?.cancelled).toBe(false);
		expect(requests.map(request => envelopeOf(request).kind)).toEqual(["register", "state"]);
		expect(double.notifications).toEqual([CONNECTED]);
	});
});

describe("the session is disposed rather than transferred (E14, P35)", () => {
	test("a shutdown stops everything local and says nothing: the row is the panel's expiry to clean up", async () => {
		const { requests, transport } = panel();
		const double = bound(transport);
		const ctx = await arm(double, "dispose-1");

		double.shutdown(ctx);

		// Synchronously, inside the dispatch: a disposal's whole reaction is local, and it has already
		// happened by the time the delivery returns.
		expect(double.timers[0]?.cancelled).toBe(true);
		expect(botSessions.get(ownerKey("dispose-1"))).toBeUndefined();

		await settleAll();

		expect(double.timers).toHaveLength(1);
		// Nothing is sent and nothing is said: the process is going away, so there is no operator to
		// tell and no row this extension could still name on its way out.
		expect(requests.map(request => envelopeOf(request).kind)).toEqual(["register", "state"]);
		expect(double.notifications).toEqual([CONNECTED]);
	});

	test("a disposal schedules nothing that could expire the session itself", async () => {
		const { transport } = panel();
		const double = bound(transport);
		const ctx = await arm(double, "dispose-2");

		double.shutdown(ctx);
		await settleAll();

		// The panel judges 在线/离线 from its own window (P30, E9); this extension never implements a
		// second copy of it, so the disposal leaves one timer in total and it is the cancelled beat.
		expect(double.timers).toHaveLength(1);
		expect(double.timers[0]?.cancelled).toBe(true);
	});
});

describe("a navigation that keeps the session's identity is not a boundary (E13, P34)", () => {
	test("a tree jump, a reload, a clear, a same-file resume and a branch leave the connection alone", async () => {
		const { requests, transport } = panel();
		const double = bound(transport);
		const session = await arm(double, "navigate-1");
		const record = botSessions.get(ownerKey("navigate-1"));
		const beat = double.timers[0]!;

		// The navigations that keep this session's identity, each delivered the way the runtime
		// delivers it: a jump inside the tree (`/tree`), the startup signal for the session this
		// binding already serves (`/reload`), an in-place context reset (`/clear`), a same-file resume
		// and a TUI branch.
		double.navigateTree(session);
		double.startSession(session);
		double.switchSession(session, "new");
		double.switchSession(session, "resume");
		double.branchSession(session, "branch");
		await settleAll();

		// Not one of them is a boundary: nothing was sent, nothing was said, the record is the one the
		// arm created and the beat is still scheduled.
		expect(requests.map(request => envelopeOf(request).kind)).toEqual(["register", "state"]);
		expect(double.notifications).toEqual([CONNECTED]);
		expect(botSessions.get(ownerKey("navigate-1"))).toBe(record);
		expect(beat.cancelled).toBe(false);
		expect(double.timers).toHaveLength(1);

		// And the connection is untouched, not merely unreported: the next beat still reaches the
		// panel as it would have with no event at all.
		beat.callback();
		await settleAll();
		expect(requests.map(request => envelopeOf(request).kind).filter(kind => kind === "heartbeat")).toEqual(["heartbeat"]);
	});
});
