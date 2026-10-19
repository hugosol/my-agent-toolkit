/**
 * The owner-scoped capability handle and its owner-life at the framework's adapter contract
 * (S2; F13; contract P12, P13).
 *
 * The seam is the harness-neutral one: a definition bound through `bindExtension` to the port
 * a harness provides, driven by the shared port double. An extension-owned background
 * effect — a heartbeat timer, an outbound flusher — runs outside any handler delivery, so the
 * capability that effect needs is obtained while a delivery is running and then retained: what
 * is observed here is that the handle a handler receives is the same declared-value write and
 * unified feedback surface the delivery carries, that it keeps working while the owner's
 * session lives, and that the boundary which retires that owner's cell ends it — a late
 * callback then writes nothing, republishes no marker, records nothing and is heard by nobody,
 * while the `session_end` delivery itself keeps its own dispatch-scoped feedback channel so
 * the extension can still announce the session switch.
 *
 * Which native event becomes which semantic event is the adapter's mapping; this suite drives
 * the semantic events and the deliveries themselves.
 */
import { describe, expect, test } from "bun:test";
import type { FeedbackTransport } from "../../framework/interface/feedback";
import type { OwnerCapabilityHandle } from "../../framework/interface/state";
import type { CommandDelivery } from "../../framework/core/protocol";
import { type CommandImplementations, type ExtensionDefinition, defineExtension } from "../../framework/public";
import { type PortDouble, portDouble } from "./support/harness-port-double";

/** A directed extension whose whole behavior is one command plus the marker it drives. */
function directedExtension(id: string, command: string = id): ExtensionDefinition {
	return defineExtension({
		id,
		displayName: id,
		commands: [{ type: "directed", name: command, state: "enabled" }],
		marker: { text: `◈ ${id}` },
	});
}

/**
 * An extension with no command at all: its effects are armed where its session starts rather
 * than where a command runs, which is the arm path the capability has to serve as well.
 */
function sessionArmedExtension(id: string): ExtensionDefinition {
	return defineExtension({ id, displayName: id, marker: { text: `◈ ${id}` } });
}

/** An implementation that retains the delivery's capability and writes the value it named. */
function armingActions(
	command: string,
	retained: OwnerCapabilityHandle[],
	value: boolean,
): CommandImplementations {
	return {
		[command]: {
			run: (_directive, delivery: CommandDelivery) => {
				retained.push(delivery.capability);
				delivery.state.write(value);
			},
		},
	};
}

