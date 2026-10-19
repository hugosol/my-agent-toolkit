/**
 * The semantic session axis at the framework's adapter contract (S2; F5, F7, F9; contract
 * P7, P10, P14).
 *
 * The seam is `bindExtension` plus the port a harness provides, driven by the shared
 * port double: one semantic session event, the framework's own behavior for it, and the
 * handler an assembly injected for it. What the framework owes there is observed directly —
 * a start seeds the owner from the branch the event names and renders that owner's area, an
 * end retires the owner it names and clears the line that owner held, the framework's
 * behavior always runs before the injected handler, and a handler that throws disturbs
 * neither the framework nor another subscriber.
 *
 * Which native event becomes which semantic event is the adapter's mapping, observed at the
 * OMP seam in `session.test.ts`. This suite drives the semantic events themselves, including
 * the pair a transition is expressed as and the owner fact an end carries.
 */
import { describe, expect, test } from "bun:test";
import { CODEBASE_TOOLS } from "../../extensions/codebase-tools/definition";
import type { SessionEvent } from "../../framework/interface/session";
import type { OwnerReference } from "../../framework/interface/state";
import { type CommandImplementations, type ExtensionDefinition, defineExtension } from "../../framework/public";
import { portDouble } from "./support/harness-port-double";

/** The owner a delivery acts on unless one is named. */
const OWNER: OwnerReference = { kind: "owner", key: "main:session-events" };

/** The two owners a transition moves between: the one being left and the one being entered. */
const ENDING: OwnerReference = { kind: "owner", key: "main:session-events-ending" };
const ENTERING: OwnerReference = { kind: "owner", key: "main:session-events-entering" };

/** A session start with the reason the delivery is given; `initial` stands for the default. */
function start(reason?: "initial" | "new" | "resume" | "fork"): SessionEvent {
	return { kind: "session_start", reason: reason ?? "initial" };
}

/** A session end with the reason the delivery is given. */
function end(reason: "transferred" | "disposed"): SessionEvent {
	return { kind: "session_end", reason };
}

/**
 * A definition whose start handler throws: the framework's own behavior for that event, and
 * every other subscriber, must survive it.
 */
const THROWING: ExtensionDefinition = defineExtension({
	id: "throwing-tools",
	displayName: "throwingTools",
	marker: { text: "◈ throwing" },
});

describe("a start seeds the owner its event names (F5, P7)", () => {
	test("the value comes from the branch the delivery names, and renders in that owner's area", () => {
		const double = portDouble();
		const seen: SessionEvent[] = [];
		double.bind(CODEBASE_TOOLS, { subscriptions: [{ scope: "owner", events: { session_start: delivery => void seen.push(delivery.event) } }] });

		const boundary = double.deliverSession(OWNER, { statePayloads: [{ enabled: true }] });

		// The area was re-rendered for the owner the event names, and it carries this
		// extension's line because that owner's value is now true.
		expect(boundary.markers).toEqual([["◈ codeBaseTools"]]);
		// The seeded value is what the branch declared, so the toggle's record reports the value
		// the session started from rather than the default.
		expect(double.run("codebase-tools", { owner: OWNER }).persisted).toEqual([{ enabled: false }]);
		// The assembly's own subscription was handed the event this delivery resolved.
		expect(seen).toEqual([start()]);
	});

	test("a definition with no session subscription is reconciled all the same", () => {
		const double = portDouble();
		// No handler is injected: the framework's behavior for a session event is not a
		// consequence of one being subscribed.
		double.bind(CODEBASE_TOOLS);

		const boundary = double.deliverSession(OWNER, { statePayloads: [{ enabled: true }] });

		expect(boundary.markers).toEqual([["◈ codeBaseTools"]]);
		expect(double.run("codebase-tools", { owner: OWNER }).persisted).toEqual([{ enabled: false }]);
	});

	test("a branch that declares no usable value leaves the owner off", () => {
		const double = portDouble();
		double.bind(CODEBASE_TOOLS);

		const boundary = double.deliverSession(OWNER);

		// Off renders no line at all — the area follows State, so an owner with nothing to say
		// renders an empty area rather than keeping an earlier session's marker.
		expect(boundary.markers).toEqual([[]]);
		expect(double.run("codebase-tools", { owner: OWNER }).persisted).toEqual([{ enabled: true }]);
	});
});

