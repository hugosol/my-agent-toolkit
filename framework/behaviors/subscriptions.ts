/**
 * Subscription scope and ordered handler dispatch: the one path every semantic delivery takes.
 *
 * A binding's subscriptions are groups, and a group states its {@link ObservationScope} once. The
 * two scopes differ only in which deliveries a group admits — an `owner` group observes the
 * owner session's own deliveries, a `session` group observes every actual session's — so one
 * dispatch serves both and no second mechanism exists for the wider one.
 *
 * The order is the framework's and is not negotiable by an assembly: the framework's own behavior
 * for a delivery has already run before this module is reached (a boundary's State is seeded or
 * retired, a Turn's identity and its request-time facts are fixed), and the groups then run in
 * declaration order, each group's handler for that event kind alone.
 *
 * A handler's failure is its own. A synchronous throw and a rejected promise are both reported
 * once on the adapter's diagnostic channel — a channel outside model context — and neither
 * disturbs what the framework already did for the delivery nor another subscriber: the next group
 * still runs, and a later delivery of the same binding is unaffected.
 *
 * This module is harness-independent: it names no native API, reads and writes no State, and
 * decides nothing about which deliveries exist — only which of them a group admits.
 */
import type {
	ObservationScope,
	OwnerReference,
	RoundEvent,
	SemanticEvent,
	SemanticEventDeliveryMap,
	SessionEvent,
	TurnEvent,
	UserInputEvent,
	SubscriptionGroup,
} from "../core/protocol";

/** The session axis's event kinds, for a binding that must know which axis a group observes. */
export const SESSION_EVENT_KINDS: readonly SessionEvent["kind"][] = ["session_start", "session_end", "session_facts"];

/** The round axis's event kinds. */
export const ROUND_EVENT_KINDS: readonly RoundEvent["kind"][] = ["round_start", "round_end"];

/** The Turn axis's event kinds. */
export const TURN_EVENT_KINDS: readonly TurnEvent["kind"][] = ["turn_start", "turn_end"];

/** The input axis's event kinds. */
export const USER_INPUT_EVENT_KINDS: readonly UserInputEvent["kind"][] = ["user_input"];

/**
 * Whether one group's scope admits a delivery whose owner resolved this way.
 *
 * `owner` admits a delivery whose session is itself an owner — the only session whose effects an
 * owner-scoped group drives — while `session` admits every actual session's, because a
 * per-session subscription observes each session's own work rather than the owner's.
 *
 * A delivery whose owning main session could not be resolved (`unresolved`) is admitted by the
 * `session` scope and by no other: a per-session view observes the actual session's own work and
 * does not need an owner for it, while an owner-scoped group has no owner to drive an effect for.
 */
export function admits(scope: ObservationScope, owner: OwnerReference): boolean {
	return scope === "session" || owner.kind === "owner";
}

/** Whether any declared group subscribes to any of these event kinds. */
export function subscribesAny(groups: readonly SubscriptionGroup[], kinds: readonly SemanticEvent["kind"][]): boolean {
	return groups.some(group => kinds.some(kind => group.events[kind] !== undefined));
}

/**
 * One step of a group's dispatch: the delivery its handler receives, and the cleanup owed to that
 * handler alone.
 */
export interface DeliveryStep<K extends SemanticEvent["kind"]> {
	readonly delivery: SemanticEventDeliveryMap[K];
	/**
	 * Runs once the handler this delivery was built for has settled: synchronously after a handler
	 * that returned nothing, after the promise of an asynchronous one settles, and after a
	 * synchronous throw. It is where a delivery whose own lifetime belongs to one handler — the
	 * session axis's feedback channel — is closed.
	 */
	readonly settled?: () => void;
}

/**
 * Delivers one event to every group whose scope admits it, in declaration order.
 *
 * `owner` is the delivery's own owner — resolved once, passed explicitly so a
 * scope can be judged before a delivery is built — and `build` produces the value one admitting
 * group's handler receives together with that handler's own cleanup. A delivery that is the same
 * value for every group is built once by the caller and returned unchanged; a delivery whose own
 * lifetime belongs to one handler (the session axis's feedback channel and retainable capability)
 * is built per group here, so no group can observe another's closed channel. Either way the same
 * facts reach every admitting group, and no group sees a delivery another was denied.
 */
export function dispatchToGroups<K extends SemanticEvent["kind"]>(
	extensionId: string,
	groups: readonly SubscriptionGroup[],
	kind: K,
	owner: OwnerReference,
	build: (group: SubscriptionGroup) => DeliveryStep<K>,
	reportFailure: (message: string) => void,
): void {
	for (const group of groups) {
		if (!admits(group.scope, owner)) continue;
		// The handler map and the event kind are correlated by `kind`, which TypeScript cannot prove
		// through the generic parameter; the lookup is narrowed once here, and the parameter types
		// above are what keep the pair right.
		const subscriber = group.events[kind] as
			| ((value: SemanticEventDeliveryMap[K]) => void | Promise<void>)
			| undefined;
		if (subscriber === undefined) continue;
		const step = build(group);
		try {
			const outcome: unknown = subscriber(step.delivery);
			if (outcome === undefined) {
				step.settled?.();
				continue;
			}
			// The framework does not wait for a handler's own asynchronous work: it is contained
			// here, and a rejection surfaces once on the diagnostic channel rather than as an
			// unhandled rejection outside the framework.
			void Promise.resolve(outcome)
				.catch((error: unknown) => {
					const detail = error instanceof Error ? error.message : String(error);
					reportFailure(`${extensionId}: ${kind} handler failed: ${detail}`);
				})
				.finally(() => {
					step.settled?.();
				});
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			reportFailure(`${extensionId}: ${kind} handler failed: ${detail}`);
			step.settled?.();
		}
	}
}
