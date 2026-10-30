import { expect, test } from "bun:test";
import { managerScenario } from "../workflow-chat/support/manager-scenario";

// Approved S1/S2, P19: real OMP automatic manager entry + real backend. The transparent
// TCP observer never invents HTTP replies or disconnects by itself. Wait for the backend's
// actual 200 head (no body), then interrupt through OMP. A locally returned cancellation
// with a live socket cannot pass; nor can an abandoned backend wait consuming the next report.
for (const termination of ["abort", "new_session", "shutdown"] as const) {
	test(`P19 real OMP ${termination} releases collect after the real backend response head`, async () => {
		const scene = await managerScenario({ collectTimeoutMs: 30_000 }, 30);
		try {
			expect((await scene.dispatch("A")).results[0].status).toBe("running");
			const received = scene.transport.nextCollect();
			const pending = scene.dock.beginCollect();
			const connection = await received;
			expect(connection.head).toContain("200 OK");
			expect(connection.bodyBytes).toBe(0);
			const originalSessionFile = scene.dock.session.sessionFiles()[0]!;
			const interruptedAt = performance.now();
			if (termination === "shutdown") {
				const exited = await scene.dock.session.stop();
				expect(exited.timedOut).toBe(false);
				expect(exited.exitCode).toBe(0);
			} else {
				expect((await scene.dock.session.request({ type: termination })).success).toBe(true);
				await pending;
			}
			await connection.clientClosed;
			// Half-close is forwarded, not a fabricated backend answer. Observe the backend's
			// own EOF before its 30s deadline, proving the waiting response was released.
			await connection.backendEnded;
			expect(performance.now() - interruptedAt).toBeLessThan(5000);
			expect(connection.bodyBytes).toBe(0);
			// OMP discards the old tool delivery on transfer; do not fabricate its result.
			const terminationResult = termination === "new_session" ? { host: "transferred; no old tool result" } : scene.dock.lastToolResult();
			if (termination !== "new_session") expect(terminationResult).toMatchObject({ error: { kind: "cancelled" } });
			if (termination !== "abort") {
				// Re-open the SAME native Session through the real host, not a fabricated ID.
				await scene.dock.reopen(originalSessionFile);
				expect(await scene.dock.nativeId()).toBe(scene.managerId);
			}
			scene.backend.behavior("node-native-A", scene.backend.root.path, true);
			const report = await scene.backend.post("/api/workflow/node/report", { sessionId: "node-native-A", body: "P19 material remains available after lifecycle cancellation" });
			expect(report.saved).toBe(true);
			const next = await scene.dock.collect();
			expect(next.reason).toBe("notification");
			expect(next.pendingReports).toEqual({ A: report.report.id });
			expect(next.snapshot.nodes.A.status).toBe("running");
			console.log(JSON.stringify({ promise: "P19", termination, nativeSessionId: scene.managerId, backend: scene.backend.endpoint,
				head: connection.head, bodyBytes: connection.bodyBytes, events: connection.events, terminationResult, reportId: report.report.id, nextReason: next.reason }));
		} finally { await scene.close(); }
	}, 300_000);
}
