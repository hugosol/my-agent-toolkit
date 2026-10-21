/**
 * The shared integration plan at the framework's binding seam.
 *
 * These cases state the behavior runtime binding depends on, not a copy of the implementation's
 * internal tables: which axes a plain usage selects, which port hooks that selection requires, and
 * which obligations stay optional. Event-map completeness is enforced by the planner's typed record.
 */
import { describe, expect, test } from "bun:test";
import {
	INTEGRATION_EVENT_AXIS,
	planIntegration,
	type IntegrationEventKind,
	type IntegrationPlan,
	type IntegrationPortObligation,
} from "../../framework/behaviors/integration-plan";

/** One port obligation the plan states, or `undefined` when the plan does not rely on it. */
function obligation(
	plan: IntegrationPlan,
	member: IntegrationPortObligation["member"],
): IntegrationPortObligation | undefined {
	return plan.port.find(entry => entry.member === member);
}

describe("the integration plan's unconditional surface", () => {
	test("a bare usage plans session reconciliation and observation, and no semantic hook", () => {
		const plan = planIntegration({});

		expect(plan.session.required).toBe(true);
		expect(plan.observation.required).toBe(true);
		expect(plan.round.required).toBe(false);
		expect(plan.activity.required).toBe(false);
		expect(plan.context.required).toBe(false);
		expect(plan.turn.required).toBe(false);
		expect(plan.input.required).toBe(false);
		expect(plan.runInitiation.required).toBe(false);
		expect(plan.marker).toEqual({ declared: false, register: false, viewed: false });
		expect(plan.commands).toEqual([]);

		expect(obligation(plan, "onSession")?.requirement).toBe("required");
		expect(obligation(plan, "onRound")).toBeUndefined();
		expect(obligation(plan, "onSessionContext")).toBeUndefined();
		expect(obligation(plan, "onTurn")).toBeUndefined();
		expect(obligation(plan, "onUserInput")).toBeUndefined();
		expect(obligation(plan, "onRunInitiation")).toBeUndefined();
		expect(obligation(plan, "viewedSession")).toBeUndefined();
		expect(obligation(plan, "sessionObservationAccess")?.requirement).toBe("when-available");
	});
});

describe("the round machinery's selected axes", () => {
	test("a context subscription keeps the round bookkeeping and its activity axis selected", () => {
		const plan = planIntegration({ events: ["session_context", "session_context"] });

		expect(plan.context.required).toBe(true);
		expect(plan.round.required).toBe(true);
		expect(plan.activity.required).toBe(true);
		expect(plan.turn.required).toBe(false);
		expect(plan.input.required).toBe(false);

		// The repeated kind is one fact, and the activity axis is derived from the round block.
		expect(plan.round.reasons).toEqual([{ kind: "event", event: "session_context" }]);
		expect(plan.activity.reasons).toEqual([{ kind: "derived", axis: "round" }]);

		expect(obligation(plan, "onRound")?.requirement).toBe("required");
		expect(obligation(plan, "onSessionContext")?.requirement).toBe("required");
		expect(obligation(plan, "onDisposal")?.requirement).toBe("when-available");
		expect(obligation(plan, "nextTask")?.requirement).toBe("required");
	});

	test("a Turn subscription selects the round bookkeeping and the Turn hook, not context", () => {
		const plan = planIntegration({ events: ["turn_start", "turn_end"] });

		expect(plan.round.required).toBe(true);
		expect(plan.activity.required).toBe(true);
		expect(plan.turn.required).toBe(true);
		expect(plan.context.required).toBe(false);

		expect(obligation(plan, "onRound")?.requirement).toBe("required");
		expect(obligation(plan, "onTurn")?.requirement).toBe("required");
		expect(obligation(plan, "onSessionContext")).toBeUndefined();
	});

	test("an activity subscription alone selects the round machinery but no context or Turn hook", () => {
		const plan = planIntegration({ events: ["session_activity"] });

		expect(plan.round.required).toBe(true);
		expect(plan.activity.required).toBe(true);
		expect(plan.context.required).toBe(false);
		expect(plan.turn.required).toBe(false);
		expect(plan.input.required).toBe(false);

		expect(obligation(plan, "onRound")?.requirement).toBe("required");
		expect(obligation(plan, "onTurn")).toBeUndefined();
		expect(obligation(plan, "onSessionContext")).toBeUndefined();
	});

	test("input is independent of the round machinery", () => {
		const plan = planIntegration({ events: ["user_input"] });

		expect(plan.input.required).toBe(true);
		expect(plan.round.required).toBe(false);
		expect(plan.activity.required).toBe(false);
		expect(plan.context.required).toBe(false);
		expect(plan.turn.required).toBe(false);

		expect(obligation(plan, "onUserInput")?.requirement).toBe("required");
		expect(obligation(plan, "onRound")).toBeUndefined();
		expect(obligation(plan, "onDisposal")).toBeUndefined();
		expect(obligation(plan, "nextTask")).toBeUndefined();
	});

	test("event kinds alone never select run initiation", () => {
		const allKinds = Object.keys(INTEGRATION_EVENT_AXIS) as IntegrationEventKind[];
		const plan = planIntegration({ events: allKinds });

		expect(plan.round.required).toBe(true);
		expect(plan.context.required).toBe(true);
		expect(plan.turn.required).toBe(true);
		expect(plan.input.required).toBe(true);
		expect(plan.runInitiation.required).toBe(false);
		expect(obligation(plan, "onRunInitiation")).toBeUndefined();
	});

	test("commit and unobserved subscriptions use the baseline observation path, not a new hook", () => {
		const plan = planIntegration({ events: ["session_commit", "session_unobserved"] });

		expect(plan.observation.required).toBe(true);
		expect(plan.session.required).toBe(true);
		expect(plan.round.required).toBe(false);
		expect(plan.context.required).toBe(false);
		expect(plan.turn.required).toBe(false);
		expect(plan.input.required).toBe(false);
		expect(plan.runInitiation.required).toBe(false);
		expect(obligation(plan, "onRound")).toBeUndefined();
		expect(obligation(plan, "onUserInput")).toBeUndefined();
	});
});

