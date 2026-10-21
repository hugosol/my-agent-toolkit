/**
 * Source-only demand analysis for one extension.
 *
 * The analyzer starts from the extension's own sources and reuses the authoring checker's canonical
 * symbol resolution and restricted static evaluator. It never imports, constructs, calls or
 * otherwise executes an extension, adapter or handler: definitions, the authored implementation
 * declaration and every framework interface use are recovered from the TypeScript program.
 *
 * The result is the set of framework-mediated obligations the extension can reach, not a claim
 * that every path runs. Conditions are not evaluated; both sides of a source branch contribute.
 * Available provider queries are optional facts of the harness contract, not requirements.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript-compiler";
import {
	INTEGRATION_EVENT_AXIS,
	planIntegration,
	type IntegrationCommand,
	type IntegrationEventKind,
	type IntegrationUsage,
} from "../../framework/behaviors/integration-plan";
import {
	analyzeAuthoringSources,
	type AuthoringSourceAnalysis,
	type AuthoredImplementationView,
	type AuthoredSubscriptionView,
	type StaticValue,
} from "../authoring/check";
import type {
	AnalysisOptions,
	DemandResult,
	IntegrationContract,
	IntegrationDiagnostic,
	Requirement,
	SourceLocation,
} from "./model";

const DEFINITION_ENTRY_RELATIVE = "framework/interface/index.ts";
const DEFINITION_FUNCTION = "defineExtension";
const MAX_FUNCTION_DEPTH = 12;
const MAX_CHAIN_LENGTH = 10;

/** The semantic identifiers this analyzer emits through the `framework:` contract family. */
const FRAMEWORK_SEMANTICS = {
	extensionLoading: "extension-loading",
	sessionFacts: "session-facts",
	turnUsage: "turn-usage",
	sessionLifecycle: "session-lifecycle",
	sessionObservations: "session-observations",
	storageCommit: "storage-commit",
	stateFollow: "state-follow",
	statePersistence: "state-persistence",
	marker: "marker",
	promptContribution: "prompt-contribution",
	sessionLifecycleEvents: "session-lifecycle-events",
	roundLifecycleEvents: "round-lifecycle-events",
	modelPrices: "model-prices",
	providerAccess: "provider-access",
	sessionObservationRead: "session-observation-read",
	sessionObservationSnapshot: "session-observation-snapshot",
	sessionRecordCommit: "session-record-commit",
} as const;

type DeliveryKind =
	| "session"
	| "round"
	| "turn"
	| "activity"
	| "context"
	| "input"
	| "commit"
	| "unobserved"
	| "command"
	| "action"
	| "initialization";

/** The semantic delivery family one event kind dispatches through. */
const DELIVERY_KIND_BY_EVENT: Readonly<Record<IntegrationEventKind, DeliveryKind>> = {
	session_start: "session",
	session_end: "session",
	session_facts: "session",
	round_start: "round",
	round_end: "round",
	session_activity: "activity",
	turn_start: "turn",
	turn_end: "turn",
	user_input: "input",
	session_context: "context",
	session_commit: "commit",
	session_unobserved: "unobserved",
};

/** The canonical public delivery types a deferred function parameter may name. */
const DELIVERY_KIND_BY_TYPE: Readonly<Partial<Record<string, DeliveryKind>>> = {
	SessionEventDelivery: "session",
	RoundDelivery: "round",
	TurnStartDelivery: "turn",
	TurnEndDelivery: "turn",
	SessionActivityDelivery: "activity",
	SessionContextDelivery: "context",
	UserInputDelivery: "input",
	SessionCommitDelivery: "commit",
	SessionUnobservedDelivery: "unobserved",
	CommandDelivery: "command",
	ActionDelivery: "action",
	InitializationDelivery: "initialization",
};

/** One source-level use of a framework member, before contracts are merged. */
interface UsageRole {
	/** The delivery family whose callback surface is being used, when the use sits on one. */
	readonly delivery?: DeliveryKind;
	/** The path entries after the extension identity. */
	readonly chain: readonly string[];
}

interface DefinitionCommandScan {
	readonly name: string;
	readonly control?: "toggle" | "directed" | "actions";
	readonly actions: readonly string[];
	readonly origin: SourceLocation;
}

interface DefinitionScan {
	id?: string;
	origin: SourceLocation;
	prompts: boolean;
	promptOrigin?: SourceLocation;
	marker: boolean;
	markerOrigin?: SourceLocation;
	commands: DefinitionCommandScan[];
	inheritanceFollow: boolean;
	statePersistence: boolean;
	stateOrigin?: SourceLocation;
}

interface SubscriptionEventScan {
	readonly kind: IntegrationEventKind;
	readonly scope?: "owner" | "session";
	readonly origin: SourceLocation;
}

/** The implementation structure across every assembly source in the extension directory. */
interface ImplementationScan {
	readonly views: readonly AuthoredImplementationView[];
	readonly subscriptions: AuthoredSubscriptionView[];
	readonly events: SubscriptionEventScan[];
	readonly unknownEvents: readonly { readonly kind: string; readonly origin: SourceLocation }[];
	initialize: boolean;
	cleanup: boolean;
}

interface PathBinding {
	readonly paths: readonly string[];
	readonly members?: ReadonlyMap<string, readonly string[]>;
	readonly spreadPaths?: readonly string[];
	readonly callable?: ts.FunctionLikeDeclaration;
}

type Bindings = Map<ts.Symbol, PathBinding>;

interface ContractDraft {
	readonly id: string;
	readonly kind: IntegrationContract["kind"];
	readonly member: string;
	readonly delivery?: string;
	requirement: Requirement;
	readonly origins: Map<string, SourceLocation>;
	readonly paths: string[][];
}

interface DemandCollector {
	readonly analysis: AuthoringSourceAnalysis;
	readonly root: string;
	readonly extensionDirectory: string;
	readonly extensionId: string;
	readonly contracts: Map<string, ContractDraft>;
	readonly diagnostics: Map<string, IntegrationDiagnostic>;
	readonly analyzedFunctions: Set<string>;
	/** Whether a Turn delivery's usage facts were actually read. */
	turnUsage: boolean;
}

/** One resolved extension source set. */
interface ExtensionSource {
	readonly directory?: string;
	readonly files: readonly string[];
	readonly label: string;
}

/**
 * Analyze one extension's possible framework dependencies without an adapter or discovery entry.
 * The extension argument accepts an extension id (`extensions/<id>`), a directory or a source file
 * inside the extension.
 */
