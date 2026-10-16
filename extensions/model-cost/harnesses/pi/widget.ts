/**
 * The pi frontend: the one native widget this extension's read-only display is drawn through on this
 * harness.
 *
 * This is the extension's own harness-specific half (ADR-0002: native presentation is the
 * extension's, not the framework's). Everything it draws comes from `runtime.presentation` — the
 * read-only display result — so the mode gating, the two currencies, the fixed budget, every figure,
 * every threshold and every word are decided once, in shared logic; this frontend only states the
 * shape the rows arrive in. pi's `setWidget` takes the plain text of those lines, so the drawing here
 * is a line layout and nothing else: there is no component, no theme and no width to fit, and a
 * colour code would be text pi never mapped.
 *
 * Three rules of the display live here because only the host knows them:
 *
 * - **No widget where there is none to draw.** A session without a UI draws nothing, and a model
 *   whose mode is `hidden` is not this extension's display at all: its widget is *not created*
 *   (and an earlier one is cleared) rather than shown empty. Neither touches what the session runs.
 * - **A change is a re-read.** The rendered lines are built from the current display result at the
 *   moment of drawing: the accounting's own change notifications and the host's session transitions
 *   both end in the same re-read, so the widget never holds a stale reading of its own.
 * - **The session this binding serves is the displayed one.** pi publishes no separate viewed-session
 *   outlet, so the facts the budget bar, the effort and the context reading come from are the bound
 *   session's own; nothing here follows another session's inspector.
 *
 * What this file does not own: the boundary wait that redraws the season when it changes over time,
 * and the width-aware tree layout a terminal with its own width draws. Both belong to the harness's
 * own presentation work rather than to the loading and saving loop this frontend exists for.
 */
import type { PiExtensionApi, PiExtensionContext } from "../../../../framework/adapters/pi";
import {
	type AgentTreeRow,
	type ConsumptionDisplay,
	type DisplayAccrued,
	type DisplayLine,
	type DisplayPeriod,
	type DisplayPiece,
	type DisplayRow,
	type DisplayTarget,
	accruedLine,
	balanceLine,
	budgetLine,
	contextText,
	fieldsColumns,
	lineText,
	roundColumns,
	runtimeText,
	seasonMark,
	totalColumns,
} from "../../shared-logic/presentation/display";
import type { ProviderBalanceResult } from "../../shared-logic/provider-balance";
import type { ModelCostRuntime } from "../../shared-logic/runtime";

/** The native widget key the usage widget is drawn under: this extension's own, not the marker area. */
export const MODEL_COST_WIDGET_KEY = "z-model-cost";

/**
 * Everything one draw of the usage widget reads: the target's own display result, the process-wide
 * balance reading, the pricing period, the period's accrual and the allowance lines.
 */
export interface WidgetReading {
	readonly display: ConsumptionDisplay;
	readonly balance: ProviderBalanceResult;
	readonly period: DisplayPeriod;
	readonly accrued: DisplayAccrued;
	readonly quota: readonly DisplayLine[];
}

/**
 * One labelled row: the columns the display result states, each written as its own label and value,
 * with the row's own prefix ahead of the first column.
 *
 * The values are written exactly as shared logic stated them — a dash a column carries stays a dash —
 * and no column is re-decided, dropped or padded here: the row's plain form is what a host that takes
 * text draws.
 */
function labelledLine(prefix: string, row: DisplayRow): DisplayLine {
	return row.map((column, index) => ({ text: `${index === 0 ? prefix : ""}${column.label}${column.value}` }));
}

/**
 * The detail form's agent-tree rows as lines: one line per row, indented by that row's own distance
 * from the root.
 *
 * A row states its distance and its own content — its name, the startup snapshot a session began on,
 * the statistics its scope carries, its current context reading and the runtime its executions were
 * measured at — and this layout turns that distance into leading space. Nothing about which rows
 * exist or what each of them says is decided here.
 */
function treeLines(rows: readonly AgentTreeRow[]): DisplayLine[] {
	return rows.map(row => {
		const pieces: DisplayPiece[] = [
			{
				text: `${"  ".repeat(row.depth)}${row.name}`,
				...(row.nameEmphasis === undefined ? {} : { emphasis: row.nameEmphasis }),
			},
		];
		if (row.startup !== undefined) pieces.push({ text: row.startup.text });
		if (row.fields !== undefined) {
			for (const column of fieldsColumns(row.fields)) pieces.push({ text: `${column.label}${column.value}` });
		}
		if (row.context !== undefined) pieces.push({ text: `Ctx: ${contextText(row.context)}` });
		if (row.kind === "session") pieces.push({ text: `Run: ${runtimeText(row.runtimeMs)}` });
		return pieces;
	});
}

/**
 * The whole widget as the lines pi draws: the process-wide account row or the mode's own lines, the
 * target's Total, and then the form being shown — the detail form's agent tree, or the brief's Round
 * row.
 *
 * A mode this extension does not display answers nothing, which is the caller's instruction to clear
 * the widget rather than draw an empty one. The two currencies stay apart on the rows that carry
 * them, and a mode without an amount policy contributes no amount of its own.
 */
