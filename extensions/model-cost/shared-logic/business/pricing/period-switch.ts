/**
 * The period switch behind `/budget holiday` and `/budget clear`: when the whole accounting period
 * may be closed, and what the operator is told about what happened.
 *
 * Both actions are the same operation with one difference — the period the switch opens is a
 * holiday period or an ordinary one — so they share this one rule set. What the switch decides is
 * the *entry's* own state, never the state of the accounting as a whole:
 *
 * - **The entry's own provider.** Both actions apply to a DeepSeek entry alone, and the restriction
 *   is the operator's own entry rather than a choice of what to reset: an entry running another
 *   provider (or one whose current model the surface cannot report) is warned and nothing happens.
 * - **The entry's own activity.** The session this command runs in must be reliably idle; a session
 *   still working is warned, and an activity state the harness does not report is refused as an
 *   error, because an unreported state is not idleness. Nothing is queued and nothing runs later:
 *   a refusal ends the command, and no Round, save or switch is forced to make one possible.
 * - **The entry's own save.** A snapshot this instance started and has not yet seen land is warned
 *   about in the same way, so the reset never races the write of the very consumption it closes.
 * - **An already-open holiday.** Asking for a holiday period a period already is says so and stops:
 *   the period is not switched, nothing is archived, and no balance is queried.
 *
 * Only when all of that holds does the switch reach the store, and the order there is the approved
 * one: one best-effort boundary balance query, made *before* the file coordination and never while
 * it is held, then the coordinated close — archive the file's own document, then publish the new
 * period. The reading a successful query produced is the one value both sides carry; a query that
 * failed or timed out leaves both fields out and the switch still happens, because the switch is
 * decided by the file's commit rather than by the query.
 *
 * What the operator reads afterwards says exactly how far the operation got: a success only after
 * the new activity is really on disk, and an archive that was written while the new activity was
 * not keeps its stage rather than being reported as a failure of the whole switch. A refused or
 * failed switch is reported once — through the invocation's own feedback for the conditions above,
 * and by throwing for everything the store answered, which the framework reports at error severity
 * with the action's own name.
 */
import type { ActionDelivery } from "../../../../../framework/core/protocol";
import { DEEPSEEK_PROVIDER } from "./provider-balance";
import type { ConsumptionStore } from "../../foundation/storage/consumption-store";

/** The two period actions, as the declared command names them. */
type PeriodAction = "holiday" | "clear";

/** What one period switch reads besides the invocation it was handed. */
export interface PeriodSwitchInputs {
	/** The extension's active consumption document, closed and reopened by a switch. */
	readonly storage: ConsumptionStore;
	/** Whether a snapshot this instance committed is still publishing. */
	readonly savePending: () => boolean;
	/** One best-effort boundary balance query, made outside any file coordination. */
	readonly boundaryReading: () => Promise<number | undefined>;
	/**
	 * Told once a reset really landed, so the business state that period belonged to can be dropped:
	 * the accounting's own accumulation for the closed period is not the new period's — neither are
	 * the Session spans it observed, the subagent runtimes it accumulated, or the executions behind
	 * those runtimes, whose late readings are no longer that period's to count — and leaving any of it
	 * in place would publish it into the period that replaced it.
	 */
	readonly onReset: () => void;
	/** The current instant, on the process's own clock (epoch milliseconds). */
	readonly now: () => number;
}

/** The two actions this switch implements, keyed by the name `/budget` declares. */
export interface PeriodSwitch {
	holiday(delivery: ActionDelivery): Promise<void>;
	clear(delivery: ActionDelivery): Promise<void>;
}

/**
 * Build the extension's period switch.
 *
 * Building has no effect of its own: no file is read, no query is made and no state is held.
 */
