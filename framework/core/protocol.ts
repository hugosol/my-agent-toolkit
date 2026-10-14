/**
 * The protocol between the framework's harness-independent behavior and an
 * harness adapter.
 *
 * Adapters translate native capabilities into this port and translate framework
 * outcomes back into native effects; the behavior itself never sees a native API.
 * Failures travel as data, so an adapter can report them on whatever non-model
 * channel its harness offers without deciding what counts as a conflict.
 */
import type { ExtensionDefinition } from "./definition";
import type { ConfigurationViolation } from "./violations";

/** The State values one write path records, by field name. */
export type StateValues = Readonly<Record<string, boolean>>;

/**
 * The owner a framework effect acts on: the session whose State the effect concerns.
 *
 * `owner` — the session this delivery names is itself the owner (a top-level main
 * session). It is the only session that seeds or transitions the value. `inherited` — the
 * delivery names a subagent session, which owns no cell: it never writes one, and it reads
 * its owner's value only when the field declares `follow`, otherwise the declared default.
 * `unresolved` — no owning main session could be resolved (the parent chain leaves the
 * process), so the value reads as the declared default and no path may write it.
 *
 * The key is the adapter's opaque identity for the owning session. The framework never
 * derives or interprets it; two sessions in one process that share a registry label are
 * still different owners when their session identities differ.
 */
export type OwnerReference =
	| { readonly kind: "owner"; readonly key: string }
	| { readonly kind: "inherited"; readonly key: string }
	| { readonly kind: "unresolved" };

/**
 * Why a session became the current owner.
 *
 * `initial` — the session this binding first served in this process, which is the session
 * the harness loaded at startup and which carries no transition reason of its own.
 * `new` — a session stood up from nothing. `resume` — an existing session restored.
 * `fork` — a session derived from another one's branch or transcript.
 */
export type SessionStartReason = "initial" | "new" | "resume" | "fork";

/**
 * Why the current owner stopped being current.
 *
 * `transferred` — another session took its place (a switch, a branch or a fork), so what
 * that session held is the extension's to wind down and its remote identity's to release.
 * `disposed` — the session itself went away, so only local state is wound down and the
 * session's own disappearance covers the rest.
 */
export type SessionEndReason = "transferred" | "disposed";

/**
 * One semantic session event: which way the session axis moved, and why — or, for a fact that
 * moved nothing, the session's own facts as the harness now reports them.
 *
 * `session_start` and `session_end` are a symmetric pair. A `session_start` opens one owner's
 * life as the current session and an `session_end` closes it, and a transition that changes which
 * session is current is one of each — `session_end(transferred)` for the owner being left,
 * followed by `session_start(reason)` for the owner being entered. A navigation that leaves
 * the current owner alone (a tree jump, a reload, a same-file resume, an in-place context
 * reset) is not a transition at all: it produces no event, so nothing downstream can
 * mistake it for one.
 *
 * `session_facts` is neither a transition nor a boundary. The harness reported that a fact it
 * holds about one actual session — its identity, its direct parent or its latest name — has
 * changed since the delivery that carried it last, and it says so as it changes rather than
 * waiting for the session's next boundary. Nothing the framework owns moves for it: no owner's
 * life begins or ends, no State reconciles, and no marker area is published. It is the one
 * session delivery whose content is taken as the session's current facts, and a harness that
 * reports no such change delivers none.
 */
export type SessionEvent =
	| { readonly kind: "session_start"; readonly reason: SessionStartReason }
	| { readonly kind: "session_end"; readonly reason: SessionEndReason }
	| { readonly kind: "session_facts" };

/**
 * The transport a session delivery publishes user-visible notices through.
 *
 * Implementations must use a channel outside model context — a UI notification, or a
 * stderr line when the session has no UI. A notice is feedback for the operator: never an
 * injected prompt, a conversation entry, tool output, or anything else a model could read.
 */
export interface NoticeTransport {
	/** Publishes one warning-level notice. */
	warn(message: string): void;
}

/**
 * The severity one extension feedback notice carries.
 *
 * Three levels, because what an extension says to the operator differs in kind: `info` reports an
 * effect that happened, `warning` reports something the operator should notice about an effect that
 * only partly happened or did not happen at all, and `error` reports one that did not happen. The
 * framework carries a level through unchanged — it neither reinterprets nor upgrades it — and a
 * session without a UI gets the message on stderr whatever its level, so a level is a
 * severity, never a channel selector.
 */
export type FeedbackLevel = "info" | "warning" | "error";

/**
 * The transport one delivery's extension feedback is published through.
 *
 * This is the single harness-independent channel through which an extension tells the
 * operator about an effect, and every handler delivery carries it: a command's outcome and
 * — through the same seam — an effect a semantic-event handler observed.
 *
 * Implementations must use a channel outside model context: a UI notification carrying the
 * notice's own severity when the session has a UI, and one stderr line when it does not.
 * Feedback is never an injected prompt, a conversation entry, tool output, or anything
 * else a model could read. The framework publishes no notice of its own on this channel
 * and never filters one it was handed, so what an extension says is what the operator sees.
 *
 * Distinct from {@link NoticeTransport}, which carries the framework's own notices
 * (session warnings). The two are not merged: framework warnings are not
 * extension feedback, and an extension never publishes on the framework's channel.
 */
export interface FeedbackTransport {
	/** Publishes one notice at the given severity, verbatim. */
	notify(level: FeedbackLevel, message: string): void;
}

/**
 * The actual session one delivery concerns: its identity, its direct parent and its latest
 * display name, as the adapter resolved them.
 *
 * This is the fact set a per-actual-session subscription observes. The session's `kind` and its
 * `parentSessionId` are *positions*, never the Owner a State value belongs to: a subagent's
 * direct parent is the session that spawned it — which may itself be a subagent — while its
 * Owner is the nearest top-level main session above it. A name is display data: a renamed session
 * keeps its `sessionId`, its direct parent and its Owner, so a name is never an identity.
 *
 * Every fact a delivery carries here was either obtained or named in `unavailable`; nothing is
 * guessed from the session currently being viewed, from a process-level label, or from a string
 * that merely looks like a hierarchy.
 */
export interface SessionFacts {
	/** The actual session's identity within this harness, as the harness reports it. */
	readonly sessionId: string;
	/** Whether this session is a top-level main session or one spawned by another session. */
	readonly kind: "main" | "sub";
	/**
	 * The identity of the actual session that directly spawned this one.
	 *
	 * Absent for a top-level session (there is no parent) and for a session whose direct parent's
	 * identity could not be resolved — the two cases are distinguished by `unavailable`, which
	 * names the fact when this host could not obtain it.
	 */
	readonly parentSessionId?: string;
	/** The session's latest display name, as the harness reports it; display data, never an identity. */
	readonly name?: string;
	/**
	 * The name of the agent this session runs, as its harness registers it.
	 *
	 * It is the harness's own display name for the agent — the same one its roster shows — which is
	 * what lets a session the harness never gave a display name be shown by a name rather than by an
	 * id. Absent when the harness reports none, and named in `unavailable`.
	 */
	readonly agentName?: string;
	/**
	 * The identity of the agent this session runs, as its harness registers it.
	 *
	 * It is the harness's own handle for the agent — the id its roster, its messaging and its history
	 * index use — and it is the fallback a display takes only when neither the session nor the agent
	 * has a name. Absent when the harness reports none, and named in `unavailable`.
	 */
	readonly agentId?: string;
	/** Every fact above this host could not obtain, named as the delivery names it. */
	readonly unavailable: readonly string[];
}

/**
 * The observation scope one subscription group declares.
 *
 * `owner` — the group observes the owner session's own deliveries only: a boundary, a round edge
 * or a Turn of a subagent session belongs to the owner that session follows, so a group that
 * drives an owner-scoped effect is never moved by a subagent's work. `session` — the group
 * observes every actual session the adapter reports, main or sub, with that session's own
 * identity, its direct parent and its latest name; it is the scope a per-session observation view
 * declares.
 *
 * The two scopes share one dispatch mechanism and differ only in which deliveries a group admits.
 * Widening a subscription to `session` grants no State write and no external-effect authority:
 * the framework's own owner-scoped behavior — State reconciliation, seeding and retirement, the
 * retainable capability, the marker area — runs exactly as before, and neither subscriber
 * delivery carries a write path.
 */
