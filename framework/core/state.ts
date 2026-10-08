/**
 * State owns current values, Owner lives and the complete declared-value write path.
 *
 * Callers observe values, request a delivery's writer or retained capability, and apply
 * semantic session changes. They never pair storage changes with capability revocation.
 * State accepts only its resolved declaration rules; each delivery supplies its own effects.
 * No agent-runtime context, extension definition or Marker area layout lives here.
 */
import type { StatePersistence } from "./definition";
import { OwnerLives } from "./owner-lives";
import type {
	DeclaredValueSeam,
	FeedbackTransport,
	OwnerCapabilityHandle,
	OwnerReference,
	SessionEvent,
	StateValues,
} from "./protocol";

/** The State values v1 holds: the declared boolean activation field. */
export type StateValue = boolean;

/** The value a field reads as before the write path has ever set it. */
export const DEFAULT_STATE_VALUE: StateValue = false;

/** The declaration rules this module needs, resolved by the assembly. */
export interface StateRules {
	readonly field: string;
	readonly persistence: StatePersistence;
}

/** The read-only current-value view; observing State grants no mutation authority. */
export interface StateView {
	read(field: string): StateValue;
}

/** The effects supplied by one delivery, never a mutable current-session target. */
export interface StateWriteTarget {
	readonly ownerKey: string;
	persist(values: StateValues): void;
	publishMarker(): void;
}

/** A background effect retains its delivery's effects, scoped to the Owner's life. */
export interface StateCapabilityTarget extends StateWriteTarget {
	readonly feedback: FeedbackTransport;
}

/** The semantic session facts and publication effect used for State reconciliation. */
export interface StateSessionChange {
	readonly owner: OwnerReference;
	readonly event: SessionEvent;
	readonly statePayloads: readonly unknown[];
	publishMarker(ownerKey: string): void;
}

/**
 * One store belongs to one adapter factory and is shared by that factory's bindings.
 * Different factories remain independent, even when their extension names are equal.
 * The process-wide Marker area reads these stores but does not own their values.
 */
export class StateStore {
	readonly #field: string;
	readonly #persistence: StatePersistence;
	readonly #cells = new Map<string, Map<string, StateValue>>();
	readonly #ownerLives = new OwnerLives();

	constructor(rules: StateRules) {
		this.#field = rules.field;
		this.#persistence = rules.persistence;
	}

	view(ownerKey: string): StateView {
		return {
			read: field => this.#cells.get(ownerKey)?.get(field) ?? DEFAULT_STATE_VALUE,
		};
	}

	/**
	 * A delivery authorizes ordinary writes independently of retained capability life.
	 * Both write surfaces share the same implementation and ordering; identical writes
	 * remain separate writes rather than becoming idempotent transitions.
	 */
	writer(target: StateWriteTarget): DeclaredValueSeam {
		return {
			read: () => this.view(target.ownerKey).read(this.#field),
			write: value => this.#write(target, value),
		};
	}

	/**
	 * Writes and feedback stop when the Owner ends; a capability minted after that end
	 * is inert immediately. Reopening the Owner never reactivates an old capability.
	 * Reading is deliberately ungated and continues to observe the current value.
	 */
	capability(target: StateCapabilityTarget): OwnerCapabilityHandle {
		const writer = this.writer(target);
		let live = true;
		this.#ownerLives.retain(target.ownerKey, () => {
			live = false;
		});

		return {
			state: {
				read: () => writer.read(),
				write: value => {
					if (live) writer.write(value);
				},
			},
			feedback: {
				notify: (level, message) => {
					if (live) target.feedback.notify(level, message);
				},
			},
		};
	}

	/**
	 * Cell retirement and capability revocation are one operation before any handler.
	 * Every start reopens the life, including memory fields that must never be seeded.
	 * Only the final branch payload supplies a persisted value; invalid payloads use the
	 * declared default. A transfer waits for the next start to publish the Marker area.
	 */
	reconcile(change: StateSessionChange): void {
		const { owner, event } = change;
		if (owner.kind !== "owner") return;

		if (event.kind === "session_end") {
			this.#cells.delete(owner.key);
			this.#ownerLives.end(owner.key);
			if (event.reason === "disposed") change.publishMarker(owner.key);
			return;
		}

		this.#ownerLives.begin(owner.key);
		if (this.#persistence === "session-entry") {
			const payload = change.statePayloads[change.statePayloads.length - 1];
			const value = this.#restoredValue(payload);
			this.#cells.set(owner.key, new Map([[this.#field, value]]));
		}
		change.publishMarker(owner.key);
	}

	#restoredValue(payload: unknown): StateValue {
		if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
			return DEFAULT_STATE_VALUE;
		}
		const value = (payload as Record<string, unknown>)[this.#field];
		return typeof value === "boolean" ? value : DEFAULT_STATE_VALUE;
	}

	#write(target: StateWriteTarget, value: StateValue): void {
		let cell = this.#cells.get(target.ownerKey);
		if (cell === undefined) {
			cell = new Map<string, StateValue>();
			this.#cells.set(target.ownerKey, cell);
		}
		cell.set(this.#field, value);

		if (this.#persistence === "session-entry") {
			try {
				target.persist({ [this.#field]: value });
			} catch {
				// Persistence is best-effort; the current value remains authoritative.
			}
		}
		// Publication failure propagates without rolling back the value or persistence.
		target.publishMarker();
	}
}
