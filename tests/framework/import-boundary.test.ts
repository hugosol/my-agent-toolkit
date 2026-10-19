/**
 * The framework's import boundary (C1): the shared, harness-independent source
 * never imports harness types, the native escape hatch appears only where it is
 * declared, and each discovery entrypoint stays a re-export.
 *
 * The evidence is the module graph itself — the criterion is about which modules may
 * depend on which — so this suite reads the source tree instead of running anything.
 * Declaration files are scanned too: declaring a harness-type dependency in shared
 * source is the same boundary crossing as importing one.
 *
 * The check is an alarm, not a proof: it reads specifiers lexically and only from `.ts`
 * files, so `require(...)`, computed specifiers, aliasing and a non-`.ts` module sit
 * outside it, and a green run means only that the alarm found nothing. The principle is
 * what binds — see ADR 0002, "Enforcement of the native boundary".
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { REPO_ROOT } from "../harness-dock/baseline";

/** The source trees whose module graph the boundary covers. */
const SCANNED_ROOTS = ["adapters", "framework", "extensions", "entrypoints"] as const;

/** Packages the harness loader resolves for an extension: naming one — by import or by declaration — is an escape hatch. */
const HARNESS_PACKAGE = /^@(?:oh-my-pi|earendil-works)\//;

/** Where the native surface may be touched: the OMP adapter and extension harness assemblies. */
const ESCAPE_HATCH = [/^adapters\//, /^extensions\/[^/]+\/harnesses\//];

/**
 * Every way this repository writes a module specifier: an import, a re-export, a dynamic
 * import, and an ambient `declare module`. A declaration names a module exactly as an import
 * does, so neither may name a harness package outside the escape hatch.
 */
const SPECIFIER =
	/\bfrom\s*["']([^"']+)["']|\bimport\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']|\bdeclare\s+module\s*["']([^"']+)["']/g;

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
		const specifier = match[1] ?? match[2] ?? match[3] ?? match[4];
		if (specifier !== undefined) specifiers.push(specifier);
	}
	return specifiers;
}

/**
 * Shared source: every scanned module that is neither an escape hatch nor a discovery
 * entrypoint — the entire framework tree, and every extension module outside its
 * `harnesses/`. Entrypoints are their own class (reaching the escape hatch is exactly what a
 * thin entrypoint does), so the entrypoint assertion below governs them instead, and no scanned
 * module is left unclassified.
 */
function isHostIndependent(file: string): boolean {
	if (ESCAPE_HATCH.some(pattern => pattern.test(file))) return false;
	return !file.startsWith("entrypoints/");
}

/** The module a relative specifier reaches, so the boundary applies to imports, not just package names. */
function resolvesInto(file: string, specifier: string, patterns: readonly RegExp[]): boolean {
	if (!specifier.startsWith(".")) return false;
	const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
	return patterns.some(pattern => pattern.test(target));
}

const sourceFiles = SCANNED_ROOTS.flatMap(root => sourceFilesUnder(root));

