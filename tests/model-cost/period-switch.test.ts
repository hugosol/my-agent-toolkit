/**
 * `/budget holiday` and `/budget clear`: the period switch, its entry conditions, the one boundary
 * balance query and the archive-then-publish order (P30, P31, P32, P33, P34, P35, P36; S2, S3, S4).
 *
 * The seam under test is production: the extension's real definition bound through the framework's
 * public binding (the port double, `tests/framework/support/harness-port-double.ts`), the command
 * the framework really registered driven the way an operator drives it, and the storage root read
 * back with plain file system calls rather than through the code that wrote it. What a case makes
 * controllable is the outside world alone — the harness's provider access, the outbound HTTP call
 * this extension's own balance query makes, the clock, and the coordination of the activity document
 * — never the store, the accounting or the action's own composition.
 *
 * The document every case binds over is self-made: a main session whose own consumption sits on a
 * DeepSeek pair (CNY) and on the allowance channel's pair (USD reference), so a case can tell
 * whether the archive and the new period kept the whole file across providers. The provider the
 * entry runs is a fact each invocation states, because the restriction is the entry's own current
 * provider rather than a choice of what is being reset.
 */
import { afterEach, describe, expect, test } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { MODEL_COST } from "../../extensions/model-cost/definition";
import type { ConsumptionDocument } from "../../extensions/model-cost/shared-logic/consumption-document";
import type { ModelPricingData } from "../../extensions/model-cost/shared-logic/model-data";
import type { ModelCostRuntime } from "../../extensions/model-cost/shared-logic/runtime";
import { createModelCostRuntime } from "../../extensions/model-cost/shared-logic/runtime";
import type { OwnerReference, SessionFacts, TurnSignal } from "../../framework/core/protocol";
import { updateFile } from "../../framework/modules/files";
import type { HttpRequestOptions } from "../../framework/modules/http";
import { type CommandRun, type PortDouble, portDouble } from "../framework/support/harness-port-double";

/** The self-made pricing data: one monetary official provider and the allowance channel. */
const DATA: ModelPricingData = {
	currency: "XTS",
	unit: "XTS per million tokens",
	peakMultiplier: 3,
	zoneOffsetMinutes: 8 * 60,
	peakWindows: [{ fromMinute: 9 * 60, toMinute: 12 * 60 }],
	tiers: { alpha: { input: 2, cacheRead: 0.5, output: 8 } },
	allowanceProviders: ["plan-provider"],
	models: {
		official: { "model-alpha": { mode: "monetary", tier: "alpha" } },
		// The entry's own provider and model, listed so a case's own requests are really accounted:
		// a pair this data does not name is hidden, and a hidden request is not this extension's.
		deepseek: { "deepseek-chat": { mode: "monetary", tier: "alpha" } },
	},
};

const HARNESS = "probe-harness";
const MAIN: SessionFacts = { sessionId: "session-main", kind: "main", name: "主会话", unavailable: [] };
const OWNER: OwnerReference = { kind: "owner", key: "main:period" };
const CONSUMPTION_FILE = "consumption.json";
const ESTIMATE_FILE = "codex-usage-estimate.json";

/** The instant every case runs on: one fixed reading of the process's own clock. */
const CLOCK = Date.parse("2026-10-05T00:00:00.000Z");

/** Every root a case created, removed after each case. */
const roots: string[] = [];

/**
 * The active document every case binds over: one main session holding two providers of its own, so
 * the whole-file rule of a reset is observable in one record, and a boundary balance the period
 * already recorded at its start.
 */
const TREE: ConsumptionDocument = {
	schemaVersion: 1,
	periodId: "period-before-switch",
	start: "2026-10-01T00:00:00.000Z",
	start_bal: 30.25,
	holiday: false,
	harnesses: {
		[HARNESS]: {
			sessions: [
				{
					id: "session-main",
					name: "主会话",
					parent: null,
					saveVersion: 3,
					own: {
						deepseek: {
							"deepseek-chat": {
								tokens: { input: 1000, cacheRead: 500, cacheWrite: 0, output: 200 },
								costCny: 0.031,
							},
						},
						"plan-provider": {
							"codex-model": {
								tokens: { input: 400, cacheRead: 100, cacheWrite: 50, output: 200 },
								referenceCostUsd: 0.02,
							},
						},
					},
				},
			],
		},
	},
};

