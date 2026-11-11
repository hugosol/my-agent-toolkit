import { expect, test } from "bun:test";
import { createServer } from "node:http";
import type { Socket } from "node:net";
import { roleContractDock, type RoleContractDock } from "../workflow-chat/support/role-contract-dock";
import { headlessReport } from "../workflow-chat/support/headless-report";

// Approved S3: real installed hosts, role entries, Session, confirmation and HTTP.
// Controlled provider/HTTP peer prove protocol only, not GPT-6-luna role behavior.
// Independent ticket 15/14 contract: only the complete approved body with actual
// Session reaches /api/chief/reports; a node-policy lookup or truncated body violates it.
const body = {
	background: "Create a reusable invoice capability; do not execute invoices.",
	execution: "Capability creation Bot / independent Task",
	result: "blocked", summary: "Template saved; publication permission is missing.",
	deliverables: ["E:/owned/template.md"], pendingDecisions: ["Approve publication access?"],
};
for (const host of ["omp", "pi"] as const) {
	// Plausible violation: chat/finished business grants approval, or loading tools
	// fabricates sender eligibility. Only native decisions and the external peer vary.
	test(`${host} chief report refuses denial dismissal cancellation timeout and headless approval`, async () => {
		const sent: unknown[] = [];
		const peer = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) { sent.push(await request.json()); return Response.json({ saved: true }); } });
		let dock: RoleContractDock | undefined;
		let pending: Promise<void> | undefined;
		try {
			expect(await headlessReport(host, peer.url.origin, "chief_report", { body }, "chief-report")).toMatchObject({ details: { body: { sent: false, saved: false } } });
			dock = await roleContractDock(host, peer.url.origin, 500, "chief-report", "chief_report");
			for (const decision of ["denied", "dismissed", "cancelled", "timeout", "session-end"] as const) {
				pending = dock.report({ body });
				const dialog = await dock.confirmation();
				if (decision === "denied") dock.answerConfirmation(String(dialog.id), false);
				else if (decision === "dismissed") dock.answerConfirmation(String(dialog.id));
				else if (decision === "cancelled") await dock.cancel();
				else if (decision === "session-end") await dock.endSession();
				await pending; pending = undefined;
				if (decision !== "cancelled" && decision !== "session-end") expect(dock.lastResult()).toMatchObject({ details: { body: { sent: false, saved: false } } });
				dock.answerConfirmation(String(dialog.id), true);
				// Real native clocks: a full configured 500ms approval budget +100ms.
				await Bun.sleep(600);
				expect({ decision, sent }).toEqual({ decision, sent: [] });
			}
		} finally {
			try { if (pending) { await dock?.cancel(); await pending; } }
			finally { try { await dock?.close(); } finally { peer.stop(true); } }
		}
	}, 300_000);

	test(`${host} chief report rejects forged attribution and incomplete reports and preserves backend refusal`, async () => {
		const sent: unknown[] = [];
		const peer = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) { sent.push(await request.json()); return Response.json({ code: "chief-report-unassociated" }, { status: 403 }); } });
		const dock = await roleContractDock(host, peer.url.origin, 2000, "chief-report", "chief_report");
		let pending: Promise<void> | undefined;
		try {
			for (const invalid of [
				{ body, sessionId: "other-same-task-chat" }, { body, delegationId: "forged" }, { body, to: "chief" },
				{ body, model: "same-model" }, { body, task: "chief-task" }, { body: "truncated node report" },
				{ body: { ...body, background: " " } }, { body: { ...body, result: "completed" } },
				{ body: { ...body, deliverables: null } }, { body: { ...body, deliverables: [123] } },
				{ body: { ...body, pendingDecisions: "none" } }, { body: { ...body, from: "forged" } },
			]) {
				await dock.report(invalid);
				expect(dock.lastResult()).toMatchObject({ content: expect.arrayContaining([
					expect.objectContaining({ text: expect.stringMatching(/invalid-parameters|Validation failed/) }),
				]) });
				expect(sent).toEqual([]);
			}
			pending = dock.report({ body });
			const dialog = await dock.confirmation(); dock.answerConfirmation(String(dialog.id), true);
			await pending; pending = undefined;
			expect(dock.lastResult()).toMatchObject({ isError: true, details: { httpStatus: 403, body: { code: "chief-report-unassociated" } } });
			expect(sent).toHaveLength(1);
		} finally {
			try { if (pending) { await dock.cancel(); await pending; } }
			finally { try { await dock.close(); } finally { peer.stop(true); } }
		}
	}, 300_000);

	// The peer consumes the actual approved request then drops its response. Missing
	// acknowledgement cannot prove no save, and must not cause a second submission.
	test(`${host} chief report keeps uncertainty when the response is lost after send`, async () => {
		let count = 0;
		const sockets = new Set<Socket>();
		const peer = createServer(async request => {
			for await (const _chunk of request) { /* consume before dropping acknowledgement */ }
			count++; request.socket.destroy();
		});
		peer.on("connection", socket => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
		const listening = Promise.withResolvers<void>();
		peer.listen(0, "127.0.0.1", listening.resolve); await listening.promise;
		const address = peer.address();
		if (!address || typeof address === "string") throw new Error("Missing owned HTTP port");
		const dock = await roleContractDock(host, `http://127.0.0.1:${address.port}`, 500, "chief-report", "chief_report").catch(async error => {
			for (const socket of sockets) socket.destroy();
			const closed = Promise.withResolvers<void>();
			peer.close(failure => failure ? closed.reject(failure) : closed.resolve());
			try { await closed.promise; } catch (cleanup) { throw new Error(`Native dock startup failed: ${String(error)}; peer cleanup failed: ${String(cleanup)}`); }
			throw error;
		});
		let pending: Promise<void> | undefined;
		try {
			pending = dock.report({ body }); const dialog = await dock.confirmation();
			dock.answerConfirmation(String(dialog.id), true); await pending; pending = undefined;
			expect(dock.lastResult()).toMatchObject({ isError: true, details: { body: { guidance: expect.stringContaining("不表示回滚或未生效") } } });
			// Child-process clock: observe the whole configured 500ms approval budget.
			await Bun.sleep(600); expect(count).toBe(1);
		} finally {
			try { if (pending) { await dock.cancel(); await pending; } }
			finally {
				try { await dock.close(); }
				finally {
					for (const socket of sockets) socket.destroy();
					const closed = Promise.withResolvers<void>();
					peer.close(error => error ? closed.reject(error) : closed.resolve());
					await closed.promise;
				}
			}
		}
	}, 300_000);

	// Existing common gate handles failures; observe actual native result and HTTP.
	// A successful HTTP status without saved, or an ambiguous notification, must not
	// become a rollback, reliable receipt, or a second submission.
	test(`${host} chief report separates save notification and uncertain outcomes without retry`, async () => {
		let answer: unknown = { saved: true, report: { id: "immutable-15", body }, notification: { status: "failed", reason: "input refused" } };
		let malformed = false;
		let status = 200;
		let count = 0;
		const peer = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch() { count++; return malformed ? new Response("{broken") : Response.json(answer, { status }); } });
		const dock = await roleContractDock(host, peer.url.origin, 500, "chief-report", "chief_report");
		let pending: Promise<void> | undefined;
		async function approved() {
			pending = dock.report({ body });
			const dialog = await dock.confirmation(); dock.answerConfirmation(String(dialog.id), true);
			await pending; pending = undefined;
		}
		try {
			for (const notification of ["failed", "uncertain", "not-attempted", "submitted"]) {
				answer = { saved: true, report: { id: "immutable-15", body }, notification: { status: notification } };
				await approved();
				expect(dock.lastResult()).toMatchObject({ details: { body: {
					saved: true, notification: { status: notification }, guidance: expect.stringContaining("不代表可靠接收"),
				} } });
			}
			answer = { saved: false, notification: { status: "not-attempted" }, code: "report-save-failed" }; status = 500;
			await approved(); expect(dock.lastResult()).toMatchObject({ isError: true, details: { body: answer } });
			status = 200; answer = { notification: { status: "submitted" } };
			await approved(); expect(dock.lastResult()).toMatchObject({ isError: true, details: { body: { guidance: expect.stringContaining("不表示未发送") } } });
			malformed = true;
			await approved(); expect(dock.lastResult()).toMatchObject({ isError: true, details: { body: { guidance: expect.stringContaining("不表示回滚") } } });
			const settled = count;
			// Native process clock; cover the configured approval budget, no fake time.
			await Bun.sleep(600);
			expect(count).toBe(settled); expect(count).toBe(7);
		} finally {
			try { if (pending) { await dock.cancel(); await pending; } }
			finally { try { await dock.close(); } finally { peer.stop(true); } }
		}
	}, 300_000);

	test(`${host} chief report sends full approved content from executor and direct manager`, async () => {
		const sent: { path: string; body: unknown }[] = [];
		const receipt = { saved: true, report: { id: "report-owned-15", body }, notification: { status: "submitted" } };
		const peer = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
			sent.push({ path: new URL(request.url).pathname, body: await request.json() });
			return Response.json(receipt);
		} });
		let dock: RoleContractDock | undefined;
		let pending: Promise<void> | undefined;
		try {
			for (const role of ["chief-report", "manager", "dual"] as const) {
				dock = await roleContractDock(host, peer.url.origin, 2000, role, "chief_report");
				const state = await dock.state();
				const data = state.data;
				if (!data || typeof data !== "object" || !("sessionId" in data) || typeof data.sessionId !== "string") throw new Error("Native Session identity missing");
				const sessionId = data.sessionId;
				const before = sent.length;
				pending = dock.report({ body });
				const dialog = await dock.confirmation();
				expect(dialog.message).toContain(JSON.stringify({ body, sessionId }, null, 2));
				expect(sent).toHaveLength(before);
				dock.answerConfirmation(String(dialog.id), true);
				await pending; pending = undefined;
				expect(sent.slice(before)).toEqual([{ path: "/api/chief/reports", body: { body, sessionId } }]);
				expect(dock.lastResult()).toMatchObject({ details: { body: { ...receipt,
					guidance: expect.stringContaining("可靠接收"),
				} } });
				const request = dock.capture.requests()[0]!.json;
				if (!request || typeof request !== "object" || !("tools" in request) || !Array.isArray(request.tools)) throw new Error("Missing native role tools");
				const names = request.tools.map(tool => {
					if (!tool || typeof tool !== "object" || !tool.function || typeof tool.function.name !== "string") throw new Error("Invalid native tool declaration");
					return tool.function.name;
				});
				expect(names.filter(name => name === "chief_report")).toHaveLength(1);
				if (role === "chief-report") for (const forbidden of ["report", "run", "collect"]) expect(names).not.toContain(forbidden);
				if (role === "dual") for (const required of ["report", "run", "collect"]) expect(names).toContain(required);
				await dock.close(); dock = undefined;
			}
		} finally {
			try { if (pending) { await dock?.cancel(); await pending; } }
			finally { try { await dock?.close(); } finally { peer.stop(true); } }
		}
	}, 300_000);
}
