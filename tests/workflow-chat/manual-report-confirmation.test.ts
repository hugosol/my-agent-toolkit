import { expect, test } from "bun:test";
import { NODE_TOOLS } from "../../extensions/workflow-chat/node-chat/shared-logic/tools";
import { businessRoles } from "./support/business-roles";
import type { ToolExecutionDelivery } from "../../framework/interface/tool";

type Confirmation = NonNullable<ToolExecutionDelivery["confirm"]>;

function scenario(policy: unknown = "manual", status = 200) {
	const sent: unknown[] = [];
	const contexts: unknown[] = [];
	const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
		if (new URL(request.url).pathname === "/api/workflow/node/context") {
			contexts.push(await request.json());
			return Response.json({ reportPolicy: policy }, { status });
		}
		sent.push(await request.json());
		return Response.json({ saved: true });
	} });
	const roles = businessRoles(`http://127.0.0.1:${server.port}`);
	return { sent, contexts, roles,
		call: (params: unknown, confirm?: Confirmation, signal?: AbortSignal) => NODE_TOOLS[0]!.execute(
			{ operations: roles.node }, params, { sessionId: roles.sessionId, callId: "manual-report", confirm, signal }),
		close() { roles.close(); server.stop(true); },
	};
}

// Violation: sending while approval is pending, or sending a mutated payload rather than
// the exact report displayed. Native decision is external; real report serialization stays exercised.
test("approval authorizes only the displayed payload and each subsequent report asks again", async () => {
	const scene = scenario();
	const shown = Promise.withResolvers<Parameters<Confirmation>[0]>();
	const approval = Promise.withResolvers<boolean>();
	const params = { body: "Original report\nSecond line", can_complete: false, outputs: [{ id: "draft", path: "E:/original.txt" }] };
	try {
		const pending = scene.call(params, async request => { shown.resolve(request); return approval.promise; });
		const preview = await shown.promise;
		expect(scene.contexts).toEqual([{ sessionId: scene.roles.sessionId }]);
		expect(scene.sent).toEqual([]);
		expect(preview.message).toContain("Original report\nSecond line");
		expect(preview.message).toContain("can_complete: false");
		// Complete wire identity and camelCase payload must be visible, not just a prose summary.
		expect(preview.message).toContain(JSON.stringify({ body: "Original report\nSecond line", canComplete: false, outputs: [{ id: "draft", path: "E:/original.txt" }], sessionId: "business-native-session" }, null, 2));
		expect(preview.message).toContain("E:/original.txt");
		params.body = "Changed after preview";
		params.can_complete = true;
		params.outputs[0]!.path = "E:/changed.txt";
		approval.resolve(true);
		expect((await pending).isError).toBe(false);
		expect(scene.sent).toEqual([{ sessionId: scene.roles.sessionId, body: "Original report\nSecond line", canComplete: false, outputs: [{ id: "draft", path: "E:/original.txt" }] }]);
		await scene.call(params, async request => {
			expect(request.message).toContain("Changed after preview");
			expect(request.message).toContain("E:/changed.txt");
			return false;
		});
		expect(scene.sent).toHaveLength(1);
	} finally { approval.resolve(false); scene.close(); }
});

for (const mode of ["unavailable", "throws", "cancelled", "session-ended"] as const) {
	test(`manual report never sends when confirmation is ${mode}`, async () => {
		const scene = scenario();
		const abort = new AbortController();
		try {
			const confirm: Confirmation | undefined = mode === "unavailable" ? undefined : async () => {
				if (mode === "throws") throw new Error("UI failed");
				if (mode === "session-ended") scene.roles.close(); else abort.abort();
				return true;
			};
			expect((await scene.call({ body: "Not authorized", can_complete: true }, confirm, abort.signal)).details).toMatchObject({ body: { sent: false, saved: false } });
			expect(scene.sent).toEqual([]);
		} finally { scene.close(); }
	});
}

for (const [policy, status] of [[undefined, 200], ["manual", 503], ["invented-policy", 200]] as const) {
	test(`unknown or unavailable frozen policy fails closed (${policy}, ${status})`, async () => {
		const scene = scenario(policy === undefined ? null : policy, status);
		try {
			expect((await scene.call({ body: "No inferred auto", can_complete: false }, async () => true)).isError).toBe(true);
			expect(scene.sent).toEqual([]);
		} finally { scene.close(); }
	});
}

test("auto report does not require or open user confirmation", async () => {
	const scene = scenario("auto");
	try {
		expect((await scene.call({ body: "Auto", can_complete: true }, async () => { throw new Error("auto must not ask"); })).details).toMatchObject({ body: { saved: true } });
		expect(scene.sent).toEqual([{ sessionId: scene.roles.sessionId, body: "Auto", canComplete: true }]);
	} finally { scene.close(); }
});

// Approved seam: the report tool and actual report HTTP side effects. The external
// backend supplies frozen policy; the external user UI supplies a decision, never the gate.
// Violation: a model tool call sends manual report before the user approves it.
test("manual report refuses an explicit user denial without a report HTTP request", async () => {
	const sent: unknown[] = [];
	const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
		if (new URL(request.url).pathname === "/api/workflow/node/context") return Response.json({ reportPolicy: "manual" });
		sent.push(await request.json());
		return Response.json({ saved: true });
	} });
	const roles = businessRoles(`http://127.0.0.1:${server.port}`);
	try {
		const delivery = { sessionId: roles.sessionId, callId: "denied-report", confirm: async () => false };
		const result = await NODE_TOOLS[0]!.execute({ operations: roles.node }, { body: "Ready", can_complete: true }, delivery);
		expect(sent).toEqual([]);
		expect(result.details).toMatchObject({ body: { sent: false, saved: false } });
	} finally { roles.close(); server.stop(true); }
});
