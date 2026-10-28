import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { managerScenario } from "../workflow-chat/support/manager-scenario";

// S1/P10/P11/P13: paused -> running restores eligibility, but must not start even ready work.
// Independent graph A,B -> C; compare real role HTTP, backend snapshot and external CLI calls.
test("P10/P11/P13 resume restores eligibility without dispatch, retry or termination", async () => {
	const scene = await managerScenario();
	try {
		await scene.dock.call({ action: "pause" });
		const before = readFileSync(join(scene.backend.root.path, "calls.jsonl"), "utf8");
		const resumed = await scene.dock.call({ action: "resume" });
		expect(resumed).toMatchObject({ changed: true, snapshot: { status: "running", nodes: { A: { status: "pending" }, B: { status: "pending" }, C: { status: "pending" } } }, ready: ["A", "B"], canFinish: false });
		const duplicate = await scene.dock.call({ action: "resume" });
		expect(duplicate).toMatchObject({ changed: false, snapshot: resumed.snapshot });
		// External process timers cannot be advanced by fake timers; claim only this finite window.
		await Bun.sleep(150);
		expect(readFileSync(join(scene.backend.root.path, "calls.jsonl"), "utf8")).toBe(before);
		expect((await scene.detail()).run).toEqual(resumed.snapshot);
		expect(scene.calls.map(call => call.path)).toEqual(["pause", "resume", "resume"].map(action => `/api/workflow/manager/${action}`));
	} finally { await scene.close(); }
}, 300_000);

// P11/P13: finish requires all three handoffs; paused is allowed and active Chats are not ended.
// Violation: premature finish, overwriting first finish, or silently mutating a terminal Run.
test("P10/P11/P13 finish obeys all-node completion and retains terminal facts", async () => {
	const scene = await managerScenario();
	try {
		const denied = await scene.dock.call({ action: "finish" });
		expect(denied).toMatchObject({ code: "nodes-incomplete", changed: false, canFinish: false, snapshot: { status: "running" } });
		await scene.dispatch("A"); await scene.dispatch("B");
		await scene.dock.call({ action: "complete", nodeId: "A", reason: "alpha 已交接" });
		await scene.dock.call({ action: "complete", nodeId: "B", reason: "beta 已交接" });
		await scene.dispatch("C");
		await scene.dock.call({ action: "pause" });
		const last = await scene.dock.call({ action: "complete", nodeId: "C", reason: "C 已使用两份材料并可交接；此处只测试协议，不声称真实模型质量。" });
		expect(last.canFinish).toBe(true);
		expect(last.snapshot.status).toBe("paused");
		const before = readFileSync(join(scene.backend.root.path, "calls.jsonl"), "utf8");
		const finished = await scene.dock.call({ action: "finish" });
		expect(finished).toMatchObject({ changed: true, canFinish: false, snapshot: { status: "completed" } });
		expect(finished.snapshot.finished.id).toBeString();
		expect(finished.snapshot.finished.at).toBeNumber();
		const history = readFileSync(join(scene.backend.root.path, "runs", scene.runId, "history.jsonl"), "utf8");
		const duplicate = await scene.dock.call({ action: "finish" });
		expect(duplicate).toMatchObject({ changed: false, snapshot: finished.snapshot });
		for (const params of [{ action: "pause" }, { action: "resume" }, { action: "fail", nodeId: "A", reason: "终态不得失败" }, { action: "complete", nodeId: "A", reason: "终态不得改交接" }]) {
			expect(await scene.dock.call(params)).toMatchObject({ code: "run-terminal", changed: false, snapshot: finished.snapshot });
		}
		expect(await scene.dock.call({ action: "status" })).toMatchObject({ snapshot: finished.snapshot, ready: [], canFinish: false });
		expect(readFileSync(join(scene.backend.root.path, "runs", scene.runId, "history.jsonl"), "utf8")).toBe(history);
		// External clocks are not simulated; this is a bounded absence-of-extra-actions observation.
		await Bun.sleep(150);
		expect(readFileSync(join(scene.backend.root.path, "calls.jsonl"), "utf8")).toBe(before);
		expect((await scene.detail()).run).toEqual(finished.snapshot);
		expect(scene.calls.map(call => call.path)).toEqual(["finish", "complete", "complete", "pause", "complete", "finish", "finish", "pause", "resume", "fail", "complete", "status"].map(action => `/api/workflow/manager/${action}`));
	} finally { await scene.close(); }
}, 300_000);
