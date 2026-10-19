/**
 * The Turn axis: one observable model request/response cycle, its recorded request facts, and the
 * readings its response reported.
 *
 * A `turn_start` is delivered when the harness really begins a model request; a `turn_end` when that
 * same cycle's response settled. Tool execution is outside the Turn: the harness's own `turn_end`
 * event, which fires after the requested tools ran, is not this edge.
 */
import type { FeedbackTransport } from "../../feedback";
import type { CatalogPrice, ProviderHttpFacts } from "../../host-facts";
import type { OwnerReference } from "../../state";
import type { SessionFacts } from "./facts";

/**
 * One semantic Turn event: the two edges of a Turn.
 *
 * The two edges share one identity. The framework mints it — an opaque value, never a provider-issued
 * request or response id — and carries it on both edges, so a consumer never has to reconstruct
 * which end belongs to which start.
 */
export type TurnEvent = { readonly kind: "turn_start" } | { readonly kind: "turn_end" };

/**
 * One Turn's reported model usage, as its response carried it.
 *
 * The four buckets are the ones a provider reports and the harness exposes; an absent report is not
 * this value with zeros in it (see the Turn's `unavailable`). A source that cannot tell its own
 * default from a reported zero reports no reading at all, so a zero carried here is the zero its own
 * source reported.
 */
export interface TurnUsage {
	/** Non-cached conversation input tokens. */
	readonly input: number;
	/** Conversation output tokens, thinking and tool-call arguments included. */
	readonly output: number;
	/** Conversation tokens read from the prompt cache. */
	readonly cacheRead: number;
	/** Conversation tokens written to the prompt cache. */
	readonly cacheWrite: number;
	/** The reported total, as the harness reported it. */
	readonly totalTokens: number;
}

/** How one Turn's request/response cycle ended. */
export type TurnOutcome = "completed" | "failed" | "cancelled";

/**
 * The facts one Turn fixed when its request really began, delivered on both of its edges.
 *
 * `startedAt` is the request's own start on the process's clock, and the model, the provider and the
 * price are the ones holding at that moment: a later change of the session's model does not re-price
 * or re-attribute the Turn, which is why the end delivery carries this same record rather than a
 * fresh one.
 */
export interface TurnStartFacts {
	/** The framework's opaque identity for this Turn; never a provider-issued id. */
	readonly turnId: string;
	/** The actual session that issued the request, as the adapter resolved it. */
	readonly session: SessionFacts;
	/**
	 * The Round this Turn belongs to, as the framework minted it.
	 *
	 * Absent when no round is open for that session — a signal gap the delivery names in
	 * `unavailable` rather than filling with a guessed identity.
	 */
	readonly roundId?: string;
	/** When the request really started, on the process's own clock. */
	readonly startedAt: number;
	readonly provider: string;
	readonly model: string;
	/** The catalog price holding at the request's start, when the extension's catalog carried one. */
	readonly price?: CatalogPrice;
	/** Every fact above that could not be obtained, named as the delivery names it. */
	readonly unavailable: readonly string[];
}

/**
 * The facts one Turn delivered when its response settled.
 *
 * `usage` is absent when no reliable reading existed: an unreported usage and a set of final
 * readings whose valid source could not be determined are unavailable rather than zero, which
 * `unavailable` names. Nothing here is a post-hoc correction: a Turn is delivered once, and a later
 * reading never re-opens or rewrites it.
 */
export interface TurnEndFacts {
	/** When the response settled, on the process's own clock. */
	readonly endedAt: number;
	readonly outcome: TurnOutcome;
	/** The reliable usage this Turn's response reported, when one existed. */
	readonly usage?: TurnUsage;
	/** The HTTP facts of this Turn's provider response, when the adapter could obtain them. */
	readonly http?: ProviderHttpFacts;
	/** The transport-level request id the response exposed, when it exposed one. */
	readonly providerRequestId?: string;
	/** The provider-issued response id the assistant message carried, when it carried one. */
	readonly providerResponseId?: string;
	/** Every fact above that could not be obtained, named as the delivery names it. */
	readonly unavailable: readonly string[];
}

/**
 * The facts one Turn's start edge carries, both to the adapter's hook and to subscribed handlers.
 *
 * A start delivery carries the recorded request facts and the two seams every subscriber delivery
 * carries — the faithful `hasUI` fact and the unified extension feedback channel — and no write
 * path: a per-session observation grants no owner-scoped authority.
 */
export interface TurnStartDelivery {
	readonly event: { readonly kind: "turn_start" };
	/** The owner whose session issued the request, as the adapter resolved it. */
	readonly owner: OwnerReference;
	readonly turn: TurnStartFacts;
	readonly hasUI: boolean;
	readonly feedback: FeedbackTransport;
}

/**
 * The facts one Turn's end edge carries.
 *
 * It repeats the Turn's start facts, so a consumer correlates the two edges by the delivery itself
 * rather than by keeping its own in-flight record: the same `turnId`, the same session, the same
 * round and the same request-price anchor.
 */
export interface TurnEndDelivery {
	readonly event: { readonly kind: "turn_end" };
	readonly owner: OwnerReference;
	readonly turn: TurnStartFacts;
	readonly end: TurnEndFacts;
	readonly hasUI: boolean;
	readonly feedback: FeedbackTransport;
}

/** One extension handler for one semantic Turn edge. */
export type TurnEventHandler = (delivery: TurnStartDelivery | TurnEndDelivery) => void | Promise<void>;

/** The Turn handlers one assembly injects, keyed by the edge each subscribes to. */
export type TurnEventHandlers = Readonly<Partial<Record<TurnEvent["kind"], TurnEventHandler>>>;
