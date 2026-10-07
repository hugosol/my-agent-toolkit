/**
 * The host-independent State model: an owner-scoped, single-writer current-value source.
 *
 * State is the framework's one current-value source per extension. It is scoped by
 * owner — the session that holds the extension's values — and its read surface and
 * its write surface are separate: framework-managed readers observe values through a
 * {@link StateView}, which exposes no mutation, while every value change goes through
 * one of the framework's own write paths and nothing else can reach a cell: a command
 * transition ({@link StateStore.applyTransition}) and a session boundary
 * ({@link StateStore.seed} / {@link StateStore.retire}). A cell that no write path has
 * touched reads as the declared default, so a clean session starts at `false`.
 *
 * Nothing here names an agent runtime: an adapter decides which owner key a value
 * belongs to and which session stores it, and this module only keeps the current
 * value for that key.
 */

/** The State values v1 holds: the declared boolean activation field. */
export type StateValue = boolean;

/** The value a field reads as before the write path has ever set it. */
export const DEFAULT_STATE_VALUE: StateValue = false;

/**
 * The read surface of one owner's State.
 *
 * This is all a framework-managed reader gets: it can observe a value and nothing
 * else. The absence of a setter is the read/write separation — a second write path
 * would have to be a new method here, and there is none.
 */
export interface StateView {
	/** The owner's current value for `field`, or the default when unset. */
	read(field: string): StateValue;
}

/**
 * The extension's State across owners, and the one place its values change.
 *
 * One store serves every session binding of one extension in a process, so a value
 * is shared by owner identity rather than by binding: the binding that writes and the
 * later binding that reads resolve the same owner key to the same cell.
 */
export class StateStore {
	/** Owner key -> field name -> current value. Only the store's own methods write. */
	readonly #cells = new Map<string, Map<string, StateValue>>();

	/** The read view of one owner's current values. */
	view(ownerKey: string): StateView {
		return {
			read: field => this.#cells.get(ownerKey)?.get(field) ?? DEFAULT_STATE_VALUE,
		};
	}

	/**
	 * The framework's command write path: set one owner's `field` to `value`.
	 *
	 * A control behavior calls this before it persists and before it publishes
	 * feedback, so the in-memory value is authoritative for every later read in the
	 * process even when persistence fails.
	 */
	applyTransition(ownerKey: string, field: string, value: StateValue): void {
		let cell = this.#cells.get(ownerKey);
		if (cell === undefined) {
			cell = new Map<string, StateValue>();
			this.#cells.set(ownerKey, cell);
		}
		cell.set(field, value);
	}

	/**
	 * The framework's session-boundary write: atomically replace one owner's cell with
	 * the values a target branch seeded.
	 *
	 * The replacement is whole: the owner's previous values go with the cell they lived
	 * in, so a field this boundary does not seed reads as the declared default instead of
	 * keeping a value from the session the boundary moved away from.
	 */
	seed(ownerKey: string, values: Readonly<Record<string, StateValue>>): void {
		this.#cells.set(ownerKey, new Map(Object.entries(values)));
	}

	/**
	 * Retire one owner's cell: every value it held reads as the declared default again.
	 *
	 * A session boundary whose identity changed retires the cell of the session it left,
	 * so a value that session held can never be read as another session's.
	 */
	retire(ownerKey: string): void {
		this.#cells.delete(ownerKey);
	}
}
