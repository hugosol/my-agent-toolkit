import { expect, test } from "bun:test";
import { ScenarioFailure } from "./support";
import { readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { PiSession, resolvePiCli, startPiRun } from "../harness-dock/pi-session";

const entrypoint = path.resolve(import.meta.dir, "../../entrypoints/pi/pi-suite.ts");

// Approved CLI/extension seam; native MCP transport, config reader, tools and /mcp stay real.
// Test-owned HTTP MCP only supplies the remote environment and independently read file results.
// Violation: replacing builtin MCP loses native_file, and not registering Suite loses suite_file.
for (const selection of ["none", "empty", "append"] as const) {
	test(`public extension ${selection} preserves builtin MCP source and real calls`, async () => {
		const installed = resolvePiCli();
		const names = selection === "append" ? ["native_file", "suite_file"] : ["native_file"];
		const code = names.map(name => `text(await tools.mcp__${name}__read_sentinel({}))`).join(";");
		const run = startPiRun({ ...installed, command: [process.execPath, installed.path] }, `suite-mcp-${selection}`, {
			provider: "suite", model: "controlled", endpoint: { toolCall: { name: "codemode", arguments: JSON.stringify({ code }) } },
		});
		const calls: string[] = [];
		const initialized: string[] = [];
		const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
			if (request.method !== "POST") return new Response(null, { status: 405 });
			const body: unknown = await request.json();
			if (!body || typeof body !== "object" || !("method" in body)) return new Response(null, { status: 400 });
			if (!("id" in body)) return new Response(null, { status: 202 });
			const route = new URL(request.url).pathname.slice(1);
			let result: unknown;
			if (body.method === "initialize") {
				initialized.push(route);
				result = { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "fixture", version: "1" } };
			} else if (body.method === "tools/list") {
				result = { tools: [{ name: "read_sentinel", description: "Read the fixture-owned file", inputSchema: { type: "object", properties: {} } }] };
			} else if (body.method === "tools/call") {
				calls.push(route);
				result = { content: [{ type: "text", text: readFileSync(path.join(run.root.workDir, `${route}.txt`), "utf8") }] };
			} else return Response.json({ jsonrpc: "2.0", id: body.id, error: { code: -32601, message: "Unknown method" } });
			return Response.json({ jsonrpc: "2.0", id: body.id, result });
		} });
		let session: PiSession | undefined;
		const failures: unknown[] = [];
		try {
			writeFileSync(path.join(run.root.workDir, "native_file.txt"), "NATIVE-MCP-FILE-113");
			writeFileSync(path.join(run.root.workDir, "suite_file.txt"), "SUITE-MCP-FILE-997");
			const nativeConfig = path.join(run.root.agentDir, "mcp.json");
			const nativeText = JSON.stringify({ mcpServers: { native_file: { url: `http://127.0.0.1:${server.port}/native_file`, exposure: "direct" } } });
			writeFileSync(nativeConfig, nativeText);
			const config = path.join(run.root.path, "suite.json");
			writeFileSync(config, JSON.stringify({ version: 1, codemode: "on", mcpServers: selection === "append" ? {
				suite_file: { url: `http://127.0.0.1:${server.port}/suite_file`, exposure: "direct" },
			} : {} }));
			session = await PiSession.start({ cli: run.cli, runRoot: run.root, selector: run.selector, nativeMcp: true,
				entrypoint: ["builtin:mcp", ...(selection === "none" ? ["builtin:codemode"] : []), entrypoint],
				extraArgs: ["--tools", "+codemode"], env: { PI_SUITE_CONFIG: selection === "none" ? undefined : config } });
			await session.run("Read fixture files via codemode.");
			expect(initialized.sort()).toEqual(names);
			expect(calls.sort()).toEqual(names);
			const second = run.capture.requests()[1]?.json;
			if (!second || typeof second !== "object" || !("messages" in second) || !Array.isArray(second.messages)) throw new Error("No tool continuation");
			const output = second.messages.filter((message: unknown) => message && typeof message === "object" && "role" in message && message.role === "tool");
			expect(JSON.stringify(output)).toContain("NATIVE-MCP-FILE-113");
			if (selection === "append") expect(JSON.stringify(output)).toContain("SUITE-MCP-FILE-997");
			const mark = session.frameMark();
			await session.run("/mcp");
			const status = session.notificationsSince(mark).join("\n");
			// Pi's noninteractive /mcp prints state, not the TUI's source field. Source
			// preservation is observed by consuming the native-only endpoint from mcp.json
			// and checking that same file is unchanged; do not invent an RPC source field.
			expect(status).toBe(selection === "append"
				? "native_file: connected, 1 tools (direct)\nsuite_file: connected, 1 tools (direct)"
				: "native_file: connected, 1 tools (direct)");
			expect(readFileSync(nativeConfig, "utf8")).toBe(nativeText);
		} catch (error) { failures.push(error); }
		try { if (session) { const exit = await session.stop(); if (exit.timedOut || exit.exitCode !== 0) throw new Error(JSON.stringify(exit)); } } catch (error) { failures.push(error); }
		run.capture.stop(); await server.stop(true); run.root.dispose();
		if (failures.length) throw new ScenarioFailure(failures);
	}, 120_000);
}
