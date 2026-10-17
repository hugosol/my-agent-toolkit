/**
 * The harness-neutral port double: the framework suite's shared binding double.
 *
 * The framework's contract with a harness is a definition plus the
 * `HarnessPort` that harness provides, and its behaviors are observable there —
 * as registrations the port receives and as effects the framework publishes through
 * the transports the port hands it. This double is that port: it records every
 * registration, and it drives those registrations the way a harness would, so a suite
 * can bind a definition and run its commands without naming any harness-native
 * type. Suites that must observe a *native* mapping (the OMP adapter's synthesis of
 * events, entries or widgets) keep driving `ompAdapter` with an `OmpExtensionApi`
 * double instead; this double covers the harness-independent half.
 *
 * One double is one assembly: one State store shared by every binding it makes, exactly
 * as an extension's assembly has one. Its declaration rules are resolved from the
 * definition the assembly's first binding names — the store cannot exist before the
 * extension it serves is known. The framework's own notice record is not part of an
 * assembly at all — one process holds it per Owner, whichever extension published for it.
 */
import { bindExtension } from "../../../framework/behaviors/binding";
import type { ExtensionFactory, ExtensionImplementation } from "../../../framework/core/assembly";
import type { ConfigSource } from "../../../framework/core/config";
import { activationField, statePersistence, type ExtensionDefinition } from "../../../framework/core/definition";
import type { FollowedAccessReader } from "../../../framework/core/followed-owners";
import type {
	HarnessPort,
	BindingResult,
	BoundCommand,
	CatalogPriceSource,
	CommandInvocation,
	FeedbackLevel,
	MarkerTransport,
	ObservedSession,
	ObservationSource,
	OwnerReference,
	PromptContribution,
	ProviderAccess,
	RoundEvent,
	RoundObservation,
	SemanticEventHandlers,
	SessionContextObservation,
	SessionContextReading,
	SessionDelivery,
	SessionDisposal,
	SessionEvent,
	SessionFacts,
	SessionObservationAccess,
	SessionObservationSink,
	StateValues,
	TurnSignal,
	TurnSignalFacts,
	TurnOutcome,
	UserInputDelivery,
} from "../../../framework/core/protocol";
import { SessionObservations } from "../../../framework/core/observations";
import { StateStore } from "../../../framework/core/state";

/** The owner key a command invocation or session delivery acts on unless one is named. */
export const DEFAULT_OWNER_KEY = "main:port-double";

/**
 * The source this double's access starts at: the first connection a serving process admitted.
 *
 * A case that delivers without naming one speaks for that connection, and one that wants the word a
 * later connection's delivery carries states a higher number — which is how a case drives two
 * connections' words about one session, and the end of either, without a real access.
 */
export const FIRST_SOURCE: ObservationSource = 1;

/** One extension feedback notice the framework published, with the severity it carried. */
export interface FeedbackNotice {
	readonly level: FeedbackLevel;
	readonly message: string;
}

/** What one command execution observed, from the invitation the double built. */
export interface CommandRun {
	readonly command: string;
	readonly args: string;
	readonly owner: OwnerReference;
	/** Whether the session the command ran in had a UI, as the double modelled it. */
	readonly hasUI: boolean;
	/** The State values the framework recorded, one entry per `persist` call. */
	readonly persisted: readonly StateValues[];
	/**
	 * The idle fact the invocation's query answered: the session's own fact as the double
	 * modelled it, or `undefined` when it modelled a harness that reports none.
	 */
	readonly canAcceptInput: boolean | undefined;
	/** The extension feedback the framework published, in call order, with its severity. */
	readonly feedback: readonly FeedbackNotice[];
	/** The marker-area renderings the framework published, one entry per call. */
	readonly markers: readonly (readonly string[])[];
	/**
	 * The effects the write path produced, in call order: `persist` for a recorded value,
	 * `marker` for an area update, `notify` for published feedback. The order is part of
	 * the contract — a value is recorded, then rendered, then announced.
	 */
	readonly effects: readonly string[];
	/**
	 * The invocation's own completion, resolved when this command's action is really over.
	 *
	 * {@link PortDouble.run} hands it over so a suite can read the record while the action is still
	 * running and then wait for the effect itself, which is how a case observes that nothing was
	 * announced before a write it waits for landed.
	 */
	readonly completion: Promise<void>;
}

