/**
 * The context business: the per-session context readings this extension shows, and the fixed budget
 * each one is read against.
 *
 * The reading itself is the framework's: its own observation source holds the latest context each
 * session's host reported, keyed by the session id the harness reports —
 * `SessionObservations` in `framework/core/observations.ts`, fed by the adapter's collection points
 * and by the framework's Round bookkeeping. This module is the narrow read one session's context
 * answers, plus the policy that turns a reading into what a display states. A reading is not an
 * accounting number and nothing about it is written to the storage root.
 *
 * The reading carries the session's own current model with it because the figure a context is
 * compared against is that model channel's display budget. It is never the host's context window:
 * the host reports a window, and this extension compares against its own fixed figure.
 *
 * A session nobody observed has no reading rather than a zero one: an absent entry is drawn as an
 * absent field, never as a context of nothing.
 *
 * The budget the reading is compared against is this module's own rule rather than the display's:
 * a fixed figure per accounting channel (see {@link displayBudgetOf}), applied here so every reader
 * of a context reading — the widget's bar, a descendant session's row — compares the same figure.
 * The host's context window is a different fact and is never substituted for it.
 */
import { type Classification, type ModelPricingData, classify } from "../pricing/model-data";

/** One session's own context as its host reported it: the used tokens and the model they belong to. */
export interface ObservedSessionContext {
	/** Estimated tokens the session's conversation holds, as its own host reported them. */
	readonly tokens: number;
	/** The provider of that session's current model at the instant the reading was taken. */
	readonly provider?: string;
	/** The exact id of that session's current model at the instant the reading was taken. */
	readonly model?: string;
}

/** The read half of the readings: the latest context of one session, or nothing when none was observed. */
export interface SessionContextReading {
	read(sessionId: string): ObservedSessionContext | undefined;
}

/**
 * The accounting channel a model belongs to, as the maintained model data classifies it.
 *
 * It is the channel whose fixed display budget a context reading is read against, so it is named
 * here beside that budget rather than by each display that shows one.
 */
export type ConsumptionMode = Classification["mode"];

/**
 * The fixed display budget of DeepSeek and its OpenCode Go ids, in tokens.
 *
 * The figure is a displayed reference the bar and its warning compare against; the host's own
 * context window is a different fact and this number never becomes a limit of the request, the
 * output or the compaction.
 */
export const DEEPSEEK_DISPLAY_BUDGET = 450_000;

/** The fixed display budget of the Codex channel, in tokens, with the same display-only meaning. */
export const CODEX_DISPLAY_BUDGET = 272_000;

/** The fixed display budget of one mode, or nothing for a mode whose display has no budget at all. */
export function displayBudgetOf(mode: ConsumptionMode): number | undefined {
	if (mode === "allowance") return CODEX_DISPLAY_BUDGET;
	if (mode === "monetary" || mode === "token-only") return DEEPSEEK_DISPLAY_BUDGET;
	return undefined;
}

/**
 * One session's context read against its channel's fixed budget: what a row or a bar shows.
 *
 * The budget is chosen from the model the reading was taken on — the one the reading carries — and
 * never from the host's context window. A session no reading was observed for, and a channel with no
 * display budget, both answer nothing rather than a zero reading.
 */
export interface ContextUsage {
	readonly tokens: number;
	readonly budget: number;
}

/** The observed context of one session, read against the budget of its own model's channel. */
export function contextUsageOf(
	reading: ObservedSessionContext | undefined,
	data: ModelPricingData,
): ContextUsage | undefined {
	if (reading === undefined) return undefined;
	const budget = displayBudgetOf(classify(data, reading.provider ?? "", reading.model ?? "").mode);
	return budget === undefined ? undefined : { tokens: reading.tokens, budget };
}

/** A fixed display budget and whether a reported context usage has crossed it. */
export interface ContextBudget {
	readonly tokens: number;
	readonly exceeded: boolean;
}

/**
 * The budget of one mode and whether the context usage reported for it has crossed that budget.
 *
 * `contextTokens` is the host's reported usage, not its window: a session that reported no usage
 * cannot have crossed anything, so only the budget is stated.
 */
export function contextBudgetOf(
	mode: ConsumptionMode,
	contextTokens: number | undefined,
): ContextBudget | undefined {
	const tokens = displayBudgetOf(mode);
	return tokens === undefined
		? undefined
		: { tokens, exceeded: contextTokens !== undefined && contextTokens > tokens };
}
