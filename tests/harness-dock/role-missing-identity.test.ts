import { expect, test } from "bun:test";
import { promptDock } from "../workflow-chat/support/prompt-dock";
import { nativeIdentity, roleCall } from "../workflow-chat/support/role-tools";

// S1/P6. A healthy real OMP always supplies an ID to tool execution, so inject an
// unavailable native tool-context reading at that external seam, not a fake role,
// registration, Session store or HTTP client. Name/cwd and the normal native Session
// observation remain available. A fallback to any of them must issue a trap request.
for (const role of ["manager", "node"] as const) {
	test(`P6 ${role} refuses missing native tool identity without guessing name, Owner or cwd`, async () => {
		const calls: unknown[] = [];
		const endpoint = Bun.serve({ port: 0, hostname: "127.0.0.1", async fetch(request) { calls.push(await request.json()); return Response.json({ unexpectedFallback: true }); } });
		try {
			const dock = await promptDock(role, { missingNativeIdentity: true, config: `endpoint: http://127.0.0.1:${endpoint.port}\nrequestTimeoutMs: 3000\ncollectTimeoutMs: 6000\n` });
			try {
				const actualId = await nativeIdentity(dock);
				await dock.session.request({ type: "set_session_name", name: "tempting-display-name-not-an-id" });
				expect(actualId).not.toBe(dock.root.workDir);
				for (const [tool, params] of role === "manager" ? [["run", { action: "status" }], ["collect", {}]] as const : [["report", { body: "no-identity-must-not-send" }]] as const) {
					expect(await roleCall(dock, tool, params)).toMatchObject({ isError: true, body: { error: { kind: "session-unavailable", message: "公共 Session 未提供活动原生身份；未发送请求。" } } });
				}
				expect(calls).toEqual([]);
				console.log(JSON.stringify({ promise: "P6", role, scope: "real OMP + external missing native-context fault", normalNativeId: actualId, nativeToolId: "", requests: calls.length }));
			} finally { await dock.close(); }
		} finally { endpoint.stop(true); }
	}, 300_000);
}
