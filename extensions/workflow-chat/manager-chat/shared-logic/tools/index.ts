import type { ToolDeclaration, ToolParameterSchema } from "../../../../../framework/interface/tool";
import { workflowToolResult } from "../../../common/tool-result";
import type { ManagerActions } from "../actions";
import { displayScriptOutput } from "../script-output";

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
				type: "object", properties: {
					action: { type: "string", enum: ["prepare_inputs"] },
					fileInputs: { type: "array", description: "完整替换 Run 文件绑定；省略旧 ID 会删除其绑定，[] 清空。", items: {
						type: "object", properties: { id: string, path: string }, required: ["id", "path"], additionalProperties: false,
					} },
					confirmed: { type: "boolean", description: "true 表示已按 Map input_requirements 审阅全部输入；false 仅保存待补齐绑定，禁止派发。" },
					reason: string,
				},
				required: ["action", "fileInputs", "confirmed", "reason"], additionalProperties: false,
			},
			{
				type: "object", properties: { action: { type: "string", enum: ["recover"] }, nodeId: string, confirmed, reason: string },
				required: ["action", "nodeId", "confirmed", "reason"], additionalProperties: false,
			},
			{
				type: "object", properties: { action: { type: "string", enum: ["retry"] }, nodeId: string, confirmed, reason: string, zoneId: { type: "string", description: "动态 zone 节点每次重试必须重新指定已登记的 zone ID；固定 zone 节点不得提供。" } },
				required: ["action", "nodeId", "confirmed", "reason"], additionalProperties: false,
			},
			{
				type: "object", properties: { action: { type: "string", enum: ["dispatch"] }, nodes, zoneIds: { type: "object", properties: {}, additionalProperties: true, description: "动态节点 ID → 本次已登记 zone ID；每次派发显式提供，不填固定或未选节点。根据上游 report 决定，不自动继承。" } },
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
		description: "直接调用，勿从 codemode/eval 包装；等待或立即收取后端原因、快照与报告标识待办。脚本日志仅在用户可见的工具行中显示；不含报告正文，不清除交接待办。",
		directOnly: true,
		displayOutput: displayScriptOutput,
		parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
		async execute(state, params, delivery) {
			const collected = await state.operations.collect(delivery.sessionId, params, delivery.signal,
				scriptOutput => delivery.onUpdate?.({ scriptOutput }));
			const result = workflowToolResult(collected);
			return collected.scriptOutput ? { ...result, details: { httpStatus: collected.httpStatus, body: collected.body, scriptOutput: collected.scriptOutput } } : result;
		},
	},
];
