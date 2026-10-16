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
import type { PiExtensionApi, PiExtensionContext } from "../../framework/adapters/pi";
import { MODEL_COST_WIDGET_KEY, attachModelCostWidget } from "../../extensions/model-cost/harnesses/pi/widget";
import type { ModelPricingData } from "../../extensions/model-cost/shared-logic/model-data";
import { createModelCostRuntime } from "../../extensions/model-cost/shared-logic/runtime";
import { uiBoundaryTimerOf } from "./support/ui-timer";

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
	/** The lines of the last widget this host was told to show, or nothing when it was cleared. */
	lastLines(): readonly string[] | undefined;
}

/** A controlled pi host over one binding: it records the registrations and the widget frames. */
function controlledPiHost(): ControlledPiHost {
	const handlers = new Map<string, Array<(event: unknown, ctx: PiExtensionContext) => void>>();
	const drawn: DrawnFrame[] = [];
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
	const context = (reading: HostReading | undefined): PiExtensionContext =>
		({
			sessionManager: {
				getSessionId: () => "pi-widget-session",
				getSessionName: () => "pi widget session",
				getBranch: () => [],
			},
			model: { id: "model-alpha", provider: "official" },
			thinkingLevel: "off",
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
			for (const handler of handlers.get("session_start") ?? []) handler({ type: "session_start", reason: "startup" }, context(reading));
		},
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
		now: () => CLOCK_AT,
	});
	const host = controlledPiHost();
	attachModelCostWidget(host.api, runtime, uiBoundaryTimerOf(runtime));
	return host;
}

describe("the pi frontend reads pi's own context fact as the host states it (P18)", () => {
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
