/**
 * The subagent runtime observation gap and this period's completeness, on pi (S1, S2, S3; contract
 * P26; ticket 16).
 *
 * What this suite drives is the *pi* realization of three rules, through the extension's production
 * pi assembly: the extension's real definition, the framework's real pi adapter, the runtime built
 * from the framework's validated configuration and the real frontend — all bound to a controlled pi
 * native surface, so the facts that move the accounting are the ones a pi process publishes (a
 * session's start with pi's own lineage link, its run-cycle edges with the abort fact pi states, and
 * the finalized assistant message that settles a request). The document every case reads is the file
 * the extension itself wrote under its own storage root; a second binding over that root is another
 * process reading the same bytes.
 *
 * The extension's own clock is the one fact a Round edge carries no instant of, so it is the suite's
 * own: a case states the instant each edge was observed at and every figure below is the arithmetic
 * of those instants — never a value the implementation derived, and never a host-stated duration or a
 * wall-clock span. The pricing data is this file's own as well, so an amount is a literal of the same
 * kind.
 *
 * The gaps these cases are about are observations, not figures: a figure the observer really measured
 * is a subtotal once an interval of the same period could not be measured, the subtotal is never
 * filled in from the wall clock, and the mark of an incomplete observation neither disappears when a
 * later activity is measured properly nor survives the period it was made in.
 */
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
import type { ConsumptionDocument, SessionRecord } from "../../extensions/model-cost/shared-logic/consumption-document";
import type { ModelPricingData } from "../../extensions/model-cost/shared-logic/model-data";
import { type ModelCostRuntime, createModelCostRuntime } from "../../extensions/model-cost/shared-logic/runtime";
import type { DisplayTarget } from "../../extensions/model-cost/shared-logic/presentation/display";
import { uiBoundaryTimerOf } from "./support/ui-timer";

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

/** One Beijing wall-clock reading on Wednesday 2026-10-14, as the epoch instant of this suite's timeline. */
function atBeijing(hours: number, minutes = 0, seconds = 0, ms = 0): number {
	return Date.UTC(2026, 9, 14, hours, minutes, seconds, ms) - BEIJING_OFFSET_MS;
}

/** The instant this suite's timeline starts at: 13:00 Beijing, between the data's two peak windows. */
const BASE = atBeijing(13, 0);

/**
 * The self-made pricing data every case drives: one monetary pair, both of whose peak windows the
 * timeline below stays out of.
 *
 * Off-peak is `input·2 + cacheRead·0.5 + output·8` per million tokens, and the peak multiplier is 3
 * across the two windows — neither of which covers 13:00, so every amount a case has to know is the
 * off-peak one.
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
	allowanceProviders: [],
	models: { deepseek: { "deepseek-flash": { mode: "monetary", tier: "flash" } } },
};

/** The provider and exact model every session of this suite runs: the pair the data above prices. */
const PROVIDER = "deepseek";
const MODEL = "deepseek-flash";

/** The usage one completing request reports, as pi's own finalized message carries it. */
const USAGE = { input: 2_000, cacheRead: 1_000, cacheWrite: 0, output: 500, totalTokens: 3_500 };

/** What that usage costs at the off-peak price: `(2_000·2 + 1_000·0.5 + 500·8) / 1e6`. */
const AMOUNT = 0.0085;

/** The document the extension keeps in its storage root, and the directory a period close archives into. */
const CONSUMPTION_FILE = "consumption.json";
const ARCHIVE_DIRECTORY = "archives";

/**
 * The repository root every binding resolves its configuration from, and the storage root that
 * configuration names. Both exist for the whole file because the framework reads an extension's
 * `config.yaml` once per process and the first binding's validated values are the ones later ones see;
 * each case starts from a storage root this file has emptied again.
 */
const STORAGE_ROOT = mkdtempSync(path.join(tmpdir(), "pi-runtime-gaps-store-"));
const REPOSITORY_ROOT = mkdtempSync(path.join(tmpdir(), "pi-runtime-gaps-repo-"));
const SESSION_FILES = mkdtempSync(path.join(tmpdir(), "pi-runtime-gaps-sessions-"));
const CONSUMPTION_FILE_PATH = path.join(STORAGE_ROOT, CONSUMPTION_FILE);
mkdirSync(path.join(REPOSITORY_ROOT, "extensions", MODEL_COST.id), { recursive: true });
writeFileSync(
	path.join(REPOSITORY_ROOT, "extensions", MODEL_COST.id, "config.yaml"),
	["storageDir: 'unused-by-this-suite'", "balanceTtlMs: 30000", "codexQuotaTtlMs: 15000", ""].join("\n"),
	"utf8",
);

