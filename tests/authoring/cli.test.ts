import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const command = resolve(dirname(fileURLToPath(import.meta.url)), "../../scripts/check-authoring.ts");
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture(source: string): string {
	const root = mkdtempSync(join(tmpdir(), "authoring-cli-"));
	roots.push(root);
	for (const directory of ["framework/interface/details", "extensions/example"]) mkdirSync(join(root, directory), { recursive: true });
	writeFileSync(join(root, "framework/interface/details/implementation.ts"), "export function defineImplementation<T>(declaration: T): T { return declaration; }\n");
	writeFileSync(join(root, "framework/interface/index.ts"), 'export { defineImplementation } from "./details/implementation";\n');
	writeFileSync(join(root, "extensions/example/implementation.ts"), source);
	return root;
}

function run(...args: string[]) {
	return spawnSync(process.execPath, [command, ...args], { encoding: "utf8", timeout: 30_000 });
}

describe("authoring CLI gate", () => {
	test("returns success for a static declaration without executing its business state", () => {
		const root = fixture(`import { defineImplementation } from "../../framework/interface";
export const implementation = defineImplementation({
  create: () => { throw new Error("must never execute"); },
  subscriptions: [{ scope: "session", events: { turn_end: () => {} } }],
});`);
		const result = run("--root", root, "--json");
		expect(result.error).toBeUndefined();
		expect(result.status).toBe(0);
		const report = JSON.parse(result.stdout);
		expect(report.complete).toBe(true);
		expect(report.diagnostics).toEqual([]);
		expect(report.declarationsChecked).toBe(1);
	});

	test("returns failure and machine-readable source diagnostics for dynamic scope", () => {
		const root = fixture(`import { defineImplementation } from "../../framework/interface";
declare function chooseScope(): "session" | "owner";
export const implementation = defineImplementation({
  create: () => ({}),
  subscriptions: [{ scope: chooseScope(), events: { turn_end: () => {} } }],
});`);
		const result = run("--root", root, "--json");
		expect(result.error).toBeUndefined();
		expect(result.status).toBe(1);
		const report = JSON.parse(result.stdout);
		expect(report.complete).toBe(false);
		const diagnostic = report.diagnostics.find((item: { ruleId: string }) => item.ruleId === "authoring/static-scope");
		expect(diagnostic).toMatchObject({ file: "extensions/example/implementation.ts", line: 5 });
		expect(diagnostic.suggestion).toEqual(expect.any(String));
	});

	test("does not turn a missing input file into a clean scan", () => {
		const root = fixture("export {};\n");
		const result = run("--root", root, "--json", "extensions/missing.ts");
		expect(result.status).toBe(2);
		expect(JSON.parse(result.stdout)).toMatchObject({ complete: false, error: expect.stringContaining("missing.ts") });
	});
});
