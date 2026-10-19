/**
 * The feedback capability: the severity and the one channel through which an extension tells the
 * operator about an effect.
 *
 * It is a leaf of the extension-facing interface, declared here rather than in the adapter seam:
 * every handler delivery carries the same two names, and an extension reads them without knowing
 * which harness mapped them or how a native notification is shaped. The framework carries a level
 * through unchanged — it neither reinterprets nor upgrades it — and a session without a UI gets the
 * message on stderr whatever its level, so a level is a severity, never a channel selector.
 */

/**
 * The severity one extension feedback notice carries.
 *
 * Three levels, because what an extension says to the operator differs in kind: `info` reports an
 * effect that happened, `warning` reports something the operator should notice about an effect that
 * only partly happened or did not happen at all, and `error` reports one that did not happen.
 */
export type FeedbackLevel = "info" | "warning" | "error";

/**
 * The transport one delivery's extension feedback is published through.
 *
 * This is the single harness-independent channel through which an extension tells the operator
 * about an effect. Implementations must use a channel outside model context: a UI notification
 * carrying the notice's own severity when the session has a UI, and one stderr line when it does
 * not. Feedback is never an injected prompt, a conversation entry, tool output, or anything else a
 * model could read. The framework publishes no notice of its own on this channel and never filters
 * one it was handed, so what an extension says is what the operator sees. The adapter's actual
 * output implementation is shared with the framework's own notices; sharing it changes neither
 * upper-level responsibility nor lifetime, and does not give an extension the notice channel.
 */
export interface FeedbackTransport {
	/** Publishes one notice at the given severity, verbatim. */
	notify(level: FeedbackLevel, message: string): void;
}
