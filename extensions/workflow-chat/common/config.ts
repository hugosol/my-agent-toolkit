import type { ExtensionConfigDeclaration } from "../../../framework/interface";

/** Both roles explicitly select the same deployment file; never derive it from a role ID/cwd. */
export const WORKFLOW_CONFIG: ExtensionConfigDeclaration = {
	path: "extensions/workflow-chat/config.yaml",
	fields: { endpoint: "non-empty-string", requestTimeoutMs: "milliseconds", collectTimeoutMs: "milliseconds" },
};