/** One pi session file as pi writes it: the header is the first line, and its own `id` is the identity. */
function sessionFile(name: string, header: PiSessionHeader): string {
	const file = path.join(SESSION_FILES, name);
	writeFileSync(file, `${JSON.stringify(header)}\n`, "utf8");
	return file;
}

/** The file pi created for the main session of the tree these cases are current in. */
const MAIN_FILE = sessionFile("gap-main.jsonl", { type: "session", id: "pi-gap-main" });
/** The child's own file: it names the main session's file as its lineage link. */
const CHILD_FILE = sessionFile("gap-child.jsonl", { type: "session", id: "pi-gap-child", parentSession: MAIN_FILE });
/** The grandchild's file: its link reaches the main session through the child. */
const GRAND_FILE = sessionFile("gap-grand.jsonl", {
	type: "session",
	id: "pi-gap-grand",
	parentSession: CHILD_FILE,
});

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

/** The main session of the tree these cases are current in: a top-level session with no link of its own. */
const MAIN = {
	sessionId: "pi-gap-main",
	name: "pi 主会话",
	header: { type: "session", id: "pi-gap-main" },
	model: { id: MODEL, provider: PROVIDER },
	thinkingLevel: "high",
	idle: true,
	pending: false,
} satisfies PiSession;

/** The subagent the main session spawned: its direct parent is the main session. */
const CHILD = {
	sessionId: "pi-gap-child",
	name: "读一遍改动",
	header: { type: "session", id: "pi-gap-child", parentSession: MAIN_FILE },
	model: { id: MODEL, provider: PROVIDER },
	thinkingLevel: "medium",
	idle: true,
	pending: false,
} satisfies PiSession;

/** The subagent the child spawned: nested, still under the main session's own tree. */
const GRAND = {
	sessionId: "pi-gap-grand",
	name: "查一遍夹具",
	header: { type: "session", id: "pi-gap-grand", parentSession: CHILD_FILE },
	model: { id: MODEL, provider: PROVIDER },
	thinkingLevel: "low",
	idle: true,
	pending: false,
} satisfies PiSession;

/** The target the pi frontend reads for one session: the session's own identity and current pair. */
const MAIN_TARGET: DisplayTarget = {
	sessionId: MAIN.sessionId,
	provider: PROVIDER,
	model: MODEL,
	effort: "high",
};

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
	/** pi's run fully settled, with the abort fact it carries. */
	runSettles(session: PiSession, options?: { readonly aborted?: boolean }): void;
	/** A request about to be issued, as pi publishes it before the provider call. */
	requestStarts(session: PiSession): void;
	/** One finalized assistant message, which is what settles the request's Turn. */
	messageEnds(session: PiSession, message: PiAssistantMessage): void;
	/**
	 * One run initiation, as pi publishes it, awaited: the framework waits for the one-time
	 * initialization on this hook, so awaiting it is what makes the document loaded before a case
	 * drives an edge.
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
 * The parts are the ones the shipped assembly composes, and the only facts stated here that a real run
 * takes from its deployment are the storage root and the extension's own clock: the clock is the one
 * fact a Round edge has no instant of, so a case states it and every interval below is the arithmetic
 * of the instants it stated.
 */
