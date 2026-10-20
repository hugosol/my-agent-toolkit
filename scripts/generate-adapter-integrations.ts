/** Generate real missing implementation references, never fake native implementations. */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeDemand } from "./integrations/demand";
import { analyzeSupply } from "./integrations/supply";
import { generateAdapter } from "./integrations/generate";
import { compareDemand } from "./integrations/check";
import { diagnosticFailure, parseIntegrationArguments } from "./integrations/cli";

const args = process.argv.slice(2);
try {
	const options = parseIntegrationArguments(args, resolve(dirname(fileURLToPath(import.meta.url)), ".."), true);
	if (options.help) {
		console.log("Usage: bun run generate:integrations --extension <id-or-source-path> --adapter <name-or-source-path> [--include-optional] [--dry-run] [--root <directory>] [--json]");
		console.log("Analyze current source and generate missing export references in real adapter assembly. No implementation bodies are generated.");
		console.log("Generated source intentionally fails compilation until implementations are supplied. Existing implementations are preserved.");
	} else {
		const demand = analyzeDemand({ root: options.root, extension: options.extension! });
		const supply = analyzeSupply({ root: options.root, adapter: options.adapter!, contracts: demand.contracts, assemblyFiles: demand.files });
		const analysis = compareDemand(demand, supply);
		const unresolved = demand.diagnostics.length > 0 || supply.diagnostics.length > 0 || supply.supplies.some(item => item.status === "unresolved");
		if (unresolved) {
			if (options.json) console.log(JSON.stringify({ stage: "adapter-generation", complete: false, dryRun: options.dryRun, analysis, files: [], generatedContracts: [] }, null, 2));
			else {
				console.error("Generation not performed: resolve incomplete analysis first.");
				for (const diagnostic of analysis.diagnostics) console.error(`${diagnostic.file}:${diagnostic.line}:${diagnostic.column} [${diagnostic.code}] ${diagnostic.message}\n  ${diagnostic.suggestion}`);
				for (const contract of analysis.contracts.filter(item => item.supply?.status === "unresolved")) console.error(`${contract.id}: ${contract.supply?.reason}`);
			}
			process.exitCode = 1;
		} else {
			const result = generateAdapter({ root: options.root, adapter: options.adapter!, contracts: demand.contracts, assemblyFiles: demand.files, supply, includeOptional: options.includeOptional, dryRun: options.dryRun });
			const complete = result.diagnostics.length === 0;
			if (options.json) console.log(JSON.stringify({ stage: "adapter-generation", complete, dryRun: options.dryRun, ...result }, null, 2));
			else {
				for (const file of result.files) console.log(`${options.dryRun ? "WOULD WRITE" : "WROTE"} ${file.file}`);
				for (const diagnostic of result.diagnostics) console.error(`${diagnostic.file}:${diagnostic.line}:${diagnostic.column} [${diagnostic.code}] ${diagnostic.message}\n  ${diagnostic.suggestion}`);
				console.log(`${result.generatedContracts.length} missing contracts selected. No implementation bodies generated; generated missing exports must be supplied before compilation succeeds.`);
			}
			process.exitCode = complete ? 0 : 1;
		}
	}
} catch (error) {
	diagnosticFailure("adapter-generation", error, args.includes("--json"));
	process.exitCode = 2;
}
