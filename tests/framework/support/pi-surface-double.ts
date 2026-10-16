/**
 * The pi native surface double: the framework suite's shared binding double for the pi adapter.
 *
 * A harness adapter's own mapping is observable at the seam the framework hands an extension: the
 * deliveries its factory's subscriptions receive, plus the queries the framework asks of the host on
 * the extension's behalf. This double is one such native surface — exactly the members `piAdapter`
 * reads — recording every registration and every delivery, and answering the host's own readings (the
 * model registry, the idle and pending-message facts) from the session description a case states.
 *
 * What it deliberately does not do is decide anything: it delivers the native facts a case states and
 * nothing else, so a case about a run-cycle fact is a case about the adapter's mapping rather than
 * about the double's own synthesis. The harness-independent half of the framework lives in
 * `./harness-port-double`; a suite that must observe a *native* mapping drives this one.
 */
import { vi } from "bun:test";
import {
	type PiAgentSettledEvent,
	type PiAgentStartEvent,
	type PiAssistantMessage,
	type PiBeforeAgentStartEvent,
	type PiBeforeProviderRequestEvent,
	type PiCommandRegistration,
	type PiExtensionApi,
	type PiExtensionContext,
	type PiInputEvent,
	type PiMessageEndEvent,
	type PiModelRegistry,
	type PiSessionStartEvent,
	type PiSessionShutdownEvent,
	piAdapter,
} from "../../../framework/adapters/pi";
import type {
	CatalogPriceSource,
	FeedbackLevel,
	RoundDelivery,
	TurnEndDelivery,
	TurnStartDelivery,
} from "../../../framework/core/protocol";
import type { ExtensionDefinition, ImplementationContext } from "../../../framework/public";

/** The definition the double binds: it declares nothing, so every behavior under test is injected. */
export const PI_SURFACE_PROBE: ExtensionDefinition = { id: "pi-surface-probe", displayName: "piSurfaceProbe" };

/** One model as pi's own registry holds it, in the four cost buckets the adapter maps. */
export interface PiNativeModel {
	readonly id: string;
	readonly provider: string;
	readonly baseUrl?: string;
	/** The USD-per-million-token rates this catalog row states; absent models a row with no cost. */
	readonly cost?: {
		readonly input?: number;
		readonly output?: number;
		readonly cacheRead?: number;
		readonly cacheWrite?: number;
	};
}

/**
 * One session as the native surface reports it.
 *
 * The mutable members are the ones a case changes *between* two deliveries to model the host moving:
 * the session's current model, the registry rows whose prices can change, and the credential pi
 * resolves. The absent members are facts this surface does not report at all — which is what makes a
 * case about a host that answers nothing a case about absence rather than about a value.
 */
export interface PiSurfaceSession {
	readonly sessionId: string;
	/** The name pi reports for the session; absent models a surface that reports none. */
	readonly name?: string;
	/** The session's current model; a case changes it to model a switch between two requests. */
	model?: { readonly id?: string; readonly provider?: string };
	/** The effective thinking level at a session's start. */
	readonly thinkingLevel?: string;
	/** pi's own catalog rows, as `modelRegistry.getAll()` answers them. */
	catalog?: PiNativeModel[];
	/** The credentials pi resolves per provider, read at each query rather than snapshotted. */
	credentials?: Record<string, string | undefined>;
	/** The addresses the provider entries state, as `modelRegistry.getProvider` answers them. */
	readonly providerBaseUrls?: Record<string, string | undefined>;
	/** Whether the session has a UI; absent means it has one. */
	readonly hasUI?: boolean;
	/** pi's idle fact. Absent models a surface that reports no such fact at all. */
	idle?: boolean;
	/** pi's pending-message fact. Absent models a surface that reports no such fact at all. */
	pending?: boolean;
}

/** One registered command, as the adapter handed it to the host. */
export interface RegisteredCommand {
	readonly description?: string;
	readonly handler: PiCommandRegistration["handler"];
}

/** One widget rendering the framework published through this surface's UI. */
export interface PublishedWidget {
	readonly key: string;
	readonly content: readonly string[] | undefined;
}

/** One extension feedback notice published through this surface's UI. */
export interface PublishedNotice {
	readonly level: FeedbackLevel;
	readonly message: string;
}