/** The facts one command execution runs with, as a suite models them. */
export interface CommandRunOptions {
	readonly args?: string;
	readonly owner?: OwnerReference;
	readonly hasUI?: boolean;
	/**
	 * The idle fact the session reports through the invocation's query: `"idle"` and
	 * `"busy"` for a harness that answers, `"unreported"` for one that reports none.
	 * Omitted means idle, the state a session at a command prompt is in.
	 */
	readonly idle?: "idle" | "busy" | "unreported";
	/**
	 * The provider the session reports it currently runs, as the invocation's own fact.
	 * Omitted models a surface that reports no current model, which answers `undefined`.
	 */
	readonly provider?: string;
}

/** What one run initiation observed. */
export interface RunInitiation {
	readonly contribution: PromptContribution | undefined;
	readonly markers: readonly (readonly string[])[];
}

/** What one session delivery observed. */
export interface SessionBoundary {
	/** Whether the session had a UI, as the double modelled it. */
	readonly hasUI: boolean;
	/** The framework's own notices (the `NoticeTransport` channel) published during the delivery. */
	readonly notices: readonly string[];
	/** Extension feedback published during the delivery, with its severity. */
	readonly feedback: readonly FeedbackNotice[];
	/** The State values recorded in the owner's persistence medium, one entry per `persist` call. */
	readonly persisted: readonly StateValues[];
	/** The marker-area renderings the framework published during the delivery, one per call. */
	readonly markers: readonly (readonly string[])[];
}

/** What one round delivery observed. */
export interface RoundBoundary {
	/** Whether the session had a UI, as the double modelled it. */
	readonly hasUI: boolean;
	/** Extension feedback published during the delivery, with its severity. */
	readonly feedback: readonly FeedbackNotice[];
}

/** What one Turn signal delivery observed. */
export interface TurnBoundary {
	/** Whether the session had a UI, as the double modelled it. */
	readonly hasUI: boolean;
	/** Extension feedback the framework published while dispatching, with its severity. */
	readonly feedback: readonly FeedbackNotice[];
}

/** What one user-input delivery observed. */
export interface UserInputBoundary {
	/** Whether the session had a UI, as the double modelled it. */
	readonly hasUI: boolean;
	/** Extension feedback published during the delivery, with its severity. */
	readonly feedback: readonly FeedbackNotice[];
}

/** What one context collection observed, and what the framework published through it. */
export interface ContextBoundary {
	/** Whether the session had a UI, as the double modelled it. */
	readonly hasUI: boolean;
	/** Extension feedback published during the delivery, with its severity. */
	readonly feedback: readonly FeedbackNotice[];
}

/** The actual session a delivery from the double is about when a suite names none. */
const DEFAULT_SESSION: SessionFacts = { sessionId: "port-double", kind: "main", unavailable: [] };

/**
 * The facts one binding resolves, besides the definition and the implementation built for it.
 *
 * The implementation members are the double's own model of what an assembly's factory returns:
 * a suite states the commands, subscriptions, initialization and cleanup a binding runs with,
 * exactly as `framework/core/assembly.ts` defines them, and the double wraps them in the one
 * factory a binding calls.
 */
export interface PortBindingOptions extends Partial<ExtensionImplementation> {
	/**
	 * The factory the binding calls, when a suite wants to observe what an assembly's own factory
	 * is handed. Omitted, the implementation members above are what a factory returns — so the
	 * common case states only what it runs with, and the factory case can watch the validated
	 * configuration arrive.
	 */
	readonly factory?: ExtensionFactory;
	/**
	 * The configuration source the binding reads a declared configuration through: the
	 * framework's own file system and YAML parser by default, so a suite injects one only to
	 * model a file without a file system.
	 */
	readonly config?: ConfigSource;
}

