/**
 * The subagent-runtime axis at the public adapter seam: the harness's own per-execution duration,
 * attributed to the session that execution really ran in (S1; contract P10, P13, P15).
 *
 * The seam is `ompAdapter` plus the native surface the OMP loader hands a factory, exactly as the
 * round and Turn axes are observed there. What the cases drive is the harness's own delegation tool's
 * payloads — a running spawn's progress frame and a settled spawn's own result — and what they read is
 * the delivery the framework hands the extension's own handler.
 *
 * The metric choice is the point of the first case: an execution's runtime is the duration the host
 * stated for *that execution*, and the wall-clock span a harness may persist for the session (its
 * registration to its last activity) is a different number. The case makes the two distinguishable and
 * observes which one arrives — including for an execution whose own duration the host never stated,
 * where the answer has to be "unavailable" and never the span.
 */
import { describe, expect, test } from "bun:test";
import type { OmpCommandContext, OmpExtensionApi, OmpSessionContext, OmpToolExecutionEvent } from "../../framework/adapters/omp";
import * as frameworkOmp from "../../framework/adapters/omp";
import type { SubagentRuntimeDelivery, SubagentRuntimeFact } from "../../framework/core/protocol";
import { type ExtensionDefinition, defineExtension } from "../../framework/public";

const PROBE: ExtensionDefinition = defineExtension({ id: "runtime-probe", displayName: "runtimeProbe" });

/** The registry id the host gives the spawn this suite's delegation payloads name. */
const EXECUTION_ID = "0-Explore";

/** The main session's own identity, as the harness's registry holds it. */
const MAIN_SESSION_ID = "session-main";

/** The session the spawn actually ran in, as the harness's registry holds it. */
const CHILD_SESSION_ID = "session-child";

/** One native agent as the harness's own registry holds it; only the members this mapping reads. */
interface AgentRef {
	readonly id: string;
	readonly kind: string;
	readonly parentId?: string;
	readonly session?: { readonly sessionManager: { getSessionId(): string; getSessionName?(): string | undefined } } | null;
}

/** What one observation of the axis recorded, as the extension's own handler saw it. */
interface ObservedDelivery {
	readonly sessionId: string;
	readonly sessionKind: string;
	readonly parentSessionId: string | undefined;
	readonly sessionName: string | undefined;
	readonly unavailable: readonly string[];
	readonly owner: string;
	readonly ownerKind: string;
	readonly runtime: SubagentRuntimeFact;
	readonly hasUI: boolean;
}

/** The native surface a loader hands the factory, and what the bound extension observed. */
interface NativeSurface {
	readonly api: OmpExtensionApi;
	/** The deliveries the extension's own handler received, in call order. */
	readonly observed: ObservedDelivery[];
	/** Every native event name the binding subscribed to, in call order. */
	readonly registrations: string[];
	/** Every channel of the harness's own event bus the binding subscribed to, in call order. */
	readonly busRegistrations: string[];
	/** One native tool-progress frame, as the runner delivers it. */
	progress(event: OmpToolExecutionEvent, ctx: OmpSessionContext): void;
	/** One native tool result, as the runner delivers it. */
	settle(event: OmpToolExecutionEvent, ctx: OmpSessionContext): void;
	/** One frame of the harness's own subagent channels, as the harness publishes it. */
	emit(channel: string, payload: unknown): void;
	/** The main session's own context, as a delivery from it carries. */
	mainContext(): OmpSessionContext;
	/** Registers the spawn's agent, as the harness does when the session is being stood up. */
	registerChild(): void;
	/** Attaches the session the spawn runs in, as the harness does once it exists. */
	attachChild(): void;
	/** Detaches it again, as the harness does once that agent is parked and only its history remains. */
	detachChild(): void;
}

