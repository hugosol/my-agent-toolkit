/**
 * The owner gate: which deliveries an extension's subscription receives (S2; F8; contract
 * P11, story 25).
 *
 * An extension's subscription is owner-scoped: it receives the events of the session that is
 * its own owner, and none of a session that only inherits one or resolves no owner at all.
 * That is a rule about *subscriptions*, not about the framework's own behavior — the session
 * behavior still runs for every delivery and is a no-op for a session that owns no cell —
 * which is why it is observed here at the framework's adapter contract through the port
 * double, and at the OMP seam through the narrow native surface the loader hands the factory
 * (a subagent session resolves an owner through the runtime's agent registry and still
 * reaches no handler).
 */
import { describe, expect, test } from "bun:test";
import { CODEBASE_TOOLS } from "../../extensions/codebase-tools/definition";
import {
	type OmpExtensionApi,
	type OmpSessionContext,
	ompAdapter,
} from "../../framework/adapters/omp";
import type { OwnerReference } from "../../framework/core/protocol";
import { portDouble } from "./support/runtime-port-double";

/** The owner a delivery acts on unless one is named. */
const OWNER: OwnerReference = { kind: "owner", key: "main:owner-gate" };

/** The owner a subagent delivery resolves: the main session that spawned it. */
const INHERITED: OwnerReference = { kind: "inherited", key: "main:owner-gate-parent" };

/** A session whose parent chain leaves the process resolves no owner at all. */
const UNRESOLVED: OwnerReference = { kind: "unresolved" };

/** Runs `run` while capturing the process's stderr (the adapter's non-model channel). */
function withCapturedStderr<T>(run: () => T): { readonly stderr: string; readonly value: T } {
	const chunks: string[] = [];
	const original = process.stderr.write;
	process.stderr.write = ((chunk: string | Uint8Array) => {
		chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
		return true;
	}) as typeof process.stderr.write;
	try {
		const value = run();
		return { stderr: chunks.join(""), value };
	} finally {
		process.stderr.write = original;
	}
}

/** The owner key a recorded delivery named, with the two ownerless kinds spelled out. */
function ownerLabelOf(owner: OwnerReference): string {
	return owner.kind === "unresolved" ? "<unresolved>" : `${owner.kind}:${owner.key}`;
}

