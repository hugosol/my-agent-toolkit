/**
 * The consumption display: the read-only result one display target shows, and the text rules the
 * shared half of the widget renders through.
 *
 * This module is the extension's display seam (S2) made concrete. It reads the same authority every
 * other read does — {@link ConsumptionView}, the process's accumulated consumption — and adds no
 * accumulation, no cache and no file of its own. What it decides is the part of a display that is
 * business rather than native:
 *
 * - **Mode.** A target's provider and exact model id decide, through the maintained data
 *   (`model-data.ts`), which consumption channel its display belongs to: `monetary`, `allowance`,
 *   `token-only` or `hidden`. The mode is what gates the rest.
 * - **Field selection.** The target's *own* provider/model scope shows amounts only where the mode
 *   has an amount policy at all. A `token-only` or `hidden` model shows its usage and no amount,
 *   no fee-structure ratio and no budget, even if a record were to carry one; the mixed scopes —
 *   the whole main tree — keep every known contribution, and the two currencies stay two fields
 *   that are never added together, converted or replaced by each other.
 * - **The fixed display budget.** DeepSeek and its Go ids compare against 450K, Codex against 272K,
 *   and nothing else against anything. It is a display fact only: exceeding it warns, and it never
 *   becomes a request, output, context-window or compaction limit.
 * - **The fee-structure reference ratio.** The proportions of one model's token buckets valued at
 *   *that model's own current price* and normalized. DeepSeek's price is the data's off-peak tier
 *   (the shared multiplier cancels in normalization, so peak and holiday do not change the ratio);
 *   Codex's is whatever the catalog query answers for its provider and model, which is where its
 *   four bucket amounts come from. The ratio is unavailable — never zero — when the price is
 *   missing, when the price does not state a bucket the scope used, or when the priced total is
 *   not positive, and no other model's price and no already-accumulated amount is ever substituted
 *   for it. An amount-bearing channel's Total still writes the ratio field with one dash per bucket
 *   in that case, and writes a Cost or Ref the tree has no value for as a dash beside it, rather
 *   than dropping the fields. Nothing here re-prices an amount that was already accounted.
 * - **Text.** Token counts, the two currency amounts and a ratio's percentages format here, so the
 *   total and Round lines of every channel read alike; a native frontend adds layout, color and the
 *   widget around them. A scope that has measured nothing at all writes a dash for its cache rate
 *   and any amount or ratio field its channel displays, so initialization keeps the row's fields
 *   rather than showing zeros it cannot vouch for. The four buckets' own total is what tells that
 *   empty scope from a measured one, and it is no longer a field any row writes (P23).
 * - **The form.** The entry's own display preference (`display-preference.ts`) decides which of the
 *   two forms a display result is drawn in, and a subagent's target answers the brief whatever that
 *   preference is: the detail form belongs to the main session, which is the session whose own
 *   provider/model pairs and whose descendants the agent tree below lists.
 * - **The Rounds.** One Round row is read from the same in-memory snapshots every other Round read
 *   uses: the open Round once it holds an addition of its own, otherwise the last one this instance
 *   saw end between two of its own boundaries — a Round that only began does not replace the previous
 *   reading with zeroes. It carries the target's current-model structure beside that Round's own Cost
 *   and Ref; a boundary pair this instance does not hold writes no Round at all.
 * - **The agent tree.** The detail form's rows are derived from the relations and own accumulations
 *   this instance already holds: the root by name, its own provider/model pairs one row each, and one
 *   row per descendant session's own accumulation, each with its distance from the root. No inclusive
 *   figure, aggregate node or per-agent query is added, and a model row is never an agent node.
 * - **The allowance windows.** The Codex 5h/7d readings are provider-account facts rather than parts
 *   of a target's consumption, so they are read beside the target instead of inside it, and what this
 *   seam adds to them is the state their reported reset instant has at the moment of reading.
 * - **The ratio segment.** The Codex ratio/left reading is the same kind of provider-account fact:
 *   the measurement this process learned from the paired readings the sources carried, rendered with
 *   the remaining weekly budget the *displayed* weekly percent leaves. It is absent — not empty and
 *   not zero — while one of the two windows is unreadable, and while the measurement has learned
 *   nothing yet it reads `estimating…` rather than looking like an exhausted allowance.
 */
import type { CatalogPrice } from "../../../../framework/core/protocol";
import type { CodexEstimate } from "../codex-estimate";
import { remainingBudget } from "../codex-estimate";
import type {
	CodexQuota,
	CodexQuotaFailure,
	CodexQuotaWindow,
	CodexResetState,
	CodexWindowKind,
} from "../codex-quota";
import { CODEX_WINDOW_DURATION_MS, resetStateOf } from "../codex-quota";
import type { OwnConsumption, SessionRecord, TokenBuckets } from "../consumption-document";
import { type ModelPricingData, classify } from "../model-data";
import type { ProviderBalance, ProviderBalanceResult } from "../provider-balance";
import { type Season, nextSeasonChange, seasonAt } from "../request-price";
import type { ConsumptionView, SessionIdentity } from "../request-accounting";
import type { DisplayForm, DisplayPreference } from "./display-preference";
import type { SessionContextReading } from "./session-context";

/** The accounting channel a display target's model belongs to, as the maintained data classifies it. */
export type ConsumptionMode = "monetary" | "allowance" | "token-only" | "hidden";

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

/** The bucket order every ratio is displayed in; a bucket the price does not state is left out. */
const RATIO_BUCKETS = ["cacheRead", "input", "cacheWrite", "output"] as const;

/** The token buckets a consumed amount is summed over, in one place. */
const TOKEN_BUCKETS = ["input", "cacheRead", "cacheWrite", "output"] as const;

/** The fixed display budget of one mode, or nothing for a mode whose display has no budget at all. */
export function displayBudgetOf(mode: ConsumptionMode): number | undefined {
	if (mode === "allowance") return CODEX_DISPLAY_BUDGET;
	if (mode === "monetary" || mode === "token-only") return DEEPSEEK_DISPLAY_BUDGET;
	return undefined;
}

/** One bucket's share of a scope's priced tokens, as a whole percent of the scope. */
export interface RatioPart {
	/** The usage bucket this part values. */
	readonly bucket: string;
	/** Its normalized whole-percent share; every part together sum to 100. */
	readonly percent: number;
}

/** One model's fee-structure reference ratio: its priced buckets, normalized. */
export interface ReferenceRatio {
	/** The currency of the price the parts were valued with. */
	readonly currency: string;
	readonly parts: readonly RatioPart[];
}

/** One display scope's approved fields: the usage it always shows and the amounts its policy allows. */
export interface ConsumptionFields {
	/** The four reported token buckets. */
	readonly tokens: TokenBuckets;
	/**
	 * Every bucket added up.
	 *
	 * No row writes it any more (P23): the display's columns are the cache rate, the ratio field and
	 * the amounts, and the total survives as the fact the cache column's own dash rule reads — a scope
	 * that has measured no token at all shows a dash rather than a rate.
	 */
	readonly sum: number;
	/** Cached share of the conversation input, as a whole percent; absent when no input was read or written. */
	readonly cacheHitRate?: number;
	/** The accounted amount in CNY, when the scope's policy produced one. */
	readonly costCny?: number;
	/** The reference estimate in USD, when the scope's policy produced one. */
	readonly referenceCostUsd?: number;
	/** The fee-structure reference ratio, when the scope's own model has a usable price for it. */
	readonly referenceRatio?: ReferenceRatio;
}

/** The context usage of the displayed session, as the host published it. */
export interface DisplayContextUsage {
	readonly tokens: number;
	/** The host's own context window for the displayed model, when it reported one. */
	readonly window?: number;
}

/**
 * One Round of the viewed session, as the brief writes it: the Round's own additions over two scopes,
 * exactly as the Total row reads its own two.
 *
 * The Round is that session's own consumption between two boundaries of its own — no descendant's
 * request is ever part of it — and it is the same provider-and-model shape the session's own
 * accumulation has, so the row's structure is read from the target's own current pair within it while
 * its Cost and Ref are the whole Round's.
 */
