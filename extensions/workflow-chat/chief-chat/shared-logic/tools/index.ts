import type { ToolDeclaration } from "../../../../../framework/interface/tool";
import type { WorkflowRequests } from "../../../common/requests";
import { workflowToolResult } from "../../../common/tool-result";
import { delegate } from "../delegation";

type ChiefToolState = { readonly requests: WorkflowRequests };

export const CHIEF_TOOLS: readonly ToolDeclaration<ChiefToolState>[] = [{
	name: "chief_definitions", label: "Chief definitions",
	description: "只读查询 Bot 能力目录、Task/Map 定义及已登记 zone。",
	parameters: { type: "object", properties: {
		kind: { type: "string", enum: ["bots", "tasks", "maps", "zones"], description: "bots 查询能力；tasks/maps 核对实际目标；zones 查询执行位置。" },
		id: { type: "string", description: "Task ID 或包含 .json 的完整 Map 文件名；省略时列目录。" },
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
	name: "chief_read_report", label: "Read chief report",
	description: "按报告 ID 读取完整已保存结果和结构化成果地址；读取不代表用户验收。",
	parameters: { type: "object", properties: {
		id: { type: "string", description: "已保存报告的身份。" },
	}, required: ["id"], additionalProperties: false },
	async execute(state, params, delivery) {
		if (!params || typeof params !== "object" || Array.isArray(params)
			|| Object.keys(params).some(key => key !== "id") || !("id" in params)
			|| typeof params.id !== "string" || !params.id.trim()) {
			return workflowToolResult({ isError: true, body: { code: "invalid-parameters", message: "只接受非空字符串 id。" } });
		}
		return workflowToolResult(await state.requests.post(delivery.sessionId, `/api/chief/reports/${encodeURIComponent(params.id)}/view`, {}, delivery.signal));
	},
}, {
	name: "chief_delegate", label: "Chief delegate",
	description: "按 Bot 委派 Task 或 Map，经原生预览与确认后启动；返回启动结果，不等待业务完成。",
	parameters: { type: "object", properties: {
		botId: { type: "string", description: "实际 Bot ID，不是 Task ID 或 Map 文件名。" },
		zoneId: { type: "string", description: "Task 或 Map 管理者的执行位置，不覆盖子图内部节点。" },
		input: { type: "string", description: "本次完整业务要求，吸收用户最新修正，不是固定 Task 职能。" },
		materials: { type: "array", description: "本次材料；无材料时传空数组。Map 输入 ID 对应 map_input_rule.files；路径相对于显式材料 zone。", items: { type: "object", properties: {
			id: { type: "string", description: "唯一材料 ID。" }, zoneId: { type: "string", description: "材料所属登记 zone ID。" }, path: { type: "string", description: "该 zone 中的文件路径。" },
		}, required: ["id", "zoneId", "path"], additionalProperties: false } },
		managerTaskId: { type: "string", description: "Map 型调用的管理者 Task；Task 型调用不使用。" },
		output_rule: { type: "array", description: "本次委派要求的文件 ID，不是 Bot 的文字输出摘要。Map 只能选取公开输出 ID；省略表示不要求文件。", items: { type: "object", properties: {
			id: { type: "string", description: "本次要求的输出 ID。" },
		}, required: ["id"], additionalProperties: false } },
	}, required: ["botId", "zoneId", "input", "materials"], additionalProperties: false },
	execute: (state, params, delivery) => delegate(state.requests, params, delivery),
}];