describe("a subscription receives its own owner's events and no other session's (F8, P11)", () => {
	test("the owner's own session and round edges reach its handlers", () => {
		const double = portDouble();
		const seen: string[] = [];
		double.bind(CODEBASE_TOOLS, {
			events: {
				session_start: delivery => seen.push(`session_start:${ownerLabelOf(delivery.owner)}`),
				session_end: delivery => seen.push(`session_end:${ownerLabelOf(delivery.owner)}`),
				round_start: delivery => seen.push(`round_start:${ownerLabelOf(delivery.owner)}`),
				round_end: delivery => seen.push(`round_end:${ownerLabelOf(delivery.owner)}`),
			},
		});

		double.deliverSession(OWNER);
		double.deliverRound(OWNER, { event: { kind: "round_start" } });
		double.deliverRound(OWNER, { event: { kind: "round_end" } });
		double.deliverSession(OWNER, { event: { kind: "session_end", reason: "transferred" } });

		// The gate is not a filter on the framework's own deliveries: what this owner's own
		// session produces arrives, on both axes, in order.
		expect(seen).toEqual([
			"session_start:owner:main:owner-gate",
			"round_start:owner:main:owner-gate",
			"round_end:owner:main:owner-gate",
			"session_end:owner:main:owner-gate",
		]);
	});

	test("a subagent's and an ownerless session's deliveries reach no handler", () => {
		const double = portDouble();
		const seen: string[] = [];
		double.bind(CODEBASE_TOOLS, {
			events: {
				session_start: delivery => seen.push(`session:${ownerLabelOf(delivery.owner)}`),
				round_start: delivery => seen.push(`round:${ownerLabelOf(delivery.owner)}`),
			},
		});

		// A subagent session: its State belongs to the main session it followed, so its own
		// boundaries and rounds are that owner's — and the owner is not the session that ran
		// them, which is exactly why they are not delivered here.
		double.deliverSession(INHERITED, { statePayloads: [{ enabled: true }] });
		double.deliverRound(INHERITED, { event: { kind: "round_start" } });
		// A session whose parent chain leaves the process has no owner to inherit either.
		double.deliverSession(UNRESOLVED, { statePayloads: [{ enabled: true }] });
		double.deliverRound(UNRESOLVED, { event: { kind: "round_start" } });

		expect(seen).toEqual([]);

		// The gate is per delivery, not a subscription that goes quiet: the owner's own next
		// event still arrives.
		double.deliverSession(OWNER);
		expect(seen).toEqual(["session:owner:main:owner-gate"]);
	});

	test("the framework's own behavior for a non-owner delivery still runs, and owns nothing", () => {
		const double = portDouble();
		double.bind(CODEBASE_TOOLS, { events: { session_start: () => {} } });

		const inherited = double.deliverSession(INHERITED, { statePayloads: [{ enabled: true }] });
		const unresolved = double.deliverSession(UNRESOLVED, { statePayloads: [{ enabled: true }] });

		// The gate is on the subscription, never on the reconciliation: a session that is not
		// its own owner seeds no cell and projects no area, which is the framework's behavior
		// for every such delivery whether or not a handler is subscribed.
		expect(inherited.markers).toEqual([]);
		expect(unresolved.markers).toEqual([]);
		expect(double.state.view(INHERITED.key).read("enabled")).toBe(false);
	});

	test("an owner delivery is reconciled before the gated handler runs", () => {
		const double = portDouble();
		const rendersWhenHandlerRan: string[] = [];
		double.bind(CODEBASE_TOOLS, {
			events: {
				session_start: () => rendersWhenHandlerRan.push(`${double.markerUpdates.length}`),
			},
		});

		double.deliverSession(OWNER, { statePayloads: [{ enabled: true }] });

		// The framework seeded the owner's cell and rendered its area before the handler was
		// reached: gating a subscription does not move the framework behind it.
		expect(rendersWhenHandlerRan).toEqual(["1"]);
		expect(double.state.view(OWNER.key).read("enabled")).toBe(true);
	});
});

/** One session as the native surface presents it: its agent identity and the owner it links to. */
interface NativeSession {
	readonly kind: "main" | "sub";
	readonly sessionId: string;
	/**
	 * The registry id of the spawning agent. Present for a subagent, absent for a top-level
	 * session; a subagent whose link the registry does not hold resolves no owner.
	 */
	readonly parentId?: string;
	/** The signing session whose identity the registry resolves the parent to, when it holds one. */
	readonly parentSessionId?: string;
}

/** What one native surface dispatched to the extension's subscription. */
interface GateSurface {
	/** One entry per handler delivery: `<event kind> <owner label>`. */
	readonly observed: string[];
	/** A native session lifecycle event for one session. */
	deliverSession(session: NativeSession, event?: "session_start" | "session_switch"): void;
	/** A native run start for one session. */
	startRound(session: NativeSession): void;
	/** A native run settle at quiescence for one session. */
	endRound(session: NativeSession): void;
}

/**
 * The native surface a loader hands the factory, delivering the session and run lifecycle
 * events the adapter synthesizes its edges from, and recording what the extension's own
 * subscription was handed.
 */