export function analyzeDemand(options: AnalysisOptions): DemandResult {
	const root = path.resolve(options.root);
	const source = resolveExtensionSource(root, options.extension);
	const diagnostics: IntegrationDiagnostic[] = [];
	if (source.files.length === 0) {
		return {
			extension: source.label,
			files: [],
			contracts: [],
			diagnostics: [{
				code: "demand/source",
				file: relativePath(root, source.directory ?? path.resolve(root, options.extension)),
				line: 1,
				column: 1,
				message: `No TypeScript extension sources were found for "${options.extension}".`,
				suggestion: "Select an extension id, an existing extension directory, or a source file inside it.",
			}],
		};
	}

	let analysis: AuthoringSourceAnalysis;
	try {
		analysis = analyzeAuthoringSources({ root, files: source.files.map(file => relativePath(root, file)) });
	} catch (error) {
		return {
			extension: source.label,
			files: source.files.map(file => relativePath(root, file)),
			contracts: [],
			diagnostics: [{
				code: "demand/source",
				file: relativePath(root, source.directory ?? path.dirname(source.files[0])),
				line: 1,
				column: 1,
				message: `The extension source program could not be analyzed: ${error instanceof Error ? error.message : String(error)}`,
				suggestion: "Check the selected source path and its TypeScript imports.",
			}],
		};
	}

	for (const diagnostic of analysis.diagnostics) {
		diagnostics.push({
			code: `demand/${diagnostic.ruleId}`,
			file: diagnostic.file,
			line: diagnostic.line,
			column: diagnostic.column,
			message: diagnostic.message,
			suggestion: diagnostic.suggestion,
		});
	}

	const extensionDirectory = source.directory ?? path.dirname(source.files[0]);
	const definitions = findDefinitions(analysis, extensionDirectory, diagnostics);
	const definition: DefinitionScan | undefined = definitions[0];
	const extensionId = definition?.id ?? source.label;
	const implementation = collectImplementations(analysis);
	const collector: DemandCollector = {
		analysis,
		root,
		extensionDirectory,
		extensionId,
		contracts: new Map(),
		diagnostics: new Map(),
		analyzedFunctions: new Set(),
		turnUsage: false,
	};

	if (definition === undefined) {
		addDiagnostic(collector, {
			code: implementation.views.length === 0 ? "demand/authoring" : "demand/definition",
			file: relativePath(root, source.directory ?? source.files[0]),
			line: 1,
			column: 1,
			message:
				implementation.views.length === 0
					? "No canonical extension definition or authored implementation was found in the selected sources."
					: "No canonical extension definition was found, so prompt, marker, State and command declarations may be incomplete.",
			suggestion: "Select the extension directory containing its definition.ts and implementation sources.",
		});
	}

	if (definition !== undefined) {
		if (definition.id === undefined) {
			addDiagnostic(collector, {
				...definition.origin,
				code: "demand/definition",
				message: "The extension definition does not declare a static string id, so its contract identities cannot be stated.",
				suggestion: "Declare the definition id as a string literal resolvable without executing the module.",
			});
		}
		if (definitions.length > 1) {
			const ids = new Set(definitions.map(item => item.id ?? "<unresolved>"));
			if (ids.size > 1) {
				addDiagnostic(collector, {
					...definition.origin,
					code: "demand/definition",
					message: `Multiple extension definitions with different ids were found: ${[...ids].join(", ")}.`,
					suggestion: "Analyze one extension source path so its demand is not merged with another definition.",
				});
			}
		}
	}

	if (
		definition !== undefined &&
		implementation.views.length === 0 &&
		definition.commands.some(command => command.control === "directed" || command.control === "actions")
	) {
		addDiagnostic(collector, {
			...definition.origin,
			code: "demand/implementation",
			message: "The definition declares commands that require an injected implementation, but no canonical authored implementation was found.",
			suggestion: "Supply the implementation in the analyzed extension sources; command and delivery usage cannot be derived without it.",
		});
	}

	const events = implementation.events;
	const eventKinds = uniqueBy(events.map(event => event.kind), kind => kind);
	for (const unknown of implementation.unknownEvents) {
		addDiagnostic(collector, {
			...unknown.origin,
			code: "demand/event",
			message: `Subscription event "${unknown.kind}" is not a framework semantic event kind.`,
			suggestion: "Use an event key from the framework's SemanticEvent union.",
		});
	}

	const planCommands = planCommandsFor(definition, implementation, collector);
	const usage: IntegrationUsage = {
		events: eventKinds,
		prompts: definition?.prompts === true,
		marker: definition?.marker === true,
		initialize: implementation.initialize,
		cleanup: implementation.cleanup,
		commands: planCommands,
	};
	const plan = planIntegration(usage);

	const baselineOrigin = firstLocation(definition?.origin, implementationOrigin(implementation), sourceFileOrigin(analysis, source.files[0]));
	const eventOrigins = new Map<IntegrationEventKind, SourceLocation[]>();
	for (const event of events) pushToMap(eventOrigins, event.kind, event.origin);
	const roundSelectionOrigins = ([] as SourceLocation[]).concat(
		...(["round_start", "round_end", "turn_start", "turn_end", "session_activity", "session_context"] as const)
			.map(kind => eventOrigins.get(kind) ?? []),
	);
	const definitionPromptOrigin = definition?.promptOrigin;
	const definitionMarkerOrigin = definition?.markerOrigin;
	const declarationOrigins = (declaration: string): SourceLocation[] => {
		switch (declaration) {
			case "prompts": return definitionPromptOrigin === undefined ? baselineOrigin : [definitionPromptOrigin];
			case "marker": return definitionMarkerOrigin === undefined ? baselineOrigin : [definitionMarkerOrigin];
			case "initialize": return implementationSlotOrigins(collector.analysis, implementation, "initialize", baselineOrigin);
			case "cleanup": return implementationSlotOrigins(collector.analysis, implementation, "cleanup", baselineOrigin);
			case "commands": return planCommands.length > 0 ? planCommands.map(command => command.origin) : baselineOrigin;
			default: return baselineOrigin;
		}
	};

	for (const obligation of plan.port) {
		const origins: SourceLocation[] = [];
		const paths: string[][] = [];
		for (const reason of obligation.reasons) {
			if (reason.kind === "baseline") {
				origins.push(...baselineOrigin);
				paths.push(["binding:baseline", `port:${obligation.member}`]);
				continue;
			}
			if (reason.kind === "event") {
				const eventOriginsForKind = eventOrigins.get(reason.event) ?? baselineOrigin;
				origins.push(...eventOriginsForKind);
				const scope = events.find(event => event.kind === reason.event)?.scope;
				paths.push([
					scope === undefined ? "subscription" : `subscription:${scope}`,
					`event:${reason.event}`,
					`port:${obligation.member}`,
				]);
				continue;
			}
			if (reason.kind === "declaration") {
				const declaration = declarationOrigins(reason.declaration);
				origins.push(...declaration);
				paths.push([`definition:${reason.declaration}`, `port:${obligation.member}`]);
				continue;
			}
			origins.push(...roundSelectionOrigins);
			paths.push(["subscription", "round-machinery", `port:${obligation.member}`]);
		}
		addContract(collector, {
			id: `port:${obligation.member}`,
			requirement: obligation.requirement === "required" ? "required" : "optional",
			origins: origins.length > 0 ? origins : baselineOrigin,
			paths: paths.length > 0 ? paths : [["binding:baseline", `port:${obligation.member}`]],
		});
	}

	addFrameworkSemantics(collector, definition, implementation, events, baselineOrigin);
	analyzeImplementationUsage(collector, implementation);
	analyzeDeferredFrameworkFunctions(collector, extensionDirectory);
	mergeHandwrittenDiagnostics(collector, diagnostics);

	const contracts = [...collector.contracts.values()]
		.map(draft => finishContract(draft, extensionId))
		.sort(compareContracts);
	const allDiagnostics = [...collector.diagnostics.values()].sort(compareDiagnostics);
	return {
		extension: extensionId,
		files: analysis.files.slice().sort(compareStrings),
		contracts,
		diagnostics: allDiagnostics,
	};
}

// -------------------------------------------------------------------------------------------------
// Extension source discovery
// -------------------------------------------------------------------------------------------------

function resolveExtensionSource(root: string, requested: string): ExtensionSource {
	const label = requested.length === 0 ? "<empty>" : path.basename(requested.replace(/[\\/]+$/, ""));
	const candidate = path.isAbsolute(requested) ? path.normalize(requested) : path.resolve(root, requested);
	const extensionCandidate = path.isAbsolute(requested) ? candidate : path.resolve(root, "extensions", requested);
	const selected = existsSync(candidate) ? candidate : existsSync(extensionCandidate) ? extensionCandidate : undefined;
	if (selected === undefined) return { files: [], label };

	let stats;
	try {
		stats = statSync(selected);
	} catch {
		return { files: [], label };
	}
	if (stats.isDirectory()) {
		const files = collectSourceFiles(selected);
		return { directory: selected, files, label: path.basename(selected) };
	}
	if (!stats.isFile() || !isSourceFile(selected)) return { files: [], label };
	const directory = enclosingExtensionDirectory(root, selected);
	const files = directory === undefined ? [path.normalize(selected)] : collectSourceFiles(directory);
	return {
		...(directory === undefined ? {} : { directory }),
		files,
		label: directory === undefined ? path.basename(selected, path.extname(selected)) : path.basename(directory),
	};
}

function enclosingExtensionDirectory(root: string, file: string): string | undefined {
	let current = path.dirname(path.resolve(file));
	for (;;) {
		if (existsSync(path.join(current, "definition.ts")) || existsSync(path.join(current, "definition.tsx"))) return current;
		const parent = path.dirname(current);
		if (parent === current || !isInside(parent, root)) return undefined;
		const parentBase = path.basename(parent);
		if (parentBase === "extensions" || parentBase === "adapters") return current;
		current = parent;
	}
}

function collectSourceFiles(directory: string): string[] {
	const files: string[] = [];
	const visit = (current: string): void => {
		let entries;
		try {
			entries = readdirSync(current, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".cache") continue;
			const absolute = path.join(current, entry.name);
			if (entry.isDirectory()) visit(absolute);
			else if (entry.isFile() && isSourceFile(absolute)) files.push(path.normalize(absolute));
		}
	};
	visit(directory);
	return files.sort(compareStrings);
}

function isSourceFile(file: string): boolean {
	const lower = file.toLowerCase();
	return !lower.endsWith(".d.ts") && !lower.endsWith(".d.tsx") && (lower.endsWith(".ts") || lower.endsWith(".tsx"));
}

