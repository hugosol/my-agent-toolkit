/**
 * Request accounting: what each real model request adds to its session's own consumption, counted
 * once, from the facts the request itself fixed.
 *
 * This module owns the business half of an observation: it anchors a request's price when its Turn
 * starts (from the reported provider and exact model, the request's own start instant, the accounting
 * period's holiday fact and — for a channel the maintained data does not price — the catalog price
 * the framework snapshotted at that same start; see `request-price.ts`), and when the Turn settles it
 * adds the response's reliable usage to that actual session's own provider-and-model bucket. The
 * results it holds are read-only through {@link ConsumptionView}, which is the extension's display
 * seam: what a frontend reads is the same value a test reads, and no private field is a surface.
 *
 * The rules it implements are the approved ones:
 *
 * - **Once per Turn, by identity.** A Turn is accounted the first time its end arrives and never
 *   again: an end that repeats for the same session and Turn identity is ignored, a repeated end
 *   after a round boundary is ignored, and a Turn whose usage was missing when it was first seen is
 *   *also* marked as handled — no later reading back-fills it, and nothing is ever re-derived from
 *   the totals. Two Turns that happen to report the same numbers are separate identities and are
 *   both counted. Those marks live as long as this instance does and are never persisted.
 * - **Reliable usage only.** The four reported buckets are added exactly as delivered — cached
 *   tokens are their own bucket and are never added into the input bucket — and a Turn the framework
 *   could not establish a reliable usage for is skipped with a notice. A skipped request is not a
 *   free request: nothing is recorded for it, and the operator is told.
 * - **An amount only where a policy and a price exist.** A monetary Turn adds the CNY amount its
 *   anchored price and the reported usage yield; a monetary Turn whose price the data is missing
 *   keeps its usage and skips the amount, with a notice; an allowance Turn whose channel the harness
 *   priced at that request's start adds the USD *reference* amount the same usage makes of it, in its
 *   own field, while one whose channel stated no price keeps usage without an amount and needs no
 *   notice, because no stated reference is no amount policy rather than an error; a token-only or
 *   hidden Turn keeps usage without an amount and needs no notice either; a hidden Turn is not this
 *   extension's request at all and is not accounted. The two currencies are never added together,
 *   converted or substituted for each other, and the current mode never erases the other's
 *   contribution.
 * - **Additions only.** Amounts already accumulated — including the ones a baseline loaded from the
 *   disk already carried — are never re-priced, re-derived, deleted or rewritten because the price
 *   data, the harness's own catalog, the model or the season changed later. A request's own price was
 *   fixed at its start.
 *
 * Two derived results read that same authority without adding to it. An actual session's identity
 * ({@link ConsumptionView.identity}) is its latest reported display name and its reliable
 * direct parent, with the loaded document filling in a fact no delivery has reported yet; a name the
 * host cannot report neither overwrites a known one nor invents one, and the session is shown by its
 * own identity when it has never had a name. The facts a delivery names are kept as they arrive —
 * including the harness's own facts delivery, made when a session's name changed rather than at its
 * next boundary — so what the display reads is current whether or not the session it names is the
 * one being viewed, and whether or not its next Turn or Round has happened yet. A session's
 * inclusive totals ({@link ConsumptionView.inclusiveTotals}) are that session's own consumption plus
 * every descendant's own, each counted once: the tree is summed from the sessions' own values along
 * the direct parent relations, so no parent's total is ever used to derive a child's, a parent needs
 * no record for its child to be included, and a session outside the subtree contributes nothing.
 *
 * The one write this module makes is a session snapshot's commit, at its Round's end, through
 * {@link ConsumptionStore} — and only when the session's own consumption really grew: a rename
 * travels with the next such save rather than through a write of its own, and a session that
 * consumed nothing writes nothing. A snapshot that did not land is reported and then *dropped*: the
 * affected session goes on from the record the disk holds (or from nothing, when it holds none) and
 * the additions the failed snapshot carried are never re-submitted, while a period a reset replaced
 * underneath this instance discards everything it accumulated rather than publishing a closed
 * period's consumption into the new one. Nothing is zeroed, no already-handled request identity is
 * forgotten, and no second attempt, ledger or lease is introduced for it.
 *
 * Round totals are the same boundaries read backwards, and they are the one thing this module keeps
 * in memory alone. A Round's start fixes a snapshot of that session's own accumulation; its end
 * measures the difference, and it becomes the previous Round; while a Round is open, the current one
 * is that difference read now ({@link ConsumptionView.roundTotals}). Only this instance's own
 * boundaries are used — a restored accumulation is a session total and not a Round, a Round whose
 * start this instance never saw is hidden, and nothing is ever written to the document for a Round,
 * because a Round is not persisted state.
 *
 * A session's Session span is the second thing this module owns, and it is a fact rather than a
 * difference: the instant of the first user input the harness attributed to the user
 * ({@link RequestAccounting.userInput}) and the instant of the latest Round end it observed, kept by
 * `session-span.ts` as what this instance saw plus what the loaded document already carried. It
 * never sums anything — no descendant's time, no other session's — and it is read through
 * {@link ConsumptionView.sessionSpan}. Like a name, an observed instant is not an accumulation: it
 * survives a snapshot that did not land and travels with the next one that does, and a period switch
 * clears it with everything else measured in the period it is closing.
 */
