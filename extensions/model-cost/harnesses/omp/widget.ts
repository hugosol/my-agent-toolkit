/**
 * The OMP frontend: the one native widget this extension's read-only display is drawn through.
 *
 * This is the extension's own harness-specific half (ADR-0002: native presentation is the
 * extension's, not the framework's). It owns the native surface and nothing else: which widget key
 * the display is drawn under, when the widget is created and cleared, the events that make it
 * re-read, and the two things only a terminal knows — the theme a colour is drawn with and the width a
 * line has to fit. Everything it draws comes from `runtime.presentation` — the read-only display
 * result — so the mode gating, the two currencies, the fixed budget, every figure, every threshold and
 * every word are decided once, in shared logic, and this frontend only maps what that result describes
 * onto the native surface: a described emphasis becomes one of the theme's own colours, and a line that
 * does not fit the width is drawn in the narrower form shared logic already stated for it.
 *
 * Three rules of the display live here because only the host knows them:
 *
 * - **No widget where there is none to draw.** A session without a UI draws nothing, and a model
 *   whose mode is `hidden` is not this extension's display at all: its widget is *not created*
 *   (and an earlier one is cleared) rather than shown empty. Neither touches what the session runs.
 * - **A change is a re-read.** The rendered lines are built from the current display result at the
 *   moment of drawing: the accounting's own change notifications, the host's session transitions,
 *   its public Viewed session change subscription and the UI's own boundary wait all end in the same
 *   re-read, so the widget never holds a stale reading of its own.
 * - **The host's own drawing decides the form.** A host that draws components is handed one, so the
 *   theme and the width are the host's own and are read at drawing time; a host that draws lines is
 *   handed the plain text of the same lines and no colour codes, because there is no theme to map
 *   them into. Which of the two this CLI is, is its assembly's reading of the host (see
 *   `WidgetDrawing`), not a decision of this module's.
 *
 * The fourth rule is this file's layout: the rows a display result carries are labelled and indented
 * here — the brief's one `Round` row, and the continuation bars and connectors of the detail form's
 * static tree, whose rows only state their distance from the root. How a terminal draws a depth is a
 * frontend's business; which rows there are, and what each row's own figures are, is shared logic's.
 *
 * The Viewed session outlet is the host's public one (`ctx.getViewedSession()` /
 * `ctx.subscribeViewedSessionChanged()`), read here rather than through a private controller or a
 * rendered line, and read defensively: a host that publishes no outlet answers with nothing, and
 * the widget then falls back to the session it is bound to rather than inventing the displayed one.
 */
import type {
	OmpExtensionApi,
	OmpSessionContext,
	OmpSessionEvent,
	OmpViewedSessionFacts,
} from "../../../../framework/adapters/omp";
import {
	type AgentTreeRow,
	type ConsumptionDisplay,
	type DisplayAccrued,
	type DisplayEmphasis,
	type DisplayLine,
	type DisplayPiece,
	type DisplayPeriod,
	type DisplayRow,
	type DisplayTarget,
	accruedLine,
	balanceLine,
	budgetLine,
	contextText,
	fieldsText,
	lineText,
	roundColumns,
	seasonMark,
	totalColumns,
} from "../../shared-logic/presentation/display";
import type { ProviderBalanceResult } from "../../shared-logic/provider-balance";
import type { ModelCostRuntime } from "../../shared-logic/runtime";
import type { BoundaryTimer } from "./boundary-timer";

/** The native widget key the usage widget is drawn under: this extension's own, not the marker area. */
export const MODEL_COST_WIDGET_KEY = "z-model-cost";

/**
 * How this CLI's UI draws what a frontend hands it.
 *
 * `component` is a UI that asks for the lines itself, so it hands a factory the theme to draw with and
 * the width to fit; `lines` is a UI that takes text alone, where a colour code would be text nobody
 * mapped and a width nobody stated. A host that draws components is the interactive one, which is what
 * its own assembly reads the CLI to be; the headless RPC host takes lines, and so does a session with
 * no UI at all.
 */
export type WidgetDrawing = "component" | "lines";

/**
 * The native theme one drawn line is coloured with, as a component factory is handed it.
 *
 * Only the two members this frontend maps are named: a colour token, and the colour a thinking level
 * is drawn with — the effort value is coloured by its level rather than by one fixed token, because
 * the level is what the colour means.
 */
export interface WidgetTheme {
	fg(color: string, text: string): string;
	getThinkingBorderColor(level: string): (text: string) => string;
}

