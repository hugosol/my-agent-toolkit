/**
 * A disposed session's Round commits what was really measured (S1, S3; contract P27, P28, P29; ticket 10).
 *
 * What this suite drives is the *pi* realization of the disposal close-out through the extension's
 * production pi assembly: the runtime built from the framework's validated configuration, the
 * extension's real definition and its own `config.yaml`, behind the framework's real pi adapter, bound
 * to a controlled native surface. The facts are the ones a pi process publishes — a session's start
 * with pi's own lineage link, pi's run-cycle facts, the request about to be sent and the finalized
 * message that settles it, and the session's own shutdown — so what moves the accounting is the mapping
 * a real run uses.
 *
 * Two outcomes are read where a consumer reads them: the document the run really wrote under the `pi`
 * harness bucket, and the notices the extension published. A session disposed while its Round was
 * still open is *truncated*: the usage it really reported commits under its own identity, the working
 * time that was never measured is not filled in from the wall clock, the period's observation of that
 * session is marked incomplete, and nothing claims the task succeeded. A session whose own end was
 * already stated is *confirmed*, and its interval is the one it really measured. The price data is
 * self-made (one monetary provider, one tier; off-peak is `input·2 + cacheRead·0.5 + output·8` per
 * million tokens), and every amount asserted below is written here by hand from those numbers rather
 * than recomputed from the implementation.
 */
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import {
	type PiAssistantMessage,
	type PiExtensionApi,
	type PiExtensionContext,
	type PiSessionHeader,
	piAdapter,
} from "../../framework/adapters/pi";
import { MODEL_COST } from "../../extensions/model-cost/definition";
import { MODEL_COST_HARNESS } from "../../extensions/model-cost/harnesses/pi";
import { MODEL_COST_WIDGET_KEY, attachModelCostWidget } from "../../extensions/model-cost/harnesses/pi/widget";
import type { ConsumptionDocument, SessionRecord } from "../../extensions/model-cost/shared-logic/accounting/consumption-document";
import type { ModelPricingData } from "../../extensions/model-cost/shared-logic/pricing/model-data";
import { type ModelCostRuntime, createModelCostRuntime } from "../../extensions/model-cost/shared-logic/runtime";
import { PROVIDER_READY_CHANNEL, forgetSessionLivenessRegistry, registerProviderLiveness } from "../framework/support/pi-surface-double";
import { uiBoundaryTimerOf } from "./support/ui-timer";

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

/** One Beijing wall-clock reading on Wednesday 2026-10-14, as the epoch instant a request carries. */
function atBeijing(hours: number, minutes = 0, seconds = 0, ms = 0): number {
	return Date.UTC(2026, 9, 14, hours, minutes, seconds, ms) - BEIJING_OFFSET_MS;
}

/** The self-made pricing data every case drives: one monetary provider, one tier, no allowance. */
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

/** The provider and model these sessions run. */
const PROVIDER = "official";
const MODEL = "model-alpha";

/** The usage the one completed request of a disposed round really reported. */
const USAGE = { input: 2_000, cacheRead: 1_000, cacheWrite: 0, output: 500, totalTokens: 3_500 };

/** What that usage costs at the tier's off-peak price: `(2_000·2 + 1_000·0.5 + 500·8) / 1e6`. */
const AMOUNT = 0.0085;

/** How long the activity these cases dispose ran, as the clock this suite advances by itself. */
const ACTIVITY_MS = 300;

/** The document the extension keeps in its storage root. */
const CONSUMPTION_FILE = "consumption.json";

