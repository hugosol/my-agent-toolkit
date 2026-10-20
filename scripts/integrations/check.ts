import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { analyzeDemand } from "./demand";
import { analyzeSupply } from "./supply";
import type { DemandResult, IntegrationContract, IntegrationDiagnostic, SupplyResult, ContractSupply } from "./model";

export interface CheckOptions {
	readonly root: string;
	readonly extension?: string;
	readonly adapter?: string;
	readonly demandOnly?: boolean;
}
export interface CheckedContract extends IntegrationContract { readonly supply?: ContractSupply; }
export interface CheckedIntegration {
	readonly extension: string;
	readonly adapter?: string;
	readonly complete: boolean;
	readonly contracts: readonly CheckedContract[];
	readonly diagnostics: readonly IntegrationDiagnostic[];
}
export interface IntegrationReport {
	readonly stage: "integration-contracts";
	readonly behaviorTestsRun: false;
	readonly complete: boolean;
	readonly results: readonly CheckedIntegration[];
}

export function discoverNames(root: string, directory: "extensions" | "adapters"): string[] {
	const target = path.resolve(root, directory);
	if (!existsSync(target)) return [];
	return readdirSync(target, { withFileTypes: true }).filter(item => item.isDirectory()).map(item => item.name).sort();
}

export function compareDemand(demand: DemandResult, supply?: SupplyResult): CheckedIntegration {
	const diagnostics = [...demand.diagnostics, ...(supply?.diagnostics ?? [])];
	const supplied = new Map(supply?.supplies.map(item => [item.contractId, item]));
	const contracts: CheckedContract[] = demand.contracts.map(contract => ({
		...contract,
		...(supply === undefined ? {} : { supply: supplied.get(contract.id) ?? { contractId: contract.id, status: "unresolved", reason: "Adapter analysis did not resolve this contract." } }),
	}));
	const complete = diagnostics.length === 0 && contracts.every(contract =>
		contract.supply === undefined || contract.requirement === "optional" || contract.supply.status === "provided",
	) && contracts.every(contract => contract.supply?.status !== "unresolved");
	return { extension: demand.extension, ...(supply === undefined ? {} : { adapter: supply.adapter }), complete, contracts, diagnostics };
}

export function checkIntegrations(options: CheckOptions): IntegrationReport {
	const extensions = options.extension === undefined ? discoverNames(options.root, "extensions") : [options.extension];
	if (extensions.length === 0) throw new Error("No extension sources found; select --extension <id-or-source-path>.");
	const adapters = options.demandOnly ? [] : options.adapter === undefined ? discoverNames(options.root, "adapters") : [options.adapter];
	if (!options.demandOnly && adapters.length === 0) throw new Error("No adapters found; use --demand-only or select --adapter <name>.");
	const results: CheckedIntegration[] = [];
	for (const extension of extensions) {
		const demand = analyzeDemand({ root: options.root, extension });
		if (options.demandOnly) results.push(compareDemand(demand));
		else for (const adapter of adapters) results.push(compareDemand(demand, analyzeSupply({ root: options.root, adapter, contracts: demand.contracts, assemblyFiles: demand.files })));
	}
	return { stage: "integration-contracts", behaviorTestsRun: false, complete: results.every(result => result.complete), results };
}

export function printIntegrationReport(report: IntegrationReport): void {
	for (const result of report.results) {
		console.log(`${result.extension}${result.adapter === undefined ? " / demand" : ` / ${result.adapter}`}: ${result.complete ? "COMPLETE" : "INCOMPLETE"}`);
		for (const contract of result.contracts) {
			console.log(`  ${contract.supply?.status.toUpperCase() ?? "REQUIRES"} ${contract.id} (${contract.requirement})${contract.supply?.reason ? ` — ${contract.supply.reason}` : ""}`);
			console.log(`    ${contract.path.join(" → ")}`);
			for (const origin of contract.origins) console.log(`    source ${origin.file}:${origin.line}:${origin.column}`);
			if (contract.supply?.implementation) {
				const site = contract.supply.implementation;
				console.log(`    implementation ${site.file}:${site.line}:${site.column}`);
			}
		}
		for (const diagnostic of result.diagnostics) console.log(`  ${diagnostic.file}:${diagnostic.line}:${diagnostic.column} [${diagnostic.code}] ${diagnostic.message}\n    ${diagnostic.suggestion}`);
	}
	console.log("Structural integration analysis only; native semantics are not certified and runtime loading is unchanged.");
}
