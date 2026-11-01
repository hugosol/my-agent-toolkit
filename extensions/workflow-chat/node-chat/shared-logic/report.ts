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
		if ("outputs" in params && (!params.outputs || typeof params.outputs !== "object" || Array.isArray(params.outputs)
			|| Object.values(params.outputs).some(path => typeof path !== "string"))) {
			return { body: null, message: "report outputs 必须是输出名到文件绝对地址字符串的对象。", isError: true };
		}
		const result = await this.requests.post(sessionId, "/api/workflow/node/report", {
			body: params.body, canComplete: params.can_complete,
			...("outputs" in params ? { outputs: params.outputs } : {}),
		}, signal);
		const savedFailed = typeof result.body === "object" && result.body !== null && "saved" in result.body && result.body.saved === false;
		return { ...result, isError: result.isError || savedFailed };
	}
}
