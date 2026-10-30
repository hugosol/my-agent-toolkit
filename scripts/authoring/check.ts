/**
 * The static authoring checker.
 *
 * This module reads selected extension sources as a TypeScript program and inspects every
 * canonical `defineImplementation` declaration (directly, or through a wrapper that returns one)
 * without importing or executing any extension module. It never calls `create`, a handler or a
 * wrapper; handler bodies are deliberately opaque. What it checks is the static shape the
 * framework's authoring entry needs: the canonical entry symbol, static structure and keys,
 * literal scopes, resolvable functions, and the absence of mutation on declaration-backed
 * structures.
 *
 * A passing scan means those source constraints hold over the selected files. It does not prove
 * business semantics, dependency completeness or runtime compatibility, and it never changes
 * extension loading.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript-compiler";
import { AUTHORING_RULES, type AuthoringRuleId } from "./rules";

/** One actionable finding at one source position. */
export interface AuthoringDiagnostic {
	readonly ruleId: string;
	/** Repository-relative path with forward slashes. */
	readonly file: string;
	/** One-based line. */
	readonly line: number;
	/** One-based column. */
	readonly column: number;
	readonly message: string;
	readonly suggestion: string;
}

/** The deterministic result of one authoring scan. */
export interface AuthoringCheckResult {
	readonly filesChecked: number;
	readonly declarationsChecked: number;
	readonly diagnostics: readonly AuthoringDiagnostic[];
}

/** What to scan: a repository root and optional repo-relative files/directories. */
export interface AuthoringCheckOptions {
	readonly root: string;
	/**
	 * Repo-relative scan roots. Directories are scanned recursively for `.ts`/`.tsx` sources
	 * (declaration files excluded); a file selects exactly that file. Omitted selects
	 * `extensions/**` recursively.
	 */
	readonly files?: readonly string[];
}

const CANONICAL_ENTRY_RELATIVE = "framework/interface/details/implementation.ts";
const MAX_STATIC_DEPTH = 64;
const MAX_ALIAS_DEPTH = 16;

const ASSIGNMENT_OPERATORS = new Set<ts.SyntaxKind>([
	ts.SyntaxKind.EqualsToken,
	ts.SyntaxKind.PlusEqualsToken,
	ts.SyntaxKind.MinusEqualsToken,
	ts.SyntaxKind.AsteriskEqualsToken,
	ts.SyntaxKind.AsteriskAsteriskEqualsToken,
	ts.SyntaxKind.SlashEqualsToken,
	ts.SyntaxKind.PercentEqualsToken,
	ts.SyntaxKind.LessThanLessThanEqualsToken,
	ts.SyntaxKind.GreaterThanGreaterThanEqualsToken,
	ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken,
	ts.SyntaxKind.AmpersandEqualsToken,
	ts.SyntaxKind.BarEqualsToken,
	ts.SyntaxKind.CaretEqualsToken,
	ts.SyntaxKind.BarBarEqualsToken,
	ts.SyntaxKind.AmpersandAmpersandEqualsToken,
	ts.SyntaxKind.QuestionQuestionEqualsToken,
]);

/** Array/object methods whose call is a write to their receiver. */
const MUTATING_METHODS: Readonly<Record<string, true>> = {
	push: true,
	pop: true,
	shift: true,
	unshift: true,
	splice: true,
	sort: true,
	reverse: true,
	fill: true,
	copyWithin: true,
};

const OBJECT_MUTATING_METHODS: Readonly<Record<string, true>> = {
	assign: true,
	defineProperty: true,
	defineProperties: true,
	setPrototypeOf: true,
};

const REFLECT_MUTATING_METHODS: Readonly<Record<string, true>> = {
	set: true,
	deleteProperty: true,
	defineProperty: true,
};

/** A static value, or the reason the expression cannot be understood without running it. */
export type StaticValue =
	| { readonly kind: "absent"; readonly node: ts.Node }
	| { readonly kind: "literal"; readonly value: string | number | boolean | null; readonly node: ts.Node }
	| { readonly kind: "function"; readonly node: ts.Node }
	| { readonly kind: "dynamic"; readonly node: ts.Node; readonly reason: string }
	| { readonly kind: "array"; readonly node: ts.Node; readonly items: readonly StaticValue[]; readonly issues: readonly StaticIssue[] }
	| { readonly kind: "object"; readonly node: ts.Node; readonly properties: ReadonlyMap<string, StaticProperty>; readonly issues: readonly StaticIssue[] };

export interface StaticProperty {
	readonly key: string;
	readonly keyNode: ts.Node;
	/** The expression as written where the declaration names this property; used for diagnostics. */
	readonly valueNode: ts.Node;
	readonly value: StaticValue;
}

export interface StaticIssue {
	readonly ruleId: AuthoringRuleId;
	readonly node: ts.Node;
	readonly message: string;
}

interface CheckState {
	readonly checker: ts.TypeChecker;
	readonly root: string;
	readonly canonicalEntryPath: string;
	readonly diagnostics: AuthoringDiagnostic[];
	/** Symbols whose initializer/argument is currently being evaluated (cycle and depth guard). */
	readonly stack: Set<ts.Symbol>;
}

/** A wrapper parameter's static substitution, or its known absence. */
type EnvBinding =
	| { readonly expression: ts.Expression; readonly env: Env }
	| { readonly absentNode: ts.Node };

type Env = ReadonlyMap<ts.Symbol, EnvBinding>;

const EMPTY_ENV: Env = new Map();

interface WrapperInfo {
	readonly symbol: ts.Symbol;
	readonly fn: WrapperFunction;
	/** The canonical declaration call this wrapper returns. */
	readonly call: ts.CallExpression;
}

type WrapperFunction = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction;

/** One source position in the same repo-relative shape integration diagnostics use. */
export interface AuthoringSourceLocation {
	/** Repository-relative path with forward slashes. */
	readonly file: string;
	/** One-based line. */
	readonly line: number;
	/** One-based column. */
	readonly column: number;
}

/** One statically recovered event entry in an authored subscription group. */
export interface AuthoredEventView {
	readonly kind: string;
	readonly origin: AuthoringSourceLocation;
	/** The handler function body when the entry resolves to one; absent for a dynamic handler. */
	readonly handler?: ts.FunctionLikeDeclaration;
}

/** One statically recovered subscription group. */
export interface AuthoredSubscriptionView {
	readonly scope?: "owner" | "session";
	readonly events: readonly AuthoredEventView[];
	readonly origin: AuthoringSourceLocation;
}

/** One handler role inside an authored command table. */
export interface AuthoredCommandHandlerView {
	/** `run`, `unrecognized`, or the declared action name. */
	readonly role: string;
	readonly node?: ts.FunctionLikeDeclaration;
	readonly origin: AuthoringSourceLocation;
}

/** One statically recovered command implementation entry. */
export interface AuthoredCommandView {
	readonly name: string;
	readonly kind?: "directed" | "actions";
	readonly actions: readonly string[];
	readonly handlers: readonly AuthoredCommandHandlerView[];
	readonly origin: AuthoringSourceLocation;
}

/**
 * One statically recovered authored implementation declaration. It is the source structure the
 * runtime materializes, recovered through the same resolver the authoring checker uses — no
 * factory, `create` or handler has run.
 */
export interface AuthoredImplementationView {
	readonly origin: AuthoringSourceLocation;
	readonly create?: ts.FunctionLikeDeclaration;
	readonly subscriptions: readonly AuthoredSubscriptionView[];
	readonly commands: readonly AuthoredCommandView[];
	readonly tools: readonly { readonly name: string; readonly execute?: ts.FunctionLikeDeclaration; readonly origin: AuthoringSourceLocation }[];
	readonly catalog?: ts.FunctionLikeDeclaration;
	readonly initialize?: ts.FunctionLikeDeclaration;
	readonly cleanup?: ts.FunctionLikeDeclaration;
}

/**
 * The reusable source analysis behind {@link checkAuthoring}. It exposes the checker's canonical
 * symbol/static-expression resolution so a demand analyzer can inspect the same declarations and
 * function bodies without importing or executing the extension.
 */
export interface AuthoringSourceAnalysis {
	readonly program: ts.Program;
	readonly checker: ts.TypeChecker;
	readonly root: string;
	/** Selected repository-relative source files. */
	readonly files: readonly string[];
	readonly filesChecked: number;
	readonly declarationsChecked: number;
	readonly implementations: readonly AuthoredImplementationView[];
	readonly diagnostics: readonly AuthoringDiagnostic[];
	evaluate(expression: ts.Expression): StaticValue;
	isCanonicalEntryCall(call: ts.CallExpression): boolean;
	/** Whether the call resolves to the named canonical function in the named interface file. */
	isCanonicalFunctionCall(call: ts.CallExpression, functionName: string, entryRelativePath: string): boolean;
	symbolAt(node: ts.Node): ts.Symbol | undefined;
	resolveSymbol(symbol: ts.Symbol | undefined): ts.Symbol | undefined;
	/** The function body/declaration a handler expression really names, when it resolves to one. */
	resolveFunction(node: ts.Node): ts.FunctionLikeDeclaration | undefined;
	location(node: ts.Node): AuthoringSourceLocation;
	isRepositoryFile(sourceFile: ts.SourceFile): boolean;
	propertyName(name: ts.PropertyName | ts.BindingName | ts.Expression): string | undefined;
}