describe("shared source imports no harness types (C1)", () => {
	test("the framework outside adapters and the extension modules outside harnesses stay host-independent", () => {
		const shared = sourceFiles.filter(isHostIndependent);
		const crossings: string[] = [];
		for (const file of shared) {
			for (const specifier of specifiersOf(file)) {
				if (HARNESS_PACKAGE.test(specifier)) {
					crossings.push(`${file} imports the harness package "${specifier}"`);
				} else if (resolvesInto(file, specifier, ESCAPE_HATCH)) {
					crossings.push(`${file} imports the native escape hatch through "${specifier}"`);
				}
			}
		}
		expect(crossings).toEqual([]);
	});

	test("the native escape hatch appears only in adapters and harness assemblies", () => {
		const naming = sourceFiles.filter(file =>
			specifiersOf(file).some(specifier => HARNESS_PACKAGE.test(specifier)),
		);

		// The escape hatch exists and is exercised: the extension's OMP assembly is where
		// the loader-provided package is imported, and the adapter is where its module shape
		// is declared. Nowhere else may name it, by import or by declaration.
		expect(naming.some(file => /^extensions\/[^/]+\/harnesses\//.test(file))).toBe(true);
		expect(naming.filter(file => !ESCAPE_HATCH.some(pattern => pattern.test(file)))).toEqual([]);
	});

	test("extensions reach Session only through its capability interface", () => {
		// These are the remaining authoring and non-Session capability entries, not a
		// blanket exemption for core/modules. Remove each entry when that capability migrates.
		const legacyEntries: Readonly<Record<string, true>> = {
			"framework/public": true,
			"framework/core/assembly": true,
			"framework/core/definition": true,
			"framework/core/config": true,
			"framework/core/integration": true,
			"framework/modules/http": true,
			"framework/modules/files": true,
		};
		const crossings: string[] = [];
		for (const file of sourceFiles.filter(file => file.startsWith("extensions/"))) {
			for (const specifier of specifiersOf(file)) {
				if (!specifier.startsWith(".")) continue;
				const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier))
					.replace(/\.(?:[cm]?ts|js)$/, "").replace(/\/index$/, "");
				if (target.startsWith("framework/") && target !== "framework/interface" && !target.startsWith("framework/interface/")
					&& legacyEntries[target] !== true) {
					crossings.push(`${file} bypasses the capability interface through "${specifier}"`);
				}
			}
		}
		expect(crossings).toEqual([]);
	});

	test("legacy framework entries cannot re-export the Session capability", () => {
		const crossings: string[] = [];
		for (const file of sourceFiles.filter(file => file.startsWith("framework/") && !file.startsWith("framework/interface/"))) {
			const source = readFileSync(path.join(REPO_ROOT, file), "utf8");
			const reexports = /\bexport\s+(?:type\s+)?(?:\*\s*(?:as\s+\w+\s*)?|\{[^}]*\}\s*)from\s*["']([^"']+)["']/g;
			for (const match of source.matchAll(reexports)) {
				if (resolvesInto(file, match[1]!, [/^framework\/interface\/session(?:\/|\.|$)/])) {
					crossings.push(`${file} re-exports Session through "${match[1]}"`);
				}
			}
		}
		expect(crossings).toEqual([]);
	});

	test("State's declarations are published only by the State capability interface", () => {
		// The capability interface is the one canonical source for these names. A declaration or
		// an export block naming one of them anywhere else would give the capability a second
		// owner (or a compatibility copy), which type checking alone cannot see. As with the other
		// checks in this suite, this is a lexical alarm, not a proof.
		const canonical = "framework/interface/state/index.ts";
		const owned = [
			"StateDeclaration",
			"StatePersistence",
			"StateInheritance",
			"OwnerReference",
			"DeclaredValueSeam",
			"OwnerCapabilityHandle",
		] as const;
		const canonicalSource = readFileSync(path.join(REPO_ROOT, canonical), "utf8");
		const declaredEverywhere = (source: string): string[] =>
			[...source.matchAll(/\bexport\s+(?:type|interface|const|class|function)\s+([A-Za-z_$][\w$]*)/g)]
				.map(match => match[1]!);
		const exportedInBlocks = (source: string): string[] =>
			[...source.matchAll(/\bexport\s+(?:type\s+)?\{([^}]*)\}/g)]
				.flatMap(match => match[1]!.split(",").map(entry => entry.trim().split(/\s+as\s+/)[0]!.trim()));

		const canonicalNames = [...declaredEverywhere(canonicalSource), ...exportedInBlocks(canonicalSource)];
		for (const name of owned) {
			expect(canonicalNames.includes(name)).toBe(true);
		}

		const crossings: string[] = [];
		for (const file of sourceFiles.filter(file => file !== canonical)) {
			const source = readFileSync(path.join(REPO_ROOT, file), "utf8");
			for (const name of owned) {
				if (declaredEverywhere(source).includes(name)) {
					crossings.push(`${file} declares ${name} outside the State capability interface`);
				}
				if (exportedInBlocks(source).includes(name)) {
					crossings.push(`${file} exports ${name} outside the State capability interface`);
				}
			}
			for (const match of source.matchAll(/\bexport\s+\*\s*(?:as\s+\w+\s*)?from\s*["']([^"']+)["']/g)) {
				if (resolvesInto(file, match[1]!, [/^framework\/interface\/state(?:\/|\.|$)/])) {
					crossings.push(`${file} re-exports the State capability through "${match[1]}"`);
				}
			}
		}
		expect(crossings).toEqual([]);
	});

	test("capability interfaces depend on no framework implementation or native mapping", () => {
		const crossings: string[] = [];
		for (const file of sourceFiles.filter(file => file.startsWith("framework/interface/"))) {
			for (const specifier of specifiersOf(file)) {
				const target = specifier.startsWith(".")
					? path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier))
					: specifier;
				if (!target.startsWith("framework/interface/")) {
					crossings.push(`${file} imports implementation through "${specifier}"`);
				}
			}
		}
		expect(crossings).toEqual([]);
	});

	/**
	 * The same module graph in the other direction: the framework is the layer every extension
	 * builds on, so nothing under `framework/` may reach an extension — a framework module that
	 * imported one would make the general surface depend on a particular consumer, and the
	 * extensions that do not exist yet could not be added without changing it.
	 */
	test("the framework and its adapters depend on no extension", () => {
		const frameworkFiles = sourceFiles.filter(file => file.startsWith("framework/") || file.startsWith("adapters/"));
		expect(frameworkFiles.length).toBeGreaterThan(0);

		const crossings: string[] = [];
		for (const file of frameworkFiles) {
			for (const specifier of specifiersOf(file)) {
				if (resolvesInto(file, specifier, [/^extensions\//])) {
					crossings.push(`${file} imports the extension module "${specifier}"`);
				}
			}
		}
		expect(crossings).toEqual([]);
	});

	test("each discovery entrypoint only re-exports its extension's harness assembly", () => {
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
			expect(resolvesInto(entrypoint, specifier ?? "", [/^extensions\/[^/]+\/harnesses\//])).toBe(true);
		}
	});
});
