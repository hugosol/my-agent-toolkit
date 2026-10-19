/**
 * Request accounting: what each real model request adds to its session's own consumption, counted
 * once, from the facts the request itself fixed.
 *
 * This module owns the accounting half of an observation: which actual session a request belongs
 * to, whether its snapped Turn was already handled, whether its Round and period are still the ones
 * in flight, and the shared session snapshot a Round's end commits. What a request *contributes* is
 * not decided here: its classification, the price its own start fixed, the amount that price yields
 * and the notices a missing reading deserves are supplied through {@link RequestContribution}, and
 * this module keeps that answer opaque until the Turn settles and then applies the neutral
 * settlement it receives. The results it holds are read-only through {@link ConsumptionView}, which
 * is the extension's display seam: what a frontend reads is the same value a test reads, and no
 * private field is a surface.
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
 * - **Amounts and their currencies belong to the contribution policy.** The accounting adds only
 *   the amount a settlement carries, into the field it names — the CNY cost or the USD reference —
 *   and never converts, substitutes or re-derives one from the other. The policy states the same
 *   notice it always has for missing usage or a price gap, and the accounting relays it in the
 *   settlement's own order.
 * - **Additions only.** Amounts already accumulated — including the ones a baseline loaded from the
 *   disk already carried — are never re-priced, re-derived, deleted or rewritten because the price
 *   data, the harness's own catalog, the model or the season changed later. The policy fixed each
 *   request's anchor at its own start, and this module applies that settlement once.
 * - **Time is a fact about one session's own activity, not a consumption.** A subagent session also
 *   accumulates a coarse estimate of its own working time ({@link createSubagentRuntimes}): each of
 *   its Rounds is one activity, and the interval between the Round's own edges is added once, when
 *   that Round ends. The idle stretches between two Rounds are therefore not part of it, and neither
 *   is anything a host states about an execution: the interval is the observer's own reading of the
 *   framework's public activity facts. That figure is business data of its own — it is added to no
 *   token bucket, currency or total, and no amount is derived from it — and it rides the same commit
 *   as the session's consumption, so an interval that settled late waits for the next commit rather
 *   than causing one. It is also the one figure that can commit on its own: a Round that ends without
 *   the session having consumed anything still publishes the time it took, because an accumulation
 *   gated on consumption alone would drop it. An interval that could not be measured is recorded as a
 *   known gap in that period's observation rather than as a figure, and an activity the closed period
 *   was in the middle of contributes nothing to the period that replaced it, however late its own end
 *   arrives.
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
 * {@link ConsumptionStore} — when the session's own consumption or runtime grew. Names, startup
 * facts and Session span travel in that same snapshot rather than through writes of their own;
 * a Round with no consumption can still save a measured runtime. A snapshot that did not land is reported and then *dropped*: the
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
 * ({@link RequestAccounting.userInput}) and the latest observed Turn end or terminal subagent result
 * receipt, kept by `session-span.ts` with the loaded document's facts. A Turn contributes its own
 * settle instant, whatever its outcome or reported usage; a terminal result contributes the main
 * session's receipt instant, not the child's runtime. Ends only advance, even when deliveries arrive
 * out of order. A Round's own end is no part of it — a Round that never ended costs the reading nothing.
 * It never sums anything — no descendant's time, no other session's — and it is read through
 * {@link ConsumptionView.sessionSpan}. Like a name, an observed instant is not an accumulation: it
 * survives a snapshot that did not land and travels with the next one that does, and a period switch
 * clears it with everything else measured in the period it is closing.
 */
