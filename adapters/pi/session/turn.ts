/**
 * pi Turn observations: native model-cycle subscriptions and the mapping of their payloads to the
 * framework's own signals. The assembly supplies the Session/Owner facts from `../pi` and keeps the
 * binding-wide diagnostics; Turn identity, in-flight association and which reading is final stay
 * with the shared framework.
 *
 * The axis is mapped from the facts pi publishes around one provider call — the request about to be
 * sent, the response boundary, and the finalized assistant message — and never from pi's own
 * `turn_start`/`turn_end`, whose end fires only after the requested tools have run: tool execution is
 * outside a model cycle, so a Turn ends when its response settled, not when pi's turn did.
 */
import type { SessionFacts, TurnOutcome, TurnSignalFacts, TurnUsage } from "../../core/protocol";
import type { PiAssistantMessage, PiExtensionApi, PiExtensionContext } from "../pi";

/** The all-zero reading pi's message carries until a provider reports one. */
const ZERO_READING: TurnUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 };

/**
 * The usage one finalized assistant message carried, as pi's five reported figures, or no reading
 * when that message establishes none.
 *
 * Every assistant message pi builds starts from an all-zero usage object and is filled only from the
 * usage chunk the provider sent, so a provider that reported nothing and one that reported zeros
 * produce the identical message fact here. A zero this adapter cannot tell apart from that default
 * is not a reading the framework may account for — the same rule the OMP adapter's own mapping
 * states — and a non-zero reading is one the provider must have reported, delivered as it stands.
 */
function usageOf(message: PiAssistantMessage): TurnUsage | undefined {
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
 * The mapping is the adapter's alone: pi's `aborted` stop reason is a cancelled cycle, an `error`
 * stop reason or an error the message carries is a failed one, and everything else — including a
 * response that only requested tools — is a completed response.
 *
 * Both axes of this adapter read it, because both are stated by the same native material: a Turn
 * reports how its response settled, and the activity the Round axis observes reports its own
 * outcome from the last message to settle. It is exported for that second reader rather than
 * spelled a second time, so which stop reason is a cancellation cannot drift between them.
 */
export function outcomeOf(message: PiAssistantMessage): TurnOutcome {
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

/**
 * Registers the native model-cycle subscriptions and reports one signal per fact.
 *
 * Nothing about which signal mints a Turn, which Turn a later fact belongs to or whether a reading
 * is final is decided here: each native fact is mapped and framed with the session context it came
 * from, and the framework's own rules take it from there.
 */
export function observeTurns(
	pi: PiExtensionApi,
	handler: (facts: TurnSignalFacts) => void,
	context: {
		readonly frame: (ctx: PiExtensionContext) => Omit<TurnSignalFacts, "signal">;
		readonly session: (ctx: PiExtensionContext) => SessionFacts;
		readonly reportMissingFact: (fact: string) => undefined;
		/** Hands the binding the unsubscriber of one native registration, so a refused binding leaks none. */
		readonly track: (release: () => void) => void;
	},
): void {
	context.track(pi.on("before_provider_request", (_event, ctx) => {
		const model = ctx.model;
		if (model?.id === undefined || model.provider === undefined) {
			// The request's model identity is the one fact this signal cannot be without: a start that
			// named no model would attribute and price the request to nothing.
			context.reportMissingFact("model identity at a request start");
			return;
		}
		handler({
			...context.frame(ctx),
			signal: {
				kind: "request_started",
				session: context.session(ctx),
				at: Date.now(),
				provider: model.provider,
				model: model.id,
			},
		});
	}));
	context.track(pi.on("after_provider_response", (event, ctx) => {
		handler({
			...context.frame(ctx),
			signal: {
				kind: "response_received",
				session: context.session(ctx),
				// pi publishes the response boundary alone — its status and headers — and no
				// transport-level request id beside them, so nothing else is claimed here.
				http: { status: event.status, headers: event.headers },
			},
		});
	}));
	context.track(pi.on("message_end", (event, ctx) => {
		// Only the finalized assistant response settles a cycle: this hook fires for every message
		// kind, and a user or tool-result message is not a model cycle's end.
		const message = event.message;
		if (message.role !== "assistant") return;
		const usage = usageOf(message);
		handler({
			...context.frame(ctx),
			signal: {
				kind: "response_settled",
				session: context.session(ctx),
				at: Date.now(),
				outcome: outcomeOf(message),
				readings: usage === undefined ? [] : [usage],
				...(message.responseId === undefined ? {} : { responseId: message.responseId }),
			},
		});
	}));
}
