/**
 * Resolves the provider's public child-extension entry from the shared framework configuration.
 * An explicit package root is authoritative: invalid configuration must not fall back to another
 * installation. Resolution uses the package's exports, not its private directory layout.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readConfigDocument } from "../../../../../framework/core/config";

const SHARED_CONFIGURATION_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../framework/config.yaml");
const PROVIDER_MODULE = "pi-subagents/required-child-extensions";

/** Loads once for an integration; an absent unconfigured dependency retains the no-provider mode. */
export async function loadPiSubagentProvider(configPath = SHARED_CONFIGURATION_PATH): Promise<unknown> {
	const document = readConfigDocument(configPath);
	const pi = document?.pi;
	if (pi === undefined) return import(PROVIDER_MODULE).catch(() => undefined);
	if (pi === null || typeof pi !== "object" || Array.isArray(pi)) {
		throw new Error("pi must be a mapping in the framework configuration");
	}
	const subagents = (pi as Record<string, unknown>).subagents;
	if (subagents === undefined) return import(PROVIDER_MODULE).catch(() => undefined);
	if (subagents === null || typeof subagents !== "object" || Array.isArray(subagents)) {
		throw new Error("pi.subagents must be a mapping in the framework configuration");
	}
	const packagePath = (subagents as Record<string, unknown>).packagePath;
	if (packagePath === undefined) return import(PROVIDER_MODULE).catch(() => undefined);
	if (typeof packagePath !== "string" || packagePath.trim().length === 0) {
		throw new Error("pi.subagents.packagePath must be a non-empty package directory path");
	}
	const root = resolve(dirname(resolve(configPath)), packagePath);
	try {
		const manifestPath = resolve(root, "package.json");
		const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
		if (manifest?.name !== "pi-subagents") throw new Error("package name must be pi-subagents");
		const entry = createRequire(manifestPath).resolve(PROVIDER_MODULE);
		const loaded = await import(pathToFileURL(entry).href);
		if (typeof loaded.registerRequiredChildExtensions !== "function") {
			throw new Error("the public entry exports no registerRequiredChildExtensions function");
		}
		return loaded;
	} catch (error) {
		throw new Error(`cannot load pi.subagents.packagePath "${root}": ${String(error)}`);
	}
}
