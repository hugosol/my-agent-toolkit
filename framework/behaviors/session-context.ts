/**
 * The context axis: one collected reading of one session's own context, recorded in the
 * framework's session observation source and delivered to the groups whose scope admits it.
 *
 * The adapter owns where a reading is collected; this module owns what the framework does with it.
 * That is deliberately two things and no more. The reading is recorded in the source first, so a
 * consumer that reads the source sees what this collection left rather than what the previous one
 * left; and it is delivered when it is a *change* — a collection that read the numbers the source
 * already holds is recorded as nothing new and delivered to nobody, which is what keeps a
 * collection point the adapter collects at repeatedly from becoming a repeated publication.
 *
 * The source is also what makes the first observation possible: a consumer that attaches after the
 * reading was collected reads it there, because a change delivery reaches whoever was subscribed
 * when it happened and the source answers whoever attaches afterwards.
 *
 * A handler's failure is its own. It is reported on the adapter's diagnostic channel — a channel
 * outside model context — and it changes neither the reading the collection recorded nor whether
 * another subscriber runs.
 *
 * This module is harness-independent: it reads and writes no State and names no native API.
 */
import type { ExtensionDefinition } from "../core/definition";
import { handOverReading, type ObservationHandOver, type SessionObservations } from "../core/observations";
import type { SubscriptionGroup } from "../interface/session";
import type { ObservationSource, SessionContextObservation } from "../core/protocol";
import { dispatchToGroups } from "./subscriptions";

/** What one binding's context collection arranges itself with. */
export interface ContextCollectionInputs {
	/** The definition whose subscribers a changed reading is dispatched to, and whose id a failure names. */
	readonly definition: ExtensionDefinition;
	/** The process's one source of session observations, which this collection moves. */
	readonly observations: SessionObservations;
	/** The subscription groups a change is offered to, in declaration order. */
	readonly groups: readonly SubscriptionGroup[];
	/**
	 * Where a reading of a session whose owner this process does not serve is handed, when this
	 * binding's sessions may run in another process (see {@link ObservationHandOver}).
	 *
	 * A context reading is collected from the session's own host, so a session the harness ran
	 * elsewhere is only observed here if the process that ran it delivers what it read there — and
	 * this is where that reading leaves, from the collection that read it.
	 */
	readonly handOver?: ObservationHandOver;
	/** Reports a handler's failure outside model context. */
	readonly reportFailure: (message: string) => void;
}

/** One binding's context collection: the one entry point a collected reading arrives through. */
export interface ContextCollection {
	/**
	 * Applies one collected reading: the source's own record, then the subscribed handlers.
	 *
	 * `source` is the connection whose word stated the reading, for a session the harness ran in
	 * another process, and it decides what an older connection's word may still state (see
	 * {@link SessionObservations.observeContext}); a reading this process collected itself carries none.
	 */
	observe(observation: SessionContextObservation, source?: ObservationSource): void;
}

/** Build one binding's context collection. */
export function createContextCollection(inputs: ContextCollectionInputs): ContextCollection {
	const { definition, observations, groups, handOver, reportFailure } = inputs;
	return {
		observe(observation, source) {
			const { session, owner, reading, hasUI, feedback } = observation;
			if (!observations.observeContext(session.sessionId, reading, source)) return;
			// A reading that moved is the owner's process's business where the owner is not served
			// here: it leaves with the facts that name the session it was read in.
			handOverReading(handOver, { session, owner, context: reading });
			dispatchToGroups(
				definition.id,
				groups,
				"session_context",
				owner,
				() => ({
					delivery: { event: { kind: "session_context" }, session, owner, reading, hasUI, feedback },
				}),
				reportFailure,
			);
		},
	};
}
