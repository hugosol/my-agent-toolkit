/**
 * The Turn axis: the framework's own Turn identity, in-flight association, normal deduplication
 * and conflict rules, and the dispatch of the two edges to the groups whose scope admits them.
 *
 * A Turn is one observable model request/response cycle. The adapter maps the harness's native
 * facts into signals — a request really began, a response boundary arrived, its usage changed while
 * streaming, the cycle settled — and nothing more: it mints no identity and matches no fact to
 * another, so every rule that decides which Turn a fact belongs to, which reading is the final
 * usage, and what an unreliable fact means lives here.
 *
 * The rules, in the order they apply:
 *
 * - **Identity is the framework's.** A request start mints an opaque identity, never a provider's
 *   request or response id: those two are reference facts, are not assumed equal, and are never
 *   used to associate anything. The identity is per binding — never reused across an observation
 *   instance or a reload — and both edges carry it, so a consumer correlates them from the delivery
 *   rather than from its own in-flight record.
 * - **One Turn is in flight per actual session.** A fact naming a session with no Turn in flight
 *   cannot be reliably associated with anything, so it is dropped and reported once per fact kind on
 *   the adapter's diagnostic channel: no start is fabricated for it, and no other session's, model's
 *   or arrival order's Turn is borrowed for it.
 * - **A start that arrives while a Turn is already in flight is a conflict.** The two cycles' facts
 *   cannot be told apart, so the older in-flight record is dropped rather than completed with the
 *   newer cycle's response.
 * - **Usage is reliable or unavailable, never zero by default.** A reading observed while the
 *   response was still streaming is not a final reading: it is never delivered as the usage and it
 *   never makes a conflict — it is kept as evidence, so an all-zero settle that follows a non-zero
 *   streamed reading is reported as the host default it must have been. A settle that reported no
 *   reading, or readings which disagree and leave no determinable valid source, is delivered as an
 *   unavailable usage with that reason. An all-zero reading nothing contradicts is the reading its
 *   source reported: the adapter reports a reading only where its own native facts establish one, so
 *   a host that cannot tell its own default from a reported zero reports none, and the source's
 *   answer — including a zero it did report — is never overruled here.
 * - **A Turn is delivered once.** After its end edge is delivered its detail is released and only its
 *   identity is kept, so a repeated settle carrying the same reading is normally deduplicated and
 *   delivers nothing, and one carrying a different reading is reported as a conflict and dropped
 *   too — no post-end correction exists and the framework never rewrites what it delivered.
 *
 * The framework's own behavior runs before any handler: the identity, the owning round and the
 * request-time price anchor are fixed before a `turn_start` handler sees the delivery, and the
 * outcome, the usage and the HTTP facts are resolved before a `turn_end` handler does.
 *
 * This module is harness-independent: it names no native API, reads and writes no State, and obtains
 * the request-time price through the extension's own catalog query rather than by knowing anything
 * about pricing.
 */
import type { ExtensionDefinition } from "../interface/details/definition";
import type { FeedbackTransport } from "../interface/feedback";
import type { CatalogPriceSource, ProviderHttpFacts } from "../interface/provider";
import type {
	SessionFacts,
	SubscriptionGroup,
	TurnEndDelivery,
	TurnEndFacts,
	TurnStartDelivery,
	TurnStartFacts,
	TurnUsage,
} from "../interface/session";
import type { OwnerReference } from "../interface/state";
import type { TurnSignal, TurnSignalFacts } from "../runtime/port";
import { dispatchToGroups } from "./subscriptions";
import type { RoundLives } from "./round-events";

/** The signal one model request really beginning carries. */
type RequestStarted = Extract<TurnSignal, { readonly kind: "request_started" }>;

/** The signal one settled response carries. */
type ResponseSettled = Extract<TurnSignal, { readonly kind: "response_settled" }>;

/** One Turn that has begun and not yet settled, as the framework holds it. */
interface InFlightTurn {
	readonly start: TurnStartFacts;
	readonly owner: OwnerReference;
	readonly hasUI: boolean;
	readonly feedback: FeedbackTransport;
	http?: ProviderHttpFacts;
	/** The latest reading observed while the response streamed; never a final reading. */
	streamed?: TurnUsage;
}