describe("run initiation and the marker", () => {
	test("a capability with no slot, marker or lifecycle entry installs no hook", () => {
		const plan = planIntegration({ prompts: false, marker: false, initialize: false, cleanup: false });

		expect(plan.runInitiation).toEqual({
			required: false,
			contribute: false,
			marker: false,
			initialization: false,
			reasons: [],
		});
	});

	test("each declaration selects the hook for its own behavior", () => {
		const prompted = planIntegration({ prompts: true });
		expect(prompted.runInitiation.required).toBe(true);
		expect(prompted.runInitiation.contribute).toBe(true);
		expect(prompted.runInitiation.marker).toBe(false);
		expect(prompted.runInitiation.initialization).toBe(false);
		expect(obligation(prompted, "onRunInitiation")?.requirement).toBe("required");

		const marked = planIntegration({ marker: true });
		expect(marked.runInitiation.required).toBe(true);
		expect(marked.runInitiation.contribute).toBe(false);
		expect(marked.runInitiation.marker).toBe(true);
		expect(marked.runInitiation.initialization).toBe(false);
		expect(marked.marker).toEqual({ declared: true, register: true, viewed: true });

		const initialized = planIntegration({ initialize: true });
		expect(initialized.runInitiation.initialization).toBe(true);

		// A cleanup without an initialize still asks for the hook: the binding's current gate is
		// initialize OR cleanup, and the plan preserves that behavior rather than tightening it.
		const cleaned = planIntegration({ cleanup: true });
		expect(cleaned.runInitiation.required).toBe(true);
		expect(cleaned.runInitiation.initialization).toBe(true);
	});

	test("the viewed-session outlet is optional, and wanted only by a marker", () => {
		const marked = planIntegration({ marker: true });
		expect(obligation(marked, "viewedSession")?.requirement).toBe("when-available");

		const unmarked = planIntegration({ prompts: true });
		expect(obligation(unmarked, "viewedSession")).toBeUndefined();
	});
});

describe("commands and classification", () => {
	test("directed and actions commands require an implementation; toggle does not", () => {
		const plan = planIntegration({
			commands: [
				{ name: "toggle", control: "toggle" },
				{ name: "directed", control: "directed" },
				{ name: "actions", control: "actions" },
			],
		});

		expect(plan.commands.map(command => command.name)).toEqual(["toggle", "directed", "actions"]);
		expect(plan.commands.map(command => command.implementation)).toEqual([false, true, true]);
		expect(plan.commands.map(command => command.registration)).toEqual(["toggle", "directed", "actions"]);
		expect(obligation(plan, "registerCommand")?.requirement).toBe("required");
	});

	test("a usage with no commands registers none", () => {
		expect(obligation(planIntegration({}), "registerCommand")).toBeUndefined();
	});

	test("a full usage states each port member once and keeps optional outlets optional", () => {
		const allKinds = Object.keys(INTEGRATION_EVENT_AXIS) as IntegrationEventKind[];
		const plan = planIntegration({
			events: allKinds,
			prompts: true,
			marker: true,
			initialize: true,
			cleanup: true,
			commands: [{ name: "probe", control: "toggle" }],
		});

		const members = plan.port.map(entry => entry.member);
		expect(new Set(members).size).toBe(members.length);
		for (const optional of ["onDisposal", "viewedSession", "sessionObservationAccess"] as const) {
			expect(obligation(plan, optional)?.requirement).toBe("when-available");
		}
		expect(obligation(plan, "onRunInitiation")?.requirement).toBe("required");
		expect(obligation(plan, "registerCommand")?.requirement).toBe("required");
	});

});
