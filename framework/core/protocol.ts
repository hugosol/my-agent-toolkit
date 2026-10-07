/**
 * The protocol between the framework's agent-runtime-independent behavior and an
 * agent-runtime adapter.
 *
 * Adapters translate native capabilities into this port and translate framework
 * outcomes back into native effects; the behavior itself never sees a native API.
 * Failures travel as data, so an adapter can report them on whatever non-model
 * channel its agent runtime offers without deciding what counts as a conflict.
 */
import type { RequiredSemantic } from "./admission";
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
 * the agent runtime loaded at startup and which carries no transition reason of its own.
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
 * One semantic session event: which way the session axis moved, and why.
 *
 * The two members are a symmetric pair. A `session_start` opens one owner's life as the
 * current session and an `session_end` closes it, and a transition that changes which
 * session is current is one of each — `session_end(transferred)` for the owner being left,
 * followed by `session_start(reason)` for the owner being entered. A navigation that leaves
 * the current owner alone (a tree jump, a reload, a same-file resume, an in-place context
 * reset) is not a transition at all: it produces no event, so nothing downstream can
 * mistake it for one.
 */
export type SessionEvent =
	| { readonly kind: "session_start"; readonly reason: SessionStartReason }
	| { readonly kind: "session_end"; readonly reason: SessionEndReason };

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
 * Two levels, because the two things an extension says to the operator differ in kind:
 * `info` reports an effect that happened, `error` reports one that did not. The framework
 * carries a level through unchanged — it neither reinterprets nor upgrades it — and a
 * session without a UI gets the message on stderr whatever its level, so a level is a
 * severity, never a channel selector.
 */
export type FeedbackLevel = "info" | "error";

/**
 * The transport one delivery's extension feedback is published through.
 *
 * This is the single runtime-independent channel through which an extension tells the
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
 * (admission and session warnings). The two are not merged: framework warnings are not
 * extension feedback, and an extension never publishes on the framework's channel.
 */
export interface FeedbackTransport {
	/** Publishes one notice at the given severity, verbatim. */
	notify(level: FeedbackLevel, message: string): void;
}

/**
 * The facts an agent-runtime adapter resolves for one semantic session event.
 *
 * The adapter answers *which* session the event is about, what that session's branch
 * persisted, and whether the event is the session's own startup or a transition it
 * observed; whether a persisted payload declares a usable value is the framework's own
 * validation rule, so payloads cross the seam unread. Synthesizing these events from the
 * agent runtime's native lifecycle is the adapter's job alone: shared behavior names no
 * native event and decides nothing about which native trigger means what.
 */
export interface SessionDelivery {
	/** The semantic event: which way the session axis moved, and why. */
	readonly event: SessionEvent;
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
export type SessionEventHandler = (delivery: SessionEventDelivery) => void;

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
 * part of the model, because the agent runtimes disagree about that vocabulary (a round that
 * finishes on an ordinary answer, on an error and on an abort ends the same way here) and
 * because the agent's *current* state is a query ({@link CanAcceptInput}) rather than a field
 * of a past transition.
 *
 * The edges are edge-triggered by identity within one binding: `round_start` opens a round and
 * `round_end` closes it, an edge that would repeat the state the previous one left is not
 * delivered at all, and work that continues inside a round — an automatic continuation, a
 * drained queued message — produces no edge. Synthesizing those edges, and suppressing the
 * ones that are not transitions, is the adapter's job alone; shared behavior names no native
 * event and decides nothing about which native occurrence counts as an edge.
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
	/** Whether the session this edge came from has a UI, as the adapter resolved it. */
	readonly hasUI: boolean;
	/** The transport this edge's extension feedback is published through. */
	readonly feedback: FeedbackTransport;
}

/** One extension handler for one semantic round event. */
export type RoundEventHandler = (delivery: RoundDelivery) => void;

/**
 * The round-event handlers one assembly injects, keyed by the edge each subscribes to.
 *
 * A round handler is a subscriber like a session one and arrives the same way: the definition
 * stays plain data, and what runs on an edge is injected at assembly time. This alias names the
 * round half on its own, for an assembly that keeps the two axes' subscriptions apart.
 */
export type RoundEventHandlers = Readonly<Partial<Record<RoundEvent["kind"], RoundEventHandler>>>;

/**
 * Any semantic lifecycle event the framework models: the session axis and the round axis.
 *
 * The two axes are orthogonal and never merged — entering a session is not starting work, and
 * starting work does not change which session is current — so this union exists only where one
 * assembly injects its handlers for both.
 */
export type SemanticEvent = SessionEvent | RoundEvent;

