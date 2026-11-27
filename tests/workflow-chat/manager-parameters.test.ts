import { expect, test } from "bun:test";
import { managerDock } from "./support/manager-dock";

// S3: the actual manager tool must map the public argument to HTTP and retain the
// public receipt. A plausible violation is stripping map_output or accepting it
// on unrelated actions. The peer supplies literal receipts, not backend validation.
test("manager finish submits public files once and status reads back the original public values", async () => {
	const calls: { path: string; body: unknown }[] = [];
	const receipt = {
		snapshot: {
			status: "completed", inputsReady: true,
			mapInput: { runInput: "Review the Q3 totals", files: [{ id: "source", path: "E:/data/q3.csv" }] },
			mapOutput: { files: [{ id: "summary", path: "E:/results/actual-q3.md" }] },
		},
		historyError: null,
	};
	const refusal = { code: "map-output-missing", message: "summary is required", stateCommitted: false };
	const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
		const path = new URL(request.url).pathname;
		const body = await request.json() as Record<string, unknown>;
		calls.push({ path, body });
		return path.endsWith("/finish") && !("mapOutput" in body) ? Response.json(refusal, { status: 409 }) : Response.json(receipt);
	} });
	const dock = await managerDock(`http://127.0.0.1:${server.port}`);
	try {
		const sessionId = await dock.nativeId();
		expect(await dock.call({ action: "finish" }, true)).toEqual(JSON.stringify(refusal));
		expect(await dock.call({ action: "finish", map_output: { files: [{ id: "summary", path: "E:/results/actual-q3.md" }] } })).toEqual(receipt);
		expect(await dock.call({ action: "status" })).toEqual(receipt);
		for (const invalid of [
			{ action: "status", map_output: { files: [] } },
			{ action: "finish", mapOutput: { files: [] } },
			{ action: "finish", map_output: { files: [{ id: "summary", path: "E:/results/actual-q3.md", executionId: "forged" }] } },
			{ action: "finish", map_output: { files: [], runId: "forged" } },
		]) expect(await dock.call(invalid, true)).toMatch(/Validation failed|parameters|不接受/);
		expect(calls).toEqual([
			{ path: "/api/workflow/manager/finish", body: { sessionId } },
			{ path: "/api/workflow/manager/finish", body: { sessionId, mapOutput: { files: [{ id: "summary", path: "E:/results/actual-q3.md" }] } } },
			{ path: "/api/workflow/manager/status", body: { sessionId } },
		]);
	} finally { await dock.close(); server.stop(true); }
}, 300_000);

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
			{ input: { action: "prepare_inputs", fileInputs: [{ id: "source", path: "E:/source.txt" }], confirmed: false, reason: "待补齐范围" }, wire: { sessionId, fileInputs: [{ id: "source", path: "E:/source.txt" }], confirmed: false, reason: "待补齐范围" } },
			{ input: { action: "prepare_inputs", fileInputs: [], confirmed: true, reason: "已审阅全部文本输入，无文件要求" }, wire: { sessionId, fileInputs: [], confirmed: true, reason: "已审阅全部文本输入，无文件要求" } },
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
			for (const extra of [{ sessionId: "forged-native" }, { runId: "forged-run" }, { executionId: "forged-execution" }, ...(input.action === "prepare_inputs" ? [] : [{ confirmed: true }]), { nodes: ["C"] }, { body: "not applicable" }]) {
				const text = await dock.call({ ...input, ...extra }, true);
				expect(calls).toHaveLength(before);
				expect({ input, extra, text }).toMatchObject({ text: expect.stringMatching(/Validation failed|parameters|不接受/) });
			}
			if (!["complete", "fail"].includes(input.action)) {
				expect(await dock.call({ ...input, nodeId: "A", reason: "不适用于无目标动作" }, true)).toMatch(/Validation failed|parameters|不接受/);
				expect(calls).toHaveLength(before);
			}
		}
		for (const input of [{ action: "complete", nodeId: "A" }, { action: "fail", reason: "missing target" },
			{ action: "prepare_inputs", fileInputs: [], reason: "missing confirmation" },
			{ action: "prepare_inputs", fileInputs: [], confirmed: "false", reason: "wrong boolean" },
			{ action: "prepare_inputs", fileInputs: [{ id: "source", path: "E:/source.txt", extra: true }], confirmed: true, reason: "nested extra" },
			{ action: "prepare_inputs", fileInputs: [{ id: "source", path: 123 }], confirmed: false, reason: "wrong path type" },
		]) {
			expect(await dock.call(input, true)).toMatch(/Validation failed|parameters|不接受/);
		}
		expect(calls).toHaveLength(examples.length);
	} finally { await dock.close(); server.stop(true); }
}, 300_000);
