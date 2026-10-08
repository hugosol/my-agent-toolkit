/**
 * The gate `/connect-bot` runs behind, at the OMP extension seam (E6).
 *
 * Only a main session with a UI may act: a subagent is refused silently — no request, no state
 * write, no record, and not one word to the operator — and a session without a UI is refused
 * with the fixed message, which the unified feedback channel turns into a single stderr line.
 * Both refusals are observed here through the same extension the loader drives, so the gate is
 * exercised where the delivery's facts actually come from.
 */
import { describe, expect, test } from "bun:test";
import {
	type PushFetchInit,
	type PushTransport,
	setPushTransportForTest,
} from "../../extensions/connect-bot/shared-logic/panel/client";
import { botSessions } from "../../extensions/connect-bot/shared-logic/session/session";
import connectBot from "../../extensions/connect-bot/harnesses/omp";
import { type OmpDouble, ompDouble } from "./support/omp-double";

/** The refusal a session without a UI gets, verbatim. */
const NO_UI_REFUSAL = "当前模式无 UI，不支持接入面板";

/** Every request the extension attempted, in order. */
interface Attempt {
	readonly url: string;
	readonly init: PushFetchInit;
}

/** Binds the extension against a fresh double with a panel that would register if it were asked. */
function bound(): { readonly double: OmpDouble; readonly attempts: Attempt[] } {
	const attempts: Attempt[] = [];
	const transport: PushTransport = async (url, init) => {
		attempts.push({ url, init });
		return { status: 200, text: async () => JSON.stringify({ outcome: "registered", onlineCount: 1 }) };
	};
	const double = ompDouble();
	connectBot(double.api);
	setPushTransportForTest(transport);
	return { double, attempts };
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

describe("only a main session with a UI may act (E6)", () => {
	test("a subagent is refused in silence: no request, no write, no record, no words", () => {
		const { double, attempts } = bound();
		const ctx = double.context({ sessionId: "guard-subagent", cwd: "E:/work/sub", kind: "sub" });

		// The refusal is the framework's owner scope plus this gate: either way nothing at all
		// may be said to the operator, so the extension's own refusal text must not appear.
		const refusal = withCapturedStderr(() => double.run("connect-bot", "", ctx));

		expect(refusal.diagnostics).not.toContain(NO_UI_REFUSAL);
		expect(attempts).toEqual([]);
		expect(double.notifications).toEqual([]);
		expect(double.widgets).toEqual([]);
		expect(double.appended).toEqual([]);
		expect(botSessions.get("main:guard-subagent")).toBeUndefined();
	});

	test("a session without a UI is refused on stderr and changes nothing", () => {
		const { double, attempts } = bound();
		const ctx = double.context({ sessionId: "guard-no-ui", cwd: "E:/work/headless", hasUI: false });

		const refusal = withCapturedStderr(() => double.run("connect-bot", "", ctx));

		expect(refusal.diagnostics).toBe(`${NO_UI_REFUSAL}\n`);
		// The refusal reaches no UI channel, sends no request and writes nothing.
		expect(attempts).toEqual([]);
		expect(double.notifications).toEqual([]);
		expect(double.widgets).toEqual([]);
		expect(double.appended).toEqual([]);
		expect(botSessions.get("main:guard-no-ui")).toBeUndefined();
	});
});
