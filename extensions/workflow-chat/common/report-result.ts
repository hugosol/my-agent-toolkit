import type { WorkflowResponse } from "./requests";

/** Save and notification are separate facts; a missing receipt never proves no effect. */
export function workflowReportResult(result: WorkflowResponse): WorkflowResponse {
	const body = result.body;
	if (body && typeof body === "object" && !Array.isArray(body)) {
		if (result.notSent) return { ...result, body: { ...body, saved: false } };
		if ("saved" in body && typeof body.saved === "boolean") return { ...result, isError: result.isError || !body.saved };
	}
	if (result.isError) return result;
	return { ...result, isError: true, body: {
		error: { kind: "protocol", message: "后端报告响应缺少 boolean saved，无法核实保存结果。", response: body },
		guidance: "报告结果不确定；后端可能已保存，不表示未发送、未发生或已回滚。不要自动重试，请核实已保存事实。",
	} };
}
