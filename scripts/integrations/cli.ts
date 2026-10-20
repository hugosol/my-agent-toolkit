import { existsSync, statSync } from "node:fs";
import path from "node:path";

export interface IntegrationArguments {
	root: string;
	extension?: string;
	adapter?: string;
	json: boolean;
	help: boolean;
	demandOnly: boolean;
	dryRun: boolean;
	includeOptional: boolean;
}
export function parseIntegrationArguments(args: readonly string[], defaultRoot: string, generate = false): IntegrationArguments {
	const result: IntegrationArguments = { root: defaultRoot, json: false, help: false, demandOnly: false, dryRun: false, includeOptional: false };
	const seen = new Set<string>();
	for (let index = 0; index < args.length; index++) {
		const arg = args[index];
		if (seen.has(arg)) throw new Error(`Repeated option: ${arg}`);
		seen.add(arg);
		if (arg === "--json") result.json = true;
		else if (arg === "--help" || arg === "-h") result.help = true;
		else if (arg === "--demand-only" && !generate) result.demandOnly = true;
		else if (arg === "--dry-run" && generate) result.dryRun = true;
		else if (arg === "--include-optional" && generate) result.includeOptional = true;
		else if (arg === "--root" || arg === "--extension" || arg === "--adapter") {
			const value = args[++index];
			if (!value || value.startsWith("-")) throw new Error(`${arg} requires a value`);
			if (arg === "--root") result.root = path.resolve(value);
			else if (arg === "--extension") result.extension = value;
			else result.adapter = value;
		} else throw new Error(`Unknown option: ${arg}`);
	}
	if (result.help) return result;
	if (!existsSync(result.root) || !statSync(result.root).isDirectory()) throw new Error(`Root directory does not exist: ${result.root}`);
	if (result.demandOnly && result.adapter !== undefined) throw new Error("--demand-only and --adapter cannot be combined.");
	if (generate && (!result.extension || !result.adapter)) throw new Error("Generation requires --extension and --adapter.");
	return result;
}

export function diagnosticFailure(stage: string, error: unknown, json: boolean): void {
	const message = error instanceof Error ? error.message : String(error);
	if (json) console.log(JSON.stringify({ stage, complete: false, error: message }, null, 2));
	else console.error(`${stage}: ${message}`);
}
