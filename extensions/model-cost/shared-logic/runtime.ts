/**
 * The model-cost business runtime: the one business instance an assembly builds for the process.
 *
 * The factory is called once, after the framework validated the extension's declared configuration,
 * and what it returns is the process's single runtime — every later binding, another session's or a
 * subagent's, reuses it rather than building a second one. The runtime owns this extension's
 * business state and the wiring between its parts; a harness assembly owns native access and the
 * plain facts the runtime is handed (the validated configuration, the directory the extension's own
 * config file lives in, the operating system user home, and the harness identity this assembly
 * belongs to).
 *
 * The storage root is resolved here, once, from the declared `storageDir`: the field-local `~/` rule
 * and the relative-path rule are this extension's own (`storage-root.ts`), so everything below this
 * point works with an absolute root. That root is where the consumption document, the independent
 * Codex estimate and this extension's archives live; pointing the field elsewhere selects another
 * store rather than moving this one.
 *
 * Initialization is the extension's one-time entry, and it is where the baseline is read: the
 * runtime loads what the file holds — or starts a fresh period when the root holds no document yet
 * — and a baseline it cannot use is reported through the framework's feedback channel, after which
 * the instance's consumption accounting and saving stay paused. That report is the operator's
 * signal that consumption is not being recorded: nothing writes over a document that could not be
 * read, and no provider measurement elsewhere in the extension is disabled by the pause.
 *
 * What the runtime connects to the framework is {@link ModelCostRuntime.implementation}: the
 * extension's own model catalog — the one query the framework makes at a real request's start, whose
 * answer is snapshotted into that request's own facts — one per-actual-session observation group
 * over the Turn and Round axes, the framework's own activity readings and the harness's own
 * session-facts deliveries, the one-time initialization, and the cleanup that ends this instance. The
 * catalog states the maintained data's own prices (`model-data.ts`) and, for a channel the harness
 * itself prices, the harness's own model prices as the framework hands them over; the observation group
 * hands the deliveries to the request accounting (`request-accounting.ts`), which anchors each
 * request's price at its start, adds its reliable usage once, and keeps each session's latest name and
 * direct parent as the host reports them — including a rename it reports between that session's own
 * boundaries. The activity readings move the display's per-session Working/Idle (`presentation/`
 * `session-activity.ts`) and drive nothing else: they are observations of what the framework's Rounds
 * already decided, so no Round, no measured runtime and no save follows from one. The DeepSeek balance
 * reading (`provider-balance.ts`) is asked once here, while this instance initializes, and a settled
 * request then refreshes it through the framework's public HTTP module only when that reading has
 * outlived its configured success TTL and no query is already out. The Codex allowance windows
 * (`codex-quota.ts`) follow the same shape: one account API query is made while this instance
 * initializes, and a settled Codex request refreshes the windows through the same success-TTL and
 * in-flight policy — differing only in which reading it refreshes, not in the query it sends. Both
 * provider sources are asked in parallel, so the first model request waits for the slower of the two
 * rather than for one after the other, and neither a refusal nor an unauthenticated host is what
 * stops it. The reading is a fact of the provider account rather than of a session, so it is read
 * once per process and shown beside whichever session is displayed. Each report's own window pair
 * also reaches the Codex ratio measurement (`codex-estimate.ts`), which this runtime holds as one
 * measurement per process and persists in its own document (`codex-estimate-store.ts`): the
 * document is read while this instance initializes, beside the consumption baseline, so a restart
 * continues the same measurement instead of re-anchoring on its first report.
 */
import type { ExtensionImplementation, InitializationDelivery } from "../../../framework/core/assembly";
import type { FeedbackTransport } from "../../../framework/interface/feedback";
import type { CatalogPriceSource, ProviderAccess } from "../../../framework/interface/host-facts";
import type { SemanticEventHandlers, SessionCapability } from "../../../framework/interface/session";
import type { SubagentIntegration } from "../../../framework/public";
import type { HttpRequestOptions } from "../../../framework/modules/http";
import { DEFAULT_CODEX_QUOTA_TTL_MS, type CodexQuotaFailure, createCodexQuota } from "./business/allowance/codex-quota";
import { CodexEstimateStore } from "./business/allowance/codex-estimate-store";
import {
	type BaselineLoad,
	type BaselineSync,
	ConsumptionStore,
	timeFactFaultNotice,
	unreadableBaselineNotice,
	unusableBaselineNotice,
} from "./foundation/storage/consumption-store";
import { MODEL_PRICING_DATA, type ModelPricingData, dataCatalog } from "./business/pricing/model-data";
import { createPeriodSwitch } from "./business/pricing/period-switch";
import { createRequestContribution } from "./business/pricing/request-contribution";
import { createCoalescedRedraw } from "./presentation/coalesced-redraw";
import { type ConsumptionPresenter, createPresentation } from "./presentation/display";
import { createDisplayPreference, displayFormNotice, displayFormUnavailableNotice } from "./presentation/display-preference";
import { SessionActivityRegistry } from "./foundation/session/session-activity";
import type { SessionContextReader } from "./business/context/session-context";
import { DEFAULT_BALANCE_TTL_MS, type ProviderBalanceFailure, createProviderBalance } from "./business/pricing/provider-balance";
import { type ConsumptionView, createRequestAccounting } from "./foundation/session/request-accounting";
import { resolveStorageRoot } from "./foundation/storage/storage-root";

/**
 * What one read-only synchronization answers, as the caller observes it: the store's own outcome, or
 * nothing was done because this instance has already been cleaned up.
 */
export type BaselineSyncOutcome = BaselineSync | { readonly kind: "closed" };

/**
 * Where a native receipt states its notice before this instance's initialization handed over the
 * adapter's real channel.
 *
 * The harness attaches its native message hook before the first model request, but a receipt that
 * somehow arrives earlier still has its time recorded; there is simply no operator channel yet.
 */
