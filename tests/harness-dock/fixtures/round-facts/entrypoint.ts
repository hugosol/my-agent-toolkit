/**
 * Dock fixture extension: the round axis observed in a real harness, through the public factory.
 *
 * It declares one per-actual-session subscription group over the round axis and one over the Turn
 * axis, and records every delivery as one stderr line, because stderr is the channel the dock
 * already captures. The two axes are recorded together on purpose: a Turn names the round the
 * framework had open when its request started, so a run's lines show directly whether the work
 * either side of a tool really stayed in one round.
 *
 * The lines are the evidence the dock asserts on: which edges the framework dispatched, for which
 * actual session, and which round identity its Turns were told they belonged to. The fixture does
 * no work of its own beyond reporting: no network, no file, no timer.
 */
import { type OmpExtensionApi, ompAdapter } from "../../../../framework/adapters/omp";
import {
	type ExtensionDefinition,
	type RoundDelivery,
	type SubscriptionGroup,
	type TurnStartDelivery,
	defineExtension,
} from "../../../../framework/public";

/** The extension id whose stderr lines the dock reads. */
export const ROUND_FACTS_ID = "round-facts-probe";

const definition: ExtensionDefinition = defineExtension({
	id: ROUND_FACTS_ID,
	displayName: "roundFactsProbe",
});

/** One observation, on the channel the dock captures. */
function evidence(kind: string, facts: Record<string, unknown>): void {
	process.stderr.write(`[${ROUND_FACTS_ID}] ${kind} ${JSON.stringify(facts)}\n`);
}

function roundLine(delivery: RoundDelivery): void {
	evidence(delivery.event.kind, {
		sessionId: delivery.session.sessionId,
		parent: delivery.session.parentSessionId ?? null,
	});
}

function turnLine(delivery: TurnStartDelivery): void {
	evidence("turn_start", {
		sessionId: delivery.turn.session.sessionId,
		turnId: delivery.turn.turnId,
		roundId: delivery.turn.roundId ?? null,
		model: `${delivery.turn.provider}/${delivery.turn.model}`,
	});
}

export default function roundFactsProbe(pi: OmpExtensionApi): void {
	// One group over every actual session: a run's own round is its own, and a subagent's edges and
	// Turns are never confused with its parent's.
	const events: SubscriptionGroup["events"] = {
		round_start: roundLine,
		round_end: roundLine,
		turn_start: turnLine,
	};
	ompAdapter(definition, { factory: () => ({ subscriptions: [{ scope: "session", events }] }) })(pi);
}
