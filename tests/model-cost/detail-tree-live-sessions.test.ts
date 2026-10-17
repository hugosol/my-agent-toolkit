/**
 * The detail form's tree when the sessions under it are observed from the processes that run them
 * (P2, P3, P9; S1, S3; ticket 04).
 *
 * The seam under test is production throughout: the extension's real definition bound through the
 * framework's public binding (the port double, `tests/framework/support/harness-port-double.ts`) over
 * a harness that carries observations across processes, and the extension's own frontend —
 * `attachModelCostWidget` — attached to a controlled host, so the lines a case reads are the lines an
 * operator would see rather than an internal registry. `runtime.presentation.of(target)` is read for
 * the values behind those lines, and the document on the storage root for what the run really wrote.
 *
 * What every case drives is one direction of that access: a session the harness ran in *another*
 * process delivers its own observation to the seat this process serves for the owner it follows —
 * its facts, the activity its own Round left it in and the context its own host read — and nothing of
 * this process's accounting is involved in producing it. The readings are stated by the case, so
 * every name, parent and token count below is an independent literal rather than a figure read back
 * off the implementation.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { MODEL_COST } from "../../extensions/model-cost/definition";
import { MODEL_COST_WIDGET_KEY, attachModelCostWidget } from "../../extensions/model-cost/harnesses/omp/widget";
import type { OmpSessionContext } from "../../framework/adapters/omp";
import type { ConsumptionDocument } from "../../extensions/model-cost/shared-logic/accounting/consumption-document";
import type { ModelPricingData } from "../../extensions/model-cost/shared-logic/pricing/model-data";
import {
	DEEPSEEK_DISPLAY_BUDGET,
	type AgentTreeRow,
	fieldsColumns,
} from "../../extensions/model-cost/shared-logic/presentation/display";
import type { ModelCostRuntime } from "../../extensions/model-cost/shared-logic/runtime";
import { createModelCostRuntime } from "../../extensions/model-cost/shared-logic/runtime";
import type { ObservedSession, OwnerReference, SessionFacts } from "../../framework/core/protocol";
import { type PortDouble, portDouble } from "../framework/support/harness-port-double";
import { controlApi } from "./support/control-api";
import { uiBoundaryTimerOf } from "./support/ui-timer";

/** The self-made pricing data: one monetary tier on the root's pair and one token-only pair. */
const DATA: ModelPricingData = {
	currency: "XTS",
	unit: "XTS per million tokens",
	peakMultiplier: 3,
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

/** The session this process serves: the tree's root, and the owner the spawned sessions follow. */
const MAIN: SessionFacts = { sessionId: "session-main", kind: "main", name: "主会话", unavailable: [] };
const OWNER: OwnerReference = { kind: "owner", key: "main:live-tree" };

/** The owner every reading that arrived from another process states: the seat this process serves. */
const SEAT: OwnerReference = { kind: "inherited", key: OWNER.key };

/** The main session's own current pair, which the tree below is read against. */
const MAIN_TARGET = { sessionId: "session-main", provider: "official", model: "model-alpha" } as const;

/** The child session as the process that runs it resolved its facts: directly below the main session. */
const CHILD: SessionFacts = {
	sessionId: "session-child",
	kind: "sub",
	parentSessionId: MAIN.sessionId,
	name: "子代理A",
	unavailable: [],
};

/** The grandchild as its own process resolved it: directly below the child, never below the main one. */
const GRANDCHILD: SessionFacts = {
	sessionId: "session-grand",
	kind: "sub",
	parentSessionId: CHILD.sessionId,
	name: "孙代理B",
	unavailable: [],
};

/** One reading of one session another process ran, with the readings that process stated. */
function readingOf(
	session: SessionFacts,
	readings: {
		readonly activity?: "working" | "idle";
		readonly context?: { readonly tokens: number; readonly provider: string; readonly model: string };
	} = {},
): ObservedSession {
	return {
		session,
		owner: SEAT,
		...(readings.activity === undefined ? {} : { activity: readings.activity }),
		...(readings.context === undefined ? {} : { context: readings.context }),
	};
}

/** The document every case starts from: the main session's own saved consumption and nothing below it. */
const MAIN_ONLY: ConsumptionDocument = {
	schemaVersion: 1,
	periodId: "period-live-sessions",
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

/** Every root this file created, removed after each case. */
const roots: string[] = [];

/** One bound instance, the double that drives it and the lines its frontend was handed. */
interface Bound {
	readonly runtime: ModelCostRuntime;
	readonly double: PortDouble;
	/** The document this instance reads and writes, as the path its storage root holds it at. */
	readonly file: string;
	/** The lines the last text-form widget this host was shown held, or nothing while it drew none. */
	lines(): readonly string[] | undefined;
	/** The host drawing the session it displays again, as it does when that session is entered anew. */
	hostRedraws(): void;
}

/** Binds the real extension over one document and draws its detail form through the real frontend. */
async function bind(options: { readonly document?: ConsumptionDocument } = {}): Promise<Bound> {
	const root = mkdtempSync(path.join(tmpdir(), "model-cost-live-sessions-"));
	roots.push(root);
	const file = path.join(root, CONSUMPTION_FILE);
	writeFileSync(file, JSON.stringify(options.document ?? MAIN_ONLY), "utf8");
	const double = portDouble({ observationsAcrossProcesses: true });
	let runtime: ModelCostRuntime | undefined;
	double.bind(MODEL_COST, {
		config: { reader: () => `storageDir: ${root}\nbalanceTtlMs: 30000\ncodexQuotaTtlMs: 15000\n` },
		factory: context =>
			(runtime = createModelCostRuntime({
				config: { storageDir: root },
				configDirectory: root,
				userHomeDirectory: root,
				harness: HARNESS,
				data: DATA,
				// The process's own source, as the production assemblies hand it over: a reading another
				// process delivered is adopted into *this* record, and the extension reads it there.
				sessionObservations: context.sessionObservations,
			})).implementation,
	});
	double.deliverSession(OWNER, { session: MAIN });
	double.deliverSession(OWNER, { event: { kind: "session_facts" }, session: MAIN });
	await double.initiateRun(OWNER);
	const built = runtime as ModelCostRuntime;
	await double.runToCompletion("budget", { args: "detail" });

	// The host this frontend draws through, bound to the session the operator is viewing: what it was
	// handed is the terminal content a case below reads.
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

	return { runtime: built, double, file, lines: () => drawn[drawn.length - 1], hostRedraws: () => fire("session_start", ctx) };
}

afterEach(() => {
	while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true });
});

