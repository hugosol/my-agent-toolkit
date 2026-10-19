/**
 * The widget's approved visual, as the OMP frontend draws it (P67; S2, S5).
 *
 * The seam under test is production: the extension's real definition is bound through the framework's
 * public binding (the port double), the runtime is the one `createModelCostRuntime` builds over a
 * controlled clock and a self-made price list, and what a case reads is what the operator's own
 * terminal is handed — the production `attachModelCostWidget`, driven through a *controlled host*
 * standing in for the interactive one.
 *
 * What this suite adds to the widget's other suites is the half only a terminal owns, which no
 * text-level assertion can reach:
 *
 * - **The component form.** The interactive CLI draws what the frontend hands it, at the host's own
 *   width and with the host's own theme (`modes/controllers/extension-ui-controller.ts` calls the
 *   factory it is handed with its own ui and theme). The controlled host below therefore hands a
 *   recording theme and asks the component for its lines at one width, so a case reads the exact theme
 *   token each piece was drawn with and the exact form the line takes at that width.
 * - **The text form.** The headless host takes plain lines, so the same display result must reach it
 *   with no colour token and no escape sequence anywhere.
 *
 * Every expected value below comes from outside the code under test: the band boundaries, the warning
 * thresholds, the eighth-block and whole-block rules, the palette order and the four-step width
 * fallback are the ones the frozen old implementation states (`my-omp-toolkit@fd3b507`,
 * `extensions/model-cost/{index,segment-bar,chatgpt-usage}.ts`, read only and licence-checked before
 * use), the wording and scope are the specification's own (spec §134, §135, §192), and every figure is
 * arithmetic on this file's own clock, budget and fixture amounts.
 *
 * The theme token names are the reviewable fact: the frontend maps a described emphasis onto the
 * host's own theme, so a token is what must not drift, not a colour this repository cannot state.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { setImmediate as immediate } from "node:timers/promises";
import type { OmpExtensionApi, OmpSessionContext } from "../../../adapters/omp";
import { MODEL_COST } from "../../../extensions/model-cost/definition";
import type { WidgetDrawing, WidgetTheme } from "../../../extensions/model-cost/harnesses/omp/widget";
import { MODEL_COST_WIDGET_KEY, attachModelCostWidget } from "../../../extensions/model-cost/harnesses/omp/widget";
import { CODEX_USAGE_URL } from "../../../extensions/model-cost/shared-logic/business/allowance/codex-quota";
import type { ConsumptionDocument } from "../../../extensions/model-cost/shared-logic/foundation/session/consumption-document";
import type { ModelPricingData } from "../../../extensions/model-cost/shared-logic/business/pricing/model-data";
import { type ModelCostRuntime, createModelCostRuntime } from "../../../extensions/model-cost/shared-logic/runtime";
import type { ProviderAccess, ProviderAccessFacts } from "../../../framework/interface/host-facts";
import type { SessionFacts, TurnOutcome } from "../../../framework/interface/session";
import type { OwnerReference } from "../../../framework/interface/state";
import type { TurnSignal } from "../../../framework/runtime/port";
import type { HttpRequestOptions } from "../../../framework/interface/general/http";
import { type PortDouble, portDouble } from "../../framework/support/harness-port-double";
import { testSessionCapability } from "../support/session-capability";
import { uiBoundaryTimerOf } from "../support/ui-timer";

/** The self-made price list: a monetary pair, a token-only pair and the allowance channel's provider. */
const DATA: ModelPricingData = {
	currency: "XTS",
	unit: "XTS per million tokens",
	peakMultiplier: 3,
	zoneOffsetMinutes: 8 * 60,
	peakWindows: [{ fromMinute: 9 * 60, toMinute: 12 * 60 }],
	tiers: { alpha: { input: 2, cacheRead: 0.5, output: 8 } },
	allowanceProviders: ["openai-codex"],
	models: {
		deepseek: { "deepseek-flash": { mode: "monetary", tier: "alpha" } },
		"go-provider": { "model-alpha": { mode: "token-only" } },
	},
};

const HARNESS = "probe-harness";
const DEEPSEEK = "deepseek";
const CODEX = "openai-codex";
const MAIN: SessionFacts = { sessionId: "session-main", kind: "main", name: "主会话", unavailable: [] };
const OWNER: OwnerReference = { kind: "owner", key: "main:widget-visual" };
const CONSUMPTION_FILE = "consumption.json";

/** The instant every case reads at unless it states its own: 11:00 in the data's own zone, peak. */
const PEAK_AT = Date.parse("2026-10-01T03:00:00.000Z");
/** The same day's 13:00 in the data's zone: outside the fixture's midday window, so off-peak. */
const OFF_PEAK_AT = Date.parse("2026-10-01T05:00:00.000Z");

/** The fixed display budget of the monetary channel, every percentage below a share of it. */
const DEEPSEEK_BUDGET = 450_000;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** The twenty empty cells the fixed-budget bar shows at no usage: its own fixed width. */
const EMPTY_BAR = "\u2591".repeat(20);

/** The repository root, from this file's own location, for the child processes below. */
const REPOSITORY_ROOT = path.resolve(import.meta.dir, "..", "..", "..");
/** The production assembly whose own host reading selects the drawing form. */
const ASSEMBLY = path.join(REPOSITORY_ROOT, "extensions", "model-cost", "harnesses", "omp.ts");

/** Every root this file created, removed after each case. */
const roots: string[] = [];

/** What the controlled host publishes about the session it is displaying. */
interface ViewedFacts {
	readonly sessionId?: string;
	readonly provider?: string;
	readonly model?: string;
	readonly effort?: string;
	readonly context?: { readonly tokens?: number; readonly contextWindow?: number };
}

