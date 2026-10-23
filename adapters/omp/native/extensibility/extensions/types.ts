/**
 * The native OMP surfaces this adapter reads, named once and shared by the mappings that read them.
 *
 * Only the used members are named. These are the harness's own shapes — its extension API, the
 * session context its deliveries carry, the events its hooks publish and the registry its SDK
 * injects — and they stay private to this adapter tree: what the framework and an extension see is
 * the port the assembly builds from them. They live here rather than in the entry because every
 * feature module reads the same facts and none of them may depend on the assembly that wires them.
 */
import type { OmpViewedSessionFacts } from "./viewed-session";
import type { OmpUiContext } from "./ui";
import type { OmpSessionEvent, OmpSessionEventType } from "./lifecycle";
import type { OmpAgentRegistry } from "../../registry/agent-registry";
import type { OmpSessionEntry } from "../../session/session-manager";


/**
 * The native session facts the adapter reads: which session is current, what its branch
 * holds, and which UI channel its feedback has.
 */
export interface OmpSessionContext {
	/** Identity of the session the handler runs for. */
	readonly agent: {
		readonly kind: "main" | "sub";
		readonly id: string;
		/**
		 * The agent's own name, as the harness registers it — the label its roster shows.
		 *
		 * Optional: a surface that reports no agent name answers nothing here rather than being read
		 * through a private field, and the delivery then names the fact it could not obtain.
		 */
		readonly name?: string;
		readonly parentId?: string;
	};
	/** The session manager, read for the session identity and the branch entries. */
	readonly sessionManager: {
		getSessionId(): string;
		/** The entries on the current branch, root to leaf. */
		getBranch(): readonly OmpSessionEntry[];
		/**
		 * The session's latest display name, as the harness holds it.
		 *
		 * Optional: a harness surface that reports no name answers nothing here rather than being
		 * read through a private field, and the delivery then names the name as a fact it could not
		 * obtain.
		 */
		getSessionName?(): string | undefined;
		/**
		 * The harness's own notification that this session's display name changed, as the session
		 * manager publishes it; the returned function unsubscribes.
		 *
		 * It is the one pace-free fact about a session's name: a rename the operator is not looking
		 * at arrives when it happens rather than at the session's next boundary, which is what lets
		 * a per-session observation see the newest name of a session nobody is viewing. Optional: a
		 * surface whose manager reports no such change is read for the name on its other deliveries
		 * alone, and no facts delivery is synthesized for it.
		 */
		onSessionNameChanged?(listener: () => void): () => void;
	};
	/**
	 * The model this session is running, as the context reports it.
	 *
	 * It is the model of the request that is being issued when a provider hook fires, which is why
	 * the request-start mapping reads it there: a later change of the session's model must not
	 * re-attribute a request that has already been sent.
	 */
	readonly model?: { readonly id?: string; readonly provider?: string };
	/**
	 * The harness's own model catalog, as this context reports it.
	 *
	 * It is the one reading the adapter maps prices from: the models this session has available and
	 * the cost the harness's own catalog states for each. Optional, because a surface that reports
	 * no model query has no price to tell rather than a price of zero.
	 */
	readonly models?: {
		/** The models the harness has available, with the cost its own catalog states for each. */
		list(): readonly {
			/** The exact model id, as the harness resolves it. */
			readonly id?: string;
			/** The provider the harness serves this model under. */
			readonly provider?: string;
			/** What the harness states the model costs per million tokens, bucket by bucket. */
			readonly cost?: {
				readonly input?: number;
				readonly output?: number;
				readonly cacheRead?: number;
				readonly cacheWrite?: number;
			};
		}[];
	};
	/** Whether a UI is available; feedback falls back to stderr when it is not. */
	readonly hasUI: boolean;
	/** The session's UI channel, the surface both feedback and the marker area use. */
	readonly ui: OmpUiContext;
	/**
	 * Reads the session the host is displaying — this session when the host has no separate view.
	 *
	 * This is the approved host patch's public Viewed session outlet, and only the facts the adapter
	 * maps are named here: the displayed session's own identity, its agent kind and its direct
	 * parent. Optional, because a host without the patch publishes no outlet at all — the adapter
	 * then resolves no displayed session, and the framework keeps projecting the position its
	 * deliveries carry rather than inventing a seat.
	 */
	getViewedSession?(): OmpViewedSessionFacts;
	/**
	 * Subscribes to displayed-session changes — the view attaching to another session, the target
	 * becoming invalid, or that target's own facts changing — and returns the unsubscriber.
	 *
	 * A delivery is a notification, not a payload: the adapter re-reads through
	 * {@link getViewedSession} and republishes the area for the target as it stands then. Optional
	 * with the reader above.
	 */
	subscribeViewedSessionChanged?(listener: (facts: OmpViewedSessionFacts) => void): () => void;
	/**
	 * The harness's own model registry, read only for one provider's current access.
	 *
	 * Two members are named — the provider's resolved base URL and the credential it resolves for one
	 * operation — because that is what an extension's own provider query (a balance, an allowance)
	 * needs; the registry itself is never mirrored, handed over or walked. Optional, because a surface
	 * that reports no registry has no access to resolve rather than an access that always answers
	 * nothing.
	 */
	readonly modelRegistry?: {
		/** The provider's applicable base URL, as the host resolved it, when it resolved one. */
		getProviderBaseUrl?(provider: string): string | undefined;
		/**
		 * The provider's current credential for one operation, as the host resolves it, or nothing
		 * when it has none.
		 *
		 * The host mints or refreshes a credential as this call needs it, which is why the answer is
		 * awaited rather than snapshot at binding time; a provider the host marks as needing none
		 * answers its own keyless sentinel, which this adapter maps to no credential.
		 */
		getApiKeyForProvider?(provider: string, sessionId?: string): Promise<string | undefined>;
	};
	/**
	 * Whether the agent is idle — not working on a run — as the harness's own context reports it.
	 *
	 * This is the idle fact behind the framework's `canAcceptInput()` query and behind the
	 * quiescence gate that closes a round. It is optional because it is the one fact the adapter
	 * cannot observe at binding time: it exists on the context the harness builds per delivery, so
	 * a surface that reports no idle fact is answered with nothing rather than with a value
	 * fabricated on its behalf.
	 */
	isIdle?(): boolean;
	/**
	 * Whether messages are queued and waiting, which keeps a settle from being the round's end:
	 * the agent will resume on them, so the work is not over.
	 */
	hasPendingMessages?(): boolean;
	/**
	 * The session's own current context reading, as this context reports it.
	 *
	 * The adapter reads it at the framework's own collection points — the session's start, a
	 * finalized message, the run that ended — and never at binding time, because it states how full
	 * this session's conversation is *at the instant it is read*. Only the used member is named:
	 * the count of tokens the conversation holds. Optional, because a surface that publishes no
	 * such reading states none rather than a context of zero, and the framework then records no
	 * collection for it.
	 */
	getContextUsage?(): { readonly tokens?: number } | undefined;
	/**
	 * The session's asynchronous jobs, as the harness reports them; `running` names the ones still
	 * going. A job still running is work the agent has not finished, so it too keeps a round open.
	 */
	getAsyncJobSnapshot?(): { readonly running: readonly unknown[] } | null;
}