function isInside(child: string, parent: string): boolean {
	const relative = path.relative(parent, child);
	return relative.length === 0 || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

// -------------------------------------------------------------------------------------------------
// Definition and implementation recovery
// -------------------------------------------------------------------------------------------------

function findDefinitions(
	analysis: AuthoringSourceAnalysis,
	extensionDirectory: string,
	diagnostics: IntegrationDiagnostic[],
): DefinitionScan[] {
	const found: DefinitionScan[] = [];
	for (const sourceFile of analysis.program.getSourceFiles()) {
		if (sourceFile.isDeclarationFile || !isInside(path.resolve(sourceFile.fileName), extensionDirectory)) continue;
		walk(sourceFile, node => {
			if (!ts.isCallExpression(node)) return;
			if (!analysis.isCanonicalFunctionCall(node, DEFINITION_FUNCTION, DEFINITION_ENTRY_RELATIVE)) return;
			const definition = definitionFromCall(node, analysis, diagnostics);
			if (definition !== undefined) found.push(definition);
		});
	}
	return found.sort((left, right) => compareLocations(left.origin, right.origin));
}

function definitionFromCall(
	call: ts.CallExpression,
	analysis: AuthoringSourceAnalysis,
	diagnostics: IntegrationDiagnostic[],
): DefinitionScan | undefined {
	const argument = call.arguments[0];
	const origin = toLocation(analysis.location(call));
	if (!argument) {
		diagnostics.push({
			code: "demand/definition",
			file: origin.file,
			line: origin.line,
			column: origin.column,
			message: "defineExtension was called without a definition argument.",
			suggestion: "Pass one static definition object.",
		});
		return undefined;
	}
	const value = analysis.evaluate(argument);
	if (value.kind === "dynamic") {
		diagnostics.push({
			...toLocation(analysis.location(value.node)),
			code: "demand/definition",
			message: `The extension definition is not statically resolvable: ${value.reason}.`,
			suggestion: "Compose the definition from static literals, const references and supported definitions.",
		});
		return undefined;
	}
	if (value.kind !== "object") {
		diagnostics.push({
			...origin,
			code: "demand/definition",
			message: `The extension definition must resolve to a static object, found ${value.kind}.`,
			suggestion: "Declare the definition as a static object or a const reference to one.",
		});
		return undefined;
	}

	const idValue = value.properties.get("id")?.value;
	const id =
		idValue !== undefined && idValue.kind === "literal" && typeof idValue.value === "string"
			? idValue.value
			: undefined;
	const promptsProperty = value.properties.get("prompts");
	const markerProperty = value.properties.get("marker");
	const stateProperty = value.properties.get("state");
	const commandsProperty = value.properties.get("commands");

	for (const [name, property] of [["prompts", promptsProperty], ["marker", markerProperty]] as const) {
		const declared = property?.value;
		if (declared?.kind !== "dynamic") continue;
		diagnostics.push({
			...toLocation(analysis.location(property?.valueNode ?? declared.node)),
			code: "demand/definition",
			message: `Definition ${name} is not statically resolvable: ${declared.reason}.`,
			suggestion: `Declare ${name} from static literals or const references.`,
		});
	}

	const commands: DefinitionCommandScan[] = [];
	const commandsValue = commandsProperty?.value;
	if (commandsValue !== undefined && commandsValue.kind !== "absent") {
		if (commandsValue.kind === "dynamic") {
			diagnostics.push({
				...toLocation(analysis.location(commandsProperty?.valueNode ?? commandsValue.node)),
				code: "demand/definition",
				message: `Definition commands are not statically resolvable: ${commandsValue.reason}.`,
				suggestion: "Keep the command declarations in static literals or const references.",
			});
		} else if (commandsValue.kind !== "array") {
			diagnostics.push({
				...toLocation(analysis.location(commandsProperty?.valueNode ?? commandsValue.node)),
				code: "demand/definition",
				message: "Definition commands must resolve to a static array.",
				suggestion: "Declare commands as an array literal or a const array reference.",
			});
		} else {
			for (const item of commandsValue.items) {
				const command = definitionCommand(item, analysis, diagnostics);
				if (command !== undefined) commands.push(command);
			}
		}
	}

	let inheritanceFollow = false;
	let declaredPersistence: unknown;
	let stateOrigin: SourceLocation | undefined;
	const stateValue = stateProperty?.value;
	if (stateValue !== undefined && stateValue.kind === "object") {
		stateOrigin = toLocation(analysis.location(stateValue.node));
		const inheritanceValue = stateValue.properties.get("inheritance")?.value;
		if (inheritanceValue !== undefined && inheritanceValue.kind === "literal" && inheritanceValue.value === "follow") {
			inheritanceFollow = true;
		}
		const persistenceValue = stateValue.properties.get("persistence")?.value;
		if (persistenceValue !== undefined && persistenceValue.kind === "literal") {
			declaredPersistence = persistenceValue.value;
		}
	}
	// The framework's default persistence is `session-entry`: a declared State or a command that
	// writes it needs the adapter's persistence path unless the declaration explicitly chose memory.
	const writesState = commands.some(command => command.control === "toggle" || command.control === "directed");
	const statePersistence = declaredPersistence !== "memory" && (stateValue !== undefined || writesState);
	if (stateValue !== undefined && stateValue.kind === "dynamic") {
		diagnostics.push({
			...toLocation(analysis.location(stateProperty?.valueNode ?? stateValue.node)),
			code: "demand/definition",
			message: `The State declaration is not statically resolvable: ${stateValue.reason}.`,
			suggestion: "Declare State axes as static literals.",
		});
	}

	const promptsValue = promptsProperty?.value;
	return {
		...(id === undefined ? {} : { id }),
		origin,
		prompts: promptsValue !== undefined && promptsValue.kind !== "absent" && (promptsValue.kind !== "array" || promptsValue.items.length > 0),
		...(promptsProperty === undefined ? {} : { promptOrigin: toLocation(analysis.location(promptsProperty.valueNode)) }),
		marker: markerProperty !== undefined && markerProperty.value.kind !== "absent",
		...(markerProperty === undefined ? {} : { markerOrigin: toLocation(analysis.location(markerProperty.valueNode)) }),
		commands,
		inheritanceFollow,
		statePersistence,
		...(stateOrigin === undefined ? {} : { stateOrigin }),
	};
}

function definitionCommand(
	value: StaticValue,
	analysis: AuthoringSourceAnalysis,
	diagnostics: IntegrationDiagnostic[],
): DefinitionCommandScan | undefined {
	if (value.kind !== "object") {
		diagnostics.push({
			...toLocation(analysis.location(value.node)),
			code: "demand/definition",
			message: `A definition command must be a static object, found ${value.kind}.`,
			suggestion: "Declare each command as a static object.",
		});
		return undefined;
	}
	const nameValue = value.properties.get("name")?.value;
	const typeValue = value.properties.get("type")?.value;
	const name =
		nameValue !== undefined && nameValue.kind === "literal" && typeof nameValue.value === "string"
			? nameValue.value
			: undefined;
	const control =
		typeValue !== undefined && typeValue.kind === "literal" && typeof typeValue.value === "string"
			? typeValue.value
			: undefined;
	const origin = toLocation(analysis.location(value.node));
	if (name === undefined) {
		diagnostics.push({
			...origin,
			code: "demand/definition",
			message: "A definition command does not declare a static string name.",
			suggestion: "Declare the command name as a string literal.",
		});
		return undefined;
	}
	if (control !== undefined && control !== "toggle" && control !== "directed" && control !== "actions") {
		diagnostics.push({
			...origin,
			code: "demand/definition",
			message: `Command "${name}" declares unknown control kind "${control}".`,
			suggestion: "Use one of the framework's control kinds: toggle, directed or actions.",
		});
	}
	const actionsValue = value.properties.get("actions")?.value;
	const actions =
		actionsValue !== undefined && actionsValue.kind === "object"
			? [...actionsValue.properties.keys()]
			: [];
	return {
		name,
		...(control === "toggle" || control === "directed" || control === "actions" ? { control } : {}),
		actions,
		origin,
	};
}

function collectImplementations(analysis: AuthoringSourceAnalysis): ImplementationScan {
	const views = analysis.implementations;
	const subscriptions = views.flatMap(view => view.subscriptions);
	const events: SubscriptionEventScan[] = [];
	const unknownEvents: { kind: string; origin: SourceLocation }[] = [];
	for (const group of subscriptions) {
		for (const event of group.events) {
			if (isIntegrationEventKind(event.kind)) {
				events.push({ kind: event.kind, ...(group.scope === undefined ? {} : { scope: group.scope }), origin: event.origin });
			} else {
				unknownEvents.push({ kind: event.kind, origin: event.origin });
			}
		}
	}
	return {
		views,
		subscriptions,
		events,
		unknownEvents,
		initialize: views.some(view => view.initialize !== undefined),
		cleanup: views.some(view => view.cleanup !== undefined),
	};
}

function isIntegrationEventKind(value: string): value is IntegrationEventKind {
	return Object.prototype.hasOwnProperty.call(INTEGRATION_EVENT_AXIS, value);
}

function planCommandsFor(
	definition: DefinitionScan | undefined,
	implementation: ImplementationScan,
	collector: DemandCollector,
): (IntegrationCommand & { readonly origin: SourceLocation })[] {
	const commands = new Map<string, { name: string; control: "toggle" | "directed" | "actions"; origin: SourceLocation }>();
	for (const command of definition?.commands ?? []) {
		if (command.control === undefined) {
			addDiagnostic(collector, {
				...command.origin,
				code: "demand/command",
				message: `Command "${command.name}" has no statically known control kind.`,
				suggestion: "Declare the command's type as a static control kind.",
			});
			continue;
		}
		const existing = commands.get(command.name);
		if (existing !== undefined && existing.control !== command.control) {
			addDiagnostic(collector, {
				...command.origin,
				code: "demand/command",
				message: `Command "${command.name}" is declared with conflicting control kinds "${existing.control}" and "${command.control}".`,
				suggestion: "Declare each command name once.",
			});
			continue;
		}
		commands.set(command.name, { name: command.name, control: command.control, origin: command.origin });
	}
	if (definition === undefined) {
		for (const view of implementation.views) {
			for (const command of view.commands) {
				if (command.kind === undefined) continue;
				commands.set(command.name, { name: command.name, control: command.kind, origin: command.origin });
			}
		}
	}
	return [...commands.values()];
}

// -------------------------------------------------------------------------------------------------
// Framework semantic derivation
// -------------------------------------------------------------------------------------------------

function addFrameworkSemantics(
	collector: DemandCollector,
	definition: DefinitionScan | undefined,
	implementation: ImplementationScan,
	events: readonly SubscriptionEventScan[],
	baselineOrigin: readonly SourceLocation[],
): void {
	const add = (semantic: string, requirement: Requirement, origins: readonly SourceLocation[], chain: readonly string[]): void => {
		addContract(collector, {
			id: `framework:${semantic}`,
			requirement,
			origins: origins.length > 0 ? origins : baselineOrigin,
			paths: [[...chain, `framework:${semantic}`]],
		});
	};
	const sessionScope = implementation.subscriptions.some(group => group.scope === "session");
	const sessionScopeOrigins = implementation.subscriptions
		.filter(group => group.scope === "session")
		.map(group => group.origin);
	const stateOrigin = definition?.stateOrigin;
	const followOrigins = stateOrigin === undefined ? undefined : [stateOrigin];
	const eventOrigins = (kinds: readonly IntegrationEventKind[]): SourceLocation[] =>
		events.filter(event => kinds.includes(event.kind)).map(event => event.origin);
	const sessionLifecycleEvents = eventOrigins(["session_start", "session_end", "session_facts"]);
	const roundLifecycleEvents = eventOrigins(["round_start", "round_end"]);
	const observationEvents = eventOrigins(["session_activity", "session_context"]);
	const commitEvents = eventOrigins(["session_commit"]);

	if (sessionScope || definition?.inheritanceFollow === true) {
		add(
			FRAMEWORK_SEMANTICS.extensionLoading,
			"required",
			sessionScope ? sessionScopeOrigins : (followOrigins ?? baselineOrigin),
			[sessionScope ? "subscription:session" : "definition:state", "semantic:extension-loading"],
		);
		add(
			FRAMEWORK_SEMANTICS.sessionFacts,
			"required",
			sessionScope ? sessionScopeOrigins : (followOrigins ?? baselineOrigin),
			[sessionScope ? "subscription:session" : "definition:state", "semantic:session-facts"],
		);
	}
	if (definition?.inheritanceFollow === true) {
		add(FRAMEWORK_SEMANTICS.stateFollow, "required", followOrigins ?? baselineOrigin, ["definition:state", "semantic:state-follow"]);
	}
	if (definition?.statePersistence === true) {
		add(
			FRAMEWORK_SEMANTICS.statePersistence,
			"required",
			stateOrigin === undefined ? baselineOrigin : [stateOrigin],
			["definition:state", "semantic:state-persistence"],
		);
	}
	if (sessionLifecycleEvents.length > 0) {
		add(FRAMEWORK_SEMANTICS.sessionLifecycle, "required", sessionLifecycleEvents, ["subscription", "semantic:session-lifecycle"]);
		add(FRAMEWORK_SEMANTICS.sessionLifecycleEvents, "required", sessionLifecycleEvents, ["subscription", "semantic:session-lifecycle-events"]);
	}
	if (roundLifecycleEvents.length > 0) {
		add(FRAMEWORK_SEMANTICS.sessionLifecycle, "required", roundLifecycleEvents, ["subscription", "semantic:session-lifecycle"]);
		add(FRAMEWORK_SEMANTICS.roundLifecycleEvents, "required", roundLifecycleEvents, ["subscription", "semantic:round-lifecycle-events"]);
	}
	if (implementation.cleanup && sessionLifecycleEvents.length === 0 && roundLifecycleEvents.length === 0) {
		add(
			FRAMEWORK_SEMANTICS.sessionLifecycle,
			"required",
			implementationSlotOrigins(collector.analysis, implementation, "cleanup", baselineOrigin),
			["implementation:cleanup", "semantic:session-lifecycle"],
		);
	}
	if (observationEvents.length > 0) {
		add(FRAMEWORK_SEMANTICS.sessionObservations, "required", observationEvents, ["subscription", "semantic:session-observations"]);
	}
	if (commitEvents.length > 0) {
		add(FRAMEWORK_SEMANTICS.storageCommit, "required", commitEvents, ["subscription", "semantic:storage-commit"]);
	}
	const promptOrigin = definition?.promptOrigin;
	if (definition?.prompts === true) {
		add(FRAMEWORK_SEMANTICS.promptContribution, "required", promptOrigin === undefined ? baselineOrigin : [promptOrigin], ["definition:prompts", "semantic:prompt-contribution"]);
	}
	const markerOrigin = definition?.markerOrigin;
	if (definition?.marker === true) {
		add(FRAMEWORK_SEMANTICS.marker, "required", markerOrigin === undefined ? baselineOrigin : [markerOrigin], ["definition:marker", "semantic:marker"]);
	}
}

// -------------------------------------------------------------------------------------------------
// Function-body usage analysis
// -------------------------------------------------------------------------------------------------

function analyzeImplementationUsage(
	collector: DemandCollector,
	implementation: ImplementationScan,
): void {
	for (const view of implementation.views) {
		if (view.create !== undefined) {
			const bindings: Bindings = new Map();
			bindParameter(view.create, 0, { paths: ["context"] }, bindings, collector.analysis);
			analyzeFunction(collector, view.create, bindings, {
				chain: ["implementation", "create"],
			}, 0);
		}
		for (const group of view.subscriptions) {
			for (const event of group.events) {
				const handler = event.handler;
				if (handler === undefined || !isIntegrationEventKind(event.kind)) continue;
				const delivery = DELIVERY_KIND_BY_EVENT[event.kind];
				const bindings: Bindings = new Map();
				bindParameter(handler, 1, { paths: [`delivery:${delivery}`] }, bindings, collector.analysis);
				analyzeFunction(collector, handler, bindings, {
					delivery,
					chain: [
						group.scope === undefined ? "subscription" : `subscription:${group.scope}`,
						`event:${event.kind}`,
					],
				}, 0);
			}
		}
		for (const command of view.commands) {
			for (const handler of command.handlers) {
				const delivery: DeliveryKind = command.kind === "directed" ? "command" : "action";
				const parameterIndex = command.kind === "directed" ? 2 : 1;
				if (handler.node === undefined) continue;
				const bindings: Bindings = new Map();
				bindParameter(handler.node, parameterIndex, { paths: [`delivery:${delivery}`] }, bindings, collector.analysis);
				analyzeFunction(collector, handler.node, bindings, {
					delivery,
					chain: [
						"implementation",
						`command:${command.name}`,
						command.kind === "actions" ? `action:${handler.role}` : handler.role,
					],
				}, 0);
			}
		}
		if (view.initialize !== undefined) {
			const bindings: Bindings = new Map();
			bindParameter(view.initialize, 1, { paths: ["delivery:initialization"] }, bindings, collector.analysis);
			analyzeFunction(collector, view.initialize, bindings, {
				delivery: "initialization",
				chain: ["implementation", "initialize"],
			}, 0);
		}
	}
	if (collector.turnUsage) {
		const origins = implementation.events
			.filter(event => event.kind === "turn_start" || event.kind === "turn_end")
			.map(event => event.origin);
		addContract(collector, {
			id: `framework:${FRAMEWORK_SEMANTICS.turnUsage}`,
			requirement: "required",
			origins: origins.length > 0 ? origins : implementationOrigin(implementation),
			paths: [["subscription", "event:turn_end", "semantic:turn-usage"]],
		});
	}
}

/** Framework parameter types whose member use is meaningful even outside an authored handler. */
const DEFERRED_CONTEXT_TYPES: Readonly<Partial<Record<string, true>>> = {
	ImplementationContext: true,
	SessionObservationReader: true,
	SessionCapability: true,
	CatalogPriceSource: true,
	ProviderAccess: true,
};

/**
 * Analyze functions whose parameters name framework delivery/capability types but whose call site
 * is not reachable from the authored declaration — for example a command implementation returned
 * by a factory. The type is the provenance; the pass does not guess native behavior.
 */
function analyzeDeferredFrameworkFunctions(collector: DemandCollector, extensionDirectory: string): void {
	for (const sourceFile of collector.analysis.program.getSourceFiles()) {
		if (sourceFile.isDeclarationFile || !isInside(path.resolve(sourceFile.fileName), extensionDirectory)) continue;
		walk(sourceFile, node => {
			if (!isFunctionNode(node)) return;
			const role = deferredRole(collector, node);
			if (role !== undefined) analyzeFunction(collector, node, new Map(), role, 0);
		});
	}
}

function deferredRole(collector: DemandCollector, fn: ts.FunctionLikeDeclaration): UsageRole | undefined {
	const chain = ["deferred", `function:${functionName(fn)}`];
	for (const parameter of fn.parameters) {
		const name = frameworkTypeName(collector, collector.analysis.checker.getTypeAtLocation(parameter));
		if (name === undefined) continue;
		const delivery = DELIVERY_KIND_BY_TYPE[name];
		if (delivery !== undefined) return { delivery, chain };
		if (DEFERRED_CONTEXT_TYPES[name] === true) return { chain };
	}
	return undefined;
}

function analyzeFunction(
	collector: DemandCollector,
	fn: ts.FunctionLikeDeclaration,
	base: Bindings,
	role: UsageRole,
	depth: number,
): void {
	const parameterSignature = fn.parameters.map(parameter => {
		const symbol = symbolOfBindingName(collector.analysis, parameter.name);
		const binding = symbol === undefined ? undefined : base.get(symbol);
		return binding === undefined ? "" : JSON.stringify({
			paths: binding.paths,
			members: binding.members === undefined ? [] : [...binding.members.entries()].sort(([left], [right]) => compareStrings(left, right)),
			spread: binding.spreadPaths,
		});
	}).join(";");
	// Provenance chains explain a result; they must not make repeated recursive work appear new.
	const key = `${fn.getSourceFile().fileName}:${fn.pos}:${role.delivery ?? "shared"}:${parameterSignature}`;
	if (collector.analyzedFunctions.has(key)) return;
	if (depth > MAX_FUNCTION_DEPTH) {
		addDiagnostic(collector, {
			...toLocation(collector.analysis.location(fn)),
			code: "demand/analysis-bound",
			message: "Framework-use traversal exceeded its supported function depth; demand analysis is incomplete.",
			suggestion: "Make capability use locally explicit or simplify the helper chain; do not treat this result as complete.",
		});
		return;
	}
	collector.analyzedFunctions.add(key);

	const body = fn.body;
	if (body === undefined) return;
	visitUsageNode(collector, body, base, role, depth);
}

function visitUsageNode(
	collector: DemandCollector,
	node: ts.Node,
	bindings: Bindings,
	role: UsageRole,
	depth: number,
): void {
	if (isFunctionNode(node)) return;
	if (ts.isClassDeclaration(node) || ts.isClassExpression(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return;

	if (ts.isVariableDeclaration(node)) {
		bindVariableDeclaration(collector, node, bindings);
	} else if (ts.isPropertyDeclaration(node) || ts.isBindingElement(node)) {
		// Property declarations are handled when the object is used; binding elements are seeded by
		// their owning variable declaration.
	} else if (
		ts.isBinaryExpression(node) &&
		node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
		ts.isIdentifier(node.left)
	) {
		const right = pathsForExpression(collector, node.right, bindings);
		const symbol = collector.analysis.symbolAt(node.left);
		if (symbol !== undefined && right !== undefined) bindings.set(symbol, right);
	} else if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
		observeFrameworkUse(collector, node, bindings, role);
	} else if (ts.isCallExpression(node)) {
		observeFrameworkUse(collector, node.expression, bindings, role);
		const target = resolveCallTarget(collector, node.expression, bindings);
		if (target !== undefined && isRelevantFunction(collector, target)) {
			const parameterBindings = bindArguments(collector, target, node, bindings, role);
			const nextRole: UsageRole = {
				...role,
				chain: appendChain(role.chain, `call:${functionName(target)}`),
			};
			const merged: Bindings = new Map(bindings);
			for (const [symbol, binding] of parameterBindings) merged.set(symbol, binding);
			analyzeFunction(collector, target, merged, nextRole, depth + 1);
		}
	} else if (ts.isIdentifier(node)) {
		observeFrameworkUse(collector, node, bindings, role);
	}

	ts.forEachChild(node, child => {
		if (ts.isTypeNode(child) || ts.isImportDeclaration(child) || ts.isExportDeclaration(child)) return;
		if (isFunctionNode(child)) {
			analyzeFunction(
				collector,
				child,
				bindings,
				{ ...role, chain: appendChain(role.chain, `closure:${functionName(child)}`) },
				depth + 1,
			);
			return;
		}
		visitUsageNode(collector, child, bindings, role, depth);
	});
}

function bindVariableDeclaration(collector: DemandCollector, node: ts.VariableDeclaration, bindings: Bindings): void {
	if (node.initializer === undefined) return;
	const binding = pathsForExpression(collector, node.initializer, bindings);
	if (isFunctionNode(node.initializer)) {
		const symbol = symbolOfBindingName(collector.analysis, node.name);
		if (symbol !== undefined) {
			bindings.set(symbol, {
				paths: [],
				callable: node.initializer,
			});
		}
		return;
	}
	if (binding === undefined) return;
	bindPattern(collector.analysis, node.name, binding, bindings);
}

function bindPattern(
	analysis: AuthoringSourceAnalysis,
	name: ts.BindingName,
	binding: PathBinding,
	bindings: Bindings,
): void {
	if (ts.isIdentifier(name)) {
		const symbol = analysis.symbolAt(name);
		if (symbol !== undefined) bindings.set(symbol, binding);
		return;
	}
	if (!ts.isObjectBindingPattern(name)) return;
	for (const element of name.elements) {
		if (element.dotDotDotToken !== undefined) continue;
		const property = element.propertyName === undefined
			? element.name
			: element.propertyName;
		const key = analysis.propertyName(property);
		if (key === undefined) continue;
		const child = childBinding(binding, key);
		if (child !== undefined) bindPattern(analysis, element.name, child, bindings);
	}
}

function bindParameter(
	fn: ts.FunctionLikeDeclaration,
	index: number,
	binding: PathBinding,
	bindings: Bindings,
	analysis: AuthoringSourceAnalysis,
): void {
	const parameter = fn.parameters[index];
	if (!parameter) return;
	bindPattern(analysis, parameter.name, binding, bindings);
}

function bindArguments(
	collector: DemandCollector,
	target: ts.FunctionLikeDeclaration,
	call: ts.CallExpression,
	callerBindings: Bindings,
	role: UsageRole,
): Bindings {
	const bindings: Bindings = new Map();
	for (let index = 0; index < target.parameters.length; index += 1) {
		const parameter = target.parameters[index];
		const argument = call.arguments[index];
		if (!argument || ts.isSpreadElement(argument)) continue;
		if (isFunctionNode(argument)) continue;
		const binding =
			pathsForExpression(collector, argument, callerBindings) ??
			canonicalArgumentBinding(collector, argument, role);
		if (binding !== undefined) bindPattern(collector.analysis, parameter.name, binding, bindings);
	}
	return bindings;
}

/**
 * Bind an argument whose static alias map is empty but whose framework type is known. This is what
 * carries `delivery.feedback` or a retained capability into a shared helper without executing it.
 */
function canonicalArgumentBinding(
	collector: DemandCollector,
	argument: ts.Expression,
	role: UsageRole,
): PathBinding | undefined {
	const canonical = canonicalFrameworkPath(collector, argument);
	if (canonical === undefined) return undefined;
	if (canonical.startsWith("context.") || canonical.startsWith("session.") || canonical.startsWith("modelPrices") || canonical.startsWith("providerAccess")) {
		return { paths: [canonical] };
	}
	if (role.delivery === undefined) return undefined;
	const member = canonical.startsWith("deliveryBody.")
		? canonical.slice("deliveryBody.".length)
		: canonical;
	return { paths: [`delivery:${role.delivery}${member.length === 0 ? "" : `.${member}`}`] };
}

function resolveCallTarget(
	collector: DemandCollector,
	callee: ts.Expression,
	bindings: Bindings,
): ts.FunctionLikeDeclaration | undefined {
	const expression = unwrap(callee);
	const asFunction = isFunctionNode(expression) ? expression : undefined;
	if (asFunction !== undefined) return asFunction;
	const symbol = ts.isPropertyAccessExpression(expression)
		? collector.analysis.symbolAt(expression.name)
		: collector.analysis.symbolAt(expression);
	if (symbol !== undefined) {
		const binding = bindings.get(collector.analysis.resolveSymbol(symbol) ?? symbol);
		if (binding?.callable !== undefined) return binding.callable;
	}
	return collector.analysis.resolveFunction(expression);
}

function isRelevantFunction(collector: DemandCollector, fn: ts.FunctionLikeDeclaration): boolean {
	const sourceFile = fn.getSourceFile();
	if (!collector.analysis.isRepositoryFile(sourceFile)) return false;
	const relative = relativePath(collector.root, sourceFile.fileName);
	return !relative.startsWith("framework/") && !relative.startsWith("adapters/") && !relative.startsWith("node_modules/");
}

function functionName(fn: ts.FunctionLikeDeclaration): string {
	const name = "name" in fn ? fn.name : undefined;
	if (name !== undefined && (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name))) {
		return name.text;
	}
	const property = fn.parent;
	if (ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) return property.name.text;
	if (ts.isPropertyDeclaration(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) return property.name.text;
	return "<anonymous>";
}

function appendChain(chain: readonly string[], entry: string): readonly string[] {
	if (chain.length >= MAX_CHAIN_LENGTH || chain[chain.length - 1] === entry) return chain;
	return [...chain, entry];
}

// -------------------------------------------------------------------------------------------------
// Alias and capability path tracking
// -------------------------------------------------------------------------------------------------

function pathsForExpression(
	collector: DemandCollector,
	expression: ts.Expression,
	bindings: Bindings,
): PathBinding | undefined {
	const node = unwrap(expression);
	if (ts.isIdentifier(node)) {
		const symbol = collector.analysis.symbolAt(node);
		if (symbol === undefined) return undefined;
		return bindings.get(symbol);
	}
	if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
		const base = pathsForExpression(collector, node.expression, bindings);
		const member = ts.isPropertyAccessExpression(node) ? node.name.text : literalMemberName(collector, node.argumentExpression);
		if (base === undefined || member === undefined) return undefined;
		return childBinding(base, member);
	}
	if (ts.isObjectLiteralExpression(node)) {
		const members = new Map<string, readonly string[]>();
		const spreadPaths: string[] = [];
		for (const property of node.properties) {
			if (ts.isPropertyAssignment(property)) {
				const key = collector.analysis.propertyName(property.name);
				const value = pathsForExpression(collector, property.initializer, bindings);
				if (key !== undefined && value !== undefined) members.set(key, value.paths);
			} else if (ts.isShorthandPropertyAssignment(property)) {
				const value = pathsForExpression(collector, property.name, bindings);
				if (value !== undefined) members.set(property.name.text, value.paths);
			} else if (ts.isSpreadAssignment(property)) {
				const value = pathsForExpression(collector, property.expression, bindings);
				if (value !== undefined) {
					spreadPaths.push(...value.paths);
					if (value.members !== undefined) {
						for (const [key, paths] of value.members) members.set(key, paths);
					}
				}
			}
		}
		return { paths: [`object:${node.pos}`], members, ...(spreadPaths.length === 0 ? {} : { spreadPaths }) };
	}
	if (ts.isConditionalExpression(node)) {
		return mergeBindings(
			pathsForExpression(collector, node.whenTrue, bindings),
			pathsForExpression(collector, node.whenFalse, bindings),
		);
	}
	if (ts.isBinaryExpression(node)) {
		const kind = node.operatorToken.kind;
		if (
			kind === ts.SyntaxKind.QuestionQuestionToken ||
			kind === ts.SyntaxKind.BarBarToken ||
			kind === ts.SyntaxKind.AmpersandAmpersandToken
		) {
			return mergeBindings(
				pathsForExpression(collector, node.left, bindings),
				pathsForExpression(collector, node.right, bindings),
			);
		}
	}
	if (ts.isCallExpression(node)) {
		// A call result is not a tracked alias; the call's own capability use is recorded separately.
		return undefined;
	}
	return undefined;
}

function childBinding(binding: PathBinding, member: string): PathBinding | undefined {
	const explicit = binding.members?.get(member);
	if (explicit !== undefined) return { paths: explicit };
	const paths = binding.paths.map(current => `${current}.${member}`);
	if (binding.spreadPaths !== undefined) {
		paths.push(...binding.spreadPaths.map(current => `${current}.${member}`));
	}
	if (paths.length === 0) return undefined;
	if (binding.members !== undefined && explicit === undefined && binding.spreadPaths === undefined) return undefined;
	return { paths };
}

function mergeBindings(left: PathBinding | undefined, right: PathBinding | undefined): PathBinding | undefined {
	if (left === undefined) return right;
	if (right === undefined) return left;
	return { paths: [...left.paths, ...right.paths] };
}

function literalMemberName(collector: DemandCollector, expression: ts.Expression): string | undefined {
	const value = collector.analysis.evaluate(expression);
	return value.kind === "literal" && (typeof value.value === "string" || typeof value.value === "number")
		? String(value.value)
		: undefined;
}

function symbolOfBindingName(analysis: AuthoringSourceAnalysis, name: ts.BindingName): ts.Symbol | undefined {
	if (ts.isIdentifier(name)) return analysis.symbolAt(name);
	return undefined;
}

// -------------------------------------------------------------------------------------------------
// Capability use and contract mapping
// -------------------------------------------------------------------------------------------------

function isCapabilityContainer(value: string): boolean {
	return /^(?:context(?:\.session(?:\.observations)?)?|session(?:\.observations)?|feedback|capability(?:\.(?:state|feedback))?|state|closeOut|deliveryBody|delivery:[a-z]+(?:\.(?:feedback|state|capability|capability\.state|capability\.feedback|closeOut))?)$/.test(value);
}

function unsupportedContextMember(value: string): string | undefined {
	const separator = value.lastIndexOf(".");
	if (separator < 0) return undefined;
	const base = value.slice(0, separator);
	const member = value.slice(separator + 1);
	const allowed = base === "context" ? ["config", "session", "modelPrices", "providerAccess"]
		: base === "context.session" || base === "session" ? ["observations", "recordCommit"]
		: base === "context.session.observations" || base === "session.observations" ? ["read", "snapshot"]
		: undefined;
	return allowed !== undefined && !allowed.includes(member) ? value : undefined;
}

function observeFrameworkUse(
	collector: DemandCollector,
	expression: ts.Expression,
	bindings: Bindings,
	role: UsageRole,
): void {
	if (ts.isElementAccessExpression(expression) && literalMemberName(collector, expression.argumentExpression) === undefined) {
		const base = pathsForExpression(collector, expression.expression, bindings);
		const canonicalBase = canonicalFrameworkPath(collector, expression.expression);
		const bases = [...(base?.paths ?? []), ...(canonicalBase === undefined ? [] : [canonicalBase])];
		if (bases.some(isCapabilityContainer)) {
			addDiagnostic(collector, {
				...toLocation(collector.analysis.location(expression)),
				code: "demand/dynamic-capability-member",
				message: "A dynamic framework capability member cannot be resolved to an integration contract.",
				suggestion: "Use statically named capability members; ordinary dynamic business-data indexing remains allowed.",
			});
		}
	}
	const tracked = pathsForExpression(collector, expression, bindings);
	const capabilityPaths = [...(tracked?.paths ?? [])];
	const canonicalPath = canonicalFrameworkPath(collector, expression);
	if (canonicalPath !== undefined) capabilityPaths.push(canonicalPath);
	for (const capabilityPath of capabilityPaths) {
		const member = unsupportedContextMember(capabilityPath);
		if (member !== undefined) addDiagnostic(collector, {
			...toLocation(collector.analysis.location(expression)),
			code: "demand/unmapped-capability-member",
			message: `Framework member "${member}" has no dependency rule in the analyzer.`,
			suggestion: "Define the framework-owned dependency rule before treating this interface use as analyzed.",
		});
	}
	if (tracked !== undefined) {
		for (const path of tracked.paths) recordTrackedPath(collector, path, expression, role);
	}
	if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression) || ts.isIdentifier(expression)) {
		const canonical = canonicalFrameworkPath(collector, expression);
		if (canonical !== undefined) recordCanonicalPath(collector, canonical, expression, role);
	}
}

