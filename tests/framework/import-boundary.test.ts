/**
 * The framework's import boundary (C1): the shared, agent-runtime-independent source
 * never imports agent-runtime types, the native escape hatch appears only where it is
 * declared, and each discovery entrypoint stays a re-export.
 *
 * The evidence is the module graph itself — the criterion is about which modules may
 * depend on which — so this suite reads the source tree instead of running anything.
 * Declaration files are scanned too: declaring a runtime-type dependency in shared
 * source is the same boundary crossing as importing one.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { REPO_ROOT } from "../harness/baseline";

/** The source trees whose module graph the boundary covers. */
const SCANNED_ROOTS = ["framework", "extensions", "entrypoints"] as const;

/** Packages the agent-runtime loader resolves for an extension: importing one is an escape hatch. */
const AGENT_RUNTIME_PACKAGE = /^@(?:oh-my-pi|earendil-works)\//;

/** Where the native surface may be touched: the OMP adapter and extension runtime assemblies. */
const ESCAPE_HATCH = [/^framework\/adapters\//, /^extensions\/[^/]+\/runtimes\//];

/** Import/export/dynamic-import specifiers. */
const SPECIFIER = /\bfrom\s*["']([^"']+)["']|\bimport\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']/g;

function sourceFilesUnder(directory: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(path.join(REPO_ROOT, directory), { withFileTypes: true })) {
		const absolute = path.join(REPO_ROOT, directory, entry.name);
		if (entry.isDirectory()) files.push(...sourceFilesUnder(path.relative(REPO_ROOT, absolute)));
		else if (entry.name.endsWith(".ts")) files.push(path.relative(REPO_ROOT, absolute).split(path.sep).join("/"));
	}
	return files;
}

function specifiersOf(file: string): string[] {
	const source = readFileSync(path.join(REPO_ROOT, file), "utf8");
	const specifiers: string[] = [];
	for (const match of source.matchAll(SPECIFIER)) {
		const specifier = match[1] ?? match[2] ?? match[3];
		if (specifier !== undefined) specifiers.push(specifier);
	}
	return specifiers;
}

/** Shared source: framework core/behaviors/definition entry, and every extension module outside `runtimes/`. */
function isHostIndependent(file: string): boolean {
	if (/^framework\/(?:core|behaviors)\//.test(file) || file === "framework/public.ts") return true;
	if (/^extensions\/[^/]+\//.test(file)) return !/^extensions\/[^/]+\/runtimes\//.test(file);
	return false;
}

/** The module a relative specifier reaches, so the boundary applies to imports, not just package names. */
function resolvesInto(file: string, specifier: string, patterns: readonly RegExp[]): boolean {
	if (!specifier.startsWith(".")) return false;
	const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
	return patterns.some(pattern => pattern.test(target));
}

const sourceFiles = SCANNED_ROOTS.flatMap(root => sourceFilesUnder(root));

describe("shared source imports no agent-runtime types (C1)", () => {
	test("framework core/behaviors and extension shared source stay host-independent", () => {
		const shared = sourceFiles.filter(isHostIndependent);
		// The check is only meaningful while it has subjects: both shared framework
		// layers and the extension's shared source exist.
		expect(shared.filter(file => file.startsWith("framework/core/")).length).toBeGreaterThan(0);
		expect(shared.filter(file => file.startsWith("framework/behaviors/")).length).toBeGreaterThan(0);
		expect(shared).toContain("framework/public.ts");
		expect(shared).toContain("extensions/codebase-tools/definition.ts");

		const crossings: string[] = [];
		for (const file of shared) {
			for (const specifier of specifiersOf(file)) {
				if (AGENT_RUNTIME_PACKAGE.test(specifier)) {
					crossings.push(`${file} imports the agent-runtime package "${specifier}"`);
				} else if (resolvesInto(file, specifier, ESCAPE_HATCH)) {
					crossings.push(`${file} imports the native escape hatch through "${specifier}"`);
				}
			}
		}
		expect(crossings).toEqual([]);
	});

	test("the native escape hatch appears only in adapters and runtime assemblies", () => {
		const importers = sourceFiles.filter(file =>
			specifiersOf(file).some(specifier => AGENT_RUNTIME_PACKAGE.test(specifier)),
		);

		// The escape hatch exists and is exercised: the extension's OMP assembly is where
		// the loader-provided package is imported.
		expect(importers.some(file => /^extensions\/[^/]+\/runtimes\//.test(file))).toBe(true);
		expect(importers.filter(file => !ESCAPE_HATCH.some(pattern => pattern.test(file)))).toEqual([]);
	});

	test("each discovery entrypoint only re-exports its extension's runtime assembly", () => {
		const entrypoints = sourceFiles.filter(file => file.startsWith("entrypoints/"));
		expect(entrypoints.length).toBeGreaterThan(0);

		for (const entrypoint of entrypoints) {
			const code = readFileSync(path.join(REPO_ROOT, entrypoint), "utf8")
				.replace(/\/\*[\s\S]*?\*\//g, "")
				.replace(/^\s*\/\/.*$/gm, "")
				.trim();

			// A thin entrypoint is exactly one re-export of the assembled default: no
			// logic, no declarations, no native surface of its own.
			expect(code).toMatch(/^export\s*\{\s*[^}]*\bdefault\b[^}]*\}\s*from\s*"[^"]+";$/);
			expect(code).not.toMatch(/\b(?:function|const|let|var|class|return|if|else|for|while|new)\b/);

			const [specifier] = specifiersOf(entrypoint);
			expect(specifier).toBeDefined();
			expect(resolvesInto(entrypoint, specifier ?? "", [/^extensions\/[^/]+\/runtimes\//])).toBe(true);
		}
	});
});
