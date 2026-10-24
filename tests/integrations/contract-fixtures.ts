import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { IntegrationContract, Requirement } from "../../scripts/integrations/model";

const roots: string[] = [];

export function cleanupContractRoots(): void {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
}

export function createContractRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "integration-contract-"));
	roots.push(root);
	writeFixture(root, "framework/runtime/port.ts", PORT_SOURCE);
	writeFixture(root, "framework/runtime/adapter-authoring.ts", AUTHORING_SOURCE);
	writeFixture(root, "framework/interface/session/details/facts.ts", SESSION_FACTS_SOURCE);
	return root;
}

export function writeFixture(root: string, relative: string, source: string): void {
	const file = join(root, relative);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, source, "utf8");
}

export function portContract(member: string, requirement: Requirement = "required"): IntegrationContract {
	return {
		id: `port:${member}`,
		kind: "port",
		member,
		requirement,
		origins: [{ file: "extensions/fixture/index.ts", line: 1, column: 1 }],
		path: ["extension:fixture", `port:${member}`],
	};
}

export function deliveryContract(path: string, requirement: Requirement = "required"): IntegrationContract {
	return {
		id: `delivery:${path}`,
		kind: "delivery",
		member: path,
		requirement,
		origins: [{ file: "extensions/fixture/index.ts", line: 1, column: 1 }],
		path: ["extension:fixture", `delivery:${path}`],
	};
}

export function frameworkContract(semantic: string, requirement: Requirement = "required"): IntegrationContract {
	return {
		id: `framework:${semantic}`,
		kind: "framework",
		member: semantic,
		requirement,
		origins: [{ file: "extensions/fixture/index.ts", line: 1, column: 1 }],
		path: ["extension:fixture", `framework:${semantic}`],
	};
}

export const FULL_ADAPTER = `import {
	defineAdapterDelivery,
	defineAdapterPort,
	unavailablePortMember,
} from "../../../framework/runtime/adapter-authoring";
import type {
	FeedbackTransport,
	HarnessPort,
	MarkerTransport,
	RoundObservation,
	SessionDelivery,
} from "../../../framework/runtime/port";

interface FixtureContext {
	readonly feedback: FeedbackTransport;
	readonly allowSubagents: boolean;
}

const feedback: FeedbackTransport = { notify: () => {} };
const markers: MarkerTransport = { publishMarkers: () => {} };
const owner = { kind: "owner" as const, key: "owner" };
const session = { sessionId: "session" };
const frame = { owner, session, hasUI: true, feedback };

function observeSessions(context: FixtureContext, handler: (delivery: SessionDelivery) => void): void {
	handler(defineAdapterDelivery("session", {
		event: { kind: "session_start" },
		session,
		owner,
		statePayloads: [],
		persist: () => {},
		hasUI: true,
		feedback: context.feedback,
		notices: { warn: () => {} },
		markers,
	}));
}

function observeRounds(context: FixtureContext, observer: (delivery: RoundObservation) => void): void {
	observer(defineAdapterDelivery("round", {
		signal: { kind: "activity_started" },
		...frame,
		feedback: context.feedback,
		quiescent: () => true,
		heldWork: () => false,
	}));
}

export const TEST_PORT = defineAdapterPort<FixtureContext>({
	setLabel: context => label => {},
	reportDiagnostic: context => message => {},
	onSession: context => handler => observeSessions(context, handler),
	onRound: context => observer => observeRounds(context, observer),
	onSessionContext: context => handler => {},
	onDisposal: unavailablePortMember("fixture has no awaitable disposal position"),
	sessionObservationAccess: unavailablePortMember("fixture observes in-process sessions"),
	nextTask: () => callback => {},
	onRunInitiation: context => handler => undefined,
	onTurn: context => handler => {},
	onUserInput: context => handler => {},
	modelPrices: context => ({ query: () => undefined }),
	providerAccess: context => ({ query: () => undefined }),
	viewedSession: context => ({ read: () => undefined, subscribe: () => () => {} }),
	subagentIntegration: context => context.allowSubagents ? () => ({ state: "ready" as const }) : undefined,
	registerCommand: context => command => {},
});

throw new Error("the fixture adapter must never execute");
`;