/** The recorded port of one assembly, and the driver a suite observes behavior through. */
export interface PortDouble {
	/**
	 * The assembly's State store, whose declaration rules the first binding resolves from
	 * the definition it names; a suite reads it after a bind, refused or admitted.
	 */
	readonly state: StateStore;
	/**
	 * The assembly's one session observation source, which the double shares across its bindings
	 * exactly as an adapter shares the process's: what a suite reads here is what a consumer
	 * attaching to a source already observed would read.
	 */
	readonly observations: SessionObservations;
	/** Labels the framework set, in call order. */
	readonly labels: readonly string[];
	/** Diagnostics the framework reported on the port's non-model channel. */
	readonly diagnostics: readonly string[];
	/**
	 * Registrations in call order: `label:<name>`, `onSession`, `onRound` (only when the
	 * assembly injected a round handler), `onSessionContext` (only when one observes a reading),
	 * `onTurn`, `onUserInput` (only when one observes input), `onRunInitiation`, `command:<name>`.
	 */
	readonly registrations: readonly string[];
	/** The commands the framework registered, in call order, ready to be run. */
	readonly commands: readonly BoundCommand[];
	/**
	 * Every marker-area rendering the framework published, in call order, across every
	 * delivery and run this double drove: what a subscriber can read to observe that the
	 * framework's own behavior ran before it did.
	 */
	readonly markerUpdates: ReadonlyArray<readonly string[]>;
	/**
	 * Every reading this double's access was asked to deliver, in order: what this process handed over
	 * for a session whose owner it does not serve. It is empty unless the double was built with
	 * {@link PortDoubleOptions.observationsAcrossProcesses}.
	 */
	readonly deliveredObservations: readonly ObservedSession[];
	/** The owner keys this double's access is receiving observations for right now. */
	readonly receivingOwners: readonly string[];
	/**
	 * Delivers one reading a session in another process sent for an owner, as the serving end of the
	 * access does: whoever receives that seat's observations is handed it, and a reading for an owner
	 * this process receives nothing for reaches nobody — the same silence the real access answers a
	 * delivery with when the seat is not served here.
	 *
	 * `source` is the connection the reading arrived over, numbered by the serving process as the real
	 * access numbers them: a case that wants a later connection's word — a session whose access was
	 * reached again — states a higher number, and one that states none speaks for the first
	 * connection, which is the one this double starts at.
	 */
	deliverObserved(reading: ObservedSession, source?: ObservationSource): void;
	/**
	 * States that one source's connection ended, as the serving end observes a real one: the access was
	 * released by the process that delivered, that process ended, or the connection failed.
	 */
	loseObservedSource(source?: ObservationSource): void;
	bind(definition: ExtensionDefinition, options?: PortBindingOptions): BindingResult;
	/** Runs one registered command as a user of `owner` would; throws when it was never registered. */
	run(command: string, options?: CommandRunOptions): CommandRun;
	/**
	 * The same execution, awaited.
	 *
	 * An `actions` command's effect and feedback land while it runs, so a suite observing one
	 * awaits this rather than the synchronous {@link run}: the record it returns is complete.
	 */
	runToCompletion(command: string, options?: CommandRunOptions): Promise<CommandRun>;
	/** Delivers one semantic session event to every extension bound so far. */
	deliverSession(
		owner: OwnerReference,
		options?: {
			readonly event?: SessionEvent;
			readonly statePayloads?: readonly unknown[];
			readonly hasUI?: boolean;
			/** The actual session the delivery is about; omitted models a top-level `port-double` session. */
			readonly session?: SessionFacts;
		},
	): SessionBoundary;
	/** Delivers one semantic round edge to every extension bound so far. */
	deliverRound(
		owner: OwnerReference,
		options?: {
			/**
			 * Which native run-cycle fact the delivery models, never the edge itself: the framework's
			 * synthesis decides which edge a fact becomes and how an end was established, so this states
			 * only the harness's own fact.
			 */
			readonly event?: { readonly kind: RoundEvent["kind"] };
			readonly hasUI?: boolean;
			readonly session?: SessionFacts;
			/**
			 * Whether the session is at quiescence when the framework re-checks an end candidate.
			 * Omitted models a session at the prompt; `false` models one that still has work, whose
			 * round therefore stays open.
			 */
			readonly quiescent?: boolean;
			/**
			 * Whether work beyond the run still holds the session when the framework re-checks an end
			 * candidate. Omitted models a session nothing holds, which is what an ordinary settle
			 * needs to end; `true` models one waiting on delegated work, whose round stays open, and
			 * `"unstated"` a harness that established nothing either way — which confirms no end.
			 */
			readonly heldWork?: boolean | "unstated";
			/**
			 * How the activity that settled ended, as the harness stated it. Omitted models a settle
			 * that stated no outcome, which is not the same as a completed activity.
			 */
			readonly outcome?: TurnOutcome;
			/**
			 * Whether the session had already scheduled its next piece of work when the run settled.
			 * Omitted models a settle that scheduled nothing, which is the candidate an end is
			 * confirmed from; `true` models the pause inside its round that an automatic
			 * continuation, a drained queued message or a pending wake is.
			 */
			readonly willContinue?: boolean;
		},
	): RoundBoundary;
	/**
	 * Reports one actual session's own disposal, as a host does at its awaitable exit position.
	 *
	 * The double frames the fact the way an adapter does — the session's own facts, the owner, the UI
	 * fact and the feedback channel — and hands it to whatever the framework registered for it. What
	 * the framework makes of the fact, and how long its answer takes, are the framework's rules; the
	 * answer here is the same settlement a host waits for before letting the session go.
	 */
	deliverDisposal(
		owner: OwnerReference,
		options?: { readonly session?: SessionFacts; readonly hasUI?: boolean },
	): Promise<RoundBoundary>;
	/**
	 * Delivers one collected context reading to every extension bound so far, as an adapter would.
	 *
	 * The double frames the collection the way a harness does — the session it was read in, its owner,
	 * the UI fact and the feedback channel — and states the reading the adapter read there. Whether it
	 * is a change, which subscribers it reaches and what the framework's own source then holds are the
	 * framework's rules, not this double's.
	 */
	deliverContext(
		owner: OwnerReference,
		options: {
			readonly reading: SessionContextReading;
			/** The actual session the reading belongs to; omitted models a top-level `port-double` session. */
			readonly session?: SessionFacts;
			readonly hasUI?: boolean;
		},
	): ContextBoundary;
	/**
	 * Delivers one mapped native Turn signal to every extension bound so far, as an adapter would.
	 *
	 * The double frames the signal the way a harness does — resolving the owner, the UI fact and the
	 * feedback channel — and the framework's own Turn rules then decide what, if anything, reaches a
	 * handler.
	 */
	deliverTurn(signal: TurnSignal, options?: { readonly owner?: OwnerReference; readonly hasUI?: boolean }): TurnBoundary;
	/**
	 * Delivers one user-input fact to every extension bound so far, as an adapter would.
	 *
	 * The submission is modelled as the harness publishes it: a fact about one session, resolved into
	 * its owner, its UI fact and its feedback channel. It crosses no boundary, so nothing the
	 * framework owns moves with it.
	 */
	deliverUserInput(
		owner: OwnerReference,
		options?: { readonly hasUI?: boolean; readonly session?: SessionFacts },
	): UserInputBoundary;
	/** Delivers one run initiation to every extension bound so far, and waits for it. */
	initiateRun(
		owner: OwnerReference,
		options?: { readonly contributionIdentities?: readonly string[] },
	): Promise<RunInitiation>;
}

