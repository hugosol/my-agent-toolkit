import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeDemand } from "../../scripts/integrations/demand";
import type { DemandResult } from "../../scripts/integrations/model";

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
});

/**
 * A disposable repository-like project with only the canonical authoring symbols and the
 * capability/ delivery types the fixtures use. It has no discovery entry, reference harness or
 * adapter assembly: demand analysis must not need one.
 */
function fixtureRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "integration-demand-"));
	roots.push(root);
	write(root, "framework/interface/contracts.ts", [
		"export interface FeedbackTransport { notify(level: string, message: string): void; }",
		"export interface SessionObservationReader {",
		"  read(sessionId: string): unknown;",
		"  snapshot(): readonly unknown[];",
		"}",
		"export interface SessionCapability {",
		"  readonly observations: SessionObservationReader;",
		"  recordCommit(sessionId: string): void;",
		"}",
		"export interface CatalogPriceSource { priceOf(provider: string, model: string): unknown; }",
		"export interface ProviderAccess { resolve(provider: string): Promise<unknown>; }",
		"export interface DeclaredValueSeam { read(): boolean; write(value: boolean): void; }",
		"export interface OwnerCapabilityHandle {",
		"  readonly state: DeclaredValueSeam;",
		"  readonly feedback: FeedbackTransport;",
		"}",
		"export interface CloseOutWait { remaining(): number; }",
		"export interface SubagentIntegration { mode: \"subagents\" | \"none\" | \"failed\"; }",
		"export type CanAcceptInput = () => boolean | undefined;",
		"export interface ImplementationContext {",
		"  readonly session: SessionCapability;",
		"  readonly modelPrices?: CatalogPriceSource;",
		"  readonly providerAccess?: ProviderAccess;",
		"}",
		"export interface InitializationDelivery {",
		"  readonly feedback: FeedbackTransport;",
		"  readonly subagents: SubagentIntegration;",
		"}",
		"export interface ActionDelivery {",
		"  readonly feedback: FeedbackTransport;",
		"  readonly canAcceptInput: CanAcceptInput;",
		"  readonly provider?: string;",
		"}",
		"export interface CommandDelivery extends ActionDelivery {",
		"  readonly state: DeclaredValueSeam;",
		"  readonly capability: OwnerCapabilityHandle;",
		"}",
		"export interface SessionEventDelivery {",
		"  readonly feedback: FeedbackTransport;",
		"  readonly session: { readonly sessionId: string };",
		"  readonly capability: OwnerCapabilityHandle;",
		"  readonly event: { readonly kind: string; readonly reason?: string };",
		"}",
		"export interface RoundDelivery {",
		"  readonly feedback: FeedbackTransport;",
		"  readonly owner: { readonly kind: string; readonly key?: string };",
		"  readonly closeOut?: CloseOutWait;",
		"  readonly state?: DeclaredValueSeam;",
		"}",
		"export interface TurnStartDelivery {",
		"  readonly feedback: FeedbackTransport;",
		"  readonly turn: { readonly session: { readonly sessionId: string } };",
		"}",
		"export interface TurnEndDelivery {",
		"  readonly feedback: FeedbackTransport;",
		"  readonly turn: { readonly session: { readonly sessionId: string } };",
		"  readonly end: { readonly usage?: { readonly totalTokens: number } };",
		"}",
		"export interface SessionCommitDelivery { readonly feedback: FeedbackTransport; }",
		"export interface SessionUnobservedDelivery { readonly feedback: FeedbackTransport; }",
		"export interface SessionActivityDelivery { readonly feedback: FeedbackTransport; }",
		"export interface SessionContextDelivery { readonly feedback: FeedbackTransport; }",
		"export interface UserInputDelivery { readonly feedback: FeedbackTransport; }",
		"",
	].join("\n"));
	write(root, "framework/interface/index.ts", [
		"export function defineExtension(definition: unknown): unknown { return definition; }",
		"export type * from \"./contracts\";",
		"",
	].join("\n"));
	write(root, "framework/interface/details/implementation.ts", [
		"export function defineImplementation<State>(declaration: unknown): unknown { return declaration; }",
		"export type { ImplementationContext, InitializationDelivery } from \"../contracts\";",
		"",
	].join("\n"));
	return root;
}