/** One colour the frontend asked its host's theme for, as the theme recorded it. */
interface Paint {
	readonly color: string;
	readonly text: string;
}

/** One draw of the widget at one width, as the host's own theme painted it. */
interface Draw {
	/** The lines the host was handed, at that width. */
	readonly lines: readonly string[];
	/** Every themed piece of those lines, in the order they were drawn. */
	readonly painted: readonly Paint[];
	/** Every thinking level an effort value was drawn by, in the order they were asked for. */
	readonly levels: readonly string[];
}

/** One widget frame a controlled session was handed; a cleared widget carries no content. */
interface DrawnFrame {
	readonly key: string;
	readonly content: unknown;
}

/** One controlled host session: what it publishes, what it was handed and how it draws it. */
interface VisualHost {
	readonly ctx: OmpSessionContext;
	publish(facts: ViewedFacts): void;
	/** The content of the last frame for the usage widget: a factory, lines, or nothing when cleared. */
	lastContent(): unknown;
	/** How many frames this host was handed, clears included. */
	frames(): number;
	/** One draw at one width, through this host's own fresh theme. */
	draw(width: number): Draw;
	/** The plain lines the host was handed, for a host that draws text rather than a component. */
	plain(): readonly string[] | undefined;
}

/** The last element of a list, or nothing when there is no list and when it is empty. */
function last<T>(items: readonly T[] | undefined): T | undefined {
	return items === undefined ? undefined : items[items.length - 1];
}

/** The theme a drawing host hands the frontend: every colour it is asked for is recorded, not created. */
function recordingTheme(): { readonly theme: WidgetTheme; readonly painted: Paint[]; readonly levels: string[] } {
	const painted: Paint[] = [];
	const levels: string[] = [];
	return {
		painted,
		levels,
		theme: {
			fg: (color, text) => {
				painted.push({ color, text });
				return `\u00AB${color}:${text}\u00BB`;
			},
			getThinkingBorderColor: level => text => {
				levels.push(level);
				return `\u00ABeffort:${level}:${text}\u00BB`;
			},
		},
	};
}

/**
 * A controlled host session, drawing what the frontend hands it however `drawing` says the CLI does.
 *
 * The managed timer surface is present and quiet: this suite drives the drawing, and the UI's one
 * boundary wait has a suite of its own.
 */
