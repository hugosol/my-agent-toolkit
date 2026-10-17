/**
 * The assembled model-cost entry's preparation and disposal (S1, S2, S3; contract P48, P49, and the
 * P48/P49 partition of P57; ticket 20).
 *
 * The seam is the one a pi run really uses: the production definition bound through the framework's
 * real pi adapter, the runtime `createModelCostRuntime` builds from the framework's validated
 * configuration, and the extension's own frontend (`attachModelCostWidget`) with its release composed
 * into the framework's one `cleanup` exactly as the shipped assembly composes it. The context readings
 * this extension consumes are not one of its own frontends any more: the framework's own collection
 * (the adapter's points, recorded in its observation source) supplies them, so there is no such
 * registration here to attach or release. Nothing here reaches inside the extension: what a case drives
 * is the native facts pi publishes, and what it observes is the operator-visible result — the widget
 * hand-overs the host was given, the notice channel, the requests the extension really sent through
 * its own HTTP dependency, the files of the storage root, and the registrations the frontends made
 * with the UI's one boundary wait.
 *
 * Two shapes a real pi run has are stated here as two assemblies. One assembly is one pi extension
 * evaluation — pi evaluates an entry once per session, which the fixed pi 1.2.0 host really does (the
 * same file loaded for a spawned session is evaluated again, in the same process) — so the child's
 * own binding in this process, and the child process a delegation runs in, are both "the session's
 * own instance", while a second session bound to the *same* evaluation is the one instance serving
 * several sessions, as OMP's own adapter does.
 *
 * The extension's own provider access is this file's, stated the way pi's host states it
 * (`modelRegistry` per session), so the two sources the owner's initialization asks are real
 * outbound requests recorded here and never a network. Every expected value below is the
 * specification's own literal or this file's own arithmetic on the usage it delivers.
 */
import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type {
	PiAssistantMessage,
	PiExtensionApi,
	PiExtensionContext,
	PiSessionHeader,
} from "../../framework/adapters/pi";
import { piAdapter } from "../../framework/adapters/pi";
import { MODEL_COST } from "../../extensions/model-cost/definition";
import {
	MODEL_COST_HARNESS,
	releasingFrontendsOnCleanup,
} from "../../extensions/model-cost/harnesses/pi";
import { MODEL_COST_WIDGET_KEY, attachModelCostWidget } from "../../extensions/model-cost/harnesses/pi/widget";
import type { BoundaryTimer } from "../../extensions/model-cost/harnesses/boundary-timer";
import type { ConsumptionDocument, SessionRecord } from "../../extensions/model-cost/shared-logic/accounting/consumption-document";
import type { ModelPricingData } from "../../extensions/model-cost/shared-logic/pricing/model-data";
import { createModelCostRuntime, type ModelCostRuntime } from "../../extensions/model-cost/shared-logic/runtime";
import type { ProviderAccess, ProviderAccessFacts } from "../../framework/core/protocol";
import type { HttpRequestOptions } from "../../framework/modules/http";
import { drain, until } from "../support/pending-query";

/** The repository root every binding resolves the declared configuration against, and its file. */
const REPOSITORY_ROOT = mkdtempSync(path.join(tmpdir(), "pi-assembly-repo-"));
mkdirSync(path.join(REPOSITORY_ROOT, "extensions", "model-cost"), { recursive: true });
writeFileSync(
	path.join(REPOSITORY_ROOT, "extensions", "model-cost", "config.yaml"),
	["storageDir: ./cost-archive", "balanceTtlMs: 30000", "codexQuotaTtlMs: 15000", ""].join("\n"),
	"utf8",
);

/** The entry a spawned session is loaded from, written into this file's own repository layout. */
const CHILD_ENTRY = path.join(REPOSITORY_ROOT, "entrypoints", "pi", "model-cost.ts");
mkdirSync(path.dirname(CHILD_ENTRY), { recursive: true });
{
	const harness = path.join(REPOSITORY_ROOT, "extensions", "model-cost", "harnesses", "pi.ts");
	const relative = path.relative(path.dirname(CHILD_ENTRY), harness).replace(/\\/g, "/");
	writeFileSync(
		CHILD_ENTRY,
		`import { modelCostPiHarness } from ${JSON.stringify(relative)};\n\nexport default modelCostPiHarness(${JSON.stringify(REPOSITORY_ROOT)});\n`,
		"utf8",
	);
}

/** The directory pi's own session files are written under, for the lineage links the adapter follows. */
const SESSION_FILES = mkdtempSync(path.join(tmpdir(), "pi-assembly-sessions-"));

