/**
 * The Session capability as an extension consumes it: the live read surface and its isolation from
 * the framework's authoritative record.
 *
 * These are consumer-visible regressions. Each case reads through `context.session` exactly as an
 * extension does — no internal source, no concrete observation class, no mutation method — and
 * asserts what a later read or snapshot observes after the consumer changed the value it was given.
 */
import { describe, expect, test } from "bun:test";
import type {
	SessionEventDelivery,
	SessionFacts,
	SessionObservation,
	SessionObservationReader,
} from "../../framework/interface/session";
import type { OwnerReference } from "../../framework/interface/state";
import { type ExtensionDefinition, defineExtension } from "../../framework/public";
import { portDouble } from "./support/harness-port-double";

const PROBE: ExtensionDefinition = defineExtension({
	id: "session-capability-probe",
	displayName: "sessionCapabilityProbe",
});


const OWNER: OwnerReference = { kind: "owner", key: "main:session-capability" };

/** The facts, startup reading and unavailable list a consumer must not be able to corrupt. */
const SESSION: SessionFacts = {
	sessionId: "session-capability-main",
	kind: "sub",
	parentSessionId: "session-capability-parent",
	name: "capability session",
	taskName: "capability task",
	agentName: "scout",
	agentId: "agent-1",
	startup: { model: { provider: "official", model: "model-alpha" }, effort: "high" },
	unavailable: ["modelSwitch"],
};

const GIVEN_CONTEXT = { tokens: 4242, provider: "official", model: "model-alpha" } as const;

/** The observation a case reads independently of what the consumer did to an earlier copy. */
const GIVEN_OBSERVATION = {
	sessionId: SESSION.sessionId,
	session: SESSION,
	owner: OWNER,
	activity: "working",
	context: GIVEN_CONTEXT,
} as const;

describe("the Session read surface is the consumer's only path", () => {
	test("mutating a read or snapshot cannot change what a later read observes", () => {
		const double = portDouble();
		let reader: SessionObservationReader | undefined;
		expect(
			double.bind(PROBE, {
				factory: context => {
					reader = context.session.observations;
					return {
						subscriptions: [{ scope: "session", events: { session_context: () => {} } }],
					};
				},
			}).bound,
		).toBe(true);

		double.deliverSession(OWNER, { session: SESSION });
		double.deliverRound(OWNER, { session: SESSION });
		double.deliverContext(OWNER, { session: SESSION, reading: GIVEN_CONTEXT });

		const read = readable(reader);
		expect(read.read(SESSION.sessionId)).toEqual(GIVEN_OBSERVATION);

		// A consumer may hold the values it was given, and TypeScript's readonly members are no
		// runtime fence. Every nested object it could reach is attempted here.
		const mutable = read.read(SESSION.sessionId) as unknown as {
			sessionId: string;
			activity?: string;
			session?: {
				readonly unavailable: string[];
				readonly startup?: { readonly model?: { readonly provider: string; readonly model: string } };
			};
			context?: { tokens: number; provider?: string; model?: string };
		};
		mutable.sessionId = "tampered";
		mutable.activity = "idle";
		mutable.session?.unavailable.push("tampered");
		const startupModel = mutable.session?.startup?.model;
		if (startupModel !== undefined) {
			// The runtime has no readonly fence; this is the write a consumer could attempt.
			const writableModel = startupModel as unknown as { provider: string };
			writableModel.provider = "tampered";
		}
		if (mutable.context !== undefined) mutable.context.tokens = 0;

		expect(read.read(SESSION.sessionId)).toEqual(GIVEN_OBSERVATION);

		const snapshot = read.snapshot();
		const first = snapshot[0] as unknown as {
			session?: {
				readonly unavailable: string[];
				readonly startup?: { readonly model?: { readonly provider: string } };
			};
			context?: { tokens: number };
		};
		first.session?.unavailable.push("snapshot-tampered");
		const snapshotModel = first.session?.startup?.model;
		if (snapshotModel !== undefined) {
			const writableModel = snapshotModel as unknown as { provider: string };
			writableModel.provider = "snapshot-tampered";
		}
		if (first.context !== undefined) first.context.tokens = 0;
		// The returned snapshot is the consumer's array even though its type is readonly.
		const writableSnapshot = snapshot as SessionObservation[];
		writableSnapshot.splice(0, writableSnapshot.length);

		expect(read.snapshot()).toEqual([GIVEN_OBSERVATION]);
	});

	test("mutating a delivered session's facts does not reach the framework's record", () => {
		const double = portDouble();
		let reader: SessionObservationReader | undefined;
		let delivered: SessionEventDelivery | undefined;
		expect(
			double.bind(PROBE, {
				factory: context => {
					reader = context.session.observations;
					return {
						subscriptions: [
							{
								scope: "session",
								events: {
									session_start: delivery => {
										delivered = delivery;
										const writable = delivery.session as unknown as {
											readonly unavailable: string[];
											readonly startup?: { readonly model?: { readonly provider: string } };
										};
										writable.unavailable.push("handler-tampered");
										const startupModel = writable.startup?.model;
										if (startupModel !== undefined) {
											const writableModel = startupModel as unknown as { provider: string };
											writableModel.provider = "handler-tampered";
										}
									},
								},
							},
						],
					};
				},
			}).bound,
		).toBe(true);

		// The delivery's own facts, not the case's given value: the handler below writes to them.
		const deliveredFacts = structuredClone(SESSION);
		double.deliverSession(OWNER, { session: deliveredFacts });
		expect(delivered).toBeDefined();
		expect(readable(reader).read(SESSION.sessionId)).toEqual({
			sessionId: SESSION.sessionId,
			session: SESSION,
			owner: OWNER,
		});
	});

	;
});

;

function readable(reader: SessionObservationReader | undefined): SessionObservationReader {
	if (reader === undefined) throw new Error("the extension's factory never ran");
	return reader;
}