function controlledHost(options: {
	readonly boundSessionId: string;
	readonly boundModel: { readonly provider: string; readonly id: string };
	readonly initial: ViewedFacts;
	readonly drawing: WidgetDrawing;
	readonly hasUI?: boolean;
}): VisualHost {
	let facts = options.initial;
	const listeners = new Set<(facts: ViewedFacts) => void>();
	const drawn: DrawnFrame[] = [];
	const ctx = {
		agent: { kind: "main", id: "Main" },
		hasUI: options.hasUI ?? true,
		ui: {
			notify: () => {},
			setWidget: (key: string, content: unknown): void => {
				drawn.push({ key, content });
			},
		},
		sessionManager: { getSessionId: () => options.boundSessionId, getBranch: () => [] },
		model: options.boundModel,
		getViewedSession: () => facts,
		subscribeViewedSessionChanged: (listener: (facts: ViewedFacts) => void): (() => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		setTimeout: () => undefined,
		clearTimer: () => {},
	} as unknown as OmpSessionContext;
	const lastFrame = (): DrawnFrame | undefined => last(drawn.filter(frame => frame.key === MODEL_COST_WIDGET_KEY));
	return {
		ctx,
		publish(next) {
			facts = next;
			for (const listener of [...listeners]) listener(next);
		},
		lastContent: () => lastFrame()?.content,
		frames: () => drawn.length,
		draw(width) {
			const content = lastFrame()?.content;
			if (typeof content !== "function") {
				throw new Error(`this host draws components, and the frontend handed it ${describeContent(content)}`);
			}
			const capture = recordingTheme();
			const component = (content as (tui: unknown, theme: WidgetTheme) => { render(width: number): string[] })(
				undefined,
				capture.theme,
			);
			return { lines: component.render(width), painted: capture.painted, levels: capture.levels };
		},
		plain() {
			const content = lastFrame()?.content;
			if (content === undefined) return undefined;
			if (!Array.isArray(content)) throw new Error("this host draws text, and the frontend handed it a component");
			return content as string[];
		},
	};
}

/** What one hand-over was, for the failure message above. */
function describeContent(content: unknown): string {
	if (content === undefined) return "nothing";
	if (Array.isArray(content)) return "lines";
	return "a component";
}

/** A controlled extension API: it records the handlers the frontend registers. */
function controlApi(): { readonly api: OmpExtensionApi; fire(event: string, ctx: OmpSessionContext): void } {
	const handlers = new Map<string, Array<(event: unknown, ctx: OmpSessionContext) => void>>();
	return {
		api: {
			on(event: string, handler: (event: unknown, ctx: OmpSessionContext) => void): void {
				const existing = handlers.get(event) ?? [];
				existing.push(handler);
				handlers.set(event, existing);
			},
			pi: undefined,
		} as unknown as OmpExtensionApi,
		fire(event, ctx) {
			for (const handler of handlers.get(event) ?? []) handler({ type: event }, ctx);
		},
	};
}

/** One document the extension loads: one session per amount, the first being the viewed main session. */
function documentWith(input: {
	readonly costs: readonly number[];
	readonly holiday?: boolean;
	readonly provider?: string;
	readonly model?: string;
}): ConsumptionDocument {
	const provider = input.provider ?? DEEPSEEK;
	const model = input.model ?? "deepseek-flash";
	return {
		schemaVersion: 1,
		periodId: "period-widget-visual",
		start: "2026-10-01T00:00:00.000Z",
		holiday: input.holiday ?? false,
		harnesses: {
			[HARNESS]: {
				sessions: input.costs.map((costCny, index) => ({
					id: index === 0 ? "session-main" : `session-${index}`,
					name: index === 0 ? "主会话" : `会话 ${index}`,
					parent: index === 0 ? null : "session-main",
					saveVersion: 1,
					own: { [provider]: { [model]: { tokens: { input: 10, cacheRead: 10, cacheWrite: 0, output: 10 }, costCny } } },
				})),
			},
		},
	} as unknown as ConsumptionDocument;
}

/** The balance the provider returns, in its documented shape, as one JSON response. */
function balanceAnswer(total: string): Response {
	return new Response(JSON.stringify({ is_available: true, balance_infos: [{ currency: "CNY", total_balance: total }] }), {
		status: 200,
		headers: { "content-type": "application/json" },
	});
}

/** One bound instance and everything a case drives and observes it through. */
interface BoundVisual {
	readonly runtime: ModelCostRuntime;
	readonly host: VisualHost;
	readonly double: PortDouble;
	readonly clock: { now: number };
	/** Every HTTP call this instance made, in call order. */
	readonly sent: { readonly url: string; readonly options: HttpRequestOptions | undefined }[];
}

/**
 * One instance over a fresh isolated root, bound through the framework's public binding and attached
 * to a controlled host, with the harness's provider access and HTTP call substituted so nothing here
 * reaches a service.
 *
 * Provider access is resolved for the balance's own provider only, and only where a case states a
 * balance at all: a case that states none asks no provider about anything. The Codex account API is
 * asked only by a case that resolves that provider's access, and every answer it gives is the one
 * its `codexAnswer` states — the windows the Codex cases below read therefore arrive from the
 * account API's own document rather than from any response header.
 */
async function bindVisual(
	options: {
		readonly costs?: readonly number[];
		readonly holiday?: boolean;
		readonly provider?: string;
		readonly model?: string;
		readonly viewed?: ViewedFacts;
		readonly drawing?: WidgetDrawing;
		readonly balanceTotal?: string;
		readonly codex?: boolean;
		readonly codexAnswer?: () => Response;
		readonly hasUI?: boolean;
		readonly at?: number;
	} = {},
): Promise<BoundVisual> {
	const root = mkdtempSync(path.join(tmpdir(), "model-cost-widget-visual-"));
	roots.push(root);
	writeFileSync(
		path.join(root, CONSUMPTION_FILE),
		JSON.stringify(
			documentWith({
				costs: options.costs ?? [0.05],
				...(options.holiday === undefined ? {} : { holiday: options.holiday }),
				...(options.provider === undefined ? {} : { provider: options.provider }),
				...(options.model === undefined ? {} : { model: options.model }),
			}),
		),
		"utf8",
	);
	const clock = { now: options.at ?? PEAK_AT };
	const sent: { readonly url: string; readonly options: HttpRequestOptions | undefined }[] = [];
	/** The inference base URL the harness resolves for the Codex provider: no case here sends to it. */
	const codexAddress = "https://host.example/codex";
	const access: ProviderAccess = {
		resolve: async (provider: string): Promise<ProviderAccessFacts | undefined> => {
			if (provider === DEEPSEEK && options.balanceTotal !== undefined) {
				return { baseUrl: "https://host.example/v1", credential: "key-one" };
			}
			return provider === CODEX && options.codex === true
				? { baseUrl: codexAddress, credential: "codex-token" }
				: undefined;
		},
	};
	const runtime = createModelCostRuntime({
		config: { storageDir: root, balanceTtlMs: 30_000 },
		configDirectory: root,
		userHomeDirectory: root,
		harness: HARNESS,
		data: DATA,
		session: testSessionCapability(),
		providerAccess: access,
		now: () => clock.now,
		httpRequest: async (url, httpOptions) => {
			sent.push({ url, options: httpOptions });
			// The one account API query answers the document a case staged, and no window at all until
			// one is: the Codex windows below arrive the way they do at runtime, from this answer alone.
			if (url === CODEX_USAGE_URL) {
				return options.codexAnswer?.() ?? usageAnswer({});
			}
			return balanceAnswer(options.balanceTotal ?? "0.00");
		},
	});
	const double = portDouble();
	double.bind(MODEL_COST, {
		factory: () => runtime.implementation,
		config: { reader: () => `storageDir: ${root}\nbalanceTtlMs: 30000\ncodexQuotaTtlMs: 15000\n` },
	});
	double.deliverSession(OWNER, { session: MAIN });
	await double.initiateRun(OWNER);
	const drawing = options.drawing ?? "component";
	const host = controlledHost({
		boundSessionId: "session-main",
		boundModel: { provider: options.provider ?? DEEPSEEK, id: options.model ?? "deepseek-flash" },
		initial: options.viewed ?? {
			sessionId: "session-main",
			provider: options.provider ?? DEEPSEEK,
			model: options.model ?? "deepseek-flash",
			effort: "high",
			context: { tokens: 1_000, contextWindow: 1_000_000 },
		},
		drawing,
		...(options.hasUI === undefined ? {} : { hasUI: options.hasUI }),
	});
	const { api, fire } = controlApi();
	attachModelCostWidget(api, runtime, uiBoundaryTimerOf(runtime), drawing);
	fire("session_start", host.ctx);
	return { runtime, host, double, clock, sent };
}

/** One window as the account API's document states it: seconds for the length and the reset instant. */
interface UsageWindow {
	readonly usedPercent: number;
	readonly seconds: number;
	readonly resetAt?: number;
}

/** The windows one account API answer states, each under the position the document gave it. */
interface UsageWindows {
	readonly primary?: UsageWindow;
	readonly secondary?: UsageWindow;
}

/**
 * One account API answer, in the provider's own document shape, as one JSON response.
 *
 * The windows are stated in seconds, which is the unit the backend reports them in, so each case's
 * expectation is a hand-computed epoch-millisecond instant. A reset a case omits is a document that
 * stated none, which is a window whose reset is unknown rather than a window at zero.
 */
function usageAnswer(windows: UsageWindows): Response {
	const windowOf = (window: UsageWindow): Record<string, unknown> => ({
		used_percent: window.usedPercent,
		limit_window_seconds: window.seconds,
		...(window.resetAt === undefined ? {} : { reset_at: window.resetAt }),
	});
	return new Response(
		JSON.stringify({
			plan_type: "pro",
			rate_limit: {
				...(windows.primary === undefined ? {} : { primary_window: windowOf(windows.primary) }),
				...(windows.secondary === undefined ? {} : { secondary_window: windowOf(windows.secondary) }),
			},
		}),
		{ status: 200, headers: { "content-type": "application/json" } },
	);
}

/**
 * One whole Codex exchange: its start facts, its response — whose rate-limit headers this extension
 * no longer reads, so it carries none — and its settled response. The answer the report's windows
 * come from was staged as the next account API answer; the query the settled Turn starts is awaited
 * by the `drain` that follows it.
 */
function reportCodex(bound: BoundVisual): void {
	const session: SessionFacts = { sessionId: "session-codex", kind: "main", unavailable: [] };
	bound.double.deliverTurn(
		{ kind: "request_started", session, at: bound.clock.now, provider: CODEX, model: "gpt-6-luna" } as TurnSignal,
		{ owner: OWNER },
	);
	bound.double.deliverTurn({ kind: "response_received", session, http: { status: 200, headers: {} } } as TurnSignal, {
		owner: OWNER,
	});
	bound.double.deliverTurn(
		{ kind: "response_settled", session, at: bound.clock.now + 1_000, outcome: "completed" as TurnOutcome, readings: [] } as TurnSignal,
		{ owner: OWNER },
	);
}

/** Let the query one settled report began settle: it awaits the host's facts, the answer and its body. */
const drain = (): Promise<void> => immediate();

/** The instant a line's own absolute reset text names, parsed back on this machine's clock. */
function absoluteInstantOf(text: string, year: number): number | undefined {
	const shown = /\((\d{2})\/(\d{2}) (\d{2}):(\d{2})\)$/.exec(text);
	if (shown === null) return undefined;
	const [, month, day, hours, minutes] = shown;
	return new Date(`${year}-${month}-${day}T${hours}:${minutes}`).getTime();
}

/** The drawing form one CLI's own assembly selects, read by loading that assembly in a child process. */
function drawingInChild(tty: boolean): string {
	// A child is the only place this can be read: the form is the assembly's own reading of *its*
	// process's stdout, and a test runner's stdout is never the terminal under test. The script is a
	// file rather than an `-e` argument, because this platform's own shell shim rejects the characters
	// a JavaScript argument is made of.
	const root = mkdtempSync(path.join(tmpdir(), "model-cost-widget-drawing-"));
	roots.push(root);
	const script = path.join(root, "drawing.ts");
	writeFileSync(
		script,
		`Object.defineProperty(process.stdout, "isTTY", { value: ${String(tty)}, configurable: true });\n` +
			`const assembly = await import(${JSON.stringify(ASSEMBLY)});\n` +
			`process.stdout.write(assembly.MODEL_COST_WIDGET_DRAWING);\n`,
		"utf8",
	);
	const child = Bun.spawnSync(["bun", script], { cwd: REPOSITORY_ROOT, stdout: "pipe", stderr: "pipe" });
	if (child.exitCode !== 0) throw new Error(`the assembly could not be loaded: ${child.stderr.toString()}`);
	return child.stdout.toString();
}

/** The main session's own facts, as the monetary cases publish them. */
function mainFacts(): ViewedFacts {
	return {
		sessionId: "session-main",
		provider: DEEPSEEK,
		model: "deepseek-flash",
		effort: "high",
		context: { tokens: 1_000, contextWindow: 1_000_000 },
	};
}

/** The facts a Codex target is viewed through: the allowance pair, with the host's own context. */
function codexFacts(): ViewedFacts {
	return { ...codexWindowFacts(), context: { tokens: 1_000, contextWindow: 1_000_000 } };
}

/**
 * The same allowance pair with no context reading reported: the budget line is then not drawn at all,
 * which is what leaves the window lines the ones a case reads on their own.
 */
function codexWindowFacts(): ViewedFacts {
	return { sessionId: "session-main", provider: CODEX, model: "gpt-6-luna", effort: "high" };
}

afterEach(() => {
	while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true });
});

