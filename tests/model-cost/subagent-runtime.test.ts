/**
 * One subagent session's accumulated native runtime: how the harness's own per-execution durations
 * become the figure on that session's one detail row and in its own consumption record (S1, S2, S3;
 * contract P11, P12, P13, P14, P15, P16, P17, P18, P19, P22, P24, P35, P36).
 *
 * The seams are the production ones throughout: the extension's real definition bound through the
 * framework's public binding (the port double, `tests/framework/support/harness-port-double.ts`),
 * the real runtime built by a factory exactly as the OMP assembly builds it, the real consumption
 * document read back from the disk this extension actually wrote, and `runtime.presentation.of(target)`
 * — the read-only display result a frontend reads. No private field is reached and no formatting
 * helper of the implementation is called to compute an expectation.
 *
 * Every expectation is a hand-computed literal from this file's own records and readings. The native
 * durations the cases deliver are the host's own measurements, as an adapter would map them: a
 * reading names the execution it belongs to and the milliseconds that execution had run. What the
 * cases never do is stand in for one: no wall-clock span, no self-made timer and no formatted text
 * appears anywhere in an expectation, because a runtime that came from one of those would pass a test
 * written the same way the implementation computed it.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { MODEL_COST } from "../../extensions/model-cost/definition";
import type { ConsumptionDocument } from "../../extensions/model-cost/shared-logic/consumption-document";
import type { ModelPricingData } from "../../extensions/model-cost/shared-logic/model-data";
import type { ModelCostRuntime } from "../../extensions/model-cost/shared-logic/runtime";
import { createModelCostRuntime } from "../../extensions/model-cost/shared-logic/runtime";
import type { OwnerReference, SessionFacts, SubagentRuntimeFact } from "../../framework/core/protocol";
import { type PortDouble, portDouble } from "../framework/support/harness-port-double";

/** The self-made pricing data: one monetary tier and one token-only pair. */
const DATA: ModelPricingData = {
	currency: "XTS",
	unit: "XTS per million tokens",
	peakMultiplier: 2,
	zoneOffsetMinutes: 8 * 60,
	peakWindows: [{ fromMinute: 9 * 60, toMinute: 12 * 60 }],
	tiers: { alpha: { input: 2, cacheRead: 0.5, output: 8 } },
	allowanceProviders: [],
	models: {
		official: { "model-alpha": { mode: "monetary", tier: "alpha" } },
		"go-provider": { "model-alpha": { mode: "token-only" } },
	},
};

const HARNESS = "probe-harness";
const CONSUMPTION_FILE = "consumption.json";
const MAIN: SessionFacts = { sessionId: "session-main", kind: "main", name: "主会话", unavailable: [] };
const CHILD: SessionFacts = { sessionId: "session-child", kind: "sub", name: "子代理", unavailable: [] };
const GRAND: SessionFacts = { sessionId: "session-grand", kind: "sub", name: "孙代理", unavailable: [] };
const OWNER: OwnerReference = { kind: "owner", key: "main:runtime" };
const MAIN_TARGET = { sessionId: "session-main", provider: "official", model: "model-alpha" } as const;

/** The main session's own current pair, priced by the data's own off-peak tier. */
const MAIN_OWN = {
	official: { "model-alpha": { tokens: { input: 1000, cacheRead: 500, cacheWrite: 0, output: 2000 }, costCny: 0.05 } },
};

/** The child session's own consumption, on the token-only pair: no amount policy at all. */
const CHILD_OWN = {
	"go-provider": { "model-alpha": { tokens: { input: 30, cacheRead: 20, cacheWrite: 0, output: 50 } } },
};

/** The grandchild's own consumption, on the monetary pair. */
const GRAND_OWN = {
	official: { "model-alpha": { tokens: { input: 7, cacheRead: 3, cacheWrite: 0, output: 4 }, costCny: 0.5 } },
};

/** Every root this file created, removed after each case. */
const roots: string[] = [];

/** One record of a baseline document, as the approved schema writes it. */
function record(
	id: string,
	parent: string | null,
	own: Record<string, Record<string, unknown>>,
	runtimeMs?: number,
): Record<string, unknown> {
	return { id, name: id === "session-child" ? "子代理" : id, parent, saveVersion: 1, own, ...(runtimeMs === undefined ? {} : { runtimeMs }) };
}

