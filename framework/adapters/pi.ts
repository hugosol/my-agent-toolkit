/**
 * pi extension API → framework port. State, controls, prompt planning and marker
 * composition stay in the existing public behaviors; only native facts/effects
 * are mapped here. An observation axis this mapping has no fact for is reported as an
 * absent observation rather than accepted as a silent subscription or invented from
 * some other fact.
 */
import { bindExtension } from "../behaviors/binding";
import { isImplementationDisposed } from "../behaviors/lifecycle";
import type { ExtensionAssembly, ExtensionImplementation, ImplementationContext } from "../core/assembly";
import { activationField, stateInheritance, statePersistence } from "../core/definition";
import type { ExtensionDefinition } from "../core/definition";
import type { FollowedAccessReader } from "../core/followed-owners";
import type {
	BindingResult, CatalogPrice, CatalogPriceSource, FeedbackLevel, FeedbackTransport, HarnessPort,
	MarkerTransport, NoticeTransport, OwnerReference, ProviderAccess, SessionEndReason, SessionEvent,
	SessionFacts, SessionStartReason, SessionStartup, TurnSignalFacts, UserInputDelivery,
} from "../core/protocol";
import { StateStore } from "../core/state";
import { createOwnerAccessPublisher, openOwnerAccess } from "../modules/local-access";
import { observeRounds } from "./pi/round";
import { createPiSubagentIntegration, type PiSubagentIntegration } from "./pi/nicobailon";
import {
	type PiSessionPositions,
	piSessionFactsOf,
	piSessionFileAnchors,
	piSessionPositions,
} from "./pi/session";
import { observeTurns } from "./pi/turn";

export type { BindingResult } from "../core/protocol";
export type { ExtensionAssembly } from "../core/assembly";

// Structural native types keep the harness a loader-provided runtime dependency.
export interface PiSessionEntry {
	readonly type?: string;
	readonly customType?: string;
	readonly data?: unknown;
	readonly message?: { readonly role?: string };
}
export interface PiSessionManager {
	getSessionId(): string;
	getSessionName(): string | undefined;
	getBranch(): readonly PiSessionEntry[];
	/**
	 * The header pi writes for this session, when this surface publishes one.
	 *
	 * It is pi's own statement about the session: the identity it was created under and the session
	 * file it was built from, when it was built from one. A surface that reports none leaves a
	 * session's lineage, and so its direct parent, unavailable rather than guessed.
	 */
	getHeader?(): PiSessionHeader | null;
}
/**
 * The header pi writes for one session, as far as this adapter reads it.
 *
 * `parentSession` is the native lineage link pi states for a session it stood up from another one:
 * the *session file* the session was built from, which is where a direct parent's own identity is
 * read from. It is a file the way pi states it, never an id, and this adapter resolves the id from
 * that file's own header rather than from its name.
 */
export interface PiSessionHeader {
	readonly type?: string;
	readonly id?: string;
	readonly parentSession?: string;
}
/** One session file's own anchor: the identity and the lineage link its header states. */
export interface PiSessionAnchor {
	readonly id?: string;
	readonly parentSession?: string;
}
/**
 * pi's shared event bus: how extensions in one process speak to each other.
 *
 * The framework's pi adapter reads one versioned interface from it — the subagent provider's own
 * announcement and query pair — and publishes nothing of its own on it. A surface that publishes no
 * bus is a process in which no provider can be reached, which is answered as a provider this entry
 * does not have rather than as one that failed.
 */
export interface PiEventBus {
	on(channel: string, handler: (data: unknown) => void): () => void;
	emit(channel: string, data: unknown): void;
}
export interface PiModel {
	readonly id?: string;
	readonly provider?: string;
}
/**
 * One model as pi's own registry holds it: the identity a request is attributed to, and the cost the
 * registry states per million tokens.
 *
 * Only the members this adapter reads are named — both cost halves and the one place a base URL is
 * resolved from are pi's own facts, and the framework never sees the registry itself.
 */