/** The pi native surface a loader would hand the adapter, with everything a case observes. */
export interface PiSurface {
	readonly api: PiExtensionApi;
	/** The labels the framework set, in call order. */
	readonly labels: string[];
	/** The commands the adapter registered, by name. */
	readonly commands: Map<string, RegisteredCommand>;
	/** The non-context entries the framework appended, in call order. */
	readonly entries: Array<{ readonly customType: string; readonly data: unknown }>;
	/** The Turn start edges the framework dispatched, in call order. */
	readonly starts: TurnStartDelivery[];
	/** The Turn end edges the framework dispatched, in call order. */
	readonly ends: TurnEndDelivery[];
	/** The Round edges the framework dispatched, in call order. */
	readonly rounds: RoundDelivery[];
	/** The Round edge kinds, in call order: the open/close sequence one case reads. */
	readonly edges: Array<RoundDelivery["event"]["kind"]>;
	/** The widgets the framework published through this surface's UI, in call order. */
	readonly widgets: PublishedWidget[];
	/** The notices the framework published through this surface's UI, in call order. */
	readonly notices: PublishedNotice[];
	/** The context the framework handed the factory, once the binding ran. */
	implemented(): ImplementationContext;
	/** Delivers one native fact, exactly as the host would, with the session's context beside it. */
	deliver(event: string, payload: unknown, session: PiSurfaceSession): void;
	/** A model request starting: pi's `before_provider_request`. */
	startRequest(session: PiSurfaceSession): void;
	/** The response boundary: pi's `after_provider_response`. */
	responseArrives(session: PiSurfaceSession, http: { readonly status: number; readonly headers?: Readonly<Record<string, string>> }): void;
	/** The finalized message: pi's `message_end`. */
	messageEnds(session: PiSurfaceSession, message: PiAssistantMessage): void;
	/** A run starting: pi's `agent_start`. */
	runStarts(session: PiSurfaceSession): void;
	/** A run fully settled: pi's `agent_settled`, with the abort fact it carries. */
	runSettles(session: PiSurfaceSession, options?: { readonly aborted?: boolean }): void;
	/** A session starting: pi's `session_start`. */
	sessionStarts(session: PiSurfaceSession, reason: PiSessionStartEvent["reason"]): void;
	/** A session ending: pi's `session_shutdown`. */
	sessionShutsDown(session: PiSurfaceSession, reason: PiSessionShutdownEvent["reason"]): void;
	/** A submission: pi's `input`. */
	submits(session: PiSurfaceSession, source: PiInputEvent["source"]): void;
	/** An agent-run initiation: pi's `before_agent_start`. */
	agentStarts(session: PiSurfaceSession, messageType: PiBeforeAgentStartEvent["messageType"]): void;
	/**
	 * The host's next task, where the framework re-checks a Round's end candidate: the adapter arranges
	 * it with a zero-delay task, so a case runs it on the suite's deterministic clock.
	 */
	nextTask(): void;
}

/**
 * A bound pi surface: one definition bound through `piAdapter` to the double, with the assembly's own
 * subscriptions recording what the framework dispatched.
 *
 * `catalog` is the probe implementation's own half — the maintained data an extension answers a
 * request's price with — built from the context the framework handed the factory, exactly as the
 * extension's assembly composes the harness's own prices with its data.
 */
