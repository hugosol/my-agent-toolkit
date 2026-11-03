import { expect, test } from "bun:test";
import { ScenarioFailure } from "./support";
import { writeFileSync } from "node:fs";
import * as path from "node:path";
import { PiSession, resolvePiCli, startPiRun } from "../harness-dock/pi-session";

const entrypoint = path.resolve(import.meta.dir, "../../entrypoints/pi/pi-suite.ts");

// Same approved public CLI seam. Literal expected declarations come from Pi's four native
// file/shell tools. Violation: ignoring an explicit `on` leaves native `only` in force.
// Existing implementation should already satisfy this criterion; verify rather than force red.
test("Suite on overrides native only and activates codemode alongside native tools", async () => {
	const installed = resolvePiCli();
	const run = startPiRun({ ...installed, command: [process.execPath, installed.path] }, "suite-on", { provider: "suite", model: "controlled" });
	let session: PiSession | undefined;
	const failures: unknown[] = [];
	try {
		writeFileSync(path.join(run.root.agentDir, "settings.json"), JSON.stringify({ codemode: { mode: "only" } }));
		const config = path.join(run.root.path, "suite.json");
		writeFileSync(config, JSON.stringify({ version: 1, codemode: "on", mcpServers: {} }));
		session = await PiSession.start({ cli: run.cli, runRoot: run.root, selector: run.selector, entrypoint,
			extraArgs: ["--pi-suite-config", config] });
		await session.run("Observe tools.");
		const request = run.capture.requests()[0]?.json;
		if (!request || typeof request !== "object" || !("tools" in request) || !Array.isArray(request.tools)) throw new Error("No model tools");
		const names = request.tools.map((tool: unknown) => {
			if (!tool || typeof tool !== "object" || !("function" in tool) || !tool.function || typeof tool.function !== "object" || !("name" in tool.function)) throw new Error("Invalid model tool");
			return tool.function.name;
		});
		expect(names).toEqual(["read", "bash", "edit", "write", "codemode"]);
	} catch (error) { failures.push(error); }
	try { if (session) { const exit = await session.stop(); if (exit.timedOut || exit.exitCode !== 0) throw new Error(JSON.stringify(exit)); } } catch (error) { failures.push(error); }
	run.capture.stop(); run.root.dispose();
	if (failures.length) throw new ScenarioFailure(failures);
}, 120_000);

// A native baseline and fixed-extension launch must be indistinguishable without Suite.
// Both native modes are used, so a hidden default-mode override cannot pass this comparison.
for (const mode of ["on", "only"] as const) {
	test(`without Suite the fixed entry preserves native ${mode} declarations`, async () => {
		const declarations: unknown[] = [];
		for (const includeSuite of [false, true]) {
			const installed = resolvePiCli();
			const run = startPiRun({ ...installed, command: [process.execPath, installed.path] }, "suite-inert", { provider: "suite", model: "controlled" });
			let session: PiSession | undefined;
			const failures: unknown[] = [];
			try {
				writeFileSync(path.join(run.root.agentDir, "settings.json"), JSON.stringify({ codemode: { mode } }));
				session = await PiSession.start({ cli: run.cli, runRoot: run.root, selector: run.selector,
					entrypoint: ["builtin:codemode", ...(includeSuite ? [entrypoint] : [])],
					extraArgs: ["--tools", "+codemode"] });
				await session.run("Observe native tools.");
				const request = run.capture.requests()[0]?.json;
				if (!request || typeof request !== "object") throw new Error(`No model request: ${session.diagnostics()}`);
				// Tool descriptions include the installed documentation path, identical for both launches.
				declarations.push("tools" in request ? request.tools : undefined);
			} catch (error) { failures.push(error); }
			try { if (session) { const exit = await session.stop(); if (exit.timedOut || exit.exitCode !== 0) throw new Error(JSON.stringify(exit)); } } catch (error) { failures.push(error); }
			run.capture.stop(); run.root.dispose();
			if (failures.length) throw new ScenarioFailure(failures);
		}
		expect(declarations[1]).toEqual(declarations[0]);
	}, 120_000);
}
