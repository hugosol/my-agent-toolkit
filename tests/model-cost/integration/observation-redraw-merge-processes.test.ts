/**
 * A batch of readings that really crossed a process boundary, and what drawing it costs (P14, P15; S1,
 * S2, S3; ticket 07).
 *
 * The extension is bound here exactly as a harness whose sessions run elsewhere binds it: this process
 * serves the owner's seat through the framework's own local access (`createOwnerAccessPublisher`), and
 * an independent process delivers the readings of the sessions it runs through `openOwnerAccess`, over
 * the real named pipe. Nothing of the carrier is substituted — the location record, the endpoint and
 * the access's verification are the platform's own — and what a case reads is the production frontend's
 * frame, drawn from the readings that really arrived.
 *
 * Two things are asked of that arrival: every session's own latest reading is in the display result and
 * on the frame, and the frame count of the arrival is bounded by the readings it carried rather than
 * growing with anything the arrival did *not* change. A re-delivery of the same readings is the second
 * half of the same question: it is not a change, so it draws nothing.
 *
 * What this file does not decide is how many frames one socket arrival takes: the carrier coalesces a
 * delivering process's writes as it will, so the count below is measured and bounded rather than
 * asserted as a number the platform does not promise. The deterministic count of a batch is asserted
 * where a batch is stated rather than carried — `observation-redraw-merge.test.ts`.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { MODEL_COST } from "../../../extensions/model-cost/definition";
import { MODEL_COST_WIDGET_KEY, attachModelCostWidget } from "../../../extensions/model-cost/harnesses/omp/widget";
import type { ConsumptionDocument } from "../../../extensions/model-cost/shared-logic/foundation/session/consumption-document";
import type { ModelPricingData } from "../../../extensions/model-cost/shared-logic/business/pricing/model-data";
import type { ModelCostRuntime } from "../../../extensions/model-cost/shared-logic/runtime";
import { createModelCostRuntime, modelCostImplementation } from "../../../extensions/model-cost/shared-logic/runtime";
import type { OmpSessionContext } from "../../../adapters/omp";
import type { SessionFacts } from "../../../framework/interface/session";
import type { ObservedSession, SessionObservationAccess } from "../../../framework/runtime/port";
import { createOwnerAccessPublisher } from "../../../framework/modules/local-access";
import { type PortDouble, portDouble } from "../../framework/support/harness-port-double";
import {
	type ObservationChildPlan,
	type RunningObservationChild,
	startObservationChild,
} from "../../framework/support/observation-access-child-runner";
import { controlApi } from "../support/control-api";
import { uiBoundaryTimerOf } from "../support/ui-timer";

/** The repository root: the framework's shared configuration file is read from it. */
const REPOSITORY_ROOT = path.resolve(import.meta.dir, "..", "..", "..");

/** The framework's own shared configuration, whose `runtimeDir` both ends of the access resolve. */
const FRAMEWORK_CONFIG = path.join(REPOSITORY_ROOT, "framework", "config.yaml");

/** The self-made pricing data: one monetary tier, which is the channel the readings below are read on. */
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

const HARNESS = "probe-harness";
const CONSUMPTION_FILE = "consumption.json";

/**
 * The seat this process serves, under an owner key of its own for this run: a seat is exactly what a
 * location record states, so a record an earlier run left under the same target would name an endpoint
 * nothing serves any more.
 */
const SEAT_OWNER = { kind: "owner", key: `main:redraw-batch-${randomUUID().slice(0, 8)}` } as const;
/** The owner every reading that crossed states: the seat this process serves. */
const SEAT = { kind: "inherited", key: SEAT_OWNER.key } as const;

/** The session this process serves: the tree's root. */
const MAIN: SessionFacts = { sessionId: "session-main", kind: "main", name: "主会话", unavailable: [] };
/** The main session's own current pair, which the tree below is read against. */
const MAIN_TARGET = { sessionId: MAIN.sessionId, provider: "official", model: "model-alpha" } as const;

/** The three sessions one delivering process runs: a child of the root, its own child, and a second child. */
const CHILD: SessionFacts = {
	sessionId: "session-child",
	kind: "sub",
	parentSessionId: MAIN.sessionId,
	name: "子代理A",
	unavailable: [],
};
const GRANDCHILD: SessionFacts = {
	sessionId: "session-grand",
	kind: "sub",
	parentSessionId: CHILD.sessionId,
	name: "孙代理B",
	unavailable: [],
};
const SECOND: SessionFacts = {
	sessionId: "session-second",
	kind: "sub",
	parentSessionId: MAIN.sessionId,
	name: "子代理C",
	unavailable: [],
};

