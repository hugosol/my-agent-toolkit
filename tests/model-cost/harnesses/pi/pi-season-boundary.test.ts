/**
 * The peak/valley boundary wait of a pi UI, on its own timer, and the effects it does not have
 * (S2、S3; contract P45, plus P57's own boundary-redraw item).
 *
 * The seam is production: the extension's real definition is bound through the framework's real pi
 * adapter to controlled pi surfaces — a session context publishing whatever facts a case states and a
 * `setWidget` that records every frame — the runtime is the one `createModelCostRuntime` builds with its
 * own clock injected (so the boundary instants below are hand-computed facts of a controlled time, not
 * whatever the wall clock says while this suite runs), the frontend is the production
 * `attachModelCostWidget`, and the wait it registers with is the process's one timer composed exactly as
 * the shipped assembly composes it. The timer queue itself is faked, and a case advances the clock and
 * the queue together: pi publishes no timer on its context, so the wait this frontend owns is a raw
 * platform one-shot, and how far a case advances is the instant it is armed for — one millisecond short
 * of a boundary draws nothing, the millisecond past it is one redraw.
 *
 * The schedule every expected delay comes from is the fixture's own two windows in the data's +08:00
 * zone — [09:00, 12:00] and [14:00, 18:00], inclusive at both ends, so the first off-peak millisecond
 * of the midday window is 12:00:00.001 and the afternoon window opens on 14:00:00.000 — and every figure
 * below is computed by hand from the instant a case sets.
 *
 * The negative half is as important as the positive one. The storage root is a real one holding a real
 * document, so a case compares what a boundary redraw leaves behind outside the widget: the document's
 * own bytes and modification instant, every entry the root holds, the accounting the display reads, and
 * the outbound calls the extension's provider queries would make. A boundary redraw is expected to
 * change none of them, and the drawing itself is expected to have happened — the frames a case counts
 * are what keeps those comparisons from being a statement about a redraw that never ran.
 *
 * The order the cases drive is pi's own: the session starts first, and the framework's one-time
 * initialization — the node model-cost's own document is loaded at — follows it. That is what makes a
 * case's schedule a fact of the period the storage root really holds: the wait a start arms from the
 * calendar alone is reconsidered from the loaded period as soon as the instance has one, which the
 * holiday case below states in both directions.
 */
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { piAdapter } from "../../../../adapters/pi";
import { MODEL_COST } from "../../../../extensions/model-cost/definition";
import { MODEL_COST_HARNESS, cleanupModelCostPi } from "../../../../extensions/model-cost/harnesses/pi";
import { attachModelCostWidget } from "../../../../extensions/model-cost/harnesses/pi/widget";
import type { ConsumptionDocument } from "../../../../extensions/model-cost/shared-logic/foundation/session/consumption-document";
import type { ModelPricingData } from "../../../../extensions/model-cost/shared-logic/business/pricing/model-data";
import {
	type ModelCostRuntime,
	createModelCostRuntime,
	modelCostImplementation,
} from "../../../../extensions/model-cost/shared-logic/runtime";
import { type ControlledPiSurface, type HostSession, controlledPiSurface } from "../../support/pi-host";
import { uiBoundaryTimerOf } from "../../support/ui-timer";

/** The repository root, from this file's own location, so the adapter resolves the real declaration. */
const REPOSITORY_ROOT = path.resolve(import.meta.dir, "..", "..", "..", "..");

/** The self-made price list: one monetary tier and the two workday windows of the data's own zone. */
const DATA: ModelPricingData = {
	currency: "XTS",
	unit: "XTS per million tokens",
	peakMultiplier: 3,
	zoneOffsetMinutes: 8 * 60,
	peakWindows: [
		{ fromMinute: 9 * 60, toMinute: 12 * 60 },
		{ fromMinute: 14 * 60, toMinute: 18 * 60 },
	],
	tiers: { alpha: { input: 2, cacheRead: 0.5, output: 8 } },
	allowanceProviders: [],
	models: { official: { "model-alpha": { mode: "monetary", tier: "alpha" } } },
};

const CONSUMPTION_FILE = "consumption.json";