describe("a handler delivery hands out a capability its owner may retain (F13, P12)", () => {
	test("a capability retained by a command handler writes, records, renders and notifies while the owner lives", () => {
		const double: PortDouble = portDouble();
		const owner = { kind: "owner", key: "main:retained-arm" } as const;
		const retained: OwnerCapabilityHandle[] = [];
		double.bind(directedExtension("retained-arm"), { commands: armingActions("retained-arm", retained, true) });

		// The arm path: the handler runs, writes through the delivery's own seam, and keeps the
		// capability for the effects it will drive after this delivery is over.
		const arm = double.run("retained-arm", { owner });

		expect(arm.persisted).toEqual([{ enabled: true }]);
		expect(retained).toHaveLength(1);

		// The background callback, long after the delivery ended: the same write and the same
		// feedback channel, on the owner the handle is scoped to.
		retained[0]!.state.write(false);
		retained[0]!.feedback.notify("error", "panel 未响应");

		expect(double.state.view(owner.key).read("enabled")).toBe(false);
		expect(arm.persisted).toEqual([{ enabled: true }, { enabled: false }]);
		expect(arm.feedback).toEqual([{ level: "error", message: "panel 未响应" }]);
		// A write of `false` clears this extension's line, exactly as a write through the
		// delivery's own seam does.
		expect(double.markerUpdates[double.markerUpdates.length - 1]).toEqual([]);
	});

	test("the retained capability reads the owner's current value, as the delivery's seam does", () => {
		const double = portDouble();
		const owner = { kind: "owner", key: "main:retained-read" } as const;
		const retained: OwnerCapabilityHandle[] = [];
		double.bind(directedExtension("retained-read"), { commands: armingActions("retained-read", retained, true) });

		double.run("retained-read", { owner });

		expect(retained[0]!.state.read()).toBe(true);
		retained[0]!.state.write(false);
		expect(retained[0]!.state.read()).toBe(false);
		expect(double.state.view(owner.key).read("enabled")).toBe(false);
	});

	test("the capability a start delivery hands out works on the owner that start entered", () => {
		const double = portDouble();
		const owner = { kind: "owner", key: "main:retained-start" } as const;
		const retained: OwnerCapabilityHandle[] = [];
		double.bind(sessionArmedExtension("retained-start"), {
			subscriptions: [{ scope: "owner", events: {
				session_start: delivery => {
					retained.push(delivery.capability);
				},
			} }],
		});

		const start = double.deliverSession(owner, { event: { kind: "session_start", reason: "initial" } });

		// The session handler arms its effects here — an arm path that is not a command — and the
		// capability it retains writes the same owner, records in the same medium and renders in
		// the same area as a command delivery's capability does.
		retained[0]!.state.write(true);
		retained[0]!.feedback.notify("info", "已接入 2 个会话");

		expect(double.state.view(owner.key).read("enabled")).toBe(true);
		expect(start.persisted).toEqual([{ enabled: true }]);
		expect(start.feedback).toEqual([{ level: "info", message: "已接入 2 个会话" }]);
		expect(double.markerUpdates[double.markerUpdates.length - 1]).toEqual(["◈ retained-start"]);
	});
});

describe("the boundary that ends an owner ends the capability it handed out (F13, P13)", () => {
	test("a write through a capability retained for a retired owner is a no-op that rebuilds nothing", () => {
		const double = portDouble();
		const owner = { kind: "owner", key: "main:retired-write" } as const;
		const retained: OwnerCapabilityHandle[] = [];
		double.bind(directedExtension("retired-write"), {
			commands: armingActions("retired-write", retained, true),
		});

		const arm = double.run("retired-write", { owner });
		expect(double.state.view(owner.key).read("enabled")).toBe(true);

		// The session the effects were armed in goes away: the framework retires that owner's cell
		// — and clears this extension's line — before the handler for the boundary runs.
		double.deliverSession(owner, { event: { kind: "session_end", reason: "disposed" } });
		expect(double.markerUpdates[double.markerUpdates.length - 1]).toEqual([]);

		// The late callback: a timer that fires after its session is gone still holds the
		// capability, and writes the value an auto-disarm would write.
		retained[0]!.state.write(true);

		// The retired cell is not rebuilt, nothing is recorded for a session that ended, and the
		// line the boundary cleared is not republished.
		expect(double.state.view(owner.key).read("enabled")).toBe(false);
		expect(arm.persisted).toEqual([{ enabled: true }]);
		expect(double.markerUpdates[double.markerUpdates.length - 1]).toEqual([]);
		expect(retained[0]!.state.read()).toBe(false);
	});

	test("feedback through a capability retained for a retired owner reaches nobody", () => {
		const double = portDouble();
		const owner = { kind: "owner", key: "main:retired-notify" } as const;
		const retained: OwnerCapabilityHandle[] = [];
		const commands: CommandImplementations = {
			"retired-notify": {
				run: (_directive, delivery: CommandDelivery) => {
					retained.push(delivery.capability);
					delivery.capability.feedback.notify("info", "已接入 2 个会话");
				},
			},
		};
		double.bind(directedExtension("retired-notify"), { commands });

		const arm = double.run("retired-notify", { owner });
		expect(arm.feedback).toEqual([{ level: "info", message: "已接入 2 个会话" }]);

		// The session switches away, and the heartbeat that had been reporting for it fails once
		// more — a notice about the session that just ended is exactly what the operator must not
		// see next to the switch notice.
		double.deliverSession(owner, { event: { kind: "session_end", reason: "transferred" } });
		retained[0]!.feedback.notify("error", "面板未响应");

		expect(arm.feedback).toEqual([{ level: "info", message: "已接入 2 个会话" }]);
	});

	test("a start opens the owner's life again, and the capability the ended life held stays inert", () => {
		const double = portDouble();
		const owner = { kind: "owner", key: "main:reopened" } as const;
		const retained: OwnerCapabilityHandle[] = [];
		double.bind(sessionArmedExtension("reopened"), {
			subscriptions: [{ scope: "owner", events: {
				session_start: delivery => {
					retained.push(delivery.capability);
				},
			} }],
		});

		double.deliverSession(owner); // the first life of this owner
		double.deliverSession(owner, { event: { kind: "session_end", reason: "transferred" } });
		double.deliverSession(owner, { event: { kind: "session_start", reason: "resume" } });

		// The capability of the life that ended writes nothing; the one the new start handed out
		// owns the value again.
		retained[1]!.state.write(true);
		retained[0]!.state.write(false);

		expect(double.state.view(owner.key).read("enabled")).toBe(true);
		// The old life lost write authority, not observation of the owner's current value.
		expect(retained[0]!.state.read()).toBe(true);
	});
});