/** The period a case closes when zero consumption is the subject: no harness bucket, no session. */
const EMPTY_PERIOD: ConsumptionDocument = {
	schemaVersion: 1,
	periodId: "period-empty",
	start: "2026-10-01T00:00:00.000Z",
	holiday: false,
	harnesses: {},
};

/** The balance answer a case's provider returns, in the provider's documented shape. */
function balanceAnswer(total: string): Response {
	return new Response(
		JSON.stringify({
			is_available: true,
			balance_infos: [{ currency: "CNY", total_balance: total, granted_balance: "0.00", topped_up_balance: total }],
		}),
		{ status: 200, headers: { "content-type": "application/json" } },
	);
}

/** One outbound request this entry made, with the options the query was sent under. */
interface Query {
	readonly url: string;
	readonly options: HttpRequestOptions | undefined;
}

/** One bound entry: the runtime the factory built, the double driving it, and the root it wrote. */
interface Bound {
	readonly runtime: ModelCostRuntime;
	readonly double: PortDouble;
	readonly root: string;
	readonly consumptionFile: string;
	/** Every request this entry's HTTP module was asked for, in order. */
	readonly queries: Query[];
}

/**
 * Binds the real extension over one baseline document and loads it through the real initialization.
 *
 * The runtime is built by a factory — the same shape the OMP harness assembly uses — so the
 * framework's public binding, the production factory and the one-time initialization are all in the
 * path every case observes through. The outbound call is substituted so the balance query answers
 * locally and can be counted; the clock is this case's own fixed instant, so a reading the entry
 * holds can never cross its own success TTL while a case runs. `answer` is what a case varies when
 * the boundary query's own outcome is its subject, and `onQuery` is how a case waits for the request
 * itself rather than for a duration.
 */
async function bind(
	options: {
		/** The document to bind over, as the plain JSON a case wrote: it may be one the extension refuses. */
		readonly document?: unknown;
		readonly answer?: (attempt: number) => Promise<Response> | Response;
		readonly onQuery?: (query: Query, attempt: number) => void;
		/** A document this case leaves absent, for a root that holds no activity yet. */
		readonly noDocument?: boolean;
	} = {},
): Promise<Bound> {
	const root = mkdtempSync(path.join(tmpdir(), "model-cost-period-switch-"));
	roots.push(root);
	const consumptionFile = path.join(root, CONSUMPTION_FILE);
	if (options.noDocument !== true) {
		writeFileSync(consumptionFile, JSON.stringify(options.document ?? TREE), "utf8");
	}
	const queries: Query[] = [];
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
				providerAccess: {
					resolve: async (provider: string) =>
						provider === "deepseek" ? { baseUrl: "https://host.example/v1", credential: "probe-key" } : undefined,
				},
				now: () => CLOCK,
				httpRequest: async (url: string, httpOptions?: HttpRequestOptions) => {
					const query: Query = { url, options: httpOptions };
					queries.push(query);
					options.onQuery?.(query, queries.length);
					return (options.answer ?? (() => balanceAnswer("12.50")))(queries.length);
				},
			});
			return runtime.implementation;
		},
	});
	double.deliverSession(OWNER, { session: MAIN });
	double.deliverSession(OWNER, { event: { kind: "session_facts" }, session: MAIN });
	await double.initiateRun(OWNER);
	return { runtime: runtime as ModelCostRuntime, double, root, consumptionFile, queries };
}

/** The archive files one root holds, by name. */
function archiveNames(root: string): string[] {
	const directory = path.join(root, "archives");
	return existsSync(directory) ? readdirSync(directory).sort() : [];
}

/** The one archive a root holds, parsed as the plain JSON document it is. */
function singleArchive(root: string): Record<string, unknown> {
	const names = archiveNames(root);
	expect(names).toHaveLength(1);
	return JSON.parse(readFileSync(path.join(root, "archives", names[0] ?? ""), "utf8")) as Record<string, unknown>;
}

/** The active consumption document of a root, parsed as the plain JSON document it is. */
function active(root: string): Record<string, unknown> {
	return JSON.parse(readFileSync(path.join(root, CONSUMPTION_FILE), "utf8")) as Record<string, unknown>;
}

/**
 * Holds one root's activity document, so everything submitted after this call waits behind the
 * returned gate.
 *
 * It models the one thing a switch must not race — a writer still publishing that document, here
 * this very process's own earlier snapshot — and it is deterministic on both sides: the framework's
 * coordination keeps call order, so a command driven after this call cannot reach the file until
 * the gate is released.
 */
