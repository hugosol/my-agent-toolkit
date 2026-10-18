/**
 * Ending, late work and restore boundaries on pi (S1, S2, S3; contract P21, P22, P23; ticket 10).
 *
 * What this suite drives is the *pi* realization of three rules, through the extension's production
 * pi assembly: the runtime built from the framework's validated configuration, the extension's real
 * definition, its real frontend and its own `config.yaml`, behind the framework's real pi adapter,
 * bound to a controlled native surface. The facts are the ones a pi process publishes — a session's
 * start with pi's own lineage link, pi's run-cycle facts with the message that settled each cycle,
 * the request about to be sent, and the subagent provider's own published session-liveness
 * registration — so what moves the accounting is the mapping a real run uses.
 *
 * Three distinctions the contract asks for are read here at each seam the contract names. The
 * *activity's own end*: an interrupted or terminally failed run ends its Round where the provider's
 * own statement still holds work, while an ordinary answer with the same statement keeps waiting. The
 * *late arrival*: a result appended after that Round ended opens none, and only a wake that really
 * starts execution opens the next one. The *restore boundary*: a process that reads the document back
 * gets exactly the saved accumulation and no fabricated Round.
 *
 * The price data is the suite's own (one monetary provider, one tier; off-peak is
 * `input·2 + cacheRead·0.5 + output·8` per million tokens), and every amount asserted below is
 * written here by hand from those numbers rather than recomputed from the implementation.
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
} from "../../../../framework/adapters/pi";
import { MODEL_COST } from "../../../../extensions/model-cost/definition";
import { MODEL_COST_HARNESS } from "../../../../extensions/model-cost/harnesses/pi";
import { MODEL_COST_WIDGET_KEY, attachModelCostWidget } from "../../../../extensions/model-cost/harnesses/pi/widget";
import type { ConsumptionDocument, SessionRecord, TokenBuckets } from "../../../../extensions/model-cost/shared-logic/foundation/session/consumption-document";
import type { ModelPricingData } from "../../../../extensions/model-cost/shared-logic/business/pricing/model-data";
import { type ModelCostRuntime, createModelCostRuntime } from "../../../../extensions/model-cost/shared-logic/runtime";
import { PROVIDER_READY_CHANNEL, forgetSessionLivenessRegistry, registerProviderLiveness } from "../../../framework/support/pi-surface-double";
import { uiBoundaryTimerOf } from "../../support/ui-timer";

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

/** The provider and model the sessions of this suite run. */
const PROVIDER = "official";
const MODEL = "model-alpha";

/** The usage one completing request reports, as pi's own finalized message carries it. */
const USAGE = { input: 2_000, cacheRead: 1_000, cacheWrite: 0, output: 500, totalTokens: 3_500 };

/** A second reading, so two rounds of one session are told apart in the buckets and the amount. */
const SECOND_USAGE = { input: 100, cacheRead: 50, cacheWrite: 0, output: 25, totalTokens: 175 };

/** What each usage costs at the tier's off-peak price: `(2_000·2 + 1_000·0.5 + 500·8) / 1e6` and `(100·2 + 50·0.5 + 25·8) / 1e6`. */
const AMOUNT = 0.0085;
const SECOND_AMOUNT = 0.000425;

/** The document the extension keeps in its storage root. */
const CONSUMPTION_FILE = "consumption.json";

/**
 * The repository root every binding resolves its configuration from, and the storage root that
 * configuration names. Both exist for the whole file because the framework reads an extension's
 * `config.yaml` once per process and the first binding's validated values are the ones later ones see.
 */
const STORAGE_ROOT = mkdtempSync(path.join(tmpdir(), "pi-terminal-store-"));
const REPOSITORY_ROOT = mkdtempSync(path.join(tmpdir(), "pi-terminal-repo-"));
const SESSION_FILES = mkdtempSync(path.join(tmpdir(), "pi-terminal-sessions-"));
const CONSUMPTION_FILE_PATH = path.join(STORAGE_ROOT, CONSUMPTION_FILE);
mkdirSync(path.join(REPOSITORY_ROOT, "extensions", "model-cost"), { recursive: true });
writeFileSync(
	path.join(REPOSITORY_ROOT, "extensions", "model-cost", "config.yaml"),
	[`storageDir: '${STORAGE_ROOT.replace(/\\/g, "/")}'`, "balanceTtlMs: 30000", "codexQuotaTtlMs: 15000", ""].join("\n"),
	"utf8",
);