export interface RoundDisplay {
	/** The target's own current provider/model within this Round, gated by that pair's mode. */
	readonly current: ConsumptionFields;
	/** This Round's whole own accumulation, every model it used, both currencies kept apart. */
	readonly total: ConsumptionFields;
}

/**
 * The kind of row one static agent-tree line carries.
 *
 * - `root`: the tree's own top-level session, carried by its name alone — its consumption is exactly
 *   the model rows below it, so a figure on this row would be the same consumption twice.
 * - `model`: one provider/model pair of that root session's own accumulation. It is a row of a
 *   *model*, not an agent node: the pair is what the extension prices and displays, it is not a
 *   session, and its figures are that pair's own alone.
 * - `session`: one descendant session's own accumulation, one row each, whether it is a child or a
 *   grandchild of the root. It is that session's own consumption and nothing of its descendants'.
 */
export type AgentTreeRowKind = "root" | "model" | "session";

/**
 * One descendant session's own current context as the detail tree draws it: the tokens its
 * conversation holds, and the fixed display budget the same channel's bar compares them against.
 *
 * The budget is {@link displayBudgetOf}'s own figure for the session's current model — 450K for the
 * monetary and token-only channels and 272K for the allowance one — and never the host's reported
 * context window. A mode with no budget at all carries no context field, so a row that has one always
 * states both the figure and the budget it is read against.
 */
export interface AgentTreeContext {
	/** Estimated tokens the session's conversation holds, as its own binding reported them. */
	readonly tokens: number;
	/** The fixed display budget that session's mode compares against, from the one {@link displayBudgetOf}. */
	readonly budget: number;
}

/**
 * One row of the detail form's static tree: what a frontend draws as one line, before its own
 * indentation and colour.
 *
 * The list these rows come in is already ordered — the root, its model rows, then its descendants
 * depth-first — and each row states its own distance from the root: the root is 0, the root's model
 * rows and its children are 1, grandchildren 2. Which glyphs and how much padding express a depth is
 * the frontend's, which is why `depth` is a number here rather than a prefix.
 */
export interface AgentTreeRow {
	readonly kind: AgentTreeRowKind;
	/** The row's displayed name: a session's latest name, or `provider / model` for a model row. */
	readonly name: string;
	/** The row's distance from the root: 0 for the root, 1 for its model rows and its children, and so on. */
	readonly depth: number;
	/** The row's own applicable fields; absent on the root row, whose consumption is its model rows. */
	readonly fields?: ConsumptionFields;
	/**
	 * The descendant session's own current context, when this process observed one.
	 *
	 * It is a reading published by that session's own binding rather than a consumption figure, so it
	 * is carried on the descendant session rows alone — a model row is not a session, and the root row
	 * is the session the tree is *of*, whose own context the widget's budget bar already shows. Absent
	 * when no binding has reported one, and absent for a channel whose mode has no display budget: an
	 * unobserved or unbudgeted session shows no field rather than a zero.
	 */
	readonly context?: AgentTreeContext;
}

/** The fixed display budget and whether the reported context usage has crossed it. */
export interface DisplayBudget {
	readonly tokens: number;
	readonly exceeded: boolean;
}

/**
 * The pricing period one reading shows: the season the epoch is in, and when it next changes.
 *
 * It is a fact of the process's clock and of the accounting period rather than of the viewed session:
 * the same instant, the same schedule and the same holiday flag answer for whichever session is being
 * displayed, which is why it is not part of one target's display result. `nextChangeAt` is the first
 * instant after *this reading's own instant* whose season differs, so a caller that waits until it and
 * reads again sees the change; it is absent when no instant ahead differs, which is what a holiday
 * period is — and then there is nothing to wait for.
 */
export interface DisplayPeriod {
	/** The season at this reading's own instant. */
	readonly season: Season;
	/** Whether the open accounting period is a holiday period, which is off-peak for every instant. */
	readonly holiday: boolean;
	/** This reading's own instant, on the process's own clock (epoch milliseconds). */
	readonly at: number;
	/** The first instant after {@link at} whose season differs; absent when none ahead differs. */
	readonly nextChangeAt?: number;
}

/**
 * The open accounting period's own facts the display reads.
 *
 * Both are reading-time facts and neither touches a file: the holiday flag is the fact the store
 * adopted with the document it holds, and the session records are the ones its last load or commit
 * left, so a render that reads them never waits on disk and never starts a write of its own.
 */
export interface PeriodDisplaySource {
	/** Whether the open period is a holiday period. */
	holiday(): boolean;
	/** The period's own session records of this harness, in the order the document holds them. */
	sessions(): readonly SessionRecord[];
}

/** What one display target's frontend reads. */
export interface ConsumptionDisplay {
	readonly mode: ConsumptionMode;
	/**
	 * The form this target's display is drawn in: the entry's own preference while the target is the
	 * main session of its tree, and always the brief for a subagent — a subagent's view is fixed to
	 * the brief, so a focus does not turn that session's own display into the tree form, and the
	 * preference the operator set is what the main session answers with again once they return to it.
	 */
	readonly form: DisplayForm;
	/** The target's own current provider/model within the viewed session, gated by its mode. */
	readonly current: ConsumptionFields;
	/** The whole main tree the target belongs to, every provider and model, both currencies kept apart. */
	readonly tree: ConsumptionFields;
	/**
	 * The detail form's static agent tree of the main session this target is: the root by name, that
	 * session's own provider/model rows, and one row per descendant session.
	 *
	 * It is present for a target that is the root of its own tree and absent for every other, because
	 * the detail form belongs to that session alone: what the frontend draws it in is
	 * {@link ConsumptionDisplay.form}, so the rows are readable from the same result in either form.
	 * It is a derived view of the relations and own accumulations this instance already holds — no
	 * aggregate node, no expansion and no second accumulation is added for it.
	 */
	readonly agentTree?: readonly AgentTreeRow[];
	/**
	 * The viewed session's most recent Round that holds consumption to show, as the brief writes it:
	 * the open Round once it has an addition of its own, otherwise the last one this instance saw end
	 * with both of its boundaries at hand. A Round that only began — or whose first settled Turn
	 * carried zero usage — leaves the previous reading in place rather than replacing it with zeroes.
	 *
	 * It is absent when this instance holds neither — a restored accumulation is a session total
	 * rather than a Round, so a session whose Round this instance never saw begin has no row here
	 * rather than a fabricated zero. Nothing is read from a file and no Round is reconstructed from a
	 * document to fill it.
	 */
	readonly round?: RoundDisplay;
	readonly budget?: DisplayBudget;
	/** The target's actual effective effort, `?` when the host could not report one. */
	readonly effort: string;
	readonly context?: DisplayContextUsage;
}

/** The target one display result is read for: the viewed session and its own current model. */
export interface DisplayTarget {
	readonly sessionId: string;
	readonly provider: string;
	readonly model: string;
	readonly contextTokens?: number;
	readonly contextWindow?: number;
	readonly effort?: string;
}

/** The read-only display this instance answers frontends with. */
export interface ConsumptionPresenter {
	/** The display result of one target, from the same authority the rest of the extension reads. */
	of(target: DisplayTarget): ConsumptionDisplay;
	/**
	 * The provider balance reading this process holds, as the display reads it.
	 *
	 * It is a fact of the provider account rather than of the viewed session, which is why it is not
	 * part of one target's display result: the same reading is shown beside whichever session is being
	 * displayed, and it is absent until a query has answered. A failure carries no reading of its own
	 * — the last accepted reading, if any, stays what it was.
	 */
	balance(): ProviderBalanceResult;
	/**
	 * The Codex allowance windows this process holds, as the display reads them.
	 *
	 * The same provider-account fact as the balance: one set for the process, beside whichever session
	 * is being displayed, and absent until a source has reported one. Each window carries the state its
	 * reported reset instant has at this reading's own moment, so the display never has to decide it
	 * from a stale instant of its own.
	 */
	quota(): CodexQuotaDisplay;
	/**
	 * The ratio/left segment this process's measurement shows, or nothing when neither window is
	 * readable.
	 *
	 * It reads the windows beside the measurement because both are needed: a measurement of a pair
	 * says nothing while one of the windows is unavailable, and the weekly line then renders exactly
	 * as it did before this reading existed.
	 */
	estimate(): CodexQuotaEstimateDisplay | undefined;
	/**
	 * The pricing period this process is in, as the display reads it.
	 *
	 * The same process-wide kind of reading as the balance and the allowance windows: the season, the
	 * period's holiday flag, and the instant the season next changes. A frontend draws the season with
	 * it and waits until {@link DisplayPeriod.nextChangeAt} to re-read.
	 */
	period(): DisplayPeriod;
	/**
	 * The open period's accrued consumption, as the accrued line reads it.
	 *
	 * The same process-wide fact the balance and the windows are: the period's own total in CNY and each
	 * of its sessions' own shares, read from the records this instance already holds — no file is read,
	 * which is what keeps a redraw from touching the disk.
	 */
	accrued(): DisplayAccrued;
	/**
	 * The allowance windows as display lines at one drawing width, in reading order, or nothing when this
	 * display has no allowance line at all.
	 *
	 * The width is the one the lines will be drawn at, and it is what chooses between the window line's
	 * forms; omitted means the most informative form, which is what a frontend that has no width of its
	 * own draws. Each window is one line, the five-hour one first, and the estimate's own segment rides
	 * on the weekly line.
	 */
	quotaLines(width?: number): readonly DisplayLine[];
}

