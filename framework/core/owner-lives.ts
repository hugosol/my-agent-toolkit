/**
 * The owner lives one extension's State is scoped to: the capability handles its deliveries
 * handed out, and the session boundary that ends them.
 *
 * An owner's life is the interval between the `session_start` that enters it and the
 * `session_end` that leaves it, and the cell that holds its State is exactly that long-lived.
 * A capability retained for an owner has to live exactly that long as well: it works while the
 * life is open, and the boundary that retires the cell revokes every capability that owner
 * retained, so a background callback that arrives after its session ended writes nothing and is
 * heard by nobody.
 *
 * Ending a life is also what makes the gap that follows it meaningful. A `session_end` delivery
 * mints a capability for an owner the framework has already retired, and a capability that
 * reported itself live there would be a way to recreate the very cell the session that could own
 * it has just lost; so a capability retained after that life ended is inert from birth, and
 * only the start that enters the owner again opens one that works. An owner not yet seen by
 * a session event can retain a capability, preserving commands delivered before the first start.
 *
 * This is StateStore's private composition: no caller pairs its operations with cell writes.
 */

export class OwnerLives {
	/** The capabilities retained for each open owner's current life. */
	readonly #retained = new Map<string, Set<() => void>>();
	/** The owners whose life has ended and whose next start has not opened it again. */
	readonly #ended = new Set<string>();

	/** Opens one owner's life: the owner a start enters holds working capabilities again. */
	begin(ownerKey: string): void {
		this.#ended.delete(ownerKey);
	}

	/**
	 * Ends one owner's life: every capability that owner retained stops working.
	 *
	 * The revocations run before the owner is recorded as ended, so a capability revoked here
	 * never observes a half-finished life.
	 */
	end(ownerKey: string): void {
		const retained = this.#retained.get(ownerKey);
		this.#retained.delete(ownerKey);
		if (retained !== undefined) {
			for (const revoke of retained) revoke();
		}
		this.#ended.add(ownerKey);
	}

	/**
	 * Retains one capability for the owner's current life.
	 *
	 * `revoke` is called when that life ends — and immediately when it has already ended, so a
	 * capability retained for an owner that is gone never works at all rather than waiting for an
	 * end that already happened.
	 */
	retain(ownerKey: string, revoke: () => void): void {
		if (this.#ended.has(ownerKey)) {
			revoke();
			return;
		}

		let retained = this.#retained.get(ownerKey);
		if (retained === undefined) {
			retained = new Set();
			this.#retained.set(ownerKey, retained);
		}
		retained.add(revoke);
	}
}