/**
 * Lets the turn an arriving reading was adopted in finish, so the redraw that turn owes has been drawn.
 *
 * Adoption is not the drawing: the process's observation source holds a reading the moment its delivery
 * returned, while the redraw a moved reading costs is the turn's own and is served at that turn's end
 * (the merged redraw of `extensions/model-cost/shared-logic/presentation/coalesced-redraw.ts`, ticket
 * 07). A case that reads a *frame* therefore reads it after the turn; a case reading the source or the
 * display result reads it at once.
 */
async function readingTurnEnded(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

describe("a descendant another process ran is drawn where its own direct parent puts it (P2)", () => {
	test("the child's and the grandchild's readings arrive at the owner's seat, and the tree stays three levels", async () => {
		const bound = await bind();

		// Both readings were delivered by the processes that run those sessions: the child's own process
		// named the main session as its direct parent, and the grandchild's own process named the child.
		// Nothing of the child's process is in the grandchild's path, and neither session was ever
		// delivered to this process as a session of its own.
		bound.double.deliverObserved(
			readingOf(CHILD, {
				activity: "working",
				context: { tokens: 1000, provider: "go-provider", model: "model-alpha" },
			}),
		);
		bound.double.deliverObserved(
			readingOf(GRANDCHILD, {
				activity: "working",
				context: { tokens: 2000, provider: "go-provider", model: "model-alpha" },
			}),
		);

		const rows = bound.runtime.presentation.of(MAIN_TARGET).agentTree ?? [];
		const sessions = rows.filter(row => row.kind === "session");

		// The readings really reached this process's own observation source — the seat this process
		// serves admitted them, with the facts and the context their own process resolved — so what the
		// tree itself draws below is the question, not whether anything arrived at all.
		expect(bound.runtime.sessionObservations.read(CHILD.sessionId)?.context?.tokens).toBe(1000);
		expect(bound.runtime.sessionObservations.read(GRANDCHILD.sessionId)?.session?.parentSessionId).toBe(
			CHILD.sessionId,
		);

		// One row per actual session, at the depth its own direct parent puts it: the child below the
		// root and the grandchild below the child — never flattened onto the root, which is what a tree
		// that attached every delivered reading to its owner would draw.
		expect(sessions.map(row => [row.name, row.depth])).toEqual([
			["子代理A", 1],
			["孙代理B", 2],
		]);

		// The drawn form says the same thing: the child's line carries the first depth's own connector
		// and the grandchild's carries the second depth's — a continuation bar that keeps it inside the
		// child's branch, where a tree that hung every delivered session from the root would have drawn
		// the two connectors at the same step. A drawn agent row is the one line carrying both the
		// runtime field and a name of its own.
		await readingTurnEnded();
		const drawn = (bound.lines() ?? []).filter(line => line.includes("  Run: "));
		expect(drawn).toHaveLength(2);
		expect(drawn[0]).toContain("├─ 子代理A");
		expect(drawn[1]).toContain("│  └─ 孙代理B");
	});

	test("a committed descendant of a session another process runs stays in that session's own subtree", async () => {
		// The document holds the root's own consumption and the grandchild's — the grandchild's own
		// process committed it — while the session between them, which another process runs, holds
		// nothing here but its registration.
		const document = {
			...MAIN_ONLY,
			harnesses: {
				[HARNESS]: {
					sessions: [
						...(MAIN_ONLY.harnesses?.[HARNESS]?.sessions ?? []),
						{
							id: GRANDCHILD.sessionId,
							name: GRANDCHILD.name,
							parent: CHILD.sessionId,
							saveVersion: 1,
							own: {
								official: {
									"model-alpha": { tokens: { input: 7, cacheRead: 0, cacheWrite: 0, output: 0 }, costCny: 0.5 },
								},
							},
						},
					],
				},
			},
		} as unknown as ConsumptionDocument;
		const bound = await bind({ document });

		// The only word this process has about the child is its registration: facts, and no reading.
		bound.double.deliverObserved(readingOf(CHILD));

		const rows = bound.runtime.presentation.of(MAIN_TARGET).agentTree ?? [];
		const sessions = rows.filter(row => row.kind === "session");

		// The grandchild is drawn below the child rather than beside it or at the root, and the tree's
		// own inclusive total counts its saved 7 tokens exactly once beside the root's 6000: a session
		// that has committed nothing itself is still the relation the descendant hangs from, whatever
		// process observed it.
		expect(sessions.map(row => [row.name, row.depth])).toEqual([
			["子代理A", 1],
			["孙代理B", 2],
		]);
		expect(sessions[1]?.fields?.costCny).toBe(0.5);
		expect(bound.runtime.presentation.of(MAIN_TARGET).tree.sum).toBe(6007);
	});
});

describe("a session whose first consumption is not committed yet is drawn with what is known (P9)", () => {
	test("a background child's reported startup pair is visible before its first commit and survives later context changes", async () => {
		const bound = await bind();
		const before = readFileSync(bound.file, "utf8");
		const session: SessionFacts = {
			...CHILD,
			startup: { model: { provider: "official", model: "model-alpha" }, effort: "high" },
		};
		bound.double.deliverObserved(readingOf(session, { activity: "working" }));
		await readingTurnEnded();
		expect((bound.lines() ?? []).find(line => line.includes("子代理A"))).toContain("official/model-alpha(high)");

		// Later readings describe the current model, not a new beginning.
		bound.double.deliverObserved(readingOf(CHILD, {
			activity: "working",
			context: { tokens: 1000, provider: "go-provider", model: "other-model" },
		}));
		await readingTurnEnded();
		expect((bound.lines() ?? []).find(line => line.includes("子代理A"))).toContain("official/model-alpha(high)");
		expect(readFileSync(bound.file, "utf8")).toBe(before);
	});

	test("its row and its given context reading appear while its consumption stays missing", async () => {
		const bound = await bind();
		const before = readFileSync(bound.file, "utf8");

		// The session is running in another process and its first Round has not been committed: the one
		// reading that has arrived is the context its own host measured, and the count is the case's own
		// given figure rather than anything this process computed.
		bound.double.deliverObserved(
			readingOf(CHILD, {
				activity: "working",
				context: { tokens: 45_000, provider: "official", model: "model-alpha" },
			}),
		);

		const rows = bound.runtime.presentation.of(MAIN_TARGET).agentTree ?? [];
		const child = rows.find(row => row.kind === "session");

		// The row is there before that commit, with the session's own name and the reading it arrived
		// with: the figure is the one the case gave, read against the monetary channel's own fixed
		// display budget rather than against any host window.
		expect(child?.name).toBe("子代理A");
		expect(child?.depth).toBe(1);
		expect(child?.context).toEqual({ tokens: 45_000, budget: DEEPSEEK_DISPLAY_BUDGET });
		expect(child?.nameEmphasis).toBe("active");

		// What nothing has measured is missing rather than zero: no amount is known for that session, its
		// beginning is unproved (`?(?)`), and no runtime has been measured for it — the very facts a
		// session that really consumed nothing would state the same way, which is why the row writes no
		// consumption column at all instead of a figure it cannot vouch for.
		expect(child?.startup?.text).toBe("?(?)");
		expect(child?.runtimeMs).toBeUndefined();
		const fields = child?.fields;
		expect(fields?.sum).toBe(0);
		expect(fields?.costCny).toBeUndefined();
		expect(fields?.referenceCostUsd).toBeUndefined();
		expect(fields?.referenceRatio).toBeUndefined();
		expect(fieldsColumns(fields as NonNullable<typeof fields>)).toEqual([]);

		// The drawn line says the same: the context reading and the unavailable-runtime marker, and no
		// amount, no cached share and no zero standing in for the consumption that is not known yet.
		await readingTurnEnded();
		const line = (bound.lines() ?? []).find(drawn => drawn.includes("子代理A")) as string;
		expect(line).toContain("?(?)");
		expect(line).toContain("Ctx: 10% (45,000/450.0K)");
		expect(line).toContain("Run: \u2014");
		expect(line).not.toContain("Cost:");
		expect(line).not.toContain("Cache:");
		expect(line).not.toMatch(/Cost: \u00A50\b/);

		// Nothing of the observation reached the consumption document: the session holds no record, the
		// document is byte-for-byte what it was, and the tree's own inclusive total is still exactly the
		// saved root's 6000 tokens — an unknown consumption contributes nothing rather than a zero.
		expect(JSON.parse(before)).toEqual(JSON.parse(readFileSync(bound.file, "utf8")));
		const saved = JSON.parse(readFileSync(bound.file, "utf8")) as {
			readonly harnesses: Record<string, { readonly sessions: readonly { readonly id: string }[] }>;
		};
		expect((saved.harnesses[HARNESS]?.sessions ?? []).map(stored => stored.id)).toEqual([MAIN.sessionId]);
		expect(bound.runtime.presentation.of(MAIN_TARGET).tree.sum).toBe(6000);
	});
});

describe("one actual session is one row, whatever run or process delivered it (P3)", () => {
	/** The child's own saved consumption, as the run that spawned it committed it. */
	const CHILD_RECORD: ConsumptionDocument = {
		schemaVersion: 1,
		periodId: "period-live-sessions",
		start: "2026-10-01T00:00:00.000Z",
		holiday: false,
		harnesses: {
			[HARNESS]: {
				sessions: [
					...(MAIN_ONLY.harnesses?.[HARNESS]?.sessions ?? []),
					{
						id: CHILD.sessionId,
						name: "子代理A",
						parent: MAIN.sessionId,
						saveVersion: 1,
						own: {
							"go-provider": { "model-alpha": { tokens: { input: 30, cacheRead: 20, cacheWrite: 0, output: 50 } } },
						},
					},
				],
			},
		},
	} as unknown as ConsumptionDocument;

	test("a continuation in another run updates that session's own row instead of adding one", async () => {
		const bound = await bind({ document: CHILD_RECORD });
		const before = readFileSync(bound.file, "utf8");

		// The session is delivered twice: once by the run that spawned it, and once by the run that
		// continued it — the same actual session, under the same identity, with the name its own host
		// reports for it now.
		bound.double.deliverObserved(readingOf(CHILD, { activity: "idle" }));
		bound.double.deliverObserved(
			readingOf({ ...CHILD, name: "改名后的子代理" }, { activity: "working" }),
		);

		const rows = bound.runtime.presentation.of(MAIN_TARGET).agentTree ?? [];
		const sessions = rows.filter(row => row.kind === "session");

		// One row for that session and no second one: the run and the process are not identities here,
		// the session's own id is, and the row states the name that session's own facts last reported.
		// The union the tree is drawn from is merged the same way: a session the document holds and a
		// registration names is one identity, not one identity per source.
		expect(sessions.map(row => [row.name, row.depth])).toEqual([["改名后的子代理", 1]]);
		await readingTurnEnded();
		expect((bound.lines() ?? []).filter(drawn => drawn.includes("  Run: "))).toHaveLength(1);
		const listed = bound.runtime.view.identities().map(identity => identity.sessionId);
		expect(listed.filter(id => id === CHILD.sessionId)).toHaveLength(1);
		expect(new Set(listed).size).toBe(listed.length);

		// What the saved record holds is untouched by the direction the observation arrived from: the
		// row still states that session's own 100 tokens, and the tree's inclusive total still holds
		// them once beside the root's own 6000.
		expect(sessions[0]?.fields?.sum).toBe(100);
		expect(sessions[0]?.fields?.costCny).toBeUndefined();
		expect(bound.runtime.presentation.of(MAIN_TARGET).tree.sum).toBe(6100);
		expect(bound.runtime.view.own(CHILD.sessionId)?.["go-provider"]?.["model-alpha"]?.tokens.output).toBe(50);

		// Nothing of either delivery was written: an observation is not a consumption commit.
		expect(readFileSync(bound.file, "utf8")).toBe(before);
	});

	test("a rename another process reports reaches the row of a session this process already knew", async () => {
		const bound = await bind();

		// This process already holds facts about the child from its own deliveries: its Round opened here,
		// so the row is drawn under the name that delivery stated.
		bound.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: CHILD });
		expect(
			(bound.runtime.presentation.of(MAIN_TARGET).agentTree ?? []).find(row => row.kind === "session")?.name,
		).toBe("子代理A");

		// The same session, running on in another process, reports itself under the name its own host
		// states for it now. A reading is a delivery of that session's facts like any other, so the row
		// keeps one identity and states the latest name rather than the one this process first heard.
		bound.double.deliverObserved(readingOf({ ...CHILD, name: "改名后的子代理" }, { activity: "working" }));

		const sessions = (bound.runtime.presentation.of(MAIN_TARGET).agentTree ?? []).filter(
			row => row.kind === "session",
		);
		expect(sessions.map(row => row.name)).toEqual(["改名后的子代理"]);
		expect(bound.runtime.view.identity(CHILD.sessionId)?.name).toBe("改名后的子代理");
	});

	test("two sessions of one name stay two rows, and one session delivered twice stays one", async () => {
		const bound = await bind();

		// Two different actual sessions, spawned by the root under the same display name: a name is
		// display data and never an identity, so each takes its own row. Each reading here states facts
		// and no reading of its own — the first word a process sends about a session it just began can
		// be exactly that — which is why the frame below is read after the host's own next redraw: a
		// delivery that carries no reading moves no axis a frontend was told to redraw for, while the
		// sessions it states are in the display result the next draw reads.
		const sameName: SessionFacts = { ...CHILD, sessionId: "session-twin", name: "同名子代理" };
		bound.double.deliverObserved(readingOf({ ...CHILD, name: "同名子代理" }));
		bound.double.deliverObserved(readingOf(sameName));
		// And the first of them is delivered once more, as a later run of that same session would.
		bound.double.deliverObserved(readingOf({ ...CHILD, name: "同名子代理" }));

		const sessions = (bound.runtime.presentation.of(MAIN_TARGET).agentTree ?? []).filter(
			row => row.kind === "session",
		);
		expect(sessions.map(row => [row.name, row.depth])).toEqual([
			["同名子代理", 1],
			["同名子代理", 1],
		]);

		bound.hostRedraws();
		const drawn = (bound.lines() ?? []).filter(line => line.includes("  Run: "));
		expect(drawn).toHaveLength(2);
		expect(drawn.filter(line => line.includes("同名子代理"))).toHaveLength(2);
	});
});

