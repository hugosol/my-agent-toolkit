/**
 * The public assembly surface: how an extension's implementation reaches the framework, and
 * the generic assembly information a harness adapter binds it with.
 *
 * This is authoring surface, not protocol: `framework/core/protocol.ts` is the seam between the
 * framework's behavior and a harness adapter, while everything here is what an *extension*
 * supplies — the factory that builds its implementation once its configuration validated, the
 * commands and subscriptions that implementation delivers, and the one-time initialization and
 * cleanup entries the framework calls. Nothing in this module names a harness, so an extension's
 * assembly declares itself through `framework/public.ts` and an adapter consumes these types
 * without adding any of its own.
 *
 * The lifecycle is the framework's, and it is short:
 *
 * - the factory is called once, after the definition's configuration was read and validated and
 *   before anything is registered, and what it returns is kept for the life of the process (one
 *   shared business instance per extension, whatever session or subagent binds next);
 * - `initialize` is called at most once, at the node where provider facts are readable, and the
 *   first model request waits for it to settle;
 * - `cleanup` is called at most once, when the session that initialized the instance ends.
 *
 * Creation is not an effect: neither the factory nor returning an implementation may send a
 * remote request or start a timer, because a definition can still be refused afterwards.
 */
import type { FeedbackTransport } from "../interface/feedback";
import type { CatalogPriceSource, ProviderAccess } from "../interface/host-facts";
import type { SessionCapability, SubscriptionGroup } from "../interface/session";
import type { OwnerReference } from "../interface/state";
import type { DeclarableRequiredSemantic } from "./requirements";
import type {
	ActionDelivery,
	DirectedCommandImplementation,
	MarkerTransport,
	SubagentIntegration,
} from "./protocol";

/**
 * One named action of an `actions` command.
 *
 * The argument surface belongs to the framework — it normalized the argument and matched it
 * whole against a declared action name before this member is reached — so this is what the
 * action *is*, never how it is typed. The member may return a promise, and the framework waits
 * for it before the command concludes: an action whose effect is asynchronous (a file
 * publication, a remote measurement) is awaited, so the operator's command finishes with the
 * result rather than with a background write still in flight.
 *
 * The action owns its words: a successful effect is reported by the action through the unified
 * feedback channel, and an error that reaches the framework — a synchronous throw or a rejected
 * promise — is reported once by the framework, never twice, with no retry, no rollback and no
 * success notice.
 */
export type CommandAction = (delivery: ActionDelivery) => void | Promise<void>;

/**
 * The implementations one `actions` command delivers, keyed by declared action name.
 *
 * Binding refuses an action the declaration lists with no entry here, and an entry the
 * declaration does not list is never reached. The keys are the declared names, matched by the
 * framework after normalization, so an assembly writes exactly the names its own table shows.
 */
export type ActionsCommandImplementation = Readonly<Record<string, CommandAction>>;

/**
 * One command's implementation, as the command's declared control kind decides.
 *
 * A `directed` command delivers {@link DirectedCommandImplementation}, an `actions` command
 * delivers its action table. A declaration and an implementation of different kinds are refused
 * at binding rather than misread.
 */
export type CommandImplementation = DirectedCommandImplementation | ActionsCommandImplementation;

/**
 * The implementations one assembly delivers, keyed by the name of the command each implements.
 *
 * An implementation with no declared command implements nothing and is ignored; a declared
 * command whose implementation never arrived refuses the binding, exactly as the directed pair
 * already does.
 */
export type CommandImplementations = Readonly<Record<string, CommandImplementation>>;

/**
 * What the framework hands an extension's factory.
 *
 * `config` is the validated configuration the definition declared: the values its `config.yaml`
 * was read and checked to carry, as plain data, and an empty object for a definition that
 * declares no configuration. The framework reached the file before this call, so a definition
 * whose configuration is missing or illegal never reaches a factory at all.
 *
 * `modelPrices` is the harness's own model catalog, when its adapter can report one — a small
 * facts interface and never a native model, registry or context. An extension whose channel the
 * harness itself prices composes it with its own maintained data (see
 * {@link CatalogPriceSource}); a harness that states no prices hands over no such fact.
 *
 * `session` is the framework's Session capability for this process: the live read surface an
 * extension attaches to for the readings that arrived before it, including the ones collected while
 * it was not bound, and the one statement it may make about its own sessions. It is always present
 * because it is the framework's own record rather than a harness capability.
 *
 * The read surface hands out isolated copies: changing a value a read returned never changes the
 * framework's authoritative record or a later read. The statement takes a session id and says only
 * that a write really landed — never what was written — and the framework records the count in this
 * process's own source and hands the notice to the process serving that session's owner. A session
 * id this process holds no facts for records nothing. The caller must call it only after a write
 * was really confirmed, because nothing here can tell a confirmed write from a failed one.
 */
