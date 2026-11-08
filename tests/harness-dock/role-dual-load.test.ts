import { expect, test } from "bun:test";
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
			dock.answer({ saved: true, report: { id: "controlled-external-report" }, notification: { ok: false } });
			expect((await dock.call("report", { body: "External handoff", can_complete: true })).isError).toBe(false);
			const state = await dock.session.request({ type: "get_state" });
			const data = state.data as { sessionId: string };
			expect(typeof data.sessionId).toBe("string");
			expect(dock.calls).toEqual([
				{ path: "/api/workflow/manager/status", body: { sessionId: data.sessionId } },
				{ path: "/api/workflow/manager/collect", body: { sessionId: data.sessionId } },
				{ path: "/api/workflow/node/report", body: { sessionId: data.sessionId, body: "External handoff", canComplete: true } },
			]);
			const first = dock.capture.requests()[0]!;
			const request = first.json;
			if (!request || typeof request !== "object" || !("tools" in request) || !Array.isArray(request.tools)) throw new Error("Missing native tools");
			const tools = request.tools.map(tool => {
				if (!tool || typeof tool !== "object" || !tool.function || typeof tool.function.name !== "string") throw new Error("Invalid native tool");
				return tool.function.name;
			});
			for (const tool of ["run", "collect", "report"]) expect(tools.filter(name => name === tool)).toHaveLength(1);
			const manager = roleGuidance(first, "manager");
			const node = roleGuidance(first, "node");
			expect(manager).not.toBe(node);
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
