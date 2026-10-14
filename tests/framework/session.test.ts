/**
 * The framework's semantic session events at the public adapter seam (S2; F5, F7, F9;
 * contract P7, P10, P14).
 *
 * A session boundary reconciles the owner's State with the value its target branch
 * persisted; a navigation that keeps the session's identity — a `/tree` jump, a same-file
 * `/resume`, a TUI branch, a reload — is not a boundary at all. The harness side of
 * the seam is the narrow native surface the OMP loader hands the factory, so a test double
 * stands in for the loader: it records registrations and appended entries, delivers the
 * native session lifecycle events, and the extension's own session subscription records what
 * the framework dispatched. Which native event becomes which semantic event, which
 * navigations become none, and what a transition does to State and to the marker area are
 * all observed there.
 */
import { describe, expect, test } from "bun:test";
import { CODEBASE_TOOLS } from "../../extensions/codebase-tools/definition";
import type {
	OmpCommandContext,
	OmpExtensionApi,
	OmpRoundEventType,
	OmpSessionContext,
	OmpSessionEvent,
	OmpSessionEventType,
} from "../../framework/adapters/omp";
import * as frameworkOmp from "../../framework/adapters/omp";
import type { OwnerReference, SessionEvent, SessionStartReason } from "../../framework/core/protocol";
import {
	type CommandImplementations,
	type ExtensionDefinition,
	type SessionEventDelivery,
	type SessionEventHandlers,
	defineExtension,
} from "../../framework/public";

/** The State entry the framework persists for the codebase-tools definition. */
const STATE_ENTRY_TYPE = "codebase-tools:state";

/**
 * A definition whose declared field is kept in memory only: no session boundary seeds it
 * and no write records it, so its value belongs to the owner identity that holds it.
 */
const MEMORY_TOOLS: ExtensionDefinition = defineExtension({
	id: "memory-tools",
	displayName: "memoryTools",
	state: { persistence: "memory" },
	commands: [{ type: "toggle", name: "memory-tools", state: "enabled" }],
});

/** One session as the harness holds it: an identity and the branch under it. */
interface SessionFacts {
	readonly sessionId: string;
	/** The State payloads persisted on this session's branch, oldest first. */
	readonly statePayloads: unknown[];
	readonly kind?: "main" | "sub";
	/** The display name the harness holds for this session, when it holds one. */
	readonly name?: string;
}

interface Registration {
	readonly handler: (args: string, ctx: OmpCommandContext) => void | Promise<void>;
}

/** One semantic session event as this binding's session subscription observed it. */
interface Observed {
	readonly event: SessionEvent;
	readonly owner: OwnerReference;
	readonly hasUI: boolean;
}

/** One session-facts delivery as this binding's session subscription observed it. */
interface ObservedFacts {
	readonly event: SessionEvent;
	readonly session: SessionEventDelivery["session"];
	readonly owner: OwnerReference;
}

/** The native surface a loader hands the factory, recording registrations and effects. */
interface NativeSurface {
	readonly api: OmpExtensionApi;
	/** Appended entries in call order. */
	readonly appended: ReadonlyArray<{ readonly customType: string; readonly data: unknown }>;
	/** Feedback messages in call order. */
	readonly notifications: string[];
	/** The semantic session events the framework dispatched, in call order. */
	readonly observed: Observed[];
	/** The session-facts deliveries the framework dispatched, in call order. */
	readonly factsObserved: ObservedFacts[];
	/** Marker-area content in call order: the lines, or `undefined` for a cleared widget. */
	readonly widgets: ReadonlyArray<readonly string[] | undefined>;
	/** Loads a session, as the runner does at startup: `session_start`. */
	startSession(facts: SessionFacts): void;
	/** Switches to another session identity: `session_switch`. */
	switchSession(facts: SessionFacts, reason: "new" | "resume" | "fork"): void;
	/** Branches into a new session identity: `session_branch`. */
	branchSession(facts: SessionFacts, reason: "branch" | "fork" | "btw"): void;
	/** Navigates inside the current session's tree (same identity, new leaf): `session_tree`. */
	navigateTree(facts: SessionFacts): void;
	/** The process going away: `session_shutdown`. */
	shutdown(facts: SessionFacts): void;
	/**
	 * Renames a session the way the harness does: the manager's own name becomes this one and
	 * every listener it holds is notified, with no session event involved.
	 */
	renameSession(facts: SessionFacts, name: string): void;
	/** A command context as the runner builds it for one session. */
	commandContext(facts: SessionFacts): OmpCommandContext;
	runCommand(ctx: OmpCommandContext): void;
}