/** The three-session tree every case reads, unless it states its own. */
function baseline(sessions?: readonly Record<string, unknown>[]): ConsumptionDocument {
	return {
		schemaVersion: 1,
		periodId: "period-runtime",
		start: "2026-10-01T00:00:00.000Z",
		holiday: false,
		harnesses: {
			[HARNESS]: {
				sessions: sessions ?? [
					record("session-main", null, MAIN_OWN),
					record("session-child", "session-main", CHILD_OWN),
					record("session-grand", "session-child", GRAND_OWN),
				],
			},
		},
	} as unknown as ConsumptionDocument;
}

/** One bound instance and the double that drives it. */
interface Bound {
	readonly runtime: ModelCostRuntime;
	readonly double: PortDouble;
	readonly root: string;
	readonly consumptionFile: string;
}

/**
 * Binds the real extension over one baseline document and loads it through the real initialization.
 *
 * The runtime is built by a factory — the same shape the OMP assembly uses — from the context the
 * framework hands it, so the framework's public binding and the production factory are both in the
 * path every case observes through. A case that names an existing root binds a second instance over
 * the very storage the first one wrote, which is how a new runtime or process is modelled here.
 */
async function bind(
	options: { readonly document?: ConsumptionDocument; readonly storageRoot?: string } = {},
): Promise<Bound> {
	const root = options.storageRoot ?? mkdtempSync(path.join(tmpdir(), "model-cost-runtime-"));
	if (options.storageRoot === undefined) roots.push(root);
	const consumptionFile = path.join(root, CONSUMPTION_FILE);
	if (options.storageRoot === undefined) {
		writeFileSync(consumptionFile, JSON.stringify(options.document ?? baseline()), "utf8");
	}
	const double = portDouble();
	let runtime: ModelCostRuntime | undefined;
	double.bind(MODEL_COST, {
		config: { reader: () => `storageDir: ${root}\nbalanceTtlMs: 30000\ncodexQuotaTtlMs: 15000\n` },
		factory: () => {
			runtime = createModelCostRuntime({
				config: { storageDir: root },
				configDirectory: root,
				userHomeDirectory: root,
				harness: HARNESS,
				data: DATA,
			});
			return runtime.implementation;
		},
	});
	double.deliverSession(OWNER, { session: MAIN });
	await double.initiateRun(OWNER);
	return { runtime: runtime as ModelCostRuntime, double, root, consumptionFile };
}

/** One native runtime reading, as an adapter maps it for one execution of one session. */
function reading(executionId: string, runtimeMs: number, status: "running" | "ended"): SubagentRuntimeFact {
	return { kind: "reading", executionId, runtimeMs, status };
}

/** One observation this host could not turn into a reading, as an adapter reports it. */
function unavailable(reason: string): SubagentRuntimeFact {
	return { kind: "unavailable", reason };
}

/** One settled Turn of the child's own session, on the token-only pair that session runs. */
function settleChildTurn(bound: Bound, at: number): void {
	const session = CHILD;
	bound.double.deliverTurn(
		{ kind: "request_started", session, at, provider: "go-provider", model: "model-alpha" },
		{ owner: OWNER },
	);
	bound.double.deliverTurn(
		{
			kind: "response_settled",
			session,
			at: at + 60_000,
			outcome: "completed",
			readings: [{ input: 10, output: 20, cacheRead: 0, cacheWrite: 0, totalTokens: 30 }],
		},
		{ owner: OWNER },
	);
}

/** The child's own Round: its start, one settled request, and its end — the existing commit path. */
function childRound(bound: Bound, at: number): void {
	bound.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: CHILD });
	settleChildTurn(bound, at);
}

/** The instant every Turn of these cases begins at. */
const CLOCK = Date.parse("2026-10-01T00:00:00.000Z");

/**
 * Lets the work a delivery started — an awaited commit, its file write — reach the disk before a case
 * reads it or asserts that nothing was written.
 */
async function nextTick(): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>();
	setImmediate(resolve);
	return promise;
}

