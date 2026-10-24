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

	test("extensions reach framework contracts only through their capability interfaces", () => {
		// Every capability and general module has its own interface entry now, so an extension that
		// resolves a `framework/` specifier outside `framework/interface` is reaching an internal
		// engine, a native mapping or the old mixed entry. There is deliberately no exemption list.
		const crossings: string[] = [];
		for (const file of sourceFiles.filter(file => file.startsWith("extensions/"))) {
			for (const specifier of specifiersOf(file)) {
				if (!specifier.startsWith(".")) continue;
				const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier))
					.replace(/\.(?:[cm]?ts|js)$/, "").replace(/\/index$/, "");
				if (target.startsWith("framework/") && target !== "framework/interface" && !target.startsWith("framework/interface/")) {
					crossings.push(`${file} bypasses the capability interface through "${specifier}"`);
				}
			}
		}
		expect(crossings).toEqual([]);
	});

	// P2 / R1: source boundaries, not a frozen inventory of private files. Type imports count:
	// native contracts must stay readable without a specific third-party protocol or mixture.
	// Third-party code may use native transport; only the reverse dependency is forbidden.
	test("native and third-party mappings do not depend back on cross-source interpretation", () => {
		const crossings: string[] = [];
		for (const file of sourceFiles) {
			const source = /^adapters\/([^/]+)\/(native|thirdParty)\//.exec(file);
			if (source === null) continue;
			const [, harness, group] = source;
			const forbidden = group === "native"
				? [new RegExp(`^adapters/${harness}/(?:thirdParty|mixture)(?:/|$)`)]
				: [new RegExp(`^adapters/${harness}/mixture(?:/|$)`)];
			for (const specifier of specifiersOf(file)) {
				if (resolvesInto(file, specifier, forbidden)
					|| (group === "native" && /^pi-subagents(?:\/|$)/.test(specifier))) {
					crossings.push(`${file} crosses its source boundary through "${specifier}"`);
				}
			}
		}
		expect(crossings).toEqual([]);
	});

	// P4 / R1: consumers use the public assembly regardless of where a mapping comes from.
	// A private loader import would couple an otherwise unchanged binding to source organization.
	test("extensions reach adapters only through their public assembly entries", () => {
		const crossings: string[] = [];
		for (const file of sourceFiles.filter(file => file.startsWith("extensions/"))) {
			for (const specifier of specifiersOf(file)) {
				if (!specifier.startsWith(".")) continue;
				const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier))
					.replace(/\.(?:[cm]?ts|js)$/, "").replace(/\/index$/, "");
				if (target.startsWith("adapters/") && !/^adapters\/[^/]+$/.test(target)) {
					crossings.push(`${file} bypasses the public adapter assembly through "${specifier}"`);
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

	test("Feedback's declarations are published only by the Feedback capability interface", () => {
		// FeedbackLevel and FeedbackTransport are the whole extension-facing feedback contract. A
		// declaration or an export block naming either elsewhere would give the capability a second
		// owner (or a compatibility copy), which type checking alone cannot see. The framework's
		// internal NoticeTransport stays outside it by design.
		const canonical = "framework/interface/feedback/index.ts";
		const owned = ["FeedbackLevel", "FeedbackTransport"] as const;
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
					crossings.push(`${file} declares ${name} outside the Feedback capability interface`);
				}
				if (exportedInBlocks(source).includes(name)) {
					crossings.push(`${file} exports ${name} outside the Feedback capability interface`);
				}
			}
			for (const match of source.matchAll(/\bexport\s+\*\s*(?:as\s+\w+\s*)?from\s*["']([^"']+)["']/g)) {
				if (resolvesInto(file, match[1]!, [/^framework\/interface\/feedback(?:\/|\.|$)/])) {
					crossings.push(`${file} re-exports the Feedback capability through "${match[1]}"`);
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

	test("Provider's declarations are published only by the Provider capability interface", () => {
		// CatalogPrice, CatalogPriceSource, ProviderHttpFacts, ProviderAccessFacts and ProviderAccess
		// are the whole extension-facing Provider contract. A declaration or an export block naming
		// one of them anywhere else would give the capability a second owner (or a compatibility
		// copy), which type checking alone cannot see. The adapters map the native sources; their
		// native registry, credential store and context stay outside this contract.
		const canonical = "framework/interface/provider/index.ts";
		const owned = [
			"CatalogPrice",
			"CatalogPriceSource",
			"ProviderHttpFacts",
			"ProviderAccessFacts",
			"ProviderAccess",
		] as const;
		const canonicalSource = readFileSync(path.join(REPO_ROOT, canonical), "utf8");
		const declaredEverywhere = (source: string): string[] =>
			[...source.matchAll(/\bexport\s+(?:type|interface|const|class|function)\s+([A-Za-z_$][\w$]*)/g)]
				.map(match => match[1]!);
		const exportedInBlocks = (source: string): string[] =>
			[...source.matchAll(/\bexport\s+(?:type\s+)?\{([^}]*)\}/g)]
				.flatMap(match => match[1]!.split(",").map(entry => entry.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]!.trim()));

		const canonicalNames = [...declaredEverywhere(canonicalSource), ...exportedInBlocks(canonicalSource)];
		for (const name of owned) {
			expect(canonicalNames.includes(name)).toBe(true);
		}

		const crossings: string[] = [];
		for (const file of sourceFiles.filter(file => file !== canonical)) {
			const source = readFileSync(path.join(REPO_ROOT, file), "utf8");
			for (const name of owned) {
				if (declaredEverywhere(source).includes(name)) {
					crossings.push(`${file} declares ${name} outside the Provider capability interface`);
				}
				if (exportedInBlocks(source).includes(name)) {
					crossings.push(`${file} exports ${name} outside the Provider capability interface`);
				}
			}
			for (const match of source.matchAll(/\bexport\s+\*\s*(?:as\s+\w+\s*)?from\s*["']([^"']+)["']/g)) {
				if (resolvesInto(file, match[1]!, [/^framework\/interface\/provider(?:\/|\.|$)/])) {
					crossings.push(`${file} re-exports the Provider capability through "${match[1]}"`);
				}
			}
		}
		expect(crossings).toEqual([]);
	});

	test("Prompt and Marker declarations are published only by their capability interfaces", () => {
		// Each capability owns exactly its approved declarations: Prompt publishes the slot
		// declaration and its strategy vocabulary, Marker publishes the text declaration. The
		// bound sets, defaults, selection tools and runtime deliveries deliberately stay internal,
		// so a declaration or an export block naming one of these names anywhere else would give
		// the capability a second owner (or a compatibility copy).
		const interfaces = [
			{ file: "framework/interface/prompt.ts", owns: ["PromptDeclaration", "PromptStrategy"] },
			{ file: "framework/interface/marker.ts", owns: ["MarkerDeclaration"] },
		] as const;
		const interfaceFiles: Readonly<Record<string, true>> = Object.fromEntries(
			interfaces.map(entry => [entry.file, true]),
		);
		const owned = interfaces.flatMap(entry => entry.owns);
		const declaredEverywhere = (source: string): string[] =>
			[...source.matchAll(/\bexport\s+(?:type|interface|const|class|function)\s+([A-Za-z_$][\w$]*)/g)]
				.map(match => match[1]!);
		const exportedInBlocks = (source: string): string[] =>
			[...source.matchAll(/\bexport\s+(?:type\s+)?\{([^}]*)\}/g)]
				.flatMap(match =>
					match[1]!.split(",").map(entry => entry.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]!.trim()),
				);

		for (const { file, owns } of interfaces) {
			const source = readFileSync(path.join(REPO_ROOT, file), "utf8");
			expect(declaredEverywhere(source).sort()).toEqual([...owns].sort());
		}

		const crossings: string[] = [];
		for (const file of sourceFiles.filter(file => interfaceFiles[file] !== true)) {
			const source = readFileSync(path.join(REPO_ROOT, file), "utf8");
			for (const name of owned) {
				if (declaredEverywhere(source).includes(name)) {
					crossings.push(`${file} declares ${name} outside its capability interface`);
				}
				if (exportedInBlocks(source).includes(name)) {
					crossings.push(`${file} exports ${name} outside its capability interface`);
				}
			}
			for (const match of source.matchAll(/\bexport\s+\*\s*(?:as\s+\w+\s*)?from\s*["']([^"']+)["']/g)) {
				if (resolvesInto(file, match[1]!, [/^framework\/interface\/prompt(?:\.|$)/, /^framework\/interface\/marker(?:\.|$)/])) {
					crossings.push(`${file} re-exports a Prompt or Marker capability through "${match[1]}"`);
				}
			}
		}
		expect(crossings).toEqual([]);
	});

	test("Command declarations are published only by the Command capability interface", () => {
		// The Command entry owns exactly the approved extension-facing declarations, implementation
		// contracts and deliveries. The internal invocation, bound command, parsing/help tooling and
		// the unrecognized-path directive stay out of it, and the old mixed entry re-publishes none
		// of them. As with the other checks in this suite, this is a lexical alarm, not a proof.
		const canonical = [
			"framework/interface/command/index.ts",
			"framework/interface/command/details/definition.ts",
			"framework/interface/command/details/implementation.ts",
		];
		const owned = [
			"CommandToggleDeclaration",
			"CommandDirectedDeclaration",
			"CommandActionsDeclaration",
			"CommandDeclaration",
			"ControlKind",
			"DirectedCommandImplementation",
			"CommandAction",
			"ActionsCommandImplementation",
			"CommandImplementation",
			"CommandImplementations",
			"CommandDelivery",
			"ActionDelivery",
			"RecognizedDirective",
			"CanAcceptInput",
		] as const;
		const internal = [
			"CommandInvocation",
			"BoundCommand",
			"DirectedDirective",
			"parseDirectedArgument",
			"actionsHelp",
			"normalizeCommandArgument",
		] as const;
		const declaredEverywhere = (source: string): string[] =>
			[...source.matchAll(/\bexport\s+(?:type|interface|const|class|function)\s+([A-Za-z_$][\w$]*)/g)]
				.map(match => match[1]!);
		const exportedInBlocks = (source: string): string[] =>
			[...source.matchAll(/\bexport\s+(?:type\s+)?\{([^}]*)\}/g)]
				.flatMap(match => match[1]!.split(",").map(entry => entry.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]!.trim()));

		const canonicalNames = canonical.flatMap(file => {
			const source = readFileSync(path.join(REPO_ROOT, file), "utf8");
			return [...declaredEverywhere(source), ...exportedInBlocks(source)];
		});
		for (const name of owned) {
			expect(canonicalNames).toContain(name);
		}

		const crossings: string[] = [];
		for (const file of sourceFiles.filter(file => !canonical.includes(file))) {
			const source = readFileSync(path.join(REPO_ROOT, file), "utf8");
			for (const name of owned) {
				if (declaredEverywhere(source).includes(name)) {
					crossings.push(`${file} declares ${name} outside the Command capability interface`);
				}
				if (exportedInBlocks(source).includes(name)) {
					crossings.push(`${file} exports ${name} outside the Command capability interface`);
				}
			}
			for (const match of source.matchAll(/\bexport\s+\*\s*(?:as\s+\w+\s*)?from\s*["']([^"']+)["']/g)) {
				if (resolvesInto(file, match[1]!, [/^framework\/interface\/command(?:\/|\.|$)/])) {
					crossings.push(`${file} re-exports the Command capability through "${match[1]}"`);
				}
			}
		}
		expect(crossings).toEqual([]);

		// The framework's invocation/binding/parsing vocabulary is internal: no interface file may
		// publish it, and the old mixed entry may not hand it out either.
		for (const file of sourceFiles.filter(file => file.startsWith("framework/interface/"))) {
			const source = readFileSync(path.join(REPO_ROOT, file), "utf8");
			for (const name of internal) {
				expect(declaredEverywhere(source)).not.toContain(name);
				expect(exportedInBlocks(source)).not.toContain(name);
			}
		}
	});

	

	

	

	test("the authoring entry publishes no Prompt or Marker runtime transport", () => {
		// RunDelivery, PromptContribution and MarkerTransport are framework/adapter internals: an
		// extension declares a slot or a marker text and never names the branch facts, the
		// contribution result or the area transport. The bound strategy list is a framework
		// validation set, not part of the extension-facing declaration.
		const source = readFileSync(path.join(REPO_ROOT, "framework/interface/index.ts"), "utf8");
		const exported = [
			...source.matchAll(/\bexport\s+(?:type\s+)?\{([^}]*)\}/g),
		].flatMap(match =>
			match[1]!.split(",").map(entry => entry.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]!.trim()),
		);
		for (const name of ["RunDelivery", "PromptContribution", "MarkerTransport", "BOUND_PROMPT_STRATEGIES"]) {
			expect(exported).not.toContain(name);
		}
	});

	test("capability interfaces depend on no framework implementation or native mapping", () => {
		// The approved runtime connections are defineExtension, request, updateFile, getConfig and
		// reportDiagnostic. The root authoring entry owns defineExtension itself and imports no
		// implementation; the general HTTP, safe-file, configuration and diagnostics entries re-export their implementation's one
		// published call. Each connection is exact — this file and this specifier — so the exception
		// cannot widen into a general import of the implementation tree.
		const runtimeConnections: Readonly<Record<string, readonly string[]>> = {
			"framework/interface/general/http.ts": ["../../modules/http"],
			"framework/interface/general/files.ts": ["../../modules/files"],
			"framework/interface/general/config.ts": ["../../core/config"],
			"framework/interface/general/diagnostics.ts": ["../../core/diagnostics"],
		};
		const crossings: string[] = [];
		for (const file of sourceFiles.filter(file => file.startsWith("framework/interface/"))) {
			for (const specifier of specifiersOf(file)) {
				const target = specifier.startsWith(".")
					? path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier))
					: specifier;
				if (!target.startsWith("framework/interface/") && runtimeConnections[file]?.includes(specifier) !== true) {
					crossings.push(`${file} imports implementation through "${specifier}"`);
				}
			}
		}
		expect(crossings).toEqual([]);
	});

	test("the General configuration entry publishes only getConfig and ExtensionConfigError", () => {
		// The entry is the General module's whole extension-facing surface. `ConfigLoadError`, the
		// reader/parser/source seam, `readConfig`, the shared-configuration reader and the validation
		// helpers stay internal: exporting any of them here would hand an extension the loading
		// machinery instead of the values its binding already validated. As with the other checks in
		// this suite, this is a lexical alarm, not a proof.
		const entry = "framework/interface/general/config.ts";
		const source = readFileSync(path.join(REPO_ROOT, entry), "utf8");
		const declared = [...source.matchAll(/\bexport\s+(?:type|interface|const|class|function)\s+([A-Za-z_$][\w$]*)/g)]
			.map(match => match[1]!);
		const reexported = [...source.matchAll(/\bexport\s+(?:type\s+)?\{([^}]*)\}/g)]
			.flatMap(match =>
				match[1]!.split(",").map(item => item.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]!.trim()),
			)
			.filter(name => name.length > 0);
		const exported = [...declared, ...reexported];
		expect(exported.sort()).toEqual(["ExtensionConfigError", "getConfig"]);

		for (const name of [
			"ConfigLoadError",
			"ConfigReader",
			"ConfigParser",
			"ConfigSource",
			"ConfigReadOptions",
			"readConfig",
			"readConfigDocument",
			"findConfigFailure",
			"describeValue",
			"isScheduledWait",
			"SCHEDULED_WAIT_TEXT",
		]) {
			expect(exported).not.toContain(name);
		}
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