/** One session lifecycle handler as the loader registers it. */
type SessionHandler = (event: OmpSessionEvent, ctx: OmpSessionContext) => void;
/** The run-initiation handler shape the loader also registers through `on`. */
type RunInitiationHandler = (
	event: unknown,
	ctx: OmpSessionContext,
) => { message: { customType: string } } | undefined | void;

/**
 * Records every registration and every effect, and delivers session events like the
 * runner. One definition is bound to it, exactly as the loader binds one extension per
 * session, so the branch entries it synthesizes carry that definition's State entry type
 * and the command it drives is that definition's own. The extension's session subscription
 * is the one an assembly would inject, so what the framework dispatched is observed through
 * the same surface an extension author gets.
 */
function boundSurface(
	definition: ExtensionDefinition,
	surface: { readonly nameChange?: "reported" | "absent" } = {},
): NativeSurface {
	const stateEntryType = `${definition.id}:state`;
	const commandName = (definition.commands ?? [])[0]?.name;
	const registrations = new Map<string, Registration>();
	const appended: Array<{ customType: string; data: unknown }> = [];
	const notifications: string[] = [];
	const observed: Observed[] = [];
	const factsObserved: ObservedFacts[] = [];
	const widgets: Array<readonly string[] | undefined> = [];
	/** The name each session manager holds, as the harness's own state holds it. */
	const names = new Map<string, string>();
	/** The listeners each session manager holds, as `onSessionNameChanged` keeps them. */
	const nameListeners = new Map<string, (() => void)[]>();
	// A closed vocabulary: one handler list per session event the loader can deliver.
	const handlers: Record<string, SessionHandler[]> = {
		session_start: [],
		session_switch: [],
		session_branch: [],
		session_tree: [],
		session_shutdown: [],
	};

	// The registry label is deliberately identical for every main session: the owner key
	// must come from the session identity, not from this label.
	const contextOf = (facts: SessionFacts): OmpSessionContext => ({
		agent: {
			kind: facts.kind ?? "main",
			id: facts.kind === "sub" ? "0-Explore" : "Main",
			name: facts.kind === "sub" ? "explore" : "main",
		},
		sessionManager: {
			getSessionId: () => facts.sessionId,
			// The branch as the session manager holds it: the State entries this session persisted.
			getBranch: () => facts.statePayloads.map(data => ({ type: "custom", customType: stateEntryType, data })),
			// The latest name, read live: the manager's own current value wins over the one the
			// delivery's facts were built with, exactly as a rename would leave it.
			getSessionName: () => names.get(facts.sessionId) ?? facts.name,
			...(surface.nameChange === "absent"
				? {}
				: {
						onSessionNameChanged: (listener: () => void) => {
							const listeners = nameListeners.get(facts.sessionId) ?? [];
							listeners.push(listener);
							nameListeners.set(facts.sessionId, listeners);
							return () => {
								const held = nameListeners.get(facts.sessionId);
								if (held === undefined) return;
								const at = held.indexOf(listener);
								if (at >= 0) held.splice(at, 1);
							};
						},
					}),
		},
		hasUI: true,
		ui: {
			notify: message => {
				notifications.push(message);
			},
			setWidget: (_key, content) => {
				widgets.push(content);
			},
		},
	});

	const deliver = (event: OmpSessionEvent, facts: SessionFacts): void => {
		for (const handler of handlers[event.type]) handler(event, contextOf(facts));
	};

	const api: OmpExtensionApi = {
		// The suite drives State through commands and session events, not through labels.
		setLabel(): void {},
		registerCommand(name, registration): void {
			registrations.set(name, registration);
		},
		appendEntry(customType: string, data?: unknown): void {
			appended.push({ customType, data });
		},
		// This suite delivers session lifecycle events; the run-initiation hook is
		// subscribed by binding but exercised by the injection suite.
		on(event: string, handler: never): void {
			// This suite drives the session axis; the run initiation has its own suite and the
			// round axis has another.
			if (event === "before_agent_start" || event === "agent_start" || event === "agent_end") return;
			handlers[event].push(handler as SessionHandler);
		},
	};

	// The assembly's own subscription: what the framework hands a shared-logic session
	// handler, recorded as the fact under test.
	const events: SessionEventHandlers = {
		session_start: (delivery: SessionEventDelivery) => void observed.push(observationOf(delivery)),
		session_end: (delivery: SessionEventDelivery) => void observed.push(observationOf(delivery)),
		session_facts: (delivery: SessionEventDelivery) =>
			void factsObserved.push({ event: delivery.event, session: delivery.session, owner: delivery.owner }),
	};

	// The loader binds the extension for the session it is loading: one factory call.
	const factory = frameworkOmp.ompAdapter(definition, {
		factory: () => ({ subscriptions: [{ scope: "owner", events }] }),
	});
	if (!factory(api).bound) throw new Error(`the "${definition.id}" definition did not bind`);

	return {
		api,
		appended,
		notifications,
		observed,
		factsObserved,
		widgets,
		startSession: facts => deliver({ type: "session_start" }, facts),
		switchSession: (facts, reason) => deliver({ type: "session_switch", reason }, facts),
		branchSession: (facts, reason) => deliver({ type: "session_branch", reason }, facts),
		navigateTree: facts => deliver({ type: "session_tree" }, facts),
		shutdown: facts => deliver({ type: "session_shutdown" }, facts),
		renameSession: (facts, name) => {
			names.set(facts.sessionId, name);
			for (const listener of [...(nameListeners.get(facts.sessionId) ?? [])]) listener();
		},
		commandContext: facts => contextOf(facts),
		runCommand(ctx: OmpCommandContext): void {
			const registration = commandName === undefined ? undefined : registrations.get(commandName);
			if (registration === undefined) throw new Error(`command "${commandName}" was not registered`);
			registration.handler("", ctx);
		},
	};
}

