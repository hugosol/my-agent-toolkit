/**
 * Dock fixture extension: the Turn axis observed in a real harness, through the public factory.
 *
 * It declares one catalog entry and two subscription groups over one implementation — an
 * owner-scoped one and a per-actual-session one — and records every delivery as one stderr line,
 * because stderr is the channel the dock already captures.
 *
 * The lines are the evidence the dock asserts on: the request-time facts a Turn fixed, the same
 * identity repeated with the response's outcome, usage and HTTP facts, the actual session every
 * delivery carried — its own id, kind, direct parent, live name and the facts this host could not
 * report — and the fact that the two scopes were driven by the one mechanism. The fixture does no
 * work of its own beyond reporting: no network, no file, no timer.
 */
import { type OmpExtensionApi, ompAdapter } from "../../../../adapters/omp";
import { type ExtensionDefinition, defineExtension } from "../../../../framework/public";
import type { SubscriptionGroup, TurnEndDelivery, TurnStartDelivery } from "../../../../framework/interface/session";
import type { CatalogPriceSource } from "../../../../framework/interface/host-facts";

/** The extension id whose stderr lines the dock reads. */
export const TURN_FACTS_ID = "turn-facts-probe";

/** The price this fixture's catalog states for the dock's model. */
export const TURN_FACTS_PRICE = { currency: "CNY", unit: "per-million-tokens", amounts: { input: 1, cacheRead: 0.02, output: 4 } };

const definition: ExtensionDefinition = defineExtension({
	id: TURN_FACTS_ID,
	displayName: "turnFactsProbe",
});

/** The fixture's own catalog: one entry for the dock's provider and model, and nothing else. */
const catalog: CatalogPriceSource = {
	priceOf: (provider, model) =>
		provider === "dock-gateway" && model === "dock-model" ? TURN_FACTS_PRICE : undefined,
};

/** One observation, on the channel the dock captures. */
function evidence(scope: string, kind: string, facts: Record<string, unknown>): void {
	process.stderr.write(`[${TURN_FACTS_ID}] ${scope} ${kind} ${JSON.stringify(facts)}\n`);
}

function startLine(scope: string, delivery: TurnStartDelivery): void {
	const turn = delivery.turn;
	evidence(scope, "turn_start", {
		turnId: turn.turnId,
		sessionId: turn.session.sessionId,
		kind: turn.session.kind,
		parentSessionId: turn.session.parentSessionId ?? null,
		name: turn.session.name ?? null,
		sessionUnavailable: turn.session.unavailable,
		roundId: turn.roundId ?? null,
		startedAt: turn.startedAt,
		provider: turn.provider,
		model: turn.model,
		price: turn.price ?? null,
		unavailable: turn.unavailable,
	});
}

function endLine(scope: string, delivery: TurnEndDelivery): void {
	const end = delivery.end;
	evidence(scope, "turn_end", {
		turnId: delivery.turn.turnId,
		sessionId: delivery.turn.session.sessionId,
		kind: delivery.turn.session.kind,
		parentSessionId: delivery.turn.session.parentSessionId ?? null,
		roundId: delivery.turn.roundId ?? null,
		outcome: end.outcome,
		usage: end.usage ?? null,
		status: end.http?.status ?? null,
		hasHeaders: end.http !== undefined && Object.keys(end.http.headers).length > 0,
		providerRequestId: end.providerRequestId ?? null,
		providerResponseId: end.providerResponseId ?? null,
		unavailable: end.unavailable,
	});
}

export default function turnFactsProbe(pi: OmpExtensionApi): void {
	const groups: readonly SubscriptionGroup[] = [
		{
			scope: "owner",
			events: {
				turn_start: delivery => startLine("owner", delivery as TurnStartDelivery),
				turn_end: delivery => endLine("owner", delivery as TurnEndDelivery),
			},
		},
		{
			scope: "session",
			events: {
				session_start: delivery =>
					evidence("session", "session_start", {
						sessionId: delivery.session.sessionId,
						kind: delivery.session.kind,
						parentSessionId: delivery.session.parentSessionId ?? null,
						name: delivery.session.name ?? null,
						ownerKind: delivery.owner.kind,
					}),
				turn_start: delivery => startLine("session", delivery as TurnStartDelivery),
				turn_end: delivery => endLine("session", delivery as TurnEndDelivery),
			},
		},
	];
	ompAdapter(definition, { factory: () => ({ catalog, subscriptions: groups }) })(pi);
}
