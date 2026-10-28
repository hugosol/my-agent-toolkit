import { expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { managerScenario } from "../workflow-chat/support/manager-scenario";
import { effectsTransport } from "../workflow-chat/support/effects-transport";
import { nodeDock, toolText } from "../workflow-chat/support/node-dock";

// Approved S1/P22/P24. Hold ONLY a real backend's completed response, then abort the
// actual OMP tool. Literal committed facts (paused, running Chat, saved report) must
// survive. A fabricated rollback, an automatic redo or a poisoned Session cannot pass.
// The 250ms observation window uses real time because OMP is a separate process.
test("P22 P24 accepted state and dispatch survive caller cancellation without automatic redo", async () => {
	const transport = await effectsTransport();
	const scene = await managerScenario({ requestTimeoutMs: 10_000 }, 1, endpoint => { transport.connect(endpoint); return transport.endpoint; });
	try {
		for (const action of ["pause", "dispatch"] as const) {
			if (action === "dispatch") {
				await scene.dock.call({ action: "resume" });
				scene.backend.behavior("P22-native-started-A", scene.backend.root.path);
			}
			const gate = transport.hold(`/api/workflow/manager/${action}`);
			const count = transport.calls.length;
			const pending = scene.dock.call(action === "pause" ? { action } : { action, nodes: ["A"] }).catch(error => error);
			const accepted = await gate.accepted.promise;
			expect(accepted.status).toBe(200);
			expect(accepted.body).toMatchObject(action === "pause" ? { changed: true, snapshot: { status: "paused" } } : { results: [{ status: "running", effects: { agentStarted: true, inputSubmitted: true, associationSaved: true } }] });
			const external = readFileSync(join(scene.backend.root.path, "calls.jsonl"), "utf8");
			expect((await scene.dock.session.request({ type: "abort" })).success).toBe(true);
			await pending; await gate.closed.promise;
			const cancellation = scene.dock.lastToolResult();
			const cancellationEvidence = JSON.stringify(cancellation);
			expect(cancellation).toMatchObject({ error: { kind: "cancelled" }, guidance: expect.stringContaining("不表示回滚或未生效") });
			await Bun.sleep(250);
			expect(transport.calls.slice(count).map(call => call.path)).toEqual([`/api/workflow/manager/${action}`]);
			expect(readFileSync(join(scene.backend.root.path, "calls.jsonl"), "utf8")).toBe(external);
			gate.release.resolve();
			const status = await scene.dock.call({ action: "status" });
			expect(status.snapshot).toMatchObject(action === "pause" ? { status: "paused" } : { status: "running", nodes: { A: { status: "running", execution: { chat: { sessionId: "P22-native-started-A" } } } } });
			expect(await scene.dock.nativeId()).toBe(scene.managerId);
			expect(transport.calls.slice(count).map(call => call.path)).toEqual([`/api/workflow/manager/${action}`, "/api/workflow/manager/status"]);
			console.log(JSON.stringify({ promise: "P22/P24", action, nativeId: scene.managerId, accepted, cancellation: cancellationEvidence, observationMs: 250 }));
		}
	} finally { await scene.close(); await transport.close(); }
}, 300_000);

// P22/P23/P24: real report persistence and real auxiliary refusal, not a handcrafted
// saved=true fixture. After cancellation query public Run detail; later explicit report
// uses the SAME live Session and creates exactly one additional report, not a retry.
test("P22 P23 P24 saved report remains queryable after disconnect and explicit new report remains usable", async () => {
	const transport = await effectsTransport();
	const scene = await managerScenario(); transport.connect(scene.backend.endpoint);
	const body = "P22 first material: E:/evidence/accepted.txt; read-only, not production";
	const node = await nodeDock(transport.endpoint, body);
	try {
		const state = await node.session.request({ type: "get_state" });
		if (!state.data || typeof state.data !== "object" || !("sessionId" in state.data) || typeof state.data.sessionId !== "string") throw new Error("No native node identity");
		const nativeId = state.data.sessionId;
		scene.backend.behavior(nativeId, scene.backend.root.path);
		expect((await scene.backend.post("/api/workflow/manager/dispatch", { sessionId: scene.managerId, nodes: ["A"] })).results[0].status).toBe("running");
		scene.backend.behavior(nativeId, scene.backend.root.path, true);
		const gate = transport.hold("/api/workflow/node/report");
		const pending = node.session.prompt("提交一次本次报告，等待工具完成，不自主重报。");
		const accepted = await gate.accepted.promise;
		expect(accepted.status).toBe(200);
		expect(accepted.body).toMatchObject({ saved: true, report: { body, source: { sessionId: nativeId } }, notification: { status: "failed" }, diagnostic: { status: "written" } });
		const external = readFileSync(join(scene.backend.root.path, "calls.jsonl"), "utf8");
		expect((await node.session.request({ type: "abort" })).success).toBe(true);
		await pending; await gate.closed.promise;
		const frames = node.session.frames().filter(frame => frame.type === "tool_execution_end");
		const end = frames[frames.length - 1];
		expect(end?.result).toMatchObject({ details: { body: { error: { kind: "cancelled" }, guidance: expect.stringContaining("不表示回滚或未生效") } } });
		await Bun.sleep(250);
		expect(transport.calls).toHaveLength(1);
		expect(readFileSync(join(scene.backend.root.path, "calls.jsonl"), "utf8")).toBe(external);
		gate.release.resolve();
		const detail = await scene.detail();
		expect(detail.reports).toHaveLength(1);
		expect(detail.reports[0]).toMatchObject({ body, source: { sessionId: nativeId } });
		expect(detail.run.nodes.A.status).toBe("running");
		const secondBody = "P24 distinct explicit follow-up material, not an automatic retry";
		expect((await node.beginReport(secondBody)).status).toBe("completed");
		const second = JSON.parse(toolText(node));
		expect(second).toMatchObject({ saved: true, report: { body: secondBody, source: { sessionId: nativeId } }, notification: { status: "failed" }, diagnostic: { status: "written" } });
		const afterExplicit = readFileSync(join(scene.backend.root.path, "calls.jsonl"), "utf8");
		await Bun.sleep(250);
		expect(transport.calls).toHaveLength(2);
		expect(readFileSync(join(scene.backend.root.path, "calls.jsonl"), "utf8")).toBe(afterExplicit);
		expect((await scene.detail()).reports).toHaveLength(2);
		console.log(JSON.stringify({ promise: "P22/P23/P24", nativeId, accepted, explicitReport: second, observationMs: 250, requestCount: transport.calls.length }));
	} finally { await node.close(); await scene.close(); await transport.close(); }
}, 300_000);

// P23: independently damage the real backend history append target, without replacing
// its state machine. Public status must confirm the commit; HTTP-200 alone cannot hide
// historyError/stateCommitted. This is not the P12 batch business-structure test.
test("P23 real history failure preserves committed state and target-level external effects", async () => {
	const scene = await managerScenario();
	try {
		writeFileSync(join(scene.backend.root.path, "runs", scene.runId, "history.jsonl"), '{"action":"unfinished"}');
		const paused = await scene.dock.call({ action: "pause" });
		expect(paused).toMatchObject({ code: "history-append-failed", stateCommitted: true, snapshot: { status: "paused" } });
		expect(paused.historyError).toContain("history.jsonl");
		expect((await scene.dock.call({ action: "status" })).snapshot.status).toBe("paused");
		await scene.dock.call({ action: "resume" });
		scene.backend.behavior("P23-colliding-native", scene.backend.root.path);
		const batch = await scene.dock.call({ action: "dispatch", nodes: ["A", "B"] });
		expect(batch.results[0]).toMatchObject({ stateCommitted: true, effects: { agentStarted: true, inputSubmitted: true, associationSaved: true } });
		expect(batch.results[1]).toMatchObject({ status: "failed", stateCommitted: true, effects: { agentStarted: true, inputSubmitted: false, associationSaved: false } });
		for (const target of batch.results) expect(target.historyError).toContain("history.jsonl");
		expect((await scene.dock.call({ action: "status" })).snapshot.nodes).toMatchObject({ A: { status: "running" }, B: { status: "failed" } });
		console.log(JSON.stringify({ promise: "P23", paused, batch }));
	} finally { await scene.close(); }
}, 300_000);

// P23: corrupt only a real backend fixture's current record. A status-only exception
// loses its path-bearing JSON diagnostic; fabricating an empty snapshot also fails.
test("P23 real non-success body remains visible and a repaired backend accepts explicit new calls", async () => {
	const scene = await managerScenario();
	try {
		const current = join(scene.backend.root.path, "runs", scene.runId, "run.json");
		const original = readFileSync(current);
		writeFileSync(current, "{broken-current");
		const result = await scene.dock.call({ action: "status" });
		expect(result.code).toBe("run-read-failed");
		expect(result.message).toContain("run.json");
		expect(result).not.toHaveProperty("snapshot");
		const frames = scene.dock.session.frames().filter(frame => frame.type === "tool_execution_end");
		expect(frames[frames.length - 1]?.result).toMatchObject({ isError: true, details: { httpStatus: 500, body: result } });
		writeFileSync(current, original);
		expect((await scene.dock.call({ action: "status" })).snapshot.status).toBe("running");
		expect(await scene.dock.nativeId()).toBe(scene.managerId);
		console.log(JSON.stringify({ promise: "P23", httpStatus: 500, result }));
	} finally { await scene.close(); }
}, 300_000);
