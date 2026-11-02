import { WorkflowRequests, type WorkflowResponse } from "../../common/requests";

type ReportResult = WorkflowResponse & { readonly message?: string };

/** Node report protocol; saving a report is distinct from auxiliary notification. */
export class NodeReports {
	constructor(private readonly requests: WorkflowRequests) {}

	async report(sessionId: string, params: unknown, signal?: AbortSignal): Promise<ReportResult> {
		if (!params || typeof params !== "object" || Array.isArray(params)
			|| !("body" in params) || typeof params.body !== "string"
			|| !("can_complete" in params) || typeof params.can_complete !== "boolean"
			|| Object.keys(params).some(key => !["body", "can_complete", "outputs"].includes(key))) {
			return { body: null, message: "report 只接受字符串 body、必填 boolean can_complete 和可选命名 outputs，不接受身份或归属字段。", isError: true };
		}
		if ("outputs" in params) {
			const ids = new Set<string>();
			if (!Array.isArray(params.outputs) || params.outputs.some(output => {
				if (!output || typeof output !== "object" || Array.isArray(output)
					|| typeof output.id !== "string" || !output.id.trim() || typeof output.path !== "string"
					|| Object.keys(output).some(key => !["id", "path"].includes(key)) || ids.has(output.id)) return true;
				ids.add(output.id);
				return false;
			})) {
				return { body: null, message: "report outputs 必须是 {id,path} 数组；id 必须非空且不重复，path 必须是文件绝对地址字符串。", isError: true };
			}
		}
		const result = await this.requests.post(sessionId, "/api/workflow/node/report", {
			body: params.body, canComplete: params.can_complete,
			...("outputs" in params ? { outputs: params.outputs } : {}),
		}, signal);
		const savedFailed = typeof result.body === "object" && result.body !== null && "saved" in result.body && result.body.saved === false;
		return { ...result, isError: result.isError || savedFailed };
	}
}
