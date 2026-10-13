/**
 * Dock fixture: renames a spawned session while it is running and nobody is viewing it.
 *
 * The rename is the harness's own: this fixture calls the session manager the context hands it
 * (`setSessionName`, the call the operator's `/rename` and the RPC `set_session_name` both reach),
 * on the session the context belongs to. It fires inside a model cycle — between the provider's
 * response boundary and that response settling — so the name changes while the session's own Turn
 * is in flight and no Turn, Round or session boundary is being crossed. Every main session is left
 * alone: what this fixture produces is exactly what an unviewed subagent's rename looks like.
 *
 * It logs one stderr line per rename request, on the channel the dock already captures, which is
 * what lets a case read the rename's position among the other fixtures' deliveries.
 */
export const SESSION_RENAME_ID = "session-rename";

/** The prefix every renamed session's new name carries, before its own session id. */
export const RENAMED_NAME_PREFIX = "dock-renamed:";

interface ProbeSessionManager {
	readonly getSessionId: () => string;
	readonly setSessionName?: (name: string, source?: string) => Promise<boolean>;
}

interface ProbeContext {
	readonly agent: { readonly kind?: string };
	readonly sessionManager: ProbeSessionManager;
}

interface ProbeApi {
	on(
		event: "after_provider_response",
		handler: (event: unknown, ctx: ProbeContext) => void,
	): void;
}

export default function sessionRename(pi: ProbeApi): void {
	const renamed = new WeakSet<object>();
	pi.on("after_provider_response", (_event, ctx) => {
		const manager = ctx.sessionManager;
		if (ctx.agent.kind === "main" || renamed.has(manager)) return;
		const setName = manager.setSessionName;
		if (typeof setName !== "function") return;
		renamed.add(manager);
		const sessionId = manager.getSessionId();
		process.stderr.write(
			`[${SESSION_RENAME_ID}] requested ${JSON.stringify({ sessionId, name: `${RENAMED_NAME_PREFIX}${sessionId}` })}\n`,
		);
		void setName.call(manager, `${RENAMED_NAME_PREFIX}${sessionId}`, "user").then(applied => {
			process.stderr.write(`[${SESSION_RENAME_ID}] applied ${JSON.stringify({ sessionId, applied })}\n`);
		});
	});
}
