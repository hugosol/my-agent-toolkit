/**
 * The OMP adapter entry and assembly. Native mappings stay in this adapter and its
 * private feature modules under `omp/`. Turn observations own response mapping and
 * per-subscription streaming readings; Round observations own native activity signals
 * and late quiescence reads; subagent observations own payload mapping and execution
 * records. `omp/session/` owns Session/Owner facts and native Session transitions;
 * `omp/viewed-session` owns the Viewed session subscription and its release. Delivery
 * assembly, the latest context shared by observations, and binding-wide diagnostics
 * stay here. Feature-owned native types live beside their implementation and remain
 * available through this adapter entry.
 *
 * It translates the native API into the framework's port before any behavior runs and
 * translates framework outcomes back into native effects. It carries no extension
 * semantics: what to register comes from the definition, whether it may be registered
 * is decided by the harness-independent behavior, and what a command does is the
 * framework's control behavior — this file only resolves the native facts that
 * behavior needs.
 */
import { bindExtension } from "../behaviors/binding";
import { isImplementationDisposed } from "../behaviors/lifecycle";
import type { ExtensionAssembly, ExtensionImplementation, ImplementationContext } from "../core/assembly";
import { activationField, type ExtensionDefinition, statePersistence } from "../core/definition";
import type {
	BindingResult,
	CatalogPrice,
	CatalogPriceSource,
	FeedbackTransport,
	HarnessPort,
	MarkerTransport,
	NoticeTransport,
	OwnerReference,
	PromptContribution,
	ProviderAccess,
	SubagentIntegration,
} from "../core/protocol";
import { SessionObservations } from "../core/observations";
import { StateStore } from "../core/state";
import { observeRounds } from "./omp/round";
import {
	contributionIdentitiesOf,
	ownerReferenceOf,
	sessionFactsOf,
	statePayloadsOf,
} from "./omp/session/facts";
import {
	createSessionObserver,
	type OmpSessionEvent,
	type OmpSessionEventType,
} from "./omp/session/lifecycle";
import { observeTurns } from "./omp/turn";
import { createViewedSession, type OmpViewedSessionFacts } from "./omp/viewed-session";

// Native types remain available through the adapter entry consumed by harness assemblies.
export type { OmpSessionEvent, OmpSessionEventType, OmpSessionReason } from "./omp/session/lifecycle";
export type { OmpViewedSessionFacts } from "./omp/viewed-session";

/**
 * Re-exported because it is what {@link OmpExtensionFactory} returns.
 *
 * Everything an *assembly* declares lives on the public authoring surface instead
 * (`framework/public.ts`), so this module offers no assembly type of its own.
 */
export type { BindingResult } from "../core/protocol";

/**
 * The one native widget key the framework owns for its unified marker area.
 *
 * It is deliberately not derived from any definition: extensions render lines inside this
 * area, they never name the widget. The value is the area's consumer-visible identity, so
 * changing it changes where every extension's marker appears.
 */
const MARKER_AREA_KEY = "semantic-extensions";

/** The placement the framework fixes for the unified marker area. */
const MARKER_AREA_PLACEMENT = "aboveEditor";

/**
 * One session entry as the native session manager holds it.
 *
 * Only the persisted shapes the adapter recognizes are named: the State payload
 * (`type: "custom"`), the injected-prompt contribution (`type: "custom_message"`) and the
 * conversation itself (`type: "message"`). Whether a payload declares a usable value is the
 * framework's validation rule, so the adapter hands payloads over unread.
 */
export interface OmpSessionEntry {
	readonly type?: string;
	readonly customType?: string;
	/** The State record's payload (`type: "custom"`). */
	readonly data?: unknown;
	/** A persisted contribution's text and framework-owned presentation. */
	readonly content?: string;
	readonly display?: boolean;
	readonly attribution?: "user" | "agent";
	/**
	 * The message a conversation entry carries (`type: "message"`), read for its role alone.
	 *
	 * It is the fact that says a session already has a conversation of its own: a session the
	 * harness reloaded replays its messages onto the branch before it rebinds the extension, while
	 * a session that is only now beginning has none yet. Nothing here interprets the message
	 * beyond that — the role is all this adapter reads.
	 */
	readonly message?: { readonly role?: string };
}

