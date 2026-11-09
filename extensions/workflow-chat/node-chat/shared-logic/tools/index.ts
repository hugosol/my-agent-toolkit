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
			outputs: {
				type: "array", items: {
					type: "object", properties: {
						id: { type: "string", description: "本次执行冻结 output_rule 中的输出 ID，不是文件名；同次报告不得重复。" },
						path: { type: "string", description: "实际成果文件的绝对地址，不含 NUL。" },
					}, required: ["id", "path"], additionalProperties: false,
				},
				description: "可选的实际文件输出数组，例如 [{\"id\":\"draft\",\"path\":\"E:/results/draft.md\"}]。省略或未提及 ID 保留本执行原登记；不验证文件存在、可读或内容质量。",
			},
		},
		required: ["body", "can_complete"], additionalProperties: false,
	},
	async execute(state, params, delivery) {
		return workflowToolResult(await state.operations.report(delivery.sessionId, params, delivery.signal, delivery.confirm));
	},
}];