/** The component a component factory answers with: the lines one host has asked for at one width. */
export interface WidgetComponent {
	render(width: number): string[];
}

/**
 * The theme token each described emphasis is drawn with.
 *
 * The mapping is this frontend's own and the tokens are the ones these lines have always been drawn
 * with — a budget bar's four bands, the balance's two warnings, one window's pacing, and the eight
 * colours the accrued bar's sessions cycle through — so a described emphasis keeps the exact shade it
 * had before the display was split into shared logic and a frontend. `effort` is not here: it is the
 * one emphasis whose colour is the level's own.
 */
const EMPHASIS_COLORS: Record<Exclude<DisplayEmphasis, "effort">, string> = {
	plain: "text",
	dim: "dim",
	muted: "muted",
	success: "success",
	warning: "warning",
	error: "error",
	segment1: "success",
	segment2: "warning",
	segment3: "error",
	segment4: "thinkingHigh",
	segment5: "thinkingXhigh",
	segment6: "syntaxType",
	segment7: "syntaxNumber",
	segment8: "syntaxKeyword",
};

/**
 * What the host's public Viewed session outlet publishes, as this frontend reads it: the facts the
 * framework's adapter resolves for its own projection, plus the display facts this widget draws.
 */
type ViewedSessionFacts = OmpViewedSessionFacts & {
	readonly provider?: string;
	readonly model?: string;
	readonly effort?: string;
	readonly context?: { readonly tokens?: number; readonly contextWindow?: number };
};

/**
 * The context this frontend draws through: the native session context, plus the public outlet the
 * patched host adds to every context it builds.
 *
 * The outlet members are optional because the host publishes them only from the approved patch
 * onward, and the ADR keeps the adapter's native surface at the members the framework itself uses:
 * this frontend widens that reading with the display facts only it needs.
 */
interface WidgetContext extends OmpSessionContext {
	getViewedSession?(): ViewedSessionFacts;
	subscribeViewedSessionChanged?(listener: (facts: ViewedSessionFacts) => void): () => void;
	/**
	 * The bound session's own context reading, the native surface every host has published since
	 * before the viewed-session outlet existed.
	 *
	 * It is read only when the host publishes no outlet at all — the approved patch is not installed,
	 * so there is no separate view and the session this widget is bound to is the one being drawn.
	 * A host that publishes the outlet is read through it alone. Optional, because a host that
	 * reports no reading has no bar rather than a guessed one.
	 */
	getContextUsage?(): { readonly tokens?: number; readonly contextWindow?: number } | undefined;
	/**
	 * The session's managed one-shot timer, exactly as the harness hands it out: the handle is passed
	 * back to {@link WidgetContext.clearTimer} and is cleared with the session.
	 *
	 * The framework's adapter names only the members its own mapping uses, so the native timer surface
	 * the boundary wait schedules on is named here, in the extension's own native half — and it is read
	 * as the session's own member rather than as a platform timer, so a session's teardown clears the
	 * timer this frontend armed.
	 */
	setTimeout(callback: () => void, ms: number): unknown;
	clearTimer(timer: unknown): void;
}

/**
 * The native extension API this frontend draws through: the framework adapter's surface plus the
 * members only this widget reads.
 *
 * The adapter names only the members its own mapping uses, so the bound session's actual effective
 * thinking level — the native getter every host has published all along, viewed-session outlet or
 * not — is named here, in the extension's own native half, beside the widget's other native reads.
 */
interface WidgetApi extends OmpExtensionApi {
	/**
	 * The bound session's actual effective thinking level, as the harness's own
	 * `session.thinkingLevel` reports it.
	 *
	 * It is read only when the host publishes no viewed-session outlet at all, the same
	 * bound-session fallback the context bar takes. Optional: a surface that reports no level leaves
	 * the question mark the spec asks for rather than a guessed one.
	 */
	getThinkingLevel?(): string | undefined;
}

/** The native UI surface this frontend draws on, widened to the component form it may hand over. */
interface WidgetUi {
	notify(message: string, type?: "info" | "warning" | "error"): void;
	setWidget(
		key: string,
		content: readonly string[] | undefined | ((tui: unknown, theme: WidgetTheme) => WidgetComponent),
		options?: { readonly placement?: "aboveEditor" | "belowEditor" },
	): void;
}

/**
 * Everything one draw of the usage widget reads, in the order it is written: the target's own display
 * result, the process-wide balance reading, the pricing period, the period's accrual, and the
 * allowance lines at the width this draw has.
 */
