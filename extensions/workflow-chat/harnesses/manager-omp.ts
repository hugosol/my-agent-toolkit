import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ompAdapter, type OmpExtensionApi, type OmpSessionContext } from "../../../adapters/omp";
import { defineImplementation } from "../../../framework/interface";
import { WorkflowRequests } from "../common/requests";
import { MANAGER_CHAT } from "../manager-definition";

interface ManagerToolApi extends OmpExtensionApi {
	readonly typebox: { readonly Type: {
		String(): unknown;
		Array(items: unknown): unknown;
		Boolean(): unknown;
		Literal(value: string): unknown;
		Union(members: unknown[]): unknown;
		Object(properties: Readonly<Record<string, unknown>>, options: { additionalProperties: boolean }): unknown;
	} };
	registerTool(tool: {
		name: string; label: string; description: string; parameters: unknown; loadMode: "essential";
		execute(callId: string, params: unknown, signal: AbortSignal | undefined, onUpdate: unknown, ctx: OmpSessionContext): Promise<{
			content: { type: "text"; text: string }[];
			details: { httpStatus?: number; body: unknown };
			isError: boolean;
		}>;
	}): void;
}

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export default function managerChatOmp(api: OmpExtensionApi) {
	let requests: WorkflowRequests | undefined;
	const binding = ompAdapter(MANAGER_CHAT, {
		configBaseDir: repository,
		startupPolicy: "entrypoints/startup/auto.yaml",
		implementation: defineImplementation({
			create: context => (requests = new WorkflowRequests(context)),
			subscriptions: [{ scope: "session", events: {
				session_start: (state, delivery) => state.start(delivery.session.sessionId),
				session_end: (state, delivery) => state.end(delivery.session.sessionId),
			} }],
			cleanup: state => state.close(),
		}),
	})(api);
	if (!binding.bound) return binding;
	const native = api as ManagerToolApi;
	const Type = native.typebox.Type;
	native.registerTool({
		name: "run", label: "Run", loadMode: "essential",
		description: "显式查询与推进当前管理者 Run；仅后端决定运行事实，不附加自动流转。",
		// OMP repairs closed schemas by deleting extra keys before execute. Preserve them
		// here so our strict per-action guard can reject the entire invalid call instead.
		parameters: Type.Union([
			...["recover", "retry"].map(action => Type.Object({ action: Type.Literal(action), nodeId: Type.String(), confirmed: Type.Boolean(), reason: Type.String() }, { additionalProperties: true })),
			Type.Object({ action: Type.Literal("dispatch"), nodes: Type.Array(Type.String()) }, { additionalProperties: true }),
			Type.Object({ action: Type.Literal("reconcile_dispatch"), nodeId: Type.String(), finding: Type.Union(["uncertain", "not_created", "created"].map(value => Type.Literal(value))), reason: Type.String() }, { additionalProperties: true }),
			...["status", "pause", "resume", "finish"].map(action => Type.Object({ action: Type.Literal(action) }, { additionalProperties: true })),
			...["complete", "fail"].map(action => Type.Object({ action: Type.Literal(action), nodeId: Type.String(), reason: Type.String() }, { additionalProperties: true })),
		]),
		async execute(_callId, params, signal, _onUpdate, ctx) {
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
				return { content: [{ type: "text", text: JSON.stringify({ error: { kind: "parameters", message: "run 参数不符合所选 action；不接受身份或不适用字段。" } }) }], details: { body: null }, isError: true };
			}
			if (!requests) throw new Error("manager-chat 未初始化");
			const body = dispatch ? { nodes: input.nodes } : reconcile ? { nodeId: input.nodeId, finding: input.finding, reason: input.reason } : confirmation ? { nodeId: input.nodeId, confirmed: input.confirmed, reason: input.reason } : nodeAction ? { nodeId: input.nodeId, reason: input.reason } : {};
			const result = await requests.post(ctx.sessionManager.getSessionId(), `/api/workflow/manager/${input.action}`, body, signal);
			return { content: [{ type: "text", text: JSON.stringify(result.body) }], details: { httpStatus: result.httpStatus, body: result.body }, isError: result.isError };
		},
	});
	return binding;
}