export const MISSING_DELIVERY_ADAPTER = `import { defineAdapterDelivery, defineAdapterPort, unavailablePortMember } from "../../../framework/runtime/adapter-authoring";
import type { FeedbackTransport, RoundObservation } from "../../../framework/runtime/port";

interface FixtureContext { readonly feedback: FeedbackTransport; }

export const TEST_PORT = defineAdapterPort<FixtureContext>({
	setLabel: context => label => {},
	reportDiagnostic: context => message => {},
	onSession: context => handler => {},
	onRound: context => observer => {
		observer(defineAdapterDelivery("round", {
			signal: { kind: "activity_started" },
			session: { sessionId: "session" },
			owner: { kind: "owner", key: "owner" },
			hasUI: true,
			quiescent: () => true,
			heldWork: () => false,
		}));
	},
	onSessionContext: context => handler => {},
	onDisposal: unavailablePortMember("fixture"),
	sessionObservationAccess: unavailablePortMember("fixture"),
	nextTask: () => callback => {},
	onRunInitiation: context => handler => undefined,
	onTurn: context => handler => {},
	onUserInput: context => handler => {},
	modelPrices: unavailablePortMember("fixture"),
	providerAccess: unavailablePortMember("fixture"),
	viewedSession: unavailablePortMember("fixture"),
	subagentIntegration: unavailablePortMember("fixture"),
	registerCommand: context => command => {},
});

throw new Error("the fixture adapter must never execute");
`;

export const DYNAMIC_DELIVERY_ADAPTER = `import { defineAdapterDelivery, defineAdapterPort, unavailablePortMember } from "../../../framework/runtime/adapter-authoring";
import type { FeedbackTransport } from "../../../framework/runtime/port";

interface FixtureContext { readonly feedback: FeedbackTransport; }
declare const dynamicKind: "session";

export const TEST_PORT = defineAdapterPort<FixtureContext>({
	setLabel: context => label => {},
	reportDiagnostic: context => message => {},
	onSession: context => handler => {
		handler(defineAdapterDelivery(dynamicKind, {} as never));
	},
	onRound: context => observer => {},
	onSessionContext: context => handler => {},
	onDisposal: unavailablePortMember("fixture"),
	sessionObservationAccess: unavailablePortMember("fixture"),
	nextTask: () => callback => {},
	onRunInitiation: context => handler => undefined,
	onTurn: context => handler => {},
	onUserInput: context => handler => {},
	modelPrices: unavailablePortMember("fixture"),
	providerAccess: unavailablePortMember("fixture"),
	viewedSession: unavailablePortMember("fixture"),
	subagentIntegration: unavailablePortMember("fixture"),
	registerCommand: context => command => {},
});

throw new Error("the fixture adapter must never execute");
`;

export const MISSING_BINDING_ADAPTER = `import { defineAdapterPort, unavailablePortMember } from "../../../framework/runtime/adapter-authoring";
import type { FeedbackTransport } from "../../../framework/runtime/port";

interface FixtureContext { readonly feedback: FeedbackTransport; }

export const TEST_PORT = defineAdapterPort<FixtureContext>({
	setLabel: context => label => {},
	reportDiagnostic: context => message => context.feedback.notify("error", message),
	onSession: context => handler => {},
	onRound: context => observer => {},
	onSessionContext: context => handler => {},
	onDisposal: unavailablePortMember("fixture"),
	sessionObservationAccess: unavailablePortMember("fixture"),
	nextTask: () => callback => {},
	onRunInitiation: context => handler => undefined,
	onUserInput: context => handler => {},
	modelPrices: unavailablePortMember("fixture"),
	providerAccess: unavailablePortMember("fixture"),
	viewedSession: unavailablePortMember("fixture"),
	subagentIntegration: unavailablePortMember("fixture"),
	registerCommand: context => command => {},
});
`;

const SESSION_FACTS_CONTEXT = `interface FixtureContext {
	readonly sessionId: string;
	readonly kind: "main" | "sub";
	readonly parentSessionId?: string;
	readonly name?: string;
	readonly taskName?: string;
	readonly agentName?: string;
	readonly agentId?: string;
	readonly startup?: { readonly effort?: string };
	readonly unavailable: readonly string[];
}
`;

export const SESSION_FACTS_ADAPTER = `import {
	defineAdapterPort,
	defineSessionFactsMapping,
	unavailableFact,
} from "../../../framework/runtime/adapter-authoring";

${SESSION_FACTS_CONTEXT}
export const SESSION_FACTS = defineSessionFactsMapping<FixtureContext>({
	sessionId: input => input.sessionId,
	kind: input => input.kind,
	parentSessionId: input => input.parentSessionId,
	name: input => input.name,
	taskName: unavailableFact("pi reports no task handle"),
	agentName: unavailableFact("pi reports no agent definition"),
	agentId: input => input.agentId,
	startup: input => input.startup,
	unavailable: input => input.unavailable,
});

export const TEST_PORT = defineAdapterPort<FixtureContext>({
	onSession: context => handler => {},
});

throw new Error("the fixture adapter must never execute");
`;

