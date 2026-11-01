import type { ToolDeclaration } from "../../../../../framework/interface/tool";
import { workflowToolResult } from "../../../common/tool-result";
import type { NodeReports } from "../report";

type NodeToolState = { readonly operations: NodeReports };

export const NODE_TOOLS: readonly ToolDeclaration<NodeToolState>[] = [{
	name: "report", label: "Report",
	description: "提交简短编排报告与可交接声明，可登记命名文件输出；分别返回保存、辅助通知和诊断结果。报告不自动完成节点。",
	parameters: {
		type: "object",
		properties: {
			body: { type: "string", description: "简短说明结论、阻塞、部分效果、限制和必要干预；详细成果留在文件，不重复完整正文或已知身份。" },
			can_complete: { type: "boolean", description: "必填严格 boolean：如实声明本次执行是否已可交接。true 仅允许管理者显式 complete，不自动完成；false 表示仍不可交接。" },
			outputs: { type: "object", properties: {}, additionalProperties: true, description: "可选的输出名到文件绝对地址字符串的映射，例如 {\"draft\":\"E:/results/draft.md\"}。省略或未提及名字保留原登记；不验证文件存在、可读或内容质量。" },
		},
		required: ["body", "can_complete"], additionalProperties: false,
	},
	async execute(state, params, delivery) {
		return workflowToolResult(await state.operations.report(delivery.sessionId, params, delivery.signal));
	},
}];
