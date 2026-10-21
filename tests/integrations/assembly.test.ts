import { afterEach, describe, expect, test } from "bun:test";
import { analyzeSupply } from "../../scripts/integrations/supply";
import type { IntegrationContract, SupplyResult } from "../../scripts/integrations/model";
import {
	cleanupContractRoots,
	createContractRoot,
	deliveryContract,
	frameworkContract,
	portContract,
	writeFixture,
} from "./contract-fixtures";

afterEach(cleanupContractRoots);

const WITNESS_ADAPTER = `import { defineAdapterPort } from "../../framework/runtime/adapter-authoring";
import type { AdapterFactory } from "../../framework/runtime/adapter-authoring";
import type { HarnessPort, SubagentIntegration } from "../../framework/runtime/port";

export interface WitnessOptions {
	readonly childEntry?: string;
}

type WitnessPort<Options extends WitnessOptions> = HarnessPort & (
	Options extends { readonly childEntry: string }
		? { readonly subagentIntegration: () => SubagentIntegration | Promise<SubagentIntegration> }
		: { readonly subagentIntegration?: undefined }
);

type WitnessHost = (host: unknown) => void;

export interface WitnessContext {
	readonly enabled: boolean;
}

export const WITNESS_PORT = defineAdapterPort<WitnessContext>({
	subagentIntegration: context => context.enabled ? () => ({ state: "ready" as const }) : undefined,
});

export function witnessAdapter<Options extends WitnessOptions>(
	definition: unknown,
	options: Options,
): AdapterFactory<WitnessPort<Options>, WitnessHost> {
	throw new Error("contract fixture adapters must never execute");
}

export function dynamicAdapter(
	definition: unknown,
	options: WitnessOptions,
): AdapterFactory<HarnessPort, WitnessHost> {
	throw new Error("contract fixture adapters must never execute");
}

export function plainAdapter(definition: unknown, options: WitnessOptions): WitnessHost {
	throw new Error("contract fixture adapters must never execute");
}

export function anyAdapter(definition: unknown, options: WitnessOptions) {
	return JSON.parse("null");
}

export function overloadedAdapter(
	definition: unknown,
	options: { readonly childEntry: string },
): AdapterFactory<WitnessPort<{ readonly childEntry: string }>, WitnessHost>;
export function overloadedAdapter(
	definition: unknown,
	options: { readonly childEntry?: undefined },
): AdapterFactory<WitnessPort<{ readonly childEntry?: undefined }>, WitnessHost>;
export function overloadedAdapter(
	definition: unknown,
	options: WitnessOptions,
): AdapterFactory<WitnessPort<WitnessOptions>, WitnessHost> {
	throw new Error("contract fixture adapters must never execute");
}

export interface WitnessNativeApi {
	on(event: "message_end", handler: (event: unknown) => void): () => void;
}

export function witnessNativeApi(): WitnessNativeApi {
	throw new Error("contract fixture adapters must never execute");
}
`;

const MASKED_ADAPTER = `import { defineAdapterPort } from "../../framework/runtime/adapter-authoring";
import type { AdapterFactory } from "../../framework/runtime/adapter-authoring";
import type { HarnessPort, SubagentIntegration } from "../../framework/runtime/port";

type ProvidedPort = HarnessPort & {
	readonly subagentIntegration: () => SubagentIntegration | Promise<SubagentIntegration>;
};
type WitnessHost = (host: unknown) => void;

export const MASKED_PORT = defineAdapterPort<{}>({
	subagentIntegration: () => JSON.parse("null"),
});

export function maskedAdapter(definition: unknown, options: { readonly childEntry: string }): AdapterFactory<ProvidedPort, WitnessHost> {
	throw new Error("contract fixture adapters must never execute");
}
`;

const UNBOUND_ADAPTER = `import { defineAdapterPort } from "../../framework/runtime/adapter-authoring";
import type { AdapterFactory } from "../../framework/runtime/adapter-authoring";
import type { HarnessPort, SubagentIntegration } from "../../framework/runtime/port";

type ProvidedPort = HarnessPort & {
	readonly subagentIntegration: () => SubagentIntegration | Promise<SubagentIntegration>;
};
type WitnessHost = (host: unknown) => void;

export const UNBOUND_PORT = defineAdapterPort<{}>({});

export function noBindingAdapter(definition: unknown, options: { readonly childEntry: string }): AdapterFactory<ProvidedPort, WitnessHost> {
	throw new Error("contract fixture adapters must never execute");
}
`;

