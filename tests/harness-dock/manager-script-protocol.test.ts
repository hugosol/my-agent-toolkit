import { expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { dualRoleDock } from "../workflow-chat/support/dual-role-dock";
import { providerMessages, roleGuidance } from "../workflow-chat/support/prompt-dock";

// Approved S2 enabling seam (P34/P35): normal OMP/Pi manager entries, native tools,
// Session, HTTP, file reader and subsequent provider context. Only provider/HTTP are
// controlled. These checks do NOT prove Rust execution, backend gates or H1/H2.
// Independent source: public rust_script execution/report contract and ticket 10.
// Violation: treating dispatch/lifecycle success as node completion, requiring Chat,
// dropping null-source reports, or hiding the original partial-effect error.
for (const host of ["omp", "pi"] as const) {
	test(`${host} manager consumes no-Chat script dispatch and explicit report before complete`, async () => {
		const dock = await dualRoleDock(host);
		try {
			const execution = {
				id: "exec-create-1", kind: "rust_script", rustScript: "create_blank_bot",
				zone: dock.root.workDir, inputRule: [], outputRule: [{ id: "baseline" }, { id: "handoff" }],
				inputs: [], reportPolicy: "auto", autoClose: false,
				lifecycle: { status: "running", startedAt: 1794480000000 },
			};
			const dispatched = {
				results: [{ nodeId: "create", status: "running" }],
				snapshot: { status: "running", nodes: { create: { status: "running", execution } } },
				ready: [], blocked: { next: ["create"] }, canFinish: false,
			};
			dock.answer(dispatched);
			const dispatch = await dock.call("run", { action: "dispatch", nodes: ["create"] });
			expect(dispatch.isError).toBe(false);
			expect(dispatch.body).toEqual(dispatched);
			const first = dock.capture.requests()[0]!;
			const guide = roleGuidance(first, "manager");
			// Targeted semantic clauses, not a full-prompt snapshot or a registration test.
			expect(guide).toContain('kind: "rust_script"');
			expect(guide).toContain("已派发，不表示业务结束");
			expect(guide).toContain("不要求模型重复确定性 Rust 业务验收");
			const dispatchMessages = providerMessages(dock.capture.requests()[dock.capture.requests().length - 1]!);
			expect(dispatchMessages.some(message => message.role === "tool" && message.content.includes('"exec-create-1"'))).toBe(true);
			const managerId = dock.calls[0]!.body.sessionId;
			const report = {
				id: "report-create-1", type: "report", at: 1794480000011,
				runId: "run-script", nodeId: "create", executionId: "exec-create-1",
				from: null, source: { kind: "rust_script", rustScript: "create_blank_bot" },
				to: { sessionId: managerId, workspaceId: "workspace-1", tabId: "tab-1", paneId: "pane-1", agentName: "manager" },
				body: "创建、合法保存和完整读回成功；仅交付空白定义，目标业务未执行。",
				canComplete: true, outputs: [],
			};
			const collected = {
				reason: "notification", pendingReports: { create: "report-create-1" },
				snapshot: { status: "running", nodes: { create: { status: "running", execution: {
					...execution, lifecycle: { status: "succeeded", startedAt: 1794480000000, endedAt: 1794480000010 },
				} } } }, ready: [], blocked: { next: ["create"] }, canFinish: false,
			};
			dock.answer(collected);
			expect((await dock.call("collect", {})).body).toEqual(collected);
			const record = join(dock.root.workDir, "messages.jsonl");
			writeFileSync(record, `${JSON.stringify(report)}\n`);
			const read = await dock.call("read", { path: record });
			expect(read.isError).toBe(false);
			const messages = providerMessages(dock.capture.requests()[dock.capture.requests().length - 1]!);
			expect(messages.some(message => message.role === "tool" && message.content.includes(report.body)
				&& message.content.includes('"from":null') && message.content.includes('"canComplete":true'))).toBe(true);
			// No implicit complete, downstream dispatch, node context lookup or new receiver.
			expect(dock.calls).toEqual([
				{ path: "/api/workflow/manager/dispatch", body: { sessionId: managerId, nodes: ["create"] } },
				{ path: "/api/workflow/manager/collect", body: { sessionId: managerId } },
			]);
			dock.answer({ changed: true, ready: ["next"], canFinish: false });
			expect((await dock.call("run", { action: "complete", nodeId: "create", reason: "当前执行最新 true 报告允许交接；目标业务未执行" })).isError).toBe(false);
			expect(dock.calls[dock.calls.length - 1]).toEqual({ path: "/api/workflow/manager/complete", body: {
				sessionId: managerId, nodeId: "create", reason: "当前执行最新 true 报告允许交接；目标业务未执行",
			} });
			expect(dock.calls).toHaveLength(3);
		} finally { await dock.close(); }
	}, 180_000);

	// Violation: flattening a materials error into "nothing happened", promoting false
	// confirmation, recovering a finished script, or carrying old true into a new execution.
	// HTTP replies below are controlled outcomes, NOT proof of the backend's state machine.
	test(`${host} manager preserves script partial effects and explicit fail retry with stale-report refusal`, async () => {
		const dock = await dualRoleDock(host);
		try {
			const failure = { stage: "materials", code: "material-write-failed",
				message: "saved 文件不可写；Bot 已保存并读回。",
				effects: { write: "succeeded", readBack: "succeeded", materials: [
					{ id: "saved", path: join(dock.root.workDir, "saved.json"), status: "failed" },
				] },
			};
			const execution = { id: "exec-save-old", kind: "rust_script", rustScript: "save_bot_guides",
				zone: dock.root.workDir, inputRule: [], outputRule: [{ id: "saved" }, { id: "handoff" }], inputs: [],
				reportPolicy: "auto", autoClose: false,
				lifecycle: { status: "failed", startedAt: 1794480000000, endedAt: 1794480000010, failure },
			};
			const failedWork = { reason: "notification", pendingReports: { save: "report-save-failed" },
				snapshot: { status: "running", nodes: { save: { status: "running", execution } } },
				ready: [], blocked: { next: ["save"] }, canFinish: false,
			};
			dock.answer(failedWork);
			expect((await dock.call("collect", {})).body).toEqual(failedWork);
			const guide = roleGuidance(dock.capture.requests()[0]!, "manager");
			expect(guide).toContain("先显式 fail");
			expect(guide).toContain("新执行，但没有新 Chat");
			expect(guide).toContain("已结束的脚本不适用 recover");
			// Keep the existing Task/Map recovery and human confirmation semantics.
			expect(guide).toContain("启动新执行和新 Chat");
			expect(guide).toContain("原 Chat 可继续");
			const managerId = dock.calls[0]!.body.sessionId;
			const report = { id: "report-save-failed", type: "report", at: 1794480000011,
				runId: "run-script", nodeId: "save", executionId: "exec-save-old", from: null,
				source: { kind: "rust_script", rustScript: "save_bot_guides" },
				to: { sessionId: managerId, workspaceId: "workspace-1", tabId: "tab-1", paneId: "pane-1", agentName: "manager" },
				body: "saved 文件不可写；Bot 已保存并读回。未交付 saved；不回滚，不刷新 baseline，原 baseline 重跑仍可能 revision 冲突。",
				canComplete: false, outputs: [],
			};
			const record = join(dock.root.workDir, "messages.jsonl");
			writeFileSync(record, `${JSON.stringify(report)}\n`);
			expect((await dock.call("read", { path: record })).isError).toBe(false);
			const received = providerMessages(dock.capture.requests()[dock.capture.requests().length - 1]!);
			expect(received.some(message => message.role === "tool" && message.content.includes(report.body)
				&& message.content.includes('"canComplete":false'))).toBe(true);
			expect(received.some(message => message.role === "tool" && message.content.includes('"write":"succeeded"')
				&& message.content.includes('"code":"material-write-failed"'))).toBe(true);
			const failReason = "已核实材料生成失败，Bot 已保存；保留部分效果";
			dock.answer({ changed: true, snapshot: { nodes: { save: { status: "failed", execution } } } });
			expect((await dock.call("run", { action: "fail", nodeId: "save", reason: failReason })).isError).toBe(false);
			const ended = { code: "script-execution-ended", message: "已结束的脚本不能 recover", stateCommitted: false };
			dock.answer(ended, 409);
			const recover = await dock.call("run", { action: "recover", nodeId: "save", confirmed: true, reason: "明确检查后端拒绝，不启动新工作" });
			expect(recover).toMatchObject({ isError: true, details: { httpStatus: 409, body: ended }, body: ended });
			const unconfirmed = { code: "retry-confirmation-required", message: "须检查旧副作用并确认独立重做", stateCommitted: false };
			dock.answer(unconfirmed, 409);
			expect((await dock.call("run", { action: "retry", nodeId: "save", confirmed: false, reason: "尚未确认" })).body).toEqual(unconfirmed);
			const rerun = { ...execution, id: "exec-save-new", lifecycle: { status: "running", startedAt: 1794480000020 } };
			const retried = { result: { nodeId: "save", status: "running" }, snapshot: { nodes: { save: {
				status: "running", execution: rerun, previousExecutions: [execution],
			} } } };
			dock.answer(retried);
			const retryReason = "人工已检查已保存 Bot、旧材料与副作用，修复请求后确认独立重做";
			expect((await dock.call("run", { action: "retry", nodeId: "save", confirmed: true, reason: retryReason })).body).toEqual(retried);
			// Explicit reader sees a late true from OLD execution; completion still uses the
			// current backend refusal, not any client inference from the last report read.
			writeFileSync(record, `${JSON.stringify({ ...report, id: "old-late-true", canComplete: true })}\n`);
			expect((await dock.call("read", { path: record })).isError).toBe(false);
			const stale = { code: "current-report-required", message: "当前执行没有最新 true 报告；旧执行 true 不适用", stateCommitted: false };
			dock.answer(stale, 409);
			const complete = await dock.call("run", { action: "complete", nodeId: "save", reason: "检查旧执行 true 不授予新执行资格" });
			expect(complete).toMatchObject({ isError: true, details: { httpStatus: 409, body: stale } });
			dock.answer({ reason: "timeout", pendingReports: {}, snapshot: retried.snapshot });
			expect((await dock.call("collect", {})).isError).toBe(false);
			const expected = [
				{ path: "/api/workflow/manager/collect", body: { sessionId: managerId } },
				{ path: "/api/workflow/manager/fail", body: { sessionId: managerId, nodeId: "save", reason: failReason } },
				{ path: "/api/workflow/manager/recover", body: { sessionId: managerId, nodeId: "save", confirmed: true, reason: "明确检查后端拒绝，不启动新工作" } },
				{ path: "/api/workflow/manager/retry", body: { sessionId: managerId, nodeId: "save", confirmed: false, reason: "尚未确认" } },
				{ path: "/api/workflow/manager/retry", body: { sessionId: managerId, nodeId: "save", confirmed: true, reason: retryReason } },
				{ path: "/api/workflow/manager/complete", body: { sessionId: managerId, nodeId: "save", reason: "检查旧执行 true 不授予新执行资格" } },
				{ path: "/api/workflow/manager/collect", body: { sessionId: managerId } },
			];
			expect(dock.calls).toEqual(expected);
			for (const field of ["sessionId", "runId", "executionId", "recipient", "source"]) {
				expect((await dock.call("run", { action: "retry", nodeId: "save", confirmed: true, reason: "不得指定归属", [field]: "forged" })).isError).toBe(true);
			}
			expect(dock.calls).toEqual(expected);
		} finally { await dock.close(); }
	}, 180_000);
}
