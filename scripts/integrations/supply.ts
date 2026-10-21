/**
 * Offline supply analysis for one adapter.
 *
 * The adapter's `defineAdapterPort` call is the assembly source. This module reads that source and
 * its reachable adapter-local factories; it never imports, executes or instantiates an adapter,
 * extension, native host or delivery. A delivery is supplied only when a canonical
 * `defineAdapterDelivery` construction is reachable from the binding factory and the required
 * members are present in the constructed payload's typed shape.
 *
 * Structural presence is not semantic correctness: an implementation can still be wrong after this
 * analysis reports it provided. Selected extension assembly sources may carry the canonical
 * `AdapterFactoryOutput` witness on an actual adapter factory call; that concrete output contract
 * refines a conditionally bound member for the assembly actually written. The witness is a trusted
 * declaration, not proof that a native provider registered, that a factory body ran, or that the
 * adapter is semantically correct.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript-compiler";
import {
	analyzeAssemblyOutputs,
	evaluateAssemblyPortMember,
	type AssemblyAnalysis,
} from "./assembly";
import type {
	ContractSupply,
	IntegrationContract,
	IntegrationDiagnostic,
	SessionFactsField,
	SessionFactsFieldReport,
	SessionFactsFieldStatus,
	SourceLocation,
	SupplyOptions,
	SupplyResult,
	SupplyStatus,
} from "./model";

const ADAPTER_AUTHORING_RELATIVE = "framework/runtime/adapter-authoring.ts";
const PORT_RELATIVE = "framework/runtime/port.ts";
const SESSION_FACTS_RELATIVE = "framework/interface/session/details/facts.ts";
const SESSION_FACTS_MAPPING_HELPER = "defineSessionFactsMapping";
const UNAVAILABLE_FACT_HELPER = "unavailableFact";
const MISSING_IMPLEMENTATION_MODULE = "missing-implementations";
const MAX_REACHABLE_NODES = 50_000;

/* -------------------------------------------------------------------------------------------------
 * Small, shared source helpers
 * ----------------------------------------------------------------------------------------------- */

function pathKey(file: string): string {
	const resolved = path.resolve(file);
	return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function relativeFile(root: string, file: string): string {
	return path.relative(root, file).split(path.sep).join("/");
}

function locationOf(root: string, node: ts.Node): SourceLocation {
	const source = node.getSourceFile();
	const position = source.getLineAndCharacterOfPosition(node.getStart(source));
	return { file: relativeFile(root, source.fileName), line: position.line + 1, column: position.character + 1 };
}

function diagnostic(
	root: string,
	code: string,
	node: ts.Node,
	message: string,
	suggestion: string,
): IntegrationDiagnostic {
	return { ...locationOf(root, node), code, message, suggestion };
}

function adapterDiagnostic(root: string, adapterDir: string, code: string, message: string, suggestion: string): IntegrationDiagnostic {
	return {
		file: relativeFile(root, adapterDir),
		line: 1,
		column: 1,
		code,
		message,
		suggestion,
	};
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
	let current = expression;
	for (;;) {
		if (
			ts.isParenthesizedExpression(current) ||
			ts.isAsExpression(current) ||
			ts.isSatisfiesExpression(current) ||
			ts.isNonNullExpression(current) ||
			ts.isTypeAssertionExpression(current)
		) {
			current = current.expression;
			continue;
		}
		return current;
	}
}

function symbolAt(checker: ts.TypeChecker, node: ts.Node): ts.Symbol | undefined {
	let symbol = checker.getSymbolAtLocation(node);
	if (symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0) {
		try {
			symbol = checker.getAliasedSymbol(symbol);
		} catch {
			// An unresolved alias is reported by its declaration inspection, not thrown here.
		}
	}
	return symbol;
}

function rawSymbolAt(checker: ts.TypeChecker, node: ts.Node): ts.Symbol | undefined {
	return checker.getSymbolAtLocation(node);
}

function declaredName(declaration: ts.Declaration): string | undefined {
	const named = declaration as ts.Declaration & { readonly name?: ts.DeclarationName };
	const name = named.name;
	if (name !== undefined && (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name))) return name.text;
	return undefined;
}

function declarationIsCanonical(symbol: ts.Symbol, canonicalPathKey: string, name: string): boolean {
	for (const declaration of symbol.declarations ?? []) {
		if (pathKey(declaration.getSourceFile().fileName) !== canonicalPathKey) continue;
		if (declaredName(declaration) === name) return true;
	}
	return false;
}

function isCanonicalReference(
	checker: ts.TypeChecker,
	expression: ts.Expression,
	canonicalPathKey: string,
	name: string,
	seen: Set<ts.Node> = new Set(),
): boolean {
	const target = unwrapExpression(expression);
	if (seen.has(target)) return false;
	seen.add(target);
	const symbol = symbolAt(checker, target);
	if (symbol !== undefined && declarationIsCanonical(symbol, canonicalPathKey, name)) return true;
	const initializer = resolveInitializer(target, checker, new Set());
	if (initializer !== undefined && initializer !== target) {
		return isCanonicalReference(checker, initializer, canonicalPathKey, name, seen);
	}
	return false;
}

function resolveInitializer(expression: ts.Expression, checker: ts.TypeChecker, seen: Set<ts.Node>): ts.Expression | undefined {
	const target = unwrapExpression(expression);
	if (seen.has(target)) return undefined;
	seen.add(target);
	let symbol: ts.Symbol | undefined;
	if (ts.isIdentifier(target) || ts.isPropertyAccessExpression(target)) symbol = symbolAt(checker, target);
	if (symbol === undefined) return undefined;
	for (const declaration of symbol.declarations ?? []) {
		if (
			ts.isVariableDeclaration(declaration) ||
			ts.isPropertyAssignment(declaration) ||
			ts.isPropertyDeclaration(declaration)
		) {
			const initializer = declaration.initializer;
			if (initializer !== undefined) {
				const resolved = unwrapExpression(initializer);
				if (resolved !== target) return resolved;
			}
		}
	}
	return undefined;
}

function resolveObjectLiteral(
	expression: ts.Expression,
	checker: ts.TypeChecker,
	seen: Set<ts.Node> = new Set(),
): ts.ObjectLiteralExpression | undefined {
	const target = unwrapExpression(expression);
	if (ts.isObjectLiteralExpression(target)) return target;
	if (seen.has(target)) return undefined;
	seen.add(target);
	const initializer = resolveInitializer(target, checker, new Set());
	if (initializer === undefined || initializer === target) return undefined;
	return resolveObjectLiteral(initializer, checker, seen);
}

function constantStringOf(expression: ts.Expression, checker: ts.TypeChecker, seen: Set<ts.Node> = new Set()): string | undefined {
	const target = unwrapExpression(expression);
	if (seen.has(target)) return undefined;
	seen.add(target);
	if (ts.isStringLiteral(target) || ts.isNoSubstitutionTemplateLiteral(target)) return target.text;
	if (ts.isIdentifier(target) || ts.isPropertyAccessExpression(target)) {
		const initializer = resolveInitializer(target, checker, new Set());
		if (initializer !== undefined && initializer !== target) return constantStringOf(initializer, checker, seen);
	}
	return undefined;
}

function typeIncludesUndefined(checker: ts.TypeChecker, type: ts.Type, seen: Set<ts.Type> = new Set()): boolean {
	if (seen.has(type)) return false;
	seen.add(type);
	if ((type.flags & ts.TypeFlags.Undefined) !== 0) return true;
	if (type.isUnion()) return type.types.some(part => typeIncludesUndefined(checker, part, seen));
	if ((type.flags & ts.TypeFlags.TypeParameter) !== 0) {
		const constraint = checker.getBaseConstraintOfType(type);
		return constraint !== undefined && typeIncludesUndefined(checker, constraint, seen);
	}
	return false;
}

function propertyType(checker: ts.TypeChecker, symbol: ts.Symbol, fallback: ts.Node): ts.Type {
	return checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration ?? fallback);
}

type Presence = "present" | "optional" | "missing" | "unresolved";

interface PathPresence {
	readonly presence: Presence;
}

function propertyPresence(type: ts.Type, segment: string, checker: ts.TypeChecker, node: ts.Node): { presence: Presence; type?: ts.Type } {
	if ((type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0) return { presence: "unresolved" };
	if (type.isUnion()) {
		let present = 0;
		let optional = 0;
		let missing = 0;
		let unresolved = 0;
		let resolvedType: ts.Type | undefined;
		for (const part of type.types) {
			if ((part.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)) !== 0) {
				optional += 1;
				continue;
			}
			const result = propertyPresence(part, segment, checker, node);
			if (result.presence === "present") {
				present += 1;
				resolvedType = result.type;
			} else if (result.presence === "optional") {
				optional += 1;
				resolvedType = result.type;
			} else if (result.presence === "unresolved") unresolved += 1;
			else missing += 1;
		}
		if (unresolved > 0) return { presence: "unresolved" };
		if (present === 0 && optional === 0) return { presence: "missing" };
		if (present > 0 && optional === 0 && missing === 0) return { presence: "present", type: resolvedType };
		return { presence: "optional", type: resolvedType };
	}
	const symbol = checker.getPropertyOfType(type, segment);
	if (symbol === undefined) return { presence: "missing" };
	const optional = (symbol.flags & ts.SymbolFlags.Optional) !== 0;
	return { presence: optional ? "optional" : "present", type: propertyType(checker, symbol, node) };
}

function pathPresence(type: ts.Type, pathSegments: readonly string[], checker: ts.TypeChecker, node: ts.Node): PathPresence {
	let current = type;
	let optional = false;
	for (let index = 0; index < pathSegments.length; index++) {
		const segment = pathSegments[index];
		const result = propertyPresence(current, segment, checker, node);
		if (result.presence === "missing") return { presence: optional ? "optional" : "missing" };
		if (result.presence === "unresolved") return { presence: "unresolved" };
		if (result.presence === "optional") optional = true;
		if (result.type === undefined) return { presence: "unresolved" };
		if (index < pathSegments.length - 1) current = checker.getNonNullableType(result.type);
	}
	return { presence: optional ? "optional" : "present" };
}

/* -------------------------------------------------------------------------------------------------
 * Adapter inspection model
 * ----------------------------------------------------------------------------------------------- */

export interface PortMemberModel {
	readonly name: string;
	readonly optional: boolean;
	readonly declaration: ts.Declaration;
}

