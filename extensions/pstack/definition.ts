import { fileURLToPath } from "node:url";
import { defineExtension } from "../../framework/interface";
import rules from "../../pstack-suite/generated/skills/poteto-mode/SKILL.md" with { type: "text" };

const ruleSource = fileURLToPath(new URL("../../pstack-suite/generated/skills/poteto-mode/SKILL.md", import.meta.url));
const guidance = `Pstack engineering rules. Resolve relative references from this source file: ${ruleSource}\n\n${rules}`;

export const PSTACK_MODE = defineExtension({
	id: "poteto-mode",
	displayName: "Poteto mode",
	commands: [
		{ type: "toggle", name: "poteto-mode", state: "enabled", description: "Toggle pstack engineering guidance for this session" },
	],
	prompts: [
		{ tag: "engineering", strategy: "first-enabled-run", content: guidance },
		{
			tag: "reminder",
			strategy: "every-enabled-run",
			content: `Poteto mode remains active. Follow the engineering rules from ${ruleSource}; read only the matching playbook or leaf skill.`,
		},
	],
	marker: { text: "◈ Poteto mode" },
});
