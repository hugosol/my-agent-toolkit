/**
 * The two process positions share one observation meaning, and only the one that can run a session
 * elsewhere needs a carrier (P24, P34; S1, S2, S3; ticket 12).
 *
 * Three things are under test, and all are read at the framework's public consumption interface.
 *
 * The first is the *in-process* path: a harness whose sessions are all bindings in this process —
 * OMP's shape — is given no local access at all, so the given facts of a session leave the adapter,
 * reach the framework's own observation source and the subscribers that observe it, and create no
 * location record or endpoint on the way. What is observed is the filesystem the access would have
 * written into: the runtime directory the configuration names is never created, because nothing ever
 * offers a seat.
 *
 * The second is *equivalence*: the same given activity and context reading, stated by a process that
 * runs the session itself and delivered by a real process boundary over the framework's local access,
 * is the same observation to a consumer. The carrier is not doubled here: the delivery below opens
 * the real named pipe or socket the publisher bound, and the reading is the one the receiving
 * framework adopted, not a value the case handed it.
 *
 * The third is the reuse the contract asks a third harness to inherit (P34): both actual adapters —
 * OMP and pi — map their own native facts onto the same common interface, and the observation a
 * consumer reads from either is the same for the same facts. The harness-specific part is the
 * mapping; nothing on this path is a second set of observation or accounting rules.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { OmpExtensionApi, OmpSessionContext } from "../../adapters/omp";
import * as frameworkOmp from "../../adapters/omp";
import type { ExtensionFactory } from "../../framework/interface/details/implementation";
import type {
	SessionContextDelivery,
	SessionFacts,
	SessionObservationReader,
} from "../../framework/interface/session";
import type { OwnerReference } from "../../framework/interface/state";
import type { ObservedSession } from "../../framework/core/protocol";
import { type ExtensionDefinition, defineExtension } from "../../framework/interface";
import { createObservationDeliverer, createOwnerAccessPublisher } from "../../framework/modules/local-access";
import { portDouble } from "./support/harness-port-double";
import { boundPiSurface } from "./support/pi-surface-double";

/** The definition under test: an extension whose whole interest is the framework's observations. */
const PROBE: ExtensionDefinition = defineExtension({ id: "process-mode-probe", displayName: "processModeProbe" });

/** The session this process runs: its own main session, and the owner of the seat. */
const MAIN: SessionFacts = { sessionId: "process-mode-main", kind: "main", name: "main session", unavailable: [] };

/** The Owner those facts resolve to on the in-process harness: the main session's own key. */
const OWNER: OwnerReference = { kind: "owner", key: `main:${MAIN.sessionId}` };

/** The session the delivering process runs: one that follows the owner served here. */
const CHILD: SessionFacts = { sessionId: "process-mode-child", kind: "sub", name: "child session", unavailable: [] };

/** The activity and context every case states independently of what either path computes. */
const GIVEN_ACTIVITY = "working" as const;
const GIVEN_CONTEXT = { tokens: 12_345, provider: "official", model: "model-alpha" } as const;

/**
 * One extension that observes both reading edges, and what a case reads it through: the deliveries
 * that reached its group, the process's own observation source, and a promise that settles when a
 * context reading really arrived (the event a cross-process case awaits instead of a guessed wait).
 */
function observingProbe(): {
	readonly factory: ExtensionFactory;
	readonly observations: () => SessionObservationReader;
	readonly activity: ObservedSession[];
	readonly context: SessionContextDelivery[];
	/** Settles on the first context delivery to reach this extension's group. */
	readonly contextDelivered: Promise<void>;
} {
	const activity: ObservedSession[] = [];
	const context: SessionContextDelivery[] = [];
	const delivered = Promise.withResolvers<void>();
	let handed: SessionObservationReader | undefined;
	return {
		activity,
		context,
		contextDelivered: delivered.promise,
		observations: () => {
			if (handed === undefined) throw new Error("the probe factory never ran");
			return handed;
		},
		factory: implementation => {
			handed = implementation.session.observations;
			return {
				subscriptions: [
					{
						scope: "session",
						events: {
							session_activity: delivery => {
								const one = delivery as {
									session: SessionFacts;
									owner: OwnerReference;
									activity: ObservedSession["activity"];
								};
								activity.push({ session: one.session, owner: one.owner, activity: one.activity });
							},
							session_context: delivery => {
								context.push(delivery as SessionContextDelivery);
								delivered.resolve();
							},
						},
					},
				],
			};
		},
	};
}

/** One session as the OMP surface reports it, and the context reading its own context publishes. */
interface OmpSurfaceSession {
	readonly sessionId: string;
	readonly name?: string;
	readonly model?: { readonly id?: string; readonly provider?: string };
	readonly context?: { readonly tokens?: number };
}