/**
 * The native UI surface an extension context exposes. Only the used members are named;
 * they are no-ops when the session runs without a UI.
 */
export interface OmpUiContext {
	/** Shows a notification to the user. */
	notify(message: string, type?: "info" | "warning" | "error"): void;
	/** Sets one widget in the editor area, or clears it when `content` is undefined. */
	setWidget(
		key: string,
		content: readonly string[] | undefined,
		options?: { readonly placement?: "aboveEditor" | "belowEditor" },
	): void;
}

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
 * The assembly information the OMP adapter accepts: the harness-independent
 * {@link ExtensionAssembly}, unchanged.
 *
 * The adapter adds no member of its own — what an extension builds, which framework semantics it
 * depends on and where its declared configuration sits mean the same thing on any harness — and
 * an assembly therefore names no harness when it states them. Version support is deliberately not
 * among them either: support is a claim about a verified combination, recorded in the repository's
 * support record, and no assembly supplies or widens it.
 */
export type { ExtensionAssembly } from "../core/assembly";

/** The OMP extension factory an entrypoint re-exports; the loader calls it per binding. */
export type OmpExtensionFactory = (pi: OmpExtensionApi) => BindingResult;

/**
 * One agent as the harness's official registry holds it: the identity and the parent link
 * the registry itself publishes, plus the live session a resolvable owner is read from.
 */
export interface OmpAgentRef {
	readonly id: string;
	/** `"main"` for a top-level session, `"sub"` for a spawned one, `"advisor"` for an advisor. */
	readonly kind?: string;
	/** Registry id of the spawning agent; absent for a top-level session. */
	readonly parentId?: string;
	/** The live session, or null once the agent is parked and only its history remains. */
	readonly session?: {
		readonly sessionManager?: {
			getSessionId(): string;
			/** The session's own latest display name, when this host publishes one. */
			getSessionName?(): string | undefined;
		};
	} | null;
}

/** The harness's process-wide agent registry: the official graph of who spawned whom. */
export interface OmpAgentRegistry {
	get(id: string): OmpAgentRef | undefined;
}

/**
 * The injected SDK surface the loader attaches to the extension API (`pi.pi`).
 *
 * This is the adapter's escape hatch, and the only one it uses: resolving an owner needs
 * the harness's own agent graph rather than a framework-side copy of it. Nothing outside
 * `framework/adapters/` may name this surface.
 */
export interface OmpSdkSurface {
	readonly AgentRegistry?: { global(): OmpAgentRegistry };
}


/**
 * The currency and unit the harness states its own model costs in.
 *
 * The harness's catalog carries the amounts alone, and its own usage readout is what prints them:
 * both are US dollars per million tokens, which is the unit the framework's catalog price carries
 * opaquely.
 */
const HARNESS_PRICE_CURRENCY = "USD";
const HARNESS_PRICE_UNIT = "USD/百万 token";

/** The buckets a harness states a model's cost in, in the framework's own bucket vocabulary. */
const HARNESS_COST_BUCKETS = ["input", "cacheRead", "cacheWrite", "output"] as const;

/**
 * The price the harness's own catalog states for one provider and exact model id.
 *
 * The mapping is the identity between two statements of the same fact — the harness's cost per
 * million tokens in its four buckets, and the framework's own catalog price — plus the unit the
 * harness reads in. A pair the catalog does not carry answers nothing, and so does a model every
 * one of whose stated amounts is zero: an amount the harness never stated is not a price of zero,
 * and carrying one would look like a real, free request.
 */