/** The document the file holds, once it satisfies a case's own condition. */
async function savedDocument(
	file: string,
	accept: (document: ConsumptionDocument) => boolean,
): Promise<ConsumptionDocument> {
	const deadline = Date.now() + 5_000;
	for (;;) {
		if (existsSync(file)) {
			const document = JSON.parse(readFileSync(file, "utf8")) as ConsumptionDocument;
			if (accept(document)) return document;
		}
		if (Date.now() > deadline) throw new Error(`no consumption document the case expects was published at ${file}`);
		await nextTick();
	}
}

/** One session record of a document the store wrote, or `undefined` when it holds none. */
function stored(document: ConsumptionDocument, id: string): Record<string, unknown> | undefined {
	return document.harnesses[HARNESS]?.sessions.find(candidate => candidate.id === id) as
		| Record<string, unknown>
		| undefined;
}

/** The detail tree's one row for a descendant session, as the display result carries it. */
function sessionRow(bound: Bound, sessionId: string) {
	const rows = bound.runtime.presentation.of(MAIN_TARGET).agentTree ?? [];
	return rows.filter(row => row.kind === "session" && row.name === (sessionId === "session-child" ? "子代理" : sessionId));
}

/**
 * Every file this extension keeps under one storage root, relative and sorted.
 *
 * The framework's own coordinated-write lock is not one of them: its directory and its transient
 * entry belong to `updateFile`'s coordination of a real commit, and a case about *this extension's*
 * files must not read them as a document of its own.
 */
function rootFiles(root: string): string[] {
	const found: string[] = [];
	const walk = (directory: string): void => {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const full = path.join(directory, entry.name);
			if (entry.isDirectory()) {
				if (entry.name.endsWith(".lock")) continue;
				walk(full);
			} else found.push(path.relative(root, full).replace(/\\/g, "/"));
		}
	};
	walk(root);
	return found.sort();
}

afterEach(() => {
	while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true });
});

describe("a session's executions accumulate onto its own one row, and save as numeric milliseconds (P11, P18)", () => {
	test("two executions' own durations, both obtained before the commit, save as 480000 beside the session's consumption", async () => {
		const bound = await bind();

		// Two native executions of the one subagent session, each reporting its own duration, both
		// obtained before the session's next existing commit.
		childRound(bound, CLOCK);
		bound.double.deliverSubagentRuntime({ runtime: reading("0-Explore", 360_000, "ended"), session: CHILD });
		bound.double.deliverSubagentRuntime({ runtime: reading("0-Explore-2", 120_000, "ended"), session: CHILD });

		// One logical record per actual session: the two executions are on the child's single row, whose
		// figure is their sum — 360000 + 120000 — and not either execution's own.
		const rows = sessionRow(bound, "session-child");
		expect(rows).toHaveLength(1);
		expect(rows[0]?.runtimeMs).toBe(480_000);
		expect(bound.runtime.view.runtime("session-child")).toBe(480_000);

		// The existing commit — the child's own Round ending with the consumption it grew — carries the
		// figure into the same document, as a number of milliseconds rather than as display text.
		bound.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: CHILD });
		const document = await savedDocument(bound.consumptionFile, candidate => stored(candidate, "session-child")?.saveVersion === 2);
		expect(stored(document, "session-child")?.runtimeMs).toBe(480_000);
		expect(typeof stored(document, "session-child")?.runtimeMs).toBe("number");
		expect(/"runtimeMs"\s*:\s*480000/.test(readFileSync(bound.consumptionFile, "utf8"))).toBe(true);
		// The other sessions' own records were not rewritten by it.
		expect(stored(document, "session-main")?.runtimeMs).toBeUndefined();
		expect(stored(document, "session-grand")?.saveVersion).toBe(1);
	});
});

