/**
 * `/budget`'s operator surface and the pi entry's own display preference (S2, S3; contract P4, P5, P6,
 * P47; ticket 17).
 *
 * The seam is the one a pi run really uses: the extension's definition bound through the framework's
 * real pi adapter, the `/budget` command driven through pi's own command registration, the widget
 * frames the production frontend handed pi's widget area, and the consumption document the run left
 * in its storage root read back with plain file system calls. The one answer only the harness can
 * state — whether this entry integrated the sessions a subagent provider spawns — is the answer the
 * framework really settles here: the pinned provider's own published announcement channel is driven,
 * so a case that lets the provider state itself reads `subagents` and a case that leaves it silent
 * reads the normal no-subagent mode, exactly as a real process would.
 *
 * Two facts a case states for itself, as the pi assembly states them for a deployment: the storage
 * root the runtime's files live in, and the provider transport (both provider queries answer here, so
 * no case reaches a network).
 */
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import {
	type PiExtensionApi,
	type PiExtensionContext,
	type PiSessionHeader,
	piAdapter,
} from "../../framework/adapters/pi";
import type { HttpRequestOptions } from "../../framework/modules/http";
import type { SubagentIntegration } from "../../framework/public";
import { MODEL_COST } from "../../extensions/model-cost/definition";
import { MODEL_COST_HARNESS } from "../../extensions/model-cost/harnesses/pi";
import { MODEL_COST_WIDGET_KEY, attachModelCostWidget } from "../../extensions/model-cost/harnesses/pi/widget";
import type { ConsumptionDocument, SessionRecord } from "../../extensions/model-cost/shared-logic/accounting/consumption-document";
import type { ModelPricingData } from "../../extensions/model-cost/shared-logic/pricing/model-data";
import type { DisplayTarget } from "../../extensions/model-cost/shared-logic/presentation/display";
import { type ModelCostRuntime, createModelCostRuntime } from "../../extensions/model-cost/shared-logic/runtime";
import { uiBoundaryTimerOf } from "./support/ui-timer";

/** The repository root: this suite lives in `tests/model-cost/`. */
const REPOSITORY_ROOT = path.resolve(import.meta.dir, "..", "..");

/**
 * The entry a spawned session is loaded from, as the shipped pi assembly states it.
 *
 * The framework requires it in the sessions the pinned provider spawns, so its own answer about this
 * entry's subagent integration is settled here exactly as it is settled in a real deployment.
 */
const CHILD_ENTRY = path.join(REPOSITORY_ROOT, "entrypoints", "pi", "model-cost.ts");

/** The pinned provider's announcement channel, as its own documentation names it. */
const PROVIDER_READY_CHANNEL = "subagents:rpc:v1:ready";

/** The provider and exact model every entry of this suite runs: the self-made data's monetary pair. */
const PROVIDER = "deepseek";
const MODEL = "deepseek-flash";

/**
 * The self-made pricing data every case drives: one monetary provider, one allowance provider.
 *
 * Off-peak is `input·2 + cacheRead·0.5 + output·8` per million tokens, and no instant of this suite
 * is asserted through it: the cases below are about the command surface and the display preference,
 * not about an amount.
 */
const DATA: ModelPricingData = {
	currency: "XTS",
	unit: "XTS per million tokens",
	peakMultiplier: 3,
	zoneOffsetMinutes: 8 * 60,
	peakWindows: [{ fromMinute: 9 * 60, toMinute: 12 * 60 }],
	tiers: { flash: { input: 2, cacheRead: 0.5, output: 8 } },
	allowanceProviders: ["openai-codex"],
	models: {
		[PROVIDER]: { [MODEL]: { mode: "monetary", tier: "flash" } },
		"openai-codex": { "gpt-luna": { mode: "token-only" } },
	},
};

/** The document the extension keeps in its storage root, and its archives' directory. */
const CONSUMPTION_FILE = "consumption.json";
const ARCHIVE_DIRECTORY = "archives";

/** One pi session as a case states it: the facts the native surface publishes about the session. */
interface PiSession {
	readonly sessionId: string;
	readonly name: string;
	/** pi's own session header, as the session's file carries it: the session's own lineage link. */
	readonly header?: PiSessionHeader;
	readonly model: { readonly id: string; readonly provider: string };
	readonly idle: boolean;
	readonly pending: boolean;
	readonly catalog: readonly { readonly id: string; readonly provider: string; readonly baseUrl: string }[];
	readonly credentials: Readonly<Record<string, string | undefined>>;
}