export interface PiCatalogModel {
	readonly id?: string;
	readonly provider?: string;
	/** The model's address, as the registry resolved it from the provider's configuration. */
	readonly baseUrl?: string;
	/** The USD-per-million-token rates this catalog states, when it states any. */
	readonly cost?: {
		readonly input?: number;
		readonly output?: number;
		readonly cacheRead?: number;
		readonly cacheWrite?: number;
	};
}
/**
 * pi's model registry, as the one party that knows a provider's current address and credential.
 *
 * Both readings are queried per operation rather than snapshotted: a credential the host has since
 * replaced is what the next query gets, which is the same rule the framework's own provider-access
 * fact states.
 */
export interface PiModelRegistry {
	/** Every model the registry currently knows, for the catalog prices and their addresses. */
	getAll(): readonly PiCatalogModel[];
	/** The credential pi resolves for one provider, or `undefined` when it has none. */
	getApiKeyForProvider(provider: string): Promise<string | undefined>;
	/** The provider's own entry, read for the address it states. */
	getProvider(provider: string): { readonly baseUrl?: string } | undefined;
}
/** The usage one assistant message carried, as pi's own five figures. */
export interface PiMessageUsage {
	readonly input?: number;
	readonly output?: number;
	readonly cacheRead?: number;
	readonly cacheWrite?: number;
	readonly totalTokens?: number;
}
/** The finalized assistant message one `message_end` carried, as far as this adapter reads it. */
export interface PiAssistantMessage {
	readonly role?: string;
	readonly stopReason?: string;
	readonly errorMessage?: string;
	readonly responseId?: string;
	readonly usage?: PiMessageUsage;
}
/** One message fact, whichever kind of message ended. */
export interface PiMessageEndEvent {
	readonly type: "message_end";
	readonly message: PiAssistantMessage;
}
/** The request fact pi publishes before a provider call, whose payload this adapter does not read. */
export interface PiBeforeProviderRequestEvent {
	readonly type: "before_provider_request";
}
/** The response boundary pi publishes before the response body is consumed. */
export interface PiAfterProviderResponseEvent {
	readonly type: "after_provider_response";
	readonly status: number;
	readonly headers: Record<string, string>;
}
/** The fact that pi's agent loop started. */
export interface PiAgentStartEvent {
	readonly type: "agent_start";
}
/** The fact that pi's agent run fully settled, with nothing left to continue it. */
export interface PiAgentSettledEvent {
	readonly type: "agent_settled";
	/** Whether the run ended because it was aborted. */
	readonly aborted: boolean;
}
/** One submission pi admitted, published before it decided what the submission is. */
export interface PiInputEvent {
	readonly type: "input";
	/** pi's own attribution of who submitted it. */
	readonly source: "interactive" | "rpc" | "extension";
}
export interface PiWidgetOptions {
	readonly placement?: "aboveEditor" | "belowEditor";
}
export interface PiUiContext {
	notify(message: string, type?: FeedbackLevel): void;
	setWidget(key: string, content: readonly string[] | undefined, options?: PiWidgetOptions): void;
}
export interface PiExtensionContext {
	readonly sessionManager: PiSessionManager;
	readonly model?: PiModel;
	readonly thinkingLevel?: string;
	readonly hasUI: boolean;
	readonly ui: PiUiContext;
	/**
	 * pi's model registry, when this surface publishes one.
	 *
	 * Optional because the adapter names only the members its own mapping uses: a registry that is not
	 * there leaves the harness's model prices unanswered and their provider access unresolved rather
	 * than being guessed from another source.
	 */
	readonly modelRegistry?: PiModelRegistry;
	/** Whether pi itself is working or compacting right now. */
	isIdle(): boolean;
	/** Whether a submitted message is still waiting to be taken up. */
	hasPendingMessages(): boolean;
	/**
	 * The session's own current context reading, as pi reports it, or nothing when this surface
	 * publishes none.
	 *
	 * It is read by an extension's own frontend — the figure it draws beside a session's consumption —
	 * and never handed to the framework: the framework's own facts are the request, the response and
	 * the session, not the host's context accounting.
	 *
	 * `tokens` carries pi's own nullable form because pi states an *unknown* context that way — right
	 * after a compaction, before the next response establishes a reading — so a caller that draws it
	 * must treat a null as no reading rather than as a count of zero.
	 */
	getContextUsage?(): { readonly tokens?: number | null; readonly contextWindow?: number } | undefined;
}
export type PiSessionStartReason = "startup" | "reload" | "new" | "resume" | "fork";
export interface PiSessionStartEvent {
	readonly type: "session_start";
	readonly reason: PiSessionStartReason;
}
export type PiSessionShutdownReason = "quit" | "reload" | "new" | "resume" | "fork";
export interface PiSessionShutdownEvent {
	readonly type: "session_shutdown";
	readonly reason: PiSessionShutdownReason;
}
/** The fact that a session's display name changed, as pi publishes it. */
export interface PiSessionInfoChangedEvent {
	readonly type: "session_info_changed";
	/** The session's current name, absent when pi states that the name was cleared. */
	readonly name?: string;
}
export type PiSessionEventHandler<E> = (event: E, ctx: PiExtensionContext) => void;
export interface PiBeforeAgentStartEvent {
	readonly type: "before_agent_start";
	readonly messageType: "user" | "custom";
}
export interface PiInjectedPromptMessage {
	readonly customType: string;
	readonly content: string;
	readonly display: boolean;
}
export interface PiRunInitiationResult {
	readonly message: PiInjectedPromptMessage;
}
export type PiRunInitiationHandler = (
	event: PiBeforeAgentStartEvent,
	ctx: PiExtensionContext,
) => PiRunInitiationResult | undefined | void | Promise<PiRunInitiationResult | undefined | void>;
export interface PiCommandRegistration {
	readonly description?: string;
	readonly handler: (args: string, ctx: PiExtensionContext) => Promise<void>;
}
export interface PiExtensionApi {
	on(event: "session_start", handler: PiSessionEventHandler<PiSessionStartEvent>): () => void;
	on(event: "session_shutdown", handler: PiSessionEventHandler<PiSessionShutdownEvent>): () => void;
	on(event: "before_agent_start", handler: PiRunInitiationHandler): () => void;
	/**
	 * Subscribes to the native run-cycle facts the round axis is mapped from.
	 *
	 * `agent_start` is pi's agent loop beginning, whether from a fresh prompt or from a continuation
	 * pi scheduled for itself; `agent_settled` is that run fully settled, which pi publishes only once
	 * no automatic retry, compaction or queued continuation is left to run. A level below them —
	 * `agent_end` — fires before those continuations are decided and is deliberately not part of this
	 * surface.
	 */
	on(event: "agent_start", handler: PiSessionEventHandler<PiAgentStartEvent>): () => void;
	on(event: "agent_settled", handler: PiSessionEventHandler<PiAgentSettledEvent>): () => void;
	/**
	 * Subscribes to the native model-cycle facts the Turn axis is mapped from: the request about to be
	 * sent, the response boundary, and the finalized message. pi's own `turn_start`/`turn_end` are
	 * deliberately absent — its turn ends after the requested tools ran, and tool execution is outside
	 * a Turn.
	 */
	on(event: "before_provider_request", handler: PiSessionEventHandler<PiBeforeProviderRequestEvent>): () => void;
	on(event: "after_provider_response", handler: PiSessionEventHandler<PiAfterProviderResponseEvent>): () => void;
	on(event: "message_end", handler: PiSessionEventHandler<PiMessageEndEvent>): () => void;
	/**
	 * Subscribes to the native submission fact, published before pi decides what the submission is.
	 *
	 * The handler's own result decides pi's handling, so this surface's handler answers nothing: the
	 * framework observes the fact and never transforms, replaces or absorbs a submission.
	 */
	on(event: "input", handler: PiSessionEventHandler<PiInputEvent>): () => void;
	/**
	 * Subscribes to pi's own name-change fact for a session.
	 *
	 * It is not a lifecycle event — nothing about which session is current moved — so it is delivered
	 * as the session's current facts, exactly as a rename reaches consumers on a harness that
	 * publishes one. pi states that a name was cleared as a fact of its own, which is a session with
	 * no name rather than a name that did not change.
	 */
	on(event: "session_info_changed", handler: PiSessionEventHandler<PiSessionInfoChangedEvent>): () => void;
	registerCommand(name: string, options: PiCommandRegistration): void;
	appendEntry(customType: string, data?: unknown): void;
	/**
	 * pi's own shared event bus, when this surface publishes one.
	 *
	 * Optional because this adapter names only the members it reads: a surface without a bus is a
	 * process in which the subagent provider's versioned interface cannot be reached at all.
	 */
	readonly events?: PiEventBus;
}
export type PiExtensionFactory = (pi: PiExtensionApi) => BindingResult;

