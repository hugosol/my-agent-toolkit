/**
 * pi's native surface, as far as this adapter reads it.
 *
 * Every member named here is structural: the harness stays a loader-provided runtime dependency,
 * and no host module is imported to state a fact about it. The types are the adapter's public
 * native vocabulary — extensions that draw pi's own widgets describe their input with them — so
 * they live beside the mapping rather than inside the assembly entry.
 */
import type { FeedbackLevel } from "../../../framework/interface/feedback";
import type { BindingResult } from "../../../framework/core/protocol";

// Structural native types keep the harness a loader-provided runtime dependency.
export interface PiSessionEntry {
	readonly type?: string;
	readonly customType?: string;
	readonly data?: unknown;
	readonly message?: { readonly role?: string };
}
export interface PiSessionManager {
	getSessionId(): string;
	getSessionName(): string | undefined;
	getBranch(): readonly PiSessionEntry[];
	/**
	 * The header pi writes for this session, when this surface publishes one.
	 *
	 * It is pi's own statement about the session: the identity it was created under and the session
	 * file it was built from, when it was built from one. A surface that reports none leaves a
	 * session's lineage, and so its direct parent, unavailable rather than guessed.
	 */
	getHeader?(): PiSessionHeader | null;
}
/**
 * The header pi writes for one session, as far as this adapter reads it.
 *
 * `parentSession` is the native lineage link pi states for a session it stood up from another one:
 * the *session file* the session was built from, which is where a direct parent's own identity is
 * read from. It is a file the way pi states it, never an id, and this adapter resolves the id from
 * that file's own header rather than from its name.
 */
export interface PiSessionHeader {
	readonly type?: string;
	readonly id?: string;
	readonly parentSession?: string;
}
/** One session file's own anchor: the identity and the lineage link its header states. */
export interface PiSessionAnchor {
	readonly id?: string;
	readonly parentSession?: string;
}
/**
 * pi's shared event bus: how extensions in one process speak to each other.
 *
 * The framework's pi adapter reads one versioned interface from it — the subagent provider's own
 * announcement and query pair — and publishes nothing of its own on it. A surface that publishes no
 * bus is a process in which no provider can be reached, which is answered as a provider this entry
 * does not have rather than as one that failed.
 */
export interface PiEventBus {
	on(channel: string, handler: (data: unknown) => void): () => void;
	emit(channel: string, data: unknown): void;
}
export interface PiModel {
	readonly id?: string;
	readonly provider?: string;
}
/**
 * One model as pi's own registry holds it: the identity a request is attributed to, and the cost the
 * registry states per million tokens.
 *
 * Only the members this adapter reads are named — both cost halves and the one place a base URL is
 * resolved from are pi's own facts, and the framework never sees the registry itself.
 */
export interface PiCatalogModel {
	readonly id?: string;
	readonly provider?: string;
	/** The model's address, as the registry resolved it from the provider's configuration. */
	readonly baseUrl?: string;
	/** The USD-per-million-token rates this catalog states, when it states any. */
	readonly cost?: {
		readonly input?: number;
		readonly output?: number;
		readonly cacheRead?: number;
		readonly cacheWrite?: number;
	};
}
/**
 * pi's model registry, as the one party that knows a provider's current address and credential.
 *
 * Both readings are queried per operation rather than snapshotted: a credential the host has since
 * replaced is what the next query gets, which is the same rule the framework's own provider-access
 * fact states.
 */
