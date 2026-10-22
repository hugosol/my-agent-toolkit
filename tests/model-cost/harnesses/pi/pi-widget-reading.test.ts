/**
 * The pi frontend's reading of pi's own context fact (S1; contract P18; ticket 03).
 *
 * pi states its session's current context usage with the host's *unknown* as `null` — right after a
 * compaction, before the next response establishes a reading. A null is not a token count of zero, and
 * a drawing path that let it into a number formatter would fail exactly where the operator is looking:
 * the widget's own redraw runs inside the accounting's change notification, so a throw there takes the
 * Round's own handler down with it and the session's consumption is never saved.
 *
 * The cases below drive the production pi frontend through its own `session_start` with the host's
 * reading as pi publishes it, and read what it drew: an unknown reading contributes no bar to the
 * account line, and a reported one is written in the display's own form.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { PiExtensionApi, PiExtensionContext } from "../../../../adapters/pi";
import {
	MODEL_COST_WIDGET_KEY,
	type WidgetReading,
	attachModelCostWidget,
	widgetLayout,
} from "../../../../extensions/model-cost/harnesses/pi/widget";
import type { ModelPricingData } from "../../../../extensions/model-cost/shared-logic/business/pricing/model-data";
import { type ConsumptionDisplay, lineText } from "../../../../extensions/model-cost/shared-logic/presentation/display";
import { createModelCostRuntime } from "../../../../extensions/model-cost/shared-logic/runtime";
import { uiBoundaryTimerOf } from "../../support/ui-timer";
import { testSessionCapability } from "../../support/session-capability";

/** The self-made pricing data: the official pair the frontend's target runs on, priced monetarily. */
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

/** The instant the drawn season is read at: 11:00 in the data's zone, a workday peak instant. */
const CLOCK_AT = Date.parse("2026-10-01T03:00:00.000Z");

/** Every root this file created, removed after each case. */
const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** One drawn widget frame; a cleared widget carries no lines. */
interface DrawnFrame {
	readonly key: string;
	readonly lines: readonly string[] | undefined;
}

/**
 * The pi session context one case publishes, with the host's own context reading.
 *
 * `tokens` is stated as pi states it, `null` included: this is the host fact the frontend reads, not a
 * value this suite shapes into something friendlier.
 */
interface HostReading {
	readonly tokens: number | null;
	readonly contextWindow: number;
}

/** One controlled pi host: the frames it was told to draw, and the session context it published. */
interface ControlledPiHost {
	readonly api: PiExtensionApi;
	readonly drawn: DrawnFrame[];
	startSession(reading: HostReading | undefined): void;
	selectModel(provider: string, model: string): void;
	selectThinking(level: string): void;
	/** How many handlers this host currently holds for one native event. */
	handlerCount(event: string): number;
	/** Releases the frontend attached over this host. */
	release(): void;
	/** The lines of the last widget this host was told to show, or nothing when it was cleared. */
	lastLines(): readonly string[] | undefined;
}

/** A controlled pi host over one binding: it records the registrations and the widget frames. */
function controlledPiHost(): Omit<ControlledPiHost, "release"> {
	const handlers = new Map<string, Array<(event: unknown, ctx: PiExtensionContext) => void>>();
	const drawn: DrawnFrame[] = [];
	let currentReading: HostReading | undefined;
	const api = {
		on(event: string, handler: (event: unknown, ctx: PiExtensionContext) => void): () => void {
			const list = handlers.get(event) ?? [];
			list.push(handler);
			handlers.set(event, list);
			return () => {
				const current = handlers.get(event) ?? [];
				const index = current.indexOf(handler);
				if (index >= 0) current.splice(index, 1);
			};
		},
		registerCommand(): void {},
		appendEntry(): void {},
	} as unknown as PiExtensionApi;
	const context = (
		reading: HostReading | undefined,
		provider = "official",
		model = "model-alpha",
		thinkingLevel = "off",
	): PiExtensionContext =>
		({
			sessionManager: {
				getSessionId: () => "pi-widget-session",
				getSessionName: () => "pi widget session",
				getBranch: () => [],
			},
			model: { id: model, provider },
			thinkingLevel,
			hasUI: true,
			ui: {
				notify: () => {},
				setWidget: (key: string, content: readonly string[] | undefined) => {
					drawn.push({ key, lines: content });
				},
			},
			...(reading === undefined ? {} : { getContextUsage: () => reading }),
			isIdle: () => true,
			hasPendingMessages: () => false,
		}) as unknown as PiExtensionContext;
	return {
		api,
		drawn,
		startSession: reading => {
			currentReading = reading;
			for (const handler of handlers.get("session_start") ?? []) handler({ type: "session_start", reason: "startup" }, context(reading));
		},
		selectModel: (provider, model) => {
			for (const handler of handlers.get("model_select") ?? []) {
				handler({ type: "model_select", source: "set" }, context(undefined, provider, model));
			}
		},
		selectThinking: level => {
			for (const handler of handlers.get("thinking_level_select") ?? []) {
				handler(
					{ type: "thinking_level_select", level, previousLevel: "off" },
					context(currentReading, "official", "model-alpha", level),
				);
			}
		},
		handlerCount: event => handlers.get(event)?.length ?? 0,
		lastLines: () => {
			const shown = drawn.filter(frame => frame.key === MODEL_COST_WIDGET_KEY);
			return shown[shown.length - 1]?.lines;
		},
	};
}