/** The document this case starts from: the main session's own saved consumption and nothing below it. */
const MAIN_ONLY: ConsumptionDocument = {
	schemaVersion: 1,
	periodId: "period-redraw-batch",
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
							"model-alpha": { tokens: { input: 1000, cacheRead: 2000, cacheWrite: 0, output: 3000 }, costCny: 0.05 },
						},
					},
				},
			],
		},
	},
} as unknown as ConsumptionDocument;

/** One reading one delivering process states for a session it runs. */
function readingOf(session: SessionFacts, tokens: number, activity: "working" | "idle"): ObservedSession {
	return { session, owner: SEAT, activity, context: { tokens, provider: "official", model: "model-alpha" } };
}

/** The batch the delivering process states: three sessions, each with its own reading. */
const BATCH: readonly ObservedSession[] = [
	readingOf(CHILD, 10_000, "working"),
	readingOf(GRANDCHILD, 20_000, "idle"),
	readingOf(SECOND, 30_000, "working"),
];

/** Every root this file created, removed after each case. */
const roots: string[] = [];
/** Every child process this file started, ended after each case. */
const children: RunningObservationChild[] = [];

/** Waits until a condition holds, or states that it never did. */
async function until(condition: () => boolean, message: string, timeoutMs = 20_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!condition()) {
		if (Date.now() > deadline) throw new Error(message);
		/* The event belongs to another process; there is no clock to advance for it. */
		await Bun.sleep(10);
	}
}

/** One bound entry, the double over the real access, and the frames its frontend was handed. */
interface Bound {
	readonly runtime: ModelCostRuntime;
	readonly double: PortDouble;
	/** How many widget frames the host drawing this session was handed, clears included. */
	frames(): number;
	/** The lines of the last widget this host was shown, or nothing while it drew none. */
	lines(): readonly string[] | undefined;
}

/** Binds the real extension over one document, serving the seat above through the framework's own access. */
async function bind(): Promise<Bound> {
	const root = mkdtempSync(path.join(tmpdir(), "model-cost-redraw-batch-"));
	roots.push(root);
	writeFileSync(path.join(root, CONSUMPTION_FILE), JSON.stringify(MAIN_ONLY), "utf8");

	const publisher = createOwnerAccessPublisher({ report: () => {} });
	const access: SessionObservationAccess = {
		receive: (ownerKey, sink) => publisher.receive({ extension: MODEL_COST.id, owner: ownerKey }, sink),
		// Nothing this process runs follows an owner served elsewhere: the session under test is the one
		// that owns the seat, so no reading of this process's own crosses anywhere.
		deliver: () => {},
	};
	const double = portDouble({ observationAccess: access });
	let runtime: ModelCostRuntime | undefined;
	double.bind(MODEL_COST, {
		config: { reader: () => `storageDir: ${root}\nbalanceTtlMs: 30000\ncodexQuotaTtlMs: 15000\n` },
		factory: modelCostImplementation(context => (runtime = createModelCostRuntime({
				config: { storageDir: root },
				configDirectory: root,
				userHomeDirectory: root,
				harness: HARNESS,
				data: DATA,
				session: context.session,
			}))),
	});
	double.deliverSession(SEAT_OWNER, { session: MAIN });
	double.deliverSession(SEAT_OWNER, { event: { kind: "session_facts" }, session: MAIN });
	await double.initiateRun(SEAT_OWNER);
	const built = runtime as ModelCostRuntime;
	await double.runToCompletion("budget", { args: "detail" });

	const drawn: Array<readonly string[] | undefined> = [];
	const ctx = {
		agent: { kind: "main", id: "Main" },
		hasUI: true,
		ui: {
			notify: () => {},
			setWidget: (key: string, content: unknown): void => {
				if (key !== MODEL_COST_WIDGET_KEY) return;
				drawn.push(content as readonly string[] | undefined);
			},
		},
		sessionManager: { getSessionId: () => MAIN.sessionId, getBranch: () => [] },
		model: { provider: "official", id: "model-alpha" },
		getViewedSession: () => ({ sessionId: MAIN.sessionId, provider: "official", model: "model-alpha" }),
		subscribeViewedSessionChanged: () => () => {},
		setTimeout: () => undefined,
		clearTimer: () => {},
	} as unknown as OmpSessionContext;
	const { api, fire } = controlApi();
	attachModelCostWidget(api, built, uiBoundaryTimerOf(built), "lines");
	fire("session_start", ctx);

	return { runtime: built, double, frames: () => drawn.length, lines: () => drawn[drawn.length - 1] };
}