/** One allowance window as the display reads it: the reading, its instant, and its reset's state. */
export interface CodexQuotaWindowDisplay {
	readonly usedPercent: number;
	/** The reset instant the source reported, as epoch milliseconds; absent when it reported none. */
	readonly resetsAt?: number;
	/** The state of that instant at the moment this display was read. */
	readonly resetState: CodexResetState;
	/** When this reading was accepted, on the process's own clock. */
	readonly obtainedAt: number;
}

/** The allowance windows one display reads, and the last startup attempt's failure beside them. */
export interface CodexQuotaDisplay {
	readonly fiveHour?: CodexQuotaWindowDisplay;
	readonly weekly?: CodexQuotaWindowDisplay;
	readonly failure?: CodexQuotaFailure;
}

/**
 * The ratio/left reading one display shows beside the allowance windows, or nothing when none is due.
 *
 * It is one measurement of the provider account rather than part of a window: the ratio comes from
 * the paired readings the windows' own sources carried (`codex-estimate.ts`), and `left` is the
 * unconsumed weekly share expressed in five-hour quotas, recomputed from the weekly percent *this*
 * reading displays rather than from the reading that produced the ratio — so it follows weekly
 * consumption on every redraw. `left` precedes the ratio because it is the more actionable number.
 *
 * The segment's wording is the measurement's own and is rendered here, because there is nothing left
 * for a frontend to decide about it; the two numbers sit beside it for one that lays them out
 * differently. `estimating…` is the reading before any sample has qualified: it says that the
 * measurement exists and has not learned anything yet, never that there is no allowance left.
 */
export interface CodexQuotaEstimateDisplay {
	/** The stored qualifying ratio; absent until a sample has qualified. */
	readonly ratio?: number;
	/** The remaining weekly budget in five-hour quotas; absent without a ratio. */
	readonly left?: number;
	/** The segment itself: `estimating…` before a ratio exists, `left≈N.N×5h · ratio≈R.R` once one does. */
	readonly text: string;
}

/** What one presenter is built from. */
export interface PresentationInputs {
	/** The process's read-only consumption results. */
	readonly view: ConsumptionView;
	/**
	 * The process's per-session context readings, as each session's own binding published them: what a
	 * descendant session row shows. A session no binding reported reads as nothing, never as zero.
	 */
	readonly sessionContext: SessionContextReading;
	/** The entry's own display preference: which form a main session's display is drawn in. */
	readonly display: DisplayPreference;
	/** The maintained model and price data the mode comes from. */
	readonly data: ModelPricingData;
	/** The catalog query the ratio reads a model's current price through, exactly as the framework does. */
	readonly priceOf: (provider: string, model: string) => CatalogPrice | undefined;
	/** The provider balance reading this process holds. */
	readonly balance: ProviderBalance;
	/** The Codex allowance windows this process holds. */
	readonly quota: CodexQuota;
	/** The Codex ratio measurement this process holds. */
	readonly estimate: CodexEstimate;
	/** The open accounting period's own facts: its holiday flag and its session records. */
	readonly period: PeriodDisplaySource;
	/** The instant source the read-time readings use, on the process's own clock. */
	readonly now: () => number;
}

/**
 * The proportions of one scope's token buckets valued at one price, normalized to whole percents.
 *
 * Every bucket the *price* states is a part, and a bucket the scope used but the price does not
 * state makes the whole ratio unavailable rather than leaving that usage looking free. The priced
 * total has to be positive for a ratio to mean anything. Percentages are apportioned by largest
 * remainder, so they always sum to exactly 100 and no part is dropped to rounding.
 */
export function referenceRatioOf(tokens: TokenBuckets, price: CatalogPrice): ReferenceRatio | undefined {
	const values: { readonly bucket: string; readonly value: number }[] = [];
	for (const bucket of RATIO_BUCKETS) {
		const amount = price.amounts[bucket];
		if (amount === undefined) {
			if (tokens[bucket] > 0) return undefined;
			continue;
		}
		values.push({ bucket, value: tokens[bucket] * amount });
	}
	if (values.length === 0) return undefined;
	const total = values.reduce((sum, part) => sum + part.value, 0);
	if (total <= 0) return undefined;

	const exact = values.map(part => (part.value / total) * 100);
	const percents = exact.map(value => Math.floor(value));
	let remaining = 100 - percents.reduce((sum, value) => sum + value, 0);
	const byRemainder = exact
		.map((value, index) => ({ index, remainder: value - percents[index] }))
		.sort((left, right) => (right.remainder - left.remainder) || (left.index - right.index));
	for (const { index } of byRemainder) {
		if (remaining <= 0) break;
		percents[index] += 1;
		remaining -= 1;
	}
	return { currency: price.currency, parts: values.map((part, index) => ({ bucket: part.bucket, percent: percents[index] })) };
}

/**
 * Whether one Round's own consumption holds anything real.
 *
 * A Round that only began holds nothing yet, but `differenceOf` can still answer a bucket whose
 * tokens and amounts are all zero, so the display asks for a real addition rather than a present one.
 */
function holdsConsumption(own: OwnConsumption): boolean {
	for (const models of Object.values(own)) {
		for (const entry of Object.values(models)) {
			if (TOKEN_BUCKETS.some(bucket => entry.tokens[bucket] !== 0)) return true;
			if ((entry.costCny ?? 0) !== 0 || (entry.referenceCostUsd ?? 0) !== 0) return true;
		}
	}
	return false;
}

/**
 * The approved fields of one scope of a session's own consumption.
 *
 * An optional `provider`/`model` narrows the scope to that one pair — the current-model scope — and
 * an optional `price` asks for its ratio, which is computed from that scope's tokens alone. With no
 * narrowing the whole mixed scope is summed, which is what the main tree reads and what keeps each
 * known contribution and each currency.
 */
export function fieldsOf(
	own: OwnConsumption,
	options: {
		readonly provider?: string;
		readonly model?: string;
		readonly price?: CatalogPrice;
		/** Whether the scope's policy carries amounts at all; `false` reads usage alone. */
		readonly amounts?: boolean;
	} = {},
): ConsumptionFields {
	const amounts = options.amounts ?? true;
	const tokens = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
	let costCny: number | undefined;
	let referenceCostUsd: number | undefined;
	for (const [provider, models] of Object.entries(own)) {
		if (options.provider !== undefined && provider !== options.provider) continue;
		for (const [model, entry] of Object.entries(models)) {
			if (options.model !== undefined && model !== options.model) continue;
			for (const bucket of TOKEN_BUCKETS) tokens[bucket] += entry.tokens[bucket];
			if (!amounts) continue;
			if (entry.costCny !== undefined) costCny = (costCny ?? 0) + entry.costCny;
			if (entry.referenceCostUsd !== undefined) referenceCostUsd = (referenceCostUsd ?? 0) + entry.referenceCostUsd;
		}
	}
	const sum = TOKEN_BUCKETS.reduce((total, bucket) => total + tokens[bucket], 0);
	const conversationInput = tokens.input + tokens.cacheRead;
	// A scope with no conversation input has no cache hit rate at all: zero reads of zero is not a
	// hit rate of zero, which is why the field is absent rather than zero.
	const cacheHitRate = conversationInput > 0 ? Math.round((tokens.cacheRead / conversationInput) * 100) : undefined;
	const referenceRatio = options.price === undefined ? undefined : referenceRatioOf(tokens, options.price);
	return {
		tokens,
		sum,
		...(cacheHitRate === undefined ? {} : { cacheHitRate }),
		...(costCny === undefined ? {} : { costCny }),
		...(referenceCostUsd === undefined ? {} : { referenceCostUsd }),
		...(referenceRatio === undefined ? {} : { referenceRatio }),
	};
}