/** The document the extension keeps in its storage root. */
const CONSUMPTION_FILE = "consumption.json";

/** The provider and model every session of this file runs, and the extension's own price of them. */
const PROVIDER = "deepseek";
const MODEL = "deepseek-flash";

/** The address the host states for that provider, and the two credentials this host holds. */
const PROVIDER_BASE_URL = "https://host.example/v1";
const PROVIDER_CREDENTIAL = "assembly-key";
const ALLOWANCE_PROVIDER = "openai-codex";
const ALLOWANCE_CREDENTIAL = "allowance-key";

/** The two addresses this extension's own provider queries go to, as its modules state them. */
const BALANCE_URL = "https://host.example/user/balance";
const ALLOWANCE_URL = "https://chatgpt.com/backend-api/wham/usage";

/**
 * The self-made pricing data: one monetary pair, priced at `input·2 + output·8` per million tokens
 * with no peak window, so a case's own arithmetic on the usage it delivers is the expected amount.
 */
const DATA: ModelPricingData = {
	currency: "CNY",
	unit: "CNY per million tokens",
	peakMultiplier: 3,
	zoneOffsetMinutes: 8 * 60,
	peakWindows: [],
	tiers: { flash: { input: 2, cacheRead: 0, output: 8 } },
	allowanceProviders: [],
	models: { [PROVIDER]: { [MODEL]: { mode: "monetary", tier: "flash" } } },
};

/** One realized usage this file delivers: 1000 input and 200 output tokens. */
const USAGE = { input: 1000, cacheRead: 0, cacheWrite: 0, output: 200, totalTokens: 1200 };

/** The amount that usage is worth at the data's own price: this file's own arithmetic, in CNY. */
const USAGE_COST_CNY = (1000 * 2 + 200 * 8) / 1_000_000;

/** The clock every case starts at, and the success TTL the declared configuration states. */
const CLOCK = 1_700_000_000_000;
const SUCCESS_TTL_MS = 30_000;

/**
 * One pi session file as pi writes it: the first line is the header, and the identity a lineage link
 * resolves through is that header's own `id` rather than the file's name.
 */
function sessionFile(name: string, header: PiSessionHeader): string {
	const file = path.join(SESSION_FILES, name);
	writeFileSync(file, `${JSON.stringify(header)}\n`, "utf8");
	return file;
}

/** The main session's own file, and the child's, whose lineage link names the main session's file. */
const MAIN_FILE = sessionFile("assembly-main.jsonl", { type: "session", id: "assembly-main" });
const CHILD_FILE = sessionFile("assembly-child.jsonl", {
	type: "session",
	id: "assembly-child",
	parentSession: MAIN_FILE,
});

/**
 * One session as this file's controlled pi surface reports it.
 *
 * `hasUI` is what makes a spawned session's binding headless: pi's own child-session context
 * publishes no UI, so a frontend attached for it draws nothing and registers no boundary wait.
 */
interface PiSession {
	readonly sessionId: string;
	readonly name?: string;
	readonly header?: PiSessionHeader;
	readonly model?: { readonly id?: string; readonly provider?: string };
	readonly thinkingLevel?: string;
	readonly hasUI?: boolean;
	idle: boolean;
	pending: boolean;
}

/** The session that owns the process's State: the one the framework initializes the instance at. */
const MAIN = {
	sessionId: "assembly-main",
	name: "装配主会话",
	header: { type: "session", id: "assembly-main" },
	model: { id: MODEL, provider: PROVIDER },
	thinkingLevel: "high",
	hasUI: true,
	idle: true,
	pending: false,
} satisfies PiSession;

/** The subagent that session spawned: its direct parent is the main session, its Owner is not. */
const CHILD = {
	sessionId: "assembly-child",
	name: "review the diff",
	header: { type: "session", id: "assembly-child", parentSession: MAIN_FILE },
	model: { id: MODEL, provider: PROVIDER },
	thinkingLevel: "medium",
	hasUI: false,
	idle: true,
	pending: false,
} satisfies PiSession;

/** One request the extension really sent, as its own HTTP dependency recorded it. */
interface SentRequest {
	readonly url: string;
	readonly options: HttpRequestOptions | undefined;
}

/** One request a case is holding open, and the case's own call that answers it. */
interface HeldQuery {
	readonly url: string;
	answer(response: Response): void;
}

/** One widget hand-over the host was given, with the session whose context handed it over. */
interface Frame {
	readonly sessionId: string;
	readonly lines: readonly string[] | undefined;
}

