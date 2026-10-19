/**
 * Binding a declarative extension definition to a harness — the reusable,
 * harness-independent half of the framework.
 *
 * This module is adapter-facing, not an author entry: extension authors declare with
 * `framework/public.ts`, and a harness adapter (for OMP, `adapters/omp/index.ts`)
 * calls into this.
 *
 * Ordering is the contract: every fallible step (configuration rules, the definition's file, the
 * implementation factory, the declaration/implementation pairs) runs before the first
 * registration, so a definition the framework refuses to honor leaves nothing registered and no
 * implementation's resources behind. The factory is called only once the configuration validated
 * — it is the extension's first look at its own values, and a definition whose file is missing or
 * illegal never reaches it — and every refusal that follows it runs the implementation's one
 * cleanup, because by then an extension has built something the framework must not leave behind.
 * Failures are reported once each and returned as data; the caller's agent harness keeps running
 * with the extension unbound.
 *
 * What binding deliberately does not have is a harness-compatibility step: it checks no version
 * membership and judges no native capability surface, so a harness outside this repository's
 * support record, or one whose surface lacks a member, binds like any other. That judgement
 * belongs to the separately executed verification
 * ([harness-support.md § Independent compatibility verification](../docs/harness-support.md#independent-compatibility-verification)),
 * and normal startup carries none of it.
 *
 * The lifecycle after registration belongs to `framework/behaviors/lifecycle.ts`: the framework
 * calls the implementation's one-time initialization at the owner session node and its one
 * cleanup when the session the instance *serves* is disposed — an ordinary switch only moves that
 * owner — and this module only decides which binding observes which boundary.
 */
import {
	type ActionsCommandImplementation,
	type CommandImplementations,
	type ExtensionFactory,
	type ExtensionImplementation,
	isPlainMapping,
} from "../core/assembly";
import {
	BOUND_CONTROL_KINDS,
	BOUND_STATE_INHERITANCES,
	BOUND_STATE_PERSISTENCES,
	activationField,
	stateInheritance,
	type ExtensionDefinition,
} from "../core/definition";
import type { FeedbackTransport } from "../interface/feedback";
import type { SessionCapability } from "../interface/session";
import {
	type HarnessPort,
	type BindingFailure,
	type BindingResult,
	describeBindingFailure,
	type DirectedCommandImplementation,
	type ObservationSource,
	type ObservedSession,
	type PromptContribution,
} from "../core/protocol";
import type { StateStore } from "../core/state";
import { handOverReading, type SessionObservations } from "../core/observations";
import { findConfigFailure, getConfig, type ConfigSource } from "../core/config";
import { findConfigurationViolations } from "../core/violations";
import { runCommandActions } from "./actions";
import { runCommandDirected, runCommandToggle } from "./control";
import { planContribution } from "./injection";
import { cleanupImplementation, initializeImplementation, servingOwnerKeyOf, initializationPending } from "./lifecycle";
import { publishMarkerOnRun, publishMarkerOnViewChange, registerMarker, markerSeat } from "./marker";
import { createRoundSynthesis, roundLives } from "./round-events";
import { createSessionActivityAxis, type SessionActivityAxis } from "./session-activity";
import { createContextCollection, type ContextCollection } from "./session-context";
import { dispatchSessionEvent } from "./session-events";
import {
	ROUND_EVENT_KINDS,
	SESSION_ACTIVITY_KINDS,
	SESSION_CONTEXT_EVENT_KINDS,
	TURN_EVENT_KINDS,
	USER_INPUT_EVENT_KINDS,
	dispatchToGroups,
	subscribesAny,
} from "./subscriptions";
import { turnLives } from "./turn-events";

/** Whether one injected implementation is the directed half of a directed command. */
function isDirectedImplementation(value: unknown): value is DirectedCommandImplementation {
	if (!isPlainMapping(value)) return false;
	return "run" in value && typeof value.run === "function";
}

