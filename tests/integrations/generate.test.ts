import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript-compiler";
import { analyzeSupply } from "../../scripts/integrations/supply";
import { generateAdapter } from "../../scripts/integrations/generate";
import type { GenerationOptions, IntegrationContract, SupplyResult } from "../../scripts/integrations/model";
import {
	FULL_ADAPTER,
	MISSING_BINDING_ADAPTER,
	MISSING_DELIVERY_ADAPTER,
	cleanupContractRoots,
	createContractRoot,
	deliveryContract,
	portContract,
	writeFixture,
} from "./contract-fixtures";

afterEach(cleanupContractRoots);

function supplyOf(root: string, adapter: string, contracts: IntegrationContract[]): SupplyResult {
	return analyzeSupply({ root, adapter, contracts });
}

function generate(options: GenerationOptions) {
	return generateAdapter(options);
}

function compilerOptions(): ts.CompilerOptions {
	return {
		target: ts.ScriptTarget.ES2020,
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		strict: true,
		noEmit: true,
		skipLibCheck: true,
		allowJs: false,
		checkJs: false,
		types: [],
	};
}

function compileDiagnostics(root: string, file: string): readonly ts.Diagnostic[] {
	const program = ts.createProgram({ rootNames: [path.join(root, file)], options: compilerOptions() });
	return ts.getPreEmitDiagnostics(program);
}

function diagnosticCodes(diagnostics: readonly ts.Diagnostic[]): number[] {
	return diagnostics.map(item => item.code);
}

describe("missing implementation generation", () => {
	test("refuses a target outside the project adapters tree before writing", () => {
		const root = createContractRoot();
		const adapter = path.join(root, "..", `${path.basename(root)}-outside`);
		const contracts = [portContract("onSession")];
		try {
			const result = generate({ root, adapter, contracts, supply: supplyOf(root, adapter, contracts) });
			expect(result.diagnostics.some(item => item.code === "supply/adapter-target")).toBe(true);
			expect(result.files).toEqual([]);
			expect(existsSync(adapter)).toBe(false);
		} finally {
			rmSync(adapter, { recursive: true, force: true });
		}
	});
	test("dry run leaves the filesystem untouched and selects the missing required contract", () => {
		const root = createContractRoot();
		const contracts = [portContract("onSession"), portContract("onDisposal", "optional")];
		const supply = supplyOf(root, "fresh", contracts);
		const result = generate({ root, adapter: "fresh", contracts, supply, dryRun: true });
		expect(result.diagnostics).toEqual([]);
		expect(result.generatedContracts).toContain("port:onSession");
		expect(result.generatedContracts).not.toContain("port:onDisposal");
		expect(existsSync(path.join(root, "adapters/fresh/internal/port.ts"))).toBe(false);
	});

	test("include-optional selects the optional contract that is otherwise left absent", () => {
		const root = createContractRoot();
		const contracts = [portContract("onSession"), portContract("onDisposal", "optional")];
		const supply = supplyOf(root, "fresh", contracts);
		const without = generate({ root, adapter: "fresh", contracts, supply, dryRun: true });
		const withOptional = generate({ root, adapter: "fresh", contracts, supply, dryRun: true, includeOptional: true });
		expect(without.generatedContracts).not.toContain("port:onDisposal");
		expect(withOptional.generatedContracts).toContain("port:onDisposal");
	});

	test("generated port assembly fails compilation until the user supplies the implementation exports", () => {
		const root = createContractRoot();
		const contracts = [portContract("onSession")];
		const supply = supplyOf(root, "fresh", contracts);
		const result = generate({ root, adapter: "fresh", contracts, supply });
		expect(result.diagnostics).toEqual([]);
		const generatedFile = "adapters/fresh/internal/port.ts";
		expect(existsSync(path.join(root, generatedFile))).toBe(true);

		const missing = compileDiagnostics(root, generatedFile);
		expect(diagnosticCodes(missing)).toContain(2307);

		writeFixture(root, "adapters/fresh/internal/missing-implementations.ts", PORT_IMPLEMENTATIONS);
		const supplied = compileDiagnostics(root, generatedFile);
		expect(supplied).toEqual([]);
	});

	test("selected port contracts include their canonical payload obligations without a direct extension read", () => {
		const root = createContractRoot();
		writeFixture(root, "adapters/fixture/internal/port.ts", MISSING_DELIVERY_ADAPTER);
		const contracts = [portContract("onRound")];
		const supply = supplyOf(root, "fixture", contracts);
		expect(supply.supplies[0]?.status).toBe("missing");
		const result = generate({ root, adapter: "fixture", contracts, supply });
		expect(result.diagnostics).toEqual([]);
		expect(result.generatedContracts).toContain("port:onRound");
		expect(diagnosticCodes(compileDiagnostics(root, "adapters/fixture/internal/port.ts"))).toContain(2307);
		writeFixture(root, "adapters/fixture/internal/missing-implementations.ts", DELIVERY_IMPLEMENTATION);
		expect(compileDiagnostics(root, "adapters/fixture/internal/port.ts")).toEqual([]);
		expect(supplyOf(root, "fixture", contracts).supplies[0]?.status).toBe("provided");
	});

	test("a concrete missing delivery member gets a missing export and compiles once implemented", () => {
		const root = createContractRoot();
		writeFixture(root, "adapters/fixture/internal/port.ts", MISSING_DELIVERY_ADAPTER);
		const contracts = [deliveryContract("round.feedback.notify")];
		const supply = supplyOf(root, "fixture", contracts);
		expect(supply.supplies[0]?.status).toBe("missing");
		const result = generate({ root, adapter: "fixture", contracts, supply });
		expect(result.diagnostics).toEqual([]);
		expect(result.generatedContracts).toContain("delivery:round.feedback.notify");
		expect(existsSync(path.join(root, "adapters/fixture/internal/missing-delivery-contracts.ts"))).toBe(true);

		const generatedFile = "adapters/fixture/internal/port.ts";
		const missing = compileDiagnostics(root, generatedFile);
		expect(diagnosticCodes(missing)).toContain(2307);

		const updated = readFileSync(path.join(root, generatedFile), "utf8");
		const stillMissing = supplyOf(root, "fixture", contracts);
		expect(stillMissing.supplies[0]?.status).toBe("missing");
		const repeated = generate({ root, adapter: "fixture", contracts, supply: stillMissing });
		expect(repeated.files).toEqual([]);
		expect(readFileSync(path.join(root, generatedFile), "utf8")).toBe(updated);

		writeFixture(root, "adapters/fixture/internal/missing-implementations.ts", DELIVERY_IMPLEMENTATION);
		const supplied = compileDiagnostics(root, generatedFile);
		expect(supplied).toEqual([]);
		expect(supplyOf(root, "fixture", contracts).supplies[0]?.status).toBe("provided");
	});

	test("keeps existing provided bindings runnable and only adds the missing one", async () => {
		const root = createContractRoot();
		writeFixture(root, "adapters/fixture/internal/port.ts", MISSING_BINDING_ADAPTER);
		const contracts = [portContract("onTurn")];
		const supply = supplyOf(root, "fixture", contracts);
		const result = generate({ root, adapter: "fixture", contracts, supply });
		expect(result.diagnostics).toEqual([]);

		writeFixture(root, "adapters/fixture/internal/missing-implementations.ts", TURN_IMPLEMENTATION);
		const target = path.join(root, "adapters/fixture/internal/port.ts");
		const diagnostics = compileDiagnostics(root, "adapters/fixture/internal/port.ts");
		expect(diagnostics).toEqual([]);

		// The generated module lives under a per-test temporary root, so its path is selected at runtime.
		const module = await import(`${pathToFileURL(target).href}?test=${Date.now()}`);
		expect(typeof module.TEST_PORT.bindings.reportDiagnostic).toBe("function");
		expect(typeof module.TEST_PORT.bindings.onSession).toBe("function");
		expect(typeof module.TEST_PORT.bindings.onTurn).toBe("function");

		const before = readFileSync(target, "utf8");
		const secondSupply = supplyOf(root, "fixture", contracts);
		const second = generate({ root, adapter: "fixture", contracts, supply: secondSupply });
		expect(second.files).toEqual([]);
		expect(readFileSync(target, "utf8")).toBe(before);
	});

	test("does not turn conditional supply into a missing implementation", () => {
		const root = createContractRoot();
		writeFixture(root, "adapters/fixture/internal/port.ts", FULL_ADAPTER);
		const target = path.join(root, "adapters/fixture/internal/port.ts");
		const before = readFileSync(target, "utf8");
		const contracts = [portContract("subagentIntegration")];
		const supply = supplyOf(root, "fixture", contracts);
		const result = generate({ root, adapter: "fixture", contracts, supply });
		expect(result.files).toEqual([]);
		expect(result.diagnostics.some(item => item.code === "generate/conditional-required")).toBe(true);
		expect(readFileSync(target, "utf8")).toBe(before);
	});

	test("does not overwrite an existing user-owned adapter source", () => {
		const root = createContractRoot();
		const target = path.join(root, "adapters/user/internal/port.ts");
		const source = "export const userOwned = true;\n";
		writeFixture(root, "adapters/user/internal/port.ts", source);
		const contracts = [portContract("onSession")];
		const supply = supplyOf(root, "user", contracts);
		const result = generate({ root, adapter: "user", contracts, supply });
		expect(result.files).toEqual([]);
		expect(result.diagnostics.some(item => item.code === "generate/unrecognized-adapter")).toBe(true);
		expect(readFileSync(target, "utf8")).toBe(source);
	});
});