import type { FeedbackTransport } from "../../../../../framework/interface/feedback";
import type { CatalogPrice } from "../../../../../framework/interface/host-facts";
import type {
	CloseOutWait,
	RoundDelivery,
	SessionFacts,
	SessionObservationReader,
	TurnEndDelivery,
	TurnStartDelivery,
	TurnUsage,
	UserInputDelivery,
} from "../../../../../framework/interface/session";
import type { ModelConsumption, OwnConsumption, SessionRecord, SessionStartup, TokenBuckets } from "./consumption-document";
import { type ConsumptionStore, type SessionCommit, unusableBaselineNotice } from "../storage/consumption-store";
import { type SubagentRuntimes, createSubagentRuntimes } from "./subagent-runtime";
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
	 * direct parent — or `undefined` when it holds neither a host fact nor a record for that session.
	 *
	 * The name is display data and never an identity: a rename changes what this answers and nothing
	 * else about the session. What the session's own host stated is what it answers, with the
	 * document's own record filling in a member nothing stated, so a display reads a session's latest
	 * name as soon as it is reported rather than at the next save. The host facts are read from the
	 * process's own observation record first (see {@link RequestAccountingInputs.registrations}),
	 * because that record is refreshed by every session delivery *and* by every reading another
	 * process sent — including one that states facts and no reading of its own — so a session another
	 * process runs, and a session renamed wherever it runs, are both answered here.
	 */
	identity(sessionId: string): SessionIdentity | undefined;
	/**
	 * Every actual session this instance can answer an identity for, each once, in the order it learned
	 * them: the records the loaded document holds first, then the sessions a delivery has since
	 * reported, then the sessions the process observed and this instance was never delivered anything
	 * about. A session this instance knows nothing about is not among them, and a session it knows
	 * only a name or a parent for is.
	 *
	 * It is the *union* the detail tree is drawn from: the sessions a previous process committed and
	 * the sessions this process observed running, merged by the session's own identity, so a session
	 * another process runs is one row of that tree rather than a second kind of thing — and a session
	 * both sources hold is still one row.
	 *
	 * It exists because the relations are held per session rather than as a tree: a reader that has to
	 * walk them — the detail's static agent tree, for instance — reads this one list and builds the
	 * index it needs, instead of asking about ids it would first have to know.
	 */
	identities(): readonly SessionIdentity[];
	/**
	 * Every descendant of one actual session along the reliable direct parent relations, each once,
	 * in natural depth-first order: a child, then that child's own descendants, then the next child.
	 *
	 * The root is never among them, and `depth` is relative to it — a direct child is `1`, that
	 * child's own child `2`. The walk reads the same relation authority {@link inclusiveTotals} sums
	 * over: the same known-session union and the same direct-parent facts, so the two can never
	 * disagree about who belongs to a tree. A session already visited is never visited again, which
	 * is what makes a document describing a circle terminate at each session once.
	 *
	 * Only sessions this instance can name are listed, by the identity rules {@link identity} uses: a
	 * session it holds only a name or a parent for is, and one it holds nothing about is not. A
	 * descendant with no identity still lets the walk continue through its own relations rather than
	 * cutting the branch.
	 */
	descendants(sessionId: string): readonly SessionDescendant[];
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
	 * The startup facts of one actual session — the model and effective effort it began with — or
	 * `undefined` when nothing about them is proved.
	 *
	 * It is what that session's own start reported, or what the loaded document recorded for it, and
	 * never what the session runs now: a model switch or a level change after the start leaves it
	 * alone. Each member of the answer is absent when nothing proved it, which is what a display draws
	 * as unknown rather than filling in from anything current.
	 */
	startup(sessionId: string): SessionStartup | undefined;
	/**
	 * The subagent runtime one actual session's own activities accumulated in this period, in
	 * milliseconds, or `undefined` when nothing reliable is known about it.
	 *
	 * It is the coarse estimate of that session's own working time, added up over the activities the
	 * extension observed: not a session's creation-to-last-record span, which counts the idle gaps
	 * between activities, and not a duration any host stated. The value is `0` when the activities
	 * really ran for no measurable time and absent when nothing was observed — a difference the
	 * display keeps — and an interval that settled after the last commit is part of what this answers
	 * even though the file does not hold it yet.
	 */
	runtime(sessionId: string): number | undefined;
	/**
	 * One actual session's Session span as this instance has it: the first user input it observed for
	 * that session in this period, and its latest observed Turn end or terminal subagent result
	 * receipt, or `undefined` while either fact is unknown. A Turn contributes its stated settle
	 * instant; a terminal result contributes the main session's receipt-clock instant.
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
 * One actual session below another, as {@link ConsumptionView.descendants} lists it: its identity
 * and how many direct parent steps away from the session the walk started at it is.
 */
export interface SessionDescendant {
	/** That descendant's own identity, from the same rules as {@link ConsumptionView.identity}. */
	readonly identity: SessionIdentity;
	/** Its distance from the walk's root: a direct child is `1`, a grandchild `2`. */
	readonly depth: number;
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
	/**
	 * The request's own start: the contribution policy fixes what it will add, for its end to use.
	 */
	turnStarted(delivery: TurnStartDelivery): void;
	/**
	 * The request's settled response: it ends the session's Session span at the instant the delivery
	 * states, and the contribution policy's settlement is applied once.
	 *
	 * The two are independent: the end is observed before any of the accounting's own refusals — an
	 * unanchored request, a Turn whose settlement contributes nothing, or one of a replaced period —
	 * because a session's time and its consumption are different facts about the same Turn. The
	 * settlement's notice, when it states one, is delivered at the same point in this order the
	 * policy defined: after the usage is added for a price gap, and instead of it for missing usage.
	 */
	turnSettled(delivery: TurnEndDelivery): void;
	/** A terminal subagent result reached this main session; time only, with no billing or save. */
	subagentResultReceived(sessionId: string, receivedAt: number, feedback: FeedbackTransport): void;
	/** One actual session's Round opening: its own accumulation is snapshotted as that Round's base. */
	roundStarted(delivery: RoundDelivery): void;
	/**
	 * One actual session's Round end: its own consumption and its own activity's time are saved when
	 * either of them grew.
	 *
	 * It is a boundary of the Round and of the session's activity, and never one of its Session span:
	 * the span's end was already observed when the Turn it ends settled.
	 */
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
	 * One actual session's own start, as its binding announced it.
	 *
	 * A delivery of this kind either carries the model and effective effort the session began with —
	 * the adapter reports them only on a start that proves the session was beginning — or carries
	 * none, which is what a recovered session's start states. The session's identity facts are kept as
	 * on any delivery; nothing else is done with them here, no save of their own is started for their
	 * arrival, and a pair that was never proved is never filled in from what the session runs now.
	 */
	started(session: SessionFacts): void;
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
	/**
	 * The business policy that decides what a request contributes.
	 *
	 * It is the accounting's only business seam: at a request's start it fixes an opaque anchor from
	 * the start facts, and at that request's settlement it turns the anchor and the reported usage
	 * into a neutral {@link RequestSettlement}. The accounting never inspects an anchor or re-derives
	 * an amount — it only remembers the anchor by Turn and applies the settlement once.
	 */
	readonly contribution: RequestContribution;
	/** The harness this instance runs in; part of every session's stored identity. */
	readonly harness: string;
	/** The active consumption document this instance accumulates into and saves through. */
	readonly storage: ConsumptionStore;
	/**
	 * The process's own record of the sessions it observed, as this instance reads it for the ones it
	 * holds no delivery of its own about.
	 *
	 * It is the Session capability's observation reader — one per extension in one process — and what
	 * this instance takes from it is identity alone: the facts a session's own process resolved for
	 * it, never an accumulation. A session the harness ran in another process is observed into that
	 * record from the readings that process delivered, which is how a session nothing of this
	 * instance's own ever named is still a session this instance can name, place and draw.
	 */
	readonly registrations: SessionObservationReader;
	/**
	 * Where this instance states that one session's own snapshot really landed in the storage root.
	 *
	 * It is the Session capability's own statement channel (`SessionCapability.recordCommit`): this
	 * instance is the only party that can say a write was confirmed, because it is the one that read the
	 * document, built the snapshot and saw the coordinated commit answer. What it states is *that* the
	 * write landed and never what it held — no record, no figure and no path crosses — so a process
	 * serving the owner that session follows learns the storage grew and reads it itself.
	 */
	readonly recordCommit: (sessionId: string) => void;
	/**
	 * The instant source for this accounting's user-input and activity observations. Terminal-result
	 * receipt is timestamped by the runtime with the same clock before preparation can wait.
	 *
	 * Omitted means the process clock (`Date.now`). The framework delivers a user input without an
	 * instant, so when the input was observed is the observer's own fact — which is exactly what the
	 * start of a span is measured at, and what lets a suite place an input at the instant a case
	 * names. A Turn's end is not read here: that instant is the framework's own, stated by the Turn's
	 * own delivery.
	 */
	readonly now?: () => number;
}

