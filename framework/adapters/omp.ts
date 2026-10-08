/**
 * The OMP adapter: the only framework module that touches the harness's native
 * surface, and therefore the only place a native escape hatch (`pi.*`) may appear.
 *
 * It translates the native API into the framework's port before any behavior runs and
 * translates framework outcomes back into native effects. It carries no extension
 * semantics: what to register comes from the definition, whether it may be registered
 * is decided by the harness-independent behavior, and what a command does is the
 * framework's control behavior — this file only resolves the native facts that
 * behavior needs.
 */
import { bindExtension } from "../behaviors/binding";
import { type DeclarableRequiredSemantic, type RequiredSemantic } from "../core/admission";
import { activationField, type ExtensionDefinition, statePersistence } from "../core/definition";
import type {
	HarnessPort,
	BindingResult,
	CanAcceptInput,
	CommandActions,
	FeedbackTransport,
	MarkerTransport,
	NoticeTransport,
	OwnerReference,
	RoundDelivery,
	RoundEvent,
	SemanticEventHandlers,
	SessionEvent,
	SessionStartReason,
} from "../core/protocol";
import { StateStore } from "../core/state";

/** Re-exported because it is what {@link OmpExtensionFactory} returns. */
export type { BindingResult } from "../core/protocol";

/** Re-exported because an assembly implements the directed commands it injects through them. */
export type {
	CommandActions,
	CommandDelivery,
	DeclaredValueSeam,
	DirectedCommandImplementation,
	DirectedDirective,
	RecognizedDirective,
} from "../core/protocol";

/** Re-exported because an assembly subscribes its semantic lifecycle handlers through them. */
export type {
	CanAcceptInput,
	RoundDelivery,
	RoundEvent,
	RoundEventHandler,
	RoundEventHandlers,
	SemanticEvent,
	SemanticEventHandlers,
	SessionEndReason,
	SessionEvent,
	SessionEventDelivery,
	SessionEventHandler,
	SessionEventHandlers,
	SessionStartReason,
} from "../core/protocol";

/** Re-exported because an assembly declares the semantics its extension depends on through it. */
export type { DeclarableRequiredSemantic, RequiredSemantic } from "../core/admission";

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
 * (`type: "custom"`) and the injected-prompt contribution (`type: "custom_message"`).
 * Whether a payload declares a usable value is the framework's validation rule, so the
 * adapter hands payloads over unread.
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
		readonly parentId?: string;
	};
	/** The session manager, read for the session identity and the branch entries. */
	readonly sessionManager: {
		getSessionId(): string;
		/** The entries on the current branch, root to leaf. */
		getBranch(): readonly OmpSessionEntry[];
	};
	/** Whether a UI is available; feedback falls back to stderr when it is not. */
	readonly hasUI: boolean;
	/** The session's UI channel, the surface both feedback and the marker area use. */
	readonly ui: OmpUiContext;
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
	 * The session's asynchronous jobs, as the harness reports them; `running` names the ones still
	 * going. A job still running is work the agent has not finished, so it too keeps a round open.
	 */
	getAsyncJobSnapshot?(): { readonly running: readonly unknown[] } | null;
}

/**
 * The native session lifecycle events this adapter maps to the framework's semantic session
 * events.
 *
 * The harness's vocabulary is richer than the framework's model: `session_start` is the
 * harness's own startup signal, which carries no reason (the framework's `initial`),
 * `session_switch` and `session_branch` each carry the transition's reason, and
 * `session_shutdown` is the process going away (the framework's `disposed`). `session_tree`
 * is navigation inside one session — the same owner, a different leaf — so it maps to no
 * event at all, which is why the adapter subscribes to nothing for it. Which native event
 * means what is decided here and nowhere else; shared behavior sees only
 * {@link SessionEvent}.
 */
export type OmpSessionEventType =
	| "session_start"
	| "session_switch"
	| "session_branch"
	| "session_tree"
	| "session_shutdown";