/** The actions an injected implementation does not carry, or `undefined` when it carries them all. */
function missingActions(value: unknown, declared: readonly string[]): readonly string[] | undefined {
	if (!isPlainMapping(value) || isDirectedImplementation(value)) return declared;
	const missing = declared.filter(action => typeof value[action] !== "function");
	return missing.length === 0 ? undefined : missing;
}

/** The implementation an `actions` command declared, once the pair has been checked. */
function actionsImplementationOf(
	implementations: CommandImplementations,
	name: string,
): ActionsCommandImplementation | undefined {
	const value = implementations[name];
	if (value === undefined || isDirectedImplementation(value)) return undefined;
	return value;
}

/**
 * The v1 initialization rules: what the framework must be able to honor before it
 * registers anything. Returns the failure detail, or `undefined` when the definition
 * can be bound.
 *
 * The last rule is the declaration/implementation pair: the definition names its commands as
 * plain data, and the implementation the factory built is what runs. A pair that is incomplete —
 * a directed command with nothing to run, an `actions` command missing one of the actions its own
 * help lists, or an implementation of the other kind — is refused before the first registration
 * rather than registered as something that would do nothing.
 */
function findInitializationFailure(
	definition: ExtensionDefinition,
	implementations: CommandImplementations,
): string | undefined {
	if (definition.id.trim().length === 0) return "the definition declares no extension id";
	if (definition.displayName.trim().length === 0) return "the definition declares no display name";

	// The control kinds are a closed union, and this version binds the ones it implements:
	// a declaration of any other kind is refused rather than dropped on the floor.
	const unboundControl = (definition.commands ?? []).find(
		command => !BOUND_CONTROL_KINDS.includes(command.type),
	);
	if (unboundControl !== undefined) {
		return `command "${unboundControl.name}" declares control kind "${unboundControl.type}", which this framework version does not bind`;
	}

	// v1 owns exactly one State field per extension: a command that transitions any
	// other field would be a silently ignored declaration. An `actions` command drives no
	// declared field at all, so it is not a writer and takes no part in this rule.
	const field = activationField(definition);
	const foreignWriter = (definition.commands ?? [])
		.flatMap(command => (command.type === "actions" ? [] : [command]))
		.find(command => command.state !== field);
	if (foreignWriter !== undefined) {
		return `command "${foreignWriter.name}" transitions State field "${foreignWriter.state}", but the extension's State field is "${field}"`;
	}

	for (const command of definition.commands ?? []) {
		const implementation = implementations[command.name];
		if (command.type === "directed") {
			if (implementation === undefined) {
				return `command "${command.name}" declares control kind "directed", but no implementation was injected for it`;
			}
			if (!isDirectedImplementation(implementation)) {
				return `command "${command.name}" declares control kind "directed", but its injected implementation is not a directed implementation`;
			}
			continue;
		}
		if (command.type === "actions") {
			if (implementation === undefined) {
				return `command "${command.name}" declares control kind "actions", but no implementation was injected for it`;
			}
			const declared = Object.keys(command.actions);
			const missing = missingActions(implementation, declared);
			if (missing !== undefined) {
				const named = missing.length > 0 ? ` (missing: ${missing.map(action => `"${action}"`).join(", ")})` : "";
				return `command "${command.name}" declares control kind "actions", but its injected implementation carries no action table${named}`;
			}
			if (isDirectedImplementation(implementation)) {
				return `command "${command.name}" declares control kind "actions", but its injected implementation is a directed implementation`;
			}
		}
	}

	// The State lifecycle axes are closed unions like the control kinds, and this version
	// honors the members it implements: a value outside them would otherwise be read as the
	// default one, so the declaration is refused before the first registration instead. A
	// declaration that is not a State object at all cannot be read as one either, so it is
	// refused here rather than silently read as the defaults.
	const declaredState: unknown = definition.state;
	if (
		declaredState !== undefined &&
		(typeof declaredState !== "object" || declaredState === null || Array.isArray(declaredState))
	) {
		return `state declares "${String(declaredState)}", which is not a State declaration`;
	}

	const persistence = definition.state?.persistence;
	if (persistence !== undefined && !BOUND_STATE_PERSISTENCES.includes(persistence)) {
		return `state declares persistence "${persistence}", which this framework version does not bind`;
	}

	const inheritance = definition.state?.inheritance;
	if (inheritance !== undefined && !BOUND_STATE_INHERITANCES.includes(inheritance)) {
		return `state declares inheritance "${inheritance}", which this framework version does not bind`;
	}

	return undefined;
}