/**
 * One OMP native surface: the run-lifecycle hooks the adapter registers, and the facts a case
 * delivers through them. It decides nothing — a case states every native fact.
 */
function ompSurface(): {
	readonly api: OmpExtensionApi;
	sessionStarts(session: OmpSurfaceSession): void;
	agentStarts(session: OmpSurfaceSession): void;
	messageEnds(session: OmpSurfaceSession): void;
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
			agent: { kind: "main", id: "Main", ...(session.name === undefined ? {} : { name: session.name }) },
			sessionManager: {
				getSessionId: () => session.sessionId,
				getBranch: () => [],
				...(session.name === undefined ? {} : { getSessionName: () => session.name }),
			},
			...(session.model === undefined ? {} : { model: session.model }),
			hasUI: true,
			ui: { notify: () => {}, setWidget: () => {} },
			...(session.context === undefined ? {} : { getContextUsage: () => session.context }),
		}) as unknown as OmpSessionContext;
	const deliver = (event: string, payload: unknown, session: OmpSurfaceSession): void => {
		for (const handler of [...(handlers.get(event) ?? [])]) handler(payload, contextOf(session));
	};
	return {
		api,
		sessionStarts: session => deliver("session_start", { type: "session_start", reason: "new" }, session),
		// A run starting is the native fact this adapter reads as an activity beginning.
		agentStarts: session => deliver("agent_start", { type: "agent_start" }, session),
		messageEnds: session =>
			deliver(
				"message_end",
				{ type: "message_end", message: { role: "assistant", stopReason: "stop" } },
				session,
			),
	};
}

/** One repository-shaped temporary root: the framework's configuration and the runtime dir it names. */
function workspace(): {
	readonly root: string;
	readonly configPath: string;
	readonly runtimeDirectory: string;
	dispose(): void;
} {
	const root = mkdtempSync(path.join(tmpdir(), "process-mode-reuse-"));
	const framework = path.join(root, "framework");
	mkdirSync(framework, { recursive: true });
	const configPath = path.join(framework, "config.yaml");
	writeFileSync(configPath, 'runtimeDir: ".runtime"\n', "utf8");
	return {
		root,
		configPath,
		runtimeDirectory: path.join(framework, ".runtime"),
		dispose: () => rmSync(root, { recursive: true, force: true }),
	};
}

/** Every location record under one runtime directory, as the file names a case can read. */
function recordsIn(runtimeDirectory: string): readonly string[] {
	if (!existsSync(runtimeDirectory)) return [];
	return readdirSync(runtimeDirectory).filter(name => name.startsWith("owner-access-"));
}

/** The view the OMP surface publishes for the main session, with the given reading. */
function mainView(session: SessionFacts = MAIN): OmpSurfaceSession {
	return {
		sessionId: session.sessionId,
		...(session.name === undefined ? {} : { name: session.name }),
		model: { id: GIVEN_CONTEXT.model, provider: GIVEN_CONTEXT.provider },
		context: { tokens: GIVEN_CONTEXT.tokens },
	};
}

describe("a same-process run creates no access seat and still delivers the given facts (P24)", () => {
	test("the OMP assembly keeps the reading in this process and never creates the runtime directory it names", () => {
		const ws = workspace();
		try {
			const surface = ompSurface();
			const probe = observingProbe();
			const bound = frameworkOmp.ompAdapter(PROBE, { configBaseDir: ws.root, factory: probe.factory })(surface.api);
			expect(bound.bound).toBe(true);

			// The independently given facts: this session's own start, the run it began and the
			// finalized message whose context reading is the one the host states.
			surface.sessionStarts(mainView());
			surface.agentStarts(mainView());
			surface.messageEnds(mainView());

			// The observation is delivered through the framework's common interface and held in its
			// own source: identity, activity and the context reading the host stated.
			expect(probe.observations().read(MAIN.sessionId)).toEqual({
				sessionId: MAIN.sessionId,
				session: expect.objectContaining({ sessionId: MAIN.sessionId, kind: "main" }),
				owner: OWNER,
				activity: GIVEN_ACTIVITY,
				context: GIVEN_CONTEXT,
			});
			expect(probe.activity.map(one => one.activity)).toEqual([GIVEN_ACTIVITY]);
			expect(probe.context.map(one => one.reading)).toEqual([GIVEN_CONTEXT]);

			// Nothing offered a seat: the runtime directory the configuration names was never created,
			// so there is no location record and no endpoint for another process to reach.
			expect(existsSync(ws.runtimeDirectory)).toBe(false);
			expect(recordsIn(ws.runtimeDirectory)).toEqual([]);
		} finally {
			ws.dispose();
		}
	});
});