describe("one execution contributes once, however its readings arrive (P12)", () => {
	test("progress readings replace the open execution, a repeated completion adds nothing, and the next execution adds its own", async () => {
		const loaded = await bind();

		// The first execution's own running readings: each is a replacement of the one before it, so
		// 100000 then 200000 is a figure of 200000 and never the 300000 their sum would be.
		loaded.double.deliverSubagentRuntime({ runtime: reading("run-1", 100_000, "running"), session: CHILD });
		expect(loaded.runtime.view.runtime("session-child")).toBe(100_000);
		loaded.double.deliverSubagentRuntime({ runtime: reading("run-1", 200_000, "running"), session: CHILD });
		expect(loaded.runtime.view.runtime("session-child")).toBe(200_000);

		// The final reading of that execution replaces the running one and closes it; the same final
		// reported again — a repeated notification, or a second observer — contributes nothing more.
		loaded.double.deliverSubagentRuntime({ runtime: reading("run-1", 210_000, "ended"), session: CHILD });
		expect(loaded.runtime.view.runtime("session-child")).toBe(210_000);
		loaded.double.deliverSubagentRuntime({ runtime: reading("run-1", 210_000, "ended"), session: CHILD });
		expect(loaded.runtime.view.runtime("session-child")).toBe(210_000);

		// A second execution of the same session is its own contribution: 210000 + 90000.
		loaded.double.deliverSubagentRuntime({ runtime: reading("run-2", 90_000, "ended"), session: CHILD });
		expect(loaded.runtime.view.runtime("session-child")).toBe(300_000);
	});

	test("the accumulated figure is what the next existing commit writes, not the readings' sum", async () => {
		const bound = await bind();
		childRound(bound, CLOCK);
		bound.double.deliverSubagentRuntime({ runtime: reading("run-1", 100_000, "running"), session: CHILD });
		bound.double.deliverSubagentRuntime({ runtime: reading("run-1", 200_000, "running"), session: CHILD });
		bound.double.deliverSubagentRuntime({ runtime: reading("run-1", 210_000, "ended"), session: CHILD });
		bound.double.deliverSubagentRuntime({ runtime: reading("run-1", 210_000, "ended"), session: CHILD });
		bound.double.deliverSubagentRuntime({ runtime: reading("run-2", 90_000, "ended"), session: CHILD });

		bound.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: CHILD });
		const document = await savedDocument(bound.consumptionFile, candidate => stored(candidate, "session-child")?.saveVersion === 2);
		expect(stored(document, "session-child")?.runtimeMs).toBe(300_000);
	});
});

describe("a runtime is a fact about executions and settles nothing (P13, P14)", () => {
	test("readings write no file of their own, add no write, and leave every session's own record alone", async () => {
		const bound = await bind();
		childRound(bound, CLOCK);
		const before = readFileSync(bound.consumptionFile, "utf8");
		const filesBefore = rootFiles(bound.root);

		// A running reading, a final one for the same execution, a reading of another execution and a
		// host that reports none: none of them is a boundary, so none of them writes.
		bound.double.deliverSubagentRuntime({ runtime: reading("run-1", 360_000, "running"), session: CHILD });
		bound.double.deliverSubagentRuntime({ runtime: reading("run-1", 360_000, "ended"), session: CHILD });
		bound.double.deliverSubagentRuntime({ runtime: reading("run-2", 120_000, "running"), session: CHILD });
		bound.double.deliverSubagentRuntime({ runtime: unavailable("执行「run-3」所属 Session"), session: CHILD });
		await nextTick();

		// The document on disk is the very one it was, and the root gained no time-specific file: an
		// execution's duration rides an existing commit or it waits.
		expect(readFileSync(bound.consumptionFile, "utf8")).toBe(before);
		expect(rootFiles(bound.root)).toEqual(filesBefore);

		// The child's own consumption is held in memory from the Turn it settled, and its consumption was
		// not settled early: no round_end was fabricated for it, so its own record is not in the file.
		expect(bound.runtime.view.own("session-child")).toEqual({
			"go-provider": { "model-alpha": { tokens: { input: 40, cacheRead: 20, cacheWrite: 0, output: 70 } } },
		});
		expect(JSON.parse(before).harnesses[HARNESS].sessions).toHaveLength(3);

		// The session's own commit — its Round really ending — carries the figure with the consumption
		// it already saves, in the very same file and with no second write of its own.
		bound.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: CHILD });
		const document = await savedDocument(bound.consumptionFile, candidate => stored(candidate, "session-child")?.saveVersion === 2);
		expect(stored(document, "session-child")?.runtimeMs).toBe(480_000);
		expect(rootFiles(bound.root)).toEqual(filesBefore);
	});

	test("saving one session's runtime changes no other session's own consumption or its direct parent", async () => {
		const bound = await bind();
		childRound(bound, CLOCK);
		bound.double.deliverSubagentRuntime({ runtime: reading("run-1", 480_000, "ended"), session: CHILD });
		bound.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: CHILD });

		const document = await savedDocument(bound.consumptionFile, candidate => stored(candidate, "session-child")?.saveVersion === 2);
		// The grandchild's own record and its parent link are exactly what the document held, and the main
		// session's own consumption is untouched: the runtime belongs to the child alone.
		expect(stored(document, "session-grand")).toEqual(record("session-grand", "session-child", GRAND_OWN));
		expect(stored(document, "session-main")).toEqual(record("session-main", null, MAIN_OWN));
		expect(stored(document, "session-child")?.parent).toBe("session-main");
	});
});