/** One native context, as the loader builds it for a delivery's session. */
function contextOf(facts: {
	readonly sessionId: string;
	readonly kind: "main" | "sub";
	readonly agentId: string;
	readonly parentId?: string;
	readonly name?: string;
	readonly hasUI?: boolean;
}): OmpSessionContext {
	return {
		agent: {
			kind: facts.kind,
			id: facts.agentId,
			name: facts.agentId,
			...(facts.parentId === undefined ? {} : { parentId: facts.parentId }),
		},
		sessionManager: {
			getSessionId: () => facts.sessionId,
			getBranch: () => [],
			...(facts.name === undefined ? {} : { getSessionName: () => facts.name }),
		},
		hasUI: facts.hasUI ?? true,
		ui: { notify: () => {}, setWidget: () => {} },
	} as unknown as OmpSessionContext;
}

/**
 * Binds the probe over one native surface whose agent registry holds the main session and the
 * spawn's own session, and whose delegation payloads name that spawn.
 *
 * `spanMs` is the wall-clock distance between the spawn's registration and its last activity — the
 * metric the hub-style "time" column of a session would show. It is deliberately a different number
 * from any duration a payload states, because the case's question is which of the two arrives.
 *
 * `childRegistered` and `childAttached` are the two stages a spawn passes through on the host: the
 * registry holds its agent from the moment it is registered, and the live session that agent runs in
 * is attached after that — the delegation route's own readings begin before either exists.
 */
function boundSurface(
	options: {
		readonly spanMs?: number;
		readonly scope?: "owner" | "session";
		readonly ownReading?: boolean;
		readonly childAttached?: boolean;
		readonly childRegistered?: boolean;
	} = {},
): NativeSurface {
	const toolHandlers: Record<"tool_execution_update" | "tool_execution_end", Array<(event: never, ctx: never) => void>> = {
		tool_execution_update: [],
		tool_execution_end: [],
	};
	/** The harness's own bus, as the loader hands it over: one listener list per channel. */
	const busListeners = new Map<string, Array<(data: unknown) => void>>();
	const observed: ObservedDelivery[] = [];
	const registrations: string[] = [];
	const busRegistrations: string[] = [];
	const spanMs = options.spanMs ?? 3_600_000;
	const mainRef: AgentRef = {
		id: "Main",
		kind: "main",
		session: { sessionManager: { getSessionId: () => MAIN_SESSION_ID, getSessionName: () => "主会话" } },
	};
	const childRef: AgentRef = {
		id: EXECUTION_ID,
		kind: "sub",
		parentId: "Main",
		session: { sessionManager: { getSessionId: () => CHILD_SESSION_ID, getSessionName: () => "子代理" } },
	};
	// The two refs carry a real registration-to-last-activity distance, which is what a display reading
	// a session's own span would use and what no execution's duration may be answered with.
	Object.assign(mainRef, { createdAt: 1_000, lastActivity: 1_000 + spanMs });
	Object.assign(childRef, { createdAt: 1_000, lastActivity: 1_000 + spanMs });
	const childSession = childRef.session;
	if (options.childAttached === false) Object.assign(childRef, { session: null });
	let childRegistered = options.childRegistered !== false;
	const registry = {
		get: (id: string) => (id === "Main" ? mainRef : id === EXECUTION_ID && childRegistered ? childRef : undefined),
	};

	const api: OmpExtensionApi = {
		setLabel(): void {},
		registerCommand(): void {},
		appendEntry(): void {},
		on(event: string, handler: never): void {
			registrations.push(event);
			if (event === "tool_execution_update" || event === "tool_execution_end") {
				toolHandlers[event].push(handler as (event: never, ctx: never) => void);
			}
		},
		pi: { AgentRegistry: { global: () => registry } },
		events: {
			on(channel: string, handler: (data: unknown) => void): () => void {
				busRegistrations.push(channel);
				const listeners = busListeners.get(channel) ?? [];
				listeners.push(handler);
				busListeners.set(channel, listeners);
				return () => {
					busListeners.set(channel, listeners.filter(listener => listener !== handler));
				};
			},
		},
	};

	const record = (delivery: SubagentRuntimeDelivery): void => {
		observed.push({
			sessionId: delivery.session.sessionId,
			sessionKind: delivery.session.kind,
			parentSessionId: delivery.session.parentSessionId,
			sessionName: delivery.session.name,
			unavailable: delivery.session.unavailable,
			owner: delivery.owner.kind === "unresolved" ? "<unresolved>" : delivery.owner.key,
			ownerKind: delivery.owner.kind,
			runtime: delivery.runtime,
			hasUI: delivery.hasUI,
		});
	};
	const events = { subagent_runtime: record };
	const factory = frameworkOmp.ompAdapter(PROBE, {
		factory: () => ({ subscriptions: [{ scope: options.scope ?? "session", events }] }),
	});
	if (!factory(api).bound) throw new Error("the runtime probe definition did not bind");

	return {
		api,
		observed,
		registrations,
		busRegistrations,
		progress: (event, ctx) => {
			for (const handler of toolHandlers.tool_execution_update) handler(event as never, ctx as never);
		},
		settle: (event, ctx) => {
			for (const handler of toolHandlers.tool_execution_end) handler(event as never, ctx as never);
		},
		emit: (channel, payload) => {
			for (const listener of [...(busListeners.get(channel) ?? [])]) listener(payload);
		},
		mainContext: () => contextOf({ sessionId: MAIN_SESSION_ID, kind: "main", agentId: "Main", name: "主会话" }),
		registerChild: () => { childRegistered = true; },
		attachChild: () => { Object.assign(childRef, { session: childSession }); },
		detachChild: () => { Object.assign(childRef, { session: null }); },
	};
}