export interface PortModel {
	readonly declaration: ts.InterfaceDeclaration;
	readonly members: readonly PortMemberModel[];
	readonly byName: ReadonlyMap<string, PortMemberModel>;
}

export interface AdapterBindingEntry {
	readonly name: string;
	readonly node: ts.Node;
	/** The expression written as the binding's value, when one exists. */
	readonly value?: ts.Expression;
	/** Function-like nodes or expressions the factory is written as. */
	readonly factoryNodes: readonly ts.Node[];
	readonly status: "factory" | "unavailable" | "conditional" | "generated-missing" | "undefined" | "unresolved";
	readonly reason?: string;
	readonly implementation?: ts.Node;
}

export interface AdapterDefinitionModel {
	/** The file holding the defineAdapterPort call. */
	readonly sourceFile: ts.SourceFile;
	readonly call: ts.CallExpression;
	readonly bindingsFile: ts.SourceFile;
	readonly bindings: ts.ObjectLiteralExpression;
	readonly contextType?: string;
	readonly contextFile?: string;
}

export interface AdapterInspection {
	readonly root: string;
	readonly adapter: string;
	readonly adapterDir: string;
	readonly exists: boolean;
	readonly files: readonly string[];
	readonly program?: ts.Program;
	readonly checker?: ts.TypeChecker;
	readonly port?: PortModel;
	readonly deliveryKinds: ReadonlySet<string>;
	readonly definition?: AdapterDefinitionModel;
	readonly bindings: ReadonlyMap<string, AdapterBindingEntry>;
	readonly bindingsDynamic: boolean;
	/** Concrete output evidence from selected extension sources; absent for bare adapter analysis. */
	readonly assembly?: AssemblyAnalysis;
	readonly diagnostics: readonly IntegrationDiagnostic[];
}

interface InspectionBuilder {
	readonly root: string;
	readonly adapter: string;
	readonly adapterDir: string;
	readonly adapterDirKey: string;
	readonly authoringPathKey: string;
	readonly diagnostics: IntegrationDiagnostic[];
	readonly diagnosticKeys: Set<string>;
}

function addDiagnostic(builder: InspectionBuilder, item: IntegrationDiagnostic): void {
	const key = `${item.code}|${item.file}|${item.line}|${item.column}|${item.message}`;
	if (builder.diagnosticKeys.has(key)) return;
	builder.diagnosticKeys.add(key);
	builder.diagnostics.push(item);
}

function collectSourceFiles(directory: string): string[] {
	const files: string[] = [];
	const walk = (current: string): void => {
		let entries: import("node:fs").Dirent<string>[];
		try {
			entries = readdirSync(current, { withFileTypes: true });
		} catch {
			return;
		}
		entries.sort((left, right) => left.name.localeCompare(right.name));
		for (const entry of entries) {
			const full = path.join(current, entry.name);
			if (entry.isDirectory()) walk(full);
			else if (entry.isFile() && /\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) files.push(full);
		}
	};
	walk(directory);
	return files;
}

/** Selected extension sources join the analysis program as roots, never as adapter sources. */
function resolveAssemblyFiles(root: string, files: readonly string[] | undefined): string[] {
	if (files === undefined || files.length === 0) return [];
	const seen = new Set<string>();
	const resolved: string[] = [];
	for (const file of files) {
		const absolute = path.resolve(root, file);
		if (!/\.tsx?$/.test(absolute) || absolute.endsWith(".d.ts")) continue;
		try {
			if (!existsSync(absolute) || !statSync(absolute).isFile()) continue;
		} catch {
			continue;
		}
		const key = pathKey(absolute);
		if (seen.has(key)) continue;
		seen.add(key);
		resolved.push(absolute);
	}
	return resolved;
}

function createProgram(rootNames: readonly string[]): { program: ts.Program; checker: ts.TypeChecker } | undefined {
	if (rootNames.length === 0) return undefined;
	const program = ts.createProgram({
		rootNames: [...rootNames],
		options: {
			target: ts.ScriptTarget.ES2020,
			module: ts.ModuleKind.ESNext,
			moduleResolution: ts.ModuleResolutionKind.Bundler,
			jsx: ts.JsxEmit.Preserve,
			strict: true,
			noImplicitAny: false,
			noEmit: true,
			skipLibCheck: true,
			allowJs: false,
			checkJs: false,
			resolveJsonModule: true,
			types: [],
		},
	});
	return { program, checker: program.getTypeChecker() };
}

function findCanonicalSourceFile(program: ts.Program, root: string, relative: string): ts.SourceFile | undefined {
	const wanted = pathKey(path.resolve(root, relative));
	for (const sourceFile of program.getSourceFiles()) {
		if (pathKey(sourceFile.fileName) === wanted) return sourceFile;
	}
	return undefined;
}

function readPortModel(program: ts.Program, checker: ts.TypeChecker, root: string): { port?: PortModel; sourceFile?: ts.SourceFile } {
	const sourceFile = findCanonicalSourceFile(program, root, PORT_RELATIVE);
	if (sourceFile === undefined) return {};
	const declaration = sourceFile.statements.find(
		(statement): statement is ts.InterfaceDeclaration =>
			ts.isInterfaceDeclaration(statement) && statement.name.text === "HarnessPort",
	);
	if (declaration === undefined) return { sourceFile };
	const symbol = checker.getSymbolAtLocation(declaration.name);
	if (symbol === undefined) return { sourceFile };
	const interfaceType = checker.getDeclaredTypeOfSymbol(symbol);
	const members = checker.getPropertiesOfType(interfaceType).map(member => {
		const memberDeclaration = member.declarations?.find((candidate): candidate is ts.PropertySignature => ts.isPropertySignature(candidate));
		const optional =
			(member.flags & ts.SymbolFlags.Optional) !== 0 ||
			(memberDeclaration !== undefined && memberDeclaration.questionToken !== undefined);
		const declarationNode = member.declarations?.[0] ?? declaration;
		return {
			name: member.name,
			optional,
			declaration: declarationNode,
		} satisfies PortMemberModel;
	});
	members.sort((left, right) => left.declaration.getStart(sourceFile) - right.declaration.getStart(sourceFile));
	return {
		sourceFile,
		port: {
			declaration,
			members,
			byName: new Map(members.map(member => [member.name, member])),
		},
	};
}

function readDeliveryKinds(program: ts.Program, checker: ts.TypeChecker, root: string): Set<string> {
	const sourceFile = findCanonicalSourceFile(program, root, ADAPTER_AUTHORING_RELATIVE);
	if (sourceFile === undefined) return new Set();
	const declaration = sourceFile.statements.find(
		(statement): statement is ts.InterfaceDeclaration =>
			ts.isInterfaceDeclaration(statement) && statement.name.text === "AdapterDeliveryMap",
	);
	if (declaration === undefined) return new Set();
	const symbol = checker.getSymbolAtLocation(declaration.name);
	if (symbol === undefined) return new Set();
	const type = checker.getDeclaredTypeOfSymbol(symbol);
	return new Set(checker.getPropertiesOfType(type).map(property => property.name));
}

interface FoundDefinition {
	readonly call: ts.CallExpression;
	readonly sourceFile: ts.SourceFile;
}

function findDefinitions(
	program: ts.Program,
	checker: ts.TypeChecker,
	adapterFiles: readonly string[],
	authoringPathKey: string,
): FoundDefinition[] {
	const adapterKeys = new Set(adapterFiles.map(pathKey));
	const found: FoundDefinition[] = [];
	for (const sourceFile of program.getSourceFiles()) {
		if (!adapterKeys.has(pathKey(sourceFile.fileName))) continue;
		const visit = (node: ts.Node): void => {
			if (ts.isCallExpression(node) && isCanonicalReference(checker, node.expression, authoringPathKey, "defineAdapterPort")) {
				found.push({ call: node, sourceFile });
			}
			ts.forEachChild(node, visit);
		};
		visit(sourceFile);
	}
	found.sort((left, right) => {
		const file = left.sourceFile.fileName.localeCompare(right.sourceFile.fileName);
		return file !== 0 ? file : left.call.getStart(left.sourceFile) - right.call.getStart(right.sourceFile);
	});
	return found;
}

function readContextType(checker: ts.TypeChecker, call: ts.CallExpression): { contextType?: string; contextFile?: string } {
	let typeNode = call.typeArguments?.[0];
	if (typeNode === undefined) {
		const callType = checker.getTypeAtLocation(call);
		const reference = callType as ts.TypeReference;
		if (reference.target !== undefined) {
			try {
				const typeArguments = checker.getTypeArguments(reference);
				if (typeArguments.length > 0) {
					const type = typeArguments[0];
					const symbol = type.aliasSymbol ?? type.getSymbol();
					const declaration = symbol?.declarations?.[0];
					return {
						contextType: checker.typeToString(type),
						contextFile: declaration === undefined ? undefined : declaration.getSourceFile().fileName,
					};
				}
			} catch {
				// A non-generic call type has no inferable context argument.
			}
		}
		return {};
	}
	const type = checker.getTypeFromTypeNode(typeNode);
	const symbol = type.aliasSymbol ?? type.getSymbol();
	const declaration = symbol?.declarations?.[0];
	return {
		contextType: checker.typeToString(type),
		contextFile: declaration === undefined ? typeNode.getSourceFile().fileName : declaration.getSourceFile().fileName,
	};
}

function generatedImportsIn(source: ts.SourceFile): Map<string, { module: string; importedName: string }> {
	const imports = new Map<string, { module: string; importedName: string }>();
	for (const statement of source.statements) {
		if (!ts.isImportDeclaration(statement)) continue;
		const specifier = statement.moduleSpecifier;
		if (!ts.isStringLiteral(specifier)) continue;
		const normalized = specifier.text.split("\\").join("/");
		const base = normalized.slice(normalized.lastIndexOf("/") + 1);
		if (base !== MISSING_IMPLEMENTATION_MODULE) continue;
		const bindings = statement.importClause?.namedBindings;
		if (bindings === undefined || !ts.isNamedImports(bindings)) continue;
		for (const element of bindings.elements) {
			imports.set(element.name.text, {
				module: specifier.text,
				importedName: element.propertyName?.text ?? element.name.text,
			});
		}
	}
	return imports;
}