/** The directory holding the pi session files the lineage facts of this suite are read from. */
const SESSION_FILES = mkdtempSync(path.join(tmpdir(), "pi-budget-sessions-"));

/**
 * One pi session file as pi writes it: the header is the first line, and the identity a lineage link
 * resolves through is that header's own `id` rather than the file's name.
 */
function sessionFile(name: string, header: PiSessionHeader): string {
	const file = path.join(SESSION_FILES, name);
	writeFileSync(file, `${JSON.stringify(header)}\n`, "utf8");
	return file;
}

/** The main session's own file, and the child's, whose lineage link names the main session's file. */
const MAIN_FILE = sessionFile("main-session.jsonl", { type: "session", id: "pi-budget-main" });
const CHILD_FILE = sessionFile("child-session.jsonl", {
	type: "session",
	id: "pi-budget-child",
	parentSession: MAIN_FILE,
});

/** The session every case below serves: pi's own main session on the monetary pair this file prices. */
const MAIN: PiSession = {
	sessionId: "pi-budget-main",
	name: "pi 主会话",
	header: { type: "session", id: "pi-budget-main" },
	model: { id: MODEL, provider: PROVIDER },
	idle: true,
	pending: false,
	catalog: [{ id: MODEL, provider: PROVIDER, baseUrl: "https://api.deepseek.com" }],
	credentials: { [PROVIDER]: "test-credential" },
};

/** The subagent the main session spawned: its direct parent is the main session, its Owner is not. */
const CHILD: PiSession = {
	...MAIN,
	sessionId: "pi-budget-child",
	name: "review the diff",
	header: { type: "session", id: "pi-budget-child", parentSession: MAIN_FILE },
};

/** One session record as this suite's documents carry it: no consumption of its own, no startup pair. */
function recordOf(session: PiSession, parent: string | null, extra: { readonly runtimeMs?: number } = {}): SessionRecord {
	return { id: session.sessionId, name: session.name, parent, saveVersion: 1, own: {}, ...extra };
}

/** The period every document below is in, and the shape the whole shared file has. */
function documentWith(records: readonly SessionRecord[]): ConsumptionDocument {
	return {
		schemaVersion: 1,
		periodId: "period-budget-actions",
		start: "2026-10-01T00:00:00.000Z",
		start_bal: 30.25,
		holiday: false,
		harnesses: { [MODEL_COST_HARNESS]: { sessions: records } },
	};
}

/** The document the cases with a period switch bind over: the main session and one descendant of it. */
const SEEDED = documentWith([recordOf(MAIN, null), recordOf(CHILD, MAIN.sessionId, { runtimeMs: 60_000 })]);

/**
 * The document the no-descendant case binds over: the main session alone, so the entry has a known
 * identity to read its display against and not one subagent record anywhere.
 */
const MAIN_ONLY = documentWith([recordOf(MAIN, null)]);

/** One read-only display target: the session a frontend draws, with the pair it draws it on. */
function targetOf(session: PiSession): DisplayTarget {
	return { sessionId: session.sessionId, provider: session.model.provider, model: session.model.id };
}

/** One provider query a case recorded, as the extension issued it. */
interface Query {
	readonly url: string;
	readonly options: HttpRequestOptions | undefined;
}

/** One notice the extension published through pi's own operator channel. */
interface Notice {
	readonly level: string;
	readonly message: string;
}

/** Every root this file created, removed after each case. */
const roots: string[] = [];
/** Every entry this file bound, ended after each case so its session requirement is released. */
const bounds: Bound[] = [];

