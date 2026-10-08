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
import type { CommandActions, CommandDelivery } from "../../framework/core/protocol";
import { type ExtensionDefinition, defineExtension } from "../../framework/public";
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
function writeValue(command: string, value: boolean): CommandActions {
	return {
		[command]: {
			run: (_directive, delivery: CommandDelivery) => delivery.state.write(value),
		},
	};
}

/** An implementation that writes the value its directive named. */
function applyDirective(command: string): CommandActions {
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
function directiveActions(command: string): { readonly actions: CommandActions; readonly calls: WriteCall[] } {
	const calls: WriteCall[] = [];
	return {
		calls,
		actions: {
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
		const actions: CommandActions = {
			"directed-silent": {
				run: (_directive, delivery: CommandDelivery) => {
					reads.push(delivery.state.read());
				},
			},
		};
		double.bind(directedExtension("directed-silent"), { actions });

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
		double.bind(directedExtension("directed-partial"), { actions: writeValue("directed-partial", false) });

		const run = double.run("directed-partial", { owner });

		expect(double.state.view(owner.key).read("enabled")).toBe(false);
		expect(run.persisted).toEqual([{ enabled: false }]);
		// The directive produced no value of its own, so there is one area update, not two.
		expect(run.markers).toEqual([[]]);
	});

	test("each invocation's handler sees the value the previous one left", () => {
		const double = portDouble();
		const owner = { kind: "owner", key: "main:seam-order" } as const;
		const { actions, calls } = directiveActions("directed-seam-order");
		double.bind(directedExtension("directed-seam-order"), { actions });

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

	test("two identical writes are two writes: nothing is deduplicated", () => {
		const double = portDouble();
		const owner = { kind: "owner", key: "main:twice" } as const;
		const actions: CommandActions = {
			"directed-twice": {
				run: (_directive, delivery: CommandDelivery) => {
					delivery.state.write(true);
					delivery.state.write(true);
				},
			},
		};
		double.bind(directedExtension("directed-twice"), { actions });

		const run = double.run("directed-twice", { owner });

		expect(run.persisted).toEqual([{ enabled: true }, { enabled: true }]);
		expect(run.markers).toEqual([["◈ directed-twice"], ["◈ directed-twice"]]);
	});
});

describe("every declared-value write republishes the area, and false clears it (F4, F12, P18)", () => {
	test("a write of true shows the extension's line and a write of false removes it", () => {
		const double = portDouble();
		const owner = { kind: "owner", key: "main:lifecycle" } as const;
		double.bind(directedExtension("directed-lifecycle"), { actions: applyDirective("directed-lifecycle") });

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
		const actions: CommandActions = {
			"directed-disarm": {
				run: (_directive, delivery: CommandDelivery) => {
					delivery.state.write(true);
					delivery.state.write(false);
				},
			},
		};
		double.bind(directedExtension("directed-disarm"), { actions });

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
		zzz.bind(directedExtension("dir-zzz"), { actions: writeValue("dir-zzz", true) });
		aaa.bind(directedExtension("dir-aaa"), { actions: writeValue("dir-aaa", true) });

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
		zzz.bind(directedExtension("dir-zzz"), { actions: applyDirective("dir-zzz") });
		aaa.bind(directedExtension("dir-aaa"), { actions: applyDirective("dir-aaa") });

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
			actions: writeValue("directed-unmarked", true),
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