const STORAGE_ROOT = mkdtempSync(path.join(tmpdir(), "pi-disposal-store-"));
const REPOSITORY_ROOT = mkdtempSync(path.join(tmpdir(), "pi-disposal-repo-"));
const SESSION_FILES = mkdtempSync(path.join(tmpdir(), "pi-disposal-sessions-"));
const CONSUMPTION_FILE_PATH = path.join(STORAGE_ROOT, CONSUMPTION_FILE);
mkdirSync(path.join(REPOSITORY_ROOT, "extensions", "model-cost"), { recursive: true });
writeFileSync(
	path.join(REPOSITORY_ROOT, "extensions", "model-cost", "config.yaml"),
	[`storageDir: '${STORAGE_ROOT.replace(/\\/g, "/")}'`, "balanceTtlMs: 30000", "codexQuotaTtlMs: 15000", ""].join("\n"),
	"utf8",
);

/** The child entry this assembly requires in the sessions a provider spawns. */
const CHILD_ENTRY = path.join(path.resolve(import.meta.dir, "..", ".."), "entrypoints", "pi", "model-cost.ts");

/** One pi session file as pi writes it: the header is the first line, and its own `id` is the identity. */
function sessionFile(name: string, header: PiSessionHeader): string {
	const file = path.join(SESSION_FILES, name);
	writeFileSync(file, `${JSON.stringify(header)}\n`, "utf8");
	return file;
}

/** The file pi created for this suite's main session. */
const MAIN_FILE = sessionFile("disposal-main.jsonl", { type: "session", id: "pi-disposal-main" });

/** One session as pi's own surface reports it, for the cases below. */
interface PiSession {
	readonly sessionId: string;
	name?: string;
	readonly header?: PiSessionHeader;
	readonly model?: { readonly id?: string; readonly provider?: string };
	readonly thinkingLevel?: string;
	idle?: boolean;
	pending?: boolean;
}

/** The top-level session this binding serves. */
const MAIN = {
	sessionId: "pi-disposal-main",
	name: "pi 处置主会话",
	header: { type: "session", id: "pi-disposal-main" },
	model: { id: MODEL, provider: PROVIDER },
	thinkingLevel: "high",
	idle: true,
	pending: false,
} satisfies PiSession;

/** A session pi spawned from that one: its own identity, with the lineage link pi's header carries. */
const CHILD = {
	sessionId: "pi-disposal-child",
	name: "pi 处置子会话",
	header: { type: "session", id: "pi-disposal-child", parentSession: MAIN_FILE },
	model: { id: MODEL, provider: PROVIDER },
	thinkingLevel: "high",
	idle: true,
	pending: false,
} satisfies PiSession;

/** One notice the extension published through the surface, with the severity it carried. */
interface Notice {
	readonly level: string;
	readonly message: string;
}

/** The pi native surface the assembly is bound to, with everything a case delivers and reads. */
interface PiSurface {
	readonly api: PiExtensionApi;
	readonly runtime: ModelCostRuntime;
	readonly notices: readonly Notice[];
	/** One session starting. */
	sessionStarts(session: PiSession, reason: "startup" | "new"): void;
	/**
	 * The subagent provider announcing itself on its own published channel, before any session begins.
	 *
	 * A run whose provider has announced itself is answered where it is read; a process where it never
	 * does waits out the integration's own announcement budget instead, which this suite's clock does
	 * not advance.
	 */
	announceProvider(session: PiSession): void;
	/** pi's agent loop beginning: the Round's own beginning. */
	runStarts(session: PiSession): void;
	/** pi's run fully settled, with the abort fact it carries. */
	runSettles(session: PiSession, options?: { readonly aborted?: boolean }): void;
	/** One request about to be issued, and the finalized message that settles it. */
	requestSettles(session: PiSession, message: PiAssistantMessage): void;
	/**
	 * One session ending, awaited as pi awaits it: the close-out the framework owes there, and the
	 * session axis's own end, are both done when this settles.
	 */
	sessionEnds(session: PiSession, reason: "quit" | "reload" | "new" | "resume" | "fork"): Promise<void>;
	/** One run initiation, awaited: the one-time initialization runs here. */
	agentStarts(session: PiSession): Promise<void>;
}

