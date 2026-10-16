/**
 * Once-only accounting, the direct-parent Session rollup and the current tree on pi (S1, S2, S3;
 * contract P8, P10, P40; ticket 08).
 *
 * What this suite drives is the *pi* realization of three rules the shared business suites state with
 * self-made deliveries: the extension's production pi assembly — the runtime built from the
 * framework's validated configuration, the extension's real definition, its real frontend and its own
 * `config.yaml` — behind the framework's real pi adapter, bound to a controlled native surface. The
 * facts below are the ones a pi process publishes (a session's start with pi's own lineage link, pi's
 * run-cycle facts, the request about to be sent and the finalized assistant message), so what moves
 * the accounting is the mapping a real run uses and no hand-made public delivery is fed to shared
 * logic in place of a native fact.
 *
 * Each promise is read where a consumer reads it: the extension's read-only results (`runtime.view`),
 * the read-only display result the pi frontend renders (`runtime.presentation.of(target)`), the lines
 * the frontend handed pi to draw, and the document the run really wrote under the `pi` harness bucket
 * — which a second assembly reads back, as the next pi process does. One case reads the framework's
 * own delivery for a Turn and hands that same delivery to the extension's own subscribed handler
 * again, because the one fact no consumer operation can otherwise reach is the lifetime of the
 * extension's in-memory once-only mark; the delivery handed over is the framework's public protocol
 * object and the handler is the interface the framework itself calls.
 *
 * One main session, one child spawned from it and one grandchild below that are the tree this
 * extension owns; a second top-level session with a child of its own is a tree it does not; and the
 * `omp` bucket below holds a session with the same id as this harness's main session, which is what
 * another harness's records in one shared document look like. The price data is self-made (one
 * monetary provider with two tiers and one token-only provider; off-peak is `input·2 + cacheRead·0.5
 * + output·8` per million tokens for the first tier and `input·10 + cacheRead·1 + output·20` for the
 * second), and every bucket and amount asserted below is written here by hand from those numbers
 * rather than recomputed from the implementation.
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
import type {
	OwnerReference,
	SessionFacts,
	TurnEndDelivery,
	TurnEndFacts,
	TurnStartDelivery,
	TurnStartFacts,
} from "../../framework/core/protocol";
import { MODEL_COST } from "../../extensions/model-cost/definition";
import { MODEL_COST_HARNESS } from "../../extensions/model-cost/harnesses/pi";
import { MODEL_COST_WIDGET_KEY, attachModelCostWidget } from "../../extensions/model-cost/harnesses/pi/widget";
import type {
	ConsumptionDocument,
	SessionRecord,
	TokenBuckets,
} from "../../extensions/model-cost/shared-logic/consumption-document";
import type { DisplayTarget } from "../../extensions/model-cost/shared-logic/presentation/display";
import type { ModelPricingData } from "../../extensions/model-cost/shared-logic/model-data";
import { type ModelCostRuntime, createModelCostRuntime } from "../../extensions/model-cost/shared-logic/runtime";

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

/** One Beijing wall-clock reading on Wednesday 2026-10-14, as the epoch instant a request carries. */
function atBeijing(hours: number, minutes = 0, seconds = 0, ms = 0): number {
	return Date.UTC(2026, 9, 14, hours, minutes, seconds, ms) - BEIJING_OFFSET_MS;
}

/** The self-made pricing data every case drives, with two monetary tiers and one token-only pair. */
const DATA: ModelPricingData = {
	currency: "XTS",
	unit: "XTS per million tokens",
	peakMultiplier: 3,
	zoneOffsetMinutes: 8 * 60,
	peakWindows: [
		{ fromMinute: 9 * 60, toMinute: 12 * 60 },
		{ fromMinute: 14 * 60, toMinute: 18 * 60 },
	],
	tiers: {
		alpha: { input: 2, cacheRead: 0.5, output: 8 },
		beta: { input: 10, cacheRead: 1, output: 20 },
	},
	allowanceProviders: [],
	models: {
		official: {
			"model-alpha": { mode: "monetary", tier: "alpha" },
			"model-beta": { mode: "monetary", tier: "beta" },
		},
		"plan-provider": { "model-alpha": { mode: "token-only" } },
	},
};

/** The provider and model the sessions of this suite run. */
const PROVIDER = "official";
const MODEL = "model-alpha";

/** The usage one completing request reports, as pi's own finalized message carries it. */
const USAGE = { input: 2_000, cacheRead: 1_000, cacheWrite: 0, output: 500, totalTokens: 3_500 };

/** A second reading, so two requests of one session are told apart in the buckets and the amount. */
const SECOND_USAGE = { input: 100, cacheRead: 50, cacheWrite: 0, output: 25, totalTokens: 175 };

/**
 * What each usage costs at the first tier's off-peak price: `(2_000·2 + 1_000·0.5 + 500·8) / 1e6`
 * and `(100·2 + 50·0.5 + 25·8) / 1e6`.
 */
const AMOUNT = 0.0085;
const SECOND_AMOUNT = 0.000425;

/** The same first reading at the second tier's off-peak price: `(2_000·10 + 1_000·1 + 500·20) / 1e6`. */
const BETA_AMOUNT = 0.031;

/** The document the extension keeps in its storage root. */
const CONSUMPTION_FILE = "consumption.json";

/**
 * The repository root every binding resolves its configuration from, and the storage root that
 * configuration names. Both exist for the whole file because the framework reads an extension's
 * `config.yaml` once per process and the first binding's validated values are the ones later ones see.
 */
const STORAGE_ROOT = mkdtempSync(path.join(tmpdir(), "pi-accounting-store-"));
const REPOSITORY_ROOT = mkdtempSync(path.join(tmpdir(), "pi-accounting-repo-"));
const SESSION_FILES = mkdtempSync(path.join(tmpdir(), "pi-accounting-sessions-"));
const CONSUMPTION_FILE_PATH = path.join(STORAGE_ROOT, CONSUMPTION_FILE);
mkdirSync(path.join(REPOSITORY_ROOT, "extensions", "model-cost"), { recursive: true });
writeFileSync(
	path.join(REPOSITORY_ROOT, "extensions", "model-cost", "config.yaml"),
	[`storageDir: '${STORAGE_ROOT.replace(/\\/g, "/")}'`, "balanceTtlMs: 30000", "codexQuotaTtlMs: 15000", ""].join("\n"),
	"utf8",
);