function recordTrackedPath(
	collector: DemandCollector,
	path: string,
	node: ts.Node,
	role: UsageRole,
): void {
	const origin = toLocation(collector.analysis.location(node));
	if (path.startsWith("context.session.observations.read")) {
		recordObservationRead(collector, FRAMEWORK_SEMANTICS.sessionObservationRead, origin, role, "context.session.observations.read");
		return;
	}
	if (path.startsWith("context.session.observations.snapshot")) {
		recordObservationRead(collector, FRAMEWORK_SEMANTICS.sessionObservationSnapshot, origin, role, "context.session.observations.snapshot");
		return;
	}
	if (path.startsWith("context.session.recordCommit")) {
		recordObservationCommit(collector, origin, role, "context.session.recordCommit");
		return;
	}
	if (path.startsWith("context.modelPrices")) {
		addFrameworkUse(collector, FRAMEWORK_SEMANTICS.modelPrices, "optional", origin, role, "context.modelPrices");
		addContract(collector, {
			id: "port:modelPrices",
			requirement: "optional",
			origins: [origin],
			paths: [[...role.chain, "context.modelPrices"]],
		});
		return;
	}
	if (path.startsWith("context.providerAccess")) {
		addFrameworkUse(collector, FRAMEWORK_SEMANTICS.providerAccess, "optional", origin, role, "context.providerAccess");
		addContract(collector, {
			id: "port:providerAccess",
			requirement: "optional",
			origins: [origin],
			paths: [[...role.chain, "context.providerAccess"]],
		});
		return;
	}
	if (path.startsWith("delivery:")) {
		recordDeliveryPath(collector, path, origin, role);
		return;
	}
	if (path.endsWith(".turn.usage") || path.endsWith(".end.usage") || path.endsWith(".usage")) {
		if (path.includes("turn")) {
			collector.turnUsage = true;
			addContract(collector, {
				id: `framework:${FRAMEWORK_SEMANTICS.turnUsage}`,
				requirement: "required",
				origins: [origin],
				paths: [[...role.chain, "turn.usage"]],
			});
		}
	}
}