function generatedImportOf(checker: ts.TypeChecker, expression: ts.Expression): { module: string; importedName: string } | undefined {
	const target = unwrapExpression(expression);
	if (!ts.isIdentifier(target)) return undefined;
	const fromSyntax = generatedImportsIn(target.getSourceFile()).get(target.text);
	if (fromSyntax === undefined) return undefined;
	const raw = rawSymbolAt(checker, target);
	if (raw !== undefined && (raw.flags & ts.SymbolFlags.Alias) !== 0) {
		try {
			const resolved = checker.getAliasedSymbol(raw);
			if ((resolved.declarations ?? []).some(declaration => !ts.isImportSpecifier(declaration))) return undefined;
		} catch {
			// An unresolved module leaves no aliased declaration; the generated reference stays missing.
		}
	}
	return fromSyntax;
}

function functionNodesOf(checker: ts.TypeChecker, expression: ts.Expression, seen: Set<ts.Node> = new Set()): ts.Node[] {
	const target = unwrapExpression(expression);
	if (seen.has(target)) return [];
	seen.add(target);
	if (ts.isArrowFunction(target) || ts.isFunctionExpression(target) || ts.isFunctionDeclaration(target) || ts.isMethodDeclaration(target)) {
		return [target];
	}
	if (ts.isConditionalExpression(target)) {
		return [...functionNodesOf(checker, target.whenTrue, seen), ...functionNodesOf(checker, target.whenFalse, seen)];
	}
	if (ts.isCallExpression(target)) return [target];
	if (ts.isIdentifier(target) || ts.isPropertyAccessExpression(target)) {
		const symbol = symbolAt(checker, target);
		for (const declaration of symbol?.declarations ?? []) {
			if (
				ts.isFunctionDeclaration(declaration) ||
				ts.isMethodDeclaration(declaration)
			) {
				return [declaration];
			}
			if (
				ts.isVariableDeclaration(declaration) ||
				ts.isPropertyAssignment(declaration) ||
				ts.isPropertyDeclaration(declaration)
			) {
				if (declaration.initializer !== undefined) return functionNodesOf(checker, declaration.initializer, seen);
			}
		}
	}
	return [];
}

interface RawBinding {
	readonly name: string;
	readonly node: ts.Node;
	readonly value?: ts.Expression;
	readonly method?: ts.MethodDeclaration;
}

interface FlattenResult {
	readonly entries: Map<string, RawBinding>;
	readonly dynamic: boolean;
}

function propertyNameOf(name: ts.PropertyName, checker: ts.TypeChecker): string | undefined {
	if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
	if (ts.isComputedPropertyName(name)) return constantStringOf(name.expression, checker);
	return undefined;
}

function flattenBindings(
	object: ts.ObjectLiteralExpression,
	checker: ts.TypeChecker,
	builder: InspectionBuilder,
	seen: Set<ts.Node> = new Set(),
): FlattenResult {
	const entries = new Map<string, RawBinding>();
	let dynamic = false;
	for (const property of object.properties) {
		if (ts.isSpreadAssignment(property)) {
			const spread = resolveObjectLiteral(property.expression, checker);
			if (spread === undefined) {
				dynamic = true;
				addDiagnostic(
					builder,
					diagnostic(
						builder.root,
						"supply/dynamic-bindings",
						property,
						"A spread in the adapter port bindings is not statically resolvable to an object literal.",
						"Write the binding object explicitly or resolve the spread through a module-level constant object literal.",
					),
				);
				continue;
			}
			if (seen.has(spread)) {
				dynamic = true;
				addDiagnostic(
					builder,
					diagnostic(
						builder.root,
						"supply/dynamic-bindings",
						property,
						"The adapter port bindings contain a cyclic spread.",
						"Replace the cyclic composition with an explicit binding object.",
					),
				);
				continue;
			}
			seen.add(spread);
			const nested = flattenBindings(spread, checker, builder, seen);
			dynamic = dynamic || nested.dynamic;
			for (const [name, entry] of nested.entries) entries.set(name, entry);
			continue;
		}
		if (ts.isMethodDeclaration(property)) {
			const name = propertyNameOf(property.name, checker);
			if (name === undefined) {
				dynamic = true;
				addDiagnostic(
					builder,
					diagnostic(builder.root, "supply/dynamic-bindings", property, "A computed binding name is not statically resolvable.", "Use a literal binding name."),
				);
				continue;
			}
			entries.set(name, { name, node: property, method: property });
			continue;
		}
		if (ts.isPropertyAssignment(property)) {
			const name = propertyNameOf(property.name, checker);
			if (name === undefined) {
				dynamic = true;
				addDiagnostic(
					builder,
					diagnostic(builder.root, "supply/dynamic-bindings", property, "A computed binding name is not statically resolvable.", "Use a literal binding name."),
				);
				continue;
			}
			entries.set(name, { name, node: property, value: property.initializer });
			continue;
		}
		if (ts.isShorthandPropertyAssignment(property)) {
			entries.set(property.name.text, { name: property.name.text, node: property, value: property.name });
			continue;
		}
		dynamic = true;
		addDiagnostic(
			builder,
			diagnostic(builder.root, "supply/dynamic-bindings", property, "This binding form is not statically analyzable.", "Write each binding as a property assignment or method."),
		);
	}
	return { entries, dynamic };
}

