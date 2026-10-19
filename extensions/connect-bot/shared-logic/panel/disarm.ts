/**
 * The local half of a disconnect: what this extension does to stop claiming a session is
 * connected, before anything reaches the network.
 *
 * Two things together are this extension's connection: the framework's declared value `enabled`,
 * which the marker area renders, and the extension's own record for the owner, which the effects
 * that read it decide what to send. Either one alone would claim the session is still connected,
 * so both are dropped here and nowhere else — an `off`, a re-arm the panel refused and an
 * auto-disarm all end the same way.
 *
 * The order is the contract: the extension's own effects stop first (see
 * {@link stopLocalEffects}), and only then is the declared value written false so the marker line
 * leaves the area. A write of the value the owner already holds is skipped, because republishing
 * the area to remove a line that was never there would be a write this extension never made.
 *
 * The seam it writes is handed in rather than reached for, because the callers reach the value
 * through different doors: a command handler writes through its own delivery's seam, while an
 * auto-disarm runs inside a background callback and writes through the owner-scoped capability
 * that callback retained. Both are the same declared-value write path, so what ends a connection
 * is one function either way.
 */
import type { DeclaredValueSeam } from "../../../../framework/interface/state";
import { stopLocalEffects } from "../session/session";

/**
 * End one owner's connection locally: stop this extension's effects for it, then clear the
 * declared value the framework renders as the marker.
 *
 * Synchronous by design — a caller that then awaits the panel must already have stopped
 * everything locally, so what the operator's command did is never held up by a network wait.
 */
export function disarmLocally(state: DeclaredValueSeam, ownerKey: string): void {
	stopLocalEffects(ownerKey);
	if (state.read()) state.write(false);
}
