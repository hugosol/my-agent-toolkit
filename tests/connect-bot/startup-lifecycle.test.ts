/**
 * connect-bot's startup attempt against the owner's own life, at the OMP assembly seam (S1; P20,
 * P21, P25, P27, P7 of the extension-startup-modes contract).
 *
 * The extension is driven exactly as the loader drives it: its real automatic or manual entrypoint
 * binds the shared definition against the OMP double, native session events are delivered the way
 * the host delivers them, and a directed command runs with a doubled session context. The panel is
 * the fake HTTP call at the extension's own client seam, so an attempt can be held on the wire and
 * then interrupted by the operator or by the owner's boundary — no uncontrolled network timing is
 * part of any observation.
 *
 * The race is the subject here, and the expectation is stated as an event order: an invalidated
 * attempt produces no declared value, no state report, no heartbeat and no timer, whatever the
 * panel answers afterwards. The cadence is driven on a controlled clock, so "no later beat" is an
 * exact virtual instant rather than a wait.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import connectBotAuto from "../../entrypoints/omp-auto/connect-bot";
import {
	type PanelRequest,
	setPanelRequestForTest,
} from "../../extensions/connect-bot/shared-logic/panel/client";
import { botSessions } from "../../extensions/connect-bot/shared-logic/session/session";
import { connectBotOmp } from "../../extensions/connect-bot/harnesses/omp-assembly";
import type { OmpCommandContext } from "../../adapters/omp";
import type { HttpRequestOptions, HttpRequestResult } from "../../framework/interface/general/http";
import { ControlledClock } from "./support/controlled-clock";
import { type OmpDouble, ompDouble } from "./support/omp-double";

/** The connect-bot marker line, as its definition declares it. */
const CONNECT_BOT_MARKER = "◐ connectBot";
/** Arm success, verbatim, for one online session. */
const CONNECTED = "已接入 herdr-bot 面板（当前 1 个在线会话）";
/** The notice a session being left gets when another identity takes its place, verbatim. */
const SWITCHED = "会话已切换，已断开面板；重新 /connect-bot 可重连";
/** The heartbeat period the extension schedules. */
const HEARTBEAT_INTERVAL_MS = 10_000;

/** The owner key the framework resolves for one main session. */
const ownerKey = (sessionId: string) => `main:${sessionId}`;

/** One outbound request the extension made, as the framework's call received it. */
interface Request {
	readonly url: string;
	readonly init: HttpRequestOptions;
}

/** The parsed envelope fields a test reads off the wire. */
interface WireEnvelope {
	readonly sessionId: string;
	readonly kind: string;
	readonly data?: unknown;
}

/** Reads one sent request body as the `{sessionId, kind, data?}` envelope the contract fixes. */
function envelopeOf(request: Request): WireEnvelope {
	const parsed: unknown = JSON.parse(request.init.body ?? "");
	if (parsed === null || typeof parsed !== "object") throw new Error("connect-bot sent a body that is not an object");
	if (!("sessionId" in parsed) || typeof parsed.sessionId !== "string") throw new Error("the envelope carries no session id");
	if (!("kind" in parsed) || typeof parsed.kind !== "string") throw new Error("the envelope carries no kind");
	return { sessionId: parsed.sessionId, kind: parsed.kind, data: "data" in parsed ? parsed.data : undefined };
}

/** The registered receipt a reachable panel answers a `register` with. */
function registeredHttpRequestResult(onlineCount = 1): HttpRequestResult {
	return ({ ok: true as const, response: new Response(JSON.stringify({ outcome: "registered", onlineCount }), { status: 200 }) });
}

/** A request the test holds on the wire and releases on its own terms. */
function heldRequest(): { readonly promise: Promise<HttpRequestResult>; readonly release: (response: HttpRequestResult) => void } {
	const { promise, resolve } = Promise.withResolvers<HttpRequestResult>();
	return { promise, release: resolve };
}

/**
 * A scripted panel: every request is recorded, and each `register` is answered by the script.
 *
 * A scripted answer may be a promise, so a test can hold the attempt while it interrupts it; the
 * state report and every heartbeat are ordinary accepted pushes.
 */
function panel(
	register: (attempt: number) => HttpRequestResult | Promise<HttpRequestResult>,
): { readonly requests: Request[]; readonly request: PanelRequest } {
	const requests: Request[] = [];
	let registers = 0;
	return {
		requests,
		request: async (url, init = {}) => {
			const request = { url, init };
			requests.push(request);
			const envelope = envelopeOf(request);
			if (envelope.kind === "register") {
				registers += 1;
				return register(registers);
			}
			return ({ ok: true as const, response: new Response(JSON.stringify({ outcome: "accepted" }), { status: 200 }) });
		},
	};
}