/** One delegation progress frame, in the shape the host's own task tool publishes. */
function progressFrame(entry: Record<string, unknown>): OmpToolExecutionEvent {
	return { type: "tool_execution_update", toolName: "task", partialResult: { details: { progress: [entry] } } };
}

/** One settled delegation result, in the shape the host's own task tool returns. */
function settledResult(entry: Record<string, unknown>): OmpToolExecutionEvent {
	return { type: "tool_execution_end", toolName: "task", result: { details: { results: [entry] } } };
}

/** One frame of the harness's progress channel, in the shape its own subagent executor publishes. */
function progressPayload(id: string, status: string, durationMs: unknown): unknown {
	return { index: 0, agent: "task", task: "follow-up", progress: { id, status, durationMs } };
}

/** One frame of the harness's lifecycle channel, as the executor publishes it around a run. */
function lifecyclePayload(id: string, status: string): unknown {
	return { id, status, agent: "task", index: 0 };
}

describe("the runtime is the host's own per-execution duration, attributed to the session that ran it (P10)", () => {
	test("startup progress stays unobserved until the actual child Session is attached", () => {
		const surface = boundSurface({ childAttached: false });
		for (const durationMs of [0, 25, 80]) {
			surface.progress(progressFrame({ id: EXECUTION_ID, status: "running", durationMs }), surface.mainContext());
		}
		expect(surface.observed).toEqual([]);
		surface.attachChild();
		surface.progress(progressFrame({ id: EXECUTION_ID, status: "running", durationMs: 120 }), surface.mainContext());
		expect(surface.observed.map(({ sessionId, runtime }) => ({ sessionId, runtime }))).toEqual([
			{ sessionId: CHILD_SESSION_ID, runtime: { kind: "reading", executionId: EXECUTION_ID, runtimeMs: 120, status: "running" } },
		]);
	});
	test("the readings that precede the spawn's own registry entry state nothing either", () => {
		const surface = boundSurface({ childRegistered: false, childAttached: false });

		// The delegation route publishes a spawn's first rows before the harness has registered its
		// agent at all, and keeps publishing while that agent has no live session yet: neither stage of
		// the creation is a reading an operator lost.
		surface.progress(progressFrame({ id: EXECUTION_ID, status: "running", durationMs: 0 }), surface.mainContext());
		expect(surface.observed).toEqual([]);

		surface.registerChild();
		surface.progress(progressFrame({ id: EXECUTION_ID, status: "running", durationMs: 50 }), surface.mainContext());
		expect(surface.observed).toEqual([]);

		surface.attachChild();
		surface.progress(progressFrame({ id: EXECUTION_ID, status: "running", durationMs: 200 }), surface.mainContext());

		// The first reading that resolves a session is the whole duration the host had measured by then.
		expect(surface.observed.map(({ sessionId, runtime }) => ({ sessionId, runtime }))).toEqual([
			{ sessionId: CHILD_SESSION_ID, runtime: { kind: "reading", executionId: EXECUTION_ID, runtimeMs: 200, status: "running" } },
		]);
	});
	test("the harness's own frame route states nothing in that window either, and its first attributed frame is the whole duration", () => {
		const surface = boundSurface({ childAttached: false });

		// A delegation payload anchors the binding to the session whose own work reported the spawn —
		// the frames carry no session — and states nothing for the spawn's unattributed readings; the
		// frames the harness publishes in the same window are silent for the same reason.
		surface.progress(progressFrame({ id: EXECUTION_ID, status: "running", durationMs: 0 }), surface.mainContext());
		surface.emit("task:subagent:progress", progressPayload(EXECUTION_ID, "running", 40_000));
		expect(surface.observed).toEqual([]);

		surface.attachChild();
		surface.emit("task:subagent:progress", progressPayload(EXECUTION_ID, "running", 150_000));

		// The frame that finally names the session carries the duration the host had measured by then —
		// the execution's whole elapsed time, since a reading is cumulative and never a delta.
		expect(surface.observed.map(({ sessionId, runtime }) => ({ sessionId, runtime }))).toEqual([
			{ sessionId: CHILD_SESSION_ID, runtime: { kind: "reading", executionId: EXECUTION_ID, runtimeMs: 150_000, status: "running" } },
		]);
	});
	test("a running frame and a settled result each deliver their own duration, and never the session's physical span", () => {
		const surface = boundSurface({ spanMs: 3_600_000 });

		surface.progress(progressFrame({ id: EXECUTION_ID, durationMs: 180_000 }), surface.mainContext());
		surface.settle(settledResult({ id: EXECUTION_ID, durationMs: 360_000 }), surface.mainContext());

		// The host's own readings, as they stand — 180000 while the spawn ran, 360000 once it settled —
		// and neither of them the 3600000-millisecond registration-to-last-activity distance the same
		// agent's record carries.
		expect(surface.observed.map(delivery => delivery.runtime)).toEqual([
			{ kind: "reading", executionId: EXECUTION_ID, runtimeMs: 180_000, status: "running" },
			{ kind: "reading", executionId: EXECUTION_ID, runtimeMs: 360_000, status: "ended" },
		]);
	});

	test("an execution whose own duration the host states none for is unavailable, and the session's span never stands in", () => {
		const surface = boundSurface({ spanMs: 3_600_000 });

		surface.settle(settledResult({ id: EXECUTION_ID }), surface.mainContext());
		surface.settle(settledResult({ id: EXECUTION_ID, durationMs: "8 minutes" }), surface.mainContext());

		expect(surface.observed).toHaveLength(2);
		for (const delivery of surface.observed) {
			expect(delivery.runtime.kind).toBe("unavailable");
			expect(delivery.runtime.kind === "unavailable" ? delivery.runtime.reason : "").toContain(EXECUTION_ID);
		}
	});

	test("the reading is observed somewhere but belongs elsewhere: the spawn's own session, its direct parent, and its inherited owner", () => {
		const surface = boundSurface();

		surface.settle(settledResult({ id: EXECUTION_ID, durationMs: 360_000 }), surface.mainContext());

		const [delivery] = surface.observed;
		// The execution's own session is what the harness's agent graph says it ran in — not the session
		// the observation was made from — and its direct parent is one hop of that same graph.
		expect(delivery?.sessionId).toBe(CHILD_SESSION_ID);
		expect(delivery?.sessionKind).toBe("sub");
		expect(delivery?.parentSessionId).toBe(MAIN_SESSION_ID);
		expect(delivery?.sessionName).toBe("子代理");
		// Its owner is the top-level main session that subagent follows, so this is not an owner-scoped
		// delivery even though the tool call that reported it ran in the main session.
		expect(delivery?.ownerKind).toBe("inherited");
		expect(delivery?.owner).toBe("main:session-main");
	});

	test("a subagent's own runtime never reaches an owner-scoped group, and a session-scoped one receives it", () => {
		const ownerScoped = boundSurface({ scope: "owner" });
		const sessionScoped = boundSurface({ scope: "session" });

		ownerScoped.settle(settledResult({ id: EXECUTION_ID, durationMs: 360_000 }), ownerScoped.mainContext());
		sessionScoped.settle(settledResult({ id: EXECUTION_ID, durationMs: 360_000 }), sessionScoped.mainContext());

		expect(ownerScoped.observed).toEqual([]);
		expect(sessionScoped.observed).toHaveLength(1);
	});

	test("a tool that is not the harness's delegation, and a payload that names no execution, produce no observation", () => {
		const surface = boundSurface();

		surface.settle({ type: "tool_execution_end", toolName: "bash", result: { details: { results: [{ id: "x", durationMs: 5 }] } } }, surface.mainContext());
		surface.progress({ type: "tool_execution_update", toolName: "task", partialResult: { content: [] } }, surface.mainContext());
		surface.settle({ type: "tool_execution_end", toolName: "task", result: { details: { results: [] } } }, surface.mainContext());

		expect(surface.observed).toEqual([]);
	});
});