/**
 * Scan the selected authoring sources. Deterministic for the same tree and options; diagnostics
 * are sorted by file, line, column, rule and message, and exact duplicates are removed.
 */
export function checkAuthoring(options: AuthoringCheckOptions): AuthoringCheckResult {
	const analysis = analyzeAuthoringSources(options);
	return {
		filesChecked: analysis.filesChecked,
		declarationsChecked: analysis.declarationsChecked,
		diagnostics: analysis.diagnostics,
	};
}

/**
 * Recover the static authored declarations of the selected sources and the checker's diagnostics.
 * The returned methods reuse the checker's own symbol resolution and restricted evaluator; none of
 * them imports, calls or otherwise executes the analyzed modules.
 */
export function analyzeAuthoringSources(options: AuthoringCheckOptions): AuthoringSourceAnalysis {
	const root = path.resolve(options.root);
	const selection = selectSourceFiles(root, options.files);
	const diagnostics: AuthoringDiagnostic[] = [];

	for (const missing of selection.missing) {
		diagnostics.push({
			ruleId: "authoring/parse",
			file: missing.file,
			line: 1,
			column: 1,
			message: missing.reason,
			suggestion: suggestionFor("authoring/parse"),
		});
	}

	const compilerOptions: ts.CompilerOptions = {
		target: ts.ScriptTarget.ES2020,
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		jsx: ts.JsxEmit.Preserve,
		strict: false,
		noEmit: true,
		skipLibCheck: true,
		allowJs: false,
		checkJs: false,
		resolveJsonModule: true,
		types: [],
	};

	let program: ts.Program;
	try {
		program = ts.createProgram({ rootNames: selection.files, options: compilerOptions });
	} catch (error) {
		diagnostics.push({
			ruleId: "authoring/parse",
			file: relativeFile(root, path.resolve(options.root)),
			line: 1,
			column: 1,
			message: `The TypeScript program could not be created: ${error instanceof Error ? error.message : String(error)}`,
			suggestion: suggestionFor("authoring/parse"),
		});
		// Keep the analysis shape usable for the diagnostic path; no selected source can be read.
		program = ts.createProgram({ rootNames: [], options: compilerOptions });
	}

	const checker = program.getTypeChecker();
	const state: CheckState = {
		checker,
		root,
		canonicalEntryPath: path.resolve(root, CANONICAL_ENTRY_RELATIVE),
		diagnostics,
		stack: new Set(),
	};

	const sourceByPath = new Map<string, ts.SourceFile>();
	for (const sourceFile of program.getSourceFiles()) {
		sourceByPath.set(pathKey(sourceFile.fileName), sourceFile);
	}

	const selectedSources: ts.SourceFile[] = [];
	for (const file of selection.files) {
		const sourceFile = sourceByPath.get(pathKey(file)) ?? program.getSourceFile(file);
		if (!sourceFile) {
			diagnostics.push({
				ruleId: "authoring/parse",
				file: relativeFile(root, file),
				line: 1,
				column: 1,
				message: "The selected source was not loaded by the TypeScript program.",
				suggestion: suggestionFor("authoring/parse"),
			});
			continue;
		}
		selectedSources.push(sourceFile);
	}

	for (const sourceFile of selectedSources) {
		for (const diagnostic of program.getSyntacticDiagnostics(sourceFile)) {
			const start = Math.max(0, diagnostic.start ?? 0);
			const position = sourceFile.getLineAndCharacterOfPosition(Math.min(start, sourceFile.text.length));
			diagnostics.push({
				ruleId: "authoring/parse",
				file: relativeFile(root, sourceFile.fileName),
				line: position.line + 1,
				column: position.character + 1,
				message: `Syntax error: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`,
				suggestion: suggestionFor("authoring/parse"),
			});
		}
	}

	const repositorySources = program
		.getSourceFiles()
		.filter(sourceFile => isRepositorySource(sourceFile, root));

	const wrapperCalls = new Set<ts.CallExpression>();
	const wrappers = new Map<ts.Symbol, WrapperInfo>();
	for (const sourceFile of repositorySources) {
		walk(sourceFile, node => {
			if (!ts.isCallExpression(node) || !isCanonicalEntryCall(node, state)) return;
			const wrapper = detectWrapper(node, state);
			if (!wrapper) return;
			wrapperCalls.add(node);
			if (!wrappers.has(wrapper.symbol)) wrappers.set(wrapper.symbol, wrapper);
		});
	}

	const declarationRefs = new Set<ts.Symbol>();
	const authoredResults = new Set<ts.Symbol>();
	const implementations: AuthoredImplementationView[] = [];
	let declarationsChecked = 0;

	for (const sourceFile of selectedSources) {
		walk(sourceFile, node => {
			if (!ts.isCallExpression(node)) return;
			if (isCanonicalEntryCall(node, state)) {
				if (wrapperCalls.has(node)) return;
				declarationsChecked += 1;
				const view = analyzeDirectDeclaration(node, state, declarationRefs);
				if (view) implementations.push(view);
				return;
			}
			const wrapper = resolveWrapperForCallee(node.expression, wrappers, state);
			if (wrapper) {
				declarationsChecked += 1;
				const view = analyzeWrapperInstantiation(wrapper, node, state, declarationRefs);
				if (view) implementations.push(view);
				return;
			}
			if (looksLikeFalseEntryPoint(node.expression, state)) {
				report(
					state,
					"authoring/entrypoint",
					node.expression,
					"`defineImplementation` here does not resolve to the framework authoring entry, so its declaration is not the framework contract.",
				);
			}
		});
	}

	for (const sourceFile of repositorySources) {
		walk(sourceFile, node => {
			if (!ts.isVariableDeclaration(node) || !node.initializer || !ts.isIdentifier(node.name)) return;
			const initializer = unwrap(node.initializer);
			if (!ts.isCallExpression(initializer)) return;
			if (!isCanonicalEntryCall(initializer, state) && !resolveWrapperForCallee(initializer.expression, wrappers, state)) {
				return;
			}
			const symbol = rawSymbolAt(node.name, state);
			if (symbol) authoredResults.add(symbol);
		});
	}

	collectMutationDiagnostics(repositorySources, state, declarationRefs, authoredResults, wrappers);

	const finished = finishResult(selectedSources.length, declarationsChecked, diagnostics);
	return {
		program,
		checker,
		root,
		files: selection.files.map(file => relativeFile(root, file)),
		filesChecked: finished.filesChecked,
		declarationsChecked: finished.declarationsChecked,
		implementations,
		diagnostics: finished.diagnostics,
		evaluate: expression => evaluate(expression, EMPTY_ENV, state),
		isCanonicalEntryCall: call => isCanonicalEntryCall(call, state),
		isCanonicalFunctionCall: (call, functionName, entryRelativePath) =>
			isCanonicalNamedCall(call, functionName, entryRelativePath, state),
		symbolAt: node => rawSymbolAt(node, state),
		resolveSymbol: symbol => resolveAliasedSymbol(symbol, state),
		resolveFunction: node => resolveFunctionNode(node, state),
		location: node => sourceLocation(state, node),
		isRepositoryFile: sourceFile => isRepositorySource(sourceFile, root),
		propertyName: name => propertyNameText(name),
	};
}

// -------------------------------------------------------------------------------------------------
// File selection and compiler plumbing
// -------------------------------------------------------------------------------------------------

interface FileSelection {
	readonly files: readonly string[];
	readonly missing: readonly { file: string; reason: string }[];
}

function selectSourceFiles(root: string, requested: readonly string[] | undefined): FileSelection {
	const entries = requested && requested.length > 0 ? requested : ["extensions"];
	const files = new Set<string>();
	const missing: { file: string; reason: string }[] = [];

	for (const entry of entries) {
		const absolute = path.isAbsolute(entry) ? path.normalize(entry) : path.resolve(root, entry);
		if (!existsSync(absolute)) {
			missing.push({
				file: relativeFile(root, absolute),
				reason: `Selected authoring path does not exist: ${entry}`,
			});
			continue;
		}
		try {
			const stats = statSync(absolute);
			if (stats.isDirectory()) {
				collectDirectorySources(absolute, files);
			} else if (stats.isFile() && isSourceFile(absolute)) {
				files.add(path.normalize(absolute));
			}
		} catch {
			missing.push({
				file: relativeFile(root, absolute),
				reason: `Selected authoring path could not be inspected: ${entry}`,
			});
		}
	}

	return {
		files: [...files].sort((left, right) => (pathKey(left) < pathKey(right) ? -1 : pathKey(left) > pathKey(right) ? 1 : 0)),
		missing,
	};
}

function collectDirectorySources(directory: string, files: Set<string>): void {
	try {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			if (entry.name === "node_modules" || entry.name === ".git") continue;
			const absolute = path.join(directory, entry.name);
			if (entry.isDirectory()) {
				collectDirectorySources(absolute, files);
			} else if (entry.isFile() && isSourceFile(absolute)) {
				files.add(path.normalize(absolute));
			}
		}
	} catch {
		// An unreadable directory contributes no sources; the selected file set is still reported.
	}
}

function isSourceFile(file: string): boolean {
	const lower = file.toLowerCase();
	if (lower.endsWith(".d.ts") || lower.endsWith(".d.tsx")) return false;
	return lower.endsWith(".ts") || lower.endsWith(".tsx");
}

