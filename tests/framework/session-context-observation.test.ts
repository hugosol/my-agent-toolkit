/**
 * The context axis: the framework's own collection of each session's context reading, the common
 * interface an extension consumes it through, and the observation a consumer attaching later reads
 * (S1, S3; contract P4, P11, P12 — ticket 01).
 *
 * Three things are observed here, and none of them is the extension's business to do for itself.
 *
 * A *collection* is the adapter's: the framework subscribes the harness's own collection points only
 * when an assembly observes a reading, the adapter reads the host's public context reading there with
 * the model the session ran at that instant, and the framework records the result in its own session
 * observation source — one per extension per process, beside the State store — so that what leaves the
 * adapter is a reading and never a native context. A collection that read the numbers the source
 * already holds is not a change and is delivered to nobody.
 *
 * The *consumption* is the framework's common interface: a group that observes the reading edge
 * receives the reading as it moved, and the source a binding's factory is handed answers what was
 * collected before that binding attached. Nothing on this path is a native subscription of the
 * extension's own.
 *
 * The *first observation* is what the source is for: a consumer that attaches after a session was
 * already working reads the activity the framework's own Round edges left and the context that was
 * already collected, without waiting for a further transition — which is the one thing a delivery of
 * the moment cannot provide, because it reaches whoever was subscribed when it happened.
 *
 * What this suite drives at the adapter seam is the mapping both harnesses perform: the same given
 * sequence of native facts leaves the same observation on either host, with the model the reading was
 * collected on, and a count the host did not state is no reading at all rather than a context of zero.
 * The Turn and Round axes are not part of this file: a reading is collected at the host's own points,
 * whatever the framework decides about the work around it.
 */
import { describe, expect, test } from "bun:test";
import type { OmpExtensionApi, OmpSessionContext } from "../../adapters/omp";
import * as frameworkOmp from "../../adapters/omp";
import type { ExtensionFactory } from "../../framework/interface/details/implementation";
import type {
	SessionContextDelivery,
	SessionContextReading,
	SessionFacts,
	SessionObservationReader,
} from "../../framework/interface/session";
import type { OwnerReference } from "../../framework/interface/state";
import { type ExtensionDefinition, defineExtension } from "../../framework/interface";
import { portDouble } from "./support/harness-port-double";
import { boundPiSurface } from "./support/pi-surface-double";

/** The definition under test: an extension whose whole interest is the framework's context reading. */
const PROBE: ExtensionDefinition = defineExtension({ id: "context-probe", displayName: "contextProbe" });

/** The session a delivery is about unless a case states another one. */
const MAIN: SessionFacts = { sessionId: "session-main", kind: "main", name: "main session", unavailable: [] };

/** The owner that session is its own, as the adapter resolves it. */
const OWNER: OwnerReference = { kind: "owner", key: "main:context-observation" };

/** The independently given reading every case states, as a collection of the session's own context. */
const GIVEN: SessionContextReading = { tokens: 12_345, provider: "official", model: "model-alpha" };

/**
 * One extension that observes the reading edge, and what a case reads it through: the deliveries the
 * framework dispatched to its group, and the observation source the framework handed its factory.
 */
function contextProbe(): {
	readonly factory: ExtensionFactory;
	readonly observations: () => SessionObservationReader;
	readonly deliveries: SessionContextDelivery[];
} {
	const deliveries: SessionContextDelivery[] = [];
	let handed: SessionObservationReader | undefined;
	return {
		deliveries,
		observations: () => {
			if (handed === undefined) throw new Error("the probe factory never ran");
			return handed;
		},
		factory: context => {
			handed = context.session.observations;
			return {
				subscriptions: [{ scope: "session", events: { session_context: delivery => void deliveries.push(delivery) } }],
			};
		},
	};
}

