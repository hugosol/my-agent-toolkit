import { expect, test } from "bun:test";
import { promptDock } from "./support/prompt-dock";
import { beginRoleCall, lastRoleResult, nativeIdentity, roleCall } from "./support/role-tools";

// Approved S2: real OMP role tool and public Session/HTTP. The ticket requires strict
// can_complete and named outputs, not a body-only request or host-coerced values.
// Independent literals distinguish a lost false, rewritten output or forged identity.
// The paired backend's public workflow-runtime.md defines HTTP canComplete; the model's
// can_complete must be mapped, not sent verbatim (the real backend rejects snake_case).
test("report forwards explicit handoff declarations and rejects malformed model parameters without HTTP", async () => {
	const calls: unknown[] = [];
	const saved = { saved: true, notification: { status: "not-attempted" } };
	const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
		if (new URL(request.url).pathname === "/api/workflow/node/context") return Response.json({ reportPolicy: "auto" });
		calls.push(await request.json());
		return Response.json(saved);
	} });
	const dock = await promptDock("node", { config: `endpoint: http://127.0.0.1:${server.port}\nrequestTimeoutMs: 2000\nreportConfirmationTimeoutMs: 20000\ncollectTimeoutMs: 5460000\n` });
	try {
		const sessionId = await nativeIdentity(dock);
		const params = { body: "部分生效；等待用户修复权限，不能交接。", can_complete: false, outputs: [{ id: "draft", path: "E:/external/draft.txt" }] };
		expect((await beginRoleCall(dock, "report", params)).status).toBe("completed");
		const firstFrames = dock.session.frames().filter(frame => frame.type === "tool_execution_end");
		const first = firstFrames[firstFrames.length - 1]!;
		expect(first.isError).not.toBe(true);
		expect(lastRoleResult(dock).body).toEqual(saved);
		expect(calls).toEqual([{ body: params.body, canComplete: false, outputs: [{ id: "draft", path: "E:/external/draft.txt" }], sessionId }]);
		for (const invalid of [
			{ body: "missing declaration" }, { body: "wrong boolean", can_complete: "false" },
			{ body: "wrong boolean", can_complete: null }, { body: "wrong boolean", can_complete: 0 },
			{ body: 123, can_complete: true }, { body: ["not text"], can_complete: true },
			{ body: "bad outputs", can_complete: false, outputs: null },
			{ body: "legacy outputs", can_complete: false, outputs: { draft: "E:/result.txt" } },
			{ body: "duplicate outputs", can_complete: false, outputs: [{ id: "draft", path: "E:/a.txt" }, { id: "draft", path: "E:/b.txt" }] },
			{ body: "bad entry", can_complete: false, outputs: [null] },
			{ body: "empty id", can_complete: false, outputs: [{ id: "", path: "E:/a.txt" }] },
			{ body: "extra output field", can_complete: false, outputs: [{ id: "draft", path: "E:/a.txt", extra: true }] },
			{ body: "bad outputs", can_complete: false, outputs: "E:/result.txt" },
			{ body: "bad outputs", can_complete: false, outputs: "null" },
			{ body: "bad outputs", can_complete: false, outputs: "" },
			{ body: "bad path type", can_complete: false, outputs: { draft: 17 } },
			{ ...params, sessionId: "forged" }, { ...params, sessionId: null }, { ...params, runId: "forged" },
			{ ...params, executionId: "forged" }, { ...params, nodeId: "forged" },
			{ ...params, from: {} }, { ...params, to: {} },
		]) {
			dock.select("report", invalid);
			expect((await dock.session.prompt("Execute selected malformed report exactly once.")).status).toBe("completed");
			const frames = dock.session.frames().filter(frame => frame.type === "tool_execution_end");
			const end = frames[frames.length - 1]!;
			const result = end.result;
			const resultError = result && typeof result === "object" && "isError" in result && result.isError;
			expect({ invalid, rejected: Boolean(end.isError || resultError) }).toMatchObject({ rejected: true });
			expect(calls).toHaveLength(1);
		}
		// No file output and empty body remain legal; true is not inferred from body text.
		expect((await roleCall(dock, "report", { body: "", can_complete: true })).body).toEqual(saved);
		expect(calls[1]).toEqual({ body: "", canComplete: true, sessionId });
	} finally { await dock.close(); server.stop(true); }
}, 300_000);
