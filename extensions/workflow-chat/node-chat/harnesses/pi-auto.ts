import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Type } from "@earendil-works/pi-ai";
import { piAdapter, type PiExtensionApi } from "../../../../adapters/pi";
import { defineImplementation } from "../../../../framework/interface";
import { WorkflowRequests } from "../../common/requests";
import { toolResult, type WorkflowPiApi } from "../../harnesses/pi-tools";
import { NODE_CHAT } from "../definition";
import { NodeReports } from "../shared-logic/report";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

export default function nodeChatPi(api: PiExtensionApi) {
	let operations: NodeReports | undefined;
	const binding = piAdapter(NODE_CHAT, {
		configBaseDir: repository,
		startupPolicy: "entrypoints/startup/auto.yaml",
		implementation: defineImplementation({
			create: context => {
				const requests = new WorkflowRequests(context);
				operations = new NodeReports(requests);
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
	(api as WorkflowPiApi).registerTool({
		name: "report", label: "Report",
		description: "提交节点可交接结果正文；分别返回保存、辅助通知和诊断结果。报告不等于节点完成。",
		// Preserve extra identity fields and non-string input through native validation.
		// NodeReports rejects them before any HTTP request instead of Pi repairing them.
		parameters: Type.Object({ body: Type.Any({ description: "必须是报告正文字符串；不进行类型转换。" }) }, { additionalProperties: true }),
		async execute(_callId, params, signal, _onUpdate, ctx) {
			if (!operations) throw new Error("node-chat 未初始化");
			return toolResult(await operations.report(ctx.sessionManager.getSessionId(), params, signal));
		},
	});
	return binding;
}