function isRepositorySource(sourceFile: ts.SourceFile, root: string): boolean {
	if (sourceFile.isDeclarationFile) return false;
	const relative = path.relative(root, path.resolve(sourceFile.fileName));
	if (relative.length === 0 || relative.startsWith("..") || path.isAbsolute(relative)) return false;
	const segments = relative.split(/[\\/]+/);
	return !segments.includes("node_modules");
}

function pathKey(file: string): string {
	const resolved = path.resolve(file);
	return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function relativeFile(root: string, file: string): string {
	const relative = path.relative(root, path.resolve(file));
	if (relative.length === 0) return ".";
	return relative.replace(/\\/g, "/");
}

// -------------------------------------------------------------------------------------------------
// Symbols and trivial AST helpers
// -------------------------------------------------------------------------------------------------

function rawSymbolAt(node: ts.Node, state: CheckState): ts.Symbol | undefined {
	try {
		if (ts.isIdentifier(node) && ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node) {
			return state.checker.getShorthandAssignmentValueSymbol(node.parent);
		}
		return state.checker.getSymbolAtLocation(node);
	} catch {
		return undefined;
	}
}

function resolveAliasedSymbol(symbol: ts.Symbol | undefined, state: CheckState): ts.Symbol | undefined {
	let current = symbol;
	for (let depth = 0; current && depth < MAX_ALIAS_DEPTH; depth += 1) {
		if ((current.flags & ts.SymbolFlags.Alias) === 0) return current;
		try {
			const next = state.checker.getAliasedSymbol(current);
			if (!next || next === current) return current;
			current = next;
		} catch {
			return current;
		}
	}
	return current;
}

function unwrap(node: ts.Expression): ts.Expression {
	let current = node;
	for (;;) {
		if (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isTypeAssertionExpression(current) || ts.isSatisfiesExpression(current) || ts.isNonNullExpression(current)) {
			current = current.expression;
			continue;
		}
		return current;
	}
}

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
	visit(node);
	ts.forEachChild(node, child => walk(child, visit));
}

function isWrapperFunctionNode(node: ts.Node): node is WrapperFunction {
	return ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node);
}

function isAnyFunctionLike(node: ts.Node): boolean {
	return (
		ts.isFunctionDeclaration(node) ||
		ts.isFunctionExpression(node) ||
		ts.isArrowFunction(node) ||
		ts.isMethodDeclaration(node) ||
		ts.isGetAccessorDeclaration(node) ||
		ts.isSetAccessorDeclaration(node) ||
		ts.isConstructorDeclaration(node)
	);
}

function enclosingFunction(node: ts.Node): ts.Node | undefined {
	for (let current = node.parent; current; current = current.parent) {
		if (isAnyFunctionLike(current)) return current;
	}
	return undefined;
}

function isTransparentAncestor(parent: ts.Node, child: ts.Node): boolean {
	if (
		!(
			ts.isParenthesizedExpression(parent) ||
			ts.isAsExpression(parent) ||
			ts.isTypeAssertionExpression(parent) ||
			ts.isSatisfiesExpression(parent) ||
			ts.isNonNullExpression(parent)
		)
	) {
		return false;
	}
	return parent.expression === child;
}

function propertyNameText(name: ts.PropertyName | ts.BindingName | ts.Expression): string | undefined {
	if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)) {
		return name.text;
	}
	return undefined;
}

function isUndefinedExpression(expression: ts.Expression): boolean {
	const node = unwrap(expression);
	if (ts.isIdentifier(node) && node.text === "undefined") return true;
	return ts.isVoidExpression(node);
}

// -------------------------------------------------------------------------------------------------
// Entrypoint and wrapper recognition
// -------------------------------------------------------------------------------------------------

function isCanonicalEntryCall(call: ts.CallExpression, state: CheckState): boolean {
	return isCanonicalNamedCall(call, "defineImplementation", CANONICAL_ENTRY_RELATIVE, state);
}

/** Whether a call resolves to the named canonical function declared in one framework interface file. */
function isCanonicalNamedCall(
	call: ts.CallExpression,
	functionName: string,
	entryRelativePath: string,
	state: CheckState,
): boolean {
	const symbol = resolveCalleeSymbol(call.expression, state);
	if (!symbol?.declarations) return false;
	const expected = path.isAbsolute(entryRelativePath)
		? path.normalize(entryRelativePath)
		: path.resolve(state.root, entryRelativePath);
	return symbol.declarations.some(declaration => {
		if (!ts.isFunctionDeclaration(declaration)) return false;
		if (declaration.name?.text !== functionName) return false;
		return pathKey(declaration.getSourceFile().fileName) === pathKey(expected);
	});
}

/**
 * Resolve a callee through imports, namespace members and const aliases of the canonical entry.
 * Import aliases and re-exports are handled by `getAliasedSymbol`; the const-alias loop covers
 * `const author = defineImplementation` without counting a same-named local function.
 */
function resolveCalleeSymbol(callee: ts.Expression, state: CheckState): ts.Symbol | undefined {
	let expression = unwrap(callee);
	const seen = new Set<ts.Node>();
	for (let depth = 0; depth < MAX_ALIAS_DEPTH; depth += 1) {
		const raw = rawSymbolAt(expression, state) ??
			(ts.isPropertyAccessExpression(expression) ? rawSymbolAt(expression.name, state) : undefined);
		const symbol = resolveAliasedSymbol(raw, state);
		if (!symbol) return undefined;
		const declaration = symbol.valueDeclaration;
		if (
			declaration &&
			ts.isVariableDeclaration(declaration) &&
			declaration.initializer &&
			ts.isVariableDeclarationList(declaration.parent) &&
			(declaration.parent.flags & ts.NodeFlags.Const) !== 0
		) {
			const initializer = unwrap(declaration.initializer);
			if ((ts.isIdentifier(initializer) || ts.isPropertyAccessExpression(initializer)) && !seen.has(initializer)) {
				seen.add(initializer);
				expression = initializer;
				continue;
			}
		}
		return symbol;
	}
	return undefined;
}

function looksLikeFalseEntryPoint(callee: ts.Expression, state: CheckState): boolean {
	const expression = unwrap(callee);
	if (ts.isIdentifier(expression) && expression.text === "defineImplementation") return true;
	if (ts.isPropertyAccessExpression(expression) && expression.name.text === "defineImplementation") return true;
	const symbol = resolveCalleeSymbol(expression, state);
	return symbol?.name === "defineImplementation";
}

function detectWrapper(call: ts.CallExpression, state: CheckState): WrapperInfo | undefined {
	const fn = wrapperFunctionForReturnedCall(call, state);
	if (!fn) return undefined;
	const symbol = wrapperSymbolFor(fn, state);
	if (!symbol) return undefined;
	// A function that returns a declaration but does not use its parameters to shape that
	// declaration is itself a static authored declaration (for example an assembly that builds and
	// returns its implementation). Only a parameter-dependent declaration needs call-site
	// substitution; otherwise the declaration is analyzed directly and counted once.
	const argument = call.arguments[0];
	if (!argument || ts.isSpreadElement(argument)) return undefined;
	const refs = new Set<ts.Symbol>();
	collectStaticRefs(argument, EMPTY_ENV, state, refs);
	const parameterNodes = new Set<ts.Node>(fn.parameters);
	for (const parameter of fn.parameters) {
		if (!ts.isIdentifier(parameter.name)) return { symbol, fn, call };
		const parameterSymbol = rawSymbolAt(parameter.name, state);
		if (parameterSymbol && refs.has(parameterSymbol)) return { symbol, fn, call };
	}
	for (const reference of refs) {
		const declaration = reference.valueDeclaration ?? reference.declarations?.[0];
		if (declaration && parameterNodes.has(declaration)) return { symbol, fn, call };
	}
	return undefined;
}

function wrapperFunctionForReturnedCall(call: ts.CallExpression, state: CheckState): WrapperFunction | undefined {
	let returned: ts.Node = call;
	while (returned.parent && isTransparentAncestor(returned.parent, returned)) returned = returned.parent;
	const parent = returned.parent;
	if (!parent) return undefined;

	if (ts.isReturnStatement(parent) && parent.expression === returned) {
		const fn = enclosingFunction(parent);
		return fn && isWrapperFunctionNode(fn) ? fn : undefined;
	}
	if (ts.isArrowFunction(parent) && parent.body === returned) return parent;

	if (ts.isVariableDeclaration(parent) && parent.initializer === returned && ts.isIdentifier(parent.name)) {
		const symbol = rawSymbolAt(parent.name, state);
		const fn = enclosingFunction(parent);
		if (!symbol || !fn || !isWrapperFunctionNode(fn)) return undefined;
		let isReturned = false;
		forEachReturn(fn, statement => {
			if (!statement.expression) return;
			const expression = unwrap(statement.expression);
			if (ts.isIdentifier(expression) && rawSymbolAt(expression, state) === symbol) isReturned = true;
		});
		return isReturned ? fn : undefined;
	}
	return undefined;
}

function forEachReturn(fn: WrapperFunction, visit: (statement: ts.ReturnStatement) => void): void {
	if (!fn.body) return;
	const root = fn.body;
	const scan = (node: ts.Node): void => {
		if (node !== root && (isWrapperFunctionNode(node) || isAnyFunctionLike(node))) return;
		if (ts.isReturnStatement(node)) visit(node);
		ts.forEachChild(node, scan);
	};
	scan(root);
}

