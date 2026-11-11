import { expect, test } from "bun:test";
import { defineExtension } from "../../framework/interface";
import { WorkflowRequests } from "../../extensions/workflow-chat/common/requests";
import { CHIEF_TOOLS } from "../../extensions/workflow-chat/chief-chat/shared-logic/tools";
import { portDouble } from "../framework/support/harness-port-double";
import type { ToolExecutionDelivery } from "../../framework/interface/tool";

let fixture = 0;
function scene(peer: (request: Request) => Promise<Response>) {
	const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: peer });
	const port = portDouble();
	let requests: WorkflowRequests | undefined;
	const binding = port.bind(defineExtension({ id: `chief-protocol-test-${++fixture}`, displayName: "Chief protocol", config: { fields: { endpoint: "non-empty-string", requestTimeoutMs: "milliseconds", reportConfirmationTimeoutMs: "milliseconds", collectTimeoutMs: "milliseconds" } } }), {
		factory: context => { requests = new WorkflowRequests(context); return {}; },
		config: { reader: () => `endpoint: ${server.url.origin}\nrequestTimeoutMs: 2000\nreportConfirmationTimeoutMs: 2000\ncollectTimeoutMs: 3000\n` },
	});
	if (!binding.bound || !requests) { server.stop(true); throw new Error("Fixture binding unavailable"); }
	const sessionId = "chief-native-session";
	port.deliverSession({ kind: "owner", key: "chief-test" }, { session: { sessionId, kind: "main", unavailable: [] } });
	requests.start(sessionId);
	return {
		call(params: unknown, confirm?: ToolExecutionDelivery["confirm"]) {
			const tool = CHIEF_TOOLS.find(tool => tool.name === "chief_delegate");
			if (!tool) throw new Error("chief_delegate is not registered");
			return tool.execute({ requests: requests! }, params, { sessionId, callId: "chief-test", confirm });
		},
		close() { requests!.close(); server.stop(true); },
	};
}

// Public model-callable S3 tool boundary, controlled external HTTP/user decision.
// Oracle: ticket 10 forbids replacing approved input; a mismatched backend preview
// must never open approval or commit. Native registration/UI have companion dock coverage.
test("chief rejects a preview for different business input before asking approval", async () => {
	const routes: string[] = [];
	const testScene = scene(async request => {
		routes.push(new URL(request.url).pathname);
		const body = await request.json();
		return Response.json({ previewId: "changed-input", facts: { request: { ...body, input: "Unapproved replacement" }, bot: {}, task: {}, cwd: "E:/work", name: "Example", materials: [], prompt: "Unapproved replacement" } });
	});
	try {
		let confirmations = 0;
		const result = await testScene.call({ botId: "worker", zoneId: "work/explicit", input: "Approved literal", materials: [] }, async () => { confirmations++; return true; });
		expect(result).toMatchObject({ isError: true, details: { body: { error: { kind: "protocol" } } } });
		expect(confirmations).toBe(0);
		expect(routes).toEqual(["/api/chief/delegations/preview"]);
	} finally { testScene.close(); }
});

// Violation: retaining mutable caller arguments across either await, or reusing a
// previous approval after changed Bot/input/zone/manager/materials. Expected literal
// requests are independent of serialization, and the final peer sees the actual HTTP.
for (const kind of ["task", "map"] as const) test(`${kind} approval pins all inputs and another work requires a fresh confirmation`, async () => {
	const sent: unknown[] = [];
	const previews: unknown[] = [];
	const shown = Promise.withResolvers<Parameters<NonNullable<ToolExecutionDelivery["confirm"]>>[0]>();
	const approval = Promise.withResolvers<boolean>();
	const testScene = scene(async request => {
		const body = await request.json();
		if (new URL(request.url).pathname.endsWith("/preview")) {
			previews.push(body);
			return Response.json({ previewId: `literal-preview-${previews.length}`, facts: { request: body, bot: {}, task: {}, cwd: "E:/original", name: "Original Chat", materials: [{ id: "source", zoneId: "work/source", path: "E:/original/source.txt" }], prompt: "Original business input", ...(kind === "map" ? { map: { zoneBindings: { "work/node": "E:/node" } } } : {}) } });
		}
		sent.push(body); return Response.json(kind === "map" ? { id: "literal-run", run: { nodes: {} } } : { id: "literal-start", stage: "starting" }, { status: kind === "map" ? 201 : 202 });
	});
	const params = { botId: "original-bot", zoneId: "work/original", input: "Original business input", materials: [{ id: "source", zoneId: "work/source", path: "source.txt" }], ...(kind === "map" ? { managerTaskId: "original-manager" } : {}) };
	try {
		const pending = testScene.call(params, async request => { shown.resolve(request); return approval.promise; });
		const preview = await shown.promise;
		expect(previews).toEqual([{ botId: "original-bot", zoneId: "work/original", input: "Original business input", materials: [{ id: "source", zoneId: "work/source", path: "source.txt" }], ...(kind === "map" ? { managerTaskId: "original-manager" } : {}), sessionId: "chief-native-session" }]);
		expect(sent).toEqual([]);
		expect(preview.message).toContain("E:/original/source.txt");
		params.botId = "replacement-bot"; params.zoneId = "work/replacement"; params.input = "Replacement business";
		params.materials[0]!.path = "replacement.txt";
		if (kind === "map") params.managerTaskId = "replacement-manager";
		approval.resolve(true); await pending;
		expect(sent).toEqual([{ previewId: "literal-preview-1", sessionId: "chief-native-session" }]);
		let freshConfirmations = 0;
		await testScene.call(params, async request => { freshConfirmations++; expect(request.message).toContain("replacement-bot"); expect(request.message).toContain("Replacement business"); return false; });
		expect(freshConfirmations).toBe(1);
		expect(previews).toHaveLength(2);
		expect(sent).toHaveLength(1);
	} finally { approval.resolve(false); testScene.close(); }
});

test("chief keeps a successful HTTP response with no startup receipt uncertain", async () => {
	const testScene = scene(async request => {
		const body = await request.json();
		if (new URL(request.url).pathname.endsWith("/preview")) return Response.json({ previewId: "literal-preview", facts: { request: body, bot: {}, task: {}, cwd: "E:/work", name: "Literal Chat", materials: [], prompt: "Literal input" } });
		return Response.json({ sent: false });
	});
	try {
		expect(await testScene.call({ botId: "worker", zoneId: "work/explicit", input: "Literal input", materials: [] }, async () => true)).toMatchObject({ isError: true, details: { body: { error: { kind: "protocol" }, response: { sent: false } } } });
	} finally { testScene.close(); }
});

test("chief rejects forged approval identity and malformed materials before preview", async () => {
	let requests = 0;
	const testScene = scene(async () => { requests++; return Response.json({}); });
	try {
		const valid = { botId: "worker", zoneId: "work/explicit", input: "Literal request", materials: [] };
		for (const params of [
			{ ...valid, sessionId: "forged" }, { ...valid, previewId: "previous-work" }, { ...valid, approved: true },
			{ ...valid, managerTaskId: 7 }, { ...valid, input: " " }, { ...valid, materials: "source" },
			{ ...valid, materials: [{ id: "source", zoneId: "work/source", path: "source.txt", approved: true }] },
			{ ...valid, materials: [{ id: "source", path: "source.txt" }] }, { ...valid, materials: [{ id: 7, zoneId: "work/source", path: "source.txt" }] },
		]) expect(await testScene.call(params, async () => true)).toMatchObject({ isError: true, details: { body: { code: "invalid-parameters" } } });
		expect(requests).toBe(0);
	} finally { testScene.close(); }
});