export type ObservationScope = "owner" | "session";

/**
 * One subscription group: the scope its observations cover and the handlers it subscribes.
 *
 * An assembly delivers one of these per group it declares, and the scope is declared once for the
 * whole group — not per event kind and not per handler. A group with no entry for an event kind
 * subscribes nothing for it, and a definition whose delivery carries no group subscribes nothing
 * at all.
 */
export interface SubscriptionGroup {
	readonly scope: ObservationScope;
	readonly events: SemanticEventHandlers;
}

/**
 * The facts a harness adapter resolves for one semantic session event.
 *
 * The adapter answers *which* session the event is about, what that session's branch
 * persisted, and whether the event is the session's own startup or a transition it
 * observed; whether a persisted payload declares a usable value is the framework's own
 * validation rule, so payloads cross the seam unread. Synthesizing these events from the
 * harness's native lifecycle is the adapter's job alone: shared behavior names no
 * native event and decides nothing about which native trigger means what.
 */
export interface SessionDelivery {
	/** The semantic event: which way the session axis moved, and why. */
	readonly event: SessionEvent;
	/**
	 * The actual session this event concerns: its identity, its direct parent and its latest name.
	 *
	 * This is the fact a per-session subscription observes, and it is *not* the owner above: a
	 * subagent's delivery names the subagent's own session here while its owner is the top-level
	 * main session it follows.
	 */
	readonly session: SessionFacts;
	/**
	 * The owner whose State this event concerns, as the adapter resolved it.
	 *
	 * A `session_start` names the owner being entered; a `session_end` names the owner being
	 * left — the session whose life is ending, never the one replacing it. A delivery whose
	 * session is not itself an owner (a subagent, or a session whose parent chain leaves the
	 * process) owns no cell, so it seeds none and retires none.
	 */
	readonly owner: OwnerReference;
	/**
	 * The State payloads persisted on the target branch, oldest first.
	 *
	 * The session's current record is the last one; an adapter never reorders or filters
	 * them, and hands over an empty list when the branch persisted no State.
	 */
	readonly statePayloads: readonly unknown[];
	/**
	 * Records the extension's new State values in the owner's persistence medium.
	 *
	 * The same medium a command invocation records through, and the one the capability this
	 * delivery hands out writes through: where a command arms an effect, a session start arms
	 * one, and the value that effect writes later is recorded exactly as the command's is.
	 * Best-effort by contract, exactly as on the command path.
	 */
	persist(values: StateValues): void;
	/**
	 * Whether the session this event names has a UI, as the adapter resolved it.
	 *
	 * The fact, not a conclusion: it is what lets shared extension logic gate its own
	 * `main + hasUI` rule without reading a native field, and it is the fact behind the
	 * mapping its feedback transport performs.
	 */
	readonly hasUI: boolean;
	/** The transport this event's extension feedback is published through. */
	readonly feedback: FeedbackTransport;
	/** The transport this event's notices are published through. */
	readonly notices: NoticeTransport;
	/** The transport this event's marker-area update is published through. */
	readonly markers: MarkerTransport;
}

/**
 * The facts one subscribed extension handler receives for a semantic session event.
 *
 * This is the extension-facing half of the session subscription: the event, the owner scope
 * it concerns, and the same two seams every other handler delivery carries — the faithful
 * `hasUI` fact and the unified extension feedback channel. It carries no branch payloads
 * and no notice channel, because an extension reacts to a transition rather than reading
 * persistence, and it never publishes on the framework's own notice channel.
 *
 * It also carries the owner-scoped capability, because a start is an arm path: an extension
 * that arms in a `session_start` handler retains that handle for the background effects the
 * session it just entered will drive, exactly as a command handler does.
 */
export interface SessionEventDelivery {
	readonly event: SessionEvent;
	/**
	 * The actual session this event is about: its identity, its direct parent and its latest name.
	 *
	 * A per-session group reads each session's own work from it, and it is never the owner above: a
	 * subagent's boundary names the subagent's own session here.
	 */
	readonly session: SessionFacts;
	readonly owner: OwnerReference;
	readonly hasUI: boolean;
	/**
	 * The unified extension feedback channel of this dispatch.
	 *
	 * It is the dispatch's own: a notice published while this event's handler runs reaches the
	 * operator unchanged, and the channel is closed when the dispatch ends. That is what makes it
	 * the one thing a `session_end` handler can still speak through — the owner it names is
	 * retired before the handler runs — and it is deliberately not the way to report an effect
	 * later: an extension that needs that keeps the capability below.
	 */
	readonly feedback: FeedbackTransport;
	/**
	 * The owner-scoped capability this handler may retain for the effects it drives outside this
	 * delivery (see {@link OwnerCapabilityHandle}).
	 *
	 * On a `session_end` delivery the capability is inert from birth: the owner it names has
	 * already been retired by the time the handler runs, so what that delivery can still say goes
	 * through its own feedback channel, and nothing retained here can act for the session that
	 * just ended.
	 */
	readonly capability: OwnerCapabilityHandle;
}

/** One extension handler for one semantic session event. */
export type SessionEventHandler = (delivery: SessionEventDelivery) => void | Promise<void>;

/**
 * The session-event handlers one assembly injects, keyed by the event each subscribes to.
 *
 * A definition stays plain data: it names no handler, and what runs on a boundary arrives
 * here, at assembly time, exactly as a directed command's implementation does. An event
 * kind with no entry subscribes nothing. A handler that throws is reported on the adapter's
 * diagnostic channel — a channel outside model context — and neither changes what the
 * framework already did for the event nor keeps another subscriber from running.
 */
export type SessionEventHandlers = Readonly<Partial<Record<SessionEvent["kind"], SessionEventHandler>>>;

/**
 * One semantic round event: the two edges of a `Round`, the period of agent activity that
 * starts when the agent takes up input and ends at quiescence.
 *
 * Both members are transitions, and neither carries a payload. An edge says only that the
 * period began or that it ended with nothing left to do; how it ended is deliberately not
 * part of the model, because the harnesses disagree about that vocabulary (a round that
 * finishes on an ordinary answer, on an error and on an abort ends the same way here) and
 * because the agent's *current* state is a query ({@link CanAcceptInput}) rather than a field
 * of a past transition.
 *
 * The edges are edge-triggered by identity within one binding: `round_start` opens a round and
 * `round_end` closes it, an edge that would repeat the state the previous one left is not
 * delivered at all, and work that continues inside a round — an automatic continuation, a drained
 * queued message — produces no edge. Synthesizing those edges from the adapter's run-cycle facts,
 * and suppressing the one that is not a transition, is the framework's own behavior
 * (`behaviors/round-events.ts`); the adapter reports what its harness did and nothing about which
 * transition that is.
 */
export type RoundEvent = { readonly kind: "round_start" } | { readonly kind: "round_end" };

/**
 * The facts one round edge carries, both to the adapter's hook and to the subscribed handler.
 *
 * A round edge has nothing an extension may not see, so unlike a session delivery there is no
 * withheld half: the same value an adapter hands the framework's hook is the value that reaches
 * the handler. It carries the edge, the owner scope it concerns, the faithful `hasUI` fact and
 * the unified extension feedback channel — the same seams every other handler delivery carries
 * — and nothing else.
 */
