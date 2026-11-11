import type { ToolDeclaration } from "../../../framework/interface/tool";
import type { WorkflowRequests } from "./requests";
import { workflowReportResult } from "./report-result";
import { workflowToolResult } from "./tool-result";

type ReportState = { readonly requests: WorkflowRequests };

export interface ChiefReport {
	readonly id: string;
	readonly from: string;
	readonly delegationId: string;
	readonly at: number;
	readonly body: {
		readonly background: string; readonly execution: string; readonly result: "success" | "failure" | "blocked";
		readonly summary: string; readonly deliverables: string[]; readonly pendingDecisions: string[];
	};
}

export function isChiefReport(value: unknown): value is ChiefReport {
	if (!value || typeof value !== "object" || !("id" in value) || typeof value.id !== "string" || !value.id.trim()
		|| !("from" in value) || typeof value.from !== "string" || !value.from.trim()
		|| !("delegationId" in value) || typeof value.delegationId !== "string" || !value.delegationId.trim()
		|| !("at" in value) || typeof value.at !== "number" || !Number.isFinite(value.at)
		|| !("body" in value) || !value.body || typeof value.body !== "object") return false;
	const body = value.body;
	return "background" in body && typeof body.background === "string" && !!body.background.trim()
		&& "execution" in body && typeof body.execution === "string" && !!body.execution.trim()
		&& "summary" in body && typeof body.summary === "string" && !!body.summary.trim()
		&& "result" in body && typeof body.result === "string" && ["success", "failure", "blocked"].includes(body.result)
		&& "deliverables" in body && Array.isArray(body.deliverables) && body.deliverables.every(item => typeof item === "string")
		&& "pendingDecisions" in body && Array.isArray(body.pendingDecisions) && body.pendingDecisions.every(item => typeof item === "string");
}

/** Shared by standalone chief-report and manager-chat, never by internal node-chat.
 * Visibility grants no eligibility: the backend resolves actual delegation provenance.
 */
export const CHIEF_REPORT_TOOL: ToolDeclaration<ReportState> = {
		name: "chief_report", label: "Chief report",
		description: "向当前 chief 发送完整结果报告；每次必须原生批准，后端按实际委派授权。保存、通知不等于可靠接收、呈现或已读。内部节点继续用 report 向自己的 manager 报告。",
		parameters: { type: "object", properties: { body: { type: "object", properties: {
			background: { type: "string", description: "非空需求背景；新 chief 没有原委派上下文也能理解。" },
			execution: { type: "string", description: "非空实际执行对象与范围；不猜测缺失结果。" },
			result: { type: "string", enum: ["success", "failure", "blocked"] },
			summary: { type: "string", description: "非空结果说明，包括失败、阻塞、部分效果与限制。" },
			deliverables: { type: "array", items: { type: "string" }, description: "实际交付物；没有时明确 []。能力创建不等于业务已执行。" },
			pendingDecisions: { type: "array", items: { type: "string" }, description: "待用户判断事项；没有时明确 []。" },
		}, required: ["background", "execution", "result", "summary", "deliverables", "pendingDecisions"], additionalProperties: false } }, required: ["body"], additionalProperties: false },
		async execute(state, params, delivery) {
			const invalid = () => workflowToolResult({ isError: true, body: { code: "invalid-parameters", message: "只接受完整 body（background/execution/result/summary/deliverables/pendingDecisions），不接受身份、归属或收件人字段。" } });
			if (!params || typeof params !== "object" || Array.isArray(params) || Object.keys(params).some(key => key !== "body") || !("body" in params)) return invalid();
			const body = params.body;
			if (!body || typeof body !== "object" || Array.isArray(body)
				|| Object.keys(body).some(key => !["background", "execution", "result", "summary", "deliverables", "pendingDecisions"].includes(key))
				|| !("background" in body) || typeof body.background !== "string" || !body.background.trim()
				|| !("execution" in body) || typeof body.execution !== "string" || !body.execution.trim()
				|| !("summary" in body) || typeof body.summary !== "string" || !body.summary.trim()
				|| !("result" in body) || typeof body.result !== "string" || !["success", "failure", "blocked"].includes(body.result)
				|| !("deliverables" in body) || !Array.isArray(body.deliverables) || body.deliverables.some(item => typeof item !== "string")
				|| !("pendingDecisions" in body) || !Array.isArray(body.pendingDecisions) || body.pendingDecisions.some(item => typeof item !== "string")) return invalid();
			// postConfirmed serializes the full payload before awaiting native approval.
			const result = workflowReportResult(await state.requests.postConfirmed(delivery.sessionId, "/api/chief/reports", { body }, {
				title: "发送 chief 报告？（仅批准本次完整报告）",
				message: "业务完成或聊天中的同意不代替本次发送批准。完整报告如下；发送后不自动重投。",
			}, delivery.signal, delivery.confirm));
			if (result.body && typeof result.body === "object" && "saved" in result.body && result.body.saved === true) {
				return workflowToolResult({ ...result, body: { ...result.body,
					guidance: "报告已保存。notification 只说明通知提交情况；submitted（Herdr 接受输入）不代表可靠接收、模型已呈现、用户已读或业务验收；uncertain 不表示未发生或回滚。不要自动重试或重新提交报告。",
				} });
			}
			return workflowToolResult(result);
		},
};

/** Explicit recovery only: a resend never accepts a replacement body or creates an ID. */
export const CHIEF_RESEND_REPORT_TOOL: ToolDeclaration<ReportState> = {
	name: "chief_resend_report", label: "Resend original chief report",
	description: "仅在用户在原发送方 Chat 明确要求重发时使用。读取并完整预览原 ID/原内容，再次原生批准后才重发；不创建报告，不修改内容，不自动重试。改内容用 chief_report 新确认和新身份。",
	parameters: { type: "object", properties: { id: { type: "string", description: "已保存原报告 ID。禁止 body、身份、收件人或批准字段。" } }, required: ["id"], additionalProperties: false },
	async execute(state, params, delivery) {
		if (!params || typeof params !== "object" || Array.isArray(params) || Object.keys(params).some(key => key !== "id")
			|| !("id" in params) || typeof params.id !== "string" || !params.id.trim()) {
			return workflowToolResult({ isError: true, body: { code: "invalid-parameters", message: "只接受非空原报告 id；改内容必须新建报告并重新确认。" } });
		}
		const route = `/api/chief/reports/${encodeURIComponent(params.id)}`;
		const original = await state.requests.get(delivery.sessionId, route, delivery.signal);
		if (original.isError) return workflowToolResult(original);
		const report = original.body;
		if (!isChiefReport(report) || report.id !== params.id) {
			return workflowToolResult({ isError: true, body: { code: "invalid-report", message: "无法核实原报告 ID 与完整内容；未重发。" } });
		}
		return workflowToolResult(workflowReportResult(await state.requests.postConfirmed(delivery.sessionId, `${route}/resend`, {}, {
			title: "重发原 chief 报告？（重新批准本次重发）",
			message: `仅重发以下原 ID 和原内容，不新建或修改报告。已接收时只反馈接收事实，不再次处理；接收不是呈现、已读或验收。\n\n原报告：\n${JSON.stringify(report, null, 2)}`,
		}, delivery.signal, delivery.confirm)));
	},
};