function gateSurface(): GateSurface {
	const observed: string[] = [];
	const sessionHandlers: Record<
		"session_start" | "session_switch",
		Array<(event: { readonly type: string }, ctx: OmpSessionContext) => void>
	> = { session_start: [], session_switch: [] };
	const roundHandlers: Record<"agent_start" | "agent_end", Array<(event: unknown, ctx: OmpSessionContext) => void>> =
		{
			agent_start: [],
			agent_end: [],
		};

	const contextOf = (session: NativeSession): OmpSessionContext => ({
		agent: {
			kind: session.kind,
			id: session.kind === "main" ? "Main" : "0-Explore",
			...(session.parentId === undefined ? {} : { parentId: session.parentId }),
		},
		sessionManager: { getSessionId: () => session.sessionId, getBranch: () => [] },
		hasUI: true,
		ui: { notify: () => {}, setWidget: () => {} },
		// A session at quiescence: a settle then closes the round it opened.
		isIdle: () => true,
		hasPendingMessages: () => false,
		getAsyncJobSnapshot: () => ({ running: [] }),
	});

	const api: OmpExtensionApi = {
		setLabel(): void {},
		registerCommand(): void {},
		appendEntry(): void {},
		on(event: string, handler: never): void {
			if (event === "session_start" || event === "session_switch") {
				sessionHandlers[event].push(handler as (event: { readonly type: string }, ctx: OmpSessionContext) => void);
			} else if (event === "agent_start" || event === "agent_end") {
				roundHandlers[event].push(handler as (event: unknown, ctx: OmpSessionContext) => void);
			}
		},
		// The runtime's own agent graph: it holds the spawning main session, and nothing else.
		pi: {
			AgentRegistry: {
				global: () => ({
					get: id =>
						id === "Main"
							? {
									id: "Main",
									kind: "main",
									session: {
										sessionManager: { getSessionId: () => "parent-session" },
									},
								}
							: undefined,
				}),
			},
		},
	};

	const factory = ompAdapter(CODEBASE_TOOLS, {
		supportedVersions: ["18.5.0"],
		events: {
			session_start: delivery => observed.push(`${delivery.event.kind} ${ownerLabelOf(delivery.owner)}`),
			session_end: delivery => observed.push(`${delivery.event.kind} ${ownerLabelOf(delivery.owner)}`),
			round_start: delivery => observed.push(`${delivery.event.kind} ${ownerLabelOf(delivery.owner)}`),
			round_end: delivery => observed.push(`${delivery.event.kind} ${ownerLabelOf(delivery.owner)}`),
		},
	});
	if (!factory(api).bound) throw new Error("the codebase-tools definition did not bind");

	const deliver = (event: string, session: NativeSession): void => {
		if (event === "session_start" || event === "session_switch") {
			for (const handler of sessionHandlers[event]) handler({ type: event }, contextOf(session));
			return;
		}
		for (const handler of roundHandlers[event as "agent_start" | "agent_end"]) {
			handler({ type: event }, contextOf(session));
		}
	};

	return {
		observed,
		deliverSession: (session, event = "session_start") => deliver(event, session),
		startRound: session => deliver("agent_start", session),
		endRound: session => deliver("agent_end", session),
	};
}

describe("the owner gate at the OMP seam (F8, P11)", () => {
	const MAIN: NativeSession = { kind: "main", sessionId: "owner-session" };

	test("a subagent's native session and round events reach the extension's subscription never", () => {
		const surface = gateSurface();
		// The subagent's owner resolves through the runtime's registry: this is not the
		// ownerless case below, it is a session that follows a main session it is not.
		const subagent: NativeSession = { kind: "sub", sessionId: "sub-session", parentId: "Main" };

		const { stderr } = withCapturedStderr(() => {
			surface.deliverSession(subagent);
			surface.startRound(subagent);
			surface.endRound(subagent);
		});

		// The owner the subagent resolves is the main session it followed, and a session that
		// is not its own owner drives no owner effect: nothing reached the subscription.
		expect(surface.observed).toEqual([]);
		// It resolved an owner, so this is not the ownerless notice either.
		expect(stderr).toBe("");
	});

	test("an ownerless session's deliveries reach the subscription never, and are reported once", () => {
		const surface = gateSurface();
		// A `/tan`-style clone: a subagent whose spawning agent the registry does not hold.
		const orphan: NativeSession = { kind: "sub", sessionId: "clone-session", parentId: "Tan-1" };

		const { stderr } = withCapturedStderr(() => {
			surface.deliverSession(orphan);
			surface.startRound(orphan);
			surface.endRound(orphan);
		});

		expect(surface.observed).toEqual([]);
		// The ownerless fact is still reported — once per binding, on the non-model channel —
		// because the extension really is off for that session; the gate changes what the
		// subscription receives, not what the operator is told.
		expect(stderr.split("\n").filter(line => line.includes("no owning main session"))).toHaveLength(1);
	});

	test("the owner's own native events still arrive, with the owner they resolved", () => {
		const surface = gateSurface();

		surface.deliverSession(MAIN);
		surface.startRound(MAIN);
		surface.endRound(MAIN);

		expect(surface.observed).toEqual([
			"session_start owner:main:owner-session",
			"round_start owner:main:owner-session",
			"round_end owner:main:owner-session",
		]);
	});
});