/** One handler delivery, flattened into the facts this suite asserts on. */
function observationOf(delivery: SessionEventDelivery): Observed {
	return { event: delivery.event, owner: delivery.owner, hasUI: delivery.hasUI };
}

describe("session boundary seeding (F5, P7)", () => {
	test("a resumed session reads its State back from the target branch", () => {
		const surface = boundSurface(CODEBASE_TOOLS);
		// The branch carries two State records; the last one is the session's current value.
		const session: SessionFacts = {
			sessionId: "session-1",
			statePayloads: [{ enabled: false }, { enabled: true }],
		};
		surface.startSession(session);

		surface.runCommand(surface.commandContext(session));

		// The seeded value was `true`, so the first toggle records `false`.
		expect(surface.appended).toEqual([{ customType: STATE_ENTRY_TYPE, data: { enabled: false } }]);
	});

	test("missing, unknown, or malformed State data falls back to off (P7, N5)", () => {
		const surface = boundSurface(CODEBASE_TOOLS);
		// Each case is a session whose branch holds exactly these State records: the last one
		// declares no usable `enabled` (or there is none at all), so the session starts off.
		const branches: ReadonlyArray<readonly unknown[]> = [
			[],
			[{ on: true }],
			[{ on: true, initInjected: true }],
			[{ enabled: "true" }],
			[{ enabled: 1 }],
			[null],
			[true],
			[{ enabled: true }, { on: false }],
			[{ enabled: true }, { enabled: "yes" }],
			[{ enabled: true }, {}],
		];

		for (const [index, statePayloads] of branches.entries()) {
			const session: SessionFacts = { sessionId: `session-${index}`, statePayloads: [...statePayloads] };
			surface.startSession(session);
			surface.runCommand(surface.commandContext(session));
		}

		// Every session started off, so every toggle enabled it.
		expect(surface.appended).toEqual(
			branches.map(() => ({ customType: STATE_ENTRY_TYPE, data: { enabled: true } })),
		);
	});
});

