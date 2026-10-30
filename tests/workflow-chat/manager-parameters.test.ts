import { expect, test } from "bun:test";
import { managerDock } from "./support/manager-dock";

// S1/P10 owned basic-action partition. These are literal protocol examples, independent of
// implementation tables. Violation: ignoring extra fields and accidentally accepting a mutation.
// Native OMP validation AND delivered runtime guard remain real, HTTP is only a capture boundary.
test("P10 basic actions send only applicable literal fields and reject identity or inapplicable parameters", async () => {
	const calls: { path: string; body: unknown }[] = [];
	const response = { snapshot: { id: "literal-run", status: "running" }, historyError: "independent history warning", stateCommitted: true };
	const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
		calls.push({ path: new URL(request.url).pathname, body: await request.json() });
		return Response.json(response);
	} });
	const dock = await managerDock(`http://127.0.0.1:${server.port}`);
	try {
		const sessionId = await dock.nativeId();
		const examples = [
			{ input: { action: "status" }, wire: { sessionId } },
			{ input: { action: "complete", nodeId: "A", reason: "E:/alpha.txt 已可交接" }, wire: { sessionId, nodeId: "A", reason: "E:/alpha.txt 已可交接" } },
			{ input: { action: "fail", nodeId: "B", reason: "已核实缺少源文件" }, wire: { sessionId, nodeId: "B", reason: "已核实缺少源文件" } },
			{ input: { action: "pause" }, wire: { sessionId } },
			{ input: { action: "resume" }, wire: { sessionId } },
			{ input: { action: "finish" }, wire: { sessionId } },
		];
		for (const { input, wire } of examples) {
			expect(await dock.call(input)).toEqual(response);
			expect(calls[calls.length - 1]).toEqual({ path: `/api/workflow/manager/${input.action}`, body: wire });
			const before = calls.length;
			for (const extra of [{ sessionId: "forged-native" }, { runId: "forged-run" }, { executionId: "forged-execution" }, { confirmed: true }, { nodes: ["C"] }, { body: "not applicable" }]) {
				const text = await dock.call({ ...input, ...extra }, true);
				expect(calls).toHaveLength(before);
				expect({ input, extra, text }).toMatchObject({ text: expect.stringMatching(/Validation failed|parameters|不接受/) });
			}
			if (!["complete", "fail"].includes(input.action)) {
				expect(await dock.call({ ...input, nodeId: "A", reason: "不适用于无目标动作" }, true)).toMatch(/Validation failed|parameters|不接受/);
				expect(calls).toHaveLength(before);
			}
		}
		for (const input of [{ action: "complete", nodeId: "A" }, { action: "fail", reason: "missing target" }]) {
			expect(await dock.call(input, true)).toMatch(/Validation failed|parameters|不接受/);
		}
		expect(calls).toHaveLength(6);
	} finally { await dock.close(); server.stop(true); }
}, 300_000);
