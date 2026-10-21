/**
 * The complete human-readable catalogue of the static authoring rules.
 *
 * The checker reports only a rule id, a source location, a concrete problem and a repair
 * suggestion. Maintainers (and an agent fixing a failing scan) can join that diagnostic back to
 * this catalogue to read why the rule exists, what is allowed, what is rejected and what the
 * impact of bypassing it is. Examples are illustrative fragments, not complete files.
 */

/** The stable identifiers the static authoring checker can report. */
export type AuthoringRuleId =
	| "authoring/entrypoint"
	| "authoring/static-structure"
	| "authoring/static-key"
	| "authoring/static-scope"
	| "authoring/handler"
	| "authoring/mutation"
	| "authoring/parse";

/** One rule's maintained explanation and repair guidance. */
export interface AuthoringRuleDefinition {
	readonly id: AuthoringRuleId;
	readonly title: string;
	readonly reason: string;
	readonly allowedExample: string;
	readonly disallowedExample: string;
	readonly suggestion: string;
	readonly impact: string;
}

/**
 * Every static authoring rule, in diagnostic severity order.
 *
 * The scan is a development-time gate over the static shape of an authored implementation. It is
 * not a semantic or behavioural compatibility certificate: a passing scan means these source
 * constraints hold, and nothing more.
 */
