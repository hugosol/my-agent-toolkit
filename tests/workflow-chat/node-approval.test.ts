import { expect, test } from "bun:test";
import { NODE_TOOLS } from "../../extensions/workflow-chat/node-chat/shared-logic/tools";
import { businessRoles } from "./support/business-roles";
import type { ToolExecutionDelivery } from "../../framework/interface/tool";

type Confirmation = NonNullable<ToolExecutionDelivery["confirm"]>;
const question = "当前会话的成果是否已达到预期，可以交接并推进后续流程？";

function scenario(context: unknown = { runId: "run-a", nodeId: "work", executionId: "execution-original", autoApproved: true, approved: false, approvalSource: null }, status = 200) {
	const calls: { path: string; body: unknown }[] = [];
	let receipt: unknown = { runId: "run-a", nodeId: "work", executionId: "execution-original", autoApproved: true, approved: true, approvalSource: "auto", changed: true };
	let receiptStatus = 200;
	const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
		const path = new URL(request.url).pathname;
		calls.push({ path, body: await request.json() });
		return path.endsWith("/context") ? Response.json(context, { status }) : Response.json(receipt, { status: receiptStatus });
	} });
	const roles = businessRoles(server.url.origin);
	return { calls, roles,
		response(body: unknown, status = 200) { receipt = body; receiptStatus = status; },
		async call(params: unknown = {}, confirm?: Confirmation, signal?: AbortSignal) {
			const tool = NODE_TOOLS.find(tool => tool.name === "approve");
			if (!tool) throw new Error("node-chat must expose approve");
			return tool.execute({ operations: roles.node }, params, { sessionId: roles.sessionId, callId: "approve-result", confirm, signal });
		},
		close() { roles.close(); server.stop(true); },
	};
}

// Approved seam S2: actual tool declaration/execution, real Session and HTTP adapter;
// only the external backend and native decision are controlled. Contract: auto approval
// needs neither report nor output. Violation: opening UI, sending model identity, or report.
test("auto approve binds frozen backend execution without a report or native confirmation", async () => {
	const scene = scenario();
	try {
		const result = await scene.call({}, async () => { throw new Error("auto must not ask"); });
		expect(result.isError).toBe(false);
		expect(result.details).toMatchObject({ body: { approved: true, approvalSource: "auto" } });
		expect(scene.calls).toEqual([
			{ path: "/api/workflow/node/context", body: { sessionId: "business-native-session" } },
			{ path: "/api/workflow/node/approve", body: { sessionId: "business-native-session", executionId: "execution-original", source: "auto" } },
		]);
		const schema = NODE_TOOLS.find(tool => tool.name === "approve")!.parameters;
		expect(schema).toEqual({ type: "object", properties: {}, additionalProperties: false });
	} finally { scene.close(); }
});

// A successful HTTP status alone cannot certify a persisted approval. Literal backend
// receipts are the independent source; a false/mismatched receipt must not look successful.
for (const receipt of [null, {}, { approved: false }, { executionId: "retry-new", approved: true, approvalSource: "auto" }, { executionId: "execution-original", approved: true, approvalSource: "manual" }]) {
	test(`approve rejects unusable successful receipt ${JSON.stringify(receipt)}`, async () => {
		const scene = scenario();
		try {
			scene.response(receipt);
			expect(await scene.call()).toMatchObject({ isError: true, details: { body: { error: { kind: "protocol", response: receipt } } } });
			expect(scene.calls).toHaveLength(2);
		} finally { scene.close(); }
	});
}

