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
 * over the Turn and Round axes plus the harness's own session-facts deliveries, the one-time
 * initialization, and the cleanup that ends this instance. The catalog states the maintained data's
 * own prices (`model-data.ts`) and, for a channel the harness itself prices, the harness's own model
 * prices as the framework hands them over; the observation group hands the deliveries to the request
 * accounting (`request-accounting.ts`), which anchors each request's price at its start, adds its
 * reliable usage once, and keeps each session's latest name and direct parent as the host reports
 * them — including a rename it reports between that session's own boundaries. The DeepSeek balance
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
import type { CatalogPriceSource, FeedbackTransport, ProviderAccess, SemanticEventHandlers, SubagentIntegration } from "../../../framework/core/protocol";
import type { HttpRequestOptions } from "../../../framework/modules/http";
import { DEFAULT_CODEX_QUOTA_TTL_MS, type CodexQuotaFailure, createCodexQuota } from "./codex-quota";
import { CodexEstimateStore } from "./codex-estimate-store";
import {
	type BaselineLoad,
	type BaselineSync,
	ConsumptionStore,
	timeFactFaultNotice,
	unreadableBaselineNotice,
	unusableBaselineNotice,
} from "./consumption-store";
import { MODEL_PRICING_DATA, type ModelPricingData, dataCatalog } from "./model-data";
import { createPeriodSwitch } from "./period-switch";
import { type ConsumptionPresenter, createPresentation } from "./presentation/display";
import { createDisplayPreference, displayFormNotice, displayFormUnavailableNotice } from "./presentation/display-preference";
import { SessionActivityRegistry } from "./presentation/session-activity";
import { SessionContextRegistry } from "./presentation/session-context";
import { DEFAULT_BALANCE_TTL_MS, type ProviderBalanceFailure, createProviderBalance } from "./provider-balance";
import { type ConsumptionView, createRequestAccounting } from "./request-accounting";
import { resolveStorageRoot } from "./storage-root";

/**
 * What one read-only synchronization answers, as the caller observes it: the store's own outcome, or
 * nothing was done because this instance has already been cleaned up.
 */
