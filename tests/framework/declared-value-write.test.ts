/**
 * Declared-value writes at the framework's adapter contract (S2; F4, ticket 03).
 *
 * The seam is the harness-neutral one: definitions bound through `bindExtension` to the
 * port a harness provides, driven by the shared port double. Everything this
 * ticket fixes is observed there — the handler runs before any write and owns the write
 * (a handler that writes nothing changes nothing, and the value State holds is the one
 * the handler wrote rather than the one the directive named), every declared-value write
 * republishes the framework's marker area so a write of `false` clears the line, the area
 * is framework-owned (id order, coexistence, and a no-op for an extension that declares
 * no marker), and the existing toggle path keeps its order and its text.
 *
 * Two assemblies are used where two extensions must share one marker area: a port double
 * is one assembly (one State store), and the area is the process-wide one they render in.
 * The area outlives a test in one file, so every test names its own owner key: an entry
 * another test registered reads the default for a key its store never saw.
 */
import { describe, expect, test } from "bun:test";
import { CODEBASE_TOOLS } from "../../extensions/codebase-tools/definition";
import type { CommandDelivery } from "../../framework/core/protocol";
import { type CommandImplementations, type ExtensionDefinition, defineExtension } from "../../framework/public";
import { type PortDouble, portDouble } from "./support/harness-port-double";

/** A directed extension whose whole behavior is one command plus the marker it drives. */
function directedExtension(id: string, options: { readonly marker?: boolean } = {}): ExtensionDefinition {
	return defineExtension({
		id,
		displayName: id,
		commands: [{ type: "directed", name: id, state: "enabled" }],
		...(options.marker === false ? {} : { marker: { text: `◈ ${id}` } }),
	});
}

/** An implementation that writes one value through the delivery's seam, whatever the directive named. */
function writeValue(command: string, value: boolean): CommandImplementations {
	return {
		[command]: {
			run: (_directive, delivery: CommandDelivery) => delivery.state.write(value),
		},
	};
}

/** An implementation that writes the value its directive named. */
function applyDirective(command: string): CommandImplementations {
	return {
		[command]: {
			run: (directive, delivery: CommandDelivery) => delivery.state.write(directive.kind === "activate"),
		},
	};
}

/** The facts one handler observed: the value it read, and the value it then wrote. */
interface WriteCall {
	readonly read: boolean;
	readonly written: boolean;
}

/** An implementation that reads the declared value, records the pair, and writes the directive's value. */
function directiveActions(command: string): { readonly commands: CommandImplementations; readonly calls: WriteCall[] } {
	const calls: WriteCall[] = [];
	return {
		calls,
		commands: {
			[command]: {
				run: (directive, delivery: CommandDelivery) => {
					const written = directive.kind === "activate";
					calls.push({ read: delivery.state.read(), written });
					delivery.state.write(written);
				},
			},
		},
	};
}