function assemblePiSurface(clock: { at: number }): PiSurface {
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
		registerCommand(
			name: string,
			registration: { readonly handler: (args: string, ctx: PiExtensionContext) => Promise<void> },
		) {
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
		runSettles: (session, options = {}) =>
			void deliver("agent_settled", { type: "agent_settled", aborted: options.aborted ?? false }, session),
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
				now: () => clock.at,
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
function assistantMessage(
	usage: typeof USAGE | undefined = USAGE,
	overrides: Partial<PiAssistantMessage> = {},
): PiAssistantMessage {
	return {
		role: "assistant",
		stopReason: "stop",
		responseId: "resp-pi-gap",
		...(usage === undefined ? {} : { usage: { ...usage } }),
		...overrides,
	};
}

/**
 * One turn of the harness's own next task, and the file system behind it.
 *
 * pi's `nextTask` — where the framework arranges the Round's end re-check — is a zero-delay timer, and
 * this suite's timer queue is faked, so the re-check runs only when the queue is advanced. The step is
 * the interval the framework's own file coordination polls at (25 ms between attempts at a lock and
 * between turns of a document's queue), which is what a save waits on; the immediate turn after it is
 * real, and is what lets the bytes a save writes land.
 *
 * The extension's own clock is *not* this queue: every edge's instant is the one the case itself
 * placed in {@link Clock}, so no assertion below depends on when a re-check happened to run.
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

/** One session's record out of the document's own pi bucket. */
function piRecord(document: ConsumptionDocument, id: string): SessionRecord | undefined {
	return document.harnesses[MODEL_COST_HARNESS]?.sessions.find(record => record.id === id);
}

/** The files the extension's own storage root holds, relative and sorted; the lock directory is not one. */
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

/** The display name each session of this suite's tree answers with, as pi's own surface reports it. */
const DISPLAY_NAMES: Record<string, string> = {
	[MAIN.sessionId]: MAIN.name,
	[CHILD.sessionId]: CHILD.name,
	[GRAND.sessionId]: GRAND.name,
	"pi-gap-legacy": "旧会话",
};

/** The detail tree's own row for one descendant session, as the read-only display result carries it. */
function sessionRow(surface: PiSurface, sessionId: string) {
	const rows = surface.runtime.presentation.of(MAIN_TARGET).agentTree ?? [];
	return rows.filter(row => row.kind === "session" && row.name === DISPLAY_NAMES[sessionId]);
}

/** One record an earlier version wrote, as the approved schema stores it. */
function storedRecord(
	id: string,
	name: string,
	parent: string | null,
	facts: { readonly runtimeMs?: number; readonly runtimeGap?: true } = {},
): Record<string, unknown> {
	return {
		id,
		name,
		parent,
		saveVersion: 1,
		own: { [PROVIDER]: { [MODEL]: { tokens: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 } } } },
		...(facts.runtimeMs === undefined ? {} : { runtimeMs: facts.runtimeMs }),
		...(facts.runtimeGap === undefined ? {} : { runtimeGap: facts.runtimeGap }),
	};
}

/** One document an earlier version wrote, over this suite's own harvest of records. */
function oldDocument(sessions: readonly Record<string, unknown>[]): ConsumptionDocument {
	return {
		schemaVersion: 1,
		periodId: "period-pi-gaps",
		start: "2026-10-01T00:00:00.000Z",
		holiday: false,
		harnesses: { [MODEL_COST_HARNESS]: { sessions: [...sessions] } },
	} as unknown as ConsumptionDocument;
}

/** Empties the storage root a case is about to bind over, and every archive beside it. */
function clearStorageRoot(): void {
	for (const entry of [CONSUMPTION_FILE, "codex-usage-estimate.json", ARCHIVE_DIRECTORY]) {
		rmSync(path.join(STORAGE_ROOT, entry), { recursive: true, force: true });
	}
}

/**
 * One period action, issued until the entry accepts it.
 *
 * A snapshot this instance started may still be publishing when a case asks — the extension reports
 * that hold rather than queueing the action — so the invocation is repeated while the harness's own
 * next task turns the file work over, which is what an operator asking again a moment later does. The
 * answer a case reads is the one that really landed.
 */
async function resetWhenTheEntryAllows(surface: PiSurface, action: "clear" | "holiday", session: PiSession): Promise<void> {
	const before = surface.notices.length;
	for (let attempt = 0; attempt < 40; attempt += 1) {
		await surface.command(action, session);
		if (surface.notices.slice(before).some(notice => notice.level === "info")) return;
		// The hold the refusal names is the commit still on its way to the file: the case turns the
		// harness's own tasks over and asks again, which is what an operator retrying a moment later does.
		for (let turn = 0; turn < 50; turn += 1) await harnessTask();
	}
	throw new Error(`/budget ${action} was never accepted: ${JSON.stringify(surface.notices.slice(before))}`);
}

beforeEach(() => {
	// The timer queue the framework's own next task and file coordination run on; the extension's clock
	// is the case's own, injected through the runtime's own input.
	vi.useFakeTimers({ now: BASE });
	clearStorageRoot();
});

afterEach(() => {
	vi.useRealTimers();
	clearStorageRoot();
});

afterAll(() => {
	rmSync(STORAGE_ROOT, { recursive: true, force: true });
	rmSync(REPOSITORY_ROOT, { recursive: true, force: true });
	rmSync(SESSION_FILES, { recursive: true, force: true });
});

/** One bound surface over this suite's storage root, loaded through the framework's own initialization. */
async function startedSurface(
	clock: { at: number },
	options: { readonly childSessions?: boolean } = {},
): Promise<PiSurface> {
	const surface = assemblePiSurface(clock);
	surface.sessionStarts(MAIN, "startup");
	await surface.agentStarts(MAIN);
	// The main session's own first activity: its two edges are what tells this instance the session's
	// identity and position — the position a tree is drawn from — and it accrues no runtime of its own,
	// because a main session's Round is its own work and not a subagent's.
	surface.runStarts(MAIN);
	surface.runSettles(MAIN);
	await harnessTask();
	// The children's own starts, in the order a process that spawned them reports them. The frontend
	// draws for the session whose start it saw last, so a case that reads what the widget itself wrote
	// for the entry's own session states that the children have not started yet.
	if (options.childSessions !== false) {
		surface.sessionStarts(CHILD, "startup");
		surface.sessionStarts(GRAND, "startup");
	}
	return surface;
}

describe("an activity the harness's own edges measured settles its interval, whatever ended it (P26)", () => {
	test("a cancelled activity and a terminally failed one each add their own interval, and a main session carries none", async () => {
		const clock = { at: BASE };
		const surface = await startedSurface(clock);
		const { view } = surface.runtime;

		// The child's first activity: a request the user interrupted, whose finalized message states the
		// cancellation and reports the usage it really had, and a Round that ends 45 s after it began.
		clock.at = BASE;
		surface.runStarts(CHILD);
		surface.requestStarts(CHILD);
		surface.messageEnds(CHILD, assistantMessage(USAGE, { stopReason: "aborted", responseId: "resp-gap-1" }));
		clock.at = BASE + 45_000;
		surface.runSettles(CHILD, { aborted: true });
		await harnessTask();

		// The interval is the one this case's own instants state — 45 s — and it is already part of the
		// read-only result, before any commit: the activity ended, so its time is a contribution.
		expect(view.runtime(CHILD.sessionId)).toBe(45_000);

		// A second activity that terminally failed, with no request of its own: its interval is added too,
		// because an activity that really ran is measured whatever its outcome was.
		clock.at = BASE + 60_000;
		surface.runStarts(CHILD);
		clock.at = BASE + 90_000;
		surface.runSettles(CHILD, { aborted: false });
		await harnessTask();

		// The failed activity's own end is the second commit: the subtotal is 45 s + 30 s, and the
		// interrupted request's usage travelled with the first one.
		expect(view.runtime(CHILD.sessionId)).toBe(75_000);
		const document = await savedDocument(
			CONSUMPTION_FILE_PATH,
			held => piRecord(held, CHILD.sessionId)?.runtimeMs === 75_000,
		);
		const child = piRecord(document, CHILD.sessionId);
		expect(child?.runtimeMs).toBe(75_000);
		expect(child?.runtimeGap).toBeUndefined();
		expect(child?.own).toEqual({
			[PROVIDER]: { [MODEL]: { tokens: { input: USAGE.input, cacheRead: USAGE.cacheRead, cacheWrite: 0, output: USAGE.output }, costCny: AMOUNT } },
		});

		// The main session's own activity is its own work and not a subagent's: its Round ends here, its
		// own request is committed, and its record carries no runtime at all.
		clock.at = BASE + 120_000;
		surface.runStarts(MAIN);
		surface.requestStarts(MAIN);
		surface.messageEnds(MAIN, assistantMessage(USAGE, { responseId: "resp-gap-main" }));
		clock.at = BASE + 180_000;
		surface.runSettles(MAIN);
		await harnessTask();

		expect(view.runtime(MAIN.sessionId)).toBeUndefined();
		const withMain = await savedDocument(CONSUMPTION_FILE_PATH, held => piRecord(held, MAIN.sessionId) !== undefined);
		expect("runtimeMs" in (piRecord(withMain, MAIN.sessionId) as object)).toBe(false);

		// The display reads the same figure for the descendant row it draws, with the field's own place
		// kept: a figure this instance measured, not a duration anything stated.
		const rows = sessionRow(surface, CHILD.sessionId);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.runtimeMs).toBe(75_000);
	});

	test("a legal zero is a measurement, and a session nothing was measured for keeps no figure", async () => {
		const clock = { at: BASE };
		const surface = await startedSurface(clock);

		// An activity of the child whose edges this case places at one instant: it really ran for no
		// measurable time, which is a reading this observer made rather than a missing one.
		clock.at = BASE;
		surface.runStarts(CHILD);
		surface.runSettles(CHILD);
		await harnessTask();

		expect(surface.runtime.view.runtime(CHILD.sessionId)).toBe(0);
		const document = await savedDocument(CONSUMPTION_FILE_PATH, held => piRecord(held, CHILD.sessionId) !== undefined);
		// The document keeps the number the reading was, not a formatted duration and not an absence.
		expect(piRecord(document, CHILD.sessionId)?.runtimeMs).toBe(0);
		expect(/"runtimeMs"\s*:\s*0/.test(readFileSync(CONSUMPTION_FILE_PATH, "utf8"))).toBe(true);
		expect(sessionRow(surface, CHILD.sessionId)[0]?.runtimeMs).toBe(0);

		// The grandchild, whose own activity this case never observed, is the other fact: unavailable
		// rather than zero, in the read-only result and on the row the display keeps for it.
		expect(surface.runtime.view.runtime(GRAND.sessionId)).toBeUndefined();
		expect(sessionRow(surface, GRAND.sessionId)[0]?.runtimeMs).toBeUndefined();
		expect(piRecord(document, GRAND.sessionId)).toBeUndefined();
	});
});