export const SESSION_FACTS_MISSING_FIELD_ADAPTER = `import {
	defineAdapterPort,
	defineSessionFactsMapping,
} from "../../../framework/runtime/adapter-authoring";

${SESSION_FACTS_CONTEXT}
export const SESSION_FACTS = defineSessionFactsMapping<FixtureContext>({
	sessionId: input => input.sessionId,
	kind: input => input.kind,
	parentSessionId: input => input.parentSessionId,
	name: input => input.name,
	taskName: input => input.taskName,
	agentId: input => input.agentId,
	startup: input => input.startup,
	unavailable: input => input.unavailable,
});

export const TEST_PORT = defineAdapterPort<FixtureContext>({
	onSession: context => handler => {},
});

throw new Error("the fixture adapter must never execute");
`;

export const SESSION_FACTS_DYNAMIC_ADAPTER = `import {
	defineAdapterPort,
	defineSessionFactsMapping,
	unavailableFact,
} from "../../../framework/runtime/adapter-authoring";

${SESSION_FACTS_CONTEXT}
declare const dynamicFacts: Record<string, unknown>;

export const SESSION_FACTS = defineSessionFactsMapping<FixtureContext>({
	...dynamicFacts,
	sessionId: input => input.sessionId,
	agentName: unavailableFact("fixture reports no agent definition"),
});

export const TEST_PORT = defineAdapterPort<FixtureContext>({
	onSession: context => handler => {},
});

throw new Error("the fixture adapter must never execute");
`;

const PORT_SOURCE = `export interface FeedbackTransport {
	notify(level: "info" | "warning" | "error", message: string): void;
}
export interface MarkerTransport {
	publishMarkers(lines: readonly string[]): void;
}
export interface SessionFacts {
	readonly sessionId: string;
}
export interface OwnerReference {
	readonly kind: "owner" | "unresolved";
	readonly key: string;
}
export interface SessionDelivery {
	readonly event: { readonly kind: string };
	readonly session: SessionFacts;
	readonly owner: OwnerReference;
	readonly statePayloads: readonly unknown[];
	persist(values: Readonly<Record<string, unknown>>): void;
	readonly hasUI: boolean;
	readonly feedback: FeedbackTransport;
	readonly notices: { warn(message: string): void };
	readonly markers: MarkerTransport;
}
export interface SessionDisposal {
	readonly session: SessionFacts;
	readonly owner: OwnerReference;
	readonly hasUI: boolean;
	readonly closeOutWaitMs?: number;
	readonly feedback: FeedbackTransport;
}
export interface RoundObservation {
	readonly signal: { readonly kind: string };
	readonly session: SessionFacts;
	readonly owner: OwnerReference;
	readonly hasUI: boolean;
	readonly feedback: FeedbackTransport;
	quiescent(): boolean | undefined;
	heldWork(): boolean | undefined;
}
export interface SessionContextObservation {
	readonly session: SessionFacts;
	readonly owner: OwnerReference;
	readonly reading: { readonly tokens: number };
	readonly hasUI: boolean;
	readonly feedback: FeedbackTransport;
}
export interface RunDelivery {
	readonly owner: OwnerReference;
	readonly contributionIdentities: readonly string[];
	readonly markers: MarkerTransport;
}
export interface CommandInvocation {
	readonly args: string;
	readonly canAcceptInput: () => boolean | undefined;
	readonly provider: string | undefined;
	readonly owner: OwnerReference;
	persist(values: Readonly<Record<string, unknown>>): void;
	readonly feedback: FeedbackTransport;
	readonly hasUI: boolean;
	readonly markers: MarkerTransport;
}
export interface BoundCommand {
	readonly name: string;
	run(invocation: CommandInvocation): void | Promise<void>;
}
export interface TurnSignalFacts {
	readonly signal: { readonly kind: string };
	readonly owner: OwnerReference;
	readonly hasUI: boolean;
	readonly feedback: FeedbackTransport;
}
export interface UserInputDelivery {
	readonly event: { readonly kind: string };
	readonly owner: OwnerReference;
	readonly session: SessionFacts;
	readonly hasUI: boolean;
	readonly feedback: FeedbackTransport;
}
export interface SessionObservationAccess {
	receive(ownerKey: string, sink: (reading: unknown) => void): () => void;
	deliver(reading: unknown): void;
}
export interface CatalogPriceSource {
	query(provider: string, model: string): number | undefined;
}
export interface ProviderAccess {
	query(provider: string): unknown;
}
export interface ViewedSessionPort {
	read(): OwnerReference | undefined;
	subscribe(listener: () => void): () => void;
}
export interface SubagentIntegration {
	readonly state: "ready" | "none" | "failed";
}
export interface HarnessPort {
	setLabel(label: string): void;
	reportDiagnostic(message: string): void;
	onSession(handler: (session: SessionDelivery) => void): void;
	onRound(observer: (observation: RoundObservation) => void): void;
	onDisposal?(handler: (disposal: SessionDisposal) => void | Promise<void>): void;
	onSessionContext(handler: (observation: SessionContextObservation) => void): void;
	sessionObservationAccess?: SessionObservationAccess;
	nextTask(callback: () => void): void;
	onRunInitiation(handler: (run: RunDelivery) => undefined | Promise<undefined>): void;
	onTurn(handler: (facts: TurnSignalFacts) => void): void;
	onUserInput(handler: (delivery: UserInputDelivery) => void): void;
	modelPrices?: CatalogPriceSource;
	providerAccess?: ProviderAccess;
	viewedSession?: ViewedSessionPort;
	subagentIntegration?: () => SubagentIntegration | Promise<SubagentIntegration>;
	registerCommand(command: BoundCommand): void;
}
`;