describe("the handler runs before the write and owns it (F4, P5)", () => {
	test("a handler that writes nothing records nothing and publishes nothing", () => {
		const double: PortDouble = portDouble();
		const owner = { kind: "owner", key: "main:silent" } as const;
		const reads: boolean[] = [];
		const commands: CommandImplementations = {
			"directed-silent": {
				run: (_directive, delivery: CommandDelivery) => {
					reads.push(delivery.state.read());
				},
			},
		};
		double.bind(directedExtension("directed-silent"), { commands });

		const run = double.run("directed-silent", { owner });

		// The handler ran, and what it saw was the value before any write of this invocation.
		expect(reads).toEqual([false]);
		// Nothing the framework records on its own: no value, no record, no area update.
		expect(double.state.view(owner.key).read("enabled")).toBe(false);
		expect(run.persisted).toEqual([]);
		expect(run.markers).toEqual([]);
		expect(run.feedback).toEqual([]);
	});

	test("the value the handler writes is what State holds, not the one the directive named", () => {
		const double = portDouble();
		const owner = { kind: "owner", key: "main:partial" } as const;
		// The empty argument names `on`; the handler's action failed and kept the extension off.
		double.bind(directedExtension("directed-partial"), { commands: writeValue("directed-partial", false) });

		const run = double.run("directed-partial", { owner });

		expect(double.state.view(owner.key).read("enabled")).toBe(false);
		expect(run.persisted).toEqual([{ enabled: false }]);
		// The directive produced no value of its own, so there is one area update, not two.
		expect(run.markers).toEqual([[]]);
	});

	test("each invocation's handler sees the value the previous one left", () => {
		const double = portDouble();
		const owner = { kind: "owner", key: "main:seam-order" } as const;
		const { commands: actions, calls } = directiveActions("directed-seam-order");
		double.bind(directedExtension("directed-seam-order"), { commands: actions });

		double.run("directed-seam-order", { owner });
		double.run("directed-seam-order", { args: "off", owner });

		// The framework writes neither before nor after the handler: the second invocation reads
		// what the first one's write left, exactly as an extension's "not connected yet" filter
		// reads the pre-invocation value the decision requires.
		expect(calls).toEqual([
			{ read: false, written: true },
			{ read: true, written: false },
		]);
		expect(double.state.view(owner.key).read("enabled")).toBe(false);
	});

	test("the seam is the managed read/write pair and carries no store", () => {
		const double = portDouble();
		const owner = { kind: "owner", key: "main:seam-shape" } as const;
		const shaped: Array<{ readonly keys: readonly string[]; readonly read: unknown }> = [];
		double.bind(directedExtension("directed-shape"), {
			commands: {
				"directed-shape": {
					run: (_directive, delivery: CommandDelivery) => {
						shaped.push({ keys: Object.keys(delivery.state).sort(), read: delivery.state.read() });
					},
				},
			},
		});

		double.run("directed-shape", { owner });

		// The delivery hands out the declared-value seam, not the store: two operations, and a
		// read that answers the value itself rather than a live cell or map.
		expect(shaped).toEqual([{ keys: ["read", "write"], read: false }]);
	});

	test("two identical writes are two writes: nothing is deduplicated", () => {
		const double = portDouble();
		const owner = { kind: "owner", key: "main:twice" } as const;
		const commands: CommandImplementations = {
			"directed-twice": {
				run: (_directive, delivery: CommandDelivery) => {
					delivery.state.write(true);
					delivery.state.write(true);
				},
			},
		};
		double.bind(directedExtension("directed-twice"), { commands });

		const run = double.run("directed-twice", { owner });

		expect(run.persisted).toEqual([{ enabled: true }, { enabled: true }]);
		expect(run.markers).toEqual([["◈ directed-twice"], ["◈ directed-twice"]]);
	});
});

describe("every declared-value write republishes the area, and false clears it (F4, F12, P18)", () => {
	test("a write of true shows the extension's line and a write of false removes it", () => {
		const double = portDouble();
		const owner = { kind: "owner", key: "main:lifecycle" } as const;
		double.bind(directedExtension("directed-lifecycle"), { commands: applyDirective("directed-lifecycle") });

		const on = double.run("directed-lifecycle", { owner });
		const off = double.run("directed-lifecycle", { args: "off", owner });

		expect(on.markers).toEqual([["◈ directed-lifecycle"]]);
		// `false` removes the line, and the area clears with it rather than staying empty.
		expect(off.markers).toEqual([[]]);
		expect(double.state.view(owner.key).read("enabled")).toBe(false);
		expect(off.persisted).toEqual([{ enabled: false }]);
	});

	test("a write that follows another write in the same invocation republishes again", () => {
		const double = portDouble();
		const owner = { kind: "owner", key: "main:disarm" } as const;
		// An auto-disarm inside one callback: the extension turns on, then gives up and writes off.
		const commands: CommandImplementations = {
			"directed-disarm": {
				run: (_directive, delivery: CommandDelivery) => {
					delivery.state.write(true);
					delivery.state.write(false);
				},
			},
		};
		double.bind(directedExtension("directed-disarm"), { commands });

		const run = double.run("directed-disarm", { owner });

		expect(run.markers).toEqual([["◈ directed-disarm"], []]);
		expect(run.persisted).toEqual([{ enabled: true }, { enabled: false }]);
		expect(double.state.view(owner.key).read("enabled")).toBe(false);
	});
});