describe("the host's own drawing form decides what the frontend hands it (P67)", () => {
	test("an interactive CLI is handed a component, and a headless one plain lines", () => {
		expect(drawingInChild(true)).toBe("component");
		expect(drawingInChild(false)).toBe("lines");
	});

	test("the component is drawn with the host's theme and at the host's width", async () => {
		const bound = await bindVisual({ drawing: "component" });

		// The host was handed a factory, and what it answers with is the lines of the host's own theme: the
		// bar carries the token its band calls for, the effort value the colour its level is drawn by, and
		// the period's accrued bar rides the same account line.
		const drawn = bound.host.draw(200);
		expect(drawn.lines[0]).toBe(
			`\u{1F525}  \u00ABdim:[${EMPTY_BAR}   0% (1,000/450.0K)]\u00BB  Effort: \u00ABeffort:high:high\u00BB  \u23F3 Accrued: \u00A50.05 [\u00ABsuccess:\u258F\u00BB]`,
		);
		expect(drawn.levels).toEqual(["high"]);
		expect(drawn.painted).toEqual([
			{ color: "dim", text: `[${EMPTY_BAR}   0% (1,000/450.0K)]` },
			{ color: "success", text: "\u258F" },
		]);
	});

	test("a host that draws text is handed the same lines with no colour token in them (P67)", async () => {
		const bound = await bindVisual({ drawing: "lines" });

		// The headless host takes text alone: every figure, threshold and narrower form is the same one,
		// and nothing of the theme this frontend would have mapped survives into what it is handed.
		// The superseded widget's own monetary account line: season, fixed-budget bar, effort, the
		// provider balance and the period's accrued bar are one row (spec §192: preserve the old layout).
		expect(bound.host.plain()).toEqual([
			`\u{1F525}  [${EMPTY_BAR}   0% (1,000/450.0K)]  Effort: high  \u23F3 Accrued: \u00A50.05 [\u258F]`,
			"Total:  Cache: 50%  \u00A5Cache/In/Out\uff1a5:19:76  Cost: \u00A50.05  Span: \u2014",
		]);
		expect(bound.host.plain()?.some(line => line.includes("\u00AB") || line.includes("\u001B"))).toBe(false);
	});
});