/** The child entry this assembly requires in the sessions a provider spawns, which is what opens its integration scope. */
const CHILD_ENTRY = path.join(path.resolve(import.meta.dir, "..", "..", "..", ".."), "entrypoints", "pi", "model-cost.ts");

/** One pi session file as pi writes it: the header is the first line, and its own `id` is the identity. */
function sessionFile(name: string, header: PiSessionHeader): string {
	const file = path.join(SESSION_FILES, name);
	writeFileSync(file, `${JSON.stringify(header)}\n`, "utf8");
	return file;
}

/** The file pi created for this suite's main session. */
const MAIN_FILE = sessionFile("terminal-main.jsonl", { type: "session", id: "pi-terminal-main" });

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

/** This suite's one actual session: a top-level session with no lineage link of its own. */
const MAIN = {
	sessionId: "pi-terminal-main",
	name: "pi 终止会话",
	header: { type: "session", id: "pi-terminal-main" },
	model: { id: MODEL, provider: PROVIDER },
	thinkingLevel: "high",
	idle: true,
	pending: false,
} satisfies PiSession;

/** The pi native surface the assembly is bound to, with everything a case delivers and reads. */
interface PiSurface {
	/** The native api the assembly is bound to, as pi's loader hands it over. */
	readonly api: PiExtensionApi;
	/** The extension's business instance, once the binding built it. */
	readonly runtime: ModelCostRuntime;
	/** One session starting, with the reason pi states. */
	sessionStarts(session: PiSession, reason: "startup" | "reload" | "new" | "resume" | "fork"): void;
	/** pi's agent loop beginning: the Round's own beginning. */
	runStarts(session: PiSession): void;
	/** pi's run fully settled, with the abort fact it carries. */
	runSettles(session: PiSession, options?: { readonly aborted?: boolean }): void;
	/** The provider announced itself on its own published channel, as its `ready` payload states it. */
	announceProvider(session: PiSession): void;
	/** A request about to be issued, as pi publishes it before the provider call. */
	requestStarts(session: PiSession): void;
	/** One finalized assistant message, which is what settles the request's Turn. */
	messageEnds(session: PiSession, message: PiAssistantMessage): void;
	/** One message that is not a model cycle's end, as an appended result arrives. */
	appendsResult(session: PiSession): void;
	/**
	 * One run initiation, as pi publishes it, awaited: the framework waits for the one-time
	 * initialization on this hook, so awaiting it is what makes the document loaded before a case
	 * drives an exchange.
	 */
	agentStarts(session: PiSession): Promise<void>;
}

/**
 * The production extension assembled on pi and bound to a controlled native surface.
 *
 * The parts are the ones the shipped assembly composes — the framework's real pi adapter, the
 * extension's real definition, the runtime built from the framework's validated configuration, and
 * the real frontend — and the only deployment fact stated here that a real run takes from its
 * deployment is the storage root.
 */
function assemblePiSurface(): PiSurface {
	const handlers = new Map<string, Array<(event: unknown, ctx: PiExtensionContext) => unknown>>();
	const busHandlers = new Map<string, Array<(data: unknown) => void>>();
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
			ui: { notify: () => {}, setWidget: () => {} },
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
		sessionStarts: (session, reason) => void deliver("session_start", { type: "session_start", reason }, session),
		runStarts: session => void deliver("agent_start", { type: "agent_start" }, session),
		runSettles: (session, options = {}) =>
			void deliver("agent_settled", { type: "agent_settled", aborted: options.aborted ?? false }, session),
		announceProvider: session =>
			bus.emit(PROVIDER_READY_CHANNEL, {
				version: 1,
				methods: ["ping"],
				session: { cwd: process.cwd(), sessionId: session.sessionId, sessionFile: MAIN_FILE },
			}),
		requestStarts: session => void deliver("before_provider_request", { type: "before_provider_request" }, session),
		messageEnds: (session, message) => void deliver("message_end", { type: "message_end", message }, session),
		// A result appended to the session after its Round ended: not a model cycle, and not an
		// execution either — exactly the arrival a Round boundary must not be reopened for.
		appendsResult: session =>
			void deliver("message_end", { type: "message_end", message: { role: "custom", customType: "subagent-result" } }, session),
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

/** One assistant response as pi hands its finalized message over: the usage and the outcome it states. */
function assistantMessage(usage: typeof USAGE, overrides: Partial<PiAssistantMessage> = {}): PiAssistantMessage {
	return { role: "assistant", stopReason: "stop", usage: { ...usage }, ...overrides };
}

/** The all-zero reading a request that never completed leaves behind, as pi reports it. */
const NO_USAGE = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0, totalTokens: 0 };

