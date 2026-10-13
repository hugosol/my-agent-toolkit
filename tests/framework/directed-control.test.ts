/**
 * Directed control at the framework's adapter contract (S2; F1, ticket 02).
 *
 * The seam is the harness-neutral one: a definition bound through `bindExtension` to
 * the port a harness provides, driven by the shared port double. Everything the
 * ticket fixes is observed there — an empty argument and `off` each run the
 * assembly-injected implementation, a repeated invocation runs it again, the framework
 * publishes no feedback of its own, an unrecognized argument reaches the implementation's
 * own `unrecognized` member (and runs no effect and changes no State when the
 * implementation injects none), and a directed declaration with no injected
 * implementation is refused before anything is registered.
 *
 * The declaration names the target value, but the implementation owns the write: it
 * records the value through the declared-value seam its delivery carries (ticket 03), so
 * a dock implementation applies its directive the way an extension's own handler does,
 * and a value the framework "would have" derived from the argument is never recorded.
 */
import { describe, expect, test } from "bun:test";
import type { CommandDelivery, RecognizedDirective } from "../../framework/core/protocol";
import { type CommandImplementations, type ExtensionDefinition, defineExtension } from "../../framework/public";
import { type PortDouble, portDouble } from "./support/harness-port-double";

/** One implementation call, as the injected implementation saw it. */
interface ActionCall {
	readonly directive: RecognizedDirective;
	readonly ownerKey: string;
}

/** A definition whose whole behavior is one directed command plus the marker it drives. */
function directedDefinition(id: string): ExtensionDefinition {
	return defineExtension({
		id,
		displayName: id,
		commands: [{ type: "directed", name: id, state: "enabled" }],
		marker: { text: `◈ ${id}` },
	});
}

/**
 * The implementation an assembly injects for one directed command: it records every call
 * and then writes the value its directive named, which is what the command's own handler
 * does with the delivery's declared-value seam.
 */
function applyingActions(command: string): {
	readonly commands: CommandImplementations;
	readonly calls: ActionCall[];
} {
	const calls: ActionCall[] = [];
	return {
		calls,
		commands: {
			[command]: {
				run: (directive, delivery: CommandDelivery) => {
					calls.push({
						directive,
						ownerKey: delivery.owner.kind === "unresolved" ? "" : delivery.owner.key,
					});
					delivery.state.write(directive.kind === "activate");
				},
			},
		},
	};
}

