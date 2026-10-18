/**
 * `/budget clear` and `/budget holiday` on pi: the whole-file archive, the new period they publish,
 * and the entry conditions that refuse them (S1, S2, S3; contract P35, P36, P37; ticket 15).
 *
 * The period switch's own rules — the archive-then-publish order, the one boundary balance read, the
 * failure stages, the period's own time — are stated with self-made deliveries in
 * `period-switch.test.ts`, over the framework's public binding. What this suite adds is the *pi*
 * realization of the same rules, at the seam a pi run really uses: the extension's production pi
 * assembly bound through the framework's real pi adapter, the `/budget` command driven through pi's
 * own command registration, and the native facts a pi session publishes as the only things that move
 * anything (a session's start with its own model, the submissions and run-cycle facts behind the
 * Round, the request about to go out, the finalized assistant message, and the surface's own idle and
 * registry readings). Both halves of the observable path stay production: the notices the extension
 * handed pi's operator channel, the widget frames it handed pi's widget area, and the document and
 * archives the run left in its storage root, read back with plain file system calls.
 *
 * The period actions are the entry's own, so the facts that decide them are the ones *this* surface
 * reports: the model the command's session runs (a pi context that reports none states nothing), the
 * idle fact `ctx.isIdle()` answers, and this instance's own pending save. A surface that reports no
 * idle fact is a pi that states nothing, and the framework answers nothing for it rather than
 * inventing one — which is the state the unknown-activity refusal is about.
 *
 * Each case states its own storage root, and the framework reads an extension's `config.yaml` once
 * per process: the repository root is created once for the file, while the root the runtime resolves
 * its files in is the one fact a case states for itself, exactly as the pi assembly states it for a
 * real deployment. The clock is this suite's own fake one, so every instant below is one the case
 * advanced to, while the file system stays real; the provider balance query is the one outside call
 * and is answered by this file, so the boundary reading is a number this suite chose.
 */
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { type PiAssistantMessage, type PiExtensionApi, type PiExtensionContext, piAdapter } from "../../../../adapters/pi";
import { updateFile } from "../../../../framework/modules/files";
import type { HttpRequestOptions } from "../../../../framework/modules/http";
import { MODEL_COST } from "../../../../extensions/model-cost/definition";
import { MODEL_COST_HARNESS } from "../../../../extensions/model-cost/harnesses/pi";
import { MODEL_COST_WIDGET_KEY, attachModelCostWidget } from "../../../../extensions/model-cost/harnesses/pi/widget";
import type { ConsumptionDocument, SessionRecord } from "../../../../extensions/model-cost/shared-logic/foundation/session/consumption-document"
import type { ModelPricingData } from "../../../../extensions/model-cost/shared-logic/business/pricing/model-data";
import type { DisplayTarget } from "../../../../extensions/model-cost/shared-logic/presentation/display";
import { type ModelCostRuntime, createModelCostRuntime } from "../../../../extensions/model-cost/shared-logic/runtime";
import { uiBoundaryTimerOf } from "../../support/ui-timer";

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * One Beijing wall-clock reading on Wednesday 2026-10-14, as an epoch instant.
 *
 * Every instant this suite asserts is one of these: the fake clock is set to 13:00, which is between
 * the self-made data's two peak windows, so every request below is charged at the off-peak price this
 * file states rather than at a price the season moved.
 */
function atBeijing(hours: number, minutes = 0): number {
	return Date.UTC(2026, 9, 14, hours, minutes) - BEIJING_OFFSET_MS;
}

/** The instants this suite's clock reads: the switch instant, and an instant before it. */
const CLOCK = atBeijing(13, 0);
const EARLIER = atBeijing(12, 30);

/** The provider and exact model the entries of this suite run: the self-made data's monetary pair. */
const PROVIDER = "deepseek";
const MODEL = "deepseek-flash";

/**
 * The self-made pricing data every case drives: one monetary provider, one allowance provider.
 *
 * Off-peak is `input·2 + cacheRead·0.5 + output·8` per million tokens, and the peak multiplier is 3
 * across the two windows below — none of which this suite's instants fall in, so the amounts a case
 * has to know are the off-peak ones.
 */
const DATA: ModelPricingData = {
	currency: "XTS",
	unit: "XTS per million tokens",
	peakMultiplier: 3,
	zoneOffsetMinutes: 8 * 60,
	peakWindows: [
		{ fromMinute: 9 * 60, toMinute: 12 * 60 },
		{ fromMinute: 14 * 60, toMinute: 18 * 60 },
	],
	tiers: { flash: { input: 2, cacheRead: 0.5, output: 8 } },
	allowanceProviders: ["openai-codex"],
	models: {
		[PROVIDER]: { [MODEL]: { mode: "monetary", tier: "flash" } },
		"openai-codex": { "gpt-luna": { mode: "token-only" } },
	},
};

/** The usage one completing request reports, as pi's own finalized message carries it. */
const USAGE = { input: 2_000, cacheRead: 1_000, cacheWrite: 0, output: 500, totalTokens: 3_500 };

/** What that usage costs at the off-peak price: `(2_000·2 + 1_000·0.5 + 500·8) / 1e6`. */
const AMOUNT = 0.0085;

/** The document the extension keeps in its storage root, and its archives' directory. */
const CONSUMPTION_FILE = "consumption.json";
const ARCHIVE_DIRECTORY = "archives";
/** The independent estimate beside it, which a consumption reset never touches. */
const ESTIMATE_FILE = "codex-usage-estimate.json";

/** The repository root this file's bindings resolve their configuration from, once per process. */
const REPOSITORY_ROOT = mkdtempSync(path.join(tmpdir(), "pi-period-reset-repo-"));
mkdirSync(path.join(REPOSITORY_ROOT, "extensions", MODEL_COST.id), { recursive: true });
writeFileSync(
	path.join(REPOSITORY_ROOT, "extensions", MODEL_COST.id, "config.yaml"),
	["storageDir: 'unused-by-this-suite'", "balanceTtlMs: 30000", "codexQuotaTtlMs: 15000", ""].join("\n"),
	"utf8",
);