describe("the fixed-budget bar keeps the four bands it always warned in (P67)", () => {
	test("each band is drawn in its own theme token, at the boundaries that separate them", async () => {
		const bound = await bindVisual();
		// The band boundaries are the old bar's own — 36, 64 and 82 whole percent of the fixed budget —
		// and every comparison is strictly below the next band's floor.
		const bands: readonly (readonly [number, string])[] = [
			[1_000, "dim"],
			[161_999, "dim"],
			[162_000, "success"],
			[283_500, "success"],
			[288_000, "warning"],
			[364_500, "warning"],
			[369_000, "error"],
			[DEEPSEEK_BUDGET, "error"],
		];
		for (const [tokens, color] of bands) {
			bound.host.publish({ ...mainFacts(), context: { tokens, contextWindow: 1_000_000 } });
			expect(bound.host.draw(200).painted[0]?.color).toBe(color);
		}

		// The bar the band is drawn on is the one figure it always was: whole percent, the count against
		// the fixed budget, and one column per twentieth of it.
		bound.host.publish({ ...mainFacts(), context: { tokens: 162_000, contextWindow: 1_000_000 } });
		expect(bound.host.draw(200).painted[0]).toEqual({
			color: "success",
			text: "[\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591  36% (162.0K/450.0K)]",
		});
		bound.host.publish({ ...mainFacts(), context: { tokens: 369_000, contextWindow: 1_000_000 } });
		expect(bound.host.draw(200).painted[0]).toEqual({
			color: "error",
			text: "[\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2591\u2591\u2591\u2591  82% (369.0K/450.0K)]",
		});
	});

	test("the Codex pair is drawn against its own fixed budget (P67)", async () => {
		const codex = await bindVisual({ provider: CODEX, model: "gpt-6-luna", viewed: codexFacts() });
		expect(codex.host.draw(200).lines[0]).toBe(
			`\u00ABdim:[${EMPTY_BAR}   0% (1,000/272.0K)]\u00BB  Effort: \u00ABeffort:high:high\u00BB`,
		);
	});

	test("a mode this extension does not display is handed the clear, never an empty widget (P9, P67)", async () => {
		// A session the host reports nothing about is not this extension's display at all: the host is
		// handed the clear rather than a component that would draw nothing but still take a place in the
		// widget area, and the business result behind it is untouched.
		const hidden = await bindVisual({ viewed: { provider: "unknown-provider", model: "model-x", effort: "high" } });
		expect(hidden.host.lastContent()).toBeUndefined();
		expect(hidden.host.frames()).toBe(1);

		// A session with no UI at all is handed nothing either, and no frame is drawn for it.
		const headless = await bindVisual({ hasUI: false });
		expect(headless.host.lastContent()).toBeUndefined();
		expect(headless.host.frames()).toBe(0);
	});

	test("the monetary bar carries the season mark and the others do not (P67)", async () => {
		const peak = await bindVisual({ drawing: "lines" });
		expect(peak.host.plain()?.[0]?.startsWith("\u{1F525}")).toBe(true);

		const offPeak = await bindVisual({ at: OFF_PEAK_AT, drawing: "lines" });
		expect(offPeak.host.plain()?.[0]?.startsWith("\u{1F319}")).toBe(true);

		const holiday = await bindVisual({ holiday: true, at: PEAK_AT, drawing: "lines" });
		expect(holiday.host.plain()?.[0]?.startsWith("\u{1F3D6}\u{FE0F}")).toBe(true);

		// The token-only pair has no DeepSeek season and the allowance pair has no pricing season: neither
		// line carries a mark, and the bar and the effort value are still drawn on both.
		const tokenOnly = await bindVisual({ provider: "go-provider", model: "model-alpha", drawing: "lines" });
		expect(tokenOnly.host.plain()?.[0]).toBe(`[${EMPTY_BAR}   0% (1,000/450.0K)]  Effort: high`);
		expect(tokenOnly.host.plain()?.some(line => line.startsWith("\u{1F525}"))).toBe(false);

		const codex = await bindVisual({ provider: CODEX, model: "gpt-6-luna", viewed: codexFacts(), drawing: "lines" });
		expect(codex.host.plain()?.[0]).toBe(`[${EMPTY_BAR}   0% (1,000/272.0K)]  Effort: high`);
	});
});