/** Why the harness changed sessions, as its event carries it. */
export type OmpSessionReason = "new" | "resume" | "fork" | "branch" | "btw";

/** A native session lifecycle event, as the runner delivers it. */
export interface OmpSessionEvent {
	readonly type: OmpSessionEventType;
	/** The transition's reason: a switch carries `new`/`resume`/`fork`, a branch its own reason. */
	readonly reason?: OmpSessionReason;
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
	 * The injected SDK surface (`pi.pi`).
	 *
	 * Optional because only owner resolution needs it: a top-level main session is its own
	 * owner, so an extension loaded by a harness that injects no SDK surface still runs for
	 * main sessions. Without it, no subagent's owner resolves, and a subagent therefore
	 * follows no activation instead of guessing one.
	 */
	readonly pi?: OmpSdkSurface;
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
) => OmpRunInitiationResult | undefined | void;

/**
 * Assembly options fixed by the public interface.
 *
 * Every member is optional, so an assembly declares only what its extension needs. Version
 * support is deliberately not among them: the Supported harness baseline belongs to the
 * framework (`framework/core/baseline.ts`), and no assembly may supply or widen it.
 */
export interface OmpAdapterOptions {
	/**
	 * Implementations of the definition's directed commands, keyed by command name.
	 *
	 * A directed command is declared in the definition and implemented here, in the
	 * extension's own assembly: the framework runs the implementation on every recognized
	 * invocation and never deduplicates it, and the implementation writes the declared value
	 * itself through the delivery's declared-value seam, so the HTTP, protocol, idempotence
	 * and the value the command leaves behind all stay extension business. Omitted when the
	 * definition declares no directed command; a directed declaration without its
	 * implementation is refused at binding.
	 */
	readonly actions?: CommandActions;
	/**
	 * The assembly's handlers for the definition's semantic lifecycle events, keyed by the event
	 * each subscribes to: the session axis (`session_start`/`session_end`) and the round axis
	 * (`round_start`/`round_end`).
	 *
	 * This is where an extension's shared logic reacts to a boundary. For a session event the
	 * framework's own behavior — retiring the ending owner's cell, seeding the starting one,
	 * refreshing the marker area — has already run, and the delivery carries the owner scope, the
	 * `hasUI` fact and the unified feedback channel, so the same shared logic serves the command
	 * seam and this one. For a round edge there is no framework behavior to have run: the agent's
	 * work state is the extension's own, so the edge is handed over as the adapter observed it.
	 * The subscription is owner-scoped: only the deliveries of the session that is its own owner
	 * arrive, so a subagent session's boundaries and rounds reach no handler — the effect body an
	 * extension drives here belongs to the session that armed it, not to a session that follows it.
	 * Omitted when the extension observes no boundary; an event kind with no handler subscribes
	 * nothing, and the session framework behavior runs either way. A handler is a semantic
	 * subscriber, never a native one: the definition names no handler and no native event.
	 */
	readonly events?: SemanticEventHandlers;
	/**
	 * The framework semantics this extension depends on beyond the ones every binding already
	 * requires, as the extension's own assembly declares them.
	 *
	 * Some extensions are built on a capability the framework cannot promise on every agent
	 * harness: one that drives effects from the session axis and the round axis needs those
	 * events to exist at all. Declaring the dependency is what makes a harness that cannot honor
	 * it refuse the binding with a `required-semantics` failure — explicitly, with nothing
	 * registered — instead of letting the extension run with the half of its capability that
	 * happens to work. Omitted when the extension depends on nothing beyond the framework's own
	 * requirements, which is the case for an extension that observes no lifecycle event.
	 */
	readonly requiredSemantics?: readonly DeclarableRequiredSemantic[];
	/**
	 * The directory the definition's declared configuration paths are relative to: this
	 * assembly's own extension repository root, as plain data.
	 *
	 * The loader discovers an extension by an absolute path while the process runs in an
	 * arbitrary project directory, so the convention `extensions/<definition.id>/config.yaml`
	 * — and any relative `config.path` — cannot be resolved against the process's own working
	 * directory. The assembly, whose module lives in that repository, is the one party that
	 * knows the root, and it supplies it here. An absolute declared path is unaffected.
	 * Omitted when the definition declares no configuration, and omitted by an assembly that
	 * has no directory to name; the framework then resolves a relative path against the
	 * process's working directory, as it did before this option existed.
	 */
	readonly configBaseDir?: string;
}

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
		readonly sessionManager?: { getSessionId(): string };
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
	/**
	 * The version the harness reports through its own SDK namespace.
	 *
	 * This is the only version surface the extension interface exposes, so it is what
	 * version admission compares against the framework's Supported harness baseline.
	 * A surface without it reports no version, and admission then has nothing to compare.
	 */
	readonly VERSION?: string;
}