describe("the semantic events one native transition produces (F5, P7)", () => {
	test("the harness's startup signal opens the session the binding first serves", () => {
		const surface = boundSurface(CODEBASE_TOOLS);

		surface.startSession({ sessionId: "session-1", statePayloads: [] });

		// The native startup carries no reason of its own: it is the session this binding first
		// serves in this process, which is the framework's `initial`.
		expect(surface.observed).toEqual([
			{
				event: { kind: "session_start", reason: "initial" },
				owner: { kind: "owner", key: "main:session-1" },
				hasUI: true,
			},
		]);
	});

	test("a switch to another session ends the one it leaves and starts the one it enters", () => {
		const surface = boundSurface(CODEBASE_TOOLS);
		surface.startSession({ sessionId: "session-1", statePayloads: [{ enabled: true }] });

		surface.switchSession({ sessionId: "session-2", statePayloads: [] }, "new");

		// The pair, in order: the session being left is named by its own key — the session
		// taking over never appears on its end — and the session being entered starts with the
		// reason the native event carried.
		expect(surface.observed.slice(1)).toEqual([
			{
				event: { kind: "session_end", reason: "transferred" },
				owner: { kind: "owner", key: "main:session-1" },
				hasUI: true,
			},
			{
				event: { kind: "session_start", reason: "new" },
				owner: { kind: "owner", key: "main:session-2" },
				hasUI: true,
			},
		]);
	});

	test("each native transition reason maps onto the framework's own vocabulary", () => {
		const cases: ReadonlyArray<{
			readonly native: string;
			readonly deliver: (surface: NativeSurface, facts: SessionFacts) => void;
			readonly reason: SessionStartReason;
		}> = [
			{ native: "session_start", deliver: (surface, facts) => surface.startSession(facts), reason: "initial" },
			{
				native: "session_switch(new)",
				deliver: (surface, facts) => surface.switchSession(facts, "new"),
				reason: "new",
			},
			{
				native: "session_switch(resume)",
				deliver: (surface, facts) => surface.switchSession(facts, "resume"),
				reason: "resume",
			},
			{
				native: "session_switch(fork)",
				deliver: (surface, facts) => surface.switchSession(facts, "fork"),
				reason: "fork",
			},
			{
				native: "session_branch(branch)",
				deliver: (surface, facts) => surface.branchSession(facts, "branch"),
				reason: "new",
			},
			{
				native: "session_branch(btw)",
				deliver: (surface, facts) => surface.branchSession(facts, "btw"),
				reason: "new",
			},
			{
				native: "session_branch(fork)",
				deliver: (surface, facts) => surface.branchSession(facts, "fork"),
				reason: "fork",
			},
		];

		for (const entry of cases) {
			const surface = boundSurface(CODEBASE_TOOLS);
			// A session the binding already serves, so the case below is a real transition.
			surface.startSession({ sessionId: "session-first", statePayloads: [] });
			entry.deliver(surface, { sessionId: "session-second", statePayloads: [] });

			expect({ native: entry.native, transitions: surface.observed.slice(1).map(seen => seen.event) }).toEqual({
				native: entry.native,
				transitions: [
					{ kind: "session_end", reason: "transferred" },
					{ kind: "session_start", reason: entry.reason },
				],
			});
		}
	});

	test("the harness's shutdown disposes the owner this binding serves", () => {
		const surface = boundSurface(CODEBASE_TOOLS);
		const session: SessionFacts = { sessionId: "session-1", statePayloads: [{ enabled: true }] };
		surface.startSession(session);

		surface.shutdown(session);

		expect(surface.observed.slice(1)).toEqual([
			{
				event: { kind: "session_end", reason: "disposed" },
				owner: { kind: "owner", key: "main:session-1" },
				hasUI: true,
			},
		]);
		// Only local state is wound down: the owner's cell is retired, so the same session
		// identity reads the declared default again rather than the value it held.
		surface.runCommand(surface.commandContext(session));
		expect(surface.appended).toEqual([{ customType: STATE_ENTRY_TYPE, data: { enabled: true } }]);
	});

	test("a shutdown of a session this binding never served ends nothing", () => {
		const surface = boundSurface(CODEBASE_TOOLS);

		surface.shutdown({ sessionId: "session-1", statePayloads: [] });

		// Nothing was started, so there is no owner to pair an end with.
		expect(surface.observed).toEqual([]);
	});
});

