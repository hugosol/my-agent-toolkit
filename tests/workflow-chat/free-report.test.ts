import { expect, test } from "bun:test";
import { NODE_TOOLS } from "../../extensions/workflow-chat/node-chat/shared-logic/tools";
import { businessRoles } from "./support/business-roles";

// P38 replacement at approved tool seam: reporting is orthogonal to result approval.
// Violation: retaining a context/policy gate or native report confirmation. Reject all
// non-report HTTP and count confirmations without any approval prerequisite.
test("node report sends progress failure questions and handoff without approval or confirmation", async () => {
	const calls: unknown[] = [];
	let confirmations = 0;
	const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
		if (new URL(request.url).pathname !== "/api/workflow/node/report") return Response.json({ error: "report must not query approval" }, { status: 503 });
		calls.push(await request.json());
		return Response.json({ saved: true, notification: { status: "submitted" } });
	} });
	const roles = businessRoles(server.url.origin);
	try {
		for (const [body, can_complete] of [["progress", false], ["failure", false], ["question", false], ["handoff", true]] as const) {
			const result = await NODE_TOOLS.find(tool => tool.name === "report")!.execute({ operations: roles.node }, { body, can_complete }, {
				sessionId: roles.sessionId, callId: body, confirm: async () => { confirmations++; return false; },
			});
			expect(result).toMatchObject({ isError: false, details: { body: { saved: true } } });
		}
		expect(confirmations).toBe(0);
		expect(calls).toEqual([
			{ sessionId: "business-native-session", body: "progress", canComplete: false },
			{ sessionId: "business-native-session", body: "failure", canComplete: false },
			{ sessionId: "business-native-session", body: "question", canComplete: false },
			{ sessionId: "business-native-session", body: "handoff", canComplete: true },
		]);
	} finally { roles.close(); server.stop(true); }
});
