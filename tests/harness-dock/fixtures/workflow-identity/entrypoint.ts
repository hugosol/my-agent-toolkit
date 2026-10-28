import { ompAdapter, type OmpExtensionApi } from "../../../../adapters/omp";
import { defineExtension, defineImplementation } from "../../../../framework/interface";

/** Read-only witness at the public Session interface; no role tools or network. */
export default function identityWitness(api: OmpExtensionApi) {
	return ompAdapter(defineExtension({ id: "workflow-identity-witness", displayName: "identityWitness" }), {
		implementation: defineImplementation({
			create: () => ({}),
			subscriptions: [{ scope: "session", events: { session_facts(_state, delivery) {
				process.stderr.write(`[workflow-identity] ${JSON.stringify({ sessionId: delivery.session.sessionId, owner: delivery.owner, name: delivery.session.name })}\n`);
			} } }],
		}),
	})(api);
}