/**
 * The State cell key of a session that owns its own State.
 *
 * The key is the session's own identity, never a process-level label such as the
 * `"Main"` registry id: two sessions in one process share the label but not the key. The
 * kind prefix keeps the key namespace explicit; a main session is the only kind that ever
 * holds State, so it is the only kind this key form is produced for.
 */
function mainOwnerKey(sessionId: string): string {
	return `main:${sessionId}`;
}

/**
 * The version the harness reports, when its extension surface reports one.
 *
 * The injected SDK namespace carries the harness's own version constant; a surface that
 * carries none reports no version, and admission then has nothing to compare against the
 * framework's Supported harness baseline.
 */
function reportedVersion(pi: OmpExtensionApi): string | undefined {
	const version = pi.pi?.VERSION;
	return typeof version === "string" && version.trim().length > 0 ? version : undefined;
}

/**
 * The framework semantics this harness cannot honor, as this adapter can observe them.
 *
 * History preservation rests on the two native paths this adapter uses: a contribution is
 * committed by returning it from the run-initiation hook for the harness to append to the
 * conversation, and State is written only by appending a session entry. A surface missing
 * either path cannot carry that append-only contract, so the adapter reports the semantic as
 * missing and binding refuses instead of degrading the contract.
 *
 * The two semantic lifecycle axes rest on the harness's event subscription: every session
 * boundary and every round edge the framework synthesizes is subscribed through the one
 * `on(event, handler)` surface OMP exposes, so a surface without it can deliver neither axis
 * and the adapter reports both. This is a fact about the harness — which of the two refuses a
 * binding is decided by what that binding's assembly declared, not here.
 *
 * What the adapter cannot observe, it does not claim: whether a surface that subscribes at
 * all would deliver these particular event names is not knowable from the api at binding time,
 * and the facts a *delivery* needs (the session's idle, pending-message and asynchronous-job
 * facts behind quiescence) are per-delivery facts reported when they are asked for, not
 * admission's to judge.
 */
function missingRequiredSemantics(pi: OmpExtensionApi): readonly RequiredSemantic[] {
	const missing: RequiredSemantic[] = [];
	const subscribes = typeof pi.on === "function";
	if (typeof pi.appendEntry !== "function" || !subscribes) missing.push("history-preservation");
	if (!subscribes) missing.push("session-lifecycle-events", "round-lifecycle-events");
	return missing;
}

/**
 * The owner a session's State belongs to: the nearest ancestor session that is itself a
 * top-level main session (a main session is its own owner).
 *
 * The walk uses the harness's own facts — `ctx.agent.parentId` and the official agent
 * registry the harness injects — and never a nesting depth or a process-level label, so a
 * nested subagent resolves level by level to the same root owner and a background fork
 * that carries a parent link follows the same rule. A chain that leaves the process (an
 * ancestor the registry does not hold, a link that loops, an owner whose session is gone)
 * resolves to nothing rather than to a guessed owner.
 */