describe("a missing end leaves the figure the subtotal it is, and no offline stretch is filled in (P26)", () => {
	test("an activity whose end never came adds nothing, and the next process reads the subtotal it left", async () => {
		const clock = { at: BASE };
		const surface = await startedSurface(clock);

		// One activity the process really measured, committed by its own Round end.
		clock.at = BASE;
		surface.runStarts(CHILD);
		clock.at = BASE + 45_000;
		surface.runSettles(CHILD);
		await harnessTask();
		const saved = await savedDocument(CONSUMPTION_FILE_PATH, held => piRecord(held, CHILD.sessionId)?.runtimeMs === 45_000);
		expect(piRecord(saved, CHILD.sessionId)?.runtimeMs).toBe(45_000);
		const bytes = readFileSync(CONSUMPTION_FILE_PATH, "utf8");

		// A second activity of the same session opens and never ends: the process is in the middle of it.
		// Nothing has settled, so nothing is added and nothing is written — the file is untouched.
		clock.at = BASE + 600_000;
		surface.runStarts(CHILD);
		await harnessTask();
		expect(readFileSync(CONSUMPTION_FILE_PATH, "utf8")).toBe(bytes);

		// The next process over the very same storage root: the document is what it can read, and the
		// interval that never ended is neither restored as consumption nor filled in from the wall clock.
		clock.at = BASE + 5_400_000;
		const restarted = await startedSurface(clock);
		expect(restarted.runtime.view.runtime(CHILD.sessionId)).toBe(45_000);
		expect(piRecord(readDocument(CONSUMPTION_FILE_PATH) as ConsumptionDocument, CHILD.sessionId)?.runtimeMs).toBe(45_000);
		expect(sessionRow(restarted, CHILD.sessionId)[0]?.runtimeMs).toBe(45_000);

		// The end that never arrived while the first process was alive is delivered to the new one: it is
		// a settle with no Round open in this process, so it ends nothing at all — the figure stays the
		// subtotal it was and the document is not written for time that ran before this process existed.
		restarted.runSettles(CHILD);
		await harnessTask();
		restarted.runSettles(CHILD);
		await harnessTask();
		expect(restarted.runtime.view.runtime(CHILD.sessionId)).toBe(45_000);
		expect(readFileSync(CONSUMPTION_FILE_PATH, "utf8")).toBe(bytes);
	});
});

