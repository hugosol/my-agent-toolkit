/**
 * Probe 03-D: records the real ExtensionAgentIdentity the host binds for each
 * session (main and subagent) into IDENTITY_LOG. Read-only observation of ctx.agent.
 */
import { appendFileSync } from "node:fs";

interface ProbeContext {
	agent?: { kind?: string; id?: string; name?: string; depth?: number; parentId?: string };
	hasUI?: boolean;
	cwd?: string;
}

export default function (pi: {
	on(event: string, handler: (event: unknown, ctx: ProbeContext) => unknown): void;
}): void {
	const logPath = process.env.IDENTITY_LOG;
	if (!logPath) return;
	const record = (label: string, ctx: ProbeContext, extra?: unknown): void => {
		const agent = ctx?.agent ?? {};
		appendFileSync(
			logPath,
			JSON.stringify({
				label,
				kind: agent.kind,
				id: agent.id,
				name: agent.name,
				depth: agent.depth,
				parentId: agent.parentId,
				hasUI: ctx?.hasUI,
				cwd: ctx?.cwd,
				extra,
			}) + "\n",
		);
	};
	pi.on("session_start", (_event, ctx) => record("session_start", ctx));
	pi.on("session_switch", (_event, ctx) => record("session_switch", ctx));
	pi.on("before_agent_start", (_event, ctx) => {
		record("before_agent_start", ctx);
		return undefined;
	});
	pi.on("before_subagent_spawn", (event, ctx) => {
		record("before_subagent_spawn", ctx, event);
	});
}