export interface PiModelRegistry {
	/** Every model the registry currently knows, for the catalog prices and their addresses. */
	getAll(): readonly PiCatalogModel[];
	/** The credential pi resolves for one provider, or `undefined` when it has none. */
	getApiKeyForProvider(provider: string): Promise<string | undefined>;
	/** The provider's own entry, read for the address it states. */
	getProvider(provider: string): { readonly baseUrl?: string } | undefined;
}
/** The usage one assistant message carried, as pi's own five figures. */
export interface PiMessageUsage {
	readonly input?: number;
	readonly output?: number;
	readonly cacheRead?: number;
	readonly cacheWrite?: number;
	readonly totalTokens?: number;
}
/** The finalized assistant message one `message_end` carried, as far as this adapter reads it. */
export interface PiAssistantMessage {
	readonly role?: string;
	readonly stopReason?: string;
	readonly errorMessage?: string;
	readonly responseId?: string;
	readonly usage?: PiMessageUsage;
}
/** One message fact, whichever kind of message ended. */
export interface PiMessageEndEvent {
	readonly type: "message_end";
	readonly message: PiAssistantMessage;
}
/** The request fact pi publishes before a provider call, whose payload this adapter does not read. */
export interface PiBeforeProviderRequestEvent {
	readonly type: "before_provider_request";
}
/** The response boundary pi publishes before the response body is consumed. */
export interface PiAfterProviderResponseEvent {
	readonly type: "after_provider_response";
	readonly status: number;
	readonly headers: Record<string, string>;
}
/** The fact that pi's agent loop started. */
export interface PiAgentStartEvent {
	readonly type: "agent_start";
}
/** The fact that pi's agent run fully settled, with nothing left to continue it. */
export interface PiAgentSettledEvent {
	readonly type: "agent_settled";
	/** Whether the run ended because it was aborted. */
	readonly aborted: boolean;
}
/** One submission pi admitted, published before it decided what the submission is. */
export interface PiInputEvent {
	readonly type: "input";
	/** pi's own attribution of who submitted it. */
	readonly source: "interactive" | "rpc" | "extension";
}
/**
 * How the run an extension context belongs to draws what an extension hands it.
 *
 * pi states it per context and documents `tui` as the mode terminal-only UI has to be guarded by: a
 * widget handed to a `tui` run is a component the CLI draws itself, at the viewport width and with the
 * theme of the moment, while a run that is not `tui` takes the plain lines of a widget — and the RPC
 * mode states outright that it ignores a component factory rather than drawing one.
 */
export type PiExtensionMode = "tui" | "rpc" | "json" | "print";
export interface PiWidgetOptions {
	readonly placement?: "aboveEditor" | "belowEditor";
}
/**
 * The theme a component factory is handed, as far as this surface names it.
 *
 * Only the two members an extension that draws text of its own uses are named: a colour token of the
 * host's theme, and the colour one thinking level is drawn with. Both are the host's own facts and are
 * read at drawing time, so a theme change reaches a component the host asks to draw again.
 */
export interface PiWidgetTheme {
	fg(color: string, text: string): string;
	getThinkingBorderColor(level: string): (text: string) => string;
}
/**
 * The component a widget factory answers with: the lines the host draws at one viewport width, and the
 * invalidation the host calls when its theme changed.
 *
 * A component that draws a read-only result holds nothing to repair — its lines are rebuilt from the
 * display result of the moment — so `invalidate` is the host's own hook and nothing has to be dropped
 * behind it. `dispose` is what the host calls when a widget is replaced or cleared.
 */
export interface PiWidgetComponent {
	render(width: number): string[];
	invalidate(): void;
	dispose?(): void;
}
/**
 * One widget in the component form: the factory the host calls for a component, handed its own
 * terminal surface and its own theme.
 *
 * The terminal surface is stated as `unknown` because nothing on these lines is read from it: what a
 * component of this extension needs from the host is the width and the theme it is handed.
 */
