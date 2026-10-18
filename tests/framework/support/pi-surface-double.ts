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
	type PiEventBus,
	type PiExtensionApi,
	type PiExtensionContext,
	type PiInputEvent,
	type PiMessageEndEvent,
	type PiModelRegistry,
	type PiSessionHeader,
	type PiSessionInfoChangedEvent,
	type PiSessionStartEvent,
	type PiSessionShutdownEvent,
	piAdapter,
} from "../../../adapters/pi";
import type {
	CatalogPriceSource,
	FeedbackLevel,
	RoundDelivery,
	SessionContextDelivery,
	SessionEventDelivery,
	TurnEndDelivery,
	TurnStartDelivery,
} from "../../../framework/core/protocol";
import type { ExtensionDefinition, ImplementationContext, InitializationDelivery } from "../../../framework/public";

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
	/**
	 * The header pi states for this session, when this surface states one.
	 *
	 * Absent models a surface that publishes no header at all, which is what leaves a session's
	 * lineage — and so its direct parent — unobtainable rather than guessed.
	 */
	readonly header?: PiSessionHeader | null;
	/** The session's current model; a case changes it to model a switch between two requests. */
	model?: { readonly id?: string; readonly provider?: string };
	/** The effective thinking level at a session's start. */
	readonly thinkingLevel?: string;
	/** The entries pi's own branch holds for this session, as the fact a beginning is read from. */
	readonly branch?: readonly PiSurfaceEntry[];
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
	/**
	 * The session's own context reading, as pi reports it, and the only member of it this surface
	 * states.
	 *
	 * `tokens` carries pi's own nullable form because pi states an unknown context that way (a `null`
	 * right after a compaction), which is not a reading: a case models both. Absent models a surface
	 * that publishes no context reading at all.
	 */
	context?: { readonly tokens?: number | null };
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

/** One entry pi's own branch holds for a session, as the fact a beginning is read from. */
export interface PiSurfaceEntry {
	readonly type?: string;
	readonly message?: { readonly role?: string };
	readonly customType?: string;
	/** What a custom entry of this extension carries, as pi recorded it (`SessionManager` branch data). */
	readonly data?: unknown;
}

/** One message the adapter published on the host's shared bus, in emission order. */
export interface PiBusEmission {
	readonly channel: string;
	readonly data: unknown;
}

/** The host's shared bus, as a case drives it: what the adapter published, and what the provider says. */
export interface PiBusSurface {
	/** Every emission the adapter made, in order. */
	readonly emissions: readonly PiBusEmission[];
	/** Publishes one message *to* the adapter, exactly as another extension in the process would. */
	publish(channel: string, data: unknown): void;
}

/**
 * The subagent provider's own published channels, as its documentation names them.
 *
 * A case drives the provider through these rather than through anything of the adapter's: it
 * announces itself on {@link PROVIDER_READY_CHANNEL} and answers a query published on
 * {@link PROVIDER_REQUEST_CHANNEL} under {@link PROVIDER_REPLY_PREFIX} plus the request's own id.
 */
export const PROVIDER_READY_CHANNEL = "subagents:rpc:v1:ready";
export const PROVIDER_REQUEST_CHANNEL = "subagents:rpc:v1:request";
export const PROVIDER_REPLY_PREFIX = "subagents:rpc:v1:reply:";

/**
 * The provider's own published session-liveness registry key and interface version, as the
 * provider's documentation names them.
 *
 * They are stated here rather than read from the adapter for the same reason the channels above are:
 * what this double drives is the provider's side of a published protocol, so it resolves and speaks
 * the version the provider itself speaks, and a case that registers through it is a case about the
 * provider's real registration rather than about the adapter's reading of one.
 */
export const SESSION_LIVENESS_REGISTRY_KEY = "@agegr/pi-web/session-liveness/v1";
export const SESSION_LIVENESS_VERSION = 1;

/** What the provider's own integration reads back from one registration attempt. */
export interface ProviderLivenessHandle {
	/** True only when a compatible host's registry accepted the registration. */
	readonly registered: boolean;
	/** Gives the registration back, exactly as the provider's own release does. */
	readonly release: () => void;
}

/**
 * Registers one provider for one session, exactly as the provider's published integration does: it
 * resolves the versioned slot this process carries, reads the interface version stated there, and
 * registers one provider naming the session it serves. A slot that is absent, another version, or
 * states no `register` function leaves the registration untaken — which is what the provider itself
 * reports as `registered: false` rather than as an inactive session.
 */
