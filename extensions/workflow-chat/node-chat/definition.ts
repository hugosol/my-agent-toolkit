import { defineExtension } from "../../../framework/interface";
import { WORKFLOW_CONFIG } from "../common/config";
import { INIT_PROMPT } from "./shared-logic/prompts";

export const NODE_CHAT = defineExtension({
	id: "node-chat",
	displayName: "nodeChat",
	state: { inheritance: "none" },
	config: WORKFLOW_CONFIG,
	prompts: [{
		tag: "tools", strategy: "first-enabled-run",
		content: INIT_PROMPT,
	}],
});