/** Starts one process that delivers every reading of one plan, in the order the plan states them. */
async function startDeliveringProcess(where: string, readings: readonly ObservedSession[]): Promise<RunningObservationChild> {
	const plan: ObservationChildPlan = {
		target: { extension: MODEL_COST.id, owner: SEAT_OWNER.key },
		readings,
		resultPath: path.join(where, "child-report.json"),
		configPath: FRAMEWORK_CONFIG,
	};
	const child = startObservationChild(plan, { cwd: where });
	children.push(child);
	await child.ready();
	for (let index = 0; index < readings.length; index += 1) child.send({ t: "deliver", index });
	return child;
}

/** The drawn agent row of one session, by the name the display decided to call it. */
function drawnRow(lines: readonly string[] | undefined, name: string): string | undefined {
	return (lines ?? []).find(line => line.includes("  Run: ") && line.includes(name));
}

afterEach(async () => {
	for (const child of children.splice(0)) await child.finish().catch(() => undefined);
	while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true });
});

describe("a batch of readings that crossed a process boundary is drawn from its latest values (P15)", () => {
	test("three sessions' readings arrive over the real access and are drawn, with a bounded frame count", async () => {
		const bound = await bind();
		const where = roots[roots.length - 1] as string;
		const before = bound.frames();

		const child = await startDeliveringProcess(where, BATCH);
		await until(
			() => BATCH.every(reading => bound.double.observations.read(reading.session.sessionId) !== undefined),
			"the delivering process's readings never reached the seat this process serves",
		);
		// The readings really crossed a process boundary: the process that ran those sessions reached the
		// seat this one published, and the record and endpoint it connected through are the platform's own.
		const report = await child.report();
		expect(report.reached).toBe(true);
		expect(report.delivered).toEqual(BATCH.map(reading => reading.session.sessionId));
		await until(() => bound.frames() > before, "the arrival never drew anything at all");

		// Each reading is adopted where it arrived: the process's own source holds every one of them, with
		// the count its own host measured — before anything is drawn.
		expect(bound.double.observations.read(CHILD.sessionId)?.context?.tokens).toBe(10_000);
		expect(bound.double.observations.read(GRANDCHILD.sessionId)?.context?.tokens).toBe(20_000);
		expect(bound.double.observations.read(SECOND.sessionId)?.context?.tokens).toBe(30_000);

		// Every session's own latest reading is in the display result and on the frame, at the depth its
		// direct parent puts it.
		const sessions = (bound.runtime.presentation.of(MAIN_TARGET).agentTree ?? []).filter(row => row.kind === "session");
		expect(sessions.map(row => [row.name, row.depth, row.context?.tokens])).toEqual([
			["子代理A", 1, 10_000],
			["孙代理B", 2, 20_000],
			["子代理C", 1, 30_000],
		]);
		const drawn = bound.lines() ?? [];
		expect(drawnRow(drawn, "子代理A")).toContain("10,000");
		expect(drawnRow(drawn, "孙代理B")).toContain("20,000");
		expect(drawnRow(drawn, "子代理C")).toContain("30,000");

		// The arrival cost no more frames than the readings it carried — nothing was drawn that the
		// readings did not move. The number itself is the carrier's business (it coalesces a delivering
		// process's writes as it will), so what is asserted is the bound, and the count is recorded where
		// this case is reported.
		const drewForBatch = bound.frames() - before;
		expect(drewForBatch).toBeLessThanOrEqual(BATCH.length);
	});

	test("the same readings delivered again are not a change, and draw nothing", async () => {
		const bound = await bind();
		const where = roots[roots.length - 1] as string;
		await startDeliveringProcess(where, BATCH);
		await until(
			() => bound.double.observations.read(SECOND.sessionId) !== undefined,
			"the delivering process's readings never reached the seat this process serves",
		);
		await until(() => drawnRow(bound.lines(), "子代理C") !== undefined, "the arrival was never drawn");
		const settled = bound.frames();

		// One more process states the very same readings: the framework's source already holds them, so no
		// axis moves, nothing is published and no frame is handed over. Its own report is what says it
		// delivered them, and the wait that follows is the platform's own — a repeat has nothing
		// observable to await, so a bounded settle window is where a redraw would have arrived.
		const second = await startDeliveringProcess(where, BATCH);
		expect((await second.report()).delivered).toEqual(BATCH.map(reading => reading.session.sessionId));
		await Bun.sleep(50);

		expect(bound.frames()).toBe(settled);
		expect(bound.double.observations.read(SECOND.sessionId)?.context?.tokens).toBe(30_000);
	});
});