/** The production extension assembled on pi and bound to a controlled native surface. */
function assemblePiSurface(): PiSurface {
	const handlers = new Map<string, Array<(event: unknown, ctx: PiExtensionContext) => unknown>>();
	const busHandlers = new Map<string, Array<(data: unknown) => void>>();
	const notices: Notice[] = [];
	let runtime: ModelCostRuntime | undefined;
	let releaseFrontend: (() => void) | undefined;

	const contextOf = (session: PiSession): PiExtensionContext =>
		({
			sessionManager: {
				getSessionId: () => session.sessionId,
				getSessionName: () => session.name,
				getBranch: () => [],
				getHeader: () => session.header,
			},
			// This surface publishes no model registry: a run whose provider access is absent asks the
			// provider nothing, which is what keeps every case below off the network.
			model: session.model,
			thinkingLevel: session.thinkingLevel,
			hasUI: true,
			ui: {
				notify: (message: string, level?: string) => void notices.push({ level: level ?? "info", message }),
				setWidget: () => {},
			},
			getContextUsage: () => ({ tokens: 20_000, contextWindow: 450_000 }),
			isIdle: () => session.idle === true,
			hasPendingMessages: () => session.pending === true,
		}) as unknown as PiExtensionContext;

	const bus = {
		on(channel: string, handler: (data: unknown) => void): () => void {
			const list = busHandlers.get(channel) ?? [];
			list.push(handler);
			busHandlers.set(channel, list);
			return () => {
				const current = busHandlers.get(channel);
				const index = current?.indexOf(handler) ?? -1;
				if (current !== undefined && index >= 0) current.splice(index, 1);
			};
		},
		emit(channel: string, data: unknown): void {
			for (const handler of [...(busHandlers.get(channel) ?? [])]) handler(data);
		},
	};

	const api = {
		events: bus,
		on(event: string, handler: (event: unknown, ctx: PiExtensionContext) => unknown): () => void {
			const list = handlers.get(event) ?? [];
			list.push(handler);
			handlers.set(event, list);
			return () => {
				const current = handlers.get(event);
				const index = current?.indexOf(handler) ?? -1;
				if (current !== undefined && index >= 0) current.splice(index, 1);
			};
		},
		registerCommand(): void {},
		appendEntry(): void {},
	} as unknown as PiExtensionApi;

	const deliver = (event: string, payload: unknown, session: PiSession): readonly unknown[] => {
		const ctx = contextOf(session);
		return [...(handlers.get(event) ?? [])].map(handler => handler(payload, ctx));
	};

	const surface: PiSurface = {
		api,
		get runtime(): ModelCostRuntime {
			if (runtime === undefined) throw new Error("the extension's runtime was read before its binding built it");
			return runtime;
		},
		notices,
		announceProvider: session =>
			bus.emit(PROVIDER_READY_CHANNEL, {
				version: 1,
				methods: ["ping"],
				session: { cwd: process.cwd(), sessionId: session.sessionId, sessionFile: MAIN_FILE },
			}),
		sessionStarts: (session, reason) => void deliver("session_start", { type: "session_start", reason }, session),
		runStarts: session => void deliver("agent_start", { type: "agent_start" }, session),
		runSettles: (session, options = {}) =>
			void deliver("agent_settled", { type: "agent_settled", aborted: options.aborted ?? false }, session),
		requestSettles: (session, message) => {
			deliver("before_provider_request", { type: "before_provider_request" }, session);
			deliver("after_provider_response", { type: "after_provider_response", status: 200, headers: {} }, session);
			deliver("message_end", { type: "message_end", message }, session);
		},
		sessionEnds: async (session, reason) => {
			// pi awaits each handler for this fact before its teardown continues, so this is awaited too.
			for (const handler of [...(handlers.get("session_shutdown") ?? [])]) {
				await handler({ type: "session_shutdown", reason }, contextOf(session));
			}
		},
		agentStarts: async session => {
			await Promise.all(deliver("before_agent_start", { type: "before_agent_start", messageType: "new" }, session));
		},
	};

	const bind = piAdapter(MODEL_COST, {
		configBaseDir: REPOSITORY_ROOT,
		childEntry: CHILD_ENTRY,
		factory: context => {
			const built = createModelCostRuntime({
				config: { ...context.config, storageDir: STORAGE_ROOT },
				configDirectory: path.join(REPOSITORY_ROOT, "extensions", MODEL_COST.id),
				userHomeDirectory: STORAGE_ROOT,
				harness: MODEL_COST_HARNESS,
				data: DATA,
			});
			runtime = built;
			const cleanup = built.implementation.cleanup;
			return {
				...built.implementation,
				cleanup: () => {
					releaseFrontend?.();
					releaseFrontend = undefined;
					return cleanup?.();
				},
			};
		},
	});
	if (!bind(surface.api).bound) throw new Error("the model-cost pi assembly did not bind");
	releaseFrontend = attachModelCostWidget(surface.api, surface.runtime, uiBoundaryTimerOf(surface.runtime));
	return surface;
}

