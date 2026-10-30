import type { ToolDeclaration } from "../../../../../framework/interface/tool";
import { workflowToolResult } from "../../../common/tool-result";
import type { NodeReports } from "../report";

type NodeToolState = { readonly operations: NodeReports };

export const NODE_TOOLS: readonly ToolDeclaration<NodeToolState>[] = [{
	name: "report", label: "Report",
	description: "提交节点可交接结果正文；分别返回保存、辅助通知和诊断结果。报告不等于节点完成。",
	parameters: {
		type: "object",
		properties: { body: { type: "string", description: "必须是报告正文字符串；不进行类型转换。" } },
		required: ["body"], additionalProperties: false,
	},
	async execute(state, params, delivery) {
		return workflowToolResult(await state.operations.report(delivery.sessionId, params, delivery.signal));
	},
}];