describe("a transition is an end followed by a start (F5, P7)", () => {
	test("a transferred end retires the owner it names, and the start that follows seeds its own", () => {
		const double = portDouble();
		double.bind(CODEBASE_TOOLS);
		double.deliverSession(ENDING, { statePayloads: [{ enabled: true }] });

		const transferred = double.deliverSession(ENDING, { event: end("transferred") });
		const entered = double.deliverSession(ENTERING, { event: start("new") });

		// The session being left owns no widget any more, so its end revises State and leaves
		// the area to the session taking over, which renders its own at its start.
		expect(transferred.markers).toEqual([]);
		expect(entered.markers).toEqual([[]]);
		// The ending owner's cell went with it: the same session identity reads the declared
		// default again, so its next toggle enables rather than turning the seeded value off.
		expect(double.run("codebase-tools", { owner: ENDING }).persisted).toEqual([{ enabled: true }]);
		// The entering owner was seeded from the branch its own start named — nothing carried
		// the ending session's value across.
		expect(double.run("codebase-tools", { owner: ENTERING }).persisted).toEqual([{ enabled: true }]);
	});

	test("a disposed end retires the owner it names and clears the line that owner held (F9)", () => {
		const double = portDouble();
		double.bind(CODEBASE_TOOLS);
		const started = double.deliverSession(OWNER, { statePayloads: [{ enabled: true }] });
		expect(started.markers).toEqual([["◈ codeBaseTools"]]);

		const disposed = double.deliverSession(OWNER, { event: end("disposed") });

		// The cell is retired and the area is published once more, so the extension's line goes
		// with the session that held it instead of being left standing.
		expect(disposed.markers).toEqual([[]]);
		expect(double.run("codebase-tools", { owner: OWNER }).persisted).toEqual([{ enabled: true }]);
	});

	test("every delivery names the owner it concerns, never the one replacing it (P14)", () => {
		const double = portDouble();
		const seen: Array<{ readonly event: SessionEvent; readonly ownerKey: string; readonly hasUI: boolean }> = [];
		double.bind(CODEBASE_TOOLS, {
			subscriptions: [{ scope: "owner", events: {
				session_start: delivery =>
					void seen.push({
						event: delivery.event,
						ownerKey: delivery.owner.kind === "unresolved" ? "<unresolved>" : delivery.owner.key,
						hasUI: delivery.hasUI,
					}),
				session_end: delivery =>
					void seen.push({
						event: delivery.event,
						ownerKey: delivery.owner.kind === "unresolved" ? "<unresolved>" : delivery.owner.key,
						hasUI: delivery.hasUI,
					}),
			} }],
		});

		double.deliverSession(ENDING, { statePayloads: [{ enabled: true }] });
		double.deliverSession(ENDING, { event: end("transferred") });
		double.deliverSession(ENTERING, { event: start("new"), hasUI: false });

		// The end names the owner being left — the session whose life is ending — and the start
		// that follows names the owner being entered. No delivery carries a second owner key.
		expect(seen).toEqual([
			{ event: start("initial"), ownerKey: ENDING.key, hasUI: true },
			{ event: end("transferred"), ownerKey: ENDING.key, hasUI: true },
			{ event: start("new"), ownerKey: ENTERING.key, hasUI: false },
		]);
	});
});