/** One attached pi frontend over a fresh storage root, with the host its context came from. */
function attachedFrontend(): ControlledPiHost {
	const root = mkdtempSync(path.join(tmpdir(), "pi-widget-reading-"));
	roots.push(root);
	const runtime = createModelCostRuntime({
		config: { storageDir: root },
		configDirectory: root,
		userHomeDirectory: root,
		harness: "pi-widget-probe",
		data: DATA,
		session: testSessionCapability(),
		now: () => CLOCK_AT,
	});
	const host = controlledPiHost();
	const release = attachModelCostWidget(host.api, runtime, uiBoundaryTimerOf(runtime));
	return { ...host, release };
}

describe("the pi frontend reads pi's own context fact as the host states it (P18)", () => {
	test("model selection clears a hidden model's widget and restores it without another request", () => {
		const host = attachedFrontend();
		host.startSession(undefined);
		expect(host.lastLines()).toBeDefined();

		host.selectModel("unconfigured", "hidden-model");
		expect(host.lastLines()).toBeUndefined();

		host.selectModel("official", "model-alpha");
		expect(host.lastLines()?.[0]).toContain("🔥");
	});

	test("a null token reading is unknown, so no bar is drawn and the widget still draws", () => {
		const host = attachedFrontend();

		// pi's own reading right after a compaction: the context is unknown, not zero.
		host.startSession({ tokens: null, contextWindow: 450_000 });

		const lines = host.lastLines();
		expect(lines).toBeDefined();
		const account = lines?.[0] ?? "";
		// No percentage and no token figure: the bar needs a reading to compare, and this host has none.
		expect(account).not.toContain("%");
		// The season mark the clock states — 11:00 inside the data's peak window — is still drawn.
		expect(account).toContain("🔥");
		// The rest of the widget is unaffected: the target's own rows are still drawn.
		expect(lines?.some(line => line.startsWith("Total:  "))).toBe(true);
	});

	test("a reported reading is drawn as the display's own percentage and figures", () => {
		const host = attachedFrontend();

		host.startSession({ tokens: 1460, contextWindow: 450_000 });

		const account = host.lastLines()?.[0] ?? "";
		// 1460 of the monetary channel's fixed 450K display budget is 0.32%, written as the display
		// writes it, with the reading itself grouped in thousands.
		expect(account).toContain("0% (1,460/450.0K)");
	});

	test("a host that publishes no context reading at all draws the same lines as an unknown one", () => {
		const host = attachedFrontend();

		host.startSession(undefined);

		const account = host.lastLines()?.[0] ?? "";
		expect(account).not.toContain("%");
		expect(account).toContain("🔥");
	});
});

describe("the pi frontend follows pi's effective thinking level (P11)", () => {
	test("a thinking-level selection redraws the effort without a model request", () => {
		const host = attachedFrontend();
		host.startSession({ tokens: 1460, contextWindow: 450_000 });
		expect(host.lastLines()?.[0]).toContain("Effort: off");

		host.selectThinking("high");

		expect(host.lastLines()?.[0]).toContain("Effort: high");
	});

	test("the thinking-level subscription is released with the frontend", () => {
		const host = attachedFrontend();
		expect(host.handlerCount("thinking_level_select")).toBe(1);

		host.release();

		expect(host.handlerCount("thinking_level_select")).toBe(0);
	});
});

describe("the pi frontend carries DeepSeek account facts beside another current channel (P8, P67)", () => {
	/** One reading whose current target uses `mode` while its main tree carries saved DeepSeek cost. */
	function readingOf(mode: "token-only" | "allowance", costCny: number | undefined): WidgetReading {
		const display = {
			mode,
			form: "brief",
			current: { tokens: { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 }, sum: 0 },
			tree: {
				tokens: { input: 10, cacheRead: 10, cacheWrite: 0, output: 10 },
				sum: 30,
				...(costCny === undefined ? {} : { costCny }),
			},
			effort: "high",
			budget: { tokens: mode === "allowance" ? 272_000 : 450_000, exceeded: false },
			context: { tokens: 1_000 },
		} as unknown as ConsumptionDisplay;
		return {
			display,
			balance: { reading: { total: 110, currency: "CNY", obtainedAt: CLOCK_AT } },
			period: { season: "peak", holiday: false, at: CLOCK_AT },
			accrued: { totalCny: costCny ?? 0, sessionCostsCny: costCny === undefined ? [] : [costCny] },
			quota: mode === "allowance" ? [[{ text: "5h a Codex window" }]] : [],
		};
	}

	test("a token-only or allowance target whose Total writes Cost draws the held balance and accrual", () => {
		for (const mode of ["token-only", "allowance"] as const) {
			const lines = (widgetLayout(readingOf(mode, 0.05)) ?? []).map(lineText);
			expect(lines[0]).toContain("Effort: high");
			expect(lines[0]).toContain("\u{1F4B0} Balance: \u00A5110.00");
			expect(lines[0]).toContain("\u23F3 Accrued: \u00A50.05");
			expect(lines.some(line => line.startsWith("Total:  "))).toBe(true);
			if (mode === "allowance") expect(lines.some(line => line.includes("5h a Codex window"))).toBe(true);
		}
	});

	test("a target whose Total writes no Cost keeps the DeepSeek account facts off its account row", () => {
		const lines = (widgetLayout(readingOf("token-only", undefined)) ?? []).map(lineText);
		expect(lines[0]).toContain("Effort: high");
		expect(lines[0]).not.toContain("Balance:");
		expect(lines[0]).not.toContain("Accrued:");
	});
});
