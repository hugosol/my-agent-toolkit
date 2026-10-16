/**
 * The main session's Session span on pi, from the native facts to the drawing and the document the
 * run leaves behind (S1, S2, S3; contract P28; ticket 12).
 *
 * The span's own suite (`session-span.test.ts`) drives the framework's public deliveries with
 * self-made instants and covers the rules themselves. What this suite adds is the *pi* realization of
 * the same rules, and it adds it at the seam a pi run really uses: the extension's production assembly
 * — `modelCostPiHarness` — bound through the framework's real pi adapter and carrying its own frontend,
 * with the native facts a pi session publishes as the only deliveries that move anything (a submitted
 * input, the request about to go out, the finalized assistant message, pi's own low-level run end and
 * its settled run, and the reasons a session starts with). Both halves of the observable path stay
 * production: the lines the frontend handed pi to draw, and the document the run wrote under the `pi`
 * harness bucket. One case reads that document again through a second assembly, which is the reload a
 * pi process really is.
 *
 * The clock is this suite's own: `vi` fakes the clock, so every instant below is one this file advanced
 * to, while the file system stays real and each wait repeats one harness task rather than a duration. Nothing is read back from the implementation to form an expectation — the instants are stated
 * here, and the two subagents' runtimes are the loaded document's own independent numbers.
 *
 * One repository root and one storage root serve the whole file, because the framework reads an
 * extension's configuration once per process: a second binding in the same process reuses the values
 * the first one validated, which is the production rule rather than a limitation of the harness. Each
 * case therefore states its own sessions — a fresh identity where the span must begin from nothing, and
 * the identities the document already carries where the case is about a restored record — and reads
 * the shared document per identity.
 *
 * Coverage this file owns for P28: the timeline (input, idle, a tool tail, the same session resumed
 * from the document, and a fork), the reading never taken from a tool end or a Round end, and the three
 * time figures — the main session's span beside two subagents' accumulated runtimes — never standing in
 * for one another across the drawing and the reload.
 *
 * The reset segment is the switch action's rather than this file's: `period-switch.test.ts` drives the
 * period change over the framework's own public binding, where the closed period's span leaves the new
 * document and the new period's span starts at the first input observed in it.
 */
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { type PiAssistantMessage, type PiExtensionApi, type PiExtensionContext, piAdapter } from "../../framework/adapters/pi";
import { MODEL_COST } from "../../extensions/model-cost/definition";
import { MODEL_COST_HARNESS } from "../../extensions/model-cost/harnesses/pi";
import { MODEL_COST_WIDGET_KEY, attachModelCostWidget } from "../../extensions/model-cost/harnesses/pi/widget";
import { type ModelCostRuntime, createModelCostRuntime } from "../../extensions/model-cost/shared-logic/runtime";
import type { ConsumptionDocument, SessionRecord } from "../../extensions/model-cost/shared-logic/consumption-document";

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * One Beijing wall-clock reading on Wednesday 2026-10-14, as an epoch instant: the day every case
 * below places its observations on, read as the operator's own clock reads it.
 */
function atBeijing(hours: number, minutes = 0, seconds = 0, ms = 0): number {
	return Date.UTC(2026, 9, 14, hours, minutes, seconds, ms) - BEIJING_OFFSET_MS;
}

/** The provider and exact model id this suite's sessions run: the maintained data's own monetary pair. */
const PROVIDER = "deepseek";
const MODEL = "deepseek-flash";
/** The document a pi run's storage root holds. */
const CONSUMPTION_FILE = "consumption.json";
/** The usage every completing request reports, as pi's own finalized message carries it. */
const USAGE = { input: 2_000, cacheRead: 1_000, cacheWrite: 0, output: 1_000, totalTokens: 4_000 };

/**
 * The session the operator is in for the subagent case: pi's own main session, running the pair above.
 */
const MAIN: PiSession = {
	sessionId: "pi-span-main",
	name: "pi 主会话",
	model: { id: MODEL, provider: PROVIDER },
	thinkingLevel: "high",
	idle: true,
	pending: false,
};

/** One session of the timeline case: a fresh identity the document carries nothing for. */
const TIMELINE: PiSession = { ...MAIN, sessionId: "pi-span-timeline", name: "pi 时间轴会话" };