function recordObservationRead(
	collector: DemandCollector,
	semantic: string,
	origin: SourceLocation,
	role: UsageRole,
	member: string,
): void {
	addFrameworkUse(collector, semantic, "optional", origin, role, member);
	addFrameworkUse(collector, FRAMEWORK_SEMANTICS.sessionObservations, "required", origin, role, member);
}

function recordObservationCommit(
	collector: DemandCollector,
	origin: SourceLocation,
	role: UsageRole,
	member: string,
): void {
	addFrameworkUse(collector, FRAMEWORK_SEMANTICS.sessionRecordCommit, "optional", origin, role, member);
	addFrameworkUse(collector, FRAMEWORK_SEMANTICS.storageCommit, "required", origin, role, member);
}

function recordDeliveryPath(
	collector: DemandCollector,
	path: string,
	origin: SourceLocation,
	role: UsageRole,
): void {
	const match = /^delivery:([a-z]+)\.(.+)$/.exec(path);
	if (match === null) return;
	const delivery = match[1] as DeliveryKind;
	const member = match[2] ?? "";
	if (member === "turn.usage" || member === "end.usage" || member === "turn.end.usage") {
		collector.turnUsage = true;
		addContract(collector, {
			id: `framework:${FRAMEWORK_SEMANTICS.turnUsage}`,
			requirement: "required",
			origins: [origin],
			paths: [[...role.chain, "turn.usage"]],
		});
		return;
	}
	if (member === "session") {
		addContract(collector, {
			id: `framework:${FRAMEWORK_SEMANTICS.sessionFacts}`,
			requirement: "required",
			origins: [origin],
			paths: [[...role.chain, "delivery.session"]],
		});
		return;
	}
	const optional = member === "closeOut.remaining" || member === "subagents" || member.startsWith("subagents.");
	if (optional) {
		if (member.startsWith("subagents")) {
			addContract(collector, {
				id: "delivery:initialization.subagents",
				requirement: "optional",
				origins: [origin],
				paths: [[...role.chain, "delivery:initialization.subagents"]],
			});
			addContract(collector, {
				id: "port:subagentIntegration",
				requirement: "optional",
				origins: [origin],
				paths: [[...role.chain, "port:subagentIntegration"]],
			});
		} else {
			addContract(collector, {
				id: "delivery:round.closeOut.remaining",
				requirement: "optional",
				origins: [origin],
				paths: [[...role.chain, "delivery:round.closeOut.remaining"]],
			});
		}
		return;
	}
	if (
		member === "feedback.notify" ||
		member === "capability.feedback.notify" ||
		member === "state.read" ||
		member === "state.write" ||
		member === "capability.state.read" ||
		member === "capability.state.write" ||
		member === "canAcceptInput" ||
		member === "provider"
	) {
		addContract(collector, {
			id: `delivery:${delivery}.${member}`,
			requirement: "required",
			origins: [origin],
			paths: [[...role.chain, `delivery:${delivery}.${member}`]],
		});
	}
}

