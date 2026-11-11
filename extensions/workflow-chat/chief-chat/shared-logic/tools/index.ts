import type { ToolDeclaration } from "../../../../../framework/interface/tool";
import type { WorkflowRequests } from "../../../common/requests";
import { workflowToolResult } from "../../../common/tool-result";
import { delegate } from "../delegation";

type ChiefToolState = { readonly requests: WorkflowRequests };

export const CHIEF_TOOLS: readonly ToolDeclaration<ChiefToolState>[] = [{
	name: "chief_definitions", label: "Chief definitions",
	description: "只读查询现有 Bot.when 与能力定义；不派发、不创建、不授予 chief 身份。",
	parameters: { type: "object", properties: {
		kind: { type: "string", enum: ["bots", "tasks", "maps", "zones"], description: "bots 优先按 when 寻找能力；tasks/maps 核对执行目标，zones 读取显式位置。" },
		id: { type: "string", description: "仅 tasks/maps 可选：Task ID 或 Map 文件名；省略时列出目录。不接受 endpoint、目录路径或会话身份。" },
	}, required: ["kind"], additionalProperties: false },
	async execute(state, params, delivery) {
		const invalid = () => workflowToolResult({ isError: true, body: { code: "invalid-parameters", message: "需要 kind=bots/tasks/maps/zones；仅 tasks/maps 可提供非空字符串 id，不接受额外字段。" } });
		if (!params || typeof params !== "object" || Array.isArray(params)) return invalid();
		const values = params as Record<string, unknown>;
		if (Object.keys(values).some(key => key !== "kind" && key !== "id")) return invalid();
		const { kind, id } = values;
		let route: string;
		switch (kind) {
			case "bots": route = "/api/scheduler/bots"; break;
			case "tasks": route = "/api/tasks"; break;
			case "maps": route = "/api/scheduler/maps"; break;
			case "zones": route = "/api/zones"; break;
			default: return invalid();
		}
		if ("id" in values) {
			if ((kind !== "tasks" && kind !== "maps") || typeof id !== "string" || !id.trim()) return invalid();
			route += `/${encodeURIComponent(id)}`;
		}
		return workflowToolResult(await state.requests.get(delivery.sessionId, route, delivery.signal));
	},
}, {
	name: "chief_delegate", label: "Chief delegate",
	description: "按 Bot 委派独立 Task Chat 或真实 Map Run。先解析完整目标/位置/输入供用户原生确认，仅批准本次预览后启动；不等待业务完成，不自动重试。聊天同意不是批准。",
	parameters: { type: "object", properties: {
		botId: { type: "string", description: "已核对 when 与执行目标的 Bot ID，不是 Task ID。" },
		zoneId: { type: "string", description: "显式登记的稳定 zone ID：Task 执行目录或 Map manager 目录；不覆盖 Map 内部节点 zone。" },
		input: { type: "string", description: "本次完整业务要求，吸收用户最新修正，不是固定 Task 职能。" },
		materials: { type: "array", description: "本次必要材料；无材料传 []。Map 的 id 对应 input_files。路径相对于显式材料 zone。", items: { type: "object", properties: {
			id: { type: "string", description: "唯一材料 ID。" }, zoneId: { type: "string", description: "材料所属登记 zone ID。" }, path: { type: "string", description: "该 zone 中的文件路径。" },
		}, required: ["id", "zoneId", "path"], additionalProperties: false } },
		managerTaskId: { type: "string", description: "Map 型 Bot 必填：明确选择 manager 类型 Task；Task 型 Bot 禁止此参数。" },
	}, required: ["botId", "zoneId", "input", "materials"], additionalProperties: false },
	execute: (state, params, delivery) => delegate(state.requests, params, delivery),
}];