import type {
	FeedbackTransport,
	RoundDelivery,
	SessionFacts,
	TurnEndDelivery,
	TurnStartDelivery,
	TurnUsage,
	UserInputDelivery,
} from "../../../framework/core/protocol";
import type { ModelConsumption, OwnConsumption, SessionRecord, TokenBuckets } from "./consumption-document";
import { type ConsumptionStore, type SessionCommit, unusableBaselineNotice } from "./consumption-store";
import type { ModelPricingData } from "./model-data";
import { type RequestPrice, requestPriceOf } from "./request-price";
import { type SessionSpanReading, createSessionSpans } from "./session-span";

/** The read-only consumption this instance holds: the extension's display seam, read never written. */
export interface ConsumptionView {
	/**
	 * One actual session's own consumption as this instance has it: the usage it loaded from the
	 * baseline plus what it has accounted since, or `undefined` when it holds nothing for that
	 * session.
	 */
	own(sessionId: string): OwnConsumption | undefined;
	/**
	 * The identity facts this instance holds for one actual session — its latest display name and its
	 * direct parent — or `undefined` when it holds neither a delivery nor a record for that session.
	 *
	 * The name is display data and never an identity: a rename changes what this answers and nothing
	 * else about the session. What this instance has been told since it started is what it answers,
	 * with the document's own record filling in a fact no delivery has reported yet, so a display
	 * reads a session's latest name as soon as it is reported rather than at the next save.
	 */
	identity(sessionId: string): SessionIdentity | undefined;
	/**
	 * Every actual session this instance can answer an identity for, each once, in the order it learned
	 * them: the records the loaded document holds first, then the sessions a delivery has since
	 * reported. A session this instance knows nothing about is not among them, and a session it knows
	 * only a name or a parent for is.
	 *
	 * It exists because the relations are held per session rather than as a tree: a reader that has to
	 * walk them — the detail's static agent tree, for instance — reads this one list and builds the
	 * index it needs, instead of asking about ids it would first have to know.
	 */
	identities(): readonly SessionIdentity[];
	/**
	 * The inclusive totals of one actual session's parent tree: that session's own consumption plus
	 * every descendant's own, each contribution counted once.
	 *
	 * It is a derived view of the same authority rather than a second consumption: nothing here is a
	 * stored total, and the relations are the reliable direct ones this instance holds — a delivery's
	 * reported parent, or a loaded record's — so aggregating over the tree neither requires a parent to
	 * have been saved before its child nor invents a placeholder for one, and no child's contribution
	 * is ever derived by subtracting from a parent's. A session this instance holds no fact about has
	 * an empty total rather than an absent one, because there is nothing to add to it.
	 */
	inclusiveTotals(sessionId: string): OwnConsumption;
	/**
	 * The Round totals this instance can derive for one actual session, or `undefined` when it
	 * holds no Round information for it at all.
	 *
	 * They are differences between this instance's own runtime snapshots — the accumulation the
	 * session's Round began from and the one it has now or ended with — so they are only ever
	 * published for a session whose Round this instance really saw begin, in the period it is
	 * accumulating in. Nothing here is read from a file and no Round is reconstructed from a
	 * document: a restored accumulation is a session total, not a Round.
	 */
	roundTotals(sessionId: string): RoundTotals | undefined;
	/**
	 * One actual session's Session span as this instance has it: the first user input it observed for
	 * that session in this period, and the latest Round end it observed, or `undefined` while either
	 * of those facts is unknown.
	 *
	 * It is the session's own time — what a display reads for the main session of the tree a target
	 * belongs to — and never an inclusive one: no descendant's time is added to it. A reading that the
	 * loaded document already carried is answered as soon as the baseline is loaded, which is what
	 * makes a restart continue the same span rather than starting a new one.
	 */
	sessionSpan(sessionId: string): SessionSpanReading | undefined;
	/** Subscribe to a change of those results; returns the unsubscribe that stops it. */
	subscribe(listener: () => void): () => void;
}

/**
 * One actual session's own identity as this instance holds it: display data plus the position that
 * is not the owner.
 *
 * The direct parent is the session that spawned this one — which may itself be a subagent — and not
 * the owner a State value would follow; a top-level session has none, while `undefined` is reserved
 * for a session this instance holds no fact about at all.
 */
export interface SessionIdentity {
	/** The session's identity inside its harness. */
	readonly sessionId: string;
	/** The latest display name, falling back to the agent's own name then id, then the session id. */
	readonly name: string;
	/** The same harness's direct parent session id, or `null` for a session with none. */
	readonly parentSessionId: string | null;
}

/**
 * One actual session's Round totals, as the display seam exposes them.
 *
 * Both are the session's *own* consumption between two of its boundaries: no descendant's request
 * is ever part of them, and each is expressed in the same provider-and-model shape as the
 * session's own accumulation, so a difference is taken bucket by bucket and amount by amount.
 */
export interface RoundTotals {
	/**
	 * The Round that is open for that session: its own additions so far, from the snapshot it began
	 * from. Absent when no Round is open.
	 */
	readonly current?: OwnConsumption;
	/**
	 * The last Round of that session this instance saw end with both of its boundaries at hand: its
	 * own additions over that whole Round. Absent until such a Round ended.
	 */
	readonly previous?: OwnConsumption;
}

