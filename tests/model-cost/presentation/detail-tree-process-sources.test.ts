/**
 * The detail form's tree when the sessions under it are delivered over the *real* access, by real
 * processes (P2, P3, P9; S1, S2, S3; ticket 04).
 *
 * What this file drives is the whole path a harness that runs its subagents out of this process
 * really uses: the extension bound through the framework's public binding over the framework's own
 * local access — the serving half this process offers for the owner its session follows, built by
 * `createOwnerAccessPublisher` — and independent processes started for the sessions themselves, each
 * delivering its own observation through `openOwnerAccess` over the real named pipe or socket file.
 * Nothing here is a substitute for the carrier: the location record, the endpoint, the access's
 * verification and the boundary are the platform's own, and every wait below is a bounded wait on
 * the other process's own answer rather than a guessed duration.
 *
 * The lines a case reads are the production frontend's own — `attachModelCostWidget` drawing through
 * a controlled host — so what is asserted is the detail content an operator would see, and the
 * readings it is drawn from are the ones the delivering processes stated.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { OmpSessionContext } from "../../../adapters/omp";
import { MODEL_COST } from "../../../extensions/model-cost/definition";
import { MODEL_COST_WIDGET_KEY, attachModelCostWidget } from "../../../extensions/model-cost/harnesses/omp/widget";
import type { ConsumptionDocument } from "../../../extensions/model-cost/shared-logic/foundation/session/consumption-document"
import { DEEPSEEK_DISPLAY_BUDGET } from "../../../extensions/model-cost/shared-logic/business/context/session-context";
import type { ModelPricingData } from "../../../extensions/model-cost/shared-logic/business/pricing/model-data";
import type { ModelCostRuntime } from "../../../extensions/model-cost/shared-logic/runtime";
import { createModelCostRuntime, modelCostImplementation } from "../../../extensions/model-cost/shared-logic/runtime";
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
 * The seat this process serves, under an owner key of its own for this run.
 *
 * The key is unique per case because a seat is exactly what a location record states: a record a
 * previous run left under the same target would name an endpoint nothing serves any more, and a
 * delivering process reads a record as the seat it is looking for rather than as a stale one. Nothing
 * of the *session* under test is derived from it — a session's identity is the one its own process
 * resolves.
 */
const SEAT_OWNER = { kind: "owner", key: `main:process-sources-${randomUUID().slice(0, 8)}` } as const;

/** The owner every reading that crossed states: the seat this process serves. */
const SEAT = { kind: "inherited", key: SEAT_OWNER.key } as const;

/** The session this process serves: the tree's root. */
const MAIN: SessionFacts = { sessionId: "session-main", kind: "main", name: "主会话", unavailable: [] };

/** The main session's own current pair, which the tree below is read against. */
const MAIN_TARGET = { sessionId: "session-main", provider: "official", model: "model-alpha" } as const;

/** The child session, as the process that runs it resolves its own facts. */
const CHILD: SessionFacts = {
	sessionId: "session-child",
	kind: "sub",
	parentSessionId: MAIN.sessionId,
	name: "子代理A",
	unavailable: [],
};

/** The grandchild, as *its* process resolves them: directly below the child. */
const GRANDCHILD: SessionFacts = {
	sessionId: "session-grand",
	kind: "sub",
	parentSessionId: CHILD.sessionId,
	name: "孙代理B",
	unavailable: [],
};

/** The document this case starts from: the main session's own saved consumption and nothing below it. */
const MAIN_ONLY: ConsumptionDocument = {
	schemaVersion: 1,
	periodId: "period-process-sources",
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

/** One reading one delivering process states for the session it runs. */
function readingOf(
	session: SessionFacts,
	context: { readonly tokens: number; readonly provider: string; readonly model: string },
): ObservedSession {
	return { session, owner: SEAT, activity: "working", context };
}

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

/** One bound entry, the double over the real access, and the lines its frontend was handed. */
interface Bound {
	readonly runtime: ModelCostRuntime;
	readonly double: PortDouble;
	/** The lines the last text-form widget this host was shown held, or nothing while it drew none. */
	lines(): readonly string[] | undefined;
}

/**
 * Binds the real extension over one document, serving the seat above through the framework's own
 * local access: what a delivering process really connects to is this offer.
 */
async function bind(): Promise<Bound> {
	const root = mkdtempSync(path.join(tmpdir(), "model-cost-process-sources-"));
	roots.push(root);
	writeFileSync(path.join(root, CONSUMPTION_FILE), JSON.stringify(MAIN_ONLY), "utf8");

	// The serving half, exactly as the pi adapter builds it for a process whose sessions may run
	// elsewhere: this process offers the seat for the owner its session follows, and every reading a
	// session in another process delivers for that owner is handed to the binding's own sink.
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
	fire("session_facts", ctx);

	return { runtime: built, double, lines: () => drawn[drawn.length - 1] };
}

/** One independent process that delivers one session's reading, started over the real access. */
async function deliverInProcess(readings: readonly ObservedSession[], where: string): Promise<RunningObservationChild> {
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

afterEach(async () => {
	for (const child of children.splice(0)) await child.finish().catch(() => undefined);
	while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true });
});

