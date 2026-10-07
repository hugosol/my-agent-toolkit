/**
 * The connect-bot extension definition, shared by every agent-runtime assembly.
 *
 * This is plain data: the framework supplies the behavior behind each declaration, so this
 * module names no agent runtime and holds no logic. The arm effect, the panel protocol and
 * the session facts live in the extension's shared modules; the native reads that produce
 * those facts live in its OMP assembly.
 *
 * `state` declares the whole of connect-bot's framework State: one field, `enabled`, held for
 * the life of the owner's memory rather than recorded on the session branch, and never
 * inherited by a subagent. The agent's three-valued state, the failure budget, the outbound
 * queue and the armed session id are the extension's own working data — they are not a second
 * authoritative value the framework would have to reconcile.
 */
import { defineExtension } from "../../framework/public";

/**
 * connect-bot's declaration: one directed command whose two argument forms the panel contract
 * fixes (an empty argument arms this session, `off` disarms it), plus the marker the framework
 * publishes while the declared value holds.
 *
 * The endpoint appears here only as a requirement on the extension's own `config.yaml`; the
 * file is the single source of its value, and no default or fallback lives in code.
 */
export const CONNECT_BOT = defineExtension({
	id: "connect-bot",
	displayName: "connectBot",
	state: { field: "enabled", persistence: "memory", inheritance: "none" },
	commands: [
		{
			type: "directed",
			name: "connect-bot",
			state: "enabled",
			description: "把当前会话接入 omp-bot 面板；/connect-bot off 断开",
		},
	],
	marker: { text: "◐ connectBot" },
	config: { fields: { endpoint: "non-empty-string" } },
});
