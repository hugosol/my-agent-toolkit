import { WorkflowRequests, type WorkflowResponse } from "../../common/requests";

type ReportResult = WorkflowResponse & { readonly message?: string };

/** Node report protocol; saving a report is distinct from auxiliary notification. */
export class NodeReports {
	constructor(private readonly requests: WorkflowRequests) {}

	async report(sessionId: string, params: unknown, signal?: AbortSignal): Promise<ReportResult> {
		if (!params || typeof params !== "object" || !("body" in params) || typeof params.body !== "string" || Object.keys(params).some(key => key !== "body")) {
			return { body: null, message: "report 只接受字符串 body，不接受身份或归属字段。", isError: true };
		}
		const result = await this.requests.post(sessionId, "/api/workflow/node/report", { body: params.body }, signal);
		const savedFailed = typeof result.body === "object" && result.body !== null && "saved" in result.body && result.body.saved === false;
		return { ...result, isError: result.isError || savedFailed };
	}
}