function holdDocument(target: string): { readonly release: () => void; readonly held: Promise<unknown> } {
	const gate = Promise.withResolvers<void>();
	const held = updateFile(target, async current => {
		await gate.promise;
		return current;
	});
	return { release: () => gate.resolve(), held };
}

afterEach(() => {
	while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true });
});

describe("/budget exposes holiday and clear beside detail (P30, P32)", () => {
	test("the help names all three declared actions", async () => {
		const bound = await bind();

		const help = (await bound.double.runToCompletion("budget", { args: "" })).feedback[0]?.message ?? "";

		expect(help).toContain("detail");
		expect(help).toContain("holiday");
		expect(help).toContain("clear");
	});

	test("an argument that is not a whole action name is refused with the help and switches nothing", async () => {
		const bound = await bind();
		const before = readFileSync(bound.consumptionFile, "utf8");

		// There is no `off`, no abbreviation and no extra argument: the framework's whole-name match is
		// the only vocabulary `/budget` has, so this never reaches the business half at all.
		const refused = await bound.double.runToCompletion("budget", { args: "holiday off", provider: "deepseek" });

		expect(refused.feedback).toHaveLength(1);
		expect(refused.feedback[0]?.level).toBe("error");
		expect(refused.feedback[0]?.message).toContain("/budget");
		expect(readFileSync(bound.consumptionFile, "utf8")).toBe(before);
		expect(archiveNames(bound.root)).toEqual([]);
		expect(bound.queries).toHaveLength(1);
	});
});

describe("the period actions run only from a DeepSeek entry that is reliably idle with its save settled (P34)", () => {
	test("an entry running another provider is warned and nothing is written", async () => {
		const bound = await bind();
		const before = readFileSync(bound.consumptionFile, "utf8");

		const holiday = await bound.double.runToCompletion("budget", { args: "holiday", provider: "plan-provider" });
		const clear = await bound.double.runToCompletion("budget", { args: "clear", provider: undefined });

		expect(holiday.feedback).toHaveLength(1);
		expect(holiday.feedback[0]?.level).toBe("warning");
		expect(holiday.feedback[0]?.message).toContain("DeepSeek");
		expect(clear.feedback).toHaveLength(1);
		expect(clear.feedback[0]?.level).toBe("warning");
		expect(readFileSync(bound.consumptionFile, "utf8")).toBe(before);
		expect(archiveNames(bound.root)).toEqual([]);
		// Nothing but the provider gate ran: no balance read beyond the startup prefetch, and no State.
		expect(bound.queries).toHaveLength(1);
		expect(holiday.persisted).toEqual([]);
	});

	test("a working entry is warned, and no later state of the session makes the refusal run", async () => {
		const bound = await bind();

		const busy = await bound.double.runToCompletion("budget", { args: "clear", provider: "deepseek", idle: "busy" });

		expect(busy.feedback).toHaveLength(1);
		expect(busy.feedback[0]?.level).toBe("warning");
		// The refusal is not a queued operation: the document and the archive directory are untouched,
		// so nothing runs later whatever the session goes on to do.
		expect(active(bound.root).periodId).toBe("period-before-switch");
		expect(archiveNames(bound.root)).toEqual([]);
		expect(bound.queries).toHaveLength(1);
	});

	test("an activity state the harness cannot report is refused as an error, never guessed idle", async () => {
		const bound = await bind();

		const unknown = await bound.double.runToCompletion("budget", {
			args: "holiday",
			provider: "deepseek",
			idle: "unreported",
		});

		expect(unknown.feedback).toHaveLength(1);
		expect(unknown.feedback[0]?.level).toBe("error");
		expect(archiveNames(bound.root)).toEqual([]);
		expect(bound.queries).toHaveLength(1);
	});

	test("a save this entry started and has not seen land refuses the switch, and the switch is not queued behind it", async () => {
		const bound = await bind();
		// One Round of the entry's own session, with one settled Turn in it, so the Round's end has
		// consumption to save.
		bound.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: MAIN });
		const started: TurnSignal = {
			kind: "request_started",
			session: MAIN,
			at: CLOCK,
			provider: "deepseek",
			model: "deepseek-chat",
		};
		const settled: TurnSignal = {
			kind: "response_settled",
			session: MAIN,
			at: CLOCK,
			outcome: "completed",
			readings: [{ input: 10, output: 10, cacheRead: 0, cacheWrite: 0, totalTokens: 20 }],
		};
		bound.double.deliverTurn(started, { owner: OWNER });
		bound.double.deliverTurn(settled, { owner: OWNER });
		// The document is held, so the Round's own save is on its way and has not landed yet.
		const hold = holdDocument(bound.consumptionFile);
		bound.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: MAIN });

		const refused = await bound.double.runToCompletion("budget", { args: "clear", provider: "deepseek" });

		expect(refused.feedback).toHaveLength(1);
		expect(refused.feedback[0]?.level).toBe("warning");
		expect(archiveNames(bound.root)).toEqual([]);
		expect(bound.queries).toHaveLength(1);

		// Releasing the document lets the very save that was in flight land — the next version of the
		// session's own snapshot — which is what the refusal was about: the consumption it carried is
		// on disk afterwards, and no new period replaced it.
		hold.release();
		await hold.held;
		await updateFile(bound.consumptionFile, current => current);
		expect(bound.runtime.storage.session(HARNESS, MAIN.sessionId)?.saveVersion).toBe(4);
		expect(active(bound.root).periodId).toBe("period-before-switch");
	});
});

