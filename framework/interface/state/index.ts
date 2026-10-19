/**
 * The State capability's extension-facing leaf declarations.
 *
 * This file owns only the vocabulary a session-scoped delivery needs to name an owner and to offer
 * the extension's declared-value seam. The State implementation — the store, owner lives,
 * persistence, followed-owner reads and access lifetime — remains behind the capability interface.
 */
import type { FeedbackTransport } from "../feedback";

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
 * value a handler leaves is the value State holds. `read` is what the handler runs against: it
 * observes the value the delivery started from — which is what lets an extension filter on whether
 * it was already active before the invocation — and `write` is the only path that changes it.
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
