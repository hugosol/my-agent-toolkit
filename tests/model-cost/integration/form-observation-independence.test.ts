/**
 * The display form is a preference, and the observation is not (P23; S1, S2, S3; ticket 06).
 *
 * The entry under test declares no `follow` at all — model-cost's State declaration states no
 * inheritance — and the sessions under it are observed by the process that runs them. What this file
 * drives is that whole path for the *actual* surface: the extension bound through the framework's
 * public binding over the framework's own local access (the serving half this process offers for the
 * owner its session serves), one independent process started for the session itself and delivering
 * its own readings over the real named pipe or socket file, and the production frontend —
 * `attachModelCostWidget` — drawing through a controlled host, so the lines a case reads are the
 * lines an operator would see.
 *
 * What is asserted is what the operator's own preference promises: the brief is one form and the
 * detail another, and *which* form is drawn decides nothing about what is observed. A reading that
 * arrives while the entry draws the brief is already in this process's observation record, and the
 * flip to the detail draws it as the latest reading; flipping the form again and again neither adds a
 * second source for that session nor ends the delivering process's access, and an update delivered
 * after those flips is drawn just the same.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { OmpSessionContext } from "../../../adapters/omp";
import { MODEL_COST } from "../../../extensions/model-cost/definition";
import { MODEL_COST_WIDGET_KEY, attachModelCostWidget } from "../../../extensions/model-cost/harnesses/omp/widget";
import type { ConsumptionDocument } from "../../../extensions/model-cost/shared-logic/foundation/session/consumption-document"
import type { ModelPricingData } from "../../../extensions/model-cost/shared-logic/business/pricing/model-data";
import type { ModelCostRuntime } from "../../../extensions/model-cost/shared-logic/runtime";
import { createModelCostRuntime, modelCostImplementation } from "../../../extensions/model-cost/shared-logic/runtime";
import { stateInheritance } from "../../../framework/core/definition";
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
 * previous run left under the same target would name an endpoint nothing serves any more.
 */
const SEAT_OWNER = { kind: "owner", key: "main:form-independence" } as const;

/** The owner every reading that crossed states: the seat this process serves. */
const SEAT = { kind: "inherited", key: SEAT_OWNER.key } as const;

/** The session this process serves: the tree's root, and the session the case is displaying. */
const MAIN: SessionFacts = { sessionId: "session-main", kind: "main", name: "主会话", unavailable: [] };

/** The main session's own current pair, which the tree below is read against. */
const MAIN_TARGET = { sessionId: "session-main", provider: "official", model: "model-alpha" } as const;

/** The child session's name, as the process that runs it states it and as the drawn row carries it. */
const CHILD_NAME = "子代理A";

/** The child session, as the process that runs it resolves its own facts. */
const CHILD: SessionFacts = {
	sessionId: "session-child",
	kind: "sub",
	parentSessionId: MAIN.sessionId,
	name: CHILD_NAME,
	unavailable: [],
};

/** The document this case starts from: the main session's own saved consumption and nothing below it. */
const MAIN_ONLY: ConsumptionDocument = {
	schemaVersion: 1,
	periodId: "period-form-independence",
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
function readingOf(tokens: number): ObservedSession {
	return {
		session: CHILD,
		owner: SEAT,
		activity: "working",
		context: { tokens, provider: "official", model: "model-alpha" },
	};
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
		/* The observed event belongs to another process; there is no clock to advance for it. */
		await Bun.sleep(10);
	}
}

/** One bound entry, the double over the real access, and the lines its frontend was handed. */
interface Bound {
	readonly runtime: ModelCostRuntime;
	readonly double: PortDouble;
	/** The form the entry's own preference is in right now. */
	form(): "brief" | "detail";
	/** The lines the last text-form widget this host was shown held, or nothing while it drew none. */
	lines(): readonly string[] | undefined;
}

/**
 * Binds the real extension over one document, serving the seat above through the framework's own
 * local access, and draws it through the production frontend in the form the preference starts in.
 */
async function bind(): Promise<Bound> {
	const root = mkdtempSync(path.join(tmpdir(), "model-cost-form-independence-"));
	roots.push(root);
	writeFileSync(path.join(root, CONSUMPTION_FILE), JSON.stringify(MAIN_ONLY), "utf8");

	// The serving half, exactly as the pi adapter builds it for a process whose sessions may run
	// elsewhere: this process offers the seat for the owner its session serves, and every reading a
	// session in another process delivers for that owner is handed to the binding's own sink.
	const publisher = createOwnerAccessPublisher({ report: () => {} });
	const access: SessionObservationAccess = {
		receive: (ownerKey, sink) => publisher.receive({ extension: MODEL_COST.id, owner: ownerKey }, sink),
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

	return {
		runtime: built,
		double,
		form: () => built.presentation.of(MAIN_TARGET).form,
		lines: () => drawn[drawn.length - 1],
	};
}

/** The lines one host was drawn that carry an agent-tree row, which is what the detail form adds. */
function treeRows(lines: readonly string[] | undefined): readonly string[] {
	return (lines ?? []).filter(line => line.includes(CHILD_NAME));
}

/** Starts one independent process that delivers the readings this case asks it to, over the real access. */
function delivering(readings: readonly number[], where: string): RunningObservationChild {
	const plan: ObservationChildPlan = {
		target: { extension: MODEL_COST.id, owner: SEAT_OWNER.key },
		readings: readings.map(readingOf),
		resultPath: path.join(where, "child-report.json"),
		configPath: FRAMEWORK_CONFIG,
	};
	const child = startObservationChild(plan, { cwd: where });
	children.push(child);
	return child;
}

afterEach(async () => {
	for (const child of children.splice(0)) await child.finish().catch(() => undefined);
	while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true });
});