describe("an unusable native runtime is reported and blocks nothing (P15, P16)", () => {
	test("a missing source and an invalid duration each report an error, keep the last valid value, and cost no other feature", async () => {
		const bound = await bind();
		childRound(bound, CLOCK);
		bound.double.deliverSubagentRuntime({ runtime: reading("run-1", 360_000, "ended"), session: CHILD });

		// The host cannot state the next execution's own runtime, and then states one that is not a
		// duration at all. Both are reported as errors, neither is filled in, and what was already
		// accumulated stands.
		const missing = bound.double.deliverSubagentRuntime({ runtime: unavailable("执行「run-2」所属 Session"), session: CHILD });
		expect(missing.feedback).toHaveLength(1);
		expect(missing.feedback[0]?.level).toBe("error");
		expect(missing.feedback[0]?.message).toContain("run-2");
		const invalid = bound.double.deliverSubagentRuntime({ runtime: reading("run-3", -1, "ended"), session: CHILD });
		expect(invalid.feedback).toHaveLength(1);
		expect(invalid.feedback[0]?.level).toBe("error");
		expect(bound.runtime.view.runtime("session-child")).toBe(360_000);

		// Neither report blocked anything else: the session's request accounting is its own, its existing
		// commit still lands, and its detail row still carries the consumption and the last valid runtime.
		expect(bound.runtime.view.own("session-child")).toEqual({
			"go-provider": { "model-alpha": { tokens: { input: 40, cacheRead: 20, cacheWrite: 0, output: 70 } } },
		});
		expect(bound.runtime.presentation.of(MAIN_TARGET).agentTree?.find(row => row.name === "子代理")?.runtimeMs).toBe(360_000);
		bound.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: CHILD });
		const document = await savedDocument(bound.consumptionFile, candidate => stored(candidate, "session-child")?.saveVersion === 2);
		expect(stored(document, "session-child")?.runtimeMs).toBe(360_000);
		expect(bound.runtime.storage.pauseReason()).toBeUndefined();
	});

	test("a host that reports no runtime leaves the value unavailable, and a reported zero is not that absence (P16)", async () => {
		const bound = await bind();
		childRound(bound, CLOCK);

		// Nothing was reported for this session: its row keeps the field and reports it as unavailable,
		// and the figure is absent rather than a zero.
		const absent = sessionRow(bound, "session-child")[0];
		expect(absent?.runtimeMs).toBeUndefined();
		expect(bound.runtime.view.runtime("session-child")).toBeUndefined();

		// A completed execution that really took no measurable time is a reading the host made, so it is
		// recorded and saved as the zero it is — not as the absence above.
		bound.double.deliverSubagentRuntime({ runtime: reading("run-1", 0, "ended"), session: CHILD });
		expect(sessionRow(bound, "session-child")[0]?.runtimeMs).toBe(0);
		bound.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: CHILD });
		const document = await savedDocument(bound.consumptionFile, candidate => stored(candidate, "session-child")?.saveVersion === 2);
		expect(stored(document, "session-child")?.runtimeMs).toBe(0);
	});
});