export interface WidgetReading {
	readonly display: ConsumptionDisplay;
	readonly balance: ProviderBalanceResult;
	readonly period: DisplayPeriod;
	readonly accrued: DisplayAccrued;
	readonly quota: readonly DisplayLine[];
}

/**
 * The Total and Round rows laid out together, at the widths that make their fields line up.
 *
 * Every column is right-aligned to the widest value at its position and, where a column follows it,
 * padded to the widest field, so each field starts at the same column whichever row it is on. A
 * row's last column is left unpadded, so no line carries trailing blanks. The two rows are different
 * scopes — the Total is the session's own current model and the whole main tree; the Round is that
 * target's additions within one Round — so the same field can hold a different figure on each row
 * and still start at the same column.
 */
function alignedLines(rows: readonly DisplayRow[]): DisplayLine[] {
	const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
	const valueWidths: number[] = [];
	const fieldWidths: number[] = [];
	for (let index = 0; index < columnCount; index++) {
		let valueWidth = 0;
		let fieldWidth = 0;
		for (const row of rows) {
			const column = row[index];
			if (column === undefined) continue;
			valueWidth = Math.max(valueWidth, column.value.length);
			fieldWidth = Math.max(fieldWidth, column.label.length + column.value.length);
		}
		valueWidths.push(valueWidth);
		fieldWidths.push(fieldWidth);
	}
	return rows.map(row =>
		row.map((column, index) => {
			const field = `${column.label}${column.value.padStart(valueWidths[index])}`;
			return { text: index < row.length - 1 ? field.padEnd(fieldWidths[index]) : field };
		}),
	);
}

/** One row's line with its own fixed prefix ahead of the first column. */
function prefixedLine(prefix: string, line: DisplayLine): DisplayLine {
	return line.map((piece, index) => (index === 0 ? { ...piece, text: `${prefix}${piece.text}` } : piece));
}

/**
 * The lines the detail form draws for the static agent tree: the root by its name, one line per model
 * the root itself consumed, and one line per descendant session.
 *
 * The prefix is this frontend's own: a model row is *not* an agent node, so it carries the tree's
 * continuation bar without a connector, while an agent row carries the connector its position among
 * its siblings calls for — the last of a parent's children closes with `└`, every earlier one branches
 * with `├`. A row's distance from the root is the only thing the shared result states; how a terminal
 * draws it is here.
 *
 * A descendant session's own consumption fields follow its name, and its current context reading
 * follows them as `Ctx: percent (tokens/budget)` — the subagent's own tokens against the same fixed
 * display budget the bar above uses for its channel, which is what the operator can read for a
 * session the budget bar does not follow. A session no binding observed carries no such field.
 */
function treeLines(rows: readonly AgentTreeRow[]): DisplayLine[] {
	return rows.map((row, index) => {
		const next = rows[index + 1];
		const last = next === undefined || next.depth <= row.depth;
		const continuation = "\u2502  ".repeat(Math.max(0, row.depth - 1));
		const head =
			row.depth === 0
				? row.name
				: row.kind === "session"
					? `${continuation}${last ? "\u2514\u2500 " : "\u251C\u2500 "}${row.name}`
					: `${continuation}\u2502  ${row.name}`;
		const parts = [head];
		if (row.fields !== undefined) parts.push(fieldsText(row.fields));
		if (row.context !== undefined) parts.push(`Ctx: ${contextText(row.context)}`);
		return [{ text: parts.join("  ") }];
	});
}

/**
 * The lines one display result renders as, or nothing when the mode has no widget at all.
 *
 * The reading order is the one this widget has always drawn: the fixed-budget line first — with the
 * monetary channel's own season mark ahead of it, and only where the host reported a context reading
 * for the bar to compare — then the period's accrued line for the monetary channel and the allowance
 * windows for the Codex one. The Total line follows, carrying the current model's own structure and
 * the main tree's Cost and Ref; the brief's Round row is laid out from the same columns, so the
 * two rows' fields line up vertically. Below that the entry's own form decides the content: the brief
 * draws the viewed session's own most recent Round, and the detail form draws the static agent tree of
 * the main session in its place — never both, which is what "the detail form keeps the Total and
 * replaces the Round row" means for a terminal. The two currencies are written apart and never added
 * together, and a mode without an amount policy contributes no amount of its own.
 *
 * The monetary channel keeps the superseded widget's one account row: the season mark, the fixed-budget
 * bar and effort, the provider balance and the period's accrued bar are written on a single line, in
 * that order (spec §192 keeps the old layout). The balance remains the official channel's own fact — a
 * token-only model has none (spec §134) and the allowance channel reads its own windows instead — so
 * the row is composed for the monetary mode alone, and a failure the process holds is shown there
 * rather than notified, never replacing the last reading.
 */
