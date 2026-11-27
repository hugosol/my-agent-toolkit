import type { ToolDeclaration, ToolParameterSchema } from "../../../../../framework/interface/tool";
import { workflowToolResult } from "../../../common/tool-result";
import type { ManagerActions } from "../actions";
import { displayScriptOutput } from "../script-output";

type ManagerToolState = { readonly operations: ManagerActions };

const string: ToolParameterSchema = { type: "string" };
const confirmed: ToolParameterSchema = { type: "boolean", description: "人工确认所选恢复动作。" };
const nodes: ToolParameterSchema = { type: "array", items: { type: "string" }, description: "本次显式选择派发的节点 ID。" };

export const MANAGER_TOOLS: readonly ToolDeclaration<ManagerToolState>[] = [
	{
		name: "run", label: "Run",
		description: "查询或显式推进当前管理的 Run；实际动作资格以返回结果为准。",
		parameters: { anyOf: [
			{
				type: "object", properties: {
					action: { type: "string", enum: ["prepare_inputs"] },
					fileInputs: { type: "array", description: "整批替换 Run 文件绑定，不是追加；遗漏旧 ID 会删除其绑定，空数组清空。", items: {
						type: "object", properties: { id: string, path: string }, required: ["id", "path"], additionalProperties: false,
					} },
					confirmed: { type: "boolean", description: "管理者确认输入已满足本次要求；false 仅保存待补齐绑定。" },
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
				type: "object", properties: {
					action: { type: "string", enum: ["finish"] },
					map_output: {
						type: "object", description: "结束 Run 时提交的公开文件成果。",
						properties: { files: {
							type: "array", items: {
								type: "object", properties: {
									id: { type: "string", description: "本次声明的输出 ID。" },
									path: { type: "string", description: "实际成果文件的绝对地址。" },
								}, required: ["id", "path"], additionalProperties: false,
							},
						} }, required: ["files"], additionalProperties: false,
					},
				},
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
		description: "等待或取得运行现场与待处理报告标识；不返回报告正文。直接调用，不经 codemode/eval 包装。",
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