/**
 * The UI's one boundary wait, as this file records who is registered with it.
 *
 * It is a double for the frontend's own carrier contract and decides nothing: the real timer's
 * scheduling rules are covered where they live (`tests/model-cost/pi-season-boundary.test.ts`), and
 * what a case here needs is what the frontends registered and gave up — which is what makes "a
 * session without a UI registers nothing" and "the disposal leaves no wait behind" observable facts.
 */
class RecordingBoundaryTimer implements BoundaryTimer {
	/** How many frontends are registered right now. */
	live = 0;
	/** How many registrations were taken over the life of this double. */
	taken = 0;
	/** How many registrations were given up. */
	released = 0;

	attach(): () => void {
		this.live += 1;
		this.taken += 1;
		return () => {
			this.live -= 1;
			this.released += 1;
		};
	}

	sync(): void {}
	dispose(): void {
		this.live = 0;
	}
}

/** The pi native surface one assembly is bound to, with everything a case delivers and reads. */
interface PiSurface {
	readonly api: PiExtensionApi;
	/** The provider queries this process's instance sent, in call order. */
	readonly queries: SentRequest[];
	/** The requests a case is holding back, which it answers itself. */
	readonly held: HeldQuery[];
	/** Every widget hand-over the host was given, in call order. */
	readonly frames: Frame[];
	/** Every notice the extension published through pi's own channel. */
	readonly notices: Array<{ readonly level: string; readonly message: string }>;
	/** The one boundary wait this process's UI owns. */
	readonly timer: RecordingBoundaryTimer;
	/** One session starting, with the reason pi states. */
	sessionStarts(session: PiSession, reason: string): void;
	/** One session ending, with the reason pi states (pi's own `session_shutdown`). */
	sessionEnds(session: PiSession, reason: string): void;
	/** pi's agent loop beginning: the Round's own beginning. */
	runStarts(session: PiSession): void;
	/** pi's run fully settled, with nothing left to continue it. */
	runSettles(session: PiSession): void;
	/** One run initiation, awaited: the node the framework initializes the extension at. */
	agentStarts(session: PiSession): Promise<void>;
	/** One whole settled Turn: the request about to be sent and the finalized response. */
	turnSettles(session: PiSession): void;
	/** Makes every context this surface publishes unreadable, as a session replacement does. */
	spend(): void;
}

/** One assembled pi extension evaluation: the surface driving it, the runtime behind it, its root. */
interface Process {
	readonly surface: PiSurface;
	/** The business instance this evaluation runs right now, as a rebuild after a disposal replaces it. */
	runtime(): ModelCostRuntime;
	/** The clock the runtime's own business reads; a case moves it by assignment. */
	readonly clock: { now: number };
	readonly root: string;
	readonly consumption: string;
	/** Releases the frontends of an evaluation whose session never ended. */
	close(): void;
}

/** Every root this file created, removed once the file is done with them. */
const roots: string[] = [];
/** Every evaluation this file bound, closed after each case. */
const processes: Process[] = [];

afterEach(() => {
	for (const evaluation of processes.splice(0)) evaluation.close();
});