export function widgetLayout(reading: WidgetReading): readonly DisplayLine[] | undefined {
	const { display } = reading;
	if (display.mode === "hidden") return undefined;
	const lines: DisplayLine[] = [];
	if (display.mode === "monetary") {
		// The old account row, one line: a target whose host reported no context reading still shows the
		// season mark and the account facts — only the bar and its effort need a reading to compare.
		const account: DisplayPiece[] = [];
		const budget = budgetLine(display, reading.period);
		if (budget !== undefined) {
			account.push(...budget);
		} else {
			account.push({ text: seasonMark(reading.period) });
		}
		const balance = balanceLine(reading.balance);
		if (balance !== undefined) account.push(...balance);
		account.push(...accruedLine(reading.accrued));
		lines.push(account);
	} else {
		const budget = budgetLine(display, reading.period);
		if (budget !== undefined) lines.push(budget);
		if (display.mode === "allowance") lines.push(...reading.quota);
	}
	// The Total and the brief's Round are one layout: their columns are padded together so every
	// field starts at the same column on both rows. A detail form draws no Round, but still lays the
	// Total out against the same Round when one exists, so the Total line it keeps above the tree is
	// the very line the brief shows.
	const round = display.round;
	const rows = round === undefined ? [totalColumns(display)] : [totalColumns(display), roundColumns(round, display.mode)];
	const [totalLine, roundLine] = alignedLines(rows);
	lines.push(prefixedLine("Total:  ", totalLine));
	if (display.form === "detail" && display.agentTree !== undefined) {
		lines.push(...treeLines(display.agentTree));
	} else if (roundLine !== undefined) {
		lines.push(prefixedLine("Round:  ", roundLine));
	}
	return lines;
}

/**
 * The plain text of those same lines, for a host that draws text rather than a component.
 *
 * Nothing is lost by drawing this form instead of the coloured one: every figure, every threshold's
 * word and every narrower width's form is the same, and only the colour of a piece is left to the host
 * that has no theme of this extension's to map.
 */
export function widgetLines(reading: WidgetReading): string[] | undefined {
	return widgetLayout(reading)?.map(lineText);
}

/** One line with the theme's own colours, or exactly as it stands when there is no theme to draw with. */
function paintedLine(line: DisplayLine, theme: WidgetTheme | undefined): string {
	if (theme === undefined) return lineText(line);
	return line
		.map((piece, index) => {
			const separator = index === 0 ? "" : (piece.separator ?? "  ");
			if (piece.emphasis === undefined) return `${separator}${piece.text}`;
			if (piece.emphasis === "effort") return `${separator}${theme.getThinkingBorderColor(piece.text)(piece.text)}`;
			return `${separator}${theme.fg(EMPHASIS_COLORS[piece.emphasis], piece.text)}`;
		})
		.join("");
}

/**
 * Attach the usage widget to one OMP session binding.
 *
 * Attaching registers the native handlers the widget re-reads on and nothing else; it creates no
 * widget by itself and reads nothing, so a binding that is refused after this point leaves nothing
 * behind. The returned function releases it: the change subscriptions are stopped, the frontend is
 * unregistered from the UI's one boundary wait and the widget is cleared. That release is the
 * extension's own, and the dispose front-end that reaches it is the framework's — the binding's
 * single `cleanup`, called when the session that initialized the instance ends — so this frontend
 * subscribes no native shutdown hook of its own and nothing of it outlives the session it draws
 * through.
 *
 * The boundary wait is the UI's, not this binding's: registering a session with it arms one
 * process-wide timeout for the next instant the pricing season changes, and every redraw the wait
 * triggers re-reads the session the host is displaying at that moment. A session without a UI is
 * registered with nothing at all, which is what keeps a headless run free of a drawing timer.
 */