function ownerReferenceOf(pi: OmpExtensionApi, ctx: OmpSessionContext): OwnerReference {
	if (ctx.agent.kind === "main") {
		const sessionId = ctx.sessionManager.getSessionId();
		return sessionId.length > 0 ? { kind: "owner", key: mainOwnerKey(sessionId) } : { kind: "unresolved" };
	}

	const registry = pi.pi?.AgentRegistry?.global();
	if (registry === undefined) return { kind: "unresolved" };

	const visited = new Set<string>();
	let cursor = ctx.agent.parentId;
	while (cursor !== undefined && !visited.has(cursor)) {
		visited.add(cursor);
		const ref = registry.get(cursor);
		if (ref === undefined) break;
		if (ref.kind === "main") {
			const sessionId = ref.session?.sessionManager?.getSessionId() ?? "";
			return sessionId.length > 0 ? { kind: "inherited", key: mainOwnerKey(sessionId) } : { kind: "unresolved" };
		}
		cursor = ref.parentId;
	}
	return { kind: "unresolved" };
}

/**
 * The persisted State payloads on one session's branch, oldest first.
 *
 * The adapter resolves *which* entries carry this extension's State; whether a payload
 * declares a usable value is the framework's rule, so payloads cross the seam unread, in
 * branch order, with the session's current record last.
 */
function statePayloadsOf(ctx: OmpSessionContext, stateEntryType: string): readonly unknown[] {
	return ctx.sessionManager
		.getBranch()
		.filter(entry => entry.type === "custom" && entry.customType === stateEntryType)
		.map(entry => entry.data);
}

/**
 * The injected-prompt identities one session's branch already persists, oldest first.
 *
 * A persisted contribution is a `custom_message` entry whose custom type is the slot's
 * framework identity. The adapter resolves which identities are present; whether that
 * satisfies a slot is the framework's rule, so identities cross the seam as facts.
 */
function contributionIdentitiesOf(ctx: OmpSessionContext): readonly string[] {
	return ctx.sessionManager
		.getBranch()
		.filter(entry => entry.type === "custom_message" && typeof entry.customType === "string")
		.map(entry => entry.customType as string);
}

/** The semantic start reason each native transition reason stands for. */
const START_REASON_BY_NATIVE: Record<OmpSessionReason, SessionStartReason> = {
	new: "new",
	resume: "resume",
	fork: "fork",
	// A branch stands a new session up from the current one's entries, so both a rewind and a
	// promoted `/btw` answer are a *new* session rather than a fork.
	branch: "new",
	btw: "new",
};

/**
 * The semantic start reason one native transition carries.
 *
 * The native vocabulary is the harness's own — `new`/`resume`/`fork` on a switch,
 * `branch`/`fork`/`btw` on a branch — and the framework's is what the framework's readers
 * understand. A switch names what it did to the session directly; a branch stands a new
 * session up from the current one's entries. `initial` never comes from here: it is the
 * binding's own first session, which only the startup event means, and a transition that
 * names no reason at all is read as a new session.
 */
