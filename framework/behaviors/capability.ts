/**
 * The retained owner capability: the declared-value write and the unified feedback channel a
 * handler hands to the effects it drives outside its own delivery.
 *
 * An extension's background effect — a heartbeat timer, an outbound flusher — is not a handler
 * delivery, so it cannot run on delivery-scoped seams. What it needs is exactly what a delivery
 * already carries, kept past the delivery: the same write path (so an auto-disarm still writes
 * the activation field and still clears the marker) and the same feedback channel (so a failure
 * notice still reaches the operator). This module mints that handle from the delivery's own
 * parts, so the write authority stays one implementation and no owner-resolving API appears.
 *
 * The handle is bound to the owner's life, not to the delivery and not to the caller: while the
 * owner's session lives it behaves exactly like the delivery's own seam, and once the boundary
 * that ends that owner has run — the framework's behavior runs before any handler sees the event
 * — both halves become inert. A write is dropped before it can record a value, attempt
 * persistence or republish the marker area, so a late callback cannot recreate the retired cell;
 * feedback is dropped before it reaches the operator, so a session that is gone is not spoken
 * for. Reads are left alone: they observe the value the owner's cell holds, which is the declared
 * default once the cell is retired, and reading is not an effect.
 *
 * This module is agent-runtime-independent: it reads and writes State and calls the
 * adapter-supplied transports, and names no native API.
 */
import type { ExtensionDefinition } from "../core/definition";
import type { FeedbackTransport, OwnerCapabilityHandle } from "../core/protocol";
import type { StateStore } from "../core/state";
import { declaredValueSeam, type DeclaredValueTarget } from "./declared-value";

/** Where one retained capability's effects land: the write path's target plus its feedback. */
export interface RetainedCapabilityTarget extends DeclaredValueTarget {
	/** The unified feedback channel the capability publishes through while its owner lives. */
	readonly feedback: FeedbackTransport;
}

/**
 * Mints the owner-scoped capability of one handler delivery.
 *
 * The write half is the delivery's own seam — the same `declaredValueSeam` every write path goes
 * through, so the value, the persistence attempt, the marker ordering and the message an
 * extension sees are identical whether the write happens inside the delivery or an hour later —
 * wrapped in the owner's life. The feedback half is the delivery's channel, wrapped the same way.
 *
 * A capability minted for an owner whose life has already ended is inert from birth: it is
 * revoked on the spot rather than left waiting for an end that has already happened.
 */
export function retainedCapability(
	definition: ExtensionDefinition,
	state: StateStore,
	field: string,
	target: RetainedCapabilityTarget,
): OwnerCapabilityHandle {
	const write = declaredValueSeam(definition, state, field, target);

	let live = true;
	state.ownerLives.retain(target.ownerKey, () => {
		live = false;
	});

	return {
		state: {
			read: () => write.read(),
			write: value => {
				if (live) write.write(value);
			},
		},
		feedback: {
			notify: (level, message) => {
				if (live) target.feedback.notify(level, message);
			},
		},
	};
}