function harnessPriceOf(
	catalog: OmpSessionContext["models"],
	provider: string,
	model: string,
): CatalogPrice | undefined {
	const entry = catalog?.list().find(row => row.id === model && row.provider === provider);
	const cost = entry?.cost;
	if (cost === undefined) return undefined;
	const amounts: Record<string, number> = {};
	for (const bucket of HARNESS_COST_BUCKETS) {
		const amount = cost[bucket];
		if (typeof amount === "number" && Number.isFinite(amount)) amounts[bucket] = amount;
	}
	if (Object.values(amounts).every(amount => amount === 0)) return undefined;
	return { currency: HARNESS_PRICE_CURRENCY, unit: HARNESS_PRICE_UNIT, amounts };
}

/** The harness's own model prices, and the live context reading they are answered from. */
interface HarnessModelPrices {
	/** The query the framework hands the implementation factory and snapshots at a request's start. */
	readonly prices: CatalogPriceSource;
	/** Records the model catalog of the context one delivery came from. */
	saw(ctx: OmpSessionContext): void;
}
/**
 * The harness's own model prices, read through the session contexts this process's bindings see.
 *
 * The harness's model catalog is a fact of the process, but the only reading the extension surface
 * offers is the model query a live session context carries, so this keeps the query of the newest
 * context a delivery came from and answers every later question from it: the framework snapshots the
 * answer at a request's real start, and the extension's frontend asks again whenever it draws. A
 * price asked for before any context was reported answers nothing rather than a guess.
 *
 * What leaves this module is that plain query. The contexts it was read from stay here: no native
 * model, registry or context is handed to the framework or to an extension.
 */
function harnessModelPrices(): HarnessModelPrices {
	let newest: OmpSessionContext["models"];
	return {
		prices: { priceOf: (provider, model) => harnessPriceOf(newest, provider, model) },
		saw: ctx => {
			if (ctx.models !== undefined) newest = ctx.models;
		},
	};
}

/**
 * The credential the harness reports for a provider that needs none.
 *
 * The registry answers this sentinel rather than `undefined` for a keyless provider, so it is a
 * native convention meaning *no credential* and not a credential made of three letters. Mapping it
 * away here keeps that native detail out of the framework's facts: an extension that needs a
 * credential is told there is none rather than handed a value it would send as one.
 */
const KEYLESS_CREDENTIAL = "N/A";

/** The harness's own provider access, and the live registry reading it is answered from. */
interface HarnessProviderAccess {
	/** The query the framework hands the implementation factory and asks once per operation. */
	readonly access: ProviderAccess;
	/** Records the model registry of the context one delivery came from. */
	saw(ctx: OmpSessionContext): void;
}

/**
 * The harness's own provider access, read through the session contexts this process's bindings see.
 *
 * The credentials and the provider addresses are facts of the host, and the reading the extension
 * surface offers is the registry a live session context carries, so this keeps the registry of the
 * newest context a delivery came from and asks *it* at each later operation: a credential the host
 * has since replaced, or minted on demand, is what the extension gets, because nothing here is
 * snapshot at binding time. The registry object is the host's own and its answers are current; what
 * crosses into the framework is the plain two-member query and never the registry itself.
 *
 * The address is read synchronously — the registry resolves it from its own overrides and models —
 * while the credential is awaited, because the host refreshes and mints one as the call needs it. A
 * context that reported no registry, or a registry that answers neither member, leaves the facts
 * absent: the extension is told the host has no access to that provider rather than being handed a
 * guess, another provider's credential or an empty string.
 */
function harnessProviderAccess(): HarnessProviderAccess {
	let newest: OmpSessionContext["modelRegistry"];
	return {
		access: {
			resolve: async provider => {
				if (newest === undefined) return undefined;
				const baseUrl = newest.getProviderBaseUrl?.(provider);
				const resolved = await newest.getApiKeyForProvider?.(provider);
				const credential = resolved === undefined || resolved === KEYLESS_CREDENTIAL ? undefined : resolved;
				if (baseUrl === undefined && credential === undefined) return undefined;
				return {
					...(baseUrl === undefined ? {} : { baseUrl }),
					...(credential === undefined ? {} : { credential }),
				};
			},
		},
		saw: ctx => {
			if (ctx.modelRegistry !== undefined) newest = ctx.modelRegistry;
		},
	};
}