function startReasonOf(event: OmpSessionEvent): SessionStartReason {
	const reason = event.reason;
	return reason === undefined ? "new" : START_REASON_BY_NATIVE[reason];
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
function ompPort(pi: OmpExtensionApi, definition: ExtensionDefinition): HarnessPort {
	const stateEntryType = `${definition.id}:state`;
	// The owner key this binding currently serves — the session it started and has not ended.
	// It is the whole identity criterion: a native session event that leaves this key alone is
	// no transition, and one that changes it names the owner being left, so no session can
	// read a value another one left behind and no session takes over without the one it
	// replaced being retired first.
	let activeOwnerKey: string | undefined;
	// At most one ownerless diagnostic per binding: the first delivery that resolves no
	// owner reports it, and every later one stays quiet.
	let reportedOwnerless = false;

	// Startup happens before any UI exists, so the diagnostic goes to stderr: it is
	// user-visible and can never reach model context.
	const reportDiagnostic = (message: string): void => {
		process.stderr.write(`${message}\n`);
	};

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
			// Best-effort and user-visible only: this is not the version-admission or
			// required-semantics refusal channel, and the extension stays bound.
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

	/** Whether the agent can take input now, or `undefined` when this context reports no idle fact. */
	const canAcceptInputOf = (ctx: OmpSessionContext): boolean | undefined => {
		if (typeof ctx.isIdle !== "function") return reportMissingFact("idle fact (isIdle)");
		return ctx.isIdle();
	};

	/**
	 * Whether a settled run left the session at quiescence: idle, with nothing queued and no
	 * asynchronous job still running.
	 *
	 * The settle's own continuation flag is read before this, so a run that already scheduled its
	 * next piece of work is a pause inside the round whatever these facts say. When the harness
	 * reports none of them, quiescence cannot be established — and an unestablished quiescence is
	 * not one, so the round stays open rather than being closed on a guess about a harness that
	 * said nothing.
	 */
	const quiescent = (ctx: OmpSessionContext): boolean => {
		if (typeof ctx.isIdle !== "function") {
			reportMissingFact("idle fact (isIdle)");
			return false;
		}
		if (typeof ctx.hasPendingMessages !== "function") {
			reportMissingFact("pending-message fact (hasPendingMessages)");
			return false;
		}
		if (typeof ctx.getAsyncJobSnapshot !== "function") {
			reportMissingFact("async-job fact (getAsyncJobSnapshot)");
			return false;
		}
		return ctx.isIdle() && !ctx.hasPendingMessages() && (ctx.getAsyncJobSnapshot()?.running.length ?? 0) === 0;
	};

	return {
		setLabel: label => pi.setLabel(label),
		reportDiagnostic,
		onSession: handler => {
			const deliver = (event: SessionEvent, owner: OwnerReference, ctx: OmpSessionContext): void => {
				handler({
					event,
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
			};

			/**
			 * One start-type native event (a startup, a switch, a branch), synthesized into the
			 * semantic transition it is.
			 *
			 * The judgment is the owner key, and it is the only thing that decides: a native
			 * transition that leaves the owner this binding already serves alone is not a
			 * transition at all — no event, no retired cell, no reseed — which is what makes
			 * `/reload`, a same-file `/resume`, `/clear` and a TUI `/branch` silent rather than
			 * boundaries. An event that does move the owner to another session is the symmetric
			 * pair: the session being left ends as `transferred` — named by its own key, so its
			 * cell and its effects are found without consulting anything else — and the session
			 * being entered starts with the reason the native event carried.
			 *
			 * A session that is not its own owner has no cell of its own, so it is delivered
			 * with the owner it resolved and takes no part in this bookkeeping: there is
			 * nothing of its own to pair.
			 */
			const startOf = (reason: SessionStartReason, ctx: OmpSessionContext): void => {
				const owner = ownerOf(ctx);
				if (owner.kind !== "owner") {
					deliver({ kind: "session_start", reason }, owner, ctx);
					return;
				}
				if (owner.key === activeOwnerKey) return;

				const endedOwnerKey = activeOwnerKey;
				activeOwnerKey = owner.key;
				if (endedOwnerKey !== undefined) {
					deliver(
						{ kind: "session_end", reason: "transferred" },
						{ kind: "owner", key: endedOwnerKey },
						ctx,
					);
				}
				deliver({ kind: "session_start", reason }, owner, ctx);
			};

			// One semantic event per native session event, and no other native event reaches
			// this hook: a per-turn run initiation is a separate semantic hook, so a run can
			// never arrive here and reseed the session's State.
			pi.on("session_start", (_event, ctx) => {
				// The harness's startup signal carries no reason: this is the session the
				// binding first serves in this process.
				startOf("initial", ctx);
			});
			pi.on("session_switch", (event, ctx) => {
				startOf(startReasonOf(event), ctx);
			});
			pi.on("session_branch", (event, ctx) => {
				startOf(startReasonOf(event), ctx);
			});
			pi.on("session_shutdown", (_event, ctx) => {
				// Only a session this binding started can end: the owner that is ending is the
				// one this binding serves, whatever the shutting-down session resolves now.
				const endedOwnerKey = activeOwnerKey;
				if (endedOwnerKey === undefined) return;
				activeOwnerKey = undefined;
				deliver({ kind: "session_end", reason: "disposed" }, { kind: "owner", key: endedOwnerKey }, ctx);
			});
		},
		onRound: handler => {
			// This binding's own bookkeeping, and the whole of the edge semantics: an edge is
			// delivered only when the session actually crosses it. A start while the round is
			// already open — a further run inside the same active period — is not a transition, and
			// a settle that is not quiescence does not end one either.
			let roundOpen = false;
			const deliverEdge = (kind: RoundEvent["kind"], ctx: OmpSessionContext): void => {
				handler({
					event: { kind },
					owner: ownerOf(ctx),
					hasUI: ctx.hasUI,
					feedback: feedbackTransport(ctx),
				});
			};

			pi.on("agent_start", (_event, ctx) => {
				if (roundOpen) return;
				roundOpen = true;
				deliverEdge("round_start", ctx);
			});
			pi.on("agent_end", (event, ctx) => {
				// A settle that already has its continuation scheduled — an automatic retry, an
				// empty-stop recovery, a compaction or stop-hook turn, a pending asynchronous wake —
				// is a pause inside the round, not the end of it.
				if (event.willContinue === true) return;
				if (!quiescent(ctx)) return;
				// Already idle: there is no open round left to close, so no edge is produced.
				if (!roundOpen) return;
				roundOpen = false;
				deliverEdge("round_end", ctx);
			});
		},
		onRunInitiation: handler => {
			pi.on("before_agent_start", (_event, ctx) => {
				const contribution = handler({
					owner: ownerOf(ctx),
					contributionIdentities: contributionIdentitiesOf(ctx),
					markers: markerTransport(ctx),
				});
				if (contribution === undefined) return undefined;
				// The framework fixed the contribution's visibility, position and attribution;
				// this adapter only writes them into the native payload the loader commits.
				return {
					message: {
						customType: contribution.identity,
						content: contribution.content,
						display: contribution.display,
						attribution: contribution.attribution,
					},
				};
			});
		},
		registerCommand: command => {
			pi.registerCommand(command.name, {
				description: command.description,
				handler: (args, ctx) => {
					command.run({
						args,
						owner: ownerOf(ctx),
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
 * bindings agree on one current value per owner.
 *
 * Version support is not an assembly option: the framework owns the Supported harness
 * baseline, so an assembly describes only the capabilities its extension needs (`actions`,
 * `events`, `requiredSemantics`) and where its declared configuration is resolved from
 * (`configBaseDir`). An extension that needs none of them assembles with no options at all.
 */
export function ompAdapter(definition: ExtensionDefinition, options: OmpAdapterOptions = {}): OmpExtensionFactory {
	const state = new StateStore({
		field: activationField(definition),
		persistence: statePersistence(definition),
	});
	return (pi: OmpExtensionApi): BindingResult =>
		bindExtension(
			definition,
			ompPort(pi, definition),
			state,
			{
				facts: {
					version: reportedVersion(pi),
					missingRequiredSemantics: missingRequiredSemantics(pi),
					// Recorded, never judged: the verified environment is a fact of the support
					// record, and admission consults no field of it.
					environment: { platform: `${process.platform}-${process.arch}`, harness: "omp" },
				},
				requiredSemantics: options.requiredSemantics,
			},
			options.actions,
			options.events,
			// The one thing this assembly knows about the configuration that the framework cannot:
			// the repository its definition's relative declaration is relative to.
			{ baseDir: options.configBaseDir },
		);
}