function wrapperSymbolFor(fn: WrapperFunction, state: CheckState): ts.Symbol | undefined {
	if (ts.isFunctionDeclaration(fn)) {
		return fn.name ? rawSymbolAt(fn.name, state) : undefined;
	}
	const parent = fn.parent;
	if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
		return rawSymbolAt(parent.name, state);
	}
	return undefined;
}

function resolveWrapperForCallee(
	callee: ts.Expression,
	wrappers: ReadonlyMap<ts.Symbol, WrapperInfo>,
	state: CheckState,
): WrapperInfo | undefined {
	let expression = unwrap(callee);
	const seen = new Set<ts.Node>();
	for (let depth = 0; depth < MAX_ALIAS_DEPTH; depth += 1) {
		if (seen.has(expression)) return undefined;
		seen.add(expression);
		const symbol = resolveAliasedSymbol(rawSymbolAt(expression, state), state);
		if (symbol) {
			const wrapper = wrappers.get(symbol);
			if (wrapper) return wrapper;
			const declaration = symbol.valueDeclaration;
			if (
				declaration &&
				ts.isVariableDeclaration(declaration) &&
				declaration.initializer &&
				ts.isVariableDeclarationList(declaration.parent) &&
				(declaration.parent.flags & ts.NodeFlags.Const) !== 0
			) {
				const initializer = unwrap(declaration.initializer);
				if (ts.isIdentifier(initializer) || ts.isPropertyAccessExpression(initializer)) {
					expression = initializer;
					continue;
				}
			}
		}
		return undefined;
	}
	return undefined;
}

// -------------------------------------------------------------------------------------------------
// Evaluation of static declaration expressions
// -------------------------------------------------------------------------------------------------

function evaluate(expression: ts.Expression, env: Env, state: CheckState, depth = 0): StaticValue {
	if (depth > MAX_STATIC_DEPTH) {
		return dynamic(expression, `static reference nesting exceeds ${MAX_STATIC_DEPTH} levels`);
	}
	const node = unwrap(expression);

	if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
		return { kind: "literal", value: node.text, node };
	}
	if (ts.isNumericLiteral(node)) {
		return { kind: "literal", value: Number(node.text), node };
	}
	if (node.kind === ts.SyntaxKind.TrueKeyword) return { kind: "literal", value: true, node };
	if (node.kind === ts.SyntaxKind.FalseKeyword) return { kind: "literal", value: false, node };
	if (node.kind === ts.SyntaxKind.NullKeyword) return { kind: "literal", value: null, node };
	if (ts.isIdentifier(node)) return evaluateIdentifier(node, env, state, depth);
	if (ts.isObjectLiteralExpression(node)) return evaluateObject(node, env, state, depth);
	if (ts.isArrayLiteralExpression(node)) return evaluateArray(node, env, state, depth);
	if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
		return evaluatePropertyAccess(node, env, state, depth);
	}
	if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
		const left = evaluate(node.left, env, state, depth + 1);
		if (left.kind === "dynamic") return dynamic(node, left.reason);
		if (left.kind === "absent" || (left.kind === "literal" && left.value === null)) {
			return evaluate(node.right, env, state, depth + 1);
		}
		return left;
	}
	if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
		return { kind: "function", node };
	}
	if (ts.isVoidExpression(node)) return { kind: "absent", node };
	if (ts.isPrefixUnaryExpression(node) && (node.operator === ts.SyntaxKind.PlusToken || node.operator === ts.SyntaxKind.MinusToken)) {
		const operand = evaluate(node.operand, env, state, depth + 1);
		if (operand.kind === "literal" && typeof operand.value === "number") {
			const value = node.operator === ts.SyntaxKind.MinusToken ? -operand.value : operand.value;
			return { kind: "literal", value, node };
		}
		return dynamic(node, "unary expression is not a static number");
	}
	if (ts.isCallExpression(node)) {
		return dynamic(node, "a call result is produced at runtime and is not statically resolvable");
	}
	if (ts.isConditionalExpression(node)) {
		return dynamic(node, "conditional control flow does not have one static value");
	}
	if (ts.isTemplateExpression(node)) {
		return dynamic(node, "template interpolation is produced at runtime");
	}
	if (ts.isAwaitExpression(node) || ts.isYieldExpression(node) || ts.isNewExpression(node) || ts.isTaggedTemplateExpression(node)) {
		return dynamic(node, "expression is produced at runtime");
	}
	if (ts.isClassExpression(node)) {
		return dynamic(node, "class expressions are not static declaration values");
	}
	if (ts.isOmittedExpression(node)) return { kind: "absent", node };
	return dynamic(node, "expression is not a statically resolvable declaration value");
}

function evaluateIdentifier(
	node: ts.Identifier,
	env: Env,
	state: CheckState,
	depth: number,
): StaticValue {
	if (node.text === "undefined") return { kind: "absent", node };
	const symbol = rawSymbolAt(node, state);
	if (!symbol) return dynamic(node, `identifier "${node.text}" does not resolve to a declaration`);

	const binding = env.get(symbol);
	if (binding) {
		if (!("expression" in binding)) return { kind: "absent", node: binding.absentNode };
		if (state.stack.has(symbol)) return dynamic(node, `cyclic static reference through "${node.text}"`);
		state.stack.add(symbol);
		try {
			return reanchor(evaluate(binding.expression, binding.env, state, depth + 1), node);
		} finally {
			state.stack.delete(symbol);
		}
	}

	const target = resolveAliasedSymbol(symbol, state);
	if (!target) return dynamic(node, `identifier "${node.text}" does not resolve to a declaration`);
	return resolveSymbolValue(target, node, env, state, depth);
}

function resolveSymbolValue(
	symbol: ts.Symbol,
	reference: ts.Node,
	env: Env,
	state: CheckState,
	depth: number,
): StaticValue {
	if (state.stack.has(symbol)) {
		return dynamic(reference, `cyclic static reference through "${symbol.name}"`);
	}
	const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
	if (!declaration) return dynamic(reference, `symbol "${symbol.name}" has no static declaration`);

	if (isWrapperFunctionNode(declaration) || ts.isMethodDeclaration(declaration)) {
		return { kind: "function", node: reference };
	}

	if (ts.isVariableDeclaration(declaration)) {
		if (!declaration.initializer) {
			return dynamic(reference, `const "${symbol.name}" has no initializer`);
		}
		const list = declaration.parent;
		if (!ts.isVariableDeclarationList(list) || (list.flags & ts.NodeFlags.Const) === 0) {
			return dynamic(reference, `"${symbol.name}" is a mutable binding; only const/import references are static`);
		}
		state.stack.add(symbol);
		try {
			return reanchor(evaluate(declaration.initializer, env, state, depth + 1), reference);
		} finally {
			state.stack.delete(symbol);
		}
	}

	if (ts.isEnumMember(declaration)) {
		if (!declaration.initializer) {
			return dynamic(reference, `enum member "${symbol.name}" does not have a static initializer`);
		}
		return reanchor(evaluate(declaration.initializer, env, state, depth + 1), reference);
	}

	if (ts.isParameter(declaration)) {
		return dynamic(reference, `parameter "${symbol.name}" is only known at a wrapper call site`);
	}

	return dynamic(reference, `"${symbol.name}" is not a static const or function reference`);
}

function reanchor(value: StaticValue, node: ts.Node): StaticValue {
	if (value.kind !== "dynamic") return value;
	return { kind: "dynamic", node, reason: value.reason };
}

function evaluateObject(
	node: ts.ObjectLiteralExpression,
	env: Env,
	state: CheckState,
	depth: number,
): StaticValue {
	const properties = new Map<string, StaticProperty>();
	const issues: StaticIssue[] = [];

	for (const property of node.properties) {
		if (ts.isPropertyAssignment(property)) {
			const key = evaluatePropertyKey(property.name, env, state, depth, issues);
			if (key === undefined) continue;
			properties.set(key, {
				key,
				keyNode: property.name,
				valueNode: property.initializer,
				value: evaluate(property.initializer, env, state, depth + 1),
			});
			continue;
		}

		if (ts.isShorthandPropertyAssignment(property)) {
			const key = property.name.text;
			properties.set(key, {
				key,
				keyNode: property.name,
				valueNode: property.name,
				value: evaluate(property.name, env, state, depth + 1),
			});
			continue;
		}

		if (ts.isMethodDeclaration(property)) {
			const key = evaluatePropertyKey(property.name, env, state, depth, issues);
			if (key === undefined) continue;
			properties.set(key, {
				key,
				keyNode: property.name,
				valueNode: property.name,
				value: { kind: "function", node: property },
			});
			continue;
		}

		if (ts.isSpreadAssignment(property)) {
			const spread = evaluate(property.expression, env, state, depth + 1);
			if (spread.kind === "object") {
				for (const [key, value] of spread.properties) properties.set(key, value);
				issues.push(...spread.issues);
			} else if (spread.kind === "dynamic") {
				issues.push({
					ruleId: "authoring/static-structure",
					node: property.expression,
					message: `Spread source is not statically resolvable: ${spread.reason}.`,
				});
			} else {
				issues.push({
					ruleId: "authoring/static-structure",
					node: property.expression,
					message: spread.kind === "array"
						? "An array cannot provide the static object entries of an authored declaration."
						: "Spread source must be a static object.",
				});
			}
			continue;
		}

		if (ts.isGetAccessorDeclaration(property) || ts.isSetAccessorDeclaration(property)) {
			const name = propertyNameText(property.name);
			issues.push({
				ruleId: "authoring/static-structure",
				node: property,
				message: `Accessor "${name ?? "<computed>"}" is not part of the static authored structure.`,
			});
			continue;
		}

		issues.push({
			ruleId: "authoring/static-structure",
			node: property,
			message: "This object member is not a static authored entry.",
		});
	}

	return { kind: "object", node, properties, issues };
}