const START_REASON: Record<PiSessionStartReason, SessionStartReason> = {
	startup: "initial", reload: "initial", new: "new", resume: "resume", fork: "fork",
};
const END_REASON: Record<PiSessionShutdownReason, SessionEndReason> = {
	quit: "disposed", reload: "disposed", new: "transferred", resume: "transferred", fork: "transferred",
};

function publishNotice(ctx: PiExtensionContext, level: FeedbackLevel, message: string): void {
	if (ctx.hasUI) ctx.ui.notify(message, level);
	else process.stderr.write(`${message}\n`);
}

/**
 * The currency and unit pi states its own model costs in.
 *
 * pi's catalog carries the amounts alone, in US dollars per million tokens: the same unit its own
 * usage readout prints them in, which is the unit the framework's catalog price carries opaquely.
 */
const HARNESS_PRICE_CURRENCY = "USD";
const HARNESS_PRICE_UNIT = "USD/百万 token";

/** The buckets pi states a model's cost in, in the framework's own bucket vocabulary. */
const HARNESS_COST_BUCKETS = ["input", "cacheRead", "cacheWrite", "output"] as const;

/**
 * The price pi's own catalog states for one provider and exact model id.
 *
 * The mapping is the identity between two statements of the same fact — pi's cost per million tokens
 * in its four buckets, and the framework's own catalog price — plus the unit that catalog reads in.
 * A pair the catalog does not carry answers nothing, and so does a model every one of whose stated
 * amounts is zero: an amount the catalog never stated is not a price of zero, and carrying one would
 * look like a real, free request.
 */
