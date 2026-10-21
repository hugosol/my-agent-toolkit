/**
 * connect-bot's two startup modes at the OMP assembly seam (S1; P2, P3, P4, P15, P16, P18,
 * P26, P33).
 *
 * The extension is driven exactly as the loader drives it: one mode's assembly binds the shared
 * definition against the OMP double, a native session start is delivered as the host delivers it,
 * and the panel is the fake HTTP call at the extension's own client seam. The auto mode's
 * enabling startup policy is the intent; what the panel receives, what the marker area renders,
 * and how the registered value behaves are the observable result.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import connectBotAuto from "../../entrypoints/omp-auto/connect-bot";
import connectBotManual from "../../entrypoints/omp/connect-bot";
import {
	EVENTS_PATH,
	type PanelRequest,
	setPanelRequestForTest,
} from "../../extensions/connect-bot/shared-logic/panel/client";
import { botSessions } from "../../extensions/connect-bot/shared-logic/session/session";
import { connectBotOmp } from "../../extensions/connect-bot/harnesses/omp-assembly";
import { AUTOMATIC_STARTUP_POLICY, MANUAL_STARTUP_POLICY } from "../../extensions/connect-bot/harnesses/startup-modes";
import type { OmpCommandContext } from "../../adapters/omp";
import type { HttpRequestOptions } from "../../framework/interface/general/http";
import { ControlledClock } from "./support/controlled-clock";
import { type OmpDouble, ompDouble } from "./support/omp-double";

/** The framework's one marker-area widget, as the OMP adapter owns it. */
const MARKER_AREA_KEY = "semantic-extensions";
const MARKER_AREA_PLACEMENT = "aboveEditor";
/** The extension's marker text: what the area shows while `enabled`. */
const MARKER_TEXT = "◐ connectBot";
/** What the operator is told when the panel did not answer as a register. */
const ARM_FAILED = "无法连接 herdr-bot，未启用；请确认面板已启动";
/** What a session without a UI is told when an activation is attempted. */
const NO_UI_REFUSAL = "当前模式无 UI，不支持接入面板";
/** The endpoint the extension's own `config.yaml` ships; the file is the only source. */
const ENDPOINT = "http://127.0.0.1:8787";

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

/** Records every request and answers each one with the registered receipt a live panel answers. */
function panel(): { readonly requests: Request[]; readonly request: PanelRequest } {
	const requests: Request[] = [];
	return {
		requests,
		request: async (url, init = {}) => {
			requests.push({ url, init });
			const kind = envelopeOf({ url, init }).kind;
			return new Response(
				JSON.stringify(kind === "register" ? { outcome: "registered", onlineCount: 1 } : { outcome: "accepted" }),
				{ status: 200 },
			);
		},
	};
}

/** Binds one assembly against a fresh double and installs the panel above. */
function bound(assembly: (pi: OmpDouble["api"]) => void, request: PanelRequest): OmpDouble {
	const double = ompDouble();
	assembly(double.api);
	setPanelRequestForTest(request);
	return double;
}

/** One main session's native context, with the facts the panel protocol reads. */
function contextOf(double: OmpDouble, sessionId: string, cwd: string, model: string): OmpCommandContext {
	return double.context({ sessionId, cwd, model, sessionName: sessionId });
}

/** The policy documents this suite wrote, removed after each case. */
const policyDirectories: string[] = [];