/**
 * One turn of the harness's own next task, and the file system behind it.
 *
 * pi's `nextTask` — where the framework arranges the Round's end re-check — is a zero-delay timer, and
 * this suite's `Date` is faked along with the timer queue, so the re-check runs only when the clock is
 * advanced. The step is the interval the framework's own file coordination polls at; the immediate
 * turn after it is what lets the bytes a save writes land. Neither is a duration this suite guesses
 * at, so every wait below repeats the pair until the content it waits for is there.
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

/** Waits until the document holds what a case expects of it, and answers with the document. */
async function savedDocument(
	file: string,
	accept: (document: ConsumptionDocument) => boolean,
): Promise<ConsumptionDocument> {
	for (let attempt = 0; attempt < 1_000; attempt += 1) {
		const document = readDocument(file);
		if (document !== undefined && accept(document)) return document;
		await harnessTask();
	}
	throw new Error(`no consumption document the case expects was published at ${file}; it holds ${JSON.stringify(readDocument(file))}`);
}

/** One session's record out of the document's own harness bucket. */
function piRecord(document: ConsumptionDocument, id: string): SessionRecord | undefined {
	return document.harnesses[MODEL_COST_HARNESS]?.sessions.find(record => record.id === id);
}

/** One usage's four reported buckets, as one scope's own tokens. */
function tokensOf(usage: typeof USAGE): TokenBuckets {
	return { input: usage.input, cacheRead: usage.cacheRead, cacheWrite: usage.cacheWrite, output: usage.output };
}

/** One provider/model pair's own accumulation, as the display seam states it: buckets and amount. */
function consumed(usage: typeof USAGE, amount: number) {
	return { tokens: tokensOf(usage), costCny: expect.closeTo(amount, 12) };
}

beforeEach(() => {
	// This suite's clock: every instant a case asserts is the instant its own advance put the clock at.
	vi.useFakeTimers({ now: atBeijing(13, 0) });
	forgetSessionLivenessRegistry();
});