export interface ImplementationContext {
	readonly config: Readonly<Record<string, unknown>>;
	readonly modelPrices?: CatalogPriceSource;
	/**
	 * The harness's current access to the providers it serves, when its adapter can resolve one.
	 *
	 * It is the same small facts query the adapter mapped ({@link HarnessPort.providerAccess}) and
	 * never a native credential store or registry: the extension asks it at the moment of an operation
	 * that needs a credential or an address, and what it answers is that moment's host state. A harness
	 * that resolves no such access hands over no member at all.
	 */
	readonly providerAccess?: ProviderAccess;
	/** The process's Session capability: the live read surface and the confirmed-write statement. */
	readonly session: SessionCapability;
}

/**
 * The facts one one-time initialization runs with.
 *
 * It is a command-shaped delivery, not a session event: the initialization belongs to the owner
 * the node resolved, and what it produces — an immediate notice, a marker refresh, a retained
 * capability — travels through the same transports a command uses. The framework calls it once,
 * so the extension's own prefetch is stated once rather than repeated per session.
 */
export interface InitializationDelivery {
	/** The owner whose work the initialization serves, as the adapter resolved it. */
	readonly owner: OwnerReference;
	/** Whether the session this node belongs to has a UI, as the adapter resolved it. */
	readonly hasUI: boolean;
	/** The unified extension feedback channel of this initialization. */
	readonly feedback: FeedbackTransport;
	/** The transport this initialization's marker updates are published through. */
	readonly markers: MarkerTransport;
	/**
	 * How this entry's subagent integration stands on this harness, as the adapter settled it at
	 * this node (see {@link SubagentIntegration}).
	 *
	 * It is settled before this delivery is handed over, once per process, and never moves after —
	 * so an extension that reads it here reads the one answer this process has. A harness with no
	 * such integration to settle answers `none`, which is a normal shape rather than a failure.
	 */
	readonly subagents: SubagentIntegration;
}

/**
 * The extension half of a binding: everything the definition's declarations need injected.
 *
 * A definition is plain data, so none of this is in it; an assembly's factory returns one of
 * these and the framework connects it. Every member is optional, and a definition that declares
 * nothing needs nothing: an extension that only declares a toggle delivers no implementation at
 * all.
 */
export interface ExtensionImplementation {
	/**
	 * The implementations of the definition's commands, keyed by command name.
	 *
	 * Omitted when the definition declares no command that needs one; a declaration that needs
	 * an implementation which never arrived refuses the binding.
	 */
	readonly commands?: CommandImplementations;
	/**
	 * The implementation's subscriptions, one entry per group it declares.
	 *
	 * A group states once whether it observes the owner session alone or every actual session the
	 * adapter reports, and carries the handlers for the event kinds it subscribes. The two scopes
	 * reach handlers through the same dispatch, so an extension that needs both — an
	 * owner-scoped effect body and a per-session observation view — declares two groups over one
	 * implementation and never a second dispatch path.
	 *
	 * A handler may return a promise, and the framework does not wait for it: a handler's own
	 * asynchronous work — a save, a refresh — must never become a barrier for the events and
	 * input that follow it. A synchronous throw and a rejected promise are both contained,
	 * reported once each on the adapter's diagnostic channel, and neither disturbs the
	 * framework's own behavior for the event nor another subscriber.
	 */
	readonly subscriptions?: readonly SubscriptionGroup[];
	/**
	 * The extension's own model catalog, as the implementation supplies it.
	 *
	 * The framework queries it once per model request — at the request's real start — and
	 * snapshots the answer into that Turn's facts, so a request is priced, and a model attributed,
	 * at the moment it was actually issued. The framework never interprets the value it receives
	 * and never caches it; an implementation that supplies no catalog has every Turn report the
	 * price as an unavailable fact.
	 */
	readonly catalog?: CatalogPriceSource;
	/**
	 * The one-time initialization entry, called at the node where provider facts are readable.
	 *
	 * The framework calls it at most once per process, and the first model request waits for the
	 * promise it returns to settle, so a prefetch the extension started here is finished (or
	 * reported failed) before the request it was started for. It may return a promise; a
	 * rejection is reported once and does not block the request. Omitted when the extension has
	 * nothing to initialize.
	 */
	readonly initialize?: (delivery: InitializationDelivery) => void | Promise<void>;
	/**
	 * The one-time cleanup entry, called when the session that initialized this implementation ends.
	 *
	 * The framework calls it at most once: a binding that failed after the factory returned, and
	 * the session end that follows an initialized instance, run the same single cleanup. The
	 * extension invalidates its business instance and stops accepting late network results here;
	 * the framework stops delivering to this binding's handlers first, so nothing arrives at the
	 * implementation after its own cleanup ran. A throw or rejection is reported once.
	 */
	readonly cleanup?: () => void | Promise<void>;
}

