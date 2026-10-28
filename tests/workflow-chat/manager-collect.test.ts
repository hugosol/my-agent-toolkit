import { expect, test } from "bun:test";
import { managerDock } from "./support/manager-dock";

// Approved seam S1/P17: real automatic entry, native Session and HTTP. Independent literal
// backend reply. Violation: missing collect, rewritten reason/snapshot, or manufactured bodies.
test("P17 collect preserves five literal reasons, snapshots and body-free pending summaries", async () => {
	const calls: { path: string; body: unknown }[] = [];
	const replies = [
		{ reason: "paused", snapshot: { id: "run-paused", status: "paused", nodes: { A: { status: "running" } } }, ready: [], blocked: {}, canFinish: false, pendingReports: { A: "report-paused-83" } },
		{ reason: "completed", snapshot: { id: "run-ended", status: "completed", nodes: { A: { status: "completed" } } }, ready: [], blocked: {}, canFinish: false, pendingReports: {} },
		{ reason: "notification", snapshot: { id: "run-notice", status: "running", nodes: { A: { status: "running" } } }, ready: [], blocked: {}, canFinish: false, pendingReports: { A: "report-notice-29" } },
		{ reason: "no-running", snapshot: { id: "run-idle", status: "running", nodes: { A: { status: "pending" } } }, ready: ["A"], blocked: {}, canFinish: false, pendingReports: {} },
		{ reason: "timeout", snapshot: { id: "run-wait", status: "running", nodes: { A: { status: "running" }, B: { status: "pending" } } }, ready: ["B"], blocked: {}, canFinish: false, pendingReports: { A: "report-still-pending" } },
	];
	const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
		calls.push({ path: new URL(request.url).pathname, body: await request.json() });
		return Response.json(replies[calls.length - 1]);
	} });
	const dock = await managerDock(`http://127.0.0.1:${server.port}`);
	try {
		for (const facts of replies) expect(await dock.collect()).toEqual(facts);
		const nativeId = await dock.nativeId();
		expect(calls).toEqual(replies.map(() => ({ path: "/api/workflow/manager/collect", body: { sessionId: nativeId } })));
	} finally { await dock.close(); server.stop(true); }
}, 300_000);