export function createPeriodSwitch(inputs: PeriodSwitchInputs): PeriodSwitch {
	const switchTo = async (action: PeriodAction, delivery: ActionDelivery): Promise<void> => {
		// The entry's own provider: a surface that reports no current model states nothing, and that
		// is not a DeepSeek entry either. The restriction is the entry's provider rather than the
		// records being reset, so no other provider's consumption is ever a reason to refuse.
		if (delivery.provider !== DEEPSEEK_PROVIDER) {
			const seen = delivery.provider === undefined ? "无法取得" : `「${delivery.provider}」`;
			delivery.feedback.notify(
				"warning",
				`/budget ${action} 仅适用于当前 provider 为 DeepSeek 的入口；本次入口的 provider ${seen}，未执行。`,
			);
			return;
		}
		// The entry's own activity. The idle query is three-valued, and the two non-idle answers are
		// told apart: a session that is working is a state to retry from, while a state the harness
		// does not report is one this command refuses rather than reading it as idle.
		const idle = delivery.canAcceptInput();
		if (idle === false) {
			delivery.feedback.notify(
				"warning",
				`/budget ${action} 未执行：当前入口仍在工作（Round 未结束）；本命令不排队，请在空闲后重试。`,
			);
			return;
		}
		if (idle === undefined) {
			delivery.feedback.notify(
				"error",
				`/budget ${action} 已拒绝：无法可靠判断当前入口的活动状态；本命令不猜空闲，也不排队。`,
			);
			return;
		}
		if (inputs.savePending()) {
			delivery.feedback.notify(
				"warning",
				`/budget ${action} 未执行：当前入口的消费保存尚未收口；本命令不排队，请稍后重试。`,
			);
			return;
		}
		const period = inputs.storage.period();
		if (period === undefined) {
			// No valid baseline is nothing to close: this instance holds no period to archive and no
			// document a new one may be published over. The framework reports this one at error
			// severity, and the file is left for inspection exactly as it was.
			throw new Error(
				`没有可用的消费存储基线，${action} 未执行，也未覆盖「${inputs.storage.consumptionFile}」。`,
			);
		}
		if (action === "holiday" && period.holiday) {
			// The idempotent case: an entry already in a holiday period is not switched again, and no
			// balance is read for a period that is not ending.
			delivery.feedback.notify("info", "holiday 已开启：本次未归档、未切换周期，也未查询余额。");
			return;
		}
		// The one boundary read, made outside the file coordination and before it is taken: it is a
		// single attempt, and the reading it produced — when it produced one — is the same value the
		// closed period ends at and the new one starts from.
		const endBal = await inputs.boundaryReading();
		const outcome = await inputs.storage.reset({
			holiday: action === "holiday",
			...(endBal === undefined ? {} : { endBal }),
			at: inputs.now(),
		});
		switch (outcome.kind) {
			case "reset":
				// The reset landed, so the period it closed is no longer the one this instance accumulates
				// into: what it held for that period is dropped here, before the operator is told the
				// switch happened, so nothing of the closed period can follow it into the new one.
				inputs.onReset();
				delivery.feedback.notify(
					"info",
					action === "holiday"
						? `已归档本次全部已保存消费（archives/${outcome.archive}），并开始新的假日周期（holiday=true）。`
						: `已归档本次全部已保存消费（archives/${outcome.archive}），并开始新的统计周期（holiday=false）。`,
				);
				return;
			case "unusable":
				throw new Error(
					`没有可用的消费存储基线（${outcome.reason}），${action} 未执行，也未覆盖「${inputs.storage.consumptionFile}」。`,
				);
			case "archive-failed":
				throw new Error(`归档未生成（${outcome.detail}），消费活动未重置、未发生改动。`);
			case "archive-written":
				// The stage is the whole point of this answer: the archive exists and the new activity
				// does not, so the operator is told both rather than being told the switch failed.
				throw new Error(
					`归档已生成（archives/${outcome.archive}），但新的消费活动未提交（${outcome.failure}）；不报告成功。`,
				);
			case "failed":
				throw new Error(`消费活动未提交（${outcome.failure}），未发生任何改动。`);
		}
	};

	return {
		holiday: delivery => switchTo("holiday", delivery),
		clear: delivery => switchTo("clear", delivery),
	};
}
