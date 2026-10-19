/**
 * connect-bot's one feedback decision, and the ten texts it chooses between.
 *
 * Everything this extension says to the operator is one of ten words, and this module is where
 * they all are: arm success and failure (A, B), the two halves of an `off` (C, D), the two notices
 * the failure budget produces (E, F), the notice a session being left gets (G), the usage error for
 * an unrecognized argument (H) and the refusal a session with no UI gets (I) — plus J, the
 * refusal that has no words at all.
 *
 * {@link selectFeedback} is the one place that decides which of them applies, and it decides from
 * facts the callers have already normalized: an arm's register receipt or its absence, whether the
 * panel answered an `off`'s unregister at all, what the failure budget made of one settled push, the
 * reason a session ended. It reads no status code and no transport error text — a reachable panel
 * is a fact the caller established, not a number this table interprets. A trigger that says nothing
 * answers `undefined`, so silence is this function's decision too rather than an absent call: no
 * caller decides wording, severity or whether to speak.
 *
 * Every text below is the one the frozen behavior baseline used, verbatim, with the one change the
 * migration decided: the usage error names `off`, the only word form this command has, where the
 * baseline wrote `offline`. The severities are the baseline's as well: `info` reports an effect that
 * happened, `error` one that did not.
 *
 * The channel itself is the framework's (see `framework/interface/feedback`): a UI notification at
 * the severity chosen here when the session has a UI, one stderr line when it has not, and never
 * model context. This module owns the wording alone.
 */
import type { FeedbackLevel, FeedbackTransport } from "../../../framework/interface/feedback";
import type { SessionEndReason } from "../../../framework/interface/session";
import type { FailureAction } from "./panel/failure-budget";

/** One text this extension publishes, at the severity the outcome carries. */
export interface ExtensionFeedback {
	readonly level: FeedbackLevel;
	readonly message: string;
}

/**
 * One thing that happened, in this extension's own vocabulary, carrying the normalized facts that
 * decide what the operator is told about it.
 *
 * The members are what a caller already has in hand when it asks: the receipt an arm's register
 * produced (or nothing, when the panel did not answer as one), an `off`'s two facts — whether
 * anything was connected, and whether the panel answered the unregister that followed — the reason
 * a session ended and whether it had been connected, what the failure budget made of one settled
 * push, an argument the command surface did not recognize, and whether a refused session has a UI.
 */
export type FeedbackInput =
	| { readonly trigger: "arm"; readonly register: { readonly onlineCount: number } | undefined }
	| { readonly trigger: "off"; readonly enabledBefore: boolean; readonly panelAnswered: boolean }
	| { readonly trigger: "disconnecting" }
	| {
			readonly trigger: "session-end";
			readonly reason: SessionEndReason;
			readonly enabledBefore: boolean;
	  }
	| { readonly trigger: "push-failure"; readonly action: FailureAction }
	| { readonly trigger: "unknown-argument"; readonly argument: string }
	| { readonly trigger: "no-ui"; readonly hasUI: boolean }
	| { readonly trigger: "subagent" };

/**
 * What one trigger says to the operator, and how serious it is; `undefined` when it says nothing.
 *
 * The rows are the frozen baseline's texts, in the order the behavior baseline lists them. Each one
 * is decided by the normalized facts its own path produced and by nothing else, so two paths that
 * reach the same outcome reach the same words.
 */
export function selectFeedback(input: FeedbackInput): ExtensionFeedback | undefined {
	switch (input.trigger) {
		case "arm":
			// A / B: the receipt also reports how many sessions are online right now — including this
			// one — while a panel that did not answer as a register leaves this session unarmed.
			return input.register === undefined
				? { level: "error", message: "无法连接 omp-bot，未启用；请确认面板已启动" }
				: { level: "info", message: `已接入 omp-bot 面板（当前 ${input.register.onlineCount} 个在线会话）` };

		case "off":
			// C / D: any HTTP answer means the panel is reachable and the row is gone — a `404` after
			// an omp-bot restart included — while a request that never completed is the other word.
			// An `off` for a session that was not connected happened to nothing, so it says nothing.
			if (!input.enabledBefore) return undefined;
			return input.panelAnswered
				? { level: "info", message: "已断开 omp-bot 面板" }
				: { level: "error", message: "omp-bot 面板未响应" };

		case "disconnecting":
			// K: a new activation arrived while the unregister the operator asked for is still on
			// the wire. It is not queued; the operator can run the command again once it settles.
			return { level: "error", message: "正在断开 omp-bot 面板，请稍后重试" };

		case "session-end":
			// G: another identity took this session's place, so the connection it held is gone and a
			// manual `/connect-bot` is what reconnects it. A disposal is not this row: the process is
			// going away, so there is no session left to reconnect and the row it leaves behind belongs
			// to the panel's own expiry.
			if (input.reason !== "transferred" || !input.enabledBefore) return undefined;
			return { level: "info", message: "会话已切换，已断开面板；重新 /connect-bot 可重连" };

		case "push-failure":
			// E / F, and the silence between them: the first failure of an outage announces it once,
			// the failure that exhausts the budget announces the end of the connection, and every
			// failure the segment has already accounted for says nothing at all.
			if (input.action === "notify-first") {
				return { level: "error", message: "与 omp-bot 面板连接中断；若持续失败将自动断开" };
			}
			if (input.action === "notify-disarm") {
				return { level: "error", message: "与 omp-bot 连接中断，已断开；重新执行 /connect-bot 可重连" };
			}
			return undefined;

		case "unknown-argument":
			// H: the argument is echoed as the user typed it — the framework's normalization carries
			// the text, and this extension never reinterprets it — and the hint names the command's
			// one word form.
			return {
				level: "error",
				message: `未知参数「${input.argument}」；用法：/connect-bot（接入 omp-bot 面板）或 /connect-bot off（断开）。`,
			};

		case "no-ui":
			// I: a session with no UI is told the mode supports no panel; the level travels with the
			// message, and the framework's channel puts it on stderr because there is no UI to notify.
			return input.hasUI ? undefined : { level: "error", message: "当前模式无 UI，不支持接入面板" };

		case "subagent":
			// J: a subagent never registers on the panel, and the refusal is deliberately silent —
			// the framework's owner scope would keep its delivery from reaching this extension at all,
			// and this one adds no words to that decision.
			return undefined;
	}
}

/**
 * Publishes whatever a trigger has to say, through the transport the caller's delivery or retained
 * capability carries.
 *
 * This is the one place a caller touches the feedback channel: it asks the table and says what the
 * table chose, and a trigger whose answer is `undefined` publishes nothing. Reading it the same way
 * everywhere is what keeps a caller from deciding a severity, a wording or a silence of its own.
 */
export function publishFeedback(transport: FeedbackTransport, input: FeedbackInput): void {
	const feedback = selectFeedback(input);
	if (feedback !== undefined) transport.notify(feedback.level, feedback.message);
}