/**
 * Binds a definition to a harness, or refuses to.
 *
 * A refused definition contributes nothing — no label, no commands, no injections,
 * no marker — and reports one diagnostic per failure: a declared conflict, a declared
 * configuration its file cannot satisfy, or a declaration whose implementation never arrived.
 * An implementation the factory already built is cleaned up before that refusal is reported, so
 * a binding that fails after creation leaves no resource of the extension's behind. Nothing about
 * a *binding* is retained: no process-level registry exists to leak a partial binding into the
 * next session, which is why the same factory can bind every session and subagent independently,
 * and why each refused binding reports its own error.
 *
 * `state` is the one thing the adapter owns that outlives a binding: the adapter owns one
 * store per extension per process, so bindings for different sessions share the owner-keyed
 * cells rather than each starting from a private copy.
 *
 * `factory` is the extension's half of the assembly: called once the configuration validated,
 * handed the validated values, and expected to build the extension's own business instance
 * without sending a remote request or starting a timer. What it returns carries the commands and
 * subscriptions the definition's declarations need and, optionally, the one-time initialization
 * and cleanup the lifecycle runs. The adapter decides how long the returned implementation lives
 * — an adapter that keeps one per process gives the extension one instance across every session
 * and subagent — while this module decides only when its two entries run.
 *
 * `configSource` is the seam a declared configuration is read through: the reader and the
 * parser (this process's own file system and the pure-JS YAML parser by default, and a test's
 * where a suite drives a failure path without a file), plus the directory a relative declared
 * path is resolved against — the extension repository root the assembly supplies, since a
 * binding runs in an arbitrary project directory. It is read only when the definition declared
 * a configuration, and it is not binding state: the values it validates belong to the extension
 * for this process — they are what `getConfig` hands its shared logic and what the factory
 * receives — not to this binding.
 */
