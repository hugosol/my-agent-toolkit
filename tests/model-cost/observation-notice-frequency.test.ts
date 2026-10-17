/**
 * How often an observation is published, and what a turn's worth of them costs to draw (P14; S1, S3;
 * ticket 07).
 *
 * The subject is counting: a fixed sequence of the harness's own facts, a repeated reading, a real
 * streaming response and a quiet window, with the *publications* recorded rather than inferred from
 * what a terminal happened to end up showing. Three counts are kept apart, because they answer
 * different questions:
 *
 * - **collection** — where an adapter reads a reading at all. Both harnesses collect at the three
 *   facts the specification names (a session's start, a finalized message, the run that settled), so
 *   a response that streams forty chunks is read at the ends of that response and never per chunk.
 * - **publication** — what the framework hands the extension's own group. A reading that states what
 *   the framework's source already holds is not a change and is published to nobody, which is what
 *   keeps a collection point the adapter collects at repeatedly from becoming a repeated delivery.
 * - **drawing** — the frames a frontend is handed, which is the turn's own merged redraw (ticket 07's
 *   `coalesced-redraw.ts`): a quiescent process is handed none at all.
 *
 * The seams are production: the real pi and OMP adapters over controlled native surfaces, and — for
 * the counts that have to be the extension's own — the real runtime driving the real frontend through
 * the framework's public binding.
 */
import { afterEach, describe, expect, test, vi } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { MODEL_COST } from "../../extensions/model-cost/definition";
import { attachModelCostWidget } from "../../extensions/model-cost/harnesses/pi/widget";
import type { ConsumptionDocument } from "../../extensions/model-cost/shared-logic/accounting/consumption-document";
import type { ModelPricingData } from "../../extensions/model-cost/shared-logic/pricing/model-data";
import type { ModelCostRuntime } from "../../extensions/model-cost/shared-logic/runtime";
import { createModelCostRuntime } from "../../extensions/model-cost/shared-logic/runtime";
import type { OmpExtensionApi, OmpSessionContext } from "../../framework/adapters/omp";
import * as frameworkOmp from "../../framework/adapters/omp";
import { piAdapter } from "../../framework/adapters/pi";
import type { OwnerReference, SessionFacts } from "../../framework/core/protocol";
import { defineExtension, type ExtensionDefinition, type SessionContextDelivery } from "../../framework/public";
import { type PortDouble, portDouble } from "../framework/support/harness-port-double";
import { boundPiSurface, type PiSurfaceSession } from "../framework/support/pi-surface-double";
import { controlledPiSurface, type ControlledPiSurface, type HostSession } from "./support/pi-host";
import { uiBoundaryTimerOf } from "./support/ui-timer";

const HARNESS = "notice-harness";
const CONSUMPTION_FILE = "consumption.json";
/** The repository root this file's own binding resolves the extension's declaration against. */
const REPOSITORY_ROOT = path.resolve(import.meta.dir, "..", "..");

/**
 * The instant every runtime below reads the clock at.
 *
 * It is 08:00 in the data's own zone — an off-peak hour — so the pricing season a case's fake clock
 * advances through does not change under it: the one wait the UI arms is for a boundary hours away.
 */
const CLOCK_AT = Date.parse("2026-10-01T00:00:00.000Z");

/** The self-made pricing data: one monetary tier, which is all the display below needs. */
const DATA: ModelPricingData = {
	currency: "XTS",
	unit: "XTS per million tokens",
	peakMultiplier: 3,
	zoneOffsetMinutes: 8 * 60,
	peakWindows: [{ fromMinute: 9 * 60, toMinute: 12 * 60 }],
	tiers: { alpha: { input: 2, cacheRead: 0.5, output: 8 } },
	allowanceProviders: [],
	models: { official: { "model-alpha": { mode: "monetary", tier: "alpha" } } },
};

/** The main session, as its facts and as the document's own record. */
const MAIN: SessionFacts = { sessionId: "session-main", kind: "main", name: "主会话", unavailable: [] };
const OWNER: OwnerReference = { kind: "owner", key: "main:notice-frequency" };
const MAIN_DOCUMENT: ConsumptionDocument = {
	schemaVersion: 1,
	periodId: "period-notices",
	start: "2026-10-01T00:00:00.000Z",
	holiday: false,
	harnesses: {
		[HARNESS]: {
			sessions: [
				{
					id: MAIN.sessionId,
					name: MAIN.name,
					parent: null,
					saveVersion: 1,
					own: {
						official: {
							"model-alpha": { tokens: { input: 100, cacheRead: 0, cacheWrite: 0, output: 100 }, costCny: 0.001 },
						},
					},
				},
			],
		},
	},
} as unknown as ConsumptionDocument;