describe("the same given facts are the same observation across the process boundary (P24)", () => {
	test("a reading delivered over the real local access is adopted as the one the in-process path holds", async () => {
		const ws = workspace();
		const publisher = createOwnerAccessPublisher({ configPath: ws.configPath });
		const probe = observingProbe();
		try {
			// The process that serves the owner: its own binding receives the seat on the owner's start.
			const double = portDouble({
				observationAccess: {
					receive: (owner, sink) => publisher.receive({ extension: PROBE.id, owner }, sink),
					deliver: () => {},
				},
			});
			expect(double.bind(PROBE, { factory: probe.factory }).bound).toBe(true);
			double.deliverSession(OWNER, { event: { kind: "session_start", reason: "initial" }, session: MAIN });

			// The reading the process that runs the session holds, stated independently: the same
			// activity and context the in-process case gave, for a session that follows this owner.
			const incoming: ObservedSession = {
				session: CHILD,
				owner: { kind: "inherited", key: OWNER.key },
				activity: GIVEN_ACTIVITY,
				context: GIVEN_CONTEXT,
			};
			const deliverer = createObservationDeliverer({
				extension: PROBE.id,
				configPath: ws.configPath,
				readings: () => [incoming],
			});
			try {
				deliverer.deliver(incoming);
				// The real event the case waits for: the reading reached the extension's group after it
				// crossed the carrier and the framework adopted it. No duration is guessed.
				await probe.contextDelivered;
			} finally {
				deliverer.dispose();
			}

			// The adopted observation is the given one: the subscriber and the source state the same
			// activity and context, and the source keeps the session's identity and direct parent.
			expect(double.observations.read(CHILD.sessionId)).toEqual({
				sessionId: CHILD.sessionId,
				session: CHILD,
				owner: { kind: "inherited", key: OWNER.key },
				activity: GIVEN_ACTIVITY,
				context: GIVEN_CONTEXT,
			});
			expect(probe.activity).toEqual([
				{ session: CHILD, owner: { kind: "inherited", key: OWNER.key }, activity: GIVEN_ACTIVITY },
			]);
			expect(probe.context.map(one => one.reading)).toEqual([GIVEN_CONTEXT]);

			// The carrier really was the framework's local access: one record and one endpoint were
			// published, and this reading reached the seat through them.
			expect(recordsIn(ws.runtimeDirectory)).toHaveLength(1);
		} finally {
			publisher.dispose();
			ws.dispose();
		}
	});
});

describe("both actual adapters map their own facts onto the same common observation interface (P34)", () => {
	test("the same activity and context reading is the observation either harness leaves", () => {
		// OMP: its own native facts through the real adapter.
		const ompSurfaceFacts = ompSurface();
		const ompProbe = observingProbe();
		const ompBound = frameworkOmp.ompAdapter(PROBE, { factory: ompProbe.factory })(ompSurfaceFacts.api);
		expect(ompBound.bound).toBe(true);
		ompSurfaceFacts.sessionStarts(mainView());
		ompSurfaceFacts.agentStarts(mainView());
		ompSurfaceFacts.messageEnds(mainView());

		// pi: its own native facts through the real adapter, with no child entry — the in-process
		// assembly whose sessions are all bindings here.
		const pi = boundPiSurface();
		const piView = {
			sessionId: MAIN.sessionId,
			name: MAIN.name,
			model: { id: GIVEN_CONTEXT.model, provider: GIVEN_CONTEXT.provider },
			context: { tokens: GIVEN_CONTEXT.tokens },
			idle: true,
			pending: false,
		};
		pi.sessionStarts(piView, "startup");
		pi.runStarts(piView);
		pi.messageEnds(piView, { role: "assistant", stopReason: "stop" });

		const ompReading = ompProbe.observations().read(MAIN.sessionId);
		const piReading = pi.implemented().session.observations.read(MAIN.sessionId);

		// The common meaning: the activity and the context reading are equal, although each adapter
		// mapped a different native vocabulary onto them.
		const ompObservation = { activity: ompReading?.activity, context: ompReading?.context };
		const piObservation = { activity: piReading?.activity, context: piReading?.context };
		expect(ompObservation).toEqual({ activity: GIVEN_ACTIVITY, context: GIVEN_CONTEXT });
		expect(piObservation).toEqual({ activity: GIVEN_ACTIVITY, context: GIVEN_CONTEXT });
		expect(piObservation).toEqual(ompObservation);

		// Both consumers read the delivered readings through the same interface, statement for
		// statement: the extension is handed the activity and the reading, not a native context.
		expect(pi.contexts.map(delivery => delivery.reading)).toEqual(ompProbe.context.map(delivery => delivery.reading));
	});
});