export type PiWidgetComponentFactory = (tui: unknown, theme: PiWidgetTheme) => PiWidgetComponent;
export interface PiUiContext {
	notify(message: string, type?: FeedbackLevel): void;
	setWidget(key: string, content: readonly string[] | undefined, options?: PiWidgetOptions): void;
	setWidget(key: string, content: PiWidgetComponentFactory | undefined, options?: PiWidgetOptions): void;
}
export interface PiExtensionContext {
	readonly sessionManager: PiSessionManager;
	readonly model?: PiModel;
	readonly thinkingLevel?: string;
	/** The run mode this context belongs to, when this surface publishes it. */
	readonly mode?: PiExtensionMode;
	readonly hasUI: boolean;
	readonly ui: PiUiContext;
	/**
	 * pi's model registry, when this surface publishes one.
	 *
	 * Optional because the adapter names only the members its own mapping uses: a registry that is not
	 * there leaves the harness's model prices unanswered and their provider access unresolved rather
	 * than being guessed from another source.
	 */
	readonly modelRegistry?: PiModelRegistry;
	/** Whether pi itself is working or compacting right now. */
	isIdle(): boolean;
	/** Whether a submitted message is still waiting to be taken up. */
	hasPendingMessages(): boolean;
	/**
	 * The session's own current context reading, as pi reports it, or nothing when this surface
	 * publishes none.
	 *
	 * It is read by an extension's own frontend — the figure it draws beside a session's consumption —
	 * and never handed to the framework: the framework's own facts are the request, the response and
	 * the session, not the host's context accounting.
	 *
	 * `tokens` carries pi's own nullable form because pi states an *unknown* context that way — right
	 * after a compaction, before the next response establishes a reading — so a caller that draws it
	 * must treat a null as no reading rather than as a count of zero.
	 */
	getContextUsage?(): { readonly tokens?: number | null; readonly contextWindow?: number } | undefined;
}
export type PiSessionStartReason = "startup" | "reload" | "new" | "resume" | "fork";
export interface PiSessionStartEvent {
	readonly type: "session_start";
	readonly reason: PiSessionStartReason;
}
export type PiSessionShutdownReason = "quit" | "reload" | "new" | "resume" | "fork";
export interface PiSessionShutdownEvent {
	readonly type: "session_shutdown";
	readonly reason: PiSessionShutdownReason;
}
/** The fact that a session's display name changed, as pi publishes it. */
export interface PiSessionInfoChangedEvent {
	readonly type: "session_info_changed";
	/** The session's current name, absent when pi states that the name was cleared. */
	readonly name?: string;
}
/** The native notification that the current model selection changed. */
export interface PiModelSelectEvent {
	readonly type: "model_select";
}
export type PiSessionEventHandler<E> = (event: E, ctx: PiExtensionContext) => void;
export interface PiBeforeAgentStartEvent {
	readonly type: "before_agent_start";
	readonly messageType: "user" | "custom";
}
export interface PiInjectedPromptMessage {
	readonly customType: string;
	readonly content: string;
	readonly display: boolean;
}
export interface PiRunInitiationResult {
	readonly message: PiInjectedPromptMessage;
}
export type PiRunInitiationHandler = (
	event: PiBeforeAgentStartEvent,
	ctx: PiExtensionContext,
) => PiRunInitiationResult | undefined | void | Promise<PiRunInitiationResult | undefined | void>;
export interface PiCommandRegistration {
	readonly description?: string;
	readonly handler: (args: string, ctx: PiExtensionContext) => Promise<void>;
}
export interface PiExtensionApi {
	on(event: "session_start", handler: PiSessionEventHandler<PiSessionStartEvent>): () => void;
	on(event: "model_select", handler: PiSessionEventHandler<PiModelSelectEvent>): () => void;
	on(event: "session_shutdown", handler: PiSessionEventHandler<PiSessionShutdownEvent>): () => void;
	on(event: "before_agent_start", handler: PiRunInitiationHandler): () => void;
	/**
	 * Subscribes to the native run-cycle facts the round axis is mapped from.
	 *
	 * `agent_start` is pi's agent loop beginning, whether from a fresh prompt or from a continuation
	 * pi scheduled for itself; `agent_settled` is that run fully settled, which pi publishes only once
	 * no automatic retry, compaction or queued continuation is left to run. A level below them —
	 * `agent_end` — fires before those continuations are decided and is deliberately not part of this
	 * surface.
	 */
	on(event: "agent_start", handler: PiSessionEventHandler<PiAgentStartEvent>): () => void;
	on(event: "agent_settled", handler: PiSessionEventHandler<PiAgentSettledEvent>): () => void;
	/**
	 * Subscribes to the native model-cycle facts the Turn axis is mapped from: the request about to be
	 * sent, the response boundary, and the finalized message. pi's own `turn_start`/`turn_end` are
	 * deliberately absent — its turn ends after the requested tools ran, and tool execution is outside
	 * a Turn.
	 */
	on(event: "before_provider_request", handler: PiSessionEventHandler<PiBeforeProviderRequestEvent>): () => void;
	on(event: "after_provider_response", handler: PiSessionEventHandler<PiAfterProviderResponseEvent>): () => void;
	on(event: "message_end", handler: PiSessionEventHandler<PiMessageEndEvent>): () => void;
	/**
	 * Subscribes to the native submission fact, published before pi decides what the submission is.
	 *
	 * The handler's own result decides pi's handling, so this surface's handler answers nothing: the
	 * framework observes the fact and never transforms, replaces or absorbs a submission.
	 */
	on(event: "input", handler: PiSessionEventHandler<PiInputEvent>): () => void;
	/**
	 * Subscribes to pi's own name-change fact for a session.
	 *
	 * It is not a lifecycle event — nothing about which session is current moved — so it is delivered
	 * as the session's current facts, exactly as a rename reaches consumers on a harness that
	 * publishes one. pi states that a name was cleared as a fact of its own, which is a session with
	 * no name rather than a name that did not change.
	 */
	on(event: "session_info_changed", handler: PiSessionEventHandler<PiSessionInfoChangedEvent>): () => void;
	registerCommand(name: string, options: PiCommandRegistration): void;
	appendEntry(customType: string, data?: unknown): void;
	/**
	 * pi's own shared event bus, when this surface publishes one.
	 *
	 * Optional because this adapter names only the members it reads: a surface without a bus is a
	 * process in which the subagent provider's versioned interface cannot be reached at all.
	 */
	readonly events?: PiEventBus;
}
export type PiExtensionFactory = (pi: PiExtensionApi) => BindingResult;