function evaluatePropertyKey(
	name: ts.PropertyName,
	env: Env,
	state: CheckState,
	depth: number,
	issues: StaticIssue[],
): string | undefined {
	if (ts.isComputedPropertyName(name)) {
		const key = evaluate(name.expression, env, state, depth + 1);
		if (key.kind === "literal" && (typeof key.value === "string" || typeof key.value === "number")) {
			return String(key.value);
		}
		const reason = key.kind === "dynamic" ? key.reason : "the expression is not a string or number literal";
		issues.push({
			ruleId: "authoring/static-key",
			node: name,
			message: `Computed property name is not a static key: ${reason}.`,
		});
		return undefined;
	}
	const text = propertyNameText(name);
	if (text === undefined) {
		issues.push({
			ruleId: "authoring/static-key",
			node: name,
			message: "Property name is not statically known.",
		});
	}
	return text;
}

function evaluateArray(
	node: ts.ArrayLiteralExpression,
	env: Env,
	state: CheckState,
	depth: number,
): StaticValue {
	const items: StaticValue[] = [];
	const issues: StaticIssue[] = [];

	for (const element of node.elements) {
		if (ts.isSpreadElement(element)) {
			const spread = evaluate(element.expression, env, state, depth + 1);
			if (spread.kind === "array") {
				items.push(...spread.items);
				issues.push(...spread.issues);
			} else if (spread.kind === "dynamic") {
				issues.push({
					ruleId: "authoring/static-structure",
					node: element.expression,
					message: `Spread source is not statically resolvable: ${spread.reason}.`,
				});
			} else {
				issues.push({
					ruleId: "authoring/static-structure",
					node: element.expression,
					message: spread.kind === "object"
						? "An object cannot provide the static entries of an authored array."
						: "Spread source must be a static array.",
				});
			}
			continue;
		}
		if (ts.isOmittedExpression(element)) {
			issues.push({
				ruleId: "authoring/static-structure",
				node: element,
				message: "An array hole is not a static authored entry.",
			});
			continue;
		}
		items.push(evaluate(element, env, state, depth + 1));
	}

	return { kind: "array", node, items, issues };
}

function evaluatePropertyAccess(
	node: ts.PropertyAccessExpression | ts.ElementAccessExpression,
	env: Env,
	state: CheckState,
	depth: number,
): StaticValue {
	const base = evaluate(node.expression, env, state, depth + 1);
	let name: string | undefined;
	if (ts.isPropertyAccessExpression(node)) {
		name = node.name.text;
	} else {
		const key = evaluate(node.argumentExpression, env, state, depth + 1);
		if (key.kind === "literal" && (typeof key.value === "string" || typeof key.value === "number")) {
			name = String(key.value);
		}
	}

	if (base.kind === "dynamic") {
		const member = evaluateMemberSymbol(node, env, state, depth);
		return member ?? dynamic(node, base.reason);
	}
	if (base.kind === "absent") {
		if (node.questionDotToken) return { kind: "absent", node };
		const member = evaluateMemberSymbol(node, env, state, depth);
		return member ?? dynamic(node, "property is read from an absent static value");
	}
	if (base.kind === "object") {
		if (name === undefined) return dynamic(node, "computed property name is not static");
		const property = base.properties.get(name);
		return property ? reanchor(property.value, node) : { kind: "absent", node };
	}
	if (base.kind === "array" && name !== undefined) {
		if (name === "length") return { kind: "literal", value: base.items.length, node };
		if (/^(0|[1-9][0-9]*)$/.test(name)) {
			const item = base.items[Number(name)];
			return item ? reanchor(item, node) : { kind: "absent", node };
		}
	}
	return dynamic(node, `property "${name ?? "<computed>"}" is not available on a static ${base.kind}`);
}

/**
 * Resolve a property access whose base is a module/namespace (or otherwise not a materialized
 * static object) through the member symbol itself. Local object-literal members remain owned by
 * the object evaluation above; only value declarations with a real initializer are followed.
 */
function evaluateMemberSymbol(
	node: ts.PropertyAccessExpression | ts.ElementAccessExpression,
	env: Env,
	state: CheckState,
	depth: number,
): StaticValue | undefined {
	const symbol = resolveAliasedSymbol(rawSymbolAt(node, state), state);
	if (!symbol) return undefined;
	const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
	if (!declaration) return undefined;
	if (
		!ts.isVariableDeclaration(declaration) &&
		!ts.isFunctionDeclaration(declaration) &&
		!ts.isEnumMember(declaration) &&
		!ts.isClassDeclaration(declaration)
	) {
		return undefined;
	}
	return resolveSymbolValue(symbol, node, env, state, depth);
}

function dynamic(node: ts.Node, reason: string): StaticValue {
	return { kind: "dynamic", node, reason };
}

// -------------------------------------------------------------------------------------------------
// Declaration validation
// -------------------------------------------------------------------------------------------------

function analyzeDirectDeclaration(
	call: ts.CallExpression,
	state: CheckState,
	refs: Set<ts.Symbol>,
): AuthoredImplementationView | undefined {
	if (call.arguments.some(ts.isSpreadElement)) {
		report(state, "authoring/static-structure", call, "A spread argument cannot be resolved to the single authored declaration.");
		return undefined;
	}
	const argument = call.arguments[0];
	if (!argument) {
		report(state, "authoring/static-structure", call, "defineImplementation requires one static declaration object.");
		return undefined;
	}
	collectStaticRefs(argument, EMPTY_ENV, state, refs);
	const value = evaluate(argument, EMPTY_ENV, state);
	if (value.kind === "dynamic") {
		report(state, "authoring/static-structure", argument, `Declaration is not statically resolvable: ${value.reason}.`);
		return undefined;
	}
	if (value.kind !== "object") {
		report(state, "authoring/static-structure", argument, "Declaration must be a static object literal or a const/import reference to one.");
		return undefined;
	}
	validateDeclarationObject(value, state);
	return implementationView(value, call, state);
}

function analyzeWrapperInstantiation(
	wrapper: WrapperInfo,
	call: ts.CallExpression,
	state: CheckState,
	refs: Set<ts.Symbol>,
): AuthoredImplementationView | undefined {
	const body = wrapper.fn.body;
	if (body && ts.isBlock(body)) {
		const unsupported = body.statements.find(statement =>
			!ts.isVariableStatement(statement) && !ts.isFunctionDeclaration(statement) && !ts.isReturnStatement(statement));
		const returns = body.statements.filter(ts.isReturnStatement);
		if (unsupported || returns.length !== 1 || body.statements[body.statements.length - 1] !== returns[0]) {
			report(state, "authoring/static-structure", unsupported ?? body,
				"An authoring wrapper must have one unconditional final return and static bindings; move conditional business work into create or handlers without changing registration semantics.");
			return;
		}
	}
	const parameters = wrapper.fn.parameters;
	if (parameters.some(parameter => !ts.isIdentifier(parameter.name) || parameter.dotDotDotToken !== undefined)) {
		report(state, "authoring/static-structure", call, "Wrapper parameters must be simple identifiers without rest parameters so each declaration can be mapped statically.");
		return;
	}
	if (call.arguments.some(ts.isSpreadElement)) {
		const spread = call.arguments.find(ts.isSpreadElement);
		report(state, "authoring/static-structure", spread ?? call, "A spread wrapper argument cannot be mapped to the wrapper's parameters.");
		return;
	}
	if (call.arguments.length > parameters.length) {
		report(state, "authoring/static-structure", call.arguments[parameters.length], "This wrapper receives more arguments than its static parameter list can map.");
		return;
	}

	const env = new Map<ts.Symbol, EnvBinding>();
	for (let index = 0; index < parameters.length; index += 1) {
		const parameter = parameters[index];
		if (!ts.isIdentifier(parameter.name)) continue;
		const symbol = rawSymbolAt(parameter.name, state);
		if (!symbol) continue;
		const argument = call.arguments[index];
		if (argument && !isUndefinedExpression(argument)) {
			const value = evaluate(argument, EMPTY_ENV, state);
			if (value.kind === "dynamic") {
				report(state, "authoring/static-structure", argument, `Wrapper argument is not statically resolvable: ${value.reason}.`);
				return;
			}
			if ((value.kind === "object" || value.kind === "array") && value.issues.length > 0) {
				reportIssues(value.issues, state);
				return;
			}
			collectStaticRefs(argument, EMPTY_ENV, state, refs);
			env.set(symbol, { expression: argument, env: EMPTY_ENV });
			continue;
		}
		if (parameter.initializer) {
			const value = evaluate(parameter.initializer, EMPTY_ENV, state);
			if (value.kind === "dynamic") {
				report(state, "authoring/static-structure", parameter.initializer, `Wrapper parameter default is not statically resolvable: ${value.reason}.`);
				return;
			}
			if ((value.kind === "object" || value.kind === "array") && value.issues.length > 0) {
				reportIssues(value.issues, state);
				return;
			}
			collectStaticRefs(parameter.initializer, EMPTY_ENV, state, refs);
			env.set(symbol, { expression: parameter.initializer, env: EMPTY_ENV });
			continue;
		}
		env.set(symbol, { absentNode: parameter.name });
	}

	const declarationCall = wrapper.call;
	if (declarationCall.arguments.some(ts.isSpreadElement)) {
		report(state, "authoring/static-structure", declarationCall, "The wrapper's authored declaration uses a spread argument that cannot be mapped.");
		return;
	}
	const argument = declarationCall.arguments[0];
	if (!argument) {
		report(state, "authoring/static-structure", call, "The wrapper does not pass a declaration object to defineImplementation.");
		return;
	}

	collectStaticRefs(argument, env, state, refs);
	const value = evaluate(argument, env, state);
	if (value.kind === "dynamic") {
		report(state, "authoring/static-structure", call, `Wrapper declaration is not statically resolvable at this call: ${value.reason}.`);
		return;
	}
	if (value.kind !== "object") {
		report(state, "authoring/static-structure", call, "Wrapper declaration must resolve to a static object literal.");
		return undefined;
	}
	validateDeclarationObject(value, state);
	return implementationView(value, call, state);
}

