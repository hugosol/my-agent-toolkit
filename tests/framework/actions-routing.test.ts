/**
 * The `actions` command: its argument surface, its completion and its failure reporting (P28).
 *
 * The seam is the public binding — a definition declared through `defineExtension`, an
 * implementation handed to the binding the way an assembly hands one over, and the invocation a
 * harness would construct — so nothing here reaches an internal router. The expectations are
 * written from the declared table itself: the help is the text the declaration's own lines spell
 * out, and which action ran is what the implementation recorded.
 */
import { describe, expect, test } from "bun:test";
import type { ActionDelivery } from "../../framework/core/protocol";
import {
	type CommandAction,
	type CommandImplementations,
	type ExtensionDefinition,
	defineExtension,
} from "../../framework/public";
import { portDouble } from "./support/harness-port-double";

/** The command under test, with the three actions `/budget` declares. */
const BUDGET = defineExtension({
	id: "budget-probe",
	displayName: "budgetProbe",
	commands: [
		{
			type: "actions",
			name: "budget",
			description: "费用统计与展示管理",
			actions: {
				detail: "切换简略／详细展示",
				holiday: "开启假日计价",
				clear: "归档并重置统计",
			},
		},
	],
});

/**
 * The help the declaration above spells out, written here from the declaration rather than read
 * back from the framework: it is what an operator sees for an empty or an unrecognized argument.
 */
const BUDGET_HELP = [
	"/budget — 费用统计与展示管理",
	"  detail — 切换简略／详细展示",
	"  holiday — 开启假日计价",
	"  clear — 归档并重置统计",
].join("\n");

/** The three action names `/budget` declares. */
type BudgetAction = "detail" | "holiday" | "clear";

/**
 * The command's implementation: every declared action, recording the ones that ran, with any
 * action a test wants to replace supplied as an override.
 *
 * All three are always present, because the declaration and the implementation are one pair: a
 * table entry with nothing behind it refuses the binding rather than becoming a help line that
 * does nothing.
 */
function recordingImplementation(
	ran: string[],
	overrides: Partial<Record<BudgetAction, CommandAction>> = {},
): CommandImplementations {
	const action = (name: BudgetAction): CommandAction =>
		overrides[name] ??
		(() => {
			ran.push(name);
		});
	return { budget: { detail: action("detail"), holiday: action("holiday"), clear: action("clear") } };
}

describe("an action is selected by the whole argument, after trimming and ignoring case (P28)", () => {
	test("a declared action runs when the argument is exactly its name", async () => {
		const double = portDouble();
		const ran: string[] = [];
		double.bind(BUDGET, { commands: recordingImplementation(ran) });

		const run = await double.runToCompletion("budget", { args: "holiday" });

		expect(ran).toEqual(["holiday"]);
		// The framework publishes nothing for a successful action: the effect's own words are the
		// action's to say.
		expect(run.feedback).toEqual([]);
	});

	test("the action delivery carries no marker area transport", async () => {
		const double = portDouble();
		const deliveries: Array<Record<string, unknown>> = [];
		double.bind(BUDGET, {
			commands: recordingImplementation([], {
				holiday: delivery => {
					deliveries.push(delivery as unknown as Record<string, unknown>);
				},
			}),
		});

		await double.runToCompletion("budget", { args: "holiday" });

		// The object the framework handed the selected action: the invocation's approved facts and
		// its feedback channel, never the marker area transport the framework publishes through.
		expect(deliveries).toHaveLength(1);
		const keys = (value: unknown): string[] => {
			if (typeof value !== "object" || value === null) return [];
			return Object.entries(value).flatMap(([key, child]) => [key, ...keys(child)]);
		};
		expect(keys(deliveries[0])).not.toContain("markers");
		expect(keys(deliveries[0])).not.toContain("publishMarkers");
	});

	test("surrounding whitespace and letter case are not part of the action name", async () => {
		const double = portDouble();
		const ran: string[] = [];
		double.bind(BUDGET, { commands: recordingImplementation(ran) });

		await double.runToCompletion("budget", { args: "  DETAIL\n" });
		await double.runToCompletion("budget", { args: "Clear" });

		expect(ran).toEqual(["detail", "clear"]);
	});

	test("an empty argument prints the help and runs nothing", async () => {
		const double = portDouble();
		const ran: string[] = [];
		double.bind(BUDGET, { commands: recordingImplementation(ran) });

		const run = await double.runToCompletion("budget", { args: "" });
		const blank = await double.runToCompletion("budget", { args: "   " });

		expect(ran).toEqual([]);
		expect(run.feedback).toEqual([{ level: "info", message: BUDGET_HELP }]);
		expect(blank.feedback).toEqual([{ level: "info", message: BUDGET_HELP }]);
	});

	test("an abbreviation, an extra argument and an undeclared word are refused with the same help", async () => {
		const double = portDouble();
		const ran: string[] = [];
		double.bind(BUDGET, { commands: recordingImplementation(ran) });

		const abbreviated = await double.runToCompletion("budget", { args: "det" });
		const extended = await double.runToCompletion("budget", { args: "detail on" });
		const undeclared = await double.runToCompletion("budget", { args: "budget clear" });

		// No business code ran, and each refusal is one error carrying the help an empty argument
		// prints — never the extension's own words, which is what a directed command's
		// unrecognized-argument path would have reached.
		expect(ran).toEqual([]);
		expect(abbreviated.feedback).toEqual([{ level: "error", message: BUDGET_HELP }]);
		expect(extended.feedback).toEqual([{ level: "error", message: BUDGET_HELP }]);
		expect(undeclared.feedback).toEqual([{ level: "error", message: BUDGET_HELP }]);
	});
});