/** The main session as its host publishes it, with the context reading a case moves. */
const MAIN_HOST: HostSession = {
	sessionId: MAIN.sessionId,
	name: MAIN.name,
	provider: "official",
	model: "model-alpha",
	effort: "high",
	mode: "rpc",
	context: { tokens: 1000, contextWindow: 100_000 },
};

/** Every root this file created, removed after each case. */
const roots: string[] = [];

afterEach(() => {
	vi.useRealTimers();
	while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true });
});

/** One isolated storage root holding the document above. */
function isolatedRoot(label: string): string {
	const root = mkdtempSync(path.join(tmpdir(), `model-cost-${label}-`));
	roots.push(root);
	writeFileSync(path.join(root, CONSUMPTION_FILE), JSON.stringify(MAIN_DOCUMENT), "utf8");
	return root;
}

describe("publication follows the events, and a repeated reading is not one (P14)", () => {
	/**
	 * The native facts one session's own context really moves at, as the pi adapter collects them: the
	 * start that establishes the first reading, the finalized message the conversation grows by, and the
	 * run that settled. Two of the four facts below read the numbers the previous one read.
	 */
	test("a fixed sequence of collections publishes once per change and nothing for a repeat", () => {
		const surface = boundPiSurface();
		/** The same session read again at each collection point, with the count the host reports then. */
		const sessionAt = (tokens: number): PiSurfaceSession => ({
			sessionId: MAIN.sessionId,
			name: MAIN.name,
			model: { provider: "official", id: "model-alpha" },
			context: { tokens },
		});
		const readings = (): readonly (number | null | undefined)[] =>
			surface.contexts.map(delivery => delivery.reading.tokens);

		// The session's own start: the first collection, and the first reading.
		surface.sessionStarts(sessionAt(1000), "startup");
		expect(readings()).toEqual([1000]);

		// A finalized message that read the same count again — the host's own reading did not move.
		surface.startRequest(sessionAt(1000));
		surface.messageEnds(sessionAt(1000), { role: "assistant", stopReason: "toolUse" });
		expect(readings()).toEqual([1000]);

		// The conversation grew: this message's reading is a change, and it is published once.
		surface.startRequest(sessionAt(1000));
		surface.messageEnds(sessionAt(2000), { role: "assistant", stopReason: "stop" });
		expect(readings()).toEqual([1000, 2000]);

		// The run settled without the conversation moving: the third collection point reads the numbers
		// the source already holds, so nothing is published for it.
		surface.runSettles(sessionAt(2000));
		expect(readings()).toEqual([1000, 2000]);
	});

	/**
	 * The extension's own notification for the same shape: the runtime's readers are told about a
	 * changed reading and about nothing else — a repeated reading reaches no handler at all, so no
	 * message of it is ever published.
	 */
	test("the extension's own readers are notified for a change and never for a repeat", async () => {
		const bound = await bindRuntime();
		let notified = 0;
		bound.runtime.view.subscribe(() => {
			notified += 1;
		});
		const reading = (tokens: number): void => {
			bound.double.deliverContext(OWNER, {
				session: MAIN,
				reading: { tokens, provider: "official", model: "model-alpha" },
			});
		};

		reading(1000);
		await Promise.resolve();
		expect(notified).toBe(1);
		expect(bound.runtime.sessionObservations.read(MAIN.sessionId)?.context?.tokens).toBe(1000);

		// The same count again, twice, in one turn and in the next: the framework records no reading and
		// delivers none, so nothing is published and nothing is drawn.
		reading(1000);
		reading(1000);
		await Promise.resolve();
		expect(notified).toBe(1);

		// The conversation grew: one change, one notification.
		reading(2000);
		await Promise.resolve();
		expect(notified).toBe(2);
	});
});