describe("a source's end withdraws what the detail was drawn from, and nothing else (P5–P8)", () => {
	/** The child session's own display name, as the tree draws it and as the drawn line carries it. */
	const CHILD_NAME = "子代理A";

	/** The drawn agent row of one session, out of the tree the detail form shows. */
	const rowOf = (bound: Bound, session: SessionFacts): AgentTreeRow | undefined =>
		(bound.runtime.presentation.of(MAIN_TARGET).agentTree ?? []).find(
			row => row.kind === "session" && row.name === session.name,
		);

	test("the row stops being drawn as working and loses its context reading, while the session keeps its place and its record", async () => {
		const bound = await bind();
		const before = readFileSync(bound.file, "utf8");

		// The session is running in another process, and what arrived is the reading that process held:
		// the activity its own Round left it in and the context its own host measured.
		bound.double.deliverObserved(
			readingOf(CHILD, {
				activity: "working",
				context: { tokens: 45_000, provider: "official", model: "model-alpha" },
			}),
			1,
		);
		expect(rowOf(bound, CHILD)?.nameEmphasis).toBe("active");
		expect(rowOf(bound, CHILD)?.context).toEqual({ tokens: 45_000, budget: DEEPSEEK_DISPLAY_BUDGET });
		await readingTurnEnded();
		expect((bound.lines() ?? []).find(line => line.includes(CHILD_NAME))).toContain("Ctx: 10% (45,000/450.0K)");

		// The connection that carried the reading ends — the process that ran the session released its
		// access, or this side observed the connection close — and what that withdraws is its readings.
		bound.double.loseObservedSource(1);

		// The session is still drawn, under its own name and at its own direct parent's depth, because
		// that identity is the session's own fact rather than the connection's.
		const row = rowOf(bound, CHILD);
		expect(row?.name).toBe(CHILD.name);
		expect(row?.depth).toBe(1);
		// And nothing live about it is drawn: no working emphasis and no context reading. What is *not*
		// drawn matters as much as what is: the session is not shown as idle, as failed or as finished.
		expect(row?.nameEmphasis).toBeUndefined();
		expect(row?.context).toBeUndefined();
		await readingTurnEnded();
		const drawn = (bound.lines() ?? []).find(line => line.includes(CHILD_NAME)) as string;
		expect(drawn).toMatch(/[├└]─ 子代理A/u);
		expect(drawn).not.toContain("Ctx:");
		expect(drawn).toContain("Run: \u2014");

		// A lost connection minted no billing lifecycle either: no Round ended, no Turn was attributed
		// and no consumption was written, so the document is byte-for-byte what it was.
		expect(JSON.parse(readFileSync(bound.file, "utf8"))).toEqual(JSON.parse(before));
	});

	test("a word a later source delivered keeps standing after the earlier source's end", async () => {
		const bound = await bind();
		const before = readFileSync(bound.file, "utf8");

		// Two connections about one session, the second admitted after the first: the later one's word is
		// the reading this process holds, and the earlier one's end is what follows it.
		bound.double.deliverObserved(
			readingOf(CHILD, { activity: "working", context: { tokens: 100, provider: "official", model: "model-alpha" } }),
			1,
		);
		bound.double.deliverObserved(
			readingOf(CHILD, { activity: "idle", context: { tokens: 200, provider: "official", model: "model-alpha" } }),
			2,
		);
		bound.double.loseObservedSource(1);

		const row = rowOf(bound, CHILD);
		expect(row?.context).toEqual({ tokens: 200, budget: DEEPSEEK_DISPLAY_BUDGET });
		// The later word is the one this process holds, so nothing the earlier source's end withdrew
		// touches it — and the reading it states is idle, which no loss is allowed to overwrite either.
		expect(row?.nameEmphasis).toBeUndefined();
		await readingTurnEnded();
		const drawn = (bound.lines() ?? []).find(line => line.includes(CHILD_NAME)) as string;
		expect(drawn).toContain("Ctx: 0% (200/450.0K)");
		expect(JSON.parse(readFileSync(bound.file, "utf8"))).toEqual(JSON.parse(before));
	});

	test("a source that reaches the seat again restores what was withdrawn, with no further change needed", async () => {
		const bound = await bind();
		const before = readFileSync(bound.file, "utf8");

		bound.double.deliverObserved(
			readingOf(CHILD, {
				activity: "working",
				context: { tokens: 45_000, provider: "official", model: "model-alpha" },
			}),
			1,
		);
		bound.double.loseObservedSource(1);
		expect(rowOf(bound, CHILD)?.context).toBeUndefined();
		await readingTurnEnded();
		expect((bound.lines() ?? []).find(line => line.includes(CHILD_NAME))).not.toContain("Ctx:");

		// The access is reached again — a connection this process admits later — and its first word
		// carries what that process holds now, including a context that moved while this access was gone.
		bound.double.deliverObserved(
			readingOf(CHILD, {
				activity: "working",
				context: { tokens: 50_000, provider: "official", model: "model-alpha" },
			}),
			2,
		);

		const row = rowOf(bound, CHILD);
		expect(row?.nameEmphasis).toBe("active");
		expect(row?.context).toEqual({ tokens: 50_000, budget: DEEPSEEK_DISPLAY_BUDGET });
		await readingTurnEnded();
		const drawn = (bound.lines() ?? []).find(line => line.includes(CHILD_NAME)) as string;
		expect(drawn).toContain("Ctx:");
		expect(drawn).toContain("50,000/450.0K");
		// Nothing of the return was accounted: the same document, and the same one row.
		expect(JSON.parse(readFileSync(bound.file, "utf8"))).toEqual(JSON.parse(before));
		expect(
			(bound.runtime.presentation.of(MAIN_TARGET).agentTree ?? []).filter(one => one.kind === "session"),
		).toHaveLength(1);
	});
});