const SESSION_FACTS_SOURCE = `export interface SessionStartup {
	readonly model?: { readonly provider: string; readonly model: string };
	readonly effort?: string;
}
export interface SessionFacts {
	readonly sessionId: string;
	readonly kind: "main" | "sub";
	readonly parentSessionId?: string;
	readonly name?: string;
	readonly taskName?: string;
	readonly agentName?: string;
	readonly agentId?: string;
	readonly startup?: SessionStartup;
	readonly unavailable: readonly string[];
}
`;

const AUTHORING_SOURCE = `import type { SessionFacts } from "../interface/session/details/facts";
import type {
	CommandInvocation,
	HarnessPort,
	RoundObservation,
	RunDelivery,
	SessionContextObservation,
	SessionDelivery,
	SessionDisposal,
	TurnSignalFacts,
	UserInputDelivery,
} from "./port";

declare const adapterFactoryPort: unique symbol;

export interface AdapterFactoryOutput<Port extends HarnessPort> {
	readonly [adapterFactoryPort]?: Port;
}

export type AdapterFactory<Port extends HarnessPort, Factory> = Factory & AdapterFactoryOutput<Port>;

export interface UnavailablePortMember {
	readonly kind: "unavailable";
	readonly reason: string;
}

export function unavailablePortMember(reason: string): UnavailablePortMember {
	return Object.freeze({ kind: "unavailable", reason });
}

export type AdapterPortBindings<Context> = {
	readonly [Member in keyof HarnessPort]-?:
		| ((context: Context) => HarnessPort[Member])
		| ({} extends Pick<HarnessPort, Member> ? UnavailablePortMember : never);
};

export interface AdapterPortDefinition<Context> {
	readonly bindings: AdapterPortBindings<Context>;
	create(context: Context): HarnessPort;
}

export function defineAdapterPort<Context>(bindings: AdapterPortBindings<Context>): AdapterPortDefinition<Context> {
	return { bindings, create: () => ({}) as HarnessPort };
}

export interface AdapterDeliveryMap {
	readonly session: SessionDelivery;
	readonly disposal: SessionDisposal;
	readonly round: RoundObservation;
	readonly context: SessionContextObservation;
	readonly turn: TurnSignalFacts;
	readonly input: UserInputDelivery;
	readonly run: RunDelivery;
	readonly command: CommandInvocation;
}

export function defineAdapterDelivery<Kind extends keyof AdapterDeliveryMap>(
	_kind: Kind,
	delivery: AdapterDeliveryMap[Kind],
): AdapterDeliveryMap[Kind] {
	return delivery;
}

export interface UnavailableFact {
	readonly kind: "unavailable";
	readonly reason: string;
}

export function unavailableFact(reason: string): UnavailableFact {
	return Object.freeze({ kind: "unavailable", reason });
}

export type SessionFactsMapping<Input> = {
	readonly [Field in keyof SessionFacts]:
		| ((input: Input) => SessionFacts[Field])
		| UnavailableFact;
};

export function defineSessionFactsMapping<Input>(
	bindings: SessionFactsMapping<Input>,
): (input: Input) => SessionFacts {
	return input => {
		const facts: Record<string, unknown> = {};
		const unavailable: string[] = [];
		for (const [field, entry] of Object.entries(bindings)) {
			if (typeof entry === "function") facts[field] = entry(input);
			else unavailable.push((entry as UnavailableFact).reason);
		}
		facts.unavailable = [...(facts.unavailable as readonly string[] ?? []), ...unavailable];
		return facts as unknown as SessionFacts;
	};
}
`;