describe("a streamed response publishes no reading per chunk (P14)", () => {
	test("forty chunk facts of one response are the one reading its message end states", () => {
		const surface = controlledOmpSurface();
		surface.sessionStarts();
		surface.agentStarts();
		surface.requestStarts();
		expect(surface.contexts()).toEqual([1000]);
		expect(surface.activities()).toEqual(["working"]);
		expect(surface.turnEdges()).toEqual(["turn_start"]);

		// The response streams: forty native chunk facts. The host's own reading of the conversation moves
		// with them — it grows with every chunk — and each fact carries the usage reported by then, which
		// is the same material the Turn axis reads its streaming readings from.
		for (let chunk = 1; chunk <= 40; chunk += 1) surface.streams(chunk);
		// Not one publication for any of them: no reading of the session's context, no activity, and no
		// further Turn edge. What limits the publication is the collection, not the stream: a collection
		// point that would read this growing count per chunk would publish every one of them.
		expect(surface.contexts()).toEqual([1000]);
		expect(surface.activities()).toEqual(["working"]);
		expect(surface.turnEdges()).toEqual(["turn_start"]);

		// The response's end is one of the three facts a reading is collected at, and it is a change.
		surface.messageEnds();
		expect(surface.contexts()).toEqual([1000, 2000]);
		expect(surface.turnEdges()).toEqual(["turn_start", "turn_end"]);

		// The run that settled collects the reading again; it did not move, so nothing more is published.
		surface.agentEnds();
		expect(surface.contexts()).toEqual([1000, 2000]);
		expect(surface.activities()).toEqual(["working", "idle"]);
	});
});

describe("a quiet process publishes nothing and arranges no repeated wait (P14)", () => {
	test("nothing is published and no frame is handed over while nothing happens", async () => {
		// The suite's clock is the fake one from before the binding, so every wait the extension arms is
		// the suite's own: a poll, a refresh interval or a re-armed timer would run inside the window
		// below rather than outliving it in real time.
		vi.useFakeTimers();
		const bound = await bindRuntime({ withFrontend: true });
		let notified = 0;
		bound.runtime.view.subscribe(() => {
			notified += 1;
		});
		// One settled Turn: its response moved the session's context reading, and the display shows it.
		bound.double.deliverTurn(
			{ kind: "request_started", session: MAIN, at: CLOCK_AT, provider: "official", model: "model-alpha" },
			{ owner: OWNER },
		);
		bound.double.deliverTurn(
			{
				kind: "response_settled",
				session: MAIN,
				at: CLOCK_AT + 60_000,
				outcome: "completed",
				readings: [{ input: 1000, output: 500, cacheRead: 0, cacheWrite: 0, totalTokens: 1500 }],
			},
			{ owner: OWNER },
		);
		bound.double.deliverContext(OWNER, {
			session: MAIN,
			reading: { tokens: 2000, provider: "official", model: "model-alpha" },
		});
		await Promise.resolve();
		const handOvers = bound.host.handOvers().length;
		const published = notified;
		expect(published).toBeGreaterThan(0);
		expect(handOvers).toBeGreaterThan(0);

		// A minute of the host's own clock with nothing happening at all.
		vi.advanceTimersByTime(60_000);
		await Promise.resolve();

		expect(bound.host.handOvers().length).toBe(handOvers);
		expect(notified).toBe(published);
		expect(bound.runtime.sessionObservations.read(MAIN.sessionId)?.context?.tokens).toBe(2000);
	});
});

/** The runtime one case drives, bound through the framework the way an assembly binds it. */
interface BoundRuntime {
	readonly runtime: ModelCostRuntime;
	readonly double: PortDouble;
	readonly host: ControlledPiSurface;
}

/**
 * The real extension over one isolated storage root, bound through the real pi adapter with the real
 * runtime, and — when a case draws — the production pi frontend attached to the same surface.
 *
 * The deliveries a case makes are the semantic ones the framework dispatches, so what this file counts
 * is the extension's own publication and drawing rather than any native mapping.
 */
async function bindRuntime(options: { readonly withFrontend?: boolean } = {}): Promise<BoundRuntime> {
	const root = isolatedRoot("notices");
	const host = controlledPiSurface();
	const double = portDouble();
	let runtime: ModelCostRuntime | undefined;
	double.bind(MODEL_COST, {
		config: { reader: () => `storageDir: ${root}\nbalanceTtlMs: 30000\ncodexQuotaTtlMs: 15000\n` },
		factory: context => {
			runtime = createModelCostRuntime({
				config: { storageDir: root },
				configDirectory: root,
				userHomeDirectory: root,
				harness: HARNESS,
				data: DATA,
				now: () => CLOCK_AT,
				sessionObservations: context.sessionObservations,
			});
			return runtime.implementation;
		},
	});
	double.deliverSession(OWNER, { session: MAIN });
	double.deliverSession(OWNER, { event: { kind: "session_facts" }, session: MAIN });
	await double.initiateRun(OWNER);
	const built = runtime as ModelCostRuntime;
	if (options.withFrontend === true) attachModelCostWidget(host.api, built, uiBoundaryTimerOf(built));
	host.sessionStarts(MAIN_HOST, "startup");
	return { runtime: built, double, host };
}