/** Every storage root a case created, removed after it. */
const roots: string[] = [];

/** The address pi resolves for the provider, and the credential this suite's registry holds for it. */
const DEEPSEEK_BASE_URL = "https://pi-host.example/v1";
const DEEPSEEK_CREDENTIAL = "pi-reset-key";
/** The balance the endpoint answers, in the provider's own currency. */
const BOUNDARY_TOTAL = 7.75;

/**
 * The document every case binds over: the whole shared file of two harnesses, each with its own
 * sessions and providers, so a case can tell whether the archive and the new period kept the file
 * whole across harnesses rather than only this one's part.
 *
 * The period is an ordinary one, its start balance is a value of its own, and the two harnesses'
 * records carry amounts this file states — nothing here is the implementation's own arithmetic.
 */
const TREE: ConsumptionDocument = {
	schemaVersion: 1,
	periodId: "period-before-switch",
	start: "2026-10-01T00:00:00.000Z",
	start_bal: 30.25,
	holiday: false,
	harnesses: {
		[MODEL_COST_HARNESS]: {
			sessions: [
				{
					id: "pi-main",
					name: "pi 主会话",
					parent: null,
					saveVersion: 3,
					own: {
						[PROVIDER]: { [MODEL]: { tokens: { input: 1_000, cacheRead: 500, cacheWrite: 0, output: 200 }, costCny: 0.031 } },
						"openai-codex": {
							"gpt-luna": {
								tokens: { input: 400, cacheRead: 100, cacheWrite: 50, output: 200 },
								referenceCostUsd: 0.02,
							},
						},
					},
				},
				{
					id: "pi-child",
					name: "pi 子代理",
					parent: "pi-main",
					saveVersion: 2,
					own: {
						"openai-codex": {
							"gpt-luna": {
								tokens: { input: 40, cacheRead: 10, cacheWrite: 5, output: 20 },
								referenceCostUsd: 0.004,
							},
						},
					},
					runtimeMs: 360_000,
				},
			],
		},
		omp: {
			sessions: [
				{
					id: "omp-main",
					name: "omp 主会话",
					parent: null,
					saveVersion: 1,
					own: {
						[PROVIDER]: { [MODEL]: { tokens: { input: 500, cacheRead: 0, cacheWrite: 0, output: 100 }, costCny: 0.02 } },
					},
				},
			],
		},
	},
};

/**
 * One archive as a root holds it: the whole activity document the reset closed, the instant that
 * period ended at, and the DeepSeek balance that instant's own reading produced when it produced one.
 */
interface ArchiveDocument extends ConsumptionDocument {
	readonly end: string;
	readonly end_bal?: number;
}

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

/**
 * One pi session as the native surface reports it.
 *
 * The absent members are the facts this surface does not report at all, which is what makes a case
 * about a surface that answers nothing a case about absence: `idle` is pi's idle fact behind
 * `canAcceptInput()`, and `model` is the model the command's entry runs.
 */
interface PiSession {
	readonly sessionId: string;
	readonly name?: string;
	readonly model?: { readonly id?: string; readonly provider?: string };
	readonly idle?: boolean;
	readonly pending?: boolean;
	readonly hasUI?: boolean;
	readonly catalog?: readonly PiNativeModel[];
	readonly credentials?: Readonly<Record<string, string | undefined>>;
}

/** One catalog row as pi's own registry holds it. */
interface PiNativeModel {
	readonly id: string;
	readonly provider: string;
	readonly baseUrl?: string;
	readonly cost?: Readonly<Record<string, number>>;
}

/** One widget rendering the frontend published, for whatever key it published under. */
interface DrawnFrame {
	readonly key: string;
	readonly lines: readonly string[] | undefined;
}

/** The pi native surface the assembly is bound to, with everything a case delivers and reads. */
interface PiSurface {
	readonly api: PiExtensionApi;
	/** The widget renderings the frontend handed the host, in call order. */
	readonly widgets: DrawnFrame[];
	/** The notices the extension published through the host's own channel, in call order. */
	readonly notices: Array<{ readonly level: string; readonly message: string }>;
	/** A session starting, with the reason pi states. */
	sessionStarts(session: PiSession, reason: "startup" | "reload" | "new" | "resume" | "fork"): void;
	/** One submission pi admitted, as the user's own. */
	submits(session: PiSession): void;
	/** pi's agent loop beginning. */
	runStarts(session: PiSession): void;
	/** pi's low-level run end, one level below settlement. */
	runEnds(session: PiSession): void;
	/** pi's run fully settled, with nothing left to continue it. */
	runSettles(session: PiSession): void;
	/** A request about to be issued. */
	requestStarts(session: PiSession): void;
	/** One finalized assistant message. */
	messageEnds(session: PiSession, message: PiAssistantMessage): void;
	/**
	 * One run initiation, as pi publishes it, awaited: the framework waits for the one-time
	 * initialization on this hook, so awaiting it is what makes the document loaded (and the
	 * startup prefetch settled) before a case drives an exchange.
	 */
	agentStarts(session: PiSession): Promise<void>;
	/**
	 * The harness's next task, where the framework re-checks a Round's end candidate: pi's `nextTask`
	 * arranges a zero-delay task, so a case takes one turn of {@link harnessTask} to reach it.
	 */
	nextTask(): Promise<void>;
	/** One `/budget` invocation through pi's own command path. */
	command(args: string, session: PiSession): Promise<void>;
	/** The lines the frontend drew last, or nothing while it cleared its widget. */
	lastLines(): readonly string[] | undefined;
}

/** The session an entry runs in: pi's own main session on the monetary pair this suite prices. */
const MAIN: PiSession = {
	sessionId: "pi-main",
	name: "pi 主会话",
	model: { id: MODEL, provider: PROVIDER },
	idle: true,
	pending: false,
	catalog: [{ id: MODEL, provider: PROVIDER, baseUrl: DEEPSEEK_BASE_URL }],
	credentials: { [PROVIDER]: DEEPSEEK_CREDENTIAL },
};