describe("a late final reading neither delays nor back-fills a commit (P17)", () => {
	test("the disk keeps what the commit wrote until a later existing commit can carry the reliable value", async () => {
		const bound = await bind();
		childRound(bound, CLOCK);
		// The reading available at the commit: the running one, 359900 of the 360000 the execution will
		// really have taken.
		bound.double.deliverSubagentRuntime({ runtime: reading("run-1", 359_900, "running"), session: CHILD });
		bound.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: CHILD });
		const first = await savedDocument(bound.consumptionFile, candidate => stored(candidate, "session-child")?.saveVersion === 2);
		expect(stored(first, "session-child")?.runtimeMs).toBe(359_900);

		// The execution's final reading arrives after that commit. It updates what the display reads, and
		// it neither delays anything nor writes: the document on disk is still the one the commit wrote.
		const afterCommit = readFileSync(bound.consumptionFile, "utf8");
		bound.double.deliverSubagentRuntime({ runtime: reading("run-1", 360_000, "ended"), session: CHILD });
		await nextTick();
		expect(bound.runtime.view.runtime("session-child")).toBe(360_000);
		expect(readFileSync(bound.consumptionFile, "utf8")).toBe(afterCommit);

		// A later existing commit — the session consuming again — carries the reliable value with it.
		childRound(bound, CLOCK + 3_600_000);
		bound.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: CHILD });
		const second = await savedDocument(bound.consumptionFile, candidate => stored(candidate, "session-child")?.saveVersion === 3);
		expect(stored(second, "session-child")?.runtimeMs).toBe(360_000);
	});
});

describe("a restart restores the saved accumulation and continues it (P19)", () => {
	test("a new runtime reads the saved value back, continues from it, and never claims an unsaved reading was restored", async () => {
		const first = await bind();
		childRound(first, CLOCK);
		first.double.deliverSubagentRuntime({ runtime: reading("run-1", 360_000, "ended"), session: CHILD });
		first.double.deliverSubagentRuntime({ runtime: reading("run-2", 120_000, "ended"), session: CHILD });
		first.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: CHILD });
		await savedDocument(first.consumptionFile, candidate => stored(candidate, "session-child")?.runtimeMs === 480_000);

		// A late reading no commit carried: this instance knows it, the file does not.
		first.double.deliverSubagentRuntime({ runtime: reading("run-3", 600_000, "ended"), session: CHILD });
		expect(first.runtime.view.runtime("session-child")).toBe(1_080_000);

		// A new instance over the very same storage — a restart or another process — restores what was
		// saved (480000) and not the value only the previous instance's memory held.
		const restarted = await bind({ storageRoot: first.root });
		expect(restarted.runtime.view.runtime("session-child")).toBe(480_000);
		expect(sessionRow(restarted, "session-child")[0]?.runtimeMs).toBe(480_000);

		// It continues accumulating from there: a further execution's own duration adds to the restored
		// figure and is what its next existing commit writes.
		childRound(restarted, CLOCK + 7_200_000);
		restarted.double.deliverSubagentRuntime({ runtime: reading("run-4", 120_000, "ended"), session: CHILD });
		restarted.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: CHILD });
		const document = await savedDocument(restarted.consumptionFile, candidate => stored(candidate, "session-child")?.runtimeMs === 600_000);
		expect(stored(document, "session-child")?.runtimeMs).toBe(600_000);
	});
});