export function widgetLines(reading: WidgetReading): string[] | undefined {
	const { display } = reading;
	if (display.mode === "hidden") return undefined;
	const lines: DisplayLine[] = [];
	if (display.mode === "monetary") {
		// The account row, one line: the season mark and the fixed-budget bar, the provider balance and
		// the period's accrued bar, in that order. A target whose host reported no context reading still
		// shows its season mark and account facts — only the bar needs a reading to compare.
		const account: DisplayPiece[] = [];
		const budget = budgetLine(display, reading.period);
		if (budget !== undefined) account.push(...budget);
		else account.push({ text: seasonMark(reading.period) });
		const balance = balanceLine(reading.balance);
		if (balance !== undefined) account.push(...balance);
		account.push(...accruedLine(reading.accrued));
		lines.push(account);
	} else {
		const budget = budgetLine(display, reading.period);
		if (budget !== undefined) lines.push(budget);
		if (display.mode === "allowance") lines.push(...reading.quota);
	}
	lines.push(labelledLine("Total:  ", totalColumns(display)));
	const round = display.round;
	if (display.form === "detail" && display.agentTree !== undefined) {
		lines.push(...treeLines(display.agentTree));
	} else if (round !== undefined) {
		lines.push(labelledLine("Round:  ", roundColumns(round, display.mode)));
	}
	return lines.map(lineText);
}

/**
 * Attach the usage widget to one pi session binding.
 *
 * Attaching registers the native handlers the widget re-reads on and subscribes to the accounting's
 * own change notifications; it creates no widget by itself and reads nothing, so a binding that is
 * refused after this point leaves nothing behind. The returned function releases it: the change
 * subscription is stopped, the native registrations are given up and the widget is cleared. That
 * release is the extension's own, and the dispose front-end that reaches it is the framework's — the
 * binding's single `cleanup`, called when the session that initialized the instance ends — so this
 * frontend subscribes no native shutdown hook of its own and nothing of it outlives the session it
 * draws through.
 *
 * A session without a UI is never drawn on: the render is a no-op for it and no widget is created,
 * which is what keeps a headless run free of a drawing path.
 */
export function attachModelCostWidget(pi: PiExtensionApi, runtime: ModelCostRuntime): () => void {
	let context: PiExtensionContext | undefined;

	/**
	 * The target this session is displaying: the session this binding serves, with the model, the
	 * effective effort and the context reading its own context reports.
	 *
	 * pi publishes no viewed-session outlet, so there is no separate view to read and no other
	 * session's readings to borrow: a context that reports no model answers with empty strings, and a
	 * context that reports no reading contributes no bar rather than a guessed one.
	 *
	 * pi states an unknown context as a null token count — right after a compaction, before the next
	 * response establishes a reading — which is no reading rather than a confirmed zero: a null that
	 * reached the display as a number would fail the whole draw, and this frontend's draw runs inside
	 * the accounting's own change notification.
	 */
	const targetOf = (ctx: PiExtensionContext): DisplayTarget => {
		const usage = ctx.getContextUsage?.();
		const effort = ctx.thinkingLevel;
		const tokens = typeof usage?.tokens === "number" ? usage.tokens : undefined;
		const contextWindow = typeof usage?.contextWindow === "number" ? usage.contextWindow : undefined;
		return {
			sessionId: ctx.sessionManager.getSessionId(),
			provider: ctx.model?.provider ?? "",
			model: ctx.model?.id ?? "",
			...(tokens === undefined ? {} : { contextTokens: tokens }),
			...(contextWindow === undefined ? {} : { contextWindow }),
			...(effort === undefined || effort.length === 0 ? {} : { effort }),
		};
	};

	/** One reading of that target, as the layout above draws it. */
	const readingOf = (ctx: PiExtensionContext): WidgetReading => ({
		display: runtime.presentation.of(targetOf(ctx)),
		balance: runtime.presentation.balance(),
		period: runtime.presentation.period(),
		accrued: runtime.presentation.accrued(),
		quota: runtime.presentation.quotaLines(),
	});

	/**
	 * One hand-over to the host: the target's own display is read to decide whether there is a widget
	 * at all, and the lines go over as they stand.
	 *
	 * The reading is taken here rather than kept: a redraw is these calls and nothing else, so whatever
	 * changed — a request that settled, the season, a command's own effect — is what the drawing reads,
	 * and nothing a render does can reach the network, a file or the accounting.
	 */
	const render = (): void => {
		const ctx = context;
		if (ctx === undefined || ctx.hasUI !== true) return;
		const lines = widgetLines(readingOf(ctx));
		// A mode this extension does not display is not its widget at all: the host is handed the
		// clear rather than a widget that would draw nothing but still take a place in its area.
		ctx.ui.setWidget(MODEL_COST_WIDGET_KEY, lines);
	};

	const unwatchConsumption = runtime.view.subscribe(render);
	const release = pi.on("session_start", (_event, ctx) => {
		context = ctx;
		render();
	});

	return () => {
		unwatchConsumption();
		release();
		context?.ui.setWidget(MODEL_COST_WIDGET_KEY, undefined);
		context = undefined;
	};
}
