import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkAuthoring, type AuthoringCheckResult } from "../../scripts/authoring/check";
import type { AuthoringRuleId } from "../../scripts/authoring/rules";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
	}
});

/**
 * One disposable repository-like project per test. The framework side is deliberately minimal:
 * the checker must recognise the canonical `defineImplementation` by symbol and module path, not by
 * inspecting framework implementation code or running it.
 */
function fixtureRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "authoring-static-"));
	roots.push(root);
	write(root, "framework/interface/details/implementation.ts", [
		"export function defineImplementation<State>(declaration: unknown): unknown { return declaration; }",
		"",
	].join("\n"));
	write(root, "framework/interface/index.ts", 'export { defineImplementation } from "./details/implementation";\n');
	return root;
}

function write(root: string, relative: string, source: string): void {
	const file = join(root, relative);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, source, "utf8");
}

function lineOf(source: string, needle: string): number {
	const index = source.indexOf(needle);
	if (index < 0) throw new Error(`Fixture does not contain ${JSON.stringify(needle)}`);
	return source.slice(0, index).split("\n").length;
}

function expectClean(result: AuthoringCheckResult): void {
	expect(result.diagnostics).toEqual([]);
	expect(result.declarationsChecked).toBeGreaterThanOrEqual(1);
}

function expectDiagnostic(
	result: AuthoringCheckResult,
	ruleId: AuthoringRuleId,
	file: string,
	line: number,
): void {
	const diagnostic = result.diagnostics.find(
		candidate => candidate.ruleId === ruleId && candidate.file === file && candidate.line === line,
	);
	expect(diagnostic).toBeDefined();
	if (diagnostic === undefined) throw new Error("unreachable");
	expect(diagnostic.file).toBe(file);
	expect(diagnostic.ruleId).toBe(ruleId);
	expect(diagnostic.line).toBe(line);
	expect(diagnostic.column).toBeGreaterThanOrEqual(1);
	expect(typeof diagnostic.message).toBe("string");
	expect(diagnostic.message.trim().length).toBeGreaterThan(0);
	expect(typeof diagnostic.suggestion).toBe("string");
	expect(diagnostic.suggestion.trim().length).toBeGreaterThan(0);
}

