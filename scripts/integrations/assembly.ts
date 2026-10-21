/**
 * Assembly-specific output contracts for selected extension sources.
 *
 * The witness read here is the canonical `AdapterFactoryOutput<Port>` property declared by
 * `framework/runtime/adapter-authoring.ts`. It is a type-only statement: this module never imports,
 * executes or instantiates the extension, adapter or native host. A witness establishes what the
 * extension's own assembly factory declares about the port it assembles; it does not establish that
 * any native provider registered, that a factory body ran, or that the adapter is semantically
 * correct. Those remain outside structural integration analysis.
 *
 * Only actual calls written in the selected extension files whose resolved declaration lives inside
 * the selected adapter's directory are candidates. A candidate is assembly evidence only when its
 * resolved output carries the canonical witness; ordinary adapter API calls from the same extension
 * (for example a native event subscription) are not assembly factories. The concrete `Port` comes
 * from the call's resolved signature, so aliases and overloads follow TypeScript's own resolution;
 * nothing here guesses from a function name or from an option literal such as `childEntry`.
 */
import path from "node:path";
import ts from "typescript-compiler";

/** A concrete assembly's statement about one port member. */
export type AssemblyMemberStatus = "provided" | "unavailable" | "conditional" | "unresolved";

interface AssemblyCall {
	readonly call: ts.CallExpression;
	/** Concrete witness ports from the resolved return type; absent when analysis was unsupported. */
	readonly ports?: readonly ts.Type[];
	/** Why a call that resolves into the selected adapter cannot serve as output evidence. */
	readonly unsupported?: string;
}

export interface AssemblyAnalysis {
	readonly files: readonly string[];
	readonly calls: readonly AssemblyCall[];
}

export interface AssemblyMemberEvaluation {
	readonly status: AssemblyMemberStatus;
	readonly reason?: string;
	/** The assembly call the conclusion is read from, for the consumer's source location. */
	readonly call?: ts.CallExpression;
}

const UNSUPPORTED_TYPE_FLAGS =
	ts.TypeFlags.Any |
	ts.TypeFlags.Unknown |
	ts.TypeFlags.TypeParameter |
	ts.TypeFlags.Conditional |
	ts.TypeFlags.IndexedAccess |
	ts.TypeFlags.Substitution;

const ABSENT_TYPE_FLAGS = ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.Void;

