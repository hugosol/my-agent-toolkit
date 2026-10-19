/**
 * The panel session registration module's interruption rules, at the OMP extension seam (E7, E8;
 * P28, P29, P36).
 *
 * The extension is driven exactly as the loader drives it: its own OMP assembly binds the
 * definition against the double, and the command the framework registered runs with a doubled
 * session context. The panel is a fake HTTP call injected through the extension's own seam, so a
 * test can hold a `register` on the wire and then interrupt it — with an `off`, with a session
 * boundary, or with a second command.
 *
 * These are the rules the registration module owns and the reason it exists: an attempt
 * invalidated by a stop or by its owner's end can never create effects, a valid repeat is
 * serialized rather than merged, and a new activation is refused — not queued — while an
 * unregister is still in flight.
 */
import { describe, expect, test } from "bun:test";
import {
	type PanelRequest,
	setPanelRequestForTest,
} from "../../extensions/connect-bot/shared-logic/panel/client";
import type { HttpRequestOptions } from "../../framework/interface/general/http";
import { botSessions } from "../../extensions/connect-bot/shared-logic/session/session";
import connectBot from "../../extensions/connect-bot/harnesses/omp";
import { type OmpDouble, ompDouble } from "./support/omp-double";

/** The extension's marker text: what the area shows while `enabled`. */
const MARKER_TEXT = "◐ connectBot";
/** The owner key the framework resolves for one main session. */
const ownerKey = (sessionId: string) => `main:${sessionId}`;

/** Arm success, verbatim, for the online count the panel reported. */
const CONNECTED = (onlineCount: number) => `已接入 omp-bot 面板（当前 ${onlineCount} 个在线会话）`;
/** A new activation refused while the unregister the operator asked for is still on the wire. */
const DISCONNECTING = "正在断开 omp-bot 面板，请稍后重试";
/** Off with the panel reachable. */
const DISCONNECTED = "已断开 omp-bot 面板";

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

/** The envelope fields a test reads off the wire. */
interface WireEnvelope {
	readonly sessionId: string;
	readonly kind: string;
	readonly data?: unknown;
}

/** Reads one sent request body as the `{sessionId, kind, data?}` envelope the contract fixes. */
function envelopeOf(request: Request): WireEnvelope {
	const parsed: unknown = JSON.parse(request.init.body ?? "");
	if (parsed === null || typeof parsed !== "object") throw new Error("connect-bot sent a body that is not an object");
	if (!("sessionId" in parsed) || typeof parsed.sessionId !== "string") throw new Error("no session id");
	if (!("kind" in parsed) || typeof parsed.kind !== "string") throw new Error("no kind");
	return { sessionId: parsed.sessionId, kind: parsed.kind, data: "data" in parsed ? parsed.data : undefined };
}

/** Binds the extension against a fresh double and injects one panel. */
function bound(request: PanelRequest): OmpDouble {
	const double = ompDouble();
	connectBot(double.api);
	setPanelRequestForTest(request);
	return double;
}

/** Lets a promise chain — the attempt, the flusher's drain — run to its end. */
async function settleAll(): Promise<void> {
	for (let turn = 0; turn < 200; turn += 1) await Promise.resolve();
}

/** A request the test holds on the wire and releases on its own terms. */
function heldRequest(): { readonly promise: Promise<Response>; readonly release: (response: Response) => void } {
	const { promise, resolve } = Promise.withResolvers<Response>();
	return { promise, release: resolve };
}

/** Whether the marker area currently shows this extension's marker. */
function markerShown(double: OmpDouble): boolean {
	return double.widgets.some(write => write.lines?.includes(MARKER_TEXT) ?? false);
}