export function boundPiSurface(options: { readonly catalog?: (context: ImplementationContext) => CatalogPriceSource | undefined } = {}): PiSurface {
	const handlers = new Map<string, Array<(event: unknown, ctx: PiExtensionContext) => unknown>>();
	const labels: string[] = [];
	const commands = new Map<string, RegisteredCommand>();
	const entries: Array<{ customType: string; data: unknown }> = [];
	const starts: TurnStartDelivery[] = [];
	const ends: TurnEndDelivery[] = [];
	const rounds: RoundDelivery[] = [];
	const edges: RoundDelivery["event"]["kind"][] = [];
	const widgets: PublishedWidget[] = [];
	const notices: PublishedNotice[] = [];
	let implementationContext: ImplementationContext | undefined;

	const registryOf = (session: PiSurfaceSession): PiModelRegistry => ({
		getAll: () => session.catalog ?? [],
		getApiKeyForProvider: async (provider: string) => session.credentials?.[provider],
		getProvider: (provider: string) => {
			const baseUrl = session.providerBaseUrls?.[provider];
			return baseUrl === undefined ? undefined : { baseUrl };
		},
	});

	const contextOf = (session: PiSurfaceSession): PiExtensionContext => {
		const context: Record<string, unknown> = {
			sessionManager: {
				getSessionId: () => session.sessionId,
				getSessionName: () => session.name,
				getBranch: () => [],
			},
			hasUI: session.hasUI ?? true,
			ui: {
				notify: (message: string, level?: FeedbackLevel) => void notices.push({ level: level ?? "info", message }),
				setWidget: (key: string, content: readonly string[] | undefined) => void widgets.push({ key, content }),
			},
		};
		// The two quiescence facts are present exactly when this surface reports them: a case that
		// leaves one out models a host that answers nothing rather than one that answers false.
		if ("idle" in session) context.isIdle = () => session.idle === true;
		if ("pending" in session) context.hasPendingMessages = () => session.pending === true;
		if (session.model !== undefined) context.model = session.model;
		if (session.thinkingLevel !== undefined) context.thinkingLevel = session.thinkingLevel;
		if (session.catalog !== undefined) context.modelRegistry = registryOf(session);
		return context as unknown as PiExtensionContext;
	};

	// The native surface: the members the adapter registers and appends through, and nothing more.
	const api = {
		on(event: string, handler: (event: unknown, ctx: PiExtensionContext) => unknown): () => void {
			const list = handlers.get(event) ?? [];
			list.push(handler);
			handlers.set(event, list);
			return () => {
				const current = handlers.get(event);
				const index = current?.indexOf(handler) ?? -1;
				if (current !== undefined && index >= 0) current.splice(index, 1);
			};
		},
		registerCommand(name: string, registration: PiCommandRegistration): void {
			commands.set(name, registration);
		},
		appendEntry(customType: string, data?: unknown): void {
			entries.push({ customType, data });
		},
	} as unknown as PiExtensionApi;

	const factory = piAdapter(PI_SURFACE_PROBE, {
		factory: context => {
			implementationContext = context;
			const catalog = options.catalog?.(context);
			return {
				...(catalog === undefined ? {} : { catalog }),
				subscriptions: [
					{
						scope: "session",
						events: {
							turn_start: delivery => void starts.push(delivery as TurnStartDelivery),
							turn_end: delivery => void ends.push(delivery as TurnEndDelivery),
							round_start: delivery => {
								const round = delivery as RoundDelivery;
								rounds.push(round);
								edges.push(round.event.kind);
							},
							round_end: delivery => {
								const round = delivery as RoundDelivery;
								rounds.push(round);
								edges.push(round.event.kind);
							},
						},
					},
				],
			};
		},
	});
	if (!factory(api).bound) throw new Error("the pi surface probe definition did not bind");

	const deliver = (event: string, payload: unknown, session: PiSurfaceSession): void => {
		for (const handler of [...(handlers.get(event) ?? [])]) handler(payload, contextOf(session));
	};

	return {
		api,
		labels,
		commands,
		entries,
		starts,
		ends,
		rounds,
		edges,
		widgets,
		notices,
		implemented: () => {
			if (implementationContext === undefined) throw new Error("the probe factory never ran");
			return implementationContext;
		},
		deliver,
		startRequest: session => deliver("before_provider_request", { type: "before_provider_request" }, session),
		responseArrives: (session, http) =>
			deliver(
				"after_provider_response",
				{ type: "after_provider_response", status: http.status, headers: { ...(http.headers ?? {}) } },
				session,
			),
		messageEnds: (session, message) => deliver("message_end", { type: "message_end", message } satisfies PiMessageEndEvent, session),
		runStarts: session => deliver("agent_start", { type: "agent_start" } satisfies PiAgentStartEvent, session),
		runSettles: (session, options = {}) =>
			deliver("agent_settled", { type: "agent_settled", aborted: options.aborted ?? false } satisfies PiAgentSettledEvent, session),
		sessionStarts: (session, reason) => deliver("session_start", { type: "session_start", reason } satisfies PiSessionStartEvent, session),
		sessionShutsDown: (session, reason) =>
			deliver("session_shutdown", { type: "session_shutdown", reason } satisfies PiSessionShutdownEvent, session),
		submits: (session, source) => deliver("input", { type: "input", source } satisfies PiInputEvent, session),
		agentStarts: (session, messageType) =>
			deliver("before_agent_start", { type: "before_agent_start", messageType } satisfies PiBeforeAgentStartEvent, session),
		nextTask: () => vi.runAllTimers(),
	};
}
