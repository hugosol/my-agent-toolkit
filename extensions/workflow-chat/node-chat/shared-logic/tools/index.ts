import type { ToolDeclaration } from "../../../../../framework/interface/tool";
import { workflowToolResult } from "../../../common/tool-result";
import type { NodeReports } from "../report";

type NodeToolState = { readonly operations: NodeReports };

export const NODE_TOOLS: readonly ToolDeclaration<NodeToolState>[] = [{
	name: "report", label: "Report",
	description: "提交本次节点的进展、问题或成果，声明是否可交接，并登记文件输出。",
	parameters: {
		type: "object",
		properties: {
			body: { type: "string", description: "简短说明结论、阻塞、部分效果、限制和必要干预；详细成果留在文件，不重复完整正文或已知身份。" },
			can_complete: { type: "boolean", description: "如实声明本次执行是否可交接，不直接完成节点。" },
			outputs: {
				type: "array", items: {
					type: "object", properties: {
						id: { type: "string", description: "本次声明的输出 ID。" },
						path: { type: "string", description: "实际成果文件的绝对地址。" },
					}, required: ["id", "path"], additionalProperties: false,
				},
				description: "本次要求的实际文件 ID 与路径绑定，不是文件名或文件正文。",
			},
		},
		required: ["body", "can_complete"], additionalProperties: false,
	},
	async execute(state, params, delivery) {
		return workflowToolResult(await state.operations.report(delivery.sessionId, params, delivery.signal));
	},
}, {
	name: "approve", label: "Approve",
	description: "按本次成果批准模式取得批准；不发送报告或推进流程。",
	parameters: { type: "object", properties: {}, additionalProperties: false },
	async execute(state, params, delivery) {
		return workflowToolResult(await state.operations.approve(delivery.sessionId, params, delivery.signal, delivery.confirm));
	},
}];
