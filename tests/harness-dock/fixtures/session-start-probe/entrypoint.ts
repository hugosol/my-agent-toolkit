/**
 * Dock fixture: the harness's own answers at a session's own start, read off the native extension
 * API rather than through this repository's framework.
 *
 * It is the source side of the adapter's session-facts mapping: what the host really reported —
 * before any framework fact is built from it — so a case can compare a drawn row and a saved record
 * against the host's own readings instead of against the extension's rendering of them. The facts
 * it names are the ones the public extension surface documents for a session: which agent the
 * session runs (`kind`, the registry `id` its spawn was allocated, the agent definition `name`, the
 * spawning agent's `id`), the model its context reports, and the effective thinking level the
 * harness's own getter answers at that instant — never the configured selector behind it.
 *
 * The fixture does no work beyond reporting: no network, no file, no timer, and no call that a
 * session's own processing depends on. Its lines go to stderr, the channel the dock already
 * captures.
 */
import type { OmpExtensionApi, OmpSessionContext } from "../../../../framework/adapters/omp";

/** The extension id whose stderr lines the dock reads. */
export const SESSION_START_PROBE_ID = "session-start-probe";

/** What one session's own start reported, as the host answered it. */
interface StartReading {
	readonly sessionId: string;
	readonly kind: string;
	readonly id: string;
	readonly name: string | null;
	readonly parentId: string | null;
	readonly provider: string | null;
	readonly model: string | null;
	/** The effective level the harness's own getter answered, or `null` when it publishes none. */
	readonly level: string | null;
}

export default function sessionStartProbe(pi: OmpExtensionApi): void {
	pi.on("session_start", (_event, ctx: OmpSessionContext) => {
		const level = typeof pi.getThinkingLevel === "function" ? pi.getThinkingLevel() : undefined;
		const reading: StartReading = {
			sessionId: ctx.sessionManager.getSessionId(),
			kind: ctx.agent.kind,
			id: ctx.agent.id,
			name: ctx.agent.name ?? null,
			parentId: ctx.agent.parentId ?? null,
			provider: ctx.model?.provider ?? null,
			model: ctx.model?.id ?? null,
			level: level ?? null,
		};
		process.stderr.write(`[${SESSION_START_PROBE_ID}] session_start ${JSON.stringify(reading)}\n`);
	});
}