const IMPORTED_ADAPTER = `import { defineAdapterPort } from "../../framework/runtime/adapter-authoring";
import type { AdapterFactory } from "../../framework/runtime/adapter-authoring";
import type { HarnessPort, SubagentIntegration } from "../../framework/runtime/port";
import { missingSubagentIntegration } from "./missing-implementations";

type ProvidedPort = HarnessPort & {
	readonly subagentIntegration: () => SubagentIntegration | Promise<SubagentIntegration>;
};
type WitnessHost = (host: unknown) => void;

export const IMPORTED_PORT = defineAdapterPort<{}>({
	subagentIntegration: missingSubagentIntegration,
});

export function importedAdapter(definition: unknown, options: { readonly childEntry: string }): AdapterFactory<ProvidedPort, WitnessHost> {
	throw new Error("contract fixture adapters must never execute");
}
`;

const OTHER_ADAPTER = `import type { AdapterFactory } from "../../framework/runtime/adapter-authoring";
import type { HarnessPort, SubagentIntegration } from "../../framework/runtime/port";

type ProvidedPort = HarnessPort & {
	readonly subagentIntegration: () => SubagentIntegration | Promise<SubagentIntegration>;
};
type WitnessHost = (host: unknown) => void;

export function otherAdapter(definition: unknown, options: { readonly childEntry: string }): AdapterFactory<ProvidedPort, WitnessHost> {
	throw new Error("contract fixture adapters must never execute");
}
`;

function assemblyFile(body: string): string {
	return `${body}\nexport default (host: unknown): void => void host;\n`;
}

function contracts(): IntegrationContract[] {
	return [
		portContract("subagentIntegration", "optional"),
		deliveryContract("initialization.subagents", "optional"),
		frameworkContract("extension-loading", "optional"),
	];
}

function supplyFor(root: string, adapter: string, assemblyPath?: string): SupplyResult {
	return analyzeSupply({
		root,
		adapter,
		contracts: contracts(),
		...(assemblyPath === undefined ? {} : { assemblyFiles: [assemblyPath] }),
	});
}

function statuses(result: SupplyResult): Record<string, string> {
	return Object.fromEntries(result.supplies.map(item => [item.contractId, item.status]));
}

