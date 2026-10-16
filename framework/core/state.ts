/**
 * State owns current values, Owner lives and the complete declared-value write path.
 *
 * Callers observe values, request a delivery's writer or retained capability, and apply
 * semantic session changes. They never pair storage changes with capability revocation.
 * State accepts only its resolved declaration rules; each delivery supplies its own effects.
 * No harness context, extension definition or Marker area layout lives here.
 *
 * Reading is scoped like everything else here. An Owner this process holds reads its own cell
 * (`view`); an Owner another process serves is read through the framework's local access
 * (`followed`), which answers the declared default until that access is reached and never writes
 * anything back. A store that follows nothing is the in-process one and reads no access at all.
 */
import type { StatePersistence } from "./definition";
import { FollowedOwners, type FollowedAccessReader } from "./followed-owners";
import { OwnerLives } from "./owner-lives";
import type { OwnerAccessPublisher, OwnerAccessSource } from "../modules/local-access";
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

/**
 * The local access one store offers the owners it serves through.
 *
 * A seat needs both halves: an owner key alone is not unique across extensions, because two
 * extensions of one process serve the same session's owner.
 */
export interface StateLocalAccess {
	readonly extension: string;
	/** The access the offer goes through; the store withdraws exactly what it offered. */
	readonly publisher: OwnerAccessPublisher;
}

/** The declaration rules this module needs, resolved by the assembly. */
export interface StateRules {
	readonly field: string;
	readonly persistence: StatePersistence;
	/**
	 * How this store offers the owners it serves to a session the harness runs in another process.
	 * A store built without one offers nothing: every reader of an owner's value is in this process,
	 * which is what a harness whose sessions are all bindings in this process uses, and what keeps
	 * such a process free of any endpoint.
	 */
	readonly localAccess?: StateLocalAccess;
	/**
	 * How this store reads the declared values of an Owner another process serves.
	 *
	 * A store built without one follows nothing: every read is this process's own cell or the
	 * declared default, which is what a harness whose sessions are all bindings in this process
	 * uses, and what keeps an extension that declares no `follow` free of any such read.
	 */
	readonly follow?: FollowedAccessReader;
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
 * The process-wide Marker area reads these stores but does not own their values: it
 * asks each of them which Owners it serves to decide which registration answers for
 * the seat it publishes for.
 */
export class StateStore {
	readonly #field: string;
	readonly #persistence: StatePersistence;
	readonly #localAccess: StateLocalAccess | undefined;
	readonly #following: FollowedOwners | undefined;
	readonly #cells = new Map<string, Map<string, StateValue>>();
	/** Every Owner this store has served: a boundary it reconciled, or a cell it wrote. */
	readonly #served = new Set<string>();
	readonly #ownerLives = new OwnerLives();
	/** What this store offered, per owner, so the offer ends with exactly that owner's life. */
	readonly #offers = new Map<string, () => void>();
	/** Who is observing one owner's declared values changing, per owner. */
	readonly #watchers = new Map<string, Set<(field: string, value: StateValue) => void>>();

	constructor(rules: StateRules) {
		this.#field = rules.field;
		this.#persistence = rules.persistence;
		this.#localAccess = rules.localAccess;
		this.#following = rules.follow === undefined ? undefined : new FollowedOwners(rules.follow);
	}

	view(ownerKey: string): StateView {
		return {
			read: field => this.#cells.get(ownerKey)?.get(field) ?? DEFAULT_STATE_VALUE,
		};
	}

	/**
	 * The declared value of an owner this process reads through the framework's local access.
	 *
	 * A cell this process holds wins, because that is the owner's own value where this process is
	 * where the owner lives: an ordinary in-process read takes no access at all. Without one, the
	 * value is what the owner's access last stated, and a field the access states nothing about —
	 * or an owner no access has been reached for yet — reads as the field's declared default. That
	 * fallback is a value, not a reading: it is not written anywhere, it is not the Owner's value
	 * while the access is out of reach, and the read reaches the Owner again as soon as the access
	 * is back.
	 */
	followed(ownerKey: string): StateView {
		return {
			read: field => {
				const local = this.#cells.get(ownerKey)?.get(field);
				if (local !== undefined) return local;
				return this.#following?.read(ownerKey, field) ?? DEFAULT_STATE_VALUE;
			},
		};
	}