/** One startup policy document for connect-bot, in a directory of its own. */
function policyOf(choice: boolean): string {
	const directory = mkdtempSync(path.join(tmpdir(), "connect-bot-startup-"));
	policyDirectories.push(directory);
	const file = path.join(directory, "policy.yaml");
	writeFileSync(file, `connect-bot:\n  enabled: ${String(choice)}\n`);
	return file;
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

afterEach(() => {
	setPanelRequestForTest(null);
	for (const directory of policyDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("the manual entrypoint starts off and stays off until its command (P2, P15)", () => {
	test("driving a session and controlled time starts no request, timer or feedback", async () => {
		const { requests, request } = panel();
		const clock = new ControlledClock();
		const double = ompDouble({ timers: { kind: "controlled", clock } });
		connectBotManual(double.api);
		setPanelRequestForTest(request);
		const ctx = contextOf(double, "startup-manual", "E:/work/manual", "deepseek");

		double.startSession(ctx);
		double.startRun(ctx);
		await double.settleRun(ctx);
		await clock.advanceBy(60_000);

		expect(requests).toEqual([]);
		expect(double.notifications).toEqual([]);
		expect(double.timers).toEqual([]);
		// The start published the area cleared, never a marker line: the declared value stayed off.
		expect(double.widgets[double.widgets.length - 1]?.lines).toBeUndefined();
		expect(double.appended).toEqual([]);
		expect(botSessions.get("main:startup-manual")).toBeUndefined();

		// The same binding's command remains the way to enable it: the manual entrypoint is not disabled.
		const announced = double.nextNotification();
		double.run("connect-bot", "", ctx);
		await announced;
		expect(requests.map(envelopeOf).map(envelope => envelope.kind)).toEqual(["register", "state"]);
		expect(double.widgets[double.widgets.length - 1]?.lines).toEqual([MARKER_TEXT]);
	});
});

describe("the selected policy, not the mode's name, decides the startup result (P4)", () => {
	test("each entrypoint's stated target is checked against its own expected result", async () => {
		const manualPanel = panel();
		const manual = bound(connectBotManual, manualPanel.request);
		const manualCtx = contextOf(manual, "startup-manual-target", "E:/work/manual-target", "deepseek");
		manual.startSession(manualCtx);
		expect(manualPanel.requests).toEqual([]);
		expect(manual.widgets[manual.widgets.length - 1]?.lines).toBeUndefined();

		const automaticPanel = panel();
		const automatic = bound(connectBotAuto, automaticPanel.request);
		const automaticCtx = contextOf(automatic, "startup-auto-target", "E:/work/auto-target", "deepseek");
		const announced = automatic.nextNotification();
		automatic.startSession(automaticCtx);
		await announced;
		expect(automaticPanel.requests.map(envelopeOf).map(envelope => envelope.kind)).toEqual(["register", "state"]);
		expect(automatic.widgets[automatic.widgets.length - 1]?.lines).toEqual([MARKER_TEXT]);
	});

	test("a true or false document drives the same assembly to the stated result", async () => {
		const enabledPanel = panel();
		const enabled = bound(connectBotOmp(policyOf(true)), enabledPanel.request);
		const enabledCtx = contextOf(enabled, "startup-policy-true", "E:/work/true", "deepseek");
		const announced = enabled.nextNotification();
		enabled.startSession(enabledCtx);
		await announced;
		expect(enabledPanel.requests.map(envelopeOf).map(envelope => envelope.kind)).toEqual(["register", "state"]);

		const disabledPanel = panel();
		const disabled = bound(connectBotOmp(policyOf(false)), disabledPanel.request);
		const disabledCtx = contextOf(disabled, "startup-policy-false", "E:/work/false", "deepseek");
		disabled.startSession(disabledCtx);
		expect(disabledPanel.requests).toEqual([]);
		expect(disabled.widgets[disabled.widgets.length - 1]?.lines).toBeUndefined();
	});
});

describe("the automatic entrypoint activates without a command (P3, P16, P33)", () => {
	test("the selected startup policy registers this session and then renders its marker", async () => {
		const { requests, request } = panel();
		const double = bound(connectBotAuto, request);
		const ctx = contextOf(double, "startup-auto", "E:/work/auto", "deepseek");

		const announced = double.nextNotification();
		double.startSession(ctx);
		await announced;

		// Two requests, in order: the register the policy's intent started, then the state report
		// the command path also sends once an arm succeeds.
		expect(requests.map(envelopeOf).map(envelope => envelope.kind)).toEqual(["register", "state"]);
		expect(requests[0]?.url).toBe(`${ENDPOINT}${EVENTS_PATH}`);
		expect(requests[0]?.init.method).toBe("POST");
		expect(JSON.parse(requests[0]?.init.body ?? "")).toEqual({
			sessionId: "startup-auto",
			kind: "register",
			data: { cwd: "E:/work/auto", model: "deepseek", sessionName: "startup-auto" },
		});

		// The accepted receipt is what the operator hears, and only then does the area show the line.
		expect(double.notifications).toEqual(["已接入 herdr-bot 面板（当前 1 个在线会话）"]);
		// The start itself published the area cleared (the declared value was off), and the receipt's
		// write published the line: what matters is that the last render is the marker.
		expect(double.widgets[double.widgets.length - 1]).toEqual({
			key: MARKER_AREA_KEY,
			lines: [MARKER_TEXT],
			placement: MARKER_AREA_PLACEMENT,
		});
		// The heartbeat was scheduled by the same success path; nothing was persisted for this
		// memory-persisted extension, and the command registration is still there.
		expect(double.timers).toHaveLength(1);
		expect(double.appended).toEqual([]);
		expect(double.commandNames()).toEqual(["connect-bot"]);

		// The heartbeat the successful startup scheduled really beats: the same cadence and wire
		// envelope the command path uses, not a second post-startup behavior.
		double.timers[0]?.callback();
		expect(await waitFor(() => requests.some(sent => envelopeOf(sent).kind === "heartbeat"))).toBe(true);
		expect(JSON.parse(requests[requests.length - 1]?.init.body ?? "")).toEqual({
			sessionId: "startup-auto",
			kind: "heartbeat",
			data: { value: "idle" },
		});
	});
});

describe("the marker follows the receipt, not the attempt (P18, P19)", () => {
	test("an unanswered register keeps the area off; a refusal stays off; only a valid receipt enables", async () => {
		const requests: Request[] = [];
		const first = Promise.withResolvers<Response>();
		let registers = 0;
		setPanelRequestForTest(async (url, init = {}) => {
			requests.push({ url, init });
			const envelope = envelopeOf({ url, init });
			if (envelope.kind !== "register") {
				return new Response(JSON.stringify({ outcome: "accepted" }), { status: 200 });
			}
			registers += 1;
			if (registers === 1) return first.promise;
			return new Response(JSON.stringify({ outcome: "registered", onlineCount: 1 }), { status: 200 });
		});
		const double = ompDouble();
		connectBotAuto(double.api);
		const ctx = contextOf(double, "startup-latch", "E:/work/latch", "deepseek");

		const failed = double.nextNotification();
		double.startSession(ctx);
		await waitFor(() => requests.length === 1);

		// The register is on the wire and unanswered: the declared value is still off, so no line,
		// no heartbeat and no state report have happened.
		expect(requests.map(envelopeOf).map(envelope => envelope.kind)).toEqual(["register"]);
		expect(double.widgets[double.widgets.length - 1]?.lines).toBeUndefined();
		expect(double.timers).toEqual([]);
		expect(double.notifications).toEqual([]);

		// The panel refuses this attempt. Nothing is enabled, and the operator hears the existing word.
		first.resolve(new Response(JSON.stringify({ error: "refused" }), { status: 503 }));
		await failed;
		expect(double.notifications).toEqual([ARM_FAILED]);
		expect(double.widgets[double.widgets.length - 1]?.lines).toBeUndefined();
		expect(double.timers).toEqual([]);
		expect(botSessions.get("main:startup-latch")).toBeUndefined();

		// A later, valid receipt through the original command enables exactly as if it had always
		// been the command: the declared value, the state report, the marker and the heartbeat.
		const succeeded = double.nextNotification();
		double.run("connect-bot", "", ctx);
		await succeeded;
		expect(requests.map(envelopeOf).map(envelope => envelope.kind)).toEqual(["register", "register", "state"]);
		expect(double.notifications).toEqual([ARM_FAILED, "已接入 herdr-bot 面板（当前 1 个在线会话）"]);
		expect(double.widgets[double.widgets.length - 1]?.lines).toEqual([MARKER_TEXT]);
		expect(double.timers).toHaveLength(1);
	});
});

describe("one startup observation activates once, and manual repetition is not deduplicated (P26)", () => {
	test("later sessions and run turns register nothing on their own; repeated commands each register", async () => {
		const { requests, request } = panel();
		const double = bound(connectBotAuto, request);
		const first = contextOf(double, "startup-once", "E:/work/once", "deepseek");
		const second = contextOf(double, "startup-once-next", "E:/work/once-next", "deepseek");

		const announced = double.nextNotification();
		double.startSession(first);
		await announced;
		expect(requests.filter(sent => envelopeOf(sent).kind === "register")).toHaveLength(1);

		// Observation and navigation in the same process: a run cycle, a tree navigation and a switch
		// to another main session. The startup moment was consumed by the first start.
		double.startRun(first);
		await double.settleRun(first);
		double.navigateTree(first);
		double.switchSession(second, "new");
		await waitFor(() => requests.filter(sent => envelopeOf(sent).kind === "register").length === 1);
		expect(requests.filter(sent => envelopeOf(sent).kind === "register")).toHaveLength(1);

		// A directed command is still a real invocation every time: no command-level deduplication.
		const firstCommand = double.nextNotification();
		double.run("connect-bot", "", second);
		await firstCommand;
		const secondCommand = double.nextNotification();
		double.run("connect-bot", "", second);
		await secondCommand;
		expect(requests.filter(sent => envelopeOf(sent).kind === "register")).toHaveLength(3);
	});
});

describe("startup keeps the existing refusal rules (P23)", () => {
	test("a session without a UI is refused on stderr with no request or effect", () => {
		const { requests, request } = panel();
		const double = bound(connectBotAuto, request);
		const ctx = double.context({ sessionId: "startup-no-ui", cwd: "E:/work/headless", hasUI: false });

		const refusal = withCapturedStderr(() => double.startSession(ctx));

		expect(refusal.diagnostics).toBe(`${NO_UI_REFUSAL}\n`);
		expect(requests).toEqual([]);
		expect(double.notifications).toEqual([]);
		expect(double.timers).toEqual([]);
		expect(double.widgets[double.widgets.length - 1]?.lines).toBeUndefined();
	});

	test("a subagent whose owner resolves is not registered independently", () => {
		const { requests, request } = panel();
		const double = bound(connectBotAuto, request);
		double.agents.set("startup-parent", {
			id: "startup-parent",
			kind: "main",
			session: { sessionManager: { getSessionId: () => "startup-owned" } },
		});
		const ctx = double.context({
			sessionId: "startup-child",
			cwd: "E:/work/child",
			kind: "sub",
			parentId: "startup-parent",
		});

		double.startSession(ctx);

		expect(requests).toEqual([]);
		expect(double.notifications).toEqual([]);
		expect(double.timers).toEqual([]);
		expect(double.widgets).toEqual([]);
	});
});