/** The model prices one double's harness reports, when a suite drives an extension that prices a
 * channel from the harness's own catalog. Omitted models a harness that states no prices at all,
 * which is the member being absent rather than an empty query.
 */
export interface PortDoubleOptions {
	readonly modelPrices?: CatalogPriceSource;
	/**
	 * The provider access one double's harness reports, when a suite drives an extension that queries
	 * a provider for itself. Omitted models a harness that resolves no access, which is the member
	 * being absent rather than a query that always answers nothing.
	 */
	readonly providerAccess?: ProviderAccess;
	/**
	 * How this double's store reads an owner another process serves, when a suite drives a `follow`
	 * field the way a harness that spawns sessions out of this process does. Omitted models the
	 * in-process assembly: every read is this process's own cell or the declared default.
	 */
	readonly follow?: FollowedAccessReader;
	/**
	 * Whether this double's harness carries observations across processes, as an adapter whose
	 * sessions may run in another process does (see {@link SessionObservationAccess}).
	 *
	 * Omitted models the in-process assembly: the port supplies no access at all, every session this
	 * double reports is observed into this process's own source, and no reading crosses anywhere. A
	 * suite that states it drives the framework's side of the boundary — what it receives, what it hands
	 * over, and what it does with a reading that arrived — through a double whose access is a plain
	 * record rather than a carrier; the real carrier is what `local-access-observation.test.ts` starts
	 * processes over.
	 */
	readonly observationsAcrossProcesses?: boolean;
	/**
	 * The access this double's harness really carries, when a suite drives the framework's own side of
	 * that boundary over the carrier itself rather than over the record above.
	 *
	 * It is stated whole, so the suite builds the halves it needs — the serving half a case's own
	 * process offers, and whatever reads it — from the framework's own modules; a suite that states it
	 * states no {@link observationsAcrossProcesses}, and the port hands over exactly this object. What
	 * it is for is a case whose *carrier* is part of the thing under test: a reading that really crossed
	 * a process boundary, delivered by a process that really runs one.
	 */
	readonly observationAccess?: SessionObservationAccess;
}

