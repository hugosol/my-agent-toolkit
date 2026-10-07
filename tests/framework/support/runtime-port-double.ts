/**
 * The runtime-neutral port double: the framework suite's shared binding harness.
 *
 * The framework's contract with an agent runtime is a definition plus the
 * `AgentRuntimePort` that runtime provides, and its behaviors are observable there —
 * as registrations the port receives and as effects the framework publishes through
 * the transports the port hands it. This double is that port: it records every
 * registration, and it drives those registrations the way a runtime would, so a suite
 * can bind a definition and run its commands without naming any agent-runtime-native
 * type. Suites that must observe a *native* mapping (the OMP adapter's synthesis of
 * events, entries or widgets) keep driving `ompAdapter` with an `OmpExtensionApi`
 * double instead; this harness covers the runtime-independent half.
 *
 * One double is one assembly: one State store and one admission-notice ledger shared
 * by every binding it makes, exactly as an extension's assembly has one of each.
 */
import { bindExtension } from "../../../framework/behaviors/binding";
import { AdmissionNotices, type DeclarableRequiredSemantic, type RequiredSemantic } from "../../../framework/core/admission";
import type { ConfigSource } from "../../../framework/core/config";
import type { ExtensionDefinition } from "../../../framework/core/definition";
import type {
	AgentRuntimePort,
	BindingResult,
	BoundCommand,
	CommandActions,
	CommandInvocation,
	FeedbackLevel,
	MarkerTransport,
	OwnerReference,
	PromptContribution,
	RoundDelivery,
	RoundEvent,
	SemanticEventHandlers,
	SessionDelivery,
	SessionEvent,
	StateValues,
} from "../../../framework/core/protocol";
import { StateStore } from "../../../framework/core/state";

/** The owner key a command invocation or session delivery acts on unless one is named. */
export const DEFAULT_OWNER_KEY = "main:port-double";

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
	 * modelled it, or `undefined` when it modelled a runtime that reports none.
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

/** The facts one binding resolves, besides the definition and the actions injected for it. */
export interface PortBindingOptions {
	/** The assembly's implementations of the definition's directed commands, by command name. */
	readonly actions?: CommandActions;
	/** The assembly's handlers for the definition's semantic lifecycle events, by event kind. */
	readonly events?: SemanticEventHandlers;
	/** The versions the extension declares support for; one listed version by default. */
	readonly supportedVersions?: readonly string[];
	/** The version the runtime reports; `undefined` models a runtime that reports none. */
	readonly version?: string;
	/** The semantics the runtime cannot honor. */
	readonly missingRequiredSemantics?: readonly RequiredSemantic[];
	/**
	 * The semantics this binding's assembly declared it depends on, besides the ones the
	 * framework requires of every binding; an assembly that declared none passes nothing.
	 */
	readonly requiredSemantics?: readonly DeclarableRequiredSemantic[];
	/**
	 * The configuration source the binding reads a declared configuration through: the
	 * framework's own file system and YAML parser by default, so a suite injects one only to
	 * model a file without a file system.
	 */
	readonly config?: ConfigSource;
}

/** The recorded port of one assembly, and the driver a suite observes behavior through. */
export interface PortDouble {
	readonly state: StateStore;
	/** Labels the framework set, in call order. */
	readonly labels: readonly string[];
	/** Diagnostics the framework reported on the port's non-model channel. */
	readonly diagnostics: readonly string[];
	/**
	 * Registrations in call order: `label:<name>`, `onSession`, `onRound` (only when the
	 * assembly injected a round handler), `onRunInitiation`, `command:<name>`.
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
	bind(definition: ExtensionDefinition, options?: PortBindingOptions): BindingResult;
	/** Runs one registered command as a user of `owner` would; throws when it was never registered. */
	run(
		command: string,
		options?: {
			readonly args?: string;
			readonly owner?: OwnerReference;
			readonly hasUI?: boolean;
			/**
			 * The idle fact the session reports through the invocation's query: `"idle"` and
			 * `"busy"` for a runtime that answers, `"unreported"` for one that reports none.
			 * Omitted means idle, the state a session at a command prompt is in.
			 */
			readonly idle?: "idle" | "busy" | "unreported";
		},
	): CommandRun;
	/** Delivers one semantic session event to every extension bound so far. */
	deliverSession(
		owner: OwnerReference,
		options?: {
			readonly event?: SessionEvent;
			readonly statePayloads?: readonly unknown[];
			readonly hasUI?: boolean;
		},
	): SessionBoundary;
	/** Delivers one semantic round edge to every extension bound so far. */
	deliverRound(
		owner: OwnerReference,
		options?: { readonly event?: RoundEvent; readonly hasUI?: boolean },
	): RoundBoundary;
	/** Delivers one run initiation to every extension bound so far. */
	initiateRun(
		owner: OwnerReference,
		options?: { readonly contributionIdentities?: readonly string[] },
	): RunInitiation;
}

export function portDouble(): PortDouble {
	const state = new StateStore();
	// One ledger per assembly, as one binding of one assembly shares a process.
	const notices = new AdmissionNotices();
	const labels: string[] = [];
	const diagnostics: string[] = [];
	const registrations: string[] = [];
	const commands: BoundCommand[] = [];
	const sessionHandlers: Array<(session: SessionDelivery) => void> = [];
	const roundHandlers: Array<(round: RoundDelivery) => void> = [];
	const runHandlers: Array<Parameters<AgentRuntimePort["onRunInitiation"]>[0]> = [];
	const markerUpdates: string[][] = [];

	const commandUnder = (name: string): BoundCommand => {
		const command = commands.find(candidate => candidate.name === name);
		if (command === undefined) throw new Error(`no command registered under "${name}"`);
		return command;
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

	const port: AgentRuntimePort = {
		setLabel: label => {
			labels.push(label);
			registrations.push(`label:${label}`);
		},
		reportDiagnostic: message => {
			diagnostics.push(message);
		},
		onSession: handler => {
			registrations.push("onSession");
			sessionHandlers.push(handler);
		},
		onRound: handler => {
			registrations.push("onRound");
			roundHandlers.push(handler);
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
		state,
		labels,
		diagnostics,
		registrations,
		commands,
		markerUpdates,
		bind(definition, options = {}) {
			return bindExtension(
				definition,
				port,
				state,
				{
					supportedVersions: options.supportedVersions ?? ["18.5.0"],
					facts: {
						version: options.version ?? "18.5.0",
						missingRequiredSemantics: options.missingRequiredSemantics,
					},
					requiredSemantics: options.requiredSemantics,
					notices,
				},
				options.actions,
				options.events,
				options.config,
			);
		},
		run(name, options = {}) {
			const command = commandUnder(name);
			const persisted: StateValues[] = [];
			const feedback: FeedbackNotice[] = [];
			const markers: string[][] = [];
			const effects: string[] = [];
			const hasUI = options.hasUI ?? true;
			// The idle fact the session reports through the invocation's query: a runtime that
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
				feedback: {
					notify: (level, message) => {
						effects.push("notify");
						feedback.push({ level, message });
					},
				},
				markers: markerTransport(markers, effects),
			};
			command.run(invocation);
			return {
				command: name,
				args: invocation.args,
				owner: invocation.owner,
				hasUI: invocation.hasUI,
				persisted,
				canAcceptInput: canAcceptInput(),
				feedback,
				markers,
				effects,
			};
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
			for (const handler of roundHandlers) {
				handler({
					event: options.event ?? { kind: "round_start" },
					owner,
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
		initiateRun(owner, options = {}) {
			const markers: string[][] = [];
			for (const handler of runHandlers) {
				const contribution = handler({
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