function classifyBinding(
	raw: RawBinding,
	checker: ts.TypeChecker,
	builder: InspectionBuilder,
	port: PortModel | undefined,
	expectedFactoryType: ts.Type | undefined,
): AdapterBindingEntry {
	const value = raw.method !== undefined ? undefined : raw.value === undefined ? undefined : unwrapExpression(raw.value);
	if (raw.method !== undefined) {
		return {
			name: raw.name,
			node: raw.node,
			factoryNodes: [raw.method],
			status: "factory",
			implementation: raw.method,
		};
	}
	if (value === undefined) {
		return { name: raw.name, node: raw.node, factoryNodes: [], status: "unresolved", reason: "The binding has no value." };
	}
	if (ts.isCallExpression(value) && isCanonicalReference(checker, value.expression, builder.authoringPathKey, "unavailablePortMember")) {
		const reasonExpression = value.arguments[0];
		const reason = reasonExpression === undefined ? undefined : constantStringOf(reasonExpression, checker);
		if (reason === undefined) {
			addDiagnostic(
				builder,
				diagnostic(
					builder.root,
					"supply/dynamic-unavailable",
					value,
					"The unavailable-port reason is not a static string.",
					"State the adapter's static absence with a string literal reason.",
				),
			);
			return {
				name: raw.name,
				node: raw.node,
				value,
				factoryNodes: [],
				status: "unresolved",
				reason: "The unavailable-port reason is not statically known.",
			};
		}
		return { name: raw.name, node: raw.node, value, factoryNodes: [], status: "unavailable", reason };
	}
	if (ts.isConditionalExpression(value)) {
		return {
			name: raw.name,
			node: raw.node,
			value,
			factoryNodes: functionNodesOf(checker, value),
			status: "conditional",
			reason: "The binding factory is selected by a runtime condition.",
			implementation: value,
		};
	}
	if (value.kind === ts.SyntaxKind.UndefinedKeyword) {
		return { name: raw.name, node: raw.node, value, factoryNodes: [], status: "undefined", reason: "The binding is statically undefined." };
	}
	if (ts.isIdentifier(value) && value.text === "undefined") {
		return { name: raw.name, node: raw.node, value, factoryNodes: [], status: "undefined", reason: "The binding is statically undefined." };
	}
	const generated = generatedImportOf(checker, value);
	if (generated !== undefined) {
		return {
			name: raw.name,
			node: raw.node,
			value,
			factoryNodes: [],
			status: "generated-missing",
			reason: `The generated assembly imports ${generated.importedName} from ${generated.module}; that implementation export is still missing.`,
		};
	}
	const nodes = functionNodesOf(checker, value);
	if (nodes.length === 0) {
		addDiagnostic(
			builder,
			diagnostic(
				builder.root,
				"supply/dynamic-binding",
				value,
				`The binding factory for "${raw.name}" is not statically resolvable to a function or arrow function.`,
				"Bind a module-level factory function reference or an inline function expression.",
			),
		);
		return { name: raw.name, node: raw.node, value, factoryNodes: [], status: "unresolved", reason: "The binding factory is not statically resolvable." };
	}
	const type = checker.getTypeAtLocation(value);
	const nonNull = checker.getNonNullableType(type);
	const signatures = checker.getSignaturesOfType(nonNull, ts.SignatureKind.Call);
	if (signatures.length === 0) {
		addDiagnostic(
			builder,
			diagnostic(
				builder.root,
				"supply/dynamic-binding",
				value,
				`The value bound to "${raw.name}" has no call signature and cannot be a factory.`,
				"Provide a factory function for this HarnessPort member.",
			),
		);
		return { name: raw.name, node: raw.node, value, factoryNodes: nodes, status: "unresolved", reason: "The binding has no call signature." };
	}
	const returnType = signatures[0].getReturnType();
	if ((returnType.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0) {
		addDiagnostic(
			builder,
			diagnostic(
				builder.root,
				"supply/untyped-binding",
				value,
				`The factory return type for "${raw.name}" is any/unknown, so its port supply cannot be established.`,
				"Give the factory its real HarnessPort return type (without assertions to any).",
			),
		);
		return { name: raw.name, node: raw.node, value, factoryNodes: nodes, status: "unresolved", reason: "The factory return type is any/unknown." };
	}
	const member = port?.byName.get(raw.name);
	if (expectedFactoryType !== undefined && !checker.isTypeAssignableTo(nonNull, expectedFactoryType)) {
		addDiagnostic(
			builder,
			diagnostic(
				builder.root,
				"supply/incompatible-binding",
				value,
				`The factory bound to "${raw.name}" does not have the binding's required factory shape.`,
				"Correct the factory's context and return types so the HarnessPort member is genuinely supplied.",
			),
		);
		return {
			name: raw.name,
			node: raw.node,
			value,
			factoryNodes: nodes,
			status: "unresolved",
			reason: "The factory is not assignable to the binding's required factory shape.",
		};
	}
	if (typeIncludesUndefined(checker, returnType)) {
		if (member?.optional === true) {
			return {
				name: raw.name,
				node: raw.node,
				value,
				factoryNodes: nodes,
				status: "conditional",
				reason: "The optional factory can answer undefined at binding creation.",
				implementation: value,
			};
		}
		addDiagnostic(
			builder,
			diagnostic(
				builder.root,
				"supply/unresolved-binding",
				value,
				`The required factory for "${raw.name}" can answer undefined.`,
				"A required port member must always return its implementation.",
			),
		);
		return { name: raw.name, node: raw.node, value, factoryNodes: nodes, status: "unresolved", reason: "The required factory can answer undefined." };
	}
	return {
		name: raw.name,
		node: raw.node,
		value,
		factoryNodes: nodes,
		status: "factory",
		implementation: value,
	};
}

function readBindings(
	object: ts.ObjectLiteralExpression,
	checker: ts.TypeChecker,
	builder: InspectionBuilder,
	port: PortModel | undefined,
	expectedFactoryTypes: ReadonlyMap<string, ts.Type>,
): { entries: Map<string, AdapterBindingEntry>; dynamic: boolean } {
	const flattened = flattenBindings(object, checker, builder);
	const entries = new Map<string, AdapterBindingEntry>();
	for (const [name, raw] of flattened.entries) {
		entries.set(name, classifyBinding(raw, checker, builder, port, expectedFactoryTypes.get(name)));
	}
	if (port !== undefined) {
		for (const name of entries.keys()) {
			if (!port.byName.has(name)) {
				const entry = entries.get(name);
				if (entry !== undefined) {
					addDiagnostic(
						builder,
						diagnostic(
							builder.root,
							"supply/unknown-port-member",
							entry.node,
							`"${name}" is not a HarnessPort member.`,
							"Remove the extra binding or add the member to the framework-owned HarnessPort contract first.",
						),
					);
				}
			}
		}
	}
	return { entries, dynamic: flattened.dynamic };
}

/**
 * Reads one adapter's source structure. Exported because generation edits the same bounded assembly
 * expression this analysis reads; it is not a second integration API.
 */
export function inspectAdapterSource(
	rootInput: string,
	adapter: string,
	assemblyFiles?: readonly string[],
): AdapterInspection {
	const root = path.resolve(rootInput);
	const adaptersRoot = path.resolve(root, "adapters");
	const selected = path.isAbsolute(adapter) || adapter.includes("/") || adapter.includes("\\")
		? path.resolve(root, adapter)
		: path.resolve(adaptersRoot, adapter);
	const relativeSelection = path.relative(adaptersRoot, selected);
	const name = relativeSelection.split(path.sep)[0] ?? "";
	const invalidTarget = relativeSelection === "" || relativeSelection === ".." ||
		relativeSelection.startsWith(`..${path.sep}`) || path.isAbsolute(relativeSelection) ||
		!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(name);
	// A source-file or subdirectory selection identifies its owning adapter, not a new directory.
	const adapterDir = invalidTarget ? adaptersRoot : path.join(adaptersRoot, name);
	if (invalidTarget) {
		return {
			root, adapter, adapterDir, exists: false, files: [], deliveryKinds: new Set(),
			bindings: new Map(), bindingsDynamic: false,
			diagnostics: [adapterDiagnostic(root, adaptersRoot, "supply/adapter-target",
				"Select an adapter name or a source path inside one adapters/<name>/ directory.",
				"Keep adapter generation inside the project's adapters tree; use --root for another project.")],
		};
	}
	const exists = existsSync(adapterDir) && statSync(adapterDir).isDirectory();
	const adapterDirKey = pathKey(adapterDir);
	const authoringPathKey = pathKey(path.resolve(root, ADAPTER_AUTHORING_RELATIVE));
	const diagnostics: IntegrationDiagnostic[] = [];
	const builder: InspectionBuilder = {
		root,
		adapter,
		adapterDir,
		adapterDirKey,
		authoringPathKey,
		diagnostics,
		diagnosticKeys: new Set(),
	};
	const adapterFiles = exists ? collectSourceFiles(adapterDir) : [];
	const canonicalFiles = [
		path.resolve(root, ADAPTER_AUTHORING_RELATIVE),
		path.resolve(root, PORT_RELATIVE),
		path.resolve(root, SESSION_FACTS_RELATIVE),
	].filter(file => existsSync(file));
	const selectedAssemblyFiles = resolveAssemblyFiles(root, assemblyFiles);
	const sourceFiles = [...new Set([...adapterFiles, ...canonicalFiles, ...selectedAssemblyFiles])];
	if (sourceFiles.length === 0) {
		return {
			root,
			adapter,
			adapterDir,
			exists,
			files: adapterFiles,
			deliveryKinds: new Set(),
			bindings: new Map(),
			bindingsDynamic: false,
			diagnostics,
		};
	}
	let program: ts.Program;
	let checker: ts.TypeChecker;
	try {
		const created = createProgram(sourceFiles);
		if (created === undefined) {
			return {
				root,
				adapter,
				adapterDir,
				exists,
				files: adapterFiles,
				deliveryKinds: new Set(),
				bindings: new Map(),
				bindingsDynamic: false,
				diagnostics,
			};
		}
		program = created.program;
		checker = created.checker;
	} catch (error) {
		addDiagnostic(
			builder,
			adapterDiagnostic(
				root,
				adapterDir,
				"supply/program",
				`The adapter analysis program could not be created: ${error instanceof Error ? error.message : String(error)}`,
				"Correct the adapter source or its module-resolution setup.",
			),
		);
		return {
			root,
			adapter,
			adapterDir,
			exists,
			files: adapterFiles,
			deliveryKinds: new Set(),
			bindings: new Map(),
			bindingsDynamic: false,
			diagnostics,
		};
	}
	const portRead = readPortModel(program, checker, root);
	const port = portRead.port;
	if (exists && portRead.sourceFile === undefined) {
		addDiagnostic(
			builder,
			adapterDiagnostic(
				root,
				adapterDir,
				"supply/port-contract",
				"The canonical framework/runtime/port.ts source was not found in the analysis program.",
				"Run the checker from the repository root that contains the framework sources.",
			),
		);
	}
	const deliveryKinds = readDeliveryKinds(program, checker, root);
	if (exists && deliveryKinds.size === 0) {
		addDiagnostic(
			builder,
			adapterDiagnostic(
				root,
				adapterDir,
				"supply/delivery-contract",
				"The canonical AdapterDeliveryMap could not be read from framework/runtime/adapter-authoring.ts.",
				"Restore the canonical authoring source before analyzing delivery supply.",
			),
		);
	}
	const definitions = findDefinitions(program, checker, adapterFiles, authoringPathKey);
	if (definitions.length === 0) {
		if (exists && adapterFiles.length > 0) {
			addDiagnostic(
				builder,
				adapterDiagnostic(
					root,
					adapterDir,
					"supply/no-definition",
					"No defineAdapterPort assembly was found in this adapter's source.",
					"Declare the adapter's port with defineAdapterPort<Context>({...}) so its supply is inspectable.",
				),
			);
		}
		return { root, adapter, adapterDir, exists, files: adapterFiles, program, checker, port, deliveryKinds, bindings: new Map(), bindingsDynamic: false, diagnostics };
	}
	if (definitions.length > 1) {
		for (const definition of definitions) {
			addDiagnostic(
				builder,
				diagnostic(
					root,
					"supply/ambiguous-definition",
					definition.call,
					"More than one defineAdapterPort assembly was found in this adapter.",
					"Keep one module-level port assembly per adapter; select the intended adapter source explicitly.",
				),
			);
		}
		return { root, adapter, adapterDir, exists, files: adapterFiles, program, checker, port, deliveryKinds, bindings: new Map(), bindingsDynamic: false, diagnostics };
	}
	const found = definitions[0];
	const bindingsExpression = found.call.arguments[0];
	if (bindingsExpression === undefined) {
		addDiagnostic(
			builder,
			diagnostic(
				root,
				"supply/dynamic-definition",
				found.call,
				"The defineAdapterPort call has no bindings argument.",
				"Pass an explicit object literal of HarnessPort factories.",
			),
		);
		return { root, adapter, adapterDir, exists, files: adapterFiles, program, checker, port, deliveryKinds, bindings: new Map(), bindingsDynamic: false, diagnostics };
	}
	const bindings = resolveObjectLiteral(bindingsExpression, checker);
	if (bindings === undefined) {
		addDiagnostic(
			builder,
			diagnostic(
				root,
				"supply/dynamic-definition",
				bindingsExpression,
				"The defineAdapterPort bindings are not statically resolvable to an object literal.",
				"Declare the binding object literally or through a module-level constant object literal.",
			),
		);
		return { root, adapter, adapterDir, exists, files: adapterFiles, program, checker, port, deliveryKinds, bindings: new Map(), bindingsDynamic: true, diagnostics };
	}
	const expectedFactoryTypes = new Map<string, ts.Type>();
	const bindingsType = checker.getTypeAtLocation(bindingsExpression);
	for (const property of checker.getPropertiesOfType(bindingsType)) {
		expectedFactoryTypes.set(property.name, propertyType(checker, property, bindings));
	}
	const bindingRead = readBindings(bindings, checker, builder, port, expectedFactoryTypes);
	const context = readContextType(checker, found.call);
	const assembly = selectedAssemblyFiles.length === 0
		? undefined
		: analyzeAssemblyOutputs(program, checker, adapterDir, selectedAssemblyFiles, authoringPathKey);
	return {
		root,
		adapter,
		adapterDir,
		exists,
		files: adapterFiles,
		program,
		checker,
		port,
		deliveryKinds,
		definition: {
			sourceFile: found.sourceFile,
			call: found.call,
			bindingsFile: bindings.getSourceFile(),
			bindings,
			contextType: context.contextType,
			contextFile: context.contextFile === undefined ? undefined : relativeFile(root, context.contextFile),
		},
		bindings: bindingRead.entries,
		bindingsDynamic: bindingRead.dynamic,
		...(assembly === undefined ? {} : { assembly }),
		diagnostics,
	};
}

/* -------------------------------------------------------------------------------------------------
 * Delivery reachability and typed payload presence
 * ----------------------------------------------------------------------------------------------- */

interface DeliveryAnchor {
	readonly kind: string;
	readonly call: ts.CallExpression;
	readonly payload?: ts.Expression;
}

export interface DeliveryReachability {
	readonly anchors: readonly DeliveryAnchor[];
	readonly dynamicAnchors: readonly ts.CallExpression[];
	readonly truncated: boolean;
}

const ADAPTER_PORT_MEMBERS: Readonly<Record<string, string>> = {
	session: "onSession",
	disposal: "onDisposal",
	round: "onRound",
	context: "onSessionContext",
	turn: "onTurn",
	input: "onUserInput",
	run: "onRunInitiation",
	command: "registerCommand",
};

function fileInside(fileName: string, directoryKey: string): boolean {
	const key = pathKey(fileName);
	return key === directoryKey || key.startsWith(`${directoryKey}${path.sep}`);
}

export function collectDeliveryReachability(inspection: AdapterInspection, entry: AdapterBindingEntry): DeliveryReachability {
	const checker = inspection.checker;
	if (checker === undefined) return { anchors: [], dynamicAnchors: [], truncated: false };
	const authoringPathKey = pathKey(path.resolve(inspection.root, ADAPTER_AUTHORING_RELATIVE));
	const adapterDirKey = pathKey(inspection.adapterDir);
	const anchors: DeliveryAnchor[] = [];
	const dynamicAnchors: ts.CallExpression[] = [];
	const visitedFunctions = new Set<ts.Node>();
	const visitedNodes = new Set<ts.Node>();
	const queue: ts.Node[] = [...entry.factoryNodes];
	let truncated = false;
	let count = 0;
	const visit = (node: ts.Node): void => {
		if (truncated) return;
		count += 1;
		if (count > MAX_REACHABLE_NODES) {
			truncated = true;
			return;
		}
		if (visitedNodes.has(node)) return;
		visitedNodes.add(node);
		if (ts.isCallExpression(node)) {
			if (isCanonicalReference(checker, node.expression, authoringPathKey, "defineAdapterDelivery")) {
				const kindExpression = node.arguments[0];
				const kind = kindExpression === undefined ? undefined : constantStringOf(kindExpression, checker);
				if (kind === undefined || !inspection.deliveryKinds.has(kind)) {
					dynamicAnchors.push(node);
				} else {
					anchors.push({ kind, call: node, payload: node.arguments[1] });
				}
				return;
			}
			const targets = functionNodesOf(checker, node.expression);
			for (const target of targets) {
				const source = target.getSourceFile();
				if (fileInside(source.fileName, adapterDirKey)) queue.push(target);
			}
		}
		if (
			ts.isArrowFunction(node) ||
			ts.isFunctionExpression(node) ||
			ts.isFunctionDeclaration(node) ||
			ts.isMethodDeclaration(node) ||
			ts.isConstructorDeclaration(node)
		) {
			const body = node.body;
			if (body === undefined) return;
			if (visitedFunctions.has(node)) return;
			visitedFunctions.add(node);
		}
		ts.forEachChild(node, visit);
	};
	while (queue.length > 0) {
		const next = queue.shift();
		if (next === undefined) break;
		visit(next);
	}
	return { anchors, dynamicAnchors, truncated };
}

function propertyValueType(
	property: ts.ObjectLiteralElementLike,
	checker: ts.TypeChecker,
): ts.Type {
	if (ts.isPropertyAssignment(property)) return checker.getTypeAtLocation(property.initializer);
	if (ts.isShorthandPropertyAssignment(property)) return checker.getTypeAtLocation(property.name);
	if (ts.isMethodDeclaration(property)) return checker.getTypeAtLocation(property);
	return checker.getTypeAtLocation(property);
}

function objectPayloadPresence(
	inspection: AdapterInspection,
	payload: ts.Expression,
	segments: readonly string[],
): PathPresence {
	const checker = inspection.checker;
	if (checker === undefined) return { presence: "unresolved" };
	const object = resolveObjectLiteral(payload, checker);
	if (object === undefined) {
		const type = checker.getTypeAtLocation(payload);
		if ((type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0) return { presence: "unresolved" };
		return pathPresence(type, segments, checker, payload);
	}
	const [segment, ...remaining] = segments;
	let resolved: { readonly type?: ts.Type; readonly optional: boolean } | undefined;
	let uncertain = false;
	for (let index = object.properties.length - 1; index >= 0; index--) {
		const property = object.properties[index];
		if (ts.isSpreadAssignment(property)) {
			const type = checker.getTypeAtLocation(property.expression);
			if ((type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0) {
				uncertain = true;
				continue;
			}
			const presence = propertyPresence(type, segment, checker, property);
			if (presence.presence === "unresolved") uncertain = true;
			else if (presence.presence === "present" || presence.presence === "optional") {
				resolved = { type: presence.type, optional: presence.presence === "optional" };
				break;
			}
			continue;
		}
		const name = propertyNameOf(property.name, checker);
		if (name === undefined) {
			uncertain = true;
			continue;
		}
		if (name !== segment) continue;
		if (ts.isPropertyAssignment(property) && generatedImportOf(checker, property.initializer) !== undefined) {
			return { presence: "missing" };
		}
		resolved = { type: propertyValueType(property, checker), optional: false };
		break;
	}
	if (resolved === undefined) return { presence: uncertain ? "unresolved" : "missing" };
	if (remaining.length === 0) {
		if (resolved.type !== undefined && (resolved.type.flags & ts.TypeFlags.Undefined) !== 0) {
			return { presence: uncertain ? "unresolved" : "missing" };
		}
		return { presence: resolved.optional ? "optional" : "present" };
	}
	if (resolved.type === undefined) return { presence: "unresolved" };
	const nested = pathPresence(checker.getNonNullableType(resolved.type), remaining, checker, payload);
	return nested.presence === "missing" && uncertain ? { presence: "unresolved" } : nested;
}

function deliveryPayloadPresence(
	inspection: AdapterInspection,
	anchor: DeliveryAnchor,
	segments: readonly string[],
): PathPresence {
	if (inspection.checker === undefined || anchor.payload === undefined) return { presence: "unresolved" };
	if (segments.length === 0) return { presence: "present" };
	return objectPayloadPresence(inspection, anchor.payload, segments);
}

/* -------------------------------------------------------------------------------------------------
 * Contract projection
 * ----------------------------------------------------------------------------------------------- */

export interface DeliveryProjection {
	readonly portMember: string;
	/** Adapter delivery family whose construction must be reachable; absent for a port-only obligation. */
	readonly deliveryKind?: string;
	/** Typed payload member paths that must be present on every reachable construction. */
	readonly members: readonly string[];
	/** The member is present only on one kind of edge (for example close-out). */
	readonly edgeOptional?: boolean;
	readonly note?: string;
}

/**
 * Projects an extension-facing delivery path onto the adapter construction that carries it. Demand
 * names handlers and transports, while the adapter constructs payloads; this is the one place that
 * states which adapter-side construction each extension-facing path depends on.
 */
export function projectDeliveryContract(contractId: string): DeliveryProjection | undefined {
	if (!contractId.startsWith("delivery:")) return undefined;
	const path = contractId.slice("delivery:".length);
	const table: ReadonlyArray<{ readonly prefix: string; readonly projection: DeliveryProjection }> = [
		{ prefix: "session.capability.feedback.notify", projection: { portMember: "onSession", deliveryKind: "session", members: ["feedback"] } },
		{ prefix: "session.capability.state.read", projection: { portMember: "onSession", deliveryKind: "session", members: ["statePayloads"] } },
		{ prefix: "session.capability.state.write", projection: { portMember: "onSession", deliveryKind: "session", members: ["persist", "markers"] } },
		{ prefix: "session.feedback.notify", projection: { portMember: "onSession", deliveryKind: "session", members: ["feedback"] } },
		{ prefix: "round.feedback.notify", projection: { portMember: "onRound", deliveryKind: "round", members: ["feedback"] } },
		{ prefix: "round.closeOut.remaining", projection: { portMember: "onDisposal", members: [], edgeOptional: true, note: "the close-out wait exists only on a disposal edge" } },
		{ prefix: "turn.feedback.notify", projection: { portMember: "onTurn", deliveryKind: "turn", members: ["feedback"] } },
		{ prefix: "activity.feedback.notify", projection: { portMember: "onSession", deliveryKind: "session", members: ["feedback"], note: "the activity axis reuses the owner session transport" } },
		{ prefix: "context.feedback.notify", projection: { portMember: "onSessionContext", deliveryKind: "context", members: ["feedback"] } },
		{ prefix: "input.feedback.notify", projection: { portMember: "onUserInput", deliveryKind: "input", members: ["feedback"] } },
		{ prefix: "commit.feedback.notify", projection: { portMember: "onSession", deliveryKind: "session", members: ["feedback"] } },
		{ prefix: "unobserved.feedback.notify", projection: { portMember: "onSession", deliveryKind: "session", members: ["feedback"] } },
		{ prefix: "command.capability.feedback.notify", projection: { portMember: "registerCommand", deliveryKind: "command", members: ["feedback"] } },
		{ prefix: "command.capability.state.read", projection: { portMember: "registerCommand", deliveryKind: "command", members: [] } },
		{ prefix: "command.capability.state.write", projection: { portMember: "registerCommand", deliveryKind: "command", members: ["persist", "markers"] } },
		{ prefix: "command.feedback.notify", projection: { portMember: "registerCommand", deliveryKind: "command", members: ["feedback"] } },
		{ prefix: "command.canAcceptInput", projection: { portMember: "registerCommand", deliveryKind: "command", members: ["canAcceptInput"] } },
		{ prefix: "command.provider", projection: { portMember: "registerCommand", deliveryKind: "command", members: ["provider"] } },
		{ prefix: "command.state.read", projection: { portMember: "registerCommand", deliveryKind: "command", members: [] } },
		{ prefix: "command.state.write", projection: { portMember: "registerCommand", deliveryKind: "command", members: ["persist", "markers"] } },
		{ prefix: "action.feedback.notify", projection: { portMember: "registerCommand", deliveryKind: "command", members: ["feedback"] } },
		{ prefix: "action.canAcceptInput", projection: { portMember: "registerCommand", deliveryKind: "command", members: ["canAcceptInput"] } },
		{ prefix: "action.provider", projection: { portMember: "registerCommand", deliveryKind: "command", members: ["provider"] } },
		{ prefix: "initialization.feedback.notify", projection: { portMember: "onSession", deliveryKind: "session", members: ["feedback"] } },
		{ prefix: "initialization.subagents", projection: { portMember: "subagentIntegration", members: [], note: "the subagent integration is a port member, not a delivery payload" } },
	];
	for (const item of table) {
		if (path === item.prefix || path.startsWith(`${item.prefix}.`)) return item.projection;
	}
	// Also accept the adapter-facing spelling directly: delivery:<adapter-kind>.<payload path>.
	const separator = path.indexOf(".");
	if (separator > 0) {
		const family = path.slice(0, separator);
		const member = path.slice(separator + 1);
		const portMember = ADAPTER_PORT_MEMBERS[family];
		if (portMember !== undefined) {
			return { portMember, deliveryKind: family, members: [member] };
		}
	}
	return undefined;
}

export interface DeliveryMemberGap {
	readonly kind: string;
	readonly member: string;
	readonly anchor: ts.CallExpression;
	readonly payload: ts.ObjectLiteralExpression;
	readonly alreadyGenerated?: boolean;
}

export interface DeliveryGapInspection {
	readonly gaps: readonly DeliveryMemberGap[];
	readonly reason?: string;
}

/**
 * Locates concrete delivery payload properties that are absent at a reachable construction. Only a
 * statically resolvable object-literal payload and an absent top-level member are generated; a
 * property that exists with a wrong value, a non-literal payload, a dynamic kind or a nested-only
 * absence stays a diagnostic rather than being rewritten.
 */
export function inspectDeliveryMemberGaps(
	inspection: AdapterInspection,
	projection: DeliveryProjection,
): DeliveryGapInspection {
	const checker = inspection.checker;
	if (checker === undefined) return { gaps: [], reason: "The adapter analysis program is unavailable." };
	if (projection.deliveryKind === undefined) return { gaps: [], reason: "The obligation has no adapter delivery payload." };
	const entry = inspection.bindings.get(projection.portMember);
	if (entry === undefined || entry.status !== "factory") {
		return { gaps: [], reason: `The "${projection.portMember}" factory is not a statically provided implementation.` };
	}
	const reachability = collectDeliveryReachability(inspection, entry);
	if (reachability.dynamicAnchors.length > 0) return { gaps: [], reason: "A reachable delivery construction has a non-static kind." };
	if (reachability.truncated) return { gaps: [], reason: "The factory call graph exceeded the static analysis bound." };
	const anchors = reachability.anchors.filter(anchor => anchor.kind === projection.deliveryKind);
	if (anchors.length === 0) return { gaps: [], reason: `No reachable defineAdapterDelivery("${projection.deliveryKind}", ...) construction exists.` };
	const gaps: DeliveryMemberGap[] = [];
	for (const anchor of anchors) {
		if (anchor.payload === undefined) return { gaps: [], reason: "A reachable delivery construction has no payload." };
		const payload = resolveObjectLiteral(anchor.payload, checker);
		if (payload === undefined) return { gaps: [], reason: "A reachable delivery payload is not a statically resolvable object literal." };
		for (const member of projection.members) {
			const path = member.split(".").filter(part => part.length > 0);
			if (path.length === 0) continue;
			const presence = objectPayloadPresence(inspection, anchor.payload, path);
			if (presence.presence === "unresolved") return { gaps: [], reason: `The "${member}" location in the delivery payload is not statically resolvable.` };
			if (presence.presence !== "missing") continue;
			const first = path[0];
			const firstPresence = objectPayloadPresence(inspection, anchor.payload, [first]);
			if (firstPresence.presence !== "missing") {
				return { gaps: [], reason: `The nested delivery member "${member}" is partly present; nested rewrites are not safe.` };
			}
			const explicit = payload.properties.find(property => {
				if (ts.isSpreadAssignment(property)) return false;
				return propertyNameOf(property.name, checker) === first;
			});
			if (explicit !== undefined) {
				if (ts.isPropertyAssignment(explicit) && generatedImportOf(checker, explicit.initializer) !== undefined) {
					gaps.push({ kind: projection.deliveryKind, member: first, anchor: anchor.call, payload, alreadyGenerated: true });
					continue;
				}
				return { gaps: [], reason: `The delivery property "${first}" exists with a non-supplied value; it is not safely replaceable.` };
			}
			gaps.push({ kind: projection.deliveryKind, member: first, anchor: anchor.call, payload });
		}
	}
	if (gaps.length === 0) return { gaps: [], reason: "No concrete missing delivery payload member was found." };
	return { gaps };
}

/** Required payload shape follows the canonical delivery type, not a duplicated field inventory. */
export function projectPortDelivery(inspection: AdapterInspection, member: string): DeliveryProjection | undefined {
	const kind = Object.entries(ADAPTER_PORT_MEMBERS).find(([, portMember]) => portMember === member)?.[0];
	const { program, checker } = inspection;
	if (kind === undefined || program === undefined || checker === undefined) return undefined;
	const source = findCanonicalSourceFile(program, inspection.root, ADAPTER_AUTHORING_RELATIVE);
	const declaration = source?.statements.find((statement): statement is ts.InterfaceDeclaration =>
		ts.isInterfaceDeclaration(statement) && statement.name.text === "AdapterDeliveryMap");
	if (declaration === undefined) return undefined;
	const symbol = checker.getSymbolAtLocation(declaration.name);
	if (symbol === undefined) return undefined;
	const map = checker.getDeclaredTypeOfSymbol(symbol);
	const delivery = map.getProperty(kind);
	if (delivery === undefined) return undefined;
	const payload = checker.getTypeOfSymbolAtLocation(delivery, delivery.valueDeclaration ?? declaration);
	const members = checker.getPropertiesOfType(payload).filter(property => {
		if ((property.flags & ts.SymbolFlags.Optional) !== 0) return false;
		const value = checker.getTypeOfSymbolAtLocation(property, property.valueDeclaration ?? declaration);
		return !typeIncludesUndefined(checker, value);
	}).map(property => property.name);
	return { portMember: member, deliveryKind: kind, members };
}

function evaluatePortContract(inspection: AdapterInspection, member: string): Evaluation {
	const result = evaluatePortMember(inspection, member);
	if (result.status !== "provided") return result;
	const entry = inspection.bindings.get(member);
	const projection = projectPortDelivery(inspection, member);
	if (entry === undefined || projection === undefined) return result;
	const reachable = collectDeliveryReachability(inspection, entry);
	// Function bodies need not prove native behavior. When a canonical payload is explicitly
	// constructed, however, its required shape is part of this port contract even if the
	// extension never reads those fields directly (for example Round.heldWork).
	if (!reachable.anchors.some(anchor => anchor.kind === projection.deliveryKind) &&
		reachable.dynamicAnchors.length === 0 && !reachable.truncated) return result;
	return evaluateProjection(inspection, projection);
}

export function portMemberForContract(contract: IntegrationContract): string | undefined {
	if (contract.kind === "port") return contract.member;
	if (contract.kind === "delivery") return projectDeliveryContract(contract.id)?.portMember;
	return undefined;
}

/* -------------------------------------------------------------------------------------------------
 * Status evaluation
 * ----------------------------------------------------------------------------------------------- */

export interface PortSupplyEvaluation {
	readonly status: SupplyStatus;
	readonly reason?: string;
	readonly implementation?: SourceLocation;
}

type Evaluation = PortSupplyEvaluation;

export function evaluatePortSupply(inspection: AdapterInspection, name: string): PortSupplyEvaluation {
	return evaluatePortMember(inspection, name);
}

/**
 * A conditional adapter factory states possibility, not the selected assembly's actual output. When
 * selected extension sources carry the canonical factory-output witness, the concrete promise of the
 * assembly that was actually written decides the member. Missing or unsupported witness evidence is
 * unresolved rather than treated as an absence the assembly never stated.
 */
function evaluateConditionalPortMember(
	inspection: AdapterInspection,
	name: string,
	entry: AdapterBindingEntry,
): Evaluation {
	const fallback: Evaluation = { status: "conditional", reason: entry.reason ?? "The factory is conditionally available." };
	if (inspection.assembly === undefined || inspection.checker === undefined) return fallback;
	const assembled = evaluateAssemblyPortMember(inspection.assembly, inspection.checker, name);
	return {
		status: assembled.status,
		...(assembled.reason === undefined ? {} : { reason: assembled.reason }),
		...(assembled.call === undefined ? {} : { implementation: locationOf(inspection.root, assembled.call) }),
	};
}

function evaluatePortMember(inspection: AdapterInspection, name: string): Evaluation {
	if (inspection.checker === undefined || inspection.port === undefined) {
		return { status: "unresolved", reason: "The canonical HarnessPort contract could not be read." };
	}
	if (!inspection.port.byName.has(name)) {
		return { status: "unresolved", reason: `"${name}" is not a HarnessPort member in the canonical contract.` };
	}
	const entry = inspection.bindings.get(name);
	if (entry === undefined) {
		if (inspection.bindingsDynamic) {
			return { status: "unresolved", reason: `The adapter bindings are dynamically composed, so "${name}" cannot be resolved.` };
		}
		return { status: "missing", reason: `The adapter has no binding for "${name}".` };
	}
	switch (entry.status) {
		case "factory":
			return {
				status: "provided",
				implementation: entry.implementation === undefined ? undefined : locationOf(inspection.root, entry.implementation),
			};
		case "conditional":
			return evaluateConditionalPortMember(inspection, name, entry);
		case "unavailable":
			return { status: "unavailable", reason: entry.reason ?? "The adapter declares this member unavailable." };
		case "generated-missing":
			return { status: "missing", reason: entry.reason ?? "The generated implementation export is still missing." };
		case "undefined":
			return { status: "missing", reason: entry.reason ?? "The binding is statically undefined." };
		case "unresolved":
			return { status: "unresolved", reason: entry.reason ?? "The binding could not be resolved." };
	}
}

function combineStatuses(results: readonly Evaluation[]): Evaluation {
	if (results.some(result => result.status === "provided")) {
		const provided = results.find(result => result.status === "provided");
		return provided ?? { status: "provided" };
	}
	if (results.some(result => result.status === "conditional")) {
		const conditional = results.find(result => result.status === "conditional");
		return conditional ?? { status: "conditional" };
	}
	if (results.some(result => result.status === "unresolved")) {
		const unresolved = results.find(result => result.status === "unresolved");
		return unresolved ?? { status: "unresolved" };
	}
	if (results.some(result => result.status === "missing")) {
		const missing = results.find(result => result.status === "missing");
		return missing ?? { status: "missing" };
	}
	if (results.some(result => result.status === "unavailable")) {
		const unavailable = results.find(result => result.status === "unavailable");
		return unavailable ?? { status: "unavailable" };
	}
	return { status: "missing", reason: "No adapter route supplies this obligation." };
}

function evaluateProjection(inspection: AdapterInspection, projection: DeliveryProjection): Evaluation {
	const port = evaluatePortMember(inspection, projection.portMember);
	if (projection.deliveryKind === undefined) {
		if (projection.edgeOptional === true && port.status === "provided") {
			return { status: "conditional", reason: projection.note ?? "The obligation exists only on a conditional edge." };
		}
		return port;
	}
	if (port.status === "missing" || port.status === "unavailable" || port.status === "unresolved" || port.status === "conditional") {
		return port.status === "conditional" && projection.edgeOptional === true
			? { status: "conditional", reason: port.reason ?? projection.note }
			: port;
	}
	if (!inspection.deliveryKinds.has(projection.deliveryKind)) {
		return { status: "unresolved", reason: `"${projection.deliveryKind}" is not a canonical adapter delivery kind.` };
	}
	const entry = inspection.bindings.get(projection.portMember);
	if (entry === undefined) return port;
	const reachability = collectDeliveryReachability(inspection, entry);
	if (reachability.dynamicAnchors.length > 0) {
		return {
			status: "unresolved",
			reason: `A reachable defineAdapterDelivery call has a non-static kind; ${projection.deliveryKind} construction cannot be established.`,
		};
	}
	const anchors = reachability.anchors.filter(anchor => anchor.kind === projection.deliveryKind);
	if (anchors.length === 0) {
		if (reachability.truncated) {
			return { status: "unresolved", reason: "The factory call graph exceeded the static analysis bound." };
		}
		return {
			status: "missing",
			reason: `No defineAdapterDelivery("${projection.deliveryKind}", ...) construction is reachable from the "${projection.portMember}" factory.`,
		};
	}
	let unresolved = 0;
	let missing = 0;
	let optional = 0;
	let implementation: SourceLocation | undefined;
	for (const anchor of anchors) {
		implementation ??= locationOf(inspection.root, anchor.call);
		for (const member of projection.members) {
			const presence = deliveryPayloadPresence(inspection, anchor, member.split(".").filter(part => part.length > 0));
			if (presence.presence === "unresolved") unresolved += 1;
			else if (presence.presence === "missing") missing += 1;
			else if (presence.presence === "optional") optional += 1;
		}
	}
	if (missing > 0) {
		return {
			status: "missing",
			reason: `A reachable ${projection.deliveryKind} construction does not carry the demanded delivery member.`,
			implementation,
		};
	}
	if (unresolved > 0) {
		return {
			status: "unresolved",
			reason: `A reachable ${projection.deliveryKind} payload's typed shape could not be established for the demanded member.`,
			implementation,
		};
	}
	if (optional > 0) {
		return { status: "conditional", reason: "The demanded member is optional in at least one reachable construction.", implementation };
	}
	if (projection.edgeOptional === true) {
		return { status: "conditional", reason: projection.note ?? "The obligation exists only on a conditional edge.", implementation };
	}
	return { status: "provided", implementation };
}

const FRAMEWORK_PORT_MEMBERS: Readonly<Record<string, string>> = {
	"framework:model-prices": "modelPrices",
	"framework:provider-access": "providerAccess",
	"framework:extension-loading": "subagentIntegration",
	"framework:session-facts": "onSession",
	"framework:session-lifecycle": "onSession",
	"framework:session-lifecycle-events": "onSession",
	"framework:session-observation-read": "onSession",
	"framework:session-observation-snapshot": "onSession",
	"framework:session-record-commit": "onSession",
	"framework:session-observations": "onSession",
	"framework:storage-commit": "onSession",
	"framework:round-lifecycle-events": "onRound",
	"framework:turn-usage": "onTurn",
	"framework:prompt-contribution": "onRunInitiation",
	"framework:run-initiation": "onRunInitiation",
	"framework:state-follow": "onSession",
	"framework:state-persistence": "onSession",
	"framework:marker": "onSession",
};

const FRAMEWORK_DELIVERY_PROJECTIONS: Readonly<Record<string, DeliveryProjection>> = {
	"framework:state-follow": { portMember: "onSession", deliveryKind: "session", members: ["statePayloads"] },
};

const FRAMEWORK_DELIVERY_ALTERNATIVES: Readonly<Record<string, readonly DeliveryProjection[]>> = {
	"framework:state-persistence": [
		{ portMember: "onSession", deliveryKind: "session", members: ["persist", "markers"] },
		{ portMember: "registerCommand", deliveryKind: "command", members: ["persist", "markers"] },
	],
	"framework:marker": [
		{ portMember: "onSession", deliveryKind: "session", members: ["markers"] },
		{ portMember: "registerCommand", deliveryKind: "command", members: ["markers"] },
	],
};

export function projectFrameworkContract(contractId: string): readonly DeliveryProjection[] | undefined {
	const single = FRAMEWORK_DELIVERY_PROJECTIONS[contractId];
	if (single !== undefined) return [single];
	const alternatives = FRAMEWORK_DELIVERY_ALTERNATIVES[contractId];
	if (alternatives !== undefined) return alternatives;
	const portMember = FRAMEWORK_PORT_MEMBERS[contractId];
	if (portMember !== undefined) return [{ portMember, members: [] }];
	return undefined;
}

function evaluateFramework(inspection: AdapterInspection, contractId: string): Evaluation {
	const projections = projectFrameworkContract(contractId);
	if (projections === undefined) return { status: "unresolved", reason: `No adapter prerequisite is declared for the framework semantic "${contractId}".` };
	const results = projections.map(item => evaluateProjection(inspection, item));
	if (
		contractId === "framework:state-follow" &&
		evaluatePortMember(inspection, "onSession").status === "provided" &&
		results.some(item => item.status === "missing")
	) {
		return { status: "unresolved", reason: "A provided session factory does not reconstruct the typed state payloads state-follow requires." };
	}
	return results.length === 1 ? results[0] : combineStatuses(results);
}

function addUnresolvedDiagnostic(
	root: string,
	adapterDir: string,
	diagnostics: IntegrationDiagnostic[],
	keys: Set<string>,
	code: string,
	message: string,
	suggestion: string,
	node?: ts.Node,
): void {
	const item = node === undefined
		? adapterDiagnostic(root, adapterDir, code, message, suggestion)
		: diagnostic(root, code, node, message, suggestion);
	const key = `${item.code}|${item.file}|${item.line}|${item.column}|${item.message}`;
	if (keys.has(key)) return;
	keys.add(key);
	diagnostics.push(item);
}

/* -------------------------------------------------------------------------------------------------
 * Session facts field report
 *
 * A `framework:session-facts` consumer needs more than the onSession factory: the adapter's own
 * declaration of which canonical SessionFacts fields it can resolve. The adapter states that once,
 * through the canonical defineSessionFactsMapping<Input>({...}) helper. This report reads that one
 * declaration and the source locations of its field entries. It never scans the mapping functions'
 * bodies, never follows consumers, and never proposes a fix; an optional field mapped by a function
 * is mapped even if that function can answer undefined at runtime.
 * ----------------------------------------------------------------------------------------------- */

interface SessionFactsFieldEvidence {
	readonly status: Exclude<SessionFactsFieldStatus, "missing">;
	readonly reason?: string;
	readonly node: ts.Node;
}

function isMappingFunctionReference(
	checker: ts.TypeChecker,
	expression: ts.Expression,
	seen: Set<ts.Node> = new Set(),
): boolean {
	const target = unwrapExpression(expression);
	if (seen.has(target)) return false;
	seen.add(target);
	if (ts.isArrowFunction(target) || ts.isFunctionExpression(target)) return true;
	if (ts.isIdentifier(target) || ts.isPropertyAccessExpression(target)) {
		const symbol = symbolAt(checker, target);
		for (const declaration of symbol?.declarations ?? []) {
			if (ts.isFunctionDeclaration(declaration) || ts.isMethodDeclaration(declaration)) return true;
			if (
				ts.isVariableDeclaration(declaration) ||
				ts.isPropertyAssignment(declaration) ||
				ts.isPropertyDeclaration(declaration)
			) {
				const initializer = declaration.initializer;
				if (initializer !== undefined && isMappingFunctionReference(checker, initializer, seen)) return true;
			}
		}
		const initializer = resolveInitializer(target, checker, new Set());
		if (initializer !== undefined && initializer !== target && isMappingFunctionReference(checker, initializer, seen)) return true;
		if (checker.getTypeAtLocation(target).getCallSignatures().length > 0) return true;
	}
	return false;
}

function mappingFieldEvidence(
	checker: ts.TypeChecker,
	expression: ts.Expression,
	authoringPathKey: string,
): SessionFactsFieldEvidence {
	const target = unwrapExpression(expression);
	if (
		ts.isCallExpression(target) &&
		isCanonicalReference(checker, target.expression, authoringPathKey, UNAVAILABLE_FACT_HELPER)
	) {
		const reason = target.arguments[0] === undefined ? undefined : constantStringOf(target.arguments[0], checker);
		return { status: "unavailable", reason: reason ?? "No reason was statically resolved.", node: target };
	}
	if (isMappingFunctionReference(checker, target)) return { status: "mapped", node: target };
	return {
		status: "unresolved",
		reason: "The entry is not a mapping function or a canonical unavailableFact(reason).",
		node: target,
	};
}

/** The field set comes from the canonical SessionFacts type, never a handwritten capability list. */
function readCanonicalSessionFactsFields(
	program: ts.Program,
	checker: ts.TypeChecker,
	root: string,
): readonly string[] | undefined {
	const sourceFile = findCanonicalSourceFile(program, root, SESSION_FACTS_RELATIVE);
	if (sourceFile === undefined) return undefined;
	const declaration = sourceFile.statements.find(
		(statement): statement is ts.InterfaceDeclaration | ts.TypeAliasDeclaration =>
			(ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) &&
			statement.name.text === "SessionFacts",
	);
	if (declaration === undefined) return undefined;
	const symbol = checker.getSymbolAtLocation(declaration.name);
	if (symbol === undefined) return undefined;
	const properties = checker.getPropertiesOfType(checker.getDeclaredTypeOfSymbol(symbol));
	if (properties.length === 0) return undefined;
	const order = new Map<string, number>();
	for (const property of properties) {
		const member = property.declarations?.find(candidate => candidate.getSourceFile() === sourceFile);
		order.set(property.name, member?.getStart(sourceFile) ?? Number.MAX_SAFE_INTEGER);
	}
	return properties
		.map(property => property.name)
		.sort((left, right) => (order.get(left) ?? Number.MAX_SAFE_INTEGER) - (order.get(right) ?? Number.MAX_SAFE_INTEGER));
}

function findSessionFactsMappingCalls(
	program: ts.Program,
	checker: ts.TypeChecker,
	adapterFiles: readonly string[],
	authoringPathKey: string,
): ts.CallExpression[] {
	const adapterKeys = new Set(adapterFiles.map(pathKey));
	const calls: ts.CallExpression[] = [];
	for (const sourceFile of program.getSourceFiles()) {
		if (!adapterKeys.has(pathKey(sourceFile.fileName))) continue;
		const visit = (node: ts.Node): void => {
			if (
				ts.isCallExpression(node) &&
				isCanonicalReference(checker, node.expression, authoringPathKey, SESSION_FACTS_MAPPING_HELPER)
			) {
				calls.push(node);
			}
			ts.forEachChild(node, visit);
		};
		visit(sourceFile);
	}
	calls.sort((left, right) => {
		const byFile = pathKey(left.getSourceFile().fileName).localeCompare(pathKey(right.getSourceFile().fileName));
		return byFile === 0 ? left.pos - right.pos : byFile;
	});
	return calls;
}

function allSessionFactsFields(
	names: readonly string[],
	status: SessionFactsFieldStatus,
	location: SourceLocation,
	reason?: string,
): SessionFactsField[] {
	return names.map(field => ({ field, status, ...(reason === undefined ? {} : { reason }), ...location }));
}

/**
 * Reads the selected adapter's one canonical session-facts mapping declaration. The report is
 * separate from contract supply and completion: it never turns a mapped-but-unavailable fact into a
 * warning and never suggests a modification.
 */
export function inspectSessionFactsMapping(inspection: AdapterInspection): SessionFactsFieldReport {
	const root = inspection.root;
	const declarationLocation = inspection.definition === undefined ? undefined : locationOf(root, inspection.definition.call);
	const fallbackLocation: SourceLocation =
		declarationLocation ?? { file: relativeFile(root, inspection.adapterDir), line: 1, column: 1 };
	if (inspection.program === undefined || inspection.checker === undefined) {
		return {
			mapping: "unresolved",
			...(declarationLocation === undefined ? {} : { declaration: declarationLocation }),
			reason: "The adapter analysis program was not available, so the session-facts mapping could not be read.",
			fields: [],
		};
	}
	const authoringPathKey = pathKey(path.resolve(root, ADAPTER_AUTHORING_RELATIVE));
	const calls = findSessionFactsMappingCalls(inspection.program, inspection.checker, inspection.files, authoringPathKey);
	const fields = readCanonicalSessionFactsFields(inspection.program, inspection.checker, root);
	if (fields === undefined) {
		if (calls.length === 0) {
			return {
				mapping: "missing",
				...(declarationLocation === undefined ? {} : { declaration: declarationLocation }),
				reason: "No canonical defineSessionFactsMapping declaration was found in this adapter.",
				fields: [],
			};
		}
		return {
			mapping: "unresolved",
			declaration: locationOf(root, calls[0] as ts.CallExpression),
			reason: "The canonical SessionFacts type could not be read from framework/interface/session/details/facts.ts.",
			fields: [],
		};
	}
	if (calls.length === 0) {
		return {
			mapping: "missing",
			...(declarationLocation === undefined ? {} : { declaration: declarationLocation }),
			reason: "No canonical defineSessionFactsMapping declaration was found in this adapter.",
			fields: allSessionFactsFields(fields, "missing", fallbackLocation),
		};
	}
	if (calls.length > 1) {
		const reason = `More than one canonical defineSessionFactsMapping declaration was found (${calls.length}); field coverage is ambiguous.`;
		return {
			mapping: "unresolved",
			declaration: locationOf(root, calls[0] as ts.CallExpression),
			reason,
			fields: allSessionFactsFields(fields, "unresolved", locationOf(root, calls[0] as ts.CallExpression), reason),
		};
	}
	const call = calls[0] as ts.CallExpression;
	const mappingLocation = locationOf(root, call);
	const argument = call.arguments[0];
	const bindings = argument === undefined ? undefined : resolveObjectLiteral(argument, inspection.checker);
	if (bindings === undefined) {
		const reason = "The defineSessionFactsMapping bindings are not statically resolvable to one object literal.";
		return { mapping: "unresolved", declaration: mappingLocation, reason, fields: allSessionFactsFields(fields, "unresolved", mappingLocation, reason) };
	}
	const entries = new Map<string, ts.ObjectLiteralElementLike[]>();
	let dynamic = false;
	for (const property of bindings.properties) {
		if (ts.isSpreadAssignment(property)) {
			dynamic = true;
			continue;
		}
		if (!("name" in property)) {
			dynamic = true;
			continue;
		}
		const name = propertyNameOf(property.name, inspection.checker);
		if (name === undefined) {
			dynamic = true;
			continue;
		}
		const held = entries.get(name);
		if (held === undefined) entries.set(name, [property]);
		else held.push(property);
	}
	const dynamicReason = "The mapping contains a spread or a dynamic property name, so its field coverage cannot be proven.";
	const checker = inspection.checker;
	const fieldReports: SessionFactsField[] = fields.map(field => {
		const matches = entries.get(field) ?? [];
		if (matches.length === 0) {
			return dynamic
				? { field, status: "unresolved", reason: dynamicReason, ...mappingLocation }
				: { field, status: "missing", ...mappingLocation };
		}
		if (matches.length > 1) {
			return {
				field,
				status: "unresolved",
				reason: "The mapping declares this field more than once.",
				...locationOf(root, matches[1] as ts.ObjectLiteralElementLike),
			};
		}
		const property = matches[0] as ts.ObjectLiteralElementLike;
		if (ts.isMethodDeclaration(property)) return { field, status: "mapped", ...locationOf(root, property) };
		if (ts.isPropertyAssignment(property)) {
			const evidence = mappingFieldEvidence(checker, property.initializer, authoringPathKey);
			return {
				field,
				status: evidence.status,
				...(evidence.reason === undefined ? {} : { reason: evidence.reason }),
				...locationOf(root, evidence.node),
			};
		}
		if (ts.isShorthandPropertyAssignment(property)) {
			const evidence = mappingFieldEvidence(checker, property.name, authoringPathKey);
			return {
				field,
				status: evidence.status,
				...(evidence.reason === undefined ? {} : { reason: evidence.reason }),
				...locationOf(root, evidence.node),
			};
		}
		return {
			field,
			status: "unresolved",
			reason: "The entry is not a statically inspectable mapping declaration.",
			...locationOf(root, property),
		};
	});
	return {
		mapping: dynamic ? "unresolved" : "declared",
		declaration: mappingLocation,
		...(dynamic ? { reason: dynamicReason } : {}),
		fields: fieldReports,
	};
}

/* -------------------------------------------------------------------------------------------------
 * Public analysis
 * ----------------------------------------------------------------------------------------------- */

/** Analyzes one adapter against the supplied contracts. Source-only; nothing is imported or run. */
export function analyzeSupply(options: SupplyOptions): SupplyResult {
	const root = path.resolve(options.root);
	const inspection = inspectAdapterSource(root, options.adapter, options.assemblyFiles);
	const diagnostics: IntegrationDiagnostic[] = [...inspection.diagnostics];
	const diagnosticKeys = new Set(diagnostics.map(item => `${item.code}|${item.file}|${item.line}|${item.column}|${item.message}`));
	const supplies: ContractSupply[] = [];
	const sessionFacts = options.contracts.some(contract => contract.id === "framework:session-facts")
		? inspectSessionFactsMapping(inspection)
		: undefined;
	const seen = new Set<string>();
	for (const contract of options.contracts) {
		if (seen.has(contract.id)) continue;
		seen.add(contract.id);
		let evaluation: Evaluation;
		if (contract.kind === "port") {
			evaluation = evaluatePortContract(inspection, contract.member);
			if (evaluation.status === "unresolved") {
				const entry = inspection.bindings.get(contract.member);
				addUnresolvedDiagnostic(
					root,
					inspection.adapterDir,
					diagnostics,
					diagnosticKeys,
					"supply/unresolved-port",
					evaluation.reason ?? `The port member "${contract.member}" could not be resolved.`,
					"Inspect the adapter binding and make its factory and type shape statically explicit.",
					entry?.node,
				);
			}
		} else if (contract.kind === "delivery") {
			const projection = projectDeliveryContract(contract.id);
			if (projection === undefined) {
				evaluation = { status: "unresolved", reason: `Unknown delivery contract "${contract.id}".` };
				addUnresolvedDiagnostic(
					root,
					inspection.adapterDir,
					diagnostics,
					diagnosticKeys,
					"supply/unknown-delivery",
					`The delivery contract "${contract.id}" does not map to a known adapter delivery construction.`,
					"Use a delivery callback path that the framework actually constructs from an adapter delivery.",
				);
			} else {
				evaluation = evaluateProjection(inspection, projection);
				if (evaluation.status === "unresolved") {
					addUnresolvedDiagnostic(
						root,
						inspection.adapterDir,
						diagnostics,
						diagnosticKeys,
						"supply/unresolved-delivery",
						evaluation.reason ?? `The delivery contract "${contract.id}" could not be resolved.`,
						"Make the adapter delivery construction and its payload shape statically explicit.",
						inspection.bindings.get(projection.portMember)?.node,
					);
				}
			}
		} else if (contract.kind === "framework") {
			evaluation = evaluateFramework(inspection, contract.id);
			if (evaluation.status === "unresolved") {
				addUnresolvedDiagnostic(
					root,
					inspection.adapterDir,
					diagnostics,
					diagnosticKeys,
					"supply/unresolved-framework",
					evaluation.reason ?? `The framework semantic "${contract.id}" could not be mapped to adapter supply.`,
					"Restore the canonical framework sources or correct the semantic ID and its adapter prerequisite.",
				);
			}
		} else {
			evaluation = { status: "unresolved", reason: `Unknown contract kind in "${contract.id}".` };
			addUnresolvedDiagnostic(
				root,
				inspection.adapterDir,
				diagnostics,
				diagnosticKeys,
				"supply/unknown-contract",
				`The contract "${contract.id}" has an unknown kind.`,
				"Use port:<member>, delivery:<kind>.<member> or framework:<semantic>.",
			);
		}
		supplies.push({
			contractId: contract.id,
			status: evaluation.status,
			...(evaluation.reason === undefined ? {} : { reason: evaluation.reason }),
			...(evaluation.implementation === undefined ? {} : { implementation: evaluation.implementation }),
		});
	}
	return {
		adapter: options.adapter,
		exists: inspection.exists,
		...(inspection.definition === undefined
			? {}
			: {
					definition: locationOf(root, inspection.definition.call),
					contextType: inspection.definition.contextType,
					contextFile: inspection.definition.contextFile,
				}),
		...(sessionFacts === undefined ? {} : { sessionFacts }),
		supplies,
		diagnostics,
	};
}
