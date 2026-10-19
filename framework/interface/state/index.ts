/**
 * The State capability's canonical extension-facing declarations.
 *
 * This file owns the vocabulary an extension declares and the managed operations a session
 * delivery hands out: the declared State axes, the owner a framework effect acts on, the
 * declared-value seam, and the owner-scoped capability handle. The State implementation — the
 * store, owner lives, persistence, followed-owner reads and access lifetime — remains behind the
 * capability interface, and no declaration here lets a consumer reach it.
 */
import type { FeedbackTransport } from "../feedback";

/**
 * Whether a declared State value outlives the memory of the session that wrote it.
 *
 * `session-entry` — the value is recorded in the owner's persistence medium, and a
 * session boundary seeds it from that session's target branch. `memory` — the value is
 * never recorded and never seeded: it exists only as the owner cell's current value, so
 * a boundary that replaces the owner drops it to the declared default while navigation
 * that keeps the same owner identity keeps it. `memory` is the choice for a value that
 * declares a live external effect, because a restored value would not prove that effect
 * is still running.
 */
export type StatePersistence = "session-entry" | "memory";

/**
 * How a subagent session relates to its owner's declared State value.
 *
 * `follow` — the subagent reads the owner's current value live. `none` — the subagent
 * reads the field's declared default, so the value an owner holds never reaches a
 * subagent on its own. Values that are not this declared field, such as each session's
 * own injected-prompt progress, stay per-session whatever this axis says.
 */
export type StateInheritance = "follow" | "none";

/**
 * The State an extension declares.
 *
 * v1 owns exactly one boolean activation field per extension, and the field name is also
 * the persistence key for its value whenever the field is persisted. Omitting `state`
 * selects the framework's default field, persistence and inheritance.
 *
 * The three declared axes are independent, and every framework behavior branches on the
 * axis it belongs to: the control kind decides how a command drives the field, the
 * persistence decides whether the value is recorded and seeded, and the inheritance
 * decides whether a subagent reads the owner's value or the declared default.
 */
export interface StateDeclaration {
	/** The activation field name; defaults to `enabled`. */
	readonly field?: string;
	/** How the value is persisted; defaults to `session-entry`. */
	readonly persistence?: StatePersistence;
	/** Whether a subagent reads the owner's current value; defaults to `none`. */
	readonly inheritance?: StateInheritance;
}

/**
 * The owner a framework effect acts on: the session whose State the effect concerns.
 *
 * `owner` — the session this delivery names is itself the owner (a top-level main session). It is
 * the only session that seeds or transitions the value. `inherited` — the delivery names a subagent
 * session, which owns no cell: it never writes one, and it reads its owner's value only when the
 * field declares `follow`, otherwise the declared default. `unresolved` — no owning main session
 * could be resolved (the parent chain leaves the process), so the value reads as the declared
 * default and no path may write it.
 *
 * The key is the adapter's opaque identity for the owning session. The framework never derives or
 * interprets it; two sessions in one process that share a registry label are still different owners
 * when their session identities differ.
 */
export type OwnerReference =
	| { readonly kind: "owner"; readonly key: string }
	| { readonly kind: "inherited"; readonly key: string }
	| { readonly kind: "unresolved" };

/**
 * The declared-value seam: the surface every injected handler delivery carries for the
 * extension's declared State value.
 *
 * A handler owns its write. The framework never writes a declared value on a handler's behalf,
 * never overwrites one the handler decided, and never deduplicates two identical writes, so the
 * value a handler leaves is the value State holds. `read` is the owner's current value at the
 * moment it is called: a read after a write observes that write, and a read in a later delivery
 * or retained capability observes whatever the value is then. A handler that needs the value it
 * saw before it wrote keeps that value itself; the seam is not a snapshot. `write` is the only
 * path that changes it.
 *
 * A seam is bound to one declared field, and to the owner the delivery resolved. The framework
 * publishes the marker area after each write, so a write of `false` removes this extension's line
 * as surely as a write of `true` adds it.
 */
export interface DeclaredValueSeam {
	/** The owner's current value for the seam's declared field, as it stands now. */
	read(): boolean;
	/**
	 * Records a new value for the seam's declared field.
	 *
	 * The write is the framework's: it becomes the owner's current value, is recorded best-effort in
	 * the owner's persistence medium when the field persists there, and is followed by an area
	 * update. A field that declares `memory` is never recorded. A handler that never writes changes
	 * nothing.
	 */
	write(value: boolean): void;
}

/**
 * The owner-scoped capability handle: what a handler retains so an effect it drives outside its own
 * delivery — a heartbeat timer, an outbound flusher — can still write the extension's declared value
 * and publish operator feedback.
 *
 * It is the same write and the same feedback channel the delivery carries, scoped to the owner that
 * delivery resolved, and it changes nothing about who owns the write. It is valid for the owner's
 * life and no longer: a capability retained earlier is inert once that owner's cell is retired, so a
 * late callback cannot speak for a session that is gone.
 *
 * It carries no `hasUI`: whether the session has a UI is a fact a delivery decides its own gate on,
 * while a background effect publishes on this feedback channel whatever the session's UI is.
 */
export interface OwnerCapabilityHandle {
	/** The declared-value seam of the owner this capability is scoped to. */
	readonly state: DeclaredValueSeam;
	/** The unified extension feedback channel of the owner this capability is scoped to. */
	readonly feedback: FeedbackTransport;
}