/**
 * Build the process's display presenter over the results it reads.
 *
 * Building has no effect of its own: nothing is read and no listener is added. Each `of` call reads
 * the current results, so a frontend that re-reads after a change notification sees the change.
 */
export function createPresentation(inputs: PresentationInputs): ConsumptionPresenter {
	const { view, data, priceOf, display, balance, quota, estimate, now, period: periodFacts, sessionContext } = inputs;

	/**
	 * The top-level session one session belongs to, walked through the reliable direct parents this
	 * instance holds: the main tree's aggregates cover that whole tree, not the session's own subtree.
	 */
	const rootOf = (sessionId: string): string => {
		const seen = new Set<string>([sessionId]);
		let cursor = sessionId;
		for (;;) {
			const parent = view.identity(cursor)?.parentSessionId;
			if (parent === undefined || parent === null || seen.has(parent)) return cursor;
			seen.add(parent);
			cursor = parent;
		}
	};

	/**
	 * One provider/model pair's own fields inside a session's own accumulation: the amount policy of
	 * *that pair's* mode gates what it shows — a pair with no amount policy shows its usage alone, with
	 * no amount and no ratio, and no catalog query is even made for it, whatever a harness catalog would
	 * answer. It is the gate the target's own current-model scope uses and the one each of a root's
	 * model rows uses, so neither can drift from the other.
	 */
	const pairFieldsOf = (own: OwnConsumption, provider: string, model: string): ConsumptionFields => {
		const pairMode = classify(data, provider, model).mode;
		const prices = pairMode === "monetary" || pairMode === "allowance";
		const price = prices ? priceOf(provider, model) : undefined;
		return fieldsOf(own, { provider, model, amounts: prices, ...(price === undefined ? {} : { price }) });
	};

	/**
	 * One Round of one target as the brief writes it: the target's own current pair within the Round
	 * for the row's structure, and the Round's whole own accumulation for its Cost and Ref.
	 */
	const roundOf = (target: DisplayTarget, own: OwnConsumption): RoundDisplay => ({
		current: pairFieldsOf(own, target.provider, target.model),
		total: fieldsOf(own),
	});

	/**
	 * The static agent tree of one session that is the root of its own tree: the root by name, that
	 * session's own provider/model pairs one row each, then one row per descendant session, in the
	 * order the relations put them (depth-first from the root, children in the order this instance
	 * learned them), each row carrying how far it sits from the root.
	 *
	 * What it draws from is exactly what every other read draws from: the reliable direct parents and
	 * the own accumulations this instance holds. A descendant contributes its own accumulation alone —
	 * nothing of *its* descendants' — which is why no row here is an inclusive figure and no row is
	 * added for one; the root's own figure is its model rows rather than a row of its own; and a
	 * relation that happens to describe a circle terminates at the session it already added instead of
	 * walking forever. A session carries one row whether it is a child or a grandchild of the root, and
	 * a pair the root consumed that this extension does not display is still one of the root's own rows,
	 * with the usage alone that its policy allows.
	 *
	 * Each descendant row also carries that session's own current context reading when this process
	 * observed one — a reading its own binding published, not a consumption figure — so the tree shows
	 * what each subagent's context holds beside what it has spent. A row with no observed reading
	 * carries no such field.
	 */
	const agentTreeOf = (rootId: string): readonly AgentTreeRow[] => {
		const children = new Map<string, SessionIdentity[]>();
		for (const identity of view.identities()) {
			const parent = identity.parentSessionId;
			if (parent === null) continue;
			const siblings = children.get(parent);
			if (siblings === undefined) children.set(parent, [identity]);
			else siblings.push(identity);
		}
		const rows: AgentTreeRow[] = [{ kind: "root", name: view.identity(rootId)?.name ?? rootId, depth: 0 }];
		const own = view.own(rootId) ?? {};
		for (const [provider, models] of Object.entries(own)) {
			for (const model of Object.keys(models)) {
				rows.push({
					kind: "model",
					name: `${provider} / ${model}`,
					depth: 1,
					fields: pairFieldsOf(own, provider, model),
				});
			}
		}
		const included = new Set<string>([rootId]);
		const walk = (parentId: string, depth: number): void => {
			for (const child of children.get(parentId) ?? []) {
				if (included.has(child.sessionId)) continue;
				included.add(child.sessionId);
				// The descendant's own current context, as this process observed its binding publish it, read
				// against the same fixed display budget the bar uses for that session's own channel — chosen
				// from the model the reading was taken on, never from the host's context window. A mode with
				// no budget and an unobserved session both carry no field rather than a zero.
				const observed = sessionContext.read(child.sessionId);
				const budget =
					observed === undefined
						? undefined
						: displayBudgetOf(classify(data, observed.provider ?? "", observed.model ?? "").mode);
				rows.push({
					kind: "session",
					name: child.name,
					depth,
					fields: fieldsOf(view.own(child.sessionId) ?? {}),
					...(observed === undefined || budget === undefined
						? {}
						: { context: { tokens: observed.tokens, budget } }),
				});
				walk(child.sessionId, depth + 1);
			}
		};
		walk(rootId, 1);
		return rows;
	};

	/** The ratio/left reading of this moment, over the weekly window a caller has already found readable. */
	const estimateReading = (weekly: CodexQuotaWindow): CodexQuotaEstimateDisplay => {
		const ratio = estimate.state().ratio;
		if (ratio === undefined) return { text: "estimating…" };
		const left = remainingBudget(weekly.usedPercent, ratio);
		return { ratio, left, text: `left≈${left.toFixed(1)}×5h · ratio≈${ratio.toFixed(1)}` };
	};

	return {
		of(target) {
			const mode = classify(data, target.provider, target.model).mode;
			// The target's own scope is its own current provider/model within the viewed session, gated by
			// that pair's amount policy; the tree beside it is mixed by construction, so nothing about it
			// is gated: every model's known contribution stays and the two currencies stay separate.
			const current = pairFieldsOf(view.own(target.sessionId) ?? {}, target.provider, target.model);
			const tree = fieldsOf(view.inclusiveTotals(rootOf(target.sessionId)));
			// The detail form belongs to the main session alone, and a session with no direct parent is
			// the root of its own tree: a subagent's view answers the brief however the entry's own
			// preference stands, which is what keeps that display fixed while the operator is focused on
			// it and what the main session answers with again when the focus returns.
			const root = view.identity(target.sessionId);
			const isTreeRoot = root !== undefined && root.parentSessionId === null;
			const form: DisplayForm = isTreeRoot ? display.form() : "brief";
			const rounds = view.roundTotals(target.sessionId);
			// The brief keeps the last completed Round on screen while the open Round holds no addition
			// of its own yet — a Round that only began (or whose first settled Turn carried zero usage)
			// must not replace the reading the operator was just looking at with zeroes. The first real
			// addition switches the row to the open Round; the read-only seam still states the two
			// separately, so no frontend makes this choice.
			const open = rounds?.current;
			const latest = open !== undefined && holdsConsumption(open) ? open : rounds?.previous;
			const round = latest === undefined ? undefined : roundOf(target, latest);
			const budgetTokens = displayBudgetOf(mode);
			const budget =
				budgetTokens === undefined
					? undefined
					: { tokens: budgetTokens, exceeded: target.contextTokens !== undefined && target.contextTokens > budgetTokens };
			return {
				mode,
				form,
				current,
				tree,
				// The detail form's content, read for the one target it belongs to: a subagent's display
				// has no tree of its own in this form, which is what keeps that view the brief.
				...(isTreeRoot ? { agentTree: agentTreeOf(target.sessionId) } : {}),
				...(round === undefined ? {} : { round }),
				...(budget === undefined ? {} : { budget }),
				effort: target.effort ?? "?",
				...(target.contextTokens === undefined
					? {}
					: {
							context: {
								tokens: target.contextTokens,
								...(target.contextWindow === undefined ? {} : { window: target.contextWindow }),
							},
						}),
			};
		},
		balance: () => balance.result(),
		estimate: () => {
			// Both windows have to be readable for anything to be said about the pair between them;
			// a window no source has reported leaves the weekly line as it rendered before this
			// measurement existed.
			const { fiveHour, weekly } = quota.result();
			if (fiveHour === undefined || weekly === undefined) return undefined;
			return estimateReading(weekly);
		},
		// The pricing period this process is in: the season at this reading's own instant and the
		// instant it next changes. It is read here rather than stored, exactly like the windows' reset
		// states, because whether a boundary is still ahead of the clock is a question only the moment
		// of reading can answer.
		period: () => {
			const at = now();
			const holiday = periodFacts.holiday();
			const nextChangeAt = nextSeasonChange(data, at, holiday);
			return {
				season: seasonAt(data, at, holiday),
				holiday,
				at,
				...(nextChangeAt === undefined ? {} : { nextChangeAt }),
			};
		},
		// The period's own accrual, from the records this instance already holds: each record's CNY
		// amounts added up, one share per record, in the order the document keeps them. A reference amount
		// in another currency is not part of a CNY bar, and a record with no CNY amount at all contributes
		// a zero rather than being dropped from the order the palette follows.
		accrued: () =>
			periodFacts.sessions().reduce<DisplayAccrued>(
				(accrual, record) => {
					const costCny = Object.values(record.own).reduce(
						(sessionSum, models) =>
							sessionSum + Object.values(models).reduce((modelSum, entry) => modelSum + (entry.costCny ?? 0), 0),
						0,
					);
					return {
						totalCny: accrual.totalCny + costCny,
						sessionCostsCny: [...accrual.sessionCostsCny, costCny],
					};
				},
				{ totalCny: 0, sessionCostsCny: [] },
			),
		quotaLines: (width?: number) => {
			const at = now();
			const reading = quota.result();
			const estimate =
				reading.fiveHour === undefined || reading.weekly === undefined ? undefined : estimateReading(reading.weekly).text;
			const windowOf = (window: CodexQuotaWindow | undefined, kind: CodexWindowKind): CodexQuotaWindowDisplay | undefined =>
				window === undefined
					? undefined
					: {
							usedPercent: window.usedPercent,
							...(window.resetsAt === undefined ? {} : { resetsAt: window.resetsAt }),
							resetState: resetStateOf(window, kind, at),
							obtainedAt: window.obtainedAt,
						};
			const failure = reading.failure?.detail;
			return (["five-hour", "weekly"] as const).map(kind => {
				const window = windowOf(kind === "five-hour" ? reading.fiveHour : reading.weekly, kind);
				return quotaWindowLine({
					kind,
					...(window === undefined ? {} : { window }),
					...(kind === "weekly" && estimate !== undefined ? { estimate } : {}),
					...(failure === undefined ? {} : { failure }),
					now: at,
					...(width === undefined ? {} : { width }),
				});
			});
		},
		quota: () => {
			// The reset state is read at this moment rather than stored with the reading: the reported
			// instant is a fact that does not move, while whether it is still ahead of the clock is a
			// question only the moment of reading can answer.
			const at = now();
			const result = quota.result();
			const windowOf = (window: CodexQuotaWindow | undefined, kind: CodexWindowKind): CodexQuotaWindowDisplay | undefined =>
				window === undefined
					? undefined
					: {
							usedPercent: window.usedPercent,
							...(window.resetsAt === undefined ? {} : { resetsAt: window.resetsAt }),
							resetState: resetStateOf(window, kind, at),
							obtainedAt: window.obtainedAt,
						};
			const fiveHour = windowOf(result.fiveHour, "five-hour");
			const weekly = windowOf(result.weekly, "weekly");
			return {
				...(fiveHour === undefined ? {} : { fiveHour }),
				...(weekly === undefined ? {} : { weekly }),
				...(result.failure === undefined ? {} : { failure: result.failure }),
			};
		},
	};
}