/** A second session over the same root: the child whose unsaved work is not the entry's to close. */
const CHILD: PiSession = { ...MAIN, sessionId: "pi-child", name: "pi 子代理", idle: true };

/**
 * One controlled pi native surface: the members the adapter registers on, and the host's own
 * answers.
 *
 * The registry is published exactly as pi's own context carries it, so what the framework resolves
 * for the balance query is this surface's own address and credential rather than a fixture's.
 */
function controlledSurface(): PiSurface {
	const handlers = new Map<string, Array<(event: unknown, ctx: PiExtensionContext) => unknown>>();
	const commands = new Map<string, { readonly handler: (args: string, ctx: PiExtensionContext) => Promise<void> }>();
	const widgets: DrawnFrame[] = [];
	const notices: Array<{ readonly level: string; readonly message: string }> = [];

	const contextOf = (session: PiSession): PiExtensionContext => {
		const context: Record<string, unknown> = {
			sessionManager: {
				getSessionId: () => session.sessionId,
				getSessionName: () => session.name,
				getBranch: () => [],
			},
			hasUI: session.hasUI ?? true,
			ui: {
				notify: (message: string, level?: string) => void notices.push({ level: level ?? "info", message }),
				setWidget: (key: string, content: readonly string[] | undefined) =>
					void widgets.push({ key, lines: content === undefined ? undefined : [...content] }),
			},
		};
		// The three facts this surface states only when a case states them: a context without them is a
		// host that reports no such fact at all, rather than one that answered false.
		if (session.idle !== undefined) context.isIdle = () => session.idle === true;
		if (session.pending !== undefined) context.hasPendingMessages = () => session.pending === true;
		if (session.model !== undefined) context.model = session.model;
		if (session.catalog !== undefined || session.credentials !== undefined) {
			context.modelRegistry = {
				getAll: () => session.catalog ?? [],
				getApiKeyForProvider: async (provider: string) => session.credentials?.[provider],
				getProvider: (provider: string) => {
					const baseUrl = (session.catalog ?? []).find(row => row.provider === provider)?.baseUrl;
					return baseUrl === undefined ? undefined : { baseUrl };
				},
			};
		}
		return context as unknown as PiExtensionContext;
	};

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

	return {
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
		nextTask: () => harnessTask(),
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
}

/** One bound entry: the surface driving it, the runtime behind it and the root it writes. */
interface Bound {
	readonly surface: PiSurface;
	readonly runtime: ModelCostRuntime;
	readonly root: string;
	readonly consumptionFile: string;
	/** Every request this entry's HTTP module was asked for, in order. */
	readonly queries: Query[];
}

/**
 * The extension assembled on pi over one storage root, as the production assembly composes it.
 *
 * The production assembly is `modelCostPiHarness(repositoryRoot)`, and the framework resolves the
 * extension's `config.yaml` through it — but the framework reads one extension's configuration once
 * per process, so a suite that binds model-cost in more than one case composes the same parts itself:
 * the framework's real pi adapter, the extension's real definition, the real runtime built from the
 * framework's validated configuration and the real frontend, with the frontend's release composed
 * into the framework's own cleanup exactly as the shipped assembly composes it. The one fact stated
 * here that the shipped file states for a real run is the storage root a case writes in.
 *
 * The provider balance query is the one call that leaves the process, and it is answered here: the
 * address and credential are still the surface's own registry readings, so what a case observes is
 * the query the pi path really issues.
 */
function assemble(
	options: {
		/** The root to bind over; omitted means a fresh one, removed after the case. */
		readonly root?: string;
		/** The document to seed before the binding reads it; omitted means the root holds none yet. */
		readonly document?: ConsumptionDocument;
		/** What the balance endpoint answers, by attempt; omitted means {@link BOUNDARY_TOTAL}. */
		readonly answer?: (attempt: number) => Promise<Response> | Response;
		readonly onQuery?: (query: Query, attempt: number) => void;
	} = {},
): Bound {
	const root = options.root ?? mkdtempSync(path.join(tmpdir(), "pi-period-reset-"));
	if (options.root === undefined) roots.push(root);
	const consumptionFile = path.join(root, CONSUMPTION_FILE);
	if (options.document !== undefined) writeFileSync(consumptionFile, JSON.stringify(options.document), "utf8");

	const surface = controlledSurface();
	const queries: Query[] = [];
	let runtime: ModelCostRuntime | undefined;
	let releaseFrontend: (() => void) | undefined;
	const bind = piAdapter(MODEL_COST, {
		configBaseDir: REPOSITORY_ROOT,
		factory: context => {
			const built = createModelCostRuntime({
				config: { ...context.config, storageDir: root },
				configDirectory: path.join(REPOSITORY_ROOT, "extensions", MODEL_COST.id),
				userHomeDirectory: root,
				harness: MODEL_COST_HARNESS,
				// The one harness fact this hand-built assembly states for itself: the case below drives
				// the entry's display preference, which the extension offers to an entry whose subagent
				// observations integrated — the shipped assembly records that answer from the framework's
				// own initialization delivery (see `harnesses/pi.ts`).
				subagentIntegrationMode: () => "subagents",
				data: DATA,
				...(context.modelPrices === undefined ? {} : { modelPrices: context.modelPrices }),
				...(context.providerAccess === undefined ? {} : { providerAccess: context.providerAccess }),
				httpRequest: async (url: string, httpOptions?: HttpRequestOptions) => {
					const query: Query = { url, options: httpOptions };
					queries.push(query);
					options.onQuery?.(query, queries.length);
					const answer = options.answer ?? (() => balanceAnswer(BOUNDARY_TOTAL.toFixed(2)));
					return answer(queries.length);
				},
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
	if (bound.bound && runtime !== undefined) releaseFrontend = attachModelCostWidget(surface.api, runtime, uiBoundaryTimerOf(runtime));
	return { surface, runtime: runtime as ModelCostRuntime, root, consumptionFile, queries };
}

/** The archive files one root holds, by name. */
function archiveNames(root: string): string[] {
	const directory = path.join(root, ARCHIVE_DIRECTORY);
	return existsSync(directory) ? readdirSync(directory).sort() : [];
}

/** Every archive one root holds, by name, parsed as the plain JSON documents they are. */
function archivesOf(root: string): Array<{ readonly name: string; readonly document: ArchiveDocument }> {
	return archiveNames(root).map(name => ({
		name,
		document: JSON.parse(readFileSync(path.join(root, ARCHIVE_DIRECTORY, name), "utf8")) as ArchiveDocument,
	}));
}

/** The one archive a root holds, parsed as the plain JSON document it is. */
function singleArchive(root: string): ArchiveDocument {
	const archives = archivesOf(root);
	expect(archives).toHaveLength(1);
	return archives[0]?.document as ArchiveDocument;
}

/** The activity document of a root, as the extension wrote it and as a reader parses it. */
function active(root: string): ConsumptionDocument {
	return JSON.parse(readFileSync(path.join(root, CONSUMPTION_FILE), "utf8")) as ConsumptionDocument;
}

/** One session's record in a parsed document, by identity, wherever its bucket is. */
function recordOf(document: ConsumptionDocument, id: string): SessionRecord | undefined {
	return Object.values(document.harnesses)
		.flatMap(bucket => bucket.sessions)
		.find(record => record.id === id);
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
 * One turn of the harness's own next task, and the file system behind it.
 *
 * pi's `nextTask` — where the framework arranges the Round's end re-check — is a zero-delay timer, and
 * this suite's clock is faked along with the timer queue, so the re-check runs only when the clock is
 * advanced. The step is the interval the framework's own file coordination polls at (`files.ts`: 25 ms
 * between attempts at a lock and between turns of a document's queue), which is what a save waits on;
 * the immediate turn after it is real, and is what lets the bytes a save writes actually land.
 */
async function harnessTask(): Promise<void> {
	vi.advanceTimersByTime(25);
	const { promise, resolve } = Promise.withResolvers<void>();
	setImmediate(resolve);
	await promise;
}

/**
 * Waits until the document holds what a case expects of it, and answers with the document.
 *
 * A Round's end is dispatched the way the framework dispatches a semantic handler — without waiting
 * for the promise it returns — so the save it drives lands a few event-loop turns later. The wait is
 * on the expected content rather than on a duration.
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
	throw new Error(`no consumption document the case expects was published at ${file}; it holds ${JSON.stringify(readDocument(file))}`);
}

/**
 * Takes harness turns until a pending command has concluded, and answers when it has.
 *
 * A command that reaches the file coordination waits on the framework's own polling, which this
 * suite's faked timers run only when the clock is advanced; the wait is on the command's own
 * completion rather than on a duration.
 */
async function settledCommand(running: Promise<void>): Promise<void> {
	let settled = false;
	void running.then(
		() => void (settled = true),
		() => void (settled = true),
	);
	for (let turn = 0; turn < 200 && !settled; turn += 1) await harnessTask();
	await running;
}

/**
 * Holds one root's activity document, so everything submitted after this call waits behind the
 * returned gate.
 *
 * It models the one thing a switch must not race — a writer still publishing that document — and it
 * is deterministic on both sides: the framework's coordination keeps call order, so a command driven
 * after this call cannot reach the file until the gate is released.
 */
function holdDocument(target: string): { readonly release: () => void; readonly held: Promise<unknown> } {
	const gate = Promise.withResolvers<void>();
	const held = updateFile(target, async current => {
		await gate.promise;
		return current;
	});
	return { release: () => gate.resolve(), held };
}

/** One assistant response as pi hands its finalized message over: the usage and the outcome it states. */
function assistantMessage(overrides: Partial<PiAssistantMessage> = {}): PiAssistantMessage {
	return { role: "assistant", stopReason: "stop", responseId: "resp-pi-reset", usage: { ...USAGE }, ...overrides };
}

/** The target the entry's own display is read for: the session the command runs in, on its own pair. */
const MAIN_TARGET: DisplayTarget = { sessionId: "pi-main", provider: PROVIDER, model: MODEL };

/**
 * One exchange of a session's own Round: the submission, the request, the response that settles it,
 * and the Round's own end — confirmed on the harness's next task, the way the framework confirms it.
 */
async function exchange(surface: PiSurface, session: PiSession, responseId: string): Promise<void> {
	surface.submits(session);
	surface.runStarts(session);
	surface.requestStarts(session);
	surface.messageEnds(session, assistantMessage({ responseId }));
	surface.runSettles(session);
	await surface.nextTask();
}

beforeEach(() => {
	// This suite's clock: every instant a case asserts is the instant its own advance put the clock at.
	vi.useFakeTimers({ now: CLOCK });
});

afterEach(() => {
	vi.useRealTimers();
	while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true });
});

afterAll(() => {
	rmSync(REPOSITORY_ROOT, { recursive: true, force: true });
});

describe("a switch from a pi entry archives the whole file it closes and opens the next period (P35, P36)", () => {
	test("clear archives both harnesses' saved activity and publishes one ordinary period that starts from the boundary reading", async () => {
		const bound = assemble({ document: TREE });
		bound.surface.sessionStarts(MAIN, "startup");
		await bound.surface.agentStarts(MAIN);

		await bound.surface.command("clear", MAIN);

		// What the operator read: one notice, at the severity of an effect that happened, naming the
		// archive the period was closed into.
		expect(bound.surface.notices).toHaveLength(1);
		expect(bound.surface.notices[0]?.level).toBe("info");
		expect(bound.surface.notices[0]?.message).toContain(ARCHIVE_DIRECTORY);
		expect(bound.surface.notices[0]?.message).toContain("holiday=false");

		// The archive is the whole saved activity document, both harnesses and every session of them,
		// plus the two facts only the closing moment can state: the instant it ended at, and the
		// balance this switch's own reading obtained.
		expect(singleArchive(bound.root)).toEqual({
			...TREE,
			end: new Date(CLOCK).toISOString(),
			end_bal: BOUNDARY_TOTAL,
		});

		// The new period is one commit: a new generation, the same instant as the archive's own end,
		// this switch's reading as its start balance, the holiday fact `clear` opens with, and no
		// record of either harness carried over.
		const document = active(bound.root);
		expect(document.periodId).not.toBe(TREE.periodId);
		expect(document).toEqual({
			schemaVersion: 1,
			periodId: document.periodId,
			start: new Date(CLOCK).toISOString(),
			start_bal: BOUNDARY_TOTAL,
			holiday: false,
			harnesses: {},
		});

		// The boundary read is the second request: the initialization's own prefetch came first, and
		// the switch made exactly one attempt of its own, outside any file coordination.
		expect(bound.queries.map(query => query.url)).toEqual([
			`${DEEPSEEK_BASE_URL.replace(/\/v1$/, "")}/user/balance`,
			`${DEEPSEEK_BASE_URL.replace(/\/v1$/, "")}/user/balance`,
		]);
		expect(bound.queries[1]?.options).toEqual({
			method: "GET",
			headers: { authorization: `Bearer ${DEEPSEEK_CREDENTIAL}` },
			timeoutMs: 5000,
			proxy: false,
		});
	});
});

describe("clear and the first holiday open their own period marker, and an open holiday is not reset twice (P36)", () => {
	test("the first holiday publishes a holiday period directly, in the one commit its archive precedes", async () => {
		const bound = assemble({ document: TREE });
		bound.surface.sessionStarts(MAIN, "startup");
		await bound.surface.agentStarts(MAIN);

		await bound.surface.command("holiday", MAIN);

		expect(bound.surface.notices).toHaveLength(1);
		expect(bound.surface.notices[0]?.level).toBe("info");
		expect(bound.surface.notices[0]?.message).toContain("holiday=true");
		// The period the file held was an ordinary one, and the archive is exactly that period: the
		// holiday marker is on the period this switch opened, never written onto the one it closed.
		expect(singleArchive(bound.root)).toEqual({
			...TREE,
			end: new Date(CLOCK).toISOString(),
			end_bal: BOUNDARY_TOTAL,
		});
		// One commit published the new period, and the marker it carries is the action's own: there is
		// no document in between that held this period with the other marker.
		expect(active(bound.root)).toEqual({
			schemaVersion: 1,
			periodId: active(bound.root).periodId,
			start: new Date(CLOCK).toISOString(),
			start_bal: BOUNDARY_TOTAL,
			holiday: true,
			harnesses: {},
		});
		expect(archiveNames(bound.root)).toHaveLength(1);
	});

	test("a holiday asked of a period that already is one is answered without switching, archiving or querying", async () => {
		const holidayPeriod: ConsumptionDocument = { ...TREE, periodId: "period-holiday", holiday: true };
		const bound = assemble({ document: holidayPeriod });
		bound.surface.sessionStarts(MAIN, "startup");
		await bound.surface.agentStarts(MAIN);

		await bound.surface.command("holiday", MAIN);

		expect(bound.surface.notices).toHaveLength(1);
		expect(bound.surface.notices[0]?.level).toBe("info");
		// The file is the same file: the same period, the same records, and no second archive — and no
		// balance was read for a period that is not ending, so the startup prefetch is the only request.
		expect(active(bound.root)).toEqual(holidayPeriod);
		expect(archiveNames(bound.root)).toEqual([]);
		expect(bound.queries).toHaveLength(1);
	});
});

describe("the file the two harnesses share is closed as a whole, and the period after it carries none of it (P35)", () => {
	test("a saved period of confirmed zero consumption is closed and archived as it is", async () => {
		// A period whose one session really consumed nothing: a confirmed zero is a reading, so this is
		// a period with activity to close rather than an empty root.
		const zeroPeriod: ConsumptionDocument = {
			schemaVersion: 1,
			periodId: "period-confirmed-zero",
			start: "2026-10-01T00:00:00.000Z",
			holiday: false,
			harnesses: {
				[MODEL_COST_HARNESS]: {
					sessions: [
						{
							id: "pi-zero",
							name: "零消费会话",
							parent: null,
							saveVersion: 1,
							own: {
								[PROVIDER]: {
									[MODEL]: { tokens: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 }, costCny: 0 },
								},
							},
						},
					],
				},
			},
		};
		const bound = assemble({ document: zeroPeriod });
		bound.surface.sessionStarts(MAIN, "startup");
		await bound.surface.agentStarts(MAIN);

		await bound.surface.command("clear", MAIN);

		expect(bound.surface.notices[0]?.level).toBe("info");
		expect(singleArchive(bound.root)).toEqual({
			...zeroPeriod,
			end: new Date(CLOCK).toISOString(),
			end_bal: BOUNDARY_TOTAL,
		});
		expect(active(bound.root)).toEqual({
			schemaVersion: 1,
			periodId: active(bound.root).periodId,
			start: new Date(CLOCK).toISOString(),
			start_bal: BOUNDARY_TOTAL,
			holiday: false,
			harnesses: {},
		});
	});

	test("a record another writer committed into the file is inside the archive and not in the new period", async () => {
		const root = mkdtempSync(path.join(tmpdir(), "pi-period-reset-shared-"));
		roots.push(root);
		const consumptionFile = path.join(root, CONSUMPTION_FILE);
		writeFileSync(consumptionFile, JSON.stringify(TREE), "utf8");

		// The entry of this case binds over the file as it stands now, and holds that document as its
		// own baseline.
		const entry = assemble({ root });
		entry.surface.sessionStarts(MAIN, "startup");
		await entry.surface.agentStarts(MAIN);
		expect(entry.runtime.view.own("pi-main")?.deepseek?.["deepseek-flash"]?.costCny).toBe(0.031);

		// A second writer over the same root — what a second pi process sharing this storage root is —
		// runs one exchange of the same session and commits the next version of its snapshot. The
		// amount is this file's own arithmetic: the stored 0.031 plus the off-peak 0.0085.
		const writer = assemble({ root });
		writer.surface.sessionStarts(MAIN, "startup");
		await writer.surface.agentStarts(MAIN);
		await exchange(writer.surface, MAIN, "resp-pi-writer");
		const committed = await savedDocument(consumptionFile, document => recordOf(document, "pi-main")?.saveVersion === 4);
		expect(recordOf(committed, "pi-main")?.own.deepseek?.["deepseek-flash"]?.costCny).toBe(0.0395);

		await entry.surface.command("clear", MAIN);

		// The archive holds the file's own document at the moment it was replaced — the writer's
		// committed version included — rather than the baseline this entry happened to hold.
		const closed = singleArchive(root);
		expect(recordOf(closed, "pi-main")?.saveVersion).toBe(4);
		expect(recordOf(closed, "pi-main")?.own.deepseek?.["deepseek-flash"]?.costCny).toBe(0.0395);
		expect(recordOf(closed, "omp-main")).toEqual(TREE.harnesses.omp?.sessions[0]);
		expect(Object.keys(closed.harnesses).sort()).toEqual(["omp", "pi"]);
		// The new period carries no record of either harness, and the entry answers nothing for the
		// period it closed.
		expect(active(root).harnesses).toEqual({});
		expect(entry.runtime.view.own("pi-main")).toBeUndefined();
	});

	test("a publication still on its way is waited for, and the document it publishes is what the archive holds", async () => {
		const bound = assemble({ document: TREE });
		bound.surface.sessionStarts(MAIN, "startup");
		await bound.surface.agentStarts(MAIN);

		// A writer whose publication has not landed yet: the document is held inside the framework's own
		// coordination, and what it will publish is a record this suite adds by hand.
		const gate = Promise.withResolvers<void>();
		const late: SessionRecord = {
			id: "omp-late",
			name: "迟到的会话",
			parent: null,
			saveVersion: 1,
			own: { [PROVIDER]: { [MODEL]: { tokens: { input: 7, cacheRead: 0, cacheWrite: 0, output: 3 }, costCny: 0.00004 } } },
		};
		const held = updateFile(bound.consumptionFile, async current => {
			await gate.promise;
			const document = current as ConsumptionDocument;
			return {
				...document,
				harnesses: { ...document.harnesses, omp: { sessions: [...(document.harnesses.omp?.sessions ?? []), late] } },
			};
		});

		const running = bound.surface.command("clear", MAIN);
		// The command is now past its boundary read and waiting on the document. Its own read is out
		// while the file is held, and nothing about the switch has been said or written yet.
		for (let turn = 0; turn < 12; turn += 1) await Promise.resolve();
		expect(bound.queries).toHaveLength(2);
		expect(bound.surface.notices).toEqual([]);
		expect(archiveNames(bound.root)).toEqual([]);
		expect(active(bound.root).periodId).toBe(TREE.periodId);

		gate.resolve();
		await held;
		await settledCommand(running);

		// What the archive holds is the document the writer really published, and the period it closed
		// ended at the instant this switch's own clock read.
		expect(recordOf(singleArchive(bound.root), "omp-late")).toEqual(late);
		expect(singleArchive(bound.root).end).toBe(new Date(CLOCK).toISOString());
		expect(bound.surface.notices).toHaveLength(1);
		expect(bound.surface.notices[0]?.level).toBe("info");
		expect(active(bound.root).harnesses).toEqual({});
	});

	test("the closed period's unsaved work is dropped rather than carried, and no session is forced to save for the switch", async () => {
		const bound = assemble({ document: TREE });
		bound.surface.sessionStarts(MAIN, "startup");
		await bound.surface.agentStarts(MAIN);
		// One settled request of another session this instance is accumulating for: the child's own
		// Turn, accounted here and not yet saved — its Round has not ended, so nothing has been written
		// and no save is pending.
		bound.surface.submits(CHILD);
		bound.surface.runStarts(CHILD);
		bound.surface.requestStarts(CHILD);
		bound.surface.messageEnds(CHILD, assistantMessage({ responseId: "resp-pi-child" }));
		expect(bound.runtime.view.own(CHILD.sessionId)?.[PROVIDER]?.[MODEL]?.costCny).toBe(AMOUNT);

		await bound.surface.command("clear", MAIN);

		// The archive is only what the file held: the child's unsaved Turn was not collected, and no
		// session was forced to save so the switch could happen.
		expect(singleArchive(bound.root)).toEqual({ ...TREE, end: new Date(CLOCK).toISOString(), end_bal: BOUNDARY_TOTAL });
		// What this instance accumulated for the closed period is not the new period's: the Round that
		// was open across the switch writes nothing at all when it ends, and the entry answers nothing
		// for either session.
		bound.surface.runSettles(CHILD);
		await bound.surface.nextTask();
		await harnessTask();
		expect(active(bound.root).harnesses).toEqual({});
		expect(bound.runtime.view.own(CHILD.sessionId)).toBeUndefined();

		// The next Round's own exchange is what the new period holds, from the session's own first
		// version: nothing of the closed period came back from the archive.
		await exchange(bound.surface, CHILD, "resp-pi-child-2");
		const after = await savedDocument(bound.consumptionFile, document => recordOf(document, CHILD.sessionId) !== undefined);
		expect(recordOf(after, CHILD.sessionId)?.saveVersion).toBe(1);
		expect(recordOf(after, CHILD.sessionId)?.own).toEqual({
			[PROVIDER]: {
				[MODEL]: {
					tokens: { input: USAGE.input, cacheRead: USAGE.cacheRead, cacheWrite: USAGE.cacheWrite, output: USAGE.output },
					costCny: AMOUNT,
				},
			},
		});
		expect(recordOf(after, "pi-main")).toBeUndefined();
		expect(recordOf(after, "omp-main")).toBeUndefined();
	});
});

describe("a failed archive or a failed publication is reported as the stage it reached (P35)", () => {
	test("an archive that could not be written leaves the activity alone and reports one error", async () => {
		const bound = assemble({ document: TREE });
		// A file where the archive directory belongs: no archive can be created there.
		writeFileSync(path.join(bound.root, ARCHIVE_DIRECTORY), "not a directory", "utf8");
		bound.surface.sessionStarts(MAIN, "startup");
		await bound.surface.agentStarts(MAIN);
		const before = readFileSync(bound.consumptionFile, "utf8");

		await bound.surface.command("clear", MAIN);

		expect(bound.surface.notices).toHaveLength(1);
		expect(bound.surface.notices[0]?.level).toBe("error");
		expect(bound.surface.notices[0]?.message).toContain("/budget clear failed: ");
		expect(bound.surface.notices[0]?.message).toContain("归档未生成");
		// Nothing was reset, so no success was reported and the file is exactly as it was.
		expect(readFileSync(bound.consumptionFile, "utf8")).toBe(before);
	});

	test("an archive that landed while the new activity did not keeps its stage, and no success is reported", async () => {
		// This case waits out the framework's own publication budget: the platform's refusal to replace
		// the name is stepped over with real waits, so its clock is the process's own rather than this
		// suite's fake one.
		vi.useRealTimers();
		const bound = assemble({ document: TREE });
		bound.surface.sessionStarts(MAIN, "startup");
		await bound.surface.agentStarts(MAIN);
		// The archive directory is ready and writable; what is refused is the activity document's own
		// publication — on this platform either the target is a file that cannot be replaced, or the
		// directory it would be replaced in no longer accepts a new file.
		mkdirSync(path.join(bound.root, ARCHIVE_DIRECTORY), { recursive: true });
		if (process.platform === "win32") chmodSync(bound.consumptionFile, 0o444);
		else chmodSync(bound.root, 0o555);
		const before = readFileSync(bound.consumptionFile, "utf8");

		await bound.surface.command("holiday", MAIN);

		expect(bound.surface.notices).toHaveLength(1);
		expect(bound.surface.notices[0]?.level).toBe("error");
		const message = bound.surface.notices[0]?.message ?? "";
		expect(message).toContain("/budget holiday failed: ");
		expect(message).toContain("归档已生成");
		expect(message).toContain("未提交");
		// The archive of the period this attempt closed is kept, and the activity file is untouched.
		expect(singleArchive(bound.root).periodId).toBe(TREE.periodId);
		expect(readFileSync(bound.consumptionFile, "utf8")).toBe(before);

		// Restore what this case changed, so its own root can be removed afterwards.
		if (process.platform === "win32") chmodSync(bound.consumptionFile, 0o666);
		else chmodSync(bound.root, 0o755);
	});

	test("a boundary read that failed leaves both balance fields out, keeps the reading it held, and still closes the period", async () => {
		// The earlier archive and the independent estimate this switch must not touch, both written
		// before it runs.
		const bound = assemble({
			document: TREE,
			answer: attempt => (attempt === 1 ? balanceAnswer("12.50") : (() => { throw new Error("the provider is unreachable"); })()),
		});
		mkdirSync(path.join(bound.root, ARCHIVE_DIRECTORY), { recursive: true });
		const earlierName = "aaaaaaaa-0000-4000-8000-000000000000.json";
		const earlier = path.join(bound.root, ARCHIVE_DIRECTORY, earlierName);
		const earlierBytes = JSON.stringify({ schemaVersion: 1, an: "earlier archive" });
		writeFileSync(earlier, earlierBytes, "utf8");
		const estimate = path.join(bound.root, ESTIMATE_FILE);
		const estimateBytes = JSON.stringify({ baseline: "kept", ratio: 3.5 });
		writeFileSync(estimate, estimateBytes, "utf8");
		bound.surface.sessionStarts(MAIN, "startup");
		await bound.surface.agentStarts(MAIN);

		await bound.surface.command("clear", MAIN);

		expect(bound.surface.notices[0]?.level).toBe("info");
		// One attempt, no retry, and neither side carries a balance: the reading the entry already held
		// is not put in the document's place, and no zero is invented for one that failed.
		expect(bound.queries).toHaveLength(2);
		const switched = archivesOf(bound.root).find(archive => archive.name !== earlierName)?.document;
		expect(switched).toBeDefined();
		expect(switched !== undefined && "end_bal" in switched).toBe(false);
		expect(switched?.periodId).toBe(TREE.periodId);
		const document = active(bound.root);
		expect("start_bal" in document).toBe(false);
		expect(document.holiday).toBe(false);
		expect(document.harnesses).toEqual({});
		// The reading this process obtained at its own prefetch is still the one it holds, and it was
		// not written into the period.
		expect(bound.runtime.presentation.balance().reading?.total).toBe(12.5);
		// The earlier archive and the independent estimate are exactly the documents they were.
		expect(readFileSync(earlier, "utf8")).toBe(earlierBytes);
		expect(readFileSync(estimate, "utf8")).toBe(estimateBytes);
		expect(archiveNames(bound.root)).toHaveLength(2);
	});
});

describe("a period action is refused at once from the entry's own facts, and nothing is queued behind it (P37)", () => {
	test("an entry running another provider — and one whose model pi reports nothing for — is warned and nothing is written", async () => {
		const bound = assemble({ document: TREE });
		bound.surface.sessionStarts(MAIN, "startup");
		await bound.surface.agentStarts(MAIN);
		const before = readFileSync(bound.consumptionFile, "utf8");
		// A pi context that reports no current model states nothing, which is not the DeepSeek entry the
		// action applies to either.
		const noModel: PiSession = {
			sessionId: MAIN.sessionId,
			name: MAIN.name,
			idle: true,
			catalog: MAIN.catalog,
			credentials: MAIN.credentials,
		};

		await bound.surface.command("holiday", { ...MAIN, model: { id: "gpt-luna", provider: "openai-codex" } });
		await bound.surface.command("clear", noModel);

		expect(bound.surface.notices).toHaveLength(2);
		expect(bound.surface.notices[0]?.level).toBe("warning");
		expect(bound.surface.notices[0]?.message).toContain("DeepSeek");
		expect(bound.surface.notices[0]?.message).toContain("openai-codex");
		expect(bound.surface.notices[1]?.level).toBe("warning");
		expect(bound.surface.notices[1]?.message).toContain("无法取得");
		// Nothing but the provider gate ran: no balance read beyond the startup prefetch, no archive, and
		// the file is exactly as it was.
		expect(readFileSync(bound.consumptionFile, "utf8")).toBe(before);
		expect(archiveNames(bound.root)).toEqual([]);
		expect(bound.queries).toHaveLength(1);
	});

	test("a working entry is warned, and the later end of its Round does not run the refused action", async () => {
		const bound = assemble({ document: TREE });
		bound.surface.sessionStarts(MAIN, "startup");
		await bound.surface.agentStarts(MAIN);
		const before = readFileSync(bound.consumptionFile, "utf8");

		// The session is working: pi's own idle fact says so, so this command is the operator's mistake
		// rather than a state to wait out.
		const working: PiSession = { ...MAIN, idle: false };
		await bound.surface.command("clear", working);

		expect(bound.surface.notices).toHaveLength(1);
		expect(bound.surface.notices[0]?.level).toBe("warning");
		expect(bound.surface.notices[0]?.message).toContain("仍在工作");
		expect(archiveNames(bound.root)).toEqual([]);

		// The session really goes on to settle and end its Round, and the period is still the one it was:
		// the refusal is not a state that a later fact resumes.
		bound.surface.runSettles(working);
		await bound.surface.nextTask();
		await harnessTask();
		expect(readFileSync(bound.consumptionFile, "utf8")).toBe(before);
		expect(archiveNames(bound.root)).toEqual([]);
		expect(bound.surface.notices).toHaveLength(1);
	});

	test("an entry whose surface reports no idle fact is refused as an error, once, and nothing is guessed", async () => {
		const bound = assemble({ document: TREE });
		bound.surface.sessionStarts(MAIN, "startup");
		await bound.surface.agentStarts(MAIN);
		const before = readFileSync(bound.consumptionFile, "utf8");
		// This pi surface reports no idle fact at all: the framework answers nothing for it rather than
		// inventing one, and an unreported state is not idleness.
		const unreported: PiSession = {
			sessionId: MAIN.sessionId,
			name: MAIN.name,
			model: { id: MODEL, provider: PROVIDER },
			catalog: MAIN.catalog,
			credentials: MAIN.credentials,
		};

		await bound.surface.command("holiday", unreported);
		await bound.surface.command("clear", unreported);

		expect(bound.surface.notices).toHaveLength(2);
		expect(bound.surface.notices[0]?.level).toBe("error");
		expect(bound.surface.notices[0]?.message).toContain("无法可靠判断当前入口的活动状态");
		expect(bound.surface.notices[1]?.level).toBe("error");
		expect(readFileSync(bound.consumptionFile, "utf8")).toBe(before);
		expect(archiveNames(bound.root)).toEqual([]);
		// The query is the startup prefetch alone: no balance was read for a switch that never began.
		expect(bound.queries).toHaveLength(1);
	});

	test("a save this entry started and has not seen land refuses the switch, and the switch is not queued behind it", async () => {
		const bound = assemble({ document: TREE });
		bound.surface.sessionStarts(MAIN, "startup");
		await bound.surface.agentStarts(MAIN);
		// The document is held, so the save the entry's own Round end starts is on its way and has not
		// landed when the operator's command arrives.
		const hold = holdDocument(bound.consumptionFile);
		bound.surface.submits(MAIN);
		bound.surface.runStarts(MAIN);
		bound.surface.requestStarts(MAIN);
		bound.surface.messageEnds(MAIN, assistantMessage({ responseId: "resp-pi-pending" }));
		bound.surface.runSettles(MAIN);
		await bound.surface.nextTask();

		await bound.surface.command("clear", MAIN);

		expect(bound.surface.notices).toHaveLength(1);
		expect(bound.surface.notices[0]?.level).toBe("warning");
		expect(bound.surface.notices[0]?.message).toContain("保存尚未收口");
		expect(archiveNames(bound.root)).toEqual([]);
		expect(bound.queries).toHaveLength(1);

		// Releasing the document lets the very save that was in flight land — the next version of the
		// session's own snapshot — and no new period replaced it.
		hold.release();
		await hold.held;
		const saved = await savedDocument(bound.consumptionFile, document => recordOf(document, MAIN.sessionId)?.saveVersion === 4);
		expect(recordOf(saved, MAIN.sessionId)?.own[PROVIDER]?.[MODEL]?.costCny).toBe(0.0395);
		expect(active(bound.root).periodId).toBe(TREE.periodId);
		expect(archiveNames(bound.root)).toEqual([]);
		expect(bound.surface.notices).toHaveLength(1);
	});

	test("the entry's own display preference is the entry's, not the switch's", async () => {
		const bound = assemble({ document: TREE });
		bound.surface.sessionStarts(MAIN, "startup");
		await bound.surface.agentStarts(MAIN);
		// The operator has put input into this session, which is the host's own report of the session's
		// identity: that identity is what the display resolves the session by, and the period's records
		// are not the only place an identity can come from.
		bound.surface.submits(MAIN);
		await bound.surface.command("detail", MAIN);
		expect(bound.runtime.presentation.of(MAIN_TARGET).form).toBe("detail");

		// A refused action leaves the form the entry is in exactly as it was ...
		await bound.surface.command("clear", { ...MAIN, idle: false });
		expect(bound.runtime.presentation.of(MAIN_TARGET).form).toBe("detail");

		// ... and so does one that really happened: the switch is not a display action.
		await bound.surface.command("clear", MAIN);
		expect(bound.surface.notices[bound.surface.notices.length - 1]?.level).toBe("info");
		expect(bound.runtime.presentation.of(MAIN_TARGET).form).toBe("detail");
		expect(archiveNames(bound.root)).toHaveLength(1);
	});
});
