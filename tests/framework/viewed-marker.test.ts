/**
 * The framework's one marker area projects the session the host displays (P27; S1).
 *
 * The seam is `ompAdapter` plus the narrow native surface the OMP loader hands a factory, and the
 * public Viewed session outlet the approved host patch publishes on every session context. What the
 * framework decides is observable through that surface alone: which widget key and placement the area
 * uses and which lines it carries, for the session the operator is looking at — the owner itself, a
 * subagent following it, or a target the host could not resolve.
 *
 * The seats are chosen so the two declaration kinds are distinguishable: a field that declares
 * `follow` reads the Owner's current value in a subagent, and one that does not reads its declared
 * default, so a projection that merely copied the Owner's lines would show both.
 *
 * The loader evaluates an extension's graph once per session's runner, so one extension is bound
 * again in every session and those bindings share the one process-wide area while keeping
 * independent State. The cases below therefore bind the same extension a second time, from another
 * session, and read what the area shows for the session on screen.
 */
import { describe, expect, test } from "bun:test";
import type {
	OmpAgentRegistry,
	OmpCommandContext,
	OmpExtensionApi,
	OmpRunInitiationResult,
	OmpSessionContext,
	OmpSessionEntry,
	OmpSessionEvent,
	OmpViewedSessionFacts,
} from "../../adapters/omp";
import * as frameworkOmp from "../../adapters/omp";
import { type ExtensionDefinition, defineExtension } from "../../framework/interface";

/**
 * The single native widget key the framework owns for its marker area, and the placement it
 * fixes. Pinned here as the consumer-visible identity of the area: an extension's own id must
 * never become the widget key.
 */
const MARKER_AREA_KEY = "semantic-extensions";
const MARKER_AREA_PLACEMENT = "aboveEditor";

/**
 * The Owner session's identity, and the registry id its subagents are spawned under.
 *
 * The area is process-wide, so the owner key is this suite's own: another file's extension entry,
 * registered in the same process, reads its declared default for a key its store never saw.
 */
const MAIN_SESSION_ID = "session-viewed-marker";
const MAIN_AGENT_ID = "Main";

/** One widget the adapter set, in call order. */
interface WidgetCall {
	readonly key: string;
	readonly lines: readonly string[] | undefined;
	readonly placement: string | undefined;
}

/** One session a delivery is made in. */
interface Session {
	readonly sessionId: string;
	readonly kind: "main" | "sub";
	readonly parentId?: string;
}

/** The main session: the Owner of the State in play. */
const MAIN: Session = { sessionId: MAIN_SESSION_ID, kind: "main" };
/**
 * Two main sessions of one process, each with its own Owner and its own value.
 *
 * Named apart from `MAIN` because the area is process-wide and this suite's other cases arm
 * extensions under `MAIN`'s key: these two keys are what makes the cross-session case observable
 * beside them.
 */
const FIRST_MAIN: Session = { sessionId: "session-viewed-marker-first", kind: "main" };
const OTHER_MAIN: Session = { sessionId: "session-viewed-marker-other", kind: "main" };
/** A subagent of the main session, as the harness's own registry holds it. */
const SUB: Session = { sessionId: "session-sub", kind: "sub", parentId: MAIN_AGENT_ID };

/**
 * The session the host displays. A missing `sessionId` models a target the host could not
 * identify — the case the outlet names as an unavailable fact rather than guessing one.
 */
interface Viewed {
	readonly kind: "main" | "sub";
	readonly sessionId?: string;
	readonly parentId?: string;
}

const MAIN_VIEWED: Viewed = { kind: "main", sessionId: MAIN_SESSION_ID };
/** The first of the two main sessions of the cross-session case, as its own binding displays it. */
const FIRST_VIEWED: Viewed = { kind: "main", sessionId: FIRST_MAIN.sessionId };
/** The second main session, as the host displays that session to its own binding. */
const OTHER_VIEWED: Viewed = { kind: "main", sessionId: OTHER_MAIN.sessionId };
const SUB_VIEWED: Viewed = { kind: "sub", sessionId: SUB.sessionId, parentId: MAIN_AGENT_ID };

type SessionHandler = (event: OmpSessionEvent, ctx: OmpSessionContext) => void;
type RunInitiationHandler = (event: unknown, ctx: OmpSessionContext) => OmpRunInitiationResult | undefined | void;

/** The native session events this double can deliver, as the host publishes them. */
type NativeSessionEvent = "session_start" | "session_switch" | "session_branch" | "session_shutdown";