const SILENT_FEEDBACK: FeedbackTransport = { notify: () => {} };

/**
 * The failure classifications of a provider request that really failed, as both provider modules
 * state them: a transport failure or a wait that ran out (`unreachable`), and an answer that carried
 * no usable reading (`unreadable`).
 *
 * The two other classifications are the absence of a request rather than a failed one — `no-access`
 * is a provider this host cannot authenticate the operation for, and `misconfigured` is a named
 * proxy entry that is not configured — so nothing left the process and there is no request outcome
 * for an operator to read. Those two stay where every provider fact stays: on the read-only result a
 * frontend draws.
 */
const PROVIDER_REQUEST_FAILURES: Readonly<Record<string, true>> = { unreachable: true, unreadable: true };

/** The facts an assembly hands the runtime: the validated configuration and the environment it names paths in. */
export interface ModelCostRuntimeInputs {
	/** The validated configuration the extension's own `config.yaml` was read to carry. */
	readonly config: Readonly<Record<string, unknown>>;
	/** The directory the extension's own `config.yaml` lives in. */
	readonly configDirectory: string;
	/** The operating system user home directory, as the host reports it. */
	readonly userHomeDirectory: string;
	/** The harness this assembly belongs to: the harness half of every stored session identity. */
	readonly harness: string;
	/**
	 * The extension's maintained model and price data.
	 *
	 * Omitted means this repository's maintained data (`model-data.ts`); an explicit value is that
	 * data as a caller loaded it, which is also what lets the extension's own suites drive the
	 * pricing rules with a self-made list and self-made prices.
	 */
	readonly data?: ModelPricingData;
	/**
	 * The harness's own model prices, as the framework handed them to the factory.
	 *
	 * Omitted means the maintained data's prices alone (`dataCatalog`); an explicit value is the
	 * harness's own model catalog, which answers pairs the data does not price — the allowance
	 * channel's subscription-backed models, whose price only the harness states. The maintained data
	 * always wins for a pair it names, so a harness catalog that prices DeepSeek's own ids does not
	 * replace the extension's own statement of them.
	 */
	readonly modelPrices?: CatalogPriceSource;
	/**
	 * The harness's current access to the providers it serves, as the framework handed it over.
	 *
	 * It is the one external dependency besides the transport that this extension's provider queries
	 * have: the address and credential of the balance query, and the credential the Codex account
	 * query authenticates with, are read from it at the moment of each query, so a replacement the
	 * host has since made effective is what the next query uses. Omitted means this harness resolves
	 * no such access, and a query then fails as having no access rather than borrowing one.
	 */
	readonly providerAccess?: ProviderAccess;
	/**
	 * The framework's Session capability, as the factory received it (`ImplementationContext.session`).
	 *
	 * Its observation reader is the one source of every session's activity and context reading this
	 * extension consumes: the adapter collects a reading where its host moves one, the framework's own
	 * Round bookkeeping moves the activity, and this extension reads the result rather than subscribing
	 * to any host event for itself. Its `recordCommit` is the one thing this extension states rather
	 * than reads about the storage root: when a session's snapshot really landed, the save states that
	 * fact and the framework carries it to the process serving the owner that session follows. What
	 * travels is that a write was confirmed and never the record, the figure or the file.
	 */
	readonly session: SessionCapability;
	/**
	 * The instant source this extension's own business reads, on the process's own clock.
	 *
	 * Omitted means the process clock (`Date.now`); an explicit value is the same clock as a caller
	 * drives it, which is what lets a suite place the balance reading's success TTL boundary exactly.
	 */
	readonly now?: () => number;
	/**
	 * The outbound HTTP call this extension's provider queries make.
	 *
	 * Omitted means the framework's public HTTP module (`framework/modules/http.ts`), which is what
	 * production runs on; an explicit value is that same single-request call as a caller substitutes
	 * it, so a permanent case can exercise the whole balance query — its address, its credential
	 * header, its budget and its connection path — without reaching a provider.
	 */
	readonly httpRequest?: (url: string, options?: HttpRequestOptions) => Promise<Response>;
	/**
	 * The answer this entry's subagent integration settled as, as the harness assembly states it, or a
	 * function answering nothing while no such answer exists.
	 *
	 * It decides one thing here: `/budget detail` draws the sessions this entry observed as its main
	 * session's descendants, so an entry whose integration settled as the no-subagent mode has no such
	 * form to offer and the action answers the operator instead of moving the preference. Every other
	 * answer — an integrated entry, and an integration that failed rather than being absent — keeps the
	 * action exactly as the extension delivers it, and so does an assembly that states none: the OMP
	 * assembly states none because every entry it binds is integrated.
	 */
	readonly subagentIntegrationMode?: () => SubagentIntegration["mode"] | undefined;
}