/** The facts of one request's start that its contribution policy may decide it by. */
export interface RequestStartFacts {
	/** The provider the host reported for the request. */
	readonly provider: string;
	/** The exact model id the host reported for the request. */
	readonly model: string;
	/** When the request really began, on the process's own clock (epoch milliseconds). */
	readonly startedAt: number;
	/** Whether the accounting period the request began in is a holiday period. */
	readonly holiday: boolean;
	/**
	 * The catalog price the framework snapshotted at this request's start, when its catalog answered
	 * one. Omitted means no catalog answer, not a price of zero.
	 */
	readonly catalogPrice?: CatalogPrice;
}

/** One notice a request's contribution policy states for the operator to read. */
export interface RequestNotice {
	readonly level: "warning" | "error";
	readonly message: string;
}

/**
 * What one settled request contributes, in the accounting's own neutral terms.
 *
 * `account` adds the reported usage, with either amount field only when the policy's anchor really
 * produced one, and states a notice when the amount was a known gap. `skip` adds nothing — no
 * ledger is seeded — and states a notice only when the skip is something an operator should act on;
 * a request the policy does not account for at all is a silent skip.
 */
export type RequestSettlement =
	| {
			readonly kind: "account";
			readonly usage: TurnUsage;
			/** The CNY amount this request adds, when its monetary anchor produced one. */
			readonly costCny?: number;
			/** The USD reference amount, when its allowance anchor produced one. */
			readonly referenceCostUsd?: number;
			/** The notice this settlement owes, if any. */
			readonly notice?: RequestNotice;
	  }
	| {
			readonly kind: "skip";
			/** The reason a skipped request is worth stating, if any. */
			readonly notice?: RequestNotice;
	  };

/** A request's captured business policy, ready for the usage its own response reports. */
export type AnchoredContribution = (usage: TurnUsage | undefined) => RequestSettlement;

/** The business seam: fix one request's policy now, apply its reported usage when it settles. */
export interface RequestContribution {
	/**
	 * Capture the start facts in a settlement function. Accounting retains it by Turn identity,
	 * without inspecting prices or passing an untyped anchor back to its creator. Missing usage
	 * stays undefined so the business can distinguish a skip from confirmed zero.
	 */
	anchor(request: RequestStartFacts): AnchoredContribution;
}

/**
 * The identity facts one actual session's own host stated, as this instance keeps them: any member
 * the host did not report stays absent rather than being filled in from the session's current state.
 */
interface ReportedFacts {
	readonly name?: string;
	readonly taskName?: string;
	readonly agentName?: string;
	readonly agentId?: string;
	readonly parent?: string | null;
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
	/**
	 * How many times this session's own runtime accumulation has moved since it seeded the ledger:
	 * an activity's interval settling, or a gap in the period's observation being established.
	 *
	 * It is what lets a Round that consumed nothing still publish the time it took — the figure is
	 * business data of its own, so a snapshot gated on consumption alone would drop it — while an
	 * unchanged figure beside an unchanged consumption still causes no write.
	 */
	runtimeRevision: number;
	/** The runtime revision the last accepted snapshot carried. */
	savedRuntimeRevision: number;
	/**
	 * The subagent runtime this session's own activities accumulated in this period.
	 *
	 * It is kept beside the consumption rather than inside the model buckets, because it is a fact
	 * about the session's *own activity* and not about any provider or model: nothing adds it to a
	 * token bucket, and no amount is ever derived from it. It is seeded from the record's own value
	 * and written back by the same snapshot, which is what keeps it in the one commit.
	 */
	readonly runtimes: SubagentRuntimes;
}

/** The reported usage buckets a bucket-wise difference is taken over, and their order. */
const TOKEN_BUCKETS = ["input", "cacheRead", "cacheWrite", "output"] as const;

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
 * Build the process's request accounting over one storage root and one contribution policy.
 *
 * Building has no effect of its own: nothing is read, no listener is called and no file is touched.
 * The baseline enters the results at the first delivery that needs it — a session's ledger is seeded
 * from the record the store loaded — so a restart continues a session's totals rather than starting
 * them over.
 */