/** The instant every case starts from: Thursday 2026-10-01 11:00 in the data's +08:00 zone, peak. */
const PEAK_AT = Date.parse("2026-10-01T03:00:00.000Z");
/** The instant the midday window's endpoint passes: 12:00:00.000 in the zone, still peak. */
const ENDPOINT_AT = Date.parse("2026-10-01T04:00:00.000Z");
/** The instant the small hours of the following day hold: 13:30 in the zone, off-peak. */
const AFTER_SLEEP_AT = Date.parse("2026-10-01T05:30:00.000Z");
/** One minute in milliseconds, for the hand-computed delays below. */
const MINUTE_MS = 60_000;
/** One hour in milliseconds. */
const HOUR_MS = 60 * MINUTE_MS;

/** The three marks the account row leads with, as the display states them. */
const PEAK_MARK = "\u{1F525}";
const VALLEY_MARK = "\u{1F319}";
const HOLIDAY_MARK = "\u{1F3D6}\u{FE0F}";

/** The main session's own id: the one the loaded document holds a record for. */
const MAIN_SESSION_ID = "session-main";

/** The document every case loads: the main session's own accrual, in an ordinary or holiday period. */
const DOCUMENT = (holiday: boolean): ConsumptionDocument =>
	({
		schemaVersion: 1,
		periodId: "period-pi-season-boundary",
		start: "2026-10-01T00:00:00.000Z",
		holiday,
		harnesses: {
			[MODEL_COST_HARNESS]: {
				sessions: [
					{
						id: MAIN_SESSION_ID,
						name: "主会话",
						parent: null,
						saveVersion: 1,
						own: {
							official: {
								"model-alpha": {
									tokens: { input: 1000, cacheRead: 2000, cacheWrite: 0, output: 3000 },
									costCny: 0.05,
								},
							},
						},
					},
				],
			},
		},
	}) as unknown as ConsumptionDocument;

/** Every root this file created, removed after each case. */
const roots: string[] = [];

/** The clock a case drives: the instant source the runtime under test reads. */
interface Clock {
	now: number;
}

/**
 * The session the terminal is in: the main session of this process, drawn in the text form its RPC run
 * takes, with the model its price list amounts for.
 */
const MAIN_HOST: HostSession = {
	sessionId: MAIN_SESSION_ID,
	name: "主会话",
	provider: "official",
	model: "model-alpha",
	effort: "high",
	mode: "rpc",
	context: { tokens: 1_000, contextWindow: 64_000 },
};

/**
 * The session the subagent provider spawns, as pi binds it: its own session, and no UI of its own —
 * pi's session runner binds no UI context for a session a provider created.
 */
const CHILD_HOST: HostSession = { ...MAIN_HOST, sessionId: "session-child", name: "子代理", hasUI: false };

/** Everything one case works with, and everything it observes outside the widget. */
interface Fixture {
	readonly runtime: ModelCostRuntime;
	readonly surface: ControlledPiSurface;
	readonly child: ControlledPiSurface | undefined;
	readonly root: string;
	readonly clock: Clock;
	/** How many outbound calls the extension's own provider queries made in this process. */
	requests(): number;
	/** The storage root exactly as the file system holds it right now. */
	storage(): StorageSnapshot;
	/** The main session's own start, whose delivery the frontend registers its wait on. */
	startSession(session?: HostSession): void;
	/** The framework's one-time initialization, awaited: the node the document is loaded at. */
	loadInstance(): Promise<void>;
	/** The session's start and the initialization that follows it, awaited. */
	initialize(): Promise<void>;
	/** The frontends' own release, which the binding's one cleanup reaches in production. */
	release(): void;
}

/**
 * One process's model-cost over an isolated storage root, bound to a controlled pi surface — and to the
 * session a provider spawned, when a case states one — with the production frontend attached to the
 * process's one boundary wait.
 *
 * The document is written before the binding reads it, so the period every schedule below is read from
 * is the one this case states — ordinary or holiday — rather than a root the store had to invent. Both
 * bindings share this process's one runtime and this UI's one wait, exactly as two sessions of one pi
 * process do: the framework's factory runs once per process, and the assembly composes the timer once.
 */
