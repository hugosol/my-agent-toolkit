/**
 * A connect-bot binding the harness refuses, and what binding itself is (P11, P12; contract
 * S1; stories 12–14).
 *
 * The extension is driven exactly as the loader drives it: its own OMP assembly binds the
 * definition against the double, and the panel is a fake transport injected through the
 * extension's own seam, so every request is observed without a network. Withholding one member of
 * the injected surface is the one way a binding can be refused at this level — which version a
 * harness reports and which entries its api has are facts of the harness itself, which no install
 * can be asked to vary — and the double models a harness whose extension api exposes no lifecycle
 * subscription, so the two axes this extension declares and the framework's own history
 * preservation are all unavailable.
 *
 * What a refusal must leave behind is nothing: no label, no command, no area entry and, for this
 * extension in particular, no background heartbeat and no outbound request, while the session it
 * was refused for keeps running. What binding itself is, admitted or refused, is a registration
 * rather than a compatibility self-test: nothing is sent, scheduled, written or rendered until the
 * user's own command or a lifecycle delivery asks for it.
 */
import { afterEach, describe, expect, test } from "bun:test";
import {
	type PushFetchInit,
	type PushHttpResponse,
	type PushTransport,
	EVENTS_PATH,
	setPushTransportForTest,
} from "../../extensions/connect-bot/shared-logic/panel/client";
import type { OmpExtensionApi } from "../../framework/adapters/omp";
import connectBot from "../../entrypoints/omp/connect-bot";
import { ompDouble } from "./support/omp-double";

/** The endpoint the extension's own `config.yaml` ships; the file is the only source. */
const ENDPOINT = "http://127.0.0.1:8787";
/** The extension's marker text: what the area shows while the owner's value is `enabled`. */
const MARKER_TEXT = "◐ connectBot";

/** One outbound request the extension made, as the transport received it. */
interface Request {
	readonly url: string;
	readonly init: PushFetchInit;
}

/**
 * A panel that records every request and answers each one with the registered receipt, so an
 * admitted binding's own arm path completes exactly as it does against the live protocol.
 */
function recordingPanel(requests: Request[]): PushTransport {
	return async (url, init) => {
		requests.push({ url, init });
		return {
			status: 200,
			text: async () => JSON.stringify({ outcome: "registered", onlineCount: 1 }),
		} satisfies PushHttpResponse;
	};
}

/** Runs one piece of a test while capturing the non-model channel (stderr). */
function withCapturedStderr<T>(run: () => T): { readonly stderr: string; readonly value: T } {
	const chunks: string[] = [];
	const original = process.stderr.write;
	process.stderr.write = ((chunk: string | Uint8Array) => {
		chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
		return true;
	}) as typeof process.stderr.write;
	try {
		const value = run();
		return { stderr: chunks.join(""), value };
	} finally {
		process.stderr.write = original;
	}
}

/** The loader's api with one member withheld: what a harness whose surface lacks that entry looks like. */
function withoutLifecycleSubscription(api: OmpExtensionApi): OmpExtensionApi {
	return { ...api, on: undefined } as unknown as OmpExtensionApi;
}

/** Lets a promise chain — the arm path's register and the state report behind it — run to its end. */
async function settleAll(): Promise<void> {
	for (let turn = 0; turn < 200; turn += 1) await Promise.resolve();
}

/** An injected panel is per-test state: it must not stand in for the next test's transport. */
afterEach(() => {
	setPushTransportForTest(null);
});

describe("a refused connect-bot binding (P11)", () => {
	test("the refusal registers nothing, names what it declared, and leaves no heartbeat or request behind", () => {
		const requests: Request[] = [];
		// The panel is in place before the binding, so a request made *during* binding — the shape a
		// load-time compatibility probe would take — is recorded like any other.
		setPushTransportForTest(recordingPanel(requests));
		const double = ompDouble();

		const { stderr } = withCapturedStderr(() => connectBot(withoutLifecycleSubscription(double.api)));

		// Refused before the first registration: no label, no command, and nothing in the area.
		expect(double.labels).toEqual([]);
		expect(double.commandNames()).toEqual([]);
		expect(double.widgets).toEqual([]);
		// One explicit report on the non-model channel, naming the extension and each semantic it
		// declared and cannot get — the framework's own beside the two axes.
		const reported = stderr.split("\n").filter(line => line.includes("required semantics"));
		expect(reported).toHaveLength(1);
		expect(reported[0]).toContain("connect-bot");
		expect(reported[0]).toContain("history-preservation");
		expect(reported[0]).toContain("session-lifecycle-events");
		expect(reported[0]).toContain("round-lifecycle-events");

		// The session boundaries this extension would have driven reach nothing at all: a refused
		// binding subscribed no session behavior, so the boundary that would have wound a connection
		// down is never delivered, no background interval is ever scheduled, and no request is sent.
		const ctx = double.context({ sessionId: "admission-refused-session", cwd: "E:/work/refused" });
		double.startSession(ctx);
		double.switchSession(ctx, "resume");
		double.shutdown(ctx);

		expect(double.timers).toEqual([]);
		expect(double.appended).toEqual([]);
		expect(double.notifications).toEqual([]);
		expect(requests).toEqual([]);
	});
});

describe("binding connect-bot is not a behavioral self-test (P12)", () => {
	test("nothing is sent, scheduled, written or rendered before the user's own command asks for it", async () => {
		const requests: Request[] = [];
		setPushTransportForTest(recordingPanel(requests));
		const double = ompDouble();

		connectBot(double.api);

		// The binding is real — the extension is labeled and its command is registered — and that
		// registration is the whole of what it did. What a load-time compatibility self-test would
		// have to reach to observe anything about the harness is each of these channels, so each is
		// still empty: no panel request, no background interval, no session entry, no area, nothing
		// said to the operator.
		expect(double.labels).toEqual(["connectBot"]);
		expect(double.commandNames()).toEqual(["connect-bot"]);
		expect(requests).toEqual([]);
		expect(double.timers).toEqual([]);
		expect(double.appended).toEqual([]);
		expect(double.widgets).toEqual([]);
		expect(double.notifications).toEqual([]);

		// The records are real rather than silent: the same panel and the same double record every
		// effect once the user runs the command the binding registered.
		const announced = double.nextNotification();
		double.run("connect-bot", "", double.context({ sessionId: "registration-only-session", cwd: "E:/work/binding" }));
		await announced;
		await settleAll();

		expect(requests.length).toBeGreaterThan(0);
		expect(requests.every(request => request.url === `${ENDPOINT}${EVENTS_PATH}`)).toBe(true);
		expect(double.timers).toHaveLength(1);
		expect(double.widgets[double.widgets.length - 1]?.lines).toContain(MARKER_TEXT);
	});
});