describe("an interval the observer could not state is a known gap (P26)", () => {
	test("the gap keeps the subtotal, is reported to the operator, survives a later success and a restart", async () => {
		const clock = { at: BASE };
		const surface = await startedSurface(clock);
		const { view } = surface.runtime;

		// One measured activity first: 30 s this period really observed.
		clock.at = BASE;
		surface.runStarts(CHILD);
		clock.at = BASE + 30_000;
		surface.runSettles(CHILD);
		await harnessTask();
		await savedDocument(CONSUMPTION_FILE_PATH, held => piRecord(held, CHILD.sessionId)?.runtimeMs === 30_000);
		const bytes = readFileSync(CONSUMPTION_FILE_PATH, "utf8");

		// The next activity's end, at an instant the observer cannot state: no interval can be measured,
		// so nothing is added — the 30 s stands as the subtotal — and the operator is told which time
		// fact failed and that this period's observation of that session is now incomplete.
		clock.at = BASE + 60_000;
		surface.runStarts(CHILD);
		clock.at = Number.NaN;
		surface.runSettles(CHILD);
		await harnessTask();

		expect(view.runtime(CHILD.sessionId)).toBe(30_000);
		const reported = surface.notices.filter(notice => notice.message.includes("耗时"));
		expect(reported).toHaveLength(1);
		expect(reported[0]?.level).toBe("error");
		expect(reported[0]?.message).toContain("缺口");

		// A later activity that is measured perfectly adds its own interval and leaves the mark exactly
		// where it is: completeness is a fact about the period's observations, not about the last one.
		clock.at = BASE + 120_000;
		surface.runStarts(CHILD);
		clock.at = BASE + 140_000;
		surface.runSettles(CHILD);
		await harnessTask();

		expect(view.runtime(CHILD.sessionId)).toBe(50_000);
		const document = await savedDocument(
			CONSUMPTION_FILE_PATH,
			held => piRecord(held, CHILD.sessionId)?.runtimeMs === 50_000,
		);
		expect(piRecord(document, CHILD.sessionId)?.runtimeGap).toBe(true);
		expect(piRecord(document, CHILD.sessionId)?.runtimeMs).toBe(50_000);
		// The grandchild this instance observed nothing unmeasurable for carries no mark at all: an absent
		// mark is the absence of an observed gap, never a claim that a history was complete.
		expect(piRecord(document, GRAND.sessionId)?.runtimeGap).toBeUndefined();

		// A restart reads the figure and the mark back, and a further measured activity adds to both the
		// figure and nothing else: the mark a later process carries is the one the record already has.
		clock.at = BASE + 3_600_000;
		const restarted = await startedSurface(clock);
		expect(restarted.runtime.view.runtime(CHILD.sessionId)).toBe(50_000);
		clock.at = BASE + 3_660_000;
		restarted.runStarts(CHILD);
		clock.at = BASE + 3_680_000;
		restarted.runSettles(CHILD);
		await harnessTask();
		const after = await savedDocument(
			CONSUMPTION_FILE_PATH,
			held => piRecord(held, CHILD.sessionId)?.runtimeMs === 70_000,
		);
		expect(piRecord(after, CHILD.sessionId)?.runtimeMs).toBe(70_000);
		expect(piRecord(after, CHILD.sessionId)?.runtimeGap).toBe(true);
		// The file the earlier process left is not the file this one holds: the figure grew by this
		// process's own interval and by nothing else.
		expect(readFileSync(CONSUMPTION_FILE_PATH, "utf8")).not.toBe(bytes);
	});
});