/** The native command context the adapter reads, as the OMP runner builds it.
 *
 * Only the used members are named; the runner passes the full command context, and its
 * session facts and UI channel are exactly the ones a session hook also sees.
 */
export type OmpCommandContext = OmpSessionContext;

/**
 * The native run-lifecycle event names this adapter subscribes to for the round axis.
 *
 * The harness's vocabulary is about *runs*: an agent loop starts and an agent loop ends. Neither
 * is itself a round edge — a round is the whole active period and may contain several runs — so
 * the adapter reads these two as the raw material of the synthesis, not as the edges.
 */
export type OmpRoundEventType = "agent_start" | "agent_end";

/** The native run-start event: an agent loop starting, once per user prompt. */
export interface OmpAgentStartEvent {
	readonly type: "agent_start";
}

/**
 * The native run-end event and the continuation flag it carries.
 *
 * `willContinue` is true when the session has already scheduled the next piece of work — an
 * automatic retry, an empty-stop recovery, a compaction continuation, a stop-hook turn, or a
 * pending asynchronous wake. Such a settle is a pause inside the round rather than the end of
 * it, which is why the flag is read before any other fact.
 *
 * `messages` is carried by the harness and is deliberately not named here: the framework's round
 * model has no outcome, and an extension that needs to know how the run ended reads it from its
 * own business data rather than from a round edge.
 */
export interface OmpAgentEndEvent {
	readonly type: "agent_end";
	readonly willContinue?: boolean;
}