/** One controlled OMP surface: the native facts a case delivers, and the publications it recorded. */
interface ControlledOmpSurface {
	/** The context readings the framework published, by the tokens each stated. */
	contexts(): readonly number[];
	/** The activity readings the framework published, in order. */
	activities(): readonly string[];
	/** The Turn edges the framework published, in order. */
	turnEdges(): readonly string[];
	sessionStarts(): void;
	agentStarts(): void;
	/** The provider request that opens a Turn, as this host publishes it before the call. */
	requestStarts(): void;
	/** One native chunk of a streaming response, carrying the usage reported by then. */
	streams(chunk: number): void;
	messageEnds(): void;
	agentEnds(): void;
}

/** The definition this controlled OMP surface binds: it observes the readings and the edges counted above. */
const OMP_PROBE: ExtensionDefinition = defineExtension({ id: "notice-omp-probe", displayName: "noticeOmpProbe" });

/**
 * One session run on a controlled OMP surface, as the adapter reads it: the context reading a case
 * moves, and the native events the adapter's own subscriptions are handed.
 *
 * The host's next task is the suite's fake clock, because that is where the framework re-checks an end
 * candidate — the one scheduling act this adapter performs.
 */
function controlledOmpSurface(): ControlledOmpSurface {
	vi.useFakeTimers();
	const handlers = new Map<string, Array<(event: unknown, ctx: OmpSessionContext) => void>>();
	const published: SessionContextDelivery[] = [];
	const activities: string[] = [];
	const turnEdges: string[] = [];
	/** The session's own context reading, which a case moves at the facts a collection happens at. */
	const session = { sessionId: MAIN.sessionId, tokens: 1000 };

	const contextOf = (): OmpSessionContext =>
		({
			agent: { kind: "main", id: "Main" },
			sessionManager: {
				getSessionId: () => session.sessionId,
				getBranch: () => [],
				getSessionName: () => MAIN.name,
			},
			hasUI: true,
			ui: { notify: () => {}, setWidget: () => {} },
			model: { provider: "official", id: "model-alpha" },
			getContextUsage: () => ({ tokens: session.tokens }),
			isIdle: () => true,
			hasPendingMessages: () => false,
			getAsyncJobSnapshot: () => ({ running: [] }),
			getThinkingLevel: () => "high",
		}) as unknown as OmpSessionContext;

	const api = {
		setLabel: () => {},
		registerCommand: () => {},
		appendEntry: () => {},
		on(event: string, handler: (event: unknown, ctx: OmpSessionContext) => void): void {
			const listeners = handlers.get(event) ?? [];
			listeners.push(handler);
			handlers.set(event, listeners);
		},
	} as unknown as OmpExtensionApi;

	const factory = frameworkOmp.ompAdapter(OMP_PROBE, {
		factory: () => ({
			subscriptions: [
				{
					scope: "session",
					events: {
						session_context: delivery => void published.push(delivery),
						session_activity: delivery => void activities.push(delivery.activity),
						turn_start: () => void turnEdges.push("turn_start"),
						turn_end: () => void turnEdges.push("turn_end"),
					},
				},
			],
		}),
	});
	if (!factory(api).bound) throw new Error("the OMP probe definition did not bind");

	const native = (event: string, payload: unknown): void => {
		for (const listener of [...(handlers.get(event) ?? [])]) listener(payload, contextOf());
	};

	return {
		contexts: () => published.map(delivery => delivery.reading.tokens),
		activities: () => activities,
		turnEdges: () => turnEdges,
		sessionStarts: () => native("session_start", { type: "session_start" }),
		agentStarts: () => native("agent_start", { type: "agent_start" }),
		requestStarts: () => native("before_provider_request", { type: "before_provider_request" }),
		// One chunk of the response's body: the native per-delta fact, with the usage reported by then.
		// The session's own context reading grows with the response, exactly as a host's does while a
		// message accumulates — the adapter's collection points, not the stream, decide when it is read.
		streams: chunk => {
			session.tokens = 1000 + chunk;
			native("message_update", {
				type: "message_update",
				message: { role: "assistant", usage: { input: 1000, output: chunk, totalTokens: 1000 + chunk } },
			});
		},
		messageEnds: () => {
			session.tokens = 2000;
			native("message_end", { type: "message_end", message: { role: "assistant", stopReason: "stop" } });
		},
		agentEnds: () => {
			native("agent_end", { type: "agent_end", willContinue: false });
			// The framework confirms an end candidate on the harness's own next task.
			vi.runAllTimers();
		},
	};
}