function addFrameworkUse(
	collector: DemandCollector,
	semantic: string,
	requirement: Requirement,
	origin: SourceLocation,
	role: UsageRole,
	member: string,
): void {
	addContract(collector, {
		id: `framework:${semantic}`,
		requirement,
		origins: [origin],
		paths: [[...role.chain, member]],
	});
}

/**
 * Recover a canonical framework capability path from the expression's own framework types. This
 * catches capabilities retained in typed fields, where the simple alias map cannot follow a value
 * through a stored property; it still only counts actual member reads/calls.
 */
function canonicalFrameworkPath(
	collector: DemandCollector,
	expression: ts.Expression,
): string | undefined {
	const node = unwrap(expression);
	if (ts.isIdentifier(node)) return frameworkTypeRoot(collector, collector.analysis.checker.getTypeAtLocation(node));
	if (ts.isPropertyAccessExpression(node)) {
		const base = canonicalFrameworkPath(collector, node.expression);
		const member = node.name.text;
		if (base !== undefined) return `${base}.${member}`;
		const root = frameworkTypeRoot(collector, collector.analysis.checker.getTypeAtLocation(node.expression));
		return root === undefined ? undefined : `${root}.${member}`;
	}
	if (ts.isElementAccessExpression(node)) {
		const member = literalMemberName(collector, node.argumentExpression);
		if (member === undefined) return undefined;
		const base = canonicalFrameworkPath(collector, node.expression);
		return base === undefined ? undefined : `${base}.${member}`;
	}
	if (ts.isCallExpression(node)) {
		return frameworkTypeRoot(collector, collector.analysis.checker.getTypeAtLocation(node));
	}
	return undefined;
}