describe("an invalidated registration attempt never creates effects (E7, P28)", () => {
	test("an off invalidates a register still in flight", async () => {
		const held = heldRequest();
		const requests: Request[] = [];
		const double = bound(async (url, init = {}) => {
			const request = { url, init };
			requests.push(request);
			return envelopeOf(request).kind === "register" ? held.promise : panelAnswer(200, {});
		});
		const ctx = double.context({ sessionId: "interrupted-off", cwd: "E:/work/registration" });
		double.startSession(ctx);
		double.run("connect-bot", "", ctx);
		expect(requests.map(request => envelopeOf(request).kind)).toEqual(["register"]);

		// The operator asks off before the panel has answered: the attempt is invalidated now, and
		// the successful receipt that follows it is not allowed to arm anything.
		double.run("connect-bot", "off", ctx);
		held.release(panelAnswer(200, registered(1)));
		await settleAll();

		expect(requests.map(request => envelopeOf(request).kind)).toEqual(["register"]);
		expect(botSessions.get(ownerKey("interrupted-off"))).toBeUndefined();
		expect(double.timers).toEqual([]);
		expect(markerShown(double)).toBe(false);
		expect(double.notifications).toEqual([]);
	});

	test("the end of the owner's life invalidates a register still in flight, even if the owner returns", async () => {
		const held = heldRequest();
		const requests: Request[] = [];
		const double = bound(async (url, init = {}) => {
			const request = { url, init };
			requests.push(request);
			return envelopeOf(request).kind === "register" ? held.promise : panelAnswer(200, {});
		});
		const ctx = double.context({ sessionId: "interrupted-switch", cwd: "E:/work/registration" });
		double.startSession(ctx);
		double.run("connect-bot", "", ctx);

		// Another identity takes the session's place while the register is unanswered, and the
		// session then returns: the attempt still belongs to the life that ended.
		double.switchSession(double.context({ sessionId: "interrupted-next", cwd: "E:/work/registration" }), "new");
		double.switchSession(ctx, "resume");
		held.release(panelAnswer(200, registered(1)));
		await settleAll();

		// The late receipt arms nothing, and the unregister it never earned is not sent either.
		expect(requests.map(request => envelopeOf(request).kind)).toEqual(["register"]);
		expect(botSessions.get(ownerKey("interrupted-switch"))).toBeUndefined();
		expect(double.timers).toEqual([]);
		expect(markerShown(double)).toBe(false);
		expect(double.notifications).toEqual([]);
	});
});

describe("valid registrations are serialized, not merged (E7, P28)", () => {
	test("a second activation waits for the first, and both are honored in order", async () => {
		const first = heldRequest();
		let registerCount = 0;
		const requests: Request[] = [];
		const double = bound(async (url, init = {}) => {
			const request = { url, init };
			requests.push(request);
			if (envelopeOf(request).kind !== "register") return panelAnswer(200, {});
			registerCount += 1;
			return registerCount === 1 ? first.promise : panelAnswer(200, registered(2));
		});
		const ctx = double.context({ sessionId: "serialized", cwd: "E:/work/registration" });
		double.startSession(ctx);

		const firstAnnounced = double.nextNotification();
		double.run("connect-bot", "", ctx);
		const secondAnnounced = double.nextNotification();
		double.run("connect-bot", "", ctx);

		// The second command is real, but it is behind the first: one round-trip at a time.
		expect(requests.map(request => envelopeOf(request).kind)).toEqual(["register"]);

		first.release(panelAnswer(200, registered(1)));
		await firstAnnounced;
		await secondAnnounced;
		await settleAll();

		// Both attempts reached the panel, in the order the operator issued them, and the re-arm
		// kept the one heartbeat and the one queue rather than creating a second pair.
		expect(requests.filter(request => envelopeOf(request).kind === "register")).toHaveLength(2);
		expect(double.timers).toHaveLength(1);
		expect(double.notifications).toEqual([CONNECTED(1), CONNECTED(2)]);
		expect(botSessions.get(ownerKey("serialized"))?.sessionId).toBe("serialized");
	});
});

describe("the disconnecting window refuses a new activation and then reopens (E7, P28)", () => {
	test("an activation during an unregister is refused, not queued, and works after it settles", async () => {
		const unregister = heldRequest();
		let registerCount = 0;
		const requests: Request[] = [];
		const double = bound(async (url, init = {}) => {
			const request = { url, init };
			requests.push(request);
			const kind = envelopeOf(request).kind;
			if (kind === "register") {
				registerCount += 1;
				return panelAnswer(200, registered(registerCount));
			}
			return kind === "unregister" ? unregister.promise : panelAnswer(200, {});
		});
		const ctx = double.context({ sessionId: "window", cwd: "E:/work/registration" });
		double.startSession(ctx);

		const connected = double.nextNotification();
		double.run("connect-bot", "", ctx);
		await connected;
		await settleAll();

		// Off stops locally at once and leaves its unregister on the wire.
		double.run("connect-bot", "off", ctx);
		// A new activation in that window is refused and not queued: no second register goes out.
		double.run("connect-bot", "", ctx);
		expect(double.notifications).toEqual([CONNECTED(1), DISCONNECTING]);
		expect(requests.filter(request => envelopeOf(request).kind === "register")).toHaveLength(1);
		expect(botSessions.get(ownerKey("window"))).toBeUndefined();

		// The unregister settles: the window reopens and the operator may connect again.
		const disconnected = double.nextNotification();
		unregister.release(panelAnswer(200, {}));
		await disconnected;
		await settleAll();
		expect(double.notifications).toEqual([CONNECTED(1), DISCONNECTING, DISCONNECTED]);

		const reconnected = double.nextNotification();
		double.run("connect-bot", "", ctx);
		await reconnected;
		await settleAll();
		expect(double.notifications).toEqual([CONNECTED(1), DISCONNECTING, DISCONNECTED, CONNECTED(2)]);
		expect(requests.filter(request => envelopeOf(request).kind === "register")).toHaveLength(2);
	});
});