describe("the framework's behavior runs before the injected handler, and one handler's failure is its own (F7, P10)", () => {
	test("a handler observes State and the area as the event left them", () => {
		const double = portDouble();
		const rendersWhenHandlerRan: number[] = [];
		double.bind(CODEBASE_TOOLS, {
			subscriptions: [{ scope: "owner", events: {
				session_start: () => void rendersWhenHandlerRan.push(double.markerUpdates.length),
				session_end: () => void rendersWhenHandlerRan.push(double.markerUpdates.length),
			} }],
		});

		double.deliverSession(OWNER, { statePayloads: [{ enabled: true }] });
		double.deliverSession(OWNER, { event: end("disposed") });

		// By the time each handler ran, the framework had already retired or seeded the cell and
		// published the area for it: the first handler saw one rendering, the second two.
		expect(rendersWhenHandlerRan).toEqual([1, 2]);
	});

	test("the handler delivery carries the owner scope, the hasUI fact and the feedback channel", () => {
		const double = portDouble();
		const seen: Array<{ readonly owner: OwnerReference; readonly hasUI: boolean }> = [];
		double.bind(CODEBASE_TOOLS, {
			subscriptions: [{ scope: "owner", events: {
				session_end: delivery => {
					delivery.feedback.notify("info", "session transferred");
					seen.push({ owner: delivery.owner, hasUI: delivery.hasUI });
				},
			} }],
		});

		const boundary = double.deliverSession(OWNER, { event: end("transferred"), hasUI: false });

		expect(seen).toEqual([{ owner: OWNER, hasUI: false }]);
		// The end's handler still has a feedback mouth: it is the delivery's own channel, not a
		// handle the retiring owner keeps.
		expect(boundary.feedback).toEqual([{ level: "info", message: "session transferred" }]);
	});

	test("a throwing handler is reported, and disturbs neither the framework nor another subscriber", () => {
		const double = portDouble();
		const received: SessionEvent[] = [];
		double.bind(THROWING, {
			subscriptions: [{ scope: "owner", events: {
				session_start: () => {
					throw new Error("boom");
				},
			} }],
		});
		double.bind(CODEBASE_TOOLS, { subscriptions: [{ scope: "owner", events: { session_start: delivery => void received.push(delivery.event) } }] });

		const boundary = double.deliverSession(OWNER, { statePayloads: [{ enabled: true }] });

		// The failure reaches the adapter's non-model channel, naming the extension and the event.
		expect(double.diagnostics).toEqual(["throwing-tools: session_start handler failed: boom"]);
		// The framework's own behavior ran for that event on both bindings — each one seeded the
		// owner and published the area before its own handler was reached — and the failing
		// binding's own line is in the rendering it published.
		expect(boundary.markers).toHaveLength(2);
		expect(boundary.markers[0]).toContain("◈ throwing");
		// The subscriber bound after the failing one still received its own delivery.
		expect(received).toEqual([start("initial")]);
	});
});

describe("a session that is not its own owner reconciles nothing (F5)", () => {
	test("an inherited and an unresolved owner seed no cell and render no area", () => {
		const double = portDouble();
		double.bind(CODEBASE_TOOLS);

		const inherited = double.deliverSession(
			{ kind: "inherited", key: OWNER.key },
			{ statePayloads: [{ enabled: true }] },
		);
		const unresolved = double.deliverSession({ kind: "unresolved" }, { statePayloads: [{ enabled: true }] });

		// Neither owns a cell of its own, so neither has an area to project: a subagent reads
		// its owner's value through the inheritance axis, never by becoming it.
		expect(inherited.markers).toEqual([]);
		expect(unresolved.markers).toEqual([]);
	});
});

describe("a session whose facts were re-reported crossed no boundary (P24)", () => {
	test("the facts reach a subscriber and nothing the framework owns moves for them", () => {
		const double = portDouble();
		// The marker area is one process-wide area per owner, so this case names an owner of its
		// own: the renderings it reads are then this extension's alone.
		const owner: OwnerReference = { kind: "owner", key: "main:session-facts" };
		const seen: Array<{ readonly event: SessionEvent; readonly name: string | undefined }> = [];
		double.bind(CODEBASE_TOOLS, {
			subscriptions: [
				{
					scope: "owner",
					events: {
						session_facts: delivery => void seen.push({ event: delivery.event, name: delivery.session.name }),
					},
				},
			],
		});
		const started = double.deliverSession(owner, { statePayloads: [{ enabled: true }] });
		expect(started.markers).toEqual([["◈ codeBaseTools"]]);

		const facts = double.deliverSession(owner, {
			event: { kind: "session_facts" },
			session: { sessionId: "session-renamed", kind: "sub", parentSessionId: "session-a", name: "renamed", unavailable: [] },
		});

		// The facts delivery is subscription only: the area was not re-published for it, and the
		// cell the start seeded is untouched — the toggle turns the seeded true off rather than
		// the declared default on, which is what a re-seed from this delivery's empty branch
		// would have left behind.
		expect(facts.markers).toEqual([]);
		expect(double.run("codebase-tools", { owner }).persisted).toEqual([{ enabled: false }]);
		// The subscriber the kind names was reached, and it read the session's own facts.
		expect(seen).toEqual([{ event: { kind: "session_facts" }, name: "renamed" }]);
	});
});