/**
 * The native model-cycle events this adapter maps to the framework's Turn signals.
 *
 * The harness's vocabulary is about one request and one response: a request about to be sent, a
 * response whose status and headers are known before its body is consumed, a message streaming,
 * and a finalized message. None of them is itself a Turn: the harness's own `turn_end` fires after
 * the requested tools ran and is deliberately not read here, because tool execution is outside the
 * framework's Turn. Which native fact begins a Turn, which settles it, and which is only evidence
 * while the body streams is decided below, and the framework — not the adapter — decides which Turn
 * a fact belongs to.
 */
export interface OmpBeforeProviderRequestEvent {
	readonly type: "before_provider_request";
	/** The request payload the harness is about to send; deliberately unread by this adapter. */
	readonly payload: unknown;
}

/** The response boundary: the status and headers, before the response body is consumed. */
export interface OmpAfterProviderResponseEvent {
	readonly type: "after_provider_response";
	readonly status: number;
	readonly headers: Readonly<Record<string, string>>;
	/** The transport-level request id the response exposed, when it exposed one. */
	readonly requestId?: string | null;
	readonly metadata?: Readonly<Record<string, unknown>>;
}

/** The message facts this adapter reads, mapped from the harness's own message object. */
export interface OmpAgentMessage {
	readonly role?: string;
	readonly model?: string;
	readonly responseId?: string;
	readonly stopReason?: string;
	readonly errorMessage?: string;
	readonly usage?: {
		readonly input?: number;
		readonly output?: number;
		readonly cacheRead?: number;
		readonly cacheWrite?: number;
		readonly totalTokens?: number;
	};
}

/** A message starting: read only to know which turn a streamed usage reading belongs to. */
export interface OmpMessageStartEvent {
	readonly type: "message_start";
	readonly message: OmpAgentMessage;
}

/** A message streaming: the only place a usage reading observed before the response settled comes from. */
export interface OmpMessageUpdateEvent {
	readonly type: "message_update";
	readonly message: OmpAgentMessage;
}

/** A message ending.
 *
 * It fires for every message kind, so the adapter reads it only for the finalized assistant
 * response — the one message that can settle a model request/response cycle.
 */
export interface OmpMessageEndEvent {
	readonly type: "message_end";
	readonly message: OmpAgentMessage;
}

/**
 * The native submission event: one input admitted to a session, published before the harness decides
 * what the submission is.
 *
 * Only the one field this mapping reads is named. `source` is the harness's own attribution of who
 * submitted it — the interactive editor, its RPC client, or an extension submitting on its own
 * behalf — which is the one distinction the framework's input fact carries. The text and the images
 * are the harness's own material for the submission it is about to make and are deliberately not
 * read here: an input fact is not the prompt's content.
 */
export interface OmpInputEvent {
	readonly type: "input";
	readonly source: "interactive" | "rpc" | "extension";
}

/**
 * The native surface this adapter uses, as the OMP loader hands it to an extension
 * factory. Only the used members are named; the loader passes the full API.
 */
