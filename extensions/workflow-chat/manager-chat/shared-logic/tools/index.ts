import type { ToolDeclaration, ToolParameterSchema } from "../../../../../framework/interface/tool";
import { workflowToolResult } from "../../../common/tool-result";
import type { ManagerActions } from "../actions";

type ManagerToolState = { readonly operations: ManagerActions };

const string: ToolParameterSchema = { type: "string", description: "必须是字符串；不进行类型转换。" };
const confirmed: ToolParameterSchema = { type: "boolean", description: "必须是 boolean；不接受字符串或数字。" };
const nodes: ToolParameterSchema = { type: "array", items: { type: "string" }, description: "必须是字符串数组。" };

export const MANAGER_TOOLS: readonly ToolDeclaration<ManagerToolState>[] = [
	{
		name: "run", label: "Run",
		description: "显式查询与推进当前管理者 Run；仅后端决定运行事实，不附加自动流转。",
		parameters: { anyOf: [
			{
				type: "object", properties: { action: { type: "string", enum: ["recover"] }, nodeId: string, confirmed, reason: string },
				required: ["action", "nodeId", "confirmed", "reason"], additionalProperties: false,
			},
			{
				type: "object", properties: { action: { type: "string", enum: ["retry"] }, nodeId: string, confirmed, reason: string },
				required: ["action", "nodeId", "confirmed", "reason"], additionalProperties: false,
			},
			{
				type: "object", properties: { action: { type: "string", enum: ["dispatch"] }, nodes },
				required: ["action", "nodes"], additionalProperties: false,
			},
			{
				type: "object", properties: {
					action: { type: "string", enum: ["reconcile_dispatch"] }, nodeId: string,
					finding: { type: "string", enum: ["uncertain", "not_created", "created"] }, reason: string,
				},
				required: ["action", "nodeId", "finding", "reason"], additionalProperties: false,
			},
			{
				type: "object", properties: { action: { type: "string", enum: ["status"] } },
				required: ["action"], additionalProperties: false,
			},
			{
				type: "object", properties: { action: { type: "string", enum: ["pause"] } },
				required: ["action"], additionalProperties: false,
			},
			{
				type: "object", properties: { action: { type: "string", enum: ["resume"] } },
				required: ["action"], additionalProperties: false,
			},
			{
				type: "object", properties: { action: { type: "string", enum: ["finish"] } },
				required: ["action"], additionalProperties: false,
			},
			{
				type: "object", properties: { action: { type: "string", enum: ["complete"] }, nodeId: string, reason: string },
				required: ["action", "nodeId", "reason"], additionalProperties: false,
			},
			{
				type: "object", properties: { action: { type: "string", enum: ["fail"] }, nodeId: string, reason: string },
				required: ["action", "nodeId", "reason"], additionalProperties: false,
			},
		] },
		async execute(state, params, delivery) {
			return workflowToolResult(await state.operations.run(delivery.sessionId, params, delivery.signal));
		},
	},
	{
		name: "collect", label: "Collect",
		description: "等待或立即收取后端原因、快照与报告标识待办；不含报告正文，不清除交接待办。",
		parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
		async execute(state, params, delivery) {
			return workflowToolResult(await state.operations.collect(delivery.sessionId, params, delivery.signal));
		},
	},
];
