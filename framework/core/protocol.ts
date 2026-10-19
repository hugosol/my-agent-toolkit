/**
 * The protocol between the framework's harness-independent behavior and an
 * harness adapter.
 *
 * Adapters translate native capabilities into this port and translate framework
 * outcomes back into native effects; the behavior itself never sees a native API.
 * Failures travel as data, so an adapter can report them on whatever non-model
 * channel its harness offers without deciding what counts as a conflict.
 */
import type { FeedbackTransport } from "../interface/feedback";
import type { CatalogPriceSource, ProviderAccess, ProviderHttpFacts } from "../interface/host-facts";
import type {
	AgentActivity,
	SessionContextReading,
	SessionEvent,
	SessionFacts,
	TurnOutcome,
	TurnUsage,
	UserInputDelivery,
} from "../interface/session";
import type { DeclaredValueSeam, OwnerCapabilityHandle, OwnerReference } from "../interface/state";
import type { ExtensionDefinition } from "./definition";
import type { ConfigurationViolation } from "./violations";

/** The State values one write path records, by field name. */
export type StateValues = Readonly<Record<string, boolean>>;

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
 * The facts one actual session's own disposal carries, as the harness reports it at an awaitable
 * exit position of its own.
 *
 * It is not an edge and not a session event. A session that is being disposed has not moved
 * anywhere: what the harness states is that this actual session is going away, and whether the
 * framework's round axis moves with that fact — an end stated but not yet confirmed, a round left
 * open — is the framework's decision (`behaviors/round-events.ts`). A host that reports a transfer,
 * a rename or a view that moved reports nothing here: only a session really going away does.
 */
export interface SessionDisposal {
	/** The actual session that is going away: its identity, its direct parent and its latest name. */
	readonly session: SessionFacts;
	/** The owner whose agent that session belongs to, as the adapter resolved it. */
	readonly owner: OwnerReference;
	/** Whether that session has a UI, as the adapter resolved it. */
	readonly hasUI: boolean;
	/**
	 * The wait this host's own exit position allows the close-out, in milliseconds, when the host
	 * states a bound of its own.
	 *
	 * It is a fact about the *position the report is made from* rather than about the session: a host
	 * whose teardown will not be held past a certain point states it, so the framework knows how much
	 * of the close-out the position can really wait for. Omitted — what every adapter of this release
	 * states, pi's teardown waiting for a handler without a bound of its own — takes the framework's
	 * built-in default, which is also this close-out's ceiling: a stated wait tightens it and never
	 * lengthens it (see {@link CloseOutWait}).
	 */
	readonly closeOutWaitMs?: number;
	/** The transport any extension feedback published for this fact goes through. */
	readonly feedback: FeedbackTransport;
}

/**
 * One native run-cycle fact the adapter observed, before the framework decides which round edge,
 * if any, it is.
 *
 * `activity_started` is the harness beginning a run — the agent loop taking up work, whether from
 * a fresh prompt or from a continuation the session scheduled for itself. `settled` is a run
 * reaching its native end, carrying the harness's own continuation flag mapped to its two-valued
 * form: `willContinue` is `true` only when the session has already scheduled its next piece of
 * work, and a settle that says nothing is a settle that scheduled nothing, plus — when the
 * surface states one — how the activity that settled ended.
 *
 * The outcome is the same three-valued fact a Turn's end states, read from the same native
 * material: nothing about it is part of the edge, and an adapter that established none states
 * none. It is on the *signal* rather than on the round edge because how a round ended is
 * deliberately not part of the public model — a round that finishes on an ordinary answer, on an
 * error and on an abort ends the same way there — while an activity that was cancelled or failed
 * is exactly the one whose settlement the framework confirms without waiting for work beyond it.
 *
 * Neither is an edge. Which of them opens a round, which continues one, and which ends one is the
 * framework's synthesis ({@link createRoundSynthesis}); an adapter reports facts and decides
 * nothing about transitions.
 */
