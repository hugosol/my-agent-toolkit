/**
 * The framework's integration plan: which semantic axes one binding's plain usage requires, and
 * which port surface materializes each of them.
 *
 * This module is deliberately pure and structural. It does not read a definition, call a factory,
 * execute a handler or name a native API: a caller states which event kinds any subscription group
 * handles, which declarations and lifecycle slots are present, and which command kinds are
 * registered, and receives the decisions `bindExtension` uses for hook selection. Runtime binding
 * consumes the plan so the grouping rules have one home, and an offline dependency analyzer can
 * consume the same plan without running extension code.
 *
 * The grouping is framework-owned rather than one axis per event kind:
 *
 * - the session axis is unconditional: every binding records the actual session and applies the
 *   framework's State behavior at its boundary even when no handler declared any session event;
 * - the round machinery is selected by a Round event, a Turn event, an activity reading or a
 *   context reading. A Turn names the Round it belongs to and activity readings are the transitions
 *   that same bookkeeping leaves behind; context is part of the same selected block in the current
 *   binding, and the planner preserves that grouping rather than narrowing it. The activity axis
 *   is materialized with the machinery;
 * - context collection, the Turn hook and the input hook are selected only by their own kinds;
 * - run initiation is selected by a contribution slot, a marker or a lifecycle slot (initialize or
 *   cleanup), because the request must wait for initialization and the marker is re-asserted
 *   there;
 * - the viewed-session subscription is wanted only by a marker, and remains subject to the
 *   adapter's optional outlet. Disposal and cross-process observation access are likewise optional
 *   and are reported as `when-available`, not as requirements no adapter must satisfy.
 *
 * A plan describes what the current usage requires of the framework; it does not decide whether a
 * harness supplies it, and an optional member's absence is a fact to report, not a binding refusal.
 */
import type { ControlKind } from "../interface/command";
import type { SemanticEvent } from "../interface/session";
import type { HarnessPort } from "../runtime/port";

/** The semantic event kinds a subscription or an implementation can name. */
export type IntegrationEventKind = SemanticEvent["kind"];

/**
 * One semantic axis the framework materializes.
 *
 * `observation` is the framework's always-present source of session readings, including the
 * confirmed-write notice and the unobserved withdrawal; it has no subscription hook of its own and
 * is never selected by an event kind, but it names the baseline path those events travel through.
 */
export type IntegrationAxis =
	| "session"
	| "observation"
	| "round"
	| "activity"
	| "context"
	| "turn"
	| "input";

/** A command as plain usage states it: enough to select its registration path. */
export interface IntegrationCommand {
	/** Command name, without the leading slash. */
	readonly name: string;
	/** The declared control kind, which decides which implementation the command needs. */
	readonly control: ControlKind;
}

/**
 * The plain structural usage of the framework: no handlers, no factory, no definition object.
 *
 * A materialized implementation states these facts from its groups and slots; a future offline
 * analyzer states the same facts from statically visible authoring structure. Omitted members mean
 * "none declared", so a bare usage plans only the unconditional axes.
 */
export interface IntegrationUsage {
	/** Every event kind any subscription group handles, in or across groups. */
	readonly events?: readonly IntegrationEventKind[];
	/** Whether the definition declares at least one injected-prompt slot. */
	readonly prompts?: boolean;
	/** Whether the definition declares a marker line. */
	readonly marker?: boolean;
	/** Whether the implementation declares the one-time initialization slot. */
	readonly initialize?: boolean;
	/** Whether the implementation declares the one-time cleanup slot. */
	readonly cleanup?: boolean;
	/** The definition's commands, in declaration order. */
	readonly commands?: readonly IntegrationCommand[];
	/** Whether the implementation declares tools. */
	readonly tools?: boolean;
}

/** A declaration kind that can select framework behavior. */
export type IntegrationDeclarationKind = "prompts" | "marker" | "initialize" | "cleanup" | "commands" | "tools";

/**
 * Why one plan point exists.
 *
 * `event` names the subscription fact directly. `declaration` names a plain declaration or
 * lifecycle slot. `derived` records a framework grouping rule: the point is materialized because
 * another axis is. Keeping the provenance rather than only a boolean is what lets a future
 * diagnostic show the dependency path from usage to port obligation.
 */
export type IntegrationReason =
	| { readonly kind: "baseline" }
	| { readonly kind: "event"; readonly event: IntegrationEventKind }
	| { readonly kind: "declaration"; readonly declaration: IntegrationDeclarationKind }
	| { readonly kind: "derived"; readonly axis: IntegrationAxis };

/** Whether one axis is selected, and the usage facts that selected it. */
export interface IntegrationAxisPlan {
	readonly required: boolean;
	readonly reasons: readonly IntegrationReason[];
}