describe("directed control: a named target and a repeated implementation (F1)", () => {
	test("an empty argument activates the field and runs the injected implementation once", () => {
		const double: PortDouble = portDouble();
		const { commands: actions, calls } = applyingActions("directed-activate");
		const bound = double.bind(directedDefinition("directed-activate"), { commands: actions });
		expect(bound.bound).toBe(true);

		const run = double.run("directed-activate", { owner: { kind: "owner", key: "main:activate" } });

		expect(calls).toEqual([{ directive: { kind: "activate" }, ownerKey: "main:activate" }]);
		expect(double.state.view("main:activate").read("enabled")).toBe(true);
		expect(run.persisted).toEqual([{ enabled: true }]);
		expect(run.markers).toEqual([["◈ directed-activate"]]);
		expect(run.feedback).toEqual([]);
	});

	test("`off` deactivates the field and runs the injected implementation once", () => {
		const double: PortDouble = portDouble();
		const { commands: actions, calls } = applyingActions("directed-deactivate");
		double.bind(directedDefinition("directed-deactivate"), { commands: actions });
		const owner = { kind: "owner", key: "main:deactivate" } as const;

		double.run("directed-deactivate", { owner });
		const off = double.run("directed-deactivate", { args: "off", owner });

		expect(calls.map(call => call.directive)).toEqual([{ kind: "activate" }, { kind: "deactivate" }]);
		expect(double.state.view(owner.key).read("enabled")).toBe(false);
		expect(off.persisted).toEqual([{ enabled: false }]);
		// Deactivation removes the extension's line, and the area clears with it.
		expect(off.markers).toEqual([[]]);
		// The off path publishes no framework text either: the extension owns it.
		expect(off.feedback).toEqual([]);
	});

	test("a repeated invocation runs the implementation again instead of short-circuiting", () => {
		const double: PortDouble = portDouble();
		const { commands: actions, calls } = applyingActions("directed-repeat");
		double.bind(directedDefinition("directed-repeat"), { commands: actions });
		const owner = { kind: "owner", key: "main:repeat" } as const;

		const first = double.run("directed-repeat", { owner });
		const second = double.run("directed-repeat", { owner });
		const third = double.run("directed-repeat", { owner });

		// Nothing is deduplicated: every invocation runs the implementation, including the ones whose
		// argument names the value the field already holds.
		expect(calls.map(call => call.directive)).toEqual([
			{ kind: "activate" },
			{ kind: "activate" },
			{ kind: "activate" },
		]);
		// Nor short-circuited: the implementation writes on every invocation and the marker area
		// is re-published rather than skipped as "already rendered".
		expect(second.persisted).toEqual([{ enabled: true }]);
		expect(third.persisted).toEqual([{ enabled: true }]);
		expect(third.markers).toEqual([["◈ directed-repeat"]]);
		expect(first.feedback).toEqual([]);
	});

	test("a pending implementation does not delay the next invocation: nothing is serialized", () => {
		const double: PortDouble = portDouble();
		const started: string[] = [];
		const pending: Array<() => void> = [];
		const commands: CommandImplementations = {
			"directed-pending": {
				run: async (directive: RecognizedDirective) => {
					started.push(directive.kind);
					await new Promise<void>(resolve => {
						pending.push(resolve);
					});
				},
			},
		};
		double.bind(directedDefinition("directed-pending"), { commands });

		double.run("directed-pending", { owner: { kind: "owner", key: "main:pending" } });
		double.run("directed-pending", { owner: { kind: "owner", key: "main:pending" } });

		// The second invocation entered the implementation while the first one is still pending: the
		// framework keeps no queue and awaits nothing before the next command runs.
		expect(started).toEqual(["activate", "activate"]);
		for (const resolve of pending) resolve();
	});

	test("an unrecognized argument reaches the implementation's own `unrecognized` member", () => {
		const double: PortDouble = portDouble();
		const seen: Array<{ readonly argument: string; readonly ownerKey: string }> = [];
		const commands: CommandImplementations = {
			"directed-hint": {
				run: () => {
					throw new Error("run must not be called for an argument that parsed to no directive");
				},
				unrecognized: (argument, delivery) => {
					seen.push({
						argument,
						ownerKey: delivery.owner.kind === "unresolved" ? "" : delivery.owner.key,
					});
					delivery.feedback.notify("error", `unknown: ${argument}`);
				},
			},
		};
		double.bind(directedDefinition("directed-hint"), { commands });
		const owner = { kind: "owner", key: "main:hint" } as const;

		// `offline` is the word this migration drops: it is an unknown argument now, carried to the
		// implementation verbatim so the extension can answer it without a second parse.
		const run = double.run("directed-hint", { args: "offline", owner });

		expect(seen).toEqual([{ argument: "offline", ownerKey: owner.key }]);
		// The framework still concludes nothing of its own: no value recorded, no marker published,
		// and the only words are the implementation's.
		expect(run.persisted).toEqual([]);
		expect(run.markers).toEqual([]);
		expect(run.feedback).toEqual([{ level: "error", message: "unknown: offline" }]);
		expect(double.state.view(owner.key).read("enabled")).toBe(false);

		// A subagent never reaches the member either: the same owner scope that gates `run` gates it.
		double.run("directed-hint", { args: "offline", owner: { kind: "inherited", key: "main:runner-up" } });
		expect(seen).toHaveLength(1);
	});

	test("an unrecognized argument runs no implementation and changes no State", () => {
		const double: PortDouble = portDouble();
		const { commands: actions, calls } = applyingActions("directed-unknown");
		double.bind(directedDefinition("directed-unknown"), { commands: actions });
		const owner = { kind: "owner", key: "main:unknown" } as const;

		// `offline` is the word this migration drops: it is an unknown argument now, not a
		// second spelling of `off`. This implementation injects no `unrecognized` member, so the
		// argument reaches nothing at all — the addition is compatible with implementations that
		// predate it.
		const offline = double.run("directed-unknown", { args: "offline", owner });

		expect(calls).toEqual([]);
		expect(offline.persisted).toEqual([]);
		expect(offline.markers).toEqual([]);
		expect(offline.feedback).toEqual([]);
		expect(double.state.view(owner.key).read("enabled")).toBe(false);

		// A mistyped argument must not disturb the value an earlier invocation named.
		double.run("directed-unknown", { owner });
		const mistyped = double.run("directed-unknown", { args: "yes please", owner });

		expect(calls).toEqual([{ directive: { kind: "activate" }, ownerKey: owner.key }]);
		expect(mistyped.persisted).toEqual([]);
		expect(double.state.view(owner.key).read("enabled")).toBe(true);
	});

	test("a subagent session runs no implementation and records no value", () => {
		const double: PortDouble = portDouble();
		const { commands: actions, calls } = applyingActions("directed-subagent");
		double.bind(directedDefinition("directed-subagent"), { commands: actions });

		const run = double.run("directed-subagent", { owner: { kind: "inherited", key: "main:runner-up" } });

		expect(calls).toEqual([]);
		expect(run.persisted).toEqual([]);
		expect(run.feedback).toEqual([]);
		expect(double.state.view("main:runner-up").read("enabled")).toBe(false);
	});

	test("a directed declaration with no injected implementation is refused before any registration", () => {
		const double: PortDouble = portDouble();

		const result = double.bind(directedDefinition("directed-unpaired"));

		expect(result.bound).toBe(false);
		expect(result.bound ? [] : result.failures).toEqual([
			{
				kind: "initialization",
				detail:
					'command "directed-unpaired" declares control kind "directed", but no implementation was injected for it',
			},
		]);
		// A refused declaration registers nothing at all — not even the label — and reports
		// its refusal once on the adapter's non-model channel.
		expect(double.registrations).toEqual([]);
		expect(double.commands).toEqual([]);
		expect(double.diagnostics).toHaveLength(1);
		expect(double.diagnostics[0]).toContain("no implementation was injected");

		// The refusal is deterministic: binding the same declaration again concludes the same.
		expect(double.bind(directedDefinition("directed-unpaired"))).toEqual(result);
		expect(double.registrations).toEqual([]);
	});
});