/** A token count as the display writes it: whole thousands past 100K, otherwise plainly grouped. */
export function formatTokens(count: number): string {
	if (count >= 100_000) {
		const thousands = count / 1000;
		const whole = Math.floor(thousands);
		const tenth = Math.round((thousands - whole) * 10);
		return tenth >= 10 ? `${(whole + 1).toLocaleString("en-US")}.0K` : `${whole.toLocaleString("en-US")}.${tenth}K`;
	}
	return count.toLocaleString("en-US");
}

/**
 * One descendant session's context as the display writes it: the share of its channel's fixed display
 * budget the session's tokens fill, then the tokens themselves over that budget — the same
 * `percent (tokens/budget)` form the fixed-budget bar reads, without the bar itself. The label a
 * frontend leads it with is that frontend's own.
 */
export function contextText(context: AgentTreeContext): string {
	const percentile = (context.tokens / context.budget) * 100;
	return `${percentile.toFixed(0)}% (${formatTokens(context.tokens)}/${formatTokens(context.budget)})`;
}

/** A CNY amount as the display writes it: two decimals past one cent, four below it. */
export function formatCny(amount: number): string {
	return `\u00A5${amount >= 0.01 ? amount.toFixed(2) : amount.toFixed(4)}`;
}

/** A USD reference amount as the display writes it, with the same decimal rule. */
export function formatUsd(amount: number): string {
	return `$${amount >= 0.01 ? amount.toFixed(2) : amount.toFixed(4)}`;
}

/** The name each bucket takes in a ratio, as the channels' own wording. */
const RATIO_BUCKET_NAMES: Record<string, string> = {
	cacheRead: "CacheR",
	input: "In",
	cacheWrite: "CacheW",
	output: "Out",
};

/** The three-part wording the monetary channel's own price states, without a cache-write part. */
const MONETARY_BUCKET_NAMES: Record<string, string> = { cacheRead: "Cache", input: "In", output: "Out" };

/** The display mark of each currency a ratio can be valued in. */
const CURRENCY_MARKS: Record<string, string> = { USD: "$" };

/**
 * The fee-structure ratio field one channel displays, before any value is known: the priced buckets
 * and the currency mark its label carries. A channel that displays a ratio still writes this field
 * with dashes when no ratio value is available, instead of dropping the field from the row.
 */
export interface RatioField {
	readonly currency: string;
	readonly buckets: readonly string[];
}

/** The bucket labels a ratio writes, as each channel's own wording. */
function ratioLabels(buckets: readonly string[]): string {
	// The monetary channel's three parts are the familiar Cache/In/Out wording; a price that also
	// states cache write (the Codex catalog's four amounts) names all four.
	const names = buckets.includes("cacheWrite") ? RATIO_BUCKET_NAMES : MONETARY_BUCKET_NAMES;
	return buckets.map(bucket => names[bucket] ?? RATIO_BUCKET_NAMES[bucket]).join("/");
}

/** Which amount field a row writes even while the scope has no value for it. */
export type AmountField = "cost" | "ref";

/**
 * One labelled value of a Total or Round row, before a frontend lays the row out.
 *
 * The label is the fixed part (`Cache: `, or a ratio's own wording and `：`) and the value is what
 * varies in width. Splitting a row into columns is what lets a frontend align two rows vertically
 * without re-deciding any figure: this module says what each column is, the frontend says how much
 * room it gets.
 */
export interface DisplayColumn {
	readonly label: string;
	readonly value: string;
}

/** One Total or Round row's columns, in the order the row writes them. */
export type DisplayRow = readonly DisplayColumn[];

/** The ratio field one mode's current-model scope displays, or nothing when the mode has none. */
function ratioFieldOf(mode: ConsumptionMode): RatioField | undefined {
	if (mode === "monetary") return { currency: "CNY", buckets: ["cacheRead", "input", "output"] };
	if (mode === "allowance") return { currency: "USD", buckets: ["cacheRead", "input", "cacheWrite", "output"] };
	return undefined;
}

