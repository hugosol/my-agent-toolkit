import { expect, test } from "bun:test";
import { ScenarioFailure } from "./support";
import { readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { PiSession, resolvePiCli, startPiRun } from "../harness-dock/pi-session";

const entrypoint = path.resolve(import.meta.dir, "../../entrypoints/pi/pi-suite.ts");
function object(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected protocol object");
	return value as Record<string, unknown>;
}
function array(value: unknown): unknown[] {
	if (!Array.isArray(value)) throw new Error("Expected protocol array");
	return value;
}
function toolNames(request: unknown): unknown[] {
	return array(object(request).tools).map(tool => object(object(tool).function).name);
}
function toolOutput(request: unknown): string {
	return array(object(request).messages).filter(message => object(message).role === "tool")
		.map(message => String(object(message).content)).join("\n");
}

// Approved seam: actual public extension loaded by the installed Pi CLI, observed at its
// model request. Source: ticket's explicit only mode + native file-tool requirement.
// Violation: leaving the original `on` mode or deactivating the backing read tool would
// either expose read directly, or prevent the second request from carrying the literal file.
test("Suite only overrides native on and reads a real file through codemode", async () => {
	const installed = resolvePiCli();
	// Exercise the installed CLI bundle, not a source checkout. Bun avoids the Windows Node
	// libuv crash on EOF after QuickJS worker use (the Node failure remains reported separately).
	const cli = { ...installed, command: [process.execPath, installed.path] };
	const run = startPiRun(cli, "pi-suite-only", {
		provider: "suite-fixture", model: "controlled",
		endpoint: { toolCall: { name: "codemode", arguments: JSON.stringify({ code: 'text(await tools.read({path:"sentinel.txt"}))' }) } },
	});
	let session: PiSession | undefined;
	let failure: unknown;
	try {
		writeFileSync(path.join(run.root.workDir, "sentinel.txt"), "SUITE-ONLY-REAL-FILE-731\n");
		writeFileSync(path.join(run.root.agentDir, "settings.json"), JSON.stringify({ codemode: { mode: "on" } }));
		const config = path.join(run.root.path, "suite config.json");
		writeFileSync(config, JSON.stringify({ version: 1, codemode: "only", mcpServers: {} }));
		session = await PiSession.start({ cli: run.cli, runRoot: run.root, selector: run.selector,
			entrypoint, env: { PI_SUITE_CONFIG: config } });
		await session.run("Read sentinel.txt using codemode.");
		const requests = run.capture.requests().map(request => request.json);
		expect(toolNames(requests[0])).toEqual(["codemode"]);
		expect(toolOutput(requests[1]))
			.toContain("SUITE-ONLY-REAL-FILE-731");
		expect(readFileSync(path.join(run.root.workDir, "sentinel.txt"), "utf8")).toBe("SUITE-ONLY-REAL-FILE-731\n");
	} catch (error) { failure = error; }
	const cleanup: unknown[] = [];
	try { if (session) { const exit = await session.stop(); if (exit.timedOut || exit.exitCode !== 0) throw new Error(`Pi cleanup: ${JSON.stringify(exit)}`); } } catch (error) { cleanup.push(error); }
	run.capture.stop();
	run.root.dispose();
	if (failure || cleanup.length) throw new ScenarioFailure([...(failure ? [failure] : []), ...cleanup]);
}, 120_000);