/** The extension's business instance: the storage it saves consumption through and its initialization. */
export interface ModelCostRuntime {
	/** The extension's active consumption document, as this process sees it. */
	readonly storage: ConsumptionStore;
	/**
	 * The extension's independent Codex ratio measurement, and the document it is carried in.
	 *
	 * It is the process's one measurement, fed by the paired readings a report carried and saved
	 * beside the consumption document rather than inside it — a consumption reset never touches it.
	 * Its read-only half is the display's `estimate` result; this member is how a caller that drives
	 * a report's reading itself reaches the same measurement.
	 */
	readonly estimate: CodexEstimateStore;
	/** The extension's read-only consumption results, for its frontends and its own suites. */
	readonly view: ConsumptionView;
	/** The extension's read-only display results, for the frontends that render them. */
	readonly presentation: ConsumptionPresenter;
	/**
	 * The framework's Session capability's observation reader, read one session's context at a time:
	 * the narrow read a frontend's display was written against, answering the latest reading that
	 * session's own host reported and nothing when none was observed.
	 *
	 * It is a reading rather than an accumulation: a session nothing observed has no entry rather
	 * than a zero, it is never written to the storage root, and a frontend that reads it sees the
	 * latest observation whether or not that session is the one being viewed.
	 */
	readonly sessionContext: SessionContextReader;
	/**
	 * The process's per-session activity readings, moved by the framework's own Round edges and read by
	 * the detail tree's working-row emphasis.
	 *
	 * It is a reading of the moment rather than an accounting number: a session no Round edge has moved
	 * has no entry rather than an idle one, nothing about it is written to the storage root, and a
	 * frontend that reads it sees what each session is doing now rather than what it accumulated.
	 */
	readonly sessionActivity: SessionActivityRegistry;
	/** The half the framework connects: the catalog, the observation group and the lifecycle. */
	readonly implementation: ExtensionImplementation;
	/**
	 * Load the baseline this process runs on, and ask the CLI's two provider sources once.
	 *
	 * The answer is the load's own outcome, so the caller that ran the initialization can act on
	 * what was loaded without asking the store again; the two prefetches' own outcomes are the
	 * read-only results' to report and never become this answer, and neither of them can reject it.
	 */
	initialize(delivery: InitializationDelivery): Promise<BaselineLoad>;
	/**
	 * Adopt what the file holds now, without writing anything, and align this instance with it.
	 *
	 * This is what a caller that has an event saying "another writer may have committed" reaches —
	 * a third-party completion notice, say. Only records the file already holds are adopted: nothing
	 * this instance accumulated and has not committed is written, no version chain moves, and no
	 * accumulation of this process is discarded except when the document names a generation the
	 * instance is not in, which is the same closed-period rule a reset already follows. A document
	 * whose generation really changed is therefore taken on, and a same-generation document that
	 * really changed is published to this instance's readers; a document identical to the baseline
	 * the instance holds changes nothing and redraws nothing.
	 *
	 * The optional feedback is where the two baseline faults are stated, each once per reason: a
	 * document that is not this extension's format pauses this instance (and is left alone), and a
	 * file that could not be read at all is reported with the baseline it already holds standing.
	 * After this instance's own cleanup nothing is read and nothing is adopted at all.
	 */
	synchronize(inputs?: { readonly feedback?: FeedbackTransport }): Promise<BaselineSyncOutcome>;
	/**
	 * Record a terminal result received by a main session, using this process's receipt clock.
	 *
	 * A native message hook has no framework delivery of its own, so a notice this receipt has to
	 * state uses the feedback channel the framework handed this instance at initialization — the
	 * adapter's actual operator output, never a second UI/stderr implementation.
	 */
	subagentResultReceived(sessionId: string): void | Promise<void>;
}

/**
 * Build the process's model-cost runtime from the facts an assembly read.
 *
 * Building has no effect of its own: no file is created, nothing is read and no promise is
 * started, because a binding can still be refused after this call. The configuration's declared
 * types were validated by the framework before the factory ran, so the declared value is read
 * here without a check of its own.
 */
