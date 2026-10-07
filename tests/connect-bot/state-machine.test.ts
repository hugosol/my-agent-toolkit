/**
 * The agent-state machine at the OMP extension seam (E12, P33, P6): the value a session reports
 * once it is armed, the semantic round edges that move it, and when a move is worth reporting.
 *
 * The extension is driven exactly as the loader drives it: its OMP assembly binds the definition
 * against the double, the command the framework registered arms a session, and the native run
 * events the runtime would deliver are handed to the same binding. Nothing here calls the machine
 * directly — what the panel receives is the whole of what a test observes, so the edge synthesis,
 * the owner scope and the state machine are exercised together, at the seam they compose at.
 *
 * What the file deliberately does not claim: an `abort` and a turn interrupted before it produced
 * any assistant message are reproduced in the M-layer acceptance round against a real runtime, so
 * this suite drives neither of them. The four shapes it does drive all arrive at this seam as the
 * one settle shape they share — no continuation scheduled, the session quiescent — and the
 * subagent session is the seventh shape, guarded below.
 */
import { afterEach, describe, expect, jest, test } from "bun:test";
import type { OmpCommandContext } from "../../framework/adapters/omp";
import {
	type PushFetchInit,
	type PushHttpResponse,
	type PushTransport,
	EVENTS_PATH,
	PUSH_TIMEOUT_MS,
	setPushTransportForTest,
} from "../../extensions/connect-bot/client";
import { CONNECT_BOT } from "../../extensions/connect-bot/definition";
import connectBot from "../../extensions/connect-bot/runtimes/omp";
import { botSessions } from "../../extensions/connect-bot/session";
import { type OmpDouble, ompDouble } from "./support/omp-double";

/** The endpoint the extension's own `config.yaml` ships; the file is the only source. */
const ENDPOINT = "http://omp-bot.local:8787";
/** The owner key the framework resolves for one main session. */
const ownerKey = (sessionId: string) => `main:${sessionId}`;

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

/** The envelope fields a test reads off the wire, before anything is narrowed further. */
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
 * The `state` payload one sent request carried, read only after the shape the contract fixes has
 * been established: a payload that is not `{ value, reason }` fails here rather than comparing
 * `undefined` against an expected value.
 */
function statePayloadOf(request: Request): { readonly value: string; readonly reason: string } {
	const { data } = envelopeOf(request);
	if (
		data === null ||
		typeof data !== "object" ||
		!("value" in data) ||
		typeof data.value !== "string" ||
		!("reason" in data) ||
		typeof data.reason !== "string"
	) {
		throw new Error("a state event did not carry the frozen { value, reason } payload");
	}
	return { value: data.value, reason: data.reason };
}

/** Every `state` event the extension sent, in wire order, as the panel renders them. */
function statePushes(requests: readonly Request[]): Array<{ readonly value: string; readonly reason: string }> {
	return requests.filter(request => envelopeOf(request).kind === "state").map(statePayloadOf);
}

/** The last `state` event the extension sent, which is the one a transition is observed through. */
function lastState(requests: readonly Request[]): { readonly value: string; readonly reason: string } | undefined {
	const pushes = statePushes(requests);
	return pushes[pushes.length - 1];
}