/** The native surface a loader hands the factory, recording widgets, entries and subscriptions. */
interface NativeDouble {
	readonly api: OmpExtensionApi;
	/** Widget calls in call order, across every binding. */
	readonly widgets: WidgetCall[];
	/** Appended entries in call order; a projection must never produce one. */
	readonly appended: ReadonlyArray<{ readonly customType: string; readonly data: unknown }>;
	/** The listeners the one host outlet currently holds, across every binding. */
	readonly viewers: ReadonlySet<(facts: OmpViewedSessionFacts) => void>;
	/** Binds one definition through the public adapter, as the loader binds one extension. */
	bind(definition: ExtensionDefinition): void;
	/** Runs one bound toggle command in a session, as a user of that session would. */
	toggle(session: Session, command: string): void;
	/** Delivers one run initiation in a session, as the runner does. */
	deliverRun(session: Session): void;
	/** Delivers one native session event in a session, as the host does. */
	deliverSession(session: Session, event: NativeSessionEvent): void;
	/** Shows one session in the host's view, as the interactive view attaching to it does. */
	show(viewed: Viewed): void;
}

/**
 * Records widgets, entries and the host's own viewed-session outlet.
 *
 * The outlet is the process's, exactly as the patched host publishes it: every context answers with
 * the same displayed target, and one subscription carries its changes. The agent registry is the
 * harness's own graph, which is what resolves a displayed subagent's Owner.
 */
function nativeDouble(options: {
	readonly viewedOutlet?: boolean;
	readonly readViewed?: () => OmpViewedSessionFacts;
} = {}): NativeDouble {
	const registrations = new Map<string, { readonly handler: (args: string, ctx: OmpCommandContext) => void }>();
	const sessionHandlers: Array<{ readonly event: NativeSessionEvent; readonly handler: SessionHandler }> = [];
	const runHooks: RunInitiationHandler[] = [];
	const widgets: WidgetCall[] = [];
	const appended: Array<{ customType: string; data: unknown }> = [];
	const viewers = new Set<(facts: OmpViewedSessionFacts) => void>();
	let viewed: Viewed = MAIN_VIEWED;

	const registry: OmpAgentRegistry = {
		get: id =>
			id === MAIN_AGENT_ID
				? { id, kind: "main", session: { sessionManager: { getSessionId: () => MAIN_SESSION_ID } } }
				: undefined,
	};

	const factsOf = (target: Viewed): OmpViewedSessionFacts => ({
		agent: {
			kind: target.kind,
			id: target.kind === "main" ? MAIN_AGENT_ID : "Sub",
			...(target.parentId === undefined ? {} : { parentId: target.parentId }),
		},
		...(target.sessionId === undefined ? {} : { sessionId: target.sessionId }),
	});

	const context = (session: Session, branch: readonly OmpSessionEntry[] = []): OmpSessionContext => ({
		agent: {
			kind: session.kind,
			id: session.kind === "main" ? MAIN_AGENT_ID : "Sub",
			...(session.parentId === undefined ? {} : { parentId: session.parentId }),
		},
		sessionManager: { getSessionId: () => session.sessionId, getBranch: () => branch },
		hasUI: true,
		ui: {
			notify(): void {},
			setWidget(key, content, options): void {
				widgets.push({ key, lines: content, placement: options?.placement });
			},
		},
		...(options.viewedOutlet === false ? {} : {
			getViewedSession: options.readViewed ?? (() => factsOf(viewed)),
			subscribeViewedSessionChanged: (listener: (facts: OmpViewedSessionFacts) => void) => {
				viewers.add(listener);
				return () => viewers.delete(listener);
			},
		}),
	});

	const api: OmpExtensionApi = {
	registerTool() {},
	setLabel(): void {},
		registerCommand(name, registration): void {
			registrations.set(name, registration);
		},
		appendEntry(customType: string, data?: unknown): void {
			appended.push({ customType, data });
		},
		on(event: string, handler: never): void {
			if (event === "before_agent_start") runHooks.push(handler as RunInitiationHandler);
			if (event === "session_start" || event === "session_switch" || event === "session_branch" || event === "session_shutdown") {
				sessionHandlers.push({ event, handler: handler as SessionHandler });
			}
		},
		pi: { AgentRegistry: { global: () => registry } },
}

	return {
		api,
		widgets,
		appended,
		viewers,
		bind(definition) {
			const factory = frameworkOmp.ompAdapter(definition);
			if (!factory(api).bound) throw new Error(`definition "${definition.id}" did not bind`);
		},
		toggle(session, command) {
			const registration = registrations.get(command);
			if (registration === undefined) throw new Error(`command "${command}" was not registered`);
			registration.handler("", context(session));
		},
		deliverRun(session) {
			for (const hook of runHooks) hook({ type: "before_agent_start" }, context(session));
		},
		deliverSession(session, event) {
			const ctx = context(session);
			for (const registered of sessionHandlers) {
				if (registered.event === event) registered.handler({ type: event }, ctx);
			}
		},
		show(next) {
			viewed = next;
			const facts = factsOf(next);
			for (const listener of [...viewers]) listener(facts);
		},
	};
}

