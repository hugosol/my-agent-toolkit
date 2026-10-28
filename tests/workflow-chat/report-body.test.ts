import { expect, test } from "bun:test";
import { nodeDock, toolText } from "./support/node-dock";

// S1/P15: the actual backend requires a string, not a non-empty path-bearing report. The empty
// literal distinguishes protocol acceptance from an invented client address/content validator.
test("P15 report does not invent an empty-string or result-address rejection", async () => {
	const requests: unknown[] = [];
	const response = { saved: true, report: { id: "empty-body-accepted", body: "" }, notification: { status: "submitted" }, diagnostic: { status: "written" } };
	const server = Bun.serve({ port: 0, hostname: "127.0.0.1", async fetch(request) { requests.push(await request.json()); return Response.json(response); } });
	const dock = await nodeDock(`http://127.0.0.1:${server.port}`, "");
	try {
		expect((await dock.session.prompt("提交空正文协议样例一次；这是协议测试，不表示高质量交接。")).status).toBe("completed");
		expect(requests).toHaveLength(1);
		expect(requests[0]).toMatchObject({ body: "" });
		expect(JSON.parse(toolText(dock))).toEqual(response);
	} finally { await dock.close(); server.stop(true); }
}, 300_000);