const PORT_IMPLEMENTATIONS = `import type { HarnessPort } from "../../../framework/runtime/port";

export const createSetLabel = (_context: unknown): HarnessPort["setLabel"] => (..._args: unknown[]) => {};
export const createReportDiagnostic = (_context: unknown): HarnessPort["reportDiagnostic"] => (..._args: unknown[]) => {};
export const createOnSession = (_context: unknown): HarnessPort["onSession"] => (..._args: unknown[]) => {};
export const createOnRound = (_context: unknown): HarnessPort["onRound"] => (..._args: unknown[]) => {};
export const createOnSessionContext = (_context: unknown): HarnessPort["onSessionContext"] => (..._args: unknown[]) => {};
export const createNextTask = (_context: unknown): HarnessPort["nextTask"] => (..._args: unknown[]) => {};
export const createOnRunInitiation = (_context: unknown): HarnessPort["onRunInitiation"] => (..._args: unknown[]) => {};
export const createOnTurn = (_context: unknown): HarnessPort["onTurn"] => (..._args: unknown[]) => {};
export const createOnUserInput = (_context: unknown): HarnessPort["onUserInput"] => (..._args: unknown[]) => {};
export const createRegisterCommand = (_context: unknown): HarnessPort["registerCommand"] => (..._args: unknown[]) => {};
`;

const DELIVERY_IMPLEMENTATION = `import type { AdapterDeliveryMap } from "../../../framework/runtime/adapter-authoring";

export const missingRoundFeedback: AdapterDeliveryMap["round"]["feedback"] = { notify: () => {} };
`;

const TURN_IMPLEMENTATION = `import type { HarnessPort } from "../../../framework/runtime/port";

export const createOnTurn = (_context: unknown): HarnessPort["onTurn"] => (..._args: unknown[]) => {};
`;