export interface RoundDelivery {
	/** The edge itself: which way the round axis moved. */
	readonly event: RoundEvent;
	/** The owner whose agent this edge concerns, as the adapter resolved it. */
	readonly owner: OwnerReference;
	/**
	 * The actual session this edge came from: its identity, its direct parent and its latest name.
	 *
	 * It is not the owner above: a subagent's edge names the subagent's own session here while its
	 * owner is the top-level main session it follows, which is what lets a per-session
	 * subscription keep the two apart and an owner-scoped one stay unmoved by the child.
	 */
	readonly session: SessionFacts;
	/** Whether the session this edge came from has a UI, as the adapter resolved it. */
	readonly hasUI: boolean;
	/** The transport this edge's extension feedback is published through. */
	readonly feedback: FeedbackTransport;
}

/** One extension handler for one semantic round event. */
export type RoundEventHandler = (delivery: RoundDelivery) => void | Promise<void>;

/**
 * One native run-cycle fact the adapter observed, before the framework decides which round edge,
 * if any, it is.
 *
 * `activity_started` is the harness beginning a run — the agent loop taking up work, whether from
 * a fresh prompt or from a continuation the session scheduled for itself. `settled` is a run
 * reaching its native end, carrying the harness's own continuation flag mapped to its two-valued
 * form: `willContinue` is `true` only when the session has already scheduled its next piece of
 * work, and a settle that says nothing is a settle that scheduled nothing.
 *
 * Neither is an edge. Which of them opens a round, which continues one, and which ends one is the
 * framework's synthesis ({@link createRoundSynthesis}); an adapter reports facts and decides
 * nothing about transitions.
 */
export type RoundSignal =
	| { readonly kind: "activity_started" }
	| { readonly kind: "settled"; readonly willContinue: boolean };

/**
 * One mapped round-cycle fact together with the per-delivery facts its own harness context
 * carries, plus the one live read a round's end is confirmed by.
 *
 * The `quiescent` read is a query rather than a field because it has to be asked *later* than the
 * fact that raises the question. A harness reports a run as over before its own work has unwound
 * — its session is not idle at that instant, and a queued message or a running asynchronous job
 * may still continue the work — so the framework submits the settle as an end candidate, lets the
 * adapter return so the host can settle, and re-checks this read on its next task. A read that
 * answers anything but `true` is not a confirmation: `false` is a session with work left, and
 * `undefined` is a surface that does not report one of the facts at all, which closes no round.
 */
export interface RoundObservation {
	/** The native run-cycle fact this observation is. */
	readonly signal: RoundSignal;
	/** The actual session the fact came from: its identity, its direct parent and its latest name. */
	readonly session: SessionFacts;
	/** The owner whose agent this fact concerns, as the adapter resolved it. */
	readonly owner: OwnerReference;
	/** Whether the session this fact came from has a UI, as the adapter resolved it. */
	readonly hasUI: boolean;
	/** The transport this fact's extension feedback is published through. */
	readonly feedback: FeedbackTransport;
	/**
	 * Reads, now, whether that actual session is at quiescence: idle, with nothing queued and no
	 * asynchronous job still running. `undefined` when this surface does not report one of those
	 * facts — an unestablished quiescence, which is not one.
	 */
	quiescent(): boolean | undefined;
}

/**
 * The round-event handlers one assembly injects, keyed by the edge each subscribes to.
 *
 * A round handler is a subscriber like a session one and arrives the same way: the definition
 * stays plain data, and what runs on an edge is injected at assembly time. This alias names the
 * round half on its own, for an assembly that keeps the two axes' subscriptions apart.
 */
export type RoundEventHandlers = Readonly<Partial<Record<RoundEvent["kind"], RoundEventHandler>>>;

/**
 * One semantic Turn event: the two edges of a Turn, one observable model request/response cycle.
 *
 * A `turn_start` is delivered when the harness really begins a model request; a `turn_end` when
 * that same cycle's response settled. Tool execution is outside the Turn: the harness's own
 * `turn_end` event, which fires after the requested tools ran, is not this edge and an adapter
 * must not copy it (see the observation contract's delivery table).
 *
 * The two edges share one identity. The framework mints it — an opaque value, never a
 * provider-issued request or response id — and carries it on both edges, so a consumer never has
 * to reconstruct which end belongs to which start; an end whose start is not reliably known is
 * reported and dropped rather than attributed to whatever session, model or request happened to
 * be current.
 */
export type TurnEvent = { readonly kind: "turn_start" } | { readonly kind: "turn_end" };

/**
 * One Turn's reported model usage, as its response carried it.
 *
 * The four buckets are the ones a provider reports and the harness exposes; an absent report is
 * not this value with zeros in it (see the Turn's `unavailable`). A source that cannot tell its
 * own default from a reported zero reports no reading at all, so a zero carried here is the zero
 * its own source reported.
 */
export interface TurnUsage {
	/** Non-cached conversation input tokens. */
	readonly input: number;
	/** Conversation output tokens, thinking and tool-call arguments included. */
	readonly output: number;
	/** Conversation tokens read from the prompt cache. */
	readonly cacheRead: number;
	/** Conversation tokens written to the prompt cache. */
	readonly cacheWrite: number;
	/** The reported total, as the harness reported it. */
	readonly totalTokens: number;
}

/** How one Turn's request/response cycle ended. */
export type TurnOutcome = "completed" | "failed" | "cancelled";

/**
 * The HTTP facts one Turn's provider response carried, as the adapter could obtain them.
 *
 * `requestId` is the transport's own reference id when the response exposed one; it is reference
 * information like the assistant message's response id and is never the Turn's identity — the two
 * external ids are not assumed equal and neither is used to associate a delivery.
 */
export interface ProviderHttpFacts {
	readonly status: number;
	readonly headers: Readonly<Record<string, string>>;
	readonly metadata?: Readonly<Record<string, unknown>>;
	/** The transport-level request id the response exposed, when it exposed one. */
	readonly requestId?: string;
}

/**
 * One provider/model's catalog price, as the extension's own catalog reported it at a request's
 * start.
 *
 * The framework carries this value and never interprets it: the currency, the unit and the
 * bucket keys are the extension's own business vocabulary, and a catalog that has no entry for
 * the model answers with nothing, which the delivery reports as an unavailable fact instead of a
 * fabricated price. Snapshotting it at the request's start is what keeps a later model or price
 * change from re-pricing a request that has already been issued.
 */
export interface CatalogPrice {
	/** The currency the amounts are expressed in, as the extension's catalog states it. */
	readonly currency: string;
	/** The unit the amounts are expressed per, as the extension's catalog states it. */
	readonly unit: string;
	/** The amounts, keyed by the extension's own token buckets. */
	readonly amounts: Readonly<Record<string, number>>;
}

/**
 * A model catalog, as the one party that owns it states its prices: the extension's own maintained
 * data or the harness's own model catalog.
 *
 * The framework asks the extension's own catalog ({@link ExtensionImplementation.catalog}) once per
 * model request — at the request's real start — and snapshots the answer into that Turn's start
 * facts. The harness's own catalog comes the other way, as a fact its adapter maps
 * ({@link HarnessPort.modelPrices}) and the framework hands the implementation factory, so an
 * extension that prices a channel from the harness's catalog composes it with its own data instead
 * of reading a native model.
 *
 * Both readings are queries and not subscriptions: there is no runtime catalog refresh, no cached
 * copy inside the framework, and a model a catalog does not carry is answered with nothing rather
 * than with a default.
 */
export interface CatalogPriceSource {
	/** The price this catalog states for one provider and exact model id, or nothing when it states none. */
	priceOf(provider: string, model: string): CatalogPrice | undefined;
}

/**
 * One provider's current access facts, as the harness resolved them for one operation.
 *
 * Both members are facts the host holds and this framework never interprets: the address the
 * provider's own protocol is reached at, and the credential material that protocol authenticates
 * with. A member the host has nothing to say about is absent rather than empty, and the caller —
 * the extension that owns the query — decides what a missing address means for it.
 */
export interface ProviderAccessFacts {
	/** The provider's applicable base URL, when the host resolved one. */
	readonly baseUrl?: string;
	/**
	 * The credential material one operation authenticates with, when the host has one.
	 *
	 * It is the material itself — an API key or an access token — and never a header: formatting
	 * the request's authentication is the calling extension's business, exactly as every other
	 * request header is.
	 */
	readonly credential?: string;
}