/** The session the resume case reads back: one an earlier process already recorded. */
const RESTORED: PiSession = { ...MAIN, sessionId: "pi-span-restored", name: "pi 恢复会话" };

/** The session a fork is made from, and the fork itself: another identity under its own id. */
const SOURCE: PiSession = { ...MAIN, sessionId: "pi-span-source", name: "pi 源会话" };
const FORK: PiSession = { ...MAIN, sessionId: "pi-span-fork", name: "pi fork" };

/** The two subagents one case loads as independent data: siblings under the main session. */
const SCOUT: PiSession = { ...MAIN, sessionId: "pi-span-scout", name: "scout" };
const RUNNER: PiSession = { ...MAIN, sessionId: "pi-span-runner", name: "runner" };

/**
 * The consumption one record this suite seeds carries: a real pair of the maintained data, so a loaded
 * record is an ordinary one rather than something the pricing rules would call unpriced.
 */
const SEEDED_OWN = {
	[PROVIDER]: { [MODEL]: { tokens: { input: 10, cacheRead: 0, cacheWrite: 0, output: 5 }, costCny: 0.00005 } },
} as const;

/**
 * One session record as a document carries it, with the fields a case does not state left at the
 * ordinary values a stored record has.
 */
function storedRecord(overrides: Partial<SessionRecord> & { readonly id: string }): SessionRecord {
	return { name: overrides.id, parent: null, saveVersion: 2, own: SEEDED_OWN, ...overrides };
}

/**
 * One activity document as a root holds it.
 *
 * The bucket is the harness identity the pi assembly declares — the same string a real pi process
 * writes its sessions under — and the period is the one every case's records belong to.
 */
function storedDocument(records: readonly SessionRecord[]): ConsumptionDocument {
	return {
		schemaVersion: 1,
		periodId: "period-pi-span",
		start: "2026-10-14T00:00:00.000Z",
		holiday: false,
		harnesses: { pi: { sessions: [...records] } },
	};
}

/**
 * The repository root every binding in this file resolves its configuration from, and the storage root
 * that configuration names: the two the suite creates once, beside the document an earlier process left
 * there.
 *
 * The document is written before the first binding reads it, and it is deliberately partial: it holds
 * the session the resume case reads back (with the span an earlier process observed for it), the main
 * session the subagent case is in, and that session's two subagents with the runtimes the document
 * measures for them. Nothing it holds belongs to a session whose span this suite is about to observe
 * from nothing.
 */
const STORAGE_ROOT = mkdtempSync(path.join(tmpdir(), "pi-span-store-"));
const REPOSITORY_ROOT = mkdtempSync(path.join(tmpdir(), "pi-span-repo-"));
const CONSUMPTION_FILE_PATH = path.join(STORAGE_ROOT, CONSUMPTION_FILE);
mkdirSync(path.join(REPOSITORY_ROOT, "extensions", "model-cost"), { recursive: true });
// The declared fields the framework validates when it binds this extension; the storage root is stated
// with forward slashes and quoted, so a Windows path is the literal YAML string it is.
writeFileSync(
	path.join(REPOSITORY_ROOT, "extensions", "model-cost", "config.yaml"),
	[`storageDir: '${STORAGE_ROOT.replace(/\\/g, "/")}'`, "balanceTtlMs: 30000", "codexQuotaTtlMs: 15000", ""].join("\n"),
	"utf8",
);
/** The subagent durations the document this suite loads states, in milliseconds. */
const SCOUT_RUNTIME_MS = 25 * 60_000;
const RUNNER_RUNTIME_MS = 40 * 60_000;
writeFileSync(
	CONSUMPTION_FILE_PATH,
	JSON.stringify(
		storedDocument([
			storedRecord({ id: MAIN.sessionId, name: MAIN.name, parent: null }),
			storedRecord({ id: SCOUT.sessionId, name: SCOUT.name, parent: MAIN.sessionId, runtimeMs: SCOUT_RUNTIME_MS }),
			storedRecord({
				id: RUNNER.sessionId,
				name: RUNNER.name,
				parent: MAIN.sessionId,
				runtimeMs: RUNNER_RUNTIME_MS,
			}),
			storedRecord({
				id: RESTORED.sessionId,
				name: RESTORED.name,
				parent: null,
				span: { start: atBeijing(9, 30), end: atBeijing(9, 40) },
			}),
		]),
	),
	"utf8",
);

