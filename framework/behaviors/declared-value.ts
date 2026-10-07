/**
 * The declared-value write path: the one seam through which a handler writes its
 * extension's declared State value, and the one place that write lands.
 *
 * A handler owns its write. The framework builds the seam, hands it to the handler in
 * the delivery, and then does nothing on the handler's behalf: a handler that writes
 * nothing changes nothing, a value the handler writes is never overwritten by the value
 * the command's argument named, and two identical writes are two writes. What the
 * framework owns is the effect of a write — the value becomes the owner's current value,
 * the persistence record is attempted best-effort, and the marker area is republished so
 * that state and render can never disagree.
 *
 * The order inside one write is the contract, exactly as it was on the toggle path:
 * record, then persistence attempt, then the marker the new value renders. The
 * in-memory value is authoritative for every later read even when persistence fails,
 * and the area always describes a value that already holds. A field that declares
 * `persistence: "memory"` has no persistence step at all: the record is not attempted,
 * so the value's whole life is the owner cell and a restored value can never claim an
 * effect nobody can prove is running.
 *
 * The same seam serves every handler delivery — today's command deliveries and the
 * semantic-event deliveries that reuse this module's creator — so the write authority
 * has one implementation rather than one per control kind.
 *
 * This module is agent-runtime-independent: it reads and writes State and calls the
 * adapter-supplied transports, and names no native API.
 */
import { statePersistence, type ExtensionDefinition } from "../core/definition";
import type { DeclaredValueSeam, MarkerTransport, StateValues } from "../core/protocol";
import type { StateStore } from "../core/state";
import { publishMarkerOnTransition } from "./marker";

/** Where one delivery's declared-value writes land: one owner cell and the area's transport. */
export interface DeclaredValueTarget {
	/** The owner whose cell this seam writes; a delivery that is not the owner creates no seam. */
	readonly ownerKey: string;
	/** The transport the area update after each write is published through. */
	readonly markers: MarkerTransport;
	/** Records the written value in the owner's persistence medium, best-effort. */
	persist(values: StateValues): void;
}

/**
 * The declared-value seam for one handler delivery.
 *
 * `field` is the declared field this delivery writes: for a command it is the field that
 * command declared, which binding has already required to be the extension's State field.
 * `read` observes that field's current value, so a handler that runs before writing sees
 * the value the invocation started from.
 */
export function declaredValueSeam(
	definition: ExtensionDefinition,
	state: StateStore,
	field: string,
	target: DeclaredValueTarget,
): DeclaredValueSeam {
	return {
		read: () => state.view(target.ownerKey).read(field),
		/**
		 * Records a new value for the seam's declared field.
		 *
		 * The write is the framework's: it becomes the owner's current value, is recorded in
		 * the owner's persistence medium best-effort — unless the field declares `memory`, in
		 * which case there is nothing to record — and is followed by an area update. A handler
		 * that never writes changes nothing.
		 */
		write(value: boolean): void {
			state.applyTransition(target.ownerKey, field, value);

			if (statePersistence(definition) === "session-entry") {
				try {
					target.persist({ [field]: value });
				} catch {
					// Best-effort persistence: losing the record is not losing the write. The
					// in-memory value already holds it and the area still follows.
				}
			}

			publishMarkerOnTransition(definition, target.ownerKey, target.markers);
		},
	};
}