function fixture(options: { readonly holiday?: boolean; readonly at?: number; readonly child?: boolean } = {}): Fixture {
	const root = mkdtempSync(path.join(tmpdir(), "pi-season-"));
	roots.push(root);
	writeFileSync(path.join(root, CONSUMPTION_FILE), JSON.stringify(DOCUMENT(options.holiday ?? false)), "utf8");
	const clock: Clock = { now: options.at ?? PEAK_AT };
	let requests = 0;
	let runtime: ModelCostRuntime | undefined;
	const bind = piAdapter(MODEL_COST, {
		configBaseDir: REPOSITORY_ROOT,
		implementation: modelCostImplementation(context => {
			runtime ??= createModelCostRuntime({
				// The framework's own read of the declared configuration is what its shape is validated
				// against; the root is this file's, so no case writes where the shipped declaration points.
				config: { ...context.config, storageDir: root },
				configDirectory: path.join(REPOSITORY_ROOT, "extensions", MODEL_COST.id),
				userHomeDirectory: root,
				harness: MODEL_COST_HARNESS,
				data: DATA,
				session: context.session,
				now: () => clock.now,
				httpRequest: () => {
					requests += 1;
					return Promise.resolve({ ok: false as const, failure: { kind: "transport" as const, error: new Error("this suite makes no request") } });
				},
			});
			return runtime;
		}),
	});
	const surface = controlledPiSurface();
	const child = options.child === true ? controlledPiSurface() : undefined;
	for (const each of child === undefined ? [surface] : [surface, child]) {
		if (!bind(each.api).bound) throw new Error("the model-cost binding was refused");
	}
	const built = runtime as ModelCostRuntime;
	const timer = uiBoundaryTimerOf(built);
	const releases = [surface, ...(child === undefined ? [] : [child])].map(each =>
		attachModelCostWidget(each.api, built, timer),
	);
	const startSession = (session: HostSession = MAIN_HOST): void => surface.sessionStarts(session);
	return {
		runtime: built,
		surface,
		child,
		root,
		clock,
		requests: () => requests,
		storage: () => storageOf(root),
		startSession,
		loadInstance: async () => {
			await surface.runInitiates(MAIN_HOST);
		},
		initialize: async () => {
			startSession();
			await surface.runInitiates(MAIN_HOST);
		},
		release: () => {
			for (const release of releases) release();
		},
	};
}

/** One reading of the storage root: the entries it holds and the document's own bytes and instant. */
interface StorageSnapshot {
	readonly entries: readonly string[];
	readonly document: string;
	readonly modifiedAt: number;
}

/** The storage root as the file system holds it, for the before/after comparisons a case makes. */
function storageOf(root: string): StorageSnapshot {
	const file = path.join(root, CONSUMPTION_FILE);
	return {
		entries: readdirSync(root).sort(),
		document: readFileSync(file, "utf8"),
		modifiedAt: statSync(file).mtimeMs,
	};
}

/**
 * One advance of the controlled time: the clock the business reads and the timer queue the UI's own
 * one-shot sits in move together, exactly as they do in a process that was not blocked between them.
 */
function advanceBy(clock: Clock, milliseconds: number): void {
	clock.now += milliseconds;
	vi.advanceTimersByTime(milliseconds);
}

/** The frames a surface was handed, which is one per drawing and one for the widget's clear. */
function frames(surface: ControlledPiSurface): number {
	return surface.handOvers().length;
}

/** The lines the surface was drawn with last, or a failure when it holds no widget at all. */
function drawn(surface: ControlledPiSurface): readonly string[] {
	const lines = surface.lines();
	if (lines === undefined) throw new Error("the frontend drew no widget at all");
	return lines;
}

/** Whether the widget's account row leads with that season's own mark, as the display drew it. */
function leadsWith(surface: ControlledPiSurface, mark: string): boolean {
	return (drawn(surface)[0] as string).startsWith(mark);
}

