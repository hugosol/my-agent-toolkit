import { expect, test } from "bun:test";
import { createServer } from "node:http";
import { registerOmpTool } from "../../adapters/omp/native/extensibility/extensions/tools";
import type { OmpExtensionApi } from "../../adapters/omp/native/extensibility/extensions/types";
import { registerPiTool } from "../../adapters/pi/native/core/extensions/tools";
import type { PiExtensionApi } from "../../adapters/pi/native/core/extensions/types";
import { MANAGER_TOOLS } from "../../extensions/workflow-chat/manager-chat/shared-logic/tools";
import type { ToolExecutionResult } from "../../framework/interface/tool";
import { businessRoles } from "../workflow-chat/support/business-roles";
import { dualRoleDock } from "../workflow-chat/support/dual-role-dock";

const business = { reason: "notification", snapshot: { id: "run-01" }, pendingReports: { build: "report-01" } };
const oldNode = { nodeId: "build", nodeName: "Build", executionId: "exec-old", status: "running", lines: ["OLD-EXECUTION"], lastOutputAt: 1_000 };
const newNode = { nodeId: "build", nodeName: "Build", executionId: "exec-new", status: "succeeded", lines: ["omit me", "start", "stdout", "stderr", "console", "PARTIAL-NEW"], lastOutputAt: 1_000 };
const otherNode = { nodeId: "check", nodeName: "Check", executionId: "exec-check", status: "failed", lines: ["OTHER-NODE"], lastOutputAt: 2_000 };

// Registration seam: capture only the external host's registration. Both actual callbacks
// render the same successive native result frames without writing widget or model content.
test("collect renders native ANSI, TSP and Pi frames in place with no visual wrapping", () => {
	const collect = MANAGER_TOOLS.find(tool => tool.name === "collect")!;
	const roles = businessRoles("http://127.0.0.1:1");
	try {
		const bound = { ...collect, execute: collect.execute.bind(undefined, { operations: roles.manager }) };
		let omp!: Parameters<OmpExtensionApi["registerTool"]>[0];
		let pi!: Parameters<PiExtensionApi["registerTool"]>[0];
		registerOmpTool({ registerTool: definition => { omp = definition; } } as OmpExtensionApi)(bound);
		registerPiTool({ registerTool: definition => { pi = definition; } } as PiExtensionApi)(bound);
		const options = { expanded: false, isPartial: true };
		const first: ToolExecutionResult = { content: [], details: { scriptOutput: {
			status: "observing", displayedAt: 4_000, snapshot: { runId: "run-01", observedAt: 4_000, nodes: [oldNode] },
		} } };
		const next: ToolExecutionResult = { content: [], details: { scriptOutput: {
			status: "observing", displayedAt: 5_000, snapshot: { runId: "run-01", observedAt: 5_000, nodes: [
				{ ...newNode, lines: ["start", "stdout", "stderr", "console", "PARTIAL-NEW" + "界".repeat(300)] }, otherNode,
			] },
		} } };
		for (const native of [omp, pi]) {
			expect(native.renderResult!(first, options).render(120)).toContain("OLD-EXECUTION");
			const rows = native.renderResult!(next, options).render(36);
			expect(rows).toHaveLength(9); // global title + two node titles + five and one log rows
			expect(rows[1]).toStartWith("succeeded · 4s since output");
			expect(rows[6]).toStartWith("PARTIAL-NEW");
			expect(rows[6]).toEndWith("…");
			expect(Bun.stringWidth(rows[6]!)).toBeLessThanOrEqual(36);
			expect(rows).toContain("OTHER-NODE");
			expect(rows.join("\n")).not.toContain("OLD-EXECUTION");
		}
		expect(omp.describeResult!(first, options)?.body[0]?.p.text).toContain("OLD-EXECUTION");
		const semantic = omp.describeResult!(next, options);
		expect(semantic?.preview).toBe("children");
		expect(semantic?.body[0]?.p).toMatchObject({ wrap: false, numbers: false });
		expect(semantic?.body[0]?.p.text.split("\n")).toHaveLength(9);
		expect(semantic?.body[0]?.p.text).toContain("PARTIAL-NEW");
		expect(semantic?.body[0]?.p.text).not.toContain("OLD-EXECUTION");
	} finally { roles.close(); }
});

