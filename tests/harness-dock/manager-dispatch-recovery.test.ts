import { expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { managerScenario } from "../workflow-chat/support/manager-scenario";

// S1/P10/P12: actual loaded manager + backend. The controlled external CLI returns
// one native identity: A succeeds, C is dependency-rejected, B starts but identity
// collides with A. A wrapper flattening the batch or discarding effects fails here.
test("P12 dispatch preserves success rejection and started-but-failed target in one batch", async () => {
	const scene = await managerScenario();
	try {
		scene.backend.behavior("batch-native-A", scene.backend.root.path);
		const batch = await scene.dock.call({ action: "dispatch", nodes: ["A", "C", "B"] });
		expect(batch.results.map((item: { status: string }) => item.status)).toEqual(["running", "rejected", "failed"]);
		expect(batch.results[0].nodeId).toBe("A");
		expect(batch.snapshot.nodes.A.execution.chat.sessionId).toBe("batch-native-A");
		expect(batch.results[0].effects).toMatchObject({ agentStarted: true, inputSubmitted: true, associationSaved: true });
		expect(batch.results[1].reasons.join(" ")).toContain("A");
		expect(batch.results[1].reasons.join(" ")).toContain("B");
		expect(batch.results[2]).toMatchObject({ nodeId: "B", failure: { stage: "identity" }, effects: { agentStarted: true, inputSubmitted: false, associationSaved: false, sessionId: "batch-native-A" } });
		expect(batch.snapshot.nodes.B.failure).toEqual(batch.results[2].failure);
		expect(batch.snapshot.nodes.B.execution.chat).toBeNull();
		expect((await scene.detail()).run).toEqual(batch.snapshot);
		const before = readFileSync(join(scene.backend.root.path, "calls.jsonl"), "utf8");
		// Independent OMP/backend processes use real clocks; fake timers cannot expose hidden requests.
		await Bun.sleep(150);
		expect(readFileSync(join(scene.backend.root.path, "calls.jsonl"), "utf8")).toBe(before);
		expect(scene.calls).toEqual([{ path: "/api/workflow/manager/dispatch", body: { sessionId: scene.managerId, nodes: ["A", "C", "B"] } }]);
	} finally { await scene.close(); }
}, 300_000);

// S1/P10/P14: confirmed=false must not be promoted; a valid recovery keeps the
// exact original execution and partial artifact, even paused, and launches nothing.
test("P14 recover requires human confirmation and resumes original execution while paused", async () => {
	const scene = await managerScenario();
	try {
		const running = await scene.dispatch("A");
		const original = running.snapshot.nodes.A.execution;
		const artifact = join(scene.backend.root.path, "original-partial.txt");
		writeFileSync(artifact, "original effects stay");
		await scene.dock.call({ action: "fail", nodeId: "A", reason: "原 Chat 缺少输入，已留下部分产物" });
		await scene.dock.call({ action: "pause" });
		const failed = (await scene.detail()).run;
		const before = readFileSync(join(scene.backend.root.path, "calls.jsonl"), "utf8");
		const input = { action: "recover", nodeId: "A", confirmed: false, reason: "尚未人工核实修复" };
		expect(await scene.dock.call(input)).toMatchObject({ code: "recovery-confirmation-required", changed: false });
		expect(scene.calls[scene.calls.length - 1]).toEqual({ path: "/api/workflow/manager/recover", body: { sessionId: scene.managerId, nodeId: "A", confirmed: false, reason: input.reason } });
		expect((await scene.detail()).run).toEqual(failed);
		expect(await scene.dock.call({ ...input, confirmed: true, reason: "  " })).toMatchObject({ code: "recovery-confirmation-required" });
		const count = scene.calls.length;
		for (const extra of [{ sessionId: "forged" }, { runId: "forged" }, { executionId: "forged" }, { chat: { sessionId: "forged" } }, { finding: "created" }, { nodes: ["B"] }]) {
			expect(await scene.dock.call({ ...input, confirmed: true, ...extra }, true)).toMatch(/Validation failed|parameters|不接受/);
		}
		expect(scene.calls).toHaveLength(count);
		const reason = "人工补齐输入并检查原 Chat；确认原执行可继续，不启动新 Chat";
		const recovered = await scene.dock.call({ action: "recover", nodeId: "A", confirmed: true, reason });
		expect(recovered).toMatchObject({ changed: true, snapshot: { status: "paused", nodes: { A: { status: "running", failure: null, execution: original } } } });
		expect((await scene.detail()).run).toEqual(recovered.snapshot);
		expect(readFileSync(artifact, "utf8")).toBe("original effects stay");
		expect(readFileSync(join(scene.backend.root.path, "calls.jsonl"), "utf8")).toBe(before);
		expect(scene.calls[scene.calls.length - 1].body).toEqual({ sessionId: scene.managerId, nodeId: "A", confirmed: true, reason });
	} finally { await scene.close(); }
}, 300_000);

// S1/P10/P12/P14: real execution fails, rejects unconfirmed/paused retry, then
// creates a distinct Chat. A further submit failure must keep that new effect and
// both previous executions; neither successful nor failed retry deletes old output.
test("P12 P14 retry requires confirmation and running Run and retains new and old execution effects", async () => {
	const scene = await managerScenario();
	try {
		const started = await scene.dispatch("A");
		const original = started.snapshot.nodes.A.execution;
		const artifact = join(scene.backend.root.path, "old-retry-output.txt");
		writeFileSync(artifact, "never rolled back");
		await scene.dock.call({ action: "fail", nodeId: "A", reason: "原执行部分输出不可用，需要人工决定" });
		const failed = (await scene.detail()).run;
		const before = readFileSync(join(scene.backend.root.path, "calls.jsonl"), "utf8");
		const input = { action: "retry", nodeId: "A", confirmed: false, reason: "尚未核实原 Chat 和部分输出" };
		expect(await scene.dock.call(input)).toMatchObject({ code: "retry-confirmation-required", changed: false });
		expect(scene.calls[scene.calls.length - 1].body).toEqual({ sessionId: scene.managerId, nodeId: "A", confirmed: false, reason: input.reason });
		expect((await scene.detail()).run).toEqual(failed);
		expect(await scene.dock.call({ ...input, confirmed: true, reason: "  " })).toMatchObject({ code: "retry-confirmation-required" });
		const count = scene.calls.length;
		for (const extra of [{ sessionId: "forged" }, { runId: "forged" }, { executionId: "forged" }, { chat: { sessionId: "forged" } }, { finding: "created" }, { nodes: ["B"] }]) {
			expect(await scene.dock.call({ ...input, confirmed: true, ...extra }, true)).toMatch(/Validation failed|parameters|不接受/);
		}
		expect(scene.calls).toHaveLength(count);
		await scene.dock.call({ action: "pause" });
		expect(await scene.dock.call({ ...input, confirmed: true, reason: "已核实，但 Run 已暂停" })).toMatchObject({ code: "run-paused", changed: false });
		expect(readFileSync(join(scene.backend.root.path, "calls.jsonl"), "utf8")).toBe(before);
		await scene.dock.call({ action: "resume" });
		scene.backend.behavior("retry-independent-A", scene.backend.root.path);
		const reason = "人工已检查原 Chat 与部分产物；同意另起独立执行，旧副作用保留";
		const retried = await scene.dock.call({ action: "retry", nodeId: "A", confirmed: true, reason });
		expect(retried.result).toMatchObject({ nodeId: "A", status: "running", effects: { agentStarted: true, inputSubmitted: true, associationSaved: true } });
		const next = retried.snapshot.nodes.A.execution;
		expect(next.id).not.toBe(original.id);
		expect(next.chat.sessionId).toBe("retry-independent-A");
		expect(retried.snapshot.nodes.A.previousExecutions[0].execution).toEqual(original);
		expect(scene.calls[scene.calls.length - 1].body).toEqual({ sessionId: scene.managerId, nodeId: "A", confirmed: true, reason });
		expect(readFileSync(artifact, "utf8")).toBe("never rolled back");
		await scene.dock.call({ action: "fail", nodeId: "A", reason: "新执行也失败，保留现场" });
		scene.backend.behavior("retry-started-submit-failed", scene.backend.root.path, true);
		const rejected = await scene.dock.call({ action: "retry", nodeId: "A", confirmed: true, reason: "人工核实两个旧执行；同意第三次独立执行" });
		expect(rejected.result).toMatchObject({ nodeId: "A", status: "failed", failure: { stage: "submit" }, effects: { agentStarted: true, associationSaved: true, inputAttempted: true, inputSubmitted: false, sessionId: "retry-started-submit-failed" } });
		expect(rejected.snapshot.nodes.A.execution.chat.sessionId).toBe("retry-started-submit-failed");
		expect(rejected.snapshot.nodes.A.execution.id).not.toBe(next.id);
		expect(rejected.snapshot.nodes.A.previousExecutions.map((entry: { execution: unknown }) => entry.execution)).toEqual([original, next]);
		expect(rejected.snapshot.nodes.A.failure).toEqual(rejected.result.failure);
		expect((await scene.detail()).run).toEqual(rejected.snapshot);
		expect(readFileSync(artifact, "utf8")).toBe("never rolled back");
	} finally { await scene.close(); }
}, 300_000);

// S1/P14: failed real launches, then human findings, not prebuilt snapshots.
// Wrong behavior would invent a Chat or new execution instead of observing the old target.
test("P14 reconciliation preserves uncertain then absence and verifies created original Chat", async () => {
	const scene = await managerScenario();
	try {
		writeFileSync(join(scene.backend.root.path, "behavior.json"), JSON.stringify({ fail_agent_start: true }));
		const failed = await scene.dock.call({ action: "dispatch", nodes: ["A"] });
		expect(failed.results[0]).toMatchObject({ status: "failed", failure: { stage: "start" } });
		const uncertain = await scene.dock.call({ action: "reconcile_dispatch", nodeId: "A", finding: "uncertain", reason: "人工尚不能确认 Chat 是否创建" });
		expect(uncertain).toMatchObject({ changed: false, snapshot: failed.snapshot });
		const absent = await scene.dock.call({ action: "reconcile_dispatch", nodeId: "A", finding: "not_created", reason: "人工查阅启动拒绝，确认没有原生 Chat" });
		expect(absent).toMatchObject({ changed: true, snapshot: { nodes: { A: { status: "pending", execution: null, failure: null } } } });
		writeFileSync(join(scene.backend.root.path, "behavior.json"), JSON.stringify({ fail_agent_get: true }));
		const unknown = await scene.dock.call({ action: "dispatch", nodes: ["B"] });
		expect(unknown.results[0]).toMatchObject({ status: "failed", failure: { stage: "identity" }, effects: { agentStarted: true } });
		const original = unknown.snapshot.nodes.B.execution;
		const unverified = await scene.dock.call({ action: "reconcile_dispatch", nodeId: "B", finding: "created", reason: "已查看原目标，身份读取仍不可用" });
		expect(unverified.code).toBe("dispatch-chat-unverified");
		expect((await scene.detail()).run).toEqual(unknown.snapshot);
		scene.backend.behavior("reconciled-original-B", scene.backend.root.path);
		const before = readFileSync(join(scene.backend.root.path, "calls.jsonl"), "utf8").trim().split("\n");
		const created = await scene.dock.call({ action: "reconcile_dispatch", nodeId: "B", finding: "created", reason: "人工已定位原 agent，确认原 Chat 可跟踪" });
		expect(created).toMatchObject({ changed: true, snapshot: { nodes: { B: { status: "running", failure: null, execution: { id: original.id, taskId: original.taskId, zone: original.zone, chat: { sessionId: "reconciled-original-B", agentName: unknown.results[0].effects.agentName } } } } } });
		expect((await scene.detail()).run).toEqual(created.snapshot);
		const after = readFileSync(join(scene.backend.root.path, "calls.jsonl"), "utf8").trim().split("\n");
		expect(after.slice(0, before.length)).toEqual(before);
		expect(after.slice(before.length).map(line => JSON.parse(line).kind)).toEqual(["agent_get"]);
	} finally { await scene.close(); }
}, 300_000);