afterEach(() => {
	vi.useRealTimers();
	// Each case states the storage root's content itself, so nothing a case wrote reaches the next one.
	for (const entry of ["consumption.json", "codex-estimate.json", "cost-archive"]) {
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
 * One started session of this suite's assembly, with the provider registered for it: the state a case
 * begins an exchange from, and nothing about it is a behavior of the extension.
 */
async function startedSession(holds: () => boolean): Promise<PiSurface> {
	const surface = assemblePiSurface();
	surface.announceProvider(MAIN);
	surface.sessionStarts(MAIN, "startup");
	await surface.agentStarts(MAIN);
	const registration = registerProviderLiveness({ sessionId: MAIN.sessionId, isActive: holds });
	if (!registration.registered) throw new Error("this framework's own session-liveness registry was not published for the run");
	return surface;
}

describe("an interrupted Round ends at its own settlement and saves what really happened (P21)", () => {
	test("the provider still holding work does not keep the interrupted Round open, and its boundary saves the completed requests", async () => {
		const surface = await startedSession(() => true);
		const { view } = surface.runtime;

		// The run: a first request that asks for a tool and completes, then the request the user
		// interrupted, whose message pi finalizes with its own `aborted` stop reason and no usage.
		surface.runStarts(MAIN);
		surface.requestStarts(MAIN);
		surface.messageEnds(MAIN, assistantMessage(USAGE, { stopReason: "toolUse", responseId: "resp-terminal-1" }));
		surface.requestStarts(MAIN);
		surface.messageEnds(MAIN, assistantMessage(NO_USAGE, { stopReason: "aborted", responseId: "resp-terminal-2" }));

		expect(view.roundTotals(MAIN.sessionId)).toEqual({ current: { official: { "model-alpha": consumed(USAGE, AMOUNT) } } });

		// The interrupted run's own final settlement, with the provider's statement still saying it holds
		// the wake it keeps back for an interrupted session.
		surface.runSettles(MAIN, { aborted: true });
		await harnessTask();

		// The boundary is what the Round's end commits: the completed request once, under this session's
		// own identity, and the round the session was in is over.
		const document = await savedDocument(CONSUMPTION_FILE_PATH, candidate => piRecord(candidate, MAIN.sessionId) !== undefined);
		expect(piRecord(document, MAIN.sessionId)).toEqual({
			id: MAIN.sessionId,
			name: MAIN.name,
			parent: null,
			startup: { model: { provider: PROVIDER, model: MODEL }, effort: "high" },
			saveVersion: 1,
			own: { official: { "model-alpha": { tokens: tokensOf(USAGE), costCny: AMOUNT } } },
		});
		// No Round is open for the session any more: what is left to read is the one that ended.
		expect(view.roundTotals(MAIN.sessionId)).toEqual({ previous: { official: { "model-alpha": consumed(USAGE, AMOUNT) } } });
		expect(view.own(MAIN.sessionId)).toEqual({ official: { "model-alpha": consumed(USAGE, AMOUNT) } });
	});

	test("an ordinary answer with the provider holding the same work keeps the Round open until the work clears", async () => {
		let held = true;
		const surface = await startedSession(() => held);
		const { view } = surface.runtime;

		surface.runStarts(MAIN);
		surface.requestStarts(MAIN);
		surface.messageEnds(MAIN, assistantMessage(USAGE, { responseId: "resp-terminal-3" }));
		surface.runSettles(MAIN);
		await harnessTask();

		// The activity answered and the provider states the session is still waiting on its delegation:
		// the request is already its Round's own, and the Round has not ended, so nothing is saved yet.
		expect(view.roundTotals(MAIN.sessionId)).toEqual({ current: { official: { "model-alpha": consumed(USAGE, AMOUNT) } } });
		expect(readDocument(CONSUMPTION_FILE_PATH)).toBeUndefined();

		held = false;
		surface.runSettles(MAIN);
		await harnessTask();

		// The provider's own answer is what ends it, and that boundary is what saves the request.
		const document = await savedDocument(CONSUMPTION_FILE_PATH, candidate => piRecord(candidate, MAIN.sessionId) !== undefined);
		expect(piRecord(document, MAIN.sessionId)?.own).toEqual({
			official: { "model-alpha": { tokens: tokensOf(USAGE), costCny: AMOUNT } },
		});
	});
});

describe("a late arrival opens no Round, and a real execution opens the next one (P22)", () => {
	test("a result appended after a failed Round reopens nothing, and the wake that runs opens the next Round", async () => {
		let held = true;
		const surface = await startedSession(() => held);
		const { view } = surface.runtime;

		// A terminally failed run: its request reported usage and its message states the failure, and
		// the provider still holds the wake it kept back for the session.
		surface.runStarts(MAIN);
		surface.requestStarts(MAIN);
		surface.messageEnds(MAIN, assistantMessage(USAGE, { stopReason: "error", responseId: "resp-terminal-4" }));
		surface.runSettles(MAIN);
		await harnessTask();

		// The failed activity's settlement ended the Round and that boundary committed the request it
		// really made.
		expect(view.roundTotals(MAIN.sessionId)).toEqual({ previous: { official: { "model-alpha": consumed(USAGE, AMOUNT) } } });
		const afterFailure = await savedDocument(CONSUMPTION_FILE_PATH, candidate => piRecord(candidate, MAIN.sessionId) !== undefined);
		expect(piRecord(afterFailure, MAIN.sessionId)?.own).toEqual({
			official: { "model-alpha": { tokens: tokensOf(USAGE), costCny: AMOUNT } },
		});
		const savedBytes = readFileSync(CONSUMPTION_FILE_PATH, "utf8");

		// The delegation's own result is appended to the session afterwards: an append is not an
		// execution, so no Round is reopened, nothing is accounted and the document is not touched.
		surface.appendsResult(MAIN);
		await harnessTask();
		expect(view.roundTotals(MAIN.sessionId)).toEqual({ previous: { official: { "model-alpha": consumed(USAGE, AMOUNT) } } });
		expect(readFileSync(CONSUMPTION_FILE_PATH, "utf8")).toBe(savedBytes);

		// The wake that really runs: an activity beginning, whose request belongs to a new Round of its
		// own. The failed activity's outcome is not reused for it — the provider now holds nothing, and
		// this Round ends on that statement as any ordinary Round does.
		held = false;
		surface.runStarts(MAIN);
		surface.requestStarts(MAIN);
		surface.messageEnds(MAIN, assistantMessage(SECOND_USAGE, { responseId: "resp-terminal-5" }));
		expect(view.roundTotals(MAIN.sessionId)).toEqual({
			current: { official: { "model-alpha": consumed(SECOND_USAGE, SECOND_AMOUNT) } },
			previous: { official: { "model-alpha": consumed(USAGE, AMOUNT) } },
		});
		surface.runSettles(MAIN);
		await harnessTask();

		// The record the failed Round's boundary saved is what the new Round's boundary adds to.
		const document = await savedDocument(
			CONSUMPTION_FILE_PATH,
			candidate => piRecord(candidate, MAIN.sessionId)?.own.official?.["model-alpha"]?.tokens?.input === USAGE.input + SECOND_USAGE.input,
		);
		expect(piRecord(document, MAIN.sessionId)?.saveVersion).toBe(2);
		expect(piRecord(document, MAIN.sessionId)?.own).toEqual({
			official: {
				"model-alpha": {
					tokens: {
						input: USAGE.input + SECOND_USAGE.input,
						cacheRead: USAGE.cacheRead + SECOND_USAGE.cacheRead,
						cacheWrite: USAGE.cacheWrite + SECOND_USAGE.cacheWrite,
						output: USAGE.output + SECOND_USAGE.output,
					},
					costCny: AMOUNT + SECOND_AMOUNT,
				},
			},
		});
		expect(view.roundTotals(MAIN.sessionId)).toEqual({
			previous: { official: { "model-alpha": consumed(SECOND_USAGE, SECOND_AMOUNT) } },
		});
	});
});

describe("a process that reads the document back gets the saved Session and no invented Round (P23)", () => {
	test("the restored session reads the saved accumulation, and a settle that arrives before any start fabricates nothing", async () => {
		let held = false;
		const first = await startedSession(() => held);

		first.runStarts(MAIN);
		first.requestStarts(MAIN);
		first.messageEnds(MAIN, assistantMessage(USAGE, { responseId: "resp-terminal-8" }));
		first.runSettles(MAIN);
		await harnessTask();
		await savedDocument(CONSUMPTION_FILE_PATH, candidate => piRecord(candidate, MAIN.sessionId) !== undefined);
		const savedBytes = readFileSync(CONSUMPTION_FILE_PATH, "utf8");

		// A second process over the same storage root: the document is what it can read, and it states
		// no Round of its own until an activity of its own begins.
		const second = assemblePiSurface();
		second.announceProvider(MAIN);
		second.sessionStarts(MAIN, "resume");
		await second.agentStarts(MAIN);
		const resumed = registerProviderLiveness({ sessionId: MAIN.sessionId, isActive: () => false });
		expect(resumed.registered).toBe(true);

		expect(second.runtime.view.own(MAIN.sessionId)).toEqual({ official: { "model-alpha": consumed(USAGE, AMOUNT) } });
		// No Round: the reading is the saved Session's own accumulation, and the boundary a previous
		// process was in the middle of is not reconstructed as a Round of zero consumption.
		expect(second.runtime.view.roundTotals(MAIN.sessionId)).toBeUndefined();

		// A settle handed to a process that observed no activity is no evidence of an end: it closes no
		// Round, accounts nothing, and leaves the document exactly as it was.
		second.messageEnds(MAIN, assistantMessage(USAGE, { stopReason: "aborted", responseId: "resp-terminal-9" }));
		second.runSettles(MAIN, { aborted: true });
		await harnessTask();
		expect(second.runtime.view.roundTotals(MAIN.sessionId)).toBeUndefined();
		expect(readFileSync(CONSUMPTION_FILE_PATH, "utf8")).toBe(savedBytes);

		// And the restored session's record holds no Round detail to restore: what the document keeps is
		// the session's own accumulation, which is what the next boundary will add to.
		const restoredRecord = readDocument(CONSUMPTION_FILE_PATH)?.harnesses[MODEL_COST_HARNESS]?.sessions.find(
			record => record.id === MAIN.sessionId,
		);
		expect(restoredRecord === undefined ? [] : Object.keys(restoredRecord).sort()).toEqual([
			"id",
			"name",
			"own",
			"parent",
			"saveVersion",
			"startup",
		]);
	});
});
