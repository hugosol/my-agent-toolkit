/**
 * Dock fixture: the session-facts delivery observed in a real harness, through the public factory.
 *
 * It declares one per-actual-session subscription group over the session axis's facts kind and
 * records every delivery as one stderr line, because stderr is the channel the dock already
 * captures. The line names the session the delivery is about, its direct parent and the name the
 * harness reported at that instant — which is how a case reads that a rename reached a subscribed
 * extension where and when it happened, rather than at the renamed session's next boundary.
 *
 * The fixture does no work beyond reporting: no network, no file, no timer, and no native call of
 * its own — the fact it observes is the adapter's, and this is the same public subscription any
 * per-session frontend declares.
 */
import { type OmpExtensionApi, ompAdapter } from "../../../../adapters/omp";
import { type ExtensionDefinition, defineExtension } from "../../../../framework/interface";
import type { SessionEventDelivery, SubscriptionGroup } from "../../../../framework/interface/session";

/** The extension id whose stderr lines the dock reads. */
export const SESSION_FACTS_ID = "session-facts-probe";

const definition: ExtensionDefinition = defineExtension({
	id: SESSION_FACTS_ID,
	displayName: "sessionFactsProbe",
});

function factsLine(delivery: SessionEventDelivery): void {
	process.stderr.write(
		`[${SESSION_FACTS_ID}] ${delivery.event.kind} ${JSON.stringify({
			sessionId: delivery.session.sessionId,
			parent: delivery.session.parentSessionId ?? null,
			name: delivery.session.name ?? null,
		})}\n`,
	);
}

export default function sessionFactsProbe(pi: OmpExtensionApi): void {
	// One group over every actual session: a subagent nobody is viewing reports its own facts
	// exactly as the session on screen does.
	const events: SubscriptionGroup["events"] = { session_facts: factsLine };
	ompAdapter(definition, { factory: () => ({ subscriptions: [{ scope: "session", events }] }) })(pi);
}