export function portDouble(options: PortDoubleOptions = {}): PortDouble {
	// One assembly serves one extension, so one store with one set of declaration rules —
	// the ones the definition its first binding names resolves to.
	let state: StateStore | undefined;
	const stateOf = (definition: ExtensionDefinition): StateStore => {
		state ??= new StateStore({
			field: activationField(definition),
			persistence: statePersistence(definition),
			...(options.follow === undefined ? {} : { follow: options.follow }),
		});
		return state;
	};
	const labels: string[] = [];
	const diagnostics: string[] = [];
	const registrations: string[] = [];
	const commands: BoundCommand[] = [];
	// One source for every binding this double makes, exactly as one adapter holds one per process:
	// a suite that binds twice is modelling two sessions of one process observing into one record.
	const observations = new SessionObservations();
	const sessionHandlers: Array<(session: SessionDelivery) => void> = [];
	const roundObservers: Array<(observation: RoundObservation) => void> = [];
	const disposalHandlers: Array<(disposal: SessionDisposal) => void | Promise<void>> = [];
	const contextHandlers: Array<(observation: SessionContextObservation) => void> = [];
	const turnHandlers: Array<(facts: TurnSignalFacts) => void> = [];
	const userInputHandlers: Array<(delivery: UserInputDelivery) => void> = [];
	const runHandlers: Array<Parameters<HarnessPort["onRunInitiation"]>[0]> = [];
	const markerUpdates: string[][] = [];
	/** The callbacks the framework arranged on the harness's next task, oldest first. */
	const pendingTasks: Array<() => void> = [];
	/** What this process handed over for the sessions whose owners it does not serve, in order. */
	const deliveredObservations: ObservedSession[] = [];
	/** Where each owner's admitted readings are handed, as the serving end of the access holds them. */
	const receivingSinks = new Map<string, SessionObservationSink>();
	const observationAccess: SessionObservationAccess | undefined =
		options.observationAccess ??
		(options.observationsAcrossProcesses !== true
			? undefined
			: {
					receive: (owner, sink) => {
						receivingSinks.set(owner, sink);
						return () => {
							if (receivingSinks.get(owner) === sink) receivingSinks.delete(owner);
						};
					},
					deliver: reading => void deliveredObservations.push(reading),
				});

	const commandUnder = (name: string): BoundCommand => {
		const command = commands.find(candidate => candidate.name === name);
		if (command === undefined) throw new Error(`no command registered under "${name}"`);
		return command;
	};

	/**
	 * One command execution, prepared but not yet run.
	 *
	 * A suite that only needs the recorded invocation runs the attempt synchronously; a suite
	 * observing an `actions` command awaits the same attempt, because that command's effects and
	 * feedback land while it runs rather than before it returns.
	 */
	const commandAttempt = (
		name: string,
		options: CommandRunOptions,
	): { invoke: () => void | Promise<void>; observed: CommandRun } => {
		const command = commandUnder(name);
		const completion = Promise.withResolvers<void>();
		const persisted: StateValues[] = [];
		const feedback: FeedbackNotice[] = [];
		const markers: string[][] = [];
		const effects: string[] = [];
		const hasUI = options.hasUI ?? true;
		// The idle fact the session reports through the invocation's query: a harness that
		// answers reports the modelled state, and one that reports none answers nothing.
		const idle = options.idle ?? "idle";
		const canAcceptInput = (): boolean | undefined =>
			idle === "unreported" ? undefined : idle === "idle";
		const invocation: CommandInvocation = {
			args: options.args ?? "",
			owner: options.owner ?? { kind: "owner", key: DEFAULT_OWNER_KEY },
			persist: values => {
				effects.push("persist");
				persisted.push(values);
			},
			hasUI,
			canAcceptInput,
			provider: options.provider,
			feedback: {
				notify: (level, message) => {
					effects.push("notify");
					feedback.push({ level, message });
				},
			},
			markers: markerTransport(markers, effects),
		};
		return {
			invoke: () =>
				Promise.resolve(command.run(invocation)).finally(() => {
					completion.resolve();
				}),
			observed: {
				command: name,
				args: invocation.args,
				owner: invocation.owner,
				hasUI: invocation.hasUI,
				persisted,
				canAcceptInput: canAcceptInput(),
				feedback,
				markers,
				effects,
				completion: completion.promise,
			},
		};
	};

	/**
	 * The area transport one delivery publishes through.
	 *
	 * Every rendering lands in the delivery's own record and in the assembly's journal, so a
	 * suite can ask either what this one delivery rendered or how many renderings had already
	 * happened when a handler ran. A command's transport also journals the render as an
	 * effect, because a command's effect order is part of what it promises.
	 */
	const markerTransport = (into: string[][], effects?: string[]): MarkerTransport => ({
		publishMarkers: lines => {
			effects?.push("marker");
			const render = [...lines];
			markerUpdates.push(render);
			into.push(render);
		},
	});

	const port: HarnessPort = {
		setLabel: label => {
			labels.push(label);
			registrations.push(`label:${label}`);
		},
		...(options.modelPrices === undefined ? {} : { modelPrices: options.modelPrices }),
		...(options.providerAccess === undefined ? {} : { providerAccess: options.providerAccess }),
		...(observationAccess === undefined ? {} : { sessionObservationAccess: observationAccess }),
		reportDiagnostic: message => {
			diagnostics.push(message);
		},
		onSession: handler => {
			registrations.push("onSession");
			sessionHandlers.push(handler);
		},
		onRound: observer => {
			registrations.push("onRound");
			roundObservers.push(observer);
		},
		onDisposal: handler => {
			registrations.push("onDisposal");
			disposalHandlers.push(handler);
		},
		onSessionContext: handler => {
			registrations.push("onSessionContext");
			contextHandlers.push(handler);
		},
		nextTask: callback => {
			// The harness's next task, as a queue the double runs when a suite's delivery reaches it:
			// the same one-shot arrangement the omp adapter makes with its host's own task primitive.
			pendingTasks.push(callback);
		},
		onTurn: handler => {
			registrations.push("onTurn");
			turnHandlers.push(handler);
		},
		onUserInput: handler => {
			registrations.push("onUserInput");
			userInputHandlers.push(handler);
		},
		onRunInitiation: handler => {
			registrations.push("onRunInitiation");
			runHandlers.push(handler);
		},
		registerCommand: command => {
			registrations.push(`command:${command.name}`);
			commands.push(command);
		},
	};

	return {
		get state(): StateStore {
			if (state === undefined) {
				throw new Error("portDouble: State rules are resolved by the first binding");
			}
			return state;
		},
		observations,
		labels,
		diagnostics,
		registrations,
		commands,
		markerUpdates,
		deliveredObservations,
		get receivingOwners(): readonly string[] {
			return [...receivingSinks.keys()];
		},
		deliverObserved(reading, source = FIRST_SOURCE) {
			// The serving end hands one seat's readings to whoever receives that seat, and nothing to
			// anyone else: an owner this process receives nothing for is handed nothing, exactly as the
			// real access answers a seat it does not serve.
			if (reading.owner.kind !== "inherited") return;
			receivingSinks.get(reading.owner.key)?.adopt(source, reading);
		},
		loseObservedSource(source = FIRST_SOURCE) {
			// A loss is stated to every seat this double receives for, as one connection's end is stated
			// to the one seat it was admitted for: a case modelling that connection states the same source
			// it delivered over, and a seat that never saw the source states nothing about it.
			for (const sink of receivingSinks.values()) sink.lost(source);
		},
		bind(definition, options = {}) {
			const { config, factory, ...implementation } = options;
			return bindExtension(
				definition,
				port,
				stateOf(definition),
				observations,
				// One implementation per binding, handed over the way an adapter hands over its
				// assembly's own: the double does not model a process-shared instance, so a suite that
				// wants to observe the once-per-implementation lifecycle binds once and drives it.
				factory ?? (() => implementation),
				config,
			);
		},
		run(name, options = {}) {
			const attempt = commandAttempt(name, options);
			attempt.invoke();
			return attempt.observed;
		},
		async runToCompletion(name, options = {}) {
			const attempt = commandAttempt(name, options);
			await attempt.invoke();
			return attempt.observed;
		},
		deliverSession(owner, options = {}) {
			const notices: string[] = [];
			const feedback: FeedbackNotice[] = [];
			const persisted: StateValues[] = [];
			const markers: string[][] = [];
			const hasUI = options.hasUI ?? true;
			for (const handler of sessionHandlers) {
				handler({
					event: options.event ?? { kind: "session_start", reason: "initial" },
					session: options.session ?? DEFAULT_SESSION,
					owner,
					statePayloads: options.statePayloads ?? [],
					persist: values => {
						persisted.push(values);
					},
					hasUI,
					feedback: {
						notify: (level, message) => {
							feedback.push({ level, message });
						},
					},
					notices: {
						warn: message => {
							notices.push(message);
						},
					},
					markers: markerTransport(markers),
				});
			}
			return { hasUI, notices, feedback, persisted, markers };
		},
		deliverRound(owner, options = {}) {
			const feedback: FeedbackNotice[] = [];
			const hasUI = options.hasUI ?? true;
			const event = options.event ?? { kind: "round_start" };
			const quiescent = options.quiescent ?? true;
			// The observation a harness reports: the run-cycle fact behind the edge a suite asked
			// for, its own session's facts, and the live reads the framework re-checks.
			const observation: RoundObservation = {
				signal:
					event.kind === "round_start"
						? { kind: "activity_started" }
						: {
								kind: "settled",
								willContinue: options.willContinue ?? false,
								...(options.outcome === undefined ? {} : { outcome: options.outcome }),
							},
				session: options.session ?? DEFAULT_SESSION,
				owner,
				hasUI,
				feedback: {
					notify: (level, message) => {
						feedback.push({ level, message });
					},
				},
				quiescent: () => quiescent,
				heldWork: () => (options.heldWork === "unstated" ? undefined : options.heldWork ?? false),
			};
			for (const observer of roundObservers) observer(observation);
			// An end candidate is confirmed on the harness's next task, so a suite driving the edge
			// runs what that delivery arranged — the host reaching the task the framework asked for.
			for (const task of pendingTasks.splice(0)) task();
			return { hasUI, feedback };
		},
		async deliverDisposal(owner, options = {}) {
			const feedback: FeedbackNotice[] = [];
			const hasUI = options.hasUI ?? true;
			const disposal: SessionDisposal = {
				session: options.session ?? DEFAULT_SESSION,
				owner,
				hasUI,
				feedback: {
					notify: (level, message) => {
						feedback.push({ level, message });
					},
				},
			};
			// A host waits for what the framework owes at its own exit position, so the answer here is
			// every registered handler's own settlement rather than the fact that they were called.
			for (const handler of disposalHandlers) await handler(disposal);
			return { hasUI, feedback };
		},
		deliverContext(owner, options) {
			const feedback: FeedbackNotice[] = [];
			const hasUI = options.hasUI ?? true;
			for (const handler of contextHandlers) {
				handler({
					session: options.session ?? DEFAULT_SESSION,
					owner,
					reading: options.reading,
					hasUI,
					feedback: {
						notify: (level, message) => {
							feedback.push({ level, message });
						},
					},
				});
			}
			return { hasUI, feedback };
		},
		deliverTurn(signal, options = {}) {
			const feedback: FeedbackNotice[] = [];
			const hasUI = options.hasUI ?? true;
			const facts: TurnSignalFacts = {
				signal,
				owner: options.owner ?? { kind: "owner", key: DEFAULT_OWNER_KEY },
				hasUI,
				feedback: {
					notify: (level, message) => {
						feedback.push({ level, message });
					},
				},
			};
			for (const handler of turnHandlers) {
				handler(facts);
			}
			return { hasUI, feedback };
		},
		deliverUserInput(owner, options = {}) {
			const feedback: FeedbackNotice[] = [];
			const hasUI = options.hasUI ?? true;
			for (const handler of userInputHandlers) {
				handler({
					event: { kind: "user_input" },
					owner,
					session: options.session ?? DEFAULT_SESSION,
					hasUI,
					feedback: {
						notify: (level, message) => {
							feedback.push({ level, message });
						},
					},
				});
			}
			return { hasUI, feedback };
		},
		async initiateRun(owner, options = {}) {
			const markers: string[][] = [];
			for (const handler of runHandlers) {
				const contribution = await handler({
					owner,
					contributionIdentities: options.contributionIdentities ?? [],
					markers: markerTransport(markers),
				});
				if (contribution !== undefined) return { contribution, markers };
			}
			return { contribution: undefined, markers };
		},
	};
}