describe("sessions another process runs reach the detail form over the real access (P2, P9)", () => {
	test("a child and its grandchild deliver straight to the owner's seat and are drawn three levels deep", async () => {
		const bound = await bind();
		const where = roots[roots.length - 1] as string;

		// Two independent processes, each running one of the sessions: the child's states the main
		// session as its direct parent and the grandchild's states the child. Neither goes through the
		// other — both connect to the seat this process published — and each states its own reading.
		await deliverInProcess([readingOf(CHILD, { tokens: 45_000, provider: "official", model: "model-alpha" })], where);
		await until(
			() => bound.double.observations.read(CHILD.sessionId) !== undefined,
			"the child's own process delivered nothing to the seat this process serves",
		);
		await deliverInProcess(
			[readingOf(GRANDCHILD, { tokens: 90_000, provider: "official", model: "model-alpha" })],
			where,
		);
		await until(
			() => bound.double.observations.read(GRANDCHILD.sessionId) !== undefined,
			"the grandchild's own process delivered nothing to the seat this process serves",
		);

		// Each process really reached the seat — the record and endpoint the serving half published are
		// what it connected through — so what the tree draws below is a reading that crossed a process
		// boundary rather than this process's own observation.
		const reports = await Promise.all(children.map(child => child.report()));
		expect(reports.every(report => report.reached)).toBe(true);
		expect(reports.flatMap(report => report.delivered)).toEqual([CHILD.sessionId, GRANDCHILD.sessionId]);

		const sessions = (bound.runtime.presentation.of(MAIN_TARGET).agentTree ?? []).filter(
			row => row.kind === "session",
		);
		expect(sessions.map(row => [row.name, row.depth])).toEqual([
			["子代理A", 1],
			["孙代理B", 2],
		]);
		expect(sessions[0]?.context?.tokens).toBe(45_000);
		expect(sessions[1]?.context?.tokens).toBe(90_000);

		// The drawn form shows the same three levels: the grandchild's line carries the second depth's
		// continuation bar, and neither of the two has a consumption figure of its own — no session has
		// committed anything here yet, and an unknown consumption is not a zero. The frame is the one the
		// readings themselves published: an activity that really moved is a redraw the frontend was told
		// about, so no extra draw is asked for here.
		const drawn = (bound.lines() ?? []).filter(line => line.includes("  Run: "));
		expect(drawn).toHaveLength(2);
		expect(drawn[0]).toContain("├─ 子代理A");
		expect(drawn[1]).toContain("│  └─ 孙代理B");
		expect(drawn.every(line => !line.includes("Cost:"))).toBe(true);
		expect(drawn.every(line => line.includes("Run: \u2014"))).toBe(true);
	});
});