/**
 * Publishes one operator-facing line on the session's own channel: the UI notification
 * when the session has a UI, and one stderr line when it does not.
 *
 * Both channels are outside model context — this is feedback for the operator, never an
 * injected prompt, a conversation entry or tool output — so the framework's own notices
 * (a warning) and an extension's feedback (an `info` or an `error`) travel the same way and
 * differ only in the severity the UI shows.
 */
function publishNotice(
	ctx: OmpSessionContext,
	level: "info" | "warning" | "error",
	message: string,
): void {
	if (ctx.hasUI) ctx.ui.notify(message, level);
	else process.stderr.write(`${message}\n`);
}

/**
 * The framework's port onto OMP, bound to one session and the extension's State key.
 */
function ompPort(
	pi: OmpExtensionApi,
	definition: ExtensionDefinition,
	harnessPrices: HarnessModelPrices,
	harnessAccess: HarnessProviderAccess,
): HarnessPort {
	const stateEntryType = `${definition.id}:state`;
	// At most one ownerless diagnostic per binding: the first delivery that resolves no
	// owner reports it, and every later one stays quiet.
	let reportedOwnerless = false;

	// Startup happens before any UI exists, so the diagnostic goes to stderr: it is
	// user-visible and can never reach model context.
	const reportDiagnostic = (message: string): void => {
		process.stderr.write(`${message}\n`);
	};

	/**
	 * Records the model catalog of the context one delivery came from, and hands that context back.
	 *
	 * A harness's model catalog is readable only through a live context, while the price it states
	 * is asked for later and from outside every delivery: the framework snapshots it at a request's
	 * real start, and the extension's frontend reads it when it draws. The newest context is
	 * therefore what answers, and this is where each delivery reports its own. The harness's
	 * displayed session is read through the same contexts for the same reason: the outlet lives on
	 * them, so the newest one is what the framework reads and subscribes through.
	 */
	const catalogued = (ctx: OmpSessionContext): OmpSessionContext => {
		harnessPrices.saw(ctx);
		harnessAccess.saw(ctx);
		newestContext = ctx;
		watchViewedSession(ctx);
		return ctx;
	};

	/**
	 * The newest session context a delivery of this binding came from: a live context, never a copied
	 * fact, and `undefined` before this binding's first delivery. Two facts are read through it — the
	 * session the host is displaying, and the session this binding serves when the harness's own
	 * frames arrive outside any delivery of their own.
	 */
	let newestContext: OmpSessionContext | undefined;

	/**
	 * The marker area's transport for one delivery: the framework-owned widget of this
	 * session, where an empty line list clears the area.
	 *
	 * A session without a UI renders no area at all. The marker is a UI-only surface with
	 * no textual equivalent, so its whole path is a no-op there rather than a diagnostic.
	 */
	const markerTransport = (ctx: OmpSessionContext): MarkerTransport => ({
		publishMarkers: lines => {
			if (!ctx.hasUI) return;
			ctx.ui.setWidget(MARKER_AREA_KEY, lines.length > 0 ? [...lines] : undefined, {
				placement: MARKER_AREA_PLACEMENT,
			});
		},
	});

	/**
	 * The notice channel for one session: a warning-level UI notification when the session
	 * has a UI, and one stderr line when it does not. Neither is model context — a notice
	 * is feedback for the operator, never an injected prompt or a conversation entry.
	 */
	const noticeTransport = (ctx: OmpSessionContext): NoticeTransport => ({
		warn: message => publishNotice(ctx, "warning", message),
	});

	/**
	 * The extension feedback channel for one session.
	 *
	 * The level travels to the UI as the severity the extension chose, so an `error` reads
	 * as an error and an `info` as information; a session without a UI gets the same
	 * message on stderr whatever the level, because a level names how serious a notice is,
	 * not which channel it uses. Nothing here touches model context either.
	 */
	const feedbackTransport = (ctx: OmpSessionContext): FeedbackTransport => ({
		notify: (level, message) => publishNotice(ctx, level, message),
	});

	const ownerOf = (ctx: OmpSessionContext): OwnerReference => {
		const owner = ownerReferenceOf(pi, ctx);
		if (owner.kind === "unresolved" && !reportedOwnerless) {
			reportedOwnerless = true;
			// Best-effort and user-visible only: the extension stays bound and keeps running.
			reportDiagnostic(
				`${definition.id}: no owning main session resolved for this session; the extension stays off`,
			);
		}
		return owner;
	};

	// At most one report per native fact, per binding: the first delivery that finds a fact this
	// harness does not report says so on the non-model channel, and every later one stays quiet.
	const reportedMissingFacts = new Set<string>();
	const reportMissingFact = (fact: string): undefined => {
		if (!reportedMissingFacts.has(fact)) {
			reportedMissingFacts.add(fact);
			reportDiagnostic(
				`${definition.id}: this harness reports no ${fact}; the framework answers nothing rather than inventing one`,
			);
		}
		return undefined;
	};

	const observeSession = createSessionObserver(pi, ownerOf);
	const { viewedSession, watch: watchViewedSession } = createViewedSession(pi, () => newestContext, markerTransport);

	/** Whether the agent can take input now, or `undefined` when this context reports no idle fact. */
	const canAcceptInputOf = (ctx: OmpSessionContext): boolean | undefined => {
		if (typeof ctx.isIdle !== "function") return reportMissingFact("idle fact (isIdle)");
		return ctx.isIdle();
	};

	return {
		setLabel: label => pi.setLabel(label),
		reportDiagnostic,
		modelPrices: harnessPrices.prices,
		providerAccess: harnessAccess.access,
		viewedSession,
		// This harness integrates subagent observations itself: its own delegation tool and agent
		// registry are the facts the subagent axes are mapped from, so there is no provider to reach
		// and none to fail — the answer is the integrated shape itself, and nothing waits for it.
		subagentIntegration: () => ({ mode: "subagents" }) satisfies SubagentIntegration,
		onSession: handler => {
			observeSession((event, owner, ctx) => {
				catalogued(ctx);
				handler({
					event,
					// One start delivery is the session's own beginning in this process, and it is the one
					// whose readings are the session's startup facts; every other delivery reports none —
					// and a start that proves no beginning (a resume, a fork, a session whose own branch
					// already carries a conversation) reports none either.
					session: sessionFactsOf(pi, ctx, event.kind === "session_start" ? event.reason : undefined),
					owner,
					statePayloads: statePayloadsOf(ctx, stateEntryType),
					// The same medium the command path records State through: an entry this
					// binding's session carries, written by the capability a start delivery hands
					// out once that owner's effects write their own declared value.
					persist: values => {
						pi.appendEntry(stateEntryType, values);
					},
					hasUI: ctx.hasUI,
					feedback: feedbackTransport(ctx),
					notices: noticeTransport(ctx),
					markers: markerTransport(ctx),
				});
			});
		},
		onRound: observer => {
			observeRounds(pi, observer, {
				frame: ctx => {
					catalogued(ctx);
					return {
						session: sessionFactsOf(pi, ctx),
						owner: ownerOf(ctx),
						hasUI: ctx.hasUI,
						feedback: feedbackTransport(ctx),
					};
				},
				reportMissingFact,
			});
		},
		onSessionContext: handler => {
			/**
			 * One collection: the session's own context as the host reports it now, framed with the
			 * facts of the delivery it was read in.
			 *
			 * A count this surface did not state is no reading at all — "no count" is not a context of
			 * nothing — so nothing is reported for it, exactly as the framework's own `Unknown` rule
			 * requires. The model travels with the reading because the figure is displayed against that
			 * model's channel budget, and never against the host's own context window.
			 */
			const collect = (ctx: OmpSessionContext): void => {
				const usage = ctx.getContextUsage?.();
				if (usage?.tokens === undefined) return;
				handler({
					session: sessionFactsOf(pi, ctx),
					owner: ownerOf(catalogued(ctx)),
					reading: {
						tokens: usage.tokens,
						...(ctx.model?.provider === undefined ? {} : { provider: ctx.model.provider }),
						...(ctx.model?.id === undefined ? {} : { model: ctx.model.id }),
					},
					hasUI: ctx.hasUI,
					feedback: feedbackTransport(ctx),
				});
			};
			// The three native facts a session's own context reading really moves at: the start that
			// establishes the first one, the finalized message the conversation grows by, and the run
			// that ended — a compaction the run itself decided happens before that end. These are the
			// adapter's own collection points; nothing here decides which of them is a change, so the
			// same reading read twice is reported twice and the framework drops the repeat.
			pi.on("session_start", (_event, ctx) => collect(ctx));
			pi.on("message_end", (_event, ctx) => collect(ctx));
			pi.on("agent_end", (_event, ctx) => collect(ctx));
		},
		nextTask: callback => {
			// The harness's next task: a macrotask that runs after this callback returned and after
			// everything already queued — the session's own unwinding and any input it drained — has
			// had its turn. Nothing here waits on a duration or repeats.
			setTimeout(callback, 0);
		},
		onUserInput: handler => {
			// The adapter's whole job on this axis: read the one fact the harness states about who
			// submitted the input, and report the submission as the user's input when it is the user's.
			// A submission an extension made on its own behalf is deliberately not one — the harness
			// itself distinguishes the two, and reading that distinction is what keeps an agent's own
			// input from being reported as the user's.
			//
			// A harness surface that refuses the registration publishes no submission event at all. That
			// is the honest absence and it is reported as such: the framework then reports no user input
			// rather than inferring one from some other fact, and everything else in the binding runs
			// unchanged.
			try {
				pi.on("input", (event, ctx) => {
					if (event.source === "extension") return;
					catalogued(ctx);
					handler({
						event: { kind: "user_input" },
						owner: ownerOf(catalogued(ctx)),
						session: sessionFactsOf(pi, ctx),
						hasUI: ctx.hasUI,
						feedback: feedbackTransport(ctx),
					});
				});
			} catch (error) {
				const detail = error instanceof Error ? error.message : String(error);
				reportDiagnostic(
					`${definition.id}: this harness publishes no submission event (input); the framework reports no user input rather than inventing one (${detail})`,
				);
			}
		},
		onTurn: handler => {
			observeTurns(pi, handler, {
				frame: ctx => ({
					owner: ownerOf(catalogued(ctx)),
					hasUI: ctx.hasUI,
					feedback: feedbackTransport(ctx),
				}),
				session: ctx => sessionFactsOf(pi, ctx),
				reportMissingFact,
			});
		},
		onRunInitiation: handler => {
			pi.on("before_agent_start", (_event, ctx) => {
				const contribution = handler({
					owner: ownerOf(catalogued(ctx)),
					contributionIdentities: contributionIdentitiesOf(ctx),
					markers: markerTransport(ctx),
				});
				// The framework fixed the contribution's visibility, position and attribution;
				// this adapter only writes them into the native payload the loader commits.
				const commit = (planned: PromptContribution | undefined): OmpRunInitiationResult | undefined =>
					planned === undefined
						? undefined
						: {
								message: {
									customType: planned.identity,
									content: planned.content,
									display: planned.display,
									attribution: planned.attribution,
								},
							};
				// A handler that is waiting for a one-time initialization returns a promise, and the
				// harness awaits this hook before it issues the model request: handing the promise
				// back is what makes the first request wait for the initialization to settle.
				return contribution instanceof Promise ? contribution.then(commit) : commit(contribution);
			});
		},
		registerCommand: command => {
			pi.registerCommand(command.name, {
				description: command.description,
				handler: (args, ctx) => {
					// An `actions` command's effect is awaited by the harness's own command chain, so
					// the operator's command concludes with the effect rather than beside it; every
					// other control kind concludes synchronously and returns nothing.
					return command.run({
						args,
						owner: ownerOf(catalogued(ctx)),
						// Only the owner's own session reaches the write path, so persisting
						// through this binding's API always records the owner's session.
						persist: values => {
							pi.appendEntry(stateEntryType, values);
						},
						// Feedback is user-visible only: on the UI at the notice's own
						// severity when the session has one, and on stderr when it has not.
						hasUI: ctx.hasUI,
						// The arm path's initial fact, asked of the session that is running the
						// command rather than carried by an event that may never have happened.
						canAcceptInput: () => canAcceptInputOf(ctx),
						// The session's own current model, read here as a fact rather than derived
						// from the last request: an extension restricting an action to one provider
						// reads this, and a context reporting no model answers nothing.
						provider: ctx.model?.provider,
						feedback: feedbackTransport(ctx),
						markers: markerTransport(ctx),
					});
				},
			});
		},
	};
}