export function registerProviderLiveness(provider: {
	readonly sessionId: string;
	readonly sessionFile?: string;
	isActive(): boolean;
}): ProviderLivenessHandle {
	const registry = (globalThis as Record<PropertyKey, unknown>)[Symbol.for(SESSION_LIVENESS_REGISTRY_KEY)] as
		| { readonly version?: unknown; readonly register?: unknown }
		| undefined;
	if (registry === undefined || typeof registry.register !== "function" || registry.version !== SESSION_LIVENESS_VERSION) {
		return { registered: false, release: () => {} };
	}
	const release = (registry.register as (value: unknown) => unknown)({
		name: "pi-subagents",
		sessionId: provider.sessionId,
		...(provider.sessionFile === undefined ? {} : { sessionFile: provider.sessionFile }),
		isActive: provider.isActive,
	});
	return typeof release === "function"
		? { registered: true, release: release as () => void }
		: { registered: false, release: () => {} };
}

/** Forgets whatever session-liveness registry this process carries, so a case starts from an empty one. */
export function forgetSessionLivenessRegistry(): void {
	delete (globalThis as Record<PropertyKey, unknown>)[Symbol.for(SESSION_LIVENESS_REGISTRY_KEY)];
}

/**
 * The table this framework publishes inside its own registry, under the process-wide key a second
 * copy of its module would look for.
 *
 * A case states it here because one pi process can evaluate the framework's graph more than once —
 * each extension entrypoint gets its own module registry — and what two copies share is exactly this
 * key: a registry carrying one is this framework's, whoever evaluated it, while a registry without
 * one belongs to another host and is left alone.
 */
export const FRAMEWORK_LIVENESS_TABLE_KEY = "model-cost:pi-session-liveness:table";

/**
 * Publishes the registry one earlier evaluation of this framework's own graph left in this process.
 *
 * It is the shape that graph publishes — the provider's protocol members plus its own table keyed by
 * the session each registration names — so a case can drive the reading a second copy must find
 * rather than stand in the provider's side of the protocol again.
 */
export function publishFrameworkLivenessRegistry(
	registrations: Readonly<Record<string, () => boolean>>,
): void {
	(globalThis as Record<PropertyKey, unknown>)[Symbol.for(SESSION_LIVENESS_REGISTRY_KEY)] = {
		version: SESSION_LIVENESS_VERSION,
		register: () => () => {},
		[Symbol.for(FRAMEWORK_LIVENESS_TABLE_KEY)]: {
			registrations: new Map(
				Object.entries(registrations).map(([sessionId, isActive]) => [sessionId, { isActive }]),
			),
		},
	};
}