describe("the framework collects a session's context and delivers it as the change it is (P11, P12)", () => {
	test("one collected reading reaches the group that observes it and is held in the framework's own source", () => {
		const double = portDouble();
		const probe = contextProbe();
		double.bind(PROBE, { factory: probe.factory });
		double.deliverSession(OWNER, { session: MAIN });
		double.deliverContext(OWNER, { session: MAIN, reading: GIVEN });

		// The reading arrives through the framework's common consumption interface: the edge is this
		// axis's own, it names the session and its owner, and it carries the reading rather than leaving
		// a consumer to ask for it.
		expect(probe.deliveries).toHaveLength(1);
		expect(probe.deliveries[0].event).toEqual({ kind: "session_context" });
		expect(probe.deliveries[0].session).toEqual(MAIN);
		expect(probe.deliveries[0].owner).toEqual(OWNER);
		expect(probe.deliveries[0].reading).toEqual(GIVEN);
		// The hook is the framework's: the adapter is asked to collect at its own points only because
		// this assembly observes a reading, and the source holds what it collected.
		expect(double.registrations).toContain("onSessionContext");
		expect(probe.observations().read(MAIN.sessionId)?.context).toEqual(GIVEN);
	});

	test("a collection that read the numbers the source already holds is not a change", () => {
		const double = portDouble();
		const probe = contextProbe();
		double.bind(PROBE, { factory: probe.factory });
		double.deliverSession(OWNER, { session: MAIN });
		double.deliverContext(OWNER, { session: MAIN, reading: GIVEN });
		// The same numbers read again at a later collection point the adapter collects at.
		double.deliverContext(OWNER, { session: MAIN, reading: { ...GIVEN } });

		expect(probe.deliveries).toHaveLength(1);
		// A reading that really moved is a change, and it replaces the one the source held.
		double.deliverContext(OWNER, { session: MAIN, reading: { tokens: 13_000, provider: "official", model: "model-alpha" } });
		expect(probe.deliveries).toHaveLength(2);
		expect(probe.observations().read(MAIN.sessionId)?.context).toEqual({
			tokens: 13_000,
			provider: "official",
			model: "model-alpha",
		});
	});

	test("an assembly that observes no reading asks the harness to collect none", () => {
		const double = portDouble();
		double.bind(PROBE, { subscriptions: [{ scope: "session", events: {} }] });

		expect(double.registrations).not.toContain("onSessionContext");
	});
});

describe("a consumer attaching after the session was already working (P4)", () => {
	test("reads the current activity and context without a further transition", () => {
		const double = portDouble();
		const first = contextProbe();
		double.bind(PROBE, { factory: first.factory });
		// The session is already working, and its context was already collected: both readings are the
		// framework's own — the activity its Round edge left, the reading its adapter collected.
		double.deliverSession(OWNER, { session: MAIN });
		double.deliverRound(OWNER, { session: MAIN, event: { kind: "round_start" } });
		double.deliverContext(OWNER, { session: MAIN, reading: GIVEN });
		expect(first.observations().read(MAIN.sessionId)?.activity).toBe("working");

		// A consumer attaches now. Nothing else is delivered to this binding and no state transition
		// happens for it, so what it reads it reads from the source the framework already holds.
		const second = contextProbe();
		double.bind(PROBE, { factory: second.factory });

		expect(second.observations().snapshot()).toEqual([
			{
				sessionId: MAIN.sessionId,
				session: MAIN,
				owner: OWNER,
				activity: "working",
				context: GIVEN,
			},
		]);
		// The observation is read, not re-derived: the extension received no edge of its own for a
		// session it attached to after the fact.
		expect(second.deliveries).toEqual([]);
	});

	test("the reading a consumer attaches to is the session's own, and a session nothing observed is absent", () => {
		const double = portDouble();
		const first = contextProbe();
		double.bind(PROBE, { factory: first.factory });
		double.deliverSession(OWNER, { session: MAIN });
		double.deliverContext(OWNER, { session: MAIN, reading: GIVEN });

		const second = contextProbe();
		double.bind(PROBE, { factory: second.factory });

		expect(second.observations().read(MAIN.sessionId)?.context).toEqual(GIVEN);
		// An entry the source holds nothing for is absent rather than a reading of nothing.
		expect(second.observations().read("session-never-observed")).toBeUndefined();
	});
});

/** One session as the OMP surface reports it, and the context reading its own context publishes. */
interface OmpSurfaceSession {
	readonly sessionId: string;
	readonly name?: string;
	readonly model?: { readonly id?: string; readonly provider?: string };
	/** The session's own context reading, as its context reports it; absent models a surface that states none. */
	readonly context?: { readonly tokens?: number };
	readonly hasUI?: boolean;
}

/**
 * One OMP surface a definition is bound to: the native run-lifecycle and message hooks the adapter
 * registers, and the three collection points a case delivers a session's context through.
 */