describe("an old document is carried on rather than judged incomplete (P26)", () => {
	test("a value, a legal zero, no value and a known mark each keep exactly what the record held", async () => {
		// The document an earlier version wrote: one record carrying 480000 ms and a known gap, one whose
		// host really reported zero, one that carries no value at all, and the main session's own record.
		writeFileSync(
			CONSUMPTION_FILE_PATH,
			JSON.stringify(
				oldDocument([
					storedRecord(MAIN.sessionId, MAIN.name, null),
					storedRecord(CHILD.sessionId, CHILD.name, MAIN.sessionId, { runtimeMs: 480_000, runtimeGap: true }),
					storedRecord(GRAND.sessionId, GRAND.name, CHILD.sessionId, { runtimeMs: 0 }),
					storedRecord("pi-gap-legacy", "旧会话", MAIN.sessionId),
				]),
			),
			"utf8",
		);
		const clock = { at: BASE };
		const surface = await startedSurface(clock, { childSessions: false });
		const { view } = surface.runtime;

		// Reading: the document is this extension's own format, so the instance is not paused, and each
		// session's own value is exactly what it carried — the mark the record holds is not a fault, and
		// the absence of one is a reading of nothing rather than a claim about the history.
		expect(surface.runtime.storage.pauseReason()).toBeUndefined();
		expect(view.runtime(CHILD.sessionId)).toBe(480_000);
		expect(view.runtime(GRAND.sessionId)).toBe(0);
		expect(view.runtime("pi-gap-legacy")).toBeUndefined();
		expect(surface.notices).toEqual([]);

		// The display rows keep the three facts apart: the figure, the legal zero and the absent one.
		expect(sessionRow(surface, CHILD.sessionId)[0]?.runtimeMs).toBe(480_000);
		expect(sessionRow(surface, GRAND.sessionId)[0]?.runtimeMs).toBe(0);

		// An activity this instance measured adds its own 20 s to the figure the record carried, and the
		// mark the record already named is still there afterwards.
		clock.at = BASE;
		surface.runStarts(CHILD);
		clock.at = BASE + 20_000;
		surface.runSettles(CHILD);
		await harnessTask();
		const updated = await savedDocument(
			CONSUMPTION_FILE_PATH,
			held => piRecord(held, CHILD.sessionId)?.runtimeMs === 500_000,
		);
		expect(piRecord(updated, CHILD.sessionId)?.runtimeGap).toBe(true);
		// The records this instance observed nothing for are the very records the document held: the legal
		// zero stays a zero rather than becoming an absence, and the record with no value gains neither a
		// figure nor a mark.
		expect(piRecord(updated, GRAND.sessionId)?.runtimeMs).toBe(0);
		expect(piRecord(updated, GRAND.sessionId)?.runtimeGap).toBeUndefined();
		expect(piRecord(updated, "pi-gap-legacy")?.runtimeMs).toBeUndefined();
		expect(piRecord(updated, "pi-gap-legacy")?.runtimeGap).toBeUndefined();

		// The frontend draws the same three facts on the rows it is handed, each with the field's own
		// place: a figure, a measured zero, and the dash an unavailable reading is written as.
		await surface.command("detail", MAIN);
		const lines = surface.lastLines();
		expect(lines).toBeDefined();
		const drawn = (lines ?? []).filter(line => line.includes("Run:"));
		expect(drawn.some(line => line.includes("Run: 8m"))).toBe(true);
		expect(drawn.some(line => line.includes("Run: 0ms"))).toBe(true);
		expect(drawn.some(line => line.includes("Run: —"))).toBe(true);

		// A new process over the same storage root reads the same four facts back.
		const restarted = await startedSurface({ at: BASE + 3_600_000 });
		expect(restarted.runtime.view.runtime(CHILD.sessionId)).toBe(500_000);
		expect(restarted.runtime.view.runtime(GRAND.sessionId)).toBe(0);
		expect(restarted.runtime.view.runtime("pi-gap-legacy")).toBeUndefined();
		expect(restarted.runtime.storage.pauseReason()).toBeUndefined();
	});
});