/**
 * Whether a run initiation must be observed, and which behaviors it carries.
 *
 * `contribute` is the prompt-contribution gate the binding reads inside the hook; `marker` is the
 * marker re-assertion; `initialization` is the wait for the implementation's one-time lifecycle.
 * These stay separate because they behave differently inside one delivery: a contribution is
 * planned from State and branch facts, a marker publication writes nothing, and an initialization
 * may make the hook awaitable.
 */
export interface IntegrationRunInitiationPlan {
	readonly required: boolean;
	readonly contribute: boolean;
	readonly marker: boolean;
	readonly initialization: boolean;
	readonly reasons: readonly IntegrationReason[];
}

/**
 * The marker's integration: its line, its area entry, and the viewed-session outlet it wants.
 *
 * `viewed` states intent, not port policy: the binding subscribes only when the adapter also
 * supplies `viewedSession`. A harness without the outlet keeps projecting the delivery position.
 */
export interface IntegrationMarkerPlan {
	readonly declared: boolean;
	readonly register: boolean;
	readonly viewed: boolean;
}

/** One command's registration choice, as the declaration kind decides it. */
export interface IntegrationCommandPlan extends IntegrationCommand {
	/** The registration path the framework uses for this command. */
	readonly registration: ControlKind;
	/** Whether the binding must have an injected implementation (directed and actions commands). */
	readonly implementation: boolean;
}

/** Whether the port member is mandatory for the planned behavior or used only when present. */
export type IntegrationRequirement = "required" | "when-available";

/** One port member the plan relies on, with its strongest requirement and its provenance. */
export interface IntegrationPortObligation {
	readonly member: keyof HarnessPort;
	readonly requirement: IntegrationRequirement;
	readonly reasons: readonly IntegrationReason[];
}

/** The complete integration selected by one plain usage. */
export interface IntegrationPlan {
	/** The unconditional session reconciliation and handler hook. */
	readonly session: IntegrationAxisPlan;
	/** The unconditional reading record and adoption path behind commit/unobserved deliveries. */
	readonly observation: IntegrationAxisPlan;
	/** The round synthesis, including its optional disposal close-out. */
	readonly round: IntegrationAxisPlan;
	/** The activity axis, materialized with the round machinery. */
	readonly activity: IntegrationAxisPlan;
	/** The context-collection hook. */
	readonly context: IntegrationAxisPlan;
	/** The model-cycle Turn hook. */
	readonly turn: IntegrationAxisPlan;
	/** The user-input hook. */
	readonly input: IntegrationAxisPlan;
	/** The run-initiation hook and the behaviors it carries. */
	readonly runInitiation: IntegrationRunInitiationPlan;
	/** Marker area registration and viewed-session intent. */
	readonly marker: IntegrationMarkerPlan;
	/** Commands in declaration order, each with its registration path. */
	readonly commands: readonly IntegrationCommandPlan[];
	/** Port members the planned behavior relies on, with honest required/optional status. */
	readonly port: readonly IntegrationPortObligation[];
}

/**
 * Which semantic axis each event kind belongs to.
 *
 * The record is total over `SemanticEvent["kind"]`, so adding an event kind to the contract is a
 * compile error here until its framework behavior is classified. Subscription to a `session` or
 * `observation` kind selects no additional hook because both axes are unconditional.
 */
export const INTEGRATION_EVENT_AXIS: Readonly<Record<IntegrationEventKind, IntegrationAxis>> = {
	session_start: "session",
	session_end: "session",
	session_facts: "session",
	round_start: "round",
	round_end: "round",
	session_activity: "activity",
	turn_start: "turn",
	turn_end: "turn",
	user_input: "input",
	session_context: "context",
	session_commit: "observation",
	session_unobserved: "observation",
};

/** The axes that keep the round machinery selected, including its derived activity axis. */
const ROUND_MACHINERY_AXES: readonly IntegrationAxis[] = ["round", "turn", "activity", "context"];

/** The reason one axis is unconditional; shared because it never varies. */
const BASELINE_REASONS: readonly IntegrationReason[] = [{ kind: "baseline" }];

/** The provenance of a port obligation that exists because the round machinery does. */
const ROUND_DERIVED_REASONS: readonly IntegrationReason[] = [{ kind: "derived", axis: "round" }];

/**
 * The unique subscription reasons for the named axes.
 *
 * Duplicate event kinds are one fact: a group repeating a kind, or two groups naming it, must not
 * make the plan carry the same provenance twice. Order follows the usage's first statement so a
 * diagnostic stays stable.
 */
function subscriptionReasons(
	events: readonly IntegrationEventKind[],
	axes: readonly IntegrationAxis[],
): IntegrationReason[] {
	const seen = new Set<IntegrationEventKind>();
	const reasons: IntegrationReason[] = [];
	for (const event of events) {
		if (seen.has(event)) continue;
		seen.add(event);
		const axis = INTEGRATION_EVENT_AXIS[event];
		if (axes.includes(axis)) reasons.push({ kind: "event", event });
	}
	return reasons;
}