describe("the display form decides what is drawn, not what is observed (P23)", () => {
	test("a reading delivered during the brief is drawn by the detail, and flipping the form again changes neither the source nor the access", async () => {
		const bound = await bind();
		const where = roots[roots.length - 1] as string;

		// The extension really declares no follow field: nothing about the observations below is what a
		// State inheritance opted it into.
		expect(stateInheritance(MODEL_COST)).toBe("none");

		// The entry starts in the brief — a preference of memory, as a fresh process answers it — and the
		// brief draws no tree for the session below.
		expect(bound.form()).toBe("brief");
		expect(treeRows(bound.lines())).toEqual([]);

		// One independent process runs the session and states its own reading: its facts, its activity
		// and its context. The reading is the process that runs the session's own word, delivered to the
		// seat this process serves — during the brief, and with no display form involved anywhere.
		const child = delivering([45_000, 90_000, 120_000], where);
		await child.ready();
		child.send({ t: "deliver", index: 0 });
		await until(
			() => bound.double.observations.read(CHILD.sessionId)?.context?.tokens === 45_000,
			"the reading delivered during the brief never reached the entry's own observation record",
		);
		// The brief is still the brief: the observation is collected, not drawn.
		expect(bound.form()).toBe("brief");
		expect(treeRows(bound.lines())).toEqual([]);

		// The flip to the detail is what draws it: the row carries the latest reading the entry holds,
		// which is the one delivered while the brief was drawn.
		await bound.double.runToCompletion("budget", { args: "detail" });
		expect(bound.form()).toBe("detail");
		expect(treeRows(bound.lines())).toHaveLength(1);
		expect(treeRows(bound.lines())[0]).toContain("子代理A");
		// The drawn row's own context figure: the given 45,000 tokens against the display budget of this
		// reading's mode, whole-percent first, exactly as the extension's own form writes it.
		expect(treeRows(bound.lines())[0]).toContain("Ctx: 10% (45,000/450.0K)");
		const rows = (bound.runtime.presentation.of(MAIN_TARGET).agentTree ?? []).filter(row => row.kind === "session");
		expect(rows.map(row => [row.name, row.depth])).toEqual([[CHILD_NAME, 1]]);
		expect(rows[0]?.context?.tokens).toBe(45_000);

		// An update arrives while the detail is drawn, and the flips that follow are the preference only:
		// the same session, the same seat, the same delivering process's own access.
		child.send({ t: "deliver", index: 1 });
		await until(
			() => bound.double.observations.read(CHILD.sessionId)?.context?.tokens === 90_000,
			"the update delivered while the detail was drawn never reached the entry's own observation record",
		);
		await bound.double.runToCompletion("budget", { args: "detail" });
		await bound.double.runToCompletion("budget", { args: "detail" });
		expect(bound.form()).toBe("detail");
		expect(treeRows(bound.lines())).toHaveLength(1);
		expect(treeRows(bound.lines())[0]).toContain("Ctx: 20% (90,000/450.0K)");

		// The repeated flipping neither duplicated the source nor ended the collection: the session is
		// still one row, and the process that runs it is still delivering on the access it reached
		// before any of the flips — a reading it states now is adopted and drawn just the same.
		child.send({ t: "deliver", index: 2 });
		await until(
			() => bound.double.observations.read(CHILD.sessionId)?.context?.tokens === 120_000,
			"a reading delivered after the flips was no longer collected",
		);
		await bound.double.runToCompletion("budget", { args: "detail" });
		await bound.double.runToCompletion("budget", { args: "detail" });
		expect(bound.form()).toBe("detail");
		expect(treeRows(bound.lines())).toHaveLength(1);
		expect(treeRows(bound.lines())[0]).toContain("Ctx: 27% (120.0K/450.0K)");
		expect((bound.runtime.presentation.of(MAIN_TARGET).agentTree ?? []).filter(row => row.kind === "session")).toHaveLength(1);

		// The delivering process reached the seat once and never lost it: every reading it stated
		// crossed over that one access, which is what a connection rebuilt by a form flip could not say.
		const report = await child.report();
		expect(report.reached).toBe(true);
		expect(report.ended).toBe(false);
		expect(report.delivered).toEqual([CHILD.sessionId, CHILD.sessionId, CHILD.sessionId]);
	});
});
