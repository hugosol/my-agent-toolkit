/**
 * The authoring implementation contract: what an extension's implementation declares, what the
 * framework hands it, and the assembly information an adapter binds.
 *
 * This is a public details file of the root authoring entry. An extension authors one
 * {@link defineImplementation} declaration: its business state is created by `create(context)`,
 * and every subscription, command and lifecycle slot names a handler that receives that state.
 * The declaration is statically readable — its scopes, event keys, command keys and lifecycle
 * entries exist before any business state does — so the framework can select what a binding
 * needs without executing `create`. The helper returns one opaque callable factory that the
 * framework materializes into its resolved {@link ExtensionImplementation}; the authored
 * declaration is the only source of those requirements, never a second hand-maintained list.
 *
 * The lifecycle it describes is the framework's, and it is short:
 *
 * - the factory is called once, after the definition's configuration was read and validated and
 *   before anything is registered, and what it builds is kept for the life of the process (one
 *   shared business instance per extension, whatever session or subagent binds next);
 * - `initialize` is called at most once, at the node where provider facts are readable, and the
 *   first model request waits for it to settle;
 * - `cleanup` is called at most once, when the session that initialized the instance ends.
 *
 * Creation is not an effect: neither `create` nor returning a state may send a remote request or
 * start a timer, because a definition can still be refused afterwards.
 */
import type { ActionDelivery, CommandDelivery, CommandImplementations, RecognizedDirective } from "../command";
import type { FeedbackTransport } from "../feedback";
import type { CatalogPriceSource, ProviderAccess } from "../provider";
import type {
	ObservationScope,
	SemanticEvent,
	SemanticEventDeliveryMap,
	SessionCapability,
	SubscriptionGroup,
} from "../session";
import type { OwnerReference } from "../state";
import type { SubagentIntegration } from "../subagent";

/**
 * A semantic an extension's assembly may declare its extension depends on: the lifecycle
 * semantics a supported scope must be verified for, beyond the one every binding already
 * requires.
 *
 * `history-preservation` is the framework's own invariant — it appends new material through the
 * harness's own recording path and rewrites no existing conversation entry — so it is required of
 * every binding and is deliberately not declarable here. A declaration states verification input,
 * never a runtime switch: a binding neither refuses nor downgrades for a harness that cannot honor
 * one.
 */
export type DeclarableRequiredSemantic = "session-lifecycle-events" | "round-lifecycle-events";

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
	 * It is the same small facts query the adapter mapped and never a native credential store or
	 * registry: the extension asks it at the moment of an operation that needs a credential or an
	 * address, and what it answers is that moment's host state. A harness that resolves no such
	 * access hands over no member at all.
	 */
	readonly providerAccess?: ProviderAccess;
	/** The process's Session capability: the live read surface and the confirmed-write statement. */
	readonly session: SessionCapability;
}

/**
 * The facts one one-time initialization runs with.
 *
 * It is a command-shaped delivery, not a session event: the initialization belongs to the owner
 * the node resolved, and what it produces — an immediate notice — travels through the same
 * feedback channel a command uses. It carries no marker area transport: the extension's
 * own line is rendered from its declared text and managed State, and the area stays the
 * framework's. The framework calls it once, so the extension's own prefetch is stated once rather
 * than repeated per session.
 */
export interface InitializationDelivery {
	/** The owner whose work the initialization serves, as the adapter resolved it. */
	readonly owner: OwnerReference;
	/** Whether the session this node belongs to has a UI, as the adapter resolved it. */
	readonly hasUI: boolean;
	/** The unified extension feedback channel of this initialization. */
	readonly feedback: FeedbackTransport;
	/**
	 * How this entry's subagent integration stands on this harness, as the adapter settled it at
	 * this node.
	 *
	 * It is settled before this delivery is handed over, once per process, and never moves after —
	 * so an extension that reads it here reads the one answer this process has. A harness with no
	 * such integration to settle answers `none`, which is a normal shape rather than a failure.
	 */
	readonly subagents: SubagentIntegration;
}