/** One axis selected by any of its subscription kinds. */
function subscriptionAxis(
	events: readonly IntegrationEventKind[],
	axes: readonly IntegrationAxis[],
): IntegrationAxisPlan {
	const reasons = subscriptionReasons(events, axes);
	return { required: reasons.length > 0, reasons };
}

/**
 * Plans one binding's integration from plain structural usage.
 *
 * The result is a pure function of the usage: the same usage states the same plan, no resource is
 * created and no extension code runs. Conditions are intentionally the ones the runtime applies
 * today — including the transitive Turn, activity and context dependency on the round machinery
 * and the initialize-or-cleanup dependency of run initiation — so selecting hooks from this plan
 * preserves current binding behavior rather than defining a new policy.
 */
export function planIntegration(usage: IntegrationUsage): IntegrationPlan {
	const events = usage.events ?? [];
	const prompts = usage.prompts === true;
	const marker = usage.marker === true;
	const initialize = usage.initialize === true;
	const cleanup = usage.cleanup === true;

	const session: IntegrationAxisPlan = { required: true, reasons: BASELINE_REASONS };
	const observation: IntegrationAxisPlan = { required: true, reasons: BASELINE_REASONS };
	const round = subscriptionAxis(events, ROUND_MACHINERY_AXES);
	// The activity axis is created inside the round block rather than by its own subscription: the
	// same bookkeeping applies a round transition's reading and an arriving remote one. Its absence
	// would silently stop those observations even when a Turn alone selected the round machinery.
	const activity: IntegrationAxisPlan = round.required
		? { required: true, reasons: ROUND_DERIVED_REASONS }
		: { required: false, reasons: [] };
	const context = subscriptionAxis(events, ["context"]);
	const turn = subscriptionAxis(events, ["turn"]);
	const input = subscriptionAxis(events, ["input"]);

	const runReasons: IntegrationReason[] = [];
	if (prompts) runReasons.push({ kind: "declaration", declaration: "prompts" });
	if (marker) runReasons.push({ kind: "declaration", declaration: "marker" });
	if (initialize) runReasons.push({ kind: "declaration", declaration: "initialize" });
	if (cleanup) runReasons.push({ kind: "declaration", declaration: "cleanup" });
	const runInitiation: IntegrationRunInitiationPlan = {
		required: runReasons.length > 0,
		contribute: prompts,
		marker,
		initialization: initialize || cleanup,
		reasons: runReasons,
	};

	const markerPlan: IntegrationMarkerPlan = {
		declared: marker,
		register: marker,
		viewed: marker,
	};

	const commands = (usage.commands ?? []).map(command => ({
		name: command.name,
		control: command.control,
		registration: command.control,
		implementation: command.control !== "toggle",
	}));

	const port: IntegrationPortObligation[] = [
		{ member: "setLabel", requirement: "required", reasons: BASELINE_REASONS },
		{ member: "reportDiagnostic", requirement: "required", reasons: BASELINE_REASONS },
		{ member: "onSession", requirement: "required", reasons: BASELINE_REASONS },
		{ member: "sessionObservationAccess", requirement: "when-available", reasons: BASELINE_REASONS },
	];
	if (round.required) {
		port.push(
			{ member: "onRound", requirement: "required", reasons: round.reasons },
			{ member: "onDisposal", requirement: "when-available", reasons: ROUND_DERIVED_REASONS },
			// The round end candidate is re-checked on the host's next task; a harness that cannot
			// arrange that leaves the candidate unconfirmed rather than polled, so the member is a
			// real obligation of the round machinery even though it registers no hook.
			{ member: "nextTask", requirement: "required", reasons: ROUND_DERIVED_REASONS },
		);
	}
	if (context.required) {
		port.push({ member: "onSessionContext", requirement: "required", reasons: context.reasons });
	}
	if (turn.required) {
		port.push({ member: "onTurn", requirement: "required", reasons: turn.reasons });
	}
	if (input.required) {
		port.push({ member: "onUserInput", requirement: "required", reasons: input.reasons });
	}
	if (runInitiation.required) {
		port.push({ member: "onRunInitiation", requirement: "required", reasons: runInitiation.reasons });
	}
	if (commands.length > 0) {
		port.push({
			member: "registerCommand",
			requirement: "required",
			reasons: [{ kind: "declaration", declaration: "commands" }],
		});
	}
	if (usage.tools) {
		port.push({ member: "registerTool", requirement: "required", reasons: [{ kind: "declaration", declaration: "tools" }] });
	}
	if (markerPlan.viewed) {
		port.push({
			member: "viewedSession",
			requirement: "when-available",
			reasons: [{ kind: "declaration", declaration: "marker" }],
		});
	}

	return {
		session,
		observation,
		round,
		activity,
		context,
		turn,
		input,
		runInitiation,
		marker: markerPlan,
		commands,
		port,
	};
}