// Installed-host seam: real Session + actual manager entry, HTTP exchange and provider request.
// The controlled peer only supplies application replies; it cannot write native update frames.
for (const host of ["omp", "pi"] as const) {
	test(`${host} collect updates details while pending, stops on failure, and retains its own cancelled snapshot`, async () => {
		let release = Promise.withResolvers<void>();
		let sample = 0;
		let scenario: "failure" | "cancel" | "normal" = "failure";
		let normalSettled = false;
		const observedBodies: unknown[] = [];
		const server = createServer(async (request, reply) => {
			const chunks: Buffer[] = [];
			for await (const chunk of request) chunks.push(Buffer.from(chunk));
			const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
			reply.setHeader("content-type", "application/json");
			if (request.url === "/api/workflow/manager/collect") {
				await release.promise;
				reply.end(JSON.stringify(business));
				return;
			}
			if (request.method !== "POST" || request.url !== "/api/workflow/manager/script-output") { reply.writeHead(404).end("{}"); return; }
			observedBodies.push(body);
			sample++;
			// After the retry has appeared, the next poll fails while collect remains pending.
			if (scenario === "failure" && sample >= 3) { reply.writeHead(503).end("{}"); return; }
			const nodes = scenario === "cancel" ? [{ ...newNode, executionId: "exec-cancel", lines: ["CANCEL-KEEPS-THIS"] }]
				: scenario === "normal" ? [{ ...newNode, status: normalSettled ? "succeeded" : "running", lines: [normalSettled ? "FINAL-CLEAN" : "LIVE-CLEAN"] }]
				: sample === 1 ? [oldNode] : [newNode, otherNode];
			reply.end(JSON.stringify({ runId: "run-01", observedAt: 5_000, nodes }));
		});
		const listening = Promise.withResolvers<void>();
		server.listen(0, "127.0.0.1", listening.resolve);
		await listening.promise;
		const address = server.address();
		if (!address || typeof address === "string") throw new Error("No script-output peer port");
		let closeDock: (() => Promise<void>) | undefined;
		let pending: Promise<unknown> | undefined;
		try {
			const dock = await dualRoleDock(host, `http://127.0.0.1:${address.port}`);
			closeDock = dock.close;
			const session = dock.session;
			const identity = (await session.request({ type: "get_state" })).data as { sessionId: string };
			const update = async (mark: number, literal: string) => {
				const matches = (frame: Record<string, unknown>) => frame.type === "tool_execution_update" &&
					frame.toolName === "collect" && JSON.stringify(frame.partialResult)?.includes(literal) === true;
				const frame = "frameSince" in session
					? await session.frameSince(mark, matches, literal, 10_000)
					: await session.awaitFrame(frame => session.frames().indexOf(frame) >= mark && matches(frame), literal, 10_000);
				if (!frame) throw new Error(`Missing ${host} update ${literal}`);
				const result = frame.partialResult as ToolExecutionResult;
				expect(result.content).toEqual([]);
				return { result, toolCallId: frame.toolCallId };
			};
			let mark = session.frames().length;
			const finishing = dock.call("collect", {}); pending = finishing;
			const first = await update(mark, "OLD-EXECUTION");
			const next = await update(mark, "PARTIAL-NEW");
			expect(next.toolCallId).toBe(first.toolCallId);
			expect(next.result.details).toMatchObject({ scriptOutput: { snapshot: { nodes: [
				{ executionId: "exec-new", lines: ["start", "stdout", "stderr", "console", "PARTIAL-NEW"] }, otherNode,
			] } } });
			expect(JSON.stringify(next.result.details)).not.toContain("OLD-EXECUTION");
			const stopped = await update(mark, '"status":"unavailable"');
			await Bun.sleep(1100); // More than two sampling periods, with the collect response still held.
			expect(sample).toBe(3);
			release.resolve();
			const final = await finishing; pending = undefined;
			expect(final).toMatchObject({ isError: false, body: business, details: stopped.result.details as object });
			expect(JSON.stringify(final.content)).toBe(JSON.stringify([{ type: "text", text: JSON.stringify(business) }]));
			const requests = dock.capture.requests();
			const resumed = requests[requests.length - 1]?.json;
			expect(JSON.stringify(resumed)).toContain("report-01");
			expect(JSON.stringify(resumed)).not.toMatch(/OLD-EXECUTION|PARTIAL-NEW|OTHER-NODE/);

			mark = session.frames().length; scenario = "cancel"; release = Promise.withResolvers<void>();
			const cancelling = dock.call("collect", {}); pending = cancelling;
			const renewed = await update(mark, "CANCEL-KEEPS-THIS");
			expect(JSON.stringify(renewed.result.details)).not.toContain("PARTIAL-NEW");
			expect((await session.request({ type: "abort" })).success).toBe(true);
			const cancelled = await cancelling; pending = undefined;
			expect(cancelled).toMatchObject({ isError: true, body: { error: { kind: "cancelled" } }, details: { scriptOutput: {
				status: "cancelled", snapshot: { nodes: [{ executionId: "exec-cancel", lines: ["CANCEL-KEEPS-THIS"] }] },
			} } });
			expect(JSON.stringify(cancelled.content)).not.toContain("CANCEL-KEEPS-THIS");
			const atCancel = sample;
			await Bun.sleep(650); // The child process owns the sampling clock; parent fake timers cannot drive it.
			expect(sample).toBe(atCancel);
			release.resolve();

			mark = session.frames().length; scenario = "normal"; release = Promise.withResolvers<void>();
			const normal = dock.call("collect", {}); pending = normal;
			await update(mark, "LIVE-CLEAN");
			normalSettled = true;
			release.resolve();
			const completed = await normal; pending = undefined;
			expect(completed).toMatchObject({ isError: false, body: business, details: { scriptOutput: {
				status: "finished", snapshot: { nodes: [{ status: "succeeded", lines: ["FINAL-CLEAN"] }] },
			} } });
			expect(JSON.stringify(completed.content)).toBe(JSON.stringify([{ type: "text", text: JSON.stringify(business) }]));
			const completedRequests = dock.capture.requests();
			expect(JSON.stringify(completedRequests[completedRequests.length - 1]?.json)).not.toMatch(/LIVE-CLEAN|FINAL-CLEAN|CANCEL-KEEPS-THIS/);
			expect(observedBodies).toEqual(observedBodies.map(() => ({ sessionId: identity.sessionId })));
		} finally {
			release.resolve();
			try { await pending; } finally {
				try { await closeDock?.(); } finally {
					server.closeAllConnections();
					const closed = Promise.withResolvers<void>();
					server.close(error => error ? closed.reject(error) : closed.resolve());
					await closed.promise;
				}
			}
		}
	}, 120_000);
}