/**
 * The handlers one authored subscription group declares, keyed by the semantic event each
 * subscribes to.
 *
 * Every handler receives the group's business state and the delivery of the event kind it was
 * declared under. A key that is absent subscribes nothing, exactly as the resolved
 * {@link SubscriptionGroup} does; this type is the authored form of the same one-group-per-scope
 * declaration.
 */
export type ImplementationEventHandlers<State> = Readonly<{
	readonly [K in SemanticEvent["kind"]]?: (
		state: State,
		delivery: SemanticEventDeliveryMap[K],
	) => void | Promise<void>;
}>;

/**
 * One authored subscription group: the scope its observations cover and the handlers it
 * subscribes. The scope is declared once for the group, never per event or per handler.
 */
export interface ImplementationSubscription<State> {
	readonly scope: ObservationScope;
	readonly events: ImplementationEventHandlers<State>;
}

/**
 * The authored implementation of one declared `directed` command.
 *
 * The framework owns the argument vocabulary and hands `run` the directive it recognized; the
 * handler owns the effect and the declared-value write. An unrecognized argument never reaches
 * `run`; it reaches the optional `unrecognized` member with the normalized text instead.
 */
export interface DirectedImplementationHandlers<State> {
	run(state: State, directive: RecognizedDirective, delivery: CommandDelivery): void;
	unrecognized?(state: State, argument: string, delivery: CommandDelivery): void;
}

/** One authored action of an `actions` command: the business effect of one declared name. */
export type ImplementationAction<State> = (state: State, delivery: ActionDelivery) => void | Promise<void>;

/**
 * The authored action table of one `actions` command, keyed by the action names the definition
 * declares. Every function receives the same business state and the action's delivery.
 */
export type ActionsImplementationHandlers<State> = Readonly<Record<string, ImplementationAction<State>>>;

/**
 * One authored command, in the same two forms a resolved implementation has: a `directed`
 * command is the object with `run`, and an `actions` command is its named action table.
 */
export type CommandImplementationHandlers<State> =
	| DirectedImplementationHandlers<State>
	| ActionsImplementationHandlers<State>;

/** The authored commands of one implementation, keyed by the command name the definition declares. */
export type ImplementationCommands<State> = Readonly<Record<string, CommandImplementationHandlers<State>>>;

/**
 * The one canonical authored implementation declaration.
 *
 * `create` is the only entry that builds business state, and it is reached lazily — after the
 * definition's configuration validated, before the first registration — and at most once per
 * adapter-provided process instance. Everything beside it is static: the scopes and event keys a
 * binding must subscribe, the command slots it must implement and the lifecycle it must run. No
 * parallel requirement list exists; the framework materializes the resolved implementation from
 * this object alone.
 */
export interface ImplementationDeclaration<State> {
	/** Builds the extension's one business state for this process instance; no remote or timer effect. */
	readonly create: (context: ImplementationContext) => State;
	/** The subscription groups this implementation declares; omitted means it observes nothing. */
	readonly subscriptions?: readonly ImplementationSubscription<State>[];
	/** The implementations of the definition's commands, keyed by command name. */
	readonly commands?: ImplementationCommands<State>;
	/**
	 * Selects the extension's own model catalog from its business state.
	 *
	 * The selector runs when the implementation is materialized — the state exists by then — and
	 * the framework queries the returned catalog once per model request, at the request's real
	 * start, never interpreting or caching its answer. Omitted means every Turn reports the price
	 * as an unavailable fact.
	 */
	readonly catalog?: (state: State) => CatalogPriceSource;
	/** The one-time initialization entry, handed the business state and the node's facts. */
	readonly initialize?: (state: State, delivery: InitializationDelivery) => void | Promise<void>;
	/** The one-time cleanup entry, handed the business state it invalidates. */
	readonly cleanup?: (state: State) => void | Promise<void>;
}

