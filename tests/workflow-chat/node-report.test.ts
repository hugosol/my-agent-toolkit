import { expect, test } from "bun:test";
import { nodeDock, toolText } from "./support/node-dock";

// Approved seam S1. P15's independent body/attribution literals come from the backend contract.
// Violation: exposing identity fields or substituting cwd/Owner for native identity, or rewriting
// the returned report. Observe both the real OMP model tool schema and its actual HTTP exchange.
test("P15 node auto report sends only body plus native Session identity and preserves backend attribution", async () => {
	const calls: { path: string; method: string; json: unknown }[] = [];
	const report = {
		id: "report-backend-73", type: "report", at: 1790000000731, runId: "run-19", nodeId: "A",
		executionId: "execution-41", source: { sessionId: "backend-source", tabId: 82 },
		target: { sessionId: "manager-native", tabId: 83 }, body: "E:/artifacts/alpha.txt；UTF-8；只读草稿，不可用于生产。",
	};
	const response = { saved: true, report, notification: { status: "submitted", reason: "input-submission-confirmed" }, diagnostic: { status: "written" }, guidance: "报告不等于节点完成" };
	const server = Bun.serve({ port: 0, hostname: "127.0.0.1", async fetch(request) {
		calls.push({ path: new URL(request.url).pathname, method: request.method, json: await request.json() });
		return Response.json(response);
	} });
	const dock = await nodeDock(`http://127.0.0.1:${server.port}`, report.body);
	try {
		expect((await dock.session.prompt("提交已可交接的 alpha 结果；固定职能与本次工作并非身份。")).status).toBe("completed");
		expect(calls).toHaveLength(1);
		const state = await dock.session.request({ type: "get_state" });
		if (!state.data || typeof state.data !== "object" || !("sessionId" in state.data) || typeof state.data.sessionId !== "string") throw new Error("OMP did not report native identity");
		const sessionId = state.data.sessionId;
		expect(sessionId.length).toBeGreaterThan(0);
		expect(calls[0]).toEqual({ path: "/api/workflow/node/report", method: "POST", json: { sessionId, body: report.body } });
		const first = dock.capture.requests()[0]?.json as { tools: { function: { name: string; parameters: { type: string; properties: object; required: string[] } } }[] };
		const tool = first.tools.find(tool => tool.function.name === "report")!;
		// OMP's own global tracing metadata is not a role business parameter and is stripped by OMP.
		expect(Object.keys(tool.function.parameters.properties).filter(key => key !== "i")).toEqual(["body"]);
		expect(tool.function.parameters.required.filter(key => key !== "i")).toEqual(["body"]);
		expect(first.tools.some(tool => ["run", "collect"].includes(tool.function.name))).toBe(false);
		expect(JSON.parse(toolText(dock))).toMatchObject({ ...response });
	} finally { await dock.close(); server.stop(true); }
}, 300_000);