describe("a kept-alive agent's later execution is a new one, stated on the harness's own frames (P11, P12)", () => {
	test("a follow-up execution of one agent is reported under its own identity, and its readings replace each other", () => {
		const surface = boundSurface();

		// The spawn's own execution: the harness opens it on its lifecycle channel and the delegation
		// tool's payloads state its duration under the agent's own id.
		surface.emit("task:subagent:lifecycle", lifecyclePayload(EXECUTION_ID, "started"));
		surface.progress(progressFrame({ id: EXECUTION_ID, durationMs: 180_000 }), surface.mainContext());
		surface.settle(settledResult({ id: EXECUTION_ID, durationMs: 360_000 }), surface.mainContext());

		// The kept-alive agent's follow-up turn: the same agent id run again, with no delegation call of
		// its own, so the frames are the only route that carries it.
		surface.emit("task:subagent:lifecycle", lifecyclePayload(EXECUTION_ID, "started"));
		surface.emit("task:subagent:progress", progressPayload(EXECUTION_ID, "running", 30_000));
		surface.emit("task:subagent:progress", progressPayload(EXECUTION_ID, "running", 90_000));
		surface.emit("task:subagent:progress", progressPayload(EXECUTION_ID, "completed", 120_000));

		expect(surface.observed.map(delivery => delivery.runtime)).toEqual([
			{ kind: "reading", executionId: EXECUTION_ID, runtimeMs: 180_000, status: "running" },
			{ kind: "reading", executionId: EXECUTION_ID, runtimeMs: 360_000, status: "ended" },
			// The follow-up: the agent's own id bracketed by the execution number the harness's own
			// opening frame established, so a consumer accumulates it instead of reading it as a repeat
			// of the spawn — and the three readings are one execution's own, replacing each other.
			{ kind: "reading", executionId: `${EXECUTION_ID}#2`, runtimeMs: 30_000, status: "running" },
			{ kind: "reading", executionId: `${EXECUTION_ID}#2`, runtimeMs: 90_000, status: "running" },
			{ kind: "reading", executionId: `${EXECUTION_ID}#2`, runtimeMs: 120_000, status: "ended" },
		]);
		// A frame carries no session of its own: the execution's own session and the main session above it
		// are resolved from the harness's agent graph, exactly as they are for the tool route.
		expect(surface.observed[2]?.sessionId).toBe(CHILD_SESSION_ID);
		expect(surface.observed[2]?.owner).toBe(`main:${MAIN_SESSION_ID}`);
		// A terminal frame is that execution's final reading; a running one is not.
		expect(surface.observed[4]?.runtime.kind === "reading" ? surface.observed[4].runtime.status : "").toBe("ended");
	});

	test("a terminal status the harness states is an end, and a frame stating neither a status nor an agent produces nothing", () => {
		const surface = boundSurface();
		surface.progress(progressFrame({ id: EXECUTION_ID, durationMs: 0 }), surface.mainContext());

		surface.emit("task:subagent:progress", progressPayload(EXECUTION_ID, "failed", 60_000));
		surface.emit("task:subagent:progress", progressPayload(EXECUTION_ID, "aborted", 70_000));
		// No status this host's vocabulary holds, no execution id, no progress object at all: each states
		// no reading, and none of them is guessed into a runtime.
		surface.emit("task:subagent:progress", progressPayload(EXECUTION_ID, "thinking", 80_000));
		surface.emit("task:subagent:progress", { progress: { status: "running", durationMs: 90_000 } });
		surface.emit("task:subagent:progress", { index: 0 });

		expect(surface.observed.map(delivery => delivery.runtime)).toEqual([
			{ kind: "reading", executionId: EXECUTION_ID, runtimeMs: 0, status: "running" },
			{ kind: "reading", executionId: EXECUTION_ID, runtimeMs: 60_000, status: "ended" },
			{ kind: "reading", executionId: EXECUTION_ID, runtimeMs: 70_000, status: "ended" },
		]);
		// The binding asks the harness's bus for exactly the two channels this axis is stated on.
		expect(surface.busRegistrations).toEqual(["task:subagent:progress", "task:subagent:lifecycle"]);
	});

	test("an execution the graph holds no session for states nothing while it runs, and its end is unavailable", () => {
		const early = boundSurface();
		// No delivery has reached this binding yet, so there is no session to anchor an observation to:
		// nothing is attributed rather than guessed at.
		early.emit("task:subagent:progress", progressPayload(EXECUTION_ID, "running", 30_000));
		expect(early.observed).toEqual([]);

		const surface = boundSurface();
		surface.progress(progressFrame({ id: EXECUTION_ID, durationMs: 0 }), surface.mainContext());
		surface.emit("task:subagent:progress", progressPayload("0-Gone", "running", 30_000));

		// A running reading of an execution no reading ever attributed is the creation window of a spawn
		// this host cannot place yet, so nothing is stated in place of a reading: the readings of an
		// execution are cumulative, and the frame reporting it over — the last fact the host has about
		// it — is what tells the operator which reading could not be obtained, anchored to the session
		// the observation was made in.
		expect(surface.observed).toHaveLength(1);
		surface.emit("task:subagent:progress", progressPayload("0-Gone", "completed", 60_000));

		const [delivery] = surface.observed.slice(-1);
		expect(delivery?.runtime.kind).toBe("unavailable");
		expect(delivery?.sessionId).toBe(MAIN_SESSION_ID);
		expect(delivery?.runtime.kind === "unavailable" ? delivery.runtime.reason : "").toContain("0-Gone");
	});
});