/** The label one ratio column leads with: the channel's bucket wording and the currency mark. */
function ratioColumnLabel(currency: string, buckets: readonly string[]): string {
	return `${CURRENCY_MARKS[currency] ?? "\u00A5"}${ratioLabels(buckets)}\uff1a`;
}

/**
 * The cache and ratio columns of one scope: its hit rate — a dash while the scope has measured no
 * token at all, the initialization row; a zero percent when it measured usage without conversation
 * input — and the ratio field its channel displays: a value where the scope has a usable price, one
 * dash per bucket where it has the field but no value.
 *
 * Whether the scope has measured anything is read from the four buckets' own total, which is why
 * that total stays a computed field of the scope even though no row writes it as a column (P23).
 */
function structureColumns(fields: ConsumptionFields, ratioField?: RatioField): DisplayColumn[] {
	const columns: DisplayColumn[] = [
		{ label: "Cache: ", value: fields.sum === 0 ? "-" : `${fields.cacheHitRate ?? 0}%` },
	];
	if (fields.referenceRatio !== undefined) {
		const ratio = fields.referenceRatio;
		columns.push({
			label: ratioColumnLabel(ratio.currency, ratio.parts.map(part => part.bucket)),
			value: ratio.parts.map(part => part.percent).join(":"),
		});
	} else if (ratioField !== undefined) {
		columns.push({
			label: ratioColumnLabel(ratioField.currency, ratioField.buckets),
			value: ratioField.buckets.map(() => "--").join(":"),
		});
	}
	return columns;
}

/**
 * The amount columns of one scope, each currency on its own: a known value as itself, and a field the
 * scope's channel displays but has no value for as a dash, so an amount-bearing row keeps its fields
 * rather than silently dropping them.
 */
function amountColumns(fields: ConsumptionFields, shown: readonly AmountField[] = []): DisplayColumn[] {
	const columns: DisplayColumn[] = [];
	if (fields.costCny !== undefined) columns.push({ label: "Cost: ", value: formatCny(fields.costCny) });
	else if (shown.includes("cost")) columns.push({ label: "Cost: ", value: "-" });
	if (fields.referenceCostUsd !== undefined) columns.push({ label: "Ref: ", value: formatUsd(fields.referenceCostUsd) });
	else if (shown.includes("ref")) columns.push({ label: "Ref: ", value: "-" });
	return columns;
}

/** One scope's columns: its structure and the amounts its scope really carries. */
function fieldsColumns(fields: ConsumptionFields): DisplayColumn[] {
	return [...structureColumns(fields), ...amountColumns(fields)];
}

/** One row's columns joined in their plain, unaligned form. */
function rowText(row: DisplayRow): string {
	return row.map(column => `${column.label}${column.value}`).join("  ");
}

/**
 * One scope's whole row: its structure and the amounts its scope really carries.
 *
 * No row writes a Sum column any more (P23). The four buckets' total is still computed — the cache
 * column's own dash rule reads it — but it is no longer a field the display writes.
 */
export function fieldsText(fields: ConsumptionFields): string {
	return rowText(fieldsColumns(fields));
}

/**
 * One Round's own columns: the target's current-model structure within that Round — with the same
 * ratio field its mode displays, dashes included — then that Round's own Cost and Ref. A Round writes
 * no bucket total of its own and no time, either: its own additions are a scope of their own rather
 * than the session the Total is the span of.
 */
export function roundColumns(round: RoundDisplay, mode?: ConsumptionMode): DisplayRow {
	return [
		...structureColumns(round.current, mode === undefined ? undefined : ratioFieldOf(mode)),
		...amountColumns(round.total),
	];
}

/**
 * The amount fields one display's Total always writes: the target's own channel's amount, plus the
 * other currency whenever the tree really carries one. A field whose value is missing is written as
 * a dash, so the Total keeps the old row's fields even at initialization.
 */
function displayedAmounts(display: ConsumptionDisplay): readonly AmountField[] {
	const shown: AmountField[] = [];
	if (display.mode === "monetary" || display.tree.costCny !== undefined) shown.push("cost");
	if (display.mode === "allowance" || display.tree.referenceCostUsd !== undefined) shown.push("ref");
	return shown;
}

/**
 * One display's Total columns: the current model's own structure — with the ratio field its mode
 * displays, dashes included — then the main tree's Cost and Ref. The two currencies are kept
 * apart, and an amount field the row's channels apply but hold no value for is a dash, so the old
 * row's fields survive initialization rather than disappearing. The tree's bucket total is not a
 * column of this row: no row writes a Sum column (P23).
 */
export function totalColumns(display: ConsumptionDisplay): DisplayRow {
	return [
		...structureColumns(display.current, ratioFieldOf(display.mode)),
		...amountColumns(display.tree, displayedAmounts(display)),
	];
}

/** One display's whole total line, in its plain unaligned form. */
export function totalText(display: ConsumptionDisplay): string {
	return rowText(totalColumns(display));
}

/**
 * The provider balance line, or nothing when this process holds neither a reading nor a failure.
 *
 * A reading is written in its own currency with the same decimal rule as every other CNY amount; a
 * failure is written as the fact it is, without a currency mark and without a zero, so it can never
 * be read as a balance of nothing. The colour a frontend puts on a low balance is the frontend's,
 * not this text's.
 */
export function balanceText(result: ProviderBalanceResult): string | undefined {
	if (result.reading !== undefined) return `Balance: ${formatCny(result.reading.total)}`;
	if (result.failure !== undefined) return `Balance: unavailable (${result.failure.detail})`;
	return undefined;
}

/**
 * The mark the monetary line leads with: the period's own pricing season, as the operator knows it.
 *
 * A holiday period is its own fact rather than a third season — the whole period is priced off-peak —
 * so it keeps the mark it always had, and the two ordinary seasons are the peak hour and the off-peak
 * one beside it.
 */
export function seasonMark(period: DisplayPeriod): string {
	if (period.holiday) return "\u{1F3D6}\u{FE0F}";
	return period.season === "peak" ? "\u{1F525}" : "\u{1F319}";
}

/**
 * The semantic emphasis of one piece of a display line.
 *
 * Text that should catch an operator's eye is described here and nowhere else: shared logic decides
 * *what* a row means, and the frontend decides which of its own theme's colours expresses it, so one
 * result can be drawn by a second frontend without restating a threshold. `effort` is the one
 * emphasis whose colour is a level's own — a frontend paints it with its thinking-level colour — and
 * `segment1`…`segment8` is the per-session palette the accrued bar cycles through, in the fixed order
 * that bar has always drawn its sessions in.
 */
export type DisplayEmphasis =
	| "plain"
	| "dim"
	| "muted"
	| "success"
	| "warning"
	| "error"
	| "effort"
	| "segment1"
	| "segment2"
	| "segment3"
	| "segment4"
	| "segment5"
	| "segment6"
	| "segment7"
	| "segment8";

/**
 * One piece of one display line.
 *
 * `text` is written as it stands, and `separator` is what precedes it in the line — two spaces where a
 * piece does not state its own — so a piece that has to abut the previous one (an effort value and its
 * label) states `""` rather than being glued in by the drawer. Emphasis is a description rather than a
 * colour: the frontend maps it, and a piece without one is left to the frontend's own default.
 */
export interface DisplayPiece {
	readonly text: string;
	readonly emphasis?: DisplayEmphasis;
	readonly separator?: string;
}

/** One whole line of a display result, before a frontend's own theme and width. */
export type DisplayLine = readonly DisplayPiece[];

/** One line's plain text, exactly as a frontend without colours or a width of its own writes it. */
export function lineText(line: DisplayLine): string {
	return line.map((piece, index) => `${index === 0 ? "" : (piece.separator ?? "  ")}${piece.text}`).join("");
}

/** The columns one piece text occupies: every character it is written with is a single column. */
function textWidth(text: string): number {
	return [...text].length;
}