describe("a real process's end withdraws what its readings drew, and nothing else (P6–P8)", () => {
	/** The child session's own display name, as the tree draws it and as the drawn line carries it. */
	const CHILD_NAME = "\u5B50\u4EE3\u7406A";

	/** The read-only detail result's session rows, as the tree the case reads carries them. */
	const sessionsOf = (bound: Bound) =>
		(bound.runtime.presentation.of(MAIN_TARGET).agentTree ?? []).filter(row => row.kind === "session");

	/** The drawn line of the session under test, as the frontend's own lines carry it. */
	const drawnRow = (bound: Bound): string | undefined => (bound.lines() ?? []).find(line => line.includes(CHILD_NAME));

	test("a killed process's reading is withdrawn and the row keeps its place while it loses every live reading", async () => {
		const bound = await bind();
		const where = roots[roots.length - 1] as string;
		const before = readFileSync(path.join(where, CONSUMPTION_FILE), "utf8");

		// One real process states the session it runs, and the detail form draws what arrived: the row for
		// that session, its own context reading and the working emphasis the activity reading carries.
		const child = await deliverInProcess(
			[readingOf(CHILD, { tokens: 45_000, provider: "official", model: "model-alpha" })],
			where,
		);
		await until(
			() => drawnRow(bound)?.includes("Ctx: 10% (45,000/450.0K)") === true,
			"the reading the other process stated was never drawn",
		);
		expect(sessionsOf(bound).map(row => [row.name, row.depth])).toEqual([[CHILD_NAME, 1]]);
		expect(sessionsOf(bound)[0]?.nameEmphasis).toBe("active");

		// The process is killed where it stands: it releases nothing and states nothing of its own end, and
		// what this side reads is the connection ending. The watcher below is the drawn detail itself, so
		// what the case waits for is the redraw an operator would see.
		child.kill();
		await until(() => {
			const line = drawnRow(bound);
			return line !== undefined && !line.includes("Ctx:");
		}, "the drawn detail never dropped the withdrawn context reading");

		// The row is still there, under its own name and at its own direct parent's depth, and nothing live
		// about it is drawn any more: no context and no working emphasis. What is *not* drawn is the point:
		// the session is not shown as idle, as failed or as finished, because a lost connection says
		// nothing about the work itself.
		expect(sessionsOf(bound).map(row => [row.name, row.depth])).toEqual([[CHILD_NAME, 1]]);
		expect(sessionsOf(bound)[0]?.nameEmphasis).toBeUndefined();
		expect(sessionsOf(bound)[0]?.context).toBeUndefined();
		expect(drawnRow(bound)).toMatch(/[\u251C\u2514]\u2500 \u5B50\u4EE3\u7406A/u);
		expect(drawnRow(bound)).toContain("Run: \u2014");

		// Nothing of the loss was accounted: a lost connection is no Round end, no Turn and no saving.
		expect(readFileSync(path.join(where, CONSUMPTION_FILE), "utf8")).toBe(before);
	});

	test("an earlier process's end takes none of a later process's readings, and the later end takes its own", async () => {
		const bound = await bind();
		const where = roots[roots.length - 1] as string;
		const before = readFileSync(path.join(where, CONSUMPTION_FILE), "utf8");

		// Two real processes state the same session: the one admitted first states it working on one
		// context, and the later one states it idle on another. Each reading is read as drawn before the
		// next step, so the order this case asserts is the order the seat really saw.
		const first = await deliverInProcess(
			[readingOf(CHILD, { tokens: 45_000, provider: "official", model: "model-alpha" })],
			where,
		);
		await until(
			() => drawnRow(bound)?.includes("Ctx: 10% (45,000/450.0K)") === true,
			"the first process's reading was never drawn",
		);
		const second = await deliverInProcess(
			[readingOf(CHILD, { tokens: 50_000, provider: "official", model: "model-alpha" })],
			where,
		);
		await until(
			() => drawnRow(bound)?.includes("50,000/450.0K") === true,
			"the later process's reading was never drawn",
		);

		// The earlier process releases the access it held while it lives on: the source it delivered over
		// ends, and the reading this process holds is the later process's, so nothing of the end reaches
		// the drawn row. The child's own answer is what says the release really ran, and that this run
		// reads a source's end as it should is what the step below shows, where the end withdraws a
		// reading this side does hold.
		first.send({ t: "release" });
		const released = await first.report();
		expect(released.ended).toBe(true);
		expect(sessionsOf(bound)[0]?.context).toEqual({ tokens: 50_000, budget: DEEPSEEK_DISPLAY_BUDGET });
		expect(drawnRow(bound)).toContain("Ctx: 11% (50,000/450.0K)");

		// The later process ends too, and that end is the one that withdraws the reading — the same rule,
		// from the other side.
		second.send({ t: "release" });
		await until(() => {
			const line = drawnRow(bound);
			return line !== undefined && !line.includes("Ctx:");
		}, "the drawn detail never dropped the later process's reading");
		expect(sessionsOf(bound).map(row => [row.name, row.depth])).toEqual([[CHILD_NAME, 1]]);
		expect(readFileSync(path.join(where, CONSUMPTION_FILE), "utf8")).toBe(before);
	});
});