/** A marker extension whose declared field follows the Owner into a subagent session. */
function followingMarker(id: string, text: string): ExtensionDefinition {
	return defineExtension({
		id,
		displayName: id,
		state: { inheritance: "follow" },
		commands: [{ type: "toggle", name: `${id}-toggle`, state: "enabled" }],
		marker: { text },
	});
}

/** A marker extension whose declared field does not: a subagent reads its declared default. */
function ownSessionMarker(id: string, text: string): ExtensionDefinition {
	return defineExtension({
		id,
		displayName: id,
		state: { field: "enabled", inheritance: "none" },
		commands: [{ type: "toggle", name: `${id}-toggle`, state: "enabled" }],
		marker: { text },
	});
}

/** Declared out of id order on purpose: only a sort by id can put the following line first. */
const FOLLOW = followingMarker("aaa-follow", "◈ follow");
const NONE = ownSessionMarker("zzz-none", "◐ none");

/** The lines of the newest rendering the host was told to show, or nothing when it was cleared. */
function lastRender(double: NativeDouble): readonly string[] | undefined {
	return double.widgets[double.widgets.length - 1]?.lines;
}

/** Binds both marker extensions and arms them in the Owner's own session. */
function armedOwner(): NativeDouble {
	const double = nativeDouble();
	double.bind(FOLLOW);
	double.bind(NONE);
	double.deliverSession(MAIN, "session_start");
	double.toggle(MAIN, "aaa-follow-toggle");
	double.toggle(MAIN, "zzz-none-toggle");
	expect(lastRender(double)).toEqual(["◈ follow", "◐ none"]);
	return double;
}

// Source-aligned migration S1: absent outlet means the delivery's seat, not an unresolved
// displayed target. A plausible violation is treating the optional method's absence as an
// invalid target and clearing an enabled Owner. Public widget output distinguishes these.
describe("OMP native Viewed-session variants preserve their distinct projections (P7, P15)", () => {
	test("without the outlet, deliveries project their own session and never subscribe", () => {
		const double = nativeDouble({ viewedOutlet: false });
		double.bind(FOLLOW);
		double.bind(NONE);
		double.deliverSession(MAIN, "session_start");
		double.toggle(MAIN, "aaa-follow-toggle");
		double.toggle(MAIN, "zzz-none-toggle");
		expect(lastRender(double)).toEqual(["◈ follow", "◐ none"]);
		double.deliverRun(SUB);
		expect(lastRender(double)).toEqual(["◈ follow"]);
		double.deliverRun(MAIN);
		expect(lastRender(double)).toEqual(["◈ follow", "◐ none"]);
		expect(double.viewers.size).toBe(0);
	});

	// Registry labels are not session identity. Even a known Main label or a child whose
	// parent looks hierarchical cannot supply the missing actual target/ancestor identity.
	test("unavailable identity never borrows the Main label or a hierarchical parent name", () => {
		const double = armedOwner();
		double.show({ kind: "main", sessionId: "" });
		expect(lastRender(double)).toBeUndefined();
		double.show({ kind: "sub", sessionId: "orphan", parentId: "Main.lookalike" });
		expect(lastRender(double)).toBeUndefined();
		double.show(MAIN_VIEWED);
		expect(lastRender(double)).toEqual(["◈ follow", "◐ none"]);
	});

	// Keep the real adapter/framework projection path: only the native outlet throws.
	// Swallowing/retrying that read would hide or duplicate this exact external error.
	test("an outlet read failure propagates unchanged without retrying or corrupting a later publication (P13)", () => {
		const failure = new Error("native viewed read failed");
		let fail = false;
		let failedReads = 0;
		const session: Session = { sessionId: "viewed-read-failure", kind: "main" };
		const double = nativeDouble({
			readViewed: () => {
				if (fail) {
					failedReads += 1;
					throw failure;
				}
				return { agent: { kind: "main", id: "Main" }, sessionId: session.sessionId };
			},
		});
		double.bind(FOLLOW);
		double.deliverSession(session, "session_start");
		double.toggle(session, "aaa-follow-toggle");
		fail = true;
		let caught: unknown;
		try {
			double.show(SUB_VIEWED);
		} catch (error) {
			caught = error;
		}
		expect(caught).toBe(failure);
		expect(failedReads).toBe(1);
		fail = false;
		double.show(MAIN_VIEWED);
		expect(lastRender(double)).toEqual(["◈ follow"]);
	});

	// Snapshot callbacks before unsubscribe to model a native delivery already queued. Merely
	// checking subscriber counts would miss a late callback still publishing a disposed binding.
	test("released bindings ignore queued view callbacks while a separate binding keeps projecting (P10, P14)", () => {
		const disposed = armedOwner();
		const queued = [...disposed.viewers];
		const live = nativeDouble();
		live.bind(FOLLOW);
		live.show(OTHER_VIEWED);
		live.deliverSession(OTHER_MAIN, "session_start");
		live.toggle(OTHER_MAIN, "aaa-follow-toggle");
		disposed.deliverSession(MAIN, "session_shutdown");
		expect(disposed.viewers.size).toBe(0);
		const before = disposed.widgets.length;
		for (const callback of queued) callback({ agent: { kind: "main", id: "Main" }, sessionId: MAIN_SESSION_ID });
		expect(disposed.widgets.length).toBe(before);
		expect(disposed.viewers.size).toBe(0);
		const liveBefore = live.widgets.length;
		live.show(OTHER_VIEWED);
		expect(live.widgets.length).toBeGreaterThan(liveBefore);
		expect(lastRender(live)).toEqual(["◈ follow"]);
		live.toggle(OTHER_MAIN, "aaa-follow-toggle");
		expect(lastRender(live)).toBeUndefined();
	});

	// Native handlers can outlive the binding: recording their late context must not recreate
	// the host subscription after the last framework listener has left.
	test("a native run arriving after release must not reopen Viewed-session subscriptions (P14)", () => {
		const double = armedOwner();
		double.deliverSession(MAIN, "session_shutdown");
		expect(double.viewers.size).toBe(0);
		const before = double.widgets.length;
		double.deliverRun(MAIN);
		expect(double.widgets.length).toBe(before);
		expect(double.viewers.size).toBe(0);
	});
});