/** The accounting one process runs: the read-only results, the deliveries it applies, and its end. */
export interface RequestAccounting {
	readonly view: ConsumptionView;
	/** The request's own start: its price is anchored now, for its end to use. */
	turnStarted(delivery: TurnStartDelivery): void;
	/** The request's settled response: its usage is accounted once, or the skip is reported. */
	turnSettled(delivery: TurnEndDelivery): void;
	/** One actual session's Round opening: its own accumulation is snapshotted as that Round's base. */
	roundStarted(delivery: RoundDelivery): void;
	/** One actual session's Round end: its own consumption is saved when it grew. */
	roundEnded(delivery: RoundDelivery): Promise<void>;
	/**
	 * One user input the harness attributed to the user was admitted to one actual session.
	 *
	 * It is the start of that session's Session span: the first such delivery fixes the instant, and
	 * every later one leaves it where it is. It is not a boundary — nothing is consumed, priced or
	 * written here — and it starts nothing for a session the loaded document already carries a start
	 * for.
	 */
	userInput(delivery: UserInputDelivery): void;
	/**
	 * One actual session's own facts, re-reported by the host as they changed.
	 *
	 * It is the one delivery the accounting applies without a boundary behind it: the session's
	 * latest name and reliable direct parent are kept as the display reads them, the subscribers
	 * are told when either really changed, and nothing is consumed, priced or written.
	 */
	sessionFacts(session: SessionFacts): void;
	/**
	 * Tell this instance's subscribers that the results they read changed.
	 *
	 * It is the same change notification the accounting's own additions publish through, and the
	 * runtime's sibling source of the same read-only view — the provider balance reading — uses it so
	 * a frontend keeps one change subscription for everything it reads rather than one per source.
	 */
	announceChanged(): void;
	/**
	 * Whether a session snapshot this instance committed is still publishing.
	 *
	 * It is this instance's own save state rather than an activity fact of any session: `true` means
	 * at least one snapshot this instance built has not yet been seen land, and a period switch reads
	 * it so a reset never races a write of the very consumption it is about to close.
	 */
	savePending(): boolean;
	/**
	 * The accounting reset replaced the period underneath this instance.
	 *
	 * Everything this instance accumulated for the period that was closed goes — each session's own
	 * ledger and every Round boundary pair it measured — so nothing of it can be published into the
	 * new one and no later snapshot re-binds the closed period's consumption to it. What the host
	 * reported about each session stays, so the relations a new request rebuilds its aggregation from
	 * are still there, and so do the handled request identities: a repeated end for a Turn already
	 * accounted or deliberately skipped must not become a second accounting because the period
	 * changed.
	 */
	periodSwitched(): void;
	/** End this instance: stop accounting, forget the in-flight anchors and release the listeners. */
	dispose(): void;
}

/** What one accounting instance is built from. */
export interface RequestAccountingInputs {
	/** The extension's maintained model and price data, as the anchor reads it. */
	readonly data: ModelPricingData;
	/** The harness this instance runs in; part of every session's stored identity. */
	readonly harness: string;
	/** The active consumption document this instance accumulates into and saves through. */
	readonly storage: ConsumptionStore;
	/**
	 * The instant source this instance's Session span observations are recorded on.
	 *
	 * Omitted means the process clock (`Date.now`). The framework delivers harness facts without an
	 * instant of their own, so when a fact is *observed* is the observer's own fact — which is exactly
	 * what a span is measured against, and what lets a suite place an input and a Round end at the
	 * instants a case names.
	 */
	readonly now?: () => number;
}

/** One model's running totals inside one session's ledger, which is what additions mutate. */
interface ModelLedger {
	input: number;
	cacheRead: number;
	cacheWrite: number;
	output: number;
	costCny?: number;
	referenceCostUsd?: number;
}

/** One actual session's own consumption as this instance accumulates it. */
interface SessionLedger {
	/** The tokens of one provider and model, in the order the providers were first seen. */
	readonly models: Map<string, Map<string, ModelLedger>>;
	/**
	 * The snapshot this session's next one counts from: the record the store held when this instance
	 * seeded the ledger, or the last snapshot this instance built.
	 */
	saved: SessionRecord | undefined;
	/** How many additions this instance has made since it seeded the ledger. */
	revision: number;
	/** The revision the last accepted snapshot carried. */
	savedRevision: number;
}

/** The reported usage buckets an amount is computed over, and their order. */
const TOKEN_BUCKETS = ["input", "cacheRead", "cacheWrite", "output"] as const;

/** The tokens one unit of the data's price covers; the data states its amounts per this many. */
const TOKENS_PER_UNIT = 1_000_000;

/** The amount one usage costs at one anchored price: every priced bucket, over the price's unit. */
function amountOf(usage: TurnUsage, amounts: Readonly<Record<string, number>>): number {
	let total = 0;
	for (const bucket of TOKEN_BUCKETS) total += usage[bucket] * (amounts[bucket] ?? 0);
	return total / TOKENS_PER_UNIT;
}

/**
 * One session's own consumption split into the part that happened between two of its own
 * snapshots.
 *
 * Buckets and amounts are both part of the difference — a Round's tokens and the amounts they were
 * charged are each its own — and a provider or model whose additions are all zero is left out
 * entirely, because a model this Round never touched is not a Round total of zero.
 */