describe("a switch archives the whole file it closes and opens the next period in one commit (P30, P32)", () => {
	test("the first holiday leaves the closed period whole, holiday and all, and opens a holiday period", async () => {
		const bound = await bind({
			// The startup prefetch answers 12.50; the boundary read answers 7.75, so the value both
			// sides carry is the one the switch's own query obtained rather than the reading already held.
			answer: attempt => balanceAnswer(attempt === 1 ? "12.50" : "7.75"),
		});

		const run = await bound.double.runToCompletion("budget", { args: "holiday", provider: "deepseek" });

		expect(run.feedback).toHaveLength(1);
		expect(run.feedback[0]?.level).toBe("info");
		// What the period was closed with is the whole document the file held, every provider included,
		// plus the instant it ended and the boundary balance that instant was read at.
		expect(singleArchive(bound.root)).toEqual({
			...TREE,
			end: new Date(CLOCK).toISOString(),
			end_bal: 7.75,
		});
		// The new activity is one commit: a new generation, the same instant as the archive's end, the
		// same reading as its own start balance, holiday already true, and no session carried over.
		const document = active(bound.root);
		expect(document.periodId).not.toBe("period-before-switch");
		expect(document).toEqual({
			schemaVersion: 1,
			periodId: document.periodId,
			start: new Date(CLOCK).toISOString(),
			start_bal: 7.75,
			holiday: true,
			harnesses: {},
		});
		expect(run.persisted).toEqual([]);
		expect(bound.queries).toHaveLength(2);
	});

	test("clear archives a period that consumed nothing and opens an ordinary period", async () => {
		const bound = await bind({ document: EMPTY_PERIOD });

		const run = await bound.double.runToCompletion("budget", { args: "clear", provider: "deepseek" });

		expect(run.feedback).toHaveLength(1);
		expect(run.feedback[0]?.level).toBe("info");
		expect(singleArchive(bound.root)).toEqual({
			...EMPTY_PERIOD,
			end: new Date(CLOCK).toISOString(),
			end_bal: 12.5,
		});
		const document = active(bound.root);
		expect(document).toEqual({
			schemaVersion: 1,
			periodId: document.periodId,
			start: new Date(CLOCK).toISOString(),
			start_bal: 12.5,
			holiday: false,
			harnesses: {},
		});
	});

	test("a clear on a root that saved nothing yet still closes the period the entry is in", async () => {
		const bound = await bind({ noDocument: true });
		const fresh = bound.runtime.storage.period();

		const run = await bound.double.runToCompletion("budget", { args: "clear", provider: "deepseek" });

		expect(run.feedback[0]?.level).toBe("info");
		expect(singleArchive(bound.root)).toEqual({
			schemaVersion: 1,
			periodId: fresh?.periodId,
			start: fresh?.start,
			holiday: false,
			harnesses: {},
			end: new Date(CLOCK).toISOString(),
			end_bal: 12.5,
		});
		expect(active(bound.root).periodId).not.toBe(fresh?.periodId);
	});

	test("an already-open holiday is answered idempotently, without switching, archiving or querying", async () => {
		const bound = await bind({ document: { ...TREE, periodId: "period-holiday", holiday: true } });

		const run = await bound.double.runToCompletion("budget", { args: "holiday", provider: "deepseek" });

		expect(run.feedback).toHaveLength(1);
		expect(run.feedback[0]?.level).toBe("info");
		expect(active(bound.root).periodId).toBe("period-holiday");
		expect(archiveNames(bound.root)).toEqual([]);
		// No balance was read for a period that is not ending: the startup prefetch is the only request.
		expect(bound.queries).toHaveLength(1);
	});

	test("a switch drops what this instance accumulated for the closed period, and the next request starts from zero", async () => {
		const bound = await bind();
		// One Round whose Turn is accounted while this is still the open period, and which has not been
		// saved yet: the instance holds the loaded record plus this Turn's own addition.
		bound.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: MAIN });
		bound.double.deliverTurn(
			{ kind: "request_started", session: MAIN, at: CLOCK, provider: "deepseek", model: "deepseek-chat" },
			{ owner: OWNER },
		);
		bound.double.deliverTurn(
			{
				kind: "response_settled",
				session: MAIN,
				at: CLOCK,
				outcome: "completed",
				readings: [{ input: 10, output: 10, cacheRead: 0, cacheWrite: 0, totalTokens: 20 }],
			},
			{ owner: OWNER },
		);
		// The loaded record's own 0.031 plus this Turn's own 0.0001, hand-added.
		expect(bound.runtime.view.own(MAIN.sessionId)?.deepseek?.["deepseek-chat"]?.costCny).toBe(0.0311);

		const run = await bound.double.runToCompletion("budget", { args: "clear", provider: "deepseek" });

		expect(run.feedback[0]?.level).toBe("info");
		// What the period closed with is only what the file held: the Turn this instance had accounted
		// but not saved was not collected, and no session was forced to save first.
		expect(singleArchive(bound.root)).toEqual({ ...TREE, end: new Date(CLOCK).toISOString(), end_bal: 12.5 });
		// The closed period's accumulation is not the new period's: this instance answers nothing for it.
		expect(bound.runtime.view.own(MAIN.sessionId)).toBeUndefined();

		// The Round that was open when the period closed is not published into the new one either.
		bound.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: MAIN });
		await updateFile(bound.consumptionFile, current => current);
		expect(Object.keys(active(bound.root).harnesses as object)).toEqual([]);

		// A new Round's own Turn is what the new period holds, from the session's own first version.
		bound.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: MAIN });
		bound.double.deliverTurn(
			{ kind: "request_started", session: MAIN, at: CLOCK, provider: "deepseek", model: "deepseek-chat" },
			{ owner: OWNER },
		);
		bound.double.deliverTurn(
			{
				kind: "response_settled",
				session: MAIN,
				at: CLOCK,
				outcome: "completed",
				readings: [{ input: 10, output: 10, cacheRead: 0, cacheWrite: 0, totalTokens: 20 }],
			},
			{ owner: OWNER },
		);
		bound.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: MAIN });
		await updateFile(bound.consumptionFile, current => current);

		expect(bound.runtime.storage.session(HARNESS, MAIN.sessionId)).toEqual({
			id: "session-main",
			name: "主会话",
			parent: null,
			saveVersion: 1,
			own: {
				deepseek: {
					"deepseek-chat": {
						tokens: { input: 10, cacheRead: 0, cacheWrite: 0, output: 10 },
						costCny: 0.0001,
					},
				},
			},
		});
	});

	test("an earlier archive is never replaced by a later switch", async () => {
		const bound = await bind();

		const first = await bound.double.runToCompletion("budget", { args: "clear", provider: "deepseek" });
		const firstNames = archiveNames(bound.root);
		const firstFile = path.join(bound.root, "archives", firstNames[0] ?? "");
		const firstBytes = readFileSync(firstFile, "utf8");
		const second = await bound.double.runToCompletion("budget", { args: "holiday", provider: "deepseek" });
		const secondNames = archiveNames(bound.root);

		expect(first.feedback[0]?.level).toBe("info");
		expect(second.feedback[0]?.level).toBe("info");
		expect(secondNames).toHaveLength(2);
		expect(secondNames).toContain(firstNames[0]);
		// The archive the first switch wrote is the same document it was: a closed period is a record
		// rather than something a later period's close may write over.
		expect(readFileSync(firstFile, "utf8")).toBe(firstBytes);
	});
});