export function attachModelCostWidget(
	pi: OmpExtensionApi,
	runtime: ModelCostRuntime,
	timer: BoundaryTimer,
	drawing: WidgetDrawing,
): () => void {
	let context: WidgetContext | undefined;
	let unwatchViewed: (() => void) | undefined;
	let leaveTimer: (() => void) | undefined;
	// The framework adapter's surface widened to the one native getter above: read through a cast
	// rather than the exported parameter type, which stays the adapter's own surface.
	const api = pi as WidgetApi;

	/**
	 * The target this session is displaying, from the host's own public outlet when it publishes one
	 * and from the session it is bound to otherwise.
	 */
	const targetOf = (ctx: WidgetContext): DisplayTarget => {
		const facts = ctx.getViewedSession?.();
		// A host that publishes the outlet is read through it alone: the displayed session's own
		// readings, never the binding's, are the bar's and the effort's facts. A host without the
		// outlet has no separate view — the session this widget is bound to is the one being drawn —
		// so its own native context reading and actual thinking level answer here, the same fallback
		// the provider and model already take.
		const context = facts?.context ?? (facts === undefined ? ctx.getContextUsage?.() : undefined);
		const effort = facts === undefined ? api.getThinkingLevel?.() : facts.effort;
		return {
			sessionId: facts?.sessionId ?? ctx.sessionManager.getSessionId(),
			provider: facts?.provider ?? ctx.model?.provider ?? "",
			model: facts?.model ?? ctx.model?.id ?? "",
			...(context?.tokens === undefined ? {} : { contextTokens: context.tokens }),
			...(context?.contextWindow === undefined ? {} : { contextWindow: context.contextWindow }),
			...(effort === undefined ? {} : { effort }),
		};
	};

	/** One reading of that target, at the width the form being built has to fit into. */
	const readingOf = (ctx: WidgetContext, width: number | undefined): WidgetReading => ({
		display: runtime.presentation.of(targetOf(ctx)),
		balance: runtime.presentation.balance(),
		period: runtime.presentation.period(),
		accrued: runtime.presentation.accrued(),
		quota: runtime.presentation.quotaLines(width),
	});

	/**
	 * One hand-over to the host: the target's own display is read to decide whether there is a widget at
	 * all, and the drawing then goes over in the form this CLI draws in.
	 *
	 * The reading is taken here rather than kept: a redraw is these calls and nothing else, so whatever
	 * changed — a request that settled, the displayed session, the season — is what the drawing reads,
	 * and nothing a render does can reach the network, a file or the accounting.
	 */
	const render = (): void => {
		const ctx = context;
		// A session without a UI has nothing to draw on: the widget is not created at all, and the
		// business result behind it stays where it is.
		if (ctx === undefined || ctx.hasUI !== true) return;
		const ui = ctx.ui as unknown as WidgetUi;
		const layout = widgetLayout(readingOf(ctx, undefined));
		if (layout === undefined) {
			// A mode this extension does not display is not its widget at all: the host is handed the
			// clear, rather than a component that would draw nothing but still take a place in the
			// widget area. That is why the session's own display is read once before either hand-over —
			// the host draws at a width this call does not know, and a widget that must not exist cannot
			// be discovered at drawing time.
			ui.setWidget(MODEL_COST_WIDGET_KEY, undefined);
		} else if (drawing === "component") {
			// The host draws the lines itself, at its own width and with its own theme: the factory is
			// handed the two things only it knows, and every render call re-reads so a resize is a fresh
			// narrower or wider form rather than a stale one.
			ui.setWidget(MODEL_COST_WIDGET_KEY, (_tui, theme) => ({
				render: (width: number) => (widgetLayout(readingOf(ctx, width)) ?? []).map(line => paintedLine(line, theme)),
			}));
		} else {
			ui.setWidget(MODEL_COST_WIDGET_KEY, layout.map(lineText));
		}
		// The season this redraw shows may have changed since the wait was armed — a holiday period that
		// just opened, or a boundary that passed while the process was blocked — so the wait is
		// reconsidered here, from the schedule as it reads at this moment.
		timer.sync();
	};

	const followSession = (_event: OmpSessionEvent, ctx: OmpSessionContext): void => {
		context = ctx as WidgetContext;
		unwatchViewed?.();
		unwatchViewed = context.subscribeViewedSessionChanged?.(() => render());
		leaveTimer?.();
		leaveTimer = undefined;
		if (context.hasUI === true) {
			const host = context;
			leaveTimer = timer.attach(
				render,
				{
					schedule: (callback, delayMs) => host.setTimeout(callback, delayMs),
					cancel: handle => host.clearTimer(handle),
				},
				context.agent.kind === "main",
			);
		}
		render();
	};

	pi.on("session_start", followSession);
	pi.on("session_switch", followSession);
	pi.on("session_branch", followSession);

	const unwatchConsumption = runtime.view.subscribe(render);

	const detach = (): void => {
		unwatchConsumption();
		unwatchViewed?.();
		unwatchViewed = undefined;
		leaveTimer?.();
		leaveTimer = undefined;
		context?.ui.setWidget(MODEL_COST_WIDGET_KEY, undefined);
		context = undefined;
	};

	return detach;
}