/** One delivered Turn, kept by identity so a repeated fact is recognised as the same one. */
interface DeliveredTurn {
	readonly usage?: TurnUsage;
}

/** The Turn bookkeeping of one binding, and the driver a harness adapter feeds its mapped signals to. */
export interface TurnLives {
	/** Applies one mapped native fact, delivering whichever edge it decides. */
	observe(facts: TurnSignalFacts): void;
}

/** Two readings report the same usage. */
function sameUsage(left: TurnUsage | undefined, right: TurnUsage | undefined): boolean {
	if (left === undefined || right === undefined) return left === right;
	return (
		left.input === right.input &&
		left.output === right.output &&
		left.cacheRead === right.cacheRead &&
		left.cacheWrite === right.cacheWrite &&
		left.totalTokens === right.totalTokens
	);
}

const ZERO: TurnUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 };

/**
 * Resolves the final usage one settle reported, as a fact or as a named unavailability.
 *
 * A reading is what its own source established: the adapter reports one only where its native facts
 * support it, so the value it carries — an all-zero one included — is delivered as reported rather
 * than judged here. The two ways a settle fails to establish a usage stay apart on purpose: a
 * harness that reported nothing at all, and a set of final readings whose valid source cannot be
 * determined. Neither is a usage of zero. The remaining way an all-zero reading can fail is decided
 * at the call site, where the streamed evidence of the same Turn is known.
 */
function finalUsageOf(readings: readonly TurnUsage[]): { readonly usage?: TurnUsage; readonly unavailable?: string } {
	if (readings.length === 0) return { unavailable: "usage (not reported)" };
	const first = readings[0];
	if (readings.some(reading => !sameUsage(reading, first))) {
		return { unavailable: "usage (conflicting final readings)" };
	}
	return { usage: first };
}

/**
 * The Turn bookkeeping of one binding.
 *
 * `rounds` is the same binding's round bookkeeping: the round a Turn belongs to is the one open for
 * that session when its request started, so a Turn that began inside a round keeps that identity
 * even after the round's own end edge was delivered.
 */
