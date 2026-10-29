import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ompAdapter, type OmpExtensionApi, type OmpSessionContext } from "../../../../adapters/omp";
import { defineImplementation } from "../../../../framework/interface";
import { WorkflowRequests } from "../../common/requests";
import { MANAGER_CHAT } from "../definition";
import { ManagerActions } from "../shared-logic/actions";

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

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

export default function managerChatOmp(api: OmpExtensionApi) {
	let operations: ManagerActions | undefined;
	const binding = ompAdapter(MANAGER_CHAT, {
		configBaseDir: repository,
		startupPolicy: "entrypoints/startup/auto.yaml",
		implementation: defineImplementation({
			create: context => {
				const requests = new WorkflowRequests(context);
				operations = new ManagerActions(requests);
				return requests;
			},
			subscriptions: [{ scope: "owner", events: {
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
			if (!operations) throw new Error("manager-chat 未初始化");
			const result = await operations.run(ctx.sessionManager.getSessionId(), params, signal);
			return { content: [{ type: "text", text: result.message ?? JSON.stringify(result.body) }], details: { httpStatus: result.httpStatus, body: result.body }, isError: result.isError };
		},
	});
	native.registerTool({
		name: "collect", label: "Collect", loadMode: "essential",
		description: "等待或立即收取后端原因、快照与报告标识待办；不含报告正文，不清除交接待办。",
		parameters: Type.Object({}, { additionalProperties: true }),
		async execute(_callId, params, signal, _onUpdate, ctx) {
			if (!operations) throw new Error("manager-chat 未初始化");
			const result = await operations.collect(ctx.sessionManager.getSessionId(), params, signal);
			return { content: [{ type: "text", text: result.message ?? JSON.stringify(result.body) }], details: { httpStatus: result.httpStatus, body: result.body }, isError: result.isError };
		},
	});
	return binding;
}