describe("the host chain waits for the action, and an unhandled failure is reported once (P28, P56)", () => {
	test("an asynchronous action finishes before the invocation returns", async () => {
		const double = portDouble();
		const steps: string[] = [];
		double.bind(BUDGET, {
			commands: recordingImplementation(steps, {
				holiday: async (_delivery: ActionDelivery) => {
					steps.push("started");
					await Promise.resolve();
					await Promise.resolve();
					steps.push("finished");
				},
			}),
		});

		const run = await double.runToCompletion("budget", { args: "holiday" });

		// The completion is the action's own: the record is read after it finished, and what the
		// action said on the way is part of it.
		expect(steps).toEqual(["started", "finished"]);
		expect(run.feedback).toEqual([]);
	});

	test("a synchronous throw is reported once, at error severity, and concludes the command", async () => {
		const double = portDouble();
		double.bind(BUDGET, {
			commands: recordingImplementation([], {
				clear: () => {
					throw new Error("the archive could not be published");
				},
			}),
		});

		const run = await double.runToCompletion("budget", { args: "clear" });

		expect(run.feedback).toEqual([
			{ level: "error", message: "/budget clear failed: the archive could not be published" },
		]);
	});

	test("a rejected promise is reported once, and nothing reports success afterwards", async () => {
		const double = portDouble();
		double.bind(BUDGET, {
			commands: recordingImplementation([], {
				clear: async () => {
					await Promise.resolve();
					throw new Error("the new period was refused");
				},
			}),
		});

		const run = await double.runToCompletion("budget", { args: "clear" });

		expect(run.feedback).toEqual([
			{ level: "error", message: "/budget clear failed: the new period was refused" },
		]);
		// The framework did not retry: one invocation, one report.
		expect(run.feedback).toHaveLength(1);
	});
});

describe("a declaration and its implementation are one pair (P28)", () => {
	test("an action the declaration lists with no implementation refuses the binding", () => {
		const double = portDouble();
		const bound = double.bind(BUDGET, {
			commands: { budget: { detail: () => {}, holiday: () => {} } },
		});

		expect(bound.bound).toBe(false);
		expect(double.registrations).not.toContain("command:budget");
		expect(double.diagnostics.join("\n")).toContain('missing: "clear"');
	});

	test("an actions command with no implementation at all refuses the binding", () => {
		const double = portDouble();
		const bound = double.bind(BUDGET);

		expect(bound.bound).toBe(false);
		expect(double.registrations).not.toContain("command:budget");
	});

	test("a directed implementation injected for an actions command refuses the binding", () => {
		const double = portDouble();
		const bound = double.bind(BUDGET, {
			commands: { budget: { run: () => {} } },
		});

		expect(bound.bound).toBe(false);
		expect(double.registrations).not.toContain("command:budget");
	});
});

describe("an action table the framework cannot route is a configuration error (P28)", () => {
	test("a table that declares no action is refused", () => {
		const empty = defineExtension({
			id: "empty-actions",
			displayName: "emptyActions",
			commands: [{ type: "actions", name: "nothing", actions: {} }],
		});
		const double = portDouble();
		const bound = double.bind(empty);

		expect(bound.bound).toBe(false);
		expect(double.diagnostics.join("\n")).toContain("declares no action");
	});

	test("two names one argument cannot tell apart are refused", () => {
		const colliding: ExtensionDefinition = defineExtension({
			id: "colliding-actions",
			displayName: "collidingActions",
			commands: [{ type: "actions", name: "collide", actions: { detail: "one", " DETAIL ": "the other" } }],
		});
		const double = portDouble();
		const bound = double.bind(colliding, { commands: { collide: { detail: () => {}, " DETAIL ": () => {} } } });

		expect(bound.bound).toBe(false);
		expect(double.diagnostics.join("\n")).toContain("cannot tell apart");
	});

	test("a name that holds nothing the framework can match is refused", () => {
		const blank = defineExtension({
			id: "blank-actions",
			displayName: "blankActions",
			commands: [{ type: "actions", name: "blank", actions: { "  ": "holds no name" } }],
		});
		const double = portDouble();
		const bound = double.bind(blank, { commands: { blank: { "  ": () => {} } } });

		expect(bound.bound).toBe(false);
		expect(double.diagnostics.join("\n")).toContain("which holds no characters the framework can match");
	});
});