function write(root: string, relative: string, source: string): void {
	const file = join(root, relative);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, source, "utf8");
}

function contractIds(result: DemandResult): string[] {
	return result.contracts.map(contract => contract.id);
}

function contract(result: DemandResult, id: string) {
	return result.contracts.find(candidate => candidate.id === id);
}

describe("offline demand analysis", () => {
	test("reports dynamic capability selection but permits dynamic business-data indexing", () => {
		const root = fixtureRoot();
		write(root, "extensions/demo/definition.ts", `import { defineExtension } from "../../framework/interface";
export const DEMO = defineExtension({ id: "demo", displayName: "Demo" });`);
		write(root, "extensions/demo/implementation.ts", `import { defineImplementation } from "../../framework/interface/details/implementation";
declare function choose(): "read" | "snapshot";
export const implementation = defineImplementation({ create(context: import("../../framework/interface").ImplementationContext) {
  context.session.observations[choose()]("session");
  const business: Record<string, number> = { a: 1 }; return business[choose()];
} });`);
		const result = analyzeDemand({ root, extension: "demo" });
		expect(result.diagnostics.some(item => item.code === "demand/dynamic-capability-member")).toBe(true);
		write(root, "extensions/demo/implementation.ts", `import { defineImplementation } from "../../framework/interface/details/implementation";
declare function choose(): "read" | "snapshot";
export const implementation = defineImplementation({ create(context: import("../../framework/interface").ImplementationContext) {
  context.session.observations.read("session");
  const business: Record<string, number> = { a: 1 }; return business[choose()];
} });`);
		expect(analyzeDemand({ root, extension: "demo" }).diagnostics).toEqual([]);
	});

	test("does not silently accept a capability member lacking a framework dependency rule", () => {
		const root = fixtureRoot();
		appendFileSync(join(root, "framework/interface/contracts.ts"), "\nexport interface SessionCapability { futureCapability(): void; }\n");
		write(root, "extensions/demo/definition.ts", `import { defineExtension } from "../../framework/interface";
export const DEMO = defineExtension({ id: "demo", displayName: "Demo" });`);
		write(root, "extensions/demo/implementation.ts", `import { defineImplementation } from "../../framework/interface/details/implementation";
export const implementation = defineImplementation({ create(context: import("../../framework/interface").ImplementationContext) { context.session.futureCapability(); return {}; } });`);
		expect(analyzeDemand({ root, extension: "demo" }).diagnostics.some(item => item.code === "demand/unmapped-capability-member")).toBe(true);
	});

	test("recursive helpers reuse analyzed semantic inputs without a false depth failure", () => {
		const root = fixtureRoot();
		write(root, "extensions/demo/definition.ts", `import { defineExtension } from "../../framework/interface";
export const DEMO = defineExtension({ id: "demo", displayName: "Demo" });`);
		write(root, "extensions/demo/implementation.ts", `import { defineImplementation } from "../../framework/interface/details/implementation";
type Context = import("../../framework/interface").ImplementationContext;
function recurse(context: Context, remaining: number): void {
  if (remaining > 0) recurse(context, remaining - 1);
  context.session.recordCommit("session");
}
export const implementation = defineImplementation({ create(context: Context) { recurse(context, 5); return {}; } });`);
		const result = analyzeDemand({ root, extension: "demo" });
		expect(result.diagnostics).toEqual([]);
		expect(contractIds(result)).toContain("framework:storage-commit");
	});

	test("reports the function traversal bound instead of certifying truncated demand", () => {
		const root = fixtureRoot();
		write(root, "extensions/demo/definition.ts", `import { defineExtension } from "../../framework/interface";
export const DEMO = defineExtension({ id: "demo", displayName: "Demo" });`);
		const helpers = Array.from({ length: 100 }, (_, index) => `function hop${index}(context: import("../../framework/interface").ImplementationContext): void { ${index === 99 ? 'return context.session.recordCommit("session");' : `return hop${index + 1}(context);`} }`).join("\n");
		write(root, "extensions/demo/implementation.ts", `import { defineImplementation } from "../../framework/interface/details/implementation";
${helpers}
export const implementation = defineImplementation({ create(context: import("../../framework/interface").ImplementationContext) { hop0(context); return {}; } });`);
		expect(analyzeDemand({ root, extension: "demo" }).diagnostics.some(item => item.code === "demand/analysis-bound")).toBe(true);
	});
	test("derives framework, port and delivery obligations from static usage", () => {
		const root = fixtureRoot();
		write(root, "extensions/demo/definition.ts", `import { defineExtension } from "../../framework/interface";

export const DEMO = defineExtension({
	id: "demo",
	displayName: "Demo",
	state: { inheritance: "follow", persistence: "session-entry" },
	prompts: [{ tag: "init", strategy: "first-enabled-run", content: "static prompt" }],
	marker: { text: "demo" },
	commands: [{ type: "actions", name: "budget", description: "budget", actions: { detail: "detail" } }],
});
`);
		write(root, "extensions/demo/implementation.ts", `import { defineImplementation } from "../../framework/interface/details/implementation";
import type {
	ActionDelivery,
	ImplementationContext,
	InitializationDelivery,
	RoundDelivery,
	SessionCommitDelivery,
	TurnEndDelivery,
} from "../../framework/interface/contracts";

interface State { readonly enabled: boolean }

export const implementation = defineImplementation<State>({
	create: (context: ImplementationContext): State => {
		const observations = context.session.observations;
		observations.read("session");
		observations.snapshot();
		context.session.recordCommit("session");
		context.modelPrices?.priceOf("provider", "model");
		void context.providerAccess?.resolve("provider");
		return { enabled: true };
	},
	subscriptions: [{
		scope: "session",
		events: {
			turn_end: (_state: State, delivery: TurnEndDelivery) => {
				delivery.feedback.notify("info", "turn");
				void delivery.end.usage?.totalTokens;
			},
			round_end: (_state: State, delivery: RoundDelivery) => {
				delivery.feedback.notify("info", "round");
				delivery.closeOut?.remaining();
				delivery.state?.write(true);
			},
			session_commit: (_state: State, delivery: SessionCommitDelivery) => {
				delivery.feedback.notify("info", "commit");
			},
		},
	}],
	commands: {
		budget: {
			detail: (_state: State, delivery: ActionDelivery) => {
				delivery.feedback.notify("info", "detail");
				delivery.canAcceptInput();
				void delivery.provider;
			},
		},
	},
	initialize: (_state: State, delivery: InitializationDelivery) => {
		delivery.feedback.notify("info", "initialize");
		void delivery.subagents.mode;
	},
	cleanup: (_state: State) => undefined,
});
`);

		const result = analyzeDemand({ root, extension: "demo" });
		expect(result.extension).toBe("demo");
		expect(result.files).toEqual(["extensions/demo/definition.ts", "extensions/demo/implementation.ts"]);
		expect(result.diagnostics).toEqual([]);

		const ids = contractIds(result);
		for (const id of [
			"port:onSession",
			"port:onRound",
			"port:onTurn",
			"port:onRunInitiation",
			"port:registerCommand",
			"port:modelPrices",
			"port:providerAccess",
			"port:subagentIntegration",
			"framework:extension-loading",
			"framework:session-facts",
			"framework:state-follow",
			"framework:state-persistence",
			"framework:session-lifecycle",
			"framework:session-observations",
			"framework:storage-commit",
			"framework:turn-usage",
			"framework:model-prices",
			"framework:provider-access",
			"framework:session-observation-read",
			"framework:session-observation-snapshot",
			"framework:session-record-commit",
			"delivery:turn.feedback.notify",
			"delivery:round.feedback.notify",
			"delivery:round.state.write",
			"delivery:commit.feedback.notify",
			"delivery:action.feedback.notify",
			"delivery:action.canAcceptInput",
			"delivery:action.provider",
			"delivery:initialization.feedback.notify",
			"delivery:initialization.subagents",
		]) {
			expect(ids).toContain(id);
		}
		expect(contract(result, "port:onDisposal")?.requirement).toBe("optional");
		expect(contract(result, "port:modelPrices")?.requirement).toBe("optional");
		expect(contract(result, "port:providerAccess")?.requirement).toBe("optional");
		expect(contract(result, "delivery:round.closeOut.remaining")?.requirement).toBe("optional");
		expect(contract(result, "delivery:initialization.subagents")?.requirement).toBe("optional");
		expect(contract(result, "port:onTurn")?.requirement).toBe("required");
		for (const item of result.contracts) {
			expect(item.origins.length).toBeGreaterThan(0);
			expect(item.path[0]).toBe("extension:demo");
		}
	});

	test("follows aliases, destructuring, object passing and shared helper functions", () => {
		const root = fixtureRoot();
		write(root, "extensions/aliased/definition.ts", `import { defineExtension } from "../../framework/interface";

export const ALIASED = defineExtension({
	id: "aliased",
	displayName: "Aliased",
	commands: [{ type: "actions", name: "demo", actions: { detail: "detail" } }],
});
`);
		write(root, "extensions/aliased/helper.ts", `import type {
	DeclaredValueSeam,
	FeedbackTransport,
	OwnerCapabilityHandle,
	SessionObservationReader,
} from "../../framework/interface/contracts";

export function report(feedback: FeedbackTransport): void {
	feedback.notify("info", "helper");
}

export function watch(reader: SessionObservationReader): void {
	reader.read("session");
}

export function consume(inputs: { readonly feedback: FeedbackTransport; readonly seam: DeclaredValueSeam }): void {
	const { feedback, seam } = inputs;
	feedback.notify("info", "consume");
	seam.write(true);
}

export function holderUse(holder: { readonly capability: OwnerCapabilityHandle }): void {
	holder.capability.state.read();
	holder.capability.feedback.notify("info", "holder");
}
`);
		write(root, "extensions/aliased/implementation.ts", `import { defineImplementation } from "../../framework/interface/details/implementation";
import type { CommandDelivery, ImplementationContext } from "../../framework/interface/contracts";
import { consume, holderUse, report, watch } from "./helper";

interface State { readonly enabled: boolean }

export const implementation = defineImplementation<State>({
	create: (context: ImplementationContext): State => {
		const observations = context.session.observations;
		watch(observations);
		return { enabled: true };
	},
	commands: {
		demo: {
			detail: (_state: State, delivery: CommandDelivery) => {
				const { feedback, state, capability } = delivery;
				feedback.notify("info", "direct");
				state.read();
				capability.feedback.notify("info", "capability");
				report(delivery.feedback);
				consume({ feedback: delivery.feedback, seam: delivery.state });
				holderUse({ capability: delivery.capability });
			},
		},
	},
});
`);

		const result = analyzeDemand({ root, extension: "aliased" });
		expect(result.diagnostics).toEqual([]);
		const ids = contractIds(result);
		for (const id of [
			"delivery:action.feedback.notify",
			"delivery:action.state.read",
			"delivery:action.state.write",
			"delivery:action.capability.feedback.notify",
			"delivery:action.capability.state.read",
			"framework:session-observation-read",
		]) {
			expect(ids).toContain(id);
		}
		expect(contract(result, "framework:session-observation-read")?.requirement).toBe("optional");
	});

	test("does not interpret type-only imports as framework usage", () => {
		const root = fixtureRoot();
		write(root, "extensions/type-only/definition.ts", `import { defineExtension } from "../../framework/interface";

export const TYPE_ONLY = defineExtension({ id: "type-only", displayName: "Type only" });
`);
		write(root, "extensions/type-only/types.ts", `import type {
	CatalogPriceSource,
	CommandDelivery,
	ProviderAccess,
	SessionObservationReader,
} from "../../framework/interface/contracts";

export type AvailableTypes = CatalogPriceSource | ProviderAccess | SessionObservationReader | CommandDelivery;
`);
		write(root, "extensions/type-only/implementation.ts", `import { defineImplementation } from "../../framework/interface/details/implementation";
import type { ImplementationContext } from "../../framework/interface/contracts";

export const implementation = defineImplementation({
	create: (_context: ImplementationContext) => ({ enabled: true }),
});
`);

		const result = analyzeDemand({ root, extension: "type-only" });
		expect(result.diagnostics).toEqual([]);
		const ids = contractIds(result);
		for (const id of [
			"port:modelPrices",
			"port:providerAccess",
			"framework:model-prices",
			"framework:provider-access",
			"framework:session-observation-read",
			"framework:session-observation-snapshot",
			"framework:session-record-commit",
		]) {
			expect(ids).not.toContain(id);
		}
		expect(ids.some(id => id.startsWith("delivery:"))).toBe(false);
	});

	test.each([false, true])("does not import or execute extension code (top-level throw: %s)", throws => {
		const root = fixtureRoot();
		const sentinel = join(root, "extension-executed.txt");
		write(root, "extensions/never-run/definition.ts", `import { defineExtension } from "../../framework/interface";

export const NEVER = defineExtension({ id: "never-run", displayName: "Never run" });
`);
		write(root, "extensions/never-run/implementation.ts", `import { appendFileSync } from "node:fs";
import { defineImplementation } from "../../framework/interface/details/implementation";

appendFileSync(${JSON.stringify(sentinel)}, "module\\n");
${throws ? 'throw new Error("the demand analyzer executed the extension module");' : ""}

export const implementation = defineImplementation({
	create: () => {
		throw new Error("the demand analyzer called create");
	},
	subscriptions: [{
		scope: "owner",
		events: {
			session_end: () => {
				throw new Error("the demand analyzer called a handler");
			},
		},
	}],
});
`);

		// Execute the exact fixture in a separate runtime: the observer must survive both an
		// ordinary import and an import that throws after its externally visible side effect.
		const control = spawnSync(process.execPath, [join(root, "extensions/never-run/implementation.ts")], {
			cwd: root,
			encoding: "utf8",
			timeout: 10_000,
		});
		expect(control.error).toBeUndefined();
		expect(control.status).toBe(throws ? 1 : 0);
		expect(readFileSync(sentinel, "utf8")).toBe("module\n");
		rmSync(sentinel);

		const result = analyzeDemand({ root, extension: "never-run" });
		expect(existsSync(sentinel)).toBe(false);
		expect(result.extension).toBe("never-run");
		expect(contractIds(result)).toContain("port:onSession");
	});

	test("reports unresolved definitions, unknown events and missing implementations", () => {
		const unresolvedRoot = fixtureRoot();
		write(unresolvedRoot, "extensions/unresolved/definition.ts", `import { defineExtension } from "../../framework/interface";

const dynamicId = identify();
export const UNRESOLVED = defineExtension({ id: dynamicId, displayName: "Unresolved" });
`);
		const unresolved = analyzeDemand({ root: unresolvedRoot, extension: "unresolved" });
		expect(unresolved.diagnostics.map(diagnostic => diagnostic.code)).toContain("demand/definition");

		const eventRoot = fixtureRoot();
		write(eventRoot, "extensions/bad-event/definition.ts", `import { defineExtension } from "../../framework/interface";

export const BAD_EVENT = defineExtension({ id: "bad-event", displayName: "Bad event" });
`);
		write(eventRoot, "extensions/bad-event/implementation.ts", `import { defineImplementation } from "../../framework/interface/details/implementation";

export const implementation = defineImplementation({
	create: () => ({}),
	subscriptions: [{ scope: "owner", events: { not_a_framework_event: () => undefined } }],
});
`);
		const badEvent = analyzeDemand({ root: eventRoot, extension: "bad-event" });
		expect(badEvent.diagnostics.map(diagnostic => diagnostic.code)).toContain("demand/event");

		const commandRoot = fixtureRoot();
		write(commandRoot, "extensions/missing-impl/definition.ts", `import { defineExtension } from "../../framework/interface";

export const MISSING = defineExtension({
	id: "missing-impl",
	displayName: "Missing implementation",
	commands: [{ type: "directed", name: "missing", state: "enabled", description: "missing" }],
});
`);
		const missing = analyzeDemand({ root: commandRoot, extension: "missing-impl" });
		expect(missing.diagnostics.map(diagnostic => diagnostic.code)).toContain("demand/implementation");
		expect(contractIds(missing)).toContain("port:registerCommand");
	});

	test("recognizes the repository extensions without adapter or discovery entries", () => {
		const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));

		const modelCost = analyzeDemand({ root, extension: "model-cost" });
		expect(modelCost.extension).toBe("model-cost");
		expect(modelCost.diagnostics).toEqual([]);
		const modelCostIds = contractIds(modelCost);
		for (const id of [
			"port:onSession",
			"port:onRound",
			"port:registerCommand",
			"framework:extension-loading",
			"framework:session-facts",
			"framework:storage-commit",
		]) {
			expect(modelCostIds).toContain(id);
		}

		const codebaseTools = analyzeDemand({ root, extension: "codebase-tools" });
		expect(codebaseTools.extension).toBe("codebase-tools");
		expect(codebaseTools.diagnostics).toEqual([]);
		const codebaseIds = contractIds(codebaseTools);
		for (const id of [
			"port:onSession",
			"port:registerCommand",
			"framework:extension-loading",
			"framework:session-facts",
			"framework:state-follow",
		]) {
			expect(codebaseIds).toContain(id);
		}

		const connectBot = analyzeDemand({ root, extension: "connect-bot" });
		expect(connectBot.extension).toBe("connect-bot");
		expect(connectBot.diagnostics).toEqual([]);
		const connectBotIds = contractIds(connectBot);
		for (const id of [
			"port:onSession",
			"port:onRound",
			"port:registerCommand",
			"framework:session-lifecycle",
			"delivery:session.feedback.notify",
			"delivery:command.feedback.notify",
		]) {
			expect(connectBotIds).toContain(id);
		}
	}, 30_000);

	test("accepts an extension directory or a source file without a discovery entry", () => {
		const root = fixtureRoot();
		write(root, "extensions/source-path/definition.ts", `import { defineExtension } from "../../framework/interface";

export const SOURCE_PATH = defineExtension({ id: "source-path", displayName: "Source path" });
`);
		write(root, "extensions/source-path/implementation.ts", `import { defineImplementation } from "../../framework/interface/details/implementation";

export const implementation = defineImplementation({
	create: () => ({}),
	subscriptions: [{ scope: "owner", events: { user_input: () => undefined } }],
});
`);

		const byDirectory = analyzeDemand({ root, extension: "source-path" });
		const byFile = analyzeDemand({ root, extension: "extensions/source-path/implementation.ts" });
		expect(byDirectory.extension).toBe("source-path");
		expect(byFile.extension).toBe("source-path");
		expect(contractIds(byDirectory)).toContain("port:onUserInput");
		expect(contractIds(byFile)).toContain("port:onUserInput");
		expect(byFile.files).toEqual(["extensions/source-path/definition.ts", "extensions/source-path/implementation.ts"]);
	});
});