describe("the one boundary balance read is made outside the coordination and used by both sides (P36)", () => {
	test("the read is out before the activity document is coordinated, and the command waits for the real commit", async () => {
		const boundaryRead = Promise.withResolvers<Query>();
		const bound = await bind({
			onQuery: (query, attempt) => {
				if (attempt === 2) boundaryRead.resolve(query);
			},
		});
		const hold = holdDocument(bound.consumptionFile);
		const run = bound.double.runToCompletion("budget", { args: "clear", provider: "deepseek" });

		// The request is observed by the outside world while the document is still held by another
		// writer: the balance read is taken outside the file coordination and does not wait for it.
		const query = await boundaryRead.promise;
		expect(query.url).toBe("https://host.example/user/balance");
		expect(query.options).toEqual({
			method: "GET",
			headers: { authorization: "Bearer probe-key" },
			timeoutMs: 5000,
			proxy: false,
		});
		expect(archiveNames(bound.root)).toEqual([]);
		expect(active(bound.root).periodId).toBe("period-before-switch");

		hold.release();
		await hold.held;
		await run;

		// One attempt, and the switch happened once the document was free.
		expect(bound.queries).toHaveLength(2);
		expect(active(bound.root).periodId).not.toBe("period-before-switch");
	});

	test("a boundary read that fails leaves both balance fields out and the switch still happens", async () => {
		const bound = await bind({
			answer: attempt => {
				if (attempt === 1) return balanceAnswer("12.50");
				throw new Error("the provider is unreachable");
			},
		});

		const run = await bound.double.runToCompletion("budget", { args: "clear", provider: "deepseek" });

		expect(run.feedback[0]?.level).toBe("info");
		// One attempt, no retry, and the reading the entry already held is not put in its place.
		expect(bound.queries).toHaveLength(2);
		const closed = singleArchive(bound.root);
		expect(closed.end).toBe(new Date(CLOCK).toISOString());
		expect("end_bal" in closed).toBe(false);
		const document = active(bound.root);
		expect("start_bal" in document).toBe(false);
		expect(document.holiday).toBe(false);
		expect(document.harnesses).toEqual({});
	});
});

