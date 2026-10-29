import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Type } from "@earendil-works/pi-ai";
import { piAdapter, type PiExtensionApi } from "../../../../adapters/pi";
import { defineImplementation } from "../../../../framework/interface";
import { WorkflowRequests } from "../../common/requests";
import { toolResult, type WorkflowPiApi } from "../../harnesses/pi-tools";
import { MANAGER_CHAT } from "../definition";
import { ManagerActions } from "../shared-logic/actions";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

export default function managerChatPi(api: PiExtensionApi) {
	let operations: ManagerActions | undefined;
	const binding = piAdapter(MANAGER_CHAT, {
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
	const native = api as WorkflowPiApi;
	// Pi 1.4 coerces typed values before execute. Keep raw values and extra keys so
	// shared action guards, not lossy native repair, decide whether a request is valid.
	const string = () => Type.Any({ description: "必须是字符串；不进行类型转换。" });
	native.registerTool({
		name: "run", label: "Run",
		description: "显式查询与推进当前管理者 Run；仅后端决定运行事实，不附加自动流转。",
		parameters: Type.Union([
			...["recover", "retry"].map(action => Type.Object({ action: Type.Literal(action), nodeId: string(), confirmed: Type.Any({ description: "必须是 boolean；不接受字符串或数字。" }), reason: string() }, { additionalProperties: true })),
			Type.Object({ action: Type.Literal("dispatch"), nodes: Type.Any({ description: "必须是字符串数组。" }) }, { additionalProperties: true }),
			Type.Object({ action: Type.Literal("reconcile_dispatch"), nodeId: string(), finding: Type.Union(["uncertain", "not_created", "created"].map(value => Type.Literal(value))), reason: string() }, { additionalProperties: true }),
			...["status", "pause", "resume", "finish"].map(action => Type.Object({ action: Type.Literal(action) }, { additionalProperties: true })),
			...["complete", "fail"].map(action => Type.Object({ action: Type.Literal(action), nodeId: string(), reason: string() }, { additionalProperties: true })),
		]),
		async execute(_callId, params, signal, _onUpdate, ctx) {
			if (!operations) throw new Error("manager-chat 未初始化");
			return toolResult(await operations.run(ctx.sessionManager.getSessionId(), params, signal));
		},
	});
	native.registerTool({
		name: "collect", label: "Collect",
		description: "等待或立即收取后端原因、快照与报告标识待办；不含报告正文，不清除交接待办。",
		parameters: Type.Object({}, { additionalProperties: true }),
		async execute(_callId, params, signal, _onUpdate, ctx) {
			if (!operations) throw new Error("manager-chat 未初始化");
			return toolResult(await operations.collect(ctx.sessionManager.getSessionId(), params, signal));
		},
	});
	return binding;
}
