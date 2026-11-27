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
		readonly outputs?: readonly { readonly id: string; readonly path: string }[];
	};
}

const text = (value: unknown): value is string => typeof value === "string" && !!value.trim();
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === "string");

function isReportBody(value: unknown): value is ChiefReport["body"] {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	const body = value as Record<string, unknown>;
	return text(body.background) && text(body.execution) && text(body.summary)
		&& (body.result === "success" || body.result === "failure" || body.result === "blocked")
		&& strings(body.deliverables) && strings(body.pendingDecisions)
		&& (!("outputs" in body) || (Array.isArray(body.outputs) && body.outputs.every(file =>
			file && typeof file === "object" && !Array.isArray(file) && Object.keys(file).length === 2 && text(file.id) && text(file.path))));
}

export function isChiefReport(value: unknown): value is ChiefReport {
	if (!value || typeof value !== "object" || !("id" in value) || typeof value.id !== "string" || !value.id.trim()
		|| !("from" in value) || typeof value.from !== "string" || !value.from.trim()
		|| !("delegationId" in value) || typeof value.delegationId !== "string" || !value.delegationId.trim()
		|| !("at" in value) || typeof value.at !== "number" || !Number.isFinite(value.at)
		|| !("body" in value)) return false;
	return isReportBody(value.body);
}

const reportProperties = {
	background: { type: "string", description: "需求背景，使没有原委派上下文的 chief 也能理解。" },
	execution: { type: "string", description: "实际执行对象与范围。" },
	result: { type: "string", enum: ["success", "failure", "blocked"] },
	summary: { type: "string", description: "实际结果、部分效果与限制。" },
	deliverables: { type: "array", items: { type: "string" }, description: "文字交付说明，不替代结构化文件绑定。" },
	pendingDecisions: { type: "array", items: { type: "string" }, description: "待用户判断事项。" },
	outputs: { type: "array", description: "本次要求的实际文件 ID 与路径绑定，不是文件名或文件正文。Map 的正式文件由系统取得，不手填地址；中途情况可省略。", items: {
		type: "object", properties: {
			id: { type: "string", description: "本次声明的输出 ID。" },
			path: { type: "string", description: "实际成果文件的绝对地址。" },
		}, required: ["id", "path"], additionalProperties: false,
	} },
} as const;

/** Shared by standalone chief-report and manager-chat, never by internal node-chat.
 * Visibility grants no eligibility: the backend resolves actual delegation provenance.
 */
export const CHIEF_REPORT_TOOL: ToolDeclaration<ReportState> = {
	name: "chief_report", label: "Chief report",
	description: "向当前 chief 提交本次委派结果，经原生确认后发送。",
	parameters: { type: "object", properties: { body: { type: "object", properties: reportProperties,
		required: ["background", "execution", "result", "summary", "deliverables", "pendingDecisions"], additionalProperties: false,
	} }, required: ["body"], additionalProperties: false },
	async execute(state, params, delivery) {
		const invalid = () => workflowToolResult({ isError: true, body: { code: "invalid-parameters", message: "只接受完整 body（background/execution/result/summary/deliverables/pendingDecisions 和可选 outputs:[{id,path}]），不接受身份、归属或收件人字段。" } });
		if (!params || typeof params !== "object" || Array.isArray(params) || Object.keys(params).some(key => key !== "body") || !("body" in params)) return invalid();
		const body = params.body;
		if (!isReportBody(body) || Object.keys(body).some(key => !["background", "execution", "result", "summary", "deliverables", "pendingDecisions", "outputs"].includes(key))) return invalid();
		// postConfirmed serializes the full payload before awaiting native approval.
		const result = workflowReportResult(await state.requests.postConfirmed(delivery.sessionId, "/api/chief/reports", { body }, {
			title: "发送 chief 报告？（仅批准本次完整报告）",
			message: "业务完成或聊天中的同意不代替本次发送批准。完整报告如下；发送后不自动重投。",
		}, delivery.signal, delivery.confirm));
		if (result.body && typeof result.body === "object") {
			if ("saved" in result.body && result.body.saved === true) {
				return workflowToolResult({ ...result, body: { ...result.body,
					guidance: "报告已保存；通知结果见 notification。通知失败不撤销保存，不要重做业务或重复提交。submitted 不代表可靠接收、呈现、已读或验收；uncertain 不表示未发生或回滚。",
				} });
			}
			if ("uncertain" in result && result.uncertain === true) {
				return workflowToolResult({ ...result, body: { ...result.body,
					guidance: "无法确认报告是否已保存；请先核实实际结果。不表示未发送，也不表示回滚或未生效。不自动重投。",
				} });
			}
		}
		return workflowToolResult(result);
	},
};

/** Explicit recovery only: a resend never accepts a replacement body or creates an ID. */
export const CHIEF_RESEND_REPORT_TOOL: ToolDeclaration<ReportState> = {
	name: "chief_resend_report", label: "Resend original chief report",
	description: "用户明确要求重发时，重新确认并发送指定的已保存报告；不修改原内容。",
	parameters: { type: "object", properties: { id: { type: "string", description: "已保存报告的身份。" } }, required: ["id"], additionalProperties: false },
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
		const result = await state.requests.postConfirmed(delivery.sessionId, `${route}/resend`, {}, {
			title: "重发原 chief 报告？（重新批准本次重发）",
			message: `仅重发以下原 ID 和原内容，不新建或修改报告。已接收时只反馈接收事实，不再次处理；接收不是呈现、已读或验收。\n\n原报告：\n${JSON.stringify(report, null, 2)}`,
		}, delivery.signal, delivery.confirm);
		if (result.notSent) {
			const detail = result.body && typeof result.body === "object" ? result.body : {};
			return workflowToolResult({ ...result, body: { ...detail, saved: true, report, sent: false,
				guidance: "原报告仍已保存；本次重发未发送。结束当前这一轮，不自动重试或反复确认，不撤销既有外部效果。拒绝只约束这次调用；用户下一条消息明确重新要求重发时，这是新的用户决定，应在新轮调用 chief_resend_report 取得全新原生确认，不能沿用旧批准，也不能把前次拒绝当作永久禁止。",
			} });
		}
		return workflowToolResult(workflowReportResult(result));
	},
};