/**
 * The erased view of an authored implementation an assembly holds.
 *
 * An assembly is not generic over the extension's business state, so it stores this view: the
 * callable factory plus the authored declaration as an opaque object. The private type brand
 * remains required, so a raw function or hand-built declaration wrapper is not assignable;
 * {@link AuthoredImplementation} narrows the same value for the extension and for inspection.
 */
export interface AuthoredImplementationFactory {
	(context: ImplementationContext): ExtensionImplementation;
	/** The static authored structure this factory materializes; never reached by calling `create`. */
	readonly declaration: object;
	/** Keep the authoring-entry constraint when the assembly erases the business-state type. */
	readonly [authoredImplementationBrand]: unknown;
}

/**
 * The opaque callable one {@link defineImplementation} call returns.
 *
 * It is the extension's implementation factory: the framework calls it once per adapter-provided
 * process instance, at the same lazy point the previous raw factory was called, and consumes the
 * resolved implementation it returns. Its `declaration` member is the canonical authored object,
 * available to inspection without calling the factory or running `create`.
 */
export interface AuthoredImplementation<State> extends AuthoredImplementationFactory {
	/** The static authored structure this factory materializes; never reached by calling `create`. */
	readonly declaration: ImplementationDeclaration<State>;
	/** Type-only brand: only {@link defineImplementation} can produce an authored implementation. */
	readonly [authoredImplementationBrand]: State;
}

declare const authoredImplementationBrand: unique symbol;

/**
 * The extension half of a binding, resolved: everything the definition's declarations need
 * injected.
 *
 * This is the framework's internal runtime shape, not an authoring entry. An extension writes an
 * {@link ImplementationDeclaration} through {@link defineImplementation}; the framework
 * materializes this object from it and connects `commands`, `subscriptions` and the lifecycle.
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
	 * The framework calls it at most once: a binding that failed after materialization, and
	 * the session end that follows an initialized instance, run the same single cleanup. The
	 * extension invalidates its business instance and stops accepting late network results here;
	 * the framework stops delivering to this binding's handlers first, so nothing arrives at the
	 * implementation after its own cleanup ran. A throw or rejection is reported once.
	 */
	readonly cleanup?: () => void | Promise<void>;
}

/**
 * The raw resolver a binding may be driven with directly: configuration-validation seams and
 * low-level tests supply it without authoring an extension. It is not an extension-facing
 * assembly entry; an assembly supplies an {@link AuthoredImplementation} instead.
 */
export type ImplementationResolver = (context: ImplementationContext) => ExtensionImplementation;

/** Whether one authored command is the directed form rather than an action table. */
function isDirectedCommand<State>(
	command: CommandImplementationHandlers<State>,
): command is DirectedImplementationHandlers<State> {
	return "run" in command && typeof command.run === "function";
}

/** The resolved command table of one authored command table. */
function materializeCommands<State>(
	commands: ImplementationCommands<State>,
	state: State,
): CommandImplementations {
	const resolved: Record<string, CommandImplementations[string]> = {};
	for (const [name, command] of Object.entries(commands)) {
		if (isDirectedCommand(command)) {
			resolved[name] = {
				run: (directive, delivery) => command.run(state, directive, delivery),
				...(command.unrecognized === undefined
					? {}
					: {
							unrecognized: (argument: string, delivery: CommandDelivery) =>
								command.unrecognized?.(state, argument, delivery),
						}),
			};
			continue;
		}
		const actions: Record<string, (delivery: ActionDelivery) => void | Promise<void>> = {};
		for (const [action, handler] of Object.entries(command)) {
			// Invalid or missing handlers must remain missing for binding validation, not become
			// callable no-ops merely because an authored table contains their key.
			if (typeof handler !== "function") continue;
			actions[action] = delivery => handler(state, delivery);
		}
		resolved[name] = actions;
	}
	return resolved;
}