describe("the balance keeps its two warnings (P67)", () => {
	test("below ten yuan it warns, below five it is an error, and it is drawn in its own currency", async () => {
		// The balance rides the monetary account line now, bearing the old money-bag mark: its amount is
		// tinted by the warning band it falls in, and both comparisons are strictly below.
		const warning = await bindVisual({ balanceTotal: "9.99" });
		const warningDraw = warning.host.draw(200);
		expect(warningDraw.lines[0]).toContain("\u{1F4B0} Balance: \u00ABwarning:\u00A59.99\u00BB");
		expect(warningDraw.painted).toContainEqual({ color: "warning", text: "\u00A59.99" });

		const error = await bindVisual({ balanceTotal: "4.99" });
		expect(error.host.draw(200).lines[0]).toContain("\u{1F4B0} Balance: \u00ABerror:\u00A54.99\u00BB");

		// Exactly ten and exactly five are not yet the next warning: both comparisons are strictly below.
		const ten = await bindVisual({ balanceTotal: "10.00", drawing: "lines" });
		expect(ten.host.plain()?.[0]).toContain("\u{1F4B0} Balance: \u00A510.00");

		const five = await bindVisual({ balanceTotal: "5.00", drawing: "lines" });
		expect(five.host.plain()?.[0]).toContain("\u{1F4B0} Balance: \u00A55.00");
	});
});

describe("the balance is the monetary channel's own line (P8, P67)", () => {
	test("a held reading is drawn for the official pair and for no other mode of the same CLI", async () => {
		// One CLI whose process really holds a reading: the endpoint answered the instance's own prefetch
		// before the first draw, which is what the official pair's account line below states.
		const bound = await bindVisual({ balanceTotal: "110.00" });
		expect(bound.host.draw(200).lines[0]).toContain("\u{1F4B0} Balance: \u00ABtext:\u00A5110.00\u00BB");

		// The Go pair is a token-only model: its display is the approved usage, the fixed budget and the
		// effort, and the reading the process still holds is not drawn — the specification lists the
		// official balance among what token-only does not have (spec §134).
		bound.host.publish({ ...mainFacts(), provider: "go-provider", model: "model-alpha" });
		const tokenOnly = bound.host.draw(200).lines;
		expect(tokenOnly[0]).toBe(
			`\u00ABdim:[${EMPTY_BAR}   0% (1,000/450.0K)]\u00BB  Effort: \u00ABeffort:high:high\u00BB`,
		);
		expect(tokenOnly.some(line => line.includes("Balance:"))).toBe(false);

		// The allowance pair reads no DeepSeek balance either: it is the other provider's channel, whose
		// own reading is the two windows.
		bound.host.publish(codexFacts());
		expect(bound.host.draw(200).lines.some(line => line.includes("Balance:"))).toBe(false);

		// A pair this extension does not display is handed the clear, and the reading behind it stays held.
		bound.host.publish({ sessionId: "session-main", provider: "unknown-provider", model: "model-x", effort: "high" });
		expect(bound.host.lastContent()).toBeUndefined();

		// None of that dropped the reading: back on the official pair the same amount is drawn again, from
		// the cache the process kept, and the whole switch asked the endpoint nothing further.
		bound.host.publish(mainFacts());
		expect(bound.host.draw(200).lines[0]).toContain("\u{1F4B0} Balance: \u00ABtext:\u00A5110.00\u00BB");
		expect(bound.sent.filter(call => call.url.endsWith("/user/balance"))).toHaveLength(1);
	});
});

