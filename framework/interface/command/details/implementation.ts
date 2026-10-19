/**
 * The Command capability's implementation and delivery group: what an assembly implements, what a
 * handler is handed, and the directive vocabulary it reads.
 *
 * This is a public details file of the Command entry, not an internal implementation module. The
 * framework's invocation construction, argument parsing, declaration validation, help tooling and
 * the unrecognized-path directive vocabulary stay internal; an extension reads the delivery and the
 * parsed directive it is handed and never builds either.
 *
 * A command delivery is the invocation facts plus the managed State operations a handler owns. It
 * is not a view over an internal invocation: no member here reaches the adapter's persistence
 * callback, the process-global marker area or the framework's own dispatch.
 */
import type { FeedbackTransport } from "../../feedback";
import type { DeclaredValueSeam, OwnerCapabilityHandle, OwnerReference } from "../../state";

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
 * The directives a directed command acts on; an unrecognized argument is not one.
 *
 * It is the framework's normalization of the argument: `activate` — the empty argument names
 * `on`; `deactivate` — `off` names `off`. Any other text is not a directive and never reaches a
 * handler's `run`; the implementation's optional `unrecognized` member sees that text instead.
 * The internal normalization result that also carries that text stays in the framework's port.
 */
export type RecognizedDirective =
	| { readonly kind: "activate" }
	| { readonly kind: "deactivate" };

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
	 * that normalized to no directive.
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
 * The facts, the declared-value seam and the retainable capability one command handler receives.
 *
 * An adapter supplies the invocation facts; the framework adds the seam and the capability, so
 * the seam is the framework's own read/write path to the extension's declared value and a
 * handler never reaches a State store. The delivery is constructed from the approved members
 * rather than spread from the invocation: the adapter's persistence callback and the marker area
 * transport stay internal, and a handler affects its own line only through the seam's managed
 * write.
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
	 * harness reports no current model.
	 */
	readonly provider: string | undefined;
	/** The owner whose State this command acts on, as the adapter resolved it. */
	readonly owner: OwnerReference;
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
 * extension's own business data is its own rather than framework State. The persistence callback
 * and the marker area transport stay internal: an action writes through no framework State path
 * and has no line to manage.
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
	 * harness reports no current model.
	 */
	readonly provider: string | undefined;
	/** The unified extension feedback channel of this invocation. */
	readonly feedback: FeedbackTransport;
}