export function bindExtension(
	definition: ExtensionDefinition,
	port: HarnessPort,
	state: StateStore,
	observations: SessionObservations,
	factory?: ExtensionFactory,
	configSource: ConfigSource = {},
): BindingResult {
	const failures: BindingFailure[] = findConfigurationViolations(definition).map(violation => ({
		kind: "configuration",
		violation,
	}));

	// The declared configuration, still before the first registration and on the same
	// deterministic path as the declaration conflicts above: an extension whose declared
	// file cannot satisfy its declaration is refused whole, and the extensions that loaded
	// keep running. A definition that declares no configuration is untouched.
	if (failures.length === 0) {
		const configDetail = findConfigFailure(definition, configSource);
		if (configDetail !== undefined) {
			failures.push({ kind: "configuration", violation: { kind: "config", detail: configDetail } });
		}
	}

	if (failures.length > 0) {
		for (const failure of failures) port.reportDiagnostic(describeBindingFailure(definition.id, failure));
		return { bound: false, failures };
	}

	// The framework's cross-process half of session observation, as this binding's harness adapter
	// built it: the access whose one seat is this binding's own owner seat, and whose other direction
	// carries a reading of a session this process runs to the owner it follows. A harness whose
	// sessions are all bindings in this process supplies none, and everything below then stays
	// exactly as it was: this process's own source, observed here and delivered here.
	//
	// It is set up before the factory runs because the extension's own half of it is one of the facts
	// the factory is handed: an extension whose sessions write into a storage another process reads
	// states its confirmed writes through it, and the notice that statement produces has to leave from
	// the same access the readings below do.
	const observationBinding = state.access.bind({
		adopt: (source, reading) => adoptReading(source, reading),
		lost: source => loseSource(source),
	}, port.sessionObservationAccess);
	const handOver = observationBinding.handOver;
	// The extension's whole Session capability: a frozen read surface over the process's one source,
	// and the one statement it may make. The source's mutation methods are never handed out, and the
	// notice a confirmed write produces takes the same hand-over path a reading does.
	const session: SessionCapability = Object.freeze({
		observations: Object.freeze({
			read: (sessionId: string) => observations.read(sessionId),
			snapshot: () => observations.snapshot(),
		}),
		recordCommit: (sessionId: string) => {
			const stated = observations.recordCommit(sessionId);
			if (stated !== undefined) handOverReading(handOver, stated);
		},
	});

	// The extension's own half, and the first point at which its code runs. It is reached only
	// after the configuration validated, so the values handed over are the ones the definition
	// declared and nothing is read from the file twice; a factory that throws is a refused
	// binding like any other, reported with the initialization failures below. The harness's own
	// model prices ride along when its adapter reported any: they are a fact of the harness rather
	// than a handle, so what the factory receives is the query itself and never the native surface
	// it was mapped from.
	let implementation: ExtensionImplementation;
	try {
		implementation = factory === undefined
			? {}
			: factory({
					config: definition.config === undefined ? {} : getConfig(definition),
					// The process's Session capability: the live read surface (including readings collected
					// before the extension attached) and the one statement it makes about a confirmed write.
					session,
					...(port.modelPrices === undefined ? {} : { modelPrices: port.modelPrices }),
					...(port.providerAccess === undefined ? {} : { providerAccess: port.providerAccess }),
				});
	} catch (error) {
		observationBinding.dispose();
		const detail = error instanceof Error ? error.message : String(error);
		const failure: BindingFailure = { kind: "initialization", detail: `the implementation factory failed: ${detail}` };
		port.reportDiagnostic(describeBindingFailure(definition.id, failure));
		return { bound: false, failures: [failure] };
	}

	let delivering = true;

	/**
	 * The transports an arriving reading is dispatched with: the served owner's own session delivery.
	 *
	 * A reading that arrived from another process is delivered to the subscribers of the owner that
	 * session follows — the owner this process serves — so the UI fact and the feedback channel it
	 * travels with are that owner's, taken from the delivery that began serving the owner's seat. Nothing is
	 * invented for a session this process never saw a delivery about.
	 */
	let ownerTransport: { readonly hasUI: boolean; readonly feedback: FeedbackTransport } | undefined;
	/** The axes an arriving reading moves, as the collections above move them for a local one. */
	let activityAxis: SessionActivityAxis | undefined;
	let contextCollection: ContextCollection | undefined;

	/**
	 * Adopts one word a source delivered: this process's own record first, then the same axes the
	 * local collections move, and never anything of the billing lifecycle.
	 *
	 * The word states what that session was observed to be — its activity and its context, under the
	 * identity the process that ran it resolved — so adopting it is recording it and delivering it as
	 * the change it is; no Round is opened for it, no Turn is attributed and no request is accounted. A
	 * reading that states what this process already holds moves nothing, exactly as a repeated local
	 * collection does, so a re-delivered word is not published twice, and a word from a connection
	 * older than the one a reading already came from (`source`) is not taken at all.
	 *
	 * A word may also state that the session's own process confirmed a write of its extension data. That
	 * is a notice rather than a reading — nothing of it is accounted, and the storage it names is not
	 * this process's to read here — so what it costs is the one delivery that says the count moved: a
	 * subscriber that cares reads the storage itself, and a count this process already took states
	 * nothing.
	 */
	const adoptReading = (source: ObservationSource, reading: ObservedSession): void => {
		if (!delivering) return;
		observations.sawSession(reading.session, reading.owner);
		const transport = ownerTransport;
		if (transport === undefined) return;
		const sessionId = reading.session.sessionId;
		if (reading.activity !== undefined && observations.observeActivity(sessionId, reading.activity, source)) {
			activityAxis?.observe({
				session: reading.session,
				owner: reading.owner,
				activity: reading.activity,
				hasUI: transport.hasUI,
				feedback: transport.feedback,
			});
		}
		if (reading.commits !== undefined && observations.observeCommits(sessionId, reading.commits, source)) {
			void dispatchToGroups(
				definition.id,
				groups,
				"session_commit",
				reading.owner,
				() => ({
					delivery: {
						event: { kind: "session_commit" },
						session: reading.session,
						owner: reading.owner,
						commits: reading.commits as number,
						hasUI: transport.hasUI,
						feedback: transport.feedback,
					},
				}),
				port.reportDiagnostic,
			);
		}
		if (reading.context === undefined) return;
		const collection = {
			session: reading.session,
			owner: reading.owner,
			reading: reading.context,
			hasUI: transport.hasUI,
			feedback: transport.feedback,
		};
		// The collection is what records a context reading where this binding observes one; a binding
		// that observes none still holds the reading in the framework's own source for whoever reads
		// it later.
		if (contextCollection === undefined) observations.observeContext(sessionId, reading.context, source);
		else contextCollection.observe(collection, source);
	};

	/**
	 * Withdraws the readings one source held, as that source is gone: the connection it delivered over
	 * ended, whether the process that held it released the access or the receiving side observed the
	 * connection close or fail.
	 *
	 * What this leaves is the session's identity and nothing live about it: the readings that source
	 * stated are withdrawn from the process's own record — a newer source's readings, and this
	 * process's own observations, are untouched — and the subscribers that observe a session are told
	 * the observation is unavailable. Nothing else is delivered: the loss is not idleness, not a
	 * finished task and not a failure, so no Round edge, Turn or accounting fact is minted for it, and
	 * the session's saved consumption is not this record's to touch.
	 */
	const loseSource = (source: ObservationSource): void => {
		if (!delivering) return;
		const lost = observations.withdrawSource(source);
		const transport = ownerTransport;
		if (transport === undefined) return;
		for (const reading of lost) {
			// The axis's own reading for that session is the one just withdrawn: it is forgotten here so
			// that the same reading stated again — by a source that reached the seat after this one
			// ended — is delivered rather than read as the reading already delivered.
			activityAxis?.forget(reading.session.sessionId);
			void dispatchToGroups(
				definition.id,
				groups,
				"session_unobserved",
				reading.owner,
				() => ({
					delivery: {
						event: { kind: "session_unobserved" },
						session: reading.session,
						owner: reading.owner,
						hasUI: transport.hasUI,
						feedback: transport.feedback,
					},
				}),
				port.reportDiagnostic,
			);
		}
	};

	/**
	 * Withdraws the seat this binding is receiving observations for, as that owner leaves or the binding ends.
	 *
	 * The sessions that followed that owner are the ones its observation was for, and the seat goes
	 * with the owner's own life rather than with a later session's: the provider's children of an
	 * owner that is gone deliver to nothing, which is what a released seat reports to them.
	 */
	const releaseSeat = (): void => {
		observationBinding.dispose();
		ownerTransport = undefined;
	};

	// From here on the extension has built something, so every remaining refusal runs its one
	// cleanup before it is reported: a failed binding never leaves a business instance running.
	const refuse = (failure: BindingFailure): BindingResult => {
		cleanupImplementation(definition.id, implementation, port.reportDiagnostic);
		// A refused binding delivers nothing, so the seat it received observations on — if a delivery
		// reached it before the registration failed — is withdrawn with it.
		releaseSeat();
		port.reportDiagnostic(describeBindingFailure(definition.id, failure));
		return { bound: false, failures: [failure] };
	};

	const detail = findInitializationFailure(definition, implementation.commands ?? {});
	if (detail !== undefined) return refuse({ kind: "initialization", detail });

	// The groups this binding's implementation declared: the whole subscription surface, each group
	// carrying the one scope it observes under. A definition that declared none subscribes nothing
	// and installs none of the three hooks below.
	const groups = implementation.subscriptions ?? [];
	const implementations = implementation.commands ?? {};
	// The binding's delivery is live until its cleanup runs. Ending the session the implementation
	// serves tears it down, and from then on this binding delivers nothing to it: the native hooks
	// were registered for the life of the session and cannot be unregistered, so the framework
	// keeps its own switch — the extension's own cleanup is never followed by another delivery. The
	// switch covers the command path as well: a registration cannot be withdrawn once the host holds
	// it, so an invocation that arrives afterwards reaches neither an injected implementation nor a
	// retained capability of the instance that was disposed. The framework's own local State path
	// (`toggle`) is not the extension's code and stays reachable, exactly as the session suite shows.

	// The seat every marker publication of this binding projects: the session the harness is
	// displaying, re-read per publication, or the position the delivery itself carries when this
	// harness publishes no viewed-session outlet. It is a read of a fact, never authority — nothing
	// here writes State, retains a capability or drives an owner's effect.
	const seat = markerSeat(port);
	// The binding's one subscription to the harness's displayed session, given up with the binding.
	// A definition with no marker contributes no line and so speaks for no area, and a harness with
	// no outlet reports none to subscribe to.
	let releaseViewed: (() => void) | undefined;

	// Registration is a single commit after all validation: the extension is labeled, its
	// State reconciles at every session boundary this binding observes, its injection slots
	// are planned at every run initiation, its marker joins the framework's unified area,
	// and, in declaration order, its commands are registered against the same store.
	// Anything the harness refuses here leaves the extension reported as unbound;
	// the framework itself keeps nothing on either outcome.
	try {
		port.setLabel(definition.displayName);
		port.onSession(session => {
			if (!delivering) return;
			// The framework's own record of this session: its identity and the owner it follows are
			// what a consumer attaching later names it by, and they are recorded before anything this
			// delivery runs, exactly as the framework's State behavior is applied before a handler.
			observations.sawSession(session.session, session.owner);
			// This process's own reading of that session leaves here where the owner it follows is
			// served in another process: it is the registration that owner's process gets, and it is
			// made from the same delivery that recorded the session here.
			handOverReading(handOver, { session: session.session, owner: session.owner });
			// The framework's own behavior runs before the extension's handler, and a handler
			// that throws is reported rather than allowed to disturb the framework or another
			// binding: see `session-events.ts` for the order and the isolation.
			dispatchSessionEvent(definition, state, session, groups, seat, port.reportDiagnostic);

			if (session.event.kind === "session_start" && session.owner.kind === "owner") {
				// The owner session node: the first moment of this process in which the extension
				// serves a session that can hold its business instance, and therefore where its
				// one-time initialization runs. The run-initiation hook waits for the promise this
				// creates, so the first model request is issued after the initialization settled.
				// Admission precedes initialization: a child may report as soon as its first request starts.
				observationBinding.enter(session.owner.key);
				ownerTransport = { hasUI: session.hasUI, feedback: session.feedback };
				void initializeImplementation(
					definition.id,
					implementation,
					{
						owner: session.owner,
						hasUI: session.hasUI,
						feedback: session.feedback,
					},
					port.reportDiagnostic,
					port.subagentIntegration,
				);
				return;
			}

			if (session.event.kind === "session_end" && session.owner.kind === "owner") {
				// The owner's own life ends — it is disposed, or another session takes its place — and
				// this process's seat for it goes with it: the sessions that followed that owner are
				// the ones its observation was for, and the seat comes back with the owner entered
				// next rather than being kept for a session that no longer exists.
				if (observationBinding.leave(session.owner.key)) ownerTransport = undefined;
			}

			if (
				session.event.kind === "session_end" &&
				session.event.reason === "disposed" &&
				session.owner.kind === "owner" &&
				session.owner.key === servingOwnerKeyOf(implementation)
			) {
				// The session this implementation is serving is gone: stop delivering to the
				// extension, then run its one cleanup. The owner's own cell was retired by the
				// framework's behavior above, so any capability the extension retained is already
				// inert and a late callback cannot speak for the session that ended. The harness's
				// view subscription is given up here too: this binding's part in the area is over,
				// and a listener kept past it would speak for an extension that no longer delivers.
				delivering = false;
				releaseSeat();
				releaseViewed?.();
				releaseViewed = undefined;
				cleanupImplementation(definition.id, implementation, port.reportDiagnostic);
			}
		});
		// The round axis is subscribed when this extension observes one of its edges, one of the Turn
		// axis's, or one of the readings those transitions state — the activity axis, and a session
		// reading in the framework's own observation source, whose activity those edges leave behind —
		// because a Turn states which round it belongs to and that identity is this bookkeeping's, and
		// because the activity reading is that same bookkeeping's own projection and is delivered from
		// the transitions it dispatches. Unlike the session subscription above there is no framework
		// State behavior to run for a round — the agent's work state is not framework State — so a
		// definition that subscribed to none of them asks the harness for no round deliveries and
		// registers no such hook. The same bookkeeping is what the Turn hook below reads.
		const lives = roundLives();
		if (
			subscribesAny(groups, [
				...ROUND_EVENT_KINDS,
				...TURN_EVENT_KINDS,
				...SESSION_ACTIVITY_KINDS,
				...SESSION_CONTEXT_EVENT_KINDS,
			])
		) {
			// The synthesis is what decides the edges; the framework arranges its end-candidate
			// re-check on the harness's next task, so a harness that never reports a `nextTask`
			// capability leaves a candidate unconfirmed rather than being polled for one. The activity
			// axis rides along with it, because it is those same transitions that state a session's
			// reading.
			// The activity axis: the reading those transitions leave a session in, and the same axis an
			// arriving reading of another process's session moves below.
			activityAxis = createSessionActivityAxis({ definition, groups, reportFailure: port.reportDiagnostic });
			const rounds = createRoundSynthesis({
				definition,
				lives,
				groups,
				observations,
				handOver,
				activity: activityAxis,
				reportFailure: port.reportDiagnostic,
				nextTask: callback => port.nextTask(callback),
				delivering: () => delivering,
			});
			port.onRound(observation => {
				if (!delivering) return;
				rounds.observe(observation);
			});
			// The disposal fact a harness reports at its own awaitable exit position: what the framework
			// owes there is this binding's close-out, and the answer the harness waits for is that
			// close-out's own completion. It is registered with the round hook rather than the session one
			// because the round axis is what it closes, and a binding that observes neither the round axis
			// nor the Turn axis installs neither. An adapter that reports no such fact leaves the round to
			// the facts it does publish.
			port.onDisposal?.(async disposal => {
				if (!delivering) return;
				await rounds.dispose(disposal);
			});
		}
		// The context-collection hook is subscribed only when a group observes a reading, so a
		// definition that reads no session's context asks the harness to collect none at all. What
		// the adapter collects where, and what a reading means here, are both above this line: the
		// adapter reads the host's own public context reading, and the framework records it and
		// delivers it as the change it is.
		if (subscribesAny(groups, SESSION_CONTEXT_EVENT_KINDS)) {
			contextCollection = createContextCollection({
				definition,
				observations,
				groups,
				handOver,
				reportFailure: port.reportDiagnostic,
			});
			port.onSessionContext(observation => {
				if (!delivering) return;
				contextCollection?.observe(observation);
			});
		}
		// The model-cycle hook is subscribed only when a group observes a Turn edge, so a definition
		// that never looks at a request asks the harness for no model-cycle facts at all.
		if (subscribesAny(groups, TURN_EVENT_KINDS)) {
			const turns = turnLives(definition, lives, implementation.catalog, groups, port.reportDiagnostic);
			port.onTurn(facts => {
				if (!delivering) return;
				turns.observe(facts);
			});
		}
		// The input hook is subscribed only when a group observes it. There is no framework behavior
		// behind it — a submission crosses no boundary, so nothing the framework owns moves — so the
		// delivery reaches its subscribers exactly as the adapter resolved it.
		if (subscribesAny(groups, USER_INPUT_EVENT_KINDS)) {
			port.onUserInput(input => {
				if (!delivering) return;
				dispatchToGroups(
					definition.id,
					groups,
					input.event.kind,
					input.owner,
					() => ({ delivery: input }),
					port.reportDiagnostic,
				);
			});
		}
		// The run-initiation hook is subscribed when the definition participates in a run at
		// all — a slot to contribute, a marker to re-assert, or an initialization the request
		// must wait for; a definition with none of them installs no handler. The behaviors
		// themselves write nothing, so a re-entered delivery plans the same contribution and
		// re-asserts the same area from the same State and branch facts.
		const contributes = (definition.prompts ?? []).length > 0;
		const awaitsInitialization = implementation.initialize !== undefined || implementation.cleanup !== undefined;
		if (contributes || definition.marker !== undefined || awaitsInitialization) {
			port.onRunInitiation(run => {
				if (!delivering) return undefined;
				const plan = (): PromptContribution | undefined => {
					if (!delivering) return undefined;
					publishMarkerOnRun(definition, run, seat);
					return contributes ? planContribution(definition, state, run) : undefined;
				};
				const initialized = initializationPending(implementation);
				const followed = run.owner.kind === "inherited" && stateInheritance(definition) === "follow"
					? state.prepareFollowed(run.owner.key)
					: undefined;
				if (initialized === undefined && followed === undefined) return plan();
				// First use joins the bounded initial access, not a per-read request. After it settles,
				// State keeps answering the pushed value (or the existing default on failure).
				return Promise.all([initialized, followed]).then(plan);
			});
		}
		registerMarker(definition, state);
		for (const command of definition.commands ?? []) {
			switch (command.type) {
				case "toggle":
					port.registerCommand({
						name: command.name,
						description: command.description,
						run: invocation => runCommandToggle(definition, state, invocation, seat),
					});
					break;
				case "directed": {
					// The pair was completed at validation, so an implementation is present here;
					// the check is what makes that reachable for the compiler as well as for plain
					// JavaScript.
					const injected = implementations[command.name];
					if (injected === undefined || !isDirectedImplementation(injected)) break;
					port.registerCommand({
						name: command.name,
						description: command.description,
						run: invocation =>
							delivering ? runCommandDirected(definition, state, invocation, injected, seat) : undefined,
					});
					break;
				}
				case "actions": {
					const injected = actionsImplementationOf(implementations, command.name);
					if (injected === undefined) break;
					port.registerCommand({
						name: command.name,
						description: command.description,
						run: invocation => (delivering ? runCommandActions(command, invocation, injected) : undefined),
					});
					break;
				}
			}
		}
		// The displayed session is a fact of the process rather than of one delivery, so a view that
		// attaches to another session is a transition no delivery of this binding has to carry: the
		// subscription is what re-projects the area for what is on screen now. It is created once,
		// after the registrations, so a binding refused before this point never holds one.
		const viewed = port.viewedSession;
		if (definition.marker !== undefined && viewed !== undefined) {
			releaseViewed = viewed.subscribe(markers => {
				if (!delivering) return;
				const displayed = viewed.read();
				// The outlet went away rather than reporting a target: there is nothing to project,
				// and the delivery-position projection is not this notification's to publish.
				if (displayed === undefined) return;
				publishMarkerOnViewChange(definition, markers, displayed);
			});
		}
	} catch (error) {
		const failure: BindingFailure = {
			kind: "initialization",
			detail: `registration failed: ${error instanceof Error ? error.message : String(error)}`,
		};
		return refuse(failure);
	}

	return { bound: true, definition };
}