/** One assistant response as pi hands its finalized message over. */
function assistantMessage(usage: typeof USAGE, responseId: string): PiAssistantMessage {
	return { role: "assistant", stopReason: "stop", responseId, usage: { ...usage } };
}

/**
 * One turn of the harness's own next task, and the file system behind it.
 *
 * pi's `nextTask` — where the framework arranges the Round's end re-check — is a zero-delay timer, and
 * this suite's clock is faked along with the timer queue, so the re-check runs only when the clock is
 * advanced. The step is the interval the framework's own file coordination polls at; the immediate turn
 * after it is what lets the bytes a save writes land.
 */
async function harnessTask(): Promise<void> {
	vi.advanceTimersByTime(25);
	const { promise, resolve } = Promise.withResolvers<void>();
	setImmediate(resolve);
	await promise;
}

/** The document one file holds right now, or `undefined` while it holds none this suite can read. */
function readDocument(file: string): ConsumptionDocument | undefined {
	if (!existsSync(file)) return undefined;
	try {
		return JSON.parse(readFileSync(file, "utf8")) as ConsumptionDocument;
	} catch {
		return undefined;
	}
}

/** One session's record out of the document's own harness bucket. */
function piRecord(file: string, id: string): SessionRecord | undefined {
	return readDocument(file)?.harnesses[MODEL_COST_HARNESS]?.sessions.find(record => record.id === id);
}

/**
 * Waits until the document holds a record for one session, and answers it.
 *
 * A commit is a coordinated file update: what a Round's end starts lands over the harness's own task
 * turns, which this suite advances by itself rather than waiting on wall time.
 */
async function savedRecord(id: string): Promise<SessionRecord> {
	for (let attempt = 0; attempt < 200; attempt += 1) {
		const record = piRecord(CONSUMPTION_FILE_PATH, id);
		if (record !== undefined) return record;
		await harnessTask();
	}
	throw new Error(
		`no record for ${id} was published at ${CONSUMPTION_FILE_PATH}; it holds ${JSON.stringify(readDocument(CONSUMPTION_FILE_PATH))}`,
	);
}

beforeEach(() => {
	vi.useFakeTimers({ now: atBeijing(13, 0) });
	forgetSessionLivenessRegistry();
});

afterEach(() => {
	vi.useRealTimers();
	// Each case states the storage root's content itself, so nothing a case wrote reaches the next one.
	for (const entry of [CONSUMPTION_FILE, "codex-estimate.json", "cost-archive"]) {
		rmSync(path.join(STORAGE_ROOT, entry), { recursive: true, force: true });
	}
	forgetSessionLivenessRegistry();
});

