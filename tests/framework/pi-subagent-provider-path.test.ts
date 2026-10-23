import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type { piAdapter } from "../../adapters/pi";
import { boundPiSurface, PROVIDER_READY_CHANNEL } from "./support/pi-surface-double";
import { withCapturedStderrAsync } from "./support/captured-stderr";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "bun:test";
import { loadPiSubagentProvider } from "../../adapters/pi/thirdParty/pi-subagents/provider";
import { createPiSubagentIntegration } from "../../adapters/pi/thirdParty/pi-subagents/integration";

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

/**
 * S1/P11: an explicit provider configuration is authoritative at the public assembly, not only at
 * the loader. A plausible regression is loading the repository dependency after an explicit failure.
 * Each real adapter graph reads its own deployed config; the external provider is controlled, while
 * configuration resolution, registration, settlement and extension initialization remain real.
 */
async function deployedAdapter(config: string): Promise<typeof piAdapter> {
	const { root } = fixture(config);
	const repository = join(import.meta.dir, "../..");
	for (const directory of ["adapters", "framework"]) {
		cpSync(join(repository, directory), join(root, directory), {
			recursive: true,
			filter: source => !source.includes(".runtime"),
		});
	}
	// Only YAML is installed here: no accidental pi-subagents dependency can mask true absence.
	mkdirSync(join(root, "node_modules"), { recursive: true });
	cpSync(join(repository, "node_modules/yaml"), join(root, "node_modules/yaml"), { recursive: true });
	writeFileSync(join(root, "framework/config.yaml"), `runtimeDir: .runtime\n${config}\n`);
	const loaded = await import(pathToFileURL(join(root, "adapters/pi/index.ts")).href);
	return loaded.piAdapter;
}

for (const [label, config, expected] of [
	["relative configured public export", "pi:\n  subagents:\n    packagePath: ../provider", { mode: "subagents" }],
	["absent optional artifact", "pi:\n  subagents: {}", { mode: "none" }],
	["invalid explicit shape", "pi: false", { mode: "failed", failure: "registration" }],
	["missing explicit package", "pi:\n  subagents:\n    packagePath: ../missing", { mode: "failed", failure: "registration" }],
] as const) {
	test(`public assembly preserves ${label}`, async () => {
		const adapter = await deployedAdapter(config);
		const session = { sessionId: `public-provider-${label}`, idle: true, pending: false };
		const { value: delivery, stderr } = await withCapturedStderrAsync(async () => {
			const surface = boundPiSurface({ adapter, childEntry: import.meta.path });
			surface.bus.publish(PROVIDER_READY_CHANNEL, { version: 1, session: { sessionId: session.sessionId } });
			surface.sessionStarts(session, "startup");
			const initialized = await surface.initialized();
			await surface.sessionShutsDown(session, "quit");
			return initialized;
		});
		expect(delivery.subagents).toMatchObject(expected);
		if (delivery.subagents.mode === "failed") expect(stderr).toContain(delivery.subagents.diagnosis);
		else expect(stderr).toBe("");
	});
}