beforeEach(() => {
	// The wait this frontend owns is a raw platform one-shot — pi publishes no timer on its context — so
	// the timer queue is this suite's: an advance is what fires it, and how far a case advances is the
	// instant it was armed for.
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

afterAll(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("the pi UI waits once for the next season change on its own timer (P45)", () => {
	test("the wait is armed once, for the first instant after the endpoint, and the redraw lands there", async () => {
		const bound = fixture();
		await bound.initialize();

		// 11:00 in the zone is inside the midday window, and that window's endpoint is inclusive: the
		// first instant whose season differs is 12:00:00.001. One wait was armed for exactly that
		// distance — not one per session, one per redraw or one per drawing form — and the peak season
		// is already drawn.
		expect(vi.getTimerCount()).toBe(1);
		expect(leadsWith(bound.surface, PEAK_MARK)).toBe(true);
		const settled = frames(bound.surface);

		// The endpoint itself is still peak: one millisecond short of the change this UI draws what it
		// already drew, and the very next millisecond is a redraw of the off-peak season.
		advanceBy(bound.clock, HOUR_MS);
		expect(frames(bound.surface)).toBe(settled);
		advanceBy(bound.clock, 1);
		expect(frames(bound.surface)).toBe(settled + 1);
		expect(leadsWith(bound.surface, VALLEY_MARK)).toBe(true);
	});

	test("a reading exactly on the endpoint waits one millisecond, and the wait after it is the next window's own edge", async () => {
		const bound = fixture({ at: ENDPOINT_AT });
		await bound.initialize();

		// 12:00:00.000 itself is still peak, so the season changes one millisecond later — not four hours
		// until the afternoon window opens. The redraw at 12:00:00.001 then waits for 14:00:00.000, whose
		// opening edge is inclusive: two hours less one millisecond after the instant it read, and no
		// sooner.
		const settled = frames(bound.surface);
		advanceBy(bound.clock, 1);
		expect(frames(bound.surface)).toBe(settled + 1);
		expect(leadsWith(bound.surface, VALLEY_MARK)).toBe(true);

		advanceBy(bound.clock, 2 * HOUR_MS - 1 - 1);
		expect(frames(bound.surface)).toBe(settled + 1);
		advanceBy(bound.clock, 1);
		expect(frames(bound.surface)).toBe(settled + 2);
		expect(leadsWith(bound.surface, PEAK_MARK)).toBe(true);
	});

	test("a boundary the process slept through is corrected from the actual clock, never replayed", async () => {
		const bound = fixture();
		await bound.initialize();

		// The process was blocked through the boundary it armed for: the clock now reads 13:30 in the
		// zone, off-peak, and the callback runs then. The redraw shows the season as it is now, and the
		// next wait is measured from that actual instant — 14:00:00.000 is thirty minutes away, not the
		// hour the missed boundary would have left if the schedule were replayed.
		const settled = frames(bound.surface);
		bound.clock.now = AFTER_SLEEP_AT;
		vi.advanceTimersByTime(HOUR_MS + 1);
		expect(frames(bound.surface)).toBe(settled + 1);
		expect(leadsWith(bound.surface, VALLEY_MARK)).toBe(true);

		advanceBy(bound.clock, 30 * MINUTE_MS - 1);
		expect(frames(bound.surface)).toBe(settled + 1);
		advanceBy(bound.clock, 1);
		expect(frames(bound.surface)).toBe(settled + 2);
		expect(leadsWith(bound.surface, PEAK_MARK)).toBe(true);
	});

	test("a holiday period has no boundary ahead of it, and the wait a start had armed is dropped once the period is loaded", async () => {
		const bound = fixture({ holiday: true });
		bound.startSession();

		// The start alone reads the calendar, whose windows are ahead of every ordinary instant: one wait
		// is armed for the instant the midday window's endpoint passes.
		expect(vi.getTimerCount()).toBe(1);

		// The instance's own document then says this period is a holiday, and every instant of it is
		// off-peak: the wait is reconsidered and dropped rather than left behind, and the period's own
		// mark is what the row carries.
		await bound.loadInstance();
		expect(vi.getTimerCount()).toBe(0);
		expect(leadsWith(bound.surface, HOLIDAY_MARK)).toBe(true);

		const loaded = frames(bound.surface);
		advanceBy(bound.clock, 6 * HOUR_MS);
		expect(frames(bound.surface)).toBe(loaded);
	});
});

describe("the wait belongs to the UI's lifetime, not to a session's (P45)", () => {
	test("a session whose context publishes no UI draws nothing and arms nothing", async () => {
		const bound = fixture();
		bound.startSession({ ...MAIN_HOST, hasUI: false });
		await bound.loadInstance();

		// No UI means no widget and no drawing timer at all: the business result behind it is untouched.
		expect(vi.getTimerCount()).toBe(0);
		expect(frames(bound.surface)).toBe(0);
		advanceBy(bound.clock, 6 * HOUR_MS);
		expect(frames(bound.surface)).toBe(0);
	});

	test("a spawned session's own binding holds no wait, and the process's one wait is the UI's", async () => {
		const bound = fixture({ child: true });
		await bound.initialize();
		const child = bound.child as ControlledPiSurface;
		child.sessionStarts(CHILD_HOST);
		const before = frames(bound.surface);

		// The spawned session's binding is the same process's, and its context publishes no UI: it draws
		// nothing and arms nothing of its own. The one wait there is belongs to the session the terminal
		// is in, so the boundary redraws that one and reaches no other binding.
		expect(frames(child)).toBe(0);
		expect(vi.getTimerCount()).toBe(1);

		advanceBy(bound.clock, HOUR_MS + 1);
		expect(frames(bound.surface)).toBe(before + 1);
		expect(leadsWith(bound.surface, VALLEY_MARK)).toBe(true);
		expect(frames(child)).toBe(0);
	});

	test("a session starting again keeps one wait rather than a second", async () => {
		const bound = fixture();
		await bound.initialize();
		const before = frames(bound.surface);
		bound.startSession();

		// A reload draws again and re-registers the same session; the wait is still one, and it is still
		// armed for the boundary the schedule states.
		expect(frames(bound.surface)).toBe(before + 1);
		expect(vi.getTimerCount()).toBe(1);

		advanceBy(bound.clock, HOUR_MS);
		expect(frames(bound.surface)).toBe(before + 1);
		advanceBy(bound.clock, 1);
		expect(frames(bound.surface)).toBe(before + 2);
	});

	test("the frontend's own release cancels the wait it holds and clears the widget", async () => {
		const bound = fixture();
		await bound.initialize();
		expect(vi.getTimerCount()).toBe(1);
		const drawnFrames = frames(bound.surface);

		// The release is the frontend's own half, and it is what the binding's one cleanup reaches in
		// production (the case below): the timer it owns is cleared and the widget is given up, so the
		// boundary instant it was waiting for draws nothing at all.
		bound.release();
		expect(vi.getTimerCount()).toBe(0);
		expect(bound.surface.lines()).toBeUndefined();

		advanceBy(bound.clock, 6 * HOUR_MS);
		expect(frames(bound.surface)).toBe(drawnFrames + 1);
	});

	test("the instance's own cleanup releases the frontend first and forgets it", () => {
		const order: string[] = [];
		const frontendReleases = new Set<() => void>([() => void order.push("frontend")]);
		// Only the cleanup slot is exercised; the rest of the runtime's surface is not reached.
		const runtime = { cleanup: () => void order.push("instance") } as unknown as ModelCostRuntime;

		cleanupModelCostPi(runtime, frontendReleases);

		// The dispose front-end is the framework's — its one cleanup, run when the session that
		// initialized the instance ends — so this is the whole of what reaches this process's frontends:
		// each frontend is released first, the record of it is dropped, and the instance's own cleanup
		// then runs, so nothing is drawn through an accumulation that is being closed.
		expect(order).toEqual(["frontend", "instance"]);
		expect(frontendReleases.size).toBe(0);
	});
});

describe("a boundary redraw changes nothing but the season it drew (P45; P57)", () => {
	test("neither the redraw nor the boundary it waited for reaches the network, the accounting or the file", async () => {
		const bound = fixture();
		await bound.initialize();
		const wasDrawn = drawn(bound.surface);
		const own = bound.runtime.view.own(MAIN_SESSION_ID);
		const before = bound.storage();
		// The loaded document's own record is what the display reads for this session, so the accumulation
		// the comparison below is about is a real one rather than an absent reading.
		expect(own).toEqual({
			official: { "model-alpha": { tokens: { input: 1000, cacheRead: 2000, cacheWrite: 0, output: 3000 }, costCny: 0.05 } },
		});

		// The boundary really redrew this UI: the frame count moved, the row leads with the other season,
		// and every other field of every line is the one the previous drawing carried.
		const settled = frames(bound.surface);
		advanceBy(bound.clock, HOUR_MS + 1);
		expect(frames(bound.surface)).toBe(settled + 1);
		const nowDrawn = drawn(bound.surface);
		expect(nowDrawn[0]).toBe((wasDrawn[0] as string).replace(PEAK_MARK, VALLEY_MARK));
		expect(nowDrawn.slice(1)).toEqual(wasDrawn.slice(1));

		// No request was made, nothing was published — the document's bytes and modification instant are
		// what they were and the root holds exactly the entries it held — and the accumulation the
		// display reads did not move.
		expect(bound.requests()).toBe(0);
		expect(bound.storage()).toEqual(before);
		expect(bound.runtime.view.own(MAIN_SESSION_ID)).toEqual(own);

		// The reading those last two comparisons are made of is not one nothing can move: a document
		// published into this root by another process is exactly what the storage comparison reports, and
		// a settled Turn of this session is what its own accounting answers with.
		writeFileSync(path.join(bound.root, CONSUMPTION_FILE), `${JSON.stringify(DOCUMENT(false))}\n`, "utf8");
		expect(bound.storage()).not.toEqual(before);
		bound.surface.turnSettles(MAIN_HOST, { input: 10, output: 10 });
		expect(bound.runtime.view.own(MAIN_SESSION_ID)).not.toEqual(own);
	});
});