/** The pi native surface a loader would hand the adapter, with everything a case observes. */
export interface PiSurface {
	readonly api: PiExtensionApi;
	/** The host's shared bus, as this binding's process publishes on it. */
	readonly bus: PiBusSurface;
	/** The labels the framework set, in call order. */
	readonly labels: string[];
	/** The commands the adapter registered, by name. */
	readonly commands: Map<string, RegisteredCommand>;
	/** The non-context entries the framework appended, in call order. */
	readonly entries: Array<{ readonly customType: string; readonly data: unknown }>;
	/** The session-axis deliveries the framework dispatched, in call order. */
	readonly sessions: SessionEventDelivery[];
	/** The initialization deliveries the framework handed over, in call order. */
	readonly initializations: InitializationDelivery[];
	/** The Turn start edges the framework dispatched, in call order. */
	readonly starts: TurnStartDelivery[];
	/** The Turn end edges the framework dispatched, in call order. */
	readonly ends: TurnEndDelivery[];
	/** The Round edges the framework dispatched, in call order. */
	readonly rounds: RoundDelivery[];
	/** The Round edge kinds, in call order: the open/close sequence one case reads. */
	readonly edges: Array<RoundDelivery["event"]["kind"]>;
	/** The context edges the framework dispatched, in call order. */
	readonly contexts: SessionContextDelivery[];
	/** The widgets the framework published through this surface's UI, in call order. */
	readonly widgets: PublishedWidget[];
	/** The notices the framework published through this surface's UI, in call order. */
	readonly notices: PublishedNotice[];
	/** The context the framework handed the factory, once the binding ran. */
	implemented(): ImplementationContext;
	/**
	 * The initialization delivery the framework handed the factory, once it settled.
	 *
	 * This process's harness integration is settled *before* that delivery is handed over, so
	 * awaiting this is how a case reads the settled subagent answer an extension is told about — the
	 * one answer this process has, whatever the surface did after it settled.
	 */
	initialized(): Promise<InitializationDelivery>;
	/**
	 * The envelope the adapter published on the provider's own request channel, at `index`.
	 *
	 * It is how a case reads — and answers — a query the adapter issued without guessing when it was
	 * issued: the promise settles once that query has been published. What it carries is the envelope
	 * the provider's own documentation states, so a case replies to the query the adapter really made.
	 */
	providerRequest(index: number): Promise<Record<string, unknown>>;
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
	/** A session's name changing: pi's `session_info_changed`. */
	sessionRenames(session: PiSurfaceSession, name: string | undefined): void;
	/**
	 * A session ending: pi's `session_shutdown`, awaited as pi awaits it.
	 *
	 * pi reaches an extension's handlers for this fact one at a time and waits for each one's own
	 * promise before its teardown continues, so the answer here is the settlement of that delivery
	 * rather than the fact that the handlers were called. A case that leaves it un-awaited is modelling
	 * a host that did not wait.
	 */
	sessionShutsDown(session: PiSurfaceSession, reason: PiSessionShutdownEvent["reason"]): Promise<void>;
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
export function boundPiSurface(
	options: {
		readonly catalog?: (context: ImplementationContext) => CatalogPriceSource | undefined;
		/** The child entry this assembly requires in spawned sessions; absent models one that declares none. */
		readonly childEntry?: string;
		/**
		 * The definition this assembly binds; {@link PI_SURFACE_PROBE} when absent.
		 *
		 * A case states one when the declaration itself is the thing under test — an extension that
		 * declares State inheritance, for instance — because what the adapter does with a delivery
		 * is a reading of that declaration.
		 */
		readonly definition?: ExtensionDefinition;
		/**
		 * The work a Round's end does in the extension, when a case states one.
		 *
		 * The probe's own handler records the edge first and then runs this, so a case observes the
		 * order a host really sees: the edge reaches an extension's handler, that handler's own work runs
		 * — a session's save, which may take as long as it takes — and the host that reported the end is
		 * answered only once it settled.
		 */
		readonly onRoundEnd?: (delivery: RoundDelivery) => void | Promise<void>;
	} = {},
): PiSurface {
	const handlers = new Map<string, Array<(event: unknown, ctx: PiExtensionContext) => unknown>>();
	const labels: string[] = [];
	const commands = new Map<string, RegisteredCommand>();
	const entries: Array<{ customType: string; data: unknown }> = [];
	const sessions: SessionEventDelivery[] = [];
	const initializations: InitializationDelivery[] = [];
	const starts: TurnStartDelivery[] = [];
	const ends: TurnEndDelivery[] = [];
	const rounds: RoundDelivery[] = [];
	const edges: RoundDelivery["event"]["kind"][] = [];
	const contexts: SessionContextDelivery[] = [];
	const widgets: PublishedWidget[] = [];
	const notices: PublishedNotice[] = [];
	let implementationContext: ImplementationContext | undefined;

	// The initialization this binding's factory is handed, and the promise a case awaits it through:
	// it settles only after this process's harness integration has, so awaiting it is reading the
	// settled answer an extension is told about.
	let resolveInitialized: (() => void) | undefined;
	const initializedOnce = new Promise<void>(resolve => {
		resolveInitialized = resolve;
	});

	// The queries the adapter published on the provider's own request channel, and the cases waiting
	// for one that has not been published yet.
	const providerRequests: Record<string, unknown>[] = [];
	const requestWaiters: Array<{ readonly index: number; readonly resolve: (envelope: Record<string, unknown>) => void }> = [];
	const settleRequestWaiters = (): void => {
		for (let index = requestWaiters.length - 1; index >= 0; index--) {
			const waiter = requestWaiters[index];
			if (waiter.index >= providerRequests.length) continue;
			requestWaiters.splice(index, 1);
			waiter.resolve(providerRequests[waiter.index]);
		}
	};

	// The host's shared bus: what the adapter publishes is recorded, and what a case publishes reaches
	// the adapter's own subscriptions exactly as another extension in the process would reach them.
	const busHandlers = new Map<string, Array<(data: unknown) => void>>();
	const emissions: PiBusEmission[] = [];
	const bus: PiEventBus = {
		on: (channel, handler) => {
			const list = busHandlers.get(channel) ?? [];
			list.push(handler);
			busHandlers.set(channel, list);
			return () => {
				const current = busHandlers.get(channel);
				const index = current?.indexOf(handler) ?? -1;
				if (current !== undefined && index >= 0) current.splice(index, 1);
			};
		},
		emit: (channel, data) => {
			emissions.push({ channel, data });
			if (channel === PROVIDER_REQUEST_CHANNEL && typeof data === "object" && data !== null && !Array.isArray(data)) {
				providerRequests.push(data as Record<string, unknown>);
				settleRequestWaiters();
			}
			for (const handler of [...(busHandlers.get(channel) ?? [])]) handler(data);
		},
	};

	const registryOf = (session: PiSurfaceSession): PiModelRegistry => ({
		getAll: () => session.catalog ?? [],
		getApiKeyForProvider: async (provider: string) => session.credentials?.[provider],
		getProvider: (provider: string) => {
			const baseUrl = session.providerBaseUrls?.[provider];
			return baseUrl === undefined ? undefined : { baseUrl };
		},
	});

	const contextOf = (session: PiSurfaceSession): PiExtensionContext => {
		const sessionManager: Record<string, unknown> = {
			getSessionId: () => session.sessionId,
			getSessionName: () => session.name,
			getBranch: () => session.branch ?? [],
		};
		// The session's own header is present exactly when this surface states one: a case that leaves
		// it out models a host that reports no lineage rather than one that reports none.
		if (session.header !== undefined) sessionManager.getHeader = () => session.header ?? null;
		const context: Record<string, unknown> = {
			sessionManager,
			hasUI: session.hasUI ?? true,
			ui: {
				notify: (message: string, level?: FeedbackLevel) => void notices.push({ level: level ?? "info", message }),
				setWidget: (key: string, content: readonly string[] | undefined) => void widgets.push({ key, content }),
			},
			events: bus,
		};
		// The two quiescence facts are present exactly when this surface reports them: a case that
		// leaves one out models a host that answers nothing rather than one that answers false.
		if ("idle" in session) context.isIdle = () => session.idle === true;
		if ("pending" in session) context.hasPendingMessages = () => session.pending === true;
		if (session.model !== undefined) context.model = session.model;
		if (session.thinkingLevel !== undefined) context.thinkingLevel = session.thinkingLevel;
		if (session.catalog !== undefined) context.modelRegistry = registryOf(session);
		if (session.context !== undefined) context.getContextUsage = () => session.context;
		return context as unknown as PiExtensionContext;
	};

	// The native surface: the members the adapter registers and appends through, plus the host's own
	// shared bus — the one member this adapter reads for the subagent provider's versioned interface,
	// and the process-scoped one this surface publishes itself.
	const api = {
		events: bus,
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

	const factory = piAdapter(options.definition ?? PI_SURFACE_PROBE, {
		...(options.childEntry === undefined ? {} : { childEntry: options.childEntry }),
		factory: context => {
			implementationContext = context;
			const catalog = options.catalog?.(context);
			return {
				...(catalog === undefined ? {} : { catalog }),
				initialize: delivery => {
					initializations.push(delivery);
					resolveInitialized?.();
					resolveInitialized = undefined;
				},
				subscriptions: [
					{
						scope: "session",
						events: {
							session_start: delivery => void sessions.push(delivery as SessionEventDelivery),
							session_end: delivery => void sessions.push(delivery as SessionEventDelivery),
							session_facts: delivery => void sessions.push(delivery as SessionEventDelivery),
							turn_start: delivery => void starts.push(delivery as TurnStartDelivery),
							turn_end: delivery => void ends.push(delivery as TurnEndDelivery),
							round_start: delivery => {
								const round = delivery as RoundDelivery;
								rounds.push(round);
								edges.push(round.event.kind);
							},
							round_end: async delivery => {
								const round = delivery as RoundDelivery;
								rounds.push(round);
								edges.push(round.event.kind);
								await options.onRoundEnd?.(round);
							},
							session_context: delivery => void contexts.push(delivery as SessionContextDelivery),
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
		bus: { emissions, publish: (channel, data) => bus.emit(channel, data) },
		labels,
		commands,
		entries,
		sessions,
		initializations,
		starts,
		ends,
		rounds,
		edges,
		contexts,
		widgets,
		notices,
		implemented: () => {
			if (implementationContext === undefined) throw new Error("the probe factory never ran");
			return implementationContext;
		},
		initialized: () => initializedOnce.then(() => initializations[0]),
		providerRequest: index => {
			const published = providerRequests[index];
			if (published !== undefined) return Promise.resolve(published);
			const waiting = new Promise<Record<string, unknown>>(resolve => {
				requestWaiters.push({ index, resolve });
			});
			settleRequestWaiters();
			return waiting;
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
		sessionRenames: (session, name) =>
			deliver("session_info_changed", { type: "session_info_changed", name } satisfies PiSessionInfoChangedEvent, session),
		// pi awaits each handler for this fact before its teardown continues, so this delivery is
		// awaited too: what a case reads afterwards is what the host really had when it moved on.
		sessionShutsDown: async (session, reason) => {
			for (const handler of [...(handlers.get("session_shutdown") ?? [])]) {
				await handler({ type: "session_shutdown", reason } satisfies PiSessionShutdownEvent, contextOf(session));
			}
		},
		submits: (session, source) => deliver("input", { type: "input", source } satisfies PiInputEvent, session),
		agentStarts: (session, messageType) =>
			deliver("before_agent_start", { type: "before_agent_start", messageType } satisfies PiBeforeAgentStartEvent, session),
		nextTask: () => vi.runAllTimers(),
	};
}