function harnessPriceOf(
	catalog: PiModelRegistry | undefined,
	provider: string,
	model: string,
): CatalogPrice | undefined {
	const entry = catalog?.getAll().find(row => row.id === model && row.provider === provider);
	const cost = entry?.cost;
	if (cost === undefined) return undefined;
	const amounts: Record<string, number> = {};
	for (const bucket of HARNESS_COST_BUCKETS) {
		const amount = cost[bucket];
		if (typeof amount === "number" && Number.isFinite(amount)) amounts[bucket] = amount;
	}
	if (Object.values(amounts).every(amount => amount === 0)) return undefined;
	return { currency: HARNESS_PRICE_CURRENCY, unit: HARNESS_PRICE_UNIT, amounts };
}

/** pi's own model prices, and the live registry reading they are answered from. */
interface HarnessModelPrices {
	/** The query the framework hands the implementation factory and snapshots at a request's start. */
	readonly prices: CatalogPriceSource;
	/** Records the model registry of the context one delivery came from. */
	saw(ctx: PiExtensionContext): void;
}

/**
 * pi's own model prices, read through the session contexts this process's bindings see.
 *
 * The registry is a fact of the process, but the only reading pi offers is the member a live session
 * context carries, so this keeps the registry of the newest context a delivery came from and answers
 * every later question from it: the framework snapshots the answer at a request's real start, and the
 * extension's own frontend asks again when it draws. A price asked for before any context was
 * reported answers nothing rather than a guess, and what leaves this module is that plain query —
 * never a native model or registry.
 */
function harnessModelPrices(): HarnessModelPrices {
	let newest: PiModelRegistry | undefined;
	return {
		prices: { priceOf: (provider, model) => harnessPriceOf(newest, provider, model) },
		saw: ctx => {
			if (ctx.modelRegistry !== undefined) newest = ctx.modelRegistry;
		},
	};
}

/** pi's own provider access, and the live registry reading it is answered from. */
interface HarnessProviderAccess {
	/** The query the framework hands the implementation factory and asks once per operation. */
	readonly access: ProviderAccess;
	/** Records the model registry of the context one delivery came from. */
	saw(ctx: PiExtensionContext): void;
}

/**
 * pi's own provider access, read through the session contexts this process's bindings see.
 *
 * The credential and the provider's address are facts of the host, and the reading pi offers is the
 * registry a live session context carries, so this keeps the registry of the newest context a
 * delivery came from and asks *it* at each later operation: a credential the host has since replaced,
 * or minted on demand, is what the extension gets, because nothing here is snapshot at binding time.
 * What crosses into the framework is the plain two-member query and never the registry.
 *
 * The address is read from the provider's own entry or, when that entry states none, from the first
 * of its models — both are the registry's own statements — while the credential is awaited, because
 * pi resolves and refreshes it as the call needs it. A registry that answers neither member leaves
 * the facts absent: the extension is told the host has no access to that provider rather than being
 * handed a guess or another provider's credential.
 */