describe("the capability is the write and the feedback channel, and nothing else (F13, P12)", () => {
	test("it carries no `hasUI`: a background effect publishes through the channel it was handed", () => {
		const double = portDouble();
		const owner = { kind: "owner", key: "main:capability-shape" } as const;
		const retained: OwnerCapabilityHandle[] = [];
		double.bind(directedExtension("capability-shape"), {
			commands: armingActions("capability-shape", retained, true),
		});

		double.run("capability-shape", { owner });

		expect(Object.keys(retained[0]!).sort()).toEqual(["feedback", "state"]);
		expect("hasUI" in retained[0]!).toBe(false);
	});
});

describe("a session_end delivery keeps a feedback channel of its own, for that dispatch (F13, P13)", () => {
	test("the handler announces the switch on it, and the channel is closed when the dispatch ends", () => {
		const double = portDouble();
		const owner = { kind: "owner", key: "main:end-notice" } as const;
		const held: FeedbackTransport[] = [];
		double.bind(sessionArmedExtension("end-notice"), {
			subscriptions: [{ scope: "owner", events: {
				session_end: delivery => {
					delivery.feedback.notify("info", "已切到新会话");
					held.push(delivery.feedback);
				},
			} }],
		});

		// The framework retired the owner before the handler ran, so this dispatch's channel — not
		// the capability — is what the extension still tells the operator through.
		const end = double.deliverSession(owner, { event: { kind: "session_end", reason: "transferred" } });
		expect(end.feedback).toEqual([{ level: "info", message: "已切到新会话" }]);

		held[0]!.notify("error", "面板未响应");

		expect(end.feedback).toEqual([{ level: "info", message: "已切到新会话" }]);
	});

	test("the capability that same delivery hands out is inert, and is not that channel", () => {
		const double = portDouble();
		const owner = { kind: "owner", key: "main:end-capability" } as const;
		const retained: OwnerCapabilityHandle[] = [];
		double.bind(sessionArmedExtension("end-capability"), {
			subscriptions: [{ scope: "owner", events: {
				session_end: delivery => {
					retained.push(delivery.capability);
					delivery.feedback.notify("info", "已切到新会话");
				},
			} }],
		});

		const end = double.deliverSession(owner, { event: { kind: "session_end", reason: "transferred" } });
		const renderingsAtEnd = double.markerUpdates.length;

		retained[0]!.state.write(true);
		retained[0]!.feedback.notify("error", "面板未响应");

		// The dispatch's own channel was heard; the capability retained from it acts for nobody.
		expect(end.feedback).toEqual([{ level: "info", message: "已切到新会话" }]);
		expect(end.persisted).toEqual([]);
		expect(double.state.view(owner.key).read("enabled")).toBe(false);
		expect(double.markerUpdates.length).toBe(renderingsAtEnd);
	});
});
