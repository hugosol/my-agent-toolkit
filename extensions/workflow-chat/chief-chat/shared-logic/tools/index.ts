import type { ToolDeclaration } from "../../../../../framework/interface/tool";
import type { WorkflowRequests } from "../../../common/requests";
import { workflowToolResult } from "../../../common/tool-result";

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
}];