describe("a reset starts a fresh accumulation, and the closed period's work never reaches it (P26)", () => {
	test("clear drops the subtotal and its mark, takes the open activity with it, and measures the next period from nothing", async () => {
		const clock = { at: BASE };
		const surface = await startedSurface(clock);
		const { view } = surface.runtime;

		// A subtotal this period really observed, and then an interval it could not measure: the record
		// carries 45 s and the mark of that gap.
		clock.at = BASE;
		surface.runStarts(CHILD);
		clock.at = BASE + 45_000;
		surface.runSettles(CHILD);
		await harnessTask();
		clock.at = BASE + 60_000;
		surface.runStarts(CHILD);
		clock.at = Number.NaN;
		surface.runSettles(CHILD);
		await harnessTask();
		const before = await savedDocument(
			CONSUMPTION_FILE_PATH,
			held => piRecord(held, CHILD.sessionId)?.runtimeGap === true,
		);
		expect(piRecord(before, CHILD.sessionId)?.runtimeMs).toBe(45_000);
		const closedPeriod = before.periodId;
		// The commit that carried the mark has to be off this instance's hands before a reset asks
		// whether one of its own snapshots is still publishing.
		await harnessTask();
		await harnessTask();

		// A third activity is open when the period is closed: the reset takes the period's own work with
		// it, so that end belongs to the generation that is gone.
		clock.at = BASE + 120_000;
		surface.runStarts(CHILD);

		// The entry is its own DeepSeek one and reliably idle, so `/budget clear` closes the period: the
		// whole document is archived first and the new one holds no session at all.
		expect(MAIN.idle).toBe(true);
		await resetWhenTheEntryAllows(surface, "clear", MAIN);
		expect(surface.notices.some(notice => notice.level === "info" && notice.message.includes("已归档"))).toBe(true);
		const opened = await savedDocument(CONSUMPTION_FILE_PATH, held => held.periodId !== closedPeriod);
		expect(opened.periodId).not.toBe(closedPeriod);
		expect(opened.harnesses[MODEL_COST_HARNESS]?.sessions ?? []).toEqual([]);
		// What the closed period held went into the archive with it: the figure and the mark are that
		// period's own record, not the new period's.
		const archived = JSON.parse(
			readFileSync(path.join(STORAGE_ROOT, ARCHIVE_DIRECTORY, readdirSync(path.join(STORAGE_ROOT, ARCHIVE_DIRECTORY))[0] as string), "utf8"),
		) as ConsumptionDocument;
		expect(archived.periodId).toBe(closedPeriod);
		expect(piRecord(archived, CHILD.sessionId)?.runtimeMs).toBe(45_000);
		expect(piRecord(archived, CHILD.sessionId)?.runtimeGap).toBe(true);

		// The new period knows nothing about that session's time yet: its own accumulation begins with the
		// next activity this instance observes and with no part of the figure or the mark above.
		expect(view.runtime(CHILD.sessionId)).toBeUndefined();
		expect(sessionRow(surface, CHILD.sessionId)[0]?.runtimeMs).toBeUndefined();
		const openedBytes = readFileSync(CONSUMPTION_FILE_PATH, "utf8");

		// The end of the activity that was open across the reset arrives now: it is work of the closed
		// period, so it contributes nothing to the new one — and it is no gap in the new period's own
		// observation either. Nothing is written for it.
		clock.at = BASE + 180_000;
		surface.runSettles(CHILD);
		await harnessTask();
		expect(view.runtime(CHILD.sessionId)).toBeUndefined();
		expect(readFileSync(CONSUMPTION_FILE_PATH, "utf8")).toBe(openedBytes);

		// A genuinely new activity of the new period is measured from nothing: its own 15 s is the whole
		// figure, it carries no mark of a period it was not observed in, and it is the first version of
		// that session's record in this period.
		clock.at = BASE + 240_000;
		surface.runStarts(CHILD);
		clock.at = BASE + 255_000;
		surface.runSettles(CHILD);
		await harnessTask();
		expect(view.runtime(CHILD.sessionId)).toBe(15_000);
		const fresh = await savedDocument(
			CONSUMPTION_FILE_PATH,
			held => piRecord(held, CHILD.sessionId)?.runtimeMs === 15_000,
		);
		expect(piRecord(fresh, CHILD.sessionId)?.saveVersion).toBe(1);
		expect(piRecord(fresh, CHILD.sessionId)?.runtimeGap).toBeUndefined();
		expect(fresh.periodId).toBe(opened.periodId);
	});

	test("the first holiday opens its own period, whose first activity starts the figure again", async () => {
		const clock = { at: BASE };
		const surface = await startedSurface(clock);

		// A figure and a mark of the ordinary period this entry started in.
		clock.at = BASE;
		surface.runStarts(CHILD);
		clock.at = BASE + 20_000;
		surface.runSettles(CHILD);
		await harnessTask();
		clock.at = BASE + 30_000;
		surface.runStarts(CHILD);
		clock.at = Number.NaN;
		surface.runSettles(CHILD);
		await harnessTask();
		const before = await savedDocument(CONSUMPTION_FILE_PATH, held => piRecord(held, CHILD.sessionId)?.runtimeGap === true);
		expect(piRecord(before, CHILD.sessionId)?.runtimeMs).toBe(20_000);
		expect(before.holiday).toBe(false);

		// The reset itself is an instant: the clock the unmeasurable interval left unusable is a valid
		// reading again before the period it closes is asked about.
		clock.at = BASE + 60_000;
		await resetWhenTheEntryAllows(surface, "holiday", MAIN);

		// The new period is a holiday one and holds no session: what the closed period observed is the
		// archive's, not this period's opening balance of time.
		const opened = await savedDocument(CONSUMPTION_FILE_PATH, held => held.holiday);
		expect(opened.periodId).not.toBe(before.periodId);
		expect(opened.holiday).toBe(true);
		expect(opened.harnesses[MODEL_COST_HARNESS]?.sessions ?? []).toEqual([]);

		// The first activity of the holiday period is measured on its own, with no part of the figure or
		// the mark the closed period carried.
		clock.at = BASE + 120_000;
		surface.runStarts(CHILD);
		clock.at = BASE + 130_000;
		surface.runSettles(CHILD);
		await harnessTask();
		const fresh = await savedDocument(
			CONSUMPTION_FILE_PATH,
			held => piRecord(held, CHILD.sessionId)?.runtimeMs === 10_000,
		);
		expect(piRecord(fresh, CHILD.sessionId)?.runtimeGap).toBeUndefined();
		expect(piRecord(fresh, CHILD.sessionId)?.saveVersion).toBe(1);
		// No other document appeared beside the one activity document and its archive: a gap is carried by
		// the session's own record and needs no store of its own.
		expect(rootFiles(STORAGE_ROOT)).toEqual([`${ARCHIVE_DIRECTORY}/${readdirSync(path.join(STORAGE_ROOT, ARCHIVE_DIRECTORY))[0] as string}`, CONSUMPTION_FILE]);
	});
});
