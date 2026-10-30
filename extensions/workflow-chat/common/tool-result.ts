import type { ToolExecutionResult } from "../../../framework/interface/tool";
import type { WorkflowResponse } from "./requests";

export function workflowToolResult(result: WorkflowResponse & { readonly message?: string }): ToolExecutionResult {
	return {
		content: [{ type: "text", text: result.message ?? JSON.stringify(result.body) }],
		details: { httpStatus: result.httpStatus, body: result.body },
		isError: result.isError,
	};
}
