import { expect, test } from "bun:test";
import { roleContractDock, type RoleContractDock } from "../workflow-chat/support/role-contract-dock";
import { headlessTool } from "../workflow-chat/support/headless-tool";

const report = { id: "immutable/resend-18", from: "persisted-sender-18", delegationId: "actual-delegation-18", at: 1700000000000,
	body: { background: "Create reusable invoice capability", execution: "Create Task Bot", result: "blocked", summary: "Template saved; publication denied", deliverables: ["template.md"], pendingDecisions: ["Approve publication access?"] } };
// Approved S3 native tool/confirmation seam. Oracle: original saved content and
// ID are previewed, but only a fresh native decision can resend. A controlled
// backend proves protocol, not persisted provenance or real-model responsibility.
for (const host of ["omp", "pi"] as const) {
	test(`${host} original resend refuses denial dismissal cancellation timeout unavailable and ended session`, async () => {
		const calls: { method: string; path: string; body?: unknown }[] = [];
		const peer = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
			calls.push({ method: request.method, path: new URL(request.url).pathname, ...(request.method === "POST" ? { body: await request.json() } : {}) });
			return Response.json(request.method === "GET" ? report : { saved: true, report, received: false, notification: { status: "submitted" } });
		} });
		let dock: RoleContractDock | undefined;
		let pending: Promise<void> | undefined;
		try {
			expect(await headlessTool(host, peer.url.origin, "chief-report", { id: report.id }, { toolName: "chief_resend_report" })).toMatchObject({ details: { body: { sent: false, saved: true, report } } });
			dock = await roleContractDock(host, peer.url.origin, 500, "chief-report", 500, "chief_resend_report");
			for (const decision of ["denied", "dismissed", "cancelled", "timeout", "session-end"] as const) {
				pending = dock.call({ id: report.id });
				const dialog = await dock.confirmation();
				expect(String(dialog.message)).toContain(JSON.stringify(report, null, 2));
				if (decision === "denied") dock.answerConfirmation(String(dialog.id), false);
				else if (decision === "dismissed") dock.answerConfirmation(String(dialog.id));
				else if (decision === "cancelled") await dock.cancel();
				else if (decision === "session-end") await dock.endSession();
				await pending; pending = undefined;
				if (decision !== "cancelled" && decision !== "session-end") expect(dock.lastResult()).toMatchObject({ details: { body: { saved: true, report, sent: false } } });
				dock.answerConfirmation(String(dialog.id), true);
				// Real child clocks cannot use Bun fake timers: one complete configured
				// 500ms HTTP/approval budget +100ms; chief-report has no maintenance loop.
				await Bun.sleep(600);
				expect(calls.filter(call => call.method === "POST")).toEqual([]);
			}
		} catch (error) { console.error(`${host} native resend failure before cleanup`, error); throw error; }
		finally { try { if (pending) { await dock?.cancel(); await pending; } } finally { try { await dock?.close(); } finally { peer.stop(true); } } }
	}, 300_000);

	for (const role of ["chief-report", "manager"] as const) test(`${host} ${role} resend preserves original ID and reports already received without claiming presentation`, async () => {
		const calls: { method: string; path: string; body?: unknown }[] = [];
		const peer = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
			calls.push({ method: request.method, path: new URL(request.url).pathname, ...(request.method === "POST" ? { body: await request.json() } : {}) });
			return Response.json(request.method === "GET" ? report : { saved: true, report, received: true, receipt: { reportId: report.id }, notification: { status: "not-attempted", reason: "报告已可靠接收，不表示已呈现、已读或验收" } });
		} });
		let dock: RoleContractDock | undefined;
		let pending: Promise<void> | undefined;
		try {
			dock = await roleContractDock(host, peer.url.origin, 2000, role, 2000, "chief_resend_report");
			const state = await dock.state();
			const data = state.data;
			if (!data || typeof data !== "object" || !("sessionId" in data) || typeof data.sessionId !== "string") throw new Error("Actual native sender Session unavailable");
			const sessionId = data.sessionId;
			for (let attempt = 0; attempt < 2; attempt++) {
				pending = dock.call({ id: report.id });
				const dialog = await dock.confirmation();
				expect(String(dialog.message)).toContain(JSON.stringify(report, null, 2));
				expect(calls.filter(call => call.method === "POST")).toHaveLength(attempt);
				dock.answerConfirmation(String(dialog.id), true); await pending; pending = undefined;
				expect(dock.lastResult()).toMatchObject({ details: { body: { saved: true, report, received: true, notification: { status: "not-attempted" } } } });
			}
			expect(calls).toEqual(Array.from({ length: 2 }, () => [
				{ method: "GET", path: "/api/chief/reports/immutable%2Fresend-18" },
				{ method: "POST", path: "/api/chief/reports/immutable%2Fresend-18/resend", body: { sessionId } },
			]).flat());
		} catch (error) { console.error(`${host} native resend failure before cleanup`, error); throw error; }
		finally { try { if (pending) { await dock?.cancel(); await pending; } } finally { try { await dock?.close(); } finally { peer.stop(true); } } }
	}, 300_000);
}