/**
 * One pi session file as pi writes it: the header is the first line, and the identity a lineage link
 * is resolved through is that header's own `id` — never the file's name.
 */
function sessionFile(name: string, header: PiSessionHeader): string {
	const file = path.join(SESSION_FILES, name);
	writeFileSync(file, `${JSON.stringify(header)}\n`, "utf8");
	return file;
}

/** The file pi created for the main session of the tree these cases are current in. */
const MAIN_FILE = sessionFile("main-session.jsonl", { type: "session", id: "pi-acc-main" });
/** The child's own file: it names the main session's file as its lineage link. */
const CHILD_FILE = sessionFile("child-session.jsonl", { type: "session", id: "pi-acc-child", parentSession: MAIN_FILE });
/** The grandchild's file: its link leaves the process and reaches the main session through the child. */
const GRANDCHILD_FILE = sessionFile("grandchild-session.jsonl", {
	type: "session",
	id: "pi-acc-grandchild",
	parentSession: CHILD_FILE,
});
/** Another top-level session of this harness, with a child of its own: a tree that is not this one. */
const OTHER_ROOT_FILE = sessionFile("other-root.jsonl", { type: "session", id: "pi-acc-other-root" });
const OTHER_CHILD_FILE = sessionFile("other-child.jsonl", {
	type: "session",
	id: "pi-acc-other-child",
	parentSession: OTHER_ROOT_FILE,
});

/** One session as pi's own surface reports it, for the cases below. */
interface PiSession {
	readonly sessionId: string;
	/** The display name pi reports, or cleared when pi reports that the session has none. */
	name?: string;
	/** pi's own session header, as the session's file carries it; omitted models a host stating none. */
	readonly header?: PiSessionHeader;
	readonly model?: { readonly id?: string; readonly provider?: string };
	readonly thinkingLevel?: string;
	idle?: boolean;
	pending?: boolean;
}

/** The main session of the tree these cases are current in: a top-level session with no link of its own. */
const MAIN = {
	sessionId: "pi-acc-main",
	name: "pi 主会话",
	header: { type: "session", id: "pi-acc-main" },
	model: { id: MODEL, provider: PROVIDER },
	thinkingLevel: "high",
	idle: true,
	pending: false,
} satisfies PiSession;

/** The subagent the main session spawned: its direct parent is the main session, its Owner is not. */
const CHILD = {
	sessionId: "pi-acc-child",
	name: "review the diff",
	header: { type: "session", id: "pi-acc-child", parentSession: MAIN_FILE },
	model: { id: MODEL, provider: PROVIDER },
	thinkingLevel: "medium",
	idle: true,
	pending: false,
} satisfies PiSession;

/** The subagent the child spawned: nested, still under the main session's own tree. */
const GRANDCHILD = {
	sessionId: "pi-acc-grandchild",
	name: "grep the fixtures",
	header: { type: "session", id: "pi-acc-grandchild", parentSession: CHILD_FILE },
	model: { id: "model-alpha", provider: "plan-provider" },
	thinkingLevel: "low",
	idle: true,
	pending: false,
} satisfies PiSession;

/** Somebody else's subagent under the same root: another tree, whose consumption is not this one's. */
const OTHER_ROOT = {
	sessionId: "pi-acc-other-root",
	name: "另一个主会话",
	header: { type: "session", id: "pi-acc-other-root" },
	model: { id: "model-beta", provider: PROVIDER },
	idle: true,
	pending: false,
} satisfies PiSession;

/** A child of the main session whose start proves no name at all, and which the document never recorded. */
const ANONYMOUS_CHILD = {
	sessionId: "pi-acc-anonymous",
	header: { type: "session", id: "pi-acc-anonymous", parentSession: MAIN_FILE },
	model: { id: MODEL, provider: PROVIDER },
	thinkingLevel: "low",
	idle: true,
	pending: false,
};

/** The same child identity, started the way pi reports a session it cannot name: a start with no name. */
const NAMELESS_CHILD = {
	sessionId: CHILD.sessionId,
	header: { type: "session", id: CHILD.sessionId, parentSession: MAIN_FILE },
	model: { id: MODEL, provider: PROVIDER },
	thinkingLevel: "medium",
	idle: true,
	pending: false,
} satisfies PiSession;

/** One widget rendering the frontend published, for whatever key it published under. */
interface DrawnFrame {
	readonly key: string;
	readonly lines: readonly string[] | undefined;
}

/** One notice the extension published through the host's own channel. */
interface PublishedNotice {
	readonly level: string;
	readonly message: string;
}

/** The pi native surface the assembly is bound to, with everything a case delivers and reads. */
interface PiSurface {
	/** The native api the assembly is bound to, as pi's loader hands it over. */
	readonly api: PiExtensionApi;
	/** The extension's business instance, once the binding built it. */
	readonly runtime: ModelCostRuntime;
	/** The widget renderings the frontend handed the host, in call order. */
	readonly widgets: DrawnFrame[];
	/** The notices the extension published through the host's own channel, in call order. */
	readonly notices: PublishedNotice[];
	/** One session starting, with the reason pi states. */
	sessionStarts(session: PiSession, reason: "startup" | "reload" | "new" | "resume" | "fork"): void;
	/** pi's agent loop beginning: the Round's own beginning. */
	runStarts(session: PiSession): void;
	/** pi's run fully settled, with nothing left to continue it. */
	runSettles(session: PiSession): void;
	/** A request about to be issued, as pi publishes it before the provider call. */
	requestStarts(session: PiSession): void;
	/** One finalized assistant message, which is what settles the request's Turn. */
	messageEnds(session: PiSession, message: PiAssistantMessage): void;
	/**
	 * One run initiation, as pi publishes it, awaited: the framework waits for the one-time
	 * initialization on this hook, so awaiting it is what makes the document loaded before a case
	 * drives an exchange.
	 */
	agentStarts(session: PiSession): Promise<void>;
	/** One `/budget` invocation through pi's own command path. */
	command(args: string, session: PiSession): Promise<void>;
	/** The lines the frontend drew last, or nothing while it cleared its widget. */
	lastLines(): readonly string[] | undefined;
}