function pathKey(file: string): string {
	const resolved = path.resolve(file);
	return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function fileInside(fileName: string, directoryKey: string): boolean {
	const key = pathKey(fileName);
	return key === directoryKey || key.startsWith(`${directoryKey}${path.sep}`);
}

function sameDeclaration(left: ts.Declaration, right: ts.Declaration): boolean {
	return left === right ||
		(left.kind === right.kind && left.pos === right.pos && left.getSourceFile() === right.getSourceFile());
}

/**
 * The witness property is identified by its declaration in the canonical AdapterFactoryOutput
 * interface, never by any apparent property name a caller might also use.
 */
function canonicalWitnessDeclaration(
	program: ts.Program,
	checker: ts.TypeChecker,
	authoringPathKey: string,
): ts.Declaration | undefined {
	for (const sourceFile of program.getSourceFiles()) {
		if (pathKey(sourceFile.fileName) !== authoringPathKey) continue;
		const declaration = sourceFile.statements.find(
			(statement): statement is ts.InterfaceDeclaration =>
				ts.isInterfaceDeclaration(statement) && statement.name.text === "AdapterFactoryOutput",
		);
		if (declaration === undefined) return undefined;
		const symbol = checker.getSymbolAtLocation(declaration.name);
		if (symbol === undefined) return undefined;
		const properties = checker.getPropertiesOfType(checker.getDeclaredTypeOfSymbol(symbol));
		return properties[0]?.declarations?.[0];
	}
	return undefined;
}

function witnessPropertiesOf(type: ts.Type, checker: ts.TypeChecker, witness: ts.Declaration): ts.Symbol[] {
	return checker.getPropertiesOfType(type).filter(property =>
		(property.declarations ?? []).some(declaration => sameDeclaration(declaration, witness)),
	);
}

/**
 * The concrete ports a resolved factory output declares. A union of factory outputs contributes each
 * alternative; an output that carries no canonical witness is not assembly evidence at all, while an
 * any/unknown output is an unsupported assembly output rather than a guessed absence.
 */
function witnessPortsOf(
	returnType: ts.Type,
	checker: ts.TypeChecker,
	witness: ts.Declaration,
	call: ts.CallExpression,
): { readonly ports?: readonly ts.Type[]; readonly unsupported?: string } {
	if ((returnType.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0) {
		return { unsupported: "the factory's resolved return type is any/unknown, so its output contract is unknown." };
	}
	const alternatives = returnType.isUnion() ? returnType.types : [returnType];
	if (alternatives.length === 0) return {};
	const ports: ts.Type[] = [];
	let witnessed = 0;
	for (const alternative of alternatives) {
		if ((alternative.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0) {
			return { unsupported: "the factory's resolved return type includes any/unknown, so its output contract is unknown." };
		}
		const property = witnessPropertiesOf(alternative, checker, witness)[0];
		if (property === undefined) continue;
		witnessed += 1;
		const port = checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(property, call));
		if ((port.flags & UNSUPPORTED_TYPE_FLAGS) !== 0 || (port.flags & ts.TypeFlags.Never) !== 0) {
			return { unsupported: "the factory's AdapterFactoryOutput witness is not a concrete port type." };
		}
		if (checker.getPropertiesOfType(port).length === 0) {
			return { unsupported: "the factory's AdapterFactoryOutput witness has no readable port members." };
		}
		ports.push(port);
	}
	if (witnessed === 0) return {};
	if (witnessed !== alternatives.length) {
		return { unsupported: "only some of the factory's resolved output alternatives carry the canonical AdapterFactoryOutput witness." };
	}
	return { ports };
}

function collectCalls(
	program: ts.Program,
	checker: ts.TypeChecker,
	adapterDirKey: string,
	assemblyFiles: ReadonlySet<string>,
	witness: ts.Declaration | undefined,
): AssemblyCall[] {
	const calls: AssemblyCall[] = [];
	const visit = (node: ts.Node): void => {
		if (ts.isCallExpression(node)) {
			const signature = checker.getResolvedSignature(node);
			const declaration = signature?.getDeclaration();
			if (
				signature !== undefined &&
				declaration !== undefined &&
				fileInside(declaration.getSourceFile().fileName, adapterDirKey)
			) {
				if (witness === undefined) {
					calls.push({ call: node, unsupported: "the canonical AdapterFactoryOutput contract could not be read." });
				} else {
					const returnType = checker.getReturnTypeOfSignature(signature);
					const output = witnessPortsOf(returnType, checker, witness, node);
					if (output.unsupported !== undefined) calls.push({ call: node, unsupported: output.unsupported });
					else if (output.ports !== undefined) calls.push({ call: node, ports: output.ports });
				}
			}
		}
		ts.forEachChild(node, visit);
	};
	for (const sourceFile of program.getSourceFiles()) {
		if (assemblyFiles.has(pathKey(sourceFile.fileName))) visit(sourceFile);
	}
	calls.sort((left, right) => {
		const file = left.call.getSourceFile().fileName.localeCompare(right.call.getSourceFile().fileName);
		return file !== 0 ? file : left.call.getStart(left.call.getSourceFile()) - right.call.getStart(right.call.getSourceFile());
	});
	return calls;
}

/**
 * Reads the canonical output witness of every actual call in the selected extension files that
 * resolves into the selected adapter's source directory. Nothing else in the extension is treated as
 * assembly evidence, and no extension code is evaluated.
 */
export function analyzeAssemblyOutputs(
	program: ts.Program,
	checker: ts.TypeChecker,
	adapterDir: string,
	assemblyFiles: readonly string[],
	authoringPathKey: string,
): AssemblyAnalysis {
	const selected = new Set(assemblyFiles.map(pathKey));
	const witness = canonicalWitnessDeclaration(program, checker, authoringPathKey);
	const calls = collectCalls(program, checker, pathKey(adapterDir), selected, witness);
	return { files: assemblyFiles, calls };
}

function typeIncludesAbsent(checker: ts.TypeChecker, type: ts.Type, seen: Set<ts.Type> = new Set()): boolean {
	if (seen.has(type)) return false;
	seen.add(type);
	if ((type.flags & ABSENT_TYPE_FLAGS) !== 0) return true;
	if (type.isUnion()) return type.types.some(part => typeIncludesAbsent(checker, part, seen));
	if ((type.flags & ts.TypeFlags.TypeParameter) !== 0) {
		const constraint = checker.getBaseConstraintOfType(type);
		return constraint !== undefined && typeIncludesAbsent(checker, constraint, seen);
	}
	return false;
}

function isCallable(type: ts.Type, checker: ts.TypeChecker): boolean {
	if ((type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0) return false;
	if (checker.getSignaturesOfType(type, ts.SignatureKind.Call).length > 0) return true;
	if (type.isUnion()) return type.types.length > 0 && type.types.every(part => isCallable(part, checker));
	if (type.isIntersection()) return type.types.some(part => isCallable(part, checker));
	return false;
}

/** One member of one concrete port: callable is provided, absent/undefined/never is unavailable. */
function memberStatusOfType(type: ts.Type, optional: boolean, checker: ts.TypeChecker): AssemblyMemberStatus {
	if ((type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.TypeParameter)) !== 0) return "unresolved";
	const absent = optional || typeIncludesAbsent(checker, type);
	const concrete = checker.getNonNullableType(type);
	if ((concrete.flags & UNSUPPORTED_TYPE_FLAGS) !== 0) return "unresolved";
	if ((concrete.flags & ts.TypeFlags.Never) !== 0) return "unavailable";
	if (!isCallable(concrete, checker)) return "unresolved";
	return absent ? "conditional" : "provided";
}

function memberStatusOfPort(
	port: ts.Type,
	member: string,
	checker: ts.TypeChecker,
	location: ts.Node,
): AssemblyMemberStatus {
	if ((port.flags & UNSUPPORTED_TYPE_FLAGS) !== 0) return "unresolved";
	if (port.isUnion()) {
		const alternatives = port.types.filter(part => (part.flags & ts.TypeFlags.Never) === 0);
		return combineAssemblyStatuses(alternatives.map(part => memberStatusOfPort(part, member, checker, location)));
	}
	const symbol = checker.getPropertyOfType(port, member);
	if (symbol === undefined) return "unavailable";
	const type = checker.getTypeOfSymbolAtLocation(symbol, location);
	return memberStatusOfType(type, (symbol.flags & ts.SymbolFlags.Optional) !== 0, checker);
}

/** Different selected constructions that disagree make the member conditional, never provided. */
function combineAssemblyStatuses(statuses: readonly AssemblyMemberStatus[]): AssemblyMemberStatus {
	if (statuses.length === 0) return "unresolved";
	if (statuses.some(status => status === "unresolved")) return "unresolved";
	if (statuses.every(status => status === "provided")) return "provided";
	if (statuses.every(status => status === "unavailable")) return "unavailable";
	return "conditional";
}

/**
 * Evaluates one port member across every actual call of the selected assembly. A missing witness, an
 * unsupported output or a member whose concrete type cannot be read is unresolved: absence is never
 * guessed from an analysis the checker could not complete.
 */
export function evaluateAssemblyPortMember(
	analysis: AssemblyAnalysis,
	checker: ts.TypeChecker,
	member: string,
): AssemblyMemberEvaluation {
	if (analysis.calls.length === 0) {
		return {
			status: "unresolved",
			reason: "No call to the selected adapter's assembly factory carrying the canonical AdapterFactoryOutput witness was found in the selected extension sources.",
		};
	}
	for (const call of analysis.calls) {
		if (call.unsupported !== undefined || call.ports === undefined || call.ports.length === 0) {
			return {
				status: "unresolved",
				reason: `The selected adapter's assembly output cannot be analyzed: ${call.unsupported ?? "no concrete output port was read"}`,
				call: call.call,
			};
		}
	}
	const statuses: AssemblyMemberStatus[] = [];
	let implementation: ts.CallExpression | undefined;
	for (const call of analysis.calls) {
		for (const port of call.ports ?? []) {
			const status = memberStatusOfPort(port, member, checker, call.call);
			statuses.push(status);
			if (implementation === undefined && (status === "provided" || status === "conditional")) implementation = call.call;
		}
	}
	const status = combineAssemblyStatuses(statuses);
	if (status === "unresolved") {
		return {
			status,
			reason: `The selected assembly's concrete output does not establish whether "${member}" is supplied.`,
			call: implementation,
		};
	}
	if (status === "unavailable") {
		return {
			status,
			reason: `The selected assembly's concrete output does not supply "${member}".`,
			call: implementation,
		};
	}
	if (status === "conditional") {
		return {
			status,
			reason: `The selected assembly's concrete output supplies "${member}" only conditionally or differently across possible assemblies.`,
			call: implementation,
		};
	}
	return { status, call: implementation };
}