describe("the area projects the displayed session's own effective State (P27)", () => {
	test("a displayed subagent shows the Owner's current value where the field follows and the declared default where it does not", () => {
		const double = armedOwner();

		// The operator looks at the subagent: what the area shows is that subagent's own effective
		// State — the following field reads the Owner's current value, the other one reads its own
		// declared default — never a copy of every line the Owner's session shows.
		double.show(SUB_VIEWED);
		expect(lastRender(double)).toEqual(["◈ follow"]);

		// Returning to the Owner restores its own lines, which nothing moved while the view was away.
		double.show(MAIN_VIEWED);
		expect(lastRender(double)).toEqual(["◈ follow", "◐ none"]);
	});

	test("a view change re-projects the area on its own, through the framework's one widget", () => {
		const double = armedOwner();
		const before = double.widgets.length;

		// No session, run or command delivery happens here: the host's own view change is what moves
		// the area, and it moves to the target's lines rather than to the Owner's.
		double.show(SUB_VIEWED);

		const added = double.widgets.slice(before);
		expect(added.length).toBeGreaterThan(0);
		expect(added[added.length - 1]).toEqual({
			key: MARKER_AREA_KEY,
			lines: ["◈ follow"],
			placement: MARKER_AREA_PLACEMENT,
		});
		// No extension ever chose the widget: every call went to the one framework key.
		expect([...new Set(double.widgets.map(call => call.key))]).toEqual([MARKER_AREA_KEY]);
	});

	test("a delivery in another session does not move the area away from what is displayed", () => {
		const double = armedOwner();
		double.show(SUB_VIEWED);
		expect(lastRender(double)).toEqual(["◈ follow"]);

		// The Owner's session runs while its subagent is on screen: the re-assertion is the displayed
		// target's rendering, so the area stays what the operator is looking at.
		double.deliverRun(MAIN);
		expect(lastRender(double)).toEqual(["◈ follow"]);
	});

	test("a displayed target the host cannot identify empties the area instead of keeping the Owner's lines", () => {
		const double = armedOwner();

		// The outlet exists but cannot obtain the displayed session's identity, so no cell is
		// projected: the area is cleared rather than left showing the session that was on screen
		// before, and nothing is guessed from the binding's own session.
		double.show({ kind: "main" });
		expect(lastRender(double)).toBeUndefined();
	});
});