describe("the accrued bar keeps the old eighth-block shapes and palette (P67)", () => {
	test("each session's segment keeps its own palette colour, and a session with nothing accrues no segment", async () => {
		const bound = await bindVisual({ costs: [0.05, 0, 0.1] });

		// Five cents is one eighth-block and ten is two; the middle session accrued nothing at all and is
		// drawn as no segment rather than a sliver, while the palette slot it would have taken stays with
		// the session after it: the third session is drawn in the third palette colour, not the second.
		expect(bound.host.draw(200).lines[0]).toContain(
			"\u23F3 Accrued: \u00A50.15 [\u00ABsuccess:\u258F\u00BB\u00ABerror:\u258E\u00BB]",
		);
	});

	test("the eight palette colours cycle in the order the bar has always drawn them", async () => {
		// Nine sessions over one yuan each, in coarse blocks, with no context reported so the accrued line
		// is the first one drawn: each segment carries its own palette colour in the fixed order, and the
		// ninth starts the cycle again.
		const bound = await bindVisual({ costs: [3, 3, 3, 3, 3, 3, 3, 3, 3], viewed: { ...mainFacts(), context: undefined } });
		expect(bound.host.draw(200).painted).toEqual(
			["success", "warning", "error", "thinkingHigh", "thinkingXhigh", "syntaxType", "syntaxNumber", "syntaxKeyword", "success"].map(
				color => ({ color, text: "\u2588\u2588\u2588" }),
			),
		);
	});

	test("past a whole character the segment is full blocks with an eighth-block remainder", async () => {
		const bound = await bindVisual({ costs: [0.45], drawing: "lines" });

		// Nine eighth-blocks is one whole character and one eighth: the bar's own decomposition, not a
		// rounded column count.
		expect(bound.host.plain()?.[0]).toContain("\u23F3 Accrued: \u00A50.45 [\u2588\u258F]");
	});

	test("nothing accrued draws no bar at all", async () => {
		const bound = await bindVisual({ costs: [0], drawing: "lines" });
		expect(bound.host.plain()?.[0]).toContain("\u23F3 Accrued: \u00A50.0000");
	});

	test("past twenty yuan the bar is whole yuan blocks, hiding a session that never reached one", async () => {
		const bound = await bindVisual({ costs: [20.5, 3, 0.5], drawing: "lines" });

		// Twenty-one and three whole yuan: the segment that never reached a yuan has no column, and the two
		// that did keep the palette slots their own positions give them.
		expect(bound.host.plain()?.[0]).toContain(
			`\u23F3 Accrued: \u00A524.00 [${"\u2588".repeat(21)}${"\u2588".repeat(3)}]`,
		);
	});

	test("either form is capped in columns, and the largest segment absorbs the correction", async () => {
		// Eight sessions at 2.49 yuan are fifty eighth-blocks each and the ninth cent is one more: 401
		// blocks over a cap of 400, so the first — the largest, at its own scale — gives one back.
		const fine = await bindVisual({ costs: [2.49, 2.49, 2.49, 2.49, 2.49, 2.49, 2.49, 2.49, 0.02], drawing: "lines" });
		expect(fine.host.plain()?.[0]).toContain(
			`\u23F3 Accrued: \u00A519.94 [${"\u2588".repeat(6)}\u258F${`${"\u2588".repeat(6)}\u258E`.repeat(7)}\u258F]`,
		);

		// One session at sixty yuan is sixty whole blocks over a cap of fifty.
		const coarse = await bindVisual({ costs: [60], drawing: "lines" });
		expect(coarse.host.plain()?.[0]).toContain(`\u23F3 Accrued: \u00A560.00 [${"\u2588".repeat(50)}]`);
	});

	test("the accrued bar belongs to the monetary channel alone (P67)", async () => {
		const tokenOnly = await bindVisual({ provider: "go-provider", model: "model-alpha", drawing: "lines" });
		expect(tokenOnly.host.plain()?.some(line => line.includes("\u23F3 Accrued:"))).toBe(false);

		const codex = await bindVisual({ provider: CODEX, model: "gpt-6-luna", viewed: codexFacts(), drawing: "lines" });
		expect(codex.host.plain()?.some(line => line.includes("\u23F3 Accrued:"))).toBe(false);
	});
});

describe("only the effort value is coloured, by its own level (P67)", () => {
	test("the label stays plain and the value is drawn with the level's own colour", async () => {
		const bound = await bindVisual({ viewed: { ...mainFacts(), effort: "medium" } });
		const drawn = bound.host.draw(200);

		// The value alone is coloured: the label is drawn as the line's own text, and the colour is the
		// level's, not a fixed token.
		expect(drawn.lines[0]).toBe(
			`\u{1F525}  \u00ABdim:[${EMPTY_BAR}   0% (1,000/450.0K)]\u00BB  Effort: \u00ABeffort:medium:medium\u00BB  \u23F3 Accrued: \u00A50.05 [\u00ABsuccess:\u258F\u00BB]`,
		);
		expect(drawn.levels).toEqual(["medium"]);
	});

	test("an effort the host never reported is a question mark, coloured as the level it is (P67)", async () => {
		const bound = await bindVisual({ viewed: { ...mainFacts(), effort: undefined } });
		const drawn = bound.host.draw(200);
		expect(drawn.lines[0]).toBe(
			`\u{1F525}  \u00ABdim:[${EMPTY_BAR}   0% (1,000/450.0K)]\u00BB  Effort: \u00ABeffort:?:?\u00BB  \u23F3 Accrued: \u00A50.05 [\u00ABsuccess:\u258F\u00BB]`,
		);
		expect(drawn.levels).toEqual(["?"]);
	});
});