describe("assembly-specific factory output contracts", () => {
	test("an explicit assembly output supplies a conditional port member", () => {
		const root = createContractRoot();
		writeFixture(root, "adapters/witness/index.ts", WITNESS_ADAPTER);
		writeFixture(root, "extensions/sample/harnesses/pi.ts", assemblyFile(
			`import { witnessAdapter } from "../../../adapters/witness";
const bind = witnessAdapter({ id: "sample" }, { childEntry: "entrypoints/pi/sample.ts" });`,
		));
		const result = supplyFor(root, "witness", "extensions/sample/harnesses/pi.ts");
		expect(result.diagnostics).toEqual([]);
		expect(statuses(result)).toEqual({
			"port:subagentIntegration": "provided",
			"delivery:initialization.subagents": "provided",
			"framework:extension-loading": "provided",
		});
		expect(result.supplies.find(item => item.contractId === "port:subagentIntegration")?.implementation)
			.toMatchObject({ file: "extensions/sample/harnesses/pi.ts" });
	});

	test("a factory that can return no assembly does not promise a provided port", () => {
		const root = createContractRoot();
		writeFixture(root, "adapters/witness/index.ts", WITNESS_ADAPTER + `
export function nullableAdapter(): AdapterFactory<WitnessPort<{ readonly childEntry: string }>, WitnessHost> | undefined {
  throw new Error("contract fixture adapters must never execute");
}
`);
		writeFixture(root, "extensions/sample/harnesses/pi.ts", assemblyFile(
			`import { nullableAdapter } from "../../../adapters/witness";
const bind = nullableAdapter();`,
		));
		expect(statuses(supplyFor(root, "witness", "extensions/sample/harnesses/pi.ts"))).toEqual({
			"port:subagentIntegration": "unresolved",
			"delivery:initialization.subagents": "unresolved",
			"framework:extension-loading": "unresolved",
		});
	});

	test("ordinary native adapter API calls are not mistaken for assembly factories", () => {
		const root = createContractRoot();
		writeFixture(root, "adapters/witness/index.ts", WITNESS_ADAPTER);
		writeFixture(root, "extensions/sample/harnesses/pi.ts", assemblyFile(
			`import { witnessAdapter, witnessNativeApi } from "../../../adapters/witness";
const api = witnessNativeApi();
api.on("message_end", () => {});
const bind = witnessAdapter({ id: "sample" }, { childEntry: "entrypoints/pi/sample.ts" });`,
		));
		const result = supplyFor(root, "witness", "extensions/sample/harnesses/pi.ts");
		expect(result.diagnostics).toEqual([]);
		expect(statuses(result)).toEqual({
			"port:subagentIntegration": "provided",
			"delivery:initialization.subagents": "provided",
			"framework:extension-loading": "provided",
		});
	});

	test("an omitted or explicitly undefined assembly entry is an intentional absence", () => {
		const root = createContractRoot();
		writeFixture(root, "adapters/witness/index.ts", WITNESS_ADAPTER);
		writeFixture(root, "extensions/sample/harnesses/pi.ts", assemblyFile(
			`import { witnessAdapter } from "../../../adapters/witness";
const omitted = witnessAdapter({ id: "sample" }, {});
const undefinedEntry = witnessAdapter({ id: "sample" }, { childEntry: undefined });
void omitted;
void undefinedEntry;`,
		));
		const result = supplyFor(root, "witness", "extensions/sample/harnesses/pi.ts");
		expect(result.diagnostics).toEqual([]);
		expect(statuses(result)).toEqual({
			"port:subagentIntegration": "unavailable",
			"delivery:initialization.subagents": "unavailable",
			"framework:extension-loading": "unavailable",
		});
	});

	test("a dynamic assembly output stays conditional", () => {
		const root = createContractRoot();
		writeFixture(root, "adapters/witness/index.ts", WITNESS_ADAPTER);
		writeFixture(root, "extensions/sample/harnesses/pi.ts", assemblyFile(
			`import { dynamicAdapter } from "../../../adapters/witness";
const bind = dynamicAdapter({ id: "sample" }, { childEntry: "entrypoints/pi/sample.ts" });`,
		));
		const result = supplyFor(root, "witness", "extensions/sample/harnesses/pi.ts");
		expect(result.diagnostics).toEqual([]);
		expect(statuses(result)).toEqual({
			"port:subagentIntegration": "conditional",
			"delivery:initialization.subagents": "conditional",
			"framework:extension-loading": "conditional",
		});
	});

	test("different possible assembly calls make the member conditional", () => {
		const root = createContractRoot();
		writeFixture(root, "adapters/witness/index.ts", WITNESS_ADAPTER);
		writeFixture(root, "extensions/sample/harnesses/pi.ts", assemblyFile(
			`import { witnessAdapter } from "../../../adapters/witness";
const enabled = witnessAdapter({ id: "sample" }, { childEntry: "entrypoints/pi/sample.ts" });
const absent = witnessAdapter({ id: "sample" }, {});
void enabled;
void absent;`,
		));
		const result = supplyFor(root, "witness", "extensions/sample/harnesses/pi.ts");
		expect(result.diagnostics).toEqual([]);
		expect(statuses(result)).toEqual({
			"port:subagentIntegration": "conditional",
			"delivery:initialization.subagents": "conditional",
			"framework:extension-loading": "conditional",
		});
	});

	test("a factory call without the canonical output witness is unresolved, not absent", () => {
		const root = createContractRoot();
		writeFixture(root, "adapters/witness/index.ts", WITNESS_ADAPTER);
		writeFixture(root, "extensions/sample/harnesses/pi.ts", assemblyFile(
			`import { plainAdapter } from "../../../adapters/witness";
const bind = plainAdapter({ id: "sample" }, { childEntry: "entrypoints/pi/sample.ts" });`,
		));
		const result = supplyFor(root, "witness", "extensions/sample/harnesses/pi.ts");
		expect(statuses(result)).toEqual({
			"port:subagentIntegration": "unresolved",
			"delivery:initialization.subagents": "unresolved",
			"framework:extension-loading": "unresolved",
		});
		expect(result.diagnostics.map(item => item.code).sort()).toEqual([
			"supply/unresolved-delivery",
			"supply/unresolved-framework",
			"supply/unresolved-port",
		]);
	});

	test("an any-typed factory output is unresolved", () => {
		const root = createContractRoot();
		writeFixture(root, "adapters/witness/index.ts", WITNESS_ADAPTER);
		writeFixture(root, "extensions/sample/harnesses/pi.ts", assemblyFile(
			`import { anyAdapter } from "../../../adapters/witness";
const bind = anyAdapter({ id: "sample" }, { childEntry: "entrypoints/pi/sample.ts" });`,
		));
		const result = supplyFor(root, "witness", "extensions/sample/harnesses/pi.ts");
		expect(statuses(result)["port:subagentIntegration"]).toBe("unresolved");
		expect(result.diagnostics.length).toBeGreaterThan(0);
	});

	test("aliases and overloads use the resolved signature, not a function name", () => {
		const root = createContractRoot();
		writeFixture(root, "adapters/witness/index.ts", WITNESS_ADAPTER);
		writeFixture(root, "extensions/aliased/harnesses/pi.ts", assemblyFile(
			`import { witnessAdapter as makeWitness } from "../../../adapters/witness";
const factory = makeWitness;
const bind = factory({ id: "aliased" }, { childEntry: "entrypoints/pi/aliased.ts" });`,
		));
		const aliased = supplyFor(root, "witness", "extensions/aliased/harnesses/pi.ts");
		expect(aliased.diagnostics).toEqual([]);
		expect(statuses(aliased)["port:subagentIntegration"]).toBe("provided");

		writeFixture(root, "extensions/overloaded/harnesses/pi.ts", assemblyFile(
			`import { overloadedAdapter } from "../../../adapters/witness";
const enabled = overloadedAdapter({ id: "overloaded" }, { childEntry: "entrypoints/pi/overloaded.ts" });
const absent = overloadedAdapter({ id: "overloaded" }, {});
void enabled;
void absent;`,
		));
		const overloaded = supplyFor(root, "witness", "extensions/overloaded/harnesses/pi.ts");
		expect(overloaded.diagnostics).toEqual([]);
		expect(statuses(overloaded)["port:subagentIntegration"]).toBe("conditional");
	});

	test("calls resolving into another adapter are not this adapter's assembly evidence", () => {
		const root = createContractRoot();
		writeFixture(root, "adapters/witness/index.ts", WITNESS_ADAPTER);
		writeFixture(root, "adapters/other/index.ts", OTHER_ADAPTER);
		writeFixture(root, "extensions/sample/harnesses/pi.ts", assemblyFile(
			`import { otherAdapter } from "../../../adapters/other";
const bind = otherAdapter({ id: "sample" }, { childEntry: "entrypoints/pi/sample.ts" });`,
		));
		const result = supplyFor(root, "witness", "extensions/sample/harnesses/pi.ts");
		expect(statuses(result)).toEqual({
			"port:subagentIntegration": "unresolved",
			"delivery:initialization.subagents": "unresolved",
			"framework:extension-loading": "unresolved",
		});
	});

	test("bare adapter analysis without selected assembly sources keeps the raw conditional answer", () => {
		const root = createContractRoot();
		writeFixture(root, "adapters/witness/index.ts", WITNESS_ADAPTER);
		const result = supplyFor(root, "witness");
		expect(result.diagnostics).toEqual([]);
		expect(statuses(result)).toEqual({
			"port:subagentIntegration": "conditional",
			"delivery:initialization.subagents": "conditional",
			"framework:extension-loading": "conditional",
		});
	});

	test("the witness never masks an unresolved, imported-missing or absent binding", () => {
		const root = createContractRoot();
		writeFixture(root, "adapters/masked/index.ts", MASKED_ADAPTER);
		writeFixture(root, "adapters/imported/index.ts", IMPORTED_ADAPTER);
		writeFixture(root, "adapters/unbound/index.ts", UNBOUND_ADAPTER);
		writeFixture(root, "extensions/masked/harnesses/pi.ts", assemblyFile(
			`import { maskedAdapter } from "../../../adapters/masked";
const bind = maskedAdapter({ id: "masked" }, { childEntry: "entrypoints/pi/masked.ts" });`,
		));
		const masked = supplyFor(root, "masked", "extensions/masked/harnesses/pi.ts");
		expect(statuses(masked)["port:subagentIntegration"]).toBe("unresolved");
		expect(masked.diagnostics.some(item => item.code === "supply/untyped-binding")).toBe(true);

		writeFixture(root, "extensions/imported/harnesses/pi.ts", assemblyFile(
			`import { importedAdapter } from "../../../adapters/imported";
const bind = importedAdapter({ id: "imported" }, { childEntry: "entrypoints/pi/imported.ts" });`,
		));
		const imported = supplyFor(root, "imported", "extensions/imported/harnesses/pi.ts");
		expect(statuses(imported)["port:subagentIntegration"]).toBe("missing");

		writeFixture(root, "extensions/unbound/harnesses/pi.ts", assemblyFile(
			`import { noBindingAdapter } from "../../../adapters/unbound";
const bind = noBindingAdapter({ id: "unbound" }, { childEntry: "entrypoints/pi/unbound.ts" });`,
		));
		const unbound = supplyFor(root, "unbound", "extensions/unbound/harnesses/pi.ts");
		expect(statuses(unbound)["port:subagentIntegration"]).toBe("missing");
	});

	test("a new adapter is still missing when its assembly has no witness to read", () => {
		const root = createContractRoot();
		writeFixture(root, "adapters/other/index.ts", OTHER_ADAPTER);
		writeFixture(root, "extensions/fresh/harnesses/pi.ts", assemblyFile(
			`import { otherAdapter } from "../../../adapters/other";
const bind = otherAdapter({ id: "fresh" }, { childEntry: "entrypoints/pi/fresh.ts" });`,
		));
		const result = supplyFor(root, "fresh", "extensions/fresh/harnesses/pi.ts");
		expect(result.exists).toBe(false);
		expect(result.diagnostics).toEqual([]);
		expect(statuses(result)["port:subagentIntegration"]).toBe("missing");
	});
});