describe("a host that cannot attribute an execution reports that fact rather than a reading (P15)", () => {
	test("an execution identity or a session the graph does not hold is unavailable, and the observation names where it was read", () => {
		const surface = boundSurface();
		const foreignSessionId = "session-unknown";

		surface.settle(settledResult({ durationMs: 360_000 }), surface.mainContext());
		surface.settle(settledResult({ id: foreignSessionId, durationMs: 360_000 }), surface.mainContext());

		expect(surface.observed).toHaveLength(2);
		expect(surface.observed.map(delivery => delivery.runtime.kind)).toEqual(["unavailable", "unavailable"]);
		// Nothing names the session the execution ran in, so the observation is anchored to the session
		// whose own work reported it — and the reason states which fact could not be obtained.
		expect(surface.observed.map(delivery => delivery.sessionId)).toEqual([MAIN_SESSION_ID, MAIN_SESSION_ID]);
		expect(
			surface.observed.map(delivery => (delivery.runtime.kind === "unavailable" ? delivery.runtime.reason : "")),
		).toEqual(["子代理执行身份", `子代理执行「${foreignSessionId}」所属 Session`]);
	});

	test("an execution reported over before its session was ever established is unavailable, not the silence of a creation", () => {
		const surface = boundSurface({ childAttached: false });

		surface.settle(settledResult({ id: EXECUTION_ID, durationMs: 360_000 }), surface.mainContext());

		// Only the running readings of a spawn whose session is still being established are left
		// unstated: a reading that reports the execution over is the last fact the host has about it,
		// and an operator has to be told it could not be attributed rather than shown nothing at all.
		const [delivery] = surface.observed;
		expect(delivery?.runtime.kind).toBe("unavailable");
		expect(delivery?.sessionId).toBe(MAIN_SESSION_ID);
		expect(delivery?.runtime.kind === "unavailable" ? delivery.runtime.reason : "").toContain(EXECUTION_ID);
	});

	test("an execution whose session was established and is then lost is unavailable rather than going quiet", () => {
		const surface = boundSurface();

		surface.progress(progressFrame({ id: EXECUTION_ID, status: "running", durationMs: 90_000 }), surface.mainContext());
		surface.detachChild();
		surface.progress(progressFrame({ id: EXECUTION_ID, status: "running", durationMs: 120_000 }), surface.mainContext());
		surface.emit("task:subagent:progress", progressPayload(EXECUTION_ID, "running", 150_000));

		// The first reading established the execution's session; the readings after that session was
		// detached are an execution this host can no longer attribute, which is a fact on the delegation
		// payloads and on the harness's own frames alike — not the silence a creation window is.
		expect(surface.observed.map(delivery => delivery.runtime.kind)).toEqual(["reading", "unavailable", "unavailable"]);
		for (const delivery of surface.observed.slice(1)) {
			expect(delivery.sessionId).toBe(MAIN_SESSION_ID);
			expect(delivery.runtime.kind === "unavailable" ? delivery.runtime.reason : "").toContain(EXECUTION_ID);
		}
	});

	test("a duration the host did not state as a usable number is unavailable, and a stated zero is a reading", () => {
		const surface = boundSurface();

		for (const durationMs of [-1, Number.NaN, null, undefined]) {
			surface.settle(settledResult({ id: EXECUTION_ID, durationMs }), surface.mainContext());
		}
		surface.settle(settledResult({ id: EXECUTION_ID, durationMs: 0 }), surface.mainContext());

		expect(surface.observed.map(delivery => delivery.runtime.kind)).toEqual([
			"unavailable",
			"unavailable",
			"unavailable",
			"unavailable",
			"reading",
		]);
		// A reliable zero is a reading the host made, and the delivery says which execution it belongs to.
		expect(surface.observed[4]?.runtime).toEqual({
			kind: "reading",
			executionId: EXECUTION_ID,
			runtimeMs: 0,
			status: "ended",
		});
	});
});

describe("the axis carries no framework behavior of its own (P13)", () => {
	test("an observation is dispatched unchanged, and the binding subscribes to nothing else for it", () => {
		const surface = boundSurface();

		surface.settle(settledResult({ id: EXECUTION_ID, durationMs: 360_000 }), surface.mainContext());

		// The binding subscribes the host's session lifecycle for its own State reconciliation, and — for
		// this axis alone — the two tool-execution facts. Nothing of the round or Turn axis is asked for,
		// because this extension observes neither.
		expect(surface.registrations.filter(event => !event.startsWith("session"))).toEqual([
			"tool_execution_update",
			"tool_execution_end",
		]);
		expect(surface.registrations).not.toContain("agent_start");
		expect(surface.registrations).not.toContain("agent_end");
		expect(surface.registrations).not.toContain("before_agent_start");
		// What reaches the handler is the fact the adapter mapped, with nothing added: no round identity,
		// no open round and no State value travels with it.
		expect(Object.keys(surface.observed[0] ?? {}).sort()).toEqual([
			"hasUI",
			"owner",
			"ownerKind",
			"parentSessionId",
			"runtime",
			"sessionId",
			"sessionKind",
			"sessionName",
			"unavailable",
		]);
	});
});
