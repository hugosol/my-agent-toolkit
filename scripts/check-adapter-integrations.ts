/** Source-only contract analysis. No extension/adapter execution or runtime admission. */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkIntegrations, printIntegrationReport } from "./integrations/check";
import { diagnosticFailure, parseIntegrationArguments } from "./integrations/cli";

const args = process.argv.slice(2);
try {
	const options = parseIntegrationArguments(args, resolve(dirname(fileURLToPath(import.meta.url)), ".."));
	if (options.help) {
		console.log("Usage: bun run check:integrations [--extension <id-or-source-path>] [--adapter <name-or-source-path>] [--demand-only] [--root <directory>] [--json]");
		console.log("Default: analyze every independent extension definition/adapter pair without discovery entries. A definition source path selects that declaration; a directory selects all declarations.");
		console.log("--demand-only lists requirements without an adapter. Static completeness does not certify runtime compatibility.");
		console.log("Exit: 0 complete (optional absences permitted), 1 required gaps or unresolved analysis, 2 invocation/infrastructure failure.");
	} else {
		const report = checkIntegrations(options);
		if (options.json) console.log(JSON.stringify(report, null, 2));
		else printIntegrationReport(report);
		process.exitCode = report.complete ? 0 : 1;
	}
} catch (error) {
	diagnosticFailure("integration-contracts", error, args.includes("--json"));
	process.exitCode = 2;
}
