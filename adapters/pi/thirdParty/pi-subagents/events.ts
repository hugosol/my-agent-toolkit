/**
 * pi's shared event bus as the subagent provider's published protocol is mapped from: the
 * provider's announcement that it is serving a session, the correlated reply to this entry's
 * handshake, and the request this adapter publishes once while settling.
 *
 * What is read here is the provider's own versioned interface (`subagents:rpc:v1:...`) and nothing
 * else on the bus. Its announcement payload *is* the answer a `ping` query replies with, and a reply
 * wraps that answer in `data` beside the correlation fields. Which of the two arrives first is not
 * this adapter's to choose — two extensions loading beside each other are started in load order, and
 * an entry loaded first settles before a provider loaded second has begun serving — so both are read
 * here, within one budget, and the same answer is recognized whichever channel carried it.
 */
import type { PiEventBus } from "../../internal/native";

/** The provider's announcement channel: its statement that it is serving a session. */
const PROVIDER_READY_CHANNEL = "subagents:rpc:v1:ready";

/** The provider's request channel. */
const PROVIDER_REQUEST_CHANNEL = "subagents:rpc:v1:request";

/** The prefix a correlated answer arrives under, with the request id appended. */
const PROVIDER_REPLY_PREFIX = "subagents:rpc:v1:reply:";

/** The interface version this integration reads; another version is an interface it cannot read. */
export const SUPPORTED_PROVIDER_VERSION = 1;

/**
 * How long the settling waits for the provider's announcement or its answer to one query.
 *
 * The wait is paid once per process, at the initialization node, and only until the provider
 * states itself: a provider that is loaded has already announced itself by then in every ordering
 * where it loaded beside this entry, and a query that is answered is answered within a task. A
 * provider that is not there is not waited for twice — the mode is settled once and never moves.
 */
const ANNOUNCEMENT_BUDGET_MS = 300;

/**
 * The provider's own statement about itself, as far as this adapter reads it: the interface version
 * it speaks and the session it is currently serving.
 */
export interface PiProviderAnswer {
	readonly version?: number;
	readonly sessionId?: string;
	/** The provider answered and refused: a reachable interface that could not serve this query. */
	readonly refused?: string;
}

/** One plain mapping, or `undefined` when the value is not one. */
function mappingOf(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;
}

/** The text a value states, or `undefined` when it states none or states it empty. */
function textOf(value: unknown): string | undefined {
	return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

/**
 * The provider's own statement in one bus payload, whichever of its two shapes it arrived in: its
 * announcement payload *is* the answer a `ping` request replies with, and a reply wraps that answer
 * in `data` beside the correlation fields.
 */
function providerAnswerOf(payload: unknown): PiProviderAnswer | undefined {
	const record = mappingOf(payload);
	if (record === undefined) return undefined;
	if (record.success === false) {
		const error = mappingOf(record.error);
		return { refused: textOf(error?.message) ?? textOf(record.message) ?? "the provider refused the query" };
	}
	const answer = mappingOf(record.data) ?? record;
	const session = mappingOf(answer.session);
	const version = answer.version;
	return {
		version: typeof version === "number" && Number.isFinite(version) ? version : undefined,
		sessionId: textOf(session?.sessionId),
	};
}

/**
 * Subscribes to the provider's own announcement for this process, until the returned release is
 * called.
 *
 * A payload this adapter cannot read states no answer and is not handed on: it is read nowhere as a
 * session at rest or as another claim about this process.
 */
export function onPiProviderAnnouncement(
	bus: PiEventBus,
	handler: (answer: PiProviderAnswer) => void,
): () => void {
	return bus.on(PROVIDER_READY_CHANNEL, payload => {
		const answer = providerAnswerOf(payload);
		if (answer !== undefined) handler(answer);
	});
}

/**
 * Asks the provider's own published interface for its statement about itself, once.
 *
 * Two of the provider's own statements can answer: its *announcement*, which it makes when it begins
 * serving a session and which carries that session, and its *reply* to this entry's query,
 * correlated by the request id the query carried. An answer that states no session is kept as the
 * reading of last resort while the wait goes on for a statement that does, within the same budget:
 * a query issued before the provider has a session context is answered on the versioned interface
 * without naming a session, while the announcement that follows it names the session it serves.
 *
 * A refusal is an answer in its own right and settles at once: what it states is that the interface
 * was reached and would not serve this query, which no later statement changes. A process that
 * publishes no bus, or a provider that says nothing within the budget, answers nothing — the one
 * case in which no provider was reached at all.
 *
 * `requestId` is supplied by the caller and is the id this query is correlated under: the
 * integration's own counter keeps each integration's queries distinct within one process.
 *
 * Every subscription this query makes is released before it answers; nothing outlives it.
 */
export function askPiProvider(
	bus: PiEventBus | undefined,
	requestId: string,
): Promise<PiProviderAnswer | undefined> {
	return new Promise<PiProviderAnswer | undefined>(resolve => {
		if (bus === undefined) {
			resolve(undefined);
			return;
		}
		let answered: PiProviderAnswer | undefined;
		let settled = false;
		const finish = (answer: PiProviderAnswer | undefined): void => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			offAnnouncement();
			offReply();
			resolve(answer);
		};
		const timer = setTimeout(() => finish(answered), ANNOUNCEMENT_BUDGET_MS);
		const offAnnouncement = bus.on(PROVIDER_READY_CHANNEL, payload => {
			const answer = providerAnswerOf(payload);
			if (answer !== undefined) finish(answer);
		});
		const offReply = bus.on(`${PROVIDER_REPLY_PREFIX}${requestId}`, payload => {
			const answer = providerAnswerOf(payload);
			if (answer === undefined) return;
			answered = answer;
			if (answer.sessionId !== undefined || answer.refused !== undefined) finish(answer);
		});
		bus.emit(PROVIDER_REQUEST_CHANNEL, {
			version: SUPPORTED_PROVIDER_VERSION,
			requestId,
			method: "ping",
			params: {},
		});
	});
}