/** The function declaration a handler expression really names, following aliases and initializers. */
function resolveFunctionNode(node: ts.Node, state: CheckState): ts.FunctionLikeDeclaration | undefined {
	let target = unwrapNode(node);
	if (isAnyFunctionLike(target)) return target as ts.FunctionLikeDeclaration;
	for (let depth = 0; depth < MAX_ALIAS_DEPTH; depth += 1) {
		let symbol: ts.Symbol | undefined;
		if (ts.isPropertyAccessExpression(target)) symbol = rawSymbolAt(target.name, state);
		else if (ts.isIdentifier(target) || ts.isShorthandPropertyAssignment(target)) symbol = rawSymbolAt(target, state);
		const resolved = resolveAliasedSymbol(symbol, state);
		const declaration = resolved?.valueDeclaration ?? resolved?.declarations?.[0];
		if (!declaration) return undefined;
		if (isAnyFunctionLike(declaration)) return declaration as ts.FunctionLikeDeclaration;
		if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
			target = unwrapNode(declaration.initializer);
			if (isAnyFunctionLike(target)) return target as ts.FunctionLikeDeclaration;
			continue;
		}
		if (ts.isPropertyAssignment(declaration) && declaration.initializer) {
			target = unwrapNode(declaration.initializer);
			if (isAnyFunctionLike(target)) return target as ts.FunctionLikeDeclaration;
			continue;
		}
		if (ts.isShorthandPropertyAssignment(declaration)) {
			target = declaration.name;
			continue;
		}
		return undefined;
	}
	return undefined;
}

function unwrapNode(node: ts.Node): ts.Node {
	let current = node;
	for (;;) {
		if (
			ts.isParenthesizedExpression(current) ||
			ts.isAsExpression(current) ||
			ts.isTypeAssertionExpression(current) ||
			ts.isSatisfiesExpression(current) ||
			ts.isNonNullExpression(current)
		) {
			current = current.expression;
			continue;
		}
		return current;
	}
}

function functionFromStatic(value: StaticValue | undefined, state: CheckState): ts.FunctionLikeDeclaration | undefined {
	if (value === undefined || value.kind !== "function") return undefined;
	return resolveFunctionNode(value.node, state);
}

function subscriptionViews(property: StaticProperty | undefined, state: CheckState): AuthoredSubscriptionView[] {
	const groups = property?.value;
	if (groups?.kind !== "array") return [];
	const views: AuthoredSubscriptionView[] = [];
	for (const item of groups.items) {
		if (item.kind !== "object") continue;
		const scopeValue = item.properties.get("scope")?.value;
		const scope =
			scopeValue !== undefined &&
			scopeValue.kind === "literal" &&
			(scopeValue.value === "owner" || scopeValue.value === "session")
				? scopeValue.value
				: undefined;
		const eventsValue = item.properties.get("events")?.value;
		const events: AuthoredEventView[] = [];
		if (eventsValue !== undefined && eventsValue.kind === "object") {
			for (const [kind, eventProperty] of eventsValue.properties) {
				const handler = functionFromStatic(eventProperty.value, state);
				events.push({
					kind,
					origin: sourceLocation(state, eventProperty.keyNode),
					...(handler === undefined ? {} : { handler }),
				});
			}
		}
		views.push({ ...(scope === undefined ? {} : { scope }), events, origin: sourceLocation(state, item.node) });
	}
	return views;
}

function commandViews(property: StaticProperty | undefined, state: CheckState): AuthoredCommandView[] {
	const commands = property?.value;
	if (commands?.kind !== "object") return [];
	const views: AuthoredCommandView[] = [];
	for (const [name, commandProperty] of commands.properties) {
		const origin = sourceLocation(state, commandProperty.keyNode);
		const value = commandProperty.value;
		if (value.kind !== "object") {
			views.push({ name, actions: [], handlers: [], origin });
			continue;
		}
		const run = value.properties.get("run");
		const unrecognized = value.properties.get("unrecognized");
		const handlers: AuthoredCommandHandlerView[] = [];
		if (run !== undefined || unrecognized !== undefined) {
			for (const [role, handlerProperty] of [["run", run], ["unrecognized", unrecognized]] as const) {
				if (handlerProperty === undefined) continue;
				const handler = functionFromStatic(handlerProperty.value, state);
				handlers.push({
					role,
					origin: sourceLocation(state, handlerProperty.valueNode),
					...(handler === undefined ? {} : { node: handler }),
				});
			}
			views.push({ name, kind: "directed", actions: [], handlers, origin });
			continue;
		}
		const actions: string[] = [];
		for (const [actionName, actionProperty] of value.properties) {
			actions.push(actionName);
			const handler = functionFromStatic(actionProperty.value, state);
			handlers.push({
				role: actionName,
				origin: sourceLocation(state, actionProperty.valueNode),
				...(handler === undefined ? {} : { node: handler }),
			});
		}
		views.push({ name, kind: "actions", actions, handlers, origin });
	}
	return views;
}

function toolViews(property: StaticProperty | undefined, state: CheckState): AuthoredImplementationView["tools"] {
	if (property === undefined || property.value.kind !== "array") return [];
	return property.value.items.flatMap(value => {
		if (value.kind !== "object") return [];
		const name = value.properties.get("name")?.value;
		if (name?.kind !== "literal" || typeof name.value !== "string") return [];
		const execute = functionFromStatic(value.properties.get("execute")?.value, state);
		return [{ name: name.value, ...(execute === undefined ? {} : { execute }), origin: sourceLocation(state, value.node) }];
	});
}

function implementationView(
	declaration: Extract<StaticValue, { kind: "object" }>,
	originNode: ts.Node,
	state: CheckState,
): AuthoredImplementationView {
	const create = functionFromStatic(declaration.properties.get("create")?.value, state);
	const catalog = functionFromStatic(declaration.properties.get("catalog")?.value, state);
	const initialize = functionFromStatic(declaration.properties.get("initialize")?.value, state);
	const cleanup = functionFromStatic(declaration.properties.get("cleanup")?.value, state);
	return {
		origin: sourceLocation(state, originNode),
		...(create === undefined ? {} : { create }),
		subscriptions: subscriptionViews(declaration.properties.get("subscriptions"), state),
		commands: commandViews(declaration.properties.get("commands"), state),
		tools: toolViews(declaration.properties.get("tools"), state),
		...(catalog === undefined ? {} : { catalog }),
		...(initialize === undefined ? {} : { initialize }),
		...(cleanup === undefined ? {} : { cleanup }),
	};
}

/** One source position, in the same repo-relative shape the integration model uses. */
function sourceLocation(state: CheckState, node: ts.Node): AuthoringSourceLocation {
	const sourceFile = ts.isSourceFile(node) ? node : node.getSourceFile();
	if (!sourceFile) return { file: relativeFile(state.root, state.root), line: 1, column: 1 };
	let start = 0;
	if (!ts.isSourceFile(node)) {
		try {
			start = node.getStart(sourceFile);
		} catch {
			start = node.pos;
		}
	}
	start = Math.max(0, Math.min(start, sourceFile.text.length));
	const position = sourceFile.getLineAndCharacterOfPosition(start);
	return { file: relativeFile(state.root, sourceFile.fileName), line: position.line + 1, column: position.character + 1 };
}

