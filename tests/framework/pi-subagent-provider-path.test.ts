import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "bun:test";
import { loadPiSubagentProvider } from "../../adapters/pi/subagent/internal/provider";
import { createPiSubagentIntegration } from "../../adapters/pi/subagent/integration";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(config: string, source = "export function registerRequiredChildExtensions() { return { dispose() {} }; }") {
	const root = mkdtempSync(join(tmpdir(), "pi-provider-path-"));
	roots.push(root);
	const packageRoot = join(root, "provider");
	mkdirSync(packageRoot);
	writeFileSync(join(packageRoot, "package.json"), JSON.stringify({
		name: "pi-subagents", type: "module",
		exports: { "./required-child-extensions": "./public.js" },
	}));
	writeFileSync(join(packageRoot, "public.js"), source);
	const configPath = join(root, "config.yaml");
	writeFileSync(configPath, config.split("$ROOT").join(packageRoot.split("\\").join("/")));
	return { root, configPath, packageRoot };
}

test("loads the public export from an absolute configured package root", async () => {
	const { configPath } = fixture('pi:\n  subagents:\n    packagePath: "$ROOT"\n');
	const loaded = await loadPiSubagentProvider(configPath) as Record<string, unknown>;
	expect(typeof loaded.registerRequiredChildExtensions).toBe("function");
});

test("resolves a relative package root against the config file, not cwd", async () => {
	const { configPath } = fixture("pi:\n  subagents:\n    packagePath: ./provider\n");
	const loaded = await loadPiSubagentProvider(configPath) as Record<string, unknown>;
	expect(typeof loaded.registerRequiredChildExtensions).toBe("function");
});

for (const config of [
	"pi: false",
	"pi:\n  subagents: []",
	"pi:\n  subagents:\n    packagePath: 42",
	'pi:\n  subagents:\n    packagePath: ""',
	"pi:\n  subagents:\n    packagePath: ./missing",
]) {
	test(`invalid explicit configuration fails without dependency fallback: ${JSON.stringify(config)}`, async () => {
		const { configPath } = fixture(config);
		await expect(loadPiSubagentProvider(configPath)).rejects.toThrow();
		const integration = createPiSubagentIntegration("test", import.meta.path, configPath);
		const answer = await integration.settle("test-session");
		expect(answer.mode).toBe("failed");
		if (answer.mode === "failed") expect(answer.failure).toBe("registration");
		integration.releaseAll();
	});
}

test("rejects the wrong package rather than resolving another installation", async () => {
	const { configPath, packageRoot } = fixture("pi:\n  subagents:\n    packagePath: ./provider");
	writeFileSync(join(packageRoot, "package.json"), '{"name":"other-package"}');
	await expect(loadPiSubagentProvider(configPath)).rejects.toThrow("package name must be pi-subagents");
});

test("rejects an incompatible public export", async () => {
	const { configPath } = fixture("pi:\n  subagents:\n    packagePath: ./provider", "export const unrelated = true;");
	await expect(loadPiSubagentProvider(configPath)).rejects.toThrow("registerRequiredChildExtensions");
});

test("rejects a broken explicit package module instead of answering no provider", async () => {
	const { configPath } = fixture("pi:\n  subagents:\n    packagePath: ./provider", "throw new Error('broken-provider');");
	await expect(loadPiSubagentProvider(configPath)).rejects.toThrow("broken-provider");
});

test("an omitted path keeps normal dependency resolution", async () => {
	const { configPath } = fixture("pi:\n  subagents: {}");
	// Whether installed or absent, an optional unconfigured dependency does not reject.
	await loadPiSubagentProvider(configPath);
});

test("a malformed configuration document is surfaced as an integration failure", async () => {
	const { configPath } = fixture("pi: [");
	const integration = createPiSubagentIntegration("test", import.meta.path, configPath);
	expect((await integration.settle("test-session")).mode).toBe("failed");
	integration.releaseAll();
});