describe("a switch touches nothing but the period it closes (P33)", () => {
	test("earlier archives, the independent estimate and the entry's detail all survive", async () => {
		const bound = await bind();
		const archives = path.join(bound.root, "archives");
		mkdirSync(archives, { recursive: true });
		const earlier = path.join(archives, "aaaaaaaa-0000-4000-8000-000000000000.json");
		const earlierBytes = JSON.stringify({ schemaVersion: 1, an: "earlier archive" });
		writeFileSync(earlier, earlierBytes, "utf8");
		const estimate = path.join(bound.root, ESTIMATE_FILE);
		const estimateBytes = JSON.stringify({ baseline: "kept", ratio: 3.5 });
		writeFileSync(estimate, estimateBytes, "utf8");
		const target = { sessionId: "session-main", provider: "official", model: "model-alpha" } as const;
		await bound.double.runToCompletion("budget", { args: "detail", provider: "deepseek" });
		expect(bound.runtime.presentation.of(target).form).toBe("detail");

		const run = await bound.double.runToCompletion("budget", { args: "clear", provider: "deepseek" });

		expect(run.feedback[0]?.level).toBe("info");
		expect(readFileSync(earlier, "utf8")).toBe(earlierBytes);
		expect(readFileSync(estimate, "utf8")).toBe(estimateBytes);
		expect(bound.runtime.presentation.of(target).form).toBe("detail");
		expect(archiveNames(bound.root)).toHaveLength(2);
	});
});