export type RoundSignal =
	| { readonly kind: "activity_started" }
	| {
			readonly kind: "settled";
			readonly willContinue: boolean;
			/**
			 * How the activity that settled ended, when this surface established it: the harness's
			 * own stopping fact read in the framework's three-valued vocabulary. Absent when no
			 * native fact established one, which is not the same as a completed activity.
			 */
			readonly outcome?: TurnOutcome;
	  };

/**
 * One mapped round-cycle fact together with the per-delivery facts its own harness context
 * carries, plus the two live reads a round's end is confirmed by.
 *
 * Both reads are queries rather than fields because they have to be asked *later* than the fact
 * that raises the question. A harness reports a run as over before its own work has unwound — its
 * session is not idle at that instant, and a queued message or a running asynchronous job may
 * still continue the work — so the framework submits the settle as an end candidate, lets the
 * adapter return so the host can settle, and re-checks them on its next task. A read that answers
 * anything but `true` is not a confirmation: `false` is a session with work left, and `undefined`
 * is a surface that does not report one of those facts at all, which closes no round.
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
	 * Reads, now, whether that actual session's own activity has come to rest: idle, with nothing
	 * queued and no work of the run that just settled still going. `undefined` when this surface
	 * does not report one of those facts — an unestablished quiescence, which is not one.
	 */
	quiescent(): boolean | undefined;
	/**
	 * Reads, now, whether work beyond the run that just settled still holds this actual session:
	 * a third party's delegated work, an asynchronous job whose result will resume it — anything
	 * whose own completion is what will continue the session rather than the run's own loop.
	 *
	 * `false` is the statement that nothing is held and is the only answer that lets a round end
	 * on it; `true` is work the session is still waiting on; `undefined` is a statement this
	 * surface did not establish, which is answered as neither.
	 */
	heldWork(): boolean | undefined;
}

/**
 * One native context reading an adapter collected for one actual session, before the framework
 * decided whether it is a change.
 *
 * It is a *fact* and not an edge: the adapter reports that it read a session's context at one of
 * its own collection points — the session's start, a finalized message, the run's own execution
 * convergence — and the framework owns what that means. Which session a reading belongs to and
 * whether anything is published for it is decided there, exactly as it is for every other axis.
 */
export interface SessionContextObservation {
	/** The actual session the reading belongs to: its identity, its direct parent and its latest name. */
	readonly session: SessionFacts;
	/** The owner that session follows, as the adapter resolved it. */
	readonly owner: OwnerReference;
	/** The reading itself, with the model that session ran when it was collected. */
	readonly reading: SessionContextReading;
	/** Whether the session this reading came from has a UI, as the adapter resolved it. */
	readonly hasUI: boolean;
	/** The transport this delivery's extension feedback is published through. */
	readonly feedback: FeedbackTransport;
}

/**
 * One actual session's observation as it crosses a process boundary: the session's own facts, the
 * owner it follows, and the readings currently known for it.
 *
 * It is what the process that *runs* a session hands the process that serves the owner that session
 * follows, and it travels in the observation direction of the framework's local access. The facts
 * are the ones the running process resolved from its own host — never a name, a path or a process id
 * read as an identity on the way — and the two readings are the same ones the framework's own
 * observation source holds: the activity the running process's Round bookkeeping last left the
 * session in, and the latest context reading its adapter collected for it. An absent reading is the
 * honest absence rather than a zero, exactly as it is in the source.
 *
 * A session's identity travels with every reading of it, so the receiving process records the facts
 * and the owner from the same word it takes readings from, and an arriving word is adopted as the
 * reading it is: nothing here drives a Round, mints a Turn or accounts a request.
 */