/** Records every request and answers each of them as soon as it arrives. */
function panel(): { readonly requests: Request[]; readonly transport: PushTransport } {
	const requests: Request[] = [];
	return {
		requests,
		transport: async (url, init) => {
			requests.push({ url, init });
			return envelopeOf({ url, init }).kind === "register" ? panelAnswer(200, registered(1)) : panelAnswer(200, {});
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

/** Lets an unawaited promise chain — the arm effect, the flusher's drain — run to its end. */
async function settleAll(): Promise<void> {
	for (let turn = 0; turn < 200; turn += 1) await Promise.resolve();
}

/**
 * Arms one session and returns the double, the panel's requests and the context it ran in.
 *
 * The framework never awaits an injected command implementation, so the arm effect's own
 * completion is what this waits for — and then one settled turn, so the state report that follows
 * the register has left the owner's queue the way any other queued event does.
 */
async function armed(
	sessionId: string,
	idle: boolean,
): Promise<{ readonly double: OmpDouble; readonly requests: Request[]; readonly ctx: OmpCommandContext }> {
	const { requests, transport } = panel();
	const double = bound(transport);
	const ctx = double.context({ sessionId, cwd: "E:/work/state", idle });
	const announced = double.nextNotification();
	double.run("connect-bot", "", ctx);
	await announced;
	await settleAll();
	return { double, requests, ctx };
}

/** Fake timers are per-file state: a failure case must not leave them installed for the next. */
afterEach(() => {
	jest.useRealTimers();
});

describe("arming reports the state the idle fact answers (E12, P33, story 74)", () => {
	test("an arm that can take input reports 空闲, on the owner's own queue behind the register", async () => {
		const { requests } = await armed("state-idle", true);

		// Two events, in order, both on the protocol's fixed route: the register the panel answered,
		// then the state the arm path reports unconditionally.
		expect(requests.map(request => envelopeOf(request).kind)).toEqual(["register", "state"]);
		expect(requests[1]?.url).toBe(`${ENDPOINT}${EVENTS_PATH}`);
		expect(requests[1]?.init.method).toBe("POST");
		expect(requests[1]?.init.proxy).toBe(false);
		// A queued push owns the wire client's own budget, never the register's or an endless one.
		expect(PUSH_TIMEOUT_MS).toBe(1500);
		expect(requests[1]?.init.signal).toBeInstanceOf(AbortSignal);
		expect(JSON.parse(requests[1]?.init.body ?? "")).toEqual({
			sessionId: "state-idle",
			kind: "state",
			data: { value: "idle", reason: "register" },
		});
	});

	test("an arm while the agent is working reports 工作中 rather than a 空闲 it never was", async () => {
		const { requests } = await armed("state-busy", false);

		expect(statePushes(requests)).toEqual([{ value: "working", reason: "register" }]);
	});

	test("a re-arm reports once more even though the state did not move (story 75)", async () => {
		const { double, requests, ctx } = await armed("state-rearm", true);
		expect(statePushes(requests)).toEqual([{ value: "idle", reason: "register" }]);

		const announced = double.nextNotification();
		double.run("connect-bot", "", ctx);
		await announced;
		await settleAll();

		// The reconnect tells the panel the current value again: unconditional, so nothing about the
		// report depends on the value having changed while the session was away.
		expect(requests.map(request => envelopeOf(request).kind)).toEqual(["register", "state", "register", "state"]);
		expect(statePushes(requests)).toEqual([
			{ value: "idle", reason: "register" },
			{ value: "idle", reason: "register" },
		]);
	});
});

describe("the round edges move the state (E12, P33, story 74)", () => {
	test("round_start reports 工作中 and round_end reports 等待用户输入", async () => {
		const { double, requests, ctx } = await armed("state-edges", true);

		double.startRun(ctx);
		await settleAll();
		expect(lastState(requests)).toEqual({ value: "working", reason: "round_start" });

		double.settleRun(ctx);
		await settleAll();
		expect(lastState(requests)).toEqual({ value: "awaiting-input", reason: "round_end" });

		// The whole trace: the arm's own report, then one report per real transition — and nothing
		// repeated for the transitions that never happened between them.
		expect(statePushes(requests)).toEqual([
			{ value: "idle", reason: "register" },
			{ value: "working", reason: "round_start" },
			{ value: "awaiting-input", reason: "round_end" },
		]);
	});

	test("an edge that does not move the value reports nothing", async () => {
		// Armed mid-stream: the value is already 工作中, so the round's own opening moves nothing —
		// the de-bounce is the machine's, not the panel's, and it is what keeps a steady state quiet.
		const steady = await armed("state-steady", false);
		steady.double.startRun(steady.ctx);
		await settleAll();

		expect(statePushes(steady.requests)).toEqual([{ value: "working", reason: "register" }]);

		// And the same value arriving twice in a row is one report: the settle that follows a
		// reported end leaves 等待用户输入 where it already is.
		const again = await armed("state-repeat", true);
		again.double.startRun(again.ctx);
		again.double.settleRun(again.ctx);
		again.double.settleRun(again.ctx);
		await settleAll();

		expect(statePushes(again.requests)).toEqual([
			{ value: "idle", reason: "register" },
			{ value: "working", reason: "round_start" },
			{ value: "awaiting-input", reason: "round_end" },
		]);
	});

	test("a settle that already scheduled its continuation is not a round end", async () => {
		const { double, requests, ctx } = await armed("state-continue", true);
		double.startRun(ctx);
		await settleAll();

		// The agent has already scheduled its own next piece of work: an automatic retry, a recovery
		// turn or a queued drain is a pause inside the round, not the operator's turn to speak.
		double.settleRun(ctx, { willContinue: true });
		await settleAll();
		expect(lastState(requests)).toEqual({ value: "working", reason: "round_start" });

		// The real settle, once nothing is left to continue, is the round's end.
		double.settleRun(ctx);
		await settleAll();
		expect(lastState(requests)).toEqual({ value: "awaiting-input", reason: "round_end" });
	});

	test("a settle that cannot establish quiescence leaves the value where it was", async () => {
		const { double, requests, ctx } = await armed("state-busy-settle", true);
		double.startRun(ctx);
		await settleAll();

		// The session still reports itself busy when the run settles — a fact this runtime states per
		// delivery. An unestablished quiescence closes no round, so no edge arrives and nothing here
		// invents a 等待用户输入 the session did not reach.
		double.settleRun(double.context({ sessionId: "state-busy-settle", cwd: "E:/work/state", idle: false }));
		await settleAll();

		expect(statePushes(requests)).toEqual([
			{ value: "idle", reason: "register" },
			{ value: "working", reason: "round_start" },
		]);
	});
});

describe("the terminal shapes that never see an ordinary settle (E12)", () => {
	/**
	 * The four terminal shapes this seam can isolate. Each one reaches the extension as the same
	 * observable settle — no continuation scheduled, the session quiescent — so the value each
	 * leaves behind is the same and none of them may strand the card in 工作中. `abort` and a turn
	 * interrupted before any assistant message are reproduced on a real runtime in the M-layer
	 * acceptance round; a subagent session is the seventh shape and is guarded below.
	 */
	const terminalShapes = [
		"尾消息仍带 toolCall",
		"skip-post-turn-maintenance",
		"successful yield",
		"compaction deferredHandoff / automaticContinuationBlocked",
	];

	for (const [index, label] of terminalShapes.entries()) {
		test(`${label} lands on 等待用户输入`, async () => {
			const { double, requests, ctx } = await armed(`state-terminal-${index}`, true);
			double.startRun(ctx);
			double.settleRun(ctx);
			await settleAll();

			expect(lastState(requests), label).toEqual({ value: "awaiting-input", reason: "round_end" });
		});
	}

	test("a subagent's round edges never move the main session's state", async () => {
		const { double, requests, ctx } = await armed("state-main", true);
		double.startRun(ctx);
		double.settleRun(ctx);
		await settleAll();
		expect(lastState(requests)).toEqual({ value: "awaiting-input", reason: "round_end" });

		// The subagent follows the armed session: its owner resolves to the very same owner key, so
		// nothing but the framework's owner scope keeps its rounds from driving this record.
		double.agents.set("Main", {
			id: "Main",
			kind: "main",
			session: { sessionManager: { getSessionId: () => "state-main" } },
		});
		double.agents.set("0-Explore", { id: "0-Explore", kind: "sub", parentId: "Main" });
		const subagent = double.context({ sessionId: "state-main-sub", cwd: "E:/work/state", kind: "sub", parentId: "Main" });

		double.startRun(subagent);
		await settleAll();
		double.settleRun(subagent);
		await settleAll();

		expect(statePushes(requests)).toEqual([
			{ value: "idle", reason: "register" },
			{ value: "working", reason: "round_start" },
			{ value: "awaiting-input", reason: "round_end" },
		]);
		expect(botSessions.get(ownerKey("state-main"))?.state).toBe("awaiting-input");
	});
});

describe("the heartbeat carries the state and never moves it (E12, story 76)", () => {
	test("a beat reports the value in force and adds no state report", async () => {
		jest.useFakeTimers();
		const { double, requests, ctx } = await armed("state-beat", true);
		double.startRun(ctx);
		await settleAll();

		double.timers[0]?.callback();
		await settleAll();
		const first = requests.filter(request => envelopeOf(request).kind === "heartbeat");
		expect(first).toHaveLength(1);
		expect(JSON.parse(first[0]?.init.body ?? "")).toEqual({
			sessionId: "state-beat",
			kind: "heartbeat",
			data: { value: "working" },
		});

		// A standing-still session beats the same value again and migrates nothing: the beat repeats
		// the record verbatim and never becomes a second report of the same state.
		double.timers[0]?.callback();
		await settleAll();
		expect(requests.filter(request => envelopeOf(request).kind === "heartbeat")).toHaveLength(2);
		expect(statePushes(requests)).toEqual([
			{ value: "idle", reason: "register" },
			{ value: "working", reason: "round_start" },
		]);
		expect(botSessions.get(ownerKey("state-beat"))?.state).toBe("working");
	});
});

describe("the tri-state lives in the extension's own record (P6)", () => {
	test("the framework's State declaration is one value, and the three-valued state is not in it", async () => {
		// The definition is where a second current value would have to be declared, and there is
		// exactly one: `enabled`, in memory, not inherited.
		expect(CONNECT_BOT.state).toEqual({ field: "enabled", persistence: "memory", inheritance: "none" });

		const { double, requests, ctx } = await armed("state-owner", true);
		double.startRun(ctx);
		double.settleRun(ctx);
		await settleAll();

		// The value the panel is told lives in the owner's own record, reported on the wire's own
		// `state` event — never as a framework State field, which is why nothing about the session
		// was persisted for it and why the tri-state survives with no declared cell behind it.
		expect(botSessions.get(ownerKey("state-owner"))?.state).toBe("awaiting-input");
		expect(double.appended).toEqual([]);
		expect(statePushes(requests).map(push => push.value)).toEqual(["idle", "working", "awaiting-input"]);
	});
});