afterAll(() => {
	rmSync(STORAGE_ROOT, { recursive: true, force: true });
	rmSync(REPOSITORY_ROOT, { recursive: true, force: true });
	rmSync(SESSION_FILES, { recursive: true, force: true });
});

/**
 * One started binding of this suite's assembly, with both sessions begun and the provider registered
 * for each of them: a session whose own work the provider states it holds nothing beyond, so a settle
 * can end its Round.
 */
async function startedSession(): Promise<PiSurface> {
	const surface = assemblePiSurface();
	surface.announceProvider(MAIN);
	surface.sessionStarts(MAIN, "startup");
	surface.sessionStarts(CHILD, "startup");
	await surface.agentStarts(MAIN);
	for (const session of [MAIN, CHILD]) {
		const registration = registerProviderLiveness({ sessionId: session.sessionId, isActive: () => false });
		if (!registration.registered) {
			throw new Error("this framework's own session-liveness registry was not published for the run");
		}
	}
	return surface;
}

describe("a disposed session's open Round is truncated and commits what it really measured (P28)", () => {
	test("the usage the session reported commits, no interval is filled in, and the period is marked incomplete", async () => {
		const surface = await startedSession();
		const ledger = surface.runtime.view;

		// The child's activity: a Round that begins, one request that completes and reports its usage,
		// and the session disposed while that Round is still open — the activity's own end is never
		// stated, and its working time is therefore never measured.
		surface.runStarts(CHILD);
		surface.requestSettles(CHILD, assistantMessage(USAGE, "resp-truncated-1"));
		vi.advanceTimersByTime(ACTIVITY_MS);
		await surface.sessionEnds(CHILD, "quit");
		// The commit is the close-out's own work, so it is on its way when the host's position answers.
		await harnessTask();

		expect(piRecord(CONSUMPTION_FILE_PATH, CHILD.sessionId)).toEqual({
			id: CHILD.sessionId,
			name: CHILD.name,
			parent: MAIN.sessionId,
			startup: { model: { provider: PROVIDER, model: MODEL }, effort: "high" },
			saveVersion: 1,
			own: { official: { "model-alpha": { tokens: { input: 2_000, cacheRead: 1_000, cacheWrite: 0, output: 500 }, costCny: AMOUNT } } },
			// The mark, and nothing else: no `runtimeMs` is written at all, because an activity whose own
			// end was never observed is not a duration this period measured.
			runtimeGap: true,
		});
		// The operator is told what was not measured, at the severity of a fact rather than of a failure,
		// and nothing in it claims the activity or the task succeeded.
		expect(surface.notices).toEqual([
			{
				level: "warning",
				message:
					"子代理活动在会话处置时仍未结束：本次活动的耗时未记录，已保留此前有效值，并标记本周期该 Session 的耗时观测存在缺口；已确认的消费不受影响。",
			},
		]);
		expect(ledger.own(CHILD.sessionId)).toEqual({
			official: { "model-alpha": { tokens: { input: 2_000, cacheRead: 1_000, cacheWrite: 0, output: 500 }, costCny: AMOUNT } },
		});
	});

	test("a top-level session's open Round is truncated too, and its session writes no runtime at all", async () => {
		const surface = await startedSession();

		surface.runStarts(MAIN);
		surface.requestSettles(MAIN, assistantMessage(USAGE, "resp-truncated-main"));
		vi.advanceTimersByTime(ACTIVITY_MS);
		await surface.sessionEnds(MAIN, "quit");
		await harnessTask();

		// A main session has no subagent runtime to measure: what the truncation commits is exactly the
		// usage the request really reported, with no figure invented for the time it ran.
		expect(piRecord(CONSUMPTION_FILE_PATH, MAIN.sessionId)).toEqual({
			id: MAIN.sessionId,
			name: MAIN.name,
			parent: null,
			startup: { model: { provider: PROVIDER, model: MODEL }, effort: "high" },
			saveVersion: 1,
			own: { official: { "model-alpha": { tokens: { input: 2_000, cacheRead: 1_000, cacheWrite: 0, output: 500 }, costCny: AMOUNT } } },
		});
		// Nothing claims an activity ended: the truncation is not a task-success notice.
		expect(surface.notices.filter(notice => notice.level !== "info").every(notice => notice.message.includes("缺口"))).toBe(true);
	});
});