/** Binds one assembly against a fresh double and installs the panel above. */
function bound(
	assembly: (pi: OmpDouble["api"]) => void,
	request: PanelRequest,
	options: { readonly clock?: ControlledClock } = {},
): OmpDouble {
	const double = ompDouble(options.clock === undefined ? {} : { timers: { kind: "controlled", clock: options.clock } });
	assembly(double.api);
	setPanelRequestForTest(request);
	return double;
}

/** One main session's native context, with the facts the panel protocol reads. */
function contextOf(double: OmpDouble, sessionId: string, cwd = "E:/work/lifecycle"): OmpCommandContext {
	return double.context({ sessionId, cwd, model: "deepseek", sessionName: sessionId });
}

/** Yields until a condition holds, then reports whether it did within the deadline. */
async function waitFor(condition: () => boolean, timeoutMs = 30_000): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		if (condition()) return true;
		if (Date.now() >= deadline) return false;
		const { promise, resolve } = Promise.withResolvers<void>();
		setImmediate(resolve);
		await promise;
	}
}

/** Lets the promise chains an attempt, a disarm and a flusher started run to their end. */
async function settleAll(): Promise<void> {
	for (let turn = 0; turn < 200; turn += 1) await Promise.resolve();
}

/** The lines the marker area rendered last, or `undefined` when it cleared the widget. */
function lastAreaLines(double: OmpDouble): readonly string[] | undefined {
	const write = double.widgets[double.widgets.length - 1];
	return write === undefined ? undefined : write.lines;
}

/** The kinds of the requests sent so far, in order. */
function requestKinds(requests: readonly Request[]): string[] {
	return requests.map(request => envelopeOf(request).kind);
}

/** The policy documents this suite wrote, removed after each case. */
const policyDirectories: string[] = [];

/** One startup policy document for connect-bot, in a directory of its own. */
function policyOf(choice: boolean): string {
	const directory = mkdtempSync(path.join(tmpdir(), "connect-bot-lifecycle-"));
	policyDirectories.push(directory);
	const file = path.join(directory, "policy.yaml");
	writeFileSync(file, `connect-bot:\n  enabled: ${String(choice)}\n`);
	return file;
}