function harnessProviderAccess(): HarnessProviderAccess {
	let newest: PiModelRegistry | undefined;
	return {
		access: {
			resolve: async provider => {
				if (newest === undefined) return undefined;
				const baseUrl = newest.getProvider(provider)?.baseUrl
					?? newest.getAll().find(row => row.provider === provider)?.baseUrl;
				const credential = await newest.getApiKeyForProvider(provider);
				if (baseUrl === undefined && credential === undefined) return undefined;
				return {
					...(baseUrl === undefined ? {} : { baseUrl }),
					...(credential === undefined ? {} : { credential }),
				};
			},
		},
		saw: ctx => {
			if (ctx.modelRegistry !== undefined) newest = ctx.modelRegistry;
		},
	};
}

function piPort(
	pi: PiExtensionApi,
	definition: ExtensionDefinition,
	harnessPrices: HarnessModelPrices,
	harnessAccess: HarnessProviderAccess,
	positions: PiSessionPositions,
	integration: PiSubagentIntegration | undefined,
	keepSubscription: (release: () => void) => void,
): HarnessPort {
	const stateEntryType = `${definition.id}:state`;
	let activeOwner: { key: string; session: SessionFacts } | undefined;
	let servingSessionId: string | undefined;
	let reportedOwnerless = false;
	let label = definition.displayName;
	const reportDiagnostic = (message: string): void => { process.stderr.write(`${label}: ${message}\n`); };
	const sessionFactsOf = (ctx: PiExtensionContext, reason?: SessionStartReason): SessionFacts =>
		piSessionFactsOf(positions.positionOf(ctx, reason), ctx, reason);
	/**
	 * One session's position reported as the owner a delivery carries.
	 *
	 * A session that resolves no owner is named once per binding on the diagnostic channel: the
	 * extension cannot key anything to an identity this host does not state, and it is told that
	 * rather than being keyed to a label that only looks like one.
	 */
	const resolvedOwner = (owner: OwnerReference): OwnerReference => {
		if (owner.kind === "unresolved" && !reportedOwnerless) {
			reportedOwnerless = true;
			reportDiagnostic("this session reports no identity; the extension stays off for it");
		}
		return owner;
	};
	const resolveOwner = (ctx: PiExtensionContext): OwnerReference => resolvedOwner(positions.positionOf(ctx).owner);
	/**
	 * Records what one delivery's own context says about the host, and hands that context back.
	 *
	 * The model registry is readable only through a live context, while the prices and provider
	 * accesses asked of it happen later and from outside every delivery: the framework snapshots a
	 * price at a request's real start, and an extension's provider query reads the moment's
	 * credential. The newest context is therefore what answers, and this is where each delivery
	 * reports its own.
	 */
	const catalogued = (ctx: PiExtensionContext): PiExtensionContext => {
		harnessPrices.saw(ctx);
		harnessAccess.saw(ctx);
		return ctx;
	};
	const markers = (ctx: PiExtensionContext): MarkerTransport => ({
		publishMarkers: lines => {
			if (ctx.hasUI) ctx.ui.setWidget("semantic-extensions", lines.length ? [...lines] : undefined, { placement: "aboveEditor" });
		},
	});
	const notices = (ctx: PiExtensionContext): NoticeTransport => ({ warn: message => publishNotice(ctx, "warning", message) });
	const feedback = (ctx: PiExtensionContext): FeedbackTransport => ({ notify: (level, message) => publishNotice(ctx, level, message) });
	const persist = (values: Parameters<PiExtensionApi["appendEntry"]>[1]): void => pi.appendEntry(stateEntryType, values);

	// At most one report per native fact, per binding: the first delivery that finds a fact this
	// mapping does not read says so on the non-model channel, and every later one stays quiet.
	const reportedMissingFacts = new Set<string>();
	const reportMissingFact = (fact: string): undefined => {
		if (!reportedMissingFacts.has(fact)) {
			reportedMissingFacts.add(fact);
			reportDiagnostic(
				`this harness reports no ${fact}; the framework answers nothing rather than inventing one`,
			);
		}
		return undefined;
	};
	/**
	 * Reports one statement about background work this entry could not read, once per reason.
	 *
	 * It is a report rather than an answer: a Round whose rest condition depends on a statement that
	 * never arrived stays open, and an operator reading a session that will not close is told why
	 * instead of being left to infer it from silence.
	 */
	const reportUnread = (reason: string): void => {
		if (reportedMissingFacts.has(reason)) return;
		reportedMissingFacts.add(reason);
		reportDiagnostic(`this session's background work cannot be read: ${reason}`);
	};

	return {
		// pi.setLabel labels a history ENTRY, not an extension. Keep this label on
		// diagnostics instead of misusing that unrelated native operation.
		setLabel: value => { label = value; },
		reportDiagnostic,
		modelPrices: harnessPrices.prices,
		providerAccess: harnessAccess.access,
		// The process's one settling of this entry's subagent integration, asked at the owner node:
		// it is the session this binding serves then, and the answer is that process's own.
		...(integration === undefined
			? {}
			: { subagentIntegration: () => integration.settle(servingSessionId) }),
		onSession: handler => {
			const deliver = (event: SessionEvent, owner: OwnerReference, ctx: PiExtensionContext, session: SessionFacts): void => {
				catalogued(ctx);
				handler({
					event, session, owner,
					statePayloads: ctx.sessionManager.getBranch()
						.filter(entry => entry.type === "custom" && entry.customType === stateEntryType)
						.map(entry => entry.data),
					persist, hasUI: ctx.hasUI, feedback: feedback(ctx), notices: notices(ctx), markers: markers(ctx),
				});
			};
			keepSubscription(pi.on("session_start", (event, ctx) => {
				const reason = START_REASON[event.reason];
				// The one decision this delivery makes: the start is what says whether the session was
				// spawned, and the facts and the owner below are both read from that decision rather
				// than from a second reading of the session's lineage link.
				const position = positions.positionOf(ctx, reason);
				const owner = resolvedOwner(position.owner);
				const session = piSessionFactsOf(position, ctx, reason);
				// The session this binding now serves requires this entry in the sessions it spawns,
				// whether it is a top-level session or one that was itself spawned: a child's own
				// children are spawned by the provider exactly as the root's are, and each session's
				// requirement is released when that session's own life ends.
				if (owner.kind !== "owner") {
					// A session that is not its own owner has no life of its own to pair: it is
					// delivered with the owner it resolved and takes no part in the transfer below.
					integration?.requireIn(session.sessionId);
					deliver({ kind: "session_start", reason }, owner, ctx, session);
					return;
				}
				// A native start that leaves the owner this binding already serves alone is not a
				// transition at all, which is what makes a reload or a same-file resume silent here.
				if (owner.key === activeOwner?.key) return;

				const ended = activeOwner;
				integration?.requireIn(session.sessionId);
				servingSessionId = session.sessionId;
				activeOwner = { key: owner.key, session };
				if (ended !== undefined) {
					integration?.releaseSession(ended.session.sessionId);
					deliver({ kind: "session_end", reason: "transferred" }, { kind: "owner", key: ended.key }, ctx, ended.session);
				}
				deliver({ kind: "session_start", reason }, owner, ctx, session);
			}));
			keepSubscription(pi.on("session_shutdown", (event, ctx) => {
				const session = sessionFactsOf(ctx);
				// Whatever this binding required for the session that is going away is released with
				// it, so a later session of this process states its own requirement rather than
				// inheriting a spent one.
				integration?.releaseSession(session.sessionId);
				// Only the owner session this binding serves ends here, by its own identity: a sub
				// session this process ran is not the owner the extension serves, and its end is not
				// the owner's end.
				const ended = activeOwner;
				if (ended === undefined || ended.session.sessionId !== session.sessionId) return;
				activeOwner = undefined;
				servingSessionId = undefined;
				deliver({ kind: "session_end", reason: END_REASON[event.reason] }, { kind: "owner", key: ended.key }, ctx, session);
			}));
			// pi's own name-change fact: the session's current facts as they now stand, delivered
			// where the rename happened rather than at the renamed session's next boundary.
			keepSubscription(pi.on("session_info_changed", (_event, ctx) => {
				deliver({ kind: "session_facts" }, resolveOwner(catalogued(ctx)), ctx, sessionFactsOf(ctx));
			}));
		},
		nextTask: callback => {
			// The harness's next task: a macrotask that runs after this callback returned and after
			// everything already queued — pi's own unwinding and any message it drained — has had its
			// turn. Nothing here waits on a duration or repeats.
			setTimeout(callback, 0);
		},
		onRound: observer => {
			observeRounds(pi, observer, {
				frame: ctx => ({
					session: sessionFactsOf(catalogued(ctx)),
					owner: resolveOwner(ctx),
					hasUI: ctx.hasUI,
					feedback: feedback(ctx),
				}),
				reportMissingFact,
				reportUnread: reportUnread,
				// This process's subagent provider, as the assembly's own integration reads it: while a
				// session is waiting on a delegation the provider still holds, the session is not at rest,
				// and a statement this entry cannot read stays unread rather than being answered as rest.
				background: sessionId => integration?.backgroundActivity(sessionId) ?? { state: "clear" },
				track: keepSubscription,
			});
		},
		onTurn: handler => {
			observeTurns(pi, handler, {
				frame: ctx => ({
					owner: resolveOwner(catalogued(ctx)),
					hasUI: ctx.hasUI,
					feedback: feedback(ctx),
				}),
				session: ctx => sessionFactsOf(ctx),
				reportMissingFact,
				track: keepSubscription,
			});
		},
		onUserInput: handler => {
			// The adapter's whole job on this axis: read the one fact pi states about who submitted the
			// input, and report the submission as the user's when it is the user's. A submission an
			// extension made on its own behalf is deliberately not one — pi distinguishes the two, and
			// reading that distinction is what keeps an agent's own input from being reported as the user's.
			keepSubscription(pi.on("input", (event, ctx) => {
				if (event.source === "extension") return;
				const delivery: UserInputDelivery = {
					event: { kind: "user_input" },
					owner: resolveOwner(catalogued(ctx)),
					session: sessionFactsOf(ctx),
					hasUI: ctx.hasUI,
					feedback: feedback(ctx),
				};
				handler(delivery);
			}));
		},
		onRunInitiation: handler => {
			keepSubscription(pi.on("before_agent_start", async (_event, ctx) => {
				const planned = await handler({
					owner: resolveOwner(ctx),
					contributionIdentities: ctx.sessionManager.getBranch()
						.flatMap(entry => entry.type === "custom_message" && typeof entry.customType === "string" ? [entry.customType] : []),
					markers: markers(ctx),
				});
				// pi appends and persists this message after the user's input. Its
				// custom-message path supplies the native role; no system override.
				return planned === undefined ? undefined : {
					message: { customType: planned.identity, content: planned.content, display: planned.display },
				};
			}));
		},
		registerCommand: command => {
			pi.registerCommand(command.name, {
				description: command.description,
				handler: async (args, ctx) => {
					await command.run({
						args, owner: resolveOwner(ctx), persist, hasUI: ctx.hasUI,
						// The idle fact this command's own session reports, answered as nothing when this
						// surface reports none at all: an unreported activity state is not idleness, and the
						// framework reports the absence rather than answering for the harness. The command
						// that reads it — model-cost's period actions — refuses on that answer instead of
						// reading it as permission.
						canAcceptInput: () =>
							typeof ctx.isIdle === "function" ? ctx.isIdle() : reportMissingFact("idle fact (isIdle)"),
						provider: ctx.model?.provider,
						feedback: feedback(ctx), markers: markers(ctx),
					});
				},
			});
		},
	};
}

