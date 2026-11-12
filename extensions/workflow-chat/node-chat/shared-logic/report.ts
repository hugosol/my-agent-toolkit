import type { ToolExecutionDelivery } from "../../../../framework/interface/tool";
import { WorkflowRequests, type WorkflowResponse } from "../../common/requests";
import { workflowReportResult } from "../../common/report-result";

type ReportResult = WorkflowResponse & { readonly message?: string };

/** Node report protocol; saving a report is distinct from auxiliary notification. */
export class NodeReports {
	constructor(private readonly requests: WorkflowRequests) {}

	async report(sessionId: string, params: unknown, signal?: AbortSignal, confirm?: ToolExecutionDelivery["confirm"]): Promise<ReportResult> {
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
		// Capture the exact wire payload before the first await; approval cannot authorize later mutations.
		const payload = {
			body: params.body, canComplete: params.can_complete,
			...("outputs" in params ? { outputs: (params.outputs as { id: string; path: string }[]).map(({ id, path }) => ({ id, path })) } : {}),
		};
		const pendingSignal = this.requests.interactionSignal(sessionId, signal);
		const notSent = (reason: string): ReportResult => ({ isError: false, body: {
			sent: false, saved: false, reason,
			guidance: "报告未发送。结束本轮，等待用户重新要求发送；不要自动重试、补发、反复询问或绕过 report。",
		} });
		if (signal?.aborted) return notSent("cancelled");
		const context = await this.requests.post(sessionId, "/api/workflow/node/context", {}, pendingSignal);
		if (context.isError) return { ...context, body: {
			...(context.body && typeof context.body === "object" ? context.body : { context: context.body }),
			sent: false, saved: false, reason: "report-policy-unavailable",
			guidance: "无法核实本次执行的报告策略，报告未发送；不要自动重试或假定 auto。",
		} };
		const policy = context.body && typeof context.body === "object" && "reportPolicy" in context.body ? context.body.reportPolicy : undefined;
		if (policy !== "auto" && policy !== "manual") return { ...notSent("report-policy-unavailable"), isError: true };
		if (pendingSignal.aborted) return notSent("cancelled");
		const result = policy === "manual"
			? await this.requests.postConfirmed(sessionId, "/api/workflow/node/report", payload, {
				title: "发送报告？（仅批准本次报告发送）",
				message: `以下为本次待发送报告的完整内容；业务批准不等于发送批准。\n\nbody:\n${payload.body}\n\ncan_complete: ${payload.canComplete}`,
			}, pendingSignal, confirm)
			: await this.requests.post(sessionId, "/api/workflow/node/report", payload, pendingSignal);
		return workflowReportResult(result);
	}
}