export interface ObservedSession {
	/** The actual session's own facts, as the process that runs it resolved them. */
	readonly session: SessionFacts;
	/** The owner that session follows — the seat this observation belongs to. */
	readonly owner: OwnerReference;
	/** The activity the running process's Round bookkeeping last left that session in, when it has one. */
	readonly activity?: AgentActivity;
	/** The latest context reading that process collected for the session, when it has one. */
	readonly context?: SessionContextReading;
	/**
	 * How many writes of the session's own extension data that process has confirmed in the storage it
	 * shares with the process serving this owner, when it has confirmed any.
	 *
	 * It is a *notice* rather than a reading of the session: what it states is that the storage the two
	 * processes share holds something this session committed, so a process whose basis of that storage
	 * predates it knows it has something to read again. Nothing of the file crosses with it — what
	 * travels is a count and never a figure from the document — and it is not a Round, a Turn or a
	 * request: the receiving process mints none of them for it, and a consumer that adopts it reads the
	 * storage itself rather than any value carried here.
	 *
	 * The process that really confirmed the writes is what counts them, so the same count stated again
	 * is the same notice rather than a new one, and a count a later connection states is that process's
	 * own count rather than a continuation of an earlier one. An absent member is the honest absence: a
	 * session nothing has confirmed a write for states none rather than a zero.
	 */
	readonly commits?: number;
}

/**
 * One source of another process's readings: the one connection a serving process admitted for a
 * seat, numbered by that process in the order it admitted them.
 *
 * It is an ordering and nothing else — never the identity of the session that delivered, never a
 * liveness proof, and never a value anything is keyed by beyond the process that numbered it. What
 * it answers is which of two words about one session is the newer one: a word carried by a
 * connection admitted later is the newer reading, so a connection that ends late, or a word that
 * arrives late over a connection admitted earlier, neither overwrites nor withdraws what a later
 * admission already stated. Each serving process numbers its own sources, and a source is only ever
 * compared with one that same process handed to the same sink.
 */
export type ObservationSource = number;

/**
 * Where the readings one seat receives arrive, and how the source each of them came over is named.
 *
 * It is the receiving half of the access, as the framework's own rules need it: the sink itself
 * decides nothing about adopting a reading — {@link SessionObservationAccess.receive}'s whole
 * surface is this pair.
 */
export interface SessionObservationSink {
	/** Adopts one word one source delivered: one session's facts and the readings that came with it. */
	adopt(source: ObservationSource, reading: ObservedSession): void;
	/**
	 * States that one source's readings are no longer available.
	 *
	 * The source is gone because the connection is: the process that delivered over it released its
	 * access or ended, or this side observed the connection close or fail. Nothing is stated about the
	 * sessions themselves — their identity, their direct parent and whatever they saved are the
	 * session's own facts and not the connection's — so what a loss withdraws is the live readings
	 * that source was carrying.
	 */
	lost(source: ObservationSource): void;
}

/**
 * The framework's cross-process half of session observation, as one adapter's local access supplies
 * it: the process that serves an owner's seat and the process that runs a session following that
 * owner, each with the one direction it speaks.
 *
 * `receive` is the serving half. The process that serves a seat offers it here for exactly as long as
 * it serves that owner, and the readings a session the harness ran in another process delivers are
 * handed to the sink together with the source they arrived over. Nothing else crosses: the carrying,
 * the connection, the target check, the access's own verification and the numbering of the
 * connections it admits are the adapter's, and what the framework does with a reading that arrived —
 * and with the source that carried it — is the framework's own rules (see `core/observations.ts` and
 * `behaviors/binding.ts`).
 *
 * `deliver` is the reading half. A reading of a session this process runs whose owner it does not
 * serve is handed here, and the adapter carries it to the process serving that owner over the same
 * access — the first word it sends to a seat carries the readings that process currently holds for
 * the owner's sessions, so a reading collected before the access was reached is not lost, and an
 * access reached again after it ended states the readings it holds now rather than waiting for them
 * to move once more.
 *
 * Neither half is a write path to anything: a reading states what a session was observed to be, and
 * a seat's declared State values are read and never written from here.
 */