describe("navigations that keep the session's identity (F5, P7, P10)", () => {
	test("a tree jump, a same-file resume and a branch of the same session emit nothing", () => {
		const surface = boundSurface(CODEBASE_TOOLS);
		const session: SessionFacts = { sessionId: "session-1", statePayloads: [{ enabled: true }] };
		surface.startSession(session);
		const opened = surface.observed.length;

		// Every one of these keeps the owner's key — `/tree`, a same-file `/resume` (and the
		// reload that re-emits the same switch), a TUI `/branch`, an in-place context reset —
		// so none of them is a transition at all.
		surface.navigateTree(session);
		surface.switchSession(session, "resume");
		surface.branchSession(session, "branch");

		expect(surface.observed.length).toBe(opened);
	});

	test("a tree navigation reseeds nothing: the session's current value stays authoritative", () => {
		const surface = boundSurface(CODEBASE_TOOLS);
		const session: SessionFacts = { sessionId: "session-1", statePayloads: [{ enabled: true }] };
		surface.startSession(session);
		// Seeded on, so the first toggle turns the session off.
		surface.runCommand(surface.commandContext(session));
		expect(surface.appended).toEqual([{ customType: STATE_ENTRY_TYPE, data: { enabled: false } }]);

		// The branch the navigation lands on still holds the enabling record (the toggle's
		// write is not part of it). Navigating is not a boundary, so the session's current
		// value — off — is what the next toggle flips.
		surface.navigateTree(session);
		surface.runCommand(surface.commandContext(session));

		expect(surface.appended).toEqual([
			{ customType: STATE_ENTRY_TYPE, data: { enabled: false } },
			{ customType: STATE_ENTRY_TYPE, data: { enabled: true } },
		]);
	});

	test("a navigation that keeps the identity never re-reads the branch either", () => {
		const surface = boundSurface(CODEBASE_TOOLS);
		const session: SessionFacts = { sessionId: "session-1", statePayloads: [{ enabled: true }] };
		surface.startSession(session);
		surface.runCommand(surface.commandContext(session));

		// The branch still records `enabled`: a resume that named the session the binding
		// already serves would re-seed from it under the old shape. It does not, so the cell
		// still holds the value the toggle wrote.
		surface.switchSession(session, "resume");
		surface.runCommand(surface.commandContext(session));

		expect(surface.appended).toEqual([
			{ customType: STATE_ENTRY_TYPE, data: { enabled: false } },
			{ customType: STATE_ENTRY_TYPE, data: { enabled: true } },
		]);
	});
});

describe("session identity changes (F5, P7)", () => {
	test("a new session starts from its own branch and retires the session it replaced", () => {
		const surface = boundSurface(CODEBASE_TOOLS);
		const first: SessionFacts = { sessionId: "session-1", statePayloads: [{ enabled: true }] };
		surface.startSession(first);

		// The new session's branch holds no State: it starts off.
		const second: SessionFacts = { sessionId: "session-2", statePayloads: [] };
		surface.switchSession(second, "new");
		surface.runCommand(surface.commandContext(second));
		expect(surface.appended[surface.appended.length - 1]).toEqual({
			customType: STATE_ENTRY_TYPE,
			data: { enabled: true },
		});

		// The session left behind was retired: its owner reads the default again, so its
		// first toggle records `enabled` rather than flipping the value it had seeded.
		surface.runCommand(surface.commandContext(first));
		expect(surface.appended[surface.appended.length - 1]).toEqual({
			customType: STATE_ENTRY_TYPE,
			data: { enabled: true },
		});
	});

	test("a branch into a new identity seeds from its own target branch", () => {
		const surface = boundSurface(CODEBASE_TOOLS);
		const branched: SessionFacts = { sessionId: "session-3", statePayloads: [{ enabled: true }] };

		surface.branchSession(branched, "branch");
		surface.runCommand(surface.commandContext(branched));

		expect(surface.appended).toEqual([{ customType: STATE_ENTRY_TYPE, data: { enabled: false } }]);
	});

	test("a fork seeds from its own target branch", () => {
		const surface = boundSurface(CODEBASE_TOOLS);
		const forked: SessionFacts = { sessionId: "session-4", statePayloads: [{ enabled: true }] };

		surface.switchSession(forked, "fork");
		surface.runCommand(surface.commandContext(forked));

		expect(surface.appended).toEqual([{ customType: STATE_ENTRY_TYPE, data: { enabled: false } }]);
	});
});

describe("a rename the harness publishes is facts, not a boundary (P24)", () => {
	test("the newest name reaches a session subscription where it happens, and nothing is reconciled", () => {
		const surface = boundSurface(CODEBASE_TOOLS);
		// The session's branch enables its State, so the start seeds `true` and renders its line.
		const session: SessionFacts = { sessionId: "session-1", statePayloads: [{ enabled: true }] };
		surface.startSession(session);
		expect(surface.widgets).toEqual([["◈ codeBaseTools"]]);

		surface.renameSession(session, "renamed-session");

		// The harness's own name-change notification became one delivery: the session's facts, with
		// the name the manager now holds, and no session event beside it.
		expect(surface.factsObserved).toEqual([
			{
				event: { kind: "session_facts" },
				session: {
					sessionId: "session-1",
					kind: "main",
					name: "renamed-session",
					agentName: "main",
					agentId: "Main",
					unavailable: [],
				},
				owner: { kind: "owner", key: "main:session-1" },
			},
		]);
		// It is not a boundary: the run's own event log holds the start and nothing else, and the
		// marker area was not re-published for it — the framework's behavior for a session event
		// was skipped, so the cell the start seeded is untouched.
		expect(surface.observed.map(entry => entry.event)).toEqual([{ kind: "session_start", reason: "initial" }]);
		expect(surface.widgets).toEqual([["◈ codeBaseTools"]]);
		// The session keeps its identity: the next toggle still flips the value the start seeded.
		surface.runCommand(surface.commandContext(session));
		expect(surface.appended).toEqual([{ customType: STATE_ENTRY_TYPE, data: { enabled: false } }]);
	});

	test("a manager that reports no name-change notification still binds and reconciles, and delivers no facts event", () => {
		const surface = boundSurface(CODEBASE_TOOLS, { nameChange: "absent" });
		const session: SessionFacts = { sessionId: "session-1", statePayloads: [{ enabled: true }] };

		surface.startSession(session);
		surface.runCommand(surface.commandContext(session));

		// Nothing is synthesized where the harness publishes no such change, and the boundary the
		// surface does report is reconciled exactly as before: the seeded value is what the toggle
		// recorded rather than the declared default.
		expect(surface.factsObserved).toEqual([]);
		expect(surface.appended).toEqual([{ customType: STATE_ENTRY_TYPE, data: { enabled: false } }]);
	});
});