/**
 * The factory one harness assembly supplies: it builds the extension's implementation.
 *
 * It is called once, after the definition's configuration validated and before the first
 * registration, and what it returns is the process's one implementation of that extension —
 * every later binding, another session's or a subagent's, reuses it rather than building a
 * second business instance. Returning must therefore have no effect of its own: no remote
 * request and no timer, because a refusal can still follow.
 */
export type ExtensionFactory = (context: ImplementationContext) => ExtensionImplementation;

/**
 * The generic assembly information one harness adapter binds a definition with.
 *
 * Everything an extension declares about how it is assembled lives here, host-independently: the
 * implementation factory, the framework semantics its extension additionally depends on (contract
 * metadata for the independent verification, never a startup switch), and the directory its
 * declared configuration path is relative to. A harness adapter consumes this type
 * unchanged, so an assembly never states anything about a harness and a new harness adds no
 * assembly vocabulary of its own.
 */
export interface ExtensionAssembly {
	/**
	 * The extension's implementation factory (see {@link ExtensionFactory}).
	 *
	 * Omitted when the definition needs no injected implementation — a toggle-only definition, or
	 * one whose declared commands need nothing. An omitted factory delivers an empty
	 * implementation, so a declaration that does need one is refused with an initialization
	 * failure as before.
	 */
	readonly factory?: ExtensionFactory;
	/**
	 * The framework semantics this extension depends on beyond the ones every binding already
	 * requires, as the extension's own assembly declares them.
	 *
	 * This is contract metadata: it states what the supported harness scope must be independently
	 * verified for, and it is the input a verification run reports its coverage against. Normal
	 * startup consults none of it — a binding neither refuses nor downgrades for a harness that
	 * cannot honor a declared semantic, and the framework checks no harness version membership —
	 * so an extension that declares one runs on whatever harness loaded it, exactly as one that
	 * declares none does.
	 */
	readonly requiredSemantics?: readonly DeclarableRequiredSemantic[];
	/**
	 * The directory the definition's declared configuration paths are relative to, as plain data.
	 *
	 * The loader discovers an extension by an absolute path while the process runs in an
	 * arbitrary project directory, so the assembly — whose module lives in the extension's
	 * repository — supplies the one directory that makes a relative declaration resolvable.
	 */
	readonly configBaseDir?: string;
}

/**
 * The argument text a command invocation carries, normalized the way `actions` routing
 * compares it: surrounding whitespace removed and case ignored.
 *
 * The framework owns this normalization so the same rule governs the help an empty argument
 * prints, the match against the declared table, and the argument a directed command's
 * unrecognized member would have seen.
 */
export function normalizeCommandArgument(args: string | undefined): string {
	return (args ?? "").trim().toLowerCase();
}

/**
 * Whether a value from a definition or an implementation is a mapping of named members.
 *
 * A definition can also arrive from plain JavaScript, so the framework reads its declarations
 * through this guard instead of trusting the type an editor saw: an array, a scalar and `null`
 * are all values a mapping could have been, and reading a member off one of them would be a
 * silent lie rather than a refusal.
 */
export function isPlainMapping(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