/**
 * What a pi assembly states about itself beyond the generic assembly information.
 *
 * `childEntry` is the module pi's loader loads for this extension — the file the extension's own
 * discovery entrypoint re-exports. A harness that spawns child sessions loads extensions into them
 * by path, so requiring this entry in those sessions is what makes a spawned session's own facts
 * reach consumers; an assembly that states no entry declares no child observation to require, which
 * is the same shape as a host that runs no subagent provider. It also states that this host can run
 * a session of this extension outside this process, which is what the framework's local access is
 * for; see `piAdapter`.
 */
export interface PiAssembly extends ExtensionAssembly {
	readonly childEntry?: string;
}

/** Uses the same binding and assembly contract as the OMP adapter. */
export function piAdapter(definition: ExtensionDefinition, options: PiAssembly = {}): PiExtensionFactory {
	// The two halves of the framework's local access are built together, because they are one thing:
	// the owners this process serves are readable from a session pi ran elsewhere, and a session pi
	// ran elsewhere reads the owner it follows from whichever process serves it. Two conditions have
	// to hold for either to happen — this assembly states an entry (so this host spawns sessions at
	// all; a host whose sessions are all bindings here states none) and the extension declares
	// `follow` (so a subagent reads its owner's value rather than the declared default). Built here
	// for the process, because the endpoint is the process's; building either does nothing, and the
	// first session that needs one is what offers or reaches it.
	const spawning = options.childEntry !== undefined && stateInheritance(definition) === "follow";
	const localAccess = spawning
		? createOwnerAccessPublisher({
				report: message => process.stderr.write(`${definition.displayName}: ${message}\n`),
			})
		: undefined;
	// The reading half is the seat this extension serves in the owner the delivery named: the same
	// extension id on both ends is what makes the pair a target, and the owner key the adapter
	// resolved is what makes it this owner's access rather than another's.
	const follow: FollowedAccessReader | undefined = spawning
		? {
				open: (owner, { waitMs }) => openOwnerAccess({ target: { extension: definition.id, owner }, waitMs }),
			}
		: undefined;
	const state = new StateStore({
		field: activationField(definition),
		persistence: statePersistence(definition),
		...(localAccess === undefined ? {} : { localAccess: { extension: definition.id, publisher: localAccess } }),
		...(follow === undefined ? {} : { follow }),
	});
	// pi's own model prices, one set for the whole process: every binding of this assembly records the
	// registry of the contexts its own deliveries come from, and the query the framework hands an
	// extension's factory answers from the newest of them. It lives here rather than in a port because
	// a port is one binding, while the catalog it reads is the process's — the same reason the OMP
	// adapter keeps its own catalog outside the port.
	const harnessPrices = harnessModelPrices();
	// pi's own access to the providers it serves, one query for the whole process for the same reason:
	// the credentials and addresses are the host's, and every binding's deliveries report the registry
	// they were read from.
	const harnessAccess = harnessProviderAccess();
	// The sessions this process's deliveries are read through: pi's own lineage links and the session
	// files they name are facts of the process, and a chain walked for one session is the same chain
	// another session of this process would walk.
	const positions = piSessionPositions(piSessionFileAnchors());
	// The subagent-provider integration of this process, created once for the same reason and attached
	// at the first binding: what it holds is the process's requirements and the provider's own
	// announcement, while what each binding releases is the requirement of the sessions it served.
	const integration = options.childEntry === undefined
		? undefined
		: createPiSubagentIntegration(definition.id, options.childEntry);
	let implementation: ExtensionImplementation | undefined;
	const resolveImplementation = (context: ImplementationContext): ExtensionImplementation => {
		if (implementation === undefined || isImplementationDisposed(implementation)) {
			implementation = options.factory === undefined ? {} : options.factory(context);
		}
		return implementation;
	};
	return pi => {
		const subscriptions: Array<() => void> = [];
		// The end of this process's own session run releases what this extension's reads keep open: a
		// followed access is this process's connection to the process serving that owner, and the
		// session that made these reads is gone. A reload is the same ending — the entry is loaded
		// again and builds its own store — so both are released here rather than left to the
		// process's exit. A session switch (`new`, `resume`, `fork`) is not: the process keeps
		// running and the owner a delivery names next is read through its own access.
		subscriptions.push(pi.on("session_shutdown", event => {
			if (event.reason === "quit" || event.reason === "reload") state.dispose();
		}));
		const port = piPort(pi, definition, harnessPrices, harnessAccess, positions, integration,
			release => subscriptions.push(release));
		integration?.attach(pi, port.reportDiagnostic);
		const result = bindExtension(definition, port, state, resolveImplementation, { baseDir: options.configBaseDir });
		if (!result.bound) {
			for (const release of subscriptions) release();
			integration?.releaseAll();
		}
		return result;
	};
}
