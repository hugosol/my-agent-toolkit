import { expect, test } from "bun:test";
import { defineExtension } from "../../framework/interface";
import { WorkflowRequests } from "../../extensions/workflow-chat/common/requests";
import { CHIEF_RESEND_REPORT_TOOL } from "../../extensions/workflow-chat/common/chief-report";
import { CHIEF_TOOLS } from "../../extensions/workflow-chat/chief-chat/shared-logic/tools";
import { portDouble } from "../framework/support/harness-port-double";
import type { ToolExecutionDelivery } from "../../framework/interface/tool";

const report = { id: "original/report-18", from: "sender-native-18", delegationId: "delegation-18", at: 1700000000000,
	body: { background: "Invoice capability", execution: "Create Task Bot", result: "blocked", summary: "Draft saved; publication blocked", deliverables: ["draft.md"], pendingDecisions: ["Approve publication?"] } };
let fixture = 0;
function scene(peer: (request: Request) => Promise<Response>) {
	const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: peer });
	const port = portDouble();
	let requests: WorkflowRequests | undefined;
	const binding = port.bind(defineExtension({ id: `recovery-protocol-${++fixture}`, displayName: "Recovery protocol", config: { fields: { endpoint: "non-empty-string", requestTimeoutMs: "milliseconds", reportConfirmationTimeoutMs: "milliseconds", collectTimeoutMs: "milliseconds" } } }), {
		factory: context => { requests = new WorkflowRequests(context); return {}; },
		config: { reader: () => `endpoint: ${server.url.origin}\nrequestTimeoutMs: 2000\nreportConfirmationTimeoutMs: 2000\ncollectTimeoutMs: 3000\n` },
	});
	if (!binding.bound || !requests) { server.stop(true); throw new Error("Fixture binding unavailable"); }
	const sessionId = "sender-native-18";
	port.deliverSession({ kind: "owner", key: "recovery-test" }, { session: { sessionId, kind: "main", unavailable: [] } });
	requests.start(sessionId);
	return { requests, sessionId, close() { requests!.close(); server.stop(true); } };
}

// S3 public model-callable tool seam; the native companion checks registration/UI.
// Ticket 18 oracle: resend previews the saved ID AND original content, never caller
// replacements. Violation: creating a new report or sending without another approval.
test("manual resend previews the immutable original and sends only its ID after fresh approval", async () => {
	const calls: { method: string; path: string; body?: unknown }[] = [];
	const approval = Promise.withResolvers<boolean>();
	const shown = Promise.withResolvers<Parameters<NonNullable<ToolExecutionDelivery["confirm"]>>[0]>();
	const s = scene(async request => {
		calls.push({ method: request.method, path: new URL(request.url).pathname, ...(request.method === "POST" ? { body: await request.json() } : {}) });
		return Response.json(request.method === "GET" ? report : { saved: true, report, received: true, receipt: { reportId: report.id }, notification: { status: "not-attempted", reason: "already received" } });
	});
	try {
		const tool = CHIEF_RESEND_REPORT_TOOL;
		const pending = tool!.execute({ requests: s.requests }, { id: report.id }, { sessionId: s.sessionId, callId: "resend", confirm: async preview => { shown.resolve(preview); return approval.promise; } });
		const preview = await shown.promise;
		expect(preview.message).toContain(JSON.stringify(report, null, 2));
		expect(calls).toEqual([{ method: "GET", path: "/api/chief/reports/original%2Freport-18" }]);
		approval.resolve(true);
		expect(await pending).toMatchObject({ details: { body: { saved: true, report, received: true } } });
		expect(calls).toEqual([{ method: "GET", path: "/api/chief/reports/original%2Freport-18" }, { method: "POST", path: "/api/chief/reports/original%2Freport-18/resend", body: { sessionId: "sender-native-18" } }]);
	} finally { approval.resolve(false); s.close(); }
});

test("resend rejects changed content and sends nothing without renewed approval", async () => {
	const methods: string[] = [];
	const s = scene(async request => { methods.push(request.method); return Response.json(report); });
	try {
		for (const params of [{ id: report.id, body: { ...report.body, summary: "Changed" } }, { id: report.id, sessionId: "forged" }, { id: report.id, approved: true }]) {
			expect(await CHIEF_RESEND_REPORT_TOOL.execute({ requests: s.requests }, params, { sessionId: s.sessionId, callId: "forged", confirm: async () => true })).toMatchObject({ isError: true });
		}
		expect(methods).toEqual([]);
		for (const confirm of [undefined, async () => false, async () => { throw new Error("Native UI unavailable"); }]) {
			expect(await CHIEF_RESEND_REPORT_TOOL.execute({ requests: s.requests }, { id: report.id }, { sessionId: s.sessionId, callId: "not-approved", confirm })).toMatchObject({ details: { body: { saved: false, sent: false } } });
		}
		expect(methods).toEqual(["GET", "GET", "GET"]);
	} finally { s.close(); }
});

// The preview must be the complete original report, not an ID-only or truncated
// backend answer that could get approval for contents the user never saw.
test("resend refuses an incomplete original before offering approval", async () => {
	let approvals = 0;
	const calls: string[] = [];
	const s = scene(async request => { calls.push(request.method); return Response.json({ ...report, body: {} }); });
	try {
		expect(await CHIEF_RESEND_REPORT_TOOL.execute({ requests: s.requests }, { id: report.id }, { sessionId: s.sessionId, callId: "truncated", confirm: async () => { approvals++; return true; } })).toMatchObject({ isError: true });
		expect({ calls, approvals }).toEqual({ calls: ["GET"], approvals: 0 });
	} finally { s.close(); }
});

// Ticket 18: explicit view is authorized by current native chief, not a public
// GET. A revoked chief must surface the real 409, never present the readable body.
test("manual view uses current chief authorization and preserves revocation refusal", async () => {
	const calls: { method: string; path: string; body?: unknown }[] = [];
	const s = scene(async request => {
		calls.push({ method: request.method, path: new URL(request.url).pathname, ...(request.method === "POST" ? { body: await request.json() } : {}) });
		return request.method === "GET" ? Response.json(report) : Response.json({ code: "chief-not-current", message: "Current chief changed" }, { status: 409 });
	});
	try {
		const tool = CHIEF_TOOLS.find(tool => tool.name === "chief_read_report")!;
		expect(await tool.execute({ requests: s.requests }, { id: report.id }, { sessionId: s.sessionId, callId: "view" })).toMatchObject({ isError: true, details: { httpStatus: 409, body: { code: "chief-not-current" } } });
		expect(calls).toEqual([{ method: "POST", path: "/api/chief/reports/original%2Freport-18/view", body: { sessionId: "sender-native-18" } }]);
	} finally { s.close(); }
});