export type BaselineSyncOutcome = BaselineSync | { readonly kind: "closed" };

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
	 * The process's per-session context readings, fed by the harness half as each session binding
	 * reports its own current `getContextUsage()`, and read by the detail tree's descendant rows.
	 *
	 * It is a reading rather than an accumulation: a session no binding observed has no entry rather
	 * than a zero, it is never written to the storage root, and a frontend that reads it sees the
	 * latest observation whether or not that session is the one being viewed.
	 */
	readonly sessionContext: SessionContextRegistry;
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
	// The accounting's own clock is what timestamps a user input, the one Session span fact the
	// harness publishes with no instant of its own. The span's other fact is a Turn's own settle
	// instant, which the Turn's own end delivery carries.
	const accounting = createRequestAccounting({ data, harness: inputs.harness, storage, now });

	// The entry's own display preference: `/budget detail` flips it, and the flip announces the change
	// through the one notification every reader of this extension's read-only result already holds, so
	// a frontend redraws the form the entry is now in without a channel of its own.
	const display = createDisplayPreference({ onChange: () => accounting.announceChanged() });

	// The per-session context readings: one process-wide record the harness half feeds from every
	// session binding's own `getContextUsage()` — the main session's and each subagent's — and the
	// detail tree reads for its descendant rows. It is a reading, never persisted or fetched.
	const sessionContext = new SessionContextRegistry();

	// The per-session activity readings: one process-wide record the framework's own Round edges move —
	// a start opens a session's Round and a confirmed end closes it, for a main session and for a
	// subagent alike — and the detail tree reads to emphasise the rows whose session is working right
	// now. It is a reading of the moment: nothing here is persisted, and a session no edge has moved
	// stays unestablished rather than being assumed idle.
	const sessionActivity = new SessionActivityRegistry();

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

	const initialize = async (delivery: InitializationDelivery): Promise<BaselineLoad> => {
		const load = await storage.load();
		if (load.kind === "unusable") {
			const notice = unusableBaselineNotice(storage.consumptionFile, load.reason);
			delivery.feedback.notify(notice.level, notice.message);
		}
		if (load.kind === "loaded") {
			// The document is usable, so an unreadable time fact costs the time reading alone: each one
			// is stated, and nothing is paused, zeroed or substituted for it.
			for (const fault of load.faults) {
				const notice = timeFactFaultNotice(storage.consumptionFile, fault);
				delivery.feedback.notify(notice.level, notice.message);
			}
		}
		// The estimate document is read after the storage root's own load — which is what creates the
		// root this document lives in — and before any source can report a reading, so the measurement
		// continues from what the file holds rather than re-anchoring on the first report.
		await estimate.load();
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
		turn_start: delivery => {
			stateProviderFailures(delivery);
			accounting.turnStarted(delivery);
		},
		turn_end: delivery => {
			stateProviderFailures(delivery);
			// The settled response's own two facts: it ends that session's Session span at the instant
			// this delivery states — every outcome delivers one, so a failed or cancelled Turn ends the
			// span too — and its reported usage is accounted once, or the skip is reported. The end is
			// observed whether or not the accounting has anything to count for this Turn, and a Round
			// that never ends costs the reading nothing.
			accounting.turnSettled(delivery);
			// The usage-driven provider refresh reads the *request's* own provider rather than whatever
			// is being viewed or is current now, so a subagent's request and a main session's refresh the
			// same one reading, and a request of another provider reaches nothing here. The balance and
			// the Codex windows share the policy: each module filters to its own provider and checks its
			// own success TTL, and an expired reading with no query already out begins one.
			balance.usageSettled(delivery.turn.provider);
			quota.usageSettled(delivery.turn.provider);
		},
		// Both edges of a Round. Each one is that session's own activity fact as well as an accounting
		// boundary — an open Round is the session working and a confirmed end is the session idle — so
		// the reading the display draws is moved here, ahead of the accounting's own handling and its
		// own guards, and a real move is published at once rather than waiting for the next request to
		// redraw a row whose session just started or stopped working.
		//
		// The accounting's own half: the start fixes the snapshot its own additions are measured from,
		// and the end measures them, saves the session's own snapshot and becomes the previous Round. A
		// subagent session's own runtime is measured from these same two facts — its Round is one of its
		// activities — so a Round end is also where the interval that Round ran for settles.
		round_start: delivery => {
			stateProviderFailures(delivery);
			if (sessionActivity.observe(delivery.session.sessionId, "working")) accounting.announceChanged();
			accounting.roundStarted(delivery);
		},
		round_end: delivery => {
			stateProviderFailures(delivery);
			if (sessionActivity.observe(delivery.session.sessionId, "idle")) accounting.announceChanged();
			return accounting.roundEnded(delivery);
		},
		// The one fact that establishes a session's Session span start: input the harness itself
		// attributed to the user, published for every submission it admitted — an ordinary prompt and a
		// user-invoked skill alike.
		user_input: delivery => {
			stateProviderFailures(delivery);
			accounting.userInput(delivery);
		},
		// The harness's own name-change fact, which is what keeps a session's identity current
		// between boundaries — for a subagent nobody is viewing exactly as for the session on screen.
		session_facts: delivery => {
			stateProviderFailures(delivery);
			accounting.sessionFacts(delivery.session);
		},
		// One actual session's own start. A spawned session's binding announces it once, and it is the
		// one delivery whose model and level readings are that session's startup facts — the framework
		// reports them on a start that proves the session was beginning, and on no other delivery, so a
		// session merely recovered here arrives with nothing to record for its startup.
		session_start: delivery => {
			stateProviderFailures(delivery);
			accounting.started(delivery.session);
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
				balance.dispose();
				quota.dispose();
				accounting.dispose();
			},
		},
		initialize,
		synchronize,
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
