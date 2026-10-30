import { WorkflowRequests, type WorkflowResponse } from "../../common/requests";

type ActionResult = WorkflowResponse & { readonly message?: string };

/** Manager protocol and parameter rules, independent of the tool's harness. */
export class ManagerActions {
	constructor(private readonly requests: WorkflowRequests) {}

	async run(sessionId: string, params: unknown, signal?: AbortSignal): Promise<ActionResult> {
		const input = params as Record<string, unknown> | null;
		const reconcile = input?.action === "reconcile_dispatch";
		const confirmation = input?.action === "recover" || input?.action === "retry";
		const nodeAction = input?.action === "complete" || input?.action === "fail" || reconcile || confirmation;
		const dispatch = input?.action === "dispatch";
		const allowed = dispatch ? ["action", "nodes"] : reconcile ? ["action", "nodeId", "finding", "reason"] : confirmation ? ["action", "nodeId", "confirmed", "reason"] : nodeAction ? ["action", "nodeId", "reason"] : ["action"];
		if (!input || typeof input !== "object" || (!dispatch && !nodeAction && input.action !== "status" && input.action !== "pause" && input.action !== "resume" && input.action !== "finish") ||
			Object.keys(input).some(key => !allowed.includes(key)) ||
			(confirmation && typeof input.confirmed !== "boolean") ||
			(reconcile && input.finding !== "uncertain" && input.finding !== "not_created" && input.finding !== "created") ||
			(dispatch && (!Array.isArray(input.nodes) || input.nodes.some(node => typeof node !== "string"))) ||
			(nodeAction && (typeof input.nodeId !== "string" || typeof input.reason !== "string"))) {
			return { body: null, message: JSON.stringify({ error: { kind: "parameters", message: "run 参数不符合所选 action；不接受身份或不适用字段。" } }), isError: true };
		}
		const body = dispatch ? { nodes: input.nodes } : reconcile ? { nodeId: input.nodeId, finding: input.finding, reason: input.reason } : confirmation ? { nodeId: input.nodeId, confirmed: input.confirmed, reason: input.reason } : nodeAction ? { nodeId: input.nodeId, reason: input.reason } : {};
		return this.requests.post(sessionId, "/api/workflow/manager/" + input.action, body, signal);
	}

	async collect(sessionId: string, params: unknown, signal?: AbortSignal): Promise<ActionResult> {
		if (!params || typeof params !== "object" || Array.isArray(params) || Object.keys(params).length !== 0) {
			return { body: null, message: JSON.stringify({ error: { kind: "parameters", message: "collect 不接受业务或身份字段。" } }), isError: true };
		}
		return this.requests.post(sessionId, "/api/workflow/manager/collect", {}, signal, true);
	}
}