function validateDeclarationObject(declaration: Extract<StaticValue, { kind: "object" }>, state: CheckState): void {
	reportIssues(declaration.issues, state);

	const structurallyIncomplete = declaration.issues.length > 0;
	const create = declaration.properties.get("create");
	if (!create) {
		if (!structurallyIncomplete) {
			report(state, "authoring/static-structure", declaration.node, "The authored declaration must include a `create` function.");
		}
	} else {
		validateCallable(create, "Declaration `create`", state);
	}

	const subscriptions = declaration.properties.get("subscriptions");
	if (subscriptions && subscriptions.value.kind !== "absent") {
		if (subscriptions.value.kind !== "array") {
			report(
				state,
				"authoring/static-structure",
				subscriptions.valueNode,
				"`subscriptions` must be a static array of subscription groups.",
			);
		} else {
			reportIssues(subscriptions.value.issues, state);
			for (const group of subscriptions.value.items) validateSubscriptionGroup(group, state);
		}
	}

	const commands = declaration.properties.get("commands");
	if (commands && commands.value.kind !== "absent") {
		if (commands.value.kind !== "object") {
			report(state, "authoring/static-structure", commands.valueNode, "`commands` must be a static object keyed by command name.");
		} else {
			reportIssues(commands.value.issues, state);
			for (const [name, command] of commands.value.properties) validateCommand(name, command, state);
		}
	}

	const tools = declaration.properties.get("tools");
	if (tools && tools.value.kind !== "absent") {
		if (tools.value.kind !== "array") {
			report(state, "authoring/static-structure", tools.valueNode, "`tools` must be a static array of tool declarations.");
		} else {
			reportIssues(tools.value.issues, state);
			for (const tool of tools.value.items) {
				if (tool.kind !== "object") {
					report(state, "authoring/static-structure", tool.node, "A tool must be a static declaration object.");
					continue;
				}
				reportIssues(tool.issues, state);
				const name = tool.properties.get("name")?.value;
				if (name?.kind !== "literal" || typeof name.value !== "string") {
					report(state, "authoring/static-structure", tool.node, "A tool name must be a static string.");
				}
				const execute = tool.properties.get("execute");
				if (execute) validateCallable(execute, "Tool `execute`", state);
				else report(state, "authoring/static-structure", tool.node, "A tool must declare `execute`.");
			}
		}
	}

	for (const slot of ["catalog", "initialize", "cleanup"] as const) {
		const property = declaration.properties.get(slot);
		if (property && property.value.kind !== "absent") {
			validateCallable(property, `Declaration \`${slot}\``, state);
		}
	}
}

function validateSubscriptionGroup(value: StaticValue, state: CheckState): void {
	if (value.kind === "dynamic") {
		report(state, "authoring/static-structure", value.node, `Subscription group is not statically resolvable: ${value.reason}.`);
		return;
	}
	if (value.kind !== "object") {
		report(state, "authoring/static-structure", value.node, "Each subscription entry must be a static object with `scope` and `events`.");
		return;
	}

	reportIssues(value.issues, state);

	const structurallyIncomplete = value.issues.length > 0;
	const scope = value.properties.get("scope");
	if (!scope) {
		if (!structurallyIncomplete) {
			report(state, "authoring/static-scope", value.node, "Subscription group must declare an observation scope.");
		}
	} else if (scope.value.kind !== "literal" || (scope.value.value !== "owner" && scope.value.value !== "session")) {
		const detail = scope.value.kind === "dynamic"
			? scope.value.reason
			: `found ${describeValue(scope.value)}`;
		report(
			state,
			"authoring/static-scope",
			scope.valueNode,
			`Subscription scope must be the static literal "owner" or "session": ${detail}.`,
		);
	}

	const events = value.properties.get("events");
	if (!events) {
		if (!structurallyIncomplete) {
			report(state, "authoring/static-key", value.node, "Subscription group must declare a static events table.");
		}
		return;
	}
	if (events.value.kind === "dynamic") {
		report(state, "authoring/static-key", events.valueNode, `Events table is not statically resolvable: ${events.value.reason}.`);
		return;
	}
	if (events.value.kind !== "object") {
		report(state, "authoring/static-key", events.valueNode, "`events` must be a static object keyed by semantic event name.");
		return;
	}

	reportIssues(events.value.issues, state);
	for (const [eventName, handler] of events.value.properties) {
		if (handler.value.kind !== "absent") {
			validateCallable(handler, `Event handler for "${eventName}"`, state);
		}
	}
}

function validateCommand(name: string, command: StaticProperty, state: CheckState): void {
	const value = command.value;
	if (value.kind === "dynamic") {
		report(state, "authoring/handler", command.valueNode, `Command "${name}" is not statically resolvable: ${value.reason}.`);
		return;
	}
	if (value.kind !== "object") {
		report(state, "authoring/handler", command.valueNode, `Command "${name}" must be a static object of handlers.`);
		return;
	}

	reportIssues(value.issues, state);

	const run = value.properties.get("run");
	if (run) {
		validateCallable(run, `Command "${name}" run handler`, state);
		const unrecognized = value.properties.get("unrecognized");
		if (unrecognized) validateCallable(unrecognized, `Command "${name}" unrecognized handler`, state);
		return;
	}

	for (const [actionName, action] of value.properties) {
		validateCallable(action, `Command "${name}" action "${actionName}"`, state);
	}
}

function validateCallable(property: StaticProperty, role: string, state: CheckState): void {
	const value = property.value;
	if (value.kind === "function") return;
	if (value.kind === "dynamic") {
		report(state, "authoring/handler", property.valueNode, `${role} is not statically resolvable: ${value.reason}.`);
		return;
	}
	report(state, "authoring/handler", property.valueNode, `${role} must be a statically resolvable function; found ${describeValue(value)}.`);
}

function describeValue(value: StaticValue): string {
	switch (value.kind) {
		case "absent":
			return "an absent value";
		case "literal":
			return typeof value.value === "string" ? `the literal "${value.value}"` : `the literal ${String(value.value)}`;
		case "array":
			return "an array";
		case "object":
			return "an object";
		case "function":
			return "a function";
		case "dynamic":
			return "a dynamic value";
		default:
			return "an unknown value";
	}
}

function reportIssues(issues: readonly StaticIssue[], state: CheckState): void {
	for (const issue of issues) report(state, issue.ruleId, issue.node, issue.message);
}

// -------------------------------------------------------------------------------------------------
// Static reference collection and mutation detection
// -------------------------------------------------------------------------------------------------

function collectStaticRefs(
	node: ts.Node,
	env: Env,
	state: CheckState,
	refs: Set<ts.Symbol>,
	depth = 0,
	seen = new Set<ts.Symbol>(),
): void {
	if (depth > MAX_STATIC_DEPTH) return;
	const expression = ts.isExpression(node) ? unwrap(node) : node;

	if (isAnyFunctionLike(expression)) return;
	// A callable value is executable behavior, not its captured declaration structure.
	// In particular, handing an authored factory to an adapter must not recursively
	// expose the object passed to defineImplementation. Explicit `.declaration`
	// accesses remain structural and are checked separately by mutationTargetInfo.
	if (ts.isCallExpression(expression) && state.checker.getTypeAtLocation(expression).getCallSignatures().length > 0) return;

	if (ts.isIdentifier(expression)) {
		if (expression.text === "undefined") return;
		const raw = rawSymbolAt(expression, state);
		if (!raw) return;
		const binding = env.get(raw);
		if (binding) {
			if ("expression" in binding) collectStaticRefs(binding.expression, binding.env, state, refs, depth + 1, seen);
			return;
		}
		const target = resolveAliasedSymbol(raw, state);
		if (!target) return;
		refs.add(target);
		// Keep the value reference itself: wrapper detection needs callable parameters
		// such as `create`. Only its captured initializer is outside structural data.
		if (state.checker.getTypeAtLocation(expression).getCallSignatures().length > 0) return;
		if (seen.has(target)) return;
		seen.add(target);
		const declaration = target.valueDeclaration;
		if (
			declaration &&
			ts.isVariableDeclaration(declaration) &&
			declaration.initializer &&
			ts.isVariableDeclarationList(declaration.parent) &&
			(declaration.parent.flags & ts.NodeFlags.Const) !== 0
		) {
			collectStaticRefs(declaration.initializer, env, state, refs, depth + 1, seen);
		}
		return;
	}

	if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
		collectStaticRefs(expression.expression, env, state, refs, depth + 1, seen);
		if (ts.isElementAccessExpression(expression)) {
			collectStaticRefs(expression.argumentExpression, env, state, refs, depth + 1, seen);
		}
		const member = resolveAliasedSymbol(rawSymbolAt(expression, state), state);
		if (member && !seen.has(member)) {
			refs.add(member);
			seen.add(member);
			const declaration = member.valueDeclaration;
			if (
				declaration &&
				ts.isVariableDeclaration(declaration) &&
				declaration.initializer &&
				ts.isVariableDeclarationList(declaration.parent) &&
				(declaration.parent.flags & ts.NodeFlags.Const) !== 0
			) {
				collectStaticRefs(declaration.initializer, env, state, refs, depth + 1, seen);
			}
		}
		return;
	}

	if (ts.isObjectLiteralExpression(expression)) {
		for (const property of expression.properties) {
			if (ts.isPropertyAssignment(property)) {
				if (ts.isComputedPropertyName(property.name)) {
					collectStaticRefs(property.name.expression, env, state, refs, depth + 1, seen);
				}
				collectStaticRefs(property.initializer, env, state, refs, depth + 1, seen);
			} else if (ts.isShorthandPropertyAssignment(property)) {
				collectStaticRefs(property.name, env, state, refs, depth + 1, seen);
			} else if (ts.isSpreadAssignment(property)) {
				collectStaticRefs(property.expression, env, state, refs, depth + 1, seen);
			}
		}
		return;
	}

	if (ts.isArrayLiteralExpression(expression)) {
		for (const element of expression.elements) {
			if (ts.isSpreadElement(element)) {
				collectStaticRefs(element.expression, env, state, refs, depth + 1, seen);
			} else if (!ts.isOmittedExpression(element)) {
				collectStaticRefs(element, env, state, refs, depth + 1, seen);
			}
		}
		return;
	}

	ts.forEachChild(expression, child => {
		if (ts.isTypeNode(child)) return;
		collectStaticRefs(child, env, state, refs, depth + 1, seen);
	});
}