	/**
	 * Releases what this store holds open for the owners it follows, and stops following.
	 *
	 * A store that has disposed reads the declared default for every followed owner from then on
	 * and opens nothing again, so a session this process no longer runs holds no connection to the
	 * process that serves its owner. What this store itself serves is untouched: its cells, their
	 * owners' lives and its own offer of them are not what a follow is.
	 */
	dispose(): void {
		this.#following?.dispose();
	}

	/**
	 * Whether this store answers for an Owner.
	 *
	 * The process-wide Marker area is one area while its registrations come from one factory call per
	 * session, so it has to decide which store answers for a seat, and that is the store that serves
	 * the Owner the seat names. An Owner boundary this store reconciled counts, and so does a cell it
	 * wrote; a store that never served an Owner does not, whatever another registration holds — the
	 * session a binding is bound to cannot speak for a seat that is not its Owner.
	 *
	 * A retired Owner keeps counting. Its values are gone with it, so the store that served it is the
	 * one that reads the declared default for it — the answer a clear needs — rather than leaving the
	 * seat to a registration of an earlier session that happened to hold the same key.
	 *
	 * A store that follows owners answers for the ones it has read, too, because what the area asks is
	 * which registration can say what the seat's value *is*: a field that declares `follow` makes this
	 * the store that can, and it is the store that chased that Owner rather than a registration that
	 * merely holds a follow reader. A store that neither served nor chased an Owner answers for
	 * nothing, which is what keeps a session's binding from speaking for a seat that is not its Owner.
	 */
	serves(ownerKey: string): boolean {
		return this.#served.has(ownerKey) || this.follows(ownerKey);
	}

	/**
	 * Whether this store reads one Owner through the framework's local access rather than holding it.
	 *
	 * It is true for an Owner this store has already read — the access was reached, or attempted —
	 * and false for one nothing was read for. The Marker area asks it about the seat it is about to
	 * publish: a seat whose value comes from another process has no transition *here* to have
	 * published its change, so the next publication is the first chance to render it.
	 */
	follows(ownerKey: string): boolean {
		return this.#following?.follows(ownerKey) ?? false;
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
		this.#served.add(owner.key);

		if (event.kind === "session_end") {
			this.#cells.delete(owner.key);
			this.#ownerLives.end(owner.key);
			this.#withdrawOffer(owner.key);
			if (event.reason === "disposed") change.publishMarker(owner.key);
			return;
		}

		this.#ownerLives.begin(owner.key);
		if (this.#persistence === "session-entry") {
			const payload = change.statePayloads[change.statePayloads.length - 1];
			const value = this.#restoredValue(payload);
			this.#cells.set(owner.key, new Map([[this.#field, value]]));
		}
		// The access is offered for exactly this owner's life: it begins where the cell does and is
		// withdrawn at the boundary that retires the cell, so a session this store serves is
		// readable from another process for as long as it lives and not one moment longer.
		this.#offerAccess(owner.key);
		change.publishMarker(owner.key);
	}

	/**
	 * Offers one owner's declared values through this store's access, replacing whatever was
	 * offered for that owner before — a start re-enters the owner, and its access is this life's.
	 */
	#offerAccess(ownerKey: string): void {
		this.#withdrawOffer(ownerKey);
		const access = this.#localAccess;
		if (access === undefined) return;

		const source: OwnerAccessSource = {
			values: () => ({ [this.#field]: this.view(ownerKey).read(this.#field) }),
			observe: listener => {
				let watchers = this.#watchers.get(ownerKey);
				if (watchers === undefined) {
					watchers = new Set();
					this.#watchers.set(ownerKey, watchers);
				}
				watchers.add(listener);
				return () => {
					const current = this.#watchers.get(ownerKey);
					current?.delete(listener);
					if (current !== undefined && current.size === 0) this.#watchers.delete(ownerKey);
				};
			},
		};
		this.#offers.set(ownerKey, access.publisher.offer({ extension: access.extension, owner: ownerKey }, source));
	}

	/** Withdraws one owner's offer: what a reader of that owner's access was told stops here. */
	#withdrawOffer(ownerKey: string): void {
		const release = this.#offers.get(ownerKey);
		if (release === undefined) return;
		this.#offers.delete(ownerKey);
		release();
		this.#watchers.delete(ownerKey);
	}

	/** Tells one owner's observers that a declared value changed: the access pushes it on. */
	#announce(ownerKey: string, value: StateValue): void {
		const watchers = this.#watchers.get(ownerKey);
		if (watchers === undefined) return;
		for (const watcher of [...watchers]) watcher(this.#field, value);
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
			this.#served.add(target.ownerKey);
		}
		cell.set(this.#field, value);
		this.#announce(target.ownerKey, value);

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