afterEach(async () => {
	for (const bound of bounds.splice(0)) await bound.dispose();
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/**
 * One controlled pi native surface: the members the adapter registers on, and the host's own answers.
 *
 * It is the surface the pi suites drive their extensions through: the handlers pi would call, the bus
 * the process shares, the command pi registered, and the widget and notice channels the extension
 * publishes on. A case fires one native fact by hand with the session its own delivery carries.
 */
interface PiSurface {
	readonly api: PiExtensionApi;
	/** The notices the extension published, in call order. */
	readonly notices: Notice[];
	/** Every widget rendering the frontend published, as `key` and lines. */
	readonly frames: Array<{ readonly key: string; readonly lines: readonly string[] | undefined }>;
	/** The entries the framework recorded through pi's own persistence call, in call order. */
	readonly appended: unknown[];
	/** A session starting, with the reason pi states. */
	sessionStarts(session: PiSession, reason: string): void;
	/** A session ending, with the reason pi states. */
	sessionShutsDown(session: PiSession, reason: string): void;
	/** One submission pi admitted, as the user's own. */
	submits(session: PiSession): void;
	/** One run initiation, awaited: the framework initializes the extension on this hook. */
	agentStarts(session: PiSession): Promise<void>;
	/** The provider stating itself on its own published announcement channel. */
	announce(session: PiSession): void;
	/** One `/budget` invocation through pi's own command path. */
	command(args: string, session: PiSession): Promise<void>;
	/** The lines of the last widget frame, or nothing while it drew none. */
	lastLines(): readonly string[] | undefined;
	/** The last notice the extension published. */
	lastNotice(): Notice | undefined;
	/**
	 * Ends every session this surface started, as a host does when it disposes them.
	 *
	 * The requirement the framework took for a session is released with that session, so a later case
	 * of this file — the provider's registry is a fact of this process and it refuses a second
	 * requirement for one session — states its own rather than inheriting a spent one.
	 */
	dispose(): void;
}

function controlledSurface(): PiSurface {
	const handlers = new Map<string, Array<(event: unknown, ctx: PiExtensionContext) => unknown>>();
	const busHandlers = new Map<string, Array<(data: unknown) => void>>();
	const commands = new Map<string, { readonly handler: (args: string, ctx: PiExtensionContext) => Promise<void> }>();
	const notices: Notice[] = [];
	const frames: Array<{ key: string; lines: readonly string[] | undefined }> = [];
	const appended: unknown[] = [];
	const started = new Map<string, PiSession>();

	const bus = {
		on(channel: string, handler: (data: unknown) => void): () => void {
			const list = busHandlers.get(channel) ?? [];
			list.push(handler);
			busHandlers.set(channel, list);
			return () => {};
		},
		emit(channel: string, data: unknown): void {
			for (const handler of [...(busHandlers.get(channel) ?? [])]) handler(data);
		},
	};

	const contextOf = (session: PiSession): PiExtensionContext =>
		({
			sessionManager: {
				getSessionId: () => session.sessionId,
				getSessionName: () => session.name,
				getBranch: () => [],
				getHeader: () => session.header ?? null,
			},
			hasUI: true,
			isIdle: () => session.idle,
			hasPendingMessages: () => session.pending,
			model: session.model,
			ui: {
				notify: (message: string, level?: string) => void notices.push({ level: level ?? "info", message }),
				setWidget: (key: string, content: readonly string[] | undefined) =>
					void frames.push({ key, lines: content === undefined ? undefined : [...content] }),
			},
			events: bus,
			modelRegistry: {
				getAll: () => session.catalog,
				getApiKeyForProvider: async (provider: string) => session.credentials[provider],
				getProvider: (provider: string) => {
					const baseUrl = session.catalog.find(row => row.provider === provider)?.baseUrl;
					return baseUrl === undefined ? undefined : { baseUrl };
				},
			},
		}) as unknown as PiExtensionContext;

	const api = {
		events: bus,
		on(event: string, handler: (event: unknown, ctx: PiExtensionContext) => unknown): () => void {
			const list = handlers.get(event) ?? [];
			list.push(handler);
			handlers.set(event, list);
			return () => {};
		},
		registerCommand(name: string, registration: { readonly handler: (args: string, ctx: PiExtensionContext) => Promise<void> }): void {
			commands.set(name, registration);
		},
		appendEntry(_type: string, data?: unknown): void {
			appended.push(data);
		},
	} as unknown as PiExtensionApi;

	const deliver = (event: string, payload: unknown, session: PiSession): readonly unknown[] => {
		const ctx = contextOf(session);
		return [...(handlers.get(event) ?? [])].map(handler => handler(payload, ctx));
	};

	return {
		api,
		notices,
		frames,
		appended,
		sessionStarts: (session, reason) => {
			started.set(session.sessionId, session);
			deliver("session_start", { type: "session_start", reason }, session);
		},
		sessionShutsDown: (session, reason) => void deliver("session_shutdown", { type: "session_shutdown", reason }, session),
		submits: session => void deliver("input", { type: "input", source: "rpc" }, session),
		agentStarts: async session => {
			await Promise.all(deliver("before_agent_start", { type: "before_agent_start", messageType: "new" }, session));
		},
		announce: session =>
			bus.emit(PROVIDER_READY_CHANNEL, { version: 1, methods: ["ping"], session: { sessionId: session.sessionId } }),
		command: async (args, session) => {
			const command = commands.get("budget");
			if (command === undefined) throw new Error("the extension registered no /budget command");
			await command.handler(args, contextOf(session));
		},
		lastLines: () => {
			const shown = frames.filter(frame => frame.key === MODEL_COST_WIDGET_KEY);
			return shown[shown.length - 1]?.lines;
		},
		lastNotice: () => notices[notices.length - 1],
		dispose: () => {
			for (const session of [...started.values()]) {
				deliver("session_shutdown", { type: "session_shutdown", reason: "quit" }, session);
			}
		},
	};
}

/** One bound entry: the surface driving it, the runtime behind it and the root it writes. */
interface Bound {
	readonly surface: PiSurface;
	/** The business instance this entry runs right now, as a rebuild after a disposal replaces it. */
	runtime(): ModelCostRuntime;
	readonly root: string;
	readonly consumptionFile: string;
	/** Every provider query this entry's transport was asked for, in order. */
	readonly queries: Query[];
	/** The one answer the framework settled about this entry's subagent integration. */
	integration(): SubagentIntegration["mode"] | undefined;
	/** Releases the frontend this case attached. */
	release(): void;
	/** Ends what this case started: the sessions it drove, and the frontend it attached. */
	dispose(): Promise<void>;
}

/**
 * Lets the framework's own asynchronous work take its turn.
 *
 * Taking a session's requirement — the provider registration that makes the sessions a provider
 * spawns load this entry — is a promise the adapter resolves a few turns after the session's start.
 * A case that ends the sessions it started has to let those turns run, or the registration lands
 * after the release that was meant to give it back.
 */
async function requirementTurns(): Promise<void> {
	for (let turn = 0; turn < 8; turn += 1) await Promise.resolve();
}

/**
 * The extension assembled on pi over one storage root, as the production pi assembly composes it.
 *
 * The production assembly is `modelCostPiHarness(repositoryRoot)`, and the framework resolves the
 * extension's `config.yaml` through it — but the framework reads one extension's configuration once
 * per process, so a suite that binds model-cost in more than one case composes the same parts itself:
 * the framework's real pi adapter with the entry a spawned session is loaded from (the fact that makes
 * the framework settle a real subagent answer), the extension's real definition, the real runtime
 * built from the framework's validated configuration and the real frontend, with the frontend's
 * release composed into the framework's own cleanup exactly as the shipped assembly composes it. The
 * two facts stated here that the shipped file states for a real run are the storage root a case writes
 * in and the transport its provider queries answer on.
 */
function assemble(options: { readonly document?: ConsumptionDocument } = {}): Bound {
	const root = mkdtempSync(path.join(tmpdir(), "pi-budget-actions-"));
	roots.push(root);
	const consumptionFile = path.join(root, CONSUMPTION_FILE);
	if (options.document !== undefined) writeFileSync(consumptionFile, JSON.stringify(options.document), "utf8");
	const surface = controlledSurface();
	const queries: Query[] = [];
	let runtime: ModelCostRuntime | undefined;
	let releaseFrontend: (() => void) | undefined;
	// The one answer the framework settles about this entry's subagent integration, recorded where the
	// framework hands it over: this is what `/budget detail` is offered under.
	let settledIntegration: SubagentIntegration["mode"] | undefined;
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
				subagentIntegrationMode: () => settledIntegration,
				httpRequest: async (url: string, httpOptions?: HttpRequestOptions) => {
					queries.push({ url, options: httpOptions });
					return Response.json({
						is_available: true,
						balance_infos: [{ currency: "CNY", total_balance: "12.34", granted_balance: "0.00", topped_up_balance: "12.34" }],
					});
				},
			});
			runtime = built;
			const cleanup = built.implementation.cleanup;
			const initialize = built.implementation.initialize;
			return {
				...built.implementation,
				initialize: async delivery => {
					settledIntegration = delivery.subagents.mode;
					await initialize?.(delivery);
				},
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
	const built: Bound = {
		surface,
		runtime: () => {
			if (runtime === undefined) throw new Error("this case's binding built no runtime");
			return runtime;
		},
		root,
		consumptionFile,
		queries,
		integration: () => settledIntegration,
		release: () => {
			releaseFrontend?.();
			releaseFrontend = undefined;
		},
		dispose: async () => {
			await requirementTurns();
			surface.dispose();
			releaseFrontend?.();
			releaseFrontend = undefined;
		},
	};
	bounds.push(built);
	return built;
}

/** The archive files one root holds, by name. */
function archiveNames(root: string): string[] {
	const directory = path.join(root, ARCHIVE_DIRECTORY);
	return existsSync(directory) ? readdirSync(directory).sort() : [];
}

/** The bytes of the activity document one root holds, or nothing while it holds none. */
function documentBytes(root: string): string | undefined {
	const file = path.join(root, CONSUMPTION_FILE);
	return existsSync(file) ? readFileSync(file, "utf8") : undefined;
}

/** The activity document one root holds, parsed as the plain JSON document it is. */
function documentOf(root: string): ConsumptionDocument {
	return JSON.parse(documentBytes(root) as string) as ConsumptionDocument;
}

describe("a pi entry that integrated no subagent observations offers no detail form (P4)", () => {
	test("the command answers a notice, changes no preference, issues nothing and writes nothing", async () => {
		const bound = assemble();
		bound.surface.sessionStarts(MAIN, "startup");
		await bound.surface.agentStarts(MAIN);

		// The one answer the framework settled for this entry: a provider artifact is reachable and
		// nothing stated itself, which is the normal no-subagent shape.
		expect(bound.integration()).toBe("none");
		const queriesBefore = bound.queries.length;
		const framesBefore = bound.surface.frames.length;
		expect(existsSync(bound.consumptionFile)).toBe(false);

		await bound.surface.command("detail", MAIN);

		const notice = bound.surface.lastNotice();
		expect(notice?.level).toBe("warning");
		expect(notice?.message).toContain("/budget detail 未执行");
		expect(notice?.message).toContain("无子代理模式");
		expect(notice?.message).toContain("brief");
		expect(notice?.message).not.toContain("已切换为详细");

		// The preference this entry reads now, and the form its frontend draws, are where they were.
		expect(bound.runtime().presentation.of(targetOf(MAIN)).form).toBe("brief");
		expect(bound.surface.frames.length).toBe(framesBefore);

		// The external effects the early return must not produce: no provider call, no file, no archive.
		expect(bound.queries.length).toBe(queriesBefore);
		expect(existsSync(bound.consumptionFile)).toBe(false);
		expect(archiveNames(bound.root)).toEqual([]);

		// The answer is the mode's, not the moment's: an entry whose session is busy with a message pi
		// has queued answers the very same notice, because nothing here consults the activity state, the
		// save or the UI — the conditions the period actions have are not this action's.
		await bound.surface.command("detail", { ...MAIN, idle: false, pending: true });
		expect(bound.surface.lastNotice()?.message).toBe(notice?.message);
		expect(bound.runtime().presentation.of(targetOf(MAIN)).form).toBe("brief");
	});
});

describe("a pi entry whose subagent integration took still switches detail with no child record (P5)", () => {
	test("the provider's own statement settles the mode, and the action switches to the main session's tree", async () => {
		const bound = assemble({ document: MAIN_ONLY });
		bound.surface.sessionStarts(MAIN, "startup");
		// The pinned provider states itself for this session on its own published channel, exactly as a
		// provider serving the process does: the requirement the framework took is what makes the
		// sessions it spawns load this entry.
		bound.surface.announce(MAIN);
		await bound.surface.agentStarts(MAIN);
		expect(bound.integration()).toBe("subagents");
		const queriesBefore = bound.queries.length;
		const bytesBefore = documentBytes(bound.root);

		await bound.surface.command("detail", MAIN);

		const notice = bound.surface.lastNotice();
		expect(notice?.level).toBe("info");
		expect(notice?.message).toContain("展示已切换为详细");
		// The tree is the main session alone: it has no descendant yet, and that count decides nothing.
		const display = bound.runtime().presentation.of(targetOf(MAIN));
		expect(display.form).toBe("detail");
		expect(display.agentTree?.map(row => [row.kind, row.depth])).toEqual([["root", 0]]);
		// The frontend draws that tree where the brief draws its Round row.
		const lines = bound.surface.lastLines() ?? [];
		expect(lines.some(line => line.startsWith("Total:"))).toBe(true);
		expect(lines.some(line => line.includes(MAIN.name))).toBe(true);
		// The external effects a switch of this kind has: no provider call and no byte written.
		expect(bound.queries.length).toBe(queriesBefore);
		expect(documentBytes(bound.root)).toBe(bytesBefore);
		expect(archiveNames(bound.root)).toEqual([]);
	});
});

describe("the pi command surface keeps the declaration's help, its argument rules and every action (P6)", () => {
	test("the empty argument is the help, an argument is normalized, an undeclared one acts on nothing", async () => {
		const bound = assemble({ document: SEEDED });
		bound.surface.sessionStarts(MAIN, "startup");
		bound.surface.announce(MAIN);
		await bound.surface.agentStarts(MAIN);
		expect(bound.integration()).toBe("subagents");
		const bytesBefore = documentBytes(bound.root);
		const queriesBefore = bound.queries.length;

		// The empty argument is the help the declaration itself states: the command's own line, then one
		// line per declared action, in declaration order, and no action runs.
		await bound.surface.command("", MAIN);
		const help = bound.surface.lastNotice();
		expect(help?.level).toBe("info");
		expect(help?.message).toContain("/budget — 费用统计与展示管理");
		for (const line of ["detail — 切换简略／详细展示", "holiday — 开启假日计价", "clear — 归档并重置统计"]) {
			expect(help?.message).toContain(line);
		}
		expect(bound.runtime().presentation.of(targetOf(MAIN)).form).toBe("brief");

		// The argument is matched whole, trimmed and lowercased, and the declared action really runs.
		await bound.surface.command("  DETAIL \n", MAIN);
		expect(bound.surface.lastNotice()?.message).toContain("展示已切换为详细");
		expect(bound.runtime().presentation.of(targetOf(MAIN)).form).toBe("detail");
		await bound.surface.command(" detail ", MAIN);
		expect(bound.surface.lastNotice()?.message).toContain("展示已切换为简略");
		expect(bound.runtime().presentation.of(targetOf(MAIN)).form).toBe("brief");

		// An argument the table does not name is the same help at error severity, and no action runs: the
		// preference does not move, no period is switched, no provider is asked and no byte changes.
		for (const args of ["det", "detail on", "on", "off", "focused", "holidays", "clear!", "not-an-action"]) {
			await bound.surface.command(args, MAIN);
			expect(bound.surface.lastNotice()?.level).toBe("error");
			expect(bound.surface.lastNotice()?.message).toBe(help?.message);
		}
		expect(bound.runtime().presentation.of(targetOf(MAIN)).form).toBe("brief");
		expect(archiveNames(bound.root)).toEqual([]);
		expect(documentBytes(bound.root)).toBe(bytesBefore);
		expect(bound.queries.length).toBe(queriesBefore);

		// The two period actions are declared and each acts: a holiday period, then an ordinary one.
		await bound.surface.command("holiday", MAIN);
		expect(bound.surface.lastNotice()?.message).toContain("并开始新的假日周期（holiday=true）");
		expect(documentOf(bound.root).holiday).toBe(true);
		expect(archiveNames(bound.root)).toHaveLength(1);
		// A holiday period asked for again changes nothing at all.
		await bound.surface.command("holiday", MAIN);
		expect(bound.surface.lastNotice()?.level).toBe("info");
		expect(bound.surface.lastNotice()?.message).toContain("holiday 已开启");
		expect(archiveNames(bound.root)).toHaveLength(1);
		await bound.surface.command("CLEAR", MAIN);
		expect(bound.surface.lastNotice()?.message).toContain("并开始新的统计周期（holiday=false）");
		expect(documentOf(bound.root).holiday).toBe(false);
		expect(archiveNames(bound.root)).toHaveLength(2);
	});
});

describe("a refused detail leaves the entry's other budget actions exactly as they were (P4)", () => {
	test("the period switch still closes the period after the early return", async () => {
		const bound = assemble({ document: SEEDED });
		bound.surface.sessionStarts(MAIN, "startup");
		await bound.surface.agentStarts(MAIN);
		expect(bound.integration()).toBe("none");

		await bound.surface.command("detail", MAIN);
		expect(bound.surface.lastNotice()?.message).toContain("无子代理模式");

		// The same entry, on its own conditions, still switches: an archive is written and the period
		// that replaced the archived one is an ordinary one.
		await bound.surface.command("clear", MAIN);
		expect(bound.surface.lastNotice()?.message).toContain("并开始新的统计周期（holiday=false）");
		expect(documentOf(bound.root).holiday).toBe(false);
		expect(documentOf(bound.root).periodId).not.toBe(SEEDED.periodId);
		expect(archiveNames(bound.root)).toHaveLength(1);
	});
});

describe("the entry preference is entry memory, and a fresh entry answers the brief (P47)", () => {
	test("an ordinary session or model change keeps it, while a fresh entry and an applicable reload answer brief", async () => {
		const bound = assemble({ document: SEEDED });
		bound.surface.sessionStarts(MAIN, "startup");
		bound.surface.announce(MAIN);
		await bound.surface.agentStarts(MAIN);
		const bytesBefore = documentBytes(bound.root);

		await bound.surface.command("detail", MAIN);
		expect(bound.runtime().presentation.of(targetOf(MAIN)).form).toBe("detail");

		// An ordinary model change: the same session read on another model of its channel keeps the form
		// the entry is in, because the preference belongs to the entry rather than to a pair.
		expect(bound.runtime().presentation.of({ ...targetOf(MAIN), model: "deepseek-reasoner" }).form).toBe("detail");

		// An ordinary session change: the binding serves another pi session and comes back, and the form
		// the entry is in follows the entry rather than the session.
		const other: PiSession = {
			...MAIN,
			sessionId: "pi-budget-other",
			name: "pi 另一个会话",
			header: { type: "session", id: "pi-budget-other" },
		};
		bound.surface.sessionStarts(other, "new");
		// The submission pi attributed to the user is what establishes that session's own identity
		// here, exactly as it does for a session nobody has saved a record of yet.
		bound.surface.submits(other);
		expect(bound.runtime().presentation.of(targetOf(other)).form).toBe("detail");
		bound.surface.sessionStarts(MAIN, "resume");
		expect(bound.runtime().presentation.of(targetOf(MAIN)).form).toBe("detail");

		// The preference is entry memory rather than a State field or a stored one: the declaration
		// states no State at all, no flip recorded anything through pi's own persistence call, and no
		// byte of the document moved.
		expect(MODEL_COST.state).toBeUndefined();
		expect(bound.surface.appended).toEqual([]);
		expect(documentBytes(bound.root)).toBe(bytesBefore);

		// A fresh entry over the same storage root — a new process — answers the brief again, with the
		// main session's identity read from the document that is still there.
		const fresh = assemble({ document: SEEDED });
		expect(fresh.runtime().presentation.of(targetOf(MAIN)).form).toBe("brief");

		// An applicable reload: the host disposes the entry this binding serves and starts a new one over
		// the same storage root, and the entry it then serves answers the brief as well.
		await bound.dispose();
		const reloaded = assemble({ document: SEEDED });
		reloaded.surface.sessionStarts(MAIN, "reload");
		reloaded.surface.announce(MAIN);
		await reloaded.surface.agentStarts(MAIN);
		expect(reloaded.integration()).toBe("subagents");
		expect(reloaded.runtime().presentation.of(targetOf(MAIN)).form).toBe("brief");
	});

	test("a subagent's own display answers the brief while the entry is in the detail form", async () => {
		const bound = assemble({ document: SEEDED });
		bound.surface.sessionStarts(MAIN, "startup");
		bound.surface.announce(MAIN);
		await bound.surface.agentStarts(MAIN);
		await bound.surface.command("detail", MAIN);
		expect(bound.runtime().presentation.of(targetOf(MAIN)).form).toBe("detail");

		// The binding moves to the subagent the main session spawned: pi's own lineage link is what makes
		// its direct parent the main session, and a session with a direct parent is never the root of the
		// tree the detail form lists — so its own display is the brief, however the entry stands.
		bound.surface.sessionStarts(CHILD, "new");
		expect(bound.runtime().presentation.of(targetOf(CHILD)).form).toBe("brief");
		const childLines = bound.surface.lastLines() ?? [];
		expect(childLines.some(line => line.includes(CHILD.name))).toBe(false);
		expect(childLines.some(line => line.startsWith("Total:"))).toBe(true);

		// Returning to the main session restores the detail form's tree.
		bound.surface.sessionStarts(MAIN, "resume");
		expect(bound.runtime().presentation.of(targetOf(MAIN)).form).toBe("detail");
		expect((bound.surface.lastLines() ?? []).some(line => line.includes(MAIN.name))).toBe(true);
	});
});