export function createRequestAccounting(inputs: RequestAccountingInputs): RequestAccounting {
	const { contribution, harness, storage } = inputs;
	// The process's own observation record, as this instance reads it for the sessions nothing of its
	// own ever delivered: a session another process ran is registered there from the readings that
	// process sent, and its facts are what let this instance name and place it at all.
	const registrations = inputs.registrations;
	// The framework's statement channel, as this instance's own save reaches it: the one thing this
	// instance says about a write rather than reading from the storage root.
	const recordCommit = inputs.recordCommit;
	const now = inputs.now ?? Date.now;
	const ledgers = new Map<string, SessionLedger>();
	/**
	 * This instance's Session spans: the first user input and latest Turn end or terminal-result
	 * receipt per session, seeded from the record the document already carries. They belong to the accounting period
	 * the instance is accumulating in, which is why a period switch clears them with everything else.
	 */
	const spans = createSessionSpans({
		saved: sessionId => storage.session(harness, sessionId)?.span,
	});

	/**
	 * The instant one reading of a time fact is recorded at, or `undefined` when the reading is not
	 * one.
	 *
	 * Two readings of the same process clock are checked here: the clock this extension reads for a
	 * fact the harness delivers with no instant of its own — a user input — and the instant a Turn's
	 * own end delivery carries, which the framework measured when that Turn's response settled. A
	 * reading that is not a finite, non-negative instant is an invalid time fact and nothing is
	 * recorded from it. What a reading that is not one costs is that one observation: the reading a
	 * display shows stays what it was, or stays unknown, and nothing is filled in with a zero, the
	 * previous instant or the process's start time.
	 */
	const instantOf = (read: number, source: string, feedback: FeedbackTransport): number | undefined => {
		if (Number.isFinite(read) && read >= 0) return read;
		feedback.notify(
			"error",
			`主会话时间采集失败（${source}不是有效时刻：${String(read)}）；本次未记录该时间，已保留上一次有效读数或不可用状态，消费统计、既有提交与其他字段不受影响。`,
		);
		return undefined;
	};
	/** The instant this extension's own clock answers, for a fact the harness delivers without one. */
	const observedAt = (feedback: FeedbackTransport): number | undefined => instantOf(now(), "时钟读数", feedback);
	/**
	 * The instant this extension's own clock answers for one edge of a session's activity, or nothing
	 * when it states none.
	 *
	 * It is deliberately not {@link observedAt}: an activity's interval is not a Session span's
	 * instant, and the notice a failed reading deserves — the activity whose time could not be
	 * recorded, and the gap it leaves in this period's observation — is stated by the accumulation
	 * that refused the interval rather than by the clock read that produced nothing.
	 */
	const activityInstant = (): number | undefined => {
		const read = now();
		return Number.isFinite(read) && read >= 0 ? read : undefined;
	};
	/** What the host has reported about each actual session, as far as it reported anything. */
	const reported = new Map<string, ReportedFacts>();
	/**
	 * What each started Turn's contribution policy fixed, by the Turn identity the framework minted.
	 * The value is opaque here: only the policy that made it knows what it means.
	 */
	const anchors = new Map<string, AnchoredContribution>();
	/** The Turns this instance has already accounted for or deliberately skipped, by identity. */
	const handled = new Set<string>();
	/**
	 * The sessions whose own activity the closed period was in the middle of when it was replaced.
	 *
	 * A working interval belongs to the period it ran in, so the fact that one was still open has to
	 * outlive the accumulation the closed period's figure lived in: the Round that opened before the
	 * reset is settled by an end that arrives after it, and that end is a fact about the closed
	 * period's work. Those ends contribute nothing to the period that replaced it — and they are not a
	 * gap in the new period's observation either, because they are work the new period never had. What
	 * is kept is one flag per session, consumed by that session's next Round end: the next Round the
	 * session opens is a new activity of the period that is running now, and is measured as one.
	 */
	const closedActivities = new Set<string>();
	const listeners = new Set<() => void>();
	/**
	 * The snapshot each session's open Round is measured from, with the period that snapshot
	 * belongs to. A Round whose period changed underneath it has no reliable boundary pair, so the
	 * period travels with the snapshot rather than being read again when the Round ends.
	 */
	const openRounds = new Map<string, { readonly own: OwnConsumption; readonly periodId: string }>();
	/** The last Round each session ended with both of its boundaries at hand, as its own additions. */
	const endedRounds = new Map<string, OwnConsumption>();
	/**
	 * The startup facts each session's own start reported, by session: the model and effective effort
	 * it began with, kept once and never rewritten. A session nothing proved a startup for has no
	 * entry here, which is what a display draws as unknown.
	 */
	const startups = new Map<string, SessionStartup>();
	/** How many snapshots this instance committed and has not yet seen land. */
	let savesPublishing = 0;
	let disposed = false;

	/**
	 * The identity facts one actual session is named and placed by: what the process's own record
	 * holds for it, with what this instance was delivered itself filling in a member the record does
	 * not hold.
	 *
	 * The record wins where it holds a member because it is the fresher of the two by construction: it
	 * is updated from every session delivery *and* from every reading another process delivered —
	 * including a word that states facts and no reading of its own, and one whose reading repeated a
	 * value nothing about it moved, neither of which this instance is delivered any event for. So a
	 * session renamed wherever it runs is named here by the name its own host last stated, whichever
	 * process observed that statement. Nothing is guessed on the way: the facts are the ones a host
	 * resolved for the session, and `undefined` means neither holder has ever heard of it.
	 */
	const factsOf = (sessionId: string): ReportedFacts | undefined => {
		const registered = registrations.read(sessionId)?.session;
		const own = reported.get(sessionId);
		if (registered === undefined) return own;
		const name = registered.name ?? own?.name;
		const taskName = registered.taskName ?? own?.taskName;
		const agentName = registered.agentName ?? own?.agentName;
		const agentId = registered.agentId ?? own?.agentId;
		const parent = registered.parentSessionId ?? own?.parent;
		return {
			...(name === undefined ? {} : { name }),
			...(taskName === undefined ? {} : { taskName }),
			...(agentName === undefined ? {} : { agentName }),
			...(agentId === undefined ? {} : { agentId }),
			...(parent === undefined ? {} : { parent }),
		};
	};

	/**
	 * The identity facts this instance holds for one actual session: what the session's own host
	 * stated, and — for a member nothing stated — what the loaded document already holds for it.
	 *
	 * `undefined` means this instance knows nothing about that session — neither a host fact nor a
	 * loaded record — which is not the same as a known session whose name nothing could report.
	 */
	const identityOf = (sessionId: string): SessionIdentity | undefined => {
		const facts = factsOf(sessionId);
		const record = storage.session(harness, sessionId);
		if (facts === undefined && record === undefined) return undefined;
		return {
			sessionId,
			// A name is display data rather than an identity, and it is selected from the facts that name
			// the *work* before the ones that describe the agent: the session's own latest name, then the
			// handle the harness gave the session's task (what the row accounts for), then the name the
			// document already recorded for it. Only then does the agent's own registered name — the kind
			// of agent a session is, which is a category rather than a name for the work — stand in, and an
			// id last: the agent's registry identity, then the session's own id.
			name: facts?.name ?? facts?.taskName ?? record?.name ?? facts?.agentName ?? facts?.agentId ?? sessionId,
			// The two absences differ: a host that reported no parent said so, while one that reported
			// nothing leaves the fact to be filled from the record rather than read as parentless.
			parentSessionId: facts?.parent !== undefined ? facts.parent : (record?.parent ?? null),
		};
	};

	/**
	 * The startup facts this instance holds for one actual session: what its own start reported, or —
	 * for a session this instance observed no start of — what the loaded document recorded when it
	 * began, then what the framework's observation source received from that session's own start.
	 * The last source makes an uncommitted background session's startup visible without inventing
	 * a local start or waiting for its first consumption commit.
	 *
	 * It is never what the session runs now: nothing here reads the session's current model or level,
	 * so a model switch or a level change after the start leaves the answer exactly as it was, and a
	 * session nothing proved a startup for answers `undefined` rather than the current settings.
	 */
	const startupOf = (sessionId: string): SessionStartup | undefined =>
		startups.get(sessionId) ?? storage.session(harness, sessionId)?.startup ?? registrations.read(sessionId)?.session?.startup;

	/**
	 * Keeps the latest name, task handle, agent name, agent id and direct parent the host reported for
	 * one session.
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
		const taskName = session.taskName ?? previous?.taskName;
		const agentName = session.agentName ?? previous?.agentName;
		const agentId = session.agentId ?? previous?.agentId;
		const parent = session.parentSessionId ?? previous?.parent;
		reported.set(session.sessionId, {
			...(name === undefined ? {} : { name }),
			...(taskName === undefined ? {} : { taskName }),
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
		const ledger: SessionLedger = {
			models: new Map(),
			saved,
			revision: 0,
			savedRevision: 0,
			runtimeRevision: 0,
			savedRuntimeRevision: 0,
			runtimes: createSubagentRuntimes(saved?.runtimeMs, saved?.runtimeGap === true),
		};
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
	 * Every actual session this instance holds any fact about, once, in the order it learned them.
	 *
	 * This is the one source union the relation readers share: the loaded document's records first,
	 * then the sessions this instance was delivered anything about, then the sessions the process
	 * observed and this instance was never delivered anything about — a session another process ran
	 * is registered by the readings that process sent. It includes an observed session whose facts
	 * never arrived, because such an entry can still be a known record's id; the identity rules decide
	 * whether it is nameable, and the relation rules decide whether it has a parent.
	 */
	const knownSessionIds = (): readonly string[] => {
		const seen = new Set<string>();
		const ids: string[] = [];
		const include = (id: string): void => {
			if (seen.has(id)) return;
			seen.add(id);
			ids.push(id);
		};
		for (const record of storage.sessions(harness)) include(record.id);
		for (const id of reported.keys()) include(id);
		for (const id of ledgers.keys()) include(id);
		for (const entry of registrations.snapshot()) include(entry.sessionId);
		return ids;
	};

	/**
	 * The direct children of each known session, by the reliable direct parent relation — a
	 * delivery's reported parent, or a loaded record's. This is the one relation index both the
	 * inclusive-total walk and {@link ConsumptionView.descendants} read, so neither can disagree
	 * about the shape of a tree.
	 */
	const childrenIndex = (sessionIds: readonly string[]): Map<string, string[]> => {
		const children = new Map<string, string[]>();
		for (const id of sessionIds) {
			const parent = identityOf(id)?.parentSessionId;
			if (parent === undefined || parent === null) continue;
			const siblings = children.get(parent);
			if (siblings === undefined) children.set(parent, [id]);
			else siblings.push(id);
		}
		return children;
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
		// Keep the original live-first fold order: changing floating-point addition order can
		// change an already visible subtotal even though the relation membership is unchanged.
		const liveFirstIds = new Set([...reported.keys(), ...ledgers.keys(), ...knownSessionIds()]);
		const children = childrenIndex([...liveFirstIds]);
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

	/**
	 * The descendants of one actual session, depth-first, each once: the same relation authority
	 * {@link inclusiveTotalsOf} walks, read as identities and distances instead of consumption.
	 *
	 * A child is visited before its own descendants, and siblings keep the order the known-session
	 * union learned them in, which is the order the detail tree expects. A session already visited is
	 * never visited again, so a circular relation terminates rather than recursing. A visited session
	 * with no identity is skipped from the answer but still traversed, so a nameless link cannot cut
	 * off the sessions below it.
	 */
	const descendantsOf = (sessionId: string): SessionDescendant[] => {
		const children = childrenIndex(knownSessionIds());
		const visited = new Set<string>([sessionId]);
		const descendants: SessionDescendant[] = [];
		const visit = (parent: string, depth: number): void => {
			for (const child of children.get(parent) ?? []) {
				if (visited.has(child)) continue;
				visited.add(child);
				const identity = identityOf(child);
				if (identity !== undefined) descendants.push({ identity, depth });
				visit(child, depth + 1);
			}
		};
		visit(sessionId, 1);
		return descendants;
	};

	/** Tells every subscriber that the results changed, so it can read them again. */
	const announce = (): void => {
		for (const listener of [...listeners]) listener();
	};

	/**
	 * Adds one settled Turn's reliable usage, and the amount its settlement really carries into the
	 * field that settlement names.
	 *
	 * The accounting does not decide what the amount means: a CNY cost and a USD reference are
	 * separate fields, each only written when the policy supplied it, so neither is ever derived from
	 * or added into the other and an amount no policy produced stays absent rather than zero.
	 */
	const addUsage = (
		ledger: SessionLedger,
		provider: string,
		model: string,
		settlement: Extract<RequestSettlement, { readonly kind: "account" }>,
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
		entry.input += settlement.usage.input;
		entry.cacheRead += settlement.usage.cacheRead;
		entry.cacheWrite += settlement.usage.cacheWrite;
		entry.output += settlement.usage.output;
		if (settlement.costCny !== undefined) entry.costCny = (entry.costCny ?? 0) + settlement.costCny;
		if (settlement.referenceCostUsd !== undefined) {
			entry.referenceCostUsd = (entry.referenceCostUsd ?? 0) + settlement.referenceCostUsd;
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
	 * A Session span goes with the period it was measured in, and stays when only one session's
	 * snapshot was refused. The instants it holds are observations rather than additions, so a
	 * snapshot that did not land under the period this instance is still accumulating in leaves them
	 * as they were — the reading a display shows is still the span this instance really saw — and the
	 * next snapshot that does land carries them to the file instead of asking the user to say
	 * something again. A period that was replaced or whose baseline is gone is the other case: its
	 * spans were measured in it, so they go with everything else, and the period that follows begins
	 * its span at the next user input this instance observes rather than carrying an instant of the
	 * closed period into a document that holds none of it. The activities the accumulations being
	 * dropped had open are not discarded either: an interval belongs to the period it ran in, so
	 * those sessions are remembered outside the accumulation that is going, where the end of the
	 * Round that opened before the switch keeps it from contributing to the period that replaced it.
	 */
	const discard = (sessionId: string | undefined): void => {
		if (sessionId === undefined) {
			// The period underneath this instance was replaced, so what it accumulated belongs to a
			// generation that can no longer be written. The activities those accumulations were holding
			// open are moved out of them first: that end is work of the closed period, and it must not
			// be charged to the period that replaced it.
			for (const [id, ledger] of ledgers) {
				if (ledger.runtimes.hasOpenActivity()) closedActivities.add(id);
			}
			ledgers.clear();
			openRounds.clear();
			endedRounds.clear();
			// The Session spans were measured in that same period, so they go with it: a new period's
			// span begins at the next user input this instance observes, and nothing of the replaced
			// period's time is carried into it or reconstructed from its records.
			spans.clear();
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
	 *
	 * A snapshot that did land is also the one thing worth telling the process serving this session's
	 * owner: that the shared document now holds consumption it may not have read. The notice is stated
	 * after the commit answered and never before it, and only for the two outcomes that mean the
	 * snapshot is in the file — a refusal, a pause and a failure state nothing, because a write that did
	 * not land is not a notice an owner could act on.
	 *
	 * `closeOut` is the wait the framework's close-out handed this save, when the Round that ended is
	 * the one a disposing host is waiting for: the commit then spends what is *left* of it rather
	 * than the fifteen seconds an unbothered save would take, so the host is never held past the
	 * position it reported from. What that bounds is the waiting alone — an update that has begun runs
	 * to its real outcome whatever the deadline does, which is why a save that concludes after the
	 * deadline reports the outcome it really got and not a cancellation this extension cannot claim.
	 */
	const save = async (
		session: SessionFacts,
		ledger: SessionLedger,
		feedback: FeedbackTransport,
		closeOut?: CloseOutWait,
	): Promise<void> => {
		const facts = identityOf(session.sessionId) ?? {
			sessionId: session.sessionId,
			name: session.sessionId,
			parentSessionId: null,
		};
		const revision = ledger.revision;
		// The startup facts this snapshot carries: what the session's own start reported, or what the
		// document already recorded when it began. A snapshot is what the session started on and never
		// what it runs now, so an established one is written exactly as it was; a session nothing proved
		// a startup for carries no such field rather than an empty one.
		const startup = startupOf(session.sessionId);
		const runtimeMs = ledger.runtimes.available();
		const runtimeGap = ledger.runtimes.gap();
		// The span this snapshot carries is the one this instance has observed up to now — the same two
		// instants its own display reads — and it is written with the consumption rather than through a
		// write of its own. A session whose span is still unknown writes none: an absent fact is what a
		// reader treats as unknown, and an end that has not been observed is never filled in here.
		const span = spans.fact(session.sessionId);
		const record: SessionRecord = {
			id: session.sessionId,
			name: facts.name,
			parent: facts.parentSessionId,
			...(startup === undefined ? {} : { startup }),
			saveVersion: (ledger.saved?.saveVersion ?? 0) + 1,
			own: snapshotOf(ledger),
			// The session's accumulated runtime rides this same commit: it is the value available at
			// the moment the snapshot is built, and it is absent when nothing reliable is known rather
			// than written as a zero. The mark beside it states the one thing a figure cannot: that an
			// activity of this period could not be measured, so this figure is the subtotal the period
			// really observed. An absent mark is no claim that the history was complete.
			...(runtimeMs === undefined ? {} : { runtimeMs }),
			...(runtimeGap ? { runtimeGap: true as const } : {}),
			...(span === undefined ? {} : { span }),
		};
		ledger.saved = record;
		// This snapshot carries every addition up to `revision`, and it says so before the write
		// resolves: a Round that ends while this save is still publishing has nothing new to save,
		// rather than publishing the same consumption again under the next version.
		ledger.savedRevision = revision;
		// The runtime this snapshot carries is the accumulation as it stood here, so a later Round end
		// saves only what moved after it.
		ledger.savedRuntimeRevision = ledger.runtimeRevision;
		const periodOfThisSnapshot = storage.period()?.periodId;
		// Counted around the commit itself, so the entry's save state is `true` for exactly as long
		// as this instance's snapshot is on its way to the file: a period switch asks this before it
		// resets, and must see the write rather than a moment that has already passed.
		savesPublishing += 1;
		let outcome: SessionCommit;
		try {
			// The wait this commit may spend: what is left of the close-out that owes it, never more, and
			// at least the one millisecond the framework's update declares as a wait at all — a save
			// reached at the very end of the budget still attempts its commit at once rather than a
			// moment later, which is the difference between a record that lands and one that is refused.
			outcome = await storage.commit(
				harness,
				record,
				closeOut === undefined ? {} : { timeoutMs: Math.max(1, closeOut.remaining()) },
			);
		} finally {
			savesPublishing -= 1;
		}
		if (outcome.kind === "saved" || outcome.kind === "unchanged") {
			// The snapshot is in the file — the coordinated commit really published it, or the document
			// already held exactly it — so this is the one moment this instance knows something the
			// process serving the session's owner may not: that the shared document holds this session's
			// consumption. The notice says exactly that and nothing more: no record, no figure and no
			// path travels with it, because the owner's own process reads the file itself. Nothing is
			// stated for a refusal or a failure below — a write that did not land is not a notice — and
			// nothing is stated before the commit answered, so a save that has only begun publishes
			// nothing.
			recordCommit(session.sessionId);
			return;
		}
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
			// A wait the close-out ended is reported as what it is: the budget it was given is what ran
			// out, so the deadline the host's own position stated is the reason this save was refused —
			// and the consumption really was not written. A refusal for any other reason inside a
			// close-out (an I/O failure, say) names its own kind alone, because nothing there ran out of
			// time.
			const failure = outcome.kind === "failed" ? outcome.failure : undefined;
			const because =
				closeOut !== undefined && (failure === "timeout" || failure === "cancelled")
					? `${failure}：会话处置收口等待 ${closeOut.budgetMs}ms 已到`
					: outcome.kind;
			feedback.notify(
				"error",
				`本次消费累计没有写入「${storage.consumptionFile}」（${because}）；本次未保存的消费已丢弃，${recovery}。`,
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
		// Every actual session this instance can answer an identity for, each once, in the order the
		// shared known-session union learned them. The union is the same one the relation walks read,
		// so an entry that carries no facts never names an identity and is left out of the list.
		identities: () =>
			knownSessionIds().flatMap(sessionId => {
				const identity = identityOf(sessionId);
				return identity === undefined ? [] : [identity];
			}),
		descendants: descendantsOf,
		inclusiveTotals: inclusiveTotalsOf,
		startup: startupOf,
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
		runtime: sessionId => {
			// A session this instance has accounted an execution for reads its own accumulation; one it
			// has not touched reads the record the document holds — the value an earlier process saved.
			const ledger = ledgers.get(sessionId);
			if (ledger !== undefined) return ledger.runtimes.available();
			return storage.session(harness, sessionId)?.runtimeMs;
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
				contribution.anchor({
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
			// A Turn advances its Session span with its own end, taken from the instant
			// the framework's delivery carries — the moment that Turn's response settled — rather than
			// from this extension's clock read here, so a Turn that really ended before the period now
			// underneath this instance is not stamped with an instant of the period that replaced it.
			//
			// It is observed before anything below can refuse this Turn — an identity this instance
			// already accounted, a request it never anchored, a Turn whose reliable usage is missing, or
			// one whose consumption the period underneath it replaced — because the end is a fact about
			// the session's own time rather than about this Turn's consumption. Every outcome delivers
			// it: a completed Turn, a failed one and a cancelled one alike end the work the session did
			// and end this session's span at the instant they settled, while the consumption below is
			// skipped exactly as the accounting's own rules say.
			const endedAt = instantOf(delivery.end.endedAt, "Turn 结束时刻", delivery.feedback);
			if (endedAt !== undefined && spans.ended(session.sessionId, endedAt)) announce();
			const identity = `${session.sessionId}\u0000${turn.turnId}`;
			if (handled.has(identity)) return;
			const anchor = anchors.get(turn.turnId);
			anchors.delete(turn.turnId);
			// No anchor means this instance never fixed a contribution for the request — a Turn of a
			// paused instance, or a settle whose start it did not observe. No identity is invented for
			// it.
			if (anchor === undefined) return;
			handled.add(identity);
			const settlement = anchor(delivery.end.usage);
			if (settlement.kind === "skip") {
				if (settlement.notice !== undefined) {
					delivery.feedback.notify(settlement.notice.level, settlement.notice.message);
				}
				return;
			}
			// The usage, and only the amount the policy really supplied, are applied together. A notice
			// that accompanies an accounted settlement describes a gap in its amount rather than a
			// missing contribution, so it is stated after the addition and before subscribers read it.
			addUsage(ledgerFor(session.sessionId), turn.provider, turn.model, settlement);
			if (settlement.notice !== undefined) {
				delivery.feedback.notify(settlement.notice.level, settlement.notice.message);
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
			// A subagent session's Round *is* one of its own activities: this edge is where the working
			// time that Round will contribute begins, and the interval is settled when that Round ends.
			// Only a subagent session has a runtime — a main session's own Round is its own work and not
			// a subagent's — so nothing is opened for one.
			if (delivery.session.kind === "sub") {
				ledgerFor(sessionId).runtimes.activityStarted(activityInstant());
			}
			openRounds.set(sessionId, { own: ownOf(sessionId), periodId: period.periodId });
			announce();
		},
		async roundEnded(delivery) {
			if (disposed) return;
			remember(delivery.session);
			const sessionId = delivery.session.sessionId;
			// A Round's end is a boundary of the session's consumption and of its activity, not of its
			// Session span: the span's end is the Turn's own, observed when that Turn settled, and this
			// edge never moves it. An unfinished Round, a cancelled one and one whose confirmation never
			// arrived therefore cost the reading nothing — the end a Turn really settled at stays where it
			// was put, whatever happens to the Round around it.
			const started = openRounds.get(sessionId);
			openRounds.delete(sessionId);
			// The Round's own additions are the difference between the accumulation it began from and
			// the one it ended with — but only when both boundaries belong to the same period and this
			// instance really saw the Round begin. A Round it did not is hidden, never derived from
			// whatever the session happens to hold.
			if (started !== undefined && started.periodId === storage.period()?.periodId) {
				endedRounds.set(sessionId, differenceOf(ownOf(sessionId), started.own));
				announce();
			}
			if (storage.pauseReason() !== undefined) return;
			// The session's own activity ends with its Round, and the interval is what this edge adds to
			// the estimate. An activity the closed period was in the middle of is not this period's work:
			// its end is consumed here and contributes nothing. An interval that could not be measured
			// adds nothing either, and is reported as the time fact that failed and remembered as a gap
			// in this period's observation of that session.
			//
			// A Round the session's own end never stated is the other case, and the edge itself tells it
			// apart: the framework truncated it because the session was disposed while that Round was
			// still open, so the activity's completion was never established and its interval is not a
			// measurement at all. Nothing is added and nothing is filled in from the wall clock; this
			// period's observation of that session is marked incomplete, which is what keeps the figure a
			// subtotal of what this period really measured, and the operator is told rather than left to
			// read the missing time as a fast activity. Known consumption is unaffected: the snapshot
			// below carries what the session really reported, and no success is claimed for it.
			if (delivery.session.kind === "sub" && !closedActivities.delete(sessionId)) {
				const runtime = ledgerFor(sessionId);
				const truncated = delivery.event.kind === "round_end" && delivery.event.ending === "truncated";
				if (truncated) {
					runtime.runtimes.activityTruncated();
					runtime.runtimeRevision += 1;
					delivery.feedback.notify(
						"warning",
						"子代理活动在会话处置时仍未结束：本次活动的耗时未记录，已保留此前有效值，并标记本周期该 Session 的耗时观测存在缺口；已确认的消费不受影响。",
					);
				} else {
					const fault = runtime.runtimes.activityEnded(activityInstant());
					runtime.runtimeRevision += 1;
					if (fault !== undefined) {
						delivery.feedback.notify(
							"error",
							`子代理运行耗时采集失败（${fault.fault}）；本次活动的耗时未记录，已保留此前有效值，并标记本周期该 Session 的耗时观测存在缺口。`,
						);
					}
				}
				announce();
			}
			const ledger = ledgers.get(delivery.session.sessionId);
			// Nothing to save when neither the session's own consumption nor its runtime accumulation has
			// grown since the snapshot this instance last built (or is still publishing): a rename rides
			// along with the next real save rather than causing a write of its own, a Session span is
			// carried by that same snapshot, and a Round that moved neither writes nothing. A Round whose
			// session consumed nothing at all still saves the time it took, which is what keeps a figure
			// from being lost to a consumption-only gate.
			if (
				ledger === undefined ||
				(ledger.revision <= ledger.savedRevision && ledger.runtimeRevision <= ledger.savedRuntimeRevision)
			) {
				return;
			}
			await save(delivery.session, ledger, delivery.feedback, delivery.closeOut);
		},
		subagentResultReceived(sessionId, receivedAt, feedback) {
			if (disposed) return;
			const at = instantOf(receivedAt, "子代理终止结果接收时刻", feedback);
			if (at !== undefined && spans.ended(sessionId, at)) announce();
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
		started(session) {
			if (disposed) return;
			const startup = session.startup;
			if (startup === undefined) return;
			// The adapter reports these facts on the one kind of delivery that proves them — a start
			// that shows the session only now beginning — so a delivery either carries them or states
			// that nothing proved them, and nothing here fills a missing pair from what the session
			// happens to run now. The first pair this instance is handed is the session's startup: a
			// later start of an existing session is a recovery, which proves nothing and carries
			// nothing, and a pair that was already established is never rewritten.
			if (startups.has(session.sessionId)) return;
			startups.set(session.sessionId, startup);
			// The rows a display draws carry these facts, so a start that taught this instance something
			// new is a change of the read-only result like any other: publishing it is what redraws a
			// frontend. It starts no save of its own — the snapshot travels with the session's next
			// consumption commit, exactly as its name does.
			announce();
		},
		announceChanged() {
			announce();
		},
		savePending: () => savesPublishing > 0,
		periodSwitched() {
			// The period a snapshot was measured in is gone, so the snapshot is no longer this instance's
			// to publish: every session's own accumulation, every boundary pair and the Session spans
			// measured in it go together, including the Round that was open across the switch. The
			// handled request identities stay (see the interface), and so do the identity facts the host
			// reported about each session.
			discard(undefined);
		},
		dispose() {
			disposed = true;
			anchors.clear();
			listeners.clear();
		},
	};
}