function ompSurface(): {
	readonly api: OmpExtensionApi;
	sessionStarts(session: OmpSurfaceSession): void;
	messageEnds(session: OmpSurfaceSession): void;
	/** A run starting: a native fact that is not one of this adapter's collection points. */
	agentStarts(session: OmpSurfaceSession): void;
	agentEnds(session: OmpSurfaceSession): void;
} {
	const handlers = new Map<string, Array<(event: unknown, ctx: OmpSessionContext) => unknown>>();
	const api = {
		setLabel: () => {},
		registerCommand: () => {},
		appendEntry: () => {},
		on(event: string, handler: (event: unknown, ctx: OmpSessionContext) => unknown): void {
			const list = handlers.get(event) ?? [];
			list.push(handler);
			handlers.set(event, list);
		},
	} as unknown as OmpExtensionApi;
	const contextOf = (session: OmpSurfaceSession): OmpSessionContext =>
		({
			agent: { kind: "main", id: session.sessionId, ...(session.name === undefined ? {} : { name: session.name }) },
			sessionManager: {
				getSessionId: () => session.sessionId,
				getBranch: () => [],
				...(session.name === undefined ? {} : { getSessionName: () => session.name }),
			},
			...(session.model === undefined ? {} : { model: session.model }),
			hasUI: session.hasUI ?? true,
			ui: { notify: () => {}, setWidget: () => {} },
			...(session.context === undefined ? {} : { getContextUsage: () => session.context }),
		}) as unknown as OmpSessionContext;
	const deliver = (event: string, payload: unknown, session: OmpSurfaceSession): void => {
		for (const handler of [...(handlers.get(event) ?? [])]) handler(payload, contextOf(session));
	};
	return {
		api,
		// The native facts as the runner publishes them: a start with its reason, a finalized assistant
		// message the Turn axis reads, and a settle carrying the continuation flag it states.
		sessionStarts: session => deliver("session_start", { type: "session_start", reason: "new" }, session),
		messageEnds: session =>
			deliver(
				"message_end",
				{ type: "message_end", message: { role: "assistant", stopReason: "stop" } },
				session,
			),
		agentStarts: session => deliver("agent_start", { type: "agent_start" }, session),
		agentEnds: session => deliver("agent_end", { type: "agent_end", willContinue: false }, session),
	};
}

describe("the same given sequence leaves the same observation on either harness (P11)", () => {
	/** The reading one pi binding collected for a session, as the framework's own source holds it. */
	function piReading(sessionId: string, context: { readonly tokens?: number | null }): SessionContextReading | undefined {
		const surface = boundPiSurface();
		const session = {
			sessionId,
			name: "pi context session",
			model: { id: "model-alpha", provider: "official" },
			context,
			idle: true,
			pending: false,
		};
		// The three facts this harness moves a session's own context reading at.
		surface.sessionStarts(session, "startup");
		surface.messageEnds(session, { role: "assistant", stopReason: "stop" });
		surface.runSettles(session);
		return surface.implemented().session.observations.read(sessionId)?.context;
	}

	/** The same reading on OMP, collected at that harness's own three facts. */
	function ompReading(sessionId: string, context: { readonly tokens?: number }): SessionContextReading | undefined {
		const surface = ompSurface();
		const probe = contextProbe();
		frameworkOmp.ompAdapter(PROBE, { factory: probe.factory })(surface.api);
		const session = {
			sessionId,
			name: "omp context session",
			model: { id: "model-alpha", provider: "official" },
			context,
		};
		surface.sessionStarts(session);
		surface.messageEnds(session);
		surface.agentEnds(session);
		return probe.observations().read(sessionId)?.context;
	}

	test("both harnesses collect the reading with the model the session ran then", () => {
		// The independently given sequence: one session reporting 12,345 tokens on `official/model-alpha`.
		expect(piReading("session-pi", { tokens: 12_345 })).toEqual(GIVEN);
		expect(ompReading("session-omp", { tokens: 12_345 })).toEqual(GIVEN);
		expect(piReading("session-pi", { tokens: 12_345 })).toEqual(ompReading("session-omp", { tokens: 12_345 }));
	});

	test("a count the host did not state is no reading on either harness", () => {
		// pi states an unknown context as a null count and OMP as no count at all; neither is a context
		// of zero, so neither leaves a reading rather than one of nothing.
		expect(piReading("session-pi-unknown", { tokens: null })).toBeUndefined();
		expect(piReading("session-pi-absent", {})).toBeUndefined();
		expect(ompReading("session-omp-absent", {})).toBeUndefined();
	});

	test("the reading is collected at the promised facts only", () => {
		// A run starting is not one of them: a session whose context changed since the last collection
		// keeps the reading that was collected, because nothing about this fact is a collection point.
		const pi = boundPiSurface();
		const piSession = {
			sessionId: "session-pi-timing",
			name: "pi context session",
			model: { id: "model-alpha", provider: "official" },
			context: { tokens: 12_345 },
			idle: true,
			pending: false,
		};
		pi.sessionStarts(piSession, "startup");
		pi.runStarts({ ...piSession, context: { tokens: 99_999 } });
		expect(pi.implemented().session.observations.read("session-pi-timing")?.context).toEqual(GIVEN);

		const omp = ompSurface();
		const probe = contextProbe();
		frameworkOmp.ompAdapter(PROBE, { factory: probe.factory })(omp.api);
		const ompSession = {
			sessionId: "session-omp-timing",
			name: "omp context session",
			model: { id: "model-alpha", provider: "official" },
			context: { tokens: 12_345 },
		};
		omp.sessionStarts(ompSession);
		omp.agentStarts({ ...ompSession, context: { tokens: 99_999 } });
		expect(probe.observations().read("session-omp-timing")?.context).toEqual(GIVEN);
	});
});