/**
 * The harness's current access to one provider, as its adapter resolves it per operation.
 *
 * The query reads the host's state at the moment it is called — the credential a login or a key
 * replacement has since made effective included — rather than binding the first answer: the
 * framework hands the query to the implementation factory and asks it again for each later
 * operation, so nothing here is a snapshot and nothing is cached by the framework.
 *
 * An answer of nothing is the host having no access to that provider at all — no credential it
 * could use — and is deliberately not an empty credential: a caller that needs one fails its own
 * query rather than borrowing another provider's, guessing an account or sending nothing.
 */
export interface ProviderAccess {
	/** The current access facts for one provider, or nothing when the host has none. */
	resolve(provider: string): Promise<ProviderAccessFacts | undefined>;
}

/**
 * The facts one Turn fixed when its request really began, delivered on both of its edges.
 *
 * `startedAt` is the request's own start on the process's clock, and the model, the provider and
 * the price are the ones holding at that moment: a later change of the session's model does not
 * re-price or re-attribute the Turn, which is why the end delivery carries this same record
 * rather than a fresh one.
 */
export interface TurnStartFacts {
	/** The framework's opaque identity for this Turn; never a provider-issued id. */
	readonly turnId: string;
	/** The actual session that issued the request, as the adapter resolved it. */
	readonly session: SessionFacts;
	/**
	 * The Round this Turn belongs to, as the framework minted it.
	 *
	 * Absent when no round is open for that session — a signal gap the delivery names in
	 * `unavailable` rather than filling with a guessed identity.
	 */
	readonly roundId?: string;
	/** When the request really started, on the process's own clock. */
	readonly startedAt: number;
	readonly provider: string;
	readonly model: string;
	/** The catalog price holding at the request's start, when the extension's catalog carried one. */
	readonly price?: CatalogPrice;
	/** Every fact above that could not be obtained, named as the delivery names it. */
	readonly unavailable: readonly string[];
}

/**
 * The facts one Turn delivered when its response settled.
 *
 * `usage` is absent when no reliable reading existed: an unreported usage and a set of final
 * readings whose valid source could not be determined are unavailable rather than zero, which
 * `unavailable` names. An all-zero reading a host default could equally have produced is never
 * reported as a reading by its adapter, so a reading here is its source's own. Nothing here is a
 * post-hoc correction: a Turn is delivered once, and a later reading never re-opens or rewrites it.
 */
export interface TurnEndFacts {
	/** When the response settled, on the process's own clock. */
	readonly endedAt: number;
	readonly outcome: TurnOutcome;
	/** The reliable usage this Turn's response reported, when one existed. */
	readonly usage?: TurnUsage;
	/** The HTTP facts of this Turn's provider response, when the adapter could obtain them. */
	readonly http?: ProviderHttpFacts;
	/** The transport-level request id the response exposed, when it exposed one. */
	readonly providerRequestId?: string;
	/** The provider-issued response id the assistant message carried, when it carried one. */
	readonly providerResponseId?: string;
	/** Every fact above that could not be obtained, named as the delivery names it. */
	readonly unavailable: readonly string[];
}

/**
 * The facts one Turn's start edge carries, both to the adapter's hook and to subscribed handlers.
 *
 * A start delivery carries the recorded request facts and the two seams every subscriber delivery
 * carries — the faithful `hasUI` fact and the unified extension feedback channel — and no write
 * path: a per-session observation grants no owner-scoped authority.
 */
export interface TurnStartDelivery {
	readonly event: { readonly kind: "turn_start" };
	/** The owner whose session issued the request, as the adapter resolved it. */
	readonly owner: OwnerReference;
	readonly turn: TurnStartFacts;
	readonly hasUI: boolean;
	readonly feedback: FeedbackTransport;
}

/**
 * The facts one Turn's end edge carries.
 *
 * It repeats the Turn's start facts, so a consumer correlates the two edges by the delivery
 * itself rather than by keeping its own in-flight record: the same `turnId`, the same session,
 * the same round and the same request-price anchor.
 */
export interface TurnEndDelivery {
	readonly event: { readonly kind: "turn_end" };
	readonly owner: OwnerReference;
	readonly turn: TurnStartFacts;
	readonly end: TurnEndFacts;
	readonly hasUI: boolean;
	readonly feedback: FeedbackTransport;
}

/** One extension handler for one semantic Turn edge. */
export type TurnEventHandler = (delivery: TurnStartDelivery | TurnEndDelivery) => void | Promise<void>;

/** The Turn handlers one assembly injects, keyed by the edge each subscribes to. */
export type TurnEventHandlers = Readonly<Partial<Record<TurnEvent["kind"], TurnEventHandler>>>;

/**
 * One semantic subagent-runtime fact: the execution duration a harness itself measured and
 * reported for one subagent execution of one actual session.
 *
 * It is a *fact*, never an edge, and it is deliberately not a Round edge either: an execution's
 * duration arrives while the session it belongs to is still working — a harness reports its
 * progress while the work runs — and the final reading arrives when the execution is over, which
 * is not the same moment as the session's Round ending and must never be treated as one. Which
 * readings are a replacement of an earlier reading of the same execution, which are a new
 * execution's own contribution, and which repeat a reading already accounted are the consumer's
 * rules; the framework carries the harness's own facts and decides nothing about them.
 *
 * It is also *not* the same metric as the wall-clock span a harness may persist for a session
 * (creation to last record): that span includes the idle gaps between executions, so it can never
 * stand in for a runtime. What crosses this seam is only what the harness itself measured for the
 * execution it ran.
 */
export type SubagentRuntimeEvent = { readonly kind: "subagent_runtime" };

/**
 * The reading one subagent-runtime delivery carries, or the fact that this host produced none.
 *
 * `unavailable` is not an absent observation: the harness did report an execution, and the
 * duration this host could not read, could not trust or could not attribute to a session is a
 * fact an operator has to be told about. A reading of `0` is therefore a reading the harness
 * really reported — a completed execution that consumed no measurable time — and never the
 * placeholder an unavailable runtime leaves behind.
 */
export type SubagentRuntimeFact =
	| {
			/** Whether this reading is a replacement of the same execution's own earlier one, or its final one. */
			readonly kind: "reading";
			/** The harness's own identity for the execution this reading belongs to. */
			readonly executionId: string;
			/** The milliseconds that execution had run when the harness reported this reading. */
			readonly runtimeMs: number;
			/**
			 * Whether the harness reported the execution as over at that instant.
			 *
			 * A later reading of the *same* execution replaces this one; an execution this host
			 * reports as ended only once, however many times the same completion is observed.
			 */
			readonly status: "running" | "ended";
	  }
	| {
			readonly kind: "unavailable";
			/** Why this host could not produce a reading, as this host states it. */
			readonly reason: string;
	  };

/**
 * The facts one subagent-runtime observation carries, both to the adapter's hook and to the
 * subscribed handler.
 *
 * Unlike a session delivery there is no withheld half: what the adapter mapped is what a handler
 * receives. It carries the actual session the reported execution belongs to, the owner scope it
 * concerns, the reading, the faithful `hasUI` fact and the unified extension feedback channel —
 * the same seams every other handler delivery carries — and no write path, because observing a
 * runtime grants no authority over the session it belongs to.
 */
export interface SubagentRuntimeDelivery {
	readonly event: SubagentRuntimeEvent;
	/** The owner whose agent this observation concerns, as the adapter resolved it. */
	readonly owner: OwnerReference;
	/**
	 * The actual session the reported execution belongs to, as the adapter resolved it.
	 *
	 * A reading is only ever accumulated for a session a delivery names here, and this is never
	 * the owner above: an execution a subagent ran names the subagent's own session.
	 *
	 * A runtime this host could not attribute to any session — the fact is then `unavailable` —
	 * carries the session the observation was *made* in instead, which is the session whose own
	 * work reported the execution.
	 */
	readonly session: SessionFacts;
	/** The reading, or the reason this host produced none. */
	readonly runtime: SubagentRuntimeFact;
	/** Whether the session this observation carries has a UI, as the adapter resolved it. */
	readonly hasUI: boolean;
	/** The transport this observation's extension feedback is published through. */
	readonly feedback: FeedbackTransport;
}

