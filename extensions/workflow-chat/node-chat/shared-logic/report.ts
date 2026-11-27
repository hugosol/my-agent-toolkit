import type { ToolExecutionDelivery } from "../../../../framework/interface/tool";
import { WorkflowRequests, type WorkflowResponse } from "../../common/requests";
import { workflowReportResult } from "../../common/report-result";

type ReportResult = WorkflowResponse & { readonly message?: string };

/** Node report protocol; saving a report is distinct from auxiliary notification. */
export class NodeReports {
	constructor(private readonly requests: WorkflowRequests) {}

	async approve(sessionId: string, params: unknown, signal?: AbortSignal, confirm?: ToolExecutionDelivery["confirm"]): Promise<WorkflowResponse> {
		if (!params || typeof params !== "object" || Array.isArray(params) || Object.keys(params).length) {
			return { isError: true, body: { error: "approve 不接受参数；执行身份由公共 Session 与后端确定。" } };
		}
		const pendingSignal = this.requests.interactionSignal(sessionId, signal);
		const context = await this.requests.post(sessionId, "/api/workflow/node/context", {}, pendingSignal);
		if (context.isError) return context;
		const body = context.body;
		if (!body || typeof body !== "object" || !("autoApproved" in body) || typeof body.autoApproved !== "boolean"
			|| !("executionId" in body) || typeof body.executionId !== "string" || !body.executionId) {
			return { isError: true, body: { error: { kind: "protocol", response: body }, guidance: "无法核实本次执行的冻结批准模式；不默认自动，不自动重试。" } };
		}
		const payload = { executionId: body.executionId, source: body.autoApproved ? "auto" : "manual" };
		const result = body.autoApproved
			? await this.requests.post(sessionId, "/api/workflow/node/approve", payload, pendingSignal)
			: await this.requests.postConfirmed(sessionId, "/api/workflow/node/approve", payload, {
				title: "成果批准", message: "当前会话的成果是否已达到预期，可以交接并推进后续流程？", includePayload: false,
				timeoutMs: this.requests.approveConfirmationTimeoutMs, notifyOnWait: true,
			}, pendingSignal, confirm);
		if (result.notSent) return { ...result, body: {
			...(result.body as Record<string, unknown>), approved: false,
			guidance: "本次未批准，不表示执行失败。可继续工作或报告；仅用户后续主动请求时重新确认，不自动重试。",
		} };
		if (result.isError) return result;
		const receipt = result.body;
		if (!receipt || typeof receipt !== "object" || !("approved" in receipt) || receipt.approved !== true
			|| !("executionId" in receipt) || receipt.executionId !== payload.executionId
			|| !("approvalSource" in receipt) || receipt.approvalSource !== payload.source) {
			return { ...result, isError: true, body: { error: { kind: "protocol", response: receipt }, guidance: "批准结果不确定；请核实后端事实，不声称成功或回滚，不自动重试。" } };
		}
		return result;
	}

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
		// Capture report content before the first await; later caller mutations cannot alter the send.
		const payload = {
			body: params.body, canComplete: params.can_complete,
			...("outputs" in params ? { outputs: (params.outputs as { id: string; path: string }[]).map(({ id, path }) => ({ id, path })) } : {}),
		};
		const result = workflowReportResult(await this.requests.post(sessionId, "/api/workflow/node/report", payload, signal));
		const receipt = result.body;
		if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) return result;
		if (!result.isError && "saved" in receipt && receipt.saved === true) {
			return { ...result, body: { ...receipt, guidance: "报告已保存；通知结果见 notification。" } };
		}
		if (result.uncertain) {
			return { ...result, body: { ...receipt, guidance: "无法确认报告是否已保存；请先核实实际结果。" } };
		}
		return result;
	}
}
