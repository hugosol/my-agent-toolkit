import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
function run(script: string, ...args: string[]) {
	return spawnSync(process.execPath, [resolve(root, "scripts", script), ...args], { cwd: root, encoding: "utf8", timeout: 90_000 });
}

describe("integration command contract", () => {
	test("lists model-cost demand without a target entry or executing configuration", () => {
		const result = run("check-adapter-integrations.ts", "--extension", "model-cost", "--demand-only", "--json");
		expect(result.error).toBeUndefined();
		const report = JSON.parse(result.stdout);
		expect(report.stage).toBe("integration-contracts");
		expect(report.behaviorTestsRun).toBe(false);
		const demand = report.results[0];
		expect(demand.adapter).toBeUndefined();
		expect(demand.contracts.find((item: { id: string }) => item.id === "port:onTurn")).toMatchObject({ requirement: "required" });
		expect(demand.contracts.find((item: { id: string }) => item.id === "port:nextTask")).toMatchObject({ requirement: "required" });
		expect(demand.contracts.find((item: { id: string }) => item.id === "port:onTurn").origins[0]).toMatchObject({ file: expect.stringContaining("extensions/model-cost/"), line: expect.any(Number) });
	});

	test("missing adapter is a located dependency gap, not an invocation failure", () => {
		const result = run("check-adapter-integrations.ts", "--extension", "codebase-tools", "--adapter", "integration-cli-absent-harness", "--json");
		expect(result.error).toBeUndefined();
		expect(result.status).toBe(1);
		const report = JSON.parse(result.stdout);
		expect(report.complete).toBe(false);
		expect(report.results[0].contracts.find((item: { id: string }) => item.id === "port:onSession").supply.status).toBe("missing");
	});

	test("generation requires explicit source and target selection", () => {
		const result = run("generate-adapter-integrations.ts", "--json");
		expect(result.status).toBe(2);
		expect(JSON.parse(result.stdout)).toMatchObject({ complete: false, error: expect.stringContaining("--extension") });
	});

	test("generation preview never creates the target adapter", () => {
		const adapter = `integration-preview-${process.pid}`;
		const target = resolve(root, "adapters", adapter);
		expect(existsSync(target)).toBe(false);
		const result = run("generate-adapter-integrations.ts", "--extension", "codebase-tools", "--adapter", adapter, "--dry-run", "--json");
		expect(result.error).toBeUndefined();
		const report = JSON.parse(result.stdout);
		expect(report.dryRun).toBe(true);
		expect(existsSync(target)).toBe(false);
		expect(report.generatedContracts).toContain("port:onSession");
	});
});
