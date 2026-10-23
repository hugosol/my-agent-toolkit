/**
 * OMP Turn observations: native subscriptions, response mapping and per-subscription
 * streaming readings. `events.ts` supplies the delivery frame and the binding's diagnostics;
 * `queries.ts` reads the Session/Owner facts. The shared framework owns Turn identity,
 * association and lifecycle semantics.
 */
import type { SessionFacts, TurnOutcome, TurnUsage } from "../../../../framework/interface/session";
import { defineAdapterDelivery } from "../../../../framework/runtime/adapter-authoring";
import type { HarnessPort, TurnSignalFacts } from "../../../../framework/runtime/port";
import type { OmpAgentMessage, OmpExtensionApi, OmpSessionContext } from "../../native/extensibility/extensions/types";

/** The all-zero reading a message carries when the provider reported no usage at all. */
const ZERO_READING: TurnUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 };

/**
 * The usage one assistant message carried, as the four reported buckets plus the reported total, or
 * no reading when that message establishes none.
 *
 * An assistant message always carries a usage object here, but this host fills it with zeros when
 * the provider reported none: a controlled run of the dock's own endpoint that sent no usage chunk
 * at all and one that reported zeros explicitly produce the identical message fact, so a zero this
 * adapter cannot tell apart from that default is not a reading the framework may account for. A
 * non-zero reading is one the provider must have reported, and is delivered as it stands.
 */
function usageOf(message: OmpAgentMessage): TurnUsage | undefined {
	const usage = message.usage;
	if (usage === undefined) return undefined;
	const reading: TurnUsage = {
		input: usage.input ?? 0,
		output: usage.output ?? 0,
		cacheRead: usage.cacheRead ?? 0,
		cacheWrite: usage.cacheWrite ?? 0,
		totalTokens: usage.totalTokens ?? 0,
	};
	return sameReading(reading, ZERO_READING) ? undefined : reading;
}

/**
 * How one settled assistant message ended, in the framework's three-valued vocabulary.
 *
 * The mapping is the adapter's alone: an interrupted cycle is `cancelled` and a cycle whose
 * message carries an error is `failed`, whatever native stop reason spelled them; everything else
 * — including a response that only requested tools — is a completed response.
 *
 * Both axes of this adapter read it, because both are stated by the same native material: a Turn
 * reports how its response settled, and the activity the Round axis observes reports its own
 * outcome from the last message to settle. It is exported for that second reader rather than
 * spelled a second time, so which stop reason is a cancellation cannot drift between them.
 */
export function outcomeOf(message: OmpAgentMessage): TurnOutcome {
	if (message.stopReason === "aborted") return "cancelled";
	if (message.stopReason === "error" || message.errorMessage !== undefined) return "failed";
	return "completed";
}

/** Whether two readings report the same usage. */
function sameReading(left: TurnUsage, right: TurnUsage): boolean {
	return (
		left.input === right.input &&
		left.output === right.output &&
		left.cacheRead === right.cacheRead &&
		left.cacheWrite === right.cacheWrite &&
		left.totalTokens === right.totalTokens
	);
}

/** Observes one Turn subscription without exposing its native events or streaming state. */
export function observeTurns(
	pi: OmpExtensionApi,
	handler: Parameters<HarnessPort["onTurn"]>[0],
	context: {
		readonly frame: (ctx: OmpSessionContext) => Omit<TurnSignalFacts, "signal">;
		readonly session: (ctx: OmpSessionContext) => SessionFacts;
		readonly reportMissingFact: (fact: string) => undefined;
	},
): void {
	// The adapter's whole job on this axis: map native facts to signals and frame each one
	// with the session context it came from. Which Turn a fact belongs to, whether a reading
	// is final, and what an unreliable fact means are the framework's rules.
	// The last reading this binding already reported while a response streamed, per session:
	// a streaming event fires per delta, and only a changed reading is a fact at all.
	const streamed = new Map<string, TurnUsage>();

	pi.on("before_provider_request", (_event, ctx) => {
		const model = ctx.model;
		if (model?.id === undefined || model.provider === undefined) {
			// The request's model identity is the one fact this signal cannot be without: a
			// start that named no model would attribute and price the request to nothing.
			context.reportMissingFact("model identity at a request start");
			return;
		}
		handler(defineAdapterDelivery("turn", {
			...context.frame(ctx),
			signal: {
				kind: "request_started",
				session: context.session(ctx),
				at: Date.now(),
				provider: model.provider,
				model: model.id,
			},
		}));
	});
	pi.on("after_provider_response", (event, ctx) => {
		handler(defineAdapterDelivery("turn", {
			...context.frame(ctx),
			signal: {
				kind: "response_received",
				session: context.session(ctx),
				http: {
					status: event.status,
					headers: event.headers,
					...(event.metadata === undefined ? {} : { metadata: event.metadata }),
					...(typeof event.requestId === "string" && event.requestId.length > 0
						? { requestId: event.requestId }
						: {}),
				},
			},
		}));
	});
	pi.on("message_start", (_event, ctx) => {
		// A new message begins: the next response's streaming readings are its own.
		streamed.delete(ctx.sessionManager.getSessionId());
	});
	pi.on("message_update", (event, ctx) => {
		if (event.message.role !== "assistant") return;
		const usage = usageOf(event.message);
		if (usage === undefined) return;
		const sessionId = ctx.sessionManager.getSessionId();
		const previous = streamed.get(sessionId);
		if (previous !== undefined && sameReading(previous, usage)) return;
		streamed.set(sessionId, usage);
		handler(defineAdapterDelivery("turn", {
			...context.frame(ctx),
			signal: { kind: "usage_streamed", session: context.session(ctx), usage },
		}));
	});
	pi.on("message_end", (event, ctx) => {
		// Only the finalized assistant response settles a Turn; every other message kind this
		// hook also fires for is not a model cycle's end.
		if (event.message.role !== "assistant") return;
		const usage = usageOf(event.message);
		handler(defineAdapterDelivery("turn", {
			...context.frame(ctx),
			signal: {
				kind: "response_settled",
				session: context.session(ctx),
				at: Date.now(),
				outcome: outcomeOf(event.message),
				readings: usage === undefined ? [] : [usage],
				...(event.message.responseId === undefined ? {} : { responseId: event.message.responseId }),
			},
		}));
	});
}