describe("a session whose own end was stated is confirmed at its disposal (P27)", () => {
	test("the interval the activity really ran for is the one committed, and no gap is marked", async () => {
		const surface = await startedSession();

		surface.runStarts(CHILD);
		surface.requestSettles(CHILD, assistantMessage(USAGE, "resp-confirmed-1"));
		// The activity's own end: pi states the run fully settled, and the re-check the framework
		// arranged on pi's next task is still outstanding when the host disposes the session.
		vi.advanceTimersByTime(ACTIVITY_MS);
		surface.runSettles(CHILD);
		await surface.sessionEnds(CHILD, "quit");
		await harnessTask();

		expect(piRecord(CONSUMPTION_FILE_PATH, CHILD.sessionId)).toEqual({
			id: CHILD.sessionId,
			name: CHILD.name,
			parent: MAIN.sessionId,
			startup: { model: { provider: PROVIDER, model: MODEL }, effort: "high" },
			saveVersion: 1,
			own: { official: { "model-alpha": { tokens: { input: 2_000, cacheRead: 1_000, cacheWrite: 0, output: 500 }, costCny: AMOUNT } } },
			// The activity's own end was observed, so its interval is a measurement this period really
			// took — 300ms of the clock this case advanced by itself — and the observation is complete.
			runtimeMs: ACTIVITY_MS,
		});
		expect(surface.notices).toEqual([]);
	});
});

describe("a disposal commits once, and only when the session really went away (P29, P33)", () => {
	test("a repeated end report and a settle after it save nothing a second time", async () => {
		const surface = await startedSession();

		surface.runStarts(CHILD);
		surface.requestSettles(CHILD, assistantMessage(USAGE, "resp-once-1"));
		vi.advanceTimersByTime(ACTIVITY_MS);
		surface.runSettles(CHILD);
		await surface.sessionEnds(CHILD, "quit");
		const saved = await savedRecord(CHILD.sessionId);

		// The same session's end reported again, and the settle that arrives after its Round is closed:
		// neither is an edge, so no second snapshot is published under a later version and nothing is
		// announced a second time.
		await surface.sessionEnds(CHILD, "quit");
		surface.runSettles(CHILD);
		await harnessTask();

		expect(piRecord(CONSUMPTION_FILE_PATH, CHILD.sessionId)).toEqual(saved);
		expect(surface.notices).toEqual([]);
	});

	test("leaving a session for another one closes no Round: its activity is still the one that saves", async () => {
		const surface = await startedSession();

		surface.runStarts(CHILD);
		surface.requestSettles(CHILD, assistantMessage(USAGE, "resp-transferred-1"));
		// A switch: pi ends the session it is leaving, and that is no disposal. The Round the child was
		// in is still open, and nothing about it is committed on the transfer.
		vi.advanceTimersByTime(ACTIVITY_MS);
		await surface.sessionEnds(CHILD, "new");
		expect(piRecord(CONSUMPTION_FILE_PATH, CHILD.sessionId)).toBeUndefined();

		// Its own settle, on the host's next task, ends the Round the way any confirmed end does.
		surface.runSettles(CHILD);
		const record = await savedRecord(CHILD.sessionId);

		// The activity's own end was observed, so the interval it committed is the time this case really
		// ran it for — the transfer neither closed the Round nor turned its end into a truncation.
		expect(record.runtimeMs).toBeGreaterThanOrEqual(ACTIVITY_MS);
		expect(record.runtimeGap).toBeUndefined();
	});
});