describe("a switch reports exactly how far it got and never reports success early (P35)", () => {
	test("an archive that could not be written leaves the activity alone and is reported once", async () => {
		const bound = await bind();
		// A file where the archive directory belongs: no archive can be created there.
		writeFileSync(path.join(bound.root, "archives"), "not a directory", "utf8");
		const before = readFileSync(bound.consumptionFile, "utf8");

		const run = await bound.double.runToCompletion("budget", { args: "clear", provider: "deepseek" });

		expect(run.feedback).toHaveLength(1);
		expect(run.feedback[0]?.level).toBe("error");
		expect(run.feedback[0]?.message).toStartWith("/budget clear failed: ");
		expect(run.feedback[0]?.message).toContain("归档未生成");
		expect(readFileSync(bound.consumptionFile, "utf8")).toBe(before);
	});

	test("an archive that landed while the new activity did not keeps its stage and reports no success", async () => {
		const bound = await bind();
		// The archive directory is ready and writable; what is refused is the activity document's own
		// publication — on this platform either the target is a file that cannot be replaced, or the
		// directory it would be replaced in no longer accepts a new file.
		mkdirSync(path.join(bound.root, "archives"), { recursive: true });
		if (process.platform === "win32") chmodSync(bound.consumptionFile, 0o444);
		else chmodSync(bound.root, 0o555);
		const before = readFileSync(bound.consumptionFile, "utf8");

		const run = await bound.double.runToCompletion("budget", { args: "holiday", provider: "deepseek" });

		expect(run.feedback).toHaveLength(1);
		expect(run.feedback[0]?.level).toBe("error");
		const message = run.feedback[0]?.message ?? "";
		expect(message).toStartWith("/budget holiday failed: ");
		expect(message).toContain("归档已生成");
		expect(message).toContain("未提交");
		// The archive of the period this attempt closed is kept, and the activity file is untouched.
		expect(singleArchive(bound.root).periodId).toBe("period-before-switch");
		expect(readFileSync(bound.consumptionFile, "utf8")).toBe(before);

		// Restore what this case changed, so its own root can be removed afterwards.
		if (process.platform === "win32") chmodSync(bound.consumptionFile, 0o666);
		else chmodSync(bound.root, 0o755);
	});

	test("a baseline this instance cannot use is refused as an error, without being overwritten", async () => {
		// A document of another format: the initialization pauses this instance rather than guessing, and
		// the command has no period to close.
		const bound = await bind({
			document: { schemaVersion: 2, periodId: "period-unknown", start: "2026-10-01T00:00:00.000Z", holiday: false, harnesses: {} },
		});
		const before = readFileSync(bound.consumptionFile, "utf8");

		const run = await bound.double.runToCompletion("budget", { args: "clear", provider: "deepseek" });

		expect(run.feedback).toHaveLength(1);
		expect(run.feedback[0]?.level).toBe("error");
		expect(run.feedback[0]?.message).toStartWith("/budget clear failed: ");
		expect(run.feedback[0]?.message).toContain("没有可用的消费存储基线");
		expect(readFileSync(bound.consumptionFile, "utf8")).toBe(before);
		expect(archiveNames(bound.root)).toEqual([]);
		// No balance is read for a period that cannot be closed at all: the startup prefetch is the only request.
		expect(bound.queries).toHaveLength(1);
	});

	test("a publication that cannot even begin reports no change and writes nothing", async () => {
		const bound = await bind();
		// The root is moved away after the load, so the coordinated publication can resolve neither its
		// target's directory nor a place to archive into: that is a failure of the switch itself.
		const moved = `${bound.root}-moved`;
		renameSync(bound.root, moved);
		const before = readFileSync(path.join(moved, CONSUMPTION_FILE), "utf8");
		try {
			const run = await bound.double.runToCompletion("budget", { args: "clear", provider: "deepseek" });

			expect(run.feedback).toHaveLength(1);
			expect(run.feedback[0]?.level).toBe("error");
			expect(run.feedback[0]?.message).toStartWith("/budget clear failed: ");
			expect(run.feedback[0]?.message).toContain("消费活动未提交");
			expect(readFileSync(path.join(moved, CONSUMPTION_FILE), "utf8")).toBe(before);
			expect(archiveNames(moved)).toEqual([]);
		} finally {
			renameSync(moved, bound.root);
		}
	});

	test("nothing is said while the document is still being published, and success follows the commit", async () => {
		const boundaryRead = Promise.withResolvers<Query>();
		const bound = await bind({
			onQuery: (_query, attempt) => {
				if (attempt === 2) boundaryRead.resolve(_query);
			},
		});
		const hold = holdDocument(bound.consumptionFile);
		const run: CommandRun = bound.double.run("budget", { args: "clear", provider: "deepseek" });

		// The command has read the balance and is waiting on the document: nothing has been announced,
		// and the activity the switch is about has not moved.
		await boundaryRead.promise;
		for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
		expect(run.feedback).toEqual([]);
		expect(archiveNames(bound.root)).toEqual([]);
		expect(active(bound.root).periodId).toBe("period-before-switch");

		hold.release();
		await hold.held;
		await run.completion;

		expect(run.feedback).toHaveLength(1);
		expect(run.feedback[0]?.level).toBe("info");
		expect(active(bound.root).holiday).toBe(false);
	});
});