function frameworkTypeRoot(collector: DemandCollector, type: ts.Type): string | undefined {
	const name = frameworkTypeName(collector, type);
	if (name === undefined) return undefined;
	switch (name) {
		case "ImplementationContext": return "context";
		case "SessionCapability": return "session";
		case "SessionObservationReader": return "session.observations";
		case "FeedbackTransport": return "feedback";
		case "OwnerCapabilityHandle": return "capability";
		case "DeclaredValueSeam": return "state";
		case "CloseOutWait": return "closeOut";
		case "CatalogPriceSource": return "modelPrices";
		case "ProviderAccess": return "providerAccess";
		case "CanAcceptInput": return "canAcceptInput";
		case "SubagentIntegration": return "subagents";
		default:
			return name.endsWith("Delivery") ? "deliveryBody" : undefined;
	}
}

/** The declared framework-interface type name, when the type's provenance is that interface. */
function frameworkTypeName(collector: DemandCollector, type: ts.Type): string | undefined {
	const candidates = [type.aliasSymbol, type.getSymbol()].filter((symbol): symbol is ts.Symbol => symbol !== undefined);
	for (const symbol of candidates) {
		const declarations = symbol.declarations ?? [];
		if (declarations.some(declaration => isFrameworkInterfaceSource(collector.root, declaration.getSourceFile()))) {
			return symbol.name;
		}
	}
	return undefined;
}

function isFrameworkInterfaceSource(root: string, sourceFile: ts.SourceFile): boolean {
	const relative = relativePath(root, sourceFile.fileName);
	return relative.startsWith("framework/interface/") || relative === "framework/interface/index.ts";
}