export interface OmpExtensionApi {
	/** Sets the display label for this extension. */
	setLabel(label: string): void;
	/** Registers a custom command the user can run as `/<name>`. */
	registerCommand(
		name: string,
		options: {
			description?: string;
			handler: (args: string, ctx: OmpCommandContext) => void | Promise<void>;
		},
	): void;
	/** Appends a custom entry to this session for State persistence (not sent to the model). */
	appendEntry(customType: string, data?: unknown): void;
	/** Subscribes to one session lifecycle event. */
	on(event: OmpSessionEventType, handler: (event: OmpSessionEvent, ctx: OmpSessionContext) => void): void;
	/**
	 * Subscribes to the native run-start event: the agent loop starting, once per user prompt.
	 *
	 * These two run-lifecycle events are the native facts the round axis is synthesized from; the
	 * framework's own vocabulary never appears on this surface.
	 */
	on(event: "agent_start", handler: (event: OmpAgentStartEvent, ctx: OmpSessionContext) => void): void;
	/**
	 * Subscribes to the native run-end event, which carries whether the session has already
	 * scheduled its continuation.
	 */
	on(event: "agent_end", handler: (event: OmpAgentEndEvent, ctx: OmpSessionContext) => void): void;
	/** Subscribes to the run-initiation event, the native `before_agent_start`. */
	on(event: "before_agent_start", handler: OmpRunInitiationHandler): void;
	/**
	 * Subscribes to the native model-cycle facts the Turn axis is mapped from.
	 *
	 * These are facts, not edges: the request about to be sent, the response boundary, the message
	 * streaming and the finalized message. The harness's own `turn_end` is deliberately absent —
	 * it fires once the requested tools ran, and tool execution is outside the framework's Turn.
	 */
	on(
		event: "before_provider_request",
		handler: (event: OmpBeforeProviderRequestEvent, ctx: OmpSessionContext) => void,
	): void;
	on(
		event: "after_provider_response",
		handler: (event: OmpAfterProviderResponseEvent, ctx: OmpSessionContext) => void,
	): void;
	on(event: "message_start", handler: (event: OmpMessageStartEvent, ctx: OmpSessionContext) => void): void;
	on(event: "message_update", handler: (event: OmpMessageUpdateEvent, ctx: OmpSessionContext) => void): void;
	on(event: "message_end", handler: (event: OmpMessageEndEvent, ctx: OmpSessionContext) => void): void;
	/**
	 * Subscribes to the native submission event: one input admitted to a session, whether the editor
	 * submitted it, its RPC client did, or an extension did on its own behalf.
	 *
	 * A session that must be told only about what the *user* submitted reads the event's own source
	 * fact; the framework's input hook is where that distinction is mapped, and registering for it is
	 * what makes the harness publish the fact for this binding at all.
	 */
	on(event: "input", handler: (event: OmpInputEvent, ctx: OmpSessionContext) => void): void;
	/**
	 * The bound session's actual effective thinking level, as the harness's own session reports it.
	 *
	 * It is the level the session really runs with, already resolved: a configured `auto` (or any
	 * other selector the user set) is not what this answers, which is why it is the one reading a
	 * startup fact may be built from. Optional: a surface that publishes no such getter reports no
	 * level rather than being read through a private field, and the delivery then names the fact it
	 * could not obtain.
	 */
	getThinkingLevel?(): string | undefined;
	/**
	 * The injected SDK surface (`pi.pi`).
	 *
	 * Optional because only owner resolution needs it: a top-level main session is its own
	 * owner, so an extension loaded by a harness that injects no SDK surface still runs for
	 * main sessions. Without it, no subagent's owner resolves, and a subagent therefore
	 * follows no activation instead of guessing one.
	 */
	readonly pi?: OmpSdkSurface;
	/**
	 * The harness's shared event bus, where its own subagent frames are published.
	 *
	 * This is the one native surface a fact reaches the adapter on outside any delivery of its own:
	 * the frames stating what each subagent execution had run when they were emitted, which is the
	 * only route that carries a kept-alive subagent's follow-up turns. The bus is the harness's own
	 * and is shared with every extension in the process; the adapter reads two channels from it and
	 * publishes nothing on it. Optional: a surface that publishes no bus is observed on the
	 * delegation tool's payloads alone, and an execution only the frames state is then unreported
	 * rather than guessed.
	 */
	readonly events?: OmpEventBus;
}

/** The minimal event-bus surface this adapter subscribes on: one channel's own handler, and the unsubscribe back. */
export interface OmpEventBus {
	on(channel: string, handler: (data: unknown) => void): () => void;
}

/** The native contribution payload a run-initiation handler may return. */
export interface OmpInjectedPromptMessage {
	readonly customType: string;
	readonly content: string;
	readonly display: boolean;
	readonly details?: unknown;
	readonly attribution?: "user" | "agent";
}

/** What a run-initiation handler returns: the message to append, or nothing. */
export interface OmpRunInitiationResult {
	readonly message: OmpInjectedPromptMessage;
}

/** A native run-initiation (`before_agent_start`) handler, as the loader calls it. */
export type OmpRunInitiationHandler = (
	event: unknown,
	ctx: OmpSessionContext,
) => OmpRunInitiationResult | undefined | void | Promise<OmpRunInitiationResult | undefined | void>;

/**
 * The injected SDK surface the loader attaches to the extension API (`pi.pi`).
 *
 * This is the adapter's escape hatch, and the only one it uses: resolving an owner needs
 * the harness's own agent graph rather than a framework-side copy of it. Nothing outside
 * `adapters/` may name this surface.
 */
export interface OmpSdkSurface {
	readonly AgentRegistry?: { global(): OmpAgentRegistry };
}
