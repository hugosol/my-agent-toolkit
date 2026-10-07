/**
 * The codebase-tools extension definition, shared by every agent-runtime assembly.
 *
 * This is plain data: the whole behavior the extension has — its identity, its
 * activation State, its toggle command, its two injected-prompt slots and its status
 * marker — is declared here, and the framework supplies the behavior. It imports no
 * agent-runtime types, and it lives outside the discovery roots (`extensions/`), so
 * the OMP entrypoint reaches it through the extension's OMP runtime assembly.
 *
 * `state` is deliberately omitted: codebase-tools uses the framework's default
 * activation field, `enabled`, whose name is also its persistence key.
 */
import { defineExtension } from "../../framework/public";
import { INIT_PROMPT, REMINDER_PROMPT } from "./prompts";

export const CODEBASE_TOOLS = defineExtension({
	id: "codebase-tools",
	displayName: "codeBaseTools",
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