function differenceOf(after: OwnConsumption, before: OwnConsumption): OwnConsumption {
	const own: Record<string, Record<string, ModelConsumption>> = {};
	for (const [provider, models] of Object.entries(after)) {
		const byModel: Record<string, ModelConsumption> = {};
		for (const [model, entry] of Object.entries(models)) {
			const earlier = before[provider]?.[model];
			const tokens: TokenBuckets = {
				input: entry.tokens.input - (earlier?.tokens.input ?? 0),
				cacheRead: entry.tokens.cacheRead - (earlier?.tokens.cacheRead ?? 0),
				cacheWrite: entry.tokens.cacheWrite - (earlier?.tokens.cacheWrite ?? 0),
				output: entry.tokens.output - (earlier?.tokens.output ?? 0),
			};
			const costCny =
				entry.costCny === undefined && earlier?.costCny === undefined
					? undefined
					: (entry.costCny ?? 0) - (earlier?.costCny ?? 0);
			const referenceCostUsd =
				entry.referenceCostUsd === undefined && earlier?.referenceCostUsd === undefined
					? undefined
					: (entry.referenceCostUsd ?? 0) - (earlier?.referenceCostUsd ?? 0);
			const added =
				TOKEN_BUCKETS.some(bucket => tokens[bucket] !== 0) ||
				costCny !== undefined ||
				referenceCostUsd !== undefined;
			if (!added) continue;
			byModel[model] = {
				tokens,
				...(costCny === undefined ? {} : { costCny }),
				...(referenceCostUsd === undefined ? {} : { referenceCostUsd }),
			};
		}
		if (Object.keys(byModel).length > 0) own[provider] = byModel;
	}
	return own;
}

/**
 * One session's own consumption added into an accumulating tree total, bucket by bucket and amount
 * by amount.
 *
 * An amount is only indexed where a contribution really carries one: a request whose price the data
 * did not state contributes no amount rather than a zero, so a tree total stays the known subtotal it
 * is, and the two currencies are summed apart as the sessions' own records keep them.
 */
function addConsumption(into: Record<string, Record<string, ModelConsumption>>, own: OwnConsumption): void {
	for (const [provider, models] of Object.entries(own)) {
		for (const [model, entry] of Object.entries(models)) {
			const byModel = (into[provider] ??= {});
			const earlier = byModel[model];
			const tokens: TokenBuckets = {
				input: (earlier?.tokens.input ?? 0) + entry.tokens.input,
				cacheRead: (earlier?.tokens.cacheRead ?? 0) + entry.tokens.cacheRead,
				cacheWrite: (earlier?.tokens.cacheWrite ?? 0) + entry.tokens.cacheWrite,
				output: (earlier?.tokens.output ?? 0) + entry.tokens.output,
			};
			const costCny =
				earlier?.costCny === undefined && entry.costCny === undefined
					? undefined
					: (earlier?.costCny ?? 0) + (entry.costCny ?? 0);
			const referenceCostUsd =
				earlier?.referenceCostUsd === undefined && entry.referenceCostUsd === undefined
					? undefined
					: (earlier?.referenceCostUsd ?? 0) + (entry.referenceCostUsd ?? 0);
			byModel[model] = {
				tokens,
				...(costCny === undefined ? {} : { costCny }),
				...(referenceCostUsd === undefined ? {} : { referenceCostUsd }),
			};
		}
	}
}

/**
 * Build the process's request accounting over one storage root and one maintained data set.
 *
 * Building has no effect of its own: nothing is read, no listener is called and no file is touched.
 * The baseline enters the results at the first delivery that needs it — a session's ledger is seeded
 * from the record the store loaded — so a restart continues a session's totals rather than starting
 * them over.
 */