afterEach(() => {
	setPanelRequestForTest(null);
	for (const directory of policyDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("an off invalidates the startup attempt still on the wire (P20)", () => {
	test("a later valid receipt writes no value, reports no state, schedules no timer and leaves no beat", async () => {
		const held = heldRequest();
		const { requests, request } = panel(attempt => (attempt === 1 ? held.promise : registeredHttpRequestResult()));
		const clock = new ControlledClock();
		const double = bound(connectBotAuto, request, { clock });
		const ctx = contextOf(double, "startup-off-pending");

		double.startSession(ctx);
		expect(await waitFor(() => requests.length === 1)).toBe(true);
		expect(requestKinds(requests)).toEqual(["register"]);

		// The operator closes the connection before the panel has answered. Nothing was connected
		// yet, so `off` is the existing silent no-op — but the attempt is invalidated now.
		double.run("connect-bot", "off", ctx);
		held.release(registeredHttpRequestResult());
		await settleAll();
		await clock.advanceBy(HEARTBEAT_INTERVAL_MS * 6);

		// The valid receipt that arrived afterwards is discarded: no value, no state report, no
		// heartbeat, and no timer from the attempt was left behind.
		expect(requestKinds(requests)).toEqual(["register"]);
		expect(botSessions.get(ownerKey("startup-off-pending"))).toBeUndefined();
		expect(double.timers).toEqual([]);
		expect(lastAreaLines(double)).toBeUndefined();
		expect(double.notifications).toEqual([]);

		// The same binding's command is still the way to connect: invalidation is not a disable.
		const announced = double.nextNotification();
		double.run("connect-bot", "", ctx);
		await announced;
		expect(requestKinds(requests)).toEqual(["register", "register", "state"]);
		expect(lastAreaLines(double)).toEqual([CONNECT_BOT_MARKER]);
		expect(double.timers).toHaveLength(1);
	});
});

describe("an owner's boundary invalidates its pending startup attempt (P21)", () => {
	test("a transfer, a return of the old owner and the late receipt never revive the old attempt", async () => {
		const held = heldRequest();
		const { requests, request } = panel(attempt => (attempt === 1 ? held.promise : registeredHttpRequestResult()));
		const clock = new ControlledClock();
		const double = bound(connectBotAuto, request, { clock });
		const oldOwner = contextOf(double, "startup-transfer-old");
		const nextOwner = contextOf(double, "startup-transfer-next");

		double.startSession(oldOwner);
		expect(await waitFor(() => requests.length === 1)).toBe(true);

		// Another identity takes the session's place while the startup register is unanswered.
		double.switchSession(nextOwner, "new");
		// The old owner comes back before the panel has answered: that is a new life, and it does
		// not make the attempt the boundary already invalidated valid again.
		double.switchSession(oldOwner, "resume");
		held.release(registeredHttpRequestResult());
		await settleAll();
		await clock.advanceBy(HEARTBEAT_INTERVAL_MS * 6);

		expect(requestKinds(requests)).toEqual(["register"]);
		expect(botSessions.get(ownerKey("startup-transfer-old"))).toBeUndefined();
		expect(double.timers).toEqual([]);
		expect(lastAreaLines(double)).toBeUndefined();
		expect(double.notifications).toEqual([]);

		// A command issued on the returned owner is a new attempt and is honored normally: the
		// boundary invalidated the old attempt, not the owner's ability to connect.
		const announced = double.nextNotification();
		double.run("connect-bot", "", oldOwner);
		await announced;
		expect(requestKinds(requests)).toEqual(["register", "register", "state"]);
		expect(botSessions.get(ownerKey("startup-transfer-old"))?.sessionId).toBe("startup-transfer-old");
	});
});

describe("a disposal is the owner's end too, and its pending attempt dies with it (P21, P27)", () => {
	test("the late receipt enables nothing and the disposed binding runs no further command", async () => {
		const held = heldRequest();
		const { requests, request } = panel(attempt => (attempt === 1 ? held.promise : registeredHttpRequestResult()));
		const clock = new ControlledClock();
		const double = bound(connectBotAuto, request, { clock });
		const ctx = contextOf(double, "startup-disposed");

		double.startSession(ctx);
		expect(await waitFor(() => requests.length === 1)).toBe(true);

		// The process's session is disposed rather than transferred.
		double.shutdown(ctx);
		held.release(registeredHttpRequestResult());
		await settleAll();
		await clock.advanceBy(HEARTBEAT_INTERVAL_MS * 6);

		expect(requestKinds(requests)).toEqual(["register"]);
		expect(botSessions.get(ownerKey("startup-disposed"))).toBeUndefined();
		expect(double.timers).toEqual([]);
		expect(lastAreaLines(double)).toBeUndefined();
		// A disposal says nothing to the operator: the process is going away.
		expect(double.notifications).toEqual([]);

		// The binding's delivery stopped with the disposal: the command no longer reaches it.
		double.run("connect-bot", "", ctx);
		await settleAll();
		expect(requestKinds(requests)).toEqual(["register"]);
	});
});

describe("the owner's end stops the effects a re-register was about to keep (P21, P27)", () => {
	test("an armed owner's pending re-register cannot restart the heartbeat the boundary cancelled", async () => {
		const held = heldRequest();
		const { requests, request } = panel(attempt =>
			attempt === 1 ? registeredHttpRequestResult() : attempt === 2 ? held.promise : registeredHttpRequestResult(),
		);
		const clock = new ControlledClock();
		const double = bound(connectBotAuto, request, { clock });
		const ctx = contextOf(double, "startup-rearm-old");
		const next = contextOf(double, "startup-rearm-next");

		const connected = double.nextNotification();
		double.startSession(ctx);
		await connected;
		expect(await waitFor(() => requestKinds(requests).includes("state"))).toBe(true);
		const beat = double.timers[0];
		expect(beat?.cancelled).toBe(false);
		const statesBefore = requestKinds(requests).filter(kind => kind === "state").length;

		// A second command is a real attempt while the owner is already armed, and the panel holds it.
		double.run("connect-bot", "", ctx);
		expect(await waitFor(() => requestKinds(requests).filter(kind => kind === "register").length === 2)).toBe(true);

		// The owner is transferred while that attempt is on the wire: the existing heartbeat is
		// cancelled with the owner's effects, and the attempt is invalidated.
		double.switchSession(next, "new");
		expect(beat?.cancelled).toBe(true);
		expect(botSessions.get(ownerKey("startup-rearm-old"))).toBeUndefined();

		held.release(registeredHttpRequestResult());
		await settleAll();
		await clock.advanceBy(HEARTBEAT_INTERVAL_MS * 6);

		// No state report followed the late receipt, no heartbeat was sent, and no timer replaced the
		// cancelled one.
		expect(requestKinds(requests).filter(kind => kind === "heartbeat")).toEqual([]);
		expect(requestKinds(requests).filter(kind => kind === "state")).toHaveLength(statesBefore);
		expect(requestKinds(requests)).toEqual(["register", "state", "register", "unregister"]);
		expect(double.timers).toHaveLength(1);
		expect(double.timers[0]?.cancelled).toBe(true);
		expect(botSessions.get(ownerKey("startup-rearm-old"))).toBeUndefined();
		expect(lastAreaLines(double)).toBeUndefined();
		expect(double.notifications).toEqual([CONNECTED, SWITCHED]);
	});
});

describe("navigation after the first start never applies the entrypoint's startup again (P25)", () => {
	test("new, resume, fork, a same-owner navigation and a return to the first session register nothing", async () => {
		const { requests, request } = panel(() => registeredHttpRequestResult());
		const double = bound(connectBotAuto, request);
		const first = contextOf(double, "startup-nav-first");
		const second = contextOf(double, "startup-nav-new");
		const third = contextOf(double, "startup-nav-resume");
		const fourth = contextOf(double, "startup-nav-fork");

		const connected = double.nextNotification();
		double.startSession(first);
		await connected;
		expect(requestKinds(requests).filter(kind => kind === "register")).toHaveLength(1);
		const widgetsAfterFirst = double.widgets.length;

		// A new session: the startup moment was consumed by the first start, so this one begins off.
		double.switchSession(second, "new");
		expect(lastAreaLines(double)).toBeUndefined();

		// A resumed identity and a forked identity are boundaries of their own, and neither applies
		// the entrypoint's choice or starts a register.
		double.switchSession(third, "resume");
		double.switchSession(fourth, "fork");
		expect(lastAreaLines(double)).toBeUndefined();

		// Navigation that keeps the current owner — a tree jump and a same-file resume — is no
		// boundary at all: no session event, no marker publication, no activation.
		const widgetsBeforeSameOwner = double.widgets.length;
		double.navigateTree(fourth);
		double.switchSession(fourth, "resume");
		expect(double.widgets.length).toBe(widgetsBeforeSameOwner);

		// Returning to the first owner is another transfer: memory State begins anew, so it is off,
		// and the startup policy is not applied a second time.
		double.switchSession(first, "resume");
		expect(lastAreaLines(double)).toBeUndefined();
		await settleAll();

		expect(requestKinds(requests)).toEqual(["register", "state", "unregister"]);
		expect(double.timers).toHaveLength(1);
		expect(double.timers[0]?.cancelled).toBe(true);
		expect(double.widgets.length).toBeGreaterThan(widgetsAfterFirst);
	});
});

describe("the selected policy document is read at binding, not on each observation (P7)", () => {
	test("editing it mid-process changes neither this State nor a later activation choice", async () => {
		const policy = policyOf(true);
		const { requests, request } = panel(() => registeredHttpRequestResult());
		const clock = new ControlledClock();
		const double = bound(connectBotOmp(policy), request, { clock });
		const first = contextOf(double, "startup-policy-first");
		const next = contextOf(double, "startup-policy-next");

		const connected = double.nextNotification();
		double.startSession(first);
		await connected;
		expect(requestKinds(requests).filter(kind => kind === "register")).toHaveLength(1);
		expect(lastAreaLines(double)).toEqual([CONNECT_BOT_MARKER]);

		// The document is edited while this process runs. Nothing re-reads it: the armed owner keeps
		// its value, its connection and its beat.
		writeFileSync(policy, "connect-bot:\n  enabled: false\n");
		expect(botSessions.get(ownerKey("startup-policy-first"))?.sessionId).toBe("startup-policy-first");
		expect(lastAreaLines(double)).toEqual([CONNECT_BOT_MARKER]);
		await clock.advanceBy(HEARTBEAT_INTERVAL_MS);
		expect(requestKinds(requests).filter(kind => kind === "heartbeat")).toHaveLength(1);

		// A later session in the same process takes the ordinary session rule (no history) rather
		// than either version's default: the startup moment was consumed by the first start.
		double.switchSession(next, "new");
		await settleAll();

		expect(botSessions.get(ownerKey("startup-policy-first"))).toBeUndefined();
		expect(lastAreaLines(double)).toBeUndefined();
		expect(requestKinds(requests).filter(kind => kind === "register")).toHaveLength(1);
		// The running process's read is what armed the first owner, and no live value was forced off
		// by the edit: the connection was ended by the session switch, not by the document.
		expect(double.notifications).toEqual([CONNECTED, SWITCHED]);
	});
});