/** One session as pi's own surface reports it: identity, the model it runs, and its two facts. */
interface PiSession {
	readonly sessionId: string;
	readonly name?: string;
	readonly model?: { readonly id?: string; readonly provider?: string };
	readonly thinkingLevel?: string;
	readonly idle?: boolean;
	readonly pending?: boolean;
}

/** One widget rendering the frontend published, for whatever key it published under. */
interface DrawnFrame {
	readonly key: string;
	readonly lines: readonly string[] | undefined;
}

/** The pi native surface the assembly is bound to, with everything a case delivers and reads. */
interface PiSurface {
	/** The native api the assembly is bound to, as the loader hands it over. */
	readonly api: PiExtensionApi;
	/** The widget renderings the frontend handed the host, in call order. */
	readonly widgets: DrawnFrame[];
	/** The notices the extension published through the host's own channel, in call order. */
	readonly notices: Array<{ readonly level: string; readonly message: string }>;
	/** One session starting, with the reason pi states. */
	sessionStarts(session: PiSession, reason: "startup" | "reload" | "new" | "resume" | "fork"): void;
	/** One submission pi admitted, as the user's own. */
	submits(session: PiSession): void;
	/** pi's agent loop beginning. */
	runStarts(session: PiSession): void;
	/** pi's low-level run end: the level below settlement, published before its continuations are decided. */
	runEnds(session: PiSession): void;
	/** pi's run fully settled, with nothing left to continue it. */
	runSettles(session: PiSession): void;
	/** A request about to be issued. */
	requestStarts(session: PiSession): void;
	/** One finalized assistant message. */
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

/** One controlled pi native surface: the members the adapter registers on, and the host's own answers. */
function controlledSurface(): PiSurface {
	const handlers = new Map<string, Array<(event: unknown, ctx: PiExtensionContext) => unknown>>();
	const commands = new Map<string, { readonly handler: (args: string, ctx: PiExtensionContext) => Promise<void> }>();
	const widgets: DrawnFrame[] = [];
	const notices: Array<{ readonly level: string; readonly message: string }> = [];

	const contextOf = (session: PiSession): PiExtensionContext =>
		({
			sessionManager: {
				getSessionId: () => session.sessionId,
				getSessionName: () => session.name,
				getBranch: () => [],
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
		widgets,
		notices,
		sessionStarts: (session, reason) => void deliver("session_start", { type: "session_start", reason }, session),
		submits: session => void deliver("input", { type: "input", source: "rpc" }, session),
		runStarts: session => void deliver("agent_start", { type: "agent_start" }, session),
		runEnds: session => void deliver("agent_end", { type: "agent_end", messages: [] }, session),
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
	return surface;
}

/**
 * The extension assembled on pi, with the one deployment fact a suite must state for itself.
 *
 * The production assembly is `modelCostPiHarness(repositoryRoot)`, and the framework resolves the
 * extension's `config.yaml` through it — but the framework reads one extension's configuration once per
 * process, so in a process that binds model-cost from more than one suite the first binding's values win
 * and no later suite can name its own storage root. What this file therefore composes is the assembly
 * itself, from the same parts the production one composes: the framework's real pi adapter, the
 * extension's real definition, the real runtime built from the framework's validated configuration, and
 * the real frontend, with the frontend's release composed into the framework's own cleanup exactly as the
 * assembly does it. The only thing stated here that the shipped file states for a real run is the storage
 * root; the real entrypoint, the shipped `config.yaml` and a real pi process are the real-host smoke's.
 */
function assemble(): PiSurface {
	const surface = controlledSurface();
	let runtime: ModelCostRuntime | undefined;
	let releaseFrontend: (() => void) | undefined;
	const bind = piAdapter(MODEL_COST, {
		configBaseDir: REPOSITORY_ROOT,
		factory: context => {
			const built = createModelCostRuntime({
				config: { ...context.config, storageDir: STORAGE_ROOT },
				configDirectory: path.join(REPOSITORY_ROOT, "extensions", MODEL_COST.id),
				userHomeDirectory: STORAGE_ROOT,
				harness: MODEL_COST_HARNESS,
				// The one harness fact this hand-built assembly states for itself: the cases below drive
				// the display and the tree, which the extension offers to an entry whose subagent
				// observations integrated — the shipped assembly records that answer from the framework's
				// own initialization delivery (see `harnesses/pi.ts`).
				subagentIntegrationMode: () => "subagents",
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
	const bound = bind(surface.api);
	if (bound.bound && runtime !== undefined) releaseFrontend = attachModelCostWidget(surface.api, runtime);
	return surface;
}

/** One assistant response as pi hands its finalized message over: the usage and the outcome it states. */
function assistantMessage(overrides: Partial<PiAssistantMessage> = {}): PiAssistantMessage {
	return {
		role: "assistant",
		stopReason: "stop",
		responseId: "resp-pi-span",
		usage: { ...USAGE },
		...overrides,
	};
}

/**
 * One turn of the harness's own next task, and the file system behind it.
 *
 * pi's `nextTask` — where the framework arranges the Round's end re-check — is a zero-delay timer, and
 * this suite's `Date` is faked along with the timer queue, so the re-check runs only when the clock is
 * advanced. The step is the interval the framework's own file coordination polls at (`files.ts`: 25 ms
 * between attempts at a lock and between turns of a document's queue), which is what a save waits on:
 * a smaller step would leave a publication that really is in progress waiting forever. The immediate
 * turn after it is real, and is what lets the bytes a save writes actually land. Neither is a duration
 * this suite guesses at, so every wait below repeats the pair until the content it waits for is there.
 */
async function harnessTask(): Promise<void> {
	vi.advanceTimersByTime(25);
	const { promise, resolve } = Promise.withResolvers<void>();
	setImmediate(resolve);
	await promise;
}

/**
 * Waits until the frontend has drawn a widget a case expects, and answers with its lines.
 *
 * A render is triggered by the accounting's own change notification, so what a case waits for is the
 * drawing of the fact it just delivered rather than a duration; the attempt count only keeps a
 * drawing that never happens from hanging the case.
 */
async function drawnLines(surface: PiSurface, accept: (lines: readonly string[]) => boolean): Promise<readonly string[]> {
	for (let attempt = 0; attempt < 200; attempt += 1) {
		const lines = surface.lastLines();
		if (lines !== undefined && accept(lines)) return lines;
		await harnessTask();
	}
	throw new Error(`no widget drew what the case expects; last drawn ${JSON.stringify(surface.lastLines())}`);
}

/** One drawing's Total row, or a failure naming what was drawn instead. */
function totalLine(lines: readonly string[]): string {
	const line = lines.find(candidate => candidate.startsWith("Total:"));
	if (line === undefined) throw new Error(`the Total was not drawn: ${JSON.stringify(lines)}`);
	return line;
}

/** The Total row of the widget the frontend drew last. */
function drawnTotal(surface: PiSurface): string {
	const lines = surface.lastLines();
	if (lines === undefined) throw new Error("the frontend drew no widget at all");
	return totalLine(lines);
}

/** The drawing's own row for one session, found by the name the display decided to call it. */
function rowOf(lines: readonly string[], name: string): string {
	const row = lines.find(line => line.trim().startsWith(`${name} `) || line.trim() === name);
	if (row === undefined) throw new Error(`no row was drawn for ${name}: ${JSON.stringify(lines)}`);
	return row;
}

/** The document one file holds right now, or `undefined` while it holds none. */
function readDocument(file: string): ConsumptionDocument | undefined {
	if (!existsSync(file)) return undefined;
	try {
		return JSON.parse(readFileSync(file, "utf8")) as ConsumptionDocument;
	} catch {
		return undefined;
	}
}

/**
 * Waits until the document holds what a case expects of it, and answers with the document.
 *
 * A Round's end is dispatched the way the framework dispatches a semantic handler — without waiting
 * for the promise it returns — so the save it drives lands a few event-loop turns later. The wait is
 * on the expected content rather than on a duration, and the attempt count only keeps a save that
 * never happened from hanging the case.
 */
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
		`no consumption document the case expects was published at ${file}; it holds ${JSON.stringify(readDocument(file))} (raw ${JSON.stringify(existsSync(file) ? readFileSync(file, "utf8") : undefined)})`,
	);
}

/** One session's record in a document, or `undefined` when the document holds none for that id. */
function recordOf(document: ConsumptionDocument, id: string): SessionRecord | undefined {
	return Object.values(document.harnesses)
		.flatMap(bucket => bucket.sessions)
		.find(record => record.id === id);
}

/** The document of the `pi` bucket's one session record, or a failure naming what was found instead. */
function piRecord(document: ConsumptionDocument, id: string): SessionRecord {
	const record = recordOf(document, id);
	if (record === undefined) throw new Error(`the pi bucket holds no record for ${id}: ${JSON.stringify(document)}`);
	return record;
}

beforeEach(() => {
	// This suite's clock: every instant a case asserts is the instant its own advance put the clock at,
	// and the timer queue that pi's `nextTask` lands in is run by the turns {@link harnessTask} takes.
	vi.useFakeTimers({ now: atBeijing(10, 0) });
});

afterEach(() => {
	vi.useRealTimers();
});

afterAll(() => {
	rmSync(STORAGE_ROOT, { recursive: true, force: true });
	rmSync(REPOSITORY_ROOT, { recursive: true, force: true });
});

describe("the span runs from the submission to the last response's own settle (P28)", () => {
	test("a submission starts it, the tool tail and pi's own run end move nothing, and the last settle ends it", async () => {
		const surface = assemble();
		const file = CONSUMPTION_FILE_PATH;

		// pi's session exists from its own start, before the operator has said anything: no submission
		// has been observed, so the session's time is unknown — a dash — rather than zero.
		surface.sessionStarts(TIMELINE, "startup");
		await surface.agentStarts(TIMELINE);
		expect(totalLine(await drawnLines(surface, lines => lines.some(line => line.startsWith("Total:"))))).toContain(
			"Span: \u2014",
		);

		// A whole exchange before any submission: a request that really settled is not a start either, so
		// the session's time is still unknown while the consumption of that Turn is committed normally.
		surface.runStarts(TIMELINE);
		vi.advanceTimersByTime(30_000);
		surface.requestStarts(TIMELINE);
		vi.advanceTimersByTime(30_000);
		surface.messageEnds(TIMELINE, assistantMessage());
		surface.runSettles(TIMELINE);
		const beforeAnySubmission = await savedDocument(file, document => recordOf(document, TIMELINE.sessionId) !== undefined);
		expect(piRecord(beforeAnySubmission, TIMELINE.sessionId).span).toBeUndefined();
		expect(drawnTotal(surface)).toContain("Span: \u2014");

		// The operator's own submission nine minutes later — the one fact that establishes the start,
		// which is the instant this suite's own clock read when it delivered it — and the request it
		// leads to one minute after that, whose response settles four minutes on asking for a tool.
		vi.advanceTimersByTime(9 * 60_000);
		const submittedAt = Date.now();
		surface.submits(TIMELINE);
		surface.runStarts(TIMELINE);
		vi.advanceTimersByTime(60_000);
		surface.requestStarts(TIMELINE);
		vi.advanceTimersByTime(4 * 60_000);
		const firstSettleAt = Date.now();
		surface.messageEnds(TIMELINE, assistantMessage({ stopReason: "toolUse" }));

		// Five minutes of wall clock, counted from the submission and from nothing else. The drawing
		// carries the same figure the pair makes.
		expect(drawnTotal(surface)).toContain("Span: 0:05:00");

		// pi's own low-level end — the run end it publishes at the level below settlement, the one a tool's
		// execution sits behind — carries nothing that ends a Turn: the Turn axis is the request and the
		// settled response, so a tool ending moves the reading not at all.
		vi.advanceTimersByTime(30 * 60_000);
		surface.runEnds(TIMELINE);
		expect(drawnTotal(surface)).toContain("Span: 0:05:00");

		// The follow-up request the tool's result leads to: its response settles four minutes on, which is
		// the Turn's own end, and the span now covers the tail it waited through.
		vi.advanceTimersByTime(60_000);
		surface.requestStarts(TIMELINE);
		vi.advanceTimersByTime(4 * 60_000);
		const lastSettleAt = Date.now();
		surface.messageEnds(TIMELINE, assistantMessage({ responseId: "resp-pi-span-2" }));
		expect(drawnTotal(surface)).toContain("Span: 0:40:00");

		// The Round's own end a minute later is a boundary of the session's consumption and of nothing
		// else: the end stays the instant the last response settled at, and the commit that carries the
		// pair is that Round's end.
		vi.advanceTimersByTime(60_000);
		surface.runSettles(TIMELINE);
		const saved = await savedDocument(file, document => piRecord(document, TIMELINE.sessionId).span !== undefined);
		expect(piRecord(saved, TIMELINE.sessionId).span).toEqual({ start: submittedAt, end: lastSettleAt });
		expect(lastSettleAt - submittedAt).toBeGreaterThanOrEqual(5 * 60_000);
		expect(lastSettleAt - firstSettleAt).toBeGreaterThanOrEqual(35 * 60_000);
		expect(drawnTotal(surface)).toContain("Span: 0:40:00");
	});
});
describe("the span is restored from the document and continued rather than restarted (P28)", () => {
	test("a process that resumes the session keeps the saved start and moves only its end", async () => {
		const surface = assemble();
		const file = CONSUMPTION_FILE_PATH;
		// The pair this session's record already carries, which this process never observed: the
		// operator's input at 09:30 and the last Turn's settle at 09:40, ten minutes.
		const earlierStart = atBeijing(9, 30);

		// pi resumes the session in a new process, and the frontend draws the pair the document already
		// carries — ten minutes — before anything new has happened in this process.
		surface.sessionStarts(RESTORED, "resume");
		await surface.agentStarts(RESTORED);
		expect(totalLine(await drawnLines(surface, lines => totalLine(lines).includes("0:10:00")))).toContain(
			"Span: 0:10:00",
		);

		// The operator submits half an hour into the resumed session. A start is taken once per session,
		// so this input moves nothing: the span still counts from the saved start.
		vi.advanceTimersByTime(30 * 60_000);
		surface.submits(RESTORED);
		surface.runStarts(RESTORED);
		vi.advanceTimersByTime(60_000);
		surface.requestStarts(RESTORED);
		vi.advanceTimersByTime(5 * 60_000);
		const settleAt = Date.now();
		surface.messageEnds(RESTORED, assistantMessage());

		// Sixty-six minutes: the saved 09:30 start, not the 10:30 submission and not the five minutes this
		// exchange took — the half hour the session was closed for is inside the span.
		expect(drawnTotal(surface)).toContain("Span: 1:06:00");

		surface.runSettles(RESTORED);
		const saved = await savedDocument(file, document => piRecord(document, RESTORED.sessionId).span?.end === settleAt);
		expect(piRecord(saved, RESTORED.sessionId).span).toEqual({ start: earlierStart, end: settleAt });
	});
});
describe("a fork starts from its own first new input, and its source keeps its own span (P28)", () => {
	test("the copied history establishes nothing, and the two sessions' spans stay separate", async () => {
		const surface = assemble();
		const file = CONSUMPTION_FILE_PATH;

		// The source session runs one exchange: its own submission, and a response that settles four
		// minutes after it.
		surface.sessionStarts(SOURCE, "startup");
		await surface.agentStarts(SOURCE);
		vi.advanceTimersByTime(60_000);
		const sourceSubmittedAt = Date.now();
		surface.submits(SOURCE);
		surface.runStarts(SOURCE);
		surface.requestStarts(SOURCE);
		vi.advanceTimersByTime(4 * 60_000);
		const sourceSettleAt = Date.now();
		surface.messageEnds(SOURCE, assistantMessage());
		expect(drawnTotal(surface)).toContain("Span: 0:04:00");
		surface.runSettles(SOURCE);
		await savedDocument(file, document => recordOf(document, SOURCE.sessionId)?.span !== undefined);

		// pi forks it: a new identity whose transcript is a copy of the source's. The copy is not a
		// submission, so the fork's own time is unknown rather than the source's four minutes.
		vi.advanceTimersByTime(10 * 60_000);
		surface.sessionStarts(FORK, "fork");
		expect(drawnTotal(surface)).toContain("Span: \u2014");

		// The fork's own first submission, and its own response settling three minutes after that: three
		// minutes counted from the fork's submission, not from the copied history.
		vi.advanceTimersByTime(5 * 60_000);
		const forkSubmittedAt = Date.now();
		surface.submits(FORK);
		surface.runStarts(FORK);
		surface.requestStarts(FORK);
		vi.advanceTimersByTime(3 * 60_000);
		const forkSettleAt = Date.now();
		surface.messageEnds(FORK, assistantMessage({ responseId: "resp-pi-span-fork" }));
		expect(drawnTotal(surface)).toContain("Span: 0:03:00");
		surface.runSettles(FORK);

		// Both records sit in the pi bucket, each carrying its own session's pair: the fork's time never
		// replaced its source's, and the source's never leaked into the fork's.
		const saved = await savedDocument(file, document => recordOf(document, FORK.sessionId)?.span !== undefined);
		expect(Object.keys(saved.harnesses)).toEqual(["pi"]);
		expect(piRecord(saved, SOURCE.sessionId).span).toEqual({ start: sourceSubmittedAt, end: sourceSettleAt });
		expect(piRecord(saved, FORK.sessionId).span).toEqual({ start: forkSubmittedAt, end: forkSettleAt });
		expect(piRecord(saved, FORK.sessionId).parent).toBeNull();
	});
});
describe("the main span and two subagents' accumulated runtimes never stand for one another (P28)", () => {
	test("eighteen minutes of main session beside twenty-five and forty minutes of subagents", async () => {
		const surface = assemble();
		const file = CONSUMPTION_FILE_PATH;

		// The main session's own timeline in this process: a submission, and a response that settles
		// eighteen minutes after it.
		surface.sessionStarts(MAIN, "startup");
		await surface.agentStarts(MAIN);
		vi.advanceTimersByTime(60_000);
		const submittedAt = Date.now();
		surface.submits(MAIN);
		surface.runStarts(MAIN);
		surface.requestStarts(MAIN);
		vi.advanceTimersByTime(18 * 60_000);
		const settleAt = Date.now();
		surface.messageEnds(MAIN, assistantMessage());
		surface.runSettles(MAIN);
		await savedDocument(file, document => piRecord(document, MAIN.sessionId).span?.end === settleAt);

		// The detail form, driven through pi's own command path: the Total's one time figure is the main
		// session's span, and each subagent's own row carries its own accumulated runtime.
		await surface.command("detail", MAIN);
		const lines = await drawnLines(
			surface,
			drawn => drawn.some(line => line.startsWith("Total:")) && drawn.some(line => line.includes("Run:")),
		);
		expect(totalLine(lines)).toContain("Span: 0:18:00");
		expect(rowOf(lines, SCOUT.name as string)).toContain("Run: 25m");
		expect(rowOf(lines, RUNNER.name as string)).toContain("Run: 40m");
		// The three figures are three: neither the sum of the children's runtimes (65 minutes) nor either
		// one of them is the value the Total shows.
		expect(totalLine(lines)).not.toContain("1:05:00");
		expect(totalLine(lines)).not.toContain("25m");
		expect(totalLine(lines)).not.toContain("40m");

		// The document keeps the same three apart: the main session's own pair, and each child's own
		// duration untouched by the live run.
		const saved = await savedDocument(file, document => piRecord(document, MAIN.sessionId).span?.end === settleAt);
		expect(piRecord(saved, MAIN.sessionId).span).toEqual({ start: submittedAt, end: settleAt });
		expect(piRecord(saved, SCOUT.sessionId).runtimeMs).toBe(SCOUT_RUNTIME_MS);
		expect(piRecord(saved, RUNNER.sessionId).runtimeMs).toBe(RUNNER_RUNTIME_MS);

		// A second process over the same root reads the same three values back: the main session's span
		// from its own record, each child's runtime from its own, and the detail form drawing both.
		const second = assemble();
		second.sessionStarts(MAIN, "resume");
		await second.agentStarts(MAIN);
		await second.command("detail", MAIN);
		const restored = await drawnLines(
			second,
			drawn => drawn.some(line => line.startsWith("Total:")) && drawn.some(line => line.includes("Run:")),
		);
		expect(totalLine(restored)).toContain("Span: 0:18:00");
		expect(rowOf(restored, SCOUT.name as string)).toContain("Run: 25m");
		expect(rowOf(restored, RUNNER.name as string)).toContain("Run: 40m");
		expect(piRecord(await savedDocument(file, () => true), MAIN.sessionId).span).toEqual({
			start: submittedAt,
			end: settleAt,
		});
	});
});