describe("the allowance windows are drawn as the Codex operator reads them (P65, P67)", () => {
	/**
	 * One Codex host whose account API answers whatever the case stages: every window below arrives
	 * from the answer a settled report's own query reads, never from a response header.
	 */
	function bindCodexWindows(codexAnswer?: () => Response): Promise<BoundVisual> {
		return bindVisual({
			provider: CODEX,
			model: "gpt-6-luna",
			viewed: codexWindowFacts(),
			codex: true,
			...(codexAnswer === undefined ? {} : { codexAnswer }),
		});
	}

	test("the pace each window has run at decides its colour, over the two bands beside the plain one", async () => {
		// Each report states its own reset an hour ahead of the five-hour window, so four of that window's
		// five hours have run and the points it leads its own clock by are the band it lands in.
		let reply: () => Response = () => usageAnswer({});
		const bound = await bindCodexWindows(() => reply());
		const bands: readonly (readonly [number, number, string])[] = [
			// used percent, hours until its reset, the theme token the pace's own band is drawn in.
			[85, 1, "success"], // five points ahead of its own clock
			[95, 1, "success"], // exactly fifteen: still the first band
			[96, 1, "warning"], // sixteen
			[99, 4, "error"], // seventy-nine, past the second band's own thirty
			[80, 1, "text"], // exactly on its own clock
			[70, 1, "text"], // behind its own clock
		];
		for (const [used, hoursToReset, token] of bands) {
			// The controlled clock moves past the success TTL between the bands, so each report is a
			// settled Turn whose reading really is due, and its reset is stated from that instant.
			bound.clock.now += 30_000;
			reply = () =>
				usageAnswer({
					primary: { usedPercent: used, seconds: 18_000, resetAt: (bound.clock.now + hoursToReset * HOUR_MS) / 1000 },
				});
			reportCodex(bound);
			await drain();
			const drawn = bound.host.draw(200);
			// Everything a pace is drawn with — the bar's own runs of used cells and the percentage itself —
			// carries the one token the band calls for, in the order the line draws them.
			expect(last(drawn.painted)).toEqual({ color: token, text: `${used.toFixed(1)}%` });
			expect(drawn.painted.slice(0, -1).every(paint => paint.color === token)).toBe(true);
			expect(drawn.painted.length).toBeGreaterThan(1);
			expect(drawn.lines[0]?.startsWith("5h ")).toBe(true);
		}
	});

	test("a window with no usable reset is drawn muted, with the dashes it always showed", async () => {
		let reply: () => Response = () => usageAnswer({});
		const bound = await bindCodexWindows(() => reply());
		reply = () => usageAnswer({ primary: { usedPercent: 42, seconds: 18_000 } });
		reportCodex(bound);
		await drain();
		const drawn = bound.host.draw(200);

		// No reset instant: no marker can be placed and no pace can be measured, so the used run and the
		// percentage are drawn in the muted colour and the line says the reset is unknown.
		expect(drawn.lines[0]).toBe(
			`5h \u00ABmuted:${"\u2501".repeat(8)}\u00BB${"\u2500".repeat(12)} \u00ABmuted:42.0%\u00BB / --% \u00B7 reset unknown`,
		);
		expect(drawn.painted).toEqual([
			{ color: "muted", text: "\u2501".repeat(8) },
			{ color: "muted", text: "42.0%" },
		]);
	});

	test("the host's width reaches the window line, one form down at a time (P67)", async () => {
		let reply: () => Response = () => usageAnswer({});
		const bound = await bindCodexWindows(() => reply());
		reply = () =>
			usageAnswer({ primary: { usedPercent: 85, seconds: 18_000, resetAt: (bound.clock.now + HOUR_MS) / 1000 } });
		reportCodex(bound);
		await drain();
		const at = (width: number): Draw => bound.host.draw(width);

		// Wide enough for everything: the twenty-cell bar with its time marker inside it, both percentages
		// and the reset's own instant beside its countdown.
		const full = at(200);
		expect(full.lines[0]).toContain("\u2502");
		expect(full.painted[0]).toEqual({ color: "success", text: "\u2501".repeat(16) });
		const shown = absoluteInstantOf(full.lines[0] as string, new Date(bound.clock.now).getFullYear());
		expect(shown === undefined ? undefined : Math.abs(shown - (bound.clock.now + HOUR_MS))).toBeLessThan(MINUTE_MS);

		// The bar goes first, then the absolute instant, leaving the countdown the operator acts on; the
		// percentages alone still fit; and a line too narrow for even those is cut with an ellipsis.
		expect(at(50).lines[0]).toMatch(/^5h \u00ABsuccess:85\.0%\u00BB \/ 80\.0% \u00B7 resets in 1h \(/);
		expect(at(40).lines[0]).toBe("5h \u00ABsuccess:85.0%\u00BB / 80.0% \u00B7 resets in 1h");
		expect(at(20).lines[0]).toBe("5h \u00ABsuccess:85.0%\u00BB / 80.0%");
		expect(at(10).lines[0]).toBe("5h 85.0% \u2026");
	});
});

describe("the agent tree paints the session that is working with the activity colour (P23)", () => {
	/** The child the document records second, as the host reports that session's own facts. */
	const CHILD: SessionFacts = { sessionId: "session-1", kind: "sub", name: "会话 1", unavailable: [] };

	test("a descendant at work carries the accent token, and one that is not is handed over plain", async () => {
		const bound = await bindVisual({ costs: [0.05, 0.01] });
		await bound.double.runToCompletion("budget", { args: "detail" });

		// Nothing has taken up a Round yet, so no reading the tree draws by exists at all: the descendant's
		// name is handed over as plain text like every other cell, and the theme is asked for no activity
		// colour — an unestablished activity is not idleness, and it is not a colour either.
		const quiet = bound.host.draw(200);
		expect(quiet.lines.some(line => line.includes("会话 1"))).toBe(true);
		expect(quiet.painted.some(paint => paint.text === "会话 1")).toBe(false);

		// The child takes up a Round. The widget redraws on that edge — the running row is what the display
		// now states, and nothing has to settle, accumulate or be saved for it to be drawn — and the
		// descendant's name is the one piece of the tree painted with the accent token shared logic asked
		// for.
		const framesBefore = bound.host.frames();
		bound.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: CHILD });
		expect(bound.host.frames()).toBeGreaterThan(framesBefore);
		expect(bound.host.draw(200).painted).toContainEqual({ color: "accent", text: "会话 1" });

		// Its Round ends and the name is handed over plain again: idle is a reading that states no emphasis,
		// so it draws no colour rather than a second one.
		bound.double.deliverRound(OWNER, { event: { kind: "round_end" }, session: CHILD });
		expect(bound.host.draw(200).painted.some(paint => paint.text === "会话 1")).toBe(false);
	});

	test("the text form reads the same and carries no colour token", async () => {
		const bound = await bindVisual({ costs: [0.05, 0.01], drawing: "lines" });
		await bound.double.runToCompletion("budget", { args: "detail" });
		bound.double.deliverRound(OWNER, { event: { kind: "round_start" }, session: CHILD });

		// A host that draws text is handed the working session's name in the same column as before and with
		// nothing of the theme this frontend would have mapped: a colour token here would be text nobody
		// drew.
		const lines = bound.host.plain() ?? [];
		expect(lines.some(line => line.includes("会话 1"))).toBe(true);
		expect(lines.every(line => !line.includes("\u00AB") && !line.includes("\u001B"))).toBe(true);
	});
});