export function createRequestAccounting(inputs: RequestAccountingInputs): RequestAccounting {
	const { data, harness, storage } = inputs;
	const now = inputs.now ?? Date.now;
	const ledgers = new Map<string, SessionLedger>();
	/**
	 * This instance's Session spans: the first user input it observed per session and the latest Round
	 * end, seeded from the record the document already carries. They belong to the accounting period
	 * the instance is accumulating in, which is why a period switch clears them with everything else.
	 */
	const spans = createSessionSpans({
		saved: sessionId => storage.session(harness, sessionId)?.span,
	});

	/**
	 * The instant one Session span observation is recorded at, or `undefined` when the clock's own
	 * reading is not one.
	 *
	 * The clock is this extension's one source for these instants — the harness delivers neither a
	 * submission nor a Round end with a time of its own — so a reading that is not a finite,
	 * non-negative instant is an invalid time fact and nothing is recorded from it. What a delivery
	 * whose reading was invalid costs is that one observation: the reading a display shows stays what
	 * it was, or stays unknown, and nothing is filled in with a zero, the previous instant or the
	 * process's start time.
	 */
	const observedAt = (feedback: FeedbackTransport): number | undefined => {
		const at = now();
		if (Number.isFinite(at) && at >= 0) return at;
		feedback.notify(
			"error",
			`主会话时间采集失败（时钟读数不是有效时刻：${String(at)}）；本次未记录该时间，已保留上一次有效读数或不可用状态，消费统计、既有提交与其他字段不受影响。`,
		);
		return undefined;
	};
	/** What the host has reported about each actual session, as far as it reported anything. */
	const reported = new Map<
		string,
		{ readonly name?: string; readonly agentName?: string; readonly agentId?: string; readonly parent?: string | null }
	>();
	/** The price each started Turn was anchored at, by the Turn identity the framework minted. */
	const anchors = new Map<string, RequestPrice>();
	/** The Turns this instance has already accounted for or deliberately skipped, by identity. */
	const handled = new Set<string>();
	const listeners = new Set<() => void>();
	/**
	 * The snapshot each session's open Round is measured from, with the period that snapshot
	 * belongs to. A Round whose period changed underneath it has no reliable boundary pair, so the
	 * period travels with the snapshot rather than being read again when the Round ends.
	 */
	const openRounds = new Map<string, { readonly own: OwnConsumption; readonly periodId: string }>();
	/** The last Round each session ended with both of its boundaries at hand, as its own additions. */
	const endedRounds = new Map<string, OwnConsumption>();
	/** How many snapshots this instance committed and has not yet seen land. */
	let savesPublishing = 0;
	let disposed = false;

	/**
	 * The identity facts this instance holds for one actual session: what the host has reported about
	 * it and, for a fact no delivery reported yet, what the loaded document already holds for it.
	 *
	 * `undefined` means this instance knows nothing about that session — it has neither seen a
	 * delivery for it nor loaded a record of it — which is not the same as a known session whose name
	 * this host could not report.
	 */
	const identityOf = (sessionId: string): SessionIdentity | undefined => {
		const facts = reported.get(sessionId);
		const record = storage.session(harness, sessionId);
		if (facts === undefined && record === undefined) return undefined;
		return {
			sessionId,
			// A name is display data rather than an identity, and a name always wins over an id: the
			// session's own latest name, then the agent's own name, then the name the document holds; only
			// with no name anywhere does an id stand in — the agent's own first, the session's last.
			name: facts?.name ?? facts?.agentName ?? record?.name ?? facts?.agentId ?? sessionId,
			// The two absences differ: a host that reported no parent said so, while one that reported
			// nothing leaves the fact to be filled from the record rather than read as parentless.
			parentSessionId: facts?.parent !== undefined ? facts.parent : (record?.parent ?? null),
		};
	};

	/**
	 * Keeps the latest name, agent name, agent id and direct parent the host reported for one session.
	 *
	 * A fact this host cannot report never overwrites one it already reported, and never invents one.
	 * Learning a session's first facts is not a change — the request that carried them announces the
	 * session's own result anyway — but a display fact that differs from what this instance already
	 * held is data that changed, so the display is told about it now rather than at the next save: a
	 * rename rides along with consumption, it does not wait for it.
	 */
	const remember = (session: SessionFacts): void => {
		const before = identityOf(session.sessionId);
		const previous = reported.get(session.sessionId);
		const name = session.name ?? previous?.name;
		const agentName = session.agentName ?? previous?.agentName;
		const agentId = session.agentId ?? previous?.agentId;
		const parent = session.parentSessionId ?? previous?.parent;
		reported.set(session.sessionId, {
			...(name === undefined ? {} : { name }),
			...(agentName === undefined ? {} : { agentName }),
			...(agentId === undefined ? {} : { agentId }),
			...(parent === undefined ? {} : { parent }),
		});
		const after = identityOf(session.sessionId);
		if (
			before !== undefined &&
			after !== undefined &&
			(before.name !== after.name || before.parentSessionId !== after.parentSessionId)
		) {
			announce();
		}
	};

	/** This session's ledger, seeded once from the record the store holds for it. */
	const ledgerFor = (sessionId: string): SessionLedger => {
		const existing = ledgers.get(sessionId);
		if (existing !== undefined) return existing;
		const saved = storage.session(harness, sessionId);
		const ledger: SessionLedger = { models: new Map(), saved, revision: 0, savedRevision: 0 };
		for (const [provider, models] of Object.entries(saved?.own ?? {})) {
			const byModel = new Map<string, ModelLedger>();
			for (const [model, usage] of Object.entries(models)) {
				byModel.set(model, {
					...usage.tokens,
					...(usage.costCny === undefined ? {} : { costCny: usage.costCny }),
					...(usage.referenceCostUsd === undefined ? {} : { referenceCostUsd: usage.referenceCostUsd }),
				});
			}
			ledger.models.set(provider, byModel);
		}
		ledgers.set(sessionId, ledger);
		return ledger;
	};

	/** One ledger's own consumption, as the value the store's schema and the display both read. */
	const snapshotOf = (ledger: SessionLedger): OwnConsumption => {
		const own: Record<string, Record<string, ModelConsumption>> = {};
		for (const [provider, models] of ledger.models) {
			const byModel: Record<string, ModelConsumption> = {};
			for (const [model, entry] of models) {
				const tokens: TokenBuckets = {
					input: entry.input,
					cacheRead: entry.cacheRead,
					cacheWrite: entry.cacheWrite,
					output: entry.output,
				};
				byModel[model] = {
					tokens,
					...(entry.costCny === undefined ? {} : { costCny: entry.costCny }),
					...(entry.referenceCostUsd === undefined ? {} : { referenceCostUsd: entry.referenceCostUsd }),
				};
			}
			own[provider] = byModel;
		}
		return own;
	};

	/**
	 * One session's own accumulation as this instance holds it: what it has accounted for that
	 * session, or — for a session it has not touched — the record the store loaded.
	 *
	 * It is a read, not a seed: nothing is created for a session that has not consumed, so a Round
	 * boundary can be taken for a session whose ledger does not exist yet.
	 */
	const ownOf = (sessionId: string): OwnConsumption => {
		const ledger = ledgers.get(sessionId);
		if (ledger !== undefined) return snapshotOf(ledger);
		return storage.session(harness, sessionId)?.own ?? {};
	};

	/**
	 * One actual session's parent tree: that session's own consumption and every descendant's, each
	 * contribution added once.
	 *
	 * The relations walked are the reliable direct ones this instance holds, and the walk starts at
	 * the session it was asked about, so a subtree is that session's own descendants rather than the
	 * whole instance: an unrelated session, or a sibling's line, is not part of it. A session already
	 * added is never added again, which is what makes a document whose records happen to describe a
	 * circle terminate at the contribution each session really made rather than at that shape.
	 */
	const inclusiveTotalsOf = (sessionId: string): OwnConsumption => {
		const known = new Set<string>(reported.keys());
		for (const id of ledgers.keys()) known.add(id);
		for (const record of storage.sessions(harness)) known.add(record.id);
		// Every known session's own descendants are read off one index of the relations rather than by
		// scanning the whole set at each level.
		const children = new Map<string, string[]>();
		for (const id of known) {
			const parent = identityOf(id)?.parentSessionId;
			if (parent === undefined || parent === null) continue;
			const siblings = children.get(parent);
			if (siblings === undefined) children.set(parent, [id]);
			else siblings.push(id);
		}
		const included = new Set<string>([sessionId]);
		const frontier = [sessionId];
		while (frontier.length > 0) {
			const parent = frontier.pop() as string;
			for (const child of children.get(parent) ?? []) {
				if (included.has(child)) continue;
				included.add(child);
				frontier.push(child);
			}
		}
		const own: Record<string, Record<string, ModelConsumption>> = {};
		for (const id of included) addConsumption(own, ownOf(id));
		return own;
	};

	/** Tells every subscriber that the results changed, so it can read them again. */
	const announce = (): void => {
		for (const listener of [...listeners]) listener();
	};

	/**
	 * Adds one settled Turn's reliable usage, and its amount where the anchor produced one.
	 *
	 * The anchor is what decides which currency the amount belongs to: a monetary Turn adds its CNY
	 * accounting amount, and a reference Turn adds the USD amount the harness's own price makes of the
	 * same usage. The two are added into their own fields and never into each other, and a Turn whose
	 * anchor produced no amount adds usage alone.
	 */
	const addUsage = (
		ledger: SessionLedger,
		provider: string,
		model: string,
		usage: TurnUsage,
		anchor: RequestPrice,
	): void => {
		let byModel = ledger.models.get(provider);
		if (byModel === undefined) {
			byModel = new Map();
			ledger.models.set(provider, byModel);
		}
		let entry = byModel.get(model);
		if (entry === undefined) {
			entry = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
			byModel.set(model, entry);
		}
		entry.input += usage.input;
		entry.cacheRead += usage.cacheRead;
		entry.cacheWrite += usage.cacheWrite;
		entry.output += usage.output;
		if (anchor.kind === "monetary") entry.costCny = (entry.costCny ?? 0) + amountOf(usage, anchor.price.amounts);
		if (anchor.kind === "reference") {
			entry.referenceCostUsd = (entry.referenceCostUsd ?? 0) + amountOf(usage, anchor.price.amounts);
		}
		ledger.revision += 1;
	};

	/**
	 * Drops what this instance accumulated for the state a save did not publish, so the display and
	 * every later snapshot read the store's own baseline again.
	 *
	 * One session's ledger goes when only that session's snapshot was refused or failed; everything
	 * goes when the period underneath the instance was replaced or its baseline is gone, because none
	 * of what was accumulated then belongs to a period that can still be written. Its Round
	 * boundaries go with it — they were snapshots of an accumulation that no longer exists, so a
	 * Round derived from them would be a difference this instance cannot stand behind. The handled
	 * request identities stay: a repeated end for a Turn already accounted or already skipped must
	 * not account a second time because its session's accumulation was discarded.
	 *
	 * A Session span is not part of what is discarded. The instants it holds are observations rather
	 * than additions, so a snapshot that did not land leaves them as they were — the reading a display
	 * shows is still the span this instance really saw — and the next snapshot that does land carries
	 * them to the file instead of asking the user to say something again.
	 */
	const discard = (sessionId: string | undefined): void => {
		if (sessionId === undefined) {
			ledgers.clear();
			openRounds.clear();
			endedRounds.clear();
		} else {
			ledgers.delete(sessionId);
			openRounds.delete(sessionId);
			endedRounds.delete(sessionId);
		}
		announce();
	};

	/**
	 * One session's snapshot committed at its Round's end, when its own consumption grew.
	 *
	 * The snapshot is built from what has been accumulated so far and counts its version from the
	 * last snapshot this instance built — not from what the store has already adopted, which lags a
	 * save that is still publishing. A Round that ends while the previous save is in flight therefore
	 * publishes the next version with everything accumulated by then, and the framework's
	 * coordinated update publishes them in call order, so the last snapshot is the one that keeps
	 * every addition.
	 *
	 * A snapshot that did not land is not kept for a later one: the operator is told, what this
	 * instance accumulated for the affected session is discarded, and that session goes on from the
	 * baseline the store holds — the disk's own record, or nothing when the store has none. The
	 * discarded additions are then gone rather than re-submitted later, and the sessions this
	 * instance did not have to discard keep their own accumulations. When the period underneath the
	 * instance was replaced, the affected state is everything it accumulated: nothing from a period
	 * a reset already closed may be published into the new one.
	 */
	const save = async (session: SessionFacts, ledger: SessionLedger, feedback: FeedbackTransport): Promise<void> => {
		const facts = identityOf(session.sessionId) ?? {
			sessionId: session.sessionId,
			name: session.sessionId,
			parentSessionId: null,
		};
		const revision = ledger.revision;
		// The span this snapshot carries is the one this instance has observed up to now — the same two
		// instants its own display reads — and it is written with the consumption rather than through a
		// write of its own. A session whose span is still unknown writes none: an absent fact is what a
		// reader treats as unknown, and an end that has not been observed is never filled in here.
		const span = spans.fact(session.sessionId);
		const record: SessionRecord = {
			id: session.sessionId,
			name: facts.name,
			parent: facts.parentSessionId,
			saveVersion: (ledger.saved?.saveVersion ?? 0) + 1,
			own: snapshotOf(ledger),
			...(span === undefined ? {} : { span }),
		};
		ledger.saved = record;
		// This snapshot carries every addition up to `revision`, and it says so before the write
		// resolves: a Round that ends while this save is still publishing has nothing new to save,
		// rather than publishing the same consumption again under the next version.
		ledger.savedRevision = revision;
		const periodOfThisSnapshot = storage.period()?.periodId;
		// Counted around the commit itself, so the entry's save state is `true` for exactly as long
		// as this instance's snapshot is on its way to the file: a period switch asks this before it
		// resets, and must see the write rather than a moment that has already passed.
		savesPublishing += 1;
		let outcome: SessionCommit;
		try {
			outcome = await storage.commit(harness, record);
		} finally {
			savesPublishing -= 1;
		}
		if (outcome.kind === "saved" || outcome.kind === "unchanged") return;
		// Whether the snapshot failed under the period it was built for: a period replaced underneath
		// this instance makes everything it accumulated un-publishable, not just this session's part.
		const samePeriod = storage.period()?.periodId === periodOfThisSnapshot;
		if (outcome.kind === "unusable") {
			const notice = unusableBaselineNotice(storage.consumptionFile, outcome.reason);
			feedback.notify(notice.level, notice.message);
		} else if (outcome.kind !== "paused") {
			// A pause was reported when it began, and nothing can be saved while it holds; anything else
			// that did not land is this instance's own failure to report, at the severity of an effect
			// that did not happen.
			const recovery = samePeriod
				? "该 Session 的累计与版本已按磁盘当前有效快照重新初始化"
				: "磁盘属于另一个周期，本实例已按磁盘当前有效快照重新初始化";
			feedback.notify(
				"error",
				`本次消费累计没有写入「${storage.consumptionFile}」（${outcome.kind}）；本次未保存的消费已丢弃，${recovery}。`,
			);
		}
		discard(samePeriod ? session.sessionId : undefined);
	};

	const view: ConsumptionView = {
		own: sessionId => {
			const ledger = ledgers.get(sessionId);
			if (ledger !== undefined) return snapshotOf(ledger);
			return storage.session(harness, sessionId)?.own;
		},
		identity: identityOf,
		// Every actual session this instance can answer an identity for — the union of what the loaded
		// document holds and what deliveries have since reported, each once. The order is where it
		// learned them: the document's own records first, then the sessions the host reported. It is the
		// one enumeration this instance offers, and what a reader that has to walk the relations (a tree
		// display, say) reads instead of scanning the whole set at each level.
		identities: () => {
			const seen = new Set<string>();
			const identities: SessionIdentity[] = [];
			for (const record of storage.sessions(harness)) {
				if (seen.has(record.id)) continue;
				seen.add(record.id);
				const identity = identityOf(record.id);
				if (identity !== undefined) identities.push(identity);
			}
			for (const sessionId of [...reported.keys(), ...ledgers.keys()]) {
				if (seen.has(sessionId)) continue;
				seen.add(sessionId);
				const identity = identityOf(sessionId);
				if (identity !== undefined) identities.push(identity);
			}
			return identities;
		},
		inclusiveTotals: inclusiveTotalsOf,
		sessionSpan: spans.of,
		roundTotals: sessionId => {
			const started = openRounds.get(sessionId);
			// A Round whose snapshot belongs to another period than the one this instance is
			// accumulating in has no usable boundary pair: what the session holds now includes
			// consumption from a generation this Round did not begin in, so nothing is derived from it.
			const open = started !== undefined && started.periodId === storage.period()?.periodId ? started : undefined;
			const previous = endedRounds.get(sessionId);
			if (open === undefined && previous === undefined) return undefined;
			return {
				// The open Round's own additions are read now, so they grow as its requests settle.
				...(open === undefined ? {} : { current: differenceOf(ownOf(sessionId), open.own) }),
				...(previous === undefined ? {} : { previous }),
			};
		},
		subscribe: listener => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};

	return {
		view,
		turnStarted(delivery) {
			if (disposed) return;
			remember(delivery.turn.session);
			const period = storage.period();
			if (period === undefined || storage.pauseReason() !== undefined) return;
			anchors.set(
				delivery.turn.turnId,
				requestPriceOf(data, {
					provider: delivery.turn.provider,
					model: delivery.turn.model,
					startedAt: delivery.turn.startedAt,
					holiday: period.holiday,
					// The price the framework snapshotted at this request's real start, which is the one
					// source a channel the maintained data does not price has — the allowance channel's
					// harness-stated dollars. A request whose catalog stated none carries no such fact.
					...(delivery.turn.price === undefined ? {} : { catalogPrice: delivery.turn.price }),
				}),
			);
		},
		turnSettled(delivery) {
			if (disposed) return;
			const turn = delivery.turn;
			const session = turn.session;
			remember(session);
			const identity = `${session.sessionId}\u0000${turn.turnId}`;
			if (handled.has(identity)) return;
			const anchor = anchors.get(turn.turnId);
			anchors.delete(turn.turnId);
			// No anchor means this instance never fixed a price for the request — a Turn of a paused
			// instance, or a settle whose start it did not observe. No identity is invented for it.
			if (anchor === undefined) return;
			handled.add(identity);
			if (anchor.kind === "no-amount-policy" && anchor.mode === "hidden") return;
			const usage = delivery.end.usage;
			if (usage === undefined) {
				delivery.feedback.notify(
					"warning",
					`本次请求（${turn.provider}/${turn.model}）没有可靠的 usage 读数，已跳过该次消费统计；跳过不等于免费。`,
				);
				return;
			}
			const ledger = ledgerFor(session.sessionId);
			addUsage(ledger, turn.provider, turn.model, usage, anchor);
			if (anchor.kind === "missing-price") {
				delivery.feedback.notify(
					"warning",
					`本次请求（${turn.provider}/${turn.model}）缺适用价格：token 已累计，本次金额跳过；已累计的费用不受影响。`,
				);
			}
			announce();
		},
		roundStarted(delivery) {
			if (disposed) return;
			remember(delivery.session);
			const sessionId = delivery.session.sessionId;
			// A Round that starts while one is still open replaces its base: the Round it interrupted
			// has no end evidence, so its boundary pair is dropped rather than being closed here on a
			// guess, and no previous Round is published for it.
			openRounds.delete(sessionId);
			const period = storage.period();
			if (period === undefined || storage.pauseReason() !== undefined) return;
			openRounds.set(sessionId, { own: ownOf(sessionId), periodId: period.periodId });
			announce();
		},
		async roundEnded(delivery) {
			if (disposed) return;
			remember(delivery.session);
			const sessionId = delivery.session.sessionId;
			// The one instant a Session span's end moves on: the Round this session really ended. It is
			// observed whether or not this Round's own consumption grew, and whether or not the instance
			// can save — the reading is a fact this instance holds, and a save that does not follow leaves
			// it unpersisted rather than unobserved. Nothing else advances it: a settle the framework
			// never confirmed reaches no handler at all, so a cancelled, failed or interrupted Round that
			// delivered no end leaves the earlier one in place.
			const endedAt = observedAt(delivery.feedback);
			const spanAdvanced = endedAt !== undefined && spans.ended(sessionId, endedAt);
			const started = openRounds.get(sessionId);
			openRounds.delete(sessionId);
			// The Round's own additions are the difference between the accumulation it began from and
			// the one it ended with — but only when both boundaries belong to the same period and this
			// instance really saw the Round begin. A Round it did not is hidden, never derived from
			// whatever the session happens to hold.
			if (started !== undefined && started.periodId === storage.period()?.periodId) {
				endedRounds.set(sessionId, differenceOf(ownOf(sessionId), started.own));
				announce();
			} else if (spanAdvanced) {
				announce();
			}
			if (storage.pauseReason() !== undefined) return;
			const ledger = ledgers.get(delivery.session.sessionId);
			// Nothing to save when the session's own consumption has not grown since the snapshot this
			// instance last built (or is still publishing): a rename rides along with the next real save
			// rather than causing a write of its own. A Session span is carried by that same snapshot
			// and never written for its own sake.
			if (ledger === undefined || ledger.revision <= ledger.savedRevision) return;
			await save(delivery.session, ledger, delivery.feedback);
		},
		userInput(delivery) {
			if (disposed) return;
			remember(delivery.session);
			// The start of that session's Session span, taken from the first input the user really put in
			// and from nothing else. It is not a boundary: no Round opens, nothing is consumed, nothing is
			// priced and no file is touched — what changes is a reading a display may show, and only once
			// an end is known as well.
			const at = observedAt(delivery.feedback);
			if (at !== undefined && spans.input(delivery.session.sessionId, at)) announce();
		},
		sessionFacts(session) {
			if (disposed) return;
			remember(session);
		},
		announceChanged() {
			announce();
		},
		savePending: () => savesPublishing > 0,
		periodSwitched() {
			// The period a snapshot was measured in is gone, so the snapshot is no longer this instance's
			// to publish: every session's own accumulation and every boundary pair goes, including the
			// Round that was open across the switch. The handled request identities stay (see the
			// interface), and so do the identity facts the host reported about each session.
			discard(undefined);
			// The Session spans were measured in that same period, so they go with it: a new period's
			// span begins at the next user input this instance observes, and nothing of the closed
			// period's time is carried into it or reconstructed from its records.
			spans.clear();
		},
		dispose() {
			disposed = true;
			anchors.clear();
			listeners.clear();
		},
	};
}