/** One piece text cut to `maxWidth` columns, with an ellipsis when something was dropped. */
function truncateText(text: string, maxWidth: number): string {
	const characters = [...text];
	if (characters.length <= maxWidth) return text;
	return `${characters.slice(0, Math.max(0, maxWidth - 1)).join("")}\u2026`;
}

/**
 * The emphasis the fixed-budget bar is drawn with, from how much of that budget the context uses.
 *
 * The four bands are the ones this bar has always warned in, and they are the reason the bar is not a
 * plain text field: an operator reads the colour before the number.
 */
export function barEmphasis(percent: number): DisplayEmphasis {
	if (percent < 36) return "dim";
	if (percent < 64) return "success";
	if (percent < 82) return "warning";
	return "error";
}

/**
 * The emphasis a provider balance amount is written with.
 *
 * Two amounts are worth noticing rather than one: below ten yuan the reading is a warning, and below
 * five it is an error. Both are strictly-below comparisons, so a balance of exactly ten is not yet a
 * warning and one of exactly five is not yet an error.
 */
export function balanceEmphasis(amount: number): DisplayEmphasis {
	if (amount < 5) return "error";
	if (amount < 10) return "warning";
	return "plain";
}

/** One session's accrued CNY cost, and the palette emphasis its segment is drawn with. */
export interface AccruedSegment {
	readonly costCny: number;
	readonly emphasis: DisplayEmphasis;
}

/** The period's accrued consumption: its total, and the per-session segments beside it. */
export interface DisplayAccrued {
	/** The period's accrued CNY consumption over every session it holds. */
	readonly totalCny: number;
	/** Each session's own accrued CNY cost, in the document's order; a session may have none. */
	readonly sessionCostsCny: readonly number[];
}

/** The palette segment emphasises cycle through, in the order sessions are drawn in. */
const SEGMENT_EMPHASES: readonly DisplayEmphasis[] = [
	"segment1",
	"segment2",
	"segment3",
	"segment4",
	"segment5",
	"segment6",
	"segment7",
	"segment8",
];

const BLOCKS_PER_CHAR = 8;
const MAX_SEGMENT_BAR = 50;
const FINE_BLOCK_CNY = 0.05;
const COARSE_BLOCK_CNY = 1;
/** The accrued total the bar switches from fine to coarse blocks at. */
const SEGMENT_SCALE_THRESHOLD_CNY = 20;
const MAX_FINE_BLOCKS = 400;

/** The eighth-block character one 1–8 block run of a fine segment ends with. */
const PARTIAL_BLOCKS = ["", "\u258F", "\u258E", "\u258D", "\u258C", "\u258B", "\u258A", "\u2589", "\u2588"];

/**
 * One session's accrued consumption as the bar draws it, in the order the accrued line's segments are
 * built: sessions with nothing accrued carry no segment at all rather than an invisible one.
 */
function accruedSegments(accrued: DisplayAccrued): readonly AccruedSegment[] {
	return accrued.sessionCostsCny
		.map((costCny, index) => ({ costCny, emphasis: SEGMENT_EMPHASES[index % SEGMENT_EMPHASES.length] }))
		.filter(segment => segment.costCny > 0);
}

/**
 * Shrink raw allocations to fit a cap, keeping at least one block of each and letting the largest
 * absorb the rounding, so a bar never grows past its cap and never loses a session entirely.
 */
function scaleAllocations(raws: readonly number[], cap: number): readonly number[] {
	const rawTotal = raws.reduce((sum, raw) => sum + raw, 0);
	if (rawTotal <= cap) return raws;
	const scale = cap / rawTotal;
	const allocations = raws.map(raw => Math.max(1, Math.round(raw * scale)));
	const difference = cap - allocations.reduce((sum, allocation) => sum + allocation, 0);
	let largest = 0;
	for (let index = 1; index < allocations.length; index += 1) {
		if ((allocations[index] as number) > (allocations[largest] as number)) largest = index;
	}
	allocations[largest] = Math.max(1, (allocations[largest] as number) + difference);
	return allocations;
}

/**
 * The per-session accrued bar, or nothing when nothing has been accrued.
 *
 * The bar is the old one: up to twenty yuan it is drawn in eighth-blocks worth five cents each, so a
 * small period's shape is still visible; past twenty it is drawn in whole blocks worth a yuan, where a
 * session that never reached a yuan has no segment rather than an invisible sliver. Either form is
 * capped in columns, and a session's segment keeps its own palette colour so the same session reads
 * the same shade on every redraw.
 */
export function segmentBar(accrued: DisplayAccrued): DisplayLine | undefined {
	const segments = accruedSegments(accrued);
	if (segments.length === 0 || accrued.totalCny <= 0) return undefined;
	const pieces: DisplayPiece[] = [{ text: "[" }];
	if (accrued.totalCny <= SEGMENT_SCALE_THRESHOLD_CNY) {
		const blocks = scaleAllocations(
			segments.map(segment => Math.ceil(segment.costCny / FINE_BLOCK_CNY)),
			MAX_FINE_BLOCKS,
		);
		segments.forEach((segment, index) => {
			const allocation = blocks[index] as number;
			const full = Math.floor((allocation - 1) / BLOCKS_PER_CHAR);
			const remainder = ((allocation - 1) % BLOCKS_PER_CHAR) + 1;
			const text = `${"\u2588".repeat(full)}${PARTIAL_BLOCKS[remainder] ?? ""}`;
			pieces.push({ text, emphasis: segment.emphasis, separator: "" });
		});
	} else {
		const widths = scaleAllocations(
			segments.filter(segment => segment.costCny >= COARSE_BLOCK_CNY).map(segment => Math.ceil(segment.costCny / COARSE_BLOCK_CNY)),
			MAX_SEGMENT_BAR,
		);
		segments
			.filter(segment => segment.costCny >= COARSE_BLOCK_CNY)
			.forEach((segment, index) => {
				pieces.push({ text: "\u2588".repeat(widths[index] as number), emphasis: segment.emphasis, separator: "" });
			});
	}
	pieces.push({ text: "]", separator: "" });
	return pieces;
}

/**
 * The accrued line: the period's own total, and the per-session bar beside it.
 *
 * It is the period's consumption rather than any one session's — the same fact for whichever session
 * is being displayed, exactly as the balance and the allowance windows are — and the total is written
 * with the same amount rule every other CNY figure uses.
 */
export function accruedLine(accrued: DisplayAccrued): DisplayLine {
	const pieces: DisplayPiece[] = [{ text: `\u23F3 Accrued: ${formatCny(accrued.totalCny)}` }];
	const bar = segmentBar(accrued);
	if (bar !== undefined) pieces.push(...bar.map((piece, index) => (index === 0 ? { ...piece, separator: " " } : piece)));
	return pieces;
}

/**
 * The provider balance line, or nothing when this process holds neither a reading nor a failure.
 *
 * A reading is written in its own currency with the same decimal rule as every other CNY amount, and
 * the amount carries the emphasis its own size calls for; a failure is written as the fact it is,
 * without a currency mark and without a zero, so it can never be read as a balance of nothing. The
 * line leads with the superseded widget's own money-bag mark, the way every balance it drew did.
 */
export function balanceLine(result: ProviderBalanceResult): DisplayLine | undefined {
	if (result.reading !== undefined) {
		return [
			{ text: "\u{1F4B0} Balance: " },
			{
				text: formatCny(result.reading.total),
				emphasis: balanceEmphasis(result.reading.total),
				separator: "",
			},
		];
	}
	if (result.failure !== undefined) return [{ text: `\u{1F4B0} Balance: unavailable (${result.failure.detail})` }];
	return undefined;
}

/** The label and the unreported wording each allowance window has always been drawn with. */
const WINDOW_TEXT: Readonly<Record<CodexWindowKind, { readonly label: string; readonly missing: string; readonly minutes: boolean }>> = {
	"five-hour": { label: "5h", missing: "limit not reported", minutes: true },
	weekly: { label: "7d", missing: "limit not reported", minutes: false },
};

