/**
 * Stage 1: compare integration declarations. No harness install, behavior test or startup hook.
 * Run behavior verification separately (for example `bun run verify:omp-candidate`).
 */
import { Glob } from "bun";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CODEBASE_TOOLS } from "../extensions/codebase-tools/definition";
import { CONNECT_BOT } from "../extensions/connect-bot/definition";
import { MODEL_COST } from "../extensions/model-cost/definition";
import { OMP_INTEGRATION } from "../adapters/omp/integration";
import { PI_INTEGRATION } from "../adapters/pi/integration";
import type { ExtensionHarnessEntry } from "../framework/core/integration";
import { checkAdapterIntegrations, type IntegrationGap } from "../framework/integration-check";

// Explicit declaration catalog. Newly discovered entries missing from it are reported, not skipped.
const EXTENSIONS = [CODEBASE_TOOLS, CONNECT_BOT, MODEL_COST];
const HARNESSES = [OMP_INTEGRATION, PI_INTEGRATION];
const ENTRYPOINTS = resolve(dirname(fileURLToPath(import.meta.url)), "..", "entrypoints");

function describeGap(gap: IntegrationGap): string {
	switch (gap.kind) {
		case "extension-declaration": return "missing extension declaration in the checklist catalog";
		case "harness-declaration": return "missing harness adapter integration declaration";
		case "subagent-mode": return "no subagent execution mode declared by the harness adapter";
		case "subagent-capability": return `${gap.mode}: missing ${gap.capability}`;
	}
}

const args = process.argv.slice(2);
if (args.some(arg => !["--json", "--help", "-h"].includes(arg))) {
	console.error("Usage: bun scripts/check-adapter-integrations.ts [--json] [--help]");
	process.exitCode = 2;
} else if (args.includes("--help") || args.includes("-h")) {
	console.log("Usage: bun scripts/check-adapter-integrations.ts [--json]");
	console.log("Check declared subagent integration coverage only; run behavior tests separately.");
} else {
	const files = [...new Glob("*/*.ts").scanSync({ cwd: ENTRYPOINTS })].sort();
	if (files.length === 0) throw new Error(`No extension discovery entries found under ${ENTRYPOINTS}`);
	const entries: ExtensionHarnessEntry[] = files.map(file => {
		const [harness, filename] = file.split("\\").join("/").split("/");
		return { harness, extension: filename.slice(0, -3) };
	});
	const results = checkAdapterIntegrations(EXTENSIONS, HARNESSES, entries);
	const complete = results.every(result => result.missing.length === 0);
	if (args.includes("--json")) {
		console.log(JSON.stringify({ stage: "integration-completeness", behaviorTestsRun: false, complete, results }, null, 2));
	} else {
		console.log("Subagent integration completeness — declaration matching only; behavior tests not run.");
		for (const result of results) {
			const label = `${result.harness} / ${result.extension}`;
			if (result.missing.length > 0) {
				for (const gap of result.missing) console.log(`MISSING ${label}: ${describeGap(gap)}`);
			} else if (result.requirements.length === 0) {
				console.log(`NOT REQUIRED ${label}: no subagent requirements`);
			} else {
				console.log(`COMPLETE ${label}: ${result.modes.join(", ")}`);
			}
		}
		console.log(complete ? "All declared requirements are connected; behavior correctness is not assessed."
			: "Integration declarations are incomplete; extension loading and runtime behavior are unchanged.");
	}
	process.exitCode = complete ? 0 : 1;
}