export function createModelCostRuntime(inputs: ModelCostRuntimeInputs): ModelCostRuntime {
	// The framework validated the declared field type (`non-empty-string`) before the factory ran,
	// so the value is read here without a check of its own.
	const declaredStorageDir = inputs.config.storageDir as string;
	const data = inputs.data ?? MODEL_PRICING_DATA;
	// The extension's one price catalog, and the one the framework snapshots at a request's start:
	// the maintained data's prices, then — for a channel the harness itself prices — the harness's
	// own model prices as the fact the framework handed over. The data wins for a pair it names,
	// because those are this extension's own statement; the harness answers the pairs it does not.
	const catalog = composedCatalog(data, inputs.modelPrices);
	const storage = new ConsumptionStore(
		resolveStorageRoot({
			declared: declaredStorageDir,
			configDirectory: inputs.configDirectory,
			userHomeDirectory: inputs.userHomeDirectory,
		}),
	);
	// The process's one instant source, for every source that records when a fact was observed and
	// the harness delivers no instant of its own: the accounting's first user input, the balance
	// reading and the Codex windows alike. A Turn's end is not one of them — that instant is the
	// framework's own fact, stated by the Turn's own delivery — so the clock is not read for it.
	const now = inputs.now ?? Date.now;
	// The per-session context readings are the framework's own, not this extension's: the adapter
	// collects a session's context where its host moves one, records the model it was collected on
	// beside the count, and this instance reads what was recorded — including the readings collected
	// before it was built, which is what makes the first reading after an attach a reading rather
	// than a blank. What `sessionContext` is, then, is the narrow read the display was written
	// against: the capability's observation reader, answering one session's context alone. Nothing is
	// copied here, and nothing is written to the storage root.
	//
	// It is read before the accounting because the accounting reads the same record for the identity
	// of a session it holds no delivery of its own about — a session another process ran is registered
	// there by the readings that process delivered — so the sessions this instance can name and the
	// readings it can show come from one record rather than two.
	const observations = inputs.session.observations;
	// User input and terminal subagent-result receipt use this process's observation clock.
	// A Turn end instead carries the response's own settle instant.
	const accounting = createRequestAccounting({
		// The accounting owns session attribution and commits; this business policy alone decides
		// what each request contributes, from the same maintained data its catalog reads.
		contribution: createRequestContribution(data),
		harness: inputs.harness,
		storage,
		now,
		registrations: observations,
		// This instance's own half of the write notice: the save states that a snapshot really landed in
		// the shared document, and the framework carries that statement to the process serving the owner
		// the session follows. It is handed on exactly as the framework supplied it — nothing of the
		// consumption, the record or the file travels with it.
		recordCommit: sessionId => inputs.session.recordCommit(sessionId),
	});

	// The entry's own display preference: `/budget detail` flips it, and the flip announces the change
	// through the one notification every reader of this extension's read-only result already holds, so
	// a frontend redraws the form the entry is now in without a channel of its own.
	const display = createDisplayPreference({ onChange: () => accounting.announceChanged() });

	const sessionContext: SessionContextReader = {
		read: sessionId => observations.read(sessionId)?.context,
	};

	// The per-session activity readings: one process-wide record the framework's own Round edges move —
	// a start opens a session's Round and a confirmed end closes it, for a main session and for a
	// subagent alike — and the detail tree reads to emphasise the rows whose session is working right
	// now. It is a reading of the moment: nothing here is persisted, and a session no edge has moved
	// stays unestablished rather than being assumed idle.
	const sessionActivity = new SessionActivityRegistry();

	// The display's own redraw, merged (see `presentation/coalesced-redraw.ts`): a reading that moved
	// asks for a redraw rather than drawing itself, so a turn's readings — several sessions', and both
	// of a session's own readings — are drawn together from their latest values. The reading itself is
	// adopted where it arrives, as it always was; what waits for the end of the turn is the drawing.
	const redraw = createCoalescedRedraw({
		redraw: () => accounting.announceChanged(),
		published: listener => accounting.view.subscribe(listener),
	});

	// The provider balance reading: one per process, refreshed only by a settled request of its own
	// provider when the reading it holds has outlived the configured success TTL. Its changes are
	// published through the accounting's own change notification, so a frontend keeps the one
	// subscription it already has for everything this extension's read-only result carries.
	const balance = createProviderBalance({
		...(inputs.providerAccess === undefined ? {} : { access: inputs.providerAccess }),
		now: inputs.now ?? Date.now,
		ttlMs: balanceTtlMs(inputs.config),
		onChange: () => accounting.announceChanged(),
		...(inputs.httpRequest === undefined ? {} : { httpRequest: inputs.httpRequest }),
	});

	// The Codex allowance windows: one set per process, seeded once by the account API query at
	// initialization and refreshed by a settled Codex request under the same success-TTL policy the
	// balance reading uses. Nothing else queries them, so no view change, model switch, Round edge or
	// elapsed budget reaches a provider.
	// The Codex ratio measurement: one measurement per process, fed only by the paired readings a
	// single report carried and persisted independently of the consumption document, so a consumption
	// reset never touches it and a restart continues measuring from the same baseline.
	const estimate = new CodexEstimateStore(storage.storageDirectory, now);
	const quota = createCodexQuota({
		...(inputs.providerAccess === undefined ? {} : { access: inputs.providerAccess }),
		now,
		ttlMs: codexQuotaTtlMs(inputs.config),
		onChange: () => accounting.announceChanged(),
		estimate,
		...(inputs.httpRequest === undefined ? {} : { httpRequest: inputs.httpRequest }),
	});

	/**
	 * The provider failures this instance has already stated, each by the failed attempt's own
	 * identity: a later delivery that finds the same failures again says nothing more about them, and
	 * a new attempt — a query the success TTL let through after the first one failed — is a new fact.
	 */
	let statedBalanceFailure: ProviderBalanceFailure | undefined;
	let statedQuotaFailure: CodexQuotaFailure | undefined;

	/**
	 * State this extension's provider failures on the delivery's own channel, for a session with no UI.
	 *
	 * A balance or allowance query that failed is a fact of the provider account rather than of a
	 * session, so it is stated beside whichever delivery this instance is handed. A session with a UI
	 * hears nothing here: the widget draws that same read-only result, and the specification keeps
	 * these two sources' failures out of its notification channel there. A session without one has no
	 * widget to draw in, so the failure travels the unified extension feedback channel instead — one
	 * stderr line, at the severity of an effect that did not happen, naming the source and the
	 * sanitized reason the result already carries.
	 *
	 * What is stated is the business fact, not a drawing: a headless session takes no widget line and
	 * no frontend formatting, and the reason is the module's own `no-access`/`unreachable`/
	 * `unreadable`/`misconfigured` classification, which names no address, amount or credential.
	 * Only the two classifications of a request that really failed are stated (`unreachable` and
	 * `unreadable`, see {@link PROVIDER_REQUEST_FAILURES}): a query that was never sent because this
	 * host holds no credential for it, or because the named proxy it selects is not configured, has
	 * no request outcome to report, and its read-only result is where that fact belongs.
	 *
	 * A failure settles after the delivery that started its query — a settled request's refresh is
	 * background work — so it is stated at the next delivery, and a process that ends before one
	 * arrives leaves one unstated rather than reaching for a channel outside a dispatch. Nothing is
	 * stated after this instance's own cleanup, because a disposed source accepts no late answer.
	 */
	const stateProviderFailures = (delivery: { readonly hasUI: boolean; readonly feedback: FeedbackTransport }): void => {
		if (delivery.hasUI) return;
		const balanceFailure = balance.result().failure;
		if (
			balanceFailure !== undefined &&
			balanceFailure !== statedBalanceFailure &&
			PROVIDER_REQUEST_FAILURES[balanceFailure.detail] === true
		) {
			statedBalanceFailure = balanceFailure;
			delivery.feedback.notify("error", `余额读取失败（${balanceFailure.detail}）；本次未取得余额读数。`);
		}
		const quotaFailure = quota.result().failure;
		if (
			quotaFailure !== undefined &&
			quotaFailure !== statedQuotaFailure &&
			PROVIDER_REQUEST_FAILURES[quotaFailure.detail] === true
		) {
			statedQuotaFailure = quotaFailure;
			delivery.feedback.notify("error", `Codex 额度读取失败（${quotaFailure.detail}）；本次未取得额度窗口。`);
		}
	};

	/**
	 * The common accounting preparation this instance performs once: the baseline document it runs
	 * on and the independent Codex estimate beside it.
	 *
	 * What the accounting needs before it may process a delivery is this and nothing else: the
	 * configuration was validated by the framework before the factory ran, and the prices travel in
	 * the catalog. The root-side effects are deliberately not part of it — the provider prefetch and
	 * the display belong to the owner session's own initialization ({@link initialize}).
	 */
	const loadBaseline = async (feedback: FeedbackTransport): Promise<BaselineLoad> => {
		const load = await storage.load();
		if (load.kind === "unusable") {
			const notice = unusableBaselineNotice(storage.consumptionFile, load.reason);
			feedback.notify(notice.level, notice.message);
		}
		if (load.kind === "loaded") {
			// The document is usable, so an unreadable time fact costs the time reading alone: each one
			// is stated, and nothing is paused, zeroed or substituted for it.
			for (const fault of load.faults) {
				const notice = timeFactFaultNotice(storage.consumptionFile, fault);
				feedback.notify(notice.level, notice.message);
			}
		}
		// The estimate document is read after the storage root's own load — which is what creates the
		// root this document lives in — and before any source can report a reading, so the measurement
		// continues from what the file holds rather than re-anchoring on the first report.
		await estimate.load();
		return load;
	};

	/**
	 * This instance's one preparation, and the promise every caller of it shares.
	 *
	 * It is asked for by the first delivery this instance serves. For the owner session that is the
	 * node the harness initializes the implementation at; for a session this instance serves without
	 * being its owner — a spawned session's own binding, in the process the provider ran it in — it is
	 * that session's own first delivery, which is what lets that session's consumption be accounted
	 * and saved rather than dropped for a baseline nobody loaded. One result is shared by every
	 * concurrent caller, so a session's first Round and the request inside it read the file once.
	 */
	let preparation: Promise<BaselineLoad> | undefined;
	/** Whether the one preparation has settled, which is what lets a later delivery run at once. */
	let prepared = false;
	const prepare = (feedback: FeedbackTransport): Promise<BaselineLoad> => {
		if (preparation !== undefined) return preparation;
		preparation = loadBaseline(feedback).then(load => {
			prepared = true;
			return load;
		});
		return preparation;
	};

	/**
	 * Run one delivery's accounting: now when this instance's preparation has settled, and once it
	 * settles otherwise.
	 *
	 * The order the deliveries were handed over in is the order their work runs in — every
	 * un-prepared caller waits on the same preparation and is continued in the order it asked — so a
	 * Round's own edges and the requests inside it keep their order even while the baseline is still
	 * being read.
	 */
	const account = (feedback: FeedbackTransport, work: () => void | Promise<void>): void | Promise<void> =>
		prepared ? work() : prepare(feedback).then(() => work());

	/**
	 * Whether this instance began its own root-side start: the owner session's initialization, which
	 * is what asks the CLI's two provider sources and holds their readings.
	 *
	 * It decides one thing here. The balance and the allowance windows are facts of the provider
	 * account rather than of a session, and this process reads each of them once — at the owner
	 * session's initialization and, later, refreshed by a settled request of its own provider. An
	 * instance that serves a session without being the owner of it — a spawned session's own binding,
	 * in this process or in the child process the provider ran — therefore refreshes nothing: it holds
	 * no such reading, and starting one there would be a second root-side read of the same account
	 * rather than the request-triggered refresh of the reading this instance obtained.
	 */
	let rootSideStarted = false;

	/**
	 * The one operator feedback channel this process's native callbacks use.
	 *
	 * It is the channel the framework handed the implementation at initialization, mapped by the
	 * selected adapter through its actual UI/stderr output. A native message hook has no delivery
	 * of its own, so it reuses this one rather than constructing a second output implementation.
	 */
	let operatorFeedback: FeedbackTransport | undefined;

	const initialize = async (delivery: InitializationDelivery): Promise<BaselineLoad> => {
		// The root-side start is recorded before the preparation is awaited, because what the refresh
		// above belongs to is this instance's own read of the account rather than the file's readiness.
		rootSideStarted = true;
		operatorFeedback = delivery.feedback;
		const load = await prepare(delivery.feedback);
		// The CLI's one prefetch of its two provider sources, started at the same instant rather than
		// one after the other: the DeepSeek balance reading and the Codex allowance windows are asked
		// in parallel, so the initialization is bounded by the slower of the two rather than by their
		// sum. Both are asked here because this is where the instance starts; neither depends on the
		// model the session runs, on what is being viewed, or on the other source answering. A source
		// this host cannot authenticate asks nothing (the balance's own prefetch skips it, the account
		// query states it), and neither failure is allowed to reject the initialization: this promise
		// is what the first model request waits on, and a prefetch that could not be made must not
		// become a model request that could not be issued.
		await Promise.all([balance.prefetch(), quota.startup()]);
		// The two startup attempts have settled by now, so what either of them failed to obtain is
		// already a fact — and this is the one delivery whose own initialization waited for them.
		stateProviderFailures(delivery);
		return load;
	};

	/**
	 * The baseline faults this instance has already stated, each by its own reason: a second
	 * synchronization that meets the same fault says nothing more about it, and a different one is a
	 * new fact about the file.
	 */
	let statedUnusableBaseline: string | undefined;
	let statedUnreadableBaseline: string | undefined;
	/** Whether this instance's own cleanup has run, after which a synchronization does nothing at all. */
	let closed = false;

	/**
	 * Adopt what the file holds now — the read-only half of sharing one storage root — and align this
	 * instance with what was adopted.
	 *
	 * The store's own half is described in `consumption-store.ts`: nothing is written, a root holding
	 * no document is nothing to adopt, and a document that is not this extension's format pauses the
	 * instance. What this half adds is what the adoption means for the rest of the instance. A
	 * document naming another generation is a period this instance was not accumulating in, so
	 * everything measured in the replaced one goes with it — the same rule this instance's own reset
	 * follows, applied to a reset another process committed — and nothing accumulated in a closed
	 * period is ever published into the new one. A same-generation document that really differs from
	 * the held baseline is what this instance's readers have to see, so it is published through the
	 * one change notification they already hold; a document identical to the baseline changes nothing
	 * and redraws nothing, which is what keeps a repeated event from costing a redraw.
	 *
	 * A fault is stated where the caller has anywhere to state it — the caller's own feedback, the
	 * same channel this instance's provider failures use — once per reason. The two faults are not
	 * the same thing: a document that is not this extension's format pauses the instance (accounting
	 * and saving stop, and the file is left for inspection), while a file that could not be read at
	 * all is reported with the baseline this instance holds still standing.
	 *
	 * The caller's event is not a save and never becomes one: a completion notice, a process exit or a
	 * third party's own bookkeeping says that the file may have changed, so the records another writer
	 * really committed are adopted and nothing else happens. Consumption this instance has not
	 * committed is not written out, no Round boundary is derived and no session is forced to save.
	 */
	const synchronize = async (
		inputs: { readonly feedback?: FeedbackTransport } = {},
	): Promise<BaselineSyncOutcome> => {
		// After this instance's own cleanup nothing is read and nothing is adopted: a late notice is
		// not a reason to touch the file again.
		if (closed) return { kind: "closed" };
		const outcome = await storage.synchronize();
		switch (outcome.kind) {
			case "adopted":
				// The document was read whole, so whatever fault a previous attempt met is no longer the
				// state of this file: a later failure of the same shape is a new fact about it and is stated.
				statedUnusableBaseline = undefined;
				statedUnreadableBaseline = undefined;
				if (outcome.periodChanged) accounting.periodSwitched();
				else if (outcome.changed) accounting.announceChanged();
				break;
			case "unusable": {
				if (inputs.feedback !== undefined && statedUnusableBaseline !== outcome.reason) {
					statedUnusableBaseline = outcome.reason;
					const notice = unusableBaselineNotice(storage.consumptionFile, outcome.reason);
					inputs.feedback.notify(notice.level, notice.message);
				}
				break;
			}
			case "unreadable": {
				if (inputs.feedback !== undefined && statedUnreadableBaseline !== outcome.reason) {
					statedUnreadableBaseline = outcome.reason;
					const notice = unreadableBaselineNotice(storage.consumptionFile, outcome.reason);
					inputs.feedback.notify(notice.level, notice.message);
				}
				break;
			}
			case "absent":
			case "paused":
				break;
		}
		return outcome;
	};

	/** The read-only synchronization this turn's commit notices owe, and the notice it was asked by. */
	let commitSynchronization: Promise<void> | undefined;
	let owedSynchronization: { readonly feedback: FeedbackTransport } | undefined;

	/**
	 * The read-only synchronization one or more commit notices cost together.
	 *
	 * A notice is one event saying the shared document may hold something this instance has not read;
	 * what it owes is a read, not a read of its own. The first notice of a turn arranges that read at
	 * the turn's end, so every notice delivered with it joins the same one; notices delivered while
	 * that read is under way mark the one read that follows — because a write confirmed after this
	 * read began is not in the document the read saw. Nothing is cleared before the promise it belongs
	 * to: a notice arriving at any point either shares the read in flight or is the reason for the
	 * next one, so a turn's last notice is never dropped.
	 *
	 * The handler's settlement is the read, which is a scheduling difference alone: it settles after
	 * the file has been adopted, so a caller waiting for the deliveries it dispatched waits for that
	 * adoption rather than racing it.
	 */
	const synchronizeOnCommit = (feedback: FeedbackTransport): Promise<void> => {
		owedSynchronization = { feedback };
		if (commitSynchronization !== undefined) return commitSynchronization;
		commitSynchronization = (async () => {
			// The turn's remaining notices join this run here rather than each starting its own read.
			await Promise.resolve();
			try {
				while (owedSynchronization !== undefined) {
					const owed = owedSynchronization;
					owedSynchronization = undefined;
					await synchronize({ feedback: owed.feedback });
				}
			} finally {
				// Cleared in the same continuation that decided the run was over, so a notice delivered
				// afterwards starts its own read rather than joining one that has already finished.
				commitSynchronization = undefined;
			}
		})();
		return commitSynchronization;
	};

	// The period switch behind `/budget holiday` and `/budget clear`. It reads the entry's own facts
	// from the delivery (its provider and its idle state) and this instance's own ones (whether a
	// snapshot it started is still publishing), makes the one boundary balance read outside the file
	// coordination, and then closes the period through the store: archive the file's own document,
	// publish the new activity. See `period-switch.ts` for the rules and the wording.
	const periodSwitch = createPeriodSwitch({
		storage,
		savePending: () => accounting.savePending(),
		boundaryReading: () => balance.boundaryReading(),
		onReset: () => accounting.periodSwitched(),
		now,
	});

	// The extension's own price catalog: the framework asks it once, at a request's real start, and
	// snapshots the answer into that request's facts, and this extension's own display queries the
	// same catalog for the fee-structure reference ratio. The maintained data answers first, with the
	// harness's own model prices answering the pairs it does not (see `composedCatalog`), so a
	// monetary pair answers the tier's own off-peak price while the allowance channel answers the
	// price the harness states for it; a pair neither answers is no price rather than a price of zero.
	const events: SemanticEventHandlers = {
		// Every accounting delivery below runs through `account`: this instance's preparation (the
		// baseline and the estimate) is what the accounting reads, so a delivery this instance serves
		// while it is still being prepared is processed once it settled rather than dropped as one of a
		// baseline nobody loaded. The root-side effects are not part of that preparation — see
		// `rootSideStarted` for the one place the distinction is visible.
		turn_start: delivery => {
			stateProviderFailures(delivery);
			return account(delivery.feedback, () => accounting.turnStarted(delivery));
		},
		turn_end: delivery => {
			stateProviderFailures(delivery);
			// The settled response's own two facts: it ends that session's Session span at the instant
			// this delivery states — every outcome delivers one, so a failed or cancelled Turn ends the
			// span too — and its reported usage is accounted once, or the skip is reported. The end is
			// observed whether or not the accounting has anything to count for this Turn, and a Round
			// that never ends costs the reading nothing.
			return account(delivery.feedback, () => {
				accounting.turnSettled(delivery);
				// The usage-driven provider refresh reads the *request's* own provider rather than whatever
				// is being viewed or is current now, so a subagent's request and a main session's refresh the
				// same one reading, and a request of another provider reaches nothing here. The balance and
				// the Codex windows share the policy: each module filters to its own provider and checks its
				// own success TTL, and an expired reading with no query already out begins one.
				//
				// Only an instance that began its own root-side start refreshes anything: an instance
				// serving a spawned session without owning it holds no such reading, and asking the account
				// there would be a second root-side read of the same account rather than a refresh of this
				// instance's own reading.
				if (!rootSideStarted) return;
				balance.usageSettled(delivery.turn.provider);
				quota.usageSettled(delivery.turn.provider);
			});
		},
		// Both edges of a Round. Each one is an accounting boundary — the start fixes the snapshot its
		// own additions are measured from, and the end measures them, saves the session's own snapshot
		// and becomes the previous Round. A subagent session's own runtime is measured from these same
		// two facts — its Round is one of its activities — so a Round end is also where the interval
		// that Round ran for settles.
		//
		// The session's *activity* is not moved here, although these edges are the facts behind it:
		// which fact ends a session's work is the framework's answer, and it states that answer as its
		// own observation below. Reading it off these edges would be this extension deciding the same
		// question a second time — and, for a session another process ran, deciding it with no facts at
		// all.
		round_start: delivery => {
			stateProviderFailures(delivery);
			return account(delivery.feedback, () => accounting.roundStarted(delivery));
		},
		round_end: delivery => {
			stateProviderFailures(delivery);
			return account(delivery.feedback, () => accounting.roundEnded(delivery));
		},
		// One actual session's current activity, as the framework's own Round semantics state it: a
		// session whose Round is open is working, one whose Round has ended is idle, and the framework
		// delivers the reading where it moved. It carries the session's own identity — a subagent's
		// reading is the subagent's, never a parent's or the viewed session's — so the reading the
		// display draws for a row is that row's session, and a real move is published at once rather
		// than waiting for the next request to redraw a row whose session just started or stopped
		// working.
		//
		// Nothing of the accounting runs here, and nothing may: the reading is an observation for the
		// display, and this extension's Rounds, its measured runtimes, its session snapshots and its
		// saves are driven by the edges above alone. A session whose reading arrives without this
		// process ever having watched its Round — one another process ran — is therefore shown as
		// working or idle with nothing accounted, nothing saved and no Round invented for it.
		session_activity: delivery => {
			stateProviderFailures(delivery);
			if (sessionActivity.observe(delivery.session.sessionId, delivery.activity)) redraw.request();
		},
		// The one fact that establishes a session's Session span start: input the harness itself
		// attributed to the user, published for every submission it admitted — an ordinary prompt and a
		// user-invoked skill alike.
		user_input: delivery => {
			stateProviderFailures(delivery);
			return account(delivery.feedback, () => accounting.userInput(delivery));
		},
		// The harness's own name-change fact, which is what keeps a session's identity current
		// between boundaries — for a subagent nobody is viewing exactly as for the session on screen.
		session_facts: delivery => {
			stateProviderFailures(delivery);
			return account(delivery.feedback, () => accounting.sessionFacts(delivery.session));
		},
		// One actual session's own context reading moved. The reading is not adopted here because it
		// has nowhere to be adopted from: this extension reads it from the framework's Session
		// capability, whose observation reader already holds the reading this delivery carries — so
		// what this delivery is for is the one thing a reading that moved costs, a redraw of whatever
		// this extension is drawing. That redraw is the turn's own (`redraw` above): the readings that
		// arrived in this turn are drawn together rather than one frame per delivery.
		session_context: () => {
			redraw.request();
		},
		// One actual session's own confirmed write of its extension data, as the process that ran it
		// counted it: another writer put consumption into the storage root this instance reads, so what
		// this instance holds as its basis may be behind the file. The delivery carries no figure from
		// that file, and nothing of this instance's accounting is accumulated from it — what it costs is
		// the read-only synchronization, which reads the document the file really holds and adopts it
		// without writing anything of this instance's own. It is deliberately not an initialization, not
		// a forced save and not a poll: a notice is one event, a refused or unreadable baseline is
		// reported exactly as a save meeting the same file reports it, and a session this instance never
		// committed for is still saved by its own process alone.
		session_commit: delivery => {
			stateProviderFailures(delivery);
			// The handler's own settlement is the read: the framework contains a rejection exactly as it
			// contains a synchronous throw, and a caller waiting for the deliveries it dispatched — the
			// session-disposal close-out, say — waits for this read rather than racing it. Which read it
			// settles on is the coalescer's answer above: this turn's notices share one, and a notice
			// delivered while that read runs is the reason for the next one.
			return synchronizeOnCommit(delivery.feedback);
		},
		// One actual session's observation became unavailable: the source that carried its readings ended,
		// and the framework's own source has already withdrawn them. What is left to do here is this
		// instance's own half of the same reading — the activity registry the detail form emphasises a
		// row's name with — and the redraw that drops the row's context beside it. An unavailable
		// observation is not idleness: the reading is forgotten rather than replaced, so the row reverts to
		// the unestablished state a session no edge has moved is drawn in and never to an idle one. Nothing
		// of the accounting runs here, exactly as nothing of it runs for a reading that arrived: no Round
		// ends, no Turn is attributed and nothing is saved, because a lost connection is evidence of
		// nothing about the work itself. A source's end is one fact rather than a stream of them, so it
		// costs the one redraw the row needs.
		session_unobserved: delivery => {
			stateProviderFailures(delivery);
			sessionActivity.forget(delivery.session.sessionId);
			accounting.announceChanged();
		},
		// One actual session's own start. A spawned session's binding announces it once, and it is the
		// one delivery whose model and level readings are that session's startup facts — the framework
		// reports them on a start that proves the session was beginning, and on no other delivery, so a
		// session merely recovered here arrives with nothing to record for its startup.
		session_start: delivery => {
			stateProviderFailures(delivery);
			return account(delivery.feedback, () => accounting.started(delivery.session));
		},
	};

	return {
		storage,
		estimate,
		view: accounting.view,
		presentation: createPresentation({
			view: accounting.view,
			sessionContext,
			sessionActivity,
			data,
			priceOf: (provider, model) => catalog.priceOf(provider, model),
			display,
			balance,
			quota,
			estimate,
			// The open period's own facts, as the store holds them: its holiday flag, and every
			// harness's session records as the last load or commit left them — the period's consumption
			// is the whole shared document's, so the accrued bar reads the other harness's saved
			// records beside this one's. Nothing here reads a file, so a render that asks for the
			// season or the accrued bar never waits on disk.
			period: {
				holiday: () => storage.period()?.holiday ?? false,
				sessions: () => storage.periodSessions(),
			},
			now,
		}),
		sessionContext,
		sessionActivity,
		implementation: {
			catalog,
			// One group over every actual session, main or subagent: a request's consumption belongs to
			// the session that issued it, and a subagent's own Rounds are its own.
			subscriptions: [{ scope: "session", events }],
			// The extension's own half of `/budget`: the action table's implementations, which the
			// framework's routing reaches and whose effects and words are business decisions. `detail`
			// flips the entry's preference and says which form the entry is now in; it checks no
			// provider, no idle fact, no pending save and no UI, and it never creates a widget — a
			// frontend draws what the changed preference now reads as, if it has anywhere to draw. An
			// entry whose subagent integration settled as the no-subagent mode is the one exception: the
			// form lists the descendants this entry observed, so there is nothing for it to draw and the
			// action answers the operator instead (see `subagentIntegrationMode` above).
			// The two period actions are the entry's own conditions and the store's own close, and
			// each says exactly how far it got.
			commands: {
				budget: {
					detail: delivery => {
						stateProviderFailures(delivery);
						if (inputs.subagentIntegrationMode?.() === "none") {
							delivery.feedback.notify("warning", displayFormUnavailableNotice());
							return;
						}
						const form = display.toggle();
						delivery.feedback.notify("info", displayFormNotice(form));
					},
					holiday: delivery => {
						stateProviderFailures(delivery);
						return periodSwitch.holiday(delivery);
					},
					clear: delivery => {
						stateProviderFailures(delivery);
						return periodSwitch.clear(delivery);
					},
				},
			},
			initialize: async delivery => {
				await initialize(delivery);
			},
			cleanup: () => {
				closed = true;
				redraw.dispose();
				balance.dispose();
				quota.dispose();
				accounting.dispose();
			},
		},
		initialize,
		synchronize,
		subagentResultReceived(sessionId) {
			if (closed) return;
			// Capture receipt before preparation can wait on disk; it is not the later handler time.
			const receivedAt = (inputs.now ?? Date.now)();
			const feedback = operatorFeedback ?? SILENT_FEEDBACK;
			return account(feedback, () => accounting.subagentResultReceived(sessionId, receivedAt, feedback));
		},
	};
}