/** One extension handler for one semantic subagent-runtime fact. */
export type SubagentRuntimeEventHandler = (delivery: SubagentRuntimeDelivery) => void | Promise<void>;

/** The subagent-runtime handlers one assembly injects, keyed by the event each subscribes to. */
export type SubagentRuntimeEventHandlers = Readonly<Partial<Record<SubagentRuntimeEvent["kind"], SubagentRuntimeEventHandler>>>;

/**
 * One semantic input event: the one fact that a session took up input the harness itself attributed
 * to the user.
 *
 * It is deliberately one edge and no pair. The harness publishes exactly one such fact — a
 * submission admitted to a session — and it publishes it before it decides what the submission is,
 * so an ordinary prompt, a queued steer, a follow-up and a user-invoked skill are the same fact
 * here. Nothing about the text, the images or what the submission turned out to be is part of it:
 * those are the harness's own material, and the fact a consumer acts on is only that the user, and
 * not the agent, put something in. Input an extension itself submits is not this fact.
 */
export type UserInputEvent = { readonly kind: "user_input" };

/**
 * The facts one user-input edge carries, both to the adapter's hook and to the subscribed handler.
 *
 * Like a round edge it has nothing an extension may not see, so there is no withheld half: the edge
 * itself, the session it belongs to (a subagent's submission names the subagent, never its owner
 * above it), the owner scope it concerns, the faithful `hasUI` fact and the unified extension
 * feedback channel.
 *
 * It carries no instant, because the harness publishes none: when the fact is observed is the
 * observer's own fact, exactly as it is for every other harness fact.
 */
export interface UserInputDelivery {
	/** The edge itself: that this session took up user input. */
	readonly event: UserInputEvent;
	/** The owner whose agent this submission concerns, as the adapter resolved it. */
	readonly owner: OwnerReference;
	/** The actual session the submission was admitted to: its identity, direct parent and latest name. */
	readonly session: SessionFacts;
	/** Whether the session this submission belongs to has a UI, as the adapter resolved it. */
	readonly hasUI: boolean;
	/** The transport this edge's extension feedback is published through. */
	readonly feedback: FeedbackTransport;
}

/** One extension handler for one semantic input edge. */
export type UserInputEventHandler = (delivery: UserInputDelivery) => void | Promise<void>;

/**
 * Any semantic lifecycle event the framework models: the session axis, the round axis, the Turn
 * axis, the subagent-runtime axis and the input axis.
 *
 * The axes are orthogonal and never merged — entering a session is not starting work, starting
 * work does not change which session is current, a Turn is not a Round, an execution's own
 * duration is not the session's span nor the end of a Round, and input arriving is not itself
 * work — so this union exists only where one assembly injects its handlers for all of them.
 */
export type SemanticEvent = SessionEvent | RoundEvent | TurnEvent | SubagentRuntimeEvent | UserInputEvent;

/** The delivery each semantic event kind carries, so a handler's kind and its facts stay paired. */
export interface SemanticEventDeliveryMap {
	readonly session_start: SessionEventDelivery;
	readonly session_end: SessionEventDelivery;
	/** A facts delivery carries the session's current facts and no branch payload of its own. */
	readonly session_facts: SessionEventDelivery;
	readonly round_start: RoundDelivery;
	readonly round_end: RoundDelivery;
	readonly turn_start: TurnStartDelivery;
	readonly turn_end: TurnEndDelivery;
	readonly subagent_runtime: SubagentRuntimeDelivery;
	readonly user_input: UserInputDelivery;
}

/**
 * The semantic handlers one assembly injects for one subscription group, keyed by the event each
 * subscribes to.
 *
 * This is the whole handler surface of one group: the session axis, the round axis, the Turn axis
 * and the subagent-runtime axis and the input axis arrive here together, exactly as a directed
 * command's implementations arrive through `CommandActions`. A definition stays plain data either
 * way: it names no handler, and an event kind with no entry subscribes nothing.
 *
 * The session axis is a *reconciliation* trigger as well as a subscription — the framework
 * applies its own behavior for every delivery whether or not a handler arrived — while the round,
 * Turn, subagent-runtime and input axes are subscription only: three-value agent state is not
 * framework State (contract P6), a Turn changes nothing the framework owns beyond the identity
 * bookkeeping it does before a handler runs, an execution's own duration changes nothing the
 * framework owns at all — it is the extension's business to accumulate and to persist with its own
 * next commit — and a user input crosses no boundary at all: it is a fact about the session, not a
 * transition of it. A `session_facts` delivery is subscription only as well, because a
 * session whose facts were re-reported crossed no boundary: nothing of the framework's moves, so
 * its own behavior is skipped and only the handlers that subscribe to that kind are reached.
 *
 * Which deliveries reach a handler is its group's {@link ObservationScope}, not this type: an
 * `owner` group receives the owner session's own deliveries only, and a `session` group receives
 * every actual session's, each carrying that session's own identity. The framework's own
 * owner-scoped behavior is unaffected by either scope.
 */
export type SemanticEventHandlers = Readonly<{
	readonly [K in SemanticEvent["kind"]]?: (delivery: SemanticEventDeliveryMap[K]) => void | Promise<void>;
}>;

/**
 * The transport the framework publishes its unified marker area through.
 *
 * The area itself — its native widget key, its placement, and what happens without a UI —
 * belongs to the adapter; the framework decides only its content. The lines handed here
 * are the area's current rendering for one owner (the active extensions' marker texts,
 * ordered by extension id), and an empty list is the framework's instruction to clear the
 * area rather than leave an empty widget behind.
 */
export interface MarkerTransport {
	publishMarkers(lines: readonly string[]): void;
}

/**
 * The session the host is displaying, as its adapter resolves it: the read-and-notify pair a
 * harness publishes, and nothing else.
 *
 * This is a *seat*, never authority. It answers which session's State the framework's marker area
 * projects — the owner itself, a subagent following one, or nothing when the host cannot say — and
 * it can do nothing else: reading it writes no State, retains no capability and drives no owner's
 * effect, so a session an operator looks at is never thereby an owner and never gains a write path
 * it did not have. What the framework projects with it is the same per-field inheritance rule it
 * applies everywhere else ({@link OwnerReference}): an `inherited` seat reads the owner's value
 * only for a field that declares `follow`, and otherwise the field's declared default.
 *
 * A harness that publishes no such outlet omits the whole member, and the framework then keeps
 * projecting the position each delivery itself carries.
 */
export interface ViewedSessionPort {
	/**
	 * The owner position of the session being displayed, re-read on every call.
	 *
	 * `undefined` means this harness publishes no viewed-session outlet at all — not that the
	 * displayed session has no owner: the framework then falls back to the delivery's own position
	 * rather than emptying an area it cannot speak for. A resolved `unresolved` reference is the
	 * other case: the outlet exists and the displayed session's owner could not be obtained, so the
	 * area is projected for "no cell" (which empties it) instead of showing another session's lines.
	 */
	read(): OwnerReference | undefined;
	/**
	 * Registers one listener for each change of the displayed session — the view attaching to
	 * another session, the displayed target becoming invalid, or that target's own facts changing —
	 * and returns the unsubscriber.
	 *
	 * What arrives is a notification, not a payload: the listener re-reads through {@link read} and
	 * publishes through the transport it is handed, which is this delivery's marker area. The
	 * subscription is the binding's to release: it is created once from a declaration that renders a
	 * line at all and given up with the binding, subscribing creates no owner and starts no effect,
	 * and an adapter that holds a native subscription of its own drops it once the last listener is
	 * gone rather than leaving it live for a process that stopped caring.
	 */
	subscribe(listener: (markers: MarkerTransport) => void): () => void;
}