export const AUTHORING_RULES = [
	{
		id: "authoring/entrypoint",
		title: "Author implementations through the framework's defineImplementation entry",
		reason:
			"An implementation declaration is only inspectable when it is produced by the canonical " +
			"framework authoring entry. The entry is identified by the symbol it resolves to, not by " +
			"the spelling of the call: a local function, a helper from another module or a same-named " +
			"export is not the framework contract and its argument would not be materialized by the " +
			"framework. Treating a false helper as the entry would both miss the real declaration and " +
			"invent obligations the extension does not have.",
		allowedExample: [
			'import { defineImplementation } from "../../framework/interface";',
			"",
			"export const implementation = defineImplementation({",
			"\tcreate: () => ({ ready: true }),",
			"});",
		].join("\n"),
		disallowedExample: [
			"// A local function with the same name is not the framework entry.",
			"function defineImplementation(declaration) {",
			"\treturn declaration;",
			"}",
			"",
			"export const implementation = defineImplementation({ create: () => ({}) });",
		].join("\n"),
		suggestion:
			'Import `defineImplementation` from "framework/interface" (or its canonical details module) ' +
			"and pass the declaration to that symbol. Rename an unrelated same-named helper so the " +
			"authoring entry is unambiguous.",
		impact:
			"The declaration is not recognized as an authored implementation. Static structure is not " +
			"checked, and the scan fails instead of silently accepting an entry the framework does not own.",
	},
	{
		id: "authoring/static-structure",
		title: "Keep the authored declaration statically resolvable",
		reason:
			"Inspection must work without executing configuration, extension code or business state " +
			"creation. Object and array literals, const/import references, `as`/`satisfies`/parentheses " +
			"and spreads whose source is itself a static object or array are resolvable ahead of time. " +
			"Conditional structure, calls that build the declaration, mutable references, cyclic " +
			"references and dynamic spreads are not: accepting them would require evaluating code or " +
			"guessing which branch runs. Shared wrappers use simple parameters and one unconditional " +
			"final return. Passing declaration-backed objects or arrays into opaque helpers also " +
			"leaves their structure unresolved because the helper could mutate them.",
		allowedExample: [
			"const baseEvents = { turn_start: handleTurnStart };",
			"const extraGroups = [];",
			"",
			"export const implementation = defineImplementation({",
			"\tcreate,",
			"\tsubscriptions: [",
			"\t\t{ scope: \"owner\", events: { ...baseEvents } },",
			"\t\t...extraGroups,",
			"\t],",
			"} satisfies Declaration);",
		].join("\n"),
		disallowedExample: [
			"const groups = makeGroupsAtRuntime();",
			"",
			"defineImplementation({",
			"\tcreate,",
			"\tsubscriptions: [",
			"\t\t...(enabled ? ownerGroups : sessionGroups),",
			"\t\t...groups,",
			"\t],",
			"});",
		].join("\n"),
		suggestion:
			"Write the declaration and every part that determines its structure as static literals. " +
			"Resolve spreads to const objects/arrays first; replace conditional or computed structure " +
			"with separate static declarations, and remove cycles between referenced declarations.",
		impact:
			"The framework and checker cannot determine the declared subscriptions, commands or " +
			"lifecycle entries. A dynamic shape is reported, never treated as an empty or passing " +
			"declaration, so runtime behaviour cannot rely on the scan having missed it.",
	},
	{
		id: "authoring/static-key",
		title: "Use statically known event and command keys",
		reason:
			"Subscriptions are selected by semantic event key and commands are matched by declared " +
			"command name. The checker must read those keys from the declaration itself. A computed " +
			"key that resolves to a string/number literal through a const or import is known; a key " +
			"built by a call, a loop or an unknown variable is not, so its obligations cannot be " +
			"attributed.",
		allowedExample: [
			'const KEY = "turn_start" as const;',
			"",
			"defineImplementation({",
			"\tcreate,",
			"\tsubscriptions: [{",
			'\t\tscope: "session",',
			"\t\tevents: { [KEY]: (state, delivery) => state.observe(delivery) },",
			"\t}],",
			"\tcommands: { budget: { detail: (state, delivery) => state.detail(delivery) } },",
			"});",
		].join("\n"),
		disallowedExample: [
			"const key = eventNameFromHost();",
			"",
			"defineImplementation({",
			"\tcreate,",
			'\tsubscriptions: [{ scope: "session", events: { [key]: handler } }],',
			"});",
		].join("\n"),
		suggestion:
			"Use an identifier, string literal or imported/const literal key. Do not compute event or " +
			"command names from calls, conditions or runtime data in the declaration.",
		impact:
			"The declared event or command is not statically attributable. The scan reports the key " +
			"instead of silently omitting the subscription or command from the inspection result.",
	},
	{
		id: "authoring/static-scope",
		title: "Declare a literal observation scope",
		reason:
			"An observation scope decides which sessions a subscription group watches and therefore " +
			"which framework integrations the extension requires. The framework accepts exactly the " +
			"literal values `owner` and `session`. A dynamically computed scope, a missing scope or a " +
			"string outside that vocabulary cannot be interpreted without running or approximating code.",
		allowedExample: [
			"defineImplementation({",
			"\tcreate,",
			'\tsubscriptions: [{ scope: "owner", events: { session_end: handleEnd } }],',
			"});",
		].join("\n"),
		disallowedExample: [
			"const scope = scopeFromConfig();",
			"",
			"defineImplementation({",
			"\tcreate,",
			"\tsubscriptions: [{ scope, events: { session_end: handleEnd } }],",
			"});",
		].join("\n"),
		suggestion:
			'Write `scope: "owner"` or `scope: "session"` literally in the subscription group. If the ' +
			"extension needs both views, declare two static groups instead of choosing at runtime.",
		impact:
			"The binding obligations for the group cannot be established. The scan fails rather than " +
			"assuming a scope, and the framework cannot materialize an invalid runtime scope either.",
	},
	{
		id: "authoring/handler",
		title: "Reference statically resolvable functions for every handler",
		reason:
			"Create, subscription handlers, command actions, the catalog selector and lifecycle entries " +
			"must all be functions the declaration names before business state exists. Function " +
			"declarations, arrows/function expressions and const/import references to them qualify; a " +
			"call result, an object, a literal or an unresolved identifier does not. Handler bodies are " +
			"deliberately not inspected: business logic may do anything statically expressible in " +
			"TypeScript once the declaration selected the function.",
		allowedExample: [
			"function handleTurn(state, delivery) {",
			"\tfor (const part of delivery.content) state.accept(part);",
			"}",
			"",
			"defineImplementation({",
			"\tcreate: () => ({ accepted: [] }),",
			'\tsubscriptions: [{ scope: "session", events: { turn_end: handleTurn } }],',
			"\tinitialize: initializeExtension,",
			"\tcleanup: (state) => state.close(),",
			"});",
		].join("\n"),
		disallowedExample: [
			"const handler = makeHandler();",
			"",
			"defineImplementation({",
			"\tcreate: () => ({}),",
			'\tsubscriptions: [{ scope: "session", events: { turn_end: handler } }],',
			"});",
		].join("\n"),
		suggestion:
			"Pass a function declaration, arrow/function expression or a const/import binding of one. " +
			"Keep handler identity statically visible; put lazy business setup in create and delegate " +
			"from an explicit handler using its state. Do not merely move a handler-producing call " +
			"to another variable: its value remains dynamic. Preserve setup timing and cleanup.",
		impact:
			"The named slot is not statically callable. The scan reports that slot instead of treating " +
			"it as absent, so a dynamic handler cannot silently look like an unimplemented one.",
	},
	{
		id: "authoring/mutation",
		title: "Do not mutate an authored declaration or the structures it references",
		reason:
			"The authored declaration is the single static source of an extension's subscriptions, " +
			"commands and lifecycle obligations. Mutating the declaration, its `declaration` view or a " +
			"const/import structure used inside it makes the structure time-dependent: a later scan, " +
			"binding or inspection can see different content. Building an array with `push` before " +
			"passing it is the same problem in a pre-declaration form, so mutation of referenced " +
			"structures is rejected wherever it occurs; mutation of business state inside handler " +
			"bodies is unrelated and not inspected.",
		allowedExample: [
			"const groups = [{ scope: \"owner\", events: { turn_end: handleTurn } }];",
			"",
			"defineImplementation({ create, subscriptions: groups });",
			"// Handler bodies may freely mutate the business state they receive.",
		].join("\n"),
		disallowedExample: [
			"const groups = [];",
			'groups.push({ scope: "owner", events: { turn_end: handleTurn } });',
			"const implementation = defineImplementation({ create, subscriptions: groups });",
			"",
			"implementation.declaration.subscriptions.length = 0;",
		].join("\n"),
		suggestion:
			"Build declaration structures once, inline or as const literals with static spreads, and " +
			"never assign, delete or call mutating array/object methods on a declaration, its " +
			"`declaration` member or any structure referenced by it.",
		impact:
			"Static inspection and runtime binding can disagree about what the extension declared. The " +
			"scan fails on the mutation site rather than accepting whichever shape happened to exist " +
			"when it was inspected.",
	},
	{
		id: "authoring/parse",
		title: "Keep authoring source syntactically analyzable",
		reason:
			"The authoring checker reads the TypeScript syntax tree without executing the module. If a " +
			"selected file does not parse, no reliable declaration structure exists for that file: " +
			"reporting success would silently skip whatever the parser could not represent.",
		allowedExample: [
			"export const implementation = defineImplementation({",
			"\tcreate: () => ({ ready: true }),",
			"});",
		].join("\n"),
		disallowedExample: [
			"export const implementation = defineImplementation({",
			"\tcreate: () => ({ ready: true }),",
			"// missing closing braces and parenthesis",
		].join("\n"),
		suggestion:
			"Fix the syntax error at the reported location, then rerun the authoring scan. Do not " +
			"exclude the file to make the scan pass while the source remains unparsable.",
		impact:
			"The file's declarations cannot be inspected and are not counted. The scan fails instead " +
			"of silently treating the unparsable source as having no authored implementation.",
	},
] as const satisfies readonly AuthoringRuleDefinition[];
