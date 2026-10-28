import { expect, test } from "bun:test";
import { promptDock, roleGuidance } from "./support/prompt-dock";

// Approved seam S1: observe the shipped entry's actual Prompt at the provider boundary.
// P26 source: the ticket/contract's complete manager guide, not a copy of the declaration.
// Violation: a short status/state guide omits dispatch, reconciliation and collect;
// a real first request must carry all operational instructions, not just tool descriptions.
test("P26 manager receives the complete action, recovery and collect guide on first enabled run", async () => {
	const dock = await promptDock("manager");
	try {
		expect((await dock.session.prompt("PROMPT-WORK-MANAGER-26")).status).toBe("completed");
		const guide = roleGuidance(dock.capture.requests()[0]!, "manager");
		for (const action of ["status", "dispatch", "complete", "fail", "reconcile_dispatch", "recover", "retry", "pause", "resume", "finish"]) expect(guide).toContain(action);
		for (const term of ["collect", "paused", "completed", "notification", "no-running", "timeout", "pendingReports", "messages.jsonl", "confirmed", "uncertain", "not_created", "created"]) expect(guide).toContain(term);
		for (const instruction of [
			/逐项阅读 results.*failure.stage.*effects.*snapshot/, /一个目标失败不表示其他目标未启动/,
			/not_created.*人工确认未创建.*pending.*显式 dispatch/, /created.*后端只读核实.*原执行/,
			/recover.*nodeId.*confirmed.*reason.*保留原执行和 Chat/, /不启动或 Resume 进程.*不补发输入/,
			/retry.*新执行和新 Chat.*保留旧历史与副作用/, /paused 下 retry 被拒绝.*显式 resume/, /不把 false 当 true/,
			/collect 无业务参数/, /notification.*不依赖辅助通知成功/, /no-running.*避免空等/,
			/timeout.*后端正常到期.*不是客户端预算耗尽/, /running.*ready.*可能等待/,
			/完整请求预算.*正文读取/, /pendingReports.*不含 reports 正文/, /读取或检查通知不清除交接待办/,
			/旧执行报告不能替代新执行依据/, /亲自核实材料.*使用方法和限制.*complete/,
			/report、停轮或退出都不等于 completed/, /人工补齐执行失败的结果后可 complete/,
			/pending 或派发失败不能.*跳过工作或核实/, /全部 node completed 后显式 finish.*终态不得重开/,
			/historyError.*stateCommitted/, /HTTP 200.*全部成功/, /不表示后端回滚或未生效.*不自主重试/,
		]) expect(guide).toMatch(instruction);
	} finally { await dock.close(); }
}, 300_000);

// P26 node wording already implements the criterion: verify it, do not manufacture a red.
// A guide saying notification failure means report failure, or that report completes a node,
// must fail these observations even though the scripted provider never chooses an action.
test("P26 node receives handoff timing, readable artifacts, cleanup and saved-report failure instructions", async () => {
	const dock = await promptDock("node");
	try {
		expect((await dock.session.prompt("PROMPT-WORK-NODE-26")).status).toBe("completed");
		const guide = roleGuidance(dock.capture.requests()[0]!, "node");
		for (const instruction of [/参数只有 body/, /可交接时报告/, /绝对地址/, /使用方法/, /编码和限制/, /继续.*收尾/, /saved=true.*已保存/, /notification.*diagnostic.*失败.*不是未提交/, /不要.*重报/, /不等于 node completed/, /管理者.*核实.*complete/, /不自主重试/, /旧执行.*不能替代新执行/]) expect(guide).toMatch(instruction);
		expect(guide).not.toContain("run action=");
	} finally { await dock.close(); }
}, 300_000);
