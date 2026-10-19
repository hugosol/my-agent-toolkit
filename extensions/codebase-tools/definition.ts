/**
 * The codebase-tools extension definition, shared by every harness assembly.
 *
 * This is plain data: the whole behavior the extension has — its identity, its
 * activation State, its toggle command, its two injected-prompt slots and its status
 * marker — is declared here, and the framework supplies the behavior. It imports no
 * harness types, and it lives outside the discovery roots (`extensions/`), so
 * the OMP entrypoint reaches it through the extension's OMP harness assembly.
 *
 * `state` declares only the axis this extension opts out of the framework's default on:
 * the activation field stays `enabled` and its persistence stays `session-entry` (the
 * field name is also its persistence key), while `inheritance: "follow"` is what keeps a
 * subagent reading the owning main session's current activation value. Inheritance is
 * `none` by default, so the opt-in is declared here rather than implied.
 */
import { defineExtension } from "../../framework/interface";
import { INIT_PROMPT, REMINDER_PROMPT } from "./shared-logic/prompts";

export const CODEBASE_TOOLS = defineExtension({
	id: "codebase-tools",
	displayName: "codeBaseTools",
	subagentRequirements: ["extension-loading", "session-facts", "state-follow"],
	state: { inheritance: "follow" },
	commands: [
		{
			type: "toggle",
			name: "codebase-tools",
			state: "enabled",
			description: "Toggle codeBaseTools routing-prompt injection for this session",
		},
	],
	/** Injected-prompt slots, in declaration order; one rule per slot. */
	prompts: [
		{ tag: "init", strategy: "first-enabled-run", content: INIT_PROMPT },
		{ tag: "reminder", strategy: "every-enabled-run", content: REMINDER_PROMPT },
	],
	marker: { text: "◈ codeBaseTools" },
});