describe("the projection re-reads State and grants no authority (P27)", () => {
	test("what a displayed subagent shows follows the Owner's current value, not a copy taken at the switch", () => {
		const double = armedOwner();
		double.show(SUB_VIEWED);
		expect(lastRender(double)).toEqual(["◈ follow"]);

		// The following extension is turned off in the Owner's own session while the operator keeps
		// looking at the subagent: the projection re-reads the Owner, so the line goes.
		double.toggle(MAIN, "aaa-follow-toggle");
		expect(lastRender(double)).toBeUndefined();

		// And turning it back on brings the line back under the same view.
		double.toggle(MAIN, "aaa-follow-toggle");
		expect(lastRender(double)).toEqual(["◈ follow"]);
	});

	test("a subagent's own boundary and commands write nothing: the Owner keeps its value and its persistence", () => {
		const double = armedOwner();
		const writes = [...double.appended];
		double.show(SUB_VIEWED);

		// The displayed subagent's own session runs the same commands and starts its own session: a
		// session that is not its own owner reaches no write path, records nothing and publishes
		// nothing, and its boundary is not the Owner's.
		double.toggle(SUB, "aaa-follow-toggle");
		double.toggle(SUB, "zzz-none-toggle");
		double.deliverSession(SUB, "session_start");

		expect(double.appended).toEqual(writes);
		// The Owner's own value survived the subagent's boundary, and the view still shows its lines.
		double.show(MAIN_VIEWED);
		expect(lastRender(double)).toEqual(["◈ follow", "◐ none"]);
	});

	test("a disposed binding stops projecting and gives its view subscription back", () => {
		const double = armedOwner();
		expect(double.viewers.size).toBe(2);

		double.deliverSession(MAIN, "session_shutdown");
		expect(double.viewers.size).toBe(0);

		// Nothing arrives from a binding whose delivery has ended, not even a view change.
		const before = double.widgets.length;
		double.show(SUB_VIEWED);
		expect(double.widgets.length).toBe(before);
	});
});

/**
 * The spawned session's own binding, as the host's loader creates it: its own factory call and store
 * for the same extension ids, its own contexts, and the one process-global area — which is what a
 * subagent session's runner is, next to the owner session's binding that is already rendering.
 */
function spawnedBinding(): NativeDouble {
	const spawned = nativeDouble();
	spawned.bind(FOLLOW);
	spawned.bind(NONE);
	spawned.show(SUB_VIEWED);
	spawned.deliverSession(SUB, "session_start");
	return spawned;
}

describe("the one area stays the displayed session's rendering beside another binding of the same extension (P27, P13)", () => {
	test("the displayed Owner's session still renders both lines after a second binding registers", () => {
		const double = armedOwner();
		spawnedBinding();

		// The Owner's own session re-asserts the area while its spawned session's binding is bound:
		// what the operator sees stays the Owner's rendering, never what that other store knows
		// about a key it never held.
		const before = double.widgets.length;
		double.deliverRun(MAIN);
		expect(double.widgets.length).toBeGreaterThan(before);
		expect(lastRender(double)).toEqual(["◈ follow", "◐ none"]);
	});

	test("the spawned session's own deliveries render the seat on screen, never an empty area", () => {
		const double = armedOwner();
		const spawned = spawnedBinding();

		// The spawned session's own run projects the displayed seat, so the following field reads the
		// Owner's current value from the store that holds it — an area with the following line rather
		// than the clear its own empty store would have published.
		spawned.deliverRun(SUB);
		expect(lastRender(spawned)).toEqual(["◈ follow"]);
	});

	test("two sessions that bound the same extension read their own Owner, whichever bound last", () => {
		const armed = nativeDouble();
		armed.bind(FOLLOW);
		armed.show(FIRST_VIEWED);
		armed.deliverSession(FIRST_MAIN, "session_start");
		armed.toggle(FIRST_MAIN, "aaa-follow-toggle");
		expect(lastRender(armed)).toEqual(["◈ follow"]);

		// A second main session binds the same extension afterwards and stays off: its own binding, its
		// own store, one area. Each session's area carries its own Owner's value and nothing else.
		const other = nativeDouble();
		other.bind(FOLLOW);
		other.show(OTHER_VIEWED);
		other.deliverSession(OTHER_MAIN, "session_start");

		const before = armed.widgets.length;
		armed.deliverRun(FIRST_MAIN);
		expect(armed.widgets.length).toBeGreaterThan(before);
		expect(lastRender(armed)).toEqual(["◈ follow"]);
		// The other session's own area carries its own Owner's value: it has nothing to say, so the
		// area is empty rather than showing the value the session beside it holds.
		other.deliverRun(OTHER_MAIN);
		expect(lastRender(other)).toBeUndefined();
	});
});