/**
 * The success TTL the balance reading keeps, as the extension's own configuration states it.
 *
 * The declared field is validated by the framework before the factory runs, so the value read here
 * is the one its `config.yaml` was checked to carry; a configuration that does not state it — which
 * is what a suite constructing a runtime from plain inputs does — keeps the specification's own
 * default rather than a value this module invents per call.
 */
function balanceTtlMs(config: Readonly<Record<string, unknown>>): number {
	const declared = config.balanceTtlMs;
	return typeof declared === "number" ? declared : DEFAULT_BALANCE_TTL_MS;
}

/**
 * The success TTL the Codex allowance windows keep, as the extension's own configuration states it.
 *
 * The declared field is validated by the framework before the factory runs, so the value read here
 * is the one its `config.yaml` was checked to carry; a configuration that does not state it — which
 * is what a suite constructing a runtime from plain inputs does — keeps the specification's own
 * default rather than a value this module invents per call.
 */
function codexQuotaTtlMs(config: Readonly<Record<string, unknown>>): number {
	const declared = config.codexQuotaTtlMs;
	return typeof declared === "number" ? declared : DEFAULT_CODEX_QUOTA_TTL_MS;
}

/**
 * The extension's one price catalog: the maintained data's prices, with the harness's own model
 * prices answering whatever the data does not.
 *
 * A query the data answers is this extension's own statement of that model's price and stays it,
 * whatever a harness catalog says about the same pair; a query it does not answer falls to the
 * harness, which is what makes the allowance channel's own price available without a second price
 * table here — and a pair neither answers is no price rather than a price of zero.
 */
function composedCatalog(data: ModelPricingData, harness: CatalogPriceSource | undefined): CatalogPriceSource {
	const maintained = dataCatalog(data);
	if (harness === undefined) return maintained;
	return {
		priceOf: (provider, model) => maintained.priceOf(provider, model) ?? harness.priceOf(provider, model),
	};
}
