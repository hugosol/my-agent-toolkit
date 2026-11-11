import { isDeepStrictEqual } from "node:util";
import type { ToolExecutionDelivery } from "../../../../framework/interface/tool";
import type { WorkflowRequests, WorkflowResponse } from "../../common/requests";
import { workflowToolResult } from "../../common/tool-result";

function record(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

/** The backend owns target resolution, one-use preview identity and commit-time revalidation. */
export async function delegate(requests: WorkflowRequests, params: unknown, delivery: ToolExecutionDelivery) {
	const invalid = () => workflowToolResult({ isError: true, body: { code: "invalid-parameters", message: "需要非空 botId、zoneId、input 与 materials:[{id,zoneId,path}]；Map 还须 managerTaskId。不得提供身份、预览 ID、批准字段或额外参数。" } });
	if (!record(params) || Object.keys(params).some(key => !["botId", "zoneId", "input", "materials", "managerTaskId"].includes(key))
		|| !text(params.botId) || !text(params.zoneId) || !text(params.input) || !Array.isArray(params.materials)
		|| params.materials.some(material => !record(material) || Object.keys(material).some(key => !["id", "zoneId", "path"].includes(key)) || !text(material.id) || !text(material.zoneId) || !text(material.path))
		|| ("managerTaskId" in params && !text(params.managerTaskId))) return invalid();
	// Snapshot before the first await: neither caller mutation nor a second call can
	// substitute this operation's inputs while its resolved preview awaits approval.
	const input: Record<string, unknown> = JSON.parse(JSON.stringify(params));
	const preview = await requests.post(delivery.sessionId, "/api/chief/delegations/preview", input, delivery.signal);
	if (preview.isError) return workflowToolResult(preview);
	const body = preview.body;
	if (!record(body) || !text(body.previewId) || !record(body.facts)
		|| !isDeepStrictEqual(body.facts.request, { ...input, sessionId: delivery.sessionId })
		|| !record(body.facts.bot) || !record(body.facts.task) || !text(body.facts.cwd) || !text(body.facts.name)
		|| !Array.isArray(body.facts.materials) || !text(body.facts.prompt)
		|| ("managerTaskId" in input && !record(body.facts.map))) {
		return workflowToolResult({ isError: true, body: { error: { kind: "protocol", message: "后端未返回与本次真实 Session 和业务参数一致的完整委派预览；未请求批准或启动。" }, response: preview.body } });
	}
	const result: WorkflowResponse = await requests.postConfirmed(delivery.sessionId, "/api/chief/delegations", { previewId: body.previewId }, {
		title: "确认 Bot 委派启动",
		message: `请核对本次完整解析事实（Bot、Task/Map、manager、zone 绑定、材料、实际输入）：\n${JSON.stringify(body.facts, null, 2)}\n\n批准仅授权此预览的一次启动，不表示业务完成。目标或位置含义变化时后端拒绝，需用户重新要求后再次预览与确认。聊天中的同意不能替代本次原生批准。`,
	}, delivery.signal, delivery.confirm);
	if (!result.isError && !result.notSent && (!record(result.body) || !text(result.body.id)
		|| ("managerTaskId" in input ? result.httpStatus !== 201 || !record(result.body.run) : result.httpStatus !== 202 || !text(result.body.stage)))) {
		return workflowToolResult({ isError: true, httpStatus: result.httpStatus, body: {
			error: { kind: "protocol", message: "后端成功响应缺少可核实的启动回执，结果不确定。" }, response: result.body,
			guidance: "可能已经启动；不表示未发送或回滚，不自动重试。请先核实已有 Chat/Run。",
		} });
	}
	return workflowToolResult({ ...result, message: `${JSON.stringify(result.body)}\n这里只返回启动请求结果，不表示业务完成；不等待执行者完成。拒绝或不确定结果不自动重试，不通过其他 HTTP/本机工具绕过确认。` });
}
