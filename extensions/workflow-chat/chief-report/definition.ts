import { defineExtension } from "../../../framework/interface";
import { WORKFLOW_CONFIG } from "../common/config";
import { INIT_PROMPT } from "./shared-logic/prompts";

export const CHIEF_REPORT = defineExtension({
	id: "chief-report",
	displayName: "chiefReport",
	state: { inheritance: "none" },
	config: WORKFLOW_CONFIG,
	prompts: [{ tag: "tools", strategy: "first-enabled-run", content: INIT_PROMPT }],
});