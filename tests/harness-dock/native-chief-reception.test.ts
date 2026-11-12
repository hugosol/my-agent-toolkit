import { expect, test } from "bun:test";
import { chiefDock, type ChiefDock } from "../workflow-chat/support/chief-dock";

// Approved S3: actual native input/Session/provider path. Controlled backend only
// grants its durable receive after a hold; a model request before that violates
// ticket 18. Repeated input gets process=false and must never reach the provider.
// This proves protocol gating, not real backend persistence or model judgment.
for (const host of ["omp", "pi"] as const) test(`${host} receives before model processing and absorbs already received notifications`, async () => {
	const report = { id: "report-native-18", from: "sender-18", delegationId: "delegation-18", at: 1700000000000,
		body: { background: "Invoice capability", execution: "Create Task Bot", result: "blocked", summary: "Draft saved; publication blocked", deliverables: ["draft.md"], pendingDecisions: ["Approve publication?"] } };
	const calls: { path: string; body: unknown }[] = [];
	const arrived = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	let malformed = false;
	const peer = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
		calls.push({ path: new URL(request.url).pathname, body: await request.json() });
		arrived.resolve(); await release.promise;
		const body = calls[0]!.body;
		if (!body || typeof body !== "object" || !("sessionId" in body) || typeof body.sessionId !== "string") throw new Error("Missing real native session identity");
		return Response.json({ received: true, process: malformed || calls.length === 1,
			receipt: malformed ? { reportId: report.id } : { reportId: report.id, sessionId: body.sessionId, claimId: "claim-18", at: 1700000000010 }, report });
	} });
	let dock: ChiefDock | undefined;
	let pending: Promise<void> | undefined;
	try {
		dock = await chiefDock(host, peer.url.origin);
		pending = dock.input(`Chief report\nReport: ${report.id}\n\n${JSON.stringify(report)}`);
		// A child native process cannot share Bun fake time; this bounds an event
		// wait, not an observation sleep or a product retry policy.
		const expired = Promise.withResolvers<never>();
		const deadline = setTimeout(() => expired.reject(new Error("Native receive did not reach backend before presentation")), 4000);
		try { await Promise.race([arrived.promise, expired.promise]); }
		finally { clearTimeout(deadline); }
		expect(dock.capture.requests()).toHaveLength(0);
		expect(calls).toEqual([{ path: "/api/chief/reports/report-native-18/receive", body: { sessionId: expect.any(String) } }]);
		release.resolve(); await pending; pending = undefined;
		expect(dock.capture.requests()).toHaveLength(1);
		expect(JSON.stringify(dock.capture.requests()[0]!.json)).toContain("Draft saved; publication blocked");
		await dock.input(`Chief report\nReport: ${report.id}\n\n${JSON.stringify(report)}`);
		expect(calls).toHaveLength(2);
		expect(dock.capture.requests()).toHaveLength(1);
		malformed = true;
		await dock.input(`Chief report\nReport: ${report.id}\n\n${JSON.stringify(report)}`);
		expect(calls).toHaveLength(3);
		expect(dock.capture.requests()).toHaveLength(1);
	} catch (error) { console.error(`${host} native reception failure before cleanup`, error); throw error; }
	finally { release.resolve(); try { await pending; } finally { try { await dock?.close(); } finally { peer.stop(true); } } }
}, 180_000);
