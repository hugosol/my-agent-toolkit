/**
 * Dock fixture extension: the activity axis observed in a real harness, through the public factory.
 *
 * It exists because "a session reads as working while its run is in flight and idle only once the
 * framework confirmed that run's Round ended" is a claim about the framework's *public* extension
 * consumption — one that no extension's own account of itself can establish, and one a process-internal
 * double can only restate. This file binds a probe definition with the framework's own OMP adapter and
 * records, on the process's non-model channel, every `session_activity` delivery one subscription
 * receives: the actual session it names and the reading it carries.
 *
 * The same binding also records the Round edges and the session boundaries it subscribes to, for one
 * reason only: a reading is delivered *after* the edge that moved it, and whether *leaving* a session
 * is that session's own end is a distinction the readings are placed against. Two separate extensions
 * would each write their own lines, and their relative order across bindings would state nothing about
 * this order.
 *
 * The fixture does no work of its own beyond reporting: no network, no file, no timer. What it prints
 * is the framework's dispatch, never a behavior of its own.
 */
import { type OmpExtensionApi, ompAdapter } from "../../../../framework/adapters/omp";
import {
	type ExtensionDefinition,
	type RoundDelivery,
	type SessionActivityDelivery,
	type SessionEventDelivery,
	defineExtension,
} from "../../../../framework/public";

/** The extension id whose stderr lines the dock reads. */
export const ACTIVITY_FACTS_ID = "activity-facts-probe";

const definition: ExtensionDefinition = defineExtension({
	id: ACTIVITY_FACTS_ID,
	displayName: "activityFactsProbe",
});

/** One line, on the channel the dock captures, in the order the framework delivered it. */
function note(kind: string, facts: Record<string, unknown>): void {
	process.stderr.write(`[${ACTIVITY_FACTS_ID}] ${kind} ${JSON.stringify(facts)}\n`);
}

function edgeLine(delivery: RoundDelivery): void {
	note(delivery.event.kind, {
		sessionId: delivery.session.sessionId,
		parent: delivery.session.parentSessionId ?? null,
	});
}

function activityLine(delivery: SessionActivityDelivery): void {
	note("session_activity", {
		sessionId: delivery.session.sessionId,
		parent: delivery.session.parentSessionId ?? null,
		activity: delivery.activity,
	});
}

function sessionLine(delivery: SessionEventDelivery): void {
	note(delivery.event.kind, {
		sessionId: delivery.session.sessionId,
		...(delivery.event.kind === "session_end" ? { reason: delivery.event.reason } : {}),
	});
}

export default function activityFactsProbe(pi: OmpExtensionApi): void {
	// One group over every actual session: a subagent session's reading is its own, exactly as its
	// Round is, so nothing here is read through the session that spawned it. The session boundaries are
	// recorded too, because whether *leaving* a session is that session's own end is a distinction the
	// reading is placed against.
	ompAdapter(definition, {
		factory: () => ({
			subscriptions: [
				{
					scope: "session",
					events: {
						session_start: sessionLine,
						session_end: sessionLine,
						round_start: edgeLine,
						round_end: edgeLine,
						session_activity: activityLine,
					},
				},
			],
		}),
	})(pi);
}
