/**
 * The one text table at its own seam (E16, P37): `selectFeedback` — the pure function the contract
 * names — and the ten frozen texts it chooses between.
 *
 * The table is what every path that speaks to the operator goes through, so it is also where the
 * texts themselves can be checked without a runtime, a panel or a session: each row below pairs a
 * normalized input with the words the behavior baseline fixed for it, and the expectations are the
 * baseline's own texts — the source of truth is the frozen table, never this function's output.
 *
 * Two things about the shape of the seam are checked here too, because they are what makes it one
 * table rather than a place where a status code decides a sentence: the silences (a disposal, an
 * unnoticed failure, a subagent) are answers of this function rather than absent calls, and the code
 * carries no numeric status at all. Which HTTP answer counts as "the panel is reachable" is the wire
 * client's and is exercised where it happens — `./off.test.ts` drives a `200` and a `404` to the same
 * row.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { type FeedbackInput, selectFeedback } from "../../extensions/connect-bot/feedback";
import { REPO_ROOT } from "../harness/baseline";

/** What one trigger says: a text at a severity, or nothing at all. */
type Answer = { readonly level: "info" | "error"; readonly message: string } | undefined;

/** One row of the frozen table, with the letter the behavior baseline gives it. */
interface Row {
	readonly letter: string;
	readonly label: string;
	readonly input: FeedbackInput;
	readonly says: Answer;
}

/**
 * The rows the baseline fixes, in its order.
 *
 * Every text below is the baseline's verbatim — including the one change the migration decided, in
 * row H, whose usage error names `off` where the baseline wrote `offline`.
 */
const ROWS: readonly Row[] = [
	{
		letter: "A",
		label: "an arm the panel registered, with the online count it reported",
		input: { trigger: "arm", register: { onlineCount: 3 } },
		says: { level: "info", message: "已接入 omp-bot 面板（当前 3 个在线会话）" },
	},
	{
		letter: "B",
		label: "an arm no panel registered: this session is not being monitored",
		input: { trigger: "arm", register: undefined },
		says: { level: "error", message: "无法连接 omp-bot，未启用；请确认面板已启动" },
	},
	{
		letter: "C",
		label: "an off the panel answered",
		input: { trigger: "off", enabledBefore: true, panelAnswered: true },
		says: { level: "info", message: "已断开 omp-bot 面板" },
	},
	{
		letter: "D",
		label: "an off the panel never answered",
		input: { trigger: "off", enabledBefore: true, panelAnswered: false },
		says: { level: "error", message: "omp-bot 面板未响应" },
	},
	{
		letter: "E",
		label: "the first failure of an outage, announced once",
		input: { trigger: "push-failure", action: "notify-first" },
		says: { level: "error", message: "与 omp-bot 面板连接中断；若持续失败将自动断开" },
	},
	{
		letter: "F",
		label: "the failure that exhausts the budget: the connection ended and needs the command again",
		input: { trigger: "push-failure", action: "notify-disarm" },
		says: { level: "error", message: "与 omp-bot 连接中断，已断开；重新执行 /connect-bot 可重连" },
	},
	{
		letter: "G",
		label: "a session being left for another identity",
		input: { trigger: "session-end", reason: "transferred", enabledBefore: true },
		says: { level: "info", message: "会话已切换，已断开面板；重新 /connect-bot 可重连" },
	},
	{
		letter: "H",
		label: "an argument the command surface does not recognize, echoed as typed",
		input: { trigger: "unknown-argument", argument: "offline" },
		says: {
			level: "error",
			message: "未知参数「offline」；用法：/connect-bot（接入 omp-bot 面板）或 /connect-bot off（断开）。",
		},
	},
	{
		letter: "I",
		label: "a session whose mode has no UI at all",
		input: { trigger: "no-ui", hasUI: false },
		says: { level: "error", message: "当前模式无 UI，不支持接入面板" },
	},
	{
		letter: "J",
		label: "a subagent, whose refusal is deliberately silent",
		input: { trigger: "subagent" },
		says: undefined,
	},
	{
		// The one row the registration deepening adds: an activation refused while the unregister
		// the operator asked for is still on the wire. It is a refusal with words and no state.
		letter: "K",
		label: "a new activation while the requested unregister is still in flight",
		input: { trigger: "disconnecting" },
		says: { level: "error", message: "正在断开 omp-bot 面板，请稍后重试" },
	},
];

/** The inputs the table answers with nothing, and why each of them is silent. */
const SILENCES: ReadonlyArray<readonly [string, FeedbackInput]> = [
	["an off for a session that was not connected", { trigger: "off", enabledBefore: false, panelAnswered: false }],
	[
		"an off for a session that was not connected, whatever the panel answered",
		{ trigger: "off", enabledBefore: false, panelAnswered: true },
	],
	["a failure the segment has already accounted for", { trigger: "push-failure", action: "silent" }],
	["a disposal: the process is going away, not the connection alone", { trigger: "session-end", reason: "disposed", enabledBefore: true }],
	[
		"a transfer of a session that was never connected",
		{ trigger: "session-end", reason: "transferred", enabledBefore: false },
	],
	["a refusal of a session that does have a UI", { trigger: "no-ui", hasUI: true }],
];

describe("the table's words are the frozen baseline's, verbatim (E16, P37)", () => {
	for (const { letter, label, input, says } of ROWS) {
		test(`${letter}: ${label}`, () => {
			expect(selectFeedback(input)).toEqual(says);
		});
	}

	test("the usage error names `off`, the one word form this command has", () => {
		// The baseline wrote `offline` here; the migration made `off` the command's own word and the
		// hint follows it, so the text names the form that exists and no other.
		const answer = selectFeedback({ trigger: "unknown-argument", argument: "offline" });
		expect(answer?.message).toContain("/connect-bot off（断开）");
		expect(answer?.message).not.toContain("offline（断开）");
	});
});

describe("the table's silences are its own answers, not absent calls (E16, P37)", () => {
	for (const [label, input] of SILENCES) {
		test(`${label} publishes nothing`, () => {
			expect(selectFeedback(input)).toBeUndefined();
		});
	}
});

describe("no status code decides a sentence (P37)", () => {
	test("the table's code carries no status at all", () => {
		// The decision is the paths' normalized facts and nothing else: whether the panel was
		// reachable at all, whether it registered this session, what the budget made of a push. A
		// number appearing here would be a second vocabulary for the same outcome, and the wire
		// client's own reading of `200`/`404` would have leaked into wording.
		const code = readFileSync(path.join(REPO_ROOT, "extensions/connect-bot/feedback.ts"), "utf8")
			.replace(/\/\*[\s\S]*?\*\//g, "")
			.replace(/^\s*\/\/.*$/gm, "");
		expect(code).not.toMatch(/\bstatus\b/);
		expect(code).not.toMatch(/\b[1-5]\d\d\b/);
	});
});