export interface SessionObservationAccess {
	/**
	 * Admits the readings delivered for one owner this process serves: `ownerKey` is that owner's
	 * key — the seat's own owner half — and the returned function withdraws exactly this admission.
	 */
	receive(ownerKey: string, sink: SessionObservationSink): () => void;
	/** Delivers one reading of one session this process runs to the process that serves its owner. */
	deliver(reading: ObservedSession): void;
}

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
 * handler never reaches a State store. The delivery is constructed from the approved members
 * rather than spread from the invocation: the marker area transport stays internal, and a
 * handler affects its own line only through the seam's managed write.
 */
export interface CommandDelivery {
	/** The argument text the user supplied after the command name; `""` when there is none. */
	readonly args: string;
	/**
	 * The framework's idle query for the session this command runs in (see
	 * {@link CanAcceptInput}).
	 */
	readonly canAcceptInput: CanAcceptInput;
	/**
	 * The provider the session this command runs in currently runs, or `undefined` when the
	 * harness reports no current model (see {@link CommandInvocation.provider}).
	 */
	readonly provider: string | undefined;
	/** The owner whose State this command acts on, as the adapter resolved it. */
	readonly owner: OwnerReference;
	/**
	 * Records the extension's new State values in the owner's persistence medium.
	 *
	 * Best-effort by contract: the extension side cannot observe a persistence failure, the
	 * declared value is already the in-memory current value, and a throw here must not change
	 * the command's feedback.
	 */
	persist(values: StateValues): void;
	/**
	 * Publishes user-visible feedback outside model context, at the severity the notice
	 * carries (see {@link FeedbackTransport}).
	 */
	readonly feedback: FeedbackTransport;
	/** Whether the session this command runs in has a UI, as the adapter resolved it. */
	readonly hasUI: boolean;
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
 * the running provider and the feedback channel. Neither the declared-value seam nor a
 * retainable capability is here, because there is no field for either to be scoped to, and the
 * extension's own business data is its own rather than framework State. The marker area
 * transport stays internal: an action has no line to manage.
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

/**
 * Why an entry's subagent integration did not take effect on a harness that has such an
 * integration to settle.
 *
 * `registration` — the party that loads this entry into the sessions it spawns was reached, and it
 * did not accept the requirement this entry has to state there. `identity` — the reached party
 * answered for another session than the one this entry serves, so nothing it loads serves this
 * session. `protocol` — the reached party answered, and not on the versioned interface this entry
 * reads. The three are different failures with different remedies, which is why none of them is
 * reported as the others and none of them is reported as a harness that offers no such integration.
 */
export type SubagentIntegrationFailure = "registration" | "identity" | "protocol";

/**
 * How one extension entry's subagent integration stands on the harness that bound it, as the
 * adapter settled it once at the process's initialization node.
 *
 * `subagents` — this entry is integrated with the harness's subagent facility: the sessions that
 * facility spawns are observed with this entry, and the facts of those sessions reach consumers.
 * `none` — this harness has no such facility for this entry, or it is not enabled in this process.
 * That is a supported, normal shape: the entry serves the main session without integrated child
 * observations, and it asserts nothing about subagents the harness may run without it.
 *
 * `failed` — this entry's integration was attempted and did not take effect. It is deliberately not
 * `none`: an operator has to be able to tell a harness that offers no integration from one whose
 * integration broke, and neither may be inferred from the other. The failure carries which part
 * failed and the diagnosis the adapter reported for it.
 *
 * The mode is settled when initialization completes and never moves afterwards: it is not decided
 * by how many child sessions exist, and no later observation, registration or discovery changes it.
 */
export type SubagentIntegration =
	| { readonly mode: "subagents" }
	| { readonly mode: "none" }
	| {
			readonly mode: "failed";
			readonly failure: SubagentIntegrationFailure;
			readonly diagnosis: string;
	  };

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
	 * Registers the framework's disposal hook, when this adapter has a position to report one from:
	 * one call per actual session this harness is disposing, made at the host's own awaitable exit
	 * position.
	 *
	 * The fact is the harness's, the close-out is the framework's: the framework ends the round that
	 * session still held — confirming the end it had already stated, or truncating the round it left
	 * open — and answers this call once everything that edge owes has settled, so a host that waits
	 * for the answer lets a session's last consumption be committed before its process leaves. The
	 * adapter reports nothing but the fact: it neither decides an edge nor saves anything itself.
	 *
	 * Only a session that is really going away is reported, and only the actual session the report
	 * names: a session the host merely left — a transfer to another session, a name change, a view
	 * that moved — is no disposal, and no round is closed for one.
	 *
	 * The registration happens only for an extension that observes the round or Turn axis, because a
	 * binding that observes neither holds no such bookkeeping to close. An adapter whose host states
	 * its disposals only where the framework's own facts already reach — a process-exit fact whose
	 * observers this framework does not extend past their own semantics — omits the member, and a
	 * session this host disposes then leaves its round to the facts that binding already publishes.
	 */
	onDisposal?(handler: (disposal: SessionDisposal) => void | Promise<void>): void;
	/**
	 * Registers the framework's context-collection hook: one observation per native context reading
	 * the adapter collected for the session this binding serves.
	 *
	 * The adapter owns *where* a reading is collected — the session's own start, a finalized message,
	 * the run's own execution convergence — and reads the host's public context reading there,
	 * together with the model the session ran at that same instant. Which session the reading belongs
	 * to, whether it is a change, and which subscribers it reaches are the framework's rules, so the
	 * adapter must not deduplicate, compare or filter readings: a collection that read the same
	 * numbers as the last one is still reported, and the framework is what decides that it is not a
	 * change. A reading the host states as unknown (pi's `null`) is reported as no collection at all
	 * rather than as a reading of zero.
	 */
	onSessionContext(handler: (observation: SessionContextObservation) => void): void;
	/**
	 * The framework's local access to the sessions this harness runs in another process, when this
	 * adapter can carry observations across that boundary (see {@link SessionObservationAccess}).
	 *
	 * It is the adapter's own business — offering the seat of an owner this process serves, carrying
	 * a reading to the process that serves the owner a session follows, and everything about the
	 * connection — and what crosses this member is only the two directions the framework uses. An
	 * adapter whose harness runs every session in this process omits it, and the framework then
	 * observes into this process's own source alone: a reading is delivered across processes only
	 * where the harness itself can have a session elsewhere.
	 */
	sessionObservationAccess?: SessionObservationAccess;
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
	/**
	 * Settles this entry's subagent integration once per process, when this harness has such an
	 * integration to settle.
	 *
	 * It is the adapter's private business — locating whatever party loads this entry into the
	 * sessions it spawns, requiring the entry there, and reading the party's own answer for the
	 * version, the session and the outcome — and what crosses this member is only the settled
	 * {@link SubagentIntegration} the extension is told about.
	 *
	 * The framework calls it at the process's initialization node, at most once per implementation,
	 * and hands its result to the extension's own initialization. A harness whose integration is a
	 * fact of the harness itself — nothing to reach, nothing to read — answers the value directly,
	 * and nothing then waits for the answer; an answer that is a promise is one with work behind it
	 * (a requirement to take, a party to read), and the first model request waits for that work, so
	 * the entry is in place before a request that could spawn a child session is issued. A
	 * rejection is not a failure of the integration either: the adapter answers `failed` with its
	 * own diagnosis, and an adapter with nothing to settle omits the member and the delivery
	 * carries `none`.
	 */
	subagentIntegration?: () => SubagentIntegration | Promise<SubagentIntegration>;
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