interface MutationTarget {
	readonly rootExpression: ts.Expression;
	readonly rootSymbol?: ts.Symbol;
	readonly propertyNames: readonly string[];
}

function mutationTargetInfo(target: ts.Expression, state: CheckState): MutationTarget {
	let expression = unwrap(target);
	const names: string[] = [];
	for (;;) {
		if (ts.isPropertyAccessExpression(expression)) {
			names.unshift(expression.name.text);
			expression = unwrap(expression.expression);
			continue;
		}
		if (ts.isElementAccessExpression(expression)) {
			const key = evaluate(expression.argumentExpression, EMPTY_ENV, state);
			names.unshift(key.kind === "literal" ? String(key.value) : "<computed>");
			expression = unwrap(expression.expression);
			continue;
		}
		break;
	}
	const rootSymbol = ts.isIdentifier(expression)
		? resolveAliasedSymbol(rawSymbolAt(expression, state), state)
		: undefined;
	return { rootExpression: expression, rootSymbol, propertyNames: names };
}

function collectMutationDiagnostics(
	sources: readonly ts.SourceFile[],
	state: CheckState,
	declarationRefs: ReadonlySet<ts.Symbol>,
	authoredResults: ReadonlySet<ts.Symbol>,
	wrappers: ReadonlyMap<ts.Symbol, WrapperInfo>,
): void {
	if (declarationRefs.size === 0 && authoredResults.size === 0) return;
	const reported = new Set<ts.Node>();

	const checkTarget = (target: ts.Expression, diagnosticNode: ts.Node): void => {
		if (reported.has(diagnosticNode)) return;
		const info = mutationTargetInfo(target, state);
		if (!isDeclarationMutation(info, declarationRefs, authoredResults, wrappers, state)) return;
		reported.add(diagnosticNode);
		const text = target.getText(target.getSourceFile());
		const compact = text.length > 100 ? `${text.slice(0, 97)}...` : text;
		report(
			state,
			"authoring/mutation",
			diagnosticNode,
			`Authored declaration structure is mutated at "${compact}". Declaration shape must stay static.`,
		);
	};

	for (const sourceFile of sources) {
		walk(sourceFile, node => {
			if (ts.isBinaryExpression(node) && ASSIGNMENT_OPERATORS.has(node.operatorToken.kind)) {
				checkTarget(node.left, node);
				return;
			}
			if (
				(ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
				(node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)
			) {
				checkTarget(unwrap(node.operand), node);
				return;
			}
			if (ts.isDeleteExpression(node)) {
				checkTarget(node.expression, node);
				return;
			}
			if (!ts.isCallExpression(node)) return;
			if (!isCanonicalEntryCall(node, state) && !resolveWrapperForCallee(node.expression, wrappers, state)) {
				for (const argument of node.arguments) {
					if (ts.isSpreadElement(argument)) continue;
					const value = evaluate(argument, EMPTY_ENV, state);
					if (value.kind !== "object" && value.kind !== "array" &&
						!isDeclarationMutation(mutationTargetInfo(argument, state), new Set(), authoredResults, wrappers, state)) continue;
					const references = new Set<ts.Symbol>();
					collectStaticRefs(argument, EMPTY_ENV, state, references);
					if (![...references].some(symbol => declarationRefs.has(symbol)) &&
						!isDeclarationMutation(mutationTargetInfo(argument, state), declarationRefs, authoredResults, wrappers, state)) continue;
					report(state, "authoring/static-structure", argument,
						"A declaration structure escapes into an opaque function call; its shape may be mutated and cannot be verified statically. Keep structural composition in static literals or supported authoring wrappers.");
				}
			}
			if (!ts.isPropertyAccessExpression(node.expression)) return;
			const method = node.expression.name.text;
			if (MUTATING_METHODS[method] === true) {
				checkTarget(node.expression.expression, node);
				return;
			}
			const receiver = node.expression.expression;
			if (
				ts.isIdentifier(receiver) &&
				receiver.text === "Object" &&
				OBJECT_MUTATING_METHODS[method] === true &&
				node.arguments[0]
			) {
				checkTarget(node.arguments[0], node);
				return;
			}
			if (
				ts.isIdentifier(receiver) &&
				receiver.text === "Reflect" &&
				REFLECT_MUTATING_METHODS[method] === true &&
				node.arguments[0]
			) {
				checkTarget(node.arguments[0], node);
			}
		});
	}
}

function isDeclarationMutation(
	info: MutationTarget,
	declarationRefs: ReadonlySet<ts.Symbol>,
	authoredResults: ReadonlySet<ts.Symbol>,
	wrappers: ReadonlyMap<ts.Symbol, WrapperInfo>,
	state: CheckState,
	seen = new Set<ts.Symbol>(),
): boolean {
	if (info.rootSymbol && declarationRefs.has(info.rootSymbol)) return true;
	if (info.rootSymbol && !seen.has(info.rootSymbol) && seen.size < MAX_ALIAS_DEPTH) {
		seen.add(info.rootSymbol);
		const declaration = info.rootSymbol.valueDeclaration;
		let initializer: ts.Expression | undefined;
		let extracted: string[] = [];
		if (declaration && ts.isVariableDeclaration(declaration)) initializer = declaration.initializer;
		else if (declaration && ts.isBindingElement(declaration) && ts.isObjectBindingPattern(declaration.parent)) {
			const owner = declaration.parent.parent;
			if (ts.isVariableDeclaration(owner)) {
				initializer = owner.initializer;
				const key = propertyNameText(declaration.propertyName ?? declaration.name as ts.PropertyName);
				if (key !== undefined) extracted = [key];
			}
		}
		if (initializer) {
			const source = mutationTargetInfo(initializer, state);
			if (isDeclarationMutation({
				...source,
				propertyNames: [...source.propertyNames, ...extracted, ...info.propertyNames],
			}, declarationRefs, authoredResults, wrappers, state, seen)) return true;
		}
	}
	if (!info.propertyNames.includes("declaration")) return false;
	if (info.rootSymbol && authoredResults.has(info.rootSymbol)) return true;
	if (info.rootSymbol && isAuthoredImplementationParameter(info.rootSymbol)) return true;
	const root = unwrap(info.rootExpression);
	if (!ts.isCallExpression(root)) return false;
	return isCanonicalEntryCall(root, state) || resolveWrapperForCallee(root.expression, wrappers, state) !== undefined;
}

function isAuthoredImplementationParameter(symbol: ts.Symbol): boolean {
	const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
	if (!declaration || !ts.isParameter(declaration) || !declaration.type) return false;
	return declaration.type.getText().includes("AuthoredImplementation");
}

// -------------------------------------------------------------------------------------------------
// Diagnostics
// -------------------------------------------------------------------------------------------------

function suggestionFor(ruleId: AuthoringRuleId): string {
	return AUTHORING_RULES.find(rule => rule.id === ruleId)?.suggestion ?? "Review the authoring rule description.";
}

function report(state: CheckState, ruleId: AuthoringRuleId, node: ts.Node, message: string): void {
	const sourceFile = ts.isSourceFile(node) ? node : node.getSourceFile();
	if (!sourceFile) return;
	let start = 0;
	if (!ts.isSourceFile(node)) {
		try {
			start = node.getStart(sourceFile);
		} catch {
			start = node.pos;
		}
	}
	start = Math.max(0, Math.min(start, sourceFile.text.length));
	const position = sourceFile.getLineAndCharacterOfPosition(start);
	state.diagnostics.push({
		ruleId,
		file: relativeFile(state.root, sourceFile.fileName),
		line: position.line + 1,
		column: position.character + 1,
		message,
		suggestion: suggestionFor(ruleId),
	});
}

function finishResult(
	filesChecked: number,
	declarationsChecked: number,
	diagnostics: readonly AuthoringDiagnostic[],
): AuthoringCheckResult {
	const unique = new Map<string, AuthoringDiagnostic>();
	for (const diagnostic of diagnostics) {
		const key = [
			diagnostic.ruleId,
			diagnostic.file,
			String(diagnostic.line),
			String(diagnostic.column),
			diagnostic.message,
			diagnostic.suggestion,
		].join("\u0000");
		if (!unique.has(key)) unique.set(key, diagnostic);
	}
	const sorted = [...unique.values()].sort((left, right) => {
		if (left.file !== right.file) return left.file < right.file ? -1 : 1;
		if (left.line !== right.line) return left.line - right.line;
		if (left.column !== right.column) return left.column - right.column;
		if (left.ruleId !== right.ruleId) return left.ruleId < right.ruleId ? -1 : 1;
		return left.message < right.message ? -1 : left.message > right.message ? 1 : 0;
	});
	return { filesChecked, declarationsChecked, diagnostics: sorted };
}
