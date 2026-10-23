/** Pi session-manager branch evidence and context readings for a session's own beginning. */
import type { SessionStartReason, SessionStartup } from "../../../../../framework/interface/session";
import type { PiExtensionContext } from "../extensions/types";

/**
 * Whether one start delivery proves the session it announces *began* there, so that what the
 * context reports at that instant is what the session started on.
 *
 * The harness's own start signal is the same one a fresh session and a session it merely reloaded
 * both make, and a session pi built from another session's entries replays that conversation onto
 * its branch. A way into a session that already exists — a resume, a fork — is not a beginning, and
 * neither is a branch that already carries the conversation the session was built from. A user or
 * assistant message is exactly what such a replay leaves behind and what a session with no history
 * of its own cannot have.
 */
function beginsHere(ctx: PiExtensionContext, reason: SessionStartReason): boolean {
	if (reason === "resume" || reason === "fork") return false;
	return !ctx.sessionManager.getBranch().some(entry => {
		const role = entry.message?.role;
		return entry.type === "message" && (role === "user" || role === "assistant");
	});
}

/**
 * The model and effective effort the session this context reports began with, as this host answers
 * for it at the start that proved the session began.
 *
 * Neither is a setting: the model is the one this context reports for the request being issued at
 * that moment, and the level is the one the context reports for the session. A reading this host
 * cannot give is named in `unavailable` rather than replaced by anything, and nothing is reported
 * at all when neither is available, so an absent startup fact stays distinguishable from an empty
 * one.
 */
function startupFactsOf(ctx: PiExtensionContext, unavailable: string[]): SessionStartup | undefined {
	const model = ctx.model?.provider && ctx.model.id ? { provider: ctx.model.provider, model: ctx.model.id } : undefined;
	const effort = ctx.thinkingLevel || undefined;
	if (model === undefined) unavailable.push("startup model");
	if (effort === undefined) unavailable.push("startup effort");
	if (model === undefined && effort === undefined) return undefined;
	return { ...(model === undefined ? {} : { model }), ...(effort === undefined ? {} : { effort }) };
}

/** Startup facts exist only at a native start that proves this session began here. */
export function piSessionStartupOf(ctx: PiExtensionContext, reason: SessionStartReason | undefined, unavailable: string[]): SessionStartup | undefined {
	return reason !== undefined && beginsHere(ctx, reason) ? startupFactsOf(ctx, unavailable) : undefined;
}
