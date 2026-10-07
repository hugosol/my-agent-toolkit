/**
 * The unified extension feedback channel and the `hasUI` fact at the framework's adapter
 * contract (S2; F10, F11, F14; contract P16, P17).
 *
 * The seam is the runtime-neutral one: a definition bound through `bindExtension` to the
 * port an agent runtime provides, driven by the shared port double. What the framework owes
 * there is observed end to end — a toggle announces its activation on the delivery's
 * feedback channel at `info`, an assembly-injected implementation's notices keep the
 * severity they chose and the order they were made in, a delivery carries the adapter's
 * `hasUI` fact unchanged, the framework's own admission notice stays on its own channel,
 * and no notice ever reaches model context.
 *
 * How a level becomes a UI notification or a stderr line is the adapter's mapping; the OMP
 * side of it is observed in `feedback-runtime.test.ts`, together with the framework's own
 * warning-level notice, which is not extension feedback.
 */
import { describe, expect, test } from "bun:test";
import { CODEBASE_TOOLS } from "../../extensions/codebase-tools/definition";
import type { CommandActions, CommandDelivery, FeedbackLevel } from "../../framework/core/protocol";
import { type ExtensionDefinition, defineExtension } from "../../framework/public";
import { DEFAULT_OWNER_KEY, portDouble } from "./support/runtime-port-double";

/** The owner a run acts on; the double resolves one main session per key. */
const OWNER = { kind: "owner", key: DEFAULT_OWNER_KEY } as const;

/** A definition whose whole behavior is one directed command the assembly implements. */
function feedbackDefinition(id: string): ExtensionDefinition {
	return defineExtension({
		id,
		displayName: id,
		commands: [{ type: "directed", name: id, state: "enabled" }],
	});
}

/**
 * The implementation an assembly injects: it records the `hasUI` fact its delivery carries
 * and then publishes the notices it was handed, in order, without writing any State.
 */
function publishingActions(
	command: string,
	notices: ReadonlyArray<{ readonly level: FeedbackLevel; readonly message: string }>,
	seenHasUI: boolean[],
): CommandActions {
	return {
		[command]: {
			run: (_directive, delivery: CommandDelivery) => {
				seenHasUI.push(delivery.hasUI);
				for (const notice of notices) delivery.feedback.notify(notice.level, notice.message);
			},
		},
	};
}

describe("the toggle's feedback goes out on the unified channel (F14)", () => {
	test("each toggle announces the value it produced, at info severity", () => {
		const double = portDouble();
		double.bind(CODEBASE_TOOLS);

		const on = double.run("codebase-tools", { owner: OWNER });
		const off = double.run("codebase-tools", { owner: OWNER });

		// The text is the extension's own, unchanged by the move onto the unified channel.
		expect(on.feedback).toEqual([{ level: "info", message: "codeBaseTools enabled" }]);
		expect(off.feedback).toEqual([{ level: "info", message: "codeBaseTools disabled" }]);
		// One notice per toggle: the framework publishes nothing besides the value it wrote.
		expect(on.feedback).toHaveLength(1);
		expect(off.feedback).toHaveLength(1);
	});
});

describe("a handler's own notices keep the severity they chose (F10)", () => {
	test("an implementation's error and info notices reach the operator unchanged, in call order", () => {
		const double = portDouble();
		const seenHasUI: boolean[] = [];
		const notices = [
			{ level: "error" as const, message: "register rejected: the panel did not answer" },
			{ level: "info" as const, message: "disconnected from session-1" },
		];
		double.bind(feedbackDefinition("directed-feedback"), {
			actions: publishingActions("directed-feedback", notices, seenHasUI),
		});

		const run = double.run("directed-feedback", { owner: OWNER });

		expect(run.feedback).toEqual(notices);
		// Nothing was added, downgraded or upgraded on the way out: a mixed sequence arrives
		// in the order it was made in.
		expect(run.feedback.map(notice => notice.level)).toEqual(["error", "info"]);
	});
});