/** The resolved subscription groups of one authored group list. */
function materializeSubscriptions<State>(
	subscriptions: readonly ImplementationSubscription<State>[],
	state: State,
): readonly SubscriptionGroup[] {
	return subscriptions.map(group => {
		const handlers = group.events;
		const events: Record<string, (delivery: SemanticEventDeliveryMap[SemanticEvent["kind"]]) => void | Promise<void>> = {};
		for (const [kind, handler] of Object.entries(handlers)) {
			if (handler === undefined) continue;
			// Object.entries widens the mapped key's delivery to the event union; the wrapper accepts
			// that union and the framework's dispatch supplies the one kind this key subscribes.
			const call = handler as (
				state: State,
				delivery: SemanticEventDeliveryMap[SemanticEvent["kind"]],
			) => void | Promise<void>;
			events[kind] = delivery => call.call(handlers, state, delivery);
		}
		return { scope: group.scope, events };
	});
}

/**
 * Materializes one authored declaration into the resolved implementation the framework connects.
 *
 * This is the only materialization path: command wrappers, subscription wrappers and lifecycle
 * entries all come from the authored object, with the one state `create` returned. It runs when
 * the framework calls the authored factory, never at declaration time.
 */
function materializeImplementation<State>(
	declaration: ImplementationDeclaration<State>,
	context: ImplementationContext,
): ExtensionImplementation {
	const state = declaration.create(context);
	const commands = declaration.commands === undefined ? undefined : materializeCommands(declaration.commands, state);
	const subscriptions =
		declaration.subscriptions === undefined ? undefined : materializeSubscriptions(declaration.subscriptions, state);
	const initialize = declaration.initialize;
	const cleanup = declaration.cleanup;
	return {
		...(commands === undefined ? {} : { commands }),
		...(subscriptions === undefined ? {} : { subscriptions }),
		...(declaration.catalog === undefined ? {} : { catalog: declaration.catalog(state) }),
		...(initialize === undefined ? {} : { initialize: delivery => initialize(state, delivery) }),
		...(cleanup === undefined ? {} : { cleanup: () => cleanup(state) }),
	};
}

/**
 * Declares an extension's implementation: its business state and the static slots around it.
 *
 * The returned value is the one canonical authored object for that implementation: callable as
 * the framework's factory, with `.declaration` exposing the same scopes, event keys, command
 * slots and lifecycle entries without calling `create`. The factory stays lazy — `create` runs
 * only when the framework materializes the implementation for a binding — so declaration itself
 * has no effect.
 *
 * The branding makes an ordinary raw factory unassignable to {@link ExtensionAssembly}, but it is
 * not a static syntax checker: an object built through spreads, computed keys or dynamic values is
 * still accepted by this helper today. Source-level restrictions on dynamic authoring expressions
 * are deferred to the future inspection checker; business function bodies and ordinary composition
 * are expected to remain unrestricted.
 */
export function defineImplementation<State>(
	declaration: ImplementationDeclaration<State>,
): AuthoredImplementation<State> {
	const authored = ((context: ImplementationContext): ExtensionImplementation =>
		materializeImplementation(declaration, context)) as AuthoredImplementation<State>;
	Object.defineProperty(authored, "declaration", { value: declaration, enumerable: true });
	return authored;
}

/**
 * The generic assembly information one harness adapter binds a definition with.
 *
 * Everything an extension declares about how it is assembled lives here, host-independently: the
 * authored implementation, the framework semantics its extension additionally depends on (contract
 * metadata for the independent verification, never a startup switch), and the directory its
 * declared configuration path is relative to. A harness adapter consumes this type
 * unchanged, so an assembly never states anything about a harness and a new harness adds no
 * assembly vocabulary of its own.
 */
export interface ExtensionAssembly {
	/**
	 * The extension's authored implementation (see {@link defineImplementation}).
	 *
	 * Omitted when the definition needs no injected implementation — a toggle-only definition, or
	 * one whose declared commands need nothing. An omitted implementation delivers an empty
	 * resolved implementation, so a declaration that does need one is refused with an
	 * initialization failure as before.
	 */
	readonly implementation?: AuthoredImplementationFactory;
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