for (const condition of ["denied", "dismissed", "non-boolean", "timeout", "throws", "unavailable", "cancelled", "session-ended"] as const) {
	test(`manual approval ${condition} does not approve fail report or retry; later user can ask again`, async () => {
		const scene = scenario({ executionId: "execution-original", autoApproved: false });
		const abort = new AbortController();
		try {
			const confirm: Confirmation | undefined = condition === "unavailable" ? undefined : async () => {
				if (condition === "throws") throw new Error("native UI unavailable");
				if (condition === "timeout") throw new DOMException("native confirmation timed out", "TimeoutError");
				if (condition === "non-boolean") return "true" as unknown as boolean;
				if (condition === "cancelled") abort.abort();
				if (condition === "session-ended") scene.roles.close();
				return condition === "cancelled" || condition === "session-ended";
			};
			expect(await scene.call({}, confirm, abort.signal)).toMatchObject({ isError: false, details: { body: { approved: false, sent: false } } });
			expect(scene.calls.map(call => call.path)).toEqual(["/api/workflow/node/context"]);
			if (condition !== "session-ended") {
				scene.response({ executionId: "execution-original", approved: true, approvalSource: "manual" });
				expect(await scene.call({}, async () => true)).toMatchObject({ isError: false, details: { body: { approved: true } } });
				expect(scene.calls.map(call => call.path)).toEqual(["/api/workflow/node/context", "/api/workflow/node/context", "/api/workflow/node/approve"]);
			}
		} finally { scene.close(); }
	});
}

for (const context of [null, {}, { executionId: "execution-original" }, { executionId: "execution-original", autoApproved: "true" }, { autoApproved: true }]) {
	test(`invalid role context never defaults auto ${JSON.stringify(context)}`, async () => {
		const scene = scenario(context);
		try {
			expect((await scene.call({}, async () => { throw new Error("invalid context must not ask"); })).isError).toBe(true);
			expect(scene.calls.map(call => call.path)).toEqual(["/api/workflow/node/context"]);
		} finally { scene.close(); }
	});
}

for (const failure of [
	{ code: "node-unassociated", message: "chief or manager is not a node" },
	{ code: "node-not-approvable", message: "end nodes have no approval responsibility" },
]) {
	test(`role context refusal remains authoritative: ${failure.code}`, async () => {
		const scene = scenario(failure, 403);
		try {
			expect(await scene.call()).toMatchObject({ isError: true, details: { body: failure } });
			expect(scene.calls).toHaveLength(1);
		} finally { scene.close(); }
	});
}

test("approve refuses model-supplied identity explanation report or summary before HTTP", async () => {
	const scene = scenario();
	try {
		for (const params of [null, [], { executionId: "forged" }, { sessionId: "forged" }, { reportId: "old" }, { reason: "yes" }, { body: "approved" }, { outputs: [] }, { summary: "ready" }]) {
			expect((await scene.call(params)).isError).toBe(true);
		}
		expect(scene.calls).toEqual([]);
	} finally { scene.close(); }
});

test("approve preserves original persistence failure without claiming success or retrying", async () => {
	const scene = scenario();
	const failure = { code: "approval-save-failed", message: "owned run directory: access denied" };
	try {
		scene.response(failure, 500);
		expect(await scene.call()).toMatchObject({ isError: true, details: { body: failure } });
		expect(scene.calls).toHaveLength(2);
	} finally { scene.close(); }
});

// Contract: only native explicit Yes authorizes manual approval. A retry while UI is
// open must not retarget the request. Observe the original execution wire identity;
// backend stale-execution rejection remains authoritative and must be preserved.
test("manual Yes submits captured original execution and preserves stale refusal", async () => {
	const scene = scenario({ executionId: "execution-original", autoApproved: false });
	const shown = Promise.withResolvers<Parameters<Confirmation>[0]>();
	const answer = Promise.withResolvers<boolean>();
	try {
		const pending = scene.call({}, async preview => { shown.resolve(preview); return answer.promise; });
		const preview = await Promise.race([shown.promise, pending.then(() => { throw new Error("submitted before native Yes"); })]);
		expect(preview.message).toBe(question);
		expect(preview.timeoutMs).toBe(20000);
		expect(scene.calls).toEqual([{ path: "/api/workflow/node/context", body: { sessionId: "business-native-session" } }]);
		const failure = { code: "approval-execution-stale", message: "execution-original is no longer current" };
		scene.response(failure, 409);
		answer.resolve(true);
		expect(await pending).toMatchObject({ isError: true, details: { body: failure } });
		expect(scene.calls).toEqual([
			{ path: "/api/workflow/node/context", body: { sessionId: "business-native-session" } },
			{ path: "/api/workflow/node/approve", body: { sessionId: "business-native-session", executionId: "execution-original", source: "manual" } },
		]);
	} finally { answer.resolve(false); scene.close(); }
});