/** The countdown width of one window: minutes for the five-hour one, hours for the weekly one. */
function countdownText(difference: number, minutes: boolean): string {
	if (difference < 0) return minutes ? "0m" : "0h";
	const total = Math.floor(difference / 60_000);
	if (minutes) {
		if (difference > 0 && total === 0) return "1m";
		const days = Math.floor(total / (24 * 60));
		const hours = Math.floor((total % (24 * 60)) / 60);
		const rest = total % 60;
		const parts: string[] = [];
		if (days > 0) parts.push(`${days}d`);
		if (hours > 0) parts.push(`${hours}h`);
		if (rest > 0) parts.push(`${rest}m`);
		return parts.length > 0 ? parts.join(" ") : "0m";
	}
	const days = Math.floor(difference / (24 * 60 * 60_000));
	const hours = Math.floor((difference % (24 * 60 * 60_000)) / 3_600_000);
	return days > 0 ? `${days}d ${hours}h` : `${Math.max(1, Math.ceil(difference / 3_600_000))}h`;
}

/** The absolute local instant a reset falls on, as the display has always written it. */
function localTimeText(at: number): string {
	const date = new Date(at);
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	const hours = String(date.getHours()).padStart(2, "0");
	const minutes = String(date.getMinutes()).padStart(2, "0");
	return `${month}/${day} ${hours}:${minutes}`;
}

/** One window's reset, as the text its own state calls for: the wait, or why it cannot be waited for. */
function resetText(window: CodexQuotaWindowDisplay, kind: CodexWindowKind, now: number): string {
	const minutes = WINDOW_TEXT[kind].minutes;
	if (window.resetState === "valid" && window.resetsAt !== undefined) {
		return `resets in ${countdownText(window.resetsAt - now, minutes)} (${localTimeText(window.resetsAt)})`;
	}
	if (window.resetState === "unknown" || window.resetsAt === undefined) return "reset unknown";
	return window.resetState === "expired"
		? `reset expired (${localTimeText(window.resetsAt)})`
		: `reset invalid (${localTimeText(window.resetsAt)})`;
}

/**
 * The emphasis one window's own reading is drawn with: how far its consumption has run ahead of the
 * time its reset allows, once that reset is one the window can be measured against at all.
 */
function pacingEmphasis(usedPercent: number, timePercent: number | null): DisplayEmphasis {
	if (timePercent === null) return "muted";
	const difference = usedPercent - timePercent;
	if (difference <= 0) return "plain";
	if (difference <= 15) return "success";
	if (difference <= 30) return "warning";
	return "error";
}

/** The pacing bar of one window: twenty cells, with the time marker drawn inside it. */
function pacingBar(usedPercent: number, timePercent: number | null, emphasis: DisplayEmphasis): DisplayLine {
	const width = 20;
	const clamped = Math.min(100, Math.max(0, usedPercent));
	const usedCells = Math.round((clamped / 100) * width);
	const markerIndex =
		timePercent === null ? null : Math.min(width - 1, Math.max(0, Math.round((timePercent / 100) * width)));
	const pieces: DisplayPiece[] = [];
	let heavy = "";
	const flush = (): void => {
		if (heavy.length === 0) return;
		pieces.push({ text: heavy, emphasis, separator: "" });
		heavy = "";
	};
	for (let cell = 0; cell < width; cell += 1) {
		if (cell === markerIndex) {
			flush();
			pieces.push({ text: "\u2502", separator: "" });
		} else if (cell < usedCells) {
			heavy += "\u2501";
		} else {
			flush();
			pieces.push({ text: "\u2500", separator: "" });
		}
	}
	flush();
	return pieces;
}

/**
 * One allowance window as one display line at one width, or nothing when the display has no such line.
 *
 * The width is a narrowing, not a rewrite: the most informative form is the bar, the window's own
 * percentage against the percentage of its window that has already passed, the estimate beside it and
 * the reset's absolute instant; when the line cannot fit, the bar goes first, then the absolute instant
 * (the countdown alone is what an operator needs to act on), then the estimate's tail, and a line too
 * narrow for even that is cut with an ellipsis. An unreported window is said to be unreported rather
 * than drawn as an empty one, and the startup attempt's own reason rides along where one exists.
 */
export function quotaWindowLine(input: {
	readonly kind: CodexWindowKind;
	readonly window?: CodexQuotaWindowDisplay;
	readonly estimate?: string;
	readonly failure?: string;
	readonly now: number;
	readonly width?: number;
}): DisplayLine {
	const { label, missing, minutes } = WINDOW_TEXT[input.kind];
	const failure = input.failure === undefined ? [] : [{ text: ` \u00B7 ${input.failure}`, separator: "" }];
	if (input.window === undefined) return [{ text: `${label} ${missing}` }, ...failure];
	const window = input.window;
	const elapsed = timePercentOf(window, input.kind, input.now);
	const emphasis = pacingEmphasis(window.usedPercent, elapsed);
	const head: DisplayPiece[] = [
		{ text: label, separator: "" },
		{ text: `${window.usedPercent.toFixed(1)}%`, emphasis, separator: " " },
		{ text: " / ", separator: "" },
		{ text: elapsed === null ? "--" : elapsed.toFixed(1), separator: "" },
		{ text: "%", separator: "" },
	];
	if (input.estimate !== undefined) head.push({ text: ` \u00B7 ${input.estimate}`, emphasis, separator: "" });
	const waiting = window.resetState === "valid" && window.resetsAt !== undefined;
	const absolute = [{ text: ` \u00B7 ${resetText(window, input.kind, input.now)}`, separator: "" }];
	const countdown = waiting
		? [{ text: ` \u00B7 resets in ${countdownText((window.resetsAt as number) - input.now, minutes)}`, separator: "" }]
		: [];
	const candidates: DisplayLine[] = [
		[
			head[0] as DisplayPiece,
			...pacingBar(window.usedPercent, elapsed, emphasis).map((piece, index) =>
				index === 0 ? { ...piece, separator: " " } : piece,
			),
			...head.slice(1),
			...absolute,
		],
		[...head, ...absolute],
		[...head, ...countdown],
		head,
	];
	const width = input.width;
	const fitted = width === undefined ? candidates[0] : candidates.find(candidate => textWidth(lineText(candidate)) <= width);
	if (fitted !== undefined) return [...fitted, ...failure];
	// Nothing fits: the narrowest form the window has, cut to the width it was drawn at.
	const minimal = candidates[candidates.length - 1] as DisplayLine;
	return [{ text: truncateText(lineText(minimal), width as number) }, ...failure];
}

/** The share of one window's own span that has already passed, or nothing when it cannot be measured. */
function timePercentOf(window: CodexQuotaWindowDisplay, kind: CodexWindowKind, now: number): number | null {
	if (window.resetState !== "valid" || window.resetsAt === undefined) return null;
	const duration = CODEX_WINDOW_DURATION_MS[kind];
	return ((now - (window.resetsAt - duration)) / duration) * 100;
}

/** The fixed-budget bar as the widget writes it, before any native color is applied. */
function barText(budget: DisplayBudget, tokens: number): string {
	const width = 20;
	const percentile = (tokens / budget.tokens) * 100;
	const filled = Math.round((Math.min(100, Math.max(0, percentile)) / 100) * width);
	const bar = `${"\u2588".repeat(filled)}${"\u2591".repeat(width - filled)}`;
	return `[${bar} ${percentile.toFixed(0).padStart(3)}% (${formatTokens(tokens)}/${formatTokens(budget.tokens)})]`;
}

/**
 * The line the fixed budget, the effort and the pricing season are written on, or nothing when the
 * host reported no context reading for a bar to compare.
 *
 * The season mark leads the monetary channel's line — that is where an operator has always read which
 * price the next request will be anchored at — and the effort *value* carries the level's own colour
 * rather than a fixed one, because the level is what the colour means; its label stays the line's own
 * text, as it always has.
 */
export function budgetLine(display: ConsumptionDisplay, period: DisplayPeriod): DisplayLine | undefined {
	if (display.budget === undefined || display.context === undefined) return undefined;
	const pieces: DisplayPiece[] = [];
	if (display.mode === "monetary") pieces.push({ text: seasonMark(period) });
	pieces.push(
		{ text: barText(display.budget, display.context.tokens), emphasis: barEmphasis((display.context.tokens / display.budget.tokens) * 100) },
		{ text: "Effort: " },
		{ text: display.effort, emphasis: "effort", separator: "" },
	);
	return pieces;
}