function recordCanonicalPath(
	collector: DemandCollector,
	path: string,
	node: ts.Node,
	role: UsageRole,
): void {
	const origin = toLocation(collector.analysis.location(node));
	if (path.startsWith("context.session.observations.read")) {
		recordObservationRead(collector, FRAMEWORK_SEMANTICS.sessionObservationRead, origin, role, path);
		return;
	}
	if (path.startsWith("context.session.observations.snapshot")) {
		recordObservationRead(collector, FRAMEWORK_SEMANTICS.sessionObservationSnapshot, origin, role, path);
		return;
	}
	if (path === "context.session.recordCommit" || path === "session.recordCommit") {
		recordObservationCommit(collector, origin, role, path);
		return;
	}
	if (path.startsWith("session.observations.read")) {
		recordObservationRead(collector, FRAMEWORK_SEMANTICS.sessionObservationRead, origin, role, path);
		return;
	}
	if (path.startsWith("session.observations.snapshot")) {
		recordObservationRead(collector, FRAMEWORK_SEMANTICS.sessionObservationSnapshot, origin, role, path);
		return;
	}
	if (path.startsWith("context.modelPrices") || path.startsWith("modelPrices")) {
		addFrameworkUse(collector, FRAMEWORK_SEMANTICS.modelPrices, "optional", origin, role, path);
		addContract(collector, {
			id: "port:modelPrices",
			requirement: "optional",
			origins: [origin],
			paths: [[...role.chain, path]],
		});
		return;
	}
	if (path.startsWith("context.providerAccess") || path.startsWith("providerAccess")) {
		addFrameworkUse(collector, FRAMEWORK_SEMANTICS.providerAccess, "optional", origin, role, path);
		addContract(collector, {
			id: "port:providerAccess",
			requirement: "optional",
			origins: [origin],
			paths: [[...role.chain, path]],
		});
		return;
	}
	const member = path.startsWith("deliveryBody.")
		? path.slice("deliveryBody.".length)
		: path;
	if (role.delivery !== undefined) {
		recordDeliveryPath(collector, `delivery:${role.delivery}.${member}`, origin, role);
	}
}

// -------------------------------------------------------------------------------------------------
// Contracts and diagnostics
// -------------------------------------------------------------------------------------------------

function addContract(
	collector: DemandCollector,
	input: {
		readonly id: string;
		readonly requirement: Requirement;
		readonly origins: readonly SourceLocation[];
		readonly paths: readonly (readonly string[])[];
	},
): void {
	const descriptor = contractDescriptor(input.id);
	const existing = collector.contracts.get(input.id);
	const draft: ContractDraft = existing ?? {
		id: input.id,
		kind: descriptor.kind,
		member: descriptor.member,
		...(descriptor.delivery === undefined ? {} : { delivery: descriptor.delivery }),
		requirement: input.requirement,
		origins: new Map(),
		paths: [],
	};
	if (input.requirement === "required") draft.requirement = "required";
	for (const origin of input.origins) draft.origins.set(locationKey(origin), origin);
	for (const path of input.paths) {
		const prefixed = [`extension:${collector.extensionId}`, ...path];
		if (!draft.paths.some(existingPath => samePath(existingPath, prefixed))) draft.paths.push(prefixed);
	}
	collector.contracts.set(input.id, draft);
}

function contractDescriptor(id: string): Pick<IntegrationContract, "kind" | "member" | "delivery"> {
	const separator = id.indexOf(":");
	const family = separator < 0 ? id : id.slice(0, separator);
	const rest = separator < 0 ? "" : id.slice(separator + 1);
	if (family === "delivery") {
		const dot = rest.indexOf(".");
		return { kind: "delivery", delivery: dot < 0 ? rest : rest.slice(0, dot), member: dot < 0 ? rest : rest.slice(dot + 1) };
	}
	return { kind: family === "port" ? "port" : "framework", member: rest };
}

function finishContract(draft: ContractDraft, extensionId: string): IntegrationContract {
	const paths = draft.paths.slice().sort(comparePaths);
	return {
		id: draft.id,
		kind: draft.kind,
		member: draft.member,
		...(draft.delivery === undefined ? {} : { delivery: draft.delivery }),
		requirement: draft.requirement,
		origins: [...draft.origins.values()].sort(compareLocations),
		path: paths[0] ?? [`extension:${extensionId}`],
	};
}

function addDiagnostic(collector: DemandCollector, diagnostic: IntegrationDiagnostic): void {
	const key = [
		diagnostic.file,
		String(diagnostic.line),
		String(diagnostic.column),
		diagnostic.code,
		diagnostic.message,
	].join("\u0000");
	if (!collector.diagnostics.has(key)) collector.diagnostics.set(key, diagnostic);
}

function mergeHandwrittenDiagnostics(collector: DemandCollector, diagnostics: readonly IntegrationDiagnostic[]): void {
	for (const diagnostic of diagnostics) addDiagnostic(collector, diagnostic);
}

// -------------------------------------------------------------------------------------------------
// Small structural helpers
// -------------------------------------------------------------------------------------------------

function toLocation(location: { file: string; line: number; column: number }): SourceLocation {
	return { file: location.file, line: location.line, column: location.column };
}

function sourceFileOrigin(analysis: AuthoringSourceAnalysis, file: string | undefined): SourceLocation {
	if (file === undefined) return { file: ".", line: 1, column: 1 };
	const source = analysis.program.getSourceFile(file) ?? analysis.program.getSourceFiles().find(item => path.resolve(item.fileName) === path.resolve(file));
	const location = source === undefined ? undefined : analysis.location(source);
	return location === undefined ? { file: relativePath(analysis.root, file), line: 1, column: 1 } : toLocation(location);
}

function implementationOrigin(implementation: ImplementationScan): SourceLocation[] {
	return implementation.views.length === 0 ? [] : implementation.views.map(view => view.origin);
}

function implementationSlotOrigins(
	analysis: AuthoringSourceAnalysis,
	implementation: ImplementationScan,
	slot: "initialize" | "cleanup",
	fallback: readonly SourceLocation[],
): SourceLocation[] {
	const originList: SourceLocation[] = [];
	for (const view of implementation.views) {
		const handler = slot === "initialize" ? view.initialize : view.cleanup;
		if (handler !== undefined) originList.push(toLocation(analysis.location(handler)));
	}
	return originList.length === 0 ? [...fallback] : originList;
}

function isLocationList(value: SourceLocation | readonly SourceLocation[]): value is readonly SourceLocation[] {
	return Array.isArray(value);
}

function firstLocation(...locations: (SourceLocation | readonly SourceLocation[] | undefined)[]): SourceLocation[] {
	for (const location of locations) {
		if (location === undefined) continue;
		const values = isLocationList(location) ? location : [location];
		if (values.length > 0) return [...values];
	}
	return [{ file: ".", line: 1, column: 1 }];
}

function pushToMap<K, V>(map: Map<K, V[]>, key: K, value: V): void {
	const values = map.get(key);
	if (values === undefined) map.set(key, [value]);
	else values.push(value);
}

function uniqueBy<T>(items: readonly T[], key: (item: T) => string): T[] {
	const seen = new Set<string>();
	const result: T[] = [];
	for (const item of items) {
		const value = key(item);
		if (seen.has(value)) continue;
		seen.add(value);
		result.push(item);
	}
	return result;
}

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
	visit(node);
	ts.forEachChild(node, child => walk(child, visit));
}

function unwrap(expression: ts.Expression): ts.Expression {
	let current = expression;
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

function isFunctionNode(node: ts.Node): node is ts.FunctionLikeDeclaration {
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

function relativePath(root: string, file: string): string {
	const relative = path.relative(root, path.resolve(file));
	return relative.length === 0 ? "." : relative.replace(/\\/g, "/");
}

function locationKey(location: SourceLocation): string {
	return `${location.file}:${location.line}:${location.column}`;
}

function samePath(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function compareStrings(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

function compareLocations(left: SourceLocation, right: SourceLocation): number {
	return (
		compareStrings(left.file, right.file) ||
		left.line - right.line ||
		left.column - right.column
	);
}

function comparePaths(left: readonly string[], right: readonly string[]): number {
	if (left.length !== right.length) return left.length - right.length;
	for (let index = 0; index < left.length; index += 1) {
		const compared = compareStrings(left[index] ?? "", right[index] ?? "");
		if (compared !== 0) return compared;
	}
	return 0;
}

function compareContracts(left: IntegrationContract, right: IntegrationContract): number {
	return (
		compareStrings(left.id, right.id) ||
		(left.requirement === right.requirement ? 0 : left.requirement === "required" ? -1 : 1)
	);
}

function compareDiagnostics(left: IntegrationDiagnostic, right: IntegrationDiagnostic): number {
	return (
		compareLocations(left, right) ||
		compareStrings(left.code, right.code) ||
		compareStrings(left.message, right.message)
	);
}