/**
 * The production extension assembled on pi and bound to a controlled native surface.
 *
 * The parts are the ones the shipped assembly composes — the framework's real pi adapter, the
 * extension's real definition, the runtime built from the framework's validated configuration, and
 * the real frontend with its release composed into the framework's own cleanup — and the only
 * deployment fact stated here that a real run takes from its deployment is the storage root.
 */
function assemblePiSurface(): PiSurface {
	const handlers = new Map<string, Array<(event: unknown, ctx: PiExtensionContext) => unknown>>();
	const commands = new Map<string, { readonly handler: (args: string, ctx: PiExtensionContext) => Promise<void> }>();
	const widgets: DrawnFrame[] = [];
	const notices: PublishedNotice[] = [];
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
				setWidget: (key: string, content: readonly string[] | undefined) =>
					void widgets.push({ key, lines: content === undefined ? undefined : [...content] }),
			},
			// The host's own context reading, which this extension draws a bar from rather than storing.
			getContextUsage: () => ({ tokens: 20_000, contextWindow: 450_000 }),
			isIdle: () => session.idle === true,
			hasPendingMessages: () => session.pending === true,
		}) as unknown as PiExtensionContext;

	const api = {
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
		registerCommand(name: string, registration: { readonly handler: (args: string, ctx: PiExtensionContext) => Promise<void> }) {
			commands.set(name, registration);
		},
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
		widgets,
		notices,
		sessionStarts: (session, reason) => void deliver("session_start", { type: "session_start", reason }, session),
		runStarts: session => void deliver("agent_start", { type: "agent_start" }, session),
		runSettles: session => void deliver("agent_settled", { type: "agent_settled", aborted: false }, session),
		requestStarts: session => void deliver("before_provider_request", { type: "before_provider_request" }, session),
		messageEnds: (session, message) => void deliver("message_end", { type: "message_end", message }, session),
		agentStarts: async session => {
			await Promise.all(deliver("before_agent_start", { type: "before_agent_start", messageType: "new" }, session));
		},
		command: async (args, session) => {
			const command = commands.get("budget");
			if (command === undefined) throw new Error("the extension registered no /budget command");
			await command.handler(args, contextOf(session));
		},
		lastLines: () => {
			const shown = widgets.filter(frame => frame.key === MODEL_COST_WIDGET_KEY);
			return shown[shown.length - 1]?.lines;
		},
	};

	const bind = piAdapter(MODEL_COST, {
		configBaseDir: REPOSITORY_ROOT,
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
	releaseFrontend = attachModelCostWidget(surface.api, surface.runtime);
	return surface;
}

/** One assistant response as pi hands its finalized message over: the usage and the outcome it states. */
function assistantMessage(
	usage: typeof USAGE = USAGE,
	overrides: Partial<PiAssistantMessage> = {},
): PiAssistantMessage {
	return {
		role: "assistant",
		stopReason: "stop",
		responseId: "resp-pi-accounting",
		usage: { ...usage },
		...overrides,
	};
}

/** The target the pi frontend reads for one session: the session's own identity and current pair. */
function targetOf(session: PiSession): DisplayTarget {
	return {
		sessionId: session.sessionId,
		provider: session.model?.provider ?? "",
		model: session.model?.id ?? "",
		...(session.thinkingLevel === undefined ? {} : { effort: session.thinkingLevel }),
	};
}

/**
 * One turn of the harness's own next task, and the file system behind it.
 *
 * pi's `nextTask` — where the framework arranges the Round's end re-check — is a zero-delay timer, and
 * this suite's `Date` is faked along with the timer queue, so the re-check runs only when the clock is
 * advanced. The step is the interval the framework's own file coordination polls at (25 ms between
 * attempts at a lock and between turns of a document's queue); the immediate turn after it is real and
 * is what lets the bytes a save writes land. Neither is a duration this suite guesses at, so every
 * wait below repeats the pair until the content it waits for is there.
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
	throw new Error(
		`no consumption document the case expects was published at ${file}; it holds ${JSON.stringify(readDocument(file))}`,
	);
}

/** Waits until the frontend has drawn a widget a case expects, and answers with its lines. */
async function drawnLines(
	surface: PiSurface,
	accept: (lines: readonly string[]) => boolean,
): Promise<readonly string[]> {
	for (let attempt = 0; attempt < 200; attempt += 1) {
		const lines = surface.lastLines();
		if (lines !== undefined && accept(lines)) return lines;
		await harnessTask();
	}
	throw new Error(`no widget drew what the case expects; last drawn ${JSON.stringify(surface.lastLines())}`);
}

/** One session's record out of the document's own harness bucket. */
function piRecord(document: ConsumptionDocument, id: string): SessionRecord | undefined {
	return document.harnesses[MODEL_COST_HARNESS]?.sessions.find(record => record.id === id);
}

/** Every `pi` record's id in the document, in the order the document keeps them. */
function piRecordIds(document: ConsumptionDocument): readonly string[] {
	return (document.harnesses[MODEL_COST_HARNESS]?.sessions ?? []).map(record => record.id);
}

/** One usage's four reported buckets, as one scope's own tokens. */
function tokensOf(usage: typeof USAGE): TokenBuckets {
	return { input: usage.input, cacheRead: usage.cacheRead, cacheWrite: usage.cacheWrite, output: usage.output };
}

/** Several usages' buckets added, as one scope's own tokens after all of them. */
function tokensAdded(...usages: readonly (typeof USAGE)[]): TokenBuckets {
	return {
		input: usages.reduce((total, usage) => total + usage.input, 0),
		cacheRead: usages.reduce((total, usage) => total + usage.cacheRead, 0),
		cacheWrite: usages.reduce((total, usage) => total + usage.cacheWrite, 0),
		output: usages.reduce((total, usage) => total + usage.output, 0),
	};
}

/** One provider/model pair's own accumulation, as the display seam states it: buckets and amount. */
function consumed(tokens: TokenBuckets, amount: number) {
	return { tokens, costCny: expect.closeTo(amount, 12) };
}

/** One usage's own accumulation at the first tier's price, without repeating the pair's shape. */
function consumedUsage(usage: typeof USAGE, amount: number) {
	return consumed(tokensOf(usage), amount);
}

/**
 * One usage's own accumulation as a document states it: the buckets and the amount as plain numbers,
 * which is what a case writes into a storage root rather than the matcher it asserts with.
 */
function storedOwn(usage: typeof USAGE, amount: number) {
	return { tokens: tokensOf(usage), costCny: amount };
}

/** One stored session record, with the fields a case does not state left at their ordinary values. */
function storedRecord(overrides: Partial<SessionRecord> & { readonly id: string }): SessionRecord {
	return { name: overrides.id, parent: null, saveVersion: 1, own: {}, ...overrides };
}

/** One document as a storage root holds it, with the `pi` bucket first and another harness's beside it. */
function storedDocument(
	pi: readonly SessionRecord[],
	others: Readonly<Record<string, readonly SessionRecord[]>> = {},
): ConsumptionDocument {
	return {
		schemaVersion: 1,
		periodId: "period-pi-accounting",
		start: "2026-10-14T00:00:00.000Z",
		holiday: false,
		harnesses: {
			[MODEL_COST_HARNESS]: { sessions: [...pi] },
			...Object.fromEntries(Object.entries(others).map(([harness, sessions]) => [harness, { sessions: [...sessions] }])),
		},
	};
}

/**
 * One whole request in one actual session, delivered the way pi delivers it: a run beginning, the
 * request about to be sent, and the finalized assistant message that settles it.
 *
 * The run is left open, so the Turn belongs to the Round the run began; a case that wants the Round to
 * end calls {@link endRound}. The model the request runs is the one the session's own context reports.
 */
function request(surface: PiSurface, session: PiSession, usage: typeof USAGE = USAGE, responseId?: string): void {
	surface.runStarts(session);
	vi.advanceTimersByTime(1_000);
	surface.requestStarts(session);
	vi.advanceTimersByTime(4_000);
	surface.messageEnds(session, assistantMessage(usage, responseId === undefined ? {} : { responseId }));
}

/** The Round's own end: pi's settle, then the harness task the framework re-checks its candidate on. */
async function endRound(surface: PiSurface, session: PiSession): Promise<void> {
	surface.runSettles(session);
	await harnessTask();
}

/** The framework's own Turn-start delivery, built here from its public facts for the replay case. */
function turnStartOf(turnId: string, session: SessionFacts, startedAt: number): TurnStartDelivery {
	const turn: TurnStartFacts = {
		turnId,
		session,
		roundId: `${session.sessionId}#r1`,
		startedAt,
		provider: PROVIDER,
		model: MODEL,
		unavailable: [],
	};
	return {
		event: { kind: "turn_start" },
		owner: OWNER_OF_MAIN,
		turn,
		hasUI: true,
		feedback: { notify: () => {} },
	};
}

/** The same Turn's settled delivery, as the framework dispatches it once. */
function turnEndOf(start: TurnStartDelivery, endedAt: number): TurnEndDelivery {
	const end: TurnEndFacts = { endedAt, outcome: "completed", usage: { ...USAGE }, unavailable: [] };
	return {
		event: { kind: "turn_end" },
		owner: start.owner,
		turn: start.turn,
		end,
		hasUI: true,
		feedback: start.feedback,
	};
}

/** The main session's own facts and owner, as the adapter maps them for the deliveries of case 1. */
const MAIN_FACTS: SessionFacts = {
	sessionId: MAIN.sessionId,
	kind: "main",
	name: MAIN.name,
	unavailable: ["agent name", "agent id"],
};
const OWNER_OF_MAIN: OwnerReference = { kind: "owner", key: `main:${MAIN.sessionId}` };

beforeEach(() => {
	// This suite's clock: every instant a case asserts is the instant its own advance put the clock at.
	vi.useFakeTimers({ now: atBeijing(13, 0) });
});

afterEach(() => {
	vi.useRealTimers();
	// Each case states the storage root's content itself, so nothing a case wrote reaches the next one.
	for (const entry of ["consumption.json", "codex-estimate.json", "cost-archive"]) {
		rmSync(path.join(STORAGE_ROOT, entry), { recursive: true, force: true });
	}
});

afterAll(() => {
	rmSync(STORAGE_ROOT, { recursive: true, force: true });
	rmSync(REPOSITORY_ROOT, { recursive: true, force: true });
	rmSync(SESSION_FILES, { recursive: true, force: true });
});

describe("a Round is one actual session's own requests, and a child's work rides its own session (P10)", () => {
	test("a tool continuation stays in its Round, and the child's request is its own Round and its own record", async () => {
		const surface = assemblePiSurface();
		const { view } = surface.runtime;

		// The main session's own work: one run, a first request that asks for a tool, and — after the
		// tool's own turn — the follow-up request that answers it, inside the same Round.
		surface.sessionStarts(MAIN, "startup");
		await surface.agentStarts(MAIN);
		surface.runStarts(MAIN);
		vi.advanceTimersByTime(1_000);
		surface.requestStarts(MAIN);
		vi.advanceTimersByTime(4_000);
		surface.messageEnds(MAIN, assistantMessage(USAGE, { stopReason: "toolUse" }));

		// The subagent the main session spawned while that tool ran, in the same process and under the
		// same owner line: pi's own lineage link is what states its direct parent, and its request is its
		// own — a second actual session, not a second reading of the first one's.
		surface.sessionStarts(CHILD, "startup");
		request(surface, CHILD, SECOND_USAGE);

		// The tool's result returns and the main session issues the follow-up request of the same Round.
		vi.advanceTimersByTime(30_000);
		surface.requestStarts(MAIN);
		vi.advanceTimersByTime(4_000);
		surface.messageEnds(MAIN, assistantMessage(USAGE, { responseId: "resp-pi-accounting-2" }));

		// The Round's own total holds both of the main session's requests and no part of the child's.
		expect(view.roundTotals(MAIN.sessionId)).toEqual({
			current: { official: { "model-alpha": consumed(tokensAdded(USAGE, USAGE), AMOUNT * 2) } },
		});
		// The child's Round is its own single request, listed under the session that issued it.
		expect(view.roundTotals(CHILD.sessionId)).toEqual({
			current: { official: { "model-alpha": consumedUsage(SECOND_USAGE, SECOND_AMOUNT) } },
		});
		expect(view.own(MAIN.sessionId)).toEqual({
			official: { "model-alpha": consumed(tokensAdded(USAGE, USAGE), AMOUNT * 2) },
		});
		expect(view.own(CHILD.sessionId)).toEqual({
			official: { "model-alpha": consumedUsage(SECOND_USAGE, SECOND_AMOUNT) },
		});

		// The direct parent the harness stated is the relation the display reads, and the main session's
		// inclusive total is both sessions' own requests, each counted once.
		expect(view.identity(CHILD.sessionId)).toEqual({
			sessionId: CHILD.sessionId,
			name: CHILD.name,
			parentSessionId: MAIN.sessionId,
		});
		expect(view.inclusiveTotals(MAIN.sessionId)).toEqual({
			official: {
				"model-alpha": consumed(tokensAdded(USAGE, USAGE, SECOND_USAGE), AMOUNT * 2 + SECOND_AMOUNT),
			},
		});

		// The child's own Round end commits the child's own record — under its own identity and the
		// direct parent pi stated — and nothing of the main session's.
		await endRound(surface, CHILD);
		const afterChild = await savedDocument(CONSUMPTION_FILE_PATH, candidate => piRecord(candidate, CHILD.sessionId) !== undefined);
		expect(piRecordIds(afterChild)).toEqual([CHILD.sessionId]);
		expect(piRecord(afterChild, CHILD.sessionId)).toEqual({
			id: CHILD.sessionId,
			name: CHILD.name,
			parent: MAIN.sessionId,
			startup: { model: { provider: PROVIDER, model: MODEL }, effort: "medium" },
			saveVersion: 1,
			own: { official: { "model-alpha": consumedUsage(SECOND_USAGE, SECOND_AMOUNT) } },
			// The one activity that session's own Round was: a figure of its own kind, measured between
			// that Round's two edges rather than stated anywhere. Its arithmetic has its own coverage
			// (`tests/model-cost/subagent-runtime.test.ts`); this case is about which session the
			// consumption belongs to, so it states only that the figure is a number of milliseconds.
			runtimeMs: expect.any(Number),
		});

		// The main session's own Round end commits its two requests under its own identity, and leaves
		// the child's record exactly as the child's own commit published it.
		await endRound(surface, MAIN);
		const document = await savedDocument(CONSUMPTION_FILE_PATH, candidate => piRecord(candidate, MAIN.sessionId) !== undefined);
		expect(piRecordIds(document)).toEqual([CHILD.sessionId, MAIN.sessionId]);
		expect(piRecord(document, MAIN.sessionId)).toEqual({
			id: MAIN.sessionId,
			name: MAIN.name,
			parent: null,
			startup: { model: { provider: PROVIDER, model: MODEL }, effort: "high" },
			saveVersion: 1,
			own: { official: { "model-alpha": consumed(tokensAdded(USAGE, USAGE), AMOUNT * 2) } },
		});
		expect(piRecord(document, CHILD.sessionId)?.own).toEqual({
			official: { "model-alpha": consumedUsage(SECOND_USAGE, SECOND_AMOUNT) },
		});
	});

	test("nested and concurrent subagents keep their own ledgers, and a child's later Round continues its own record", async () => {
		const surface = assemblePiSurface();
		const { view } = surface.runtime;

		surface.sessionStarts(MAIN, "startup");
		await surface.agentStarts(MAIN);
		request(surface, MAIN, USAGE);
		await endRound(surface, MAIN);
		await savedDocument(CONSUMPTION_FILE_PATH, candidate => piRecord(candidate, MAIN.sessionId)?.saveVersion === 1);

		// Two subagents at once — the child and the child's own child — each with a request in flight
		// before either response settles: their identities are their own, so neither response can land
		// in the other session's own buckets.
		surface.sessionStarts(CHILD, "startup");
		surface.runStarts(CHILD);
		surface.requestStarts(CHILD);
		surface.sessionStarts(GRANDCHILD, "startup");
		surface.runStarts(GRANDCHILD);
		surface.requestStarts(GRANDCHILD);
		vi.advanceTimersByTime(4_000);
		surface.messageEnds(CHILD, assistantMessage(USAGE));
		surface.messageEnds(GRANDCHILD, assistantMessage(USAGE));

		// The grandchild is nested: its direct parent is the child, while its Owner is still the main
		// session — the two are different facts and neither is derived from the other.
		expect(view.identity(GRANDCHILD.sessionId)).toEqual({
			sessionId: GRANDCHILD.sessionId,
			name: GRANDCHILD.name,
			parentSessionId: CHILD.sessionId,
		});
		// Its own request is token-only: the buckets are its own and no amount is invented for it.
		expect(view.own(GRANDCHILD.sessionId)).toEqual({
			"plan-provider": { "model-alpha": { tokens: tokensOf(USAGE) } },
		});
		expect(view.own(CHILD.sessionId)).toEqual({
			official: { "model-alpha": consumedUsage(USAGE, AMOUNT) },
		});
		// The main session's inclusive total walks the direct parents it holds: its own request, the
		// child's and the grandchild's, each exactly once.
		expect(view.inclusiveTotals(MAIN.sessionId)).toEqual({
			official: { "model-alpha": consumed(tokensAdded(USAGE, USAGE), AMOUNT * 2) },
			"plan-provider": { "model-alpha": { tokens: tokensOf(USAGE) } },
		});
		// The ended Round of the main session is a measured boundary and is not back-filled by any of
		// the child's work that settled after it.
		expect(view.roundTotals(MAIN.sessionId)).toEqual({
			previous: { official: { "model-alpha": consumedUsage(USAGE, AMOUNT) } },
		});

		// The child continues into a later Round — the shape a resumed subagent's next piece of work
		// has — and its own record accumulates on top of the one it already published.
		await endRound(surface, CHILD);
		const firstChildVersion = await savedDocument(CONSUMPTION_FILE_PATH, candidate =>
			piRecord(candidate, CHILD.sessionId) !== undefined,
		);
		expect(piRecord(firstChildVersion, CHILD.sessionId)?.own).toEqual({
			official: { "model-alpha": consumedUsage(USAGE, AMOUNT) },
		});

		vi.advanceTimersByTime(60_000);
		request(surface, CHILD, SECOND_USAGE, "resp-pi-accounting-later");
		await endRound(surface, CHILD);
		const document = await savedDocument(CONSUMPTION_FILE_PATH, candidate =>
			piRecord(candidate, CHILD.sessionId)?.saveVersion === 2,
		);
		expect(piRecord(document, CHILD.sessionId)?.own).toEqual({
			official: { "model-alpha": consumed(tokensAdded(USAGE, SECOND_USAGE), AMOUNT + SECOND_AMOUNT) },
		});
		// The main session's own record was never touched by the descendant's later Rounds, and the
		// grandchild's is written by its own Round's end alone.
		expect(piRecord(document, MAIN.sessionId)?.own).toEqual({
			official: { "model-alpha": consumedUsage(USAGE, AMOUNT) },
		});
		await endRound(surface, GRANDCHILD);
		const withGrandchild = await savedDocument(CONSUMPTION_FILE_PATH, candidate =>
			piRecord(candidate, GRANDCHILD.sessionId) !== undefined,
		);
		expect(piRecord(withGrandchild, GRANDCHILD.sessionId)).toEqual({
			id: GRANDCHILD.sessionId,
			name: GRANDCHILD.name,
			parent: CHILD.sessionId,
			startup: { model: { provider: "plan-provider", model: "model-alpha" }, effort: "low" },
			saveVersion: 1,
			own: { "plan-provider": { "model-alpha": { tokens: tokensOf(USAGE) } } },
			// The grandchild's own one activity, measured between the two edges of its Round exactly as
			// its parent's is (see `tests/model-cost/subagent-runtime.test.ts` for that arithmetic).
			runtimeMs: expect.any(Number),
		});
	});
});

describe("one observed request is accounted exactly once (P8)", () => {
	test("a repeated native settle recounts nothing, across a Round boundary and in the next process", async () => {
		const surface = assemblePiSurface();
		const { view } = surface.runtime;

		surface.sessionStarts(MAIN, "startup");
		await surface.agentStarts(MAIN);
		request(surface, MAIN, USAGE);
		const once = view.own(MAIN.sessionId);
		expect(once).toEqual({ official: { "model-alpha": consumedUsage(USAGE, AMOUNT) } });

		// The same finalized message delivered again by the host — the same fact, not a new request: it
		// accounts nothing, whatever layer recognizes it.
		surface.messageEnds(MAIN, assistantMessage(USAGE));
		expect(view.own(MAIN.sessionId)).toEqual(once);

		// A Round boundary in between changes nothing about that: the Round ends, the session's own
		// record is published, and the repeated fact still accounts nothing.
		await endRound(surface, MAIN);
		const published = await savedDocument(CONSUMPTION_FILE_PATH, candidate => piRecord(candidate, MAIN.sessionId) !== undefined);
		expect(piRecord(published, MAIN.sessionId)).toEqual({
			id: MAIN.sessionId,
			name: MAIN.name,
			parent: null,
			startup: { model: { provider: PROVIDER, model: MODEL }, effort: "high" },
			saveVersion: 1,
			own: { official: { "model-alpha": consumedUsage(USAGE, AMOUNT) } },
		});

		surface.messageEnds(MAIN, assistantMessage(USAGE));
		surface.runStarts(MAIN);
		vi.advanceTimersByTime(1_000);
		surface.messageEnds(MAIN, assistantMessage(USAGE));
		expect(view.own(MAIN.sessionId)).toEqual(once);

		// A genuinely new request of the same content is a second request and is accounted as one.
		vi.advanceTimersByTime(30_000);
		surface.requestStarts(MAIN);
		vi.advanceTimersByTime(4_000);
		surface.messageEnds(MAIN, assistantMessage(USAGE, { responseId: "resp-pi-accounting-2" }));
		expect(view.own(MAIN.sessionId)).toEqual({
			official: { "model-alpha": consumed(tokensAdded(USAGE, USAGE), AMOUNT * 2) },
		});

		// The next process reads the same document: the saved value is the two requests that really
		// happened, so nothing of the repeat was persisted either.
		await endRound(surface, MAIN);
		const second = await savedDocument(CONSUMPTION_FILE_PATH, candidate =>
			piRecord(candidate, MAIN.sessionId)?.saveVersion === 2,
		);
		expect(piRecord(second, MAIN.sessionId)?.own).toEqual({
			official: { "model-alpha": consumed(tokensAdded(USAGE, USAGE), AMOUNT * 2) },
		});
		const nextProcess = assemblePiSurface();
		nextProcess.sessionStarts(MAIN, "startup");
		await nextProcess.agentStarts(MAIN);
		expect(nextProcess.runtime.view.own(MAIN.sessionId)).toEqual({
			official: { "model-alpha": consumed(tokensAdded(USAGE, USAGE), AMOUNT * 2) },
		});
	});

	test("the same Turn delivered again is not a second consumption, and its mark outlives the Round and the period", async () => {
		const surface = assemblePiSurface();
		const { view } = surface.runtime;
		const subscribed = surface.runtime.implementation.subscriptions?.[0]?.events;
		if (subscribed?.turn_start === undefined || subscribed.turn_end === undefined) {
			throw new Error("the extension's own Turn subscription is not reachable through its implementation");
		}
		const turnStarted = subscribed.turn_start;
		const turnEnded = subscribed.turn_end;

		surface.sessionStarts(MAIN, "startup");
		await surface.agentStarts(MAIN);

		// The framework's own dispatch for one Turn: the start it minted and the settle it delivered.
		const start = turnStartOf(`${MAIN.sessionId}#t99`, MAIN_FACTS, atBeijing(13, 1));
		const settled = turnEndOf(start, atBeijing(13, 5));
		turnStarted(start);
		turnEnded(settled);
		expect(view.own(MAIN.sessionId)).toEqual({
			official: { "model-alpha": consumedUsage(USAGE, AMOUNT) },
		});

		// The identical delivery handed over again: the same Turn's own identity is already accounted,
		// so this is the same fact and not a second request.
		turnEnded(settled);
		expect(view.own(MAIN.sessionId)).toEqual({
			official: { "model-alpha": consumedUsage(USAGE, AMOUNT) },
		});

		// A Round boundary passes — the Round opens and ends, which publishes the session's own record.
		subscribed.round_start?.({
			event: { kind: "round_start" },
			owner: OWNER_OF_MAIN,
			session: MAIN_FACTS,
			hasUI: true,
			feedback: settled.feedback,
		});
		await subscribed.round_end?.({
			event: { kind: "round_end" },
			owner: OWNER_OF_MAIN,
			session: MAIN_FACTS,
			hasUI: true,
			feedback: settled.feedback,
		});
		await savedDocument(CONSUMPTION_FILE_PATH, candidate => piRecord(candidate, MAIN.sessionId) !== undefined);

		// The same Turn's start and settle delivered again after that boundary: the mark was not cleared
		// at the Round's end, so the replay is still the same request.
		turnStarted(start);
		turnEnded(settled);
		expect(view.own(MAIN.sessionId)).toEqual({
			official: { "model-alpha": consumedUsage(USAGE, AMOUNT) },
		});

		// Another process closes the accounting period underneath this instance — the document's own
		// generation changes — and this instance adopts it. What this period accumulated goes with it;
		// the Turn identities already accounted stay, because a repeated delivery names a request that
		// happened in the period that is gone rather than a new one in this one.
		await Bun.write(CONSUMPTION_FILE_PATH, JSON.stringify(storedDocument([], { omp: [storedRecord({ id: "omp-other" })] })));
		const outcome = await surface.runtime.synchronize();
		expect(outcome).toEqual({ kind: "adopted", periodChanged: true, changed: true });
		turnStarted(start);
		turnEnded(settled);
		expect(view.own(MAIN.sessionId)).toBeUndefined();
		expect(piRecordIds(readDocument(CONSUMPTION_FILE_PATH) ?? storedDocument([]))).toEqual([]);
	});

	test("a child's own saved record, this root's observation of it and the shared document are one consumption", async () => {
		// What the child's own process left in the shared document: the child's identity, its direct
		// parent and the one request it accounted there — the public form of that session's own work.
		writeFileSync(
			CONSUMPTION_FILE_PATH,
			JSON.stringify(
				storedDocument([
					storedRecord({ id: MAIN.sessionId, name: MAIN.name, parent: null, saveVersion: 4 }),
					storedRecord({
						id: CHILD.sessionId,
						name: CHILD.name,
						parent: MAIN.sessionId,
						saveVersion: 1,
						own: { official: { "model-alpha": storedOwn(USAGE, AMOUNT) } },
					}),
				]),
			),
			"utf8",
		);

		const surface = assemblePiSurface();
		const { view } = surface.runtime;
		surface.sessionStarts(MAIN, "startup");
		await surface.agentStarts(MAIN);

		// The baseline these views read is the child's own saved consumption, counted once: the child's
		// own record and the main session's inclusive total state the same one request.
		expect(view.own(CHILD.sessionId)).toEqual({
			official: { "model-alpha": consumedUsage(USAGE, AMOUNT) },
		});
		expect(view.inclusiveTotals(MAIN.sessionId)).toEqual({
			official: { "model-alpha": consumedUsage(USAGE, AMOUNT) },
		});

		// This root then observes the same child session working: a new request of that session adds to
		// the record another process already committed rather than replacing it or counting it twice.
		surface.sessionStarts(CHILD, "startup");
		request(surface, CHILD, SECOND_USAGE);
		expect(view.own(CHILD.sessionId)).toEqual({
			official: { "model-alpha": consumed(tokensAdded(USAGE, SECOND_USAGE), AMOUNT + SECOND_AMOUNT) },
		});
		expect(view.inclusiveTotals(MAIN.sessionId)).toEqual({
			official: { "model-alpha": consumed(tokensAdded(USAGE, SECOND_USAGE), AMOUNT + SECOND_AMOUNT) },
		});

		// The child's own Round end publishes the next version of that one record, and the main session's
		// record is left exactly as the file already held it.
		await endRound(surface, CHILD);
		const document = await savedDocument(CONSUMPTION_FILE_PATH, candidate =>
			piRecord(candidate, CHILD.sessionId)?.saveVersion === 2,
		);
		expect(piRecord(document, CHILD.sessionId)).toEqual({
			id: CHILD.sessionId,
			name: CHILD.name,
			parent: MAIN.sessionId,
			startup: { model: { provider: PROVIDER, model: MODEL }, effort: "medium" },
			saveVersion: 2,
			own: { official: { "model-alpha": consumed(tokensAdded(USAGE, SECOND_USAGE), AMOUNT + SECOND_AMOUNT) } },
			// The activity this root itself observed, added to the figure the record already carried from
			// the process before it: that record carried none, so this figure is the whole estimate (see
			// `tests/model-cost/subagent-runtime.test.ts` for how that figure is measured).
			runtimeMs: expect.any(Number),
		});
		expect(piRecord(document, MAIN.sessionId)).toEqual(storedRecord({ id: MAIN.sessionId, name: MAIN.name, parent: null, saveVersion: 4 }));
	});
});

describe("the tree and its inclusive total hold only the sessions this one really owns (P40)", () => {
	test("another root and another harness in one document stay out of this session's tree", async () => {
		const baseline = storedDocument(
			[
				storedRecord({
					id: MAIN.sessionId,
					name: MAIN.name,
					parent: null,
					saveVersion: 3,
					own: { official: { "model-alpha": storedOwn(USAGE, AMOUNT) } },
				}),
				storedRecord({
					id: CHILD.sessionId,
					name: "文档记下的子代理名",
					parent: MAIN.sessionId,
					saveVersion: 2,
					own: { official: { "model-alpha": storedOwn(SECOND_USAGE, SECOND_AMOUNT) } },
				}),
				storedRecord({
					id: GRANDCHILD.sessionId,
					name: GRANDCHILD.name,
					parent: CHILD.sessionId,
					saveVersion: 1,
					own: { "plan-provider": { "model-alpha": { tokens: tokensOf(USAGE) } } },
				}),
				storedRecord({
					id: OTHER_ROOT.sessionId,
					name: OTHER_ROOT.name,
					parent: null,
					saveVersion: 1,
					own: { official: { "model-beta": storedOwn(USAGE, BETA_AMOUNT) } },
				}),
				storedRecord({
					id: "pi-acc-other-child",
					name: "另一个子代理",
					parent: OTHER_ROOT.sessionId,
					saveVersion: 1,
					own: { official: { "model-beta": storedOwn(USAGE, BETA_AMOUNT) } },
				}),
			],
			// Another harness's half of the same file, including a session whose id is this harness's main
			// session: identity is the pair, so this is a different session with its own record.
			{ omp: [storedRecord({ id: MAIN.sessionId, name: "另一个 harness 的主会话", parent: null, saveVersion: 9 }), storedRecord({ id: "omp-only" })] },
		);
		writeFileSync(CONSUMPTION_FILE_PATH, JSON.stringify(baseline), "utf8");

		const surface = assemblePiSurface();
		surface.sessionStarts(MAIN, "startup");
		// The child starts as pi reports a session it cannot name: the display falls back to the name the
		// document recorded for that identity, and a session nothing ever named at all falls back to its
		// own id rather than being invented into a label.
		surface.sessionStarts(NAMELESS_CHILD, "startup");
		// The session the document never recorded, and which no delivery names: what makes it a session
		// this instance knows is the activity edge pi publishes with its facts — its own Round beginning.
		surface.sessionStarts(ANONYMOUS_CHILD, "startup");
		surface.runStarts(ANONYMOUS_CHILD);
		await surface.agentStarts(MAIN);
		await surface.command("detail", MAIN);

		const display = surface.runtime.presentation.of(targetOf(MAIN));
		const rows = display.agentTree ?? [];
		expect(rows.map(row => [row.kind, row.depth, row.name])).toEqual([
			["root", 0, MAIN.name],
			["model", 1, "official / model-alpha"],
			["session", 1, "文档记下的子代理名"],
			["session", 2, GRANDCHILD.name],
			["session", 1, ANONYMOUS_CHILD.sessionId],
		]);
		// Every row states that session's own consumption alone: the child's row is its own request and
		// never its grandchild's, and the grandchild's token-only request carries no amount.
		expect(rows[2]?.fields).toEqual({
			tokens: tokensOf(SECOND_USAGE),
			sum: SECOND_USAGE.totalTokens,
			cacheShare: false,
			cacheHitRate: 33,
			costCny: expect.closeTo(SECOND_AMOUNT, 12),
		});
		expect(rows[3]?.fields).toEqual({ tokens: tokensOf(USAGE), sum: USAGE.totalTokens, cacheShare: false, cacheHitRate: 33 });
		expect(rows[4]?.fields).toEqual({ tokens: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 }, sum: 0, cacheShare: false });
		// The tree's own inclusive total is the main session and its real descendants, each counted once:
		// the other root's tree and the other harness's records are nowhere in it.
		expect(display.tree).toEqual({
			tokens: tokensAdded(USAGE, SECOND_USAGE, USAGE),
			sum: USAGE.totalTokens * 2 + SECOND_USAGE.totalTokens,
			cacheHitRate: 33,
			costCny: expect.closeTo(AMOUNT + SECOND_AMOUNT, 12),
		});

		// Reading the tree writes nothing and re-prices nothing: the document still holds exactly the
		// records another writer committed, with the values they were committed with.
		expect(readDocument(CONSUMPTION_FILE_PATH)).toEqual(baseline);
		expect(surface.runtime.view.inclusiveTotals(OTHER_ROOT.sessionId)).toEqual({
			official: { "model-beta": consumed(tokensAdded(USAGE, USAGE), BETA_AMOUNT * 2) },
		});
	});

	test("a second process reads the same tree and the frontend indents it by direct parent", async () => {
		writeFileSync(
			CONSUMPTION_FILE_PATH,
			JSON.stringify(
				storedDocument([
					storedRecord({ id: MAIN.sessionId, name: MAIN.name, parent: null, saveVersion: 1 }),
					storedRecord({
						id: CHILD.sessionId,
						name: CHILD.name,
						parent: MAIN.sessionId,
						saveVersion: 1,
						own: { official: { "model-alpha": storedOwn(SECOND_USAGE, SECOND_AMOUNT) } },
					}),
					storedRecord({
						id: GRANDCHILD.sessionId,
						name: GRANDCHILD.name,
						parent: CHILD.sessionId,
						saveVersion: 1,
						own: { "plan-provider": { "model-alpha": { tokens: tokensOf(USAGE) } } },
					}),
				]),
			),
			"utf8",
		);

		// The process that observes one more request of the main session and commits it.
		const first = assemblePiSurface();
		first.sessionStarts(MAIN, "startup");
		await first.agentStarts(MAIN);
		request(first, MAIN, USAGE);
		await endRound(first, MAIN);
		const committed = await savedDocument(CONSUMPTION_FILE_PATH, candidate =>
			piRecord(candidate, MAIN.sessionId)?.saveVersion === 2,
		);
		expect(piRecord(committed, MAIN.sessionId)?.own).toEqual({
			official: { "model-alpha": consumedUsage(USAGE, AMOUNT) },
		});

		// The next process: another binding over the same storage root, which is what a pi restart is.
		const surface = assemblePiSurface();
		surface.sessionStarts(MAIN, "startup");
		await surface.agentStarts(MAIN);
		await surface.command("detail", MAIN);

		// The tree it reads is the committed one: this session's own request continued from the record,
		// and the two descendants below it by their direct parents.
		const rows = surface.runtime.presentation.of(targetOf(MAIN)).agentTree ?? [];
		expect(rows.map(row => [row.kind, row.depth, row.name])).toEqual([
			["root", 0, MAIN.name],
			["model", 1, "official / model-alpha"],
			["session", 1, CHILD.name],
			["session", 2, GRANDCHILD.name],
		]);
		expect(rows[2]?.fields).toEqual({
			tokens: tokensOf(SECOND_USAGE),
			sum: SECOND_USAGE.totalTokens,
			cacheShare: false,
			cacheHitRate: 33,
			costCny: expect.closeTo(SECOND_AMOUNT, 12),
		});
		expect(surface.runtime.view.inclusiveTotals(MAIN.sessionId)).toEqual({
			official: { "model-alpha": consumed(tokensAdded(USAGE, SECOND_USAGE), AMOUNT + SECOND_AMOUNT) },
			"plan-provider": { "model-alpha": { tokens: tokensOf(USAGE) } },
		});

		// The drawing carries that same tree, one line per row, indented by the row's own distance: the
		// child one step in and the grandchild two, which is the direct parent chain made visible.
		const lines = await drawnLines(surface, candidate => candidate.some(line => line.startsWith(`  ${CHILD.name}`)));
		expect(lines.some(line => line.startsWith(`  ${CHILD.name}`))).toBe(true);
		expect(lines.some(line => line.startsWith(`    ${GRANDCHILD.name}`))).toBe(true);
		expect(lines.some(line => line.includes(OTHER_ROOT.name))).toBe(false);
	});
});