describe("the marker area at a session boundary (F9, P10)", () => {
	test("a session change renders the area of the session it moved to, never the one it left", () => {
		const surface = boundSurface(CODEBASE_TOOLS);
		// The session the binding starts in is enabled by its own branch, so its line shows.
		surface.startSession({ sessionId: "session-1", statePayloads: [{ enabled: true }] });
		expect(surface.widgets).toEqual([["◈ codeBaseTools"]]);

		// The session it moves to holds nothing, so the area is re-rendered empty — which is
		// the framework's instruction to clear the widget. No marker of the session it left
		// can survive the switch.
		surface.switchSession({ sessionId: "session-2", statePayloads: [] }, "new");
		expect(surface.widgets).toEqual([["◈ codeBaseTools"], undefined]);
	});

	test("a session that leaves its State behind clears the line it held", () => {
		const surface = boundSurface(CODEBASE_TOOLS);
		const session: SessionFacts = { sessionId: "session-1", statePayloads: [{ enabled: true }] };
		surface.startSession(session);

		surface.shutdown(session);

		// The ending owner's own widget is published once more, after its cell was retired.
		expect(surface.widgets).toEqual([["◈ codeBaseTools"], undefined]);
	});
});

describe("per-field persistence at a session boundary (P3)", () => {
	test("a memory field is not seeded by a branch or a fork, and records nothing", () => {
		const surface = boundSurface(MEMORY_TOOLS);
		// This session's own branch carries an enabling record; a memory field reads none of it.
		const session: SessionFacts = { sessionId: "memory-session-1", statePayloads: [{ enabled: true }] };
		surface.startSession(session);
		surface.runCommand(surface.commandContext(session));

		// The toggle started from the declared default rather than from the branch...
		expect(surface.notifications).toEqual(["memoryTools enabled"]);
		// ...and there is no record of it: a memory field never reaches the persistence medium.
		expect(surface.appended).toEqual([]);

		// Branching into a new identity whose branch also carries a record is no seed either.
		const branched: SessionFacts = { sessionId: "memory-session-2", statePayloads: [{ enabled: true }] };
		surface.branchSession(branched, "fork");
		surface.runCommand(surface.commandContext(branched));
		expect(surface.notifications).toEqual(["memoryTools enabled", "memoryTools enabled"]);

		// The identity the branch moved away from reads the declared default again, so this
		// toggle enables instead of flipping the value that session held.
		surface.runCommand(surface.commandContext(session));
		expect(surface.notifications).toEqual([
			"memoryTools enabled",
			"memoryTools enabled",
			"memoryTools enabled",
		]);
		expect(surface.appended).toEqual([]);
	});

	test("a navigation that keeps the owner keeps a memory field's value", () => {
		const surface = boundSurface(MEMORY_TOOLS);
		const session: SessionFacts = { sessionId: "memory-session-1", statePayloads: [{ enabled: true }] };
		surface.startSession(session);
		surface.runCommand(surface.commandContext(session));
		expect(surface.notifications).toEqual(["memoryTools enabled"]);

		// A same-file resume is not a boundary, so the value the cell holds is the one the
		// next toggle flips — a reseed would have enabled it a second time instead.
		surface.switchSession(session, "resume");
		surface.runCommand(surface.commandContext(session));

		expect(surface.notifications).toEqual(["memoryTools enabled", "memoryTools disabled"]);
	});
});