/** The delivery each semantic event kind carries, so a handler's kind and its facts stay paired. */
export interface SemanticEventDeliveryMap {
	readonly session_start: SessionEventDelivery;
	readonly session_end: SessionEventDelivery;
	readonly round_start: RoundDelivery;
	readonly round_end: RoundDelivery;
}

/**
 * The semantic handlers one assembly injects, keyed by the event each subscribes to.
 *
 * This is the whole subscription surface of one binding: the session axis and the round axis
 * arrive here together, exactly as a directed command's implementations arrive through
 * `CommandActions`. A definition stays plain data either way: it names no handler, and an event
 * kind with no entry subscribes nothing.
 *
 * The session axis is a *reconciliation* trigger as well as a subscription — the framework
 * applies its own behavior for every delivery whether or not a handler arrived — while the
 * round axis is subscription only: three-value agent state is not framework State (contract
 * P6), so a round edge changes nothing the framework owns.
 *
 * The subscription is owner-scoped. Only the deliveries of the session that is its own owner
 * reach a handler here: a subagent session's boundaries and rounds, and those of a session
 * whose parent chain leaves the process, belong to the owner that session follows, so they are
 * dispatched to no handler. The framework's own behavior is unaffected — it runs for every
 * delivery, and owns nothing in a session that is not its own owner.
 */
export type SemanticEventHandlers = Readonly<{
	readonly [K in SemanticEvent["kind"]]?: (delivery: SemanticEventDeliveryMap[K]) => void;
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
 * The facts an agent-runtime adapter resolves for one agent-run initiation.
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
 * conversation, where the agent runtime persists it with the rest of the turn.
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
 * The implementation an agent-runtime assembly injects for one declared directed
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
 * `undefined` — this agent runtime reports no idle fact at all, which is surfaced rather than
 * answered with a value the runtime never gave. The three-valued answer is the honest one: a
 * runtime whose session context exposes no idle fact cannot be read as either state, and an
 * extension that needs the fact decides for itself what an unreported one means (the framework
 * does not decide it for the extension by inventing `false`).
 *
 * It is a question, never a field: the caller asks when it needs the answer — the arm path asks
 * it for the state it reports — so no earlier event has to have happened, and neither axis's
 * delivery carries the fact as a payload.
 */
export type CanAcceptInput = () => boolean | undefined;

/**
 * The facts an agent-runtime adapter supplies for one command invocation.
 *
 * A command is registered natively at binding time, before any session fact exists;
 * the adapter resolves the argument, the owner, whether the session has a UI, its idle fact,
 * and the two effect transports only when the agent runtime runs it. Both effects belong to the
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

/** One command the framework bound from a definition, ready for native registration. */
export interface BoundCommand {
	readonly name: string;
	readonly description?: string;
	/** Runs when the agent runtime invokes the command, supplied with its invocation facts. */
	run(invocation: CommandInvocation): void;
}

/** The registration and feedback surface an agent-runtime adapter must provide. */
export interface AgentRuntimePort {
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
	 * Registers the framework's semantic round hook: one delivery per round edge the adapter
	 * observes for the session this binding serves.
	 *
	 * Round edges only, and only the ones that are transitions: opening a round that is already
	 * open, or closing one at a settle that is not quiescence, is not an edge and must not arrive
	 * here. A run initiation is a separate hook (`onRunInitiation`) and must never be reported as
	 * a round edge, because a round may contain several runs.
	 */
	onRound(handler: (round: RoundDelivery) => void): void;
	/**
	 * Registers the framework's run-initiation semantic hook: one delivery per agent-run
	 * initiation, and none for a tool continuation or a further model request inside one
	 * run.
	 *
	 * The adapter commits whatever the handler returns by appending one hidden, persisted,
	 * agent-attributed contribution at the end of the conversation. The handler itself
	 * writes nothing, so a delivery that arrives again for the same run plans the same
	 * contribution instead of advancing anything.
	 */
	onRunInitiation(handler: (run: RunDelivery) => PromptContribution | undefined): void;
	/** Registers one bound command with the agent runtime's command surface. */
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
			/** The definition cannot be initialized against this agent runtime. */
			readonly kind: "initialization";
			readonly detail: string;
	  }
	| {
			/**
			 * The agent runtime cannot honor a required framework semantic; see
			 * {@link RequiredSemantic}.
			 */
			readonly kind: "required-semantics";
			readonly missing: readonly RequiredSemantic[];
	  };

/**
 * What binding a definition to an agent runtime concluded.
 *
 * An unbound result carries the reported failures; the extension contributes nothing
 * — no commands, no injections, no marker — and the agent runtime keeps running.
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
		case "required-semantics":
			return `${owner}: required semantics missing (${failure.missing.join(", ")}), extension not bound`;
	}
}