describe("the hasUI fact is the runtime's, carried unchanged (F11)", () => {
	test("a command delivery reports whether the session has a UI, in both runtime states", () => {
		const double = portDouble();
		const seenHasUI: boolean[] = [];
		double.bind(feedbackDefinition("directed-hasui"), {
			actions: publishingActions("directed-hasui", [], seenHasUI),
		});

		const withUI = double.run("directed-hasui", { owner: OWNER, hasUI: true });
		const headless = double.run("directed-hasui", { owner: OWNER, hasUI: false });

		// The fact the delivery reports is the fact the session had — never a constant, and
		// never inferred from whether a notice was published.
		expect(withUI.hasUI).toBe(true);
		expect(headless.hasUI).toBe(false);
		// The handler reads the same fact, which is what lets shared logic gate on it.
		expect(seenHasUI).toEqual([true, false]);
	});

	test("a session delivery reports whether the session has a UI, in both runtime states", () => {
		const double = portDouble();
		double.bind(feedbackDefinition("directed-session-hasui"), {
			actions: publishingActions("directed-session-hasui", [], []),
		});

		// The semantic-event delivery carries the same fact a command delivery does, so one
		// shared gate serves both handler kinds.
		expect(double.deliverSession(OWNER, { hasUI: true }).hasUI).toBe(true);
		expect(double.deliverSession(OWNER, { hasUI: false }).hasUI).toBe(false);
	});
});

describe("the framework's own notices are not extension feedback", () => {
	test("an unlisted version is announced on the framework's notice channel, and the feedback channel stays empty", () => {
		const double = portDouble();
		double.bind(CODEBASE_TOOLS, { version: "18.6.1" });

		const boundary = double.deliverSession(OWNER);

		expect(boundary.notices).toEqual([
			"codeBaseTools: agent runtime version 18.6.1 is not in the supported set (18.5.0); continuing without a support claim",
		]);
		// A framework warning is not an extension notice: it is never routed through the
		// channel an extension's own text travels.
		expect(boundary.feedback).toEqual([]);
	});

	test("a session with nothing to say publishes on neither channel", () => {
		const double = portDouble();
		double.bind(CODEBASE_TOOLS);

		const boundary = double.deliverSession(OWNER);

		expect(boundary.notices).toEqual([]);
		expect(boundary.feedback).toEqual([]);
	});
});

describe("feedback never enters model context (P16)", () => {
	test("a notice a handler published leaves no trace in the recorded value, the contribution or the marker area", () => {
		const NOTICE = "register rejected: the panel did not answer";
		const double = portDouble();
		const definition = defineExtension({
			id: "leak-probe",
			displayName: "LeakProbe",
			state: { field: "enabled" },
			commands: [{ type: "directed", name: "leak-probe", state: "enabled" }],
			prompts: [{ tag: "instructions", strategy: "every-enabled-run", content: "LeakProbe instructions" }],
			marker: { text: "◈ leakProbe" },
		});
		double.bind(definition, {
			actions: {
				"leak-probe": {
					run: (_directive, delivery: CommandDelivery) => {
						delivery.state.write(true);
						delivery.feedback.notify("error", NOTICE);
					},
				},
			},
		});

		const run = double.run("leak-probe", { owner: OWNER });
		const initiated = double.initiateRun(OWNER);

		// The notice really was published, so the absences below are not a silent channel.
		expect(run.feedback).toEqual([{ level: "error", message: NOTICE }]);
		// What persists is the declared State value and nothing else.
		expect(run.persisted).toEqual([{ enabled: true }]);
		expect(JSON.stringify(run.persisted)).not.toContain(NOTICE);
		// What the model is handed is the extension's declared prompt text, not its feedback.
		expect(initiated.contribution?.content).toBe("LeakProbe instructions");
		expect(JSON.stringify(initiated.contribution ?? null)).not.toContain(NOTICE);
		// The area renders the extension's marker text, never a notice.
		expect(run.markers).toEqual([["◈ leakProbe"]]);
		expect(JSON.stringify(run.markers)).not.toContain(NOTICE);
	});
});
