import { expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dualRoleDock } from "../workflow-chat/support/dual-role-dock";
import { providerMessages, roleGuidance } from "../workflow-chat/support/prompt-dock";

// Approved native dock seam, enabling P20/P22/P25/P32/P34 only (not contract-owner cases).
// Source: ticket 12's same-Session co-loading and layered guidance requirements.
// Violation: loading one role replaces the other's tools/history, or both prompts describe
// every Run as the same scope. Real loaders, adapters and HTTP remain in the exercised path;
// the scripted provider/HTTP peer cannot establish backend authorization or model obedience.
for (const host of ["omp", "pi"] as const) {
	test(`${host} same native Session co-loads both roles with separate once-only layered guidance`, async () => {
		const dock = await dualRoleDock(host);
		try {
			expect((await dock.call("run", { action: "status" })).isError).toBe(false);
			expect((await dock.call("collect", {})).isError).toBe(false);
			const progress = { saved: true, report: { id: "parent-progress", canComplete: false, outputs: [] }, notification: { status: "failed" } };
			dock.answer(progress);
			expect(await dock.call("report", { body: "Still checking totals", can_complete: false })).toMatchObject({ isError: false, body: { ...progress, guidance: "报告已保存；通知结果见 notification。" } });
			const file = join(dock.root.workDir, "approved-summary.txt");
			writeFileSync(file, "Q3 net total: 42\n");
			const appendix = join(dock.root.workDir, "calculation-appendix.txt");
			writeFileSync(appendix, "Q3 adjustments: 8\n");
			const mapOutput = { files: [{ id: "summary", path: file }, { id: "appendix", path: appendix }] };
			dock.answer({ snapshot: { status: "completed", mapOutput } });
			expect(await dock.call("run", { action: "finish", map_output: mapOutput })).toMatchObject({ isError: false, body: { snapshot: { status: "completed", mapOutput } } });
			// The peer supplies independent responses. The tools must not infer any
			// automatic action, call approve in report, or synthesize an output request.
			dock.answer({ code: "map-report-outputs-not-allowed", message: "Use the public child Run result" }, 409);
			expect(await dock.call("report", { body: "Do not replace the file", can_complete: true, outputs: [{ id: "summary", path: "E:/other.txt" }] })).toMatchObject({ isError: true, body: { code: "map-report-outputs-not-allowed" } });
			const handoff = { saved: true, report: { id: "parent-handoff", canComplete: true, outputs: [{ id: "summary", path: file }] }, notification: { status: "submitted" } };
			dock.answer(handoff);
			expect(await dock.call("report", { body: "Totals ready", can_complete: true })).toMatchObject({ isError: false, body: handoff });
			expect(readFileSync(file, "utf8")).toBe("Q3 net total: 42\n");
			expect(readFileSync(appendix, "utf8")).toBe("Q3 adjustments: 8\n");
			const state = await dock.session.request({ type: "get_state" });
			const data = state.data as { sessionId: string };
			expect(typeof data.sessionId).toBe("string");
			expect(dock.calls).toEqual([
				{ path: "/api/workflow/manager/status", body: { sessionId: data.sessionId } },
				{ path: "/api/workflow/manager/collect", body: { sessionId: data.sessionId } },
				{ path: "/api/workflow/node/report", body: { sessionId: data.sessionId, body: "Still checking totals", canComplete: false } },
				{ path: "/api/workflow/manager/finish", body: { sessionId: data.sessionId, mapOutput: { files: [{ id: "summary", path: file }, { id: "appendix", path: appendix }] } } },
				{ path: "/api/workflow/node/report", body: { sessionId: data.sessionId, body: "Do not replace the file", canComplete: true, outputs: [{ id: "summary", path: "E:/other.txt" }] } },
				{ path: "/api/workflow/node/report", body: { sessionId: data.sessionId, body: "Totals ready", canComplete: true } },
			]);
			const first = dock.capture.requests()[0]!;
			const request = first.json;
			if (!request || typeof request !== "object" || !("tools" in request) || !Array.isArray(request.tools)) throw new Error("Missing native tools");
			const tools = request.tools.map(tool => {
				if (!tool || typeof tool !== "object" || !tool.function || typeof tool.function.name !== "string") throw new Error("Invalid native tool");
				return tool.function.name;
			});
			for (const tool of ["run", "collect", "report", "approve"]) expect(tools.filter(name => name === tool)).toHaveLength(1);
			const schema = (name: string) => JSON.stringify((request.tools as { function: { name: string } }[])
				.find(tool => tool.function.name === name)?.function);
			expect(schema("run")).toContain("查询或显式推进当前管理的 Run；实际动作资格以返回结果为准。");
			expect(schema("run")).toContain("整批替换 Run 文件绑定，不是追加；遗漏旧 ID 会删除其绑定，空数组清空。");
			expect(schema("run")).toContain("结束 Run 时提交的公开文件成果。");
			expect(schema("collect")).toContain("等待或取得运行现场与待处理报告标识；不返回报告正文。");
			expect(schema("report")).toContain("如实声明本次执行是否可交接，不直接完成节点。");
			expect(schema("approve")).toContain("按本次成果批准模式取得批准；不发送报告或推进流程。");
			const manager = roleGuidance(first, "manager");
			const node = roleGuidance(first, "node");
			expect(manager).not.toBe(node);
			// S3: omitting either guide or copying backend role facts into it defeats the
			// approved split even if the native tools remain callable.
			expect(manager).toContain("使用 run 查询当前现场");
			expect(manager).toContain("按 Map 声明提交公开文件绑定");
			expect(manager).toContain("兼任父节点执行者时使用节点报告工具指引");
			expect(manager).toContain("当本次工作由 chief 实际委派时");
			expect(manager).toContain("chief_resend_report");
			expect(manager).not.toContain("你是 Run 管理者");
			expect(node).toContain("调用 approve 按本次模式取得批准，再调用 report 交接");
			expect(node).toContain("中途情况使用 false，可不附文件");
			expect(node).toContain("子 Map 的正式文件由系统从已完成子 Run 的公开成果取得");
			expect(node).not.toContain("你是节点执行者");
			const last = dock.capture.requests()[dock.capture.requests().length - 1]!;
			for (const guide of [manager, node]) expect(providerMessages(last).filter(message => message.content === guide)).toHaveLength(1);
			const history = (await dock.history()).split("\n").filter(Boolean).map(line => JSON.parse(line));
			for (const identity of ["manager-chat:tools", "node-chat:tools"]) {
				expect(history.filter(entry => (entry.type === "custom_message" && entry.customType === identity)
					|| (entry.type === "message" && entry.message?.role === "custom" && entry.message.customType === identity))).toHaveLength(1);
			}
		} finally { await dock.close(); }
	}, 180_000);

	// Ticket 12's strict boundary/lifecycle criterion: a plausible violation is one role
	// disposing the other's transport on finish, abort, or process recovery. Observe the
	// peer's unfinished body socket, then reuse both normal entries with the SAME saved
	// native Session. Controlled replies do not prove server-side parent/child resolution.
	test(`${host} dual roles preserve strict identity, finish, cancellation and native process recovery`, async () => {
		const dock = await dualRoleDock(host);
		try {
			for (const [name, valid] of [["run", { action: "status" }], ["collect", {}], ["report", { body: "handoff", can_complete: false }]] as const) {
				for (const field of ["sessionId", "runId", "executionId", "recipient", "from", "to"]) {
					expect((await dock.call(name, { ...valid, [field]: "forged" })).isError).toBe(true);
				}
			}
			expect(dock.calls).toHaveLength(0);
			const failure = { results: [{ nodeId: "child", status: "failed",
				failure: { stage: "submit", message: "input refused" }, effects: { agentStarted: true, inputSubmitted: false } }] };
			dock.answer(failure, 409);
			const rejected = await dock.call("run", { action: "dispatch", nodes: ["child"] });
			expect(rejected.isError).toBe(true);
			expect(rejected.details).toEqual({ httpStatus: 409, body: failure });
			const savedFile = await dock.sessionFile();
			const id = dock.calls[0]!.body.sessionId;
			dock.answer({ snapshot: { status: "completed" } });
			expect((await dock.call("run", { action: "finish" })).isError).toBe(false);
			dock.answer({ saved: true, report: { id: "after-inner-finish" }, notification: { ok: true } });
			expect((await dock.call("report", { body: "After inner finish", can_complete: true })).isError).toBe(false);
			expect(dock.calls[dock.calls.length - 1]!.body.sessionId).toBe(id);
			const aborted = dock.hold();
			const waiting = dock.call("collect", {});
			await aborted.started.promise;
			expect((await dock.session.request({ type: "abort" })).success).toBe(true);
			expect(await waiting).toMatchObject({ isError: true, body: { error: { kind: "cancelled" } } });
			await aborted.closed.promise;
			expect((await dock.call("report", { body: "After cancellation", can_complete: false })).isError).toBe(false);
			const shutdown = dock.hold();
			// Own the pending prompt outcome before shutting down; no unhandled waiter.
			const pending = await dock.beginShutdownCollect();
			await shutdown.started.promise;
			const stopped = await dock.session.stop();
			expect(stopped.timedOut).toBe(false);
			expect(stopped.exitCode).toBe(0);
			await pending.outcome;
			await shutdown.closed.promise;
			await dock.reopen(savedFile);
			dock.answer({ ok: true });
			expect((await dock.call("run", { action: "status" })).isError).toBe(false);
			expect((await dock.call("collect", {})).isError).toBe(false);
			dock.answer({ saved: true, notification: { ok: true } });
			expect((await dock.call("report", { body: "After native recovery", can_complete: false })).isError).toBe(false);
			for (const call of dock.calls) expect(call.body.sessionId).toBe(id);
			const messages = providerMessages(dock.capture.requests()[dock.capture.requests().length - 1]!);
			for (const role of ["manager", "node"] as const) {
				const guide = roleGuidance(dock.capture.requests()[0]!, role);
				expect(messages.filter(message => message.content === guide)).toHaveLength(1);
			}
		} finally { await dock.close(); }
	}, 180_000);
}