// The roots go at the end of the file rather than after each case: a case is finished when its own
// facts are, but a save it started can still be publishing, and a root removed under a publish that
// is still in flight would report a failure this file itself caused.
afterAll(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/**
 * One fresh storage root: `cost-archive` under a case's own directory, exactly as the declared
 * configuration names it — so a case can see whether anything was created before a session needed it.
 */
function freshRoot(): string {
	const directory = mkdtempSync(path.join(tmpdir(), "pi-assembly-root-"));
	roots.push(directory);
	return path.join(directory, "cost-archive");
}

/** The host's answer to a balance query, in the provider's documented shape. */
function balanceAnswer(total: string): Response {
	return Response.json({
		is_available: true,
		balance_infos: [{ currency: "CNY", total_balance: total, granted_balance: "0.00", topped_up_balance: total }],
	});
}

/** The host's answer to an allowance-window query, in that provider's documented shape. */
function allowanceAnswer(usedPercent: number): Response {
	return Response.json({
		plan_type: "pro",
		rate_limit: {
			primary_window: { used_percent: usedPercent, limit_window_seconds: 18_000, reset_at: 1_700_003_600 },
			secondary_window: { used_percent: 60, limit_window_seconds: 604_800, reset_at: 1_700_086_400 },
		},
	});
}

/** Answer one held request with the answer its own address states. */
function answerHeld(process: Process): void {
	for (const held of process.surface.held.splice(0)) {
		held.answer(held.url === ALLOWANCE_URL ? allowanceAnswer(12.5) : balanceAnswer("110.00"));
	}
}

/**
 * Assemble one pi extension evaluation over one storage root, the way the shipped assembly composes
 * it: the framework's real adapter, the extension's real definition and runtime, its own frontends,
 * and the framework's binding performed before a frontend is attached.
 *
 * The framework resolves an extension's declared configuration once per process, so a file binding
 * several cases states each case's storage root itself, as the shipped harness lets a deployment
 * state its own.
 */
function assemble(options: { readonly root?: string; readonly holdQueries?: boolean } = {}): Process {
	const root = options.root ?? freshRoot();
	const handlers = new Map<string, Array<(event: unknown, ctx: PiExtensionContext) => unknown>>();
	const queries: SentRequest[] = [];
	const held: HeldQuery[] = [];
	const frames: Frame[] = [];
	const notices: Array<{ level: string; message: string }> = [];
	const timer = new RecordingBoundaryTimer();
	const clock = { now: CLOCK };
	let spent = false;
	let runtime: ModelCostRuntime | undefined;
	/** Every frontend release of this evaluation, as the implementation's own cleanup reaches them. */
	const frontendReleases = new Set<() => void>();
	const credentials: Readonly<Record<string, string>> = {
		[PROVIDER]: PROVIDER_CREDENTIAL,
		[ALLOWANCE_PROVIDER]: ALLOWANCE_CREDENTIAL,
	};
	// The host's own access, as pi states it: who answers for a provider, and at what address.
	const access: ProviderAccess = {
		resolve: async (provider: string): Promise<ProviderAccessFacts | undefined> => {
			const credential = credentials[provider];
			if (credential === undefined) return undefined;
			return provider === PROVIDER ? { baseUrl: PROVIDER_BASE_URL, credential } : { credential };
		},
	};

	const contextOf = (session: PiSession): PiExtensionContext => {
		// A context the host replaced or disposed is spent: every read of it throws, exactly as pi's
		// own contract states for a session the host stood another one up over.
		const live = (): void => {
			if (spent) throw new Error("This extension ctx is stale after session replacement or reload.");
		};
		return {
			sessionManager: {
				getSessionId: () => {
					live();
					return session.sessionId;
				},
				getSessionName: () => session.name,
				getBranch: () => [],
				getHeader: () => session.header,
			},
			get hasUI(): boolean {
				live();
				return session.hasUI ?? true;
			},
			get model(): { readonly provider: string; readonly id: string } | undefined {
				live();
				return session.model as { readonly provider: string; readonly id: string } | undefined;
			},
			get thinkingLevel(): string | undefined {
				live();
				return session.thinkingLevel;
			},
			ui: {
				notify: (message: string, level?: string) => void notices.push({ level: level ?? "info", message }),
				setWidget: (_key: string, content: readonly string[] | undefined) =>
					void frames.push({
						sessionId: session.sessionId,
						lines: content === undefined ? undefined : [...content],
					}),
			},
			getContextUsage: () => ({ tokens: 20_000, contextWindow: 450_000 }),
			isIdle: () => {
				live();
				return session.idle;
			},
			hasPendingMessages: () => session.pending,
			modelRegistry: {
				getAll: () => [{ id: MODEL, provider: PROVIDER, baseUrl: PROVIDER_BASE_URL }],
				getApiKeyForProvider: async (provider: string) => credentials[provider],
				getProvider: (provider: string) => (provider === PROVIDER ? { baseUrl: PROVIDER_BASE_URL } : undefined),
			},
		} as unknown as PiExtensionContext;
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
		registerCommand(): void {},
		appendEntry(): void {},
	} as unknown as PiExtensionApi;
	const deliver = (event: string, payload: unknown, session: PiSession): readonly unknown[] => {
		const ctx = contextOf(session);
		return [...(handlers.get(event) ?? [])].map(handler => handler(payload, ctx));
	};

	const surface: PiSurface = {
		api,
		queries,
		held,
		frames,
		notices,
		timer,
		sessionStarts: (session, reason) => void deliver("session_start", { type: "session_start", reason }, session),
		sessionEnds: (session, reason) => void deliver("session_shutdown", { type: "session_shutdown", reason }, session),
		runStarts: session => void deliver("agent_start", { type: "agent_start" }, session),
		runSettles: session => void deliver("agent_settled", { type: "agent_settled", aborted: false }, session),
		agentStarts: async session => {
			await Promise.all(
				deliver("before_agent_start", { type: "before_agent_start", messageType: "user" }, session),
			);
		},
		turnSettles: session => {
			deliver("before_provider_request", { type: "before_provider_request" }, session);
			deliver("after_provider_response", { type: "after_provider_response", status: 200, headers: {} }, session);
			const message: PiAssistantMessage = {
				role: "assistant",
				stopReason: "stop",
				responseId: `response-${queries.length}`,
				usage: USAGE,
			};
			deliver("message_end", { type: "message_end", message }, session);
		},
		spend: () => {
			spent = true;
		},
	};

	const bind = piAdapter(MODEL_COST, {
		configBaseDir: REPOSITORY_ROOT,
		childEntry: CHILD_ENTRY,
		factory: context => {
			const built = createModelCostRuntime({
				config: { ...context.config, storageDir: root },
				configDirectory: path.join(REPOSITORY_ROOT, "extensions", MODEL_COST.id),
				userHomeDirectory: root,
				harness: MODEL_COST_HARNESS,
				data: DATA,
				providerAccess: context.providerAccess ?? access,
				now: () => clock.now,
				httpRequest: async (url: string, httpOptions?: HttpRequestOptions) => {
					queries.push({ url, options: httpOptions });
					if (options.holdQueries !== true) {
						return url === ALLOWANCE_URL ? allowanceAnswer(12.5) : balanceAnswer("110.00");
					}
					const { promise, resolve } = Promise.withResolvers<Response>();
					held.push({ url, answer: resolve });
					return promise;
				},
			});
			runtime = built;
			// The dispose front-end is the framework's: the frontends this evaluation attaches are
			// released through the one cleanup the binding runs, exactly as the shipped assembly does.
			return releasingFrontendsOnCleanup(built.implementation, frontendReleases);
		},
	});
	const bound = bind(api);
	if (bound.bound && runtime !== undefined) {
		const built = runtime;
		// The widget is this assembly's own frontend, attached per binding and released through the one
		// cleanup the binding runs. The context reading is not attached here at all: the framework's own
		// observation source collects it (the adapter's collection points, registered by the framework
		// when this extension observes a reading), so this half owns no such registration to release.
		const releaseWidget = attachModelCostWidget(api, built, timer);
		frontendReleases.add(() => {
			releaseWidget();
		});
	}
	const evaluation: Process = {
		surface,
		runtime: () => {
			if (runtime === undefined) throw new Error("this case's binding built no runtime");
			return runtime;
		},
		clock,
		root,
		consumption: path.join(root, CONSUMPTION_FILE),
		close: () => {
			for (const release of [...frontendReleases]) {
				frontendReleases.delete(release);
				release();
			}
		},
	};
	processes.push(evaluation);
	return evaluation;
}

/** The document one evaluation's storage root holds, or nothing while it holds none. */
function documentOf(evaluation: Process): ConsumptionDocument | undefined {
	if (!existsSync(evaluation.consumption)) return undefined;
	return JSON.parse(readFileSync(evaluation.consumption, "utf8")) as ConsumptionDocument;
}

/** The record one document holds for a session id, or `undefined` when it holds none. */
function recordOf(document: ConsumptionDocument | undefined, sessionId: string): SessionRecord | undefined {
	return document?.harnesses?.[MODEL_COST_HARNESS]?.sessions.find(record => record.id === sessionId);
}

/** The bytes one evaluation's activity document holds, as the before/after comparison of an effect. */
function bytesOf(evaluation: Process): string | undefined {
	return existsSync(evaluation.consumption) ? readFileSync(evaluation.consumption, "utf8") : undefined;
}

/** One document as a case seeds it: one period, and the records it states. */
function seededDocument(records: readonly SessionRecord[]): ConsumptionDocument {
	return {
		schemaVersion: 1,
		periodId: "assembly-period",
		start: "2026-10-01T00:00:00.000Z",
		holiday: false,
		harnesses: { [MODEL_COST_HARNESS]: { sessions: [...records] } },
	};
}

/** One session record as a case seeds it: the input this file states, at this file's own price. */
function seededRecord(id: string, parent: string | null, input: number): SessionRecord {
	return {
		id,
		name: id,
		parent,
		saveVersion: 1,
		own: {
			[PROVIDER]: {
				[MODEL]: {
					tokens: { input, cacheRead: 0, cacheWrite: 0, output: 0 },
					costCny: (input * 2) / 1_000_000,
				},
			},
		},
	};
}

/** One whole exchange of a session as pi publishes it: the run's own edges around one Turn. */
async function exchange(evaluation: Process, session: PiSession): Promise<void> {
	evaluation.surface.runStarts(session);
	evaluation.surface.turnSettles(session);
	evaluation.surface.runSettles(session);
	await drain();
}

describe("assembling the entry performs no external effect of its own (P48)", () => {
	test("the binding builds the instance without reading, writing or asking the host anything", () => {
		const evaluation = assemble();
		expect(evaluation.surface.queries).toEqual([]);
		expect(existsSync(evaluation.root)).toBe(false);
		expect(evaluation.surface.frames).toEqual([]);
		expect(evaluation.surface.timer.taken).toBe(0);
		expect(evaluation.surface.notices).toEqual([]);
		// The instance answers read-only results without any of the above: the reading it holds is none.
		expect(evaluation.runtime().presentation.balance().reading).toBeUndefined();
	});
});

describe("the owner session's preparation is awaited once, and its two sources are asked in parallel (P48)", () => {
	test("the first request waits for the initialization while the one prefetch pair is out", async () => {
		const root = freshRoot();
		mkdirSync(root, { recursive: true });
		const evaluation = assemble({ root, holdQueries: true });
		// The baseline this instance starts from: one peer record of another session, on disk.
		writeFileSync(
			evaluation.consumption,
			JSON.stringify(seededDocument([seededRecord("assembly-peer", null, 500)])),
			"utf8",
		);
		evaluation.surface.sessionStarts(MAIN, "startup");
		const firstRequest = evaluation.surface.agentStarts(MAIN);
		await until(() => evaluation.surface.queries.length === 2, "both provider queries left the process");
		// Asked in parallel: both requests are out, and neither of them was answered by this host yet.
		expect(evaluation.surface.queries.map(sent => sent.url).sort()).toEqual([ALLOWANCE_URL, BALANCE_URL].sort());
		let settledFirstRequest = false;
		void firstRequest.then(() => {
			settledFirstRequest = true;
		});
		expect(settledFirstRequest).toBe(false);
		answerHeld(evaluation);
		await drain();
		expect(settledFirstRequest).toBe(true);
		// The initialization read the document the root holds: that peer record is its baseline.
		expect(evaluation.runtime().storage.session(MODEL_COST_HARNESS, "assembly-peer")?.own).toBeDefined();
		// One prefetch pair, and no second attempt once the first answered.
		expect(evaluation.surface.queries.length).toBe(2);
	});

	test("two run initiations that race share one preparation and one prefetch pair", async () => {
		const evaluation = assemble({ holdQueries: true });
		evaluation.surface.sessionStarts(MAIN, "startup");
		const first = evaluation.surface.agentStarts(MAIN);
		const second = evaluation.surface.agentStarts(MAIN);
		await until(() => evaluation.surface.queries.length === 2, "the one prefetch pair left the process");
		let settledInstead = 0;
		void first.then(() => {
			settledInstead += 1;
		});
		void second.then(() => {
			settledInstead += 1;
		});
		await drain();
		// Both initiations are held by the one outstanding pair, and nothing was asked a second time.
		expect(settledInstead).toBe(0);
		expect(evaluation.surface.queries.length).toBe(2);
		answerHeld(evaluation);
		await drain();
		expect(settledInstead).toBe(2);
		expect(evaluation.surface.queries.length).toBe(2);
	});
});

describe("a spawned session's own evaluation prepares the accounting and starts no root-side effect (P48)", () => {
	test("the child's own exchange is saved under its identity, with no provider query and no display", async () => {
		const root = freshRoot();
		mkdirSync(root, { recursive: true });
		writeFileSync(
			path.join(root, CONSUMPTION_FILE),
			JSON.stringify(seededDocument([seededRecord(MAIN.sessionId, null, 500)])),
			"utf8",
		);
		// This evaluation runs the spawned session only, exactly as the process the provider ran it in.
		const childEvaluation = assemble({ root });
		childEvaluation.surface.sessionStarts(CHILD, "startup");
		childEvaluation.surface.runStarts(CHILD);
		childEvaluation.surface.turnSettles(CHILD);
		childEvaluation.surface.runSettles(CHILD);
		await until(
			() => recordOf(documentOf(childEvaluation), CHILD.sessionId)?.saveVersion === 1,
			"the child's own record was published",
		);
		const record = recordOf(documentOf(childEvaluation), CHILD.sessionId);
		// The session's own identity, direct parent, tokens and amount, in this file's own arithmetic.
		expect(record?.parent).toBe(MAIN.sessionId);
		expect(record?.own[PROVIDER]?.[MODEL]?.tokens.input).toBe(USAGE.input);
		expect(record?.own[PROVIDER]?.[MODEL]?.costCny).toBeCloseTo(USAGE_COST_CNY, 12);
		// The peer record the baseline held is exactly as it was: the save merged with the file.
		expect(recordOf(documentOf(childEvaluation), MAIN.sessionId)).toEqual(
			seededRecord(MAIN.sessionId, null, 500),
		);
		// The root-side effects are the owner's: this evaluation asked the account nothing and drew
		// nothing, and its headless binding registered no boundary wait.
		expect(childEvaluation.surface.queries).toEqual([]);
		expect(childEvaluation.surface.frames).toEqual([]);
		expect(childEvaluation.surface.timer.taken).toBe(0);
	});

	test("a settled request refreshes no reading this evaluation never obtained", async () => {
		const childEvaluation = assemble();
		childEvaluation.surface.sessionStarts(CHILD, "startup");
		await exchange(childEvaluation, CHILD);
		// The refresh policy's own rule asks the account for a reading nothing holds; what keeps this
		// evaluation from doing so is that it never began a root-side start of its own.
		expect(childEvaluation.surface.queries).toEqual([]);
		expect(childEvaluation.runtime().presentation.balance().reading).toBeUndefined();
		expect(childEvaluation.surface.timer.taken).toBe(0);
	});
});

describe("one evaluation's sessions share the one instance and the one preparation (P48)", () => {
	test("a second session's binding neither re-prepares nor arms a second root-side effect", async () => {
		const evaluation = assemble();
		evaluation.surface.sessionStarts(MAIN, "startup");
		await evaluation.surface.agentStarts(MAIN);
		// The owner's own prefetch pair, out once, and the one boundary wait its UI registered.
		expect(evaluation.surface.queries.map(sent => sent.url).sort()).toEqual([ALLOWANCE_URL, BALANCE_URL].sort());
		expect(evaluation.surface.timer.taken).toBe(1);

		evaluation.surface.sessionStarts(CHILD, "startup");
		await exchange(evaluation, CHILD);
		await until(
			() => recordOf(documentOf(evaluation), CHILD.sessionId) !== undefined,
			"the child's own record was published by the shared instance",
		);
		// The one instance served both sessions: its one prefetch pair is all the account saw, the
		// headless binding armed no second wait and handed no widget over, and the child's consumption
		// is its own record rather than the owner's.
		expect(evaluation.surface.queries.length).toBe(2);
		expect(evaluation.surface.timer.taken).toBe(1);
		expect(evaluation.surface.frames.some(frame => frame.sessionId === CHILD.sessionId)).toBe(false);
		const childRecord = recordOf(documentOf(evaluation), CHILD.sessionId);
		expect(childRecord?.parent).toBe(MAIN.sessionId);
		expect(childRecord?.own[PROVIDER]?.[MODEL]?.tokens.input).toBe(USAGE.input);
		expect(recordOf(documentOf(evaluation), MAIN.sessionId)?.own[PROVIDER]?.[MODEL]?.tokens.input).toBeUndefined();
	});
});

describe("the owner's disposal releases every registration, and the spent instance never speaks again (P49)", () => {
	test("the session's own end clears the display, drops the wait and turns every later effect away", async () => {
		const evaluation = assemble();
		evaluation.surface.sessionStarts(MAIN, "startup");
		await evaluation.surface.agentStarts(MAIN);
		await exchange(evaluation, MAIN);
		await until(() => bytesOf(evaluation) !== undefined, "the first exchange was saved");
		expect(evaluation.surface.timer.taken).toBe(1);

		// The session the instance serves ends: the framework runs the one cleanup, which is what
		// releases the frontends this evaluation attached.
		const framesBefore = evaluation.surface.frames.length;
		evaluation.surface.sessionEnds(MAIN, "quit");
		await drain();
		expect(evaluation.surface.frames.length).toBe(framesBefore + 1);
		expect(evaluation.surface.frames[evaluation.surface.frames.length - 1]?.lines).toBeUndefined();
		expect(evaluation.surface.timer.live).toBe(0);
		expect(evaluation.surface.timer.released).toBe(1);

		// Every later effect is turned away: a further exchange reaches neither the display nor the
		// file, and a read-only refresh on the disposed instance adopts nothing.
		const bytesAfterDisposal = bytesOf(evaluation);
		const framesAfterDisposal = evaluation.surface.frames.length;
		await exchange(evaluation, MAIN);
		expect(evaluation.surface.frames.length).toBe(framesAfterDisposal);
		expect(bytesOf(evaluation)).toBe(bytesAfterDisposal);
		expect(await evaluation.runtime().synchronize()).toEqual({ kind: "closed" });
		expect(evaluation.surface.timer.live).toBe(0);
	});

	test("a spawned session's end and an idle Round end dispose nothing", async () => {
		const evaluation = assemble();
		evaluation.surface.sessionStarts(MAIN, "startup");
		await evaluation.surface.agentStarts(MAIN);
		// The spawned session's own life in this evaluation: it starts, works and ends, and the
		// instance that owns the process keeps serving the session that initialized it.
		evaluation.surface.sessionStarts(CHILD, "startup");
		evaluation.surface.sessionEnds(CHILD, "quit");
		await exchange(evaluation, CHILD);
		await until(
			() => recordOf(documentOf(evaluation), CHILD.sessionId) !== undefined,
			"the child's own consumption was saved",
		);
		expect(evaluation.surface.frames.some(frame => frame.lines === undefined)).toBe(false);

		// An idle edge — a Round that ended with the session at rest — is not a disposal either: the
		// owner's own next exchange is still accounted, saved and drawn.
		await exchange(evaluation, MAIN);
		await until(
			() => recordOf(documentOf(evaluation), MAIN.sessionId)?.own[PROVIDER]?.[MODEL] !== undefined,
			"the owner's own exchange was still saved",
		);
		const record = recordOf(documentOf(evaluation), MAIN.sessionId);
		expect(record?.own[PROVIDER]?.[MODEL]?.tokens.input).toBe(USAGE.input);
		expect(evaluation.surface.frames.some(frame => frame.sessionId === MAIN.sessionId)).toBe(true);
	});
});

describe("a session's own end closes the Round its context can no longer be read for (P49)", () => {
	test("the child's exchange is still saved when the host spent its context before the late re-check", async () => {
		const childEvaluation = assemble();
		childEvaluation.surface.sessionStarts(CHILD, "startup");
		childEvaluation.surface.runStarts(CHILD);
		childEvaluation.surface.turnSettles(CHILD);
		// The host ends the session the moment the run settles — the in-process child of a delegation
		// is exactly that — so the re-check the framework arranges on its next task runs against a
		// context pi has already spent, and the session's work would be left open, and unsaved, if the
		// end the binding observed were not what answers for it.
		childEvaluation.surface.runSettles(CHILD);
		childEvaluation.surface.sessionEnds(CHILD, "quit");
		childEvaluation.surface.spend();
		await until(
			() => recordOf(documentOf(childEvaluation), CHILD.sessionId) !== undefined,
			"the child's own consumption was saved for the session its host ended",
		);
		const record = recordOf(documentOf(childEvaluation), CHILD.sessionId);
		expect(record?.parent).toBe(MAIN.sessionId);
		expect(record?.own[PROVIDER]?.[MODEL]?.tokens.input).toBe(USAGE.input);
	});
});

describe("the display reads no spent context (P49, and the in-process delegation of P48)", () => {
	test("a redraw after the host spent the session's context draws nothing and throws nothing", async () => {
		const evaluation = assemble({ holdQueries: true });
		evaluation.surface.sessionStarts(MAIN, "startup");
		const initiation = evaluation.surface.agentStarts(MAIN);
		await until(() => evaluation.surface.queries.length === 2, "the prefetch pair left the process");
		answerHeld(evaluation);
		await initiation;
		evaluation.surface.runStarts(MAIN);
		// The success TTL has run out, so the next settled request refreshes both readings: what this
		// case holds back is an answer that reaches the instance after the session is spent.
		evaluation.clock.now += SUCCESS_TTL_MS + 1_000;
		evaluation.surface.turnSettles(MAIN);
		await until(() => evaluation.surface.held.length >= 1, "the refresh left the process");
		evaluation.surface.runSettles(MAIN);
		await until(() => bytesOf(evaluation) !== undefined, "the exchange was accounted and saved");
		const framesBefore = evaluation.surface.frames.length;

		// The host replaces this process's session — the in-process child session of a delegation is
		// exactly that: every read of the old context throws, as pi's own contract states.
		evaluation.surface.spend();
		answerHeld(evaluation);
		await drain();
		// The late answer published a change, and the redraw it reached read no spent context: nothing
		// was drawn, nothing was cleared, and the accounting was not taken down with it.
		expect(evaluation.surface.frames.length).toBe(framesBefore);
		expect(recordOf(documentOf(evaluation), MAIN.sessionId)?.own[PROVIDER]?.[MODEL]?.tokens.input).toBe(USAGE.input);
	});
});
