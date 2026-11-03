import { expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import * as path from "node:path";
import { PiSession, resolvePiCli, startPiRun } from "../harness-dock/pi-session";
import { ScenarioFailure } from "./support";

// Factory-time errors must reject the real CLI load, not silently behave like no Suite.
// The production validation already exists; verify its behavior at the approved startup seam.
for (const fixture of [
	{ label: "relative path", config: "relative.json", expected: "--pi-suite-config must be an absolute file path" },
	{ label: "missing file", config: undefined, expected: "ENOENT" },
	{ label: "implicit mode", document: { version: 1, mcpServers: {} }, expected: "codemode: on|only" },
	{ label: "invalid native MCP", document: { version: 1, codemode: "on", mcpServers: { bad: { command: 17 } } }, expected: "Invalid MCP server" },
] as const) {
	test(`factory channel rejects ${fixture.label} before model traffic`, async () => {
		const installed = resolvePiCli();
		const run = startPiRun({ ...installed, command: [process.execPath, installed.path] }, "suite-invalid", { provider: "suite", model: "controlled" });
		let session: PiSession | undefined;
		const failures: unknown[] = [];
		try {
			const config = "config" in fixture && fixture.config ? fixture.config : path.join(run.root.path, "suite.json");
			if ("document" in fixture) writeFileSync(config, JSON.stringify(fixture.document));
			let rejection: unknown;
			try {
				session = await PiSession.start({ cli: run.cli, runRoot: run.root, selector: run.selector,
					entrypoint: path.resolve(import.meta.dir, "../../entrypoints/pi/pi-suite.ts"), extraArgs: ["--pi-suite-config", config] });
			} catch (error) { rejection = error; }
			expect(String(rejection)).toContain(fixture.expected);
			expect(run.capture.requests()).toEqual([]);
		} catch (error) { failures.push(error); }
		try { if (session) { const exit = await session.stop(); if (exit.timedOut || exit.exitCode !== 0) throw new Error(JSON.stringify(exit)); } } catch (error) { failures.push(error); }
		run.capture.stop(); run.root.dispose();
		if (failures.length) throw new ScenarioFailure(failures);
	}, 120_000);
}