/**
 * Assembles a definition for OMP.
 *
 * The returned factory binds the definition to whichever session calls it; a refused
 * definition reports its conflicts and contributes nothing, and the harness
 * continues. The State store is created once here — at module load, so once per
 * extension per process — and shared by every session binding, which is what lets
 * bindings agree on one current value per owner. The assembly's implementation factory is
 * called once here as well: the first binding that gets far enough hands it the validated
 * configuration, and every later binding reuses what it built, so a new session, a subagent or a
 * view change never constructs a second business instance. The one thing that ends that reuse is
 * the instance's own disposal: once its cleanup has run, it is spent, and the next binding builds
 * a fresh instance rather than handing a closed one to an extension that believes it is starting
 * fresh. An assembly that wants the instance to be the process's creates its adapter once, at
 * module load, as `entrypoints/omp` does.
 *
 * The assembly an adapter binds is harness-independent: what the extension builds
 * (`factory`), the semantics its extension declares (`requiredSemantics`) and where its declared
 * configuration is resolved from (`configBaseDir`). An extension that needs none of them
 * assembles with no options at all. Nothing here is judged at binding: the declared semantics are
 * verification input, and a binding performs no harness-version or capability-shape check.
 */
export function ompAdapter(definition: ExtensionDefinition, options: ExtensionAssembly = {}): OmpExtensionFactory {
	// Every session this harness runs — a subagent's included — is a binding in this process, so an
	// owner's declared values are always read here and the store is built with no local access: no
	// endpoint is bound and no location record is published. A harness that can run a session in
	// another process is the one that supplies one (see `piAdapter`).
	const state = new StateStore({
		field: activationField(definition),
		persistence: statePersistence(definition),
	});
	// The process's one session observation source, for the same reason and at the same place: every
	// session this harness runs is a binding in this process, and the readings their adapter hooks
	// collect belong to one record rather than to the binding that happened to report them. It is
	// what an extension reads for a session whose delivery it attached after — and it survives a
	// binding's disposal, so a rebuilt instance reads what this process already observed instead of
	// starting blind.
	const observations = new SessionObservations();
	// The harness's own model prices, one set for the whole process: every binding of this assembly
	// records the model catalog of the contexts its own deliveries come from, and the query the
	// framework hands an extension's factory answers from the newest of them. It lives here rather
	// than in a port because a port is one binding, while the catalog it reads is the process's.
	const harnessPrices = harnessModelPrices();
	// The harness's own access to its providers, one query for the whole process for the same reason:
	// the credentials and addresses are the host's, and every binding's deliveries report the registry
	// they were read from.
	const harnessAccess = harnessProviderAccess();
	let implementation: ExtensionImplementation | undefined;
	const resolveImplementation = (context: ImplementationContext): ExtensionImplementation => {
		// A disposed implementation is spent — its cleanup closed whatever it held — so a binding
		// that arrives after it is not a reason to hand it over again; the assembly's factory builds
		// the fresh instance this binding's extension starts from.
		if (implementation !== undefined && !isImplementationDisposed(implementation)) return implementation;
		implementation = options.factory === undefined ? {} : options.factory(context);
		return implementation;
	};
	return (pi: OmpExtensionApi): BindingResult =>
		bindExtension(
			definition,
			ompPort(pi, definition, harnessPrices, harnessAccess),
			state,
			observations,
			resolveImplementation,
			// The one thing this assembly knows about the configuration that the framework cannot:
			// the repository its definition's relative declaration is relative to.
			{ baseDir: options.configBaseDir },
		);
}