export function turnLives(
	definition: ExtensionDefinition,
	rounds: RoundLives,
	catalog: CatalogPriceSource | undefined,
	groups: readonly SubscriptionGroup[],
	reportFailure: (message: string) => void,
): TurnLives {
	// One in-flight Turn per actual session, and what the last one delivered there reported.
	const inFlight = new Map<string, InFlightTurn>();
	const delivered = new Map<string, DeliveredTurn>();
	// At most one report per kind of unreliable fact, per binding: the first fact that cannot be
	// associated says so on the non-model channel, and every later one of the same kind stays quiet.
	const reported = new Set<string>();
	const report = (once: string, message: string): void => {
		if (reported.has(once)) return;
		reported.add(once);
		reportFailure(`${definition.id}: ${message}`);
	};
	let minted = 0;

	const startOf = (request: RequestStarted, session: SessionFacts): TurnStartFacts => {
		const roundId = rounds.current(session.sessionId);
		const price = catalog?.priceOf(request.provider, request.model);
		const unavailable: string[] = [];
		if (roundId === undefined) unavailable.push("round");
		if (price === undefined) unavailable.push("catalog price");
		return {
			turnId: `${session.sessionId}#t${++minted}`,
			session,
			...(roundId === undefined ? {} : { roundId }),
			startedAt: request.at,
			provider: request.provider,
			model: request.model,
			...(price === undefined ? {} : { price }),
			unavailable,
		};
	};

	const startDelivery = (entry: InFlightTurn): TurnStartDelivery => ({
		event: { kind: "turn_start" },
		owner: entry.owner,
		turn: entry.start,
		hasUI: entry.hasUI,
		feedback: entry.feedback,
	});

	const settle = (entry: InFlightTurn, facts: TurnSignalFacts, settleSignal: ResponseSettled): void => {
		const resolved = finalUsageOf(settleSignal.readings);
		const unavailable: string[] = [];
		// The streamed evidence of this very Turn is what contradicts an all-zero reading: a response
		// whose body already reported non-zero usage cannot have consumed none, so that reading is the
		// host's default rather than a report. A zero nothing contradicts is the zero its source
		// reported, and is delivered as it is.
		const contradicted =
			resolved.usage !== undefined &&
			sameUsage(resolved.usage, ZERO) &&
			entry.streamed !== undefined &&
			!sameUsage(entry.streamed, ZERO);
		const usage = contradicted ? undefined : resolved.usage;
		if (contradicted) {
			unavailable.push("usage (all-zero reading after non-zero streamed usage)");
		} else if (resolved.unavailable !== undefined) {
			unavailable.push(resolved.unavailable);
		}
		if (entry.http === undefined) unavailable.push("HTTP response facts");
		const end: TurnEndFacts = {
			endedAt: settleSignal.at,
			outcome: settleSignal.outcome,
			...(usage === undefined ? {} : { usage }),
			...(entry.http === undefined ? {} : { http: entry.http }),
			...(entry.http?.requestId === undefined ? {} : { providerRequestId: entry.http.requestId }),
			...(settleSignal.responseId === undefined ? {} : { providerResponseId: settleSignal.responseId }),
			unavailable,
		};
		const value: TurnEndDelivery = {
			event: { kind: "turn_end" },
			owner: entry.owner,
			turn: entry.start,
			end,
			hasUI: entry.hasUI,
			// The end edge speaks through the channel of the context that reported it, which is the
			// same session's; the Turn's own recorded facts stay the ones its start fixed.
			feedback: facts.feedback,
		};
		dispatchToGroups(definition.id, groups, "turn_end", entry.owner, () => ({ delivery: value }), reportFailure);
		delivered.set(entry.start.session.sessionId, { usage });
	};

	return {
		observe: facts => {
			const signal = facts.signal;
			const sessionId = signal.session.sessionId;
			switch (signal.kind) {
				case "request_started": {
					if (inFlight.has(sessionId)) {
						inFlight.delete(sessionId);
						report(
							"start-in-flight",
							"a model request started while a Turn was still in flight; the earlier Turn is dropped",
						);
					}
					const entry: InFlightTurn = {
						start: startOf(signal, signal.session),
						owner: facts.owner,
						hasUI: facts.hasUI,
						feedback: facts.feedback,
					};
					inFlight.set(sessionId, entry);
					dispatchToGroups(
						definition.id,
						groups,
						"turn_start",
						facts.owner,
						() => ({ delivery: startDelivery(entry) }),
						reportFailure,
					);
					return;
				}
				case "response_received": {
					const entry = inFlight.get(sessionId);
					if (entry === undefined) {
						report(
							"unassociated-response",
							"a provider response arrived with no Turn in flight for its session; it is dropped",
						);
						return;
					}
					if (entry.http !== undefined) {
						report("two-boundaries", "a second provider response boundary arrived for one Turn; the first is kept");
						return;
					}
					entry.http = signal.http;
					return;
				}
				case "usage_streamed": {
					const entry = inFlight.get(sessionId);
					if (entry === undefined) {
						report(
							"unassociated-streamed-usage",
							"a streamed usage reading arrived with no Turn in flight for its session; it is dropped",
						);
						return;
					}
					entry.streamed = signal.usage;
					return;
				}
				case "response_settled": {
					const entry = inFlight.get(sessionId);
					if (entry !== undefined) {
						inFlight.delete(sessionId);
						settle(entry, facts, signal);
						return;
					}
					const previous = delivered.get(sessionId);
					const resolved = finalUsageOf(signal.readings);
					if (previous !== undefined && sameUsage(previous.usage, resolved.usage)) {
						// The same fact again: a settle already delivered is normal deduplication.
						return;
					}
					if (previous !== undefined && resolved.unavailable === undefined) {
						report(
							"usage-conflict",
							"a later settle reported different usage for an ended Turn; the delivered reading stands and this one is dropped",
						);
						return;
					}
					report(
						"unassociated-settle",
						"a model response settled with no Turn in flight for its session; no start is fabricated and it is dropped",
					);
					return;
				}
			}
		},
	};
}