/**
 * The facts a harness adapter resolves for one agent-run initiation.
 *
 * A run initiation is the semantic clock of injected-prompt contribution: the adapter
 * answers which owner governs the run and what the current branch already persists, and
 * the framework decides from those facts and the owner's State alone. Nothing about a
 * slot's progress is stored: whether a slot has already contributed is a fact of the
 * branch, so a re-entered delivery decides the same way.
 */
export interface RunDelivery {
	/** The owner whose State governs this run, as the adapter resolved it. */
	readonly owner: OwnerReference;
	/**
	 * The injected-prompt identities the current branch already carries, oldest first.
	 *
	 * The adapter resolves persistence, not meaning: it reports which contributions exist,
	 * and the framework matches them against its own slot identities.
	 */
	readonly contributionIdentities: readonly string[];
	/** The transport this delivery's marker updates are published through. */
	readonly markers: MarkerTransport;
}

/**
 * The injected-prompt contribution the framework decided one run should carry.
 *
 * Visibility, delivery position and retention are framework-owned and not parameters:
 * a contribution is hidden, attributed to the agent, and appended at the end of the
 * conversation, where the harness persists it with the rest of the turn.
 */
export interface PromptContribution {
	/** The slot's framework identity, also the custom type its persisted entry carries. */
	readonly identity: string;
	readonly content: string;
	readonly display: false;
	readonly attribution: "agent";
}

/** The directives a directed command acts on; an unrecognized argument is not one. */
export type RecognizedDirective =
	| { readonly kind: "activate" }
	| { readonly kind: "deactivate" };

/**
 * The framework's normalization of a directed command's argument.
 *
 * `activate` — the empty argument names `on`; `deactivate` — `off` names `off`;
 * `unrecognized` — any other text, carried verbatim. Normalizing in the framework keeps
 * the command surface's one vocabulary in one place, so an assembly never re-implements
 * it and an extension reads one shape whatever surface the user typed on.
 */
export type DirectedDirective =
	| RecognizedDirective
	| { readonly kind: "unrecognized"; readonly argument: string };

/**
 * The declared-value seam: the surface every injected handler delivery carries for the
 * extension's declared State value.
 *
 * A handler owns its write. The framework never writes a declared value on a handler's
 * behalf, never overwrites one the handler decided, and never deduplicates two identical
 * writes, so the value a handler leaves is the value State holds. `read` is what the
 * handler runs against: it observes the value the delivery started from — which is what
 * lets an extension filter on whether it was already active before the invocation —
 * and `write` is the only path that changes it.
 *
 * A seam is bound to one declared field, and to the owner the delivery resolved. The
 * framework publishes the marker area after each write, so a write of `false` removes
 * this extension's line as surely as a write of `true` adds it.
 */
export interface DeclaredValueSeam {
	/** The owner's current value for the seam's declared field, as it stands now. */
	read(): boolean;
	/**
	 * Records a new value for the seam's declared field.
	 *
	 * The write is the framework's: it becomes the owner's current value, is recorded
	 * best-effort in the owner's persistence medium when the field persists there, and is
	 * followed by an area update. A field that declares `memory` is never recorded. A
	 * handler that never writes changes nothing.
	 */
	write(value: boolean): void;
}

/**
 * The owner-scoped capability handle: what a handler retains so an effect it drives outside
 * its own delivery — a heartbeat timer, an outbound flusher — can still write the extension's
 * declared value and publish operator feedback.
 *
 * It is the same write and the same feedback channel the delivery carries, scoped to the owner
 * that delivery resolved, and it changes nothing about who owns the write: the delivery is what
 * authorizes it, the framework resolves no owner for a caller and exposes no owner-key write or
 * feedback API, and an extension that drives a background effect keeps the capability in its own
 * owner-keyed record rather than asking the framework for one.
 *
 * It is valid for the owner's life and no longer. The framework's own behavior runs before a
 * session event's handler, so by the time any handler observes the boundary that ends an owner,
 * that owner's cell is already retired — and a capability retained earlier is inert from then
 * on: a write is a no-op that neither recreates State nor republishes the marker area, and
 * feedback is dropped, so a late callback cannot speak for a session that is gone.
 *
 * It carries no `hasUI`: whether the session has a UI is a fact a delivery decides its own gate
 * on, while a background effect publishes on this feedback channel whatever the session's UI is.
 */
export interface OwnerCapabilityHandle {
	/** The declared-value seam of the owner this capability is scoped to. */
	readonly state: DeclaredValueSeam;
	/** The unified extension feedback channel of the owner this capability is scoped to. */
	readonly feedback: FeedbackTransport;
}

/**
 * The implementation a harness assembly injects for one declared directed
 * command.
 *
 * The value is an object rather than a bare function because this is assembly-surface
 * contract: the command's remaining members — the unrecognized-argument path among them
 * — arrive by addition, and a bare function would leave no room for one.
 */
export interface DirectedCommandImplementation {
	/**
	 * Runs the command's effect for one recognized directive, for the session that is
	 * itself an owner.
	 *
	 * The framework neither deduplicates nor short-circuits a repeated invocation, and
	 * publishes no feedback for a directed command: this member owns both the effect and
	 * whatever the operator is told about it. It also owns the write: the value State
	 * holds afterwards is the one this member wrote through the delivery's seam. An
	 * unrecognized argument is not a directive, so it never reaches this member.
	 */
	run(directive: RecognizedDirective, delivery: CommandDelivery): void;
	/**
	 * Runs for the one thing the command surface does not recognize: the argument text
	 * that normalized to no directive (see {@link DirectedDirective}).
	 *
	 * The framework still concludes nothing from it — no value is recorded, no marker is
	 * published and nothing is said — and this member is what lets the extension answer the
	 * mistyped argument with words the extension owns, on the same delivery `run` receives.
	 * An implementation that injects no such member leaves an unrecognized argument as inert
	 * as it has always been: a member that is absent is simply not called, which is what makes
	 * this addition compatible with every implementation that predates it.
	 *
	 * The argument arrives exactly as the framework normalized it, so the extension says what
	 * it saw without parsing the command line a second time. The same owner scope gates this
	 * member as gates `run`: a delivery that is not the owner never reaches it.
	 */
	unrecognized?(argument: string, delivery: CommandDelivery): void;
}

/**
 * The implementations one assembly injects, keyed by the name of the directed command
 * each implements.
 *
 * Binding refuses a directed declaration with no matching implementation; an
 * implementation with no declaration implements nothing and is ignored.
 */
export type CommandActions = Readonly<Record<string, DirectedCommandImplementation>>;

/**
 * The framework's idle query: whether the agent can take input now.
 *
 * `true` — the agent is idle and can accept input; `false` — it is working and cannot;
 * `undefined` — this harness reports no idle fact at all, which is surfaced rather than
 * answered with a value the harness never gave. The three-valued answer is the honest one: a
 * harness whose session context exposes no idle fact cannot be read as either state, and an
 * extension that needs the fact decides for itself what an unreported one means (the framework
 * does not decide it for the extension by inventing `false`).
 *
 * It is a question, never a field: the caller asks when it needs the answer — the arm path asks
 * it for the state it reports — so no earlier event has to have happened, and neither axis's
 * delivery carries the fact as a payload.
 */
export type CanAcceptInput = () => boolean | undefined;

/**
 * The facts a harness adapter supplies for one command invocation.
 *
 * A command is registered natively at binding time, before any session fact exists;
 * the adapter resolves the argument, the owner, whether the session has a UI, its idle fact,
 * and the two effect transports only when the harness runs it. Both effects belong to the
 * adapter — the behavior and its handlers decide what to record and what to say, at which
 * severity, and in which order, but never how.
 */