describe("static authoring checker", () => {
	test("accepts a literal implementation declaration with unrestricted handler bodies", () => {
		const root = fixtureRoot();
		const source = `import { defineImplementation } from "../../../framework/interface";

interface State { count: number }

export const implementation = defineImplementation<State>({
	create: (): State => ({ count: 0 }),
	subscriptions: [
		{
			scope: "session",
			events: {
				turn_start: (state: State) => {
					for (let index = 0; index < 3; index++) state.count += 1;
				},
				round_end: (state: State) => {
					const local = { count: state.count };
					local.count *= 2;
					state.count = local.count;
				},
			},
		},
	],
	commands: {
		budget: {
			detail: (state: State) => {
				state.count += 1;
			},
		},
	},
	initialize: (state: State) => {
		state.count += 1;
	},
	cleanup: (state: State) => {
		state.count -= 1;
	},
});
`;
		write(root, "extensions/literal/details/implementation.ts", source);

		const result = checkAuthoring({ root });

		expectClean(result);
		expect(result.declarationsChecked).toBe(1);
		expect(result.filesChecked).toBeGreaterThanOrEqual(1);
	});

	test("accepts a canonical declaration authored inside an assembly function", () => {
		const root = fixtureRoot();
		write(root, "extensions/assembly/details/implementation.ts", `import { defineImplementation } from "../../../framework/interface";

interface Panel {
	close(): void;
}

export function assembly(): unknown {
	const implementation = defineImplementation<Panel>({
		create: () => ({ close: (): void => undefined }),
		subscriptions: [{
			scope: "owner",
			events: { session_end: (panel: Panel) => panel.close() },
		}],
	});
	return implementation;
}
`);

		const result = checkAuthoring({ root });

		expectClean(result);
		expect(result.declarationsChecked).toBe(1);
	});

	test("resolves alias, namespace and re-export chains to the canonical entry", () => {
		const root = fixtureRoot();
		write(root, "extensions/aliased/details/implementation.ts", `import { defineImplementation as declare } from "../../../framework/interface";

export const implementation = declare({
	create: () => ({}),
	subscriptions: [{ scope: "session", events: { turn_start: (): void => undefined } }],
});
`);
		write(root, "extensions/namespaced/details/implementation.ts", `import * as authoring from "../../../framework/interface";

export const implementation = authoring.defineImplementation({
	create: () => ({}),
	commands: { budget: { detail: (): void => undefined } },
});
`);
		write(root, "extensions/reexported/authoring.ts", 'export { defineImplementation as makeImplementation } from "../../framework/interface";\n');
		write(root, "extensions/reexported/details/implementation.ts", `import { makeImplementation } from "../authoring";

export const implementation = makeImplementation({
	create: () => ({}),
	subscriptions: [{ scope: "owner", events: { session_end: (): void => undefined } }],
});
`);

		const result = checkAuthoring({ root });

		expectClean(result);
		expect(result.declarationsChecked).toBe(3);
	});

	test("accepts imported consts, static spreads, as const, satisfies and parentheses", () => {
		const root = fixtureRoot();
		write(root, "extensions/static-refs/events.ts", `export const turnHandler = (state: { hits: string[] }): void => {
	state.hits.push("turn");
};

export const sessionEvents = {
	turn_start: turnHandler,
} as const;
`);
		write(root, "extensions/static-refs/details/implementation.ts", `import { defineImplementation } from "../../../framework/interface";
import { sessionEvents, turnHandler } from "../events";

interface State { readonly hits: string[] }

const createState = (): State => ({ hits: [] });
const roundEndKey = "round_end" as const;
const subscription = {
	scope: "session",
	events: { ...sessionEvents, [roundEndKey]: turnHandler },
} as const;
const shared = { subscriptions: [subscription] } as const;
const base = { create: createState } as const;
const declaration = ({ ...base, ...shared }) as const;

export const implementation = defineImplementation<State>(declaration satisfies {
	create: () => State;
	subscriptions: readonly { scope: "session"; events: Record<string, unknown> }[];
});
`);

		const result = checkAuthoring({ root });

		expectClean(result);
		expect(result.declarationsChecked).toBe(1);
	});

	test("accepts a model-cost-style wrapper with bound subscriptions and lifecycle fallbacks", () => {
		const root = fixtureRoot();
		write(root, "extensions/wrapped/shared-logic/runtime.ts", `import { defineImplementation } from "../../../framework/interface";

interface State {
	initialize(delivery: unknown): Promise<void>;
	cleanup(): void;
}

interface Options {
	readonly initialize?: (state: State, delivery: unknown) => void | Promise<void>;
	readonly cleanup?: (state: State) => void | Promise<void>;
	readonly subscriptions?: readonly unknown[];
}

export function wrappedImplementation(
	create: () => State,
	options: Options = {},
) {
	return defineImplementation<State>({
		create,
		subscriptions: [
			{ scope: "session", events: { turn_start: (state: State) => { void state.cleanup(); } } },
			...(options.subscriptions ?? []),
		],
		commands: {
			budget: {
				detail: (state: State) => { void state.cleanup(); },
			},
		},
		catalog: (state: State) => ({ price: () => state.cleanup() }),
		initialize: options.initialize ?? (async (state: State, delivery: unknown) => {
			await state.initialize(delivery);
		}),
		cleanup: options.cleanup ?? ((state: State) => {
			state.cleanup();
		}),
	});
}
`);
		write(root, "extensions/wrapped/harness/omp.ts", `import { wrappedImplementation } from "../shared-logic/runtime";

const createState = () => ({
	initialize: async (_delivery: unknown): Promise<void> => undefined,
	cleanup: (): void => undefined,
});

export const implementation = wrappedImplementation(createState, {
	subscriptions: [{ scope: "session", events: { turn_end: (): void => undefined } }],
});
`);
		write(root, "extensions/wrapped/harness/pi.ts", `import { wrappedImplementation } from "../shared-logic/runtime";

export const implementation = wrappedImplementation(
	() => ({ initialize: async (): Promise<void> => undefined, cleanup: (): void => undefined }),
);
`);

		const result = checkAuthoring({ root });

		expectClean(result);
	});

	test("rejects wrapper control flow instead of selecting one return branch", () => {
		const root = fixtureRoot();
		write(root, "extensions/conditional-wrapper/implementation.ts", `import { defineImplementation } from "../../framework/interface";
function wrapped(create: () => unknown, enabled: boolean) {
  if (enabled) return defineImplementation({ create, subscriptions: [{ scope: "owner", events: {} }] });
  return defineImplementation({ create, subscriptions: [{ scope: "session", events: {} }] });
}
export const implementation = wrapped(() => ({}), true);
`);
		const result = checkAuthoring({ root });
		expect(result.diagnostics.some(item => item.ruleId === "authoring/static-structure")).toBe(true);
	});

	test("rejects a dynamic wrapper argument instead of silently passing", () => {
		const root = fixtureRoot();
		write(root, "extensions/dynamic-wrapper/shared.ts", `import { defineImplementation } from "../../framework/interface";

interface Options { readonly subscriptions?: readonly unknown[] }

export function wrapped(create: () => unknown, options: Options = {}) {
	return defineImplementation({
		create,
		subscriptions: [
			{ scope: "session", events: { turn_start: (): void => undefined } },
			...(options.subscriptions ?? []),
		],
	});
}
`);
		const source = `import { wrapped } from "../shared";

function optionsFor(): { subscriptions: [] } {
	return { subscriptions: [] };
}

export const implementation = wrapped(() => ({}), optionsFor());
`;
		write(root, "extensions/dynamic-wrapper/details/implementation.ts", source);

		const result = checkAuthoring({ root });

		expectDiagnostic(
			result,
			"authoring/static-structure",
			"extensions/dynamic-wrapper/details/implementation.ts",
			lineOf(source, "wrapped(() => ({}), optionsFor())"),
		);
	});

	test("rejects dynamic and invalid subscription scopes", () => {
		const root = fixtureRoot();
		const source = `import { defineImplementation } from "../../../framework/interface";

function chooseScope(): string {
	return "session";
}

export const implementation = defineImplementation({
	create: () => ({}),
	subscriptions: [
		{ scope: chooseScope(), events: { turn_start: (): void => undefined } },
		{ scope: "everything", events: { turn_end: (): void => undefined } },
	],
});
`;
		write(root, "extensions/dynamic-scope/details/implementation.ts", source);

		const result = checkAuthoring({ root });

		expectDiagnostic(
			result,
			"authoring/static-scope",
			"extensions/dynamic-scope/details/implementation.ts",
			lineOf(source, "scope: chooseScope()"),
		);
		expectDiagnostic(
			result,
			"authoring/static-scope",
			"extensions/dynamic-scope/details/implementation.ts",
			lineOf(source, 'scope: "everything"'),
		);
	});

	test("rejects computed event keys and dynamic event tables", () => {
		const root = fixtureRoot();
		const source = `import { defineImplementation } from "../../../framework/interface";

function eventName(): string {
	return "turn_start";
}

function makeEvents(): Record<string, () => void> {
	return {};
}

export const implementation = defineImplementation({
	create: () => ({}),
	subscriptions: [
		{ scope: "session", events: { [eventName()]: (): void => undefined } },
		{ scope: "session", events: makeEvents() },
	],
});
`;
		write(root, "extensions/dynamic-events/details/implementation.ts", source);

		const result = checkAuthoring({ root });

		expectDiagnostic(
			result,
			"authoring/static-key",
			"extensions/dynamic-events/details/implementation.ts",
			lineOf(source, "[eventName()]"),
		);
		expectDiagnostic(
			result,
			"authoring/static-key",
			"extensions/dynamic-events/details/implementation.ts",
			lineOf(source, "events: makeEvents()"),
		);
	});

	test("rejects non-callable and unresolved handlers", () => {
		const root = fixtureRoot();
		const source = `import { defineImplementation } from "../../../framework/interface";

export const implementation = defineImplementation({
	create: () => ({}),
	subscriptions: [{
		scope: "session",
		events: {
			turn_start: 42,
			turn_end: missingHandler,
		},
	}],
});
`;
		write(root, "extensions/bad-handler/details/implementation.ts", source);

		const result = checkAuthoring({ root });

		expectDiagnostic(
			result,
			"authoring/handler",
			"extensions/bad-handler/details/implementation.ts",
			lineOf(source, "turn_start: 42"),
		);
		expectDiagnostic(
			result,
			"authoring/handler",
			"extensions/bad-handler/details/implementation.ts",
			lineOf(source, "turn_end: missingHandler"),
		);
	});

	test("rejects mutation of a declaration structure", () => {
		const root = fixtureRoot();
		const source = `import { defineImplementation } from "../../../framework/interface";

const declaration = {
	create: () => ({}),
	subscriptions: [] as unknown[],
	commands: {} as Record<string, unknown>,
};
declaration.subscriptions.push({ scope: "session", events: { turn_start: (): void => undefined } });
declaration.subscriptions = [{ scope: "session", events: { turn_end: (): void => undefined } }];
export const implementation = defineImplementation(declaration);
`;
		write(root, "extensions/mutated/details/implementation.ts", source);

		const result = checkAuthoring({ root });

		expectDiagnostic(
			result,
			"authoring/mutation",
			"extensions/mutated/details/implementation.ts",
			lineOf(source, "declaration.subscriptions.push("),
		);
		expectDiagnostic(
			result,
			"authoring/mutation",
			"extensions/mutated/details/implementation.ts",
			lineOf(source, "declaration.subscriptions = ["),
		);
	});

	test("rejects mutation through aliases and destructured declaration views", () => {
		const root = fixtureRoot();
		const source = `import { defineImplementation } from "../../../framework/interface";
const events = { turn_start: () => {} };
const implementation = defineImplementation({ create: () => ({}), subscriptions: [{ scope: "session", events }] });
const alias = events;
alias.turn_start = () => {};
const { declaration } = implementation;
declaration.subscriptions.length = 0;
`;
		write(root, "extensions/alias-mutation/details/implementation.ts", source);
		const result = checkAuthoring({ root });
		expectDiagnostic(result, "authoring/mutation", "extensions/alias-mutation/details/implementation.ts", lineOf(source, "alias.turn_start ="));
		expectDiagnostic(result, "authoring/mutation", "extensions/alias-mutation/details/implementation.ts", lineOf(source, "declaration.subscriptions.length ="));
	});

	test("passes authored callable factories to adapters without exposing their captured declarations", () => {
		const root = fixtureRoot();
		write(root, "framework/interface/details/implementation.ts", `export function defineImplementation<State>(declaration: unknown): (() => State) & { readonly declaration: unknown } { throw new Error("must never execute"); }`);
		write(root, "extensions/callable/details/implementation.ts", `import { defineImplementation } from "../../../framework/interface";
const events = { turn_start: () => {} };
export const implementation = defineImplementation({ create: () => ({}), subscriptions: [{ scope: "session", events }] });
declare function adapter(options: { implementation: typeof implementation }): void;
adapter({ implementation });`);
		expectClean(checkAuthoring({ root }));
	});

	test("still rejects an authored callable's explicit declaration escaping to an opaque helper", () => {
		const root = fixtureRoot();
		write(root, "framework/interface/details/implementation.ts", `export function defineImplementation<State>(declaration: unknown): (() => State) & { readonly declaration: unknown } { throw new Error("must never execute"); }`);
		const source = `import { defineImplementation } from "../../../framework/interface";
export const implementation = defineImplementation({ create: () => ({}) });
declare function alter(value: unknown): void;
alter(implementation.declaration);`;
		write(root, "extensions/callable-escape/details/implementation.ts", source);
		expectDiagnostic(checkAuthoring({ root }), "authoring/static-structure", "extensions/callable-escape/details/implementation.ts", lineOf(source, "alter(implementation.declaration)"));
	});

	test("reports declaration structures passed to opaque helpers as unresolved", () => {
		const root = fixtureRoot();
		const source = `import { defineImplementation } from "../../../framework/interface";
const events = { turn_start: () => {} };
function alter(target: typeof events) { target.turn_start = () => {}; }
alter(events);
export const implementation = defineImplementation({ create: () => ({}), subscriptions: [{ scope: "session", events }] });
`;
		write(root, "extensions/escape/details/implementation.ts", source);
		const result = checkAuthoring({ root });
		expectDiagnostic(result, "authoring/static-structure", "extensions/escape/details/implementation.ts", lineOf(source, "alter(events)"));
	});

	test("rejects dynamic spreads and conditional structure, not just the final keys", () => {
		const root = fixtureRoot();
		const source = `import { defineImplementation } from "../../../framework/interface";

const groupA = { events: { turn_start: (): void => undefined } } as const;
const groupB = { events: { turn_end: (): void => undefined } } as const;

function shouldSpread(): boolean {
	return true;
}

function makeGroup(): { scope: "session"; events: Record<string, () => void> } {
	return { scope: "session", events: {} };
}

export const implementation = defineImplementation({
	create: () => ({}),
	subscriptions: [
		{ scope: "session", ...(shouldSpread() ? groupA : groupB) },
		{ scope: "session", ...makeGroup() },
	],
});
`;
		write(root, "extensions/dynamic-structure/details/implementation.ts", source);

		const result = checkAuthoring({ root });

		expectDiagnostic(
			result,
			"authoring/static-structure",
			"extensions/dynamic-structure/details/implementation.ts",
			lineOf(source, "...(shouldSpread()"),
		);
		expectDiagnostic(
			result,
			"authoring/static-structure",
			"extensions/dynamic-structure/details/implementation.ts",
			lineOf(source, "...makeGroup()"),
		);
	});

	test("rejects an unresolved declaration argument", () => {
		const root = fixtureRoot();
		const source = `import { defineImplementation } from "../../../framework/interface";

function makeDeclaration(): unknown {
	return {};
}

const declaration = makeDeclaration(); export const implementation = defineImplementation(declaration);
`;
		write(root, "extensions/unresolved/details/implementation.ts", source);

		const result = checkAuthoring({ root });

		expectDiagnostic(
			result,
			"authoring/static-structure",
			"extensions/unresolved/details/implementation.ts",
			lineOf(source, "defineImplementation(declaration)"),
		);
	});

	test("detects cyclic structure references without hanging or silently passing", () => {
		const root = fixtureRoot();
		const source = `import { defineImplementation } from "../../../framework/interface";

const group = { scope: "session", events };
const events = { turn_start: (): void => undefined, ...group };
export const implementation = defineImplementation({ create: () => ({}), subscriptions: [group] });
`;
		write(root, "extensions/cyclic/details/implementation.ts", source);

		const result = checkAuthoring({ root });
		const diagnostics = result.diagnostics.filter(diagnostic => diagnostic.ruleId === "authoring/static-structure");

		expect(diagnostics.length).toBeGreaterThan(0);
		expect(diagnostics.some(diagnostic => diagnostic.file === "extensions/cyclic/details/implementation.ts")).toBe(true);
		for (const diagnostic of diagnostics) {
			expect(diagnostic.line).toBeGreaterThanOrEqual(1);
			expect(diagnostic.column).toBeGreaterThanOrEqual(1);
			expect(diagnostic.message.trim().length).toBeGreaterThan(0);
			expect(diagnostic.suggestion.trim().length).toBeGreaterThan(0);
		}
	}, 10_000);

	test("does not treat a local function named defineImplementation as the canonical entry", () => {
		const root = fixtureRoot();
		const source = `const declaration = { create: () => ({}), subscriptions: [{ scope: "session", events: { turn_start: (): void => undefined } }] };
const defineImplementation = (value: unknown): unknown => value; export const implementation = defineImplementation(declaration);
`;
		write(root, "extensions/fake-entry/details/implementation.ts", source);

		const result = checkAuthoring({ root });
		const diagnostics = result.diagnostics.filter(diagnostic => diagnostic.ruleId === "authoring/entrypoint");
		const entryLine = lineOf(source, "const defineImplementation =");

		expect(diagnostics.length).toBeGreaterThanOrEqual(1);
		expect(diagnostics.every(diagnostic => diagnostic.file === "extensions/fake-entry/details/implementation.ts")).toBe(true);
		expect(diagnostics.every(diagnostic => diagnostic.line === entryLine)).toBe(true);
		expect(result.declarationsChecked).toBe(0);
	});

	test("reports a parse diagnostic for an unparsable source file", () => {
		const root = fixtureRoot();
		write(root, "extensions/unparsable/details/implementation.ts", `import { defineImplementation } from "../../../framework/interface";

export const implementation = defineImplementation({
	create: () => ({}),
	subscriptions: [
		{ scope: "session", events: { turn_start: (): void => undefined } }
	],
`);
		const result = checkAuthoring({ root });
		const diagnostics = result.diagnostics.filter(diagnostic => diagnostic.ruleId === "authoring/parse");

		expect(diagnostics.length).toBeGreaterThanOrEqual(1);
		expect(diagnostics[0]?.file).toBe("extensions/unparsable/details/implementation.ts");
		expect(diagnostics[0]?.line).toBeGreaterThanOrEqual(1);
		expect(diagnostics[0]?.column).toBeGreaterThanOrEqual(1);
		expect(diagnostics[0]?.suggestion.trim().length).toBeGreaterThan(0);
	});

	test("leaves business bodies free and never executes fixture modules", () => {
		const root = fixtureRoot();
		const sentinel = join(root, "executed.sentinel");
		const source = `import { writeFileSync } from "node:fs";
import { defineImplementation } from "../../../framework/interface";

const SENTINEL = ${JSON.stringify(sentinel)};
writeFileSync(SENTINEL, "module executed");

export const implementation = defineImplementation({
	create: () => {
		writeFileSync(SENTINEL, "create executed");
		const state = { hits: [] as string[], byName: {} as Record<string, number> };
		for (const name of ["a", "b", "c"]) {
			state.byName[name] = name.length;
			state.hits.push(name.toUpperCase());
		}
		return state;
	},
	subscriptions: [{
		scope: "session",
		events: {
			turn_start: (state: { hits: string[] }) => {
				for (const hit of [...state.hits]) state.hits.push(hit.toLowerCase());
				state.hits.splice(0, 1);
			},
		},
	}],
});
`;
		write(root, "extensions/business/details/implementation.ts", source);

		const result = checkAuthoring({ root });

		expectClean(result);
		expect(existsSync(sentinel)).toBe(false);
	});

	test("scans only the selected file or directory roots when files are supplied", () => {
		const root = fixtureRoot();
		write(root, "extensions/good/details/implementation.ts", `import { defineImplementation } from "../../../framework/interface";

export const implementation = defineImplementation({
	create: () => ({}),
	subscriptions: [{ scope: "session", events: { turn_start: (): void => undefined } }],
});
`);
		const badSource = `import { defineImplementation } from "../../../framework/interface";

function chooseScope(): string {
	return "session";
}

export const implementation = defineImplementation({
	create: () => ({}),
	subscriptions: [{ scope: chooseScope(), events: { turn_start: (): void => undefined } }],
});
`;
		write(root, "extensions/bad/details/implementation.ts", badSource);

		const selected = checkAuthoring({ root, files: ["extensions/good/details/implementation.ts"] });
		expect(selected.diagnostics).toEqual([]);
		expect(selected.filesChecked).toBe(1);
		expect(selected.declarationsChecked).toBe(1);

		const whole = checkAuthoring({ root });
		expectDiagnostic(
			whole,
			"authoring/static-scope",
			"extensions/bad/details/implementation.ts",
			lineOf(badSource, "scope: chooseScope()"),
		);
	});

	test("returns deterministic, deduplicated and normalized diagnostics", () => {
		const root = fixtureRoot();
		write(root, "extensions/noisy/details/implementation.ts", `import { defineImplementation } from "../../../framework/interface";

function eventName(): string {
	return "turn_start";
}

export const implementation = defineImplementation({
	create: () => ({}),
	subscriptions: [
		{ scope: "session", events: { [eventName()]: (): void => undefined } },
		{ scope: "unknown", events: { turn_end: 42 } },
	],
});
`);

		const first = checkAuthoring({ root });
		const second = checkAuthoring({ root });

		expect(second).toEqual(first);
		expect(first.diagnostics.length).toBeGreaterThan(1);
		const keys = first.diagnostics.map(diagnostic =>
			[diagnostic.ruleId, diagnostic.file, diagnostic.line, diagnostic.column, diagnostic.message, diagnostic.suggestion].join("\u0000"),
		);
		expect(new Set(keys).size).toBe(keys.length);
		const ordering = first.diagnostics.map(diagnostic =>
			`${diagnostic.file}:${String(diagnostic.line).padStart(6, "0")}:${String(diagnostic.column).padStart(6, "0")}:${diagnostic.ruleId}`,
		);
		expect(ordering).toEqual([...ordering].sort());
		for (const diagnostic of first.diagnostics) {
			expect(diagnostic.file).toBe("extensions/noisy/details/implementation.ts");
			expect(diagnostic.line).toBeGreaterThanOrEqual(1);
			expect(diagnostic.column).toBeGreaterThanOrEqual(1);
		}
	});
});
