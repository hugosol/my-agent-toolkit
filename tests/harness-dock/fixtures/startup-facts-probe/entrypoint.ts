/**
 * Dock fixture: the start facts the framework's own delivery carries in a real harness, read
 * through the public factory rather than off the native API.
 *
 * It is the output side of the adapter's session-facts mapping: what a per-session subscriber is
 * really handed at a session's start, beside the native readings the other probe takes. A case uses
 * it to read whether a start delivered the model and effective level the session began with, or
 * nothing at all — which is what a session the host merely reloaded must answer, whatever its
 * context happens to report at that instant.
 *
 * The fixture does no work beyond reporting: no network, no file, no timer, and no native call of
 * its own. Its lines go to stderr, the channel the dock already captures.
 */
import { type OmpExtensionApi, ompAdapter } from "../../../../framework/adapters/omp";
import {
	type ExtensionDefinition,
	type SessionEventDelivery,
	defineExtension,
} from "../../../../framework/public";

/** The extension id whose stderr lines the dock reads. */
export const STARTUP_FACTS_ID = "startup-facts-probe";

const definition: ExtensionDefinition = defineExtension({
	id: STARTUP_FACTS_ID,
	displayName: "startupFactsProbe",
});

function startLine(delivery: SessionEventDelivery): void {
	process.stderr.write(
		`[${STARTUP_FACTS_ID}] session_start ${JSON.stringify({
			sessionId: delivery.session.sessionId,
			kind: delivery.session.kind,
			reason: delivery.event.kind === "session_start" ? delivery.event.reason : null,
			startup: delivery.session.startup ?? null,
		})}\n`,
	);
}

export default function startupFactsProbe(pi: OmpExtensionApi): void {
	// One group over every actual session: the delivery a per-session observation view declares.
	ompAdapter(definition, {
		factory: () => ({ subscriptions: [{ scope: "session", events: { session_start: startLine } }] }),
	})(pi);
}