export interface CommandInvocation {
	/** The argument text the user supplied after the command name; `""` when there is none. */
	readonly args: string;
	/**
	 * The framework's idle query for the session this command runs in: whether the agent can
	 * take input now (see {@link CanAcceptInput}).
	 *
	 * This is the fact an arm path starts from — the extension asks it where arm begins and
	 * reports the state it answers — and it is asked rather than delivered: nothing has to have
	 * happened in the session first, and no session or round delivery carries it as a payload.
	 * A query that answered from a past event would report the state at that event rather than
	 * the agent's state now, which is exactly what a subscription cannot provide.
	 */
	readonly canAcceptInput: CanAcceptInput;
	/**
	 * The provider the session this command runs in currently runs, as the adapter resolved it.
	 *
	 * It is the running session's own current fact — not whatever the host displays, not the
	 * provider of the last request, and not a value the framework derives — so an extension whose
	 * action applies to one provider reads it here instead of reaching a native context, and a
	 * surface that reports no current model answers `undefined` rather than a provider this
	 * framework invented.
	 */
	readonly provider: string | undefined;
	/** The owner whose State this command acts on, as the adapter resolved it. */
	readonly owner: OwnerReference;
	/**
	 * Records the extension's new State values in the owner's persistence medium.
	 *
	 * Best-effort by contract: the extension side cannot observe a persistence
	 * failure, the declared value is already the in-memory current value, and a throw
	 * here must not change the command's feedback.
	 */
	persist(values: StateValues): void;
	/**
	 * Publishes user-visible feedback outside model context, at the severity the notice
	 * carries (see {@link FeedbackTransport}).
	 */
	readonly feedback: FeedbackTransport;
	/**
	 * Whether the session this command runs in has a UI, as the adapter resolved it.
	 *
	 * The framework draws no conclusion from it: a gate such as "only a main session with a
	 * UI may act" belongs to the extension's shared logic, which reads this fact instead of
	 * a native one.
	 */
	readonly hasUI: boolean;
	/**
	 * The transport this invocation's marker updates are published through.
	 *
	 * The framework publishes after each declared-value write and its persistence attempt,
	 * so the area always renders a value that already holds — never one the medium might
	 * refuse.
	 */
	readonly markers: MarkerTransport;
}

/**
 * The facts, the declared-value seam and the retainable capability one command handler receives.
 *
 * An adapter supplies the invocation facts; the framework adds the seam and the capability, so
 * the seam is the framework's own read/write path to the extension's declared value and a
 * handler never reaches a State store. `persist` and `markers` stay on the delivery because the
 * seam publishes and records through them — a handler uses them only through the seam.
 */
export interface CommandDelivery extends CommandInvocation {
	/** The seam through which this handler reads and writes the extension's declared value. */
	readonly state: DeclaredValueSeam;
	/**
	 * The owner-scoped capability this handler may retain for the effects it drives outside this
	 * delivery (see {@link OwnerCapabilityHandle}).
	 *
	 * Retaining it is what lets an extension's own background callback — the heartbeat timer that
	 * disarms it, the outbound flusher — keep writing this owner's declared value and keep
	 * publishing feedback after the delivery is over, without the framework exposing an
	 * owner-resolving write or feedback API. It stops working when the owner's session ends.
	 */
	readonly capability: OwnerCapabilityHandle;
}

/**
 * The facts one routed `actions` command hands to the action it selected.
 *
 * An `actions` command drives no declared State — it is a named business action, not a
 * transition of the extension's activation value — so its delivery is the invocation facts
 * alone: the argument that matched, the owner scope, the faithful `hasUI` fact, the idle query,
 * and the two effect transports. Neither the declared-value seam nor a retainable capability is
 * here, because there is no field for either to be scoped to, and the extension's own business
 * data is its own rather than framework State.
 */
export interface ActionDelivery {
	/** The argument text the user supplied after the command name. */
	readonly args: string;
	/** The owner whose extension this action runs for, as the adapter resolved it. */
	readonly owner: OwnerReference;
	/** Whether the session this command runs in has a UI, as the adapter resolved it. */
	readonly hasUI: boolean;
	/** The framework's idle query for the session this command runs in. */
	readonly canAcceptInput: CanAcceptInput;
	/**
	 * The provider the session this command runs in currently runs, or `undefined` when the
	 * harness reports no current model (see {@link CommandInvocation.provider}).
	 */
	readonly provider: string | undefined;
	/** The unified extension feedback channel of this invocation. */
	readonly feedback: FeedbackTransport;
	/** The transport this invocation's marker updates are published through. */
	readonly markers: MarkerTransport;
}

/** One command the framework bound from a definition, ready for native registration. */
export interface BoundCommand {
	readonly name: string;
	readonly description?: string;
	/**
	 * Runs when the harness invokes the command, supplied with its invocation facts.
	 *
	 * An `actions` command returns the promise of the action it routed to, so the harness's own
	 * command chain waits for the effect rather than answering the operator before it finished;
	 * every other control kind concludes synchronously and returns nothing.
	 */
	run(invocation: CommandInvocation): void | Promise<void>;
}

/**
 * One native fact about a model request/response cycle, as the adapter mapped it.
 *
 * The adapter maps *facts*, not edges: it reports that a request started, that a response
 * boundary arrived, that the response's usage updated while it streamed, and that the cycle
 * settled — with whatever that fact carried. Which of those facts mint a Turn, which Turn a later
 * fact belongs to, which readings are final, and what a conflict between two final readings means
 * are the framework's own rules, so an adapter never mints an identity, never matches one fact to
 * another and never decides that a delivery should be dropped.
 *
 * The signals a single Turn produces arrive in the order the harness produced them for one
 * session: `request_started`, then `response_received` once the response boundary is known, zero
 * or more `usage_streamed` while the body streams, and finally `response_settled`. A cycle whose
 * request start was never observed is reported by its settle alone, and the framework drops it
 * rather than fabricating the start.
 */
export type TurnSignal =
	| {
			/** A model request really began for this session. */
			readonly kind: "request_started";
			readonly session: SessionFacts;
			/** When the request began, on the process's own clock. */
			readonly at: number;
			readonly provider: string;
			readonly model: string;
	  }
	| {
			/** The provider's response boundary arrived, before its body was consumed. */
			readonly kind: "response_received";
			readonly session: SessionFacts;
			readonly http: ProviderHttpFacts;
	  }
	| {
			/** The response's usage changed while the body was still streaming. */
			readonly kind: "usage_streamed";
			readonly session: SessionFacts;
			readonly usage: TurnUsage;
	  }
	| {
			/** The response settled: the cycle's outcome and every final usage reading it reported. */
			readonly kind: "response_settled";
			readonly session: SessionFacts;
			/** When the response settled, on the process's own clock. */
			readonly at: number;
			readonly outcome: TurnOutcome;
			/**
			 * Every *final* usage reading this harness reported for the cycle, in observation order.
			 *
			 * A reading observed while the response was still streaming is not one of these (it is
			 * reported through `usage_streamed`), so it can never be mistaken for the final usage or
			 * make one conflict. An empty list means the harness reported none.
			 */
			readonly readings: readonly TurnUsage[];
			/** The provider-issued response id the settled assistant message carried, when it carried one. */
			readonly responseId?: string;
	  };

/**
 * One mapped Turn signal together with the per-delivery facts its own harness context carries.
 *
 * The adapter frames each signal the way it frames every other delivery: it resolves the owner of
 * the session the native fact came from, whether that session has a UI, and the feedback channel
 * to publish through. Which of those reach a handler is the framework's decision, not the
 * adapter's.
 */
export interface TurnSignalFacts {
	readonly signal: TurnSignal;
	readonly owner: OwnerReference;
	readonly hasUI: boolean;
	readonly feedback: FeedbackTransport;
}