describe("the area is framework-owned: id order, coexistence, no-marker extensions (F12, P18)", () => {
	test("two extensions' writes render in one area, ordered by extension id", () => {
		// One assembly per extension, one session's owner key for both: they share the area.
		const zzz = portDouble();
		const aaa = portDouble();
		const owner = { kind: "owner", key: "main:coexist" } as const;
		zzz.bind(directedExtension("dir-zzz"), { commands: writeValue("dir-zzz", true) });
		aaa.bind(directedExtension("dir-aaa"), { commands: writeValue("dir-aaa", true) });

		const zzzRun = zzz.run("dir-zzz", { owner });
		const aaaRun = aaa.run("dir-aaa", { owner });

		// The first write renders alone; the second renders the whole area, sorted by id rather
		// than by the order the extensions ran in.
		expect(zzzRun.markers).toEqual([["◈ dir-zzz"]]);
		expect(aaaRun.markers).toEqual([["◈ dir-aaa", "◈ dir-zzz"]]);
	});

	test("turning one extension off leaves the other's line; the last off clears the area", () => {
		const zzz = portDouble();
		const aaa = portDouble();
		const owner = { kind: "owner", key: "main:coexist-off" } as const;
		zzz.bind(directedExtension("dir-zzz"), { commands: applyDirective("dir-zzz") });
		aaa.bind(directedExtension("dir-aaa"), { commands: applyDirective("dir-aaa") });

		zzz.run("dir-zzz", { owner });
		aaa.run("dir-aaa", { owner });

		const aaaOff = aaa.run("dir-aaa", { args: "off", owner });
		const zzzOff = zzz.run("dir-zzz", { args: "off", owner });

		// One extension's write never removes another's line...
		expect(aaaOff.markers).toEqual([["◈ dir-zzz"]]);
		// ...and the framework clears the area once the last line is gone.
		expect(zzzOff.markers).toEqual([[]]);
	});

	test("an extension that declares no marker writes no area line and no error", () => {
		const double = portDouble();
		const owner = { kind: "owner", key: "main:unmarked" } as const;
		double.bind(directedExtension("directed-unmarked", { marker: false }), {
			commands: writeValue("directed-unmarked", true),
		});

		const run = double.run("directed-unmarked", { owner });

		// The declared value is recorded like any other; the area simply has no line for it.
		expect(double.state.view(owner.key).read("enabled")).toBe(true);
		expect(run.persisted).toEqual([{ enabled: true }]);
		expect(run.markers).toEqual([]);
		expect(run.feedback).toEqual([]);
		expect(double.diagnostics).toEqual([]);
	});
});

describe("the toggle path keeps its order and its text (F14, C5)", () => {
	test("a toggle records through the same seam: record, then marker, then feedback", () => {
		const double = portDouble();
		const owner = { kind: "owner", key: "main:toggle" } as const;
		double.bind(CODEBASE_TOOLS);

		const on = double.run("codebase-tools", { owner });
		const off = double.run("codebase-tools", { owner });

		expect(on.effects).toEqual(["persist", "marker", "notify"]);
		expect(on.persisted).toEqual([{ enabled: true }]);
		expect(on.markers).toEqual([["◈ codeBaseTools"]]);
		expect(on.feedback).toEqual([{ level: "info", message: "codeBaseTools enabled" }]);
		expect(off.feedback).toEqual([{ level: "info", message: "codeBaseTools disabled" }]);
		expect(off.markers).toEqual([[]]);
	});
});
