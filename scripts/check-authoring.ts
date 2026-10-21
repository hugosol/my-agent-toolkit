/** Offline authoring lint only: never imports extension modules or changes runtime loading. */
import { existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkAuthoring } from "./authoring/check";
import { AUTHORING_RULES } from "./authoring/rules";

const usage = "Usage: bun scripts/check-authoring.ts [--json] [--rules] [--root <directory>] [file.ts ...]";
const args = process.argv.slice(2);
let root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let json = false;
let rules = false;
let help = false;
const files: string[] = [];
let argumentError: string | undefined;
for (let index = 0; index < args.length; index++) {
	const arg = args[index];
	if (arg === "--json") json = true;
	else if (arg === "--rules") rules = true;
	else if (arg === "--help" || arg === "-h") help = true;
	else if (arg === "--root") {
		const value = args[++index];
		if (value === undefined || value.startsWith("-")) { argumentError = "--root requires a directory"; break; }
		root = resolve(value);
	} else if (arg.startsWith("-")) { argumentError = `Unknown option: ${arg}`; break; }
	else files.push(arg);
}

if (argumentError !== undefined) {
	console.error(`${argumentError}\n${usage}`);
	process.exitCode = 2;
} else if (help) {
	console.log(usage);
	console.log("Check statically analyzable framework authoring expressions; defaults to extensions/**/*.ts.");
	console.log("--rules prints the full rule catalog. Exit: 0 clean, 1 diagnostics, 2 invocation failure.");
} else if (rules) {
	if (json) console.log(JSON.stringify({ rules: AUTHORING_RULES }, null, 2));
	else for (const rule of AUTHORING_RULES) {
		console.log(`${rule.id}: ${rule.title}\nReason: ${rule.reason}\nAllowed:\n${rule.allowedExample}\nDisallowed:\n${rule.disallowedExample}\nSuggestion: ${rule.suggestion}\nImpact: ${rule.impact}\n`);
	}
} else {
	try {
		if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error(`Root directory does not exist: ${root}`);
		for (const file of files) {
			const absolute = resolve(root, file);
			if (!existsSync(absolute) || !statSync(absolute).isFile() || !/\.tsx?$/.test(file) || /\.d\.ts$/.test(file)) {
				throw new Error(`Expected a TypeScript source file: ${file}`);
			}
		}
		const result = checkAuthoring({ root, ...(files.length === 0 ? {} : { files }) });
		const complete = result.diagnostics.length === 0;
		if (json) console.log(JSON.stringify({ stage: "static-authoring", complete, ...result }, null, 2));
		else {
			for (const diagnostic of result.diagnostics) {
				console.log(`${diagnostic.file}:${diagnostic.line}:${diagnostic.column} [${diagnostic.ruleId}] ${diagnostic.message}`);
				console.log(`  Suggestion: ${diagnostic.suggestion}`);
			}
			console.log(`Authoring expressions: ${result.filesChecked} files, ${result.declarationsChecked} declarations, ${result.diagnostics.length} diagnostics.`);
			if (!complete) console.log("Rule details: bun run check:authoring --rules (runtime loading is unchanged).");
		}
		process.exitCode = complete ? 0 : 1;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (json) console.log(JSON.stringify({ stage: "static-authoring", complete: false, error: message }, null, 2));
		else console.error(`Authoring check failed: ${message}`);
		process.exitCode = 2;
	}
}