describe("an old document without the new field stays ordinary consumption (P22, P36)", () => {
	test("a record that carries no runtime keeps every field it has and keeps being saved", async () => {
		const bound = await bind();
		// The old document is exactly the approved schema without the optional field: tokens, an amount
		// and a direct parent, all of them valid.
		expect(bound.runtime.storage.pauseReason()).toBeUndefined();
		expect(stored((await savedDocument(bound.consumptionFile, () => true)), "session-child")?.own).toEqual(CHILD_OWN);

		childRound(bound, CLOCK);
		bound.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: CHILD });
		const document = await savedDocument(bound.consumptionFile, candidate => stored(candidate, "session-child")?.saveVersion === 2);
		const saved = stored(document, "session-child");
		// No runtime was ever reported, so the record carries none — and everything else is intact.
		expect(saved?.runtimeMs).toBeUndefined();
		expect(saved?.parent).toBe("session-main");
		expect(saved?.own).toEqual({
			"go-provider": {
				"model-alpha": { tokens: { input: 40, cacheRead: 20, cacheWrite: 0, output: 70 } },
			},
		});
		expect(stored(document, "session-main")?.own).toEqual(MAIN_OWN);
	});

	test("a record whose runtime is not a measurement is not damage to the consumption beside it, while the schema's own rules still hold", async () => {
		const bound = await bind({
			document: baseline([
				record("session-main", null, MAIN_OWN),
				{ ...record("session-child", "session-main", CHILD_OWN), runtimeMs: "8 minutes" },
				record("session-grand", "session-child", GRAND_OWN),
			]),
		});

		// The document read as valid — the invalid optional figure is left out rather than taken for a
		// damaged document — so the instance is not paused and the sessions' own data is all there.
		expect(bound.runtime.storage.pauseReason()).toBeUndefined();
		expect(bound.runtime.view.own("session-child")).toEqual(CHILD_OWN);
		expect(bound.runtime.view.identity("session-child")?.parentSessionId).toBe("session-main");
		expect(bound.runtime.view.runtime("session-child")).toBeUndefined();

		// And the session keeps committing: the next snapshot replaces the unusable value with what this
		// instance really knows, while every other record survives.
		childRound(bound, CLOCK);
		bound.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: CHILD });
		const document = await savedDocument(bound.consumptionFile, candidate => stored(candidate, "session-child")?.saveVersion === 2);
		expect(stored(document, "session-child")?.runtimeMs).toBeUndefined();
		expect(stored(document, "session-child")?.parent).toBe("session-main");
		expect(stored(document, "session-main")?.own).toEqual(MAIN_OWN);
		expect(stored(document, "session-grand")?.saveVersion).toBe(1);
	});

	test("the whole-document rules are unchanged: a record with no usable consumption is still refused whole", async () => {
		// The same leniency does not widen to the fields the consumption itself is made of: a record
		// whose own usage is missing is not this schema, and is never read as one.
		const bound = await bind({
			document: baseline([
				record("session-main", null, MAIN_OWN),
				{ id: "session-child", name: "子代理", parent: "session-main", saveVersion: 1, runtimeMs: 480_000 },
			]),
		});
		expect(bound.runtime.storage.pauseReason()).toBeDefined();
		expect(bound.runtime.view.own("session-child")).toBeUndefined();
	});
});

describe("adding a runtime changes no other business figure (P24)", () => {
	test("the own and inclusive totals, the amounts, the cache rate and the context reading are the same with and without it", async () => {
		const bound = await bind();
		childRound(bound, CLOCK);
		const before = bound.runtime.presentation.of(MAIN_TARGET);
		const childRowBefore = before.agentTree?.find(row => row.name === "子代理");
		const ownBefore = bound.runtime.view.own("session-child");
		const inclusiveBefore = bound.runtime.view.inclusiveTotals("session-main");

		// The child's own execution reports 480000 milliseconds — a figure no money or token field may
		// absorb, and one whose own unit must never be read as another's.
		bound.double.deliverSubagentRuntime({ runtime: reading("run-1", 480_000, "ended"), session: CHILD });
		const after = bound.runtime.presentation.of(MAIN_TARGET);
		const childRowAfter = after.agentTree?.find(row => row.name === "子代理");

		expect(childRowAfter?.fields).toEqual(childRowBefore?.fields);
		expect(childRowAfter?.fields?.sum).toBe(130);
		expect(childRowAfter?.fields?.costCny).toBeUndefined();
		expect(childRowAfter?.fields?.cacheHitRate).toBe(33);
		expect(childRowAfter?.runtimeMs).toBe(480_000);
		expect(bound.runtime.view.own("session-child")).toEqual(ownBefore);
		expect(bound.runtime.view.inclusiveTotals("session-main")).toEqual(inclusiveBefore);
		expect(after.tree).toEqual(before.tree);
		expect(after.tree.sum).toBe(3_644);
		expect(after.tree.costCny).toBe(0.55);

		// The context reading a descendant row may carry is a reading of its own and is unaffected too.
		bound.runtime.sessionContext.observe("session-child", { tokens: 100_000, provider: "official", model: "model-alpha" });
		const withContext = bound.runtime.presentation.of(MAIN_TARGET).agentTree?.find(row => row.name === "子代理");
		expect(withContext?.context).toEqual({ tokens: 100_000, budget: 450_000 });
		expect(withContext?.runtimeMs).toBe(480_000);
	});
});