/** The registration and feedback surface a harness adapter must provide. */
export interface HarnessPort {
	/** Sets the extension's display label for this binding. */
	setLabel(label: string): void;
	/**
	 * Publishes a user-visible diagnostic.
	 *
	 * Implementations must use a channel outside model context: never injected prompts,
	 * conversation entries, tool output, or any other content a model could read.
	 */
	reportDiagnostic(message: string): void;
	/**
	 * Registers the framework's semantic session hook: one delivery per semantic session
	 * event the adapter observes.
	 *
	 * Session events only. A per-user-turn run initiation is a separate semantic hook and
	 * must never arrive here: a run does not change the session's identity, and a delivery
	 * would reseed the session's State from its branch once per turn.
	 */
	onSession(handler: (session: SessionDelivery) => void): void;
	/**
	 * Registers the framework's round hook: one observation per native run-cycle fact the adapter
	 * observes for the session this binding serves.
	 *
	 * Run-cycle facts only — a run starting, a run settling — and each with the harness's own
	 * continuation flag. Which of them opens a round, which continues one and which ends one is
	 * the framework's synthesis, so this hook must not filter or merge them: a settle is reported
	 * however the session's idle facts stand at that instant (the framework re-checks those
	 * later), and a start is reported even while a round is already open. A run initiation is a
	 * separate hook (`onRunInitiation`) and must never be reported here, because a round may
	 * contain several runs.
	 */
	onRound(observer: (observation: RoundObservation) => void): void;
	/**
	 * Arranges one callback on the harness's next task: after the callback that is running has
	 * returned and the host has had its chance to settle.
	 *
	 * The framework's one use is the round end candidate's re-check: a harness reports a run as
	 * over before its own work has unwound, so the candidate is re-checked once the host has
	 * moved on rather than guessed at the instant the native callback ran. One call arranges one
	 * callback — this is not a timer and carries no duration, so nothing here decides how long a
	 * settle takes, and the framework never polls.
	 */
	nextTask(callback: () => void): void;
	/**
	 * Registers the framework's run-initiation semantic hook: one delivery per agent-run
	 * initiation, and none for a tool continuation or a further model request inside one
	 * run.
	 *
	 * The adapter commits whatever the handler returns by appending one hidden, persisted,
	 * agent-attributed contribution at the end of the conversation. The handler itself
	 * writes nothing, so a delivery that arrives again for the same run plans the same
	 * contribution instead of advancing anything.
	 *
	 * The handler may return a promise, and an adapter must hand the harness a hook that waits
	 * for it: this is the framework's one awaitable position before a model request, which is
	 * where a one-time initialization is settled so that the request it was started for is
	 * issued with the initialization's result rather than beside it.
	 */
	onRunInitiation(
		handler: (run: RunDelivery) => PromptContribution | undefined | Promise<PromptContribution | undefined>,
	): void;
	/**
	 * Registers the framework's model-cycle hook: one delivery per native Turn signal the adapter
	 * mapped for the session this binding serves.
	 *
	 * The signals arrive as facts (see {@link TurnSignal}); the framework owns the Turn identity,
	 * the in-flight association, the normal deduplication and the conflict rules, so the adapter
	 * must not mint an identity, match one fact to another, or decide which facts are dropped.
	 *
	 * The harness's own `turn_end` event — which fires once the requested tools have run — is
	 * deliberately *not* one of these signals: tool execution is outside the Turn. The adapter
	 * maps the request hook, the response-boundary hook and the finalized assistant message.
	 */
	onTurn(handler: (facts: TurnSignalFacts) => void): void;
	/**
	 * Registers the framework's subagent-runtime hook: one observation per native execution-duration
	 * reading the adapter mapped, for the session this binding serves.
	 *
	 * The hook reports the harness's own measurement of one *execution* — a subagent's own run, whose
	 * duration the harness states while it is running and once it is over — together with the actual
	 * session that execution belongs to. It is neither a Round edge nor a Turn, the final reading of
	 * an execution is not the end of the session's Round, and a session's persisted wall-clock span
	 * is a different metric that must never be reported here in a runtime's place. An adapter that
	 * cannot read the duration, or cannot attribute the execution to a session, reports that fact
	 * rather than dropping the observation or reporting a zero.
	 */
	onSubagentRuntime(handler: (delivery: SubagentRuntimeDelivery) => void): void;
	/**
	 * Registers the framework's input hook: one delivery per submission the harness itself
	 * attributed to the user and admitted to the session this binding serves.
	 *
	 * It is a fact and not an edge: a submission crosses no boundary, so nothing about the session's
	 * axis or its work moves with it, and a harness that publishes no such fact reports none rather
	 * than having the framework infer one from activity. Input is reported *before* the submission
	 * has been decided to be anything else — a prompt, a queued steer, a command the harness handles
	 * itself, a user-invoked skill — so a fact that turns out to be none of a consumer's business is
	 * still reported, and nothing here filters on the submission's text or on its source beyond the
	 * one distinction the delivery states: whether the *user* submitted it.
	 *
	 * The adapter owns that distinction, because only the harness's own event carries it.
	 */
	onUserInput(handler: (delivery: UserInputDelivery) => void): void;
	/**
	 * The harness's own model prices, when its adapter can report them.
	 *
	 * A harness whose model catalog states what a model costs — the subscription-backed channels
	 * are the ones that need this — maps those facts here, as plain catalog prices and never as a
	 * native model, registry or context. The framework hands the query to the extension's factory
	 * (`ImplementationContext.modelPrices`) and never queries it itself: whether a channel is priced
	 * from the extension's own data or from the harness's catalog is the extension's business.
	 * An adapter that reports no prices omits the member, and the extension is then handed no such
	 * fact rather than an empty one.
	 */
	modelPrices?: CatalogPriceSource;
	/**
	 * The harness's current access to the providers it serves, when its adapter can resolve one.
	 *
	 * A provider query an extension makes for itself — a balance or an allowance — needs the
	 * credential and the address the host is using *now*, which is a fact only the adapter can read:
	 * it maps those here as the plain query of {@link ProviderAccess}, never as a native registry or
	 * credential store. The framework hands the query to the extension's factory
	 * (`ImplementationContext.providerAccess`) and asks it once per operation, never interpreting an
	 * answer itself. An adapter that resolves no native access omits the member, and the extension is
	 * then handed no such fact rather than a query that always answers nothing.
	 */
	providerAccess?: ProviderAccess;
	/**
	 * The session the host is displaying, when its adapter publishes one.
	 *
	 * It is the fact behind the framework's one marker area: the area projects the displayed
	 * session's effective State rather than the State of whichever session's delivery happened to
	 * publish last, so an operator looking at a subagent sees what that subagent's own declaration
	 * says — the owner's current value for a field that follows, the declared default for one that
	 * does not — and the view moving re-projects the area without an owner changing, a State moving
	 * or a capability being granted. An adapter that cannot resolve the displayed session omits the
	 * member: the framework then projects the position each delivery carries, exactly as it did
	 * before such an outlet existed.
	 */
	viewedSession?: ViewedSessionPort;
	/** Registers one bound command with the harness's command surface. */
	registerCommand(command: BoundCommand): void;
}

/** Why an extension was not bound. */
export type BindingFailure =
	| {
			/**
			 * The definition breaks one of the framework's configuration rules — it declares
			 * competing declarations, or its declared configuration (the declaration or the file
			 * it names) is illegal; see {@link ConfigurationViolation}.
			 */
			readonly kind: "configuration";
			readonly violation: ConfigurationViolation;
	  }
	| {
			/** The definition cannot be initialized against this harness. */
			readonly kind: "initialization";
			readonly detail: string;
	  };

/**
 * What binding a definition to a harness concluded.
 *
 * An unbound result carries the reported failures; the extension contributes nothing
 * — no commands, no injections, no marker — and the harness keeps running.
 */
export type BindingResult =
	| { readonly bound: true; readonly definition: ExtensionDefinition }
	| { readonly bound: false; readonly failures: readonly BindingFailure[] };

/** The deterministic text of one binding failure, independent of where it is reported. */
export function describeBindingFailure(extensionId: string, failure: BindingFailure): string {
	const owner = extensionId.length > 0 ? extensionId : "<unnamed extension>";
	switch (failure.kind) {
		case "configuration":
			return `${owner}: configuration error (${failure.violation.kind}): ${failure.violation.detail}`;
		case "initialization":
			return `${owner}: initialization failed, extension not bound: ${failure.detail}`;
	}
}
